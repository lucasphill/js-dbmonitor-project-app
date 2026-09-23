# Pesquisa e decisões

## Fontes e ambiente

Verificado em 2026-09-23: PostgreSQL local 18.4 com `pg_stat_activity`, `pg_stat_database`, `pg_stat_io` e `pg_stat_wal`. `pg_stat_statements` está disponível, mas não instalado nem carregado em `shared_preload_libraries`; `track_io_timing=off`, `logging_collector=off`, `log_statement=none` e `log_min_duration_statement=-1`. A conta atual é superusuário. Electron 44 usa Node 24.21.0 e expõe `node:sqlite` com `DatabaseSync`.

Referências oficiais: [estatísticas do PostgreSQL](https://www.postgresql.org/docs/current/monitoring-stats.html), [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html), [funções administrativas](https://www.postgresql.org/docs/current/functions-admin.html), [SQLite no Node](https://nodejs.org/api/sqlite.html) e [estrutura do Next.js no pacote instalado](../../node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md).

## Decisões

### Coleta e visualização

- **Decisão**: Usar `pg_stat_activity` para sessões atuais, usuários, estados, espera e query ativa; `pg_stat_database` para contadores por banco; `pg_stat_io` e `pg_stat_wal` para painéis administrativos quando disponíveis.
- **Razão**: Views oficiais fornecem dados sem exigir mudança no servidor. Queries ativas têm duração `now() - query_start` somente quando `state='active'`; em sessão ociosa, `query_start` se refere à última query.
- **Alternativas**: Extensões ou scraping de logs para atividade corrente acrescentariam configuração e não substituem a view.

### Latência

- **Decisão**: Exibir duração em andamento da query ativa, espera da sessão e duração da coleta como métricas distintas. Latência agregada por grupo de query depende de `pg_stat_statements` instalada e carregada; identificar essa capacidade na UI sem fabricar valores.
- **Razão**: Contadores de transação não medem latência. A instância atual ainda não oferece `pg_stat_statements` operacional.
- **Alternativas**: Inferir latência por taxa de transações foi rejeitado por ser incorreto; `track_io_timing` mede I/O e também está desativado.

### Encerramento de conexão

- **Decisão**: Ação por linha com diálogo explícito, alvo `{pid, backend_start}` e detalhes da sessão. Main process consulta novamente `pg_stat_activity` e aplica `pg_terminate_backend(pid, timeout > 0)` somente se for backend cliente elegível, identidade coincidir e não for backend do próprio monitoramento. Usar parâmetro para PID. Interpretar `false`, erro de permissão e alvo desaparecido como falha; atualizar lista e registrar tentativa sanitizada.
- **Razão**: PID pode ser reutilizado; a chamada com timeout positivo pode confirmar término. A permissão final é do PostgreSQL. A confirmação explica que a transação da sessão será abortada.
- **Alternativas**: `pg_cancel_backend` apenas cancela a query, não encerra a sessão; matar processo do SO não é seguro.

### Histórico e SQLite

- **Decisão**: Usar `node:sqlite` do Electron para arquivo em `app.getPath('userData')`, `PRAGMA user_version` para migrações, transações curtas, `WAL`, prepared statements e índices por tempo/identidade. Persistir agregados e metadados sem query text por padrão; paginar logs e históricos no SQLite. A API síncrona fica restrita ao main process, com escritas curtas e limitadas, sem trabalho pesado na thread de renderização.
- **Razão**: Runtime atual já inclui SQLite nativo e evita módulo nativo adicional e rebuild no pacote.
- **Alternativas**: `better-sqlite3` adicionaria custo de empacotamento; histórico apenas em memória perderia dados após reinício.

### Logs

- **Decisão**: Aceitar fonte de arquivo CSV estruturado do PostgreSQL configurada pelo usuário, registrar identidade/posição de leitura e eventos com chave de deduplicação. Detectar rotação e falha de leitura. Estado inicial da instância atual: fonte não configurada.
- **Razão**: Views de estatísticas não fornecem logs completos e o coletor do servidor está desligado.
- **Alternativas**: Ler `pg_log` por SQL exigiria privilégios e configuração específicos; texto livre é frágil para filtros por coluna.

### UI e IPC

- **Decisão**: Next.js com `output: 'export'`; renderização de dados via ponte preload `contextBridge`, com métodos nomeados e payloads validados no main. Shadcn/ui para layout, tabelas e diálogo; componente Chart usa Recharts existente. Séries históricas recebem estados explícitos `ready`, `insufficient`, `unavailable`, `stale`.
- **Razão**: O renderer permanece sem credenciais, acesso ao filesystem ou SQL arbitrário. Um sistema visual e uma biblioteca de gráficos evitam redundância.
- **Alternativas**: API HTTP local ou acesso direto à base no Next acrescentariam superfície e segredo ao renderer.
