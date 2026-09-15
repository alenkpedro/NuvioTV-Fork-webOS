// SPDX-License-Identifier: GPL-3.0-only
// The pieces every settings-like screen uses: header, group cards, rows, switches, chips,
// field cards and the fork's dialogs. The settings workspace (SettingsDesignSystem) is the
// reference; the older screens (MDBList, TMDB, Idiomas e próximo episódio) use the same kit
// now, so they stop looking like a different app.
export function createSettingsKit({ el, button, icon = () => null, toast = () => {} }) {
  const header = (title, subtitle) => el('header', { class: 'settings-header' }, el('h1', {}, title), el('span', { class: 'settings-header-bar', 'aria-hidden': true }), subtitle ? el('p', { class: 'muted' }, subtitle) : null);
  const note = message => el('p', { class: 'settings-note muted' }, message);
  const group = (title, subtitle, ...rows) => el('section', { class: 'settings-group' },
    title ? el('h2', { class: 'settings-group-title' }, title) : null,
    subtitle ? el('p', { class: 'muted settings-group-subtitle' }, subtitle) : null,
    el('div', { class: 'settings-group-rows' }, ...rows.filter(Boolean)));
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
  const chip = (label, selected, action, description) => button([el('span', { class: 'chip-dot', 'aria-hidden': true }), el('span', {}, label)], action, { class: 'settings-choice', 'aria-label': label, 'aria-pressed': String(selected), 'aria-description': description || null });
  const choices = (label, ...items) => el('div', { class: 'settings-choices', 'aria-label': label }, ...items);
  const card = (label, value) => el('div', { class: 'settings-status-card' }, el('small', { class: 'muted' }, label), el('strong', {}, value));
  // A card with a label, a description, a control and its actions — the shape an API key
  // needs, instead of a bare label+input that the TV keyboard cannot drive.
  const field = ({ title, subtitle, control, actions = [], status, hint }) => el('div', { class: 'settings-field' },
    el('div', { class: 'settings-field-head' }, el('strong', {}, title), subtitle ? el('small', { class: 'muted' }, subtitle) : null),
    control,
    actions.length || hint ? el('div', { class: 'settings-field-actions' }, ...actions, hint || null) : null,
    status || null);
  // SettingsSingleChoiceDialog: a list of buttons the remote can walk.
  const choice = (title, options, onPick) => {
    const previous = document.activeElement;
    const sheet = el('div', { class: 'app-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': title });
    const close = () => { sheet.remove(); previous?.focus({ preventScroll: true }); };
    sheet.append(el('section', { class: 'dialog-panel' }, el('h2', {}, title),
      el('div', { class: 'collection-choices' }, ...options.map(option => button(option.label, () => { close(); onPick(option); }, { class: 'collection-choice', 'aria-label': option.label, 'aria-description': option.description || null }))),
      el('div', { class: 'toolbar' }, button('Cancelar', close, { 'data-dismiss': true }))));
    document.querySelector('#app').append(sheet);
    sheet.querySelector('.collection-choice')?.focus();
  };
  return { header, note, group, row, toggle, chip, choices, card, field, choice };
}
