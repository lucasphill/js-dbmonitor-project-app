const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const tls=require('node:tls');
const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');
const {connectionConfig,testConnection}=require('../electron/db.cjs');
const fixtures=path.join(__dirname,'helpers','tls');
const endpoint='test.sa-east-1.rds.amazonaws.com';
const profile={authMode:'rds_iam_ssm',host:endpoint,port:5432,database:'postgres',dbUser:'rds_user',awsRegion:'sa-east-1',ssmTarget:'i-0123456789abcdef0',tlsCaMode:'custom',tlsCaPath:path.join(fixtures,'test-ca.pem')};
const i32=value=>{const b=Buffer.alloc(4);b.writeInt32BE(value);return b;};
const packet=(tag,payload)=>Buffer.concat([Buffer.from(tag),i32(payload.length+4),payload]);
const auth=code=>packet('R',i32(code));
const ready=()=>packet('Z',Buffer.from('I'));
async function serverFixture(){
 const context=tls.createSecureContext({key:fs.readFileSync(path.join(fixtures,'test-server.key')),cert:fs.readFileSync(path.join(fixtures,'test-server.pem'))});
 const sockets=new Set(),seen={sni:[],passwords:[],queries:0,sslRequests:0};
 const server=net.createServer(socket=>{
  sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  socket.once('data',first=>{
   assert.equal(first.readInt32BE(0),8);assert.equal(first.readInt32BE(4),80877103);seen.sslRequests++;
   socket.write('S');
   const secure=new tls.TLSSocket(socket,{isServer:true,secureContext:context,SNICallback(name,callback){seen.sni.push(name);callback(null,context);}});
   sockets.add(secure);secure.on('close',()=>sockets.delete(secure));secure.on('error',()=>{});
   let buffer=Buffer.alloc(0),startup=true;
   secure.on('data',data=>{
    buffer=Buffer.concat([buffer,data]);
    while(buffer.length>=(startup?4:5)){
     const length=buffer.readInt32BE(startup?0:1),total=length+(startup?0:1);
     if(buffer.length<total)return;
     const message=buffer.subarray(0,total);buffer=buffer.subarray(total);
     if(startup){startup=false;assert.equal(message.readInt32BE(4),196608);secure.write(auth(3));continue;}
     const tag=String.fromCharCode(message[0]);
     if(tag==='p'){seen.passwords.push(message.subarray(5,-1).toString());secure.write(Buffer.concat([auth(0),ready()]));}
     else if(tag==='Q'){seen.queries++;secure.write(Buffer.concat([packet('C',Buffer.from('SELECT 1\0')),ready()]));}
     else if(tag==='X'){secure.end();}
    }
   });
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {seen,transport:{host:'127.0.0.1',port:server.address().port},close:async()=>{for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));}};
}
test('locked pg performs TLS over loopback preserving original RDS SNI and refreshes token per physical client',async()=>{
 const f=await serverFixture();let issued=0;const calls=[];
 const options={transport:f.transport,tokenProvider:async p=>{calls.push([p.host,p.port]);return `SYNTHETIC_TOKEN_${++issued}`;}};
 let existing;
 try{
  existing=new Client(connectionConfig(profile,null,options));await existing.connect();await existing.query('SELECT 1');
  const result=await testConnection(profile,null,options);assert.equal(result.status,'success');
  await existing.query('SELECT 1');assert.equal(issued,2);assert.equal(f.seen.queries,3);
  assert.deepEqual(f.seen.sni,[endpoint,endpoint]);assert.deepEqual(calls,[[endpoint,5432],[endpoint,5432]]);
  assert.deepEqual(f.seen.passwords,['SYNTHETIC_TOKEN_1','SYNTHETIC_TOKEN_2']);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_TOKEN/);
 }finally{await existing?.end();await f.close();}
});
test('locked pg refuses a certificate name mismatch through loopback before sending IAM token',async()=>{
 const f=await serverFixture();let issued=0;
 try{
  const result=await testConnection({...profile,host:'wrong.sa-east-1.rds.amazonaws.com'},null,{transport:f.transport,tokenProvider:()=>{issued++;return 'SECRET';}});
  assert.equal(result.status,'failed');assert.equal(result.code,'TLS_VALIDATION_FAILED');assert.equal(issued,0);assert.equal(f.seen.passwords.length,0);
 }finally{await f.close();}
});
test('locked pg refuses an untrusted CA through loopback before sending IAM token',async()=>{
 const f=await serverFixture();let issued=0;
 try{
  const result=await testConnection({...profile,tlsCaMode:'bundled'},null,{transport:f.transport,tokenProvider:()=>{issued++;return 'SECRET';}});
  assert.equal(result.status,'failed');assert.equal(result.code,'TLS_VALIDATION_FAILED');assert.equal(issued,0);assert.equal(f.seen.passwords.length,0);
 }finally{await f.close();}
});
