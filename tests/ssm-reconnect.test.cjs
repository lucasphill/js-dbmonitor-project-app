const test=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {createProfileController}=require('../electron/connection-profiles.cjs');
const profile={id:2,label:'SSM',host:'prod.xxx.sa-east-1.rds.amazonaws.com',port:5432,database:'postgres',dbUser:'rds_user',authMode:'rds_iam_ssm',awsRegion:'sa-east-1',tlsCaMode:'bundled',ssmTarget:'i-0ca44a45bc4d13da3',ssmLocalPort:null};
test('new physical clients obtain distinct IAM tokens after 15 minutes; existing client remains healthy',async()=>{
 const {connectionConfig,testConnection}=require('../electron/db.cjs');
 let time=0;const tokens=[],destinations=[],connections=[];
 const tokenProvider=async p=>{destinations.push([p.host,p.port,p.awsRegion]);const value=`SYNTHETIC_IAM_${time}_${tokens.length}`;tokens.push(value);return value;};
 class Client {
  constructor(config){this.config=config;this.ended=false;connections.push(this);}
  async connect(){this.token=await this.config.password();}
  async query(){assert.equal(this.ended,false);return {rows:[{database:'postgres',db_user:'rds_user'}]};}
  async end(){this.ended=true;}
 }
 const options={transport:{host:'127.0.0.1',port:15432},tokenProvider,Client};
 const existing=new Client(connectionConfig(profile,null,options));await existing.connect();
 time=16*60*1000;
 const first=await testConnection(profile,null,options), second=await testConnection(profile,null,options);
 assert.equal(first.status,'success');assert.equal(second.status,'success');assert.equal(tokens.length,3);assert.equal(new Set(tokens).size,3);
 assert.deepEqual(destinations,Array(3).fill([profile.host,5432,'sa-east-1']));
 assert.equal(existing.ended,false);await existing.query();assert.equal(tokens.length,3);
 assert.equal(existing.config.host,'127.0.0.1');assert.equal(existing.config.port,15432);assert.equal(existing.config.ssl.servername,profile.host);assert.equal(existing.config.ssl.rejectUnauthorized,true);
 for(const token of tokens)assert.equal(JSON.stringify([first,second]).includes(token),false);await existing.end();
});
test('reconnect validates new session and rejects old context; refresh while disconnected creates no tunnel',async()=>{
 let acquired=0,queries=0,started=0,refreshed=0;
 const manager=new EventEmitter();manager.acquire=async()=>{acquired++;return {key:`session${acquired}`,host:'127.0.0.1',port:15432,release:async()=>{}};};manager.close=async()=>{};manager.closeAll=async()=>{};
 const controller=createProfileController({storage:{getActiveProfileId:()=>2,getProfile:()=>profile,setActiveProfileId:()=>{}},tunnelManager:manager,
  db:{setActiveProfile:async()=>{},closeDatabase:async()=>{},invalidateTransport:async()=>{},testConnection:async()=>{queries++;return {status:'success',stage:'complete'};}},
  collectorFactory:()=>({start:()=>{started++;},stopAndWait:async()=>{},refreshNow:async()=>{refreshed++;}})});
 try{
  await controller.start();const old=controller.publicContext();await controller.disconnect(old);
  await controller.refreshNow();await controller.refreshNow();assert.equal(acquired,1);assert.equal(refreshed,0);assert.equal(started,1);
  const active=await controller.reconnect(old);assert.equal(acquired,2);assert.equal(queries,2);assert.equal(started,2);assert.equal(active.runtime.state,'connected');assert.ok(active.generation>old.generation);
  await assert.rejects(controller.reconnect(old),{code:'PROFILE_CHANGED'});assert.equal(acquired,2);
 }finally{await controller.stop();}
});
test('failure switching away from SSM never resumes collector using a closed tunnel',async()=>{
 const local={id:1,label:'Local',host:'localhost',port:5432,database:'postgres',dbUser:'postgres',authMode:'legacy_env'};let starts=0;
 const manager=new EventEmitter();manager.acquire=async()=>({key:'session',host:'127.0.0.1',port:15432,release:async()=>{}});manager.close=async()=>{};manager.closeAll=async()=>{};
 const db={setActiveProfile:async p=>{if(p.id===1)throw new Error('cannot configure next origin');},closeDatabase:async()=>{},invalidateTransport:async()=>{},testConnection:async()=>({status:'success',stage:'complete'})};
 const controller=createProfileController({storage:{getActiveProfileId:()=>2,getProfile:id=>id===2?profile:local,setActiveProfileId:()=>{}},db,tunnelManager:manager,collectorFactory:()=>({start:()=>{starts++;},stopAndWait:async()=>{}})});
 try{await controller.start();await assert.rejects(controller.switchTo(1));assert.equal(starts,1);assert.equal(controller.getConnectionStatus().state,'failed');}
 finally{await controller.stop();}
});
test('lease drop cancels a pending database query and bounds a client that refuses to close',async()=>{
 const {testConnection}=require('../electron/db.cjs');
 const lease=new AbortController();let queries=0,destroyed=0;
 class HangingClient{
  constructor(){this.connection={stream:{destroy:()=>{destroyed++;}}};}
  async connect(){}
  query(){queries++;return new Promise(()=>{});}
  end(){return new Promise(()=>{});}
 }
 const started=Date.now();
 const pending=testConnection(profile,null,{Client:HangingClient,transport:{host:'127.0.0.1',port:15432,signal:lease.signal},tokenProvider:()=> 'synthetic'});
 await new Promise(resolve=>setImmediate(resolve));lease.abort();
 const result=await pending;
 assert.equal(result.status,'failed');assert.equal(result.code,'CONNECTION_CANCELED');assert.equal(queries,1);assert.ok(destroyed>=1);
 assert.ok(Date.now()-started<2000,'cleanup must not await a hung client indefinitely');
});
test('reconnect cannot expose default local database while old SSM cleanup is pending',async()=>{
 const actual=require('../electron/db.cjs');let finishCleanup,enteredCleanup;
 const cleanupStarted=new Promise(resolve=>{enteredCleanup=resolve;});
 const manager=new EventEmitter();manager.acquire=async()=>({key:'session',host:'127.0.0.1',port:15432,release:async()=>{}});
 manager.close=()=>{enteredCleanup();return new Promise(resolve=>{finishCleanup=resolve;});};manager.closeAll=async()=>{};
 const db={...actual,testConnection:async()=>({status:'success',stage:'complete'})};
 const controller=createProfileController({storage:{getActiveProfileId:()=>2,getProfile:()=>profile,setActiveProfileId:()=>{}},db,tunnelManager:manager,collectorFactory:()=>({start:()=>{},stopAndWait:async()=>{}})});
 let reconnect;
 try{
  await controller.start();reconnect=controller.reconnect(controller.publicContext());await cleanupStarted;
  assert.equal(actual.currentProfile().id,2,'queries during tunnel cleanup must retain unavailable SSM identity');
 }finally{
  finishCleanup?.({});await reconnect;
  manager.close=async()=>{};await controller.stop();
 }
});
