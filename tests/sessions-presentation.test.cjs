const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function source(file) { return fs.readFileSync(path.join(__dirname, "..", file), "utf8"); }

test("finished sessions explain the observed estimate and open sessions show no end time", () => {
  const explanation = source("lib/explanations.ts");
  const table = source("app/components/sessions-table.tsx");
  assert.match(explanation, /primeira ausência da conexão observada/i);
  assert.match(table, /sortHeader\("Finalizada em", "finishedAt", "session-finished"\)/);
  assert.match(table, /row\.finishedAt\s*\?\s*formatTimestamp\(row\.finishedAt\)\s*:\s*"—"/);
});
