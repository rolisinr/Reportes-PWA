    // ═══════════════════════════════════════════════════
    // MODAL DE CONFIRMACIÓN GENÉRICO (POCOYO)
    // Uso: if(await mostrarConfirm('¿Seguro?')) { ...hacer... }
    // ═══════════════════════════════════════════════════
    var _resolveConfirm = null;
    function mostrarConfirm(mensaje, textoOk, textoCancelar) {
      var el = document.getElementById('modal-confirm-txt');
      if (el) el.textContent = mensaje;
      var okBtn = document.querySelector('#modal-confirm .modal-ok');
      if (okBtn) okBtn.textContent = textoOk || 'Confirmar';
      var canBtn = document.querySelector('#modal-confirm .modal-cancel');
      if (canBtn) canBtn.textContent = textoCancelar || 'Cancelar';
      var overlay = document.getElementById('modal-confirm');
      if (overlay) overlay.classList.add('visible');
      return new Promise(function (resolve) { _resolveConfirm = resolve; });
    }
    function cerrarConfirm(valor) {
      var overlay = document.getElementById('modal-confirm');
      if (overlay) overlay.classList.remove('visible');
      if (_resolveConfirm) { _resolveConfirm(valor); _resolveConfirm = null; }
    }

    // ═══════════════════════════════════════════════════
    // BARRA DE PROGRESO SOBRE BOTÓN (POCOYO)
    // ═══════════════════════════════════════════════════
    function iniciarBarraBoton(btn, msg) {
      var cont = btn.nextElementSibling;
      if (!cont || !cont.classList.contains('barra-sobre-boton')) {
        cont = document.createElement('div');
        cont.className = 'barra-sobre-boton';
        cont.innerHTML = '<div class="barra-fondo"><div class="barra-relleno"></div></div><p class="barra-texto"></p>';
        btn.parentNode.insertBefore(cont, btn.nextSibling);
      }
      btn._barraCont = cont;
      var relleno = cont.querySelector('.barra-relleno');
      var texto = cont.querySelector('.barra-texto');
      var pct = 0;
      relleno.style.width = '0%';
      texto.textContent = (msg || 'Procesando') + ' 0%';
      if (btn._barraInterval) clearInterval(btn._barraInterval);
      btn._barraInterval = setInterval(function () {
        pct += (88 - pct) * 0.1;
        if (pct > 87) pct = 87;
        relleno.style.width = Math.round(pct) + '%';
        texto.textContent = (msg || 'Procesando') + ' ' + Math.round(pct) + '%';
      }, 200);
    }
    function finalizarBarraBoton(btn) {
      if (!btn._barraCont) return;
      if (btn._barraInterval) { clearInterval(btn._barraInterval); btn._barraInterval = null; }
      var c = btn._barraCont;
      c.querySelector('.barra-relleno').style.width = '100%';
      c.querySelector('.barra-texto').textContent = 'Listo 100%';
      setTimeout(function () { if (c && c.parentNode) c.parentNode.removeChild(c); btn._barraCont = null; }, 600);
    }

    // ═══════════════════════════════════════════════════
    // NAVEGACIÓN INFERIOR (TABS)
    // ═══════════════════════════════════════════════════
    var TAB_SCREENS = ['s-cat', 's-prog', 's-history', 's-admin'];

    function switchTab(screenId, btn) {
      // Actualizar tab activo
      document.querySelectorAll('.nav-tab').forEach(function (b) { b.classList.remove('active'); });
      if (btn) btn.classList.add('active');
      // Navegar (sin push al historial del hash)
      navStack.length = 0; navStack.push(screenId);
      showScreen(screenId);
      // Acciones por tab
      if (screenId === 's-prog') { renderProgContent(); updateProgMeta(); }
      if (screenId === 's-history') renderHistory();
      if (screenId === 's-admin') { switchAdminTab('usuarios', null); loadAdminUsers(); }
    }

    // Admin sub-tabs
    function switchAdminTab(tabId, btn) {
      document.querySelectorAll('.ast').forEach(function (b) { b.classList.remove('on'); });
      if (btn) btn.classList.add('on');
      else {
        // Activar el correcto si no hay botón
        var astBtn = document.querySelector('.ast[onclick*="' + tabId + '"]');
        if (astBtn) astBtn.classList.add('on');
      }
      document.querySelectorAll('.admin-subtab-content').forEach(function (d) { d.classList.remove('active'); });
      var target = document.getElementById('ast-' + tabId);
      if (target) target.classList.add('active');
    }

