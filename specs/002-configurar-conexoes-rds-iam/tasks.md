# Tasks: Perfis PostgreSQL e AWS RDS IAM

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contrato IPC](contracts/connection-profiles-ipc.md)

**Tests**: Incluídos para migração, autenticação temporária, TLS, isolamento de origem e ação administrativa, pois erros nesses fluxos podem misturar instâncias ou expor segredos.

**Organization**: Fases por história de usuário, com base comum mínima e checkpoints independentes. `[P]` indica arquivos distintos sem dependência pendente.

## Phase 1: Setup

**Purpose**: Preparar fontes e contratos do projeto existente.

- [X] T001 Conferir a documentação local aplicável do Next.js 16 em node_modules/next/dist/docs/ antes de editar app/page.tsx ou app/components/.
- [X] T002 Registrar a versão e origem do bundle CA oficial RDS para distribuição em electron/certs/README.md e adicionar o bundle PEM validado em electron/certs/rds-global-bundle.pem.
- [X] T003 [P] Acrescentar ao README.md os pré-requisitos de AWS CLI, `rds-db:connect`, usuário DB IAM, rede/VPN e aviso de que logs CSV locais não representam logs RDS.

---

## Phase 2: Foundational (blocking)

**Purpose**: Criar identidade imutável de perfil e impedir dados cruzados antes de habilitar nova origem.

- [X] T004 Criar migração SQLite v2→v3 em electron/storage.cjs que reconstrói instances sem `CHECK(id=1)`, preserva id 1 e FKs, migra preferences/log_sources por origem, cria active_profile e índices, e executa `foreign_key_check` antes do commit.
- [X] T005 [P] Testar migração v2 populada/vazia, rollback e ausência de segredos em tests/profile-migration.test.cjs.
- [X] T006 Criar validação estrita de rótulo, host, porta, banco, usuário DB, região, perfil AWS, modo de autenticação e CA em electron/connection-profiles.cjs; rejeitar propriedades inesperadas e `legacy_env` fora do perfil migrado.
- [X] T007 Implementar CRUD de perfis sem segredo e seleção ativa persistente em electron/storage.cjs, com alteração só do rótulo no mesmo id e mudança de identidade criando novo id/arquivando antigo.
- [X] T008 Refatorar todas as leituras/escritas históricas, retenção, logs, preferências e auditoria de electron/storage.cjs para exigir `profileId` explícito, removendo filtros globais e constantes `instance_id=1` fora da migração.
- [X] T009 [P] Testar validação, isolamento entre três perfis e arquivamento em tests/profile-storage.test.cjs.
- [X] T010 Adicionar `ProfileId`, `ConnectionProfile`, `ProfileDraft`, `ActiveProfile`, `ConnectionTest` e `sourceContext` em lib/dashboard-types.ts e atualizar types/electron.d.ts.
- [X] T011 Adicionar validações de argumentos de perfis, origem da janela e erro `PROFILE_CHANGED` em electron/ipc.cjs, sem devolver erro bruto de CLI/driver.

**Checkpoint**: Dados v2 preservados, toda consulta SQLite escopada e contrato tipado. Testes locais não acessam RDS.

---

## Phase 3: User Story 1 - Conectar RDS com identidade AWS local (Priority: P1) 🎯 MVP

**Goal**: Cadastrar/testar e monitorar um RDS IAM usando AWS CLI configurada, sem senha nem credenciais AWS no aplicativo.

**Independent Test**: Com RDS de teste autorizado, cadastrar perfil IAM, testar consulta real, ativar e coletar após reconexão superior a 15 minutos; inspeção de arquivos não encontra token.

- [X] T012 [P] [US1] Escrever testes de vetor de argumentos fixo, perfil AWS padrão/nomeado, timeout, saída limitada, token descartado e erros sanitizados em tests/aws-rds-auth.test.cjs.
- [X] T013 [P] [US1] Escrever testes de TLS obrigatório, CA confiável, mismatch de hostname e senha dinâmica em testes de conexão simulada em tests/rds-connection.test.cjs.
- [X] T014 [US1] Implementar fornecedor de token em electron/aws-rds-auth.cjs por `execFile`/`spawn` sem shell, `--profile` opcional, timeout, saída limitada, sem stdout/stderr em logs e sem fallback de identidade nomeada.
- [X] T015 [US1] Refatorar electron/db.cjs para construir pool/cliente por perfil; usar fornecedor de token no `password` callback para cada nova conexão física e TLS com CA e hostname verificados em IAM.
- [X] T016 [US1] Implementar teste de conexão real com cliente temporário e consulta de identidade PostgreSQL em electron/db.cjs; sucesso só após consulta, com fechamento no sucesso/falha.
- [X] T017 [US1] Implementar teste de reconexões por relógio simulado após 15 e 35 minutos em tests/rds-reconnect.test.cjs, sem tocar RDS do usuário.
- [X] T018 [US1] Expor `testConnectionProfile`, `createConnectionProfile` e senha de sessão em electron/main.cjs e electron/preload.cjs, validando no processo principal e retornando só descritores/resultado sanitizados.
- [X] T019 [US1] Criar formulário IAM e modo de identidade AWS padrão/nomeada com campos de endpoint, porta, região, banco e usuário DB em app/components/connection-profile-form.tsx, sem campo de senha no modo IAM.
- [X] T020 [US1] Integrar cadastro e teste no painel de Configurações em app/components/diagnostics-view.tsx, exibindo sucesso apenas após consulta DB e ressalva sobre privilégios de métricas.
- [X] T021 [US1] Validar `npm test`, `npm run typecheck` e `npm run build` para o fluxo IAM; registrar no specs/002-configurar-conexoes-rds-iam/quickstart.md qualquer ajuste necessário ao roteiro.

**Checkpoint**: Perfil IAM pode ser cadastrado, testado e monitorado de forma segura; CLI/token não entram no SQLite nem em respostas IPC.

---

## Phase 4: User Story 2 - Administrar perfis e alternar origem (Priority: P1)

**Goal**: Operar localhost e múltiplos RDS com seleção ativa inequívoca, histórico e ações isolados.

**Independent Test**: Alternar três perfis com coleta em andamento, reiniciar e confirmar origem correta em todas as seções, exportação, diagnóstico e auditoria.

- [X] T022 [P] [US2] Criar testes de troca durante coleta, duas seleções rápidas, resposta tardia e pool anterior fechado em tests/profile-switch.test.cjs.
- [X] T023 [US2] Implementar controlador serializado de contexto ativo, geração monotônica e lifecycle do pool em electron/connection-profiles.cjs.
- [X] T024 [US2] Acrescentar parada com espera da coleta em andamento e vinculação do ciclo ao perfil capturado em electron/collector.cjs.
- [X] T025 [US2] Ligar seleção ativa persistente, coleta e `getOverview`/`getSessions`/`getPerformance`/`getDatabaseActivity` ao contexto em electron/main.cjs; incluir `sourceContext` em respostas e rejeitar resultado tardio no renderer.
- [X] T026 [US2] Escopar logs CSV e estado de ingestão por perfil em electron/logs.cjs e electron/main.cjs; RDS sem fonte própria retorna indisponível, sem caminho local herdado.
- [X] T027 [US2] Escopar exportações, preferências, retenção e diagnósticos por perfil em electron/main.cjs e electron/export.cjs, mantendo `profileId` do início ao fim da operação.
- [X] T028 [US2] Vincular revelação/encerramento de sessão ao `profileId` e geração da linha original em electron/main.cjs e electron/db.cjs; revalidar origem antes da operação e auditar no perfil correto.
- [X] T029 [P] [US2] Testar isolamento de consultas, logs, exportação e `terminateSession` após troca em tests/profile-isolation.test.cjs, usando apenas sessões descartáveis de teste.
- [X] T030 [US2] Expor `listConnectionProfiles`, `updateConnectionProfile`, `activateConnectionProfile` e `archiveConnectionProfile` em electron/main.cjs e electron/preload.cjs, com confirmação de nova origem/arquivo e sem purga implícita.
- [X] T031 [US2] Criar lista/seletor de perfis com nome, endpoint, banco, região e método em app/components/connection-profile-selector.tsx; arquivados ficam identificados e não selecionáveis.
- [X] T032 [US2] Integrar seletor ao shell e invalidar chamadas antigas ao alternar em app/components/dashboard-shell.tsx, app/page.tsx e app/hooks/use-dashboard.ts.
- [X] T033 [US2] Adicionar edição, confirmação de nova origem e arquivamento no painel em app/components/diagnostics-view.tsx; preservar histórico anterior e migrar seleção se necessário.
- [X] T034 [US2] Executar cenário de migração/reinício e alternância de três perfis do quickstart.md, conferindo dados de cada seção e histórico v2 em tests/profile-migration.test.cjs e no Electron.

**Checkpoint**: Cada perfil funciona como fonte independente; localhost e histórico legado continuam disponíveis.

---

## Phase 5: User Story 3 - Diagnosticar acesso seguro (Priority: P2)

**Goal**: Explicar falhas AWS/rede/TLS/DB sem vazar material sensível e validar comportamento do pacote.

**Independent Test**: Testar perfil padrão/nomeado e falhas de CLI, identidade, rede, TLS, autenticação e permissão; inspecionar erros e pacote.

- [X] T035 [P] [US3] Cobrir categorias estáveis e ausência de segredos em stdout/stderr, erro IPC, SQLite, exportação e logs em tests/profile-errors.test.cjs.
- [X] T036 [US3] Classificar falhas AWS CLI, rede, TLS, autenticação PostgreSQL e permissão com mensagens orientativas em electron/aws-rds-auth.cjs, electron/db.cjs e electron/ipc.cjs, sem passar exceções brutas.
- [X] T037 [US3] Exibir status do teste por etapa e orientação de CLI/identidade, rede, TLS e permissões em app/components/diagnostics-view.tsx e app/components/connection-profile-form.tsx.
- [X] T038 [US3] Garantir descoberta da AWS CLI e bundle CA no aplicativo empacotado em package.json e electron/aws-rds-auth.cjs; testar instalador Windows em ambiente com CLI configurada sem utilizar RDS de produção.
- [X] T039 [US3] Documentar atualização do bundle CA e diferenças entre teste de conexão e privilégios de métricas em README.md e electron/certs/README.md.
- [X] T040 [US3] Validar testes com certificado inválido/hostname divergente e identidade AWS nomeada ausente em tests/rds-connection.test.cjs e tests/profile-errors.test.cjs.

**Checkpoint**: Falhas têm categoria útil, TLS jamais fica sem validação e o pacote encontra a CLI configurada.

---

## Phase 6: Polish & cross-cutting

- [X] T041 Conferir alinhamento de todos os requisitos FR-001–FR-020 e cenários SC-001–SC-008 com implementação e evidências em specs/002-configurar-conexoes-rds-iam/quickstart.md.
- [X] T042 Executar `npm run typecheck`, `npm test`, `npm run build` e `npm run dist:win`, resolver falhas e registrar resultado no README.md.
- [X] T043 Abrir o Electron empacotado, verificar interface de perfis, migração localhost, estados de erro, isolamento visual e acessibilidade básica; corrigir arquivos em app/components/ conforme necessário.
- [X] T044 Inspecionar o SQLite e artefatos gerados por cenários de sucesso/erro para ausência de token/senha/credenciais e conferir `PRAGMA foreign_key_check` em tests/profile-security.test.cjs.

---

## Dependencies & execution order

- Setup T001–T003 prepara docs e CA. Fundação T004–T011 é bloqueante para todas as histórias.
- US1 T012–T021 depende da fundação. T012 e T013 podem ocorrer em paralelo; T014 precede T015–T017; T015–T016 precedem T018–T020.
- US2 T022–T034 depende da fundação e reutiliza o pool por perfil de US1. Testes T022/T029 podem ser escritos em paralelo com trabalho de UI T031. T023–T024 antecedem T025–T028; T030 antecede T031–T033.
- US3 T035–T040 depende de autenticação e teste de US1; suas mensagens/UI podem ser desenvolvidas ao lado de US2, após contrato IPC.
- Polish T041–T044 depende das três histórias. Não executar testes de encerramento em sessões que não sejam descartáveis e criadas para teste.

## Parallel execution examples

### US1

```text
Agente A: T012 em tests/aws-rds-auth.test.cjs; depois T014 em electron/aws-rds-auth.cjs.
Agente B: T013 em tests/rds-connection.test.cjs; depois T015–T016 em electron/db.cjs.
Agente C: T019 em app/components/connection-profile-form.tsx após contrato tipado T010.
```

### US2

```text
Agente A: T022–T024 em tests/profile-switch.test.cjs e electron/collector.cjs.
Agente B: T029 em tests/profile-isolation.test.cjs; depois T026 em electron/logs.cjs.
Agente C: T031 em app/components/connection-profile-selector.tsx após T030.
```

### US3

```text
Agente A: T035 em tests/profile-errors.test.cjs; depois T036 em electron/ipc.cjs.
Agente B: T037 em app/components/connection-profile-form.tsx e diagnostics-view.tsx.
Agente C: T038–T039 em package.json, electron/certs/README.md e README.md.
```

## Implementation strategy

1. Completar setup e fundação, validando migração sem perda e escopo por perfil.
2. Entregar US1 como MVP: cadastrar/testar/monitorar um RDS IAM autorizado com token transitório e TLS obrigatório.
3. Entregar US2: múltiplos perfis, troca serializada, histórico e ações isolados.
4. Entregar US3: diagnósticos operacionais e comportamento no instalador.
5. Executar polish e validar requisitos por evidência, inclusive teste IAM real somente em ambiente autorizado.
