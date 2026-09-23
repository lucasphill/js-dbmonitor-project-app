const test = require("node:test");
const assert = require("node:assert/strict");
const { connectionConfig, testConnection, classifyConnectionError } = require("../electron/db.cjs");

const profile = { id: 2, label: "Prod", host: "dbmonitor-test.invalid.sa-east-1.rds.amazonaws.com",
  port: 5432, database: "postgres", dbUser: "monitor_user", authMode: "rds_iam",
  awsRegion: "sa-east-1", awsProfile: null, tlsCaMode: "bundled" };

test("RDS IAM requires CA, TLS name verification and dynamic password", async () => {
  let calls = 0;
  const config = connectionConfig(profile, null, { tokenProvider: async () => `token-${++calls}` });
  assert.equal(config.host, profile.host);
  assert.equal(config.ssl.servername, profile.host);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.match(config.ssl.ca, /BEGIN CERTIFICATE/);
  assert.equal(await config.password(), "token-1");
  assert.equal(await config.password(), "token-2");
  assert.equal(config.password instanceof Function, true);
});

test("remote password profiles require verified TLS while localhost remains available", () => {
  const remote = { ...profile, authMode: "session_password", host: "dbmonitor-test.invalid.example.org" };
  const remoteConfig = connectionConfig(remote, "temporary-test-password");
  assert.deepEqual(remoteConfig.ssl, { servername: remote.host, rejectUnauthorized: true });
  assert.equal(remoteConfig.password, "temporary-test-password");

  const rdsConfig = connectionConfig({ ...remote, host: profile.host }, "temporary-test-password");
  assert.equal(rdsConfig.ssl.servername, profile.host);
  assert.equal(rdsConfig.ssl.rejectUnauthorized, true);
  assert.match(rdsConfig.ssl.ca, /BEGIN CERTIFICATE/);

  const localConfig = connectionConfig({ ...remote, host: "localhost" }, "temporary-test-password");
  assert.equal(localConfig.ssl, undefined);

  const previous = process.env.PGPASSWORD;
  try {
    process.env.PGPASSWORD = "temporary-test-password";
    const legacyConfig = connectionConfig({ ...remote, authMode: "legacy_env" });
    assert.deepEqual(legacyConfig.ssl, { servername: remote.host, rejectUnauthorized: true });
  } finally {
    if (previous === undefined) delete process.env.PGPASSWORD;
    else process.env.PGPASSWORD = previous;
  }
});

test("the first local profile has the requested password without an env file", () => {
  const previous = process.env.PGPASSWORD;
  try {
    delete process.env.PGPASSWORD;
    const config = connectionConfig({ id: 1, host: "localhost", port: 5432,
      database: "postgres", dbUser: "postgres", authMode: "legacy_env" });
    assert.equal(config.password, "password");
    const remote = connectionConfig({ id: 1, host: "db.example.org", port: 5432,
      database: "postgres", dbUser: "postgres", authMode: "legacy_env" });
    assert.equal(remote.password, undefined);
  } finally {
    if (previous === undefined) delete process.env.PGPASSWORD;
    else process.env.PGPASSWORD = previous;
  }
});

test("connection test reports success only after PostgreSQL query and closes client", async () => {
  const events = [];
  class FakeClient {
    constructor(config) { assert.equal(config.ssl.rejectUnauthorized, true); }
    async connect() { events.push("connect"); }
    async query(query) {
      events.push("query");
      assert.match(query, /current_database/);
      return { rows: [{ database: "postgres", db_user: "monitor_user", server_version: "17.5" }] };
    }
    async end() { events.push("end"); }
  }
  const result = await testConnection(profile, null, { Client: FakeClient,
    tokenProvider: async () => "token" });
  assert.deepEqual(events, ["connect", "query", "end"]);
  assert.equal(result.status, "success");
  assert.equal(result.stage, "complete");
  assert.equal(result.profileId, 2);
  assert.equal(result.serverVersion, "17.5");
  assert.ok(!JSON.stringify(result).includes("token"));
});

test("invalid certificate or mismatched hostname is classified and fails closed", async () => {
  const invalidCa = { ...profile, tlsCaMode: "custom", tlsCaPath: "C:/missing-bundle.pem" };
  assert.throws(() => connectionConfig(invalidCa), { code: "TLS_VALIDATION_FAILED" });
  for (const code of ["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID"]) {
    assert.equal(classifyConnectionError({ code }).code, "TLS_VALIDATION_FAILED");
  }
});
