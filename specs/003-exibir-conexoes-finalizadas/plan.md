# Implementation Plan: Exibir conexões finalizadas

**Branch**: `003-exibir-conexoes-finalizadas` (identificador Spec Kit; branch Git não criada) | **Date**: 2026-09-25 | **Spec**: `specs/003-exibir-conexoes-finalizadas/spec.md`

## Summary

Manter no processo Electron um histórico de observação por perfil. Uma coleta completa e bem-sucedida de `pg_stat_activity` reconcilia sessões pela chave `(profileId, pid, backendStart)`; a primeira ausência registra `finishedAt` uma única vez. A resposta da tabela aplica filtros, ordenação e paginação ao conjunto atual e finalizado. A interface mostra “Finalizado” e o horário estimado, preserva a distinção entre dados atuais e últimos dados observados e desabilita ações de sessão ativa.

## Technical Context

**Language/Version**: JavaScript CommonJS (Electron/Node), TypeScript 5.9 (Next.js/React 19)
**Primary Dependencies**: Electron 44, pg 8, Next.js 16, React 19
**Storage**: Memória do processo Electron por perfil; PostgreSQL `pg_stat_activity` como fonte de sessões abertas; sem migração SQLite
**Testing**: `node --test --test-isolation=none`, `tsc --noEmit`, `next build`
**Target Platform**: Aplicativo desktop Windows/Linux
**Project Type**: Electron com renderer Next.js
**Performance Goals**: Uma consulta completa por atualização; paginação de até 200 linhas na resposta; não inferir encerramentos de conjuntos parciais
**Constraints**: O limite atual de 200 é apenas para página, não para coleta. Falha, troca de perfil, atualização concorrente ou snapshot incompleto não podem registrar finalização. SQL sensível e endereço do cliente permanecem ausentes do histórico padrão.
**Scale/Scope**: Tabela de Conexões e interfaces de exportação/resumo associadas, durante a observação da aplicação

## Constitution Check

O arquivo `.specify/memory/constitution.md` contém somente marcadores de template, sem princípios ratificados ou gates executáveis. Nenhuma violação verificável. Reavaliado após o desenho: mesmo resultado.

## Project Structure

### Documentation (this feature)

```text
specs/003-exibir-conexoes-finalizadas/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/sessions.md
```

### Source Code (repository root)

```text
electron/db.cjs                 # coleta PostgreSQL
electron/main.cjs               # IPC e contexto do perfil
electron/export.cjs             # CSV de conexões
app/hooks/use-sessions.ts       # atualização da tabela
app/components/connections-view.tsx
app/components/sessions-table.tsx
app/components/sessions-chart.tsx
lib/dashboard-types.ts          # contrato TypeScript
lib/explanations.ts             # explicação do horário estimado
tests/                          # testes unitários e integração
```

**Structure Decision**: Reutilizar a separação atual entre coleta no processo principal, contrato IPC e renderer. Encapsular a reconciliação no lado Electron para evitar que filtros, paginação ou desmontagem da tela afetem a detecção.

## Design

1. Ler todas as sessões `client backend` de uma única consulta a `pg_stat_activity`, sem `LIMIT`, `OFFSET` ou filtros de interface. Registrar o horário da observação concluída. Uma resposta integral é condição para reconciliar; exceção ou descarte de resultado por mudança de geração não altera o histórico. Não usar a resposta paginada existente como prova de ausência.
2. Manter mapa por perfil e identidade exata. Para cada sessão presente, criar/atualizar os últimos dados observados. Para cada sessão antes aberta e ausente da coleta válida do mesmo perfil, definir `finishedAt` uma vez; manter finalizadas anteriores intactas. Serializar ou rejeitar reconciliações fora de ordem para não retroceder estado.
3. Projetar a visão atual+finalizada e então aplicar busca, filtros, ordenação estável e paginação. `state=finished` filtra as finalizadas. `finishedAt` é campo de ordenação. O total da tabela é o total filtrado; os indicadores de sessões atuais continuam calculados somente das abertas e recebem rótulos explícitos.
4. Exibir coluna “Finalizada em” com data/hora local e explicação “primeira ausência observada”; linhas abertas mostram “—”. Em linhas finalizadas, consultas/duração/espera correntes devem ser exibidas como indisponíveis ou identificadas como últimos dados observados. O painel de detalhes mostra estado e data de finalização; não oferece revelação nem término para finalizadas.
5. Atualizar CSV de conexões para refletir a mesma seleção filtrada, incluir estado e `finishedAt`, e não misturar sessões de outros perfis. Preservar checagem de contexto do perfil/generation em operações administrativas.

## Complexity Tracking

Não aplicável: a constituição não define gates ratificados.
