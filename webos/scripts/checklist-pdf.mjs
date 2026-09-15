// SPDX-License-Identifier: GPL-3.0-only
// Turns webos/VALIDATION.md into the printable checklist PDF used on the TV.
// Chrome/Chromium prints it, so the typography, colours and page numbers come from CSS
// and the Markdown file stays the single source of truth.
// Usage: node scripts/checklist-pdf.mjs [saida.pdf]
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';
const source = resolve(import.meta.dirname, '../VALIDATION.md');
const args = process.argv.slice(2).filter(argument => !argument.startsWith('--'));
const target = resolve(args[0] || resolve(import.meta.dirname, '../../../../outputs/nuvio-lg-webos-checklist-tv.pdf'));
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
function inline(value) {
  return escape(value)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}
// The checklist uses a small Markdown subset: headings, task/bullet lists with wrapped
// continuation lines, tables, fenced blocks and paragraphs.
function blocks(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith('```')) {
      const body = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) { body.push(lines[index]); index += 1; }
      index += 1;
      out.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) { out.push({ type: 'heading', level: heading[1].length, text: heading[2] }); index += 1; continue; }
    if (line.startsWith('|')) {
      const rows = [];
      while (index < lines.length && lines[index].startsWith('|')) {
        const cells = lines[index].split('|').slice(1, -1).map(cell => cell.trim());
        if (!cells.every(cell => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
        index += 1;
      }
      out.push({ type: 'table', head: rows.shift() || [], rows });
      continue;
    }
    const item = line.match(/^(\s*)-\s+(.*)$/);
    const ordered = item ? null : line.match(/^(\s*)(\d+)\.\s+(.*)$/);
    if (item || ordered) {
      const items = [];
      const matches = current => {
        const bullet = current.match(/^(\s*)-\s+(.*)$/);
        if (bullet) return { text: bullet[2] };
        const numeric = current.match(/^(\s*)(\d+)\.\s+(.*)$/);
        return numeric ? { text: numeric[3], number: Number(numeric[2]) } : null;
      };
      while (index < lines.length) {
        const current = lines[index];
        const start = matches(current);
        if (start) {
          const task = start.text.match(/^\[( |x)\]\s*(.*)$/);
          items.push({ task: Boolean(task), checked: task?.[1] === 'x', number: start.number, text: task ? task[2] : start.text });
          index += 1;
          continue;
        }
        if (!current.trim()) break;
        // A wrapped line belongs to the item above when it is indented.
        if (/^\s{2,}\S/.test(current) && items.length) { items[items.length - 1].text += ` ${current.trim()}`; index += 1; continue; }
        break;
      }
      out.push({ type: 'list', ordered: Boolean(ordered), items });
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !/^(#{1,4}\s|\s*-\s|\||```)/.test(lines[index])) { paragraph.push(lines[index].trim()); index += 1; }
    out.push({ type: 'paragraph', text: paragraph.join(' ') });
  }
  return out;
}
const isDoubt = text => /^Dúvida:/.test(text);
function render(parsed) {
  const html = [];
  let firstTitle = true;
  for (const block of parsed) {
    if (block.type === 'heading') {
      const level = Math.min(block.level, 3);
      // The cover already carries the document title.
      if (level === 1 && firstTitle) { firstTitle = false; continue; }
      firstTitle = false;
      html.push(`<h${level}>${inline(block.text)}</h${level}>`);
    } else if (block.type === 'paragraph') {
      html.push(`<p>${inline(block.text)}</p>`);
    } else if (block.type === 'code') {
      html.push(`<pre>${escape(block.text)}</pre>`);
    } else if (block.type === 'table') {
      html.push(`<table><thead><tr>${block.head.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
    } else {
      const items = block.items.map(item => isDoubt(item.text)
        ? `<li class="doubt">${inline(item.text)}</li>`
        : block.ordered
          ? `<li class="step"><span class="num">${item.number}</span><span>${inline(item.text)}</span></li>`
          : `<li${item.task ? ' class="task"' : ''}>${item.task ? `<span class="box" aria-hidden="true">${item.checked ? '✓' : ''}</span>` : '<span class="dot" aria-hidden="true"></span>'}<span>${inline(item.text)}</span></li>`);
      const open = block.ordered ? '<ul class="steps">' : block.items.every(item => item.task && !isDoubt(item.text)) ? '<ul class="tasks">' : '<ul>';
      html.push(`${open}${items.join('')}</ul>`);
    }
  }
  return html.join('\n');
}

// Print stylesheet: A4, generous spacing, colour per block, and rules that keep a
// checklist item together with its heading.
const styles = `
  @page { size: A4; margin: 16mm 14mm 18mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 10.5pt/1.5 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1b1b1f; }
  h1 { font-size: 22pt; line-height: 1.15; margin: 0 0 4mm; letter-spacing: -.2pt; }
  h2 { font-size: 14pt; margin: 9mm 0 3mm; padding: 2.5mm 0 2.5mm 4mm; border-left: 3.5mm solid #1f6feb; background: #f2f6fd; border-radius: 1mm; break-after: avoid; }
  h3 { font-size: 11.5pt; margin: 6mm 0 2.5mm; padding-bottom: 1mm; border-bottom: .3mm solid #d7dbe3; break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 4mm 0 2mm; }
  p { margin: 0 0 3mm; }
  a { color: #1f6feb; text-decoration: none; }
  code { font: 9.5pt/1.4 "SF Mono", Menlo, Consolas, monospace; background: #f4f5f7; border-radius: .8mm; padding: .2mm 1mm; }
  ul { list-style: none; margin: 0 0 3mm; padding: 0; }
  li { display: flex; gap: 3mm; margin: 0 0 2.2mm; break-inside: avoid; }
  li > span:last-child { flex: 1; }
  .box { flex: none; width: 4.2mm; height: 4.2mm; margin-top: .9mm; border: .35mm solid #8b93a3; border-radius: .8mm; font-size: 8pt; line-height: 4mm; text-align: center; color: #1f6feb; }
  .dot { flex: none; width: 1.6mm; height: 1.6mm; margin-top: 2mm; background: #b6bcc9; border-radius: 50%; }
  .num { flex: none; width: 4.6mm; height: 4.6mm; margin-top: .4mm; border-radius: 50%; background: #1f6feb; color: #fff; font-size: 8.5pt; line-height: 4.6mm; text-align: center; font-weight: 700; }
  ul.steps li { margin-bottom: 2.6mm; }
  li.doubt { margin: 0 0 3mm 7mm; padding: 2mm 3mm; background: #fff8e6; border-left: 1.2mm solid #d9a300; border-radius: 1mm; font-size: 9.5pt; color: #4a3b00; }
  li.doubt::before { content: "⚠"; flex: none; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 4mm; font-size: 9.5pt; break-inside: avoid; }
  th { background: #1f6feb; color: #fff; text-align: left; padding: 1.8mm 2.4mm; font-weight: 600; }
  td { border-bottom: .25mm solid #dfe3ea; padding: 1.8mm 2.4mm; vertical-align: top; }
  tr:nth-child(even) td { background: #f7f9fc; }
  tbody tr td:first-child { white-space: nowrap; font-weight: 600; }
  pre { background: #f4f5f7; border: .25mm solid #dfe3ea; border-left: 1.2mm solid #8b93a3; border-radius: 1mm; padding: 3mm; font: 9pt/1.45 "SF Mono", Menlo, Consolas, monospace; white-space: pre-wrap; break-inside: avoid; }
  header.cover { border-bottom: .8mm solid #1f6feb; padding-bottom: 4mm; margin-bottom: 6mm; }
  header.cover .eyebrow { font-size: 8.5pt; letter-spacing: 1.2pt; text-transform: uppercase; color: #1f6feb; font-weight: 700; }
  header.cover .meta { display: flex; flex-wrap: wrap; gap: 2mm; margin-top: 3mm; }
  header.cover .chip { font-size: 8.5pt; padding: 1mm 2.4mm; border: .25mm solid #cfd6e2; border-radius: 99mm; color: #3b4252; }
  .legend { display: flex; gap: 3mm; margin: 4mm 0 6mm; }
  .legend div { flex: 1; border: .25mm solid #dfe3ea; border-radius: 1.2mm; padding: 2.5mm; font-size: 9pt; }
  .legend strong { display: block; margin-bottom: .8mm; }
  .legend .k { font-size: 8pt; color: #6b7280; }
`;
const parsed = blocks(readFileSync(source, 'utf8'));
const body = render(parsed);
const title = parsed.find(block => block.type === 'heading' && block.level === 1)?.text || 'Checklist de validação';
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escape(title)}</title><style>${styles}</style></head><body>
<header class="cover">
  <div class="eyebrow">Nuvio Fork para LG webOS</div>
  <h1>${inline(title)}</h1>
  <div class="meta">
    <span class="chip">LG 55UT8050 · webOS 24</span>
    <span class="chip">Pacote 0.24.1</span>
    <span class="chip">${new Date().toLocaleDateString('pt-BR')}</span>
    <span class="chip">Início rápido: A1 → A2 → A3</span>
  </div>
</header>
<div class="legend">
  <div><strong>Como marcar</strong>Percorra um bloco por vez e assinale cada quadradinho. <span class="k">OK / FALHOU / DÚVIDA</span></div>
  <div><strong>Se algo falhar</strong>Anote o número do item e o que apareceu na tela. Uma foto resolve mais que um texto longo.</div>
  <div><strong>Antes de começar</strong>Confirme a versão em Ajustes → Sobre e entre no perfil que você usa.</div>
</div>
${body}
</body></html>`;
mkdirSync(dirname(target), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.emulateMedia({ media: 'print' });
await page.pdf({
  path: target,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="width:100%;font:7.5pt Helvetica,Arial,sans-serif;color:#8b93a3;padding:0 12mm;display:flex;justify-content:space-between;"><span>Checklist de validação · Nuvio Fork webOS 0.24.1</span><span>página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>'
});
await browser.close();
const pdf = readFileSync(target);
const pages = Number((pdf.toString('latin1').match(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/) || [])[1] || 0);
// A preview of pages 2-3 (continuous layout) to check the item styling without a viewer.
if (process.argv.includes('--png')) {
  const previewBrowser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const preview = await previewBrowser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 1.4 });
  await preview.setContent(html, { waitUntil: 'load' });
  await preview.screenshot({ path: target.replace(/\.pdf$/, '-preview.png'), fullPage: true });
  // Close-ups of one checklist block and the formats table, to check them without a viewer.
  await preview.locator('ul.tasks').first().screenshot({ path: target.replace(/\.pdf$/, '-items.png') });
  await preview.locator('table').first().screenshot({ path: target.replace(/\.pdf$/, '-table.png') });
  await previewBrowser.close();
}
console.log(JSON.stringify({ target, bytes: statSync(target).size, pages, headings: parsed.filter(block => block.type === 'heading').length, tasks: parsed.filter(block => block.type === 'list').flatMap(block => block.items).filter(item => item.task).length }));
