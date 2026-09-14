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

## Estado: prévia 0.2.0

A 0.2.0 substitui a interface genérica da primeira prévia por uma reconstrução baseada no layout do fork.
A instalação da 0.1.0 foi confirmada em uma LG 55UT8050; a revisão 0.2.0 ainda requer validação no aparelho.
Não há paridade completa de recursos com o fork Android.
Tem biblioteca local, add-ons, catálogos, busca, episódios, ranking/filtros do fork, reprodução HTTP(S) e retomada local.
Downloads paralelos, debrid direto, trackers, plugins e processamento avançado de áudio/vídeo ainda não foram portados.

Use **Esquerda/Voltar → Ajustes → Conteúdo e Descoberta → Addons** para instalar seus catálogos.
A atualização preserva os dados da 0.1.0. [Referência visual e medidas](webos/UI_REFERENCE.md).

A interface mantém: UI em 1080p, vídeo na resolução original, três consultas simultâneas,
cache limitado e imagens carregadas sob demanda. Não contém contas, credenciais ou add-ons pré-instalados.

## Base e créditos

- Base: [ysosrs123/NuvioTV-Fork](https://github.com/ysosrs123/NuvioTV-Fork), commit `45e0984`.
- Projeto original: [NuvioMedia/NuvioTV](https://github.com/NuvioMedia/NuvioTV).
- A versão NuvioTVSmart não foi usada como base.
- [README original do fork Android](docs/README.android-fork.md).
- Licença GPL-3.0; veja [LICENSE](LICENSE) e [atribuições](webos/THIRD_PARTY_NOTICES.md).

Os workflows Android/triagem herdados estão preservados em `.github/upstream-workflows/`, sem execução
nessa branch. O workflow ativo verifica e empacota apenas o alvo webOS.
