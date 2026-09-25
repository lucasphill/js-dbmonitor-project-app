const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const { listSessions, collectClientSessions, revealSessionDetails, terminateSession, closeDatabase } = require("../electron/db.cjs");

test("a disposable client session can be revealed and terminated by exact identity", { skip: !process.env.BDASH_TEST_PG }, async () => {
  const client = new Client({ host: process.env.PGHOST || "localhost", port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "postgres", user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD, application_name: "bdash-disposable-test" });
  client.on("error", () => { /* expected when this disposable backend is terminated */ });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT pg_backend_pid() AS pid");
    const pid = rows[0].pid;
    const listed = await listSessions({ application: "bdash-disposable-test", page: { limit: 10, cursor: "0" } });
    const complete = await collectClientSessions();
    assert.ok(complete.rows.some((row) => row.pid === pid));
    assert.ok(complete.rows.length >= listed.rows.length);
    assert.ok(complete.rows.every((row) => row.finishedAt === null));
    const session = listed.rows.find((row) => row.pid === pid);
    assert.ok(session);
    assert.equal(session.backendStart.match(/\.\d{6}Z$/) !== null, true);
    assert.equal("query" in session, false);
    const details = await revealSessionDetails({ pid, backendStart: session.backendStart });
    assert.equal(details.state, "ready");
    const wrongStart = session.backendStart.replace(/\d(?=Z$)/, (digit) => digit === "0" ? "1" : "0");
    const changed = await terminateSession({ pid, backendStart: wrongStart });
    assert.equal(changed.status, "identity_changed");
    const ended = new Promise((resolve) => client.once("end", resolve));
    const result = await terminateSession({ pid, backendStart: session.backendStart });
    assert.equal(result.status, "success");
    await ended;
    const missing = await terminateSession({ pid, backendStart: session.backendStart });
    assert.equal(missing.status, "not_found");
  } finally {
    try { await client.end(); } catch { /* already terminated */ }
    await closeDatabase();
  }
});
