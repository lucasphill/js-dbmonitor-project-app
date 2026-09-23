# Padrões do projeto DBMonitor

## Propósito e limites

- DBMonitor é um aplicativo desktop de observabilidade PostgreSQL. A interface exibe fatos medidos e distingue dados indisponíveis, parciais e obsoletos.
- Uma origem PostgreSQL fica ativa por vez. Toda coleta, consulta, exportação e ação administrativa deve carregar a identidade do perfil e impedir mistura de dados entre origens.
- O nome público é **DBMonitor**. Identificadores internos antigos (`bdash://`, `window.bdash`, `bdash.sqlite` e `com.bdash.desktop`) só permanecem para compatibilidade; não os use em novos nomes públicos.

## Estrutura e arquitetura

- `electron/main.cjs`: ciclo de vida, janela e registro dos canais IPC.
- `electron/preload.cjs`: API estreita e nomeada para o renderer. Não exponha Node.js, SQL arbitrário nem sistema de arquivos genérico.
- `electron/db.cjs`: conexão PostgreSQL e consultas de monitoramento; use parâmetros, limites e timeouts.
- `electron/storage.cjs`: SQLite local, migrações, retenção e isolamento do histórico por perfil.
- `electron/collector.cjs`, `electron/analytics.cjs` e módulos vizinhos: coleta e agregações fora do renderer.
- `app/`: páginas, componentes, estilos e hooks Next.js. `components/ui/`: componentes shadcn/ui. `lib/`: tipos e formatação compartilhados.
- `tests/`: testes Node para contratos, migração, isolamento, falhas e ações administrativas. `.github/workflows/`: build e publicação.
- O Next.js deve produzir exportação estática; o Electron carrega o conteúdo por protocolo local no pacote. Não introduza servidor de produção desnecessário.

## Pacotes e escolhas técnicas

- Mantenha Electron, Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, Recharts, `pg`, SQLite nativo do Electron e electron-builder como base do projeto.
- Reutilize componentes existentes antes de incluir dependências. Para gráficos, prefira o wrapper de `components/ui/chart.tsx` e Recharts; evite outra biblioteca de gráficos sem necessidade demonstrada.
- Mantenha `package-lock.json` sincronizado com `package.json` e use `npm ci` no CI. Prefira versões compatíveis com Node.js 24 e o runtime do Electron.

## Conexões, dados e segurança

- O primeiro perfil de uma instalação nova é PostgreSQL local (`localhost:5432/postgres`, usuário `postgres`) com a senha de desenvolvimento `password`. Essa senha é pública e serve apenas ao ambiente local; nunca a aplique a endpoints remotos. Outros perfis por senha recebem a senha em memória durante a sessão.
- Não grave senhas, tokens IAM, chaves AWS ou texto de consultas sensíveis no SQLite, logs de aplicação, artefatos ou renderer. Não adicione arquivos `.env` ao projeto.
- RDS IAM exige endpoint original, validação TLS e token gerado no processo principal via AWS CLI. Falhas de autenticação devem indicar a etapa sem revelar credenciais.
- Limite consultas paginadas e custosas; consulte tamanhos de banco apenas sob demanda. Preserve dados úteis quando uma métrica opcional falhar.
- Ações como encerramento de backend devem exigir confirmação explícita, revalidar a identidade da sessão e registrar o resultado. Exportações devem limitar volume e neutralizar fórmulas CSV.
- Migrações SQLite devem preservar histórico e integridade referencial, criar cópia antes de migrar arquivos existentes e incluir teste de regressão.

## Interface e validação

- Exiba origem, unidade, período e estado dos indicadores. Não apresente ausência de permissão ou fonte como zero medido.
- Mantenha a navegação e as tabelas utilizáveis na largura mínima da janela; permita rolagem horizontal em tabelas largas.
- Para mudanças de código, execute `npm run verify`. Para empacotamento, valide o alvo no sistema operacional correspondente; builds de Linux são executados pelo GitHub Actions em Ubuntu.
- Workflows de build apenas disponibilizam artefatos. `release.yml` roda em pushes para `main` e manualmente; se `v<versão>` ainda não existir, valida ambos os pacotes, cria a tag a partir de `package.json` e publica a GitHub Release. Atualize a versão antes de cada nova publicação. Os instaladores pertencem à Release, não ao registry GitHub Packages.
