# Implementation Plan: Exportação de relatórios

**Branch**: `004-exportacao-relatorios` (identificador Spec Kit; branch Git não criada) | **Date**: 2026-09-28 | **Spec**: `specs/004-exportacao-relatorios/spec.md`

**Input**: Feature specification from `specs/004-exportacao-relatorios/spec.md`

## Summary

Estender o fluxo de exportação existente para oferecer CSV, JSON e PDF, preservando os recortes e limites já disponíveis para atividade de bancos, sessões e logs. A exportação continua sendo solicitada pela interface e executada pelo processo principal, que valida a origem ativa, coleta o conjunto autorizado, exibe o diálogo nativo de destino e grava o arquivo. O JSON terá um envelope contextualizado para análise por ferramentas e LLMs. O PDF será um resumo executivo independente das tabelas detalhadas, montado apenas a partir de dados locais já coletados e das capacidades conhecidas. Nenhum formato inclui credenciais; logs e campos potencialmente identificáveis recebem aviso antes da gravação.

## Technical Context

**Language/Version**: CommonJS JavaScript em Electron/Node.js; TypeScript 5.9, React 19 e Next.js 16 no renderer
**Primary Dependencies**: Electron 44; `pg` 8; SQLite nativo do Electron. Reutilizar `dialog.showSaveDialog` e `webContents.printToPDF`; sem nova dependência planejada
**Storage**: SQLite local por perfil para amostras e eventos de log; histórico de sessões observado em memória por perfil; arquivos exportados no caminho escolhido pela pessoa
**Testing**: `node --test --test-isolation=none`, `npm run typecheck` e `npm run build`, agregados por `npm run verify`; validação manual dos fluxos CSV, JSON e PDF no Electron
**Target Platform**: Aplicativo desktop Windows e Linux
**Project Type**: Electron com renderer Next.js exportado estaticamente
**Performance Goals**: Até 10.000 registros por conjunto, em linha com os limites atuais; diálogo e geração não devem congelar o renderer durante processamento; PDF executivo deve permanecer conciso e legível em poucas páginas
**Constraints**: Uma origem ativa por vez; IPC validado no processo principal; não expor filesystem genérico ao renderer; não exportar credenciais, texto de consultas revelado ou endereço de cliente; preservar fórmulas CSV neutralizadas; declarar dados ausentes, parciais, obsoletos ou truncados
**Scale/Scope**: Ação consistente de exportação na área de dados e nas telas que já oferecem CSV; três conjuntos estruturados existentes (`database-activity`, `sessions`, `logs`); PDF executivo da origem e período selecionados; sem exportação completa do SQLite nem armazenamento adicional

## Constitution Check

`.specify/memory/constitution.md` contém apenas marcadores do template, sem princípios ratificados. Não há gates formais a avaliar. Os padrões locais exigem isolamento por perfil, ausência de credenciais em arquivos, consultas com limites, neutralização CSV, IPC restrito e tratamento explícito de indisponibilidade; o desenho atende a essas restrições. Reavaliação após o desenho: aprovado, sem violações identificadas.

## Project Structure

### Documentation (this feature)

```text
specs/004-exportacao-relatorios/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── exports.md
```

### Source Code (repository root)

```text
electron/
├── export.cjs                 # serializers, metadata envelope, safe CSV and PDF report markup
├── ipc.cjs                    # runtime validation for export format, dataset, period and filters
├── main.cjs                   # source guard, dataset assembly, disclosure, save dialog and file write
├── preload.cjs                # narrow export method over IPC
├── storage.cjs                # existing profile-scoped metric/log data retrieval
└── sessions-history.cjs       # existing profile-scoped session projection
app/
├── components/
│   ├── dashboard-shell.tsx    # consistent export entry where appropriate
│   ├── connections-view.tsx   # current session selection and filters
│   ├── databases-view.tsx     # activity period and filters
│   ├── logs-view.tsx          # log period and filters/disclosure
│   └── diagnostics-view.tsx   # dataset and period export controls
└── ...
lib/
└── dashboard-types.ts         # renderer to preload export request/result contract
tests/
├── export.test.cjs             # serialization, metadata, neutralization and report-summary tests
├── ipc.test.cjs                # input validation and invalid-format rejection
└── ...                         # existing source isolation and Electron-flow coverage
```

**Structure Decision**: Reuse existing Electron main/preload/renderer boundaries. Keep file serialization and report content builders in `electron/export.cjs`; assemble data and authorize source context in `electron/main.cjs`; expose only a typed export request through `window.bdash`. Use existing view-local state for filters and period, and a shared menu/dialog component where it avoids duplicating format choice and privacy disclosure. No SQLite schema change is needed because exports are generated on demand from existing stores.

## Design

1. **One validated export request**: Extend `ExportRequest` with the chosen format while preserving dataset-specific period and filter fields. Validate the format, dataset, dates and filters in `electron/ipc.cjs`; do not accept renderer-supplied rows, profile labels, output paths, report summaries or arbitrary HTML. The main process derives these from the guarded active profile and trusted stores.
2. **Retain dataset semantics**: Reuse the current database-activity ranking (maximum 10,000), apply filters to the full observed-session projection with a 10,000-row cap, and retain paged log reads capped at 10,000. Sessions remain a current/observed snapshot rather than a period series. Preserve source-context checks before and after async work so profile changes abort without writing mixed-origin output.
3. **CSV and JSON serialization**: Keep existing dataset columns first and preserve formula neutralization. Append explicit context columns for DBMonitor, safe profile label/database, generation timestamp, dataset, period bounds and availability, repeating the metadata for each data row; do not write a misleading empty-result file. Add a JSON envelope with schema version, DBMonitor identity, the same profile identity, time range when applicable, filters/selection, dataset availability/limitations, row count, truncation flag, field definitions (type, unit and meaning) and records. JSON values remain typed (`null` for unavailable/null; `0` only for measured zero); no auth fields, host address, revealed query text or client address are part of export DTOs.
4. **Executive summary inputs and content**: Build the PDF from the active profile's already-collected overview/history, capability map and selected time range. Include origin and generation details; a short observed-state summary; available indicators for connections, database activity, performance and log coverage; and explicit caveats for missing sources, insufficient samples, gaps and estimates. Do not emit causal diagnoses, invented recommendations or successful/healthy conclusions unsupported by measured values. Do not include session query text, client address or raw log messages in the executive summary.
5. **PDF creation and file writing**: Use a separate scriptless report document with escaped text, local inline styles and no remote assets. Render it in a short-lived hidden Electron window and call `webContents.printToPDF`; use the native save dialog with the `.pdf` filter and write only after a destination has been selected and source context revalidated. Always close the temporary window in success and failure paths. The existing app window and preload bridge remain restricted.
6. **Privacy disclosure and operation status**: Before saving an export with potentially identifying session fields or log messages, show a clear warning naming those data categories and allow cancellation. Continue to omit authentication material by construction. Return separate outcomes for destination cancellation, privacy cancellation, successful write (format, path and row/section count), empty result, truncation, and failure; never report success on cancellation.
7. **Interface**: Replace per-view CSV-only actions with a consistent Exportar choice for CSV, JSON and PDF where the selected dataset/period applies. Retain the Configurações dataset and period selectors. Keep relevant existing filters, label the PDF as “Resumo executivo”, announce progress/result accessibly, and explain that profile isolation, optional source limits and sensitivity warnings apply.

## Risks and Mitigations

- **Sensitive operational values in logs**: Require explicit pre-save disclosure for logs, exclude secrets by field allowlist, and avoid raw logs in the executive PDF.
- **Report context changes while a dialog is open**: Capture a source context and revalidate it after asynchronous report generation and before writing.
- **Ambiguous history in PDF**: Label selected time range and collection time; show source coverage and avoid trends/rates unless multiple comparable samples exist.
- **CSV compatibility versus metadata requirements**: Preserve a conventional header and spreadsheet usability; document and verify metadata presentation with a CSV parser and spreadsheet import.
- **Cross-platform PDF layout differences**: Use print CSS, fixed page size and local assets; validate packaged behavior on Windows and Linux.
- **Large report payloads**: Keep structured dataset row caps and constrain the executive summary to aggregate indicators and concise observations.

## Complexity Tracking

Não aplicável: a constituição não define gates ratificados e a solução reutiliza os fluxos e dependências existentes.
