/* DemoCRM — лендинг. Свой код: GSAP 3.12.5 + ScrollTrigger с cdnjs, без аналитики. */
(function () {
  'use strict';

  var doc = document;
  var root = doc.documentElement;
  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var hasGsap = !!(window.gsap && window.ScrollTrigger);
  var motion = hasGsap && !reduce;

  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }

  if (hasGsap) { gsap.registerPlugin(ScrollTrigger); ScrollTrigger.config({ ignoreMobileResize: true }); }

  /* ---------- картинки, которых может не быть ---------- */
  $$('img.shape, .sv img').forEach(function (img) {
    function hide() { img.style.visibility = 'hidden'; }
    if (img.complete && img.naturalWidth === 0) hide();
    img.addEventListener('error', hide);
  });

  /* ---------- видео-петли ---------- */
  (function () {
    var vids = $$('video');
    var foot = $('.foot__logo');
    if (reduce) {
      vids.forEach(function (v) { v.parentNode.removeChild(v); });
      if (foot) foot.classList.add('fb');
      return;
    }
    vids.forEach(function (v) {
      var sv = v.closest('.sv');
      var box = v.closest('.sv, .foot, .hero') || v;
      v.muted = true;
      v.addEventListener('playing', function () { if (sv) sv.classList.add('live'); });
      var src = v.querySelector('source');
      if (src) src.addEventListener('error', function () {
        if (v.classList.contains('foot__v') && foot) foot.classList.add('fb');
        if (v.classList.contains('hero__v')) v.style.display = 'none';
        if (sv) sv.classList.remove('live');
      });
      var p = v.play(); if (p && p.catch) p.catch(function () {});
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) { var q = v.play(); if (q && q.catch) q.catch(function () {}); }
            else v.pause();
          });
        }, { rootMargin: '300px' }).observe(box);
      }
    });
  })();

  /* ---------- перекатывание букв ---------- */
  function splitRoll(el) {
    var text = el.textContent.trim();
    var holder = doc.createElement('span');
    holder.className = 'roll__t';
    var idx = 0;
    text.split(' ').forEach(function (word, wi, arr) {
      var w = doc.createElement('span');
      w.className = 'rw';
      w.setAttribute('aria-hidden', 'true');
      Array.from(word).forEach(function (c) {
        var ch = doc.createElement('span');
        ch.className = 'ch';
        ch.style.setProperty('--i', idx++);
        var a = doc.createElement('span'); a.textContent = c;
        var b = doc.createElement('span'); b.textContent = c;
        ch.append(a, b);
        w.append(ch);
      });
      holder.append(w);
      if (wi < arr.length - 1) holder.append(' ');
    });
    el.setAttribute('aria-label', text);
    el.textContent = '';
    el.append(holder);
  }
  $$('.roll').forEach(splitRoll);

  /* ---------- разбиение заголовков на слова ---------- */
  function splitWords(el, mask) {
    var out = [];
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var frag = doc.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.append(doc.createTextNode(' ')); return; }
            var w = doc.createElement('span');
            w.className = 'sw' + (mask === false ? ' sw--plain' : '');
            var i = doc.createElement('span');
            i.className = 'sw__i';
            i.textContent = p;
            w.append(i);
            frag.append(w);
            out.push(i);
          });
          c.replaceWith(frag);
        } else if (c.nodeType === 1 && c.tagName !== 'IMG' && c.tagName !== 'BR') {
          walk(c);
        }
      });
    })(el);
    return out;
  }

  /* ---------- шапка ---------- */
  var hdr = $('.hdr');
  var burger = $('.hdr__burger');
  function setMenu(open) {
    hdr.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }
  burger.addEventListener('click', function () { setMenu(!hdr.classList.contains('is-open')); });
  $$('.mnav a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  var lastY = window.pageYOffset;
  window.addEventListener('scroll', function () {
    var y = window.pageYOffset;
    hdr.classList.toggle('is-stuck', y > 60);
    if (hdr.classList.contains('is-open')) { lastY = y; return; }
    if (y > lastY + 6 && y > 140) hdr.classList.add('is-hidden');
    else if (y < lastY - 6) hdr.classList.remove('is-hidden');
    lastY = y;
  }, { passive: true });

  /* ---------- бегущая строка ---------- */
  (function () {
    var track = $('.marquee__track');
    if (!track || reduce) return;
    $$('li', track).forEach(function (li) {
      var c = li.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.className = 'is-clone';
      track.append(c);
    });
  })();

  /* ---------- барабаны ---------- */
  var drums = $$('.drum').map(function (el) {
    var to = el.getAttribute('data-to');
    var from = String(el.getAttribute('data-from'));
    while (from.length < to.length) from = '0' + from;
    el.textContent = '';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', to);
    var cols = Array.from(to).map(function (d, i) {
      var col = doc.createElement('span');
      col.className = 'dr-col';
      col.setAttribute('aria-hidden', 'true');
      var inn = doc.createElement('span');
      inn.className = 'dr-in';
      for (var k = 0; k < 20; k++) { var s = doc.createElement('span'); s.textContent = String(k % 10); inn.append(s); }
      col.append(inn);
      el.append(col);
      return { col: col, inn: inn, s: parseInt(from.charAt(i), 10), e: 10 + parseInt(d, 10) };
    });
    return { el: el, cols: cols };
  });
  /* ширина колонки = ширина её текущей цифры, чтобы число не «разъезжалось» */
  function digitW(el, d) {
    var m = doc.createElement('span');
    m.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
    m.textContent = String(d);
    el.append(m);
    var w = m.getBoundingClientRect().width;
    m.remove();
    return w;
  }
  function fitDrums() {
    drums.forEach(function (d) {
      d.cols.forEach(function (c) {
        c.ws = digitW(d.el, c.s);
        c.we = digitW(d.el, c.e % 10);
        if (!c.played) c.col.style.width = (motion ? c.ws : c.we) + 'px';
      });
    });
  }
  fitDrums();
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(fitDrums);
  function drumPos(idx) { return -idx / 20 * 100; }
  drums.forEach(function (d) {
    d.cols.forEach(function (c) {
      if (hasGsap) gsap.set(c.inn, { yPercent: drumPos(motion ? c.s : c.e) });
      else c.inn.style.transform = 'translateY(' + drumPos(c.e) + '%)';
    });
  });

  /* ---------- карусель ---------- */
  (function () {
    var car = $('.car');
    if (!car) return;
    var card = $('.sc', car);
    $$('.rb').forEach(function (b) {
      b.addEventListener('click', function () {
        var dir = parseInt(b.getAttribute('data-dir'), 10);
        car.scrollBy({ left: dir * (card.offsetWidth + 24), behavior: 'smooth' });
      });
    });
    car.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { car.scrollBy({ left: card.offsetWidth + 24, behavior: 'smooth' }); }
      if (e.key === 'ArrowLeft') { car.scrollBy({ left: -(card.offsetWidth + 24), behavior: 'smooth' }); }
    });
    var down = false, sx = 0, sl = 0;
    car.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      down = true; sx = e.clientX; sl = car.scrollLeft;
      car.classList.add('is-drag');
      try { car.setPointerCapture(e.pointerId); } catch (err) {}
    });
    car.addEventListener('pointermove', function (e) {
      if (!down) return;
      car.scrollLeft = sl - (e.clientX - sx);
    });
    function up() { if (!down) return; down = false; car.classList.remove('is-drag'); }
    car.addEventListener('pointerup', up);
    car.addEventListener('pointercancel', up);
    car.addEventListener('lostpointercapture', up);
  })();

  /* ---------- иконки-матрицы ---------- */
  if (!reduce) {
    var chars = '⠁⠃⠉⠙⠑⠋⠛⠓';
    var cells = $$('.mx i');
    setInterval(function () {
      cells.forEach(function (c) { c.textContent = chars.charAt(Math.floor(Math.random() * chars.length)); });
    }, 300);
  }

  /* ---------- аккордеон ---------- */
  var accItems = $$('.acc__item');
  var accCur = 0;
  var accLock = 0;
  function accOpen(i) {
    accCur = i;
    accItems.forEach(function (it, k) {
      var on = k === i;
      it.classList.toggle('is-open', on);
      $('.acc__head', it).setAttribute('aria-expanded', on ? 'true' : 'false');
    });
  }
  accItems.forEach(function (it, k) {
    $('.acc__head', it).addEventListener('click', function () {
      accLock = Date.now() + 1500;
      accOpen(k);
    });
  });

  /* ---------- cookie ---------- */
  (function () {
    var box = $('#cookie');
    var saved = null;
    try { saved = localStorage.getItem('democrm-cookie'); } catch (e) {}
    function show() {
      box.hidden = false;
      root.classList.add('cookie-open');
      requestAnimationFrame(function () { requestAnimationFrame(function () { box.classList.add('is-in'); }); });
    }
    if (!saved) setTimeout(show, reduce ? 0 : 1500);
    $$('[data-cookie]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        try { localStorage.setItem('democrm-cookie', b.getAttribute('data-cookie')); } catch (e) {}
        box.classList.remove('is-in');
        box.classList.add('is-out');
        root.classList.remove('cookie-open');
        setTimeout(function () { box.hidden = true; }, 700);
      });
    });
  })();

  if (!motion) {
    window.addEventListener('load', function () {});
    return;
  }

  /* =====================================================
     Анимации (только если есть GSAP и не просили без движения)
     ===================================================== */

  /* первый экран */
  (function () {
    var words = splitWords($('.hero__h'));
    gsap.set(words, { yPercent: 118 });
    gsap.to(words, { yPercent: 0, duration: 1.1, ease: 'power4.out', stagger: 0.08, delay: 0.15 });
    gsap.from(['.hero__p', '.hero__btns'], { y: 30, opacity: 0, duration: 0.9, ease: 'power3.out', delay: 0.75, stagger: 0.12 });
    gsap.fromTo('.hero__bgi', { scale: 1.12 }, { scale: 1, duration: 2.5, ease: 'power2.out' });
    gsap.from('.promo', { xPercent: -130, opacity: 0, duration: 1, delay: 1, ease: 'power3.out' });
    gsap.to('.hero__bg', { yPercent: 6, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  })();

  /* заголовки: слова выезжают из маски */
  $$('[data-reveal]').forEach(function (el) {
    var words = splitWords(el);
    gsap.set(words, { yPercent: 118 });
    var pill = $('.shape--pill', el);
    if (pill) gsap.set(pill, { opacity: 0, scale: 0.6 });
    ScrollTrigger.create({
      trigger: el, start: 'top 88%', once: true,
      onEnter: function () {
        gsap.to(words, { yPercent: 0, duration: 0.9, ease: 'power4.out', stagger: 0.06 });
        if (pill) gsap.to(pill, { opacity: 1, scale: 1, duration: 0.9, delay: 0.3, ease: 'back.out(1.6)' });
      }
    });
  });

  /* боль: слова заливаются при скролле, клевер поворачивается */
  (function () {
    var h = $('[data-fill]');
    var words = splitWords(h, false);
    gsap.fromTo(words, { color: '#D0D0CC' }, {
      color: '#212121', ease: 'none', stagger: 0.15,
      scrollTrigger: { trigger: h, start: 'top 82%', end: 'bottom 48%', scrub: true }
    });
    gsap.fromTo('.shape--clover', { rotation: -30 }, {
      rotation: 70, ease: 'none',
      scrollTrigger: { trigger: '.pain', start: 'top bottom', end: 'bottom top', scrub: true }
    });
  })();

  /* барабаны и графики */
  drums.forEach(function (d) {
    var card = d.el.closest('.stat');
    var line = $('.spark__l', card);
    var area = $('.spark__a', card);
    if (line) gsap.set(line, { strokeDasharray: 1, strokeDashoffset: 1 });
    if (area) gsap.set(area, { opacity: 0 });
    ScrollTrigger.create({
      trigger: card, start: 'top 85%', once: true,
      onEnter: function () {
        d.cols.forEach(function (c, i) {
          c.played = true;
          gsap.fromTo(c.inn, { yPercent: drumPos(c.s) }, { yPercent: drumPos(c.e), duration: 1.6, delay: i * 0.18, ease: 'power3.inOut' });
          gsap.fromTo(c.col, { width: c.ws }, { width: c.we, duration: 1.6, delay: i * 0.18, ease: 'power3.inOut' });
        });
        if (line) gsap.to(line, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.out' });
        if (area) gsap.to(area, { opacity: 1, duration: 1.2, delay: 0.6 });
      }
    });
  });

  var mm = gsap.matchMedia();

  /* жёлтая панель: закреплённая лента */
  mm.add('(min-width: 901px)', function () {
    var wrap = $('#lenta');
    var panel = $('.lenta', wrap);
    wrap.classList.add('lenta-wrap--pin');
    panel.classList.add('lenta--pin');
    var cards = $$('.lc', panel);
    gsap.set(cards.slice(1), { yPercent: 150, opacity: 0 });
    var age = [{ y: 0, s: 1, o: 1 }, { y: -64, s: 0.95, o: 0.6 }, { y: -118, s: 0.9, o: 0.3 }, { y: -160, s: 0.85, o: 0 }];
    var tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: { trigger: wrap, start: 'top top', end: '+=250%', pin: true, scrub: 0.6, invalidateOnRefresh: true }
    });
    for (var i = 1; i < cards.length; i++) {
      var t = i - 1;
      tl.to(cards[i], { yPercent: 0, opacity: 1, duration: 1 }, t);
      for (var j = 0; j < i; j++) {
        var a = age[Math.min(i - j, 3)];
        tl.to(cards[j], { y: a.y, scale: a.s, opacity: a.o, duration: 1 }, t);
      }
    }
    tl.to('.shape--flower', { rotation: 200, duration: cards.length - 1 }, 0);
    return function () {
      wrap.classList.remove('lenta-wrap--pin');
      panel.classList.remove('lenta--pin');
    };
  });
  mm.add('(max-width: 900px)', function () {
    var cards = $$('.lc');
    gsap.set(cards, { y: 40, opacity: 0 });
    ScrollTrigger.batch(cards, {
      start: 'top 94%', once: true,
      onEnter: function (b) { gsap.to(b, { y: 0, opacity: 1, duration: 0.7, stagger: 0.12, ease: 'power3.out' }); }
    });
    gsap.fromTo('.shape--flower', { rotation: 0 }, {
      rotation: 120, ease: 'none',
      scrollTrigger: { trigger: '.lenta', start: 'top bottom', end: 'bottom top', scrub: true }
    });
  });

  /* облако */
  mm.add('(min-width: 701px)', function () {
    gsap.fromTo('.shape--cloud', { scale: 0.8, rotation: -4 }, {
      scale: 1.05, rotation: 9, ease: 'none',
      scrollTrigger: { trigger: '.cloud__stage', start: 'top 85%', end: 'bottom 45%', scrub: 0.8 }
    });
    $$('.cw').forEach(function (w) {
      var left = w.classList.contains('cw--l');
      gsap.fromTo(w, { xPercent: left ? -130 : 130 }, {
        xPercent: 0, ease: 'none',
        scrollTrigger: { trigger: w, start: 'top 95%', end: 'top 50%', scrub: true }
      });
    });
  });
  mm.add('(max-width: 700px)', function () {
    gsap.fromTo('.shape--cloud', { scale: 0.8, rotation: -4 }, {
      scale: 1.05, rotation: 9, ease: 'none',
      scrollTrigger: { trigger: '.cloud__stage', start: 'top 85%', end: 'bottom 45%', scrub: 0.8 }
    });
    gsap.fromTo('.cw', { y: 50, opacity: 0 }, {
      y: 0, opacity: 1, duration: 0.8, stagger: 0.12, ease: 'power3.out',
      scrollTrigger: { trigger: '.cloud__stage', start: 'top 60%', once: true }
    });
  });

  /* салатовая панель: карточки въезжают снизу */
  (function () {
    var steps = $$('.step');
    gsap.set(steps, { y: 70, opacity: 0 });
    ScrollTrigger.batch(steps, {
      start: 'top 92%', once: true,
      onEnter: function (b) { gsap.to(b, { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: 'power3.out' }); }
    });
  })();

  /* аккордеон по ходу скролла */
  mm.add('(min-width: 901px)', function () {
    root.classList.add('komu-scroll');
    var st = ScrollTrigger.create({
      trigger: '.komu', start: 'top top', end: 'bottom bottom',
      onUpdate: function (self) {
        if (Date.now() < accLock) return;
        var p = self.progress;
        var i = p < 1 / 3 ? 0 : (p < 2 / 3 ? 1 : 2);
        if (i !== accCur) accOpen(i);
      }
    });
    return function () { root.classList.remove('komu-scroll'); st.kill(); };
  });

  /* призыв: по строкам */
  (function () {
    var lines = $$('.cta__h .ln > span');
    gsap.set(lines, { yPercent: 115 });
    ScrollTrigger.create({
      trigger: '.cta__h', start: 'top 80%', once: true,
      onEnter: function () { gsap.to(lines, { yPercent: 0, duration: 1, ease: 'power4.out', stagger: 0.14 }); }
    });
  })();

  /* подвал: вылет надувного логотипа */
  (function () {
    var logo = $('.foot__logo');
    gsap.set(logo, { scale: 0, transformOrigin: '50% 55%' });
    ScrollTrigger.create({
      trigger: '.foot', start: 'top 75%', once: true,
      onEnter: function () {
        gsap.to(logo, {
          scale: 1, duration: 1.7, ease: 'elastic.out(1, 0.55)',
          onComplete: function () {
            gsap.timeline()
              .to(logo, { y: -8, rotation: -1, duration: 1.5, ease: 'sine.inOut' })
              .to(logo, { y: 8, rotation: 1, duration: 3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
          }
        });
      }
    });
  })();

  /* пересчёт после загрузки шрифтов и картинок */
  function refresh() { ScrollTrigger.refresh(); }
  if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(refresh);
  window.addEventListener('load', refresh);
})();
