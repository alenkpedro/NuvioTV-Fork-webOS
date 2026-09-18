# NuvioTV-Fork: alvo LG webOS

Port experimental dentro do fork **ysosrs123/NuvioTV-Fork**, iniciado no commit
`45e0984c18460d2a65c5d745999011b4314328eb`. Nenhum código do NuvioTVSmart foi usado.
Este alvo usa a estrutura de dados e regras do fork, com interface e serviços de
plataforma reimplementados para webOS. Não é uma compilação do APK para a LG.

## Instalar pelo Homebrew Channel

Em Configurações → Adicionar repositório, informe:

```text
https://raw.githubusercontent.com/alenkpedro/NuvioTV-Fork-webOS/webos/apps.json
```

Atualize a lista e instale **Nuvio Fork**. O identificador `org.nuviofork.webos`
permite coexistir com outras versões do Nuvio. O índice aponta para um IPK
versionado e contém seu SHA-256 e tamanho. O aplicativo não exige root.

Para entrar com uma conta existente, use **Ajustes → Conta → Entrar com Nuvio**
e autorize pelo celular via QR code. Os addons habilitados do perfil selecionado
são importados após a vinculação. Veja [ACCOUNT.md](ACCOUNT.md).

Para instalar addons manualmente, pressione **Esquerda** ou **Voltar** para abrir o menu.
Entre em **Ajustes → Conteúdo e Descoberta → Addons** e adicione a URL do `manifest.json` do seu add-on.
Depois abra **Início** ou **Busca**, selecione um título, episódio e fonte.
Nenhum add-on, conta ou credencial vem instalado. A importação da conta inclui os addons habilitados do perfil selecionado.
Outras configurações do Android ainda não são sincronizadas.

## Áudio e receiver (0.38)

**Ajustes → Reprodução → Áudio e receiver** traz os cinco switches do fork (Dolby Digital, DD+,
TrueHD/Atmos, DTS, DTS-HD) como perguntas sobre o seu receiver, com um master desligado por
padrão. Como aqui não existe decodificador próprio, um formato desligado vira **desvio**: as
fontes cujo áudio reconhecível está todo naquele formato ficam marcadas como indisponíveis e a
escolha automática as ignora — sem prometer conversão. A linha de diagnóstico consulta o que a
**TV declara** decodificar e diz que é declaração, não medição.
[Regras e testes](AUDIO_COMPAT.md).

## Transferência de biblioteca (0.37)

**Ajustes → Conta → Transferência de biblioteca** copia ou move favoritos entre a biblioteca
desta TV e a conta Nuvio, no fluxo do fork: origem → destino → **revisão** (um *dry-run* com
“a escrever”, “já presentes”, “sem id” e “duplicadas”) e só então Copiar/Mover. Sem IMDb/TMDB a
entrada não é escrita; mover só remove o que foi escrito. [Regras e testes](LIBRARY_TRANSFER.md).

## Avaliação do dispositivo (0.36)

**Ajustes → Avançado → Diagnóstico → Avaliação do dispositivo** ajusta transporte, janela e
buffer a partir da **última varredura de transporte**. Cada linha diz de onde veio (medido, do
hardware, escolha sua ou “não dá para saber aqui”) e por quê; **Aplicar** escreve tudo de uma
vez e **Reverter** devolve os valores anteriores. Sem medição, nada é aplicado — o port não
inventa recomendação. [Regras e testes](DEVICE_ASSESSMENT.md).

## Acompanhamento MDBList (0.35)

O port passou a **enviar progresso e assistidos para o MDBList**, como o fork: um `start` no
primeiro quadro, um `stop` na pausa e no fim — e um stop com **80% ou mais marca assistido**.
Itens sem IMDb/TMDB não são enviados, o progresso vai truncado em duas casas, a janela de
dedup é 8 s/1,5 ponto, 5xx repete duas vezes com os atrasos do fork, e 404/429 não repetem.
A chave é a mesma de **Integrações → Avaliações MDBList**; ligue em **Ajustes → Rastreamento →
MDBList**. [Regras, limites e testes](MDBLIST_TRACKING.md).

## Início rápido das fontes (0.34)

Abrir os **detalhes** de um título já busca e ranqueia as fontes em segundo plano: entrar em
**Assistir** mostra a lista sem esqueleto e sem perguntar de novo aos add-ons, e apertar
Assistir antes de a busca terminar espera a **mesma** requisição em vez de disparar outra.
Escolher uma fonte abre a conexão daquele host com um `Range` de **um byte** antes de o
player abrir a URL. O cache da busca vale 2 minutos e guarda 3 títulos. Desligue em
**Ajustes → Reprodução → Player e Seleção de Fontes → Início rápido das fontes**.
[Comportamento, limites e testes](START_SPEED.md).

## Serviço de mídia local e varredura (0.32–0.33)

O port ganhou o **transporte de faixas paralelas** do fork. Em **Ajustes → Reprodução →
Buffer e Rede**, **Serviço de mídia local** faz o player ler de `127.0.0.1`: o serviço
empacotado busca o arquivo em blocos paralelos (1–8 conexões, 1–8 MB por faixa) com os
**cabeçalhos da fonte** e mantém uma janela de blocos na memória (8–128 MB), que precisa
caber tudo o que está em voo. Fontes que recusam o navegador da TV passam a ser
buscadas; voltar a uma posição já vista custa zero de rede.

Nada é obrigatório: fora dos arquivos HTTP(S) diretos (HLS/DASH seguem como playlist),
sem suporte a `Range` na fonte, sem memória para as faixas ou sem o serviço na TV, o
player toca a URL original e o motivo aparece na tela. O HUD do player (ícone de
informações) passou a medir: bitrate médio de vídeo e áudio pelos bytes decodificados,
buffer com os alvos, frames perdidos, faixa de áudio e os contadores do transporte
(buscados, entregues, descartados). HDR e saída de áudio continuam declarados como não
medidos. [Regras, recusas e testes](MEDIA_SERVICE.md).

**Varredura de transporte** (lista de fontes) roda o `StreamSweepEngine` do fork sobre este
serviço: linha de base com uma conexão, subida de faixa, subida de conexões e vizinhança,
parando quando uma conexão já alimenta o título (2× o bitrate, com a tolerância do fork) ou
quando a fonte colapsa duas células seguidas. Cada célula mostra a taxa medida e a
estabilidade das sub-janelas, e o veredito traz um botão **Usar N× M MB** que liga o
transporte local com aquela configuração. Células que não caberiam na janela de memória são
marcadas como ignoradas, nunca executadas.

## Trailer no app e serviço de rede (0.31)

O **trailer toca dentro do app** (página local com o player do YouTube e protocolo por
postMessage), com Reproduzir/Pausar, Com som/Mudo e Legendas; se a TV não carregar o player, a
mesma janela oferece o **YouTube da TV**, o navegador da TV e o QR code. O port ganhou também um
**serviço de rede local** (comando `fetch`), que faz requisições **com cabeçalhos próprios e sem
CORS** — a base para integrações e plugins. Ver [AUTO_PLAY.md](AUTO_PLAY.md) e
[REFERENCE_SMART.md](REFERENCE_SMART.md).

## Abertura, carregamento e resposta (0.28–0.29)

O app abre com a **tela do fork**: wordmark do Nuvio e anel de carregamento cobrindo o painel
inteiro, até a primeira tela entrar. **Abrir uma fonte mostra a tela de carregamento do fork**
— imagem do título atrás, logo no meio, mensagem e a fonte sendo aberta — e um travamento de
buffer depois disso é só o anel. Escolher um título mostra o **esqueleto da própria tela** e a
lista de fontes mostra as linhas de espera com **os add-ons que estão sendo consultados**. A
**Home entra por partes**: cada fileira tem o seu esqueleto (navegável, como no fork) e é
substituída assim que aquele catálogo responde, sem esperar o mais lento; as coleções deixaram
de buscar títulos na Home (a capa vem da conta; os títulos entram ao abrir a pasta). O brilho e
as formas são os do fork (`PlaceholderShimmer.kt`, `Skeletons.kt`, `LoadingOverlay.kt`).
Catálogos e metadados ficam em memória por 5 minutos, então voltar à Home não pergunta tudo de
novo. [Comportamento, limites e testes](LOADING.md).

## Coleções (0.24)

**Ajustes → Conteúdo e Descoberta → Coleções** cria fileiras extras na Home. Uma
coleção tem pastas; cada pasta tem fontes; cada pasta com ao menos uma fonte vira
uma fileira, e as coleções **fixadas no topo** vêm primeiro.

As fontes são as duas famílias que funcionam nesta TV: **catálogo de add-on**
(com gênero opcional) e **TMDB** — coleção, lista, produtora, emissora, pessoa,
direção e descobrir, com os passos de ID, tipo e ordem em diálogos pelo controle.
Um título do TMDB abre a tela de detalhes normalmente e a busca de fontes usa os
add-ons instalados. **Ver todos** abre a pasta com as fontes em abas.

Entrar na conta agora leva direto para a Home: uma falha ao importar add-ons vira
mensagem, e a nova tentativa continua em **Ajustes → Conta**.

[Gerenciamento, fontes e limites](COLLECTIONS.md). A 0.24.1 corrige o cabeçalho
do editor, que mostrava contadores congelados depois de editar.

## Buffer e Rede (0.23)

**Buffer de reprodução personalizado** liga os dois controles que o player da TV
consegue obedecer: **Buffer inicial** (5 s, 0–20 s) espera o material carregado
antes de começar, e **Buffer após travamento** (3 s, 0–20 s) segura a retomada
depois de uma travessia por falta de buffer. Um **tempo limite de espera**
(5–60 s, padrão 20 s) impede tela preta em conexões lentas. Desligado, o player
mantém o comportamento de sempre.

**Testar velocidade** na lista de fontes mede a fonte real pelo mesmo transporte
do player e mostra taxa e latência no cartão (`9,4 Mbps · 230 ms`), com um
orçamento pequeno de bytes: até 4 fontes, 2 MB cada, 8 s por fonte. A medição é
informação — a ordem da lista e a escolha automática não mudam.

Linhas que só existem no Media3 (janelas mínima/máxima em bytes, orçamento de
memória, cache em disco, conexões paralelas/HTTP/2, memória nativa do ExoPlayer e
AFR) continuam visíveis e marcadas como **Pendente**, com o motivo.

[Comportamento, orçamento e limites](NETWORK.md).

## Reprodução automática (0.22)

**Seleção automática de fonte** tem os quatro modos do fork. Manual (padrão)
sempre mostra a lista; **Primeira fonte** usa a ordem dos add-ons; **Seleção
inteligente** usa o ranking do fork; **Palavra-chave (Regex)** reproduz a
primeira fonte que coincidir com o padrão — `4K|2160p|Remux` para incluir e
`(?!(cam|ts))` para descartar. Sem padrão válido ou sem coincidência, a lista
continua aparecendo. **Addons permitidos** limita a escolha automática.

**Reutilizar último link** guarda o endereço direto da fonte escolhida por título
e perfil por 1 h a 7 dias (padrão 24 h) e o reutiliza sem consultar os add-ons de
novo. Somente links HTTP(S) entram no cache, e desligar o ajuste apaga o que
estiver guardado.

**Trailer automático após assistir** abre o trailer do título no diálogo do
detalhe depois do atraso configurado (3 s a 15 s, padrão 7 s) enquanto o foco
fica em Assistir, e mostra um contador nos últimos cinco segundos do filme para
abrir o trailer da recomendação no fim. No webOS o trailer abre no aplicativo do
YouTube da TV, não dentro do Nuvio.

[Modos, cache, diferenças e limites](AUTO_PLAY.md).

## Guia parental e pós-reprodução (0.21)

**Avisos de conteúdo** vêm ligados: ao começar a reprodução, o port consulta o
guia do título e mostra as categorias do fork (Nudez, Violência, Linguagem
Imprópria, Drogas/Álcool e Conteúdo Assustador) em ordem de gravidade, com linha
de destaque animada, 5 segundos na tela e saída suave. Não recebe foco e sai da
frente quando um painel abre. Sem rede, a TV simplesmente não avisa.

**Recomendações após assistir** é opcional. Ligado, um filme oferece uma
recomendação do TMDB ao passar do limite definido (80–100%, padrão 90%), com
**Assistir**, **Recomendação anterior**, **Próxima recomendação** e **Voltar para
o player**. Fechar vale para aquela reprodução; painéis apenas suspendem a janela.
Em séries, o cartão do próximo episódio continua sendo a pós-reprodução.

[Comportamento, diferenças e limites](PARENTAL_POST_PLAY.md).

## Ajustes alinhados ao fork (0.20)

A tela de Ajustes passou a ser o workspace do fork: rail com as dez categorias
(Conta, Perfis, Aparência, Layout, Conteúdo e Descoberta, Integrações,
Reprodução, Rastreamento, Sobre, Avançado), cabeçalho com título e subtítulo e
cartões de grupo com linhas de alternância e de ação.

Em **Aparência**, o tema de cores tem as doze paletas do fork; **Branco** é o
padrão e mantém o visual anterior. Modo AMOLED, superfícies em preto puro e o
estilo das configurações (Padrão, Minimalista, Barra Superior) também estão
disponíveis. Fonte e idioma continuam fixos, com a linha explicando o motivo.

Em **Reprodução**, os grupos seguem o fork. **Aparência das legendas** abre o
mesmo editor do player dentro de Ajustes. Linhas que dependem do Android
(guia parental, libass, cache de links, recomendações pós-reprodução, plugins,
Direct Debrid, buffer e AFR) aparecem marcadas como **Pendente**, com o motivo.

[Estrutura, diferenças e limites](SETTINGS_PARITY.md). Reiniciar o app não é
necessário: as preferências entram no mesmo arquivo local de sempre.

## Trechos, miniaturas e aparência (0.19)

**Legendas → Ajustes de legenda** permite tamanho, negrito, cor, opacidade,
contorno e posição, com Netflix Sans fixa. Restaurar aparência preserva o atraso.
O mesmo editor está em **Ajustes → Reprodução → Aparência das legendas**.

Em **Ajustes → Reprodução**, "Pular introduções" vem habilitado; as três
opções de pular automaticamente começam desligadas. Os botões dependem dos
intervalos disponíveis no IntroDB. O IPK inclui o serviço local necessário à TV.

Ative **Miniaturas ao buscar** para prévias dos trechos já reproduzidos em
fontes até 4K, sem segundo player. O port busca o quadro **no próprio arquivo**, como o
`SeekThumbnailEngine.kt` do fork (um decodificador sob demanda), então a prévia não depende de
ler a imagem da reprodução. Extração antecipada permanece pendente.
[Comportamento, diferenças e limites](PLAYER_EXTRAS.md).

## Tela de pausa e logos (0.18)

Ative **Ajustes → Reprodução → Informações ao pausar**. Depois de pausar manualmente,
aguarde 5 segundos sem interação. A tela mostra logo/título, ano, episódio,
sinopse, elenco e relógio. OK no painel retoma; baixo acessa o elenco, OK abre
foto/personagem e Voltar retorna. Voltar no painel fecha a tela sem reproduzir.
O padrão é desativado, como na referência Android.

O player preserva logos dos catálogos e consulta imagens localizadas pela
integração TMDB já configurada. A reprodução começa sem esperar essa consulta.
Sem imagem válida, o título é a alternativa. [Detalhes e limites](PLAYER_PAUSE_ARTWORK.md).

## Áudio, legendas e sincronização por fala (0.17)

Painéis de 320 dp no canto inferior direito, lista única e foco branco como no
fork. Em Legendas → Ajustes de legenda → Atraso → Sincronizar por fala, marque o início
de uma fala e escolha a frase correspondente. Requer legenda externa SRT/VTT
já selecionada; o vídeo continua no estado em que estava. O atraso fica salvo
por filme/episódio e perfil. Também há ajuste de 100 ms, até ±180 s.
Desde a 0.19, a aparência é personalizável; a família Netflix Sans continua fixa. [Uso e limites](PLAYER_TRACKS_SYNC.md).

## Player do fork (0.16)

Barra com título/logo, ícones à direita e Mais expansível, linha do tempo,
relógio/término e cápsulas Reproduzir/Pausar, Reiniciar, Episódios e Próximo.
Fontes abre o painel do vídeo atual sem interromper a reprodução. Informação
fica no ícone à esquerda de Áudio. Voltar recolhe controles antes de sair.
[Mapa de fidelidade e diferenças ainda abertas](PLAYER_PARITY.md).

## Episódios e imagem (0.15)

O player de séries inclui Episódios, com temporadas, assistidos e fontes dentro
do painel lateral. Mais reúne Velocidade, Proporção da imagem (sete modos do
fork); desde a 0.16, informações de reprodução ficam no ícone de informações. [Uso, geometria e limites](EPISODES_ASPECT.md).

## Velocidade, legenda e continuidade (0.14)

Player → Mais → Velocidade, de 0,25× a 2×, lembrada por título/perfil. Atraso de legenda
externa salvo por filme/episódio/perfil e Netflix Sans incluída no pacote.
“Ainda assistindo?” configurável em Reprodução → Idiomas e próximo episódio;
desativado por padrão, limiar de três avanços automáticos e confirmação de 60 s.
[Uso e limites de plataforma](PLAYBACK_TIMING.md).

## Legendas e memória de faixas (0.13)

Desde a 0.17, o painel Legendas usa lista única, filtro de preferidos e indicação de
forçadas/SDH. A escolha manual confirmada é lembrada por título e perfil.
Ajustes → Reprodução → Idiomas e próximo episódio permite configurar memória,
forçadas e limpeza SDH de legendas externas. [Uso e diferenças](SUBTITLE_PREFERENCES.md).

## Idiomas e próximo episódio (0.12)

Ajustes → Reprodução → Idiomas e próximo episódio configura idiomas principal e
secundário, busca automática de legendas dos addons e continuidade de séries.
Avanço automático vem desligado; ao ativar, há contagem cancelável de 5 segundos.
Cada episódio busca suas próprias fontes. Ver [PLAYBACK_AUTOMATION.md](PLAYBACK_AUTOMATION.md).

## TMDB e trailers (0.10)

Ajustes → Integrações → TMDB recebe sua chave pessoal da API v3. Biografias,
filmografia e recomendações exigem essa configuração; não vem do login Nuvio.
Dados de elenco/trailers enviados pelo addon funcionam sem a chave. Trailers
abrem no YouTube ou navegador da TV; a reprodução interna ainda está pendente.
Veja [METADATA.md](METADATA.md) para uso, fonte e limites.

## Coleções e avaliações (0.11)

Coleções/franquias usam a integração TMDB. Avaliações adicionais exigem sua chave
MDBList em Ajustes → Integrações → Avaliações MDBList, com escolha de fontes.
As consultas são somente de leitura; listas e rastreamento continuam pendentes.
Veja [COLLECTIONS_RATINGS.md](COLLECTIONS_RATINGS.md).

## O que funciona nesta prévia

- Login Nuvio por QR code, sessão persistente, renovação e logout somente desta TV.
- Importação dos addons da conta, com opção de repetir a sincronização e erros parciais visíveis.
- Instalação/remoção local de add-ons, catálogos, busca e detalhes com episódios.
- Descobrir por tipo/catálogo/gênero; busca após 350 ms, pesquisas recentes por
  perfil e filtros. Ordem/visibilidade das faixas em Catálogos do início. Ver
  [DISCOVERY.md](DISCOVERY.md) para geometria, paginação e diferenças pendentes.
- Perfis da conta com PIN, addons próprios/herdados e biblioteca Nuvio importada.
  Favoritos editados na LG são enviados ao Nuvio e separados por perfil.
  Veja [PROFILES.md](PROFILES.md).
- Histórico Nuvio por perfil: progresso/assistidos importados, retomada e conflitos
  com dados locais. Até 50 linhas por página; alterações da LG entram na fila de envio
  ao Nuvio. Trakt/Simkl/MDBList externos pendentes. Veja [HISTORY.md](HISTORY.md).
- Fila persistente de progresso, assistidos e favoritos, confirmação por item,
  recuperação de falhas e conflitos revisáveis. Veja [SYNC.md](SYNC.md).
- Layout Modern do fork: tema Branco, fonte Inter, sidebar clássico/moderno/oculto,
  retrato/paisagem, fundo parcial/completo, rótulos e estilos de Continuar Assistindo.
  Ajustes em **Layout** são locais; o login não importa preferências visuais do Android.
- Destaque atualizado após estabilizar o foco por 450 ms, com consulta cancelável
  de metadados aos addons (até três provedores elegíveis, um por vez).
- Detalhes com sinopse completa, créditos/elenco dos addons, temporadas e cartões
  horizontais de episódios. Assistir considera a retomada local/importada e pula especiais
  na primeira reprodução quando há uma temporada regular disponível.
- Controle por setas/OK/Voltar (incluindo código 461 da LG) e ponteiro.
- Extração de resolução, qualidade, grupo, áudio, HDR, codec, idioma e tamanho.
- Ranking determinístico do fork, listas de grupos e filtros estritos; o botão de
  melhor fonte mantém o fallback de exclusões do original entre fontes elegíveis.
- Ajustes de grupos, exclusões de codecs/qualidades, limite de resultados e autoplay.
- Reprodução HTTP(S) no player da plataforma, pausa, avanço/recuo, retomada local/importada,
  histórico limitado, painel de áudio quando a plataforma expõe faixas e legendas
  SRT/WebVTT da fonte e de addons, com tamanho, fundo e sincronização. Veja [PLAYER.md](PLAYER.md).
- Diagnóstico de resolução decodificada, buffer temporal e frames perdidos,
  quando expostos pelo player. HDR e áudio de saída são explicitamente não medidos.

## Alvo e otimização

LG 55UT8050PSA, com webOS 25 / Chromium 108 como baseline. A interface é
renderizada em 1920×1080; essa resolução de UI não reduz a resolução do vídeo.
A compatibilidade real de 4K/HDR/áudio precisa de testes no aparelho.

- Sem framework de UI, biblioteca externa de player, fontes remotas ou animações contínuas.
- JavaScript/CSS empacotados e minificados; sem servidor externo para hospedar a UI.
- Três consultas a add-ons simultâneas, timeout, cancelamento ao sair da tela e
  limite de 6 MiB por resposta JSON decodificada.
- Cache de metadados com TTL de 2 minutos, até 8 entradas e orçamento estimado
  de 2 MiB serializados (isso não é uma medição do heap total).
- Até seis catálogos na home, 16 cartões por faixa, imagens lazy e decodificação
  assíncrona. Descobrir e Ver todos exibem até 100 cartões por página; episódios mostram
  até 150 itens por temporada. Até 30 add-ons instalados.
- Até 300 fontes por add-on; a lista renderiza no máximo 100 fontes por vez.
- Histórico de até 100 itens, gravação no máximo a cada 10 segundos durante a
  reprodução e em pausa/saída; a URL temporária de vídeo não é salva no histórico.
- Vídeo é pausado quando o app perde visibilidade e o recurso de mídia é liberado
  ao fechar o player. Nenhum prefetch de vídeo compete com o player nesta versão.

O perfil da UT8050 evita fontes que anunciam somente Dolby Vision; isso é uma
checagem de metadados, não uma inspeção do bitstream. É possível desativá-la nos
ajustes. Os padrões originais do fork, incluindo a exclusão de AV1, são mantidos
separadamente. Não há alegação de otimização máxima medida no hardware.

## Ainda não portado

Downloads paralelos e buffer customizado do fork; teste de velocidade e avaliação
de dispositivo; Direct Debrid e torrents; plugins Android; listas e rastreamento MDBList/Trakt/Simkl;
deltas/realtime, gestão de listas externas e edição de perfis; decodificadores FFmpeg/MPV; conversão Dolby Vision;
passthrough lossless/MAT; legendas ASS/PGS/ZIP, ajuste de frequência e paridade
completa de Up Next. Idiomas, avanço automático e confirmação já estão nas 0.12–0.14. A versão 0.5.0 acrescenta fontes, áudio e legendas; a
0.4.0 ampliou as opções Modern e os detalhes a partir do código de referência. Temas/fontes alternativos, profundidade, expansão temporizada, trailers internos, coleções pessoais e personalizações adicionais continuam pendentes. Veja [UI_REFERENCE.md](UI_REFERENCE.md)
para medidas, origem e limitações; ainda não há comparação pixel a pixel com
uma captura da mesma configuração executada no Android.

Add-ons precisam permitir requisições do app web (CORS). Fontes que exigem
cabeçalhos HTTP especiais ou resolução local são identificadas como indisponíveis.
Links externos, YouTube e magnet não são tratados como vídeos HTTP. HLS usa o
suporte nativo da LG; Chrome desktop pode não reproduzir os mesmos formatos.

Parte do pipeline de áudio do Android está disponível somente em binário no
fork. Não há promessa de transportar esse código diretamente para a LG.

## Desenvolvimento

```sh
cd webos
npm ci
npm test
npm run build
npm start
```

Prévia em `http://127.0.0.1:4173`. Em macOS, os testes de interface usam o Chrome
instalado. Em Linux, instale Chromium com `npx playwright install chromium`.
Também é possível informar `CHROME_PATH`.

```sh
npm run test:ui
npm run package:webos
npm run checklist:pdf
node scripts/generate-homebrew.mjs alenkpedro/NuvioTV-Fork-webOS webos-v0.15.0
```

O CLI da LG está instalado localmente. O script de pacote mantém seus dados em
`.cli-data/` dentro deste diretório. Pacotes saem em `packages/`.
`npm run sync:defaults` atualiza as listas a partir do Kotlin após revisão; o build
detecta divergências por hash/conteúdo para evitar alterações silenciosas.

Os testes de fluxo usam um vídeo sintético de 60 segundos, gerado com FFmpeg,
e respostas de add-on locais interceptadas no navegador. Não acessam conteúdo
de terceiros. Isso comprova o fluxo no navegador, não a reprodução na TV.

Veja [PORTING.md](PORTING.md) para rastreabilidade e [ROADMAP.md](ROADMAP.md) para etapas, pendências e próxima entrega sugerida. Antes de testar na TV, use [VALIDATION.md](VALIDATION.md): o checklist de validação no aparelho, bloco por bloco, com o que observar em cada entrega.

## Licença

GPL-3.0. Créditos a NuvioMedia, aos autores do NuvioTV e ao fork de ysosrs123.
Dados de grupos: TRaSH Guides, conforme atribuição do fork. Consulte
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) e a licença na raiz.
