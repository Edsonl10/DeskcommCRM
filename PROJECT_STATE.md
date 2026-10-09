# PROJECT_STATE

## Estado atual
- Release oficial `v1.78.0` integrada às melhorias do fork e instalada em produção em 09/10/2026. App, worker e scheduler executam o código `ce7829f90d6eb7c9626e17c4093dc99574250617`, com imagens do fork fixadas por digest.
- Preservados departamentos, membros Normal/Supervisor, transferência por departamento, participação na distribuição e visibilidade do supervisor.
- Incorporadas as proteções locais de suporte e de autenticação da atribuição por departamento.
- Mantidos os modos oficiais `round_robin`/`load` e o modo personalizado `least_loaded`.

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
