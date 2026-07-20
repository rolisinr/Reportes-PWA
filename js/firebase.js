    // =============================================
    // FASE 4 - FIREBASE PUSH NOTIFICATIONS
    // =============================================

    var FB_CONFIG = CONFIG.FIREBASE;
    var VAPID_KEY = CONFIG.VAPID_KEY;


    function initFirebase() {
      try {
        if (typeof firebase === 'undefined') return;
        if (!firebase.apps || !firebase.apps.length) {
          // Config hardcodeado aquí para evitar problemas de scope/timing
          firebase.initializeApp(CONFIG.FIREBASE);
        }
        if (!AppState.fbMessaging) {
          AppState.fbMessaging = firebase.messaging();
          AppState.fbMessaging.onMessage(function (payload) {
            var n = payload.notification || {};
            showToast((n.title || 'Aviso') + (n.body ? ': ' + n.body : ''));
            var banner = document.getElementById('aviso-banner');
            var txt = document.getElementById('aviso-msg-txt');
            if (banner && txt) {
              txt.textContent = (n.title ? n.title + ': ' : '') + (n.body || '');
              banner.dataset.id = 'fcm_' + Date.now();
              banner.classList.add('show');
            }
          });
        }
        console.log('Firebase OK');
      } catch (e) {
        console.log('Firebase init error:', e.message);
        AppState.fbMessaging = null;
      }
    }

    // Refresco automático y silencioso del token (se llama al abrir la app)
    async function refreshFCMToken() {
      if (!AppState.fbMessaging) initFirebase();
      if (!AppState.fbMessaging) return;
      if (Notification.permission !== 'granted') return;
      try {
        var _m = AppState.fbMessaging;
        if (!_m) return;
        var swReg = await navigator.serviceWorker.ready;
        var token = await _m.getToken({ vapidKey: CONFIG.VAPID_KEY, serviceWorkerRegistration: swReg });
        if (token && token !== AppState.fcmToken) {
          AppState.fcmToken = token;
          localStorage.setItem('fcm_token', token);
          await saveFCMTokenToSheet(token); // actualiza silenciosamente en Sheet
          console.log('FCM token actualizado automáticamente');
        }
      } catch (e) { console.log('FCM refresh:', e.message); }
    }

    // Registro manual (primera vez, desde ⚙️)
    async function registerFCMToken() {
      // Esperar a que Firebase SDK cargue (max 5 seg)
      for (var i = 0; i < 10; i++) {
        if (typeof firebase !== 'undefined') break;
        await new Promise(function (r) { setTimeout(r, 500); });
      }
      if (typeof firebase === 'undefined') {
        showToast('⚠️ Firebase no cargó. Verifica tu conexión.');
        return;
      }
      // Inicializar si no está listo
      if (!AppState.fbMessaging) initFirebase();
      if (!AppState.fbMessaging) {
        showToast('⚠️ No se pudo iniciar Firebase. Recarga la app.');
        return;
      }
      // Pedir permiso si no está concedido
      if (Notification.permission === 'default') {
        var perm = await Notification.requestPermission();
        if (perm !== 'granted') { showToast('⚠️ Permiso de notificaciones denegado'); return; }
      }
      if (Notification.permission !== 'granted') {
        showToast('⚠️ Notificaciones bloqueadas. Actívalas en Ajustes del navegador.');
        return;
      }
      try {
        var _msg = AppState.fbMessaging;
        if (!_msg) throw new Error('AppState.fbMessaging no disponible');
        // VAPID hardcodeado para evitar problemas de scope
        var _vapid = CONFIG.VAPID_KEY;
        var swReg = await navigator.serviceWorker.ready;
        _msg = AppState.fbMessaging || _msg;
        if (!_msg) throw new Error('AppState.fbMessaging null');
        var token = await _msg.getToken({
          vapidKey: _vapid,
          serviceWorkerRegistration: swReg
        });
        if (token) {
          AppState.fcmToken = token;
          localStorage.setItem('fcm_token', token);
          await saveFCMTokenToSheet(token);
          showToast('✓ Notificaciones activadas correctamente');
        } else {
          showToast('⚠️ No se pudo obtener token. Intenta de nuevo.');
        }
      } catch (e) {
        console.log('FCM error:', e.message);
        showToast('⚠️ ' + e.message);
      }
    }

    async function saveFCMTokenToSheet(token) {
      try {
        await sheetPost({
          action: 'update',
          did: getDeviceId(),
          fcmToken: token
        });
      } catch (e) { }
    }

    async function requestNotifPerm() {
      if (!('Notification' in window)) { showToast('Este navegador no soporta notificaciones'); return; }
      var perm = await Notification.requestPermission();
      if (perm === 'granted') {
        document.getElementById('notif-banner').classList.remove('show');
        showToast('✓ Notificaciones activadas');
        var cfg = getSettings2();
        scheduleNotifications(cfg);
        await registerFCMToken();
      } else {
        showToast('⚠️ Permiso denegado');
      }
    }

    // Admin: enviar notificación push vía FCM REST API
    async function sendPushToAll(title, body) {
      var cfg = getSettings2();
      var key = (cfg.gemKey || '').trim();
      try {
        var tokensRes = await sheetGet('tokens', { did: getDeviceId() });
        if (!tokensRes || !tokensRes.tokens || !tokensRes.tokens.length) {
          showToast('⚠️ Sin dispositivos registrados'); return;
        }
        var res = await sheetPost({
          action: 'pushall',
          did: getDeviceId(),
          title: title,
          body: body
        });
        if (res && res.ok) {
          var sent = res.sent || 0, errors = res.errors || 0;
          showToast('✓ Push: ' + sent + ' entregados' + (errors ? ' · ' + errors + ' fallidos' : ''));
        }
        else showToast('⚠️ ' + (res && res.error || 'Error'));
      } catch (e) { handleError('App', e); }
    }

    // =============================================
    // FASE 5
    // =============================================

    function haptic(ms) { if (navigator.vibrate) navigator.vibrate(ms || 50); }

    async function updatePermStates() {
      var ns = document.getElementById('perm-notif-state'), nb = document.getElementById('perm-notif-btn');
      if (ns && nb) {
        var np = Notification.permission;
        if (np === 'granted') { ns.textContent = '✓ Activadas'; ns.className = 'perm-state granted'; nb.textContent = '✓ OK'; nb.className = 'perm-req-btn granted'; }
        else if (np === 'denied') { ns.textContent = '✕ Bloqueadas – ve a Config. del navegador'; ns.className = 'perm-state denied'; nb.textContent = 'Bloqueado'; nb.className = 'perm-req-btn denied'; }
        else { ns.textContent = 'No activadas'; ns.className = 'perm-state prompt'; nb.textContent = 'Activar'; nb.className = 'perm-req-btn'; }
      }
      var ms = document.getElementById('perm-mic-state'), mb = document.getElementById('perm-mic-btn');
      if (ms && mb) {
        try {
          var mr = await navigator.permissions.query({ name: 'microphone' });
          if (mr.state === 'granted') { ms.textContent = '✓ Activado'; ms.className = 'perm-state granted'; mb.textContent = '✓ OK'; mb.className = 'perm-req-btn granted'; }
          else if (mr.state === 'denied') { ms.textContent = '✕ Bloqueado – ve a Config. del navegador'; ms.className = 'perm-state denied'; mb.textContent = 'Bloqueado'; mb.className = 'perm-req-btn denied'; }
          else { ms.textContent = 'No activado'; ms.className = 'perm-state prompt'; mb.textContent = 'Activar'; mb.className = 'perm-req-btn'; }
        } catch (e) { ms.textContent = 'No disponible'; ms.className = 'perm-state prompt'; }
      }
    }

    async function handleNotifPerm() {
      if (Notification.permission === 'denied') { showToast('⚠️ Ve a Configuración del navegador > Notificaciones'); return; }
      if (Notification.permission === 'granted') { showToast('✓ Ya están activadas'); return; }
      var p = await Notification.requestPermission();
      if (p === 'granted') { showToast('✓ Notificaciones activadas'); await registerFCMToken(); }
      else showToast('⚠️ Permiso denegado');
      updatePermStates();
    }

    async function handleMicPerm() {
      try {
        var r = await navigator.permissions.query({ name: 'microphone' });
        if (r.state === 'denied') { showToast('⚠️ Ve a Configuración del navegador > Micrófono'); return; }
        if (r.state === 'granted') { showToast('✓ Ya está activado'); return; }
      } catch (e) { }
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(function (t) { t.stop(); });
        showToast('✓ Micrófono activado');
      } catch (e) { handleError('App', e); }
      updatePermStates();
    }

    function getCustomTpls() { return S.get('custom_tpls') || []; }
    function saveCustomTpls(arr) { S.set('custom_tpls', arr); }

    function openMisPlantillas() { renderCustomTplList(); go('s-mis-tpl'); }

    function renderCustomTplList() {
      var tpls = getCustomTpls();
      var el = document.getElementById('ctpl-list');
      if (!tpls.length) {
        el.innerHTML = '<div style="color:var(--mut);text-align:center;padding:20px;font-size:13px">Sin plantillas. Crea una con el botón de abajo.</div>';
        return;
      }
      var out = '';
      for (var i = 0; i < tpls.length; i++) {
        var t = tpls[i];
        var icon = t.icon || '📝';
        out += '<div class="ctpl-item">';
        out += '<div class="ctpl-item-info" onclick="useCustomTpl(' + i + ')">';
        out += '<div class="ctpl-item-name">' + icon + ' ' + escapeHTML(t.name) + '</div>';
        out += '<div class="ctpl-item-sub">' + t.fields.length + ' campo' + (t.fields.length !== 1 ? 's' : '') + '</div>';
        out += '</div>';
        out += '<button style="background:none;border:none;font-size:18px;cursor:pointer;padding:6px;color:var(--rd)" onclick="deleteCustomTpl(' + i + ')">🗑️</button>';
        out += '</div>';
      }
      el.innerHTML = out;
    }

    function updateMisTplBtn() {
      var tpls = getCustomTpls();
      var btn = document.getElementById('mis-tpl-main-btn');
      var lbl = document.getElementById('mis-tpl-count-lbl');
      if (btn) btn.style.display = 'flex';
      if (lbl) lbl.textContent = tpls.length
        ? tpls.length + ' plantilla' + (tpls.length !== 1 ? 's' : '')
        : 'Crea tu primera plantilla';
    }

    function deleteCustomTpl(idx) {
      var tpls = getCustomTpls(); tpls.splice(idx, 1); saveCustomTpls(tpls);
      renderCustomTplList(); updateMisTplBtn(); showToast('Plantilla eliminada');
    }

    var builderFields = [], editingTplIdx = -1;

    function openBuilder(idx) {
      editingTplIdx = idx;
      var isEdit = idx >= 0;
      document.getElementById('builder-title').textContent = isEdit ? 'Editar Plantilla' : 'Nueva Plantilla';
      var tpl = isEdit ? getCustomTpls()[idx] : null;
      document.getElementById('b-name').value = tpl ? tpl.name : '';
      document.getElementById('b-icon').value = tpl ? (tpl.icon || '') : '';
      document.getElementById('b-template').value = tpl ? tpl.template : '';
      builderFields = tpl ? JSON.parse(JSON.stringify(tpl.fields)) : [];
      renderBuilderFields(); previewBuilder(); go('s-builder');
    }

    function renderBuilderFields() {
      var el = document.getElementById('b-fields-list');
      if (!builderFields.length) { el.innerHTML = ''; return; }
      var h = '';
      builderFields.forEach(function (f, i) {
        h += '<div class="builder-field-row">' +
          '<input class="builder-field-inp" value="' + escapeHTML(f.label) + '" placeholder="Nombre del campo" ' +
          'oninput="builderFields[' + i + '].label=this.value;' +
          'builderFields[' + i + '].id=this.value.toLowerCase().replace(/\s+/g,\'_\');previewBuilder()">' +
          '<button class="del-field-btn" onclick="removeBuilderField(' + i + ')">×</button>' +
          '</div>';
      });
      el.innerHTML = h;
    }

    function addBuilderField() {
      builderFields.push({ id: 'campo_' + (builderFields.length + 1), label: 'Campo ' + (builderFields.length + 1) });
      renderBuilderFields();
    }

    function removeBuilderField(idx) { builderFields.splice(idx, 1); renderBuilderFields(); previewBuilder(); }

    function previewBuilder() {
      var tmpl = document.getElementById('b-template').value;
      var prev = tmpl
        .replace(/\{hora\}/gi, nowTime())
        .replace(/\{hora_auto\}/gi, nowTime())
        .replace(/\{fecha\}/gi, today())
        .replace(/\{fecha_auto\}/gi, today())
        .replace(/\{cov\}/gi, getCOV() || '[COV]')
        .replace(/\{punto\}/gi, getProfile().ubi || '[Punto]')
        .replace(/\{turno\}/gi, getProfile().turno || '[Turno]');
      builderFields.forEach(function (f) {
        prev = prev.replace(new RegExp('\\{' + f.id + '\\}', 'gi'), '[' + f.label + ']');
      });
      document.getElementById('b-preview').textContent = prev || 'La vista previa aparece aquí…';
    }

    function saveCustomTpl() {
      var name = document.getElementById('b-name').value.trim();
      var icon = document.getElementById('b-icon').value.trim() || '📝';
      var template = document.getElementById('b-template').value.trim();
      if (!name) { showToast('⚠️ Ingresa un nombre'); return; }
      if (!template) { showToast('⚠️ Ingresa el mensaje plantilla'); return; }
      var tpl = { name: name, icon: icon, fields: builderFields.slice(), template: template };
      var tpls = getCustomTpls();
      if (editingTplIdx >= 0) tpls[editingTplIdx] = tpl;
      else tpls.push(tpl);
      saveCustomTpls(tpls); updateMisTplBtn();
      showToast('✓ Plantilla guardada'); goBack(); renderCustomTplList();
    }

    function useCustomTpl(idx) {
      var tpl = getCustomTpls()[idx]; if (!tpl) return;
      AppState.curCat = 'custom';
      AppState.curTpl = {
        id: 'custom_' + idx, name: tpl.name, icon: tpl.icon || '📝',
        fields: tpl.fields.map(function (f) { return { id: f.id, label: f.label, type: 'text' }; }),
        gen: function (vals) {
          var msg = tpl.template
            .replace(/\{hora\}/gi, nowTime())
            .replace(/\{hora_auto\}/gi, nowTime())
            .replace(/\{fecha\}/gi, today())
            .replace(/\{fecha_auto\}/gi, today())
            .replace(/\{cov\}/gi, getCOV() || '')
            .replace(/\{punto\}/gi, getProfile().ubi || '')
            .replace(/\{turno\}/gi, getProfile().turno || '');
          tpl.fields.forEach(function (f) {
            msg = msg.replace(new RegExp('\\{' + f.id + '\\}', 'gi'), vals[f.id] || '');
          });
          return msg;
        }
      };
      document.getElementById('form-back-lbl').textContent = 'Mis Plantillas';
      document.getElementById('form-badge').innerHTML = '<div class="badge" style="background:#FF980022;color:#C07800;border:1px solid #FF980044">⭐ Mis Plantillas</div>';
      document.getElementById('form-title').textContent = tpl.name;
      var container = document.getElementById('fields');
      container.innerHTML = tpl.fields.map(function (f) {
        return '<div class="fg"><div class="fl">' + f.label + '</div>' +
          '<input class="fi" type="text" id="f-' + f.id + '" oninput="upd()"></div>';
      }).join('');
      upd(); go('s-form');
    }

    function generarResumen() {
      var hist = S.get('history') || [];
      if (!hist.length) { showToast('Sin reportes en el historial'); return; }
      var p = getProfile(), counts = {};
      hist.forEach(function (h) { counts[h.tplName] = (counts[h.tplName] || 0) + 1; });
      var lines = [];
      Object.keys(counts).forEach(function (k) { lines.push('  • ' + counts[k] + ' ' + k); });
      var firstTime = new Date(hist[hist.length - 1].ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
      var lastTime = new Date(hist[0].ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
      var msg = '📋 RESUMEN TURNO ' + p.turno + ' — ' + today() + '\n' +
        '👤 COV: ' + p.nombre + '\n' +
        '📍 Punto: ' + p.ubi + '\n\n' +
        'Total reportes: ' + hist.length + '\n' +
        lines.join('\n') + '\n\n' +
        'Primer reporte: ' + firstTime + '\n' +
        'Último reporte:  ' + lastTime;
      var el = document.getElementById('resumen-area');
      el.style.display = 'block';
      el.innerHTML = '<div class="resumen-box">' +
        '<div style="font-size:12px;white-space:pre-wrap;line-height:1.6;color:var(--txt)">' + msg + '</div>' +
        '<button onclick="copyText(this.previousElementSibling.textContent);haptic(50)" ' +
        'style="width:100%;background:var(--acc);color:#fff;border:none;border-radius:var(--rs);' +
        'padding:10px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:10px">📋 Copiar resumen</button></div>';
    }


