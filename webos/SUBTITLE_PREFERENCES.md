# Legendas e memória de faixas — 0.13.0

Base Android fixa: `ysosrs123/NuvioTV-Fork@45e0984`.
Referências: `SubtitleSelectionOverlay.kt`, `SubtitleSdhFilter.kt`,
`PlayerRuntimeControllerTracks.kt`, `PlayerRuntimeControllerTrackSelection.kt`,
`TrackPreferenceDataStore.kt` e `PlayerSettingsDataStore.kt`.

## Uso

Ajustes → Reprodução → Idiomas e próximo episódio:

- **Lembrar áudio e legendas por título:** ativado por padrão, como a persistência
  do fork. A escolha manual confirmada vale para o filme ou todos os episódios
  da série, somente no perfil atual desta TV. É possível desativar a restauração.
- **Usar legendas forçadas quando o áudio coincidir:** desativado por padrão.
  Quando áudio e idioma principal de legenda coincidem, seleciona somente a
  legenda marcada como forçada. Sem ela, mantém as legendas desligadas. Com áudio
  em outro idioma, busca a legenda completa. Se o player não expõe o idioma do
  áudio, aguarda essa informação e permite seleção manual no painel.
- **Mostrar só idiomas preferidos no painel:** desativado por padrão. A lista
  inclui os idiomas principal/secundário e mantém acessível a legenda em uso.
- **Remover descrições SDH das legendas externas:** desativado por padrão.
  Remove marcações de sons, falantes e parênteses conforme o filtro do fork.
  A heurística pode remover texto de diálogo; desative para ver o texto completo.
  A limpeza não altera legendas internas renderizadas pelo player da LG.

No player → Legendas, a lista única da 0.17 ordena idiomas preferidos antes dos
demais, preservando a legenda selecionada mesmo fora dos idiomas preferidos.
Desativadas, atualizar legendas e ajustes permanecem acessíveis. Forçada e
SDH/CC aparecem junto às faixas identificadas. O filtro de preferidos fica em
Ajustes de legenda e é salvo para esta TV.

Ajustes de legenda inclui a limpeza SDH, com efeito imediato e reversível.
Não muda timestamps ou atraso; a versão original do texto permanece em memória.
A limpeza é recalculada apenas quando muda o trecho ou a opção.

“Usar idiomas dos ajustes”, no painel de áudio ou legendas, apaga as escolhas
manuais deste título neste perfil e reaplica as preferências gerais.

## Memória e limites para a LG

A memória é local e isolada pelo mecanismo de perfis/PIN existente. Até **100
filmes/séries por perfil**, com chaves distintas para filme e série. Salva apenas
idioma, tipo de legenda (interna/externa/desativada) e flags forçada/SDH. Não grava
URLs assinadas, índices, IDs de faixas nem atraso na preferência de idioma.
Faixa sem idioma informado não pode ser lembrada por língua; Desativadas pode.

Ao iniciar outro episódio, resolve novamente as faixas e URLs atuais. Faixas que
chegam depois podem atender uma preferência lembrada, respeitando escolhas
manuais feitas na reprodução atual. A origem interna/externa e as flags ajudam
no desempate, mas a língua tem prioridade. Se a faixa não existe, aplica fallback
sem apagar a preferência lembrada. Uma legenda externa lembrada pode consultar
os addons no próximo vídeo mesmo com a busca automática geral desligada.

Só uma escolha manual bem-sucedida é salva. Falha de download/troca, cancelamento,
resposta atrasada ou seleção automática não substituem a memória. Perfil alterado
ou player descartado não recebe gravações de uma consulta anterior. Atrasos
passam a ser lembrados por vídeo na [entrega 0.14](PLAYBACK_TIMING.md).

Permanecem os limites de 64 faixas internas, 300 externas, arquivo de 2 MiB,
20 mil cues e até três tentativas automáticas de download por reprodução.

## Adaptações e pendências

O webOS não fornece os flags Media3. Usamos flags booleanos fornecidos pelo addon,
`kind=captions` e marcadores identificáveis no rótulo, ID ou caminho do arquivo.
Diferente da busca ampla do Android, não interpretamos nome do host ou query de
URL como uma indicação de legenda forçada. Sem indicação, não afirmamos que a
faixa é forçada/SDH. Idioma não é inferido de nomes de arquivos.

A lista compacta da 0.17 segue SubtitleSelectionOverlay com largura de 320 dp.
A coluna de idiomas de 140 dp foi removida para acompanhar a referência.
Ver [painéis e sincronização por fala](PLAYER_TRACKS_SYNC.md).

Não há limpeza de SDH de imagem/PGS ou faixas nativas, ASS/ZIP, busca por nome de
legenda ou tradução nesta entrega. A memória
não sincroniza com a conta Nuvio, Trakt ou Simkl.

Testes usam mídia sintética, faixas simuladas e fixtures de addons. A validação
física dos formatos, flags e controle remoto na LG 55UT8050 continua pendente.

Velocidade, atraso por episódio, Netflix Sans e “Ainda assistindo?” foram
entregues na [0.14](PLAYBACK_TIMING.md).
