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
function completeWelcome() {
  let nombre = document.getElementById("w-name").value.trim();
  if (!nombre) { showToast("⚠️ Ingresa tu nombre"); return; }
  
  // Format Name: capitalize each word
  nombre = nombre.toLowerCase().replace(/(?:^|\s)\S/g, function(a) { return a.toUpperCase(); });

  const h = new Date().getHours();
  const turno = (h >= 5 && h < 14) ? "MAÑANA" : "TARDE";
  
  S.set("profile", { nombre: nombre, turno: turno, ubi: "" });
  getDeviceId(); // genera device ID
  navStack.length = 0; navStack.push("s-cat");
  showScreen("s-cat");
  renderProfile();
  checkNotifBanner();

  if (typeof initSheetConnection === 'function') {
    initSheetConnection();
  }
}

function autoFillProfile() {
  const p = getProfile();
  if (!p.nombre) return;
  const prog = AppState.progCache || [];
  if (prog.length === 0) return;

  // We want to find the best match for p.nombre in prog
  const targetTokens = p.nombre.toUpperCase().split(" ").filter(Boolean);
  if (targetTokens.length === 0) return;

  let bestMatch = null;
  let maxScore = 0;

  prog.forEach(item => {
    if (!item.nombre) return;
    const source = item.nombre.toUpperCase();
    let score = 0;
    targetTokens.forEach(t => {
      if (source.indexOf(t) >= 0) score++;
    });
    if (score > maxScore) {
      maxScore = score;
      bestMatch = item;
    }
  });

  // If we found a good match (at least 2 words matched, or 1 if the user only typed 1)
  const threshold = Math.min(2, targetTokens.length);
  if (bestMatch && maxScore >= threshold) {
    // Format the name: "Apellidos + Nombres" -> usually it's "APELLIDO1 APELLIDO2 NOMBRE1 NOMBRE2"
    // The user wants: "ambos apellidos + primer nombre" -> First 3 words
    const parts = bestMatch.nombre.trim().split(/\s+/);
    let newName = parts.slice(0, 3).join(" ");
    // Capitalize properly
    newName = newName.toLowerCase().replace(/(?:^|\s)\S/g, a => a.toUpperCase());

    let newTurno = p.turno || "TARDE";
    if (bestMatch.turno) {
      let t = bestMatch.turno.toUpperCase();
      if (t.indexOf("MAÑ") >= 0) newTurno = "MAÑANA";
      else if (t.indexOf("TAR") >= 0) newTurno = "TARDE";
    }

    let newUbi = p.ubi || "";
    if (bestMatch.punto) {
      newUbi = bestMatch.punto;
      if (bestMatch.sentido) newUbi += " · " + bestMatch.sentido;
    }

    if (p.nombre === newName && p.turno === newTurno && p.ubi === newUbi) {
      return; // No changes needed
    }

    // Save
    p.nombre = newName;
    p.turno = newTurno;
    p.ubi = newUbi;
    S.set("profile", p);
    renderProfile();
    if (typeof EventBus !== 'undefined') EventBus.emit('profileChanged', p);
    showToast("Perfil actualizado ✓");

    // Silently update the backend immediately so the Devices sheet gets the properly formatted name
    if (typeof sheetGet === 'function') {
      sheetGet('register', { did: getDeviceId(), nombre: p.nombre, turno: p.turno, ubi: p.ubi }).catch(e => console.log(e));
    }
  }
}

