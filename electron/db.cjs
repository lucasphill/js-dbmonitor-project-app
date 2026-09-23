const { Pool } = require("pg");
const { Client } = require("pg");
const fs = require("node:fs");
const path = require("node:path");
const { ConnectionError, execAwsToken, validIamProfile } = require("./aws-rds-auth.cjs");

const QUERY_TIMEOUT_MS = 3000;
let pool;
let activeProfile = null;
let sessionPassword = null;
let switchingProfile = false;
// Public development default for the first local profile. Never apply it to remote origins.
const DEFAULT_LOCAL_PASSWORD = "password";

const RDS_CA_PATH = path.join(__dirname, "certs", "rds-global-bundle.pem");

function isLoopbackHost(host) {
  return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host.toLowerCase());
}

function passwordTls(host) {
  if (isLoopbackHost(host)) return undefined;
  const ssl = { servername: host, rejectUnauthorized: true };
  if (/\.rds\.amazonaws\.com(?:\.cn)?$/i.test(host)) {
    try {
      ssl.ca = fs.readFileSync(RDS_CA_PATH, "utf8");
      if (!ssl.ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error("invalid CA");
    } catch {
      throw new ConnectionError("TLS_VALIDATION_FAILED", "tls", "Bundle CA RDS indisponível ou inválido.");
    }
  }
  return ssl;
}

function currentProfile() {
  return activeProfile || {
    id: 1,
    label: "PostgreSQL",
    host: "localhost",
    port: 5432,
    database: "postgres",
    dbUser: "postgres",
    authMode: "legacy_env",
  };
}

function connectionConfig(profile, password = null, options = {}) {
  if (!profile || typeof profile !== "object") throw new ConnectionError("INVALID_INPUT", "network", "Perfil de conexão inválido.");
  const mode = profile.authMode;
  if (!["legacy_env", "session_password", "rds_iam"].includes(mode)) {
    throw new ConnectionError("INVALID_INPUT", "network", "Modo de autenticação inválido.");
  }
  if (typeof profile.host !== "string" || !profile.host || !Number.isInteger(Number(profile.port)) ||
      Number(profile.port) < 1 || Number(profile.port) > 65535 ||
      typeof profile.database !== "string" || !profile.database ||
      typeof profile.dbUser !== "string" || !profile.dbUser) {
    throw new ConnectionError("INVALID_INPUT", "network", "Confira endereço, porta, banco e usuário PostgreSQL.");
  }
  const config = {
    host: profile.host,
    port: Number(profile.port),
    database: profile.database,
    user: profile.dbUser,
    application_name: "DBMonitor",
    connectionTimeoutMillis: QUERY_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS + 500,
    options: `-c statement_timeout=${QUERY_TIMEOUT_MS}`,
  };
  if (mode === "rds_iam") {
    validIamProfile(profile);
    let ca;
    try {
      const caPath = profile.tlsCaMode === "custom" ? profile.tlsCaPath : RDS_CA_PATH;
      if (typeof caPath !== "string" || !caPath || (profile.tlsCaMode === "custom" && !path.isAbsolute(caPath))) {
        throw new Error("invalid CA path");
      }
      ca = fs.readFileSync(caPath, "utf8");
      if (!ca.includes("-----BEGIN CERTIFICATE-----")) throw new Error("invalid CA");
    } catch {
      throw new ConnectionError("TLS_VALIDATION_FAILED", "tls", "Bundle CA RDS indisponível ou inválido. Confira a instalação ou o certificado selecionado.");
    }
    config.ssl = { ca, servername: profile.host, rejectUnauthorized: true };
    config.password = () => (options.tokenProvider || execAwsToken)(profile);
  } else if (mode === "legacy_env") {
    config.ssl = passwordTls(profile.host);
    const isDefaultLocal = profile.id === 1 && profile.host === "localhost" &&
      Number(profile.port) === 5432 && profile.database === "postgres" && profile.dbUser === "postgres";
    config.password = isDefaultLocal ? DEFAULT_LOCAL_PASSWORD : process.env.PGPASSWORD;
  } else {
    if (typeof password !== "string" || !password) {
      throw new ConnectionError("INVALID_INPUT", "database_auth", "Informe a senha da sessão para este perfil.");
    }
    config.ssl = passwordTls(profile.host);
    config.password = password;
  }
  return config;
}

async function setActiveProfile(profile, password = null) {
  const next = { ...profile };
  // Selecting a saved profile must remain possible even if its CA, AWS identity,
  // password or network is unavailable. The next checkout reports that failure
  // against this profile; it never falls back to the previous origin.
  if (switchingProfile) {
    throw new ConnectionError("PROFILE_CHANGED", "network", "A origem ainda está sendo alterada. Tente novamente.");
  }
  switchingProfile = true;
  const old = pool;
  pool = null;
  try {
    if (old) await old.end();
    activeProfile = next;
    sessionPassword = next.authMode === "session_password" ? password : null;
  } finally {
    switchingProfile = false;
  }
}

function getPool() {
  if (switchingProfile) {
    throw new ConnectionError("PROFILE_CHANGED", "network", "A origem ainda está sendo alterada. Tente novamente.");
  }
  if (!pool) {
    pool = new Pool({
      ...connectionConfig(currentProfile(), sessionPassword),
      max: 3,
      idleTimeoutMillis: 30000,
    });
    pool.on("error", (error) => console.error("PostgreSQL pool error:", error.code || "unknown"));
  }
  return pool;
}

function classifyConnectionError(error) {
  if (error instanceof ConnectionError) return error;
  const code = error?.code;
  if (["CERT_HAS_EXPIRED", "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "ERR_TLS_CERT_ALTNAME_INVALID", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"].includes(code)) {
    return new ConnectionError("TLS_VALIDATION_FAILED", "tls", "A identidade TLS do servidor não foi validada. Confira o endpoint e o bundle CA RDS.");
  }
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ECONNRESET"].includes(code)) {
    return new ConnectionError("NETWORK_UNAVAILABLE", "network", "Não foi possível acessar o banco. Confira endpoint, VPN, rede e regras de acesso.");
  }
  if (code === "ETIMEDOUT" || /timeout|timed out/i.test(error?.message || "")) {
    return new ConnectionError("CONNECTION_TIMEOUT", "network", "A conexão demorou para responder. Confira rede, VPN e endereço.");
  }
  if (["28P01", "28000"].includes(code)) {
    return new ConnectionError("DATABASE_AUTH_FAILED", "database_auth", "O PostgreSQL recusou a autenticação. Confira usuário, IAM DB auth e permissão rds-db:connect.");
  }
  if (code === "42501") {
    return new ConnectionError("DATABASE_PERMISSION_DENIED", "query", "A conta conectou, mas não tem permissão para a consulta solicitada.");
  }
  return new ConnectionError("INTERNAL_ERROR", "network", "Não foi possível concluir a conexão. Confira a configuração e tente novamente.");
}

async function testConnection(profile, password = null, options = {}) {
  const checkedAt = new Date().toISOString();
  let client;
  try {
    client = new (options.Client || Client)(connectionConfig(profile, password, options));
    await client.connect();
    const { rows } = await client.query(`SELECT current_database() AS database,
      current_user AS db_user, current_setting('server_version') AS server_version`);
    return {
      status: "success", stage: "complete", checkedAt,
      ...(Number.isSafeInteger(profile.id) ? { profileId: profile.id } : {}),
      database: rows[0]?.database || profile.database,
      dbUser: rows[0]?.db_user || profile.dbUser,
      serverVersion: rows[0]?.server_version || undefined,
      message: "Conexão e consulta confirmadas. A visibilidade das métricas depende das permissões no banco.",
    };
  } catch (error) {
    const safe = classifyConnectionError(error);
    return { status: "failed", stage: safe.stage, checkedAt,
      ...(Number.isSafeInteger(profile?.id) ? { profileId: profile.id } : {}),
      code: safe.code, message: safe.message };
  } finally {
    if (client) { try { await client.end(); } catch { /* Preserve sanitized result. */ } }
  }
}

function safeNumber(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function capability(available, reason) {
  return available ? { available: true } : { available: false, reason };
}

async function detectCapabilities(client = null) {
  const owned = !client;
  const connection = client || await getPool().connect();
  try {
    const { rows } = await connection.query(`
      SELECT to_regclass('pg_catalog.pg_stat_activity') IS NOT NULL AS activity,
             to_regclass('pg_catalog.pg_stat_database') IS NOT NULL AS database_stats,
             to_regclass('pg_catalog.pg_stat_io') IS NOT NULL AS io,
             to_regclass('pg_catalog.pg_stat_wal') IS NOT NULL AS wal,
             EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements') AS statements_installed,
             current_setting('shared_preload_libraries', true) AS preloaded,
             current_setting('track_io_timing', true) AS track_io_timing,
             current_setting('logging_collector', true) AS logging_collector,
             current_setting('log_destination', true) AS log_destination
    `);
    const row = rows[0];
    const loaded = String(row.preloaded || "").split(",").map((s) => s.trim()).includes("pg_stat_statements");
    const statements = row.statements_installed && loaded;
    return {
      activity: capability(row.activity, "pg_stat_activity indisponível"),
      databaseStats: capability(row.database_stats, "pg_stat_database indisponível"),
      io: capability(row.io, "pg_stat_io indisponível"),
      wal: capability(row.wal, "pg_stat_wal indisponível"),
      statements: capability(statements, "Instale pg_stat_statements e configure shared_preload_libraries"),
      logs: capability(false, "Fonte CSV de logs não configurada"),
      ioTiming: capability(row.track_io_timing === "on", "track_io_timing está desativado"),
      csvLogging: capability(row.logging_collector === "on" && String(row.log_destination).split(",").includes("csvlog"),
        "logging_collector/csvlog não estão ativos"),
    };
  } finally {
    if (owned) connection.release();
  }
}

async function collectSnapshot() {
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const profile = currentProfile();
  const config = {
    label: profile.label || "PostgreSQL",
    host: profile.host,
    port: profile.port,
    database: profile.database,
    version: null,
  };
  const snapshot = {
    startedAt,
    collectedAt: startedAt,
    finishedAt: startedAt,
    durationMs: 0,
    state: "unavailable",
    result: "failed",
    instance: config,
    capabilities: {},
    metrics: {},
    databases: [],
    error: null,
  };
  let client;
  const failures = [];
  try {
    client = await getPool().connect();
    const identity = await client.query(`SELECT current_database() AS database,
      current_setting('server_version') AS version,
      current_setting('max_connections') AS max_connections,
      pg_postmaster_start_time() AS server_started_at`);
    const row = identity.rows[0];
    config.database = row.database;
    config.version = row.version;
    config.maxConnections = safeNumber(row.max_connections);
    config.serverStartedAt = row.server_started_at?.toISOString() || null;

    try { snapshot.capabilities = await detectCapabilities(client); }
    catch { failures.push("Falha na detecção de capacidades"); }

    if (snapshot.capabilities.databaseStats?.available !== false) {
      try {
        const { rows } = await client.query(`SELECT d.oid AS oid, s.datname AS name,
          s.numbackends AS connections, s.xact_commit AS commits,
          s.xact_rollback AS rollbacks, s.blks_read AS blocks_read,
          s.blks_hit AS cache_hits, s.deadlocks, s.temp_bytes,
          s.stats_reset FROM pg_stat_database s
          JOIN pg_database d ON d.datname = s.datname
          WHERE s.datname IS NOT NULL ORDER BY s.datname LIMIT 10000`);
        snapshot.databases = rows.map((db) => ({
          oid: safeNumber(db.oid), name: db.name,
          connections: safeNumber(db.connections), commits: safeNumber(db.commits),
          rollbacks: safeNumber(db.rollbacks), blocksRead: safeNumber(db.blocks_read),
          cacheHits: safeNumber(db.cache_hits), deadlocks: safeNumber(db.deadlocks),
          tempBytes: safeNumber(db.temp_bytes), statsReset: db.stats_reset?.toISOString() || null,
        }));
        snapshot.metrics.connections = snapshot.databases.reduce((sum, db) => sum + (db.connections || 0), 0);
      } catch { failures.push("Falha em pg_stat_database"); }
    }

    if (snapshot.capabilities.activity?.available !== false) {
      try {
        const { rows } = await client.query(`SELECT
          count(*) FILTER (WHERE state = 'active') AS active,
          count(*) FILTER (WHERE state = 'idle') AS idle,
          count(*) FILTER (WHERE wait_event_type IS NOT NULL) AS waiting
          FROM pg_stat_activity WHERE backend_type = 'client backend'`);
        snapshot.metrics.activeConnections = safeNumber(rows[0].active);
        snapshot.metrics.idleConnections = safeNumber(rows[0].idle);
        snapshot.metrics.waitingConnections = safeNumber(rows[0].waiting);
      } catch { failures.push("Falha em pg_stat_activity"); }
    }

    if (snapshot.capabilities.wal?.available) {
      try {
        const { rows } = await client.query("SELECT wal_bytes FROM pg_stat_wal");
        snapshot.metrics.walBytes = safeNumber(rows[0]?.wal_bytes);
      } catch { failures.push("Falha em pg_stat_wal"); }
    }

    if (snapshot.capabilities.io?.available) {
      try {
        const { rows } = await client.query(`SELECT sum(reads) AS reads, sum(writes) AS writes
          FROM pg_stat_io`);
        snapshot.metrics.ioReads = safeNumber(rows[0]?.reads);
        snapshot.metrics.ioWrites = safeNumber(rows[0]?.writes);
      } catch { failures.push("Falha em pg_stat_io"); }
    }

    snapshot.result = failures.length ? "partial" : "success";
    snapshot.state = failures.length ? "partial" : "ready";
  } catch (error) {
    failures.push(classifyConnectionError(error).message);
  } finally {
    if (client) client.release();
    snapshot.finishedAt = new Date().toISOString();
    snapshot.collectedAt = snapshot.finishedAt;
    snapshot.durationMs = Date.now() - start;
    snapshot.error = failures.length ? failures.join("; ") : null;
  }
  return snapshot;
}

/** Current database catalog. Disk sizes are measured only for the requested page. */
const DATABASE_INVENTORY_SORT = Object.freeze({
  name: "d.datname",
  size: "measured.size_bytes",
  owner: "pg_get_userbyid(d.datdba)",
  encoding: "pg_encoding_to_char(d.encoding)",
  collation: "d.datcollate",
  connections: "COALESCE(s.numbackends, 0)",
  connectionLimit: "d.datconnlimit",
  status: "CASE WHEN NOT d.datallowconn THEN 0 WHEN d.datistemplate THEN 1 ELSE 2 END",
});

async function listDatabaseInventory(input = {}, options = {}) {
  const selection = input.page || input;
  const limit = selection.limit ?? 50;
  const offset = selection.offset ?? Number(selection.cursor ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000_000) {
    throw new TypeError("Invalid database inventory page");
  }
  const sortBy = input.sortBy ?? "name";
  if (!Object.hasOwn(DATABASE_INVENTORY_SORT, sortBy)) throw new TypeError("Invalid database inventory sort");
  const direction = input.sortDirection ?? "asc";
  if (direction !== "asc" && direction !== "desc") throw new TypeError("Invalid database inventory direction");
  if (input.status !== undefined && !["available", "blocked", "template"].includes(input.status)) {
    throw new TypeError("Invalid database inventory status");
  }
  const conditions = [];
  const values = [];
  for (const [field, column] of [["search", "(d.datname ILIKE $PARAM ESCAPE '\\' OR pg_get_userbyid(d.datdba) ILIKE $PARAM ESCAPE '\\')"],
    ["owner", "pg_get_userbyid(d.datdba) ILIKE $PARAM ESCAPE '\\'"],
    ["encoding", "pg_encoding_to_char(d.encoding) ILIKE $PARAM ESCAPE '\\'"]]) {
    const value = input[field];
    if (value === undefined || value === "") continue;
    if (typeof value !== "string" || value.length > 200) throw new TypeError("Invalid database inventory filter");
    values.push(`%${value.replace(/[\\%_]/g, "\\$&")}%`);
    conditions.push(column.replaceAll("$PARAM", `$${values.length}`));
  }
  if (input.status === "available") conditions.push("d.datallowconn AND NOT d.datistemplate");
  if (input.status === "blocked") conditions.push("NOT d.datallowconn");
  if (input.status === "template") conditions.push("d.datallowconn AND d.datistemplate");
  const predicate = conditions.length ? conditions.map((condition) => `(${condition})`).join(" AND ") : "TRUE";
  const sizeSort = sortBy === "size";
  const sizeJoin = sizeSort ? `LEFT JOIN LATERAL (SELECT pg_database_size(d.oid) AS size_bytes
    WHERE (has_database_privilege(d.oid, 'CONNECT') OR
      pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER'))) measured ON TRUE` : "";
  const order = `${DATABASE_INVENTORY_SORT[sortBy]} ${direction.toUpperCase()} NULLS LAST, d.datname ASC, d.oid ASC`;
  const owned = !options.client;
  const client = options.client || await getPool().connect();
  try {
    const count = await client.query(`SELECT count(*) AS total FROM pg_database d WHERE ${predicate}`, values);
    const total = safeNumber(count.rows[0]?.total) ?? 0;
    const catalog = await client.query(`SELECT d.oid, d.datname AS name,
      pg_get_userbyid(d.datdba) AS owner, pg_encoding_to_char(d.encoding) AS encoding,
      d.datcollate AS collation, d.datallowconn AS allows_connections,
      d.datconnlimit AS connection_limit, d.datistemplate AS template,
      (has_database_privilege(d.oid, 'CONNECT') OR
        pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER')) AS can_measure_size,
      COALESCE(s.numbackends, 0) AS connections${sizeSort ? ", measured.size_bytes" : ""}
      FROM pg_database d LEFT JOIN pg_stat_database s ON s.datid = d.oid
      ${sizeJoin} WHERE ${predicate}
      ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, limit, offset]);
    const measurable = sizeSort ? [] : catalog.rows.filter((row) => row.can_measure_size).map((row) => row.oid);
    const sizes = new Map();
    if (measurable.length) {
      try {
        const result = await client.query(`SELECT d.oid, pg_database_size(d.oid) AS size_bytes
          FROM pg_database d WHERE d.oid = ANY($1::oid[])`, [measurable]);
        for (const row of result.rows) sizes.set(Number(row.oid), safeNumber(row.size_bytes));
      } catch { /* Metadata remains available if a size check is denied or times out. */ }
    }
    const rows = catalog.rows.map((row) => ({
      oid: Number(row.oid), name: row.name,
      sizeBytes: sizeSort ? safeNumber(row.size_bytes) : sizes.get(Number(row.oid)) ?? null,
      owner: row.owner, encoding: row.encoding, collation: row.collation,
      connections: safeNumber(row.connections) ?? 0,
      connectionLimit: Number(row.connection_limit),
      allowsConnections: row.allows_connections === true,
      template: row.template === true,
    }));
    return { rows, total, nextCursor: offset + rows.length < total ? String(offset + rows.length) : undefined,
      sizeIncomplete: rows.some((row) => row.sizeBytes === null), updatedAt: new Date().toISOString() };
  } finally {
    if (owned) client.release();
  }
}

/** Compatibility for the original dashboard while its renderer is replaced. */
async function getDatabaseStats() {
  const { rows } = await getPool().query(`SELECT datname AS name,
    numbackends AS connections, xact_commit AS commits,
    xact_rollback AS rollbacks FROM pg_stat_database
    WHERE datname IS NOT NULL ORDER BY datname`);
  return rows.map((row) => ({
    name: row.name,
    connections: safeNumber(row.connections),
    commits: safeNumber(row.commits),
    rollbacks: safeNumber(row.rollbacks),
  }));
}

function checkedIdentity(identity) {
  if (!identity || !Number.isSafeInteger(identity.pid) || identity.pid < 1 || identity.pid > 2_147_483_647 ||
      typeof identity.backendStart !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{1,6}Z$/.test(identity.backendStart) ||
      !Number.isFinite(Date.parse(identity.backendStart))) {
    throw new TypeError("Invalid session identity");
  }
  return { pid: identity.pid, backendStart: identity.backendStart };
}

const SESSION_SORT = Object.freeze({
  duration: "active_duration_ms",
  startedAt: "backend_start",
  database: "database",
  user: "user_name",
  state: "state",
  pid: "pid",
});

function checkedSessionFilters(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid session filters");
  const filters = {};
  for (const key of ["database", "user", "application", "state", "search"]) {
    const value = input[key];
    if (value == null || value === "") continue;
    if (typeof value !== "string" || value.length > 200) throw new TypeError(`Invalid ${key}`);
    filters[key] = value;
  }
  filters.sortBy = Object.hasOwn(SESSION_SORT, input.sortBy) ? input.sortBy : "duration";
  filters.sortDirection = input.sortDirection === "asc" ? "ASC" : "DESC";
  const page = input.page || {};
  if (typeof page !== "object" || Array.isArray(page)) throw new TypeError("Invalid page");
  filters.limit = page.limit === undefined ? 50 : Number(page.limit);
  filters.offset = page.cursor === undefined ? 0 : Number(page.cursor);
  if (!Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > 200 ||
      !Number.isSafeInteger(filters.offset) || filters.offset < 0 || filters.offset > 10_000_000) {
    throw new TypeError("Invalid page");
  }
  return filters;
}

/** Snapshot of client sessions. Query text and client address are intentionally omitted. */
async function listSessions(input = {}) {
  const filters = checkedSessionFilters(input);
  const values = [];
  const where = ["a.backend_type = 'client backend'"];
  for (const [key, column] of [["database", "a.datname"], ["user", "a.usename"],
    ["application", "a.application_name"], ["state", "a.state"]]) {
    if (filters[key] !== undefined) {
      values.push(filters[key]);
      where.push(`${column} = $${values.length}`);
    }
  }
  if (filters.search !== undefined) {
    values.push(`%${filters.search}%`);
    where.push(`(a.datname ILIKE $${values.length} OR a.usename ILIKE $${values.length}
      OR a.application_name ILIKE $${values.length} OR a.pid::text ILIKE $${values.length})`);
  }
  const predicate = where.join(" AND ");
  const sort = SESSION_SORT[filters.sortBy];
  const client = await getPool().connect();
  try {
    const counts = await client.query(`SELECT count(*) AS total, a.state, count(*) AS state_count
      FROM pg_stat_activity a WHERE ${predicate} GROUP BY a.state`, values);
    const byState = {};
    let total = 0;
    for (const row of counts.rows) {
      const count = safeNumber(row.state_count) || 0;
      byState[row.state || "unknown"] = count;
      total += count;
    }
    const params = [...values, filters.limit, filters.offset];
    const { rows } = await client.query(`SELECT a.pid,
      to_char(a.backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS backend_start_iso,
      a.backend_start,
      d.oid AS database_oid, a.datname AS database, a.usename AS user_name,
      a.application_name AS application, a.state, a.wait_event_type,
      a.wait_event, a.backend_type,
      CASE WHEN a.state = 'active' THEN a.query_start END AS query_started_at,
      a.xact_start AS transaction_started_at,
      CASE WHEN a.state = 'active' AND a.query_start IS NOT NULL
        THEN GREATEST(0,EXTRACT(EPOCH FROM clock_timestamp()-a.query_start)*1000)
        ELSE NULL END AS active_duration_ms
      FROM pg_stat_activity a LEFT JOIN pg_database d ON d.datname=a.datname
      WHERE ${predicate} ORDER BY ${sort} ${filters.sortDirection} NULLS LAST,a.pid ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    const mapped = rows.map((row) => ({
      pid: row.pid,
      backendStart: row.backend_start_iso,
      databaseOid: safeNumber(row.database_oid),
      database: row.database,
      user: row.user_name,
      application: row.application || "",
      state: row.state,
      waitEventType: row.wait_event_type,
      waitEvent: row.wait_event,
      backendType: row.backend_type,
      queryStartedAt: row.query_started_at?.toISOString() || null,
      transactionStartedAt: row.transaction_started_at?.toISOString() || null,
      activeDurationMs: row.active_duration_ms == null ? null : Math.max(0, Number(row.active_duration_ms)),
    }));
    return {
      rows: mapped, total, byState,
      nextCursor: filters.offset + rows.length < total ? String(filters.offset + rows.length) : undefined,
      updatedAt: new Date().toISOString(),
    };
  } finally {
    client.release();
  }
}

/** Sensitive details are fetched only after a dedicated reveal action. */
async function revealSessionDetails(input) {
  const identity = checkedIdentity(input);
  const client = await getPool().connect();
  try {
    const { rows } = await client.query(`SELECT
      to_char(backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS backend_start_iso,
      state,backend_type,
      CASE WHEN state='active' THEN query END AS active_query,
      client_addr::text AS client_address FROM pg_stat_activity WHERE pid=$1`, [identity.pid]);
    const row = rows[0];
    if (!row) return { ...identity, state: "unavailable", query: null, clientAddress: null, reason: "Sessão encerrada" };
    if (row.backend_start_iso !== identity.backendStart) {
      return { ...identity, state: "unavailable", query: null, clientAddress: null, reason: "Identidade da sessão mudou" };
    }
    if (row.backend_type !== "client backend") {
      return { ...identity, state: "unavailable", query: null, clientAddress: null, reason: "Processo interno protegido" };
    }
    return {
      ...identity,
      state: "ready",
      query: row.active_query || null,
      clientAddress: row.client_address || null,
      reason: row.state === "active" ? undefined : "Sessão sem consulta ativa",
    };
  } finally {
    client.release();
  }
}

function operationResult(status, message) {
  return { status, message, auditedAt: new Date().toISOString() };
}

/** Terminates exactly one revalidated client backend with a positive server-side wait. */
async function terminateSession(input) {
  const identity = checkedIdentity(input);
  let client;
  try {
    client = await getPool().connect();
    const lookup = async () => {
      const { rows } = await client.query(`SELECT a.pid,
        to_char(a.backend_start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS backend_start_iso,
        a.backend_type,a.application_name,
        pg_backend_pid() AS monitor_pid FROM pg_stat_activity a WHERE a.pid=$1`, [identity.pid]);
      return rows[0] || null;
    };
    const row = await lookup();
    if (!row) return operationResult("not_found", "A sessão já não existe");
    if (row.backend_start_iso !== identity.backendStart) {
      return operationResult("identity_changed", "A identidade da sessão mudou");
    }
    if (row.backend_type !== "client backend" || row.pid === row.monitor_pid ||
        ["DBMonitor", "bdash-monitor"].includes(row.application_name)) {
      return operationResult("protected", "Esta conexão não pode ser encerrada");
    }
    // The predicate is repeated inside the terminating statement to narrow the
    // interval between identity verification and the signal to the server.
    const { rows } = await client.query(`SELECT CASE WHEN EXISTS (
      SELECT 1 FROM pg_stat_activity a WHERE a.pid=$1::integer
        AND a.backend_start=$2::timestamptz
        AND a.backend_type='client backend'
        AND a.application_name NOT IN ('DBMonitor', 'bdash-monitor')
        AND a.pid <> pg_backend_pid()
      ) THEN pg_terminate_backend($1::integer,$3::bigint) ELSE false END AS terminated`,
      [identity.pid, identity.backendStart, 1000]);
    if (rows[0]?.terminated === true) return operationResult("success", "Conexão encerrada");
    const after = await lookup();
    if (!after) return operationResult("not_found", "A sessão já não existe");
    if (after.backend_start_iso !== identity.backendStart) {
      return operationResult("identity_changed", "A identidade da sessão mudou");
    }
    return operationResult("failed", "O PostgreSQL não confirmou o encerramento");
  } catch (error) {
    if (error?.code === "42501") return operationResult("denied", "Permissão insuficiente para encerrar a conexão");
    return operationResult("failed", "Não foi possível encerrar a conexão");
  } finally {
    client?.release();
  }
}

/** Optional pg_stat_statements aggregates; never selects query text. */
async function getQueryAggregates({ limit = 50, offset = 0 } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 10_000_000) {
    throw new TypeError("Invalid aggregate page");
  }
  const updatedAt = new Date().toISOString();
  const unavailable = (reason) => ({ rows: [], total: 0, updatedAt, available: false, reason });
  const client = await getPool().connect();
  try {
    const capabilities = await detectCapabilities(client);
    if (!capabilities.statements.available) return unavailable(capabilities.statements.reason);

    const relation = await getStatementsRelation(client);
    if (!relation) return unavailable("Extensão pg_stat_statements não instalada");
    const count = await client.query(`SELECT count(*) AS total FROM ${relation} WHERE queryid IS NOT NULL`);
    const total = safeNumber(count.rows[0]?.total) || 0;
    const { rows } = await client.query(`SELECT dbid AS database_oid,userid AS user_oid,
      queryid::text AS query_id,calls,total_exec_time,mean_exec_time,
      shared_blks_read,shared_blks_hit FROM ${relation}
      WHERE queryid IS NOT NULL
      ORDER BY total_exec_time DESC,dbid,userid,queryid
      LIMIT $1 OFFSET $2`, [limit, offset]);
    return {
      rows: rows.map((row) => ({
        databaseOid: safeNumber(row.database_oid),
        userOid: safeNumber(row.user_oid),
        queryId: row.query_id,
        calls: safeNumber(row.calls),
        totalTimeMs: Number(row.total_exec_time),
        meanTimeMs: Number(row.mean_exec_time),
        blocksRead: safeNumber(row.shared_blks_read),
        cacheHits: safeNumber(row.shared_blks_hit),
      })),
      total, updatedAt, available: true,
    };
  } catch (error) {
    return unavailable(error?.code === "42501"
      ? "Permissão insuficiente para pg_stat_statements"
      : "Não foi possível consultar pg_stat_statements");
  } finally {
    client.release();
  }
}

async function getStatementsRelation(client) {
  const namespace = await client.query(`SELECT n.nspname FROM pg_extension e
    JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pg_stat_statements'`);
  const schema = namespace.rows[0]?.nspname;
  return schema ? `"${schema.replaceAll('"', '""')}"."pg_stat_statements"` : null;
}

/** Weighted execution mean across all visible statements, in milliseconds. */
async function getGlobalQueryLatency() {
  const unavailable = (reason) => ({ value: null, available: false, reason });
  let client;
  try {
    client = await getPool().connect();
    const capabilities = await detectCapabilities(client);
    if (!capabilities.statements.available) return unavailable(capabilities.statements.reason);
    const relation = await getStatementsRelation(client);
    if (!relation) return unavailable("Extensão pg_stat_statements não instalada");
    const { rows } = await client.query(`SELECT sum(total_exec_time) / nullif(sum(calls),0) AS mean_ms
      FROM ${relation} WHERE queryid IS NOT NULL`);
    const value = rows[0]?.mean_ms == null ? null : Number(rows[0].mean_ms);
    if (value === null) return { value: null, available: true, reason: "Ainda não há chamadas medidas" };
    if (!Number.isFinite(value) || value < 0) return unavailable("Métrica de latência inválida");
    return { value, available: true };
  } catch (error) {
    return unavailable(error?.code === "42501"
      ? "Permissão insuficiente para pg_stat_statements"
      : "Não foi possível consultar pg_stat_statements");
  } finally {
    client?.release();
  }
}

async function closeDatabase() {
  if (pool) {
    const closing = pool;
    pool = null;
    await closing.end();
  }
  activeProfile = null;
  sessionPassword = null;
}

module.exports = {
  getPool, detectCapabilities, collectSnapshot, getDatabaseStats, listDatabaseInventory,
  listSessions, revealSessionDetails, terminateSession, getQueryAggregates,
  getGlobalQueryLatency, closeDatabase,
  setActiveProfile, testConnection, connectionConfig, classifyConnectionError, currentProfile,
};
