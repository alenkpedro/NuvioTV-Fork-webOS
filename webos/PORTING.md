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
5. Esta versão prioriza um alvo recente (webOS 24) e não declara compatibilidade
   com TVs LG antigas. JavaScript é compilado para Chromium 108.

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
