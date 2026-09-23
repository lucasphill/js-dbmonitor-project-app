# Quickstart de validação: conexões PostgreSQL e RDS IAM

## Pré-requisitos

- Node/npm e dependências do projeto instaladas (`npm ci`).
- PostgreSQL local de teste acessível para migração/compatibilidade. Não usar os endpoints RDS fornecidos pelo usuário em testes automatizados.
- Para validação IAM real, uma instância RDS **de teste autorizada** com autenticação IAM, usuário PostgreSQL habilitado, permissão `rds-db:connect`, rede/VPN liberada e AWS CLI funcional no mesmo Windows que executa o aplicativo.
- Bundle CA oficial do RDS disponível conforme [research.md](research.md). Credenciais AWS permanecem no ambiente da CLI; não entram em arquivos do projeto.

## Verificações locais automatizadas

Na raiz do repositório:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Esperado: testes de entrada IPC, geração transitória de token com CLI simulada, renovação para nova conexão após 15 minutos, sanitização de erro, rejeição TLS, migração v2 populada e isolamento por perfil passam sem rede RDS. Build estático é concluído. Em seguida `npm run dist:win` valida que CLI/bundle podem ser usados no pacote instalado.

## Migração e localhost

1. Fazer cópia de uma base `bdash.sqlite` v2 com ciclos, logs e auditoria. Abrir a nova versão com essa base.
2. Abrir o painel de conexões. Esperado: perfil local ativo, id 1, host/banco/usuário corretos, amostras e logs anteriores visíveis.
3. Testar/atualizar o perfil local e confirmar que coletor e telas funcionam. Inspecionar integridade referencial do SQLite e o histórico original. Repetir com uma base v2 vazia.
4. Simular falha no meio da migração. Esperado: abertura falha com indicação clara e dados originais recuperáveis; nenhum arquivo parcialmente migrado vira fonte ativa.

## Cadastro e troca de origens

1. No painel, criar dois perfis fictícios RDS IAM (um em `sa-east-1`, outro em `us-east-1`) com perfil AWS padrão/nomeado. Não é necessário conectar aos endpoints de produção.
2. Confirmar que o formulário não solicita senha do banco nem credenciais AWS. A lista mostra nome, endpoint, banco, região, usuário DB e método de autenticação sem segredos.
3. Alternar entre localhost e perfis de teste com coletor simulado. Esperado: gráficos, tabelas, diagnósticos, logs e exportações permanecem identificados e isolados. Uma coleta atrasada da origem anterior não aparece na nova.
4. Renomear um perfil: id e histórico ficam. Alterar host ou usuário: diálogo explica que será uma nova origem; após confirmar, perfil antigo é arquivado com histórico intacto e novo id recebe novas coletas.
5. Arquivar perfil inativo: não aparece como selecionável, histórico dos demais permanece. Arquivar ativo sem selecionar outro é rejeitado.

## Teste IAM real em RDS autorizado

1. Confirmar fora do aplicativo que `aws --version` e a identidade escolhida funcionam, e que o destino aceita IAM. Não colar token em logs ou capturas.
2. No aplicativo, cadastrar endpoint RDS real de **teste**, porta, região, banco, usuário PostgreSQL e identidade AWS padrão ou perfil nomeado. Testar conexão.
3. Esperado: sucesso só após consulta PostgreSQL; mostrar banco/usuário/versão e aviso sobre permissões de monitoramento. Selecionar perfil e conferir visão geral, conexões e diagnósticos.
4. Manter app aberto por ao menos 35 minutos e forçar novas conexões físicas após 15 minutos (sem reutilizar token capturado). Esperado: reconexões funcionam e conexões já abertas não são encerradas só por expiração do token de abertura.
5. Repetir com perfil AWS inexistente, permissão negada, endpoint/porta inacessível, certificado inválido e usuário DB incorreto. Esperado: categoria de erro correta, sem token ou segredo em tela, exportação, SQLite ou logs.
6. Abrir confirmação de término de uma sessão descartável, trocar perfil e confirmar. Esperado: `PROFILE_CHANGED`, sem encerramento em nenhuma origem. No perfil correto, a ação continua sujeita à proteção e permissão originais.

## Inspeção final

Consultar [contrato IPC](contracts/connection-profiles-ipc.md) e [modelo de dados](data-model.md). Inspecionar banco local e arquivos produzidos por casos de erro para confirmar ausência de senha, token e chaves AWS. Revisar pacote Windows instalado, pois ambiente `PATH` do Electron empacotado pode diferir do terminal.

## Evidências desta implementação (23/09/2026)

- `npm run typecheck`, `npm test`, `npm run build` e `npm run dist:win` concluídos. A suíte local tem 41 testes aprovados e 2 testes de integração PostgreSQL ignorados sem `BDASH_TEST_PG`.
- Os testes automatizados cobrem migração v2 populada/vazia e rollback, integridade referencial, três perfis com históricos/logs/preferências/auditoria separados, alternância durante coleta, troca rápida, exportação por origem, token renovado em conexão física simulada após 15 e 35 minutos, TLS inválido e hostname divergente.
- O executável empacotado abriu com diretório de dados temporário. O painel e formulário IAM renderizaram sem erro de JavaScript. O teste de uma origem fictícia percorreu a AWS CLI e retornou `NETWORK_UNAVAILABLE`. A alternância entre localhost e dois perfis RDS fictícios retornou o id correto em visão geral, diagnósticos, logs e preferências em todos os três contextos. O SQLite dessa execução teve zero violações em `PRAGMA foreign_key_check` e nenhum marcador de token IAM detectado no arquivo ou WAL.
- O teste real contra um RDS autorizado por 35 minutos, o tempo de cadastro SC-001 e a avaliação de cinco administradores SC-008 dependem de ambiente/pessoas externos e permanecem sem medição. Os endpoints RDS do usuário não foram acessados durante a validação.
