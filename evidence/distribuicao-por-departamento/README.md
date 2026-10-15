# Distribuição por departamento — evidência E2E

Capturas originais da bancada isolada, com dados fictícios, no run
[38646438377](https://github.com/Edsonl10/DeskcommCRM/actions/runs/38646438377),
artifact `evidencia-parte-3` (11934640106), head
`f59c9895ead04a4abdb5276bd36c83a4455326f0`.

Código integrado pelo [PR #13](https://github.com/Edsonl10/DeskcommCRM/pull/13),
sem diferenças de árvore entre esse head aprovado e o commit de integração.

A spec `tests/e2e/roteamento-por-canal.spec.ts` configura departamentos e membros
pela API autenticada, processa o worker real, confere os campos no banco e abre
a fila do atendente. A transferência para o segundo departamento é feita pelo
diálogo da interface. Nenhuma mensagem externa é enviada.

| Captura | Verificação |
|---|---|
| departamento-padrao-aguardando.png | Ana recebe sua conversa no Comercial de teste; Aguardando e Assumir visíveis. A API da fila exclui a conversa atribuída a Bruno. |
| departamento-padrao-aguardando-mobile.png | Mesmo cabeçalho em viewport 390 × 844, sem transbordamento horizontal. |
| outro-departamento-aguardando.png | Bruno recebe a transferência para Financeiro de teste em sua fila Aguardando. O setor permite membro indisponível e usa menor carga, independentemente da lista do canal. |

As seis partes de E2E passaram. A parte 3 aprovou 85 testes. O teste de banco
`department-routing.test.ts` aprovou seus nove casos em PostgreSQL 15 e 17; a
suíte completa aprovou 3.340 testes por versão, com os skips e o expected fail
preexistentes. O caminho sem departamento também é exercitado na mesma spec.

Jornada documentada: J44 em `docs/testing/user-journey-map.md`.
