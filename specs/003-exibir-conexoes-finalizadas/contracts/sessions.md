# Contrato: tabela de conexões

## `dashboard:sessions` / `window.bdash.getSessions(filters)`

Entrada: `SessionFilters` existente, com `state = "finished"` permitido e `sortBy = "finishedAt"` permitido. `page.limit` permanece entre 1 e 200; cursor é offset da visão filtrada. Nenhum filtro ou paginação da entrada reduz o snapshot usado para detectar encerramentos.

Saída: `SessionsResult` existente. Cada `SessionRow` ganha `finishedAt: ISO timestamp | null`; `state = "finished"` para linha finalizada. `sessions.data.rows` pode conter abertas e finalizadas, `total` corresponde ao filtro e `nextCursor` à próxima página. `sessions.updatedAt` é o horário da coleta válida. `sourceContext` identifica perfil e geração usados. Erro de coleta não reconcilia ausência e preserva histórico anterior.

## UI e exportação

Tabela: estado “Finalizado”; coluna “Finalizada em” mostra `formatTimestamp(finishedAt)` ou “—”; explicação acessível esclarece que é a primeira ausência observada. Filtro Estado inclui “Finalizado”; ordenação da coluna e paginação operam no conjunto combinado. Painel finalizado mostra dados como última observação, sem botões de revelar SQL/cliente ou encerrar conexão. O handler também rejeita essas operações em linha finalizada.

Cartões e gráfico de sessões atuais usam apenas linhas abertas e linguagem explícita. CSV `sessions` inclui Estado e Finalizada em para o mesmo perfil e filtros, sem truncar à página visível; campos sensíveis continuam ausentes.
