# Reprodução automática: seleção de fonte, último link e trailer

Port das regras de `StreamAutoPlaySelector.kt`, `StreamAutoPlayPolicy.kt`,
`StreamLinkCacheDataStore.kt`, `TrailerSettingsDataStore.kt` e
`PostPlayRecommendationState.kt` do fork fixado em `45e0984`. Tudo aparece em
**Ajustes → Reprodução → Reprodução automática**.

## Seleção automática de fonte

Os quatro modos do fork estão disponíveis com os mesmos textos:

| Modo | Comportamento |
|---|---|
| Manual (escolher fonte) | Padrão do fork. A lista de fontes é sempre exibida. |
| Primeira fonte | Reproduz a primeira fonte elegível na ordem dos add-ons. |
| Seleção inteligente | Usa `StreamQualityRank` (ranking do fork) entre as fontes elegíveis. |
| Palavra-chave (Regex) | Reproduz a primeira fonte que coincidir com o padrão salvo. |

- A ordem considerada é a ordem em que os add-ons responderam, que é a mesma
  ordem que `orderAddonStreams` mantém depois da lista de add-ons instalados.
- O padrão é comparado com o nome do addon, o nome, o título, a descrição e a
  URL da fonte, sem diferenciar maiúsculas de minúsculas, como no fork.
- Grupos negativos são lidos como exclusão: `4K(?!(cam|ts))` reproduz a primeira
  fonte com 4K que não traga `cam` nem `ts`.
- Antes de qualquer modo, a fonte precisa passar pela elegibilidade do port
  (HTTP(S) direto, cache confirmado, sem cabeçalhos obrigatórios e sem Dolby
  Vision exclusivo quando o perfil da TV está ativo).
- **Addons permitidos** restringe a escolha automática aos add-ons marcados;
  nenhum marcado significa "todos os addons instalados", como no fork. No webOS
  não existem plugins, então o escopo do fork se reduz a add-ons.

## Reutilizar último link

- Ligado, o port guarda o endereço direto e o nome da fonte escolhida por título
  (e por perfil, como o fork) e reutiliza a entrada enquanto ela estiver dentro
  da duração configurada — 1 h a 7 dias, padrão 24 h, como no diálogo
  `StreamReuseLastLinkCacheDurationDialog`.
- O port consulta o cache **antes** de pedir as fontes aos add-ons; o fork pede
  a lista e depois usa o cache. Numa TV isso evita a espera e o tráfego; a
  diferença está registrada em [PORTING.md](PORTING.md).
- A entrada é consumida uma vez por visita: se o link tiver expirado no servidor
  e a reprodução falhar, a tecla Voltar abre a lista de fontes em vez de tentar o
  mesmo link de novo.
- São no máximo 50 entradas; as mais antigas saem primeiro. Somente links
  HTTP(S) são guardados: torrents não têm caminho de reprodução neste alvo.
- **Desligar o ajuste apaga os links guardados**, em vez de deixá-los no
  armazenamento da TV. Desligar também é a forma de limpar o cache sem esperar a
  expiração — o fork não tem uma linha para isso.
- Nem a URL nem o nome da fonte escolhida entram no histórico: o arquivo de
  histórico continua sem endereços de vídeo.

## Serviço de rede local (0.31.0)

`service/net.js` + o comando `fetch` do serviço `org.nuviofork.webos.segments` dão ao app o que
a página da TV não tem: **requisições com cabeçalhos próprios e sem CORS**. Métodos GET/POST/
PUT/PATCH/DELETE/HEAD, cabeçalhos do chamador (os de conexão são removidos), redirecionamento
limitado a 5 saltos, resposta de até 8 MiB, gzip/deflate/brotli decodificados, `text` para
JSON/texto e `bodyBase64` para binário. É a base para Trakt/Simkl, debrid e plugins; no
navegador (testes e desenvolvimento) o mesmo cliente cai para `fetch`. Ver
[REFERENCE_SMART.md](REFERENCE_SMART.md) para o que ainda depende do proxy de mídia local.

## Trailer

- **O trailer agora toca dentro do app.** O botão Trailers, o cartão de trailer e o trailer
  automático abrem uma janela com o player do YouTube em `public/youtube-proxy.html`: a página
  roda na mesma origem, hospeda o player pela `iframe_api` e conversa por `postMessage`
  (`ready`, `state`, `firstFrame`, `fallback`, `error`, além dos comandos
  play/pause/mute/seek/captions). O estado é enviado a cada 500 ms, então os botões
  **Reproduzir/Pausar**, **Com som/Mudo** e **Legendas** seguem o que o player responde. O
  trailer começa **mudo** (é o único jeito de o navegador da TV iniciar sozinho) e o botão
  liga o som.
- **O controle remoto navega pelos botões; Voltar fecha a janela** e o foco volta ao cartão que
  abriu o trailer.
- **Fallback em camadas:** se a TV não carregar a API do YouTube, o proxy avisa e troca para o
  embed direto (que ainda toca, sem controle pelo controle), a janela passa a mostrar **Abrir
  no YouTube da TV** (o aplicativo nativo, como antes), **Abrir no navegador da TV** e **Ver QR
  code** (o diálogo antigo, com o código para o celular). Um temporizador de 12 s também cobre
  o caso de o player nem responder.
- O port pede **uma vez** o trailer do título ao TMDB (`videos`) e usa os trailers do add-on
  quando existem, como antes.

## Trailer automático

- **Trailer automático após assistir** liga os dois caminhos que o fork governa
  com `TrailerSettingsDataStore`: a tela de detalhes e a janela de
  pós-reprodução.
- No detalhe, ficar parado no botão Assistir (com o foco nele) pelo tempo
  configurado — 3 s a 15 s, padrão 7 s, como o `SliderSettingsItem` do fork —
  abre o trailer do título, uma vez por título. Qualquer tecla, toque ou mudança
  de foco cancela o temporizador, e depois de o trailer ter sido oferecido ele
  não volta sozinho. O fork reproduz o trailer no hero; o webOS não tem
  reprodução de YouTube dentro do app, então o port abre o mesmo diálogo do
  botão Trailer (Abrir no YouTube, navegador da TV ou QR code).
- Na janela de recomendações, os últimos cinco segundos de reprodução mostram um
  contador (`Trailer em 5s`), como `postPlayRecommendationCountdownSeconds`. Com
  a reprodução encerrada, o contador de cinco segundos roda e o trailer da
  recomendação é aberto no aplicativo do YouTube da TV — o mesmo caminho do
  detalhe. O fork usa uma segunda instância do player; o port não tem esse
  recurso.
- Sem trailer no TMDB, sem chave TMDB ou sem identificador do título, nada
  aparece e nenhum erro é mostrado; a janela de recomendações continua igual.
- Se o trailer não puder ser aberto na TV, a janela de recomendações permanece e
  o usuário continua no controle. O trailer é resolvido por uma única chamada ao
  TMDB no momento do contador (o fork resolve junto com os detalhes do
  candidato).
- O contador não aparece com o ajuste desligado, não dispara duas vezes na mesma
  reprodução e não interrompe painéis abertos.

## Ajustes com estado

| Ajuste | Chave | Padrão |
|---|---|---|
| Seleção automática de fonte | `playback.autoPlayMode` | `manual` |
| Filtro de palavras (Regex) | `playback.autoPlayRegex` | vazio |
| Addons permitidos | `playback.autoPlayAddons` | vazio (todos) |
| Reutilizar último link | `playback.reuseLastLink` | desligado |
| Duração do cache do link | `playback.reuseLastLinkHours` | 24 h |
| Trailer automático após assistir | `playback.trailerAutoPlay` | desligado |
| Atraso do trailer | `playback.trailerDelay` | 7 s |

O interruptor antigo "Reproduzir automaticamente a melhor fonte" é migrado para
`autoPlayMode = rank` na primeira abertura, sem perder nenhuma outra preferência.

## Testes

`tests/auto-play.test.mjs` cobre modos, política de regex, exclusões, escopo por
add-on, validade e limite do cache de links, duração do trailer, o contador de
cinco segundos e a migração do ajuste antigo. `tests/auto-play.spec.js` cobre a
tela de Ajustes, a rejeição de padrão inválido, a persistência, a reutilização do
link sem nova consulta ao add-on, a expiração, os quatro modos na lista de
fontes, a abertura do trailer pelo contador no fim do filme e o temporizador da
tela de detalhes.

- Sem padrão válido, com padrão que não coincide com nenhuma fonte ou no modo
  Manual, a lista de fontes continua aparecendo. O port nunca esconde uma lista
  vazia: a tecla Voltar do controle sempre alcança a lista de fontes.
- Um padrão que não compila é recusado no diálogo com aviso; o ajuste anterior é
  mantido.
