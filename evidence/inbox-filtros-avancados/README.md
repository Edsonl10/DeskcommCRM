# Filtros avançados do Inbox — verificação

A spec `tests/e2e/inbox-filtros-avancados.spec.ts` gera capturas de computador e celular com dados sintéticos. Capturas versionadas: `evidence/inbox-filtros-avancados/desktop.png` e `evidence/inbox-filtros-avancados/mobile.png` (390 × 844). Geradas pelo run 39827367289, parte 6, na fonte e39af064a12bad9308b4af8794a72d107343a940; teste do funil aprovado em 6,4 s, 61 casos da parte aprovados. Inspeção visual confirmou campos legíveis e rodapé acessível no celular. Somente dados sintéticos.

Nessa fonte, verify, invariants PG17, build e imagens AMD64/ARM64 passaram. E2E partes 2, 3, 4 e 6 passaram; partes 1 e 5 falharam antes dos testes, no download de imagens (GHCR 429 e ECR limite de dados), inclusive na repetição. O ajuste de infraestrutura mantém as quatro tentativas e todos os testes, mas libera nas duas últimas o fallback ECR → GHCR → Docker Hub já presente no CLI 2.117.0. Erros que não sejam de download continuam interrompendo imediatamente. Implantação ainda não concluída.

Local: typecheck completo e lint sem erros; 108 casos de regressão relacionados aprovados; rodada final de 270 casos (filtros, idioma, mapas e cobertura E2E) aprovada. Controle negativo: remover o predicado de departamento causou uma falha esperada em cinco; restauração aprovada 5/5 em worktree isolada. A suíte ampla local não forneceu resumo final e apresentou falhas de IPC/DNS; não foi declarada verde. Referências documentais: 71 casos aprovados após retirar as citações prematuras de capturas.

Ajuste do fallback: 107 casos locais relacionados aprovados, lint e typecheck completos sem erros. Controle negativo forçando GHCR no lugar do fallback provocou exatamente três falhas previstas em quatro; restaurado, 4/4 aprovados.
