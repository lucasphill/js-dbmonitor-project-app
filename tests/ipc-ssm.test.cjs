const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const ipc = require('../electron/ipc.cjs');

test('SSM IPC validates bounded request IDs and refuses extra command/process options', () => {
  assert.deepEqual(ipc.connectionTestOptions({ requestId: 'test-123' }), { requestId: 'test-123' });
  assert.deepEqual(ipc.connectionTestOptions(undefined), {});
  for (const value of ['', '--inject space', 'a'.repeat(65), 123, null]) assert.throws(() => ipc.connectionRequestId(value));
  assert.throws(() => ipc.connectionTestOptions({ requestId: 'valid', pid: 123 }));
  assert.throws(() => ipc.connectionTestOptions({ requestId: 'valid', command: 'powershell' }));
});

test('SSM errors are allowlisted and origin restriction applies to cancel operations', async () => {
  for (const code of ['SSM_PLUGIN_NOT_FOUND', 'SSM_ACCESS_DENIED', 'SSM_TARGET_UNAVAILABLE',
    'SSM_SESSION_FAILED', 'SSM_TUNNEL_LOST', 'LOCAL_PORT_IN_USE', 'CONNECTION_CANCELED']) {
    const result = ipc.safeError({ code, message: 'SECRET_STDERR_TOKEN' });
    assert.equal(result.code, code);
    assert.doesNotMatch(JSON.stringify(result), /SECRET_STDERR_TOKEN/);
  }
  let called = false;
  const handler = ipc.wrapHandler(false, () => { called = true; });
  const frame = { url: 'https://other.invalid/' };
  const result = await handler({ senderFrame: frame, sender: { mainFrame: frame } });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'FORBIDDEN'); assert.equal(called, false);
});

test('preload exposes only named SSM methods and unsubscribes listeners without Electron event', async () => {
  let api;
  const renderer = new EventEmitter();
  const calls = [];
  renderer.invoke = async (...args) => { calls.push(args); return { ok: true, data: { accepted: true } }; };
  vm.runInNewContext(fs.readFileSync(require.resolve('../electron/preload.cjs'), 'utf8'), {
    require: name => { assert.equal(name, 'electron'); return { ipcRenderer: renderer,
      contextBridge: { exposeInMainWorld: (name, exposed) => { assert.equal(name, 'bdash'); api = exposed; } } }; },
  });
  const context = { profileId: 2, generation: 3 };
  await api.getConnectionStatus(); await api.disconnectConnectionProfile(context);
  await api.reconnectConnectionProfile(context); await api.cancelConnectionTest('request-1');
  await api.cancelConnectionAttempt(context); await api.testConnectionProfile(2, undefined, { requestId: 'request-1' });
  assert.deepEqual(calls.map(args => args[0]), ['profiles:connection-status', 'profiles:disconnect',
    'profiles:reconnect', 'profiles:cancel-test', 'profiles:cancel-connect', 'profiles:test']);
  assert.equal(api.invoke, undefined); assert.equal(api.exec, undefined);
  let payload;
  const unsubscribe = api.onConnectionState(state => { payload = state; });
  const state = { sourceContext: context, revision: 1, state: 'connecting' };
  renderer.emit('profiles:connection-state', { secretNativeEvent: true }, state);
  assert.equal(payload, state);
  unsubscribe(); assert.equal(renderer.listenerCount('profiles:connection-state'), 0);
});
