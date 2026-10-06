const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../lib/ssm-command-import.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
vm.runInNewContext(compiled, { exports: exported, Object, Error });
const { mergeSsmImport, importReplacements, ImportRevision } = exported;
const draft = { label: 'Meu perfil', host: 'test.abc.sa-east-1.rds.amazonaws.com', port: 5432, database: 'postgres', dbUser: 'reader', authMode: 'rds_iam_ssm', awsRegion: 'sa-east-1', awsProfile: 'named', tlsCaMode: 'custom', tlsCaPath: 'C:/test.pem', ssmTarget: 'i-0123456789abcdef0', ssmLocalPort: null };
const result = (patch) => ({ patch, presentFields: Object.keys(patch), missingFields: [] });
test('partial import preserves personal fields, TLS and absent preferences without mutating draft', () => {
 const before = JSON.stringify(draft);
 const merged = mergeSsmImport(draft, result({ ssmLocalPort: 15432 }));
 assert.equal(merged.ssmLocalPort, 15432);
 for (const field of Object.keys(draft).filter((key) => key !== 'ssmLocalPort')) assert.equal(merged[field], draft[field]);
 assert.equal(JSON.stringify(draft), before);
 const fresh = { ...draft, host: '', awsRegion: '', awsProfile: null, ssmTarget: '', ssmLocalPort: null };
 const incomplete = mergeSsmImport(fresh, result({ ssmTarget: 'i-12345678' }));
 assert.equal(incomplete.host, ''); assert.equal(incomplete.port, 5432); assert.equal(incomplete.awsProfile, null); assert.equal(incomplete.ssmLocalPort, null);
});
test('cross-check of preserved region refuses inconsistent patch atomically', () => {
 const before = JSON.stringify(draft);
 assert.throws(() => mergeSsmImport(draft, result({ host: 'test.abc.us-east-1.rds.amazonaws.com', ssmLocalPort: 15432 })), /região/);
 assert.equal(JSON.stringify(draft), before);
 assert.equal(mergeSsmImport(draft, result({ host: 'test.abc.us-east-1.rds.amazonaws.com', awsRegion: 'us-east-1' })).awsRegion, 'us-east-1');
});
test('preview identifies replacements without treating empty defaults as supplied values', () => {
 assert.equal(Array.from(importReplacements(draft, result({ port: 5433, ssmLocalPort: 15432 }))).join(','), 'port');
 assert.throws(() => mergeSsmImport(draft, result({ database: 'unexpected' })), /inválida/);
 assert.throws(() => mergeSsmImport({ ...draft, authMode: 'rds_iam' }, result({})), /SSM/);
});
test('edit, profile/mode change, discard and close invalidate asynchronous replies', () => {
 const revisions = new ImportRevision();
 const pending = revisions.invalidate(); assert.equal(revisions.accepts(pending), true);
 for (const event of ['text edit', 'draft edit', 'profile', 'mode', 'discard', 'close']) { revisions.invalidate(); assert.equal(revisions.accepts(pending), false); }
 const latest = revisions.invalidate(); assert.equal(revisions.accepts(latest), true); assert.equal(revisions.accepts(pending), false);
});
