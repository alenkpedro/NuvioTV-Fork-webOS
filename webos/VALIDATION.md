# Checklist de validação na LG 55UT8050 — versão 0.24.1

Documento para uso na frente da TV. Cada item diz **o que fazer** e **o que deve
acontecer**; a validação física é a única coisa que os testes de navegador não
substituem. Veja também as pendências conhecidas no fim: elas já estão
documentadas e não são falhas novas.

## Como usar

- **Bloco A (essencial, ~10 min):** o que, se quebrar, quebra o resto.
- **Bloco B (~15 min):** o que cada versão recente acrescentou (0.20 a 0.24.1).
- **Bloco C (~20 min):** fluxos que nunca foram confirmados no aparelho desde a 0.4.
- **Bloco D:** formatos de vídeo/áudio — só a TV responde.
- Marque **OK / FALHOU / DÚVIDA** e anote o número do item. Se algo falhar, mande
  o que está no fim em *Como reportar*.

Onde ver a versão instalada: **Ajustes → Sobre** (linha "Versão") ou
**Ajustes → Avançado → Diagnóstico → Versão do app**.

Roteiro mínimo, se você só tiver 3 minutos: A1 → A2 → A3.

## Antes de começar

1. **Atualizar:** Homebrew Channel → atualize a lista do repositório já salvo →
   instale **Nuvio Fork**. Confirme a versão **0.24.1** em Ajustes → Sobre.
2. **Entrar no perfil que você usa de verdade.** Coleções, biblioteca, histórico
   e preferências de reprodução são por perfil.
3. Anote para o relatório: versão do firmware/webOS da TV, saída de áudio em uso
   (alto-falantes da TV, soundbar ou receiver + tipo de conexão) e quais fontes
   de teste você está usando.


## Bloco A — essencial

### A1. Abrir e navegar
- [ ] Abrir **Nuvio Fork**. Esperado: sem tela preta e sem erro; abre a Home (ou a
      tela de boas-vindas, se não houver conta nesta TV).
- [ ] Tecla **Voltar** (ou **Esquerda**) abre o menu lateral: **Início, Busca,
      Biblioteca, Ajustes**. As setas andam entre os itens e o foco é visível.
- [ ] **Ajustes**: o rail mostra as dez categorias (Conta, Perfis, Aparência,
      Layout, Conteúdo e Descoberta, Integrações, Reprodução, Rastreamento, Sobre,
      Avançado); ↑/↓ troca de categoria e a lista da direita rola até o fim.
- Dúvida: foco "pulando" ou sumindo, ou linha cortada em alguma categoria.

### A2. Entrar na conta termina na Home (0.24.0)
- [ ] Ajustes → Conta → **Sair da conta** → confirmar → **Entrar com Nuvio**.
- [ ] Autorizar pelo celular. Esperado: ao concluir, a TV **abre a Home** — não
      Ajustes — com os addons do perfil carregados.
- [ ] Repetir uma vez com um addon seu desligado/instável, se possível. Esperado:
      a Home abre mesmo assim e aparece a mensagem
      "N addon(s) carregado(s); M não responderam…"; a nova tentativa fica em
      Ajustes → Conta → Sincronizar addons.

### A3. Reproduzir um título
- [ ] Home → escolher um título → **Assistir** → lista de fontes.
- [ ] **Reproduzir melhor fonte**. Esperado: o vídeo começa, a barra aparece com
      tempo decorrido e restante, e **Pausar/Reproduzir**, retroceder, avançar e o
      scrubber respondem pelo controle.
- [ ] Sair com **Voltar** e reproduzir o mesmo título de novo. Esperado: retomar
      do ponto anterior ("Retomar em mm:ss") ou começar do início se já terminou.
- [ ] Pressionar **Voltar** mais de uma vez. Esperado: cada Voltar fecha um nível
      (controles → lista de fontes → detalhe → Home), sem sair do app de repente.

### A4. Ajustes obedecem ao controle (0.20)
- [ ] Ajustes → Aparência → **Tema de Cores**: trocar para **Oceano** e ver o app
      inteiro mudar (fundo, foco, destaque); voltar para **Branco**.
- [ ] Ligar **Modo AMOLED**. Esperado: fundo em preto puro, sem áreas cinzas.
- [ ] Ajustes → Reprodução: mudar um interruptor de cada grupo e **reiniciar o
      app**; esperado: tudo continua como você deixou.
- [ ] Ajustes → Reprodução → Legendas → **Aparência das legendas**: mudar tamanho
      e cor e confirmar no player durante uma reprodução.

## Bloco B — o que cada versão recente acrescentou

### B1. Coleções (0.24)
- [ ] Ajustes → Conteúdo e Descoberta → **Coleções** → **Nova coleção** (ex.:
      "Sagas") → abrir a coleção → **Nova pasta** (ex.: "Clássicos").
- [ ] **Adicionar fonte** → **Catálogo de add-on** → escolher o add-on e o
      catálogo (se o catálogo tiver gêneros, escolher um ou "Todos os gêneros").
      Esperado: a fonte aparece na pasta com o nome do add-on e do catálogo.
- [ ] **Adicionar fonte** → **TMDB** → **Coleção do TMDB** → informar um ID
      (ex.: 10 é a coleção Star Wars) → **Mais populares**. Esperado: a fonte
      aparece como "TMDB · Coleção do TMDB · 10".
- [ ] O cabeçalho da coleção conta pastas e fontes corretamente; **Fixar no topo**
      muda o rótulo do botão para **Desafixar** (correção 0.24.1).
- [ ] Ir para **Início**. Esperado: a fileira "Clássicos" aparece depois dos
      catálogos dos add-ons, com **Ver todos**; abrir Ver todos mostra as fontes
      em abas e os títulos; um cartão do TMDB abre o detalhe e **Assistir** acha
      fontes nos addons instalados.
- [ ] Coleção fixada deve vir antes das não fixadas. Renomear, mover ↑/↓ e
      excluir (com confirmação) funcionam pelo controle.
- Dúvida: diálogos de escolha muito longos, foco preso, ou fileira que não
  aparece depois de adicionar a fonte.

### B2. Buffer e Rede (0.23)
- [ ] Ajustes → Reprodução → **Buffer e Rede**: ligar **Buffer de reprodução
      personalizado**. Esperado: aparecem **Buffer inicial** (5s), **Buffer após
      travamento** (3s) e **Tempo limite de espera** (20s), com os passos − e +;
      os limites 0–20s e 5–60s desabilitam o botão correspondente.
- [ ] Ligar o buffer inicial em 10s e abrir um título. Esperado: quando a TV
      precisa esperar, aparece "Aguardando buffer (10s)…" por poucos segundos e a
      reprodução começa; nunca fica em tela preta além do tempo limite.
- [ ] Em uma fonte lenta ou com rede instável, observar o comportamento após
      travamento: a reprodução segura e volta depois de carregar o alvo.
- [ ] Na lista de fontes, **Testar velocidade**. Esperado: aparece "Medindo N
      fonte(s)…" e depois taxa e latência no cartão (ex.: `~6,6 Mbps · 16 ms`).
      A ordem da lista **não muda** e nenhuma reprodução é afetada.
- Dúvida: espera longa demais para começar, travamento repetido, ou medição que
  não aparece em nenhuma fonte.


### B3. Reprodução automática (0.22)
- [ ] Ajustes → Reprodução → **Reprodução automática**: os quatro modos aparecem
      como opções — *Manual (escolher fonte)*, *Primeira fonte*, *Seleção
      inteligente* e *Palavra-chave (Regex)*. Padrão: Manual.
- [ ] Escolher **Palavra-chave (Regex)** → linha **Filtro de palavras (Regex)** →
      digitar `2160p` → Salvar. Abrir um título e tocar **Assistir**: esperado
      entrar direto na fonte com "2160p", sem mostrar a lista.
- [ ] Trocar o padrão para `av1` (que não existe) e abrir outro título: esperado
      mostrar a lista de fontes. Digitar `(` e Salvar: esperado recusar com aviso
      de expressão inválida, mantendo o padrão anterior.
- [ ] Ligar **Reutilizar último link** (padrão 1 dia) e reproduzir um título, sair
      e entrar de novo: esperado começar direto, sem pedir fontes aos add-ons.
      Desligar o ajuste: esperado a lista voltar a ser consultada.
- [ ] Ligar **Trailer automático após assistir** e esperar no detalhe, com o foco
      em **Assistir**, pelo tempo configurado (padrão 7s): esperado abrir o
      trailer. No fim de um filme: contador nos últimos 5 segundos e, ao acabar, o
      trailer abre no aplicativo do YouTube da TV.
- Dúvida: trailer abrindo sem você pedir, contador repetindo, ou modo regex
  escolhendo uma fonte errada.

### B4. Guia parental e pós-reprodução (0.21)
- [ ] Ajustes → Reprodução → **Avisos de conteúdo**: deve estar **ligado**.
      Reproduzir um filme conhecido: esperado o aviso com as categorias (Nudez,
      Violência, Linguagem Imprópria, Drogas/Álcool, Conteúdo Assustador) em ordem
      de gravidade, com a linha de destaque animada, ~5 segundos na tela e saída
      suave. O aviso não recebe foco e não atrapalha os controles.
- [ ] Comparar o contraste da linha nos **doze temas** (Aparência → Tema de Cores)
      para achar algum tema em que a linha fique apagada.
- [ ] Ligar **Recomendações após assistir** (padrão desligado) e, em um filme,
      passar do limite (80–100%, padrão 90%): esperado a janela com arte, título,
      ano, sinopse, contador e as ações **Assistir**, **Recomendação anterior**,
      **Próxima recomendação** e **Voltar para o player**. As setas trocam a
      sugestão; fechar vale para aquela reprodução.
- Dúvida: foco das ações da janela, ou aviso de conteúdo sobrepondo o cartão de
  próximo episódio em séries.

### B5. Ajustes reconstruídos (0.20)
- [ ] Percorrer as dez categorias no controle: **Conta, Perfis, Aparência,
      Layout, Conteúdo e Descoberta, Integrações, Reprodução, Rastreamento, Sobre,
      Avançado**.
- [ ] Aparência: os **doze temas** aplicam no app inteiro e **Branco** é o padrão;
      **Estilo das Configurações** (Padrão, Minimalista, Barra Superior) muda o
      desenho do workspace e mantém tudo alcançável.
- [ ] Conferir contraste e legibilidade dos temas nas telas de Ajustes: algum tema
      com texto "sumindo" no fundo?
- [ ] **Avançado → Diagnóstico**: "Versão do app" mostra a versão instalada;

## Bloco C — fluxos nunca confirmados no aparelho (desde a 0.4)

Marque só o que você usar; o objetivo é achar o que quebra, não cobrir tudo.

### C1. Home e layout
- [ ] **Layout**: alternar **Pôsteres Horizontais**, **Fundo em tela cheia**,
      **Barra lateral moderna**, **Desfoque no menu lateral**, **Recolher barra
      lateral**, **Títulos nos pôsteres**, **Nome do addon** e **Tipo de conteúdo**.
      Esperado: cada um muda a Home na hora; nada some da tela.
- [ ] **Continuar Assistindo**: os três estilos (Cartão, Amplo, Pôster) e o
      interruptor de mostrar/ocultar a linha.
- [ ] **Catálogos do início**: reordenar e ocultar catálogos; esperado a Home
      seguir a ordem e os ocultos não aparecerem (e continuarem no Descobrir).
- [ ] Hero da Home: título em destaque, sinopse e arte trocando ao mover o foco.

### C2. Busca e Descobrir
- [ ] Busca: digitar, escolher um resultado, abrir e voltar (o foco volta ao
      resultado anterior).
- [ ] **Descobrir**: trocar o catálogo e o gênero, paginar (Próximos/Anteriores) e
      abrir um título da grade.
- [ ] Busca vazia ou sem resultados: mensagem clara, sem tela em branco.

### C3. Detalhes, elenco e trailers
- [ ] Detalhes com sinopse completa (botão), elenco em cartões e **Semelhantes**.
- [ ] Abrir um ator (**Pessoa**): biografia e filmografia, com paginação.
- [ ] **Trailer** no detalhe: abre o aplicativo do YouTube da TV (ou o diálogo com
      QR code). **Voltar** retorna ao Nuvio no lugar certo.
- [ ] Séries: temporadas em abas, episódios em cartões com progresso e retomada.

### C4. Perfis, biblioteca e histórico
- [ ] **Perfis**: trocar de perfil, perfil com **PIN** e cancelar o PIN (o app não
      deve trocar de perfil).
- [ ] **Biblioteca**: adicionar/remover um título e conferir na tela Biblioteca.
- [ ] **Histórico e assistidos**: ver a lista, "Marcar como não assistido" e a
      **Sincronização** (fila de envio) com o resumo do que foi enviado.
- [ ] Reiniciar o app e conferir que progresso, biblioteca e histórico continuam.

### C5. Player
- [ ] Painéis **Áudio** e **Legendas**: listar faixas, trocar de faixa e ver a
      troca acontecer; painel **Fontes** (fontes do vídeo atual) trocando de fonte
      sem sair da reprodução.
- [ ] **Mais**: velocidade de reprodução e proporção/aspecto; **Reiniciar**.
- [ ] **Pular abertura / recapitulação / créditos**: aparecem quando o add-on
      informa o trecho e o toque pula.
- [ ] **Miniaturas ao buscar**: ligar em Ajustes e arrastar o scrubber.
- [ ] **Informações ao pausar**: pausar e esperar 5s para ver o painel com elenco
      e logo do título.
- [ ] Séries: cartão **Próximo episódio** no fim e "Ainda assistindo?" após
      avanços automáticos.
- [ ] Legendas: forçadas quando o áudio já está no idioma, limpeza de SDH em
      legendas de add-on e memória de faixa por título.

### C6. TMDB e MDBList (chaves próprias)
- [ ] **Integrações → TMDB**: salvar sua chave v3 e ver elenco, semelhantes,
      recomendações e logos nos detalhes.
- [ ] **Avaliações MDBList**: configurar e ver as notas no detalhe (somente
      leitura).
- [ ] Sem chave configurada: o app continua funcionando com os dados do add-on.


## Bloco D — formatos (só a TV responde)

Use amostras **suas e autorizadas**. Anote o resultado de cada uma; isso vira a
tabela de suporte real do port.

| # | Teste | O que observar |
|---|---|---|
| D1 | Filme 4K **HDR10** (HEVC) | Imagem correta, sem lavagem de cor; a TV indica HDR no aviso de entrada |
| D2 | Filme **HLG** | Igual ao D1 |
| D3 | Fonte marcada **somente Dolby Vision** | O port evita por padrão; se você desligar "Evitar fontes DV-only" em Preferências, observar o que a TV faz |
| D4 | 4K HEVC com bitrate alto (perto de 60 Mbps) | Sem travar de forma recorrente; ver "Informações de reprodução" para resolução decodificada e buffer |
| D5 | **E-AC3/AC3 5.1** | Som normal nos alto-falantes/soundbar |
| D6 | **DTS** ou **TrueHD** | Se o áudio sai ou se a TV cai para estéreo — a ficha da UT8050 não promete passthrough |
| D7 | **Legendas internas** do contêiner (SRT/WebVTT) | Texto legível, sem tarjas pretas; Netflix Sans aplicada |
| D8 | **Legenda externa** de add-on | Igual a D7 e sem descaracterização de acentos |
| D9 | Vídeo 23,976/24 fps | Se o movimento parece constante (o port **não** muda a frequência da tela; AFR está fora de escopo) |
| D10 | Reprodução longa (30+ min) | Sem travar, sem perda de sincronia de legenda, sem esquentar demais |

Para D1–D6, o overlay **Informações de reprodução** mostra resolução decodificada,
buffer e frames perdidos. Ele não mede HDR nem a saída de áudio: essas conclusões
saem do que você vê e ouve.

## Pendências conhecidas — não são falhas novas

Já documentadas, com o motivo, em [SETTINGS_PARITY.md](SETTINGS_PARITY.md) e nos
documentos de cada versão:

- **Renderização ASS/SSA com libass**, AFR (taxa de quadros automática), janelas de
  buffer em bytes, orçamento de memória do ExoPlayer, cache de VOD em disco,
  conexões paralelas/HTTP-2 e plugins Android: sem equivalente nesta plataforma.
- **Listas do Trakt** como fonte de coleção e **sincronização das coleções** com a
  conta: ainda não implementadas.
- **Login Trakt/Simkl** (OAuth) e **Direct Debrid/torrents**: pendentes.
- **Fonte do app e idioma**: fixos (Inter e português do Brasil) nesta versão.
- **Trailer interno**: o webOS não reproduz YouTube dentro do app; o trailer abre
  no aplicativo da TV, como descrito em [AUTO_PLAY.md](AUTO_PLAY.md).

## Como reportar

Para cada item com problema, mande uma linha neste formato:

```text
Item: B1 (fileira de coleção não aparece)
Versão: 0.24.1   Firmware: webOS 24.x.y
O que fiz: criei a coleção, adicionei catálogo 'X', fui para Início
O que aconteceu: a Home mostrou 'Nenhum conteúdo encontrado'
O que esperava: a fileira 'Clássicos' com os títulos
Foto: (se possível)
```

Se o erro acontecer em uma tela específica, uma **foto** resolve mais do que um
texto longo. Se o app fechar sozinho, anote em qual item e o que estava na tela.

      "Addons instalados" lista os seus.
