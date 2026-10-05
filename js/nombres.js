// =============================================
// COTEJO DE NOMBRES DE COVs
// Este bloque es compartido con el Apps Script: scripts/update-sw.js lo copia
// automáticamente a "API appscript.js". Editar solo aquí y mantenerlo en ES5.
// =============================================
// >>> NOMBRES >>>
var NOMBRE_PARTICULAS = ['DE', 'DEL', 'LA', 'LAS', 'LOS', 'Y'];

// Normaliza: mayúsculas, sin tildes ni signos, sin partículas ("DE LA CRUZ" -> "CRUZ")
function nombreTokens(nombre) {
  var s = String(nombre || '').toUpperCase();
  s = (s.normalize ? s.normalize('NFD') : s).replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^A-Z0-9\s]/g, ' ');
  return s.split(/\s+/).filter(function (t) {
    return t && NOMBRE_PARTICULAS.indexOf(t) < 0;
  });
}

// Clave canónica de un nombre (orden original, sin tildes ni signos)
function nombreClave(nombre) { return nombreTokens(nombre).join(' '); }

function distanciaEdicion(a, b) {
  var m = a.length, n = b.length, prev = [], cur, i, j;
  for (j = 0; j <= n; j++) prev[j] = j;
  for (i = 1; i <= m; i++) {
    cur = [i];
    for (j = 1; j <= n; j++) {
      cur[j] = a.charAt(i - 1) === b.charAt(j - 1)
        ? prev[j - 1]
        : 1 + Math.min(prev[j], cur[j - 1], prev[j - 1]);
    }
    prev = cur;
  }
  return prev[n];
}

// Dos palabras son la misma si son iguales o difieren por un error de tipeo
// (solo en palabras largas, para no confundir apellidos cortos distintos)
function palabraIgual(a, b) {
  if (a === b) return true;
  var largo = Math.min(a.length, b.length);
  if (largo < 5) return false;
  return distanciaEdicion(a, b) <= (largo >= 9 ? 2 : 1);
}

// Cuántas palabras de la lista corta están en la larga (sin reutilizar palabras)
function palabrasEnComun(corta, larga) {
  var libres = larga.slice(), n = 0, i, j;
  for (i = 0; i < corta.length; i++) {
    for (j = 0; j < libres.length; j++) {
      if (libres[j] !== null && palabraIgual(corta[i], libres[j])) { libres[j] = null; n++; break; }
    }
  }
  return n;
}

// Grado de coincidencia entre dos nombres:
//   3 = mismas palabras (en cualquier orden, tolerando tipeos)
//   2 = uno contiene al otro (p. ej. "GARCIA JUAN" dentro de "GARCIA LOPEZ JUAN CARLOS")
//   0 = personas distintas (comparten solo algunas palabras)
function coincidenciaNombre(a, b) {
  var ta = nombreTokens(a), tb = nombreTokens(b);
  var corta = ta.length <= tb.length ? ta : tb;
  var larga = ta.length <= tb.length ? tb : ta;
  if (corta.length < 2) return 0;
  if (palabrasEnComun(corta, larga) !== corta.length) return 0;
  return corta.length === larga.length ? 3 : 2;
}

// Busca el COV de la base que corresponde a "nombre".
// Devuelve {match, ambiguo}. Si dos o más COVs distintos encajan igual de bien
// NO se elige ninguno (ambiguo=true) para no fusionar personas diferentes.
function buscarCOV(nombre, base) {
  var clave = nombreClave(nombre), mejor = 0, candidatos = [], i, b, g;
  if (!clave) return { match: null, ambiguo: false };
  for (i = 0; i < base.length; i++) {
    b = base[i];
    if (nombreClave(b.nombre_clave || b.nombre_completo) === clave) return { match: b, ambiguo: false };
  }
  for (i = 0; i < base.length; i++) {
    b = base[i];
    g = coincidenciaNombre(nombre, b.nombre_completo || b.nombre_clave);
    if (g > mejor) { mejor = g; candidatos = [b]; }
    else if (g === mejor && g > 0) candidatos.push(b);
  }
  if (candidatos.length === 1) return { match: candidatos[0], ambiguo: false };
  return { match: null, ambiguo: candidatos.length > 1 };
}
// <<< NOMBRES <<<
