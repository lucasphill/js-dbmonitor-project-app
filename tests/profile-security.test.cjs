const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage, FILE_NAME } = require("../electron/storage.cjs");
const { testConnection } = require("../electron/db.cjs");

test("IAM token used by a real connection callback never enters SQLite or public result", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bdash-no-secret-"));
  const secret = "RDS_TOKEN_SENTINEL_X_AMZ_SIGNATURE_123456";
  const storage = openStorage(root);
  try {
    const profile = storage.createProfile({ label: "RDS", host: "fake.sa-east-1.rds.amazonaws.com",
      port: 5432, database: "postgres", dbUser: "monitor_user", authMode: "rds_iam",
      awsRegion: "sa-east-1", awsProfile: null, tlsCaMode: "bundled", tlsCaPath: null });
    class FakeClient {
      constructor(config) { this.config = config; }
      async connect() { assert.equal(await this.config.password(), secret); }
      async query() { return { rows: [{ database: "postgres", db_user: "monitor_user", server_version: "16" }] }; }
      async end() {}
    }
    const result = await testConnection(profile, null, { Client: FakeClient, tokenProvider: () => secret });
    assert.equal(result.status, "success");
    assert.equal(JSON.stringify(result).includes(secret), false);
    const at = "2026-09-23T12:00:00.000Z";
    storage.recordCycle(profile.id, { startedAt: at, finishedAt: at, result: "success",
      instance: { database: "postgres" }, metrics: {}, databases: [], capabilities: {} });
    assert.deepEqual(storage.db.prepare("PRAGMA foreign_key_check").all(), []);
    storage.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(root, FILE_NAME + suffix);
      if (fs.existsSync(file)) assert.equal(fs.readFileSync(file).includes(Buffer.from(secret)), false);
    }
  } finally {
    try { storage.close(); } catch { /* already closed */ }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
