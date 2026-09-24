# Contrato: Configurações de início automático

## Bridge Electron

O preload expõe somente estes métodos no `window.bdash`:

```ts
type StartupState = {
  state: "enabled" | "disabled" | "unavailable";
  reason?: string;
};

getStartupState(): Promise<StartupState>;
setStartupEnabled(enabled: boolean): Promise<StartupState>;
```

- `getStartupState` consulta o Windows a cada chamada; não lê uma preferência por perfil.
- `setStartupEnabled` aceita somente booleano estrito. O main process valida origem IPC pelo `wrapHandler` existente. Após alterar o Registro e o marcador, relê e retorna o estado efetivo.
- Falha de leitura ou escrita rejeita a Promise no formato de erro IPC já usado pelo aplicativo, com texto compreensível. Uma tentativa malsucedida jamais retorna `state: "enabled"` por presunção.
- Em Windows não empacotado e em plataformas fora de escopo, a bridge informa `unavailable` com explicação; não modifica login items.
- A interface usa um controle associado a rótulo e descrição, mostra leitura/alteração em andamento e erro em `role="alert"`; permite tentar novamente.

## Comando instalado

A entrada do usuário Windows usa o executável instalado e um único argumento interno fixo de abertura automática. O mesmo nome, caminho e argumento devem ser usados no NSIS e nas chamadas `setLoginItemSettings`/`getLoginItemSettings`. Esse argumento só altera a apresentação inicial quando é a primeira instância Windows empacotada. Não transporta segredo ou identidade de perfil.

## Semântica de apresentação

- Primeira abertura automática: janela carregada, minimizada e visível como botão na barra de tarefas; restauração normal ao selecionar o botão.
- Primeira abertura manual: janela visível e não minimizada.
- Segunda abertura manual: uma instância; restaura/foca a janela existente.
- Segunda abertura automática: uma instância; preserva apresentação da janela existente.
