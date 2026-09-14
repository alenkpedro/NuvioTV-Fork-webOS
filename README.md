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

## Estado: prévia 0.4.0

A 0.4.0 amplia a fidelidade visual ao fork: **menu moderno ou clássico**, pôsteres horizontais ou em retrato, fundo em tela cheia, metadados no destaque e detalhes com sinopse completa, elenco e cartões de episódios. Configure em **Ajustes → Layout**. As opções são salvas nesta TV.

O **login Nuvio por QR code** e a importação dos addons do **perfil principal** continuam disponíveis. O usuário confirmou o login na LG com a 0.3.0; não é necessário sair da conta para atualizar.

1. Atualize **Nuvio Fork** no mesmo repositório Homebrew.
2. Na abertura, escolha **Entrar com Nuvio**. Se já estiver no início, abra **Ajustes → Conta → Entrar com Nuvio**.
3. Escaneie o QR code com o celular ou abra **https://nuvio.tv/link** e informe o código mostrado **na TV**.
4. Entre na conta no site Nuvio e autorize a TV. Os addons do perfil principal são carregados após a aprovação.

**Ajustes → Conta → Sincronizar addons** repete a importação. A importação é de leitura: não envia nem substitui a configuração armazenada na nuvem. Addons configurados manualmente na TV são preservados. Sair desconecta somente esta TV e remove daqui os addons que vieram da conta.

Sem login, é possível usar **Continuar sem conta** e instalar addons manualmente. Perfil secundário, biblioteca/histórico da nuvem, debrid direto e plugins Android ainda não são sincronizados. Favoritos e histórico de reprodução continuam locais.

Validação: testes de regras, conta e navegação com dados sintéticos; instalação e login da 0.3.0 confirmados pelo usuário. As novas combinações visuais da 0.4.0 e os formatos de reprodução precisam de validação na TV. Não se afirma identidade pixel a pixel. [Detalhes da conta](webos/ACCOUNT.md) · [Referência visual](webos/UI_REFERENCE.md).

## Próxima etapa

**Fontes, áudio e legendas:** aproximar a seleção de fontes e os controles de reprodução do fork e testar os recursos disponíveis no player LG. O [roteiro completo](webos/ROADMAP.md) mantém as entregas e diferenças pendentes. Ao concluir cada etapa, a próxima será sugerida.

## Base e créditos

- Base: [ysosrs123/NuvioTV-Fork](https://github.com/ysosrs123/NuvioTV-Fork), commit `45e0984`.
- Projeto original: [NuvioMedia/NuvioTV](https://github.com/NuvioMedia/NuvioTV).
- A versão NuvioTVSmart não foi usada como base.
- [README original do fork Android](docs/README.android-fork.md).
- Licença GPL-3.0; veja [LICENSE](LICENSE) e [atribuições](webos/THIRD_PARTY_NOTICES.md).

Os workflows Android/triagem herdados estão preservados em `.github/upstream-workflows/`, sem execução
nessa branch. O workflow ativo verifica e empacota apenas o alvo webOS.
