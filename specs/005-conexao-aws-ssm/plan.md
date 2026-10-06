# Implementation Plan: Conexão AWS via SSM + IAM

**Branch**: `main` (sem nova branch) | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: `specs/005-conexao-aws-ssm/spec.md`. O setup retornou `BRANCH=005-conexao-aws-ssm` pela feature ativa; esse valor não corresponde à branch Git real, verificada como main.

**Revisão atual**: Importação de comando SSM (FR-018–FR-024, US4, SC-007–SC-009). Base SSM/IAM já implementada e publicada na v0.1.7; os itens de desenho original abaixo são referência do comportamento preservado. Esta fase não implementa nem publica código.

## Summary

Base entregue: modo `rds_iam_ssm` e gerenciador SSM no processo principal. Revisão: adicionar importação offline de um comando permitido, parser puro no main, IPC nomeado e prévia/aplicação explícita no formulário. Reutilizar CLI, provider IAM, CA RDS, pool pg, coleta e IPC. Separar endereço TCP local do endpoint original usado em autenticação, TLS e histórico. Sem novo SDK AWS ou servidor web.

## Technical Context

**Language/Version**: CommonJS no Electron, TypeScript 5.9 na interface, Node.js 24 para testes.

**Primary Dependencies**: Electron 44.4.5, Next.js 16.3.6, React 19, TypeScript 5.9 e pg 8.23.0 conforme lockfile; SQLite nativo e componentes existentes. Nenhuma dependência adicional para o parser. AWS CLI e Session Manager plugin são pré-requisitos externos.

**Storage**: SQLite schema 4 já existente, sem migração nesta revisão. Texto bruto e prévia exclusivamente transitórios; perfil persiste os mesmos campos atuais.

**Testing**: node:test, fakes de processos/rede/tempo, integração PostgreSQL TLS, regressões atuais de perfis/migração/isolamento, aceitação AWS opt-in.

**Target Platform**: Windows e Linux nos alvos atuais de empacotamento.

**Project Type**: Desktop com renderer estático e IPC restrito.

**Performance Goals da revisão**: Importação de até 16 KiB com resposta visível em até 1 s e cadastro com dados complementares em até 1 min.

**Performance Goals da base**: Origem salva em uma ação; 9/10 conexões com dados em 30 s; falha em 60 s; limpeza local em 10 s; 60 minutos sem renovar token manualmente.

**Constraints**: Uma origem ativa; pool máximo 3; um túnel ativo reutilizado; TLS validado; nenhum segredo no renderer/SQLite/log/export; sem instalar ou autenticar AWS automaticamente.

**Scale/Scope**: EC2 intermediário + RDS PostgreSQL IAM, mesma região/identidade; teste isolado, cancelamento e reconexão explícita; preservar três modos existentes.

## Constitution Check

Pré-pesquisa: constituição possui apenas placeholders, sem princípios ratificados. Aplicar `.agents/standards.md`: arquitetura atual, CLI no main, TLS, segredos transitórios, origem em todas as operações, backup/migração e IPC nomeado. Gates atendidos; não inferir regras dos exemplos da constituição.

Após Phase 1: desenho revisado; sem nova dependência, servidor ou API genérica; IDs e referências preservados; deadline/cancelamento/limpeza definidos. Gates atendidos, sem exceções. `npm run verify` será obrigatório na implementação.

## Project Structure

### Documentation (this feature)

```text
specs/005-conexao-aws-ssm/
  spec.md
  plan.md
  research.md
  data-model.md
  quickstart.md
  contracts/connection-ipc.md
  contracts/ssm-command-import.md
  checklists/requirements.md
```

tasks.md é saída de `$speckit-tasks`, não desta fase.

### Source Code (repository root)

```text
electron/aws-ssm-tunnel.cjs           # novo: processos, leases e cleanup
electron/aws-rds-auth.cjs            # token/deadline/executável por SO
electron/connection-profiles.cjs     # validação e lifecycle
electron/db.cjs                     # transporte local separado da identidade
electron/storage.cjs                # migração e identidade histórica
electron/ipc.cjs / preload.cjs / main.cjs
electron/collector.cjs / overview.cjs
app/components/connection-profile-form.tsx
app/components/connection-profile-selector.tsx
app/hooks/
lib/dashboard-types.ts
tests/
README.md
```

Novos arquivos planejados da revisão:

```text
electron/ssm-command-import.cjs       # parser puro, gramática restrita e diagnóstico seguro
lib/ssm-command-import.ts             # merge/previsão de substituições sem efeitos externos
tests/ssm-command-import.test.cjs     # formatos válidos, limites, ambiguidades e rejeições
tests/ssm-command-import-ui.test.cjs  # helper real de merge e invalidação de prévia
```

Arquivos existentes afetados: `electron/profile-validation.cjs` (helpers de campos reutilizáveis), `electron/ipc.cjs`, `electron/main.cjs`, `electron/preload.cjs`, `lib/dashboard-types.ts`, `app/components/connection-profile-form.tsx`, `tests/ipc-ssm.test.cjs`, `tests/ssm-profile-validation.test.cjs`, `README.md`. Storage, manager, db e coletor não precisam mudar para importar.

**Structure Decision**: Estender módulos atuais; um módulo novo isola o processo SSM. Sem outro serviço/projeto.

## Design da revisão: importação de comando

1. `parseSsmCommand(text)` no módulo CJS puro não importa processos, rede, storage ou Electron. Valida limite UTF-8 16.384 bytes antes de processar. Lexer com estados de aspas e posição; não usar eval, shell, expansão, parse de terminal completo ou regex isolada como tokenizador. Complexidade limitada ao tamanho da entrada.
2. Prefixo literal `aws` ou `aws.exe`, seguido de `ssm start-session`. Somente region/target/profile/document-name/parameters; duas formas de opções e ordem livre. Documento remoto explícito obrigatório. Detectar duplicação antes de converter para objetos. Sintaxe detalhada em `contracts/ssm-command-import.md`.
3. Parâmetros shorthand ou JSON literal com um valor por chave. JSON precisa detectar chaves duplicadas antes de sua materialização: JSON.parse sozinho perde essa informação. Preservar aspas de JSON durante tokenização; uma única camada de aspas de terminal externa pode ser retirada. Não interpretar escaping como execução.
4. Extrair helpers de validação de campos existentes sem mudar o contrato do validador completo. Patch parcial contém apenas campos presentes, tipados e validados; coerência endpoint/região checada quando ambos existem. Campos obrigatórios ausentes geram diagnóstico de complementação, não impedem prévia. Aplicação revalida a combinação com campos do formulário; salvar/testar seguem validação completa atual. Não fabricar nome/banco/usuário para chamar o validador.
5. `profiles:import-ssm-command` aceita só texto, autorizado pelo mesmo gate de mainFrame/origem; não usa controller/fila de seleção. API preload `importSsmConnectionCommand(text)`. Retorna envelope sanitizado com patch/campos ou erro estruturado; a UI lê códigos no objeto resolvido, pois o ensaio Electron demonstrou que Error.code rejeitado não atravessa contextBridge. Nunca retorna texto bruto/tokens de lexer. Erros usam allowlist e nomes fixos de campos; não incluir argumento desconhecido, snippet ou stack na mensagem.
6. Formulário SSM mostra textarea/Importar, prévia e Aplicar/Descartar. Importar não altera draft nem cancela coleta; Aplicar modifica draft em uma única atualização, cancela teste pendente e invalida seu resultado. Campos ausentes no patch são preservados. Os defaults já existentes valem somente para cadastro novo; nome/banco/usuário/CA permanecem editáveis.
7. Revisão local do formulário e identificador do pedido protegem retorno assíncrono. Alterar texto, draft, perfil ou modo, desmontar e fechar invalida prévia/pedido; resultado atrasado descartado. Comparar substituições contra snapshot do draft; não aplicar prévia criada para outro snapshot. Impedir uso enquanto salva/testa para evitar estado ambíguo; descarte/volta a manual não altera draft.
8. Texto e prévia só em memória do formulário e chamada IPC; nada em analytics, console, SQLite, exports ou estado global. Limpar ao fechar, trocar perfil/modo e após aplicação. Nenhum segredo é solicitado. Colar não executa nem acessa AWS. Campos importados passam pelos mesmos create/update/test existentes.
9. Edição de perfil SSM usa confirmação histórica já existente ao salvar. Host/porta remota/região/perfil AWS podem exigir nova origem; target/localPort preservam histórico e reiniciam túnel somente após salvar. Prévia não reconecta. Modos antigos ficam intactos.

## Design and Integration da base (referência preservada)

1. Acrescentar authMode, ssmTarget e ssmLocalPort; extrair helper `isRdsIamProfile` para ambos os modos IAM em validação, token, TLS, logs e interface. Campos remotos existentes continuam sendo identidade RDS.
2. Manager no main usa spawn sem shell, parâmetros JSON como argumento, documento fixo AWS-StartPortForwardingSessionToRemoteHost e windowsHide. Pré-verifica CLI/plugin e identidade com sts get-caller-identity usando perfil/região. Saída tem buffer limitado e parser em memória; nunca é repassada bruta.
3. Listener exige processo vivo, marcador de sessão/porta e sondagem loopback IPv4/IPv6. Somente consulta TLS/login real permite connected. pg usa IP literal loopback (não localhost) e porta efetiva, ssl.servername original, CA e rejectUnauthorized=true; provider recebe host/port remotos intactos. Validar contra pg do lockfile.
4. Porta automática reserva candidato via bind loopback porta 0 e libera antes de spawn; tratar corrida com até três candidatos dentro do prazo. Porta explícita ocupada falha sem fallback silencioso. Nunca adotar serviço desconhecido encontrado na porta.
5. Controller mantém mutações serializadas, operationId e generation. Troca SSM draina coletor, fecha pool/túnel anterior, seleciona origem nova e valida antes de iniciar coleta. Falha deixa origem selecionada failed, sem coleta ou fallback silencioso. Modos anteriores preservam seleção lazy existente.
6. Abort de cancelamento deve ser sinalizado fora da fila bloqueada pela abertura; limpeza/publicação final são serializadas. Cliques repetidos na mesma tentativa não duplicam túnel. Reconectar fecha recursos, incrementa generation e revalida; desconectar mantém perfil selecionado e bloqueia refresh de reabrir o túnel.
7. Teste obtém lease: configuração exatamente igual à ativa saudável compartilha túnel sem encerrá-lo ao terminar; diferente usa recurso próprio. Conflito de porta explícita com outra configuração é erro. Troca/desconexão cancela leases do túnel anterior; resultado atrasado nunca modifica origem/coleta atual.
8. Queda invalida transporte, suspende coletor e consultas, fecha pool com prazo e marca último dado stale. Sem abertura automática a cada polling; reconexão explícita. Evento de falha sanitizado por transição.
9. Deadline único 60 s cobre pré-requisitos, identidade, túnel, token e consulta. Timeout publica falha e aborta operações, sem sucesso tardio; cleanup separado até 10 s. Token provider deve respeitar orçamento restante, não apenas timeout próprio.
10. Cleanup idempotente: impedir leases novos, drenar/abortar clientes, terminate-session somente pelo SessionId próprio com região/perfil/prazo curto, finalizar árvore local e verificar porta. Windows: PID capturado e taskkill.exe /PID ... /T /F como fallback restrito; Linux: grupo próprio criado no spawn. Nunca matar por nome/porta. Falha remota ou SessionId não capturado produz warning, mas não impede limpeza local.
11. Migração schema 4: backup atual, transação, rebuild de instances para ampliar CHECK de auth_mode e adicionar colunas, IDs intactos, foreign_keys OFF antes da transação e foreign_key_check antes do commit. Atualizar condição atual version<3 para contemplar rebuild v4. Comparar identidade e transporte separadamente no storage/controller/UI.

## Validation Strategy da revisão

- Parser: comando original sanitizado, aws/aws.exe, ordem/opções equivalentes, aspas, JSON com strings/lista unitária, shorthand e continuations CRLF/LF; ausência de campos, portas inválidas, tamanho UTF-8, duplicações inclusive JSON, documento errado e opção desconhecida.
- Segurança: múltiplos comandos, redirect, variáveis, substituições, credenciais, arquivos externos e caminhos customizados recusados. Provar zero chamadas a processo/rede/controller/storage e ausência do texto/token sintético em erro/resultado/registro.
- Merge/UI: patch parcial preserva ausentes, defaults do cadastro, mudanças visíveis antes de Aplicar, erro atômico, pedido atrasado, edição do texto/draft, trocar perfil/modo, fechar, cancelar teste ao aplicar e regras históricas ao salvar. Testar helper realmente consumido pela UI; não reproduzir implementação nos testes.
- IPC/preload: origem não autorizada, tipo/tamanho inválidos, retorno allowlisted e método nomeado. Regressão do validador completo, perfis antigos e suíte SSM.
- `npm run verify`; ensaio interativo no Electron para importar/revisar/aplicar/completar/salvar/editar/reabrir. Cronometrar SC-007 e SC-008 usando destino de teste e valores sintéticos. Importação não depende de AWS; teste de conexão real segue aceitação autorizada da base.
- Pacotes Windows/Linux devem continuar incluindo novos módulos. Não disparar release nem mudar versão nesta fase de planejamento.

## Validation Strategy da base

- Unitários: args sem shell, validação, buffers, eventos em chunks, spawn/exit, portas, IPv4/IPv6, leases, duplicação, cancelamento/deadline, cleanup Windows/Linux e sucesso tardio.
- Integração fake CLI + PostgreSQL TLS: SNI original pelo IP local, certificado errado recusado, token para destino remoto por conexão física, ausência de segredos em IPC/log/storage/export.
- Migração v1/v2/v3 e instalação nova: backup, IDs/FKs/histórico/preferências/origem ativa e rollback. Transporte editado preserva histórico; identidade alterada arquiva mediante confirmação.
- Controller/IPC/UI: teste durante coleta, cancelamento durante troca, reconectar mesma origem, disconnect+refresh, queda, seleção falha, contexto antigo e shutdown; RDS SSM continua sem CSV local.
- Após implementar: npm run verify, aceitação quickstart, validação dos pacotes Windows/Linux para PATH/plugin/processos. CI sem AWS real; AWS opt-in somente em ambiente autorizado de teste.

## Complexity Tracking

Sem violações. Leases e estado transitório são necessários para testar sem interromper coleta e cancelar operações com segurança.

## Gates após o desenho da revisão

Constituição sem princípios ratificados; padrões locais atendidos. Parser puro, IPC estreito, nenhuma execução do texto, nenhum segredo persistido, mesmo isolamento histórico e sem novas dependências/migrações. Não restam decisões abertas. Hooks before_plan/after_plan ausentes. Branch Git real: main. Próxima fase: revisar tasks.md preservando o histórico das tarefas concluídas e distinguindo a importação ainda não implementada.
