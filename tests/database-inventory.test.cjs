const test = require("node:test");
const assert = require("node:assert/strict");
const { listDatabaseInventory } = require("../electron/db.cjs");

test("database inventory pages catalog rows and measures permitted database sizes", async () => {
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("count(*)")) return { rows: [{ total: "3" }] };
    if (sql.includes("pg_database_size")) return { rows: [{ oid: 10, size_bytes: "2147483648" }] };
    return { rows: [
      { oid: 10, name: "app", owner: "monitor_user", encoding: "UTF8", collation: "pt_BR.UTF-8",
        allows_connections: true, connection_limit: -1, template: false, can_measure_size: true, connections: 4 },
      { oid: 11, name: "private", owner: "monitor_user", encoding: "UTF8", collation: "C",
        allows_connections: false, connection_limit: 0, template: false, can_measure_size: false, connections: 0 },
    ] };
  } };
  const result = await listDatabaseInventory({ limit: 2, cursor: "0" }, { client });
  assert.equal(result.total, 3);
  assert.equal(result.nextCursor, "2");
  assert.equal(result.rows[0].sizeBytes, 2_147_483_648);
  assert.equal(result.rows[1].sizeBytes, null);
  assert.equal(result.sizeIncomplete, true);
  assert.deepEqual(calls[1].params, [2, 0]);
  assert.deepEqual(calls[2].params, [[10]]);
  assert.match(calls[1].sql, /pg_stat_database/);
  assert.match(calls[2].sql, /pg_database_size/);
});

test("database inventory remains available when disk size measurement times out", async () => {
  const client = { async query(sql) {
    if (sql.includes("count(*)")) return { rows: [{ total: "1" }] };
    if (sql.includes("pg_database_size")) throw Object.assign(new Error("query timeout"), { code: "57014" });
    return { rows: [{ oid: 10, name: "app", owner: "monitor_user", encoding: "UTF8", collation: "C",
      allows_connections: true, connection_limit: -1, template: false, can_measure_size: true, connections: 1 }] };
  } };
  const result = await listDatabaseInventory({ limit: 50 }, { client });
  assert.equal(result.rows[0].name, "app");
  assert.equal(result.rows[0].sizeBytes, null);
  assert.equal(result.sizeIncomplete, true);
  assert.equal(result.nextCursor, undefined);
});

test("inventory filters and sorts in PostgreSQL before paginating", async () => {
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("count(*)")) return { rows: [{ total: "6" }] };
    if (sql.includes("pg_database_size")) return { rows: [] };
    return { rows: [{ oid: 50, name: "app_prod", owner: "team", encoding: "UTF8", collation: "C",
      allows_connections: true, connection_limit: -1, template: false, can_measure_size: false, connections: 8 }] };
  } };
  const result = await listDatabaseInventory({ search: "app_%", owner: "team", encoding: "utf8",
    status: "available", sortBy: "connections", sortDirection: "desc", page: { limit: 1, cursor: "2" } }, { client });
  assert.equal(result.total, 6);
  assert.equal(result.nextCursor, "3");
  assert.deepEqual(calls[0].params, ["%app\\_\\%%", "%team%", "%utf8%"]);
  assert.deepEqual(calls[1].params, ["%app\\_\\%%", "%team%", "%utf8%", 1, 2]);
  assert.match(calls[0].sql, /d\.datallowconn AND NOT d\.datistemplate/);
  assert.match(calls[1].sql, /ORDER BY COALESCE\(s\.numbackends, 0\) DESC NULLS LAST/);
  assert.match(calls[1].sql, /LIMIT \$4 OFFSET \$5/);
});

test("size sort measures eligible databases before limiting the result", async () => {
  const calls = [];
  const client = { async query(sql, params) {
    calls.push({ sql, params });
    if (sql.includes("count(*)")) return { rows: [{ total: "3" }] };
    return { rows: [{ oid: 12, name: "largest", owner: "team", encoding: "UTF8", collation: "C",
      allows_connections: true, connection_limit: -1, template: false, can_measure_size: true,
      connections: 0, size_bytes: "3000000000" }] };
  } };
  const result = await listDatabaseInventory({ sortBy: "size", sortDirection: "desc", page: { limit: 1 } }, { client });
  assert.equal(result.rows[0].sizeBytes, 3_000_000_000);
  assert.equal(result.nextCursor, "1");
  assert.equal(calls.length, 2);
  assert.match(calls[1].sql, /LEFT JOIN LATERAL/);
  assert.match(calls[1].sql, /ORDER BY measured\.size_bytes DESC NULLS LAST/);
  assert.match(calls[1].sql, /LIMIT \$1 OFFSET \$2/);
  await assert.rejects(() => listDatabaseInventory({ sortBy: "d.datname; DROP TABLE pg_database" }, { client }), /Invalid database inventory sort/);
});
