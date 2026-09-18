// SPDX-License-Identifier: GPL-3.0-only
// StreamSweepEngine.kt at the fork's 45e0984, reduced to the transport this port owns and to
// the settings it can actually change. The fork climbs an 8/16/32/64/128 MB chunk ladder with
// up to 16 connections because a phone-box data source can hold those buffers; here the
// ladder is the one the local media service is allowed to keep in memory, and every cell is
// gated by the same rule (connections × chunk must fit the window).
import { mediaTransportLimits } from './media-service.js';
export const sweepLadders = Object.freeze({
  chunks: Object.freeze([1, 2, 4, 8]),
  connections: Object.freeze([1, 2, 3, 4, 6, 8])
});
export const sweepLimits = Object.freeze({
  // The fork's hard cap is 12 passes with at most 2 after the target; each cell here pays at
  // least 2 MB of the user's traffic, so the cap is smaller and it is documented.
  maxCells: 8,
  extraCellsAfterTarget: 1,
  targetFactor: 2,
  sufficiencyTolerance: 0.95,
  zeroFloorOfBaseline: 0.05,
  economyBar: 1.1
});
export const cellFits = (connections, chunkMb, windowMb) => Number.isFinite(connections) && Number.isFinite(chunkMb) && Number.isFinite(windowMb) && connections * chunkMb <= windowMb;
export const cellCostMb = (connections, chunkMb) => connections * chunkMb;
export const cellLabel = (connections, chunkMb) => `${connections}× ${chunkMb} MB`;
// SUFFICIENCY: the fork compares the measured link against 2× the last title's average
// bitrate, so "meets the target" means "can feed this title with headroom".
export function sweepTarget(bitrateMbps) {
  return Number.isFinite(bitrateMbps) && bitrateMbps > 0 ? bitrateMbps * sweepLimits.targetFactor : null;
}
export function targetMet(mbps, targetMbps) {
  if (!(targetMbps > 0)) return null;
  return mbps >= targetMbps * sweepLimits.sufficiencyTolerance;
}
// Coefficient of variation of the sub-window series: the fork's stability measure. A burst
// that only lasts a moment should not look like a steady link.
export function stability(subWindows) {
  const list = (Array.isArray(subWindows) ? subWindows : []).filter(value => Number.isFinite(value) && value > 0);
  if (list.length < 2) return null;
  const mean = list.reduce((sum, value) => sum + value, 0) / list.length;
  if (!(mean > 0)) return null;
  const variance = list.reduce((sum, value) => sum + (value - mean) ** 2, 0) / list.length;
  return Math.sqrt(variance) / mean;
}
export const stabilityText = value => value === null ? 'sem série' : value <= 0.15 ? 'estável' : value <= 0.35 ? 'oscilando' : 'instável';
// The order the fork climbs: baseline (1 connection) → chunk ladder at 2 connections →
// connection ladder at the best chunk → neighbour refinement around the winner.
export function nextCells(best, ran) {
  const candidates = [];
  const push = (connections, chunkMb) => {
    if (!sweepLadders.connections.includes(connections) || !sweepLadders.chunks.includes(chunkMb)) return;
    if (ran.has(`${connections}:${chunkMb}`)) return;
    if (!candidates.some(cell => cell.connections === connections && cell.chunkMb === chunkMb)) candidates.push({ connections, chunkMb });
  };
  if (!ran.size) return [{ connections: 1, chunkMb: sweepLadders.chunks[0] }];
  if (!best) return [];
  const stage = ran.size;
  if (stage <= 1) return [{ connections: 2, chunkMb: sweepLadders.chunks[0] }];
  if (stage <= sweepLadders.chunks.length) {
    const chunkMb = sweepLadders.chunks[Math.min(stage - 1, sweepLadders.chunks.length - 1)];
    push(2, chunkMb);
    return candidates;
  }
  const connectionIndex = sweepLadders.connections.indexOf(best.connections);
  const chunkIndex = sweepLadders.chunks.indexOf(best.chunkMb);
  push(sweepLadders.connections[connectionIndex + 1] || best.connections, best.chunkMb);
  push(best.connections, sweepLadders.chunks[chunkIndex + 1] || best.chunkMb);
  push(best.connections, sweepLadders.chunks[chunkIndex - 1] || best.chunkMb);
  return candidates;
}
// The sweep: `measure` is injected (the service runs the transfer), `onCell` reports each row
// as it lands so the TV can show progress. Stop rules are the fork's: while the target is
// unmet every gain counts and a single regression gets one grace step; once it is met only
// ≥10% gains are adopted, and at most one further cell runs. Two collapses mean the source
// itself is limiting, and the climb stops.
export async function runSweep({ measure, windowMb, targetMbps = null, onCell = () => {}, signal, maxCells = sweepLimits.maxCells } = {}) {
  const rows = [], ran = new Set();
  let best = null, baselineMbps = 0, regressions = 0, passesSinceTarget = -1, collapses = 0, cells = 0;
  const met = mbps => targetMbps !== null && mbps >= targetMbps * sweepLimits.sufficiencyTolerance;
  const zeroFloor = () => Math.max(1, baselineMbps * sweepLimits.zeroFloorOfBaseline);
  while (cells < maxCells) {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    const candidate = nextCells(best, ran)[0];
    if (!candidate) break;
    const key = `${candidate.connections}:${candidate.chunkMb}`, label = cellLabel(candidate.connections, candidate.chunkMb);
    ran.add(key);
    cells++;
    if (!cellFits(candidate.connections, candidate.chunkMb, windowMb)) {
      const row = { ...candidate, label, mbps: 0, skipped: true, note: `não cabe na janela de ${windowMb} MB` };
      rows.push(row); onCell(row); continue;
    }
    onCell({ ...candidate, label, measuring: true });
    const result = await measure({ connections: candidate.connections, chunkMb: candidate.chunkMb, windowMb });
    const mbps = result?.ok ? Number(result.mbps) || 0 : 0;
    const row = { ...candidate, label, mbps, ok: Boolean(result?.ok), note: result?.ok ? null : result?.failure || 'sem medição', subWindows: result?.subWindows || [], stability: stability(result?.subWindows) };
    rows.push(row); onCell(row);
    if (cells === 1) baselineMbps = mbps;
    const collapsed = !row.ok || mbps <= 0;
    if (collapsed) {
      collapses++;
      // The fork ends the sweep when the single-connection baseline cannot transfer at all;
      // two collapsed parallel cells mean the source is limiting the climb.
      if (cells === 1) break;
      if (collapses >= 2) { row.note = row.note ? `${row.note} · fonte limitando` : 'fonte limitando o tráfego'; break; }
      continue;
    }
    if (!best) best = row;
    else if (targetMbps !== null && passesSinceTarget < 0) {
      // Below target: every Mbps matters, one bad rung is not a wall.
      if (row.mbps > best.mbps) { best = row; regressions = 0; }
      else { regressions++; if (regressions >= 2) break; }
    } else if (row.mbps > best.mbps * sweepLimits.economyBar) {
      best = row; regressions = 0;
    } else if (passesSinceTarget >= sweepLimits.extraCellsAfterTarget) break;
    if (met(mbps) && passesSinceTarget < 0) passesSinceTarget = 0;
    else if (passesSinceTarget >= 0) passesSinceTarget++;
    if (passesSinceTarget >= sweepLimits.extraCellsAfterTarget) break;
    // The fork stops the parallel search as soon as one connection already feeds the title.
    if (cells === 1 && met(baselineMbps)) break;
  }
  const verdict = sweepVerdict({ best, targetMbps, baselineMbps, rows, collapses, maxCells });
  return { rows, best, verdict, targetMbps, baselineMbps, cells, collapses, stoppedAtCap: cells >= maxCells };
}
export function sweepVerdict({ best, targetMbps, baselineMbps, rows = [], collapses = 0, maxCells = sweepLimits.maxCells }) {
  const meter = mbps => `${mbps.toFixed(mbps >= 10 ? 1 : 2).replace('.', ',')} Mbps`;
  const throttled = collapses >= 2 ? ' As células paralelas colapsaram depois disso: a fonte pode estar limitando o tráfego.' : '';
  if (!best || !(best.mbps > 0)) {
    const baseline = rows[0];
    if (baseline && baseline.ok === false && rows.length === 1) {
      return { text: `A fonte não respondeu na conexão única (${baseline.note || 'sem bytes'}). Nada foi medido e a lista de fontes continua igual.`, apply: false, rateLimited: false };
    }
    return {
      text: collapses >= 2
        ? 'A fonte limitou o tráfego: os blocos caíram seguidos. Tente outra fonte ou repita mais tarde.'
        : 'Nenhuma célula mediu o transporte dentro do orçamento. A lista de fontes continua igual.',
      apply: false, rateLimited: collapses >= 2
    };
  }
  const target = targetMbps ? `2× ${(targetMbps / 2).toFixed(2).replace('.', ',')} Mbps medidos no último título` : 'esta fonte';
  if (best.connections === 1) {
    return {
      text: `Uma conexão já alimenta o título (${meter(best.mbps)} ≥ ${target}). Deixe as conexões paralelas em 1: mais conexões não acrescentam aqui.${throttled}`,
      apply: true, settings: { connections: 1, chunkMb: best.chunkMb }, meetsTarget: targetMbps === null ? null : true, rateLimited: collapses >= 2
    };
  }
  const gain = baselineMbps > 0 ? Math.round((best.mbps / baselineMbps - 1) * 100) : null;
  return {
    text: `A fonte ganha com ${best.connections} conexões e faixas de ${best.chunkMb} MB (${meter(best.mbps)}${gain !== null && gain > 0 ? `, ${gain}% sobre uma conexão` : ''}). Aplicar deixa o transporte local com esta configuração.${throttled}`,
    apply: true, settings: { connections: best.connections, chunkMb: best.chunkMb },
    meetsTarget: targetMbps === null ? null : best.mbps >= targetMbps * sweepLimits.sufficiencyTolerance,
    rateLimited: collapses >= 2, capped: rows.length >= maxCells
  };
}
