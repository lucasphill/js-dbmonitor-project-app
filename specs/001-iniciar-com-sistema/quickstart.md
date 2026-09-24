# Quickstart de validação: Iniciar com o sistema

## Pré-requisitos

Windows com sessão de usuário de teste e ambiente capaz de executar `npm`. Para o teste fim a fim, use o instalável NSIS produzido pelo projeto. Separe dados de teste: a instalação pode alterar o início automático desse usuário. Consulte [contrato](contracts/startup-settings.md) e [modelo de dados](data-model.md).

## Verificações automatizadas

Na raiz do repositório:

```powershell
npm ci
npm run verify
npm run dist:win
```

Esperado: testes, TypeScript, build e empacotamento Windows concluem sem erro. Os testes da lógica de startup cobrem entrada booleana, releitura pós-escrita, idempotência, falhas, revogação externa, marcador e decisões de janela/instância.

## Instalação nova e login

1. Em usuário de teste sem dados prévios do DBMonitor, instale o NSIS. Não abra Configurações nem use as opções de Inicialização do Windows.
2. Saia da conta do Windows e entre novamente.
3. Confirme uma única instância do DBMonitor, janela minimizada com botão na barra de tarefas e restauração pelo botão.
4. Abra Configurações. `Iniciar com o sistema` deve aparecer ativo e explicar que ocorre após o login.

## Desativação, reativação e reinstalação

1. Desative a opção no DBMonitor. Feche o aplicativo e entre novamente no Windows; ele não deve abrir sozinho.
2. Reinstale ou atualize sem apagar AppData. Entre novamente; ele deve continuar sem abrir sozinho e a opção deve permanecer desligada.
3. Abra manualmente: a janela deve aparecer normalmente. Reative no aplicativo e entre novamente; ele deve abrir minimizado.
4. Reative/desative repetidamente e confira que não surgem entradas ou processos duplicados.
5. Desative externamente o item nas Configurações do Windows e reabra Configurações no DBMonitor; o controle deve indicar que o início não está efetivo e explicar a intervenção.

## Apresentação e autenticação

1. Com opção ativa, abra manualmente em uma sessão sem processo prévio; a janela deve aparecer normalmente.
2. Com a janela manual já aberta, tente disparar a entrada de login; ela não deve criar outra instância nem minimizar a existente.
3. Configure perfil que usa senha somente na sessão, entre novamente no Windows e restaure a janela. A senha deve ser solicitada novamente antes da coleta autenticada.
4. Simule falha de leitura/escrita da API em teste automatizado; a interface deve mostrar falha e não afirmar a mudança.

## Resultados observados em 24/09/2026

- `npm run verify`: passou após a correção final (66 testes aprovados, 2 ignorados; TypeScript e build concluídos).
- `npm run dist:win -- --publish never`: gerou `release/DBMonitor Setup 0.1.3.exe` (126.475.950 bytes).
- Instalação NSIS silenciosa em `release/installer-qa`: exit code 0; `HKCU\Software\Microsoft\Windows\CurrentVersion\Run\DBMonitor` apontou para o executável instalado com `--dbmonitor-autostart`.
- Reinstalação com `%APPDATA%\DBMonitor\startup-disabled` presente: exit code 0; a entrada Run ficou ausente e o marcador foi preservado.
- Desinstalação silenciosa: exit code 0; executável e entrada Run ausentes. O marcador de teste foi removido após a validação.
- Abertura limpa do executável empacotado com `--dbmonitor-autostart`: janela principal visível para o Windows e minimizada (`IsWindowVisible=True`, `IsIconic=True`). Segunda abertura manual restaurou a mesma janela (`IsIconic=False`), sem segunda janela principal.
- No instalador 0.1.3, o aplicativo instalado consultou a entrada criada pelo NSIS e retornou `enabled`. Pela bridge da interface, desativar retornou `disabled`, removeu a entrada Run e criou o marcador; reativar retornou `enabled`, recriou a entrada Run e removeu o marcador.
- Abertura limpa da instalação 0.1.3 com o argumento de autostart: após carregar a janela, `IsWindowVisible=True` e `IsIconic=True`. A verificação foi feita com dados isolados de teste. A cópia de teste foi desinstalada, sem Run nem marcador restantes.

Ainda não executado neste ambiente: sair e entrar novamente na conta Windows, clicar no botão da barra de tarefas após o login, alternar a preferência pelo controle da interface em uma instalação real, revogar a entrada externamente via Configurações do Windows, e comprovar a solicitação de senha de sessão após novo login. Os testes automatizados cobrem a lógica correspondente, mas não substituem essas verificações de sistema.
