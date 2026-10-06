# Data Model: AWS SSM + IAM

## ConnectionProfile persistente

Manter campos atuais. Host/port sempre representam RDS remoto.

| Campo | Tipo | Validação |
| --- | --- | --- |
| authMode | enum | Acrescentar rds_iam_ssm; preservar modos existentes |
| ssmTarget | string/null | Obrigatório SSM; EC2 ^i-(?:[0-9a-f]{8}\|[0-9a-f]{17})$ |
| ssmLocalPort | integer/null | null automática; explícita 1–65535 |

SSM reutiliza endpoint original coerente com região, usuário/banco, perfil AWS opcional e CA bundled/custom de IAM. Campos SSM null/ausentes nos outros modos. Senha transitória rejeitada em ambos os modos IAM. Normalizar opcionais ausentes para null sem quebrar drafts antigos.

SQLite instances recebe ssm_target e ssm_local_port no schema 4; ampliar CHECK auth_mode e coerência entre modo e campos SSM. Rebuild com backup, IDs intactos, transação e verificação FK. Nunca persistir token, processos ou sessão remota.

## Identidade histórica

Chave atual: host, port, database, dbUser, authMode, awsRegion, awsProfile, tlsCaMode, tlsCaPath. Alteração exige confirmação e arquivamento da origem antiga. Label, ssmTarget e ssmLocalPort preservam histórico; target/porta exigem reinício da sessão ativa e aumento da generation, label não. Centralizar comparação usada por storage/controller/UI.

## TunnelSession privada em memória

Identificador interno, chave de transporte (destino remoto/target/região/perfil/preferência de porta), IP/família/porta efetivos, processo/grupo próprio, SessionId, leases, operationId, abort signal, deadlines, timestamps e erro sanitizado. Dados internos e stdout não saem do main.

Estados: opening → ready → closing → closed; opening/ready → failed → closing. Ready só prova listener; connected público exige consulta. Cleanup idempotente.

Lease ativo associado a origem/generation; temporário a teste/requestId. Só compartilhar configuração idêntica healthy. Teste libera seu lease; troca/desconexão invalida leases do túnel antigo e aborta operações dependentes.

## ConnectionRuntime público

sourceContext, revision crescente, state disconnected/connecting/connected/failed, stage, changedAt, effectiveLocalPort opcional, code/message sanitizados e cleanupWarning opcional. Sem PID, SessionId, token ou stdout.

disconnected/failed → connecting por activate/reconnect; connecting → connected após consulta; connecting/connected → failed por erro/queda; qualquer estado → disconnected por cancel/disconnect. Contexto/operação antiga não publica resultado; revision ordena eventos dentro da mesma generation.

## ConnectionTest

Preservar success/failed e campos atuais; acrescentar requestId, code opcional, canceled opcional e etapas prerequisites/tunnel. Cancelamento = failed + CONNECTION_CANCELED + canceled=true. Resultado não altera runtime ativo. Token existe apenas ao autenticar nova conexão física.

## Revisão: importação transitória de comando

Schema persistente continua 4; não acrescentar commandText às instances, ProfileDraft ou ConnectionProfile.

### SsmCommandImportResult (público, transitório)

- `patch`: objeto parcial com somente `host`, `port`, `awsRegion`, `awsProfile`, `ssmTarget`, `ssmLocalPort` presentes no comando; host/região/profile/target strings validadas, portas inteiros 1–65535. Ausência não vira null/default.
- `presentFields`: lista sem duplicação dos nomes efetivamente incluídos no patch.
- `missingFields`: campos de transporte obrigatórios ausentes entre host/awsRegion/ssmTarget; formulário completa também label/database/dbUser conforme estado existente.
- Não conter comando, tokens intermediários, PID, SessionId, credenciais ou configuração TLS nova.

### ImportPreview (somente formulário)

Texto bruto limitado, revisão local, ID do pedido, snapshot/revisão do draft, resultado validado, draft candidato e lista de substituições (nome fixo do campo, valor atual/novo). Informações ausentes continuam preservadas; defaults do formulário novo não se confundem com valores extraídos.

Estados: idle → parsing → preview → applied/idle; parsing → error; mudança de texto/draft/perfil/modo, fechamento ou descarte → idle e invalidação dos pedidos anteriores. Parsing e preview nunca alteram o perfil ativo. Applied altera apenas draft, limpa texto/prévia e invalida teste anterior. Salvar/testar executam os fluxos existentes.

### Validação

Formato proibido/valor fornecido inválido: falha segura sem patch parcial. Campo não fornecido: diagnóstico de complementação. Campo presente válido individualmente mas incoerente com valor existente preservado: aplicar recusado com erro de campo e draft intacto; corrigir formulário/importação. Mudança histórica continua calculada no salvar existente, não no parser.

### SsmCommandImportResponse

Envelope discriminado `{ok:true,data:SsmCommandImportResult}` ou `{ok:false,error:{code,message}}`. Preload retorna o envelope IPC sanitizado sem lançar Error personalizado pela contextBridge; UI consome o code estruturado e mostra somente mensagem local allowlisted. Nenhum texto bruto aparece na resposta.
