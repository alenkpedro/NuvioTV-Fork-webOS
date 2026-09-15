# Rastreabilidade do port

Base fixada: `ysosrs123/NuvioTV-Fork@45e0984c18460d2a65c5d745999011b4314328eb`.
Os caminhos de origem abaixo são relativos a `app/src/main/java/com/nuvio/tv/`.

| Implementação webOS | Código de origem / relação |
|---|---|
| `src/core/fork-defaults.json` | Extraído de `domain/model/DebridSettings.kt` e `core/debrid/TrashReleaseGroups.kt`. 31 preferências, 104 grupos preferidos e exclusões originais. |
| `src/core/ranking.js: factsFor` | Port de `core/debrid/DirectDebridStreamFilter.kt`: resolução estruturada prioritária, qualidade, tags, grupos e rankings. |
| `src/core/ranking.js: rankStreams` | Port de `core/player/StreamQualityRank.kt`, incluindo fallback quando todas as fontes são excluídas e estabilidade em empates. |
| `src/core/ranking.js: filterAndSort` | Filtros, comparadores, prioridade de cache e limites de `DirectDebridStreamFilter.kt`. Nesta prévia a UI permite aplicá-los à lista de todos os add-ons; o original os aplica à lista Direct Debrid. |
| `src/core/ranking.js: sizeBytes` | Port de `core/debrid/StreamTextSizeParser.kt`, incluindo unidades binárias e precedência de campos estruturados. |
| `src/core/auto-play.js` | Port de `core/player/StreamAutoPlaySelector.kt` e `core/player/StreamAutoPlayPolicy.kt`: os quatro modos, `orderAddonStreams` resumido à ordem dos add-ons (sem plugins), exclusões extraídas de `(?!...)` e o escopo por add-on. Ver [AUTO_PLAY.md](AUTO_PLAY.md). |
| `src/core/link-cache.js` | Port de `data/local/StreamLinkCacheDataStore.kt`: chave por conteúdo, validade pela duração configurada e loja limitada. Somente links HTTP(S), porque torrents não têm reprodução neste alvo. |
| `src/core/trailer.js` | Port de `data/local/TrailerSettingsDataStore.kt` e de `PostPlayRecommendationState.kt` (contador de 5 s). O player trabalha em segundos; o fork em milissegundos. |
| `src/core/buffer.js` | Port das duas durações de `PlayerSettingsDataStore.BufferSettings` que o elemento de mídia da TV obedece (`bufferForPlaybackMs`, `bufferForPlaybackAfterRebufferMs`), com os padrões e faixas do fork e o tempo limite de espera. Ver [NETWORK.md](NETWORK.md). |
| `src/core/speed-test.js` | Port de `core/network/StreamSpeedTester.kt` sobre o transporte do port: aquecimento, orçamento de bytes, janela e sub-janelas. O `StreamSweepEngine` (conexões paralelas) não tem equivalente. |
| `src/core/collections.js`, `collections-screen.js` | Port de `data/local/CollectionsDataStore.kt`, `domain/model/Collection.kt`, `CollectionManagementScreen.kt` e `CollectionEditorScreen.kt`: coleções, pastas, fontes de catálogo/TMDB e as fileiras da Home. A resolução de cada tipo de fonte do TMDB segue `core/tmdb/TmdbCollectionSourceResolver.kt`. Ver [COLLECTIONS.md](COLLECTIONS.md). |
| `src/core/addons.js` | Contratos de `data/remote/api/AddonApi.kt` e comportamento de URLs de `data/repository/AddonRepositoryImpl.kt`; transporte substituído por fetch limitado/cancelável. |
| `src/core/account.js`, `account-sync.js` | `core/auth/AuthManager.kt`, `ui/screens/account/AccountViewModel.kt`, `core/sync/AddonSyncService.kt`: vinculação, renovação, resolução de proprietário e leitura de addons do perfil principal. Ver [ACCOUNT.md](ACCOUNT.md). |
| `src/core/presentation.js`, opções em `app.js`/`style.css` | `LayoutPreferenceDataStore`, `ModernHomeContent`, `ModernSidebarBlurPanel`, `HeroSection`, `EpisodesSection`, `CastSection`. Ver [UI_REFERENCE.md](UI_REFERENCE.md) para dimensões e diferenças. |
| `src/core/subtitles.js`, `media-tracks.js`, `player-tracks.js` | Contrato `SubtitleRepositoryImpl`, painéis `AudioSelectionOverlay`/`SubtitleSelectionOverlay`/`PanelComponents`, seleção por APIs web LG e renderização SRT/VTT local. Ver [PLAYER.md](PLAYER.md). |
| `src/core/storage.js`, `profiles.js`, `profile-screen.js` | Persistência por usuário/perfil, tela `ProfileSelectionScreen`, PIN `ProfileSyncService`, leitura paginada `SupabaseLibrarySyncRemoteDataSource`. Ver [PROFILES.md](PROFILES.md); envio à nuvem e histórico remoto pendentes. |
| `src/app.js`, `src/remote.js` | Nova implementação de plataforma para os fluxos do fork; Compose/Media3 não são carregados no webOS. |

## Diferenças deliberadas

1. Elegibilidade do player webOS é checada antes do ranking automático. Um
   fallback do ranking não reabilita torrent, links externos, resolvedores não
   portados, cabeçalhos customizados ou DV-only bloqueado pelo perfil da TV.
2. Detecção de DV-only usa o texto anunciado pela fonte. HDR+DV não é bloqueado,
   mas a presença de uma base HDR10 utilizável não foi verificada no bitstream.
3. O player usa HTTP(S) nativo, sem copiar as promessas de throughput, buffer,
   conversão HDR e passthrough da implementação Android.
4. Dados e listas de preferência são fiéis à base fixada; os testes portam os
   cinco cenários de `StreamQualityRankTrashTest.kt`, além de cenários de tamanho,
   requisitos, limites e compatibilidade. Não houve execução diferencial de toda
   a suíte Kotlin e não se afirma paridade integral do aplicativo.
5. Esta versão prioriza um alvo recente (webOS 25) e não declara compatibilidade
   com TVs LG antigas. JavaScript é compilado para Chromium 108.
6. O cache do último link é consultado antes de pedir as fontes aos add-ons; o
   fork pede a lista e depois decide. Desligar o ajuste apaga os links guardados,
   o que o fork não faz.
7. O trailer automático não reproduz YouTube dentro do app: o detalhe abre o
   diálogo do trailer e o fim do filme abre o aplicativo do YouTube da TV. O fork
   reproduz os dois dentro de uma segunda instância do player.
8. O buffer personalizado usa as faixas carregadas do elemento de mídia, não um
   orçamento de bytes; as janelas min/max, o cache em disco e as conexões
   paralelas do Media3 continuam fora do alcance e aparecem como pendentes.
9. A medição de velocidade reporta taxa e latência por fonte sem reordenar a
   lista: o `StreamSweepEngine` do fork escolhe uma configuração de rede, o que um
   aplicativo web não faz.
10. As coleções vão e voltam pela conta (`sync_pull_collections` e
   `sync_push_collections`), no mesmo blob do app Android. Provedores que a TV não
   abre — listas do Trakt — são preservados no formato original, para que editar
   aqui nunca apague uma lista criada em outro cliente. Aparência da fileira
   (capa, GIF, emoji, formato e modo de exibição) e a importação/exportação JSON
   continuam fora.
11. Long press não existe no fork Android (o gesto é declarado, nunca conectado).
   O port implementa o gesto e o usa em Continuar assistindo, onde ele abre
   Retomar/Remover do histórico.
12. O campo da chave do TMDB é texto aberto com contador, não mascarado: o teclado
   do webOS entrega o texto de forma incompleta em campos de senha.
13. Legendas: o player espera até 3,5 s pela escolha automática da faixa (inclusive
   legenda externa de add-on) antes de iniciar, para que o primeiro quadro já
   apareça legendado. Acima de 1× a correção de tom é desligada para aliviar o
   decodificador da TV.

## Próximos marcos

Sequência e acompanhamento: [ROADMAP.md](ROADMAP.md). A cada entrega, sugerir a próxima etapa ao usuário.

- Instalação, melhoria visual da 0.2 e login da 0.3 confirmados pelo usuário na UT8050. Validar as novas opções da 0.4 e os formatos de reprodução sem registrar tokens de configuração.
- Validar formatos HTTP/HLS, 4K, HDR10/HLG, áudio, legendas e suspensão na TV.
- Implementar um serviço local de transporte e investigar integração com o
  player antes de portar `ParallelRangeDataSource` e `StreamSweepEngine`.
- Adaptar MDBList, Trakt, Simkl e debrid direto com credenciais fornecidas pelo
  usuário na própria interface; separar persistência e autenticação por serviço.
- Comparar a renderização Android/webOS com os mesmos dados e preferências;
  concluir telas, integrações e variações ainda não portadas. Ver [UI_REFERENCE.md](UI_REFERENCE.md).

Referências de plataforma:

- https://webostv.developer.lge.com/develop/references/appinfo-json
- https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine
- https://webostv.developer.lge.com/develop/specifications/video-audio-240
- https://webostv.developer.lge.com/develop/guides/back-button
- https://github.com/webosbrew/docs/blob/main/test/repo.json

## Histórico — entrega 0.7

`src/core/history.js` e `account.history` adaptam `WatchProgressSyncService`,
`WatchedItemsSyncService`, `WatchProgressPreferences` e `ProfileSettingsSyncService`.
Leitura nativa Nuvio, unidades em milissegundos convertidas para o player,
conclusão a 90%, identidade de episódio e precedência de alterações locais sem
escrita remota. Contratos, limites e fallback de provedores: [HISTORY.md](HISTORY.md).

## Envio nativo — entrega 0.8

`core/outbox.js` implementa fila persistente por perfil, preflight completo,
revisões locais e confirmações por item. `account.mutate` usa as RPCs de
`WatchProgressSyncService`, `WatchedItemsSyncService` e
`SupabaseLibrarySyncRemoteDataSource`. Contratos e limites: [SYNC.md](SYNC.md).

## Descobrir e busca — entrega 0.9

`core/discovery.js`, `discovery-screen.js`, `genre-labels.json`: regras de
`SearchViewModel`, `CatalogDescriptorExtensions`, `SearchHistoryDataStore` e
`GenreLabelFormatter`; layout de `SearchDiscoverSection`, `SearchScreen` e
`SearchUiState`. `genre-labels.json` deriva das chaves do formatter e strings
pt-BR do commit de referência. Regras e adaptações: [DISCOVERY.md](DISCOVERY.md).

## Entrega 0.10 — metadados e pessoas

Veja [METADATA.md](METADATA.md) para contratos, geometria do fork, configuração
TMDB própria e diferenças. Elenco aproveita app_extras; pessoa inclui biografia
em diálogo e filmografia em páginas de 30. Recomendações e trailers usam cartões
260×146; filmografia 112×168 e foto de pessoa 160×240. As abas transparentes com
separadores mudam ao receber foco. Ícone de trailer e logo TMDB vêm dos SVGs
originais. Trailers abrem externamente no YouTube/navegador, com QR alternativo;
o overlay de reprodução Android ainda não foi portado. Testes da ponte nativa
são simulados e não substituem validação na LG.

## Entrega 0.11 — coleções e avaliações

[COLLECTIONS_RATINGS.md](COLLECTIONS_RATINGS.md) registra os contratos TMDB/MDBList,
origem dos ícones e diferenças restantes. Coleções: cards 260×146, gap 12,
margens 48, ordem de lançamento e 30 itens por página. Avaliações: logos 24,
gaps 14/6 na faixa reservada do hero; consultas de leitura com três fontes em
paralelo. As chaves são locais à TV e independentes do login Nuvio. Testes usam
fixtures, sem validação física na LG ou chave real do usuário.

## Entrega 0.12 — idiomas e próximo episódio

[PLAYBACK_AUTOMATION.md](PLAYBACK_AUTOMATION.md) registra regras, defaults e diferenças
do player. Cartão baseado em PostPlayOverlay, 420 dp, padding 10/9, textos 11/14 sp;
contagem cancelável adaptada ao ciclo de vida webOS. Preferências locais, idioma
principal/secundário e prioridade para escolhas manuais. Validação física pendente.

## Entrega 0.13 — legendas e memória de faixas

[SUBTITLE_PREFERENCES.md](SUBTITLE_PREFERENCES.md) descreve forçadas em função do
áudio, limpeza SDH de legendas externas, coluna/filtro de idiomas e memória por
título e perfil. Atualiza as pendências indicadas nas entregas anteriores.
Faixas internas, formatos e navegação física ainda exigem validação na LG.

## Entrega 0.14 — velocidade, sincronização e continuidade

[PLAYBACK_TIMING.md](PLAYBACK_TIMING.md) registra velocidade por título, atraso
por vídeo, memória por perfil e confirmação após avanços automáticos. O cartão
usa geometria do PostPlayOverlay, com foco modal adaptado ao webOS. Netflix Sans
Regular fornecida pelo usuário é aplicada às externas e solicitada por CSS nas
nativas; o motor da LG pode ignorar estilos de texto nativo. Velocidade verifica
aceitação da API, não o decoder. Validação física permanece pendente.

## Entrega 0.15 — painel de episódios e modos de imagem

[EPISODES_ASPECT.md](EPISODES_ASPECT.md) descreve o painel de 520 dp derivado de
EpisodesSidePanel, navegação/consulta de fontes sem sair do player e seleção
manual com retomada e retorno para o episódio correto. As sete fórmulas de
PlayerAspectScaleUtils foram transpostas para CSS sobre o vídeo. Paginação de
50 cartões adapta a lista lazy; geometria do compositor LG ainda não validada.

## Correção 0.15.1 — fonte das legendas internas

[SUBTITLE_FONT.md](SUBTITLE_FONT.md): texto nativo exposto por TextTrack agora
usa a camada do app com Netflix Sans, após verificar carregamento e modo hidden.
Faixas opacas/imagens e plataformas que recusam hidden continuam nativas,
com aviso. Prévia e estado real do carregamento disponíveis no painel.
Validação física da fonte na LG permanece pendente.

## Estilo 0.15.2 — preset de legenda solicitado pelo usuário

[SUBTITLE_FONT.md](SUBTITLE_FONT.md): Medium 500 real fornecida no ZIP, branco,
sombra curta, 3,6% da altura, entrelinha 1,16, largura máxima 78% e margem
inferior 6,5% com controles recolhidos. Preset fixo substitui tamanho/fundo
antigos e remove prévia, informações da fonte e controles de aparência.
É uma personalização explícita solicitada pelo usuário, aplicada sobre o port.
Seleção de faixa, SDH e atraso continuam; limites das faixas opacas permanecem.

## Entrega 0.16 — reconstrução da barra do player

[PLAYER_PARITY.md](PLAYER_PARITY.md) rastreia medidas, assets, navegação e funções
contra PlayerScreen.kt, PlayerScrubRates.kt e StreamSourcesSidePanel.kt. A barra
anterior foi substituída. Painel de fontes do vídeo atual inclui filmes e
preserva progresso na troca. APIs de motores Android não foram simuladas.
A revisão integral do player permanece prioritária; veja as diferenças no mapa.

## Entrega 0.17 — painéis e sincronização por fala

[PLAYER_TRACKS_SYNC.md](PLAYER_TRACKS_SYNC.md): geometria de AudioSelectionOverlay,
SubtitleSelectionOverlay, PanelComponents e PlayerOverlayScaffold.
`core/subtitle-timing.js` porta a janela de frases de SubtitleTimingDialog
(±180 s, até 90), compensação de 300 ms de PlayerRuntimeControllerSubtitleTiming
e limites/passos de SubtitleDelayConfig. Legendas já carregadas são reutilizadas.
Ajustes DSP/atraso de áudio e temporização nativa continuam pendentes.

## Entrega 0.18 — tela de pausa e logos

Transposição de `PauseOverlay.kt` e da regra de pausa manual do runtime: opção
inicialmente desativada, abertura após 5 segundos, sinopse, episódio, oito pessoas
e ficha foto/personagem. Logos de catálogos não são apagadas por metadados sem
imagem. Enriquecimento TMDB usa `images` na chamada de detalhe e seleção de
idioma/região baseada em `TmdbMetadataService`; atualiza o player sem reiniciá-lo.
Ver [PLAYER_PAUSE_ARTWORK.md](PLAYER_PAUSE_ARTWORK.md) para diferenças e validação.

## Entrega 0.19 — trechos, miniaturas e aparência

IntroDB com serviço Node local de destino fixo para compatibilidade CORS na LG.
Botões, condições e preferências derivados de SkipIntroButton/VisibilityRules.
StyleRail com família Netflix Sans fixa; preset anterior é o padrão restaurável.
Miniaturas mantêm geometria de SeekThumbnailPane, com cache limitado do vídeo
principal; worker Android antecipado não portado. Ver [PLAYER_EXTRAS.md](PLAYER_EXTRAS.md).

## Entrega 0.20 — ajustes alinhados ao fork

`SettingsScreen.kt` e `SettingsDesignSystem.kt` substituíram a lista anterior por
rail de categorias e painel de grupos, com títulos e subtítulos das strings pt-BR.
`ThemeColors.kt`, `SupporterThemeColors.kt` e `PrimitiveTokens.kt` fornecem as doze
paletas de `AppTheme`; `ThemeDataStore.kt` e `SettingsUiStyle.kt` definem AMOLED,
superfícies em preto puro e os estilos Padrão, Minimalista e Barra Superior.
`LayoutSettingsScreen.kt`, `PlaybackSettingsSections.kt`, `NetworkSettingsScreen.kt`
e `AboutScreen.kt` guiam os grupos e a redação de cada categoria. O editor de
legendas do player passou a ser acessível também em Ajustes. Linhas sem
equivalente webOS permanecem visíveis, marcadas como pendentes.
Ver [SETTINGS_PARITY.md](SETTINGS_PARITY.md).

## Entrega 0.21 — guia parental e pós-reprodução

`ParentalGuideRepository.kt` e `ParentalGuideOverlay.kt` orientam a consulta de
avisos de conteúdo, a regra de severidade dominante e a animação de entrada/saída;
`ParentalGuideApi.kt` e `NetworkModule.kt` fixam o endereço base (que responde com
CORS liberado, permitindo a chamada direta na TV). `PostPlayRecommendationTiming.kt`
define os limiares, `PostPlayRecommendationController.kt` o ciclo de vida das
recomendações e `PostPlayRecommendationOverlay.kt`/`PostPlayOverlay.kt` o layout.
`PlayerSettingsDataStore.kt` fornece os padrões e a faixa de 80–100% do limite.
Ver [PARENTAL_POST_PLAY.md](PARENTAL_POST_PLAY.md).
