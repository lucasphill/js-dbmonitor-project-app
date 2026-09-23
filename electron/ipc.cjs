const path = require("node:path");
const { ProfileInputError } = require("./connection-profiles.cjs");

const MAX_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
const SORT_COLUMNS = new Set(["duration", "startedAt", "database", "user", "state", "pid"]);
const DATABASE_SORT_COLUMNS = new Set(["name", "size", "owner", "encoding", "collation", "connections", "connectionLimit", "status"]);
const DATASETS = new Set(["database-activity", "sessions", "logs"]);

class IpcInputError extends Error {
  constructor(message, code = "INVALID_INPUT") {
    super(message);
    this.code = code;
  }
}

function assertOrigin(event, dev) {
  const frame = event?.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) throw new IpcInputError("Origem não autorizada", "FORBIDDEN");
  let url;
  try { url = new URL(frame.url); } catch { throw new IpcInputError("Origem não autorizada", "FORBIDDEN"); }
  const allowed = dev
    ? url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "3000"
    : url.protocol === "bdash:" && url.hostname === "app";
  if (!allowed) throw new IpcInputError("Origem não autorizada", "FORBIDDEN");
}

function string(value, field, max = 200) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > max) throw new IpcInputError(`${field} inválido`);
  return value.trim();
}

function isoDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT/.test(value)) throw new IpcInputError(`${field} inválido`);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) throw new IpcInputError(`${field} inválido`);
  return new Date(time).toISOString();
}

function positiveInteger(value, field, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new IpcInputError(`${field} inválido`);
  return value;
}

function profileId(value) {
  return positiveInteger(value, "Perfil", 2_147_483_647);
}

function sourceContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new IpcInputError("Origem da operação inválida", "PROFILE_CHANGED");
  }
  return { profileId: profileId(value.profileId),
    generation: positiveInteger(value.generation, "Geração", 2_147_483_647) };
}

function confirmation(value) {
  if (value !== true) throw new IpcInputError("Confirmação necessária");
  return true;
}

function sessionActionIdentity(value) {
  const identity = sessionIdentity(value);
  return { ...identity, profileId: profileId(value.profileId),
    generation: positiveInteger(value.generation, "Geração", 2_147_483_647) };
}

function period(value, { optional = false } = {}) {
  if ((value === undefined || value === null) && optional) {
    return { from: new Date(Date.now() - 60 * 60 * 1000).toISOString(), to: new Date().toISOString() };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IpcInputError("Período inválido");
  const from = isoDate(value.from, "Início do período");
  const to = isoDate(value.to, "Fim do período");
  const span = Date.parse(to) - Date.parse(from);
  if (span <= 0 || span > MAX_PERIOD_MS || Date.parse(to) > Date.now() + 60_000) throw new IpcInputError("Período fora do limite");
  return { from, to };
}

function page(value) {
  if (value === undefined || value === null) return { limit: 50, cursor: "0" };
  if (typeof value !== "object" || Array.isArray(value)) throw new IpcInputError("Página inválida");
  const limit = positiveInteger(value.limit, "Limite da página", 200);
  const cursor = value.cursor === undefined ? "0" : string(value.cursor, "Cursor", 12);
  if (!/^\d+$/.test(cursor) || Number(cursor) > 10_000_000) throw new IpcInputError("Cursor inválido");
  return { limit, cursor };
}

function sessionIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IpcInputError("Sessão inválida");
  const backendStart = value.backendStart;
  if (typeof backendStart !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(backendStart) || !Number.isFinite(Date.parse(backendStart))) {
    throw new IpcInputError("Início da sessão inválido");
  }
  return { pid: positiveInteger(value.pid, "PID", 2_147_483_647), backendStart };
}

function sessionFilters(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IpcInputError("Filtros inválidos");
  const sortBy = value.sortBy === undefined ? "duration" : string(value.sortBy, "Ordenação", 30);
  if (!SORT_COLUMNS.has(sortBy)) throw new IpcInputError("Ordenação inválida");
  const sortDirection = value.sortDirection === undefined ? "desc" : string(value.sortDirection, "Direção", 4);
  if (!new Set(["asc", "desc"]).has(sortDirection)) throw new IpcInputError("Direção inválida");
  return {
    database: string(value.database, "Banco", 128),
    user: string(value.user, "Usuário", 128),
    application: string(value.application, "Aplicação", 128),
    state: string(value.state, "Estado", 64),
    search: string(value.search, "Busca", 200),
    sortBy, sortDirection, page: page(value.page),
  };
}

function databaseInventoryFilters(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IpcInputError("Filtros de bancos inválidos");
  const sortBy = value.sortBy === undefined ? "name" : string(value.sortBy, "Ordenação", 30);
  if (!DATABASE_SORT_COLUMNS.has(sortBy)) throw new IpcInputError("Ordenação inválida");
  const sortDirection = value.sortDirection === undefined ? "asc" : string(value.sortDirection, "Direção", 4);
  if (sortDirection !== "asc" && sortDirection !== "desc") throw new IpcInputError("Direção inválida");
  const status = value.status === undefined ? undefined : string(value.status, "Estado", 20);
  if (status !== undefined && !["available", "blocked", "template"].includes(status)) {
    throw new IpcInputError("Estado inválido");
  }
  return {
    search: string(value.search, "Busca", 200),
    owner: string(value.owner, "Proprietário", 128),
    encoding: string(value.encoding, "Codificação", 64),
    status, sortBy, sortDirection, page: page(value.page),
  };
}

function logFilters(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IpcInputError("Filtros inválidos");
  return {
    period: period(value.period),
    severity: string(value.severity, "Severidade", 32),
    database: string(value.database, "Banco", 128),
    user: string(value.user, "Usuário", 128),
    pid: value.pid === undefined ? undefined : positiveInteger(value.pid, "PID", 2_147_483_647),
    search: string(value.search, "Busca", 200),
    page: page(value.page),
  };
}

function preferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IpcInputError("Preferências inválidas");
  const source = value.logSourcePath === null || value.logSourcePath === "" ? null : string(value.logSourcePath, "Fonte de logs", 2048);
  if (source && (!path.isAbsolute(source) || path.extname(source).toLowerCase() !== ".csv")) throw new IpcInputError("Escolha um arquivo CSV local para os logs");
  const interval = positiveInteger(value.collectionIntervalSeconds, "Intervalo", 3600);
  if (interval < 5) throw new IpcInputError("Intervalo mínimo: 5 segundos");
  return {
    collectionIntervalSeconds: interval,
    metricsRetentionDays: positiveInteger(value.metricsRetentionDays, "Retenção de métricas", 3650),
    logsRetentionDays: positiveInteger(value.logsRetentionDays, "Retenção de logs", 3650),
    logSourcePath: source,
  };
}

function exportRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !DATASETS.has(value.dataset)) throw new IpcInputError("Exportação inválida");
  return {
    dataset: value.dataset,
    period: value.period ? period(value.period) : undefined,
    sessionFilters: value.sessionFilters ? sessionFilters(value.sessionFilters) : undefined,
    logFilters: value.logFilters ? logFilters(value.logFilters) : undefined,
  };
}

function safeError(error) {
  if (error instanceof IpcInputError) return { code: error.code, message: error.message };
  if (error instanceof ProfileInputError) return { code: error.code, message: error.message };
  const code = error?.code;
  const known = {
    INVALID_INPUT: "Dados de conexão inválidos",
    PROFILE_NOT_FOUND: "Perfil não encontrado",
    PROFILE_ARCHIVED: "Este perfil foi arquivado",
    PROFILE_CHANGED: "A conexão ativa mudou. Revise a origem e tente novamente.",
    AWS_CLI_NOT_FOUND: "AWS CLI não encontrada. Instale ou ajuste o PATH e reinicie o aplicativo.",
    AWS_IDENTITY_UNAVAILABLE: "Identidade AWS indisponível. Verifique o perfil da CLI e, se usar SSO, execute aws sso login no terminal.",
    TOKEN_GENERATION_FAILED: "Não foi possível gerar a autorização IAM. Confira endpoint, região, usuário e identidade AWS.",
    NETWORK_UNAVAILABLE: "Não foi possível alcançar o PostgreSQL. Confira rede, VPN, endpoint e porta.",
    TLS_VALIDATION_FAILED: "Falha na validação TLS do RDS. Confira endpoint e certificado CA.",
    DATABASE_AUTH_FAILED: "Autenticação PostgreSQL recusada. Confira usuário e configuração IAM do banco.",
    DATABASE_PERMISSION_DENIED: "O usuário PostgreSQL não possui permissão para esta consulta.",
    CONNECTION_TIMEOUT: "A conexão excedeu o tempo limite. Confira rede, VPN e endpoint.",
  };
  if (Object.hasOwn(known, code)) return { code, message: known[code] };
  if (code === "42501") return { code: "PERMISSION_DENIED", message: "Permissão insuficiente no PostgreSQL" };
  if (typeof code === "string" && ["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND"].includes(code)) {
    return { code: "DATABASE_UNAVAILABLE", message: "PostgreSQL indisponível" };
  }
  return { code: "INTERNAL_ERROR", message: "Não foi possível concluir a operação" };
}

function wrapHandler(dev, handler) {
  return async (event, ...args) => {
    try {
      assertOrigin(event, dev);
      return { ok: true, data: await handler(...args) };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  };
}

module.exports = { IpcInputError, assertOrigin, period, page, profileId, sourceContext, confirmation,
  sessionIdentity, sessionActionIdentity, sessionFilters, databaseInventoryFilters, logFilters, preferences, exportRequest, safeError, wrapHandler };
