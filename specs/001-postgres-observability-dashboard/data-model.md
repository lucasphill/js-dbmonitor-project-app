# Modelo de dados

Horários são ISO 8601 UTC no contrato IPC e inteiros Unix em milissegundos no SQLite. Identificador da instância associa todos os registros históricos; nunca persistir senha. `null` significa valor desconhecido ou indisponível, não zero.

## Entidades

| Entidade | Campos principais | Identidade e relações | Validação |
|---|---|---|---|
| Instância monitorada | `id`, nome exibido, host, porta, banco de monitoramento, versão, estado, capacidades, última coleta | Uma instância ativa; 1:N amostras | Não armazenar senha; host sem dados secretos em exportação |
| Ciclo de coleta | `id`, `instance_id`, início/fim, duração ms, resultado, erro sanitizado | 1:N amostras por banco; 1:N totais | Tempo final >= inicial; resultado `success/partial/failed` |
| Amostra de instância | `cycle_id`, conexões totais/por estado, WAL, I/O, tempo de resposta da coleta | N:1 ciclo | Contadores >=0 ou `null`; fonte e unidade explícitas |
| Amostra por banco | `cycle_id`, `database_oid`, nome, `numbackends`, commit, rollback, blocos lidos/acertos, `stats_reset` | Chave ciclo + OID; nome é atributo histórico | Deltas apenas entre amostras do mesmo OID e sem reset |
| Sessão atual | `pid`, `backend_start`, `backend_type`, `database_oid`, banco, usuário, aplicação, estado, esperas, início da query/transação, cliente e texto da query sob revelação explícita | Chave temporária `{pid, backend_start}`; não é histórico de consultas | Query em andamento só se `state=active`; backend cliente para encerramento |
| Estatística de query | `dbid`, `userid`, `queryid`, período/ciclo, chamadas, tempo total/médio, blocos, reset | Opcional via `pg_stat_statements`; valores agregados | Sem extensão: capacidade indisponível; texto da query não persistido por padrão |
| Evento de log | `id`, instante do servidor, ingestão local, origem, severidade, banco, usuário, PID, código, mensagem, posição | Chave única de origem + identidade do arquivo + posição/hash | Mensagem pode ser sensível; exportação explícita e filtro aplicado |
| Cursor da fonte de log | caminho, identidade do arquivo, offset, tamanho, última ingestão, estado/erro | 1 por fonte | Rotação gera nova identidade e não duplica eventos |
| Preferências | intervalo de coleta, retenção métricas/logs, fonte de log, filtros persistidos | Registro único local | Intervalo positivo com limite mínimo; retenção positiva |
| Tentativa de encerramento | instante, instância, PID, `backend_start`, banco, usuário, aplicação, confirmação, resultado, erro sanitizado | Vinculada à identidade da sessão, sem query text | Resultado `success/not_found/identity_changed/protected/denied/failed` |

## Séries, taxas e estados

- Deltas de commit/rollback/leitura entre amostras do mesmo OID e segmento de contador. Se `stats_reset` muda, contador cai ou instância reinicia, iniciar novo segmento e mostrar lacuna.
- Ranking de bancos: soma de deltas de commit + rollback dentro do período; rótulo “transações no período”. `numbackends` é valor instantâneo e não participa do ranking.
- Estados de bloco: `loading`, `ready`, `empty`, `insufficient`, `unavailable`, `partial`, `stale`, `error`. Cada bloco guarda fonte, hora da atualização, unidade e motivo quando não está `ready`.
- Sessão selecionada: `visible -> confirmation_open -> confirming -> success | not_found | identity_changed | protected | denied | failed`; fechar o diálogo retorna a `visible` sem chamar IPC. Após qualquer resposta, atualizar sessões; `success` só com confirmação do PostgreSQL.
- Coletor: `idle -> running -> success | partial | failed -> idle`; não iniciar outro ciclo durante `running`. Fechamento do aplicativo cria lacuna histórica, sem interpolação.

## Persistência e índices

Migrações incrementais por `PRAGMA user_version`; transações atômicas por ciclo e cursor de log. Índices por `(instance_id, collected_at)`, `(database_oid, collected_at)`, `(event_time, severity)` e `(source_id, file_identity, offset)` único. Retenção remove amostras e logs expirados em lotes; auditoria de encerramento usa retenção própria documentada, sem credenciais. Consultas históricas usam período e paginação limitada.
