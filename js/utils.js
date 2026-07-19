
    // ═══════════════════════════════════════════
    // THEME MANAGER
    // ═══════════════════════════════════════════
    var ThemeManager = (function() {
      let currentTheme = 'light';
      
      function init() {
        const saved = S.get('settings2');
        if (saved && saved.theme) {
          setTheme(saved.theme);
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          setTheme('dark');
        } else {
          setTheme('light');
        }
        
        // Listen to system changes if no preference saved
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
          const cfg = S.get('settings2') || {};
          if (!cfg.theme) {
            setTheme(e.matches ? 'dark' : 'light');
          }
        });
      }
      
      function setTheme(theme) {
        currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        const btn = document.getElementById('theme-toggle-btn');
        if (btn) btn.innerHTML = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
      }
      
      function toggle() {
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        const cfg = S.get('settings2') || {};
        cfg.theme = newTheme;
        S.set('settings2', cfg);
        if (typeof showToast !== 'undefined') showToast('Tema ' + newTheme + ' activado');
      }
      
      return { init, toggle };
    })();

    // ═══════════════════════════════════════════
    // OFFLINE QUEUE & SYNC
    // ═══════════════════════════════════════════
    const SyncManager = (function() {
      let isOnline = navigator.onLine;
      let syncing = false;

      async function updateBadge() {
        const badge = document.getElementById('sync-badge');
        const countEl = document.getElementById('sync-count');
        const iconEl = document.getElementById('sync-icon');
        if (!badge) return;
        
        try {
          if (!isOnline) {
            badge.style.display = 'flex';
            badge.style.background = '#DC2626'; // Red
            iconEl.textContent = '❌';
            const all = await DB.getAll('pending_sync');
            const total = Object.keys(all).length;
            countEl.textContent = total > 0 ? total + ' pend.' : 'Offline';
          } else {
            const all = await DB.getAll('pending_sync');
            const total = Object.keys(all).length;
            if (total > 0) {
              badge.style.display = 'flex';
              badge.style.background = '#C07800'; // Orange
              iconEl.textContent = syncing ? '⏳' : '🔄';
              countEl.textContent = total + ' pend.';
              if (!syncing) processQueue();
            } else {
              badge.style.display = 'none';
            }
          }
        } catch(e){}
      }

      window.addEventListener('online', () => { isOnline = true; updateBadge(); });
      window.addEventListener('offline', () => { isOnline = false; updateBadge(); });

      async function addRequest(url, opts) {
        const id = Date.now().toString() + Math.floor(Math.random()*1000);
        await DB.set('pending_sync', id, { url, opts, ts: Date.now() });
        updateBadge();
        
        // Registrar Background Sync si está disponible
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
          try {
            const reg = await navigator.serviceWorker.ready;
            await reg.sync.register('sync-reportes');
          } catch(e){ console.error('Background Sync falló', e); }
        }
      }

      async function processQueue() {
        if (!isOnline || syncing) return;
        syncing = true;
        updateBadge();
        
        try {
          const all = await DB.getAll('pending_sync');
          const keys = Object.keys(all).sort();
          for (let k of keys) {
            if (!isOnline) break;
            const req = all[k];
            try {
              const res = await fetch(req.url, req.opts);
              const data = await res.json();
              if (data && data.ok) {
                await DB.del('pending_sync', k);
              }
            } catch (err) {
              // Si falla por red, rompemos el loop
              break;
            }
          }
        } finally {
          syncing = false;
          updateBadge();
        }
      }

      return { addRequest, updateBadge, processQueue };
    })();
    // ═══════════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════════
    const today = () => new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric" });
    const nowTime = () => new Date().toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });

    // Bold Unicode (Mathematical Bold Sans-Serif) - funciona en Telegram y WhatsApp
    const B = s => [...s].map(c => {
      const n = c.codePointAt(0);
      if (n >= 65 && n <= 90) return String.fromCodePoint(n + 120211);
      if (n >= 97 && n <= 122) return String.fromCodePoint(n + 120205);
      if (n >= 48 && n <= 57) return String.fromCodePoint(n + 120764);
      return c;
    }).join("");

    function escapeHTML(str) {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    // ═══════════════════════════════════════════
    // STORAGE HELPERS
    // ═══════════════════════════════════════════
    const S = {
      get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
      set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
      del: k => localStorage.removeItem(k)
    };

    function getCookie(name) {
      var m = document.cookie.match('(^|;)\s*' + name + '=([^;]+)');
      return m ? decodeURIComponent(m[2]) : null;
    }
    function setCookie(name, val, days) {
      var d = new Date();
      d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
      document.cookie = name + '=' + encodeURIComponent(val) + ';expires=' + d.toUTCString() + ';path=/;SameSite=Lax';
    }
    function getDeviceId() {
      // Cookie es más persistente que localStorage y se comparte entre PWA y navegador
      var id = localStorage.getItem('device_id') || getCookie('device_id');
      if (!id) {
        id = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
      }
      localStorage.setItem('device_id', id);
      setCookie('device_id', id, 365); // 1 año
      return id;
    }
    const getProfile = () => S.get("profile") || { nombre: "", turno: "TARDE", ubi: "" };
    const getSettings2 = () => S.get('settings2') || { fs: 14, notif: false, h1: '10:00', h2: '16:00', gemKey: '', corredor: 'TGA', rutas: ['301', '303', '305', '336', '372'] };

    // ═══════════════════════════════════════════
    // AUTOCOMPLETE
    // ═══════════════════════════════════════════
    function acAdd(fieldId, val) {
      if (!val || val.length < 3) return;
      const key = "ac_" + fieldId;
      let arr = S.get(key) || [];
      arr = [val, ...arr.filter(x => x !== val)].slice(0, 12);
      S.set(key, arr);
    }
    function acGet(fieldId, query) {
      const arr = S.get("ac_" + fieldId) || [];
      if (!query) return arr.slice(0, 4);
      return arr.filter(x => x.toLowerCase().includes(query.toLowerCase())).slice(0, 4);
    }

    let acActiveField = null;
    function acShow(fieldId, inputEl) {
      acHide();
      acActiveField = fieldId;
      const suggestions = acGet(fieldId, inputEl.value);
      if (!suggestions.length) return;
      const drop = document.createElement("div");
      drop.className = "ac-drop";
      drop.id = "ac-drop-" + fieldId;
      drop.style.display = "block";
      drop.innerHTML = suggestions.map(s =>
        `<div class="ac-item" onmousedown="acSelect('${fieldId}',this)" data-val="${escapeHTML(s)}">${escapeHTML(s)}</div>`
      ).join("");
      inputEl.parentElement.style.position = "relative";
      inputEl.parentElement.appendChild(drop);
    }
    function acHide() {
      document.querySelectorAll(".ac-drop").forEach(d => d.remove());
      acActiveField = null;
    }
    function acSelect(fieldId, el) {
      const val = el.dataset.val;
      const inp = document.getElementById("f-" + fieldId);
      if (inp) { inp.value = val; upd(); }
      acHide();
    }

    // ═══════════════════════════════════════════
    // CLOCK
    // ═══════════════════════════════════════════
    function tick() {
      const d = new Date();
      document.getElementById("clock").textContent = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
      document.getElementById("hdrdate").textContent = d.toLocaleDateString("es-PE", { weekday: "short", day: "2-digit", month: "short" });
    }
    tick(); setInterval(tick, 1000);

    // ═══════════════════════════════════════════
    // LANDSCAPE LOCK
    // ═══════════════════════════════════════════
    function checkOrientation() {
      const isLand = window.innerWidth > window.innerHeight;
      document.getElementById("land-warn").classList.toggle("show", isLand);
    }
    window.addEventListener("resize", checkOrientation);
    checkOrientation();
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock("portrait").catch(() => { });


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SYNC_COMPLETE') {
      if (typeof SyncManager !== 'undefined') SyncManager.updateBadge();
      if (typeof showToast !== 'undefined') showToast('✓ Sincronización offline completada');
    }
  });
}
