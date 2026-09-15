# Fidelidade do player ao fork — 0.16.0

Referência usada: `ysosrs123/NuvioTV-Fork@45e0984`, preservada nesta árvore.
A barra anterior era uma adaptação com uma única fileira de botões de texto.
Esta entrega a substitui pela estrutura do `PlayerControlsOverlay`, dentro de
`app/src/main/java/com/nuvio/tv/ui/screens/player/PlayerScreen.kt`.

## Implementado e verificável

- Título/logo à esquerda, episódio em linha separada. Logo limitado a 340×72 dp;
  falha de imagem restaura texto. Título 24/32 semibold, episódio 16/24 medium.
- Grupo de ícones à direita, antes da barra: informações, áudio, legendas,
  fontes e seta Mais. Círculos 48 dp, ícones 28 dp, intervalo 4 dp; foco branco
  com ícone preto. Mais expande velocidade e proporção na mesma linha.
- Abaixo: linha do tempo com buffer, tempo decorrido à esquerda, restante à
  direita; cápsulas Reproduzir/Pausar, Reiniciar, Episódios e Próximo episódio.
  Botões de episódio dependem do contexto e da disponibilidade do sucessor.
- Margem horizontal 32 dp, inferior 48 dp; linha do tempo 20 dp com traço
  3 dp, ou 8 dp e marcador 12 dp quando focada. Textos de tempo 14/20.
- Gradientes superior 150 dp e inferior 200 dp. Relógio/horário estimado de
  término e chips com resolução decodificada/tamanho informado pela fonte.
  Codec, HDR, canais e métricas não expostos pela TV não são inventados.
- Assets play, pause, episodes e aspect_ratio copiados dos SVGs do fork.
  Demais símbolos reproduzem os vetores Material usados no componente.
- Fontes do vídeo atual dentro do player, inclusive filmes. Painel 440 dp,
  preto 85%, raio 16 dp e padding 16 dp, derivados de StreamSourcesSidePanel.
  Filtro por addon, atualização e seleção manual. A fonte nova só substitui o
  vídeo ao escolher; preserva progresso, perfil e preferências de reprodução.
  Pedido tardio cancelado não navega nem toca mídia. Usa os limites já existentes.
- Reiniciar busca o início e reproduz. Voltar fecha o painel, depois Mais ou
  estatísticas, depois recolhe controles; o próximo Voltar sai para fontes.
- Cima/baixo conectam ícones ↔ barra ↔ cápsulas. Cima nos ícones e baixo nas
  cápsulas recolhem os controles. OK/seta recupera o foco com controles ocultos.
- Busca por controle: passos de 10 s e 20 s após 3 s segurando, portados de
  PlayerScrubRates. Atualiza a posição prevista, confirma uma vez ao soltar;
  Voltar cancela. Esquerda/direita com controles ocultos iniciam busca.
  Teclas LG de avanço/retrocesso compartilham a regra. Perda de janela/suspensão
  cancela a prévia e limpa listeners ao sair. Próximo automático espera a busca.
- Estilo de legendas da 0.15.2 preservado conforme pedido explícito do usuário;
  a margem com controles abertos agora considera a altura real da barra.

## Diferenças que permanecem

Não se declara o player integralmente idêntico ou todos os recursos concluídos.
O layout foi transposto do código; ainda falta comparação no aparelho com os
mesmos títulos, faixas e preferências do Android.

| Área do fork | Estado webOS |
| --- | --- |
| Barra principal, reiniciar, ícones, Mais, relógio | Transpostos nesta entrega; confirmar renderização física |
| Busca com aceleração | Implementada; prévia usa barra completa, ainda sem miniaturas |
| Fontes, episódios, idiomas, velocidade, proporção | Operacionais; painéis precisam continuar a revisão fina contra a referência |
| Estatísticas | Mesma posição/largura 380 dp; apenas dados reais disponíveis via APIs de mídia, conteúdo ainda simplificado |
| Áudio e legendas sem faixas expostas | Acesso preservado para consulta/diagnóstico e addons; presença dos ícones ainda difere do gate estrito Android |
| Sincronização por fala, atraso fino nativo e áudio | Ainda não portados; atraso externo em passos de 0,5 s continua |
| Busca manual de legendas, ASS/PGS/libass | Ainda pendentes ou limitados pelo compositor nativo |
| Tela de pausa com elenco, prévia de busca, intro/outro e guia parental | Ainda pendentes, incluindo origem/contratos dos dados |
| Recomendações pós-reprodução e detalhes avançados de Up Next | Parcial; próximo episódio/contagem/“Ainda assistindo?” existentes |
| Trocar ExoPlayer/MPV e abrir player Android externo | Não executáveis neste app webOS; botões sem implementação não foram adicionados |
| AFR/display modes, tunneling, passthrough, downmix, decoder/FFmpeg | Dependem de alternativa específica LG; sem alegação de suporte |
| Reportar falha ao serviço do fork | Não integrado; nenhuma ação envia relatórios |

## Próxima etapa do player

Revisar os painéis de áudio/legendas e implementar sincronização por fala a
partir de `SubtitleTimingDialog.kt`, seguida da tela de pausa e dos dados de
intro/miniaturas. Manter as diferenças acima rastreáveis até serem verificadas.
Não avançar para outras áreas enquanto esta revisão prioritária estiver ativa.

## Testes

Vídeo sintético no navegador; geometria e foco, expansão inline, restart,
logo/fallback, busca/commit/cancelamento, fontes/retomada/erro/cancelamento e
regressões de legendas, episódios, conta e histórico. A suíte não substitui
validação de áudio, DRM, HDR, composição ou controle remoto físico na LG.
