const path = require("node:path");

const PROFILE_FIELDS = new Set([
  "label", "host", "port", "database", "dbUser", "authMode",
  "awsRegion", "awsProfile", "tlsCaMode", "tlsCaPath",
]);
const REGIONS = /^[a-z]{2}(?:-[a-z]+)+-\d+$/;
const AWS_PROFILE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const DNS_LABEL = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;

class ProfileInputError extends Error {
  constructor(message, code = "INVALID_INPUT") {
    super(message);
    this.code = code;
  }
}

function plainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function requiredText(value, field, max) {
  if (typeof value !== "string" || value !== value.trim() || value.length < 1 || value.length > max ||
      /[\x00-\x1f\x7f]/.test(value)) throw new ProfileInputError(`${field} inválido`);
  return value;
}

function validHost(value) {
  const host = requiredText(value, "Endpoint", 253).toLowerCase();
  if (host === "localhost") return host;
  if (host.includes(":") || host.includes("/") || host.includes("\\") || host.includes(" ") ||
      !host.split(".").every((part) => DNS_LABEL.test(part))) {
    throw new ProfileInputError("Endpoint inválido");
  }
  return host;
}

function validateProfileDraft(input, { allowLegacy = false } = {}) {
  if (!plainObject(input)) throw new ProfileInputError("Perfil inválido");
  for (const field of Object.keys(input)) {
    if (!PROFILE_FIELDS.has(field)) throw new ProfileInputError(`Campo de perfil inválido: ${field}`);
  }
  const label = requiredText(input.label, "Nome", 80);
  const host = validHost(input.host);
  const port = input.port;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ProfileInputError("Porta inválida");
  const database = requiredText(input.database, "Banco", 63);
  const dbUser = requiredText(input.dbUser, "Usuário PostgreSQL", 63);
  const authMode = input.authMode;
  if (!["rds_iam", "session_password", ...(allowLegacy ? ["legacy_env"] : [])].includes(authMode)) {
    throw new ProfileInputError("Modo de autenticação inválido");
  }
  let awsRegion = null;
  let awsProfile = null;
  let tlsCaMode = null;
  let tlsCaPath = null;
  if (authMode === "rds_iam") {
    awsRegion = requiredText(input.awsRegion, "Região AWS", 32);
    if (!REGIONS.test(awsRegion)) throw new ProfileInputError("Região AWS inválida");
    const suffix = `.${awsRegion}.rds.amazonaws.com`;
    const chinaSuffix = `${suffix}.cn`;
    if (!(host.endsWith(suffix) || host.endsWith(chinaSuffix)) ||
        host.length <= (host.endsWith(chinaSuffix) ? chinaSuffix.length : suffix.length)) {
      throw new ProfileInputError("Use o endpoint original do RDS na região informada");
    }
    if (input.awsProfile === "") throw new ProfileInputError("Informe o nome do perfil AWS selecionado");
    if (input.awsProfile != null) {
      awsProfile = requiredText(input.awsProfile, "Perfil AWS", 128);
      if (!AWS_PROFILE.test(awsProfile)) throw new ProfileInputError("Perfil AWS inválido");
    }
    tlsCaMode = input.tlsCaMode == null ? "bundled" : input.tlsCaMode;
    if (!["bundled", "custom"].includes(tlsCaMode)) throw new ProfileInputError("Configuração TLS inválida");
    if (tlsCaMode === "custom") {
      tlsCaPath = requiredText(input.tlsCaPath, "Certificado CA", 2048);
      if (!path.isAbsolute(tlsCaPath) || !/\.(?:pem|crt)$/i.test(tlsCaPath)) {
        throw new ProfileInputError("Caminho do certificado CA inválido");
      }
    } else if (input.tlsCaPath != null && input.tlsCaPath !== "") {
      throw new ProfileInputError("Certificado CA inesperado");
    }
  } else if ([input.awsRegion, input.awsProfile, input.tlsCaMode, input.tlsCaPath].some((value) => value != null && value !== "")) {
    throw new ProfileInputError("Campos AWS/TLS não pertencem a este modo de autenticação");
  }
  return { label, host, port, database, dbUser, authMode, awsRegion, awsProfile, tlsCaMode, tlsCaPath };
}

function validateProfileChanges(current, changes) {
  if (!plainObject(changes) || Object.keys(changes).length === 0) throw new ProfileInputError("Alterações inválidas");
  for (const field of Object.keys(changes)) {
    if (!PROFILE_FIELDS.has(field)) throw new ProfileInputError(`Campo de perfil inválido: ${field}`);
  }
  if (current.authMode === "legacy_env" && Object.keys(changes).some((field) => field !== "label")) {
    throw new ProfileInputError("O perfil legado permite apenas renomear; crie outro perfil para uma nova origem");
  }
  const merged = Object.fromEntries([...PROFILE_FIELDS].map((field) => [field, current[field]]));
  Object.assign(merged, changes);
  return validateProfileDraft(merged, { allowLegacy: current.authMode === "legacy_env" });
}

function validateTransientPassword(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096 || value.includes("\0")) {
    throw new ProfileInputError("Senha de sessão inválida");
  }
  return value;
}

function createProfileController({ storage, db, collectorFactory }) {
  if (!storage || !db || typeof collectorFactory !== "function") throw new TypeError("Controller dependencies required");
  let activeProfile = null;
  let collector = null;
  let generation = 0;
  let queue = Promise.resolve();
  const passwords = new Map();

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
    return { profile: activeProfile, generation, collector };
  }

  async function start() {
    return serial(async () => {
      const profile = storage.getProfile(storage.getActiveProfileId());
      if (!profile || profile.archivedAt) throw new ProfileInputError("Perfil ativo indisponível", "PROFILE_NOT_FOUND");
      await db.setActiveProfile(profile, passwords.get(profile.id));
      activeProfile = profile;
      generation += 1;
      collector = collectorFactory(profile);
      collector.start();
      return { profile, generation };
    });
  }

  async function switchTo(id) {
    return serial(async () => {
      const profile = storage.getProfile(id);
      if (!profile) throw new ProfileInputError("Perfil não encontrado", "PROFILE_NOT_FOUND");
      if (profile.archivedAt) throw new ProfileInputError("Perfil arquivado", "PROFILE_ARCHIVED");
      if (activeProfile?.id === id) return { profile: activeProfile, generation };
      const before = activeProfile;
      const previousCollector = collector;
      await previousCollector?.stopAndWait();
      try {
        await db.setActiveProfile(profile, passwords.get(id));
        storage.setActiveProfileId(id);
      } catch (error) {
        if (before) {
          await db.setActiveProfile(before, passwords.get(before.id));
          previousCollector?.start();
        }
        throw error;
      }
      activeProfile = profile;
      generation += 1;
      collector = collectorFactory(profile);
      collector.start();
      return { profile, generation };
    });
  }

  async function update(id, changes, confirmNewOrigin = false) {
    return serial(async () => {
      const existing = storage.getProfile(id);
      if (!existing) throw new ProfileInputError("Perfil não encontrado", "PROFILE_NOT_FOUND");
      if (existing.archivedAt) throw new ProfileInputError("Perfil arquivado", "PROFILE_ARCHIVED");
      const validated = validateProfileChanges(existing, changes);
      const identityChanged = Object.keys(validated).some((key) => key !== "label" && validated[key] !== existing[key]);
      if (identityChanged && !confirmNewOrigin) throw new ProfileInputError("Confirme a criação de uma nova origem histórica");
      const activeWasEdited = activeProfile?.id === id;
      if (activeWasEdited && identityChanged && validated.authMode !== "session_password") {
        // Validate the CA and connection shape before storage commits the new identity.
        db.connectionConfig(validated);
      }
      let result;
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
    await serial(async () => {
      await collector?.stopAndWait();
      passwords.clear();
      await db.closeDatabase();
    });
  }

  return { start, switchTo, update, setPassword, guardAdmin, assertContext,
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
    test: (draftOrId, transientPassword) => {
      const profile = typeof draftOrId === "number" ? storage.getProfile(draftOrId) : validateProfileDraft(draftOrId);
      if (!profile || profile.archivedAt) throw new ProfileInputError("Perfil indisponível", "PROFILE_NOT_FOUND");
      const password = transientPassword == null ? passwords.get(profile.id) : validateTransientPassword(transientPassword);
      return db.testConnection(profile, password);
    },
  };
}

module.exports = {
  ProfileInputError, validateProfileDraft, validateProfileChanges, validateTransientPassword,
  createProfileController,
};
