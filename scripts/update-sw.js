#!/usr/bin/env node
// Regenera en sw.js la lista de ASSETS y la versión de caché (hash del contenido).
// Uso:  node scripts/update-sw.js           -> actualiza sw.js
//       node scripts/update-sw.js --check   -> falla si sw.js está desactualizado
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const STATIC = ['index.html', 'styles.css', 'manifest.json', 'icon-192.png', 'icon-512.png'];

function listAssets() {
  const js = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).sort().map(f => 'js/' + f);
  return [...STATIC, ...js];
}

function buildBlock() {
  const assets = listAssets();
  const hash = crypto.createHash('sha256');
  assets.forEach(f => { hash.update(f); hash.update(fs.readFileSync(path.join(ROOT, f))); });
  const version = hash.digest('hex').slice(0, 8);
  const list = ["'./'", ...assets.map(f => `'./${f}'`)].map(x => '  ' + x).join(',\n');
  return `// >>> AUTO-GENERADO por scripts/update-sw.js (no editar a mano) >>>
const CACHE = 'cov-reportes-swr-${version}';
const ASSETS = [
${list}
];
// <<< AUTO-GENERADO <<<`;
}

// Copia el bloque compartido js/nombres.js -> API appscript.js
const NOMBRES_RE = /\/\/ >>> NOMBRES >>>[\s\S]*?\/\/ <<< NOMBRES <<</;
function nombresBlock() {
  return fs.readFileSync(path.join(ROOT, 'js/nombres.js'), 'utf8').match(NOMBRES_RE)[0];
}
function syncNombres(check) {
  const apiPath = path.join(ROOT, 'API appscript.js');
  const api = fs.readFileSync(apiPath, 'utf8');
  const next = api.replace(NOMBRES_RE, () => nombresBlock());
  if (next === api) return;
  if (check) { console.error('"API appscript.js" desactualizado respecto a js/nombres.js: ejecuta "node scripts/update-sw.js"'); process.exit(1); }
  fs.writeFileSync(apiPath, next);
  console.log('API appscript.js actualizado (bloque NOMBRES)');
}

function run(check) {
  syncNombres(check);
  const swPath = path.join(ROOT, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  const re = /\/\/ >>> AUTO-GENERADO[\s\S]*?\/\/ <<< AUTO-GENERADO <<</;
  if (!re.test(sw)) throw new Error('sw.js no contiene el bloque AUTO-GENERADO');
  const next = sw.replace(re, () => buildBlock());
  if (check) {
    if (next !== sw) { console.error('sw.js desactualizado: ejecuta "node scripts/update-sw.js"'); process.exit(1); }
    console.log('sw.js al día');
    return;
  }
  if (next !== sw) { fs.writeFileSync(swPath, next); console.log('sw.js actualizado'); }
  else console.log('sw.js ya estaba al día');
}

if (require.main === module) run(process.argv.includes('--check'));
module.exports = { listAssets, buildBlock };
