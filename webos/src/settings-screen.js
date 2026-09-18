// SPDX-License-Identifier: GPL-3.0-only
// SettingsScreen.kt + SettingsDesignSystem.kt: a rail of categories beside a
// detail pane made of group cards. Category order, subtitles and the option
// wording come from the fork's pt-BR strings; rows whose Android dependency has
// no webOS equivalent stay visible, disabled and marked as pending.
import { readPlayback, postPlayThresholdRange } from './core/playback.js';
import { autoPlayModes, compileRegex } from './core/auto-play.js';
import { cacheDurationLabel, clearLinkCache, linkCacheHours } from './core/link-cache.js';
import { trailerDelayRange } from './core/trailer.js';
import { bufferRanges, readBufferSeconds, readWaitTimeout } from './core/buffer.js';
import { readTrackingSettings, saveTrackingSettings } from './core/mdblist-tracking.js';
import { readRatingsSettings } from './core/ratings.js';
import { mediaTransportLimits, readMediaTransport, transportLabel } from './core/media-service.js';
import { themes, settingsStyles, readAppearance } from './core/appearance.js';
export const settingsCategories = Object.freeze([
  { id: 'account', title: 'Conta', subtitle: 'Conta e status de sincronização', icon: 'profile' },
  { id: 'profiles', title: 'Perfis', subtitle: 'Gerenciar perfis de usuário', icon: 'profile' },
  { id: 'appearance', title: 'Aparência', subtitle: 'Escolha seu tema de cores, fonte e idioma', icon: 'appearance' },
  { id: 'layout', title: 'Layout', subtitle: 'Estrutura da página inicial e estilos de pôster', icon: 'library' },
  { id: 'discovery', title: 'Conteúdo e Descoberta', subtitle: 'Add-ons, plugins, catálogos e fontes de descoberta', icon: 'search' },
  { id: 'integration', title: 'Integrações', subtitle: 'Gerenciar integrações disponíveis', icon: 'link' },
  { id: 'playback', title: 'Reprodução', subtitle: 'Player, legendas e reprodução automática', icon: 'play' },
  { id: 'tracking', title: 'Rastreamento', subtitle: 'Gerenciar conexões com Trakt e Simkl', icon: 'sync' },
  { id: 'about', title: 'Sobre', subtitle: 'Versão e políticas', icon: 'info' },
  { id: 'advanced', title: 'Avançado', subtitle: 'Desempenho, navegação, cache e diagnósticos', icon: 'settings' }
]);
// LayoutSettingsScreen.kt groups and CompactToggleRow labels.
const layoutToggles = [
  ['landscapePosters', 'Pôsteres Horizontais', 'Alterne os pôsteres para o formato horizontal.'],
  ['fullBackdrop', 'Fundo em tela cheia', 'Expanda o fundo do modo Moderno por toda a tela.'],
  ['modernSidebar', 'Barra lateral moderna', 'Ative a navegação lateral flutuante.'],
  ['sidebarBlur', 'Desfoque no menu lateral', 'Ative o efeito de desfoque (blur) no menu.'],
  ['hideSidebar', 'Recolher barra lateral', 'Esconda o menu; exiba-o apenas ao focar.'],
  ['posterLabels', 'Títulos nos pôsteres', 'Exiba os títulos abaixo das imagens e grades.'],
  ['catalogAddonName', 'Nome do addon', 'Mostre o nome do addon abaixo dos títulos.'],
  ['catalogType', 'Tipo de conteúdo', 'Indique se é Filme ou Série ao lado do subtítulo.']
];
const continueStyles = [['card', 'Cartão'], ['wide', 'Amplo'], ['poster', 'Pôster']];
// PlayerSettings / AutoSkipSegmentType. Only rows the webOS player really obeys.
const segmentTypes = [['intro', 'Aberturas', 'Pula aberturas e intros automaticamente'], ['recap', 'Resumo anterior', 'Pula o resumo do episódio anterior'], ['outro', 'Créditos', 'Pula os créditos automaticamente']];
export function settingsScreen(context) {
  const { main, el, button, icon, state, persist, navigate, toast, route, account, layout, applyLayout, applyAppearance, signOutProfiles, syncAccount, syncSummary, outboundSummary, historySummary, metadata, ratings, clearMetadataCache, textDialog, profileName, switchProfile, version, base } = context;
  const content = el('div', { class: 'settings-content' });
  const play = () => state.settings.playback = readPlayback(state.settings.playback);
  const updatePlayback = patch => { state.settings.playback = { ...play(), ...patch }; persist(); };
  const appearance = () => readAppearance(state.settings.appearance);
  const updateAppearance = patch => { state.settings.appearance = { ...appearance(), ...patch }; persist(); applyAppearance(state.settings.appearance); };
  const row = (title, subtitle, action, options = {}) => {
    const children = [options.leading ? icon(options.leading) : null, el('span', { class: 'grow' }, el('strong', {}, title), subtitle ? el('small', { class: 'muted' }, subtitle) : null), options.value ? el('span', { class: 'settings-value' }, options.value) : null];
    if (options.pending) children.push(el('span', { class: 'settings-pending' }, 'Pendente'));
    else children.push(icon(options.trailing || 'next'));
    return button(children, options.pending ? () => toast(options.pendingMessage || 'Ainda depende do Android. Veja a nota no fim do ajuste.') : action, { class: 'settings-row settings-action', 'aria-label': [title, options.value].filter(Boolean).join(' · '), ...options.attrs });
  };
  const toggle = (title, subtitle, read, change, options = {}) => {
    const node = button([el('span', { class: 'grow' }, el('strong', {}, title), subtitle ? el('small', { class: 'muted' }, subtitle) : null), el('span', { class: 'switch-track', 'aria-hidden': true })], () => {
      const next = !read(); change(next); node.setAttribute('aria-checked', String(next));
    }, { class: 'settings-row settings-toggle', role: 'switch', 'aria-label': title, 'aria-checked': String(read()), ...options.attrs });
    return node;
  };
  const group = (title, subtitle, ...rows) => el('section', { class: 'settings-group' },
    title ? el('h2', { class: 'settings-group-title' }, title) : null,
    subtitle ? el('p', { class: 'muted settings-group-subtitle' }, subtitle) : null,
    el('div', { class: 'settings-group-rows' }, ...rows.filter(Boolean)));
  const note = message => el('p', { class: 'settings-note muted' }, message);
  const header = (title, subtitle) => el('header', { class: 'settings-header' }, el('h1', {}, title), el('span', { class: 'settings-header-bar', 'aria-hidden': true }), subtitle ? el('p', { class: 'muted' }, subtitle) : null);
  const chip = (label, selected, action, description) => button([el('span', { class: 'chip-dot', 'aria-hidden': true }), el('span', {}, label)], action, { class: 'settings-choice', 'aria-label': label, 'aria-pressed': String(selected), 'aria-description': description || null });
  const card = (label, value) => el('div', { class: 'settings-status-card' }, el('small', { class: 'muted' }, label), el('strong', {}, value));
  // PlayerSettings SliderSettingsItem: the movie recommendation threshold, 80–100%.
  const threshold = (label, delta) => button(delta < 0 ? '−' : '+', () => {
    const prefs = play(), next = Math.max(postPlayThresholdRange[0], Math.min(postPlayThresholdRange[1], prefs.postPlayMovieThreshold + delta));
    if (next === prefs.postPlayMovieThreshold) return;
    updatePlayback({ postPlayMovieThreshold: next });
    redraw(`button[aria-label="${label}"]`);
  }, { class: 'settings-threshold-step', 'aria-label': label, disabled: delta < 0 ? play().postPlayMovieThreshold <= postPlayThresholdRange[0] : play().postPlayMovieThreshold >= postPlayThresholdRange[1] });
  // Create-outside-the-detail-pane dialogs: the fork's confirmation and text dialogs.
  function confirm(title, message, confirmLabel, onConfirm) {
    const previous = document.activeElement;
    const sheet = el('div', { class: 'app-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title, onkeydown: event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } } });
    const close = () => { sheet.remove(); previous?.focus({ preventScroll: true }); };
    const cancel = button('Cancelar', close, { 'data-dismiss': true });
    const accept = button(confirmLabel, async () => { accept.disabled = true; try { await onConfirm(); close(); } catch (error) { accept.disabled = false; toast(error.message); } }, { class: 'primary' });
    sheet.append(el('section', { class: 'dialog-panel' }, el('h2', {}, title), el('p', { class: 'dialog-copy' }, message), el('div', { class: 'toolbar' }, cancel, accept)));
    document.querySelector('#app').append(sheet); cancel.focus();
  }
  // SettingsTextInputDialog: a single field, like the fork's on-screen keyboard.
  function prompt(title, message, value, onSave) {
    const previous = document.activeElement;
    const input = el('input', { type: 'text', value: value || '', maxlength: 200, spellcheck: 'false', autocomplete: 'off', 'aria-label': title, placeholder: 'Nenhuma palavra definida. Ex: 4K|2160p|Remux', onkeydown: event => { if (event.key !== 'Enter') return; event.preventDefault(); accept(); } });
    const sheet = el('div', { class: 'app-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title, onkeydown: event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } } });
    const close = () => { sheet.remove(); previous?.focus({ preventScroll: true }); };
    const accept = () => { onSave(input.value); close(); };
    sheet.append(el('section', { class: 'dialog-panel' }, el('h2', {}, title), el('p', { class: 'dialog-copy' }, message), input,
      el('div', { class: 'toolbar' }, button('Cancelar', close, { 'data-dismiss': true }), button('Salvar', accept, { class: 'primary' }))));
    document.querySelector('#app').append(sheet); input.focus();
  }
  function renderAccount() {
    if (account.user) {
      const syncStatus = el('p', { class: 'account-sync-status settings-note muted', role: 'status' }, state.accountSync?.at ? syncSummary(state.accountSync) : 'Sincronize para carregar os addons da sua conta.');
      const sync = row('Sincronizar addons', 'Carregar os addons da conta nesta TV', async () => {
        if (sync.disabled) return; sync.disabled = true; syncStatus.textContent = 'Carregando addons da conta…';
        try { syncStatus.textContent = syncSummary(await syncAccount()); }
        catch (error) { syncStatus.textContent = error.message; }
        finally { sync.disabled = false; }
      });
      return [
        card('Conectado', account.user.email),
        note('A sincronia não é em tempo real. Reinicie o app para atualizar as mudanças feitas em outros dispositivos.'),
        group('Sincronização', 'Addons, progresso e perfil desta TV', sync, syncStatus,
          row('Trocar perfil', profileName(), () => switchProfile(), { leading: 'profile' }),
          row('Sincronização', outboundSummary(state), () => navigate({ name: 'sync' })),
          row('Histórico e assistidos', historySummary(state), () => navigate({ name: 'history' }))),
        button('Sair da conta', () => confirm('Sair da conta?', 'Os addons importados da conta serão removidos desta TV. Seus outros dispositivos continuam conectados.', 'Sair desta TV', signOutProfiles), { class: 'settings-signout', 'aria-label': 'Sair da conta' })
      ];
    }
    return [
      group(null, null, row('Entrar com Nuvio', 'Vincular a TV pelo celular e carregar seus addons', () => navigate({ name: 'account-login' }), { leading: 'profile' })),
      note('A sincronia não é em tempo real. Reinicie o app para atualizar as mudanças feitas em outros dispositivos.')
    ];
  }
  function renderProfiles() {
    return [
      group(null, null,
        row(account.user ? 'Gerenciar perfis' : 'Entrar com Nuvio', account.user ? 'Selecionar, criar e editar perfis desta conta' : 'Vincular a conta para carregar seus perfis', () => account.user ? switchProfile() : navigate({ name: 'account-login' }), { leading: 'profile' })),
      note('Criação, edição de perfis e alteração de PIN ainda devem ser feitas no Nuvio de referência.')
    ];
  }
  // SettingsSingleChoiceDialog lives in the fork; the port only exposes read-only
  // values here, so the rows open a text dialog instead of a picker.
  function renderAppearance() {
    const prefs = appearance();
    const swatches = el('div', { class: 'theme-swatches', 'aria-label': 'Tema de Cores' });
    for (const theme of themes) {
      const chipNode = button([el('span', { class: 'theme-swatch', style: `--swatch:${theme.secondary};--swatch-gradient:linear-gradient(135deg,${theme.gradient.join(',')})`, 'aria-hidden': true }), el('span', { class: 'theme-name' }, theme.label)],
        () => { updateAppearance({ theme: theme.id }); paintSwatches(); },
        { class: `theme-chip${prefs.theme === theme.id ? ' selected-choice' : ''}`, 'aria-label': theme.label, 'aria-pressed': String(prefs.theme === theme.id), 'data-theme': theme.id });
      swatches.append(chipNode);
    }
    function paintSwatches() { const current = appearance().theme; for (const node of swatches.children) { const selected = node.dataset.theme === current; node.setAttribute('aria-pressed', String(selected)); node.classList.toggle('selected-choice', selected); } }
    // Estilo das Configurações only swaps classes on #app, so the chips repaint in place.
    const styleChips = settingsStyles.map(style => chip(style.label, prefs.style === style.id, () => { updateAppearance({ style: style.id }); paintStyles(); }, style.description));
    function paintStyles() { const chosen = appearance().style; settingsStyles.forEach((style, index) => { const selected = style.id === chosen; styleChips[index].setAttribute('aria-pressed', String(selected)); styleChips[index].classList.toggle('selected-choice', selected); }); }
    return [
      group('Tema de Cores', 'Escolha a cor de destaque usada no aplicativo', swatches,
        toggle('Modo AMOLED', 'Usar preto puro no plano de fundo do aplicativo', () => appearance().amoled, value => { updateAppearance({ amoled: value }); redraw('button[aria-label="Modo AMOLED"]'); }),
        prefs.amoled ? toggle('Superfícies em Preto Puro', 'Também aplica preto puro em cartões, painéis e menus', () => appearance().amoledSurfaces, value => updateAppearance({ amoledSurfaces: value })) : null),
      group('Estilo das Configurações', 'Escolha como deseja visualizar as telas de configuração', el('div', { class: 'settings-choices' }, ...styleChips)),
      group('Fonte e Idioma', 'Escolha o tipo de letra e o idioma usado em todo o app',
        row('Fonte do App', 'Inter está fixa nesta versão', () => textDialog('Fonte do App', 'O fork permite escolher entre as fontes empacotadas no Android. Este pacote traz a Inter original do fork e mantém uma única família para não alterar medidas já validadas na TV. A Netflix Sans continua fixa nas legendas.'), { value: 'Inter' }),
        row('Idioma do App', 'O port está apenas em português (Brasil)', () => textDialog('Idioma do App', 'O fork oferece o idioma do sistema e 35 localidades. Este port compila uma única localidade, português (Brasil).'), { value: 'Português (Brasil)' }))
    ];
  }
  function renderLayout() {
    const chips = continueStyles.map(([id, label]) => chip(label, layout.continueStyle === id, () => { layout.continueStyle = id; persist(); applyLayout(); paintStyles(); }, `Estilo ${label}`));
    function paintStyles() { continueStyles.forEach(([id], index) => { const selected = layout.continueStyle === id; chips[index].setAttribute('aria-pressed', String(selected)); chips[index].classList.toggle('selected-choice', selected); }); }
    return [
      group('Layout da Home', 'Escolha a estrutura e a fonte do destaque.', ...layoutToggles.slice(0, 2).map(layoutToggle)),
      group('Conteúdo da Home', 'Controle o que aparece na home e na busca.', ...layoutToggles.slice(2).map(layoutToggle)),
      group('Continuar Assistindo', 'Exibir a linha de Continuar Assistindo na tela inicial.',
        toggle('Mostrar Continuar Assistindo', 'Exibir a linha de Continuar Assistindo na tela inicial.', () => layout.continueWatching, value => { layout.continueWatching = value; persist(); applyLayout(); }),
        el('div', { class: 'settings-choices', 'aria-label': 'Estilo de Continuar Assistindo' }, ...chips))
    ];
  }
  function layoutToggle([key, title, description]) {
    return toggle(title, description, () => layout[key], value => { layout[key] = value; persist(); applyLayout(); });
  }
  function renderDiscovery() {
    return [
      group('Addons', 'Gerenciar add-ons, ordem dos catálogos e coleções',
        row('Addons', 'Instalar, atualizar e remover add-ons desta TV', () => navigate({ name: 'addons' }), { leading: 'search' }),
        row('Catálogos do início', 'Ordem e visibilidade neste perfil', () => navigate({ name: 'catalog-manager' })),
        row('Coleções', 'Criar fileiras extras na Home a partir de catálogos e do TMDB', () => navigate({ name: 'collections' }), { value: `${(state.collections || []).length} coleção(ões)` }),
        row('Descobrir', 'Explorar por tipo, catálogo e gênero', () => navigate({ name: 'discover' }))),
      group('Plugins', 'Repositórios e provedores de stream',
        row('Plugins', 'Gerenciar repositórios e provedores de stream', null, { pending: true, pendingMessage: 'Plugins do fork são módulos Android com binários próprios; eles não são carregados no webOS.' }))
    ];
  }
  function renderIntegration() {
    return [
      group(null, null,
        row('Debrid', 'Fontes de contas na nuvem (Experimental)', null, { pending: true, pendingMessage: 'Resolvedores Direct Debrid ainda não foram portados: a lista usa apenas as URLs diretas entregues pelos add-ons.' }),
        row('TMDB', metadata.configured() ? 'Controle de enriquecimento de metadados' : 'Configurar metadados complementares', () => navigate({ name: 'metadata-settings' }), { value: metadata.configured() ? 'Configurado' : 'Não configurado' }),
        row('Avaliações MDBList', 'Provedores externos de classificações', () => navigate({ name: 'ratings-settings' }), { value: ratings.configured() ? 'Configurado' : 'Não configurado' }))
    ];
  }
  function renderPlayback() {
    const pending = (title, subtitle, pendingMessage) => row(title, subtitle, null, { pending: true, pendingMessage });
    // PlayerSettings SliderSettingsItem for the trailer delay, 3–15 s like the fork.
    const delayStep = (label, delta) => button(delta < 0 ? '−' : '+', () => {
      const prefs = play(), next = Math.max(trailerDelayRange[0], Math.min(trailerDelayRange[1], prefs.trailerDelay + delta));
      if (next === prefs.trailerDelay) return;
      updatePlayback({ trailerDelay: next });
      redraw(`button[aria-label="${label}"]`);
    }, { class: 'settings-threshold-step', 'aria-label': label, disabled: delta < 0 ? play().trailerDelay <= trailerDelayRange[0] : play().trailerDelay >= trailerDelayRange[1] });
    const automationChip = (label, selected, action, description) => chip(label, selected, () => { action(); redraw(`button[aria-label="${label}"]`); }, description);
    // PlayerSettings SliderSettingsItem for the two durations the TV media element can
    // honour, plus the wait guard the fork applies before giving up on the buffer.
    const bufferBounds = { bufferInitial: bufferRanges.initial, bufferAfterRebuffer: bufferRanges.afterRebuffer, bufferWaitTimeout: [5, 60] };
    const bufferValue = key => key === 'bufferWaitTimeout' ? readWaitTimeout(play().bufferWaitTimeout) : readBufferSeconds(play()[key], key === 'bufferInitial' ? 'initial' : 'afterRebuffer');
    const bufferStep = (label, delta, key) => {
      const [min, max] = bufferBounds[key];
      const value = bufferValue(key);
      return button(delta < 0 ? '−' : '+', () => {
        const current = bufferValue(key), next = key === 'bufferWaitTimeout' ? readWaitTimeout(current + delta) : readBufferSeconds(current + delta, key === 'bufferInitial' ? 'initial' : 'afterRebuffer');
        if (next === current) return;
        updatePlayback({ [key]: next });
        redraw(`button[aria-label="${label}"]`);
      }, { class: 'settings-threshold-step', 'aria-label': label, disabled: delta < 0 ? value <= min : value >= max });
    };
    // Parallel range transport: connections, chunk size and the memory window of the local
    // service, in the same step-row grammar as the buffer values. The window must fit the
    // blocks in flight, so the window step never goes below connections × chunk.
    const transportPrefs = () => readMediaTransport(play());
    const transportStep = (label, delta, key, limits, suffix = '') => {
      const current = transportPrefs()[key];
      const [min, max] = limits;
      return button(delta < 0 ? '−' : '+', () => {
        const value = transportPrefs()[key];
        let next = Math.max(min, Math.min(max, value + delta));
        const patch = { mediaConnections: transportPrefs().connections, mediaChunkMb: transportPrefs().chunkMb, mediaWindowMb: transportPrefs().windowMb };
        patch[key === 'connections' ? 'mediaConnections' : key === 'chunkMb' ? 'mediaChunkMb' : 'mediaWindowMb'] = next;
        const window = readMediaTransport({ mediaConnections: patch.mediaConnections, mediaChunkMb: patch.mediaChunkMb, mediaWindowMb: patch.mediaWindowMb });
        // MemoryBudget: a cell that does not fit its window would evict blocks still in flight.
        if (!window.fitsWindow && key !== 'windowMb') patch.mediaWindowMb = Math.min(mediaTransportLimits.windowMb[1], window.cellMb * 4);
        if (!readMediaTransport(patch).fitsWindow) return;
        updatePlayback(patch);
        redraw(`button[aria-label="${label}"]`);
      }, { class: 'settings-threshold-step', 'aria-label': label, disabled: delta < 0 ? current <= min : current >= max });
    };
    // SettingsTextInputDialog: the fork stores the pattern as typed, so an invalid
    // expression is refused here instead of silently never matching a source.
    function promptRegex() {
      prompt('Filtro de palavras (Regex)', 'Reproduza a fonte que coincidir com as palavras-chave. Separe alternativas com | e exclua termos com um grupo negativo, como (?!(cam|ts)).', play().autoPlayRegex, value => {
        const pattern = value.trim();
        if (pattern && !compileRegex(pattern)) { toast('Expressão inválida; o filtro não foi salvo.'); return; }
        updatePlayback({ autoPlayRegex: pattern });
        redraw('[data-focus="playback-regex"]');
      });
    }
    return [
      group('Geral', 'Comportamento principal do player',
        toggle('Informações ao pausar', 'Detalhes após 5s de pausa', () => play().pauseOverlay, value => updatePlayback({ pauseOverlay: value })),
        toggle('Miniaturas ao buscar', 'Prévia dos trechos já reproduzidos; funciona até 4K.', () => play().seekThumbnails, value => updatePlayback({ seekThumbnails: value })),
        toggle('Pular introduções', 'Usar introdb.app para detectar aberturas e resumos', () => play().skipSegments, value => updatePlayback({ skipSegments: value })),
        toggle('Avisos de conteúdo', 'Exibir aviso de classificação indicativa ao iniciar a reprodução.', () => play().parentalGuide, value => updatePlayback({ parentalGuide: value }))),
      group('Pular automaticamente', 'Escolha quais trechos pular automaticamente', ...segmentTypes.map(([type, title, description]) => toggle(title, description, () => play().autoSkipTypes.includes(type), value => { const list = new Set(play().autoSkipTypes); value ? list.add(type) : list.delete(type); updatePlayback({ autoSkipTypes: [...list] }); }))),
      group('Player e Seleção de Fontes', 'Preferência, reprodução e filtros',
        toggle('Início rápido das fontes', 'Busca e ranqueia as fontes enquanto você lê os detalhes e abre a conexão no toque. São requisições aos seus add-ons; desligado, a lista é buscada só ao entrar nela.', () => play().prewarmStreams, value => updatePlayback({ prewarmStreams: value })),
        row('Idiomas e próximo episódio', 'Áudio, legendas e continuidade de séries', () => navigate({ name: 'playback-settings' }), { leading: 'play' }),
        row('Preferências de fontes', 'Filtros, grupos de release e reprodução automática', () => navigate({ name: 'preferences' }))),
      group('Legendas', 'Idioma, estilo e renderização',
        row('Aparência das legendas', 'Tamanho, cores, contorno e posição', () => navigate({ name: 'subtitle-appearance' })),
        pending('Renderização avançada', 'Usar libass para ASS/SSA', 'ASS/SSA com libass depende do decodificador Android; o webOS renderiza SRT e WebVTT.')),
      group('Buffer e Rede', 'Quanto conteúdo manter na memória e como buscar os streams.',
        toggle('Buffer de reprodução personalizado', 'Substitui o buffer padrão do player pelos valores abaixo. Se desativado, o player usa os valores padrão da TV.', () => play().customBuffer, value => { updatePlayback({ customBuffer: value }); redraw('button[aria-label="Buffer de reprodução personalizado"]'); }),
        play().customBuffer ? el('div', { class: 'settings-threshold' },
          el('span', { class: 'grow' }, el('strong', {}, 'Buffer inicial'), el('small', { class: 'muted' }, 'Quanto conteúdo deve ser carregado antes de iniciar a reprodução. Valores menores iniciam mais rápido, mas podem causar travamentos iniciais em conexões lentas.')),
          bufferStep('Diminuir buffer inicial', -1, 'bufferInitial'),
          el('span', { class: 'settings-threshold-value' }, `${play().bufferInitial}s`),
          bufferStep('Aumentar buffer inicial', 1, 'bufferInitial')) : null,
        play().customBuffer ? el('div', { class: 'settings-threshold' },
          el('span', { class: 'grow' }, el('strong', {}, 'Buffer após travamento'), el('small', { class: 'muted' }, 'Quanto conteúdo carregar após a reprodução travar por falta de buffer. Valores maiores reduzem interrupções repetidas.')),
          bufferStep('Diminuir buffer após travamento', -1, 'bufferAfterRebuffer'),
          el('span', { class: 'settings-threshold-value' }, `${play().bufferAfterRebuffer}s`),
          bufferStep('Aumentar buffer após travamento', 1, 'bufferAfterRebuffer')) : null,
        play().customBuffer ? el('div', { class: 'settings-threshold' },
          el('span', { class: 'grow' }, el('strong', {}, 'Tempo limite de espera'), el('small', { class: 'muted' }, 'Quanto esperar pelo buffer antes de iniciar assim mesmo.')),
          bufferStep('Diminuir tempo limite de espera', -5, 'bufferWaitTimeout'),
          el('span', { class: 'settings-threshold-value' }, `${play().bufferWaitTimeout}s`),
          bufferStep('Aumentar tempo limite de espera', 5, 'bufferWaitTimeout')) : null,
        play().customBuffer ? note('Estas configurações afetam o comportamento do buffer. Valores incorretos podem causar problemas na reprodução. O player nativo da TV só obedece a estas duas durações; os tamanhos em MB do Media3 não existem aqui.') : null,
        toggle('Serviço de mídia local', 'Busca as faixas do arquivo em paralelo, com os cabeçalhos da fonte, e entrega ao player por 127.0.0.1. Vale para arquivos HTTP(S) diretos; playlists HLS/DASH seguem diretas.', () => play().localMediaService, value => { updatePlayback({ localMediaService: value }); redraw('button[aria-label="Serviço de mídia local"]'); }),
        play().localMediaService ? el('div', { class: 'settings-threshold' },
          el('span', { class: 'grow' }, el('strong', {}, 'Conexões paralelas'), el('small', { class: 'muted' }, 'Quantas faixas do arquivo buscar ao mesmo tempo. Mais conexões ajudam quando uma só não alimenta o título.')),
          transportStep('Diminuir conexões paralelas', -1, 'connections', mediaTransportLimits.connections),
          el('span', { class: 'settings-threshold-value' }, String(transportPrefs().connections)),
          transportStep('Aumentar conexões paralelas', 1, 'connections', mediaTransportLimits.connections)) : null,
        play().localMediaService ? el('div', { class: 'settings-threshold' },
          el('span', { class: 'grow' }, el('strong', {}, 'Tamanho da faixa'), el('small', { class: 'muted' }, 'Tamanho de cada pedido parcial. Faixas maiores reduzem o número de requisições; menores começam a reproduzir mais rápido.')),
          transportStep('Diminuir tamanho da faixa', -1, 'chunkMb', mediaTransportLimits.chunkMb),
          el('span', { class: 'settings-threshold-value' }, `${transportPrefs().chunkMb} MB`),
          transportStep('Aumentar tamanho da faixa', 1, 'chunkMb', mediaTransportLimits.chunkMb)) : null,
        play().localMediaService ? el('div', { class: 'settings-threshold' },
          el('span', { class: 'grow' }, el('strong', {}, 'Janela na memória'), el('small', { class: 'muted' }, 'Quanto do arquivo pode ser guardado para voltar atrás sem baixar de novo. Precisa caber todas as faixas em paralelo.')),
          transportStep('Diminuir janela na memória', -8, 'windowMb', mediaTransportLimits.windowMb),
          el('span', { class: 'settings-threshold-value' }, `${transportPrefs().windowMb} MB`),
          transportStep('Aumentar janela na memória', 8, 'windowMb', mediaTransportLimits.windowMb)) : null,
        play().localMediaService ? note(`Configuração atual: ${transportLabel(transportPrefs())}. O serviço só abre a fonte quando ela responde a pedidos parciais (Range) e há memória para as faixas; fora disso o player usa a URL original. O HUD do player (ícone de informações) mostra o que foi medido.`) : null,
        row('Usar a varredura de transporte', 'Escolhe conexões e faixas medindo a fonte real', () => textDialog('Varredura de transporte', 'Abra um título, entre em Assistir e use “Varredura de transporte” na lista de fontes. O port testa combinações de conexões e faixas sobre a fonte melhor classificada, para no primeiro resultado que alimenta o título com folga (2× o bitrate) e oferece “Usar N× M MB” para aplicar no serviço de mídia local. Cada célula custa alguns MB da sua fonte, por isso a varredura é você quem pede.'), { value: 'Na lista de fontes' }),
        pending('Duração mínima e máxima do buffer', 'Quanto manter carregado antes e depois da posição atual', 'São janelas do Media3 em bytes; o player da TV decide o próprio buffer. O port controla apenas o início e a retomada.'),
        pending('Gerenciamento de uso de memória', 'Limita o buffer a uma parcela segura da memória do dispositivo', 'O orçamento de memória do ExoPlayer não existe no elemento de mídia da TV.'),
        pending('Cache em disco', 'Salva bytes baixados para voltar sem baixar de novo', 'O cache de disco do Media3 é um armazenamento próprio; o webOS usa o cache do navegador.'),
        pending('Rede personalizada (HTTP/2)', 'Negociação HTTP/2 e prioridades de fluxo', 'Conexões paralelas ficam no serviço local abaixo; HTTP/2 é do cliente OkHttp e a TV negocia o protocolo sozinha.'),
        pending('Memória nativa do ExoPlayer', 'Alocador off-heap e otimizações de busca', 'Recurso do ExoPlayer Android, sem equivalente no webOS.'),
        pending('Ajuste automático de taxa de quadros (AFR)', 'Alterar a taxa de atualização da tela conforme o vídeo', 'Um aplicativo web no webOS não pode trocar a frequência do painel; o recurso do fork é do modo Android.')),
      group('Reprodução automática', 'Fila, maratona e recomendações',
        toggle('Recomendações após assistir', 'Recomendar filmes e séries depois que assistir.', () => play().postPlayRecommendations, value => { updatePlayback({ postPlayRecommendations: value }); redraw('button[aria-label="Recomendações após assistir"]'); }),
        play().postPlayRecommendations ? el('div', { class: 'settings-threshold' },
          el('span', { class: 'grow' }, el('strong', {}, 'Quando mostrar as recomendações de filmes'), el('small', { class: 'muted' }, 'Episódios seguem o limite do próximo episódio.')),
          threshold('Diminuir limite de recomendações', -1, () => play().postPlayMovieThreshold <= postPlayThresholdRange[0]),
          el('span', { class: 'settings-threshold-value' }, `${play().postPlayMovieThreshold}%`),
          threshold('Aumentar limite de recomendações', 1, () => play().postPlayMovieThreshold >= postPlayThresholdRange[1])) : null,
        toggle('Reutilizar último link', 'Use o último link válido se o cache estiver ativo.', () => play().reuseLastLink, value => {
          // Turning the setting off drops the stored links instead of leaving them behind.
          if (!value) state.linkCache = clearLinkCache();
          updatePlayback({ reuseLastLink: value });
          redraw('button[aria-label="Reutilizar último link"]');
        }),
        play().reuseLastLink ? el('div', { class: 'settings-choices', 'aria-label': 'Duração do cache do link' },
          ...linkCacheHours.map(hours => automationChip(cacheDurationLabel(hours), play().reuseLastLinkHours === hours, () => updatePlayback({ reuseLastLinkHours: hours }), `Duração do cache do link: ${cacheDurationLabel(hours)}`))) : null,
        note('São guardados apenas o endereço direto e o nome da fonte escolhida, por título e por perfil. Sem cache, a TV pergunta a lista de fontes de novo.'),
        el('div', { class: 'settings-choices', 'aria-label': 'Seleção automática de fonte' },
          ...autoPlayModes.map(mode => automationChip(mode.label, play().autoPlayMode === mode.id, () => updatePlayback({ autoPlayMode: mode.id }), mode.description))),
        play().autoPlayMode === 'regex' ? row('Filtro de palavras (Regex)', 'Separe alternativas com | e exclua termos com um grupo negativo', () => promptRegex(), { value: play().autoPlayRegex || 'Nenhuma palavra definida', attrs: { 'data-focus': 'playback-regex' } }) : null,
        play().autoPlayMode === 'regex' ? note('Exemplo: 4K|2160p|Remux reproduz a primeira fonte que traga uma dessas palavras. (?!(cam|ts)) descarta as que trouxerem cam ou ts, como no fork.') : null,
        state.addons.length ? el('div', { class: 'settings-choices', 'aria-label': 'Addons permitidos' },
          automationChip('Todos os addons instalados', !play().autoPlayAddons.length, () => updatePlayback({ autoPlayAddons: [] }), 'Considera fontes de todos os addons instalados.'),
          ...state.addons.map(addon => {
            const name = addon.manifest.name;
            const selected = play().autoPlayAddons.includes(name);
            return automationChip(name, selected, () => {
              const list = new Set(play().autoPlayAddons);
              selected ? list.delete(name) : list.add(name);
              updatePlayback({ autoPlayAddons: [...list] });
            }, `Permitir fontes de ${name}`);
          })) : null,
        toggle('Trailer automático após assistir', 'Reproduzir automaticamente trailers nas telas de detalhes e após reprodução.', () => play().trailerAutoPlay, value => { updatePlayback({ trailerAutoPlay: value }); redraw('button[aria-label="Trailer automático após assistir"]'); }),
        play().trailerAutoPlay ? el('div', { class: 'settings-threshold' },
          el('span', { class: 'grow' }, el('strong', {}, 'Atraso do trailer'), el('small', { class: 'muted' }, 'Tempo parado no botão Assistir antes do trailer automático.')),
          delayStep('Diminuir atraso do trailer', -1),
          el('span', { class: 'settings-threshold-value' }, `${play().trailerDelay}s`),
          delayStep('Aumentar atraso do trailer', 1)) : null,
        play().trailerAutoPlay ? note('No webOS o trailer abre no aplicativo do YouTube da TV, não dentro do Nuvio. Sem trailer no TMDB, a janela de recomendações continua igual.') : null,
        play().postPlayRecommendations && !metadata.configured() ? note('As recomendações após assistir vêm do TMDB: salve sua chave em Integrações → TMDB para que a janela apareça no fim do filme.') : null)
    ];
  }
  const sourceLabels = { TRAKT: 'Trakt', SIMKL: 'Simkl', MDBLIST: 'MDBList', NUVIO_SYNC: 'Nuvio Sync' };
  function renderTracking() {
    // The fork reads WatchProgressSource from the profile settings blob; this TV keeps
    // the source the last history merge reported, defaulting to Nuvio Sync.
    const source = sourceLabels[state.historySync?.sourcePreference] || 'Nuvio Sync';
    return [
      group('Contas', 'Conectar e gerenciar serviços de rastreamento',
        row('Trakt', 'Conectar ou gerenciar conta Trakt', null, { pending: true, value: 'Não conectado', pendingMessage: 'O login OAuth do Trakt acontece no app Android; o port lê apenas a fonte escolhida nesta conta.' }),
        row('Simkl', 'Configurações específicas do Simkl', null, { pending: true, value: 'Não conectado', pendingMessage: 'O login OAuth do Simkl acontece no app Android; o port lê apenas a fonte escolhida nesta conta.' })),
      group('MDBList', 'Acompanhamento de progresso e assistidos (MDBListTrackingProvider)',
        toggle('Acompanhar no MDBList', 'Envia início, pausa e fim de reprodução para a sua conta MDBList, usando a mesma chave das avaliações.', () => readTrackingSettings(localStorage).tracking, value => { saveTrackingSettings(localStorage, { tracking: value }); redraw('button[aria-label="Acompanhar no MDBList"]'); }),
        row('Chave do MDBList', 'Usada pelas avaliações e pelo acompanhamento', () => navigate({ name: 'ratings-settings' }), { value: readRatingsSettings(localStorage).key ? 'Configurada' : 'Não configurada' }),
        row('Último envio', 'Diagnóstico do acompanhamento', () => textDialog('Acompanhamento MDBList', `${state.mdblistTracking ? `Ação: ${state.mdblistTracking.action} · ${state.mdblistTracking.item} · HTTP ${state.mdblistTracking.status ?? '—'}${state.mdblistTracking.outcome ? ` (${state.mdblistTracking.outcome})` : ''}` : 'Nenhum envio ainda nesta TV.'}\n\nRegras do fork: título sem IMDb/TMDB não é enviado; um stop com 80% ou mais marca assistido e abaixo disso fica uma sessão pausada; 404 (fora do banco do MDBList) e 429 (limite diário) não são repetidos; 5xx é repetido até duas vezes. O progresso vai truncado em duas casas.`), { value: state.mdblistTracking?.status ? `HTTP ${state.mdblistTracking.status}` : '—' })),
      group('Fontes', 'Escolha de onde o Nuvio lê sua biblioteca e progresso de reprodução. O scrobbling é enviado para todos os serviços conectados.',
        row('Progresso de assistidos', 'Fonte usada para retomar e Continuar Assistindo', () => textDialog('Progresso de assistidos', `Fonte lida do seu perfil Nuvio: ${source}. A escolha é feita no app de referência e chega nesta TV pela sincronização da conta.`), { value: source }),
        row('Biblioteca', 'Fonte usada para a biblioteca e favoritos', () => textDialog('Biblioteca', `O port grava a biblioteca no perfil Nuvio desta TV e reproduz a fonte informada pela conta: ${source}.`), { value: source })),
      group('Nuvio', 'Sincronização nativa desta conta',
        row('Sincronização Nuvio', outboundSummary(state), () => navigate({ name: 'sync' })),
        row('Histórico e assistidos', historySummary(state), () => navigate({ name: 'history' })))
    ];
  }
  const licenses = 'Este pacote deriva de ysosrs123/NuvioTV-Fork · 45e0984, sob GPL-3.0. A fonte Inter é distribuída sob SIL Open Font License 1.1. Os dados de grupos de release vêm do TRaSH Guides, sob MIT. O código original e os avisos completos estão no repositório do port. Este port não é uma versão oficial dos mantenedores originais.';
  function renderAbout() {
    return [
      el('div', { class: 'settings-about' },
        el('img', { class: 'about-brand', src: 'assets/wordmark.png', alt: 'Nuvio' }),
        el('p', { class: 'muted' }, 'Feito com ❤️ por Tapframe e amigos'),
        el('p', { class: 'muted' }, `Versão ${version}`),
        el('p', { class: 'muted' }, base)),
      group(null, null,
        row('Política de Privacidade', 'Ler nossa política de privacidade', () => textDialog('Política de Privacidade', 'https://nuvio.tv/privacy-policy — a TV não permite abrir o navegador a partir deste pacote; o endereço fica registrado aqui e no site do Nuvio.'), { trailing: 'link' }),
        row('Licenças e Atribuições', 'Fontes de dados, agradecimentos e licenças', () => textDialog('Licenças e Atribuições', licenses)),
        row('Apoie o projeto', 'Apoie o projeto e veja os créditos da comunidade', null, { pending: true, pendingMessage: 'A tela de apoiadores do fork usa o catálogo de apoiadores do Android.' })),
      group(null, null, note('Port em desenvolvimento. Login Nuvio, perfis, biblioteca e histórico da conta estão disponíveis nesta TV. Integrações externas, plugins Android, debrid direto e ajustes de buffer continuam em adaptação.'))
    ];
  }
  function renderAdvanced() {
    const pending = (title, subtitle, pendingMessage) => row(title, subtitle, null, { pending: true, pendingMessage });
    return [
      group('Desempenho e navegação', 'Acelera a navegação nas fileiras',
        pending('Navegação horizontal rápida', 'Acelera a navegação nas fileiras', 'O ajuste do fork troca o passo de foco do Compose; o webOS usa a navegação geométrica do controle remoto.'),
        pending('Rolagem de foco Nuvio', 'Usa animação de foco personalizada do Nuvio', 'A animação de foco do fork é desenhada pelo Compose.'),
        pending('Lembrar último perfil selecionado', 'Abre com o último perfil usado ao iniciar o app', 'A escolha de perfil nesta TV passa pela conta Nuvio e continua exigindo confirmação.')),
      group('Diagnóstico', 'Versão e dados desta instalação',
        row('Versão do app', 'Pacote instalado nesta TV', () => textDialog('Versão do app', `Nuvio Fork para webOS ${version}\n${base}\nAlvo: LG 55UT8050 / webOS 25`), { value: version }),
        row('Addons instalados', 'Add-ons desta TV', () => textDialog('Addons instalados', state.addons.map(addon => `${addon.manifest.name} · ${new URL(addon.url).hostname}`).join('\n') || 'Nenhum add-on instalado.'), { value: String(state.addons.length) }),
        row('Teste de velocidade', 'Mede a fonte real pelo mesmo transporte do player', () => textDialog('Teste de velocidade', 'Abra um título, entre em Assistir e use “Testar velocidade” na lista de fontes. A medição roda sobre a fonte HTTP(S) real, com um orçamento de poucos MB por fonte, e não altera a ordem da lista nem a escolha automática.'), { value: 'Na lista de fontes' })),
      group('Cache', 'Apaga dados carregados nesta sessão',
        row('Limpar cache de metadados', 'Apaga biografias e capas carregadas nesta sessão', () => { clearMetadataCache(); toast('Cache limpo.'); }),
        pending('Limpar cache de imagens', 'Apaga imagens guardadas pelo app Android', 'As imagens no webOS usam o cache do navegador da TV.'))
    ];
  }
  const renderers = { account: renderAccount, profiles: renderProfiles, appearance: renderAppearance, layout: renderLayout, discovery: renderDiscovery, integration: renderIntegration, playback: renderPlayback, tracking: renderTracking, about: renderAbout, advanced: renderAdvanced };
  let current = settingsCategories.find(category => category.id === route.category) || settingsCategories[0];
  const rail = el('nav', { class: 'settings-rail', 'aria-label': 'Categorias de ajustes' }, ...settingsCategories.map(category => button([icon(category.icon), el('span', {}, category.title)], () => select(category), { class: 'settings-tab', 'data-category': category.id, 'aria-label': category.title })));
  const workspace = el('div', { class: 'settings-workspace' }, rail, content);
  function select(category) {
    current = category; route.category = category.id;
    for (const tab of rail.children) tab.classList.toggle('selected', tab.dataset.category === category.id);
    const draw = renderers[category.id];
    content.replaceChildren(header(category.title, category.subtitle), ...(draw ? draw() : [note('Esta categoria do fork ainda não está disponível no port para webOS.')]));
    content.scrollTop = 0;
  }
  // Rebuilds only the detail pane, so a change that adds or removes rows keeps focus.
  // Rebuilds only the detail pane, so a change that adds or removes rows keeps focus and
  // the reader's place: resetting scrollTop here threw the user back to the first group.
  function redraw(selector) {
    const scroll = content.scrollTop;
    select(current);
    content.scrollTop = scroll;
    if (selector) content.querySelector(selector)?.focus({ preventScroll: true });
  }
  main.append(workspace);
  select(current);
}