# Serviço de mídia local: faixas paralelas e HUD medido (0.32)

Port do que o `ui/screens/player/ParallelRangeDataSource.kt` faz no Android, executado
onde o webOS permite: um **serviço Node empacotado** que abre a fonte com as próprias
conexões e cabeçalhos e entrega os bytes ao player por `127.0.0.1`. Um aplicativo web
não pode abrir sockets para o elemento de mídia — o serviço pode, como o app oficial
webOS já faz nas portas locais do serviço de plugins.

Ajuste em **Ajustes → Reprodução → Buffer e Rede → Serviço de mídia local**.

## O que o serviço faz

- **Blocos de tamanho fixo e alinhados** (`media-core.js: chunkOffsets`), com várias
  faixas em voo ao mesmo tempo (`connections`, 1–8). É o que o fork chama de
  `chunkSizeBytes` × `parallelConnections`.
- **Janela retida** (`createChunkStore`): os blocos ficam na memória até um teto de
  bytes; voltar a uma posição já vista custa zero de rede. O teto é a *janela* que você
  escolhe (8–128 MB), e ela precisa caber `connections × chunk` — é o
  `MemoryBudget.overheadMb` do fork. Uma configuração que não cabe é recusada, não
  aceita com aviso.
- **Pipeline alimentado** (`readAheadOffsets`): a cada faixa entregue, o serviço
  enfileira a janela à frente da posição. Mais conexões só ajudam quando uma sozinha
  não alimenta o título; por isso o padrão é 2 conexões de 1 MB.
- **Contadores honestos**: bytes buscados, bytes entregues, blocos com falha e
  **blocos descartados** (buscados e nunca usados) — o número que o fork usa para
  provar quanto de tráfego foi jogado fora.
- **Cabeçalhos próprios** (`Referer`, `User-Agent`, cookies de sessão do addon): fontes
  que recusam o navegador da TV passam a ser buscadas pelo serviço.

## O que o serviço recusa, e o que acontece então

| Situação | Resultado |
|---|---|
| Fonte sem `Range` (responde 200 ou ignora o pedido) | `mediastart` recusa com o motivo e o player toca a **URL original** |
| Sem `Content-Length` (ao vivo, corpo em bloco) | Recusa; nada de janela sem tamanho conhecido |
| HLS (`m3u8`) ou DASH (`mpd`) | Segue direto no player: é playlist, não arquivo |
| Janela menor que `connections × chunk` | Recusa com o motivo; o ajuste mostra isso antes |
| Serviço ausente na TV (sem `PalmServiceBridge`) | Recusa; reprodução direta, sem tela preta |
| Bloco com falha ou truncado no meio da leitura | A resposta termina em erro em vez de servir um **buraco**; o elemento pede de novo |
| Range inválido do player | `416` com `Content-Range: bytes */<tamanho>` |

Um aviso na tela do player diz o motivo quando o transporte local foi pedido e não
pôde ser usado. Nada é silencioso e nada é prometido sem medição.

## HUD de diagnóstico (item 1 do fork: "proof, not vibes")

O painel de informações do player (ícone de informações) passou a mostrar o que a TV
**pode ser medida a fazer**:

- resolução decodificada;
- **bitrate de vídeo e de áudio como média medida** (`webkitVideoDecodedByteCount` /
  `webkitAudioDecodedByteCount` ÷ tempo reproduzido) — não é o valor do cabeçalho, é o
  que a TV decodificou;
- buffer disponível e os alvos do buffer personalizado;
- frames perdidos de total (`getVideoPlaybackQuality`);
- faixa de áudio selecionada quando a TV expõe a lista;
- fonte (addon) e **transporte**: `local · 2× 1 MB · janela 24 MB · 9,4 Mbps medidos ·
  320 MB buscados · 320 MB entregues · 0 descartados`;
- HDR e saída de áudio permanecem como **não medidos pela TV** — o port não inventa
  medição que não consegue fazer.

## Limites

- **HTTP/2 e prioridades de fluxo** continuam do cliente OkHttp; a TV negocia o
  protocolo sozinha. Esta linha permanece marcada como pendente nos ajustes.
- **Cache em disco**, memória nativa off-heap e AFR continuam sem equivalente webOS.
- O serviço é **um por vez** (`MAX_SESSIONS = 1`) e desliga sozinho depois de 3 minutos
  sem leitura, para não segurar memória com o app parado.
- O player ainda decide o próprio buffer do elemento; o transporte só muda *como* os
  bytes chegam.

## Testes

`tests/media-service.test.mjs` (12 testes) cobre os limites e o teto de memória das
configurações, o plano de faixas e a janela à frente, `Range` válido/inválido/por
sufixo e o `416`, o cache com os contadores de descarte, a recusa de bloco truncado, a
sessão com 1 e com 2 conexões (paralelismo medido no transporte falso), a falha de
bloco, a sonda que exige `206 + Content-Range`, o payload enviado ao serviço, cada
motivo de recusa e o cancelamento pelo controle remoto.
