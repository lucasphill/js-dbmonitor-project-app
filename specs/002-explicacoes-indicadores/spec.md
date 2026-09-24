# Feature Specification: Explicações dos indicadores

**Feature Branch**: `Não criada; especificação local`
**Created**: 2026-09-24
**Status**: Draft
**Input**: User description: "Adicionar uma tela de explicações no menu lateral esquerdo, dedicada aos dados mostrados nas demais telas, e botões circulares com 'i' ao lado das informações para abrir diretamente a explicação correspondente."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Entender um indicador no contexto (Priority: P1)

Ao consultar um número, gráfico ou coluna do DBMonitor, a pessoa seleciona o ícone de informação ao lado do nome e chega à explicação exata do dado, sem procurar manualmente no glossário.

**Why this priority**: Resolve a dúvida no momento em que o dado é visto e evita interpretar taxas, totais e estados como se fossem equivalentes.

**Independent Test**: A partir de “Transações/min”, “Commits”, “Rollbacks” e “Cache hit”, abrir cada ícone e confirmar que a página mostra e destaca a explicação correta.

**Acceptance Scenarios**:

1. **Given** a pessoa está na Visão geral e vê “Transações/min”, **When** seleciona o botão circular com “i”, **Then** a seção “Taxa de transações” fica visível e identificável na tela de Explicações.
2. **Given** a pessoa está na tabela “Resumo de bancos”, **When** seleciona o “i” de “Commits”, “Rollbacks” ou “Cache hit”, **Then** cada ação abre a respectiva explicação, sem levar a uma seção genérica.
3. **Given** um indicador está indisponível por falta de dados ou permissão, **When** a pessoa seleciona seu “i”, **Then** a explicação continua acessível e esclarece como interpretar a indisponibilidade.

---

### User Story 2 - Consultar as explicações pelo menu (Priority: P2)

A pessoa abre “Explicações” pelo menu lateral esquerdo e percorre definições organizadas pelas telas e assuntos existentes no dashboard.

**Why this priority**: Permite aprender os conceitos sem depender de um indicador visível no momento.

**Independent Test**: Abrir “Explicações” diretamente pelo menu e localizar definições das áreas Visão geral, Conexões, Desempenho, Bancos e Logs.

**Acceptance Scenarios**:

1. **Given** qualquer tela do DBMonitor está aberta, **When** a pessoa seleciona “Explicações” no menu, **Then** vê uma tela dedicada somente ao significado dos dados e à sua interpretação.
2. **Given** a pessoa usa a navegação compacta, **When** procura “Explicações”, **Then** encontra a mesma entrada e o mesmo conteúdo disponíveis na navegação lateral.
3. **Given** nenhuma conexão com o banco está disponível, **When** abre “Explicações”, **Then** consegue consultar o conteúdo completo.

---

### User Story 3 - Comparar medidas semelhantes (Priority: P3)

A pessoa distingue medidas instantâneas, taxas, variações no período e contadores acumulados, além de entender as limitações das fontes.

**Why this priority**: Diminui conclusões incorretas ao comparar valores de telas diferentes.

**Independent Test**: Ler as explicações de transações, cache, latência e sessões e identificar unidade, janela temporal, origem e ressalvas de cada uma.

**Acceptance Scenarios**:

1. **Given** “Transações/min” e “Transações concluídas” aparecem em telas diferentes, **When** a pessoa lê as duas definições, **Then** consegue identificar qual é uma taxa por minuto e qual é uma quantidade entre coletas.
2. **Given** “Commits totais” e “Transações no período” aparecem para um banco, **When** a pessoa lê as definições, **Then** entende que o primeiro é acumulado desde o último reset estatístico e o segundo é a variação observada no período.
3. **Given** “Cache hit” e “Acertos de cache” aparecem em áreas diferentes, **When** a pessoa lê as definições, **Then** entende que um é percentual de acertos e o outro é contagem de blocos atendidos em memória.

### Edge Cases

- Se várias telas exibirem o mesmo conceito com unidades ou períodos diferentes, cada rótulo deve chegar a uma explicação que indique a diferença; conceitos realmente idênticos podem compartilhar uma seção.
- Se a seção de destino estiver abaixo da dobra, a navegação deve deixá-la visível sem escondê-la sob a barra superior fixa e deve permitir identificá-la por título.
- O conteúdo e os atalhos devem continuar utilizáveis com teclado, leitor de tela e na largura mínima suportada pela janela.
- Se o dado estiver vazio, obsoleto, parcial ou indisponível, o botão explicativo deve permanecer disponível e a definição não deve sugerir que ausência de valor significa zero.
- Alterar perfil de conexão ou período não deve mudar o texto das definições nem fazer um atalho apontar para assunto incorreto.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE oferecer a entrada “Explicações” na navegação principal lateral e na navegação compacta, com estado selecionado identificável.
- **FR-002**: A tela “Explicações” DEVE conter somente conteúdo explicativo dos dados apresentados no DBMonitor e navegação necessária para consultá-lo; não deve exibir métricas em tempo real nem ações administrativas.
- **FR-003**: Cada conceito de dado exibido em cartões, títulos de gráficos, resumos e cabeçalhos de tabelas das telas Visão geral, Conexões, Desempenho, Bancos e Logs DEVE ter, ao lado do rótulo, um botão de informação circular com a letra “i”. Rótulos puramente operacionais, como filtros, paginação e botões de ação, ficam fora desse requisito.
- **FR-004**: Cada botão de informação DEVE abrir a tela “Explicações” diretamente na definição do conceito associado; a seção de destino DEVE permanecer visível abaixo da barra superior fixa e ser identificável visualmente.
- **FR-005**: Cada botão DEVE ter um nome acessível que identifique o conceito explicado, ser acionável por teclado e ter área de interação adequada para mouse e toque. A forma circular e a letra “i” não podem ser os únicos meios de comunicar sua finalidade.
- **FR-006**: As definições DEVEM informar, para cada conceito, o que ele mede, a unidade, se representa valor atual, taxa, variação entre coletas ou total acumulado, o período a que se refere e, quando pertinente, como é calculado e de onde vêm os dados.
- **FR-007**: A cobertura inicial DEVE incluir os indicadores da Visão geral: conexões abertas, transações por minuto, tempo médio de consulta, bancos ativos, séries de conexões e transações e colunas do resumo de bancos, incluindo commits, rollbacks e cache hit.
- **FR-008**: A cobertura inicial DEVE incluir conceitos da tela Conexões: total, ativas, ociosas, em espera, distribuição de sessões, início da conexão, duração da consulta ativa, estado e evento de espera.
- **FR-009**: A cobertura inicial DEVE incluir conceitos da tela Desempenho: atividade WAL, operações de I/O, tempo da coleta, consultas ativas, duração, espera e latência agregada por consulta, incluindo chamadas, média e total.
- **FR-010**: A cobertura inicial DEVE incluir conceitos da tela Bancos: tamanho em disco, conexões, limite e estado do banco, transações concluídas ou no período, blocos lidos, acertos de cache, commits e rollbacks totais e critério de “Bancos mais acessados”.
- **FR-011**: A cobertura inicial DEVE incluir conceitos da tela Logs: horário do evento, severidade, banco, usuário, PID e mensagem, distinguindo evento registrado de estatística agregada.
- **FR-012**: As definições DEVEM diferenciar explicitamente a taxa `tx/min` da contagem `transações/coleta`; commits e rollbacks acumulados da variação no período; e a porcentagem “Cache hit” da contagem de acertos de cache.
- **FR-013**: As definições DEVEM explicar que contadores acumulados podem reiniciar, que taxas dependem de coletas válidas comparáveis e que algumas métricas dependem de disponibilidade da fonte ou de permissão de leitura.
- **FR-014**: O conteúdo DEVE usar os nomes e unidades exibidos na interface e manter correspondência entre cada atalho e seu título de destino, mesmo quando o valor estiver indisponível.
- **FR-015**: A tela DEVE ser legível e navegável sem conexão ativa com PostgreSQL, sem solicitar consulta ou coleta somente para mostrar definições.
- **FR-016**: A explicação de `tx/min` DEVE indicar que a taxa usa o aumento observado de commits mais rollbacks dividido pelo tempo em minutos entre coletas válidas. A explicação de “Cache hit” DEVE indicar que é a porcentagem de blocos atendidos pelo cache sobre o total de acertos de cache mais leituras de blocos, exibida como indisponível quando não há base para calcular a proporção.
- **FR-017**: A explicação de commits DEVE identificá-los como transações concluídas com confirmação; a de rollbacks, como transações revertidas, sem presumir que todo rollback é falha. Ambas DEVEM indicar quando o número exibido é total acumulado ou variação em um período.

### Key Entities *(include if feature involves data)*

- **Conceito explicado**: Nome mostrado na interface, definição, unidade, natureza temporal, fonte, interpretação e ressalvas.
- **Referência contextual**: Associação entre um rótulo de uma tela existente e o conceito explicado que seu botão abre.
- **Seção de explicação**: Conjunto identificável de definições de uma área do produto, com destino direto para cada conceito.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em uma auditoria das cinco telas de dados, 100% dos rótulos de conceitos definidos em FR-003 têm um botão de informação funcional e um destino correspondente.
- **SC-002**: Em 100% dos atalhos testados, a definição correta fica visível após uma seleção, sem exigir busca manual ou rolagem adicional para encontrá-la.
- **SC-003**: Pelo menos 9 de 10 pessoas em um teste de compreensão identificam corretamente a diferença entre taxa de transações, contagem entre coletas e total acumulado após consultar as explicações.
- **SC-004**: Pelo menos 9 de 10 pessoas em um teste de compreensão identificam corretamente a diferença entre percentual de cache hit e número de acertos de cache.
- **SC-005**: O conteúdo completo pode ser aberto e percorrido nas larguras suportadas e sem conexão ativa; todos os botões de informação podem ser operados apenas com teclado.

## Assumptions

- A solicitação cobre as cinco telas que exibem dados de observabilidade; Configurações contém controles de operação e não requer glossário próprio nesta atualização.
- O texto das explicações é estático e em português, como o restante da interface. Não armazena conteúdo de coletas nem dados sensíveis.
- Conceitos iguais podem reutilizar uma definição; rótulos iguais com significados diferentes precisam de explicação específica ou de distinção explícita no destino.
- A página de explicações é informativa e não altera o perfil ativo, filtros, período nem dados coletados.
