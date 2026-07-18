    // ═══════════════════════════════════════════
    // QUICK SERVICE (Inicio/Término/QAP)
    // ═══════════════════════════════════════════
function quickService(type) {
      const p = getProfile();
      const n = p.nombre || "COV";
      const t = nowTime();
      const sal = { MAÑANA: "Buen día", TARDE: "Buenas tardes", NOCHE: "Buenas noches" }[p.turno] || "Buenos días";
      const msgs = {
        "inicio": `${sal} inicio de servicio\n${B("COV:")} ${n}`,
        "termino": `Término de servicio\n${B("COV:")} ${n}`,
        "qap-ini": `${B("INICIO DE QAP")}\n${B("COV:")} ${n}`,
        "qap-fin": `${B("FIN DE QAP")}\n${B("COV:")} ${n}`,
      };
      const titles = { "inicio": "Inicio de Servicio", "termino": "Término de Servicio", "qap-ini": "Inicio de QAP", "qap-fin": "Fin de QAP" };
      AppState.quickMsg = msgs[type] || "";
      quickCat = "servicio";
      document.getElementById("qs-title").textContent = titles[type] || "";
      document.getElementById("qs-prev").textContent = AppState.quickMsg;
      var rr = document.getElementById('qs-relevo-row');
      if (rr) rr.style.display = type === 'termino' ? 'block' : 'none';
      var ri = document.getElementById('qs-relevo-inp');
      if (ri) ri.value = '';
      window._baseQuickMsg = AppState.quickMsg; // guardar base para updateRelevoMsg
      document.getElementById("quick-overlay").classList.add("open");
    }
    function closeQuick(e) {
      if (e.target === document.getElementById("quick-overlay"))
        document.getElementById("quick-overlay").classList.remove("open");
    }
    function quickCopy() { copyText(AppState.quickMsg); addToHistory(document.getElementById("qs-title").textContent, "servicio", AppState.quickMsg); }
    function quickTelegram() { addToHistory(document.getElementById("qs-title").textContent, "servicio", AppState.quickMsg); telegramShare(AppState.quickMsg, "servicio"); document.getElementById("quick-overlay").classList.remove("open"); }

    // ═══════════════════════════════════════════
    // FORM CACHE (2 horas)
    // ═══════════════════════════════════════════
    const CACHE_TTL = 2 * 60 * 60 * 1000; // 2 horas
    function saveFormCache(tplId) {
      const vals = getVals();
      S.set("fc_" + tplId, { vals, ts: Date.now() });
    }
    function loadFormCache(tplId) {
      const c = S.get("fc_" + tplId);
      if (!c) return null;
      if (Date.now() - c.ts > CACHE_TTL) { S.del("fc_" + tplId); return null; }
      return c;
    }
    function clearFormCache(tplId) { S.del("fc_" + tplId); }

    // ═══════════════════════════════════════════
    // TEMPLATES
    // ═══════════════════════════════════════════
    const getCOV = () => (getProfile().nombre) || "";
    const getUbi = () => (getProfile().ubi) || "";
    const getTurno = () => (getProfile().turno) || "TARDE";

    const TPLS = {
      vias: [
        {
          id: "informe-via", icon: "🛣️", name: "Informe de Vía",
          desc: "Estado de vía, semáforos y segregado",
          required: ["ubicacion", "ns", "sn"],
          fields: [
            { id: "ubicacion", label: "Ubicación / Paradero", type: "text", autofill: "ubi" },
            { id: "ns", label: "Tránsito N/S", type: "sel", opts: ["fluido", "moderado", "cargado", "detenido"] },
            { id: "sn", label: "Tránsito S/N", type: "sel", opts: ["fluido", "moderado", "cargado", "detenido"] },
            { id: "sem", label: "Semáforos", type: "sel", opts: ["OPERATIVOS", "NO OPERATIVOS"] },
            { id: "pnp", label: "Efectivo policial", type: "sel", opts: ["SÍ", "NO"] },
            { id: "pnp_det", label: "Detalle PNP", type: "text", opt: true },
            { id: "seg", label: "Ingreso del bus al Segregado", type: "sel", opts: ["con normalidad", "con dificultades", "con desvio temporal", "Otro"] },
            { id: "rec", label: "Personal de recaudo", type: "sel", opts: ["SÍ", "NO"] },
            { id: "extra", label: "Novedad adicional", type: "text", opt: true },
          ],
          gen: f => {
            const pnp = f.pnp === "SÍ"
              ? `- ${B("SÍ contamos")} con presencia de EFECTIVO POLICIAL${f.pnp_det ? " (" + f.pnp_det + ")" : ""}`
              : `- ${B("NO contamos")} con presencia de EFECTIVO POLICIAL`;
            const rec = f.rec === "No aplica" ? "" :
              f.rec === "SÍ"
                ? `\n- Personal de recaudo${f.rec_par ? " en paradero " + f.rec_par.toUpperCase() : " en el punto"}`
                : `\n- NO contamos con personal de recaudo en el punto`;
            return `🛣️${B("INFORME DE VIAS")}🛣️
🙋‍♂️ ${B("COV:")} ${getCOV()}
📆 ${B("FECHA:")} ${today()}
🕒 ${B("HORA:")} ${nowTime()}

📍 Lo que respecta: ${f.ubicacion}
- Tránsito ${B(f.ns)} N/S y ${B(f.sn)} S/N 
- Semáforos ${B(f.sem)} 🚦
${pnp}
- Unidades del corredor entrando al ${B("SEGREGADO")} ${f.seg} ${rec}${f.extra ? "\n- " + f.extra : ""}

📷${B("SE ADJUNTA IMAGENES ")}📸`;
          }
        },
        {
          id: "situacion", icon: "🚨", name: "Situación Actual",
          desc: "Reporte rápido con observación puntual",
          required: ["obs"],
          fields: [
            { id: "ubicacion", label: "Ubicación", type: "text", autofill: "ubi" },
            { id: "sent", label: "Sentido", type: "sel", opts: ["Ambos", "S/N", "N/S", "E/O", "O/E"] },
            { id: "obs", label: "Observación", type: "ta" },
            { id: "media", label: "Adjunto", type: "sel", opts: ["sin adjunto", "📷 SE ADJUNTA IMAGENES 📸", "📹SE ADJUNTA VIDEO 📹", "Se adjunta FOTO Y VIDEO📷"] },
          ],
          gen: f => {
            const ubiLine = f.ubicacion ? `\n📍 ${B("UBICACION:")} ${f.ubicacion}` : "";
            const mediaLine = f.media !== "sin adjunto" ? `\n ${f.media}` : "";
            return `🚨 ${B("SITUACION ACTUAL")} - ${B(getCorredor())}
🙋‍♂️ ${B("COV:")} ${getCOV()}
📆 ${B("FECHA:")} ${today()}
🕒 ${B("HORA:")} ${nowTime()}

📍 ${B("UBICACION:")} ${f.ubi}
🔁  ${B("SENTIDO:")} ${f.sent}

✍🏼  ${B("OBSERVACION:")} 
${f.obs}${mediaLine}`;
          }
        },
      ],
      obras: [
        {
          id: "obras-via", icon: "🏗️", name: "Obras en Vía",
          desc: "Construcción o mantenimiento vial",
          required: ["ubicacion", "desc"],
          fields: [
            { id: "ubicacion", label: "Ubicación de la obra", type: "text" },
            { id: "empresa", label: "Empresa ejecutora", type: "text" },
            { id: "contrat", label: "Contratante", type: "text" },
            { id: "duracion", label: "Duración / Horario", type: "text" },
            { id: "desc", label: "Descripción / Observación", type: "ta" },
            { id: "ns", label: "Tránsito N/S", type: "sel", opts: ["—", "fluido", "moderado", "cargado", "detenido"] },
            { id: "sn", label: "Tránsito S/N", type: "sel", opts: ["—", "fluido", "moderado", "cargado", "detenido"] },
            { id: "afecta", label: "Afectación al corredor", type: "sel", opts: ["NO afecta carril del corredor", "SÍ afecta el carril del corredor", "SÍ, se hace desvio temporal"] },
          ],
          gen: f =>
            (() => {
              const empLine = f.empresa ? `\n${B("EMPRESA:")} ${f.empresa}` : "";
              const conLine = f.contrat ? `\n${B("CONTRATANTE:")} ${f.contrat}` : "";
              const durLine = f.duracion ? `\n${B("DURACION:")} ${f.duracion}` : "";
              const nsLine = f.ns !== "—" ? `\n${B("TRANSITO N/S:")} ${f.ns}` : "";
              const snLine = f.sn !== "—" ? `\n${B("TRANSITO S/N:")} ${f.sn}` : "";
              return `🏗 ${B("OBRAS EN VIA")}
🙋‍♂️ ${B("COV:")} ${getCOV()}
📆 ${B("FECHA:")} ${today()}
🕒 ${B("HORA:")} ${nowTime()}

📍  ${B("UBICACION DE LA OBRA:")} ${f.ubicacion}${empLine}${conLine}${durLine}
🚨 ${B("AFECTACION AL CORREDOR:")} ${f.afecta.toUpperCase()}
✍ ${B("DESCRIPCION:")}
${f.desc}${nsLine}${snLine}

📷${B("SE ADJUNTA IMAGENES ")}📸`;
            })()
        },
      ],
      incidencia: [
        {
          id: "inc-via", icon: "🚦", name: "Incidencia en Vía - Detallado",
          desc: "Accidente u otro evento con detalle completo",
          required: ["ubi", "desc", "accion"],
          fields: [
            { id: "ubi", label: "Ubicación", type: "text", autofill: "ubi" },
            { id: "sent", label: "Sentido", type: "sel", opts: ["Ambos", "N/S", "S/N", "E/O", "O/E"] },
            { id: "tipo", label: "Tipo de evento", type: "sel", opts: ["Accidente vehicular", "Accidente en ciclovía", "Caída de usuario", "Vehículo varado", "Árbol caído", "Persona herida", "Otro"] },
            { id: "tipo_otro", label: "Especificar (si elegiste Otro)", type: "text", opt: true },
            { id: "desc", label: "Descripción del hecho", type: "ta" },
            { id: "pnp", label: "Presencia policial", type: "sel", opts: ["SÍ", "NO"] },
            { id: "samu", label: "Emergencias en el punto", type: "sel", opts: ["—", "SAMU", "PNP", "Serenazgo", "Ambulancia", "Bomberos", "No se requirió"] },
            { id: "accion", label: "Acciones tomadas", type: "text" },
            { id: "estado", label: "Estado de la vía", type: "sel", opts: ["liberada, tránsito normal", "parcialmente afectada", "cerrada"] },
          ],
          gen: f => {
            const tipoFinal = (f.tipo === 'Otro' && f.tipo_otro) ? f.tipo_otro : f.tipo;
            const samuLine = f.samu !== '—' ? `\n▪️${B("Emergencias:")} ${f.samu}` : "";
            const accionLine = f.accion ? `\n▪️${B("Acciones:")} ${f.accion}` : "";
            return `🚦 ${B("REPORTE DE")} ${B(tipoFinal)} ${B("EN VIA")} - ${B(getCorredor())}
🙋‍♂️ ${B("COV:")} ${getCOV()}
📆 ${B("FECHA:")} ${today()}
🕒 ${B("HORA:")} ${nowTime()}

📍 ${B("UBICACION:")} ${f.ubi}
🔁 ${B("SENTIDO:")} ${f.sent}


🚨 ${B("DETALLE DE LA INCIDENCIA:")}
▪️${B("Tipo:")} ${tipoFinal}
▪️${B("Descripción:")} ${f.desc}
▪️${B("Presencia policial:")} ${f.pnp}${samuLine}${accionLine}
▪️${B("Estado de la vía:")} ${f.estado}

📷${B("SE ADJUNTA IMAGENES ")}📸`;
          }
        },
        {
          id: "inc-cc3", icon: "🚧", name: "Incidencia – Rápido",
          desc: "Reporte simplificado para situaciones puntuales",
          required: ["lugar", "obs"],
          fields: [
            { id: "lugar", label: "Ubicación", type: "text", autofill: "ubi" },
            { id: "sent", label: "Sentido", type: "sel", opts: ["Ambos", "N/S", "S/N", "E/O", "O/E"] },
            { id: "obs", label: "Observación", type: "ta" },
          ],
          gen: f =>
            `🚦${B("REPORTE DE INCIDENCIAS EN VIA -TGA")}
🙋‍♂️${B("COV:")} ${getCOV()}
📆 ${B("FECHA:")} ${today()}
🧭${B("HORA:")} ${nowTime()}

📍 ${B("UBICACION:")} ${f.lugar}
🔃${B("SENTIDO:")} ${f.sent}

🚨${B("OBSERVACION:")}🚨
${f.obs}

📷${B("SE ADJUNTA IMAGENES ")}📸`
        },
        {
          id: "accidente-bus", icon: "🚌", name: "Accidente en Bus / Caída de Usuario",
          desc: "Reporte con usuario afectado y datos completos",
          required: ["ubi", "placa", "padron", "conductor", "usuario", "dni", "obs"],
          fields: [
            { id: "turno", label: "Turno", type: "sel", opts: ["MAÑANA", "TARDE"], autofill: "turno" },
            { id: "ubi", label: "Ubicación", type: "text", autofill: "ubi" },
            { id: "sent", label: "Sentido", type: "sel", opts: ["N/S", "S/N", "E/O", "O/E"] },
            { id: "placa", label: "Placa del bus", type: "text" },
            { id: "ruta", label: "Ruta", type: "text" },
            { id: "padron", label: "Padrón", type: "text" },
            { id: "conductor", label: "Nombre del conductor", type: "text" },
            { id: "trasbordo", label: "Trasbordo", type: "sel", opts: ["SÍ", "NO"] },
            { id: "usuario", label: "Nombre usuario afectado", type: "text" },
            { id: "dni", label: "DNI del usuario", type: "text" },
            { id: "clinica", label: "Clínica / Hospital", type: "text" },
            { id: "comisaria", label: "Comisaría", type: "text" },
            { id: "obs", label: "Descripción del hecho", type: "ta" },
          ],
          gen: f =>
            `${B("REPORTE ACCIDENTE DE BUS")} - ${B(getCorredor())} ${B("TURNO")} ${f.turno}
🙋‍♂️ ${B("COV:")} ${getCOV()}
📆 ${B("FECHA:")} ${today()}
🧭${B("HORA:")} ${nowTime()}

🚏  ${B("UBICACION:")} ${f.ubi}
🔃 ${B("SENTIDO:")} ${f.sent}
🚾 ${B("PLACA:")} ${f.placa}
🚍 ${B("RUTA:")} ${f.ruta}
🔢 ${B("PADRON:")} ${f.padron}
👨🏻‍💼 ${B("CONDUCTOR:")} ${f.conductor}
${B("TRASBORDO:")} ${f.trasbordo}

${B("DATOS DEL USUARIO AFECTADO:")}
${B("Nombre:")} ${f.usuario}
${B("DNI:")} ${f.dni}
${B("CLÍNICA:")} ${f.clinica}
${B("COMISARÍA:")} ${f.comisaria}

🔍 ${B("OBSERVACION:")}
${f.obs}

📷${B("SE ADJUNTA IMAGENES ")}📸`
        },
      ],
      demanda: [
        {
          id: "demanda", icon: "🚍", name: "Demanda",
          desc: "Reporte de demanda con código y observación",
          required: ["paradero", "padron", "obs"],
          fields: [
            { id: "paradero", label: "Paradero / Ubicación", type: "text", autofill: "ubi" },
            { id: "sent", label: "Sentido", type: "sel", opts: ["N/S", "S/N", "E/O", "O/E"] },
            { id: "ruta", label: "Ruta", type: "sel", get opts() { return getRutas(); } },
            { id: "padron", label: "Padrón", type: "text" },
            { id: "freq", label: "Frecuencia (ej: 10:30 AM)", type: "text", opt: true },
            { id: "codigo", label: "Código", type: "sel", opts: ["01", "02", "03", "04", "05", "06"] },
            { id: "obs", label: "Observación", type: "text", opt: true },
          ],
          gen: f => {
            const turno = getProfile().turno || 'TARDE';
            const freqLine = f.freq ? `\n🕐 ${B("FRECUENCIA:")} ${f.freq}` : "";
            const obsLine = f.obs ? `\n\n✍🏻 ${B("OBSERVACION:")} ${f.obs.toUpperCase()}` : "";
            return `🛑 ${B("CORREDOR")} ${B(getCorredor())} ${B("TURNO")} ${turno}
👮${B("COV:")} ${getCOV().toUpperCase()}
🔢${B("FECHA:")} ${today()}
🧭${B("HORA:")} ${nowTime()}

🚏 ${B("PARADERO:")} ${f.paradero.toUpperCase()}
♻️ ${B("SENTIDO:")} ${f.sent}
🚍 ${B("RUTA:")} ${f.ruta}
🔢 ${B("PADRON:")} ${f.padron}${freqLine}
🔢 ${B("CODIGO:")} ${f.codigo}${obsLine}`;
          }
        },
      ],
    };

    // ═══════════════════════════════════════════
    // NAVIGATION TO TEMPLATES
    // ═══════════════════════════════════════════
function showTpl(cat) {
      AppState.curCat = cat;
      const meta = CAT[cat];
      document.getElementById("tpl-lbl").textContent = meta.label;
      document.getElementById("tpl-list").innerHTML = TPLS[cat].map(t =>
        `<div class="tpl-card" onclick="showForm('${cat}','${t.id}')" style="--cc:${meta.cc}">
      <div class="tc-icon">${t.icon}</div>
      <div><div class="tc-name">${t.name}</div><div class="tc-desc">${t.desc}</div></div>
      <div class="tc-arr">›</div>
    </div>`
      ).join("");
      go("s-tpl");
    }

    function goDirectForm(cat, id) { AppState.curCat = cat; showForm(cat, id, true); }

    function showForm(cat, id, direct = false) {
      AppState.curCat = cat;
      const meta = CAT[cat];
      const tpl = TPLS[cat].find(t => t.id === id);
      AppState.curTpl = tpl;

      document.getElementById("form-back-lbl").textContent = direct ? "Inicio" : meta.label;
      document.getElementById("form-badge").innerHTML =
        `<div class="badge" style="background:${meta.cc}22;color:${meta.cc};border:1px solid ${meta.cc}44">${tpl.icon} ${meta.label}</div>`;
      document.getElementById("form-title").textContent = tpl.name;

      // Check cache
      const cache = loadFormCache(tpl.id);
      const cacheNote = document.getElementById("cache-note");

      const p = getProfile();
      const container = document.getElementById("fields");
      container.innerHTML = tpl.fields.map(f => {
        let autoVal = "";
        if (f.autofill === "ubi") autoVal = p.ubi || "";
        else if (f.autofill === "cov") autoVal = p.nombre || "";
        else if (f.autofill === "turno" || f.id === "turno") autoVal = p.turno || "TARDE";
        const cachedVal = cache && cache.vals ? cache.vals[f.id] : "";
        const val = cachedVal || autoVal;

        let inp = "";
        if (f.type === "sel") {
          inp = `<select class="fs" id="f-${f.id}" onchange="upd();saveFormCache('${tpl.id}')">
        ${f.opts.map(o => `<option${o.toUpperCase() === val.toUpperCase() ? " selected" : ""}>${escapeHTML(o)}</option>`).join("")}
      </select>`;
        } else if (f.type === "ta") {
          inp = `<textarea class="fta" id="f-${f.id}" oninput="upd();saveFormCache('${tpl.id}')" rows="3">${escapeHTML(val)}</textarea>`;
        } else {
          inp = `<div style="position:relative">
        <input class="fi" type="text" id="f-${f.id}" value="${escapeHTML(val)}"
          oninput="upd();saveFormCache('${tpl.id}');acShow('${f.id}',this)"
          onfocus="acShow('${f.id}',this)"
          onblur="setTimeout(acHide,200);if(this.value)acAdd('${f.id}',this.value)">
      </div>`;
        }
        return `<div class="fg"><div class="fl${f.opt ? " opt" : ""}" id="lbl-${f.id}">${f.label}</div>${inp}</div>`;
      }).join("");

      if (cache) {
        const mins = Math.round((Date.now() - cache.ts) / 60000);
        cacheNote.textContent = `Borrador guardado hace ${mins < 1 ? "menos de 1" : mins} min`;
        cacheNote.style.display = "block";
      } else {
        cacheNote.style.display = "none";
      }

      upd();
      if (direct) go("s-form"); else go("s-form");
    }

    function getVals() {
      if (!AppState.curTpl) return {};
      const v = {};
      AppState.curTpl.fields.forEach(f => { const el = document.getElementById("f-" + f.id); v[f.id] = el ? el.value.trim() : ""; });
      return v;
    }

    function upd() {
      const el = document.getElementById("prev");
      if (!AppState.curTpl) return;
      try { el.textContent = AppState.curTpl.gen(getVals()); } catch (e) { el.textContent = ""; }
    }

    function resetForm() {
      if (!AppState.curTpl) return;
      clearFormCache(AppState.curTpl.id);
      const p = getProfile();
      AppState.curTpl.fields.forEach(f => {
        const el = document.getElementById("f-" + f.id);
        if (!el) return;
        if (el.tagName === "SELECT") { el.selectedIndex = 0; }
        else if (el.tagName === "TEXTAREA") { el.value = ""; }
        else {
          let def = "";
          if (f.autofill === "ubi") def = p.ubi || "";
          else if (f.autofill === "cov") def = p.nombre || "";
          el.value = def;
        }
        el.classList.remove("invalid");
        const lbl = document.getElementById("lbl-" + f.id);
        if (lbl) lbl.classList.remove("err");
      });
      document.getElementById("cache-note").style.display = "none";
      upd();
      showToast("🗑 Formulario vaciado");
    }

    // ═══════════════════════════════════════════
    // VALIDATION + COPY + SHARE
    // ═══════════════════════════════════════════
    function validate() {
      if (!AppState.curTpl) return true;
      const required = AppState.curTpl.required || [];
      let ok = true;
      AppState.curTpl.fields.forEach(f => {
        const el = document.getElementById("f-" + f.id);
        const lbl = document.getElementById("lbl-" + f.id);
        if (!el || !lbl) return;
        const empty = !el.value.trim();
        const isReq = required.includes(f.id);
        el.classList.toggle("invalid", isReq && empty);
        lbl.classList.toggle("err", isReq && empty);
        if (isReq && empty) ok = false;
      });
      return ok;
    }

    function copyText(txt) {
      const fb = () => { const ta = document.createElement("textarea"); ta.value = txt; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, 99999); document.execCommand("copy"); document.body.removeChild(ta); };
      navigator.clipboard ? navigator.clipboard.writeText(txt).catch(fb) : fb();
      showToast("✓ Mensaje copiado");
      var btn = document.querySelector('.bottom-nav-action');
      if (btn) {
        btn.classList.add('pulse-anim');
        setTimeout(() => btn.classList.remove('pulse-anim'), 500);
      }
    }

    function doCopy() {
      if (!validate()) { showToast("⚠️ Completa los campos obligatorios"); return; }
      const txt = document.getElementById("prev").innerText;
      if (!txt.trim()) return;
      copyText(txt);
      haptic(60);
      addToHistory(AppState.curTpl.name, AppState.curCat, txt);
      const btn = document.getElementById("copy-btn");
      btn.classList.add("ok");
      btn.textContent = "✓ Copiado";
      setTimeout(() => { btn.classList.remove("ok"); btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copiar'; }, 2000);
    }

    function doTelegram() {
      if (!validate()) { showToast("⚠️ Completa los campos obligatorios"); return; }
      const txt = document.getElementById("prev").innerText;
      if (!txt.trim()) return;
      addToHistory(AppState.curTpl.name, AppState.curCat, txt);
      telegramShare(txt, AppState.curCat);
    }

