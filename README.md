# NuvioTV-Fork para LG webOS

Port experimental de **ysosrs123/NuvioTV-Fork**, com alvo inicial na **LG 55UT8050 / webOS 24**.
O código Android original permanece neste repositório; a adaptação está em [`webos/`](webos/).

## Instalar no Homebrew Channel

Em Configurações → Adicionar repositório, cole:

```text
https://raw.githubusercontent.com/alenkpedro/NuvioTV-Fork-webOS/webos/apps.json
```

Atualize a lista e instale **Nuvio Fork**.

[Releases e IPK](https://github.com/alenkpedro/NuvioTV-Fork-webOS/releases) · [Instruções e recursos](webos/README.md) · [Rastreabilidade do port](webos/PORTING.md)

## Estado: prévia 0.19.0

A 0.19.0 acrescenta pular abertura/recapitulação/créditos via IntroDB, com serviço
local incluído no IPK, e personalização de legendas mantendo Netflix Sans fixa.
Tamanho, negrito, cor, opacidade, contorno e posição seguem a StyleRail do fork;
o estilo solicitado permanece como padrão. Miniaturas de busca são opcionais e
cobrem quadros já reproduzidos em fontes compatíveis; extração antecipada ainda
não foi portada. [Uso e limites](webos/PLAYER_EXTRAS.md).

A 0.18.0 acrescenta a tela de pausa com logo, sinopse, episódio e elenco do
fork. Ative **Ajustes → Reprodução → Tela de pausa**; ela aparece após 5 segundos
de pausa manual. Logos dos catálogos são preservadas e podem ser complementadas
por imagens localizadas do TMDB quando configurado. A barra e a pausa compartilham
a imagem; sem logo válida, usam o título. O preset das legendas permanece fixo.
[Uso, origem e limites](webos/PLAYER_PAUSE_ARTWORK.md).

A 0.17.0 adapta os painéis compactos de áudio/legendas, com lista única e foco
branco, e acrescenta sincronização por fala para legendas externas SRT/WebVTT.
Inclui compensação de reação de 300 ms, ajuste de 100 ms até ±180 s e memória
por vídeo/perfil. O preset Netflix Sans Medium permanece fixo.
[Uso e limites](webos/PLAYER_TRACKS_SYNC.md).

A 0.16.0 substitui a barra simplificada pelo layout do `PlayerControlsOverlay`
do fork: título/logo, ícones à direita, Mais expansível, linha do tempo,
tempo restante e cápsulas Reproduzir/Pausar, Reiniciar, Episódios e Próximo.
Inclui fontes do vídeo atual para filmes/séries, retomada na troca, relógio,
buffer, busca acelerada e navegação/Voltar do controle.
[Mapa de fidelidade, diferenças e próxima etapa](webos/PLAYER_PARITY.md).
O player completo ainda não é idêntico: funções avançadas e painéis continuam
em revisão. Motores e integrações exclusivos do Android não são simulados.

A 0.15.2 define o **estilo padrão de legendas solicitado**: Netflix Sans Medium
(500), branco, sombras curtas, sem caixa de fundo, tamanho proporcional e
posição a 6,5% da borda inferior com controles recolhidos. As configurações
antigas de aparência deixam de interferir. Prévia, nome da fonte, informações
técnicas e controles de aparência foram retirados do menu.
[Preset e limites](webos/SUBTITLE_FONT.md).

A 0.15.1 corrige **Netflix Sans nas legendas internas de texto acessível**.
O app desenha o texto e evita a fonte do player nativo. Legendas externas
continuam com a fonte fornecida. Na 0.15.1 havia prévia e aviso da fonte; a 0.15.2 os remove a pedido do usuário.
Faixas não personalizáveis permanecem com o player da TV.
[Correção e limites](webos/SUBTITLE_FONT.md).

A 0.15.0 acrescenta **episódios e fontes dentro do player**, navegação por
temporada e **sete modos de proporção/zoom da imagem**. Abra Episódios durante
uma série; velocidade, proporção e diagnóstico ficam em Mais.
[Uso e limites](webos/EPISODES_ASPECT.md).

A 0.14.0 acrescentou **velocidade de reprodução**, **atraso de legenda salvo por
filme/episódio e perfil**, **Netflix Sans nas legendas externas** e confirmação
**“Ainda assistindo?”** configurável. A fonte está incluída no pacote.
[Uso, comportamento e limites na LG](webos/PLAYBACK_TIMING.md).

A 0.13.0 acrescentou **legendas forçadas/SDH**, filtro por idioma no painel e
**memória da escolha manual de áudio e legendas por título e perfil**. Ajustes
em Reprodução → Idiomas e próximo episódio. [Uso e limites](webos/SUBTITLE_PREFERENCES.md).

A 0.12.0 acrescentou seleção automática de **áudio e legendas**, idiomas principal
e secundário, e **próximo episódio** com contagem cancelável. Configure em
**Ajustes → Reprodução → Idiomas e próximo episódio**. O avanço automático vem
desativado por padrão, como no fork. [Regras e limites](webos/PLAYBACK_AUTOMATION.md).

A 0.11.0 acrescentou **coleções/franquias TMDB** em ordem de lançamento e
**avaliações adicionais via MDBList** na tela de detalhes. Cartões e ícones seguem
a referência Android, com paginação e consultas limitadas para a LG.

Coleções usam a chave TMDB de **Ajustes → Integrações → TMDB**. As fontes adicionais
de avaliações exigem sua chave em **Ajustes → Integrações → Avaliações MDBList**,
onde também é possível escolher quais consultar. Sem MDBList, continuam as notas
do addon e TMDB. Nenhuma chave acompanha o aplicativo ou vem do login Nuvio.
[Uso, contratos e limites](webos/COLLECTIONS_RATINGS.md).

Elenco, biografias/filmografia e trailers da 0.10 continuam disponíveis.
Trailers abrem externamente no YouTube/navegador da TV.
[Metadados e trailers](webos/METADATA.md).

Descobrir, busca e organização de catálogos da 0.9 permanecem disponíveis.
[Descoberta e busca](webos/DISCOVERY.md).

Login, perfis/PIN, biblioteca, histórico e envio de progresso/assistidos/favoritos
nativos Nuvio da 0.8 continuam disponíveis. [Sincronização](webos/SYNC.md).
Rastreamento e listas externos de Trakt, Simkl e MDBList permanecem pendentes.

O **login Nuvio por QR code** e a importação dos addons do **perfil selecionado** continuam disponíveis. O usuário confirmou o login na LG com a 0.3.0; não é necessário sair da conta para atualizar.

1. Atualize **Nuvio Fork** no mesmo repositório Homebrew.
2. Na abertura, escolha **Entrar com Nuvio**. Se já estiver no início, abra **Ajustes → Conta → Entrar com Nuvio**.
3. Escaneie o QR code com o celular ou abra **https://nuvio.tv/link** e informe o código mostrado **na TV**.
4. Entre na conta no site Nuvio e autorize a TV. Escolha o perfil; seus addons, biblioteca e histórico Nuvio são carregados.

**Ajustes → Conta → Sincronizar addons** repete a importação. A importação de addons é de leitura: não envia nem substitui a configuração armazenada na nuvem. Addons configurados manualmente na TV são preservados. Sair desconecta somente esta TV e remove daqui os addons que vieram da conta.

Sem login, é possível usar **Continuar sem conta** e instalar addons manualmente. Integrações externas de histórico, debrid direto e plugins Android ainda não são sincronizados. Com login, progresso, assistidos e favoritos da LG são sincronizados com o Nuvio; addons manuais e preferências visuais permanecem locais.

Validação: testes de regras, conta e navegação com dados sintéticos; instalação e login da 0.3.0 confirmados pelo usuário. Perfis, PIN, biblioteca, histórico, fila de envio, Descobrir, busca, metadados e player foram testados no navegador com dados simulados. A troca efetiva de áudio, formatos e sincronismo precisam de validação na TV. Não se afirma identidade pixel a pixel. [Detalhes da conta](webos/ACCOUNT.md) · [Referência visual](webos/UI_REFERENCE.md).

## Próxima etapa

**Player:** validar os novos recursos na LG e avançar no guia parental e no pós-reprodução/Up Next. O [roteiro completo](webos/ROADMAP.md) mantém as entregas e diferenças pendentes. Ao concluir cada etapa, a próxima será sugerida.

## Base e créditos

- Base: [ysosrs123/NuvioTV-Fork](https://github.com/ysosrs123/NuvioTV-Fork), commit `45e0984`.
- Projeto original: [NuvioMedia/NuvioTV](https://github.com/NuvioMedia/NuvioTV).
- A versão NuvioTVSmart não foi usada como base.
- [README original do fork Android](docs/README.android-fork.md).
- Licença GPL-3.0; veja [LICENSE](LICENSE) e [atribuições](webos/THIRD_PARTY_NOTICES.md).

Os workflows Android/triagem herdados estão preservados em `.github/upstream-workflows/`, sem execução
nessa branch. O workflow ativo verifica e empacota apenas o alvo webOS.
