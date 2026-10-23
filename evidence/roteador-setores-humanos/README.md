# Roteador para setores humanos

Destino: núcleo opcional; configuração pelo editor existente de Roteadores.

## Prova da implementação

- Fonte `16ea3dd9601ae091328b749ee37c51c7c785bb33`, árvore `027a2fc64ab144c02b8bece7228a636c7dac993b`; integração `9f8db02c7d5e0f40d71222cfb6a5452f23f3e6e7` com árvore integralmente idêntica. Inclui os filtros do Inbox já instalados.
- Cinco checks aprovados: CI/PG15/PG17 `39937253661`, build `39937253671`, imagens AMD64/ARM64 `39937253677` e seis partes E2E `39937253682`.
- Parte 5: 71 casos aprovados. `roteador-setores-humanos.spec.ts` passou em 14,3 s: salva e recarrega, testa inativo, troca destino e reserva, ativa, recarrega e confere a gravação no banco, desativa e recarrega. Canal sintético sem clientes; teste não envia mensagens nem transfere conversas.
- [Captura sintética](editor-ci.png), revisada do artifact `12495292919`, `evidencia-parte-5`. “Outra equipe” é fixture do teste, não um setor real configurado.
- Typecheck e lint do teste aprovados localmente; 140 casos pertinentes aprovados. Controle negativo anterior: remover a transferência nativa do turno faz 2 de 3 casos falharem.
- Prova de banco: `tests/invariants/agent-handoff-department.test.ts` percorre capacidade sem agente → carregamento da política → handoff nativo → departamento/pending/silêncio; aprovado nos dois bancos do CI.

## Instalação e homologação

- Instalada a integração `9f8db02` por digests da publicação `39940255513`. App, worker e scheduler saudáveis; domínio `/` 200 e `/app` 307. Configurações/Caddyfile e demais serviços preservados.
- Backup validado de banco, sessão WhatsApp e configurações em `/opt/backups/crm-roteador-20261023-104815`; script e recibo privados preservados no mesmo diretório. Sem SQL/migration nesta instalação.
- Configuração real salva e recarregada: **desativado**, intenção Financeiro → Financeiro, reserva Comercial, GPT-5.4 Mini e credencial existente.
- Sete classificações pela tela aprovaram boleto e pedido explícito ao Financeiro → Financeiro; orçamento, instalação, saudação, pedido genérico de atendente e negação de boleto → Comercial. Resultados em [resultado.json](resultado.json), [captura publicada](publicado.jpg), sem dados de clientes.
- Limites: o teste da tela não envia WhatsApp nem transfere conversas. Não houve prova ponta a ponta com cliente no WhatsApp, ativação em tráfego real ou mensagens a clientes. A prova da transferência nativa está no banco descartável do CI.
