const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./helpers');

const load = () => createApp(['js/config.js', 'js/state.js', 'js/utils.js', 'js/sheets.js', 'js/templates.js']);

test('todas las plantillas generan texto sin lanzar errores con campos vacíos', () => {
  const app = load();
  const n = app.run(`
    let c = 0;
    Object.keys(TPLS).forEach(cat => TPLS[cat].forEach(t => {
      const v = {}; t.fields.forEach(f => v[f.id] = "x");
      const out = t.gen(v);
      if (typeof out !== "string" || !out.length) throw new Error("plantilla vacía: " + t.id);
      c++;
    }));
    c`);
  assert.ok(n > 5);
});

test('autofill: campos "ubi" usan la ubicación del perfil', () => {
  const app = load();
  app.run('S.set("profile", {nombre:"Ana", turno:"TARDE", ubi:"Av. Lima"})');
  assert.strictEqual(app.run('getAutoVal({id:"u", autofill:"ubi"})'), 'Av. Lima');
  assert.strictEqual(app.run('getAutoVal({id:"c", autofill:"cov"})'), 'Ana');
});

test('BUG ubicación: borrador con ubicación vieja sin editar toma la del perfil nueva', () => {
  const app = load();
  app.run('S.set("profile", {nombre:"Ana", turno:"TARDE", ubi:"Punto Nuevo"})');
  const f = { id: 'ubi', autofill: 'ubi' };
  const cache = { vals: { ubi: 'Punto Viejo' }, auto: { ubi: 'Punto Viejo' } };
  app.ctx.f = f; app.ctx.cache = cache;
  assert.strictEqual(app.run('resolveFieldVal(f, cache)'), 'Punto Nuevo');
});

test('ubicación editada a mano por el usuario se respeta', () => {
  const app = load();
  app.run('S.set("profile", {nombre:"Ana", turno:"TARDE", ubi:"Punto Nuevo"})');
  app.ctx.f = { id: 'ubi', autofill: 'ubi' };
  app.ctx.cache = { vals: { ubi: 'Escrito por mí' }, auto: { ubi: 'Punto Viejo' } };
  assert.strictEqual(app.run('resolveFieldVal(f, cache)'), 'Escrito por mí');
});

test('borrador antiguo sin registro de autofill: gana el perfil actual', () => {
  const app = load();
  app.run('S.set("profile", {nombre:"Ana", turno:"TARDE", ubi:"Punto Nuevo"})');
  app.ctx.f = { id: 'ubi', autofill: 'ubi' };
  app.ctx.cache = { vals: { ubi: 'Punto Viejo' } };
  assert.strictEqual(app.run('resolveFieldVal(f, cache)'), 'Punto Nuevo');
});

test('campos sin autofill conservan el borrador', () => {
  const app = load();
  app.ctx.f = { id: 'desc' };
  app.ctx.cache = { vals: { desc: 'texto' } };
  assert.strictEqual(app.run('resolveFieldVal(f, cache)'), 'texto');
});

test('profileChanged actualiza el formulario abierto si el campo no fue editado', () => {
  const app = load();
  app.run('S.set("profile", {nombre:"Ana", turno:"TARDE", ubi:"Punto Viejo"})');
  app.run(`
    AppState.curTpl = { id: "t1", fields: [{ id: "ubi", autofill: "ubi" }, { id: "desc" }], gen: v => "U:" + v.ubi };
    AppState.formAuto = { ubi: "Punto Viejo" };`);
  app.els['f-ubi'] = { id: 'f-ubi', value: 'Punto Viejo' };
  app.els['f-desc'] = { id: 'f-desc', value: 'algo' };
  app.els['prev'] = { textContent: '' };
  app.run('EventBus.emit("profileChanged", {nombre:"Ana", turno:"TARDE", ubi:"Punto Nuevo"})');
  assert.strictEqual(app.els['f-ubi'].value, 'Punto Nuevo');
  assert.strictEqual(app.els['f-desc'].value, 'algo');
  assert.strictEqual(app.els['prev'].textContent, 'U:Punto Nuevo');
});

test('profileChanged no pisa una ubicación escrita a mano', () => {
  const app = load();
  app.run(`
    AppState.curTpl = { id: "t1", fields: [{ id: "ubi", autofill: "ubi" }], gen: v => "" };
    AppState.formAuto = { ubi: "Punto Viejo" };`);
  app.els['f-ubi'] = { id: 'f-ubi', value: 'Mi lugar' };
  app.els['prev'] = { textContent: '' };
  app.run('EventBus.emit("profileChanged", {nombre:"Ana", turno:"TARDE", ubi:"Punto Nuevo"})');
  assert.strictEqual(app.els['f-ubi'].value, 'Mi lugar');
});

test('API de borradores completa: guardar, cargar, expirar y borrar', () => {
  const app = load();
  app.run('AppState.curTpl = { id: "t9", fields: [{ id: "a" }] }; AppState.formAuto = {};');
  app.els['f-a'] = { id: 'f-a', value: 'hola' };
  app.run('saveFormCache("t9")');
  assert.strictEqual(app.run('loadFormCache("t9").vals.a'), 'hola');
  app.run('S.set("fc_old", { vals: {}, ts: Date.now() - 3 * 60 * 60 * 1000 })');
  assert.strictEqual(app.run('loadFormCache("old")'), null); // pasó el TTL de 2 h
  app.run('clearFormCache("t9")');
  assert.strictEqual(app.run('loadFormCache("t9")'), null);
});
