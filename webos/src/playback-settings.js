// SPDX-License-Identifier: GPL-3.0-only
// PlayerSettings / PlayerNextEpisodeRules, presented with the same kit every other
// settings screen uses: header, groups, rows, switches and pickers.
import { readPlayback } from './core/playback.js';
import { createSettingsKit } from './settings-kit.js';
const languages = [['pt-br','Português (Brasil)'],['pt','Português'],['en','Inglês'],['es','Espanhol'],['fr','Francês'],['de','Alemão'],['it','Italiano'],['ja','Japonês'],['ko','Coreano'],['zh','Chinês'],['ru','Russo'],['ar','Árabe'],['hi','Hindi'],['nl','Holandês']];
export function playbackSettingsScreen({ main, settings, persist, el, button, icon, toast }) {
  const kit = createSettingsKit({ el, button, icon, toast });
  const pane = el('div', { class: 'settings-pane' });
  const prefs = () => settings.playback = readPlayback(settings.playback);
  const update = patch => { settings.playback = { ...prefs(), ...patch }; persist(); draw(); };
  const picker = (title, subtitle, key, options) => kit.row(title, subtitle, () => {
    kit.choice(title, options.map(([value, label]) => ({ value, label })), option => update({ [key]: option.value }));
  }, { value: options.find(([value]) => value === prefs()[key])?.[1] || prefs()[key] || '—' });
  const numeric = (title, subtitle, key, delta, min, max, suffix = '') => {
    const current = prefs()[key];
    const stepButton = sign => button(sign < 0 ? '−' : '+', () => {
      const next = Math.max(min, Math.min(max, Number((prefs()[key] + sign * delta).toFixed(1))));
      if (next === prefs()[key]) return;
      update({ [key]: next });
    }, { class: 'settings-threshold-step', 'aria-label': `${sign < 0 ? 'Diminuir' : 'Aumentar'} ${title.toLowerCase()}`, disabled: sign < 0 ? current <= min : current >= max });
    return el('div', { class: 'settings-threshold' },
      el('span', { class: 'grow' }, el('strong', {}, title), subtitle ? el('small', { class: 'muted' }, subtitle) : null),
      stepButton(-1), el('span', { class: 'settings-threshold-value' }, `${current}${suffix}`), stepButton(1));
  };
  function draw() {
    const p = prefs();
    const audioOptions = [['device','Idioma da TV'],['default','Padrão da fonte'],['original','Idioma original'],...languages];
    const subtitleOptions = [['device','Idioma da TV'],['off','Desativadas'],...languages];
    pane.replaceChildren(
      kit.header('Idiomas e próximo episódio', 'Áudio, legendas e continuidade de séries nesta TV.'),
      kit.group('Áudio', 'Faixa preferida quando a fonte oferece mais de uma',
        picker('Idioma do áudio', 'Escolha a faixa principal', 'audio', audioOptions),
        picker('Áudio secundário', 'Usado quando o principal não existe', 'secondaryAudio', [['','Nenhum'],...languages])),
      kit.group('Legendas', 'Idioma, forçadas e limpeza de texto',
        picker('Idioma das legendas', 'Faixa preferida ao abrir o título', 'subtitles', subtitleOptions),
        picker('Legenda secundária', 'Alternativa quando a principal não existe', 'secondarySubtitles', [['','Nenhuma'],...languages]),
        kit.toggle('Lembrar áudio e legendas por título', 'A escolha feita no player vale para este título neste perfil', () => prefs().rememberTracks, value => update({ rememberTracks: value })),
        kit.toggle('Legendas forçadas quando o áudio coincidir', 'Traduz só os trechos em outro idioma', () => prefs().forcedSubtitles, value => update({ forcedSubtitles: value })),
        kit.toggle('Mostrar só idiomas preferidos no painel', 'Esconde idiomas que você nunca escolhe', () => prefs().onlyPreferredSubtitles, value => update({ onlyPreferredSubtitles: value })),
        kit.toggle('Remover descrições SDH das legendas externas', 'Tira textos como [música] e nomes de falantes', () => prefs().stripSdh, value => update({ stripSdh: value })),
        kit.toggle('Buscar legendas de addons automaticamente', 'Procura legendas externas quando a fonte não tem a sua', () => prefs().addonSubtitles, value => update({ addonSubtitles: value }))),
      kit.note('Forçadas valem quando o áudio já está no idioma desejado. A limpeza SDH não altera legendas internas. Sem uma faixa compatível, o áudio da fonte é mantido.'),
      kit.group('Próximo episódio', 'Continuidade entre episódios',
        kit.toggle('Reproduzir próximo episódio automaticamente', 'Começa o episódio seguinte ao terminar', () => prefs().autoNext, value => update({ autoNext: value })),
        kit.toggle('Perguntar se ainda estou assistindo', 'Pausa e espera sua confirmação após os avanços automáticos', () => prefs().stillWatching, value => update({ stillWatching: value })),
        numeric('Avanços automáticos antes da confirmação', 'Só vale com a pergunta ligada', 'stillWatchingThreshold', 1, 2, 6),
        picker('Quando mostrar o próximo episódio', 'Por porcentagem assistida ou minutos antes do fim', 'thresholdMode', [['percentage','Porcentagem assistida'],['minutes','Minutos antes do fim']]),
        p.thresholdMode === 'minutes'
          ? numeric('Minutos antes do fim', 'Contagem regressiva do fim do episódio', 'thresholdMinutes', 0.5, 0, 3.5, ' min')
          : numeric('Porcentagem assistida', 'Percentual do episódio para abrir o próximo', 'thresholdPercent', 0.5, 97, 100, '%'),
        kit.toggle('Preferir o mesmo grupo de reprodução', 'Mantém addon e qualidade do episódio anterior', () => prefs().preferBingeGroup, value => update({ preferBingeGroup: value })),
        kit.toggle('Usar outra fonte se o grupo não estiver disponível', 'Sem isso, o seletor de fontes aparece', () => prefs().nextFallback, value => update({ nextFallback: value }))));
  }
  main.append(el('div', { class: 'settings-workspace settings-workspace-single' }, pane));
  draw();
}
