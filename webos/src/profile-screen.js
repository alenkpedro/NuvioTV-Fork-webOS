// SPDX-License-Identifier: GPL-3.0-only
export async function profileScreen(main, signal, { account, el, button, poster, choose, signOut, automatic }) {
  main.append(el('img', { class: 'profile-wordmark', src: 'assets/wordmark.png', alt: 'Nuvio' }), el('h1', {}, 'Quem está assistindo?'), el('p', { class: 'profile-subtitle' }, 'Escolha seu perfil para continuar'));
  const grid = el('div', { class: 'profile-grid' }), status = el('p', { class: 'profile-status', role: 'status' }, 'Carregando perfis…');
  const refresh = button('Atualizar perfis', () => load(false)), exit = button('Sair desta TV', signOut);
  main.append(grid, status, el('div', { class: 'toolbar profile-actions' }, refresh, exit));
  let working = false;
  const busy = value => { working = value; refresh.disabled = value; grid.querySelectorAll('button').forEach(b => b.disabled = value); };
  async function activate(profile) {
    busy(true); status.textContent = `Carregando ${profile.name}…`;
    try { await choose(profile, signal); }
    catch (error) { if (!signal.aborted) { status.textContent = error.message; busy(false); } }
  }
  function pinDialog(profile, trigger) {
    const controller = new AbortController();
    const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
    const dialog = el('div', { class: 'profile-pin-shade', role: 'dialog', 'aria-modal': 'true', 'aria-label': `PIN de ${profile.name}` });
    const pin = el('input', { type: 'password', maxlength: 4, inputmode: 'numeric', autocomplete: 'off', 'aria-label': 'PIN de quatro números' });
    const feedback = el('p', { role: 'status', class: 'pin-status' }, 'Digite seu PIN de quatro números.');
    let pending = false, until = profile.lockedUntil, ticker;
    const close = () => { clearInterval(ticker); pin.value = ''; abort(); signal.removeEventListener('abort', abort); dialog.remove(); if (trigger.isConnected) trigger.focus(); };
    const submit = button('Entrar', verify, { class: 'primary', type: 'button' });
    const cancel = button('Cancelar', close, { 'data-dismiss': true });
    const keypad = el('div', { class: 'pin-keypad' });
    for (const digit of ['1','2','3','4','5','6','7','8','9','Apagar','0']) keypad.append(button(digit, () => {
      if (pending || Date.now() < until) return;
      pin.value = digit === 'Apagar' ? pin.value.slice(0, -1) : (pin.value + digit).slice(0, 4);
    }, { 'aria-label': digit }));
    const update = () => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      submit.disabled = pending || remaining > 0; pin.disabled = pending || remaining > 0;
      keypad.querySelectorAll('button').forEach(b => b.disabled = pending || remaining > 0);
      if (remaining) feedback.textContent = `Aguarde ${remaining} s antes de tentar novamente.`;
      else if (feedback.textContent.startsWith('Aguarde')) feedback.textContent = 'Digite seu PIN de quatro números.';
    };
    async function verify() {
      if (pending || Date.now() < until) return;
      if (!/^\d{4}$/.test(pin.value)) { feedback.textContent = 'Informe quatro números.'; return; }
      pending = true; const value = pin.value; pin.value = ''; update();
      try {
        const result = await account.verifyPin(profile.id, value, controller.signal);
        if (controller.signal.aborted) return;
        if (result.unlocked) { close(); await activate(profile); return; }
        until = Date.now() + result.retryAfter * 1000;
        feedback.textContent = 'PIN incorreto. Tente novamente.';
      } catch (error) { if (!controller.signal.aborted) feedback.textContent = error.message; }
      finally { if (!controller.signal.aborted) { pending = false; update(); } }
    }
    const form = el('form', { class: 'profile-pin', onsubmit: event => { event.preventDefault(); verify(); } }, el('h2', {}, profile.name), pin, feedback, keypad, el('div', { class: 'toolbar' }, submit, cancel));
    dialog.append(form); main.append(dialog); update(); pin.focus(); ticker = setInterval(update, 1000);
    signal.addEventListener('abort', () => { clearInterval(ticker); pin.value = ''; dialog.remove(); }, { once: true });
  }
  async function select(profile, trigger) {
    if (working) return;
    busy(true); status.textContent = 'Verificando acesso ao perfil…';
    try {
      const fresh = (await account.profiles(signal)).find(p => p.id === profile.id);
      if (signal.aborted) return;
      if (!fresh) throw Error('Este perfil não está mais disponível. Atualize a lista.');
      busy(false); status.textContent = '';
      if (fresh.locked) pinDialog(fresh, trigger); else await activate(fresh);
    } catch (error) { if (!signal.aborted) { status.textContent = error.message; busy(false); } }
  }
  async function load(auto) {
    if (working) return; busy(true); status.textContent = 'Carregando perfis…';
    try {
      const profiles = await account.profiles(signal);
      if (signal.aborted) return;
      grid.replaceChildren(); grid.classList.toggle('compact-profiles', profiles.length > 4);
      for (const profile of profiles) {
        const avatar = poster(profile.avatar, profile.name, 'profile-avatar'); avatar.style.backgroundColor = profile.color;
        const card = button([avatar, el('strong', {}, profile.name), el('small', {}, profile.locked ? 'PIN necessário' : profile.id === 1 ? 'Principal' : '')], () => select(profile, card), { class: 'profile-card', 'data-initial-focus': profiles[0] === profile });
        grid.append(card);
      }
      busy(false); status.textContent = '';
      if (auto && profiles.length === 1 && !profiles[0].locked) await activate(profiles[0]);
      else grid.querySelector('button')?.focus();
    } catch (error) { if (!signal.aborted) { status.textContent = error.message; busy(false); refresh.focus(); } }
  }
  await load(automatic);
}
