const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { openStorage, FILE_NAME } = require("../electron/storage.cjs");

function fixture(populated = true, corrupt = false, version = 2) {
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
  if (version === 1) db.exec("ALTER TABLE instances DROP COLUMN max_connections; ALTER TABLE instances DROP COLUMN server_started_at; PRAGMA user_version=1");
  db.close();
  return directory;
}

function cleanup(directory) { fs.rmSync(directory, { recursive: true, force: true }); }

for (const version of [1,2]) test(`v${version} to v4 preserves historical IDs, preferences and backup`,()=> {
  const dir=fixture(true,false,version);
  try {
    const s=openStorage(dir);
    assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,4);
    assert.equal(s.getProfile(1).ssmTarget,null);
    assert.equal(s.getLatestCycle(1).id,3);
    assert.equal(s.getLatestDatabases(1)[0].name,'postgres');
    assert.equal(s.getPreferences(1).collectionIntervalSeconds,20);
    assert.equal(s.db.prepare('SELECT source_id FROM log_events WHERE id=12').get().source_id,9);
    assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
    assert.equal(s.db.prepare('PRAGMA foreign_keys').get().foreign_keys,1);
    const backup=new DatabaseSync(path.join(dir,fs.readdirSync(dir).find(n=>n.endsWith('.backup'))));
    assert.equal(backup.prepare('PRAGMA user_version').get().user_version,version);
    backup.close();s.close();
  } finally {cleanup(dir);}
});
const draft={label:'SSM',host:'prod.xxx.sa-east-1.rds.amazonaws.com',port:5432,database:'postgres',dbUser:'rds_user',authMode:'rds_iam_ssm',awsRegion:'sa-east-1',tlsCaMode:'bundled',ssmTarget:'i-0ca44a45bc4d13da3',ssmLocalPort:null};
test('fresh storage supports SSM; transport preserves history, identity archives',()=> {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ssm-fresh-'));
  try {
    const s=openStorage(dir), p=s.createProfile(draft);
    s.recordCycle(p.id,{startedAt:1000,finishedAt:1001,result:'success',metrics:{connections:2}});
    const updated=s.updateProfile(p.id,{ssmLocalPort:15432,ssmTarget:'i-1234abcd'}).profile;
    assert.equal(updated.id,p.id);assert.equal(updated.ssmLocalPort,15432);
    assert.equal(s.getLatestCycle(p.id).metrics.connections,2);
    assert.throws(()=>s.updateProfile(p.id,{dbUser:'other'}),/confirmation/);
    const next=s.updateProfile(p.id,{dbUser:'other'},true);
    assert.equal(next.archivedProfileId,p.id);assert.ok(s.getProfile(p.id).archivedAt);
    assert.equal(next.profile.ssmLocalPort,15432);assert.equal(s.getLatestCycle(next.profile.id),null);
    assert.throws(()=>s.db.prepare('UPDATE instances SET ssm_target=? WHERE id=1').run(draft.ssmTarget),/CHECK/);
    s.close();
  }finally{cleanup(dir);}
});
function v3Fixture(corrupt=false){
  const dir=fixture();const s=openStorage(dir);s.close();
  const db=new DatabaseSync(path.join(dir,FILE_NAME));
  db.exec('PRAGMA foreign_keys=OFF');
  db.exec("INSERT INTO instances(id,label,host,port,monitor_database,db_user,auth_mode,created_at,updated_at,archived_at) VALUES(7,'Archived','localhost',5432,'other','postgres','session_password',1000,1000,2000); INSERT INTO preferences(instance_id) VALUES(7)");
  const sql=db.prepare("SELECT sql FROM sqlite_master WHERE name='instances'").get().sql
    .replace('"instances"','instances_old').replace('CREATE TABLE instances (','CREATE TABLE instances_old (')
    .replace(/\s*ssm_target TEXT,/, '').replace(/\s*ssm_local_port INTEGER CHECK \(ssm_local_port IS NULL OR ssm_local_port BETWEEN 1 AND 65535\),/,'')
    .replace(/,\s*CHECK \(\(auth_mode='rds_iam_ssm'[\s\S]*?ssm_local_port IS NULL\)\)/,'');
  db.exec(sql);
  db.exec('INSERT INTO instances_old SELECT id,label,host,port,monitor_database,db_user,auth_mode,aws_region,aws_profile,tls_ca_mode,tls_ca_path,archived_at,created_at,updated_at,server_version,state,capabilities_json,last_collected_at,max_connections,server_started_at FROM instances; DROP TABLE instances; ALTER TABLE instances_old RENAME TO instances; PRAGMA user_version=3');
  if(corrupt)db.exec("INSERT INTO termination_attempts VALUES(7,999,1000,1,1000,NULL,NULL,NULL,0,'failed',NULL)");
  db.close();return dir;
}
test('v3 migration retains active profile and rolls back invalid foreign keys',()=>{
  const dir=v3Fixture(), broken=v3Fixture(true);
  try{
    const s=openStorage(dir);assert.equal(s.getActiveProfileId(),1);assert.equal(s.getLatestCycle(1).id,3);
    assert.equal(s.getProfile(7).label,'Archived');assert.ok(s.getProfile(7).archivedAt);
    assert.equal(s.getPreferences(7).collectionIntervalSeconds,15);s.close();
    assert.throws(()=>openStorage(broken),/foreign key check failed/);
    const db=new DatabaseSync(path.join(broken,FILE_NAME));
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,3);
    assert.equal(db.prepare('SELECT count(*) AS n FROM log_events').get().n,1);
    assert.equal(db.prepare('PRAGMA table_info(instances)').all().some(r=>r.name==='ssm_target'),false);db.close();
  }finally{cleanup(dir);cleanup(broken);}
});


