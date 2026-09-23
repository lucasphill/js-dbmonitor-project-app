const test = require("node:test");
const assert = require("node:assert/strict");
const { testConnection, classifyConnectionError } = require("../electron/db.cjs");

const profile = { id: 2, host: "dbmonitor-test.invalid.sa-east-1.rds.amazonaws.com", port: 5432,
  database: "postgres", dbUser: "monitor_user", authMode: "rds_iam", awsRegion: "sa-east-1" };

test("PostgreSQL failure categories never return driver secrets", async () => {
  for (const [code, expected] of [["ENOTFOUND", "NETWORK_UNAVAILABLE"],
    ["28P01", "DATABASE_AUTH_FAILED"], ["42501", "DATABASE_PERMISSION_DENIED"]]) {
    class FakeClient {
      async connect() { if (code !== "42501") throw Object.assign(new Error("secret-token"), { code }); }
      async query() { throw Object.assign(new Error("secret-token"), { code }); }
      async end() {}
    }
    const result = await testConnection(profile, null, { Client: FakeClient,
      tokenProvider: async () => "secret-token" });
    assert.equal(result.status, "failed");
    assert.equal(result.code, expected);
    assert.doesNotMatch(JSON.stringify(result), /secret-token/);
  }
  assert.equal(classifyConnectionError({ code: "ERR_TLS_CERT_ALTNAME_INVALID", message: "secret-token" }).stage, "tls");
});
