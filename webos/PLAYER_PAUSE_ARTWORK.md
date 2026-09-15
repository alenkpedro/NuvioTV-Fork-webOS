# Tela de pausa e logos — 0.18.0

Referência: `ysosrs123/NuvioTV-Fork@45e0984`, código Android preservado nesta árvore.
Fontes: `PauseOverlay.kt`, `PlayerOverlayScaffold`,
`PlayerRuntimeControllerPlaybackEvents.kt`, `PlayerRuntimeControllerMetadata.kt`,
`PlayerSettingsDataStore.kt` e `TmdbMetadataService.kt`.

## Uso

Em **Ajustes → Reprodução → Tela de pausa**, habilite a opção. O padrão é
**desativado**, como no fork. Pausar pelo botão ou tecla de mídia do controle
inicia a espera de 5 segundos; interagir reinicia a espera. Pausas automáticas,
buffering, suspensão ou busca não abrem a tela. Ela espera o fechamento dos
outros painéis. Retomar, sair ou ocultar o aplicativo cancela a espera.

OK no painel retoma o mesmo vídeo. Baixo/direita acessa o elenco; OK abre a
ficha com foto, nome e personagem. Voltar na ficha retorna ao elenco, cima
retorna ao painel e Voltar no painel fecha a tela mantendo o vídeo pausado.
Essa navegação explícita é uma adaptação ao D-pad webOS; não reproduz o handler
Android que recolhe o overlay com as setas. Não há consulta de biografia ou
filmografia nessa ficha: ela usa os dados já disponíveis do título.

## Layout

Canvas lógico 960×540 escalado para a TV, como as outras telas do port.
Margens 56 dp nas laterais, 40 dp acima e 120 dp abaixo; gradientes do scaffold.
Cabeçalho “Você está assistindo” 16/24, logo até 96 dp de altura e título
alternativo 32/40, ano/episódio 16/24, título do episódio 22/28 até duas linhas,
sinopse 16/24 até três linhas. A logo se reduz quando o conteúdo ocupa mais
altura. Até oito pessoas; chips com intervalo 14 dp, raio 12 dp e texto 14/20.
Ficha com foto 160×240 dp, raio 16 dp, nome 28/36 e personagem 16/24.
Relógio 34/40 no canto superior direito, atualizado uma vez por minuto e omitido
para mídia sem duração finita. Controles normais ficam ocultos durante a pausa.

## Origem da logo

A logo do catálogo é mantida quando o detalhe não possui imagem. O detalhe TMDB
solicita `images` junto aos dados existentes, com idioma escolhido, inglês e
imagens neutras. A seleção prioriza região exata, idioma, inglês e neutra,
seguindo o serviço do fork. Usa imagem de até 500 px para limitar memória na LG.
A integração TMDB existente precisa estar configurada pelo usuário; nenhuma
credencial Android foi embutida ou nova conta exigida.

Após o primeiro frame, o player completa os metadados sem atrasar a reprodução.
Se ainda falta logo, consulta no máximo três addons instalados compatíveis com
metadados, usando cache e verificando o identificador do título. Barra e tela de
pausa usam a mesma logo. Em erro, tenta a imagem anterior do addon; sem imagem
válida, mostra o título. Não são geradas logos artificiais. Respostas após sair
ou suspender não modificam o player. Sinopse e elenco existentes são preservados.

## Verificação e limites

Testes unitários cobrem URLs, prioridade de idioma, preservação da imagem,
requisição TMDB e preferência. Testes de navegador cobrem temporização manual,
interação, persistência, reprodução, Voltar, suspensão, elenco, geometria,
fallback de imagem e resposta tardia. Usam mídia e metadados sintéticos.
Ainda é necessário comparar a renderização na LG 55UT8050 com os mesmos títulos
e preferências do Android. Sem imagem ou elenco no provedor, esses elementos
não podem ser preenchidos. O preset fixo Netflix Sans Medium das legendas não
foi alterado. Intro/outro, miniaturas e guia parental continuam pendentes.
