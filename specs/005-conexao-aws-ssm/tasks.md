# Tasks: Conexão AWS via SSM + IAM

**Input**: Documentos em `specs/005-conexao-aws-ssm/`.
**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contrato IPC](contracts/connection-ipc.md), [quickstart.md](quickstart.md).
**Organization**: Setup → fundação → US1 (P1) → US2 (P2) → US3 (P2) → validação transversal.
**Tests**: Os cenários de aceitação e critérios mensuráveis da spec exigem validação de conexão, TLS, isolamento, falhas e limpeza. Incluídos testes significativos para esses contratos e a migração exigida pelos padrões do projeto; não se exige TDD geral. Escrever os testes de cada fase antes da implementação correspondente e confirmar falha relevante, sem confundir import inexistente com prova de comportamento.

## Format: `[ID] [P?] [Story] Description`

IDs sequenciais; `[P]` indica tarefas sem conflito de arquivos que podem ocorrer juntas após as dependências citadas. `[US1]`, `[US2]`, `[US3]` correspondem às histórias da spec. Caminhos são relativos à raiz do repositório. Novos arquivos são explicitamente identificados. Execução local registrada em quickstart.md; tarefas de aceitação externa permanecem abertas.

## Phase 1: Setup

**Purpose**: Preparar execução e fixtures sem instalar dependências AWS ou conectar a produção.

- [X] T001 Verificar Node.js 24, scripts atuais e pg 8.23.0 de `package.json` e `package-lock.json`, executar baseline disponível e registrar resultado/limitações em `specs/005-conexao-aws-ssm/quickstart.md`; preservar lockfile e dependências atuais.
- [X] T002 Criar fixtures injetáveis de CLI/plugin/processos, relógio, portas IPv4/IPv6 e servidor PostgreSQL TLS em `tests/helpers/ssm-fixtures.cjs` (novo), usando credenciais sintéticas e certificados exclusivos de teste, sem chamadas AWS reais por padrão.

## Phase 2: Foundational

**Purpose**: Contratos e utilitários compartilhados; concluir antes das histórias.

- [X] T003 [P] Adicionar AuthMode rds_iam_ssm, campos opcionais ssmTarget/ssmLocalPort, ConnectionRuntime com sourceContext/revision e extensões de ConnectionTest/ActiveProfile/API em `lib/dashboard-types.ts`, preservando chamadas e drafts antigos conforme `contracts/connection-ipc.md`.
- [X] T004 [P] Extrair validação/classificação compartilhada de perfis IAM e comparações separadas de identidade/transporte em `electron/connection-profiles.cjs`, aceitando EC2 ID, porta automática null ou 1–65535 e rejeitando campos SSM em outros modos e senha nos modos IAM.
- [X] T005 [P] Resolver AWS CLI por plataforma e acrescentar AbortSignal/orçamento restante à geração de token em `electron/aws-rds-auth.cjs`, mantendo endpoint/porta remotos, argumentos sem shell e erros sanitizados; estender `tests/aws-rds-auth.test.cjs` para Windows/Linux, cancelamento e compatibilidade IAM direto.
- [X] T006 Estabelecer interface injetável acquire/release/closeAll e tipos internos de sessão/lease, operationId e deadlines em `electron/aws-ssm-tunnel.cjs` (novo), com configuração de processo/rede/tempo recebida por dependência e sem segredos públicos; depende de T004–T005.
- [X] T007 Definir allowlist de erros SSM e validação de requestId/contexto em `electron/ipc.cjs`, com etapas prerequisites/tunnel, warning de cleanup separado e rejeição de campos internos como PID/SessionId; estender `tests/ipc-validation.test.cjs`.

**Checkpoint**: Tipos, validação, cancelamento do provider e contrato interno definidos; sem conectividade ativa ainda.

## Phase 3: User Story 1 — Cadastrar e conectar a um RDS privado (P1, MVP)

**Goal**: Salvar uma origem SSM e selecioná-la em uma ação para coletar métricas com IAM/TLS corretos.
**Independent Test**: Com fixtures e depois ambiente autorizado, cadastrar/selecionar uma origem, validar consulta e coleta pela porta local automática ou 15432, reiniciar e reutilizar configuração sem comandos/token manual. Não declarar connected antes da consulta.

### Tests

- [X] T008 [P] [US1] Cobrir instalação nova e migrações SQLite v1/v2/v3→v4, backup, IDs/FKs/históricos/preferências, rollback e edição de transporte versus identidade em `tests/ssm-profile-migration.test.cjs` (novo), com fixtures de banco antigo.
- [X] T009 [P] [US1] Cobrir spawn com args JSON/documento fixo/região/perfil, preflight, chunks sem newline, buffer limitado, portas automáticas com até três candidatos, conflito explícito, IPv4/IPv6 e impossibilidade de adotar listener desconhecido em `tests/aws-ssm-tunnel.test.cjs` (novo).
- [X] T010 [P] [US1] Demonstrar com pg do lockfile conexão TCP por IP loopback, SNI/certificado para endpoint original, CA/nome inválidos recusados e provider por conexão física com host/porta remotos em `tests/ssm-rds-connection.test.cjs` (novo), usando fixtures T002.

### Implementation

- [X] T011 [US1] Implementar schema 4, rebuild de instances com CHECK atualizado e colunas ssm_target/ssm_local_port, FK OFF antes da transação, backup/foreign_key_check/rollback e serialização CRUD em `electron/storage.cjs`; preservar IDs e campos antigos e aplicar comparação de identidade T004; depende de T008.
- [X] T012 [US1] Implementar preflight CLI/plugin/STS, spawn oculto sem shell, parser limitado de SessionId/marcador, reserva/retry de portas e endereço IP loopback efetivo em `electron/aws-ssm-tunnel.cjs`; validar processo vivo e readiness sem expor saída; depende de T009.
- [X] T013 [US1] Implementar release/closeAll idempotentes básicos em `electron/aws-ssm-tunnel.cjs`, com terminate-session próprio limitado, fechamento de árvore/grupo capturados Windows/Linux e confirmação de liberação local em até 10 s; não matar por nome/porta nem esperar US3 para evitar vazamento no MVP; depende de T012.
- [X] T014 [US1] Separar transporte local de identidade remota na connectionConfig/pool em `electron/db.cjs`, usando IP literal, ssl.servername original e CA validada, token novo por conexão física e fechamento limitado; só permitir transporte ready e manter max=3; depende de T010 e T012–T013.
- [X] T015 [US1] Integrar seleção e startup SSM em `electron/connection-profiles.cjs`: deduplicar abertura, drenar origem anterior, adquirir túnel, validar consulta, publicar estado e iniciar coletor somente no sucesso; falha mantém nova origem failed sem fallback/coleta, generation protege respostas; preservar seleção lazy de modos antigos; depende de T011 e T014.
- [X] T016 [US1] Conectar manager/controller ao lifecycle e profiles:activate/list/create/update existentes em `electron/main.cjs`, fechando recursos ao trocar/sair, e usar classificação IAM comum para bloquear CSV local em `electron/main.cjs` e `electron/overview.cjs`; depende de T015.
- [X] T017 [US1] Expor campos e resultado estendido nos métodos atuais de `electron/preload.cjs` e adicionar cadastro AWS via SSM + IAM, target, porta automática/manual e confirmação de identidade correta em `app/components/connection-profile-form.tsx`; não pedir senha/token e preservar drafts/CA existentes; depende de T003, T011 e T016.
- [X] T018 [US1] Validar fluxo US1, persistência/reinício e modos anteriores com T008–T010 e `tests/profile-switch.test.cjs`/`tests/connections.integration.test.cjs`, registrando evidências do checkpoint em `specs/005-conexao-aws-ssm/quickstart.md`; confirmar limpeza básica antes de considerar MVP demonstrável.

**Checkpoint**: US1 funciona sem US2/US3 completas; recursos já têm limpeza básica. MVP não significa publicação da feature completa.

## Phase 4: User Story 2 — Testar e corrigir problemas de acesso (P2)

**Goal**: Testar drafts/perfis por etapa sem alterar origem ativa ou derrubar seu túnel.
**Independent Test**: Testar configuração válida e cenários porta ocupada, plugin ausente, identidade expirada, destino indisponível e TLS/login falhando; cancelar teste e comprovar limpeza exclusiva e coleta ativa intacta.

### Tests

- [X] T019 [P] [US2] Cobrir leases de teste isolado/compartilhado, config exata versus diferente, cancelamento e cleanup em sucesso/falha, teste durante troca e conflito de porta ativa em `tests/ssm-connection-test.test.cjs` (novo).
- [X] T020 [P] [US2] Cobrir contrato profiles:test/cancel-test, requestId autorizado, compatibilidade da assinatura antiga, etapas/allowlist e ausência de stack/stdout/credenciais em `tests/ipc-ssm.test.cjs` (novo).

### Implementation

- [X] T021 [US2] Completar leases de teste em `electron/aws-ssm-tunnel.cjs`, compartilhando apenas sessão ativa healthy com configuração idêntica, preservando lease ativo ao liberar teste e encerrando sessões exclusivas; depende de T019.
- [X] T022 [US2] Implementar teste SSM por draft/id com aquisição de lease, consulta real, deadline único 60 s, cancelamento com fechamento de cliente e resultado sanitizado em `electron/db.cjs`; finally libera apenas lease de teste; depende de T021.
- [X] T023 [US2] Gerenciar requestId por renderer autorizado e abort imediato fora da fila em `electron/connection-profiles.cjs`; integrar options opcionais de teste e cancel-test em `electron/main.cjs`, `electron/ipc.cjs` e `electron/preload.cjs`; depende de T020 e T022.
- [X] T024 [US2] Atualizar Testar conexão/Cancelar, hints por etapa, resultados obsoletos e cleanupWarning em `app/components/connection-profile-form.tsx`; enviar requestId e cancelar ao fechar formulário, sem alterar perfil ativo; depende de T023.
- [ ] T025 [US2] Executar cenários US2 automatizados T019–T020 e ensaio UI conforme `specs/005-conexao-aws-ssm/quickstart.md`, registrando diagnóstico até 60 s, porta liberada até 10 s e teste compartilhado sem interromper coleta nesse arquivo.

**Checkpoint**: Teste de conexão pode ser demonstrado independentemente da UI de reconexão US3.

## Phase 5: User Story 3 — Manter e encerrar a conexão (P2)

**Goal**: Estado fiel, cancelamento da abertura, reconexão e disconnect explícitos, dados stale e encerramento robusto.
**Independent Test**: Interromper túnel próprio, observar failed/stale, reconectar em uma ação; cancelar abertura, trocar origem e fechar app; comprovar limpeza até 10 s e novas conexões após 15 min sem renovação manual.

### Tests

- [X] T026 [P] [US3] Cobrir queda, abort durante abertura/troca, deadline total, cli/plugin filhos, terminate-session recusado, cleanup idempotente, leases invalidados, sucesso tardio e processos externos preservados em `tests/ssm-lifecycle.test.cjs` (novo).
- [X] T027 [P] [US3] Cobrir nova conexão física após 15 min com token novo sem expirar clientes saudáveis em `tests/ssm-reconnect.test.cjs` (novo), com relógio/provider fake e transport healthy.
- [X] T028 [P] [US3] Cobrir generation/revision, disconnect+refresh sem reopen, mesma origem reconnect e evento stale rejeitado em `tests/ssm-runtime.test.cjs` (novo), incluindo retorno de activate/reconnect antes de aplicar contexto novo.

### Implementation

- [X] T029 [US3] Completar monitoramento de exit/error/drop e cancelamento imediato em `electron/aws-ssm-tunnel.cjs`, abortar clientes dependentes e emitir uma transição sanitizada, limitando deadline/cleanup e recusando sucesso tardio; endurecer árvore/grupo próprio e warning remoto com T026.
- [X] T030 [US3] Implementar runtime, status/disconnect/reconnect/cancel-connect e reinício ao editar target/porta em `electron/connection-profiles.cjs`; aumentar generation quando necessário, manter histórico para transporte, bloquear reabertura por polling e revalidar antes de retomar coleta; depende de T029 e T028.
- [X] T031 [US3] Integrar suspensão/drain do coletor, indisponibilidade de consultas e marcação stale de últimos dados em `electron/db.cjs`, `electron/collector.cjs` e `electron/overview.cjs`, sem gravar leitura antiga como atual ou zero; depende de T030.
- [X] T032 [US3] Registrar novas operações/contextos/evento sanitizado e cleanup no before-quit/window-close em `electron/main.cjs` e `electron/ipc.cjs`; expor métodos nomeados/onConnectionState com unsubscribe em `electron/preload.cjs`, sem event nativo ou canal genérico; depende de T030–T031.
- [X] T033 [US3] Consumir runtime no seletor/hook em `app/components/connection-profile-selector.tsx` e `app/hooks/use-dashboard.ts`, exibindo estado, Cancelar/Reconectar/Desconectar, aceitando apenas sourceContext/revision atual e consultando status ao montar; depende de T032.
- [X] T034 [US3] Executar T026–T028 e validar falha de seleção, edição de transporte, shutdown e ausência de reopen automático; corrigir token/pool em `electron/aws-rds-auth.cjs` e `electron/db.cjs` se regressões surgirem, registrando resultados em `specs/005-conexao-aws-ssm/quickstart.md`.

**Checkpoint**: As três histórias têm comportamento e critérios independentes demonstrados; nenhuma sessão externa é afetada.

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T035 [P] Documentar pré-requisitos CLI/plugin/agente/permissões, campos SSM, login SSO externo, teste, porta, reconexão, TLS e correções de erro em `README.md`, sem instruções de token/túnel manual no fluxo normal.
- [X] T036 [P] Estender verificações de segredos e isolamento em `tests/profile-security.test.cjs` e `tests/profile-isolation.test.cjs`, cobrindo tokens sintéticos em falhas/IPC/storage/export e troca SSM↔modos existentes, CSV local indisponível e histórico preservado.
- [X] T037 Executar `npm run verify` de `package.json`, corrigir falhas relacionadas e registrar resultado de typecheck/test/build em `specs/005-conexao-aws-ssm/quickstart.md`; não marcar completo com checks não executados.
- [ ] T038 Validar pacote Windows com `npm run dist:win` de `package.json` e pacote Linux no workflow de build existente em `.github/workflows/`, conferindo PATH/plugin/loopback/processos filhos/encerramento e registrando evidências ou limitação de plataforma em `specs/005-conexao-aws-ssm/quickstart.md`; não publicar Release/tag nem disparar release.yml como parte desta tarefa.
- [ ] T039 Executar aceitação AWS opt-in de `specs/005-conexao-aws-ssm/quickstart.md` em ambiente autorizado de teste, medindo SC-001–SC-006, 10 ciclos, 9/10 conexões até 30 s e observação de 60 min; registrar evidências sanitizadas nesse arquivo ou impedimento explícito se ambiente indisponível, sem declarar medição fictícia.
- [X] T040 Reconciliar `specs/005-conexao-aws-ssm/tasks.md` com evidências, `spec.md`, `plan.md` e `contracts/connection-ipc.md`, atualizar apenas tarefas realmente concluídas e registrar riscos/validações externas pendentes antes da entrega.

## Dependencies & Execution Order

```text
Setup T001–T002
  → Foundation T003–T007
  → US1 T008–T018
  → US2 T019–T025
  → US3 T026–T034
  → Cross-cutting T035–T040
```

- T003/T004/T005 podem ocorrer juntos após Setup; T006 depende T004/T005; T007 depende contrato/tipos T003.
- US1: testes T008/T009/T010 podem ocorrer juntos após fundação. T011 (storage) pode ocorrer junto a T012/T013 (túnel), após seus testes. T014 exige túnel pronto; T015 exige storage/db; integração e UI vêm depois.
- US2 usa infraestrutura de US1. Testes T019/T020 são independentes; implementação T021–T024 é sequencial por dependência.
- US3 usa túnel US1 e leases US2; testes T026/T027/T028 são independentes após US2. Não executar alterações simultâneas em controller/manager/db/main de histórias distintas.
- T035/T036 podem ocorrer juntos após US3; T037 aguarda ambos. T038/T039 aguardam verify. T040 aguarda resultados de todas as validações e registra limitações reais.
- A ordem US1 → US2 → US3 reflete reutilização técnica, não ausência de critérios independentes de aceitação. Não assumir que histórias inteiras podem ser implementadas em paralelo.

## Parallel Examples

**US1**: após fundação, escrever T008 (`tests/ssm-profile-migration.test.cjs`), T009 (`tests/aws-ssm-tunnel.test.cjs`) e T010 (`tests/ssm-rds-connection.test.cjs`) em paralelo; depois T011 pode coexistir com T012/T013 sem conflito de arquivos.

**US2**: após US1, escrever T019 (`tests/ssm-connection-test.test.cjs`) e T020 (`tests/ipc-ssm.test.cjs`) em paralelo. Integração T021–T024 depende dos resultados e é sequencial.

**US3**: após US2, escrever T026 (`tests/ssm-lifecycle.test.cjs`), T027 (`tests/ssm-reconnect.test.cjs`) e T028 (`tests/ssm-runtime.test.cjs`) em paralelo. Alterações T029–T033 seguem dependências explícitas.

Esses exemplos descrevem oportunidades de execução, sem autorizar automaticamente criação de agentes/chats.

## Implementation Strategy

1. Concluir Setup e fundação, preservando modos atuais.
2. Entregar US1 como MVP demonstrável: cadastro/seleção/coleta com TLS, persistência e limpeza básica. Validar T018 antes de avançar.
3. Acrescentar US2 e comprovar teste independente da origem ativa em T025.
4. Acrescentar US3 e comprovar ciclo de vida completo em T034.
5. Executar regressões, verify e aceitação/pacotes; documentar impedimentos externos sem marcar validações não executadas como completas. MVP não substitui conclusão da spec inteira.

## Coverage and Notes

| Requisitos | Tarefas principais |
| --- | --- |
| FR-001–003 cadastro/validação/compatibilidade | T003–T004, T008, T011, T017–T018 |
| FR-004–006 conexão/TLS/identidade | T005, T009–T010, T012, T014–T016 |
| FR-007 autorização por conexão | T005, T010, T014, T027, T034 |
| FR-008 proteção de segredos | T007, T020, T036 |
| FR-009 teste isolado | T019–T025 |
| FR-010 estado/deadline | T006–T007, T015, T022, T026, T028–T033 |
| FR-011 queda/reconexão | T026–T034 |
| FR-012 reutilização/deduplicação | T006, T015, T019, T021, T029–T030 |
| FR-013 encerramento/cancelamento | T013, T023–T026, T029, T032 |
| FR-014 loopback/conflito/posse | T009, T012–T013, T019, T026, T038–T039 |
| FR-015 isolamento/CSV | T016, T028, T031, T036 |
| FR-016 histórico/transporte | T004, T008, T011, T017, T030 |
| FR-017 documentação | T035, T039 |

40 tarefas: Setup 2, fundação 5, US1 11, US2 7, US3 9, transversal 6. Todos os critérios SC-001–SC-006 são medidos em T039; regressões locais também em T018/T025/T034/T036–T037.

Constituição ainda sem princípios ratificados; padrões `.agents/standards.md` aplicados. Não existe `.specify/extensions.yml`, portanto hooks before_tasks/after_tasks não se aplicam. Commit/push/publicação não fazem parte desta geração.

## Estado da implementação — 2026-10-06

37/40 tarefas concluídas. T025: testes automatizados passaram e formulário inspecionado no navegador; ensaio completo via bridge Electron pendente. T038: empacotamento Windows aprovado; execução instalada e Linux pendentes. T039: sem endpoint completo e ambiente AWS de teste autorizado; nenhuma medição real foi realizada. Critérios SC-001–SC-005 não são declarados atendidos pelos fakes.
