const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPerformance } = require("../electron/performance.cjs");

test("performance history separates read and write I/O counters", () => {
  const history = { instance: [
    { finished_at: "2026-09-28T12:00:00.000Z", io_reads: 100, io_writes: 50, wal_bytes: 0, duration_ms: 10 },
    { finished_at: "2026-09-28T12:00:10.000Z", io_reads: 107, io_writes: 53, wal_bytes: 0, duration_ms: 12 },
  ] };
  const performance = buildPerformance({
    history,
    sessions: { rows: [], total: 0, nextCursor: null, updatedAt: "2026-09-28T12:00:10.000Z" },
    aggregates: { available: true, rows: [], total: 0, nextCursor: null },
    capabilities: { io: { available: true } },
    maxGapMs: 30_000,
  });

  assert.deepEqual(performance.ioReadsSeries.data.map((point) => point.value), [null, 7]);
  assert.deepEqual(performance.ioWritesSeries.data.map((point) => point.value), [null, 3]);
  assert.equal(performance.ioReadsSeries.unit, "operações/coleta");
  assert.equal(performance.ioWritesSeries.unit, "operações/coleta");
});
