"use strict";

const { downsample } = require("./downsample.cjs");

const DEFAULT_MAX_GAP_MS = 45_000;

function timestamp(value) {
  const time = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(time)) throw new TypeError("Invalid sample time");
  return time;
}

function counter(value) {
  if (value == null) return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 && Number.isSafeInteger(result) ? result : null;
}

function normalizedDatabase(row) {
  const oid = counter(row.database_oid ?? row.oid);
  if (oid === null) throw new TypeError("Invalid database OID");
  return {
    oid, cycleId: counter(row.cycle_id ?? row.cycleId),
    at: row.collected_at ?? row.collectedAt,
    time: timestamp(row.collected_at ?? row.collectedAt),
    name: String(row.name ?? ""),
    connections: counter(row.connections),
    commits: counter(row.commits),
    rollbacks: counter(row.rollbacks),
    blocksRead: counter(row.blocks_read ?? row.blocksRead),
    cacheHits: counter(row.cache_hits ?? row.cacheHits),
    statsReset: row.stats_reset ?? row.statsReset ?? null,
  };
}

function checkedOptions(options = {}) {
  const maxGapMs = options.maxGapMs ?? DEFAULT_MAX_GAP_MS;
  if (!Number.isFinite(maxGapMs) || maxGapMs <= 0) throw new RangeError("Invalid collection gap");
  const limit = options.limit ?? options.page?.limit ?? 50;
  const offset = options.offset ?? Number(options.page?.cursor ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 ||
      !Number.isSafeInteger(offset) || offset < 0) throw new RangeError("Invalid page");
  return { maxGapMs, limit, offset };
}

function metricDelta(current, previous) {
  return current === null || previous === null || current < previous ? null : current - previous;
}

/**
 * Aggregates only adjacent valid samples within a continuous segment.
 * Identity is the database OID, never its (mutable) name. A long gap, reset,
 * or falling counter creates a null point and new baseline.
 */
function analyzeDatabases(databaseRows, options = {}) {
  const { maxGapMs } = checkedOptions(options);
  const ordered = databaseRows.map(normalizedDatabase)
    .sort((a, b) => a.time - b.time || (a.cycleId ?? 0) - (b.cycleId ?? 0) || a.oid - b.oid);
  const byOid = new Map();
  const cycles = new Map();
  let segment = 0;
  for (const row of ordered) {
    let current = byOid.get(row.oid);
    if (!current) {
      current = {
        oid: row.oid, name: row.name, connections: row.connections,
        commits: row.commits, rollbacks: row.rollbacks, blocksRead: row.blocksRead,
        cacheHits: row.cacheHits, statsReset: row.statsReset,
        transactionsInPeriod: null, readsInPeriod: null, cacheHitsInPeriod: null,
        hasTransactions: false, hasReads: false, hasCacheHits: false, prior: null,
      };
      byOid.set(row.oid, current);
    }
    const key = row.cycleId === null ? `${row.time}` : `${row.cycleId}`;
    let cycle = cycles.get(key);
    if (!cycle) {
      cycle = { at: new Date(row.time).toISOString(), time: row.time, connections: 0,
        transactionDelta: 0, readDelta: 0, cacheDelta: 0,
        hasTransaction: false, hasRead: false, hasCache: false, gap: false, segment };
      cycles.set(key, cycle);
    }
    cycle.connections += row.connections ?? 0;
    const previous = current.prior;
    const continuous = previous && row.time > previous.time && row.time - previous.time <= maxGapMs &&
      row.statsReset === previous.statsReset &&
      (row.commits === null || previous.commits === null || row.commits >= previous.commits) &&
      (row.rollbacks === null || previous.rollbacks === null || row.rollbacks >= previous.rollbacks) &&
      (row.blocksRead === null || previous.blocksRead === null || row.blocksRead >= previous.blocksRead) &&
      (row.cacheHits === null || previous.cacheHits === null || row.cacheHits >= previous.cacheHits);
    if (!continuous) {
      cycle.gap = true;
      if (previous) segment += 1;
    } else {
      const commits = metricDelta(row.commits, previous.commits);
      const rollbacks = metricDelta(row.rollbacks, previous.rollbacks);
      const transactions = commits === null || rollbacks === null ? null : commits + rollbacks;
      const reads = metricDelta(row.blocksRead, previous.blocksRead);
      const cache = metricDelta(row.cacheHits, previous.cacheHits);
      if (transactions !== null) {
        current.transactionsInPeriod = (current.transactionsInPeriod ?? 0) + transactions;
        current.hasTransactions = true;
        cycle.transactionDelta += transactions;
        cycle.hasTransaction = true;
      }
      if (reads !== null) {
        current.readsInPeriod = (current.readsInPeriod ?? 0) + reads;
        current.hasReads = true;
        cycle.readDelta += reads;
        cycle.hasRead = true;
      }
      if (cache !== null) {
        current.cacheHitsInPeriod = (current.cacheHitsInPeriod ?? 0) + cache;
        current.hasCacheHits = true;
        cycle.cacheDelta += cache;
        cycle.hasCache = true;
      }
    }
    current.name = row.name;
    current.connections = row.connections;
    current.commits = row.commits;
    current.rollbacks = row.rollbacks;
    current.blocksRead = row.blocksRead;
    current.cacheHits = row.cacheHits;
    current.statsReset = row.statsReset;
    current.prior = row;
    cycle.segment = segment;
  }
  const ranking = [...byOid.values()].map(({ prior, hasTransactions, hasReads, hasCacheHits, ...row }) => ({
    ...row,
    transactionsInPeriod: hasTransactions ? row.transactionsInPeriod : null,
    readsInPeriod: hasReads ? row.readsInPeriod : null,
    cacheHitsInPeriod: hasCacheHits ? row.cacheHitsInPeriod : null,
  })).sort((a, b) => (b.transactionsInPeriod ?? -1) - (a.transactionsInPeriod ?? -1) || a.name.localeCompare(b.name));
  return { ranking, cycles: [...cycles.values()].sort((a, b) => a.time - b.time) };
}

function rankDatabases(databaseRows, options = {}) {
  const { limit, offset, maxGapMs } = checkedOptions(options);
  const { ranking } = analyzeDatabases(databaseRows, { maxGapMs });
  return {
    rows: ranking.slice(offset, offset + limit),
    total: ranking.length,
    nextCursor: offset + limit < ranking.length ? String(offset + limit) : undefined,
  };
}

function block(state, source, data, unit, updatedAt, reason) {
  return { state, source, data, unit, ...(updatedAt ? { updatedAt } : {}), ...(reason ? { reason } : {}) };
}

/** Prepare contract-shaped database data from Storage.getSamples(period). */
function buildDatabaseActivity(history, options = {}) {
  const { maxGapMs, limit, offset } = checkedOptions(options);
  const { ranking, cycles } = analyzeDatabases(history.databases || [], { maxGapMs });
  const instanceRows = history.instance || [];
  const latest = [...instanceRows.map((row) => row.finished_at ?? row.finishedAt),
    ...cycles.map((cycle) => cycle.at)].filter(Boolean).sort().at(-1);
  const total = ranking.length;
  const paginated = { rows: ranking.slice(offset, offset + limit), total,
    nextCursor: offset + limit < total ? String(offset + limit) : undefined };
  const haveDelta = ranking.some((row) => row.transactionsInPeriod !== null);
  const state = total === 0 ? "empty" : haveDelta ? "ready" : "insufficient";
  const reason = state === "insufficient" ? "Aguardando duas coletas contínuas sem reset" : undefined;
  const points = (key, hasKey) => cycles.map((cycle) => ({
    at: cycle.at, value: cycle.gap || !cycle[hasKey] ? null : cycle[key], segment: cycle.segment,
  }));
  return {
    ranking: block(state, "pg_stat_database + histórico local", paginated, "transações no período", latest, reason),
    connectionsSeries: block(instanceRows.length ? "ready" : "insufficient", "pg_stat_activity + histórico local",
      downsample(instanceRows.map((row) => ({ at: row.finished_at ?? row.finishedAt, value: counter(row.connections) }))),
      "conexões", latest),
    transactionsSeries: block(haveDelta ? "ready" : "insufficient", "pg_stat_database + histórico local",
      downsample(points("transactionDelta", "hasTransaction")), "transações/coleta", latest, reason),
    readsSeries: block(cycles.some((cycle) => cycle.hasRead) ? "ready" : "insufficient", "pg_stat_database + histórico local",
      downsample(points("readDelta", "hasRead")), "blocos/coleta", latest),
    cacheSeries: block(cycles.some((cycle) => cycle.hasCache) ? "ready" : "insufficient", "pg_stat_database + histórico local",
      downsample(points("cacheDelta", "hasCache")), "blocos/coleta", latest),
  };
}

/** Never turn absent pg_stat_statements data into a measured zero. */
function queryLatencyBlock(capability, aggregates, updatedAt) {
  if (!capability?.available) {
    return { state: "unavailable", source: "pg_stat_statements", unit: "ms",
      reason: capability?.reason || "pg_stat_statements indisponível" };
  }
  if (!Array.isArray(aggregates) || aggregates.length === 0) {
    return { state: "insufficient", source: "pg_stat_statements", unit: "ms",
      reason: "Ainda não há amostras de duração", ...(updatedAt ? { updatedAt } : {}) };
  }
  return { state: "ready", source: "pg_stat_statements", unit: "ms", updatedAt, data: aggregates };
}

module.exports = { analyzeDatabases, rankDatabases, buildDatabaseActivity, queryLatencyBlock };
