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
