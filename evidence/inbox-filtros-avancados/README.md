# Filtros avançados do Inbox — verificação e implantação

Instalado o PR #31 em `605fde4b0a6c742f82a9c48677df0a8f3644882e`. A árvore `3eac37d6c64b218ce5ac2d6d4a81225af591c775` é integralmente idêntica à fonte validada `50b342f67f9ad7afa79ca0c3e84d9ea4a1c53ff3`.

## Provas visuais

- `evidence/inbox-filtros-avancados/desktop.png` e `evidence/inbox-filtros-avancados/mobile.png` (390 × 844): dados sintéticos, run 39827367289/parte 6, fonte e39af064. Campos legíveis e rodapé acessível no celular. O código de runtime não mudou desde essas capturas.
- `evidence/inbox-filtros-avancados/publicado.jpg`: barra da instalação após a atualização, com tag medida em 240 px e funil ao lado. Recorte sem clientes. Janela abriu, mostrou Departamento/Atendente sem erro e Salvar fechou corretamente.

## Validação final

Cinco checks aprovados: CI/PG17 39835730362, build 39835730329, imagens AMD64/ARM64 39835730321 e E2E 39835730408. Parte 6: 61 casos em 15,4 min; novo funil em 5,6 s. Parte 3: primeira rodada falhou com PGRST116 na consulta da sessão de voz após aparecer o QR. O código do teste consulta antes de aguardar a resposta HTTP da gravação, compatível com disputa de tempo; repetição integral sem mudar fonte ou teste aprovou 85 casos em 12,8 min. As cinco demais partes passaram na primeira rodada final.

Na fonte anterior e39af064, os testes 1/5 foram bloqueados pelo pull de imagens, inclusive na repetição. O ajuste mantém quatro tentativas e todos os testes, liberando nas duas últimas o fallback ECR → GHCR → Docker Hub nativo do CLI 2.117.0. Erros que não são de download continuam interrompendo imediatamente.

Local: typecheck e lint sem erros; 108 casos relacionados, 270 finais, 107 de infraestrutura/evidência e 77 documentais aprovados em rodadas separadas. Controle negativo do predicado de departamento: uma falha prevista em cinco, restauração 5/5. Controle do fallback forçando GHCR: três falhas previstas em quatro, restauração 4/4. A suíte ampla local teve limitações de IPC/DNS e não foi declarada integralmente verde; o CI final completo passou.

## Instalação

Publicação 39843310500, com sondas AMD64/ARM64 e manifestos aprovados. A repetição E2E do push foi cancelada após confirmar árvore idêntica à fonte validada; downloads foram antecipados na VPS. O procedimento coordenado conferiu os cinco checks da fonte, digests, revisão e arquitetura antes da troca, preservando as configurações e os outros serviços.

Backup validado em `/opt/backups/crm-cliente-painel-20261022-195841`: banco 27 MB e sessões WhatsApp 1,7 MB, configurações e imagens para retorno. Recibo `recibo.json`, status instalado; saúde/versão e HTTP público conferidos pelo procedimento. Sem SQL ou migration nesta atualização. Digests e referências em `evidence/inbox-filtros-avancados/resultado.json`.
