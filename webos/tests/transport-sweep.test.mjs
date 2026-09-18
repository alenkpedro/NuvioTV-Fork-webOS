import test from 'node:test';
import assert from 'node:assert/strict';
import { cellFits, cellLabel, nextCells, runSweep, stability, stabilityText, sweepLadders, sweepLimits, sweepTarget, sweepVerdict, targetMet } from '../src/core/transport-sweep.js';
// The fork's ladders, reduced to what the local service can hold: the chunk ladder climbs at
// two connections first, then the connection ladder refines around the winner.
const table = values => async ({ connections, chunkMb }) => {
  const key = `${connections}:${chunkMb}`;
  const value = values[key];
  if (value === undefined) return { ok: false, failure: 'não medido no teste' };
  if (value === 'fail') return { ok: false, failure: 'HTTP 429' };
  return { ok: true, mbps: value, subWindows: [value, value, value * 0.9] };
};
test('the sweep keeps the fork ladders, the memory gate and the 2x target rule', () => {
  assert.deepEqual([...sweepLadders.chunks], [1, 2, 4, 8]);
  assert.deepEqual([...sweepLadders.connections], [1, 2, 3, 4, 6, 8]);
  assert.equal(cellFits(2, 4, 8), true); assert.equal(cellFits(4, 4, 8), false); assert.equal(cellFits(2, 4, undefined), false);
  assert.equal(cellLabel(2, 1), '2× 1 MB');
  assert.equal(sweepTarget(18.5), 37); assert.equal(sweepTarget(0), null); assert.equal(sweepTarget('x'), null);
  assert.equal(targetMet(36, 37), true); assert.equal(targetMet(30, 37), false); assert.equal(targetMet(5, null), null);
  assert.equal(stability([10, 10, 10]), 0); assert.ok(stability([10, 20]) > 0.3);
  assert.equal(stability([10]), null); assert.equal(stability([]), null);
  assert.equal(stabilityText(null), 'sem série'); assert.equal(stabilityText(0.05), 'estável');
  assert.equal(stabilityText(0.25), 'oscilando'); assert.equal(stabilityText(0.9), 'instável');
  assert.deepEqual(nextCells(null, new Set()), [{ connections: 1, chunkMb: 1 }]);
  assert.deepEqual(nextCells({ connections: 1, chunkMb: 1, mbps: 5 }, new Set(['1:1'])), [{ connections: 2, chunkMb: 1 }]);
  assert.deepEqual(nextCells({ connections: 2, chunkMb: 1, mbps: 5 }, new Set(['1:1', '2:1'])), [{ connections: 2, chunkMb: 2 }]);
  assert.deepEqual(nextCells({ connections: 2, chunkMb: 2, mbps: 5 }, new Set(['1:1', '2:1', '2:2'])), [{ connections: 2, chunkMb: 4 }]);
  assert.deepEqual(nextCells({ connections: 2, chunkMb: 4, mbps: 5 }, new Set(['1:1', '2:1', '2:2', '2:4'])), [{ connections: 2, chunkMb: 8 }]);
  // Stage 3/4: with the chunk ladder done, the connection ladder and the neighbours refine the winner.
  assert.deepEqual(nextCells({ connections: 2, chunkMb: 2, mbps: 5 }, new Set(['1:1', '2:1', '2:2', '2:4', '2:8'])).map(c => `${c.connections}:${c.chunkMb}`), ['3:2']);
  assert.deepEqual(nextCells({ connections: 2, chunkMb: 8, mbps: 5 }, new Set(['1:1', '2:1', '2:2', '2:4', '2:8'])).map(c => `${c.connections}:${c.chunkMb}`), ['3:8']);
  assert.deepEqual(nextCells({ connections: 4, chunkMb: 8, mbps: 5 }, new Set(['1:1', '2:1', '2:2', '2:8', '4:8'])).map(c => `${c.connections}:${c.chunkMb}`), ['6:8', '4:4']);
});
test('below the target every gain counts and the winner is adopted when the target is met', async () => {
  const seen = [];
  const outcome = await runSweep({
    windowMb: 32, targetMbps: 24, onCell: row => seen.push(row.label),
    measure: table({ '1:1': 10, '2:1': 12, '2:2': 20, '2:4': 26, '3:4': 27 })
  });
  assert.deepEqual([...new Set(seen)], ['1× 1 MB', '2× 1 MB', '2× 2 MB', '2× 4 MB', '2× 8 MB', '3× 4 MB']);
  assert.equal(outcome.best.label, '2× 4 MB');
  assert.equal(Math.round(outcome.best.mbps), 26);
  assert.equal(outcome.verdict.apply, true);
  assert.deepEqual(outcome.verdict.settings, { connections: 2, chunkMb: 4 });
  assert.equal(outcome.verdict.meetsTarget, true);
  assert.equal(outcome.cells, 6);
  assert.match(outcome.verdict.text, /ganha com 2 conexões/);
});
test('a baseline that already feeds the title ends the sweep on one connection', async () => {
  const outcome = await runSweep({ windowMb: 32, targetMbps: 20, measure: table({ '1:1': 30, '2:1': 40 }) });
  assert.equal(outcome.cells, 1);
  assert.equal(outcome.best.connections, 1);
  assert.deepEqual(outcome.verdict.settings, { connections: 1, chunkMb: 1 });
  assert.match(outcome.verdict.text, /Uma conexão já alimenta/);
});
test('a failed single-connection baseline ends the sweep like the fork does', async () => {
  const outcome = await runSweep({ windowMb: 32, targetMbps: 20, measure: table({ '1:1': 'fail', '2:1': 40 }) });
  assert.equal(outcome.cells, 1);
  assert.equal(outcome.best, null);
  assert.equal(outcome.verdict.apply, false);
  assert.match(outcome.verdict.text, /não respondeu na conexão única/);
});
test('two collapsed parallel cells mean the source is limiting and the climb stops', async () => {
  const outcome = await runSweep({ windowMb: 32, targetMbps: 40, measure: table({ '1:1': 9, '2:1': 'fail', '2:2': 'fail', '2:4': 60 }) });
  assert.equal(outcome.cells, 3);
  assert.equal(outcome.collapses, 2);
  assert.equal(outcome.best.connections, 1);
  assert.equal(outcome.verdict.apply, true);
  assert.equal(outcome.verdict.rateLimited, true);
  assert.match(outcome.verdict.text, /limitando o tráfego/);
  assert.equal(outcome.rows.at(-1).note, 'HTTP 429 · fonte limitando');
});
test('cells that do not fit the memory window are skipped, never run', async () => {
  const ran = [];
  const outcome = await runSweep({
    windowMb: 4,
    measure: async cell => { ran.push(`${cell.connections}:${cell.chunkMb}`); return table({ '1:1': 5, '2:1': 6, '2:2': 7 })(cell); }
  });
  assert.equal(ran.includes('2:4'), false);
  const skipped = outcome.rows.filter(row => row.skipped).map(row => row.label);
  assert.deepEqual(skipped, ['2× 4 MB', '2× 8 MB', '3× 2 MB']);
  assert.match(outcome.rows.find(row => row.skipped).note, /não cabe na janela/);
  assert.equal(outcome.verdict.apply, true);
});
test('the sweep stops at its own pass cap and says so', async () => {
  const outcome = await runSweep({ windowMb: 128, maxCells: 3, measure: table({ '1:1': 1, '2:1': 2, '2:2': 3, '2:4': 4, '3:4': 5 }) });
  assert.equal(outcome.cells, 3);
  assert.equal(outcome.stoppedAtCap, true);
  assert.equal(outcome.rows.length, 3);
});
test('cancelling the screen stops the sweep between cells', async () => {
  const controller = new AbortController();
  await assert.rejects(() => runSweep({ windowMb: 32, measure: async () => { controller.abort(); return { ok: true, mbps: 1 }; }, signal: controller.signal }), /Cancelado/);
});
test('the verdict names the failure when nothing measured', () => {
  const verdict = sweepVerdict({ best: null, targetMbps: 20, rows: [], collapses: 0 });
  assert.equal(verdict.apply, false);
  assert.match(verdict.text, /Nenhuma célula mediu/);
});
