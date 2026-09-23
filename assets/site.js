/* ICHAR landing page behaviour. Plain JS, no framework. */
(function () {
  var mq = function (s) { return window.matchMedia ? window.matchMedia(s).matches : false; };
  var reduce = mq('(prefers-reduced-motion:reduce)');
  var coarse = mq('(pointer:coarse)');

  /* Navigation */
  var N = document.querySelector('[data-navroot]');
  if (N) {
    var q = function (s) { return N.querySelector(s); };
    var bar = q('[data-bar]'), nav = q('[data-nav]'), btn = q('[data-menu]');
    var logo = q('[data-logo]'), pill = q('[data-report-pill]');
    var bars = [q('[data-bar1]'), q('[data-bar2]'), q('[data-bar3]')];
    var links = nav ? [].slice.call(nav.querySelectorAll('a')) : [];
    links.forEach(function (a) {
      if (a.getAttribute('data-key') === 'home') {
        a.setAttribute('aria-current', 'page');
        a.style.opacity = '.42';
        a.style.pointerEvents = 'none';
      }
    });
    if (pill) pill.style.display = 'inline-flex';
    var open = false, ticking = false;
    var paint = function () {
      ticking = false;
      var solid = !open && window.pageYOffset > 110;
      if (logo) logo.style.filter = open ? 'drop-shadow(0 2px 8px #05065d33)' : 'drop-shadow(0 2px 8px #00000066)';
      bar.style.background = solid ? 'rgba(10,2,5,.92)' : 'transparent';
      bar.style.backdropFilter = bar.style.webkitBackdropFilter = solid ? 'blur(10px)' : 'none';
      bar.style.boxShadow = solid ? '0 1px 0 rgba(255,255,255,.16)' : 'none';
      if (pill) pill.style.background = open ? '#05065d' : '#d90a05';
    };
    var onScroll = function () { if (!ticking) { ticking = true; requestAnimationFrame(paint); } };
    var setNav = function (v) {
      open = v;
      nav.style.transform = v ? 'translateY(0)' : 'translateY(-102%)';
      nav.style.visibility = v ? 'visible' : 'hidden';
      btn.setAttribute('aria-expanded', String(v));
      btn.setAttribute('aria-label', v ? 'Close navigation' : 'Open navigation');
      btn.style.background = v ? '#05065d' : '#fff';
      btn.style.color = v ? '#fff' : '#05065d';
      if (bars[0]) bars[0].style.transform = v ? 'translateY(5.6px) rotate(45deg)' : 'none';
      if (bars[1]) bars[1].style.opacity = v ? '0' : '1';
      if (bars[2]) bars[2].style.transform = v ? 'translateY(-5.6px) rotate(-45deg)' : 'none';
      document.body.style.overflow = v ? 'hidden' : '';
      links.forEach(function (a, i) {
        a.tabIndex = v ? 0 : -1;
        if (reduce) return;
        a.style.transition = 'transform .55s cubic-bezier(.16,1,.3,1),opacity .55s';
        a.style.transitionDelay = (v ? i * 55 : 0) + 'ms';
        a.style.transform = v ? 'none' : 'translateX(-34px)';
        if (a.getAttribute('aria-current') !== 'page') a.style.opacity = v ? '1' : '0';
      });
      if (v) nav.scrollTop = 0;
      paint();
    };
    setNav(false);
    btn.addEventListener('click', function () { setNav(!open); });
    links.forEach(function (a) { a.addEventListener('click', function () { setNav(false); }); });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) { setNav(false); btn.focus(); } });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }

  var R = document.querySelector('[data-ich-root]');
  if (!R) return;
  var qa = function (s) { return [].slice.call(R.querySelectorAll(s)); };

  /* Custom cursor (desktop only) */
  var cur = R.querySelector('[data-cursor]');
  if (cur) {
    if (coarse) cur.remove();
    else {
      window.addEventListener('pointermove', function (e) {
        cur.style.opacity = '1';
        cur.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px) translate(-50%,-50%)';
      }, { passive: true });
      qa('a,button').forEach(function (el) {
        el.addEventListener('pointerenter', function () { cur.style.width = cur.style.height = '30px'; });
        el.addEventListener('pointerleave', function () { cur.style.width = cur.style.height = '12px'; });
      });
    }
  }

  /* Scroll reveal */
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.opacity = '1';
        e.target.style.transform = 'none';
        io.unobserve(e.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -5% 0px' });
    qa('[data-reveal]').forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return;
      el.style.transition = 'opacity .9s cubic-bezier(.16,1,.3,1),transform .9s cubic-bezier(.16,1,.3,1)';
      el.style.opacity = '0';
      el.style.transform = 'translateY(46px)';
      io.observe(el);
    });
  }

  /* Drag-to-scroll divisions track */
  var track = R.querySelector('[data-track]');
  if (track) {
    var down = false, sx = 0, sl = 0, moved = 0;
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      down = true; moved = 0; sx = e.clientX; sl = track.scrollLeft;
      track.style.cursor = 'grabbing';
    });
    window.addEventListener('pointermove', function (e) {
      if (!down) return;
      var d = e.clientX - sx;
      moved = Math.max(moved, Math.abs(d));
      track.scrollLeft = sl - d;
    });
    var up = function () { if (!down) return; down = false; track.style.cursor = 'grab'; };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    track.addEventListener('click', function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
  }

  /* Division carousel */
  var cases = qa('[data-case]'), counter = R.querySelector('[data-count]');
  if (cases.length) {
    var idx = 0, timer = null;
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    var show = function (n) {
      idx = (n + cases.length) % cases.length;
      cases.forEach(function (c, i) {
        c.style.display = i === idx ? 'block' : 'none';
        if (i === idx && !reduce) { c.style.animation = 'none'; void c.offsetWidth; c.style.animation = 'ichSlide .6s cubic-bezier(.16,1,.3,1)'; }
      });
      if (counter) counter.textContent = pad(idx + 1) + ' / ' + pad(cases.length);
    };
    var start = function () { clearInterval(timer); if (!reduce && !document.hidden) timer = setInterval(function () { show(idx + 1); }, 7000); };
    var stop = function () { clearInterval(timer); };
    var prev = R.querySelector('[data-prev]'), next = R.querySelector('[data-next]'), wrap = R.querySelector('[data-carousel]');
    if (next) next.addEventListener('click', function () { show(idx + 1); start(); });
    if (prev) prev.addEventListener('click', function () { show(idx - 1); start(); });
    if (wrap) { wrap.addEventListener('pointerenter', stop); wrap.addEventListener('pointerleave', start); wrap.addEventListener('focusin', stop); }
    document.addEventListener('visibilitychange', function () { document.hidden ? stop() : start(); });
    start();
  }
})();
