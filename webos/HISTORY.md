# Histórico Nuvio por perfil — 0.7.0

> Atualização 0.8: progresso, assistidos e favoritos agora têm envio ao Nuvio com fila
> por perfil, conflitos e recuperação offline. Ver [SYNC.md](SYNC.md). As descrições
> de leitura/local abaixo registram o escopo da entrega original.

Esta versão importa progresso e assistidos do backend nativo Nuvio, usando o
contrato do **ysosrs123/NuvioTV-Fork@45e0984**. As alterações feitas na LG ainda
são locais. Não há chamadas de escrita de histórico, biblioteca ou preferências.

## Uso

Ao selecionar o perfil, o app carrega biblioteca, addons e histórico. O progresso
aparece em **Continuar assistindo** e permite retomar filmes/episódios pelo player.
A seleção do próximo episódio considera também os episódios assistidos importados.
Uma série aparece uma vez na faixa, pelo seu registro mais recente. Conclusão em
90% e início em 2% seguem as regras nativas do fork; reassistir gera novo progresso.

Em **Biblioteca → Histórico e assistidos**, consulte Progresso/Assistidos e use
**Atualizar histórico** para repetir a leitura. Também acessível em **Ajustes → Conta**.
É possível marcar um assistido como não assistido nesta TV. Essa escolha sobrevive
a novas importações, sem apagar o registro na nuvem ou nos outros dispositivos.

Se a conta tiver uma posição mais recente que diverge de uma alteração local,
o app preserva esta TV e exibe as duas posições/datas. **Manter desta TV** confirma
a cópia local; **Usar da conta** adota a cópia remota somente nesta TV. A escolha
vale para aquela revisão; uma revisão remota posterior pode gerar outro conflito.
Uma alteração local posterior invalida uma escolha baseada em dados antigos.
Registros importados removidos da nuvem saem no próximo snapshot completo;
alterações locais ainda não enviadas são preservadas, dentro dos limites abaixo.

## Trakt, Simkl e MDBList

O fork só dá precedência exclusiva a Trakt/Simkl quando o provedor selecionado
está autenticado no dispositivo. Sem essa autenticação, usa Nuvio Sync. A escolha
é sincronizada no bloco de preferências; os tokens Trakt/Simkl são locais ao
Android e não fazem parte desse bloco.

Esta versão não autentica Trakt/Simkl nem lê credenciais de provedores. Importa o
fallback Nuvio e informa isso na tela quando a preferência for Trakt/Simkl.
Com MDBList selecionado, importa somente a parte Nuvio e informa que a parte
externa está pendente. Isso não importa automaticamente tudo o que foi assistido
no Trakt, Simkl ou MDBList. A conexão desses serviços continua no roteiro.

## Contratos conferidos no Android

Caminhos relativos a `app/src/main/java/com/nuvio/tv/`:

| Origem | Contrato aplicado |
|---|---|
| `core/sync/ProfileSettingsSyncService.kt` | `sync_pull_profile_settings_blob(p_profile_id,p_platform:'tv')`; `settings_json.features.trakt_settings.watch_progress_source`, valor tipado string |
| `core/sync/WatchProgressSyncService.kt` | `sync_pull_watch_progress(p_profile_id,p_limit)`; conteúdo, tipo, vídeo, temporada/episódio, posição/duração e `last_watched` em milissegundos |
| `core/sync/WatchedItemsSyncService.kt` | `sync_pull_watched_items(p_profile_id,p_page,p_page_size)`; páginas a partir de 1, identidade de conteúdo/episódio e `watched_at` |
| `data/local/WatchProgressPreferences.kt` | Preservação de alterações locais e metadados; deduplicação do espelho de série com o registro do episódio |
| `domain/model/WatchProgress.kt` | Critérios de início/conclusão do histórico nativo |
| `data/local/TraktSettingsDataStore.kt`, `TraktAuthDataStore.kt` e guarda de `WatchProgressSyncService` | Preferência de fonte e condição de autenticação antes da precedência externa |

A implementação webOS converte posição/duração para segundos no player. IDs de
vídeo explícitos têm preferência sobre o espelho da série; metadados são
completados pelos addons, até duas consultas concorrentes, sem impedir a home.
Nenhum título, pôster, nota ou URL de vídeo é inventado quando faltam metadados.

## Limites e preservação

- Escopo por usuário/perfil, sem importar antes de liberar o PIN. Troca de perfil,
  cancelamento e revogação impedem aplicar uma resposta ao perfil errado.
- Até 1.000 registros de progresso por leitura, 100 guardados por perfil;
  assistidos em páginas de 100, até 2.000 registros e até 2.000 alterações locais.
  Limites mantêm o volume de armazenamento controlado na LG. Os 100 registros
  de progresso mais recentes são preservados; isso não é um arquivo ilimitado.
- Importação só é aplicada após todas as páginas válidas. Erro, perfil divergente,
  formato inesperado ou limite excedido preserva a cópia anterior e informa o erro.
- Lista renderizada em páginas de 50; faixa de retomada limitada a 12 títulos;
  até 100 conflitos/decisões guardados. Sem polling contínuo ou prefetch de vídeo.
- Não salva URLs temporárias de streams. Reutiliza armazenamento e sessão
  existentes; a atualização mantém o ID e o login. Modo sem conta mantém histórico
  local. Marcações antigas são migradas sem apagar outros títulos.
- Favoritos e marcações/progresso da LG ainda não são enviados ao Nuvio, e as
  configurações visuais não são importadas pelo carregamento do histórico.

## Validação e próxima etapa

Testes com dados sintéticos: unidades e episódios, conflitos/decisões após reload,
reassistir, marcação de não assistido, isolamento por perfil, páginas completas e
falhas/limites. No navegador, progresso importado de 25 segundos inicia o vídeo
sintético nessa posição; controles de escolha funcionam por OK/Voltar. Capturas
em 1920×1080 revisadas. Nenhuma conta real foi usada para acessar histórico nos
testes; a verificação na LG será feita pelo usuário depois.

**Próxima etapa:** sincronização de saída de progresso, assistidos e favoritos,
com fila persistente por perfil, conflitos, remoções e retomada após ficar offline.
Integrações externas e comparação visual completa seguem em [ROADMAP.md](ROADMAP.md).
