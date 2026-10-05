const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

function loadBackend(sheets) {
  const sandbox = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => sheets[n] && { getDataRange: () => ({ getValues: () => sheets[n] }) } }) },
    Utilities: { formatDate: () => '2026-10-05' },
    CacheService: {}, ContentService: {}, LockService: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'API appscript.js'), 'utf8'), sandbox);
  return sandbox;
}

test('fechaClave ordena fechas ISO y DD/MM/YYYY cronológicamente', () => {
  const b = loadBackend({});
  const f = b.fechaClave;
  assert.ok(f('2026-10-05') > f('2026-09-30'));
  assert.ok(f('05/10/2026') > f('30/09/2026'));
  assert.ok(f('01/01/2027') > f('31/12/2026'));
  assert.strictEqual(f('05/10/2026'), f('2026-10-05'));
  assert.strictEqual(f('basura'), 0);
});

test('getAvisos: filtra leídos (id completo o últimos 4) y programados a futuro', () => {
  const b = loadBackend({ Avisos: [
    ['id', 'mensaje', 'fecha', 'activo', 'para', 'leido_por', 'fecha_prog'],
    ['1', 'visible', 'f', 'TRUE', 'todos', '', ''],
    ['2', 'leido', 'f', 'TRUE', 'todos', 'Ana(wxyz)', ''],
    ['3', 'futuro', 'f', 'TRUE', 'todos', '', '2030-01-01'],
    ['4', 'inactivo', 'f', 'FALSE', 'todos', '', '']
  ] });
  const r = b.getAvisos('dev_abc_wxyz');
  assert.strictEqual(JSON.stringify(r.avisos.map(a => a.id)), '["1"]');
  assert.strictEqual(b.getAvisos(undefined).avisos.length, 0); // sin did no se muestra nada
});

test('getConfig: usa la programación de la fecha más reciente', () => {
  const b = loadBackend({
    Config: [['k', 'v']],
    Prog_Estado: [
      ['fecha', 'corredor', 'turno', 'clave', 'nombre', 'punto', 'sentido', 'funcion', 'categoria'],
      ['2026-09-30', 'TGA', 'TARDE', '', 'Viejo', 'P1', '', '', ''],
      ['2026-10-05', 'TGA', 'TARDE', '', 'Nuevo', 'P2', 'N/S', '', '']
    ]
  });
  b.CacheService.getScriptCache = () => ({ get: () => null, put() {} });
  const r = b.getConfig();
  assert.strictEqual(JSON.stringify(r.prog.map(p => p.nombre)), '["Nuevo"]');
  assert.strictEqual(r.prog[0].punto, 'P2');
});
