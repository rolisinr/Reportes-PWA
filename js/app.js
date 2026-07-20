    // ═══════════════════════════════════════════
    // SETTINGS
    // ═══════════════════════════════════════════
    function openSettings() {
      updatePermStates();
      var cfg = getSettings2();
      // Mostrar versión SW
      getSWVersion().then(function (v) {
        var el = document.getElementById('sw-version-txt');
        if (el) el.textContent = 'SW activo: ' + v;
      });
      document.querySelectorAll('#corr-sel .turno-opt').forEach(function (b) { b.classList.toggle('sel', b.dataset.v === cfg.corredor || (!cfg.corredor && b.dataset.v === 'TGA')); });
      renderRutasChips(cfg.rutas || ['301', '303', '305', '336', '372']);
      updateCorredorBadge();
      var fv = document.getElementById('fs-val'); if (fv) fv.textContent = (cfg.fs || 14) + 'px';
      var h1 = document.getElementById('notif-h1'); if (h1) h1.value = cfg.h1 || '10:00';
      var h2 = document.getElementById('notif-h2'); if (h2) h2.value = cfg.h2 || '16:00';
      document.getElementById('dw-overlay').classList.add('open');
      document.getElementById('dw-settings').classList.add('open');
    }
    function closeSettings() {
      document.getElementById("dw-overlay").classList.remove("open");
      document.getElementById("dw-settings").classList.remove("open");
    }
    function adjFS(delta) {
      const cfg = getSettings2();
      cfg.fs = Math.max(11, Math.min(18, (cfg.fs || 14) + delta));
      document.getElementById("fs-val").textContent = cfg.fs + "px";
      document.documentElement.style.setProperty("--fs", cfg.fs + "px");
      S.set("settings2", cfg);
    }
    function toggleNotif(btn) {
      btn.classList.toggle("on");
      const on = btn.classList.contains("on");
      document.getElementById("notif-times-row").style.display = on ? "flex" : "none";
      document.getElementById("notif-times-row2").style.display = on ? "flex" : "none";
      if (on) requestNotifPerm();
    }
    function saveSettings() {
      var cfg = getSettings2();
      var cs = document.querySelector('#corr-sel .turno-opt.sel');
      if (cs) cfg.corredor = cs.dataset.v;
      var h1 = document.getElementById('notif-h1'); if (h1) cfg.h1 = h1.value;
      var h2 = document.getElementById('notif-h2'); if (h2) cfg.h2 = h2.value;
      S.set('settings2', cfg);
      document.documentElement.style.setProperty('--fs', (cfg.fs || 14) + 'px');
      if (cfg.notif) scheduleNotifications(cfg);
      closeSettings();
      showToast('✓ Configuración guardada');
    }

    // ═══════════════════════════════════════════
    // NOTIFICATIONS
    // ═══════════════════════════════════════════
    function checkNotifBanner() {
      if (!("Notification" in window)) return;
      if (Notification.permission === "default") {
        document.getElementById("notif-banner").classList.add("show");
      }
    }
    // requestNotifPerm() — definida en FASE 4 (L4169) con soporte FCM completo
    function scheduleNotifications(cfg) {
      if (!cfg.notif || Notification.permission !== "granted") return;
      ["h1", "h2"].forEach(hk => {
        const hhmm = (cfg[hk] || "10:00").split(":");
        const now = new Date();
        const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +hhmm[0], +hhmm[1], 0);
        if (target > now) {
          const delay = target - now;
          setTimeout(() => {
            navigator.serviceWorker && navigator.serviceWorker.ready.then(reg => {
              reg.showNotification("🛣️ Recordatorio TGA", {
                body: "Es hora de enviar tu Informe de Vías",
                icon: "icon-192.png",
                badge: "icon-192.png",
                vibrate: [200, 100, 200],
                tag: "informe-via-reminder",
                requireInteraction: true
              });
            });
          }, delay);
        }
      });
    }

    // ═══════════════════════════════════════════
    // TOAST
    // ═══════════════════════════════════════════
    let toastTimer = null;
    function showToast(msg) {
      const t = document.getElementById("toast");
      t.textContent = msg;
      t.classList.add("show");
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => t.classList.remove("show"), 2300);
    }

    // ═══════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════

    function updateRelevoMsg() {
      var inp = document.getElementById('qs-relevo-inp');
      var prev = document.getElementById('qs-prev');
      if (!inp || !prev) return;
      var base = window._baseQuickMsg || AppState.quickMsg || '';
      var relevo = inp.value.trim();
      var fullMsg = relevo ? base + '\n' + B('Relevo:') + ' ' + relevo : base;
      prev.textContent = fullMsg;
      AppState.quickMsg = fullMsg; // actualizar para que quickC() copie el mensaje completo
    }



    async function init() {
      if (typeof ThemeManager !== 'undefined') ThemeManager.init();
      // Hydrate Caches from DB
      try {
        AppState.progHoyCache = await DB.get('programacion', 'prog_hoy');
        var cfg = S.get('settings2') || {};
        var c = cfg.corredor || 'TGA';
        AppState.covsBaseCache[c] = await DB.get('covs_base', 'covs_base_' + c) || [];
      } catch (e) {
        console.error('Error hydrating cache', e);
      }

      // Apply saved font size
      const cfg2 = getSettings2();
      document.documentElement.style.setProperty("--fs", cfg2.fs + "px");

      // Auto-select turno in welcome screen
      const detected = (() => { const h = new Date().getHours(); if (h >= 5 && h < 14) return "MAÑANA"; if (h >= 14 && h < 22) return "TARDE"; return "NOCHE"; })();
if (AppState.wBtn) { AppState.wBtn.classList.add("sel"); AppState.wTurno = detected; }

      // Check if first launch
      const p = getProfile();
      if (p.nombre) {
        navStack.length = 0; navStack.push("s-cat");
        showScreen("s-cat");
        renderProfile();
        checkNotifBanner();
        if (cfg.notif) scheduleNotifications(cfg);
        initSheetConnection();
        initFirebase();
      } else {
        navStack.length = 0; navStack.push("s-welcome");
        showScreen("s-welcome");
      }

      getDeviceId();
      updateHistCount();
      updateMisTplBtn();
      renderFavs();
      updateProgHomeBtn();
      // Mostrar bottom nav manejado por navigation.js
      // Auto-refrescar token FCM silenciosamente (detecta si venció y lo renueva)
      if (typeof Notification !== 'undefined') setTimeout(refreshFCMToken, 3000);
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        reg.update();
        reg.addEventListener("updatefound", function () {
          var nw = reg.installing;
          nw.addEventListener("statechange", function () {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              nw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      }).catch(function () { });
      navigator.serviceWorker.addEventListener("controllerchange", function () {
        mostrarConfirm("Hay una nueva versión disponible. ¿Deseas actualizar ahora?", "Actualizar", "Más tarde").then(function(ok) {
          if (ok) window.location.reload();
        });
      });
    }
    DB.migrateFromLocalStorage().then(init);

    // Auto-update location when returning to the app
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && typeof initSheetConnection === 'function') {
        const p = getProfile();
        if (p.nombre) initSheetConnection();
      }
    });
