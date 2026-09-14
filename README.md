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

## Estado: prévia 0.7.0

A 0.7.0 acrescenta **progresso e assistidos da conta Nuvio por perfil**, retomada
no **Continuar assistindo** e resolução de conflitos com o histórico desta TV.
Abra **Biblioteca → Histórico e assistidos** para consultar, atualizar ou escolher
qual progresso manter. A marcação local de não assistido sobrevive à atualização.

Esta etapa importa o histórico nativo Nuvio. Trakt/Simkl ainda não estão conectados
no webOS; o app informa o uso do Nuvio Sync quando um deles estiver selecionado.
Favoritos, progresso e marcações editados na LG **ainda não são enviados à nuvem**.
[Uso, contratos e limites](webos/HISTORY.md). Perfis/PIN, biblioteca, áudio,
legendas e fontes das versões anteriores permanecem disponíveis.

O **login Nuvio por QR code** e a importação dos addons do **perfil selecionado** continuam disponíveis. O usuário confirmou o login na LG com a 0.3.0; não é necessário sair da conta para atualizar.

1. Atualize **Nuvio Fork** no mesmo repositório Homebrew.
2. Na abertura, escolha **Entrar com Nuvio**. Se já estiver no início, abra **Ajustes → Conta → Entrar com Nuvio**.
3. Escaneie o QR code com o celular ou abra **https://nuvio.tv/link** e informe o código mostrado **na TV**.
4. Entre na conta no site Nuvio e autorize a TV. Escolha o perfil; seus addons, biblioteca e histórico Nuvio são carregados.

**Ajustes → Conta → Sincronizar addons** repete a importação. A importação é de leitura: não envia nem substitui a configuração armazenada na nuvem. Addons configurados manualmente na TV são preservados. Sair desconecta somente esta TV e remove daqui os addons que vieram da conta.

Sem login, é possível usar **Continuar sem conta** e instalar addons manualmente. Integrações externas de histórico, debrid direto e plugins Android ainda não são sincronizados. As alterações feitas na LG continuam locais a cada perfil.

Validação: testes de regras, conta e navegação com dados sintéticos; instalação e login da 0.3.0 confirmados pelo usuário. Perfis, PIN, biblioteca, histórico e player foram testados no navegador com dados simulados. A troca efetiva de áudio, formatos e sincronismo precisam de validação na TV. Não se afirma identidade pixel a pixel. [Detalhes da conta](webos/ACCOUNT.md) · [Referência visual](webos/UI_REFERENCE.md).

## Próxima etapa

**Sincronização de saída:** enviar progresso, assistidos e favoritos da LG ao Nuvio, com fila por perfil, tratamento de conflitos e remoções, preservação offline e proteção contra respostas atrasadas. O [roteiro completo](webos/ROADMAP.md) mantém as entregas e diferenças pendentes. Ao concluir cada etapa, a próxima será sugerida.

## Base e créditos

- Base: [ysosrs123/NuvioTV-Fork](https://github.com/ysosrs123/NuvioTV-Fork), commit `45e0984`.
- Projeto original: [NuvioMedia/NuvioTV](https://github.com/NuvioMedia/NuvioTV).
- A versão NuvioTVSmart não foi usada como base.
- [README original do fork Android](docs/README.android-fork.md).
- Licença GPL-3.0; veja [LICENSE](LICENSE) e [atribuições](webos/THIRD_PARTY_NOTICES.md).

Os workflows Android/triagem herdados estão preservados em `.github/upstream-workflows/`, sem execução
nessa branch. O workflow ativo verifica e empacota apenas o alvo webOS.
