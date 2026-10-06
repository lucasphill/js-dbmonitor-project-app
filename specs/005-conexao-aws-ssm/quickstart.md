# Quickstart: aceitação AWS SSM + IAM

Guia para após implementação; feature ainda não existe. Não representa testes já executados.

## Pré-requisitos

Node.js 24, AWS CLI e Session Manager plugin no PATH do Electron; ambiente de teste autorizado; instância gerenciada com agente >=3.1.1374.0 e acesso DNS/rede ao RDS; usuário IAM e identidade com acesso SSM/documento/terminate-session e rds-db:connect; CA válida. Não usar produção nos ensaios de queda. Endpoint mascarado do pedido deve ser substituído por endpoint real autorizado.

Na raiz do projeto:

```powershell
node --version
aws --version
session-manager-plugin --version
aws sts get-caller-identity --region sa-east-1 --profile SEU_PERFIL
npm ci
npm run verify
npm run dev
```

Omitir --profile para identidade padrão; renovar SSO externamente se necessário. Nenhum comando manual de túnel/token faz parte do fluxo normal.

## Fluxo principal

1. Configurações → Origens PostgreSQL → Criar perfil → AWS via SSM + IAM.
2. Informar endpoint original, porta 5432, banco, usuário, região sa-east-1 e instância autorizada; porta local automática.
3. Testar sem mudar origem ativa; salvar/selecionar, acompanhar connecting → connected e métricas da origem correta.
4. Repetir com porta explícita 15432 livre; validar identidade TLS RDS remota sem copiar token.
5. Monitorar por 60 minutos, abrindo novas conexões após 15 minutos; não exigir renovação manual.

## Falhas e cleanup

| Ensaio controlado | Esperado |
| --- | --- |
| CLI/plugin ausente | erro prerequisites e orientação |
| Identidade expirada/permissão recusada | etapa aws_identity/tunnel específica |
| Instância offline/host inacessível | falha até 60 s, nunca connected |
| Porta explícita ocupada | LOCAL_PORT_IN_USE; outro serviço intacto |
| CA ou nome TLS errado | TLS_VALIDATION_FAILED; sem fallback inseguro |
| Login recusado/métrica sem permissão | login falha distinto de coleta parcial |
| Cancelar teste/abertura | abort, cleanup até 10 s, sem sucesso tardio |
| Testar configuração ativa igual | coleta continua; teste não fecha túnel ativo |
| Queda controlada do túnel próprio | failed, dados stale, Reconectar em uma ação |
| Disconnect seguido de refresh | não reabre automaticamente |
| Trocar origem/fechar aplicação | recursos próprios liberados; externos intactos |

Executar 10 ciclos conectar/testar/trocar/desconectar; verificar processos próprios e porta com ferramentas do SO, sem matar por nome/porta. Verificar listener exclusivamente loopback e IPv4/IPv6 nos pacotes Windows/Linux. Recusa remota ao cleanup deve produzir aviso sem impedir liberação local.

## Regressões e evidências

Em cópia SQLite de teste, validar backup/migração, IDs/FKs/histórico; porta/target mantém histórico, identidade remota alterada exige confirmação. Repetir modos local/senha/IAM direto. RDS SSM não habilita CSV local. Conferir ausência de segredos em IPC/log/storage/export usando credenciais sintéticas.

Registrar SO, versões CLI/plugin e resultados sem dados sensíveis: SC-001 cadastro até 3 min; SC-002 9/10 até 30 s; SC-003 falha até 60 s; SC-004 60 min sem intervenção; SC-005 10 ciclos com cleanup até 10 s; SC-006 regressões aprovadas. CI usa fakes e PostgreSQL TLS de teste; AWS real opt-in.

Ver [contrato IPC](contracts/connection-ipc.md) e [modelo](data-model.md).

## Evidências de implementação — 2026-10-06

Ambiente: Windows 10.0.26200, Node v24.15.0, npm 11.12.1, pg 8.23.0 do lockfile preservado. Dependências instaladas por npm ci. AWS CLI e Session Manager plugin encontrados no PATH; nenhuma chamada a conta AWS realizada.

- npm run verify: typecheck, suíte (128 aprovados, 2 opt-in ignorados, zero falhas) e build Next estático aprovados. Após acrescentar regressão de ativação concorrente, npm test: 131 casos, 129 aprovados, 2 opt-in ignorados, zero falhas; teste não altera o produto compilado.
- Migrações SQLite v1/v2/v3→v4, backups, rollback, FKs, IDs e histórico aprovados em bancos descartáveis. Target/porta local preservam identidade; mudanças remotas exigem confirmação.
- pg real sobre servidor TLS sintético de loopback verifica SNI remoto, CA/nome recusados antes do token, token por conexão física e cliente existente preservado após relógio simulado de 15 minutos.
- Fakes de processos/rede comprovam leases compartilhados/exclusivos, três candidatos de porta, IPv4/IPv6, árvore Windows com proteção contra PID reutilizado, grupo Linux, cancelamento/deadline, ausência de sucesso tardio e cleanup limitado. Isso não substitui medição de processos reais nos dois SOs.
- Controller/IPC validam queda, suspensão do coletor, disconnect+refresh sem reabrir, reconexão, revisões/contextos, seleção concorrente deduplicada e rejeição de campos/erros secretos. Regressão com DB real garante que cleanup de reconexão conserva a identidade SSM indisponível, sem exposição transitória do perfil local.
- Runtime de UI torna métricas medidas stale imediatamente sem apagar fatos/horários. Cinco testes de apresentação aprovados. Formulário inspecionado visualmente no navegador em modo SSM, com target/região e porta automática/manual; sem bridge Electron, salvar/testar/cancelar não foram ensaiados ponta a ponta.
- git diff --check aprovado. Hooks before_implement/after_implement ausentes (.specify/extensions.yml inexistente). Nenhum commit, push, tag ou Release.

### Aceitação externa pendente

T025: completar ensaio interativo de Testar/Cancelar usando o aplicativo Electron.
T038: executar pacote instalado em Windows e verificar Linux. npm run dist:win concluiu com exit 0 na segunda tentativa após ECONNRESET no download NSIS. Instalador gerado: release/DBMonitor Setup 0.1.5.exe (sem assinatura, conforme configuração atual). Arquivo app.asar conferido: gerenciador SSM, validação, controller final e CA RDS presentes. Nenhum workflow de release foi disparado.
T039: endpoint fornecido está mascarado; faltam banco, perfil AWS e ambiente autorizado de teste. Portanto não se mediram cadastro em 3 minutos, 9/10 conexões em 30 segundos, 60 minutos reais ou 10 ciclos reais. Não houve conexão a produção. Para concluir, preencher os dados do ambiente e executar o roteiro acima, registrando medidas sanitizadas.

## Validação planejada: importação do comando SSM

Este roteiro é novo e ainda não foi executado; evidências anteriores acima pertencem à base SSM/IAM.

Preparação: Node 24 e dependências existentes. Implementar primeiro as tarefas da revisão; então executar `npm run verify` e `npm run dev`. A importação offline não requer AWS CLI, plugin ou identidade AWS. Testar conexão real exige ambiente autorizado e pré-requisitos da base.

1. Abrir Configurações → cadastro → AWS via SSM + IAM → Colar comando SSM. Usar exemplo sanitizado do contrato. Importar e verificar host/região/target/portas na prévia sem alterar o formulário ou a origem ativa.
2. Aplicar, conferir campos, completar nome/banco/usuário e salvar. Medir cadastro até 1 min (SC-007). Reabrir perfil e confirmar reutilização somente dos campos, sem texto bruto.
3. Repetir importação com ordem invertida, --nome=valor, aws.exe, aspas, shorthand/lista unitária, JSON strings/arrays, Bash/PowerShell e CRLF/LF conforme contrato; valores idênticos (SC-008). Para entrada próxima de 16 KiB, medir resposta até 1 s.
4. Editar perfil existente preenchido; omitir perfil AWS/portas no comando, verificar preservação; nome/banco/usuário/CA intactos. Nova identidade exige confirmação ao salvar; target/localPort preservam histórico. Não reconectar ao importar/aplicar.
5. Comando incompleto: indicar host/região/target faltantes sem inventar valores, permitir preparar formulário e completar manualmente. Documento obrigatório ausente é erro. Valor inválido/duplicado recusa sem aplicação parcial.
6. Ensaiar documento/operação diferentes, opções desconhecidas, argumentos repetidos, chaves JSON duplicadas inclusive escapes, variáveis, múltiplos comandos, redirecionamento, credenciais sintéticas, arquivo de parâmetros, NUL e tamanho excedido. Nenhum acesso externo/efeito na origem, mensagem sem conteúdo sensível, draft intacto (SC-009).
7. Criar prévia e mudar texto/draft/perfil/mode, fechar ou descartar antes da resposta; não aplicar dados atrasados. Teste/salvar usam configuração confirmada; importação indisponível enquanto essas operações estão pendentes.
8. Repetir preenchimento manual e perfis antigos. Verificar storage/export/logs sem texto bruto ou credenciais sintéticas. Não usar credenciais reais nesses casos.

Registrar plataforma, conjunto de formatos, tempos e resultados sanitizados; não declarar SC-007–SC-009 atendidos apenas pelo desenho. Conferir [contrato de importação](contracts/ssm-command-import.md). Plano e modelo foram revisados; tasks.md deve ser atualizado por `$speckit-tasks` antes de implementar esta revisão, preservando evidências e pendências anteriores.


## Evidências da revisão implementada — 2026-10-06

- Baseline antes da revisão: npm run verify aprovou typecheck, 129 testes (2 opt-in ignorados) e build. Nenhuma dependência/versão/schema alterados.
- Validação final: npm run verify aprovou typecheck, 147 testes (2 opt-in ignorados) e build. Após acrescentar a regressão da resposta estruturada, npm test aprovou 148 testes, 2 opt-in ignorados, zero falhas (150 casos). git diff --check aprovado.
- Parser puro: exemplos, aws/aws.exe, opções/aspas, shorthand/JSON, continuations, limites UTF-8, campos ausentes, duplicação inclusive chaves JSON escapadas, rejeição de shell/credenciais/arquivos e ausência de imports de processo/rede/storage aprovados. Helpers escalares reutilizados pelo cadastro completo. A mensagem de endpoint original foi preservada após a suíte detectar regressão.
- IPC: gate de origem antes do parse, limite de bytes, códigos sanitizados, resposta limitada e API nomeada aprovados. O ensaio real Electron mostrou perda de Error.code pela contextBridge; importação agora resolve o envelope tipado e a UI usa códigos estruturados. Contrato/modelo/plano atualizados para refletir a solução.
- Storage/isolamento: perfil importado equivalente ao manual, ausência de texto bruto/credenciais sintéticas nos arquivos SQLite e perfis públicos; editar target preserva histórico, editar endpoint exige nova origem com arquivamento. Nenhuma migration.
- Ensaio opt-in via main/preload/IPC reais e UI compilada em janela Electron oculta, userData descartável: importar/revisar/aplicar/criar/editar/reabrir aprovados; texto limpo após aplicar; edição do draft invalida prévia; perfil ativo/generation preservados; target editado mantém ID e porta anterior. Quatro variantes de comando aprovadas via IPC (linha única, Bash, PowerShell e JSON); erro com comando encadeado retornou código seguro sem eco. Cadastro automatizado: 1.053 ms; máximo de importação real IPC: 6 ms, incluindo entrada exata de 16.384 bytes. São medidas locais de roteiro automatizado, não estudo de usabilidade humana nem aceitação de conexão AWS.
- `tests/helpers/electron-import-smoke.cjs` é opt-in e não roda no npm test. Usa janela offscreen/oculta e armazenamento descartável, não chama AWS; encerra o processo de teste explicitamente após verificar os resultados. Não comprova encerramento normal do aplicativo instalado, que permanece em T038.
- A importação atual está implementada; nenhum commit, push ou publicação foi realizado nesta revisão. Os critérios AWS e os ensaios de plataforma anteriores continuam pendentes.

Para repetir o ensaio após npm run build, executar da raiz:

```powershell
node -e "const {spawn}=require('node:child_process');const c=spawn(require('electron'),['tests/helpers/electron-import-smoke.cjs'],{stdio:'inherit',windowsHide:true});c.on('exit',code=>process.exit(code||0));"
```

Empacotamento Windows: npm run dist:win terminou com exit 0; instalador local release/DBMonitor Setup 0.1.7.exe gerado, sem assinatura conforme configuração atual. Parser e preload com envelope conferidos no app.asar. A primeira tentativa foi bloqueada no download e a seguinte ocorreu durante substituição de out por outro build; a tentativa final roda após o build estável. Linux desta revisão não executado localmente; não foi disparado workflow de release.
