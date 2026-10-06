const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createProfileController } = require('../electron/connection-profiles.cjs');

function fixture() {
  const profile = { id: 2, label: 'SSM', host: 'test.sa-east-1.rds.amazonaws.com', port: 5432,
    database: 'postgres', dbUser: 'monitor', authMode: 'rds_iam_ssm', awsRegion: 'sa-east-1',
    awsProfile: null, tlsCaMode: 'bundled', ssmTarget: 'i-0123456789abcdef0', ssmLocalPort: null };
  let selected = 2, starts = 0, opens = 0, releases = 0;
  const manager = new EventEmitter();
  manager.acquire = async (_p, { signal }) => {
    opens++;
    if (signal.aborted) throw Object.assign(new Error('cancel'), { code: 'CONNECTION_CANCELED', stage: 'tunnel' });
    return { key: 'test', host: '127.0.0.1', port: 15432, release: async () => { releases++; } };
  };
  manager.closeAll = async () => {};
  const db = { setActiveProfile: async () => {}, closeDatabase: async () => {},
    invalidateTransport: async () => {}, testConnection: async () => ({ status: 'success', stage: 'complete' }) };
  const controller = createProfileController({
    storage: { getActiveProfileId: () => selected, getProfile: () => profile,
      setActiveProfileId: id => { selected = id; }, listProfiles: () => [profile] }, db, tunnelManager: manager,
    collectorFactory: () => ({ start: () => { starts++; }, stopAndWait: async () => {},
      refreshNow: async () => { starts++; } }),
  });
  return { controller, manager, db, stats: () => ({ starts, opens, releases }) };
}

test('SSM activation validates before collecting; disconnect and refresh do not reopen', async () => {
  const f = fixture();
  const active = await f.controller.start();
  assert.equal(active.runtime.state, 'connected');
  assert.equal(f.stats().starts, 1);
  await f.controller.disconnect(f.controller.publicContext());
  await f.controller.refreshNow();
  assert.equal(f.controller.getConnectionStatus().state, 'disconnected');
  assert.equal(f.stats().opens, 1);
  const previous = f.controller.publicContext();
  const next = await f.controller.reconnect(previous);
  assert.ok(next.generation > previous.generation);
  assert.throws(() => f.controller.assertContext(previous), { code: 'PROFILE_CHANGED' });
  assert.equal(f.stats().opens, 2);
  await f.controller.stop();
});

test('SSM rejected query leaves selected origin failed and collector suspended', async () => {
  const f = fixture();
  f.db.testConnection = async () => ({ status: 'failed', stage: 'tls', code: 'TLS_VALIDATION_FAILED', message: 'safe' });
  const active = await f.controller.start();
  assert.equal(active.profile.id, 2);
  assert.equal(active.runtime.state, 'failed');
  assert.equal(f.stats().starts, 0);
  assert.equal(f.stats().releases, 1);
  await f.controller.stop();
});

test('drop invalidates SSM session, exposes stale state and cannot restart with refresh', async () => {
  const f = fixture();
  await f.controller.start();
  f.manager.emit('drop', { key: 'test', code: 'SSM_TUNNEL_LOST' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.controller.getConnectionStatus().state, 'failed');
  await f.controller.refreshNow();
  assert.equal(f.stats().opens, 1);
  await f.controller.stop();
});
test('concurrent activation of the same failed SSM profile shares one attempt', async () => {
  const f = fixture();
  let finish;
  f.db.testConnection = () => new Promise(resolve => { finish = resolve; });
  const first = f.controller.switchTo(2);
  const second = f.controller.switchTo(2);
  await new Promise(resolve => setImmediate(resolve));
  finish({ status: 'failed', stage: 'tls', code: 'TLS_VALIDATION_FAILED' });
  await Promise.all([first, second]);
  assert.equal(f.stats().opens, 1);
  assert.equal(f.controller.getConnectionStatus().state, 'failed');
  await f.controller.stop();
});
