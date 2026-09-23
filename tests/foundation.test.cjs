const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage, SCHEMA_VERSION } = require("../electron/storage.cjs");

function withStorage(run) {
  const tempRoot = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, "bdash-foundation-"));
  let storage;
  try {
    storage = openStorage(dir);
    return run(storage, dir);
  } finally {
    storage?.close();
    const relative = path.relative(tempRoot, dir);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

test("SQLite opens with WAL, migrates once and survives reopening", () => withStorage((storage, dir) => {
  assert.equal(storage.db.prepare("PRAGMA journal_mode").get().journal_mode, "wal");
  assert.equal(storage.db.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
  const collectedAt = "2026-09-23T12:00:00.000Z";
  storage.recordCycle(1, {
    startedAt: collectedAt, finishedAt: collectedAt, collectedAt,
    result: "success", instance: { host: "localhost", port: 5432, database: "postgres" },
    metrics: { connections: 2 }, capabilities: {},
    databases: [{ oid: 5, name: "postgres", connections: 2, commits: 10, rollbacks: 1, blocksRead: 2, cacheHits: 7 }],
  });
  assert.equal(storage.getLatestCycle(1).metrics.connections, 2);
  const reopened = openStorage(dir);
  try {
    assert.equal(reopened.db.prepare("PRAGMA user_version").get().user_version, SCHEMA_VERSION);
    assert.equal(reopened.getLatestCycle(1).metrics.connections, 2);
    assert.equal(reopened.getSamples(1, { from: "2026-09-23T11:00:00Z", to: "2026-09-23T13:00:00Z" }).databases.length, 1);
  } finally {
    reopened.close();
  }
}));

test("SQLite rolls back an invalid cycle", () => withStorage((storage) => {
  assert.throws(() => storage.recordCycle(1, {
    startedAt: "2026-09-23T13:00:00Z", finishedAt: "2026-09-23T12:00:00Z",
    result: "success", instance: {}, databases: [],
  }), /Cycle ends before it starts/);
  assert.equal(storage.getLatestCycle(1), null);
}));
