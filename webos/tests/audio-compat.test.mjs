import test from 'node:test';
import assert from 'node:assert/strict';
import { audioCompatIssue, audioFormatIds, audioFormats, capabilityText, platformCapabilities, playbackPatchFor, readAudioCompat, readPlaybackFormat, sourceFormats } from '../src/core/audio-compat.js';
import { readPlayback } from '../src/core/playback.js';
const stream = name => ({ name, url: 'https://cdn.test/a.mkv' });
test('the five switches default to "my receiver handles it"', () => {
  assert.deepEqual(audioFormatIds, ['dolby', 'plus', 'truehd', 'dts', 'dtshd']);
  assert.equal(audioFormats.length, 5);
  const prefs = readPlayback({});
  assert.equal(prefs.audioSwitchesEnabled, false);
  assert.deepEqual(readAudioCompat(prefs), { enabled: false, allowed: { dolby: true, plus: true, truehd: true, dts: true, dtshd: true } });
  const patched = readPlayback({ audioSwitchesEnabled: true, audioTruehd: false, audioDts: false });
  assert.equal(readPlaybackFormat('truehd', patched), false);
  assert.equal(readPlaybackFormat('dts', patched), false);
  assert.equal(readPlaybackFormat('dolby', patched), true);
  assert.deepEqual(playbackPatchFor('plus', false), { audioPlus: false });
});
test('the formats a source carries come from the fork tags', () => {
  assert.deepEqual(sourceFormats(stream('Movie.2024.2160p.TrueHD.Atmos.7.1.x265')), ['plus', 'truehd']);
  assert.deepEqual(sourceFormats(stream('Movie.2024.DTS-HD.MA.5.1')), ['dts', 'dtshd']);
  assert.deepEqual(sourceFormats(stream('Movie.2024.AC3.1080p')), ['dolby']);
  assert.deepEqual(sourceFormats({ name: 'Movie 2024 1080p', audioTags: ['dd+'] }), ['plus']);
  assert.deepEqual(sourceFormats(stream('Movie.2024.Atmos.DDP.5.1')), ['plus']);
  assert.deepEqual(sourceFormats(stream('Movie.2024.1080p.WEB-DL')), []);
  assert.deepEqual(sourceFormats(null), []);
});
test('a source whose only audio is switched off is marked unavailable, others are not', () => {
  const prefs = { audioSwitchesEnabled: true, audioTruehd: false };
  assert.match(audioCompatIssue(stream('Movie.2024.TrueHD.x265'), prefs), /Dolby TrueHD \/ Atmos/);
  // Conservador de propósito: com sinais de DD+ junto do TrueHD, a fonte continua oferecida —
  // bloquear o que pode tocar seria pior do que deixar a TV tentar.
  assert.equal(audioCompatIssue(stream('Movie.2024.TrueHD.Atmos.x265'), prefs), null);
  assert.equal(audioCompatIssue(stream('Movie.2024.TrueHD.Atmos.DD+.x265'), prefs), null); // DD+ ainda serve
  assert.equal(audioCompatIssue(stream('Movie.2024.AC3.x264'), prefs), null);
  assert.equal(audioCompatIssue(stream('Movie.2024.1080p.WEB-DL'), prefs), null); // sem tag, não bloqueia
  assert.equal(audioCompatIssue(stream('Movie.2024.TrueHD.Atmos.x265'), { audioSwitchesEnabled: false, audioTruehd: false }), null); // master desligado
});
test('the platform claim is reported as a claim, never as a measurement', () => {
  const capabilities = platformCapabilities({ isTypeSupported: value => /"(ac-3|dts)"/.test(value) });
  assert.equal(capabilities.available, true);
  assert.equal(capabilities.formats.dolby, true);
  assert.equal(capabilities.formats.truehd, false);
  assert.match(capabilityText(capabilities), /Dolby Digital \(AC-3\): declarado/);
  assert.match(capabilityText(capabilities), /Dolby TrueHD \/ Atmos: não declarado/);
  assert.match(capabilityText(platformCapabilities({})), /não expõe o que decodifica/);
  const throwing = platformCapabilities({ isTypeSupported: () => { throw Error('no'); } });
  assert.deepEqual(throwing.formats, { dolby: false, plus: false, truehd: false, dts: false, dtshd: false });
});
