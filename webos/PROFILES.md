# Perfis e biblioteca da conta — 0.6.0

Esta etapa usa os contratos do **ysosrs123/NuvioTV-Fork@45e0984** preservado nesta
árvore. Não usa o NuvioTVSmart. Não implementa sincronização bidirecional.

## Como usar

Depois do login, escolha em **Quem está assistindo?**. Se houver somente um perfil
sem PIN, ele abre automaticamente. Com vários perfis, a seleção aparece a cada
abertura. Também está em **Ajustes → Perfis → Selecionar perfil** e em
**Ajustes → Conta → Trocar perfil**.

Perfis protegidos exigem quatro números, verificados pelo servidor Nuvio.
Use o teclado da TV ou os botões numéricos da tela e **Entrar**. O app respeita o
tempo de espera retornado após tentativas inválidas. Voltar cancela o painel;
uma resposta atrasada não libera o perfil. PINs e permissões de desbloqueio não
são persistidos. Se não for possível consultar os bloqueios, permanece na seleção,
com **Atualizar perfis**, em vez de abrir dados de um perfil sem confirmar acesso.
A proteção é de navegação do aplicativo, não criptografia do armazenamento local.

São aceitos os seis perfis do fork, nomes, cores e URL de avatar personalizada.
Avatares definidos somente por ID de catálogo usam uma inicial nesta etapa.
O perfil secundário consulta seus próprios addons, ou os do principal quando
`uses_primary_addons` estiver habilitado na conta. Biblioteca, favoritos locais,
progresso local e marcações de assistido sempre pertencem ao perfil selecionado.
Layout, preferências de fontes e ajustes de legendas ainda são desta TV.

**Biblioteca** reúne Filmes e Séries importados da conta. **Atualizar biblioteca**
refaz a leitura. Favoritos adicionados/removidos na LG são alterações locais deste
perfil; não são enviados à nuvem e não alteram o Android. Remover localmente um
favorito importado mantém essa remoção após atualizar, sem excluir o item remoto.
Um item removido da nuvem desaparece da TV no próximo snapshot completo, salvo
se existir uma adição local explícita para ele. Uma falha em qualquer página
preserva a biblioteca anterior, sem publicar uma importação incompleta.

## Preservação e limites

- A atualização mantém o mesmo ID, login e dados existentes. Dados da 0.5 ou
  anteriores com proprietário de conta conhecido migram para o perfil 1 dessa
  conta; dados sem essa associação ficam no modo sem conta.
- Addons manuais do modo sem conta também ficam disponíveis no primeiro perfil.
  Instalações posteriores pertencem ao perfil em uso. Dados de perfis diferentes
  não são misturados ao trocar, reiniciar ou entrar em outra conta.
- Sair remove tokens e addons importados da conta. Favoritos/progresso locais são
  preservados no espaço do perfil e voltam após novo login/seleção. O modo sem
  conta mostra somente seus próprios dados. As cópias locais não são criptografadas.
- Importação de até 2.000 títulos em páginas de 100; somente 100 cartões na tela.
  Mais de 2.000 mantém a cópia anterior e informa o limite. Até 500 alterações
  locais por perfil; ao atingir o limite, informa sem apagar outra alteração.
- Histórico local continua limitado a 100 itens por perfil. Gravações evitam
  duplicar a cópia ativa no JSON. Limites reais de armazenamento dependem da TV;
  falha de gravação é informada e mudanças passam a valer somente na sessão.
- Fotos e detalhes vêm da conta/addons. Nenhuma biblioteca, PIN ou credencial
  real foi usada nos testes. A confirmação do usuário na TV fica para depois.

## Rastreabilidade

Caminhos relativos a `app/src/main/java/com/nuvio/tv/`:

| Recurso | Fonte Android e transporte utilizado |
|---|---|
| Lista de perfis | `core/sync/ProfileSyncService.kt`, `SupabaseModels.kt`: `sync_pull_profiles` |
| Estado de PIN | `ProfileSyncService`: `sync_pull_profile_locks`; exige registro explícito por perfil |
| Validar PIN | `ProfileSyncService`: `verify_profile_pin(p_profile_id, p_pin)`, `unlocked`, `retry_after_seconds` |
| Addons herdados | `core/sync/AddonSyncService.kt`: `get_sync_owner`, tabela `addons`, perfil selecionado ou 1 |
| Biblioteca | `data/remote/supabase/SupabaseLibrarySyncRemoteDataSource.kt`: `sync_pull_library(p_profile_id,p_limit,p_offset)` |
| Tela de perfis | `ui/screens/profile/ProfileSelectionScreen.kt`: título 44 sp, subtítulo 18 sp, logo 44 dp, cartão 152 dp/gap 28; modo compacto 128/gap 16 e avatar 82 para cinco/seis perfis |
| Persistência | Nova implementação `core/profiles.js`/`storage.js`; separação por usuário e índice, overlay local dos favoritos |

Painel de PIN com teclado numérico é uma adaptação webOS; não replica ainda o
editor/teclado Android. Gestão de perfis (criar, renomear, excluir, alterar PIN),
catálogo de avatares, fundos de perfil e gestão de acesso continuam pendentes.

## Próxima etapa

Importar progresso e assistidos da nuvem e resolver conflitos com o histórico
local; depois adicionar envio das alterações. O fork dá precedência a Trakt/Simkl
quando configurados: essa regra precisa ser portada antes de misturar histórico
de provedores. Listas externas e o histórico remoto ainda não são importados na
0.6.0. A biblioteca desta etapa é a biblioteca nativa Nuvio (`sync_pull_library`).

Validação: testes de migração, isolamento entre contas/perfis, herança de addons,
PIN inválido/cancelado, bloqueios indisponíveis, snapshots completos/parciais,
remoções locais, paginação e controle remoto. APIs de conta simuladas; nenhum
resultado desses testes comprova uma leitura de biblioteca real na LG.
