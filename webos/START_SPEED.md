# Início rápido das fontes (0.34)

Port do que o fork chama de *faster stream start* e *pressing play reaches the player
faster*, na parte que um aplicativo web possui.

## O que o port faz

- **Busca antecipada.** Ao abrir a **tela de detalhes** de um título, o port já busca as
  fontes nos add-ons e **ranqueia** com as regras do fork (`StreamQualityRank`), em
  segundo plano. Entrar em **Assistir** mostra a lista com o que chegou, **sem
  esqueleto**, e sem perguntar de novo aos add-ons.
- **Uma requisição por título.** Se você apertar Assistir antes de a busca terminar, a
  tela de fontes **espera a mesma requisição** em vez de disparar uma segunda (o add-on
  não vê tráfego dobrado).
- **Conexão aberta no toque.** Ao escolher uma fonte, um `Range: bytes=0-0` abre
  DNS/TCP/TLS daquele host antes de o player abrir a URL — é o "opens the network
  connection at the press". É **um byte**, não um pré-baixar.
- **Cache curto e limitado**: 2 minutos de validade, 3 títulos no máximo (LRU), por
  perfil/título/episódio. Uma entrada consumida não é servida duas vezes: voltar de um
  link que expirou no servidor sempre chega à lista.
- **Falha é estado, não exceção**: um add-on fora do ar fica registrado como falha, a
  lista mantém o esqueleto e pergunta de novo.

## O que **não** é prometido

O fork também deixa de buscar o **índice final** de MP4 sem faststart. Esse pedido é do
analisador do próprio elemento de mídia da TV, não do app; o port não afirma ter mudado
isso. O que ele controla é o transporte: com o **serviço de mídia local**
([MEDIA_SERVICE.md](MEDIA_SERVICE.md)) os bytes são limitados por blocos e pela janela.

## Ajuste

**Ajustes → Reprodução → Player e Seleção de Fontes → Início rápido das fontes**
(ligado por padrão). Desligado, a busca acontece só ao entrar na lista de fontes e o
port não abre nenhuma conexão antecipada.

## Testes

`tests/stream-prewarm.test.mjs` cobre: uma requisição por título, a segunda chamada
entrando na mesma busca, o consumo único pela tela de fontes, a separação por
título/episódio, a validade de 2 minutos, o teto de entradas (LRU), a falha registrada
como estado, o aquecimento com um byte e a recusa de aquecimento para URL não HTTP(S).
