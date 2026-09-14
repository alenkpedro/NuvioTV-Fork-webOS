// Generates data directly from the chosen Android fork. Fail closed on upstream changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = new URL('../../app/src/main/java/com/nuvio/tv/', import.meta.url);
const settings = readFileSync(new URL('domain/model/DebridSettings.kt', base), 'utf8');
const groups = readFileSync(new URL('core/debrid/TrashReleaseGroups.kt', base), 'utf8');
const clean = s => s.replace(/\/\/[^\n]*/g, '');
const quoted = s => [...s.matchAll(/"([^"\n]*)"/g)].map(m => m[1]);
const groupList = name => quoted(clean(groups.match(new RegExp(`val ${name}:[\\s\\S]*?listOf\\(([\\s\\S]*?)\\n    \\)`))?.[1] ?? (() => { throw Error(name); })()));
const enums = {};
for (const m of settings.matchAll(/enum class (DebridStream\w+)\([^\n]+\) \{([\s\S]*?)\n\}/g)) {
  const entries = [...m[2].split('companion object')[0].matchAll(/\b([A-Z][A-Z_0-9]*)\("([^"\n]*)"(?:,\s*(?:"([^"\n]*)"|\d+))?\)/g)];
  enums[m[1]] = { entries: entries.map(e => ({ id: e[1], label: e[3] ?? e[2], ...(e[3] ? { code: e[2] } : {}) })),
    order: m[2].match(/val defaultOrder = listOf\(([^)]+)\)/)?.[1].split(',').map(s => s.trim()) };
}
const prefsBlock = settings.match(/data class DebridStreamPreferences\(([\s\S]*?)\n\)/)?.[1];
if (!prefsBlock) throw Error('Preferences block changed');
const defaults = {};
const expressions = [...prefsBlock.matchAll(/val (\w+):[^=]+?=\s*([\s\S]*?)(?=,\s*\n\s*val |$)/g)];
for (const [, key, raw] of expressions) {
  const exp = clean(raw).trim();
  if (/^\d+$/.test(exp)) defaults[key] = Number(exp);
  else if (exp.startsWith('emptyList')) defaults[key] = [];
  else if (exp === 'TrashReleaseGroups.PREFERRED_LADDER') defaults[key] = groupList('PREFERRED_LADDER');
  else if (exp === 'TrashReleaseGroups.EXCLUDED_GROUPS') defaults[key] = groupList('EXCLUDED_GROUPS');
  else if (exp === 'TrashReleaseGroups.DEFAULTS_VERSION') defaults[key] = Number(groups.match(/DEFAULTS_VERSION = (\d+)/)[1]);
  else if (exp === 'DebridStreamSortCriterion.defaultOrder') {
    defaults[key] = [...settings.matchAll(/DebridStreamSortCriterion\(DebridStreamSortKey\.(\w+), DebridStreamSortDirection\.(\w+)\)/g)].map(m => ({ key: m[1], direction: m[2] }));
  } else if (exp.endsWith('.defaultOrder') && enums[exp.split('.')[0]]?.order) defaults[key] = enums[exp.split('.')[0]].order;
  else if (exp.startsWith('listOf(')) defaults[key] = [...exp.matchAll(/DebridStream\w+\.([A-Z_0-9]+)/g)].map(m => m[1]);
  else throw Error(`Unhandled default: ${key} = ${exp}`);
}
if (Object.keys(defaults).length !== 31 || defaults.preferredReleaseGroups.length < 90) throw Error('Incomplete defaults extraction');
const result = { source: 'ysosrs123/NuvioTV-Fork', sha256: createHash('sha256').update(settings).update(groups).digest('hex'), defaults, enums };
const output = new URL('../src/core/fork-defaults.json', import.meta.url);
const serialized = JSON.stringify(result, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8') !== serialized) throw Error('Fork defaults changed. Review and run npm run sync:defaults.');
} else writeFileSync(output, serialized);
console.log(`Fork defaults: ${Object.keys(defaults).length} preferences; ${defaults.preferredReleaseGroups.length} preferred groups.`);
