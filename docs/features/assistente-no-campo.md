# Assistente no campo de mensagem

Destino: núcleo. Reorganiza uma função existente do Inbox; nenhuma extensão é necessária.

O botão **Assistente**, antes de **Nota interna**, solicita a sugestão ao agente publicado do canal. O texto entra em **Mensagem**, editável. O atendente pode conferir, alterar, limpar ou clicar em **Enviar**. Gerar não envia, não executa ações propostas e não devolve a conversa à IA. A faixa fixa de assistência foi retirada.

A geração usa `DraftReplyButton` e `useDraftReply`, com a rota `draft-reply` existente. O envio é uma resposta humana comum por `useSendMessage`, com suas validações, autoria e citações existentes. Esse caminho não chama a aprovação de `ai_reply_drafts`: os endpoints e o consumidor de aprovação assistida permanecem disponíveis e inalterados, mas a revisão avançada com feedback não é mais exibida no Inbox. A sugestão descartada no campo não registra feedback de rejeição.

O botão fica indisponível com rascunho preenchido, conversa sem permissão de resposta ou janela fechada. Ao mudar para Nota interna, o botão sai; resultados em andamento não preenchem notas nem outra conversa. Texto digitado durante a geração é preservado. Não há consulta periódica de sugestões neste caminho.

## Living System Checklist

1. Entrada: agente publicado, histórico e contexto pela rota autenticada `draft-reply`.
2. Saída: `Composer` recebe texto; `useSendMessage` envia somente por ação humana.
3. Registro: geração mantém `ai_reply.generated`; envio mantém a auditoria e a mensagem humanas existentes.
4. Tela: campo Mensagem do Inbox.
5. Porta: botão Assistente na linha Responder/Nota interna.
6. Anti-morte: decisão do atendente; demandas e Radar existentes não mudam.
7. Configuração: IA > Agentes; erros da geração aparecem pelo `showApiError`.
8. Continuidade: IA fornece texto ao humano; a mensagem humana enviada permanece no histórico que alimenta turnos futuros.
9. Retorno: edição humana altera a resposta enviada; limpar não treina o agente e não gera feedback de rejeição.
10. Mapa: reutiliza as arestas existentes geração → compositor → envio; nenhuma peça de backend ou integração nova.

## Verificação

`composer-assistente-no-campo.test.tsx` cobre posição, edição/envio manual, proteção de rascunho, troca de conversa, notas e janela fechada. A spec `qa-sugestao-rejeitada-e-motivo.spec.ts` cobre geração real, ausência de saída, posição e erros; `autonomia-assistida.spec.ts` mantém a prova direta de aprovação/consumidor. E2E exige banco local e não deve ser executado contra produção.
