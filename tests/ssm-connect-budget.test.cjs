const test=require('node:test');const assert=require('node:assert/strict');const db=require('../electron/db.cjs');
const p={id:9,label:'SSM',host:'test.abc.sa-east-1.rds.amazonaws.com',port:5432,database:'postgres',dbUser:'observer',authMode:'rds_iam_ssm',awsRegion:'sa-east-1',tlsCaMode:'bundled',ssmTarget:'i-0123456789abcdef0'};
test('IAM establishment has a separate bounded budget from metric queries',()=>{
 const transport={host:'127.0.0.1',port:15432};const config=db.connectionConfig(p,null,{transport});
 assert.equal(config.host,'127.0.0.1');assert.equal(config.port,15432);assert.equal(config.ssl.servername,p.host);
 assert.equal(config.connectionTimeoutMillis,30000);assert.equal(config.query_timeout,3500);
 const bounded=db.connectionConfig(p,null,{transport,deadline:Date.now()+4500});assert.ok(bounded.connectionTimeoutMillis<=4500&&bounded.connectionTimeoutMillis>3000);
 assert.equal(db.connectionConfig({id:1,host:'localhost',port:5432,database:'postgres',dbUser:'postgres',authMode:'legacy_env'}).connectionTimeoutMillis,3000);
});
test('closing an SSM database never exposes the default local origin or a pool',async()=>{
 await db.setActiveProfile(p,null,{transport:{host:'127.0.0.1',port:15432}});
 await db.closeDatabase();assert.equal(db.currentProfile().id,9);assert.throws(()=>db.getPool(),{code:'SSM_TUNNEL_LOST'});
 await db.setActiveProfile({id:1,host:'localhost',port:5432,database:'postgres',dbUser:'postgres',authMode:'legacy_env'});await db.closeDatabase();
});
