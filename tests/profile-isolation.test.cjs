const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage } = require("../electron/storage.cjs");
const { buildOverview } = require("../electron/overview.cjs");
const { analyzeDatabases } = require("../electron/analytics.cjs");
const { writeCsv, COLUMNS } = require("../electron/export.cjs");

function snapshot(database, connections, at) {
  return {
    startedAt: at, finishedAt: at, result: "success",
    instance: { database, version: "16", maxConnections: 100 },
    capabilities: { statements: { available: false } },
    metrics: { connections },
    databases: [{ oid: 1, name: database, connections, commits: 10,
      rollbacks: 0, blocksRead: 1, cacheHits: 9 }],
  };
}

test("overview and CSV export use only the selected profile's samples", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bdash-profile-isolation-"));
  const storage = openStorage(root);
  try {
    const second = storage.createProfile({ label: "Remoto", host: "remote.sa-east-1.rds.amazonaws.com",
      port: 5432, database: "remote_db", dbUser: "observer", authMode: "rds_iam",
      awsRegion: "sa-east-1", awsProfile: null, tlsCaMode: "bundled", tlsCaPath: null });
    const at = "2026-09-23T12:00:00.000Z";
    const period = { from: "2026-09-23T11:00:00.000Z", to: "2026-09-23T13:00:00.000Z" };
    storage.recordCycle(1, snapshot("local_db", 3, at));
    storage.recordCycle(second.id, snapshot("remote_db", 99, at));
    const collector = { getLastUsable: () => null, getStatus: () => ({ intervalSeconds: 15 }),
      getLogStatus: () => ({ state: "unavailable" }) };
    const local = buildOverview({ collector, storage, profile: storage.getProfile(1), period,
      queryLatency: { available: false } });
    const remote = buildOverview({ collector, storage, profile: second, period,
      queryLatency: { available: false } });
    assert.equal(local.metrics.data[0].value, 3);
    assert.equal(remote.metrics.data[0].value, 99);
    assert.deepEqual(local.databases.data.map((row) => row.name), ["local_db"]);
    assert.deepEqual(remote.databases.data.map((row) => row.name), ["remote_db"]);
    const localRows = analyzeDatabases(storage.getSamples(1, period).databases).ranking;
    const csv = path.join(root, "local.csv");
    await writeCsv(csv, localRows, COLUMNS["database-activity"]);
    const exported = fs.readFileSync(csv, "utf8");
    assert.match(exported, /local_db/);
    assert.doesNotMatch(exported, /remote_db/);
  } finally {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
