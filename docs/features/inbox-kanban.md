# Barra de etiquetas no Inbox

Destino: núcleo opcional. A operação existente funciona com a barra vazia e sem extensão. Modelo visual e implantação autorizados pelo usuário em 28/10/2026.

## Comportamento

- O ícone de três colunas fica abaixo da hora e abre seleção múltipla das etiquetas de conversa. Abrir o seletor não abre a conversa nem marca mensagens como lidas. Concluir aplica; fechar sem concluir descarta.
- A barra combina com a aba, busca, canal, etiquetas gerais, departamento, atendentes, período e não lidas existentes. A seleção de uma etapa consulta somente `conversations.tags`, antes da paginação. Tags de contato continuam disponíveis no filtro geral e não viram etapas do atendimento.
- O número à esquerda é a contagem exata de conversas/cards da etiqueta nos filtros atuais. O vermelho conta conversas com `unread_count_for_assignee > 0`, não mensagens. Os números não são somáveis quando uma conversa tem mais de uma etiqueta.
- Selecionar uma etapa filtra a lista esquerda; selecionar novamente ou limpar retira a etapa. A conversa já aberta continua disponível.
- Administradores escolhem as etiquetas e sua ordem em Personalizar. `organizations.settings.inbox_kanban_barras` contém um padrão e substituições por UUID de departamento; salvar preserva configurações paralelas com compare-and-set. Uma lista vazia é válida. As quatro etapas do modelo são o padrão inicial; as cores configuradas da organização prevalecem.
- A mudança de departamento limpa a etapa selecionada, mantém os demais filtros e usa a barra desse departamento. Com vários departamentos no filtro avançado, o seletor indica a seleção múltipla e usa a barra padrão.

## Escopo e persistência

`conversations.tags` permanece o conjunto ativo, filtrável pelos contratos existentes. A migration 9008 instala um trigger de atribuição: na troca A → B, guarda o conjunto de A em `conversations.metadata.inbox_tags_por_atendente` e restaura somente o conjunto anterior de B nesta mesma conversa; se não existir, B recebe conjunto vazio. O retorno a A restaura o seu conjunto. Sem atendente, o conjunto fica vazio; rótulos anteriores sem responsável ficam preservados no histórico, sem serem herdados pelo novo atendente. Contatos e cards de negociação não são reetiquetados nem movimentados.

O mapa é interpretado exclusivamente pelo trigger. A anonimização existente limpa `metadata`; atribuir depois de anonimizar não restaura conjuntos. Nenhuma tabela/grant de leitura é acrescentado. O trigger é invoker, sem bypass de RLS. Reaplicar o baseline preserva dados.

O seletor e o editor lateral enviam responsável e etiquetas observados. Conflitos retornam 409; não anunciam sucesso nem sobrescrevem outro atendimento. Viewer e suporte de consulta não recebem ação de edição; servidor conserva RBAC, suporte, sessão e organização. A configuração exige admin. Gestores podem editar as etiquetas do responsável atual, com o seu nome exibido.

## Integração e Sistema Vivo

Entrada: vocabulário/configuração por departamento e eventos de `conversations`. Saída: barra, lista, editor lateral e contagens. Mutação de etiquetas usa a auditoria/timeline existente de `patchConversationHandler`; configuração emite `settings.inbox_kanban_updated`. Porta: Inbox existente. Configuração: Personalizar, com erros e possibilidade de tentar novamente. Atualizações de etiquetas/leitura/atribuição invalidam as contagens; eventos recebidos recarregam, e a consulta tem revisão periódica de segurança.

Não há nova ação de IA, envio automático, demanda ou laço de decisão automático. O atendimento, aceite, resumo de transferência e próximo passo existentes continuam consumidores do mesmo objeto de conversa. O laço de erro é operacional: 409 exige reler o atendimento; falha de gravação mantém o menu e o rascunho, com erro visível; corrigir e concluir reconsulta lista/ficha/contadores. Mapa: `docs/architecture/inbox-kanban.architecture.json`.

## Verificação

- Testes de contrato, componente e API cobrem filtros, contadores distintos, seleção múltipla, estado sem atendente, gravação por departamento, preservação de settings, RBAC/suporte e concorrência.
- `tests/invariants/inbox-kanban-atendente.test.ts` mede atribuição e retorno A/B, conversa distinta, isolamento e anonimização no Postgres real do baseline.
- `tests/e2e/inbox-kanban.spec.ts` dirige a tela num banco fresco: conta conversas e não mensagens, exclui outro tenant e etiquetas globais do contato, filtra, aplica etiquetas pelo ícone sem marcar como lida, confere transferência/retorno e personalização com recarga e tela de 390 px.
- Este ambiente não tem Docker; a tentativa local de `pnpm test:db` recusou por ausência do comando. Prova nativa de banco/interface depende do CI e não deve ser declarada aprovada antes de passar.
