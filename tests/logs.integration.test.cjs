const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage } = require("../electron/storage.cjs");
const { ingestCsvLog } = require("../electron/logs.cjs");

function line(message, stamp = "2026-09-23 12:00:00 UTC") {
  return `${stamp},postgres,postgres,123,localhost,session,1,SELECT,${stamp},1/1,0,LOG,00000,"${message}",,,,,,,,,,,,\n`;
}

test("CSV logs survive restart, de-duplicate, tolerate malformed rows and rotate", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bdash-logs-"));
  const file = path.join(directory, "postgres.csv");
  let storage;
  try {
    storage = openStorage(directory);
    fs.writeFileSync(file, line("first, message") + "bad,row\n" + line("second"));
    assert.equal(ingestCsvLog(storage, 1, file).inserted, 2);
    assert.equal(ingestCsvLog(storage, 1, file).inserted, 0);
    const filters = { period: { from: "2026-09-23T00:00:00Z", to: "2026-09-24T00:00:00Z" }, page: { limit: 20, cursor: "0" } };
    assert.equal(storage.getLogs(1, filters).total, 2);
    assert.equal(storage.getLogs(1, { ...filters, search: "first" }).rows[0].message, "first, message");
    storage.close();
    storage = openStorage(directory);
    assert.equal(storage.getLogs(1, filters).total, 2);
    fs.renameSync(file, path.join(directory, "postgres-old.csv"));
    fs.writeFileSync(file, line("after rotation"));
    assert.equal(ingestCsvLog(storage, 1, file).inserted, 1);
    assert.equal(storage.getLogs(1, filters).total, 3);
    fs.renameSync(file, path.join(directory, "postgres-unavailable.csv"));
    assert.equal(ingestCsvLog(storage, 1, file).state, "unavailable");
    assert.equal(storage.getLogs(1, filters).total, 3);
  } finally {
    storage?.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
