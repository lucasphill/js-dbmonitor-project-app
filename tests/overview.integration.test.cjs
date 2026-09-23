const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage } = require("../electron/storage.cjs");
const { createCollector } = require("../electron/collector.cjs");
const { collectSnapshot, closeDatabase } = require("../electron/db.cjs");
const { buildOverview } = require("../electron/overview.cjs");

test("overview uses live PostgreSQL data and preserves stale data after failure", { skip: process.env.BDASH_TEST_PG !== "1" }, async () => {
  require("dotenv").config();
  const tempRoot = path.resolve(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(tempRoot, "bdash-overview-"));
  const storage = openStorage(dir);
  try {
    const collector = createCollector({ collectSnapshot, storage });
    assert.equal((await collector.refreshNow()).state, "success");
    const period = { from: new Date(Date.now() - 3600_000).toISOString(), to: new Date().toISOString() };
    const ready = buildOverview({ collector, storage, profile: storage.getProfile(1), period });
    assert.equal(ready.instance.state, "ready");
    assert.equal(ready.instance.data.database, process.env.PGDATABASE || "postgres");
    assert.ok(ready.databases.data.length > 0);
    assert.ok(ready.connectionsSeries.data.length > 0);

    const failingCollector = createCollector({
      collectSnapshot: async () => ({
        startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        collectedAt: new Date().toISOString(), result: "failed", state: "unavailable",
        instance: { host: "localhost", port: 5432, database: "postgres" },
        metrics: {}, databases: [], capabilities: {}, error: "Instância indisponível",
      }),
      storage,
    });
    assert.equal((await failingCollector.refreshNow()).state, "failed");
    const stale = buildOverview({ collector: failingCollector, storage, profile: storage.getProfile(1), period });
    assert.equal(stale.instance.state, "stale");
    assert.equal(stale.instance.data.database, ready.instance.data.database);
    assert.ok(stale.databases.data.length > 0);
  } finally {
    storage.close();
    await closeDatabase();
    const relative = path.relative(tempRoot, dir);
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) fs.rmSync(dir, { recursive: true, force: true });
  }
});
