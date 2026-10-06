# Contract: Connection profiles IPC

Contrato proposto, ainda não implementado. Preservar window.bdash, envelope `{ok:true,data}` / `{ok:false,error:{code,message}}`, validação de mainFrame e origem. Sem execução/SQL/filesystem/AWS genéricos.

## Operações existentes

- profiles:create/update aceitam rds_iam_ssm, ssmTarget e ssmLocalPort conforme data-model. Mudança somente de transporte não exige nova origem.
- profiles:list mantém estrutura atual; campos SSM null em modos antigos.
- profiles:activate(id) mantém ActiveProfile e adiciona runtime opcional. SSM publica connecting, valida consulta e só então connected/coleta. Falha operacional retorna origem selecionada + runtime failed; ID/validação falham pelo envelope. Mesma tentativa não duplica recursos; mesma origem desconectada pode reconectar.
- profiles:test(draftOrId,transientPassword,options?) mantém chamadas existentes; options `{requestId}` opcional. ID string único 1–64, alfanumérico/hífen/underscore; main gera se omitido. Resultado ConnectionTest estendido; senha rejeitada IAM. Nunca retorna stack/stdout.

## Operações novas

| IPC | Preload | Input | Output |
| --- | --- | --- | --- |
| profiles:connection-status | getConnectionStatus | nenhum | ConnectionRuntime |
| profiles:disconnect | disconnectConnectionProfile | SourceContext | runtime disconnected + cleanupWarning opcional |
| profiles:reconnect | reconnectConnectionProfile | SourceContext | ActiveProfile + runtime; nova generation |
| profiles:cancel-test | cancelConnectionTest | requestId | canceled boolean idempotente |
| profiles:cancel-connect | cancelConnectionAttempt | SourceContext | ConnectionRuntime |

Contexto antigo é PROFILE_CHANGED. Cancel-test só alcança pedido do renderer autorizado; nunca recebe PID/SessionId. Cancelamento sinaliza abort antes de aguardar fila; cleanup final é coordenado pelo controller.

Evento profiles:connection-state → onConnectionState(listener) com unsubscribe, sem event nativo Electron. Payload runtime sanitizado, apenas para janela autorizada. UI aplica contexto atual/revision recente e consulta status ao montar. Resposta de activate/reconnect atualiza contexto antes de aceitar eventos da nova generation.

## Etapas e erros

Acrescentar prerequisites/tunnel às etapas atuais aws_identity/token/network/tls/database_auth/query/complete. Connected usa complete.

Novos códigos: SSM_PLUGIN_NOT_FOUND, SSM_TARGET_UNAVAILABLE, SSM_ACCESS_DENIED, SSM_SESSION_FAILED, LOCAL_PORT_IN_USE, SSM_TUNNEL_LOST, CONNECTION_CANCELED. Reutilizar AWS_CLI_NOT_FOUND, AWS_IDENTITY_UNAVAILABLE, CONNECTION_TIMEOUT, TLS_VALIDATION_FAILED, DATABASE_AUTH_FAILED, DATABASE_PERMISSION_DENIED. Erros via allowlist; warning de cleanup não substitui erro original. Deadline 60 s e cleanup separado 10 s.

## Contrato UI

Modo AWS via SSM + IAM mostra campos RDS/AWS/CA, instância e porta automática/manual, sem senha/token. Teste e abertura têm Cancelar; origem SSM tem estado, Reconectar e Desconectar. Porta efetiva é diagnóstico e nunca substitui identidade remota nas métricas. Disconnect/drop mantém últimos dados stale; refresh não reabre túnel.
