# NuvioTV-Fork: alvo LG webOS

Port experimental dentro do fork **ysosrs123/NuvioTV-Fork**, iniciado no commit
`45e0984c18460d2a65c5d745999011b4314328eb`. Nenhum código do NuvioTVSmart foi usado.
Este alvo usa a estrutura de dados e regras do fork, com interface e serviços de
plataforma reimplementados para webOS. Não é uma compilação do APK para a LG.

## Instalar pelo Homebrew Channel

Em Configurações → Adicionar repositório, informe:

```text
https://raw.githubusercontent.com/alenkpedro/NuvioTV-Fork-webOS/webos/apps.json
```

Atualize a lista e instale **Nuvio Fork**. O identificador `org.nuviofork.webos`
permite coexistir com outras versões do Nuvio. O índice aponta para um IPK
versionado e contém seu SHA-256 e tamanho. O aplicativo não exige root.

Para entrar com uma conta existente, use **Ajustes → Conta → Entrar com Nuvio**
e autorize pelo celular via QR code. Os addons habilitados do perfil selecionado
são importados após a vinculação. Veja [ACCOUNT.md](ACCOUNT.md).

Para instalar addons manualmente, pressione **Esquerda** ou **Voltar** para abrir o menu.
Entre em **Ajustes → Conteúdo e Descoberta → Addons** e adicione a URL do `manifest.json` do seu add-on.
Depois abra **Início** ou **Busca**, selecione um título, episódio e fonte.
Nenhum add-on, conta ou credencial vem instalado. A importação da conta inclui os addons habilitados do perfil selecionado.
Outras configurações do Android ainda não são sincronizadas.

## TMDB e trailers (0.10)

Ajustes → Integrações → TMDB recebe sua chave pessoal da API v3. Biografias,
filmografia e recomendações exigem essa configuração; não vem do login Nuvio.
Dados de elenco/trailers enviados pelo addon funcionam sem a chave. Trailers
abrem no YouTube ou navegador da TV; a reprodução interna ainda está pendente.
Veja [METADATA.md](METADATA.md) para uso, fonte e limites.

## Coleções e avaliações (0.11)

Coleções/franquias usam a integração TMDB. Avaliações adicionais exigem sua chave
MDBList em Ajustes → Integrações → Avaliações MDBList, com escolha de fontes.
As consultas são somente de leitura; listas e rastreamento continuam pendentes.
Veja [COLLECTIONS_RATINGS.md](COLLECTIONS_RATINGS.md).

## O que funciona nesta prévia

- Login Nuvio por QR code, sessão persistente, renovação e logout somente desta TV.
- Importação dos addons da conta, com opção de repetir a sincronização e erros parciais visíveis.
- Instalação/remoção local de add-ons, catálogos, busca e detalhes com episódios.
- Descobrir por tipo/catálogo/gênero; busca após 350 ms, pesquisas recentes por
  perfil e filtros. Ordem/visibilidade das faixas em Catálogos do início. Ver
  [DISCOVERY.md](DISCOVERY.md) para geometria, paginação e diferenças pendentes.
- Perfis da conta com PIN, addons próprios/herdados e biblioteca Nuvio importada.
  Favoritos editados na LG são enviados ao Nuvio e separados por perfil.
  Veja [PROFILES.md](PROFILES.md).
- Histórico Nuvio por perfil: progresso/assistidos importados, retomada e conflitos
  com dados locais. Até 50 linhas por página; alterações da LG entram na fila de envio
  ao Nuvio. Trakt/Simkl/MDBList externos pendentes. Veja [HISTORY.md](HISTORY.md).
- Fila persistente de progresso, assistidos e favoritos, confirmação por item,
  recuperação de falhas e conflitos revisáveis. Veja [SYNC.md](SYNC.md).
- Layout Modern do fork: tema Branco, fonte Inter, sidebar clássico/moderno/oculto,
  retrato/paisagem, fundo parcial/completo, rótulos e estilos de Continuar Assistindo.
  Ajustes em **Layout** são locais; o login não importa preferências visuais do Android.
- Destaque atualizado após estabilizar o foco por 450 ms, com consulta cancelável
  de metadados aos addons (até três provedores elegíveis, um por vez).
- Detalhes com sinopse completa, créditos/elenco dos addons, temporadas e cartões
  horizontais de episódios. Assistir considera a retomada local/importada e pula especiais
  na primeira reprodução quando há uma temporada regular disponível.
- Controle por setas/OK/Voltar (incluindo código 461 da LG) e ponteiro.
- Extração de resolução, qualidade, grupo, áudio, HDR, codec, idioma e tamanho.
- Ranking determinístico do fork, listas de grupos e filtros estritos; o botão de
  melhor fonte mantém o fallback de exclusões do original entre fontes elegíveis.
- Ajustes de grupos, exclusões de codecs/qualidades, limite de resultados e autoplay.
- Reprodução HTTP(S) no player da plataforma, pausa, avanço/recuo, retomada local/importada,
  histórico limitado, painel de áudio quando a plataforma expõe faixas e legendas
  SRT/WebVTT da fonte e de addons, com tamanho, fundo e sincronização. Veja [PLAYER.md](PLAYER.md).
- Diagnóstico de resolução decodificada, buffer temporal e frames perdidos,
  quando expostos pelo player. HDR e áudio de saída são explicitamente não medidos.

## Alvo e otimização

LG 55UT8050PSA, com webOS 24 / Chromium 108 como baseline. A interface é
renderizada em 1920×1080; essa resolução de UI não reduz a resolução do vídeo.
A compatibilidade real de 4K/HDR/áudio precisa de testes no aparelho.

- Sem framework de UI, biblioteca externa de player, fontes remotas ou animações contínuas.
- JavaScript/CSS empacotados e minificados; sem servidor externo para hospedar a UI.
- Três consultas a add-ons simultâneas, timeout, cancelamento ao sair da tela e
  limite de 6 MiB por resposta JSON decodificada.
- Cache de metadados com TTL de 2 minutos, até 8 entradas e orçamento estimado
  de 2 MiB serializados (isso não é uma medição do heap total).
- Até seis catálogos na home, 16 cartões por faixa, imagens lazy e decodificação
  assíncrona. Descobrir e Ver todos exibem até 100 cartões por página; episódios mostram
  até 150 itens por temporada. Até 30 add-ons instalados.
- Até 300 fontes por add-on; a lista renderiza no máximo 100 fontes por vez.
- Histórico de até 100 itens, gravação no máximo a cada 10 segundos durante a
  reprodução e em pausa/saída; a URL temporária de vídeo não é salva no histórico.
- Vídeo é pausado quando o app perde visibilidade e o recurso de mídia é liberado
  ao fechar o player. Nenhum prefetch de vídeo compete com o player nesta versão.

O perfil da UT8050 evita fontes que anunciam somente Dolby Vision; isso é uma
checagem de metadados, não uma inspeção do bitstream. É possível desativá-la nos
ajustes. Os padrões originais do fork, incluindo a exclusão de AV1, são mantidos
separadamente. Não há alegação de otimização máxima medida no hardware.

## Ainda não portado

Downloads paralelos e buffer customizado do fork; teste de velocidade e avaliação
de dispositivo; Direct Debrid e torrents; plugins Android; listas e rastreamento MDBList/Trakt/Simkl;
deltas/realtime, gestão de listas externas e edição de perfis; decodificadores FFmpeg/MPV; conversão Dolby Vision;
passthrough lossless/MAT; legendas ASS/PGS/ZIP, preferências automáticas de idioma,
ajuste de frequência e Up Next. A versão 0.5.0 acrescenta fontes, áudio e legendas; a
0.4.0 ampliou as opções Modern e os detalhes a partir do código de referência. Temas/fontes alternativos, profundidade, expansão temporizada, trailers internos, coleções pessoais e personalizações adicionais continuam pendentes. Veja [UI_REFERENCE.md](UI_REFERENCE.md)
para medidas, origem e limitações; ainda não há comparação pixel a pixel com
uma captura da mesma configuração executada no Android.

Add-ons precisam permitir requisições do app web (CORS). Fontes que exigem
cabeçalhos HTTP especiais ou resolução local são identificadas como indisponíveis.
Links externos, YouTube e magnet não são tratados como vídeos HTTP. HLS usa o
suporte nativo da LG; Chrome desktop pode não reproduzir os mesmos formatos.

Parte do pipeline de áudio do Android está disponível somente em binário no
fork. Não há promessa de transportar esse código diretamente para a LG.

## Desenvolvimento

```sh
cd webos
npm ci
npm test
npm run build
npm start
```

Prévia em `http://127.0.0.1:4173`. Em macOS, os testes de interface usam o Chrome
instalado. Em Linux, instale Chromium com `npx playwright install chromium`.
Também é possível informar `CHROME_PATH`.

```sh
npm run test:ui
npm run package:webos
node scripts/generate-homebrew.mjs alenkpedro/NuvioTV-Fork-webOS webos-v0.11.0
```

O CLI da LG está instalado localmente. O script de pacote mantém seus dados em
`.cli-data/` dentro deste diretório. Pacotes saem em `packages/`.
`npm run sync:defaults` atualiza as listas a partir do Kotlin após revisão; o build
detecta divergências por hash/conteúdo para evitar alterações silenciosas.

Os testes de fluxo usam um vídeo sintético de 60 segundos, gerado com FFmpeg,
e respostas de add-on locais interceptadas no navegador. Não acessam conteúdo
de terceiros. Isso comprova o fluxo no navegador, não a reprodução na TV.

Veja [PORTING.md](PORTING.md) para rastreabilidade e [ROADMAP.md](ROADMAP.md) para etapas, pendências e próxima entrega sugerida.

## Licença

GPL-3.0. Créditos a NuvioMedia, aos autores do NuvioTV e ao fork de ysosrs123.
Dados de grupos: TRaSH Guides, conforme atribuição do fork. Consulte
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) e a licença na raiz.
