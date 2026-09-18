# Avaliação do dispositivo (0.36)

Port reduzido de `core/assessment/DeviceAssessmentEngine.kt` e
`DeviceAssessmentApplier.kt`. **Ajustes → Avançado → Diagnóstico → Avaliação do
dispositivo**.

O contrato do fork é mantido: **cada linha diz de onde veio** — `medido`, `do hardware`,
`escolha sua` ou `não dá para saber aqui` — e **por que** está ali. O que não dá para saber
não é mexido e nem escondido: aparece com o motivo. **Aplicar** escreve os ajustes de uma vez
e **Reverter** devolve todos os valores anteriores (a cópia é guardada antes de aplicar e
sobrevive ao reinício, porque é persistida com o resto do estado).

## De onde vêm as recomendações

A avaliação consome a **última varredura de transporte** feita nesta TV (lista de fontes →
Varredura de transporte), que já é uma medição da fonte real pelo serviço local:

| Linha | Fonte | Regra |
|---|---|---|
| Transporte (conexões e faixas) | medido | melhor célula da varredura |
| Janela na memória | do hardware | 4× as faixas em paralelo (mínimo para não descartar blocos) |
| Buffer inicial e após travamento | medido | sub-janelas estáveis → 5 s / 3 s; oscilando → 8 s / 5 s |
| Buffer personalizado | escolha sua | é o que faz o buffer acima valer |
| Serviço de mídia local | medido | ligado quando a fonte só rendeu com 2+ conexões ou passou de 20 Mbps |
| Início rápido das fontes | medido | ligado quando a fonte entrega o alvo de 2× o bitrate |

Sem uma varredura, a primeira linha fica `sem medição` e **nada é aplicado** — o port não
inventa recomendação, e diz isso na tela.

## O que aparece como “não dá para saber aqui”

Modo Dolby Vision, conexões do Media3, memória nativa/off-heap, AFR e passthrough por formato:
cinco recursos que o fork avalia e que o webOS não expõe ao app. Cada um tem o motivo escrito,
no lugar de sumir da lista.

## Limites

- O fork mede o link contra **o último título reproduzido**; aqui o alvo é 2× o bitrate que a
  própria fonte informa (tamanho ÷ duração) e, sem esse informe, a varredura só aponta o
  vencedor.
- Perfil de buffer, contagem de conexões do Media3 e modo Dolby Vision não têm equivalente; a
  avaliação **não** finge que têm.
- A avaliação é texto e ajustes; nenhuma medição acontece dentro dela.

## Testes

`tests/device-assessment.test.mjs` (5 testes): as onze linhas com a origem de cada uma, o
patch só com o que a TV pode mudar, a ausência de varredura (nada aplicado), o vencedor de uma
conexão que **não** liga o transporte paralelo, e o perfil de buffer por estabilidade.
