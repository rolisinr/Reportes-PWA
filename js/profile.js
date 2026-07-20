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
function renderWelcomeAutocomplete() {
  const inp = document.getElementById("w-name");
  const list = document.getElementById("w-autocomplete-list");
  const manual = document.getElementById("w-manual-fields");
  if (!inp || !list || !manual) return;

  const val = inp.value.trim().toUpperCase();
  if (!val) {
    list.innerHTML = "";
    manual.style.display = "none";
    return;
  }

  const prog = AppState.progCache || [];
  let matches = prog.filter(p => (p.nombre || "").toUpperCase().indexOf(val) >= 0);

  if (matches.length === 0) {
    list.innerHTML = `<div class="autocomplete-item" style="color:var(--mut);text-align:center;font-size:12px" onclick="document.getElementById('w-manual-fields').style.display='block';document.getElementById('w-autocomplete-list').innerHTML='';">No encontrado. Toca aquí para ingreso manual.</div>`;
    return;
  }

  // Deduplicate by name
  const seen = {};
  matches = matches.filter(p => {
    const name = (p.nombre || "").toUpperCase();
    if (seen[name]) return false;
    seen[name] = true;
    return true;
  });

  list.innerHTML = matches.map(p => {
    let subtit = [p.punto, p.sentido, p.turno].filter(Boolean).join(" · ");
    if (!subtit) subtit = "Sin programación";
    return `<div class="autocomplete-item" onclick="selectWelcomeCov('${escapeHTML(p.nombre).replace(/'/g, "\\'")}', '${escapeHTML(p.turno || "").replace(/'/g, "\\'")}', '${escapeHTML(p.punto || "").replace(/'/g, "\\'")}', '${escapeHTML(p.sentido || "").replace(/'/g, "\\'")}')">
      <div>${escapeHTML(p.nombre)}</div>
      <div class="autocomplete-sub">${escapeHTML(subtit)}</div>
    </div>`;
  }).join("");
}

function selectWelcomeCov(nombre, turno, punto, sentido) {
  document.getElementById("w-name").value = nombre;
  document.getElementById("w-autocomplete-list").innerHTML = "";

  if (turno) {
    let t = turno.toUpperCase();
    if (t.indexOf("MAÑ") >= 0) t = "MAÑANA";
    else if (t.indexOf("TAR") >= 0) t = "TARDE";
    else t = "TARDE"; // default fallback
    
    document.querySelectorAll("#w-turno .turno-opt").forEach(b => {
      if (b.dataset.v === t) {
        selWTurno(b);
      }
    });
  }

  if (punto) {
    let fullPunto = punto;
    if (sentido) fullPunto += " · " + sentido;
    document.getElementById("w-ubi").value = fullPunto;
  }

  document.getElementById("w-manual-fields").style.display = "block";
}

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

