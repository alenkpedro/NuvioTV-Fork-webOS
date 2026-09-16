# O que o NuvioTVSmart faz e o port ainda não — referência de mecanismos

O alvo do port continua sendo o **ysosrs123/NuvioTV-Fork**. O `NuvioMedia/NuvioTVSmart`
(GPL-3.0, web app de webOS) entrou como **referência de mecanismos que só existem nesta
plataforma**, porque ele resolve em JavaScript coisas que o fork resolve em Kotlin/Android.
Este documento registra o que foi estudado e a ordem combinada de port.

## Já portado desta referência (0.31.0)

| Mecanismo do Smart | Onde está no port |
|---|---|
| Serviço local com requisições HTTP próprias (`services/plugin-http.cjs`, cabeçalhos, redirecionamento, limites, gzip) | `service/net.js` + comando `fetch` do serviço `org.nuviofork.webos.segments`, com cliente em `src/core/net-service.js` (fallback para `fetch` no navegador). Resolve o limite de CORS/cabeçalhos documentado desde a 0.1. |
| Trailer do YouTube **dentro do app**: página local que hospeda o player e conversa por `postMessage` (`docs/youtube-proxy.html`, protocolo `nuvio-youtube-proxy`, estado a cada 500 ms, comandos, `fallback` para o embed direto quando a API não sobe) | `public/youtube-proxy.html` + `src/trailer-player.js` + `src/core/youtube-trailer.js`. O trailer toca no app (detalhe e pós-reprodução) e o app do YouTube, o navegador da TV e o QR continuam a um OK de distância. |

## Ainda por portar (estudado, com o arquivo de referência)

| Mecanismo | Referência no Smart | O que falta no port |
|---|---|---|
| Proxy de mídia local | `services/webos/runtime/media-http.cjs`, `js/platform/webos/webosPlaybackProxy.js`, `js/core/media/imageProxy.js` (portas 2710/2711) | Serviço que escuta em `127.0.0.1` e repassa **Range + cabeçalhos** da fonte para o `<video>`. É o que faz fonte com `Referer`/`User-Agent` tocar; hoje o port marca essas fontes como indisponíveis. |
| Plugins JS | `js/core/player/plugin{Manager,Runtime,Worker,Policy,Security,Models,StreamMapping}.js`, `js/platform/webos/webosPluginService.js`, `services/webos/plugin/`, `js/ui/screens/plugin/*`, `js/core/profile/pluginSyncService.js` | Repositórios com `manifest.json` (scrapers NUVIO_JS/EXTERNAL_DEX/LEGACY), execução em sandbox com HTTP pelo serviço, sincronização pela conta e tela de plugins. |
| Legendas ASS/SSA e PGS/VOBSUB | dependências `assjs`, `libbitsub`, `jszip`; comandos `subtitleText`, `bitmapSubtitlePrepare`, `bitmapSubtitleWindow`, `embeddedSubtitleTextWindow` no serviço | Renderização de ASS/SSA externo/interno e legendas de imagem (extraídas do Matroska pelo serviço). Hoje o port trata isso como "não dá". |
| HLS/DASH próprios | `js/runtime/loadStreamingLibs.js` com `hls.js` e `dashjs` | Tocar HLS/DASH sem depender do suporte nativo (o fork usa Media3). |
| Extração de faixas do contêiner | comando `tracks` do serviço (Matroska) | Listar faixas de áudio/legenda internas sem depender do que o navegador expõe. |
| Sync por deltas/tempo real, transferência de biblioteca | `js/core/sync/*`, `js/core/cloud/*`, `LibraryTransferFlow.kt` no fork | Envio incremental e importar/exportar biblioteca (o Smart usa página local + QR, o que cabe na TV). |

## Ordem combinada para as próximas rodadas

1. **Proxy de mídia local** (destrava fonte com cabeçalhos, debrid direto e legendas com header).
2. **Plugins JS** (o maior item de paridade com o ecossistema).
3. **ASS/PGS + HLS/DASH** pelo mesmo serviço.
4. **Trakt/Simkl** (login por código, progresso, listas como fonte de coleção, comentários no detalhe) — já pode usar o serviço de rede da 0.31.0.
5. **Direct Debrid** (chaves + resolução) e **transferência de biblioteca**.
6. **Avaliação de dispositivo**, **modo de experiência**, extras de aparência/coleções/perfis e diagnóstico do player.

Nada do Smart é copiado como base: os mecanismos são reimplementados no port e citados aqui e
em `THIRD_PARTY_NOTICES.md`.
