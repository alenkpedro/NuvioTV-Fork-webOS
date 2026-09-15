# Guia parental e pós-reprodução — 0.21.0

Base: `ysosrs123/NuvioTV-Fork@45e0984`. Referências locais:
`ParentalGuideRepository.kt`, `ParentalGuideOverlay.kt`, `ParentalGuideApi.kt`,
`PlayerRuntimeControllerMetadata.kt` (`tryShowParentalGuide`, `fetchParentalGuide`),
`PlayerSettingsDataStore.kt` (`parentalGuideEnabled`),
`PostPlayRecommendationTiming.kt`, `PostPlayRecommendationController.kt`,
`PostPlayRecommendationOverlay.kt`, `PostPlayOverlay.kt` e `strings.xml` (pt-BR).

## Avisos de conteúdo (guia parental)

**Ajustes → Reprodução → Avisos de conteúdo** vem **habilitado**, como
`parentalGuideEnabled = true` no fork. Quando o episódio ou filme começa a tocar,
o port consulta o guia do título e desenha o overlay do fork sobre o vídeo:

- Linha vertical de 3 px com o gradiente do tema ativo, crescendo de cima para
  baixo, seguida das categorias em ordem de gravidade (Intenso, Moderado, Leve).
- Rótulos iguais aos do fork: Nudez, Violência, Linguagem Imprópria,
  Drogas/Álcool e Conteúdo Assustador; no máximo cinco linhas.
- Animação de entrada em 300 ms, linha em 400 ms, itens escalonados a cada 80 ms,
  permanência de 5 s e saída na ordem inversa.
- O overlay não recebe foco e não altera a barra de controles. Ele apenas sai da
  frente — instantaneamente — quando um painel (faixas, episódios, fontes, pausa,
  busca ou pós-reprodução) ou os dados de reprodução são abertos.
- Aparece uma vez por reprodução.

O guia é guardado por título na memória da sessão (30 títulos), como o mapa do
repositório Android, então voltar ao mesmo filme não refaz a consulta.

A gravidade por categoria é a mesma regra do `ParentalGuideRepository`: vence a
severidade com mais votos, ignorando "none"; se "none" tiver mais votos que
qualquer nível, a categoria não aparece. Empates mantêm a primeira entrada, como
o `maxByOrNull` do Kotlin.

O folheto vem de `api.tiffara.com` (o mesmo endereço base do fork), que responde
com `access-control-allow-origin: *`. Por isso o port chama a API direto, sem o
serviço Luna usado pelo IntroDB. A consulta usa o identificador IMDb do título
(`tt1234567`, inclusive nas formas `tt1234567:1:2`), tem limite de 10 s, não
envia credenciais e falha em silêncio: sem rede ou com resposta inesperada, a TV
continua sem avisos em vez de mostrar erro. Nenhum pedido é feito quando o ajuste
está desligado ou quando o título não tem identificador IMDb.

## Pós-reprodução (Up Next com recomendações)

**Ajustes → Reprodução → Recomendações após assistir** é opcional, desligado por
padrão, como no fork. Quando ligado, o ajuste abaixo define **quando** o cartão
aparece em filmes: 80% a 100%, com padrão em 90%
(`DEFAULT_POST_PLAY_MOVIE_THRESHOLD_PERCENT`). Episódios seguem o limite do
próximo episódio, que o port já usa no cartão Up Next (`PlayerNextEpisodeRules`).

No fim de um filme (ou quando o cartão Up Next não tem um episódio a oferecer),
o player abre a janela de recomendação com o layout do fork: arte do título,
linha "Porque você assistiu a …", título, ano, sinopse, contador "n de m",
**Assistir**, **Recomendação anterior**, **Próxima recomendação** e
**Voltar para o player**. As setas do controle trocam de recomendação em ciclo e
Voltar (ou o botão) fecha a janela — fechar é definitivo para aquela reprodução,
como no fork. Painéis apenas suspendem a janela, que volta ao fechar.

As sugestões são as do TMDB e chegam na mesma chamada de detalhe que o player já
fazia para logos e sinopse; o port guarda até quatro dessas recomendações
(`MAX_POST_PLAY_RECOMMENDATIONS`) sem pedido extra. Sem chave TMDB configurada,
não há candidatos e a janela não aparece.

### Diferenças registradas

1. **Assistir** resolve a recomendação no TMDB para obter o identificador IMDb
   (que é o que os add-ons roteiam) e abre a tela de detalhe do título, onde as
   fontes são listadas. O fork resolve as fontes em segundo plano e começa a
   reproduzir dentro da própria janela; o port não inicia o vídeo sem a escolha da
   fonte quando a reprodução automática está desligada. Com a reprodução
   automática ligada, o detalhe segue direto para a melhor fonte, como no resto do
   aplicativo.
2. O trailer interno com contagem regressiva (segunda instância de player no
   Android) não foi portado; a linha "Trailer automático após assistir" continua
   marcada como **Pendente**. Trailers continuam abrindo no YouTube pelo detalhe.
3. O fork também oferece a janela durante o cartão de próximo episódio. Nesta TV
   os dois nunca aparecem juntos: enquanto o cartão Up Next tem um episódio válido,
   a janela espera; ela aparece quando não há próximo episódio ou depois de o
   usuário dispensar o cartão.
4. As recomendações usam o TMDB. O fork também cruza provedores externos de
   notas (Trakt, MDBList, Simkl) para escolher a sugestão; isso continua pendente.

## Ajustes envolvidos

| Ajuste | Chave (port) | Padrão | Fork |
|---|---|---|---|
| Avisos de conteúdo | `playback.parentalGuide` | `true` | `parentalGuideEnabled = true` |
| Recomendações após assistir | `playback.postPlayRecommendations` | `false` | `postPlayRecommendationsEnabled = false` |
| Quando mostrar as recomendações de filmes | `playback.postPlayMovieThreshold` | `90%` (80–100) | `postPlayMovieThresholdPercent = 90` (80–100) |

Os três ficam no mesmo arquivo local de sempre e sobrevivem a atualização e
reinício. O rótulo do limite usa uma tradução própria porque o pt-BR do fork não
tem `autoplay_post_play_movie_threshold` e cairia no inglês.

## Limites

A consulta do guia parental depende de um serviço de terceiros que pode limitar
requisições; nesse caso a TV fica sem avisos, sem bloquear a reprodução. O texto
do guia (comentários de usuários) não é exibido, apenas as cinco categorias, como
no overlay do fork. Nada aqui substitui a validação na LG 55UT8050 — em especial
o contraste da linha de destaque nos doze temas e o foco das três ações da janela
de recomendação pelo controle remoto.
