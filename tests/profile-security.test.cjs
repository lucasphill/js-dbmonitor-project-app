const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { openStorage, FILE_NAME } = require("../electron/storage.cjs");
const { testConnection } = require("../electron/db.cjs");

for (const mode of ['rds_iam','rds_iam_ssm']) test(`${mode} token used by a connection callback never enters SQLite or public result`, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bdash-no-secret-"));
  const secret = "RDS_TOKEN_SENTINEL_X_AMZ_SIGNATURE_123456";
  const storage = openStorage(root);
  try {
    const profile = storage.createProfile({ label: "RDS", host: "fake.sa-east-1.rds.amazonaws.com",
      port: 5432, database: "postgres", dbUser: "monitor_user", authMode: mode,
      awsRegion: "sa-east-1", awsProfile: null, tlsCaMode: "bundled", tlsCaPath: null,
      ssmTarget: mode==='rds_iam_ssm'?'i-0123456789abcdef0':null,ssmLocalPort:null });
    class FakeClient {
      constructor(config) { this.config = config; }
      async connect() { assert.equal(await this.config.password(), secret); }
      async query() { return { rows: [{ database: "postgres", db_user: "monitor_user", server_version: "16" }] }; }
      async end() {}
    }
    const options={ Client: FakeClient, tokenProvider: () => secret,
      ...(mode==='rds_iam_ssm'?{transport:{host:'127.0.0.1',port:15432}}:{})};
    const result = await testConnection(profile, null, options);
    assert.equal(result.status, "success");
    assert.equal(JSON.stringify(result).includes(secret), false);
    class FailingClient extends FakeClient { async connect(){ await super.connect();throw Object.assign(new Error(secret),{code:'28P01'}); } }
    const failed=await testConnection(profile,null,{...options,Client:FailingClient});
    assert.equal(failed.code,'DATABASE_AUTH_FAILED');assert.equal(JSON.stringify(failed).includes(secret),false);
    const at = "2026-09-23T12:00:00.000Z";
    storage.recordCycle(profile.id, { startedAt: at, finishedAt: at, result: "success",
      instance: { database: "postgres" }, metrics: {}, databases: [], capabilities: {} });
    assert.deepEqual(storage.db.prepare("PRAGMA foreign_key_check").all(), []);
    storage.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(root, FILE_NAME + suffix);
      if (fs.existsSync(file)) assert.equal(fs.readFileSync(file).includes(Buffer.from(secret)), false);
    }
  } finally {
    try { storage.close(); } catch { /* already closed */ }
    fs.rmSync(root, { recursive: true, force: true });
  }
});


test('imported reusable profile never persists raw command or rejected secrets',()=>{
 const {parseSsmCommand}=require('../electron/ssm-command-import.cjs');
 const {validateProfileDraft}=require('../electron/profile-validation.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dbmonitor-import-secret-'));
 const storage=openStorage(dir);
 const command='aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost --region sa-east-1 --target i-0123456789abcdef0 --parameters host=test.abc.sa-east-1.rds.amazonaws.com,portNumber=5432';
 const secret='SECRET_IMPORT_SENTINEL';
 try{
   const result=parseSsmCommand(command);
   const draft=validateProfileDraft({...result.patch,label:'Imported',database:'postgres',dbUser:'observer',authMode:'rds_iam_ssm',tlsCaMode:'bundled'});
   const profile=storage.createProfile(draft);
   assert.equal(profile.ssmLocalPort,null);
   assert.throws(()=>parseSsmCommand(command+' --secret-access-key '+secret), e=>!e.message.includes(secret));
   assert.doesNotMatch(JSON.stringify(storage.listProfiles()),/aws ssm start-session|SECRET_IMPORT_SENTINEL/);
   storage.close();
   for(const suffix of ['', '-wal', '-shm']){
     const file=path.join(dir,FILE_NAME+suffix);
     if(fs.existsSync(file)){const bytes=fs.readFileSync(file);assert.equal(bytes.includes(Buffer.from(command)),false);assert.equal(bytes.includes(Buffer.from(secret)),false);}
   }
 }finally{try{storage.close();}catch{}fs.rmSync(dir,{recursive:true,force:true});}
});
