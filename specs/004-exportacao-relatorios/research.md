# Research: Exportação de relatórios

## Decision 1: Reuse the current export data and source guard

**Decision**: Extend the existing `dashboard:export` flow and keep data collection, profile validation, serialization and writing in the Electron main process. Continue to use the current three export datasets: `database-activity`, `sessions` and `logs`.

**Rationale**: The app already has a restricted preload API, main-process source-context guard, export caps for database activity and logs, and profile-scoped data access. Reusing this flow avoids a second, differently authorized path and keeps CSV/JSON record parity testable.

**Alternatives considered**: Export data assembled in the renderer; rejected because it would broaden renderer access to data and allow stale or cross-profile request payloads. Export the entire SQLite database; rejected because the request asks for reports and structured datasets, not a raw database dump.

## Decision 2: JSON uses a contextual envelope and typed records

**Decision**: Store the selected dataset's records under a versioned JSON report envelope with application, source, generation time, period/filter context, availability notes and row count. Keep numbers and booleans typed, represent missing values as `null`, and distinguish no rows from unavailable or insufficient source data.

**Rationale**: LLM and machine consumers need provenance and explicit meanings to avoid treating a number without units or interval as a finding. A versioned envelope allows later format evolution while preserving stable record semantics.

**Alternatives considered**: Bare JSON array; rejected because it loses report source, period and availability context. Serialize display strings; rejected because localized strings are ambiguous and lose numeric types.

## Decision 3: PDF uses Electron's built-in print-to-PDF capability

**Decision**: Render a small, scriptless report document and generate the PDF through Electron `webContents.printToPDF`, then save with the existing native dialog pattern. Do not introduce a PDF package in the initial implementation.

**Rationale**: The application already ships Electron for both supported desktop platforms. Electron documents `webContents.printToPDF()` as returning a PDF buffer and supports page size, orientation, background printing and margins. The native save dialog already provides extension filters and a cancel result. This avoids a new package and its packaging/font/layout surface.

**Alternatives considered**: Add a PDF library; defer unless Electron's print output cannot satisfy layout needs in Windows/Linux verification. Print the live dashboard window; rejected because the executive report needs a stable, purpose-built layout and must not print unrelated navigation or controls.

**Source**: [Electron webContents API](https://www.electronjs.org/docs/latest/api/web-contents), [Electron dialog API](https://www.electronjs.org/docs/latest/api/dialog).

## Decision 4: The PDF is an aggregate summary, not a record export

**Decision**: Use the selected active profile and time range to summarize available overview, database activity, performance capabilities and log coverage. Include only observed/derivable aggregate indicators and source limitations. Omit raw SQL, client addresses and raw log messages.

**Rationale**: A summary for management should be readable without exposing detailed operational content. Existing capability and history contracts already distinguish unavailable, partial and usable sources; the summary can preserve these distinctions.

**Alternatives considered**: Embed all selected CSV/JSON rows in the PDF; rejected because it would make the document long, technical and duplicate structured exports. Automatically generate root-cause statements or recommendations; rejected because the app's data are observational and do not establish causality.

## Decision 5: Preserve existing limits and warn before exporting sensitive categories

**Decision**: Keep the 10,000-row limit for database activity and logs and apply the same explicit cap to the full filtered session projection, reporting truncation where applicable. Before saving sessions or logs, disclose the included identifying or potentially sensitive categories and offer cancellation. Use field allowlists to prevent credentials, tokens, revealed session query text and client addresses from entering any report.

**Rationale**: Consistent limits control memory and file size. The user may send JSON to an LLM, so source context must be clear and disclosure is needed for raw logs. Export DTO allowlists reduce accidental exposure as internal types evolve.

**Alternatives considered**: Export every session detail revealed in the UI; rejected because reveal is an explicit one-off UI operation and does not grant persistent export scope. Silently redact all logs; rejected because it could destroy the value of the selected log export without making the scope clear.

## Open questions

None. Current repository contracts provide sufficient defaults for dataset scope, source identity, save location, platform target and row limits.
