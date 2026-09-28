# Tasks: Exportação de relatórios

**Input**: Design documents from `specs/004-exportacao-relatorios/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/exports.md`

**Tests**: No dedicated test tasks are included because the feature specification does not explicitly request test-first development. The scenarios in `quickstart.md` remain the validation guide for implementation.

**Organization**: Tasks are grouped by user story in priority order. Foundational tasks extend the shared renderer-to-main contract and runtime validation used by all formats.

## Phase 1: Setup

**Purpose**: The existing Electron, Next.js, and test project structure already matches the implementation plan; no package initialization or new dependency is required.

## Phase 2: Foundational

**Purpose**: Extend the common export contract and reject invalid format/dataset combinations before any user story adds new serialization or UI behavior.

- [X] T001 [P] Add export format, executive-summary dataset, empty/truncated result fields and privacy-cancel reason to `ExportRequest` and `ExportResult` in `lib/dashboard-types.ts`.
- [X] T002 [P] Validate allowed export formats, dataset combinations, required periods, filters, and safe source-context request shape in `electron/ipc.cjs`.

**Checkpoint**: Shared TypeScript and IPC contracts accept only the planned export requests.

---

## Phase 3: User Story 1 - Exportar dados estruturados (Priority: P1) 🎯 MVP

**Goal**: Export the existing database activity, sessions, and logs datasets as contextualized CSV or JSON with matching records and explicit empty/truncated outcomes.

**Independent Test**: For each supported dataset, export the same profile, period, and filters as CSV and JSON; confirm matching records and source context, then verify empty and canceled selections do not create a misleading file.

### Implementation for User Story 1

- [X] T003 [P] [US1] Add versioned JSON envelope, dataset field definitions, and CSV context columns while preserving current columns and formula neutralization in `electron/export.cjs`.
- [X] T004 [US1] Extend the export handler to assemble the existing datasets, apply filters and 10,000-row caps, report empty/truncated results, disclose session/log categories before saving, revalidate source context, select format-specific save filters, and write CSV/JSON through `electron/main.cjs`.
- [X] T005 [P] [US1] Create a reusable accessible format-choice action for CSV and JSON with progress and result states in `app/components/export-menu.tsx`.
- [X] T006 [US1] Replace CSV-only actions with the shared format choice and pass current filters, period, and source context from `app/components/connections-view.tsx`, `app/components/databases-view.tsx`, `app/components/logs-view.tsx`, and `app/components/diagnostics-view.tsx`.

**Checkpoint**: CSV and JSON exports work independently of the PDF story, preserve each dataset's semantics, and cannot write after a canceled save or stale source context.

---

## Phase 4: User Story 2 - Compartilhar um resumo executivo (Priority: P2)

**Goal**: Generate a short, readable PDF for a selected source and period, with observed indicators and clear data-coverage caveats.

**Independent Test**: Generate a PDF for a profile and period with data and for one with unavailable/insufficient data; inspect that the context, key indicators, limitations, and non-causal language are correct in both cases.

### Implementation for User Story 2

- [X] T007 [P] [US2] Build executive-summary content and escaped, scriptless print markup from profile-scoped history, capabilities, aggregates, and source-coverage notes in `electron/executive-report.cjs`.
- [X] T008 [US2] Add the executive-summary data assembly, hidden report window lifecycle, native PDF generation, source revalidation, and `.pdf` save flow in `electron/main.cjs`.
- [X] T009 [US2] Add the “Resumo executivo” PDF choice and selected-period handoff to the shared export action and settings export controls in `app/components/export-menu.tsx` and `app/components/diagnostics-view.tsx`.

**Checkpoint**: The PDF identifies the source and interval, includes supported aggregate findings, and states limitations without raw session queries or log messages.

---

## Phase 5: User Story 3 - Exportar com privacidade e contexto (Priority: P3)

**Goal**: Make the categories included in exports clear and ensure no authentication secrets or excluded session details can enter CSV, JSON, or PDF.

**Independent Test**: Export sessions, logs, and an executive summary; confirm the person sees a clear disclosure for identifying/log content, can cancel without a file, and saved artifacts contain no credentials, tokens, query text, client address, or hostname.

### Implementation for User Story 3

- [X] T010 [P] [US3] Audit and enforce explicit output-field allowlists for session/log records and report source metadata, excluding credentials, tokens, hostname, revealed SQL text, and client address in `electron/export.cjs` and `electron/executive-report.cjs`.
- [X] T011 [US3] Complete disclosure and cancellation behavior across CSV, JSON, and PDF, including explicit session/log data categories and no destination dialog or file write after rejection, in `electron/main.cjs`.
- [X] T012 [US3] Present accessible success, failure, empty, privacy-canceled, destination-canceled, and truncated states with exported counts in `app/components/export-menu.tsx`, `app/components/connections-view.tsx`, `app/components/databases-view.tsx`, `app/components/logs-view.tsx`, and `app/components/diagnostics-view.tsx`.

**Checkpoint**: A person can understand what will be shared and cancel; all formats preserve profile context and exclude authentication material and prohibited details.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Keep product documentation aligned with the completed user-facing export formats.

- [X] T013 [P] Update the export guidance, sensitivity notes, supported formats, and executive PDF behavior in `README.md`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No work is required; the repository already has the planned runtime and structure.
- **Foundational (Phase 2)**: T001 and T002 can proceed in parallel. Both must complete before user-story implementation.
- **User Stories (Phase 3+)**: US1 is the MVP; US2 adds the PDF report; US3 completes the cross-format privacy and disclosure behavior.
- **Polish (Phase 6)**: Depends on the user-facing format and privacy behavior being settled.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; independent structured-export increment.
- **US2 (P2)**: Builds on the shared export request and format-choice action from US1.
- **US3 (P3)**: Reviews and completes privacy behavior across the CSV/JSON exports from US1 and the PDF from US2.

### Parallel Opportunities

- T001 and T002 modify separate files and can run in parallel.
- After Phase 2, T003 and T005 can run in parallel because serializer and renderer action use separate files.
- Within US2, T007 can run in parallel with T009 after US1 is complete; T008 integrates the report builder and UI contract afterward.
- T010 is separate from renderer status work in T012; T011 integrates both privacy rules and user confirmation in the main process.

## Parallel Example: User Story 1

```text
Task: T003 Add JSON/CSV serializers and metadata in electron/export.cjs
Task: T005 Create the CSV/JSON choice action in app/components/export-menu.tsx
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Phase 2 shared request validation.
2. Implement P1 CSV and JSON serialization, main-process routing, and existing screen actions.
3. Verify the structured-export scenarios in `quickstart.md` before proceeding to PDF work.

### Incremental Delivery

1. Deliver CSV and JSON for database activity, sessions, and logs (US1).
2. Add the executive summary PDF with explicit source coverage (US2).
3. Complete cross-format privacy disclosure and result messaging (US3).
4. Update `README.md` after the final behavior is settled.
