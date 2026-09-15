# Episódios no player e proporção da imagem — 0.15.0

Referência fixa: `ysosrs123/NuvioTV-Fork@45e0984`. Fontes principais:
`EpisodesSidePanel.kt`, `PlayerRuntimeControllerStreams.kt`, `PlayerScreen.kt`,
`PlayerAspectScaleUtils.kt` e `PlayerRuntimeControllerPlaybackEvents.kt`.

## Episódios e fontes

Durante uma série, abra **Episódios** na barra do player. O painel lateral usa
520 dp, margem interna 24 dp, cantos esquerdos 16 dp, miniaturas 130×90 e espaço
14 dp entre imagem e texto. A temporada atual e o episódio em reprodução recebem
destaque; também aparecem data, descrição e estado de assistido quando disponíveis.

- Esquerda/direita em um episódio muda a temporada, como no fork. Cima/baixo
  percorrem episódios; OK consulta fontes. As abas também aceitam clique e foco.
- Selecionar um episódio abre suas **fontes dentro do painel**. O vídeo atual
  continua até a seleção de uma fonte. Navegar não marca outro episódio assistido.
- Fontes usam o mesmo cartão, badges, filtros e ordenação da tela principal.
  Há filtro por addon, atualizar, mostrar todas e reproduzir melhor fonte.
  A escolha da melhor fonte respeita o addon selecionado e a regra existente
  de fallback dos filtros, sempre restringindo a HTTP(S) compatível.
- **Voltar** nas fontes cancela a busca e retorna ao episódio selecionado.
  Voltar na lista ou **Fechar** encerra o painel e devolve foco a Episódios.
- A troca efetiva guarda o progresso do vídeo anterior e inicia o episódio
  selecionado com suas próprias fontes, atraso e retomada. Reinicia a contagem
  de avanços automáticos, como uma escolha manual. O histórico de navegação
  descarta players anteriores; Voltar após a troca abre as fontes do novo episódio.
- Episódios futuros ficam identificados e não consultam fontes. Erro de addons
  ou ausência de fontes mantém o player atual acessível e permite atualizar.
  Metadados indisponíveis oferecem tentar novamente.

O próximo episódio automático fica suspenso enquanto o painel estiver aberto.
Uma resposta atrasada não troca o vídeo, nem repõe um painel já fechado. O app
oculto não permite selecionar/reproduzir uma fonte; a pausa por visibilidade
existente continua ativa. Consultar fontes não dispara outro player/prebuffer.

## Mais → Proporção da imagem

A barra agora reúne **Velocidade**, **Proporção da imagem** e **Diagnóstico** em
**Mais**, seguindo a organização do diálogo MoreActions do Android e mantendo
os controles na mesma linha. O botão de proporção percorre os sete modos:

| Modo | Comportamento |
| --- | --- |
| Ajustar (Original) | Preserva a proporção e mostra todo o quadro. |
| Preencher Tela | Amplia uniformemente para preencher, cortando as sobras. |
| Esticar | Preenche com escala diferente por eixo; pode deformar a imagem. |
| Zoom leve | Amplia 1,15× sobre o ajuste original. |
| Zoom cinema | Amplia 1,33× sobre o ajuste original. |
| Ajustar à altura | Amplia uniformemente vídeos mais largos que a tela. |
| Ajustar à largura | Amplia uniformemente vídeos mais estreitos que a tela. |

As fórmulas e a ordem foram transpostas de `resolveAspectScale`/`nextAspectMode`.
A escolha é local à TV, compartilhada entre perfis, conforme a preferência de
dispositivo do fork. Original é o padrão e o fallback de valores inválidos.
A escala é recalculada após metadados, mudança de resolução ou redimensionamento.
Apenas o elemento de vídeo recebe transformação; menu, timeline e legendas
externas Netflix Sans conservam suas dimensões. A fonte de vídeo não é recarregada.

## Limites e validação

Lista de episódios limitada a 10.000 entradas, com **50 cartões por página**;
a página inicial inclui o episódio atual. Temporadas usam janela de 12 abas e
atalhos para continuar. Essas são adaptações da lista lazy do Android para
limitar o DOM da LG. Não há blur de spoilers nesta etapa.

Até 30 addons, três consultas simultâneas, 300 fontes por addon e 100 cartões
visíveis, reutilizando os limites de resposta/timeout existentes. Respostas e
URLs ficam somente em memória e são liberadas ao fechar o painel. Não há
escrita de preferências ou histórico apenas por navegar na lista.

Testes com mídia e addons simulados cobrem temporadas/foco, assistidos, paginação,
cancelamento/retentativa, futuros, filtro por addon, troca e retorno sem loop;
aspecto 4:3, cinema largo, sete modos, persistência e mudança de resolução.
As capturas são do navegador, não da TV. O compositor nativo da LG ainda precisa
ser validado para crop/zoom de vídeo 4K/HDR. Não se promete redimensionamento
idêntico em todos os formatos. Legendas internas podem acompanhar a escala do
vídeo; as externas continuam separadas. Não há troca de decoder/transcodificação.

Próxima etapa sugerida: painel de fontes do vídeo atual e opção de ocultar
spoilers nas miniaturas dos episódios, conforme o fork.
