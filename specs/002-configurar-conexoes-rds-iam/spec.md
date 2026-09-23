# Feature Specification: Configurar conexões PostgreSQL e AWS RDS IAM

**Feature Branch**: `não criada`  
**Created**: 2026-09-23  
**Status**: Draft  
**Input**: Configurar conexões PostgreSQL pelo painel, inclusive RDS com autenticação IAM usando a AWS CLI já configurada no computador, sem informar credenciais AWS nem senha do banco para esses perfis; alternar entre instâncias preservando o monitoramento local.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conectar a um RDS com a identidade AWS local (Priority: P1)

Como administrador, quero cadastrar uma instância RDS usando seu endereço, região, banco e usuário PostgreSQL, escolhendo a identidade AWS que já funciona no meu computador, para monitorá-la sem cadastrar uma senha do banco ou credenciais AWS no aplicativo.

**Why this priority**: É o problema principal: a autorização temporária expira e impede o uso de uma senha fixa.

**Independent Test**: Com identidade AWS e instância de teste autorizadas, cadastrar um perfil IAM, testar a conexão, selecioná-lo e observar uma coleta; inspecionar dados persistidos e confirmar ausência de token e segredos.

**Acceptance Scenarios**:

1. **Given** uma identidade AWS local válida e um banco RDS que aceita autenticação IAM, **When** cadastro endpoint, porta, região, nome do banco e usuário PostgreSQL e testo o perfil, **Then** recebo sucesso com identificação do destino e consigo iniciar o monitoramento sem digitar senha do banco, chave de acesso AWS ou segredo AWS.
2. **Given** um perfil IAM em monitoramento por mais de 15 minutos, **When** uma nova conexão física ao banco é necessária, **Then** o aplicativo obtém autorização temporária válida para essa conexão e a coleta continua sem pedir intervenção por expiração de token anterior.
3. **Given** uma conexão física já estabelecida, **When** vence a autorização usada na abertura, **Then** a conexão existente não é encerrada apenas por esse vencimento.
4. **Given** identidade AWS, permissão IAM, conectividade, autorização no banco ou certificado inválidos, **When** testo ou monitoro o perfil, **Then** vejo a etapa e uma orientação segura para correção, sem exposição do token, credenciais ou comando completo em tela, histórico ou logs do aplicativo.

---

### User Story 2 - Administrar perfis e alternar a origem do dashboard (Priority: P1)

Como administrador, quero criar, editar, testar, selecionar e remover perfis, mantendo localhost disponível, para comparar diferentes instâncias sem confundir seus dados.

**Why this priority**: O monitoramento de várias instâncias só é confiável se a origem ativa e o histórico forem inequívocos.

**Independent Test**: Cadastrar localhost e dois RDS de teste, alternar a seleção enquanto ocorrem coletas, reiniciar o aplicativo e conferir seleção, identidade e histórico de cada perfil.

**Acceptance Scenarios**:

1. **Given** a instalação atual que usa localhost, **When** abro Configurações de conexões após a atualização, **Then** encontro um perfil local utilizável com os dados existentes e posso continuar monitorando-o.
2. **Given** três perfis salvos, **When** seleciono outro perfil, **Then** todas as seções passam a identificar a nova origem, deixam de mostrar dados atuais da origem anterior e exibem somente histórico, estado e diagnóstico pertencentes ao perfil selecionado.
3. **Given** uma troca durante uma coleta, **When** a coleta anterior termina, **Then** seu resultado permanece associado exclusivamente à origem em que começou e não substitui os dados atuais do novo perfil.
4. **Given** um perfil editado em campos que definem a identidade da instância ou do banco, **When** salvo a alteração, **Then** dados históricos da origem anterior não são atribuídos à nova origem; a interface informa a consequência antes de confirmar.
5. **Given** um perfil removido, **When** confirmo a exclusão, **Then** ele deixa de ser selecionável; a decisão sobre seus dados históricos é apresentada explicitamente e não apaga dados de outros perfis.

---

### User Story 3 - Configurar e diagnosticar o acesso com segurança (Priority: P2)

Como administrador, quero saber exatamente qual identidade e qual proteção de transporte serão usadas e receber um teste de conexão útil antes de ativar o monitoramento.

**Why this priority**: RDS IAM depende de identidade local, autorização no serviço, permissões no banco e comunicação segura; um erro genérico torna a configuração difícil e arriscada.

**Independent Test**: Testar um perfil com identidade AWS padrão e outro com perfil nomeado; simular perfil ausente, região divergente, certificado inválido, porta fechada e acesso negado, verificando mensagens e ausência de segredos.

**Acceptance Scenarios**:

1. **Given** uma identidade AWS padrão configurada, **When** deixo o perfil AWS em branco, **Then** o aplicativo usa essa identidade e informa qual modo de seleção será usado, sem solicitar credenciais AWS.
2. **Given** um perfil AWS nomeado, **When** eu o seleciono, **Then** somente esse perfil é usado para a conexão testada e monitorada; uma falha nele não provoca troca silenciosa para outra identidade.
3. **Given** um destino RDS IAM, **When** configuro o perfil, **Then** a comunicação exige validação da identidade do servidor; falha de certificado ou nome do servidor bloqueia a conexão e é explicada.
4. **Given** um teste de conexão bem-sucedido, **When** vejo o resultado, **Then** ele confirma a autenticação e uma consulta simples ao banco designado, sem prometer que todas as métricas administrativas estão autorizadas.
5. **Given** um teste malsucedido, **When** examino o diagnóstico, **Then** consigo distinguir falha de identidade AWS, geração de autorização temporária, rede, TLS, autenticação PostgreSQL e permissão de consulta quando essa distinção estiver disponível.

### Edge Cases

- A AWS CLI não está instalada ou não é encontrada no ambiente do aplicativo empacotado.
- A identidade AWS local expira, exige nova autenticação interativa ou falha ao assumir uma função.
- O nome do perfil AWS foi alterado ou removido depois do cadastro.
- A região informada difere da região do endpoint, ou o usuário PostgreSQL não está habilitado para IAM no RDS.
- O relógio local está incorreto e a autorização temporária é recusada.
- O destino está inacessível por rede, grupo de segurança, VPN ou porta fechada.
- O certificado da instância não corresponde ao endpoint, é inválido ou a cadeia de confiança está ausente/desatualizada.
- O teste obtém autorização temporária, mas a autenticação PostgreSQL falha: o teste não é considerado bem-sucedido.
- Um token vence durante o tempo de vida de uma conexão já aberta: ela pode continuar, mas uma reconexão usa autorização nova.
- Duas mudanças rápidas de perfil não criam coletas simultâneas nem exibem resposta tardia do perfil anterior como se fosse atual.
- A conta de monitoramento não enxerga todas as sessões ou estatísticas; cada seção mostra cobertura parcial sem atribuir zero às métricas ausentes.
- A conta de monitoramento não pode encerrar sessões; a ação existente continua sujeita às permissões do banco e informa recusa sem afetar outras coletas.
- Um perfil salvo é removido ou alterado enquanto uma confirmação de encerramento está aberta; a ação não pode atingir uma instância diferente.
- Nomes iguais para perfis não tornam ambígua a instância ativa; a interface apresenta também endpoint, porta e banco.
- Dados históricos de dois perfis que apontam ao mesmo endpoint não são combinados implicitamente.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer no painel uma lista de perfis PostgreSQL com criação, edição, teste, seleção e remoção, e identificar claramente o perfil ativo em todas as seções do dashboard.
- **FR-002**: Cada perfil MUST registrar nome exibido, endpoint, porta, banco de conexão, usuário PostgreSQL e modo de autenticação; perfis IAM MUST registrar também a região AWS e uma escolha entre identidade AWS padrão ou perfil AWS nomeado.
- **FR-003**: O cadastro IAM MUST utilizar a identidade AWS já configurada no computador sem solicitar chave de acesso, segredo AWS, senha do banco ou token; o usuário PostgreSQL continua sendo informado por ser a identidade no banco.
- **FR-004**: O modo IAM MUST gerar autorização temporária para cada nova conexão física; não pode reutilizar um token vencido em reconexões, nem derrubar conexões existentes exclusivamente porque a autorização usada na abertura completou 15 minutos.
- **FR-005**: O modo IAM MUST exigir comunicação criptografada com validação da identidade do servidor para o endpoint configurado; o aplicativo MUST rejeitar falhas de certificado e de correspondência de nome sem opção silenciosa de ignorá-las.
- **FR-006**: O sistema MUST validar formato e limites de endpoint, porta, região, banco, usuário e nome de perfil antes de testar ou salvar, e MUST impedir que entrada do usuário seja interpretada como comando executável.
- **FR-007**: Testar conexão MUST executar o fluxo real até uma consulta simples no banco selecionado e retornar sucesso somente após autenticação e resposta do PostgreSQL; MUST informar que visibilidade das métricas dependerá das permissões concedidas no banco.
- **FR-008**: Falhas de teste e coleta MUST diferenciar, quando possível, identidade AWS indisponível, falha de autorização temporária, rede, TLS, autenticação do banco e permissão de monitoramento, com orientação acionável e mensagens sem segredos.
- **FR-009**: O sistema MUST manter suporte ao perfil PostgreSQL local preexistente e migrar a configuração atual de forma que o monitoramento existente continue acessível após atualização.
- **FR-010**: No máximo um perfil MUST ser a origem ativa de coleta e consultas do dashboard em cada momento; uma troca MUST parar a coleta da origem anterior, limpar seus dados atuais da apresentação e iniciar a coleta da nova origem sem sobreposição indevida.
- **FR-011**: Toda amostra histórica, evento de log, diagnóstico de coleta e registro de encerramento MUST permanecer associado ao perfil e à identidade da origem que produziu o dado; seleção, exportação e retenção MUST respeitar esse isolamento.
- **FR-012**: Edição de campos que mudam a identidade da origem MUST criar uma nova identidade de origem e arquivar a anterior, sem reutilizar seu identificador para novos dados; a interface MUST explicar e solicitar confirmação sobre essa consequência. Alterar apenas o nome exibido preserva a identidade.
- **FR-013**: Remoção de perfil MUST exigir confirmação e declarar se o histórico correspondente será removido ou mantido sem perfil ativo; não pode apagar histórico de outros perfis.
- **FR-014**: Credenciais AWS, senha, token temporário e material sensível MUST permanecer fora de perfis persistidos, histórico, exportações, respostas do processo principal, mensagens de erro, diagnósticos e registros da aplicação. Uma senha PostgreSQL fornecida pelo usuário no modo de senha só pode transitar para o processo principal no pedido explícito de conexão e ser mantida em memória durante a sessão.
- **FR-015**: O sistema MUST mostrar a identidade de conexão ativa de forma não sensível, incluindo nome do perfil, endpoint, porta, banco, usuário PostgreSQL, região e nome do perfil AWS quando aplicáveis.
- **FR-016**: Seleção de perfil AWS nomeado MUST usá-lo exclusivamente; falha nessa identidade MUST ser relatada sem troca silenciosa para outro perfil AWS.
- **FR-017**: Operações administrativas existentes, inclusive encerramento de conexão, MUST atuar apenas na origem ativa e validar sua identidade novamente antes de executar, além das proteções de sessão já exigidas pela feature anterior.
- **FR-018**: As seções do dashboard MUST manter seus estados de indisponibilidade e cobertura parcial por perfil, pois acesso de monitoramento ou fontes de log podem diferir entre instâncias.
- **FR-019**: Configuração de fontes de log e preferências que dependem da instância MUST ser apresentadas como específicas do perfil, evitando atribuir eventos de uma origem a outra.
- **FR-020**: O sistema MUST continuar utilizável quando um perfil remoto está inacessível, inclusive para selecionar e monitorar outro perfil salvo.

### Key Entities *(include if feature involves data)*

- **Perfil de conexão**: Identidade local estável, nome, destino PostgreSQL, modo de autenticação, parâmetros AWS não sensíveis, estado de seleção e momento de alteração.
- **Origem monitorada**: Associação entre perfil e instância/banco efetivamente consultados, preservada em cada registro histórico mesmo se o perfil mudar.
- **Teste de conexão**: Resultado pontual, horário, etapas concluídas e erro sanitizado, sem autorização temporária ou credenciais.
- **Seleção ativa**: Perfil que fornece dados atuais, coleta e ações administrativas, com identificação visível no dashboard.
- **Autorização temporária**: Material transitório usado para abrir uma conexão IAM; nunca é entidade persistente nem exibida.
- **Amostra, evento e ação administrativa**: Dados já existentes, agora associados à origem que os produziu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um administrador com identidade AWS e banco RDS corretamente autorizados consegue cadastrar, testar e começar a monitorar um perfil IAM em até 3 minutos, sem digitar senha do banco nem credenciais AWS.
- **SC-002**: Em um teste de pelo menos 35 minutos com novas conexões após o minuto 15, 100% das reconexões bem-sucedidas usam autorização válida, sem interrupção atribuível à reutilização de autorização expirada.
- **SC-003**: Em testes alternando três perfis, 100% das telas, históricos, exportações, diagnósticos e ações administrativas exibem ou afetam somente a origem selecionada ou explicitamente identificada.
- **SC-004**: Em inspeção dos arquivos de dados, exportações e logs gerados por testes de sucesso e falha, nenhum token temporário, senha ou credencial AWS aparece em texto recuperável.
- **SC-005**: Todos os testes com certificado inválido ou nome de servidor divergente são bloqueados; nenhum deles é relatado como conexão bem-sucedida.
- **SC-006**: Após atualização e reinício, o perfil local e seus dados históricos continuam acessíveis em 100% dos cenários de migração suportados.
- **SC-007**: Em testes de falha de identidade AWS, rede, TLS e autenticação do banco, 100% dos resultados identificam a categoria correta quando o erro de origem a permite, sem vazar material sensível.
- **SC-008**: Em avaliação com cinco administradores, ao menos quatro conseguem distinguir a origem ativa e alternar para outra instância sem ajuda em até 1 minuto.

## Assumptions

- O aplicativo continua sendo usado localmente por um administrador de banco; uma instância é monitorada ativamente por vez, embora vários perfis possam ser salvos.
- O computador já tem AWS CLI operacional para a identidade padrão ou para perfis nomeados escolhidos; autenticação interativa exigida pela organização continua sendo feita fora do aplicativo.
- O administrador fornece endpoint, região, porta, banco e usuário PostgreSQL corretos; autorização IAM da instância e permissões do usuário no banco são pré-requisitos externos.
- O perfil local atual permanece disponível como opção de compatibilidade. Para autenticação por senha em novos perfis, a senha é fornecida apenas durante a sessão ou por configuração local já existente; não é salva no histórico nem no catálogo de perfis.
- O nome do perfil pode ser alterado sem mudar sua identidade histórica; mudanças de endpoint, porta, banco, usuário ou modo de autenticação constituem uma nova origem para fins de histórico.
- Ao remover um perfil, a opção padrão é preservar o histórico identificado como arquivado; a remoção definitiva dos dados exige escolha explícita separada.
- A frequência de coleta e retenção atuais continuam como padrão inicial para novos perfis, podendo ser ajustadas conforme as preferências do painel.
- Uma fonte de log CSV local pertence somente à origem local configurada; bancos RDS não fornecem automaticamente essa fonte pelo mesmo caminho. Logs de RDS permanecem indisponíveis até que uma fonte própria seja configurada e suportada.
- As métricas disponíveis dependem das permissões do usuário PostgreSQL e das capacidades de cada instância; a conexão bem-sucedida não implica acesso completo às estatísticas ou logs.

## Technical Constraints for Planning

As escolhas técnicas explícitas do solicitante e os requisitos de integração estão preservados em [technical-constraints.md](technical-constraints.md). Esta especificação define o comportamento observável; o planejamento define como realizá-lo.
