const { spawn, execFile } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const { EventEmitter } = require('node:events');
const { ConnectionError, validIamProfile } = require('./aws-rds-auth.cjs');

const OUTPUT_LIMIT = 32 * 1024;
const DOCUMENT = 'AWS-StartPortForwardingSessionToRemoteHost';
const messages = {
  CONNECTION_CANCELED: 'Conexão cancelada.', CONNECTION_TIMEOUT: 'Tempo limite da conexão excedido.',
  AWS_CLI_NOT_FOUND: 'AWS CLI não encontrada. Confira a instalação e o PATH.',
  SSM_PLUGIN_NOT_FOUND: 'Session Manager plugin não encontrado. Confira a instalação e o PATH.',
  AWS_IDENTITY_UNAVAILABLE: 'Identidade AWS indisponível. Confira o perfil e o login SSO no terminal.',
  LOCAL_PORT_IN_USE: 'Porta local indisponível. Escolha outra porta ou use a seleção automática.',
  SSM_ACCESS_DENIED: 'A identidade AWS não tem permissão para abrir a sessão SSM.',
  SSM_TARGET_UNAVAILABLE: 'Instância SSM indisponível. Confira o agente, a região e o acesso ao destino.',
  SSM_SESSION_FAILED: 'Não foi possível abrir o túnel SSM.',
  SSM_TUNNEL_LOST: 'O túnel SSM foi interrompido. Reconecte a origem.',
};
function failure(code, stage = 'tunnel') { return new ConnectionError(code, stage, messages[code]); }
function classifyOutput(output) {
  if (/address already in use|bind.*(?:failed|error)|listen tcp.*in use/i.test(output)) return 'LOCAL_PORT_IN_USE';
  if (/accessdenied|not authorized|unauthorized/i.test(output)) return 'SSM_ACCESS_DENIED';
  if (/targetnotconnected|invalidinstanceid|is not connected|unsupportedplatform/i.test(output)) return 'SSM_TARGET_UNAVAILABLE';
  if (/session.manager.plugin.*not found/i.test(output)) return 'SSM_PLUGIN_NOT_FOUND';
  return 'SSM_SESSION_FAILED';
}
function parseSessionOutput(output, port) {
  const sessionId = /Starting session with SessionId:\s*([A-Za-z0-9_-]{1,256})(?=\s|$)/.exec(output)?.[1];
  const marker = /Port\s+(\d+)\s+opened for sessionId\s+([A-Za-z0-9_-]{1,256})(?=[.\s]|$)/.exec(output);
  return { sessionId, ready: Boolean(sessionId && marker && Number(marker[1]) === port && marker[2] === sessionId) };
}
function transportKey(profile) {
  return JSON.stringify([profile.host, Number(profile.port), profile.ssmTarget, profile.awsRegion,
    profile.awsProfile || null, profile.ssmLocalPort == null ? null : Number(profile.ssmLocalPort)]);
}
function canBind(host, port) {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', error => resolve(error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL'));
    server.listen({ host, port, exclusive: true, ipv6Only: host === '::1' }, () => server.close(() => resolve(true)));
  });
}
async function portFree(port) {
  const available = await Promise.all([canBind('127.0.0.1', port), canBind('::1', port)]);
  return available.every(Boolean);
}
function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const port = server.address().port; server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
function connectProbe(host, port) {
  return new Promise(resolve => {
    const socket = net.connect({ host, port }); let done = false;
    const finish = value => { if (done) return; done = true; socket.destroy(); resolve(value); };
    socket.setTimeout(200); socket.once('connect', () => finish(host));
    socket.once('error', () => finish(null)); socket.once('timeout', () => finish(null));
  });
}
async function probePort(port) {
  const host = (await connectProbe('127.0.0.1', port)) || (await connectProbe('::1', port));
  if (!host) return null;
  // Refuse a listener reachable through a non-loopback interface (wildcard bind).
  const addresses = [...new Set(Object.values(os.networkInterfaces()).flat().filter(entry =>
    entry && !entry.internal && (entry.family === 'IPv4' || entry.family === 'IPv6')).map(entry =>
      entry.family === 'IPv6' && entry.scopeid ? `${entry.address}%${entry.scopeid}` : entry.address))];
  if ((await Promise.all(addresses.map(address => connectProbe(address, port)))).some(Boolean))
    throw failure('SSM_SESSION_FAILED');
  return host;
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function createSsmTunnelManager(dependencies = {}) {
  const platform = dependencies.platform || process.platform;
  const executable = dependencies.executable || (platform === 'win32' ? 'aws.exe' : 'aws');
  const pluginExecutable = dependencies.pluginExecutable || (platform === 'win32' ? 'session-manager-plugin.exe' : 'session-manager-plugin');
  const spawnImpl = dependencies.spawnImpl || spawn;
  const execFileImpl = dependencies.execFileImpl || execFile;
  const killGroup = dependencies.killGroup || process.kill.bind(process);
  const now = dependencies.now || Date.now;
  const reserve = dependencies.reservePort || reservePort;
  const free = dependencies.portFree || portFree;
  const probe = dependencies.probePort || probePort;
  const emitter = new EventEmitter(); const sessions = new Map();
  let operationSequence = 0;
  const environment = () => ({ ...process.env, AWS_PAGER: '', AWS_CLI_AUTO_PROMPT: 'off' });
  function check(signal, deadline) {
    if (signal?.aborted) throw failure('CONNECTION_CANCELED');
    if (now() >= deadline) throw failure('CONNECTION_TIMEOUT');
  }
  function cli(file, args, { signal, deadline, stage = 'prerequisites', missingCode = 'AWS_CLI_NOT_FOUND', maxBuffer = OUTPUT_LIMIT } = {}) {
    return new Promise((resolve, reject) => {
      try { check(signal, deadline); } catch (error) { reject(error); return; }
      let child; let settled = false;
      const finish = (error, value) => {
        if (settled) return; settled = true; clearTimeout(timer);
        signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(value);
      };
      const abort = () => { child?.kill?.(); finish(failure('CONNECTION_CANCELED', stage)); };
      const timeout = Math.max(1, Math.min(10_000, deadline - now()));
      const timer = setTimeout(() => { child?.kill?.(); finish(failure('CONNECTION_TIMEOUT', stage)); }, timeout);
      signal?.addEventListener('abort', abort, { once: true });
      try {
        child = execFileImpl(file, args, { shell: false, windowsHide: true, timeout,
          maxBuffer, encoding: 'utf8', env: environment() }, (error, stdout, stderr) => {
          if (signal?.aborted) return abort();
          if (error) {
            const code = error.code === 'ENOENT' ? missingCode : stage === 'aws_identity'
              ? 'AWS_IDENTITY_UNAVAILABLE' : error.killed ? 'CONNECTION_TIMEOUT' : classifyOutput(String(stderr || ''));
            return finish(failure(code, stage));
          }
          finish(null, stdout);
        });
      } catch (error) { finish(failure(error.code === 'ENOENT' ? missingCode : 'SSM_SESSION_FAILED', stage)); }
    });
  }
  const awsArgs = profile => ['--region', profile.awsRegion, ...(profile.awsProfile ? ['--profile', profile.awsProfile] : [])];
  async function preflight(profile, options) {
    options.onStage?.('prerequisites');
    await cli(executable, ['--version'], options);
    await cli(pluginExecutable, ['--version'], { ...options, missingCode: 'SSM_PLUGIN_NOT_FOUND' });
    options.onStage?.('aws_identity');
    await cli(executable, ['sts', 'get-caller-identity', ...awsArgs(profile), '--output', 'json'], { ...options, stage: 'aws_identity' });
  }
  async function killTree(child, deadline) {
    if (!child?.pid || !Number.isSafeInteger(child.pid) || child.pid <= 0) return;
    if (dependencies.killTree) return dependencies.killTree(child, deadline);
    if (platform === 'win32') {
      // PID is usable while ChildProcess still proves the root is alive. Descendants
      // captured earlier are revalidated by creation time before any fallback kill.
      if (child.exitCode == null && child.signalCode == null) {
        await cli('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { deadline, stage: 'tunnel' });
      }
    } else {
      try { killGroup(-child.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      await delay(100);
      try { killGroup(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    }
  }
  async function processSnapshot(deadline) {
    const script = "$p=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,@{n='Created';e={$_.CreationDate.ToUniversalTime().Ticks.ToString()}}; ConvertTo-Json -Compress -InputObject @($p)";
    const raw = await cli('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
      { deadline, stage: 'tunnel', maxBuffer: 256 * 1024 });
    const entries = JSON.parse(raw);
    return Array.isArray(entries) ? entries.filter(entry => Number.isSafeInteger(entry.ProcessId) &&
      entry.ProcessId > 0 && typeof entry.Created === 'string') : [];
  }
  function captureOwnedChildren(session) {
    if (platform !== 'win32' || dependencies.killTree) return;
    const capture = () => {
      if (session.capturePromise || session.state === 'closing' || session.state === 'closed') return;
      session.capturePromise = (async () => {
        const snapshot = await processSnapshot(now() + 2_000);
        if (session.child.exitCode != null || session.child.signalCode != null) return;
        const owned = new Set([session.child.pid]); let changed = true;
        while (changed) {
          changed = false;
          for (const entry of snapshot) if (owned.has(entry.ParentProcessId) && !owned.has(entry.ProcessId)) {
            owned.add(entry.ProcessId); changed = true;
          }
        }
        for (const entry of snapshot) if (owned.has(entry.ProcessId) && entry.ProcessId !== session.child.pid)
          session.descendants.set(entry.ProcessId, entry.Created);
      })().catch(() => { session.captureFailed = true; }).finally(() => { session.capturePromise = null; });
    };
    capture(); session.captureTimer = setInterval(capture, 1_000); session.captureTimer.unref?.();
  }
  function cleanup(session) {
    if (session.cleanupPromise) return session.cleanupPromise;
    session.state = 'closing'; session.abort.abort();
    clearInterval(session.captureTimer);
    session.cleanupPromise = (async () => {
      // Leave headroom within the public ten-second shutdown budget for DB drain.
      const deadline = now() + (dependencies.cleanupTimeoutMs ?? 6_000); let warning = false;
      if (session.capturePromise) await session.capturePromise;
      // Stop the owned process first; a final output chunk may identify a remotely created session.
      await killTree(session.child, Math.min(deadline, now() + 3_000)).catch(() => { warning = true; });
      if (platform === 'win32' && session.descendants.size && !dependencies.killTree) {
        try {
          const current = await processSnapshot(Math.min(deadline, now() + 2_000));
          for (const entry of current) if (session.descendants.get(entry.ProcessId) === entry.Created)
            await cli('taskkill.exe', ['/PID', String(entry.ProcessId), '/T', '/F'], { deadline, stage: 'tunnel' });
        } catch { warning = true; }
      }
      if (session.captureFailed) warning = true;
      if (session.sessionId) await cli(executable, ['ssm', 'terminate-session', '--session-id', session.sessionId,
        ...awsArgs(session.profile)], { deadline, stage: 'tunnel' }).catch(() => { warning = true; });
      if (session.port && session.ownsPort) {
        try {
          if (dependencies.waitPortClosed) {
            if (!await dependencies.waitPortClosed(session.port, deadline)) warning = true;
          } else {
            while (now() < deadline && !await free(session.port)) await delay(50);
            if (!await free(session.port)) warning = true;
          }
        } catch { warning = true; }
      }
      session.state = 'closed';
      if (sessions.get(session.key) === session) sessions.delete(session.key);
      return warning ? { cleanupWarning: 'Não foi possível confirmar o encerramento completo da sessão SSM.' } : {};
    })();
    return session.cleanupPromise;
  }
  function startProcess(session, options) {
    return new Promise((resolve, reject) => {
      let settled = false; let buffer = ''; let probing = false;
      const signal = session.abort.signal;
      const deadline = options.deadline;
      const finish = (error, host) => {
        if (settled) return; settled = true; clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve(host);
      };
      const abort = () => finish(failure('CONNECTION_CANCELED'));
      const timer = setTimeout(() => finish(failure('CONNECTION_TIMEOUT')), Math.max(1, deadline - now()));
      signal.addEventListener('abort', abort, { once: true });
      const args = ['ssm', 'start-session', ...awsArgs(session.profile), '--target', session.profile.ssmTarget,
        '--document-name', DOCUMENT, '--parameters', JSON.stringify({ host: [session.profile.host],
          portNumber: [String(session.profile.port)], localPortNumber: [String(session.port)] })];
      let child;
      try {
        child = spawnImpl(executable, args, { shell: false, windowsHide: true,
          detached: platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], env: environment() });
        session.child = child;
        captureOwnedChildren(session);
      } catch { finish(failure('SSM_SESSION_FAILED')); return; }
      const lost = error => {
        if (session.state === 'ready') {
          session.state = 'failed';
          emitter.emit('drop', { key: session.key, code: 'SSM_TUNNEL_LOST' });
          void cleanup(session);
        }
        finish(error);
      };
      child.on('error', error => lost(failure(error.code === 'ENOENT' ? 'AWS_CLI_NOT_FOUND' : 'SSM_SESSION_FAILED')));
      child.on('exit', () => lost(failure(classifyOutput(buffer))));
      const data = chunk => {
        if (session.state === 'closed') return;
        if (Buffer.byteLength(buffer) + chunk.length > OUTPUT_LIMIT) { finish(failure('SSM_SESSION_FAILED')); return; }
        buffer += chunk.toString('utf8');
        const parsed = parseSessionOutput(buffer, session.port);
        if (parsed.sessionId) session.sessionId = parsed.sessionId;
        if (session.state === 'closing') return;
        if (!parsed.ready || probing || settled) return;
        session.ownsPort = true;
        probing = true;
        void (async () => {
          while (!settled) {
            try {
              check(signal, deadline);
              if (child.exitCode != null || child.signalCode != null) throw failure('SSM_SESSION_FAILED');
              const host = await probe(session.port);
              check(signal, deadline);
              if (child.exitCode != null || child.signalCode != null) throw failure('SSM_SESSION_FAILED');
              if (host === '127.0.0.1' || host === '::1') { finish(null, host); return; }
              await delay(50);
            } catch (error) { finish(error); return; }
          }
        })();
      };
      child.stdout?.on('data', data); child.stderr?.on('data', data);
    });
  }
  async function open(session, options) {
    try {
      await preflight(session.profile, { ...options, signal: session.abort.signal });
      options.onStage?.('tunnel');
      const automatic = session.profile.ssmLocalPort == null;
      for (let candidate = 0; candidate < (automatic ? 3 : 1); candidate++) {
        check(session.abort.signal, options.deadline);
        session.port = automatic ? await reserve() : Number(session.profile.ssmLocalPort);
        if (!await free(session.port)) {
          if (automatic && candidate < 2) continue;
          throw failure('LOCAL_PORT_IN_USE');
        }
        try {
          session.host = await startProcess(session, options);
          check(session.abort.signal, options.deadline);
          session.state = 'ready'; return session;
        } catch (error) {
          if (error.code !== 'LOCAL_PORT_IN_USE' || !automatic || candidate === 2) throw error;
          // The failed process belongs to this attempt; never terminate an unrelated listener.
          if (session.sessionId) await cli(executable, ['ssm', 'terminate-session', '--session-id', session.sessionId,
            ...awsArgs(session.profile)], { deadline: options.deadline }).catch(() => {});
          await killTree(session.child, options.deadline).catch(() => {});
          session.child = null; session.sessionId = null;
        }
      }
      throw failure('LOCAL_PORT_IN_USE');
    } catch (error) {
      // The operation deadline and the resource cleanup budget are independent.
      // Main-process callers may observe this private promise during shutdown;
      // IPC receives only the original sanitized failure immediately.
      Object.defineProperty(error, 'cleanupPromise', { value: cleanup(session), enumerable: false });
      void error.cleanupPromise.catch(() => {});
      throw error;
    }
  }
  async function acquire(profile, options = {}) {
    validIamProfile(profile);
    if (!/^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/.test(profile.ssmTarget || '') ||
      (profile.ssmLocalPort != null && (!Number.isInteger(profile.ssmLocalPort) || profile.ssmLocalPort < 1 || profile.ssmLocalPort > 65535))) {
      throw new ConnectionError('INVALID_INPUT', 'prerequisites', 'Confira a instância EC2 e a porta local SSM.');
    }
    const deadline = options.deadline ?? now() + 60_000; check(options.signal, deadline);
    const key = transportKey(profile); let session = sessions.get(key);
    if (!session || !['opening', 'ready'].includes(session.state)) {
      session = { key, operationId: ++operationSequence, profile: { ...profile }, state: 'opening',
        abort: new AbortController(), leases: 0, waiters: 0, child: null, sessionId: null, descendants: new Map(), stageListeners: new Set() };
      if (options.onStage) session.stageListeners.add(options.onStage);
      sessions.set(key, session);
      session.promise = open(session, { ...options, deadline, onStage(stage) {
        session.stage = stage;
        for (const listener of session.stageListeners) { try { listener(stage); } catch {} }
      } });
    } else if (options.onStage) {
      session.stageListeners.add(options.onStage);
      if (session.stage) options.onStage(session.stage);
    }
    session.waiters++;
    let abandoned = false;
    let timeout;
    let abort;
    const cancellation = new Promise((resolve, reject) => {
      abort = () => { abandoned = true; reject(failure('CONNECTION_CANCELED')); };
      options.signal?.addEventListener('abort', abort, { once: true });
      timeout = setTimeout(() => { abandoned = true; reject(failure('CONNECTION_TIMEOUT')); }, Math.max(1, deadline - now()));
    });
    try {
      await Promise.race([session.promise, cancellation]); check(options.signal, deadline);
      if (session.state !== 'ready') throw failure('SSM_TUNNEL_LOST');
      session.leases++; let released = false;
      return { host: session.host, port: session.port, key, signal: session.abort.signal,
        get healthy() { return !released && session.state === 'ready'; },
        // Private to main-process callers; never serialize a lease over IPC.
        sessionId: session.sessionId,
        async release() {
          if (released) return session.cleanupPromise ? session.cleanupPromise : {};
          released = true; session.leases--;
          return session.leases === 0 && session.waiters === 0 ? cleanup(session) : {};
        } };
    } finally {
      clearTimeout(timeout); options.signal?.removeEventListener('abort', abort); session.waiters--;
      if (options.onStage) session.stageListeners.delete(options.onStage);
      if (abandoned && session.waiters === 0 && session.leases === 0) {
        void cleanup(session).catch(() => {});
      }
    }
  }
  emitter.acquire = acquire;
  emitter.close = key => sessions.has(key) ? cleanup(sessions.get(key)) : Promise.resolve({});
  emitter.closeAll = async () => {
    const results = await Promise.all([...sessions.values()].map(cleanup));
    return results.find(result => result.cleanupWarning) || {};
  };
  return emitter;
}
module.exports = { createSsmTunnelManager, transportKey, parseSessionOutput };
