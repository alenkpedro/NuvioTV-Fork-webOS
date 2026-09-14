# Conta Nuvio no webOS — 0.3.0

A mensagem de conta indisponível das versões 0.1/0.2 foi substituída pelo fluxo
de vinculação do próprio fork. Não se pede senha no app ou na conversa: o usuário
entra no site Nuvio pelo celular e aprova o dispositivo indicado na TV.

## Fluxo

- Sem conta/addons e sem preferência de convidado, a abertura oferece login.
- Também disponível em **Ajustes → Conta → Entrar com Nuvio**.
- QR gerado localmente; alternativa de abrir `https://nuvio.tv/link` e digitar
  o código. Código, nonce e polling ficam somente em memória e expiram.
- O código é associado a um nonce aleatório de 24 bytes, conforme o fork.
  A TV aguarda aprovação, troca o código por uma sessão e valida `/auth/v1/user`.
- Ao entrar, lê o proprietário de sincronização e importa até 30 addons
  habilitados do perfil principal (índice 1), respeitando nomes e ordem remotos.
- **Sincronizar addons** repete a importação. Falhas individuais são exibidas;
  um addon já carregado não desaparece apenas porque seu servidor falhou.
- Instalações manuais ficam locais. Não há chamada `sync_push_addons` nem envio
  de configuração da TV à conta nesta versão.

## Rastreabilidade

Base Android: `ysosrs123/NuvioTV-Fork@45e0984`.

| Operação | Origem Android / endpoint |
|---|---|
| Criar vínculo | `AuthManager.startDeviceLoginSession` → `start_device_login_session` |
| Compatibilidade legada | `start_tv_login_session`, somente se a RPC nova não existir |
| Consultar autorização | `poll_tv_login_session` |
| Obter sessão | `/functions/v1/tv-logins-exchange` |
| Validar/renovar | `/auth/v1/user`, `/auth/v1/token?grant_type=refresh_token` |
| Resolver conta vinculada | `AuthManager.getEffectiveUserId` → `get_sync_owner` |
| Importar addons | `AddonSyncService.fetchAndApplyRemoteAddonUrls` → tabela `addons`, proprietário resolvido e `profile_id=1` |
| Sair desta TV | `/auth/v1/logout?scope=local` |

O backend `https://api.nuvio.tv` e sua **chave pública anon** foram conferidos
no JavaScript público carregado por `https://nuvio.tv/link` em 2026-09-14
(chunk `5422-64973e2563f908c9.js`). A chave pública identifica o cliente;
ela não é uma credencial de usuário nem uma chave administrativa. O projeto
continua baseado no fork solicitado, sem código de NuvioTVSmart.

## Sessão e privacidade

Access/refresh tokens ficam no armazenamento local do aplicativo, sob uma chave
separada dos dados de catálogo. Não entram em logs, diagnósticos, URLs de imagens
ou requisições dos addons. O port não afirma usar um cofre criptografado do SO.

Refresh é serializado para não reutilizar simultaneamente um token rotativo.
Indisponibilidade do serviço preserva a sessão local; revogação reconhecida
exige novo login. Polling é interrompido ao sair da tela e suspenso enquanto o
app está oculto. O QR e o site de aprovação ficam restritos ao domínio Nuvio.

Sair remove tokens e addons importados desta TV. Usa escopo local, preservando
sessões dos outros dispositivos. Se a TV estiver offline, informa que não foi
possível confirmar a revogação remota. Addons instalados manualmente, favoritos
e histórico locais permanecem.

## Validação e limites

O serviço real respondeu à criação de código e à consulta `pending` pelo próprio
cliente webOS. Preflights CORS dos endpoints de autenticação e addons aceitaram
origem `null`. Nenhuma conta real foi autenticada durante o desenvolvimento.

Testes simulados cobrem aprovação, validação de usuário, importação sem vazar
tokens para addons, refresh concorrente, expiração/revogação, falha parcial,
logout, cancelamento e entrada `file://`. QR e tela conectada foram revisados em
1920×1080. A aprovação pelo usuário e o funcionamento no firmware LG precisam
ser confirmados na TV.

Esta versão **não sincroniza** perfis secundários, favoritos/histórico da nuvem,
credenciais de debrid direto, plugins Android ou outras preferências. Os addons
precisam ser acessíveis a partir do app web; autenticar no Nuvio não remove
restrições CORS ou de formato dos próprios servidores de mídia.
