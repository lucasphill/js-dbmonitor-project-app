# Feature Specification: Exportação de relatórios

**Feature Branch**: `Não criada; especificação local`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Quero implementar uma forma de gerar um relatório a partir dessa aplicação. Quero um botão de exportar que tenha as opções em CSV e em JSON para serem usadas em LLMs. Além disso, quero um export em PDF como um resumo executivo."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Exportar dados estruturados (Priority: P1)

Uma pessoa que analisa o DBMonitor seleciona Exportar, escolhe CSV ou JSON e salva os dados do conjunto e período desejados para análise posterior ou uso com ferramentas externas, inclusive LLMs.

**Why this priority**: Os formatos estruturados permitem continuar a análise fora do dashboard; o JSON deve ser claro e consistente para consumo automatizado e por LLMs.

**Independent Test**: Escolher um conjunto de dados, perfil e período com dados disponíveis, exportar nos dois formatos e conferir que os arquivos representam o mesmo recorte e identificam sua origem e período.

**Acceptance Scenarios**:

1. **Given** um perfil e um período com dados exportáveis, **When** a pessoa seleciona Exportar e CSV, **Then** o aplicativo salva um arquivo CSV com os registros do conjunto e recorte selecionados.
2. **Given** um perfil e um período com dados exportáveis, **When** a pessoa seleciona Exportar e JSON, **Then** o aplicativo salva um JSON válido, estruturado e com metadados de origem, período, geração e disponibilidade dos dados.
3. **Given** filtros ou um intervalo estão selecionados na tela atual, **When** a pessoa exporta um conjunto associado àquela tela, **Then** o arquivo respeita esses filtros e intervalo ou informa claramente o recorte aplicado.
4. **Given** a pessoa cancela a escolha do destino, **When** a exportação é encerrada, **Then** nenhum arquivo é criado e a interface não informa sucesso.

---

### User Story 2 - Compartilhar um resumo executivo (Priority: P2)

Uma pessoa gera um PDF legível para compartilhar com gestores ou outras pessoas que precisam entender rapidamente a condição observada da instância, sem interpretar diretamente tabelas e séries detalhadas.

**Why this priority**: O PDF apresenta os principais achados em linguagem direta e facilita comunicar a situação operacional sem exigir acesso ao aplicativo.

**Independent Test**: Gerar um PDF para um perfil e período com dados, abrir o documento e confirmar que ele identifica origem e período, resume indicadores principais e distingue limitações de dados de resultados normais.

**Acceptance Scenarios**:

1. **Given** existem dados disponíveis para o perfil e período escolhidos, **When** a pessoa exporta o resumo executivo em PDF, **Then** recebe um documento identificável por perfil, período e data de geração, com os principais indicadores e conclusões observadas.
2. **Given** algumas fontes ou indicadores estão indisponíveis, **When** o PDF é gerado, **Then** a indisponibilidade e seu motivo conhecido aparecem como ressalvas, sem substituir valor desconhecido por zero ou inferir normalidade.
3. **Given** o período selecionado não contém dados suficientes, **When** a pessoa solicita o PDF, **Then** o documento informa que os dados são insuficientes e não apresenta conclusões que dependam deles.
4. **Given** a pessoa cancela a escolha do destino do PDF, **When** a geração é encerrada, **Then** nenhum arquivo é criado e não é exibida confirmação de exportação.

---

### User Story 3 - Exportar com privacidade e contexto (Priority: P3)

Uma pessoa revisa o conteúdo exportado e entende quais informações podem ser compartilhadas, preservando o contexto necessário sem expor credenciais ou conteúdo sensível de forma inesperada.

**Why this priority**: Arquivos podem ser compartilhados com terceiros ou enviados a LLMs; o conteúdo precisa ser contextualizado e evitar segredos e exposição involuntária.

**Independent Test**: Exportar cada formato com dados representativos e conferir que os arquivos contêm origem, período e ressalvas relevantes, mas não contêm senhas, tokens ou outros segredos de autenticação.

**Acceptance Scenarios**:

1. **Given** um perfil usa senha ou autenticação IAM, **When** qualquer formato é exportado, **Then** o arquivo não contém senha, token ou informação de autenticação reutilizável.
2. **Given** uma exportação contém sessões ou logs, **When** a pessoa escolhe o formato, **Then** o aplicativo comunica os tipos de dados potencialmente sensíveis incluídos antes ou durante a confirmação da exportação.
3. **Given** os dados incluem valores nulos, métricas indisponíveis ou lacunas de coleta, **When** são exportados em CSV ou JSON, **Then** essa condição permanece distinta de zero, valor vazio medido ou ausência de eventos.

### Edge Cases

- Uma fonte opcional, como consultas agregadas ou logs, pode estar desativada, indisponível ou sem permissão; os formatos devem identificar essa limitação e continuar exportando o conteúdo restante quando aplicável.
- Um período sem amostras, com uma única amostra ou com lacunas não deve gerar taxas ou tendências como se houvesse uma série comparável.
- Um conjunto pode resultar vazio após aplicar filtros; a exportação deve informar que não há registros sem gerar conteúdo enganoso.
- Um grande volume de registros deve respeitar os limites de exportação existentes e comunicar qualquer truncamento ou limite aplicado.
- Valores de log podem conter dados operacionais ou pessoais incluídos pelo próprio servidor; o usuário deve ser alertado e ter contexto suficiente para revisar antes de compartilhar.
- Caracteres em campos de texto não devem alterar a estrutura CSV nem ser interpretados como fórmulas ao abrir o arquivo em planilhas.
- O nome do perfil pode mudar ou conter caracteres que não são adequados a nomes de arquivo; o arquivo deve continuar salvável e os dados devem identificar a origem sem revelar credenciais.
- Alterar o perfil ativo durante a geração não pode misturar dados de origens diferentes no mesmo relatório.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema DEVE oferecer uma ação de exportação visível e identificável nas áreas de dados do aplicativo, com escolha entre CSV, JSON e PDF.
- **FR-002**: A exportação CSV DEVE manter a seleção de conjunto de dados, período e filtros disponíveis para aquele conjunto, e informar o recorte que foi aplicado.
- **FR-003**: A exportação JSON DEVE conter estrutura válida e legível por máquina, separando metadados do relatório, contexto da origem, intervalo temporal, unidades e registros.
- **FR-004**: O JSON DEVE ser adequado à análise por LLMs, com nomes de campos descritivos, valores numéricos em forma numérica, datas em formato não ambíguo, unidades e definições de estados indisponíveis, nulos ou incompletos.
- **FR-005**: CSV e JSON DEVEM cobrir os mesmos conjuntos de dados disponíveis para exportação estruturada e representar o mesmo recorte quando solicitados com a mesma seleção.
- **FR-006**: Os arquivos estruturados DEVEM identificar o DBMonitor como origem do relatório, o perfil ou origem monitorada, o instante de geração e o período representado, sem incluir credenciais ou tokens.
- **FR-007**: O PDF DEVE apresentar um resumo executivo do perfil e período escolhidos, incluindo data de geração, principais conclusões observáveis, indicadores-chave disponíveis e ressalvas sobre cobertura ou qualidade dos dados.
- **FR-008**: O PDF DEVE usar linguagem compreensível para pessoas não especializadas e distinguir fatos observados, estimativas e indisponibilidade de dados; não deve apresentar valor indisponível como zero nem como evidência de ausência de problema.
- **FR-009**: O conteúdo do PDF DEVE se adaptar às fontes disponíveis. A ausência de logs ou de uma extensão opcional deve ser indicada como limitação, sem impedir o resumo dos demais dados disponíveis.
- **FR-010**: Antes de concluir uma exportação que possa incluir texto de consulta, endereço de cliente, mensagens de log ou dados identificáveis, o aplicativo DEVE indicar claramente essas categorias e permitir que a pessoa cancele.
- **FR-011**: Senhas, tokens temporários, segredos de autenticação e material equivalente NÃO DEVEM ser incluídos em nenhum formato de exportação.
- **FR-012**: A exportação DEVE preservar a identidade do perfil de origem durante toda a geração e não combinar registros de perfis diferentes.
- **FR-013**: O sistema DEVE informar cancelamento, sucesso, falha, ausência de registros e truncamento de forma distinta, incluindo a quantidade exportada quando aplicável.
- **FR-014**: Ao cancelar a seleção de destino, o sistema NÃO DEVE criar um arquivo nem informar conclusão bem-sucedida.
- **FR-015**: A geração de CSV DEVE neutralizar conteúdo de texto que possa ser interpretado como fórmula por planilhas.
- **FR-016**: Períodos sem dados suficientes, com amostras isoladas ou com lacunas DEVEM ser descritos sem produzir tendências ou taxas que não possam ser sustentadas pelo recorte.
- **FR-017**: Os relatórios DEVEM manter datas e horários com contexto de fuso suficiente para interpretação consistente, seguindo a convenção de data e hora do produto.
- **FR-018**: Quando o conjunto selecionado estiver vazio, o aplicativo DEVE indicar essa condição e permitir que a pessoa ajuste filtros ou período sem criar um relatório que pareça conter resultados.

### Key Entities *(include if data is involved)*

- **Solicitação de exportação**: Formato, conjunto de dados, origem, intervalo, filtros, instante de geração e resultado da operação.
- **Relatório estruturado**: Metadados legíveis por máquina e registros de métricas, conexões, bancos ou logs, com unidade, contexto temporal e disponibilidade.
- **Resumo executivo**: Documento para compartilhamento com identificação da origem e período, indicadores selecionados, conclusões observadas e limitações.
- **Ressalva de dados**: Explicação de fonte ausente, permissão insuficiente, lacuna, truncamento ou quantidade insuficiente de amostras que afete a interpretação.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos cenários de exportação válidos, CSV e JSON contêm o mesmo conjunto de registros para uma mesma seleção, filtros, origem e período.
- **SC-002**: Em 100% dos arquivos JSON gerados nos cenários de aceitação, a estrutura pode ser interpretada sem ambiguidade quanto à origem, intervalo, unidades e valores indisponíveis.
- **SC-003**: Pelo menos 9 de 10 pessoas em uma avaliação conseguem identificar no PDF a origem monitorada, o período e os principais achados em até 2 minutos.
- **SC-004**: Em 100% dos cenários com fonte indisponível, lacuna ou amostras insuficientes, CSV, JSON e PDF não representam a condição desconhecida como zero ou como conclusão confirmada.
- **SC-005**: Em 100% dos formatos e cenários avaliados, nenhum arquivo contém senha, token ou segredo de autenticação.
- **SC-006**: Em 100% dos cancelamentos de seleção de destino, nenhum arquivo é criado e nenhuma mensagem afirma que a exportação foi concluída.

## Assumptions

- A ação de exportação pode estender os fluxos CSV que já existem nas telas de Conexões, Bancos e Configurações; a experiência deve apresentar as três opções de formato de maneira consistente.
- CSV e JSON exportam conjuntos de dados existentes e selecionáveis, com períodos e filtros equivalentes aos já oferecidos. O pedido não implica gerar um despejo completo do histórico local.
- O PDF executivo usa dados disponíveis para uma origem e um período selecionados e resume condições observáveis no DBMonitor; não é uma auditoria, diagnóstico causal ou recomendação automática.
- Os formatos preservam o recorte definido pela pessoa, dentro dos limites de volume já aplicáveis às exportações.
- Conteúdo de logs e detalhes de sessão podem ser sensíveis; quando incluídos, a pessoa deve ser informada antes de compartilhar o arquivo.
- O relatório é gerado em português, seguindo o idioma atual da aplicação, e salvo no local escolhido pela pessoa.
