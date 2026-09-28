# Export Contracts

This contract describes the renderer-to-main export request and the files intended for users and external analysis. All request fields are validated in the Electron main process; renderer data never supplies rows, arbitrary output paths, HTML, or trusted profile labels.

## Renderer to preload request

```ts
interface ExportRequest {
  sourceContext: { profileId: number; generation: number };
  format: "csv" | "json" | "pdf";
  dataset: "database-activity" | "sessions" | "logs" | "executive-summary";
  period?: { from: string; to: string };
  sessionFilters?: SessionFilters;
  logFilters?: LogFilters;
}
```

Constraints:

- `executive-summary` is accepted only for `pdf`.
- `csv` and `json` accept only `database-activity`, `sessions` or `logs`.
- Source context is required and must match the active profile/generation.
- Activity, log and executive summary requests require a valid selected period. Session data is labeled as a current observed snapshot; period does not imply historical sessions.
- Filters are limited to fields already supported by the application; unsupported keys and invalid date/page values are rejected.

## Preload result

```ts
interface ExportResult {
  sourceContext?: { profileId: number; generation: number };
  canceled: boolean;
  cancelReason?: "destination" | "privacy";
  filePath?: string;
  format?: "csv" | "json" | "pdf";
  rowCount: number;
  empty?: boolean;
  truncated?: boolean;
  message?: string;
}
```

Cancellation is a normal, non-error result and does not create a file. An empty result is returned separately with `empty: true`, no file path and row count zero. Validation, source-context, generation and filesystem failures use the existing safe IPC error wrapper. Success is returned only after the file is written and the source context has been revalidated.

## JSON document

```json
{
  "schemaVersion": 1,
  "application": "DBMonitor",
  "generatedAt": "2026-09-28T12:00:00.000Z",
  "source": {
    "profile": "Local PostgreSQL",
    "database": "postgres"
  },
  "dataset": "database-activity",
  "period": {
    "from": "2026-09-28T11:00:00.000Z",
    "to": "2026-09-28T12:00:00.000Z"
  },
  "availability": {
    "state": "available",
    "notes": []
  },
  "fields": [
    { "key": "connections", "label": "Conexões", "type": "integer", "unit": "connections", "meaning": "Current database connection count" },
    { "key": "transactionsInPeriod", "label": "Transações no período", "type": "integer|null", "unit": "transactions", "meaning": "Observed increase across valid comparable samples" }
  ],
  "rowCount": 1,
  "truncated": false,
  "records": []
}
```

Records retain native JSON types and use the stable keys described in `fields`. Each field definition provides a type, unit when applicable, and meaning including whether the value is a current snapshot, period change, rate or accumulated counter. Timestamps are ISO 8601 with UTC or explicit offset. Null remains `null`; no-data conditions are described under availability rather than inferred from a zero row count. No secrets, query text, client address or hostname are serialized.

## CSV document

- UTF-8 with BOM and CRLF line endings remain supported for spreadsheet use.
- The first row remains a conventional field-name header; values continue to use CSV escaping and formula neutralization.
- Append context columns for source profile label, database, generation timestamp, dataset, period context, availability state and limitation notes. Repeat those values per row; keep the existing dataset-specific columns first. Profile label and database name are included; hostname/endpoint is omitted.
- If no rows match, report the empty result and do not create a file that lacks the required context values.
- Preserve the current column meaning for each dataset; use blank cell only for a null data value where CSV cannot represent JSON null, and document this limitation in the metadata.

## PDF executive summary

The PDF contains, in reading order:

1. Report title, DBMonitor name, profile/database identity, selected interval and generation time.
2. Short summary of the observed state with no unsupported causal diagnosis.
3. Available key indicators grouped by overview/connections, database activity, performance and log coverage.
4. Explicit data coverage, optional-source limitations, gaps and insufficient-sample caveats.

The PDF excludes raw log messages, session query text, client addresses and authentication material. All textual content must be escaped before rendering. It has a visible “Resumo executivo” designation so it is not confused with a complete audit export.

## Privacy disclosure

Before choosing/writing an export containing sessions or logs, explain the included categories. Session exports may identify users, applications, PIDs, databases and wait states. Log exports may include message text emitted by PostgreSQL and identifying fields. The person may cancel without creating a file. Do not use disclosure as a substitute for excluding credentials and fields that are not part of the safe export schema.
