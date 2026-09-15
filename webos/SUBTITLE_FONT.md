# Fonte fixa e estilo padrão de legenda — 0.19.0

Preset solicitado pelo usuário com duas referências visuais e valores CSS.
Usa o arquivo **NetflixSans-Medium.otf**, peso real **500**, fornecido no ZIP,
incluído sem alteração (212.020 bytes). Substitui o arquivo Regular; a interface
continua com Inter. Fonte local, sem consultas externas.

- Branco #fff, sem caixa de fundo e sem stroke.
- Tamanho: 3,6% da altura do canvas; entrelinha 1,16; espaçamento −0,015 em.
- Centralizado; largura máxima 78%; margem inferior 6,5% com controles ocultos.
- Quatro sombras pretas curtas; equivalem a 0 1px 2px, 1px 0 1px,
  −1px 0 1px e 0 −1px 1px em 1080p, com opacidades 1 / 0,9 / 0,9 / 0,75.
- O canvas do app é 960×540 e recebe uma escala. Por isso o tamanho base é
  19,44 px lógicos, resultando em 38,88 px no 1080p, 51,84 px no 1440p e
  77,76 px no 4K. Usar 3.6vh diretamente duplicaria a escala na TV 1080p.
- Com os controles abertos, a legenda sobe para a área acima deles, como já
  fazia o player, evitando sobreposição. Ao recolher, volta para 6,5%.
- Desde a 0.19, o preset é o padrão restaurável e a aparência pode ser ajustada
  pela StyleRail. A família continua fixa. Preferências antigas de tamanho/fundo
  são ignoradas; os ajustes novos ficam separados por perfil. Prévia, nome, status e avisos técnicos
  da fonte não aparecem no fluxo do usuário. Permanecem idioma/faixa,
  sincronização e limpeza SDH. A verificação de fonte continua interna.

A camada externa SRT/VTT e o texto interno acessível usam o mesmo preset.
Faixas opacas/PGS continuam dependendo do compositor nativo; não há promessa
de forçar sua aparência. Não há transcodificação nem alteração do vídeo.

Ver [personalização atual](PLAYER_EXTRAS.md).

Validação: carregamento da face Medium, ausência do seletor/informações de fonte,
preferências antigas ignoradas, medidas reais em 1080p/1440p/4K, legenda externa
legível no fallback de fonte e regressão das seleções/sincronismo. Imagem e
texto de teste sintéticos no navegador; validação física permanece pendente.

## Histórico técnico da 0.15.1

A descrição abaixo registra a correção original. Prévia, informações de fonte
e controles de tamanho/fundo citados foram removidos pela 0.15.2, acima.

A 0.14/0.15 aplicava Netflix Sans à camada SRT/VTT externa e solicitava a fonte
por CSS `video::cue` às legendas nativas. Isso não garantia a fonte nas faixas
que a LG desenha por conta própria. O relato do usuário motivou esta correção;
não houve acesso ao aparelho para identificar a faixa exata ou medir a saída.

## Peso do texto: negrito e face fina

O port traz duas faces: **Netflix Sans Medium** (o visual que sempre existiu) é o estado
**com negrito**, e o estado **sem negrito** pede uma face mais fina. Enquanto o arquivo
`NetflixSans-Regular.otf` não estiver em `webos/public/assets/fonts/`, o navegador da TV cai
para a **Inter** embutida, que já é mais fina que o Medium — o ajuste muda o que está na tela
em qualquer caso.

Para usar a Netflix Sans fina exata:

1. coloque `NetflixSans-Regular.otf` (ou a face Light) em `webos/public/assets/fonts/`;
2. rode `npm run package:webos` de novo — a regra `@font-face` de `Netflix Sans Regular` já
   existe em `src/style.css` e passa a servir o arquivo.

Estilos salvos antes da 0.26.0 mantêm o mesmo aspecto: a leitura migra o valor antigo para o
estado Medium, então nada muda até o usuário tocar no **Negrito**.

## Comportamento

- O arquivo NetflixSans-Regular.otf fornecido permanece incluído sem alteração.
  `document.fonts.load` verifica o carregamento/decodificação, além da regra CSS.
- Quando uma faixa interna selecionada expõe `activeCues` com texto, o app
  muda para `hidden`, verifica a aceitação e desenha o texto na mesma camada
  Netflix Sans das externas. `cuechange` acompanha entradas/saídas; seek e
  eventos de mídia limpam/atualizam a camada. Não há polling adicional, download
  do vídeo, transcodificação ou cópia integral das legendas internas.
- Seleção manual, seleção automática, idioma, forçadas, memória e Desativadas
  reconhecem a faixa customizada, embora ela esteja em `hidden`.
- Tamanho, fundo e limpeza SDH também se aplicam às internas personalizáveis.
  O atraso salvo continua **exclusivo das externas**. A camada usa texto simples;
  posicionamento/estilos especiais da faixa interna não são preservados.
- Somente após texto acessível e fonte carregada o app assume o desenho. Sem
  texto, com API inacessível, imagens/PGS ou recusa de `hidden`, preserva a
  legenda nativa. Uma falha de troca preserva a seleção e a camada anteriores.
- No menu **Legendas**, o estado informa Netflix Sans em uso, carregando,
  falha de fonte, ou desenho pelo player da TV. Nos ajustes há prévia da fonte.
  Para uma faixa que permanece nativa, selecionar uma externa SRT/VTT de um
  addon permite usar Netflix Sans. Texto gravado na imagem do próprio vídeo
  não é uma faixa editável.

## Testar na LG

Atualize pelo mesmo apps.json, feche/reabra o app e confira **0.15.1** em Sobre.
Abra o mesmo vídeo e **Legendas → Ajustes de legenda**. Compare a prévia e a
legenda real, e confira o estado informado. Teste trocar legenda, desativar,
reativar e avançar/retroceder. Não é necessário sair da conta.

## Validação

Testes de unidade cobrem texto/markup, fonte não carregada, faixas opacas,
API que lança exceção, hidden recusado, seleção recusada com rollback,
desativação, remoção de faixa e listeners. Testes com VTTCue real no Chrome
cobrem seleção automática, fonte carregada, overlay exclusivo, seleção no
menu, seek, lacunas, desativação, troca nativa/externa e erro da fonte.
Testes de navegador não confirmam o comportamento do decoder/compositor LG.

Referências: [modelo TextTrack do HTML](https://html.spec.whatwg.org/multipage/media.html#text-track-model)
e [limites oficiais de protocolos/legendas LG](https://webostv.developer.lge.com/develop/specifications/streaming-protocol-drm).
