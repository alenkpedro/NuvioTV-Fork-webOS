# Idiomas e próximo episódio — 0.12.0

Base: `ysosrs123/NuvioTV-Fork` no commit `45e0984`. Regras consultadas em
`PlayerSettingsDataStore.kt`, `PlayerRuntimeControllerInitialization.kt`,
`PlayerNextEpisodeRules.kt` e `PostPlayOverlay.kt`.

## Configuração e idiomas

Ajustes → Reprodução → Idiomas e próximo episódio. As preferências são locais à
TV, independentes dos filtros de fontes, compartilhadas pelos perfis do aparelho
e não importadas da conta Android. Atualizar não redefine login nem preferências.

Áudio e legendas seguem o idioma informado pelo navegador da TV por padrão.
Há idioma principal e secundário; áudio permite padrão da fonte e idioma original
quando informado nos metadados (sem essa informação, usa o idioma da TV).
Legendas também permitem Desativadas. Códigos ISO de duas/três letras e regiões
são normalizados: `pob` → `pt-br`, `por` → `pt`, `eng` → `en`. Correspondência
exata precede a variante do mesmo idioma; o principal precede o secundário.

A seleção é tentada após os metadados do vídeo e quando a plataforma anuncia
novas faixas. Uma faixa melhor pode substituir o fallback automático. Escolher
manualmente áudio, legenda ou Desativadas impede substituições automáticas até
sair da reprodução. Índices, URLs e atrasos não são copiados para outro episódio.
Sem áudio correspondente, preserva-se a faixa da fonte. APIs nativas indisponíveis
ou que rejeitam mudanças continuam com aviso explícito no menu de faixas.

Legendas externas da fonte participam da seleção. Busca automática nos addons é
opcional e desativada por padrão, como `addonSubtitlesEnabled` no fork. O menu
Legendas continua permitindo buscar manualmente. Consultas usam o ID do vídeo e
os extras conhecidos da fonte. Cada reprodução tenta baixar no máximo três
legendas automaticamente; falha de HTTP/formato permite tentar o próximo idioma.
Downloads são cancelados ao trocar manualmente, fechar o painel ou sair do player.
As respostas canceladas não podem alterar as faixas nem um player seguinte.
Limites existentes: 64 faixas nativas, 300 externas, 2 MiB/arquivo e 20 mil cues.

## Continuidade de séries

Resolve-se o sucessor do **ID atualmente reproduzido**, em ordem de temporada e
episódio, incluindo a passagem de temporada e episódios com numeração absoluta.
Não retorna ao primeiro episódio ao chegar ao último. Datas futuras mostram
indisponibilidade, sem pular silenciosamente para outro episódio. Ao retomar pelo
histórico compacto, os metadados do addon são consultados para recuperar episódios.

O cartão usa largura 420 dp, padding 10/9 dp e textos 11/14 sp do PostPlayOverlay;
a faixa de cancelamento e o posicionamento sobre os controles atuais são adaptações
webOS. Há também ação Próximo episódio na barra do player.

Padrões do fork: avanço automático desligado; cartão em 99%; modo alternativo de
2 minutos restantes. Intervalos permitidos: 97–100% ou 0–3,5 minutos. Ativado o
avanço automático, esta entrega usa uma contagem visível de **5 segundos**, com
cancelamento. Pausa, buffering, busca na timeline, app oculto e menus de faixas
suspendem a contagem. Erro do vídeo cancela o cartão; retroceder antes do limiar
reinicia a contagem. Cancelar vale até sair desta reprodução.

A troca encerra o vídeo anterior e consulta fontes novas para o próximo ID.
Preserva filtros/ranking e prefere `behaviorHints.bingeGroup` quando informado,
com fallback configurável. Sem fonte compatível, fica na escolha manual.
URLs assinadas nunca são reutilizadas de outro episódio ou salvas no histórico.
Voltar da nova reprodução abre suas fontes; a pilha não acumula episódios.
Progresso e assistido continuam sendo registrados separadamente por episódio.

## Diferenças e validação

Não há Media3/MPV no webOS. Faixas selecionáveis dependem do transporte e das APIs
expostas pela LG; idiomas ausentes não são inferidos do nome da faixa. Ainda não
há busca de segmentos/outro, pré-resolução em segundo plano, reutilização de link,
"Ainda assistindo?", lembrança manual de idioma entre reproduções, forced/SDH,
ASS/PGS/ZIP ou busca manual por nome de legenda. O idioma original usa metadados
do addon; não faz uma consulta extra só para descobrir esse idioma.

Testes automatizados usam mídia sintética e faixas simuladas no Chrome, sem conta
ou conteúdo real. A validação física na LG 55UT8050 continua pendente. Na TV,
verificar duas línguas em MP4/MKV/HLS, troca manual, legendas de addons, avanço
entre temporadas, cancelar, Voltar, suspensão e retomada.

Próxima etapa sugerida: legendas forçadas/SDH, filtros de idioma no painel e
lembrança da escolha manual entre episódios, com o mesmo comportamento do fork.

## Atualização 0.13

A memória de idiomas, o filtro por língua, forçadas e SDH foram acrescentados
na [0.13](SUBTITLE_PREFERENCES.md). A descrição de pendências acima documenta
a entrega 0.12. Memória por título/perfil agora tem prioridade sobre os idiomas
gerais; seleções manuais no vídeo atual continuam prevalecendo.
