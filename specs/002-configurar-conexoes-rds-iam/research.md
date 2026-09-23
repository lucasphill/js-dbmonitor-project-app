# Research: perfis PostgreSQL e RDS IAM

## 1. Autenticação RDS IAM com CLI local

**Decision**: Para cada nova conexão física, chamar a AWS CLI instalada com `rds generate-db-auth-token --hostname <endpoint> --port <porta> --region <região> --username <usuário>`, acrescentando `--profile <nome>` somente quando o perfil AWS nomeado foi selecionado. Passar argumentos separados (`execFile`/`spawn`, `shell:false`), sem registrar stdout/stderr. Usar o token retornado somente como senha transitória do cliente PostgreSQL.

**Rationale**: A AWS documenta token como substituto temporário de senha com validade de 15 minutos para abertura de conexão. A CLI já faz a assinatura com as credenciais do ambiente do usuário. [Autenticação IAM](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Connecting.html), [CLI generate-db-auth-token](https://docs.aws.amazon.com/cli/latest/reference/rds/generate-db-auth-token.html).

**Alternatives considered**: AWS SDK geraria token sem processo externo, mas não atende literalmente ao uso da AWS CLI já configurada e adicionaria dependências/variação de resolução de credenciais; token gerado ao salvar perfil venceria; agendamento fixo de renovação do pool derrubaria conexões válidas e poderia deixar tokens velhos em reconexões entre agendamentos.

**Integration note**: `node-postgres` aceita `password` como callback síncrono ou assíncrono, que é resolvido ao abrir cliente. O pool não deve guardar uma string de token. [node-postgres: Connecting](https://node-postgres.com/features/connecting).

## 2. Limites e sanitização do processo AWS CLI

**Decision**: Definir timeout curto, tamanho máximo de saída, `windowsHide`, sem shell, flags que desabilitem pager/prompt automático e sem aceitar argumento ou executável arbitrário do renderer. Validar endpoint, porta, região, usuário e nome do perfil antes da chamada. Converter falhas em categorias estáveis e orientação sem stderr bruto. O caminho do CLI é descoberto em configuração controlada pelo processo principal/PATH do host; erro de descoberta deve ser explícito no pacote Windows.

**Rationale**: O token aparece no stdout da CLI e pode conter material de assinatura; stderr e exceções também podem incluir comandos/argumentos. Limites evitam travamento e vazamento. `generate-db-auth-token` é uma operação local de geração: êxito da CLI não prova rede, `rds-db:connect`, usuário habilitado ou login PostgreSQL. [AWS CLI](https://docs.aws.amazon.com/cli/latest/reference/rds/generate-db-auth-token.html), [AWS IAM connection](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Connecting.html).

**Alternatives considered**: `exec`/PowerShell com string interpolada, rejeitado por risco de execução de entrada; expor token ao renderer, rejeitado por ampliar superfície de vazamento; mostrar stderr integral, rejeitado por conteúdo não confiável.

## 3. TLS e cadeia de confiança do RDS

**Decision**: Exigir TLS com validação de cadeia e nome do servidor, usando o endpoint RDS literal da configuração (não apelido DNS) e um bundle CA oficial RDS empacotado ou indicado pelo administrador. Documentar origem, versão e atualização do bundle. Rejeitar ausência, expiração ou divergência de certificado. Não oferecer modo `rejectUnauthorized:false`.

**Rationale**: AWS publica bundles globais e regionais de CAs RDS e recomenda registrar raízes confiáveis. O token é específico do host usado na geração, então a identidade TLS deve corresponder ao mesmo endpoint. [RDS SSL/TLS](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html), [RDS IAM via CLI](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Connecting.AWSCLI.html).

**Alternatives considered**: TLS sem verificar certificado não autentica o servidor; depender somente do trust store do SO pode não conter CA RDS atual; baixar bundle em tempo de execução adiciona rede e risco de confiança ao primeiro uso.

## 4. Teste completo de conexão

**Decision**: Criar cliente temporário com a mesma configuração que o coletor usará, gerar token no handshake IAM, validar TLS, autenticar e executar consulta pequena (`SELECT current_database(), current_user, version()` ou equivalente) antes de relatar sucesso. Separar o resultado de conexão das capacidades estatísticas descobertas depois.

**Rationale**: Token gerado localmente pode ser inválido para o banco ou rede. A consulta comprova o caminho real até o banco, enquanto privilégios administrativos são específicos de cada métrica. [AWS IAM](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Connecting.html), [node-postgres](https://node-postgres.com/features/connecting).

**Alternatives considered**: Apenas gerar token, ou só abrir TCP, ambos geram falso positivo.

## 5. Isolamento, migração e seleção

**Decision**: Usar `instances.id` como identidade estável de origem/perfil e reconstruir a tabela para remover `CHECK(id=1)` em uma migração SQLite v3. Copiar v2 para id 1, acrescentar campos não sensíveis do perfil e seleção ativa, escopar todas as leituras/escritas por id. Preservar histórico em perfil arquivado quando campos de identidade mudam; rótulo pode mudar em linha. Troca da origem ativa é serializada com contador de geração e fechamento do pool anterior.

**Rationale**: O esquema atual fixa `instances.id=1` e `recordCycle` grava id 1; apenas adicionar uma lista de perfis sem escopar todas as consultas misturaria dados e poderia direcionar `pg_terminate_backend` ao banco errado. Usar a FK existente minimiza reescrita do histórico. A migração deve ocorrer em transação e terminar com `PRAGMA foreign_key_check` sem erros. [SQLite ALTER TABLE](https://www.sqlite.org/lang_altertable.html), [SQLite foreign keys](https://www.sqlite.org/foreignkeys.html).

**Alternatives considered**: Um arquivo SQLite por perfil complica migração, retenção e troca; sobrescrever `instances.id=1` apaga identidade histórica; guardar só host e filtrar por nome não protege contra rename/alias/ambiguidade.

## 6. Senha local e persistência

**Decision**: Perfil local migrado continua obtendo senha pela configuração `.env` já suportada. Novo perfil por senha mantém segredo somente em memória da sessão, recebido por chamada explícita do painel; após reinício pode pedir novamente. Perfis IAM nunca exibem campo de senha. SQLite guarda apenas metadados não sensíveis.

**Rationale**: Mantém a compatibilidade localhost sem criar armazenamento de segredos em texto claro. O processo principal é o único dono da senha em uso e não a devolve por IPC.

**Alternatives considered**: Senha em SQLite é contrária ao requisito; credencial do SO demandaria integração adicional e escopo de política que não foi solicitado.

## 7. Logs e ações administrativas por perfil

**Decision**: Fonte CSV local fica vinculada apenas ao perfil local. A seção Logs do RDS mostra indisponibilidade até haver fonte própria. Leituras históricas e exportações recebem o id do perfil ativo no processo principal, e ações de sessão incluem id/geração de origem da linha que abriu a confirmação, revalidados antes do SQL.

**Rationale**: RDS não expõe automaticamente arquivo CSV local; mudar o pool entre a abertura e confirmação de um diálogo poderia afetar instância errada. A ação existente já revalida PID e `backend_start`, e agora precisa também da origem.

**Alternatives considered**: Reutilizar caminho CSV global ou confiar só no PID, rejeitados por confundir origens.
