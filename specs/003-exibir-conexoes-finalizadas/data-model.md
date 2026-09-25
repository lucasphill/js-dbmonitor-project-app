# Data model: conexões finalizadas

## ObservedSession

Chave única: `profileId: integer > 0`, `pid: integer > 0`, `backendStart: string ISO UTC` (precisão de microssegundos).

Campos: `lastObservedAt: ISO timestamp`, `finishedAt: ISO timestamp | null`, e campos não sensíveis de `SessionRow` (`databaseOid`, `database`, `user`, `application`, `state`, `waitEventType`, `waitEvent`, `backendType`, `queryStartedAt`, `transactionStartedAt`, `activeDurationMs`). SQL e endereço de cliente não são armazenados.

Estados: **aberta** (`finishedAt = null`) → **finalizada** (`finishedAt != null`) somente após uma coleta válida do mesmo perfil sem essa chave. `finishedAt` é imutável. Mesmo PID com novo `backendStart` cria outra entidade. Na projeção, `state = "finished"`; o último estado PostgreSQL é apenas histórico interno.

## ValidSessionSnapshot

Campos: `profileId`, `generation`, `observedAt`, `rows: SessionRow[]`. Regras: conjunto completo de sessões cliente retornado por uma consulta concluída sem erro, sem filtros e sem paginação; identidade de cada linha válida e única; perfil e geração ainda correspondentes ao início da coleta. Resultado de erro, abortado ou fora de ordem não é snapshot válido.

## SessionTableProjection

Campos por linha: dados não sensíveis da sessão, `state` com valor PostgreSQL ou `"finished"`, `finishedAt: string | null`, `profileId`, `generation`. Ordenação/filtros aplicados ao conjunto do perfil, depois `page.limit` (1 a 200) e `page.cursor` (offset existente). `total` representa linhas após filtros; `nextCursor` segue a página. Contadores de sessões atuais não incluem finalizadas, exceto um contador explicitamente nomeado.
