/* Движок «наших» анимаций конструктора.
   Каждый вариант: SKD.add({code, group, ru, what, when, fam, proj, spec, hold, play: async (c) => {...}}).
   play рисует одну итерацию в сцене 480×270 (c.stage), движок повторяет её по кругу, пока карточка видна.
   Цвета только из CSS-переменных сцены: --bg фон, --fg текст, --ac акцент, --sf подложка, --mu вторичный. */
(function () {
  const E = {
    E0: "linear",
    E1: "cubic-bezier(0.33,0,0.67,1)",
    E2: "cubic-bezier(0.22,1,0.36,1)",
    E3: "cubic-bezier(0.4,0,1,1)",
    E4: "cubic-bezier(0.16,1.25,0.3,1)",
    steps: (n) => `steps(${n},end)`,
  };
  const STOP = "skd-stop";
  const SVGNS = "http://www.w3.org/2000/svg";

  function ctxFor(stage) {
    let stopped = false;
    const anims = new Set(), timers = new Set(), raf = new Set();
    const c = {
      E, stage, W: 480, H: 270,
      stopped: () => stopped,
      wait(ms) {
        return new Promise((res, rej) => {
          const t = setTimeout(() => { timers.delete(t); stopped ? rej(STOP) : res(); }, ms);
          timers.add(t);
        });
      },
      /* el.animate с fill:forwards; ждёт конца; бросает STOP, если сцену остановили */
      a(el, kf, o) {
        const an = el.animate(kf, Object.assign({ fill: "forwards" }, typeof o === "number" ? { duration: o } : o));
        anims.add(an);
        return an.finished.catch(() => {}).then(() => { anims.delete(an); if (stopped) throw STOP; });
      },
      /* параллельно несколько анимаций */
      all(...ps) { return Promise.all(ps); },
      el(tag, css, parent, html) {
        const e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (html != null) e.innerHTML = html;
        (parent || stage).appendChild(e);
        return e;
      },
      /* svg(viewBox, css, parent) → <svg>; path(svgEl, d, attrs) → <path> */
      svg(viewBox, css, parent) {
        const s = document.createElementNS(SVGNS, "svg");
        s.setAttribute("viewBox", viewBox || "0 0 480 270");
        s.style.cssText = "position:absolute;inset:0;width:100%;height:100%;overflow:visible;" + (css || "");
        (parent || stage).appendChild(s);
        return s;
      },
      sv(parent, tag, attrs) {
        const e = document.createElementNS(SVGNS, tag);
        for (const k in attrs) e.setAttribute(k, attrs[k]);
        parent.appendChild(e);
        return e;
      },
      /* покадровый цикл: fn(t мс от старта) → true чтобы продолжать; длится dur мс */
      tick(dur, fn) {
        return new Promise((res, rej) => {
          let t0 = null; // отсчёт от первой метки кадра rAF: performance.now() бывает позже неё → отрицательное t
          const step = (now) => {
            if (stopped) return rej(STOP);
            if (t0 === null) t0 = now;
            const t = Math.max(0, Math.min(dur, now - t0));
            fn(t, t / dur);
            if (t >= dur) return res();
            const id = requestAnimationFrame(step); raf.add(id);
          };
          const id = requestAnimationFrame(step); raf.add(id);
        });
      },
      /* детерминированная псевдослучайность (seed 17, как в контракте Astra) */
      rnd: (() => { let s = 17; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })(),
      /* стандартный курсор-стрелка 24×32, кончик в (0,0) элемента */
      cursor(parent) {
        const w = c.el("div", "position:absolute;left:0;top:0;width:24px;height:32px;z-index:70;pointer-events:none;will-change:transform", parent);
        w.innerHTML = '<svg width="24" height="32" viewBox="0 0 24 32" style="overflow:visible"><path d="M1 1 L1 25 L7 19.5 L11 29 L15 27.3 L11 18 L19 18 Z" fill="#fff" stroke="#111" stroke-width="2" stroke-linejoin="round"/></svg>';
        return w;
      },
    };
    return { c, stop() { stopped = true; anims.forEach((a) => a.cancel()); timers.forEach(clearTimeout); raf.forEach(cancelAnimationFrame); } };
  }

  const SKD = (window.SKD = window.SKD || { list: {} });
  SKD.E = E;
  SKD.add = function (d) { SKD.list[d.code] = d; };
  SKD.palette = { bg: "#F4EFE6", fg: "#161616", ac: "#D9480F", sf: "#FFFFFF", mu: "#9C958A" };

  /* запуск в контейнере host; возвращает функцию остановки */
  SKD.run = function (code, host, pal) {
    const d = SKD.list[code];
    if (!d) return () => {};
    const stage = document.createElement("div");
    const P = Object.assign({}, SKD.palette, pal || {});
    stage.style.cssText = `position:absolute;left:0;top:0;width:480px;height:270px;overflow:hidden;transform-origin:0 0;background:var(--bg);color:var(--fg);font-family:"Golos Text",system-ui,sans-serif;--bg:${P.bg};--fg:${P.fg};--ac:${P.ac};--sf:${P.sf};--mu:${P.mu}`;
    host.appendChild(stage);
    const fit = () => { stage.style.transform = `scale(${host.clientWidth / 480})`; };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(host);
    let cur = null, alive = true;
    (async () => {
      while (alive) {
        stage.innerHTML = "";
        cur = ctxFor(stage);
        try {
          await d.play(cur.c);
          await cur.c.wait(d.hold || 1000);
        } catch (e) {
          if (e !== STOP && alive) { console.warn("SKD", code, e); await new Promise((r) => setTimeout(r, 800)); }
        }
        cur.stop();
      }
    })();
    return () => { alive = false; cur && cur.stop(); ro.disconnect(); stage.remove(); };
  };
})();

;
/* Образец для модулей: две сцены по спецификации Astra (CU-01, CL-02). */
(function () {
  /* общая мини-сцена «окно с кнопкой» 240×160 по центру (65%W,45%H по контракту превью) */
  function windowWithButton(c, label) {
    const win = c.el("div", "position:absolute;left:192px;top:42px;width:240px;height:160px;background:var(--sf);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.12);overflow:hidden");
    c.el("div", "height:22px;background:var(--bg);display:flex;gap:6px;align-items:center;padding-left:9px", win,
      '<i style="width:9px;height:9px;border-radius:50%;background:#ff5f57"></i><i style="width:9px;height:9px;border-radius:50%;background:#febc2e"></i><i style="width:9px;height:9px;border-radius:50%;background:#28c840"></i>');
    c.el("div", "margin:16px 16px 0;height:10px;width:60%;background:var(--mu);opacity:.35;border-radius:5px", win);
    c.el("div", "margin:8px 16px 0;height:10px;width:40%;background:var(--mu);opacity:.25;border-radius:5px", win);
    const btn = c.el("div", "position:absolute;left:64px;top:100px;width:112px;height:34px;border-radius:8px;background:var(--ac);color:#fff;font-weight:600;font-size:14px;display:grid;place-items:center", win, label || "Сохранить");
    return { win, btn, T: { x: 192 + 64 + 56, y: 42 + 100 + 17 } };
  }

  SKD.add({
    code: "CU-01", group: "cur", ru: "Прямое наведение",
    what: "Стрелка проходит к кнопке и останавливается.",
    when: "Один очевидный элемент управления.",
    fam: ["F01"], proj: ["democrm", "skilaxy"],
    spec: "D=500 мс, E2; кончик A→T по прямой; пауза 180 мс до клика.",
    async play(c) {
      const { T } = windowWithButton(c);
      const cur = c.cursor();
      const A = { x: 120, y: 148 };
      await c.a(cur, [{ transform: `translate(${A.x}px,${A.y}px)` }, { transform: `translate(${T.x}px,${T.y}px)` }], { duration: 500, easing: c.E.E2 });
      await c.wait(180);
    },
  });

  SKD.add({
    code: "CL-02", group: "cur", ru: "Кольцо клика",
    what: "Вокруг точки клика возникает одно исчезающее кольцо.",
    when: "Клик по мелкой цели на записи экрана.",
    fam: ["F01"], proj: ["democrm", "skilaxy"],
    spec: "D=360 мс, E2; радиус 6→28 px, обводка AC 2 px; α 0.7→0; кнопка неподвижна.",
    async play(c) {
      const { T } = windowWithButton(c);
      const cur = c.cursor();
      await c.a(cur, [{ transform: "translate(120px,148px)" }, { transform: `translate(${T.x}px,${T.y}px)` }], { duration: 500, easing: c.E.E2 });
      await c.wait(180);
      const ring = c.el("div", `position:absolute;left:${T.x - 28}px;top:${T.y - 28}px;width:56px;height:56px;border-radius:50%;border:2px solid var(--ac);box-sizing:border-box;z-index:69`);
      await c.a(ring, [{ transform: "scale(.214)", opacity: 0.7 }, { transform: "scale(1)", opacity: 0 }], { duration: 360, easing: c.E.E2 });
    },
  });
})();

;
/* Сцена для карточек палитр: заголовок, число, кнопка, мини-график в цветах палитры. Не попадает в каталог анимаций. */
SKD.add({
  code: "PAL-DEMO", group: "_pal", ru: "Демо палитры", what: "", when: "", hold: 1600,
  async play(c) {
    const t = c.el("div", "position:absolute;left:28px;top:30px;width:300px;font-weight:700;font-size:26px;line-height:1.15;color:var(--fg);opacity:0", null, "Почему перо падает<br>так же, как молоток?");
    const u = c.el("div", "position:absolute;left:28px;top:98px;height:5px;width:0;background:var(--ac);border-radius:3px");
    const n = c.el("div", "position:absolute;left:28px;top:124px;font-weight:700;font-size:44px;color:var(--ac);opacity:0", null, "9,8 м/с²");
    const b = c.el("div", "position:absolute;left:28px;top:198px;padding:10px 18px;border-radius:10px;background:var(--fg);color:var(--bg);font-weight:600;font-size:15px;opacity:0", null, "Разобрать задачу");
    const card = c.el("div", "position:absolute;right:26px;top:34px;width:120px;height:196px;border-radius:12px;background:var(--sf);opacity:0");
    const bars = [0.35, 0.55, 0.8, 1].map((h, i) => c.el("div", `position:absolute;bottom:18px;left:${16 + i * 24}px;width:16px;height:${h * 140}px;border-radius:4px;background:${i === 3 ? "var(--ac)" : "var(--mu)"};transform-origin:bottom;transform:scaleY(0)`, card));
    await c.a(t, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: c.E.E2 });
    await c.a(u, [{ width: "0px" }, { width: "210px" }], { duration: 380, easing: c.E.E2 });
    c.a(card, [{ opacity: 0 }, { opacity: 1 }], 300);
    await c.a(n, [{ opacity: 0, transform: "scale(.9)" }, { opacity: 1, transform: "none" }], { duration: 360, easing: c.E.E4 });
    await c.all(...bars.map((x, i) => c.wait(i * 90).then(() => c.a(x, [{ transform: "scaleY(0)" }, { transform: "scaleY(1)" }], { duration: 420, easing: c.E.E2 }))));
    await c.a(b, [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], { duration: 320, easing: c.E.E2 });
  },
});

;
/* Модуль 10: CU (курсор), CL (клики и действия), WI (окна и панели).
   Спецификации: research/ASTRA_TAXONOMY.md, разделы 2.1 и 2.3–2.5. Сцена 480×270, интерфейс — CRM для монтажников потолков.
   Не дублируем CU-01 и CL-02: они в 00_example.js. */
(function () {
  /* ---------- цвета: только производные от переменных сцены ---------- */
  const LN = "color-mix(in srgb,var(--fg) 11%,transparent)";   // волосяная линия
  const LN2 = "color-mix(in srgb,var(--fg) 22%,transparent)";  // контур кнопок и полей
  const TINT = "color-mix(in srgb,var(--fg) 4%,var(--sf))";    // подложка панелей и титульной полосы
  const SK = "color-mix(in srgb,var(--fg) 13%,transparent)";   // строки-заглушки
  const SUB = "color-mix(in srgb,var(--fg) 58%,transparent)";  // вторичный текст
  const ACS = "color-mix(in srgb,var(--ac) 14%,transparent)";  // мягкая заливка акцента
  const SH = "0 0 0 1px color-mix(in srgb,var(--mu) 45%,transparent),0 10px 30px rgba(0,0,0,.14)";
  const NB = " ";
  const rub = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NB) + NB + "₽";

  /* ---------- иконки 16×16, штрих currentColor ---------- */
  const IC = {
    list: '<path d="M3 4h10M3 8h10M3 12h6"/>',
    user: '<circle cx="8" cy="5.5" r="2.6"/><path d="M3 13.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/>',
    ruler: '<path d="M2 11.5L11.5 2 14 4.5 4.5 14z"/><path d="M5.2 8.3l1.5 1.5M7.6 5.9l1.5 1.5"/>',
    box: '<path d="M8 1.8l5.5 3v6.4L8 14.2l-5.5-3V4.8z"/><path d="M2.5 4.8L8 8l5.5-3.2M8 8v6.2"/>',
    chart: '<path d="M3 13V8M8 13V3M13 13V6"/>',
    filter: '<path d="M2.5 3.5h11L9.5 8.3v4.2l-3-1.5V8.3z"/>',
    out: '<path d="M8 10V2.5M5 5l3-3 3 3M3 9v4.5h10V9"/>',
    bell: '<path d="M4 11.5V7a4 4 0 018 0v4.5l1 1H3zM6.5 14h3"/>',
    tune: '<path d="M2.5 5h11M2.5 11h11"/><circle cx="6" cy="5" r="1.7" style="fill:var(--sf)"/><circle cx="10.5" cy="11" r="1.7" style="fill:var(--sf)"/>',
    cal: '<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 7h11M5.5 2v3M10.5 2v3"/>',
    doc: '<path d="M4 1.8h5.5L12.5 5v9.2H4z"/><path d="M9.5 1.8V5h3"/>',
    search: '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2l3.3 3.3"/>',
    chk: '<path d="M3.5 8.5l3 3 6-7"/>',
    plus: '<path d="M8 3v10M3 8h10"/>',
  };
  const ico = (k, s, sw) => `<svg width="${s || 14}" height="${s || 14}" viewBox="0 0 16 16" style="display:block;fill:none;stroke:currentColor;stroke-width:${sw || 1.5};stroke-linecap:round;stroke-linejoin:round">${IC[k]}</svg>`;

  /* ---------- примитивы ---------- */
  const tx = (c, p, css, html) => c.el("div", `position:absolute;white-space:nowrap;color:var(--fg);${css}`, p, html);
  const sk = (c, p, css) => c.el("div", `position:absolute;height:7px;border-radius:4px;background:${SK};${css}`, p);
  const hl = (c, p, css) => c.el("div", `position:absolute;height:1px;background:${LN};${css}`, p);

  /* кнопка: kind "s" — светлая с контуром, иначе акцентная */
  function btn(c, p, css, label, kind) {
    const k = kind === "s" ? `background:var(--sf);color:var(--fg);box-shadow:inset 0 0 0 1px ${LN2}` : "background:var(--ac);color:#fff";
    return c.el("div", `position:absolute;box-sizing:border-box;display:grid;place-items:center;border-radius:8px;font-size:13px;font-weight:600;white-space:nowrap;${k};${css}`, p, label);
  }

  /* окно macOS: три кружка ⌀10 на (tb/2 + 18i), титульная полоса tb, тень, радиус r */
  function mac(c, o) {
    o = Object.assign({ x: 24, y: 14, w: 432, h: 242, tb: 28, title: "", r: 10, parent: null, css: "" }, o);
    const win = c.el("div", `position:absolute;left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;background:var(--sf);border-radius:${o.r}px;box-shadow:${SH};overflow:hidden;${o.css}`, o.parent);
    const bar = c.el("div", `position:absolute;left:0;top:0;right:0;height:${o.tb}px;box-sizing:border-box;background:${TINT};border-bottom:1px solid ${LN}`, win);
    ["#ff5f57", "#febc2e", "#28c840"].forEach((col, i) => c.el("i", `position:absolute;top:${o.tb / 2 - 5}px;left:${o.tb / 2 - 5 + 18 * i}px;width:10px;height:10px;border-radius:50%;background:${col}`, bar));
    if (o.title) c.el("div", `position:absolute;${o.ta === "l" ? "left:64px;text-align:left" : "left:64px;right:64px;text-align:center"};top:0;height:${o.tb}px;line-height:${o.tb}px;font-size:12px;font-weight:600;color:${SUB};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`, bar, o.title);
    const body = c.el("div", `position:absolute;left:0;right:0;top:${o.tb}px;bottom:0`, win);
    return { win, bar, body, tb: o.tb, o };
  }

  /* карточка заявки */
  function lead(c, p, css, name, sum) {
    const d = c.el("div", `position:absolute;box-sizing:border-box;padding:7px 8px 0;background:var(--sf);border-radius:8px;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 1px 3px rgba(0,0,0,.07);overflow:hidden;${css}`, p);
    c.el("div", "font-size:12px;font-weight:600;line-height:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg)", d, name);
    c.el("div", `font-size:11px;line-height:16px;white-space:nowrap;color:${SUB}`, d, sum);
    return d;
  }

  /* панель-подложка */
  const panel = (c, p, x, y, w, h, title) => {
    const el = c.el("div", `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;border-radius:9px;background:${TINT};box-shadow:inset 0 0 0 1px ${LN}`, p);
    if (title) tx(c, el, "left:10px;top:7px;font-size:12px;font-weight:700", title);
    return el;
  };

  /* канбан-колонки с карточками; координаты — в системе родителя p */
  function board(c, p, o) {
    const n = o.cols.length, gap = o.gap == null ? 8 : o.gap, cw = (o.w - gap * (n - 1)) / n;
    const ch = o.ch || 46, cg = o.cg == null ? 6 : o.cg, hh = o.hh || 26;
    const out = { cw, ch, cg, hh, cols: [], cards: [], cnt: [] };
    o.cols.forEach((col, i) => {
      const x = o.x + i * (cw + gap);
      const el = c.el("div", `position:absolute;left:${x}px;top:${o.y}px;width:${cw}px;height:${o.h}px;box-sizing:border-box;border-radius:9px;background:${TINT};box-shadow:inset 0 0 0 1px ${LN}`, p);
      tx(c, el, `left:9px;top:0;line-height:${hh}px;font-size:12px;font-weight:700`, col.t);
      out.cnt.push(tx(c, el, `right:9px;top:0;line-height:${hh}px;font-size:11px;font-weight:600;color:${SUB}`, String(col.cards.length)));
      out.cols.push({ el, x, w: cw });
      out.cards.push(col.cards.map((cd, j) => lead(c, p, `left:${x + 5}px;top:${o.y + hh + j * (ch + cg)}px;width:${cw - 10}px;height:${ch}px`, cd[0], cd[1])));
    });
    return out;
  }

  /* боковая панель приложения */
  function side(c, p, w, act) {
    const el = c.el("div", `position:absolute;left:0;top:0;bottom:0;width:${w}px;box-sizing:border-box;background:${TINT};border-right:1px solid ${LN}`, p);
    [["list", "Заявки"], ["user", "Клиенты"], ["ruler", "Замеры"], ["box", "Склад"], ["chart", "Отчёты"]].forEach((it, i) => {
      const on = i === act;
      c.el("div", `position:absolute;left:6px;right:6px;top:${8 + i * 27}px;height:23px;border-radius:6px;box-sizing:border-box;padding-left:25px;line-height:23px;font-size:12px;white-space:nowrap;color:${on ? "var(--ac)" : "var(--fg)"};font-weight:${on ? 700 : 500};background:${on ? ACS : "transparent"}`, el,
        `<span style="position:absolute;left:6px;top:4.5px;color:${on ? "var(--ac)" : SUB}">${ico(it[0], 14)}</span>${it[1]}`);
    });
    return el;
  }

  /* окно CRM: сайдбар + канбан «Новые / Замер / Монтаж» */
  function crmApp(c, o) {
    const m = mac(c, Object.assign({ title: "DemoCRM — Заявки" }, o));
    side(c, m.body, 88, 0);
    m.b = board(c, m.body, {
      x: 94, y: 8, w: m.o.w - 102, h: m.o.h - m.tb - 16, gap: 6,
      cols: [
        { t: "Новые", cards: [["Орлова Н.", rub(54800)], ["Смирнов А.", rub(38200)], ["Белов Д.", rub(46900)]] },
        { t: "Замер", cards: [["Громова Т.", rub(71500)], ["Горстрой", rub(126000)]] },
        { t: "Монтаж", cards: [["Попов И.", rub(33400)], ["Фролова М.", rub(58700)]] },
      ],
    });
    return m;
  }

  /* курсор и его движения */
  const cursorAt = (c, p) => { const k = c.cursor(); k.style.transform = `translate(${p.x}px,${p.y}px)`; return k; };
  const glide = (c, k, a, b, ms, ease) => c.a(k, [{ transform: `translate(${a.x}px,${a.y}px)` }, { transform: `translate(${b.x}px,${b.y}px)` }], { duration: ms, easing: ease || c.E.E2 });
  /* квадратичная кривая A→T, контрольная точка ((Ax+Tx)/2, min(Ay,Ty)−100) */
  function arc(A, T, n) {
    const C = { x: (A.x + T.x) / 2, y: Math.min(A.y, T.y) - 100 }, kf = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      kf.push({ transform: `translate(${(u * u * A.x + 2 * u * t * C.x + t * t * T.x).toFixed(2)}px,${(u * u * A.y + 2 * u * t * C.y + t * t * T.y).toFixed(2)}px)` });
    }
    return kf;
  }
  const WIN = { x: 60, y: 24, w: 360, h: 222 }; // окно для CL-сцен

  /* =====================================================================
     CU — КУРСОР
     ===================================================================== */

  SKD.add({
    code: "CU-02", group: "cur", ru: "Заход по дуге",
    what: "Стрелка обходит соседний блок по плавной дуге.",
    when: "Цель среди нескольких панелей.",
    fam: ["F01", "F12"], proj: ["democrm", "skilaxy"],
    spec: "D=700 мс, E1 по пути; кривая A→T, опора ((Ax+Tx)/2, min(Ay,Ty)−100 px); стрелка не вращается.",
    hold: 1000,
    async play(c) {
      mac(c, { title: "DemoCRM — Обзор" });
      const p1 = panel(c, c.stage, 40, 54, 136, 190, "Новые заявки");
      [["Орлова Н.", 54800], ["Смирнов А.", 38200], ["Белов Д.", 46900]].forEach((d, j) =>
        lead(c, p1, `left:6px;top:${32 + j * 50}px;width:124px;height:46px`, d[0], rub(d[1])));
      tx(c, null, `left:192px;top:56px;font-size:12px;color:${SUB}`, "Среда, 21 октября");
      tx(c, null, "left:192px;top:74px;font-size:24px;font-weight:700;line-height:28px", "12 заявок");
      tx(c, null, `left:192px;top:106px;font-size:11px;color:${SUB}`, "5 замеров · 3 монтажа");
      const p2 = panel(c, c.stage, 190, 158, 114, 86, "Бригады");
      [["№1", 70], ["№2", 40]].forEach((b, j) => {
        tx(c, p2, `left:10px;top:${33 + j * 24}px;font-size:11px;color:${SUB}`, b[0]);
        sk(c, p2, `left:34px;top:${37 + j * 24}px;width:70px;height:6px;border-radius:3px`);
        c.el("div", `position:absolute;left:34px;top:${37 + j * 24}px;width:${0.7 * b[1]}px;height:6px;border-radius:3px;background:var(--ac)`, p2);
      });
      const p3 = panel(c, c.stage, 316, 54, 124, 190, "Действия");
      btn(c, p3, "left:8px;top:40px;width:108px;height:32px", "Замер", "s");
      btn(c, p3, "left:8px;top:90px;width:108px;height:32px", "Новая заявка");
      btn(c, p3, "left:8px;top:140px;width:108px;height:32px", "Счёт", "s");
      const A = { x: 70, y: 218 }, T = { x: 378, y: 160 };
      const cur = cursorAt(c, A);
      await c.a(cur, arc(A, T, 40), { duration: 700, easing: c.E.E1 });
    },
  });

  SKD.add({
    code: "CU-03", group: "cur", ru: "Точная доводка",
    what: "Курсор сначала подходит рядом, затем точно попадает в точку графика.",
    when: "Маленький переключатель или точка графика.",
    fam: ["F01"], proj: ["democrm", "skilaxy", "ecs"],
    spec: "D=660 мс; 0–420 A→(Tx−28,Ty+12) E2; стоп до 500; 500–660 к T, E1.",
    hold: 1100,
    async play(c) {
      mac(c, { title: "DemoCRM — Отчёты" });
      tx(c, null, "left:44px;top:50px;font-size:15px;font-weight:700", "Выручка по месяцам");
      tx(c, null, `left:44px;top:71px;font-size:12px;color:${SUB}`, "тысяч рублей");
      const gy = [100, 140, 180, 220];
      gy.forEach((y, i) => tx(c, null, `left:44px;top:${y - 7}px;font-size:11px;color:${SUB}`, String(400 - i * 100)));
      const xs = [100, 166, 232, 298, 364, 426], ys = [200, 184, 190, 152, 128, 104];
      ["Июн", "Июл", "Авг", "Сен", "Окт", "Ноя"].forEach((m, i) => tx(c, null, `left:${xs[i] - 20}px;top:229px;width:40px;text-align:center;font-size:12px;color:${SUB}`, m));
      const s = c.svg();
      gy.forEach((y) => c.sv(s, "line", { x1: 76, x2: 440, y1: y, y2: y, style: `stroke:${LN};stroke-width:1` }));
      const pts = xs.map((x, i) => `${x},${ys[i]}`).join(" ");
      c.sv(s, "polygon", { points: `${xs[0]},220 ${pts} ${xs[5]},220`, style: "fill:var(--ac);opacity:.1" });
      c.sv(s, "polyline", { points: pts, style: "fill:none;stroke:var(--ac);stroke-width:3;stroke-linejoin:round;stroke-linecap:round" });
      xs.forEach((x, i) => c.sv(s, "circle", { cx: x, cy: ys[i], r: 5, style: "fill:var(--sf);stroke:var(--ac);stroke-width:2.5" }));
      const T = { x: xs[4], y: ys[4] }, A = { x: 90, y: 64 }, P = { x: T.x - 28, y: T.y + 12 };
      const cur = cursorAt(c, A);
      await glide(c, cur, A, P, 420, c.E.E2);
      await c.wait(80);
      await glide(c, cur, P, T, 160, c.E.E1);
      c.sv(s, "circle", { cx: T.x, cy: T.y, r: 11, style: "fill:var(--ac);opacity:.2" });
    },
  });

  SKD.add({
    code: "CU-04", group: "cur", ru: "Наведение с подсказкой",
    what: "После остановки над иконкой раскрывается её подпись.",
    when: "Незнакомая иконка в DemoCRM.",
    fam: ["F01", "F12"], proj: ["democrm"],
    spec: "D=840 мс; 0–400 A→T E2; стоп 200; 600–840 подсказка y+8→0, α0→1, E2; зазор 16 px.",
    hold: 1100,
    async play(c) {
      mac(c, { title: "DemoCRM — Заявки" });
      tx(c, null, "left:44px;top:48px;font-size:16px;font-weight:700", "Заявки");
      tx(c, null, `left:108px;top:51px;font-size:12px;color:${SUB}`, "24 в работе");
      const sf = c.el("div", `position:absolute;left:44px;top:84px;width:214px;height:32px;box-sizing:border-box;border-radius:8px;background:${TINT};box-shadow:inset 0 0 0 1px ${LN}`);
      c.el("span", `position:absolute;left:10px;top:8px;color:${SUB}`, sf, ico("search", 16));
      tx(c, sf, `left:33px;top:0;line-height:32px;font-size:12px;color:${SUB}`, "Поиск по клиентам");
      ["filter", "cal", "out", "bell", "tune"].forEach((k, i) =>
        c.el("div", `position:absolute;left:${276 + 34 * i}px;top:86px;width:28px;height:28px;border-radius:7px;background:${TINT};box-shadow:inset 0 0 0 1px ${LN};display:grid;place-items:center;color:var(--fg)`, null, ico(k, 16)));
      [["Орлова Н.", "Потолок 22 м²", 54800], ["Смирнов А.", "Потолок 15 м²", 38200], ["Белов Д.", "Потолок 19 м²", 46900]].forEach((r, i) => {
        const row = c.el("div", `position:absolute;left:44px;right:40px;top:${128 + i * 36}px;height:36px;border-top:1px solid ${LN}`);
        c.el("i", "position:absolute;left:6px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--ac)", row);
        tx(c, row, "left:24px;top:0;line-height:36px;font-size:13px;font-weight:600", r[0]);
        tx(c, row, `left:150px;top:0;line-height:36px;font-size:12px;color:${SUB}`, r[1]);
        tx(c, row, "right:0;top:0;line-height:36px;font-size:13px;font-weight:600", rub(r[2]));
      });
      const T = { x: 358, y: 100 }, A = { x: 120, y: 206 };
      const tip = c.el("div", `position:absolute;left:${T.x - 68}px;top:${T.y - 16 - 26}px;width:136px;height:26px;opacity:0;z-index:60`);
      c.el("div", "position:absolute;inset:0;border-radius:7px;background:var(--fg);color:var(--bg);font-size:12px;font-weight:600;line-height:26px;text-align:center;white-space:nowrap", tip, "Выгрузить в Excel");
      c.el("div", "position:absolute;left:64px;bottom:-3px;width:8px;height:8px;background:var(--fg);transform:rotate(45deg)", tip);
      const cur = cursorAt(c, A);
      await glide(c, cur, A, T, 400, c.E.E2);
      await c.wait(200);
      await c.a(tip, [{ transform: "translateY(8px)", opacity: 0 }, { transform: "translateY(0px)", opacity: 1 }], { duration: 240, easing: c.E.E2 });
    },
  });

  SKD.add({
    code: "CU-05", group: "cur", ru: "Перенос с захватом",
    what: "Курсор берёт заявку и везёт её в другую колонку воронки.",
    when: "Перемещение заявки между этапами.",
    fam: ["F01"], proj: ["democrm", "skilaxy"],
    spec: "D=1000 мс; 0–300 A→T E2; 300–400 s 1→1.03 E1; 400–900 T→B вместе с карточкой E1; 900–1000 s→1 E2.",
    hold: 1000,
    async play(c) {
      mac(c, { title: "DemoCRM — Воронка" });
      const b = board(c, c.stage, {
        x: 36, y: 50, w: 408, h: 196, gap: 12, ch: 48, cg: 8,
        cols: [
          { t: "Новые", cards: [["Орлова Н.", rub(54800)], ["Смирнов А.", rub(38200)], ["Белов Д.", rub(46900)]] },
          { t: "Замер", cards: [["Громова Т.", rub(71500)], ["Горстрой", rub(126000)]] },
          { t: "Монтаж", cards: [["Попов И.", rub(33400)]] },
        ],
      });
      const card = b.cards[0][0], ox = b.cols[0].x + 5, oy = 50 + b.hh, dx = b.cols[1].x - b.cols[0].x, dy = 2 * (b.ch + b.cg);
      const slot = (x, y, col) => c.el("div", `position:absolute;left:${x}px;top:${y}px;width:${b.cw - 10}px;height:${b.ch}px;box-sizing:border-box;border-radius:8px;border:1.5px dashed ${col};opacity:0`);
      const g0 = slot(ox, oy, LN2), g1 = slot(ox + dx, oy + dy, "color-mix(in srgb,var(--ac) 65%,transparent)");
      card.style.zIndex = 40;
      const T = { x: ox + (b.cw - 10) / 2, y: oy + b.ch / 2 }, B = { x: T.x + dx, y: T.y + dy }, A = { x: 270, y: 234 };
      const cur = cursorAt(c, A);
      const base = "0 0 0 1px rgba(0,0,0,.08),0 1px 3px rgba(0,0,0,.07)", up = "0 0 0 1px rgba(0,0,0,.08),0 10px 20px rgba(0,0,0,.2)";
      await glide(c, cur, A, T, 300, c.E.E2);
      await c.all(
        c.a(card, [{ transform: "scale(1)", boxShadow: base }, { transform: "scale(1.03)", boxShadow: up }], { duration: 100, easing: c.E.E1 }),
        c.a(g0, [{ opacity: 0 }, { opacity: 1 }], { duration: 100, easing: c.E.E0 }),
        c.a(g1, [{ opacity: 0 }, { opacity: 1 }], { duration: 100, easing: c.E.E0 }));
      await c.all(
        c.a(card, [{ transform: "translate(0px,0px) scale(1.03)", boxShadow: up }, { transform: `translate(${dx}px,${dy}px) scale(1.03)`, boxShadow: up }], { duration: 500, easing: c.E.E1 }),
        glide(c, cur, T, B, 500, c.E.E1));
      b.cnt[0].textContent = "2"; b.cnt[1].textContent = "3"; // E6: счётчики колонок
      await c.all(
        c.a(card, [{ transform: `translate(${dx}px,${dy}px) scale(1.03)`, boxShadow: up }, { transform: `translate(${dx}px,${dy}px) scale(1)`, boxShadow: base }], { duration: 100, easing: c.E.E2 }),
        c.a(g0, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: c.E.E0 }),
        c.a(g1, [{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: c.E.E0 }),
        ...b.cards[0].slice(1).map((k) => c.a(k, [{ transform: "translateY(0px)" }, { transform: `translateY(${-(b.ch + b.cg)}px)` }], { duration: 100, easing: c.E.E2 })));
    },
  });

  SKD.add({
    code: "CU-06", group: "cur", ru: "Выделение диапазона",
    what: "За курсором прорастает выделение ячеек в смете.",
    when: "Показать конкретный фрагмент.",
    fam: ["F01"], proj: ["democrm", "ecs"],
    spec: "D=700 мс, E0; кончик A→B, маска выделения до текущего x, высота 48 px, AC α0.18; текст неподвижен.",
    hold: 1100,
    async play(c) {
      mac(c, { title: "DemoCRM — Смета №1042" });
      [["Позиция", "left:44px"], ["Кол-во", "left:252px"], ["Сумма", "right:48px"]].forEach((h) => tx(c, null, `${h[1]};top:52px;line-height:24px;font-size:11px;font-weight:600;color:${SUB}`, h[0]));
      [["Полотно матовое", "22 м²", 18400], ["Светильники GX53", "6 шт", 8400], ["Профиль и монтаж", "22 м²", 11100]].forEach((r, i) => {
        const row = c.el("div", `position:absolute;left:40px;right:40px;top:${76 + i * 48}px;height:48px;box-sizing:border-box;border-top:1px solid ${LN}`);
        tx(c, row, "left:4px;top:0;line-height:48px;font-size:14px;font-weight:600", r[0]);
        tx(c, row, "left:212px;top:0;line-height:48px;font-size:14px", r[1]);
        tx(c, row, "right:8px;top:0;line-height:48px;font-size:14px;font-weight:600", rub(r[2]));
      });
      hl(c, null, "left:40px;right:40px;top:220px");
      tx(c, null, "left:44px;top:224px;line-height:24px;font-size:13px;font-weight:700", "Итого");
      tx(c, null, "right:48px;top:224px;line-height:24px;font-size:15px;font-weight:700;color:var(--ac)", rub(37900));
      const A = { x: 244, y: 148 }, B = { x: 436, y: 148 };
      const sel = c.el("div", `position:absolute;left:${A.x}px;top:124px;width:${B.x - A.x}px;height:48px;background:color-mix(in srgb,var(--ac) 18%,transparent);clip-path:inset(0 100% 0 0);z-index:30`);
      const cur = cursorAt(c, { x: 110, y: 232 });
      await glide(c, cur, { x: 110, y: 232 }, A, 420, c.E.E2);
      await c.all(
        c.a(sel, [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)" }], { duration: 700, easing: c.E.E0 }),
        glide(c, cur, A, B, 700, c.E.E0));
    },
  });

  SKD.add({
    code: "CU-07", group: "cur", ru: "Прокрутка панели",
    what: "Курсор стоит у края списка, записи едут вверх под неподвижной рамкой.",
    when: "Перейти от списка к нужной записи.",
    fam: ["F01"], proj: ["democrm"],
    spec: "D=800 мс, E1; кончик неподвижен; список y 0→−320 px под маской; ползунок y 0→+80 px.",
    hold: 1200,
    async play(c) {
      const m = mac(c, { title: "DemoCRM — Заявки" });
      side(c, m.body, 92, 0);
      tx(c, m.win, "left:100px;top:38px;font-size:15px;font-weight:700", "Все заявки");
      tx(c, m.win, `left:188px;top:41px;font-size:12px;color:${SUB}`, "16 в работе");
      const vp = c.el("div", `position:absolute;left:100px;top:66px;width:324px;height:160px;overflow:hidden;border-radius:8px;box-shadow:inset 0 0 0 1px ${LN2};background:var(--sf)`, m.win);
      const inner = c.el("div", "position:absolute;left:0;top:0;width:324px;height:640px", vp);
      const N = [["Орлова Н.", "ул. Белинского, 61", 54800], ["Смирнов А.", "пр. Гагарина, 41", 38200], ["Белов Д.", "ул. Минина, 14", 46900], ["Громова Т.", "ул. Родионова, 9", 71500],
        ["Горстрой", "пр. Ленина, 88", 126000], ["Попов И.", "ул. Горького, 22", 33400], ["Фролова М.", "ул. Рокоссовского, 5", 58700], ["Назаров Р.", "ул. Семашко, 17", 42100],
        ["Мельник О.", "ул. Ковалихинская, 3", 36800], ["Иванова Н.", "ул. Ульянова, 30", 54800], ["Зайцев П.", "пр. Кораблестроителей, 12", 49300], ["Лебедева С.", "ул. Артёма, 27", 61200],
        ["ИП Рахимов", "ул. Тимирязева, 8", 88000], ["Егоров В.", "ул. Бекетова, 15", 39500], ["Тимофеев К.", "ул. Нартова, 6", 47600], ["Власова Е.", "ул. Совхозная, 50", 52300]];
      N.forEach((r, j) => {
        const row = c.el("div", `position:absolute;left:0;top:${j * 40}px;width:324px;height:40px;box-sizing:border-box;border-bottom:1px solid ${LN};${j === 9 ? "background:" + ACS : ""}`, inner);
        if (j === 9) c.el("div", "position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--ac)", row);
        c.el("i", `position:absolute;left:14px;top:16px;width:8px;height:8px;border-radius:50%;background:${j === 9 ? "var(--ac)" : "var(--mu)"}`, row);
        tx(c, row, "left:32px;top:5px;line-height:16px;font-size:13px;font-weight:600", r[0]);
        tx(c, row, `left:32px;top:21px;line-height:14px;font-size:11px;color:${SUB}`, r[1]);
        tx(c, row, "right:26px;top:0;line-height:40px;font-size:13px;font-weight:600", rub(r[2]));
      });
      const thumb = c.el("div", `position:absolute;left:${100 + 324 - 11}px;top:${66 + 4}px;width:5px;height:40px;border-radius:3px;background:color-mix(in srgb,var(--fg) 35%,transparent);z-index:5`, m.win);
      const T = { x: 428, y: 134 };
      const cur = cursorAt(c, { x: 300, y: 232 });
      await glide(c, cur, { x: 300, y: 232 }, T, 400, c.E.E2);
      await c.wait(120);
      await c.all(
        c.a(inner, [{ transform: "translateY(0px)" }, { transform: "translateY(-320px)" }], { duration: 800, easing: c.E.E1 }),
        c.a(thumb, [{ transform: "translateY(0px)" }, { transform: "translateY(80px)" }], { duration: 800, easing: c.E.E1 }));
    },
  });

  SKD.add({
    code: "CU-08", group: "cur", ru: "Смена инструмента",
    what: "У поля ввода стрелка превращается в вертикальную каретку.",
    when: "Объяснить, куда вводится текст.",
    fam: ["F01"], proj: ["democrm", "skilaxy"],
    spec: "D=500 мс; 0–400 A→T E2; 400–500 E6: стрелку заменяет каретка 2×32 px, центр T, без моргания.",
    hold: 1200,
    async play(c) {
      const m = mac(c, { title: "DemoCRM — Новая заявка" });
      const p = m.win;
      tx(c, p, "left:24px;top:36px;font-size:16px;font-weight:700", "Новая заявка");
      tx(c, p, `left:24px;top:66px;font-size:11px;font-weight:600;color:${SUB}`, "Клиент");
      c.el("div", `position:absolute;left:24px;top:82px;width:384px;height:38px;box-sizing:border-box;border-radius:8px;box-shadow:inset 0 0 0 1px ${LN2};padding-left:12px;line-height:38px;font-size:14px;font-weight:600`, p, "Орлова Наталья");
      tx(c, p, `left:24px;top:124px;font-size:11px;font-weight:600;color:${SUB}`, "Адрес объекта");
      c.el("div", `position:absolute;left:24px;top:144px;width:384px;height:42px;box-sizing:border-box;border-radius:8px;box-shadow:inset 0 0 0 1px ${LN2};padding-left:12px;line-height:42px;font-size:14px;color:${SUB}`, p, "Введите адрес объекта");
      const focus = c.el("div", "position:absolute;left:21px;top:141px;width:390px;height:48px;box-sizing:border-box;border-radius:10px;border:2px solid var(--ac);opacity:0", p);
      btn(c, p, "left:278px;top:198px;width:130px;height:30px", "Сохранить");
      btn(c, p, "left:24px;top:198px;width:90px;height:30px", "Отмена", "s");
      const T = { x: 24 + 200, y: 14 + 165 }, A = { x: 110, y: 66 };
      const caret = c.el("div", `position:absolute;left:${T.x - 1}px;top:${T.y - 16}px;width:2px;height:32px;border-radius:1px;background:var(--fg);box-shadow:0 0 0 1px rgba(255,255,255,.85);opacity:0;z-index:70`);
      const cur = cursorAt(c, A);
      await glide(c, cur, A, T, 400, c.E.E2);
      cur.style.opacity = "0"; caret.style.opacity = "1"; focus.style.opacity = "1"; // E6: мгновенная замена
      await c.wait(100);
    },
  });

  /* =====================================================================
     CL — КЛИКИ И ДЕЙСТВИЯ
     ===================================================================== */

  /* курсор подходит к цели и замирает на 180 мс (как в образце CL-02) */
  async function approach(c, A, T) {
    const cur = cursorAt(c, A);
    await glide(c, cur, A, T, 500, c.E.E2);
    await c.wait(180);
    return cur;
  }

  SKD.add({
    code: "CL-01", group: "cur", ru: "Нажатие кнопки",
    what: "Кнопка «Сохранить» утапливается и возвращается.",
    when: "Обычное подтверждение действия.",
    fam: ["F01", "F12"], proj: ["democrm", "skilaxy", "ecs"],
    spec: "D=180 мс; s 1→0.97 за 70 мс E1; 0.97→1 за 110 мс E2; центр = T, текст вместе с кнопкой.",
    hold: 1000,
    async play(c) {
      const m = mac(c, { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h, title: "DemoCRM — Заявка №1042" });
      const p = m.win;
      tx(c, p, `left:20px;top:40px;font-size:11px;font-weight:600;color:${SUB}`, "Клиент");
      c.el("div", `position:absolute;left:20px;top:56px;width:320px;height:34px;box-sizing:border-box;border-radius:8px;box-shadow:inset 0 0 0 1px ${LN2};padding-left:12px;line-height:34px;font-size:13px;font-weight:600`, p, "Орлова Наталья");
      tx(c, p, `left:20px;top:100px;font-size:11px;font-weight:600;color:${SUB}`, "Адрес");
      c.el("div", `position:absolute;left:20px;top:116px;width:320px;height:34px;box-sizing:border-box;border-radius:8px;box-shadow:inset 0 0 0 1px ${LN2};padding-left:12px;line-height:34px;font-size:13px;font-weight:600`, p, "ул. Белинского, 61, кв. 14");
      btn(c, p, "left:20px;top:166px;width:100px;height:38px", "Отмена", "s");
      const save = btn(c, p, "left:210px;top:166px;width:130px;height:38px;font-size:14px", "Сохранить");
      const T = { x: WIN.x + 275, y: WIN.y + 185 };
      await approach(c, { x: 110, y: 70 }, T);
      await c.a(save, [{ transform: "scale(1)" }, { transform: "scale(.97)" }], { duration: 70, easing: c.E.E1 });
      await c.a(save, [{ transform: "scale(.97)" }, { transform: "scale(1)" }], { duration: 110, easing: c.E.E2 });
    },
  });

  SKD.add({
    code: "CL-03", group: "cur", ru: "Заливка отклика",
    what: "Внутри большой плоской кнопки от точки касания растекается заливка.",
    when: "Касание большой плоской кнопки.",
    fam: ["F01"], proj: ["democrm", "skilaxy"],
    spec: "D=400 мс; круг из T r 0→R за 280 мс E2, R — до дальнего угла; AC α0.16, клип по кнопке; 280–400 α→0, E0.",
    hold: 1000,
    async play(c) {
      const m = mac(c, { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h, title: "DemoCRM — Замеры на неделю" });
      const p = m.win;
      [["Пн 10:00", "Орлова Н.", "ул. Белинского, 61"], ["Вт 14:30", "Смирнов А.", "пр. Гагарина, 41"], ["Ср 09:00", "Белов Д.", "ул. Минина, 14"]].forEach((r, i) => {
        const y = 40 + i * 40;
        hl(c, p, `left:20px;right:20px;top:${y + 39}px`);
        c.el("div", `position:absolute;left:20px;top:${y + 9}px;width:66px;height:22px;border-radius:6px;background:${ACS};color:var(--ac);font-size:11px;font-weight:700;line-height:22px;text-align:center`, p, r[0]);
        tx(c, p, `left:98px;top:${y}px;line-height:40px;font-size:13px;font-weight:600`, r[1]);
        tx(c, p, `right:20px;top:${y}px;line-height:40px;font-size:11px;color:${SUB}`, r[2]);
      });
      const bw = 320, bh = 42, L = { x: 96, y: 21 };
      const b = c.el("div", `position:absolute;left:20px;top:168px;width:${bw}px;height:${bh}px;box-sizing:border-box;border-radius:10px;background:${TINT};box-shadow:inset 0 0 0 1px ${LN2};overflow:hidden;display:grid;place-items:center;font-size:14px;font-weight:600;color:var(--fg)`, p, "Добавить замер");
      const R = Math.hypot(Math.max(L.x, bw - L.x), Math.max(L.y, bh - L.y));
      const rip = c.el("div", `position:absolute;left:${L.x - R}px;top:${L.y - R}px;width:${2 * R}px;height:${2 * R}px;border-radius:50%;background:var(--ac);opacity:0`, b);
      const T = { x: WIN.x + 20 + L.x, y: WIN.y + 168 + L.y };
      await approach(c, { x: 400, y: 120 }, T);
      await c.a(rip, [{ transform: "scale(0)", opacity: 0.16 }, { transform: "scale(1)", opacity: 0.16 }], { duration: 280, easing: c.E.E2 });
      await c.a(rip, [{ opacity: 0.16 }, { opacity: 0 }], { duration: 120, easing: c.E.E0 });
    },
  });

  SKD.add({
    code: "CL-04", group: "cur", ru: "Касание пальцем",
    what: "Полупрозрачная точка показывает касание кнопки на экране телефона.",
    when: "Мобильная демоверсия 9:16.",
    fam: ["F01"], proj: ["democrm", "skilaxy"],
    spec: "D=300 мс; круг r16: 0–80 s0.7→1, α0→0.35, E2; стоп до 140; 140–300 s1→1.4, α→0, E2.",
    hold: 1000,
    async play(c) {
      const ph = c.el("div", "position:absolute;left:166px;top:9px;width:148px;height:252px;border-radius:26px;background:var(--fg);box-shadow:0 10px 30px rgba(0,0,0,.18)");
      const sc = c.el("div", "position:absolute;left:5px;top:5px;right:5px;bottom:5px;border-radius:21px;background:var(--sf);overflow:hidden", ph);
      c.el("div", "position:absolute;left:50%;top:7px;width:44px;height:12px;margin-left:-22px;border-radius:7px;background:var(--fg)", sc);
      tx(c, sc, "left:16px;top:6px;font-size:11px;font-weight:700", "9:41");
      tx(c, sc, "left:12px;top:30px;font-size:18px;font-weight:700", "Заявки");
      sc.style.background = TINT;
      lead(c, sc, "left:9px;top:62px;width:120px;height:48px", "Орлова Н.", rub(54800) + " · 22 м²");
      lead(c, sc, "left:9px;top:116px;width:120px;height:48px", "Смирнов А.", rub(38200) + " · 15 м²");
      btn(c, sc, "left:9px;top:186px;width:120px;height:44px;border-radius:12px;font-size:14px", "Принять заявку");
      c.el("div", "position:absolute;left:50%;bottom:5px;width:44px;height:4px;margin-left:-22px;border-radius:2px;background:var(--fg);opacity:.25", sc);
      const T = { x: 171 + 9 + 60, y: 14 + 186 + 22 };
      const dot = c.el("div", `position:absolute;left:${T.x - 16}px;top:${T.y - 16}px;width:32px;height:32px;border-radius:50%;background:var(--fg);opacity:0;z-index:70`);
      await c.wait(600);
      await c.a(dot, [{ transform: "scale(.7)", opacity: 0 }, { transform: "scale(1)", opacity: 0.35 }], { duration: 80, easing: c.E.E2 });
      await c.wait(60);
      await c.a(dot, [{ transform: "scale(1)", opacity: 0.35 }, { transform: "scale(1.4)", opacity: 0 }], { duration: 160, easing: c.E.E2 });
    },
  });

  SKD.add({
    code: "CL-05", group: "cur", ru: "Двойной клик",
    what: "Два коротких нажатия на файл заказа, плитка подсвечивается.",
    when: "Открытие файла или папки.",
    fam: ["F01"], proj: ["democrm", "ecs"],
    spec: "D=360 мс; s по точкам 0/60/130/200/260/360: 1/.97/1/1/.97/1; E1 на спадах, E2 на подъёмах, E0 на удержании.",
    hold: 1000,
    async play(c) {
      const m = mac(c, { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h, title: "Файлы — Заказ №1042" });
      const p = m.win;
      const sheet = (badge, col) => `<svg width="46" height="58" viewBox="0 0 46 58" style="display:block"><path d="M5 2h26l10 10v42a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2z" style="fill:var(--sf);stroke:${LN2};stroke-width:1.5"/><path d="M31 2v10h10" style="fill:none;stroke:${LN2};stroke-width:1.5"/><rect x="3" y="36" width="31" height="15" rx="3" style="fill:${col}"/><text x="18.5" y="47" text-anchor="middle" style="font:700 10px system-ui;fill:#fff">${badge}</text></svg>`;
      const tiles = [["Договор.pdf", "PDF", "var(--ac)", "184 КБ"], ["Смета.xlsx", "XLS", "var(--fg)", "42 КБ"], ["Замер.jpg", "JPG", "var(--fg)", "2,1 МБ"]];
      let tile;
      tiles.forEach((t, i) => {
        const el = c.el("div", "position:absolute;top:50px;width:92px;height:122px;border-radius:12px", p);
        el.style.left = 24 + i * 110 + "px";
        c.el("div", "position:absolute;left:23px;top:12px", el, sheet(t[1], t[2]));
        tx(c, el, "left:0;right:0;top:78px;text-align:center;font-size:12px;font-weight:600", t[0]);
        tx(c, el, `left:0;right:0;top:96px;text-align:center;font-size:11px;color:${SUB}`, t[3]);
        if (i === 1) tile = el;
      });
      tx(c, p, `left:24px;top:190px;font-size:11px;color:${SUB}`, "3 файла · заказ Орловой Н.");
      const T = { x: WIN.x + 24 + 110 + 46, y: WIN.y + 50 + 55 };
      await approach(c, { x: 390, y: 228 }, T);
      tile.style.background = ACS; tile.style.boxShadow = "inset 0 0 0 1.5px color-mix(in srgb,var(--ac) 45%,transparent)"; // выбор при первом нажатии
      await c.a(tile, [
        { transform: "scale(1)", offset: 0, easing: c.E.E1 },
        { transform: "scale(.97)", offset: 60 / 360, easing: c.E.E2 },
        { transform: "scale(1)", offset: 130 / 360, easing: c.E.E0 },
        { transform: "scale(1)", offset: 200 / 360, easing: c.E.E1 },
        { transform: "scale(.97)", offset: 260 / 360, easing: c.E.E2 },
        { transform: "scale(1)", offset: 1 },
      ], { duration: 360, easing: "linear" });
    },
  });

  SKD.add({
    code: "CL-06", group: "cur", ru: "Удержание выбора",
    what: "Кольцо прогресса обходит круг вокруг точки нажатия и подтверждает действие.",
    when: "Действие, которому нужно удержание.",
    fam: ["F01"], proj: ["democrm"],
    spec: "D=900 мс; 0–120 круг 32 px α0→0.25 E0; 120–780 дуга 0→360° E0; 780–900 дуга α→0, кнопка s1→1.03→1 (2×60 мс, E1).",
    hold: 1000,
    async play(c) {
      const m = mac(c, { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h, title: "DemoCRM — Завершение заказа" });
      const p = m.win;
      [["Заказ", "№1042"], ["Клиент", "Орлова Н."], ["Сумма", rub(54800)]].forEach((r, i) => {
        const y = 40 + i * 36;
        hl(c, p, `left:20px;right:20px;top:${y + 35}px`);
        tx(c, p, `left:20px;top:${y}px;line-height:36px;font-size:13px;color:${SUB}`, r[0]);
        tx(c, p, `right:20px;top:${y}px;line-height:36px;font-size:13px;font-weight:600`, r[1]);
      });
      const hold = c.el("div", `position:absolute;left:20px;top:156px;width:320px;height:50px;box-sizing:border-box;border-radius:10px;background:var(--sf);box-shadow:inset 0 0 0 1px ${LN2};line-height:50px;padding-left:68px;font-size:14px;font-weight:600;white-space:nowrap`, p, "Удерживайте, чтобы закрыть");
      c.el("span", `position:absolute;left:30px;top:16px;color:${SUB}`, hold, ico("chk", 18, 1.8));
      const T = { x: WIN.x + 20 + 39, y: WIN.y + 156 + 25 };
      const fill = c.el("div", `position:absolute;left:${T.x - 16}px;top:${T.y - 16}px;width:32px;height:32px;border-radius:50%;background:var(--fg);opacity:0;z-index:69`);
      const arcw = c.el("div", `position:absolute;left:${T.x - 16}px;top:${T.y - 16}px;width:32px;height:32px;z-index:69`);
      const sv = c.svg("0 0 32 32", "", arcw);
      const L = 2 * Math.PI * 14;
      const ar = c.sv(sv, "circle", { cx: 16, cy: 16, r: 14, transform: "rotate(-90 16 16)", style: `fill:none;stroke:var(--ac);stroke-width:3;stroke-dasharray:${L};stroke-dashoffset:${L}` });
      await approach(c, { x: 330, y: 120 }, T);
      await c.a(fill, [{ opacity: 0 }, { opacity: 0.25 }], { duration: 120, easing: c.E.E0 });
      await c.a(ar, [{ strokeDashoffset: L }, { strokeDashoffset: 0 }], { duration: 660, easing: c.E.E0 });
      await c.all(
        c.a(arcw, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: c.E.E0 }),
        c.a(fill, [{ opacity: 0.25 }, { opacity: 0 }], { duration: 120, easing: c.E.E0 }),
        c.a(hold, [{ transform: "scale(1)" }, { transform: "scale(1.03)", offset: 0.5 }, { transform: "scale(1)" }], { duration: 120, easing: c.E.E1 }));
    },
  });

  SKD.add({
    code: "CL-07", group: "cur", ru: "Сдвиг переключателя",
    what: "Ползунок уходит вправо, трек загорается акцентом, подпись меняется на «Вкл».",
    when: "Настройка уведомлений или режима.",
    fam: ["F01", "F12"], proj: ["democrm", "skilaxy"],
    spec: "D=240 мс, E2; трек 64×36, кружок r14 x 18→46; фон MU→AC; подпись меняется при t=240 (E6).",
    hold: 1100,
    async play(c) {
      const m = mac(c, { x: WIN.x, y: WIN.y, w: WIN.w, h: WIN.h, title: "DemoCRM — Настройки" });
      const p = m.win;
      const rows = [["Звук новой заявки", true], ["Уведомления о заявках", false], ["Напоминание о замере", false]];
      let tr, thumb, ac, st;
      rows.forEach((r, i) => {
        const y = 48 + i * 50;
        if (i) hl(c, p, `left:20px;right:20px;top:${y - 7}px`);
        tx(c, p, `left:20px;top:${y}px;line-height:36px;font-size:14px;font-weight:600`, r[0]);
        const state = tx(c, p, `right:96px;top:${y}px;line-height:36px;font-size:12px;font-weight:600;color:${r[1] ? "var(--ac)" : SUB}`, r[1] ? "Вкл" : "Выкл");
        const t = c.el("div", `position:absolute;left:276px;top:${y}px;width:64px;height:36px;border-radius:18px;background:var(--mu);overflow:hidden`, p);
        const a = c.el("div", `position:absolute;inset:0;background:var(--ac);opacity:${r[1] ? 1 : 0}`, t);
        const th = c.el("div", `position:absolute;left:4px;top:4px;width:28px;height:28px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transform:translateX(${r[1] ? 28 : 0}px)`, t);
        if (i === 1) { tr = t; thumb = th; ac = a; st = state; }
      });
      const T = { x: WIN.x + 276 + 32, y: WIN.y + 98 + 18 };
      await approach(c, { x: 150, y: 215 }, T);
      await c.all(
        c.a(thumb, [{ transform: "translateX(0px)" }, { transform: "translateX(28px)" }], { duration: 240, easing: c.E.E2 }),
        c.a(ac, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, easing: c.E.E2 }));
      st.textContent = "Вкл"; st.style.color = "var(--ac)"; // E6 при t=240
    },
  });

  SKD.add({
    code: "CL-08", group: "cur", ru: "Отметка выполнения",
    what: "В квадрате чек-листа монтажа появляется нарисованная галочка.",
    when: "Выбор опции и завершённый пункт.",
    fam: ["F01"], proj: ["democrm", "skilaxy"],
    spec: "D=320 мс; 0–100 квадрат 28×28 SF→AC, E0; 100–320 путь (7,14)→(12,20)→(22,8) открывается 0→100%, E0, штрих 3 px BG.",
    hold: 1100,
    async play(c) {
      const m = mac(c, { x: WIN.x, y: 18, w: WIN.w, h: 234, title: "DemoCRM — Монтаж" });
      const p = m.win;
      tx(c, p, "left:20px;top:38px;font-size:15px;font-weight:700", "Чек-лист монтажа");
      tx(c, p, `left:20px;top:58px;font-size:12px;color:${SUB}`, "Заказ №1042 · Орлова Н.");
      const items = [["Замер подтверждён", true], ["Профиль закреплён", true], ["Полотно натянуто", false], ["Светильники установлены", false]];
      let tgt;
      items.forEach((it, i) => {
        const y = 84 + i * 36;
        const b = c.el("div", `position:absolute;left:20px;top:${y}px;width:28px;height:28px;box-sizing:border-box;border-radius:8px;background:var(--sf);box-shadow:inset 0 0 0 2px var(--mu)`, p);
        const fill = c.el("div", `position:absolute;inset:0;border-radius:8px;background:var(--ac);opacity:${it[1] ? 1 : 0}`, b);
        const sv = c.svg("0 0 28 28", "", b);
        const path = c.sv(sv, "path", { d: "M7 14 L12 20 L22 8", style: `fill:none;stroke:var(--bg);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:24;stroke-dashoffset:${it[1] ? 0 : 24}` });
        tx(c, p, `left:60px;top:${y}px;line-height:28px;font-size:14px;font-weight:600;opacity:${it[1] ? 0.55 : 1}`, it[0]);
        if (i === 2) tgt = { fill, path };
      });
      const T = { x: WIN.x + 34, y: 18 + 84 + 72 + 14 };
      await approach(c, { x: 330, y: 232 }, T);
      await c.a(tgt.fill, [{ opacity: 0 }, { opacity: 1 }], { duration: 100, easing: c.E.E0 });
      await c.a(tgt.path, [{ strokeDashoffset: 24 }, { strokeDashoffset: 0 }], { duration: 220, easing: c.E.E0 });
    },
  });

  /* =====================================================================
     WI — ОКНА И ПАНЕЛИ
     ===================================================================== */

  SKD.add({
    code: "WI-01", group: "ui", ru: "Открытие macOS",
    what: "Окно CRM с титульной полосой всплывает из глубины.",
    when: "Рабочий стол с понятной рамкой macOS.",
    fam: ["F01", "F12"], proj: ["democrm", "skilaxy", "ecs"],
    spec: "D=420 мс, E2; окно y+28→0, s0.96→1, α0→1; полоса 32 px, круги ⌀10 на (16,16)/(34,16)/(52,16).",
    hold: 1200,
    async play(c) {
      const m = crmApp(c, { x: 30, y: 14, w: 420, h: 242, tb: 32, css: "opacity:0" });
      await c.a(m.win, [{ transform: "translateY(28px) scale(.96)", opacity: 0 }, { transform: "translateY(0px) scale(1)", opacity: 1 }], { duration: 420, easing: c.E.E2 });
    },
  });

  SKD.add({
    code: "WI-02", group: "ui", ru: "Боковая инспекция",
    what: "Справа выезжает карточка заказа, таблица заявок сужается.",
    when: "Редактирование заказа без смены экрана.",
    fam: ["F01"], proj: ["democrm"],
    spec: "D=360 мс, E2; инспектор 0.32w въезжает x 1.16w→0.84w, клип по окну; рабочая область w→0.68w, вёрстка готова заранее.",
    hold: 1200,
    async play(c) {
      const W = 420, H = 240, tb = 28, bh = H - tb;
      const m = mac(c, { x: 30, y: 15, w: W, h: H, title: "DemoCRM — Заказы" });
      const main = c.el("div", `position:absolute;left:0;top:0;width:${W}px;height:${bh}px;overflow:hidden;background:var(--sf)`, m.body);
      [["Клиент", "left:16px"], ["Сумма", "left:150px"], ["Статус", "left:220px"]].forEach((h) => tx(c, main, `${h[1]};top:0;line-height:30px;font-size:11px;font-weight:600;color:${SUB}`, h[0]));
      hl(c, main, "left:0;right:0;top:30px");
      [["Орлова Н.", 54800, "Замер"], ["Смирнов А.", 38200, "Новая"], ["Белов Д.", 46900, "Монтаж"], ["Громова Т.", 71500, "Замер"], ["Горстрой", 126000, "Оплата"]].forEach((r, i) => {
        const y = 31 + i * 35;
        if (i === 0) c.el("div", `position:absolute;left:0;right:0;top:${y}px;height:34px;background:${ACS}`, main);
        hl(c, main, `left:0;right:0;top:${y + 34}px`);
        tx(c, main, `left:16px;top:${y}px;line-height:34px;font-size:13px;font-weight:600`, r[0]);
        tx(c, main, `left:150px;top:${y}px;line-height:34px;font-size:13px`, rub(r[1]));
        c.el("div", `position:absolute;left:220px;top:${y + 7}px;width:62px;height:20px;border-radius:10px;font-size:11px;font-weight:600;line-height:20px;text-align:center;${i === 0 ? "background:var(--ac);color:#fff" : `background:${SK};color:var(--fg)`}`, main, r[2]);
      });
      const iw = 0.32 * W, ix = 0.68 * W;
      const insp = c.el("div", `position:absolute;left:${ix}px;top:0;width:${iw}px;height:${bh}px;box-sizing:border-box;background:${TINT};border-left:1px solid ${LN2};transform:translateX(${iw}px)`, m.body);
      tx(c, insp, "left:12px;top:12px;font-size:13px;font-weight:700", "Заказ №1042");
      [["Клиент", "Орлова Н."], ["Сумма", rub(54800)], ["Статус", ""], ["Бригада", "№2 · Соколов"]].forEach((f, i) => {
        const y = 40 + i * 42;
        tx(c, insp, `left:12px;top:${y}px;font-size:11px;font-weight:600;color:${SUB}`, f[0]);
        if (f[1]) tx(c, insp, `left:12px;top:${y + 16}px;font-size:13px;font-weight:600`, f[1]);
        else c.el("div", `position:absolute;left:12px;top:${y + 14}px;width:108px;height:24px;box-sizing:border-box;border-radius:6px;background:var(--sf);box-shadow:inset 0 0 0 1px ${LN2};padding-left:8px;line-height:24px;font-size:12px;font-weight:600`, insp, `Замер <span style="position:absolute;right:7px;top:0;color:${SUB};font-size:9px">▼</span>`);
      });
      await c.wait(600);
      await c.all(
        c.a(main, [{ width: W + "px" }, { width: ix + "px" }], { duration: 360, easing: c.E.E2 }),
        c.a(insp, [{ transform: `translateX(${iw}px)` }, { transform: "translateX(0px)" }], { duration: 360, easing: c.E.E2 }));
    },
  });

  SKD.add({
    code: "WI-03", group: "ui", ru: "Модальное решение",
    what: "Поверх окна CRM появляется небольшая форма подтверждения.",
    when: "Подтверждение или короткая форма.",
    fam: ["F01", "F12"], proj: ["democrm", "skilaxy", "ecs"],
    spec: "D=300 мс; затемнение α0→0.3 за 180 мс E0; модалка 0.6w×0.45h y+24→0, α0→1 за 300 мс E2; фон неподвижен.",
    hold: 1200,
    async play(c) {
      const W = 420, H = 242, tb = 28;
      const m = crmApp(c, { x: 30, y: 14, w: W, h: H });
      const bw = 0.6 * W, bhh = 0.45 * H;
      const dim = c.el("div", `position:absolute;left:0;right:0;top:${tb}px;bottom:0;background:#000;opacity:0;z-index:20`, m.win);
      const mod = c.el("div", `position:absolute;left:${(W - bw) / 2}px;top:${tb + (H - tb - bhh) / 2}px;width:${bw}px;height:${bhh}px;box-sizing:border-box;border-radius:12px;background:var(--sf);box-shadow:0 12px 32px rgba(0,0,0,.3),0 0 0 1px rgba(0,0,0,.08);opacity:0;z-index:30`, m.win);
      tx(c, mod, "left:16px;top:15px;font-size:14px;font-weight:700", "Передать заявку в монтаж?");
      tx(c, mod, `left:16px;top:39px;font-size:12px;color:${SUB}`, `Орлова Н. · ${rub(54800)}`);
      btn(c, mod, `right:${16 + 92 + 8}px;bottom:14px;width:84px;height:28px;font-size:12px`, "Отмена", "s");
      btn(c, mod, "right:16px;bottom:14px;width:92px;height:28px;font-size:12px", "Передать");
      await c.wait(600);
      await c.all(
        c.a(dim, [{ opacity: 0 }, { opacity: 0.3 }], { duration: 180, easing: c.E.E0 }),
        c.a(mod, [{ transform: "translateY(24px)", opacity: 0 }, { transform: "translateY(0px)", opacity: 1 }], { duration: 300, easing: c.E.E2 }));
    },
  });

  SKD.add({
    code: "WI-04", group: "ui", ru: "Смена вкладки",
    what: "Активная вкладка карточки клиента меняется, содержимое сдвигается на шаг.",
    when: "Два раздела одной карточки клиента.",
    fam: ["F01", "F12"], proj: ["democrm", "ecs"],
    spec: "D=280 мс; индикатор 80×3 A.x→B.x, E2; старая область x 0→−24, α→0 за 120 мс E1; новая с 100 мс x +24→0, α0→1, 180 мс E2.",
    hold: 1200,
    async play(c) {
      const m = mac(c, { x: 30, y: 15, w: 420, h: 240, title: "DemoCRM — Клиент" });
      const p = m.win;
      c.el("div", "position:absolute;left:20px;top:40px;width:40px;height:40px;border-radius:50%;background:var(--ac);color:#fff;display:grid;place-items:center;font-size:15px;font-weight:700", p, "ОН");
      tx(c, p, "left:72px;top:42px;font-size:15px;font-weight:700", "Орлова Наталья");
      tx(c, p, `left:72px;top:63px;font-size:12px;color:${SUB}`, "+7 920 314-52-08 · Нижний Новгород");
      const tabY = 90;
      const tA = tx(c, p, `left:20px;top:${tabY}px;width:80px;line-height:26px;text-align:center;font-size:13px;font-weight:700`, "Заказ");
      const tB = tx(c, p, `left:100px;top:${tabY}px;width:80px;line-height:26px;text-align:center;font-size:13px;font-weight:700;opacity:.45`, "Оплата");
      hl(c, p, `left:20px;right:20px;top:${tabY + 26}px`);
      const ind = c.el("div", `position:absolute;left:20px;top:${tabY + 24}px;width:80px;height:3px;border-radius:2px;background:var(--ac)`, p);
      const area = (rows) => {
        const a = c.el("div", `position:absolute;left:20px;top:${tabY + 38}px;width:380px;height:100px`, p);
        rows.forEach((r, i) => {
          hl(c, a, `left:0;right:0;top:${i * 33 + 32}px`);
          c.el("span", `position:absolute;left:0;top:${i * 33 + 8}px;color:${r[2] ? "var(--ac)" : SUB}`, a, ico(r[2] ? "chk" : "doc", 16, 1.7));
          tx(c, a, `left:26px;top:${i * 33}px;line-height:32px;font-size:13px;font-weight:600`, r[0]);
          tx(c, a, `right:0;top:${i * 33}px;line-height:32px;font-size:13px;color:${r[2] ? "var(--ac)" : "var(--fg)"};font-weight:600`, r[1]);
        });
        return a;
      };
      const aOld = area([["Потолок матовый, 22 м²", rub(18400)], ["Светильники GX53 ×6", rub(8400)], ["Монтаж 24 октября", rub(11100)]]);
      const aNew = area([["Предоплата получена", rub(30000), true], ["Остаток при сдаче", rub(24800)], ["Счёт №1042 отправлен", "сегодня"]]);
      aNew.style.opacity = "0";
      await c.wait(700);
      await c.all(
        c.a(ind, [{ transform: "translateX(0px)" }, { transform: "translateX(80px)" }], { duration: 280, easing: c.E.E2 }),
        c.a(aOld, [{ transform: "translateX(0px)", opacity: 1 }, { transform: "translateX(-24px)", opacity: 0 }], { duration: 120, easing: c.E.E1 }),
        c.a(aNew, [{ transform: "translateX(24px)", opacity: 0 }, { transform: "translateX(0px)", opacity: 1 }], { duration: 180, delay: 100, easing: c.E.E2, fill: "both" }),
        c.a(tA, [{ opacity: 1 }, { opacity: 0.45 }], { duration: 280, easing: c.E.E2 }),
        c.a(tB, [{ opacity: 0.45 }, { opacity: 1 }], { duration: 280, easing: c.E.E2 }));
    },
  });

  SKD.add({
    code: "WI-05", group: "ui", ru: "Карточка раскрывается",
    what: "Выбранная заявка вырастает из списка в большую панель с подробностями.",
    when: "Связать запись списка с её подробностями.",
    fam: ["F01"], proj: ["democrm", "ecs"],
    spec: "D=500 мс, E2; прямоугольник карточки → базовая панель, радиус 20→12; детали α0→1 на 320–500 мс, E0.",
    hold: 1200,
    async play(c) {
      const W = 420, H = 240, tb = 28;
      const m = mac(c, { x: 30, y: 15, w: W, h: H, title: "DemoCRM — Заявки" });
      m.body.style.background = TINT;
      const data = [["Орлова Н.", 54800, "Замер · 22 октября"], ["Смирнов А.", 38200, "Новая · сегодня"], ["Белов Д.", 46900, "Монтаж · 24 октября"],
        ["Громова Т.", 71500, "Замер · 23 октября"], ["Горстрой", 126000, "Оплата · ждём"], ["Попов И.", 33400, "Монтаж · 25 октября"]];
      const cw = 124, ch = 86, gx = 12;
      const cardCss = `position:absolute;box-sizing:border-box;background:var(--sf);box-shadow:0 0 0 1px rgba(0,0,0,.07),0 2px 6px rgba(0,0,0,.06);overflow:hidden`;
      const head = (el, d) => {
        tx(c, el, "left:14px;top:14px;font-size:13px;font-weight:700", d[0]);
        tx(c, el, `left:14px;top:34px;font-size:12px;color:${SUB}`, rub(d[1]));
        tx(c, el, `left:14px;top:54px;font-size:11px;color:${SUB}`, d[2]);
      };
      data.forEach((d, i) => {
        const el = c.el("div", `${cardCss};left:${gx + (i % 3) * (cw + gx)}px;top:${12 + Math.floor(i / 3) * (ch + 12)}px;width:${cw}px;height:${ch}px;border-radius:20px`, m.body);
        head(el, d);
      });
      const sx = gx + (cw + gx), sy = 12;
      const ex = c.el("div", `${cardCss};left:${sx}px;top:${sy}px;width:${cw}px;height:${ch}px;border-radius:20px;z-index:20`, m.body);
      head(ex, data[0]);
      const det = c.el("div", "position:absolute;left:0;top:0;right:0;bottom:0;opacity:0", ex);
      [["Площадь", "22 м²"], ["Бригада", "№2 · Соколов"], ["Замер", "22 окт, 10:00"], ["Монтаж", "24 окт"]].forEach((f, i) => {
        const x = 14 + (i % 2) * 150, y = 84 + Math.floor(i / 2) * 44;
        tx(c, det, `left:${x}px;top:${y}px;font-size:11px;font-weight:600;color:${SUB}`, f[0]);
        tx(c, det, `left:${x}px;top:${y + 16}px;font-size:14px;font-weight:600`, f[1]);
      });
      btn(c, det, "right:14px;bottom:14px;width:128px;height:30px;font-size:12px", "Открыть заказ");
      await c.wait(700);
      await c.all(
        c.a(ex, [{ left: sx + "px", top: sy + "px", width: cw + "px", height: ch + "px", borderRadius: "20px" }, { left: "12px", top: "12px", width: W - 24 + "px", height: H - tb - 24 + "px", borderRadius: "12px" }], { duration: 500, easing: c.E.E2 }),
        c.a(det, [{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 320, easing: c.E.E0, fill: "both" }));
    },
  });

  SKD.add({
    code: "WI-06", group: "ui", ru: "Стопка окон",
    what: "Три окна — замеры, смета, монтаж — раскладываются из одной точки.",
    when: "Несколько этапов или инструментов в одном кадре.",
    fam: ["F01"], proj: ["democrm", "skilaxy"],
    spec: "D=620 мс; окно i старт 80i мс, 460 мс E2; центр B→B+(−48+48i, −24+24i), s0.94→1, α0→1; i=2 спереди.",
    hold: 1200,
    async play(c) {
      const Wd = 250, Hd = 160, tb = 24, B = { x: 240, y: 135 };
      const wins = [0, 1, 2].map((i) => {
        const o = { x: -48 + 48 * i, y: -24 + 24 * i };
        const m = mac(c, { x: B.x + o.x - Wd / 2, y: B.y + o.y - Hd / 2, w: Wd, h: Hd, tb, title: ["Замеры", "Смета", "Монтаж"][i], css: "opacity:0" });
        const p = m.body;
        if (i === 0) {
          [["10:00", "Орлова Н.", "ул. Белинского, 61"], ["13:30", "Смирнов А.", "пр. Гагарина, 41"], ["16:00", "Белов Д.", "ул. Минина, 14"]].forEach((r, j) => {
            c.el("div", `position:absolute;left:6px;top:${12 + j * 40}px;width:38px;height:20px;border-radius:6px;background:${ACS};color:var(--ac);font-size:11px;font-weight:700;line-height:20px;text-align:center`, p, r[0]);
            tx(c, p, `left:54px;top:${8 + j * 40}px;font-size:13px;font-weight:700`, r[1]);
            tx(c, p, `left:54px;top:${25 + j * 40}px;font-size:11px;color:${SUB}`, r[2]);
          });
        } else if (i === 1) {
          [["Полотно матовое", 18400], ["Светильники ×6", 8400], ["Монтаж и профиль", 11100]].forEach((r, j) => {
            hl(c, p, `left:14px;right:14px;top:${j * 31 + 34}px`);
            tx(c, p, `left:14px;top:${j * 31 + 3}px;line-height:31px;font-size:13px`, r[0]);
            tx(c, p, `right:14px;top:${j * 31 + 3}px;line-height:31px;font-size:13px;font-weight:600`, rub(r[1]));
          });
          tx(c, p, "left:14px;top:102px;line-height:26px;font-size:13px;font-weight:700", "Итого");
          tx(c, p, "right:14px;top:102px;line-height:26px;font-size:15px;font-weight:700;color:var(--ac)", rub(37900));
        } else {
          [["Замер подтверждён", 1], ["Профиль закреплён", 1], ["Полотно натянуто", 0]].forEach((r, j) => {
            c.el("div", `position:absolute;left:14px;top:${10 + j * 28}px;width:18px;height:18px;box-sizing:border-box;border-radius:5px;background:${r[1] ? "var(--ac)" : "var(--sf)"};box-shadow:${r[1] ? "none" : "inset 0 0 0 2px var(--mu)"};color:#fff;display:grid;place-items:center`, p, r[1] ? ico("chk", 13, 2.4) : "");
            tx(c, p, `left:42px;top:${10 + j * 28}px;line-height:18px;font-size:13px;font-weight:600`, r[0]);
          });
          sk(c, p, "left:14px;top:104px;width:222px;height:8px;border-radius:4px");
          c.el("div", "position:absolute;left:14px;top:104px;width:148px;height:8px;border-radius:4px;background:var(--ac)", p);
          tx(c, p, `left:14px;top:116px;font-size:11px;color:${SUB}`, "Готово 2 из 3");
        }
        return { m, o };
      });
      await c.all(...wins.map((w, i) => c.a(w.m.win, [
        { transform: `translate(${-w.o.x}px,${-w.o.y}px) scale(.94)`, opacity: 0 },
        { transform: "translate(0px,0px) scale(1)", opacity: 1 },
      ], { duration: 460, delay: 80 * i, easing: c.E.E2, fill: "both" })));
    },
  });

  SKD.add({
    code: "WI-07", group: "ui", ru: "Сравнение рядом",
    what: "Смета сжимается, рядом въезжает вторая такого же размера: «до» и «после».",
    when: "Сравнение «до / после» в одном масштабе.",
    fam: ["F01", "F12"], proj: ["democrm", "ecs"],
    spec: "D=440 мс, E1; панель w→(w−24)/2 с центром B.x−(w+24)/4; вторая B.x+w→B.x+(w+24)/4, α0→1; обе y=B.y.",
    hold: 1200,
    async play(c) {
      const W = 420, Hh = 200, gap = 24, fw = (W - gap) / 2, y = 35, x0 = 30;
      const mk = (x, title, sum, rows, after) => {
        const m = mac(c, { x, y, w: W, h: Hh, title, ta: "l", tb: 26 });
        const p = m.body;
        tx(c, p, `left:14px;top:12px;font-size:11px;font-weight:600;color:${SUB}`, "Итого");
        tx(c, p, `left:14px;top:28px;font-size:24px;font-weight:700;line-height:28px;${after ? "color:var(--ac)" : ""}`, rub(sum));
        rows.forEach((r, j) => {
          hl(c, p, `left:14px;right:14px;top:${j * 34 + 72}px`);
          tx(c, p, `left:14px;top:${j * 34 + 73}px;line-height:34px;font-size:13px`, r[0]);
          tx(c, p, `right:14px;top:${j * 34 + 73}px;line-height:34px;font-size:13px;font-weight:600;${after && r[2] ? "color:var(--ac)" : ""}`, rub(r[1]));
        });
        return m.win;
      };
      const a = mk(x0, "Смета · до", 84500, [["Полотно", 36800], ["Светильники", 21600], ["Монтаж", 26100]], false);
      const b = mk(x0 + fw + gap, "Смета · после", 79900, [["Полотно", 34900, 1], ["Светильники", 21600], ["Монтаж", 23400, 1]], true);
      b.style.width = fw + "px"; b.style.opacity = "0";
      const dx0 = (240 + W - fw / 2) - (x0 + fw + gap); // центр второй панели: B.x+w → B.x+(w+24)/4
      await c.wait(700);
      await c.all(
        c.a(a, [{ width: W + "px" }, { width: fw + "px" }], { duration: 440, easing: c.E.E1 }),
        c.a(b, [{ transform: `translateX(${dx0}px)`, opacity: 0 }, { transform: "translateX(0px)", opacity: 1 }], { duration: 440, easing: c.E.E1 }));
    },
  });

  SKD.add({
    code: "WI-08", group: "ui", ru: "Сворачивание в значок",
    what: "Окно CRM уменьшается и втягивается в значок в доке.",
    when: "Завершение задачи и возврат к обзору.",
    fam: ["F01"], proj: ["democrm", "skilaxy"],
    spec: "D=420 мс, E3; центр B→T, w→48, h→48, радиус 12→10; 300–420 окно α1→0, значок α0→1 (E0).",
    hold: 1200,
    async play(c) {
      const Wd = 320, Hd = 180, B = { x: 240, y: 108 }, T = { x: 240, y: 236 };
      const dock = c.el("div", `position:absolute;left:92px;top:206px;width:296px;height:60px;box-sizing:border-box;border-radius:18px;background:color-mix(in srgb,var(--sf) 72%,transparent);box-shadow:0 0 0 1px ${LN2},0 6px 18px rgba(0,0,0,.1);backdrop-filter:blur(10px)`);
      let appIcon;
      ["cal", "chart", null, "doc", "tune"].forEach((k, i) => {
        const x = 100 + i * 58;
        if (k) c.el("div", `position:absolute;left:${x}px;top:212px;width:48px;height:48px;border-radius:11px;background:${TINT};box-shadow:inset 0 0 0 1px ${LN};display:grid;place-items:center;color:${SUB}`, null, ico(k, 24, 1.4));
        else appIcon = c.el("div", `position:absolute;left:${x}px;top:212px;width:48px;height:48px;border-radius:11px;background:var(--ac);color:#fff;display:grid;place-items:center;font-size:25px;font-weight:700;opacity:0;z-index:2`, null, "Д");
      });
      const m = mac(c, { x: B.x - Wd / 2, y: B.y - Hd / 2, w: Wd, h: Hd, r: 12, title: "DemoCRM — Заявки", css: "z-index:5" });
      const win = m.win, inn = c.el("div", `position:absolute;left:0;top:0;width:${Wd}px;height:${Hd}px;transform-origin:0 0`);
      while (win.firstChild) inn.appendChild(win.firstChild);
      win.appendChild(inn);
      side(c, m.body, 84, 0);
      [["Орлова Н.", 54800], ["Смирнов А.", 38200], ["Белов Д.", 46900], ["Громова Т.", 71500]].forEach((r, i) => {
        const y = 8 + i * 35;
        hl(c, m.body, `left:96px;right:12px;top:${y + 34}px`);
        c.el("i", `position:absolute;left:96px;top:${y + 13}px;width:8px;height:8px;border-radius:50%;background:${i === 0 ? "var(--ac)" : "var(--mu)"}`, m.body);
        tx(c, m.body, `left:114px;top:${y}px;line-height:34px;font-size:13px;font-weight:600`, r[0]);
        tx(c, m.body, `right:12px;top:${y}px;line-height:34px;font-size:12px;color:${SUB}`, rub(r[1]));
      });
      await c.wait(700);
      await c.all(
        c.a(win, [{ left: win.style.left, top: win.style.top, width: Wd + "px", height: Hd + "px", borderRadius: "12px" },
          { left: T.x - 24 + "px", top: T.y - 24 + "px", width: "48px", height: "48px", borderRadius: "10px" }], { duration: 420, easing: c.E.E3 }),
        c.a(inn, [{ transform: "scale(1)" }, { transform: `scale(${48 / Wd})` }], { duration: 420, easing: c.E.E3 }),
        c.a(win, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: 300, easing: c.E.E0, fill: "both" }),
        c.a(appIcon, [{ opacity: 0 }, { opacity: 1 }], { duration: 120, delay: 300, easing: c.E.E0, fill: "both" }));
    },
  });
})();

;
/* Модуль 20: IN (кисть, тушь), JP (сёдзи, японская сцена), PP (бумага, сгиб, коллаж).
   Спецификации: research/ASTRA_TAXONOMY.md, разделы 2.15–2.17. Сцена 480×270, цвета только из переменных сцены. */
(function () {
  "use strict";
  /* ===================== общие помощники ===================== */
  let UID = 0;
  const uid = () => "ij" + ++UID;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const f1 = (v) => Math.round(v * 10) / 10;

  /* cubic-bezier решатель — чтобы покадровые сцены шли по тем же кривым E1–E4, что и WAAPI */
  function bez(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t;
    return (x) => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++) { const v = X(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return Y(t);
    };
  }
  const EF = { E0: (x) => x, E1: bez(0.33, 0, 0.67, 1), E2: bez(0.22, 1, 0.36, 1), E3: bez(0.4, 0, 1, 1), E4: bez(0.16, 1.25, 0.3, 1) };

  /* атрибут-обёртка: sv(c, parent, tag, attrs, css) */
  function sv(c, parent, tag, attrs, css) {
    const e = c.sv(parent, tag, attrs || {});
    if (css) e.setAttribute("style", css);
    return e;
  }
  /* слой SVG со своими defs */
  function layer(c, css, parent, vb) {
    const svg = c.svg(vb || "0 0 480 270", css || "", parent);
    const defs = c.sv(svg, "defs", {});
    return { svg, defs };
  }

  /* ---- фильтры ---- */
  /* неровный край: цепочка смещений по шуму (низкая частота — «дрожь», высокая — шероховатость) */
  function fRough(c, defs, stages) {
    const id = uid();
    const f = c.sv(defs, "filter", { id, filterUnits: "userSpaceOnUse", x: -40, y: -40, width: 560, height: 350, "color-interpolation-filters": "sRGB" });
    let src = "SourceGraphic";
    stages.forEach((s, i) => {
      c.sv(f, "feTurbulence", { type: "fractalNoise", baseFrequency: s.f, numOctaves: s.oct || 2, seed: s.seed || 3 + i, result: "t" + i });
      c.sv(f, "feDisplacementMap", { in: src, in2: "t" + i, scale: s.s, xChannelSelector: "R", yChannelSelector: "G", result: "d" + i });
      src = "d" + i;
    });
    return id;
  }
  function fBlur(c, defs, sd, pad) {
    const id = uid(), p = pad || 60;
    const f = c.sv(defs, "filter", { id, filterUnits: "userSpaceOnUse", x: -p, y: -p, width: 480 + 2 * p, height: 270 + 2 * p, "color-interpolation-filters": "sRGB" });
    const b = c.sv(f, "feGaussianBlur", { stdDeviation: sd });
    return { id, node: b };
  }
  /* зернистая фактура бумаги: слой SVG-прямоугольника с шумом цвета fill; a — прозрачность слоя */
  function grain(c, parent, o) {
    o = Object.assign({ x: 0, y: 0, w: 480, h: 270, a: 0.5, f: 0.9, seed: 5, fill: "var(--fg)", blend: "multiply", k: 1.15, b: -0.52, oct: 3, z: "" }, o || {});
    const { svg, defs } = layer(c, "pointer-events:none;" + o.z, parent, o.vb);
    const id = uid();
    const fl = c.sv(defs, "filter", { id, filterUnits: "userSpaceOnUse", x: o.x, y: o.y, width: o.w, height: o.h, "color-interpolation-filters": "sRGB" });
    c.sv(fl, "feTurbulence", { type: "fractalNoise", baseFrequency: o.f, numOctaves: o.oct, seed: o.seed, result: "n" });
    c.sv(fl, "feColorMatrix", { in: "n", type: "matrix", values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${o.k} 0 0 0 ${o.b}`, result: "m" });
    sv(c, fl, "feFlood", { result: "fl" }, `flood-color:${o.fill}`);
    c.sv(fl, "feComposite", { in: "fl", in2: "m", operator: "in" });
    sv(c, svg, "rect", { x: o.x, y: o.y, width: o.w, height: o.h, filter: `url(#${id})` }, `opacity:${o.a};mix-blend-mode:${o.blend}`);
    return svg;
  }
  /* бумажные волокна: вытянутый шум */
  function fibers(c, parent, o) {
    return grain(c, parent, Object.assign({ f: "0.012 0.55", a: 0.5, seed: 8, oct: 2, k: 1.6, b: -0.7 }, o || {}));
  }

  /* ---- геометрия кисти ---- */
  /* равномерная по длине выборка кривой fn(t) → массив точек с нормалями */
  function resample(fn, n) {
    const raw = []; let L = 0, prev = null; const m = 600;
    for (let i = 0; i <= m; i++) { const p = fn(i / m); if (prev) L += Math.hypot(p.x - prev.x, p.y - prev.y); raw.push({ x: p.x, y: p.y, L }); prev = p; }
    const out = []; let j = 0;
    for (let i = 0; i <= n; i++) {
      const tg = (L * i) / n;
      while (j < raw.length - 2 && raw[j + 1].L < tg) j++;
      const a = raw[j], b = raw[j + 1], r = (tg - a.L) / (b.L - a.L || 1);
      out.push({ x: a.x + (b.x - a.x) * r, y: a.y + (b.y - a.y) * r, u: i / n });
    }
    for (let i = 0; i < out.length; i++) {
      const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      out[i].tx = dx / l; out[i].ty = dy / l; out[i].nx = -dy / l; out[i].ny = dx / l;
    }
    out.len = L;
    return out;
  }
  function at(pts, u) {
    const n = pts.length - 1, f = clamp(u) * n, i = Math.min(n - 1, Math.floor(f)), r = f - i, p = pts[i], q = pts[i + 1];
    return { x: p.x + (q.x - p.x) * r, y: p.y + (q.y - p.y) * r, nx: p.nx + (q.nx - p.nx) * r, ny: p.ny + (q.ny - p.ny) * r, tx: p.tx + (q.tx - p.tx) * r, ty: p.ty + (q.ty - p.ty) * r };
  }
  /* многоугольник-полоса вдоль pts между долями поперечника a..b (−.5…+.5), u от u0 до u1; cap — скруглённый конец */
  function band(pts, wf, u0, u1, a, b, cap) {
    if (u1 <= u0 + 1e-4) return "";
    const n = pts.length - 1, us = [u0];
    for (let i = Math.floor(u0 * n) + 1; i < u1 * n - 1e-6; i++) us.push(i / n);
    us.push(u1);
    const L = [], R = [];
    us.forEach((u) => { const p = at(pts, u), w = wf(u); L.push([p.x + p.nx * w * b, p.y + p.ny * w * b]); R.push([p.x + p.nx * w * a, p.y + p.ny * w * a]); });
    let d = "M" + L.map((p) => f1(p[0]) + " " + f1(p[1])).join("L");
    if (cap) { const r = (wf(u1) * (b - a)) / 2; const e = R[R.length - 1]; d += `A${f1(r)} ${f1(r)} 0 0 0 ${f1(e[0])} ${f1(e[1])}`; }
    else d += "L" + R[R.length - 1].map(f1).join(" ");
    d += "L" + R.slice(0, -1).reverse().map((p) => f1(p[0]) + " " + f1(p[1])).join("L") + "Z";
    return d;
  }
  /* линия вдоль pts со смещением доли поперечника off, u от u0 до u1 */
  function trace(pts, wf, u0, u1, off) {
    const n = pts.length - 1, us = [u0];
    for (let i = Math.floor(u0 * n) + 1; i < u1 * n - 1e-6; i++) us.push(i / n);
    us.push(u1);
    return "M" + us.map((u) => { const p = at(pts, u), w = wf(u); return f1(p.x + p.nx * w * off) + " " + f1(p.y + p.ny * w * off); }).join("L");
  }
  const bz3 = (P, t) => { const s = 1 - t; return { x: s * s * s * P[0].x + 3 * s * s * t * P[1].x + 3 * s * t * t * P[2].x + t * t * t * P[3].x, y: s * s * s * P[0].y + 3 * s * s * t * P[1].y + 3 * s * t * t * P[2].y + t * t * t * P[3].y }; };

  /* гладкий замкнутый контур по вершинам: квадратичные сегменты через середины рёбер */
  function blobPath(P) {
    const n = P.length, mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const m0 = mid(P[n - 1], P[0]);
    let d = `M${f1(m0[0])} ${f1(m0[1])}`;
    for (let i = 0; i < n; i++) { const m = mid(P[i], P[(i + 1) % n]); d += `Q${f1(P[i][0])} ${f1(P[i][1])} ${f1(m[0])} ${f1(m[1])}`; }
    return d + "Z";
  }
  /* прорисовка набора путей по общей длине: returns {set(p)} */
  function drawer(paths) {
    const lens = paths.map((p) => p.getTotalLength()), total = lens.reduce((a, b) => a + b, 0);
    paths.forEach((p, i) => { p.style.strokeDasharray = lens[i] + " " + (lens[i] + 2); p.style.strokeDashoffset = lens[i] + 1; });
    return {
      total,
      set(p) {
        let L = p * total;
        paths.forEach((el, i) => { const k = clamp(L, 0, lens[i]); L -= lens[i]; el.style.strokeDashoffset = k <= 0 ? lens[i] + 1 : lens[i] - k; });
      },
    };
  }
  /* ===================== IN — кисть, тушь, рисование ===================== */
  const IN_FAM = ["F04", "F10"], IN_PROJ = ["serial", "arseniy"];
  const T65 = { x: 312, y: 121.5 };                 // T = (65%W, 45%H)
  const inBase = (c) => { grain(c, null, { a: 0.5, seed: 5 }); fibers(c, null, { a: 0.1 }); return layer(c); };
  /* светлая крупа поверх туши: «бумага просвечивает» α≈0.08 */
  const inTop = (c) => grain(c, null, { fill: "var(--bg)", blend: "normal", a: 1, k: 0.9, b: -0.39, seed: 21, f: 0.9 });

  /* дуга IN: (20%W,55%H) → (50%W,25%H) → (75%W,50%H) */
  function arcPts(n) {
    const P0 = { x: 96, y: 148.5 }, P1 = { x: 240, y: 67.5 }, P2 = { x: 360, y: 135 };
    const C = { x: 2 * P1.x - 0.5 * (P0.x + P2.x), y: 2 * P1.y - 0.5 * (P0.y + P2.y) };
    return resample((t) => { const s = 1 - t; return { x: s * s * P0.x + 2 * s * t * C.x + t * t * P2.x, y: s * s * P0.y + 2 * s * t * C.y + t * t * P2.y }; }, n);
  }

  /* IN-01 Один мазок */
  SKD.add({
    code: "IN-01", group: "ink", ru: "Один мазок",
    what: "Кисть ведёт дугу: след растёт от тонкого начала к широкому телу.",
    when: "Тушь, заглавный жест, ветка или волна",
    fam: IN_FAM, proj: IN_PROJ, hold: 1200,
    spec: "D=900 мс, E0; путь открывается 0→100%; ширина 3+17·sin(πu) px; заливка FG; края гладкие, фактура бумаги α 0.08.",
    async play(c) {
      const { svg, defs } = inBase(c);
      const pts = arcPts(200), wf = (u) => 3 + 17 * Math.sin(Math.PI * u);
      const rid = fRough(c, defs, [{ f: 0.03, s: 4.5, seed: 4 }, { f: 0.5, s: 1.5, seed: 11 }]);
      const bl = fBlur(c, defs, 2.6);
      const bleed = sv(c, svg, "path", { filter: `url(#${bl.id})` }, "fill:var(--fg);opacity:.2");
      const g = sv(c, svg, "g", { filter: `url(#${rid})` });
      const body = sv(c, g, "path", {}, "fill:var(--fg)");
      const hair = [[-0.3, 0.55, 0.93], [-0.14, 0.62, 0.97], [0.12, 0.5, 0.9], [0.3, 0.7, 0.98]].map(([o, u0, u1]) => ({ o, u0, u1, el: sv(c, g, "path", { fill: "none" }, "stroke:var(--bg);stroke-width:.9;stroke-linecap:round;opacity:.5") }));
      const dots = [0.4, 0.47, 0.54, 0.61, 0.69, 0.77].map((u, i) => {
        const side = i % 2 ? 1 : -1, p = at(pts, u), gap = wf(u) / 2 + 6 + c.rnd() * 14, r = 1.1 + c.rnd() * 2.1;
        return { u, r, el: sv(c, g, "circle", { cx: f1(p.x + p.nx * gap * side), cy: f1(p.y + p.ny * gap * side), r }, "fill:var(--fg)") };
      });
      inTop(c);
      await c.tick(900, (t, p) => {
        const u = EF.E0(p), d = band(pts, wf, 0, Math.max(u, 0.002), -0.5, 0.5, true);
        body.setAttribute("d", d); bleed.setAttribute("d", d);
        hair.forEach((h) => h.el.setAttribute("d", u > h.u0 + 0.01 ? trace(pts, wf, h.u0, Math.min(u, h.u1), h.o) : ""));
        dots.forEach((s) => s.el.setAttribute("r", f1(s.r * seg(u, s.u, s.u + 0.06))));
      });
    },
  });

  /* IN-02 Сухая кисть */
  SKD.add({
    code: "IN-02", group: "ink", ru: "Сухая кисть",
    what: "Широкий мазок идёт слева направо и оставляет продольные просветы бумаги.",
    when: "Печатный плакат и шероховатый акцент",
    fam: IN_FAM, proj: IN_PROJ, hold: 1200,
    spec: "D=700 мс, E2; маска открывает слева 0→100%; след 32 px; 5 продольных пустот 1/2/1/3/1 px на долях 0.15/0.3/0.5/0.7/0.85, занимают 70% длины от u=0.15.",
    async play(c) {
      const { svg, defs } = inBase(c);
      const P = [{ x: 46, y: 160 }, { x: 170, y: 120 }, { x: 300, y: 172 }, { x: 436, y: 126 }];
      const pts = resample((t) => bz3(P, t), 240), W = 32, wf = () => W;
      const rid = fRough(c, defs, [{ f: 0.035, s: 3.2, seed: 6 }, { f: 0.42, s: 2.1, seed: 13 }]);
      /* просветы: маска из чёрных линий по долям поперечника */
      const mid = uid();
      const m = c.sv(defs, "mask", { id: mid, maskUnits: "userSpaceOnUse", x: -40, y: -40, width: 560, height: 350 });
      sv(c, m, "rect", { x: -40, y: -40, width: 560, height: 350 }, "fill:#fff");
      const gapG = sv(c, m, "g", { filter: `url(#${fRough(c, defs, [{ f: 0.25, s: 1.6, seed: 8 }])})` });
      [[0.15, 1], [0.3, 2], [0.5, 1], [0.7, 3], [0.85, 1]].forEach(([f, w]) => sv(c, gapG, "path", { d: trace(pts, wf, 0.15, 0.85, f - 0.5), fill: "none" }, `stroke:#000;stroke-width:${w};stroke-linecap:round`));
      /* градиент для «сухих» хвостов: больше просветов к правому краю */
      const gid = uid();
      const lg = c.sv(defs, "linearGradient", { id: gid, gradientUnits: "userSpaceOnUse", x1: 80, y1: 0, x2: 440, y2: 0 });
      c.sv(lg, "stop", { offset: 0, "stop-color": "#000" }); c.sv(lg, "stop", { offset: 1, "stop-color": "#fff" });
      const sm = uid();
      const m2 = c.sv(defs, "mask", { id: sm, maskUnits: "userSpaceOnUse", x: -40, y: -40, width: 560, height: 350 });
      sv(c, m2, "rect", { x: -40, y: -40, width: 560, height: 350 }, `fill:url(#${gid})`);
      /* штриховая текстура: вытянутый вдоль мазка шум, выбивает волокна */
      const sid = uid();
      const sf = c.sv(defs, "filter", { id: sid, filterUnits: "userSpaceOnUse", x: 0, y: 0, width: 480, height: 270, "color-interpolation-filters": "sRGB" });
      c.sv(sf, "feTurbulence", { type: "fractalNoise", baseFrequency: "0.018 0.42", numOctaves: 2, seed: 19, result: "n" });
      c.sv(sf, "feColorMatrix", { in: "n", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  5 0 0 0 -2.75", result: "a" });
      sv(c, sf, "feFlood", { result: "fl" }, "flood-color:var(--bg)");
      c.sv(sf, "feComposite", { in: "fl", in2: "a", operator: "in" });
      const cid = uid();
      const cp = c.sv(defs, "clipPath", { id: cid });
      const cr = c.sv(cp, "rect", { x: -40, y: 0, width: 0, height: 270 });
      const clipG = sv(c, svg, "g", { "clip-path": `url(#${cid})` });
      const rg = sv(c, clipG, "g", { filter: `url(#${rid})` });
      const mg = sv(c, rg, "g", { mask: `url(#${mid})` });
      const edges = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1], ends = [1, 0.965, 0.995, 0.94, 1, 0.975];
      for (let i = 0; i < 6; i++) sv(c, mg, "path", { d: band(pts, wf, 0, ends[i], edges[i] - 0.5, edges[i + 1] - 0.5, false) }, "fill:var(--fg)");
      const dry = sv(c, mg, "g", { mask: `url(#${sm})` });
      sv(c, dry, "rect", { x: 0, y: 0, width: 480, height: 270, filter: `url(#${sid})` });
      inTop(c);
      await c.tick(700, (t, p) => { cr.setAttribute("width", f1(lerp(46, 462, EF.E2(p)) + 40)); });
    },
  });

  /* IN-03 Карандашный контур */
  function fPencil(c, defs) {
    const id = uid();
    const f = c.sv(defs, "filter", { id, filterUnits: "userSpaceOnUse", x: -20, y: -20, width: 520, height: 310, "color-interpolation-filters": "sRGB" });
    c.sv(f, "feTurbulence", { type: "fractalNoise", baseFrequency: 0.07, numOctaves: 2, seed: 5, result: "w" });
    c.sv(f, "feDisplacementMap", { in: "SourceGraphic", in2: "w", scale: 2.6, xChannelSelector: "R", yChannelSelector: "G", result: "d" });
    c.sv(f, "feTurbulence", { type: "fractalNoise", baseFrequency: 1.1, numOctaves: 2, seed: 9, result: "n" });
    c.sv(f, "feColorMatrix", { in: "n", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.4 0 0 0 -0.3", result: "m" });
    c.sv(f, "feComposite", { in: "d", in2: "m", operator: "in" });
    return id;
  }
  SKD.add({
    code: "IN-03", group: "ink", ru: "Карандашный контур",
    what: "Контур лампочки прорисовывается без скачков, рядом идёт бледный второй след.",
    when: "Скетч и учебный рисунок",
    fam: IN_FAM, proj: IN_PROJ, hold: 1200,
    spec: "D=1200 мс, E0; длина контура 0→100%; штрих FG 2 px, α 0.8; второй след сдвинут (1,1) px, α 0.15, открывается синхронно.",
    async play(c) {
      const { svg, defs } = inBase(c);
      const pid = fPencil(c, defs);
      /* направляющие: осевая и отметки */
      sv(c, svg, "path", { d: "M240 18V252M232 252h16", fill: "none" }, "stroke:var(--mu);stroke-width:1;stroke-dasharray:5 5;opacity:.5");
      const D = [
        "M208 168C208 152 178 140 178 108C178 72 205 48 240 48C275 48 302 72 302 108C302 140 272 152 272 168",
        "M208 168L210 182H270L272 168M210 182L212 199H268L270 182M212 199L214 215H266L268 199M224 215Q240 233 256 215",
        "M226 182L228 142C228 124 239 124 240 140C241 124 252 124 252 142L254 182M232 134q4-9 8 0q4-9 8 0",
        "M194 98C196 80 208 66 223 59",
        ...Array.from({ length: 9 }, (_, i) => { const a = (-180 + i * 22.5) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a); return `M${f1(240 + ca * 80)} ${f1(108 + sa * 80)}L${f1(240 + ca * 98)} ${f1(108 + sa * 98)}`; }),
      ];
      const mkG = (css, tr) => { const g = sv(c, svg, "g", { filter: `url(#${pid})`, transform: tr || "" }, css); return D.map((d) => sv(c, g, "path", { d, fill: "none" }, "stroke:var(--fg);stroke-width:2;stroke-linecap:round;stroke-linejoin:round")); };
      const ghost = drawer(mkG("opacity:.15", "translate(1 1)")), main = drawer(mkG("opacity:.8"));
      inTop(c);
      await c.tick(1200, (t, p) => { const u = EF.E0(p); main.set(u); ghost.set(u); });
    },
  });

  /* IN-04 Пятно туши */
  const R4 = [70, 82, 74, 88, 72, 80, 68, 86, 76, 84, 70, 78];
  function inkGrad(c, defs) {
    const id = uid();
    const g = c.sv(defs, "radialGradient", { id, cx: 0.5, cy: 0.5, r: 0.55 });
    sv(c, g, "stop", { offset: 0, "stop-opacity": 0.82 }, "stop-color:var(--fg)");
    sv(c, g, "stop", { offset: 0.72, "stop-opacity": 0.9 }, "stop-color:var(--fg)");
    sv(c, g, "stop", { offset: 1, "stop-opacity": 0.97 }, "stop-color:var(--fg)");
    return id;
  }
  /* радиус пятна на угле deg (линейно между вершинами) */
  const rAtAng = (R, deg) => { const f = (((deg % 360) + 360) % 360) / 30, i = Math.floor(f) % 12; return lerp(R[i], R[(i + 1) % 12], f - Math.floor(f)); };
  /* острые «брызги» из края наружу: подпути, сливаются с пятном фильтром */
  function spikes(cx, cy, R, rr, list, grow) {
    return list.map(([a, L, w]) => {
      const A = (a * Math.PI) / 180, r0 = rr(rAtAng(R, a)) - 3, r1 = r0 + 3 + L * grow, ca = Math.cos(A), sa = Math.sin(A), nx = -sa, ny = ca;
      return `M${f1(cx + ca * r0 + nx * w)} ${f1(cy + sa * r0 + ny * w)}L${f1(cx + ca * r1)} ${f1(cy + sa * r1)}L${f1(cx + ca * r0 - nx * w)} ${f1(cy - 0 + sa * r0 - ny * w)}Z`;
    }).join("");
  }
  const SPK = [[8, 16, 4], [47, 10, 3], [95, 20, 4.5], [128, 12, 3], [161, 18, 4], [205, 14, 3.5], [232, 22, 4.5], [278, 11, 3], [322, 17, 4]];
  SKD.add({
    code: "IN-04", group: "ink", ru: "Пятно туши",
    what: "Капля расползается в неровное плоское пятно, у краёв летят брызги.",
    when: "Появление иллюстративного пятна на бумаге",
    fam: IN_FAM, proj: IN_PROJ, hold: 1300,
    spec: "D=1100 мс, E2; 12 вершин вокруг T под 30°·i, радиусы 70/82/74/88/72/80/68/86/76/84/70/78 px, старт 4 px; FG α 0.9; контур — квадратичные сегменты через середины рёбер.",
    async play(c) {
      const { svg, defs } = inBase(c);
      const rid = fRough(c, defs, [{ f: 0.02, s: 15, seed: 7 }, { f: 0.085, s: 8, seed: 3 }, { f: 0.33, s: 2.6, seed: 15 }]);
      const gid = inkGrad(c, defs);
      const g = sv(c, svg, "g", { filter: `url(#${rid})` });
      const blot = sv(c, g, "path", {}, `fill:url(#${gid})`);
      const rim = sv(c, g, "path", { fill: "none" }, "stroke:var(--fg);stroke-width:2;opacity:.35;stroke-linejoin:round");
      const sat = [[14, 104, 3.6], [62, 112, 2.2], [118, 106, 3], [176, 112, 2], [214, 108, 3.4], [262, 104, 2.2], [306, 110, 2.8], [346, 106, 1.8]].map(([a, d, r]) => ({ a: a * Math.PI / 180, d, r, el: sv(c, g, "circle", { r: 0 }, "fill:var(--fg);opacity:.9") }));
      inTop(c);
      await c.tick(1100, (t, p) => {
        const e = EF.E2(p), P = R4.map((R, i) => { const a = (i * 30) * Math.PI / 180, r = 4 + (R - 4) * e; return [T65.x + Math.cos(a) * r, T65.y + Math.sin(a) * r]; });
        const d = blobPath(P), sp = spikes(T65.x, T65.y, R4, (R) => 4 + (R - 4) * e, SPK, seg(p, 0.08, 0.6));
        blot.setAttribute("d", d + sp); rim.setAttribute("d", d);
        sat.forEach((s) => { const r = lerp(8, s.d, e); s.el.setAttribute("cx", f1(T65.x + Math.cos(s.a) * r)); s.el.setAttribute("cy", f1(T65.y + Math.sin(s.a) * r)); s.el.setAttribute("r", f1(s.r * seg(p, 0.12, 0.4))); });
      });
    },
  });

  /* IN-05 Растекание края */
  const R5 = [60, 68, 58, 72, 62, 70, 56, 72, 64, 68, 58, 66];
  SKD.add({
    code: "IN-05", group: "ink", ru: "Растекание края",
    what: "Готовое пятно медленно выпускает мягкий ореол, сама форма не меняется.",
    when: "Тушь на впитывающей бумаге",
    fam: IN_FAM, proj: IN_PROJ, hold: 1200,
    spec: "D=1600 мс, E1; копия маски пятна расширяется на 0→12 px, blur 0→8 px, α 0→0.18; исходная форма и насыщенность не меняются.",
    async play(c) {
      const { svg, defs } = inBase(c);
      const C0 = { x: 240, y: 135 };
      const P = R5.map((R, i) => { const a = (i * 30 + 10) * Math.PI / 180; return [C0.x + Math.cos(a) * R, C0.y + Math.sin(a) * R]; });
      const d = blobPath(P) + spikes(C0.x, C0.y, R5.map((_, i) => R5[(i + 11) % 12]), (R) => R, [[20, 12, 3.5], [74, 9, 3], [131, 14, 4], [190, 10, 3], [244, 15, 4], [301, 9, 3], [338, 13, 3.5]], 1);
      const rid = fRough(c, defs, [{ f: 0.02, s: 13, seed: 9 }, { f: 0.085, s: 7, seed: 5 }, { f: 0.33, s: 2.4, seed: 17 }]);
      const gid = inkGrad(c, defs);
      /* ореол: расширенная копия + размытие + волокнистая неровность */
      const hid = uid();
      const hf = c.sv(defs, "filter", { id: hid, filterUnits: "userSpaceOnUse", x: -40, y: -40, width: 560, height: 350, "color-interpolation-filters": "sRGB" });
      c.sv(hf, "feTurbulence", { type: "fractalNoise", baseFrequency: 0.1, numOctaves: 2, seed: 4, result: "t" });
      const hd = c.sv(hf, "feDisplacementMap", { in: "SourceGraphic", in2: "t", scale: 0, xChannelSelector: "R", yChannelSelector: "G", result: "d" });
      const hb = c.sv(hf, "feGaussianBlur", { stdDeviation: 0 });
      const halo = sv(c, svg, "g", { filter: `url(#${hid})` }, "opacity:0");
      const hp = sv(c, halo, "path", { d, fill: "none" }, "fill:var(--fg);stroke:var(--fg);stroke-linejoin:round;stroke-width:0");
      /* капилляры: тонкие волоски от края наружу */
      const fib = Array.from({ length: 44 }, (_, i) => {
        const a = (i / 44) * Math.PI * 2 + c.rnd() * 0.1, R = lerp(R5[Math.floor(i / 44 * 12)], R5[(Math.floor(i / 44 * 12) + 1) % 12], (i / 44 * 12) % 1) + 2, L = 4 + c.rnd() * 12;
        return { a, R, L, el: sv(c, svg, "path", { fill: "none" }, "stroke:var(--fg);stroke-width:.8;stroke-linecap:round;opacity:0") };
      });
      const g = sv(c, svg, "g", { filter: `url(#${rid})` });
      sv(c, g, "path", { d }, `fill:url(#${gid})`);
      sv(c, g, "path", { d, fill: "none" }, "stroke:var(--fg);stroke-width:2;opacity:.3");
      inTop(c);
      await c.wait(250);
      await c.tick(1600, (t, p) => {
        const e = EF.E1(p);
        hp.style.strokeWidth = f1(24 * e);                     // расширение 0→12 px
        hb.setAttribute("stdDeviation", f1(8 * e)); hd.setAttribute("scale", f1(9 * e));
        halo.style.opacity = f1(0.18 * e);
        fib.forEach((h) => { const r0 = h.R, r1 = h.R + h.L * e; h.el.setAttribute("d", `M${f1(C0.x + Math.cos(h.a) * r0)} ${f1(C0.y + Math.sin(h.a) * r0)}L${f1(C0.x + Math.cos(h.a) * r1)} ${f1(C0.y + Math.sin(h.a) * r1)}`); h.el.style.opacity = f1(0.28 * e); });
      });
    },
  });

  /* IN-06 Акварельная заливка */
  SKD.add({
    code: "IN-06", group: "ink", ru: "Акварельная заливка",
    what: "Цвет проявляется внутри готового контура хурмы пятнами разной плотности.",
    when: "Акварельный фон или предмет",
    fam: IN_FAM, proj: IN_PROJ, hold: 1200,
    spec: "D=1400 мс, E1; заливка AC α 0→0.32; три круга r 60/100/80 в (0.25w,0.4h)/(0.6w,0.6h)/(0.8w,0.3h), blur 24, α 0→0.08; клип по контуру.",
    async play(c) {
      const { svg, defs } = inBase(c);
      /* хурма: коробка w=210, h=168 */
      const bx = 135, by = 70, bw = 210, bh = 168, X = (x) => bx + x * bw, Y = (y) => by + y * bh;
      const pt = (x, y) => `${f1(X(x))} ${f1(Y(y))}`;
      const d = `M${pt(0.5, 0.07)}C${pt(0.34, 0)} ${pt(0.1, 0.1)} ${pt(0.03, 0.4)}C${pt(-0.03, 0.66)} ${pt(0.12, 1)} ${pt(0.5, 0.99)}C${pt(0.88, 1)} ${pt(1.03, 0.66)} ${pt(0.97, 0.4)}C${pt(0.9, 0.1)} ${pt(0.66, 0)} ${pt(0.5, 0.07)}Z`;
      const cid = uid(), cp = c.sv(defs, "clipPath", { id: cid }); c.sv(cp, "path", { d });
      const rid = fRough(c, defs, [{ f: 0.04, s: 3, seed: 5 }]);
      const bl = fBlur(c, defs, 24, 120), eb = fBlur(c, defs, 1.6);
      const wash = sv(c, svg, "g", { "clip-path": `url(#${cid})` });
      const base = sv(c, wash, "path", { d }, "fill:var(--ac);opacity:0");
      const edge = sv(c, wash, "g", { filter: `url(#${eb.id})` });
      const edgeP = sv(c, edge, "path", { d, fill: "none" }, "stroke:var(--ac);stroke-width:8;opacity:0");
      const blobs = [[0.25, 0.4, 60], [0.6, 0.6, 100], [0.8, 0.3, 80]].map(([fx, fy, r], i) => sv(c, sv(c, wash, "g", { filter: `url(#${bl.id})` }), "circle", { cx: f1(X(fx)), cy: f1(Y(fy)), r }, `fill:${i === 1 ? "color-mix(in srgb,var(--ac) 55%,var(--fg))" : "var(--ac)"};opacity:0`));
      grain(c, wash, { fill: "var(--fg)", a: 0.5, f: 0.55, k: 1.3, b: -0.58, seed: 12 });
      /* блик остаётся бумагой */
      sv(c, wash, "path", { d: `M${pt(0.17, 0.36)}C${pt(0.12, 0.52)} ${pt(0.16, 0.7)} ${pt(0.26, 0.82)}`, fill: "none" }, "stroke:var(--sf);stroke-width:7;stroke-linecap:round;opacity:.55");
      /* контур, чашелистик и черенок: готовы с начала */
      const pen = sv(c, svg, "g", { filter: `url(#${rid})` });
      sv(c, pen, "path", { d, fill: "none" }, "stroke:var(--fg);stroke-width:2.2;stroke-linejoin:round");
      const cx = X(0.5), cy = Y(0.07);
      [[-44, 6], [-26, -12], [26, -12], [44, 6], [0, 20]].forEach(([dx, dy]) => {
        const mx = dx / 2, my = dy / 2, nx = -dy * 0.28, ny = dx * 0.28;
        sv(c, pen, "path", { d: `M${f1(cx)} ${f1(cy)}Q${f1(cx + mx + nx)} ${f1(cy + my + ny)} ${f1(cx + dx)} ${f1(cy + dy)}Q${f1(cx + mx - nx)} ${f1(cy + my - ny)} ${f1(cx)} ${f1(cy)}Z`, fill: "none" }, "stroke:var(--fg);stroke-width:1.8;stroke-linejoin:round");
      });
      sv(c, pen, "path", { d: `M${f1(cx)} ${f1(cy)}C${f1(cx + 1)} ${f1(cy - 10)} ${f1(cx + 4)} ${f1(cy - 20)} ${f1(cx + 10)} ${f1(cy - 26)}`, fill: "none" }, "stroke:var(--fg);stroke-width:3;stroke-linecap:round");
      inTop(c);
      await c.tick(1400, (t, p) => {
        const e = EF.E1(p);
        base.style.opacity = f1(0.32 * e); edgeP.style.opacity = f1(0.3 * e);
        blobs.forEach((b) => (b.style.opacity = f1(0.08 * e)));
      });
    },
  });

  /* IN-07 Стирание ластиком */
  SKD.add({
    code: "IN-07", group: "ink", ru: "Стирание ластиком",
    what: "Ластик проходит по нарисованной линии и стирает её кусок, остальное не трогает.",
    when: "Исправление решения или изменение рисунка",
    fam: IN_FAM, proj: IN_PROJ, hold: 1300,
    spec: "D=600 мс, E0; вычитающая маска 48×80 px идёт A→B и оставляет объединённый очищенный след; вне следа линия неизменна; ластик — отдельный предмет.",
    async play(c) {
      grain(c, null, { a: 0.5, seed: 5 }); fibers(c, null, { a: 0.1 });
      const { svg, defs } = layer(c);
      /* тетрадная сетка */
      sv(c, svg, "path", { d: Array.from({ length: 12 }, (_, i) => `M0 ${30 + i * 20}H480`).join(""), fill: "none" }, "stroke:var(--mu);stroke-width:1;opacity:.2");
      const A = { x: 130, y: 135 }, B = { x: 350, y: 135 };
      const mid = uid(), m = c.sv(defs, "mask", { id: mid, maskUnits: "userSpaceOnUse", x: -40, y: -40, width: 560, height: 350 });
      sv(c, m, "rect", { x: -40, y: -40, width: 560, height: 350 }, "fill:#fff");
      const cut = sv(c, m, "rect", { x: A.x - 24, y: A.y - 40, width: 0, height: 80 }, "fill:#000");
      const rid = fRough(c, defs, [{ f: 0.03, s: 3, seed: 3 }, { f: 0.4, s: 1.4, seed: 10 }]);
      /* линия-график от руки */
      const pts = [];
      for (let x = 34; x <= 446; x += 6) pts.push([x, 134 + 28 * Math.sin((x - 34) / 40) * (0.8 + 0.2 * Math.sin((x - 34) / 97)) - 3.5 * Math.sin((x - 34) / 13)]);
      const lineD = "M" + pts.map((p) => f1(p[0]) + " " + f1(p[1])).join("L");
      const lg = sv(c, svg, "g", { mask: `url(#${mid})` });
      const lr = sv(c, lg, "g", { filter: `url(#${rid})` });
      sv(c, lr, "path", { d: lineD, fill: "none" }, "stroke:var(--fg);stroke-width:4.2;stroke-linecap:round;stroke-linejoin:round");
      sv(c, lr, "path", { d: "M34 212H446", fill: "none" }, "stroke:var(--fg);stroke-width:2.4;stroke-linecap:round;opacity:.0");
      /* крошки резины */
      const crumbs = [[-6, 30, 6, -14], [20, 38, 7, 5], [64, 27, 5, 12], [110, 40, 7, -4], [150, 31, 6, 9]].map(([dx, dy, w, rot], i) => ({ x: A.x + dx + 20 * i, w, rot, y: A.y + (i % 2 ? 36 : -38), el: sv(c, svg, "rect", { width: w, height: 2.6, rx: 1.3 }, "fill:var(--mu);opacity:0") }));
      /* сам ластик */
      const er = c.el("div", "position:absolute;left:-24px;top:-40px;width:48px;height:80px;z-index:50;will-change:transform");
      er.innerHTML = '<div style="position:absolute;inset:0;border-radius:6px;background:var(--sf);box-shadow:0 1px 0 rgba(0,0,0,.1),0 10px 18px rgba(0,0,0,.2)"></div>' +
        '<div style="position:absolute;left:0;right:0;top:20px;height:36px;background:var(--ac);box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)"></div>' +
        '<div style="position:absolute;left:5px;right:5px;top:30px;height:2px;background:var(--sf);opacity:.55"></div><div style="position:absolute;left:5px;right:5px;top:44px;height:2px;background:var(--sf);opacity:.55"></div>' +
        '<div style="position:absolute;inset:0;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.18)"></div>';
      inTop(c);
      await c.tick(600, (t, p) => {
        const x = lerp(A.x, B.x, EF.E0(p));
        cut.setAttribute("width", f1(x - A.x + 48));
        er.style.transform = `translate(${f1(x)}px,${f1(A.y + 3 * Math.sin(p * 20))}px) rotate(${f1(-7 + 3 * Math.sin(p * 11))}deg)`;
        crumbs.forEach((k) => { const q = seg(x, k.x, k.x + 40); k.el.setAttribute("x", f1(k.x)); k.el.setAttribute("y", f1(k.y + q * 8)); k.el.setAttribute("transform", `rotate(${k.rot} ${f1(k.x)} ${f1(k.y)})`); k.el.style.opacity = f1(0.85 * Math.min(1, q * 5)); });
      });
    },
  });

  /* IN-08 Штриховка области */
  SKD.add({
    code: "IN-08", group: "ink", ru: "Штриховка области",
    what: "Параллельные штрихи один за другим заполняют форму, как тень на гравюре.",
    when: "Тень на линогравюре или карандашной схеме",
    fam: IN_FAM, proj: IN_PROJ, hold: 1300,
    spec: "D=80n мс (n=12 → 960), E0; штрихи под −35°, шаг 12 px, FG 2 px, клип по форме; каждая линия за 80 мс со стартом 80·i.",
    async play(c) {
      const { svg, defs } = inBase(c);
      const n = 12, cx = 240, cy = 144;
      const ap = `M${cx} ${cy - 40}C${cx - 14} ${cy - 62} ${cx - 50} ${cy - 62} ${cx - 64} ${cy - 36}C${cx - 78} ${cy - 8} ${cx - 66} ${cy + 36} ${cx - 42} ${cy + 56}C${cx - 28} ${cy + 66} ${cx - 12} ${cy + 62} ${cx} ${cy + 54}C${cx + 12} ${cy + 62} ${cx + 28} ${cy + 66} ${cx + 42} ${cy + 56}C${cx + 66} ${cy + 36} ${cx + 78} ${cy - 8} ${cx + 64} ${cy - 36}C${cx + 50} ${cy - 62} ${cx + 14} ${cy - 62} ${cx} ${cy - 40}Z`;
      const sc = `translate(${cx} ${cy}) scale(0.9) translate(${-cx} ${-cy})`;
      const cid = uid(), cp = c.sv(defs, "clipPath", { id: cid }); c.sv(cp, "path", { d: ap, transform: sc });
      const rid = fRough(c, defs, [{ f: 0.05, s: 1.6, seed: 4 }, { f: 0.5, s: 0.9, seed: 12 }]);
      const pen = sv(c, svg, "g", { filter: `url(#${rid})` });
      const penA = sv(c, pen, "g", { transform: sc });
      sv(c, penA, "path", { d: ap, fill: "none" }, "stroke:var(--fg);stroke-width:2.4;stroke-linejoin:round");
      sv(c, penA, "path", { d: `M${cx} ${cy - 40}C${cx + 1} ${cy - 56} ${cx + 8} ${cy - 70} ${cx + 18} ${cy - 78}`, fill: "none" }, "stroke:var(--fg);stroke-width:3;stroke-linecap:round");
      sv(c, penA, "path", { d: `M${cx + 10} ${cy - 66}C${cx + 24} ${cy - 84} ${cx + 48} ${cy - 84} ${cx + 62} ${cy - 74}C${cx + 52} ${cy - 54} ${cx + 28} ${cy - 54} ${cx + 10} ${cy - 66}Z`, fill: "none" }, "stroke:var(--fg);stroke-width:2");
      sv(c, svg, "ellipse", { cx, cy: cy + 74, rx: 84, ry: 7 }, "fill:var(--fg);opacity:.1");
      const hg = sv(c, svg, "g", { "clip-path": `url(#${cid})`, filter: `url(#${rid})` });
      const ang = (-35 * Math.PI) / 180, dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
      const lines = Array.from({ length: n }, (_, i) => {
        const o = (i - (n - 1) / 2) * 12, px = cx + nx * o, py = cy + 4 + ny * o, j = (c.rnd() - 0.5) * 8, L = 110, bow = (c.rnd() - 0.5) * 3;
        const x0 = px - dx * (L + j), y0 = py - dy * (L + j), x1 = px + dx * (L - j), y1 = py + dy * (L - j);
        return sv(c, hg, "path", { d: `M${f1(x0)} ${f1(y0)}Q${f1(px + nx * bow)} ${f1(py + ny * bow)} ${f1(x1)} ${f1(y1)}`, fill: "none" }, "stroke:var(--fg);stroke-width:2;stroke-linecap:round");
      });
      const dr = drawer(lines);
      inTop(c);
      const D = 80 * n;
      await c.tick(D, (t) => lines.forEach((el, i) => { const q = clamp((t - 80 * i) / 80); el.style.strokeDashoffset = f1(lerp(parseFloat(el.style.strokeDasharray), 0, q)); }));
    },
  });
  /* ===================== JP — сёдзи и японская сцена ===================== */
  const JP_FAM = ["F04"], JP_PROJ = ["serial"];
  const WOOD = "color-mix(in srgb,var(--fg) 86%,var(--ac) 14%)";
  const WOOD2 = "color-mix(in srgb,var(--fg) 70%,var(--ac) 14%)";
  const PETAL = "color-mix(in srgb,var(--ac) 22%,var(--sf))";
  const jpBase = (c) => { grain(c, null, { a: 0.4, seed: 5 }); return layer(c); };

  /* решётка сёдзи: стойки 8 px, шаг 120 px; тонкие рейки и нижняя панель; тень на бумагу */
  function lattice(c, parent, w, h) {
    const g = sv(c, parent, "g", {}, "filter:drop-shadow(1.5px 3px 2.5px rgba(0,0,0,.28))");
    const xs = []; for (let x = 0; x < w - 8; x += 120) xs.push(x); xs.push(w - 8);
    const ys = [0, 118], plate = h - 38;
    const rows = [[8, 118], [126, plate]];
    const thin = sv(c, g, "g", {}, `fill:${WOOD};opacity:.62`);
    for (let i = 0; i < xs.length - 1; i++) rows.forEach(([a, b]) => sv(c, thin, "rect", { x: f1((xs[i] + 8 + xs[i + 1]) / 2 - 1.5), y: a, width: 3, height: b - a }));
    rows.forEach(([a, b]) => [1, 2].forEach((k) => sv(c, thin, "rect", { x: 0, y: f1(a + ((b - a) * k) / 3 - 1.5), width: w, height: 3 })));
    const th = sv(c, g, "g", {}, `fill:${WOOD}`), hi = sv(c, g, "g", {}, "fill:#fff;opacity:.14");
    xs.forEach((x) => { sv(c, th, "rect", { x, y: 0, width: 8, height: plate + 8 }); sv(c, hi, "rect", { x, y: 0, width: 1.4, height: plate + 8 }); });
    ys.concat([plate]).forEach((y) => { sv(c, th, "rect", { x: 0, y, width: w, height: 8 }); sv(c, hi, "rect", { x: 0, y, width: w, height: 1.4 }); });
    sv(c, g, "rect", { x: 0, y: plate + 8, width: w, height: h - plate - 8 }, `fill:${WOOD2}`);
    sv(c, g, "rect", { x: 6, y: plate + 14, width: w - 12, height: h - plate - 20, rx: 2, fill: "none" }, "stroke:#fff;stroke-opacity:.12;stroke-width:1.4");
    return g;
  }
  /* бумага: тёплый тон + волокна */
  function washi(c, parent, w, h, fillCss) {
    const { svg } = layer(c, "", parent, `0 0 ${w} ${h}`);
    sv(c, svg, "rect", { width: w, height: h }, `fill:${fillCss}`);
    return svg;
  }

  /* цветок сакуры: 5 лепестков */
  function flower(c, parent, x, y, s, mono) {
    const g = sv(c, parent, "g", { transform: `translate(${x} ${y}) scale(${s})` });
    for (let i = 0; i < 5; i++) {
      const a = ((i * 72 - 90) * Math.PI) / 180;
      sv(c, g, "circle", { cx: f1(Math.cos(a) * 5.4), cy: f1(Math.sin(a) * 5.4), r: 5.3 }, mono ? `fill:${mono}` : `fill:${PETAL};stroke:var(--ac);stroke-width:.7;stroke-opacity:.8`);
    }
    if (!mono) sv(c, g, "circle", { r: 2 }, "fill:var(--ac)");
    return g;
  }
  /* ветка сакуры; mono — один цвет (силуэт для тени) */
  function sakura(c, parent, o) {
    o = o || {};
    const g = sv(c, parent, "g", { transform: `translate(${o.x || 0} ${o.y || 0}) scale(${o.k || 1})` });
    const col = o.mono || "var(--fg)";
    [["M524 18C452 24 395 58 330 54", 7.5], ["M420 36C412 66 402 86 378 102", 4.2], ["M362 55C344 78 322 86 298 84", 3.4], ["M330 54C302 44 282 52 262 68", 3.4], ["M446 30C456 54 452 74 436 92", 3.8], ["M262 68C250 72 242 82 238 94", 2.6], ["M392 44C396 30 408 22 418 20", 2.6]]
      .forEach(([d, w]) => sv(c, g, "path", { d, fill: "none" }, `stroke:${col};stroke-width:${w};stroke-linecap:round`));
    [[392, 64, 1], [372, 88, 0.92], [342, 68, 1], [312, 84, 0.82], [290, 68, 1], [262, 66, 0.86], [440, 72, 1], [430, 94, 0.82], [410, 42, 0.92], [470, 28, 0.9], [240, 94, 0.8], [354, 50, 0.72], [304, 52, 0.66], [420, 20, 0.7]]
      .forEach(([x, y, s]) => flower(c, g, x, y, s, o.mono));
    return g;
  }

  /* пейзаж для сёдзи/свитка/веера: небо, солнце, Фудзи, дымка, озеро, сосны, ветка. Без фильтров — дёшево */
  function landscape(c, parent, defs, o) {
    o = o || {};
    const g = sv(c, parent, "g");
    const sky = uid(), sg = c.sv(defs, "linearGradient", { id: sky, x1: 0, y1: 0, x2: 0, y2: 1 });
    sv(c, sg, "stop", { offset: 0 }, "stop-color:var(--bg)"); sv(c, sg, "stop", { offset: 0.8 }, "stop-color:color-mix(in srgb,var(--ac) 14%,var(--bg))");
    sv(c, g, "rect", { x: -10, y: -10, width: 500, height: 290 }, `fill:url(#${sky})`);
    const glow = uid(), rg = c.sv(defs, "radialGradient", { id: glow });
    sv(c, rg, "stop", { offset: 0, "stop-opacity": 0.32 }, "stop-color:var(--ac)"); sv(c, rg, "stop", { offset: 1, "stop-opacity": 0 }, "stop-color:var(--ac)");
    sv(c, g, "circle", { cx: 352, cy: 100, r: 86 }, `fill:url(#${glow})`);
    sv(c, g, "circle", { cx: 352, cy: 100, r: 33 }, "fill:var(--ac)");
    /* далёкие хребты */
    sv(c, g, "path", { d: "M-10 190L30 160L64 176L108 140L150 172L196 150L240 176L300 146L350 174L404 142L450 168L490 150V230H-10Z" }, "fill:var(--mu);opacity:.34");
    /* Фудзи */
    sv(c, g, "path", { d: "M44 204C104 198 152 124 176 80L196 80C222 126 276 198 336 204Z" }, "fill:var(--mu);opacity:.78");
    sv(c, g, "path", { d: "M165 104C170 94 174 86 176 80L196 80C198 86 202 94 207 104C203 99 200 108 196 101C193 110 189 101 186 108C182 100 178 109 175 102C172 108 168 99 165 104Z" }, "fill:var(--sf)");
    /* дымка */
    const mist = uid(), mg = c.sv(defs, "linearGradient", { id: mist, x1: 0, y1: 0, x2: 0, y2: 1 });
    sv(c, mg, "stop", { offset: 0, "stop-opacity": 0 }, "stop-color:var(--bg)"); sv(c, mg, "stop", { offset: 0.55, "stop-opacity": 0.9 }, "stop-color:var(--bg)"); sv(c, mg, "stop", { offset: 1, "stop-opacity": 0 }, "stop-color:var(--bg)");
    sv(c, g, "rect", { x: -10, y: 168, width: 500, height: 44 }, `fill:url(#${mist})`);
    sv(c, g, "rect", { x: -10, y: 128, width: 330, height: 22 }, `fill:url(#${mist});opacity:.7`);
    /* озеро и отражение солнца */
    sv(c, g, "rect", { x: -10, y: 204, width: 500, height: 80 }, "fill:color-mix(in srgb,var(--mu) 22%,var(--bg))");
    [[352, 214, 60], [352, 224, 44], [352, 234, 30], [352, 245, 18]].forEach(([x, y, w]) => sv(c, g, "rect", { x: x - w / 2, y, width: w, height: 3.2, rx: 1.6 }, "fill:var(--ac);opacity:.55"));
    [[90, 222, 50], [180, 232, 70], [250, 218, 40], [420, 256, 60], [60, 252, 40], [150, 252, 54]].forEach(([x, y, w]) => sv(c, g, "rect", { x, y, width: w, height: 1.6, rx: 0.8 }, "fill:var(--mu);opacity:.5"));
    /* берег с соснами */
    sv(c, g, "path", { d: "M-10 280V206C26 198 74 214 112 238C132 250 150 266 170 280Z" }, "fill:var(--fg);opacity:.9");
    [[30, 204, 1], [58, 212, 0.8], [8, 222, 0.9]].forEach(([x, y, s]) => {
      sv(c, g, "rect", { x: x - 1.6 * s, y: y - 4, width: 3.2 * s, height: 16 * s }, "fill:var(--fg)");
      [0, 1, 2].forEach((i) => sv(c, g, "path", { d: `M${x - (20 - i * 4) * s} ${y - 2 - i * 14 * s}L${x} ${y - 20 * s - i * 14 * s}L${x + (20 - i * 4) * s} ${y - 2 - i * 14 * s}Z` }, "fill:var(--fg)"));
    });
    /* птицы */
    [[118, 62, 1], [138, 72, 0.8], [96, 78, 0.7]].forEach(([x, y, s]) => sv(c, g, "path", { d: `M${x - 8 * s} ${y}Q${x - 4 * s} ${y - 6 * s} ${x} ${y}Q${x + 4 * s} ${y - 6 * s} ${x + 8 * s} ${y}`, fill: "none" }, "stroke:var(--fg);stroke-width:1.5;stroke-linecap:round"));
    if (!o.noBranch) sakura(c, g, { x: 0, y: -4, k: 1 });
    return g;
  }

  /* ханко: красная печать 72×72, знак 山 выбит, 8% площади — потёртость */
  function hanko(c, defs, parent, cx, cy, size, tilt) {
    const mid = uid(), m = c.sv(defs, "mask", { id: mid, maskUnits: "userSpaceOnUse", x: -50, y: -50, width: 100, height: 100 });
    sv(c, m, "rect", { x: -50, y: -50, width: 100, height: 100 }, "fill:#fff");
    const ko = sv(c, m, "g", { filter: `url(#${fRough(c, defs, [{ f: 0.09, s: 1.7, seed: 3 }, { f: 0.5, s: 0.8, seed: 8 }])})` }, "fill:none;stroke:#000");
    sv(c, ko, "rect", { x: -29, y: -29, width: 58, height: 58 }, "stroke-width:2");
    sv(c, ko, "path", { d: "M0 -21V19M-16.5 -6V19M16.5 -6V19M-23 19H23" }, "stroke-width:6.4");
    const sp = sv(c, m, "g", {}, "fill:#000;stroke:none");
    for (let i = 0; i < 64; i++) {
      const x = (c.rnd() - 0.5) * 72, y = (c.rnd() - 0.5) * 72, r = 0.6 + c.rnd() * 1.1;
      sv(c, sp, "ellipse", { cx: f1(x), cy: f1(y), rx: f1(r * (1 + c.rnd())), ry: f1(r), transform: `rotate(${f1(c.rnd() * 180)} ${f1(x)} ${f1(y)})` });
    }
    [[-30, -14, 26, -6], [4, 30, 30, 20], [-10, 24, -2, 32]].forEach(([x1, y1, x2, y2]) => sv(c, sp, "path", { d: `M${x1} ${y1}L${x2} ${y2}`, fill: "none" }, "stroke:#000;stroke-width:.9;stroke-linecap:round"));
    const o = sv(c, parent, "g", {}, `transform-origin:${cx}px ${cy}px`);
    const g = sv(c, o, "g", { transform: `translate(${cx} ${cy}) rotate(${tilt || 0}) scale(${size / 72})` });
    sv(c, g, "rect", { x: -36, y: -36, width: 72, height: 72, rx: 3, mask: `url(#${mid})` }, "fill:var(--ac)");
    return o;
  }

  /* ---- JP-01 Раздвижные сёдзи ---- */
  SKD.add({
    code: "JP-01", group: "jp", ru: "Раздвижные сёдзи",
    what: "Две половины перегородки раздвигаются и открывают готовый пейзаж.",
    when: "Вход в новую сцену сериала",
    fam: JP_FAM, proj: JP_PROJ, hold: 1000,
    spec: "D=1200 мс, E1; панели W/2×H: левая x 0→−W/2, правая W/2→W; за ними готовый пейзаж; без fade. Решётка: стойки 8 px, шаг 120 px.",
    async play(c) {
      const { svg, defs } = layer(c);
      landscape(c, svg, defs);
      const mkPanel = (x, z) => {
        const d = c.el("div", `position:absolute;left:${x}px;top:0;width:240px;height:270px;overflow:hidden;z-index:${z};box-shadow:0 0 22px rgba(0,0,0,.28);will-change:transform`);
        washi(c, d, 240, 270, "var(--sf)");
        grain(c, d, { w: 240, h: 270, vb: "0 0 240 270", fill: "var(--mu)", a: 0.5, f: 0.6, seed: 9 });
        fibers(c, d, { w: 240, h: 270, vb: "0 0 240 270", fill: "var(--mu)", a: 0.12, seed: 4 });
        const s = c.svg("0 0 240 270", "", d); lattice(c, s, 240, 270);
        return d;
      };
      const L = mkPanel(0, 21), R = mkPanel(240, 20);
      await c.wait(350);
      await c.all(c.a(L, [{ transform: "translateX(0)" }, { transform: "translateX(-240px)" }], { duration: 1200, easing: c.E.E1 }), c.a(R, [{ transform: "translateX(0)" }, { transform: "translateX(240px)" }], { duration: 1200, easing: c.E.E1 }));
    },
  });

  /* ---- JP-02 Свет за бумагой ---- */
  SKD.add({
    code: "JP-02", group: "jp", ru: "Свет за бумагой",
    what: "Бумага перегородки теплеет изнутри и светлеет, тёмная решётка не двигается.",
    when: "Утро или появление человека за экраном",
    fam: JP_FAM, proj: JP_PROJ, hold: 1200,
    spec: "D=1800 мс, E1; бумага MU→SF; эллипс BG в (0.55W,0.4H), радиусы 0.3W/0.4H, α 0→0.35, blur 100 px; решётка неподвижна и непрозрачна.",
    async play(c) {
      const { svg, defs } = layer(c);
      sv(c, svg, "rect", { width: 480, height: 270 }, "fill:var(--mu)");
      const lit = sv(c, svg, "rect", { width: 480, height: 270 }, "fill:var(--sf);opacity:0");
      const bl = fBlur(c, defs, 50, 200);
      const gl = sv(c, svg, "g", { filter: `url(#${bl.id})` });
      const bgE = sv(c, gl, "ellipse", { cx: 264, cy: 108, rx: 144, ry: 108 }, "fill:var(--bg);opacity:0");
      const acE = sv(c, gl, "ellipse", { cx: 264, cy: 112, rx: 120, ry: 90 }, "fill:var(--ac);opacity:0");
      grain(c, null, { fill: "var(--mu)", a: 0.55, f: 0.6, seed: 9 });
      fibers(c, null, { fill: "var(--mu)", a: 0.12, seed: 4 });
      const s2 = layer(c); lattice(c, s2.svg, 480, 270);
      await c.tick(1800, (t, p) => {
        const e = EF.E1(p);
        lit.style.opacity = f1(e); bgE.style.opacity = f1(0.35 * e); acE.style.opacity = f1(0.11 * e);
      });
    },
  });

  /* ---- JP-03 Силуэт за сёдзи ---- */
  SKD.add({
    code: "JP-03", group: "jp", ru: "Силуэт за сёдзи",
    what: "Размытый силуэт путника проходит позади неподвижной перегородки.",
    when: "Показать присутствие, сохранив лицо скрытым",
    fam: JP_FAM, proj: JP_PROJ, hold: 1300,
    spec: "D=2400 мс, E0; силуэт высотой 0.6H, центр x −0.15W→1.15W, y 0.6H; α 0.35, blur 6; решётка над силуэтом; бумага отдельным слоем SF α 0.45.",
    async play(c) {
      const { svg, defs } = layer(c);
      sv(c, svg, "rect", { width: 480, height: 270 }, "fill:var(--sf)");
      const lg = uid(), rg = c.sv(defs, "radialGradient", { id: lg, cx: 0.5, cy: 0.45, r: 0.7 });
      sv(c, rg, "stop", { offset: 0, "stop-opacity": 0.0 }, "stop-color:var(--bg)"); sv(c, rg, "stop", { offset: 1, "stop-opacity": 0.85 }, "stop-color:var(--bg)");
      sv(c, svg, "rect", { width: 480, height: 270 }, `fill:url(#${lg})`);
      const bl = fBlur(c, defs, 4.2, 120);
      const fig = sv(c, svg, "g", { filter: `url(#${bl.id})` });
      const man = sv(c, fig, "g", {}, "opacity:.46");
      sv(c, man, "path", { d: "M-33 -52L0 -81L33 -52Q0 -59 -33 -52Z" }, "fill:var(--fg)");
      sv(c, man, "ellipse", { cx: 0, cy: -48, rx: 9, ry: 10 }, "fill:var(--fg)");
      sv(c, man, "path", { d: "M-17 -40C-22 -18 -26 22 -29 78L29 78C26 22 22 -18 17 -40Q0 -46 -17 -40Z" }, "fill:var(--fg)");
      sv(c, man, "path", { d: "M-16 -38C-34 -28 -39 -2 -31 16L-22 10C-25 -4 -21 -22 -13 -30Z" }, "fill:var(--fg)");
      sv(c, man, "path", { d: "M35 -62L31 82", fill: "none" }, "stroke:var(--fg);stroke-width:3.4;stroke-linecap:round");
      sv(c, man, "ellipse", { cx: -12, cy: 80, rx: 12, ry: 4 }, "fill:var(--fg)"); sv(c, man, "ellipse", { cx: 13, cy: 80, rx: 12, ry: 4 }, "fill:var(--fg)");
      const veil = sv(c, svg, "rect", { width: 480, height: 270 }, "fill:var(--sf);opacity:.45");
      grain(c, null, { fill: "var(--mu)", a: 0.45, f: 0.6, seed: 9 });
      fibers(c, null, { fill: "var(--mu)", a: 0.12, seed: 4 });
      const s2 = layer(c); lattice(c, s2.svg, 480, 270);
      await c.tick(2400, (t, p) => { fig.setAttribute("transform", `translate(${f1(lerp(-72, 552, EF.E0(p)))} 162)`); });
    },
  });

  /* ---- JP-04 Разворачивание свитка ---- */
  SKD.add({
    code: "JP-04", group: "jp", ru: "Разворачивание свитка",
    what: "Вертикальный свиток раскатывается вниз, нижняя планка тянет бумагу за собой.",
    when: "Легенда, карта или объясняющий рисунок",
    fam: JP_FAM, proj: JP_PROJ, hold: 1200,
    spec: "D=1400 мс, E2; ширина 0.6W, верх y=0.12H; маска 0→0.7H, нижняя планка 0.6W×16 px идёт за границей; иллюстрация неподвижна под маской.",
    async play(c) {
      const { svg, defs } = jpBase(c);
      const X0 = 96, W = 288, Y0 = 32.4, H = 189;
      const cid = uid(), cp = c.sv(defs, "clipPath", { id: cid }), cr = c.sv(cp, "rect", { x: X0 - 2, y: Y0, width: W + 4, height: 0 });
      const rod = uid(), rgd = c.sv(defs, "linearGradient", { id: rod, x1: 0, y1: 0, x2: 0, y2: 1 });
      sv(c, rgd, "stop", { offset: 0 }, "stop-color:color-mix(in srgb,var(--fg) 60%,var(--sf))"); sv(c, rgd, "stop", { offset: 0.45 }, `stop-color:${WOOD}`); sv(c, rgd, "stop", { offset: 1 }, "stop-color:color-mix(in srgb,var(--fg) 94%,var(--ac))");
      const sc = sv(c, svg, "g", {}, "filter:drop-shadow(0 8px 10px rgba(0,0,0,.2))");
      const paper = sv(c, sc, "g", { "clip-path": `url(#${cid})` });
      sv(c, paper, "rect", { x: X0, y: Y0, width: W, height: H + 40 }, "fill:color-mix(in srgb,var(--ac) 12%,var(--bg))");
      sv(c, paper, "rect", { x: X0, y: Y0, width: W, height: H + 40, fill: "none" }, "stroke:var(--ac);stroke-opacity:.35;stroke-width:1.5");
      const pw = W - 26, ph = H - 30;
      const pic = c.sv(paper, "svg", { x: X0 + 13, y: Y0 + 15, width: pw, height: ph, viewBox: "0 0 480 270", preserveAspectRatio: "xMidYMid slice" });
      landscape(c, pic, defs);
      sv(c, paper, "rect", { x: X0 + 13, y: Y0 + 15, width: pw, height: ph, fill: "none" }, "stroke:var(--fg);stroke-opacity:.7;stroke-width:1.6");
      hanko(c, defs, paper, X0 + W - 36, Y0 + H - 36, 22, -4);
      const sh = uid(), shg = c.sv(defs, "linearGradient", { id: sh, x1: 0, y1: 0, x2: 0, y2: 1 });
      sv(c, shg, "stop", { offset: 0, "stop-opacity": 0 }, "stop-color:#000"); sv(c, shg, "stop", { offset: 1, "stop-opacity": 0.18 }, "stop-color:#000");
      const shade = sv(c, sc, "rect", { x: X0, y: Y0, width: W, height: 14 }, `fill:url(#${sh})`);
      grain(c, null, { fill: "var(--mu)", a: 0.3, f: 0.6, seed: 9 });
      /* верхний вал и нижняя планка */
      const roller = (y, h) => {
        const g = sv(c, sc, "g");
        sv(c, g, "rect", { x: X0 - 8, y, width: W + 16, height: h, rx: h / 2 }, `fill:url(#${rod})`);
        sv(c, g, "rect", { x: X0 - 8, y, width: W + 16, height: 1.6, rx: 0.8 }, "fill:#fff;opacity:.28");
        sv(c, g, "circle", { cx: X0 - 8, cy: y + h / 2, r: h / 2 + 1 }, `fill:${WOOD}`); sv(c, g, "circle", { cx: X0 + W + 8, cy: y + h / 2, r: h / 2 + 1 }, `fill:${WOOD}`);
        return g;
      };
      sv(c, sc, "path", { d: `M${X0 + W / 2} 8L${X0 + W / 2 - 40} ${Y0 - 4}M${X0 + W / 2} 8L${X0 + W / 2 + 40} ${Y0 - 4}`, fill: "none" }, "stroke:var(--fg);stroke-width:1.4;opacity:.7");
      roller(Y0 - 6, 10);
      const bot = roller(Y0, 16);
      await c.wait(300);
      await c.tick(1400, (t, p) => {
        const h = H * EF.E2(p);
        cr.setAttribute("height", f1(h + 1));
        bot.setAttribute("transform", `translate(0 ${f1(h)})`);
        shade.setAttribute("y", f1(Y0 + Math.max(0, h - 14)));
        shade.setAttribute("height", f1(Math.min(14, h)));
      });
    },
  });

  /* ---- JP-05 Гравюрные волны ---- */
  function waveLayer(c, parent, o) {
    const { P, A, y0, x0, x1 } = o, n = Math.ceil((x1 - x0) / P) + 1;
    let d = `M${x0} ${y0}`;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * P, X = (k) => f1(x + k * P), Y = (k) => f1(y0 - k * A);
      d += `C${X(0.25)} ${Y(0)} ${X(0.45)} ${Y(0.35)} ${X(0.6)} ${Y(1)}C${X(0.66)} ${Y(1.14)} ${X(0.8)} ${Y(1.1)} ${X(0.83)} ${Y(0.9)}C${X(0.73)} ${Y(0.96)} ${X(0.67)} ${Y(0.8)} ${X(0.72)} ${Y(0.6)}C${X(0.82)} ${Y(0.34)} ${X(0.92)} ${Y(0.1)} ${X(1)} ${Y(0)}`;
    }
    d += `L${x0 + n * P} 300L${x0} 300Z`;
    const g = sv(c, parent, "g");
    sv(c, g, "path", { d }, `fill:${o.fill};stroke:var(--fg);stroke-width:${o.sw || 1.4};stroke-linejoin:round`);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * P;
      /* пена у гребня и линии течения под ним */
      [[0.86, 0.78, 2.6], [0.9, 0.62, 2], [0.8, 0.84, 1.7], [0.94, 0.5, 1.5]].forEach(([kx, ky, r]) => sv(c, g, "circle", { cx: f1(x + kx * P), cy: f1(y0 - ky * A), r: f1(r * (o.foam || 1)) }, "fill:var(--bg);opacity:.9"));
      sv(c, g, "path", { d: `M${f1(x + 0.62 * P)} ${f1(y0 - 0.72 * A)}C${f1(x + 0.7 * P)} ${f1(y0 - 0.5 * A)} ${f1(x + 0.8 * P)} ${f1(y0 - 0.3 * A)} ${f1(x + 0.94 * P)} ${f1(y0 - 0.12 * A)}`, fill: "none" }, "stroke:var(--bg);stroke-width:1.4;stroke-linecap:round;opacity:.7");
      sv(c, g, "path", { d: `M${f1(x + 0.3 * P)} ${f1(y0 - 0.12 * A)}C${f1(x + 0.4 * P)} ${f1(y0 - 0.24 * A)} ${f1(x + 0.5 * P)} ${f1(y0 - 0.46 * A)} ${f1(x + 0.58 * P)} ${f1(y0 - 0.7 * A)}`, fill: "none" }, "stroke:var(--bg);stroke-width:1.2;stroke-linecap:round;opacity:.45");
    }
    return g;
  }
  SKD.add({
    code: "JP-05", group: "jp", ru: "Гравюрные волны",
    what: "Три плоских слоя волн проходят с разной скоростью и в разные стороны.",
    when: "Укиё-э с морем или атмосферной вставкой",
    fam: JP_FAM, proj: JP_PROJ, hold: 1200,
    spec: "D=3000 мс, E0; задний слой x 0→−24 px, средний 0→+40, передний 0→−72; y фиксирован, запас краёв 80 px; контуры не деформируются, 1 проход.",
    async play(c) {
      const { svg, defs } = jpBase(c);
      const sky = uid(), sg = c.sv(defs, "linearGradient", { id: sky, x1: 0, y1: 0, x2: 0, y2: 1 });
      sv(c, sg, "stop", { offset: 0 }, "stop-color:var(--bg)"); sv(c, sg, "stop", { offset: 1 }, "stop-color:color-mix(in srgb,var(--ac) 12%,var(--bg))");
      sv(c, svg, "rect", { width: 480, height: 270 }, `fill:url(#${sky})`);
      sv(c, svg, "circle", { cx: 368, cy: 92, r: 34 }, "fill:var(--ac)");
      [[70, 50, 96], [112, 66, 62], [300, 38, 70], [326, 54, 44]].forEach(([x, y, w]) => sv(c, svg, "rect", { x, y, width: w, height: 6, rx: 3 }, "fill:var(--mu);opacity:.4"));
      const mk = (o) => waveLayer(c, svg, Object.assign({ x0: -160, x1: 640 }, o));
      const back = mk({ P: 96, A: 22, y0: 152, fill: "color-mix(in srgb,var(--mu) 45%,var(--bg))", sw: 1.2 });
      const mid = mk({ P: 132, A: 34, y0: 196, fill: "var(--mu)", sw: 1.4, foam: 1.15 });
      const front = mk({ P: 172, A: 46, y0: 244, fill: "var(--fg)", sw: 1.4, foam: 1.3 });
      grain(c, null, { fill: "var(--bg)", blend: "normal", a: 1, k: 0.85, b: -0.37, seed: 21, f: 0.9 });
      await c.tick(3000, (t, p) => {
        const e = EF.E0(p);
        back.setAttribute("transform", `translate(${f1(-24 * e)} 0)`); mid.setAttribute("transform", `translate(${f1(40 * e)} 0)`); front.setAttribute("transform", `translate(${f1(-72 * e)} 0)`);
      });
    },
  });

  /* ---- JP-06 Красная печать ---- */
  SKD.add({
    code: "JP-06", group: "jp", ru: "Красная печать",
    what: "Мазок-подпись высыхает, и рядом ложится красная печать-ханко со знаком 山.",
    when: "Завершение главы или подпись автора",
    fam: JP_FAM, proj: JP_PROJ, hold: 1300,
    spec: "D=320 мс; метка 72×72 px в T: 0–100 мс s 1.15→1, α 0→1, E2; 100–320 мс удержание E0; цвет AC, маска потёртости 8% площади; знак 山 выбит.",
    async play(c) {
      const { svg, defs } = jpBase(c);
      /* лист васи */
      const rid = fRough(c, defs, [{ f: 0.02, s: 4, seed: 3 }, { f: 0.3, s: 1.3, seed: 6 }]);
      sv(c, svg, "rect", { x: 34, y: 22, width: 412, height: 226, rx: 2 }, "fill:var(--sf);filter:url(#" + rid + ") drop-shadow(0 8px 14px rgba(0,0,0,.14))");
      grain(c, null, { x: 34, y: 22, w: 412, h: 226, fill: "var(--mu)", a: 0.5, f: 0.6, seed: 9 });
      /* ансо: открытый круг кистью */
      const ens = layer(c), E = ens.svg, ed = ens.defs;
      const pts = resample((t) => { const a = lerp(-0.9, 5.05, t); return { x: 196 + Math.cos(a) * (50 + 5 * t), y: 138 + Math.sin(a) * (50 - 3 * t) }; }, 220);
      const wf = (u) => 3.5 + 12 * Math.sin(Math.PI * Math.pow(u, 0.75)) * (1 - 0.3 * u);
      const eg = sv(c, E, "g", { filter: `url(#${fRough(c, ed, [{ f: 0.03, s: 3.4, seed: 4 }, { f: 0.5, s: 1.4, seed: 11 }])})` });
      const body = sv(c, eg, "path", {}, "fill:var(--fg)");
      const st = hanko(c, ed, E, T65.x, T65.y, 72, -3);
      st.style.opacity = 0;
      grain(c, null, { fill: "var(--bg)", blend: "normal", a: 1, k: 0.85, b: -0.37, seed: 21, f: 0.9 });
      await c.tick(800, (t, p) => body.setAttribute("d", band(pts, wf, 0, Math.max(0.003, EF.E1(p)), -0.5, 0.5, true)));
      await c.wait(180);
      /* оттиск: 0–100 мс s 1.15→1, α 0→1 E2; 100–320 удержание */
      await c.a(st, [{ transform: "scale(1.15)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 100, easing: c.E.E2 });
      await c.wait(220);
    },
  });

  /* ---- JP-07 Складной веер ---- */
  SKD.add({
    code: "JP-07", group: "jp", ru: "Складной веер",
    what: "Пять секторов раскрываются из общего шарнира, рисунок закреплён на каждом.",
    when: "Иллюстративный переход внутри японской серии",
    fam: JP_FAM, proj: JP_PROJ, hold: 1200,
    spec: "D=900 мс, E2; сектор i=0…4 шириной 20° из 0° приходит в −40°+20°·i вокруг шарнира T; снизу вверх по i; рисунок закреплён на каждом. Радиус уменьшен под кадр 480×270.",
    async play(c) {
      const { svg, defs } = jpBase(c);
      const Px = 240, Py = 246, R = 196, r0 = 24;
      const dir = (a) => [Math.sin((a * Math.PI) / 180), -Math.cos((a * Math.PI) / 180)];
      const pt = (r, a) => { const v = dir(a); return `${f1(Px + v[0] * r)} ${f1(Py + v[1] * r)}`; };
      const sector = (a0, a1) => `M${pt(r0, a0)}L${pt(R, a0)}A${R} ${R} 0 0 1 ${pt(R, a1)}L${pt(r0, a1)}A${r0} ${r0} 0 0 0 ${pt(r0, a0)}Z`;
      const wrap = sv(c, svg, "g", {}, "filter:drop-shadow(0 8px 10px rgba(0,0,0,.2))");
      /* рукоять */
      sv(c, wrap, "path", { d: `M${Px - 6} ${Py + 6}L${Px - 5} ${Py + 40}Q${Px} ${Py + 46} ${Px + 5} ${Py + 40}L${Px + 6} ${Py + 6}Z` }, `fill:${WOOD}`);
      const blades = [0, 1, 2, 3, 4].map((i) => {
        const th = -40 + 20 * i, a0 = th - 10, a1 = th + 10;
        const g = sv(c, wrap, "g", {}, `transform-origin:${Px}px ${Py}px`);
        const cid = uid(), cp = c.sv(defs, "clipPath", { id: cid }); c.sv(cp, "path", { d: sector(a0, a1) });
        const cg = sv(c, g, "g", { "clip-path": `url(#${cid})` });
        sv(c, cg, "path", { d: sector(a0 - 1, a1 + 1) }, "fill:var(--sf)");
        const pic = c.sv(cg, "svg", { x: Px - 160, y: Py - R, width: 320, height: R + 8, viewBox: "0 0 480 270", preserveAspectRatio: "xMidYMid slice" });
        landscape(c, pic, defs);
        sv(c, cg, "path", { d: sector(a0, a1), fill: "none" }, "stroke:var(--fg);stroke-width:1.2;stroke-opacity:.55");
        sv(c, g, "path", { d: `M${pt(r0, a0)}L${pt(R + 4, a0)}`, fill: "none" }, `stroke:${WOOD};stroke-width:${i === 0 ? 5 : 1.6};stroke-linecap:round`);
        if (i === 4) sv(c, g, "path", { d: `M${pt(r0, a1)}L${pt(R + 4, a1)}`, fill: "none" }, `stroke:${WOOD};stroke-width:5;stroke-linecap:round`);
        sv(c, g, "path", { d: `M${pt(R, a0)}A${R} ${R} 0 0 1 ${pt(R, a1)}`, fill: "none" }, `stroke:${WOOD};stroke-width:2.4`);
        return { g, th };
      });
      sv(c, wrap, "circle", { cx: Px, cy: Py, r: 6 }, `fill:${WOOD};stroke:var(--sf);stroke-width:1.4`);
      sv(c, wrap, "circle", { cx: Px - 1.5, cy: Py - 1.5, r: 1.6 }, "fill:#fff;opacity:.5");
      grain(c, null, { fill: "var(--bg)", blend: "normal", a: 1, k: 0.85, b: -0.37, seed: 21, f: 0.9 });
      blades.forEach((b) => (b.g.style.transform = `rotate(${-b.th}deg)`));
      await c.wait(350);
      await c.all(...blades.map((b) => c.a(b.g, [{ transform: `rotate(${-b.th}deg)` }, { transform: "rotate(0deg)" }], { duration: 900, easing: c.E.E2 })));
    },
  });

  /* ---- JP-08 Тень ветки ---- */
  SKD.add({
    code: "JP-08", group: "jp", ru: "Тень ветки",
    what: "На бумагу сёдзи ложится мягкая тень ветки сакуры, а решётка и текст остаются чёткими.",
    when: "Тихая пауза перед репликой",
    fam: JP_FAM, proj: JP_PROJ, hold: 1300,
    spec: "D=2200 мс, E1; силуэт ветки α 0→0.14 (в демо 0.20 для читаемости) и x +40→0 px, blur 12 (σ 4); клип по бумаге; решётка и текст выше тени.",
    async play(c) {
      const { svg, defs } = layer(c);
      sv(c, svg, "rect", { width: 480, height: 270 }, "fill:var(--sf)");
      const lg = uid(), rg = c.sv(defs, "radialGradient", { id: lg, cx: 0.5, cy: 0.45, r: 0.75 });
      sv(c, rg, "stop", { offset: 0, "stop-opacity": 0 }, "stop-color:var(--bg)"); sv(c, rg, "stop", { offset: 1, "stop-opacity": 0.8 }, "stop-color:var(--bg)");
      sv(c, svg, "rect", { width: 480, height: 270 }, `fill:url(#${lg})`);
      const cid = uid(), cp = c.sv(defs, "clipPath", { id: cid }); c.sv(cp, "rect", { width: 480, height: 270 });
      const bl = fBlur(c, defs, 4, 120);
      const sh = sv(c, svg, "g", { "clip-path": `url(#${cid})`, filter: `url(#${bl.id})` }, "opacity:0");
      const mv = sv(c, sh, "g");
      sakura(c, mv, { mono: "var(--fg)", x: -300, y: -4, k: 1.9 });
      grain(c, null, { fill: "var(--mu)", a: 0.45, f: 0.6, seed: 9 });
      fibers(c, null, { fill: "var(--mu)", a: 0.12, seed: 4 });
      const s2 = layer(c); lattice(c, s2.svg, 480, 270);
      c.el("div", "position:absolute;left:0;right:0;top:186px;text-align:center;z-index:60", null, '<span style="display:inline-block;padding:6px 14px;border-radius:7px;background:color-mix(in srgb,var(--bg) 94%,transparent);color:var(--fg);font-weight:600;font-size:17px;letter-spacing:.01em;box-shadow:0 1px 0 rgba(0,0,0,.08)">Тише… слышишь ветер?</span>');
      await c.tick(2200, (t, p) => {
        const e = EF.E1(p);
        sh.style.opacity = f1(0.2 * e); mv.setAttribute("transform", `translate(${f1(40 * (1 - e))} 0)`);
      });
    },
  });
  /* ===================== PP — бумага, сгиб, коллаж ===================== */
  const PP_FAM = ["F02", "F14"];
  const SHP = "0 8px 16px rgba(0,0,0,.12)";            // тень бумаги по умолчанию: чёрная α 0.12, (0,8), blur 16
  const CARDBG = "color-mix(in srgb,var(--mu) 24%,var(--bg))";

  /* стол: бумага + мелкая сетка-коврик для резки */
  function desk(c) {
    grain(c, null, { a: 0.5, seed: 7 });
    const { svg } = layer(c);
    let d = "";
    for (let x = 0; x <= 480; x += 24) d += `M${x} 0V270`;
    for (let y = 0; y <= 270; y += 24) d += `M0 ${y}H480`;
    sv(c, svg, "path", { d, fill: "none" }, "stroke:var(--mu);stroke-width:1;opacity:.16");
    let d2 = "";
    for (let x = 0; x <= 480; x += 120) d2 += `M${x} 0V270`;
    for (let y = 0; y <= 270; y += 120) d2 += `M0 ${y}H480`;
    sv(c, svg, "path", { d: d2, fill: "none" }, "stroke:var(--mu);stroke-width:1.4;opacity:.22");
  }
  /* бумага с фактурой: волокна и крупа в локальных координатах листа */
  function sheetTex(c, parent, w, h, a) {
    grain(c, parent, { w, h, vb: `0 0 ${w} ${h}`, fill: "var(--mu)", a: a == null ? 0.5 : a, f: 0.6, seed: 9 });
    fibers(c, parent, { w, h, vb: `0 0 ${w} ${h}`, fill: "var(--mu)", a: 0.1, seed: 4 });
  }
  /* скотч: полупрозрачная полоса с зубчатыми краями */
  function tape(c, parent, x, y, w, h, rot) {
    return c.el("div", `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;transform:rotate(${rot}deg);background:color-mix(in srgb,var(--ac) 78%,transparent);clip-path:polygon(0 0,100% 0,97% 12%,100% 25%,97% 38%,100% 50%,97% 62%,100% 75%,97% 88%,100% 100%,0 100%,3% 88%,0 75%,3% 62%,0 50%,3% 38%,0 25%,3% 12%);box-shadow:0 2px 3px rgba(0,0,0,.12);z-index:5`, parent,
      `<i style="position:absolute;left:0;right:0;top:35%;height:22%;background:#fff;opacity:.22"></i>`);
  }
  /* ---- иллюстрации (статичные SVG-строки) ---- */
  const photoArt = (w, h) => { const k = uid(); return `<svg viewBox="0 0 180 118" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" style="display:block"><defs><linearGradient id="${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--bg)"/><stop offset="1" style="stop-color:color-mix(in srgb,var(--ac) 22%,var(--bg))"/></linearGradient></defs><rect width="180" height="118" fill="url(#${k})"/><circle cx="124" cy="56" r="22" style="fill:var(--ac)"/><path d="M0 86L34 58L58 76L92 42L130 80L160 62L180 74V118H0Z" style="fill:color-mix(in srgb,var(--mu) 62%,var(--bg))"/><path d="M0 98C30 82 60 92 90 86C120 80 150 94 180 88V118H0Z" style="fill:color-mix(in srgb,var(--fg) 90%,var(--bg))"/><path d="M30 30q4-6 8 0q4-6 8 0M52 40q3-5 6 0q3-5 6 0" fill="none" style="stroke:var(--fg);stroke-width:1.4"/></svg>`; };
  const linesArt = (w, h, o) => {
    o = o || {};
    let s = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="position:absolute;left:0;top:0;display:block">`;
    for (let y = o.y0 || 26; y < h - 6; y += 16) s += `<path d="M${o.x0 == null ? 10 : o.x0} ${y}H${w - 10}" style="stroke:var(--mu);stroke-width:1;opacity:.35"/>`;
    if (o.margin !== false) s += `<path d="M26 0V${h}" style="stroke:var(--ac);stroke-width:1.2;opacity:.45"/>`;
    return s + (o.extra || "") + "</svg>";
  };
  const bar = (x, y, w, o) => `<rect x="${x}" y="${y}" width="${w}" height="${o && o.h || 4}" rx="2" style="fill:${o && o.c || "var(--fg)"};opacity:${o && o.o || 0.55}"/>`;
  const houseSil = "M6 58L70 10L134 58L122 58V114H18V58Z";
  const houseArt = (w, h) => `<svg viewBox="0 0 140 120" width="${w}" height="${h}" style="display:block;overflow:visible;filter:drop-shadow(0 2px 3px rgba(0,0,0,.18))"><path d="${houseSil}" style="fill:var(--sf);stroke:var(--sf);stroke-width:12;stroke-linejoin:round"/><rect x="96" y="12" width="20" height="30" style="fill:var(--sf);stroke:var(--sf);stroke-width:10;stroke-linejoin:round"/><rect x="98" y="14" width="16" height="30" style="fill:var(--mu)"/><rect x="95" y="11" width="22" height="6" style="fill:var(--fg);opacity:.75"/><rect x="18" y="58" width="104" height="56" style="fill:var(--sf)"/><path d="M6 58L70 10L134 58Z" style="fill:var(--ac)"/><path d="M26 54L70 22L114 54M44 54L70 34L96 54" fill="none" style="stroke:var(--sf);stroke-width:1.6;opacity:.45"/><rect x="58" y="76" width="26" height="38" rx="2" style="fill:var(--fg)"/><circle cx="78" cy="96" r="2" style="fill:var(--sf)"/><rect x="28" y="70" width="22" height="22" style="fill:var(--bg);stroke:var(--fg);stroke-width:2"/><path d="M39 70V92M28 81H50" style="stroke:var(--fg);stroke-width:1.6"/><rect x="92" y="70" width="22" height="22" style="fill:var(--bg);stroke:var(--fg);stroke-width:2"/><path d="M103 70V92M92 81H114" style="stroke:var(--fg);stroke-width:1.6"/></svg>`;

  /* ---- PP-01 Лист на стол ---- */
  SKD.add({
    code: "PP-01", group: "paper", ru: "Лист на стол",
    what: "Вырезка со скотчем опускается на стол, тень сжимается и густеет.",
    when: "Влог, фото, новая карточка заметок",
    fam: PP_FAM, proj: ["arseniy", "serial"], hold: 1300,
    spec: "D=650 мс, E2; y −100→0 px, rotateZ −8°→−2°, α 0→1; тень: смещение y 28→8 px, blur 36→16 px, α 0.04→0.12.",
    async play(c) {
      desk(c);
      const note = c.el("div", `position:absolute;left:46px;top:116px;width:184px;height:122px;background:var(--sf);box-shadow:${SHP};transform:rotate(4deg);overflow:hidden`, null,
        linesArt(184, 122, { extra: bar(34, 12, 80, { h: 6, o: 0.7 }) + bar(34, 38, 120) + bar(34, 54, 96) + bar(34, 70, 110, { c: "var(--ac)", o: 0.6 }) + bar(34, 86, 70) }));
      sheetTex(c, note, 184, 122, 0.4);
      const wrap = c.el("div", "position:absolute;left:156px;top:40px;width:196px;height:172px;opacity:0;filter:drop-shadow(0 28px 36px rgba(0,0,0,.04))");
      const sheet = c.el("div", "position:absolute;inset:0;background:var(--sf);transform:rotate(-8deg)", wrap);
      c.el("div", "position:absolute;left:8px;top:8px;width:180px;height:128px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)", sheet, photoArt(180, 128));
      c.el("div", "position:absolute;left:12px;right:12px;bottom:6px;height:28px", sheet, `<svg viewBox="0 0 172 28" width="172" height="28"><path d="M4 16Q16 6 30 16T58 16T86 14T118 16" fill="none" style="stroke:var(--fg);stroke-width:2.2;stroke-linecap:round;opacity:.7"/><path d="M128 20h40" style="stroke:var(--ac);stroke-width:2.4;stroke-linecap:round"/></svg>`);
      sheetTex(c, sheet, 196, 172, 0.45);
      tape(c, sheet, 64, -9, 70, 20, -4);
      await c.all(
        c.a(wrap, [{ opacity: 0, transform: "translateY(-100px)", filter: "drop-shadow(0px 28px 36px rgba(0,0,0,.04))" }, { opacity: 1, transform: "translateY(0)", filter: "drop-shadow(0px 8px 16px rgba(0,0,0,.12))" }], { duration: 650, easing: c.E.E2 }),
        c.a(sheet, [{ transform: "rotate(-8deg)" }, { transform: "rotate(-2deg)" }], { duration: 650, easing: c.E.E2 }));
    },
  });

  /* ---- PP-02 Подъём поп-апа ---- */
  SKD.add({
    code: "PP-02", group: "paper", ru: "Подъём поп-апа",
    what: "Бумажный домик поднимается вокруг нижнего сгиба открытки, под ним сжимается тень.",
    when: "Дом, дерево или герой бумажной сцены",
    fam: PP_FAM, proj: ["arseniy", "serial"], hold: 1300,
    spec: "D=800 мс, E2; шарнир — нижний край, rotateX 90°→0° (перспектива 1200); тень плоским силуэтом: sy 1→0.25, α 0.08→0.18, blur 16.",
    async play(c) {
      desk(c);
      const st = c.el("div", "position:absolute;inset:0;perspective:1200px;perspective-origin:50% -420px");
      const back = c.el("div", `position:absolute;left:100px;top:30px;width:280px;height:158px;background:var(--sf);box-shadow:${SHP};overflow:hidden`, st, photoArt(280, 158));
      sheetTex(c, back, 280, 158, 0.35);
      c.el("div", `position:absolute;left:80px;top:188px;width:320px;height:62px;background:${CARDBG};clip-path:polygon(6% 0,94% 0,100% 100%,0 100%);box-shadow:${SHP}`, st);
      const fold = layer(c, "", st);
      sv(c, fold.svg, "path", { d: "M98 188H382", fill: "none" }, "stroke:var(--fg);stroke-width:1.4;opacity:.35");
      sv(c, fold.svg, "path", { d: "M104 224H376", fill: "none" }, "stroke:var(--fg);stroke-width:1.4;stroke-dasharray:6 5;opacity:.45");
      const shadow = c.el("div", "position:absolute;left:176px;top:224px;width:128px;height:84px;opacity:.08;transform-origin:50% 0;filter:blur(7px)", st,
        `<svg viewBox="0 0 140 120" width="128" height="84" preserveAspectRatio="none"><path d="${houseSil}" transform="translate(0 120) scale(1 -1)" style="fill:var(--fg)"/></svg>`);
      const house = c.el("div", "position:absolute;left:170px;top:104px;width:140px;height:120px;transform-origin:50% 100%;transform:rotateX(90deg)", st, houseArt(140, 120));
      await c.wait(350);
      await c.all(
        c.a(house, [{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], { duration: 800, easing: c.E.E2 }),
        c.a(shadow, [{ transform: "scaleY(1)", opacity: 0.08 }, { transform: "scaleY(0.25)", opacity: 0.18 }], { duration: 800, easing: c.E.E2 }));
    },
  });

  /* ---- PP-03 Перелистывание страницы ---- */
  SKD.add({
    code: "PP-03", group: "paper", ru: "Перелистывание страницы",
    what: "Правая страница тетради переворачивается влево вокруг корешка, вдоль сгиба ложится тень.",
    when: "Новая глава или страница конспекта",
    fam: PP_FAM, proj: ["arseniy"], hold: 1200,
    spec: "D=1100 мс, E1; шарнир — левый край листа, rotateY 0→−180°; следующий лист неподвижен; тень вдоль шарнира 40 px α 0→0.2→0 за 550/550 мс.",
    async play(c) {
      desk(c);
      const PW = 190, PH = 232, X = 50, Y = 19;
      const book = c.el("div", `position:absolute;left:${X - 8}px;top:${Y - 8}px;width:${PW * 2 + 16}px;height:${PH + 16}px;border-radius:5px;background:color-mix(in srgb,var(--fg) 68%,var(--ac) 14%);box-shadow:0 12px 22px rgba(0,0,0,.2)`);
      const gut = (right) => `<div style="position:absolute;top:0;bottom:0;${right ? "left" : "right"}:0;width:26px;background:linear-gradient(${right ? "90deg" : "270deg"},rgba(0,0,0,.2),rgba(0,0,0,0))"></div>`;
      const page = (parent, left, html, right, extra) => {
        const p = c.el("div", `position:absolute;left:${left}px;top:8px;width:${PW}px;height:${PH}px;background:var(--sf);overflow:hidden;${extra || ""}`, parent, html + gut(right));
        return p;
      };
      const head = (t) => `<div style="position:absolute;left:34px;top:12px;font-weight:700;font-size:19px;color:var(--fg)">${t}</div>`;
      const pA = linesArt(PW, PH, { y0: 54 }) + head("Глава 1") + `<svg viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" style="position:absolute;left:0;top:0">${bar(34, 72, 120) + bar(34, 88, 100) + bar(34, 104, 128) + bar(34, 120, 84)}<path d="M54 196L96 142L138 196Z" fill="none" style="stroke:var(--fg);stroke-width:2"/><path d="M96 142V196M54 196H138" style="stroke:var(--ac);stroke-width:2;stroke-dasharray:4 3"/></svg>`;
      const pB = linesArt(PW, PH, { y0: 54 }) + head("Глава 2") + `<svg viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" style="position:absolute;left:0;top:0"><ellipse cx="102" cy="150" rx="62" ry="26" fill="none" style="stroke:var(--mu);stroke-width:1.6;stroke-dasharray:5 4"/><circle cx="102" cy="150" r="14" style="fill:var(--ac)"/><circle cx="160" cy="142" r="5" style="fill:var(--fg)"/>${bar(34, 72, 110) + bar(34, 88, 126) + bar(34, 104, 70)}</svg>`;
      const pC = linesArt(PW, PH, { y0: 54 }) + `<svg viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" style="position:absolute;left:0;top:0">${bar(34, 22, 90, { h: 6, o: 0.7 }) + bar(34, 72, 118) + bar(34, 88, 90) + bar(34, 104, 124)}<circle cx="46" cy="160" r="4" style="fill:var(--ac)"/>${bar(58, 158, 90, { o: 0.45 })}<circle cx="46" cy="180" r="4" style="fill:var(--ac)"/>${bar(58, 178, 70, { o: 0.45 })}</svg>`;
      const pD = `<div style="position:absolute;left:34px;top:16px;width:136px;height:92px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)">${photoArt(136, 92)}</div>` + linesArt(PW, PH, { y0: 128 }) + `<svg viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" style="position:absolute;left:0;top:0">${bar(34, 124, 100, { o: 0.5 }) + bar(34, 148, 120) + bar(34, 164, 84)}</svg>`;
      page(book, 8, pC, false);                           // левая страница (будет закрыта)
      const next = page(book, 8 + PW, pB, true);         // следующая, неподвижна под листом
      const hs = c.el("div", "position:absolute;left:0;top:0;bottom:0;width:40px;opacity:0;background:linear-gradient(90deg,rgba(0,0,0,.9),rgba(0,0,0,0))", next);
      const stg = c.el("div", `position:absolute;left:${X - 8}px;top:${Y - 8}px;width:${PW * 2 + 16}px;height:${PH + 16}px;perspective:1200px;perspective-origin:50% 50%`);
      const leaf = c.el("div", `position:absolute;left:${8 + PW}px;top:8px;width:${PW}px;height:${PH}px;transform-style:preserve-3d;transform-origin:0 50%`, stg);
      const f = c.el("div", `position:absolute;inset:0;background:var(--sf);backface-visibility:hidden;overflow:hidden`, leaf, pA + gut(true));
      const fs = c.el("div", "position:absolute;inset:0;background:#000;opacity:0", f);
      const b = c.el("div", `position:absolute;inset:0;background:var(--sf);backface-visibility:hidden;overflow:hidden;transform:rotateY(180deg)`, leaf, pD + gut(false));
      const bs = c.el("div", "position:absolute;inset:0;background:#000;opacity:.2", b);
      sheetTex(c, f, PW, PH, 0.35); sheetTex(c, b, PW, PH, 0.35);
      await c.wait(300);
      await c.all(
        c.a(leaf, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(-180deg)" }], { duration: 1100, easing: c.E.E1 }),
        c.a(hs, [{ opacity: 0, easing: c.E.E1 }, { opacity: 0.2, easing: c.E.E1 }, { opacity: 0 }], { duration: 1100 }),
        c.a(fs, [{ opacity: 0 }, { opacity: 0.22 }], { duration: 550, easing: c.E.E1 }),
        c.a(bs, [{ opacity: 0.22 }, { opacity: 0 }], { duration: 550, delay: 550, easing: c.E.E1, fill: "both" }));
    },
  });

  /* ---- PP-04 Разрыв по шву ---- */
  SKD.add({
    code: "PP-04", group: "paper", ru: "Разрыв по шву",
    what: "Лист рвётся посередине: половины расходятся и показывают солнечный нижний слой.",
    when: "Сюжетное раскрытие или смена условия",
    fam: PP_FAM, proj: ["arseniy", "serial"], hold: 1300,
    spec: "D=800 мс, E1; рваная граница по x=w/2, зубцы шаг 16 px глубина 6 px; левая половина x 0→−0.55w, угол 0→−6°, правая x 0→+0.55w, угол 0→+6°; клип по каждой половине.",
    async play(c) {
      desk(c);
      const w = 220, h = 172, x0 = 130, y0 = 49, cx = x0 + w / 2;
      /* нижний слой: солнце на светлом листе */
      const under = c.el("div", `position:absolute;left:${x0 - 12}px;top:${y0 - 8}px;width:${w + 24}px;height:${h + 16}px;background:var(--sf);box-shadow:${SHP};overflow:hidden`);
      c.el("div", "position:absolute;inset:0;transform:scale(1)", under, `<svg viewBox="0 0 244 188" width="244" height="188"><defs><radialGradient id="ppg"><stop offset="0" style="stop-color:var(--ac);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--ac);stop-opacity:0"/></radialGradient></defs><rect width="244" height="188" style="fill:var(--bg)"/><circle cx="122" cy="94" r="84" fill="url(#ppg)"/><g style="stroke:var(--ac);stroke-width:5;stroke-linecap:round">${Array.from({ length: 12 }, (_, i) => { const a = (i * 30 * Math.PI) / 180; return `<path d="M${f1(122 + Math.cos(a) * 52)} ${f1(94 + Math.sin(a) * 52)}L${f1(122 + Math.cos(a) * 68)} ${f1(94 + Math.sin(a) * 68)}"/>`; }).join("")}</g><circle cx="122" cy="94" r="36" style="fill:var(--ac)"/><path d="M104 88q5-6 10 0M130 88q5-6 10 0M106 104q16 14 32 0" fill="none" style="stroke:var(--sf);stroke-width:3;stroke-linecap:round"/><path d="M0 160C40 140 80 168 122 156S200 142 244 160V188H0Z" style="fill:var(--mu);opacity:.5"/></svg>`);
      sheetTex(c, under, w + 24, h + 16, 0.4);
      /* рваный шов: зубцы шаг 16, глубина 6, фиксированные (seed) */
      const zig = []; for (let y = 0; y <= h; y += 16) zig.push([cx + (Math.round(y / 16) % 2 ? 6 : -6) * (0.55 + c.rnd() * 0.45) + (c.rnd() - 0.5) * 2, y0 + y]);
      zig[0][1] = y0; zig[zig.length - 1][1] = y0 + h;
      const rim = zig.map(([x, y], i) => [x, y, 2.2 + c.rnd() * 2.6]);
      const half = (side) => {
        const { svg, defs } = layer(c, "pointer-events:none");
        const sx = side === "L" ? x0 : x0 + w, ex = side === "L" ? 1 : -1;
        const poly = (off) => `M${sx} ${y0}L${zig.map(([x, y], i) => f1(x + ex * off(i)) + " " + y).join("L")}L${sx} ${y0 + h}Z`;
        const cid = uid(), cp = c.sv(defs, "clipPath", { id: cid }); c.sv(cp, "path", { d: poly(() => 0) });
        const g = sv(c, svg, "g", {}, "filter:drop-shadow(0 6px 9px rgba(0,0,0,.2))");
        sv(c, g, "path", { d: poly((i) => rim[i][2]) }, "fill:var(--sf)");                       // белая бумажная кромка
        const pic = sv(c, g, "g", { "clip-path": `url(#${cid})` });
        sv(c, pic, "rect", { x: x0, y: y0, width: w, height: h }, `fill:color-mix(in srgb,var(--mu) 40%,var(--bg))`);
        /* туча с дождём поперёк шва */
        sv(c, pic, "path", { d: `M${cx - 78} ${y0 + 86}C${cx - 96} ${y0 + 84} ${cx - 94} ${y0 + 56} ${cx - 70} ${y0 + 58}C${cx - 66} ${y0 + 36} ${cx - 34} ${y0 + 30} ${cx - 22} ${y0 + 48}C${cx - 8} ${y0 + 28} ${cx + 28} ${y0 + 30} ${cx + 34} ${y0 + 54}C${cx + 62} ${y0 + 46} ${cx + 82} ${y0 + 74} ${cx + 62} ${y0 + 86}Z` }, "fill:var(--sf);stroke:var(--fg);stroke-width:2;stroke-linejoin:round");
        [-56, -36, -16, 6, 26, 48].forEach((dx, i) => sv(c, pic, "path", { d: `M${cx + dx} ${y0 + 100 + (i % 2) * 8}l-5 14M${cx + dx + 8} ${y0 + 126 - (i % 2) * 6}l-5 14`, fill: "none" }, "stroke:var(--fg);stroke-width:2;stroke-linecap:round;opacity:.55"));
        sv(c, pic, "path", { d: `M${cx - 24} ${y0 + 68}q6 6 12 0M${cx + 12} ${y0 + 68}q6 6 12 0M${cx - 12} ${y0 + 78}q12 -8 24 0`, fill: "none" }, "stroke:var(--fg);stroke-width:2;stroke-linecap:round");
        grain(c, pic, { x: x0, y: y0, w, h, fill: "var(--mu)", a: 0.4, f: 0.6, seed: 9 });
        svg.style.transformOrigin = `${side === "L" ? x0 + w / 4 : x0 + (3 * w) / 4}px ${y0 + h / 2}px`;
        return svg;
      };
      const L = half("L"), R = half("R");
      await c.wait(450);
      await c.all(
        c.a(L, [{ transform: "translateX(0) rotate(0deg)" }, { transform: `translateX(${-0.55 * w}px) rotate(-6deg)` }], { duration: 800, easing: c.E.E1 }),
        c.a(R, [{ transform: "translateX(0) rotate(0deg)" }, { transform: `translateX(${0.55 * w}px) rotate(6deg)` }], { duration: 800, easing: c.E.E1 }));
    },
  });

  /* ---- PP-05 Наклейка с угла ---- */
  SKD.add({
    code: "PP-05", group: "paper", ru: "Наклейка с угла",
    what: "Наклейка приклеивается слева направо, впереди бежит приподнятый загнутый край.",
    when: "Короткая пометка или подпись на коллаже",
    fam: PP_FAM, proj: ["arseniy", "ecs"], hold: 1300,
    spec: "D=700 мс, E2; маска ширины 0→w; впереди загнутый край 24 px, rotateY −45°→0° за последние 200 мс E1; тень края α 0.2→0 за те же 200 мс E0.",
    async play(c) {
      desk(c);
      /* коллаж-подложка */
      const base = c.el("div", `position:absolute;left:62px;top:36px;width:356px;height:204px;background:var(--sf);box-shadow:${SHP};transform:rotate(-1.5deg);overflow:hidden`);
      sheetTex(c, base, 356, 204, 0.4);
      c.el("div", "position:absolute;left:24px;top:22px;width:150px;height:104px;background:var(--sf);box-shadow:0 5px 10px rgba(0,0,0,.14);transform:rotate(-3deg);padding:6px;box-sizing:border-box", base, `<div style="width:138px;height:92px;overflow:hidden">${photoArt(138, 92)}</div>`);
      c.el("div", "position:absolute;left:196px;top:30px;width:120px;height:118px;background:color-mix(in srgb,var(--mu) 40%,var(--bg));clip-path:polygon(2% 6%,38% 0,70% 5%,100% 0,96% 38%,100% 70%,94% 100%,52% 94%,0 100%,6% 52%);transform:rotate(3deg)", base);
      c.el("div", "position:absolute;left:30px;top:150px;width:300px;height:40px", base, `<svg viewBox="0 0 300 40" width="300" height="40">${bar(0, 8, 220, { o: 0.4 }) + bar(0, 22, 160, { o: 0.3 })}</svg>`);
      const Wd = 232, Hd = 112, SX = 124, SY = 80;
      const mk = (parent) => c.el("div", `position:absolute;left:0;top:0;width:${Wd}px;height:${Hd}px`, parent,
        `<svg viewBox="0 0 ${Wd} ${Hd}" width="${Wd}" height="${Hd}" style="position:absolute;inset:0;overflow:visible"><path d="M24 6H208Q226 6 226 24V88Q226 106 208 106H24Q6 106 6 88V24Q6 6 24 6Z" style="fill:var(--sf);stroke:var(--sf);stroke-width:8;stroke-linejoin:round"/><path d="M24 12H208Q220 12 220 24V88Q220 100 208 100H24Q12 100 12 88V24Q12 12 24 12Z" style="fill:var(--ac)"/><path d="M24 17H208Q215 17 215 24" fill="none" style="stroke:var(--sf);stroke-width:1.6;opacity:.35"/><circle cx="46" cy="56" r="20" style="fill:var(--sf)"/><rect x="43.5" y="40" width="5" height="19" rx="2.5" style="fill:var(--ac)"/><circle cx="46" cy="68" r="3" style="fill:var(--ac)"/><text x="76" y="68" style="font:800 34px/1 'Golos Text',system-ui,sans-serif;fill:var(--sf);letter-spacing:.5px">ВАЖНО</text></svg>`);
      const grp = c.el("div", `position:absolute;left:${SX}px;top:${SY}px;width:${Wd}px;height:${Hd}px;transform:rotate(-3deg)`);
      const stk = c.el("div", `position:absolute;inset:0;filter:drop-shadow(0 4px 5px rgba(0,0,0,.2));clip-path:inset(-20px ${Wd}px -20px -20px)`, grp);
      mk(stk);
      const strip = c.el("div", `position:absolute;left:0;top:0;width:24px;height:${Hd}px;overflow:hidden;transform-origin:0 50%;transform:perspective(1200px) rotateY(-45deg);z-index:8;filter:drop-shadow(2px 3px 3px rgba(0,0,0,.25))`, grp);
      const sc = mk(strip);
      const sh = c.el("div", "position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,1));opacity:.2", strip);
      const D = 700;
      await c.tick(D, (t, p) => {
        const e = EF.E2(p), m = e * Wd, k = seg(t, D - 200, D), a = lerp(-45, 0, EF.E1(k));
        stk.style.clipPath = `inset(-20px ${f1((1 - e) * Wd)}px -20px -20px)`;
        const sw = clamp(Wd - m, 0, 24);
        strip.style.width = f1(sw) + "px"; strip.style.left = f1(m) + "px";
        strip.style.transform = `perspective(1200px) rotateY(${f1(a)}deg)`;
        strip.style.filter = `drop-shadow(2px 3px 3px rgba(0,0,0,${f1(lerp(0.25, 0, k))}))`;
        sc.style.left = f1(-m) + "px";
        sh.style.opacity = f1(lerp(0.2, 0, k));
        strip.style.opacity = sw <= 0.5 ? 0 : 1;
      });
    },
  });

  /* ---- PP-06 Ступенчатая перекладка ---- */
  SKD.add({
    code: "PP-06", group: "paper", ru: "Ступенчатая перекладка",
    what: "Карточка с самолётиком перекладывается рывками, как в бумажном стоп-моушне.",
    when: "Бумажный стоп-моушн",
    fam: PP_FAM, proj: ["arseniy", "serial"], hold: 1300,
    spec: "D=667 мс, E5 steps(8); центр A→B, угол −4°→+2°, без blur и промежуточного fade; каждый шаг удерживается, текстура следует за карточкой.",
    async play(c) {
      desk(c);
      const A = { x: 132, y: 170 }, B = { x: 350, y: 112 }, cw = 112, ch = 140;
      const { svg } = layer(c);
      /* карандашные метки девяти положений */
      for (let k = 0; k <= 8; k++) { const x = lerp(A.x, B.x, k / 8), y = lerp(A.y, B.y, k / 8) + ch / 2 + 14; sv(c, svg, "path", { d: `M${f1(x - 4)} ${f1(y)}H${f1(x + 4)}M${f1(x)} ${f1(y - 4)}V${f1(y + 4)}`, fill: "none" }, "stroke:var(--mu);stroke-width:1.4;opacity:.7"); }
      const card = c.el("div", `position:absolute;left:${A.x - cw / 2}px;top:${A.y - ch / 2}px;width:${cw}px;height:${ch}px;background:var(--sf);box-shadow:${SHP};transform:rotate(-4deg)`);
      c.el("div", "position:absolute;left:7px;top:7px;width:98px;height:100px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)", card, `<svg viewBox="0 0 98 100" width="98" height="100"><rect width="98" height="100" style="fill:var(--bg)"/><path d="M6 78C24 66 38 72 50 62S82 54 94 58" fill="none" style="stroke:var(--mu);stroke-width:1.6;stroke-dasharray:4 3"/><path d="M12 62L88 28L58 78L48 60Z" style="fill:var(--ac)"/><path d="M48 60L58 78L52 66Z" style="fill:var(--fg);opacity:.45"/><path d="M48 60L88 28L52 66Z" style="fill:color-mix(in srgb,var(--ac) 65%,var(--fg))"/><path d="M14 20q5-6 10 0q5-6 10 0M64 86q4-5 8 0q4-5 8 0" fill="none" style="stroke:var(--fg);stroke-width:1.4"/></svg>`);
      c.el("div", "position:absolute;left:8px;right:8px;bottom:8px;height:20px", card, `<svg viewBox="0 0 96 20" width="96" height="20">${bar(2, 4, 70, { o: 0.6 }) + bar(2, 12, 44, { o: 0.4, c: "var(--ac)" })}</svg>`);
      sheetTex(c, card, cw, ch, 0.45);
      tape(c, card, 28, -8, 54, 16, 3);
      const dx = B.x - A.x, dy = B.y - A.y;
      await c.wait(400);
      await c.a(card, [{ transform: "translate(0px,0px) rotate(-4deg)" }, { transform: `translate(${dx}px,${dy}px) rotate(2deg)` }], { duration: 667, easing: c.E.steps(8) });
    },
  });

  /* ---- PP-07 Сложение гармошкой ---- */
  SKD.add({
    code: "PP-07", group: "paper", ru: "Сложение гармошкой",
    what: "Четыре полосы карты раскрываются из сложенной гармошки в один лист.",
    when: "Карта пути, план комнаты, лист инструкции",
    fam: PP_FAM, proj: ["arseniy", "ecs"], hold: 1300,
    spec: "D=1000 мс, E2; 4 равные вертикальные полосы, цепочка шарниров по левым краям, rotateY +80/−160/+160/−160° → 0; первая полоса закреплена левым краем; обе стороны нарисованы.",
    async play(c) {
      desk(c);
      const SW = 80, SH = 184, X0 = 80, Y0 = 43, ang = [80, -160, 160, -160];
      const mapArt = () => {
        const k = uid();
        return `<svg viewBox="0 0 320 184" width="320" height="184" style="position:absolute;top:0;display:block"><rect width="320" height="184" style="fill:var(--sf)"/><rect width="320" height="184" style="fill:var(--bg);opacity:.5"/>` +
          [[10, 12, 70, 40], [96, 12, 50, 56], [160, 14, 60, 34], [236, 12, 74, 44], [10, 70, 56, 46], [86, 84, 62, 40], [170, 70, 52, 48], [240, 82, 70, 38], [14, 136, 80, 40], [112, 140, 54, 36], [186, 132, 62, 46], [256, 136, 52, 38]].map(([x, y, w, h], i) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" style="fill:var(--mu);opacity:${i % 3 ? 0.18 : 0.3}"/>`).join("") +
          `<path d="M-6 118C40 92 84 140 140 112S220 70 326 96" fill="none" style="stroke:var(--mu);stroke-width:16;opacity:.45"/><path d="M-6 118C40 92 84 140 140 112S220 70 326 96" fill="none" style="stroke:var(--sf);stroke-width:8;opacity:.8"/>` +
          `<path d="M80 0V184M160 0V184M240 0V184" style="stroke:var(--fg);stroke-width:1;opacity:.1"/><circle cx="206" cy="38" r="14" style="fill:var(--mu);opacity:.35"/><circle cx="60" cy="158" r="12" style="fill:var(--mu);opacity:.35"/>` +
          `<path d="M26 160C60 136 70 100 112 96S170 120 196 84S252 70 270 40" fill="none" style="stroke:var(--ac);stroke-width:3;stroke-dasharray:2 7;stroke-linecap:round"/>` +
          `<circle cx="26" cy="160" r="6" style="fill:var(--fg)"/><circle cx="270" cy="38" r="9" style="fill:var(--ac)"/><circle cx="270" cy="38" r="3.5" style="fill:var(--sf)"/></svg>`;
      };
      const st = c.el("div", "position:absolute;inset:0;perspective:1200px;filter:drop-shadow(0 8px 12px rgba(0,0,0,.16))");
      let parent = st; const strips = [], shades = [];
      for (let i = 0; i < 4; i++) {
        const s = c.el("div", `position:absolute;left:${i === 0 ? X0 : SW}px;top:${i === 0 ? Y0 : 0}px;width:${SW}px;height:${SH}px;transform-style:preserve-3d;transform-origin:0 50%;transform:rotateY(${ang[i]}deg)`, parent);
        const f = c.el("div", "position:absolute;inset:0;overflow:hidden;backface-visibility:hidden", s, mapArt());
        f.firstChild.style.left = -SW * i + "px";
        const sh = c.el("div", "position:absolute;inset:0;background:#000;opacity:.28", f);
        const b = c.el("div", "position:absolute;inset:0;overflow:hidden;backface-visibility:hidden;transform:rotateY(180deg);background:var(--sf)", s, `<svg viewBox="0 0 80 184" width="80" height="184">${bar(10, 20, 54, { h: 6, o: 0.6 }) + bar(10, 44, 60, { o: 0.35 }) + bar(10, 58, 46, { o: 0.35 }) + bar(10, 72, 56, { o: 0.35 }) + bar(10, 100, 40, { c: "var(--ac)", o: 0.6 })}<rect x="10" y="124" width="50" height="40" rx="3" style="fill:var(--mu);opacity:.22"/></svg>`);
        strips.push(s); shades.push(sh); parent = s;
      }
      await c.wait(400);
      await c.all(...strips.map((s, i) => c.a(s, [{ transform: `rotateY(${ang[i]}deg)` }, { transform: "rotateY(0deg)" }], { duration: 1000, easing: c.E.E2 })), ...shades.map((s) => c.a(s, [{ opacity: 0.28 }, { opacity: 0 }], { duration: 1000, easing: c.E.E2 })));
    },
  });

  /* ---- PP-08 Вытягивание карточки ---- */
  SKD.add({
    code: "PP-08", group: "paper", ru: "Вытягивание карточки",
    what: "Карточка выезжает вверх из бумажного конверта и останавливается на 0.6 своей высоты.",
    when: "Документ, письмо, обещанный материал",
    fam: PP_FAM, proj: ["arseniy", "ecs"], hold: 1300,
    spec: "D=900 мс, E2; конверт неподвижен, передняя стенка выше карточки; карточка y +0.6h→0, клип под стенкой; конечный выступ над конвертом 0.6h, угол 0°.",
    async play(c) {
      desk(c);
      const EX = 120, EY = 128, EW = 240, EH = 124, CW = 176, CH = 112, CX = EX + (EW - CW) / 2;
      const kraft = "color-mix(in srgb,var(--mu) 40%,var(--bg))", kraft2 = "color-mix(in srgb,var(--mu) 24%,var(--sf))";
      const flap = c.el("div", `position:absolute;left:${EX}px;top:${EY - 92}px;width:${EW}px;height:92px;background:color-mix(in srgb,var(--mu) 60%,var(--bg));clip-path:polygon(0 100%,50% 0,100% 100%);filter:drop-shadow(0 -2px 3px rgba(0,0,0,.1))`);
      const back = c.el("div", `position:absolute;left:${EX}px;top:${EY}px;width:${EW}px;height:${EH}px;background:${kraft};box-shadow:${SHP}`);
      sheetTex(c, back, EW, EH, 0.35);
      const card = c.el("div", `position:absolute;left:${CX}px;top:${EY - 0.6 * CH}px;width:${CW}px;height:${CH}px;background:var(--sf);box-shadow:0 2px 6px rgba(0,0,0,.14);transform:translateY(${0.6 * CH}px)`);
      c.el("div", "position:absolute;inset:0", card, `<svg viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}"><rect x="14" y="14" width="64" height="10" rx="2" style="fill:var(--ac)"/>${bar(14, 36, 140) + bar(14, 50, 120) + bar(14, 64, 132) + bar(14, 78, 90)}<g transform="rotate(-10 140 84)"><rect x="112" y="68" width="46" height="30" rx="3" fill="none" style="stroke:var(--ac);stroke-width:2.4"/><path d="M122 84l7 7l14-14" fill="none" style="stroke:var(--ac);stroke-width:3;stroke-linecap:round;stroke-linejoin:round"/></g></svg>`);
      sheetTex(c, card, CW, CH, 0.4);
      /* передняя стенка выше карточки */
      const front = c.el("div", `position:absolute;left:${EX}px;top:${EY}px;width:${EW}px;height:${EH}px;background:${kraft2};clip-path:polygon(0 0,100% 0,100% 100%,0 100%);z-index:6;box-shadow:inset 0 10px 8px -8px rgba(0,0,0,.18)`);
      c.el("div", "position:absolute;inset:0", front, `<svg viewBox="0 0 ${EW} ${EH}" width="${EW}" height="${EH}"><path d="M0 ${EH}L${EW / 2} 56L${EW} ${EH}" fill="none" style="stroke:var(--fg);stroke-width:1.2;opacity:.22"/><path d="M0 0L${EW / 2} 56L${EW} 0" fill="none" style="stroke:var(--fg);stroke-width:1.2;opacity:.14"/>${bar(18, 86, 70, { o: 0.4 }) + bar(18, 98, 54, { o: 0.3 })}<rect x="${EW - 52}" y="12" width="36" height="42" style="fill:var(--sf)"/><rect x="${EW - 48}" y="16" width="28" height="34" style="fill:var(--ac);opacity:.85"/><path d="M${EW - 52} 12h36v42h-36z" fill="none" style="stroke:var(--mu);stroke-width:1;stroke-dasharray:2 2"/></svg>`);
      sheetTex(c, front, EW, EH, 0.35);
      const clip = c.el("div", `position:absolute;left:0;top:0;width:480px;height:${EY + EH}px;overflow:hidden;z-index:3;pointer-events:none`);
      clip.appendChild(card);
      await c.wait(350);
      await c.a(card, [{ transform: `translateY(${0.6 * CH}px)` }, { transform: "translateY(0)" }], { duration: 900, easing: c.E.E2 });
      await c.wait(0);
    },
  });
})();

;
/* OB (предметы и композиция), CH (персонаж и актёрское действие), DR (чертёж, физика и схемы).
   24 живые сцены 480×270 по спецификации Astra (ASTRA_TAXONOMY.md, 2.13 / 2.14 / 2.20).
   Темы: молоток и перо на Луне, маятник, векторы сил, графики движения; плоский герой для сериала.
   Цвета только var(--bg|--fg|--ac|--sf|--mu). Случайности нет, всё детерминировано. */
(function () {
  const SW = 3;
  const cl = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const win = (t, a, b) => cl((t - a) / (b - a));
  const lerp = (a, b, p) => a + (b - a) * p;
  const fmt = (n, d) => n.toFixed(d == null ? 1 : d).replace(".", ",");

  /* кубические кривые E1–E4 для покадровых сцен (те же числа, что в c.E) */
  function cb(x1, y1, x2, y2) {
    const bx = (t) => 3 * x1 * t * (1 - t) * (1 - t) + 3 * x2 * t * t * (1 - t) + t * t * t;
    const by = (t) => 3 * y1 * t * (1 - t) * (1 - t) + 3 * y2 * t * t * (1 - t) + t * t * t;
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 26; i++) { if (bx(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return by(t);
    };
  }

  /* покадровый цикл по меткам rAF: t≥0 всегда, не зависит от performance.now() */
  function tk(c, dur, fn) {
    return new Promise((res, rej) => {
      let t0 = null;
      const step = (now) => {
        if (c.stopped()) return rej("skd-stop");
        if (t0 == null) t0 = now;
        const t = cl(now - t0, 0, dur);
        fn(t, t / dur);
        if (t >= dur) return res();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  const EF = { E0: (p) => p, E1: cb(0.33, 0, 0.67, 1), E2: cb(0.22, 1, 0.36, 1), E3: cb(0.4, 0, 1, 1), E4: cb(0.16, 1.25, 0.3, 1) };

  /* ---------- SVG-хелперы ---------- */
  const G = (c, p, a) => c.sv(p, "g", a || {});
  const piv = (c, p, x, y) => { const o = G(c, p, { transform: `translate(${x},${y})` }); return G(c, o, {}); };
  const R = (c, p, x, y, w, h, st, rx) => c.sv(p, "rect", { x, y, width: w, height: h, rx: rx || 0, style: st });
  const C = (c, p, cx, cy, r, st) => c.sv(p, "circle", { cx, cy, r, style: st });
  const L = (c, p, x1, y1, x2, y2, st) => c.sv(p, "line", { x1, y1, x2, y2, style: st });
  const PA = (c, p, d, st) => c.sv(p, "path", { d, style: st });
  const SFS = `fill:var(--sf);stroke:var(--fg);stroke-width:${SW};stroke-linejoin:round`;
  const LN = (col, w) => `stroke:var(${col || "--fg"});stroke-width:${w || SW};stroke-linecap:round;fill:none`;
  function TX(c, p, x, y, str, o) {
    o = o || {};
    const t = c.sv(p, "text", { x, y, "text-anchor": o.a || "middle", style: `fill:var(${o.c || "--fg"});font-size:${o.s || 20}px;font-weight:${o.w || 600};${o.st || ""}` });
    t.textContent = str;
    return t;
  }
  const fadeIn = (c, el, ms, delay) => c.a(el, [{ opacity: 0 }, { opacity: 1 }], { duration: ms, delay: delay || 0, easing: "linear", fill: "both" });

  /* стрелка с наконечником: тело + треугольник; setArrow двигает оба конца */
  function mkArrow(c, p, col, w, hl, hw) {
    const g = G(c, p);
    const ln = c.sv(g, "line", { x1: 0, y1: 0, x2: 0, y2: 0, style: `stroke:var(${col});stroke-width:${w};stroke-linecap:butt` });
    const hd = c.sv(g, "polygon", { points: "0,0 0,0 0,0", style: `fill:var(${col})` });
    return { g, ln, hd, hl: hl || 12, hw: hw || 6 };
  }
  function setArrow(a, ax, ay, bx, by) {
    const len = Math.hypot(bx - ax, by - ay);
    if (len < 0.5) { a.g.style.opacity = 0; return; }
    a.g.style.opacity = 1;
    const ang = Math.atan2(by - ay, bx - ax), k = Math.min(1, len / a.hl), h = a.hl * k, w = a.hw * k;
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    const sx = bx - ux * h, sy = by - uy * h;
    a.ln.setAttribute("x1", ax); a.ln.setAttribute("y1", ay);
    a.ln.setAttribute("x2", sx); a.ln.setAttribute("y2", sy);
    a.hd.setAttribute("points", `${bx},${by} ${sx + nx * w},${sy + ny * w} ${sx - nx * w},${sy - ny * w}`);
  }
  function headPts(x, y, ang, len, wid) {
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux, bx = x - ux * len, by = y - uy * len;
    return `${x},${y} ${bx + nx * wid},${by + ny * wid} ${bx - nx * wid},${by - ny * wid}`;
  }
  function ground(c, s, y) {
    R(c, s, 0, y, 480, 270 - y, "fill:var(--mu);opacity:.22");
    L(c, s, 0, y, 480, y, "stroke:var(--mu);stroke-width:3");
  }
  function floorLine(c, s, y) {
    R(c, s, 0, y, 480, 270 - y, "fill:var(--mu);opacity:.14");
    L(c, s, 0, y, 480, y, "stroke:var(--mu);stroke-width:3");
  }

  /* ---------- предметы ---------- */
  function hammerG(c, p) {
    const g = G(c, p);
    R(c, g, -56, -5, 86, 10, SFS, 4);
    R(c, g, -52, -5, 16, 10, "fill:var(--ac)", 0);
    R(c, g, 22, -19, 36, 38, "fill:var(--fg)", 6);
    return g;
  }
  function featherG(c, p) {
    const g = G(c, p);
    PA(c, g, "M-52,5 C-30,-24 22,-30 58,-14 C34,10 -14,22 -52,5 Z", SFS);
    [0.22, 0.42, 0.62, 0.8].forEach((u) => {
      const x = -64 + 118 * u, y = 11 - 24 * u;
      L(c, g, x, y, x + 10, y - 11, "stroke:var(--mu);stroke-width:2;stroke-linecap:round");
    });
    L(c, g, -66, 12, 54, -13, "stroke:var(--fg);stroke-width:2.6;stroke-linecap:round");
    return g;
  }

  /* =====================================================================
     OB — предметы и композиция
     ===================================================================== */
  const FO = ["F05", "F02", "F03"];

  SKD.add({
    code: "OB-01", group: "obj", ru: "Приход на место",
    what: "Молоток выезжает из левого поля и тормозит рядом с пером.",
    when: "Добавить один инструмент или участника схемы.",
    fam: FO, proj: ["arseniy", "democrm", "serial"], hold: 1300,
    spec: "D=500 мс, E2; центр B+(−160,0)→B, α 0→1, s=1; после D предмет стоит.",
    async play(c) {
      const s = c.svg();
      ground(c, s, 214);
      TX(c, s, 240, 40, "Луна: g = 1,6 м/с²", { s: 22 });
      const f = G(c, s, { transform: "translate(104,196) rotate(-6)" }); featherG(c, f);
      TX(c, s, 104, 246, "перо", { s: 19 });
      const B = { x: 336, y: 194 };
      const outer = G(c, s, { transform: `translate(${B.x},${B.y})` });
      const inner = G(c, outer, { style: "opacity:0" });
      hammerG(c, inner);
      TX(c, inner, 0, 52, "молоток", { s: 19 });
      await c.wait(350);
      await c.a(inner, [{ transform: "translate(-160px,0)", opacity: 0 }, { transform: "translate(0,0)", opacity: 1 }], { duration: 500, easing: c.E.E2 });
    },
  });

  SKD.add({
    code: "OB-02", group: "obj", ru: "Бросок по дуге",
    what: "Перо пролетает дугу над Луной и мягко садится; тень растёт.",
    when: "Иллюстративный гэг с лёгким предметом.",
    fam: FO, proj: ["arseniy", "serial"], hold: 1200,
    spec: "D=700 мс, E0 по времени; центр=(1−p)A+pB+(0,−4·140·p(1−p)), угол −20°→0° E2; тень w×0.15h, s 0.7→1, α 0.08→0.18 E1.",
    async play(c) {
      const s = c.svg();
      ground(c, s, 214);
      TX(c, s, 240, 248, "Луна: воздуха нет, траектория — парабола", { s: 17 });
      const A = { x: 96, y: 196 }, B = { x: 384, y: 196 }, H = 140;
      let d = "";
      for (let i = 0; i <= 40; i++) { const p = i / 40; d += (i ? "L" : "M") + (A.x + (B.x - A.x) * p).toFixed(1) + "," + (A.y - 4 * H * p * (1 - p)).toFixed(1); }
      PA(c, s, d, "fill:none;stroke:var(--mu);stroke-width:2;stroke-dasharray:3 7;stroke-linecap:round");
      const sh = c.sv(s, "ellipse", { cx: A.x, cy: 214, rx: 42, ry: 6, style: "fill:var(--fg);opacity:.08;filter:blur(5px)" });
      const ob = G(c, s, { transform: `translate(${A.x},${A.y}) rotate(-20)` });
      featherG(c, ob);
      await c.wait(300);
      await tk(c, 700, (t, p) => {
        const x = lerp(A.x, B.x, p), y = A.y - 4 * H * p * (1 - p);
        const ang = lerp(-20, 0, EF.E2(p)), q = EF.E1(p);
        ob.setAttribute("transform", `translate(${x},${y}) rotate(${ang})`);
        sh.setAttribute("cx", x); sh.setAttribute("rx", 60 * lerp(0.7, 1, q));
        sh.style.opacity = lerp(0.08, 0.18, q);
      });
    },
  });

  SKD.add({
    code: "OB-03", group: "obj", ru: "Карточка с оборотом",
    what: "Плашка с вопросом переворачивается и показывает ответ.",
    when: "Вопрос на лицевой стороне, ответ на обороте.",
    fam: FO, proj: ["arseniy", "serial"], hold: 1300,
    spec: "D=600 мс, E1; rotateY 0→180°, perspective 1200 px, шарнир по вертикальному центру; backface скрыт, содержимое не зеркалится.",
    async play(c) {
      const wrap = c.el("div", "position:absolute;left:110px;top:55px;width:260px;height:160px;perspective:1200px");
      const card = c.el("div", "position:absolute;inset:0;transform-style:preserve-3d", wrap);
      const face = "position:absolute;inset:0;border-radius:14px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;backface-visibility:hidden;-webkit-backface-visibility:hidden;border:3px solid var(--fg);";
      c.el("div", face + "background:var(--sf);color:var(--fg)", card,
        '<div style="font-size:27px;font-weight:700;line-height:1.15">Что упадёт<br>быстрее?</div><div style="font-size:18px;font-weight:600;opacity:.7">молоток или перо на Луне</div>');
      c.el("div", face + "background:var(--ac);color:var(--sf);transform:rotateY(180deg)", card,
        '<div style="font-size:34px;font-weight:700">Одинаково</div><div style="font-size:22px;font-weight:600">a = g = 1,6 м/с²</div>');
      await c.wait(500);
      await c.a(card, [{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], { duration: 600, easing: c.E.E1 });
    },
  });

  SKD.add({
    code: "OB-04", group: "obj", ru: "Сборка из деталей",
    what: "Пять деталей сходятся в нитяной маятник на штативе.",
    when: "Устройство прибора или продукта.",
    fam: FO, proj: ["arseniy", "democrm"], hold: 1300,
    spec: "Деталь 500 мс, задержка 70i мс, D=500+70(n−1); E2; старт в 120 px от места по углу 360i/n°; α 0→1, угол постоянен.",
    async play(c) {
      const s = c.svg();
      const parts = [
        { cx: 200, cy: 228, d: (g) => R(c, g, -90, -7, 180, 14, SFS, 3) },
        { cx: 130, cy: 141, d: (g) => R(c, g, -6, -80, 12, 160, SFS, 2) },
        { cx: 212, cy: 67, d: (g) => R(c, g, -88, -6, 176, 12, SFS, 2) },
        { cx: 290, cy: 122, d: (g) => R(c, g, -1.5, -49, 3, 98, "fill:var(--fg)") },
        { cx: 290, cy: 188, d: (g) => C(c, g, 0, 0, 17, `fill:var(--ac);stroke:var(--fg);stroke-width:${SW}`) },
      ];
      const n = parts.length;
      const t1 = TX(c, s, 392, 112, "T = 2π√(L/g)", { s: 26, st: "opacity:0" });
      const t2 = TX(c, s, 392, 84, "нитяной маятник", { s: 18, c: "--mu", st: "opacity:0" });
      const anims = parts.map((pt, i) => {
        const outer = G(c, s, { transform: `translate(${pt.cx},${pt.cy})` });
        const inner = G(c, outer, { style: "opacity:0" });
        pt.d(inner);
        const th = (2 * Math.PI * i) / n, dx = 120 * Math.cos(th), dy = 120 * Math.sin(th);
        return c.a(inner, [{ transform: `translate(${dx}px,${dy}px)`, opacity: 0 }, { transform: "translate(0,0)", opacity: 1 }], { duration: 500, delay: 70 * i, easing: c.E.E2, fill: "both" });
      });
      await c.all(...anims);
      await c.all(fadeIn(c, t1, 300), fadeIn(c, t2, 300));
    },
  });

  SKD.add({
    code: "OB-05", group: "obj", ru: "Разнесённый разбор",
    what: "Пружинный маятник разъезжается на опору, пружину и груз с подписями.",
    when: "Показать компоненты и их назначение.",
    fam: FO, proj: ["arseniy", "democrm", "serial"], hold: 1300,
    spec: "D=700 мс, E1; деталь i смещается на (i−(n−1)/2)·100 px по x; подписи α 0→1 на 500–700 мс E0.",
    async play(c) {
      const s = c.svg();
      TX(c, s, 240, 40, "Пружинный маятник", { s: 24 });
      const cy = 125;
      const mk = (cx, i, draw, label, lx) => {
        const o = G(c, s, { transform: `translate(${cx},${cy})` });
        const g = G(c, o, {});
        draw(g);
        const lb = TX(c, s, lx, cy + 76, label, { s: 19, st: "opacity:0" });
        return { g, lb, dx: (i - 1) * 100 };
      };
      const items = [
        mk(150, 0, (g) => { R(c, g, -15, -45, 30, 90, SFS, 2); for (let k = -3; k <= 3; k++) L(c, g, -15, k * 13 + 6, -3, k * 13 - 6, "stroke:var(--mu);stroke-width:2"); }, "опора", 50),
        mk(225, 1, (g) => PA(c, g, "M-60,0 L-48,0 L-42,-18 L-30,18 L-18,-18 L-6,18 L6,-18 L18,18 L30,-18 L42,18 L48,0 L60,0", `fill:none;stroke:var(--fg);stroke-width:${SW};stroke-linejoin:round;stroke-linecap:round`), "пружина, k", 225),
        mk(315, 2, (g) => { R(c, g, -30, -28, 60, 56, `fill:var(--ac);stroke:var(--fg);stroke-width:${SW};stroke-linejoin:round`, 5); TX(c, g, 0, 9, "m", { s: 26, c: "--sf" }); }, "груз, m", 415),
      ];
      await c.wait(500);
      await c.all(
        ...items.map((it) => c.a(it.g, [{ transform: "translate(0,0)" }, { transform: `translate(${it.dx}px,0)` }], { duration: 700, easing: c.E.E1 })),
        ...items.map((it) => fadeIn(c, it.lb, 200, 500)),
      );
    },
  });

  /* контуры для OB-06: молоток и перо, одинаковое число вершин и направление обхода */
  function resample(pts, N) {
    const n = pts.length, d = [0];
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; d.push(d[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const tot = d[n], out = [];
    let j = 0;
    for (let k = 0; k < N; k++) {
      const t = (k * tot) / N;
      while (d[j + 1] < t) j++;
      const a = pts[j], b = pts[(j + 1) % n], u = (t - d[j]) / (d[j + 1] - d[j] || 1);
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
    }
    return out;
  }
  function featherOutline() {
    const right = [], left = [], M = 60;
    for (let i = 0; i <= M; i++) {
      const sx = i / M, y = -100 + 200 * sx;
      const u = Math.min(sx / 0.8, 1), env = u >= 1 ? 0 : Math.sin(Math.PI * Math.pow(u, 0.75));
      const tooth = u > 0.1 && u < 0.92 ? (i % 2 ? 1 : 0.8) : 1;
      const wr = Math.max(3, 36 * env * tooth), wl = Math.max(3, 27 * env * (i % 2 ? 0.8 : 1));
      const cx = 16 * Math.sin(Math.PI * sx * 0.95) - 8 * sx;
      right.push([cx + wr, y]); left.push([cx - wl, y]);
    }
    left.reverse(); left.pop();
    return right.concat(left);
  }
  const HAMMER = [[0, -95], [45, -95], [45, -55], [8, -55], [8, 95], [-8, 95], [-8, -55], [-45, -55], [-45, -95]];

  SKD.add({
    code: "OB-06", group: "obj", ru: "Превращение контура",
    what: "Силуэт молотка плавно перетекает в силуэт пера без растворения.",
    when: "Визуальная метафора или изменение геометрии.",
    fam: FO, proj: ["arseniy", "serial"], hold: 1200,
    spec: "D=800 мс, E1; вершины Pi→Qi, одинаковые число и порядок, обход по часовой; заливка SF постоянна, штрих FG 3 px.",
    async play(c) {
      const s = c.svg();
      const N = 120, P = resample(HAMMER, N), Q = resample(featherOutline(), N);
      const cx = 240, cy = 122;
      const path = PA(c, s, "", SFS);
      const dOf = (q) => { let d = ""; for (let i = 0; i < N; i++) d += (i ? "L" : "M") + (cx + lerp(P[i][0], Q[i][0], q)).toFixed(1) + "," + (cy + lerp(P[i][1], Q[i][1], q)).toFixed(1); return d + "Z"; };
      path.setAttribute("d", dOf(0));
      const a = TX(c, s, 240, 258, "молоток", { s: 20 });
      const b = TX(c, s, 240, 258, "перо", { s: 20, st: "opacity:0" });
      await c.wait(450);
      await tk(c, 800, (t, p) => { const q = EF.E1(p); path.setAttribute("d", dOf(q)); a.style.opacity = 1 - win(p, 0, 0.5); b.style.opacity = win(p, 0.5, 1); });
    },
  });

  SKD.add({
    code: "OB-07", group: "obj", ru: "Один маятник",
    what: "Табличка с «g = 9,8 м/с²» делает одно затухающее качание.",
    when: "Иллюстративная реакция таблички или лампы.",
    fam: FO, proj: ["arseniy", "serial"], hold: 1100,
    spec: "D=1200 мс; опора — верхний центр; угол на 0/300/600/900/1200 мс: −12°/+8°/−4°/+2°/0°; E1 между парами.",
    async play(c) {
      const s = c.svg();
      R(c, s, 150, 24, 180, 8, "fill:var(--mu)", 2);
      const outer = G(c, s, { transform: "translate(240,36)" });
      const sw = G(c, outer, { style: "transform:rotate(-12deg)" });
      L(c, sw, -62, 70, 0, 0, "stroke:var(--fg);stroke-width:2.5;stroke-linecap:round");
      L(c, sw, 62, 70, 0, 0, "stroke:var(--fg);stroke-width:2.5;stroke-linecap:round");
      R(c, sw, -86, 66, 172, 72, SFS, 8);
      TX(c, sw, 0, 112, "g = 9,8 м/с²", { s: 25 });
      C(c, s, 240, 36, 5, "fill:var(--fg)");
      await c.wait(250);
      const E1 = c.E.E1;
      await c.a(sw, [
        { transform: "rotate(-12deg)", offset: 0, easing: E1 }, { transform: "rotate(8deg)", offset: 0.25, easing: E1 },
        { transform: "rotate(-4deg)", offset: 0.5, easing: E1 }, { transform: "rotate(2deg)", offset: 0.75, easing: E1 },
        { transform: "rotate(0deg)", offset: 1 },
      ], { duration: 1200, easing: "linear" });
    },
  });

  SKD.add({
    code: "OB-08", group: "obj", ru: "Обход центра",
    what: "Мяч на верёвке один раз обходит столб за T = 2 с: то за ним, то перед ним.",
    when: "Цикл процесса или условная орбита.",
    fam: FO, proj: ["arseniy", "democrm", "serial"], hold: 900,
    spec: "D=2000 мс, E0; центр=T+(180cosθ,100sinθ), θ −90°→270°; при sinθ<0 предмет ниже по z, при sinθ≥0 выше.",
    async play(c) {
      const s = c.svg();
      const T = { x: 240, y: 135 };
      c.sv(s, "ellipse", { cx: T.x, cy: T.y, rx: 180, ry: 100, style: "fill:none;stroke:var(--mu);stroke-width:2;stroke-dasharray:8 6" });
      TX(c, s, 14, 30, "один оборот", { a: "start", s: 18, c: "--mu" });
      TX(c, s, 14, 56, "T = 2 с", { a: "start", s: 26 });
      const layer = G(c, s);
      const pole = G(c, layer);
      R(c, pole, T.x - 7, 38, 14, 196, SFS, 5);
      c.sv(pole, "ellipse", { cx: T.x, cy: 236, rx: 34, ry: 7, style: SFS });
      const mover = G(c, layer);
      const rope = L(c, mover, T.x, T.y, T.x, T.y, "stroke:var(--fg);stroke-width:2.5");
      const ball = C(c, mover, 0, 0, 15, `fill:var(--ac);stroke:var(--fg);stroke-width:${SW}`);
      let back = null;
      await tk(c, 2000, (t, p) => {
        const th = (-90 + 360 * p) * Math.PI / 180;
        const x = T.x + 180 * Math.cos(th), y = T.y + 100 * Math.sin(th);
        ball.setAttribute("cx", x); ball.setAttribute("cy", y);
        rope.setAttribute("x2", x); rope.setAttribute("y2", y);
        const nb = Math.sin(th) < 0;
        if (nb !== back) { back = nb; if (nb) layer.insertBefore(mover, pole); else layer.appendChild(mover); }
      });
    },
  });

  /* =====================================================================
     CH — персонаж и актёрское действие
     Плоский герой: голова-круг, тело-капсула, руки-линии с суставами.
     Рост ≈205 ед.; амплитуды спецификации (рост героя 480 px) пересчитаны ×0.43,
     мелкие (зрачки, рот) чуть увеличены, чтобы читались на карточке 300 px.
     ===================================================================== */
  const FC = ["F07", "F02"];
  const JOINT = `fill:var(--sf);stroke:var(--fg);stroke-width:2.5`;

  function hero(c, parent, x, y, S, o) {
    o = o || {};
    const root = G(c, parent);
    root.style.transform = `translate(${x}px,${y}px) scale(${S})`;
    const H = { root, S };
    H.sh = c.sv(root, "ellipse", { cx: 0, cy: 0, rx: 32, ry: 5.5, style: "fill:var(--fg);opacity:.13" });
    const body = G(c, root); H.body = body;
    const drop = o.drop || 0;
    const limb = "fill:none;stroke:var(--fg);stroke-width:9;stroke-linecap:round;stroke-linejoin:round";
    if (!o.ik) {
      [-1, 1].forEach((sd) => {
        const leg = piv(c, body, sd * 10, -73);
        L(c, leg, 0, 0, 0, 73, limb.replace("9", "10"));
        c.sv(leg, "ellipse", { cx: 5, cy: 73, rx: 12, ry: 5, style: "fill:var(--fg)" });
        H[sd < 0 ? "legL" : "legR"] = leg;
      });
    } else {
      const lg = G(c, body);
      const legs = [-1, 1].map((sd) => {
        const pth = PA(c, lg, "M0,0", limb.replace("9", "10"));
        const knee = C(c, lg, 0, 0, 5.5, JOINT);
        const foot = c.sv(lg, "ellipse", { cx: 0, cy: 0, rx: 12, ry: 5, style: "fill:var(--fg)" });
        return { sd, pth, knee, foot };
      });
      const A = 40, B = 38, hipY = -76 + drop;
      H.setLegs = (dx) => legs.forEach((l) => {
        const hx = l.sd * 10 + dx, hy = hipY, fx = l.sd * 15, fy = -1;
        const d = Math.hypot(fx - hx, fy - hy), dd = Math.min(d, A + B - 0.05), base = Math.atan2(fy - hy, fx - hx);
        const ang = base + (l.sd < 0 ? 1 : -1) * Math.acos(cl((A * A + dd * dd - B * B) / (2 * A * dd), -1, 1));
        const kx = hx + A * Math.cos(ang), ky = hy + A * Math.sin(ang);
        l.pth.setAttribute("d", `M${hx},${hy} L${kx},${ky} L${fx},${fy}`);
        l.knee.setAttribute("cx", kx); l.knee.setAttribute("cy", ky);
        l.foot.setAttribute("cx", fx + 5); l.foot.setAttribute("cy", fy + 1);
      });
      H.setLegs(0);
    }
    const up = G(c, body, drop ? { transform: `translate(0,${drop})` } : {});
    const torso = piv(c, up, 0, -76); H.torso = torso;
    R(c, torso, -19, -76, 38, 80, `fill:var(--ac);stroke:var(--fg);stroke-width:${SW}`, 19);
    [-1, 1].forEach((sd) => {
      const arm = piv(c, torso, sd * 20, -62);
      L(c, arm, 0, 0, 0, 36, limb);
      C(c, arm, 0, 0, 6, JOINT);
      const fore = piv(c, arm, 0, 36);
      L(c, fore, 0, 0, 0, 34, limb);
      C(c, fore, 0, 0, 5.5, JOINT);
      const hand = C(c, fore, 0, 34, 7, JOINT);
      arm.style.transform = `rotate(${-sd * 7}deg)`;
      const k = sd < 0 ? "L" : "R";
      H["arm" + k] = arm; H["fore" + k] = fore; H["hand" + k] = hand;
    });
    const head = piv(c, torso, 0, -76); H.head = head;
    C(c, head, 0, -26, 27, SFS);
    PA(c, head, "M-27,-26 A27,27 0 0 1 27,-26 Q14,-41 -4,-37 Q-18,-34 -27,-26 Z", "fill:var(--fg)");
    const face = G(c, head); H.face = face;
    const eye = "fill:var(--sf);stroke:var(--fg);stroke-width:2";
    H.eL = C(c, face, -9, -24, 6.5, eye); H.eR = C(c, face, 9, -24, 6.5, eye);
    H.pL = C(c, face, -9, -24, 3.2, "fill:var(--fg)"); H.pR = C(c, face, 9, -24, 3.2, "fill:var(--fg)");
    const brow = "fill:none;stroke:var(--fg);stroke-width:2.5;stroke-linecap:round";
    H.bL = PA(c, face, "M-15,-34 L-4,-35", brow); H.bR = PA(c, face, "M4,-35 L15,-34", brow);
    H.mo = PA(c, face, "M-6,-10 Q0,-7 6,-10", brow);
    H.mO = c.sv(face, "ellipse", { cx: 0, cy: -9, rx: 5, ry: 6.5, style: "fill:var(--fg);opacity:0" });
    return H;
  }
  function mood(H, m) {
    const smile = m === "smile", wow = m === "wow", by = wow ? -5 : 0;
    H.mo.setAttribute("d", smile ? "M-8,-12 Q0,-3 8,-12" : "M-6,-10 Q0,-7 6,-10");
    H.mo.style.opacity = wow ? 0 : 1; H.mO.style.opacity = wow ? 1 : 0;
    H.bL.setAttribute("d", `M-15,${-34 + by} L-4,${-35 + by}`); H.bR.setAttribute("d", `M4,${-35 + by} L15,${-34 + by}`);
    H.eL.setAttribute("r", wow ? 8 : 6.5); H.eR.setAttribute("r", wow ? 8 : 6.5);
    H.pL.setAttribute("r", wow ? 2.6 : 3.2); H.pR.setAttribute("r", wow ? 2.6 : 3.2);
  }
  function bubble(c, p, x, y, w, h, tip, lines, sz) {
    const g = G(c, p);
    R(c, g, x, y, w, h, `fill:var(--sf);stroke:var(--fg);stroke-width:${SW}`, 12);
    const dir = tip.x < x ? -1 : 1, bx = dir < 0 ? x : x + w, a = y + h * 0.5, b = y + h * 0.8;
    c.sv(g, "polygon", { points: `${bx - dir * 1.5},${a} ${bx - dir * 1.5},${b} ${tip.x},${tip.y}`, style: "fill:var(--sf)" });
    L(c, g, bx, a, tip.x, tip.y, `stroke:var(--fg);stroke-width:${SW};stroke-linecap:round`);
    L(c, g, bx, b, tip.x, tip.y, `stroke:var(--fg);stroke-width:${SW};stroke-linecap:round`);
    lines.forEach((t, i) => TX(c, g, x + w / 2, y + (h / (lines.length + 1)) * (i + 1) + sz * 0.35, t, { s: sz }));
    return g;
  }

  SKD.add({
    code: "CH-01", group: "char", ru: "Взгляд на предмет",
    what: "Падает яблоко: сначала сдвигаются зрачки, затем голова поворачивается к нему.",
    when: "Герой замечает событие.",
    fam: FC, proj: ["serial", "arseniy"], hold: 1100,
    spec: "D=500 мс; зрачки 0→+5 за 0–120 мс E2; голова вокруг шеи 0→+8° на 120–500 мс E1; корень неподвижен; цель справа.",
    async play(c) {
      const s = c.svg();
      floorLine(c, s, 238);
      PA(c, s, "M492,20 Q424,30 346,42", "fill:none;stroke:var(--mu);stroke-width:7;stroke-linecap:round");
      L(c, s, 372, 36, 372, 50, "stroke:var(--mu);stroke-width:3;stroke-linecap:round");
      const ap = G(c, s, { transform: "translate(372,64)" });
      C(c, ap, 0, 0, 12, `fill:var(--ac);stroke:var(--fg);stroke-width:${SW}`);
      L(c, ap, 0, -12, 2, -19, "stroke:var(--fg);stroke-width:2.5;stroke-linecap:round");
      const H = hero(c, s, 170, 238, 0.92);
      mood(H, "n");
      const fall = tk(c, 820, (t) => { ap.setAttribute("transform", `translate(372,${Math.min(226, 64 + 0.5 * 512 * Math.pow(t / 1000, 2))})`); });
      const eyes = [H.pL, H.pR].map((p) => c.a(p, [{ transform: "translateX(0)" }, { transform: "translateX(3px)" }], { duration: 120, easing: c.E.E2 }));
      const turn = c.a(H.head, [{ transform: "rotate(0deg)" }, { transform: "rotate(8deg)" }], { duration: 380, delay: 120, easing: c.E.E1, fill: "both" });
      const brows = c.wait(120).then(() => { H.bL.setAttribute("d", "M-15,-37 L-4,-38"); H.bR.setAttribute("d", "M4,-38 L15,-37"); });
      await c.all(fall, ...eyes, turn, brows);
    },
  });

  SKD.add({
    code: "CH-02", group: "char", ru: "Короткий кивок",
    what: "Голова один раз опускается и возвращается; на карточке появляется галочка.",
    when: "Согласие или подтверждение.",
    fam: FC, proj: ["serial", "arseniy"], hold: 1100,
    spec: "D=600 мс; вокруг шеи 0→+10° на 0–220 мс E1, +10°→0 на 220–600 мс E2; остальной риг стоит.",
    async play(c) {
      const s = c.svg();
      floorLine(c, s, 238);
      const H = hero(c, s, 160, 238, 0.92);
      mood(H, "n");
      R(c, s, 290, 80, 160, 90, SFS, 10);
      TX(c, s, 370, 148, "a = F/m", { s: 32 });
      const ck = PA(c, s, "M388,100 L402,112 L428,90", "fill:none;stroke:var(--ac);stroke-width:6;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 2;stroke-dashoffset:1");
      ck.setAttribute("pathLength", "1");
      const E1 = c.E.E1, E2 = c.E.E2, o = 220 / 600;
      const nod = c.a(H.head, [
        { transform: "rotate(0deg)", offset: 0, easing: E1 }, { transform: "rotate(10deg)", offset: o, easing: E2 }, { transform: "rotate(0deg)", offset: 1 },
      ], { duration: 600, easing: "linear" });
      const pitch = c.a(H.face, [
        { transform: "translateY(0)", offset: 0, easing: E1 }, { transform: "translateY(3px)", offset: o, easing: E2 }, { transform: "translateY(0)", offset: 1 },
      ], { duration: 600, easing: "linear" });
      const sm = c.wait(220).then(() => mood(H, "smile"));
      await c.all(nod, pitch, sm);
      await c.a(ck, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 300, easing: "linear" });
    },
  });

  SKD.add({
    code: "CH-03", group: "char", ru: "Указание рукой",
    what: "Герой поднимает руку к доске справа, на кисти появляется указательный палец.",
    when: "Герой объясняет деталь справа.",
    fam: FC, proj: ["serial", "arseniy"], hold: 1100,
    spec: "D=700 мс; плечо rotateZ 0→−55° за 500 мс E2, предплечье 0→+20° E2; указательная кисть вместо нейтральной в 400 мс E6; 500–700 мс удержание.",
    async play(c) {
      const s = c.svg();
      floorLine(c, s, 238);
      R(c, s, 290, 62, 160, 120, SFS, 10);
      TX(c, s, 370, 112, "F = 5 Н", { s: 32 });
      L(c, s, 330, 148, 400, 148, "stroke:var(--ac);stroke-width:4");
      c.sv(s, "polygon", { points: headPts(410, 148, 0, 12, 6), style: "fill:var(--ac)" });
      const H = hero(c, s, 150, 238, 0.92);
      mood(H, "n");
      H.foreR.style.transform = "rotate(-50deg)";
      const fing = L(c, H.foreR, 0, 38, 0, 54, "stroke:var(--fg);stroke-width:5;stroke-linecap:round;opacity:0");
      const E2 = c.E.E2;
      await c.all(
        c.a(H.armR, [{ transform: "rotate(-7deg)" }, { transform: "rotate(-62deg)" }], { duration: 500, easing: E2 }),
        c.a(H.foreR, [{ transform: "rotate(-50deg)" }, { transform: "rotate(-30deg)" }], { duration: 500, easing: E2 }),
        c.a(fing, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: 400, easing: "linear", fill: "both" }),
        c.wait(700),
      );
    },
  });

  SKD.add({
    code: "CH-04", group: "char", ru: "Два шага",
    what: "Герой делает два шага к флажку; руки качаются в противофазе с ногами.",
    when: "Короткий проход в ограниченной анимации.",
    fam: FC, proj: ["serial"], hold: 1100,
    spec: "D=800 мс; корень A→B E0; ноги −20/+20/−20/+20/0° и +20/−20/+20/−20/0° по 200 мс, E1; руки в противофазе ±12°; корень y 0/−6/0/−6/0.",
    async play(c) {
      const s = c.svg();
      floorLine(c, s, 238);
      L(c, s, 414, 238, 414, 146, "stroke:var(--fg);stroke-width:4;stroke-linecap:round");
      c.sv(s, "polygon", { points: "414,146 454,162 414,178", style: `fill:var(--ac);stroke:var(--fg);stroke-width:${SW};stroke-linejoin:round` });
      const S = 0.92, H = hero(c, s, 96, 238, S);
      mood(H, "smile");
      const E1 = c.E.E1, off = [0, 0.25, 0.5, 0.75, 1];
      const seq = (el, base, vals) => c.a(el, vals.map((v, i) => ({ transform: `rotate(${base + v}deg)`, offset: off[i], easing: i < 4 ? E1 : "linear" })), { duration: 800, easing: "linear" });
      await c.all(
        c.a(H.root, [{ transform: `translate(96px,238px) scale(${S})` }, { transform: `translate(278px,238px) scale(${S})` }], { duration: 800, easing: "linear" }),
        seq(H.legL, 0, [-20, 20, -20, 20, 0]), seq(H.legR, 0, [20, -20, 20, -20, 0]),
        seq(H.armL, 7, [12, -12, 12, -12, 0]), seq(H.armR, -7, [-12, 12, -12, 12, 0]),
        c.a(H.body, [0, -3, 0, -3, 0].map((v, i) => ({ transform: `translateY(${v}px)`, offset: off[i], easing: i < 4 ? E1 : "linear" })), { duration: 800, easing: "linear" }),
      );
    },
  });

  SKD.add({
    code: "CH-05", group: "char", ru: "Прыжок от неожиданности",
    what: "Герой сжимается, подпрыгивает с поднятыми руками и приземляется; тень сжимается.",
    when: "Один сюжетный сюрприз.",
    fam: FC, proj: ["serial"], hold: 1100,
    spec: "D=900 мс; 0–120 мс sy 1→0.9, sx 1→1.08 E1; 120–420 y→−80 E2; 420–720 y→0 E3; 720–800 sy→0.94 E1; 800–900 sy→1 E2.",
    async play(c) {
      const s = c.svg();
      floorLine(c, s, 240);
      const S = 0.85, H = hero(c, s, 240, 240, S);
      mood(H, "n");
      const bang = TX(c, s, 292, 70, "!", { s: 50, c: "--ac", w: 800, st: "opacity:0" });
      const E1 = c.E.E1, E2 = c.E.E2, E3 = c.E.E3, A = 44;
      const tf = (y, sx, sy) => `translateY(${y}px) scale(${sx},${sy})`;
      const sw = c.wait(120).then(() => { mood(H, "wow"); return c.a(bang, [{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1)" }], { duration: 200, easing: c.E.E4, fill: "both" }); });
      await c.all(
        c.a(H.body, [
          { transform: tf(0, 1, 1), offset: 0, easing: E1 }, { transform: tf(0, 1.08, 0.9), offset: 120 / 900, easing: E2 },
          { transform: tf(-A, 1, 1), offset: 420 / 900, easing: E3 }, { transform: tf(0, 1, 1), offset: 720 / 900, easing: E1 },
          { transform: tf(0, 1, 0.94), offset: 800 / 900, easing: E2 }, { transform: tf(0, 1, 1), offset: 1 },
        ], { duration: 900, easing: "linear" }),
        c.a(H.sh, [{ transform: "scale(1)", offset: 0 }, { transform: "scale(1)", offset: 120 / 900, easing: E2 }, { transform: "scale(.62)", offset: 420 / 900, easing: E3 }, { transform: "scale(1)", offset: 720 / 900 }, { transform: "scale(1)", offset: 1 }], { duration: 900, easing: "linear" }),
        c.a(H.armL, [{ transform: "rotate(7deg)", offset: 0 }, { transform: "rotate(7deg)", offset: 120 / 900, easing: E2 }, { transform: "rotate(150deg)", offset: 420 / 900, easing: E1 }, { transform: "rotate(30deg)", offset: 1 }], { duration: 900, easing: "linear" }),
        c.a(H.armR, [{ transform: "rotate(-7deg)", offset: 0 }, { transform: "rotate(-7deg)", offset: 120 / 900, easing: E2 }, { transform: "rotate(-150deg)", offset: 420 / 900, easing: E1 }, { transform: "rotate(-30deg)", offset: 1 }], { duration: 900, easing: "linear" }),
        sw,
      );
    },
  });

  SKD.add({
    code: "CH-06", group: "char", ru: "Перенос веса",
    what: "Стопы стоят, таз уходит вправо, колени сгибаются; затем герой начинает реплику.",
    when: "Спокойный диалог без постоянного покачивания.",
    fam: FC, proj: ["serial", "arseniy"], hold: 1200,
    spec: "D=1000 мс, E1; таз x 0→+14 px, торс rotateZ 0→−3°, голова +3°; стопы закреплены, кости постоянной длины (IK).",
    async play(c) {
      const s = c.svg();
      floorLine(c, s, 238);
      const H = hero(c, s, 140, 238, 0.92, { ik: true, drop: 2 });
      mood(H, "n");
      const bub = bubble(c, s, 236, 56, 190, 78, { x: 206, y: 112 }, ["Смотри:", "g = 9,8 м/с²"], 24);
      bub.style.opacity = 0;
      const DX = 11;
      await tk(c, 1000, (t, p) => {
        const q = EF.E1(p);
        H.setLegs(q * DX);
        H.torso.style.transform = `translate(${q * DX}px,0) rotate(${-3 * q}deg)`;
        H.head.style.transform = `rotate(${3 * q}deg)`;
      });
      await c.a(bub, [{ opacity: 0, transform: "scale(.85)" }, { opacity: 1, transform: "scale(1)" }], { duration: 300, easing: c.E.E4, fill: "both" });
    },
  });

  SKD.add({
    code: "CH-07", group: "char", ru: "Реплика ртом",
    what: "Крупный план: рот открывается и закрывается в такт реплике, лицо и корпус стоят.",
    when: "Предпросмотр речи; в финале — по аудио.",
    fam: FC, proj: ["serial", "arseniy"], hold: 1100,
    spec: "D=960 мс; раскрытие на 0/120/…/960 мс: 0/8/3/10/0/6/3/8/0; E1 между точками; ширина 28 px постоянна.",
    async play(c) {
      const s = c.svg();
      const H = hero(c, s, 130, 470, 2.0, { noShadow: true });
      mood(H, "n");
      H.mo.style.opacity = 0;
      const mg = G(c, H.face, { transform: "translate(0,-9)" });
      const mt = G(c, mg, { style: "transform:scaleY(.14)" });
      c.sv(mt, "ellipse", { cx: 0, cy: 0, rx: 6.5, ry: 5, style: "fill:var(--fg);stroke:var(--fg);stroke-width:2.5;vector-effect:non-scaling-stroke" });
      bubble(c, s, 252, 40, 212, 108, { x: 214, y: 118 }, ["В вакууме все тела", "падают одинаково."], 21);
      const vals = [0, 8, 3, 10, 0, 6, 3, 8, 0];
      await c.a(mt, vals.map((v, i) => ({ transform: `scaleY(${Math.max(0.14, (v * 0.77) / 10)})`, offset: i / 8, easing: i < 8 ? c.E.E1 : "linear" })), { duration: 960, easing: "linear" });
    },
  });

  SKD.add({
    code: "CH-08", group: "char", ru: "Три ключевые позы",
    what: "Забиваем гвоздь: подготовка, удар, результат — три позы без промежуточных кадров.",
    when: "Аниме, бумажный герой и ограниченная анимация.",
    fam: FC, proj: ["serial"], hold: 1100,
    spec: "D=900 мс; «подготовка» 0–300 мс, «действие» 300–500 мс, «результат» 500–900 мс; E6 на 300/500 мс; корень и стопы совпадают.",
    async play(c) {
      const s = c.svg();
      floorLine(c, s, 238);
      const nail = G(c, s, {});
      R(c, nail, 252, 166, 4, 14, "fill:var(--fg)", 1.5);
      R(c, nail, 256, 171.5, 70, 3, "fill:var(--fg)");
      R(c, s, 296, 98, 48, 140, SFS, 3);
      for (let k = 0; k < 4; k++) L(c, s, 306 + k * 10, 108, 306 + k * 10, 228, "stroke:var(--mu);stroke-width:1.5;opacity:.6");
      const H = hero(c, s, 142, 238, 0.88);
      const hm = G(c, H.foreR);
      L(c, hm, 0, 30, 0, 76, "stroke:var(--fg);stroke-width:5;stroke-linecap:round");
      R(c, hm, -18, 72, 36, 16, "fill:var(--fg)", 4);
      R(c, hm, -18, 72, 36, 5, "fill:var(--ac)", 0);
      const fx = G(c, s, { style: "opacity:0" });
      [-14, 0, 14].forEach((dy) => L(c, fx, 236, 174 + dy, 224 - Math.abs(dy) * 0.4, 174 + dy * 1.4, "stroke:var(--ac);stroke-width:3.5;stroke-linecap:round"));
      const sp = G(c, s, { style: "opacity:0" });
      [[286, 160, 296, 150], [288, 172, 302, 172], [286, 184, 296, 194]].forEach((l) => L(c, sp, l[0], l[1], l[2], l[3], "stroke:var(--ac);stroke-width:3.5;stroke-linecap:round"));
      const chips = ["подготовка", "удар", "результат"].map((t, i) => {
        const w = [112, 62, 100][i], x = [10, 128, 196][i];
        const r = R(c, s, x, 246, w, 22, "fill:var(--sf);stroke:var(--mu);stroke-width:2", 11);
        const tt = TX(c, s, x + w / 2, 262, t, { s: 15, c: "--mu" });
        return { r, tt };
      });
      const POSE = [
        { aR: -150, fR: -48, aL: 40, fL: 10, to: -6, hd: -4, m: "n", nailX: 0, sp: 0, fx: 0 },
        { aR: -80, fR: 43, aL: 25, fL: 5, to: 11, hd: 6, m: "wow", nailX: 0, sp: 0, fx: 1 },
        { aR: -14, fR: 12, aL: 8, fL: 4, to: 0, hd: 3, m: "smile", nailX: 38, sp: 1, fx: 0 },
      ];
      const set = (i) => {
        const P = POSE[i];
        H.armR.style.transform = `rotate(${P.aR}deg)`; H.foreR.style.transform = `rotate(${P.fR}deg)`;
        H.armL.style.transform = `rotate(${P.aL}deg)`; H.foreL.style.transform = `rotate(${P.fL}deg)`;
        H.torso.style.transform = `rotate(${P.to}deg)`; H.head.style.transform = `rotate(${P.hd}deg)`;
        mood(H, P.m);
        nail.style.transform = `translateX(${P.nailX}px)`; sp.style.opacity = P.sp; fx.style.opacity = P.fx;
        chips.forEach((ch, k) => {
          ch.r.style.fill = k === i ? "var(--ac)" : "var(--sf)"; ch.r.style.stroke = k === i ? "var(--fg)" : "var(--mu)";
          ch.tt.style.fill = k === i ? "var(--sf)" : "var(--mu)";
        });
      };
      set(0);
      await c.wait(300); set(1);
      await c.wait(200); set(2);
      await c.wait(400);
    },
  });

  /* =====================================================================
     DR — чертёж, физика и схемы
     ===================================================================== */
  const FD = ["F05", "F03", "F09", "F04"];

  SKD.add({
    code: "DR-01", group: "draw", ru: "Построение контура",
    what: "Наклонная плоскость и брусок прорисовываются одной линией, затем появляется угол α.",
    when: "Фигура, прибор, план комнаты.",
    fam: FD, proj: ["arseniy", "democrm"], hold: 1200,
    spec: "D=1200 мс, E0; длина пути 0→100%; при n путях время делится пропорционально длинам без пауз.",
    async play(c) {
      const s = c.svg();
      const O = { x: 90, y: 232 };
      const tri = `M${O.x},${O.y} L390,${O.y} L390,${(O.y - 300 * Math.tan(Math.PI / 6)).toFixed(1)} Z`;
      const d = { x: Math.cos(Math.PI / 6), y: -0.5 }, n = { x: -0.5, y: -Math.cos(Math.PI / 6) };
      const P0 = { x: O.x + 120 * d.x, y: O.y + 120 * d.y };
      const q = [[0, 0], [50, 0], [50, 30], [0, 30]].map(([a, b]) => `${(P0.x + a * d.x + b * n.x).toFixed(1)},${(P0.y + a * d.y + b * n.y).toFixed(1)}`);
      const blk = `M${q[0]} L${q[1]} L${q[2]} L${q[3]} Z`;
      const stl = `fill:none;stroke:var(--fg);stroke-width:${SW};stroke-linejoin:round`;
      const paths = [PA(c, s, tri, stl), PA(c, s, blk, stl)];
      const lens = paths.map((p) => p.getTotalLength()), tot = lens[0] + lens[1];
      paths.forEach((p, i) => { p.style.strokeDasharray = lens[i]; p.style.strokeDashoffset = lens[i]; });
      const arc = PA(c, s, `M${O.x + 52},${O.y} A52,52 0 0 0 ${(O.x + 52 * Math.cos(Math.PI / 6)).toFixed(1)},${(O.y - 26).toFixed(1)}`, "fill:none;stroke:var(--ac);stroke-width:3;stroke-linecap:round;opacity:0");
      const lab = TX(c, s, 156, 224, "α = 30°", { a: "start", s: 22, c: "--ac", st: "opacity:0" });
      await tk(c, 1200, (t, p) => {
        let done = p * tot;
        paths.forEach((pa, i) => { const k = cl(done / lens[i]); pa.style.strokeDashoffset = lens[i] * (1 - k); done -= lens[i]; });
      });
      await c.all(fadeIn(c, arc, 250), fadeIn(c, lab, 250));
    },
  });

  SKD.add({
    code: "DR-02", group: "draw", ru: "Размерная выноска",
    what: "Над бруском ставятся выносные линии, размерная линия и значение «l = 24 см».",
    when: "Замер или геометрическая величина.",
    fam: FD, proj: ["arseniy", "democrm"], hold: 1200,
    spec: "D=900 мс; выносные от A/B+(0,40) к A/B 0–240 мс E0; линия A→B 240–650 мс E0, наконечники 8 px; значение α 0→1 на 650–900 мс.",
    async play(c) {
      const s = c.svg();
      const A = { x: 120, y: 112 }, B = { x: 360, y: 112 };
      R(c, s, A.x, A.y + 40, B.x - A.x, 34, SFS, 3);
      TX(c, s, 240, A.y + 63, "брусок", { s: 18, c: "--mu" });
      const ext = [A, B].map((P) => L(c, s, P.x, A.y + 40, P.x, A.y + 40, `stroke:var(--fg);stroke-width:2.5`));
      const dl = mkArrow(c, s, "--ac", SW, 8, 4);
      const aEnd = c.sv(s, "polygon", { points: headPts(A.x, A.y, Math.PI, 8, 4), style: "fill:var(--ac);opacity:0" });
      const box = G(c, s, { style: "opacity:0" });
      R(c, box, 240 - 62, A.y - 16 - 34, 124, 34, `fill:var(--sf);stroke:var(--fg);stroke-width:2.5`, 7);
      TX(c, box, 240, A.y - 16 - 34 + 24, "l = 24 см", { s: 22 });
      await tk(c, 900, (t) => {
        const e = EF.E0(win(t, 0, 240));
        ext.forEach((l, i) => l.setAttribute("y2", A.y + 40 - 40 * e));
        const q = win(t, 240, 650);
        if (q > 0) { aEnd.style.opacity = 1; setArrow(dl, A.x + 7 * 0, A.y, lerp(A.x, B.x, q), A.y); }
        box.style.opacity = win(t, 650, 900);
      });
    },
  });

  SKD.add({
    code: "DR-03", group: "draw", ru: "Вектор из точки",
    what: "Из центра шара вырастает вектор g вниз с подписью «g = 9,8 м/с²».",
    when: "Сила, скорость, смещение с верным направлением.",
    fam: FD, proj: ["arseniy", "serial"], hold: 1200,
    spec: "D=700 мс, E2; основание A неподвижно, конец A→B; наконечник 12 px; подпись α 0→1 на 500–700 мс E0.",
    async play(c) {
      const s = c.svg();
      L(c, s, 130, 214, 350, 214, "stroke:var(--mu);stroke-width:3;stroke-linecap:round");
      const A = { x: 240, y: 56 }, B = { x: 240, y: 154 };
      C(c, s, A.x, A.y, 17, SFS);
      const v = mkArrow(c, s, "--ac", 4, 12, 6.5);
      const lb = TX(c, s, 264, 118, "g = 9,8 м/с²", { a: "start", s: 24, c: "--ac", st: "opacity:0" });
      const sub = TX(c, s, 264, 144, "свободное падение", { a: "start", s: 15, c: "--mu", st: "opacity:0" });
      await tk(c, 700, (t, p) => {
        const q = EF.E2(p);
        setArrow(v, A.x, A.y, lerp(A.x, B.x, q), lerp(A.y, B.y, q));
        lb.style.opacity = sub.style.opacity = win(t, 500, 700);
      });
    },
  });

  SKD.add({
    code: "DR-04", group: "draw", ru: "Оси и шкала",
    what: "Собираются оси v(t) и шкала: сначала t, затем v, потом деления с единицами.",
    when: "Подготовить график физической зависимости.",
    fam: FD, proj: ["arseniy"], hold: 1200,
    spec: "D=1000 мс; ось X от O 0–400 мс E0; ось Y 200–600 мс E0; деления и подписи α 0→1 на 600–1000 мс E0.",
    async play(c) {
      const s = c.svg();
      const O = { x: 80, y: 218 }, XE = { x: 425, y: 218 }, YE = { x: 80, y: 34 };
      const ax = mkArrow(c, s, "--fg", SW, 10, 5), ay = mkArrow(c, s, "--fg", SW, 10, 5);
      const ticks = G(c, s, { style: "opacity:0" });
      [1, 2, 3, 4].forEach((k) => { const x = O.x + 80 * k; L(c, ticks, x, O.y - 6, x, O.y + 6, "stroke:var(--fg);stroke-width:2.5"); TX(c, ticks, x, O.y + 27, String(k), { s: 19 }); });
      [10, 20, 30].forEach((k) => { const y = O.y - 5 * k; L(c, ticks, O.x - 6, y, O.x + 6, y, "stroke:var(--fg);stroke-width:2.5"); TX(c, ticks, O.x - 14, y + 6, String(k), { a: "end", s: 19 }); });
      TX(c, ticks, O.x - 14, O.y + 6, "0", { a: "end", s: 19 });
      TX(c, ticks, XE.x + 12, XE.y + 6, "t, с", { a: "start", s: 21, c: "--ac" });
      TX(c, ticks, YE.x + 14, YE.y + 8, "v, м/с", { a: "start", s: 21, c: "--ac" });
      await tk(c, 1000, (t) => {
        setArrow(ax, O.x, O.y, lerp(O.x, XE.x, win(t, 0, 400)), O.y);
        setArrow(ay, O.x, O.y, O.x, lerp(O.y, YE.y, win(t, 200, 600)));
        ticks.style.opacity = win(t, 600, 1000);
      });
    },
  });

  SKD.add({
    code: "DR-05", group: "draw", ru: "Активный маршрут",
    what: "По цепочке F → a → v → s подряд загораются связи с формулами.",
    when: "Заявка → замер → монтаж в DemoCRM.",
    fam: FD.concat(["F01"]), proj: ["democrm", "arseniy"], hold: 1100,
    spec: "Для n рёбер D=450n мс; ребро i открывает AC-накладку по длине 350 мс с t=450i, E0; пауза 100 мс; линии MU остаются.",
    async play(c) {
      const s = c.svg();
      const nodes = [["F", "сила"], ["a", "ускорение"], ["v", "скорость"], ["s", "путь"]], xs = [70, 190, 310, 430], y = 122;
      const frm = ["a = F/m", "v = a·t", "s = v·t/2"];
      const lit = nodes.map(([k, w], i) => {
        R(c, s, xs[i] - 30, y - 30, 60, 60, SFS, 10);
        TX(c, s, xs[i], y + 11, k, { s: 32 });
        TX(c, s, xs[i], y - 42, w, { s: 16, c: "--mu" });
        return R(c, s, xs[i] - 30, y - 30, 60, 60, `fill:none;stroke:var(--ac);stroke-width:4;opacity:${i === 0 ? 1 : 0}`, 10);
      });
      const tasks = [];
      for (let i = 0; i < 3; i++) {
        const x1 = xs[i] + 31, x2 = xs[i + 1] - 31, hx = x2 - 2;
        L(c, s, x1, y, hx - 10, y, "stroke:var(--mu);stroke-width:3");
        c.sv(s, "polygon", { points: headPts(hx, y, 0, 11, 5.5), style: "fill:var(--mu)" });
        TX(c, s, (x1 + x2) / 2, 184, frm[i], { s: 19, c: "--mu" });
        const ov = PA(c, s, `M${x1},${y} L${hx - 10},${y}`, "fill:none;stroke:var(--ac);stroke-width:3.5;stroke-dasharray:1 2;stroke-dashoffset:1");
        ov.setAttribute("pathLength", "1");
        const oh = c.sv(s, "polygon", { points: headPts(hx, y, 0, 11, 5.5), style: "fill:var(--ac);opacity:0" });
        const ot = TX(c, s, (x1 + x2) / 2, 184, frm[i], { s: 19, c: "--ac", st: "opacity:0" });
        tasks.push(
          c.a(ov, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 350, delay: 450 * i, easing: "linear", fill: "both" }),
          c.a(oh, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: 450 * i + 300, easing: "linear", fill: "both" }),
          c.a(ot, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: 450 * i, easing: "linear", fill: "both" }),
          c.a(lit[i + 1], [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: 450 * i + 350, easing: "linear", fill: "both" }),
        );
      }
      await c.all(...tasks);
    },
  });

  SKD.add({
    code: "DR-06", group: "draw", ru: "Сумма векторов",
    what: "Вектор F₂ переносится к концу F₁, затем строится равнодействующая 3 Н и 4 Н — 5 Н.",
    when: "Геометрическое сложение заданных векторов.",
    fam: FD, proj: ["arseniy"], hold: 1200,
    spec: "D=1400 мс; 0–700 мс второй вектор целиком смещается на B−A, E1; 700–1400 мс результирующая A→B+C−A открывается по длине E0.",
    async play(c) {
      const s = c.svg();
      const A = { x: 110, y: 222 }, B = { x: 230, y: 222 }, Cc = { x: 110, y: 62 };
      const dx = B.x - A.x, dy = B.y - A.y;
      L(c, s, Cc.x, Cc.y, A.x, A.y, "stroke:var(--mu);stroke-width:2.5;stroke-dasharray:8 6;opacity:.7");
      const v1 = mkArrow(c, s, "--fg", SW, 12, 6), v2 = mkArrow(c, s, "--fg", SW, 12, 6), vr = mkArrow(c, s, "--ac", 4, 14, 7);
      setArrow(v1, A.x, A.y, B.x, B.y); setArrow(v2, A.x, A.y, Cc.x, Cc.y);
      C(c, s, A.x, A.y, 5, "fill:var(--fg)");
      TX(c, s, (A.x + B.x) / 2, 250, "F₁ = 3 Н", { s: 21 });
      const l2 = TX(c, s, 98, 150, "F₂ = 4 Н", { a: "end", s: 21 });
      const l2b = TX(c, s, 244, 150, "F₂ = 4 Н", { a: "start", s: 21, st: "opacity:0" });
      const lr = TX(c, s, 198, 96, "F = 5 Н", { a: "end", s: 24, c: "--ac", st: "opacity:0" });
      await tk(c, 1400, (t) => {
        const q = EF.E1(win(t, 0, 700));
        setArrow(v2, A.x + dx * q, A.y + dy * q, Cc.x + dx * q, Cc.y + dy * q);
        l2.style.opacity = 1 - q; l2b.style.opacity = q >= 1 ? 1 : 0;
        const r = win(t, 700, 1400);
        if (r > 0) setArrow(vr, A.x, A.y, lerp(A.x, Cc.x + dx, r), lerp(A.y, Cc.y + dy, r));
        lr.style.opacity = r >= 1 ? 1 : 0;
      });
    },
  });

  SKD.add({
    code: "DR-07", group: "draw", ru: "Узел с пояснением",
    what: "Резистор отделяется от цепи, уходит вверх и получает подпись «R = 20 Ом».",
    when: "Объяснить компонент, не теряя его места в схеме.",
    fam: FD.concat(["F01"]), proj: ["democrm", "arseniy"], hold: 1200,
    spec: "D=800 мс; копия узла A→B за 600 мс E2; исходный узел MU α=0.4; пунктир A→B открывается E0; подпись у B α 0→1 на 600–800 мс.",
    async play(c) {
      const s = c.svg();
      const A = { x: 190, y: 204 }, B = { x: 290, y: 78 };
      PA(c, s, "M70,226 V256 H310 V226", "fill:none;stroke:var(--mu);stroke-width:3;stroke-linejoin:round");
      L(c, s, 100, 204, 160, 204, "stroke:var(--mu);stroke-width:3");
      L(c, s, 220, 204, 280, 204, "stroke:var(--mu);stroke-width:3");
      const node = (parent, x, y, k, st, col) => { R(c, parent, x - 30, y - 22, 60, 44, st, 9); TX(c, parent, x, y + 9, k, { s: 25, c: col }); };
      node(s, 70, 204, "ε", SFS, "--fg");
      node(s, 310, 204, "A", SFS, "--fg");
      const orig = G(c, s, { style: "opacity:.4" });
      node(orig, A.x, A.y, "R", `fill:var(--sf);stroke:var(--mu);stroke-width:${SW}`, "--mu");
      const link = L(c, s, A.x, A.y - 22, A.x, A.y - 22, "stroke:var(--ac);stroke-width:2.5;stroke-dasharray:8 6");
      const cp = G(c, s, {});
      node(cp, 0, 0, "R", `fill:var(--sf);stroke:var(--ac);stroke-width:${SW}`, "--ac");
      cp.setAttribute("transform", `translate(${A.x},${A.y})`);
      const l1 = TX(c, s, 336, 76, "R = 20 Ом", { a: "start", s: 24, st: "opacity:0" });
      const l2 = TX(c, s, 336, 102, "I = U / R", { a: "start", s: 19, c: "--mu", st: "opacity:0" });
      await tk(c, 800, (t) => {
        const q = EF.E2(win(t, 0, 600)), lin = win(t, 0, 600);
        cp.setAttribute("transform", `translate(${lerp(A.x, B.x, q)},${lerp(A.y, B.y, q)})`);
        link.setAttribute("x2", lerp(A.x, B.x, lin)); link.setAttribute("y2", lerp(A.y - 22, B.y + 22, lin));
        l1.style.opacity = l2.style.opacity = win(t, 600, 800);
      });
    },
  });

  SKD.add({
    code: "DR-08", group: "draw", ru: "Отслеживание точки",
    what: "Брошенное тело идёт по параболе; проекции на оси и числа t, x, h бегут за ним.",
    when: "Чтение координат и параметрической зависимости.",
    fam: FD, proj: ["arseniy"], hold: 1100,
    spec: "D=1800 мс, E0 по u=0→1; x=60+350u, y=76+150u² px (x=v₀t, h=h₀−gt²/2: v₀=20 м/с, h₀=15 м, t=1,75u с); штриховые проекции.",
    async play(c) {
      const s = c.svg();
      const O = { x: 60, y: 226 };
      const ax = mkArrow(c, s, "--fg", SW, 10, 5), ay = mkArrow(c, s, "--fg", SW, 10, 5);
      setArrow(ax, O.x, O.y, 452, O.y); setArrow(ay, O.x, O.y, O.x, 34);
      [10, 20, 30].forEach((k) => { const x = O.x + 10 * k; L(c, s, x, O.y - 5, x, O.y + 5, "stroke:var(--fg);stroke-width:2.5"); TX(c, s, x, O.y + 24, String(k), { s: 17 }); });
      [5, 10, 15].forEach((k) => { const y = O.y - 10 * k; L(c, s, O.x - 5, y, O.x + 5, y, "stroke:var(--fg);stroke-width:2.5"); TX(c, s, O.x - 11, y + 6, String(k), { a: "end", s: 17 }); });
      TX(c, s, 448, 252, "x, м", { a: "end", s: 18, c: "--mu" });
      TX(c, s, 74, 30, "h, м", { a: "start", s: 18, c: "--mu" });
      let d = "";
      for (let i = 0; i <= 40; i++) { const u = i / 40; d += (i ? "L" : "M") + (60 + 350 * u).toFixed(1) + "," + (76 + 150 * u * u).toFixed(1); }
      PA(c, s, d, "fill:none;stroke:var(--mu);stroke-width:2;stroke-dasharray:3 7;stroke-linecap:round");
      const px = L(c, s, 60, 76, 60, 226, "stroke:var(--ac);stroke-width:2.5;stroke-dasharray:8 6");
      const py = L(c, s, 60, 76, 60, 76, "stroke:var(--ac);stroke-width:2.5;stroke-dasharray:8 6");
      const dot = C(c, s, 60, 76, 6, "fill:var(--ac);stroke:var(--fg);stroke-width:2");
      TX(c, s, 296, 40, "v₀ = 20 м/с", { a: "start", s: 19, c: "--mu" });
      const t1 = TX(c, s, 296, 66, "", { a: "start", s: 21 });
      const t2 = TX(c, s, 296, 92, "", { a: "start", s: 21 });
      const t3 = TX(c, s, 296, 118, "", { a: "start", s: 21 });
      const upd = (u) => {
        const x = 60 + 350 * u, y = 76 + 150 * u * u, tt = 1.75 * u;
        dot.setAttribute("cx", x); dot.setAttribute("cy", y);
        px.setAttribute("x1", x); px.setAttribute("x2", x); px.setAttribute("y1", y);
        py.setAttribute("x2", x); py.setAttribute("y1", y); py.setAttribute("y2", y);
        t1.textContent = "t = " + fmt(tt, 2) + " с"; t2.textContent = "x = " + fmt(20 * tt, 1) + " м"; t3.textContent = "h = " + fmt(Math.max(0, 15 - 4.9 * tt * tt), 1) + " м";
      };
      upd(0);
      await c.wait(250);
      await tk(c, 1800, (t, p) => upd(p));
    },
  });
})();

;
/* Модуль 40: PX (пиксель и ретроэкран), VG (объём, свет, пространство), FX (печать, фактура, материал).
   Спецификации: research/ASTRA_TAXONOMY.md, разделы 2.1, 2.18–2.21 и 5. Сцена 480×270, цвета только из переменных сцены.
   Правила слоя «не включать»: без глитча и RGB-разъезда, без мерцания, без «кипящей» фактуры — маски зерна и текстуры
   считаются один раз по seed=17 и приклеены к предмету. Файл ничего не трогает в document при загрузке. */
(function () {
  "use strict";
  /* ===================== общие помощники ===================== */
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const r1 = (v) => Math.round(v * 10) / 10;
  let UID = 0;
  const uid = () => "pvf" + ++UID;

  /* cubic-bezier решатель: покадровые сцены идут по тем же кривым E1–E4, что и Web Animations */
  function bez(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t;
    return (x) => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 24; i++) { const v = X(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
      return Y(t);
    };
  }
  const EF = { E0: (x) => x, E1: bez(0.33, 0, 0.67, 1), E2: bez(0.22, 1, 0.36, 1), E3: bez(0.4, 0, 1, 1), E4: bez(0.16, 1.25, 0.3, 1) };
  /* E5: steps(N,end) — индекс шага 0…N, p=1 даёт N */
  const stepK = (p, N) => Math.min(N, Math.floor(p * N + 1e-9));

  /* ---- цвет: переменные сцены → массивы [r,g,b] ---- */
  let _cx = null;
  function parseCol(str) {
    str = String(str).trim();
    let m;
    if ((m = /^#([0-9a-f]{6})$/i.exec(str))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    if ((m = /^#([0-9a-f]{3})$/i.exec(str))) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16)];
    if ((m = /^rgba?\(([^)]+)\)/i.exec(str))) { const a = m[1].split(/[ ,\/]+/).map(parseFloat); return [a[0], a[1], a[2]]; }
    if (!_cx) _cx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    _cx.clearRect(0, 0, 1, 1); _cx.fillStyle = "#000"; _cx.fillStyle = str; _cx.fillRect(0, 0, 1, 1);
    const d = _cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
  }
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const S = (a, al) => (al == null || al >= 1 ? `rgb(${Math.round(a[0])},${Math.round(a[1])},${Math.round(a[2])})` : `rgba(${Math.round(a[0])},${Math.round(a[1])},${Math.round(a[2])},${r1(al * 1000) / 1000})`);
  const lum = (a) => (0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]) / 255;
  /* палитра сцены: массивы raw + строки; lt/dk — самый светлый и самый тёмный из bg/fg (в любой теме) */
  function PAL(c) {
    const cs = getComputedStyle(c.stage), g = (n) => parseCol(cs.getPropertyValue("--" + n));
    const p = { bg: g("bg"), fg: g("fg"), ac: g("ac"), sf: g("sf"), mu: g("mu") };
    const light = lum(p.bg) >= lum(p.fg);
    const o = { raw: p, light };
    for (const k of ["bg", "fg", "ac", "sf", "mu"]) o[k] = S(p[k]);
    o.lt = light ? o.bg : o.fg; o.dk = light ? o.fg : o.bg;
    p.lt = light ? p.bg : p.fg; p.dk = light ? p.fg : p.bg;
    return o;
  }

  /* ---- SVG-помощники ---- */
  function sv(c, parent, tag, attrs, css) {
    const e = c.sv(parent, tag, attrs || {});
    if (css) e.setAttribute("style", css);
    return e;
  }
  function layer(c, css, parent, vb) {
    const svg = c.svg(vb || "0 0 480 270", css || "", parent);
    const defs = c.sv(svg, "defs", {});
    return { svg, defs };
  }

  /* ===================== пиксельный холст ===================== */
  /* логический холст 96×54 lp, 1 lp = 5 px сцены (демо-масштаб: в ролике холст 240×135, ×8); сглаживания нет нигде */
  const LP = 5, GW = 96, GH = 54;
  const B4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]; // матрица порогов из PX-07
  function pxCanvas(c, parent, W, H) {
    W = W || GW; H = H || GH;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    cv.style.cssText = `position:absolute;left:0;top:0;width:${W * LP}px;height:${H * LP}px;image-rendering:crisp-edges;image-rendering:pixelated`;
    (parent || c.stage).appendChild(cv);
    const x = cv.getContext("2d"); x.imageSmoothingEnabled = false;
    const g = {
      cv, x, W, H,
      r(a, b, w, h, col) { x.fillStyle = col; x.fillRect(Math.round(a), Math.round(b), w, h); },
      px(a, b, col) { x.fillStyle = col; x.fillRect(Math.round(a), Math.round(b), 1, 1); },
      disc(cx, cy, rad, col) { x.fillStyle = col; for (let dy = -rad; dy <= rad; dy++) { const w = Math.floor(Math.sqrt(rad * rad + 0.5 - dy * dy)); x.fillRect(Math.round(cx - w), Math.round(cy + dy), w * 2 + 1, 1); } },
      /* спрайт из строк: символы → цвета (map), '.' прозрачно; k — целый масштаб; ol — цвет контура 1 lp */
      spr(rows, a, b, map, k, ol) {
        k = k || 1;
        if (ol) { x.fillStyle = ol; rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== ".") {
          [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dx, dy]) => { const ii = i + dx, jj = j + dy; const on = jj >= 0 && jj < rows.length && ii >= 0 && ii < rows[jj].length && rows[jj][ii] !== "."; if (!on) x.fillRect(a + ii * k, b + jj * k, k, k); }); } }); }
        rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const ch = row[i]; if (ch !== "." && map[ch]) { x.fillStyle = map[ch]; x.fillRect(a + i * k, b + j * k, k, k); } } });
      },
    };
    return g;
  }
  /* матричное смешение двух цветов: пиксель получает c2, если порог < lvl (0…16) */
  function dith(g, x0, y0, w, h, c1, c2, lvl) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= g.W || y >= g.H) continue;
      if (B4[y & 3][x & 3] < lvl) g.px(x, y, c2); else if (c1) g.px(x, y, c1);
    }
  }
  function ridge(g, peaks, base, col) {
    for (let x = 0; x < g.W; x++) {
      let hh = 0;
      for (const [px, h, sl] of peaks) hh = Math.max(hh, h - Math.round(Math.abs(x - px) * (sl || 1)));
      if (hh > 0) g.r(x, base - hh, 1, hh + 1, col);
    }
  }
  function pine(g, x, y, h, col, trunk) {
    for (let i = 0; i < h; i++) { const w = 1 + 2 * Math.floor(i * 1.0 / 2 + 0.5); g.r(x - (w >> 1), y - h + i, w, 1, col); }
    g.r(x, y, 1, 2, trunk);
  }

  /* ---- пиксельный шрифт 5×7, кириллица и цифры ---- */
  const FONT = {
    "А": ".###.|#...#|#...#|#####|#...#|#...#|#...#", "Б": "#####|#....|#....|####.|#...#|#...#|####.", "В": "####.|#...#|#...#|####.|#...#|#...#|####.",
    "Г": "#####|#....|#....|#....|#....|#....|#....", "Д": ".####|.#..#|.#..#|.#..#|.#..#|#####|#...#", "Е": "#####|#....|#....|####.|#....|#....|#####",
    "Ж": "#.#.#|#.#.#|.###.|..#..|.###.|#.#.#|#.#.#", "З": ".###.|#...#|....#|..##.|....#|#...#|.###.", "И": "#...#|#..##|#.#.#|##..#|#...#|#...#|#...#",
    "К": "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#", "Л": "..###|.#..#|.#..#|.#..#|.#..#|#...#|#...#", "М": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#",
    "Н": "#...#|#...#|#...#|#####|#...#|#...#|#...#", "О": ".###.|#...#|#...#|#...#|#...#|#...#|.###.", "П": "#####|#...#|#...#|#...#|#...#|#...#|#...#",
    "Р": "####.|#...#|#...#|####.|#....|#....|#....", "С": ".###.|#...#|#....|#....|#....|#...#|.###.", "Т": "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    "У": "#...#|#...#|#...#|.####|....#|#...#|.###.", "Ф": ".###.|#.#.#|#.#.#|#.#.#|.###.|..#..|..#..", "Х": "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    "Ц": "#..#.|#..#.|#..#.|#..#.|#..#.|#####|....#", "Ч": "#...#|#...#|#...#|.####|....#|....#|....#", "Ш": "#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#.#.#|#####",
    "Ь": "#....|#....|#....|####.|#...#|#...#|####.", "Я": ".####|#...#|#...#|.####|..#.#|.#..#|#...#", "Э": ".###.|#...#|....#|..###|....#|#...#|.###.",
    "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.", "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.", "2": ".###.|#...#|....#|...#.|..#..|.#...|#####",
    "3": "####.|....#|....#|.###.|....#|....#|####.", "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.", "5": "#####|#....|####.|....#|....#|#...#|.###.",
    "6": ".###.|#....|#....|####.|#...#|#...#|.###.", "7": "#####|....#|...#.|..#..|.#...|.#...|.#...", "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
    "9": ".###.|#...#|#...#|.####|....#|....#|.###.", "×": ".....|#...#|.#.#.|..#..|.#.#.|#...#|.....", ":": ".....|..#..|..#..|.....|..#..|..#..|.....",
    ".": ".....|.....|.....|.....|.....|.....|..#..", "%": "##..#|##..#|...#.|..#..|.#...|#..##|#..##", "!": "..#..|..#..|..#..|..#..|..#..|.....|..#..",
    "-": ".....|.....|.....|#####|.....|.....|.....", " ": ".....|.....|.....|.....|.....|.....|.....", "/": "....#|....#|...#.|..#..|.#...|#....|#....",
  };
  const FG_ = {};
  Object.keys(FONT).forEach((ch) => { FG_[ch] = FONT[ch].split("|"); });
  function ptext(g, s, x, y, col, k) {
    k = k || 1; let cx = x;
    for (const ch of s) {
      const gl = FG_[ch] || FG_[" "];
      for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (gl[j][i] === "#") g.r(cx + i * k, y + j * k, k, k, col);
      cx += 6 * k;
    }
    return cx - x - k;
  }
  const pwidth = (s, k) => s.length * 6 * (k || 1) - (k || 1);

  /* ===================== PX — пиксель и ретроэкран ===================== */
  /* Общее: холст 96×54 lp, 1 lp = 5 px сцены (демо-масштаб: в ролике 240×135, ×8). Всё рисуется целыми lp, без сглаживания.
     Роли цвета: bg/sf/mu/fg/ac — палитра; lt/dk — самый светлый и самый тёмный из bg/fg (чтобы космос и ночь были тёмными в любой теме). */
  const pxSetup = (c) => ({ P: PAL(c), g: pxCanvas(c) });
  /* «нет сигнала»: редкая точка fg по bg — пустой кадр, на котором видно, как открывается сцена */
  function blankFrame(g, Q) { g.r(0, 0, g.W, g.H, Q.bg); dith(g, 0, 0, g.W, g.H, null, Q.fg, 2); }
  /* рисует art в скрытый холст и возвращает его как источник для drawImage */
  function renderArt(c, art, Q, a1, a2, w, h) {
    const g = pxCanvas(c, document.createElement("div"), w, h);
    art(g, Q, a1, a2);
    return g.cv;
  }
  const grid = (rows) => rows.map((r) => r.join ? r.join("") : r);
  const bar = (g, x, y, w, h, Q) => { g.r(x, y, w, h, Q.bg); g.r(x, y, w, 1, Q.fg); g.r(x, y + h - 1, w, 1, Q.fg); g.r(x, y, 1, h, Q.fg); g.r(x + w - 1, y, 1, h, Q.fg); };

  /* ----- картины ----- */
  function artLand(g, Q, title) {
    const W = g.W, H = g.H;
    g.r(0, 0, W, H, Q.bg);
    [[17, 3], [20, 6], [23, 9], [26, 12], [29, 16]].forEach(([y, l]) => dith(g, 0, y, W, 3, null, Q.sf, l));
    const sx = 70, sy = 15;
    for (let y = sy - 11; y <= sy + 11; y++) for (let x = sx - 11; x <= sx + 11; x++) { const d = Math.hypot(x - sx, y - sy); if (d > 5.5 && d <= 10.5 && B4[y & 3][x & 3] < 6) g.px(x, y, Q.sf); }
    g.disc(sx, sy, 5, Q.ac);
    const cloud = (x, y) => { g.r(x + 2, y, 7, 1, Q.sf); g.r(x, y + 1, 11, 2, Q.sf); g.r(x + 4, y - 1, 3, 1, Q.sf); };
    cloud(30, 10); cloud(8, 22);
    ridge(g, [[10, 15], [32, 11], [58, 14], [86, 12]], 36, Q.sf);
    ridge(g, [[24, 10], [50, 12], [78, 9]], 39, Q.mu);
    for (let x = 0; x < W; x++) { const top = 39 + Math.round(1.2 * Math.sin(x * 0.22)); g.r(x, top, 1, H - top, Q.fg); }
    for (let x = 1; x < W; x += 3) if ((x * 7 + 3) % 5 < 2) g.px(x, 41 + (x * 5) % 11, Q.mu);
    pine(g, 82, 47, 9, Q.mu, Q.bg); pine(g, 89, 49, 7, Q.mu, Q.bg); pine(g, 75, 49, 6, Q.mu, Q.bg);
    for (let i = 0; i < 6; i++) { const hw = 1 + 2 * i; g.r(23 - hw, 36 + i, 2 * hw + 1, 1, Q.ac); }
    g.r(28, 33, 2, 4, Q.mu);
    g.r(14, 42, 19, 10, Q.bg); g.r(14, 42, 19, 1, Q.sf); g.r(32, 42, 1, 10, Q.sf);
    g.r(21, 47, 4, 5, Q.fg);
    g.r(16, 44, 4, 4, Q.sf); g.r(27, 44, 4, 4, Q.sf); g.r(16, 46, 4, 1, Q.mu); g.r(27, 46, 4, 1, Q.mu);
    if (title) ptext(g, title, 4, 4, Q.fg, 1);
  }
  function artCity(g, Q) {
    const W = g.W;
    g.r(0, 0, W, g.H, Q.dk);
    [[34, 2], [37, 4], [40, 7], [43, 10]].forEach(([y, l]) => dith(g, 0, y, W, 3, null, Q.ac, l));
    for (let i = 0; i < 26; i++) g.px((i * 37 + 11) % W, (i * 17 + 5) % 26, i % 3 ? Q.mu : Q.lt);
    g.disc(72, 12, 6, Q.lt); g.px(70, 10, Q.mu); g.px(74, 13, Q.mu); g.px(71, 14, Q.mu); g.px(73, 9, Q.mu);
    const far = [[0, 10], [9, 16], [17, 12], [27, 19], [36, 14], [46, 17], [55, 11], [64, 18], [74, 13], [84, 16]];
    far.forEach(([x, h], i) => { const w = (far[i + 1] ? far[i + 1][0] : W) - x; dith(g, x, 46 - h, w, h, Q.dk, Q.mu, 9); });
    const near = [[0, 18], [10, 26], [21, 20], [31, 30], [42, 22], [52, 28], [63, 19], [72, 25], [83, 21]];
    near.forEach(([x, h], i) => {
      const w = (near[i + 1] ? near[i + 1][0] : W) - x - 1;
      g.r(x, 48 - h, w, h, Q.dk); g.r(x, 48 - h, w, 1, Q.mu);
      for (let yy = 48 - h + 3; yy < 46; yy += 3) for (let xx = x + 2; xx < x + w - 1; xx += 3) { const v = (xx * 13 + yy * 7 + i * 5) % 7; if (v < 3) g.px(xx, yy, v === 0 ? Q.lt : Q.ac); }
    });
    g.r(0, 48, W, 6, Q.dk); g.r(0, 48, W, 1, Q.mu);
    for (let x = 2; x < W; x += 8) g.r(x, 51, 4, 1, Q.mu);
  }
  const ROCKET = [
    ".....nn.....", "....nnnn....", "...nnnnnn...", "...nnnnnn...", "..########..", "..########..",
    "..##wwww##..", "..##wwww##..", "..##wwww##..", "..########..", "..########..", "..#mmmmmm#..", "..########..", "..########..", "..###mm###..",
    ".f########f.", "ff########ff", "ff########ff", "ff##mmmm##ff", "f..######..f", "....mmmm....",
    "....aaaa....", "....aaaa....", ".....aa.....", ".....aa.....",
  ];
  function artRocket(g, Q) {
    const W = g.W, H = g.H;
    g.r(0, 0, W, H, Q.dk);
    for (let i = 0; i < 34; i++) g.px((i * 29 + 7) % (W - 2) + 1, (i * 13 + 11) % (H - 14) + 9, i % 4 ? Q.mu : Q.lt);
    g.disc(72, 38, 12, Q.mu);
    for (let y = 26; y <= 50; y++) for (let x = 60; x <= 84; x++) if (Math.hypot(x - 72, y - 38) <= 12 && (x + y) % 4 === 0 && x < 68) g.px(x, y, Q.sf);
    for (let x = 56; x <= 88; x++) { const yy = 38 + Math.round((x - 72) * 0.28); g.px(x, yy, Q.sf); g.px(x, yy + 1, Q.lt); }
    g.spr(ROCKET, 26, 12, { n: Q.ac, "#": Q.lt, w: Q.dk, m: Q.mu, f: Q.ac, a: Q.ac }, 1, Q.dk);
    g.r(31, 37, 2, 2, Q.lt);
    for (let i = 0; i < 4; i++) g.px(29 + (i % 2) * 5, 44 + i * 2, i % 2 ? Q.mu : Q.sf);
  }
  function artWindow(g, Q) {
    g.r(0, 0, g.W, g.H, Q.dk);
    const sub = pxCanvas({ stage: null }, document.createElement("div"), g.W, g.H - 9);
    artRocket(sub, Q);
    g.x.drawImage(sub.cv, 0, 9);
    g.r(0, 0, g.W, 9, Q.mu);
    [3, 8, 13].forEach((x) => g.r(x, 3, 3, 3, Q.dk));
    ptext(g, "ЗАГРУЗКА", 28, 1, Q.dk, 1);
    g.r(0, 8, g.W, 1, Q.dk);
    g.r(0, 9, 1, g.H - 9, Q.mu); g.r(g.W - 1, 9, 1, g.H - 9, Q.mu); g.r(0, g.H - 1, g.W, 1, Q.mu);
  }
  function artTitle(g, Q) {
    blankFrame(g, Q);
    const word = "ЗАПУСК", wd = pwidth(word, 2), x = Math.round((g.W - wd) / 2);
    bar(g, x - 5, 14, wd + 10, 18, Q);
    ptext(g, word, x, 18, Q.fg, 2);
    bar(g, 24, 38, 48, 5, Q);
    g.r(26, 39, 12, 3, Q.ac);
  }

  /* ----- PX-01 ----- */
  SKD.add({
    code: "PX-01", group: "pix", ru: "Плиточное открытие",
    what: "Кадр собирается квадратами построчно.",
    when: "Пиксельный вход в игровую сцену.",
    fam: ["F09"], proj: ["skilaxy", "serial"],
    spec: "D=800 мс, E5, N=число плиток; квадраты слева направо, сверху вниз, доля 0→100%. Демо: плитка 6×6 lp (в ролике 8×8), 144 плитки, 1 lp = 5 px.",
    hold: 1300,
    async play(c) {
      const { P, g } = pxSetup(c);
      const art = renderArt(c, artLand, P, "УРОВЕНЬ 1");
      const T = 6, cols = GW / T, rows = Math.ceil(GH / T), N = cols * rows;
      const draw = (k) => {
        blankFrame(g, P);
        const full = Math.floor(k / cols), part = k % cols;
        if (full > 0) g.x.drawImage(art, 0, 0, GW, Math.min(GH, full * T), 0, 0, GW, Math.min(GH, full * T));
        if (part > 0) g.x.drawImage(art, 0, full * T, part * T, T, 0, full * T, part * T, T);
        if (k < N) g.r(part * T, full * T, T, T, P.ac);
      };
      draw(0);
      await c.wait(350);
      await c.tick(800, (t, p) => draw(stepK(p, N)));
      draw(N);
    },
  });

  /* ----- PX-02 ----- */
  const STAR = [
    ".......#.......", ".......#.......", "......###......", "......###......", ".....#####.....", "###############", ".#############.", "..###########..".slice(0, 15),
    "...#########...", "...#########...", "..####...####..", "..###.....###..", ".###.......###.", ".##.........##.", ".#...........#.",
  ];
  SKD.add({
    code: "PX-02", group: "pix", ru: "Шаги спрайта",
    what: "Предмет перемещается через десять чётких положений.",
    when: "Передвижение иконки или игрового предмета.",
    fam: ["F09"], proj: ["skilaxy", "serial"],
    spec: "D=1000 мс, E5, N=10; центр A→B на сетке lp, угол и α постоянны. Демо: A=(14,29), B=(82,29) lp, посты положений и счётчик шага.",
    hold: 1200,
    async play(c) {
      const { P, g } = pxSetup(c);
      const A = 14, B = 82, Y = 28, N = 10;
      const xs = []; for (let k = 0; k <= N; k++) xs.push(Math.round(A + (B - A) * k / N));
      const draw = (k) => {
        g.r(0, 0, GW, GH, P.bg);
        dith(g, 0, 33, GW, 3, null, P.sf, 6); dith(g, 0, 36, GW, 3, null, P.sf, 11);
        g.r(0, 40, GW, 14, P.fg);
        for (let x = 0; x < GW; x += 5) g.r(x, 40, 3, 1, P.mu);
        xs.forEach((x, i) => { const on = i === k; g.r(x, 43, 1, on ? 4 : 3, on ? P.ac : (i < k ? P.lt : P.mu)); if (on) g.r(x - 1, 47, 3, 1, P.ac); });
        g.r(xs[k] - 4, 39, 9, 1, P.mu);
        g.spr(STAR, xs[k] - 7, Y - 8, { "#": P.ac }, 1, P.dk);
        g.r(xs[k] - 3, Y - 2, 2, 1, P.lt); g.r(xs[k] - 2, Y - 4, 2, 1, P.lt); g.px(xs[k] - 5, Y - 3, P.lt); g.px(xs[k] - 1, Y - 6, P.lt);
        ptext(g, "ШАГ", 4, 4, P.fg, 1);
        ptext(g, String(k).padStart(2, "0"), 28, 4, P.ac, 1);
      };
      draw(0);
      await c.wait(350);
      await c.tick(1000, (t, p) => draw(stepK(p, N)));
      draw(N);
    },
  });

  /* ----- PX-03: герой 14×22, вид спереди, 4 позы ----- */
  function walkerRows(pose) {
    const M = Array.from({ length: 22 }, () => Array(14).fill("."));
    const R = (x, y, w, h, ch) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && xx < 14 && yy >= 0 && yy < 22) M[yy][xx] = ch; } };
    const up = pose === 2 ? 1 : 0, Y = (y) => y - up;
    R(4, Y(0), 6, 1, "h"); R(3, Y(1), 8, 2, "h");
    R(3, Y(3), 1, 3, "h"); R(10, Y(3), 1, 3, "h"); R(4, Y(3), 6, 3, "f");
    R(5, Y(4), 1, 1, "e"); R(8, Y(4), 1, 1, "e"); R(6, Y(5), 2, 1, "e");
    R(5, Y(6), 4, 1, "f"); R(6, Y(7), 2, 1, "f");
    R(3, Y(8), 8, 6, "j"); R(3, Y(14), 8, 1, "b");
    const aL = pose === 1 ? -2 : pose === 3 ? 2 : 0, aR = -aL;
    R(1, Y(8) + aL, 2, 5, "j"); R(1, Y(13) + aL, 2, 1, "f");
    R(11, Y(8) + aR, 2, 5, "j"); R(11, Y(13) + aR, 2, 1, "f");
    const liftL = pose === 1 ? 3 : 0, liftR = pose === 3 ? 3 : 0;
    R(4, Y(15), 3, 6 - liftL, "p"); R(3, Y(21) - liftL, 4, 1, "s");
    R(8, Y(15), 3, 6 - liftR, "p"); R(8, Y(21) - liftR, 4, 1, "s");
    return grid(M);
  }
  SKD.add({
    code: "PX-03", group: "pix", ru: "Четыре позы",
    what: "Персонаж идёт на месте через повторяющийся набор спрайтов.",
    when: "Ходьба пиксельного героя.",
    fam: ["F09"], proj: ["serial", "skilaxy"],
    spec: "D=800 мс, E5, N=8; кадры спрайт-листа 0/1/2/3/0/1/2/3 по 100 мс; bbox и точка стоп общие; после D нейтральная поза 0.",
    hold: 1300,
    async play(c) {
      const { P, g } = pxSetup(c);
      const poses = [0, 1, 2, 3].map(walkerRows);
      const ink = P.light ? P.dk : P.mu;
      const map = { h: ink, f: P.lt, e: P.dk, j: P.ac, b: P.dk, p: ink, s: P.mu };
      const draw = (pose, idx) => {
        g.r(0, 0, GW, GH, P.bg);
        dith(g, 0, 24, GW, 4, null, P.sf, 5); dith(g, 0, 28, GW, 4, null, P.sf, 9); dith(g, 0, 32, GW, 8, null, P.sf, 13);
        g.r(0, 44, GW, 10, P.fg); g.r(0, 44, GW, 1, P.mu);
        g.r(38, 43, 20, 1, P.mu); g.r(40, 42, 16, 1, P.sf);
        g.spr(poses[pose], 41, 22, map, 1, P.dk);
        // лист поз: подсвечена текущая
        for (let i = 0; i < 4; i++) {
          const x = 31 + i * 9, on = i === pose;
          g.r(x, 46, 8, 8, on ? P.ac : P.mu); g.r(x + 1, 47, 6, 6, on ? P.ac : P.fg);
          ptext(g, String(i), x + 2, 47, on ? P.dk : P.mu, 1) ;
        }
        ptext(g, "КАДР", 4, 4, P.fg, 1); ptext(g, String(idx), 33, 4, P.ac, 1);
      };
      draw(0, 0);
      await c.wait(400);
      await c.tick(800, (t, p) => { const k = stepK(p, 8); const s = k >= 8 ? 0 : k % 4; draw(s, k >= 8 ? 8 : k); });
      draw(0, 8);
    },
  });

  /* ----- PX-04 ----- */
  SKD.add({
    code: "PX-04", group: "pix", ru: "Замена палитры",
    what: "Четыре группы цветов переходят к новой палитре по очереди.",
    when: "Смена времени суток или игрового режима.",
    fam: ["F09"], proj: ["skilaxy", "serial"],
    spec: "D=600 мс; группы BG/SF/MU/AC целиком заменяются в 150/300/450/600 мс, E6, без промежуточных цветов; FG остаётся.",
    hold: 1300,
    async play(c) {
      const { P, g } = pxSetup(c);
      const r = P.raw;
      const B = { bg: S(mix(r.bg, r.ac, 0.5)), sf: S(mix(r.sf, r.ac, 0.7)), mu: S(mix(r.mu, r.ac, 0.45)), ac: S(r.lt), fg: P.fg };
      const A = { bg: P.bg, sf: P.sf, mu: P.mu, ac: P.ac, fg: P.fg };
      const art = (n) => {
        const Q = { bg: n >= 1 ? B.bg : A.bg, sf: n >= 2 ? B.sf : A.sf, mu: n >= 3 ? B.mu : A.mu, ac: n >= 4 ? B.ac : A.ac, fg: P.fg };
        artLand(g, Q, "ХОД 07");
        // образцы четырёх групп
        ["bg", "sf", "mu", "ac"].forEach((k, i) => { g.r(60 + i * 8, 2, 7, 7, P.fg); g.r(61 + i * 8, 3, 5, 5, Q[k]); });
        return Q;
      };
      art(0);
      await c.wait(350);
      let last = 0;
      await c.tick(600, (t) => { const n = Math.floor(t / 150); if (n !== last) { last = n; art(n); } });
      art(4);
    },
  });

  /* ----- PX-05 ----- */
  SKD.add({
    code: "PX-05", group: "pix", ru: "Строки экрана",
    what: "Изображение проявляется горизонтальными строками.",
    when: "Загрузка терминальной иллюстрации.",
    fam: ["F09"], proj: ["skilaxy"],
    spec: "D=900 мс, E5, N=число строк (54 lp, в ролике 135); видимая высота 0→100% сверху вниз; открытые строки не мигают.",
    hold: 1300,
    async play(c) {
      const { P, g } = pxSetup(c);
      const art = renderArt(c, artWindow, P);
      const N = GH;
      const draw = (k) => {
        g.r(0, 0, GW, GH, P.bg);
        dith(g, 0, 0, GW, GH, null, P.fg, 2);
        if (k > 0) g.x.drawImage(art, 0, 0, GW, k, 0, 0, GW, k);
        if (k < N) g.r(0, k, GW, 1, P.ac);
      };
      draw(0);
      await c.wait(350);
      await c.tick(900, (t, p) => draw(stepK(p, N)));
      draw(N);
    },
  });

  /* ----- PX-06 ----- */
  const MAP = [
    "TTGGGFGGWWWWGGTTTG", "TGGGGGGGWWWWGGGTTG", "GGFGGRGGGGGGGFGGGT", "PPPPPPPPPPPPPPPPPP", "GGGGTGGGFGGGRGGGGG", "GTTGGGGGGGGGTTGGFG", "TTTGFGGWWGGGTTTGGG",
  ];
  const HERO = ["..hhhh..", ".hhhhhh.", ".hffffe.", ".hffffe.", "..jjjj..", ".jjjjjj.", ".jjjjjj.", "..pppp..", "..p..p..", "..ss.ss."];
  function drawTile(g, Q, ch, x, y, i) {
    const hh = (a, b) => (Math.imul(a + 7, 73856093) ^ Math.imul(b + 3, 19349663)) >>> 0;
    const spk = (n) => { for (let k = 0; k < n; k++) { const v = hh(i, k); g.px(x + (v % 8), y + ((v >> 5) % 8), Q.light ? Q.mu : Q.bg); } };
    if (ch === "W") {
      g.r(x, y, 8, 8, Q.mu);
      g.r(x + 1, y + 2, 3, 1, Q.bg); g.r(x + 5, y + 5, 2, 1, Q.bg); g.r(x + 2, y + 6, 1, 1, Q.sf);
    } else if (ch === "P") {
      g.r(x, y, 8, 8, Q.bg); g.px(x + 1, y + 6, Q.sf); g.px(x + 5, y + 2, Q.sf); g.px(x + 3, y + 4, Q.sf);
      g.r(x, y, 8, 1, Q.sf); g.r(x, y + 7, 8, 1, Q.sf);
    } else {
      g.r(x, y, 8, 8, Q.sf); spk(3); g.px(x, y, Q.bg);
      if (ch === "T") { g.r(x + 3, y + 5, 2, 3, Q.mu); g.r(x + 3, y, 2, 1, Q.fg); g.r(x + 2, y + 1, 4, 1, Q.fg); g.r(x + 1, y + 2, 6, 1, Q.fg); g.r(x + 2, y + 3, 4, 1, Q.fg); g.r(x + 1, y + 4, 6, 1, Q.fg); }
      if (ch === "F") { g.r(x + 2, y + 3, 2, 2, Q.ac); g.r(x + 5, y + 5, 2, 2, Q.ac); g.px(x + 2, y + 5, Q.fg); g.px(x + 5, y + 7, Q.fg); }
      if (ch === "R") { g.r(x + 2, y + 3, 4, 3, Q.mu); g.r(x + 1, y + 4, 6, 2, Q.mu); g.r(x + 1, y + 6, 6, 1, Q.fg); g.px(x + 3, y + 3, Q.bg); }
    }
  }
  SKD.add({
    code: "PX-06", group: "pix", ru: "Прокрутка карты",
    what: "Карта движется на целое число тайлов.",
    when: "Переход между участками пиксельного мира.",
    fam: ["F09"], proj: ["skilaxy", "serial"],
    spec: "D=1600 мс, E0; карта x=0→−32 lp, тайл 8 lp, координаты округляются до целого lp; герой и подпись в экранных координатах стоят; карта заполнена за краем.",
    hold: 1200,
    async play(c) {
      const { P, g } = pxSetup(c);
      const mw = MAP[0].length * 8, mh = MAP.length * 8;
      const mg = pxCanvas(c, document.createElement("div"), mw, mh);
      MAP.forEach((row, j) => { for (let i = 0; i < row.length; i++) drawTile(mg, P, row[i], i * 8, j * 8, i + j * 7); });
      const draw = (off) => {
        g.r(0, 0, GW, GH, P.bg);
        g.x.drawImage(mg.cv, off, 0);
        // герой и подпись стоят на экране
        g.r(42, 31, 12, 1, P.mu);
        g.spr(HERO, 44, 20, { h: P.dk, f: P.lt, e: P.dk, j: P.ac, p: P.fg, s: P.dk }, 1, P.light ? P.dk : P.lt);
        g.r(3, 3, 31, 9, P.dk); ptext(g, "ЛЕС 1", 5, 4, P.lt, 1);
      };
      draw(0);
      await c.wait(350);
      await c.tick(1600, (t, p) => draw(-Math.round(32 * p)));
      draw(-32);
    },
  });

  /* ----- PX-07: растровое растворение ----- */
  SKD.add({
    code: "PX-07", group: "pix", ru: "Растровое растворение",
    what: "Новый кадр проявляется через упорядоченную шахматную маску.",
    when: "Переход ретроэкрана без глитча.",
    fam: ["F09"], proj: ["skilaxy"],
    spec: "D=800 мс, E5, N=16; матрица порогов 4×4: 0,8,2,10 / 12,4,14,6 / 3,11,1,9 / 15,7,13,5; на шаге k открыты ячейки с порогом<k, ячейка 1 lp.",
    hold: 1300,
    async play(c) {
      const { P, g } = pxSetup(c);
      const A = renderArt(c, artTitle, P), Bm = renderArt(c, artCity, P);
      const da = A.getContext("2d").getImageData(0, 0, GW, GH), db = Bm.getContext("2d").getImageData(0, 0, GW, GH);
      const out = g.x.createImageData(GW, GH);
      const draw = (k) => {
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
          const i = (y * GW + x) * 4, src = B4[y & 3][x & 3] < k ? db : da;
          out.data[i] = src.data[i]; out.data[i + 1] = src.data[i + 1]; out.data[i + 2] = src.data[i + 2]; out.data[i + 3] = 255;
        }
        g.x.putImageData(out, 0, 0);
      };
      draw(0);
      await c.wait(400);
      await c.tick(800, (t, p) => draw(stepK(p, 16)));
      draw(16);
    },
  });

  /* ----- PX-08 ----- */
  const ROBOT = [
    "......aaaa......", ".......dd.......", ".......dd.......", "..############..", ".#sss#########m.", ".#s###########m.",
    ".##eee####eee##.", ".##eee####eee##.", ".#cc########cc#m", ".#cc########cc#m", "bb###########mbb",
    "bb##" + "mmmmmmmm" + "#mbb", "bb##" + "m#m#m#m#" + "#mbb", ".#############m", "..mmmmmmmmmmmm..", ".....dddddd.....",
  ];
  SKD.add({
    code: "PX-08", group: "pix", ru: "Целочисленный зум",
    what: "Один спрайт дважды увеличивается без размытия.",
    when: "Рассмотреть конкретную деталь пиксельного рисунка.",
    fam: ["F09"], proj: ["skilaxy", "democrm"],
    spec: "D=900 мс; 0–300 мс s=1, при 300 мс s=2, при 600 мс s=3, до 900 мс удержание; E6 на сменах; опора T в целых lp, nearest-neighbor.",
    hold: 1300,
    async play(c) {
      const { P, g } = pxSetup(c);
      const T = { x: 48, y: 27 };
      const draw = (s) => {
        g.r(0, 0, GW, GH, P.bg);
        for (let y = 3; y < GH; y += 8) for (let x = 3; x < GW; x += 8) g.px(x, y, P.mu);
        g.spr(ROBOT, T.x - 8 * s, T.y - 8 * s, { "#": P.lt, e: P.ac, m: P.mu, a: P.ac, d: P.dk, b: P.sf, c: P.sf, s: P.sf }, s, P.dk);
        g.r(3, 3, 17, 9, P.dk); ptext(g, "×" + s, 5, 4, P.lt, 1);
      };
      draw(1);
      await c.wait(300);
      draw(2);
      await c.wait(300);
      draw(3);
      await c.wait(300);
    },
  });

  /* ===================== VG — объём, свет и пространство ===================== */
  /* Мини-рендер: ортографическая камера (6,4,6)→(0,0,0), up=(0,1,0), ключевой свет (−3,6,4), пол y=−1, 52 px сцены на единицу (в ролике 12 единиц на ширину, в демо крупнее).
     Грани — многоугольники на canvas с градиентом по освещённости от точечного света; тень — проекция предмета на пол от того же света. */
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };
  const CAM = (() => { const f = v3.norm([-6, -4, -6]); const r = v3.norm(v3.cross(f, [0, 1, 0])); const u = v3.cross(r, f); return { f, r, u }; })();
  const KEY = [-3, 6, 4], SC = 52, OX = 240, OY = 93, HI = 2;
  const proj = (p) => [OX + v3.dot(p, CAM.r) * SC, OY - v3.dot(p, CAM.u) * SC];
  const rotY = (p, a) => { const ca = Math.cos(a), sa = Math.sin(a); return [p[0] * ca + p[2] * sa, p[1], -p[0] * sa + p[2] * ca]; };
  const DEG = Math.PI / 180;

  function mkBox(o) {
    const [hx, hy, hz] = o.s.map((v) => v / 2);
    const F = (tag, n, pts) => ({ tag, n, v: pts.map(([a, b, c]) => [a * hx, b * hy, c * hz]) });
    return Object.assign({ ry: 0, alpha: 1 }, o, {
      faces: [
        F("pz", [0, 0, 1], [[-1, 1, 1], [1, 1, 1], [1, -1, 1], [-1, -1, 1]]),
        F("px", [1, 0, 0], [[1, 1, 1], [1, 1, -1], [1, -1, -1], [1, -1, 1]]),
        F("nx", [-1, 0, 0], [[-1, 1, -1], [-1, 1, 1], [-1, -1, 1], [-1, -1, -1]]),
        F("nz", [0, 0, -1], [[1, 1, -1], [-1, 1, -1], [-1, -1, -1], [1, -1, -1]]),
        F("py", [0, 1, 0], [[-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]]),
        F("ny", [0, -1, 0], [[-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]]),
      ],
    });
  }
  /* призма-крыша: основание по x∈[−a,a], z∈[−b,b] на высоте y0, конёк вдоль x на высоте y1 */
  function mkRoof(o) {
    const a = o.s[0] / 2, b = o.s[2] / 2, y0 = -o.s[1] / 2, y1 = o.s[1] / 2;
    const mk = (tag, pts) => { const e1 = v3.sub(pts[1], pts[0]), e2 = v3.sub(pts[2], pts[0]); let n = v3.norm(v3.cross(e1, e2)); const cen = pts.reduce((s, p) => v3.add(s, p), [0, 0, 0]).map((x) => x / pts.length); if (v3.dot(n, v3.sub(cen, [0, 0, 0])) < 0) n = v3.mul(n, -1); return { tag, n, v: pts }; };
    return Object.assign({ ry: 0, alpha: 1 }, o, {
      faces: [
        mk("sz", [[-a, y0, b], [a, y0, b], [a, y1, 0], [-a, y1, 0]]),
        mk("sn", [[a, y0, -b], [-a, y0, -b], [-a, y1, 0], [a, y1, 0]]),
        mk("gx", [[a, y0, b], [a, y0, -b], [a, y1, 0]]),
        mk("gn", [[-a, y0, -b], [-a, y0, b], [-a, y1, 0]]),
      ],
    });
  }
  const worldV = (m, v) => v3.add(rotY(v, m.ry), m.c);
  /* отсечение многоугольника плоскостью y ≥ fy */
  function clipY(poly, fy) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], ia = a[1] >= fy - 1e-9, ib = b[1] >= fy - 1e-9;
      if (ia) out.push(a);
      if (ia !== ib) { const t = (fy - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, fy, a[2] + (b[2] - a[2]) * t]); }
    }
    return out;
  }
  function hull2(pts) {
    pts = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = []; for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    const up = []; for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop(); return lo.concat(up);
  }

  /* сцена: три холста (пол, тень с размытием, предметы) в двойном разрешении */
  function vgStage(c, o) {
    o = o || {};
    const P = PAL(c);
    const W = document.createElement("div");
    W.style.cssText = `position:absolute;left:0;top:0;width:480px;height:270px;transform-origin:240px 135px;transform:translate(0,${o.dy || 0}px) scale(${o.k || 1})`;
    c.stage.appendChild(W);
    /* холст выше и ниже кадра на 105 px: предметы и пол могут выходить за кадр, а обёртка W потом масштабирует и сдвигает всё целиком */
    const mkc = (css) => { const cv = document.createElement("canvas"); cv.width = 480 * HI; cv.height = 480 * HI; cv.style.cssText = "position:absolute;left:0;top:-105px;width:480px;height:480px;" + (css || ""); W.appendChild(cv); const x = cv.getContext("2d"); x.scale(HI, HI); x.translate(0, 105); return { cv, x }; };
    const A = mkc(), B = mkc(`filter:blur(${o.blur == null ? 4 : o.blur}px);opacity:${o.shadowA == null ? 0.24 : o.shadowA}`), C = mkc();
    const R = P.raw;
    return {
      P, A, B, C, W, floorY: o.floorY == null ? -1 : o.floorY, L: o.L || KEY.slice(), floorPoly: null,
      amb: o.amb == null ? 0.34 : o.amb, key: o.key == null ? 0.66 : o.key,
      base: mix(R.sf, R.mu, 0.2), acc: mix(R.sf, R.ac, 0.62), mid: mix(R.sf, R.mu, 0.5),
    };
  }
  /* освещённость точки p с нормалью n */
  function lightI(env, p, n) {
    const ld = v3.norm(v3.sub(env.L, p));
    const lam = Math.max(0, v3.dot(n, ld));
    const fill = Math.max(0, -v3.dot(n, CAM.f)) * 0.1;
    return env.amb + env.key * lam + fill;
  }
  function shadeCol(env, base, I) {
    const R = env.P.raw;
    const lo = mix(base, R.dk, 0.5), hi = mix(base, R.lt, 0.6);
    I = clamp(I, 0, 1.2);
    if (I < 0.55) return mix(lo, base, I / 0.55);
    return mix(base, hi, clamp((I - 0.55) / 0.5) * 0.6);
  }
  /* рисует грани одного предмета; pass: "all" | "front" | "back" */
  function drawMesh(env, m, o) {
    o = o || {};
    const x = env.C.x, pass = o.pass || "all", fy = env.floorY, clipF = o.clip !== false;
    const al = (o.alpha != null ? o.alpha : m.alpha);
    for (const f of m.faces) {
      const n = rotY(f.n, m.ry);
      const facing = v3.dot(n, CAM.f) < 0;
      if (pass === "front" && !facing) continue;
      if (pass === "all" && !facing) continue;
      if (pass === "back" && facing) continue;
      let wv = f.v.map((p) => worldV(m, p));
      const full = wv;
      if (clipF) wv = clipY(wv, fy);
      if (wv.length < 3) continue;
      const sp = wv.map(proj);
      const base = (m.cols && m.cols[f.tag]) || m.col;
      x.save();
      x.globalAlpha = al;
      x.beginPath(); sp.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.closePath();
      if (pass === "back") {
        x.fillStyle = S(shadeCol(env, base, 0.32)); x.fill();
      } else {
        const Is = wv.map((p) => lightI(env, p, n));
        let imin = 0, imax = 0; Is.forEach((v, i) => { if (v < Is[imin]) imin = i; if (v > Is[imax]) imax = i; });
        if (Is[imax] - Is[imin] < 0.015 || imin === imax) x.fillStyle = S(shadeCol(env, base, Is[imax]));
        else {
          const g = x.createLinearGradient(sp[imin][0], sp[imin][1], sp[imax][0], sp[imax][1]);
          g.addColorStop(0, S(shadeCol(env, base, Is[imin]))); g.addColorStop(1, S(shadeCol(env, base, Is[imax])));
          x.fillStyle = g;
        }
        x.fill();
        // оттенок «блика»: мягкое пятно света на ближайшей к свету точке грани
        if (o.glint) {
          const cen = full.reduce((s, p) => v3.add(s, p), [0, 0, 0]).map((q) => q / full.length);
          const d = v3.dot(v3.sub(env.L, cen), n);
          if (d > 0) {
            const q = v3.sub(env.L, v3.mul(n, d)), qp = proj(q);
            x.save(); x.clip();
            const gr = x.createRadialGradient(qp[0], qp[1], 0, qp[0], qp[1], 70);
            const lt = env.P.raw.lt;
            gr.addColorStop(0, S(lt, 0.62 * clamp(d / 3, 0.25, 1))); gr.addColorStop(1, S(lt, 0));
            x.fillStyle = gr; x.fillRect(-20, -110, 520, 490); x.restore();
          }
        }
        // декаль: плоский рисунок на грани, 0..1 по осям грани, y вниз
        const dec = m.dec && m.dec[f.tag];
        if (dec && full.length >= 4) {
          const p0 = proj(full[0]), p1 = proj(full[1]), p3 = proj(full[3]);
          x.save(); x.clip();
          x.setTransform(HI * (p1[0] - p0[0]), HI * (p1[1] - p0[1]), HI * (p3[0] - p0[0]), HI * (p3[1] - p0[1]), HI * p0[0], HI * (p0[1] + 105));
          dec(x, Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), env);
          x.restore();
        }
      }
      if (o.edge !== false) {
        x.globalAlpha = al * (m.edgeA == null ? 0.5 : m.edgeA);
        x.lineWidth = 0.9; x.lineJoin = "round"; x.strokeStyle = S(mix(base, env.P.raw.dk, 0.55)); x.stroke();
      }
      x.restore();
    }
  }
  /* тень: центральная проекция вершин на пол от точечного света, выпуклая оболочка */
  function drawShadows(env, meshes) {
    const x = env.B.x, fy = env.floorY, L = env.L;
    x.clearRect(-20, -110, 520, 490);
    x.save();
    if (env.floorPoly) { x.beginPath(); env.floorPoly.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.closePath(); x.clip(); }
    x.fillStyle = S(env.P.raw.dk);
    for (const m of meshes) {
      const pts = [];
      for (const f of m.faces) {
        const wv = clipY(f.v.map((p) => worldV(m, p)), fy);
        for (const p of wv) {
          const dy = L[1] - p[1]; if (dy <= 0.05) continue;
          const t = (L[1] - fy) / dy;
          const q = [L[0] + (p[0] - L[0]) * t, fy, L[2] + (p[2] - L[2]) * t];
          pts.push(proj(q));
        }
      }
      if (pts.length < 3) continue;
      const h = hull2(pts);
      x.beginPath(); h.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.closePath(); x.fill();
    }
    x.restore();
  }
  /* подиум-пол: плита с сеткой на верхней грани; рисуется один раз */
  function drawFloor(env, half) {
    half = half || 2.9;
    const P = env.P, R = P.raw, x = env.C.x;
    const slab = mkBox({ c: [0, env.floorY - 0.25, 0], s: [half * 2, 0.5, half * 2], col: mix(R.bg, R.fg, 0.1), edgeA: 0.35,
      dec: { py: (g, k) => { g.strokeStyle = S(R.dk, 0.13); g.lineWidth = 1 / k; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(i / 8, 0); g.lineTo(i / 8, 1); g.moveTo(0, i / 8); g.lineTo(1, i / 8); g.stroke(); } } } });
    env.floorPoly = [[-half, -half], [half, -half], [half, half], [-half, half]].map(([a, b]) => proj([a, env.floorY, b]));
    const keep = env.C; env.C = env.A;
    drawMesh(env, slab, { clip: false });
    env.C = keep;
    return slab;
  }
  function frameVG(env, meshes, o) {
    o = o || {};
    drawShadows(env, meshes.filter((m) => !m.noShadow));
    env.C.x.clearRect(-20, -110, 520, 490);
    const sorted = meshes.slice().sort((a, b) => (a.z != null || b.z != null ? (a.z || 0) - (b.z || 0) : v3.dot(b.c, CAM.f) - v3.dot(a.c, CAM.f)));
    sorted.forEach((m) => drawMesh(env, m, { glint: o.glint }));
  }

  /* ----- декали ----- */
  const shield = (g, k, env) => {
    const R = env.P.raw;
    g.fillStyle = S(R.ac); g.beginPath(); g.moveTo(0.5, 0.14); g.lineTo(0.82, 0.25); g.lineTo(0.82, 0.52); g.bezierCurveTo(0.82, 0.72, 0.66, 0.84, 0.5, 0.9); g.bezierCurveTo(0.34, 0.84, 0.18, 0.72, 0.18, 0.52); g.lineTo(0.18, 0.25); g.closePath(); g.fill();
    g.strokeStyle = S(R.lt); g.lineWidth = 4.5 / k; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); g.moveTo(0.34, 0.52); g.lineTo(0.46, 0.64); g.lineTo(0.68, 0.38); g.stroke();
  };
  const bars = (g, k, env) => { const R = env.P.raw; [0.28, 0.46, 0.64].forEach((y, i) => { g.fillStyle = S(i === 1 ? R.ac : R.mu, i === 1 ? 1 : 0.8); g.fillRect(0.2, y, i === 0 ? 0.6 : i === 1 ? 0.45 : 0.55, 0.1); }); };
  const target = (g, k, env) => { const R = env.P.raw; g.lineWidth = 4 / k; g.strokeStyle = S(R.ac); g.beginPath(); g.arc(0.5, 0.5, 0.28, 0, 7); g.stroke(); g.fillStyle = S(R.ac); g.beginPath(); g.arc(0.5, 0.5, 0.11, 0, 7); g.fill(); g.strokeStyle = S(R.mu); g.lineWidth = 2.5 / k; g.beginPath(); g.arc(0.5, 0.5, 0.4, 0, 7); g.stroke(); };
  const stripes = (g, k, env) => { const R = env.P.raw; g.strokeStyle = S(R.mu, 0.7); g.lineWidth = 5 / k; for (let i = -1; i < 6; i++) { g.beginPath(); g.moveTo(i * 0.22, 1); g.lineTo(i * 0.22 + 1, 0); g.stroke(); } };
  const windows = (n, m) => (g, k, env) => { const R = env.P.raw; g.fillStyle = S(mix(R.dk, R.ac, 0.15), 0.85); const w = 0.7 / (n * 1.7), gap = w * 0.7; for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) g.fillRect(0.15 + i * (w + gap) * 1 + (0.7 - (n * w + (n - 1) * gap)) / 2, 0.2 + j * 0.32, w, 0.18); };

  /* ----- VG-01 ----- */
  SKD.add({
    code: "VG-01", group: "vol", ru: "Поворот предмета",
    what: "Предмет показывает соседнюю сторону и останавливается.",
    when: "Предмет, макет комнаты, low-poly объект.",
    fam: ["F12", "F08"], proj: ["ecs", "democrm"],
    spec: "D=1600 мс, E1; rotateY 0→90°, центр и камера неподвижны; контактная тень пересчитывается из того же света (−3,6,4); куб 2×2×2, пол y=−1.",
    hold: 1200,
    async play(c) {
      const env = vgStage(c);
      drawFloor(env);
      const cube = mkBox({ c: [0, 0, 0], s: [2, 2, 2], col: env.base, dec: { pz: shield, px: bars, nx: target, nz: stripes } });
      const draw = (a) => { cube.ry = a; frameVG(env, [cube]); };
      draw(0);
      await c.wait(450);
      await c.tick(1600, (t, p) => draw(EF.E1(p) * 90 * DEG));
      draw(90 * DEG);
    },
  });

  /* ----- VG-02 ----- */
  const dots = (g, k, env) => { const R = env.P.raw; g.fillStyle = S(R.dk, 0.55); for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(0.2 + i * 0.2, 0.2 + j * 0.2, 0.035, 0, 7); g.fill(); } };
  const ringTop = (g, k, env) => { const R = env.P.raw; g.strokeStyle = S(R.lt, 0.85); g.lineWidth = 3 / k; g.beginPath(); g.arc(0.5, 0.5, 0.26, 0, 7); g.stroke(); g.fillStyle = S(R.lt, 0.85); g.beginPath(); g.arc(0.5, 0.5, 0.08, 0, 7); g.fill(); };
  SKD.add({
    code: "VG-02", group: "vol", ru: "Объёмный разбор",
    what: "Слои предмета расходятся вертикально.",
    when: "Состав физического объекта.",
    fam: ["F12", "F08"], proj: ["ecs", "democrm", "arseniy"],
    spec: "D=1200 мс, E1; n=3 слоя 2×0.6×2, Y=−0.6/0/+0.6; сдвиг по Y на (i−(n−1)/2)×0.7 ед.; X/Z неизменны; пол опущен до y=−2, чтобы нижний слой не уходил под него.",
    hold: 1300,
    async play(c) {
      const env = vgStage(c, { floorY: -2.2, k: 0.78, dy: -5 });
      drawFloor(env, 2.4);
      const R = env.P.raw;
      const L = [
        mkBox({ c: [0, -0.6, 0], s: [2, 0.6, 2], col: mix(R.sf, R.mu, 0.55), dec: { py: dots } }),
        mkBox({ c: [0, 0, 0], s: [2, 0.6, 2], col: env.base }),
        mkBox({ c: [0, 0.6, 0], s: [2, 0.6, 2], col: env.acc, dec: { py: ringTop } }),
      ];
      const draw = (p) => {
        const e = EF.E1(p);
        L.forEach((m, i) => { m.c = [0, [-0.6, 0, 0.6][i] + (i - 1) * 0.7 * e, 0]; });
        frameVG(env, L);
        // вертикальные направляющие по ближнему ребру
        const x = env.C.x, ex = 1, ez = 1;
        if (e > 0.02) {
          x.save(); x.setLineDash([3, 3]); x.strokeStyle = S(R.dk, 0.4); x.lineWidth = 1;
          [[ex, ez], [-ex, ez], [ex, -ez]].forEach(([a, b]) => { const p0 = proj([a, -0.9 - 0.7 * e, b]), p1 = proj([a, 0.9 + 0.7 * e, b]); x.beginPath(); x.moveTo(p0[0], p0[1]); x.lineTo(p1[0], p1[1]); x.stroke(); });
          x.restore();
        }
      };
      draw(0);
      await c.wait(450);
      await c.tick(1200, (t, p) => draw(p));
      draw(1);
    },
  });

  /* ----- VG-03 ----- */
  function houseMeshes(env) {
    const R = env.P.raw;
    const body = mkBox({ c: [0, 0, 0], s: [2, 1.3, 2], col: env.base, dec: { pz: (g, k, e) => { windows(2, 1)(g, k, e); g.fillStyle = S(R.dk, 0.8); g.fillRect(0.43, 0.5, 0.2, 0.5); }, px: windows(2, 2) } });
    const roof = mkRoof({ c: [0, 0, 0], s: [2.3, 0.7, 2.3], col: env.acc, cols: { gx: mix(env.acc, R.dk, 0.15), gn: mix(env.acc, R.dk, 0.15) } });
    return [body, roof];
  }
  SKD.add({
    code: "VG-03", group: "vol", ru: "Подъём из пола",
    what: "Макет появляется из-за плоскости пола.",
    when: "Вход здания или предмета в изометрическую сцену.",
    fam: ["F12", "F08"], proj: ["ecs", "democrm"],
    spec: "D=900 мс, E2; центр предмета Y=−3→0; всё ниже y=−1 отсечено плоскостью, пол непрозрачен; масштаб постоянен, тень появляется только после пересечения пола.",
    hold: 1300,
    async play(c) {
      const env = vgStage(c);
      drawFloor(env);
      const [body, roof] = houseMeshes(env);
      const draw = (yc) => { body.c = [0, yc - 0.35, 0]; roof.c = [0, yc + 0.65, 0]; roof.z = 1; body.z = 0; frameVG(env, [body, roof]); };
      draw(-3);
      await c.wait(450);
      await c.tick(900, (t, p) => draw(lerp(-3, 0, EF.E2(p))));
      draw(0);
    },
  });

  /* ----- VG-04 ----- */
  SKD.add({
    code: "VG-04", group: "vol", ru: "Сборка кубиками",
    what: "Восемь кубов собираются в один крупный блок.",
    when: "Low-poly конструктор и объяснение структуры.",
    fam: ["F12", "F08"], proj: ["skilaxy", "democrm"],
    spec: "D=1020 мс; 8 кубов 1×1×1, конечные X/Y/Z=±0.5, старт = конечная×3; каждый 600 мс E2, задержка 60·i мс, порядок X→Y→Z.",
    hold: 1300,
    async play(c) {
      const env = vgStage(c, { k: 0.78, dy: 24 });
      drawFloor(env);
      const R = env.P.raw;
      const cubes = [];
      let i = 0;
      for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
        const par = (x > 0) + (y > 0) + (z > 0);
        cubes.push(mkBox({ c: [x, y, z], s: [0.97, 0.97, 0.97], col: i === 7 ? env.acc : (par % 2 ? env.base : mix(R.sf, R.mu, 0.38)), fin: [x, y, z] }));
        i++;
      }
      const draw = (t) => {
        cubes.forEach((m, k) => { const e = EF.E2(clamp((t - 60 * k) / 600)); m.c = m.fin.map((v) => v * (3 - 2 * e)); });
        frameVG(env, cubes);
      };
      draw(0);
      await c.wait(450);
      await c.tick(1020, (t) => draw(t));
      draw(1020);
    },
  });

  /* ----- VG-05 ----- */
  SKD.add({
    code: "VG-05", group: "vol", ru: "Проход света",
    what: "Световой блик проходит по неподвижному предмету.",
    when: "Показать материал без вращения объекта.",
    fam: ["F12", "F08"], proj: ["ecs", "skilaxy"],
    spec: "D=2200 мс, E1; ключевой свет по окружности R=6 на Y=4: θ −45°→+45°, X=6sinθ, Z=6cosθ; интенсивность и материал постоянны, камера стоит.",
    hold: 1200,
    async play(c) {
      const env = vgStage(c, { amb: 0.22, key: 0.9, dy: 6 });
      drawFloor(env);
      const R = env.P.raw;
      const cube = mkBox({ c: [0, 0, 0], s: [2, 2, 2], col: mix(R.sf, R.mu, 0.5) });
      const mk = (th) => [6 * Math.sin(th), 4, 6 * Math.cos(th)];
      /* условный указатель источника: дуга над сценой, положение по углу θ */
      const mark = (q, th) => [240 + 150 * (th / (45 * DEG)), 42 - 15 * (1 - Math.pow(th / (45 * DEG), 2))];
      const arc = []; for (let a = -45; a <= 45; a += 5) arc.push(mark(null, a * DEG));
      const draw = (th) => {
        env.L = mk(th);
        frameVG(env, [cube], { glint: true });
        const x = env.C.x;
        x.save(); x.setLineDash([2, 4]); x.strokeStyle = S(R.dk, 0.28); x.lineWidth = 1.2; x.beginPath(); arc.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.stroke(); x.restore();
        const m = mark(null, th);
        const g = x.createRadialGradient(m[0], m[1], 0, m[0], m[1], 26);
        g.addColorStop(0, S(R.lt, 0.95)); g.addColorStop(0.35, S(R.ac, 0.45)); g.addColorStop(1, S(R.ac, 0));
        x.fillStyle = g; x.fillRect(m[0] - 30, m[1] - 30, 60, 60);
        x.fillStyle = S(R.lt); x.beginPath(); x.arc(m[0], m[1], 4.5, 0, 7); x.fill();
        x.strokeStyle = S(R.dk, 0.55); x.lineWidth = 1; x.stroke();
      };
      draw(-45 * DEG);
      await c.wait(350);
      await c.tick(2200, (t, p) => draw(lerp(-45, 45, EF.E1(p)) * DEG));
      draw(45 * DEG);
    },
  });

  /* ----- VG-06 ----- */
  SKD.add({
    code: "VG-06", group: "vol", ru: "Матовая прозрачность",
    what: "Передний слой становится полупрозрачным и показывает внутренний.",
    when: "Устройство предмета и матовое стекло.",
    fam: ["F12", "F08"], proj: ["ecs", "democrm"],
    spec: "D=1000 мс, E1; α наружной оболочки 1→0.28, roughness 0.8 постоянна; внутренняя деталь непрозрачна; сортировка по глубине, без преломлений и размытых надписей.",
    hold: 1300,
    async play(c) {
      const env = vgStage(c);
      drawFloor(env);
      const R = env.P.raw;
      const shell = mkBox({ c: [0, 0, 0], s: [2, 2, 2], col: env.base, alpha: 1, edgeA: 0.55 });
      const inner = [
        mkBox({ c: [0, -0.8, 0], s: [1.5, 0.2, 1.5], col: mix(R.sf, R.mu, 0.55) }),
        mkBox({ c: [0, -0.05, 0], s: [1, 1.3, 1], col: mix(env.acc, R.ac, 0.35), dec: { pz: ringTop, px: bars } }),
        mkBox({ c: [0.62, -0.5, -0.55], s: [0.3, 0.4, 0.3], col: mix(R.sf, R.mu, 0.4) }),
      ];
      const draw = (al) => {
        shell.alpha = al;
        drawShadows(env, [shell]);
        env.B.cv.style.opacity = r1(0.24 * (0.5 + 0.5 * al));
        env.C.x.clearRect(-20, -110, 520, 490);
        drawMesh(env, shell, { pass: "back", alpha: al * 0.8 });
        inner.slice().sort((a, b) => v3.dot(b.c, CAM.f) - v3.dot(a.c, CAM.f)).forEach((m) => drawMesh(env, m));
        drawMesh(env, shell, { pass: "front", alpha: al });
        if (al < 0.999) {
          // матовая дымка стекла: лёгкий светлый налёт по передним граням, без бликов
          const x = env.C.x;
          shell.faces.forEach((f) => { const n = rotY(f.n, 0); if (v3.dot(n, CAM.f) >= 0) return; const sp = clipY(f.v.map((p) => worldV(shell, p)), env.floorY).map(proj); x.save(); x.globalAlpha = (1 - al) * 0.1; x.fillStyle = S(R.lt); x.beginPath(); sp.forEach((q, i) => (i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]))); x.closePath(); x.fill(); x.restore(); });
        }
      };
      draw(1);
      await c.wait(450);
      await c.tick(1000, (t, p) => draw(lerp(1, 0.28, EF.E1(p))));
      draw(0.28);
    },
  });

  /* ----- VG-07: макет квартала ----- */
  function townMeshes(env) {
    const R = env.P.raw, FL = -1;
    const walls = [env.base, mix(R.sf, R.mu, 0.38), mix(R.sf, R.bg, 0.5)];
    const roofs = [env.acc, mix(R.mu, R.ac, 0.3), mix(env.acc, R.dk, 0.2)];
    const out = [];
    const road = mix(R.sf, R.dk, 0.42);
    out.push(mkBox({ c: [0, FL + 0.02, 0.1], s: [5.4, 0.04, 0.75], col: road, z: -2, noShadow: true, edgeA: 0, dec: { py: (g, k, e) => { g.strokeStyle = S(e.P.raw.lt, 0.8); g.lineWidth = 1.6 / k; g.setLineDash([0.05, 0.05]); g.beginPath(); g.moveTo(0, 0.5); g.lineTo(1, 0.5); g.stroke(); } } }));
    out.push(mkBox({ c: [-1.0, FL + 0.021, 0], s: [0.75, 0.04, 5.4], col: road, z: -2, noShadow: true, edgeA: 0 }));
    const house = (x, z, w, d, h, wi, ri, ry) => {
      const body = mkBox({ c: [x, FL + h / 2, z], s: [w, h, d], col: walls[wi], ry: ry || 0, dec: { pz: windows(2, h > 1 ? 2 : 1), px: windows(2, h > 1 ? 2 : 1) } });
      const roof = mkRoof({ c: [x, FL + h + 0.17, z], s: [w + 0.18, 0.34, d + 0.18], col: roofs[ri], ry: ry || 0, cols: { gx: mix(roofs[ri], R.dk, 0.18), gn: mix(roofs[ri], R.dk, 0.18) } });
      body.z = 0; roof.z = 0; return [body, roof];
    };
    [house(-2.0, -1.55, 1.1, 0.95, 0.8, 0, 0), house(-2.0, 1.45, 1.0, 1.2, 0.7, 2, 1), house(0.35, -1.75, 1.3, 0.9, 0.75, 1, 2), house(1.9, -1.0, 0.95, 1.1, 0.9, 0, 0, 90 * DEG), house(0.55, 1.65, 1.2, 1.0, 0.7, 2, 0),
      house(1.65, 0.75, 0.9, 0.9, 0.62, 1, 1)].forEach((a) => out.push(...a));
    const tower = mkBox({ c: [2.15, FL + 1.1, 1.75], s: [0.8, 2.2, 0.8], col: mix(R.sf, R.mu, 0.3), dec: { pz: windows(1, 3), px: windows(1, 3) } });
    out.push(tower, mkRoof({ c: [2.15, FL + 2.2 + 0.25, 1.75], s: [1.0, 0.5, 1.0], col: env.acc, cols: { gx: mix(env.acc, R.dk, 0.18), gn: mix(env.acc, R.dk, 0.18) } }));
    [[-0.1, 0.9], [0.2, 0.55], [-1.7, 0.1], [1.2, -2.2], [-0.2, -0.95], [2.3, 0.05]].forEach(([x, z], i) => {
      out.push(mkBox({ c: [x, FL + 0.12, z], s: [0.1, 0.24, 0.1], col: mix(R.dk, R.mu, 0.4), noShadow: true }));
      out.push(mkBox({ c: [x, FL + 0.44, z], s: [0.42, 0.46, 0.42], col: mix(R.mu, R.sf, 0.15 + (i % 3) * 0.12) }));
    });
    return out;
  }
  SKD.add({
    code: "VG-07", group: "vol", ru: "Миниатюрный фокус",
    what: "Центр макета резкий, ближний и дальний планы смягчаются.",
    when: "Тилт-шифт как приём изображения макета.",
    fam: ["F12", "F08"], proj: ["ecs", "democrm"],
    spec: "D=1200 мс, E1; полоса резкости y=0.4H…0.65H, вне неё blur 0→8 px (в демо 6 px) с линейным пером 0.08H; предметы и камера неподвижны, текст поверх резкий.",
    hold: 1300,
    async play(c) {
      const mkLayer = () => { const e = vgStage(c, { k: 0.98, dy: 4 }); drawFloor(e); const ms = townMeshes(e); frameVG(e, ms); return e; };
      const blurred = mkLayer(), sharp = mkLayer();
      const band = "linear-gradient(180deg,transparent 0,transparent 32%,#000 40%,#000 65%,transparent 73%,transparent 100%)";
      sharp.W.style.webkitMaskImage = band; sharp.W.style.maskImage = band;
      blurred.W.style.filter = "blur(0px)";
      const cap = c.el("div", "position:absolute;left:16px;bottom:12px;padding:5px 11px;border-radius:7px;background:var(--sf);color:var(--fg);font-size:13px;font-weight:600;box-shadow:0 0 0 1px color-mix(in srgb,var(--fg) 14%,transparent);z-index:5", null, "Макет квартала · 1:200");
      await c.wait(450);
      await c.a(blurred.W, [{ filter: "blur(0px)" }, { filter: "blur(6px)" }], { duration: 1200, easing: c.E.E1 });
    },
  });

  /* ----- VG-08: свет сквозь витраж ----- */
  SKD.add({
    code: "VG-08", group: "vol", ru: "Свет сквозь витраж",
    what: "Цветное пятно постепенно появляется на соседней плоскости.",
    when: "Символическая световая сцена, тихая заставка.",
    fam: ["F12", "F08"], proj: ["ecs"],
    spec: "D=1800 мс, E1; копия маски витража на плоскости пола: skewX −25°, sy 0.45, центр T; α 0→0.22, x −30→0 px, blur; сам витраж неизменен.",
    hold: 1300,
    async play(c) {
      const P = PAL(c), R = P.raw;
      const { svg, defs } = layer(c, "");
      const WX = 138, WY = 100, T = { x: 340, y: 224 }, WS = 0.94;
      // стена и пол
      sv(c, svg, "rect", { x: 0, y: 0, width: 480, height: 270 }, "fill:var(--bg)");
      sv(c, svg, "rect", { x: 0, y: 186, width: 480, height: 84 }, `fill:${S(mix(R.bg, R.fg, 0.1))}`);
      sv(c, svg, "rect", { x: 0, y: 183, width: 480, height: 3 }, `fill:${S(mix(R.bg, R.fg, 0.2))}`);
      // витраж: арка 120×170 вокруг (0,0)
      const cp = sv(c, defs, "clipPath", { id: "vg8clip" });
      sv(c, cp, "path", { d: "M-60 85 V-25 A60 60 0 0 1 60 -25 V85 Z" });
      const win = sv(c, defs, "g", { id: "vg8win" });
      const cols = [R.ac, mix(R.ac, R.bg, 0.5), mix(R.ac, R.fg, 0.4), R.mu, mix(R.mu, R.ac, 0.5), mix(R.sf, R.ac, 0.25)];
      const cg = sv(c, win, "g", { "clip-path": "url(#vg8clip)" });
      const cw = 30, ch = 170 / 6;
      for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) {
        const k = Math.floor(c.rnd() * cols.length);
        sv(c, cg, "rect", { x: -60 + i * cw, y: -85 + j * ch, width: cw + 0.5, height: ch + 0.5 }, `fill:${S(cols[k])}`);
      }
      const lead = "stroke:" + S(R.dk) + ";stroke-width:3;fill:none;stroke-linecap:round";
      const lg = sv(c, win, "g", { "clip-path": "url(#vg8clip)" });
      for (let i = 1; i < 4; i++) sv(c, lg, "line", { x1: -60 + i * cw, y1: -90, x2: -60 + i * cw, y2: 90 }, lead);
      for (let j = 1; j < 6; j++) sv(c, lg, "line", { x1: -62, y1: -85 + j * ch, x2: 62, y2: -85 + j * ch }, lead);
      sv(c, lg, "path", { d: "M-60 -25 L0 -85 L60 -25 M-60 28 L0 -25 L60 28", style: lead });
      sv(c, win, "path", { d: "M-60 85 V-25 A60 60 0 0 1 60 -25 V85 Z", style: `fill:none;stroke:${S(R.dk)};stroke-width:6;stroke-linejoin:round` });
      sv(c, svg, "rect", { x: WX - 66, y: WY + 85 * WS, width: 132, height: 8, rx: 2 }, `fill:${S(mix(R.bg, R.fg, 0.25))}`);
      const bg2 = sv(c, defs, "linearGradient", { id: "vg8beam", gradientUnits: "userSpaceOnUse", x1: WX + 60, y1: WY, x2: T.x, y2: T.y });
      sv(c, bg2, "stop", { offset: 0, "stop-color": S(R.lt), "stop-opacity": 0.2 }); sv(c, bg2, "stop", { offset: 1, "stop-color": S(R.lt), "stop-opacity": 0 });
      const beam = sv(c, svg, "polygon", { points: `${WX + 56},${WY - 70} ${WX + 56},${WY + 78} ${T.x + 62},${T.y + 24} ${T.x - 14},${T.y - 30}` }, "fill:url(#vg8beam);opacity:0");
      const w1 = sv(c, svg, "g", { transform: `translate(${WX} ${WY}) scale(${WS})` });
      sv(c, w1, "use", { href: "#vg8win" });
      // пятно света: копия маски, сжатая и скошенная
      const fl = sv(c, defs, "filter", { id: "vg8blur", x: "-30%", y: "-30%", width: "160%", height: "160%" });
      sv(c, fl, "feGaussianBlur", { stdDeviation: 3.2 });
      const gt = sv(c, svg, "g", { transform: `translate(${T.x} ${T.y}) scale(${WS})` });
      const patch = sv(c, gt, "g", { filter: "url(#vg8blur)" });
      patch.style.opacity = "0"; patch.style.mixBlendMode = P.light ? "multiply" : "screen";
      const pu = sv(c, patch, "g", {});
      sv(c, pu, "use", { href: "#vg8win" });
      await c.wait(450);
      pu.style.transformOrigin = "0 0";
      await c.all(
        c.a(patch, [{ opacity: 0 }, { opacity: 0.22 }], { duration: 1800, easing: c.E.E1 }),
        c.a(beam, [{ opacity: 0 }, { opacity: 1 }], { duration: 1800, easing: c.E.E1 }),
        c.a(pu, [{ transform: "translateX(-30px) skewX(-25deg) scaleY(0.45)" }, { transform: "translateX(0px) skewX(-25deg) scaleY(0.45)" }], { duration: 1800, easing: c.E.E1 }),
      );
    },
  });

  /* ===================== FX — печать, фактура и материал ===================== */
  /* Все маски зерна и текстуры считаются один раз (feTurbulence с фиксированным seed) и приклеены к предмету:
     никакой «кипящей» фактуры и дрожания. Фильтры лежат в userSpaceOnUse, поэтому положение зерна не зависит от анимации слоя. */
  const FONTF = "font-family:'Golos Text',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
  /* выпадение краски: шум → порог → маска; thr≈0.35 при частоте 0.5 снимает ≈12% площади */
  function fSpeckle(c, defs, seed, thr, freq) {
    const id = uid();
    const f = c.sv(defs, "filter", { id, filterUnits: "userSpaceOnUse", x: -10, y: -10, width: 500, height: 290, "color-interpolation-filters": "sRGB" });
    c.sv(f, "feTurbulence", { type: "fractalNoise", baseFrequency: freq || 0.5, numOctaves: 2, seed, result: "n" });
    c.sv(f, "feColorMatrix", { in: "n", type: "matrix", values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  40 0 0 0 ${-40 * thr}`, result: "m" });
    c.sv(f, "feComposite", { in: "SourceGraphic", in2: "m", operator: "in" });
    return id;
  }
  /* неровный край: смещение по шуму (низкая частота), затем выпадение краски */
  function fPrint(c, defs, o) {
    const id = uid();
    const f = c.sv(defs, "filter", { id, filterUnits: "userSpaceOnUse", x: -10, y: -10, width: 500, height: 290, "color-interpolation-filters": "sRGB" });
    let src = "SourceGraphic";
    if (o.wob) {
      c.sv(f, "feTurbulence", { type: "fractalNoise", baseFrequency: o.wf || 0.04, numOctaves: 2, seed: o.wob, result: "w" });
      c.sv(f, "feDisplacementMap", { in: "SourceGraphic", in2: "w", scale: o.ws || 2, xChannelSelector: "R", yChannelSelector: "G", result: "d" });
      src = "d";
    }
    if (o.thr) {
      c.sv(f, "feTurbulence", { type: "fractalNoise", baseFrequency: o.freq || 0.5, numOctaves: 2, seed: o.seed || 17, result: "n" });
      c.sv(f, "feColorMatrix", { in: "n", type: "matrix", values: `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  40 0 0 0 ${-40 * o.thr}`, result: "m" });
      c.sv(f, "feComposite", { in: src, in2: "m", operator: "in" });
    }
    return id;
  }
  /* бумага: фиксированное мягкое зерно по всему кадру */
  function paper(c, parent, a) {
    const { svg, defs } = layer(c, "", parent);
    const id = uid();
    const f = c.sv(defs, "filter", { id, filterUnits: "userSpaceOnUse", x: 0, y: 0, width: 480, height: 270, "color-interpolation-filters": "sRGB" });
    c.sv(f, "feTurbulence", { type: "fractalNoise", baseFrequency: 0.9, numOctaves: 2, seed: 17, result: "n" });
    c.sv(f, "feColorMatrix", { in: "n", type: "matrix", values: `0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.25  ${a} 0 0 0 0` });
    c.sv(svg, "rect", { x: 0, y: 0, width: 480, height: 270, filter: `url(#${id})` });
    return svg;
  }

  /* ----- FX-01: ризограф ----- */
  SKD.add({
    code: "FX-01", group: "fx", ru: "Проявление ризографа",
    what: "Первый слой краски появляется, второй чуть запаздывает.",
    when: "Двухкрасочный плакат.",
    fam: ["F14", "F10"], proj: ["serial", "arseniy"],
    spec: "D=700 мс; слой 1 α 0→1 на 0–450 мс E2; слой 2 α 0→1 на 180–700 мс E2, постоянное смещение (+2,+1) px; зерно снимает ≈12% площади каждого слоя, маски фиксированы (seed 17).",
    hold: 1300,
    async play(c) {
      const P = PAL(c), R = P.raw;
      c.el("div", `position:absolute;inset:0;background:var(--bg)`);
      paper(c, null, 0.1);
      const ink = (css) => layer(c, "mix-blend-mode:multiply;opacity:0;" + css);
      const L1 = ink(""), L2 = ink("transform:translate(2px,1px)");
      const g1 = sv(c, L1.svg, "g", { filter: `url(#${fSpeckle(c, L1.defs, 5, 0.35)})` });
      const g2 = sv(c, L2.svg, "g", { filter: `url(#${fSpeckle(c, L2.defs, 11, 0.35)})` });
      // слой 1 (AC): солнце со щелями и волны
      const m = sv(c, L1.defs, "mask", { id: "fx1m", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 480, height: 270 });
      sv(c, m, "rect", { x: 0, y: 0, width: 480, height: 270, fill: "#fff" });
      [[146, 3], [158, 5], [172, 7], [188, 9]].forEach(([y, h]) => sv(c, m, "rect", { x: 220, y, width: 220, height: h, fill: "#000" }));
      sv(c, g1, "circle", { cx: 330, cy: 112, r: 88, mask: "url(#fx1m)" }, `fill:var(--ac)`);
      for (let i = 0; i < 3; i++) {
        let d = `M0 ${232 + i * 13}`; for (let x = 0; x < 480; x += 40) d += ` q10 -9 20 0 t20 0`;
        sv(c, g1, "path", { d }, `fill:none;stroke:var(--ac);stroke-width:5;stroke-linecap:round`);
      }
      // слой 2 (FG): заголовок и растр
      const t = sv(c, g2, "text", { x: 26, y: 188, textLength: 292, lengthAdjust: "spacingAndGlyphs" }, `${FONTF};font-weight:900;font-size:116px;fill:var(--fg)`);
      t.textContent = "ЛЕТО";
      const t2 = sv(c, g2, "text", { x: 28, y: 214, textLength: 250, lengthAdjust: "spacingAndGlyphs" }, `${FONTF};font-weight:700;font-size:15px;letter-spacing:.5px;fill:var(--fg)`);
      t2.textContent = "ФЕСТИВАЛЬ · 12–14 ИЮЛЯ";
      const pat = sv(c, L2.defs, "pattern", { id: "fx1dots", width: 7, height: 7, patternUnits: "userSpaceOnUse" });
      sv(c, pat, "circle", { cx: 3.5, cy: 3.5, r: 1.7 }, "fill:var(--fg)");
      sv(c, g2, "rect", { x: 26, y: 26, width: 130, height: 56, fill: "url(#fx1dots)" });
      sv(c, g2, "rect", { x: 26, y: 20, width: 130, height: 3 }, "fill:var(--fg)");
      await c.all(
        c.a(L1.svg, [{ opacity: 0 }, { opacity: 1 }], { duration: 450, easing: c.E.E2 }),
        c.wait(180).then(() => c.a(L2.svg, [{ opacity: 0 }, { opacity: 1 }], { duration: 520, easing: c.E.E2 })),
      );
    },
  });

  /* ----- FX-02: шелкографский проход ----- */
  SKD.add({
    code: "FX-02", group: "fx", ru: "Шелкографский проход",
    what: "Краска заполняет форму одним проходом ракеля.",
    when: "Шелкография и плоский плакат.",
    fam: ["F14", "F10"], proj: ["serial", "arseniy"],
    spec: "D=900 мс, E0; маска заливки от верхнего края формы к нижнему 0→100%h; край жёсткий; после прохода заливка не меняется, текстура сетки неподвижна.",
    hold: 1300,
    async play(c) {
      const P = PAL(c), R = P.raw;
      c.el("div", "position:absolute;inset:0;background:var(--bg)");
      paper(c, null, 0.07);
      const { svg, defs } = layer(c, "");
      // лист и тень
      sv(c, svg, "rect", { x: 146, y: 22, width: 188, height: 226, rx: 3 }, `fill:${S(R.fg, 0.14)};filter:blur(6px);transform:translate(4px,8px)`);
      sv(c, svg, "rect", { x: 146, y: 22, width: 188, height: 226, rx: 3 }, "fill:var(--sf)");
      // форма: солнце над горами
      const ecx = 240, ecy = 136;
      let star = ""; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 17 : 40; star += (i ? "L" : "M") + r1(ecx + Math.cos(a) * rr) + " " + r1(ecy + Math.sin(a) * rr) + " "; }
      const ring = (r) => `M${ecx - r} ${ecy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
      const shape = ring(76) + " " + ring(62) + " " + star + "Z";
      const Y0 = 58, Y1 = 214;
      // контур трафарета — виден до печати
      sv(c, svg, "path", { d: shape, "fill-rule": "evenodd" }, `fill:none;stroke:${S(R.mu, 0.55)};stroke-width:1.2;stroke-dasharray:4 4`);
      const cp = sv(c, defs, "clipPath", { id: "fx2clip" });
      const rect = sv(c, cp, "rect", { x: 140, y: Y0, width: 200, height: 0 });
      const ink = sv(c, svg, "g", { "clip-path": "url(#fx2clip)" });
      sv(c, ink, "path", { d: shape, "fill-rule": "evenodd" }, "fill:var(--ac)");
      // сетка ткани: фиксированная диагональная штриховка по краске
      const pat = sv(c, defs, "pattern", { id: "fx2mesh", width: 3, height: 3, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" });
      sv(c, pat, "rect", { x: 0, y: 0, width: 3, height: 1.1 }, `fill:${S(R.dk, 0.26)}`);
      const pg = sv(c, ink, "g", { "clip-path": "url(#fx2shape)" });
      const sc = sv(c, defs, "clipPath", { id: "fx2shape" });
      sv(c, sc, "path", { d: shape, "clip-rule": "evenodd" });
      sv(c, pg, "rect", { x: 140, y: 50, width: 200, height: 180, fill: "url(#fx2mesh)" });
      // ракель: лезвие стоит на кромке краски
      const sq = sv(c, svg, "g", {});
      sv(c, sq, "rect", { x: 122, y: 12, width: 236, height: 8, rx: 2 }, "fill:var(--fg)");
      sv(c, sq, "rect", { x: 130, y: 20, width: 220, height: 20, rx: 6 }, `fill:${S(R.mu)}`);
      sv(c, sq, "rect", { x: 130, y: 20, width: 220, height: 20, rx: 6 }, `fill:none;stroke:${S(R.dk, 0.35)};stroke-width:1`);
      sq.style.transform = `translateY(${Y0 - 12}px)`;
      sq.style.opacity = "0";
      await c.wait(400);
      sq.style.opacity = "1";
      await c.tick(900, (t, p) => { const y = Y0 + (Y1 - Y0) * p; rect.setAttribute("height", String(y - Y0)); sq.style.transform = `translateY(${r1(y - 12)}px)`; });
      await c.a(sq, [{ opacity: 1 }, { opacity: 1 }], { duration: 10 });
    },
  });

  /* ----- FX-03: газетный растр ----- */
  const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  function photoL(x, y, W, H) {
    let L = 0.42 + 0.36 * smooth(y / (H * 0.78));
    const dm = Math.hypot(x - 196, y - 62);
    if (dm > 30 && dm < 46) L = Math.max(L, 0.8 * Math.pow(1 - (dm - 30) / 16, 1.6));
    if (dm <= 30) {
      L = 0.97;
      [[188, 56, 6], [204, 68, 5], [198, 48, 3.5], [180, 72, 4]].forEach(([cx, cy, r]) => { if (Math.hypot(x - cx, y - cy) < r) L = 0.74; });
    }
    [[40, 24], [78, 50], [120, 20], [140, 70], [60, 96], [250, 36], [262, 84], [24, 74], [222, 22], [100, 100]].forEach(([sx, sy]) => { if (Math.hypot(x - sx, y - sy) < 2.2) L = 0.92; });
    const horizon = H - 52;
    const bl = [[0, 22, 40], [22, 44, 66], [44, 62, 34], [62, 94, 82], [94, 112, 46], [112, 140, 70], [140, 160, 38], [160, 188, 90], [188, 210, 52], [210, 238, 74], [238, 262, 42], [262, 280, 60]];
    for (const [x0, x1, h] of bl) {
      if (x >= x0 && x < x1 && y > H - h - 6) {
        L = 0.05;
        const wx = Math.floor((x - x0 - 3) / 7), wy = Math.floor((y - (H - h)) / 8);
        if (y > H - h && (x - x0) % 7 > 2 && (x - x0) % 7 < 5 && (y - (H - h)) % 8 > 2 && (y - (H - h)) % 8 < 6 && wx >= 0 && ((wx * 7 + wy * 3 + x0) % 5 < 2)) L = 0.85;
      }
    }
    if (y > H - 14) L = Math.min(L, 0.08 + 0.1 * ((x * 5) % 3 === 0 ? 1 : 0));
    return L;
  }
  SKD.add({
    code: "FX-03", group: "fx", ru: "Газетный растр",
    what: "Фото проявляется крупными точками без движения самого фото.",
    when: "Научная новость или архивная полоса.",
    fam: ["F14", "F10"], proj: ["serial", "arseniy", "ecs"],
    spec: "D=800 мс, E1; центры точек на сетке 8 px; радиус 0→4·√(1−L) px, L — нормированная яркость исходного кадра (фиксирована); точки FG на бумаге BG.",
    hold: 1300,
    async play(c) {
      const P = PAL(c), R = P.raw;
      c.el("div", "position:absolute;inset:0;background:var(--bg)");
      paper(c, null, 0.08);
      const cv = document.createElement("canvas"); cv.width = 960; cv.height = 540;
      cv.style.cssText = "position:absolute;left:0;top:0;width:480px;height:270px";
      c.stage.appendChild(cv);
      const x = cv.getContext("2d"); x.scale(2, 2);
      const { svg } = layer(c, "");
      const FX0 = 24, FY0 = 36, PW = 280, PH = 192, PITCH = 8;
      sv(c, svg, "text", { x: 24, y: 22, textLength: 92, lengthAdjust: "spacingAndGlyphs" }, `${FONTF};font-weight:900;font-size:15px;fill:var(--fg)`).textContent = "ВЕСТНИК";
      sv(c, svg, "rect", { x: 24, y: 27, width: 432, height: 2 }, "fill:var(--fg)");
      sv(c, svg, "rect", { x: FX0 - 1, y: FY0 - 1, width: PW + 2, height: PH + 2 }, `fill:none;stroke:var(--fg);stroke-width:1`);
      sv(c, svg, "text", { x: 24, y: 249, textLength: 118, lengthAdjust: "spacingAndGlyphs" }, `${FONTF};font-weight:600;font-size:11px;font-style:italic;fill:${S(R.mu)}`).textContent = "иллюстрация, растр 8 px";
      const h1 = sv(c, svg, "text", { x: 326, y: 56, textLength: 128, lengthAdjust: "spacingAndGlyphs" }, `${FONTF};font-weight:900;font-size:21px;fill:var(--fg)`);
      h1.textContent = "ЛУНА НАД";
      sv(c, svg, "text", { x: 326, y: 80, textLength: 128, lengthAdjust: "spacingAndGlyphs" }, `${FONTF};font-weight:900;font-size:21px;fill:var(--fg)`).textContent = "ГОРОДОМ";
      for (let i = 0; i < 12; i++) sv(c, svg, "rect", { x: 326, y: 98 + i * 11, width: i % 5 === 4 ? 78 : 128, height: 4, rx: 1 }, `fill:${S(R.mu, 0.55)}`);
      const dots = [];
      for (let j = 0; j < PH / PITCH; j++) for (let i = 0; i < PW / PITCH; i++) {
        const cx = i * PITCH + PITCH / 2, cy = j * PITCH + PITCH / 2;
        let L = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) L += photoL(cx + a * 2.2, cy + b * 2.2, PW, PH);
        L /= 9;
        dots.push([FX0 + cx, FY0 + cy, 4 * Math.sqrt(1 - clamp(L))]);
      }
      const draw = (k) => {
        x.clearRect(0, 0, 480, 270);
        x.save(); x.beginPath(); x.rect(FX0, FY0, PW, PH); x.clip();
        x.fillStyle = S(R.fg);
        for (const d of dots) { const r = d[2] * k; if (r < 0.15) continue; x.beginPath(); x.arc(d[0], d[1], r, 0, 6.2832); x.fill(); }
        x.restore();
      };
      draw(0);
      await c.wait(400);
      await c.tick(800, (t, p) => draw(EF.E1(p)));
      draw(1);
    },
  });

  /* ----- FX-04: резец по чёрному ----- */
  SKD.add({
    code: "FX-04", group: "fx", ru: "Резец по чёрному",
    what: "Белые резы открывают изображение из тёмной массы.",
    when: "Линогравюра и контрастный силуэт.",
    fam: ["F14", "F10"], proj: ["serial", "arseniy"],
    spec: "D=1000 мс, E0; n=11 белых путей в общей маске открываются по очереди, время каждого пропорционально длине, штрих 3 px; тёмная масса неподвижна.",
    hold: 1300,
    async play(c) {
      const P = PAL(c), R = P.raw;
      c.el("div", "position:absolute;inset:0;background:var(--bg)");
      paper(c, null, 0.07);
      const { svg, defs } = layer(c, "");
      const mass = P.light ? R.fg : R.sf, cut = P.light ? R.bg : R.fg;
      const rid = uid();
      const f = sv(c, defs, "filter", { id: rid, filterUnits: "userSpaceOnUse", x: 0, y: 0, width: 480, height: 270, "color-interpolation-filters": "sRGB" });
      sv(c, f, "feTurbulence", { type: "fractalNoise", baseFrequency: 0.09, numOctaves: 2, seed: 17, result: "w" });
      sv(c, f, "feDisplacementMap", { in: "SourceGraphic", in2: "w", scale: 2.4, xChannelSelector: "R", yChannelSelector: "G" });
      sv(c, svg, "rect", { x: 40, y: 20, width: 400, height: 230, rx: 3 }, `fill:${S(mass)};filter:url(#${rid})`);
      const g = sv(c, svg, "g", { filter: `url(#${rid})` });
      const st = `fill:none;stroke:${S(cut)};stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round`;
      const cx = 240, cy = 104;
      let rays = ""; for (let i = 0; i < 24; i++) { const a = i * 15 * DEG, r0 = 40, r1_ = i % 2 ? 56 : 68; rays += `M${r1(cx + Math.cos(a) * r0)} ${r1(cy + Math.sin(a) * r0)} L${r1(cx + Math.cos(a) * r1_)} ${r1(cy + Math.sin(a) * r1_)} `; }
      const waves = (y, ph, amp) => { let d = `M60 ${y}`; for (let x = 60; x < 420; x += 40) d += ` q10 ${-amp + ph} 20 0 t20 0`; return d; };
      const paths = [
        rays,
        `M${cx + 30} ${cy} a30 30 0 1 0 -60 0 a30 30 0 1 0 60 0`,
        `M${cx - 20} ${cy + 4} a20 20 0 0 1 34 -14 M${cx - 10} ${cy + 6} a11 11 0 0 1 18 -8`,
        "M52 172 L96 150 L128 166 L176 138 L214 160 L250 142 L292 164 L332 144 L376 168 L428 148",
        "M52 186 L94 170 L132 182 L180 160 L218 178 L252 164 L294 182 L336 164 L380 184 L428 170",
        (() => { let d = ""; for (let i = 0; i < 16; i++) { const x = 66 + i * 23; d += `M${x} ${192 + (i % 2) * 3} l-8 10 `; } return d; })(),
        waves(206, 0, 7), waves(218, 2, 7), waves(230, 0, 7), waves(240, -2, 6),
        "M60 160 l28 -14 l24 12 l28 -22",
      ];
      const els = paths.map((d) => { const p = sv(c, g, "path", { d }, st); return p; });
      const lens = els.map((e) => e.getTotalLength());
      const total = lens.reduce((a, b) => a + b, 0);
      let acc = 0; const sched = lens.map((l) => { const s = acc / total; acc += l; return [s, acc / total]; });
      els.forEach((e, i) => { e.style.strokeDasharray = lens[i] + 1; e.style.strokeDashoffset = lens[i] + 1; });
      const draw = (p) => els.forEach((e, i) => { const f2 = clamp((p - sched[i][0]) / (sched[i][1] - sched[i][0])); e.style.strokeDashoffset = (lens[i] + 1) * (1 - f2); e.style.opacity = f2 > 0 ? 1 : 0; });
      draw(0);
      await c.wait(450);
      await c.tick(1000, (t, p) => draw(p));
      draw(1);
    },
  });

  /* ----- FX-05: смена оттиска ----- */
  SKD.add({
    code: "FX-05", group: "fx", ru: "Смена оттиска",
    what: "Три похожих оттиска сменяются и затем замирают.",
    when: "Короткая живая печатная иллюстрация.",
    fam: ["F14", "F10"], proj: ["serial", "arseniy"],
    spec: "D=600 мс; маски M1/M2/M3/M1 сменяются в 0/200/400/600 мс, E6 (мгновенно); отклонение контура каждой ≤1 px, положение и рамка одинаковы; после 600 мс без повтора.",
    hold: 1300,
    async play(c) {
      const P = PAL(c), R = P.raw;
      c.el("div", "position:absolute;inset:0;background:var(--bg)");
      paper(c, null, 0.07);
      const { svg, defs } = layer(c, "");
      const cx = 240, cy = 124;
      const seal = (parent) => {
        const g = sv(c, parent, "g", {});
        const ring = (r, w) => sv(c, g, "circle", { cx, cy, r }, `fill:none;stroke:var(--ac);stroke-width:${w}`);
        ring(92, 6); ring(80, 2);
        const pid = uid();
        sv(c, defs, "path", { id: pid, d: `M${cx - 66} ${cy} a66 66 0 1 1 132 0 a66 66 0 1 1 -132 0` });
        const tx = sv(c, g, "text", {}, `${FONTF};font-weight:800;font-size:14px;fill:var(--ac)`);
        const tp = sv(c, tx, "textPath", { href: "#" + pid, startOffset: "0", textLength: 409, lengthAdjust: "spacing" });
        tp.textContent = "ТИРАЖ 50 · ОТТИСК · ТИРАЖ 50 · ОТТИСК ·";
        let star = ""; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 19 : 46; star += (i ? "L" : "M") + r1(cx + Math.cos(a) * rr) + " " + r1(cy + Math.sin(a) * rr) + " "; }
        sv(c, g, "path", { d: star + "Z" }, "fill:var(--ac);stroke:var(--ac);stroke-width:3;stroke-linejoin:round");
        sv(c, g, "circle", { cx, cy, r: 8 }, "fill:var(--bg)");
        return g;
      };
      const vars = [[3, 9, 0.35], [8, 21, 0.36], [14, 4, 0.34]];
      const gs = vars.map(([wob, seed, thr]) => {
        const wrap = sv(c, svg, "g", { filter: `url(#${fPrint(c, defs, { wob, ws: 2, wf: 0.05, thr, seed, freq: 0.5 })})` });
        seal(wrap); wrap.style.display = "none"; return wrap;
      });
      const lab = c.el("div", `opacity:0;position:absolute;left:0;right:0;top:238px;text-align:center;font-size:12px;font-weight:700;letter-spacing:1px;color:${S(R.mu)};${FONTF}`, null, "ОТТИСК 1 / 3");
      await c.wait(400);
      const show = (i) => { lab.style.opacity = "1"; gs.forEach((g, k) => { g.style.display = k === i ? "" : "none"; }); lab.textContent = `ОТТИСК ${i + 1} / 3`; };
      show(0);
      await c.wait(200); show(1);
      await c.wait(200); show(2);
      await c.wait(200); show(0);
    },
  });

  /* ----- FX-06: графит ----- */
  SKD.add({
    code: "FX-06", group: "fx", ru: "Проявление графита",
    what: "На светлой форме усиливается карандашная фактура.",
    when: "Карандаш, бумажная учебная вставка.",
    fam: ["F14", "F10"], proj: ["arseniy", "serial"],
    spec: "D=1200 мс, E1; фиксированная маска штрихов FG α 0→0.22 внутри контура, штрихи накапливаются при перекрытии; контур уже виден; масштаб и координаты маски постоянны.",
    hold: 1300,
    async play(c) {
      const P = PAL(c), R = P.raw;
      c.el("div", "position:absolute;inset:0;background:var(--bg)");
      const { svg, defs } = layer(c, "");
      sv(c, svg, "rect", { x: 30, y: 18, width: 420, height: 234, rx: 3 }, `fill:${S(R.fg, 0.12)};filter:blur(6px);transform:translate(3px,6px)`);
      sv(c, svg, "rect", { x: 30, y: 18, width: 420, height: 234, rx: 3 }, "fill:var(--sf)");
      paper(c, null, 0.05);
      // карандашная неровность линий
      const fid = uid();
      const f = sv(c, defs, "filter", { id: fid, filterUnits: "userSpaceOnUse", x: 0, y: 0, width: 480, height: 270 });
      sv(c, f, "feTurbulence", { type: "fractalNoise", baseFrequency: 0.7, numOctaves: 2, seed: 17, result: "w" });
      sv(c, f, "feDisplacementMap", { in: "SourceGraphic", in2: "w", scale: 1.6, xChannelSelector: "R", yChannelSelector: "G" });
      const sheet = sv(c, svg, "g", { filter: `url(#${fid})` });
      const ink = `stroke:var(--fg);stroke-linecap:round;fill:none`;
      // кубик (изометрия) и шар
      const cube = { cx: 150, cy: 150, a: 46 };
      const A = [cube.cx, cube.cy - cube.a * 1.15], Bq = [cube.cx + cube.a, cube.cy - cube.a * 0.55], C = [cube.cx + cube.a, cube.cy + cube.a * 0.5], D = [cube.cx, cube.cy + cube.a * 1.1], E = [cube.cx - cube.a, cube.cy + cube.a * 0.5], F = [cube.cx - cube.a, cube.cy - cube.a * 0.55], M = [cube.cx, cube.cy - cube.a * 0.05];
      const poly = (pts) => "M" + pts.map((p) => p.join(" ")).join(" L") + " Z";
      const faceL = poly([F, M, D, E]), faceR = poly([M, Bq, C, D]), faceT = poly([A, Bq, M, F]);
      const ball = { cx: 332, cy: 140, r: 56 };
      const defsClip = (id, d) => { const cp = sv(c, defs, "clipPath", { id }); sv(c, cp, "path", { d }); return id; };
      defsClip("fx6l", faceL); defsClip("fx6r", faceR);
      const cb = sv(c, defs, "clipPath", { id: "fx6b" }); sv(c, cb, "circle", { cx: ball.cx, cy: ball.cy, r: ball.r });
      const cm = sv(c, defs, "mask", { id: "fx6cm", maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 480, height: 270 });
      sv(c, cm, "rect", { x: 0, y: 0, width: 480, height: 270, fill: "#fff" });
      sv(c, cm, "circle", { cx: ball.cx - ball.r * 0.55, cy: ball.cy - ball.r * 0.6, r: ball.r * 1.15, fill: "#000" });
      // штриховка: фиксированный набор линий (seed 17), общий strokeOpacity на группе, перекрытия накапливаются
      const hatch = sv(c, sheet, "g", {});
      hatch.style.strokeOpacity = "0";
      const lines = (clip, x0, y0, x1, y1, step, ang, w) => {
        const g = sv(c, hatch, "g", { "clip-path": `url(#${clip})` });
        const ca = Math.cos(ang * DEG), sa = Math.sin(ang * DEG), len = 400;
        for (let t = -300; t < 300; t += step) {
          const mx = (x0 + x1) / 2 + (-sa) * t, my = (y0 + y1) / 2 + ca * t, j = (c.rnd() - 0.5) * 3, k = 0.88 + c.rnd() * 0.12;
          sv(c, g, "line", { x1: mx - ca * len * k + j, y1: my - sa * len * k, x2: mx + ca * len * k + j, y2: my + sa * len * k }, `${ink};stroke-width:${w}`);
        }
      };
      lines("fx6l", 90, 90, 210, 210, 3.4, -52, 1.5);
      lines("fx6r", 90, 90, 210, 210, 3.2, 58, 1.5); lines("fx6r", 90, 90, 210, 210, 4.2, 14, 1.4);
      lines("fx6b", 276, 84, 388, 196, 3.6, -48, 1.5);
      { const cg = sv(c, hatch, "g", { "clip-path": "url(#fx6b)" }); const mg = sv(c, cg, "g", { mask: "url(#fx6cm)" }); const keep = hatch; /* перекрёстная штриховка только на полумесяце тени */
        const ca = Math.cos(38 * DEG), sa = Math.sin(38 * DEG);
        for (let t = -200; t < 200; t += 3.2) { const mx = ball.cx - sa * t, my = ball.cy + ca * t, j = (c.rnd() - 0.5) * 3, k = 0.9 + c.rnd() * 0.1; sv(c, mg, "line", { x1: mx - ca * 160 * k + j, y1: my - sa * 160 * k, x2: mx + ca * 160 * k + j, y2: my + sa * 160 * k }, `${ink};stroke-width:1.4`); } }
      const gsh = defsClip("fx6s", `M${ball.cx - 70} ${ball.cy + 60} a82 14 0 1 0 164 0 a82 14 0 1 0 -164 0 Z`);
      lines(gsh, 250, 190, 420, 210, 3.4, 8, 1.4);
      const cs2 = defsClip("fx6s2", `M${cube.cx - 40} ${cube.cy + 56} L${cube.cx + 60} ${cube.cy + 58} L${cube.cx + 100} ${cube.cy + 64} L${cube.cx + 10} ${cube.cy + 66} Z`);
      lines(cs2, 100, 190, 260, 220, 3.4, 8, 1.4);
      // контуры — всегда видны
      const kon = `${ink};stroke-width:2;stroke-linejoin:round;stroke:var(--fg)`;
      sv(c, sheet, "path", { d: faceL }, kon); sv(c, sheet, "path", { d: faceR }, kon); sv(c, sheet, "path", { d: faceT }, kon);
      sv(c, sheet, "circle", { cx: ball.cx, cy: ball.cy, r: ball.r }, kon);
      sv(c, sheet, "path", { d: "M54 228 H430" }, `${ink};stroke-width:1.2;stroke-opacity:.55`);
      const cap = sv(c, svg, "text", { x: 52, y: 242 }, `${FONTF};font-size:11px;font-weight:600;font-style:italic;fill:${S(R.mu)}`); cap.textContent = "Рис. 1. Куб и шар, штриховка карандашом";
      await c.wait(450);
      await c.a(hatch, [{ strokeOpacity: 0 }, { strokeOpacity: 0.22 }], { duration: 1200, easing: c.E.E1 });
    },
  });

  /* ----- FX-07: блик по металлу ----- */
  SKD.add({
    code: "FX-07", group: "fx", ru: "Блик по металлу",
    what: "Узкая светлая полоса один раз проходит по материалу.",
    when: "Один металлический предмет или деталь.",
    fam: ["F14", "F10"], proj: ["ecs", "skilaxy"],
    spec: "D=900 мс, E1; полоса BG α 0.22, ширина 0.15w, высота 2h, blur, угол −20°; центр x=−0.2w→1.2w, y=0.5h, клип по предмету; вне предмета невидима.",
    hold: 1300,
    async play(c) {
      const P = PAL(c), R = P.raw;
      c.el("div", "position:absolute;inset:0;background:var(--bg)");
      const { svg, defs } = layer(c, "");
      const cx = 240, cy = 126, Rr = 100;
      const hexPts = (r, rot) => Array.from({ length: 6 }, (_, i) => { const a = (i * 60 + (rot || 30)) * DEG; return [r1(cx + Math.cos(a) * r), r1(cy + Math.sin(a) * r)]; });
      const hexD = (r) => "M" + hexPts(r).map((p) => p.join(" ")).join(" L") + " Z";
      // тень на поверхности
      sv(c, svg, "ellipse", { cx, cy: 232, rx: 118, ry: 12 }, `fill:${S(R.dk, 0.22)};filter:blur(6px)`);
      // металл: диагональные полосы тона + щётка
      const gid = uid();
      const lg = sv(c, defs, "linearGradient", { id: gid, x1: "0", y1: "0", x2: "1", y2: "1" });
      const hi = mix(R.mu, R.sf, 0.18), mid = mix(R.mu, R.dk, 0.42), lo = mix(R.mu, R.dk, 0.78);
      [[0, mid], [0.22, hi], [0.4, mix(mid, lo, 0.4)], [0.62, hi], [0.8, mid], [1, lo]].forEach(([o, col]) => sv(c, lg, "stop", { offset: o, "stop-color": S(col) }));
      const gid2 = uid();
      const rg = sv(c, defs, "radialGradient", { id: gid2, cx: "0.5", cy: "0.5", r: "0.5" });
      [[0, S(hi)], [0.7, S(mid)], [1, S(lo)]].forEach(([o, col]) => sv(c, rg, "stop", { offset: o, "stop-color": col }));
      const brush = uid();
      const bf = sv(c, defs, "filter", { id: brush, filterUnits: "userSpaceOnUse", x: 0, y: 0, width: 480, height: 270, "color-interpolation-filters": "sRGB" });
      sv(c, bf, "feTurbulence", { type: "fractalNoise", baseFrequency: "0.015 0.9", numOctaves: 2, seed: 17, result: "n" });
      sv(c, bf, "feColorMatrix", { in: "n", type: "matrix", values: "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.9 0 0 0 -0.32" });
      const obj = sv(c, svg, "g", {});
      sv(c, obj, "path", { d: hexD(Rr) }, `fill:url(#${gid});stroke:${S(R.dk, 0.55)};stroke-width:1.5;stroke-linejoin:round`);
      sv(c, obj, "path", { d: hexD(Rr - 11) }, `fill:url(#${gid});stroke:${S(R.dk, 0.35)};stroke-width:1`);
      sv(c, obj, "circle", { cx, cy, r: 62 }, `fill:url(#${gid2});stroke:${S(R.dk, 0.4)};stroke-width:1.2`);
      sv(c, obj, "circle", { cx, cy, r: 38 }, `fill:${S(mix(R.bg, R.dk, 0.55))}`);
      sv(c, obj, "circle", { cx, cy, r: 38 }, `fill:none;stroke:${S(R.lt, 0.5)};stroke-width:2;stroke-dasharray:3 2.2`);
      sv(c, obj, "circle", { cx, cy, r: 29 }, `fill:var(--bg);stroke:${S(R.dk, 0.5)};stroke-width:1.2`);
      // щётка: тонкие горизонтальные штрихи по металлу
      const clipId = uid();
      const cp = sv(c, defs, "clipPath", { id: clipId });
      sv(c, cp, "path", { d: hexD(Rr) + ` M${cx - 29} ${cy} a29 29 0 1 0 58 0 a29 29 0 1 0 -58 0 Z`, "clip-rule": "evenodd" });
      sv(c, svg, "rect", { x: 0, y: 0, width: 480, height: 270, filter: `url(#${brush})`, "clip-path": `url(#${clipId})`, opacity: 0.1 });
      // полоса блика: ширина 0.15w, высота 2h, угол −20°, α 0.22, blur
      const w = Rr * 1.732, h = Rr * 2;
      const bl = sv(c, defs, "filter", { id: "fx7blur", x: "-100%", y: "-20%", width: "300%", height: "140%" });
      sv(c, bl, "feGaussianBlur", { stdDeviation: 5 });
      const bc = sv(c, defs, "filter", { id: "fx7core", x: "-200%", y: "-20%", width: "500%", height: "140%" });
      sv(c, bc, "feGaussianBlur", { stdDeviation: 1.6 });
      const clip = sv(c, svg, "g", { "clip-path": `url(#${clipId})` });
      const mover = sv(c, clip, "g", { transform: `translate(${cx} ${cy})` });
      const band = sv(c, mover, "g", {});
      sv(c, band, "rect", { x: -0.075 * w, y: -h, width: 0.15 * w, height: 2 * h, transform: "rotate(-20)", filter: "url(#fx7blur)" }, `fill:${S(R.lt)};opacity:.22`);
      sv(c, band, "rect", { x: -0.025 * w, y: -h, width: 0.05 * w, height: 2 * h, transform: "rotate(-20)", filter: "url(#fx7core)" }, `fill:${S(R.lt)};opacity:.22`);
      band.style.transform = `translateX(${-0.7 * w}px)`;
      band.style.opacity = "0";
      await c.wait(500);
      band.style.opacity = "1";
      await c.a(band, [{ transform: `translateX(${-0.7 * w}px)` }, { transform: `translateX(${0.7 * w}px)` }], { duration: 900, easing: c.E.E1 });
      band.style.opacity = "0";
    },
  });

  /* ----- FX-08: открытие древесины ----- */
  SKD.add({
    code: "FX-08", group: "fx", ru: "Открытие древесины",
    what: "Материал проявляется от общего тона к фактуре.",
    when: "Тихая предметная сцена, деревянный предмет.",
    fam: ["F14", "F10"], proj: ["ecs", "serial"],
    spec: "D=1000 мс, E1; текстура дерева поверх плоской заливки SF, α 0→0.45; текстура не масштабируется и не течёт, свет, контур и положение предмета постоянны.",
    hold: 1300,
    async play(c) {
      const P = PAL(c), R = P.raw;
      c.el("div", "position:absolute;inset:0;background:var(--bg)");
      const { svg, defs } = layer(c, "");
      const bx = 70, by = 44, bw = 340, bh = 182, br = 26;
      const board = `M${bx + br} ${by} H${bx + bw - br} a${br} ${br} 0 0 1 ${br} ${br} V${by + bh - br} a${br} ${br} 0 0 1 ${-br} ${br} H${bx + br} a${br} ${br} 0 0 1 ${-br} ${-br} V${by + br} a${br} ${br} 0 0 1 ${br} ${-br} Z`;
      const hole = `M${bx + bw - 62} ${by + 36} a16 16 0 1 0 0.01 0 Z`;
      const full = board + " " + hole;
      // тень
      sv(c, svg, "path", { d: board + " " + hole, "fill-rule": "evenodd" }, `fill:${S(R.dk, 0.22)};filter:blur(8px);transform:translate(0,10px)`);
      const cp = sv(c, defs, "clipPath", { id: "fx8clip" }); sv(c, cp, "path", { d: full, "clip-rule": "evenodd" });
      // плоская заливка SF
      sv(c, svg, "path", { d: full, "fill-rule": "evenodd" }, `fill:${S(mix(R.sf, R.mu, 0.12))}`);
      // текстура: кольца роста — шум, растянутый вдоль волокон, пропущенный через ступенчатую таблицу
      const wf = sv(c, defs, "filter", { id: "fx8wood", filterUnits: "userSpaceOnUse", x: 0, y: 0, width: 480, height: 270, "color-interpolation-filters": "sRGB" });
      sv(c, wf, "feTurbulence", { type: "fractalNoise", baseFrequency: "0.0065 0.1", numOctaves: 3, seed: 17, result: "n" });
      sv(c, wf, "feColorMatrix", { in: "n", type: "matrix", values: "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0", result: "a" });
      const tr = sv(c, wf, "feComponentTransfer", { in: "a", result: "rings" });
      sv(c, tr, "feFuncA", { type: "table", tableValues: "0 0.85 0.1 0.9 0.05 0.8 0.15 0.9 0.1" });
      sv(c, wf, "feFlood", { "flood-color": S(mix(mix(R.mu, R.dk, 0.5), R.ac, 0.22)), "flood-opacity": 1, result: "dark" });
      sv(c, wf, "feComposite", { in: "dark", in2: "rings", operator: "in", result: "grain" });
      sv(c, wf, "feFlood", { "flood-color": S(mix(mix(R.mu, R.sf, 0.3), R.ac, 0.32)), result: "base" });
      sv(c, wf, "feComposite", { in: "grain", in2: "base", operator: "over" });
      const tex = sv(c, svg, "g", { "clip-path": "url(#fx8clip)" });
      const texLayer = sv(c, tex, "rect", { x: 0, y: 0, width: 480, height: 270, filter: "url(#fx8wood)" });
      texLayer.style.opacity = "0";
      // свет и контур — постоянные
      const hl = sv(c, defs, "linearGradient", { id: "fx8hl", x1: 0, y1: 0, x2: 0, y2: 1 });
      sv(c, hl, "stop", { offset: 0, "stop-color": S(R.lt), "stop-opacity": 0.5 });
      sv(c, hl, "stop", { offset: 0.35, "stop-color": S(R.lt), "stop-opacity": 0 });
      sv(c, hl, "stop", { offset: 1, "stop-color": S(R.dk), "stop-opacity": 0.14 });
      sv(c, svg, "path", { d: full, "fill-rule": "evenodd" }, "fill:url(#fx8hl)");
      sv(c, svg, "path", { d: full, "fill-rule": "evenodd" }, `fill:none;stroke:${S(R.dk, 0.5)};stroke-width:1.5;stroke-linejoin:round`);
      sv(c, svg, "path", { d: hole }, `fill:none;stroke:${S(R.lt, 0.55)};stroke-width:1.5;transform:translate(0,1.5px)`);
      await c.wait(450);
      await c.a(texLayer, [{ opacity: 0 }, { opacity: 0.45 }], { duration: 1000, easing: c.E.E1 });
    },
  });
})();
