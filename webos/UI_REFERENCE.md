# Referência visual da revisão 0.2.0

Base: **ysosrs123/NuvioTV-Fork**, commit
`45e0984c18460d2a65c5d745999011b4314328eb`, branch `nuvio-test`.
Não foi usado NuvioTVSmart. A revisão 0.1.0 tinha uma interface genérica que não
correspondia ao pedido; seu banner, paleta azul e menu permanentemente expandido
foram removidos.

As medidas Compose são traduzidas para um canvas web de **960×540**, escalado
para **1920×1080**. Os valores abaixo são dp/sp antes da escala 2×.
Preferências padrão da base: **tema Branco, Inter, escala 100%, home Modern,
pôsteres em retrato, sidebar clássico e hero parcial**. O fork também oferece
outras combinações; esta revisão não as reproduz todas.

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
| Ajustes | Workspace com raio 28, padding 20, rail 220, itens 56, gap 16 | `ui/screens/settings/SettingsScreen.kt`, `SettingsDesignSystem.kt` |
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
preferências. A revisão 0.2.0 precisa de validação na TV; a foto do usuário
confirma a instalação da 0.1.0.

Persistem diferenças nas telas secundárias: integrações não portadas são
identificadas como indisponíveis; busca usa o teclado da LG; episódios usam
lista simples; player usa controles web/nativos; filtros de fontes têm ações
próprias do port. TMDB/MDBList, trailers do hero, variantes landscape/fullscreen,
sidebar Modern alternativo, efeitos de profundidade e outras personalizações
ainda não estão implementados. Logos, artes e sinopses dependem dos metadados
dos addons instalados.

A atualização preserva `org.nuviofork.webos` e o armazenamento da 0.1.0.
Favoritos ficam na TV; não representam sincronização com uma conta Nuvio.
