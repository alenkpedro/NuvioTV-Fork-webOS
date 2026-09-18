# Etapas para completar o fork no webOS

Referência única: `ysosrs123/NuvioTV-Fork@45e0984` (código Android preservado nesta árvore).
Alvo: LG 55UT8050, webOS 25. NuvioTVSmart não é a base deste projeto.

## Como continuar este trabalho

Pedido do usuário: ao concluir cada etapa, comunicar a entrega, os limites/testes
e **sugerir a próxima etapa**, sem esperar que ele pergunte. Manter este registro
atualizado. Não declarar uma etapa integralmente concluída por existir uma tela
parecida: conferir ações, navegação, persistência e diferenças pendentes.

Cada atualização publicada deve preservar a conta e o ID do aplicativo, ter IPK
versionado e ser disponibilizada pelo mesmo `apps.json`. Publicar o pacote antes
de mudar o índice. Não colocar senhas ou dados reais da conta nos testes/capturas.

## Entregas

| Versão | Entrega | Validação na TV pelo usuário |
|---|---|---|
| 0.1 | Primeiro pacote instalável | Instalação confirmada; aparência rejeitada |
| 0.2 | Reconstrução do layout padrão a partir do fork | Usuário confirmou que ficou mais parecido |
| 0.3 | Login por QR e importação dos addons do perfil principal | Login confirmado pelo usuário |
| 0.4 | Variações Modern, menu flutuante/oculto, metadados do destaque, detalhes/episódios e restauração de foco | Pendente |
| 0.5 | Fontes com filtro/refresh/retorno, painéis de áudio, legendas externas SRT/WebVTT e ajustes | Pendente; troca de áudio testada com API simulada |
| 0.6 | Perfis/PIN, addons próprios/herdados, biblioteca nativa da conta e isolamento dos dados locais | Pendente; usuário testará depois |
| 0.7 | Histórico nativo Nuvio por perfil, retomada e resolução local de conflitos | Pendente; usuário testará depois |
| 0.8 | Envio nativo Nuvio, fila por perfil, remoções por item e conflitos | Pendente; usuário testará depois |
| 0.9 | Descobrir, filtros, busca ao digitar, recentes por perfil e organização do início | Pendente; usuário testará depois |

| 0.10 | Elenco enriquecido, pessoa/filmografia, recomendações TMDB e trailers externos | Pendente; chave TMDB e ponte nativa testadas com simulação |

| 0.11 | Coleções/franquias TMDB e avaliações MDBList com escolha de fontes | Pendente; contratos e navegação testados com simulação |

| 0.12 | Idiomas principal/secundário, legendas automáticas opcionais e próximo episódio | Pendente; mídia sintética e APIs de faixas simuladas |

| 0.13 | Legendas forçadas/SDH, filtro por idioma e memória de faixas por título/perfil | Pendente; fixtures e APIs de faixas simuladas |

## Sequência proposta

1. **Aparência e navegação — primeira entrega 0.4.** Menu clássico/moderno, menu
   oculto, desfoque opcional, retrato/paisagem, fundo parcial/completo, rótulos,
   informações dos catálogos, estilos de Continuar Assistindo. Detalhes com
   sinopse completa, créditos e elenco fornecidos pelo addon; episódios em
   cartões e temporadas com restauração. Permanecem temas/fontes/escala,
   efeitos de profundidade, expansão temporizada, trailers internos/automáticos, coleções pessoais e comparação
   Android/webOS com os mesmos dados. Preferências de layout ainda são locais.
2. **Fontes, áudio e legendas — primeira entrega 0.5.** Organização de fontes,
   filtro por addon, atualização e retorno com foco. Painéis de áudio/faixas
   internas expostas pela plataforma; legendas da fonte e de addons em SRT/VTT,
   tamanho/fundo/atraso e busca na timeline. Testes de UI/renderização no navegador;
   áudio simulado, sem confirmação no hardware. Permanecem ASS/PGS/ZIP,
   busca manual, SDH em faixas internas, estilos avançados, personalização
   de badges e paridade completa do player. Ver [PLAYER.md](PLAYER.md).
3. **Biblioteca, histórico e perfis — primeira entrega 0.6.** Seleção/PIN, addons
   por perfil e leitura da biblioteca nativa Nuvio entregues. Dados locais isolados,
   importação atômica e sem escrita na nuvem. Ver [PROFILES.md](PROFILES.md).
   **Histórico entregue na 0.7:** importação nativa Nuvio, assistidos por episódio,
   retomada e conflitos locais; fallback explícito enquanto Trakt/Simkl não estão
   autenticados nesta TV. Ver [HISTORY.md](HISTORY.md).
   **Envio entregue na 0.8:** progresso, assistidos e favoritos com fila por perfil,
   remoções por item, revisão de conflitos e retomada offline. Ver [SYNC.md](SYNC.md).
   Deltas/realtime, remoção de progresso e listas externas ficam pendentes. Gestão de perfis/PIN, avatares de catálogo e
   histórico externo continuam pendentes. Não sobrescrever a nuvem com estado vazio.
4. **Descoberta e metadados — primeira entrega 0.9.** Descobrir com filtros,
   busca ao digitar/recentes por perfil e ordem/visibilidade local do início.
   Ver [DISCOVERY.md](DISCOVERY.md). Paginação manual limitada no webOS; voz,
   sugestões de títulos, opções por pressão longa e localizações alternativas
   de Descobrir permanecem pendentes. **Metadados entregues na 0.10:** elenco dos
   addons, pessoa/filmografia e recomendações TMDB mediante chave própria;
   trailers externos no YouTube/navegador. Ver [METADATA.md](METADATA.md).
   **Coleções e notas entregues na 0.11:** franquias TMDB e avaliações MDBList
   somente de leitura, com chaves próprias e seleção de fontes. Ver
   [COLLECTIONS_RATINGS.md](COLLECTIONS_RATINGS.md). Coleções pessoais, notas por
   episódio, recomendações Trakt e trailers internos/automáticos ficam pendentes.
   **Idiomas e próximo episódio entregues na 0.12:** ver [PLAYBACK_AUTOMATION.md](PLAYBACK_AUTOMATION.md).
   **Legendas e memória entregues na 0.13:** ver [SUBTITLE_PREFERENCES.md](SUBTITLE_PREFERENCES.md).
   **Velocidade, sincronização e continuidade entregues na 0.14:** ver
   [PLAYBACK_TIMING.md](PLAYBACK_TIMING.md), com Netflix Sans nas legendas externas.
   **Episódios e proporção entregues na 0.15:** ver [EPISODES_ASPECT.md](EPISODES_ASPECT.md).
   **Correção 0.15.1:** Netflix Sans nas internas com texto acessível, prévia e estado da fonte; ver [SUBTITLE_FONT.md](SUBTITLE_FONT.md).
   **Estilo 0.15.2:** Netflix Sans Medium como preset fixo, sem prévia/diagnóstico de fonte no menu.
   **Player 0.16:** barra de controles da referência, Mais inline, Reiniciar, fontes do vídeo atual, relógio e busca acelerada. Ver [PLAYER_PARITY.md](PLAYER_PARITY.md).
   **Player 0.17:** painéis compactos de áudio/legendas, lista única, sincronização por fala externa e ajuste fino de 100 ms. Ver [PLAYER_TRACKS_SYNC.md](PLAYER_TRACKS_SYNC.md).
   **Player 0.18:** tela de pausa com elenco e logos localizadas implementadas. Ver [PLAYER_PAUSE_ARTWORK.md](PLAYER_PAUSE_ARTWORK.md).
   **Player 0.19:** IntroDB por serviço local, miniaturas de quadros já vistos e StyleRail com fonte fixa. Extração antecipada ainda pendente. Ver [PLAYER_EXTRAS.md](PLAYER_EXTRAS.md).
   **Ajustes 0.20:** tela reconstruída como o workspace do fork, com as dez categorias, temas de cores, AMOLED, estilo das configurações e o editor de legendas dentro de Ajustes. Ver [SETTINGS_PARITY.md](SETTINGS_PARITY.md).
   **Guia parental e pós-reprodução 0.21:** avisos de conteúdo no início da reprodução e a janela de recomendações do fim do filme, com o limite de 80–100% do fork. Ver [PARENTAL_POST_PLAY.md](PARENTAL_POST_PLAY.md).
   **Reprodução automática 0.22:** os quatro modos de seleção de fonte do fork (Manual, Primeira fonte, Seleção inteligente e Palavra-chave/Regex, com exclusões por grupo negativo), o cache do último link com duração de 1 h a 7 dias e o trailer automático no detalhe e no fim do filme. Ver [AUTO_PLAY.md](AUTO_PLAY.md).
   **Buffer e Rede 0.23:** buffer inicial (5 s) e após travamento (3 s) com os padrões do fork, tempo limite de espera e o teste de velocidade real sobre a fonte, pelo mesmo transporte do player. Ver [NETWORK.md](NETWORK.md).
   **Coleções 0.24:** coleções com pastas e fontes (catálogo de add-on e TMDB: coleção, lista, produtora, emissora, pessoa, direção e descobrir), fileiras extras na Home com fixar no topo, gerenciamento e editor pelo controle, e entrar na conta levando direto para a Home. Ver [COLLECTIONS.md](COLLECTIONS.md).
   **Correção 0.24.1:** o cabeçalho do editor de coleção acompanha os contadores de pastas e fontes e o rótulo de fixação a cada mudança.
   **Correções da validação na TV 0.25:** Esquerda não abre o menu dentro dos ajustes, a rolagem/foco do painel de Ajustes fica no lugar, o rail não é mais recortado, a lista de fontes tem Voltar visível, segurar o OK em Continuar assistindo abre Retomar/Remover, o aviso de conteúdo sai da frente das informações do player, a chave do TMDB entra inteira com contador, as legendas ficam prontas antes do primeiro quadro, 2× para de travar, as miniaturas avisam quando a TV não permite capturar o quadro e as **coleções criadas em outro cliente Nuvio** (Android/Xperience) aparecem e voltam pela conta. Detalhes e o que continua pendente em [VALIDATION.md](VALIDATION.md) e nas notas da versão.
   **Terceira rodada na TV 0.27:** a **Netflix Sans Regular entrou no pacote** (o estado sem negrito usa a face fina de verdade, com a Inter só como reserva), as **miniaturas de busca chegam a 4K** (fontes anunciadas como HDR/DV entram, a janela entre capturas é maior acima de 1080p e uma busca captura a posição na hora), o painel **Preferências de fontes** passou ao padrão do app com o diálogo de texto do fork, os **add-ons podem ser reordenados** (e a ordem decide a ordem das fontes e dos catálogos na Home), as **coleções vêm antes dos catálogos dos add-ons** na Home, e entrar na conta **não interrompe mais** a chegada com aviso quando só parte dos addons falha. Ver [SUBTITLE_FONT.md](SUBTITLE_FONT.md), [PLAYER_EXTRAS.md](PLAYER_EXTRAS.md) e [COLLECTIONS.md](COLLECTIONS.md).
   **Quinta rodada na TV 0.29:** a **tela de carregamento do fork no player** (`LoadingOverlay.kt`: imagem do título atrás, logo no meio, mensagem e a fonte sendo aberta; depois, só o anel do buffer) e o status que ficava no topo do painel saiu; a **abertura do app cobre o painel inteiro** (ela estava dentro do `#app` escalado); as **miniaturas passaram a ler o quadro do próprio arquivo** com um segundo `<video>` sob demanda (como o `MediaMetadataRetriever` do `SeekThumbnailEngine.kt`), sem bloco preto e sem aviso de composição por hardware; a **Home foca a primeira fileira assim que ela chega**, o **esqueleto é navegável** e o foco acompanha o conteúdo (a rolagem é uma só, para todas as fileiras); a **capa da coleção segue a proporção da imagem** (capa horizontal aparece larga); e a lista de fontes diz **quais add-ons estão sendo consultados**. Ver [LOADING.md](LOADING.md), [PLAYER_EXTRAS.md](PLAYER_EXTRAS.md) e [COLLECTIONS.md](COLLECTIONS.md).
   **Sexta rodada na TV 0.30:** as **capas das coleções passaram a usar o tamanho do fork** por formato de pasta (quadrado = largura × largura, pôster = largura × altura, paisagem = largura × 16/9), com a capa recortada dentro do cartão; **dentro da pasta** o cabeçalho mostra a prévia da capa, cada aba traz **o nome da fonte e o tipo (Filme/Série)** e os títulos aparecem numa **grade**, não mais numa fila única. Ver [COLLECTIONS.md](COLLECTIONS.md).
   **Sétima rodada 0.31:** **trailer dentro do app** (página local `youtube-proxy.html` com o
   player do YouTube e protocolo por `postMessage`, com Reproduzir/Pausar, Com som/Mudo e Legenda;
   o YouTube da TV, o navegador da TV e o QR code viram fallback na mesma janela) e **serviço de
   rede local** (`fetch` com cabeçalhos e sem CORS, a base para Trakt/Simkl, debrid e plugins).
   O que falta para paridade com o webOS de referência, com o arquivo de cada mecanismo, está em
   [REFERENCE_SMART.md](REFERENCE_SMART.md). Ver [AUTO_PLAY.md](AUTO_PLAY.md).
   **Transporte 0.32:** o port passou a ter o **serviço de mídia local** — faixas
   paralelas com os cabeçalhos da fonte servidas em `127.0.0.1` para o player, com a
   janela de blocos limitada pela memória (`ParallelRangeDataSource.kt`,
   `MemoryBudget.kt`), ajuste em Reprodução → Buffer e Rede — e o **HUD do player**
   passou a medir bitrate de vídeo/áudio pelos bytes decodificados, buffer, frames,
   faixa de áudio e os contadores do transporte. Ver [MEDIA_SERVICE.md](MEDIA_SERVICE.md).
   **Próxima prioridade:** a varredura de transporte (`StreamSweepEngine`) sobre este
   serviço, o início rápido (busca de fontes antecipada), o acompanhamento MDBList como
   fonte de progresso, a avaliação do dispositivo e a transferência de biblioteca — a
   lista do que falta para paridade. Depois, validação na LG.
5. **Integrações específicas do fork.** Direct Debrid, Trakt, Simkl, recursos de
   plugins e demais ajustes. Para cada integração, rastrear APIs e separar o que
   é portável do que depende de serviço/binário Android.
6. **Player avançado e desempenho na LG.** Avaliar transporte/buffer paralelo,
   paridade avançada de Up Next, retomada, suspensão, controle remoto, 4K/HDR/áudio e memória no aparelho.
   Confirmar alternativas de plataforma para Media3/MPV/FFmpeg; não prometer
   conversão HDR, passthrough ou formatos sem evidência no hardware.
7. **Revisão integral.** Percorrer telas e ações do Android contra o webOS,
   fechar diferenças, registrar recursos sem equivalente viável e verificar
   atualização/reinstalação e estabilidade em sessões longas.

## Critério de conclusão

Um recurso só conta como portado quando funciona com dados reais ou com um
contrato verificado, possui tratamento de erro e funciona pelo controle remoto.
Os testes de navegador não substituem a validação na TV. Toda diferença ainda
aberta deve continuar visível neste roteiro ou em `UI_REFERENCE.md`/`PORTING.md`.
“Todo o fork” permanece o objetivo; isso não significa que os binários ou APIs
exclusivos do Android possam ser executados diretamente no webOS.

O que conferir na TV, item por item, está em [VALIDATION.md](VALIDATION.md).
