# Modelo de dados: Explicações dos indicadores

Nenhuma tabela, migração, coleta ou mensagem IPC é necessária. O modelo abaixo descreve conteúdo estático do renderer e seu estado transitório de navegação.

## Conceito explicado (`ExplanationTopic`)

| Campo | Tipo conceitual | Regra |
| --- | --- | --- |
| `id` | identificador estável | Único, não derivado do título; usado como destino de navegação. |
| `group` | área do produto | Um de Visão geral, Conexões, Desempenho, Bancos, Logs. |
| `title` | texto em português | Mesmo conceito e unidade apresentados na interface. |
| `meaning` | texto | Define o que é medido/registrado. |
| `unit` | texto ou ausência | Unidade explícita, quando aplicável. |
| `temporalScope` | texto | Retrato atual, taxa, entre coletas, período selecionado ou acumulado desde reset. |
| `source` | texto | Origem do dado em linguagem compreensível; nome técnico quando ajuda. |
| `calculation` | texto opcional | Fórmula ou regra relevante, especialmente transações e cache. |
| `caveats` | texto | Disponibilidade, permissões, resets, paginação ou interpretação. |

**Validação**: `id` e `title` não podem estar vazios; IDs únicos; toda definição deve conter significado, natureza temporal e origem; unidade explícita ou “não se aplica”; fórmulas obrigatórias para `tx/min` e cache hit.

## Referência contextual (`ExplanationReference`)

| Campo | Tipo conceitual | Regra |
| --- | --- | --- |
| `screen` | área do produto | A tela onde o rótulo aparece. |
| `label` | texto visível | Rótulo do cartão, gráfico ou coluna. |
| `topicId` | referência | Aponta para um `ExplanationTopic.id` existente. |
| `location` | contexto | Identifica cartão, gráfico, resumo, tabela ou detalhe para auditoria. |

**Relacionamento**: várias referências podem apontar ao mesmo conceito somente quando unidade e natureza temporal coincidem. Rótulos iguais com significados diferentes apontam para IDs distintos ou a uma seção que diferencia explicitamente os contextos.

## Seção de explicação (`ExplanationGroup`)

| Campo | Tipo conceitual | Regra |
| --- | --- | --- |
| `id` | identificador estável | Único por área. |
| `title` | texto | Nome da tela de origem. |
| `topics` | lista ordenada | Um ou mais conceitos do mesmo grupo. |

**Relacionamento**: cada conceito pertence a exatamente um grupo; os grupos seguem a ordem da navegação principal.

## Estado transitório de navegação

- `section`: seção ativa, incluindo `explanations`.
- `targetTopicId`: ID opcional solicitado por um botão “i”. Ao abrir via menu, fica vazio.
- **Transição** `tela de dados -> Explicações com alvo`: renderizar, focar título, rolar com compensação do cabeçalho e destacar alvo.
- **Transição** `qualquer tela -> Explicações pelo menu`: limpar alvo, mostrar início da página.
- **Transição** `Explicações -> outra tela`: limpar alvo; não mudar perfil, filtros nem coletas por efeito da navegação.
- Um ID inexistente não deve causar erro ou deixar a pessoa em página vazia; mostrar início da tela de Explicações.
