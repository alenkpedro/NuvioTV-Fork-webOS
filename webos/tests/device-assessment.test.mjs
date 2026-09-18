import test from 'node:test';
import assert from 'node:assert/strict';
import { assessmentPatch, assessmentSources, assessmentSummary, bufferProfileFor, buildAssessment, feasibilityRows, stabilityReason } from '../src/core/device-assessment.js';
import { readPlayback } from '../src/core/playback.js';
const sweep = (best = { connections: 2, chunkMb: 2, mbps: 28.4, stability: 0.1 }, targetMbps = 20) => ({ at: 1789700000000, source: 'Fonte X', targetMbps, best, rows: [] });
test('every recommendation says where it came from, and the impossible ones say so', () => {
  const assessment = buildAssessment({ sweep: sweep(), playback: readPlayback({}) });
  const ids = assessment.rows.map(row => row.id);
  assert.deepEqual(ids, ['transport', 'mediaWindowMb', 'buffer', 'customBuffer', 'localMediaService', 'prewarmStreams', 'doviMode', 'mediaConnections', 'nativeMemory', 'afr', 'passthrough']);
  assert.equal(assessment.rows.find(row => row.id === 'transport').source, 'measured');
  assert.equal(assessment.rows.find(row => row.id === 'mediaWindowMb').source, 'derived');
  assert.equal(assessment.rows.find(row => row.id === 'customBuffer').source, 'choice');
  assert.equal(assessment.rows.find(row => row.id === 'afr').source, 'unknown');
  assert.match(assessment.rows.find(row => row.id === 'transport').reason, /melhor célula medida: 28,4 Mbps/);
  assert.deepEqual(Object.keys(assessmentSources), ['measured', 'derived', 'choice', 'unknown']);
  assert.equal(feasibilityRows().length, 5);
});
test('the patch only carries what the TV can actually set', () => {
  const assessment = buildAssessment({ sweep: sweep(), playback: readPlayback({ mediaWindowMb: 8 }) });
  const patch = assessmentPatch(assessment);
  assert.deepEqual(patch, {
    mediaConnections: 2, mediaChunkMb: 2, mediaWindowMb: 16,
    bufferInitial: 5, bufferAfterRebuffer: 3, customBuffer: true,
    localMediaService: true, prewarmStreams: true
  });
  assert.equal('doviMode' in patch, false);
  assert.equal('afr' in patch, false);
  assert.equal('passthrough' in patch, false);
});
test('without a sweep nothing is applied and the assessment says what to do', () => {
  const assessment = buildAssessment({ sweep: null, playback: readPlayback({}) });
  assert.equal(assessment.rows[0].value, 'sem medição');
  assert.equal(assessment.rows[0].source, 'unknown');
  assert.equal(Object.keys(assessmentPatch(assessment)).length, 0);
  assert.match(assessmentSummary(assessment), /6 linha\(s\) sem equivalente webOS/);
});
test('a single-connection winner does not turn the parallel transport on', () => {
  const assessment = buildAssessment({ sweep: sweep({ connections: 1, chunkMb: 1, mbps: 12, stability: 0.1 }, 10), playback: readPlayback({}) });
  assert.equal(assessmentPatch(assessment).localMediaService, undefined);
  assert.equal(assessmentPatch(assessment).mediaConnections, 1);
  assert.equal(assessment.rows.some(row => row.id === 'prewarmStreams'), true); // 12 Mbps ≥ 10 alvo
});
test('an unstable link asks for the large buffer, a steady one keeps the medium profile', () => {
  assert.equal(bufferProfileFor(0.05).id, 'medium');
  assert.equal(bufferProfileFor(0.2).id, 'large');
  assert.equal(bufferProfileFor(0.9).id, 'large');
  assert.equal(bufferProfileFor(null).id, 'large');
  assert.match(stabilityReason(0.05), /estáveis/);
  assert.match(stabilityReason(0.2), /oscilaram/);
  assert.match(stabilityReason(undefined), /sem série/);
  const unstable = buildAssessment({ sweep: sweep({ connections: 2, chunkMb: 1, mbps: 15, stability: 0.4 }), playback: readPlayback({}) });
  assert.equal(assessmentPatch(unstable).bufferInitial, 8);
  assert.equal(assessmentPatch(unstable).bufferAfterRebuffer, 5);
});
