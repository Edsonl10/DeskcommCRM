# Passagem da IA para um departamento

Destino: núcleo. A passagem é parte do atendimento comum e não depende de extensão.

CONFIRMADO no código instalado: a ferramenta nativa de passagem aceita `departamento`, nome de um setor ativo da organização. O runtime resolve o nome no banco, sob o vínculo organização/conversa/contato; nomes inexistentes ou ambíguos falham. Não há identificadores de cliente ou nomes de setor fixos no código.

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

Testes unitários verificam o wrapper. Invariantes verificam a função, isolamento e preservação do aceite. A homologação ponta a ponta no WhatsApp continua necessária antes de ativar o agente; as provas parciais instaladas estão registradas abaixo.

## Prova na instalação — 22/10/2026

PR #30 integrado e instalado em `07f7d5f`. Publicação 39788054831; três imagens por digest, migration 9007 em transação, backup validado em `/opt/backups/crm-triagem-20261022-174956`. Recibo nessa pasta: `recibo-triagem.json`. Saúde interna healthy; domínio `/` 200 e `/app` 307. Proxy local e serviços vizinhos preservados.

| Texto usado na tela | Proposta registrada | Prova direta da função |
|---|---|---|
| Bom dia, preciso da segunda via do boleto do meu pedido. | Financeiro, somente passagem; run fccb563e-b8a8-4061-80f3-549e69720bff | Financeiro, pending, bot silenciado e distribuição solicitada |
| Quero saber como está a instalação da minha fachada. | Comercial, somente passagem; run 9f59eeb5-8eae-4ce4-ac67-3fc3776aaf28 | Comercial, pending, bot silenciado e distribuição solicitada |

A função recebeu o departamento produzido pelo agente; ela não recebe o texto do cliente. Os registros diretos foram sintéticos e inteiramente desfeitos por ROLLBACK, sem envio WhatsApp. Execute permitido apenas para service_role; anon/authenticated negados. O teste pode exibir blocked quando só há proposta de passagem e nenhuma resposta de texto: essa tela não executa a passagem.

O agente continua em rascunho, sem número vinculado. Não foi medido atendimento real nem o atalho determinístico de pedido explícito de humano, que conserva a passagem sem destino por departamento. A configuração final reforça o encerramento após a passagem, depois de um teste intermediário sugerir atualização de estágio.

Teste adicional de saudação sugeriu passagem/estágio e não conta como aprovação integral. A configuração final restaurada é a dos dois casos da tabela; saudação e pedido explícito de humano ainda precisam de homologação. `pipeline_ids=[]` e `tool_ids=[]` conferidos: sem escopo de funil nem capacidades do catálogo liberadas.
