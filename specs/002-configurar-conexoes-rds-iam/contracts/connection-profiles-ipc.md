# Contrato IPC: perfis de conexão

Todos os métodos são funções nomeadas de `window.bdash` expostas pelo preload. Somente a janela principal de origem autorizada pode invocá-las. O processo principal valida entradas, seleciona a origem, administra CLI/pool/SQLite e devolve objetos serializáveis. Envelope IPC interno existente: `{ok:true,data}` ou `{ok:false,error:{code,message}}`; o preload resolve ou rejeita sem expor detalhes internos.

## Tipos públicos (conceituais)

```ts
type AuthMode = "legacy_env" | "session_password" | "rds_iam";
type ConnectionProfile = {
  id: number; label: string; host: string; port: number; database: string;
  dbUser: string; authMode: AuthMode; awsRegion: string | null;
  awsProfile: string | null; tlsCaMode: "bundled" | "custom" | null;
  archivedAt: string | null; createdAt: string; updatedAt: string;
};
type ProfileDraft = Omit<ConnectionProfile,
  "id" | "archivedAt" | "createdAt" | "updatedAt"> & { tlsCaPath?: string | null };
type ActiveProfile = { profile: ConnectionProfile; generation: number };
type ConnectionTest = { status: "success" | "failed"; stage:
  "aws_identity" | "token" | "network" | "tls" | "database_auth" | "query" | "complete";
  checkedAt: string; profileId?: number; database?: string; dbUser?: string;
  serverVersion?: string; message: string };
```

Nenhum tipo contém token, senha, credencial AWS, stdout ou stderr. O campo `tlsCaPath` é aceito somente para CA selecionada explicitamente e validada no processo principal; não contém chave privada. `transientPassword` mencionado abaixo é um argumento de ida de um pedido explícito, nunca aparece em retorno nem armazenamento.

## Métodos novos

| Método | Entrada | Saída | Regra |
| --- | --- | --- | --- |
| `listConnectionProfiles()` | nenhuma | `{profiles: ConnectionProfile[], activeProfileId: number, generation: number}` | Apenas ativos e, quando pedido, arquivados identificados; sem segredos. |
| `testConnectionProfile(draftOrId, transientPassword?)` | perfil salvo `id` ou `ProfileDraft`; senha só em `session_password` | `ConnectionTest` | Teste não salva nem ativa. Sucesso requer handshake TLS, login e consulta real; falha retorna etapa sanitizada. |
| `createConnectionProfile(draft)` | `ProfileDraft` | `ConnectionProfile` | Valida e salva metadados. Senha nunca faz parte do draft persistível. |
| `updateConnectionProfile(id, changes, confirmNewOrigin?)` | id + alterações permitidas | `{profile, archivedProfileId?}` | Só rótulo mantém id; qualquer mudança de identidade requer confirmação e cria novo id/arquiva o anterior. |
| `activateConnectionProfile(id)` | id existente não arquivado | `ActiveProfile` | Serializa troca; para/aguarda coletor, encerra pool anterior, muda seleção e inicia nova coleta. Não exige teste prévio bem-sucedido; falha de rede fica no diagnóstico. |
| `archiveConnectionProfile(id, confirm)` | id e confirmação explícita | `{archivedId, activeProfileId}` | Não apaga histórico; se ativo, exige selecionar outro primeiro. |
| `setSessionPassword(id, password)` | id `session_password` e senha transitória | `{accepted: true}` | Mantém somente memória do processo principal até fechar app/arquivar perfil; nunca ecoa senha. |

### Validação de entrada

`id` positivo e inteiro; `label` 1–80 caracteres; host DNS/RDS ou IP/localhost permitido no modo senha, sem esquema, porta, slash ou espaços; porta 1–65535; `database` e `dbUser` 1–63 caracteres sem NUL; região AWS padrão `^[a-z]{2}(?:-[a-z]+)+-\d+$`; `awsProfile` nome curto sem caracteres de controle ou separadores de argumento. Modo IAM exige endpoint RDS real, região, usuário e TLS; proíbe password e não aceita desabilitar verificação. `legacy_env` reservado ao perfil migrado id 1. Valores desconhecidos são rejeitados, não repassados à CLI/driver.

### Categorias de erro estáveis

`INVALID_INPUT`, `PROFILE_NOT_FOUND`, `PROFILE_ARCHIVED`, `PROFILE_CHANGED`, `AWS_CLI_NOT_FOUND`, `AWS_IDENTITY_UNAVAILABLE`, `TOKEN_GENERATION_FAILED`, `NETWORK_UNAVAILABLE`, `TLS_VALIDATION_FAILED`, `DATABASE_AUTH_FAILED`, `DATABASE_PERMISSION_DENIED`, `CONNECTION_TIMEOUT`, `INTERNAL_ERROR`. Mensagens em português orientam ação; nenhum erro contém token, comando completo, stdout/stderr ou senha. A ausência de CLI no pacote Windows é diagnosticável.

## Métodos existentes afetados

- `getOverview`, `getSessions`, `getDatabaseActivity`, `getPerformance`, `getLogs`, `getDiagnostics`, `getPreferences`, `refreshNow`, `updatePreferences`, `exportFiltered` e `getDatabaseStats` usam o perfil capturado no início da chamada. Cada resposta acrescenta `profileId` e `generation` ou `sourceContext:{profileId,generation}` sem alterar os campos existentes; renderer ignora respostas que não correspondam à seleção atual.
- Toda leitura histórica, exportação e retenção filtra pelo `profileId` capturado. `getLogs` para RDS sem fonte própria retorna `unavailable` e razão, independentemente do caminho CSV configurado no perfil local.
- `revealSessionDetails` e `terminateSession` recebem, além de PID e `backendStart`, `{profileId, generation}` da linha/diálogo. O processo principal rejeita com `PROFILE_CHANGED` se a origem ativa mudou, antes de qualquer consulta ou encerramento; continua revalidando PID, início, permissão e proteção da própria sessão na origem correta.
- `getPreferences`/`updatePreferences` tornam-se por perfil. O painel identifica a origem na edição; atualização iniciada antes da troca não altera preferências de outra origem.

## Invariantes de segurança e concorrência

1. UI não informa executável nem argumentos arbitrários de CLI; main monta vetor fixo de argumentos e executa sem shell.
2. Uma geração ativa é única. A troca incrementa geração antes de expor novo perfil; requisições anteriores não podem atualizar tela nova nem encerrar sessão da nova origem.
3. Testar um draft não inicia coletor e fecha seu cliente/pool temporário no sucesso ou erro.
4. O token IAM é obtido a cada conexão física do pool; não é armazenado em perfil, SQLite ou IPC. O teste também usa token próprio.
5. Ação de arquivar é confirmada; purga definitiva de dados, se oferecida, tem outro comando e confirmação específica, nunca é efeito colateral implícito.
