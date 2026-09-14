# Envio ao Nuvio — 0.8.0

Esta etapa acrescenta escrita de progresso, assistidos e favoritos no backend
nativo Nuvio, usando o fork `ysosrs123/NuvioTV-Fork@45e0984` como referência.
Não conecta nem envia histórico para Trakt, Simkl ou MDBList.

## Uso

Depois de escolher/desbloquear o perfil, alterações feitas nesta TV entram em
uma fila local persistente. O app consulta a conta antes de enviar, confirma cada
item e só então retira a alteração da fila. Não substitui snapshots inteiros.
Marcar não assistido e remover um favorito enviam a remoção do item correspondente.
Ao atingir 90% de um vídeo, enfileira também a marcação de assistido do filme ou
episódio; um episódio não marca a série inteira como assistida.

Abra **Biblioteca → Sincronização**, **Histórico e assistidos → Sincronização** ou
**Ajustes → Conta → Sincronização** para consultar pendências, erros e conflitos.
**Sincronizar agora** tenta novamente. A fila também retoma automaticamente quando
a conexão retorna, enquanto o app está aberto e o perfil liberado.

Se o registro remoto mudou desde a edição local, o envio desse item aguarda uma
escolha. **Enviar desta TV** confirma a alteração local para a revisão consultada;
**Usar da conta** cancela a alteração pendente e adota o remoto, inclusive ausência.
Uma nova alteração remota pode exigir nova escolha. Progresso local com data mais
recente pode avançar sobre um progresso remoto mais antigo, conforme o fork.

Alterações locais das versões anteriores são incluídas uma única vez. Como não
há uma base remota histórica confiável para elas, diferenças exigem revisão.
Uma alteração já refletida na nuvem pode ser confirmada sem enviar novamente.
Isso também resolve a perda da resposta após o servidor já ter aceitado o envio.

## Fila, perfis e falhas

- Fila por usuário/perfil; somente o perfil selecionado e desbloqueado envia.
  Troca de perfil, logout, ocultação do app e perda de conexão cancelam a tentativa.
- Repetições de uma edição substituem a versão pendente do mesmo item. Uma
  confirmação atrasada não apaga uma edição posterior nem altera outro perfil.
- Confirmações recebidas atualizam a origem do progresso e liberam os overrides
  de favoritos/assistidos. Ausências futuras no snapshot remoto voltam a valer.
- Estado e fila são salvos antes da escrita. Se o armazenamento local falhar,
  o envio pausa e o erro é informado. Logout mantém a fila no espaço do perfil,
  para retomada após login e desbloqueio; modo sem conta nunca envia.
- Limite de 3.000 operações pendentes, sem descartar silenciosamente as anteriores.
  Os limites existentes de biblioteca, assistidos e progresso continuam valendo.
  A fila pode preservar progresso pendente que já saiu dos 100 itens recentes.
- Até 20 operações por ciclo, sequenciais. Edições próximas são agrupadas com
  atraso inicial de 3 segundos; ciclos automáticos bem-sucedidos têm intervalo
  mínimo de 30 segundos. Falhas aguardam de 30 segundos a 5 minutos. A tentativa
  manual é imediata. Não há polling quando a fila está vazia ou só tem conflitos.
- A revisão apresenta até 20 conflitos por vez; os próximos aparecem ao resolver.
  Continua usando o canvas 1080p e componentes leves, sem biblioteca de sync externa.

## Contratos e limites de concorrência

| Operação | RPC e corpo específico, além de `p_profile_id` e `p_origin_client_id` |
|---|---|
| Progresso | `sync_push_watch_progress`, `p_entries` com `content_id`, `content_type`, `video_id`, temporada/episódio, posição/duração em ms, `last_watched`, `progress_key` |
| Chave de progresso | Filme: ID do conteúdo; episódio: `contentId_s{season}e{episode}`, conforme `WatchProgressPreferences.createKey` |
| Assistido | `sync_push_watched_items`, `p_items` com conteúdo, tipo, título, temporada/episódio nullable e `watched_at` |
| Não assistido | `sync_delete_watched_items`, `p_keys` com `content_id` e temporada/episódio quando houver, conforme o DTO do fork |
| Favorito | `sync_push_library_items`, `p_items` com os campos de `LibraryMutationDto` |
| Remover favorito | `sync_delete_library_items`, `p_keys` com `content_id` e `content_type` |

Fontes: `core/sync/WatchProgressSyncService.kt`, `WatchedItemsSyncService.kt`,
`SyncClientIdentity.kt`, `data/remote/supabase/SupabaseLibrarySyncRemoteDataSource.kt`.
O identificador persistente desta instalação usa o formato aceito pelo fork.
JWT é renovado sem trocar o usuário da operação; tokens não são enviados aos addons.
Somente os campos permitidos são enviados, sem URLs temporárias de reprodução.

O contrato de escrita do fork não inclui uma revisão esperada/CAS. A consulta
anterior ao envio reduz conflitos detectáveis, mas não torna consulta e escrita
atômicas: outro dispositivo pode alterar a conta nesse intervalo. A TV não promete
bloqueio distribuído ou entrega exatamente uma vez. Reenvio usa as mesmas chaves
e timestamps, com reconciliação após respostas incertas. Não executa serviço de
sincronização quando o app está fechado. Remoção explícita de progresso completo,
deltas/realtime e gestão de listas externas ficam para etapas posteriores.

## Validação e próximo passo

Testes sintéticos cobrem contratos de escrita, ms/chaves, fila após reload,
falhas/armazenamento indisponível, conflito e escolha pelo controle, alterações
durante envio, isolamento por perfil e confirmação após resposta perdida. Nenhuma
conta real foi usada para escrever dados durante o desenvolvimento. O envio real
na LG ainda depende do teste do usuário.

**Próxima etapa sugerida:** Descobrir e busca avançada, com filtros por tipo/gênero,
organização dos catálogos e navegação/retorno fiéis ao fork de referência. Integrações
externas e pendências de paridade continuam em [ROADMAP.md](ROADMAP.md).
