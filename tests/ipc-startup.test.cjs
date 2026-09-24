const test = require("node:test");
const assert = require("node:assert/strict");
const ipc = require("../electron/ipc.cjs");

const frame = { url: "bdash://app/" };
const trusted = { senderFrame: frame, sender: { mainFrame: frame } };

test("startup setting accepts only a strict boolean", () => {
  assert.equal(ipc.startupEnabled(true), true);
  assert.equal(ipc.startupEnabled(false), false);
  for (const input of [undefined, null, 0, 1, "true", {}, []]) {
    assert.throws(() => ipc.startupEnabled(input), /Início automático inválido/);
  }
});

test("startup IPC rejects untrusted frames and serializes the state", async () => {
  const handler = ipc.wrapHandler(false, (enabled) => ({ state: ipc.startupEnabled(enabled) ? "enabled" : "disabled" }));
  assert.deepEqual(await handler(trusted, true), { ok: true, data: { state: "enabled" } });
  assert.deepEqual(await handler(trusted, false), { ok: true, data: { state: "disabled" } });
  const invalid = await handler(trusted, "true");
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, "INVALID_INPUT");
  const untrustedFrame = { url: "https://example.org/" };
  const untrusted = { senderFrame: untrustedFrame, sender: { mainFrame: untrustedFrame } };
  const denied = await handler(untrusted, true);
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "FORBIDDEN");
});
