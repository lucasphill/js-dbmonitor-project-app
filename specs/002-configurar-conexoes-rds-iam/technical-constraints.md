# Restrições técnicas para o planejamento

- Evoluir o aplicativo Electron + Next.js existente. A UI configura perfis por uma ponte restrita; acesso ao AWS CLI, tokens, PostgreSQL e SQLite permanece no processo principal.
- Utilizar a AWS CLI já configurada no computador para obter o token RDS IAM. Os exemplos do solicitante usam `aws rds generate-db-auth-token` com endpoint, porta, região e usuário PostgreSQL; admitir identidade padrão ou `--profile` nomeado. Invocar com argumentos separados, sem shell nem interpolação de comando.
- A validade do token RDS IAM é 15 minutos para autenticar uma **nova** conexão. O pool PostgreSQL precisa obter token novo na abertura de cada conexão física, não ao salvar o perfil nem apenas ao criar o pool. Conexões já autenticadas não precisam ser derrubadas no minuto 15.
- RDS IAM exige TLS com validação do nome do endpoint e cadeia de confiança. Usar cadeia CA da AWS RDS adequada e política de atualização clara, sem `rejectUnauthorized: false` ou equivalentes.
- Não persistir token IAM, credenciais AWS ou senha PostgreSQL em SQLite, logs, exportação ou mensagens IPC. Sanitizar também mensagens de erro produzidas por CLI/driver antes da UI e de logs do processo.
- O esquema SQLite atual é de instância única (`instances.id=1`); planejar migração transacional que remova essa restrição, preserve histórico localhost em `id=1`, verifique integridade referencial e relacione amostras, logs, diagnósticos, preferências e auditorias a perfis/origens. A troca do perfil ativo precisa drenar/parar coleta e pool anterior antes de expor o novo. Uma edição da identidade da origem deve criar novo identificador e arquivar o anterior; mudar só o rótulo mantém identificador.
- A ingestão CSV local atual não representa automaticamente logs remotos do RDS; manter a capacidade indisponível para esses perfis até que uma fonte própria seja suportada/configurada.
- O teste de conexão precisa verificar autorização AWS, TLS, autenticação PostgreSQL e consulta real; somente gerar token não confirma acesso ao banco.

## Referências oficiais para pesquisa do plano

- [AWS RDS: IAM database authentication for PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.Connecting.Python.html)
- [AWS CLI: generate-db-auth-token](https://docs.aws.amazon.com/cli/latest/reference/rds/generate-db-auth-token.html)
- [AWS RDS: SSL/TLS certificate bundles](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html)
- [node-postgres: Connecting](https://node-postgres.com/features/connecting)
