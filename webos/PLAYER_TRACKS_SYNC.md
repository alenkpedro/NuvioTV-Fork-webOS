# Painéis de áudio/legendas e sincronização por fala — 0.17.0

Referência: `ysosrs123/NuvioTV-Fork@45e0984`, preservada nesta árvore.

## Uso

Player → Legendas → Ajustes de legenda → **Sincronizar por fala**.
Selecione antes uma legenda externa SRT/WebVTT da fonte ou dos addons.

1. Com o vídeo reproduzindo, pressione **Sincronizar** ao ouvir o início de uma fala.
2. Escolha a frase correspondente na lista, usando setas e OK.
3. O atraso é aplicado à legenda atual e salvo por filme/episódio e perfil.

A captura não pausa, avança nem reinicia o vídeo. Se já estava pausado, o prompt
oferece Reproduzir vídeo; teclas Play/Pause funcionam nessa primeira etapa.
A lista fica ancorada ao instante capturado, mesmo se o vídeo continuar.
Voltar cancela qualquer etapa sem modificar o atraso. Ocultar o app cancela a
sincronização e mantém a regra existente de pausar a reprodução.

O ajuste manual usa **100 ms** por toque, de **−180 a +180 s**, como no fork.
Valores positivos atrasam a legenda. Zerar atraso remove o valor salvo.
Atrasos antigos de 0,5 s continuam válidos. A memória permanece limitada a 100
vídeos por perfil, sem URLs ou texto das legendas. Não sincroniza com a nuvem.

## Layout e origem

`AudioSelectionOverlay.kt`, `SubtitleSelectionOverlay.kt`, `PanelComponents.kt`:

- Painéis 320 dp, margens direita/inferior 44/28 dp, raio 20 dp, preto 85%,
  padding 16/14 dp. Altura limitada ao espaço disponível no canvas 960×540.
- Cabeçalho 12/16, letras espaçadas 2,2, caixa alta, branco 55%, divisor 12%.
- Lista única: idioma, rótulo/origem, flags quando disponíveis. Idiomas preferidos
  primeiro, demais em ordem alfabética; ordem original preservada dentro do idioma.
- Linhas com padding 12/7 dp, raio 10, títulos 14/20, secundário 12/16. Selecionada
  com branco 16% e check; foco branco sólido com texto/check pretos.
- Ação de ajustes em cápsula; retorno à lista preserva o foco. Foco inicial na
  faixa selecionada. Voltar fecha e devolve foco ao ícone que abriu o painel.
- Gradientes do `PlayerOverlayScaffold` sobre o vídeo. A barra é recolhida ao abrir.

`SubtitleTimingDialog.kt`: prompt no topo 44 dp, largura 60%, padding 34/30,
raio 24. Lista a 94%, padding 26/20, linhas 56 dp, espaçamento 8 dp, seis linhas
visíveis; foco na frase mais próxima do instante marcado.
A janela inclui frases em ±180 s, até 90 itens centrados na frase mais próxima.
Sem frases nessa janela, oferece as mais próximas do arquivo, como no Android.
`PlayerRuntimeControllerSubtitleTiming.kt`: atraso = instante capturado − início
da frase − **300 ms** de compensação de reação. Precisão de milissegundos;
`SubtitleDelayConfig.kt`: limites de ±180 s e passo de 100 ms.

## Limites e diferenças restantes

A sincronização usa as frases do arquivo selecionado, não reconhecimento de voz.
Reutiliza cues já analisados; não pede microfone, não envia áudio/texto e não
baixa o arquivo novamente. Listagem limitada a 90 botões, sem trabalho por frame.
Preserva limites existentes: 2 MiB, 20 mil cues, seleção transacional, abort e
tratamento de erro. A fonte antiga permanece ativa se uma nova legenda falhar.

Sincronização e atraso são exclusivos de legendas externas SRT/WebVTT nesta
entrega. Faixas internas/PGS/ASS não recebem um ajuste fictício: os controles são
desabilitados e a indicação orienta selecionar uma externa. Fonte/aparência
Netflix Sans Medium seguem fixas conforme o pedido do usuário, sem informações
ou controles de fonte no menu. Filtro de preferidos, SDH, atualizar e esquecer
escolhas continuam disponíveis; são extensões funcionais à lista da referência.

Áudio seleciona e verifica as faixas expostas pela API. Atraso de áudio,
amplificação e mixagem de voz ainda não foram portados; Ajustes de áudio informa
essa condição, sem sliders inoperantes. Codec/canais/sample rate não são
inventados quando a plataforma não os fornece. O preset de legendas e estas
limitações impedem alegar paridade funcional integral.

Após aplicar a sincronização, o webOS confirma o valor por 4 s e devolve foco aos
controles; o Android abre seu overlay de atraso. O botão extra Reproduzir vídeo
quando pausado é uma adaptação para controle remoto/ponteiro da LG.

## Verificação e próxima etapa

Unidade: sinal e compensação, limites, precisão, janela/empates/extremos,
20 mil cues, persistência legada e isolamento por perfil/vídeo.
Navegador: instante congelado, seleção, reabertura/reset, cancelamento em ambas as
etapas, tecla LG 461, suspensão, um único vídeo, ausência de download extra,
limite de 90 linhas, foco, geometria e desabilitação em legendas nativas.
Regressões de SDH, fonte fixa, seleção e erros permanecem na suíte.

Testes com mídia sintética; renderização/áudio no aparelho LG continuam pendentes.
Próxima etapa prioritária: **tela de pausa com elenco**, seguindo o fork, antes
 dos contratos de intro/outro e miniaturas de busca.
