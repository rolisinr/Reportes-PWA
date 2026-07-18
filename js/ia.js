    // =============================================
    // FASE 2 - IA CON GEMINI
    // =============================================


    async function callGemini(audioB64, mimeType, prompt) {
      var cfg2 = getSettings2();
      var key = (cfg2.gemKey || '').trim();
      if (!key) throw new Error('Configura tu clave API en ⚙️');
      var gModels = CONFIG.GEMINI_MODELS;

      for (var mi = 0; mi < gModels.length; mi++) {
        var model = gModels[mi];
        try {
          var r = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key,
            {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { inline_data: { mime_type: mimeType, data: audioB64 } },
                    { text: prompt }
                  ]
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 2000 }
              })
            }
          );
          if (r.status === 429 || r.status === 503) { lastErr = new Error('Cuota: ' + model); continue; }
          if (!r.ok) { var e = await r.json(); throw new Error((e.error && e.error.message) || 'Error ' + r.status); }
          var d = await r.json();
          var text = (d.candidates && d.candidates[0] && d.candidates[0].content &&
            d.candidates[0].content.parts && d.candidates[0].content.parts[0] &&
            d.candidates[0].content.parts[0].text) || '';
          if (!text) throw new Error('Respuesta vacía');
          return { text: text, model: model };
        } catch (e) {
          lastErr = e;
          if (mi === gModels.length - 1) throw lastErr;
        }
      }
      throw lastErr;
    }

    function parseGemJSON(text) {
      var s = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      var i = s.indexOf('{'), j = s.lastIndexOf('}');
      if (i < 0 || j < 0) throw new Error('Sin JSON en respuesta de IA');
      var raw = s.slice(i, j + 1);
      // Fix 1: quitar comas finales antes de } o ]
      var clean = raw.replace(/,\s*([}\]])/g, '$1');
      try { return JSON.parse(clean); } catch (e1) {
        // Fix 2: eliminar saltos de línea dentro de strings
        try {
          var c2 = clean.replace(/([^\\])\n/g, '$1 ').replace(/([^\\])\r/g, '$1 ');
          return JSON.parse(c2);
        } catch (e2) {
          // Fix 3: extraer solo el array de items si existe
          var m = clean.match(/"items"\s*:\s*(\[.*\])/s);
          if (m) {
            try {
              var arr = JSON.parse(m[1].replace(/,\s*]/g, ']').replace(/([^\\])\n/g, '$1 '));
              return { items: arr };
            } catch (e3) { }
          }
          throw new Error('JSON inválido: ' + e1.message);
        }
      }
    }

    // -- RECORDING --
    var mRec = null, aChunks = [], rTimer = null, rSecs = 0;
    var fmtTime = function (s) { return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

    async function startRec(micId, timerId, statusId) {
      try {
        var stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        var mimes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
        var mimeType = '';
        for (var k = 0; k < mimes.length; k++) {
          try { if (MediaRecorder.isTypeSupported(mimes[k])) { mimeType = mimes[k]; break; } } catch (e) { }
        }
        mRec = mimeType ? new MediaRecorder(stream, { mimeType: mimeType }) : new MediaRecorder(stream);
        aChunks = [];
        mRec.ondataavailable = function (e) { if (e.data.size > 0) aChunks.push(e.data); };
        mRec.start(200);
        rSecs = 0;
        var tEl = document.getElementById(timerId);
        if (tEl) { tEl.style.display = ''; tEl.textContent = '00:00'; }
        rTimer = setInterval(function () { rSecs++; var t = document.getElementById(timerId); if (t) t.textContent = fmtTime(rSecs); }, 1000);
        document.getElementById(micId).classList.add('recording');
        var sEl = document.getElementById(statusId);
        if (sEl) sEl.textContent = 'Grabando… toca para detener';
        var hint = document.getElementById('ia-stop-hint');
        if (hint) hint.style.display = '';
        return true;
      } catch (e) { showToast('⚠️ Sin acceso al micrófono'); return false; }
    }

    async function stopRecGetAudio() {
      clearInterval(rTimer);
      return new Promise(function (resolve) {
        mRec.onstop = async function () {
          var blob = new Blob(aChunks, { type: mRec.mimeType || 'audio/webm' });
          var fr = new FileReader();
          fr.onload = function () { resolve({ b64: fr.result.split(',')[1], mime: blob.type }); };
          fr.readAsDataURL(blob);
        };
        mRec.stop();
        mRec.stream.getTracks().forEach(function (t) { t.stop(); });
      });
    }

    // -- IA SCREEN --
    var iaRecording = false, iaCurrentMode = 'libre', iaCurrentResult = null;

    function setIAMode(mode) {
      iaCurrentMode = mode;
      document.getElementById('ia-tab-libre').classList.toggle('on', mode === 'libre');
      document.getElementById('ia-tab-narr').classList.toggle('on', mode === 'narrador');
      document.getElementById('ia-hint').textContent = mode === 'libre'
        ? 'Habla describiendo la situación y Gemini detectará el tipo de reporte y completará los campos.'
        : 'Describe la situación como puedas. Gemini ordenará tus ideas en texto claro para copiar.';
      document.getElementById('ia-result').style.display = 'none';
    }

    async function iaToggleRec() {
      if (!navigator.onLine) {
        showToast('⚠️ La IA requiere conexión a internet. Llena el formulario manualmente.');
        return;
      }
      if (iaRecording) {
        iaRecording = false;
        var mic = document.getElementById('ia-mic');
        mic.classList.remove('recording'); mic.classList.add('processing'); mic.textContent = '⏳';
        document.getElementById('ia-status').textContent = 'Procesando con Gemini…';
        var hint2 = document.getElementById('ia-stop-hint'); if (hint2) hint2.style.display = 'none';
        try {
          var audio = await stopRecGetAudio();
          var prompt = iaCurrentMode === 'libre' ? buildDetectPrompt() : buildNarradorPrompt();
          var res = await callGemini(audio.b64, audio.mime, prompt);
          if (iaCurrentMode === 'libre') renderLibreResult(res.text);
          else renderNarradorResult(res.text);
          showToast('✓ ' + res.model);
        } catch (e) { handleError('App', e); }
        finally {
          var m2 = document.getElementById('ia-mic');
          m2.classList.remove('processing', 'recording'); m2.textContent = '🎤';
          document.getElementById('ia-status').textContent = 'Toca para grabar';
          document.getElementById('ia-timer').style.display = 'none';
        }
      } else {
        var ok = await startRec('ia-mic', 'ia-timer', 'ia-status');
        if (ok) { iaRecording = true; document.getElementById('ia-result').style.display = 'none'; }
      }
    }

    function buildDetectPrompt() {
      var p = getProfile();
      var nl = '\n';
      var tpls = [
        { id: 'informe-via', name: 'Informe de Vias TGA', desc: 'estado de trafico N/S y S/N, semaforos, PNP, segregado' },
        { id: 'situacion', name: 'Situacion Actual Corredor Azul', desc: 'reporte rapido de situacion puntual' },
        { id: 'obras-via', name: 'Obras en Via TGA', desc: 'trabajos de construccion o mantenimiento en calzada' },
        { id: 'inc-via', name: 'Incidencia en Via', desc: 'accidente, choque, caida de persona' },
        { id: 'inc-cc3', name: 'Incidencia CC3 Rapido', desc: 'incidencia puntual breve' },
        { id: 'accidente-bus', name: 'Accidente Bus / Caida de Usuario', desc: 'usuario herido a bordo del bus' },
        { id: 'demanda', name: 'Demanda Corredor Azul', desc: 'paradero con usuarios esperando buses' },
      ];
      var tplLines = tpls.map(function (t) { return '- "' + t.id + '": ' + t.name + ' - ' + t.desc; }).join(nl);
      return (
        'Eres asistente del Corredor Azul TGA Lima, Peru. COV: ' + (p.nombre || 'COV') + ', punto: ' + (p.ubi || 'no especificado') + '.' + nl + nl +
        'Escucha el audio y determina el tipo de reporte. Extrae todos los datos mencionados.' + nl + nl +
        'Plantillas disponibles:' + nl + tplLines + nl + nl +
        'Responde UNICAMENTE con JSON valido, sin markdown, sin explicaciones:' + nl +
        '{' + nl +
        '  "plantilla": "id_de_la_plantilla",' + nl +
        '  "confianza": "alta",' + nl +
        '  "campos": {' + nl +
        '    "campo_id": "valor extraido"' + nl +
        '  }' + nl +
        '}' + nl + nl +
        'Reglas: mantener nombres de calles y paraderos exactamente como se escuchen. ' +
        'Si no se menciona un campo omitirlo. confianza: alta/media/baja.'
      );
    }

    function buildFillPrompt(tpl) {
      var p = getProfile();
      var nl = '\n';
      var textFields = tpl.fields.filter(function (f) { return f.type !== 'sel'; });
      var fieldLines = textFields.map(function (f) { return '  "' + f.id + '": ""'; }).join(',' + nl);
      var descLines = textFields.map(function (f) { return '- "' + f.id + '": ' + f.label; }).join(nl);
      return (
        'Eres asistente del Corredor Azul TGA Lima, Peru. COV: ' + (p.nombre || 'COV') + ', punto: ' + (p.ubi || 'no especificado') + '.' + nl + nl +
        'Escucha el audio y extrae informacion para el formulario: "' + tpl.name + '".' + nl + nl +
        'Responde UNICAMENTE con JSON valido, sin markdown:' + nl +
        '{' + nl + fieldLines + nl + '}' + nl + nl +
        'Descripcion de cada campo:' + nl + descLines + nl + nl +
        'Si no se menciona un campo dejarlo vacio. Redactar de forma clara y profesional.'
      );
    }

    function buildNarradorPrompt() {
      var nl = '\n';
      return (
        'Eres asistente de redaccion para reportes de transito del Corredor Azul TGA Lima, Peru.' + nl + nl +
        'Escucha el audio y organiza las ideas en un texto claro, ordenado y profesional.' + nl + nl +
        'Reglas:' + nl +
        '- Mantener exactamente los nombres de calles, paraderos, placas y numeros de padron' + nl +
        '- Ordenar cronologicamente si hay secuencia de eventos' + nl +
        '- Usar lenguaje formal de reporte operativo de transito peruano' + nl +
        '- Solo texto plano, sin formato especial'
      );
    }

    function renderLibreResult(text) {
      var data;
      try { data = parseGemJSON(text); } catch (e) { showToast('⚠️ ' + e.message); return; }
      var plantilla = data.plantilla, confianza = data.confianza || 'media', campos = data.campos || {};
      var foundTpl = null, foundCat = null;
      var catKeys = Object.keys(TPLS);
      for (var ci = 0; ci < catKeys.length; ci++) {
        var cat = catKeys[ci];
        for (var ti = 0; ti < TPLS[cat].length; ti++) {
          if (TPLS[cat][ti].id === plantilla) { foundTpl = TPLS[cat][ti]; foundCat = cat; break; }
        }
        if (foundTpl) break;
      }
      if (!foundTpl) { showToast('⚠️ Plantilla no reconocida: ' + plantilla); return; }
      iaCurrentResult = { tpl: foundTpl, cat: foundCat, campos: campos };
      var cf = ['alta', 'media', 'baja'].includes(confianza) ? confianza : 'media';
      var filledHtml = '';
      Object.keys(campos).forEach(function (k) {
        var v = campos[k]; if (!v) return;
        var f = null;
        for (var fi = 0; fi < foundTpl.fields.length; fi++) { if (foundTpl.fields[fi].id === k) { f = foundTpl.fields[fi]; break; } }
        if (f) filledHtml += '<div class="ia-fitem"><div class="ia-flbl">' + escapeHTML(f.label) + '</div><div class="ia-fval">' + escapeHTML(v) + '</div></div>';
      });
      var noFields = '<p style="font-size:12px;color:var(--mut);margin-bottom:10px">No se detectaron campos. Completa manualmente.</p>';
      var el = document.getElementById('ia-result');
      el.innerHTML =
        '<div class="ia-result">' +
        '<div class="ia-r-title">Plantilla detectada</div>' +
        '<div class="ia-tpl-card">' +
        '<div class="ia-tpl-name">' + foundTpl.icon + ' ' + foundTpl.name + '</div>' +
        '<span class="ia-conf ' + cf + '">' + cf + '</span>' +
        '</div>' +
        (filledHtml ? '<div class="ia-r-title">Campos extraídos</div><div class="ia-flist">' + filledHtml + '</div>' : noFields) +
        '<div class="ia-rbtns">' +
        '<button class="ia-rbtn pri" onclick="applyIAResult()">✓ Usar plantilla</button>' +
        '<button class="ia-rbtn sec" onclick="document.getElementById(\x27ia-result\x27).style.display=\x27none\x27">↩ Reintentar</button>' +
        '</div></div>';
      el.style.display = 'block';
    }

    function renderNarradorResult(text) {
      var el = document.getElementById('ia-result');
      el.innerHTML =
        '<div class="ia-result">' +
        '<div class="ia-r-title">Texto organizado por Gemini</div>' +
        '<div class="ia-narr-prev" id="narr-txt">' + escapeHTML(text) + '</div>' +
        '<div class="ia-rbtns">' +
        '<button class="ia-rbtn pri" onclick="copyText(document.getElementById(\x27narr-txt\x27).innerText)">📋 Copiar</button>' +
        '<button class="ia-rbtn sec" onclick="document.getElementById(\x27ia-result\x27).style.display=\x27none\x27">↩ Reintentar</button>' +
        '</div></div>';
      el.style.display = 'block';
    }

    function applyIAResult() {
      if (!iaCurrentResult) return;
      var tpl = iaCurrentResult.tpl, cat = iaCurrentResult.cat, campos = iaCurrentResult.campos;
      showForm(cat, tpl.id, true);
      setTimeout(function () { fillFieldsFromAI(tpl, campos); }, 180);
    }

    function fillFieldsFromAI(tpl, campos) {
      tpl.fields.forEach(function (f) {
        var val = campos[f.id]; if (!val) return;
        var el = document.getElementById('f-' + f.id); if (!el) return;
        if (el.tagName === 'SELECT') {
          var opts = Array.from(el.options);
          var m = opts.find(function (o) {
            return o.value.toLowerCase().indexOf(val.toLowerCase()) >= 0 ||
              val.toLowerCase().indexOf(o.value.toLowerCase()) >= 0;
          });
          if (m) el.value = m.value;
        } else {
          el.value = val;
          el.style.transition = 'border-color .3s';
          el.style.borderColor = 'var(--gr)';
          setTimeout(function () { el.style.borderColor = ''; }, 1800);
        }
      });
      upd();
      showToast('✓ Campos completados por IA');
    }

    // -- MINI IA --
    var msRecording = false;

    function openMiniIA() {
      if (!AppState.curTpl) { showToast('⚠️ Selecciona una plantilla'); return; }
      document.getElementById('ms-tpl-name').textContent = AppState.curTpl.name;
      document.getElementById('ms-status').textContent = 'Toca para grabar';
      document.getElementById('ms-timer').style.display = 'none';
      var m = document.getElementById('ms-mic');
      m.className = 'ms-mic'; m.textContent = '🎤';
      msRecording = false;
      document.getElementById('mini-ov').classList.add('open');
    }

    function closeMiniIA() {
      if (msRecording && mRec) { mRec.stop(); mRec.stream.getTracks().forEach(function (t) { t.stop(); }); clearInterval(rTimer); msRecording = false; }
      document.getElementById('mini-ov').classList.remove('open');
    }

    async function msToggleRec() {
      if (!navigator.onLine) {
        showToast('⚠️ La IA requiere conexión a internet.');
        return;
      }
      if (msRecording) {
        msRecording = false;
        var mic = document.getElementById('ms-mic');
        mic.classList.remove('recording'); mic.classList.add('processing'); mic.textContent = '⏳';
        document.getElementById('ms-status').textContent = 'Procesando…';
        try {
          var audio = await stopRecGetAudio();
          var res = await callGemini(audio.b64, audio.mime, buildFillPrompt(AppState.curTpl));
          var campos = parseGemJSON(res.text);
          closeMiniIA();
          fillFieldsFromAI(AppState.curTpl, campos);
        } catch (e) {
          showToast('⚠️ ' + e.message);
          var m2 = document.getElementById('ms-mic');
          m2.classList.remove('processing'); m2.textContent = '🎤';
          document.getElementById('ms-status').textContent = 'Error — toca para reintentar';
        }
      } else {
        var ok2 = await startRec('ms-mic', 'ms-timer', 'ms-status');
        if (ok2) msRecording = true;
      }
    }

