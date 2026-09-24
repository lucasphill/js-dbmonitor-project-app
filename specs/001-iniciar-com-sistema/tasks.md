---
description: "Tarefas de implementação para início automático do DBMonitor no Windows"
---

# Tasks: Iniciar com o sistema

**Input**: `specs/001-iniciar-com-sistema/spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/startup-settings.md`, `quickstart.md`

**Tests**: Solicitados para lógica de startup, contrato IPC, empacotamento e aceitação Windows.

**Organization**: Tarefas agrupadas pelas três histórias da especificação, na ordem de prioridade.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Pode ser executada em paralelo com outras tarefas da mesma etapa por tocar arquivos diferentes e não depender delas.
- **[US1]**, **[US2]**, **[US3]**: História correspondente em `spec.md`.
- Todos os caminhos são relativos à raiz do repositório.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Preparar o empacotamento e os pontos de extensão existentes sem mudar o comportamento antes da história correspondente.

- [X] T001 Configurar `package.json` para incluir `build/installer.nsh` no alvo Windows NSIS e garantir que o arquivo seja encontrado por `npm run dist:win`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Definir uma única política de identidade do login item e do argumento interno, usada pelo instalador, main process e testes.

- [X] T002 Criar `electron/startup.cjs` com constantes documentadas para nome `DBMonitor`, argumento interno de autostart, nome `startup-disabled` e funções testáveis para reconhecer intenção de abertura e formar as opções de login do executável instalado; alinhar os literais usados em `build/installer.nsh` ao mesmo contrato de `specs/001-iniciar-com-sistema/contracts/startup-settings.md`.
- [X] T003 [P] Acrescentar `StartupState` e os métodos `getStartupState()`/`setStartupEnabled(enabled: boolean)` ao contrato `DashboardApi` em `lib/dashboard-types.ts`, sem associá-los a `Preferences` de perfil.

**Checkpoint**: Há contrato estável para o instalador, a lógica do processo principal e a interface.

---

## Phase 3: User Story 1 - Iniciar automaticamente após instalar (Priority: P1) 🎯 MVP

**Goal**: Instalação nova registra a abertura após login; primeira abertura automática é minimizada na barra de tarefas, abertura manual é normal e existe uma única instância.

**Independent Test**: Instalar o NSIS em usuário Windows sem dados prévios, não abrir Configurações, entrar novamente na conta e confirmar uma instância minimizada, botão na barra de tarefas e restauração; abrir manualmente em outra sessão e confirmar janela normal.

### Tests for User Story 1

- [X] T004 [US1] Adicionar a `tests/startup.test.cjs` testes que inicialmente falhem para identificação estrita do argumento interno, decisão de apresentação manual/automática empacotada, segunda abertura manual que restaura/foca, segunda automática que preserva a janela e corrida antes de criar a janela.
- [X] T005 [P] [US1] Adicionar a `tests/installer-startup.test.cjs` uma verificação do script NSIS que confirme HKCU Run com executável instalado e argumento interno, registro na instalação sem marcador e ausência de registro quando o marcador existe.

### Implementation for User Story 1

- [X] T006 [US1] Implementar em `build/installer.nsh` `customInstall` para registrar HKCU Run do usuário atual após instalar arquivos quando `%APPDATA%\DBMonitor\startup-disabled` não existir, com comando citado e argumento interno fixo; não exigir que o aplicativo seja aberto.
- [X] T007 [US1] Implementar em `electron/startup.cjs` a decisão testável de intenção de abertura e apresentação inicial: somente primeira abertura Windows empacotada com o argumento interno começa minimizada; abertura manual começa normal.
- [X] T008 [US1] Integrar em `electron/main.cjs` `requestSingleInstanceLock()` antes de iniciar armazenamento/coleta; criar a janela minimizada com botão na barra de tarefas para autostart, visível para abertura manual, e tratar `second-instance` para restaurar/focar somente pedidos manuais, inclusive quando a janela ainda está sendo criada.

**Checkpoint**: US1 é demonstrável sem a tela de Configurações; o instalador já ativa o início automático por padrão.

---

## Phase 4: User Story 2 - Desativar e verificar o estado (Priority: P2)

**Goal**: O usuário consulta o estado efetivo, desativa e reativa pelo DBMonitor; opt-out explícito sobrevive à atualização/reinstalação com AppData preservado.

**Independent Test**: Desativar em Configurações, entrar novamente e confirmar ausência de abertura; reinstalar preservando AppData, repetir; reativar, entrar novamente e confirmar abertura minimizada; desabilitar externamente e conferir o estado exibido.

### Tests for User Story 2

- [X] T009 [US2] Expandir `tests/startup.test.cjs` com testes que inicialmente falhem para estado efetivo de `getLoginItemSettings` (`openAtLogin`, `executableWillLaunchAtLogin`, `launchItems.enabled`), releitura após alteração, idempotência, falhas de leitura/escrita, criação/remoção do marcador e preservação do opt-out.
- [X] T010 [P] [US2] Criar `tests/ipc-startup.test.cjs` com testes que inicialmente falhem para origem IPC via `wrapHandler`, aceitação exclusiva de booleano estrito em `setStartupEnabled` e formato `{ state, reason? }` retornado pela bridge.

### Implementation for User Story 2

- [X] T011 [US2] Completar `electron/startup.cjs` com serviço para consultar e alterar o login item Windows usando `path`, `args` e `name` idênticos ao instalador; verificar estado efetivo após escrita, sinalizar indisponibilidade/erro, criar marcador somente após desativação confirmada e removê-lo somente após reativação confirmada.
- [X] T012 [US2] Completar `build/installer.nsh` para respeitar o marcador na reinstalação/atualização, atualizar o caminho do Run quando habilitado, remover Run somente na desinstalação real por `customUnInstall`, preservar marcador/AppData e não criar entrada duplicada.
- [X] T013 [US2] Adicionar validação de booleano estrito em `electron/ipc.cjs` e registrar `startup:get-state` e `startup:set-enabled` com `wrapHandler` em `electron/main.cjs`; retornar `unavailable` sem alterar login items em Windows não empacotado ou plataforma fora do escopo.
- [X] T014 [US2] Expor apenas `getStartupState` e `setStartupEnabled` em `electron/preload.cjs`, seguindo o padrão de erro da bridge existente e o contrato de `lib/dashboard-types.ts`.
- [X] T015 [US2] Adicionar em `app/components/diagnostics-view.tsx` controle acessível **Iniciar com o sistema**, descrição do login Windows, leitura do estado ao montar/retornar à seção, indicação de operação em andamento, erro em `role="alert"` e nova tentativa; refletir a releitura efetiva, sem presumir sucesso a partir do clique.

**Checkpoint**: US2 permite controlar a funcionalidade dentro do aplicativo e respeita a escolha explícita após reinstalação.

---

## Phase 5: User Story 3 - Retomar o uso após login (Priority: P3)

**Goal**: Abertura automática segue autenticação/coleta normal por perfil, sem recuperar senha de sessão anterior nem duplicar a coleta.

**Independent Test**: Com perfil de senha de sessão, entrar novamente, restaurar a janela e verificar solicitação de senha antes da coleta autenticada; com autenticação disponível, verificar coleta normal; disparar segunda abertura e verificar uma instância.

### Tests for User Story 3

- [X] T016 [US3] Adicionar a `tests/startup.test.cjs` ou `tests/profile-switch.test.cjs` teste de integração que prove que o argumento de autostart não transporta credenciais, não altera seleção de perfil nem inicia segundo controlador/coletor; a senha de sessão anterior permanece indisponível após novo processo.

### Implementation for User Story 3

- [X] T017 [US3] Revisar e, se necessário, ajustar a inicialização de `createProfileController`/`controller.start()` em `electron/main.cjs` para que primeira abertura automática siga o fluxo existente de autenticação e coleta e segunda abertura não execute esses passos novamente; não persistir credenciais em `electron/startup.cjs` ou `build/installer.nsh`.

**Checkpoint**: US3 mantém o comportamento de conexão e coleta esperado após cada novo login.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentar, empacotar e validar o fluxo completo.

- [X] T018 [P] Atualizar `README.md` com ativação padrão após instalar no Windows, abertura minimizada na barra de tarefas, restauração, controle em Configurações, opt-out preservado em atualização/reinstalação com dados preservados e limitação das senhas de sessão.
- [X] T019 Executar `npm run verify` conforme `package.json` e corrigir falhas relacionadas à feature em `tests/startup.test.cjs`, `tests/installer-startup.test.cjs`, `tests/ipc-startup.test.cjs` e nos arquivos de implementação correspondentes até testes, TypeScript e build ficarem limpos.
- [X] T020 Executar `npm run dist:win` para gerar o instalável NSIS; inspecionar o artefato em `release/` e corrigir erros de inclusão/compilação de `build/installer.nsh` ou `package.json`.
- [X] T021 Executar o roteiro de `specs/001-iniciar-com-sistema/quickstart.md` em Windows com usuário de teste e instalável real, registrando em `specs/001-iniciar-com-sistema/quickstart.md` o resultado de instalação nova sem abrir Configurações, login/minimização/restauração, opt-out/reinstalação, reativação, abertura manual, revogação externa, instância única e senha de sessão; anotar explicitamente qualquer cenário impossível de executar neste ambiente.

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup T001 → Foundation T002/T003 → US1 → US2 → US3 → Polish.
- T002 define identidade do login item e argumento antes de T005/T006/T007/T011/T012.
- T003 define o contrato do renderer antes de T014/T015.
- T006/T007 antecedem T008 para que a entrada de login e a intenção de janela concordem.
- T011/T012 antecedem a integração IPC/UI T013-T015.
- T019 e T020 dependem das três histórias; T021 depende do instalável T020.

### User Story Dependencies

- **US1 (P1)**: Começa após a fundação; entrega o cenário principal sem depender das Configurações.
- **US2 (P2)**: Usa a identidade do registro definida na fundação e integra o instalador de US1; seu fluxo de desativar/reativar é verificável isoladamente.
- **US3 (P3)**: Usa a política de instância/janela de US1; valida autenticação e coleta sem criar novo armazenamento.

### Parallel Opportunities

- T003 pode avançar em paralelo com T002; T005 em paralelo com T004; T010 em paralelo com T009; T018 em paralelo com T016/T017 quando o comportamento já estiver definido.
- No código, `build/installer.nsh` (T006/T012), `electron/startup.cjs` (T007/T011), e `app/components/diagnostics-view.tsx` (T015) podem ser distribuídos por arquivo, respeitando as dependências de contrato acima. Mudanças em `electron/main.cjs` e `tests/startup.test.cjs` devem ser integradas sequencialmente para evitar conflito.

### Parallel Example: User Story 1

```text
T004: Escrever testes de intenção de abertura e instância em tests/startup.test.cjs.
T005: Verificar as invariantes do instalador em tests/installer-startup.test.cjs.
Após ambos falharem como esperado, T006/T007 implementam instalador e política em arquivos separados.
```

### Parallel Example: User Story 2

```text
T009: Testar estado efetivo e marcador em tests/startup.test.cjs.
T010: Testar contrato IPC em tests/ipc-startup.test.cjs.
Após ambos falharem como esperado, T011/T012 implementam serviço e instalador em arquivos separados.
```

### Parallel Example: User Story 3

```text
T016: Testar nova sessão sem senha anterior e sem segundo coletor.
T017: Ajustar a inicialização em electron/main.cjs somente se o teste revelar desvio.
```

## Implementation Strategy

### MVP First (User Story 1)

1. Concluir T001-T003 e os testes T004-T005.
2. Implementar T006-T008 e demonstrar instalação nova → login → janela minimizada/restaurável, sem entrar em Configurações.
3. Integrar US2 para que a pessoa possa desativar e reativar a preferência no próprio aplicativo.

### Incremental Delivery

1. US1 prova registro padrão, apresentação e instância única.
2. US2 acrescenta controle, estado efetivo e persistência da escolha.
3. US3 confirma que abertura automática não altera autenticação nem coleta.
4. T018-T021 concluem documentação e verificação do instalável real.

## Notes

- Os testes T004/T005/T009/T010/T016 precedem a implementação correspondente e devem falhar pelo comportamento ausente antes da correção.
- O smoke em Windows real é necessário para confirmar botão na barra de tarefas e semântica NSIS de atualização; teste estático ou mock isolado não prova esses pontos.
