    // ═══════════════════════════════════════════
    // CAT META
    // ═══════════════════════════════════════════
    var CAT = {
      vias: { label: "Informe de Vía", cc: "#16A34A" },
      obras: { label: "Obras en Vía", cc: "#C07800" },
      incidencia: { label: "Incidencias", cc: "#DC2626" },
      demanda: { label: "Demanda", cc: "#7C3AED" },
    };
    const TG_GROUP = {
      servicio: "qap", demanda: "dem",
      vias: "inc", obras: "inc", incidencia: "inc"
    };

    // ═══════════════════════════════════════════
    // TELEGRAM SHARE
    // ═══════════════════════════════════════════
    function telegramShare(msg, catId) {
      const cfg = getSettings2();
      const grpMap = { qap: cfg.tgQap, dem: cfg.tgDem, inc: cfg.tgInc };
      const grpKey = TG_GROUP[catId] || "inc";
      const grp = grpMap[grpKey] || "";
      const enc = encodeURIComponent(msg);
      let url;
      if (grp) {
        const clean = grp.replace("https://t.me/", "").replace("t.me/", "").replace("@", "");
        url = `tg://resolve?domain=${clean}&text=${enc}`;
      } else {
        url = `tg://msg?text=${enc}`;
      }
      window.location.href = url;
    }

    // ═══════════════════════════════════════════
    // HISTORY
    // ═══════════════════════════════════════════
    async function addToHistory(tplName, catId, msg) {
      const arr = await DB.get("history", "items") || [];
      arr.unshift({ id: Date.now(), tplName, catId, msg, ts: Date.now() });
      await DB.set("history", "items", arr.slice(0, 30));
      await updateHistCount();
    }
    async function updateHistCount() {
      const arr = await DB.get("history", "items") || [];
      const el = document.getElementById("hist-count-lbl");
      if (el) el.textContent = arr.length ? `${arr.length} reporte${arr.length > 1 ? "s" : ""} hoy` : "Sin reportes aún";
    }
    async function openHistory() {
      await renderHistory();
      go("s-history");
    }
    async function renderHistory() {
      const arr = await DB.get("history", "items") || [];
      const el = document.getElementById("hist-list");
      if (!arr.length) { el.innerHTML = `<div class="hi-empty">📋<br>No hay reportes en el historial</div>`; return; }
      el.innerHTML = arr.map(h => {
        const d = new Date(h.ts);
        const time = d.toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
        const preview = h.msg.split("\n")[0].substring(0, 60);
        return `<div class="hist-item">
      <div class="hi-top">
        <div class="hi-name">${escapeHTML(h.tplName)}</div>
        <div class="hi-time">${time}</div>
      </div>
      <div class="hi-preview">${escapeHTML(preview)}…</div>
      <div class="hi-btns">
        <button class="hi-btn copy" onclick="hiCopy(${h.id})">📋 Copiar</button>
        <button class="hi-btn tg" onclick="hiTg(${h.id})">✈️ Telegram</button>
        <button class="hi-btn" onclick="deleteHistItem(${h.id})" style="color:var(--rd);border-color:var(--rd);flex:none;padding:6px 8px">🗑️</button>
      </div>
    </div>`;
      }).join("");
    }
    async function hiCopy(id) {
      const h = (await DB.get("history", "items") || []).find(x => x.id === id);
      if (h) copyText(h.msg);
    }
    async function hiTg(id) {
      const h = (await DB.get("history", "items") || []).find(x => x.id === id);
      if (h) telegramShare(h.msg, h.catId);
    }

