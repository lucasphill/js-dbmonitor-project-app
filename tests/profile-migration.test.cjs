const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { openStorage, FILE_NAME } = require("../electron/storage.cjs");

function fixture(populated = true, corrupt = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bdash-migration-"));
  const db = new DatabaseSync(path.join(directory, FILE_NAME));
  db.exec(`
    CREATE TABLE instances(id INTEGER PRIMARY KEY CHECK(id=1),label TEXT NOT NULL,host TEXT NOT NULL,
      port INTEGER NOT NULL,monitor_database TEXT NOT NULL,server_version TEXT,state TEXT NOT NULL,
      capabilities_json TEXT NOT NULL,last_collected_at INTEGER,max_connections INTEGER,server_started_at INTEGER);
    CREATE TABLE preferences(id INTEGER PRIMARY KEY CHECK(id=1),collection_interval_seconds INTEGER NOT NULL,
      metrics_retention_days INTEGER NOT NULL,logs_retention_days INTEGER NOT NULL,log_source_path TEXT,filters_json TEXT NOT NULL);
    CREATE TABLE collection_cycles(id INTEGER PRIMARY KEY,instance_id INTEGER NOT NULL REFERENCES instances(id),
      started_at INTEGER NOT NULL,finished_at INTEGER NOT NULL,duration_ms INTEGER NOT NULL,result TEXT NOT NULL,error TEXT);
    CREATE TABLE instance_samples(cycle_id INTEGER PRIMARY KEY REFERENCES collection_cycles(id) ON DELETE CASCADE,
      instance_id INTEGER NOT NULL REFERENCES instances(id),collected_at INTEGER NOT NULL,connections INTEGER,
      active_connections INTEGER,idle_connections INTEGER,waiting_connections INTEGER,wal_bytes INTEGER,
      io_reads INTEGER,io_writes INTEGER,collection_duration_ms INTEGER);
    CREATE TABLE database_samples(cycle_id INTEGER NOT NULL REFERENCES collection_cycles(id) ON DELETE CASCADE,
      instance_id INTEGER NOT NULL REFERENCES instances(id),collected_at INTEGER NOT NULL,database_oid INTEGER NOT NULL,
      name TEXT NOT NULL,connections INTEGER,commits INTEGER,rollbacks INTEGER,blocks_read INTEGER,cache_hits INTEGER,
      deadlocks INTEGER,temp_bytes INTEGER,stats_reset INTEGER,PRIMARY KEY(cycle_id,database_oid));
    CREATE TABLE log_sources(id INTEGER PRIMARY KEY,path TEXT NOT NULL UNIQUE,file_identity TEXT,offset_bytes INTEGER NOT NULL,
      file_size INTEGER,last_ingested_at INTEGER,state TEXT NOT NULL,error TEXT);
    CREATE TABLE log_events(id INTEGER PRIMARY KEY,source_id INTEGER NOT NULL REFERENCES log_sources(id) ON DELETE CASCADE,
      file_identity TEXT NOT NULL,offset_bytes INTEGER NOT NULL,event_time INTEGER NOT NULL,ingested_at INTEGER NOT NULL,
      severity TEXT,database_name TEXT,user_name TEXT,pid INTEGER,sql_state TEXT,message TEXT NOT NULL,
      UNIQUE(source_id,file_identity,offset_bytes));
    CREATE TABLE termination_attempts(id INTEGER PRIMARY KEY,instance_id INTEGER NOT NULL REFERENCES instances(id),
      attempted_at INTEGER NOT NULL,pid INTEGER NOT NULL,backend_start INTEGER NOT NULL,database_name TEXT,
      user_name TEXT,application_name TEXT,confirmed INTEGER NOT NULL,result TEXT NOT NULL,error TEXT);
    PRAGMA user_version=2;
  `);
  if (populated) {
    db.exec(`
      INSERT INTO instances VALUES(1,'Legado','localhost',5432,'postgres','16','ready','{}',1000,100,0);
      INSERT INTO preferences VALUES(1,20,45,8,'C:/postgres.csv','{}');
      INSERT INTO collection_cycles VALUES(3,1,1000,1000,0,'success',NULL);
      INSERT INTO instance_samples VALUES(3,1,1000,5,2,3,0,NULL,NULL,NULL,0);
      INSERT INTO database_samples VALUES(3,1,1000,123,'postgres',5,10,0,0,10,0,0,NULL);
      INSERT INTO log_sources VALUES(9,'C:/postgres.csv','file',42,42,1000,'ready',NULL);
      INSERT INTO log_events VALUES(12,9,'file',0,1000,1000,'LOG','postgres','postgres',42,'00000','legacy log');
      INSERT INTO termination_attempts VALUES(6,1,1000,42,1000,'postgres','postgres','psql',1,'success',NULL);
    `);
  } else {
    db.exec("INSERT INTO preferences VALUES(1,15,30,7,NULL,'{}')");
  }
  if (corrupt) {
    db.exec("PRAGMA foreign_keys=OFF");
    db.exec("INSERT INTO termination_attempts VALUES(7,999,1000,1,1000,NULL,NULL,NULL,0,'failed',NULL)");
  }
  db.close();
  return directory;
}

function cleanup(directory) { fs.rmSync(directory, { recursive: true, force: true }); }

test("v2 populated migration preserves id 1 and all history with valid FKs", () => {
  const dir = fixture();
  const previousUser = process.env.PGUSER;
  try {
    process.env.PGUSER = "local_operator";
    const storage = openStorage(dir);
    assert.equal(storage.getActiveProfileId(), 1);
    assert.equal(storage.getProfile(1).label, "Legado");
    assert.equal(storage.getProfile(1).dbUser, "local_operator");
    assert.equal(storage.getPreferences(1).logSourcePath, "C:/postgres.csv");
    assert.equal(storage.getLatestCycle(1).metrics.connections, 5);
    assert.equal(storage.getLatestDatabases(1)[0].name, "postgres");
    assert.equal(storage.db.prepare("SELECT instance_id FROM log_sources WHERE id=9").get().instance_id, 1);
    assert.equal(storage.db.prepare("SELECT instance_id FROM termination_attempts WHERE id=6").get().instance_id, 1);
    assert.deepEqual(storage.db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(storage.db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    const backupName = fs.readdirSync(dir).find((name) => name.endsWith(".backup"));
    assert.ok(backupName, "a migration backup must exist");
    const backup = new DatabaseSync(path.join(dir, backupName));
    assert.equal(backup.prepare("PRAGMA user_version").get().user_version, 2);
    assert.equal(backup.prepare("SELECT count(*) AS n FROM collection_cycles").get().n, 1);
    backup.close();
    storage.close();
    const reopened = openStorage(dir);
    assert.equal(reopened.getLatestCycle(1).id, 3);
    reopened.close();
  } finally {
    if (previousUser === undefined) delete process.env.PGUSER;
    else process.env.PGUSER = previousUser;
    cleanup(dir);
  }
});

test("v2 empty migration creates usable local profile", () => {
  const dir = fixture(false);
  const previous = Object.fromEntries(["PGHOST","PGPORT","PGDATABASE","PGUSER"].map((key)=>[key,process.env[key]]));
  try {
    Object.assign(process.env,{PGHOST:"127.0.0.1",PGPORT:"5544",PGDATABASE:"observability",PGUSER:"observer"});
    const storage = openStorage(dir);
    assert.equal(storage.getProfile(1).authMode, "legacy_env");
    assert.equal(storage.getProfile(1).host, "127.0.0.1");
    assert.equal(storage.getProfile(1).port, 5544);
    assert.equal(storage.getProfile(1).database, "observability");
    assert.equal(storage.getProfile(1).dbUser, "observer");
    assert.equal(storage.getLatestCycle(1), null);
    assert.deepEqual(storage.db.prepare("PRAGMA foreign_key_check").all(), []);
    storage.close();
  } finally {
    for (const [key,value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key]=value;
    }
    cleanup(dir);
  }
});

test("migration rolls back corrupt v2 data and keeps original schema/version", () => {
  const dir = fixture(true, true);
  try {
    assert.throws(() => openStorage(dir), /foreign key check failed/);
    const db = new DatabaseSync(path.join(dir,FILE_NAME));
    assert.equal(db.prepare("PRAGMA user_version").get().user_version, 2);
    assert.equal(db.prepare("SELECT count(*) AS n FROM log_events").get().n, 1);
    assert.ok(db.prepare("SELECT sql FROM sqlite_master WHERE name='instances'").get().sql.includes("CHECK(id=1)"));
    db.close();
  } finally { cleanup(dir); }
});
