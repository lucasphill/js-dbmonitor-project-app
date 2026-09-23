const test = require("node:test");
const assert = require("node:assert/strict");
const { connectionConfig, getPool, setActiveProfile, currentProfile, closeDatabase } = require("../electron/db.cjs");

test("each physical connection requests a new IAM token, including after 15 and 35 minutes", async () => {
  const profile = { host: "dbmonitor-test.invalid.us-east-1.rds.amazonaws.com", port: 5432,
    database: "postgres", dbUser: "monitor_admin", authMode: "rds_iam", awsRegion: "us-east-1" };
  let minute = 0;
  const requestedAt = [];
  const config = connectionConfig(profile, null, { tokenProvider: async () => {
    requestedAt.push(minute);
    return `fresh-token-${requestedAt.length}`;
  } });
  const initial = await config.password();
  minute = 16;
  const reconnected = await config.password();
  minute = 35;
  const later = await config.password();
  assert.deepEqual(requestedAt, [0, 16, 35]);
  assert.equal(new Set([initial, reconnected, later]).size, 3);
  // No scheduled pool expiration: an already authenticated session may remain open.
  assert.equal(config.maxLifetimeSeconds, undefined);
});

test("profile switch waits for old pool and blocks checkout during transition", async () => {
  const old = getPool();
  let release;
  old.end = () => new Promise((resolve) => { release = resolve; });
  const next = { id: 3, label: "Local test", host: "localhost", port: 5432,
    database: "postgres", dbUser: "postgres", authMode: "legacy_env" };
  const switching = setActiveProfile(next);
  assert.equal(currentProfile().id, 1);
  assert.throws(() => getPool(), { code: "PROFILE_CHANGED" });
  release();
  await switching;
  assert.equal(currentProfile().id, 3);
  await closeDatabase();
});
