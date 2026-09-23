# Tasks: Dashboard de observabilidade PostgreSQL

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/desktop-ipc.md](contracts/desktop-ipc.md), [quickstart.md](quickstart.md).

**Organization**: Tarefas por história, na ordem de prioridade da especificação. Caminhos são relativos à raiz do repositório. Concluir todas as fases para o objetivo final; o checkpoint MVP é apenas uma etapa intermediária.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode ser executada em paralelo com outras tarefas marcadas no mesmo bloco, em arquivos distintos e sem dependência pendente.
- **[Story]**: Mapeia para US1–US5 da especificação; fases compartilhadas e acabamento não recebem rótulo.
- Cada tarefa usa `- [ ] Tnnn` e indica arquivos concretos.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar o projeto existente para o dashboard, sem recomeçar o boilerplate.

- [X] T001 Verificar as convenções do Next 16 instalado em `node_modules/next/dist/docs/01-app/` e manter export estático em `next.config.ts`; registrar comandos de desenvolvimento, build e pacote em `README.md`.
- [X] T002 Configurar shadcn/ui em `components.json`, `app/globals.css` e `lib/utils.ts`, compartilhando tokens de cores, tipografia e unidades com Recharts existente.
- [X] T003 [P] Adicionar apenas componentes shadcn necessários de cartão, tabela, diálogo de confirmação, seletor, badge, tooltip e gráfico em `components/ui/`; evitar segunda biblioteca de gráficos.
- [X] T004 [P] Definir modelos serializáveis da ponte desktop, estado da fonte, período, paginação e identidade de sessão em `types/electron.d.ts` e `lib/dashboard-types.ts` conforme `contracts/desktop-ipc.md`.
- [X] T005 Preparar comandos de verificação e empacotamento Windows em `package.json` e conferir inclusão de módulos Electron e armazenamento em `build.files`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Isolar credenciais, persistência e contratos antes de construir as histórias.

- [X] T006 Criar camada SQLite nativa com arquivo em `app.getPath('userData')`, `WAL`, `PRAGMA user_version`, migrações transacionais e fechamento em `electron/storage.cjs`.
- [X] T007 Definir tabelas e índices de instância, ciclos, amostras por banco, logs, cursor, preferências e auditoria de encerramento em `electron/storage.cjs`, sem persistir senha ou query text.
- [X] T008 [P] Centralizar validação de entrada, limites de período/página/ordenação e erros sanitizados dos métodos da ponte em `electron/ipc.cjs`.
- [X] T009 [P] Revisar `electron/db.cjs` para pool limitado, timeouts, consultas parametrizadas e detecção de capacidades `pg_stat_activity`, `pg_stat_database`, `pg_stat_io`, `pg_stat_wal`, `pg_stat_statements` e fonte de logs.
- [X] T010 Expor somente métodos nomeados do contrato em `electron/preload.cjs` e registrar handlers com checagem de origem em `electron/main.cjs`; proibir IPC genérico e SQL arbitrário.
- [X] T011 Criar coletor serial de 15 s, atualização manual sem sobreposição, estado por bloco e falhas parciais em `electron/collector.cjs`, ligado ao ciclo de vida em `electron/main.cjs`.
- [X] T012 Criar formatação comum de horário, fuso, idade, duração, bytes e números em `lib/format.ts`, com `null`/indisponível distinto de zero.
- [X] T013 Validar abertura do SQLite, migração repetida e isolamento da ponte no ambiente de desenvolvimento em `tests/foundation.test.cjs`.

**Checkpoint**: Dados do PostgreSQL podem ser coletados, armazenados e entregues ao renderer sem credenciais.

---

## Phase 3: User Story 1 - Diagnosticar o estado atual (Priority: P1) 🎯 MVP

**Goal**: Visão geral útil com saúde, indicadores, gráficos temporais e resumo de bancos, inclusive falha/stale.

**Independent Test**: Abrir app com PostgreSQL acessível, conferir indicadores e duas séries; interromper o servidor e conferir indisponibilidade com dados antigos marcados.

- [X] T014 [US1] Implementar snapshot da instância e dos bancos com tempo de coleta e estados de capacidade em `electron/db.cjs` e `electron/collector.cjs`.
- [X] T015 [US1] Persistir ciclos e amostras da instância/por banco com horário e resultado em `electron/storage.cjs`; recuperar última coleta mesmo após reinício.
- [X] T016 [P] [US1] Criar cartões e legenda de fonte/atualização/estado em `app/components/metric-card.tsx` e `app/components/source-status.tsx`.
- [X] T017 [P] [US1] Criar componentes shadcn Chart para séries de conexões e transações com loading/vazio/erro/insuficiente em `app/components/overview-charts.tsx`.
- [X] T018 [US1] Construir navegação das seis seções e tela Visão geral com cartões, dois gráficos, tabela resumida e atualização manual em `app/page.tsx` e `app/components/dashboard-shell.tsx`.
- [X] T019 [US1] Ligar `getOverview` e `refreshNow` aos estados atuais/históricos no renderer em `app/hooks/use-dashboard.ts` e aos handlers em `electron/main.cjs`.
- [X] T020 [US1] Verificar abertura online/offline, última coleta e estados stale/partial com PostgreSQL local em `tests/overview.integration.test.cjs`.

**Checkpoint**: US1 funciona isoladamente com o banco existente e após indisponibilidade.

---

## Phase 4: User Story 2 - Investigar e administrar conexões abertas (Priority: P1)

**Goal**: Tabela de sessões e queries ativas com filtros, duração e encerramento seguro por conexão.

**Independent Test**: Criar sessões ativas e ociosas, filtrar por usuário/banco/estado, cancelar um encerramento e confirmar outro; verificar alvo único, resultado e falhas controladas.

- [X] T021 [US2] Consultar `pg_stat_activity` com PID, `backend_start`, tipo, banco, usuário, aplicação, estado, espera, cliente e tempo ativo somente quando `state='active'` em `electron/db.cjs`.
- [X] T022 [US2] Implementar `getSessions` com filtros e ordenação permitidos, paginação limitada e total por estado em `electron/ipc.cjs` e `electron/main.cjs`.
- [X] T023 [P] [US2] Construir tabela acessível de sessões, filtros, busca, paginação e chips de estado/espera em `app/components/sessions-table.tsx`.
- [X] T024 [P] [US2] Construir distribuição de conexões por estado e usuário com shadcn Chart/Recharts em `app/components/sessions-chart.tsx`.
- [X] T025 [US2] Integrar tela Conexões com atualização automática/manual e detalhe de query/cliente oculto até revelação explícita em `app/components/connections-view.tsx` e `app/hooks/use-sessions.ts`.
- [X] T026 [US2] Implementar `revealSessionDetails` com revalidação `{pid, backendStart}` e sem gravação de texto/cliente no SQLite em `electron/db.cjs` e `electron/ipc.cjs`.
- [X] T027 [US2] Criar diálogo shadcn “Encerrar conexão” que mostra banco, usuário, PID, aplicação, início e risco de abortar transação; cancelar/fechar nunca chama IPC em `app/components/terminate-session-dialog.tsx`.
- [X] T028 [US2] Implementar `terminateSession` no main com origem validada, identidade `{pid, backendStart}` reconsultada, bloqueio do próprio backend e de processos internos, permissão do PostgreSQL, `pg_terminate_backend` parametrizado com timeout positivo e mapeamento de resultados em `electron/db.cjs` e `electron/ipc.cjs`.
- [X] T029 [US2] Persistir tentativa sanitizada de encerramento, atualizar tabela após resposta e mostrar sucesso apenas quando confirmado em `electron/storage.cjs`, `electron/main.cjs` e `app/hooks/use-sessions.ts`.
- [X] T030 [US2] Validar sessão ativa/idle, query text sob revelação, cancelamento, alvo encerrado, PID reutilizado, processo protegido, falta de permissão e auditoria sem segredo em `tests/connections.integration.test.cjs`.

**Checkpoint**: US2 exibe usuários e queries atuais e pode encerrar somente o backend cliente confirmado.

---

## Phase 5: User Story 3 - Analisar desempenho e bancos mais acessados (Priority: P1)

**Goal**: Séries e rankings por período, métricas de desempenho separadas e latência opcional sem valores inventados.

**Independent Test**: Gerar transações em dois bancos, comparar dois períodos e reset; conferir ranking por delta e estado indisponível/ativo de `pg_stat_statements`.

- [X] T031 [US3] Implementar cálculo puro de delta, segmento após `stats_reset`/queda de contador e lacuna por coleta perdida em `lib/metrics.ts`.
- [X] T032 [US3] Consultar séries históricas de conexões, commit, rollback, leituras/cache, WAL e I/O por intervalo com limites e índices SQLite em `electron/storage.cjs`.
- [X] T033 [US3] Construir ranking por `delta(commit + rollback)` e indicadores por banco, preservando OID quando nome muda, em `electron/analytics.cjs`.
- [X] T034 [US3] Consultar `pg_stat_statements` somente quando instalada/carregada e acessível, agregando chamadas, tempo total/médio e maiores consumidores por grupo de consulta em `electron/db.cjs`.
- [X] T035 [P] [US3] Criar seletor compartilhado 1 h, 24 h, 7 d e intervalo personalizado em `app/components/period-selector.tsx`.
- [X] T036 [P] [US3] Criar gráficos de atividade/latência e tabela de maiores consultas, com estado indisponível explícito e query text oculto, em `app/components/performance-view.tsx`.
- [X] T037 [US3] Criar tela Bancos com ranking rotulado “transações no período”, tabela de conexões, commits, rollbacks, leituras e cache em `app/components/databases-view.tsx`.
- [X] T038 [US3] Ligar `getDatabaseActivity`/`getPerformance` e período comum em `electron/main.cjs` e `app/hooks/use-history.ts`, distinguindo duração da query ativa, espera e coleta.
- [X] T039 [US3] Verificar deltas, reset, OID renomeado, períodos sem amostras e latência opcional com/sem extensão em `tests/metrics.integration.test.cjs`.

**Checkpoint**: US3 identifica bancos mais acessados sem confundir conexão atual com transações históricas.

---

## Phase 6: User Story 4 - Consultar eventos de log (Priority: P2)

**Goal**: Ingestão opcional de CSV estruturado, busca, filtros, rotação e diagnóstico da fonte.

**Independent Test**: Sem fonte, mostrar configuração ausente; com CSV de teste, ingerir evento, filtrar, girar arquivo e confirmar deduplicação.

- [X] T040 [US4] Implementar leitor incremental de CSV PostgreSQL com campos estruturados, cursor por identidade de arquivo/offset, rotação e linha inválida isolada em `electron/logs.cjs`.
- [X] T041 [US4] Persistir eventos e cursor de forma atômica, chave única de origem/arquivo/posição e índices por tempo/severidade em `electron/storage.cjs`.
- [X] T042 [US4] Integrar ciclo de ingestão ao coletor sem impedir métricas quando a fonte falha em `electron/collector.cjs` e `electron/main.cjs`.
- [X] T043 [US4] Implementar `getLogs` com filtros por período, severidade, banco, usuário, PID, texto e página, com estado `unavailable` quando não configurado, em `electron/ipc.cjs`.
- [X] T044 [US4] Construir tabela paginada e filtros de Logs, instruções de configuração e erros de fonte em `app/components/logs-view.tsx`.
- [X] T045 [US4] Verificar parsing, evento duplicado, linha malformada, rotação e perda de acesso em `tests/logs.integration.test.cjs`.

**Checkpoint**: US4 distingue falta de fonte de ausência de eventos e preserva logs após reinício.

---

## Phase 7: User Story 5 - Consultar histórico e administrar a coleta (Priority: P2)

**Goal**: Histórico durável, retenção, diagnósticos, preferências e exportação dos recortes.

**Independent Test**: Coletar, reiniciar, rever período, alterar retenção, induzir falha e exportar recorte sem credenciais.

- [X] T046 [US5] Implementar `getPreferences`/`updatePreferences` com validação de intervalo, retenção e fonte de logs em `electron/ipc.cjs` e persistência em `electron/storage.cjs`.
- [X] T047 [US5] Aplicar intervalos configurados ao coletor, impedir ciclos sobrepostos e apresentar atraso/lacunas em `electron/collector.cjs`.
- [X] T048 [US5] Implementar retenção em lotes para amostras (30 d) e eventos (7 d), preservando registros válidos e mostrando uso local em `electron/storage.cjs`.
- [X] T049 [US5] Criar `getDiagnostics` com etapa/horário da última falha e sucesso, capacidades, idade e estado da fonte, uso local e nova tentativa em `electron/main.cjs`.
- [X] T050 [US5] Criar Diagnóstico/Configuração com preferências, capacidade, falhas, retenção e botão seguro de nova tentativa em `app/components/diagnostics-view.tsx`.
- [X] T051 [US5] Implementar exportação CSV do filtro corrente de métricas tabulares/logs com escolha do arquivo, neutralização de fórmulas e exclusão de credenciais em `electron/export.cjs` e `electron/main.cjs`.
- [X] T052 [US5] Verificar reinício, retenção, falha de armazenamento, lacunas, falha de coleta e exportação filtrada sem senha em `tests/history.integration.test.cjs`.

**Checkpoint**: US5 oferece operação cotidiana e histórico sem depender de serviço residente.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verificar o produto completo em condições reais e no pacote distribuível.

- [X] T053 Revisar acessibilidade, teclado, cabeçalhos, estados vazios/erro/stale, unidade e horário de todos os gráficos/tabelas em `app/components/` e `app/globals.css`.
- [X] T054 Revisar limites de consultas/IPC, sanitização de erros, ausência de senha e texto de query no SQLite/exportações e proteção do fluxo de encerramento em `electron/`, `types/electron.d.ts` e `tests/security.integration.test.cjs`.
- [X] T055 Executar `npm run typecheck` e `npm run build`; corrigir problemas em `app/`, `electron/`, `lib/` e `types/`.
- [X] T056 Executar os cenários de `specs/001-postgres-observability-dashboard/quickstart.md` no Electron de desenvolvimento com PostgreSQL local, incluindo gráficos, tabelas, queries ativas, usuários, latência indisponível/ativa e término de sessão de teste.
- [X] T057 Executar `npm run dist`, abrir o pacote Windows e validar protocolo estático, persistência SQLite em `userData`, navegação, gráficos, tabelas e ação administrativa; ajustar `package.json` e `electron/main.cjs` se necessário.
- [X] T058 Atualizar `README.md` com fonte de cada métrica, pré-requisitos opcionais de `pg_stat_statements`/CSV, segurança do encerramento, retenção e comandos de execução/empacotamento.

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Setup (T001–T005) -> Foundation (T006–T013)
                         ├─> US1 (T014–T020)
                         ├─> US2 (T021–T030)
                         ├─> US3 (T031–T039)
                         ├─> US4 (T040–T045)
                         └─> US5 (T046–T052)
Todas as histórias -> Polish (T053–T058)
```

- US1 e US3 compartilham amostras do fundamento; US3 pode implementar analytics em paralelo, mas integração visual exige séries históricas de US1/US3 disponíveis.
- US2 é funcional após fundamento; seu encerramento depende da identidade da sessão exibida pela própria US2, não de US1.
- US4 depende da persistência/cursor do fundamento; US5 integra preferência da fonte com US4 e retenção das amostras com US1/US3.
- T028 depende de T021 e T027; T029 depende de T028; T030 valida o fluxo completo.
- Em arquivos compartilhados (`electron/db.cjs`, `electron/storage.cjs`, `electron/main.cjs`, `electron/ipc.cjs`), integrar alterações sequencialmente para evitar conflito, mesmo se histórias avançarem em paralelo.

### Parallel Execution Examples

- **US1**: T016 e T017 em arquivos visuais distintos; T014/T015 são sequenciais para integrar amostras.
- **US2**: T023 e T024 em componentes distintos; T027 pode ser preparado enquanto T021/T022 estabilizam o contrato.
- **US3**: T035 e T036 em componentes distintos; T031 e T034 usam camadas distintas.
- **US4**: T040 e T044 podem avançar em arquivos distintos após contrato da fundação; T041 precede ingestão integrada T042.
- **US5**: T050 pode avançar após contrato de preferências enquanto T048 trata retenção; T051 usa módulo separado.

## Implementation Strategy

1. Entregar Setup + Foundation e validar ponte/SQLite sem credenciais.
2. Completar US1 e validar o checkpoint MVP. Esse checkpoint não encerra o desenvolvimento pedido.
3. Completar US2 e US3 para conexões, gestão, gráficos, bancos e desempenho; validar cada história.
4. Completar US4 e US5 para logs, histórico, configuração e exportação; validar cada história.
5. Completar Polish, quickstart e pacote Windows antes de declarar a aplicação pronta.

