# Detalhes, pessoas e trailers — 0.10.0

Referência única: `ysosrs123/NuvioTV-Fork@45e0984`. Código Android preservado
neste repositório. A integração funciona com os contratos verificados abaixo;
a reprodução externa e a fluidez ainda precisam de validação na LG 55UT8050.

## Recursos e uso

- Detalhes aproveitam `app_extras.cast`, `directors` e `writers`, incluindo foto,
  personagem e `tmdbId`. Campos simples `cast`, `director`, `writer`/`writers`
  continuam aceitos; nomes duplicados são consolidados e direção/roteiro vêm antes.
- Abas **Elenco**, **Semelhantes** e **Trailers** mudam ao receber foco. A volta
  de uma pessoa ou recomendação mantém a aba e o cartão selecionado.
- Elenco abre uma tela de pessoa: foto, biografia expandida ao pressionar a foto,
  datas/local de nascimento, área de atuação e filmografia. Filmes e séries são
  combinados, deduplicados por tipo/ID e ordenados por ano decrescente. Diretores
  e roteiristas priorizam créditos de equipe conforme o fork.
- TMDB acrescenta elenco identificado, recomendações e trailers. Resultados com
  `tmdb:` são convertidos para IMDb, quando o serviço fornece a associação, antes
  de solicitar detalhes/episódios e fontes aos addons instalados. Não se adivinha
  identidade por nome. Sem associação ou addon compatível, reprodução pode faltar.
- Trailers aceitam `source`, `ytId`, `trailerStreams` e `trailerYtIds`; apenas IDs
  válidos do YouTube, deduplicados. Há botão no hero e faixa com miniaturas.
- Selecionar um trailer abre **Abrir no YouTube**, **Abrir no navegador da TV**
  e QR code para o celular. Não usa o player de filmes, não registra progresso,
  não marca como assistido e não reproduz automaticamente. Voltar fecha o painel
  e restaura o cartão. Falha do aplicativo externo mantém as alternativas visíveis.

## Configuração TMDB

**Ajustes → Integrações → TMDB** recebe uma chave pessoal **API v3** e o idioma
(pt-BR, en-US ou es-ES). Salvar verifica a conexão; Remover chave desativa a
integração. Uma chave salva não reaparece no campo de texto. Nenhuma chave real
é incluída no pacote ou no repositório; os testes usam apenas valores fictícios.

O fork Android lê `TMDB_API_KEY` e `TRAILER_API_URL` de propriedades privadas da
compilação (`app/build.gradle.kts`); não há valor público para reutilizar. O login
Nuvio não retorna essas propriedades. Por isso, biografias/filmografia e
recomendações requerem configurar o TMDB nesta TV. Elenco e trailers já presentes
nos addons continuam disponíveis sem chave. Pessoa sem `tmdbId` mostra os dados
recebidos e explica como completar o elenco, sem escolher uma pessoa por nome.

Configuração separada em `nuvio-fork.webos.metadata.v1`, compartilhada pelos perfis
**desta TV**, sem envio ao Nuvio, ao índice Homebrew, ao histórico ou à fila de
sincronização. A chave é enviada somente à API oficial do TMDB. Preferência de
idioma e chave ainda não são sincronizadas com as configurações do Android.

## Referências

| Código Android | Comportamento portado |
|---|---|
| `data/mapper/MetaMapper.kt`, `MetadataFieldMappers.kt` | Elenco enriquecido do addon e formatos de trailers |
| `core/tmdb/TmdbService.kt` | Associação IMDb/TMDB por ID e tipo |
| `core/tmdb/TmdbMetadataService.kt` | Créditos, aggregate credits de séries, recomendações, pessoa e biografia em inglês como fallback |
| `ui/screens/detail/MetaDetailsScreen.kt` | Abas transparentes, separadores e ativação por foco |
| `ui/screens/detail/CastSection.kt` | Fotografias circulares e créditos de equipe antes do elenco |
| `ui/screens/detail/MoreLikeThisSection.kt`, `TrailerSection.kt` | Cartões horizontais 260×146, raio 12, gap 12 |
| `ui/screens/cast/CastDetailScreen.kt` | Retrato 160×240, nome 32/40, filmografia 112×168, ordenação por ano |
| `res/raw/trailer_play_button.svg`, `mdblist_tmdb.svg` | Ícone de trailer e logo TMDB copiados sem alteração |

Documentação oficial consultada:
[autenticação TMDB](https://developer.themoviedb.org/docs/authentication-application),
[créditos combinados](https://developer.themoviedb.org/reference/person-combined-credits),
[recomendações](https://developer.themoviedb.org/reference/movie-recommendations),
[Application Manager LG](https://webostv.developer.lge.com/develop/references/application-manager),
[ponte do SDK LG](https://github.com/webOS-TV-app-samples/webOSTVJSLibrary/blob/main/Launch_Parameters/lib/webOSTVjs-1.2.13/webOSTV.js),
[YouTube no Connect SDK](https://github.com/ConnectSDK/Connect-SDK-Android-Core/blob/master/src/com/connectsdk/service/WebOSTVService.java).
O ID `youtube.leanback.v4` e `contentId` seguem o Connect SDK; a chamada usa a
ponte nativa `PalmServiceBridge` e o serviço Luna `applicationManager/launch`.
Retorno positivo confirma abertura solicitada, não reprodução efetiva do vídeo.

## Limites e diferenças restantes

- Metadados extras carregam após os dados do addon, sem bloquear o botão Assistir.
  Abrir um resultado TMDB pode exigir primeiro resolver sua identidade.
- Timeout de oito segundos por consulta, cancelamento ao sair e cache apenas em
  memória: até oito respostas por cinco minutos, 1.048.576 caracteres por resposta,
  2.097.152 caracteres no total; o transporte continua limitado a 6 MiB decodificados.
- Até 40 pessoas, 20 recomendações e 20 trailers. Filmografia retém até 500 títulos
  e desenha 30 por página; o restante é acessível com Anteriores/Próximos. Sem
  prefetch de imagens de todos os créditos nem resolução antecipada de cada IMDb ID.
- Falha do TMDB preserva os dados do addon e oferece nova tentativa. Erros não
  exibem URL com chave. A configuração pode ser removida durante a validação;
  uma resposta atrasada não reativa a integração.
- A biografia usa diálogo rolável para leitura completa; o Android expande o hero.
  TMDB complementa as seções nesta etapa; não substitui automaticamente toda a
  sinopse, logo e arte principal dos títulos já fornecidos por addons.
- Recomendações exibem a primeira página (até 20). Coleções, créditos adicionais,
  avaliações MDBList, preferência de fonte Trakt e tradução avançada de nomes
  ainda não estão portados. Datas de pessoa são exibidas como recebidas (ISO).
- Playback de trailers **externo**, via YouTube/navegador, difere do overlay interno
  Android. Resolver privado de trailers, NewPipe/Media3, áudio/vídeo separados e
  trailers automáticos não foram portados. A ponte nativa foi testada com simulação;
  abertura, disponibilidade do YouTube e retorno dependem da TV/aplicativo instalado.
- Comparação visual usa fixtures sintéticas; ainda não é comparação pixel a pixel
  com Android e LG exibindo o mesmo conteúdo real.

Validação automatizada cobre mapeamento, identidade, cache, cancelamento,
configuração, navegação, retorno com foco, geometria, falhas e abertura nativa
simulada. Nenhuma conta, chave ou histórico pessoal é usado nos testes.

Próxima etapa sugerida: coleções/franquias e avaliações adicionais na tela de
detalhes, mantendo a rastreabilidade e os limites de plataforma.
