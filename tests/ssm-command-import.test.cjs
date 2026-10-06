const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSsmCommand}=require('../electron/ssm-command-import.cjs');
const base='aws ssm start-session --document-name AWS-StartPortForwardingSessionToRemoteHost';
const host='test.abc.sa-east-1.rds.amazonaws.com';
const expected={host,port:5432,awsRegion:'sa-east-1',ssmTarget:'i-0123456789abcdef0',ssmLocalPort:15432};
function failure(text,code){assert.throws(()=>parseSsmCommand(text),e=>e.code===code&&!e.message.includes('SECRET_SENTINEL'));}
test('literal example maps only supplied fields and accepts executable/order/options/quotes',()=>{
 const c=`${base} --region sa-east-1 --target i-0123456789abcdef0 --parameters host="${host}",portNumber="5432",localPortNumber="15432"`;
 assert.deepEqual(parseSsmCommand(c).patch,expected);
 assert.deepEqual(parseSsmCommand(c.replace('aws ','aws.exe ').replace('--region sa-east-1','--region=sa-east-1')).patch,expected);
 assert.deepEqual(parseSsmCommand(c.replace('--target i-0123456789abcdef0',"--target 'i-'0123456789abcdef0")).patch,expected);
 assert.deepEqual(parseSsmCommand(`${base} --profile team.dev`).patch,{awsProfile:'team.dev'});
 assert.deepEqual(parseSsmCommand(base).missingFields,['host','awsRegion','ssmTarget']);
});
test('JSON and shorthand lists/terminal quotes/continuations remain equivalent',()=>{
 for(const p of [`host=["${host}"],portNumber=['5432'],localPortNumber=[15432]`,`'{"host":["${host}"],"portNumber":"5432","localPortNumber":["15432"]}'`,`{"host": "${host}", "portNumber": ["5432"], "localPortNumber": "15432"}`]){
  for(const cont of [' \\\n ',' `\r\n ']) assert.deepEqual(parseSsmCommand(`${base}${cont}--region sa-east-1 --target i-0123456789abcdef0 --parameters ${p}`).patch,expected);
 }
});
test('duplicates, escaped JSON keys, malformed parameters and residual arguments rejected',()=>{
 for(const suffix of ['--region sa-east-1 --region sa-east-1','--parameters host=a,host=b','--parameters \'{"host":"a","h\\u006fst":"b"}\'','--parameters \'{"host":null}\'','--parameters \'{"host":123}\'','--parameters \'{"host":[]}\'','--parameters \'{"host":["a","b"]}\'','--parameters host=[a,b]','--parameters host=a,','--parameters host=a trailing','--parameters \'{"host":"a"}x\'','--region']) failure(`${base} ${suffix}`,'SSM_IMPORT_INVALID_SYNTAX');
});
test('unsupported operations/options/files/wrappers and document rejected safely',()=>{
 for(const c of ['sudo '+base,'C:\\aws.exe ssm start-session',base+' --unknown SECRET_SENTINEL',base+' --parameters other=SECRET_SENTINEL',base+' --parameters file://SECRET_SENTINEL',base.replace('RemoteHost','BAD'),'aws ssm start-session']) failure(c,'SSM_IMPORT_UNSUPPORTED_COMMAND');
});
test('shell markers rejected even quoted, multiline independent commands and controls rejected',()=>{
 for(const marker of [';','&&','||','|','>','<','$HOME','$(x)','${x}','`x`','%PATH%']) failure(`${base} --profile 'SECRET_SENTINEL${marker}'`,'SSM_IMPORT_UNSAFE_CONTENT');
 failure(`${base}\n${base}`,'SSM_IMPORT_INVALID_SYNTAX');
 for(const c of [null,'',' ',base+'\0',base+'\x1b',base+'\r']) failure(c,'SSM_IMPORT_INVALID_INPUT');
 failure(base+' --aws-secret-access-key SECRET_SENTINEL','SSM_IMPORT_UNSAFE_CONTENT');
});
test('UTF8 byte boundary checked before parsing and scalar violations use safe errors',()=>{
 assert.deepEqual(parseSsmCommand(base+' '.repeat(16384-Buffer.byteLength(base))).patch,{});
 failure(base+' '.repeat(16385-Buffer.byteLength(base)),'SSM_IMPORT_INVALID_INPUT');
 failure(base+'界'.repeat(6000),'SSM_IMPORT_INVALID_INPUT');
 for(const suffix of ['--target i-BAD','--region bad','--profile -bad','--parameters portNumber=0','--parameters localPortNumber=65536',`--region us-east-1 --parameters host=${host}`,'--parameters host=localhost']) failure(`${base} ${suffix}`,'INVALID_INPUT');
});
test('JSON outer double quotes support terminal escapes without erasing unsafe markers',()=>{
 const raw=JSON.stringify({host,portNumber:['5432']});
 const escaped='"'+raw.replaceAll('"','\\"')+'"';
 assert.deepEqual(parseSsmCommand(`${base} --parameters ${escaped}`).patch,{host,port:5432});
 failure(`${base} --parameters '{"host":"a\\u0024HOME.sa-east-1.rds.amazonaws.com"}'`,'INVALID_INPUT');
 failure(`${base} --parameters '{"host":"a","\\u0068ost":"b"}'`,'SSM_IMPORT_INVALID_SYNTAX');
 failure(`${base} --parameters '{"host":"a"} {"host":"b"}'`,'SSM_IMPORT_INVALID_SYNTAX');
});
test('import is synchronous and performs no process/network/storage work',()=>{
 const Module=require('node:module');const original=Module._load;const disallowed=['node:child_process','child_process','electron','node:net','net','node:https','https','./storage.cjs','./connection-profiles.cjs'];
 Module._load=function(id,...args){assert.ok(!disallowed.includes(id));return original.call(this,id,...args);};
 try {delete require.cache[require.resolve('../electron/ssm-command-import.cjs')];const parser=require('../electron/ssm-command-import.cjs');for(let i=0;i<100;i++)assert.equal(parser.parseSsmCommand(base).patch.host,undefined);} finally {Module._load=original;}
});
