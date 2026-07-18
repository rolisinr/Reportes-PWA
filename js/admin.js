    // ═══════════════════════════════════════════════════
    // PANEL ADMIN — GESTIÓN DE USUARIOS
    // ═══════════════════════════════════════════════════
async function loadAdminUsers() {
      var container = document.getElementById('admin-users-list');
      if (!container) return;
      container.innerHTML = '<div style="color:var(--mut);text-align:center;padding:16px;font-size:13px">Cargando...</div>';
      // Actualizar badge de conexión
      var dot = document.getElementById('sheet-dot');
      var txt = document.getElementById('sheet-conn-txt');
      try {
        var res = await sheetGet('covs', { did: getDeviceId() });
        if (dot) { dot.className = 'sheet-status on'; }
        if (txt) txt.textContent = 'Conectado';
        if (res && res.covs) {
          AppState.adminUsersCache = res.covs;
          renderAdminUsers(res.covs);
          populateAvisoDests(res.covs); // También popular los destinatarios de avisos
        } else {
          if (dot) dot.className = 'sheet-status off';
          if (txt) txt.textContent = 'Error: ' + (res && res.error || 'desconocido');
          container.innerHTML = '<div style="color:var(--rd);font-size:12px">' + (res && res.error || 'Error al cargar') + '</div>';
        }
      } catch (e) {
        if (dot) dot.className = 'sheet-status off';
        if (txt) txt.textContent = 'Sin conexión';
        container.innerHTML = '<div style="color:var(--rd);font-size:12px">⚠️ ' + e.message + '</div>';
      }
    }

    function renderAdminUsers(covs) {
      var container = document.getElementById('admin-users-list');
      if (!container) return;
      if (!covs.length) { container.innerHTML = '<div style="color:var(--mut);font-size:13px;text-align:center;padding:16px">Sin dispositivos registrados</div>'; return; }

      var PERMS = [
        { key: 'perm_prog', label: '📋 Cargar prog' },
        { key: 'perm_sync', label: '📤 Subir/Bajar' },
        { key: 'perm_voz', label: '🤖 Reporte IA' },
        { key: 'perm_admin', label: '🛡️ Panel Admin' },
        { key: 'es_admin', label: '⚡ Super Admin' }
      ];

      container.innerHTML = covs.map(function (cov, ci) {
        var ahora = new Date().getTime();
        var ultimo = cov.ultimo ? new Date(cov.ultimo) : null;
        var hace = ultimo ? Math.round((ahora - ultimo.getTime()) / 60000) : null;
        var tiempoStr = hace !== null ? (hace < 60 ? hace + 'min' : Math.round(hace / 60) + 'h') : '—';

        var permsHTML = PERMS.map(function (p) {
          var isOn = (p.key === 'es_admin') ? cov.es_admin : cov[p.key];
          return '<button class="perm-tog' + (isOn ? ' on' : '')
            + '" data-did="' + cov.did + '" data-perm="' + p.key + '" data-ci="' + ci
            + '" onclick="togglePerm(this)">' + p.label + '</button>';
        }).join('');

        return '<div class="adc">'
          + '<div class="adc-name">' + escapeHTML(cov.nombre || 'Sin nombre') + (cov.es_admin ? ' 👑' : '') + '</div>'
          + '<div class="adc-meta">Último: ' + tiempoStr + ' · FCM: ' + (cov.tieneToken ? '✓' : '✗') + '</div>'
          + '<div class="adc-perms">' + permsHTML + '</div>'
          + '</div>';
      }).join('');
    }

    async function togglePerm(btn) {
      var did = btn.dataset.did;
      var perm = btn.dataset.perm;
      var ci = parseInt(btn.dataset.ci);
      var isOn = btn.classList.contains('on');
      var newVal = isOn ? 'NO' : 'SI';

      if (!await mostrarConfirm(
        (isOn ? 'Quitar' : 'Dar') + ' permiso "' + btn.textContent.trim() + '" a este COV?',
        isOn ? 'Quitar' : 'Dar permiso',
        'Cancelar'
      )) return;

      btn.disabled = true;
      try {
        var res = await sheetPost({
          action: 'setDevicePerm',
          did: getDeviceId(),
          targetDid: did,
          perm: perm,
          value: newVal
        });
        if (res && res.ok) {
          btn.classList.toggle('on');
          // Actualizar caché local
          if (AppState.adminUsersCache[ci]) AppState.adminUsersCache[ci][perm] = (newVal === 'SI');
          showToast('✓ Permiso actualizado');
        } else {
          showToast('⚠️ ' + (res && res.error || 'Error'));
        }
      } catch (e) { handleError('App', e); } finally {
        btn.disabled = false;
      }
    }

