# Especificação de Funcionalidade: Iniciar com o sistema

**Feature Branch**: `não vinculada a branch`

**Created**: 2026-09-23

**Status**: Pronta para planejamento

**Input**: Solicitação para que a instalação do DBMonitor no Windows ative automaticamente sua abertura após o login, minimizada na barra de tarefas, sem configuração externa ao software, com controle posterior dentro do aplicativo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Iniciar automaticamente após instalar (Priority: P1)

Uma pessoa instala o DBMonitor no Windows. Sem abrir Configurações ou alterar opções do Windows, no próximo login o aplicativo inicia minimizado na barra de tarefas, sem interromper seu trabalho, e pode ser restaurado pela barra de tarefas.

**Why this priority**: Entrega o objetivo principal da funcionalidade.

**Independent Test**: Em uma instalação nova no Windows, sem abrir as Configurações do DBMonitor, encerrar a sessão do usuário, entrar novamente e verificar que o aplicativo inicia uma vez, minimizado na barra de tarefas, e pode ser restaurado por ela.

**Acceptance Scenarios**:

1. **Given** uma instalação nova no Windows, **When** ela termina, **Then** o início automático está ativado para o usuário da instalação sem exigir que ele abra Configurações.
2. **Given** uma instalação nova e nenhum ajuste manual, **When** o usuário entra novamente no Windows, **Then** o DBMonitor inicia uma vez, minimizado na barra de tarefas.
3. **Given** uma abertura automática minimizada, **When** a pessoa seleciona o DBMonitor na barra de tarefas, **Then** a janela é restaurada para uso normal.
4. **Given** a opção ativada, **When** o usuário inicia o DBMonitor manualmente na mesma sessão, **Then** a aplicação mantém apenas uma instância em execução e apresenta sua janela existente.

---

### User Story 2 - Desativar e verificar o estado (Priority: P2)

A pessoa pode desligar o início automático nas mesmas Configurações e consultar se o sistema aceitou a mudança.

**Why this priority**: A pessoa mantém o controle do comportamento do computador e sabe quando a preferência não está efetiva.

**Independent Test**: Com o início automático ativo, desativá-lo no aplicativo, entrar novamente na conta do Windows e verificar que ele não inicia automaticamente.

**Acceptance Scenarios**:

1. **Given** o início automático ativo, **When** a pessoa desativa a opção, **Then** o DBMonitor deixa de abrir nos logins seguintes.
2. **Given** que a pessoa desativou explicitamente o início automático, **When** o DBMonitor é atualizado ou reinstalado preservando os dados do usuário, **Then** a opção permanece desativada e o aplicativo não volta a iniciar no login.
3. **Given** que o sistema operacional impede ou revoga o início automático, **When** a pessoa abre Configurações, **Then** o estado mostrado corresponde ao comportamento efetivo e há uma mensagem compreensível sobre a falha ou intervenção externa.
4. **Given** uma tentativa de ativar ou desativar que falha, **When** a operação termina, **Then** a interface não afirma que a mudança foi concluída e informa o erro sem interromper o uso normal do DBMonitor.

---

### User Story 3 - Retomar o uso após login (Priority: P3)

Ao abrir automaticamente, o DBMonitor restaura seu funcionamento normal sem exigir nova configuração de início automático nem expor ou persistir credenciais de conexão por causa dessa opção.

**Why this priority**: A abertura automática deve ser útil e respeitar a forma existente de autenticação dos perfis.

**Independent Test**: Com um perfil que usa senha apenas na sessão, entrar novamente no Windows após instalar; restaurar a janela minimizada e verificar que ela solicita a senha antes de coletar dados autenticados.

**Acceptance Scenarios**:

1. **Given** um perfil que usa senha somente durante a sessão, **When** o DBMonitor abre após login, **Then** a senha precisa ser informada novamente antes da coleta desse perfil.
2. **Given** um perfil cuja autenticação está disponível no novo login, **When** o DBMonitor abre, **Then** a coleta segue o fluxo normal do aplicativo.
3. **Given** que o Windows solicita a abertura automática e a pessoa já abriu o DBMonitor, **When** a solicitação chega, **Then** ela não cria uma segunda instância funcional nem minimiza a janela que já estava aberta.
4. **Given** uma abertura manual do DBMonitor, **When** não há instância anterior, **Then** a janela abre normalmente, mesmo que a opção de início automático esteja ativada.

### Edge Cases

- O início automático só é efetivo após login do usuário; reiniciar o computador sem entrar na conta não inicia a interface.
- Caso o executável tenha sido movido ou removido depois de ativar a opção, o início automático pode falhar; uma instalação válida deve poder reativá-lo nas Configurações.
- Se o sistema operacional ou a pessoa alterar externamente a permissão de inicialização, o estado exibido deve refletir a situação efetiva quando consultado.
- Repetir a ativação ou desativação não deve criar entradas duplicadas de inicialização.
- A abertura automática não deve criar coleta autenticada para perfis que dependem de senha existente somente na sessão anterior.
- A abertura manual deve continuar mostrando a janela normalmente, sem aplicar o estado minimizado reservado à abertura automática.
- A abertura automática deve ser visível na barra de tarefas do Windows, sem depender da área de notificação.
- Uma atualização ou reinstalação que preserva os dados do usuário não deve reverter a desativação feita explicitamente no aplicativo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O DBMonitor instalado DEVE oferecer em Configurações um controle identificado como **Iniciar com o sistema**, com explicação de que a abertura ocorre após login do usuário.
- **FR-002**: Uma instalação nova no Windows DEVE ativar o início automático para o usuário da instalação antes do próximo login, sem exigir abertura das Configurações do DBMonitor ou ação externa.
- **FR-003**: Ao ativar a opção, o DBMonitor DEVE configurar sua abertura automática no próximo login do usuário atual no Windows, sem exigir procedimento externo ao aplicativo.
- **FR-004**: Ao desativar a opção, o DBMonitor DEVE remover a abertura automática dos próximos logins do usuário atual.
- **FR-005**: O estado apresentado em Configurações DEVE refletir se a abertura automática está efetivamente configurada no sistema no momento da consulta, inclusive após alteração externa.
- **FR-006**: O aplicativo DEVE informar quando não conseguir ler ou alterar esse estado, sem apresentar uma tentativa malsucedida como concluída.
- **FR-007**: Ativar ou desativar repetidamente a opção NÃO DEVE gerar aberturas ou registros duplicados.
- **FR-008**: A abertura automática DEVE respeitar a política de uma única instância do aplicativo por sessão de usuário e não minimizar uma janela já aberta.
- **FR-009**: A configuração DEVE ser global para o DBMonitor desse usuário, independente do perfil PostgreSQL selecionado.
- **FR-010**: A funcionalidade NÃO DEVE armazenar senhas de perfis ou outras credenciais para dispensar autenticação após um novo login.
- **FR-011**: Ao abrir automaticamente, o DBMonitor DEVE seguir as regras normais de conexão e coleta de cada perfil; perfis que exigem senha apenas na sessão anterior devem continuar exigindo-a.
- **FR-012**: A funcionalidade DEVE estar disponível no instalável para Windows.
- **FR-013**: O controle DEVE indicar de forma acessível o estado atual, a operação em andamento e eventual erro, permitindo nova tentativa.
- **FR-014**: Quando iniciado automaticamente após o login, o DBMonitor DEVE abrir minimizado na barra de tarefas do Windows e permitir que a pessoa restaure a janela pela barra de tarefas.
- **FR-015**: Quando iniciado manualmente, o DBMonitor DEVE abrir sua janela normalmente, mesmo com o início automático ativado.
- **FR-016**: A abertura automática NÃO DEVE depender de um ícone na área de notificação para que a pessoa encontre ou restaure o aplicativo.
- **FR-017**: Uma desativação explícita do início automático feita pela pessoa DEVE permanecer efetiva após atualização ou reinstalação do DBMonitor quando os dados desse usuário forem preservados.

### Key Entities *(include if feature involves data)*

- **Preferência de início automático**: Estado global por usuário, ligado ou desligado, associado ao registro efetivo de abertura no sistema operacional.
- **Estado de disponibilidade**: Resultado da consulta ou alteração da preferência, incluindo sucesso, impossibilidade de consulta e erro de alteração.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos testes de instalação nova no Windows, sem abrir Configurações, o DBMonitor inicia uma vez, minimizado na barra de tarefas, no login seguinte do mesmo usuário; ele pode ser restaurado por essa barra.
- **SC-002**: Em 100% dos testes de aceitação com o instalável Windows, desativar a opção impede a abertura automática no login seguinte.
- **SC-003**: Uma pessoa consegue encontrar e alterar a opção em Configurações em até 1 minuto, sem acessar configurações externas do sistema operacional.
- **SC-004**: Em todos os testes de falha simulada ou revogação externa, a interface indica o estado efetivo ou informa claramente que não conseguiu verificá-lo, sem afirmar sucesso incorretamente.
- **SC-005**: Em todos os testes com perfil de senha de sessão, nenhum dado coletado após um novo login depende de senha recuperada da sessão anterior.
- **SC-006**: Em 100% dos testes de abertura manual com ou sem a opção ativada, a janela aparece normalmente; tentativas adicionais de abertura não criam segunda instância.
- **SC-007**: Em 100% dos testes de atualização ou reinstalação que preservem os dados do usuário, uma desativação explícita anterior permanece efetiva no login seguinte.

## Assumptions

- A instalação nova no Windows ativa o início automático por padrão; a pessoa pode desativá-lo e reativá-lo nas Configurações do DBMonitor.
- “Iniciar o computador” significa abrir o aplicativo após o login do usuário, quando há sessão gráfica disponível; a funcionalidade não executa coleta antes do login.
- A preferência é global para a instalação do DBMonitor no usuário atual e não varia por perfil PostgreSQL.
- A abertura automática começa minimizada na barra de tarefas; não há requisito de ícone na área de notificação nem de operação sem janela.
- A abertura manual mantém a apresentação normal da janela.
- O alvo desta entrega é o instalável existente para Windows; Linux e seus formatos de distribuição ficam fora do escopo desta funcionalidade.
- A preservação da escolha do usuário em reinstalações depende de seus dados locais permanecerem disponíveis; uma instalação após remoção desses dados é tratada como nova instalação.
- A funcionalidade depende de o sistema operacional permitir o registro de abertura automática para o usuário atual e de o executável continuar disponível no caminho registrado.
- A gestão de credenciais dos perfis permanece como hoje; senhas temporárias não são persistidas por esta funcionalidade.
