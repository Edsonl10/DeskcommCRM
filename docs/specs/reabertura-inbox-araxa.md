# Reabertura e contato ocupado

CONFIRMADO pelo pedido de 16/10/2026: atendentes com acesso ao histórico podem reabrir a conversa e assumem o novo episódio. Conversa aberta de outro responsável não pode ser tomada por esse comando. A permissão de leitura do histórico permanece independente.

`ConversationHeader` chama `POST /conversations/[id]/reopen` com a revisão observada. `fn_reopen_inbox` verifica o usuário, organização e suporte, bloqueia contato/conversa, revalida acesso, estado terminal e revisão, chama `fn_service_status` e atribui/aceita o novo atendimento na mesma transação. As proteções do contato permanecem. A troca entra em `conversation_assignment_events`, na auditoria e, quando há negócio elegível, na timeline existente por `registrarTrocaDeComando`.

Na tabela de contatos, o atalho existente consulta `GET /conversations/[id]/availability` antes da navegação; Iniciar conversa consulta a ocupação na sessão escolhida antes de resolver/abrir a conversa. Contato acessível em atendimento aberto com outro usuário retorna 409 e somente o nome do responsável. A interface mostra esse aviso sem navegar. O caminho existente de leitura de conversa continua sujeito à RLS.

Destino: núcleo; atendimento e autorização funcionam com zero extensões.

Living System Checklist:
1. Entrada: usuário autenticado, revisão do cabeçalho e contato da tabela.
2. Saída: conversa ativa do novo responsável, ou toast de ocupação.
3. Registro: evento de atribuição transacional, audit conversation.reopened e atividade conversation_claimed. Consulta não gera mutação.
4. Tela: ConversationHeader, ContactsTable e timeline existente.
5. Porta: Inbox e Contatos já existentes no menu.
6. Anti-morte: reabertura termina com aceite humano e responsável explícitos; consulta não cria demanda.
7. Configuração: permissões individuais de Inbox existentes; sem nova configuração.
8. Continuidade: novo responsável recebe o histórico existente; IA pausada por infinity, retorno explícito ao automático existente.
9. Retorno de falha: revisão vencida retorna 409, invalida o cache e exige releitura; ocupação mantém o operador em Contatos.
10. Mapa: caminhos existentes de Inbox/Contatos; nenhuma tela, worker ou entidade nova.

Verificação: unitários em inbox-header-nao-trava, seletor-de-canal-conversa-nova, inbox-disponibilidade-contato e open-shared-contact-conversation; invariantes inbox-reabrir-e-assumir; prova de tela inbox-reabrir-e-contato-ocupado (parte 1). A execução pendente está registrada em PROJECT_STATE.md.
