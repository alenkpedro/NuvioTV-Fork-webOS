import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
// LG CLI supports APPDATA as its configuration root; keep packaging state local.
const cliData = path.resolve('.cli-data');
mkdirSync(cliData, { recursive: true }); mkdirSync('packages', { recursive: true });
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, ['node_modules/@webos-tools/cli/bin/ares-package.js', ...(args.length ? args : ['--no-minify', 'dist', 'service', '-o', 'packages'])], { stdio: 'inherit', env: { ...process.env, APPDATA: cliData } });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
