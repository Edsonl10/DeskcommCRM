# PROJECT_STATE

## Em validação — autoria e clique nas citações (19/10/2026)
- Pedido: mostrar o nome do usuário em vez de Atendente e preservar a autoria após transferência; clicar em citação do cliente ou usuário deve abrir a original.
- A API do histórico enriquece linhas já autorizadas por RLS com o nome do emissor gravado em cada mensagem; não consulta o dono atual. Sem schema novo e sem reescrita de mensagens.
- A citação mantém um botão mesmo fora das páginas carregadas. O clique carrega o histórico até a original, centraliza e destaca; oferece cancelamento e informa ausência/falha. Troca de conversa invalida pedidos anteriores.
- Validação local: 53 casos em sete arquivos relacionados e 26 de idioma aprovados. Controle negativo: retirar o nome e o clique fez falhar os dois casos previstos; restaurados os consertos, os dois passaram. Lint dos arquivos funcionais sem avisos; lint completo sem erros, com avisos existentes; auditorias de canal/papel e fragmentos de versão aprovadas. Typecheck final aprovado com heap de 6 GB (o limite padrão de 2 GB esgotou).
- PR #19 publicado, fonte `c3fb89784b819f31bdaba901f2a33ee250473342`: verify completo e invariantes PostgreSQL 17 com atualização sobre banco com dados aprovados (39243703408); build (39243703355) e imagens AMD64/ARM64 (39243703381) aprovados. A suíte completa local foi interrompida; o CI completou essa medida.
- E2E 39243703420: o caso com dados sintéticos, mais de 50 mensagens e transferência por RPC passou em 9,7 s. Os dois casos existentes de responder/cancelar e trocar de conversa também passaram. A parte 3 apontou uma expectativa antiga de Você/Atendente no spec de origem; a tela já trazia E2E Agent. Spec atualizado para exigir os nomes reais de ambos os emissores, recusar nomes trocados e preservar as verificações de IA, celular e entrada. Nova rodada completa pendente antes da integração/instalação.
- Publicação e instalação autorizadas explicitamente pelo usuário em 19/10/2026. Branch `fix/autoria-e-citacoes`; produção e banco ainda não alterados. Backup de banco, sessões WhatsApp e configurações conferido; instalação preparada para trocar somente o app, preservando os demais serviços e o Caddyfile local.
- Destino: núcleo. Entrada: histórico autorizado e identidade do emissor; saída: MessageBubble/ChatThread em Inbox. Auditoria de envio/transferência existente preservada; navegação é leitura. Falha visível com nova tentativa fecha o retorno humano. Sem configuração ou nova peça de arquitetura.

## Em produção — reabrir e assumir / aviso de contato ocupado
- Pedido de 16/10/2026: mostrar Reabrir aos atendentes com acesso à conversa fechada. Decisão explícita: quem reabre assume o novo atendimento.
- RPC 9006 reúne reabertura, atribuição, pausa da IA, aceite e evento em uma transação; revalida papel, suporte, MFA comprovada, leitura, revisão e estado terminal. Não toma conversa aberta. Migration + baseline precedem a aplicação compatível.
- Contatos: atalho existente e Iniciar conversa informam o nome de outro responsável em atendimento aberto, sem navegar para a tela vazia ou transferir. Consulta exclui pessoal/anonimizado/mesclado e preserva RLS do histórico.
- PR #17 publicado com autorização explícita do usuário. Fonte funcional `18088e5317c5303c5539c2a6cf9b5c978e132906`: verify completo (38937587829), build (38937587732), imagens AMD64/ARM64 (38937587892) e distribuição (38937587894) aprovados. Unitários novos passaram; não houve controle negativo local. O registro posterior altera apenas documentação e capturas, sem mudar código executável ou testes.
- PostgreSQL 15/17 aprovados no run 38937587829: 426 arquivos, 3346 casos aprovados, 1 falha esperada e 2 ignorados por versão. Os seis casos da RPC cobrem reabertura/aceite, revisão/estado, leitura, papel/revogação, MFA e isolamento. Inventário da RPC de sessão e atualização do kit sobre banco com dados também aprovados.
- As seis partes E2E passaram no run 38937587757, com 484 casos aprovados. O novo caso passou em 11 s: atendente reabre e assume; contato ocupado avisa o nome, preserva o responsável e mantém o operador em Contatos. Capturas sintéticas conferidas e versionadas em `evidence/reabertura-contato-ocupado/`: conversa aberta com Ana Teste como responsável e aviso de atendimento com Maria Teste em Contatos. O teste existente de encerramento/reabertura também passou.
- A revisão final `6d8aae7fefbd88ddc284ccc5ac4262612b3a1202` passou novamente em verify e PostgreSQL 15/17 (38941056293), build (38941056345), imagens AMD64/ARM64 (38941056269), distribuição (38941056275) e seis partes E2E (38941056331). PR #17 integrado em `30938d4abc4530b1c4a0b305723e8f654d556748`, com árvore idêntica à revisão validada.
- Instalação autorizada explicitamente em 16/10/2026 e concluída: app `6d8aae7`, fixado em `ghcr.io/edsonl10/deskcommcrm@sha256:80a37042e6069ff9084f0316c62f3af98dd72200f9aaf281d6be32d6c8e7f0a6`. Imagem AMD64 publicada no run 38943813119; código da imagem contido na main. Saúde interna e HTTPS públicas conferidas como healthy na revisão instalada.
- Backup validado antes da troca em `/opt/backups/crm-reabertura-20261016-175722`: banco (14 MB, gzip conferido), sessões WhatsApp (1,3 MB, tar conferido) e configurações. Scripts, recibo `deployment-ui.txt`, hashes e comparações ficam no mesmo diretório protegido. Execução terminou com `DEPLOY_REABERTURA_OK`.
- Migration 9006 aplicada em transação antes de iniciar a aplicação; SHA-256 `7b9a315d23e66f5d3afe14afc451dbf4ea29f14967632d8fcb02b4768278e4a6` conferido. ACL autenticada, bloqueio anônimo e guarda MFA verificados após a aplicação. Contagens sem redução em mensagens, contatos, negócios, departamentos, membros e canais.
- Somente APP_IMAGE mudou na configuração (comparação das demais linhas aprovada). Caddyfile preservado por SHA-256; worker, scheduler, WhatsApp, Redis e SRH conservaram os mesmos IDs e imagens. Worker/scheduler seguem na revisão `868c906`; a migration é aditiva e a mudança de comportamento pertence à UI/API do app. Checkout da VPS avançado por fast-forward até `30938d4`, preservando o Caddyfile local.
- Conferência em produção: Reabrir visível na conversa fechada; o atalho de um contato ocupado mostrou o nome da responsável e manteve a página em Contatos. Nenhuma conversa real foi reaberta ou transferida durante a conferência. A execução completa com aceite foi medida com dados sintéticos no CI. A aba original do usuário foi preservada.
- Local: instalação de dependências interrompida por HTTP 403 em TypeScript; sem Docker. Sintaxe e diff conferidos; validação completa executada no GitHub. Não usar a imagem oficial pura nem substituir os pins por tags móveis.

## Pronto para publicação — atendimento centralizado na Equipe
- Pedido de 14/10/2026: retirar a distribuição em Configurações se duplicasse Equipe.
- CONFIRMADO: os dois formulários escreviam mode, max_retries e backoff_seconds na mesma API. Responsáveis por canal e participantes do departamento são filtros complementares.
- Todos os ajustes existentes de atendimento foram reunidos em Equipe → Atendimento; removidos o RoutingCard repetido e a entrada Distribuição de atendimento no hub de Configurações. O endereço antigo redireciona para a aba Atendimento.
- Responsáveis por número, visibilidade do CRM, ajustes da IA e assinatura continuam acessíveis. APIs, dados, permissões e algoritmo de distribuição preservados.
- Validação local: 41 testes relevantes passaram, typecheck e verificações de canal/papel passaram; lint completo terminou sem erros, com avisos preexistentes. A suíte completa no Windows foi interrompida após falhas de ferramentas/caminhos nas cercas; a validação completa e a prova visual serão feitas pelo CI Linux.
- Código `a15092f9c0fcb3d5fd5b9b0a4d05ea707d0362d0` validado no PR #14: verify completo em quatro partes (run 38639861760), invariantes PostgreSQL 17, build (38639861767), imagens AMD64/ARM64 (38639861748) e todas as seis partes E2E (38639861803) aprovados. Não houve falhas; 23 checks concluíram com sucesso e quatro passos condicionais foram ignorados. Registro posterior altera apenas este estado e a captura, sem mudar código executável ou testes.
- Revisão integrada `72fa42f332998d7a1dfde0b3668eb537d732d58a` aprovada em 15/10/2026: CI completo e invariantes PostgreSQL 17 (38721673644), build (38721673765), imagens AMD64/ARM64 (38721673649) e seis partes E2E (38721673795); 23 checks aprovados e três passos condicionais ignorados. Integração documental posterior do PR #15 preserva o mesmo código executável e testes.
- Controle de regressão: reintroduzir a porta duplicada fez falhar exatamente 1 de 7 casos de navegação; restaurado o conserto, os 7 passaram. Evidência com dados fictícios em `evidence/comunidade-360/task10-routing-policies-desktop.png`, gerada pelo teste de roteamento por número no CI.
- Usuário autorizou explicitamente em 15/10/2026 o acesso administrativo, backup e instalação. Publicação pendente; integração da main atual preserva a distribuição por departamento do PR #13. Instalar a versão compatível preservando configurações, dados e WhatsApp.
- Destino: núcleo, pois a organização continua operando sem extensões.

## Integrado — entrada e distribuição por departamento
- Conversas novas individuais sem dono recebem o departamento padrão ativo; vínculos explícitos prevalecem e eventos anteriores são preparados sem transferir conversas com dono.
- Cada setor usa seus participantes e método; Só online, jornadas, capacidade e fidelização são respeitados. Sem setor, preserva-se a política do canal.
- Migration 9005 e baseline fornecem preparação e reserva privadas; rodízio serializado por setor e capacidade global por pessoa. Distribuição mantém aceite nulo, pausa IA e aparece em Aguardando; cabeçalho mostra o departamento.
- Cobertura: carregador de elegíveis, cabeçalho, invariantes de entrada/concorrência/configuração/ACL e E2E de fila pessoal com transferência a outro setor.
- Validação do PR #13: verify, invariants em PostgreSQL 15/17 (3.340 testes aprovados por versão), seis partes de E2E, perf e builds AMD64/ARM64 passaram no head `f59c9895ead04a4abdb5276bd36c83a4455326f0`. Integrado em `868c906c606bdd098a7214f1667030283fa40c98`. Capturas fictícias em `evidence/distribuicao-por-departamento/`; jornada J44 no mapa de testes.

## Integrado — atendimento sem limite de quantidade
- Pedido de 14/10/2026: retirar o limite de conversas dos atendentes.
- Capacidade zero significa Sem limite na tela Equipe → Atendimento, no carregador de elegíveis e na reserva atômica do banco. Disponibilidade, jornada, responsáveis por canal e limites positivos continuam vigentes.
- Migration exclusiva 9004 e apêndice idempotente no baseline preservam os valores existentes; a ativação na organização deve ocorrer depois de banco, app, worker e scheduler compatíveis.
- Esta alteração trata do limite por quantidade. As regras de disponibilidade, jornada, responsáveis por canal e vínculo de departamento seguem independentes.
- PR #11 integrado em `ddb2daec5aff138806947e8d29e2a5292b822ba0`. A revisão final `1fef77f` passou em verify, invariantes PostgreSQL 15/17, E2E, build e imagens. A evidência fictícia está em `evidence/comunidade-360/atendimento-sem-limite.png`.
- As imagens da revisão integrada foram publicadas pelo workflow `38631223308`. Para instalar: backup validado, atualização compatível do banco/app/worker/scheduler e ativação de Sem limite em Equipe → Atendimento.

## Em produção — legibilidade global e seleção no modo escuro
- Pedido de 14/10/2026: clarear os textos cinza, aumentar fontes maiores em 10% e menores em 15% em todo o sistema, e substituir a seleção branca da Inbox escura por transparência discreta.
- Implementação: escala global `--text-*` (+15% até 14px, +10% nos tamanhos maiores), utilitários arbitrários e fontes dos gráficos. Raiz em 16px; textos secundários escuros `#b9b6ab`/`#9d998e`; fundo selecionado semântico a 12% de opacidade no escuro, com espelho claro e indicador lateral.
- Textos auxiliares das propostas e rótulos dos eixos dos gráficos usam a cor semântica do tema; avisos sobre superfície clara mantêm a cor de contexto legível.
- PR #8 implementa a interface; PR #9 estabiliza a pré-condição do E2E de convites. App instalado em 14/10/2026 na revisão `c31bae75fd440db5e85a6f5b0e82a7c966324b71`, fixado em `ghcr.io/edsonl10/deskcommcrm@sha256:4a55e8d57d055dd87f7f6484a94cc51d744646ac134e1ce2e5c4658dc5d4bdfb`.
- Validação final dessa revisão na main: verify e invariantes PostgreSQL 15/17 (run 38577590944), desempenho (38577590782), imagens e inicialização AMD64/ARM64 (38577591016) e todas as seis partes E2E (38577590699) aprovados. O caso de revogar convite passou em 8,8 s após aguardar a tabela de membros e exigir a opção inteira no viewport; a tabela antes ainda carregava quando o menu era aberto. A rodada duplicada do PR já integrado foi cancelada para liberar os runners para a main.
- Backup validado antes da instalação em `/opt/backups/crm-legibilidade-20261014-144048`: banco, sessões WhatsApp e configurações, com gzip/tar conferidos. Script e recibos `deployment-ui.txt`/`images-after.txt` guardados no diretório; execução terminou com `DEPLOY_UI_OK`.
- Somente `APP_IMAGE` mudou no `.env` (comparação de bytes aprovada); Caddyfile preservado por SHA-256. App saudável na revisão acima; worker/scheduler continuam saudáveis na revisão `864bd67`, com os mesmos IDs de contêiner. WhatsApp não reiniciado; nenhuma migração aplicada. Checkout da VPS avançado por fast-forward até `c31bae7`, preservando o Caddyfile e seus backups locais.
- Conferência em produção: menu 14px → 16,1px, corpo 16px → 17,6px, cinzas `#b9b6ab`/`#9d998e` e fundo selecionado escuro calculado com alpha 0,12. Sem transbordo horizontal. Aba original atualizada após verificar ausência de rascunho; preferência Sistema restaurada após a conferência escura. Evidências versionadas em `evidence/legibilidade-global/` usam conversas fictícias.
- Publicação autorizada pelo usuário e realizada após as validações finais passarem. O corte automático de tags segue sem a credencial do GitHub App, falha anterior a este trabalho; a imagem instalada foi publicada pelo workflow independente. Não houve mudança de credenciais nem de permissões de membros.

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
