# Acompanhamento MDBList (0.35)

Port do `MDBListScrobbleService.kt` e do `MDBListTrackingProvider.kt` no fork fixado em
`45e0984`. **Ajustes → Rastreamento → MDBList**. A chave é a mesma de
**Integrações → Avaliações MDBList**; o interruptor de acompanhamento é separado, como no
fork (`enabled` na integração e `tracking` no acompanhamento).

## Quando algo é enviado

| Evento do port | Chamada | Regra |
|---|---|---|
| Primeiro quadro (`playing`) | `POST scrobble/start` | Progresso atual |
| Pausa manual | `POST scrobble/stop` | Abaixo de 80% fica uma sessão pausada |
| Fim do arquivo / sair do player | `POST scrobble/stop` | **80% ou mais marca assistido no servidor** |

Pausas internas por falta de buffer **não** geram envio (seriam ruído).

## Regras portadas, uma a uma

- **Sem IMDb/TMDB não há envio.** O `itemKey` usa o IMDb quando existe, senão o TMDB; séries
  exigem temporada e episódio válidos. Nada de remapear numeração: o MDBList recebe os números
  do próprio add-on.
- **Progresso truncado em duas casas** (`3,0654762 → 3,06`). O fork mediu um 400 seco com mais
  casas; truncar (não arredondar) nunca empurra um stop abaixo dos 80% do limiar de assistido.
- **Corpo com o episódio aninhado** (`show.season.episode.number`), ids só quando existem
  (o Moshi omite nulos) e `app_version`.
- **Janela de dedup**: mesma ação, mesmo item, mesma faixa de 1,5 ponto de progresso e menos de
  8 s → não repete. A marca é escrita **antes** do envio, então um stop dentro do round trip de
  um start ainda enxerga o start.
- **Escada de retry**: 5xx repete (duas tentativas no total) com **5 s** para 502/503/504 e
  **1,5 s × tentativa** para os demais; **404** (título fora do banco do MDBList) e **429**
  (limite diário) são terminais e não repetem dentro da reprodução.
- **Transporte**: a chamada sai pelo serviço de rede local (cabeçalhos e sem CORS), com queda
  para `fetch` em testes e no navegador.

## O que ainda não é feito

O fork também **lê** do MDBList (biblioteca, assistidos, progresso e watchlist) e usa o MDBList
como **fonte** de progresso ("só soma estado assistido, nunca apaga"). Nesta TV a leitura da
biblioteca e do histórico continua sendo a da conta Nuvio; a leitura do MDBList fica pendente e
aparece como tal em **Rastreamento → Fontes**.

## Testes

`tests/mdblist-tracking.test.mjs` (9 testes): ids e itens, truncamento e corpo, classificação
de status e atrasos, janela de dedup por perfil/ação/item, os portões (interruptor, chave, ids),
start único com dedup e stop em 82,5%, retry de 5xx com os atrasos do fork, 404/429 terminais,
falha de rede e o armazenamento separado do interruptor.
