# Research: AWS SSM + IAM

**Date**: 2026-10-06. Código local e fontes primárias consultados; nenhuma sessão AWS real iniciada.

## Transporte

**Decision**: Reutilizar CLI com Session Manager plugin, spawn no main sem shell e documento remoto fixo.

**Rationale**: Mantém a identidade/perfil existentes. Plugin é pré-requisito local; instância deve ter SSM Agent >=3.1.1374.0 e resolução/acesso ao host remoto.

**Alternatives considered**: SDK acrescenta dependência e não substitui transporte do plugin; túnel externo mantém trabalho manual; SSH amplia escopo.

**Source**: [AWS iniciar sessões](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html).

## TLS e token

**Decision**: TCP usa IP literal loopback e porta local; TLS usa CA e ssl.servername do endpoint original; token usa host/porta originais por nova conexão física.

**Rationale**: pg pode sobrescrever servername quando host é DNS, inclusive localhost; IP preserva servername explícito. Token vale 15 minutos para abertura, sem expirar uma sessão SQL já estabelecida. Provar comportamento TLS com pg 8.23.0 fixado no lockfile.

**Alternatives considered**: hosts global altera computador; TLS sem validação viola requisito; connectionString com sslmode pode substituir opções TLS.

**Sources**: [pg SSL](https://node-postgres.com/features/ssl), [pg connection.js](https://github.com/brianc/node-postgres/blob/master/packages/pg/lib/connection.js), [AWS IAM lifecycle](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.IAMDBAuth.html).

## Readiness e porta

**Decision**: Parser de SessionId/marcador de porta, processo vivo, sondagem IPv4/IPv6 e consulta TLS. Porta automática com retries limitados; explícita não muda silenciosamente.

**Rationale**: Plugin faz bind localhost, cuja família depende do SO. Mensagens podem chegar em chunks sem newline. Listener pronto não prova acesso ao banco. Reserva de porta tem corrida quando liberada para o plugin.

**Alternatives considered**: sleep fixo é frágil; TCP aberto sozinho não prova destino nem login; proxy próprio é desnecessário.

**Sources**: [plugin básico](https://github.com/aws/session-manager-plugin/blob/mainline/src/sessionmanagerplugin/session/portsession/basicportforwarding.go), [plugin multiplexado](https://github.com/aws/session-manager-plugin/blob/mainline/src/sessionmanagerplugin/session/portsession/muxportforwarding.go). Bind loopback e família serão validados nos pacotes suportados; listener wildcard deve ser recusado.

## Lifecycle e encerramento

**Decision**: Leases em memória para ativo/teste; SessionId próprio; terminate-session com CLI e término restrito de árvore/grupo próprio como fallback. Abort imediato fora da fila.

**Rationale**: CLI pode criar plugin filho; child.kill no pai não garante liberação. Encerrar remoto e local são responsabilidades separadas. Cleanup limitado/idempotente não afeta sessões externas.

**Alternatives considered**: Matar por nome/porta afeta recursos externos; abandonar depende do timeout remoto; parser ilimitado expõe dados brutos.

**Source**: [AWS terminate-session](https://docs.aws.amazon.com/cli/latest/reference/ssm/terminate-session.html).

## Integração local

**Decision**: Novo modo rds_iam_ssm, duas colunas de transporte, helper comum RDS IAM, lifecycle no controller e configuração TCP em db.

**Rationale**: Validador/SQLite atuais aceitam três modos. setActiveProfile é lazy; switchTo da mesma origem é no-op; update considera todo campo exceto label identidade. Ajustar explicitamente para validação SSM, reconexão e transporte. main/overview precisam incluir SSM nos bloqueios CSV. Provider atual usa aws.exe: resolver executável por plataforma.

**Alternatives considered**: transportMode independente amplia contratos para combinações fora do escopo; omitir distinção de modo pode ignorar túnel silenciosamente.

## Resultado

Todas as decisões resolvidas, sem NEEDS CLARIFICATION. Portas automáticas, região compartilhada, SSO externo e reconexão explícita seguem a spec. Pesquisa não equivale a validação AWS real.

## Revisão: importar comando SSM — 2026-10-06

**Decision**: Interpretar um subconjunto literal e documentado do comando no main, em módulo puro, por IPC nomeado; resultado é patch parcial revisável.

**Rationale**: Aproveita validação CommonJS existente e gate de origem do Electron. Não precisa compartilhar módulo Node com o bundle estático ou introduzir parser de shell completo. Texto não produz efeitos de conexão.

**Alternatives considered**: Execução livre viola o escopo; parser duplicado no renderer cria divergências; biblioteca de shell traz sintaxes/expansões desnecessárias; regex única perde contexto de aspas/JSON. Lexer limitado mantém revisão e testes claros.

**Decision**: Aceitar shorthand e JSON unitário conforme gramática da aplicação, com verificação explícita de duplicações e rejeição de opções fora da allowlist.

**Rationale**: A documentação da AWS descreve parâmetros como mapa de listas e oferece shorthand/JSON. A importação aceita strings simples como conveniência para os mesmos campos únicos; não promete emular toda a CLI. Continuação de linha serve só à formatação. JSON.parse sozinho sobrescreve chaves duplicadas, logo não basta para cumprir a spec.

**Sources**: [AWS CLI start-session](https://docs.aws.amazon.com/cli/latest/reference/ssm/start-session.html), [AWS encaminhamento a host remoto](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-sessions-start.html).

**Decision**: Campos ausentes ficam fora do patch; prévia referencia snapshot do draft e exige Aplicar explícito. Validar apenas campos presentes e revalidar configuração combinada.

**Rationale**: Região/target/endpoint podem faltar sem serem inventados. Preservar perfil AWS e portas já preenchidos evita trocar identidade histórica sem intenção. Defaults atuais valem no draft novo, não no parser. O comando não fornece banco/usuário; continuam no formulário. A API atual valida draft completo, portanto extrair helpers de campos, sem usar valores fictícios nem enfraquecer create/update/test.

**Alternatives considered**: Defaults no parser substituiriam dados existentes; salvar na importação elimina revisão; validar draft completo bloqueia comandos incompletos válidos.

**Decision**: Sem migração, SDK ou alteração do transporte. Testar parser/IPC/merge offline e ensaiar UI com bridge real.

**Rationale**: Schema 4 e lifecycle da v0.1.7 já suportam todos os campos. A nova funcionalidade só prepara o formulário. Aceitação AWS anterior permanece separada e não foi declarada concluída.

**Resultado**: Decisões da revisão resolvidas. Gramática, erros, patch e ciclo da prévia especificados em contracts/ssm-command-import.md. Sem sessão AWS iniciada pela pesquisa.

## Ajuste confirmado no ensaio Electron

**Decision**: A API nomeada de importação retorna envelope IPC sanitizado discriminado, consumido pelo formulário, preservando código de erro como dado estruturado.

**Rationale**: Error.code rejeitado não atravessou contextBridge no ensaio real. Mensagem genérica escondia causas específicas; erro estruturado mantém orientação sem eco do texto. As demais APIs não foram alteradas.

**Alternatives considered**: Prefixar mensagem com código expõe detalhes internos; depender de custom properties de Error reproduz o problema; repassar texto/erro bruto viola a proteção do comando.
