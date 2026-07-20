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
    if(String(rows[i][0])===did)
      return rows[i][4]===true || String(rows[i][4]).toUpperCase()==='TRUE';
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
    for(var i=1; i<rowsProg.length; i++) {
      if(!rowsProg[i][1]) continue;
      prog.push({
        nombre: String(rowsProg[i][1] || ''),
        punto: String(rowsProg[i][2] || ''),
        sentido: String(rowsProg[i][3] || ''),
        funcion: String(rowsProg[i][4] || ''),
        categoria: String(rowsProg[i][5] || ''),
        turno: String(rowsProg[i][6] || '')
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
  for(var i=1; i<rows.length; i++) {
    if(String(rows[i][0])===did) {
      sh.getRange(i+1,7).setValue(now);
      if(p.nombre) sh.getRange(i+1,2).setValue(p.nombre);
      if(p.turno)  sh.getRange(i+1,3).setValue(p.turno);
      if(p.ubi)    sh.getRange(i+1,4).setValue(p.ubi);
      var adm = rows[i][4]===true||String(rows[i][4]).toUpperCase()==='TRUE';
      var pp  = String(rows[i][8] ||'').toUpperCase(); // I perm_prog
      var ps  = String(rows[i][9] ||'').toUpperCase(); // J perm_sync
      var pa  = String(rows[i][10]||'').toUpperCase(); // K perm_admin
      var pv  = String(rows[i][11]||'').toUpperCase(); // L perm_voz
      return {isAdmin:adm, nombre:String(rows[i][1]||''), existente:true,
        perm_prog: pp!=='NO', perm_sync: ps!=='NO',
        perm_admin:pa!=='NO', perm_voz:  pv!=='NO'};
    }
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
      if(String(rows[j][7]) === data.fcmToken && String(rows[j][0]) !== data.did) {
        sh.getRange(j+1, 8).setValue(''); // limpiar token duplicado
      }
    }
  }
  
  for(var i=1; i<rows.length; i++) {
    if(String(rows[i][0]) === data.did) {
      if(data.nombre)   sh.getRange(i+1, 2).setValue(data.nombre);
      if(data.turno)    sh.getRange(i+1, 3).setValue(data.turno);
      if(data.ubi)      sh.getRange(i+1, 4).setValue(data.ubi);
      if(data.fcmToken) sh.getRange(i+1, 8).setValue(data.fcmToken);
      sh.getRange(i+1, 7).setValue(new Date().toISOString());
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
    if(String(rows[i][0])===data.targetDid) {
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
    if(!rows[j][0]) continue;
    covs.push({
      did:String(rows[j][0]), nombre:String(rows[j][1]||''),
      turno:String(rows[j][2]||''), ubi:String(rows[j][3]||''),
      es_admin:rows[j][4]===true||String(rows[j][4]).toUpperCase()==='TRUE',
      ultimo:String(rows[j][6]||''), tieneToken:!!rows[j][7],
      perm_prog: String(rows[j][8] ||'').toUpperCase()!=='NO',
      perm_sync: String(rows[j][9] ||'').toUpperCase()!=='NO',
      perm_admin:String(rows[j][10]||'').toUpperCase()!=='NO',
      perm_voz:  String(rows[j][11]||'').toUpperCase()!=='NO'
    });
  }
  return {covs:covs};
}

function getTokens(adminDid) {
  if(!isAdminDid(adminDid)) return {error:'No autorizado'};
  var rows = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Devices').getDataRange().getValues();
  var tokens = [];
  for(var j=1; j<rows.length; j++) {
    if(rows[j][7]) tokens.push({did:String(rows[j][0]),nombre:String(rows[j][1]||''),token:String(rows[j][7])});
  }
  return {tokens:tokens};
}

// ── AVISOS ──
function getAvisos(did) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sh = ss.getSheetByName('Avisos');
  if(!sh) return {avisos:[]};
  var rows = sh.getDataRange().getValues();
  var hoy = Utilities.formatDate(new Date(),'America/Lima','yyyy-MM-dd');
  var avisos = [];
  for(var i=1; i<rows.length; i++) {
    if(!rows[i][0]) continue;
    var activo = rows[i][3]===true||String(rows[i][3]).toUpperCase()==='TRUE';
    if(!activo) continue;
    var fechaProg = rows[i][6] ? String(rows[i][6]).slice(0,10) : '';
    if(fechaProg && fechaProg > hoy) continue;
    var para = String(rows[i][4]||'todos');
    var leidos = String(rows[i][5]||'');
    if((para==='todos'||para.indexOf(did)>=0) && leidos.indexOf(did)<0)
      avisos.push({id:String(rows[i][0]),mensaje:String(rows[i][1]),fecha:String(rows[i][2])});
  }
  return {avisos:avisos};
}

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
      sh.getRange(i+1,6).setValue(nuevo);

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
            if(String(rows[i][0])===t.did) {
              sh.getRange(i+1,8).setValue('');
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

function rowFechaStr(val) {
  if(val instanceof Date) return Utilities.formatDate(val,'America/Lima','yyyy-MM-dd');
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
      if(String(rows[i][1])===corredor && String(rows[i][2])===turno){
        var f = rowFechaStr(rows[i][0]);
        if(f && fechas.indexOf(f)<0) fechas.push(f);
      }
    }
    if(!fechas.length) return {items:[]};
    fechas.sort();
    fecha = fechas[fechas.length-1]; // la más reciente
  }

  var items = [];
  for(var i=1; i<rows.length; i++){
    if(rowFechaStr(rows[i][0])===fecha && String(rows[i][1])===corredor && String(rows[i][2])===turno){
      items.push({
        nombre_clave:String(rows[i][3]||''), nombre:String(rows[i][4]||''),
        punto:String(rows[i][5]||''),        sentido:String(rows[i][6]||''),
        funcion:String(rows[i][7]||''),      categoria:String(rows[i][8]||''),
        qap_estado:String(rows[i][9]||''),   qap_hora_ini:String(rows[i][10]||''),
        qap_hora_fin:String(rows[i][11]||''),qap_orden:rows[i][12]||''
      });
    }
  }
  return {items:items, fecha:fecha};
}


function saveProgEstado(data) {
  return conLock(function() {
    var sh=getOrCreateProgSheet();
    var fecha=String(data.fecha||''),corredor=String(data.corredor||''),turno=String(data.turno||'');
    var rows=sh.getDataRange().getValues();
    // Borrar filas existentes para esta fecha+corredor+turno (de abajo hacia arriba)
    var toDel=[];
    for(var i=rows.length-1;i>=1;i--) {
      if(rowFechaStr(rows[i][0])===fecha&&String(rows[i][1])===corredor&&String(rows[i][2])===turno)
        toDel.push(i+1);
    }
    toDel.sort(function(a,b){return b-a;});
    toDel.forEach(function(r){sh.deleteRow(r);});
    // Insertar filas nuevas en bloque
    var items=data.items||[];
    if(items.length>0) {
      var nr=items.map(function(it){
        return [fecha,corredor,turno,it.nombre_clave||'',it.nombre||'',
          it.punto||'',it.sentido||'',it.funcion||'',it.categoria||'',
          it.qap_estado||'',it.qap_hora_ini||'',it.qap_hora_fin||'',it.qap_orden||''];
      });
      var lr=ultimaFilaConDatos(sh);
      sh.getRange(lr+1,1,nr.length,13).setValues(nr);
      sh.getRange(lr+1,1,nr.length,1).setNumberFormat('@');
    }
    return {ok:true,count:items.length};
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
        ultima_aparicion:String(rows[i][4]||''),obs:String(rows[i][5]||'')});
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
      sh.setFrozenRows(1);
    }
    var corredor=data.corredor||'',covs=data.covs||[];
    var rows=sh.getDataRange().getValues(),existMap={};
    for(var i=1;i<rows.length;i++) {
      if(String(rows[i][2])===corredor) existMap[String(rows[i][1])]=i+1;
    }
    covs.forEach(function(cov){
      if(existMap[cov.nombre_clave]) {
        // Solo actualizar cols C-F; NO tocar nombre ni nombre_clave
        sh.getRange(existMap[cov.nombre_clave],3,1,4).setValues([[
          cov.corredor,cov.activo,cov.ultima_aparicion,cov.obs]]);
      } else {
        var lr=ultimaFilaConDatos(sh);
        sh.getRange(lr+1,1,1,6).setValues([[
          cov.nombre_completo,cov.nombre_clave,cov.corredor,
          cov.activo,cov.ultima_aparicion,cov.obs]]);
      }
    });
    // Ordenar A-Z por nombre_completo
    var lr2=sh.getLastRow();
    if(lr2>2) sh.getRange(2,1,lr2-1,6).sort(1);
    return {ok:true,count:covs.length};
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





