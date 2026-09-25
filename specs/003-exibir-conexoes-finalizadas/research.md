# Research: conexões finalizadas

## Fonte de ausência

**Decision**: Coletar o conjunto completo de `pg_stat_activity` para o perfil ativo e só reconciliar após sucesso integral.

**Rationale**: `electron/db.cjs:listSessions` hoje aplica busca, filtros e `LIMIT/OFFSET` (máximo 200). A ausência de uma sessão nessa página não indica encerramento. A consulta separada de contagem e página também pode observar instantes diferentes.

**Alternatives considered**: Buscar páginas sucessivas (sujeito a mudanças entre páginas); inferir pelo resultado filtrado (incorreto); uma consulta única sem paginação (escolhido).

## Identidade e relógio

**Decision**: Chave `(profileId, pid, backendStart)` com início em UTC de precisão de microssegundos, como já produzido em `db.cjs`; `finishedAt` é o horário da primeira coleta válida em que a chave está ausente.

**Rationale**: PID pode ser reutilizado. O instante real de término não é fornecido. Checagem de perfil/generation evita que resposta atrasada de outro perfil altere o histórico ativo.

**Alternatives considered**: PID isolado (colisão); `Date.now()` na renderização (muda a cada atualização); comparar perfis (incorreto).

## Retenção e apresentação

**Decision**: Histórico em memória por perfil durante a vida do processo; filtros e paginação após reconciliação. Dados padrão armazenados excluem SQL e endereço de cliente.

**Rationale**: A especificação limita a observação ao período da aplicação. O contrato atual revela dados sensíveis apenas mediante ação explícita. Cartões e gráfico existentes descrevem sessões atuais e devem manter essa semântica com rótulos claros.

**Alternatives considered**: Persistência SQLite (escopo e migração desnecessários); histórico só no renderer (perdido ao remontar); incluir finalizadas em contadores de sessões abertas (enganoso).
