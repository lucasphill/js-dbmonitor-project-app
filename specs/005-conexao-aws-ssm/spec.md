# Feature Specification: Conexão AWS via SSM com autenticação IAM

**Feature Branch**: `Não criada; especificação local na main`

**Created**: 2026-10-06

**Status**: Implemented locally — importação de comando SSM validada; aceitação externa da base pendente

**Updated**: 2026-10-06

**Revision scope**: Acrescentar cadastro por comando à feature existente. Os requisitos anteriores continuam válidos. Plano, pesquisa, modelo e contratos foram revisados para FR-018–FR-024; tasks.md incorpora a importação e registra evidências/pendências da implementação.

**Input**: User description: "Preciso implementar um novo tipo de conexão AWS via SSM. Atualmente inicio manualmente uma sessão de encaminhamento ao endpoint RDS pela instância i-0ca44a45bc4d13da3, região sa-east-1, porta remota 5432 e local 15432, e gero um token IAM para rds_user. Quero que o aplicativo suporte esse tipo de conexão de forma eficiente e prática."

**Additional input**: "Na última especificação gerada, quero poder adicionar o comando de conexão SSM diretamente, para facilitar a conexão em vez de adicionar os dados separadamente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cadastrar e conectar a um RDS privado (Priority: P1)

Uma pessoa cadastra um perfil “AWS via SSM + IAM” e acessa o banco privado pelo DBMonitor sem iniciar comandos no terminal nem copiar tokens. Pode colar seu comando de conexão SSM para preencher os dados de encaminhamento ou informar os campos manualmente. Completa nome, banco e usuário, além de qualquer informação obrigatória ausente no comando, e revisa a configuração antes de testar ou salvar.

**Why this priority**: Substitui as duas etapas manuais pelo fluxo habitual de seleção de origem e permite monitorar bancos sem acesso direto de rede.

**Independent Test**: Em um ambiente previamente autorizado, salvar o perfil, selecioná-lo e observar uma consulta de teste e a coleta de métricas através do túnel, sem comandos manuais.

**Acceptance Scenarios**:

1. **Given** uma identidade AWS válida, instância intermediária disponível e banco autorizado, **When** a pessoa seleciona o perfil SSM, **Then** o aplicativo estabelece o túnel, obtém a autorização temporária e inicia a coleta somente após validar o acesso ao banco.
2. **Given** o exemplo com região sa-east-1, porta remota 5432 e porta local 15432, **When** a pessoa cadastra esses dados junto ao endpoint, banco, usuário e instância, **Then** o tráfego passa pela porta local e a autenticação e a validação TLS continuam identificando o endpoint original e a porta remota do RDS.
3. **Given** um perfil salvo e o aplicativo reiniciado, **When** a pessoa o seleciona, **Then** a configuração é reutilizada e a autorização temporária é obtida sem pedir token ou senha do banco.
4. **Given** campos ausentes ou inválidos, **When** a pessoa tenta salvar ou testar, **Then** os campos a corrigir são informados antes de iniciar uma sessão AWS.

---

### User Story 4 - Cadastrar a conexão colando o comando SSM (Priority: P1)

A pessoa que já possui um comando de encaminhamento SSM cola esse texto no cadastro “AWS via SSM + IAM”, escolhe importar e recebe os campos preenchidos. Completa apenas as informações que o comando não contém e usa o mesmo fluxo de teste e seleção de origem.

**Why this priority**: Evita transcrever região, instância, endpoint e portas, reduzindo esforço e erros no cadastro de uma conexão já conhecida.

**Independent Test**: Colar o comando de exemplo, importar, conferir os dados extraídos, completar nome/banco/usuário e salvar um perfil equivalente ao preenchimento manual. A importação deve funcionar sem acesso AWS.

**Acceptance Scenarios**:

1. **Given** um comando `aws ssm start-session` com região sa-east-1, target i-0ca44a45bc4d13da3, documento AWS-StartPortForwardingSessionToRemoteHost e parâmetros host/portNumber/localPortNumber, **When** a pessoa importa o texto, **Then** endpoint, região, instância e portas são preenchidos sem redigitá-los; o aplicativo solicita banco e usuário ausentes e preserva o endpoint remoto como identidade IAM/TLS.
2. **Given** o mesmo comando com argumentos em outra ordem, valores entre aspas, parâmetros no formato chave=valor ou objeto JSON e texto em uma linha ou com continuação de linha, **When** ele é importado, **Then** a configuração resultante é equivalente, incluindo perfil AWS nomeado quando informado.
3. **Given** campos já preenchidos, **When** a pessoa importa um comando válido, **Then** vê os valores extraídos e quais campos serão substituídos antes de confirmar a aplicação; nome, banco, usuário e preferências que não vieram do comando são preservados.
4. **Given** comando incompleto, malformado, documento diferente ou opção não suportada, **When** a pessoa tenta importar, **Then** recebe indicação do problema, nenhum campo existente é parcialmente substituído e pode corrigir o texto ou continuar pelo preenchimento manual.
5. **Given** um comando com encadeamento de outros comandos, redirecionamento, expansão de variáveis, execução embutida ou credenciais, **When** a pessoa tenta importar, **Then** o texto é recusado sem executar qualquer ação ou expor valores sensíveis em mensagens ou registros.
6. **Given** uma configuração importada e confirmada, **When** a pessoa testa, salva ou edita os campos, **Then** usa as mesmas validações e regras dos perfis manuais; após reiniciar, reutiliza o perfil sem precisar colar o comando novamente.

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

- Comando vazio ou acima de 16 KiB: informar limite e manter o formulário intacto.
- Aspas não fechadas, argumentos repetidos, parâmetros duplicados ou valor ambíguo: recusar, sem escolher silenciosamente uma interpretação.
- Continuação de linha de Bash (`\`) ou PowerShell (acento grave), quebras CRLF/LF e espaços extras: aceitar quando apenas unem o mesmo comando; não executar sintaxe de terminal.
- Parâmetros ausentes: importar os valores presentes e solicitar campos obrigatórios faltantes; em cadastro novo, porta remota ausente segue padrão 5432, porta local ausente fica automática e perfil AWS ausente usa identidade padrão. Em formulário já preenchido, os campos ausentes no comando mantêm seus valores e são revalidados. Região, target e endpoint ausentes não são inventados.
- Comando sem documento informado, com outro documento ou outra operação AWS: recusar e orientar usar o comando de encaminhamento remoto suportado.
- Texto importado alterado depois da prévia: invalidar a prévia e exigir nova importação antes de aplicá-la.
- Editar um perfil existente por importação: não salvar nem reconectar ao colar; confirmação da importação só altera o formulário. Salvar continua sujeito às regras de identidade/histórico e encerramento do túnel.

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

- **FR-018**: O cadastro e a edição de perfis AWS via SSM + IAM MUST oferecer a opção “Colar comando SSM”, junto ao preenchimento manual; a pessoa MUST poder importar, revisar e aplicar os valores antes de testar ou salvar.
- **FR-019**: A importação MUST aceitar exclusivamente um comando `aws ssm start-session` com documento explícito `AWS-StartPortForwardingSessionToRemoteHost`. MUST extrair `--region`, `--target`, `--profile` opcional e os parâmetros `host`, `portNumber` e `localPortNumber`, preservando identidade remota e os padrões descritos nos casos de borda.
- **FR-020**: A importação MUST aceitar ordem livre dos argumentos, opções no formato `--nome valor` ou `--nome=valor`, valores entre aspas simples/duplas, parâmetros chave=valor ou objeto JSON com valores literais únicos (strings ou listas contendo um único valor), e continuação de linha de Bash e PowerShell. MUST recusar aspas inválidas, argumentos/parâmetros repetidos, opções desconhecidas e parâmetros fora do conjunto suportado, com orientação para correção.
- **FR-021**: Colar, importar e aplicar MUST apenas preparar o formulário, sem executar o texto, abrir sessão, gerar token ou modificar a origem ativa. Texto com múltiplos comandos, redirecionamento, expansão de variáveis, execução embutida ou credenciais MUST ser recusado; valores literais MUST passar pelas mesmas validações dos campos manuais.
- **FR-022**: Antes de substituir campos preenchidos, o aplicativo MUST mostrar prévia dos valores extraídos e campos afetados e exigir aplicação explícita. MUST preservar campos não presentes no comando, aplicar a importação sem alterações parciais em caso de erro e permitir edição manual posterior; nome, banco e usuário MUST continuar sendo solicitados quando ausentes.
- **FR-023**: O texto bruto do comando MUST ser temporário, descartado ao fechar o formulário e excluído de armazenamento, logs e exportações. Somente os campos reutilizáveis validados MUST ser salvos no perfil; erros MUST indicar o campo ou problema sem reproduzir conteúdo potencialmente sensível.
- **FR-024**: A importação MUST aceitar até 16 KiB e informar sucesso ou erro antes de qualquer acesso externo. Teste, seleção, reconexão, histórico e compatibilidade de perfis importados MUST obedecer aos mesmos requisitos dos perfis cadastrados manualmente. A documentação MUST incluir um exemplo sanitizado e indicar as informações a completar.

### Key Entities *(include if feature involves data)*

- **Importação de comando SSM**: Texto temporário, valores extraídos, prévia de substituições e problemas de validação; não constitui uma sessão nem uma origem persistida.
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

- **SC-007**: Com um comando suportado e os dados complementares disponíveis, uma pessoa preenche e salva uma nova origem em até 1 minuto, sem redigitar os dados presentes no comando.
- **SC-008**: Em todos os exemplos de aceitação equivalentes (ordem, aspas, formato dos parâmetros e continuação de linha), os campos importados correspondem aos valores do comando; a interface apresenta prévia ou erro em até 1 segundo para entradas de até 16 KiB.
- **SC-009**: Em todos os cenários de importação recusada, a origem ativa e os campos anteriores permanecem intactos, sem acesso externo ou divulgação de dados sensíveis; perfis importados passam pelos mesmos cenários de conexão e histórico dos perfis manuais.

## Assumptions

- A nova opção importa o comando SSM já usado pela pessoa; não é um terminal integrado nem uma execução livre de comandos. O texto é convertido em configuração revisável, e a aplicação mantém o gerenciamento de túnel e IAM existente.
- O comando SSM não fornece banco PostgreSQL nem usuário de autenticação. Esses dados são completados no formulário; importar `aws rds generate-db-auth-token`, scripts, variáveis de ambiente, arquivos de parâmetros, descoberta de valores e executáveis com caminho personalizado fica fora desta revisão.
- A importação é opcional e preserva o cadastro manual e os perfis já salvos. Não se exige migração dos perfis existentes somente para acrescentar esta forma de entrada.

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
