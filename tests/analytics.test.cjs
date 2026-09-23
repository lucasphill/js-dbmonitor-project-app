const assert = require("node:assert/strict");
const test = require("node:test");
const { rankDatabases, buildDatabaseActivity, queryLatencyBlock } = require("../electron/analytics.cjs");

const at = (seconds) => new Date(Date.UTC(2026, 8, 23, 12, 0, seconds)).toISOString();
const sample = (cycle, oid, name, commits, rollbacks, reset = at(0)) => ({
  cycle_id: cycle, database_oid: oid, name, collected_at: at((cycle - 1) * 15),
  connections: 2, commits, rollbacks, blocks_read: commits, cache_hits: commits * 2,
  stats_reset: reset,
});

test("ranking uses transaction deltas by OID across a rename", () => {
  const rows = [
    sample(1, 10, "old", 10, 2), sample(1, 20, "other", 4, 1),
    sample(2, 10, "renamed", 18, 3), sample(2, 20, "other", 6, 1),
  ];
  const ranking = rankDatabases(rows);
  assert.equal(ranking.rows[0].oid, 10);
  assert.equal(ranking.rows[0].name, "renamed");
  assert.equal(ranking.rows[0].transactionsInPeriod, 9);
  assert.equal(ranking.rows[1].transactionsInPeriod, 2);
  assert.equal(ranking.rows[0].connections, 2);
});

test("reset, falling counter, and gap do not create spikes", () => {
  const rows = [sample(1, 10, "db", 10, 2), sample(2, 10, "db", 18, 2),
    sample(3, 10, "db", 1, 0, at(30)), sample(4, 10, "db", 4, 1, at(30))];
  assert.equal(rankDatabases(rows).rows[0].transactionsInPeriod, 12);
  const gapRows = [sample(1, 10, "db", 1, 0),
    { ...sample(4, 10, "db", 500, 0), collected_at: at(59) }];
  assert.equal(rankDatabases(gapRows).rows[0].transactionsInPeriod, null);
  const activity = buildDatabaseActivity({ databases: gapRows, instance: [] });
  assert.equal(activity.ranking.state, "insufficient");
  assert.equal(activity.transactionsSeries.data.at(-1).value, null);
});

test("unavailable latency is not a numeric zero", () => {
  const block = queryLatencyBlock({ available: false, reason: "extension disabled" }, []);
  assert.equal(block.state, "unavailable");
  assert.equal(block.data, undefined);
  assert.equal(block.reason, "extension disabled");
});
