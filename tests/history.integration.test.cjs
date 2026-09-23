const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage } = require("../electron/storage.cjs");
const { toCsv, COLUMNS } = require("../electron/export.cjs");

test("retention removes expired cycles/logs and CSV neutralizes formulas", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bdash-history-"));
  let storage;
  try {
    storage = openStorage(directory);
    storage.updatePreferences(1, { metricsRetentionDays: 1, logsRetentionDays: 1 });
    const old = "2020-01-01T00:00:00Z";
    storage.recordCycle(1, { startedAt: old, finishedAt: old, result: "success",
      instance: {}, metrics: {}, databases: [] });
    storage.recordCycle(1, { startedAt: old, finishedAt: old, result: "failed", error: "PostgreSQL indisponível",
      instance: {}, metrics: {}, databases: [] });
    assert.equal(storage.getCycleDiagnostics(1).lastSuccessAt, new Date(old).toISOString());
    assert.equal(storage.getCycleDiagnostics(1).lastFailureAt, new Date(old).toISOString());
    const file = path.join(directory, "test.csv");
    storage.recordLogBatch(1, { path: file, fileIdentity: "one", offsetBytes: 20, fileSize: 20,
      events: [{ offsetBytes: 0, eventAt: old, message: "=cmd", severity: "LOG" }] });
    assert.ok(storage.getStorageBytes() > 0);
    const removed = storage.prune(1, Date.now());
    assert.equal(removed.cycles, 2);
    assert.equal(removed.logs, 1);
    assert.equal(storage.getLatestCycle(1), null);
    const csv = toCsv([{ message: "=cmd", eventAt: old }], COLUMNS.logs);
    assert.ok(csv.includes("'=cmd"));
    assert.ok(!csv.includes('"=cmd"'));
  } finally {
    storage?.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
