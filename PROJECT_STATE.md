# PROJECT_STATE

## Estado atual
- Integração da release oficial `v1.78.0` preparada a partir de `6f943f923` da VPS e da main `0f7d92a04` do fork.
- Preservados departamentos, membros Normal/Supervisor, transferência por departamento, participação na distribuição e visibilidade do supervisor.
- Incorporadas as proteções locais de suporte e de autenticação da atribuição por departamento.
- Mantidos os modos oficiais `round_robin`/`load` e o modo personalizado `least_loaded`.

## Decisões aprovadas
- Atualizar pelo repositório oficial preservando as melhorias da instalação.
- A produção só deve receber código e banco compatíveis após backup e validação.
- Migrations exclusivas do fork usam a faixa `9000+`, para evitar colisão com a numeração do produto oficial. As antigas 0485/0486 personalizadas foram renomeadas para 9001/9002; conteúdo funcional preservado e segurança versionada como forward-fix.
- Configurações locais de domínio/Caddy, credenciais e sessão do WhatsApp são preservadas no deploy.

## Validações e pendências
- Confirmado em produção: o erro de mensagens é causado pela ausência de `messages.reply_to_message_id`.
- Validações da integração, publicação das imagens e deploy ainda em andamento.
- Não usar a imagem oficial pura: ela não contém as melhorias de departamentos deste fork.

## Próximo passo
- Concluir testes, publicar imagens imutáveis pelo CI, fazer backup, atualizar o banco e validar Inbox/Equipe pela tela.
