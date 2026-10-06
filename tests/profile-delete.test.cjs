const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {openStorage}=require('../electron/storage.cjs');const {createProfileController}=require('../electron/connection-profiles.cjs');
const draft={label:'Disposable',host:'test.abc.sa-east-1.rds.amazonaws.com',port:5432,database:'postgres',dbUser:'observer',authMode:'rds_iam_ssm',awsRegion:'sa-east-1',tlsCaMode:'bundled',ssmTarget:'i-0123456789abcdef0'};
test('permanent deletion removes only its history/preferences and guards active origin',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dbmonitor-delete-'));const s=openStorage(dir);
 try{
  const p=s.createProfile(draft);s.recordCycle(p.id,{startedAt:1000,finishedAt:1001,result:'success',metrics:{connections:7}});
  s.archiveProfile(p.id);assert.equal(s.deleteProfile(p.id),p.id);assert.equal(s.getProfile(p.id),null);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM collection_cycles WHERE instance_id=?').get(p.id).n,0);
  assert.equal(s.db.prepare('SELECT count(*) AS n FROM preferences WHERE instance_id=?').get(p.id).n,0);
  assert.ok(s.getProfile(1));assert.equal(s.getActiveProfileId(),1);assert.deepEqual(s.db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.throws(()=>s.deleteProfile(1),/active/);assert.ok(s.getProfile(1));
  const q=s.createProfile({...draft,label:'Rollback'});s.db.exec("CREATE TRIGGER refuse_profile_delete BEFORE DELETE ON instances BEGIN SELECT RAISE(ABORT, 'refuse'); END;");
  assert.throws(()=>s.deleteProfile(q.id));assert.ok(s.getProfile(q.id));assert.ok(s.getPreferences(q.id));
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
test('controller requires confirmation and cannot delete active profile',async()=>{
 let deleted=[];const profiles=new Map([[1,{id:1,authMode:'legacy_env'}],[2,{id:2,...draft}]]);
 const c=createProfileController({storage:{getActiveProfileId:()=>1,getProfile:id=>profiles.get(id),deleteProfile:id=>{deleted.push(id);profiles.delete(id);}},db:{setActiveProfile:async()=>{},closeDatabase:async()=>{}},tunnelManager:{on(){},off(){},closeAll:async()=>{}},collectorFactory:()=>({start(){},stopAndWait:async()=>{}})});
 await c.start();await assert.rejects(c.delete(2,false));await assert.rejects(c.delete(1,true));assert.deepEqual(deleted,[]);
 assert.equal((await c.delete(2,true)).deletedId,2);assert.deepEqual(deleted,[2]);await assert.rejects(c.delete(2,true),{code:'PROFILE_NOT_FOUND'});await c.stop();
});
