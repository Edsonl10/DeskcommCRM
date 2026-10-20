# PROJECT_STATE

## Produção registrada — 20/10/2026
- Repositório: `Edsonl10/DeskcommCRM`. Instalação em `/opt/DeskcommCRM`, proxy Caddy próprio; Caddyfile tem alterações locais que devem ser preservadas. Usar `dc()` do kit, que seleciona o proxy real desta instalação.
- App instalado: `a50fe0a529ac1273b2ca616436f53c0486aff135` (PR #23, inclui PR #22). Imagem: `ghcr.io/edsonl10/deskcommcrm@sha256:39be8868e222df884d4ef8c530b1463dde9f2dce8eb6f831813ae6d8e9de01a6`. Saúde interna/pública `healthy`; `/` 200 e `/app` 307. Somente app mudou; IDs de worker, scheduler, WAHA, Caddy, Redis e SRH conferidos iguais aos anteriores. Demais linhas do .env e Caddyfile preservados.
- Iniciar por Contatos, cadastro, funil e cartão compartilhado aceita antes de abrir Ativos. Conversa própria aguardando também é aceita. Claim com `expected_assignee: null` não toma o atendimento de outra pessoa; conflitos impedem navegação e oferecem nova tentativa. Viewer continua em consulta. Resposta humana pela sessão aceita mesmo sem fidelização da distribuição. Lista, ficha, contatos e contadores atualizados. Sem migration ou nova permissão.
- Cadastro oferece Concluir/Iniciar conversa com o id salvo, independentemente da pesquisa; cancelamento/erro preserva o contato. O seletor centraliza o aceite uma única vez. Nenhuma mensagem é enviada por iniciar uma conversa.
- Mantidos: autoria real nas mensagens e citações navegáveis; reabrir assume novo atendimento; aviso de outro responsável; Inbox por aceite/permissão; Equipe → Atendimento centralizado; distribuição por departamento; quantidade sem limite quando configurada; legibilidade/seleção; ações simplificadas. APIs e históricos de arquivados/pessoais preservados.

## Validação e recibo
- Fonte final `34f21dd67ef0238f647b61939c5fdadd43426bb9`: CI/PG17 com atualização sobre dados 39451525605; build 39451525830; imagens AMD64/ARM64 39451525745; seis partes E2E 39451525452, todos aprovados. Árvore da integração a50fe0a idêntica à fonte validada. Publicação da imagem 39455566889 aprovada.
- Bloco E2E 1: 155 casos aprovados. Iniciar em Ativos 10,7 s; cadastro 7,4 s; reabrir/ocupado 10,6 s. Dono/aceite e ausência de mensagens conferidos no banco. Local: 39 casos da integração, typecheck/lint e 66 guardas de evidência aprovados; controles anteriores no histórico dos commits.
- Backup conferido: `/opt/backups/crm-iniciar-ativos-20261020-154227` (banco, sessões WhatsApp e configurações). Recibo final: `health-final.json`, `images-final.txt`, `finalizar-ativos.sh`. Captura sanitizada: `evidence/iniciar-atendimento-ativos/publicacao.jpg`.
- A comparação com a contagem do backup, feito antes do CI, gerou alerta: auditoria comprova exclusão em lote de 307 negociações entre 16:17–16:19 UTC, antes da instalação às 16:22, e importações anteriores. Não restaurar essas exclusões como se fossem perda do deploy. O retorno automático tentou uma referência antiga inválida e falhou; a versão nova permaneceu saudável. .env foi alinhado ao digest realmente instalado e verificado. Não reutilizar o antigo deploy-ui.sh sem corrigir a validação da imagem anterior e a confirmação do retorno.
- Merges comuns agora dispensam App de release (workflow 39467694990 aprovado). Corte numerado requer App/credenciais válidos e não foi executado nesta rodada.

## Decisões permanentes
- Mesclar atualizações oficiais neste fork, preservando personalizações e migrations `9000+`; nunca substituir pela imagem oficial pura nem usar update.sh oficial sem adaptação dos pins do fork.
- Publicar imagens pelo GitHub, instalar por digest, com backup válido e compatibilidade de app/banco/serviços. Preservar domínio/Caddy, credenciais, dados e sessões WhatsApp; nunca reconstruir imagem na VPS como caminho normal.
- RBAC, sessão, MFA, suporte e isolamento existentes permanecem obrigatórios. Quem reabre assume; iniciar não transfere conversa aberta de outro responsável. Distribuição e aceite são estados distintos.
- Usuário autorizou terminal, backup e publicação desta melhoria. Pediu eficiência para próximas mudanças em 20/10: evitar releituras, consultas e validações redundantes; contexto curto, saída objetiva e revisão do processo de publicação. Isso não autoriza omitir checks exigidos para código funcional.

## Eficiência de publicação — concluída em 20/10/2026
- PR #24 integrado em `349346205b1d16ac3dc463d715dc52829204b326`; árvore idêntica à fonte `856467cc9ddbd52b61189eddf934825502fdb102`. CI/PG15/PG17 e atualização sobre dados 39463415969, build 39463416356, imagens 39463416363 e seis partes E2E 39463415991: aprovados.
- Publicação real 39467694916 aprovada: oito recompilações locais puladas, quatro grupos de sondas puxaram os digests publicados e conferiram revisão/arquitetura; manifestos unidos somente depois das sondas. Imagens no GHCR; não houve troca do app da VPS nesta rodada.
- PR #25 integrado em `b2a3354b41248fea1e1ec58b43494a08790fe83f`; árvore idêntica à fonte `47ed0bd51cd7a7814388641ec975154c59eb6a5a`. CI/PG17 39467702562, seleção de build 39467702192, imagens 39467702323 e E2E 39467702210 aprovados. Token do App só após detectar candidato real e antes da guarda do autor; identidade vem do token. Nenhuma credencial foi criada.
- Diff completo inclui renomes; documentação pura usa cercas e pula banco/build/E2E. Código e dúvida conservam suítes completas. Markdown da raiz fora do contexto Docker. O ajuste isolado provou o pulo real das etapas sem impacto; não confundir esse verde com prova de runtime.
- Fetch unitário bloqueia rede externa e permite dublês, loopback e dados em memória. CI completo passou. Local: 245 casos de pipeline, 33 de release, 10 cenários do publicador; typecheck/lint aprovados. Controles negativos causaram uma falha prevista cada e foram restaurados. A rodada ampla local teve limitações de IPC/DNS, cobertas pelo CI.
- `hostgator-setup-kit/publicar-fork.py`: confere cinco checks/fonte, backup validado, imagem real para retorno, somente app e recibo confiável. Testado com dublês; não aplicado à VPS. Recusa banco e dependências compartilhadas, que exigem atualização coordenada. Não reutilizar o script manual antigo.
- Recibo: `evidence/publicacao-eficiente/resultado.json`; procedimento e limites em `docs/runbooks/eficiencia-de-publicacao.md`. Sem medição de tokens ou promessa de redução do prazo total. Próximas alterações seguem o perfil pertinente, com revisão/controles locais antes de disparar CI caro.

## Evidências sintéticas das funcionalidades mantidas
- `evidence/iniciar-atendimento-ativos/inicio-1.png` e `evidence/iniciar-atendimento-ativos/inicio-2.png`: Ativos e responsável, sem Assumir.
- `evidence/autoria-e-citacoes/autora-apos-transferencia.png` e `evidence/autoria-e-citacoes/citacao-do-atendente.png`: autoria e original citada.
- `evidence/comunidade-360/atendimento-sem-limite.png`: configuração Sem limite.
- `evidence/comunidade-360/task10-routing-policies-desktop.png`: ajustes de atendimento centralizados.
