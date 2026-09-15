# Velocidade, sincronização e continuidade — 0.14.0

Base: `ysosrs123/NuvioTV-Fork@45e0984`, especialmente `TrackPreferenceDataStore`,
`SpeedSelectionDialog`/`PLAYBACK_SPEEDS`, `PlayerAutoplaySessionRules`,
`PlayerRuntimeControllerStillWatching`, `PostPlayOverlay` e `PlayerSettingsDataStore`.

## Uso

- **Player → Mais → Velocidade (desde a 0.15):** 0,25× / 0,5× / 0,75× / 1× / 1,25× / 1,5× / 1,75× / 2×.
  A escolha confirmada é lembrada para o filme ou série, no perfil atual.
  Voltar restaura o foco ao botão Velocidade, na fileira expandida da 0.16. 1× remove a preferência daquele título.
  Usa `HTMLMediaElement.playbackRate` e verifica o valor retornado. Uma rejeição
  mantém a velocidade anterior e informa a falha, sem salvar a escolha recusada.
  Uma alteração posterior pelo player é refletida no menu e limpa a preferência,
  sem tentar forçar novamente a velocidade. Ao vivo/duração desconhecida não é aceito.
- **Player → Legendas → Ajustes de legenda:** adiantar/atrasar em passos de 100 ms,
  entre −180 e +180 s desde a 0.17. [Sincronização por fala](PLAYER_TRACKS_SYNC.md). Positivo atrasa a legenda. Agora o atraso fica salvo por
  filme/episódio e perfil, inclusive ao reabrir o player. Não passa para outro
  episódio. “Zerar atraso” apaga somente essa preferência.
  Ao trocar a versão da fonte no mesmo episódio, revise o atraso se necessário.
- **Netflix Sans Medium (500), desde a 0.15.2:** fonte fornecida pelo usuário, incluída sem alteração
  no pacote e aplicada às legendas externas SRT/VTT. A interface continua com
  Inter. Apenas o arquivo Medium necessário é incluído: 212.020 bytes antes da
  compressão. Não há consulta a serviços de fontes.
- **Ajustes → Reprodução → Idiomas e próximo episódio:** ative reprodução
  automática e “Perguntar se ainda estou assistindo”. O segundo ajuste vem
  desativado, com limiar de **3 avanços automáticos**, configurável de 2 a 6,
  como no fork. Exemplo do padrão: E1 iniciado manualmente → E2 → E3 → E4;
  antes de iniciar E5 automaticamente, pede confirmação.

“Ainda assistindo?” pausa o vídeo e oferece Reproduzir/Sair por 60 segundos.
Reproduzir inicia o próximo episódio e zera a sequência. Sair, Voltar da LG ou
fim do prazo saem para as fontes sem disparar reprodução novamente. O cartão
usa largura 420 dp, canto inferior direito 26/30 dp, padding 10/9, miniatura
112×64, textos 11/14 e botões em cápsula, derivados do `PostPlayOverlay`.
A camada modal mantém foco no cartão e bloqueia teclas de mídia enquanto aguarda.
O diálogo de velocidade é centralizado, com largura 300 dp conforme a referência.

Só transições disparadas pelo temporizador aumentam a sequência. Iniciar um
vídeo, avançar manualmente ou escolher uma fonte manualmente reinicia a contagem.
Séries sem próximo episódio ou com episódio futuro não abrem a confirmação.
A sequência existe somente na sessão de navegação, sem persistência entre aberturas.

## Memória, ciclo de vida e limites

Até 100 títulos para velocidade e 100 vídeos para atraso por perfil. Chaves
incluem tipo e ID; não há URLs temporárias nem IDs de faixas nesses registros.
A memória de idiomas da 0.13 é independente. Estes dados não sincronizam com Nuvio.

O temporizador da confirmação é suspenso quando o app fica oculto; o vídeo
permanece pausado ao retornar. Fechar o player cancela os temporizadores e
remove os listeners. Legendas externas usam o relógio de mídia e ajustam o
próximo despertar pela velocidade, sem animação contínua. A confirmação e o
avanço contam segundos reais, independentemente da velocidade de reprodução.

A LG pode limitar velocidades, áudio e formatos. O teste de `playbackRate`
confirma a aceitação da API, sem medir o ritmo real do decoder ou a saída sonora.
A regra CSS `video::cue` também solicita Netflix Sans para texto nativo, mas o
motor de legendas da LG pode ignorá-la. Não é possível trocar a fonte de legendas
em imagem/PGS. Desde a 0.15.1, texto nativo acessível usa a camada personalizada com Netflix Sans,
preset fixo e SDH; atraso continua exclusivo das externas. Ver [SUBTITLE_FONT.md](SUBTITLE_FONT.md).
Não há transcodificação, download paralelo ou alteração de buffer nesta etapa.

## Validação e continuação

Testes de unidade: memória limitada, separação título/episódio/tipo/perfil,
restauração, reset, valores inválidos, velocidade recusada/ignorada e defaults.
Testes no navegador: carregamento/decodificação da fonte local, sincronização
após reabrir, velocidade persistida e herdada no próximo episódio, erro da
plataforma, sequência automática/manual, confirmação, foco, tecla LG Voltar,
expiração, suspensão e ausência de loop. Mídia sintética; validação física na
LG 55UT8050 continua pendente.

Painel de episódios e proporção da imagem entregues na
[0.15](EPISODES_ASPECT.md).
