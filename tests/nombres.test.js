const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { ROOT } = require('./helpers');

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/nombres.js'), 'utf8'), ctx);
const base = names => names.map(n => ({ nombre_completo: n, nombre_clave: n.toUpperCase() }));
const buscar = (n, b) => vm.runInContext('buscarCOV', ctx)(n, base(b));
const coincide = (a, b) => vm.runInContext('coincidenciaNombre', ctx)(a, b);

test('mismas palabras en otro orden, con tildes o mayúsculas = misma persona', () => {
  assert.strictEqual(coincide('Pérez Gómez Juan', 'JUAN PEREZ GOMEZ'), 3);
  assert.strictEqual(coincide('DE LA CRUZ Ana', 'Ana Cruz'), 3);
});
test('un error de tipeo en palabra larga se tolera; en palabra corta no', () => {
  assert.strictEqual(coincide('Rodriguez Perez Juan', 'Rodrigues Perez Juan'), 3);
  assert.strictEqual(coincide('Diaz Ruiz Juan', 'Diez Ruiz Juan'), 0);
});
test('comparten 2 de 3 palabras pero la tercera difiere = personas distintas', () => {
  assert.strictEqual(coincide('Garcia Lopez Juan', 'Garcia Ramos Juan'), 0);
});
test('un nombre contenido en otro más largo coincide (grado 2)', () => {
  assert.strictEqual(coincide('Garcia Juan', 'Garcia Lopez Juan Carlos'), 2);
});
test('una sola palabra nunca coincide', () => {
  assert.strictEqual(coincide('Juan', 'Garcia Juan'), 0);
});
test('buscarCOV: ambigüedad no elige a nadie', () => {
  const r = buscar('Garcia Juan', ['Garcia Lopez Juan', 'Garcia Ramos Juan']);
  assert.strictEqual(r.match, null);
  assert.strictEqual(r.ambiguo, true);
});
test('buscarCOV: la coincidencia exacta gana sobre las parciales', () => {
  const r = buscar('Garcia Juan', ['Garcia Lopez Juan', 'Garcia Juan']);
  assert.strictEqual(r.match.nombre_completo, 'Garcia Juan');
});
test('buscarCOV: sin candidatos devuelve null sin ambigüedad (COV nuevo)', () => {
  const r = buscar('Torres Mena Luis', ['Garcia Lopez Juan']);
  assert.deepStrictEqual([r.match, r.ambiguo], [null, false]);
});
test('el Apps Script contiene exactamente el mismo bloque de nombres que js/nombres.js', () => {
  const re = /\/\/ >>> NOMBRES >>>[\s\S]*?\/\/ <<< NOMBRES <<</;
  assert.strictEqual(fs.readFileSync(path.join(ROOT, 'API appscript.js'), 'utf8').match(re)[0],
    fs.readFileSync(path.join(ROOT, 'js/nombres.js'), 'utf8').match(re)[0]);
});
