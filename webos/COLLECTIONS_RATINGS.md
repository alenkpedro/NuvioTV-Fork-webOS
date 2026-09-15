# Coleções de filmes e avaliações — 0.11.0

Referência: `ysosrs123/NuvioTV-Fork@45e0984`, mantido nesta árvore. Alvo LG
55UT8050 / webOS 24. Esta entrega acrescenta franquias TMDB nos detalhes e notas
agregadas MDBList. Coleções pessoais, listas externas, avaliação pessoal e
rastreamento MDBList continuam pendentes.

## Coleções e franquias

Após consultar um filme no TMDB, a relação `belongs_to_collection` identifica sua
coleção. Os filmes aparecem em ordem crescente de lançamento, com título, ano,
arte horizontal e retorno ao mesmo cartão depois dos detalhes. Itens sem data
válida ficam no fim. Séries e filmes sem essa relação não criam uma coleção.

A faixa aparece abaixo das abas de elenco/semelhantes/trailers, como a seção
separada do fork quando há mais de três abas. Usa cartões 260×146, raio 12,
gap 12 e margens 48 no canvas lógico de 960×540. Título da coleção usa o estilo
discreto acima da faixa. A adaptação conserva até 500 itens por resposta e
renderiza 30 por página, com Anteriores/Próximos. Atualizar coleção ignora o cache;
falha mantém a página utilizável. Nenhum filme é resolvido previamente em IMDb:
a associação ocorre ao abrir seus detalhes, reutilizando a integração da 0.10.

Requer a chave TMDB já configurada em **Ajustes → Integrações → TMDB**. Não há
chave incluída no pacote. Cache de metadados e limites de transporte continuam
os descritos em [METADATA.md](METADATA.md). Arte localizada por consulta extra
para cada filme, menus de pressão longa e emblema de assistido da coleção ainda
não foram portados.

Referências Android: `core/tmdb/TmdbMetadataService.kt:fetchMovieCollection`,
`ui/screens/detail/CollectionSection.kt` e a seção separada em
`ui/screens/detail/MetaDetailsScreen.kt`. Endpoint verificado na
[documentação TMDB](https://developer.themoviedb.org/reference/collection-details).

## Avaliações

A faixa reservada no hero mostra a nota IMDb do addon e a nota TMDB recebida com
votos. A origem é mantida separada: a nota TMDB não é rotulada como IMDb. Como no
`HeroSection.kt`, TMDB direto é convertido de 0–10 para inteiro 0–100; quando a
nota vem do MDBList, segue a formatação do `MDBListRatingsRow.kt` (uma casa para
IMDb/TMDB/Letterboxd; as demais exibem casas somente quando necessário). Não há
normalização inventada entre provedores. Selecionar a nota abre sua identificação
e origem. Valores ausentes, negativos, não numéricos ou fora de 0–100 são omitidos;
IMDb do addon é validado até 10. Nota zero numérica é distinta de nota ausente.

**Ajustes → Integrações → Avaliações MDBList** permite salvar uma chave própria,
ativar/desativar e escolher Trakt, IMDb, TMDB, Letterboxd, MyAnimeList, Rotten
Tomatoes, público do Rotten Tomatoes e Metacritic. A chave é opcional; sem ela
continuam as notas do addon e TMDB. Salvar grava as preferências; a validação
contra o serviço ocorre ao abrir um título, quando há um ID para consultar.
A chave e escolhas ficam em `nuvio-fork.webos.ratings.v1`, somente nesta TV,
compartilhadas pelos perfis da TV, separadas da conta Nuvio. Remover chave não
remove addons, preferências de fontes, favoritos ou progresso.

O contrato do fork é **POST de leitura** para
`https://api.mdblist.com/rating/{movie|show}/{fonte}`, com `apikey` na query e corpo
`{ ids: [id], provider: "imdb" }`. Para resultados ainda identificados por TMDB,
esta adaptação aceita `provider: "tmdb"`, também documentado na API. Um único ID
é enviado por chamada. Não consulta pelo nome do filme. Não chama endpoints de
scrobble, listas, histórico ou avaliação pessoal e não envia credenciais Nuvio.

Até três consultas em paralelo e oito fontes selecionáveis. Notas bem-sucedidas
(inclusive ausência explícita de nota) ficam em cache por 30 minutos, limitado a
128 entradas. Falhas não são guardadas como nota vazia; fontes bem-sucedidas
continuam visíveis e uma nova tentativa explícita refaz as consultas. A requisição
é cancelada ao sair da tela. Alterar/remover configuração invalida o cache e impede
que respostas antigas sejam aplicadas. Cada consulta tem timeout de oito segundos
e limite de transporte de 6 MiB. API indisponível, chave inválida, limite de uso ou
CORS aparecem como falha de avaliações; o catálogo e o botão Assistir permanecem
utilizáveis. Respostas de erro nunca exibem a chave nem a URL com credenciais.

Ícones originais copiados de `res/raw/mdblist_*.svg`, `imdb_logo_2016.svg` e
`res/drawable/mdblist_audience.png` / `mdblist_metacritic.png`. Layout compacto
segue logos 24, intervalo entre grupos 14 e entre logo/nota 6; rolagem horizontal
permite alcançar todas as fontes sem alterar a posição da sinopse.

Referências: `data/repository/MDBListRepository.kt`, `data/remote/api/MDBListApi.kt`,
`data/remote/dto/mdblist/MDBListRatingDtos.kt`, `ui/components/MDBListRatingsRow.kt`,
[API MDBList](https://api.mdblist.com/docs/) e
[especificação OpenAPI](https://api.mdblist.com/schema/) consultada em 2026-09-14.

## Validação e continuidade

Testes usam apenas títulos, respostas e chaves fictícios. Cobrem ordem e limites
de coleções, identidade do título, cache/refresh, geometria, foco, falhas parciais,
contrato POST, concorrência, cancelamento e armazenamento separado. A atualização
preserva o ID do app e o endereço Homebrew. Consultas reais com as chaves do usuário
e validação física na LG permanecem pendentes.

Próxima etapa sugerida: player, com seleção automática de idiomas de áudio/legendas
e próximo episódio conforme os recursos do fork e os limites da plataforma LG.
