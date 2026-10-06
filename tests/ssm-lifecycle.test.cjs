const test = require('node:test');
const assert = require('node:assert/strict');
const { createSsmTunnelManager } = require('../electron/aws-ssm-tunnel.cjs');
const { ssmProfile, tunnelFixture, fakeChild } = require('./helpers/ssm-fixtures.cjs');
test('identical live config shares leases and release is idempotent', async () => {
  const fixture = tunnelFixture(); const manager = createSsmTunnelManager(fixture.deps);
  const first = await manager.acquire(ssmProfile); const second = await manager.acquire(ssmProfile);
  assert.equal(fixture.children.length, 1); await second.release(); await second.release();
  assert.equal(fixture.children[0].exitCode, null); await first.release();
  assert.equal(fixture.children[0].exitCode, 0);
  assert.equal(fixture.calls.filter(call => call.args[1] === 'terminate-session').length, 1);
});
test('drop is emitted once and invalidates ready transport', async () => {
  const fixture = tunnelFixture(); const manager = createSsmTunnelManager(fixture.deps); const drops = [];
  manager.on('drop', event => drops.push(event)); const lease = await manager.acquire(ssmProfile);
  fixture.children[0].exitCode = 1; fixture.children[0].emit('exit', 1);
  fixture.children[0].emit('error', new Error('secret'));
  assert.equal(drops.length, 1); assert.equal(drops[0].code, 'SSM_TUNNEL_LOST');
  assert.equal(lease.healthy, false); await manager.closeAll();
});
test('abort opening cleans owned child and rejects late readiness', async () => {
  const child = fakeChild(); const fixture = tunnelFixture({ spawnImpl: () => child });
  const manager = createSsmTunnelManager(fixture.deps); const controller = new AbortController();
  const pending = manager.acquire(ssmProfile, { signal: controller.signal });
  setImmediate(() => { controller.abort(); child.stdout.write('Starting session with SessionId: late\nPort 15432 opened for sessionId late.'); });
  await assert.rejects(pending, { code: 'CONNECTION_CANCELED' }); assert.equal(child.exitCode, 0);
});
test('remote refusal reports cleanup warning and still kills only owned process', async () => {
  const fixture = tunnelFixture(); const original = fixture.deps.execFileImpl;
  fixture.deps.execFileImpl = (file, args, options, callback) => args[1] === 'terminate-session'
    ? queueMicrotask(() => callback(new Error('secret'), '', 'secret')) : original(file, args, options, callback);
  const manager = createSsmTunnelManager(fixture.deps); const lease = await manager.acquire(ssmProfile);
  const result = await lease.release(); assert.ok(result.cleanupWarning); assert.doesNotMatch(result.cleanupWarning, /secret/);
  assert.equal(fixture.children[0].exitCode, 0);
});
test('canceling a test waiter leaves the independent active lease alive', async () => {
  const fixture = tunnelFixture(); const manager = createSsmTunnelManager(fixture.deps);
  const active = await manager.acquire(ssmProfile); const controller = new AbortController(); controller.abort();
  await assert.rejects(manager.acquire(ssmProfile, { signal: controller.signal }), { code: 'CONNECTION_CANCELED' });
  assert.equal(active.healthy, true); assert.equal(fixture.children[0].exitCode, null); await active.release();
});
test('intentional close invalidates shared leases without emitting a drop', async () => {
  const fixture = tunnelFixture(); const manager = createSsmTunnelManager(fixture.deps); let drops = 0;
  manager.on('drop', () => drops++);
  const first = await manager.acquire(ssmProfile); const second = await manager.acquire(ssmProfile);
  await manager.close(first.key); assert.equal(first.healthy, false); assert.equal(second.healthy, false);
  assert.equal(drops, 0); await first.release(); await second.release();
  assert.equal(fixture.calls.filter(call => call.args[1] === 'terminate-session').length, 1);
});
test('different transport configuration gets its own process and cleanup', async () => {
  const fixture = tunnelFixture(); const manager = createSsmTunnelManager(fixture.deps);
  const first = await manager.acquire(ssmProfile);
  const second = await manager.acquire({ ...ssmProfile, ssmTarget: 'i-abcdef01234567890' });
  assert.notEqual(first.key, second.key); await first.release(); assert.equal(second.healthy, true); await second.release();
});
test('Windows tree cleanup captures descendants and preserves external/reused PIDs', async () => {
  const child = fakeChild(); const killed = []; let snapshots = 0;
  const fixture = tunnelFixture({ killTree: undefined,
    spawnImpl() { queueMicrotask(() => child.stdout.write('Starting session with SessionId: test-session\nPort 15432 opened for sessionId test-session.')); return child; },
    execFileImpl(file, args, options, callback) {
      let output = '{}';
      if (file === 'powershell.exe') {
        snapshots++;
        output = JSON.stringify(snapshots === 1 ? [
          { ProcessId: child.pid, ParentProcessId: 10, Created: 'root-time' },
          { ProcessId: 222, ParentProcessId: child.pid, Created: 'plugin-time' },
          { ProcessId: 223, ParentProcessId: child.pid, Created: 'old-time' },
          { ProcessId: 333, ParentProcessId: 0, Created: 'external-time' },
        ] : [
          { ProcessId: 222, ParentProcessId: child.pid, Created: 'plugin-time' },
          { ProcessId: 223, ParentProcessId: 0, Created: 'reused-time' },
          { ProcessId: 333, ParentProcessId: 0, Created: 'external-time' },
        ]);
      }
      if (file === 'taskkill.exe') { killed.push(Number(args[1])); if (Number(args[1]) === child.pid) child.kill(); }
      queueMicrotask(() => callback(null, output, '')); return { kill() {} };
    } });
  const manager = createSsmTunnelManager(fixture.deps); const lease = await manager.acquire(ssmProfile);
  await lease.release(); assert.deepEqual(killed, [child.pid, 222]);
});
test('Linux uses a detached owned process group instead of name/port kills', async () => {
  const signals = []; const fixture = tunnelFixture({ platform: 'linux', killTree: undefined,
    killGroup(pid, signal) { signals.push({ pid, signal }); } });
  const manager = createSsmTunnelManager(fixture.deps); const lease = await manager.acquire(ssmProfile);
  const start = fixture.calls.find(call => call.args[1] === 'start-session');
  assert.equal(start.options.detached, true); assert.equal(start.file, 'aws'); await lease.release();
  assert.deepEqual(signals, [{ pid: -fixture.children[0].pid, signal: 'SIGTERM' }, { pid: -fixture.children[0].pid, signal: 'SIGKILL' }]);
});
test('operation deadline and cancellation reject before independent cleanup completes', async () => {
  for (const cancel of [false, true]) {
    let finishCleanup;
    const child = fakeChild();
    const fixture = tunnelFixture({ spawnImpl: () => child,
      killTree: () => new Promise(resolve => { finishCleanup = () => { child.kill(); resolve(); }; }) });
    const manager = createSsmTunnelManager(fixture.deps);
    const controller = new AbortController();
    const pending = manager.acquire(ssmProfile, { signal: controller.signal, deadline: Date.now() + 40 });
    if (cancel) setTimeout(() => controller.abort(), 10);
    await assert.rejects(pending, { code: cancel ? 'CONNECTION_CANCELED' : 'CONNECTION_TIMEOUT' });
    assert.equal(child.exitCode, null, 'failure is published while cleanup remains pending');
    assert.equal(typeof finishCleanup, 'function');
    finishCleanup(); await manager.closeAll(); assert.equal(child.exitCode, 0);
  }
});
