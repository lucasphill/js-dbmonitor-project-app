# Quickstart: validar conexões finalizadas

## Pré-requisitos

- `npm install` concluído; PostgreSQL acessível no perfil de teste.
- Para integração com PostgreSQL descartável, configurar `BDASH_TEST_PG` conforme `tests/connections.integration.test.cjs`.

## Verificação automatizada

Executar `npm run typecheck`, `npm test` e `npm run build`. Os testes devem cobrir snapshot completo, ausência após coleta válida, falha sem finalização, imutabilidade de `finishedAt`, PID reutilizado, troca de perfil/generation, filtros, ordenação, paginação e exportação.

## Verificação manual

1. Iniciar `npm run dev`, abrir Conexões e estabelecer uma sessão cliente. Confirmar linha aberta sem data de finalização.
2. Encerrar a sessão e atualizar. Confirmar “Finalizado”, data/hora e explicação de primeira ausência observada. Atualizar novamente: a hora não muda.
3. Filtrar por “Finalizado”, ordenar por “Finalizada em”, navegar páginas e exportar CSV. Conferir estado/data coerentes com a tabela.
4. Abrir detalhes finalizados e confirmar que revelação e encerramento estão indisponíveis.
5. Simular falha de coleta, trocar de perfil e reutilizar PID com novo `backendStart`; conferir que não há finalização indevida nem mistura de perfis.

Detalhes: `contracts/sessions.md` e `data-model.md`.
