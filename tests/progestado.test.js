const test = require('node:test');
const assert = require('node:assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');

// Hoja en memoria que imita a Google Sheets: una celda con formato General convierte
// 'dd/MM/yyyy' en Date y 'HH:mm' en hora; con formato '@' se queda como texto.
class Hoja {
  constructor(nombre, encabezado) { this.nombre = nombre; this.filas = [encabezado.slice()]; this.fmt = {}; }
  _parse(v, col) {
    if (typeof v !== 'string' || this.fmt[col] === '@') return v;
    let m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], 12));
    m = v.match(/^(\d{1,2}):(\d{2})$/);
    if (m) return new Date(Date.UTC(1899, 11, 30, +m[1] + 5, +m[2]));
    return v;
  }
  getDataRange() { return { getValues: () => this.filas.map(r => r.slice()) }; }
  getLastRow() { return this.filas.length; }
  getRange(a, b, c, d) {
    const self = this;
    if (typeof a === 'string') { // 'A:A'
      const col = a.charCodeAt(0) - 64;
      return { setNumberFormat(f) { self.fmt[col] = f; }, getValues() { return self.filas.map(r => [r[col - 1] === undefined ? '' : r[col - 1]]); } };
    }
    const fila = a, col = b, nf = c || 1, nc = d || 1;
    return {
      setNumberFormat(f) { for (let j = 0; j < nc; j++) self.fmt[col + j] = f; },
      setValue(v) { while (self.filas.length < fila) self.filas.push([]); self.filas[fila - 1][col - 1] = self._parse(v, col); },
      setValues(vs) {
        vs.forEach((r, i) => {
          while (self.filas.length < fila + i) self.filas.push([]);
          r.forEach((v, j) => { self.filas[fila + i - 1][col + j - 1] = self._parse(v, col + j); });
        });
      },
      sort() { const h = self.filas.shift(); self.filas.sort((x, y) => String(x[0]).localeCompare(String(y[0]))); self.filas.unshift(h); }
    };
  }
  deleteRows(desde, n) { this.filas.splice(desde - 1, n); }
  appendRow(r) { this.filas.push(r); }
  setFrozenRows() {}
}

const PROG_H = ['fecha', 'corredor', 'turno', 'nombre_clave', 'nombre', 'punto', 'sentido', 'funcion', 'categoria', 'qap_estado', 'qap_hora_ini', 'qap_hora_fin', 'qap_orden'];
const BASE_H = ['nombre_completo', 'nombre_clave', 'corredor', 'activo', 'ultima_aparicion', 'obs'];

function entorno() {
  const hojas = { Prog_Estado: new Hoja('Prog_Estado', PROG_H), COVs_Base: new Hoja('COVs_Base', BASE_H) };
  const sandbox = {
    SpreadsheetApp: { openById: () => ({ getSheetByName: n => hojas[n] || null, insertSheet: n => (hojas[n] = new Hoja(n, [])) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    Utilities: {
      formatDate(d, tz, f) {
        const p = n => String(n).padStart(2, '0');
        const dd = new Date(d.getTime() - 5 * 3600e3); // America/Lima = UTC-5
        if (f === 'yyyy-MM-dd') return `${dd.getUTCFullYear()}-${p(dd.getUTCMonth() + 1)}-${p(dd.getUTCDate())}`;
        if (f === 'dd/MM/yyyy') return `${p(dd.getUTCDate())}/${p(dd.getUTCMonth() + 1)}/${dd.getUTCFullYear()}`;
        if (f === 'HH:mm') return `${p(dd.getUTCHours())}:${p(dd.getUTCMinutes())}`;
        return '';
      }
    },
    ContentService: {}
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'API appscript.js'), 'utf8'), sandbox);
  return { b: sandbox, hojas };
}

const item = (nombre, punto) => ({ nombre_clave: nombre.toUpperCase(), nombre, punto, sentido: 'N/S', funcion: 'Tranquera', categoria: 'activo', qap_estado: '', qap_hora_ini: '10:30', qap_hora_fin: '', qap_orden: '' });
const guardar = (b, items, extra) => b.saveProgEstado(Object.assign({ fecha: '05/10/2026', corredor: 'TGA', turno: 'TARDE', items }, extra));
const dataRows = h => h.filas.slice(1);

test('guardar la programación dos veces REEMPLAZA las filas (no acumula)', () => {
  const { b, hojas } = entorno();
  guardar(b, [item('Perez Juan', 'P1'), item('Gomez Ana', 'P2')]);
  assert.strictEqual(dataRows(hojas.Prog_Estado).length, 2);
  const r = guardar(b, [item('Perez Juan', 'P9'), item('Gomez Ana', 'P2'), item('Lopez Luis', 'P3')]);
  const filas = dataRows(hojas.Prog_Estado);
  assert.strictEqual(filas.length, 3, 'debe haber 3 filas, no 5');
  assert.strictEqual(r.eliminadas, 2);
  assert.strictEqual(filas.find(f => f[4] === 'Perez Juan')[5], 'P9', 'la fila existente se modificó');
});

test('la fecha queda como texto y las horas no se convierten en Date', () => {
  const { b, hojas } = entorno();
  guardar(b, [item('Perez Juan', 'P1')]);
  const f = dataRows(hojas.Prog_Estado)[0];
  assert.strictEqual(typeof f[0], 'string');
  assert.strictEqual(f[0], '05/10/2026');
  assert.strictEqual(f[10], '10:30');
});

test('REGRESIÓN: filas viejas con fecha convertida a Date también se reemplazan', () => {
  const { b, hojas } = entorno();
  // fila histórica que Sheets guardó como Date (la causa del bug original)
  hojas.Prog_Estado.filas.push([new Date(Date.UTC(2026, 9, 5, 12)), 'TGA', 'TARDE', 'VIEJO X', 'Viejo X', 'P0', '', '', '', '', '', '', '']);
  hojas.Prog_Estado.filas.push([new Date(Date.UTC(2026, 9, 4, 12)), 'TGA', 'TARDE', 'AYER Z', 'Ayer Z', 'P0', '', '', '', '', '', '', '']);
  guardar(b, [item('Perez Juan', 'P1')]);
  const nombres = dataRows(hojas.Prog_Estado).map(f => f[4]);
  assert.ok(!nombres.includes('Viejo X'), 'la fila de hoy se borró');
  assert.ok(nombres.includes('Ayer Z'), 'la fila de otro día se conserva');
});

test('no toca otros turnos ni otros corredores', () => {
  const { b, hojas } = entorno();
  guardar(b, [item('Perez Juan', 'P1')], { turno: 'MAÑANA' });
  guardar(b, [item('Gomez Ana', 'P1')], { corredor: 'SJL' });
  guardar(b, [item('Lopez Luis', 'P1')]);
  guardar(b, [item('Lopez Luis', 'P2')]);
  assert.strictEqual(dataRows(hojas.Prog_Estado).length, 3);
});

test('sin turno/fecha/corredor devuelve error en vez de acumular filas', () => {
  const { b, hojas } = entorno();
  const r = guardar(b, [item('Perez Juan', 'P1')], { turno: '' });
  assert.ok(r.error);
  assert.strictEqual(dataRows(hojas.Prog_Estado).length, 0);
});

test('items repetidos en el mismo envío se unifican', () => {
  const { b, hojas } = entorno();
  guardar(b, [item('Perez Juan', 'P1'), item('Perez Juan', 'P2')]);
  const filas = dataRows(hojas.Prog_Estado);
  assert.strictEqual(filas.length, 1);
  assert.strictEqual(filas[0][5], 'P2');
});

test('getProgEstado lee lo guardado aunque la fecha esté como Date y devuelve horas HH:mm', () => {
  const { b, hojas } = entorno();
  hojas.Prog_Estado.filas.push([new Date(Date.UTC(2026, 9, 5, 12)), 'TGA', 'TARDE', 'PEREZ JUAN', 'Perez Juan', 'P1', 'N/S', '', 'activo', '', new Date(Date.UTC(1899, 11, 30, 15, 30)), '', '']);
  const r = b.getProgEstado({ corredor: 'TGA', turno: 'TARDE', fecha: '05/10/2026' });
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].qap_hora_ini, '10:30');
});

// ---------- nombres ----------
const covBase = (b, hojas, filas) => filas.forEach(n => hojas.COVs_Base.filas.push([n, n.toUpperCase(), 'TGA', true, '01/10/2026', '']));
const base1 = n => ({ nombre_completo: n, nombre_clave: n.toUpperCase(), corredor: 'TGA', activo: true, ultima_aparicion: '05/10/2026', obs: '' });

test('NOMBRES: variante del mismo COV se unifica con el de la base y no crea uno nuevo', () => {
  const { b, hojas } = entorno();
  covBase(b, hojas, ['Garcia Lopez Juan']);
  const r = guardar(b, [item('Juan Garcia Lopez', 'P1')]);
  const f = dataRows(hojas.Prog_Estado)[0];
  assert.strictEqual(f[4], 'Garcia Lopez Juan');
  assert.strictEqual(f[3], 'GARCIA LOPEZ JUAN');
  assert.strictEqual(r.renombres['JUAN GARCIA LOPEZ'].nombre, 'Garcia Lopez Juan');
});

test('NOMBRES: personas distintas que comparten 2 palabras NO se fusionan', () => {
  const { b, hojas } = entorno();
  covBase(b, hojas, ['Garcia Ramos Juan']);
  guardar(b, [item('Garcia Lopez Juan', 'P1')]);
  assert.strictEqual(dataRows(hojas.Prog_Estado)[0][4], 'Garcia Lopez Juan');
});

test('NOMBRES: nombre ambiguo (encaja con 2 COVs) no se fusiona con ninguno', () => {
  const { b, hojas } = entorno();
  covBase(b, hojas, ['Garcia Lopez Juan', 'Garcia Ramos Juan']);
  guardar(b, [item('Garcia Juan', 'P1')]);
  assert.strictEqual(dataRows(hojas.Prog_Estado)[0][4], 'Garcia Juan');
});

test('COVs_Base: no crea duplicados ni modifica nombres existentes; fecha queda como texto', () => {
  const { b, hojas } = entorno();
  covBase(b, hojas, ['Garcia Lopez Juan']);
  const r = b.saveCOVsBaseSheet({ corredor: 'TGA', covs: [base1('Juan Garcia Lopez'), base1('Perez Gomez Ana')] });
  const filas = dataRows(hojas.COVs_Base);
  assert.strictEqual(filas.length, 2, 'solo se agrega Perez Gomez Ana');
  assert.strictEqual(r.nuevos, 1);
  assert.strictEqual(r.actualizados, 1);
  assert.ok(filas.some(f => f[0] === 'Garcia Lopez Juan'), 'el nombre existente no se tocó');
  filas.forEach(f => assert.strictEqual(typeof f[4], 'string'));
});

test('COVs_Base: un nombre ambiguo se omite en vez de crear un duplicado', () => {
  const { b, hojas } = entorno();
  covBase(b, hojas, ['Garcia Lopez Juan', 'Garcia Ramos Juan']);
  const r = b.saveCOVsBaseSheet({ corredor: 'TGA', covs: [base1('Garcia Juan')] });
  assert.strictEqual(dataRows(hojas.COVs_Base).length, 2);
  assert.strictEqual(r.omitidos.length, 1);
});

test('getCOVsBaseSheet devuelve ultima_aparicion como DD/MM/YYYY aunque sea Date', () => {
  const { b, hojas } = entorno();
  hojas.COVs_Base.filas.push(['Garcia Juan', 'GARCIA JUAN', 'TGA', true, new Date(Date.UTC(2026, 9, 5, 12)), '']);
  assert.strictEqual(b.getCOVsBaseSheet({ corredor: 'TGA' }).covs[0].ultima_aparicion, '05/10/2026');
});
