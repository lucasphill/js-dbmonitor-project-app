# Implementation Plan: Iniciar com o sistema

**Branch**: `001-iniciar-com-sistema` (diretório da feature) | **Date**: 2026-09-23 | **Spec**: [spec.md](spec.md)

## Summary

A instalação nova do DBMonitor no Windows registra o aplicativo para abrir após o login do usuário. A abertura automática traz a janela minimizada na barra de tarefas; a manual mostra a janela. Configurações permite consultar, desativar e reativar o registro efetivo. Uma desativação explícita sobrevive à atualização e à reinstalação que preserva AppData.

## Technical Context

**Language/Version**: JavaScript CommonJS no Electron main/preload; TypeScript 5.9 e React 19 no renderer.
**Primary Dependencies**: Electron 44, Next.js 16, electron-builder 26 com NSIS; sem dependência nova.
**Storage**: HKCU Run para lançamento; `%APPDATA%\DBMonitor\startup-disabled` como marcador de desativação explícita. SQLite de perfis não muda.
**Testing**: `npm run verify`, testes Node com APIs simuladas, build NSIS e aceitação após login Windows.
**Target Platform**: Instalável Windows NSIS; Linux e macOS fora do escopo desta feature.
**Project Type**: Aplicativo desktop Electron com interface Next.js estática.
**Performance Goals**: Consulta do estado ao abrir Configurações e após alteração, sem trabalho adicional por ciclo de coleta.
**Constraints**: Ativo por padrão na instalação nova; opt-out persistente; uma instância; lançamento automático minimizado com botão na barra de tarefas; manual visível; nenhuma senha nova armazenada.
**Scale/Scope**: Uma preferência por usuário Windows, dois canais IPC, controle em Configurações, macro NSIS e ciclo da janela principal.

## Constitution Check

*GATE: avaliado antes da pesquisa e após o desenho.*

`.specify/memory/constitution.md` contém somente placeholders do template, sem princípios ratificados. Não há violação identificável. O desenho conserva a divisão main/preload/renderer e validação da chamada IPC no processo principal.

## Project Structure

### Documentation

```text
specs/001-iniciar-com-sistema/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/startup-settings.md
└── tasks.md                  # etapa speckit-tasks
```

### Source Code

```text
electron/main.cjs             # instância única, IPC, janela
electron/preload.cjs          # bridge permitida
electron/ipc.cjs              # origem e validação de entrada
electron/startup.cjs          # política testável de início automático
app/components/diagnostics-view.tsx
lib/dashboard-types.ts
tests/startup.test.cjs
build/installer.nsh           # macros de instalação/desinstalação NSIS
package.json
README.md
```

**Structure Decision**: Colocar integração do sistema no processo principal e no instalador. A interface nunca manipula Registro ou arquivos diretamente. O marcador global usa `app.getPath("appData")\DBMonitor\startup-disabled`, independente do diretório de dados de perfis e reconhecível pelo NSIS via `$APPDATA`.

## Design Decisions

1. O `customInstall` do NSIS verifica o marcador de opt-out. Na instalação nova sem marcador, escreve entrada HKCU Run para `$appExe` com argumento interno fixo de autostart; se o marcador existe, deixa a entrada ausente. Em atualização, a mesma regra preserva opt-out e corrige caminho de entrada habilitada. O `customUnInstall` remove Run somente em desinstalação real, pois também é invocado ao remover versão anterior durante atualização.
2. Main e instalador usam mesmo nome de entrada, caminho executável e argumento. `app.setLoginItemSettings` modifica o item quando a pessoa altera Configurações; `app.getLoginItemSettings` lê com `path` e `args` idênticos. Um sucesso de escrita só é informado após releitura do estado efetivo.
3. Ao desativar, gravar o marcador persistente e remover o login item; ao ativar, registrar o item e retirar o marcador. Falhas devem preservar ou reparar a consistência possível e retornar estado lido novamente, sem reportar sucesso falso.
4. `launchItems[].enabled` e `executableWillLaunchAtLogin` detectam revogação externa; falha de consulta produz estado indisponível. Não tratar ausência de registro como consentimento para reinstalação quando o marcador existe.
5. `requestSingleInstanceLock()` acontece antes de iniciar armazenamento ou coleta. Segunda abertura manual restaura/foca a janela existente. Solicitação automática tardia não minimiza uma janela já aberta. A corrida antes de `createWindow` deve guardar a intenção de mostrar.
6. Somente uma primeira abertura Windows empacotada com o argumento interno começa minimizada. A janela continua na barra de tarefas e restaura por ela; nenhuma Tray é criada. A abertura manual, inclusive com início automático ativo, abre visível.
7. O controle acessível em Configurações consulta ao montar e após alterações, mostra ocupado/erro e permite nova tentativa. O estado exibido vem da consulta ao sistema, não da intenção de clique.

## Verification Strategy

Testes de unidade cobrem idempotência, marcador, leitura após escrita, revogação, falhas, validação IPC e decisão de apresentação/instância única. `npm run verify` cobre testes, tipos e build. Build NSIS e aceitação em Windows verificam instalação nova sem abrir Configurações, login seguinte, botão na barra de tarefas, desativação, reativação, atualização/reinstalação com opt-out, abertura manual e perfil com senha da sessão. Ver [quickstart.md](quickstart.md).

## Complexity Tracking

Nenhuma violação da constituição a justificar.

## Post-Design Constitution Check

Após pesquisa e contratos, a constituição continua sem conteúdo normativo; nenhuma violação foi introduzida.
