# Filtros avançados do Inbox — verificação

A spec `tests/e2e/inbox-filtros-avancados.spec.ts` gera capturas de computador e celular com dados sintéticos. As capturas ainda não foram incorporadas ao versionamento. O PR #31 executa a prova visual no CI, pois o ambiente local não tem Docker. Implantação ainda não concluída.

Local: typecheck completo e lint sem erros; 108 casos de regressão relacionados aprovados; rodada final de 270 casos (filtros, idioma, mapas e cobertura E2E) aprovada. Controle negativo: remover o predicado de departamento causou uma falha esperada em cinco; restauração aprovada 5/5 em worktree isolada. A suíte ampla local não forneceu resumo final e apresentou falhas de IPC/DNS; não foi declarada verde. Referências documentais: 71 casos aprovados após retirar as citações prematuras de capturas.
