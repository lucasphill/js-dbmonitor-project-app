const fs = require("node:fs");

const MAX_READ = 1024 * 1024;

function parseCsvRecord(record) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < record.length; i += 1) {
    const char = record[i];
    if (char === '"') {
      if (quoted && record[i + 1] === '"') { field += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { fields.push(field); field = ""; }
    else field += char;
  }
  if (quoted) throw new Error("Linha CSV incompleta");
  fields.push(field);
  return fields;
}

function completeRecords(buffer, baseOffset) {
  const records = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 34) {
      if (quoted && buffer[i + 1] === 34) i += 1;
      else quoted = !quoted;
    }
    if (buffer[i] === 10 && !quoted) {
      const end = buffer[i - 1] === 13 ? i - 1 : i;
      records.push({ offsetBytes: baseOffset + start, text: buffer.subarray(start, end).toString("utf8") });
      start = i + 1;
    }
  }
  return { records, nextOffset: baseOffset + start };
}

function eventFromRecord(record) {
  const values = parseCsvRecord(record.text);
  if (values.length < 14) throw new Error("Linha CSV sem campos obrigatórios");
  const time = Date.parse(values[0]);
  if (!Number.isFinite(time)) throw new Error("Horário de log inválido");
  const pid = values[3] ? Number(values[3]) : null;
  return {
    offsetBytes: record.offsetBytes,
    eventAt: new Date(time).toISOString(),
    user: values[1] || null,
    database: values[2] || null,
    pid: Number.isSafeInteger(pid) && pid > 0 ? pid : null,
    severity: values[11] || "UNKNOWN",
    sqlState: values[12] || null,
    message: values[13] || "",
  };
}

function ingestCsvLog(storage, profileId, filePath) {
  if (!filePath) return { state: "unavailable", reason: "Fonte CSV não configurada", inserted: 0 };
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error("A fonte configurada não é um arquivo");
    const fileIdentity = `${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
    const saved = storage.getLogSource(profileId, filePath);
    const offset = saved?.file_identity === fileIdentity && stat.size >= saved.offset_bytes ? saved.offset_bytes : 0;
    const length = Math.min(stat.size - offset, MAX_READ);
    if (length === 0) {
      storage.recordLogBatch(profileId, { path: filePath, fileIdentity, offsetBytes: offset, fileSize: stat.size, events: [] });
      return { state: "ready", inserted: 0 };
    }
    const handle = fs.openSync(filePath, "r");
    const buffer = Buffer.alloc(length);
    try { fs.readSync(handle, buffer, 0, length, offset); }
    finally { fs.closeSync(handle); }
    const parsed = completeRecords(buffer, offset);
    if (parsed.records.length === 0 && length === MAX_READ) throw new Error("Linha CSV excede 1 MiB");
    const events = [];
    let invalid = 0;
    for (const record of parsed.records) {
      try { events.push(eventFromRecord(record)); }
      catch { invalid += 1; }
    }
    const inserted = storage.recordLogBatch(profileId, { path: filePath, fileIdentity,
      offsetBytes: parsed.nextOffset, fileSize: stat.size, events });
    return { state: invalid ? "partial" : "ready", inserted, invalid };
  } catch (error) {
    storage.recordLogFailure(profileId, filePath, error.code || "LOG_SOURCE_ERROR");
    return { state: "unavailable", reason: "Não foi possível ler a fonte CSV", inserted: 0 };
  }
}

module.exports = { parseCsvRecord, completeRecords, eventFromRecord, ingestCsvLog };
