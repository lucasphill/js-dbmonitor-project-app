# DBMonitor

DBMonitor é um dashboard desktop para observar instâncias PostgreSQL sem depender de um serviço de monitoramento externo. Permite cadastrar múltiplos perfis e monitorar uma origem ativa por vez. Mostra estado da instância, conexões e consultas ativas, atividade por banco, desempenho, logs estruturados e diagnósticos. A tabela de sessões mostra quando cada conexão foi aberta e permite encerrar uma sessão cliente específica com confirmação. A tela Bancos inclui um inventário com tamanho em disco, proprietário, codificação, conexões e limite de conexões.

## Proposta e funcionamento

O aplicativo consulta as views administrativas do PostgreSQL periodicamente, identifica a origem de cada coleta e guarda amostras no SQLite local. A interface usa essas amostras para mostrar séries, comparações por banco e lacunas de coleta. Dados indisponíveis aparecem como tal; o painel não inventa latência ou eventos de log quando a fonte não está configurada.

Cada perfil contém endpoint, porta, banco, usuário PostgreSQL e modo de autenticação. Uma instalação nova começa com o perfil **PostgreSQL local** (`localhost:5432/postgres`, usuário `postgres`, senha `password`), sem arquivo `.env`. Essa credencial padrão é pública e deve ser usada apenas no PostgreSQL local de desenvolvimento. Outros perfis podem usar senha fornecida para a sessão ou autenticação IAM do RDS por meio da AWS CLI já configurada no computador. Para IAM, um token novo é obtido ao abrir cada conexão física. Senhas de perfis adicionais e tokens não são armazenados no SQLite. Conexões remotas com senha exigem TLS com certificado e nome do servidor válidos; `localhost` pode usar conexão local sem TLS. A troca de perfil interrompe a coleta anterior antes de iniciar a nova; consultas, histórico, preferências, exportações e ações administrativas mantêm a identidade da origem.

O objetivo é apoiar diagnóstico operacional. A visibilidade das métricas depende das permissões do usuário no PostgreSQL, da extensão `pg_stat_statements` para latência agregada e de uma fonte CSV acessível para eventos de log. O botão de encerramento de sessão exige confirmação e revalida a sessão antes da ação.

## Arquitetura

- **Electron** mantém a conexão PostgreSQL, a coleta, o SQLite local e as operações administrativas no processo principal.
- **Next.js 16** usa App Router com `output: "export"`; o Electron carrega `out/` pelo protocolo local `bdash://app/`. No desenvolvimento, a interface usa `127.0.0.1:3000`.
- **Preload** expõe somente métodos nomeados em `window.bdash`. O renderer não recebe a senha, cliente `pg`, SQLite ou acesso genérico ao sistema de arquivos.
- **shadcn/ui e Recharts** compõem tabelas, controles e gráficos. O processo principal valida os filtros e limites recebidos por IPC.

O caminho principal dos dados é `PostgreSQL → processo principal Electron → SQLite local → IPC restrito → interface Next.js`. A AWS CLI é chamada apenas pelo processo principal nos perfis RDS IAM. A aplicação não mantém um servidor web de produção: `out/` é um export estático servido dentro do Electron.

## Estrutura do projeto

| Caminho | Responsabilidade |
|---|---|
| `app/` | Páginas Next.js, layout, estilos, seções do dashboard e hooks de carregamento |
| `components/ui/` | Componentes shadcn/ui e integração de gráficos com Recharts |
| `electron/` | Janela, ponte IPC, conexão PostgreSQL, coleta, autenticação RDS, exportação e SQLite |
| `electron/certs/` | Bundle de autoridades certificadoras do Amazon RDS e sua procedência |
| `lib/` e `types/` | Tipos, formatação e contratos usados pela interface |
| `tests/` | Testes de migração, isolamento de perfis, autenticação, TLS, coleta e ações |
| `.agents/standards.md` | Padrões de arquitetura, segurança, interface e manutenção |
| `.github/workflows/` | Build para Windows e Linux, geração de tag e release |

As tecnologias principais são Electron 44, Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Recharts, `pg`, SQLite nativo do Electron e electron-builder. O nome público e o pacote são **DBMonitor**. Os identificadores internos legados `bdash://app/`, `window.bdash` e `bdash.sqlite` permanecem para compatibilidade com o histórico e o contrato já usado pelo aplicativo.

## Requisitos e conexão

- Windows ou Linux e Node.js 24 com npm para desenvolver e empacotar. O aplicativo instalado usa o Node incluído no Electron.
- PostgreSQL acessível, com uma conta capaz de ler as views de estatísticas. Para encerrar sessões de outros usuários, a conta precisa da permissão adequada no PostgreSQL.
- Para perfis Amazon RDS com autenticação IAM, instale e configure a AWS CLI no mesmo computador que executa o DBMonitor. Use a identidade AWS padrão ou selecione um perfil da CLI no painel. O DBMonitor gera uma autorização temporária a cada nova conexão; não solicita chaves AWS nem senha do banco nesse modo.
- No RDS, habilite IAM DB authentication, conceda `rds-db:connect` à identidade AWS e configure o usuário PostgreSQL para autenticação IAM. A rede, VPN e grupos de segurança precisam permitir acesso ao endpoint e à porta. O teste de conexão valida o login e uma consulta simples; métricas administrativas dependem de permissões adicionais.
- Logs CSV locais pertencem apenas à origem para a qual foram configurados. Uma instância RDS não disponibiliza automaticamente seu arquivo de logs como CSV local no computador; a seção Logs informa indisponibilidade quando não há fonte própria.

O primeiro perfil já vem configurado para `localhost:5432/postgres` com usuário `postgres` e senha `password`. Se o seu PostgreSQL local usar outra credencial, crie um perfil em **Configurações → Origens PostgreSQL**. Perfis antigos continuam no SQLite durante uma atualização; uma instalação existente mantém o perfil ativo que o usuário selecionou.

Em **Configurações → Origens PostgreSQL**, cadastre endpoint RDS original, porta, região, banco, usuário PostgreSQL e a identidade AWS padrão ou o nome de um perfil da CLI. Use **Testar conexão** para validar token, TLS, login e consulta; depois selecione o perfil no cabeçalho. Uma falha no teste informa a etapa sem mostrar o token. Se a identidade SSO expirar, execute `aws sso login --profile NOME` no terminal e teste novamente. A geração do token usa a configuração da AWS CLI do computador, com validade de 15 minutos para abrir cada conexão; sessões já estabelecidas continuam enquanto o servidor permitir.

O RDS IAM exige TLS com validação do nome do endpoint e da cadeia de certificados. O bundle CA oficial empacotado e seu procedimento de atualização estão documentados em [electron/certs/README.md](electron/certs/README.md). Novos perfis por senha mantêm a senha apenas na memória da sessão. Trocar endpoint, banco, usuário ou modo de autenticação cria uma nova identidade histórica e arquiva a antiga. Renomear o perfil mantém seu histórico. Ao migrar uma base SQLite antiga, o aplicativo grava uma cópia `.backup` antes de alterar o esquema.

```powershell
npm install
npm run dev
```

`npm run dev` inicia Next.js e abre a janela Electron. O aplicativo não carrega arquivos `.env`. Se uma instalação anterior tiver `bdash.sqlite` em `%APPDATA%\bdash-electron`, o DBMonitor continuará usando esse diretório para preservar o histórico. O perfil inicial de instalações novas é criado no SQLite automaticamente.

Para uma execução de teste com SQLite separado, defina `DBMONITOR_USER_DATA_DIR` como caminho absoluto para uma pasta vazia antes de iniciar o Electron. O aplicativo criará a pasta e armazenará ali seu SQLite; isso evita alterar o histórico principal durante a validação. A variável antiga `BDASH_USER_DATA_DIR` continua aceita para compatibilidade.

## Comandos

| Comando | Uso |
|---|---|
| `npm run dev` | Next.js local e Electron de desenvolvimento |
| `npm run typecheck` | Checagem TypeScript |
| `npm test` | Testes Node |
| `npm run build` | Exportação estática para `out/` |
| `npm start` | Abre o Electron usando `out/` já gerado |
| `npm run verify` | Tipos, testes e build |
| `npm run dist:win` | Gera instalador Windows em `release/` |
| `npm run dist:linux` | Gera AppImage e pacote Debian em `release/` (em Linux) |
| `npm run dist` | Build e pacote para a plataforma atual |

## Build no GitHub Actions

Os workflows [build-windows.yml](.github/workflows/build-windows.yml) e [build-linux.yml](.github/workflows/build-linux.yml) rodam em `push` e `pull_request` para `main` ou manualmente. Usam Node.js 24, validam o código e disponibilizam artefatos por 14 dias: instalador e aplicativo descompactado no Windows; AppImage e `.deb` no Linux.

O workflow [release.yml](.github/workflows/release.yml) é manual e deve ser iniciado em `main` após atualizar e enviar a versão de `package.json`. Ele valida e empacota Windows e Linux, verifica que `v<versão>` ainda não existe, cria a tag e publica uma GitHub Release com `.exe`, `.AppImage` e `.deb`. A release não assina os pacotes e não usa segredos de AWS ou do banco. Testes que exigem PostgreSQL real são ignorados sem `BDASH_TEST_PG`. A pasta `release/` fica fora do Git.

## Fontes e significado dos dados

| Informação | Fonte | Interpretação e limite |
|---|---|---|
| Conexões, usuários, estado, espera e consultas ativas | `pg_stat_activity` | Retrato atual. A duração é `agora − query_start` somente para `state='active'`; sessões ociosas não têm duração de consulta ativa. Texto da consulta e endereço do cliente só aparecem após revelação explícita. |
| Horário de abertura da sessão | `pg_stat_activity.backend_start` | Exibido no fuso local com deslocamento UTC; é distinto do início da consulta ativa. |
| Inventário e tamanho dos bancos | `pg_database`, `pg_stat_database`, `pg_database_size` | Metadados e conexões atuais são consultados ao abrir a tela Bancos. O tamanho em disco é calculado somente para a página visível e atualizado sob demanda; pode ficar indisponível sem privilégio `CONNECT` ou se a consulta exceder o tempo limite. |
| Conexões por banco e contadores de commit, rollback, leitura e cache | `pg_stat_database` | `numbackends` é instantâneo; demais contadores são acumulados. Gráficos de taxa e ranking “transações no período” usam diferenças entre coletas do mesmo OID, sem atravessar reset ou lacuna. |
| WAL e I/O | `pg_stat_wal`, `pg_stat_io` | Contadores cumulativos, apresentados com fonte e unidade. Tempos de I/O dependem de `track_io_timing`; quando desativado, não são tratados como latência medida. |
| Tempo de coleta | Relógio local da coleta | Duração da consulta de monitoramento, separada da duração de uma query do usuário. |
| Média de execução de queries | `pg_stat_statements` | Recurso opcional. Média ponderada `sum(total_exec_time) / sum(calls)` das consultas visíveis, em ms, acumulada desde o reset das estatísticas. Não equivale à latência de cada requisição da aplicação. Sem extensão ou sem chamadas, aparece indisponível/insuficiente, nunca como zero medido. |
| Eventos de log | CSV estruturado do PostgreSQL | Recurso opcional. O aplicativo lê somente o arquivo local configurado, acompanha posição e rotação e armazena os eventos ingeridos no SQLite. As views de estatística não fornecem logs completos. |

Para usar a latência agregada, configure `pg_stat_statements` no servidor (`shared_preload_libraries`, reinício quando necessário) e crie a extensão no banco de monitoramento. Para a tela Logs, habilite a emissão CSV no PostgreSQL (`logging_collector` e `log_destination` com `csvlog`) e selecione um arquivo CSV legível em **Configurações**. Essas alterações no servidor são opcionais; o dashboard informa quando uma fonte não está disponível.

## Histórico local e segurança

O SQLite nativo do Electron mantém `bdash.sqlite` em `userData`, com WAL e migrações por `PRAGMA user_version`. A coleta padrão ocorre a cada **15 segundos**, sem ciclos sobrepostos. A retenção padrão é de **30 dias** para amostras e **7 dias** para logs; os limites podem ser alterados em Configurações. A limpeza ocorre em lotes. A auditoria de encerramento permanece no SQLite e não contém texto de query nem senha.

Cada consulta histórica cobre até **7 dias**. Para examinar dados anteriores ainda dentro da retenção, escolha outra janela personalizada de até 7 dias.

O botão **Encerrar conexão** atua em uma linha da tabela. O diálogo mostra a identidade e o risco de abortar a transação; cancelar não chama o banco. Ao confirmar, o processo principal reconsulta PID e `backend_start`, protege seus próprios processos e backends internos e chama `pg_terminate_backend` com parâmetros e timeout positivo. Sucesso só é mostrado quando o PostgreSQL confirma. A tentativa e seu resultado são registrados no SQLite.

A exportação CSV usa o recorte/filtros escolhidos, limita o volume, neutraliza fórmulas de planilha e não inclui credenciais. A exportação de sessões não inclui texto da query nem endereço do cliente; mensagens de logs podem conter informação sensível emitida pelo próprio servidor, então revise o arquivo antes de compartilhá-lo.

## Verificação local

1. Execute `npm run verify` e `npm run dev` com o PostgreSQL configurado.
2. Aguarde duas coletas e confira cartões, séries de conexões/transações e tabela de bancos. Abra Conexões para verificar usuário, estado, espera e duração de uma consulta ativa.
3. Crie uma sessão **descartável de sua autoria** para testar o diálogo: cancelar deve preservá-la; confirmar deve encerrar somente essa sessão. Confira o resultado e a atualização da tabela.
4. Verifique que latência agregada e Logs indiquem pré-requisitos ausentes quando não configurados. Se houver `pg_stat_statements` e CSV no ambiente de teste, produza dados e confira os filtros e a paginação.
5. Reinicie o aplicativo para verificar o histórico SQLite. Gere o instalador com `npm run dist:win`, abra-o e repita a leitura e a navegação.

Os padrões de manutenção estão em [.agents/standards.md](.agents/standards.md). O identificador interno do instalador permanece estável para permitir atualização de instalações anteriores.
