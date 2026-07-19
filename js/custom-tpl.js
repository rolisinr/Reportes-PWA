    // =============================================
    // FASE 6 - ACCESO RÁPIDO
    // =============================================

    function getFavs() { return S.get('favs') || []; }
    function saveFavs(arr) { S.set('favs', arr); }

    function renderFavs() {
      var favs = getFavs();
      var grid = document.getElementById('fav-grid');
      if (!grid) return;
      var html2 = '';
      favs.forEach(function (f, i) {
        html2 += '<button class="fav-btn" onclick="useFav(' + i + ')">' +
          '<div class="fav-icon">' + f.icon + '</div>' +
          '<div><div class="fav-name">' + escapeHTML(f.name) + '</div><div class="fav-cat">' + escapeHTML(f.catName) + '</div></div>' +
          '</button>';
      });
      html2 += '<button class="fav-add" onclick="openFavPicker()">+ Añadir</button>';
      grid.innerHTML = html2;
    }

    function useFav(idx) {
      var fav = getFavs()[idx]; if (!fav) return;
      if (fav.catId === 'custom') useCustomTpl(fav.tplIdx);
      else if (fav.direct) goDirectForm(fav.catId, fav.tplId);
      else showForm(fav.catId, fav.tplId);
    }

    function openFavPicker() {
      var el = document.getElementById('fav-pick-list');
      var existing = getFavs().map(function (f) { return f.catId + '_' + f.tplId; });
      var catNames = { vias: 'Informe de Vías', obras: 'Obras en Vía', incidencia: 'Incidencias', demanda: 'Demanda' };
      var items = '';
      Object.keys(TPLS).forEach(function (cat) {
        TPLS[cat].forEach(function (t) {
          if (existing.indexOf(cat + '_' + t.id) < 0) {
            items += '<div class="fav-pick-item" onclick="addFav(\'' + cat + '\',\'' + t.id + '\',\'' +
              t.name.replace(/'/g, "\'") + '\',\'' + t.icon + '\',\'' +
              (catNames[cat] || cat) + '\')">' +
              '<div class="fav-pick-icon">' + t.icon + '</div>' +
              '<div><div class="fav-pick-name">' + t.name + '</div>' +
              '<div class="fav-pick-cat">' + (catNames[cat] || cat) + '</div></div></div>';
          }
        });
      });
      getCustomTpls().forEach(function (t, i) {
        items += '<div class="fav-pick-item" onclick="addFavCustom(' + i + ',\'' +
          t.name.replace(/'/g, "\'") + '\',' + '\'' +
          (t.icon || '📝') + '\')">' +
          '<div class="fav-pick-icon">' + (t.icon || '📝') + '</div>' +
          '<div><div class="fav-pick-name">' + t.name + '</div>' +
          '<div class="fav-pick-cat">Mis Plantillas</div></div></div>';
      });
      el.innerHTML = items || '<div style="color:var(--mut);text-align:center;padding:20px;font-size:13px">Todas las plantillas ya están agregadas</div>';
      document.getElementById('fav-picker-ov').classList.add('open');
    }

    function addFav(cat, tplId, name, icon, catName) {
      var favs = getFavs();
      favs.push({ catId: cat, tplId: tplId, name: name, icon: icon, catName: catName, direct: (cat === 'obras' || cat === 'demanda') });
      saveFavs(favs);
      document.getElementById('fav-picker-ov').classList.remove('open');
      renderFavs();
      showToast('⭐ Agregado al acceso rápido');
    }

    function addFavCustom(idx, name, icon) {
      var favs = getFavs();
      favs.push({ catId: 'custom', tplId: 'ct' + idx, tplIdx: idx, name: name, icon: icon || '📝', catName: 'Mis Plantillas' });
      saveFavs(favs);
      document.getElementById('fav-picker-ov').classList.remove('open');
      renderFavs();
      showToast('⭐ Agregado al acceso rápido');
    }


    function selCorredor(btn) {
      document.querySelectorAll('#corr-sel .turno-opt').forEach(function (b) { b.classList.remove('sel'); });
      btn.classList.add('sel');
    }

    function renderRutasChips(rutas) {
      var el = document.getElementById('rutas-wrap');
      if (!el) return;
      el.innerHTML = (rutas || []).map(function (r, i) {
        return '<span class="ruta-chip">' + escapeHTML(r) +
          '<button class="ruta-del" onclick="removeRuta(' + i + ')">×</button></span>';
      }).join('');
    }

    function addRuta() {
      var inp = document.getElementById('nueva-ruta');
      var val = (inp.value || '').trim().toUpperCase();
      if (!val) return;
      var cfg = getSettings2();
      var rutas = cfg.rutas || ['301', '303', '305', '336', '372'];
      if (rutas.indexOf(val) < 0) rutas.push(val);
      cfg.rutas = rutas; S.set('settings2', cfg);
      renderRutasChips(rutas); inp.value = '';
    }

    function removeRuta(idx) {
      var cfg = getSettings2();
      var rutas = cfg.rutas || ['301', '303', '305', '336', '372'];
      rutas.splice(idx, 1); cfg.rutas = rutas; S.set('settings2', cfg);
      renderRutasChips(rutas);
    }

    function updateCorredorBadge() {
      var c = getCorredor();
      var title = document.querySelector('.hdr-title');
      if (!title) return;
      var existing = title.querySelector('.corredor-badge');
      if (existing) existing.remove();
      if (c !== 'TGA') {
        var b = document.createElement('span');
        b.className = 'corredor-badge ' + c;
        b.textContent = c;
        title.appendChild(b);
      }
    }

    function deleteHistItem(id) {
      var arr = S.get('history') || [];
      arr = arr.filter(function (h) { return h.id !== id; });
      S.set('history', arr); updateHistCount(); renderHistory();
      showToast('Eliminado');
    }

    function toggleGemVis() {
      var inp = document.getElementById('gem-key');
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
    }