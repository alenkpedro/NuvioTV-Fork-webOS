import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
const repo = process.argv[2], tag = process.argv[3];
if (!/^[\w-]+\/[\w.-]+$/.test(repo ?? '') || !/^[\w.-]+$/.test(tag ?? '')) throw Error('Usage: node scripts/generate-homebrew.mjs owner/repo webos-v0.19.0');
const app = JSON.parse(readFileSync('dist/appinfo.json', 'utf8'));
if (tag !== `webos-v${app.version}`) throw Error('Tag must match package version');
const filename = `${app.id}_${app.version}_all.ipk`, file = `packages/${filename}`;
// A descrição do índice acompanha a entrega publicada: ela é o texto que o Homebrew Channel
// mostra para quem instala/atualiza, então não pode ficar presa a uma versão antiga.
const appDescription = 'Faixas paralelas com serviço de mídia local, varredura de transporte, início rápido das fontes, acompanhamento MDBList, avaliação do dispositivo, transferência de biblioteca e switches de áudio por formato.';
const shortDescription = 'Player do fork com transporte local medido, varredura e recursos de paridade.';
const manifest = {
  id: app.id, version: app.version, type: app.type, title: app.title,
  appDescription,
  iconUri: `https://raw.githubusercontent.com/${repo}/${tag}/webos/public/assets/icon.png`,
  sourceUrl: `https://github.com/${repo}/tree/${tag}`,
  rootRequired: false,
  ipkUrl: `https://github.com/${repo}/releases/download/${tag}/${filename}`,
  ipkHash: { sha256: createHash('sha256').update(readFileSync(file)).digest('hex') },
  ipkSize: statSync(file).size,
};
const index = { paging: { page: 1, count: 1, maxPage: 1, itemsTotal: 1 }, packages: [{ id: app.id, title: app.title, iconUri: manifest.iconUri, manifest, pool: 'main', shortDescription }] };

writeFileSync('../apps.json', JSON.stringify(index, null, 2) + '\n');
writeFileSync(`packages/${app.id}.manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ file, bytes: manifest.ipkSize, sha256: manifest.ipkHash.sha256 }));
