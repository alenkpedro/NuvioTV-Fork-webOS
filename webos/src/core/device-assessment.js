// SPDX-License-Identifier: GPL-3.0-only
// core/assessment/DeviceAssessmentEngine.kt + DeviceAssessmentApplier.kt at the fork's 45e0984,
// reduced to what this TV can measure and change. The fork's contract is kept: every
// recommendation says WHY it is there and where it came from — something measured, something
// derived from the hardware, a personal trade-off, or something the engine honestly cannot know.
// Nothing outside that list is touched, and Revert restores every previous value.
export const assessmentSources = Object.freeze({
  measured: 'medido', derived: 'do hardware', choice: 'escolha sua', unknown: 'não dá para saber aqui'
});
export const bufferProfiles = Object.freeze({
  small: { id: 'small', initial: 3, afterRebuffer: 2, label: 'leve' },
  medium: { id: 'medium', initial: 5, afterRebuffer: 3, label: 'equilibrado' },
  large: { id: 'large', initial: 8, afterRebuffer: 5, label: 'folgado' }
});
// The fork picks a buffer profile from how steady the link looked; the port uses the same
// signal — the sub-window coefficient of variation of the winning sweep cell.
export function bufferProfileFor(stability) {
  if (!Number.isFinite(stability)) return bufferProfiles.large;
  return stability <= 0.15 ? bufferProfiles.medium : bufferProfiles.large;
}
export const stabilityReason = stability => !Number.isFinite(stability)
  ? 'sem série de sub-janelas nesta varredura: mantive o perfil com folga'
  : stability <= 0.15
    ? 'as sub-janelas ficaram estáveis na varredura'
    : 'as sub-janelas oscilaram: um buffer maior absorve as quedas';
// Rows the fork assesses that have no webOS equivalent. They are listed with the reason instead
// of being silently dropped (the fork's own "what it can't honestly know" contract).
export function feasibilityRows() {
  return [
    { id: 'doviMode', label: 'Modo Dolby Vision', value: 'não existe nesta TV', source: 'unknown', reason: 'a TV não expõe perfis Dolby Vision nem conversão para o player web.' },
    { id: 'mediaConnections', label: 'Conexões do Media3', value: 'substituído pelas faixas do serviço local', source: 'unknown', reason: 'o número de conexões do ExoPlayer não existe aqui; o transporte local tem as suas.' },
    { id: 'nativeMemory', label: 'Memória nativa / off-heap', value: 'não existe', source: 'unknown', reason: 'alocador do ExoPlayer Android.' },
    { id: 'afr', label: 'Taxa de quadros automática (AFR)', value: 'não existe', source: 'unknown', reason: 'um aplicativo web no webOS não troca a frequência do painel.' },
    { id: 'passthrough', label: 'Passthrough por formato', value: 'não medido', source: 'unknown', reason: 'a TV não reporta ao app quais formatos de bitstream a saída aceita.' }
  ];
}


// buildAssessment(): takes the last transport sweep (measured by the sources screen and kept in
// the app state) and returns the rows plus the patch they imply. A row only becomes a setting
// when it came from a measurement or from the hardware.
export function buildAssessment({ sweep = null, playback = {} } = {}) {
  const rows = [];
  const best = sweep?.best || null;
  const meter = mbps => `${mbps.toFixed(mbps >= 10 ? 1 : 2).replace('.', ',')} Mbps`;
  if (!best || !(best.mbps > 0)) {
    rows.push({ id: 'transport', label: 'Transporte (conexões e faixas)', value: 'sem medição', source: 'unknown', reason: 'rode a Varredura de transporte na lista de fontes: sem ela não há número para recomendar.' });
  } else {
    rows.push({ id: 'transport', label: 'Transporte (conexões e faixas)', value: `${best.connections}× ${best.chunkMb} MB`, source: 'measured', reason: `melhor célula medida: ${meter(best.mbps)}${sweep.targetMbps ? ` (alvo ${sweep.targetMbps.toFixed(1).replace('.', ',')} Mbps)` : ''}.` });
    rows.push({
      id: 'mediaWindowMb', label: 'Janela na memória', source: 'derived',
      value: `${Math.max(Number(playback.mediaWindowMb) || 0, best.connections * best.chunkMb * 4)} MB`,
      reason: `quatro vezes as faixas em paralelo (${best.connections} × ${best.chunkMb} MB), o teto de memória que evita descartar blocos.`
    });
    const profile = bufferProfileFor(best.stability);
    rows.push({ id: 'buffer', label: 'Buffer inicial e após travamento', value: `${profile.initial} s / ${profile.afterRebuffer} s`, source: 'measured', reason: stabilityReason(best.stability) });
    rows.push({ id: 'customBuffer', label: 'Buffer de reprodução personalizado', value: 'ligado', source: 'choice', reason: 'é o que faz o buffer acima valer; desligado, o player volta à política da TV.' });
    if (best.connections > 1 || best.mbps >= 20) rows.push({ id: 'localMediaService', label: 'Serviço de mídia local', value: 'ligado', source: 'measured', reason: best.connections > 1 ? `esta fonte só rendeu com ${best.connections} conexões em paralelo.` : 'a fonte mediu acima de 20 Mbps e o serviço mantém a janela de blocos.' });
    if (sweep.targetMbps && best.mbps >= sweep.targetMbps) rows.push({ id: 'prewarmStreams', label: 'Início rápido das fontes', value: 'ligado', source: 'measured', reason: 'a fonte entrega o título com folga; abrir a conexão no toque não custa tráfego.' });
  }
  rows.push(...feasibilityRows());
  return { rows, at: Date.now(), sweepAt: sweep?.at || null, targetMbps: sweep?.targetMbps ?? null };
}
// The patch the measured/derived/choice rows imply. Unknown rows never become settings.
export function assessmentPatch(assessment) {
  const patch = {};
  for (const row of assessment?.rows || []) {
    if (row.source === 'unknown') continue;
    if (row.id === 'transport') {
      const match = /^(\d+)× (\d+) MB$/.exec(String(row.value));
      if (match) { patch.mediaConnections = Number(match[1]); patch.mediaChunkMb = Number(match[2]); }
    }
    if (row.id === 'mediaWindowMb') { const value = Number(String(row.value).replace(/[^\d]/g, '')); if (value > 0) patch.mediaWindowMb = value; }
    if (row.id === 'buffer') { const match = /^(\d+) s \/ (\d+) s$/.exec(String(row.value)); if (match) { patch.bufferInitial = Number(match[1]); patch.bufferAfterRebuffer = Number(match[2]); patch.customBuffer = true; } }
    if (['customBuffer', 'localMediaService', 'prewarmStreams'].includes(row.id) && row.value === 'ligado') patch[row.id] = true;
  }
  return patch;
}
export function assessmentSummary(assessment) {
  const rows = assessment?.rows || [];
  if (!assessment || !rows.length) return 'Nenhuma avaliação ainda.';
  const measured = rows.filter(row => row.source === 'measured').length;
  const unknown = rows.filter(row => row.source === 'unknown').length;
  return `${measured} recomendação(ões) a partir de medição · ${unknown} linha(s) sem equivalente webOS. Avaliação de ${new Date(assessment.at).toLocaleString('pt-BR')}.`;
}
