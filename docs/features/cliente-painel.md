# Edição direta do cliente e painel da equipe

Destino: núcleo. Cadastro e contexto do atendimento funcionam sem extensões. Nenhum módulo opcional passou a ser exigido.

O nome pode ser editado pelo lápis no cabeçalho da conversa, no cartão lateral e no cadastro. Grava `contacts.name`, preserva o nome informado pelo canal (`display_name`) e invalida lista, detalhe e conversa individual. Salvar exige nome não vazio de até 200 caracteres; Cancelar não grava.

“Sobre o Cliente” é texto manual de até 5.000 caracteres no cadastro (`contacts.custom_fields.__sobre_cliente`). O PATCH existente aceita o campo virtual `sobre_cliente`; o servidor o mescla aos campos atuais. O formulário anterior de campos do funil preserva o resumo atual, mesmo que tenha sido aberto antes de uma edição do resumo. A escrita usa comparação do jsonb lido e devolve conflito se outra alteração acontecer durante a operação. O limite total de 32 KB continua valendo. Enriquecimento permanece separado e visível; o texto manual não é substituído pela pesquisa. Nome e resumo respeitam agent+, LGPD e suporte somente leitura.

A engrenagem “Configurar painel” no Inbox permite ao administrador da organização arrastar blocos ou usar setas e salvar uma ordem para toda a equipe. “Restaurar ordem original” prepara a ordem de fábrica e exige Salvar para aplicá-la. Não há ordem por usuário nem opção de esconder blocos. GET/PATCH `/api/v1/settings/painel-cliente` lê/escreve `organizations.settings.painel_cliente_ordem`: leitura viewer+, escrita admin+, organização da sessão, validação de permutação completa, preservação das demais configurações e comparação de versão pelo jsonb. Gravações concorrentes são recusadas com 409. Clientes já abertos consultam novamente a cada minuto e ao recuperar foco. Sem configuração, todos os blocos seguem na ordem original; falha de leitura mostra aviso e nova tentativa.

Nenhuma migration, nova tabela, permissão ou variável de ambiente. A atualização deve coordenar app e serviços que compartilham lib/ pelas imagens do fork. O publicador restrito ao app recusa esse escopo; não afrouxar sua guarda. Não há mudança de schema a aplicar.

## Integração e retorno

1. Entrada: usuário autorizado nas telas existentes → `NomeDoContatoEditavel` / `SobreCliente` → PATCH do contato; administrador → `PainelDoCliente` → API de configuração.
2. Saída: cadastro persistido → cabeçalho, ficha e lista pelas invalidações; configuração da organização → painel ordenado de todos os membros.
3. Registros: `contact.updated`, auditoria existente do contato e `settings.client_panel_updated`. Auditoria consultável na área existente; os valores vigentes aparecem nos editores e na ordem real do painel.
4. Porta: Inbox e Contatos, já presentes na navegação. Nenhuma tela nova isolada.
5. Anti-morte: falha de escrita conserva rascunho; configuração com leitura falha bloqueia salvar e oferece tentar novamente. Não cria demanda, mensagem ou automatização de atendimento.
6. Continuidade: dados existentes do cadastro continuam acessíveis aos consumidores atuais; enriquecimento, demandas, memória e automações preservados. Esta entrega não modifica decisões ou handoffs da IA.
7. Laço: não há decisão automatizada nova. Erros voltam ao editor para correção/tentativa; conflito impede sobrepor uma alteração concorrente.
8. Mapa: `docs/architecture/cliente-painel.architecture.json`.

## Validação

Casos de limite, preservação, cancelamento, erro, leitura restrita e RBAC na suíte unitária. `tests/e2e/cliente-edicao-e-painel.spec.ts` entra na parte 1 do CI: edição nas duas portas do Inbox e no cadastro, persistência, arraste real, outra sessão da equipe, viewer, outra organização e restauração. Prova em banco fresco pelo CI; esta máquina não tem Docker. Registrar no PROJECT_STATE as rodadas efetivamente concluídas; não confundir teste escrito com teste executado.
