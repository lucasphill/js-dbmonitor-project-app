const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { resolveUserDataPath } = require("../electron/user-data.cjs");

const appDataPath = path.resolve("test-appdata");
const defaultPath = path.join(appDataPath, "DBMonitor");
const oldPath = path.join(appDataPath, "bdash-electron");
const database = "bdash.sqlite";

test("DBMonitor keeps the previous SQLite directory until a new one is in use", () => {
  const legacyDatabase = path.join(oldPath, database);
  const newDatabase = path.join(defaultPath, database);
  assert.equal(resolveUserDataPath({ appDataPath, defaultPath,
    existsSync: (file) => file === legacyDatabase }), oldPath);
  assert.equal(resolveUserDataPath({ appDataPath, defaultPath,
    existsSync: (file) => [legacyDatabase, newDatabase].includes(file) }), defaultPath);
});

test("an explicit DBMonitor data directory overrides legacy data without moving it", () => {
  const chosen = path.resolve("isolated-dbmonitor-data");
  assert.equal(resolveUserDataPath({ appDataPath, defaultPath, overridePath: chosen,
    existsSync: () => true }), chosen);
  assert.throws(() => resolveUserDataPath({ appDataPath, defaultPath,
    overridePath: "relative-data", existsSync: () => false }), /absolute/);
});
