# Referência visual — revisões 0.2 e 0.4

Base: **ysosrs123/NuvioTV-Fork**, commit
`45e0984c18460d2a65c5d745999011b4314328eb`, branch `nuvio-test`.
Não foi usado NuvioTVSmart. A revisão 0.1.0 tinha uma interface genérica que não
correspondia ao pedido; seu banner, paleta azul e menu permanentemente expandido
foram removidos.

As medidas Compose são traduzidas para um canvas web de **960×540**, escalado
para **1920×1080**. Os valores abaixo são dp/sp antes da escala 2×.
Preferências padrão da base: **tema Branco, Inter, escala 100%, home Modern,
pôsteres em retrato, sidebar clássico e hero parcial**. O fork também oferece
outras combinações; a 0.4 implementa as variações listadas abaixo, mas não todas as personalizações.

## Medidas e origem

Caminhos relativos a `app/src/main/java/com/nuvio/tv/`.

| Elemento | Valores aplicados | Origem |
|---|---|---|
| Fundo/textos | `#0D0D0D`, branco, `#B3B3B3`, `#808080` | `ui/theme/PrimitiveTokens.kt`, `ThemeColors.kt`, `Color.kt` |
| Fonte | Inter variável original; pesos/tamanhos do tema | `ui/theme/Type.kt`, `res/font/inter_variable.ttf` |
| Sidebar | 72/196 recolhido/expandido, itens 48/148×52, ícone 22, intervalo 10, deslocamento vertical 28 | `MainActivity.kt: LegacySidebarScaffold/LegacySidebarButton`, `ui/theme/ComponentTokens.kt` |
| Conteúdo | Deslocamento lateral 54 | `ui/theme/LayoutMediaTokens.kt` |
| Menu | Início, Busca, Biblioteca, Ajustes; addons em Conteúdo e Descoberta | `MainActivity.kt`, `SettingsScreen.kt` |
| Sem addons | Mensagem central, corpo 16/24, texto secundário | `ui/screens/home/HomeScreen.kt`, `res/values-pt-rBR/strings.xml` |
| Hero | Arte 72%, deslocamento 56 à direita, altura 297,2; fades do original | `ui/screens/home/ModernHomeContent.kt`, `ModernHomeHero.kt` |
| Texto do hero | Margem 52, largura 42% após margens; título 28×0,92; descrição 14×0,90, até 4 linhas | `ModernHomeContent.kt`, `ModernHomeHero.kt` |
| Faixas | Região inferior 52%; título 16/24 semibold; espaço título 14; margem 52; intervalo de faixas 24 | `ModernHomeContent.kt`, `ModernHomeRows.kt`, `ModernHomeRowsList.kt` |
| Pôsteres | 126×0,84×1,08 = 114,3072 de largura; altura 171,4608; raio 12; intervalo 12; foco 2, sem zoom | `ModernHomeContent.kt`, `ModernHomeRows.kt` |
| Controle | Esquerda na primeira capa abre menu; Direita restaura foco; hero após 450 ms | `MainActivity.kt`, `ModernHomeModels.kt` |
| Detalhes | Hero 540, margem 48, alinhado embaixo, título 36/44 ou logo, ações antes da sinopse | `ui/screens/detail/HeroSection.kt` |
| Fontes | Colunas 40/60, identidade centrada, margem 48, filtros acima da lista | `ui/screens/stream/StreamScreen.kt` |
| Ajustes | Workspace com raio 28, padding 20, rail 220, itens 56, gap 16, grupo com raio 16 e padding 14; dez categorias, subtítulos e cartões conforme `SettingsUiStyle` | `ui/screens/settings/SettingsScreen.kt`, `SettingsDesignSystem.kt` |
| Temas | Doze paletas de `AppTheme` (fundo, cartões, foco e destaque); Branco é o padrão e reproduz os literais anteriores | `ui/theme/ThemeColors.kt`, `SupporterThemeColors.kt`, `PrimitiveTokens.kt`, `ThemeDataStore.kt` |
| Guia parental | Linha 3×altura das linhas, deslocamento 32/24 do topo, linha 18, intervalo 2, texto 11 | `ui/screens/player/ParentalGuideOverlay.kt` |
| Pós-reprodução | Arte 200×113, coluna de ações 240, motivo 12/16, título 28/36, sinopse 14/20 em até 3 linhas | `ui/screens/player/PostPlayRecommendationOverlay.kt`, `PostPlayOverlay.kt` |
| Addons | Margens 36/28, bloco de instalação com padding 20 | `ui/screens/addon/AddonManagerScreen.kt` |

Fonte, wordmark e SVGs de busca/biblioteca/ajustes são copiados **sem alteração**;
os testes comparam seus bytes com os arquivos Android. Home usa o Material Home
do sidebar clássico. Os SVGs são incorporados ao DOM e recebem a cor do tema, como no Android,
sem decodificação assíncrona de máscaras ou requisições no protocolo local do IPK. A fonte é local e inclui sua licença OFL.

## Verificação e limites

Os testes conferem estado vazio, cores, fonte, geometria 1920×1080, menu,
atualização do hero, restauração do foco, entrada `file://`, biblioteca,
instalação de addons, episódios, fontes, vídeo sintético e retomada.
As capturas usam conteúdo sintético; não são screenshots do Android.

Isso **não comprova identidade pixel a pixel** entre Compose e o Chromium da LG.
Ainda falta uma comparação com o Android usando os mesmos catálogos e
preferências. O usuário confirmou que a 0.2 ficou mais parecida e que o login da 0.3 funcionou. As variações da 0.4 ainda precisam de validação no aparelho.

Persistem diferenças nas telas secundárias: a conta passou a funcionar na 0.3.0 via QR code e importação de addons;
outras integrações não portadas são identificadas como indisponíveis; busca usa o teclado da LG; player usa controles web/nativos; filtros de fontes têm ações próprias do port. TMDB/MDBList, trailers do hero, expansão temporizada, efeitos de profundidade, temas/fontes alternativos e outras personalizações ainda não estão implementados. Logos, artes e sinopses dependem dos metadados
dos addons instalados.

A atualização preserva `org.nuviofork.webos` e o armazenamento da 0.1.0.
Favoritos ficam na TV; não representam sincronização com uma conta Nuvio.

## Entrega 0.4 — opções Modern e detalhes

O próprio `LayoutPreferenceDataStore.selectedLayout` força **MODERN** no fork
(nt20). Não foi criado um seletor de Classic/Grid que a base não oferece mais.
As opções abaixo funcionam e persistem nesta TV; não são botões de demonstração.

| Recurso | Medidas/regra do fork aplicada |
|---|---|
| Pôsteres horizontais | `126 × 1,24 × 1,34 = 209,3616` de largura; altura `/1,77`; viewport de faixas 49% em vez de 52%. `ModernHomeContent.kt` |
| Fundo em tela cheia | Arte ocupa 960×540; modo parcial continua em 72% da largura. `modernHeroFullScreenBackdropEnabled` |
| Sidebar Modern | Contêiner 230, padding inicial 14/final 8: superfície 208, topo 16, fundo 12, raio 30; wordmark ou perfil no original. Nesta etapa usa wordmark. `MainActivity.ModernSidebarScaffold`, `ModernSidebarBlurPanel.kt` |
| Menu recolhido | Pill com ícone e nome da tela, reduz ao ícone após 3 s; ocultação total opcional e reabertura por Esquerda/Voltar. Desfoque de 24 opcional e desligado por padrão |
| Rótulos/catálogos | Liga/desliga título dos pôsteres, nome do addon e sufixo Filme/Série. `LayoutPreferenceDataStore`, `ModernHomeModels.catalogRowTitle` |
| Continuar Assistindo | Liga/desliga; estilos Cartão (209,3616×118,2834), Pôster (114,3072×171,4608) e Amplo (264,6×105,84). `ModernHomeContent.kt` |
| Metadados do destaque | Após 450 ms, consulta o recurso `meta` dos addons, mantendo os dados de catálogo como fallback. Requisição anterior cancelada ao mover foco/sair/ocultar app; mesma cache limitada dos detalhes |
| Detalhes | Gradientes lateral (78% da largura) e inferior (a partir de 38%) de `MetaDetailsScreen`; título 36/44 bold de `Type.kt`; sinopse expansível, créditos e metadados sem fabricar notas/dados ausentes |
| Episódios | Cartões 320×207, padding lateral 48, gap 16, raio 12 (faixa 760–999 dp de `EpisodesSection.rememberEpisodeCardMetrics`). Temporadas em botões, troca por foco após 150 ms |
| Assistir série | Retoma o último episódio iniciado ou procura o próximo disponível. Especiais não passam à frente da primeira temporada regular. A temporada visível não altera o destino do botão principal |
| Elenco | Dados recebidos do addon, até 40 pessoas, fotos circulares de 100 e células de 150. `CastSection.kt`. Filmografia/TMDB ainda pendentes |
| Controle | Restaura título/faixa/temporada ao voltar, inclusive quando dois catálogos contêm o mesmo título. Modal mantém foco dentro dele. Rolagem por foco não desloca botões durante um clique do ponteiro |

O fluxo de sinopse e os cartões foram verificados com metadados sintéticos,
incluindo atrasos/falhas e HTML malicioso tratado como texto. Os controles de
fontes/player, biografia/filmografia, menus long-press de episódios, avaliações,
trailers e recomendações ainda não são equivalentes ao Android. O próximo marco
sugerido e as demais pendências estão em [ROADMAP.md](ROADMAP.md).

## Entrega 0.5 — fontes e painéis do player

A lista de fontes recebe chips, refresh, logos e badges seguindo StreamScreen.
Filtro por addon e foco sobrevivem ao retorno do vídeo. Os painéis Áudio/Legendas
usam a geometria 320 dp/raio 20 dp dos overlays Android e rolam pelo controle.
A barra de posição é um controle web acessível. O restante da barra do player,
editor completo, seleção automática de idiomas e personalizações dos badges
continuam diferentes. Rastreabilidade e limites: [PLAYER.md](PLAYER.md).

## Entrega 0.6 — seleção de perfis e biblioteca

Perfis seguem as medidas de `ProfileSelectionScreen`: logo 44, título 44/18,
cartões 152/gap 28, modo compacto 128/gap 16, avatares circulares 96 ou 82.
PIN com teclado numérico é adaptação webOS. A biblioteca recebe dados da conta,
status de importação e paginação de 100 cartões. Editor de perfis, fundos, avatares
do catálogo e a organização avançada da biblioteca ainda divergem do Android.
Ver [PROFILES.md](PROFILES.md).

## Entrega 0.7 — histórico e retomada

Continuar Assistindo usa os cartões existentes e recebe progresso nativo Nuvio,
sem duplicar episódios da mesma série. A tela adicional Histórico e assistidos
é uma adaptação de gerenciamento para webOS, com paginação e escolha de conflitos;
não é uma réplica de uma tela Android. O layout principal não foi redesenhado.
Rastreabilidade e limites: [HISTORY.md](HISTORY.md).

## Entrega 0.8 — estado do envio e conflitos

Tela adicional Sincronização, acessível por Biblioteca, Histórico e Conta, mostra
pendências e até 20 conflitos por vez. Usa os componentes existentes; é uma
adaptação de gerenciamento webOS, sem redesenhar home, detalhes ou player.
O fluxo completo de Descobrir/Busca do Android é a próxima etapa sugerida.

## Entrega 0.9 — Descobrir e busca

`SearchDiscoverSection`: margem 48 dp, título 28/36, três filtros com gap 12,
raio 14, padding 14×10; menu máximo 320; cartões 126×189, raio 12, grade com
gap horizontal 10/vertical 16. Busca usa ação Descobrir de 56 dp, pesquisa viva
350 ms e oito recentes por perfil. Gêneros traduzidos pelos recursos pt-BR do fork,
sem alterar o valor usado na consulta. Ver [DISCOVERY.md](DISCOVERY.md).

Diferenças: paginação explícita e lotes de seis catálogos na busca, filtros de
busca adicionais, teclado nativo webOS, sem voz/sugestões/menus long-press.
A organização de catálogos usa controles web de ordem/visibilidade por perfil.
A comparação visual Android/webOS com dados idênticos ainda está pendente.

## Entrega 0.10 — metadados e pessoas

Veja [METADATA.md](METADATA.md) para contratos, geometria do fork, configuração
TMDB própria e diferenças. Elenco aproveita app_extras; pessoa inclui biografia
em diálogo e filmografia em páginas de 30. Recomendações e trailers usam cartões
260×146; filmografia 112×168 e foto de pessoa 160×240. As abas transparentes com
separadores mudam ao receber foco. Ícone de trailer e logo TMDB vêm dos SVGs
originais. Trailers abrem externamente no YouTube/navegador, com QR alternativo;
o overlay de reprodução Android ainda não foi portado. Testes da ponte nativa
são simulados e não substituem validação na LG.

## Entrega 0.11 — coleções e avaliações

[COLLECTIONS_RATINGS.md](COLLECTIONS_RATINGS.md) registra os contratos TMDB/MDBList,
origem dos ícones e diferenças restantes. Coleções: cards 260×146, gap 12,
margens 48, ordem de lançamento e 30 itens por página. Avaliações: logos 24,
gaps 14/6 na faixa reservada do hero; consultas de leitura com três fontes em
paralelo. As chaves são locais à TV e independentes do login Nuvio. Testes usam
fixtures, sem validação física na LG ou chave real do usuário.

## Entrega 0.12 — idiomas e próximo episódio

[PLAYBACK_AUTOMATION.md](PLAYBACK_AUTOMATION.md) registra regras, defaults e diferenças
do player. Cartão baseado em PostPlayOverlay, 420 dp, padding 10/9, textos 11/14 sp;
contagem cancelável adaptada ao ciclo de vida webOS. Preferências locais, idioma
principal/secundário e prioridade para escolhas manuais. Validação física pendente.

## Entrega 0.13 — legendas e memória de faixas

[SUBTITLE_PREFERENCES.md](SUBTITLE_PREFERENCES.md) descreve forçadas em função do
áudio, limpeza SDH de legendas externas, coluna/filtro de idiomas e memória por
título e perfil. Atualiza as pendências indicadas nas entregas anteriores.
Faixas internas, formatos e navegação física ainda exigem validação na LG.
