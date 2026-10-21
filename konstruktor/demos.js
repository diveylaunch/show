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
          const t0 = performance.now();
          const step = (now) => {
            if (stopped) return rej(STOP);
            const t = Math.min(dur, now - t0);
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
    const { svg, defs } = layer(c, "pointer-events:none;" + o.z, parent);
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
        grain(c, d, { w: 240, h: 270, fill: "var(--mu)", a: 0.5, f: 0.6, seed: 9 });
        fibers(c, d, { w: 240, h: 270, fill: "var(--mu)", a: 0.25, seed: 4 });
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
      fibers(c, null, { fill: "var(--mu)", a: 0.25, seed: 4 });
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
      const man = sv(c, fig, "g", {}, "opacity:.38");
      sv(c, man, "path", { d: "M-33 -52L0 -81L33 -52Q0 -59 -33 -52Z" }, "fill:var(--fg)");
      sv(c, man, "ellipse", { cx: 0, cy: -48, rx: 9, ry: 10 }, "fill:var(--fg)");
      sv(c, man, "path", { d: "M-17 -40C-22 -18 -26 22 -29 78L29 78C26 22 22 -18 17 -40Q0 -46 -17 -40Z" }, "fill:var(--fg)");
      sv(c, man, "path", { d: "M-16 -38C-34 -28 -39 -2 -31 16L-22 10C-25 -4 -21 -22 -13 -30Z" }, "fill:var(--fg)");
      sv(c, man, "path", { d: "M35 -62L31 82", fill: "none" }, "stroke:var(--fg);stroke-width:3.4;stroke-linecap:round");
      sv(c, man, "ellipse", { cx: -12, cy: 80, rx: 12, ry: 4 }, "fill:var(--fg)"); sv(c, man, "ellipse", { cx: 13, cy: 80, rx: 12, ry: 4 }, "fill:var(--fg)");
      const veil = sv(c, svg, "rect", { width: 480, height: 270 }, "fill:var(--sf);opacity:.45");
      grain(c, null, { fill: "var(--mu)", a: 0.45, f: 0.6, seed: 9 });
      fibers(c, null, { fill: "var(--mu)", a: 0.22, seed: 4 });
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
    spec: "D=2200 мс, E1; силуэт ветки α 0→0.14 и x +40→0 px, blur 12; клип по бумаге; решётка и текст выше тени.",
    async play(c) {
      const { svg, defs } = layer(c);
      sv(c, svg, "rect", { width: 480, height: 270 }, "fill:var(--sf)");
      const lg = uid(), rg = c.sv(defs, "radialGradient", { id: lg, cx: 0.5, cy: 0.45, r: 0.75 });
      sv(c, rg, "stop", { offset: 0, "stop-opacity": 0 }, "stop-color:var(--bg)"); sv(c, rg, "stop", { offset: 1, "stop-opacity": 0.8 }, "stop-color:var(--bg)");
      sv(c, svg, "rect", { width: 480, height: 270 }, `fill:url(#${lg})`);
      const cid = uid(), cp = c.sv(defs, "clipPath", { id: cid }); c.sv(cp, "rect", { width: 480, height: 270 });
      const bl = fBlur(c, defs, 6, 120);
      const sh = sv(c, svg, "g", { "clip-path": `url(#${cid})`, filter: `url(#${bl.id})` }, "opacity:0");
      const mv = sv(c, sh, "g");
      sakura(c, mv, { mono: "var(--fg)", x: -150, y: -6, k: 1.62 });
      grain(c, null, { fill: "var(--mu)", a: 0.45, f: 0.6, seed: 9 });
      fibers(c, null, { fill: "var(--mu)", a: 0.22, seed: 4 });
      const s2 = layer(c); lattice(c, s2.svg, 480, 270);
      c.el("div", "position:absolute;left:0;right:0;top:186px;text-align:center;z-index:60", null, '<span style="display:inline-block;padding:6px 14px;border-radius:7px;background:color-mix(in srgb,var(--bg) 94%,transparent);color:var(--fg);font-weight:600;font-size:17px;letter-spacing:.01em;box-shadow:0 1px 0 rgba(0,0,0,.08)">Тише… слышишь ветер?</span>');
      await c.tick(2200, (t, p) => {
        const e = EF.E1(p);
        sh.style.opacity = f1(0.14 * e); mv.setAttribute("transform", `translate(${f1(40 * (1 - e))} 0)`);
      });
    },
  });
})();
