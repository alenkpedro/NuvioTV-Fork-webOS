// SPDX-License-Identifier: GPL-3.0-only
// CollectionManagementScreen.kt / CollectionEditorScreen.kt at 45e0984: a collection owns
// folders and each folder owns sources. The port keeps the fork's shape, labels and
// ordering with the two source families that work on this target (an installed add-on
// catalog and TMDB) and leaves Trakt lists, cover art, tile shapes and JSON import out.
import { addFolder, addSource, collectionLimits, collectionRails, collectionSourceCount, createCollection, createFolder, describeSource, moveFolder, moveIn, removeCollection, removeFolder, removeSource, renameCollection, renameFolder, sourceKindLabel, tmdbMediaTypes, tmdbSorts, tmdbSourceTypes, togglePin } from './core/collections.js';
import { catalogEntries } from './core/discovery.js';
// SettingsTextInputDialog / confirmation dialog, same shape as the fork's editors.
function inputDialog(el, button, { title, label, value, onSave }) {
  const previous = document.activeElement;
  const input = el('input', { type: 'text', value: value || '', maxlength: collectionLimits.title, spellcheck: 'false', autocomplete: 'off', 'aria-label': label, onkeydown: event => { if (event.key !== 'Enter') return; event.preventDefault(); accept(); } });
  const sheet = el('div', { class: 'app-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title, onkeydown: event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } } });
  const close = () => { sheet.remove(); previous?.focus({ preventScroll: true }); };
  const accept = () => { onSave(input.value); close(); };
  sheet.append(el('section', { class: 'dialog-panel' }, el('h2', {}, title), input, el('div', { class: 'toolbar' }, button('Cancelar', close, { 'data-dismiss': true }), button('Salvar', accept, { class: 'primary' }))));
  document.querySelector('#app').append(sheet); input.focus();
}
function confirmDialog(el, button, { title, message, label, onConfirm }) {
  const previous = document.activeElement;
  const sheet = el('div', { class: 'app-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title, onkeydown: event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } } });
  const close = () => { sheet.remove(); previous?.focus({ preventScroll: true }); };
  sheet.append(el('section', { class: 'dialog-panel' }, el('h2', {}, title), el('p', { class: 'dialog-copy' }, message),
    el('div', { class: 'toolbar' }, button('Cancelar', close, { 'data-dismiss': true }), button(label, () => { close(); onConfirm(); }, { class: 'primary' }))));
  document.querySelector('#app').append(sheet); sheet.querySelector('button').focus();
}
// SettingsSingleChoiceDialog equivalent: a list of buttons the remote can walk.
function choiceDialog(el, button, { title, description, options, onPick, onCancel }) {
  const previous = document.activeElement;
  const sheet = el('div', { class: 'app-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title });
  const close = () => { sheet.remove(); previous?.focus({ preventScroll: true }); };
  const cancel = button('Cancelar', () => { close(); onCancel?.(); }, { 'data-dismiss': true });
  sheet.append(el('section', { class: 'dialog-panel' }, el('h2', {}, title), description ? el('p', { class: 'dialog-copy' }, description) : null,
    el('div', { class: 'collection-choices' }, ...options.map(option => button(option.label, () => { close(); onPick(option); }, { class: 'collection-choice', 'aria-label': option.label, 'aria-description': option.description || null }))),
    el('div', { class: 'toolbar' }, cancel)));
  document.querySelector('#app').append(sheet);
  sheet.querySelector('.collection-choice')?.focus();
}
export function collectionsScreen(context) {
  const { main, el, button, state, persist, navigate, toast, account, pushCollections, syncCollections, syncStatus, addonInstalled } = context;
  const collections = () => state.collections || (state.collections = []);
  const installed = source => addonInstalled ? addonInstalled(source) : true;
  const railsOf = collection => collectionRails([collection], { addonInstalled: installed });
  const sourceStatus = source => source.kind === 'other' ? 'não suportada nesta TV' : source.kind === 'catalog' && !installed(source) ? 'add-on não instalado' : 'pronta';
  const save = patch => { state.collections = patch(collections()); persist(); pushCollections?.(); draw(); };
  const host = el('div', { class: 'collections-body' });
  const status = el('p', { class: 'settings-note muted', role: 'status' }, '');
  const sync = button('Sincronizar coleções da conta', async () => {
    if (!account) { toast('Entre com a conta Nuvio em Ajustes → Conta para sincronizar as coleções.'); return; }
    sync.disabled = true; status.textContent = 'Lendo as coleções da conta…';
    try {
      const result = await syncCollections();
      if (result.imported) { status.textContent = `${result.imported} coleção(ões) da conta carregada(s).`; draw(); }
      else status.textContent = 'A conta não tem coleções salvas para este perfil; as desta TV foram mantidas.';
    } catch (error) { status.textContent = error.message; }
    finally { sync.disabled = false; }
  }, { class: 'collection-action', 'aria-label': 'Sincronizar coleções da conta' });
  function paintStatus() {
    const info = syncStatus?.();
    if (info?.error) { status.textContent = `As coleções da conta não carregaram: ${info.error}`; return; }
    status.textContent = !account ? 'As coleções desta TV ficam neste perfil; entre na conta para sincronizá-las.'
      : info?.at ? `${info.collections} coleção(ões) da conta${info.pushedAt ? ' · envio mais recente feito' : ''}.`
      : 'Nenhuma coleção carregada da conta ainda.';
  }
  function draw() {
    const list = collections();
    if (!list.length) { host.replaceChildren(el('p', { class: 'notice', role: 'status' }, 'Nenhuma coleção ainda. Crie uma para organizar suas fileiras na Home.')); return; }
    host.replaceChildren(...list.map((collection, index) => el('article', { class: 'collection-row' },
      button([el('strong', {}, collection.title),
        el('small', { class: 'muted' }, `${collection.folders.length} pasta(s) · ${collectionSourceCount(collection)} fonte(s) · ${railsOf(collection).filter(rail => rail.sources.length).length} fileira(s) na Home`),
        collection.pinToTop ? el('span', { class: 'collection-pin' }, 'Fixada') : null],
        () => navigate({ name: 'collection-editor', collectionId: collection.id }),
        { class: 'collection-open', 'aria-label': `${collection.title}: abrir editor`, 'data-focus': `collection-${collection.id}` }),
      el('div', { class: 'collection-actions' },
        button('Fixar no topo', () => { const pinned = !collection.pinToTop; save(current => togglePin(current, collection.id)); toast(pinned ? 'Coleção fixada no topo da Home.' : 'Coleção solta.'); }, { class: 'collection-action', 'aria-label': `Fixar ${collection.title} no topo`, 'aria-pressed': String(collection.pinToTop) }),
        button('↑', () => save(current => moveIn(current, collection.id, -1)), { class: 'collection-action', 'aria-label': `Mover ${collection.title} para cima`, disabled: index === 0 }),
        button('↓', () => save(current => moveIn(current, collection.id, 1)), { class: 'collection-action', 'aria-label': `Mover ${collection.title} para baixo`, disabled: index === list.length - 1 }),
        button('Renomear', () => inputDialog(el, button, { title: 'Renomear coleção', label: 'Coleção', value: collection.title, onSave: value => save(current => renameCollection(current, collection.id, value)) }), { class: 'collection-action', 'aria-label': `Renomear ${collection.title}` }),
        button('Excluir', () => confirmDialog(el, button, { title: 'Excluir coleção?', message: `Isso excluirá permanentemente “${collection.title}”. Esta ação não pode ser desfeita.`, label: 'Excluir', onConfirm: () => { save(current => removeCollection(current, collection.id)); toast('Coleção excluída.'); } }), { class: 'collection-action danger', 'aria-label': `Excluir ${collection.title}` })))));
  }
  const create = button('Nova coleção', () => {
    if (collections().length >= collectionLimits.collections) { toast(`Limite de ${collectionLimits.collections} coleções atingido.`); return; }
    inputDialog(el, button, { title: 'Nova coleção', label: 'Nome da coleção', value: '', onSave: value => { save(current => [...current, createCollection(value)]); toast('Coleção criada. Abra para adicionar pastas e fontes.'); } });
  }, { class: 'primary', 'aria-label': 'Nova coleção', 'data-focus': 'collections-new' });
  main.append(el('div', { class: 'screen-collections' },
    el('div', { class: 'collections-head' }, el('h1', {}, 'Coleções'),
      el('p', { class: 'muted' }, 'Fileiras extras na Home a partir de catálogos de add-ons e do TMDB. Cada pasta com ao menos uma fonte vira uma fileira.'),
      el('div', { class: 'toolbar' }, create, sync, button('Voltar', () => navigate({ name: 'settings', category: 'discovery' }), { class: 'collection-action', 'aria-label': 'Voltar aos ajustes' }))),
    status,
    host,
    el('p', { class: 'notice' }, 'As coleções ficam neste perfil: as criadas em outro cliente Nuvio aparecem aqui depois de sincronizar, e as suas são enviadas de volta à conta.')));
  paintStatus();
  draw();
}

export function collectionEditorScreen(context) {
  const { main, el, button, state, persist, navigate, toast, route, signal, addonInstalled } = context;
  const collections = () => state.collections || (state.collections = []);
  const installed = source => addonInstalled ? addonInstalled(source) : true;
  const sourceStatus = source => source.kind === 'other' ? 'não suportada nesta TV' : source.kind === 'catalog' && !installed(source) ? 'add-on não instalado' : 'pronta';
  const current = () => collections().find(collection => collection.id === route.collectionId);
  const save = patch => { state.collections = patch(collections()); persist(); context.pushCollections?.(); draw(); };
  const host = el('div', { class: 'collection-editor-body' });
  if (!current()) { main.append(el('p', { class: 'notice' }, 'Esta coleção não existe mais.'), button('Voltar para Coleções', () => navigate({ name: 'collections' }))); return; }
  // The fork's editor walks add-on -> catalog -> genre, or TMDB type -> id -> media type
  // -> order; the port keeps the same steps as a chain of pickers.
  function askKind(collection, folder) {
    choiceDialog(el, button, { title: 'Adicionar fonte', description: `Pasta “${folder.title}” · até ${collectionLimits.sources} fontes por pasta.`,
      options: [{ kind: 'catalog', label: sourceKindLabel('catalog'), description: 'Uma fileira de um add-on instalado.' }, { kind: 'tmdb', label: sourceKindLabel('tmdb'), description: 'Coleção, lista, produtora, emissora, pessoa ou filtros.' }],
      onPick: option => option.kind === 'catalog' ? askAddon(collection, folder) : askTmdbType(collection, folder) });
  }
  function askAddon(collection, folder) {
    const entries = catalogEntries(state.addons).filter(entry => !entry.extras.some(extra => extra.isRequired && extra.name !== 'genre'));
    if (!entries.length) { toast('Nenhum catálogo de add-on pode entrar em uma coleção nesta TV.'); return; }
    const byAddon = new Map();
    for (const entry of entries) if (!byAddon.has(entry.addon.url)) byAddon.set(entry.addon.url, entry.addon);
    choiceDialog(el, button, { title: 'Add-on', options: [...byAddon.values()].map(addon => ({ addon, label: addon.manifest.name })), onPick: option => askCatalog(collection, folder, option.addon) });
  }
  function askCatalog(collection, folder, addon) {
    const entries = catalogEntries([addon]).filter(entry => !entry.extras.some(extra => extra.isRequired && extra.name !== 'genre'));
    choiceDialog(el, button, { title: addon.manifest.name, description: 'Escolha o catálogo desta fileira.',
      options: entries.map(entry => ({ entry, label: `${entry.catalog.name || entry.catalog.id} · ${entry.catalog.type}` })),
      onPick: option => {
        const source = { kind: 'catalog', addonId: addon.manifest.id || '', addonUrl: addon.url, addonName: addon.manifest.name, type: option.entry.catalog.type, catalogId: option.entry.catalog.id, catalogName: option.entry.catalog.name || option.entry.catalog.id };
        if (!option.entry.genres.length) { add(collection, folder, source); return; }
        choiceDialog(el, button, { title: 'Gênero', description: 'Opcional: fixe um gênero nesta fileira.',
          options: [{ label: 'Todos os gêneros' }, ...option.entry.genres.map(value => ({ label: value, genre: value }))],
          onPick: picked => add(collection, folder, picked.genre ? { ...source, genre: picked.genre } : source) });
      } });
  }
  function askTmdbType(collection, folder) {
    choiceDialog(el, button, { title: 'Fonte do TMDB', options: tmdbSourceTypes.map(type => ({ type, label: type.label, description: type.media === 'tv' ? 'Séries' : type.media === 'movie' ? 'Filmes' : 'Filmes e séries' })),
      onPick: option => askTmdbId(collection, folder, { kind: 'tmdb', sourceType: option.type.id, mediaType: option.type.media === 'tv' ? 'tv' : 'movie' }) });
  }
  function askTmdbId(collection, folder, source) {
    const type = tmdbSourceTypes.find(entry => entry.id === source.sourceType);
    if (!type.needsId) { askMedia(collection, folder, source); return; }
    const labels = { collection: 'ID da Coleção', list: 'ID da Lista', company: 'ID da Produtora', network: 'ID da Emissora', person: 'ID da Pessoa', director: 'ID da Pessoa' };
    const label = labels[source.sourceType] || 'ID do TMDB';
    inputDialog(el, button, { title: label, label, value: '', onSave: value => {
      const id = Number(String(value).trim().replace(/[^0-9]/g, ''));
      if (!Number.isSafeInteger(id) || id <= 0) { toast('Informe um ID numérico do TMDB.'); return; }
      askMedia(collection, folder, { ...source, tmdbId: id });
    } });
  }
  function askMedia(collection, folder, source) {
    const type = tmdbSourceTypes.find(entry => entry.id === source.sourceType);
    if (type.media !== 'both') { askSort(collection, folder, source); return; }
    choiceDialog(el, button, { title: 'Tipo de conteúdo', options: tmdbMediaTypes.map(media => ({ media, label: media.label })),
      onPick: option => askSort(collection, folder, { ...source, mediaType: option.media.id }) });
  }
  function askSort(collection, folder, source) {
    choiceDialog(el, button, { title: 'Ordem', options: tmdbSorts.map(sort => ({ sort, label: sort.label })),
      onPick: option => add(collection, folder, { ...source, sortBy: option.sort.id }) });
  }
  function add(collection, folder, source) {
    const before = folder.sources.length;
    save(list => addSource(list, collection.id, folder.id, source));
    const after = current()?.folders.find(entry => entry.id === folder.id)?.sources.length ?? 0;
    toast(after > before ? `Fonte adicionada: ${describeSource(source)}.` : 'Esta fonte já estava na pasta ou a pasta atingiu o limite.');
  }

  function folderBlock(collection, folder, index) {
    const actions = el('div', { class: 'collection-actions' },
      button('Adicionar fonte', () => askKind(collection, folder), { class: 'collection-action', 'aria-label': `Adicionar fonte em ${folder.title}`, 'data-focus': `folder-add-${folder.id}` }),
      button('Renomear', () => inputDialog(el, button, { title: 'Renomear pasta', label: 'Pasta', value: folder.title, onSave: value => save(list => renameFolder(list, collection.id, folder.id, value)) }), { class: 'collection-action', 'aria-label': `Renomear ${folder.title}` }),
      button('↑', () => save(list => moveFolder(list, collection.id, folder.id, -1)), { class: 'collection-action', 'aria-label': `Mover ${folder.title} para cima`, disabled: index === 0 }),
      button('↓', () => save(list => moveFolder(list, collection.id, folder.id, 1)), { class: 'collection-action', 'aria-label': `Mover ${folder.title} para baixo`, disabled: index === collection.folders.length - 1 }),
      button('Remover', () => confirmDialog(el, button, { title: 'Remover pasta?', message: `A pasta “${folder.title}” e as fontes dela saem desta coleção.`, label: 'Remover', onConfirm: () => save(list => removeFolder(list, collection.id, folder.id)) }), { class: 'collection-action danger', 'aria-label': `Remover ${folder.title}` }));
    const sourceRow = (source, position) => el('div', { class: 'collection-source' },
      el('span', { class: 'grow' }, el('strong', {}, `${sourceKindLabel(source.kind)} · ${sourceStatus(source)}`), el('small', { class: 'muted' }, describeSource(source))),
      button('Remover', () => save(list => removeSource(list, collection.id, folder.id, position)), { class: 'collection-action danger', 'aria-label': `Remover fonte ${describeSource(source)}` }));
    const body = folder.sources.length ? el('div', { class: 'collection-sources' }, ...folder.sources.map(sourceRow)) : el('p', { class: 'muted' }, 'Nenhuma fonte nesta pasta ainda.');
    return el('section', { class: 'collection-folder' },
      el('div', { class: 'collection-folder-head' }, el('h2', {}, folder.title), el('span', { class: 'muted' }, `${folder.sources.length} fonte(s)`), actions), body);
  }
  function draw() {
    const collection = current();
    if (!collection) return;
    // The header is created once, so its counters and the pin label follow the edits.
    summary.textContent = `${collection.folders.length} pasta(s) · ${collectionSourceCount(collection)} fonte(s) · ${collection.pinToTop ? 'fixada no topo da Home' : 'na ordem da Home'}`;
    pinButton.textContent = collection.pinToTop ? 'Desafixar' : 'Fixar no topo';
    pinButton.setAttribute('aria-label', collection.pinToTop ? 'Desafixar do topo' : 'Fixar no topo');
    if (!collection.folders.length) { host.replaceChildren(el('p', { class: 'notice' }, 'Nenhuma pasta ainda. Adicione uma pasta e depois as fontes dela.')); return; }
    host.replaceChildren(...collection.folders.map((folder, index) => folderBlock(collection, folder, index)));
  }
  const collection = current();
  const summary = el('p', { class: 'muted' });
  const pinButton = button(collection.pinToTop ? 'Desafixar' : 'Fixar no topo', () => save(list => togglePin(list, collection.id)), { class: 'collection-action', 'aria-label': collection.pinToTop ? 'Desafixar do topo' : 'Fixar no topo' });
  main.append(el('div', { class: 'screen-collections' },
    el('div', { class: 'collections-head' }, el('h1', {}, collection.title),
      summary,
      el('div', { class: 'toolbar' },
        button('Nova pasta', () => { if (collection.folders.length >= collectionLimits.folders) { toast(`Limite de ${collectionLimits.folders} pastas por coleção.`); return; } inputDialog(el, button, { title: 'Nova pasta', label: 'Nome da pasta', value: '', onSave: value => save(list => addFolder(list, collection.id, createFolder(value))) }); }, { class: 'primary', 'aria-label': 'Nova pasta', 'data-focus': 'folder-new' }),
        button('Renomear coleção', () => inputDialog(el, button, { title: 'Renomear coleção', label: 'Coleção', value: collection.title, onSave: value => save(list => renameCollection(list, collection.id, value)) }), { class: 'collection-action', 'aria-label': 'Renomear coleção' }),
        pinButton,
        button('Voltar', () => navigate({ name: 'collections' }), { class: 'collection-action', 'aria-label': 'Voltar para Coleções' }))),
    host));
  draw();
  signal?.addEventListener('abort', () => { document.querySelectorAll('.app-dialog').forEach(node => node.remove()); }, { once: true });
}
