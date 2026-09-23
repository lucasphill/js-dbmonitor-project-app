const test = require("node:test");
const assert = require("node:assert/strict");
const { createCollector } = require("../electron/collector.cjs");

test("collector never overlaps manual refreshes and records one cycle", async () => {
  let resolveCollection;
  let calls = 0;
  const recorded = [];
  const collector = createCollector({
    collectSnapshot: () => { calls++; return new Promise((resolve) => { resolveCollection = resolve; }); },
    storage: { recordCycle: (profileId, snapshot) => {
      assert.equal(profileId, 1);
      recorded.push(snapshot);
    } },
  });
  const first = collector.refreshNow();
  assert.equal((await collector.refreshNow()).state, "running");
  assert.equal(calls, 1);
  const snapshot = { result: "success", collectedAt: new Date().toISOString() };
  resolveCollection(snapshot);
  assert.equal((await first).state, "success");
  assert.deepEqual(recorded, [snapshot]);
  assert.equal(collector.getLatest(), snapshot);
});

test("collector refuses a new cycle while a profile switch drains it", async () => {
  let resolveCollection;
  let calls = 0;
  const collector = createCollector({
    collectSnapshot: () => { calls += 1; return new Promise((resolve) => { resolveCollection = resolve; }); },
  });
  const first = collector.refreshNow();
  const draining = collector.stopAndWait();
  await collector.refreshNow();
  assert.equal(calls, 1);
  resolveCollection({ result: "failed", finishedAt: new Date().toISOString() });
  await first;
  await draining;
  assert.equal(calls, 1);
});
