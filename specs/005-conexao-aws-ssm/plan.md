# Implementation Plan: Conexão AWS via SSM + IAM

**Branch**: `main` (sem nova branch) | **Date**: 2026-10-06 | **Spec**: [spec.md](spec.md)

**Input**: `specs/005-conexao-aws-ssm/spec.md`. O setup retornou `BRANCH=005-conexao-aws-ssm` pela feature ativa; esse valor não corresponde à branch Git real, verificada como main.

## Summary

Adicionar `rds_iam_ssm` aos perfis existentes e um gerenciador SSM no processo principal. Reutilizar CLI, provider IAM, CA RDS, pool pg, coleta e IPC. Separar endereço TCP local do endpoint original usado em autenticação, TLS e histórico. Sem novo SDK AWS ou servidor web.

## Technical Context

**Language/Version**: CommonJS no Electron, TypeScript 5.9 na interface, Node.js 24 para testes.

**Primary Dependencies**: Electron 44.3, Next.js 16.3, React 19.2, pg 8.23.0 no lockfile, SQLite nativo e componentes existentes. AWS CLI e Session Manager plugin são pré-requisitos externos.

**Storage**: SQLite schema atual 3 → 4, somente configuração persistente.

**Testing**: node:test, fakes de processos/rede/tempo, integração PostgreSQL TLS, regressões atuais de perfis/migração/isolamento, aceitação AWS opt-in.

**Target Platform**: Windows e Linux nos alvos atuais de empacotamento.

**Project Type**: Desktop com renderer estático e IPC restrito.

**Performance Goals**: Origem salva em uma ação; 9/10 conexões com dados em 30 s; falha em 60 s; limpeza local em 10 s; 60 minutos sem renovar token manualmente.

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

**Structure Decision**: Estender módulos atuais; um módulo novo isola o processo SSM. Sem outro serviço/projeto.

## Design and Integration

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

## Validation Strategy

- Unitários: args sem shell, validação, buffers, eventos em chunks, spawn/exit, portas, IPv4/IPv6, leases, duplicação, cancelamento/deadline, cleanup Windows/Linux e sucesso tardio.
- Integração fake CLI + PostgreSQL TLS: SNI original pelo IP local, certificado errado recusado, token para destino remoto por conexão física, ausência de segredos em IPC/log/storage/export.
- Migração v1/v2/v3 e instalação nova: backup, IDs/FKs/histórico/preferências/origem ativa e rollback. Transporte editado preserva histórico; identidade alterada arquiva mediante confirmação.
- Controller/IPC/UI: teste durante coleta, cancelamento durante troca, reconectar mesma origem, disconnect+refresh, queda, seleção falha, contexto antigo e shutdown; RDS SSM continua sem CSV local.
- Após implementar: npm run verify, aceitação quickstart, validação dos pacotes Windows/Linux para PATH/plugin/processos. CI sem AWS real; AWS opt-in somente em ambiente autorizado de teste.

## Complexity Tracking

Sem violações. Leases e estado transitório são necessários para testar sem interromper coleta e cancelar operações com segurança.
