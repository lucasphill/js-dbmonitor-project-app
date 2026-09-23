const fs = require("node:fs");

function csvCell(value) {
  let text = value == null ? "" : String(value);
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toCsv(rows, columns) {
  const lines = [columns.map(([label]) => csvCell(label)).join(",")];
  for (const row of rows) lines.push(columns.map(([, key]) => csvCell(row[key])).join(","));
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

function writeCsv(filePath, rows, columns) {
  fs.writeFileSync(filePath, toCsv(rows, columns), { encoding: "utf8" });
  return { canceled: false, filePath, rowCount: rows.length };
}

const COLUMNS = {
  "database-activity": [["Banco", "name"], ["OID", "oid"], ["Transações no período", "transactionsInPeriod"],
    ["Conexões", "connections"], ["Commits acumulados", "commits"], ["Rollbacks acumulados", "rollbacks"],
    ["Blocos lidos no período", "readsInPeriod"], ["Cache hits no período", "cacheHitsInPeriod"]],
  sessions: [["PID", "pid"], ["Início da sessão", "backendStart"], ["Banco", "database"],
    ["Usuário", "user"], ["Aplicação", "application"], ["Estado", "state"],
    ["Espera", "waitEvent"], ["Duração ativa (ms)", "activeDurationMs"]],
  logs: [["Horário", "eventAt"], ["Severidade", "severity"], ["Banco", "database"],
    ["Usuário", "user"], ["PID", "pid"], ["SQLSTATE", "sqlState"], ["Mensagem", "message"]],
};

module.exports = { csvCell, toCsv, writeCsv, COLUMNS };
