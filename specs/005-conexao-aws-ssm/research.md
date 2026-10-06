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
