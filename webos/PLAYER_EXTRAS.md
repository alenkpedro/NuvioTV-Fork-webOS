# Trechos, miniaturas e aparência — 0.19.0

Base: `ysosrs123/NuvioTV-Fork@45e0984`. Referências locais: `SkipIntroApi`,
`SkipIntroRepository`, `SkipIntroVisibilityRules`, `SkipIntroButton`,
`SeekThumbnailPane`, `SeekThumbnailPreferences` e `SubtitleSelectionOverlay`.

## Legendas

Em **Player → Legendas → Ajustes de legenda**, os controles da StyleRail incluem:

- Tamanho 50–200%, em passos de 10%; negrito ligado/desligado.
- Texto branco, cinza #d9d9d9, amarelo #ffd700, ciano #00e5ff,
  vermelho #ff5c5c e verde #00ff88, conforme a paleta do fork.
- Opacidade do texto 0–100%, em passos de 10%.
- Contorno ligado/desligado; preto, branco, ciano ou vermelho.
- Posição vertical −20 a 50, em passos de 5; restaurar aparência padrão.

Não há seletor nem informação da fonte na interface. Netflix Sans Medium
continua embutida; negrito usa síntese do navegador sobre a mesma família.
O padrão solicitado anteriormente é a base de 100%: Medium 500, branco,
3,6% da altura lógica, sombras curtas, largura 78% e margem 6,5%.
Posição 5 corresponde a esse padrão; outros valores deslocam a margem por
pontos percentuais. Essa calibração preserva o preset do usuário, em vez de
substituí-lo pelo tamanho inicial do Android. Opacidade afeta o texto; a cor
do contorno permanece independente. Não foi adicionado fundo porque a
StyleRail ativa do fork não oferece esse controle.

A aparência é salva por perfil, separada da sincronização por vídeo. Restaurar
aparência não zera atraso ou preferências de idioma. Configurações antigas de
fonte/tamanho anteriores à 0.15.2 continuam ignoradas. Externas SRT/VTT e internas
com texto acessível compartilham o compositor. Faixas opacas nativas têm o editor
desabilitado; não se declara controle de aparência de ASS/PGS ou legenda gravada.

## Pular trechos

**Ajustes → Reprodução → Pular introduções** vem habilitado. Os controles
aparecem para episódios com IMDb, temporada, episódio e intervalos válidos.
Inclui abertura, recapitulação e créditos. Não estima trechos sem dados. Pular
busca o fim do intervalo no mesmo vídeo, preservando pausa. Voltar dispensa o
botão. Ele some após 10 segundos com controles recolhidos e reaparece ao abrir
a barra. Painéis de faixas, pausa e buscas não perdem foco para esse botão.
O título fica oculto enquanto o botão ocupa sua região, seguindo o fork.
Créditos identificados também antecipam o cartão do próximo episódio.

Três opções separadas permitem pular automaticamente abertura, recapitulação e
créditos. Todas começam desativadas. Cada trecho só é pulado automaticamente uma
vez por reprodução, com o vídeo tocando; retornar ao trecho permite assisti-lo.

A [API IntroDB](https://introdb.app/docs/api) é a mesma do contrato Android:
GET /segments com imdb_id, season e episode. Segundos e milissegundos são
normalizados. Consulta iniciada após o primeiro frame, limite 15 s, cache de até
50 episódios por uma hora. Nenhuma credencial Nuvio ou URL de vídeo é enviada.
Verificado com a API pública: resposta 200 e formato compatível; alguns episódios
só têm créditos ou não têm nenhum trecho.

A API restringe a origem CORS ao próprio site. Na TV, a consulta usa o serviço
local **org.nuviofork.webos.segments**, incluído no mesmo IPK conforme as
[instruções LG](https://webostv.developer.lge.com/develop/guides/js-service-usage).
O serviço usa HTTPS apenas para api.introdb.app/segments; valida os três campos,
não aceita URL/headers arbitrários, não segue redirects, limita resposta a 32 KiB,
duas consultas simultâneas e timeout de 14 s. Não armazena arquivos nem fica
executando tarefas periódicas. Navegador de desenvolvimento usa fetch; testes
interceptam a API. Falha do serviço não interrompe o vídeo. Cancelar a tela
ignora callbacks tardios; eventual pedido HTTPS já iniciado termina no timeout.

## Miniaturas de busca — extração pelo próprio arquivo

**Ajustes → Reprodução → Miniaturas ao buscar**, inicialmente desativado como no
fork. O painel segue altura 108 dp, raio 6 dp, margens laterais 32 dp, inferior
140 dp; acompanha a posição prevista e permanece até 3 segundos após confirmar.
Voltar, outro painel, suspensão ou saída removem a prévia.

O fork (`SeekThumbnailEngine.kt`) não lê o quadro da superfície que está
reproduzindo: ele abre o **próprio arquivo** com um `MediaMetadataRetriever`
(reutilizado na sessão) e pede o quadro da posição desejada. O port faz o mesmo
com **um elemento `<video>` escondido**, criado só na primeira prévia: o navegador
desenha o quadro da posição buscada, e o painel mostra esse elemento. Como nada é
lido de volta, a TV não devolve preto — o problema da 0.27/0.28 — e a reprodução
não é tocada: nenhum canvas, nenhuma cópia de pixels, nenhum download extra até
você usar as setas.

O elemento é único por reprodução e reaproveitado: uma prévia nova busca a posição
nova, e pedidos que chegam enquanto a busca anterior está em andamento são
coalescidos no mais recente (a prioridade do fork). Enquanto o quadro não chega, o
painel **não aparece** — nunca há uma caixa preta sobre a linha do tempo. Fonte com
DRM detectado, tela protegida ou sem URL HTTP(S) não têm quadro para buscar e não
abrem o segundo decodificador. Se a TV recusar o segundo vídeo, o port avisa **uma
vez** ("A TV não conseguiu abrir/decodificar a prévia desta fonte") e desliga as
miniaturas naquela reprodução.

Limites que continuam existindo: o fork também extrai quadros de partes **não
vistas** antecipadamente (fora do escopo deste port) e mantém um cache em disco
compartilhado entre sessões; aqui o painel busca a posição pedida na hora, o que
custa uma busca por arrasto em vez de ler um bitmap do cache. A confirmação de
desempenho e de conflito de decodificador na LG continua dependendo do aparelho.

## Diagnóstico de reprodução no canto

**Informações de reprodução** (o botão de informação entre os controles do player)
mostra resolução decodificada, buffer à frente, frames perdidos, fonte e
transporte. O painel fica no **canto inferior esquerdo**, acima dos controles, como
o `StreamInfoOverlay` do fork (`BottomStart`), com no máximo 440×200 dp; antes ele
ocupava a lateral direita e escondia o título. Com o painel aberto, a linha de
ícones acima da linha do tempo **não muda de lugar** — o deslocamento de 388 px foi
removido.

## Validação

Testes com mídia sintética: estilos externos/internos, fonte invariável,
persistência/reset/perfis, intervalos e identificação, salto manual/automático,
foco/Voltar, próximo episódio nos créditos, respostas tardias, cache de quadros,
confirmação/cancelamento e um único vídeo. Testes do serviço cobrem destino fixo,
validação de parâmetros, redirects, limite de bytes e cancelamento do cliente.
O IPK inclui app, serviço e fonte. Build e testes de navegador não substituem
a validação na LG 55UT8050: serviço Luna, composição de vídeo, HDR/DRM e controle
remoto físico ainda precisam ser conferidos no aparelho.
