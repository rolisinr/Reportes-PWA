// =====================================================
// REPORTES TGA — Google Apps Script Backend v5
// =====================================================
// MEJORAS v5 (adaptadas de POCOYO):
// - LockService en escrituras concurrentes
// - CacheService en getConfig (más rápido, menos cuota)
// - setDevicePerm: admin cambia permisos desde la app
// - isAdminDid: validación limpia de admin por device_id
// - registerDevice: lee cols I,J,K,L (perm_prog/sync/admin/voz)
// - obtenerUltimaFila: evita el bug de appendRow con filas vacías formateadas
// =====================================================

var SHEET_ID = '17RIMxQ_eMNgv4-pjPUWO_1fyPuwFDyYv6UnuqjlfJhU';
var FCM_PROJECT = 'appcov-7c5e4';

// ── Índices de columnas (base 0). Para getRange usar DEV.x+1 ──
// Si se reordenan las hojas, basta con cambiar estas constantes.
var DEV = {did:0, nombre:1, turno:2, ubi:3, admin:4, registro:5, ultimo:6, token:7,
           perm_prog:8, perm_sync:9, perm_admin:10, perm_voz:11};
var PRG = {fecha:0, corredor:1, turno:2, clave:3, nombre:4, punto:5, sentido:6,
           funcion:7, categoria:8};


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

// ── Routing ──
function doGet(e) {
  var params = e.parameter, action = params.action || '';
  try {
    if(action==='ping')        return ok({pong:true, ts:new Date().toISOString()});
    if(action==='config')      return ok(getConfig());
    if(action==='register')    return ok(registerDevice(params));
    if(action==='avisos')      return ok(getAvisos(params.did));
    if(action==='covs')        return ok(getCOVs(params.did));
    if(action==='tokens')      return ok(getTokens(params.did));
    if(action==='prog_estado') return ok(getProgEstado(params));
    if(action==='covs_base')   return ok(getCOVsBaseSheet(params));
    return ok({error:'Accion desconocida: '+action});
  } catch(e){ return ok({error:e.toString()}); }
}

function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  try {
    if(data.action==='aviso')        return ok(createAviso(data));
    if(data.action==='leido')        return ok(markRead(data));
    if(data.action==='update')       return ok(updateDevice(data));
    if(data.action==='pushall')      return ok(sendPushAll(data));
    if(data.action==='prog_estado')  return ok(saveProgEstado(data));
    if(data.action==='covs_base')    return ok(saveCOVsBaseSheet(data));
    if(data.action==='setDevicePerm')return ok(setDevicePerm(data));
    return ok({error:'Accion desconocida'});
  } catch(e){ return ok({error:e.toString()}); }
}

function ok(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Utilidades (inspiradas en POCOYO/Utilidades.gs) ──

// LockService: evita escrituras concurrentes (dos COVs subiendo al mismo tiempo)
function conLock(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// Última fila con datos reales en col A (evita bug de appendRow con celdas formateadas vacías)
function ultimaFilaConDatos(sh) {
  var vals = sh.getRange('A:A').getValues();
  for(var i=vals.length-1; i>=0; i--) {
    if(vals[i][0] !== '' && vals[i][0] !== null) return i+1;
  }
  return 1;
}

// Validar que un device_id es admin
function isAdminDid(did) {
  var rows = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Devices').getDataRange().getValues();
  for(var i=1; i<rows.length; i++) {
    if(String(rows[i][DEV.did])===did)
      return rows[i][DEV.admin]===true || String(rows[i][DEV.admin]).toUpperCase()==='TRUE';
  }
  return false;
}

// ── CONFIG (con caché de 5 min para no leer el Sheet en cada llamada) ──
function getConfig() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('covapp_config_v2');
  if(cached) return JSON.parse(cached);
  
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Config');
  var rows = sh.getDataRange().getValues();
  var cfg = {};
  rows.forEach(function(r){ if(r[0]) cfg[String(r[0]).trim()] = r[1]; });

  var shPts = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Punto_cov');
  var puntos = [];
  if (shPts) {
    var rowsPts = shPts.getDataRange().getValues();
    for(var i=1; i<rowsPts.length; i++) {
      if(!rowsPts[i][0] && !rowsPts[i][2]) continue; // Saltar vacíos
      puntos.push({
        avenida: String(rowsPts[i][0] || ''),
        cuadra: String(rowsPts[i][1] || ''),
        interseccion: String(rowsPts[i][2] || ''),
        tranquera: String(rowsPts[i][3] || ''),
        sentido: String(rowsPts[i][4] || '')
      });
    }
  }

  var shProg = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Prog_Estado');
  var prog = [];
  if (shProg) {
    var rowsProg = shProg.getDataRange().getValues();
    // Find most recent date
    var recentDate = "";
    if (rowsProg.length > 1) {
      var fechas = [];
      for(var i=1; i<rowsProg.length; i++) {
        var f = rowFechaStr(rowsProg[i][PRG.fecha]);
        if (f && fechas.indexOf(f) === -1) fechas.push(f);
      }
      if (fechas.length > 0) {
        fechas.sort(function(a, b) { return fechaClave(a) - fechaClave(b); });
        recentDate = fechas[fechas.length - 1];
      }
    }
    
    for(var i=1; i<rowsProg.length; i++) {
      if(!rowsProg[i][PRG.nombre]) continue;
      if(recentDate && rowFechaStr(rowsProg[i][PRG.fecha]) !== recentDate) continue;
      
      prog.push({
        nombre: String(rowsProg[i][PRG.nombre] || ''),
        punto: String(rowsProg[i][PRG.punto] || ''),
        sentido: String(rowsProg[i][PRG.sentido] || ''),
        funcion: String(rowsProg[i][PRG.funcion] || ''),
        categoria: String(rowsProg[i][PRG.categoria] || ''),
        turno: String(rowsProg[i][PRG.turno] || '')
      });
    }
  }

  var res = {config: cfg, puntos: puntos, prog: prog};
  cache.put('covapp_config_v2', JSON.stringify(res), 300);
  return res;
}

// ── DEVICES ──
// A=device_id|B=nombre|C=turno|D=ubicacion|E=es_admin
// F=fecha_registro|G=ultimo_acceso|H=fcmToken
// I=perm_prog|J=perm_sync|K=perm_admin|L=perm_voz

function registerDevice(p) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Devices');
  var rows = sh.getDataRange().getValues();
  var now = new Date().toISOString(), did = p.did||'';
  var targetRow = -1;

  // 1. Check by did
  for(var i=1; i<rows.length; i++) {
    if(String(rows[i][DEV.did])===did) {
      targetRow = i;
      break;
    }
  }

  // 2. Si no está por did, buscar por nombre (mismas palabras en otro orden, tipeos o
  //    nombre contenido). Si hay más de una persona posible NO se reasigna (evita mezclar).
  if (targetRow === -1 && p.nombre) {
    var cand = [];
    for(var i=1; i<rows.length; i++) {
      if(String(rows[i][DEV.nombre]||'').trim()) cand.push({nombre_completo:String(rows[i][DEV.nombre]), fila:i});
    }
    var rr = buscarCOV(p.nombre, cand);
    if (rr.match) {
      targetRow = rr.match.fila;
      sh.getRange(targetRow+1, DEV.did+1).setValue(did); // Update with new device ID
    }
  }

  if (targetRow !== -1) {
    var i = targetRow;
    sh.getRange(i+1, DEV.ultimo+1).setValue(now);
    if(p.nombre) sh.getRange(i+1, DEV.nombre+1).setValue(p.nombre);
    if(p.turno)  sh.getRange(i+1, DEV.turno+1).setValue(p.turno);
    if(p.ubi)    sh.getRange(i+1, DEV.ubi+1).setValue(p.ubi);
    var adm = rows[i][DEV.admin]===true||String(rows[i][DEV.admin]).toUpperCase()==='TRUE';
    var pp  = String(rows[i][DEV.perm_prog] ||'').toUpperCase(); // I perm_prog
    var ps  = String(rows[i][DEV.perm_sync] ||'').toUpperCase(); // J perm_sync
    var pa  = String(rows[i][DEV.perm_admin]||'').toUpperCase(); // K perm_admin
    var pv  = String(rows[i][DEV.perm_voz]||'').toUpperCase(); // L perm_voz
    return {isAdmin:adm, nombre:String(rows[i][DEV.nombre]||''), existente:true,
      perm_prog: pp!=='NO', perm_sync: ps!=='NO',
      perm_admin:pa!=='NO', perm_voz:  pv!=='NO'};
  }

  // Nuevo dispositivo (10 columnas A-J + K + L)
  sh.appendRow([did,p.nombre||'',p.turno||'',p.ubi||'',false,now,now,'','','','','']);
  return {isAdmin:false,nombre:p.nombre||'',nuevo:true,
    perm_prog:true,perm_sync:true,perm_admin:true,perm_voz:true};
}

function updateDevice(data) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Devices');
  var rows = sh.getDataRange().getValues();
  
  // Si hay un token FCM nuevo, limpiar ese token de otros dispositivos
  if(data.fcmToken) {
    for(var j=1; j<rows.length; j++) {
      if(String(rows[j][DEV.token]) === data.fcmToken && String(rows[j][DEV.did]) !== data.did) {
        sh.getRange(j+1, DEV.token+1).setValue(''); // limpiar token duplicado
      }
    }
  }
  
  for(var i=1; i<rows.length; i++) {
    if(String(rows[i][DEV.did]) === data.did) {
      if(data.nombre)   sh.getRange(i+1, DEV.nombre+1).setValue(data.nombre);
      if(data.turno)    sh.getRange(i+1, DEV.turno+1).setValue(data.turno);
      if(data.ubi)      sh.getRange(i+1, DEV.ubi+1).setValue(data.ubi);
      if(data.fcmToken) sh.getRange(i+1, DEV.token+1).setValue(data.fcmToken);
      sh.getRange(i+1, DEV.ultimo+1).setValue(new Date().toISOString());
      return {ok: true};
    }
  }
  return {error: 'Dispositivo no encontrado'};
}

// setDevicePerm: el admin cambia permisos de otro COV desde la app
function setDevicePerm(data) {
  if(!isAdminDid(data.did)) return {error:'No autorizado'};
  var colMap = {perm_prog:9, perm_sync:10, perm_admin:11, perm_voz:12, es_admin:5};
  var col = colMap[data.perm];
  if(!col) return {error:'Permiso desconocido: '+data.perm};
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Devices');
  var rows = sh.getDataRange().getValues();
  for(var i=1; i<rows.length; i++) {
    if(String(rows[i][DEV.did])===data.targetDid) {
      sh.getRange(i+1,col).setValue(data.value||'');
      return {ok:true, perm:data.perm, value:data.value};
    }
  }
  return {error:'Dispositivo no encontrado'};
}

function getCOVs(adminDid) {
  if(!isAdminDid(adminDid)) return {error:'No autorizado'};
  var rows = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Devices').getDataRange().getValues();
  var covs = [];
  for(var j=1; j<rows.length; j++) {
    if(!rows[j][DEV.did]) continue;
    covs.push({
      did:String(rows[j][DEV.did]), nombre:String(rows[j][DEV.nombre]||''),
      turno:String(rows[j][DEV.turno]||''), ubi:String(rows[j][DEV.ubi]||''),
      es_admin:rows[j][DEV.admin]===true||String(rows[j][DEV.admin]).toUpperCase()==='TRUE',
      ultimo:String(rows[j][DEV.ultimo]||''), tieneToken:!!rows[j][DEV.token],
      perm_prog: String(rows[j][DEV.perm_prog] ||'').toUpperCase()!=='NO',
      perm_sync: String(rows[j][DEV.perm_sync] ||'').toUpperCase()!=='NO',
      perm_admin:String(rows[j][DEV.perm_admin]||'').toUpperCase()!=='NO',
      perm_voz:  String(rows[j][DEV.perm_voz]||'').toUpperCase()!=='NO'
    });
  }
  return {covs:covs};
}

function getTokens(adminDid) {
  if(!isAdminDid(adminDid)) return {error:'No autorizado'};
  var rows = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Devices').getDataRange().getValues();
  var tokens = [];
  for(var j=1; j<rows.length; j++) {
    if(rows[j][DEV.token]) tokens.push({did:String(rows[j][DEV.did]),nombre:String(rows[j][DEV.nombre]||''),token:String(rows[j][DEV.token])});
  }
  return {tokens:tokens};
}

// ── AVISOS ──
function createAviso(data) {
  if(!isAdminDid(data.did)) return {error:'No autorizado'};
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Avisos');
  if(!sh) {
    sh = ss.insertSheet('Avisos');
    sh.appendRow(['id','mensaje','fecha','activo','para','leido_por','fecha_prog']);
    sh.setFrozenRows(1);
  }
  var id = String(Date.now());
  sh.appendRow([
    id,
    data.mensaje || '',
    new Date().toISOString(),
    'TRUE',
    data.para || 'todos',
    '',
    data.fecha_prog || ''
  ]);
  return {ok: true, id: id};
}

function markRead(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Avisos');
  var rows = sh.getDataRange().getValues();
  for(var i=1; i<rows.length; i++) {
    if(String(rows[i][0])===String(data.id)) {
      var cur = String(rows[i][5]||'');
      // Guardar "Nombre(id4)" — legible y verificable
      var id4 = (data.did||'').slice(-4);
      var quien = (data.nombre||'usuario') + '(' + id4 + ')';
      if(cur.indexOf(id4) >= 0) return {ok:true}; // ya estaba marcado
      var nuevo = cur ? cur + ', ' + quien : quien;
      sh.getRange(i+1,6).setValue(nuevo); // Avisos col F: leido_por

      // Auto-desactivar si todos los dispositivos ya leyeron
      var devSh = ss.getSheetByName('Devices');
      var devRows = devSh.getDataRange().getValues();
      var totalDevs = 0, leidos = 0;
      var para = String(rows[i][4]||'todos');
      for(var j=1; j<devRows.length; j++) {
        if(!devRows[j][0]) continue;
        var devId = String(devRows[j][0]);
        if(para !== 'todos' && para.indexOf(devId) < 0) continue;
        totalDevs++;
        if(nuevo.indexOf(devId.slice(-4)) >= 0) leidos++;
      }
      if(totalDevs > 0 && leidos >= totalDevs) {
        sh.getRange(i+1,4).setValue('FALSE'); // todos leyeron → desactivar
      }
      return {ok: true};
    }
  }
  return {error:'No encontrado'};
}

function getAvisos(did) {
  did = String(did||'');
  if(!did) return {avisos:[]}; // sin device_id indexOf('') marcaría todo como leído
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Avisos');
  if(!sh) return {avisos:[]};
  var rows = sh.getDataRange().getValues();
  var hoy = Utilities.formatDate(new Date(),'America/Lima','yyyy-MM-dd');
  var did4 = did.slice(-4); // últimos 4 chars del device_id
  var avisos = [];
  for(var i=1; i<rows.length; i++) {
    if(!rows[i][0]) continue;
    var activo = rows[i][3]===true||String(rows[i][3]).toUpperCase()==='TRUE';
    if(!activo) continue;
    var fechaProg = rows[i][6] ? String(rows[i][6]).slice(0,10) : '';
    if(fechaProg && fechaProg > hoy) continue;
    var para = String(rows[i][4]||'todos');
    var leidos = String(rows[i][5]||'');
    // Verificar por device_id completo O por últimos 4 chars
    var yaLeido = leidos.indexOf(did) >= 0 || leidos.indexOf(did4) >= 0;
    var esDestinatario = para === 'todos' || para.indexOf(did) >= 0;
    if(esDestinatario && !yaLeido)
      avisos.push({id:String(rows[i][0]),mensaje:String(rows[i][1]),fecha:String(rows[i][2])});
  }
  return {avisos:avisos};
}

// ── FCM PUSH ──
function sendPushAll(data) {
  if(!isAdminDid(data.did)) return {error:'No autorizado'};
  var tokensRes = getTokens(data.did);
  if(tokensRes.error) return tokensRes;
  var tokens = tokensRes.tokens;
  if(!tokens.length) return {error:'Sin tokens FCM registrados'};
  var oauthToken = ScriptApp.getOAuthToken();
  var url = 'https://fcm.googleapis.com/v1/projects/'+FCM_PROJECT+'/messages:send';
  var sent=0, errors=0, lastError='';
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Devices');
  var rows = sh.getDataRange().getValues();

  tokens.forEach(function(t) {
    var payload = JSON.stringify({message:{token:t.token,
      notification:{title:data.title||'Aviso TGA',body:data.body||''},
      webpush:{notification:{icon:'/icon-192.png',vibrate:[200,100,200]}}}});
    try {
      var r = UrlFetchApp.fetch(url,{method:'post',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+oauthToken},
        payload:payload, muteHttpExceptions:true});
      var code = r.getResponseCode();
      if(code===200) {
        sent++;
      } else {
        errors++;
        lastError = r.getContentText().slice(0,300); // ← SOLO ESTO ES NUEVO
        if(code===404 || code===400) {
          for(var i=1;i<rows.length;i++){
            if(String(rows[i][DEV.did])===t.did) {
              sh.getRange(i+1, DEV.token+1).setValue('');
              break;
            }
          }
        }
      }
    } catch(e){ errors++; lastError=e.message; }
  });
  return {ok:true, sent:sent, errors:errors, total:tokens.length, lastError:lastError};
}

// ── PROGRAMACIÓN (con LockService) ──
var PROG_HEADERS=['fecha','corredor','turno','nombre_clave','nombre','punto',
                  'sentido','funcion','categoria','qap_estado',
                  'qap_hora_ini','qap_hora_fin','qap_orden'];

function getOrCreateProgSheet() {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Prog_Estado');
  if(!sh) {
    sh=ss.insertSheet('Prog_Estado');
    sh.appendRow(PROG_HEADERS);
    sh.getRange('A:A').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}

// Convierte 'yyyy-MM-dd' o 'DD/MM/YYYY' en un número comparable (yyyymmdd)
function fechaClave(str) {
  var s = String(str||'').trim(), m;
  if((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return +m[1]*10000 + +m[2]*100 + +m[3];
  if((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return +m[3]*10000 + +m[2]*100 + +m[1];
  return 0;
}

// ¿La celda de fecha corresponde a "fecha"? Sin importar si Sheets la guardó como
// Date, 'yyyy-MM-dd' o 'DD/MM/YYYY' (antes la comparación de texto fallaba y las
// filas viejas nunca se borraban).
function mismaFecha(celda, fecha) {
  var a = fechaClave(rowFechaStr(celda)), b = fechaClave(fecha);
  return (a && b) ? a === b : rowFechaStr(celda) === String(fecha||'').slice(0,10);
}

// Fecha como DD/MM/YYYY (formato de la app) aunque Sheets la haya convertido en Date
function fechaDMY(val) {
  if(esFecha(val)) return Utilities.formatDate(val,'America/Lima','dd/MM/yyyy');
  return String(val||'');
}

// Hora como HH:mm aunque Sheets la haya convertido en Date (p. ej. "10:30")
function horaStr(val) {
  if(esFecha(val)) return Utilities.formatDate(val,'America/Lima','HH:mm');
  return String(val||'');
}

function esFecha(v) { return Object.prototype.toString.call(v)==='[object Date]'; }

function rowFechaStr(val) {
  if(esFecha(val)) return Utilities.formatDate(val,'America/Lima','yyyy-MM-dd');
  return String(val||'').slice(0,10);
}

function getProgEstado(params) {
  var sh = getOrCreateProgSheet();
  var rows = sh.getDataRange().getValues();
  var corredor = String(params.corredor||'');
  var turno    = String(params.turno||'');
  var fecha    = String(params.fecha||'');

  // Sin fecha → buscar la más reciente para ese corredor+turno
  if(!fecha) {
    var fechas = [];
    for(var i=1; i<rows.length; i++){
      if(String(rows[i][1]).toUpperCase()===corredor.toUpperCase() && String(rows[i][2]).toUpperCase()===turno.toUpperCase()){
        var f = rowFechaStr(rows[i][0]);
        if(f && fechas.indexOf(f)<0) fechas.push(f);
      }
    }
    if(!fechas.length) return {items:[]};
    // Fix sorting for DD/MM/YYYY
    fechas.sort(function(a, b) {
      var pa = a.split('/');
      var pb = b.split('/');
      if (pa.length === 3 && pb.length === 3) {
        var da = new Date(pa[2], pa[1]-1, pa[0]).getTime();
        var db = new Date(pb[2], pb[1]-1, pb[0]).getTime();
        return da - db;
      }
      return a.localeCompare(b);
    });
    fecha = fechas[fechas.length-1]; // la más reciente
  }

  var items = [];
  for(var i=1; i<rows.length; i++){
    if(mismaFecha(rows[i][0],fecha) && String(rows[i][1]).toUpperCase()===corredor.toUpperCase() && String(rows[i][2]).toUpperCase()===turno.toUpperCase()){
      items.push({
        nombre_clave:String(rows[i][3]||''), nombre:String(rows[i][4]||''),
        punto:String(rows[i][5]||''),        sentido:String(rows[i][6]||''),
        funcion:String(rows[i][7]||''),      categoria:String(rows[i][8]||''),
        qap_estado:String(rows[i][9]||''),   qap_hora_ini:horaStr(rows[i][10]),
        qap_hora_fin:horaStr(rows[i][11]),qap_orden:rows[i][12]||''
      });
    }
  }
  return {items:items, fecha:fecha};
}


// Lee la base de COVs de un corredor: [{nombre_completo, nombre_clave}]
function leerBaseCOVs(corredor) {
  var sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName('COVs_Base');
  var base = [];
  if(!sh) return base;
  var rows = sh.getDataRange().getValues();
  for(var i=1;i<rows.length;i++) {
    if(String(rows[i][2])===corredor && (rows[i][0]||rows[i][1]))
      base.push({nombre_completo:String(rows[i][0]||''), nombre_clave:String(rows[i][1]||'')});
  }
  return base;
}

// Reemplaza (no acumula): borra las filas existentes de fecha+corredor+turno y escribe las nuevas.
// Los nombres se normalizan contra COVs_Base para no crear variantes ni nombres combinados.
function saveProgEstado(data) {
  return conLock(function() {
    var sh=getOrCreateProgSheet();
    var fecha=String(data.fecha||''),corredor=String(data.corredor||''),turno=String(data.turno||'');
    if(!fecha||!corredor||!turno) return {error:'Faltan fecha, corredor o turno'};
    var rows=sh.getDataRange().getValues();

    // 1. Borrar filas anteriores del mismo día/corredor/turno (en bloques contiguos, de abajo hacia arriba)
    var filas=[], eliminadas=0;
    for(var i=1;i<rows.length;i++) {
      if(mismaFecha(rows[i][0],fecha) && String(rows[i][1]).toUpperCase()===corredor.toUpperCase()
         && String(rows[i][2]).toUpperCase()===turno.toUpperCase()) filas.push(i+1);
    }
    for(var k=filas.length-1;k>=0;k--) {
      var fin=filas[k], ini=fin;
      while(k>0 && filas[k-1]===ini-1) { k--; ini=filas[k]; }
      sh.deleteRows(ini, fin-ini+1);
      eliminadas += fin-ini+1;
    }

    // 2. Normalizar nombres contra la base y quitar repetidos (gana la última aparición)
    var base=leerBaseCOVs(corredor), renombres={}, vistos={}, items=[];
    (data.items||[]).forEach(function(it){
      var original=String(it.nombre_clave||''), nombre=String(it.nombre||''), clave=original;
      if(nombre||clave) {
        var r=buscarCOV(nombre||clave, base);
        if(r.match) {
          nombre=r.match.nombre_completo; clave=r.match.nombre_clave;
          if(original && original!==clave) renombres[original]={nombre_clave:clave,nombre:nombre};
        }
      }
      var k=nombreClave(clave||nombre);
      var fila={nombre_clave:clave,nombre:nombre,it:it};
      if(k && vistos[k]!==undefined) items[vistos[k]]=fila; else { if(k) vistos[k]=items.length; items.push(fila); }
    });

    // 3. Escribir en bloque. El formato de texto va ANTES de los valores: si va después,
    //    Sheets ya convirtió '05/10/2026' en Date y '10:30' en hora.
    if(items.length>0) {
      var nr=items.map(function(f){
        var it=f.it;
        return [fecha,corredor,turno,f.nombre_clave,f.nombre,
          it.punto||'',it.sentido||'',it.funcion||'',it.categoria||'',
          it.qap_estado||'',it.qap_hora_ini||'',it.qap_hora_fin||'',it.qap_orden||''];
      });
      var lr=ultimaFilaConDatos(sh);
      sh.getRange(lr+1,1,nr.length,1).setNumberFormat('@');
      sh.getRange(lr+1,11,nr.length,2).setNumberFormat('@');
      sh.getRange(lr+1,1,nr.length,13).setValues(nr);
    }
    CacheService.getScriptCache().remove('covapp_config_v2'); // la programación cambió: invalidar caché
    return {ok:true,count:items.length,eliminadas:eliminadas,renombres:renombres};
  });
}

// ── BASE DE COVs (con LockService) ──
function getCOVsBaseSheet(params) {
  var ss=SpreadsheetApp.openById(SHEET_ID);
  var sh=ss.getSheetByName('COVs_Base');
  if(!sh) return {covs:[]};
  var rows=sh.getDataRange().getValues(),corredor=params.corredor||'',covs=[];
  for(var i=1;i<rows.length;i++) {
    if(!corredor||String(rows[i][2])===corredor)
      covs.push({nombre_completo:String(rows[i][0]||''),nombre_clave:String(rows[i][1]||''),
        corredor:String(rows[i][2]||''),
        activo:rows[i][3]===true||String(rows[i][3]).toUpperCase()==='TRUE',
        ultima_aparicion:fechaDMY(rows[i][4]),obs:String(rows[i][5]||'')});
  }
  return {covs:covs};
}

function saveCOVsBaseSheet(data) {
  return conLock(function() {
    var ss=SpreadsheetApp.openById(SHEET_ID);
    var sh=ss.getSheetByName('COVs_Base');
    if(!sh){
      sh=ss.insertSheet('COVs_Base');
      sh.appendRow(['nombre_completo','nombre_clave','corredor','activo','ultima_aparicion','obs']);
      sh.getRange('E:E').setNumberFormat('@'); // fechas como texto (DD/MM/YYYY)
      sh.setFrozenRows(1);
    }
    var corredor=String(data.corredor||''),covs=data.covs||[];
    var rows=sh.getDataRange().getValues(), base=[];
    for(var i=1;i<rows.length;i++) {
      if(String(rows[i][2])===corredor)
        base.push({nombre_completo:String(rows[i][0]||''),nombre_clave:String(rows[i][1]||''),fila:i+1});
    }
    var actualizados=0, nuevos=0, omitidos=[], alias={};
    covs.forEach(function(cov){
      var r=buscarCOV(cov.nombre_clave||cov.nombre_completo, base);
      if(r.match) {
        // Existe (misma clave o mismo nombre en otro orden / con tipeos): actualizar
        // solo C-F; NO tocar nombre_completo ni nombre_clave de la base.
        if(r.match.nombre_clave!==cov.nombre_clave) alias[cov.nombre_clave]=r.match.nombre_clave;
        sh.getRange(r.match.fila,5).setNumberFormat('@');
        sh.getRange(r.match.fila,3,1,4).setValues([[corredor,cov.activo,String(cov.ultima_aparicion||''),cov.obs||'']]);
        actualizados++;
      } else if(r.ambiguo) {
        omitidos.push(cov.nombre_completo||cov.nombre_clave); // varias personas posibles: no crear
      } else if(cov.nombre_completo||cov.nombre_clave) {
        var lr=ultimaFilaConDatos(sh);
        sh.getRange(lr+1,5).setNumberFormat('@');
        sh.getRange(lr+1,1,1,6).setValues([[
          cov.nombre_completo,cov.nombre_clave,corredor,
          cov.activo,String(cov.ultima_aparicion||''),cov.obs||'']]);
        base.push({nombre_completo:cov.nombre_completo,nombre_clave:cov.nombre_clave,fila:lr+1});
        nuevos++;
      }
    });
    // Ordenar A-Z por nombre_completo
    var lr2=sh.getLastRow();
    if(lr2>2) sh.getRange(2,1,lr2-1,6).sort(1);
    return {ok:true,count:covs.length,actualizados:actualizados,nuevos:nuevos,omitidos:omitidos,alias:alias};
  });
}

/*
appsscript.json — reemplaza TODO el contenido:
{
  "timeZone": "America/Lima",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "oauthScopes": [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/script.external_request",
    "https://www.googleapis.com/auth/firebase.messaging"
  ]
}
*/

function forzarAuth() {
  var token = ScriptApp.getOAuthToken();
  UrlFetchApp.fetch('https://fcm.googleapis.com/v1/projects/covapp-3fe9d/messages:send', {
    method: 'post',
    headers: {'Authorization': 'Bearer ' + token},
    payload: '{}',
    muteHttpExceptions: true
  });
}

function revocarYReiniciar() {
  ScriptApp.invalidateAuth();
}





