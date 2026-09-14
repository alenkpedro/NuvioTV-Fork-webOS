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

## Estado: prévia 0.1.0

Esta é a primeira versão funcional, **ainda não validada na TV** e sem paridade completa com o fork Android.
Tem add-ons, catálogos, busca, episódios, ranking/filtros do fork, reprodução HTTP(S) e retomada local.
Downloads paralelos, debrid direto, trackers, plugins e processamento avançado de áudio/vídeo ainda não foram portados.

A interface foi feita para ser leve: UI em 1080p, vídeo na resolução original, três consultas simultâneas,
cache limitado e imagens carregadas sob demanda. Não contém contas, credenciais ou add-ons pré-instalados.

## Base e créditos

- Base: [ysosrs123/NuvioTV-Fork](https://github.com/ysosrs123/NuvioTV-Fork), commit `45e0984`.
- Projeto original: [NuvioMedia/NuvioTV](https://github.com/NuvioMedia/NuvioTV).
- A versão NuvioTVSmart não foi usada como base.
- [README original do fork Android](docs/README.android-fork.md).
- Licença GPL-3.0; veja [LICENSE](LICENSE) e [atribuições](webos/THIRD_PARTY_NOTICES.md).

Os workflows Android/triagem herdados estão preservados em `.github/upstream-workflows/`, sem execução
nessa branch. O workflow ativo verifica e empacota apenas o alvo webOS.
