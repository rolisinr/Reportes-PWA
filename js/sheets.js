    // =============================================
    // FASE 3 - GOOGLE SHEETS BACKEND
    // =============================================



    function getCorredor() { return (getSettings2().corredor) || 'TGA'; }
    function getCorrNombre() { var m = { TGA: 'Corredor Azul', SJL: 'Corredor Morado', PAB: 'Corredor Rojo' }; return m[getCorredor()] || 'Corredor'; }
    function getRutas() { return (getSettings2().rutas) || ['301', '303', '305', '336', '372']; }
    function getSheetURL() {
      return CONFIG.SHEET_URL;
    }

    function autoSaveSheetUrl(el) {
      var cfg = getSettings2();
      cfg.sheetUrl = el.value.trim();
      S.set('settings2', cfg);
    }

    async function sheetGet(action, params) {
      var url = getSheetURL();
      if (!url) return null;
      var parts = ['action=' + encodeURIComponent(action)];
      if (params) {
        Object.keys(params).forEach(function (k) {
          parts.push(k + '=' + encodeURIComponent(params[k]));
        });
      }
      var r = await fetch(url + '?' + parts.join('&'));
      return await r.json();
    }

    async function sheetPost(data) {
      var url = getSheetURL();
      if (!url) return null;
      // text/plain evita el preflight CORS de Apps Script
      var r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(data)
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    }

    async function initSheetConnection() {
      var url = getSheetURL();
      if (!url) return;
      try {
        var p = getProfile();
        var did = getDeviceId();
        // Llamadas en paralelo para reducir tiempo de espera a la mitad
        var results = await Promise.all([
          sheetGet('config', {}),
          sheetGet('register', { did: did, nombre: p.nombre || '', turno: p.turno || '', ubi: p.ubi || '' })
        ]);
        var cfg = results[0];
        var reg = results[1];
        if (cfg && cfg.config) {
          var local = getSettings2();
          if (cfg.config.gemKey) local.gemKey = cfg.config.gemKey;
          S.set('settings2', local);
          AppState.sheetConnected = true;
        }
        if (reg) {
          AppState.isAdmin = reg.es_admin === true;
          // Permisos: false solo si el Sheet dice explícitamente 'NO'
          AppState.userPerms.prog = reg.perm_prog !== false;
          AppState.userPerms.sync = reg.perm_sync !== false;
          applyUserPerms();
        }
        var avRes = await sheetGet('avisos', { did: did });
        if (avRes && avRes.avisos && avRes.avisos.length > 0) {
          AppState.pendingAvisos = avRes.avisos;
          showAvisoBanner(AppState.pendingAvisos[0]);
        }
      } catch (e) {
        console.log('Sheet no disponible:', e.message);
      }
    }

    function showAvisoBanner(aviso) {
      var banner = document.getElementById('aviso-banner');
      var txt = document.getElementById('aviso-msg-txt');
      if (banner && txt) {
        txt.textContent = aviso.mensaje;
        banner.dataset.id = aviso.id;
        banner.classList.add('show');
      }
    }

    async function dismissAviso() {
      var banner = document.getElementById('aviso-banner');
      var id = banner.dataset.id;
      banner.classList.remove('show');
      try {
        var _p = getProfile();
        var _nombre1 = (_p.nombre || '').split(' ')[0] || getDeviceId().slice(-6);
        await sheetPost({ action: 'leido', id: id, did: getDeviceId(), nombre: _nombre1 });
      } catch (e) { }
      AppState.pendingAvisos.shift();
      if (AppState.pendingAvisos.length > 0) {
        setTimeout(function () { showAvisoBanner(AppState.pendingAvisos[0]); }, 600);
      }
    }

    async function openAdmin() {
      if (!AppState.isAdmin) { showToast('⚠️ Acceso solo para administradores'); return; }
      go('s-admin');
      var dot = document.getElementById('sheet-dot');
      var txt = document.getElementById('sheet-conn-txt');
      if (AppState.sheetConnected) {
        if (dot) { dot.className = 'sheet-status ok'; }
        if (txt) txt.textContent = 'Conectado a Google Sheets';
      } else {
        if (dot) { dot.className = 'sheet-status off'; }
        if (txt) txt.textContent = 'Sin conexión a Sheets';
      }
    }

    async function loadAdminCOVs() {
      var el = document.getElementById('admin-covs');
      el.innerHTML = '<div style="color:var(--mut);font-size:13px;text-align:center;padding:20px">Cargando…</div>';
      try {
        var res = await sheetGet('covs', { did: getDeviceId() });
        if (res && res.covs) {
          renderCOVList(res.covs);
        } else {
          el.innerHTML = '<div style="color:var(--rd);font-size:12px;padding:10px">' + (res && res.error || 'Error al cargar') + '</div>';
        }
      } catch (e) {
        el.innerHTML = '<div style="color:var(--rd);font-size:12px;padding:10px">⚠️ ' + e.message + '</div>';
      }
    }

    function renderCOVList(covs) {
      var now = Date.now();
      var html = '';
      covs.forEach(function (cov) {
        var lastStr = 'nunca';
        if (cov.ultimo) {
          var mins = Math.round((now - new Date(cov.ultimo).getTime()) / 60000);
          if (mins < 60) lastStr = mins + ' min atrás';
          else if (mins < 1440) lastStr = Math.round(mins / 60) + 'h atrás';
          else lastStr = Math.round(mins / 1440) + 'd atrás';
        }
        html += '<div class="admin-cov-item">' +
          '<div class="acov-name">' + (cov.es_admin ? '🛡️ ' : '👤 ') + (cov.nombre || 'Sin nombre') + '</div>' +
          '<div class="acov-sub">' + (cov.turno || '—') + ' · ' + (cov.ubi || 'Sin punto') + ' · ' + lastStr + '</div>' +
          '</div>';
      });
      document.getElementById('admin-covs').innerHTML = html ||
        '<div style="color:var(--mut);text-align:center;padding:20px">Sin COVs registrados</div>';
    }


    async function sendAdminPush() {
      var msg = (document.getElementById('admin-aviso-txt').value || '').trim();
      if (!msg) { showToast('⚠️ Escribe el mensaje'); return; }
      var btn = document.getElementById('send-push-btn');
      btn.textContent = 'Enviando…'; btn.disabled = true;
      try {
        var res = await sheetPost({
          action: 'pushall',
          did: getDeviceId(),
          title: '📢 Aviso TGA',
          body: msg
        });
        if (res && res.ok) {
          var sent = res.sent || 0, errors = res.errors || 0, total = res.total || 0;
          var resultMsg = '✓ Push: ' + sent + '/' + total + ' entregados';
          if (errors) resultMsg += ' · ' + errors + ' error(es)';
          if (res.lastError) resultMsg += '\n' + res.lastError.slice(0, 80);
          showToast(resultMsg);
        } else {
          showToast('⚠️ ' + (res && res.error || 'Error al enviar push'));
        }
      } catch (e) { handleError('App', e); }
      finally { btn.textContent = '🔔 Push'; btn.disabled = false; }
    }

    // ── Gestión de destinatarios de avisos ──
    function toggleDestTodos(cb) {
      var list = document.getElementById('dest-covs-list');
      if (list) {
        list.style.opacity = cb.checked ? '.4' : '1';
        list.style.pointerEvents = cb.checked ? 'none' : 'auto';
        // Desmarcar individuales si se selecciona "Todos"
        if (cb.checked) {
          list.querySelectorAll('input[type=checkbox]').forEach(function (c) { c.checked = false; });
        }
      }
    }

    function populateAvisoDests(covs) {
      var list = document.getElementById('dest-covs-list');
      if (!list) return;
      list.innerHTML = covs.map(function (cov) {
        var nombre = (cov.nombre || '').split(' ')[0] || cov.did.slice(-4);
        return '<label class="dest-item">'
          + '<input type="checkbox" class="dest-cov-cb" data-did="' + escapeHTML(cov.did) + '">'
          + escapeHTML(nombre)
          + '</label>';
      }).join('');
      list.querySelectorAll('.dest-cov-cb').forEach(function (cb) {
        cb.addEventListener('change', function () {
          // Si hay alguno marcado individualmente, desmarcar "Todos"
          var any = list.querySelectorAll('.dest-cov-cb:checked').length > 0;
          var todosCb = document.getElementById('dest-todos');
          if (todosCb && any) {
            todosCb.checked = false;
            list.style.opacity = '1';
            list.style.pointerEvents = 'auto';
          }
        });
      });
    }

    async function sendAdminAviso() {
      var msg = (document.getElementById('admin-aviso-txt').value || '').trim();
      if (!msg) { showToast('⚠️ Escribe el mensaje'); return; }

      // Determinar destinatarios
      var todosCb = document.getElementById('dest-todos');
      var para = 'todos';
      if (!todosCb || !todosCb.checked) {
        var sels = Array.from(document.querySelectorAll('.dest-cov-cb:checked'))
          .map(function (cb) { return cb.dataset.did; });
        if (!sels.length) { showToast('⚠️ Selecciona al menos un destinatario'); return; }
        para = sels.join(',');
      }

      // Fecha programada
      var fechaEl = document.getElementById('aviso-fecha');
      var fechaProg = (fechaEl && fechaEl.value) ? fechaEl.value : '';

      var btn = document.getElementById('send-aviso-btn');
      if (btn) { btn.disabled = true; btn.textContent = '⏳'; }
      try {
        var res = await sheetPost({
          action: 'aviso', did: getDeviceId(),
          mensaje: msg, para: para, fecha_prog: fechaProg
        });
        if (res && res.ok) {
          showToast(fechaProg ? '✓ Aviso programado para ' + fechaProg : '✓ Aviso enviado');
          document.getElementById('admin-aviso-txt').value = '';
          if (fechaEl) fechaEl.value = '';
          if (todosCb) { todosCb.checked = true; toggleDestTodos(todosCb); }
        } else {
          showToast('⚠️ Aviso: ' + (res && res.error || 'Error desconocido'));
        }
      } catch (e) { handleError('App', e); }
      finally { if (btn) { btn.disabled = false; btn.textContent = '📢 Aviso en app'; } }
    }


    async function testSheetConn() {
      var url = getSheetURL();
      var res_el = document.getElementById('sheet-test-result');
      res_el.style.display = 'block'; res_el.style.color = 'var(--mut)'; res_el.textContent = 'Conectando…';
      try {
        var parts = ['action=ping'];
        var r = await fetch(url + '?' + parts.join('&'));
        var d = await r.json();
        if (d.pong) {
          res_el.style.color = 'var(--gr)';
          res_el.textContent = '✓ Conexión OK · ' + (d.ts || '');
          AppState.sheetConnected = true;
          initSheetConnection();
        } else {
          res_el.style.color = 'var(--rd)';
          res_el.textContent = '⚠️ Respuesta inesperada: ' + JSON.stringify(d).substring(0, 60);
        }
      } catch (e) {
        res_el.style.color = 'var(--rd)';
        res_el.textContent = '⚠️ Error: ' + e.message;
      }
    }
