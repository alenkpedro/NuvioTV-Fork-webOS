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

## Varredura de transporte (0.33)

**Lista de fontes → Varredura de transporte** roda o `core/network/StreamSweepEngine.kt` do
fork sobre o transporte que existe aqui: as células são medidas pelo **serviço de mídia
local** (`measure`), e a vencedora é aplicada com um botão (`Usar N× M MB`), que liga o
transporte local com aquela configuração.

As escadas são menores que as do fork (8/16/32/64/128 MB e até 16 conexões) porque cada
célula é tráfego real do usuário e a memória é compartilhada com o app:

| | Fork | Port |
|---|---|---|
| Faixas | 8, 16, 32, 64, 128 MB | 1, 2, 4, 8 MB |
| Conexões | 1 → 16 | 1, 2, 3, 4, 6, 8 |
| Células por varredura | até 12 (+2) | até 8 (+1) |
| Orçamento por célula | 8 MB de aquecimento + 64 MB medidos | 256 KB de aquecimento + até 8 MB medidos |
| Sub-janelas | 500 ms | 500 ms |

As regras de decisão são as do fork, e continuam sendo rastreáveis:

- **Estágio 1 — linha de base (1 conexão).** Se uma conexão já alimenta o título, o veredito
  é *deixe em 1* e a varredura encerra. Se a linha de base não transfere nada, ela também
  encerra, como no fork.
- **Estágio 2 — subida de faixa** a 2 conexões na escada 1/2/4/8 MB.
- **Estágio 3/4 — subida de conexões e vizinhança** em torno da melhor célula.
- **Paradas assimétricas**: enquanto o alvo não é atingido, qualquer ganho conta e **uma**
  regressão ganha um passo de graça (duas seguidas param); com o alvo atingido, só ganhos de
  **≥10%** são adotados (`betterCell`) e no máximo **uma** célula extra roda.
- **Suficiência**: alvo = **2× o bitrate do título** (o informe da própria fonte quando
  tamanho e duração são conhecidos), com a tolerância de 0,95 do fork.
- **Memória**: uma célula que não cabe na janela é **marcada como ignorada**, nunca executada
  (`MemoryBudget.overbudget`).
- **Fonte limitando**: duas células colapsadas (falha ou abaixo do piso de 5% da linha de
  base) param a subida e o veredito diz que a fonte está limitando o tráfego.

O painel mostra cada célula com a taxa medida e a **estabilidade** (coeficiente de variação
das sub-janelas: estável / oscilando / instável) e, no fim, o veredito com o ganho sobre uma
conexão. Nada é aplicado sem o usuário mandar.

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

A varredura tem o seu próprio arquivo de teste: `tests/transport-sweep.test.mjs` cobre as
escadas, o portão de memória, o alvo de 2×, a estabilidade, a linha de base que já alimenta
o título (para em 1 conexão), a linha de base que falha, as duas células colapsadas, as
células ignoradas por memória, o teto de passagens e o cancelamento pelo controle remoto.
