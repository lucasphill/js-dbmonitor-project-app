const test = require("node:test");
const assert = require("node:assert/strict");
const ipc = require("../electron/ipc.cjs");

test("IPC accepts a bounded period and rejects an oversized range", () => {
  const now = Date.now();
  assert.deepEqual(ipc.period({ from: new Date(now - 60_000).toISOString(), to: new Date(now).toISOString() }), {
    from: new Date(now - 60_000).toISOString(), to: new Date(now).toISOString(),
  });
  assert.throws(() => ipc.period({ from: "2020-01-01T00:00:00Z", to: new Date(now).toISOString() }), /Período fora do limite/);
  assert.throws(() => ipc.period({ from: new Date(now - 8 * 86400000).toISOString(), to: new Date(now).toISOString() }), /Período fora do limite/);
});

test("IPC rejects unbounded pages and unknown sort columns", () => {
  assert.throws(() => ipc.page({ limit: 201 }), /Limite da página/);
  assert.throws(() => ipc.sessionFilters({ page: { limit: 50 }, sortBy: "query" }), /Ordenação inválida/);
  assert.throws(() => ipc.databaseInventoryFilters({ page: { limit: 50 }, sortBy: "query" }), /Ordenação inválida/);
  assert.throws(() => ipc.databaseInventoryFilters({ page: { limit: 50 }, status: "deleted" }), /Estado inválido/);
  assert.deepEqual(ipc.databaseInventoryFilters({ search: "  app  ", sortBy: "size", sortDirection: "desc", page: { limit: 10 } }), {
    search: "app", owner: undefined, encoding: undefined, status: undefined,
    sortBy: "size", sortDirection: "desc", page: { limit: 10, cursor: "0" },
  });
});

test("IPC requires PID and session start together", () => {
  assert.deepEqual(ipc.sessionIdentity({ pid: 123, backendStart: "2026-09-23T12:00:00Z" }), {
    pid: 123, backendStart: "2026-09-23T12:00:00Z",
  });
  assert.equal(ipc.sessionIdentity({ pid: 123, backendStart: "2026-09-23T12:00:00.123456Z" }).backendStart,
    "2026-09-23T12:00:00.123456Z");
  assert.throws(() => ipc.sessionIdentity({ pid: 123 }), /Início da sessão/);
});

test("IPC only accepts the main frame of the application origin", () => {
  const frame = { url: "bdash://app/" };
  assert.doesNotThrow(() => ipc.assertOrigin({ senderFrame: frame, sender: { mainFrame: frame } }, false));
  assert.throws(() => ipc.assertOrigin({ senderFrame: { url: "bdash://app/" }, sender: { mainFrame: frame } }, false), /Origem não autorizada/);
  const other = { url: "https://attacker.example/" };
  assert.throws(() => ipc.assertOrigin({ senderFrame: other, sender: { mainFrame: other } }, false), /Origem não autorizada/);
});
