export const explanationGroups = [
  { id: "overview", title: "Visão geral" },
  { id: "connections", title: "Conexões" },
  { id: "performance", title: "Desempenho" },
  { id: "databases", title: "Bancos" },
  { id: "logs", title: "Logs" },
] as const

export type ExplanationGroupId = (typeof explanationGroups)[number]["id"]

export interface ExplanationTopic {
  id: string
  group: ExplanationGroupId
  title: string
  meaning: string
  unit: string
  temporalScope: string
  source: string
  caveats: string
  calculation?: string
  related: readonly string[]
}

export interface ExplanationGroup {
  id: ExplanationGroupId
  title: string
  topics: readonly ExplanationTopic[]
}

export interface ExplanationReference {
  screen: ExplanationGroupId
  label: string
  location: string
  topicId: ExplanationTopicId
}

const noZero = "Se a fonte não fornecer esse dado, o valor aparece como indisponível; isso não representa zero."

function topic<const Id extends string>(
  id: Id, group: ExplanationGroupId, title: string, meaning: string, unit: string,
  temporalScope: string, source: string, caveats = noZero, calculation?: string,
  related: readonly string[] = [],
) {
  return { id, group, title, meaning, unit, temporalScope, source, caveats, calculation, related }
}

/** Glossário local: não consulta nem armazena dados das origens PostgreSQL. */
export const explanationTopics = [
  topic("open-connections", "overview", "Conexões abertas", "Número de sessões observadas na instância.", "conexões", "Retrato da última coleta válida.", "Atividade atual do PostgreSQL."),
  topic("transaction-rate", "overview", "Transações/min", "Ritmo observado de transações confirmadas ou revertidas.", "tx/min", "Taxa entre duas coletas válidas; o cartão mostra a última taxa calculável.", "Contadores dos bancos e histórico local.", "Exige duas coletas contínuas, sem reset e com intervalo válido. Lacunas não viram zero.", "(Aumento de commits + aumento de rollbacks) ÷ minutos entre coletas.", ["transactions-per-collection", "transactions-in-period", "commits-total", "rollbacks-total"]),
  topic("query-mean-time", "overview", "Tempo médio de consulta", "Tempo médio ponderado pelas chamadas de consultas monitoradas.", "ms", "Acumulado das estatísticas disponíveis, independentemente do período dos gráficos.", "Estatísticas de consultas do PostgreSQL (pg_stat_statements).", "Pode ficar indisponível por falta da extensão, permissões ou chamadas medidas; o reset das estatísticas reinicia a base.", "Soma do tempo de execução ÷ soma das chamadas.", ["query-mean-time-aggregate", "query-aggregate-latency"]),
  topic("active-databases", "overview", "Bancos ativos", "Quantidade de bancos observados que tinham ao menos uma conexão na última coleta.", "bancos", "Retrato da última coleta válida.", "Atividade por banco do PostgreSQL.", "Não é o total de bancos existentes nem indica que todos estejam disponíveis."),
  topic("open-connections-series", "overview", "Conexões abertas no tempo", "Evolução da quantidade de conexões observadas em cada coleta.", "conexões", "Cada ponto é um retrato dentro do período selecionado.", "Histórico local das coletas PostgreSQL.", "Uma lacuna indica falta de amostra confiável, não ausência de conexões.", undefined, ["open-connections"]),
  topic("transaction-rate-series", "overview", "Taxa de transações no tempo", "Evolução da taxa calculada de transações.", "tx/min", "Cada ponto compara coletas válidas no período selecionado.", "Contadores por banco e histórico local.", "Coletas sem par comparável ou após reset deixam lacunas no gráfico.", "(Aumento de commits + aumento de rollbacks) ÷ minutos entre coletas.", ["transaction-rate", "transactions-per-collection"]),
  topic("database-identity", "overview", "Banco", "Nome do banco de dados ao qual a linha se refere.", "não se aplica", "Identidade observada na listagem atual.", "Catálogo do PostgreSQL.", "Nomes não são uma medida de atividade."),
  topic("database-connections", "overview", "Conexões do banco", "Sessões atualmente associadas a um banco.", "conexões", "Retrato da última consulta ou coleta indicada na tela.", "Atividade do PostgreSQL por banco.", "Não representa o total histórico de acessos; a visibilidade pode depender de permissões."),
  topic("commits-total", "overview", "Commits totais", "Transações concluídas com confirmação nesse banco.", "transações", "Contador acumulado desde o último reset estatístico do PostgreSQL.", "Estatísticas por banco (pg_stat_database).", "Pode reiniciar após reset. Não é a quantidade no período selecionado.", undefined, ["rollbacks-total", "transactions-in-period", "transaction-rate"]),
  topic("rollbacks-total", "overview", "Rollbacks totais", "Transações revertidas nesse banco, inclusive reversões intencionais.", "transações", "Contador acumulado desde o último reset estatístico do PostgreSQL.", "Estatísticas por banco (pg_stat_database).", "Rollback não significa necessariamente erro. O contador pode reiniciar após reset e não corresponde ao período selecionado.", undefined, ["commits-total", "transactions-in-period"]),
  topic("cache-hit-percent", "overview", "Cache hit", "Parcela das leituras de blocos atendidas pelo cache em memória.", "%", "Proporção calculada com contadores acumulados do banco na última coleta.", "Estatísticas por banco (pg_stat_database).", "Sem blocos registrados no denominador, a porcentagem é indisponível; não confundir com a contagem de acertos.", "Acertos de cache ÷ (acertos de cache + blocos lidos) × 100.", ["cache-hits-per-collection", "cache-hits-in-period"]),

  topic("session-total", "connections", "Total de sessões", "Quantidade de sessões que correspondem aos filtros da lista.", "sessões", "Retrato da consulta atual; inclui todas as páginas filtradas.", "Atividade de sessões do PostgreSQL.", "A tabela mostra apenas uma página por vez."),
  topic("session-active", "connections", "Sessões ativas", "Sessões em estado ativo no conjunto consultado.", "sessões", "Retrato da consulta atual.", "Estados de sessão do PostgreSQL.", "Ativa indica atividade no momento observado, não uso contínuo."),
  topic("session-idle", "connections", "Sessões ociosas", "Sessões conectadas sem consulta em execução no momento observado.", "sessões", "Retrato da consulta atual.", "Estados de sessão do PostgreSQL.", "Ociosa ainda ocupa uma conexão; não equivale a desconectada."),
  topic("session-waiting-page", "connections", "Em espera nesta página", "Sessões com evento de espera entre as linhas da página atual.", "sessões", "Retrato da página de sessões atualmente exibida.", "Eventos de espera do PostgreSQL.", "Não é o total de esperas de toda a instância; mudar página ou filtro pode alterar a contagem."),
  topic("session-distribution", "connections", "Distribuição de conexões", "Comparação das sessões por estado e por usuário.", "sessões", "Retrato da consulta atual; o agrupamento por usuário usa apenas a página exibida.", "Atividade de sessões do PostgreSQL.", "Os dois gráficos podem ter abrangências diferentes."),
  topic("sessions-by-state", "connections", "Distribuição por estado", "Comparação das sessões visíveis por estado de atividade.", "sessões", "Retrato do conjunto retornado na consulta atual.", "Estados de sessão do PostgreSQL.", "Estados desconhecidos podem aparecer com o nome recebido do servidor."),
  topic("sessions-by-user-page", "connections", "Distribuição por usuário", "Comparação das sessões da página atual por usuário.", "sessões", "Retrato da página atual; mostra os usuários mais frequentes nela.", "Linhas de sessão retornadas pelo PostgreSQL.", "Não representa necessariamente todos os usuários da instância."),
  topic("session-pid", "connections", "PID da sessão", "Identificador do processo servidor associado à sessão.", "identificador", "Válido para a sessão observada no momento da consulta.", "Atividade de sessões do PostgreSQL.", "PIDs podem ser reutilizados depois que uma sessão termina."),
  topic("session-database", "connections", "Banco da sessão", "Banco ao qual a sessão está conectada.", "não se aplica", "Retrato da sessão observada.", "Atividade de sessões do PostgreSQL."),
  topic("session-user", "connections", "Usuário da sessão", "Usuário PostgreSQL usado pela conexão.", "não se aplica", "Retrato da sessão observada.", "Atividade de sessões do PostgreSQL.", "Pode estar oculto ou indisponível conforme a visibilidade concedida."),
  topic("session-application", "connections", "Aplicação da sessão", "Nome de aplicação informado pelo cliente ao abrir a conexão.", "não se aplica", "Retrato da sessão observada.", "Atividade de sessões do PostgreSQL.", "O cliente pode omitir ou escolher esse nome; ele não autentica a aplicação."),
  topic("session-state", "connections", "Estado da sessão", "Indica se a sessão está ativa, ociosa ou em outro estado informado pelo PostgreSQL.", "não se aplica", "Retrato da consulta atual.", "Atividade de sessões do PostgreSQL.", "Estados mudam rapidamente; uma linha pode ficar desatualizada após a consulta."),
  topic("session-start", "connections", "Início da conexão", "Horário em que o processo da sessão iniciou a conexão.", "data e hora", "Instante de abertura da sessão; exibido no fuso local.", "Atividade de sessões do PostgreSQL.", "Não é o início da consulta atual."),
  topic("session-query", "connections", "Consulta ativa", "Indica a consulta em execução no momento observado.", "não se aplica", "Retrato da sessão atual.", "Atividade de sessões do PostgreSQL.", "O texto da consulta fica oculto por padrão e só aparece após revelação explícita."),
  topic("session-query-start", "connections", "Início da consulta", "Horário em que a consulta ativa começou.", "data e hora", "Instante de início da consulta, exibido no fuso local.", "Atividade de sessões do PostgreSQL.", "Difere da abertura da conexão; pode não existir se não houver consulta ativa."),
  topic("active-query-duration", "connections", "Duração da consulta ativa", "Tempo transcorrido desde o início da consulta em execução.", "ms, s ou duração formatada", "Duração em andamento no momento da consulta.", "Horários da atividade de sessões do PostgreSQL.", "Não é a latência final da consulta nem o tempo total da conexão."),
  topic("session-wait", "connections", "Evento de espera", "Recurso ou condição pela qual uma sessão está aguardando.", "não se aplica", "Retrato do momento consultado.", "Eventos de espera do PostgreSQL.", "Pode coexistir com atividade; ausência de evento visível não garante ausência de lentidão."),
  topic("session-sensitive-details", "connections", "Consulta e cliente", "Texto da consulta e endereço do cliente associados à sessão.", "não se aplica", "Retrato consultado após revelação explícita.", "Detalhes de sessão do PostgreSQL.", "Dados potencialmente sensíveis ficam ocultos por padrão e podem deixar de estar disponíveis quando a sessão muda."),

  topic("wal-per-collection", "performance", "Atividade WAL", "Volume de registros de escrita antecipada produzido entre coletas.", "bytes/coleta", "Diferença entre duas coletas contínuas.", "Estatísticas WAL do PostgreSQL e histórico local.", "A série tem lacunas após reset, interrupção ou falta de permissão."),
  topic("io-per-collection", "performance", "Operações de I/O", "Quantidade observada de operações de leitura de I/O entre coletas.", "operações/coleta", "Diferença entre duas coletas contínuas.", "Estatísticas de I/O do PostgreSQL e histórico local.", "Não representa todos os tipos de I/O; depende da disponibilidade da fonte."),
  topic("collection-duration", "performance", "Tempo da coleta", "Tempo gasto pelo DBMonitor para completar um ciclo de coleta.", "ms", "Valor de cada coleta no período selecionado.", "Coletor local e histórico local.", "Mede o coletor, não a latência das consultas de usuários."),
  topic("active-queries", "performance", "Queries ativas", "Sessões com consultas em execução no momento consultado.", "consultas", "Retrato atual, independente do período dos gráficos.", "Atividade de sessões do PostgreSQL.", "A duração ainda está em andamento; espera é mostrada separadamente."),
  topic("query-aggregate-latency", "performance", "Latência agregada por consulta", "Estatísticas de duração reunidas por grupo de consulta.", "ms e chamadas", "Acumulado desde o último reset das estatísticas; independente do período dos gráficos.", "pg_stat_statements.", "Pode ficar indisponível sem extensão ou permissão; o agrupamento não revela o texto SQL."),
  topic("query-group", "performance", "Grupo de consulta", "Identificador que reúne execuções de uma consulta normalizada.", "identificador", "Estatísticas acumuladas desde o último reset.", "pg_stat_statements.", "Não é texto SQL nem identifica necessariamente uma única execução."),
  topic("query-calls-total", "performance", "Chamadas", "Número de execuções registradas para um grupo de consulta.", "chamadas", "Acumulado desde o último reset das estatísticas.", "pg_stat_statements.", "Não é a quantidade de chamadas no período selecionado."),
  topic("query-mean-time-aggregate", "performance", "Média por grupo", "Tempo médio de execução das chamadas de um grupo de consulta.", "ms", "Acumulado desde o último reset das estatísticas.", "pg_stat_statements.", "Difere da média geral do cartão da Visão geral; não se limita ao período do gráfico.", "Tempo total do grupo ÷ número de chamadas.", ["query-mean-time", "query-total-time-aggregate"]),
  topic("query-total-time-aggregate", "performance", "Tempo total por grupo", "Soma do tempo de execução de todas as chamadas do grupo.", "ms", "Acumulado desde o último reset das estatísticas.", "pg_stat_statements.", "Não é a duração de uma consulta ativa."),

  topic("database-size", "databases", "Tamanho em disco", "Espaço em disco ocupado pelo banco, exibido em MB ou GB.", "MB ou GB", "Medido ao abrir a listagem do inventário.", "Catálogo de tamanho de banco do PostgreSQL.", "Pode ser indisponível sem permissão de conexão ou após tempo limite; não é histórico."),
  topic("database-inventory", "databases", "Bancos da instância", "Lista dos bancos existentes e de seus atributos administrativos.", "bancos", "Retrato consultado ao abrir ou atualizar a listagem.", "Catálogo do PostgreSQL.", "Filtros e ordenação abrangem os bancos disponíveis na instância; alguns atributos podem exigir permissão."),
  topic("database-owner", "databases", "Proprietário", "Papel PostgreSQL responsável pelo banco.", "não se aplica", "Atributo atual do banco.", "Catálogo do PostgreSQL."),
  topic("database-encoding", "databases", "Codificação", "Conjunto de caracteres usado pelo banco.", "não se aplica", "Atributo atual do banco.", "Catálogo do PostgreSQL."),
  topic("database-collation", "databases", "Collation", "Regra de ordenação e comparação de texto configurada para o banco.", "não se aplica", "Atributo atual do banco.", "Catálogo do PostgreSQL."),
  topic("database-connection-limit", "databases", "Limite de conexões", "Número máximo configurado de conexões simultâneas para o banco.", "conexões", "Configuração atual do banco.", "Catálogo do PostgreSQL.", "“Sem limite” indica ausência de limite específico do banco, não capacidade ilimitada da instância."),
  topic("database-status", "databases", "Estado do banco", "Indica se o banco aceita conexões e se é um modelo.", "não se aplica", "Configuração atual do banco.", "Catálogo do PostgreSQL.", "“Disponível” não comprova permissão de acesso para todo usuário."),
  topic("database-connections-series", "databases", "Conexões por coleta", "Quantidade de conexões observadas em cada coleta.", "conexões", "Retratos no período selecionado.", "Histórico local de atividade PostgreSQL.", "Não é soma de conexões abertas durante o período."),
  topic("transactions-per-collection", "databases", "Transações concluídas por coleta", "Número de commits mais rollbacks detectado entre coletas.", "transações/coleta", "Diferença entre coletas válidas, sem normalização por minuto.", "Contadores por banco e histórico local.", "Reset ou lacuna de coleta produz ponto indisponível; não confundir com tx/min.", "Aumento de commits + aumento de rollbacks.", ["transaction-rate", "transactions-in-period"]),
  topic("blocks-read-per-collection", "databases", "Blocos lidos por coleta", "Blocos solicitados ao armazenamento entre coletas.", "blocos/coleta", "Diferença entre coletas válidas.", "Estatísticas por banco e histórico local.", "Não é a taxa percentual de cache; reset ou lacuna interrompe a série."),
  topic("cache-hits-per-collection", "databases", "Acertos de cache por coleta", "Blocos atendidos pelo cache em memória entre coletas.", "blocos/coleta", "Diferença entre coletas válidas.", "Estatísticas por banco e histórico local.", "É uma contagem, não uma porcentagem.", undefined, ["cache-hit-percent", "cache-hits-in-period"]),
  topic("database-ranking", "databases", "Bancos mais acessados", "Ordenação dos bancos por transações observadas no período.", "transações no período", "Soma das variações válidas no período selecionado.", "Histórico local dos contadores por banco.", "É um critério baseado em commits + rollbacks, não em conexões ou tamanho."),
  topic("transactions-in-period", "databases", "Transações no período", "Soma das variações observadas de commits mais rollbacks para um banco.", "transações", "Período selecionado, usando pares de coletas válidas.", "Histórico local dos contadores por banco.", "Lacunas e resets não são estimados; não é o total desde o último reset.", "Soma dos aumentos válidos de commits + rollbacks.", ["transactions-per-collection", "commits-total"]),
  topic("blocks-read-in-period", "databases", "Blocos lidos no período", "Soma dos aumentos observados de blocos lidos.", "blocos", "Período selecionado, entre coletas válidas.", "Histórico local das estatísticas por banco.", "Lacunas e resets não são tratados como zero medido."),
  topic("cache-hits-in-period", "databases", "Cache no período", "Soma dos acertos de cache observados entre coletas.", "blocos", "Período selecionado, entre coletas válidas.", "Histórico local das estatísticas por banco.", "É uma contagem de blocos, não o percentual cache hit.", undefined, ["cache-hit-percent", "cache-hits-per-collection"]),

  topic("log-events", "logs", "Eventos registrados", "Registros individuais emitidos pelo PostgreSQL e preservados no histórico local.", "eventos", "Eventos do período e filtros selecionados.", "Fonte CSV de logs configurada e histórico local.", "A ausência de eventos na lista não comprova ausência de atividade no banco."),
  topic("log-event-time", "logs", "Horário do evento", "Momento em que o evento foi registrado.", "data e hora", "Instante do evento, exibido no fuso local.", "Eventos de log PostgreSQL ingeridos no histórico local.", "Não é o horário da coleta de métricas."),
  topic("log-severity", "logs", "Severidade", "Nível informado pelo PostgreSQL para o evento, como INFO, WARNING ou ERROR.", "não se aplica", "Atributo do evento registrado.", "Logs PostgreSQL.", "Severidade descreve o evento; não é uma estatística agregada da instância."),
  topic("log-database", "logs", "Banco do evento", "Banco associado ao evento de log, quando informado.", "não se aplica", "Atributo do evento registrado.", "Logs PostgreSQL.", "Pode estar ausente em eventos sem contexto de banco."),
  topic("log-user", "logs", "Usuário do evento", "Usuário associado ao evento de log, quando informado.", "não se aplica", "Atributo do evento registrado.", "Logs PostgreSQL.", "Pode estar ausente ou diferir de outros usuários citados na mensagem."),
  topic("log-pid", "logs", "PID do evento", "Processo PostgreSQL que gerou o evento, quando informado.", "identificador", "Atributo do evento registrado.", "Logs PostgreSQL.", "O PID pode ser reutilizado depois que o processo termina."),
  topic("log-message", "logs", "Mensagem do evento", "Texto descritivo do evento registrado pelo PostgreSQL.", "não se aplica", "Atributo de um único evento.", "Logs PostgreSQL ingeridos no histórico local.", "Pode conter detalhes operacionais; não representa uma medida agregada."),
] as const satisfies readonly ExplanationTopic[]

export type ExplanationTopicId = (typeof explanationTopics)[number]["id"]

const topicsById = new Map<string, ExplanationTopic>(explanationTopics.map((item) => [item.id, item]))

export function findExplanationTopic(id: string | null | undefined): ExplanationTopic | null {
  return id ? topicsById.get(id) ?? null : null
}

export function topicsForGroup(group: ExplanationGroupId): readonly ExplanationTopic[] {
  return explanationTopics.filter((item) => item.group === group)
}
