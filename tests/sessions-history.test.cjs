const test = require("node:test");
const assert = require("node:assert/strict");
const { createSessionHistory } = require("../electron/sessions-history.cjs");
const { COLUMNS, toCsv } = require("../electron/export.cjs");

const first = "2026-09-25T10:00:00.000Z";
const second = "2026-09-25T10:01:00.000Z";
const third = "2026-09-25T10:02:00.000Z";
const row = (pid, backendStart = "2026-09-25T09:00:00.000000Z", extra = {}) => ({
  pid, backendStart, databaseOid: 1, database: "db", user: "user",
  application: "app", state: "idle", backendType: "client backend",
  waitEventType: null, waitEvent: null, queryStartedAt: null,
  transactionStartedAt: null, activeDurationMs: null, ...extra,
});
const snapshot = (history, profileId, observedAt, rows) => history.reconcile({
  profileId, generation: 1, observedAt, rows,
});

test("valid absence finishes once; invalid and stale snapshots cannot change history", () => {
  const history = createSessionHistory();
  snapshot(history, 1, first, [row(10)]);
  assert.throws(() => snapshot(history, 1, second, [row(10), row(10)]));
  assert.throws(() => snapshot(history, 1, second, [{ ...row(10), backendStart: null }]));
  assert.equal(history.project(1).rows[0].finishedAt, null);
  snapshot(history, 1, second, []);
  assert.equal(history.project(1).rows[0].finishedAt, second);
  assert.equal(snapshot(history, 1, first, [row(10)]), false);
  snapshot(history, 1, third, []);
  assert.equal(history.project(1).rows[0].finishedAt, second);
  assert.equal(history.isFinished(1, row(10)), true);
});

test("profiles and reused PIDs have distinct histories; filtered page cannot infer absence", () => {
  const history = createSessionHistory();
  const reused = row(10, "2026-09-25T09:30:00.000000Z", { database: "other" });
  snapshot(history, 1, first, [row(10), row(11)]);
  snapshot(history, 2, first, [row(10)]);
  snapshot(history, 1, second, [row(11), reused]);
  assert.equal(history.project(1).total, 3);
  assert.equal(history.project(2).total, 1);
  assert.equal(history.project(2).rows[0].finishedAt, null);
  assert.equal(history.project(1, { state: "finished" }).rows[0].backendStart, row(10).backendStart);
  assert.equal(history.project(1, { database: "other" }).rows[0].finishedAt, null);
  const page = history.project(1, { page: { limit: 1, cursor: "0" }, sortBy: "pid" });
  assert.equal(page.total, 3);
  assert.equal(page.nextCursor, "1");
  assert.equal(history.project(1, { page: { limit: 1, cursor: "1" }, sortBy: "pid" }).rows.length, 1);
});

test("finishedAt ordering, combined filters and full CSV projection remain coherent", () => {
  const history = createSessionHistory();
  snapshot(history, 1, first, [row(1), row(2), row(3, undefined, { database: "else" })]);
  snapshot(history, 1, second, [row(2), row(3, undefined, { database: "else" })]);
  snapshot(history, 1, third, [row(3, undefined, { database: "else" })]);
  const filtered = history.project(1, { state: "finished", database: "db", sortBy: "finishedAt",
    sortDirection: "asc", page: { limit: 1, cursor: "0" } });
  assert.equal(filtered.total, 2);
  assert.equal(filtered.rows[0].pid, 1);
  assert.equal(filtered.nextCursor, "1");
  assert.deepEqual(filtered.byState, {});
  const all = history.project(1, { state: "finished", database: "db", page: { limit: 1, cursor: "1" } }, { all: true });
  assert.equal(all.rows.length, 2);
  const csv = toCsv(all.rows, COLUMNS.sessions);
  assert.match(csv, /Finalizada em/);
  assert.match(csv, /finished/);
  assert.doesNotMatch(csv, /clientAddress|queryText/);
});
