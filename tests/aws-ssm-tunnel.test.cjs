const test = require('node:test');
const assert = require('node:assert/strict');
const { createSsmTunnelManager, parseSessionOutput } = require('../electron/aws-ssm-tunnel.cjs');
const { ssmProfile, tunnelFixture, fakeChild } = require('./helpers/ssm-fixtures.cjs');

test('bounded parser accepts readiness without newline and requires matching session/port', () => {
  assert.deepEqual(parseSessionOutput('Starting session with SessionId: test-session\nPort 15432 opened for sessionId test-session.', 15432), { sessionId: 'test-session', ready: true });
  assert.equal(parseSessionOutput('Port 15432 opened for sessionId other.', 15432).ready, false);
  assert.equal(parseSessionOutput('Starting session with SessionId: test-session\nPort 5432 opened for sessionId test-session.', 15432).ready, false);
});
test('preflight and spawn use fixed document, JSON parameters and hidden no-shell processes', async () => {
  const fixture = tunnelFixture(); const manager = createSsmTunnelManager(fixture.deps);
  const lease = await manager.acquire({ ...ssmProfile, awsProfile: 'production' });
  const start = fixture.calls.find(call => call.args[1] === 'start-session');
  assert.equal(start.options.shell, false); assert.equal(start.options.windowsHide, true);
  assert.equal(start.args[start.args.indexOf('--document-name') + 1], 'AWS-StartPortForwardingSessionToRemoteHost');
  assert.deepEqual(JSON.parse(start.args[start.args.indexOf('--parameters') + 1]), { host: [ssmProfile.host], portNumber: ['5432'], localPortNumber: ['15432'] });
  assert.ok(fixture.calls.some(call => call.args[0] === 'sts'));
  assert.equal(lease.host, '127.0.0.1'); await lease.release();
});
test('explicit occupied port is never adopted or silently replaced', async () => {
  const fixture = tunnelFixture({ portFree: async () => false });
  await assert.rejects(createSsmTunnelManager(fixture.deps).acquire({ ...ssmProfile, ssmLocalPort: 15432 }), { code: 'LOCAL_PORT_IN_USE' });
  assert.equal(fixture.children.length, 0);
});
test('automatic occupied candidates are limited to three', async () => {
  let reserved = 0;
  const fixture = tunnelFixture({ reservePort: async () => { reserved++; return 15432; }, portFree: async () => false });
  await assert.rejects(createSsmTunnelManager(fixture.deps).acquire(ssmProfile), { code: 'LOCAL_PORT_IN_USE' });
  assert.equal(reserved, 3);
});
test('chunked marker can select IPv6 loopback', async () => {
  const fixture = tunnelFixture({ probePort: async () => '::1', spawnImpl() {
    const child = fakeChild(); setImmediate(() => {
      child.stdout.write('Starting session with SessionId: test-');
      child.stdout.write('session\nPort 15432 opened for sessionId test-session.');
    }); return child;
  } });
  const lease = await createSsmTunnelManager(fixture.deps).acquire(ssmProfile);
  assert.equal(lease.host, '::1'); await lease.release();
});
test('plugin missing is classified without raw diagnostics', async () => {
  const fixture = tunnelFixture({ execFileImpl(file, args, options, callback) {
    queueMicrotask(() => callback(file.startsWith('session-manager') ? Object.assign(new Error('secret'), { code: 'ENOENT' }) : null, '', 'secret'));
  } });
  await assert.rejects(createSsmTunnelManager(fixture.deps).acquire(ssmProfile), error => error.code === 'SSM_PLUGIN_NOT_FOUND' && !error.message.includes('secret'));
});
test('automatic bind race retries only owned processes with three bounded candidates', async () => {
  let attempt = 0;
  const fixture = tunnelFixture({ spawnImpl() {
    const child = fakeChild(200 + attempt++);
    queueMicrotask(() => { child.stderr.write('listen tcp: address already in use'); child.exitCode = 1; child.emit('exit', 1); });
    return child;
  } });
  await assert.rejects(createSsmTunnelManager(fixture.deps).acquire(ssmProfile), { code: 'LOCAL_PORT_IN_USE' });
  assert.equal(attempt, 3);
});
test('oversized raw plugin output is rejected without leaking it', async () => {
  const fixture = tunnelFixture({ spawnImpl() {
    const child = fakeChild(); queueMicrotask(() => child.stderr.write('secret'.repeat(6000))); return child;
  } });
  await assert.rejects(createSsmTunnelManager(fixture.deps).acquire(ssmProfile), error =>
    error.code === 'SSM_SESSION_FAILED' && !error.message.includes('secret'));
});
test('existing TCP listener without owned readiness marker cannot become a lease', async () => {
  let probes = 0;
  const fixture = tunnelFixture({ spawnImpl: () => fakeChild(), probePort: async () => { probes++; return '127.0.0.1'; } });
  await assert.rejects(createSsmTunnelManager(fixture.deps).acquire(ssmProfile, { deadline: Date.now() + 30 }), { code: 'CONNECTION_TIMEOUT' });
  assert.equal(probes, 0);
});
