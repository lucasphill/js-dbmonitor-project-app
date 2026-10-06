# Contract: Importação de comando SSM

**Status**: revisão implementada e validada localmente. FR-018–FR-024; US4; SC-007–SC-009.

## API nomeada e fronteira

IPC `profiles:import-ssm-command`; preload `importSsmConnectionCommand(text: string): Promise<SsmCommandImportResponse>` em window.bdash. Mesmo envelope/gate de origem e mainFrame dos canais atuais. Nenhum canal genérico, processo, rede, controller, storage ou fila de seleção acionado por importar.

Entrada única string até 16.384 bytes UTF-8, sem NUL/caracteres de controle exceto tab e LF/CRLF de formatação suportada. Guardar tamanho no main, independentemente de limites visuais. Handler recebe texto, parser valida, retorna resultado; não ecoa texto no envelope de erro ou logs.

Preload preserva o envelope sanitizado `{ok:true,data:SsmCommandImportResult}` / `{ok:false,error:{code,message}}` nesta operação. O formulário lê códigos no objeto resolvido: erros rejeitados pela contextBridge não preservam propriedades extras de Error (observado no ensaio real Electron). As outras APIs permanecem compatíveis.

Sucesso em data: `{patch, presentFields, missingFields}` conforme data-model.md. Somente seis campos de patch permitidos; nenhum default implícito, authMode, nome, banco, usuário, TLS ou texto bruto no resultado. Comando incompleto com prefixo/documento corretos pode produzir patch vazio e missingFields; valores presentes inválidos falham sem patch. UI mostra o que falta e pode continuar manualmente.

## Gramática limitada

- Executável literal `aws` ou `aws.exe`, case-sensitive; nenhum caminho, alias, sudo ou prefixo de ambiente.
- Próximos tokens exatamente `ssm start-session`.
- Opções allowlisted: `--region`, `--target`, `--profile`, `--document-name`, `--parameters`. Ordem livre, cada opção no máximo uma vez. Aceitar `--nome valor` ou `--nome=valor`.
- Documento obrigatório, valor exato `AWS-StartPortForwardingSessionToRemoteHost`.
- Aspas simples/duplas delimitam literais; concatenação de segmentos literais permite `host="..."`. Não expandir variáveis nem executar conteúdo. Escape restrito à formatação de aspas/literais permitidos, nunca remover marcadores proibidos para transformá-los em entrada válida.
- Fora de aspas, barra invertida ou acento grave imediatamente seguida de LF/CRLF representa continuação. Acento grave em outros lugares é recusado. Linha nova sem continuação não inicia outro comando; rejeitar linhas independentes. Espaços/tab e whitespace inicial/final são aceitos.
- `--parameters` aceita shorthand com chaves host/portNumber/localPortNumber separadas por vírgula, valor literal simples ou lista com uma string; aceitar aspas nos valores. Alternativa JSON objeto, com mesmos três nomes, valores string ou array com uma string. JSON externo pode estar envolto em aspas de terminal. Não aceitar números JSON, null, objetos internos, listas vazias/múltiplas nem arquivos `file://`/`fileb://`.
- Detectar chaves duplicadas em shorthand e JSON antes de perder informação; chaves JSON escapadas são decodificadas para comparação (ex.: host e h\u006fst são duplicadas). Rejeitar conteúdo residual após objeto/argumentos.
- Recusar `;`, `&&`, `||`, pipes, redirecionamentos, substituição de comando, variáveis/expansão, wrappers ou múltiplos comandos; rejeitar parâmetros/opções desconhecidos e credenciais. Caracteres proibidos não se tornam seguros por estar entre aspas.
- Valores passam pelas regras atuais de endpoint RDS, região, perfil AWS, EC2 target e portas. Endpoint/região coerentes quando ambos presentes; nenhuma consulta DNS/identidade externa.

A aplicação aceita somente esta gramática, não toda a sintaxe Bash, PowerShell ou AWS CLI.

## Mapeamento

| Entrada | Patch |
| --- | --- |
| --region | awsRegion |
| --target | ssmTarget |
| --profile | awsProfile |
| parameters.host | host |
| parameters.portNumber | port (inteiro) |
| parameters.localPortNumber | ssmLocalPort (inteiro) |

Documento não é campo configurável. Campos ausentes ficam fora do patch. missingFields contém somente obrigatórios de transporte ausentes (host, awsRegion, ssmTarget); campos pessoais/banco/usuário são determinados pela combinação com draft.

## Erros seguros

| Código | Significado |
| --- | --- |
| SSM_IMPORT_INVALID_INPUT | Tipo, vazio, controles ou tamanho inválidos |
| SSM_IMPORT_INVALID_SYNTAX | Aspas, JSON/shorthand, argumentos/valores ou duplicação inválidos |
| SSM_IMPORT_UNSUPPORTED_COMMAND | Executável/operação/documento/opções fora do contrato |
| SSM_IMPORT_UNSAFE_CONTENT | Encadeamento, expansão, execução embutida ou credenciais |
| INVALID_INPUT | Valor de campo fornecido inválido, com nome fixo do campo |

Mensagens fixas/allowlisted; nunca incluem argumento desconhecido, fragmento de texto, token de lexer ou stack. Esses códigos não são falhas da conexão nem modificam ConnectionRuntime. Origem não autorizada continua erro do gate IPC existente.

## Prévia e aplicação

1. Importar cria prévia ligada à revisão do texto e do draft; draft anterior intacto.
2. Mostrar valores extraídos, mudanças de valores preenchidos e campos ausentes; não mostrar valores fictícios como importados.
3. Aplicar explicitamente faz merge apenas das chaves presentes, revalida campos/cross-checks fornecidos e preserva ausentes. Campo obrigatório ainda vazio não bloqueia preparar draft; impede teste/salvar pela validação atual. Erro de combinação não aplica nada.
4. Nome/banco/usuário/CA preservados. Defaults atuais do draft novo (porta remota 5432, local automática, identidade padrão) não são retornados pelo parser. Em edição, valor omitido não reseta preferência.
5. Aplicar cancela teste pendente, limpa resultado e texto/prévia; não salva/reconecta. Salvar usa regras de identidade/histórico atuais.
6. Alterar texto/draft/perfil/modo ou fechar descarta prévia e invalida resposta pendente. Estado atualizado somente para pedido/revisão atual. Importação indisponível durante salvar/testar; sair/descartar mantém valores anteriores.
7. Tela e bridge não persistem texto em cache, telemetry, localStorage, logs ou exports. Nenhuma transição do runtime ou generation da origem é causada pela importação.

## Exemplo sanitizado

```text
aws ssm start-session --region sa-east-1 --target i-0123456789abcdef0 --document-name AWS-StartPortForwardingSessionToRemoteHost --parameters host="test.abc.sa-east-1.rds.amazonaws.com",portNumber="5432",localPortNumber="15432"
```

Patch esperado: host test.abc.sa-east-1.rds.amazonaws.com, port 5432, awsRegion sa-east-1, ssmTarget i-0123456789abcdef0, ssmLocalPort 15432; sem awsProfile. Nenhum comando executado; banco/usuário completados no formulário.
