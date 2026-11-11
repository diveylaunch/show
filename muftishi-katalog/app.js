/* Каталог-магазин для Telegram: одна страница, без сборки. Данные берутся из window.CATALOG (data.js).
   Заказ никуда не отправляется: на последнем экране показывается только текст сообщения продавцу. */
(function () {
  'use strict';

  var D = window.CATALOG || {};
  D.brand = D.brand || { name: 'Каталог', tagline: '' };
  D.theme = D.theme || {};
  D.categories = D.categories || [];
  D.products = D.products || [];
  D.delivery = D.delivery || [];
  D.payment = D.payment || [];
  var CUR = D.currency || '₽';

  /* ---------- Данные ---------- */
  var byId = {};
  D.products.forEach(function (p) {
    p._v = (p.variants || []).map(function (v) { return typeof v === 'string' ? { name: v } : v; });
    p.photos = (p.photos || []).filter(Boolean);
    p.availability = p.availability || 'stock';
    byId[p.id] = p;
  });

  var state = {
    cat: 'all',
    done: false,   // открыт экран «Заказ принят»
    cart: [],   // { pid, variant, qty }
    form: blankForm()
  };
  var nav = [];  // стек экранов поверх главной: функции, которые собирают экран

  function blankForm() {
    return { name: '', contact: '', delivery: '', address: '', comment: '', payment: '', consent: false };
  }

  /* ---------- Мелкие помощники ---------- */
  function $(id) { return document.getElementById(id); }

  function h(tag, props) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { kid.forEach(function (k) { add(el, k); }); return; }
    el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
  }

  var ICONS = {
    bag: '<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    image: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5"/>'
  };
  function icon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'ico');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];   // строки только из словаря выше, данные магазина сюда не попадают
    return s;
  }

  function money(n) {
    var s = String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return s + ' ' + CUR;
  }
  function plural(n, f) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    if (b === 1) return f[0];
    return f[2];
  }
  function daysText(n) { return n + ' ' + plural(n, ['день', 'дня', 'дней']); }

  var toastTimer;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }

  /* ---------- Тема и Telegram ---------- */
  function hexToRgb(x) {
    x = String(x || '').trim().replace('#', '');
    if (x.length === 3) x = x.replace(/(.)/g, '$1$1');
    if (!/^[0-9a-f]{6}$/i.test(x)) return null;
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
  }
  function mix(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    if (!A || !B) return a;
    var c = A.map(function (v, i) { return Math.round(v + (B[i] - v) * t); });
    return '#' + c.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  function applyTheme(override) {
    var t = Object.assign({}, D.theme, override || {});
    var root = document.documentElement.style;
    var map = { bg: '--bg', surface: '--surface', text: '--text', muted: '--muted', line: '--line',
      accent: '--accent', accentText: '--on-accent', accentSoft: '--accent-soft', danger: '--danger',
      fontBody: '--font', fontHead: '--font-head', imageRatio: '--ratio' };
    Object.keys(map).forEach(function (k) { if (t[k]) root.setProperty(map[k], t[k]); });
    if (t.radius != null) root.setProperty('--radius', typeof t.radius === 'number' ? t.radius + 'px' : t.radius);
    if (t.accent) root.setProperty('--accent-hover', t.accentHover || mix(t.accent, '#000000', 0.16));
    if (t.accent && !t.accentSoft) root.setProperty('--accent-soft', mix(t.accent, t.bg || '#ffffff', 0.78));
    if (t.fontBody && !t.fontHead) root.setProperty('--font-head', t.fontBody);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta && t.bg) meta.setAttribute('content', t.bg);
  }

  function loadFonts() {
    if (!D.theme.fontsUrl) return;
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = D.theme.fontsUrl;
    document.head.appendChild(l);
  }

  var tgDone = false;
  function initTelegram() {
    var tg = window.Telegram && window.Telegram.WebApp;
    if (!tg || tgDone) return;
    tgDone = true;
    try { tg.ready(); } catch (e) {}
    try { tg.expand(); } catch (e) {}
    var p = tg.themeParams || {};
    var rs = document.documentElement.style;
    // Цвета Telegram доступны как --tg-*; сами цвета магазина они меняют только при theme.followTelegram = true
    ['bg_color', 'text_color', 'hint_color', 'button_color', 'button_text_color', 'secondary_bg_color'].forEach(function (k) {
      if (p[k]) rs.setProperty('--tg-' + k.replace(/_/g, '-'), p[k]);
    });
    if (D.theme.followTelegram) {
      applyTheme({ bg: p.bg_color, surface: p.secondary_bg_color, text: p.text_color, muted: p.hint_color,
        accent: p.button_color, accentText: p.button_text_color, accentSoft: p.secondary_bg_color, accentHover: null });
    }
    try { if (tg.setHeaderColor) tg.setHeaderColor(D.theme.bg || 'bg_color'); } catch (e) {}
    try { if (tg.setBackgroundColor) tg.setBackgroundColor(D.theme.bg || '#ffffff'); } catch (e) {}
  }

  /* ---------- Наличие ---------- */
  function findV(p, name) {
    for (var i = 0; i < p._v.length; i++) if (p._v[i].name === name) return p._v[i];
    return null;
  }
  function ownStock(v) { return v && typeof v.stock === 'number' ? v.stock : null; }

  // Состояние товара для выбранного варианта: { kind: stock|preorder|out, cap, n, days }
  function info(p, vname) {
    if (p.availability === 'out') return { kind: 'out', cap: 0 };
    if (p.availability === 'preorder') return { kind: 'preorder', cap: p.maxPerOrder || 5, days: p.preorderDays || 0 };
    var own = ownStock(findV(p, vname));
    var n = own !== null ? own : (typeof p.stock === 'number' ? p.stock : 0);
    n = Math.max(0, Math.floor(n));
    return n > 0 ? { kind: 'stock', cap: n, n: n } : { kind: 'out', cap: 0 };
  }
  // Сколько уже лежит в корзине из того же «склада»: у варианта с остатком это сам вариант, иначе весь товар
  function used(p, vname) {
    var own = ownStock(findV(p, vname)) !== null;
    return state.cart.reduce(function (s, l) {
      if (l.pid !== p.id) return s;
      if (own) return s + (l.variant === vname ? l.qty : 0);
      return s + (ownStock(findV(p, l.variant)) === null ? l.qty : 0);
    }, 0);
  }
  function room(p, vname) { return Math.max(0, info(p, vname).cap - used(p, vname)); }

  // Для карточки в сетке: общая картина по товару
  function summary(p) {
    if (p.availability === 'out') return { kind: 'out' };
    if (p.availability === 'preorder') return { kind: 'preorder', days: p.preorderDays || 0 };
    var hasOwn = p._v.some(function (v) { return ownStock(v) !== null; });
    var total = hasOwn
      ? p._v.reduce(function (s, v) { return s + (ownStock(v) || 0); }, 0)
      : (p.stock || 0);
    return total > 0 ? { kind: 'stock', n: total } : { kind: 'out' };
  }
  function label(s) {
    if (s.kind === 'stock') return 'В наличии: ' + s.n + ' шт';
    if (s.kind === 'preorder') return s.days ? 'Под заказ, ' + daysText(s.days) : 'Под заказ';
    return 'Нет в наличии';
  }

  /* ---------- Корзина ---------- */
  var storeKey = 'catalog-cart:' + (D.brand.name || '');
  function persist() {
    try { localStorage.setItem(storeKey, JSON.stringify(state.cart)); } catch (e) {}
  }
  function restore() {
    var saved = [];
    try { saved = JSON.parse(localStorage.getItem(storeKey) || '[]'); } catch (e) {}
    if (!Array.isArray(saved)) return;
    saved.forEach(function (l) {
      var p = byId[l && l.pid];
      if (!p || (l.variant && !findV(p, l.variant))) return;
      for (var i = 0; i < (l.qty | 0); i++) addToCart(p, l.variant, true);
    });
  }
  function addToCart(p, vname, quiet) {
    vname = vname || '';
    if (room(p, vname) <= 0) return false;
    var line = state.cart.filter(function (l) { return l.pid === p.id && l.variant === vname; })[0];
    if (line) line.qty += 1; else state.cart.push({ pid: p.id, variant: vname, qty: 1 });
    if (!quiet) { persist(); renderCount(); }
    return true;
  }
  function cartCount() { return state.cart.reduce(function (s, l) { return s + l.qty; }, 0); }
  function itemsSum() { return state.cart.reduce(function (s, l) { return s + l.qty * byId[l.pid].price; }, 0); }
  function renderCount() {
    var n = cartCount();
    Array.prototype.forEach.call(document.querySelectorAll('.js-count'), function (el) {
      el.textContent = n;
      el.hidden = n === 0;
    });
  }

  /* ---------- Картинки и заглушка ---------- */
  function placeholder(p) {
    return h('div', { class: 'ph' }, icon('image'), h('span', null, p.name));
  }
  function media(p, src, opts) {
    opts = opts || {};
    var box = h('div', { class: 'media' + (opts.small ? ' media-sm' : '') });
    if (!src) { box.appendChild(placeholder(p)); return box; }
    var img = document.createElement('img');
    img.alt = opts.small ? '' : p.name;
    img.decoding = 'async';
    img.draggable = false;
    if (!opts.eager) img.loading = 'lazy';
    img.addEventListener('error', function () {
      if (img.parentNode) img.parentNode.replaceChild(placeholder(p), img);
    });
    img.src = src;
    box.appendChild(img);
    return box;
  }

  /* ---------- Главная ---------- */
  function renderHeader() {
    $('brand').textContent = D.brand.name || 'Каталог';
    $('tagline').textContent = D.brand.tagline || '';
    $('tagline').hidden = !D.brand.tagline;
    $('footNote').textContent = D.footerNote || '';
    $('footNote').hidden = !D.footerNote;
    document.title = D.brand.name || 'Каталог';
  }

  function renderChips() {
    var box = $('chips');
    box.innerHTML = '';
    if (!D.categories.length) { box.hidden = true; return; }
    box.hidden = false;
    [{ id: 'all', name: 'Все' }].concat(D.categories).forEach(function (c) {
      box.appendChild(h('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(state.cat === c.id),
        onclick: function () { state.cat = c.id; renderChips(); renderGrid(); }
      }, c.name));
    });
  }

  function renderGrid() {
    var g = $('grid');
    g.innerHTML = '';
    var list = D.products.filter(function (p) { return state.cat === 'all' || p.category === state.cat; });
    if (!list.length) {
      g.appendChild(h('div', { class: 'empty' },
        h('h2', null, 'Здесь пока ничего нет'),
        h('p', null, 'В этой категории нет товаров.'),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: function () { state.cat = 'all'; renderChips(); renderGrid(); } }, 'Показать всё')));
      return;
    }
    list.forEach(function (p) {
      var s = summary(p);
      g.appendChild(h('button', {
        class: 'card' + (s.kind === 'out' ? ' is-out' : ''), type: 'button',
        onclick: function () { openProduct(p); }
      },
        media(p, p.photos[0]),
        h('span', { class: 'card-name' }, p.name),
        h('span', { class: 'card-price' }, money(p.price)),
        h('span', { class: 'badge badge-' + s.kind }, label(s))));
    });
  }

  /* ---------- Экраны поверх главной ---------- */
  function openSheet() { $('sheet').hidden = false; document.documentElement.classList.add('lock'); }
  function closeSheet() {
    $('sheet').hidden = true;
    $('sheet').innerHTML = '';
    document.documentElement.classList.remove('lock');
  }
  function push(fn) { nav.push(fn); show(); }
  function pop() { nav.pop(); show(); }
  function reset() { nav = []; state.done = false; show(); }
  function show() {
    var fn = nav[nav.length - 1];
    $('toast').classList.remove('on');
    if (!fn) { closeSheet(); renderCount(); return; }
    var el = fn();
    var sh = $('sheet');
    sh.innerHTML = '';
    sh.appendChild(el);
    sh.hidden = false;
    document.documentElement.classList.add('lock');
    renderCount();
  }

  function topbar(opts) {
    return h('div', { class: 'bar' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': opts.backLabel || 'Назад', onclick: opts.onBack || pop },
        icon(opts.closeIcon ? 'close' : 'back'), opts.backText || ''),
      opts.title ? h('div', { class: 'bar-title' }, opts.title) : null,
      opts.noCart ? null : h('button', { class: 'cart-btn', type: 'button', 'aria-label': 'Открыть корзину', onclick: function () { push(cartScreen); } },
        icon('bag'), h('span', { class: 'count js-count', hidden: true }, '0')));
  }

  /* Карточка товара */
  function openProduct(p) { push(function () { return productScreen(p); }); }

  function carousel(p) {
    var photos = p.photos.length ? p.photos : [null];
    var track = h('div', { class: 'track', role: 'group', 'aria-label': 'Фотографии товара' });
    photos.forEach(function (src, i) {
      track.appendChild(h('div', { class: 'slide' }, media(p, src, { eager: i === 0 })));
    });
    var wrap = h('div', { class: 'car' }, track);
    if (photos.length < 2) return wrap;

    var dots = h('div', { class: 'dots' });
    var dotEls = photos.map(function (_, i) {
      var d = h('button', {
        class: 'dot', type: 'button', 'aria-label': 'Фото ' + (i + 1) + ' из ' + photos.length,
        onclick: function () { go(i); }
      });
      dots.appendChild(d);
      return d;
    });
    var prev = h('button', { class: 'car-arrow prev', type: 'button', 'aria-label': 'Предыдущее фото', onclick: function () { go(cur - 1); } }, icon('prev'));
    var next = h('button', { class: 'car-arrow next', type: 'button', 'aria-label': 'Следующее фото', onclick: function () { go(cur + 1); } }, icon('next'));
    wrap.appendChild(prev);
    wrap.appendChild(next);

    var cur = 0;
    function mark(i) {
      cur = i;
      dotEls.forEach(function (d, k) { d.setAttribute('aria-current', String(k === i)); });
      prev.hidden = i === 0;
      next.hidden = i === photos.length - 1;
    }
    var goingTo = null, goTimer;
    function go(i) {
      i = Math.max(0, Math.min(photos.length - 1, i));
      goingTo = i;
      clearTimeout(goTimer);
      goTimer = setTimeout(function () { goingTo = null; }, 700);
      track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
      mark(i);
    }
    var raf = 0;
    track.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var w = track.clientWidth || 1;
        var i = Math.round(track.scrollLeft / w);
        if (goingTo !== null) { if (i === goingTo) goingTo = null; return; }
        if (i !== cur) mark(i);
      });
    }, { passive: true });
    mark(0);
    wrap.appendChild(dots);
    return wrap;
  }

  function productScreen(p) {
    var vname = p._v.length === 1 ? p._v[0].name : (p._v.length ? null : '');   // null: надо выбрать
    var vLabel = p.variantsLabel || 'Вариант';
    var statusEl = h('p', { class: 'p-status' });
    var inCartEl = h('p', { class: 'p-incart' });
    var buyBtn = h('button', { class: 'btn', type: 'button' }, 'В корзину');
    var varErr = h('p', { class: 'err', role: 'alert', hidden: true }, 'Выберите: ' + vLabel.toLowerCase());
    var optBtns = [];

    var group = null;
    if (p._v.length) {
      var opts = h('div', { class: 'opts', role: 'radiogroup', 'aria-label': vLabel });
      p._v.forEach(function (v) {
        var disabled = info(p, v.name).kind === 'out';
        var b = h('button', {
          class: 'opt', type: 'button', role: 'radio', 'aria-checked': 'false', disabled: disabled,
          onclick: function () { vname = v.name; varErr.hidden = true; update(); }
        }, v.name);
        b._name = v.name;
        optBtns.push(b);
        opts.appendChild(b);
      });
      group = h('div', { class: 'group' }, h('div', { class: 'group-label' }, vLabel), opts, varErr);
    }

    function update() {
      optBtns.forEach(function (b) { b.setAttribute('aria-checked', String(b._name === vname)); });
      var s = vname === null ? summary(p) : info(p, vname);
      statusEl.className = 'p-status k-' + s.kind;
      statusEl.textContent = label(s);
      var u = vname === null ? 0 : used(p, vname);
      inCartEl.textContent = u ? 'В корзине: ' + u + ' шт' : '';
      inCartEl.hidden = !u;

      var whole = summary(p);
      if (whole.kind === 'out' || (vname !== null && s.kind === 'out')) {
        buyBtn.disabled = true; buyBtn.textContent = 'Нет в наличии';
      } else if (vname !== null && room(p, vname) <= 0) {
        buyBtn.disabled = true;
        buyBtn.textContent = s.kind === 'stock' ? 'Остаток уже в корзине' : 'Больше нельзя добавить';
      } else {
        buyBtn.disabled = false; buyBtn.textContent = 'В корзину';
      }
      renderCount();
    }

    buyBtn.addEventListener('click', function () {
      if (vname === null) {
        varErr.hidden = false;
        varErr.scrollIntoView({ block: 'center', behavior: 'smooth' });
        return;
      }
      if (addToCart(p, vname)) { toast('Добавлено в корзину'); update(); }
    });

    var el = h('div', { class: 'col' },
      topbar({ backText: 'Каталог', backLabel: 'Вернуться в каталог' }),
      h('div', { class: 'body' },
        carousel(p),
        h('div', { class: 'pad' },
          h('h2', { class: 'p-title' }, p.name),
          h('p', { class: 'p-price' }, money(p.price)),
          statusEl, inCartEl,
          group,
          p.description ? h('p', { class: 'p-desc' }, p.description) : null)),
      h('div', { class: 'foot' },
        h('div', { class: 'foot-sum' }, h('small', null, 'Цена'), h('b', null, money(p.price))),
        buyBtn));
    update();
    return el;
  }

  /* Корзина */
  function cartScreen() {
    var body = h('div', { class: 'body' });
    var foot = h('div', { class: 'foot' });
    var root = h('div', { class: 'col' },
      topbar({ title: 'Корзина', backLabel: 'Назад', noCart: true }), body, foot);

    function draw() {
      var top = body.scrollTop;
      body.innerHTML = '';
      foot.innerHTML = '';
      renderCount();
      if (!state.cart.length) {
        foot.hidden = true;
        body.appendChild(h('div', { class: 'pad' },
          h('div', { class: 'empty' },
            h('h2', null, 'В корзине пока пусто'),
            h('p', null, 'Выберите что-нибудь в каталоге, и оно появится здесь.'),
            h('button', { class: 'btn', type: 'button', onclick: reset }, 'В каталог'))));
        return;
      }
      foot.hidden = false;
      var pad = h('div', { class: 'pad' }, h('h2', { class: 'sheet-h' }, 'Ваш заказ'));
      state.cart.forEach(function (l) {
        var p = byId[l.pid];
        var i = info(p, l.variant);
        var atCap = room(p, l.variant) <= 0;
        pad.appendChild(h('div', { class: 'line' },
          h('div', null, media(p, p.photos[0], { small: true })),
          h('div', null,
            h('div', { class: 'line-name' }, p.name),
            h('div', { class: 'line-meta' },
              [l.variant ? (p.variantsLabel || 'Вариант') + ': ' + l.variant : null, i.kind === 'preorder' ? label(i) : null]
                .filter(Boolean).join(' · ') || money(p.price)),
            h('div', { class: 'line-row' },
              h('div', { class: 'qty' },
                h('button', { type: 'button', 'aria-label': 'Убрать одну штуку', onclick: function () { l.qty -= 1; dropEmpty(); persist(); draw(); } }, icon('minus')),
                h('output', { 'aria-live': 'polite' }, l.qty),
                h('button', { type: 'button', 'aria-label': 'Добавить ещё одну', disabled: atCap, onclick: function () { if (addToCart(p, l.variant)) draw(); } }, icon('plus'))),
              h('div', { class: 'line-act' },
                h('span', { class: 'line-sum' }, money(l.qty * p.price)),
                h('button', { class: 'link-btn', type: 'button', 'aria-label': 'Удалить из корзины: ' + p.name, onclick: function () { l.qty = 0; dropEmpty(); persist(); draw(); } }, icon('trash')))),
            atCap ? h('div', { class: 'line-cap' }, i.kind === 'stock' ? 'Больше нет в наличии' : 'Максимум в одном заказе') : null)));
      });
      pad.appendChild(h('div', { class: 'totals' }, h('div', { class: 'grand' }, h('span', null, 'Сумма'), money(itemsSum()))));
      body.appendChild(pad);
      foot.appendChild(h('div', { class: 'foot-sum grow' }, h('small', null, 'Сумма'), h('b', null, money(itemsSum()))));
      foot.appendChild(h('button', { class: 'btn', type: 'button', onclick: function () { push(checkoutScreen); } }, 'Оформить заказ'));
      body.scrollTop = top;
    }
    function dropEmpty() { state.cart = state.cart.filter(function (l) { return l.qty > 0; }); }
    draw();
    return root;
  }

  /* Оформление */
  function deliveryById(id) { return D.delivery.filter(function (d) { return d.id === id; })[0] || null; }
  function paymentById(id) { return D.payment.filter(function (d) { return d.id === id; })[0] || null; }
  function deliveryPrice() { var d = deliveryById(state.form.delivery); return d && d.price ? d.price : 0; }
  function priceWord(d) { return d.price ? money(d.price) : 'бесплатно'; }

  function validContact(v) {
    var s = String(v || '').trim();
    if (!s) return false;
    var nick = s.replace(/^https?:\/\/t\.me\//i, '@');
    if (/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(nick)) return true;
    var digits = s.replace(/\D/g, '');
    return /^[+\d\s()\-]+$/.test(s) && digits.length >= 10 && digits.length <= 15;
  }

  function checkoutScreen() {
    var f = state.form;
    var fields = {};   // имя поля -> { el, err }

    function field(key, labelText, control, extra) {
      var err = h('p', { class: 'err', role: 'alert', hidden: true });
      var el = h('div', { class: 'field' }, labelText, control, extra || null, err);
      fields[key] = { el: el, err: err };
      return el;
    }
    function setError(key, msg) {
      var x = fields[key];
      if (!x) return;
      x.err.textContent = msg || '';
      x.err.hidden = !msg;
      x.el.classList.toggle('bad', !!msg);
    }

    var nameIn = h('input', { class: 'in', id: 'f-name', type: 'text', autocomplete: 'name', value: f.name, placeholder: 'Как к вам обращаться',
      oninput: function () { f.name = nameIn.value; setError('name'); } });
    var contactIn = h('input', { class: 'in', id: 'f-contact', type: 'text', autocomplete: 'tel', value: f.contact, placeholder: '+7 900 000-00-00 или @ник',
      oninput: function () { f.contact = contactIn.value; setError('contact'); } });

    var deliveryHint = h('p', { class: 'hint' });
    var addrIn = h('input', { class: 'in', id: 'f-address', type: 'text', autocomplete: 'street-address', value: f.address,
      oninput: function () { f.address = addrIn.value; setError('address'); } });
    var addrLabel = h('label', { for: 'f-address' }, 'Адрес или пункт выдачи');
    var addrField = field('address', addrLabel, addrIn);

    var deliverySel = h('select', { class: 'in', id: 'f-delivery',
      onchange: function () { f.delivery = deliverySel.value; setError('delivery'); updateDelivery(); } },
      h('option', { value: '' }, 'Выберите способ получения'),
      D.delivery.map(function (d) {
        return h('option', { value: d.id, selected: f.delivery === d.id }, d.name + ' · ' + priceWord(d));
      }));
    var totalSmall = h('small', null);
    var totalB = h('b', null);

    function updateDelivery() {
      var d = deliveryById(f.delivery);
      deliveryHint.textContent = d ? [d.note, priceWord(d)].filter(Boolean).join(' · ') : '';
      deliveryHint.hidden = !d;
      addrField.hidden = !(d && d.address);
      if (d && d.address) addrLabel.textContent = d.addressLabel || 'Адрес или пункт выдачи';
      if (d && d.address) addrIn.placeholder = d.addressPlaceholder || 'Город, улица, дом или номер пункта';
      totalSmall.textContent = d ? 'Итого с доставкой' : 'Итого, доставка не выбрана';
      totalB.textContent = money(itemsSum() + deliveryPrice());
    }

    var commentIn = h('textarea', { class: 'in', id: 'f-comment', rows: 3, placeholder: 'Пожелания, удобное время для связи, что уточнить',
      oninput: function () { f.comment = commentIn.value; } });
    commentIn.value = f.comment;

    var payRadios = h('div', { class: 'radios', role: 'radiogroup', 'aria-label': 'Способ оплаты' },
      D.payment.map(function (pm) {
        return h('label', { class: 'radio' },
          h('input', { type: 'radio', name: 'pay', value: pm.id, checked: f.payment === pm.id,
            onchange: function () { f.payment = pm.id; setError('payment'); } }),
          h('span', null, pm.name, pm.note ? h('small', null, pm.note) : null));
      }));

    var consentIn = h('input', { type: 'checkbox', id: 'f-consent', checked: f.consent,
      onchange: function () { f.consent = consentIn.checked; setError('consent'); } });

    var form = h('form', { class: 'pad', novalidate: true, onsubmit: function (e) { e.preventDefault(); submit(); } },
      h('h2', { class: 'sheet-h' }, 'Оформление'),
      h('p', { class: 'hint' }, cartCount() + ' ' + plural(cartCount(), ['товар', 'товара', 'товаров']) + ' на ' + money(itemsSum())),
      field('name', h('label', { for: 'f-name' }, 'Имя'), nameIn),
      field('contact', h('label', { for: 'f-contact' }, 'Телефон или Telegram'), contactIn),
      field('delivery', h('label', { for: 'f-delivery' }, 'Способ получения'),
        h('div', { class: 'sel' }, deliverySel, icon('down')), deliveryHint),
      addrField,
      field('comment', h('label', { for: 'f-comment' }, 'Комментарий к заказу ', h('span', { class: 'opt-tag' }, '(необязательно)')), commentIn),
      field('payment', h('div', { class: 'lbl' }, 'Способ оплаты'), payRadios),
      field('consent', null, h('label', { class: 'check', for: 'f-consent' }, consentIn, h('span', null, 'Даю согласие на обработку персональных данных'))));

    function submit() {
      var errs = {};
      if (f.name.trim().length < 2) errs.name = 'Напишите, как к вам обращаться';
      if (!validContact(f.contact)) errs.contact = 'Укажите телефон (+7 900 000-00-00) или ник в Telegram (@name)';
      if (!f.delivery) errs.delivery = 'Выберите, как вы получите заказ';
      var d = deliveryById(f.delivery);
      if (d && d.address && f.address.trim().length < 5) errs.address = 'Напишите адрес или номер пункта выдачи';
      if (!f.payment) errs.payment = 'Выберите способ оплаты';
      if (!f.consent) errs.consent = 'Без согласия на обработку данных заказ не оформить';
      Object.keys(fields).forEach(function (k) { setError(k, errs[k]); });
      var first = Object.keys(fields).filter(function (k) { return errs[k]; })[0];
      if (first) {
        var tgt = fields[first].el;
        tgt.scrollIntoView({ block: 'center', behavior: 'smooth' });
        var inp = tgt.querySelector('input, select, textarea');
        if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); } }
        toast('Проверьте выделенные поля');
        return;
      }
      var no = nextOrderNo();
      var text = buildMessage(no);
      state.cart = [];
      persist();
      state.form = blankForm();
      state.done = true;
      nav = [function () { return successScreen(no, text); }];
      show();
    }

    var foot = h('div', { class: 'foot' },
      h('div', { class: 'foot-sum grow' }, totalSmall, totalB),
      h('button', { class: 'btn', type: 'button', onclick: submit }, 'Оформить заказ'));

    var root = h('div', { class: 'col' },
      topbar({ title: 'Оформление', noCart: true, backLabel: 'Назад в корзину' }),
      h('div', { class: 'body' }, form), foot);
    updateDelivery();
    return root;
  }

  function nextOrderNo() {
    var key = storeKey + ':no';
    var n = 0;
    try { n = parseInt(localStorage.getItem(key), 10) || 0; } catch (e) {}
    if (!n) n = 1040 + Math.floor(Math.random() * 60);
    n += 1;
    try { localStorage.setItem(key, String(n)); } catch (e) {}
    return n;
  }

  function buildMessage(no) {
    var f = state.form;
    var lines = ['Новый заказ № ' + no + ' · ' + (D.brand.name || ''), '', 'Состав:'];
    var pre = [];
    state.cart.forEach(function (l, i) {
      var p = byId[l.pid];
      var inf = info(p, l.variant);
      var v = l.variant ? ', ' + (p.variantsLabel || 'вариант').toLowerCase() + ' ' + l.variant : '';
      lines.push((i + 1) + '. ' + p.name + v + ' × ' + l.qty + ' = ' + money(l.qty * p.price));
      if (inf.kind === 'preorder') pre.push(p.name + v + (inf.days ? ' (' + daysText(inf.days) + ')' : ''));
    });
    var d = deliveryById(f.delivery), pm = paymentById(f.payment);
    lines.push('');
    lines.push('Товары: ' + money(itemsSum()));
    lines.push('Получение: ' + (d ? d.name : '') + (d ? ', ' + priceWord(d) : ''));
    if (d && d.address && f.address.trim()) lines.push('Адрес: ' + f.address.trim());
    lines.push('Итого: ' + money(itemsSum() + (d && d.price ? d.price : 0)));
    lines.push('Оплата: ' + (pm ? pm.name : ''));
    lines.push('');
    lines.push('Покупатель: ' + f.name.trim());
    lines.push('Связь: ' + f.contact.trim());
    lines.push('Комментарий: ' + (f.comment.trim() || 'нет'));
    if (pre.length) {
      lines.push('');
      lines.push('Пометка: есть позиции под заказ, нужно подтвердить срок.');
      pre.forEach(function (t) { lines.push('Под заказ: ' + t); });
    }
    return lines.join('\n');
  }

  function successScreen(no, text) {
    return h('div', { class: 'col' },
      h('div', { class: 'bar' }, h('div', { class: 'bar-title' }, D.brand.name || '')),
      h('div', { class: 'body' },
        h('div', { class: 'pad' },
          h('div', { class: 'done-ico' }, icon('check')),
          h('h2', { class: 'sheet-h' }, 'Заказ принят'),
          h('p', { class: 'order-no' }, 'Номер заказа: ' + no),
          h('p', { class: 'lead' }, 'Так выглядит сообщение, которое придёт продавцу в Telegram:'),
          h('div', { class: 'bubble', 'aria-label': 'Текст сообщения продавцу' }, text),
          h('p', { class: 'demo-note' }, 'Демо: заказ никуда не отправляется'))),
      h('div', { class: 'foot' },
        h('button', { class: 'btn btn-block', type: 'button', onclick: function () { state.cat = 'all'; renderChips(); reset(); window.scrollTo(0, 0); } }, 'Вернуться в каталог')));
  }

  /* ---------- Запуск ---------- */
  document.addEventListener('keydown', function (e) {
    // «Заказ принят» закрывается только своей кнопкой
    if (e.key === 'Escape' && nav.length && !state.done) pop();
  });
  $('cartBtn').addEventListener('click', function () { push(cartScreen); });

  loadFonts();
  applyTheme();
  renderHeader();
  restore();
  renderChips();
  renderGrid();
  renderCount();
  initTelegram();
  var sdk = $('tg-sdk');
  if (sdk) sdk.addEventListener('load', initTelegram);
})();
