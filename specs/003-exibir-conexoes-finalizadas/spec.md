# Feature Specification: Exibir conexões finalizadas

**Feature Branch**: `Não criada; especificação local`
**Created**: 2026-09-25
**Status**: Draft
**Input**: User description: "Na tabela de conexões, as conexões finalizadas devem aparecer com o estado Finalizado e a data/horário de finalização."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identificar conexões encerradas (Priority: P1)

Ao acompanhar a tabela de conexões, a pessoa vê as sessões que estavam presentes em uma coleta anterior e deixaram de aparecer em uma coleta válida posterior, identificadas como “Finalizado” junto com o horário estimado de finalização.

**Why this priority**: Permite distinguir sessões encerradas das sessões ainda abertas sem perder o contexto da conexão observada.

**Independent Test**: Observar uma conexão, encerrá-la, atualizar a tabela e confirmar que a linha permanece visível com estado “Finalizado” e data e horário preenchidos.

**Acceptance Scenarios**:

1. **Given** uma conexão aparece em uma coleta válida, **When** ela não aparece na próxima coleta válida do mesmo perfil, **Then** a tabela a mostra com estado “Finalizado” e data e horário de finalização correspondentes ao primeiro momento em que sua ausência foi observada.
2. **Given** uma conexão continua presente, **When** a tabela é atualizada, **Then** mantém seu estado atual e não recebe horário de finalização.
3. **Given** uma conexão foi marcada como finalizada, **When** ocorrem novas coletas válidas, **Then** seu horário de finalização não é substituído.

---

### User Story 2 - Interpretar o horário com precisão (Priority: P2)

A pessoa entende que o horário de finalização exibido é uma estimativa baseada na observação, e não o instante exato em que o servidor encerrou a sessão.

**Why this priority**: A fonte atual fornece um retrato das sessões abertas, sem registrar o evento exato de encerramento.

**Independent Test**: Consultar a coluna e sua explicação e confirmar que ambas comunicam a natureza estimada do horário.

**Acceptance Scenarios**:

1. **Given** uma conexão finalizada está na tabela, **When** a pessoa consulta seu horário, **Then** vê data e hora no mesmo padrão dos demais horários e encontra uma indicação de que representa a primeira ausência observada.
2. **Given** uma conexão ainda está aberta, **When** a pessoa consulta a coluna de finalização, **Then** vê um marcador de ausência de valor, sem inferência de encerramento.

### Edge Cases

- Falha, indisponibilidade ou resultado parcial de uma coleta não deve marcar conexões como finalizadas.
- Conexões de perfis diferentes não devem ser comparadas entre si nem aparecer misturadas na tabela do perfil atual.
- Uma nova conexão que reutiliza um identificador numérico de uma antiga deve ser tratada como conexão distinta.
- Uma conexão que termina entre duas coletas só pode receber o horário da primeira ausência observada; o instante real de término é desconhecido.
- Ações que exigem conexão ativa, como revelar dados atuais ou encerrá-la, não devem estar disponíveis para linhas finalizadas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A tabela de conexões DEVE manter visíveis as conexões observadas que deixaram de constar de uma coleta posterior válida do mesmo perfil.
- **FR-002**: Cada conexão encerrada DEVE exibir o estado “Finalizado” e data e horário de finalização.
- **FR-003**: O horário de finalização DEVE representar o momento da primeira coleta válida em que a conexão deixou de ser observada e DEVE ser apresentado como estimativa, não como horário exato de encerramento no servidor.
- **FR-004**: Conexões ainda presentes DEVEM manter o estado informado na coleta atual e NÃO DEVEM exibir horário de finalização.
- **FR-005**: O reconhecimento de uma conexão ao longo de coletas DEVE considerar seu identificador e seu horário de início, dentro do mesmo perfil de origem, para não confundir conexões distintas.
- **FR-006**: Falha ou coleta incompleta NÃO DEVE provocar a transição de qualquer conexão para “Finalizado”.
- **FR-007**: Uma conexão já finalizada DEVE conservar o primeiro horário de finalização observado em atualizações posteriores.
- **FR-008**: A tabela DEVE manter os dados observados anteriormente da conexão finalizada para identificação, sem apresentar seus últimos dados como se fossem atuais.
- **FR-009**: A pessoa NÃO DEVE poder acionar operações que exigem uma sessão ativa a partir de uma linha finalizada.
- **FR-010**: As linhas finalizadas DEVEM obedecer aos controles existentes da tabela, incluindo filtros, ordenação e paginação, de forma coerente com o estado e o horário exibidos.
- **FR-011**: Ao trocar de perfil, a tabela DEVE mostrar somente conexões daquele perfil; o histórico observado de outro perfil não pode ser classificado como encerramento por causa da troca.

### Key Entities *(include if feature involves data)*

- **Conexão observada**: Sessão identificada por perfil de origem, identificador e horário de início, com dados da última observação válida.
- **Finalização observada**: Transição de uma conexão previamente observada para ausente em coleta válida posterior, com o primeiro horário em que essa ausência foi detectada.
- **Coleta válida**: Observação completa e confiável das conexões de um perfil, capaz de confirmar presença ou ausência.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários de aceitação com uma conexão que desaparece após coleta válida, a tabela mostra uma única linha “Finalizado” com data e hora preenchidas na atualização seguinte.
- **SC-002**: Em 100% dos cenários com falha de coleta, nenhuma conexão é marcada como finalizada apenas por essa falha.
- **SC-003**: Em 100% dos cenários com reutilização de identificador ou troca de perfil, conexões distintas não são confundidas.
- **SC-004**: Em uma verificação da interface, o significado estimado do horário pode ser encontrado a partir da própria tabela em uma ação ou menos.
- **SC-005**: Em 100% dos cenários com uma linha finalizada, ações reservadas a conexões abertas estão indisponíveis.

## Assumptions

- O pedido se refere à tabela de Conexões já existente e às conexões que o aplicativo observou enquanto acompanhava o perfil; não pede importação de histórico anterior à observação.
- O horário real de encerramento não está disponível na fonte atual; a primeira ausência em uma coleta válida é a estimativa exibida.
- A definição de formato da data e hora segue o padrão já usado pelo produto.
- A retenção das conexões finalizadas acompanha o período de observação da aplicação; não foi solicitada persistência histórica entre reinícios.
