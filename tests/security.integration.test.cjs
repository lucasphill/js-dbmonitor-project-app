const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage } = require("../electron/storage.cjs");
const { sessionFilters, sessionIdentity, wrapHandler } = require("../electron/ipc.cjs");

test("IPC rejects untrusted frames and session identifiers with SQL payloads", async () => {
  const foreignFrame = { url: "https://example.invalid/" };
  const invoke = wrapHandler(false, async () => "secret");
  const result = await invoke({ senderFrame: foreignFrame, sender: { mainFrame: foreignFrame } });
  assert.deepEqual(result, { ok: false, error: { code: "FORBIDDEN", message: "Origem não autorizada" } });
  assert.throws(() => sessionIdentity({ pid: "1;DROP TABLE x", backendStart: "2026-09-23T12:00:00.000000Z" }));
  assert.throws(() => sessionFilters({ sortBy: "query; DROP TABLE x", page: { limit: 50 } }));
});

test("collection and termination audit omit credentials and query text", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bdash-security-"));
  let storage;
  try {
    storage = openStorage(directory);
    const at = new Date().toISOString();
    storage.recordCycle(1, { startedAt: at, finishedAt: at, result: "success", instance: {},
      metrics: {}, databases: [], query: "SENSITIVE_QUERY_SENTINEL", password: "SENSITIVE_PASSWORD_SENTINEL" });
    storage.recordTerminationAttempt(1, { pid: 123, backendStart: at, result: "protected",
      confirmed: false, error: "SENSITIVE_PASSWORD_SENTINEL" });
    const bytes = fs.readFileSync(storage.filePath).toString("utf8") +
      (fs.existsSync(`${storage.filePath}-wal`) ? fs.readFileSync(`${storage.filePath}-wal`).toString("utf8") : "");
    assert.ok(!bytes.includes("SENSITIVE_QUERY_SENTINEL"));
    assert.ok(!bytes.includes("SENSITIVE_PASSWORD_SENTINEL"));
  } finally {
    storage?.close();
    assert.equal(path.dirname(directory), os.tmpdir());
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
