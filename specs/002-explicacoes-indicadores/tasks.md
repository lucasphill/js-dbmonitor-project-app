---
description: "Tarefas de implementação da tela Explicações dos indicadores"
---

# Tasks: Explicações dos indicadores

**Input**: Documentos em `specs/002-explicacoes-indicadores/`: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contrato de interface](contracts/explanations-ui.md) e [quickstart.md](quickstart.md).

**Tests**: A especificação pede cenários e resultados verificáveis, mas não exige TDD nem uma suíte nova. Cada história traz um teste independente; a validação final inclui `npm run verify` e os cenários do quickstart.

**Organization**: Tarefas agrupadas por história de usuário, em ordem de prioridade. Os caminhos são relativos à raiz do repositório. `[P]` marca trabalho em arquivos distintos, possível após as dependências indicadas.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Fixar o inventário de rótulos que será implementado, sem reinicializar o projeto nem instalar pacotes.

- [X] T001 Conferir os rótulos atuais em `app/page.tsx`, `app/components/connections-view.tsx`, `app/components/sessions-chart.tsx`, `app/components/sessions-table.tsx`, `app/components/performance-view.tsx`, `app/components/databases-view.tsx` e `app/components/logs-view.tsx`; ajustar o mapa de rótulos/IDs em `specs/002-explicacoes-indicadores/contracts/explanations-ui.md` se a interface divergir, preservando os IDs estáveis.

**Checkpoint**: O contrato contém os rótulos efetivos, agrupados pelas cinco telas, e distingue controles operacionais de conceitos de dados.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Definir o modelo estático usado por todas as histórias.

- [X] T002 Criar `lib/explanations.ts` com tipos `ExplanationTopic`, `ExplanationGroup`, `ExplanationReference` e IDs estáveis do contrato; exigir ID, título, significado, unidade ou “não se aplica”, escopo temporal, fonte e ressalvas, sem acesso a PostgreSQL, SQLite ou IPC.
- [X] T003 Criar em `lib/explanations.ts` o agrupamento ordenado das cinco áreas e a resolução segura de um ID conhecido ou desconhecido, para que a navegação possa abrir o início da página quando o destino não existir.

**Checkpoint**: O renderer dispõe de um contrato único para conteúdo e destinos; nenhuma dependência nova foi adicionada.

---

## Phase 3: User Story 1 - Entender um indicador no contexto (Priority: P1) 🎯 MVP

**Goal**: Abrir a explicação exata de Transações/min, Commits, Rollbacks e Cache hit a partir da Visão geral, com foco e rolagem corretos.

**Independent Test**: Selecionar os quatro botões “i” da Visão geral; cada clique mostra o tópico correto abaixo da barra fixa, inclusive quando o valor está indisponível.

### Implementation for User Story 1

- [X] T004 [P] [US1] Escrever em `lib/explanations.ts` as definições iniciais de `transaction-rate`, `commits-total`, `rollbacks-total` e `cache-hit-percent`, com unidade, período, fonte, fórmula e indisponibilidade conforme `specs/002-explicacoes-indicadores/contracts/explanations-ui.md`.
- [X] T005 [P] [US1] Criar `app/components/explanation-info.tsx` com botão circular “i”, nome acessível “Entender [rótulo]”, foco visível e callback por `topicId`, reutilizando `components/ui/button.tsx` sem aninhar controles.
- [X] T006 [P] [US1] Acrescentar `explanations` à lista única de navegação e medir a altura do cabeçalho fixo em `app/components/dashboard-shell.tsx`, incluindo a navegação compacta quando visível.
- [X] T007 [US1] Criar `app/components/explanations-view.tsx` para renderizar os quatro tópicos iniciais com título identificável, `id` estável, destaque do alvo e foco programático sem segunda rolagem; depende de T004 e T006.
- [X] T008 [US1] Integrar `openExplanation(topicId)` em `app/page.tsx`, substituir o efeito de rolagem ao topo por uma navegação única que aguarda a renderização, compensa a altura do cabeçalho e trata ID desconhecido; depende de T006 e T007.
- [X] T009 [US1] Passar `onExplain` de `app/page.tsx` para `app/components/metric-card.tsx` e colocar o “i” ao lado de “Transações/min”, mantendo o botão disponível quando a métrica estiver indisponível; depende de T005 e T008.
- [X] T010 [US1] Colocar botões “i” ao lado de “Commits”, “Rollbacks” e “Cache hit” no cabeçalho do Resumo de bancos em `app/page.tsx`, sem ícones por linha nem mudança na fórmula exibida; depende de T005 e T008.

**Checkpoint**: O MVP resolve as quatro dúvidas prioritárias com um clique. A Visão geral e a ordenação/estrutura de sua tabela continuam funcionais.

---

## Phase 4: User Story 2 - Consultar as explicações pelo menu (Priority: P2)

**Goal**: Oferecer glossário completo das cinco telas pela navegação lateral/compacta, disponível sem conexão, e ampliar os atalhos de dados.

**Independent Test**: Abrir Explicações diretamente pelos dois menus, sem PostgreSQL, percorrer os cinco grupos e usar um botão de dado em cada tela para chegar ao destino correspondente.

### Implementation for User Story 2

- [X] T011 [US2] Completar `lib/explanations.ts` com todos os tópicos das áreas Visão geral, Conexões, Desempenho, Bancos e Logs do mapa em `specs/002-explicacoes-indicadores/contracts/explanations-ui.md`, preenchendo significado, unidade, escopo temporal, fonte e ressalvas; depende do MVP.
- [X] T012 [US2] Expandir `app/components/explanations-view.tsx` para exibir os cinco grupos na ordem do menu, com conteúdo somente explicativo e navegação interna legível; depende de T011.
- [X] T013 [P] [US2] Adicionar atalhos dos outros cartões e dos dois títulos de gráfico da Visão geral em `app/components/metric-card.tsx` e `app/components/overview-charts.tsx`, usando IDs distintos para retrato atual e série temporal; depende de T011.
- [X] T014 [P] [US2] Adicionar atalhos aos cartões de resumo e aos rótulos de detalhes de sessão em `app/components/connections-view.tsx`, sem revelar automaticamente consulta ou cliente; depende de T011.
- [X] T015 [P] [US2] Adicionar atalhos aos títulos de distribuição em `app/components/sessions-chart.tsx` e aos cabeçalhos de dados em `app/components/sessions-table.tsx`; separar o botão “i” dos botões de ordenação; depende de T011.
- [X] T016 [P] [US2] Adicionar atalhos aos gráficos, aos títulos e aos cabeçalhos das tabelas de consultas ativas e latência em `app/components/performance-view.tsx`, reutilizando IDs de sessão quando a semântica coincidir; depende de T011.
- [X] T017 [P] [US2] Adicionar atalhos aos cabeçalhos do inventário, gráficos e ranking em `app/components/databases-view.tsx`, mantendo ordenação e botão “i” como controles irmãos e preservando a rolagem horizontal; depende de T011.
- [X] T018 [P] [US2] Adicionar atalhos somente às colunas de dados dos eventos em `app/components/logs-view.tsx`, distinguindo registros de logs de estatísticas agregadas; depende de T011.
- [X] T019 [P] [US2] Permitir suspender a consulta periódica da Visão geral enquanto a seção explicativa estiver ativa em `app/hooks/use-dashboard.ts`, sem alterar a coleta das telas de dados; depende do MVP.
- [X] T020 [US2] Em `app/page.tsx`, renderizar Explicações antes dos bloqueios de `profileLoading`/ausência de origem, limpar alvo ao abrir pelo menu e impedir que “Atualizar agora” dispare coleta nessa seção; depende de T012 e T019.
- [X] T021 [US2] Em `app/components/dashboard-shell.tsx`, confirmar que “Explicações” aparece e recebe `aria-current` no menu lateral e compacto, e que o controle global de atualização fica inativo/oculto nessa seção; depende de T020.

**Checkpoint**: O glossário pode ser consultado sem conexão e cada tela de dados oferece acesso contextual às definições relevantes.

---

## Phase 5: User Story 3 - Comparar medidas semelhantes (Priority: P3)

**Goal**: Ajudar a distinguir taxa, quantidade entre coletas, total acumulado e porcentagem, com limites de fonte e reset claros.

**Independent Test**: A partir do conteúdo, distinguir `tx/min` de `transações/coleta`, commits/rollbacks acumulados de transações no período e cache hit percentual de acertos de cache contados.

### Implementation for User Story 3

- [X] T022 [P] [US3] Revisar em `lib/explanations.ts` as definições de `transaction-rate`, `transaction-rate-series`, `transactions-per-collection`, `transactions-in-period`, `commits-total` e `rollbacks-total` contra `electron/overview.cjs` e `electron/analytics.cjs`, incluindo reset, lacunas e unidades exatas.
- [X] T023 [P] [US3] Adicionar em `app/components/explanations-view.tsx` referências cruzadas entre tópicos semelhantes e apresentação clara de unidade/escopo temporal, sem métricas ao vivo nem controles administrativos.
- [X] T024 [US3] Revisar em `lib/explanations.ts` cache hit percentual versus contagens de cache, latência média versus agregada e “Em espera nesta página”, conferindo `app/page.tsx`, `electron/performance.cjs` e `app/components/connections-view.tsx`; depende de T022.
- [X] T025 [US3] Conferir em `specs/002-explicacoes-indicadores/contracts/explanations-ui.md` que rótulos iguais em contextos diferentes apontam a IDs compatíveis com unidade/temporalidade e atualizar `lib/explanations.ts` se necessário; depende de T023 e T024.

**Checkpoint**: O conteúdo explica cálculos e restrições reais do DBMonitor e permite as comparações previstas nos cenários de aceitação.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Auditar cobertura, acessibilidade, documentação e regressões sem alterar outras funcionalidades em andamento.

- [X] T026 [P] Conferir os rótulos de `app/page.tsx`, `app/components/metric-card.tsx`, `app/components/overview-charts.tsx`, `app/components/connections-view.tsx`, `app/components/sessions-chart.tsx`, `app/components/sessions-table.tsx`, `app/components/performance-view.tsx`, `app/components/databases-view.tsx` e `app/components/logs-view.tsx` com `specs/002-explicacoes-indicadores/contracts/explanations-ui.md`, garantindo botão e destino para 100% dos conceitos de dados e nenhum botão em controles operacionais.
- [X] T027 [P] Atualizar `README.md` com a entrada “Explicações”, navegação contextual e natureza estática/offline do conteúdo, sem modificar documentação de outras funcionalidades em andamento.
- [X] T028 Executar `npm run verify` e corrigir falhas ligadas à feature nos arquivos de `app/` e `lib/explanations.ts`, preservando modificações preexistentes do diretório de trabalho.
- [X] T029 Seguir `specs/002-explicacoes-indicadores/quickstart.md` no Electron: destino sob cabeçalho fixo em janela larga/estreita, teclado/leitor de tela, valores indisponíveis, menu compacto, ordenação independente, troca de perfil/período e acesso sem banco.

**Checkpoint**: Os critérios SC-001 a SC-005 da especificação foram verificados; pendências observadas ficam registradas antes de considerar a feature concluída.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 pode começar imediatamente.
- **Foundational (Phase 2)**: T002 e T003 dependem do mapa de T001 e bloqueiam as histórias.
- **User Story 1 (Phase 3)**: T004–T010 dependem da fundação; entrega o MVP contextual.
- **User Story 2 (Phase 4)**: T011–T021 ampliam o MVP; T013–T019 podem ocorrer em paralelo depois do catálogo completo (T011), observadas as dependências de arquivos.
- **User Story 3 (Phase 5)**: T022–T025 usam os tópicos completos de US2; T022 e T023 podem ocorrer em paralelo.
- **Polish (Phase 6)**: T026–T029 seguem as histórias concluídas; T026 e T027 podem ocorrer em paralelo.

### User Story Dependencies

- **US1 (P1)**: Primeira fatia funcional; depende somente de T001–T003.
- **US2 (P2)**: Amplia o mesmo catálogo e a mesma página criados em US1; pode ter planejamento e conteúdo preparados em paralelo, mas a integração de arquivos compartilhados segue US1.
- **US3 (P3)**: Refina o conteúdo completo de US2 e adiciona comparação explícita; não bloqueia a navegação básica de US1/US2.

### Parallel Opportunities

- **US1**: T004 (`lib/explanations.ts`), T005 (`app/components/explanation-info.tsx`) e T006 (`app/components/dashboard-shell.tsx`) são independentes após T003.
- **US2**: T014 (`connections-view.tsx`), T016 (`performance-view.tsx`), T017 (`databases-view.tsx`), T018 (`logs-view.tsx`) e T019 (`use-dashboard.ts`) mexem em arquivos distintos depois de T011. T013/T015 podem ocorrer em paralelo com esses grupos, desde que os arquivos compartilhados não sejam editados simultaneamente.
- **US3**: T022 (`lib/explanations.ts`) e T023 (`explanations-view.tsx`) podem avançar em paralelo após US2; T024/T025 dependem de sua consolidação.

### Parallel Example: User Story 1

```text
Task: T004 — conteúdo inicial em lib/explanations.ts
Task: T005 — botão em app/components/explanation-info.tsx
Task: T006 — navegação e medida do cabeçalho em app/components/dashboard-shell.tsx
```

### Parallel Example: User Story 2

```text
Após T011:
Task: T014 — conexões em app/components/connections-view.tsx
Task: T016 — desempenho em app/components/performance-view.tsx
Task: T017 — bancos em app/components/databases-view.tsx
Task: T018 — logs em app/components/logs-view.tsx
```

### Parallel Example: User Story 3

```text
Após US2:
Task: T022 — precisão de transações em lib/explanations.ts
Task: T023 — comparações em app/components/explanations-view.tsx
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Completar T001–T003 para fixar IDs e estrutura do catálogo.
2. Completar T004–T010 para disponibilizar quatro atalhos prioritários com destino, foco e rolagem.
3. Validar os três cenários de US1 antes de ampliar a cobertura.

### Incremental Delivery

1. US1: acesso contextual aos conceitos mais críticos.
2. US2: menu completo, cinco grupos, demais atalhos e funcionamento sem origem.
3. US3: distinções semânticas, fórmulas e ressalvas refinadas.
4. Fase final: cobertura total, `npm run verify` e quickstart de navegação/acessibilidade.

## Notes

- Não criar esquema de banco, IPC, servidor ou dependência para esta feature.
- O `tests/explanations.test.cjs` previsto no plano é uma possibilidade de verificação futura; a especificação não exigiu criação de suíte nova nesta etapa.
- Não sobrescrever alterações de outras funcionalidades já presentes no diretório de trabalho.
