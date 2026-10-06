const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/connection-runtime.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const presentation = { exports: {} };
new Function('exports', 'module', compiled.outputText)(presentation.exports, presentation);
const { overviewForRuntime } = presentation.exports;

function fixture() {
  const block = (state, data) => ({ state, source: 'PostgreSQL', updatedAt: '2026-10-06T12:00:00Z', data });
  return { sourceContext: { profileId: 2, generation: 3 }, capabilities: {},
    instance: block('ready', { connected: true, database: 'postgres' }),
    metrics: block('partial', [{ label: 'Conexões abertas', value: 7 }]),
    connectionsSeries: block('ready', [{ at: '2026-10-06T12:00:00Z', value: 7 }]),
    transactionsSeries: block('insufficient', []), databases: block('empty', []) };
}
const runtime = (state, generation = 3) => ({ sourceContext: { profileId: 2, generation }, state, revision: 1, stage: 'tunnel' });

for (const state of ['connecting', 'disconnected', 'failed']) test(`${state} promptly withdraws current status without replacing measured facts`, () => {
  const original = fixture();
  const next = overviewForRuntime(original, runtime(state));
  assert.equal(next.instance.state, 'stale');
  assert.equal(next.metrics.state, 'stale');
  assert.equal(next.connectionsSeries.state, 'stale');
  assert.equal(next.metrics.data, original.metrics.data);
  assert.equal(next.metrics.data[0].value, 7);
  assert.equal(next.instance.updatedAt, original.instance.updatedAt);
  assert.equal(next.transactionsSeries, original.transactionsSeries);
  assert.equal(next.databases, original.databases);
  assert.equal(original.instance.state, 'ready');
});

test('an old origin runtime cannot alter a current overview and connected remains untouched', () => {
  const original = fixture();
  assert.equal(overviewForRuntime(original, runtime('failed', 2)), original);
  assert.equal(overviewForRuntime(original, runtime('connected')), original);
  assert.equal(overviewForRuntime(null, runtime('failed')), null);
});

test('unavailable metrics remain unavailable after disconnect rather than acquiring measured status', () => {
  const original = fixture();
  original.metrics = { state: 'unavailable', source: 'PostgreSQL', reason: 'Sem permissão' };
  assert.equal(overviewForRuntime(original, runtime('disconnected')).metrics, original.metrics);
});
