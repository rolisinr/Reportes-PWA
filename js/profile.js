    // ═══════════════════════════════════════════
    // PROFILE
    // ═══════════════════════════════════════════
    function renderProfile() {
      const p = getProfile();
      const el = document.getElementById("prof-display");
      if (p.nombre) {
        el.innerHTML = `<div class="prof-main">👤 ${escapeHTML(p.nombre)}</div>
      <div class="prof-sub">🕐 ${escapeHTML(p.turno)} &nbsp;·&nbsp; 📍 ${escapeHTML(p.ubi || "Sin punto asignado")}</div>`;
      } else {
        el.innerHTML = `<div class="prof-placeholder">Toca ✏️ para configurar tu perfil</div>`;
      }
      updateHistCount();
    }

    function toggleEdit() {
      const d = document.getElementById("edit-drawer");
      const p = getProfile();
      const open = d.classList.toggle("open");
      if (open) {
        document.getElementById("ed-nombre").value = p.nombre;
        document.getElementById("ed-ubi").value = p.ubi || "";
        document.querySelectorAll("#ed-turno .turno-opt").forEach(b => {
          b.classList.toggle("sel", b.dataset.v === p.turno);
        });
      }
    }
    function selETurno(btn) {
      document.querySelectorAll("#ed-turno .turno-opt").forEach(b => b.classList.remove("sel"));
      btn.classList.add("sel");
    }
    function saveProfile() {
      const turnoSel = document.querySelector("#ed-turno .turno-opt.sel");
      const p = {
        nombre: document.getElementById("ed-nombre").value.trim(),
        turno: turnoSel ? turnoSel.dataset.v : "TARDE",
        ubi: document.getElementById("ed-ubi").value.trim()
      };
      if (!p.nombre) { showToast("⚠️ Ingresa tu nombre"); return; }
      S.set("profile", p);
      renderProfile();
      document.getElementById("edit-drawer").classList.remove("open");
      showToast("✓ Perfil guardado");
      if (typeof EventBus !== 'undefined') EventBus.emit('profileChanged', p);
    }

    // Welcome
function selWTurno(btn) {
      document.querySelectorAll("#w-turno .turno-opt").forEach(b => b.classList.remove("sel"));
      btn.classList.add("sel");
      AppState.wTurno = btn.dataset.v;
    }
    function completeWelcome() {
      const nombre = document.getElementById("w-name").value.trim();
      if (!nombre) { showToast("⚠️ Ingresa tu nombre"); return; }
      const ubi = document.getElementById("w-ubi").value.trim();
      S.set("profile", { nombre, turno: AppState.wTurno, ubi });
      getDeviceId(); // genera device ID
      navStack.length = 0; navStack.push("s-cat");
      showScreen("s-cat");
      renderProfile();
      checkNotifBanner();
    }

