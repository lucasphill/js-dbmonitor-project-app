const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage } = require("../electron/storage.cjs");

function withStorage(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bdash-profiles-"));
  let storage;
  try { storage = openStorage(directory); return run(storage,directory); }
  finally { storage?.close(); fs.rmSync(directory, { recursive: true, force: true }); }
}

function draft(label, host) {
  return { label, host, port: 5432, database: "postgres", dbUser: "monitor_user",
    authMode: "rds_iam", awsRegion: "sa-east-1", awsProfile: null,
    tlsCaMode: "bundled", tlsCaPath: null };
}

function cycle(storage,id,at,connections) {
  storage.recordCycle(id,{ startedAt: at, finishedAt: at, result: "success",
    instance: { label: "UNTRUSTED", host: "evil.invalid", version: "17" },
    metrics: { connections }, databases: [{ oid: 1, name: "postgres", connections }] });
}

test("three profiles isolate history, logs, preferences, pruning and audit", () => withStorage((s) => {
  const a = s.createProfile(draft("Production", "prod.example.rds.amazonaws.com"));
  const b = s.createProfile(draft("Development", "dev.example.rds.amazonaws.com"));
  assert.deepEqual(s.listProfiles().map((p) => p.id), [1,a.id,b.id]);
  const old = "2020-01-01T00:00:00Z";
  const recent = "2026-09-23T12:00:00Z";
  cycle(s,1,recent,1);
  cycle(s,a.id,old,2);
  cycle(s,b.id,recent,3);
  assert.equal(s.getProfile(a.id).host, "prod.example.rds.amazonaws.com");
  assert.equal(s.getProfile(a.id).label, "Production");
  assert.equal(s.getLatestCycle(1).metrics.connections, 1);
  assert.equal(s.getLatestCycle(a.id).metrics.connections, 2);
  assert.equal(s.getLatestCycle(b.id).metrics.connections, 3);
  assert.equal(s.getLatestDatabases(a.id).length, 1);
  assert.equal(s.getLatestDatabases(1,s.getLatestCycle(a.id).id).length, 0);
  assert.equal(s.getSamples(a.id,{from:"2019-01-01",to:"2027-01-01"}).instance.length,1);
  assert.equal(s.getSamples(b.id,{from:"2019-01-01",to:"2027-01-01"}).instance.length,1);
  assert.equal(s.getCycleDiagnostics(a.id).lastSuccessAt,new Date(old).toISOString());
  s.updatePreferences(a.id,{metricsRetentionDays:1,logsRetentionDays:1,logSourcePath:"C:/a.csv"});
  assert.equal(s.getPreferences(b.id).logSourcePath,null);
  assert.equal(s.getPreferences(a.id).logSourcePath,"C:/a.csv");
  for (const id of [1,a.id,b.id]) {
    s.recordLogBatch(id,{path:"C:/shared.csv",fileIdentity:"one",offsetBytes:10,fileSize:10,
      events:[{offsetBytes:0,eventAt:id===a.id?old:recent,message:`profile-${id}`}]});
    s.recordTerminationAttempt(id,{pid:42,backendStart:recent,result:"protected",confirmed:false});
  }
  const filters = {period:{from:"2019-01-01",to:"2027-01-01"},page:{limit:10,cursor:"0"}};
  assert.equal(s.getLogs(a.id,filters).rows[0].message,`profile-${a.id}`);
  assert.equal(s.getLogs(b.id,filters).total,1);
  assert.notEqual(s.getLogSource(a.id,"C:/shared.csv").id,s.getLogSource(b.id,"C:/shared.csv").id);
  assert.equal(s.db.prepare("SELECT count(*) AS n FROM termination_attempts WHERE instance_id=?").get(a.id).n,1);
  const removed = s.prune(a.id,new Date(recent).getTime());
  assert.equal(removed.cycles,1);
  assert.equal(removed.logs,1);
  assert.equal(s.getLatestCycle(a.id),null);
  assert.equal(s.getLatestCycle(b.id).metrics.connections,3);
  assert.equal(s.getLogs(b.id,filters).total,1);
  assert.deepEqual(s.db.prepare("PRAGMA foreign_key_check").all(),[]);
}));

test("rename keeps identity; origin edit creates id and archives old history", () => withStorage((s,directory) => {
  const first = s.createProfile(draft("Prod","prod.example.rds.amazonaws.com"));
  s.setActiveProfileId(first.id);
  cycle(s,first.id,"2026-09-23T12:00:00Z",4);
  const renamed = s.updateProfile(first.id,{label:"Production"});
  assert.equal(renamed.profile.id,first.id);
  assert.throws(() => s.updateProfile(first.id,{host:"new.example.rds.amazonaws.com"}),/confirmation/);
  const changed = s.updateProfile(first.id,{host:"new.example.rds.amazonaws.com"},true);
  assert.equal(changed.archivedProfileId,first.id);
  assert.notEqual(changed.profile.id,first.id);
  assert.equal(s.getActiveProfileId(),changed.profile.id);
  assert.equal(s.getLatestCycle(changed.profile.id),null);
  assert.equal(s.getLatestCycle(first.id).metrics.connections,4);
  assert.equal(s.listProfiles().some((p)=>p.id===first.id),false);
  assert.equal(s.listProfiles({includeArchived:true}).find((p)=>p.id===first.id).archivedAt!==null,true);
  assert.throws(() => s.archiveProfile(changed.profile.id),/active/);
  s.setActiveProfileId(1);
  s.archiveProfile(changed.profile.id);
  assert.throws(() => s.setActiveProfileId(changed.profile.id),/unavailable/);
  s.close();
  const reopened = openStorage(directory);
  assert.equal(reopened.getActiveProfileId(),1);
  assert.equal(reopened.getLatestCycle(first.id).metrics.connections,4);
  reopened.close();
  // The helper closes the first handle again; replace with an already closed no-op.
  s.close = () => {};
}));

test("profile persistence ignores secret-bearing extra properties", () => withStorage((s) => {
  const token = "SENSITIVE_TOKEN_SENTINEL";
  const profile = s.createProfile({...draft("Prod","prod.example.rds.amazonaws.com"),password:token,awsSecretAccessKey:token});
  assert.equal(profile.password,undefined);
  assert.equal(profile.awsSecretAccessKey,undefined);
  const contents = fs.readFileSync(s.filePath).toString("utf8")+
    (fs.existsSync(`${s.filePath}-wal`)?fs.readFileSync(`${s.filePath}-wal`).toString("utf8"):"");
  assert.equal(contents.includes(token),false);
}));
