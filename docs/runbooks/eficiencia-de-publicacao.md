# Reduzir o ciclo de publicação

Pedido do usuário em 20/10/2026: tornar as próximas melhorias mais rápidas e econômicas em contexto, pois há muitas mudanças previstas. O objetivo é retirar repetição e espera desnecessária, preservando os controles de atendimento e dados.

## Medidas desta rodada

- A fonte final do PR #23 rodou a suíte de interface em seis partes. O bloco 1 levou 23,4 minutos no job anterior e o bloco desta rodada terminou com 155 casos aprovados (17,1 minutos só de execução dos testes, além do preparo).
- Após integrar o mesmo código na main, publicar a imagem exigiu outra etapa de construção/inicialização e envio. `publish-image.yml` executa os jobs locais de smoke e os jobs build-and-push na main; ambos constroem imagens. O cache existe e o Dockerfile já mantém o argumento de versão depois das camadas caras. Medir cache hit e duração por etapa antes de propor alteração nesses pontos.
- Uma referência incorreta de captura na documentação causou outra rodada. As 66 guardas locais de evidência detectam esse tipo de erro em menos de um segundo nesta máquina: executá-las antes da rodada cara quando houver capturas.
- A verificação de dados comparou a operação atual com o backup feito antes da longa espera. Exclusões legítimas anteriores à instalação dispararam um alerta incorreto. O script antigo também anunciou retorno sem confirmar que a imagem anterior havia sido encontrada.

## Aplicar já no trabalho do agente

1. Estado de retomada curto, com versão instalada, decisões, pendências e referências; histórico detalhado no git. Reutilizar leituras verificadas da sessão e buscar apenas código relevante.
2. Integrar trabalhos concorrentes e finalizar código/referências antes da rodada completa. Consultar CI em resumos; logs somente para investigar falhas ou confirmar um caso concreto.
3. Não repetir testes aprovados por rotina. Metadados e recibos posteriores devem ter checagens documentais proporcionais; isso não altera a exigência de validação do código funcional.
4. Antes de trocar o app, verificar que a referência de retorno resolve para a imagem em execução e preservá-la. Retorno só pode ser declarado após conferir comando, versão e saúde. Não sobrescrever auditoria ou restaurar exclusões legítimas concorrentes.

## Implementado em 20/10/2026

- `scripts/arquivos-alterados-ci.sh` considera todo o intervalo de um push e ambos os caminhos de renomes. Em PR pagina a API, incluindo nomes anteriores. Base ausente, rede falha, lista possivelmente truncada, dispatch ou resposta vazia conservam o caminho completo.
- `scripts/ci-so-documentacao.sh` permite o perfil curto somente para docs, tarefas, evidências, fragmentos e markdown da raiz. Só esse perfil reduz o verify à parte 4 (cercas documentais/estruturais), sem kit ou banco. Código e mudanças de teste continuam usando as suítes funcionais. Os checks obrigatórios mantêm os nomes e reprovam falhas/cancelamentos.
- E2E e build de imagem agora classificam também pushes da main. Qualquer alteração funcional continua com a regressão inteira de interface, incluindo filas, atribuição, permissões e isolamento. Não foi adotado um recorte especulativo por tela.
- Na publicação, cada uma das quatro receitas e duas arquiteturas constrói uma vez e registra o digest em artefato da rodada. As sondas puxam esse digest, conferem revisão e arquitetura e executam os mesmos testes de boot/PDF/worker/cron. Os manifestos finais são unidos desses digests somente depois das sondas. Em PR as imagens seguem sendo construídas e executadas, sem publicar código não revisado.
- Markdown da raiz saiu do contexto Docker: atualizar o estado do projeto não invalida mais `COPY . .`. Nenhuma importação de AGENTS/CLAUDE/PROJECT_STATE em runtime foi encontrada na varredura dos módulos de produto.
- O fetch padrão da suíte unitária bloqueia destinos externos; SDKs são medidos com dublês e servidores locais continuam permitidos. Assim a validação não chama APIs faturáveis por acidente.
- Merge comum não pede mais token do App de release nem instala Node para calcular uma versão que não será cortada. Corte real aceita `RELEASE_APP_CLIENT_ID` (variável ou secret), com compatibilidade com o App ID antigo. Não foi criado um App ou credencial; corte numerado continua exigindo configuração válida do responsável pelo repositório.

A publicação deixa de fazer oito construções locais adicionais nas sondas (quatro imagens × duas arquiteturas). Isso é redução de invocações Docker, **não** uma medição de minutos ou tokens. Comparar relógio e minutos de runner de rodadas reais antes de prometer porcentagem de prazo.

## Publicar somente o app do fork

Procedimento versionado: `hostgator-setup-kit/publicar-fork.py`. Rodar na pasta da instalação:

```bash
python3 hostgator-setup-kit/publicar-fork.py --commit <SHA-completo> --image <ghcr.io/dono/deskcommcrm@sha256:digest> --check
python3 hostgator-setup-kit/publicar-fork.py --commit <SHA-completo> --image <ghcr.io/dono/deskcommcrm@sha256:digest>
```

O preflight confere origin, pertencimento à main e os cinco checks do GitHub Actions da fonte exata. Recusa alterações locais além do Caddyfile e mudanças que exijam coordenar banco/dependências/worker. `--check` não puxa imagem, faz backup nem troca o app.

A execução normal puxa por digest, confere a revisão, faz backup validado de banco e sessões pelo kit existente e preserva configurações em pasta fechada. Cria um pin local da imagem realmente em execução, mesmo se APP_IMAGE anterior estiver inválido. Atualiza o checkout por fast-forward, preserva Caddy, troca apenas APP_IMAGE e recria só app, sem build/pull implícito ou dependências. Confere imagem, versão e saúde, além dos IDs dos outros serviços. Grava `recibo.json` junto ao backup.

Se a troca falhar, tenta a imagem preservada e só escreve `retorno_confirmado` depois de conferir imagem, versão e saúde. Com falha de recuperação escreve `retorno_falhou` e termina com erro. O banco não é restaurado automaticamente; exclusões/importações legítimas concorrentes não são tratadas como corrupção pela comparação com um backup antigo.

Limite deliberado: atualização coordenada de banco ou dependências compartilhadas exige outro procedimento. Não usar o update oficial para substituir os pins personalizados do fork. Os testes locais deste comando usam dublês de Docker/Git/API; não constituem uma instalação real na VPS.

## Integração e laço de retorno

Destino: infraestrutura; nenhum módulo de negócio foi alterado. Entrada: diff e eventos do GitHub → classificadores → workflows/testes → digests/manifestos. O operador vê decisões e digests no resumo dos jobs; chega pelo PR/Actions. Falha de sonda bloqueia a união/promoção. Falha de instalação produz recibo e exige correção antes da próxima tentativa; a recuperação tem estados separados de sucesso/falha. Na VPS, entrada é fonte aprovada + digest, saída é app conferido + recibo. Não existe mensagem externa nem nova configuração de produto.

## Validação desta implementação

Registrar no PROJECT_STATE e no PR a rodada efetivamente executada. Controles de regressão: matrizes de sucesso/falha/pulo/cancelamento; push com renome de código para documentação; diff desconhecido; digest inválido; revisão/arquitetura divergentes; instalação apenas do app; pin antigo inválido; retorno que falha. Docker e banco reais são medidos pelo CI, pois esta máquina não tem Docker.
