# Fontes, áudio e legendas — 0.5.0

Referência: `ysosrs123/NuvioTV-Fork@45e0984`. O player é reimplementado para webOS;
Media3, MPV e as bibliotecas Android não são executados na TV LG.

## Uso

Na lista de fontes, selecione **Todos** ou um addon. **Reproduzir melhor fonte**
respeita o addon selecionado e mantém o fallback das exclusões do fork. A lista
manual mantém os filtros estritos; **Mostrar todas** permite revisá-los. **Atualizar**
busca links novos. Ao voltar do vídeo, filtro, lista e foco são restaurados;
os resultados são reutilizados por até dois minutos, somente em memória.

Durante o vídeo, abra **Áudio** ou **Legendas**. As setas e OK selecionam a faixa;
**Voltar** fecha primeiro o painel, mantendo o vídeo. Áudio mostra somente faixas
que o player da plataforma expõe. Sem essa API, o painel informa a indisponibilidade.
A seleção verifica as propriedades retornadas pela API e restaura o estado anterior
quando a operação falha. Isso não comprova que a saída audível da LG mudou.

Legendas reúne faixas internas expostas por `textTracks`, arquivos anunciados
pela fonte e resultados dos addons que declaram o recurso `subtitles` para o tipo
reproduzido. A busca ocorre apenas ao abrir o painel, sem atrasar o início do vídeo.
Para séries, envia o ID do episódio e, quando fornecidos pela fonte, `videoHash`,
`videoSize` e `filename`. Não calcula nem inventa hashes. Não envia tokens Nuvio
para addons ou servidores de legendas.

Selecione uma legenda externa **SRT ou WebVTT**. O app interpreta o arquivo e
mostra texto sobre o vídeo; SRT não depende de suporte nativo do webOS. Aceita
UTF-8, UTF-16 com BOM e fallback Windows-1252. Formatação HTML/ASS é removida,
conteúdo é inserido como texto e marcações de posicionamento VTT são ignoradas.
**Ajustes de legenda** altera tamanho, fundo e atraso de −10 a +10 segundos
(em passos de 0,5 s). Tamanho/fundo são locais e persistentes; atraso vale para
a reprodução atual. Ajustes não afetam legendas internas. **Desativadas** remove
legendas. Se um download falhar, a legenda anterior continua selecionada.

A barra de posição aceita ponteiro e setas esquerda/direita, em passos de 10 s.
Fontes sem duração finita não permitem busca nessa barra. Botões ±30 s e teclas
de mídia continuam disponíveis. Não há novo decodificador ou transcodificação.

## Medidas e custo na LG

- Painéis seguem `AudioSelectionOverlay.kt`, `SubtitleSelectionOverlay.kt` e
  `PanelComponents.kt`: largura 320 dp, raio 20 dp, preto 85%, margem 44/28 dp,
  padding 16/14 dp e linhas com padding 12/7 dp. Altura limitada a 484 dp na
  tela lógica de 960×540 para manter todas as ações acessíveis por rolagem.
- Fontes seguem `StreamScreen.kt`: chips em faixa de 56 dp, painel com raio
  24 dp, cartões de 16 dp de padding, textos 16/24 e 12/16, logo de 32 dp.
- Até 30 provedores, três consultas simultâneas, 300 fontes por addon e 100
  cartões renderizados. Badges refletem metadados, não inspeção do vídeo.
- Até 300 opções externas, 64 faixas internas, arquivos de até 2 MiB e 20 mil
  cues. Busca binária por tempo, sem varrer todo o arquivo a cada frame.
  Temporizador segue as transições de texto e para quando o vídeo pausa.
- Downloads têm timeout de 15 s e cancelam ao fechar o painel/player. Cues e
  URLs de legendas não vão para localStorage. Há somente um vídeo ativo.

## Limites abertos

Testes locais usam vídeo sintético e addons interceptados. A troca de áudio é
verificada com uma API simulada; **nenhum teste de áudio na LG foi realizado**.
Legendas SRT/WebVTT são renderizadas de verdade sobre esse vídeo no navegador.
Login e importação dos addons continuam cobertos pelos testes anteriores.

A LG documenta `audioTracks` desde webOS 3, mas o resultado varia com transporte,
contêiner e codec. HLS continua usando o player nativo. MKV com legendas embutidas,
PGS, ASS/SSA, ZIP, seleção de resolução HLS, ajuste fino de estilo/posição,
preferências automáticas de idioma, busca manual de legendas e controles avançados
do fork permanecem pendentes. CORS e URLs expiradas podem impedir downloads.
Ainda falta comparar Android e LG com os mesmos dados e testar áudio/sincronismo,
suspensão, sessões longas e 4K/HDR no aparelho.

## Referências verificadas

- [LG: seleção de áudio por audioTracks](https://forum.webostv.developer.lge.com/t/video-multi-audio/24156).
- [LG: formatos webOS 24, WebVTT](https://webostv.developer.lge.com/develop/specifications/video-audio-240).
- [LG: limitações de legendas internas](https://forum.webostv.developer.lge.com/t/multi-subtitles-in-video-url/1297).
- [LG: protocolos de streaming](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm).
- Contrato dos addons: `data/repository/SubtitleRepositoryImpl.kt` e
  `ui/screens/player/StreamSidecarSubtitles.kt` do fork preservado nesta árvore.

## Automação de reprodução (0.12)

[PLAYBACK_AUTOMATION.md](PLAYBACK_AUTOMATION.md) documenta seleção automática de
idiomas, busca opcional de legendas dos addons e próximo episódio. A descrição
de busca apenas ao abrir o painel acima corresponde à configuração padrão: a
nova opção permite buscar automaticamente. Validação na LG ainda pendente.
