// SPDX-License-Identifier: GPL-3.0-only
// ui/screens/settings/LibraryTransferFlow.kt: pick a source, pick a destination, review a
// dry-run plan (nothing is written yet), then confirm Copy or Move. The plan itself lives in
// core/library-transfer.js; this screen only collects the choices and shows the counts.
import { entriesForLibrary, planIsEmpty, planSummary, planTransfer, removeKeysForMove, transferSourceLabels } from './core/library-transfer.js';
import { createSettingsKit } from './settings-kit.js';
export function libraryTransferScreen({ main, el, button, icon, toast, state, persist, navigate, profileAccess, loadAccountLibrary, applyLibraryEntries, removeLibraryKeys, requestSync }) {
  const kit = createSettingsKit({ el, button, icon, toast });
  const pane = el('div', { class: 'settings-pane' });
  let source = 'tv', destination = 'account', plan = null, busy = false, status = '';
  const available = id => id === 'tv' ? Boolean(Object.keys(state.library || {}).length) : Boolean(profileAccess);
  const unavailableReason = id => id === 'tv' ? 'A biblioteca desta TV está vazia: salve um título primeiro.' : 'Entre na conta Nuvio para usar a conta nesta transferência.';
  const modeLabel = id => transferSourceLabels[id];
  function draw() {
    const sourceEntries = source === 'tv' ? Object.values(state.library || {}) : null;
    pane.replaceChildren(
      kit.header('Transferência de biblioteca', 'Copie ou mova favoritos entre a biblioteca desta TV e a sua conta Nuvio. O plano aparece antes de qualquer escrita.'),
      kit.group('Origem', 'De onde as entradas saem',
        kit.row(`Origem: ${modeLabel(source)}`, available(source) ? 'Toque para trocar' : unavailableReason(source), () => pick('source'))),
      kit.group('Destino', 'Para onde as entradas vão',
        kit.row(`Destino: ${modeLabel(destination)}`, available(destination) ? 'Toque para trocar' : unavailableReason(destination), () => pick('destination'))),
      plan
        ? kit.group('Revisão (nada foi escrito)', planSummary(plan),
          kit.row('A escrever', `${plan.toWrite.length} entrada(s)`, () => kit.prompt('A escrever', 'Títulos que serão gravados no destino.', plan.toWrite.map(entry => `${entry.name} (${entry.type})`).join('\n'), () => {}), { value: String(plan.toWrite.length) }),
          kit.row('Já presentes no destino', 'Ignoradas', null, { value: String(plan.alreadyPresent) }),
          kit.row('Sem IMDb/TMDB', 'Não podem ser resolvidas no destino', null, { value: String(plan.unmatched) }),
          kit.row('Duplicadas na origem', 'Contadas uma vez', null, { value: String(plan.duplicates) }))
        : kit.note('Escolha a origem e o destino e toque em Revisar transferência.'),
      el('div', { class: 'toolbar' },
        button('Revisar transferência', () => review(), { class: 'primary', disabled: busy || !sourceEntriesAvailable() }),
        plan && !planIsEmpty(plan) ? button('Copiar agora', () => confirm('copy'), { disabled: busy }) : null,
        plan && !planIsEmpty(plan) ? button('Mover agora', () => confirm('move'), { disabled: busy }) : null,
        button('Voltar', () => navigate({ name: 'settings', category: 'account' }, true))),
      status ? el('p', { class: 'muted', role: 'status' }, status) : null,
      kit.note('Trakt, Simkl e MDBList não aparecem como origem/destino nesta TV: o login desses serviços acontece no app Android e a leitura do MDBList ainda não foi portada. Copiar para a conta entra na fila de envio do Nuvio; mover também remove da origem.'));
  }
  const sourceEntriesAvailable = () => available(source) && available(destination);
  function pick(which) {
    const options = ['tv', 'account'].map(id => ({ value: id, label: modeLabel(id), description: available(id) ? 'Disponível' : unavailableReason(id) }));
    kit.choice(which === 'source' ? 'Origem' : 'Destino', options, option => {
      if (which === 'source') { if (option.value === destination) destination = source; source = option.value; }
      else { if (option.value === source) source = destination; destination = option.value; }
      plan = null; draw();
    });
  }
  async function review() {
    busy = true; status = 'Lendo a origem…'; draw();
    try {
      const sourceEntries = source === 'tv' ? Object.values(state.library || {}) : await loadAccountLibrary();
      const destinationEntries = destination === 'tv' ? Object.values(state.library || {}) : await loadAccountLibrary();
      plan = planTransfer({ source: sourceEntries || [], destination: destinationEntries || [], mode: 'copy' });
      status = planSummary(plan);
    } catch (error) {
      plan = null; status = `Não foi possível ler a origem: ${error.message}`;
    } finally { busy = false; draw(); }
  }
  function confirm(mode) {
    const chosen = { ...plan, mode };
    const entries = entriesForLibrary(chosen);
    busy = true;
    try {
      applyLibraryEntries(entries);
      if (mode === 'move') removeLibraryKeys(removeKeysForMove(chosen));
      persist();
      plan = null; busy = false;
      status = `${mode === 'move' ? 'Movidas' : 'Copiadas'} ${entries.length} entrada(s).${destination === 'account' ? ' O envio à conta entra na fila do Nuvio.' : ''}`;
      if (destination === 'account') requestSync?.();
      draw();
      toast(status);
    } catch (error) {
      busy = false; status = `Falha na transferência: ${error.message}`; draw();
    }
  }
  main.append(el('div', { class: 'settings-workspace settings-workspace-single' }, pane));
  draw();
}
