# Ajustes alinhados ao fork — 0.20.0

Base: `ysosrs123/NuvioTV-Fork@45e0984`. Referências locais: `SettingsScreen.kt`,
`SettingsDesignSystem.kt`, `ThemeSettingsScreen.kt`, `ThemeDataStore.kt`,
`ThemeColors.kt`, `SupporterThemeColors.kt`, `PrimitiveTokens.kt`,
`LayoutSettingsScreen.kt`, `PlaybackSettingsSections.kt`, `NetworkSettingsScreen.kt`,
`AboutScreen.kt`, `SettingsUiStyle.kt` e `strings.xml` (pt-BR).

## Estrutura

A tela deixou de ser uma lista única e passou a ser o workspace do fork: rail de
categorias à esquerda e um painel de detalhe à direita, formado por cabeçalho
(título + subtítulo) e cartões de grupo com linhas de alternância e de ação.
A ordem, os títulos e os subtítulos vêm das strings pt-BR do fork:

| Categoria | Subtítulo |
|---|---|
| Conta | Conta e status de sincronização |
| Perfis | Gerenciar perfis de usuário |
| Aparência | Escolha seu tema de cores, fonte e idioma |
| Layout | Estrutura da página inicial e estilos de pôster |
| Conteúdo e Descoberta | Add-ons, plugins, catálogos e fontes de descoberta |
| Integrações | Gerenciar integrações disponíveis |
| Reprodução | Player, legendas e reprodução automática |
| Rastreamento | Gerenciar conexões com Trakt e Simkl |
| Sobre | Versão e políticas |
| Avançado | Desempenho, navegação, cache e diagnósticos |

`Experiência` e `Debug` não aparecem: a primeira é filtrada pelo próprio fork e
a segunda só existe em build de depuração. Geometria preservada:
`SettingsContainerRadius`, rail de 220, item de 56, espaçamento de 16 e cartão de
grupo com raio 16 e 14 de preenchimento.

## Aparência

Tema de Cores oferece os doze temas de `AppTheme` com as paletas copiadas de
`ThemeColors.kt` e `SupporterThemeColors.kt`. O padrão é **Branco**, o mesmo visual
que o port já usava: os valores dessa paleta são exatamente os literais anteriores
(`#0d0d0d`, `#1a1a1a`, `rgba(255,255,255,.14)`, `#f5f5f5` e texto `#111`), então uma
TV que nunca abriu este menu continua idêntica. Trocar o tema reescreve as
variáveis de `#app` e o aplicativo inteiro acompanha: fundo, superfícies, bordas,
foco, destaque e texto sobre o destaque.

- **Modo AMOLED** troca só o plano de fundo por preto puro.
- **Superfícies em Preto Puro** depende do AMOLED e estende o preto a cartões,
  painéis, menus e campos.
- **Estilo das Configurações** implementa `SettingsUiStyle`: Padrão (cartões com
  borda), Minimalista (grupos planos, rótulos em maiúsculas, barra de destaque sob
  o título) e Barra Superior (categorias em abas no topo).
- **Fonte do App** e **Idioma do App** continuam fixos (Inter e português do
  Brasil). O fork escolhe entre fontes empacotadas no APK e 35 localidades; o
  pacote webOS compila uma família e uma localidade, e as linhas dizem isso em vez
  de oferecer uma troca que não funciona.

## Reprodução

Grupos: **Geral**, **Pular automaticamente**, **Player e Seleção de Fontes**,
**Legendas** e **Reprodução automática**.

- Tela de pausa, miniaturas de busca e pular trechos continuam gravando as mesmas
  preferências; os rótulos agora são os do fork ("Informações ao pausar",
  "Pular introduções").
- Pular automaticamente lista Aberturas, Resumo anterior e Créditos, separados
  como no fork.
- **Aparência das legendas** abre o mesmo editor da StyleRail do player dentro de
  Ajustes (tamanho, negrito, cor, opacidade, contorno e posição), com a família
  fixa. Antes esse ajuste só existia dentro do player.
- Avisos de conteúdo, renderização ASS/libass e recomendações pós-reprodução
  aparecem marcados como **Pendente**: dependem de classificação do Android,
  decodificador ou tela que ainda não existe no port. Linhas pendentes explicam o
  motivo e não ficam selecionáveis.
- **Reprodução automática** deixou de ser pendente na 0.22: as linhas "Seleção
  automática de fonte", "Reutilizar último link" e "Trailer automático após
  assistir" são controles reais — quatro modos em chips, cache de 1 h a 7 dias,
  atraso do trailer de 3 s a 15 s e o filtro de palavras (Regex) em diálogo.
  Ver [AUTO_PLAY.md](AUTO_PLAY.md).
- **Buffer e Rede** entrou na 0.23 como grupo próprio: o interruptor de buffer
  personalizado com **Buffer inicial**, **Buffer após travamento** e **Tempo
  limite de espera** em passos, mais as linhas do Media3 (janelas em bytes,
  orçamento de memória, cache em disco, conexões paralelas, memória nativa e AFR)
  marcadas como **Pendente** com o motivo. Ver [NETWORK.md](NETWORK.md).

## Demais categorias

- **Conta** e **Perfis** mantêm sincronização, troca de perfil, fila, histórico e
  saída desta TV, com a confirmação de saída em diálogo.
- **Layout** usa os rótulos do fork (Pôsteres Horizontais, Fundo em tela cheia,
  Barra lateral moderna, Desfoque no menu lateral, Recolher barra lateral,
  Títulos nos pôsteres, Nome do addon, Tipo de conteúdo) e o estilo de Continuar
  Assistindo em três opções (Cartão, Amplo, Pôster).
- **Conteúdo e Descoberta** reúne Addons, Catálogos do início e Descobrir;
  Plugins fica pendente porque são módulos Android.
- **Integrações** é o hub do fork: Debrid pendente, TMDB e MDBList com o estado
  real da configuração.
- **Rastreamento** mostra Trakt e Simkl como não conectados (o login OAuth é
  Android), a fonte de progresso lida da conta e os atalhos para Sincronização
  Nuvio e histórico.
- **Sobre** traz wordmark, versão lida de `appinfo.json`, créditos, política de
  privacidade e licenças.
- **Avançado** separa Desempenho e navegação (pendente), Diagnóstico (versão,
  addons instalados) e Cache (limpar metadados).

## Limites

O port não promete o aplicativo inteiro do fork: escolha de fonte, idioma,
protetor de tela, buffer paralelo, AFR/resolução, decodificadores, passthrough de
áudio, Sentry, plugins, Direct Debrid e os serviços de segundo plano continuam
sem equivalente webOS. Toda linha sem equivalente fica visível, marcada como
pendente, com o motivo — em vez de sumir da interface. A validação física na LG
(controle remoto, foco e contraste dos doze temas) permanece pendente.
