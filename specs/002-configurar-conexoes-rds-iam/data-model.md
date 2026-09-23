# Data model: perfis e origens monitoradas

## Entidades

### ConnectionProfile / `instances`

`id` inteiro imutável; `label` (1–80), `host` (nome DNS RDS ou localhost válido, até 253), `port` (1–65535), `monitor_database` (1–63), `db_user` (1–63), `auth_mode` (`legacy_env` | `session_password` | `rds_iam`), `aws_region` (nulo salvo IAM), `aws_profile` (nulo para identidade AWS padrão), `tls_ca_path` ou identificador do bundle confiável (sem conteúdo secreto), `archived_at` opcional, `created_at`, `updated_at`, e campos existentes de versão, saúde e capacidades. `id=1` preserva o perfil local v2. Nome exibido não precisa ser único; UI sempre acompanha endpoint e banco. Apenas alteração de `label` mantém id; edição de host, porta, banco, usuário, região, perfil AWS, modo de autenticação ou CA cria novo id e arquiva o anterior. Segredos e tokens não são colunas.

### ActiveProfile

Tabela singleton `active_profile(id=1, instance_id FK instances.id)`. Referência somente perfil não arquivado. Seleção persistente sobrevive reinício. Troca serializada no controlador do processo principal; `generation` monotônica existe apenas em memória para rejeitar respostas tardias. Perfil 1 é o padrão após migração, salvo seleção explícita posterior.

### Preferences

Campos atuais (`collection_interval_seconds`, `metrics_retention_days`, `logs_retention_days`, `log_source_path`, `filters_json`) passam a ser por `instance_id` único. Migração copia linha antiga de `id=1` para `instance_id=1`. Novos perfis recebem padrões atuais 15 s / 30 d / 7 d. `log_source_path` é nulo no RDS IAM. Retenção executa escopada por perfil.

### CollectionCycle, InstanceSample, DatabaseSample, QuerySample

`collection_cycles.instance_id`, `instance_samples.instance_id` e `database_samples.instance_id` já existem. Todas as inserções recebem o id do perfil capturado no começo do ciclo. `query_samples` se associa via `cycle_id`. Leitura por período, ranking, overview, performance e exportação fazem filtro pelo mesmo id; nunca usam `ORDER BY` global sem filtro. `recordCycle` não altera campos imutáveis do perfil a partir de payload de coleta.

### LogSource / LogEvent

`log_sources.instance_id` referencia perfil, com unicidade `(instance_id, path)`. `log_events` herda a origem por `source_id`; consultas juntam `log_sources` e filtram id do perfil. Migração atribui fontes existentes ao perfil 1. `file_identity` e `offset_bytes` continuam evitando duplicação. Ingestão do RDS sem fonte suportada retorna indisponibilidade, sem usar fonte local de outro perfil.

### TerminationAttempt

`termination_attempts.instance_id` já existe e continua obrigatório. Cada tentativa inclui o perfil capturado antes da ação; consulta/auditoria nunca cruza origens. A identidade da sessão continua PID + `backend_start`. O processo principal rejeita confirmação se id ou geração ativa diferir do contexto original, antes de reconsultar sessão e chamar `pg_terminate_backend`.

### ConnectionTestResult (transitória)

Estado `success` ou categoria de falha, horário, destino não sensível e versão/banco/usuário retornados quando houver. Não persiste token, stderr nem senha. Pode ser exibido no painel e descartado ao trocar perfil.

## Migração v2 → v3

1. Abrir o arquivo existente e obter versão; criar cópia de segurança para teste/recuperação antes da migração em produção.
2. `PRAGMA foreign_keys=OFF` antes da transação exigida para reconstruir `instances`, mantendo a integridade durante cópia; iniciar `BEGIN IMMEDIATE`.
3. Criar nova `instances` sem `CHECK(id=1)` e com campos de perfil. Copiar id 1 e métricas de saúde atuais; derivar host/porta/banco/usuário do ambiente local existente com valores padrão e modo `legacy_env`.
4. Reconstruir `preferences` com chave por `instance_id`, copiando preferências globais para perfil 1. Acrescentar `instance_id=1` às fontes de log existentes e reconstruir índice de unicidade por `(instance_id,path)`.
5. Criar seleção ativa apontando para perfil 1 e índices para consultas escopadas (`instance_id, finished_at`, `instance_id, collected_at`, `instance_id, attempted_at`, origem e horário dos logs).
6. Executar `PRAGMA foreign_key_check`, exigir zero linhas, atualizar `user_version`, `COMMIT`, reativar FK. Em erro, `ROLLBACK` e manter arquivo v2 utilizável. Testar migração com base v2 populada, vazia e interrupção simulada.

## Transições

`draft input → validated → saved inactive → tested → active → archived`. Teste não ativa automaticamente. Perfil arquivado não pode ser ativado ou editado. Excluir perfil significa arquivar por padrão; purga explícita de histórico é operação separada e nunca alcança outro perfil. Um perfil ativo só pode ser arquivado após ativar outro. Falha de conexão muda o estado de saúde, não a seleção do usuário. Mudança de identidade: criar novo perfil, arquivar antigo, conservar histórico antigo, selecionar o novo apenas se confirmado.

## Invariantes

- `instance_id` de qualquer linha histórica é imutável e existente.
- No máximo um perfil ativo. Perfil ativo não arquivado.
- Apenas um controlador de coleta executa por vez; toda operação SQL e resposta IPC carrega contexto da geração ativa.
- Token IAM existe só durante obtenção e handshake; senha local só na memória do processo principal durante a sessão.
- `auth_mode=rds_iam` exige região, endpoint válido e TLS verificado; não tem senha armazenada nem fonte CSV local herdada.
- `profileId` de confirmação administrativa deve ser igual ao ativo no momento do SQL; PID e início da sessão são revalidados na mesma origem.
