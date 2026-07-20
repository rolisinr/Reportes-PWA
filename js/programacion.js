    // ══════════════════════════════════════
    // PROGRAMACIÓN + QAP GRUPAL
    // ══════════════════════════════════════
// usado por quickService y relevo

    function getProgHoy() {
      var d = AppState.progHoyCache;
      return (d && d.items && d.items.length) ? d : null;
    }
    function saveProgHoy(data) {
      data.fecha = today();
      AppState.progHoyCache = data;
      if (typeof DB !== 'undefined') DB.set('programacion', 'prog_hoy', data).catch(function(e) { console.error(e); });
    }

    function openProg() {
      renderProgContent();
      go('s-prog');
    }

    function updateProgHomeBtn() {
      var sub = document.getElementById('prog-home-sub');
      if (!sub) return;
      var d = getProgHoy();
      if (d && d.items && d.items.length) {
        var act = d.items.filter(function (x) { return x.categoria === 'activo'; }).length;
        var qap = d.items.filter(function (x) { return x.qap_estado === 'qap'; }).length;
        sub.textContent = act + ' activos' + (qap ? ' · ' + qap + ' en QAP' : '');
      } else {
        sub.textContent = 'Cargar  distribución';
      }
    }


    function setProgF(f) {
      AppState.progFiltro = f;
      renderProgContent();
    }


    function quitaTildes(s) {
      return (s || '').replace(/[áàä]/gi, 'a').replace(/[éèë]/gi, 'e')
        .replace(/[íìï]/gi, 'i').replace(/[óòö]/gi, 'o')
        .replace(/[úùü]/gi, 'u').replace(/ñ/gi, 'n');
    }

    function parsePipeFormat(text) {
      var items = [];
      var lines = text.split('\n');
      lines.forEach(function (line) {
        line = line.trim();
        if (!line) return;
        // Ignorar líneas que no tienen pipes
        if (line.indexOf('|') < 0) return;
        // Ignorar línea de encabezado
        // Saltar encabezados comunes
        var upper = line.toUpperCase();
        if (upper.indexOf('ORDEN') === 0 || upper.indexOf('NOMBRE') === 0 || upper === 'NOMBRE|PUNTO|SENTIDO|FUNCION|CATEGORIA') return;
        var parts = line.split('|');
        if (parts.length < 2) return;
        var nombre = quitaTildes((parts[0] || '').trim());
        if (!nombre || nombre.match(/^\d+$/)) return; // ignorar lineas que son solo números
        var punto = quitaTildes((parts[1] || '').trim());
        var orden = null; // el orden lo determina la base, no la distribución
        var sentido = (parts[2] || '').trim() || null;
        // Auto-corregir sentido desde el nombre del punto (más confiable)
        if (punto) {
          if (punto.indexOf('N/S') >= 0) sentido = 'N/S';
          else if (punto.indexOf('S/N') >= 0) sentido = 'S/N';
        }
        var funcion = (parts[3] || '').trim() || 'Tranquera';
        var cat = (parts[4] || 'activo').trim().toLowerCase();
        // Normalizar categoría
        if (cat.indexOf('descanso') >= 0) cat = 'descanso';
        else if (cat.indexOf('supervisor') >= 0) cat = 'supervisor';
        else if (cat.indexOf('apoyo') >= 0) cat = 'apoyo_zona';
        else if (cat.indexOf('compensat') >= 0) cat = 'compensatorio';
        else if (cat.indexOf('vacacion') >= 0) cat = 'vacaciones';
        else cat = 'activo';
        items.push({
          orden: orden,
          nombre: nombre,
          nombre_clave: makeNameKey(nombre),
          punto: punto,
          sentido: sentido,
          funcion: funcion,
          categoria: cat,
          qap_estado: null,
          qap_hora_ini: null,
          qap_hora_fin: null,
          qap_orden: null
        });
      });
      // Si no hay items del formato pipe, intentar JSON como fallback
      if (items.length === 0) {
        try {
          var jdata = parseGemJSON(text);
          if (jdata && jdata.items && jdata.items.length) {
            // Normalizar items del JSON
            jdata.items.forEach(function (it) { it.nombre = quitaTildes(it.nombre || ''); it.punto = quitaTildes(it.punto || ''); });
            return jdata;
          }
        } catch (e) { }
      }
      return { zona: 'CENTRO', items: items };
    }


    async function callGeminiText(prompt) {
      var cfg = getSettings2();
      var key = (cfg.gemKey || '').trim();
      if (!key) throw new Error('Sin clave API. Verifica la conexion con el Sheet.');
      var gModels = CONFIG.GEMINI_MODELS;
      var lastErr = null;
      for (var mi = 0; mi < gModels.length; mi++) {
        var model = gModels[mi];
        try {
          var r = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + key,
            {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 4000 } })
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

    function iniQAP(idx) {
      var data = getProgHoy();
      if (!data || !data.items || idx >= data.items.length) return;
      var enQap = data.items.filter(function (x) { return x.qap_estado === 'qap'; }).length;
      var item = data.items[idx];
      item.qap_estado = 'qap';
      item.qap_hora_ini = nowTime();
      item.qap_ts_ini = Date.now();
      item.qap_orden = enQap + 1;
      saveProgHoy(data);
      renderProgContent();
      updateProgHomeBtn();
      var apell = item.nombre.split(' ')[0];
      var msg = '☕ Salida QAP: ' + B(apell);
      AppState.quickMsg = msg;
      document.getElementById('qs-title').textContent = 'Inicio QAP';
      document.getElementById('qs-prev').textContent = msg;
      var rr = document.getElementById('qs-relevo-row');
      if (rr) rr.style.display = 'none';
      document.getElementById('quick-overlay').classList.add('open');
    }

    function finQAP(idx) {
      var data = getProgHoy();
      if (!data || !data.items || idx >= data.items.length) return;
      var item = data.items[idx];
      item.qap_estado = 'retorno';
      item.qap_hora_fin = nowTime();
      item.qap_ts_fin = Date.now();
      saveProgHoy(data);
      renderProgContent();
      updateProgHomeBtn();
      var apell = item.nombre.split(' ')[0];
      var msg = '⏰ Retorno QAP: ' + B(apell);
      AppState.quickMsg = msg;
      document.getElementById('qs-title').textContent = 'Fin QAP';
      document.getElementById('qs-prev').textContent = msg;
      var rr = document.getElementById('qs-relevo-row');
      if (rr) rr.style.display = 'none';
      document.getElementById('quick-overlay').classList.add('open');
    }

    function abrirQAPGrupal() {
      var data = getProgHoy();
      if (!data || !data.items) return;
      var sinQAPCats = ['descanso', 'vacaciones', 'compensatorio', 'supervisor'];
      var activos = data.items.filter(function (x) {
        return sinQAPCats.indexOf(x.categoria) < 0
          && (x.funcion || '').toLowerCase().indexOf('ruteo') < 0
          && x.qap_estado !== 'qap';
      });
      var el = document.getElementById('qap-sel-list');
      el.innerHTML = activos.map(function (item, i) {
        return '<div class="pi" id="qsel-' + i + '">'
          + '<div class="pi-cb" id="qcb-' + i + '" data-i="' + i + '" onclick="toggleQapCb(+this.dataset.i)"></div>'
          + '<div class="pi-info">'
          + '<div class="pi-name">' + (item.orden ? item.orden + '. ' : '') + escapeHTML(item.nombre) + '</div>'
          + '<div class="pi-sub">' + [item.punto, item.sentido, item.funcion].filter(Boolean).map(escapeHTML).join(' · ') + '</div>'
          + '</div></div>';
      }).join('');
      document.getElementById('qap-sel-n').textContent = '0';
      document.getElementById('qap-confirm-btn').disabled = true;
      go('s-prog-qap');
    }

    function toggleQapCb(i) {
      var cb = document.getElementById('qcb-' + i);
      cb.classList.toggle('on');
      cb.textContent = cb.classList.contains('on') ? '✓' : '';
      var n = document.querySelectorAll('#qap-sel-list .pi-cb.on').length;
      document.getElementById('qap-sel-n').textContent = n;
      document.getElementById('qap-confirm-btn').disabled = (n === 0);
    }

    function progSelAll() {
      var cbs = document.querySelectorAll('#qap-sel-list .pi-cb');
      var anyOn = document.querySelector('#qap-sel-list .pi-cb.on');
      cbs.forEach(function (cb) {
        if (anyOn) { cb.classList.remove('on'); cb.textContent = ''; }
        else { cb.classList.add('on'); cb.textContent = '✓'; }
      });
      var n = anyOn ? 0 : cbs.length;
      document.getElementById('qap-sel-n').textContent = n;
      document.getElementById('qap-confirm-btn').disabled = (n === 0);
    }

    function confirmarQAPGrupal() {
      var data = getProgHoy();
      if (!data || !data.items) return;
      var sinQAPCats = ['descanso', 'vacaciones', 'compensatorio', 'supervisor'];
      var activos = data.items.filter(function (x) {
        return sinQAPCats.indexOf(x.categoria) < 0
          && (x.funcion || '').toLowerCase().indexOf('ruteo') < 0
          && x.qap_estado !== 'qap';
      });
      var enQap = data.items.filter(function (x) { return x.qap_estado === 'qap'; }).length;
      var selected = [];
      document.querySelectorAll('#qap-sel-list .pi-cb.on').forEach(function (cb) {
        var i = parseInt(cb.dataset.i);
        if (activos[i]) selected.push(activos[i]);
      });
      if (!selected.length) return;
      var hora = nowTime();
      var msgLines = ['☕ ' + B('INICIO DE QAP GRUPAL'), '🕐 ' + B('Hora:') + ' ' + hora, ''];
      selected.forEach(function (item, si) {
        var orden = enQap + si + 1;
        var realIdx = data.items.indexOf(item);
        if (realIdx >= 0) {
          data.items[realIdx].qap_estado = 'qap';
          data.items[realIdx].qap_hora_ini = hora;
          data.items[realIdx].qap_ts_ini = Date.now();
          data.items[realIdx].qap_orden = orden;
        }
        msgLines.push(orden + '° ' + B(item.nombre.split(' ')[0]));
      });
      saveProgHoy(data);
      var msg = msgLines.join('\n');
      AppState.quickMsg = msg;
      document.getElementById('qs-title').textContent = 'QAP Grupal';
      document.getElementById('qs-prev').textContent = msg;
      var rr = document.getElementById('qs-relevo-row');
      if (rr) rr.style.display = 'none';
      document.getElementById('quick-overlay').classList.add('open');
      goBack();
      renderProgContent();
      updateProgHomeBtn();
      showToast('✓ QAP iniciado para ' + selected.length + ' COVs');
    }


    // ═══════════════════════════════════════════════
    // PROGRAMACIÓN V2 — Base de COVs + Destacados
    // ═══════════════════════════════════════════════

    // ── Utilidades ──

    // ── Matching difuso de nombres ──
    function levenshtein(a, b) {
      var m = a.length, n = b.length, dp = [], i, j;
      for (i = 0; i <= m; i++) {
        dp[i] = [i];
        for (j = 1; j <= n; j++) dp[i][j] = 0;
      }
      for (j = 0; j <= n; j++) dp[0][j] = j;
      for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
      return dp[m][n];
    }

    function fuzzyMatch(nombre, base) {
      var normName = quitaTildes(nombre || '').toUpperCase().trim();
      var parts = normName.split(/\s+/).filter(Boolean);
      if (parts.length < 2) return null; // Exige al menos 2 palabras
      
      var firstLetter = parts[0].charAt(0);
      var best = null;
      var bestScore = -1;
      
      base.forEach(function(b) {
        var bNorm = quitaTildes(b.nombre_completo || '').toUpperCase().trim();
        var bParts = bNorm.split(/\s+/).filter(Boolean);
        var origBPartsLen = bParts.length;
        // Filtro rápido: deben empezar con la misma letra inicial del primer apellido
        if (!origBPartsLen || bParts[0].charAt(0) !== firstLetter) return; 
        
        var matchCount = 0;
        parts.forEach(function(p) {
          if (p.length < 2) return;
          for (var i = 0; i < bParts.length; i++) {
            if (bParts[i].length < 2) continue;
            // Tolerancia: 2 errores si la palabra es larga, 1 si es mediana, 0 si es muy corta
            var maxDist = p.length >= 5 ? 2 : (p.length >= 3 ? 1 : 0);
            if (levenshtein(p, bParts[i]) <= maxDist) {
              matchCount++;
              bParts[i] = ''; // vaciar para evitar doble coincidencia
              break;
            }
          }
        });
        
        var minWords = Math.min(parts.length, origBPartsLen);
        // Exigir al menos 2 palabras coincidentes y que representen la mayoría del nombre
        if (matchCount >= 2 && matchCount >= minWords - 1) { 
          // Score prioriza más coincidencias y castiga diferencias de longitud (palabras extra)
          var totalScore = matchCount - (Math.abs(parts.length - origBPartsLen) * 0.1);
          if (totalScore > bestScore) {
            bestScore = totalScore;
            best = b;
          }
        }
      });
      
      return best;
    }

    function fuzzyMatchPunto(rawPunto, sentido) {
      if (!AppState.puntosBaseCache || !AppState.puntosBaseCache.length) return null;
      var norm = quitaTildes(rawPunto || '').toUpperCase().trim();
      if (!norm) return null;
      
      var m = norm.match(/\b(?:C|CUADRA\s*)?(\d+)\b/i);
      var numCuadra = m ? m[1] : null;
      var best = null;
      var bestScore = -1;
      var words = norm.replace(/\b(?:C|CUADRA|N\/S|S\/N|SN)\b/gi, '').split(/\s+/).filter(function(w) { return w.length > 2; });
      
      AppState.puntosBaseCache.forEach(function(pt) {
        var ptAvenida = quitaTildes(pt.avenida || '').toUpperCase();
        var ptCuadra = String(pt.cuadra || '');
        var ptInter = quitaTildes(pt.interseccion || '').toUpperCase();
        var ptSentido = (pt.sentido || '').replace(/\//g, '').toUpperCase();
        var pSentidoNorm = (sentido || '').replace(/\//g, '').toUpperCase();
        
        var score = 0;
        if (numCuadra && ptCuadra === numCuadra) score += 5;
        else if (numCuadra && ptCuadra && ptCuadra !== numCuadra) return;
        
        if (pSentidoNorm && ptSentido && pSentidoNorm === ptSentido) score += 3;
        
        var targetWords = (ptAvenida + ' ' + ptInter).split(/\s+/).filter(Boolean);
        var matchCount = 0;
        words.forEach(function(w) {
          for(var i=0; i<targetWords.length; i++) {
            if(targetWords[i].length < 3) continue;
            if(levenshtein(w, targetWords[i]) <= (w.length > 5 ? 2 : 1)) {
              matchCount++;
              targetWords[i] = '';
              break;
            }
          }
        });
        
        score += matchCount * 2;
        if (matchCount > 0 && score > bestScore) {
          bestScore = score;
          best = pt;
        }
      });
      
      if (best && bestScore >= 2) {
         var str = best.avenida.toUpperCase();
         if (best.cuadra) str += ' C/' + best.cuadra;
         if (best.interseccion) str += ' - ' + best.interseccion.toUpperCase();
         var bestSentido = best.sentido ? best.sentido.toUpperCase() : null;
         if (bestSentido) {
           bestSentido = (bestSentido.replace(/\//g, '') === 'NS') ? 'N/S' : (bestSentido.replace(/\//g, '') === 'SN' ? 'S/N' : bestSentido);
         }
         return { punto: str, sentido: bestSentido };
      }
      return null;
    }

    function makeNameKey(nombre) {
      var parts = quitaTildes(nombre || '').trim().toUpperCase().split(/\s+/).filter(Boolean);
      if (parts.length === 0) return '';
      // Retorna el nombre completo normalizado, eliminando el viejo modelo de (Primero + Último) que causaba colisiones
      return parts.join(' ');
    }

    function isSinQAP(item) {
      var sinCats = ['descanso', 'vacaciones', 'compensatorio', 'supervisor'];
      return sinCats.indexOf(item.categoria) >= 0
        || (item.funcion || '').toLowerCase().indexOf('ruteo') >= 0;
    }

    // ── Base de COVs (localStorage por corredor) ──
    function getCOVsBase(corredor) {
      var c = corredor || getCorredor(); return AppState.covsBaseCache[c] || [];
    }
    function saveCOVsBase(arr, corredor) {
      var c = corredor || getCorredor();
      AppState.covsBaseCache[c] = arr;
      if (typeof DB !== 'undefined') DB.set('covs_base', 'covs_base_' + c, arr).catch(function(e){console.error(e);});
    }

    function matchNombres(items, corredor) {
      var base = getCOVsBase(corredor);
      var baseMap = {};
      base.forEach(function (b) { baseMap[b.nombre_clave] = b; });
      var hoy = today();

      // Issue #1 FIX: De-duplicar items por nombre_clave antes de procesar
      // Si la prog ya tiene datos, solo actualizar los que cambiaron; no duplicar.
      var seenKeys = {};
      items = items.filter(function(item) {
        var key = makeNameKey(item.nombre);
        if (seenKeys[key]) return false;
        seenKeys[key] = true;
        return true;
      });

      items.forEach(function (item) {
        var key = makeNameKey(item.nombre);
        item.nombre_clave = key;

        // 1. Coincidencia exacta por clave
        if (baseMap[key]) {
          item.nombre = baseMap[key].nombre_completo;
          baseMap[key].ultima_aparicion = hoy;
          baseMap[key].activo = true;
        } else {
          // 2. Matching difuso (mismo apellido, nombre similar)
          var fuzzy = fuzzyMatch(item.nombre, base);
          if (fuzzy) {
            // Corregir nombre con el canónico de la base
            item.nombre = fuzzy.nombre_completo;
            item.nombre_clave = fuzzy.nombre_clave;
            fuzzy.ultima_aparicion = hoy;
            fuzzy.activo = true;
          } else if (item.nombre) {
            // Nuevo COV — agregar a la base (solo si no existe ya por ese key)
            if (!baseMap[key]) {
              var nuevo = {
                nombre_completo: item.nombre,
                nombre_clave: key,
                corredor: corredor || getCorredor(),
                activo: true,
                ultima_aparicion: hoy,
                obs: ''
              };
              base.push(nuevo);
              baseMap[key] = nuevo;
            }
          }
        }
      });

      // Marcar inactivos (más de 45 días sin aparecer)
      var hoyMs = new Date().getTime();
      base.forEach(function (b) {
        if (b.ultima_aparicion) {
          var dias = (hoyMs - new Date(b.ultima_aparicion).getTime()) / 86400000;
          if (dias > 45) b.activo = false;
        }
      });

      // Ordenar A-Z por primer apellido (primera palabra)
      base.sort(function (a, b) {
        var ka = (a.nombre_completo || '').split(' ')[0];
        var kb = (b.nombre_completo || '').split(' ')[0];
        return ka.localeCompare(kb);
      });

      saveCOVsBase(base, corredor);
      return items;
    }

    // ── Destacados (local, por fecha) ──
    function getDestacados() {
      var d = S.get('prog_destacados');
      if (!d || d.fecha !== today()) return [];
      return d.claves || [];
    }
    function saveDestacados(claves) {
      S.set('prog_destacados', { fecha: today(), claves: claves });
    }
    function toggleDestacado(idx) {
      var data = getProgHoy();
      if (!data || !data.items || idx >= data.items.length) return;
      var item = data.items[idx];
      var claves = getDestacados();
      var i = claves.indexOf(item.nombre_clave);
      if (i >= 0) claves.splice(i, 1);
      else claves.push(item.nombre_clave);
      saveDestacados(claves);
      renderProgContent();
    }

    // ── Config previa al paste ──
    var _pcCorr = '', _pcTurno = '', _pcFecha = '';

    function abrirProgConfig() {
      var cfg = getSettings2();
      _pcCorr = cfg.corredor || 'TGA';
      _pcTurno = getProfile().turno || 'TARDE';
      _pcFecha = today();
      // Marcar selecciones
      document.querySelectorAll('#pc-corr .pc-opt').forEach(function (b) {
        b.classList.toggle('sel', b.dataset.v === _pcCorr);
      });
      document.querySelectorAll('#pc-turno .pc-opt').forEach(function (b) {
        b.classList.toggle('sel', b.dataset.v === _pcTurno);
      });
      var fi = document.getElementById('pc-fecha');
      if (fi) fi.value = _pcFecha;
      go('s-prog-config');
    }

    function pcSel(tipo, btn) {
      var group = tipo === 'corr' ? 'pc-corr' : 'pc-turno';
      document.querySelectorAll('#' + group + ' .pc-opt').forEach(function (b) {
        b.classList.remove('sel');
      });
      btn.classList.add('sel');
      if (tipo === 'corr') _pcCorr = btn.dataset.v;
      else _pcTurno = btn.dataset.v;
    }

    function irAPaste() {
      var corrSel = document.querySelector('#pc-corr .pc-opt.sel');
      var turnSel = document.querySelector('#pc-turno .pc-opt.sel');
      var fi = document.getElementById('pc-fecha');
      if (!corrSel || !turnSel) { showToast('⚠️ Selecciona corredor y turno'); return; }
      _pcCorr = corrSel.dataset.v;
      _pcTurno = turnSel.dataset.v;
      _pcFecha = (fi && fi.value) || today();
      document.getElementById('prog-texto').value = '';
      document.getElementById('prog-proc-msg').textContent = '';
      go('s-prog-paste');
    }

    // ── Procesar con IA (actualizado) ──
    async function procesarProg() {
      var texto = (document.getElementById('prog-texto').value || '').trim();
      var msg = document.getElementById('prog-proc-msg');
      if (texto.length < 50) { msg.textContent = '⚠️ Pega el texto completo'; return; }
      var btn = document.getElementById('prog-proc-btn');
      btn.disabled = true; btn.textContent = '⏳ Procesando…';
      msg.textContent = '';
      try {
        var prompt = 'Eres asistente del Corredor ' + _pcCorr + '. Extrae los datos de cada COV de esta distribucion semanal.\n\n'
          + 'RESPONDE SOLO con lineas en este formato (sin encabezado, sin explicacion):\n'
          + 'NOMBRE|PUNTO|SENTIDO|FUNCION|CATEGORIA\n\n'
          + 'EJEMPLOS de como transformar el texto:\n'
          + 'Texto: "02.COV:Amau Herrera Maria (Tranquera)" bajo "*CONDE SUPERUNDA CDRA 1 N/S*"\n'
          + 'Resultado: Amau Herrera Maria|CONDE SUPERUNDA CDRA 1|N/S|Tranquera|activo\n\n'
          + 'Texto: "Picharde Mendoza Rosa" bajo "SUPERVISOR ZONAL"\n'
          + 'Resultado: Picharde Mendoza Rosa|SUPERVISOR ZONAL||Supervisor|supervisor\n\n'
          + 'Texto: "28.Hoyos Levano Alberto" bajo "APOYO A CONOS"\n'
          + 'Resultado: Hoyos Levano Alberto||N/S|Apoyo|apoyo_zona\n\n'
          + 'REGLAS:\n'
          + '- NOMBRE: SIN tildes (a,e,i,o,u,n), SIN numeros de orden (ignora 02., 03.), SIN emojis\n'
          + '- PUNTO: nombre del paradero sin asteriscos ni emojis. Si no tiene punto, deja vacio\n'
          + '- SENTIDO: N/S o S/N segun aparezca en el paradero, o vacio\n'
          + '- FUNCION: Tranquera, 1Tranquera, 2Tranquera, Ruteo, Apoyo, Supervisor\n'
          + '- CATEGORIA: activo | supervisor | apoyo_zona | descanso | compensatorio | vacaciones\n'
          + '- Ignora posiciones con solo 🚫 sin nombre\n'
          + '- NO pongas encabezados ni texto extra, SOLO las lineas de datos\n\n'
          + 'Distribucion:\n' + texto;

        // 1. Pre-procesar el texto directamente (sin IA para parsear)
        var preItems = preProcessarDist(texto);
        var data;
        if (preItems.length >= 3) {
          data = { zona: 'CENTRO', items: preItems };
        } else {
          // Pocos resultados — usar IA como respaldo
          var res = await callGeminiText(prompt);
          window._lastGeminiRaw = res.text;
          data = parsePipeFormat(res.text);
        }
        if (data && data.items && data.items.length) {
          // Match con base de COVs
          data.items = matchNombres(data.items, _pcCorr);
          data.corredor = _pcCorr;
          data.turno = _pcTurno;
          data.fecha = _pcFecha;
          saveProgHoy(data);
          var source = (preItems && preItems.length >= 3) ? 'directo' : (res && res.model ? res.model : 'IA');
          showToast('✓ ' + data.items.length + ' COVs · ' + source);
          updateProgHomeBtn();
          updateProgMeta();
          go('s-prog');
          renderProgContent();
        } else {
          var raw = (window._lastGeminiRaw || '').slice(0, 300);
          msg.innerHTML = '⚠️ No se detectaron COVs.<br><small style="font-family:monospace;word-break:break-all;color:var(--mut)">' + raw + '</small>';
        }
      } catch (e) {
        // Mostrar error completo con línea para diagnóstico
        var stack = (e.stack || '').split('\n').slice(0, 3).join(' | ');
        msg.textContent = '⚠️ ' + e.message + (stack ? ' → ' + stack : '');
        console.error('procesarProg error:', e);
      } finally {
        btn.disabled = false; btn.textContent = '🤖 Procesar con IA';
      }
    }

    // ── Render tabla (versión nueva) ──
    function updateProgMeta() {
      var data = getProgHoy();
      var el = document.getElementById('prog-meta');
      if (!el) return;
      if (data && data.corredor) {
        var fechaLabel = data.fecha && data.fecha !== today()
          ? data.fecha + ' (vigente)'
          : (data.fecha || today());
        el.textContent = data.corredor + ' · ' + (data.turno || '') + ' · ' + fechaLabel;
      }
    }

    function renderProgContent() {
      var el = document.getElementById('prog-content');
      var data = getProgHoy();
      updateProgMeta();
      if (!data || !data.items || !data.items.length) {
        var canLoad = AppState.userPerms.prog || AppState.isAdmin;
        var hint = canLoad
          ? 'Toca <b>Cargar</b> para pegar la distribución o <b>Bajar</b> para obtener del Sheet'
          : 'Toca <b>📥 Bajar</b> para obtener la programación';
        el.innerHTML = '<div class="prog-empty">📅 Sin programación cargada<br><small>' + hint + '</small></div>';
        return;
      }
      var items = data.items;
      var claves_dest = getDestacados();

      // Separar grupos
      var destacados = [], enQap = [], activos = [], otros = [];
      items.forEach(function (item, idx) {
        var realIdx = idx;
        var _isApoyo = (item.categoria || '').indexOf('apoyo') >= 0;
        var _hasPunto = !!(item.punto && item.punto.trim());
        if (claves_dest.indexOf(item.nombre_clave || '') >= 0) destacados.push({ item: item, idx: realIdx });
        else if (item.qap_estado === 'qap') enQap.push({ item: item, idx: realIdx });
        else if (!isSinQAP(item) && !(_isApoyo && !_hasPunto)) activos.push({ item: item, idx: realIdx });
        else otros.push({ item: item, idx: realIdx });
      });

      // Ordenar activos A-Z por clave
      activos.sort(function (a, b) { return (a.item.nombre_clave || '').localeCompare(b.item.nombre_clave || ''); });
      otros.sort(function (a, b) { return (a.item.nombre || '').localeCompare(b.item.nombre || ''); });

      // Estadísticas
      var totalEnPunto = destacados.length + enQap.length + activos.length;
      var stats = '<div class="prog-stats">'
        + '<span class="pstat a">✓ ' + totalEnPunto + ' en punto</span>'
        + (enQap.length ? '<span class="pstat q">☕ ' + enQap.length + ' QAP</span>' : '')
        + (otros.length ? '<span class="pstat o">💤 ' + otros.length + '</span>' : '')
        + '</div>';

      // Filtros — Issue #4: agregar chip Descanso
      var filters = '<div class="prog-filters">'
        + ['todos', 'activo', 'ns', 'sn', 'qap', 'descanso'].map(function (f) {
          var fnames = { todos: 'Todos', activo: 'Activos', ns: 'N/S', sn: 'S/N', qap: 'En QAP', descanso: '💤 Descanso' };
          return '<button class="pfchip' + (AppState.progFiltro === f ? ' on' : '') + '" data-f="' + f + '" onclick="setProgF(this.dataset.f)">' + fnames[f] + '</button>';
        }).join('')
        + '</div>';

      // Aplicar filtro — Issue #4: filtro Descanso va sobre la sección "otros"
      function applyFilter(list) {
        if (AppState.progFiltro === 'todos') return list;
        if (AppState.progFiltro === 'activo') return list;
        if (AppState.progFiltro === 'descanso') {
          // Muestra SOLO COVs de categoría descanso/comp/vacaciones (vienen en "otros")
          return list.filter(function (x) {
            var DESCANSO_CATS = ['descanso', 'compensatorio', 'vacaciones'];
            return DESCANSO_CATS.indexOf(x.item.categoria) >= 0;
          });
        }
        return list.filter(function (x) {
          if (AppState.progFiltro === 'ns') return x.item.sentido === 'N/S';
          if (AppState.progFiltro === 'sn') return x.item.sentido === 'S/N';
          if (AppState.progFiltro === 'qap') return x.item.qap_estado === 'qap';
          return true;
        });
      }

      var CAT_LABELS = {
        'apoyo_conos': 'apoyo conos', 'apoyo_rejas': 'apoyo rejas',
        'apoyo_zona_sur': 'apoyo sur', 'apoyo_zona_norte': 'apoyo norte',
        'apoyo_zona': 'apoyo', 'descanso': 'descanso',
        'compensatorio': 'comp.', 'vacaciones': 'vacaciones', 'supervisor': 'supervisor'
      };
      var HARD_NO_QAP = ['descanso', 'vacaciones', 'compensatorio', 'supervisor'];

      function renderGroup(list, isDestacado, isOtros) {
        return applyFilter(list).map(function (x) {
          var item = x.item, idx = x.idx;
          var isQap = item.qap_estado === 'qap';
          var isRetorno = item.qap_estado === 'retorno';
          var isSshh = item.sshh_estado === 'sshh';
          var isSshhFin = item.sshh_estado === 'retorno';
          var cls = 'pi' + (isDestacado ? ' destacado' : '') + (isQap ? ' inqap' : '');
          var qapBadge = isQap ? '<div class="pi-badge">☕ ' + item.qap_orden + '° · ' + item.qap_hora_ini + '</div>' : '';
          var sshhBadge = isSshh ? '<div class="sshh-badge" style="margin-top:2px">🚽 ' + item.sshh_hora + '</div>' : '';
          var catLbl = CAT_LABELS[item.categoria];
          var catNote = catLbl ? '<span style="font-size:10px;color:var(--mut);margin-left:4px">(' + catLbl + ')</span>' : '';

          var btns = '';
          var _apoyo = (item.categoria || '').indexOf('apoyo') >= 0;
          var _pto = !!(item.punto && item.punto.trim());
          var hardNo = HARD_NO_QAP.indexOf(item.categoria) >= 0
            || (item.funcion || '').toLowerCase().indexOf('ruteo') >= 0
            || (_apoyo && !_pto); // apoyo sin punto: sin QAP ni SSHH

          if (!hardNo) {
            if (isRetorno) {
              btns += '<span class="retorno-badge">☕✓</span>';
            } else if (isQap) {
              btns += '<button class="qfin-btn" data-idx="' + idx + '" onclick="finQAP(+this.dataset.idx)">✓ Fin</button>';
            } else {
              btns += '<button class="qini-btn" data-idx="' + idx + '" onclick="iniQAP(+this.dataset.idx)">☕</button>';
            }
            // SS.HH.
            if (isSshhFin) {
              btns += '<span class="sshh-badge">🚽✓</span>';
            } else if (isSshh) {
              btns += '<button class="sshh-btn" data-idx="' + idx + '" onclick="finSSHH(+this.dataset.idx)">✓🚽</button>';
            } else if (!isQap) {
              btns += '<button class="sshh-btn" data-idx="' + idx + '" onclick="iniSSHH(+this.dataset.idx)">🚽</button>';
            }
            btns += '<button class="dest-btn' + (isDestacado ? ' on' : '') + '" data-idx="' + idx + '" onclick="toggleDestacado(+this.dataset.idx)">⭐</button>';
          }

          var asignarForm = '';
          if (isOtros && !hardNo && !(item.punto && item.punto.trim())) {
            asignarForm = '<button class="asignar-btn" onclick="toggleAsignar(' + idx + ')">📍 Asignar punto</button>'
              + '<div class="asignar-form" id="asf-' + idx + '">'
              + '<input class="fi" id="asp-' + idx + '" type="text" placeholder="Paradero / Tranquera" style="font-size:12px;padding:6px 8px">'
              + '<div class="sent-opts">'
              + '<button class="sent-opt" data-v="N/S" onclick="selSentOpt(' + idx + ',\'N/S\')">N/S</button>'
              + '<button class="sent-opt" data-v="S/N" onclick="selSentOpt(' + idx + ',\'S/N\')">S/N</button>'
              + '<button class="sent-opt" data-v="" onclick="selSentOpt(' + idx + ',\'\')">—</button>'
              + '</div>'
              + '<button onclick="guardarAsignacion(' + idx + ')" style="width:100%;margin-top:6px;background:var(--acc);color:#fff;border:none;border-radius:var(--rs);padding:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit">Guardar</button>'
              + '</div>';
          }

          return '<div class="' + cls + '">'
            + '<div class="pi-info">'
            + '<div class="pi-name">' + escapeHTML(item.nombre || '') + catNote + '</div>'
            + '<div class="pi-sub">' + [item.punto, item.sentido, item.funcion].filter(Boolean).map(escapeHTML).join(' · ') + '</div>'
            + qapBadge + sshhBadge
            + asignarForm
            + '</div>'
            + '<div class="pi-btns">' + btns + '</div>'
            + '</div>';
        }).join('');
      }

      var html2 = stats + filters;

      // Sección DESTACADOS
      if (applyFilter(destacados).length) {
        html2 += '<div class="prog-section-lbl">⭐ Destacados</div>';
        html2 += '<div class="prog-list">' + renderGroup(destacados, true) + '</div>';
      }
      // Sección EN QAP
      if (applyFilter(enQap).length) {
        html2 += '<div class="prog-section-lbl">☕ En QAP</div>';
        html2 += '<div class="prog-list">' + renderGroup(enQap, false) + '</div>';
      }
      // Sección ACTIVOS
      if (applyFilter(activos).length) {
        html2 += '<div class="prog-section-lbl">✓ En punto</div>';
        html2 += '<div class="prog-list">' + renderGroup(activos, false) + '</div>';
      }
      // Sección OTROS (colapsable, auto-abre con filtro descanso)
      if (otros.length) {
        var isDescansoFiltro = AppState.progFiltro === 'descanso';
        var otrosFiltered = applyFilter(otros);
        if (isDescansoFiltro) {
          // Con filtro descanso: mostrar solo descansos, sin collapsible, con encabezado propio
          if (otrosFiltered.length) {
            html2 += '<div class="prog-section-lbl">💤 En Descanso / Compensatorio / Vacaciones (' + otrosFiltered.length + ')</div>';
            html2 += '<div class="prog-list">' + renderGroup(otros, false, true) + '</div>';
          }
        } else {
          html2 += '<button class="otros-toggle" onclick="toggleOtros(this)">'
            + '💤 Descanso / otros (' + otros.length + ') ▸</button>';
          html2 += '<div class="otros-section prog-list" id="otros-section" style="display:none">'
            + renderGroup(otros, false, true)
            + '</div>';
        }
      }

      el.innerHTML = html2;
    }

    function toggleOtros(btn) {
      var sec = document.getElementById('otros-section');
      if (!sec) return;
      var open = sec.style.display !== 'none';
      sec.style.display = open ? 'none' : 'block';
      btn.textContent = btn.textContent.replace(open ? '▾' : '▸', open ? '▸' : '▾');
    }


    // ── SUBIR al Sheet (local → Sheet) ──
    async function subirProg() {
      var data = getProgHoy();
      if (!data || !data.items || !data.items.length) {
        showToast('⚠️ Sin programación cargada'); return;
      }
      var btn = document.getElementById('subir-btn');
      if (btn) { btn.classList.add('loading'); btn.textContent = '⏳ Subiendo…'; }
      try {
        var corredor = data.corredor || getCorredor();

        // 1. Subir COVs_Base (el Sheet preserva nombres existentes, solo añade nuevos)
        var base = getCOVsBase(corredor);
        if (base && base.length) {
          await sheetPost({
            action: 'covs_base',
            did: getDeviceId(),
            corredor: corredor,
            covs: base
          });
        }

        // 2. Subir estado diario (Prog_Estado)
        var payload = data.items.map(function (item) {
          return {
            nombre_clave: item.nombre_clave || '', nombre: item.nombre || '',
            punto: item.punto || '', sentido: item.sentido || '',
            funcion: item.funcion || '', categoria: item.categoria || '',
            qap_estado: item.qap_estado || '', qap_hora_ini: item.qap_hora_ini || '',
            qap_hora_fin: item.qap_hora_fin || '', qap_orden: item.qap_orden || ''
          };
        });
        var res = await sheetPost({
          action: 'prog_estado',
          did: getDeviceId(),
          corredor: corredor,
          turno: data.turno || '',
          fecha: data.fecha || today(),
          items: payload
        });
        if (res && res.ok) showToast('✓ Subido: ' + (res.count || payload.length) + ' COVs');
        else showToast('⚠️ ' + (res && res.error || 'Error al subir'));
      } catch (e) {
        showToast('⚠️ ' + (e.message || 'Error de red'));
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.textContent = '📤 Subir'; }
      }
    }

    // ── BAJAR del Sheet (Sheet → local) ──
    async function bajarProg() {
      var data = getProgHoy(); // puede ser null si no hay datos locales
      var btn = document.getElementById('bajar-btn');
      if (btn) { btn.classList.add('loading'); btn.textContent = '⏳ Bajando…'; }
      try {
        // Si no hay datos locales, usar perfil del usuario
        var corredor = (data && data.corredor) || getCorredor();
        var turno = (data && data.turno) || getProfile().turno || '';
        var fecha = today(); // siempre bajar datos de hoy desde el Sheet

        // 1. Bajar COVs_Base — el Sheet manda en los nombres
        try {
          var baseRes = await sheetGet('covs_base', { corredor: corredor });
          if (baseRes && baseRes.covs && baseRes.covs.length) {
            var localBase = getCOVsBase(corredor);
            var localMap = {};
            localBase.forEach(function (b) { localMap[b.nombre_clave] = b; });

            baseRes.covs.forEach(function (sc) {
              if (localMap[sc.nombre_clave]) {
                // Sheet manda: actualizar nombre canónico en local
                localMap[sc.nombre_clave].nombre_completo = sc.nombre_completo;
                if (sc.obs) localMap[sc.nombre_clave].obs = sc.obs;
              } else {
                localBase.push(sc); // nuevo en Sheet, añadir local
              }
            });
            saveCOVsBase(localBase, corredor);

            // Aplicar nombres corregidos a la programación de hoy
            if (data && data.items) {
              var baseMap = {};
              localBase.forEach(function (b) { baseMap[b.nombre_clave] = b; });
              data.items.forEach(function (item) {
                if (item.nombre_clave && baseMap[item.nombre_clave]) {
                  item.nombre = baseMap[item.nombre_clave].nombre_completo;
                }
              });
            }
          }
        } catch (e2) { /* no crítico */ }

        // 2. Bajar Prog_Estado — actualizar QAP desde Sheet
        // Sin fecha → el Sheet devuelve la más reciente disponible
        var res = await sheetGet('prog_estado', {
          did: getDeviceId(),
          corredor: corredor,
          turno: turno
          // fecha omitida intencionalmente
        });
        if (res && res.items && res.items.length) {
          // Si no había datos locales, crear estructura desde el Sheet
          if (!data) {
            data = { corredor: corredor, turno: turno, fecha: fecha, items: res.items };
            saveProgHoy(data);
            renderProgContent();
            showToast('✓ Programación bajada: ' + res.items.length + ' COVs');
            return;
          }
          var sheetMap = {};
          res.items.forEach(function (si) { sheetMap[si.nombre_clave] = si; });
          data.items.forEach(function (item) {
            var sk = sheetMap[item.nombre_clave];
            if (sk) {
              // Sheet manda en QAP si el local no tiene timestamp propio
              if (sk.qap_estado && !item.qap_ts_ini) {
                item.qap_estado = sk.qap_estado;
                item.qap_hora_ini = sk.qap_hora_ini;
                item.qap_hora_fin = sk.qap_hora_fin;
                item.qap_orden = sk.qap_orden;
              }
              // Punto asignado en otro dispositivo
              if (sk.punto && !item.punto) item.punto = sk.punto;
              if (sk.sentido && !item.sentido) item.sentido = sk.sentido;
            }
          });
          saveProgHoy(data);
          renderProgContent();
          showToast('✓ Actualizado desde Sheet');
        } else if (data && data.items && data.items.length) {
          // No hay datos nuevos en Sheet para hoy, pero tenemos locales — mantener
          saveProgHoy(data);
          renderProgContent();
          showToast('ℹ️ Sin datos nuevos en Sheet · mostrando prog del ' + (data.fecha || 'último cargado'));
        } else {
          showToast('ℹ️ Sin programación disponible. Usa "Cargar" para pegar la distribución.');
        }
      } catch (e) {
        showToast('⚠️ ' + (e.message || 'Error de red'));
      } finally {
        if (btn) { btn.classList.remove('loading'); btn.textContent = '📥 Bajar'; }
      }
    }



    async function getSWVersion() {
      try {
        var keys = await caches.keys();
        var app = keys.find(function (k) { return k.indexOf('cov-reportes') >= 0 || k.indexOf('reportes-tga') >= 0; });
        return app || (keys.length ? keys.join(', ') : 'sin caché');
      } catch (e) { return 'no disponible'; }
    }

    async function limpiarCache() {
      try {
        var keys = await caches.keys();
        await Promise.all(keys.map(function (k) { return caches.delete(k); }));
        // Resetear permisos para que se recarguen del Sheet
        AppState.userPerms = { prog: true, sync: true };
        AppState.isAdmin = false;
        localStorage.removeItem('fcm_token');
        AppState.fcmToken = null;
        showToast('✓ Caché y permisos reseteados — recarga la app');
        var el = document.getElementById('sw-version-txt');
        if (el) el.textContent = 'Caché limpiada — recarga';
      } catch (e) { handleError('App', e); }
    }


    // ════════════════════════════════════════════════
    // PRE-PROCESADOR: lee el formato WhatsApp directo
    // sin depender de Gemini para parsear
    // ════════════════════════════════════════════════

    function limpiarLinea(line) {
      // Quitar emojis, asteriscos, caracteres especiales
      return line.replace(/[\u{1F000}-\u{1FFFF}|\u{2600}-\u{27FF}|\u{2700}-\u{27BF}]/gu, '')
        .replace(/[\uD800-\uDFFF]/g, '')  // surrogates
        .replace(/\*/g, '')
        .replace(/🚫/g, '')
        .replace(/👮[^\s]*/g, '')
        .replace(/👨[^\s]*/g, '')
        .replace(/👩[^\s]*/g, '')
        .replace(/\u200d/g, '')  // zero-width joiner
        .replace(/[\u{FE00}-\u{FE0F}]/gu, '')  // variation selectors
        .trim();
    }

    function esParadero(rawLine) {
      return rawLine.indexOf('🚏') >= 0
        || rawLine.replace(/\*/g, '').trim().match(/^(P\.|NAZARENAS|EMANCIPACION|CUADRA|CDRA DEL MEDIO|GARCILASO|SUPERUNDA|ICA |ILO |QUILCA|URUGUAY|ESPAÑA|BOLIVIA|HUANCAVELICA|MOQUEGUA|PIEROLA|TARMA|HUANCAYO|VILLAR)/i);
    }

    function esSeccionEspecial(line) {
      // Incluye typos comunes: COMPESATORIO, COMPENSATORIO, SUR-NORTE (divisor)
      return line.match(/^(APOYO|DESCANSO|COMPESA|COMPENSAT|VACACION|TARDANZA|FALTOS|EFECTIVOS|DISPONIBLE|REMOTO|SUPERVISOR ZONAL|SUR\s*[\-–]\s*NORTE|NORTE\s*[\-–]\s*SUR)/i);
    }

    function mapCat(seccion) {
      if (!seccion) return 'activo';
      var s = seccion.toUpperCase();
      if (s.indexOf('CONOS') >= 0) return 'apoyo_conos';
      if (s.indexOf('REJAS') >= 0) return 'apoyo_rejas';
      if (s.indexOf('SUR') >= 0) return 'apoyo_zona_sur';
      if (s.indexOf('NORTE') >= 0) return 'apoyo_zona_norte';
      if (s.indexOf('APOYO') >= 0) return 'apoyo_zona';
      if (s.indexOf('DESCANSO') >= 0) return 'descanso';
      if (s.indexOf('COMPENSAT') >= 0) return 'compensatorio';
      if (s.indexOf('VACACION') >= 0) return 'vacaciones';
      if (s.indexOf('SUPERVISOR') >= 0) return 'supervisor';
      return 'activo';
    }

    function preProcessarDist(texto) {
      var lines = texto.split('\n');
      var items = [];
      var currentPunto = '';
      var currentSentido = '';
      var pendingNombre = null;
      var pendingCat = 'activo';
      var seccion = '';

      function flushPending(funcion) {
        if (!pendingNombre) return;
        var fn = (funcion || 'Tranquera').replace(/[()]/g, '').replace(/\d\s*[°o]\s*/g, '').trim();
        var cat = pendingCat;
        if (fn.match(/ruteo/i)) { fn = 'Ruteo'; }
        else if (fn.match(/supervisor/i)) { fn = 'Supervisor'; cat = 'supervisor'; }
        else if (fn.match(/apoyo/i)) { fn = 'Apoyo'; cat = 'apoyo_zona'; }
        else { fn = fn.replace(/1[°o]?\s*/, '1').replace(/2[°o]?\s*/, '2').replace(/tranquera/i, 'Tranquera'); }
        items.push({
          nombre: quitaTildes(pendingNombre.replace(/^\d+\.\s*/, '')).trim(),
          nombre_clave: makeNameKey(quitaTildes(pendingNombre.replace(/^\d+\.\s*/, '')).trim()),
          punto: currentPunto,
          sentido: currentSentido,
          funcion: fn || 'Tranquera',
          categoria: cat,
          qap_estado: null, qap_hora_ini: null, qap_hora_fin: null, qap_orden: null
        });
        pendingNombre = null;
      }

      for (var i = 0; i < lines.length; i++) {
        var rawLine = lines[i];
        var line = limpiarLinea(rawLine).trim();
        if (!line) continue;

        // Estadísticas al final — parar
        if (line.match(/^(FALTOS|TARDANZA|EFECTIVOS|DISPONIBLE)\s*:/i)) { flushPending(); break; }

        // Sección especial
        if (esSeccionEspecial(line)) {
          flushPending();
          seccion = line.replace(/[*:]/g, '').trim().toUpperCase();
          currentPunto = '';
          continue;
        }

        // Paradero
        if (esParadero(rawLine) || (line.match(/N\/S|S\/N/) && !line.match(/COV/i) && line.length < 80)) {
          flushPending();
          var puntoClean = line.replace(/\d+\s*$/, '').trim();
          currentSentido = '';
          if (puntoClean.match(/\bN\/S\b/)) currentSentido = 'N/S';
          else if (puntoClean.match(/\bS\/N\b/)) currentSentido = 'S/N';
          else if (puntoClean.match(/\bSN\b/i)) currentSentido = 'S/N';
          var rawPuntoText = quitaTildes(puntoClean.replace(/N\/S|S\/N|SN\b/gi, '').trim()).toUpperCase();
          var matched = fuzzyMatchPunto(rawPuntoText, currentSentido);
          if (matched) {
            currentPunto = matched.punto;
            if (matched.sentido) currentSentido = matched.sentido;
          } else {
            currentPunto = rawPuntoText;
          }
          seccion = '';
          continue;
        }

        // Línea con COV:
        if (line.match(/\bCOV\s*:/i)) {
          flushPending();
          var nombre = line.replace(/^\d+\.\s*/, '').replace(/\bCOV\s*:/i, '').replace(/^\.+\s*/, '').trim();
          // Puede tener función en la misma línea: "Amau Herrera (Tranquera)"
          var parenMatch = nombre.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
          if (parenMatch && parenMatch[2].match(/tranquera|ruteo|apoyo|supervisor/i)) {
            pendingNombre = parenMatch[1].trim();
            pendingCat = mapCat(seccion);
            flushPending(parenMatch[2]);
          } else if (nombre && !nombre.match(/^\s*$/)) {
            pendingNombre = nombre;
            pendingCat = mapCat(seccion);
          }
          continue;
        }

        // Línea de función: "(Tranquera)", "(1° Tranquera)", etc.
        if (line.match(/^\(?\s*\d?\s*[°o]?\s*(tranquera|ruteo|apoyo|supervisor)/i)) {
          flushPending(line);
          continue;
        }

        // Apoyo/Descanso: nombre sin prefijo COV
        if (seccion && !line.match(/:/)) {
          var nom2 = line.replace(/^\d+\.\s*-?\s*/, '').trim();
          // Issue #2 FIX: Rechazar palabras que no son nombres de personas
          // - Mínimo 2 palabras (nombre y apellido)
          // - Rechazar palabras clave tipo FALTO, FALTA, TARDANZA, etc.
          var PALABRAS_INVALIDAS = /^(FALTO|FALTA|FALTOS|TARDANZA|TARDANZAS|EFECTIVOS|DISPONIBLE|DESCANSO|COMPENSAT|VACACION|APOYO|SUPERVISOR|REMOTO|SIN\s+PROG)$/i;
          var tieneNombreValido = nom2.length > 4
            && /^[A-Za-záéíóúñÁÉÍÓÚÑ]/.test(nom2)
            && !PALABRAS_INVALIDAS.test(nom2.trim())
            && nom2.trim().split(/\s+/).length >= 2; // al menos 2 palabras = nombre + apellido
          if (tieneNombreValido) {
            flushPending();
            items.push({
              nombre: quitaTildes(nom2),
              nombre_clave: makeNameKey(quitaTildes(nom2)),
              punto: '',
              sentido: '',
              funcion: seccion.indexOf('APOYO') >= 0 ? 'Apoyo' : 'Descanso',
              categoria: mapCat(seccion),
              qap_estado: null, qap_hora_ini: null, qap_hora_fin: null, qap_orden: null
            });
          }
        }
      }
      flushPending();
      return items;
    }


    function iniSSHH(idx) {
      var data = getProgHoy();
      if (!data || !data.items || idx >= data.items.length) return;
      var item = data.items[idx];
      item.sshh_estado = 'sshh';
      item.sshh_hora = nowTime();
      saveProgHoy(data);
      renderProgContent();
      var apell = item.nombre.split(' ')[0];
      var msg = '🚽 Salida SS.HH.: ' + B(apell);
      document.getElementById('qs-title').textContent = 'SS.HH.';
      document.getElementById('qs-prev').textContent = msg;
      AppState.quickMsg = msg; window._baseQuickMsg = msg;
      var rr = document.getElementById('qs-relevo-row');
      if (rr) rr.style.display = 'none';
      document.getElementById('quick-overlay').classList.add('open');
    }

    function finSSHH(idx) {
      var data = getProgHoy();
      if (!data || !data.items || idx >= data.items.length) return;
      var item = data.items[idx];
      item.sshh_estado = 'retorno';
      item.sshh_hora_fin = nowTime();
      saveProgHoy(data);
      renderProgContent();
      var apell = item.nombre.split(' ')[0];
      var msg = '✓ Retorno SS.HH.: ' + B(apell);
      document.getElementById('qs-title').textContent = 'SS.HH.';
      document.getElementById('qs-prev').textContent = msg;
      AppState.quickMsg = msg; window._baseQuickMsg = msg;
      var rr = document.getElementById('qs-relevo-row');
      if (rr) rr.style.display = 'none';
      document.getElementById('quick-overlay').classList.add('open');
    }

    // Asignar punto y sentido a personal en "otros"
    function toggleAsignar(idx) {
      var el = document.getElementById('asf-' + idx);
      if (el) el.classList.toggle('open');
    }
    function selSentOpt(idx, val) {
      document.querySelectorAll('#asf-' + idx + ' .sent-opt').forEach(function (b) { b.classList.remove('sel'); });
      var btn = document.querySelector('#asf-' + idx + ' .sent-opt[data-v="' + val + '"]');
      if (btn) btn.classList.add('sel');
    }
    function guardarAsignacion(idx) {
      var data = getProgHoy();
      if (!data || !data.items || idx >= data.items.length) return;
      var inp = document.getElementById('asp-' + idx);
      var sentSel = document.querySelector('#asf-' + idx + ' .sent-opt.sel');
      if (inp && inp.value.trim()) data.items[idx].punto = inp.value.trim().toUpperCase();
      if (sentSel) data.items[idx].sentido = sentSel.dataset.v;
      // Auto-detect sentido from punto
      var pt = data.items[idx].punto || '';
      if (!data.items[idx].sentido) {
        if (pt.indexOf('N/S') >= 0) data.items[idx].sentido = 'N/S';
        else if (pt.indexOf('S/N') >= 0) data.items[idx].sentido = 'S/N';
      }
      saveProgHoy(data);
      renderProgContent();
      showToast('✓ Punto asignado');
    }



    async function forzarRegistroFCM() {
      var el = document.getElementById('fcm-status');
      if (el) el.textContent = 'Solicitando permiso…';
      try {
        // Pedir permiso si no está dado
        if (Notification.permission !== 'granted') {
          var p = await Notification.requestPermission();
          if (p !== 'granted') {
            if (el) el.textContent = '⚠️ Permiso denegado';
            return;
          }
        }
        if (el) el.textContent = 'Obteniendo token…';
        // Inicializar Firebase si no está
        if (!AppState.fbMessaging) initFirebase();
        await new Promise(function (r) { setTimeout(r, 500); });
        if (!AppState.fbMessaging) {
          if (el) el.textContent = '⚠️ Firebase no disponible — verifica conexión';
          return;
        }
        var token = await AppState.fbMessaging.getToken({ vapidKey: CONFIG.VAPID_KEY });
        if (token) {
          AppState.fcmToken = token;
          localStorage.setItem('fcm_token', token);
          // Guardar en Sheet
          var res = await sheetPost({ action: 'update', did: getDeviceId(), fcmToken: token });
          if (res && res.ok) {
            if (el) el.textContent = '✓ Notificaciones registradas correctamente';
            showToast('✓ Push notifications activas');
          } else {
            if (el) el.textContent = '⚠️ Token obtenido pero error al guardar: ' + (res && res.error || '');
          }
        } else {
          if (el) el.textContent = '⚠️ No se pudo obtener token FCM';
        }
      } catch (e) {
        if (el) el.textContent = '⚠️ ' + e.message;
      }
    }

    function applyUserPerms() {
      // Panel Admin — columna K del Sheet (es_admin también da acceso)
      var ab = document.getElementById('admin-btn');
      if (ab) ab.style.display = (AppState.isAdmin || AppState.userPerms.admin) ? 'inline-flex' : 'none';
      // Cargar programación — columna I
      var pb = document.getElementById('prog-btn');
      if (pb) pb.style.display = (AppState.userPerms.prog || AppState.isAdmin) ? '' : 'none';
      // Cargar distribución — columna I del Sheet (perm_prog)
      var pcb = document.getElementById('prog-cargar-btn');
      if (pcb) pcb.style.display = (AppState.userPerms.prog || AppState.isAdmin) ? '' : 'none';
      // Generar reporte con voz — columna L del Sheet (perm_voz)
      var vb = document.getElementById('ia-main-btn-voice');
      if (vb) vb.style.display = (AppState.userPerms.voz || AppState.isAdmin) ? '' : 'none';
      // Solo el tab Admin es condicional — los demás siempre visibles
      var atn = document.getElementById('admin-nav-tab');
      if (atn) atn.style.display = AppState.isAdmin ? 'flex' : 'none';
    }



    if (typeof EventBus !== 'undefined') {
      EventBus.on('profileChanged', function(p) {
        if (AppState.sheetConnected && document.getElementById('s-prog').style.display !== 'none') {
          renderProgramacion();
        }
      });
    }
