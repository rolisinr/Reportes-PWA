    // ═══════════════════════════════════════════
    // NAVIGATION STACK
    // ═══════════════════════════════════════════
    const navStack = [];
    var _navId = 0;
    var _hashBusy = false;

    function showScreen(id) {
      try {
        document.querySelectorAll(".screen").forEach(function (s) {
          s.classList.remove("active");
          s.classList.remove("has-bottom-nav");
        });
        var el = document.getElementById(id);
        if (el) el.classList.add("active");
        window.scrollTo({ top: 0, behavior: "instant" });
        // Mostrar bottom nav solo en pantallas principales
        var nav = document.getElementById('bottom-nav');
        var isTop = ['s-cat', 's-prog', 's-history', 's-admin'].indexOf(id) >= 0;
        if (nav) nav.style.display = isTop ? 'flex' : 'none';
        var hdr = document.querySelector('header');
        if (hdr) hdr.style.display = isTop ? 'flex' : 'none';
        if (el && isTop) el.classList.add("has-bottom-nav");
      } catch (e) { }
    }

    function go(id) {
      navStack.push(id);
      _hashBusy = true;
      // Cada pantalla tiene un hash único — Chrome lo trata como navegación real
      history.pushState({ nid: ++_navId }, "", "#nav" + navStack.length);
      setTimeout(function () { _hashBusy = false; }, 50);
      showScreen(id);
    }

    function goBack() {
      if (navStack.length > 1) {
        navStack.pop();
        _hashBusy = true;
        history.replaceState({ nid: ++_navId }, "", "#nav" + navStack.length);
        setTimeout(function () { _hashBusy = false; }, 50);
        showScreen(navStack[navStack.length - 1]);
      }
    }

    // Entrada guard (#nav0) + entrada inicial (#nav1)
    // Chrome ve dos URLs distintas → nunca sale sin disparar popstate
    history.pushState({ guard: true }, "", "#nav0");
    history.pushState({ nid: 0 }, "", "#nav1");

    window.addEventListener("popstate", function (e) {
      if (_hashBusy) return;

      var hash = location.hash || "#nav1";
      var level = parseInt(hash.replace("#nav", "")) || 0;

      if (level < 1 || (e.state && e.state.guard)) {
        // Llegamos al guard — volver al nivel actual sin salir
        _hashBusy = true;
        history.pushState({ nid: ++_navId }, "", "#nav" + (navStack.length || 1));
        setTimeout(function () { _hashBusy = false; }, 50);
        showScreen(navStack[navStack.length - 1] || "s-cat");
        return;
      }

      // Retroceder hasta el nivel indicado por el hash
      while (navStack.length > level && navStack.length > 1) {
        navStack.pop();
      }
      showScreen(navStack[navStack.length - 1]);

      // Re-sincronizar hash si hay diferencia
      if (level !== navStack.length) {
        _hashBusy = true;
        history.pushState({ nid: ++_navId }, "", "#nav" + navStack.length);
        setTimeout(function () { _hashBusy = false; }, 50);
      }
    });

