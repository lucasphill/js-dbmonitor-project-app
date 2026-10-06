const { randomUUID } = require('node:crypto');
const { ProfileInputError, validateProfileDraft, validateProfileChanges, validateTransientPassword, isRdsIamProfile, profileIdentityChanged, profileTransportChanged } = require('./profile-validation.cjs');

function createProfileController({ storage, db, collectorFactory, tunnelManager, onConnectionState = () => {} }) {
  if (!storage || !db || typeof collectorFactory !== "function") throw new TypeError("Controller dependencies required");
  let activeProfile = null;
  let collector = null;
  let generation = 0;
  let queue = Promise.resolve();
  const passwords = new Map();
  const tests = new Map();
  const manager = tunnelManager || require('./aws-ssm-tunnel.cjs').createSsmTunnelManager();
  let lease = null;
  let attempt = null;
  let revision = 0;
  let runtime = null;
  let stopped = false;

  function status(state, stage = 'complete', extra = {}) {
    runtime = { sourceContext: publicContext(), revision: ++revision, state, stage,
      changedAt: new Date().toISOString(), ...extra };
    onConnectionState(runtime);
    return runtime;
  }

  function getConnectionStatus() {
    return runtime || { sourceContext: publicContext(), revision, state: activeProfile?.authMode === 'rds_iam_ssm' ? 'disconnected' : 'connected',
      stage: 'complete', changedAt: new Date().toISOString() };
  }

  async function releaseActive() {
    const owned = lease;
    lease = null;
    if (!owned) return;
    // Explicit disconnect invalidates dependent test leases, not unrelated tests.
    try {
      if (typeof manager.close === 'function') return await manager.close(owned.key);
      return await owned.release();
    } catch { return { cleanupWarning: 'Não foi possível confirmar o encerramento completo da sessão SSM.' }; }
  }

  async function openSsm() {
    const control = new AbortController();
    attempt = control;
    const expected = publicContext();
    const deadline = Date.now() + 60_000;
    const timer = setTimeout(() => {
      status('failed', 'tunnel', { code: 'CONNECTION_TIMEOUT', message: 'A conexão excedeu o tempo limite.' });
      control.abort(new Error('deadline'));
    }, 60_000);
    let acquired;
    status('connecting', 'prerequisites');
    try {
      acquired = await manager.acquire(activeProfile, { signal: control.signal, deadline,
        onStage: (stage) => { if (!control.signal.aborted) status('connecting', stage); } });
      if (control.signal.aborted || stopped) throw new ProfileInputError('Conexão cancelada', 'CONNECTION_CANCELED');
      assertContext(expected);
      lease = acquired;
      await db.setActiveProfile(activeProfile, null, { transport: acquired });
      const result = await db.testConnection(activeProfile, null, { transport: acquired,
        signal: control.signal, deadline, onStage: (stage) => {
          if (!control.signal.aborted) status('connecting', stage);
        } });
      if (control.signal.aborted || stopped) throw new ProfileInputError('Conexão cancelada', 'CONNECTION_CANCELED');
      assertContext(expected);
      if (result.status !== 'success') throw Object.assign(new Error(result.message), { code: result.code, stage: result.stage });
      status('connected', 'complete', { effectiveLocalPort: acquired.port });
      collector.start();
    } catch (error) {
      await db.invalidateTransport?.();
      let cleanup;
      try { cleanup = lease ? await releaseActive() : await acquired?.release(); }
      catch { cleanup = { cleanupWarning: 'Não foi possível confirmar o encerramento completo da sessão SSM.' }; }
      const lost = control.signal.reason?.message === 'tunnel-lost';
      const canceled = control.signal.aborted && !lost && control.signal.reason?.message !== 'deadline';
      const code = lost ? 'SSM_TUNNEL_LOST' : canceled ? 'CONNECTION_CANCELED' : control.signal.aborted ? 'CONNECTION_TIMEOUT' : error.code || 'SSM_SESSION_FAILED';
      const safe = require('./ipc.cjs').safeError({ code });
      status(canceled ? 'disconnected' : 'failed', error.stage || 'tunnel', {
        code: safe.code, message: safe.message, ...((cleanup?.cleanupWarning || error.cleanupWarning) ? { cleanupWarning: cleanup?.cleanupWarning || error.cleanupWarning } : {}) });
    } finally {
      clearTimeout(timer);
      if (attempt === control) attempt = null;
    }
    return { profile: activeProfile, generation, runtime: getConnectionStatus() };
  }

  async function activateSsm(profile) {
    if (activeProfile?.authMode === 'rds_iam_ssm') await db.invalidateTransport?.();
    await collector?.stopAndWait();
    await db.closeDatabase({ preserveProfile: true });
    await releaseActive();
    activeProfile = profile;
    generation += 1;
    storage.setActiveProfileId?.(profile.id);
    await db.setActiveProfile(profile);
    collector = collectorFactory(profile);
    return openSsm();
  }

  function onDrop(event) {
    if (!lease || event.key !== lease.key || stopped) return;
    attempt?.abort();
    status('failed', 'tunnel', { code: 'SSM_TUNNEL_LOST', message: 'O túnel SSM foi interrompido. Reconecte para retomar a coleta.' });
    // Reject queries immediately; draining the current cycle happens in the queue.
    void db.invalidateTransport?.();
    void serial(async () => { await collector?.stopAndWait(); await releaseActive(); }).catch(() => {});
  }
  manager.on?.('drop', onDrop);

  function serial(task) {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  }

  function publicContext() {
    if (!activeProfile) throw new ProfileInputError("Nenhum perfil ativo", "PROFILE_NOT_FOUND");
    return { profileId: activeProfile.id, generation };
  }

  function current() {
    return { profile: activeProfile, generation, collector, runtime };
  }

  async function start() {
    return serial(async () => {
      const profile = storage.getProfile(storage.getActiveProfileId());
      if (!profile || profile.archivedAt) throw new ProfileInputError("Perfil ativo indisponível", "PROFILE_NOT_FOUND");
      if (profile.authMode === 'rds_iam_ssm') return activateSsm(profile);
      await db.setActiveProfile(profile, passwords.get(profile.id));
      activeProfile = profile;
      generation += 1;
      collector = collectorFactory(profile);
      collector.start();
      runtime = null;
      return { profile, generation };
    });
  }

  const selectionFlights = new Map();
  function switchTo(id) {
    if (selectionFlights.has(id)) return selectionFlights.get(id);
    const pending = switchToImpl(id).finally(() => selectionFlights.delete(id));
    selectionFlights.set(id, pending);
    return pending;
  }
  async function switchToImpl(id) {
    if (attempt && activeProfile?.id !== id) attempt.abort();
    return serial(async () => {
      const profile = storage.getProfile(id);
      if (!profile) throw new ProfileInputError("Perfil não encontrado", "PROFILE_NOT_FOUND");
      if (profile.archivedAt) throw new ProfileInputError("Perfil arquivado", "PROFILE_ARCHIVED");
      if (profile.authMode === 'rds_iam_ssm') {
        if (activeProfile?.id === id && runtime?.state === 'connected') return { profile: activeProfile, generation, runtime };
        return activateSsm(profile);
      }
      if (activeProfile?.id === id) return { profile: activeProfile, generation };
      const before = activeProfile;
      const previousCollector = collector;
      if (before?.authMode === 'rds_iam_ssm') await db.invalidateTransport?.();
      await previousCollector?.stopAndWait();
      await releaseActive();
      try {
        await db.setActiveProfile(profile, passwords.get(id));
        storage.setActiveProfileId(id);
      } catch (error) {
        if (before) {
          await db.setActiveProfile(before, passwords.get(before.id));
          if (before.authMode === 'rds_iam_ssm') status('failed', 'tunnel', {
            code: 'SSM_TUNNEL_LOST', message: 'A origem anterior precisa ser reconectada.' });
          else previousCollector?.start();
        }
        throw error;
      }
      activeProfile = profile;
      generation += 1;
      collector = collectorFactory(profile);
      collector.start();
      runtime = null;
      return { profile, generation };
    });
  }

  async function update(id, changes, confirmNewOrigin = false) {
    return serial(async () => {
      const existing = storage.getProfile(id);
      if (!existing) throw new ProfileInputError("Perfil não encontrado", "PROFILE_NOT_FOUND");
      if (existing.archivedAt) throw new ProfileInputError("Perfil arquivado", "PROFILE_ARCHIVED");
      const validated = validateProfileChanges(existing, changes);
      const identityChanged = profileIdentityChanged(existing, validated);
      const transportChanged = profileTransportChanged(existing, validated);
      if (identityChanged && !confirmNewOrigin) throw new ProfileInputError("Confirme a criação de uma nova origem histórica");
      const activeWasEdited = activeProfile?.id === id;
      if (activeWasEdited && identityChanged && validated.authMode !== "session_password" && validated.authMode !== 'rds_iam_ssm') {
        // Validate the CA and connection shape before storage commits the new identity.
        db.connectionConfig(validated);
      }
      let result;
      if (activeWasEdited && (existing.authMode === 'rds_iam_ssm' || validated.authMode === 'rds_iam_ssm') && transportChanged) {
        result = storage.updateProfile(id, validated, confirmNewOrigin);
        if (result.profile.authMode === 'rds_iam_ssm') await activateSsm(result.profile);
        else {
          await collector?.stopAndWait(); await db.closeDatabase({ preserveProfile: true }); await releaseActive();
          activeProfile = result.profile; generation += 1; runtime = null;
          await db.setActiveProfile(activeProfile); collector = collectorFactory(activeProfile); collector.start();
        }
        return result;
      }
      try {
        if (activeWasEdited && identityChanged) {
          await collector?.stopAndWait();
          // Repoint the pool before committing the new identity. If storage rejects
          // the change, restore the previous pool and collector below.
          await db.setActiveProfile(validated);
        }
        result = storage.updateProfile(id, validated, confirmNewOrigin);
        if (activeWasEdited) {
          activeProfile = result.profile;
          if (identityChanged) {
            generation += 1;
            collector = collectorFactory(result.profile);
            collector.start();
          }
        }
      } catch (error) {
        if (activeWasEdited && identityChanged) {
          await db.setActiveProfile(existing, passwords.get(id));
          collector?.start();
        }
        throw error;
      }
      return result;
    });
  }

  async function setPassword(id, value) {
    return serial(async () => {
      const profile = storage.getProfile(id);
      if (!profile || profile.archivedAt) throw new ProfileInputError("Perfil indisponível", "PROFILE_NOT_FOUND");
      if (profile.authMode !== "session_password") throw new ProfileInputError("Este perfil não usa senha de sessão");
      const password = validateTransientPassword(value);
      passwords.set(id, password);
      if (activeProfile?.id === id) {
        await collector?.stopAndWait();
        await db.setActiveProfile(profile, password);
        generation += 1;
        collector = collectorFactory(profile);
        collector.start();
      }
      return { accepted: true };
    });
  }

  function assertContext(expected) {
    if (!expected || expected.profileId !== activeProfile?.id || expected.generation !== generation) {
      throw new ProfileInputError("A origem ativa mudou", "PROFILE_CHANGED");
    }
  }

  function guardAdmin(expected, operation) {
    return serial(async () => {
      assertContext(expected);
      return operation();
    });
  }

  async function stop() {
    stopped = true;
    attempt?.abort();
    for (const control of tests.values()) control.abort();
    if (activeProfile?.authMode === 'rds_iam_ssm') await db.invalidateTransport?.();
    await serial(async () => {
      await collector?.stopAndWait();
      passwords.clear();
      await db.closeDatabase({ preserveProfile: true });
      await releaseActive();
      await manager.closeAll();
      manager.off?.('drop', onDrop);
    });
  }

  async function disconnect(expected) {
    assertContext(expected);
    if (activeProfile.authMode !== 'rds_iam_ssm') throw new ProfileInputError('Este perfil não usa SSM');
    attempt?.abort();
    return serial(async () => {
      assertContext(expected);
      await db.invalidateTransport?.();
      await collector?.stopAndWait();
      const cleanup = await releaseActive();
      return status('disconnected', 'complete', cleanup?.cleanupWarning ? { cleanupWarning: cleanup.cleanupWarning } : {});
    });
  }

  async function reconnect(expected) {
    assertContext(expected);
    attempt?.abort();
    return serial(async () => {
      assertContext(expected);
      if (activeProfile.authMode !== 'rds_iam_ssm') throw new ProfileInputError('Este perfil não usa SSM');
      return activateSsm(activeProfile);
    });
  }

  function cancelTest(id) {
    const control = tests.get(id);
    control?.abort();
    return { canceled: Boolean(control) };
  }

  function refreshNow() {
    if (activeProfile?.authMode === 'rds_iam_ssm' && runtime?.state !== 'connected') {
      return Promise.resolve({ state: 'failed', reason: runtime?.message || 'Conexão SSM desconectada' });
    }
    return collector.refreshNow();
  }

  return { start, switchTo, update, setPassword, guardAdmin, assertContext,
    getConnectionStatus, disconnect, reconnect, cancelTest, cancelConnect: disconnect, refreshNow,
    publicContext, current, stop, list: (includeArchived = false) => ({
      profiles: storage.listProfiles({ includeArchived }),
      activeProfileId: activeProfile?.id ?? storage.getActiveProfileId(), generation,
    }),
    create: (draft) => storage.createProfile(validateProfileDraft(draft)),
    archive: (id, confirmed) => serial(() => {
      if (!confirmed) throw new ProfileInputError("Confirmação necessária");
      if (id === activeProfile?.id) throw new ProfileInputError("Selecione outro perfil antes de arquivar o ativo");
      storage.archiveProfile(id);
      passwords.delete(id);
      return { archivedId: id, activeProfileId: activeProfile?.id };
    }),
    test: async (draftOrId, transientPassword, options = {}) => {
      const profile = typeof draftOrId === "number" ? storage.getProfile(draftOrId) : validateProfileDraft(draftOrId);
      if (!profile || profile.archivedAt) throw new ProfileInputError("Perfil indisponível", "PROFILE_NOT_FOUND");
      if (isRdsIamProfile(profile) && transientPassword != null) throw new ProfileInputError('Este perfil não usa senha de sessão');
      const password = transientPassword == null ? passwords.get(profile.id) : validateTransientPassword(transientPassword);
      if (profile.authMode !== 'rds_iam_ssm') return db.testConnection(profile, password);
      const id = options.requestId || randomUUID();
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id) || tests.has(id)) throw new ProfileInputError('Identificador de teste inválido');
      const control = new AbortController();
      tests.set(id, control);
      const deadline = Date.now() + 60_000;
      const timer = setTimeout(() => control.abort(new Error('deadline')), 60_000);
      let owned;
      let result;
      try {
        owned = await manager.acquire(profile, { signal: control.signal, deadline });
        result = await db.testConnection(profile, null, { transport: owned, signal: control.signal, deadline });
        if (control.signal.aborted) throw new Error('aborted');
      } catch (error) {
        const code = control.signal.aborted ? (control.signal.reason?.message === 'deadline' ? 'CONNECTION_TIMEOUT' : 'CONNECTION_CANCELED') : error.code || 'SSM_SESSION_FAILED';
        const safe = require('./ipc.cjs').safeError({ code });
        result = { status: 'failed', stage: error.stage || 'tunnel', code: safe.code, message: safe.message,
          checkedAt: new Date().toISOString(), ...(code === 'CONNECTION_CANCELED' ? { canceled: true } : {}) };
      } finally {
        clearTimeout(timer); tests.delete(id);
        let cleanup;
        try { cleanup = await owned?.release(); }
        catch { cleanup = { cleanupWarning: 'Não foi possível confirmar o encerramento completo da sessão SSM.' }; }
        if (cleanup?.cleanupWarning && result) result.cleanupWarning = cleanup.cleanupWarning;
      }
      return { ...result, requestId: id };
    },
  };
}

module.exports = {
  ProfileInputError, validateProfileDraft, validateProfileChanges, validateTransientPassword,
  createProfileController,
};
