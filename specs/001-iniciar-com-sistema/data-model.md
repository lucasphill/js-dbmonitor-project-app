# Data Model: Iniciar com o sistema

A feature não adiciona tabela ao SQLite. A configuração é global para o usuário Windows e independe do perfil PostgreSQL.

## Registro de início automático

- **Identidade**: nome estável `DBMonitor` sob HKCU Run.
- **Comando**: caminho do executável instalado, com argumento interno fixo de abertura automática.
- **Aprovação**: estado que o Windows atribui ao item; pode ser revogado fora do DBMonitor.
- **Validação**: leitura efetiva compara `path` e `args` com os empregados na escrita e confere se o item está habilitado.
- **Transições**: instalação nova → registrado; desativação pelo aplicativo → removido; reativação → registrado; revogação externa → não efetivo; reinstalação com opt-out → removido.

## Marcador de desativação explícita

- **Identidade**: arquivo `%APPDATA%\DBMonitor\startup-disabled` do usuário atual.
- **Valor**: existência significa que a pessoa desativou a opção no aplicativo. O conteúdo não carrega senha ou perfil.
- **Transições**: instalação nova → ausente; desativação confirmada → presente; reativação confirmada → ausente; atualização/reinstalação com dados preservados → mantido.
- **Invariante**: instalador não registra início automático se marcador presente. Desinstalação real remove Run, mas mantém marcador enquanto os dados do usuário permanecerem.

## Estado enviado à interface

- **state**: `enabled`, `disabled` ou `unavailable`.
- **reason**: mensagem opcional para revogação externa ou falha de consulta.
- **busy**: estado transitório exclusivo da interface durante uma mudança; não persistido.
- **Invariante**: `enabled` só é comunicado quando a consulta confirma que o Windows lançará o comando esperado. `unavailable` nunca é apresentado como `disabled`.

## Intenção de abertura

- **Origem**: argumento interno no comando de login.
- **presentation**: `minimized` apenas na primeira abertura automática Windows empacotada; `normal` na abertura manual.
- **Instância**: a primeira controla a janela e a coleta. Uma segunda abertura manual apresenta a janela existente; uma segunda automática não a minimiza.
