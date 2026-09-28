"use strict";

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

function datasetColumns(dataset) {
  const columns = COLUMNS[dataset];
  if (!columns) throw new TypeError("Unsupported export dataset");
  return columns;
}

const CONTEXT_COLUMNS = [
  ["Relatório", "reportApplication"], ["Perfil de origem", "reportProfile"],
  ["Banco de origem", "reportDatabase"], ["Gerado em (UTC)", "reportGeneratedAt"],
  ["Conjunto", "reportDataset"], ["Período", "reportPeriod"],
  ["Disponibilidade", "reportAvailability"], ["Ressalvas", "reportAvailabilityNotes"],
];

function csvColumns(dataset, withContext = false) {
  return withContext ? [...datasetColumns(dataset), ...CONTEXT_COLUMNS] : datasetColumns(dataset);
}

function toJson({ dataset, rows, generatedAt, source, period, filters, availability, truncated = false }) {
  const fields = FIELD_DEFINITIONS[dataset];
  if (!fields) throw new TypeError("Unsupported JSON export dataset");
  const records = rows.map((row) => Object.fromEntries(fields.map(({ key }) => [key, row[key] ?? null])));
  return `${JSON.stringify({
    schemaVersion: 1,
    application: "DBMonitor",
    generatedAt,
    source: { profile: source.profile, database: source.database },
    dataset,
    period,
    filters: filters || {},
    availability,
    fields,
    rowCount: records.length,
    truncated,
    records,
  }, null, 2)}\n`;
}

function writeCsv(filePath, rows, columns, context) {
  const data = context
    ? rows.map((row) => ({ ...row,
      reportApplication: "DBMonitor",
      reportProfile: context.source.profile,
      reportDatabase: context.source.database,
      reportGeneratedAt: context.generatedAt,
      reportDataset: context.datasetLabel,
      reportPeriod: context.periodLabel,
      reportAvailability: context.availability,
      reportAvailabilityNotes: context.availabilityNotes.join("; "),
    }))
    : rows;
  const actualColumns = context ? [...columns, ...CONTEXT_COLUMNS] : columns;
  fs.writeFileSync(filePath, toCsv(data, actualColumns), { encoding: "utf8" });
  return { canceled: false, filePath, rowCount: rows.length, truncated: context?.truncated || false };
}

const COLUMNS = {
  "database-activity": [["Banco", "name"], ["OID", "oid"], ["Transações no período", "transactionsInPeriod"],
    ["Conexões", "connections"], ["Commits acumulados", "commits"], ["Rollbacks acumulados", "rollbacks"],
    ["Blocos lidos no período", "readsInPeriod"], ["Cache hits no período", "cacheHitsInPeriod"]],
  sessions: [["PID", "pid"], ["Início da sessão", "backendStart"], ["Banco", "database"],
    ["Usuário", "user"], ["Aplicação", "application"], ["Estado", "state"], ["Finalizada em", "finishedAt"],
    ["Espera", "waitEvent"], ["Duração ativa (ms)", "activeDurationMs"]],
  logs: [["Horário", "eventAt"], ["Severidade", "severity"], ["Banco", "database"],
    ["Usuário", "user"], ["PID", "pid"], ["SQLSTATE", "sqlState"], ["Mensagem", "message"]],
};

const FIELD_DEFINITIONS = {
  "database-activity": [
    { key: "oid", label: "Database object identifier", type: "integer", unit: null, meaning: "PostgreSQL database identity within this source." },
    { key: "name", label: "Banco", type: "string", unit: null, meaning: "Database name." },
    { key: "connections", label: "Conexões", type: "integer|null", unit: "connections", meaning: "Current connection count in the latest sample in the period." },
    { key: "commits", label: "Commits acumulados", type: "integer|null", unit: "transactions", meaning: "Cumulative confirmed transactions since the PostgreSQL statistics reset." },
    { key: "rollbacks", label: "Rollbacks acumulados", type: "integer|null", unit: "transactions", meaning: "Cumulative rolled-back transactions since the PostgreSQL statistics reset; does not imply failure." },
    { key: "blocksRead", label: "Blocos lidos", type: "integer|null", unit: "blocks", meaning: "Cumulative blocks read in the latest sample." },
    { key: "cacheHits", label: "Cache hits", type: "integer|null", unit: "blocks", meaning: "Cumulative blocks served from cache in the latest sample." },
    { key: "statsReset", label: "Reset das estatísticas", type: "timestamp|null", unit: null, meaning: "Most recent known PostgreSQL statistics reset time." },
    { key: "transactionsInPeriod", label: "Transações no período", type: "integer|null", unit: "transactions", meaning: "Observed increase in commits plus rollbacks across comparable samples." },
    { key: "readsInPeriod", label: "Blocos lidos no período", type: "integer|null", unit: "blocks", meaning: "Observed increase in blocks read across comparable samples." },
    { key: "cacheHitsInPeriod", label: "Cache hits no período", type: "integer|null", unit: "blocks", meaning: "Observed increase in cache hits across comparable samples." },
  ],
  sessions: [
    { key: "pid", label: "PID", type: "integer", unit: null, meaning: "PostgreSQL backend process identifier; pair with backendStart to identify the session." },
    { key: "backendStart", label: "Início da sessão", type: "timestamp", unit: null, meaning: "Observed session start time." },
    { key: "databaseOid", label: "Database object identifier", type: "integer|null", unit: null, meaning: "PostgreSQL database identity within this source." },
    { key: "database", label: "Banco", type: "string|null", unit: null, meaning: "Database used by the session." },
    { key: "user", label: "Usuário", type: "string|null", unit: null, meaning: "PostgreSQL role used by the session." },
    { key: "application", label: "Aplicação", type: "string", unit: null, meaning: "Client application name reported by PostgreSQL." },
    { key: "state", label: "Estado", type: "string|null", unit: null, meaning: "Last observed session state; finished means absent from a later valid observation." },
    { key: "finishedAt", label: "Finalizada em", type: "timestamp|null", unit: null, meaning: "First valid observation where a previously seen session was absent; an estimate, not the exact server termination time." },
    { key: "waitEventType", label: "Tipo de espera", type: "string|null", unit: null, meaning: "Last observed PostgreSQL wait event type." },
    { key: "waitEvent", label: "Espera", type: "string|null", unit: null, meaning: "Last observed PostgreSQL wait event." },
    { key: "backendType", label: "Tipo de backend", type: "string", unit: null, meaning: "PostgreSQL backend category." },
    { key: "queryStartedAt", label: "Início da consulta ativa", type: "timestamp|null", unit: null, meaning: "Last observed start time of an active query; omitted for query text and client address." },
    { key: "transactionStartedAt", label: "Início da transação", type: "timestamp|null", unit: null, meaning: "Last observed transaction start time." },
    { key: "activeDurationMs", label: "Duração ativa", type: "number|null", unit: "milliseconds", meaning: "Last observed active query duration; null when not applicable or after session finish." },
  ],
  logs: [
    { key: "id", label: "Event identifier", type: "integer", unit: null, meaning: "Local event identity; not a PostgreSQL sequence." },
    { key: "eventAt", label: "Horário", type: "timestamp", unit: null, meaning: "Timestamp recorded by the PostgreSQL log event." },
    { key: "ingestedAt", label: "Ingerido em", type: "timestamp", unit: null, meaning: "Time the event was ingested into local history." },
    { key: "severity", label: "Severidade", type: "string", unit: null, meaning: "Severity reported by PostgreSQL." },
    { key: "database", label: "Banco", type: "string|null", unit: null, meaning: "Database associated with the event when present." },
    { key: "user", label: "Usuário", type: "string|null", unit: null, meaning: "PostgreSQL role associated with the event when present." },
    { key: "pid", label: "PID", type: "integer|null", unit: null, meaning: "Backend process identifier associated with the event when present." },
    { key: "sqlState", label: "SQLSTATE", type: "string|null", unit: null, meaning: "PostgreSQL error code when present." },
    { key: "message", label: "Mensagem", type: "string", unit: null, meaning: "Raw message emitted by PostgreSQL; may contain sensitive operational or personal information." },
  ],
};

module.exports = { csvCell, toCsv, toJson, writeCsv, csvColumns, COLUMNS, FIELD_DEFINITIONS };
