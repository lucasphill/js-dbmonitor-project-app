# Quickstart de validação: Explicações dos indicadores

## Pré-requisitos

- Dependências do projeto instaladas em ambiente de desenvolvimento; PostgreSQL de teste é opcional para validar a tela informativa.
- Consulte o [contrato de interface](contracts/explanations-ui.md) para o mapa de rótulos e destinos e o [modelo](data-model.md) para as regras dos conceitos.
- Há mudanças de outras funcionalidades no diretório de trabalho; execute validações sem descartá-las.

## Verificação automatizada

Na raiz do repositório:

```powershell
npm ci
npm run verify
```

Esperado: tipos, testes e exportação estática concluem. Os testes da feature devem verificar IDs únicos, referências existentes, diferenciação entre taxa/total/por coleta e que a tela explicativa não usa dados do banco para renderizar.

## Navegação e conteúdo

1. Inicie a aplicação com `npm run dev` ou `npm start` após o build. Abra “Explicações” no menu lateral e, em janela estreita, na navegação compacta. Confirme os cinco grupos e o destaque do item selecionado.
2. Na Visão geral, selecione o “i” de “Transações/min”, depois os de “Commits”, “Rollbacks” e “Cache hit”. Cada destino deve ficar visível logo após o clique, abaixo do cabeçalho fixo, com foco no título correto.
3. Repita com um cartão, um gráfico, uma coluna ordenável e uma coluna simples em cada uma das telas Conexões, Desempenho, Bancos e Logs. Confirme que o “i” não aciona ordenação nem altera filtros.
4. Percorra o mapa de rótulos do contrato. Confirme que cada conceito de dado tem botão e que não há botão para filtros, paginação ou ações administrativas.
5. Leia as definições de `tx/min`, `transações/coleta`, commits totais, rollbacks totais, cache hit percentual e acertos de cache. Confirme que unidades, janelas e fórmulas correspondem à interface.

## Estados e acessibilidade

1. Sem PostgreSQL disponível ou sem perfil ativo, abra Explicações. O conteúdo deve aparecer inteiro sem aguardar coleta. Em outra tela, um indicador indisponível ainda deve oferecer seu “i”.
2. Navegue somente por teclado. Cada botão anuncia “Entender [rótulo]”; após acioná-lo, o foco deve chegar ao título da explicação. O destino deve ter destaque visível.
3. Reduza a janela até a menor largura suportada. Confirme que o alvo não fica oculto pelo cabeçalho expandido e que tabelas continuam rolando horizontalmente sem sobreposição dos botões.
4. Alterne perfil e período, volte a Explicações e confirme que as definições não mudam e não exibem dados da origem anterior.
