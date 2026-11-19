# Nomes originais dos anexos

O documento da Inbox mostra o nome completo informado pelo canal, com quebra de linha e título para consulta. A extensão/MIME continua sendo a reserva quando não há nome. O download usa o mesmo nome, tanto pelo Storage quanto no proxy antes da persistência. Um arquivo Corel pode vir com MIME ZIP: o nome `.cdr` não deve ser substituído por ZIP.

A ingestão individual e de grupos grava `metadata.media_filename`; o worker conserva a metadata ao persistir os bytes. O upload de documento retorna `media_filename`, o composer o inclui na metadata e o envio entrega esse nome ao adaptador. Não há nova coluna nem alteração de permissão ou retenção. A anonimização já limpa a metadata da mensagem.

Destino: núcleo. O fluxo comum de anexos continua disponível sem extensão. Entrada: nome do canal ou arquivo escolhido; saída: cartão do Inbox, adaptador e download autenticado. A navegação e a auditoria de mensagens existentes continuam sendo as portas e os registros. Não há decisão de IA ou nova configuração; o retorno de erro permanece no download/envio, e nomes ausentes degradam para o tipo sem impedir acesso.

Para documentos antigos, o reparo opcional `scripts/sql/recuperar-nomes-de-anexos.sql` exige backup e `organization_id` explícito. Só recupera nomes comprovados em webhooks processados da mesma organização/sessão/mensagem, sem substituir nomes existentes ou tocar em arquivos, mensagens revogadas, expiradas ou anonimizadas. Registra a quantidade na auditoria. Não infere o nome a partir de uma captura de tela. Sem o registro original, o nome não pode ser reconstruído com certeza.

Validação: testes de ingestão, renderização, persistência, envio e download; caso de tela incluído em `tests/e2e/inbox-responder-citando.spec.ts`. Os resultados efetivamente executados são registrados no PR; a existência do caso não significa que ele foi executado.
