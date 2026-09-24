# Implementation Plan: Explicações dos indicadores

**Branch**: `main` (sem branch de feature; diretório `002-explicacoes-indicadores`) | **Date**: 2026-09-24 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-explicacoes-indicadores/spec.md`

## Summary

Adicionar uma seção “Explicações” à navegação do DBMonitor e botões circulares “i” junto aos rótulos dos dados nas cinco telas de observabilidade. Cada botão abre a definição correspondente, com título em foco e visível abaixo da barra fixa. O conteúdo é estático, em português, e explicita significado, unidade, janela temporal, cálculo, origem e limitações, incluindo diferenças entre taxa de transações, contadores acumulados e cache hit percentual. A solução reutiliza o shell e componentes atuais, sem alterar coleta, banco de dados ou IPC.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, Next.js 16 no renderer; Electron 44 como host.

**Primary Dependencies**: Componentes shadcn/ui e `lucide-react` existentes, Tailwind CSS 4. Nenhuma dependência nova.

**Storage**: Não aplicável à feature. O conteúdo é estático e o alvo de navegação fica apenas em memória; PostgreSQL e SQLite existentes não mudam.

**Testing**: `npm run verify` (tipos, testes Node e build estático), testes de integridade do catálogo/referências e verificação funcional no Electron com teclado e janela estreita.

**Target Platform**: Aplicativo desktop DBMonitor em Windows e Linux, incluindo navegação compacta em janelas estreitas.

**Project Type**: Interface de aplicativo desktop Electron com Next.js exportado estaticamente.

**Performance Goals**: Explicações aparecem no primeiro render após a seleção, sem nova coleta ou espera por origem; navegação contextual não adiciona processamento aos ciclos de coleta.

**Constraints**: Header superior fixo com altura variável; sem servidor, IPC, migração ou dependência adicional; a página funciona sem PostgreSQL; botões de informação não interferem em ordenação, filtros ou ações administrativas.

**Scale/Scope**: Uma nova seção informativa; catálogo de cerca de 40 conceitos reutilizados por referências nas cinco telas Visão geral, Conexões, Desempenho, Bancos e Logs. Configurações não recebe glossário nesta feature.

## Constitution Check

*GATE: avaliado antes da pesquisa e reavaliado após o desenho.*

`.specify/memory/constitution.md` contém apenas placeholders do template, sem princípios ratificados. Os padrões ativos em `.agents/standards.md` exigem exportação estática, reaproveitamento de componentes, isolamento de credenciais e clareza sobre origem, unidade, período e disponibilidade. O desenho passa: não introduz backend/IPC, não persiste dados e não trata indisponibilidade como zero.

## Project Structure

### Documentation (this feature)

```text
specs/002-explicacoes-indicadores/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── contracts/explanations-ui.md
└── tasks.md                    # gerado depois por $speckit-tasks
```

### Source Code (repository root)

```text
app/page.tsx                         # seção ativa, destino contextual, acesso offline
app/hooks/use-dashboard.ts           # pausa consultas da Visão geral em Explicações
app/components/dashboard-shell.tsx   # entradas lateral/compacta e altura do header
app/components/explanations-view.tsx # conteúdo agrupado, foco e destaque do destino
app/components/explanation-info.tsx  # botão circular acessível e rótulo reutilizável
app/components/metric-card.tsx
app/components/overview-charts.tsx
app/components/connections-view.tsx
app/components/sessions-chart.tsx
app/components/sessions-table.tsx
app/components/performance-view.tsx
app/components/databases-view.tsx
app/components/logs-view.tsx
lib/explanations.ts                  # catálogo tipado, grupos e IDs estáveis
tests/explanations.test.cjs         # integridade de catálogo e semântica crítica
```

**Structure Decision**: A feature fica no renderer. `lib/explanations.ts` concentra IDs e conteúdo, `explanations-view.tsx` os apresenta e `explanation-info.tsx` reutiliza o botão em cartões, gráficos e tabelas. `app/page.tsx` coordena navegação e não leva conhecimento de origem do banco para o glossário. Nenhum arquivo em `electron/` precisa mudar.

## Design Decisions

1. **Catálogo estático e tipado**: Definir IDs estáveis e metadados conforme [data-model.md](data-model.md). Os locais de apresentação referenciam IDs, nunca procuram pelo texto do rótulo. A cobertura de rótulos e destinos segue [contracts/explanations-ui.md](contracts/explanations-ui.md). Conteúdo específico deve espelhar os cálculos atuais, incluindo `tx/min`, diferenças por coleta, resets e cache hit.
2. **Componente de informação**: Criar um botão circular reutilizável com “i” visível, `aria-label` com o nome do dado e foco perceptível. Usar o componente de botão já instalado. Em cabeçalhos ordenáveis, dispor botão de ordenar e botão de informação como irmãos, sem controles aninhados. Não repetir ícones por linha de tabela.
3. **Seção compartilhada**: Incluir `explanations` no tipo e na lista única de seções do shell. Assim, menu lateral e compacto recebem a mesma entrada, ordem e indicação de seção atual.
4. **Navegação contextual única**: Expor a partir de `app/page.tsx` uma ação `openExplanation(topicId)` e passar callback aos componentes que mostram dados. Substituir o efeito atual que sempre rola ao topo por fluxo único: menu abre início de Explicações; botão “i” aguarda renderização, foca título e rola ao ID solicitado; mudança para outra seção limpa o alvo. IDs desconhecidos abrem início da página sem quebrar a navegação.
5. **Barra fixa de altura variável**: O shell informa a altura medida do bloco fixo de cabeçalho e navegação compacta. O posicionamento do destino usa essa medida mais uma margem visual, em vez de deslocamento fixo; o foco não provoca nova rolagem. O alvo recebe realce identificável também para usuários de teclado.
6. **Acesso sem origem ativa**: Renderizar `explanations-view.tsx` antes das condições de carregamento de perfis/origem em `app/page.tsx`. Tornar o polling de `useDashboard` inativo enquanto a seção de explicações está ativa, sem exigir PostgreSQL para carregar texto. O botão global de atualizar coleta não deve acionar coleta enquanto essa seção estiver ativa.
7. **Cobertura progressiva por tela, com revisão final completa**: Adaptar cartões, gráficos, cabeçalhos e detalhes das cinco telas usando o mapa contratual. Tratar expressamente os rótulos iguais com temporalidade diferente. Manter a tabela utilizável na janela mínima e preservar todos os controles já existentes.

## Verification Strategy

1. Validar unicidade dos IDs, integridade de todas as referências e campos obrigatórios das definições. Conferir regras de cálculo e unidades para taxa, transações por coleta, totais desde reset e porcentagem/contagem de cache.
2. Rodar `npm run verify` após implementação. O build estático precisa incluir Explicações sem alterações em `electron/`.
3. Seguir [quickstart.md](quickstart.md) para abrir ícones em cada tela e conferir foco, rolagem abaixo do header em larguras diferentes, teclado e navegação compacta.
4. Conferir que um valor indisponível ainda tem explicação e que a tela aparece sem origem ativa. Verificar que abrir Explicações não inicia coleta, muda perfil ou mexe em filtros/período.
5. Revisar visualmente cabeçalhos ordenáveis: “i” e ordenação independentes, sem sobreposição ou aumento que inviabilize rolagem horizontal.

## Complexity Tracking

Nenhuma violação da constituição ou dos padrões ativos exige justificativa.

## Post-Design Constitution Check

Após pesquisa e desenho, a solução continua dentro da exportação estática e do renderer, reutiliza pacotes instalados e mantém isolamento de dados/credenciais. Não há violações ou esclarecimentos pendentes.
