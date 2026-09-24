# Pesquisa e decisões: Explicações dos indicadores

## Navegação entre telas e destino contextual

**Decision**: Usar o estado de seção existente em `app/page.tsx` e acrescentar `explanations` à lista única de `app/components/dashboard-shell.tsx`. O clique no botão de informação envia um identificador estável de conceito à página principal. Um único efeito, após a renderização da tela, rola até o destino e foca seu título; a navegação pelo menu limpa o destino e volta ao topo.

**Rationale**: O aplicativo já apresenta todas as seções dentro da mesma página exportada estaticamente. Hoje há um efeito que volta ao topo em toda troca de seção (`app/page.tsx`); mantê-lo separado anularia a rolagem contextual. O foco programático permite que leitor de tela e teclado acompanhem a mudança de contexto.

**Alternatives considered**: Criar rota Next.js separada exigiria outro fluxo de shell e de estado. Usar somente `location.hash` dependeria de sincronização adicional com o estado de seção. Buscar título por texto seria frágil após alterações de tradução.

## Barra superior fixa e navegação acessível

**Decision**: Medir a altura real do conjunto fixo de cabeçalho e navegação compacta e aplicar deslocamento ao rolar para a explicação; dar foco ao título sem provocar segunda rolagem. Cada destino tem ID estável, título focável programaticamente e destaque visual temporário/persistente enquanto for o alvo selecionado. Os botões “i” usam o `Button` existente com formato circular e nome acessível “Entender [conceito]”.

**Rationale**: O cabeçalho em `app/components/dashboard-shell.tsx` pode quebrar em várias linhas e a navegação compacta acrescenta altura. Um deslocamento fixo não cobre as larguras suportadas. Botões distintos preservam o clique de ordenação nas colunas de tabela.

**Alternatives considered**: Aplicar `scroll-mt-20` em todas as seções é mais simples, mas insuficiente quando o cabeçalho cresce. Envolver um botão de informação dentro do botão de ordenação criaria controles interativos aninhados e comportamento ambíguo.

## Fonte única para definições e atalhos

**Decision**: Manter catálogo estático tipado no renderer, com IDs, grupo, título, unidade, natureza temporal, fonte, definição e ressalvas. Referências das telas usam IDs desse catálogo, não rótulos de exibição. Permitir compartilhar um conceito quando a semântica é idêntica; criar entradas distintas para taxa, quantidade por coleta, total acumulado, percentual e contagem de cache.

**Rationale**: O conteúdo não depende de perfil nem de coleta e não requer SQLite, PostgreSQL, IPC ou dependência adicional. Um catálogo central evita destinos duplicados ou quebrados e suporta auditoria automática de cobertura.

**Alternatives considered**: Definições locais em cada componente gerariam repetição. Persistir textos no SQLite adicionaria migração e estado mutável sem requisito de edição de conteúdo.

## Semântica existente das métricas

**Decision**: Redigir as definições a partir dos cálculos já usados no código, distinguindo contexto temporal e disponibilidade.

**Rationale**: `electron/overview.cjs` calcula `tx/min` pela diferença de commits + rollbacks entre coletas contínuas, dividida por minutos. `app/page.tsx` calcula cache hit como `cacheHits / (cacheHits + blocksRead)`, indisponível quando o denominador é zero. `electron/analytics.cjs` calcula transações e blocos por coleta por diferenças e protege contra resets. `electron/performance.cjs` calcula WAL e I/O por diferenças entre coletas, e duração de coleta por valor de cada ciclo. As tabelas de bancos apresentam também contadores totais desde o último reset.

**Alternatives considered**: Definições genéricas de PostgreSQL não descrevem necessariamente os períodos, filtros e cálculos específicos exibidos pelo DBMonitor.

## Acesso sem conexão e validação

**Decision**: Renderizar Explicações antes das telas condicionadas a carregamento de perfis ou origem ativa; suspender consulta periódica da Visão geral enquanto Explicações estiver ativa. Validar catálogo, referências, foco/rolagem, navegação compacta e ausência de dependência de conexão. Executar `npm run verify` na implementação, além de inspeção visual no Electron.

**Rationale**: `app/page.tsx` hoje bloqueia o conteúdo inteiro em `profileLoading`/sem origem, e `app/hooks/use-dashboard.ts` consulta a Visão geral a cada 15 segundos. A tela informativa precisa funcionar offline sem iniciar coleta para exibir texto.

**Alternatives considered**: Reutilizar a tela atual sem modificar o bloqueio violaria FR-015. Um processo de servidor ou novo canal IPC não acrescentaria valor.

## Princípios e dependências

**Decision**: Sem novas dependências ou armazenamento. Reutilizar React, Next.js exportado estaticamente, Tailwind e `components/ui/button.tsx`. O arquivo `.specify/memory/constitution.md` ainda é o template não ratificado; aplicar os padrões ativos em `.agents/standards.md`.

**Rationale**: O recurso é exclusivamente explicativo e local. Mantém a arquitetura Electron/renderer, evita dados sensíveis e conserva o desempenho do dashboard.

**Alternatives considered**: Serviço remoto de documentação ou pacote de roteamento adicional introduziria disponibilidade externa e complexidade sem necessidade.
