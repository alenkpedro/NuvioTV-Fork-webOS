# Etapas para completar o fork no webOS

Referência única: `ysosrs123/NuvioTV-Fork@45e0984` (código Android preservado nesta árvore).
Alvo: LG 55UT8050, webOS 24. NuvioTVSmart não é a base deste projeto.

## Como continuar este trabalho

Pedido do usuário: ao concluir cada etapa, comunicar a entrega, os limites/testes
e **sugerir a próxima etapa**, sem esperar que ele pergunte. Manter este registro
atualizado. Não declarar uma etapa integralmente concluída por existir uma tela
parecida: conferir ações, navegação, persistência e diferenças pendentes.

Cada atualização publicada deve preservar a conta e o ID do aplicativo, ter IPK
versionado e ser disponibilizada pelo mesmo `apps.json`. Publicar o pacote antes
de mudar o índice. Não colocar senhas ou dados reais da conta nos testes/capturas.

## Entregas

| Versão | Entrega | Validação na TV pelo usuário |
|---|---|---|
| 0.1 | Primeiro pacote instalável | Instalação confirmada; aparência rejeitada |
| 0.2 | Reconstrução do layout padrão a partir do fork | Usuário confirmou que ficou mais parecido |
| 0.3 | Login por QR e importação dos addons do perfil principal | Login confirmado pelo usuário |
| 0.4 | Variações Modern, menu flutuante/oculto, metadados do destaque, detalhes/episódios e restauração de foco | Pendente |
| 0.5 | Fontes com filtro/refresh/retorno, painéis de áudio, legendas externas SRT/WebVTT e ajustes | Pendente; troca de áudio testada com API simulada |
| 0.6 | Perfis/PIN, addons próprios/herdados, biblioteca nativa da conta e isolamento dos dados locais | Pendente; usuário testará depois |
| 0.7 | Histórico nativo Nuvio por perfil, retomada e resolução local de conflitos | Pendente; usuário testará depois |

## Sequência proposta

1. **Aparência e navegação — primeira entrega 0.4.** Menu clássico/moderno, menu
   oculto, desfoque opcional, retrato/paisagem, fundo parcial/completo, rótulos,
   informações dos catálogos, estilos de Continuar Assistindo. Detalhes com
   sinopse completa, créditos e elenco fornecidos pelo addon; episódios em
   cartões e temporadas com restauração. Permanecem temas/fontes/escala,
   efeitos de profundidade, expansão temporizada, trailers, coleções e comparação
   Android/webOS com os mesmos dados. Preferências de layout ainda são locais.
2. **Fontes, áudio e legendas — primeira entrega 0.5.** Organização de fontes,
   filtro por addon, atualização e retorno com foco. Painéis de áudio/faixas
   internas expostas pela plataforma; legendas da fonte e de addons em SRT/VTT,
   tamanho/fundo/atraso e busca na timeline. Testes de UI/renderização no navegador;
   áudio simulado, sem confirmação no hardware. Permanecem ASS/PGS/ZIP,
   seleção automática de idioma, busca manual, estilos avançados, personalização
   de badges e paridade completa do player. Ver [PLAYER.md](PLAYER.md).
3. **Biblioteca, histórico e perfis — primeira entrega 0.6.** Seleção/PIN, addons
   por perfil e leitura da biblioteca nativa Nuvio entregues. Dados locais isolados,
   importação atômica e sem escrita na nuvem. Ver [PROFILES.md](PROFILES.md).
   **Histórico entregue na 0.7:** importação nativa Nuvio, assistidos por episódio,
   retomada e conflitos locais; fallback explícito enquanto Trakt/Simkl não estão
   autenticados nesta TV. Ver [HISTORY.md](HISTORY.md).
   **Próxima etapa sugerida:** envio de progresso, assistidos e favoritos, com fila
   por perfil, remoções e conflitos. Gestão de perfis/PIN, avatares de catálogo e
   histórico externo continuam pendentes. Não sobrescrever a nuvem com estado vazio.
4. **Descoberta e metadados.** Busca/Descobrir, organização de todos os catálogos,
   TMDB/MDBList, elenco/filmografia, recomendações, coleções, trailers e ratings.
5. **Integrações específicas do fork.** Direct Debrid, Trakt, Simkl, recursos de
   plugins e demais ajustes. Para cada integração, rastrear APIs e separar o que
   é portável do que depende de serviço/binário Android.
6. **Player avançado e desempenho na LG.** Avaliar transporte/buffer paralelo,
   Up Next, retomada, suspensão, controle remoto, 4K/HDR/áudio e memória no aparelho.
   Confirmar alternativas de plataforma para Media3/MPV/FFmpeg; não prometer
   conversão HDR, passthrough ou formatos sem evidência no hardware.
7. **Revisão integral.** Percorrer telas e ações do Android contra o webOS,
   fechar diferenças, registrar recursos sem equivalente viável e verificar
   atualização/reinstalação e estabilidade em sessões longas.

## Critério de conclusão

Um recurso só conta como portado quando funciona com dados reais ou com um
contrato verificado, possui tratamento de erro e funciona pelo controle remoto.
Os testes de navegador não substituem a validação na TV. Toda diferença ainda
aberta deve continuar visível neste roteiro ou em `UI_REFERENCE.md`/`PORTING.md`.
“Todo o fork” permanece o objetivo; isso não significa que os binários ou APIs
exclusivos do Android possam ser executados diretamente no webOS.
