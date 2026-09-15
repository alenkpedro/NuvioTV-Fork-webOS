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

## Estado: prévia 0.10.0

A 0.10.0 amplia **elenco, pessoas, recomendações e trailers** a partir dos
contratos do fork. Fotos e personagens de `app_extras` são aproveitados;
selecionar uma pessoa abre sua biografia e filmografia. As abas de detalhes
mudam ao receber foco e preservam o cartão ao voltar.

**Biografia, filmografia e recomendações exigem uma chave TMDB em Ajustes →
Integrações → TMDB.** Essa chave não acompanha o código público do Android nem
é fornecida pelo login Nuvio. Elenco e trailers enviados pelo addon continuam
funcionando sem ela. Trailers abrem no YouTube/navegador da TV, com QR code como
alternativa; reprodução interna e automática ainda estão pendentes.
[Uso, referências e diferenças](webos/METADATA.md).

Descobrir, busca e organização de catálogos da 0.9 permanecem disponíveis.
[Descoberta e busca](webos/DISCOVERY.md).

Login, perfis/PIN, biblioteca, histórico e envio de progresso/assistidos/favoritos
nativos Nuvio da 0.8 continuam disponíveis. [Sincronização](webos/SYNC.md).
Trakt, Simkl e MDBList externos permanecem pendentes.

O **login Nuvio por QR code** e a importação dos addons do **perfil selecionado** continuam disponíveis. O usuário confirmou o login na LG com a 0.3.0; não é necessário sair da conta para atualizar.

1. Atualize **Nuvio Fork** no mesmo repositório Homebrew.
2. Na abertura, escolha **Entrar com Nuvio**. Se já estiver no início, abra **Ajustes → Conta → Entrar com Nuvio**.
3. Escaneie o QR code com o celular ou abra **https://nuvio.tv/link** e informe o código mostrado **na TV**.
4. Entre na conta no site Nuvio e autorize a TV. Escolha o perfil; seus addons, biblioteca e histórico Nuvio são carregados.

**Ajustes → Conta → Sincronizar addons** repete a importação. A importação de addons é de leitura: não envia nem substitui a configuração armazenada na nuvem. Addons configurados manualmente na TV são preservados. Sair desconecta somente esta TV e remove daqui os addons que vieram da conta.

Sem login, é possível usar **Continuar sem conta** e instalar addons manualmente. Integrações externas de histórico, debrid direto e plugins Android ainda não são sincronizados. Com login, progresso, assistidos e favoritos da LG são sincronizados com o Nuvio; addons manuais e preferências visuais permanecem locais.

Validação: testes de regras, conta e navegação com dados sintéticos; instalação e login da 0.3.0 confirmados pelo usuário. Perfis, PIN, biblioteca, histórico, fila de envio, Descobrir, busca, metadados e player foram testados no navegador com dados simulados. A troca efetiva de áudio, formatos e sincronismo precisam de validação na TV. Não se afirma identidade pixel a pixel. [Detalhes da conta](webos/ACCOUNT.md) · [Referência visual](webos/UI_REFERENCE.md).

## Próxima etapa

**Coleções/franquias e avaliações adicionais** na tela de detalhes, conforme as fontes e contratos do fork. O [roteiro completo](webos/ROADMAP.md) mantém as entregas e diferenças pendentes. Ao concluir cada etapa, a próxima será sugerida.

## Base e créditos

- Base: [ysosrs123/NuvioTV-Fork](https://github.com/ysosrs123/NuvioTV-Fork), commit `45e0984`.
- Projeto original: [NuvioMedia/NuvioTV](https://github.com/NuvioMedia/NuvioTV).
- A versão NuvioTVSmart não foi usada como base.
- [README original do fork Android](docs/README.android-fork.md).
- Licença GPL-3.0; veja [LICENSE](LICENSE) e [atribuições](webos/THIRD_PARTY_NOTICES.md).

Os workflows Android/triagem herdados estão preservados em `.github/upstream-workflows/`, sem execução
nessa branch. O workflow ativo verifica e empacota apenas o alvo webOS.
