# Inbox: aceite e permissões individuais

As abas são Ativos (padrão), Aguardando, IA, Todos e Fechadas. `inbox_state(conversations)` é a régua de estado compartilhada pelo PostgREST e pela RLS. Ativos e Aguardando sempre pertencem ao usuário atual. Uma atribuição automática ou transferência não inicia atendimento: `fn_conversation_assign(reason='claim')` grava `human_accepted_at`. Mudança de responsável, encerramento, novo episódio e retorno à IA invalidam o aceite.

IA tem precedência enquanto um agente publicado pode responder, inclusive com responsável indicado. Sem IA publicada ou com bloqueio humano, a conversa atribuída e não aceita fica Aguardando. Casos sem responsável ficam em Todos e no aviso de direcionamento; o roteador mantém sua elegibilidade, retentativas e aviso deduplicado na Central.

A disponibilidade considera o canal da conversa, roteador, agente já selecionado ou campanha de origem. Agentes pausados e modo assistido não contam como robô respondendo. O motor e o worker legado usam o aceite, além das travas de contato e silêncio, para distinguir indicação de atendimento humano.

Devolver à IA mantém o responsável indicado e limpa o aceite. O cartão da passagem continua aberto após distribuição/transferência e oferece Assumir ao responsável indicado; somente um evento de aceite reconhece o briefing e resolve o aviso humano.

Retornos de follow-up, recuperação de derivação e devolução por prazo também distinguem indicação de aceite. O silêncio formal e a trava humana continuam vetando a IA mesmo sem aceite; dados legados sem o novo campo são tratados de forma conservadora.

`user_organizations.inbox_permissions` contém `all`, `ai`, `closed`, inicialmente falsos. Gestores e administradores têm visão global implícita. Supervisão de departamento e `organizations.settings.visibility_mode` não concedem leitura global de conversas. A configuração visual da navegação é independente. As permissões são editadas no cadastro de Equipe em Personalizar áreas visíveis e acompanham o convite assinado; o aceite é atômico e replays não alteram permissões posteriores.

Todos inclui todas as conversas em andamento, inclusive IA. A permissão IA expande especificamente a aba IA; a permissão Fechadas expande o histórico. Fechadas inclui os estados `closed`, `archived` e `resolved`. Não há remoção de histórico. Links `mine`, `unassigned` e `archived` são normalizados para `active`, `waiting` e `closed`.

Leitura global não concede alteração de outro responsável. RLS, envio, fechamento e atribuição validam o dono/papel separadamente. Permissões são relidas por realtime, foco e polling; uma mudança cancela consultas antigas e limpa o cache antes de atualizar o contexto.

## Conexões e verificação

- Entrada: roteamento, handoff IA→humano, Assumir, transferência, fechamento e cadastro de Equipe.
- Saída: listas/contadores do Inbox, histórico, push filtrado e consumo de mensagens/notas sob a mesma conversa autorizada.
- Registro: eventos de atribuição, atividade existente de comando e auditoria de edição da equipe.
- Continuidade: IA continua até passagem ao humano; retorno limpa o aceite, sem reaproveitá-lo no próximo atendimento.
- Anti-morte: casos sem elegível continuam visíveis em Todos, com retentativa e aviso na Central.
- Configuração: três controles no editor de áreas visíveis; presets visuais não concedem acesso.
- Retorno: alterar disponibilidade e regras de distribuição permite que a próxima tentativa encaminhe a pendência.
- Testes: `lib/inbox/visoes.test.ts`, `tests/invariants/inbox-permissoes-e-aceite.test.ts`, `tests/invariants/inbox-convite-permissoes.test.ts` e specs do Inbox/Equipe.
