# Filtros avançados do Inbox — verificação

A spec `tests/e2e/inbox-filtros-avancados.spec.ts` gera `desktop.png` e `mobile.png` com dados sintéticos. As imagens ainda não foram geradas: o ambiente local não tem Docker, e a publicação da branch foi bloqueada pela revisão automática antes de disparar o CI. Não há prova visual nem implantação concluída.

Local: typecheck completo e lint sem erros; 108 casos de regressão relacionados aprovados; rodada final de 270 casos (filtros, idioma, mapas e cobertura E2E) aprovada. Controle negativo: remover o predicado de departamento causou uma falha esperada em cinco; restauração aprovada 5/5 em worktree isolada. A suíte ampla continua em execução local; não foi declarada verde.
