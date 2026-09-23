const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const FILE_NAME = "bdash.sqlite";
const SCHEMA_VERSION = 3;
const DEFAULT_PREFERENCES = Object.freeze({
  collectionIntervalSeconds: 15,
  metricsRetentionDays: 30,
  logsRetentionDays: 7,
  logSourcePath: null,
});

function finiteNonnegative(value) {
  if (value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError("Invalid metric value");
  return number;
}

function epoch(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  const result = Date.parse(value);
  if (!Number.isFinite(result)) throw new TypeError("Invalid timestamp");
  return result;
}

function iso(value) {
  return value == null ? null : new Date(Number(value)).toISOString();
}

function profileId(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("Invalid profile ID");
  return value;
}

function profileFromRow(row) {
  if (!row) return null;
  return {
    id: row.id, label: row.label, host: row.host, port: row.port,
    database: row.monitor_database, dbUser: row.db_user, authMode: row.auth_mode,
    awsRegion: row.aws_region, awsProfile: row.aws_profile,
    tlsCaMode: row.tls_ca_mode, tlsCaPath: row.tls_ca_path,
    archivedAt: iso(row.archived_at), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
    state: row.state, version: row.server_version, maxConnections: row.max_connections,
    serverStartedAt: iso(row.server_started_at), lastCollectedAt: iso(row.last_collected_at),
  };
}

function migrate(db) {
  const version = Number(db.prepare("PRAGMA user_version").get().user_version);
  if (version > SCHEMA_VERSION) throw new Error("SQLite schema is newer than this application");
  if (version === SCHEMA_VERSION) return;
  const hadLegacyInstance = version >= 1 &&
    db.prepare("SELECT id FROM instances WHERE id=1").get() != null;

  // SQLite requires FK enforcement to be disabled before, not within, the transaction
  // that rebuilds tables referenced by historical rows.
  if (version < 3) db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  try {
    if (version < 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS instances (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          label TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
          monitor_database TEXT NOT NULL,
          server_version TEXT,
          state TEXT NOT NULL DEFAULT 'unavailable',
          capabilities_json TEXT NOT NULL DEFAULT '{}',
          last_collected_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS collection_cycles (
          id INTEGER PRIMARY KEY,
          instance_id INTEGER NOT NULL REFERENCES instances(id),
          started_at INTEGER NOT NULL,
          finished_at INTEGER NOT NULL CHECK (finished_at >= started_at),
          duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
          result TEXT NOT NULL CHECK (result IN ('success','partial','failed')),
          error TEXT,
          CHECK (length(error) <= 500)
        );
        CREATE INDEX IF NOT EXISTS idx_cycles_instance_time
          ON collection_cycles(instance_id, finished_at);
        CREATE TABLE IF NOT EXISTS instance_samples (
          cycle_id INTEGER PRIMARY KEY REFERENCES collection_cycles(id) ON DELETE CASCADE,
          instance_id INTEGER NOT NULL REFERENCES instances(id),
          collected_at INTEGER NOT NULL,
          connections INTEGER CHECK (connections >= 0),
          active_connections INTEGER CHECK (active_connections >= 0),
          idle_connections INTEGER CHECK (idle_connections >= 0),
          waiting_connections INTEGER CHECK (waiting_connections >= 0),
          wal_bytes INTEGER CHECK (wal_bytes >= 0),
          io_reads INTEGER CHECK (io_reads >= 0),
          io_writes INTEGER CHECK (io_writes >= 0),
          collection_duration_ms INTEGER CHECK (collection_duration_ms >= 0)
        );
        CREATE INDEX IF NOT EXISTS idx_instance_samples_time
          ON instance_samples(instance_id, collected_at);
        CREATE TABLE IF NOT EXISTS database_samples (
          cycle_id INTEGER NOT NULL REFERENCES collection_cycles(id) ON DELETE CASCADE,
          instance_id INTEGER NOT NULL REFERENCES instances(id),
          collected_at INTEGER NOT NULL,
          database_oid INTEGER NOT NULL CHECK (database_oid >= 0),
          name TEXT NOT NULL,
          connections INTEGER CHECK (connections >= 0),
          commits INTEGER CHECK (commits >= 0),
          rollbacks INTEGER CHECK (rollbacks >= 0),
          blocks_read INTEGER CHECK (blocks_read >= 0),
          cache_hits INTEGER CHECK (cache_hits >= 0),
          deadlocks INTEGER CHECK (deadlocks >= 0),
          temp_bytes INTEGER CHECK (temp_bytes >= 0),
          stats_reset INTEGER,
          PRIMARY KEY (cycle_id, database_oid)
        );
        CREATE INDEX IF NOT EXISTS idx_database_samples_oid_time
          ON database_samples(database_oid, collected_at);
        CREATE INDEX IF NOT EXISTS idx_database_samples_instance_time
          ON database_samples(instance_id, collected_at);
        CREATE TABLE IF NOT EXISTS query_samples (
          cycle_id INTEGER NOT NULL REFERENCES collection_cycles(id) ON DELETE CASCADE,
          database_oid INTEGER NOT NULL,
          user_oid INTEGER NOT NULL,
          query_id TEXT NOT NULL,
          calls INTEGER NOT NULL CHECK (calls >= 0),
          total_time_ms REAL NOT NULL CHECK (total_time_ms >= 0),
          mean_time_ms REAL NOT NULL CHECK (mean_time_ms >= 0),
          blocks_read INTEGER CHECK (blocks_read >= 0),
          cache_hits INTEGER CHECK (cache_hits >= 0),
          stats_reset INTEGER,
          PRIMARY KEY (cycle_id, database_oid, user_oid, query_id)
        );
        CREATE TABLE IF NOT EXISTS log_sources (
          id INTEGER PRIMARY KEY,
          path TEXT NOT NULL UNIQUE,
          file_identity TEXT,
          offset_bytes INTEGER NOT NULL DEFAULT 0 CHECK (offset_bytes >= 0),
          file_size INTEGER CHECK (file_size >= 0),
          last_ingested_at INTEGER,
          state TEXT NOT NULL DEFAULT 'unavailable',
          error TEXT
        );
        CREATE TABLE IF NOT EXISTS log_events (
          id INTEGER PRIMARY KEY,
          source_id INTEGER NOT NULL REFERENCES log_sources(id) ON DELETE CASCADE,
          file_identity TEXT NOT NULL,
          offset_bytes INTEGER NOT NULL CHECK (offset_bytes >= 0),
          event_time INTEGER NOT NULL,
          ingested_at INTEGER NOT NULL,
          severity TEXT,
          database_name TEXT,
          user_name TEXT,
          pid INTEGER,
          sql_state TEXT,
          message TEXT NOT NULL,
          UNIQUE(source_id, file_identity, offset_bytes)
        );
        CREATE INDEX IF NOT EXISTS idx_log_events_time_severity
          ON log_events(event_time, severity);
        CREATE INDEX IF NOT EXISTS idx_log_events_source_position
          ON log_events(source_id, file_identity, offset_bytes);
        CREATE TABLE IF NOT EXISTS preferences (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          collection_interval_seconds INTEGER NOT NULL DEFAULT 15 CHECK (collection_interval_seconds BETWEEN 5 AND 3600),
          metrics_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (metrics_retention_days BETWEEN 1 AND 3650),
          logs_retention_days INTEGER NOT NULL DEFAULT 7 CHECK (logs_retention_days BETWEEN 1 AND 3650),
          log_source_path TEXT,
          filters_json TEXT NOT NULL DEFAULT '{}'
        );
        INSERT OR IGNORE INTO preferences(id) VALUES (1);
        CREATE TABLE IF NOT EXISTS termination_attempts (
          id INTEGER PRIMARY KEY,
          instance_id INTEGER NOT NULL DEFAULT 1 REFERENCES instances(id),
          attempted_at INTEGER NOT NULL,
          pid INTEGER NOT NULL CHECK (pid > 0),
          backend_start INTEGER NOT NULL,
          database_name TEXT,
          user_name TEXT,
          application_name TEXT,
          confirmed INTEGER NOT NULL CHECK (confirmed IN (0,1)),
          result TEXT NOT NULL CHECK (result IN ('success','not_found','identity_changed','protected','denied','failed')),
          error TEXT CHECK (length(error) <= 500)
        );
        CREATE INDEX IF NOT EXISTS idx_termination_attempts_time
          ON termination_attempts(attempted_at);
      `);
    }
    if (version < 2) {
      db.exec(`
        ALTER TABLE instances ADD COLUMN max_connections INTEGER;
        ALTER TABLE instances ADD COLUMN server_started_at INTEGER;
      `);
    }
    if (version < 3) {
      db.exec(`
        CREATE TABLE instances_v3 (
          id INTEGER PRIMARY KEY,
          label TEXT NOT NULL,
          host TEXT NOT NULL,
          port INTEGER NOT NULL CHECK (port BETWEEN 1 AND 65535),
          monitor_database TEXT NOT NULL,
          db_user TEXT NOT NULL,
          auth_mode TEXT NOT NULL CHECK (auth_mode IN ('legacy_env','session_password','rds_iam')),
          aws_region TEXT,
          aws_profile TEXT,
          tls_ca_mode TEXT,
          tls_ca_path TEXT,
          archived_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          server_version TEXT,
          state TEXT NOT NULL DEFAULT 'unavailable',
          capabilities_json TEXT NOT NULL DEFAULT '{}',
          last_collected_at INTEGER,
          max_connections INTEGER,
          server_started_at INTEGER
        );
        INSERT INTO instances_v3(id,label,host,port,monitor_database,db_user,auth_mode,
          tls_ca_mode,created_at,updated_at,server_version,state,capabilities_json,last_collected_at,max_connections,server_started_at)
          SELECT id,label,host,port,monitor_database,'postgres','legacy_env',
            NULL,CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000,
            server_version,state,capabilities_json,last_collected_at,max_connections,server_started_at
          FROM instances;
        INSERT OR IGNORE INTO instances_v3(id,label,host,port,monitor_database,db_user,auth_mode,tls_ca_mode,created_at,updated_at)
          VALUES (1,'PostgreSQL','localhost',5432,'postgres','postgres','legacy_env',NULL,
            CAST(strftime('%s','now') AS INTEGER)*1000,CAST(strftime('%s','now') AS INTEGER)*1000);
        DROP TABLE instances;
        ALTER TABLE instances_v3 RENAME TO instances;

        CREATE TABLE preferences_v3 (
          instance_id INTEGER PRIMARY KEY REFERENCES instances(id),
          collection_interval_seconds INTEGER NOT NULL DEFAULT 15 CHECK (collection_interval_seconds BETWEEN 5 AND 3600),
          metrics_retention_days INTEGER NOT NULL DEFAULT 30 CHECK (metrics_retention_days BETWEEN 1 AND 3650),
          logs_retention_days INTEGER NOT NULL DEFAULT 7 CHECK (logs_retention_days BETWEEN 1 AND 3650),
          log_source_path TEXT,
          filters_json TEXT NOT NULL DEFAULT '{}'
        );
        INSERT INTO preferences_v3(instance_id,collection_interval_seconds,metrics_retention_days,
          logs_retention_days,log_source_path,filters_json)
          SELECT 1,collection_interval_seconds,metrics_retention_days,logs_retention_days,log_source_path,filters_json
          FROM preferences WHERE id=1;
        INSERT OR IGNORE INTO preferences_v3(instance_id) VALUES (1);
        DROP TABLE preferences;
        ALTER TABLE preferences_v3 RENAME TO preferences;

        CREATE TABLE log_sources_v3 (
          id INTEGER PRIMARY KEY,
          instance_id INTEGER NOT NULL REFERENCES instances(id),
          path TEXT NOT NULL,
          file_identity TEXT,
          offset_bytes INTEGER NOT NULL DEFAULT 0 CHECK (offset_bytes >= 0),
          file_size INTEGER CHECK (file_size >= 0),
          last_ingested_at INTEGER,
          state TEXT NOT NULL DEFAULT 'unavailable',
          error TEXT,
          UNIQUE(instance_id,path)
        );
        INSERT INTO log_sources_v3(id,instance_id,path,file_identity,offset_bytes,file_size,last_ingested_at,state,error)
          SELECT id,1,path,file_identity,offset_bytes,file_size,last_ingested_at,state,error FROM log_sources;
        DROP TABLE log_sources;
        ALTER TABLE log_sources_v3 RENAME TO log_sources;
        CREATE TABLE active_profile (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          instance_id INTEGER NOT NULL REFERENCES instances(id)
        );
        INSERT INTO active_profile(id,instance_id) VALUES (1,1);
        CREATE INDEX idx_termination_attempts_instance_time ON termination_attempts(instance_id,attempted_at);
        CREATE INDEX idx_log_sources_instance ON log_sources(instance_id);
        CREATE INDEX idx_log_events_source_time ON log_events(source_id,event_time);
      `);
      const localUser = process.env.PGUSER?.trim() || "postgres";
      db.prepare("UPDATE instances SET db_user=? WHERE id=1").run(localUser);
      if (!hadLegacyInstance) {
        const localPort = Number(process.env.PGPORT);
        db.prepare(`UPDATE instances SET host=?,port=?,monitor_database=? WHERE id=1`).run(
          process.env.PGHOST?.trim() || "localhost",
          Number.isInteger(localPort) && localPort >= 1 && localPort <= 65535 ? localPort : 5432,
          process.env.PGDATABASE?.trim() || "postgres",
        );
      }
      const broken = db.prepare("PRAGMA foreign_key_check").all();
      if (broken.length) throw new Error("SQLite migration foreign key check failed");
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    if (version < 3) db.exec("PRAGMA foreign_keys = ON");
  }
}

class Storage {
  constructor(filePath) {
    this.filePath = filePath;
    const existed = fs.existsSync(filePath);
    this.db = new DatabaseSync(filePath);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA journal_mode = WAL");
    try {
      const oldVersion = Number(this.db.prepare("PRAGMA user_version").get().user_version);
      if (existed && oldVersion < SCHEMA_VERSION) {
        const backupPath = `${filePath}.v${oldVersion}-${Date.now()}-${process.pid}.backup`;
        // VACUUM INTO includes committed WAL data. Abort migration if it fails.
        this.db.prepare("VACUUM INTO ?").run(backupPath);
      }
      migrate(this.db);
    }
    catch (error) { this.db.close(); throw error; }
  }

  listProfiles({ includeArchived = false } = {}) {
    const rows = this.db.prepare(`SELECT * FROM instances
      WHERE (? = 1 OR archived_at IS NULL) ORDER BY id`).all(includeArchived ? 1 : 0);
    return rows.map(profileFromRow);
  }

  getProfile(id) {
    return profileFromRow(this.db.prepare("SELECT * FROM instances WHERE id=?").get(profileId(id)));
  }

  getActiveProfileId() {
    return this.db.prepare("SELECT instance_id FROM active_profile WHERE id=1").get().instance_id;
  }

  setActiveProfileId(id) {
    id = profileId(id);
    const found = this.db.prepare("SELECT id FROM instances WHERE id=? AND archived_at IS NULL").get(id);
    if (!found) throw new Error("Profile unavailable");
    this.db.prepare("UPDATE active_profile SET instance_id=? WHERE id=1").run(id);
    return id;
  }

  createProfile(draft) {
    if (!draft || typeof draft !== "object") throw new TypeError("Invalid profile");
    const now = Date.now();
    const authMode = draft.authMode;
    if (!["session_password", "rds_iam"].includes(authMode)) throw new TypeError("Invalid auth mode");
    if (authMode === "rds_iam" && !draft.awsRegion) throw new TypeError("AWS region required");
    const row = this.db.prepare(`INSERT INTO instances(label,host,port,monitor_database,db_user,auth_mode,
      aws_region,aws_profile,tls_ca_mode,tls_ca_path,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      draft.label, draft.host, draft.port, draft.database, draft.dbUser, authMode,
      draft.awsRegion || null, draft.awsProfile || null, draft.tlsCaMode || null,
      draft.tlsCaPath || null, now, now,
    );
    const id = Number(row.lastInsertRowid);
    this.db.prepare("INSERT INTO preferences(instance_id) VALUES (?)").run(id);
    return this.getProfile(id);
  }

  updateProfile(id, changes, confirmNewOrigin = false) {
    id = profileId(id);
    const previous = this.getProfile(id);
    if (!previous || previous.archivedAt) throw new Error("Profile unavailable");
    if (!changes || typeof changes !== "object") throw new TypeError("Invalid profile");
    const identityKeys = ["host","port","database","dbUser","authMode","awsRegion","awsProfile","tlsCaMode","tlsCaPath"];
    const identityChange = identityKeys.some((key) => Object.hasOwn(changes, key) && changes[key] !== previous[key]);
    if (!identityChange) {
      if (Object.hasOwn(changes,"label")) {
        this.db.prepare("UPDATE instances SET label=?,updated_at=? WHERE id=?").run(changes.label,Date.now(),id);
      }
      return { profile: this.getProfile(id) };
    }
    if (!confirmNewOrigin) throw new Error("New origin confirmation required");
    const draft = { ...previous, ...changes };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const now = Date.now();
      const row = this.db.prepare(`INSERT INTO instances(label,host,port,monitor_database,db_user,auth_mode,
        aws_region,aws_profile,tls_ca_mode,tls_ca_path,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        draft.label,draft.host,draft.port,draft.database,draft.dbUser,draft.authMode,
        draft.awsRegion || null,draft.awsProfile || null,draft.tlsCaMode || null,draft.tlsCaPath || null,now,now);
      const newId = Number(row.lastInsertRowid);
      this.db.prepare("INSERT INTO preferences(instance_id) VALUES (?)").run(newId);
      this.db.prepare("UPDATE active_profile SET instance_id=? WHERE instance_id=?").run(newId,id);
      this.db.prepare("UPDATE instances SET archived_at=?,updated_at=? WHERE id=?").run(now,now,id);
      this.db.exec("COMMIT");
      return { profile: this.getProfile(newId), archivedProfileId: id };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  archiveProfile(id) {
    id = profileId(id);
    if (id === this.getActiveProfileId()) throw new Error("Cannot archive active profile");
    const now = Date.now();
    const result = this.db.prepare("UPDATE instances SET archived_at=?,updated_at=? WHERE id=? AND archived_at IS NULL")
      .run(now,now,id);
    if (!result.changes) throw new Error("Profile unavailable");
    return this.getProfile(id);
  }

  getPreferences(id) {
    const row = this.db.prepare("SELECT * FROM preferences WHERE instance_id = ?").get(profileId(id));
    if (!row) throw new Error("Profile unavailable");
    return {
      collectionIntervalSeconds: row.collection_interval_seconds,
      metricsRetentionDays: row.metrics_retention_days,
      logsRetentionDays: row.logs_retention_days,
      logSourcePath: row.log_source_path,
    };
  }

  updatePreferences(id, input) {
    id = profileId(id);
    const preferences = { ...this.getPreferences(id), ...input };
    for (const [key, min, max] of [
      ["collectionIntervalSeconds", 5, 3600],
      ["metricsRetentionDays", 1, 3650],
      ["logsRetentionDays", 1, 3650],
    ]) {
      if (!Number.isInteger(preferences[key]) || preferences[key] < min || preferences[key] > max) {
        throw new TypeError(`Invalid ${key}`);
      }
    }
    if (preferences.logSourcePath !== null &&
      (typeof preferences.logSourcePath !== "string" || preferences.logSourcePath.length > 4096)) {
      throw new TypeError("Invalid logSourcePath");
    }
    this.db.prepare(`UPDATE preferences SET collection_interval_seconds = ?, metrics_retention_days = ?,
      logs_retention_days = ?, log_source_path = ? WHERE instance_id = ?`).run(
      preferences.collectionIntervalSeconds, preferences.metricsRetentionDays,
      preferences.logsRetentionDays, preferences.logSourcePath, id,
    );
    return this.getPreferences(id);
  }

  /** One short transaction per cycle. No query text, client address or credential is accepted. */
  recordCycle(id, input) {
    id = profileId(id);
    if (!this.getProfile(id)) throw new Error("Profile unavailable");
    const startedAt = epoch(input.startedAt);
    const finishedAt = epoch(input.finishedAt);
    if (finishedAt < startedAt) throw new TypeError("Cycle ends before it starts");
    if (!["success", "partial", "failed"].includes(input.result)) throw new TypeError("Invalid cycle result");
    const instance = input.instance || {};
    const databases = input.databases || [];
    if (!Array.isArray(databases) || databases.length > 10000) throw new TypeError("Invalid database samples");
    const metrics = input.metrics || {};
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`UPDATE instances SET
        server_version=COALESCE(?,server_version),
        state=?,capabilities_json=CASE WHEN ?='{}' THEN capabilities_json ELSE ? END,
        last_collected_at=?,max_connections=COALESCE(?,max_connections),
        server_started_at=COALESCE(?,server_started_at) WHERE id=?`).run(
        instance.version == null ? null : String(instance.version),
        input.result === "failed" ? "unavailable" : input.result === "partial" ? "partial" : "ready",
        JSON.stringify(input.capabilities || {}), JSON.stringify(input.capabilities || {}), finishedAt,
        finiteNonnegative(instance.maxConnections),
        instance.serverStartedAt == null ? null : epoch(instance.serverStartedAt),
        id,
      );
      const cycle = this.db.prepare(`INSERT INTO collection_cycles(instance_id,started_at,finished_at,duration_ms,result,error)
        VALUES (?,?,?,?,?,?)`).run(id, startedAt, finishedAt, finishedAt - startedAt,
        input.result, input.error == null ? null : String(input.error).slice(0, 500));
      const cycleId = Number(cycle.lastInsertRowid);
      this.db.prepare(`INSERT INTO instance_samples(cycle_id,instance_id,collected_at,connections,
        active_connections,idle_connections,waiting_connections,wal_bytes,io_reads,io_writes,collection_duration_ms)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(cycleId, id, finishedAt,
        finiteNonnegative(metrics.connections), finiteNonnegative(metrics.activeConnections),
        finiteNonnegative(metrics.idleConnections), finiteNonnegative(metrics.waitingConnections),
        finiteNonnegative(metrics.walBytes), finiteNonnegative(metrics.ioReads),
        finiteNonnegative(metrics.ioWrites), finishedAt - startedAt);
      const addDatabase = this.db.prepare(`INSERT INTO database_samples(cycle_id,instance_id,collected_at,database_oid,name,
        connections,commits,rollbacks,blocks_read,cache_hits,deadlocks,temp_bytes,stats_reset)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const item of databases) {
        addDatabase.run(cycleId, id, finishedAt, Number(item.oid), String(item.name),
          finiteNonnegative(item.connections), finiteNonnegative(item.commits),
          finiteNonnegative(item.rollbacks), finiteNonnegative(item.blocksRead),
          finiteNonnegative(item.cacheHits), finiteNonnegative(item.deadlocks),
          finiteNonnegative(item.tempBytes), item.statsReset == null ? null : epoch(item.statsReset));
      }
      this.db.exec("COMMIT");
      return cycleId;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  findCycle(id, usable = false) {
    id = profileId(id);
    const where = usable ? "c.result IN ('success','partial')" : "1=1";
    const row = this.db.prepare(`SELECT c.*,s.connections,s.active_connections,s.idle_connections,
      s.waiting_connections,s.wal_bytes,s.io_reads,s.io_writes,
      i.label,i.host,i.port,i.monitor_database,i.server_version,i.max_connections,
      i.server_started_at,i.capabilities_json
      FROM collection_cycles c JOIN instance_samples s ON s.cycle_id=c.id
      JOIN instances i ON i.id=c.instance_id WHERE c.instance_id=? AND ${where}
      ORDER BY c.id DESC LIMIT 1`).get(id);
    if (!row) return null;
    return {
      id: row.id,
      startedAt: iso(row.started_at), finishedAt: iso(row.finished_at),
      collectedAt: iso(row.finished_at),
      durationMs: row.duration_ms, result: row.result, error: row.error,
      state: row.result === "failed" ? "unavailable" : row.result === "partial" ? "partial" : "ready",
      metrics: {
        connections: row.connections, activeConnections: row.active_connections,
        idleConnections: row.idle_connections, waitingConnections: row.waiting_connections,
        walBytes: row.wal_bytes, ioReads: row.io_reads, ioWrites: row.io_writes,
      },
      instance: {
        label: row.label, host: row.host, port: row.port,
        database: row.monitor_database, version: row.server_version,
        maxConnections: row.max_connections, serverStartedAt: iso(row.server_started_at),
      },
      capabilities: JSON.parse(row.capabilities_json),
    };
  }

  getLatestCycle(id) { return this.findCycle(id); }

  getCycleDiagnostics(id) {
    id = profileId(id);
    const success = this.db.prepare(`SELECT finished_at FROM collection_cycles
      WHERE instance_id=? AND result IN ('success','partial') ORDER BY id DESC LIMIT 1`).get(id);
    const failure = this.db.prepare(`SELECT finished_at,error FROM collection_cycles
      WHERE instance_id=? AND result='failed' ORDER BY id DESC LIMIT 1`).get(id);
    return { lastSuccessAt: success ? iso(success.finished_at) : null,
      lastFailureAt: failure ? iso(failure.finished_at) : null,
      lastFailure: failure?.error || null };
  }

  /** Last cycle with usable data, even when a newer cycle failed. */
  getLatestSuccessfulCycle(id) { return this.findCycle(id, true); }

  /** Exact cycle when supplied; otherwise last cycle that captured database rows. */
  getLatestDatabases(id, cycleId) {
    id = profileId(id);
    if (cycleId != null && (!Number.isInteger(cycleId) || cycleId < 1)) {
      throw new TypeError("Invalid cycle ID");
    }
    const rows = cycleId == null
      ? this.db.prepare(`SELECT d.* FROM database_samples d
          WHERE d.instance_id=? AND d.cycle_id=(SELECT max(cycle_id) FROM database_samples WHERE instance_id=?)
          ORDER BY d.name`).all(id,id)
      : this.db.prepare(`SELECT d.* FROM database_samples d WHERE d.instance_id=? AND d.cycle_id=? ORDER BY d.name`).all(id,cycleId);
    return rows.map((row) => ({
      cycleId: row.cycle_id,
      collectedAt: iso(row.collected_at),
      oid: row.database_oid,
      name: row.name,
      connections: row.connections,
      commits: row.commits,
      rollbacks: row.rollbacks,
      blocksRead: row.blocks_read,
      cacheHits: row.cache_hits,
      deadlocks: row.deadlocks,
      tempBytes: row.temp_bytes,
      statsReset: iso(row.stats_reset),
    }));
  }

  getSamples(id, period, limit = 150000) {
    id = profileId(id);
    const from = epoch(period.from);
    const to = epoch(period.to);
    if (from >= to || !Number.isInteger(limit) || limit < 1 || limit > 150000) {
      throw new TypeError("Invalid history range");
    }
    const instance = this.db.prepare(`WITH selected_cycles AS (
        SELECT id FROM collection_cycles WHERE instance_id=? AND finished_at BETWEEN ? AND ?
        ORDER BY finished_at DESC,id DESC LIMIT ?)
      SELECT c.id AS cycle_id,c.finished_at,c.result,c.duration_ms,
      s.connections,s.active_connections,s.idle_connections,s.waiting_connections,
      s.wal_bytes,s.io_reads,s.io_writes
      FROM selected_cycles selected JOIN collection_cycles c ON c.id=selected.id
      JOIN instance_samples s ON s.cycle_id=c.id
      ORDER BY c.finished_at,c.id`).all(id, from, to, limit);
    const databases = this.db.prepare(`WITH selected_cycles AS (
        SELECT id FROM collection_cycles WHERE instance_id=? AND finished_at BETWEEN ? AND ?
        ORDER BY finished_at DESC,id DESC LIMIT ?)
      SELECT d.* FROM selected_cycles selected
      JOIN database_samples d ON d.cycle_id=selected.id
      ORDER BY d.collected_at,d.cycle_id,d.database_oid`).all(id, from, to, limit);
    return {
      instance: instance.map((row) => ({ ...row, finished_at: iso(row.finished_at) })),
      databases: databases.map((row) => ({ ...row, collected_at: iso(row.collected_at), stats_reset: iso(row.stats_reset) })),
    };
  }

  recordTerminationAttempt(id, input) {
    id = profileId(id);
    if (!Number.isInteger(input.pid) || input.pid < 1) throw new TypeError("Invalid PID");
    const errorCode = typeof input.error === "string" && /^[A-Z0-9]{5}$/.test(input.error)
      ? input.error : input.error == null ? null : "operation_failed";
    const row = this.db.prepare(`INSERT INTO termination_attempts(instance_id,attempted_at,pid,backend_start,
      database_name,user_name,application_name,confirmed,result,error) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
      id, epoch(input.attemptedAt || Date.now()), input.pid, epoch(input.backendStart),
      input.database == null ? null : String(input.database),
      input.user == null ? null : String(input.user),
      input.application == null ? null : String(input.application),
      input.confirmed ? 1 : 0, input.result,
      errorCode);
    return Number(row.lastInsertRowid);
  }

  getLogSource(id, filePath) {
    return this.db.prepare("SELECT * FROM log_sources WHERE instance_id=? AND path = ?")
      .get(profileId(id),filePath) || null;
  }

  recordLogBatch(id, input) {
    id = profileId(id);
    const events = input.events || [];
    if (!Array.isArray(events) || events.length > 1000) throw new TypeError("Invalid log batch");
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`INSERT INTO log_sources(instance_id,path,file_identity,offset_bytes,file_size,last_ingested_at,state,error)
        VALUES (?,?,?,?,?,?,'ready',NULL) ON CONFLICT(instance_id,path) DO UPDATE SET
        file_identity=excluded.file_identity,offset_bytes=excluded.offset_bytes,
        file_size=excluded.file_size,last_ingested_at=excluded.last_ingested_at,state='ready',error=NULL`).run(
        id,input.path, input.fileIdentity, input.offsetBytes, input.fileSize, Date.now());
      const source = this.getLogSource(id,input.path);
      const insert = this.db.prepare(`INSERT OR IGNORE INTO log_events
        (source_id,file_identity,offset_bytes,event_time,ingested_at,severity,database_name,user_name,pid,sql_state,message)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
      let inserted = 0;
      for (const event of events) {
        const result = insert.run(source.id, input.fileIdentity, event.offsetBytes,
          epoch(event.eventAt), Date.now(), event.severity || null, event.database || null,
          event.user || null, event.pid || null, event.sqlState || null,
          String(event.message || "").slice(0, 10000));
        inserted += result.changes;
      }
      this.db.exec("COMMIT");
      return inserted;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  recordLogFailure(id, filePath, message) {
    this.db.prepare(`INSERT INTO log_sources(instance_id,path,state,error) VALUES (?,?,'unavailable',?)
      ON CONFLICT(instance_id,path) DO UPDATE SET state='unavailable',error=excluded.error`).run(
      profileId(id),filePath, String(message).slice(0, 500));
  }

  getLogs(id, filters) {
    const clauses = ["s.instance_id=?", "e.event_time BETWEEN ? AND ?"];
    const params = [profileId(id),epoch(filters.period.from), epoch(filters.period.to)];
    for (const [column, key] of [["severity", "severity"], ["database_name", "database"], ["user_name", "user"], ["pid", "pid"]]) {
      if (filters[key] != null && filters[key] !== "") { clauses.push(`e.${column} = ?`); params.push(filters[key]); }
    }
    if (filters.search) { clauses.push("e.message LIKE ? ESCAPE '\\'"); params.push(`%${filters.search.replace(/[\\%_]/g, "\\$&")}%`); }
    const where = clauses.join(" AND ");
    const total = this.db.prepare(`SELECT count(*) AS count FROM log_events e JOIN log_sources s ON s.id=e.source_id WHERE ${where}`).get(...params).count;
    const limit = filters.page.limit;
    const offset = Number(filters.page.cursor || 0);
    const rows = this.db.prepare(`SELECT e.id,e.event_time,e.ingested_at,e.severity,e.database_name,e.user_name,e.pid,e.sql_state,e.message
      FROM log_events e JOIN log_sources s ON s.id=e.source_id WHERE ${where} ORDER BY e.event_time DESC,e.id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
      .map((row) => ({ id: row.id, eventAt: iso(row.event_time), ingestedAt: iso(row.ingested_at),
        severity: row.severity || "UNKNOWN", database: row.database_name, user: row.user_name,
        pid: row.pid, sqlState: row.sql_state, message: row.message }));
    return { rows, total, nextCursor: offset + rows.length < total ? String(offset + rows.length) : undefined };
  }

  prune(id, now = Date.now()) {
    id = profileId(id);
    const prefs = this.getPreferences(id);
    const metricsBefore = now - prefs.metricsRetentionDays * 86400000;
    const logsBefore = now - prefs.logsRetentionDays * 86400000;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const cycles = this.db.prepare("DELETE FROM collection_cycles WHERE id IN (SELECT id FROM collection_cycles WHERE instance_id=? AND finished_at < ? ORDER BY id LIMIT 1000)").run(id,metricsBefore).changes;
      const logs = this.db.prepare("DELETE FROM log_events WHERE id IN (SELECT e.id FROM log_events e JOIN log_sources s ON s.id=e.source_id WHERE s.instance_id=? AND e.event_time < ? ORDER BY e.id LIMIT 1000)").run(id,logsBefore).changes;
      this.db.exec("COMMIT");
      return { cycles, logs };
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  getStorageBytes() {
    return [this.filePath, `${this.filePath}-wal`, `${this.filePath}-shm`]
      .reduce((sum, file) => sum + (fs.existsSync(file) ? fs.statSync(file).size : 0), 0);
  }

  close() { this.db.close(); }
}

function openStorage(userDataPath) {
  if (typeof userDataPath !== "string" || !path.isAbsolute(userDataPath)) {
    throw new TypeError("Absolute userData path required");
  }
  fs.mkdirSync(userDataPath, { recursive: true });
  return new Storage(path.join(userDataPath, FILE_NAME));
}

module.exports = { openStorage, Storage, DEFAULT_PREFERENCES, SCHEMA_VERSION, FILE_NAME };
