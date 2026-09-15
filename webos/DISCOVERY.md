# Descobrir e busca — 0.9.0

Base exclusiva: `ysosrs123/NuvioTV-Fork@45e0984`, código Android preservado nesta
árvore. Não usa NuvioTVSmart. Esta etapa trabalha com catálogos dos addons já
instalados e não acrescenta credenciais ou serviços externos de metadados.

## Uso

- **Busca → bússola (Abrir Descobrir)** abre os filtros **Tipo**, **Catálogo** e
  **Gênero**. Também acessível em Ajustes → Conteúdo e Descoberta → Descobrir.
- Cada catálogo aparece com o addon no seletor, mesmo que compartilhe o nome ou
  ID com outro. A identidade inclui URL configurada, tipo e ID; não mistura fontes.
- Gêneros vêm das opções do manifesto. Rótulos conhecidos usam as traduções
  pt-BR do fork; a requisição mantém o valor original, incluindo espaços e `&`.
  Trocar tipo/catálogo reinicia o gênero. Catálogo com gênero obrigatório usa a
  primeira opção válida; outros extras obrigatórios não suportados exibem erro
  sem disparar uma consulta sem o filtro exigido.
- Na grade, **OK** abre detalhes. Voltar dos detalhes restaura o pôster e os filtros.
  Voltar na grade retorna aos filtros; o próximo Voltar retorna à Busca. Voltar
  dentro de um seletor fecha somente esse menu, incluindo a tecla 461 da LG.
- **Carregar mais** e **Página anterior** percorrem os resultados. **Atualizar
  catálogo** refaz a página. Erros de página preservam o lote anterior; respostas
  repetidas/vazias ao avançar encerram a paginação sem apagar o lote útil.
- A busca começa após 350 ms sem digitar; **Buscar** envia imediatamente. Digitação
  por composição aguarda a confirmação do teclado. Trocar/limpar a consulta ou
  sair cancela a anterior; uma resposta atrasada não reaparece na tela nova.
- Busca tem filtros Tipo/Catálogo e mostra resultados separados por fonte. **Ver
  todos** mantém a consulta no catálogo e nas páginas seguintes. Resultados em
  cache e foco sobrevivem ao retorno dos detalhes durante dois minutos.
- Até oito pesquisas recentes ficam salvas por perfil. Prefixos digitados são
  consolidados como no fork; é possível remover um termo ou limpar o histórico.
  Não são enviados à conta nem compartilhados com outro perfil.

## Organização dos catálogos

**Ajustes → Conteúdo e Descoberta → Catálogos do início** oferece Mostrar/Ocultar,
Subir/Descer e Restaurar ordem. A preferência é local e isolada por perfil, sem
escrever addons ou configurações na nuvem. O início mantém seu limite de seis
faixas: a nova ordem determina quais aparecem primeiro. Catálogos ocultos do
início continuam em Descobrir e na busca quando forem compatíveis.

## Referência de código e geometria

Caminhos relativos a `app/src/main/java/com/nuvio/tv/`:

| Referência | Regra portada |
|---|---|
| `ui/screens/search/SearchDiscoverSection.kt` | Filtros Tipo/Catálogo/Gênero, restauração e retorno da grade para filtros; menus e grade |
| `ui/screens/search/SearchUiState.kt` | Cartão padrão 126 dp, altura 1,5×, raio 12 |
| `ui/theme/SpacingTokens.kt` | Margem 48, gaps 12/16; ação de abertura de Descobrir com 56 |
| `ui/screens/search/SearchViewModel.kt` | Busca viva 350 ms, oito recentes, seleção de tipo/catálogo/gênero, exclusão de catálogos de busca obrigatória de Descobrir |
| `domain/model/CatalogDescriptorExtensions.kt` | Extras longos/curtos, paginação por `pageSize`, menor intervalo positivo das opções de skip ou padrão 100 |
| `data/repository/CatalogRepositoryImpl.kt` | Mais páginas quando skip é suportado e houve resposta não vazia; fim em repetição conforme SearchViewModel |
| `data/local/SearchHistoryDataStore.kt` | Recentes por perfil, consolidação de prefixos e limite oito |
| `ui/util/GenreLabelFormatter.kt`, `res/values-pt-rBR/strings.xml` | Traduções de gêneros; desconhecidos permanecem como enviados pelo addon |

Descobrir usa título 28/36, três filtros iguais, gap 12, raio 14 e padding 14×10;
menu com altura máxima 320. Grade usa cartões 126×189 e gaps 10/16, mantendo o
retrato mesmo quando a home estiver em paisagem. Canvas continua 960×540 lógico,
1920×1080 físico. A revisão visual foi feita com arte/dados sintéticos; ainda não
há comparação pixel a pixel contra captura Android com os mesmos dados.

## Limites e diferenças para o Android

- Até 100 cartões na grade; lote de resposta com até 500 itens e orçamento de
  1 MiB de metadados retidos. Resposta maior é rejeitada com aviso. Campos usados
  pela tela são selecionados; dados extras grandes não ficam no cache da rota.
- Busca consulta seis catálogos por grupo, com três requisições concorrentes e
  até 16 cartões por faixa (96 no total). Próximos/Anteriores percorrem os demais
  catálogos. O Android consulta as fontes em conjunto; o agrupamento é uma
  adaptação para limitar conexões, DOM e memória na LG.
- Seletor mostra até 100 opções por lote; organização mostra 20 catálogos por
  página. Nenhum catálogo desaparece por estar depois desse primeiro lote.
- Paginação explícita substitui rolagem infinita; não há prefetch de páginas nem
  animações contínuas. Mantém a página atual em memória por até dois minutos
  para retornar dos detalhes, sem guardar resultados no localStorage.
- Requisições continuam limitadas a 6 MiB decodificados, canceláveis e com timeout
  de 15 segundos. Addons precisam permitir acesso pelo app web/CORS.
- Teclado é o nativo da plataforma. Busca por voz, faixa de sugestões de títulos,
  filtro de lançamentos, menus de pressão longa, opções de localização de
  Descobrir e sincronização das preferências ainda não foram portados.
- Gerenciamento de ordem/visibilidade e filtros adicionais da busca são controles
  webOS; não representam paridade completa de todas as telas Android.

## Validação e próxima etapa

Testes sintéticos cobrem extras em ambos os formatos, encoding e configuração
de URLs, paginação, dados inválidos, gêneros, isolamento por perfil e histórico.
No navegador: retorno com foco/filtros, cancelamento, consulta mantida em Ver todos,
menus por controle remoto, nomes repetidos, limites de DOM e falhas de páginas.
A verificação com addons reais e controle na LG será feita pelo usuário depois.

**Próxima etapa sugerida:** ampliar detalhes/metadados com elenco/filmografia,
recomendações e trailers, conforme as fontes e contratos do fork. Integrações
externas, coleções e demais diferenças seguem em [ROADMAP.md](ROADMAP.md).
