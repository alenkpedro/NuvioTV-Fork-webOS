# Áudio e receiver: switches por formato (0.38)

Port dos switches de `PlaybackAudioSettings.kt` — as cinco perguntas que o fork faz sobre a
sua cadeia de áudio — e do que o `DiagnosticsCard` mostra sobre ela.
**Ajustes → Reprodução → Áudio e receiver**.

## Onde o port é diferente, e por que diz isso

O fork **decodifica no aparelho** os formatos que o receiver não aceita (tem decodificador
próprio; usa isso até para o DTS que alguns boxes dobram para estéreo). Um aplicativo web não
tem decodificador próprio aqui, então o port faz o que **pode** fazer com a mesma escolha:

1. **Desvia a escolha automática e marca a lista.** Uma fonte cujo áudio reconhecível está
   todo em formatos que você marcou como não suportados aparece como indisponível na lista e é
   ignorada por “Reproduzir melhor fonte”, pela reprodução automática e pela varredura.
2. **Não bloqueia na dúvida.** Se a fonte tem mais de um sinal de áudio (por exemplo, TrueHD e
   DD+ no mesmo nome), ela continua sendo oferecida: bloquear o que pode tocar seria pior do
   que deixar a TV tentar.
3. **Não promete conversão.** Nada é transcodificado: a escolha do port é *qual fonte*, não
   *como decodificar*.

## Os cinco switches

Dolby Digital (AC-3) · Dolby Digital Plus (E-AC-3) · Dolby TrueHD/Atmos · DTS · DTS-HD/DTS:X.
Cada um é uma pergunta sobre o seu receiver, com o interruptor ligado significando “o meu
receiver decodifica”. O master **Usar os switches de formato** fica **desligado** por padrão
(igual ao fork), e desligado o port não filtra nada.

Como o nome de uma fonte é lido: os mesmos sinais que o fork usa (tags de áudio do release),
com casamento por limite de palavra — `dd+` nunca entra como Dolby Digital, `dts-hd` conta
como DTS **e** DTS-HD (porque traz o núcleo DTS) e `atmos` é lido como DD+ quando não há
TrueHD junto.

## A linha de diagnóstico

**O que a TV declara decodificar** consulta a própria plataforma (`MediaSource.isTypeSupported`)
para cada codec e mostra o resultado como **declaração**, não como medição: um EDID mentiroso
se parece com uma limitação real, e é exatamente por isso que o fork põe uma linha de
diagnóstico ao lado dos switches. O port não lê o EDID do receiver — não tem como — e não finge
que lê.

## Limites

- Sem decodificador próprio, um formato desligado **não** vira áudio compatível: o port escolhe
  outra fonte, ou toca a mesma e a TV decide o que faz.
- A TV continua sendo quem negocia o bitstream; o port não mede o que chega ao receiver.

## Testes

`tests/audio-compat.test.mjs` (4 testes): os cinco switches e os padrões, a leitura dos sinais
no nome da fonte (incluindo `dd+`, DTS-HD e Atmos), o desvio conservador quando só o formato
desligado está presente e a linha de diagnóstico como declaração da plataforma.
