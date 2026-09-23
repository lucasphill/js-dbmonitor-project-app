# Implementation Plan: Dashboard de observabilidade PostgreSQL

**Branch**: `001-postgres-observability-dashboard` (identificador da feature; checkout atual `master`) | **Date**: 2026-09-23 | **Spec**: [spec.md](spec.md)

**Input**: [spec.md](spec.md) e [technical-constraints.md](technical-constraints.md).

## Summary

Evoluir o boilerplate Electron + Next.js para um dashboard administrativo de PostgreSQL com visão geral, conexões e queries ativas, desempenho, bancos, logs e diagnóstico. O processo principal consulta estatísticas em intervalos de 15 segundos, persiste amostras em SQLite nativo e expõe IPC tipado e restrito à interface estática. A tabela de conexões oferece encerramento de backend cliente mediante confirmação, revalidação de identidade, autorização do PostgreSQL e auditoria local. Shadcn/ui e seu Chart baseado em Recharts fornecem os componentes e gráficos. Recursos dependentes da configuração do servidor ficam explicitamente indisponíveis até serem habilitados.

## Technical Context

**Language/Version**: JavaScript CommonJS no processo Electron, TypeScript 5.9 e React 19 no Next.js 16.3.5; Electron 44 com Node 24.21.0.

**Primary Dependencies**: Electron, Next.js App Router com export estático, `pg`, `node:sqlite`, shadcn/ui, Recharts existente. Evitar outro cliente de banco, ORM ou biblioteca de gráficos.

**Storage**: PostgreSQL 18.4 monitorado, somente leitura na coleta mais `pg_terminate_backend` para ação explícita; SQLite local no diretório `userData` para amostras, eventos, cursor de logs, preferências e auditoria. Senha apenas no `.env`, nunca no SQLite.

**Testing**: `npm run typecheck`, `npm run build`; testes de unidades para cálculo de delta/reset, IPC e transições de estado; integração com PostgreSQL local e SQLite temporário; validação visual e funcional no Electron em desenvolvimento e empacotado.

**Target Platform**: Desktop Windows inicial, janela Electron com navegação bloqueada fora da origem permitida e renderer isolado.

**Project Type**: Aplicação desktop local.

**Performance Goals**: Estado inicial em até 5 s em 95% das aberturas; filtros/ordenação/paginação em até 2 s com 1.000 sessões e 100.000 logs; ciclos de coleta sem sobreposição.

**Constraints**: Coleta padrão 15 s; retenção padrão de 30 dias para amostras e 7 dias para logs; uma instância monitorada; dados de consulta e cliente ocultos por padrão; ausência de métrica não representada como zero; queries de monitoramento com limite de tempo e volume.

**Scale/Scope**: Seis seções, quatro períodos predefinidos/customizado, uma instância, histórico local, milhares de sessões observáveis e centenas de milhares de eventos com paginação.

## Constitution Check

**Antes da pesquisa**: `.specify/memory/constitution.md` contém apenas placeholders do template, sem princípios ratificados nem gates executáveis. Nenhuma violação identificável. Restrições explícitas de [technical-constraints.md](technical-constraints.md) são gates do plano: Electron principal para acesso a PostgreSQL/SQLite, Next export estático, IPC restrito, shadcn/ui + Recharts, leitura com exceção operacional confirmada, coleta sem sobreposição.

**Após o design**: Contratos mantêm credenciais fora do renderer e do SQLite; encerramento é a única operação administrativa e exige confirmação e revalidação. Nenhum gate conhecido violado. A constituição deve ser ratificada em fluxo próprio caso o projeto passe a exigir princípios formais.

## Project Structure

### Documentation (this feature)

```text
specs/001-postgres-observability-dashboard/
├── spec.md
├── technical-constraints.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── desktop-ipc.md
```

### Source Code (repository root)

```text
app/                  # Rotas exportáveis, dashboard e componentes shadcn/ui
components/ui/        # Componentes shadcn gerados no projeto
lib/                  # Tipos, formatação, cálculo puro de séries e unidades
electron/
├── main.cjs          # Janelas, origem permitida, handlers IPC
├── preload.cjs       # API mínima exposta ao renderer
├── db.cjs            # Pool PostgreSQL e consultas de observabilidade
├── collector.cjs     # Agendamento, bloqueio de sobreposição e capacidades
├── storage.cjs       # SQLite nativo, migrações, índices e retenção
└── logs.cjs          # Ingestão opcional de CSV estruturado e rotação
types/                # Contrato TypeScript da ponte IPC
tests/                # Cálculos, integração DB/SQLite, IPC e fluxos críticos
```

**Structure Decision**: Manter o projeto único existente, separando coleta, persistência, ingestão e ação administrativa no processo principal. Arquivos novos representam responsabilidades planejadas, não código existente. A interface Next permanece estática e usa somente a ponte preload.

## Delivery Sequence

1. Definir contratos IPC e modelos estáveis; detectar capacidades e estado da instância.
2. Implementar SQLite nativo com migrações, índices por instância/tempo e retenção; coletor serial e deltas de contadores.
3. Construir visão geral, conexões e bancos com tabelas, gráficos temporais e estados de fonte.
4. Acrescentar queries ativas, duração em andamento, espera e ações de encerramento auditadas.
5. Acrescentar latência agregada opcional via `pg_stat_statements`, logs estruturados opcionais, diagnósticos, exportação e configuração.
6. Validar cenários do quickstart, inclusive empacotamento Windows e a ação administrativa com sessões de teste.

## Complexity Tracking

Nenhuma violação de constituição ratificada. A separação em módulos no processo principal reduz acoplamento entre coleta, escrita local e ação administrativa sem introduzir serviço externo.
