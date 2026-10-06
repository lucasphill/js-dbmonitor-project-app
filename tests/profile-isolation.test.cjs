const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage } = require("../electron/storage.cjs");
const { buildOverview } = require("../electron/overview.cjs");
const { analyzeDatabases } = require("../electron/analytics.cjs");
const { writeCsv, COLUMNS } = require("../electron/export.cjs");

function snapshot(database, connections, at) {
  return {
    startedAt: at, finishedAt: at, result: "success",
    instance: { database, version: "16", maxConnections: 100 },
    capabilities: { statements: { available: false } },
    metrics: { connections },
    databases: [{ oid: 1, name: database, connections, commits: 10,
      rollbacks: 0, blocksRead: 1, cacheHits: 9 }],
  };
}

for(const mode of ['rds_iam','rds_iam_ssm']) test(`${mode} overview and CSV export use only the selected profile's samples`, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bdash-profile-isolation-"));
  const storage = openStorage(root);
  try {
    const second = storage.createProfile({ label: "Remoto", host: "remote.sa-east-1.rds.amazonaws.com",
      port: 5432, database: "remote_db", dbUser: "observer", authMode: mode,
      awsRegion: "sa-east-1", awsProfile: null, tlsCaMode: "bundled", tlsCaPath: null,
      ssmTarget:mode==='rds_iam_ssm'?'i-0123456789abcdef0':null,ssmLocalPort:null });
    const at = "2026-09-23T12:00:00.000Z";
    const period = { from: "2026-09-23T11:00:00.000Z", to: "2026-09-23T13:00:00.000Z" };
    storage.recordCycle(1, snapshot("local_db", 3, at));
    storage.recordCycle(second.id, snapshot("remote_db", 99, at));
    const collector = { getLastUsable: () => null, getStatus: () => ({ intervalSeconds: 15 }),
      getLogStatus: () => ({ state: "unavailable" }) };
    const local = buildOverview({ collector, storage, profile: storage.getProfile(1), period,
      queryLatency: { available: false } });
    const remote = buildOverview({ collector, storage, profile: second, period,
      queryLatency: { available: false } });
    assert.equal(local.metrics.data[0].value, 3);
    assert.equal(remote.metrics.data[0].value, 99);
    assert.deepEqual(local.databases.data.map((row) => row.name), ["local_db"]);
    assert.deepEqual(remote.databases.data.map((row) => row.name), ["remote_db"]);
    const localRows = analyzeDatabases(storage.getSamples(1, period).databases).ranking;
    const csv = path.join(root, "local.csv");
    await writeCsv(csv, localRows, COLUMNS["database-activity"]);
    const exported = fs.readFileSync(csv, "utf8");
    assert.match(exported, /local_db/);
    assert.doesNotMatch(exported, /remote_db/);
  } finally {
    storage.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('imported transport edits preserve history while imported endpoint needs new origin',()=>{
 const {parseSsmCommand}=require('../electron/ssm-command-import.cjs');
 const {validateProfileDraft}=require('../electron/profile-validation.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dbmonitor-import-identity-'));const storage=openStorage(dir);
 const base='aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost';
 try{
   const patch=parseSsmCommand(base+' --region sa-east-1 --target i-0123456789abcdef0 --parameters host=test.abc.sa-east-1.rds.amazonaws.com,portNumber=5432').patch;
   const manual={host:'test.abc.sa-east-1.rds.amazonaws.com',port:5432,awsRegion:'sa-east-1',ssmTarget:'i-0123456789abcdef0',label:'Test',database:'postgres',dbUser:'observer',authMode:'rds_iam_ssm',tlsCaMode:'bundled',awsProfile:'team',ssmLocalPort:15432};
   const draft=validateProfileDraft({...manual,...patch});assert.deepEqual(draft,validateProfileDraft(manual));
   const p=storage.createProfile(draft);const at='2026-10-06T15:00:00Z';storage.recordCycle(p.id,snapshot('postgres',9,at));
   const transport=parseSsmCommand(base+' --target i-1234abcd --parameters localPortNumber=15433').patch;
   const changed=storage.updateProfile(p.id,transport).profile;assert.equal(changed.id,p.id);assert.equal(changed.awsProfile,'team');assert.equal(storage.getLatestCycle(p.id).metrics.connections,9);
   const identity=parseSsmCommand(base+' --parameters host=other.abc.sa-east-1.rds.amazonaws.com').patch;
   assert.throws(()=>storage.updateProfile(p.id,identity));const next=storage.updateProfile(p.id,identity,true);assert.equal(next.archivedProfileId,p.id);assert.notEqual(next.profile.id,p.id);assert.equal(storage.getLatestCycle(next.profile.id),null);
 }finally{storage.close();fs.rmSync(dir,{recursive:true,force:true});}
});
