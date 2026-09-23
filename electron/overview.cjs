const { downsample } = require("./downsample.cjs");

function block(state, source, updatedAt, data, unit, reason) {
  const result = { state, source };
  if (updatedAt) result.updatedAt = updatedAt;
  if (data !== undefined) result.data = data;
  if (unit) result.unit = unit;
  if (reason) result.reason = reason;
  return result;
}

function transactionSeries(databaseRows, maxGapMs = 45000) {
  const previous = new Map();
  const cycles = new Map();
  for (const row of databaseRows) {
    const cycleId = Number(row.cycle_id);
    const at = row.collected_at;
    if (!cycles.has(cycleId)) cycles.set(cycleId, { at, delta: 0, hasDelta: false });
    const cycle = cycles.get(cycleId);
    const oid = Number(row.database_oid);
    const total = row.commits == null || row.rollbacks == null ? null : Number(row.commits) + Number(row.rollbacks);
    const prior = previous.get(oid);
    const reset = row.stats_reset || null;
    const continuous = prior && prior.reset === reset && total !== null && prior.total !== null &&
      Number.isFinite(total) && total >= prior.total &&
      Date.parse(at) - Date.parse(prior.at) > 0 && Date.parse(at) - Date.parse(prior.at) <= maxGapMs;
    if (continuous) {
      cycle.delta += total - prior.total;
      cycle.hasDelta = true;
    }
    previous.set(oid, { total, reset, at });
  }
  let priorAt = null;
  const points = [];
  for (const cycle of cycles.values()) {
    const minutes = priorAt ? (Date.parse(cycle.at) - Date.parse(priorAt)) / 60_000 : 0;
    points.push({ at: cycle.at, value: cycle.hasDelta && minutes > 0 ? cycle.delta / minutes : null });
    priorAt = cycle.at;
  }
  return points;
}

function buildOverview({ collector, storage, profile, period, queryLatency }) {
  const profileId = profile.id;
  const latestCycle = storage.getLatestCycle(profileId);
  const usable = collector.getLastUsable?.() || storage.getLatestSuccessfulCycle?.(profileId) || null;
  const updatedAt = usable?.collectedAt || usable?.finishedAt || null;
  const ageMs = updatedAt ? Date.now() - Date.parse(updatedAt) : Infinity;
  const stale = latestCycle?.result === "failed" || ageMs > collector.getStatus().intervalSeconds * 2000;
  const state = !usable ? "unavailable" : stale ? "stale" : usable.result === "partial" ? "partial" : "ready";
  const reason = !usable ? "Ainda não há coleta válida" : stale ? "Última coleta válida é anterior ao estado atual" : usable.error || undefined;
  const databases = usable?.databases || storage.getLatestDatabases?.(profileId, usable?.id) || [];
  const history = storage.getSamples(profileId, period);
  const connections = history.instance.map((row) => ({ at: row.finished_at, value: row.connections }));
  const transactions = transactionSeries(history.databases, collector.getStatus().intervalSeconds * 3000);
  const validRates = transactions.filter((point) => point.value !== null);
  const transactionsPerMinute = validRates.length ? validRates.at(-1).value : null;
  const connectionCount = usable?.metrics?.connections ?? databases.reduce((sum, row) => sum + (Number(row.connections) || 0), 0);
  const activeDatabases = databases.filter((row) => Number(row.connections) > 0).length;
  const metrics = [
    { label: "Conexões abertas", value: usable ? connectionCount : null, unit: "conexões" },
    { label: "Transações/min", value: transactionsPerMinute, unit: "tx/min" },
    { label: "Tempo médio de consulta", value: queryLatency?.available ? queryLatency.value : null, unit: "ms" },
    { label: "Bancos ativos", value: usable ? activeDatabases : null, unit: "bancos" },
  ];
  const capabilities = { ...(usable?.capabilities || {
    activity: { available: false, reason }, databaseStats: { available: false, reason },
    io: { available: false, reason }, wal: { available: false, reason },
    statements: { available: false, reason: "pg_stat_statements indisponível" },
    logs: { available: false, reason: "Fonte de logs não configurada" },
  }) };
  const logSource = profile.authMode === "rds_iam" ? null : storage.getPreferences?.(profileId).logSourcePath;
  const logStatus = collector.getLogStatus?.();
  capabilities.logs = logSource && (logStatus?.state === "ready" || logStatus?.state === "partial")
    ? { available: true }
    : { available: false, reason: logSource ? logStatus?.reason || "Fonte CSV indisponível" : "Fonte CSV de logs não configurada" };
  const instance = usable?.instance || {};
  return {
    instance: block(state, "PostgreSQL", updatedAt, {
      database: instance.database || profile.database,
      version: instance.version || usable?.version || null,
      serverStartedAt: instance.serverStartedAt || null,
      maxConnections: instance.maxConnections ?? null,
      connected: state === "ready" || state === "partial",
      collectionDurationMs: usable?.durationMs ?? null,
    }, undefined, reason),
    capabilities,
    metrics: block(state, "PostgreSQL + histórico local", updatedAt, metrics, undefined, reason),
    connectionsSeries: block(connections.length ? state : "insufficient", "Histórico local", updatedAt, downsample(connections), "conexões", connections.length ? reason : "Aguardando amostras"),
    transactionsSeries: block(validRates.length ? state : "insufficient", "Histórico local", updatedAt, downsample(transactions), "tx/min", validRates.length ? reason : "Aguardando duas coletas válidas"),
    databases: block(databases.length ? state : "empty", "pg_stat_database", updatedAt, databases, undefined, databases.length ? reason : "Nenhum banco visível"),
  };
}

module.exports = { buildOverview, transactionSeries };
