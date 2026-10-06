const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');

const ssmProfile = { authMode: 'rds_iam_ssm', host: 'test.sa-east-1.rds.amazonaws.com',
  port: 5432, dbUser: 'monitor', awsRegion: 'sa-east-1', ssmTarget: 'i-0123456789abcdef0', ssmLocalPort: null };
function fakeChild(pid = 12345) {
  const child = new EventEmitter();
  child.pid = pid; child.exitCode = null; child.signalCode = null;
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { child.exitCode = 0; child.emit('exit', 0); return true; };
  return child;
}
function tunnelFixture(overrides = {}) {
  const calls = []; const children = [];
  const deps = {
    platform: 'win32',
    execFileImpl(file, args, options, callback) {
      calls.push({ file, args, options });
      queueMicrotask(() => callback(null, '{}', ''));
      return { kill() {} };
    },
    reservePort: async () => 15432, portFree: async () => true,
    probePort: async () => '127.0.0.1', waitPortClosed: async () => true,
    killTree: async child => child.kill(),
    spawnImpl(file, args, options) {
      calls.push({ file, args, options });
      const child = fakeChild(12345 + children.length); children.push(child);
      queueMicrotask(() => child.stdout.write('Starting session with SessionId: test-session\nPort 15432 opened for sessionId test-session.'));
      return child;
    }, ...overrides,
  };
  return { deps, calls, children };
}
module.exports = { ssmProfile, fakeChild, tunnelFixture };
