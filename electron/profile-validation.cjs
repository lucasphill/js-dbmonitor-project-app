const path = require("node:path");

const PROFILE_FIELDS = new Set([
  "label", "host", "port", "database", "dbUser", "authMode",
  "awsRegion", "awsProfile", "tlsCaMode", "tlsCaPath", "ssmTarget", "ssmLocalPort",
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


function validPort(value, field) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new ProfileInputError(field + ' inválida');
  return value;
}
function validRegion(value) {
  value = requiredText(value, 'Região AWS', 32);
  if (!REGIONS.test(value)) throw new ProfileInputError('Região AWS inválida');
  return value;
}
function validAwsProfile(value) {
  value = requiredText(value, 'Perfil AWS', 128);
  if (!AWS_PROFILE.test(value)) throw new ProfileInputError('Perfil AWS inválido');
  return value;
}
function validSsmTarget(value) {
  value = requiredText(value, 'Instância SSM', 19);
  if (!/^i-(?:[0-9a-f]{8}|[0-9a-f]{17})$/.test(value)) throw new ProfileInputError('Instância SSM inválida');
  return value;
}
function validRdsHost(value, region) {
  const host = validHost(value);
  if (!/^.+\.[a-z]{2}(?:-[a-z]+)+-\d+\.rds\.amazonaws\.com(?:\.cn)?$/.test(host)) throw new ProfileInputError('Use o endpoint original do RDS na região informada');
  if (region !== undefined) {
    const suffix = '.' + region + '.rds.amazonaws.com';
    if (!(host.endsWith(suffix) || host.endsWith(suffix + '.cn'))) throw new ProfileInputError('Use o endpoint original do RDS na região informada');
  }
  return host;
}
function validateSsmImportPatch(input) {
  if (!plainObject(input)) throw new ProfileInputError('Importação inválida');
  const validators = {host:validRdsHost,port:(v)=>validPort(v,'Porta'),awsRegion:validRegion,awsProfile:validAwsProfile,ssmTarget:validSsmTarget,ssmLocalPort:(v)=>validPort(v,'Porta local')};
  const result = {};
  for (const field of Object.keys(input)) {
    if (!Object.hasOwn(validators, field)) throw new ProfileInputError('Campo de importação inválido');
    result[field] = validators[field](input[field]);
  }
  if (Object.hasOwn(result,'host') && Object.hasOwn(result,'awsRegion')) validRdsHost(result.host,result.awsRegion);
  return result;
}

function validateProfileDraft(input, { allowLegacy = false } = {}) {
  if (!plainObject(input)) throw new ProfileInputError("Perfil inválido");
  for (const field of Object.keys(input)) {
    if (!PROFILE_FIELDS.has(field)) throw new ProfileInputError(`Campo de perfil inválido: ${field}`);
  }
  const label = requiredText(input.label, "Nome", 80);
  const host = validHost(input.host);
  const port = input.port;
  validPort(port, "Porta");
  const database = requiredText(input.database, "Banco", 63);
  const dbUser = requiredText(input.dbUser, "Usuário PostgreSQL", 63);
  const authMode = input.authMode;
  if (!["rds_iam", "rds_iam_ssm", "session_password", ...(allowLegacy ? ["legacy_env"] : [])].includes(authMode)) {
    throw new ProfileInputError("Modo de autenticação inválido");
  }
  let awsRegion = null;
  let awsProfile = null;
  let tlsCaMode = null;
  let tlsCaPath = null;
  if (isRdsIamProfile({ authMode })) {
    awsRegion = validRegion(input.awsRegion);
    validRdsHost(host, awsRegion);
    if (input.awsProfile === "") throw new ProfileInputError("Informe o nome do perfil AWS selecionado");
    if (input.awsProfile != null) {
      awsProfile = validAwsProfile(input.awsProfile);
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
  let ssmTarget = null;
  let ssmLocalPort = null;
  if (authMode === "rds_iam_ssm") {
    ssmTarget = validSsmTarget(input.ssmTarget);
    ssmLocalPort = input.ssmLocalPort == null ? null : input.ssmLocalPort;
    if (ssmLocalPort !== null) validPort(ssmLocalPort, "Porta local");
  } else if (input.ssmTarget != null || input.ssmLocalPort != null) {
    throw new ProfileInputError("Campos SSM não pertencem a este modo de autenticação");
  }
  return { label, host, port, database, dbUser, authMode, awsRegion, awsProfile, tlsCaMode, tlsCaPath, ssmTarget, ssmLocalPort };
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

function isRdsIamProfile(profile) { return ["rds_iam", "rds_iam_ssm"].includes(profile?.authMode); }
const IDENTITY_FIELDS = ["host", "port", "database", "dbUser", "authMode", "awsRegion", "awsProfile", "tlsCaMode", "tlsCaPath"];
function profileIdentityChanged(current, next) {
  return IDENTITY_FIELDS.some((key) => Object.hasOwn(next, key) && (next[key] ?? null) !== (current[key] ?? null));
}
function profileTransportChanged(current, next) {
  return profileIdentityChanged(current, next) || ["ssmTarget", "ssmLocalPort"].some((key) => Object.hasOwn(next, key) && (next[key] ?? null) !== (current[key] ?? null));
}
module.exports = { validateSsmImportPatch, ProfileInputError, validateProfileDraft, validateProfileChanges, validateTransientPassword,
  isRdsIamProfile, profileIdentityChanged, profileTransportChanged };
