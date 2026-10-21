# Cliente e painel da equipe

Capturas com dados sintéticos da instalação fresca do CI, geradas por `tests/e2e/cliente-edicao-e-painel.spec.ts`. Nenhum cadastro real da produção foi alterado para produzir esta prova.

- `inbox.png`: nome editado no cabeçalho e na ficha lateral; Sobre o Cliente salvo; ordem compartilhada recarregada.
- `cadastro.png`: o mesmo resumo aparece no cadastro e a edição direta do nome persiste.
- `configuracao.png`: arraste real coloca Pedidos recentes no início; comandos de salvar, cancelar e restaurar permanecem visíveis.
- `configuracao-celular.png`: janela com 390 × 844 px; lista com rolagem, comandos visíveis e ausência de excesso horizontal.

A segunda sessão da equipe confirma os dados e a ordem gravados. Viewer não edita; agente não altera o padrão da equipe; outra organização conserva sua própria configuração. Restaurar a ordem original exige salvar. Cancelamento, falha de escrita, limites e preservação dos demais campos têm cobertura unitária.

O recibo `resultado.json` registra a fonte validada, a integração, os checks efetivamente aprovados, as imagens instaladas e o backup. A publicação coordena app, worker e scheduler, sem SQL; os demais serviços e configurações permanecem preservados.
