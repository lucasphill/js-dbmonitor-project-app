# Feature Specification: Dashboard de observabilidade PostgreSQL

**Feature Branch**: `não criada`  
**Created**: 2026-09-23  
**Status**: Draft  
**Input**: Dashboard desktop para observar logs internos, conexões abertas, latência, bancos mais acessados e dados administrativos do PostgreSQL, com gráficos, tabelas e histórico local.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Diagnosticar o estado atual (Priority: P1)

Como administrador, quero abrir uma visão geral e identificar rapidamente se a instância está acessível, quantas conexões existem, quais bancos estão ativos e se há sinais de erro ou saturação.

**Why this priority**: É o fluxo mínimo útil mesmo antes de existir histórico.

**Independent Test**: Com uma instância acessível, abrir o aplicativo e conferir a visão geral; interromper a conexão e conferir a indicação de indisponibilidade.

**Acceptance Scenarios**:

1. **Given** uma instância acessível, **When** a visão geral é aberta, **Then** mostra horário da última coleta, estado da conexão, conexões atuais e resumo por banco, com unidade e origem das métricas.
2. **Given** uma coleta anterior e a instância inacessível, **When** ocorre a próxima atualização, **Then** o estado passa a indisponível, o erro é explicado e os dados antigos aparecem identificados como históricos.

---

### User Story 2 - Investigar conexões abertas (Priority: P1)

Como administrador, quero examinar sessões ativas e ociosas por banco, usuário, aplicação e estado para localizar esperas e consultas demoradas.

**Why this priority**: Conexões abertas são uma necessidade explícita e ajudam no diagnóstico imediato.

**Independent Test**: Criar sessões em estados distintos, abrir a página de conexões, filtrar e localizar cada sessão; encerrar uma sessão de teste mediante confirmação e verificar o resultado.

**Acceptance Scenarios**:

1. **Given** sessões visíveis à conta de monitoramento, **When** abro Conexões, **Then** vejo tabela ordenável e filtrável com identificador, banco, usuário, aplicação, estado, início, duração, espera e cliente quando disponíveis.
2. **Given** uma sessão que termina entre coletas, **When** atualizo, **Then** ela deixa de aparecer como aberta; o histórico agregado permanece preservado.
3. **Given** uma sessão de outro cliente visível e elegível, **When** escolho “Encerrar conexão” na sua linha, **Then** vejo banco, usuário, PID, aplicação, início e aviso de que a transação atual será interrompida; a ação só prossegue após confirmação explícita.
4. **Given** a confirmação de encerramento, **When** o servidor conclui a operação, **Then** vejo sucesso apenas se o servidor confirmar a terminação; a tabela é atualizada e o resultado fica registrado localmente com horário, alvo e resultado, sem texto integral da consulta.
5. **Given** permissão insuficiente, sessão já encerrada, PID reutilizado ou sessão protegida, **When** tento confirmar, **Then** a operação não encerra outro processo e recebo o motivo concreto, mantendo a navegação e a coleta funcionando.

---

### User Story 3 - Analisar desempenho e bancos mais acessados (Priority: P1)

Como administrador, quero comparar tendências de atividade e latência por período para identificar o banco ou grupo de consultas responsável por uma degradação.

**Why this priority**: Gráficos históricos e ranking de acesso são o núcleo do dashboard solicitado.

**Independent Test**: Gerar carga em dois bancos, aguardar duas coletas e conferir séries temporais, variações por período e ranking com a métrica usada claramente nomeada.

**Acceptance Scenarios**:

1. **Given** ao menos duas coletas válidas, **When** escolho um período, **Then** vejo gráficos de conexões, transações e leituras, além de um ranking de bancos pela variação de transações nesse período.
2. **Given** estatísticas de duração de consultas disponíveis, **When** abro Desempenho, **Then** vejo contagem e latência das consultas agregadas, com unidade e janela.
3. **Given** estatísticas de duração indisponíveis, **When** abro Desempenho, **Then** a interface explica o pré-requisito e não inventa um valor de latência.

---

### User Story 4 - Consultar eventos de log (Priority: P2)

Como administrador, quero pesquisar erros e mensagens do servidor por período, severidade, banco e processo para relacioná-los às métricas observadas.

**Why this priority**: O produto observa logs, mas depende de uma fonte acessível e configurada.

**Independent Test**: Configurar uma fonte, produzir um evento de teste e localizá-lo pelos filtros; remover o acesso e verificar o diagnóstico da fonte.

**Acceptance Scenarios**:

1. **Given** uma fonte de logs válida, **When** há novos eventos, **Then** uma tabela mostra horário, severidade, banco, usuário, processo, código e mensagem disponíveis, com busca e filtros.
2. **Given** nenhuma fonte configurada, **When** abro Logs, **Then** vejo “fonte não configurada” e instruções objetivas, sem uma tabela vazia que sugira ausência de erros.
3. **Given** uma linha malformada ou duplicada, **When** ela é processada, **Then** a coleta continua, registra a falha de ingestão e não duplica o evento.

---

### User Story 5 - Consultar histórico e administrar a coleta (Priority: P2)

Como administrador, quero revisar períodos anteriores, controlar retenção e entender se a coleta está saudável.

**Why this priority**: Torna o dashboard útil além do instante atual e controla o crescimento do armazenamento local.

**Independent Test**: Coletar por um intervalo, reiniciar o aplicativo, consultar o mesmo intervalo, alterar a retenção e verificar a remoção de dados expirados.

**Acceptance Scenarios**:

1. **Given** coletas anteriores, **When** reinicio o aplicativo, **Then** o histórico ainda está disponível, com lacunas de coleta visíveis.
2. **Given** um período de retenção definido, **When** dados ultrapassam esse período, **Then** são removidos conforme a política e a interface informa a política vigente.
3. **Given** uma falha na coleta ou no armazenamento, **When** abro Diagnóstico, **Then** vejo a etapa afetada, horário da última execução bem-sucedida e ação segura de nova tentativa.

### Edge Cases

- A instância está acessível, mas a conta não tem permissão para algumas estatísticas: mostrar o dado disponível e indicar a permissão faltante por bloco.
- Contadores cumulativos ou a instância são reiniciados: não gerar variações negativas nem picos falsos; iniciar nova série após o reset.
- Um banco é criado, removido ou renomeado entre coletas: preservar seu histórico sem atribuí-lo a outro banco.
- Não há dados suficientes para calcular taxa ou tendência: mostrar “dados insuficientes”.
- Relógio local e servidor divergem: conservar horário de coleta e de evento separadamente e apresentar fuso.
- A fonte de logs gira, muda de arquivo ou perde permissão: retomar sem duplicar eventos e sinalizar falha quando necessário.
- A coleta demora mais que seu intervalo: impedir coletas sobrepostas e mostrar o atraso.
- O armazenamento local está cheio ou indisponível: preservar a observação atual quando possível e explicar que o histórico não está sendo gravado.
- Muitas sessões ou eventos excedem a tela: paginação e filtros mantêm a navegação responsiva.
- Uma sessão desaparece ou seu PID é reutilizado após abrir a confirmação: conferir novamente a identidade da sessão antes da ação; não encerrar uma sessão diferente.
- A sessão selecionada é a conexão de monitoramento ou um processo interno do PostgreSQL: ocultar ou desabilitar o encerramento com justificativa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST monitorar uma instância configurada por vez e identificar claramente a instância e o banco da conexão de monitoramento.
- **FR-002**: O sistema MUST exibir saúde da conexão, horário da última coleta bem-sucedida, idade dos dados e falhas recentes.
- **FR-003**: O sistema MUST coletar automaticamente métricas atuais enquanto o aplicativo estiver aberto, com intervalo inicial de 15 segundos e atualização manual.
- **FR-004**: O sistema MUST oferecer seções Visão geral, Conexões, Desempenho, Bancos, Logs e Diagnóstico/Configuração.
- **FR-005**: A Visão geral MUST conter cartões de indicadores, ao menos dois gráficos temporais e tabela resumida de bancos, com estados de carregamento, vazio, erro e dado desatualizado.
- **FR-006**: Conexões MUST apresentar total atual, distribuição por estado e tabela de sessões com busca, ordenação e filtros por banco, usuário, aplicação e estado.
- **FR-007**: Conexões MUST distinguir sessões ativas, ociosas, em transação e em espera quando essas informações estiverem disponíveis.
- **FR-008**: Bancos MUST mostrar conexões, variação de transações confirmadas e revertidas, leituras e acertos de cache por banco, com unidade e período.
- **FR-009**: O ranking de “bancos mais acessados” MUST usar a variação de transações no período selecionado; o rótulo MUST explicitar essa definição e não confundi-la com conexões simultâneas ou usuários únicos.
- **FR-010**: Desempenho MUST mostrar séries de atividade e, quando houver dados de duração de consultas, contagem, latência média, latência total e maiores consumidores por grupo de consulta.
- **FR-011**: O sistema MUST distinguir latência de consultas, espera de sessões e tempo de resposta da própria coleta; não deve combinar esses valores em uma métrica.
- **FR-012**: O sistema MUST indicar indisponibilidade, cobertura parcial e pré-requisitos das métricas opcionais, em vez de exibir zero como medição.
- **FR-013**: O sistema MUST conservar amostras e eventos de log localmente para consulta histórica após reinício.
- **FR-014**: O sistema MUST oferecer seleção de período comum aos gráficos, rankings e tabelas históricos, incluindo 1 hora, 24 horas, 7 dias e intervalo personalizado de até 7 dias; períodos anteriores podem ser consultados por outras janelas dentro da retenção.
- **FR-015**: Logs MUST ingerir fonte configurada pelo usuário, apresentar eventos em tabela paginada e filtrar por período, severidade, banco, usuário, processo e texto.
- **FR-016**: O sistema MUST identificar origem e último evento processado da fonte, reconhecer rotação de arquivos e evitar eventos duplicados.
- **FR-017**: O sistema MUST registrar falhas de leitura ou interpretação de logs sem interromper a coleta das demais métricas.
- **FR-018**: O sistema MUST permitir configurar intervalo de coleta e retenção, com padrão de 30 dias para métricas históricas e 7 dias para eventos de log.
- **FR-019**: O sistema MUST aplicar retenção automaticamente e mostrar uso aproximado de armazenamento local.
- **FR-020**: O sistema MUST permitir exportar o recorte filtrado de métricas tabulares ou eventos em formato legível por planilhas, sem credenciais.
- **FR-021**: O sistema MUST limitar a coleta de monitoramento a consultas de leitura e permitir apenas a ação administrativa explícita de encerrar uma conexão elegível escolhida na tabela; não oferecer SQL arbitrário, alteração de configuração ou outras operações destrutivas nesta versão.
- **FR-022**: O sistema MUST manter credenciais fora do histórico e de exportações; texto de consulta e informações de cliente potencialmente sensíveis devem ficar ocultos por padrão e ser exibidos apenas por ação explícita.
- **FR-023**: Cada gráfico e tabela MUST indicar título, unidade, período, momento da atualização e estado da fonte; tabelas devem oferecer navegação por teclado e cabeçalhos legíveis.
- **FR-024**: O sistema MUST continuar utilizável quando só parte das métricas estiver disponível, sem bloquear a navegação global.
- **FR-025**: O sistema MUST exigir confirmação explícita por sessão para “Encerrar conexão”, mostrando banco, usuário, PID, aplicação, início e consequência para a transação ativa; cancelar ou fechar a confirmação não executa a ação.
- **FR-026**: Antes de executar o encerramento, o processo principal MUST verificar novamente a identidade da sessão (ao menos PID e início), impedir o próprio processo de monitoramento e processos internos, aplicar a permissão do PostgreSQL e usar exclusivamente `pg_terminate_backend` com PID parametrizado; a interface MUST tratar sessão ausente, identidade alterada, permissão negada e resultado falso sem declarar sucesso.
- **FR-027**: O sistema MUST registrar localmente a tentativa de encerramento com horário, identidade do alvo, resultado e erro sanitizado, sem credenciais nem texto integral da consulta, e atualizar a tabela após a resposta.

### Key Entities

- **Instância monitorada**: Identidade da origem, versão, estado de conexão e capacidades observáveis.
- **Amostra de coleta**: Horário, duração, resultado e métricas capturadas em uma execução.
- **Sessão**: Identificador, banco, usuário, aplicação, estado, início, duração, espera e cliente disponíveis no momento da consulta.
- **Ação de encerramento**: Identidade da sessão alvo, confirmação, horário, resultado e eventual motivo sanitizado; não contém texto da consulta.
- **Métrica por banco**: Contadores cumulativos e valores atuais vinculados ao banco e horário da coleta.
- **Métrica de consulta**: Grupo de consulta e estatísticas agregadas de execução, quando disponíveis.
- **Evento de log**: Horário do servidor, origem, severidade, identificadores disponíveis, mensagem e posição de leitura.
- **Preferências de coleta**: Intervalo, retenção, filtros persistidos e configuração da fonte de logs.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em instância acessível, 95% das aberturas mostram estado da conexão e indicadores atuais em até 5 segundos.
- **SC-002**: Com 1.000 sessões visíveis e 100.000 eventos históricos, 95% das interações de filtro, ordenação e paginação respondem em até 2 segundos no equipamento de referência.
- **SC-003**: Após 24 horas de uso aberto, ao menos 99% dos ciclos programados têm sucesso ou falha registrados; períodos sem coleta são identificáveis.
- **SC-004**: Após reinício, 100% das amostras e eventos ainda dentro da retenção permanecem consultáveis.
- **SC-005**: Em avaliação com cinco administradores, ao menos quatro localizam uma conexão em espera, o banco com maior variação de transações e um erro de log sem ajuda, em até 3 minutos por tarefa.
- **SC-006**: Em todos os testes de fonte ausente, permissão insuficiente e estatística opcional desabilitada, a interface mostra o motivo e nunca apresenta um valor fabricado como medição.
- **SC-007**: Nenhuma exportação ou registro histórico contém senha de conexão em testes de inspeção dos arquivos produzidos.
- **SC-008**: Em testes com sessão elegível, sessão já encerrada, PID reutilizado, processo protegido e conta sem permissão, 100% das tentativas confirmadas encerram somente o alvo originalmente identificado ou informam falha; fechar o diálogo jamais encerra uma conexão.

## Assumptions

- O público inicial é um administrador usando o aplicativo desktop com acesso à instância local configurada no boilerplate; múltiplas instâncias simultâneas ficam fora do escopo inicial.
- Coleta e ingestão de logs ocorrem enquanto o aplicativo está aberto. Não há serviço residente nesta versão; períodos com o aplicativo fechado aparecem como lacunas.
- A fonte de logs será configurada separadamente e poderá ser um arquivo estruturado local acessível. Sem essa fonte, o restante do dashboard continua funcionando.
- Estatísticas de duração de consultas podem exigir configuração adicional no servidor. A versão inicial funciona sem elas e explica o que falta.
- A consulta de estatísticas depende das permissões da conta de monitoramento; a interface degrada por seção quando a visibilidade é parcial.
- “Todos os dados administrativos” significa nesta versão as áreas enumeradas nos requisitos e o encerramento de conexões. Gestão de usuários, backups, replicação e alteração de parâmetros ficam para evoluções posteriores.
- Texto integral de consultas, parâmetros e dados pessoais não são coletados por padrão.
- As restrições técnicas explicitamente fornecidas pelo solicitante estão registradas em [technical-constraints.md](technical-constraints.md) para a fase de planejamento.
