const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT } = require('./helpers');
const { listAssets } = require('../scripts/update-sw');

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('todos los scripts JS y el Apps Script tienen sintaxis válida', () => {
  const files = fs.readdirSync(path.join(ROOT, 'js')).map(f => 'js/' + f)
    .concat(['sw.js', 'firebase-messaging-sw.js', 'API appscript.js']);
  files.forEach(f => execFileSync(process.execPath, ['--check', path.join(ROOT, f)]));
});

test('sw.js está sincronizado (assets y versión de caché automáticos)', () => {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/update-sw.js'), '--check']);
});

test('todo script y hoja de estilo usados por index.html se precachean', () => {
  const html = read('index.html');
  const sw = read('sw.js');
  const used = [...html.matchAll(/(?:src|href)="((?:js\/|styles|manifest)[^"]+)"/g)].map(m => m[1]);
  assert.ok(used.length > 10);
  used.forEach(u => assert.ok(sw.includes(`'./${u}'`), `falta en ASSETS: ${u}`));
  listAssets().forEach(a => assert.ok(fs.existsSync(path.join(ROOT, a)), `no existe: ${a}`));
});

test('manifest: iconos "any" y "maskable" por separado y existentes', () => {
  const m = JSON.parse(read('manifest.json'));
  m.icons.forEach(i => {
    assert.ok(['any', 'maskable'].includes(i.purpose), 'purpose combinado: ' + i.purpose);
    assert.ok(fs.existsSync(path.join(ROOT, i.src)));
  });
  assert.ok(m.icons.some(i => i.purpose === 'maskable') && m.icons.some(i => i.purpose === 'any'));
});

test('viewport permite zoom (accesibilidad)', () => {
  const html = read('index.html');
  assert.ok(!/user-scalable\s*=\s*no/.test(html));
  assert.ok(!/maximum-scale/.test(html));
});

test('Apps Script: sin funciones duplicadas', () => {
  const src = read('API appscript.js');
  const names = [...src.matchAll(/^function\s+(\w+)/gm)].map(m => m[1]);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepStrictEqual(dup, []);
});
