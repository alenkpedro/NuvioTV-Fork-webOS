# Correção da fonte — 0.15.1

A 0.14/0.15 aplicava Netflix Sans à camada SRT/VTT externa e solicitava a fonte
por CSS `video::cue` às legendas nativas. Isso não garantia a fonte nas faixas
que a LG desenha por conta própria. O relato do usuário motivou esta correção;
não houve acesso ao aparelho para identificar a faixa exata ou medir a saída.

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
