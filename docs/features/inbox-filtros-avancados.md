# Filtros avançados do Inbox

Destino: núcleo. É uma ampliação da consulta de conversas existente, útil com zero extensões. Pedido aprovado: campo de tags compacto e funil ao lado, com os filtros das referências do usuário.

## Contrato confirmado no código

- Porta: `/app/inbox`, botão **Filtros de conversas** ao lado da tag (máximo de 240 px). Abre `InboxAdvancedFilters`; os atalhos Não lidos e Grupos permanecem sincronizados com a janela.
- Rascunho até **Salvar**; fechar/X/Escape descarta. **Limpar** zera o rascunho e requer Salvar. Busca e aba atuais permanecem. O estado é da sessão da tela, como os filtros anteriores.
- Instância usa os canais existentes; etiquetas usam a união de contato/conversa e preservam os modos E/OU. Departamentos e atendentes usam consultas autorizadas da organização ativa. Busca por nome, chips removíveis, escolha múltipla e contador no funil.
- `department_ids` e `assigned_user_ids` são parâmetros repetidos, UUIDs (máximo 50 de cada). Dentro de cada seleção vale OU; entre campos vale E. O filtro é adicional à visão/permissão/RLS existente.
- `last_message_from` é inclusivo e `last_message_before` exclusivo, ambos ISO com fuso. A interface usa dias civis no fuso do navegador e inclui o dia final inteiro. É o período da **última mensagem**, indicado na janela; não é busca no histórico.
- `lib/inbox/filtros-avancados.ts` valida, serializa e aplica os mesmos predicados ao handler de listagem e à base de todas as contagens. Filtro acontece no banco antes da paginação; chaves de cache incorporam a seleção. As duas portas recusam IDs/datas inválidos com 422.
- Sem tabela, migration, permissão, dependência, mensagem externa ou mutação de conversas nova. Consultas mantêm organização explícita e cliente sujeito a RLS. Erro na carga de opções fica visível com Tentar novamente.

## Living System Checklist

1. Entrada: `InboxFilters` recebe canais/vocabulário e abre `InboxAdvancedFilters`; departamentos e equipe vêm dos hooks existentes.
2. Saída: `InboxLayout` → `useConversationsRealtime`; `InboxFilters` → `useConversationCounts`; ambos serializam os filtros avançados.
3. Registro: consulta pura, sem auditoria de mutação. Estado aplicado aparece no ícone/contador e nos controles ao reabrir.
4. Tela: janela Filtros e lista/contagens no Inbox.
5. Porta: funil na barra já alcançável pelo menu Atendimento → Inbox; nenhuma rota nova.
6. Anti-morte: não se aplica a leitura. Estado vazio com filtro usa a saída Limpar filtros existente, ampliada para os campos novos.
7. Configuração: a própria janela permite ver, mudar, salvar e limpar; consultas sem opções e com erro têm estados visíveis.
8. Continuidade: filtro de leitura não altera responsabilidade nem passagem IA/humano.
9. Retorno: erro de opções permite nova tentativa; erro HTTP permanece no tratamento existente. Nenhuma decisão automática nova.
10. Mapa: `docs/architecture/inbox-filtros-avancados.architecture.json` registra entrada, duas saídas e retorno à tela.

## Verificação

Unidade: validação dos dois contratos, serialização de todas as escolhas, predicados e limites de período, edição em rascunho e limpeza sem perda de aba/busca. Regressão: filtros/contagens/etiquetas/grupos/i18n. Spec `tests/e2e/inbox-filtros-avancados.spec.ts`: organização e usuários sintéticos, cinco conversas contrastantes, combinação pela tela, duas linhas/contador 2, limpeza/contador 5, fechamento sem aplicar, entradas inválidas e janela em 390 × 844. Capturas geradas pelo CI em `evidence/inbox-filtros-avancados/`.

A fonte final `50b342f` passou nos cinco checks, incluindo banco PG17 e seis partes E2E. O novo cenário do funil passou em 5,6 s. Integração `605fde4`, com árvore idêntica à fonte validada, instalada por digests após backup e conferida na tela. Recibo e capturas em `evidence/inbox-filtros-avancados/`. O ambiente local sem Docker não foi usado como prova de banco ou tela real.
