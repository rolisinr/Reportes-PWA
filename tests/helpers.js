// Carga los scripts del navegador (globales, sin módulos) en un contexto vm con DOM mínimo
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function makeEl(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {}, remove() {}, querySelectorAll() { return []; }
  };
}

function createApp(files) {
  const store = {};
  const els = {};
  const sandbox = {
    console,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    document: {
      cookie: '',
      getElementById: id => (els[id] = els[id] || makeEl(id)),
      querySelectorAll: () => [],
      addEventListener() {}
    },
    window: {},
    navigator: {},
    screen: {},
    setInterval() {}, setTimeout, clearTimeout,
    addEventListener() {},
    innerWidth: 400, innerHeight: 800,
    showToast() {}
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  files.forEach(f => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  return { ctx, store, els, run: code => vm.runInContext(code, ctx) };
}

module.exports = { ROOT, createApp };
