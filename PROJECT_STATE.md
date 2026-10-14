# PROJECT_STATE

## Em preparação — legibilidade global e seleção no modo escuro
- Pedido de 14/10/2026: clarear os textos cinza, aumentar fontes maiores em 10% e menores em 15% em todo o sistema, e substituir a seleção branca da Inbox escura por transparência discreta.
- Implementação: escala global `--text-*` (+15% até 14px, +10% nos tamanhos maiores), utilitários arbitrários e fontes dos gráficos. Raiz em 16px; textos secundários escuros `#b9b6ab`/`#9d998e`; fundo selecionado semântico a 12% de opacidade no escuro, com espelho claro e indicador lateral.
- Validação local: typecheck passou com limite de 8 GB; lint completo terminou sem erros (528 avisos existentes, arquivos funcionais alterados sem avisos); 51 testes relacionados passaram. Compilação Tailwind e navegador confirmaram 11px → 12,65px, 12px → 13,8px, 14px → 16,1px e 20px → 22px. Componente real da Inbox conferido em ambos os temas e em largura de celular, com conversas fictícias e sem transbordo horizontal.
- Evidências locais do componente em `evidence/legibilidade-global/`; não são conferência do aplicativo completo com banco fresco. E2E completo, suíte unitária integral e build ficam a cargo do CI; não foram declarados aprovados localmente.
- Produção ainda usa a imagem anterior. A revisão automática bloqueou abrir o painel Hostinger por falta de autorização explícita para acesso à infraestrutura. Próximo passo: concluir os checks da branch e, após autorização do usuário, publicar a imagem do fork e instalar somente o app na VPS, com backup e pins por digest.

## Em produção — Inbox por aceite e permissões individuais
- PR #6 integrado e publicado em 13/10/2026 (14/10 em UTC), código `864bd67ee6d525416ff6bcdc666de96477fd25c3`. App, worker e scheduler saudáveis, com as imagens do fork fixadas por digest. Ativos, Aguardando, IA, Todos e Fechadas; histórico arquivado incorporado sem exclusão.
- Permissões `all`, `ai`, `closed` separadas do perfil visual, editáveis em Personalizar áreas visíveis na Equipe e nos convites. Gestores/admin têm visão global; supervisores sem concessão veem suas conversas.
- Migration do fork 9003: aceite humano explícito, RLS por estado, proteção da atribuição e de alterações por quem recebeu apenas consulta, aceite de convite atômico e push alinhado à leitura.
- Migração `20261014001000_9003_inbox_aceite_e_permissoes.sql` aplicada em transação antes de iniciar a aplicação nova. SHA-256 conferido: `f7e604f2a30c1bf43bdaac72a6040883cb1ece1cee30d59d9d36c380899457fe`.
- Backup novo validado em `/opt/backups/crm-inbox-20261014-015455`: banco (5,3 MB, gzip conferido), sessões WhatsApp (1016 KB, conteúdo conferido) e configurações. Recibos `deployment-inbox.txt` e `images-after.txt` no mesmo diretório; execução terminou com código zero.
- Apenas `APP_IMAGE`, `WORKER_IMAGE` e `SCHEDULER_IMAGE` mudaram no `.env`; comparação das demais linhas passou. Caddyfile preservado por SHA-256, WhatsApp não reiniciado e demais sistemas da VPS preservados.
- Revisão validada `f61b697`, com árvore idêntica ao commit integrado: verify, desempenho, imagens AMD64/ARM64 e seis partes E2E aprovados. PostgreSQL 15 e 17: 424 arquivos, 3330 testes aprovados, 1 falha esperada e 2 ignorados em cada versão; atualização do kit sobre banco com dados também passou. Sabotagem do filtro por responsável produziu a falha prevista; restaurado o filtro, os testes passaram.
- Conferência em produção: abertura em Ativos, ordem das cinco abas, controles junto a Inbox no editor individual e nos convites, padrão desmarcado para atendentes, aviso de direcionamento em Todos e links antigos `mine`/`archived`. Tela de 390 × 844 conferida e tamanho normal restaurado. Nenhuma permissão de membro nem convite real foi alterado durante a conferência.
- Checkout da VPS avançado por fast-forward para `864bd67`; Caddyfile local modificado e seus backups foram preservados. Não usar atualização oficial que substitua os pins do fork.
- O workflow de corte de release do fork continua sem `RELEASE_APP_ID`/credencial do GitHub App, falha já presente antes desta publicação. O workflow independente de imagens publicou a revisão instalada com sucesso; não foi criada uma tag de versão nesta atualização.

## Base da instalação e atualizações anteriores
- A atualização anterior da interface, em 13/10/2026 pelo PR #4, instalou `c7c8f6c887c4d3a40e494d733741324cfc8c516b`, com app fixado em `ghcr.io/edsonl10/deskcommcrm@sha256:3b9d24c22d48146cbcb292f3c1aff836e6fd03aceb637548d36aa4aeb177e477`. Naquele deploy, worker e scheduler permaneceram na versão anterior por a mudança tocar somente a interface.
- Release oficial `v1.78.0` integrada às melhorias do fork e instalada em 09/10/2026. Naquela atualização, app, worker e scheduler passaram a executar `ce7829f90d6eb7c9626e17c4093dc99574250617`, com imagens do fork fixadas por digest.
- Departamentos, membros Normal/Supervisor, transferência por departamento e participação na distribuição continuam disponíveis. A consulta global de conversas segue as permissões individuais descritas acima.
- Incorporadas as proteções locais de suporte e de autenticação da atribuição por departamento.
- Mantidos os modos oficiais `round_robin`/`load` e o modo personalizado `least_loaded`.

## Ações do atendimento instaladas (13/10/2026)
- Pedido aprovado: remover Arquivar, Marcar como pessoal e Liberar da interface do atendimento. Removida também a nova marcação pessoal na ficha de contato.
- Mantida a recuperação de contatos pessoais anteriores e o acesso ao histórico arquivado. APIs e dados históricos permanecem compatíveis.
- PR #4 integrado e instalado. Conferência pelo site: Arquivar, Liberar e Marcar como pessoal ausentes da conversa; Fechar e Transferir visíveis. Na ficha, Editar visível e Marcar como pessoal ausente.
- Validação local: 34 testes relacionados passaram; typecheck passou com Node limitado a 8 GB; lint dos arquivos funcionais alterados passou. Controle de regressão: restaurar o cabeçalho anterior fez falhar os quatro casos previstos.
- Suíte completa local em Windows interrompida após falhas em outros testes, incluindo scripts Linux. No GitHub, `verify` completo, build e publicação AMD64 do commit instalado passaram. E2E e invariantes de banco ainda rodavam na última medição deste deploy; conferir os runs de `c7c8f6c` antes de afirmar resultado integral.
- Teste preexistente de conversão com data fixa expirada estabilizado (janela de sete dias); 20 testes passaram, sem mudar runtime. Duas verificações E2E passaram a conferir o responsável e a ausência de Liberar.
- Acesso ao terminal web da VPS confirmado pelo painel Hostinger. Backup do banco (5,3 MB, gzip conferido), sessões WhatsApp (1016 KB) e configurações em `/opt/backups/crm-ui-20261013-212957`.
- Somente APP_IMAGE mudou no .env (comparação conferida); Caddyfile preservado por SHA-256. Worker e scheduler seguem saudáveis e WhatsApp não foi reiniciado. Recibo e script de instalação/rollback no mesmo diretório do backup.
- Naquele deploy, o checkout da VPS estava em `a47fec4` com Caddyfile local modificado e o runtime do app vinha da imagem `c7c8f6c` acima. A publicação do Inbox descrita no início deste documento atualizou também esse checkout.

## Decisões aprovadas
- Atualizar pelo repositório oficial preservando as melhorias da instalação.
- A produção só deve receber código e banco compatíveis após backup e validação.
- Migrations exclusivas do fork usam a faixa `9000+`, para evitar colisão com a numeração do produto oficial. As antigas 0485/0486 personalizadas foram renomeadas para 9001/9002; conteúdo funcional preservado e segurança versionada como forward-fix.
- Configurações locais de domínio/Caddy, credenciais e sessão do WhatsApp são preservadas no deploy.

## Validações e pendências
- Erro de mensagens corrigido em produção pela migration oficial 0168: `messages.reply_to_message_id` agora existe. Leitura de mensagens confirmada visualmente.
- Backup verificado do banco e das sessões WhatsApp em `/opt/DeskcommCRM/backups`, prefixo `20261009-180722`; cópias protegidas de código, Caddy e configuração em `/opt/backups/crm-update-20261009`.
- Typecheck e lint dos arquivos adaptados passaram. Testes de roteamento/transferência/idiomas passaram; baseline install e update passaram em Postgres isolado; guarda de migrations passou 109 casos em Linux.
- Deploy concluído sem erros inesperados no baseline; as 170 regras de isolamento declaradas foram conferidas. App, worker e scheduler saudáveis; WhatsApp `WORKING`, dreno de eventos carregado e 39 entradas de cron.
- CI: invariants em Postgres 15/17, seis partes de E2E, perf e inicialização/publicação AMD64/ARM64 passaram no código `ce7829f`. O `verify` completo passou em `71d0490d6`, que só acrescenta o consumidor já existente do roteamento por departamento ao inventário de testes; não altera runtime nem schema.
- Backup imediatamente anterior ao deploy: `db-20261009-185918.sql.gz`, além das sessões WhatsApp e das cópias protegidas de configuração. Conferência de contagens sem redução em mensagens, contatos, leads, departamentos, membros e sessões.
- Verificação visual: histórico da conversa antes afetada carrega; os quatro departamentos e os métodos de distribuição permanecem disponíveis. Caddy preservado byte a byte. A aba original do usuário não foi recarregada para preservar a mensagem em edição.
- Não usar a imagem oficial pura: ela não contém as melhorias de departamentos deste fork.

## Próximo passo
- Para futuras atualizações, mesclar a release oficial neste fork, preservar o baseline e as migrations exclusivas, validar, publicar imagens do fork e atualizar os pins por digest. O `update.sh` oficial sem adaptação usa imagens oficiais e não deve substituir as imagens personalizadas.
