---
impacto: capacidade_nova
secao: adicionado
titulo: Publicação do fork com imagem conferida e retorno verificável
---
Alterações só de documentação passam pelas verificações documentais sem reconstruir o sistema. A publicação confere as imagens já enviadas por digest, arquitetura e fonte, evitando outra compilação para as mesmas sondas. O procedimento de publicação do app do fork confere os testes, preserva backup e a imagem realmente em execução, altera somente o app e grava um recibo. Falha na recuperação é declarada como falha. Mudanças em dependências compartilhadas ou banco exigem atualização coordenada.
