# Telas de carregamento e resposta da Home — 0.28.0

O fork responde a "escolhi um título" com um esqueleto do próprio conteúdo e preenche cada
fileira conforme os add-ons respondem. O port passou a fazer o mesmo: nada de tela vazia e
nada de esperar o add-on mais lento para desenhar a primeira fileira.

Referência do fork: `PlaceholderShimmer.kt`, `Skeletons.kt` (`MetaDetailsSkeleton`,
`StreamsSkeletonList`), `ModernHomePlaceholderShimmer.kt` e `LoadingIndicator.kt`.

## Abertura do aplicativo

`SplashScreen` do Android virou uma tela de abertura em `public/index.html`, com o
**wordmark do Nuvio** e um anel de carregamento sobre fundo preto. Ela é o primeiro HTML
renderizado e sai quando a primeira tela do app entra (a restauração da conta e o primeiro
`render()`). O fork usa uma animação Lottie; o port não embarca Lottie, então o indicador é
um anel monoesquemático nas mesmas cores — o resto (fundo, marca, centralização) é igual.
Com `prefers-reduced-motion`, o anel para de girar.

## Esqueletos

Todo esqueleto ocupa o lugar do conteúdo real, então nada se desloca quando ele chega:

| Onde | Forma | Referência |
|---|---|---|
| Home, por fileira | cabeçalho + 6 cartões de pôster (ou paisagem) | `ModernHomePlaceholderShimmer` |
| Detalhes do título | fundo, logo, linha de ano, sinopse, 2 botões e as linhas de episódio em séries | `MetaDetailsSkeleton` |
| Lista de fontes | 6 linhas com logo do add-on | `StreamsSkeletonList` |
| Pasta de coleção | 6 cartões de pôster | `ModernHomePlaceholderShimmer` |

O brilho é o do fork: uma faixa de 60% varrendo da esquerda para a direita em 1600 ms, com
branco a 7% → 13% → 7% (`PlaceholderShimmer.kt`), desenhado por CSS
(`@keyframes skeleton-sweep`) e desligado com `prefers-reduced-motion`. Os blocos são
inertes para o controle: nada recebe foco enquanto o conteúdo não chega.

## Home progressiva

Antes, a Home esperava **todas** as respostas dos catálogos para desenhar a primeira
fileira — um add-on lento travava a tela inteira. Agora:

1. as fileiras de esqueleto entram imediatamente, na ordem dos catálogos;
2. cada catálogo que responde **substitui o próprio esqueleto** (`eachLimit`, mesma
   concorrência de 3 conexões do `mapLimit`);
3. um add-on que falha troca o seu esqueleto pela mensagem, sem afetar os outros;
4. o título em destaque aparece com a primeira resposta.

As **coleções deixaram de buscar títulos na Home**: cada pasta é um cartão de capa (a capa
vem do blob da conta), e os títulos só são buscados quando a pasta é aberta. Isso remove uma
ida à rede por pasta, em cada visita à Home.

## Janela de cache

`cachedMetaJSON` guarda respostas de catálogo e de metadados em memória por **5 minutos**
(antes: 2 minutos em até 8 entradas / 2 MiB, o que despejava as fileiras da Home o tempo
todo). Agora são até **24 entradas / 6 MiB**, e o que o usuário edita continua limpando o
cache na hora: instalar/remover/reordenar add-on, sincronizar a conta, trocar de perfil.

## Validação

Testes de navegador cobrem a tela de abertura (visível até o primeiro render), o esqueleto
das fileiras com duas fileiras seguradas por vez, a primeira fileira real enquanto a segunda
ainda carrega, os esqueletos de detalhes e de fontes, e a segunda visita à Home **sem novas
requisições**. O que continua sem medição é o tempo real na TV: os números de abertura e de
troca de tela do aparelho dependem do firmware e da rede.
