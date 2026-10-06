const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createProfileController}=require('../electron/connection-profiles.cjs');
const profile={id:2,label:'Private',host:'prod.xxx.sa-east-1.rds.amazonaws.com',port:5432,database:'postgres',dbUser:'rds_user',authMode:'rds_iam_ssm',awsRegion:'sa-east-1',awsProfile:null,tlsCaMode:'bundled',tlsCaPath:null,ssmTarget:'i-0ca44a45bc4d13da3',ssmLocalPort:null};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const sessions=new Map(),manager=new EventEmitter(),calls=[];
 manager.acquire=async(p)=>{
  const key=JSON.stringify([p.host,p.port,p.ssmTarget,p.ssmLocalPort]);
  let session=sessions.get(key);
  if(!session){session={key,leases:0,closed:false,listeners:[],host:'127.0.0.1',port:15432};sessions.set(key,session);calls.push('open');}
  session.leases++;let released=false;
  return {key,host:session.host,port:session.port,session,release:async()=>{if(released)return;released=true;session.leases--;calls.push('release');if(!session.leases){session.closed=true;sessions.delete(key);}}};
 };
 manager.close=async key=>{const s=sessions.get(key);if(s){s.closed=true;s.listeners.forEach(fn=>fn());sessions.delete(key);}calls.push('close');};
 manager.closeAll=async()=>{for(const key of sessions.keys())await manager.close(key);};
 const profiles=new Map([[2,profile],[1,{id:1,label:'Local',host:'localhost',port:5432,database:'postgres',dbUser:'postgres',authMode:'legacy_env'}]]);
 let selected=2,starts=0;
 const db={setActiveProfile:async()=>{},closeDatabase:async()=>{},invalidateTransport:async()=>{},testConnection:async()=>({status:'success',stage:'complete',message:'safe'})};
 const controller=createProfileController({storage:{getActiveProfileId:()=>selected,getProfile:id=>profiles.get(id),setActiveProfileId:id=>{selected=id;},listProfiles:()=>[...profiles.values()]},db,tunnelManager:manager,collectorFactory:()=>({start:()=>{starts++;},stopAndWait:async()=>{},refreshNow:async()=>calls.push('refresh')})});
 return {controller,manager,db,sessions,calls,starts:()=>starts};
}
test('test shares active transport and releases only its own lease',async()=>{
 const f=fixture();try{
  await f.controller.start();const context=f.controller.publicContext();const runtime=f.controller.getConnectionStatus();
  const result=await f.controller.test(2,null,{requestId:'shared'});
  assert.equal(result.status,'success');assert.equal(result.requestId,'shared');
  assert.equal(f.calls.filter(c=>c==='open').length,1);assert.equal([...f.sessions.values()][0].leases,1);
  assert.deepEqual(f.controller.publicContext(),context);assert.deepEqual(f.controller.getConnectionStatus(),runtime);assert.equal(f.starts(),1);
 }finally{await f.controller.stop();}
});
test('draft test owns isolated transport and releases it without changing active origin',async()=>{
 const f=fixture();try{
  await f.controller.start();const context=f.controller.publicContext();const {id,...draft}=profile;
  await f.controller.test({...draft,ssmTarget:'i-1234abcd'},null,{requestId:'isolated'});
  assert.equal(f.calls.filter(c=>c==='open').length,2);assert.equal(f.sessions.size,1);assert.deepEqual(f.controller.publicContext(),context);
 }finally{await f.controller.stop();}
});
test('cancel aborts query promptly and preserves shared active lease',async()=>{
 const f=fixture();try{
  await f.controller.start();
  f.db.testConnection=(_p,_password,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('secret from child')),{once:true}));
  const pending=f.controller.test(2,null,{requestId:'cancel_me'});await tick();
  assert.deepEqual(f.controller.cancelTest('cancel_me'),{canceled:true});
  const result=await pending;assert.equal(result.code,'CONNECTION_CANCELED');assert.equal(result.canceled,true);
  assert.doesNotMatch(JSON.stringify(result),/secret/);assert.equal([...f.sessions.values()][0].leases,1);assert.equal(f.controller.getConnectionStatus().state,'connected');
 }finally{await f.controller.stop();}
});
test('switch invalidates shared test lease; late result cannot mutate active runtime',async()=>{
 const f=fixture();try{
  await f.controller.start();
  f.db.testConnection=(_p,_password,{transport})=>new Promise((_resolve,reject)=>transport.session.listeners.push(()=>reject(Object.assign(new Error('private SessionId token'),{code:'SSM_TUNNEL_LOST'}))));
  const pending=f.controller.test(2,null,{requestId:'switching'});await tick();await f.controller.switchTo(1);
  const result=await pending;assert.equal(result.status,'failed');assert.equal(result.code,'SSM_TUNNEL_LOST');assert.doesNotMatch(JSON.stringify(result),/SessionId|token/);
  assert.equal(f.controller.publicContext().profileId,1);assert.equal(f.sessions.size,0);
 }finally{await f.controller.stop();}
});
test('IAM test refuses password and duplicate operation IDs before acquisition',async()=>{
 const f=fixture();try{
  await assert.rejects(f.controller.test(profile,'password',{requestId:'bad'}));assert.equal(f.calls.length,0);
  let finish;f.db.testConnection=()=>new Promise(resolve=>{finish=resolve;});
  const first=f.controller.test(2,null,{requestId:'duplicate'});await tick();
  await assert.rejects(f.controller.test(2,null,{requestId:'duplicate'}),/Identificador/);
  finish({status:'success',stage:'complete'});await first;
 }finally{await f.controller.stop();}
});
test('cleanup rejection never replaces sanitized connection result',async()=>{
 const f=fixture();
 f.manager.acquire=async()=>({key:'broken',host:'127.0.0.1',port:15432,release:async()=>{throw new Error('SECRET_CLEANUP_STDERR');}});
 try{const result=await f.controller.test(2,null,{requestId:'cleanup'});assert.equal(result.status,'success');assert.ok(result.cleanupWarning);assert.doesNotMatch(JSON.stringify(result),/SECRET_CLEANUP_STDERR/);}
 finally{await f.controller.stop();}
});
