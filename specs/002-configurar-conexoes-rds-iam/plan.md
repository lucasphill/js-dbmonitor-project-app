# Implementation Plan: Perfis PostgreSQL e autenticação AWS RDS IAM

**Branch**: `002-configurar-conexoes-rds-iam` | **Date**: 2026-09-23 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-configurar-conexoes-rds-iam/spec.md`

## Summary

Adicionar gerenciamento de perfis PostgreSQL no painel, com perfil local de compatibilidade e perfis RDS IAM que usam a identidade AWS CLI do computador. Tokens são gerados para cada nova conexão física e nunca persistidos. A origem ativa comanda pool, coleta, consultas e ações; dados históricos são isolados pelo identificador imutável do perfil. A migração SQLite preserva o histórico atual em `id=1`. RDS IAM usa TLS com validação do certificado e nome do endpoint. O teste percorre geração do token, TLS, login e uma consulta real.

## Technical Context

**Language/Version**: JavaScript CommonJS no processo principal Electron 44 / Node 24; TypeScript e React 19 no renderer; Next.js 16 com exportação estática  
**Primary Dependencies**: `pg` 8, AWS CLI já instalada no host, Electron IPC/contextBridge, shadcn/ui existente  
**Storage**: `node:sqlite` local (`bdash.sqlite`) para perfis não sensíveis, amostras, logs e preferências; PostgreSQL remoto apenas como fonte monitorada  
**Testing**: `node --test --test-isolation=none`, `tsc --noEmit`, `next build`, teste de Electron empacotado; testes de contrato e integração com adaptador AWS CLI simulado e banco de teste autorizado  
**Target Platform**: Windows desktop inicialmente, inclusive instalador NSIS existente; CLI e rede locais do usuário  
**Project Type**: Aplicativo desktop Electron + Next.js estático  
**Performance Goals**: Troca de perfil visível em até 2 s sem dados cruzados; teste de conexão com tempo limite explícito; coleta 15 s por padrão  
**Constraints**: Sem tokens, credenciais AWS ou senha persistidos; TLS verificado no RDS; uma origem ativa; autorização IAM válida 15 min para novos handshakes; sem execução de shell arbitrário; nenhuma visita aos RDS do usuário em testes automatizados  
**Scale/Scope**: Perfis locais e RDS múltiplos; três origens no cenário de aceitação; uma coletada por vez; preservação integral do histórico v2 dentro da retenção

## Constitution Check

O arquivo `.specify/memory/constitution.md` contém apenas placeholders, sem princípios ratificados nem gates aplicáveis. Antes e após o desenho: **PASS**, sem exceções. As restrições explícitas de [technical-constraints.md](technical-constraints.md) são adotadas como gates do projeto: credenciais fora de SQLite; origem isolada; TLS validado; sem shell; teste PostgreSQL real.

## Project Structure

### Documentation (this feature)

```text
specs/002-configurar-conexoes-rds-iam/
├── spec.md
├── technical-constraints.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── connection-profiles-ipc.md
└── tasks.md              # produzido por $speckit-tasks
```

### Source Code (repository root)

```text
electron/
├── main.cjs               # orquestra origem ativa e registra IPC
├── preload.cjs            # API nomeada para o renderer
├── ipc.cjs                # valida entradas e normaliza erros
├── db.cjs                 # refatorar acesso PostgreSQL por perfil/pool
├── collector.cjs          # ciclo atrelado a perfil + geração
├── storage.cjs            # migração v3+ e consultas escopadas
├── connection-profiles.cjs # cadastro, teste, seleção, lifecycle
└── aws-rds-auth.cjs       # obtenção transitória de token via AWS CLI
lib/
└── dashboard-types.ts     # tipos públicos do contrato
app/
├── page.tsx               # seleção da origem ativa
└── components/            # painel de perfis e formulários shadcn
tests/
├── profiles*.test.cjs     # armazenamento e migração
├── aws-rds-auth*.test.cjs # argumentos, token e erros sanitizados
├── profile-switch*.test.cjs
└── ipc-profiles*.test.cjs
```

**Structure Decision**: Evoluir os diretórios existentes. O processo principal é o único dono do AWS CLI, token, TLS, pool e SQLite. O renderer recebe apenas descritores sem segredos e resultados normalizados. Nenhuma nova biblioteca de gráficos ou serviço de backend é necessária.

## Phase 0: Research decisions

Ver [research.md](research.md) para decisões, fundamentos e alternativas. Não há `NEEDS CLARIFICATION` em aberto.

## Phase 1: Design and contracts

O [modelo de dados](data-model.md) especifica migração transacional e identidade imutável de origem. O [contrato IPC](contracts/connection-profiles-ipc.md) define validação, respostas, invariantes de troca e revisão da ação administrativa. O [quickstart](quickstart.md) descreve como provar os fluxos em ambiente autorizado sem acessar os endpoints RDS do solicitante.

### Sequência de integração

1. Estabelecer esquema multi perfil e migrar `id=1`; assegurar leituras/escritas escopadas com testes de não mistura.
2. Introduzir fornecedor de token IAM via AWS CLI com argumentos separados e política TLS; injetar em configuração `pg` que invoca o fornecedor ao abrir conexão física.
3. Tornar operações de banco dependentes de contexto de perfil, substituindo singleton global; teste de conexão usa cliente temporário e consulta real.
4. Criar controlador de seleção ativa com geração monotônica: parar timer anterior, aguardar coleta em andamento, fechar pool, trocar contexto, iniciar novo coletor. Respostas tardias de geração anterior não alteram o estado visível.
5. Vincular consultas históricas, log, exportação, preferências e auditoria à identidade do perfil. A ação de encerrar sessão inclui identidade da origem observada na confirmação e a revalida antes de atingir o banco.
6. Expor métodos IPC nomeados, telas de gestão e identidade visível no dashboard; adicionar estados de erro e capacidade parcial por perfil.
7. Verificar testes unitários, migração, reconexão após 15 min por relógio simulado, integração autorizada, build e pacote Windows.

### Limites e riscos

- AWS CLI pode não estar no `PATH` do processo empacotado; apresentar erro acionável e testar a descoberta no pacote. Nunca aceitar caminho de executável fornecido pela UI sem revisão do limite de confiança.
- A geração de token pode ter sucesso sem permissão `rds-db:connect`, rede ou usuário habilitado; o teste só é verde após consulta PostgreSQL.
- Alguns RDS fornecem certificados diferentes; distribuir/atualizar cadeia raiz confiável da AWS ou usar arquivo CA indicado pelo usuário, mantendo verificação de host. A origem do bundle e a compatibilidade regional devem ser registradas.
- A migração de `instances` exige reconstruir a tabela com FKs preservadas; executar em transação, verificar `foreign_key_check` e testar com arquivo v2 populado.
- Dados históricos de perfis arquivados permanecem consultáveis apenas por fluxo explicitamente identificado, sem contaminar o perfil ativo.
- Logs CSV locais não são logs RDS. Manter bloco Logs indisponível para perfil RDS até haver fonte suportada.

## Constitution Check after design

**PASS**. O desenho preserva restrições do projeto e não introduz exceção de governança. Plano pronto para `$speckit-tasks`.
