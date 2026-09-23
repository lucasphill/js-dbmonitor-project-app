const { downsample } = require("./downsample.cjs");

function series(rows, column, cumulative, maxGapMs) {
  let previous = null;
  let segment = 0;
  return downsample(rows.map((row) => {
    const current = row[column] == null ? null : Number(row[column]);
    const time = Date.parse(row.finished_at);
    let value = current;
    if (cumulative) {
      const valid = previous && current != null && previous.value != null &&
        time > previous.time && time - previous.time <= maxGapMs && current >= previous.value;
      if (!valid) { value = null; if (previous) segment += 1; }
      else value = current - previous.value;
    }
    previous = { time, value: current };
    return { at: row.finished_at, value: Number.isFinite(value) ? value : null, segment };
  }));
}

function block(points, source, unit, available = true, reason) {
  const hasValue = points.some((point) => point.value !== null);
  return { state: !available ? "unavailable" : hasValue ? "ready" : "insufficient",
    source, unit, ...(reason ? { reason } : {}), data: points,
    ...(points.length ? { updatedAt: points.at(-1).at } : {}) };
}

function buildPerformance({ history, sessions, aggregates, capabilities, maxGapMs }) {
  const rows = history.instance || [];
  const wal = series(rows, "wal_bytes", true, maxGapMs);
  const io = series(rows, "io_reads", true, maxGapMs);
  const duration = series(rows, "duration_ms", false, maxGapMs);
  return {
    activeQueries: { state: "ready", source: "pg_stat_activity", updatedAt: sessions.updatedAt,
      data: { rows: sessions.rows, total: sessions.total, nextCursor: sessions.nextCursor } },
    queryAggregates: { state: !aggregates.available ? "unavailable" : aggregates.total ? "ready" : "empty",
      source: "pg_stat_statements", updatedAt: aggregates.updatedAt,
      reason: aggregates.reason,
      data: { rows: aggregates.rows, total: aggregates.total, nextCursor: aggregates.nextCursor } },
    walSeries: block(wal, "pg_stat_wal + SQLite", "bytes/coleta", capabilities.wal?.available,
      capabilities.wal?.reason),
    ioSeries: block(io, "pg_stat_io + SQLite", "operações/coleta", capabilities.io?.available,
      capabilities.io?.reason),
    collectionDurationSeries: block(duration, "Coletor local + SQLite", "ms"),
  };
}

module.exports = { buildPerformance, series };
