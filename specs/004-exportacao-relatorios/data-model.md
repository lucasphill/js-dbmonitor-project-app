# Data Model: Exportação de relatórios

Exports are generated on demand. They do not create new persistent application records or require a SQLite migration.

## Export Request

Represents one user's request to serialize a selected dataset or create an executive summary.

| Field | Type | Rules |
|---|---|---|
| `format` | `csv \| json \| pdf` | Required; accepted values are allowlisted in the main process |
| `dataset` | `database-activity \| sessions \| logs \| executive-summary` | Required; `executive-summary` is valid only with PDF |
| `sourceContext` | `{ profileId, generation }` | Required; must match active context before data assembly and before file write |
| `period` | `{ from, to }` | Optional for sessions; required for period-based activity, logs and summary; valid ISO dates with `from < to` |
| `sessionFilters` | existing `SessionFilters` | Allowed only for `sessions`; sanitized and bounded before use |
| `logFilters` | existing `LogFilters` | Allowed only for `logs`; time range and page size are validated; total export remains capped |

## Export Metadata

Included in every CSV/JSON export where the format permits metadata; included in the title/context area of PDF.

| Field | Meaning |
|---|---|
| `schemaVersion` | Version of the JSON envelope or CSV metadata contract |
| `application` | Public product name `DBMonitor` |
| `generatedAt` | ISO timestamp when the export is assembled |
| `source` | Safe profile identity: profile label and database name; do not include host, endpoint, credentials, auth token, TLS path, or password |
| `dataset` | Exported dataset identifier and human-readable label |
| `period` | Start/end timestamps when the dataset is temporal; sessions identify that they are a current observed snapshot |
| `filters` | Applied user-selected filters without secrets |
| `availability` | `available`, `partial`, `unavailable`, `insufficient`, or `empty`, with safe explanation when known |
| `rowCount` | Number of records actually included; distinct from a source's unknown/unavailable state |
| `truncated` | Whether the existing export cap omitted additional matching records |
| `fields` | Dataset field definitions: stable key, display label, value type, unit where applicable, and a concise meaning/temporal interpretation |
| `records` | Typed data rows; values align with their field definitions |

## Report Record Sets

### Database activity

Rows reuse the `DatabaseActivityRow` meaning: database OID and name, current connections, accumulated commits and rollbacks, and transaction/read/cache-hit changes within the selected period. Derived values remain `null` when they cannot be computed across valid comparable samples. Existing cap: 10,000 rows.

### Sessions

Rows reuse the safe `SessionRow` projection: PID, backend start, database, user, application, state, first observed finish time, wait event and active duration. A session export describes the current in-memory observed snapshot for a profile, not a historical set for the requested period. It omits query text and client address. Filters apply before a 10,000-row cap; an export that reaches the cap identifies truncation.

### Logs

Rows reuse `LogEvent`: event and ingestion timestamps, severity, database, user, PID, SQLSTATE and message. Messages are potentially sensitive and require a pre-save disclosure. Export is capped at 10,000 events and uses selected time/filter constraints.

### Executive summary

An aggregate report document built from profile-scoped sample history, current capabilities, available database/performance aggregates and log coverage. It does not contain raw sessions, raw log messages, query text, client addresses or credentials. Derived findings require sufficient comparable samples; otherwise the value is unavailable/insufficient and the report states why.

## Relationships and invariants

- One `ExportRequest` has exactly one output format, one source context and one selected dataset/report.
- One request produces one file or an explicit cancellation/failure result; a canceled save must not create a file.
- All records and metadata are derived under the same profile context. A profile/generation change cancels the write.
- CSV and JSON with equivalent dataset, period and filters contain equivalent records and row count.
- `null`, unavailable, insufficient and empty are distinct from a measured numeric zero.
- No export record may carry password, token, authentication secret, revealed SQL text or client address.
- Output destinations are selected by the native dialog; the renderer cannot supply arbitrary filesystem paths.
