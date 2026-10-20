# PROJECT_STATE

## Produção atual — 20/10/2026
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
- O workflow de corte de release ainda falha por client-id/app-id ausente. Não bloqueou a imagem do fork nem alterou a main; não afirmar que uma release numerada foi publicada.

## Decisões permanentes
- Mesclar atualizações oficiais neste fork, preservando personalizações e migrations `9000+`; nunca substituir pela imagem oficial pura nem usar update.sh oficial sem adaptação dos pins do fork.
- Publicar imagens pelo GitHub, instalar por digest, com backup válido e compatibilidade de app/banco/serviços. Preservar domínio/Caddy, credenciais, dados e sessões WhatsApp; nunca reconstruir imagem na VPS como caminho normal.
- RBAC, sessão, MFA, suporte e isolamento existentes permanecem obrigatórios. Quem reabre assume; iniciar não transfere conversa aberta de outro responsável. Distribuição e aceite são estados distintos.
- Usuário autorizou terminal, backup e publicação desta melhoria. Pediu eficiência para próximas mudanças em 20/10: evitar releituras, consultas e validações redundantes; contexto curto, saída objetiva e revisão do processo de publicação. Isso não autoriza omitir checks exigidos para código funcional.

## Eficiência de publicação — implementação em validação
- Usuário autorizou implementar o plano em 20/10. Branch `perf/ciclo-publicacao`, destino infraestrutura. Ver `docs/runbooks/eficiencia-de-publicacao.md` para perfis, procedimento e limites.
- Diff completo (incluindo renomes) classifica PR e main; documentação pura usa cercas e pula banco/build/E2E. Código e dúvida conservam as suítes completas. Sondas de publicação usam os digests já produzidos; manifestos aguardam os testes. Markdown da raiz fora do contexto Docker.
- Merge comum não exige App de release; corte real usa Client ID, com compatibilidade com App ID. Não foi criada credencial de release. Ajuste isolado `fix/identidade-release`: autenticar o App depois de detectar candidato e antes de conferir o autor; não depender de slug digitado.
- `hostgator-setup-kit/publicar-fork.py`: preflight dos cinco checks/fonte, backup validado, pin da imagem real, atualização somente do app e recibo com retorno confirmado ou falho. Recusa banco e dependências compartilhadas; não substitui atualização coordenada. Testado com dublês, ainda não executado para trocar a VPS.
- Proteção do fetch unitário contra destinos externos: dublês e loopback permitidos, bloqueio antes da rede. Motivada por rejeição automática da suíte local anterior; nenhuma chamada externa adicional foi autorizada.
- Local: 245 casos dos 19 arquivos de guardas do pipeline, 17 casos de fetch/roteamento simulado, 10 cenários do publicador, typecheck e lint (0 erros; 528 avisos preexistentes) aprovados. Controle negativo: impacto desconhecido aceito indevidamente causa 1 falha prevista; restaurado passa. Rodada ampla protegida: 2.120 arquivos, 22.061 casos aprovados e 16 falhas; 3 falhas da transição foram corrigidas e os 29 casos pertinentes passaram. Restam limitações locais preexistentes de IPC (12 casos) e DNS (1). Kit encontrou limitações de PID/sinal e rede em testes preexistentes; CI real em andamento.
- Produção permanece a50fe0a: esta rodada altera infraestrutura, sem mudança de comportamento ou schema do CRM. Não prometer redução de minutos/tokens antes de medir rodadas.

## Evidências sintéticas das funcionalidades mantidas
- `evidence/iniciar-atendimento-ativos/inicio-1.png` e `evidence/iniciar-atendimento-ativos/inicio-2.png`: Ativos e responsável, sem Assumir.
- `evidence/autoria-e-citacoes/autora-apos-transferencia.png` e `evidence/autoria-e-citacoes/citacao-do-atendente.png`: autoria e original citada.
- `evidence/comunidade-360/atendimento-sem-limite.png`: configuração Sem limite.
- `evidence/comunidade-360/task10-routing-policies-desktop.png`: ajustes de atendimento centralizados.
