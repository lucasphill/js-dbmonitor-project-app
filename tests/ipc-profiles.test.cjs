const test = require("node:test");
const assert = require("node:assert/strict");
const ipc = require("../electron/ipc.cjs");
const { validateProfileDraft, validateProfileChanges } = require("../electron/connection-profiles.cjs");

const rds = {
  label: "Produção", host: "dbmonitor-test.invalid.sa-east-1.rds.amazonaws.com",
  port: 5432, database: "postgres", dbUser: "monitor_user", authMode: "rds_iam",
  awsRegion: "sa-east-1", awsProfile: null, tlsCaMode: "bundled",
};

test("RDS profile validation rejects command fields, alias endpoints and region mismatch", () => {
  assert.equal(validateProfileDraft(rds).host, rds.host);
  assert.throws(() => validateProfileDraft({ ...rds, host: "rds.alias.example" }), /endpoint original/);
  assert.throws(() => validateProfileDraft({ ...rds, awsRegion: "us-east-1" }), /endpoint original/);
  assert.throws(() => validateProfileDraft({ ...rds, executable: "powershell.exe" }), /Campo de perfil/);
  assert.throws(() => validateProfileDraft({ ...rds, awsProfile: "--output secret" }), /Perfil AWS/);
  assert.throws(() => validateProfileDraft({ ...rds, awsProfile: "" }), /nome do perfil AWS/);
  assert.throws(() => validateProfileDraft({ ...rds, password: "secret" }), /Campo de perfil/);
});

test("legacy environment profile only permits a label change", () => {
  const legacy = { label: "Local", host: "localhost", port: 5432, database: "postgres",
    dbUser: "postgres", authMode: "legacy_env", awsRegion: null, awsProfile: null,
    tlsCaMode: null, tlsCaPath: null };
  assert.equal(validateProfileChanges(legacy, { label: "Local renomeado" }).label, "Local renomeado");
  assert.throws(() => validateProfileChanges(legacy, { host: "other.local" }), /perfil legado/);
});

test("session actions require the observed source and errors never echo driver material", () => {
  assert.deepEqual(ipc.sessionActionIdentity({ pid: 7, backendStart: "2026-09-23T12:00:00.000Z",
    profileId: 2, generation: 5 }), {
    pid: 7, backendStart: "2026-09-23T12:00:00.000Z", profileId: 2, generation: 5,
  });
  assert.throws(() => ipc.sessionActionIdentity({ pid: 7, backendStart: "2026-09-23T12:00:00.000Z" }), /Perfil/);
  const safe = ipc.safeError({ code: "DATABASE_AUTH_FAILED", message: "password=top-secret" });
  assert.equal(safe.code, "DATABASE_AUTH_FAILED");
  assert.equal(JSON.stringify(safe).includes("top-secret"), false);
});
