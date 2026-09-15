# Coleções: fileiras extras na Home

Port de `CollectionsDataStore.kt`, `domain/model/Collection.kt`,
`CollectionManagementScreen.kt` e `CollectionEditorScreen.kt` do fork fixado em
`45e0984`. Uma coleção tem pastas; cada pasta tem fontes; cada pasta com ao menos
uma fonte vira uma fileira na Home. Tudo fica em **Ajustes → Conteúdo e
Descoberta → Coleções**, por perfil.

## O que existe

- **Coleções**: criar, renomear, reordenar (↑/↓), **fixar no topo** e excluir com
  confirmação. O port mantém os limites do fork (20 coleções, 12 pastas por
  coleção, 8 fontes por pasta e 60 caracteres de título).
- **Pastas**: criar, renomear, reordenar e remover. Uma pasta sem fonte não
  aparece na Home — o port não cria fileira vazia.
- **Fontes**, as duas famílias que funcionam nesta TV:
  - **Catálogo de add-on**: escolhe o add-on, o catálogo e, quando o catálogo
    oferece gêneros, opcionalmente fixa um gênero na fileira.
  - **TMDB**: **Coleção** (franquia), **Lista**, **Produtora**, **Emissora**,
    **Pessoa (elenco)**, **Direção** e **Descobrir (filtros)**. Cada tipo pede o
    que precisa — ID numérico do TMDB, tipo de conteúdo (filmes ou séries) e
    ordem (mais populares, melhor avaliados, mais votados, lançamento recente ou
    a ordem original).
- **Na Home**, as coleções vêm antes dos catálogos dos add-ons — são conteúdo curado pelo
  usuário — e uma coleção fixada no topo lidera as demais, que seguem a ordem do editor.
  Cada fileira tem **Ver todos**, que abre a pasta com as fontes em abas, como o
  `FolderDetailScreen`. A ordem dos add-ons em **Ajustes → Conteúdo e Descoberta → Addons**
  decide a ordem dos catálogos deles na Home.
- Um título vindo do TMDB abre a tela de detalhes normalmente e a busca de
  fontes usa os add-ons instalados: a coleção não exige add-on próprio.

## Sincronização com a conta

As coleções vivem no blob de perfil da conta (`sync_pull_collections` /
`sync_push_collections`), o mesmo que o app Android usa pelo `CollectionSyncService`.
Isso significa que:

- ao entrar na conta (ou ao usar **Sincronizar coleções da conta**), o port lê o blob do
  perfil e traz as coleções criadas em outro cliente Nuvio — a Home passa a mostrar as
  mesmas fileiras;
- editar uma coleção na TV (criar, renomear, mover, fixar, excluir, adicionar ou remover
  fonte) envia o blob de volta, no formato que o app Android lê, com um atraso curto para
  agrupar mudanças seguidas;
- uma coleção vazia na conta **não** apaga a cópia local: o port só adota o que veio quando
  o blob tem conteúdo;
- falha nessa sincronização aparece no texto de estado da tela de Coleções, sem transformar
  o login em uma pilha de mensagens.

O que a TV não consegue abrir continua viagem de ida e volta: **listas do Trakt** (e
qualquer provedor futuro) ficam guardadas no formato original, aparecem marcadas como não
suportadas nesta TV e são devolvidas intactas no envio — editar coleções aqui nunca apaga
uma lista que você criou em outro app.

## O que ainda não existe

- **Listas do Trakt** como fonte: o port não tem login OAuth do Trakt.
- **Sincronização das coleções** com a conta: as coleções ficam nesta TV, no
  mesmo arquivo por perfil das outras preferências. O fork sincroniza o blob de
  coleções pelo `CollectionSyncService`; o port ainda não envia esse blob.
- **Importar/exportar JSON**, URL de coleções e leitura de `nuvio-collections.json`.
- **Aparência da fileira**: capa, GIF de foco, emoji, formato do cartão, esconder
  título, modo de exibição (abas/grade), aba "todos", arte do hero e brilho de
  foco. O port usa o cartão padrão do fork para pôsteres horizontais ou verticais,
  conforme **Ajustes → Layout**.
- **Filtros avançados do Descobrir** do fork: gêneros múltiplos, idioma original,
  país de origem, palavras-chave, produtoras, emissoras, região e provedores de
  streaming. O port oferece o que é digitável no controle sem uma tela de teclado
  completa.

## Testes

`tests/collections.test.mjs` cobre a validação de coleções, pastas e fontes (com
`trakt` e links inválidos sendo descartados), os limites, a ordenação, a fixação,
a deduplicação de fontes e as regras de fileira. `tests/collections.spec.js`
cobre a tela de gerenciamento (criar, renomear, fixar, excluir, contagem no
ajuste), o editor com fonte de catálogo e de TMDB, a fileira na Home, a tela da
pasta com abas e a ordem das fileiras na Home.
