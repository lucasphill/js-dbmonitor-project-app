# Contrato de interface: Explicações

## Navegação

- A navegação principal contém “Explicações” no menu lateral e no menu compacto, com estado selecionado.
- Um botão de informação junto ao rótulo chama `openExplanation(topicId)` com ID do catálogo. A tela muda para Explicações e posiciona o título do conceito abaixo de todo o cabeçalho fixo, com foco e destaque visível.
- Selecionar “Explicações” pelo menu chama `openSection("explanations")` sem alvo e mostra o início da página.
- Um ID desconhecido abre o início da página, sem erro de runtime.
- Os botões são circulares, exibem “i”, recebem nome acessível “Entender [rótulo]” e não ficam dentro de outro botão ou link.
- Abrir Explicações não requer origem ativa, não altera perfil/período/filtros e não solicita dados ao banco.

## Cobertura de referências

Os identificadores abaixo são estáveis. A mesma definição pode ser compartilhada apenas quando o significado não muda. Os nomes na segunda coluna correspondem aos rótulos atuais; se um rótulo mudar, sua referência e o título explicativo são revisados juntos.

| Tela/contexto | Rótulos e destinos esperados |
| --- | --- |
| Visão geral, cartões | Conexões abertas → `open-connections`; Transações/min → `transaction-rate`; Tempo médio de consulta → `query-mean-time`; Bancos ativos → `active-databases`. |
| Visão geral, gráficos | Conexões abertas → `open-connections-series`; Taxa de transações → `transaction-rate-series`. |
| Visão geral, Resumo de bancos | Banco → `database-identity`; Conexões → `database-connections`; Commits → `commits-total`; Rollbacks → `rollbacks-total`; Cache hit → `cache-hit-percent`. |
| Conexões, cartões | Total → `session-total`; Ativas → `session-active`; Ociosas → `session-idle`; Em espera nesta página → `session-waiting-page`. |
| Conexões, gráfico/tabela/detalhes | Distribuição de conexões → `session-distribution`; Por estado → `sessions-by-state`; Por usuário → `sessions-by-user-page`; Sessões abertas → `session-total`; PID → `session-pid`; Banco → `session-database`; Usuário → `session-user`; Aplicação → `session-application`; Estado → `session-state`; Conectada em/Início da conexão → `session-start`; Início da consulta → `session-query-start`; Consulta ativa → `session-query`; Duração/Duração ativa → `active-query-duration`; Espera → `session-wait`; Consulta e cliente → `session-sensitive-details`. |
| Desempenho, gráficos | Atividade WAL → `wal-per-collection`; Operações de I/O → `io-per-collection`; Tempo da coleta → `collection-duration`. |
| Desempenho, tabelas | Queries ativas → `active-queries`; PID/Banco/Usuário → reutilizar definições de sessão; Duração → `active-query-duration`; Espera → `session-wait`; Latência agregada por consulta → `query-aggregate-latency`; Grupo de consulta → `query-group`; Chamadas → `query-calls-total`; Média → `query-mean-time-aggregate`; Total → `query-total-time-aggregate`. |
| Bancos, inventário | Bancos da instância → `database-inventory`; Banco → `database-identity`; Tamanho em disco → `database-size`; Proprietário → `database-owner`; Codificação → `database-encoding`; Collation → `database-collation`; Conexões → `database-connections`; Limite → `database-connection-limit`; Estado → `database-status`. |
| Bancos, gráficos | Conexões por coleta → `database-connections-series`; Transações concluídas → `transactions-per-collection`; Blocos lidos → `blocks-read-per-collection`; Acertos de cache → `cache-hits-per-collection`. |
| Bancos, ranking | Bancos mais acessados → `database-ranking`; Transações no período → `transactions-in-period`; Conexões atuais → `database-connections`; Commits totais → `commits-total`; Rollbacks totais → `rollbacks-total`; Blocos lidos no período → `blocks-read-in-period`; Cache no período → `cache-hits-in-period`. |
| Logs, tabela | Eventos registrados → `log-events`; Horário → `log-event-time`; Severidade → `log-severity`; Banco → `log-database`; Usuário → `log-user`; PID → `log-pid`; Mensagem → `log-message`. |

**Nota de agrupamento**: As definições de sessão reutilizadas em Desempenho podem ficar no grupo Conexões, desde que os ícones de Desempenho levem diretamente a elas. Nomes diferentes que compartilham ID devem mencionar ambos os contextos no texto.

## Conteúdo obrigatório para conceitos frequentemente confundidos

| ID | Conteúdo mínimo |
| --- | --- |
| `transaction-rate` e `transaction-rate-series` | Diferença de commits + rollbacks entre coletas válidas, dividida pelo intervalo em minutos (`tx/min`); exige amostras comparáveis. O cartão usa a última taxa válida, enquanto o gráfico mostra a evolução. |
| `transactions-per-collection` | Quantidade de commits + rollbacks observada entre duas coletas (`transações/coleta`), sem normalização por minuto. |
| `transactions-in-period` | Soma das variações observadas no período selecionado, com lacunas quando não há coletas comparáveis. |
| `commits-total` | Transações confirmadas, contador acumulado desde o último reset estatístico. |
| `rollbacks-total` | Transações revertidas, contador acumulado desde o último reset; rollback não implica necessariamente falha. |
| `cache-hit-percent` | `acertos / (acertos + blocos lidos) × 100`; percentual indisponível quando o denominador é zero. |
| `cache-hits-per-collection` e `cache-hits-in-period` | Número de blocos atendidos em memória entre coletas ou somado no período; não é percentual. |
| `query-mean-time` e `query-aggregate-latency` | Distinguir indicador geral e agregados por grupo de consulta; informar dependência de estatísticas de consultas, tempo em ms e reset da fonte quando pertinente. |
| `session-waiting-page` | Contagem da página atual de sessões, não da instância inteira. |

## Estados e segurança

- Os atalhos continuam presentes quando o valor é indisponível, insuficiente, parcial ou obsoleto.
- Definições não transformam ausência de valor em zero e explicam restrições de fonte e permissão.
- A página nunca mostra texto de consulta, endereço de cliente, senha ou dados coletados; os itens sobre esses campos descrevem apenas o significado e o controle de revelação existente.
- Ordenação de colunas e botão “i” são controles irmãos, de operação independente.
