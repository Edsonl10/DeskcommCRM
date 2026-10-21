# Entrada automática no funil

CONFIRMADO no código: `/app/kanban` mostra o estado para toda a equipe; somente admin altera pelo PATCH `/api/v1/settings/entrada-funil`. Campo `organizations.settings.entrada_automatica_funil`: somente false explícito desliga, preservando instalações anteriores. Zod estrito, suporte, RBAC, org da sessão, comparação do settings completo antes de gravar e auditoria `settings.pipeline_entry_updated`. Sem alteração de schema.

`garantirLeadDaConversa` consulta a configuração antes do nascimento automático para todos os seus chamadores (mensagens recebidas, operador e voz). Desligado retorna `entrada_automatica_desligada`; falha de leitura retorna erro e não cria. Contato/conversa/mensagem e atendimento continuam; cards existentes, criação manual, importações e regras de automação mantêm seus caminhos. Religamento vale para próximas mensagens, sem backfill. Uma mensagem que já leu a configuração pode terminar em voo.

Destino: núcleo, controle do automatismo comum, sem dependência de extensão.

Living System Checklist: entrada é admin em EntradaAutomatica; saída é settings para garantirLeadDaConversa; registro é audit visível em Atividades; porta é Funis; anti-morte continua no atendimento/demandas abertas e inclusão manual, sem Radar/follow-up por lead para contato sem oportunidade (limite exibido pelo estado); controle na própria tela com erro de gravação; continuidade humano/IA da conversa permanece; retorno é equipe corrigindo a configuração com efeito nas próximas mensagens; mapa gestao-funis atualizado. Nenhuma mensagem externa é enviada por este controle.
