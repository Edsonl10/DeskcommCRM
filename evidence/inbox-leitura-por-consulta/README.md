# Inbox: leitura sob acesso simultâneo

Correção do PR [#40](https://github.com/Edsonl10/DeskcommCRM/pull/40), instalada na revisão `9f76bf33bdbe3e35dafcfbe1c7ef3ff5bfe81787`. A barra usa as mesmas etiquetas da conversa; a mudança corrige o custo repetido das permissões nas leituras, mantendo o escopo existente.

Fonte aprovada: `d8ad8b7b84f8f833b2b26548693d607c630a6868`. Árvore da fonte e da integração: `34940ebe334086661ad579db72d309145b91b873`. [CI/banco](https://github.com/Edsonl10/DeskcommCRM/actions/runs/40874264758), [build](https://github.com/Edsonl10/DeskcommCRM/actions/runs/40874264523), [imagens](https://github.com/Edsonl10/DeskcommCRM/actions/runs/40874264618) e [seis partes E2E](https://github.com/Edsonl10/DeskcommCRM/actions/runs/40874265034): aprovados. [Publicação das imagens](https://github.com/Edsonl10/DeskcommCRM/actions/runs/40878281007): aprovada, com sondas nas duas arquiteturas e manifestos. Os três runs repetidos da integração foram cancelados após conferir igualdade das árvores; a validação integral da fonte foi preservada.

## Conferência de produção

- App, worker e scheduler por digest, running/healthy e revisão correta. Saúde healthy; HTTP público `/` 200 e `/app` 307. Caddy e os demais serviços preservados. Voice-agent não foi instalado.
- Quatro sessões simultâneas com papel authenticated, em transações read only/repeatable read; 16 consultas de lista/contagem/histórico concluídas sem erro. O escopo das conversas próprias foi comparado com o mesmo snapshot antes de trocar o papel. Tempos por consulta entre 11,139 e 113,230 ms, mediana 38,809 ms. O tempo de cada sessão inclui também inicialização do cliente e conexão; não é tempo de carregamento do navegador.
- Lista e contadores carregados na tela. Uma etiqueta já existente filtrou a lista, e desmarcar restaurou. Nenhuma conversa foi aberta/etiquetada por esse teste; nenhuma mensagem enviada. A busca de validação usada na captura foi limpa depois.
- Recuperação anterior: retorno temporário à versão 20a6f01, sem restaurar dados, mantendo a migration 9008. A primeira tentativa de 9009 encontrou lock_timeout e foi desfeita atomicamente. A tentativa final adquiriu a trava antes de alterar funções, com espera limitada, aplicou a migration em transação e validou o backup. Não houve restauração de dados de negócio.

![Barra carregada após a correção](publicado.jpg)

Captura exclusiva da barra com busca de validação sem resultados: números zero não representam o volume real. Sem clientes, telefones ou mensagens. JPEG SHA-256 `3bbb42d2c9676e9296dc6889c1d1acc8d5a719a5da47542192b08a36ce6da33d`.

## Limites e rastreio

Os computadores físicos dos demais atendentes não foram acessados. Quatro sessões de leitura não constituem ensaio de carga integral. Os tempos dos protótipos anteriores foram pontos sob carga diferente; a comparação ampliada com a função antiga excedeu o prazo, portanto não foi declarada paridade integral nessa medição. Os invariantes do banco real cobrem os escopos e o plano executado uma vez; o controle negativo de plano removeu o subselect e eliminou o InitPlan, em protótipos temporários sem commit.

O helper de contexto executável por authenticated é intencional: não aceita identidade e retorna apenas vínculos/permissões do próprio chamador. Anon foi revogado e o critério por linha é invoker. [Aviso do advisor](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

Digests, gates, recibo sanitizado, verificações de permissões e tempos completos: [resultado.json](resultado.json). Os backups, scripts operacionais e logs com contagens reais ficam privados na VPS. Contrato: [leitura por consulta](../../docs/features/inbox-leitura-por-consulta.md).
