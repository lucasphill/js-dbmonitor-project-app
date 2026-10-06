# Feature Specification: Conexão AWS via SSM com autenticação IAM

**Feature Branch**: `Não criada; especificação local na main`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Preciso implementar um novo tipo de conexão AWS via SSM. Atualmente inicio manualmente uma sessão de encaminhamento ao endpoint RDS pela instância i-0ca44a45bc4d13da3, região sa-east-1, porta remota 5432 e local 15432, e gero um token IAM para rds_user. Quero que o aplicativo suporte esse tipo de conexão de forma eficiente e prática."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cadastrar e conectar a um RDS privado (Priority: P1)

Uma pessoa cadastra um perfil “AWS via SSM + IAM” e acessa o banco privado pelo DBMonitor sem iniciar comandos no terminal nem copiar tokens. Informa nome, endpoint original do RDS, porta remota, banco, usuário, região, instância intermediária e, opcionalmente, perfil AWS e porta local.

**Why this priority**: Substitui as duas etapas manuais pelo fluxo habitual de seleção de origem e permite monitorar bancos sem acesso direto de rede.

**Independent Test**: Em um ambiente previamente autorizado, salvar o perfil, selecioná-lo e observar uma consulta de teste e a coleta de métricas através do túnel, sem comandos manuais.

**Acceptance Scenarios**:

1. **Given** uma identidade AWS válida, instância intermediária disponível e banco autorizado, **When** a pessoa seleciona o perfil SSM, **Then** o aplicativo estabelece o túnel, obtém a autorização temporária e inicia a coleta somente após validar o acesso ao banco.
2. **Given** o exemplo com região sa-east-1, porta remota 5432 e porta local 15432, **When** a pessoa cadastra esses dados junto ao endpoint, banco, usuário e instância, **Then** o tráfego passa pela porta local e a autenticação e a validação TLS continuam identificando o endpoint original e a porta remota do RDS.
3. **Given** um perfil salvo e o aplicativo reiniciado, **When** a pessoa o seleciona, **Then** a configuração é reutilizada e a autorização temporária é obtida sem pedir token ou senha do banco.
4. **Given** campos ausentes ou inválidos, **When** a pessoa tenta salvar ou testar, **Then** os campos a corrigir são informados antes de iniciar uma sessão AWS.

---

### User Story 2 - Testar e corrigir problemas de acesso (Priority: P2)

A pessoa testa um perfil antes de usá-lo e recebe um resultado por etapa: pré-requisitos locais, identidade AWS, túnel, TLS, autenticação e consulta.

**Why this priority**: Evita tentativa e erro entre ferramentas e torna falhas de infraestrutura distinguíveis de falhas de autenticação.

**Independent Test**: Testar um perfil válido e repetir com porta ocupada, identidade expirada e instância indisponível; verificar mensagens úteis e limpeza dos recursos temporários.

**Acceptance Scenarios**:

1. **Given** um perfil ainda não salvo, **When** a pessoa seleciona Testar conexão, **Then** o aplicativo valida o fluxo completo sem mudar a origem ativa nem misturar seu histórico, e encerra os recursos exclusivos do teste.
2. **Given** ausência de AWS CLI ou Session Manager plugin, identidade expirada ou permissão negada, **When** a conexão é testada, **Then** a aplicação identifica a etapa e orienta a correção sem revelar credenciais.
3. **Given** uma porta local explicitamente escolhida já ocupada, **When** a conexão começa, **Then** o aplicativo informa o conflito e permite corrigir a configuração, sem encerrar o processo que ocupa a porta.
4. **Given** um túnel saudável da origem ativa, **When** a pessoa testa a mesma configuração, **Then** o teste não interrompe a coleta nem encerra o túnel em uso.

---

### User Story 3 - Manter e encerrar a conexão com previsibilidade (Priority: P2)

A pessoa acompanha o estado da conexão e consegue reconectar após uma interrupção sem repetir a configuração. A aplicação libera o túnel quando ele deixa de ser necessário.

**Why this priority**: Impede coleta aparentemente saudável após uma queda e evita sessões e portas abandonadas durante o uso normal.

**Independent Test**: Interromper um túnel ativo, reconectar, trocar de perfil e fechar a aplicação; verificar estado visível, isolamento dos dados e liberação da porta.

**Acceptance Scenarios**:

1. **Given** uma origem conectada, **When** o túnel cai, **Then** o aplicativo informa a desconexão, marca dados anteriores como obsoletos e oferece Reconectar; novas coletas só retomam após restabelecer o fluxo completo.
2. **Given** uma sessão conectada por mais de 15 minutos, **When** uma nova conexão ao banco é necessária, **Then** ela recebe uma autorização nova sem exigir intervenção ou interromper sessões ainda válidas.
3. **Given** um túnel pertencente ao aplicativo, **When** a pessoa troca de perfil, desconecta ou fecha a aplicação, **Then** as conexões dependentes são encerradas e a porta local é liberada em até 10 segundos em condições normais.
4. **Given** uma conexão ativa, **When** uma troca para outro perfil falha, **Then** não há coleta sob a identidade errada e o estado resultante da origem anterior é informado corretamente.

### Edge Cases

- Instância inexistente, offline, em região errada ou sem acesso ao endpoint remoto: falhar na etapa correspondente sem assumir que túnel aberto significa banco acessível.
- Instância incapaz de encaminhar ao host remoto ou permissão para iniciar/encerrar a sessão ausente: orientar revisão do ambiente e informar eventual sessão remota não encerrada.
- Região ou perfil AWS incorretos, credencial SSO expirada: orientar autenticação externa e permitir nova tentativa sem editar os dados do banco.
- Porta remota ou local fora do intervalo 1–65535: rejeitar; porta local automática: escolher uma disponível e tratar conflitos durante a abertura sem usar outro serviço por engano.
- Certificado inválido ou nome do servidor divergente: recusar a conexão; não desabilitar TLS para contornar o encaminhamento local.
- Token obtido, mas usuário sem autorização de login ou de alguma métrica: distinguir falha de login de coleta parcial por permissões adicionais.
- Cancelamento ou fechamento durante a abertura: interromper a tentativa e liberar recursos criados; sessões externas não devem ser encerradas.
- Cliques repetidos e tentativas simultâneas: impedir túneis duplicados para a mesma conexão ativa e resultados atrasados substituindo uma origem mais recente.
- Mudança da porta local: manter a identidade histórica do banco; mudança de endpoint, porta remota, banco ou usuário: aplicar a regra existente de nova origem e arquivamento.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O aplicativo MUST oferecer “AWS via SSM + IAM” no cadastro de origens, preservando os perfis locais, por senha e RDS IAM direto e seus históricos.
- **FR-002**: O perfil MUST permitir cadastrar nome, endpoint original RDS, porta remota (padrão 5432), banco, usuário PostgreSQL, região AWS, identificador da instância intermediária, identidade padrão ou perfil AWS nomeado e porta local automática ou explícita.
- **FR-003**: O aplicativo MUST validar campos obrigatórios, formato do endpoint, coerência da região, identificador da instância e portas antes de tentar acesso externo. Os valores do exemplo MUST ser configuráveis, nunca credenciais ou destinos fixos.
- **FR-004**: Ao selecionar um perfil válido, o aplicativo MUST abrir o túnel, aguardar sua disponibilidade, obter autorização IAM e validar uma consulta antes de declarar a origem conectada e iniciar a coleta.
- **FR-005**: A autenticação IAM MUST usar o endpoint original e a porta remota do RDS; o encaminhamento local MUST preservar validação da cadeia de certificados e do nome original do servidor.
- **FR-006**: O aplicativo MUST usar a mesma identidade e região AWS configuradas no perfil para o acesso SSM e a autorização IAM, sem solicitar chaves AWS ou token ao usuário.
- **FR-007**: Cada nova conexão física ao banco MUST receber autorização IAM recém-obtida; a expiração de uma autorização emitida MUST NOT encerrar uma sessão já estabelecida e saudável.
- **FR-008**: O aplicativo MUST salvar apenas a configuração reutilizável do perfil. Senhas, tokens e chaves AWS MUST NOT aparecer no armazenamento persistente, interface, logs de aplicação ou exportações.
- **FR-009**: Testar conexão MUST validar pré-requisitos, identidade, túnel, TLS, login e consulta; MUST preservar a origem ativa e encerrar recursos exclusivos do teste em sucesso, falha ou cancelamento.
- **FR-010**: O aplicativo MUST mostrar os estados desconectado, conectando, conectado e falha, com etapa e orientação de correção; uma tentativa sem progresso MUST terminar com falha explicada em até 60 segundos.
- **FR-011**: Ao perder o túnel, o aplicativo MUST interromper a coleta dependente, indicar dados obsoletos e permitir reconexão em uma ação, sem repetir o cadastro. A primeira versão MUST NOT fazer tentativas automáticas ilimitadas.
- **FR-012**: A conexão ativa MUST reutilizar seu túnel saudável entre consultas e coletas, sem criar uma sessão SSM por consulta; operações simultâneas MUST respeitar a origem e o ciclo de vida da conexão.
- **FR-013**: O aplicativo MUST permitir desconectar explicitamente e encerrar seus recursos ao trocar de perfil, cancelar uma tentativa ou fechar, incluindo a sessão remota quando autorizado. Se a limpeza remota falhar, MUST liberar recursos locais e informar a limitação enquanto houver interface disponível.
- **FR-014**: O aplicativo MUST limitar o encaminhamento à máquina local, evitar conflitos de porta e nunca assumir controle de túneis ou processos criados fora dele.
- **FR-015**: Consultas, métricas, histórico, preferências, exportações e ações administrativas MUST continuar isolados por origem. Acesso via SSM MUST NOT atribuir disponibilidade de logs CSV locais a um banco RDS.
- **FR-016**: Editar somente nome ou porta local MUST preservar o histórico; alterações nos campos já considerados identidade da origem MUST seguir a regra atual de arquivamento. Alterar instância intermediária MUST encerrar o túnel anterior antes do próximo acesso, preservando a identidade do banco quando os demais campos não mudarem.
- **FR-017**: A documentação MUST explicar os pré-requisitos locais e AWS, os campos do perfil, o teste, a reconexão e as correções de erros usuais, sem exigir comandos manuais de túnel ou token no fluxo normal.

### Key Entities *(include if feature involves data)*

- **Perfil AWS via SSM**: Configuração reutilizável da origem RDS, instância intermediária, identidade AWS e preferência de porta local; vinculado ao histórico da origem.
- **Sessão de túnel**: Encaminhamento temporário pertencente ao aplicativo, com origem associada, porta local efetiva, estado e responsabilidade de encerramento; não representa uma nova origem de dados.
- **Autorização IAM temporária**: Credencial transitória para abrir uma conexão ao endpoint original, nunca persistida ou exibida.
- **Resultado de conexão**: Estado e resultado sanitizado por etapa, separado das permissões e da disponibilidade de métricas de monitoramento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Com os dados e pré-requisitos disponíveis, uma pessoa cadastra e testa uma nova origem em até 3 minutos, sem abrir o terminal nem copiar credenciais.
- **SC-002**: Após o cadastro, selecionar a origem exige uma única ação; em 10 tentativas no ambiente de aceitação saudável, ao menos 9 apresentam dados em até 30 segundos.
- **SC-003**: Em todos os cenários de falha definidos, a interface informa a etapa e uma ação de correção em até 60 segundos, sem expor credenciais.
- **SC-004**: Uma sessão de monitoramento de 60 minutos, incluindo abertura de novas conexões após 15 minutos, não exige intervenção para renovar credenciais.
- **SC-005**: Em 10 ciclos de conectar, testar, trocar de origem e desconectar, nenhum recurso local exclusivo de uma operação encerrada permanece após 10 segundos, nenhum túnel externo é afetado e não há mistura de histórico.
- **SC-006**: Perfis dos tipos existentes continuam passando pelos cenários de cadastro, teste, seleção e consulta após a inclusão do novo tipo.

## Assumptions

- O escopo inicial combina encaminhamento SSM para RDS PostgreSQL e autenticação IAM, como no pedido. SSM com senha, SSH, descoberta automática de instâncias, autenticação SSO dentro do aplicativo e uso do túnel por pgAdmin estão fora deste escopo.
- Há uma origem ativa por vez. Porta automática é o padrão para reduzir conflitos; a porta 15432 pode ser escolhida explicitamente.
- A região informada é compartilhada entre instância intermediária e RDS. Suporte a regiões ou identidades distintas por etapa fica fora do escopo inicial.
- A pessoa já possui AWS CLI, Session Manager plugin e identidade configurada. Instalação de dependências e concessão de permissões AWS não são realizadas automaticamente.
- O ambiente AWS disponibiliza uma instância gerenciada com encaminhamento remoto compatível, resolução e acesso de rede ao RDS, e permissões para sessões SSM e autenticação IAM do banco.
- SSO expirado é renovado pelo fluxo externo existente; após a renovação, a pessoa pode tentar conectar novamente.
- A constituição existente contém apenas placeholders, sem princípios ratificados. Os padrões reais do projeto fundamentam isolamento das origens e proteção de credenciais.
- A especificação descreve requisitos; decisões de implementação e plano técnico pertencem à próxima fase.

### Referências de domínio

- [AWS: iniciar sessões e encaminhar portas a hosts remotos](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html): pré-requisitos do Session Manager e acesso ao host remoto.
- [AWS: conectar ao RDS com autenticação IAM](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Connecting.html): autorização temporária com validade de 15 minutos para abertura de conexão.
