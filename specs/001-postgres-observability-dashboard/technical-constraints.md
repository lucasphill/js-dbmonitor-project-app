# Restrições técnicas fornecidas para o planejamento

Este documento preserva decisões técnicas explícitas do solicitante. Os requisitos e critérios de sucesso em [spec.md](spec.md) descrevem o comportamento observável; o plano de implementação deve respeitar as restrições abaixo.

- Evoluir o boilerplate existente em Electron + Next.js, mantendo o acesso ao PostgreSQL no processo principal do Electron e uma ponte IPC restrita. A interface exportada pelo Next.js não terá acesso direto às credenciais.
- Usar **SQLite** para amostras históricas, eventos de log, estado de ingestão e preferências locais. As credenciais do PostgreSQL não entram nesse banco. Avaliar primeiro o suporte a SQLite nativo do runtime do Electron; se não for adequado, usar uma única biblioteca SQLite e documentar o custo de distribuição.
- Usar **shadcn/ui** para componentes visuais, tabelas e gráficos. Seu componente Chart usa **Recharts**; aproveitar a dependência Recharts já presente no projeto, evitando outra biblioteca de gráficos. Manter um único sistema de tokens, cores e formatação de unidades.
- Manter a coleta e a ingestão fora da thread de renderização, com consultas de leitura limitadas, intervalos configuráveis e prevenção de ciclos sobrepostos.
- Para conexões atuais, estudar `pg_stat_activity`; para atividade por banco, `pg_stat_database`; para latência de consultas, tratar `pg_stat_statements` como capacidade opcional. Não inferir latência a partir de contadores de transações.
- Logs do servidor exigem configuração de emissão e acesso à fonte. Preferir formato estruturado configurado no PostgreSQL, preservar posição de leitura/identidade do arquivo e lidar com rotação. Não alegar que as visualizações de estatísticas fornecem o histórico completo de logs.
- Definir no plano migrações do SQLite, índices para recortes por período, agregação e retenção, além de verificação de compatibilidade com o empacotamento Electron.

## Referências técnicas

- [PostgreSQL: estatísticas de monitoramento](https://www.postgresql.org/docs/current/monitoring-stats.html)
- [PostgreSQL: pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)
- [PostgreSQL: configuração de logs](https://www.postgresql.org/docs/current/runtime-config-logging.html)
- [shadcn/ui: Chart](https://ui.shadcn.com/docs/components/chart)
