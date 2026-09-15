# Trechos, miniaturas e aparência — 0.19.0

Base: `ysosrs123/NuvioTV-Fork@45e0984`. Referências locais: `SkipIntroApi`,
`SkipIntroRepository`, `SkipIntroVisibilityRules`, `SkipIntroButton`,
`SeekThumbnailPane`, `SeekThumbnailPreferences` e `SubtitleSelectionOverlay`.

## Legendas

Em **Player → Legendas → Ajustes de legenda**, os controles da StyleRail incluem:

- Tamanho 50–200%, em passos de 10%; negrito ligado/desligado.
- Texto branco, cinza #d9d9d9, amarelo #ffd700, ciano #00e5ff,
  vermelho #ff5c5c e verde #00ff88, conforme a paleta do fork.
- Opacidade do texto 0–100%, em passos de 10%.
- Contorno ligado/desligado; preto, branco, ciano ou vermelho.
- Posição vertical −20 a 50, em passos de 5; restaurar aparência padrão.

Não há seletor nem informação da fonte na interface. Netflix Sans Medium
continua embutida; negrito usa síntese do navegador sobre a mesma família.
O padrão solicitado anteriormente é a base de 100%: Medium 500, branco,
3,6% da altura lógica, sombras curtas, largura 78% e margem 6,5%.
Posição 5 corresponde a esse padrão; outros valores deslocam a margem por
pontos percentuais. Essa calibração preserva o preset do usuário, em vez de
substituí-lo pelo tamanho inicial do Android. Opacidade afeta o texto; a cor
do contorno permanece independente. Não foi adicionado fundo porque a
StyleRail ativa do fork não oferece esse controle.

A aparência é salva por perfil, separada da sincronização por vídeo. Restaurar
aparência não zera atraso ou preferências de idioma. Configurações antigas de
fonte/tamanho anteriores à 0.15.2 continuam ignoradas. Externas SRT/VTT e internas
com texto acessível compartilham o compositor. Faixas opacas nativas têm o editor
desabilitado; não se declara controle de aparência de ASS/PGS ou legenda gravada.

## Pular trechos

**Ajustes → Reprodução → Pular introduções** vem habilitado. Os controles
aparecem para episódios com IMDb, temporada, episódio e intervalos válidos.
Inclui abertura, recapitulação e créditos. Não estima trechos sem dados. Pular
busca o fim do intervalo no mesmo vídeo, preservando pausa. Voltar dispensa o
botão. Ele some após 10 segundos com controles recolhidos e reaparece ao abrir
a barra. Painéis de faixas, pausa e buscas não perdem foco para esse botão.
O título fica oculto enquanto o botão ocupa sua região, seguindo o fork.
Créditos identificados também antecipam o cartão do próximo episódio.

Três opções separadas permitem pular automaticamente abertura, recapitulação e
créditos. Todas começam desativadas. Cada trecho só é pulado automaticamente uma
vez por reprodução, com o vídeo tocando; retornar ao trecho permite assisti-lo.

A [API IntroDB](https://introdb.app/docs/api) é a mesma do contrato Android:
GET /segments com imdb_id, season e episode. Segundos e milissegundos são
normalizados. Consulta iniciada após o primeiro frame, limite 15 s, cache de até
50 episódios por uma hora. Nenhuma credencial Nuvio ou URL de vídeo é enviada.
Verificado com a API pública: resposta 200 e formato compatível; alguns episódios
só têm créditos ou não têm nenhum trecho.

A API restringe a origem CORS ao próprio site. Na TV, a consulta usa o serviço
local **org.nuviofork.webos.segments**, incluído no mesmo IPK conforme as
[instruções LG](https://webostv.developer.lge.com/develop/guides/js-service-usage).
O serviço usa HTTPS apenas para api.introdb.app/segments; valida os três campos,
não aceita URL/headers arbitrários, não segue redirects, limita resposta a 32 KiB,
duas consultas simultâneas e timeout de 14 s. Não armazena arquivos nem fica
executando tarefas periódicas. Navegador de desenvolvimento usa fetch; testes
interceptam a API. Falha do serviço não interrompe o vídeo. Cancelar a tela
ignora callbacks tardios; eventual pedido HTTPS já iniciado termina no timeout.

## Miniaturas de busca — adaptação parcial

**Ajustes → Reprodução → Miniaturas ao buscar**, inicialmente desativado como no
fork. O painel segue altura 108 dp, raio 6 dp, margens laterais 32 dp, inferior
140 dp; acompanha a posição prevista e permanece até 3 segundos após confirmar.
Voltar, outro painel, suspensão ou saída removem a prévia.

O decoder/worker Android não existe neste port. Para a LG, o cache captura o
próprio vídeo durante a reprodução com canvas, sem segundo player, downloads
adicionais, alteração de CORS da mídia ou busca do vídeo para gerar imagens.
Um quadro por intervalo de 10 s, no máximo 64, até 320×108 px (aproximadamente
8,5 MiB de pixels no pior caso). Prévia só usa quadros a até 10 s da posição
pedida; lacunas ficam sem imagem. O cache é por reprodução e é liberado ao sair.
Não há exportação de pixels ou persistência em disco.

Limitado a fontes até 1080p sem indicação HDR/DV e sem DRM detectado; não captura
com pausa, buffering sem frame, busca, app oculto ou painel aberto. Três erros
consecutivos desativam capturas naquela reprodução. A API de desenho é documentada
em [drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage).
Ainda falta o equivalente à extração antecipada de quadros de partes não vistas,
a persistência Android e a confirmação de captura pelo compositor real da LG.
Não se declara a função integralmente idêntica ao fork.

## Validação

Testes com mídia sintética: estilos externos/internos, fonte invariável,
persistência/reset/perfis, intervalos e identificação, salto manual/automático,
foco/Voltar, próximo episódio nos créditos, respostas tardias, cache de quadros,
confirmação/cancelamento e um único vídeo. Testes do serviço cobrem destino fixo,
validação de parâmetros, redirects, limite de bytes e cancelamento do cliente.
O IPK inclui app, serviço e fonte. Build e testes de navegador não substituem
a validação na LG 55UT8050: serviço Luna, composição de vídeo, HDR/DRM e controle
remoto físico ainda precisam ser conferidos no aparelho.
