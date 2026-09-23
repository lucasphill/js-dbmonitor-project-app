# Contrato da aplicação desktop

O renderer acessa somente `window.bdash` via preload. Todos os métodos retornam objetos serializáveis, não expõem `pg`, SQLite, caminhos arbitrários, credenciais ou SQL. O main process valida origem do frame, formato, limites e permissões para cada chamada. Erros têm `{code, message}` sanitizados, sem stack, senha ou texto integral da query.

## Tipos compartilhados

```text
Period = { from: ISODate, to: ISODate }             // from < to, janela de até 7 dias
Page = { limit: 1..200, cursor?: string }           // ordenação estável
SourceState = ready | loading | empty | insufficient | unavailable | partial | stale | error
DataBlock<T> = { state: SourceState, source: string, updatedAt?: ISODate,
                 unit?: string, reason?: string, data?: T }
SessionIdentity = { pid: positiveInteger, backendStart: ISODate }
OperationResult = { status: success | not_found | identity_changed | protected |
                           denied | failed, message: string, auditedAt: ISODate }
```

## Leitura

| Método | Entrada | Saída | Regras |
|---|---|---|---|
| `getOverview` | período opcional | instância, saúde, capacidades, KPIs, séries e bancos resumidos | Estado por bloco; dados antigos marcados `stale` |
| `getSessions` | filtros por banco, usuário, aplicação, estado; busca; ordenação; página | contagem e sessões atuais | Paginação limitada; texto/cliente ocultos por padrão; duração ativa só para `state=active` |
| `revealSessionDetails` | `SessionIdentity` | texto da query/cliente disponíveis ou motivo de indisponibilidade | Revelação explícita, sem persistência do texto; revalidar identidade |
| `getDatabaseActivity` | `Period`, página/ordem | série e ranking por delta de transações, leituras, cache, conexões | Reset separa segmentos; unidade e fonte em todos os blocos |
| `getPerformance` | `Period`, página | duração atual de queries/espera/coleta e agregados opcionais | `pg_stat_statements` ausente => `unavailable` com pré-requisito, não zero |
| `getLogs` | `Period`, severidade, banco, usuário, PID, busca e página | eventos e estado da fonte | Sem fonte => `unavailable`; paginação pelo SQLite |
| `getDiagnostics` | nenhum | capacidade, último sucesso/falha de coleta/log, retenção e uso local | Erros sanitizados e ação segura de nova tentativa |
| `getPreferences` | nenhum | intervalo, retenções, fonte de log e filtros | Nunca retorna senha |

## Comandos

| Método | Entrada | Saída | Efeito |
|---|---|---|---|
| `refreshNow` | nenhum | ciclo/estado | Coleta única; se já em curso, retornar estado sem sobrepor |
| `updatePreferences` | intervalo, retenções e fonte de log validada | preferências efetivas | Migração/retenção aplicadas sem perder dados não expirados |
| `exportFiltered` | dataset permitido, filtros e período | arquivo escolhido e quantidade | Exportação CSV; sem credenciais; limites e sanitização de célula |
| `terminateSession` | `SessionIdentity` e confirmação explícita vinculada aos detalhes exibidos | `OperationResult` | Somente uma sessão escolhida; sem ação em lote ou PID livre via SQL |

### Fluxo de `terminateSession`

1. UI abre `AlertDialog` da linha selecionada com banco, usuário, PID, aplicação, `backend_start` e aviso de interrupção da transação. Botão de confirmação é distinto de cancelar.
2. Renderer envia identidade completa da linha confirmada. Main process valida origem e esquema, consulta novamente `pg_stat_activity` e exige igualdade de PID e `backend_start`.
3. Main process verifica `backend_type='client backend'`, PID diferente da sua conexão/consulta e permissões delegadas ao PostgreSQL. Executa somente `pg_terminate_backend($1, timeout_positivo)` com parâmetro, usando conexão do pool que não é o alvo.
4. Sucesso exige retorno verdadeiro; `false`, sessão ausente, PID reutilizado, processo interno, erro de permissão e timeout são resultados distintos. Registrar resultado sanitizado em SQLite, atualizar lista e mostrar mensagem. Fechar o diálogo antes de confirmar não envia comando.

## Segurança e falhas

- O preload não expõe `ipcRenderer` genérico. O main aceita apenas canais declarados e rejeita origem diferente de `bdash://app/` ou desenvolvimento autorizado.
- Todos os filtros e ordenações são allowlists e valores parametrizados; período, página e volume máximo limitados. Não há endpoint para SQL livre.
- Falha em uma capacidade não invalida as demais. A UI preserva última coleta com idade/fonte e status `stale` quando PostgreSQL fica indisponível.
- Texto da query, parâmetros e cliente não são armazenados por padrão em SQLite nem incluídos em diagnósticos; exportação obedece ao recorte e não inclui senha.
