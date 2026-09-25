---

description: "Tarefas de implementação para exibir conexões finalizadas"
---

# Tasks: Exibir conexões finalizadas

**Input**: `specs/003-exibir-conexoes-finalizadas/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/sessions.md` e `quickstart.md`.

**Tests**: `quickstart.md` exige cobertura automatizada dos casos críticos; criar testes focados no contrato e nas transições.

**Organization**: Tarefas por história de usuário, em ordem de prioridade. `[P]` identifica arquivos distintos sem dependência pendente.

## Phase 1: Setup

**Purpose**: Confirmar os pontos de integração existentes, sem criar infraestrutura nova.

- [X] T001 Mapear os filtros, a paginação e o SQL de `listSessions` em `electron/db.cjs`, e registrar os pontos reutilizáveis para coleta completa e projeção.
- [X] T002 [P] Mapear o ciclo de perfil/generation, IPC de sessões e exportação em `electron/main.cjs` e `electron/export.cjs` para preservar verificações de contexto.

---

## Phase 2: Foundational

**Purpose**: Estabelecer contrato compartilhado antes das histórias.

- [X] T003 Atualizar `SessionRow` e `SessionFilters` em `lib/dashboard-types.ts` com `finishedAt: ISODate | null`, estado `finished` e ordenação `finishedAt`, preservando os demais tipos existentes.
- [X] T004 [P] Extrair em `electron/db.cjs` uma consulta completa, sem filtros, `LIMIT` ou `OFFSET`, de sessões `client backend`, que valide identidade `(pid, backendStart)` e somente entregue snapshot após sucesso integral.

**Checkpoint**: O contrato distingue uma linha finalizada e existe fonte completa para inferir ausência.

---

## Phase 3: User Story 1 - Identificar conexões encerradas (P1) 🎯 MVP

**Goal**: Manter a conexão ausente na tabela com estado Finalizado e horário imutável da primeira ausência observada.

**Independent Test**: Observar uma sessão, encerrá-la e atualizar; a linha permanece com Finalizado e data/hora. Coletas subsequentes não mudam o horário; falhas não encerram sessões.

### Tests for User Story 1

- [X] T005 [P] [US1] Criar testes da reconciliação em `tests/sessions-history.test.cjs` cobrindo ausência em snapshot válido, falha/parcial, `finishedAt` imutável, PID reutilizado, perfis isolados e snapshots fora de ordem.
- [X] T006 [P] [US1] Ampliar `tests/connections.integration.test.cjs` para verificar que filtros/paginação da tabela não reduzem a coleta completa nem criam finalizações falsas.

### Implementation for User Story 1

- [X] T007 [US1] Implementar em `electron/sessions-history.cjs` o histórico em memória por perfil, identidade `(profileId, pid, backendStart)`, dados não sensíveis da última observação e transição única para `finishedAt` na primeira ausência válida.
- [X] T008 [US1] Integrar a coleta completa e a reconciliação em `electron/main.cjs` no handler `dashboard:sessions`, rejeitando respostas de generation/perfil obsoletos e serializando ou descartando snapshots fora de ordem.
- [X] T009 [US1] Projetar em `electron/sessions-history.cjs` linhas abertas e finalizadas do perfil, aplicando busca, estado, demais filtros, ordenação estável e paginação somente depois da reconciliação; manter `total` e `nextCursor` coerentes.
- [X] T010 [US1] Encaminhar a projeção em `electron/main.cjs` e manter `sessions.updatedAt` no horário da coleta válida; em erro, preservar o histórico sem inferir ausências.
- [X] T011 [US1] Exibir estado Finalizado e data/hora na tabela em `app/components/sessions-table.tsx`, com `—` para linhas abertas, filtro de estado e cabeçalho ordenável “Finalizada em”.
- [X] T012 [US1] Ajustar seleção, detalhes e ações em `app/components/connections-view.tsx` para identificar linhas finalizadas, indicar dados como última observação e impedir revelação ou término.
- [X] T013 [US1] Validar no handler administrativo de `electron/main.cjs` a identidade, o perfil e a geração de linhas finalizadas para recusar revelação ou término mesmo se a UI enviar a operação.
- [X] T014 [US1] Atualizar o CSV de sessões em `electron/export.cjs` e o fluxo de exportação em `electron/main.cjs` para incluir Estado e Finalizada em, exportar todas as linhas filtradas do perfil sem truncamento pela página visível e omitir dados sensíveis.
- [X] T015 [US1] Distinguir contagens de sessões atuais e histórico finalizado em `app/components/connections-view.tsx` e manter o gráfico de `app/components/sessions-chart.tsx` restrito a sessões abertas.
- [X] T016 [US1] Ajustar `app/hooks/use-sessions.ts` para descartar respostas de perfil/generation obsoletos e preservar atualização e paginação coerentes ao trocar de perfil.

**Checkpoint**: US1 entrega a linha finalizada, filtros, paginação, exportação e bloqueio de ações com proteção contra coletas inválidas.

---

## Phase 4: User Story 2 - Interpretar o horário com precisão (P2)

**Goal**: Comunicar que “Finalizada em” representa a primeira ausência observada.

**Independent Test**: A explicação fica acessível a partir da coluna em uma ação; o horário usa o formato local existente e linhas abertas exibem `—`.

### Tests for User Story 2

- [X] T017 [P] [US2] Criar teste de apresentação em `tests/sessions-presentation.test.cjs` para verificar rótulo, ausência de valor em linhas abertas e texto que descreve a estimativa.

### Implementation for User Story 2

- [X] T018 [US2] Adicionar explicação de “Finalizada em” em `lib/explanations.ts`, dizendo que o horário é a primeira ausência observada em coleta válida, sem afirmar encerramento exato no servidor.
- [X] T019 [US2] Associar a explicação ao cabeçalho “Finalizada em” e usar o formatador de data/hora existente em `app/components/sessions-table.tsx`.
- [X] T020 [US2] Mostrar estado, horário estimado e rótulo “última observação” nos detalhes de uma linha finalizada em `app/components/connections-view.tsx`.

**Checkpoint**: A pessoa consegue interpretar o horário diretamente na tabela e nos detalhes.

---

## Phase 5: Polish & Cross-Cutting Concerns

- [X] T021 Atualizar `tests/sessions-history.test.cjs` com casos de ordenação por `finishedAt`, filtros combinados, `total`, `nextCursor` e exportação sem truncamento.
- [X] T022 Executar `npm run typecheck`, `npm test` e `npm run build`; corrigir apenas regressões ligadas à feature nos arquivos alterados.
- [X] T023 Conferir o roteiro manual de `specs/003-exibir-conexoes-finalizadas/quickstart.md` para sessão aberta, finalizada, falha de coleta, troca de perfil, PID reutilizado, filtros, paginação, detalhes e CSV.

---

## Dependencies & Execution Order

- Setup T001–T002 e fundação T003–T004 precedem US1.
- US1: T005–T006 podem ser escritos em paralelo; T007 depende de T004; T008–T010 dependem de T007; T011–T016 integram a projeção do contrato e devem ser concluídos antes do checkpoint.
- US2 depende da presença do campo e da coluna de US1. T017 pode ser escrito em paralelo com T018; T019–T020 dependem da explicação e da UI de US1.
- Polish depende de US1 e US2.

## Parallel Examples

### User Story 1

Após T003–T004, implementar em paralelo os testes de reconciliação em `tests/sessions-history.test.cjs` (T005) e o teste de consulta integral em `tests/connections.integration.test.cjs` (T006). Após T010, distribuir interface (`app/components/sessions-table.tsx`, T011) e exportação (`electron/export.cjs`, parte de T014) entre agentes com arquivos distintos.

### User Story 2

Após US1, escrever o teste em `tests/sessions-presentation.test.cjs` (T017) e a explicação em `lib/explanations.ts` (T018) em paralelo; depois conectar a explicação na tabela (T019) e revisar os detalhes (T020).

## Implementation Strategy

1. Entregar T001–T016 como MVP de US1 e validar o teste independente.
2. Entregar T017–T020 para tornar explícita a estimativa de US2.
3. Executar T021–T023 e confirmar o contrato completo do `quickstart.md`.
