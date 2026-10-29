# Leitura do Inbox por consulta

Destino: núcleo. A leitura comum do Inbox, mensagens e contadores depende desta política mesmo sem a barra Kanban.

## Incidente e recuperação

Em 29/10/2026, após instalar a barra, o usuário relatou lentidão e falha de carregamento em outros computadores. A VPS tinha memória e CPU disponíveis e os três serviços estavam saudáveis, mas o Postgres registrou erros 57014 em `fn_can_read_inbox`, inclusive nos helpers de suporte e de estado da conversa. Saúde HTTP não provava a leitura autenticada. As contagens novas aumentavam a frequência dessa avaliação repetida por linha.

A operação retornou às três imagens da revisão `20a6f01`, preservando a migration 9008, configurações, sessões, Caddy e os demais serviços. Não houve restauração nem exclusão de dados de negócio. A barra ficou temporariamente indisponível; clientes com a página anterior aberta precisam recarregar após preservar rascunhos. O recibo privado fica em `/opt/backups/crm-retorno-kanban-20261029-1210/recibo.json`.

## Contrato

A migration 9009 acrescenta `fn_contexto_de_leitura_inbox()`: identidade, papel de plataforma e vínculos ativos vêm do banco e do JWT autenticado atual. Não aceita pessoa/empresa como argumento e não persiste contexto. A policy de SELECT das conversas chama esse helper em um subselect não correlacionado; o Postgres calcula um InitPlan uma vez por statement.

`fn_leitura_inbox_no_contexto` é invoker e devolve somente uma decisão booleana. O critério compartilhado mantém plataforma, vínculo não revogado, gestor/admin, responsável e permissões independentes Todos/IA/Fechadas. A função canônica `fn_can_read_inbox`, usada nas guardas de escrita e tabelas filhas, usa o mesmo critério com contexto de fonte confiável. Não há leitura privilegiada a partir de contexto fornecido pelo cliente.

O vínculo ativo já implica pertença a `fn_user_org_ids()`, que inclui todos os vínculos ativos: repetir esse helper dentro da checagem por conversa consultava também o suporte sem restringir o resultado. Conversas encerradas usam o mesmo conjunto `closed/archived/resolved` do campo calculado. Todos inclui IA nas não encerradas; só a permissão exclusiva IA precisa consultar o estado calculado para outras conversas. Anon continua sem EXECUTE nos helpers. A função que decide por linha é invoker.

## Sistema Vivo

Entrada: JWT validado e vínculos/permissões atuais em `user_organizations`; saída: SELECT de conversas e leitura das tabelas filhas, incluindo mensagens e contagens consumidas por `ConversationList`, `BarraKanbanInbox` e histórico. Porta: Inbox existente. Configuração: Equipe → Atendimento, já existente; nenhuma configuração nova. A mudança não altera atribuição, aceite, transferência, próximos passos ou IA↔humano.

Leitura pura não cria atividade nem efeito de negócio: erros continuam nos retornos da API e logs do banco, visíveis como falha e Tentar novamente. O laço operacional compara carregamento, erros 57014 e plano autenticado; regressão bloqueia a promoção ou exige retorno às imagens anteriores. Mapa em `docs/architecture/inbox-kanban.architecture.json`.

## Verificação

`tests/invariants/inbox-leitura-por-consulta.test.ts` mede o escopo com RLS real, Todos/IA/Fechadas, proprietário, viewer, gestor, admin, outro tenant, revogação e troca de identidade na mesma conexão. O EXPLAIN ANALYZE da policy real deve conter exatamente um InitPlan, executado uma vez. As guardas de escrita e suporte existentes continuam cobertas pela suíte integral de invariantes. O baseline inclui o bloco idempotente antes da varredura final de anon.

O diagnóstico de produção usou funções temporárias em transações sem commit e somente resultados agregados. A primeira candidata, ainda por linha, mediu 14.620 ms antes e 799 ms depois, sem divergência para o ator medido. A candidata com contexto único mostrou InitPlan e 182,5 ms de execução; a comparação adicional contra a função antiga excedeu 15 s e não constitui prova de paridade. Tempos são pontos sob carga diferente, não garantia nem teste integral de concorrência. O CI e a validação da fonte final devem ser conferidos antes de instalar a correção.
