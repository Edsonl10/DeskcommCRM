# Reduzir o ciclo de publicação

Pedido do usuário em 20/10/2026: tornar as próximas melhorias mais rápidas e econômicas em contexto, pois há muitas mudanças previstas. O objetivo é retirar repetição e espera desnecessária, preservando os controles de atendimento e dados.

## Medidas desta rodada

- A fonte final do PR #23 rodou a suíte de interface em seis partes. O bloco 1 levou 23,4 minutos no job anterior e o bloco desta rodada terminou com 155 casos aprovados (17,1 minutos só de execução dos testes, além do preparo).
- Após integrar o mesmo código na main, publicar a imagem exigiu outra etapa de construção/inicialização e envio. `publish-image.yml` executa os jobs locais de smoke e os jobs build-and-push na main; ambos constroem imagens. O cache existe e o Dockerfile já mantém o argumento de versão depois das camadas caras. Medir cache hit e duração por etapa antes de propor alteração nesses pontos.
- Uma referência incorreta de captura na documentação causou outra rodada. As 66 guardas locais de evidência detectam esse tipo de erro em menos de um segundo nesta máquina: executá-las antes da rodada cara quando houver capturas.
- A verificação de dados comparou a operação atual com o backup feito antes da longa espera. Exclusões legítimas anteriores à instalação dispararam um alerta incorreto. O script antigo também anunciou retorno sem confirmar que a imagem anterior havia sido encontrada.

## Aplicar já no trabalho do agente

1. Estado de retomada curto, com versão instalada, decisões, pendências e referências; histórico detalhado no git. Reutilizar leituras verificadas da sessão e buscar apenas código relevante.
2. Integrar trabalhos concorrentes e finalizar código/referências antes da rodada completa. Consultar CI em resumos; logs somente para investigar falhas ou confirmar um caso concreto.
3. Não repetir testes aprovados por rotina. Metadados e recibos posteriores devem ter checagens documentais proporcionais; isso não altera a exigência de validação do código funcional.
4. Antes de trocar o app, verificar que a referência de retorno resolve para a imagem em execução e preservá-la. Retorno só pode ser declarado após conferir comando, versão e saúde. Não sobrescrever auditoria ou restaurar exclusões legítimas concorrentes.

## Próxima implementação, em ordem de impacto

1. Medir e retirar construções duplicadas no caminho main/publicação, testando a imagem publicada por digest ou promovendo exatamente o artefato aprovado. Manter vínculo entre fonte, arquitetura, teste e digest; não reaproveitar resultado de uma versão diferente.
2. Classificar testes por impacto usando o mapa de jornadas: núcleo obrigatório para fila, atribuição, permissões e isolamento, mais os fluxos afetados. Definir onde permanece a regressão completa e provar a seleção com controles negativos antes de mudar gates.
3. Consolidar instalação em um procedimento único que verifica gates/versão, faz backup, preserva o retorno, instala somente os serviços afetados e grava um recibo confiável. O script manual desta rodada ainda não é essa solução reutilizável.
4. Corrigir separadamente a configuração do workflow de corte de release (client-id/app-id ausente), sem misturar isso com alteração de comportamento do CRM.

Estas mudanças de pipeline ainda não foram implementadas. Não prometer minutos ou porcentagem de redução antes de comparar uma rodada real com a linha de base.
