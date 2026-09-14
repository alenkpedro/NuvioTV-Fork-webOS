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
| `src/core/storage.js` | Nova persistência webOS; não compartilha o formato Android DataStore nem implementa a sincronização original. |
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
