# Research: Iniciar com o sistema

## Registro padrão durante a instalação

**Decision**: Usar `nsis.include` com macros `customInstall` e `customUnInstall` no instalador Windows. `customInstall` registra HKCU Run com o executável instalado e argumento fixo de abertura automática quando não houver marcador de opt-out. `customUnInstall` remove o Run apenas na desinstalação real, e não na remoção intermediária de uma atualização.

**Rationale**: O requisito exige registro antes do próximo login mesmo se o usuário não abrir o aplicativo. O template local de electron-builder 26 mostra que `customInstall` roda após instalar arquivos e que `customUnInstall` também roda em `uninstallOldVersion`. A documentação NSIS descreve essas macros e `${isUpdated}` para o contexto de remoção em atualização.

**Alternatives considered**: Registrar só no primeiro lançamento falha quando o usuário fecha o instalador sem abrir o app; escrever somente o Registro na instalação não resolve a UI nem a persistência de opt-out.

**Source**: [electron-builder NSIS](https://www.electron.build/v26/docs/nsis/); `node_modules/app-builder-lib/templates/nsis/installSection.nsh` e `uninstaller.nsh` da dependência instalada.

## Preservação da desativação

**Decision**: Usar marcador de opt-out em `%APPDATA%\DBMonitor\startup-disabled`, lido pelo NSIS e pelo main process. Preservá-lo na desinstalação, como os dados do usuário. Reativação retira o marcador após confirmar o registro.

**Rationale**: Ausência de HKCU Run por si só não distingue instalação nova de desativação explícita. Um arquivo em local fixo para o usuário pode ser consultado pelo instalador sem SQLite nem migração de dados legados. O marcador registra somente a escolha, sem credenciais.

**Alternatives considered**: Preferência por perfil no SQLite não é global nem facilmente acessível pelo instalador; valor adicional no Registro exigiria outra integração para o aplicativo; primeiro lançamento não cumpre o comportamento imediato da instalação.

## Consulta do estado efetivo

**Decision**: Usar `app.setLoginItemSettings` e `app.getLoginItemSettings` com `path`, `args` e `name` correspondentes ao instalador. Considerar `openAtLogin`, `executableWillLaunchAtLogin` e o item correspondente em `launchItems`, inclusive `enabled`. Reler após alteração.

**Rationale**: A documentação Electron exige os mesmos path/args para uma leitura correta e expõe aprovação do Windows em `launchItems`. A API cobre a preferência por usuário sem dependência nova. NSIS não é Squirrel, logo o caminho do executável instalado é apropriado.

**Alternatives considered**: Estado local cacheado pode divergir quando o Windows desativa o item; consultar apenas `openAtLogin` pode ignorar reprovação externa.

**Source**: [Electron app API](https://www.electronjs.org/docs/latest/api/app#appgetloginitemsettingsoptions).

**Observação de validação**: No Electron 44.4.5 instalado neste Windows, a leitura de uma entrada Run criada pelo NSIS retornou `openAtLogin: false` e `launchItems[0].args: []`, embora a entrada contivesse `--dbmonitor-autostart`. O mesmo retorno ocorreu após `setLoginItemSettings` com o argumento. Por isso, o serviço identifica a entrada pelo nome reservado `DBMonitor` e pelo caminho do executável instalado, verifica `executableWillLaunchAtLogin` e `launchItems.enabled`, e não depende da lista de argumentos retornada para exibir o estado efetivo. O argumento continua escrito explicitamente no Run e foi verificado após instalação e reativação.

## Janela minimizada e instância única

**Decision**: Sinalizar a entrada de login com argumento interno fixo. Em primeira instância empacotada Windows com esse argumento, carregar a janela sem apresentá-la normalmente e minimizá-la mantendo botão na barra de tarefas. Abertura manual apresenta a janela. Tomar o bloqueio de instância antes de inicializar serviços; segunda abertura manual restaura/foca, segunda automática não altera uma janela existente.

**Rationale**: `setLoginItemSettings` suporta args; `BrowserWindow` suporta `show:false`, `ready-to-show`, `minimize` e `restore`; `requestSingleInstanceLock` evita coleta duplicada. A apresentação minimizada precisa de teste real no Windows porque a sequência de exibir/minimizar influencia o botão na barra de tarefas.

**Alternatives considered**: `hide()` não satisfaz presença na barra de tarefas; Tray não foi solicitado; minimizar toda abertura prejudica a abertura manual.

**Source**: [Electron app API](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata), [Electron BrowserWindow API](https://www.electronjs.org/docs/latest/api/browser-window#winminimize).
