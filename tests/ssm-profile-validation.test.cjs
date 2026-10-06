const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../electron/profile-validation.cjs');
const draft = { label:'Private RDS',host:'prod-rds.xxx.sa-east-1.rds.amazonaws.com',port:5432,database:'postgres',dbUser:'rds_user',authMode:'rds_iam_ssm',awsRegion:'sa-east-1',ssmTarget:'i-0ca44a45bc4d13da3' };
test('SSM validates remote identity and normalizes automatic port',()=> {
  assert.equal(v.validateProfileDraft(draft).ssmLocalPort,null);
  assert.equal(v.validateProfileDraft({...draft,ssmLocalPort:15432}).ssmLocalPort,15432);
  assert.equal(v.validateProfileDraft({...draft,ssmTarget:'i-1234abcd'}).ssmTarget,'i-1234abcd');
});
test('SSM rejects unsafe target, ports, region and secret fields',()=> {
  for(const changes of [{ssmTarget:'i-123;whoami'},{ssmTarget:'mi-1234abcd'},{ssmLocalPort:0},{ssmLocalPort:65536},{ssmLocalPort:'15432'},{awsRegion:'us-east-1'},{token:'secret'},{password:'secret'}]) assert.throws(()=>v.validateProfileDraft({...draft,...changes}));
});
test('existing modes retain nullable SSM fields and reject transport values',()=> {
  const direct={...draft,authMode:'rds_iam',ssmTarget:null};
  assert.equal(v.validateProfileDraft(direct).ssmLocalPort,null);
  assert.throws(()=>v.validateProfileDraft({...direct,ssmTarget:draft.ssmTarget}));
});
test('transport changes preserve historical identity',()=> {
  const current=v.validateProfileDraft(draft), next={...current,ssmLocalPort:15432};
  assert.equal(v.profileIdentityChanged(current,next),false);
  assert.equal(v.profileTransportChanged(current,next),true);
  assert.equal(v.profileTransportChanged(current,{...current,label:'renamed'}),false);
  assert.equal(v.profileIdentityChanged(current,{...current,dbUser:'other'}),true);
  assert.equal(v.isRdsIamProfile(current),true);
});
test('partial SSM import validates supplied scalars without inventing defaults',()=> {
 assert.deepEqual(v.validateSsmImportPatch({}),{});
 assert.deepEqual(v.validateSsmImportPatch({awsRegion:'sa-east-1'}),{awsRegion:'sa-east-1'});
 assert.deepEqual(v.validateSsmImportPatch({host:draft.host,ssmTarget:draft.ssmTarget,port:5432}),{host:draft.host,ssmTarget:draft.ssmTarget,port:5432});
 for(const patch of [{host:'localhost'},{host:draft.host,awsRegion:'us-east-1'},{awsProfile:null},{ssmLocalPort:null},{port:'5432'},{password:'SECRET_SENTINEL'},{authMode:'rds_iam_ssm'}]) assert.throws(()=>v.validateSsmImportPatch(patch),e=>e.code==='INVALID_INPUT'&&!e.message.includes('SECRET_SENTINEL'));
 assert.throws(()=>v.validateProfileDraft({host:draft.host,awsRegion:draft.awsRegion,ssmTarget:draft.ssmTarget}));
});
