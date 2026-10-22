# Passagem da IA para um departamento

Destino: núcleo. A passagem é parte do atendimento comum e não depende de extensão.

CONFIRMADO no código proposto: a ferramenta nativa de passagem aceita `departamento`, nome de um setor ativo da organização. O runtime resolve o nome no banco, sob o vínculo organização/conversa/contato; nomes inexistentes ou ambíguos falham. Não há identificadores de cliente ou nomes de setor fixos no código.

A função `fn_agent_handoff_department`, executável somente por `service_role`, trava a conversa e recusa grupo, encerramento e aceite humano. Ela limpa apenas atribuição ainda não aceita, grava o setor, silencia o bot e emite `conversation.department_routing_requested`. `lib/routing/worker.ts` consome o evento e aplica o método configurado no setor. O fluxo existente de `performHumanHandoff` registra resumo, aviso e cancelamento de retornos; a passagem sem setor mantém o comportamento anterior.

O teste de agente registra uma proposta sem transferir clientes. O contador de passos do registro do teste não mede chamadas reais; a proposta e a função precisam ser verificadas separadamente.

## Configuração e validação

As regras de assunto são instruções do agente, e os setores/métodos são configurados em Equipe > Departamentos. O teste Comercial/Financeiro precisa conferir o campo `departamento` na proposta e o destino real após instalar app, worker e migration. Publicar o agente exige vincular o número e é uma ação posterior ao teste.

## Sistema Vivo

- Entrada: mensagem do cliente no turno do agente (`inbound-turn.ts`).
- Saída: passagem nativa e evento para `runRoutingWorker`.
- Registro: `conversation_assignment_events`, `event_log`, passagem existente e aviso na Central.
- Tela/porta: Inbox, Central de avisos e Agente de IA > Agentes > Teste.
- Continuidade: resumo humano e retorno ao automático pelos controles existentes.
- Falha: a ferramenta informa erro ao modelo; sem confirmação falsa de encaminhamento. Correções de destino/prompt são feitas pela equipe nas telas existentes.
- Anti-morte: fila humana e distribuição por setor; disponibilidade não garante prazo de resposta.
- Arquitetura: aresta existente entre passagem e roteamento por departamentos; não há nova tela ou worker.

## Limites da medição

Testes unitários verificam o wrapper. Invariantes verificam a função, isolamento e preservação do aceite. A prova pela tela e a prova em par no ambiente instalado continuam necessárias antes de ativar o agente.
