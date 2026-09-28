# Quickstart: Exportação de relatórios

## Prerequisites

- Windows or Linux desktop session running DBMonitor.
- A selected PostgreSQL profile with recent samples for activity and performance checks.
- For log coverage validation, an accessible configured CSV log source. Logs remain an optional source.
- Node.js 24 and npm for repository validation.

## Validation scenarios

1. **CSV/JSON parity**: Open Conexões, apply a database/state/search filter, export as CSV and JSON. Confirm both represent the same filtered rows, identify the same profile and generation context, and neither contains query text, client address, credentials or a reusable token.
2. **Activity range**: Open Bancos, select a period, export CSV and JSON, and compare row count, period, units and null/zero meanings. Check that a dataset with insufficient comparable samples does not claim a measured rate.
3. **Sensitive logs**: Open Logs with matching events, choose export and confirm the disclosure identifies raw message and identifying fields. Cancel once and confirm no file or success notice; repeat and save, then confirm selected period and filters are applied.
4. **Executive PDF**: Generate a summary for a profile and a period with samples. Confirm profile, database, interval and generation time are visible; key observations have units; optional source coverage is stated; raw messages, SQL, client address and credentials are absent.
5. **Missing/partial data**: Disable or omit an optional source and generate JSON/PDF. Confirm it is described as unavailable/partial with a reason where known and is not shown as zero or healthy.
6. **Origin change and destination cancel**: Cancel the save dialog and change active profile while a report is being generated. Confirm no canceled file is written and a changed source context cannot create a mixed-origin report.
7. **CSV safety and bounds**: Include text beginning with `=`, `+`, `-` or `@` and verify spreadsheet import treats it as text. Exercise a result over the existing row cap and confirm the exported count and truncation are reported.

## Repository commands

From the repository root, validate types, automated coverage and static app packaging:

```powershell
npm run verify
```

Then run the desktop app against the desired PostgreSQL profile and follow the manual scenarios above:

```powershell
npm run dev
```

The PDF should also be checked from a packaged Windows build and the Linux CI build, because Electron's print rendering is platform-dependent. Expected outcomes and request/file contracts are defined in [contracts/exports.md](contracts/exports.md).
