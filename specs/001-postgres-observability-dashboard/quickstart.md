# Guia de validação ponta a ponta

## Pré-requisitos

- Windows com Node/npm e dependências do projeto instaladas (`npm install`).
- PostgreSQL local acessível pela configuração `.env` do boilerplate; usar sessão de teste descartável para validar encerramento. A conta precisa de permissão suficiente apenas para os cenários que exigem visibilidade e terminação.
- Para latência agregada e logs, preparar separadamente instância de teste com `pg_stat_statements` e fonte CSV estruturada. A instância atual não tem essas capacidades ativas; o estado indisponível também é parte da validação.

## Iniciar e verificar

1. Executar `npm run typecheck` e `npm run build`.
2. Executar `npm run dev`; abrir Visão geral. Esperado: conexão, última coleta, idade, cartões, ao menos dois gráficos temporais, tabela de bancos e estado/fonte de cada bloco. Aguarde duas coletas para verificar deltas.
3. Abrir Conexões com pelo menos duas sessões de teste. Filtrar banco/usuário/estado, ordenar e paginar. Verificar PID, aplicação, espera e query ativa; a duração da query deve aparecer apenas quando a sessão estiver `active`. Revelar texto/cliente por ação explícita.
4. Abrir Bancos e Desempenho; alternar 1 h, 24 h, 7 d e intervalo personalizado. Verificar ranking por delta de transações, gráficos com unidade e lacunas após reset. Duração da query ativa, espera e tempo da coleta são valores separados.
5. Sem `pg_stat_statements`, verificar mensagem de pré-requisito e ausência de zero fabricado para latência agregada. Em ambiente de teste com extensão instalada/carregada, produzir consultas e verificar contagem e tempo agregado.
6. Abrir Logs sem fonte; verificar “fonte não configurada”. Em ambiente de teste com CSV estruturado, configurar fonte, emitir evento, filtrar, simular rotação e confirmar ausência de duplicação.
7. Na tabela Conexões, escolher sessão cliente descartável. Conferir detalhes do diálogo; cancelar e provar que ela persiste. Reabrir e confirmar; verificar que apenas o backend escolhido termina, o resultado é reportado e a tabela atualiza. Repetir com sessão já terminada, identidade antiga/PID reutilizado, processo protegido e usuário sem permissão; nenhum caso deve alegar sucesso ou terminar outro alvo. Consultar auditoria local sanitizada.
8. Abrir Diagnóstico/Configuração, alterar intervalo e retenção, forçar falha temporária do PostgreSQL, verificar dado `stale`, motivo e tentativa manual. Reiniciar app e verificar histórico e preferência mantidos; períodos fechados aparecem como lacunas.
9. Exportar filtro de tabela e logs para CSV; conferir recorte, cabeçalhos e ausência de senha. Validar paginação com volume relevante.
10. Executar `npm run dist` e abrir o pacote Windows. Repetir abertura, leitura SQLite em `userData`, gráficos, tabelas e encerramento de sessão de teste. Confirmar que o renderer não recebe credenciais.

Os estados, unidades e identidades usados nestes cenários estão definidos em [data-model.md](data-model.md) e [contracts/desktop-ipc.md](contracts/desktop-ipc.md).
