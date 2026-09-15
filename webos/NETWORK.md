# Buffer e Rede: buffer inicial, espera após travamento e teste de velocidade

Port do que o player da TV consegue obedecer de `PlayerSettingsDataStore`
(`BufferSettings`) e de `core/network/StreamSpeedTester.kt`, no fork fixado em
`45e0984`. O grupo **Buffer e Rede** fica em **Ajustes → Reprodução**.

## Buffer de reprodução personalizado

- Desligado, nada muda: o elemento de mídia do webOS decide o próprio buffer,
  como o fork quando o ajuste está desligado e usa os padrões do Media3.
- Ligado, o port passa a obedecer às duas durações equivalentes do fork —
  `bufferForPlaybackMs` e `bufferForPlaybackAfterRebufferMs` — com os **mesmos
  padrões e a mesma faixa**: **Buffer inicial** 5 s (0–20 s) e **Buffer após
  travamento** 3 s (0–20 s).
- **Buffer inicial** espera o material carregado chegar ao alvo antes de chamar
  `play()`. A espera é medida sobre as faixas já carregadas contíguas à posição
  atual; uma falha de rede no meio do caminho zera a contagem, como o visualizador
  percebe.
- **Buffer após travamento** segura a retomada: em uma travessia por falta de
  buffer, a reprodução pausa e só volta quando o alvo está carregado de novo.
  Isso vale depois do primeiro quadro; antes de começar, o elemento mantém a
  própria política — igual ao Media3, que não aplica a janela de rebuffer ao
  primeiro `prepare`.
- **Tempo limite de espera** (5 s a 60 s, padrão 20 s) evita tela preta: passado o
  limite, a reprodução começa (ou volta) assim mesmo, sem prometer fluidez.
- Zero segundo significa "não esperar" em ambos os campos, o que dá o
  comportamento atual do port com o interruptor ligado.

## Teste de velocidade

- Na lista de fontes de um título, **Testar velocidade** mede as fontes HTTP(S)
  elegíveis com o **mesmo transporte do player** (um `fetch` com `Range`, como o
  `StreamSpeedTester` usa o mesmo cliente de reprodução).
- A medição mantém as ideias do fork: um aquecimento de 256 KB não conta para o
  relógio (para o TCP slow-start não derrubar o número), a janela de medição para
  no orçamento de bytes ou no tempo, e cada fonte recebe a sua própria taxa por
  sub-janela de 400 ms.
- O resultado aparece no cartão da fonte: taxa e latência
  (`9,4 Mbps · 230 ms`). Um corpo que chega em um único bloco não tem janela
  própria, então a taxa usa o tempo total da requisição (latência incluída) e o
  valor sai com `~`, marcando que é aproximado.
- **A lista não muda**: a medição é informação, não um novo ranking. O port não
  tem o `StreamSweepEngine` do fork (que testa conexões paralelas para escolher
  uma configuração de rede), porque um aplicativo web não abre sockets paralelos
  para o elemento de mídia.
- Falha por fonte é reportada por fonte (`HTTP 403`, `tempo esgotado`, `falha de
  rede`, `nenhum byte recebido`) sem interromper a lista, como o fork registra uma
  célula que falhou e continua a varredura.
- **Orçamento de bytes**: no máximo 4 fontes por vez, duas de cada vez, 2 MB
  medidos por fonte (mais 256 KB de aquecimento) e 8 s por fonte. São bytes reais
  da sua fonte e do seu provedor; por isso a medição só roda quando você pede.
- Sem nenhuma fonte HTTP(S) elegível, a ação explica e não faz requisições.

## O que continua pendente, e por quê

Estas linhas do grupo do fork aparecem marcadas como **Pendente** no ajuste, com
o motivo:

- Duração mínima e máxima do buffer, gerenciamento de uso de memória e tamanho do
  buffer alvo: são janelas em **bytes** do Media3; o elemento de mídia da TV não
  aceita alvo de bytes.
- Cache em disco de VOD: o Media3 tem um cache próprio; aqui quem cacheia é o
  navegador da TV.
- Rede personalizada (conexões paralelas) e HTTP/2: dependem do cliente OkHttp;
  o transporte é do navegador.
- Memória nativa do ExoPlayer: alocador off-heap do Android.
- AFR (taxa de quadros automática): um aplicativo web no webOS não pode trocar a
  frequência do painel.

O ajuste de velocidade do fork vive dentro do próprio Media3; aqui o diagnóstico
do player continua mostrando apenas o que é medido no webOS (resolução
decodificada, buffer temporal e frames perdidos) e não declara bitrate da fonte.

## Testes

`tests/network.test.mjs` cobre os padrões e limites do buffer, faixas carregadas
com lacunas, a espera (pronta, tempo esgotado e cancelamento), o aquecimento, o
orçamento de bytes, a janela aproximada, os textos de falha e o formato do
relatório. `tests/network.spec.js` cobre o grupo de Ajustes com os passos e a
persistência, as linhas pendentes, a reprodução com o buffer personalizado
ligado, a medição real com `Range` sobre duas fontes, o erro por fonte e o
diagnóstico apontando para a lista de fontes.
