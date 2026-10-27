/* Экспериментаниум. Интерактивная версия. Логика страницы.
   Все тексты комментариев, варианты и подсказки лежат в блоке DATA в index.html. */
(function () {
  "use strict";
  const D = window.DATA;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const IMG = "assets/img/";
  const LS = "exp-shop-site-v1";
  const TYPES = Object.keys(D.types);

  /* ---------- Хранилище (в браузере, без сервера) ---------- */
  function load() { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } }
  function save() { try { localStorage.setItem(LS, JSON.stringify(store)); } catch (e) {} }
  const store = load();
  store.prefs = store.prefs || {};
  store.dec = store.dec || {};

  const state = {
    comments: store.prefs.comments !== false,
    types: Object.assign({ func: true, diff: true, q: true, tip: true }, store.prefs.types || {}),
    diffOnly: false,
    global: null,
    zone: {},
    view: {}
  };
  Object.keys(D.zones).forEach((id) => {
    const z = D.zones[id];
    state.zone[id] = z.defaultVariant || "a";
    if (z.views) state.view[id] = z.views[0].id;
  });

  /* ---------- Классы на body для фильтров ---------- */
  function applyBodyFlags() {
    document.body.classList.toggle("c-on", state.comments);
    TYPES.forEach((t) => document.body.classList.toggle("t-" + t, !!state.types[t]));
    document.body.classList.toggle("diff-only", state.diffOnly);
    $("#cToggle").setAttribute("aria-checked", String(state.comments));
    $("#diffToggle").setAttribute("aria-checked", String(state.diffOnly));
    $$(".dd-panel input").forEach((i) => (i.checked = !!state.types[i.value]));
    if (state.diffOnly) document.body.classList.add("c-on");
    store.prefs.comments = state.comments;
    store.prefs.types = state.types;
    save();
    if (!state.comments && !state.diffOnly) closePop();
  }

  /* ---------- Изображение с метками ---------- */
  function info(file) { return D.images[file] || { w: 4, h: 3, kind: "render", alt: "" }; }

  function makeMedia(file, opts) {
    opts = opts || {};
    const el = document.createElement("div");
    el.className = "media";
    fillMedia(el, file, opts);
    return el;
  }

  function fillMedia(el, file, opts) {
    opts = opts || {};
    el.innerHTML = "";
    el.classList.remove("missing", "white");
    if (!file) {
      el.classList.add("missing");
      el.style.setProperty("--r", opts.ratio || 4 / 3);
      el.style.aspectRatio = String(opts.ratio || 4 / 3);
      el.innerHTML = '<div class="missing-plate"><div class="big">Этот вариант пока не нарисован</div><p>' +
        (opts.missingText || "Подготовим визуализацию, если направление будет выбрано.") + "</p></div>";
      el.dataset.file = "";
      return;
    }
    const i = info(file);
    el.dataset.file = file;
    el.dataset.kind = i.kind;
    el.style.setProperty("--r", i.w / i.h);
    el.style.aspectRatio = i.w + " / " + i.h;
    if (i.white) el.classList.add("white");
    const img = new Image();
    img.src = IMG + file;
    img.alt = i.alt || "";
    img.width = i.w; img.height = i.h;
    img.loading = opts.eager ? "eager" : "lazy";
    img.decoding = "async";
    el.appendChild(img);
    if (!opts.noTag) {
      const t = document.createElement("span");
      t.className = "tag";
      t.textContent = i.kind === "photo" ? "Фото. Текущее состояние" : "Визуализация концепции";
      el.appendChild(t);
    }
    const marks = document.createElement("div");
    marks.className = "marks";
    const list = D.hotspots[file] || [];
    list.forEach((h, n) => {
      const b = document.createElement("button");
      b.className = "hs " + h.t;
      b.style.left = h.x + "%";
      b.style.top = h.y + "%";
      b.textContent = n + 1;
      b.setAttribute("aria-label", D.types[h.t].label + ". " + h.h);
      b.addEventListener("click", (e) => { e.stopPropagation(); openPop(b, file, n); });
      marks.appendChild(b);
    });
    el.appendChild(marks);
    if (!opts.noZoom) img.addEventListener("click", () => openLb(file));
    // список комментариев для печати
    const pn = el.parentElement && el.parentElement.querySelector(":scope > .pnotes");
    if (pn) renderPrintNotes(pn, file);
  }

  function renderPrintNotes(pn, file) {
    const list = (file && D.hotspots[file]) || [];
    pn.innerHTML = list.map((h, n) =>
      '<div><span class="n">' + (n + 1) + '.</span><span><b>' + D.types[h.t].label + '.</b> ' + h.h + ". " + h.p + "</span></div>"
    ).join("");
  }

  function swapMedia(el, file, opts) {
    if (el.dataset.file === (file || "")) return;
    el.classList.add("fade");
    setTimeout(() => {
      fillMedia(el, file, opts);
      requestAnimationFrame(() => el.classList.remove("fade"));
    }, 170);
  }

  // Статичные изображения в тексте: <div class="m" data-img="..."></div>
  function initStatic() {
    $$(".m[data-img]").forEach((ph) => {
      const file = ph.dataset.img;
      const wrap = document.createElement("figure");
      wrap.className = ph.className.replace(/\bm\b/, "fig").trim();
      const media = makeMedia(file);
      wrap.appendChild(media);
      if (ph.dataset.cap) {
        const c = document.createElement("figcaption");
        c.innerHTML = ph.dataset.cap;
        wrap.appendChild(c);
      }
      const pn = document.createElement("div");
      pn.className = "pnotes";
      wrap.appendChild(pn);
      renderPrintNotes(pn, file);
      ph.replaceWith(wrap);
    });
  }

  /* ---------- Просмотр зоны с вариантами ---------- */
  function zoneImg(id, v, view) {
    const z = D.zones[id];
    const vv = z.variants[v];
    if (!vv) return null;
    if (z.views) return vv[view || state.view[id]] || null;
    return vv.img;
  }

  function initZones() {
    $$("[data-zone]").forEach((host) => {
      const id = host.dataset.zone;
      const z = D.zones[id];
      host.classList.add("zv");
      const bar = document.createElement("div");
      bar.className = "zv-bar";
      let left = '<div class="left">';
      ["a", "b", "c"].forEach((v) => {
        const V = D.variants[v];
        const absent = !z.variants[v];
        left += '<button class="vbtn' + (absent ? " absent" : "") + '" data-v="' + v + '" aria-pressed="false" title="' +
          V.name + (absent ? ". Пока не нарисован" : "") + '"><span class="l">' + V.l + '</span><span class="nm">' + V.short +
          '</span><span class="sws">' + V.sw.map((c) => '<i class="' + c + '"></i>').join("") + "</span></button>";
      });
      left += "</div>";
      let right = '<div class="right">';
      if (z.views) {
        right += '<div class="tabs" role="group" aria-label="Ракурс">' +
          z.views.map((w) => '<button data-view="' + w.id + '" aria-pressed="false">' + w.label + "</button>").join("") + "</div>";
      }
      right += "</div>";
      bar.innerHTML = left + right;
      host.appendChild(bar);

      const stage = document.createElement("div");
      stage.className = "zv-stage";
      const media = makeMedia(zoneImg(id, state.zone[id]), { eager: true, missingText: z.missingText });
      stage.appendChild(media);
      host.appendChild(stage);
      const cap = document.createElement("div");
      cap.className = "zv-cap";
      host.appendChild(cap);
      const pn = document.createElement("div");
      pn.className = "pnotes";
      host.appendChild(pn);

      bar.addEventListener("click", (e) => {
        const vb = e.target.closest(".vbtn");
        const tb = e.target.closest("[data-view]");
        if (vb) { state.zone[id] = vb.dataset.v; state.global = null; updateGlobalUi(); updateZone(id); }
        if (tb) { state.view[id] = tb.dataset.view; updateZone(id); }
      });
      updateZone(id, true);
    });
  }

  function updateZone(id, first) {
    const host = $('[data-zone="' + id + '"]');
    if (!host) return;
    const z = D.zones[id];
    const v = state.zone[id];
    $$(".vbtn", host).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    $$("[data-view]", host).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view[id])));
    const file = zoneImg(id, v);
    const media = $(".zv-stage .media", host);
    const opts = { eager: true, missingText: z.missingText };
    if (first) fillMedia(media, file, opts); else swapMedia(media, file, opts);
    const V = D.variants[v];
    const vv = z.variants[v];
    let capTxt = "<span><b>Вариант " + V.l + ". " + V.name + ".</b> " + (vv ? (vv.cap || "") : "Визуализации пока нет.") + "</span>";
    const viewNote = z.viewNotes && z.views && z.viewNotes[state.view[id]];
    if (viewNote) capTxt += "<span>" + viewNote + "</span>";
    $(".zv-cap", host).innerHTML = capTxt;
    renderPrintNotes($(".pnotes", host), file);
    updateBA();
    updateMosaic();
    updateCompareHighlight();
  }

  /* ---------- Общий вариант для всего магазина ---------- */
  function setGlobal(v) {
    state.global = v;
    Object.keys(D.zones).forEach((id) => { state.zone[id] = v; updateZone(id); });
    updateGlobalUi();
    const miss = Object.keys(D.zones).filter((id) => !D.zones[id].variants[v]).map((id) => D.zones[id].short);
    toast("Весь магазин в варианте " + D.variants[v].l + (miss.length ? ". Не нарисовано: " + miss.join(", ") : ""));
  }
  function updateGlobalUi() {
    $$("#globalSeg button, .mosaic-bar .seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.g === state.global)));
  }

  /* ---------- Мозаика на обложке ---------- */
  function initMosaic() {
    const m = $(".mosaic");
    if (!m) return;
    m.innerHTML = D.mosaic.map((id) =>
      '<button class="tile" data-go="' + id + '"><img alt=""><span class="cap">' + D.zones[id].short + "</span></button>").join("");
    m.addEventListener("click", (e) => {
      const t = e.target.closest(".tile");
      if (t) document.getElementById(D.zones[t.dataset.go].section).scrollIntoView();
    });
    updateMosaic();
  }
  function updateMosaic() {
    $$(".mosaic .tile").forEach((t) => {
      const id = t.dataset.go;
      const v = state.zone[id];
      const z = D.zones[id];
      let file = null;
      const vv = z.variants[v];
      if (vv) file = z.views ? vv[z.mosaicView || z.views[0].id] : vv.img;
      const img = $("img", t);
      let none = $(".none", t);
      if (file) {
        if (none) none.remove();
        if (!img.src.endsWith(file)) { img.style.opacity = 0; img.onload = () => (img.style.opacity = 1); img.src = IMG + file; }
        img.alt = z.short;
        img.style.objectPosition = z.mosaicPos || "50% 50%";
      } else if (!none) {
        none = document.createElement("span");
        none.className = "none";
        none.textContent = "Вариант " + D.variants[v].l + " пока не нарисован";
        t.appendChild(none);
      }
    });
  }

  /* ---------- Было и стало ---------- */
  function initBA() {
    $$("[data-ba]").forEach((host) => {
      const cfg = D.ba[host.dataset.ba];
      host.innerHTML =
        '<div class="ba" style="aspect-ratio:' + cfg.ratio + ';max-width:' + (cfg.maxw || "none") + '">' +
        '<img class="before" alt="' + cfg.beforeAlt + '" src="' + IMG + cfg.before + '" loading="lazy">' +
        '<img class="after" alt="Визуализация концепции" loading="lazy">' +
        '<span class="lab l">Сейчас</span><span class="lab r">Концепция</span><span class="handle"></span>' +
        '<input type="range" min="0" max="100" value="50" aria-label="Сдвиньте, чтобы сравнить было и стало"></div>' +
        '<div class="ba-print"><img alt="" src="' + IMG + cfg.before + '"><img class="after-p" alt=""></div>' +
        '<p class="cap-line ba-note"></p>';
      const ba = $(".ba", host);
      const r = $("input", host);
      const set = () => ba.style.setProperty("--p", r.value + "%");
      r.addEventListener("input", set);
      set();
    });
    updateBA();
  }
  function updateBA() {
    $$("[data-ba]").forEach((host) => {
      const cfg = D.ba[host.dataset.ba];
      let v = state.zone[cfg.zone];
      let file = zoneImg(cfg.zone, v, cfg.view);
      let note = cfg.note;
      if (!file) { v = "a"; file = zoneImg(cfg.zone, "a", cfg.view); note = "Вариант " + D.variants[state.zone[cfg.zone]].l + " для этой зоны пока не нарисован, показан вариант А. " + note; }
      const a = $(".after", host);
      if (a && !a.src.endsWith(file)) a.src = IMG + file;
      const ap = $(".after-p", host);
      if (ap) ap.src = IMG + file;
      const n = $(".ba-note", host);
      if (n) n.textContent = note;
      if (a) a.style.objectPosition = cfg.afterPos || "50% 50%";
      const b = $(".before", host);
      if (b) b.style.objectPosition = cfg.beforePos || "50% 50%";
    });
  }

  /* ---------- Подсветка выбранного варианта в таблице ---------- */
  function updateCompareHighlight() {
    const t = $("table.cmp");
    if (!t) return;
    const v = state.global;
    $$("[data-col]", t).forEach((c) => c.classList.toggle("on", !!v && c.dataset.col === v));
  }

  /* ---------- Всплывающий комментарий ---------- */
  const pop = $("#pop");
  let popCtx = null;
  function openPop(btn, file, n) {
    const list = D.hotspots[file] || [];
    const visible = list.map((h, i) => i).filter((i) => isTypeVisible(list[i].t));
    if (!visible.length) return;
    if (visible.indexOf(n) === -1) n = visible[0];
    const h = list[n];
    $$(".hs.active").forEach((b) => b.classList.remove("active"));
    const host = btn.closest(".marks");
    const target = host ? host.children[n] : btn;
    if (target) target.classList.add("active");
    popCtx = { file, n, visible, host, anchor: target || btn };
    const pos = visible.indexOf(n) + 1;
    pop.innerHTML =
      '<button class="x" aria-label="Закрыть">×</button>' +
      '<div class="type"><span class="dot ' + h.t + '"></span>' + D.types[h.t].label + "</div>" +
      "<h4>" + h.h + "</h4><p>" + h.p + "</p>" +
      '<div class="nav"><button data-d="-1" aria-label="Предыдущий комментарий">‹</button><span>' + pos + " из " + visible.length +
      ' на этом изображении</span><button data-d="1" aria-label="Следующий комментарий">›</button></div>';
    pop.classList.add("open");
    placePop(target || btn);
    $(".x", pop).focus({ preventScroll: true });
  }
  function isTypeVisible(t) { return state.diffOnly ? t === "diff" : !!state.types[t]; }
  function placePop(anchor) {
    if (window.innerWidth <= 720) { pop.style.left = ""; pop.style.top = ""; return; }
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight;
    let x = r.right + 12, y = r.top - 10;
    if (x + w > window.innerWidth - 12) x = r.left - w - 12;
    if (x < 12) x = Math.max(12, Math.min(window.innerWidth - w - 12, r.left - w / 2));
    if (y + h > window.innerHeight - 12) y = window.innerHeight - h - 12;
    if (y < 12) y = 12;
    pop.style.left = x + "px";
    pop.style.top = y + "px";
  }
  function closePop() {
    pop.classList.remove("open");
    $$(".hs.active").forEach((b) => b.classList.remove("active"));
    popCtx = null;
  }
  pop.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.target.closest(".x")) return closePop();
    const d = e.target.closest("[data-d]");
    if (d && popCtx) {
      const i = popCtx.visible.indexOf(popCtx.n);
      const ni = popCtx.visible[(i + Number(d.dataset.d) + popCtx.visible.length) % popCtx.visible.length];
      const b = popCtx.host.children[ni];
      openPop(b, popCtx.file, ni);
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#pop") && !e.target.closest(".hs")) closePop();
    if (!e.target.closest("#tip") && !e.target.closest(".term")) closeTip();
    if (!e.target.closest(".dd")) $$(".dd").forEach((d) => d.classList.remove("open"));
    if (!e.target.closest("#printMenu") && !e.target.closest("#printBtn")) $("#printMenu").classList.remove("open");
  });
  window.addEventListener("scroll", () => {
    if (!popCtx || window.innerWidth <= 720) return;
    const r = popCtx.anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight || !r.width) closePop(); else placePop(popCtx.anchor);
  }, { passive: true });

  /* ---------- Подсказки по терминам ---------- */
  const tip = $("#tip");
  function initGlossary() {
    const keys = Object.keys(D.glossary).sort((a, b) => b.length - a.length);
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("(?<![\\p{L}\\p{N}-])(" + keys.map(esc).join("|") + ")(?![\\p{L}\\p{N}])", "u");
    $$("section.sec").forEach((sec) => {
      const used = new Set();
      const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p || p.closest("h1,h2,h3,button,.term,svg,script,textarea,.media,th")) return NodeFilter.FILTER_REJECT;
          return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const m = node.nodeValue.match(re);
        if (!m) return;
        const key = keys.find((k) => k.toLowerCase() === m[1].toLowerCase()) || m[1];
        if (used.has(key)) return;
        used.add(key);
        const after = node.splitText(m.index);
        after.splitText(m[1].length);
        const span = document.createElement("span");
        span.className = "term";
        span.tabIndex = 0;
        span.dataset.term = key;
        span.textContent = after.nodeValue;
        after.replaceWith(span);
      });
    });
    let hoverT;
    document.addEventListener("mouseover", (e) => {
      const t = e.target.closest(".term");
      if (t) { clearTimeout(hoverT); showTip(t); }
    });
    document.addEventListener("mouseout", (e) => {
      if (e.target.closest(".term")) hoverT = setTimeout(closeTip, 250);
    });
    tip.addEventListener("mouseover", () => clearTimeout(hoverT));
    tip.addEventListener("mouseout", () => (hoverT = setTimeout(closeTip, 250)));
    document.addEventListener("click", (e) => { const t = e.target.closest(".term"); if (t) showTip(t); });
    document.addEventListener("focusin", (e) => { const t = e.target.closest && e.target.closest(".term"); if (t) showTip(t); });
  }
  function showTip(t) {
    $$(".term.open").forEach((x) => x.classList.remove("open"));
    t.classList.add("open");
    tip.innerHTML = "<b>" + t.dataset.term + "</b>" + D.glossary[t.dataset.term];
    tip.classList.add("open");
    const r = t.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = Math.min(window.innerWidth - w - 12, Math.max(12, r.left));
    let y = r.bottom + 8;
    if (y + h > window.innerHeight - 10) y = r.top - h - 8;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function closeTip() { tip.classList.remove("open"); $$(".term.open").forEach((x) => x.classList.remove("open")); }

  /* ---------- Увеличение с приближением ---------- */
  const lb = $("#lb");
  const lbStage = $(".lb-stage", lb);
  const lbCanvas = $(".lb-canvas", lb);
  let z = 1, tx = 0, ty = 0;
  function applyZ() {
    lbCanvas.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + z + ")";
    lbCanvas.style.setProperty("--z", z);
    $(".z", lb).textContent = Math.round(z * 100) + "%";
  }
  function openLb(file) {
    closePop();
    lbCanvas.innerHTML = "";
    lbCanvas.appendChild(makeMedia(file, { noZoom: true, noTag: true, eager: true }));
    const i = info(file);
    $(".cap", lb).textContent = (i.kind === "photo" ? "Фото. " : "Визуализация концепции. ") + (i.alt || "");
    z = 1; tx = 0; ty = 0; applyZ();
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
    $("#lbClose").focus();
  }
  function closeLb() { lb.classList.remove("open"); document.body.style.overflow = ""; closePop(); }
  function zoomBy(f, cx, cy) {
    const r = lbStage.getBoundingClientRect();
    cx = cx == null ? r.width / 2 : cx - r.left;
    cy = cy == null ? r.height / 2 : cy - r.top;
    const nz = Math.min(5, Math.max(1, z * f));
    const ox = cx - r.width / 2, oy = cy - r.height / 2;
    tx = ox - (ox - tx) * (nz / z);
    ty = oy - (oy - ty) * (nz / z);
    z = nz;
    if (z === 1) { tx = 0; ty = 0; }
    applyZ();
  }
  $("#lbIn").onclick = () => zoomBy(1.5);
  $("#lbOut").onclick = () => zoomBy(1 / 1.5);
  $("#lbReset").onclick = () => { z = 1; tx = 0; ty = 0; applyZ(); };
  $("#lbClose").onclick = closeLb;
  lbStage.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  lbStage.addEventListener("dblclick", (e) => { if (!e.target.closest(".hs")) zoomBy(z > 1.2 ? 1 / z : 2.2, e.clientX, e.clientY); });
  let drag = null;
  const pts = new Map();
  let pinch = null;
  lbStage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".hs")) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) {
      const [a, b] = Array.from(pts.values());
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z };
      drag = null;
    } else {
      drag = { x: e.clientX, y: e.clientY, tx, ty, moved: false };
    }
    lbStage.setPointerCapture(e.pointerId);
    lbStage.classList.add("drag");
  });
  lbStage.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = Array.from(pts.values());
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const target = Math.min(5, Math.max(1, pinch.z * d / pinch.d));
      zoomBy(target / z, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (z > 1) { tx = drag.tx + dx; ty = drag.ty + dy; applyZ(); }
  });
  function endPtr(e) {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0) { lbStage.classList.remove("drag"); drag = null; }
  }
  lbStage.addEventListener("pointerup", endPtr);
  lbStage.addEventListener("pointercancel", endPtr);

  /* ---------- Меню разделов и прогресс ---------- */
  function initNav() {
    const ol = $("#side ol");
    const secs = $$("section.sec[data-nav]");
    ol.innerHTML = secs.map((s) => '<li><a href="#' + s.id + '">' + s.dataset.nav + "</a></li>").join("");
    const links = $$("#side a");
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (en.isIntersecting) {
          links.forEach((a) => a.classList.toggle("cur", a.getAttribute("href") === "#" + en.target.id));
          const cnt = $("#presentBar .cnt");
          if (cnt) cnt.textContent = secs.indexOf(en.target) + 1 + " / " + secs.length;
        }
      });
    }, { rootMargin: "-35% 0px -60% 0px" });
    secs.forEach((s) => io.observe(s));
    ol.addEventListener("click", (e) => { if (e.target.closest("a")) document.body.classList.remove("side-open"); });
    const prog = $("#progress");
    const onScroll = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + "%";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Режим показа ---------- */
  function secList() { return $$("section.sec[data-nav]"); }
  function curSecIndex() {
    const s = secList();
    const mid = window.innerHeight * 0.35;
    let idx = 0;
    s.forEach((x, i) => { if (x.getBoundingClientRect().top <= mid) idx = i; });
    return idx;
  }
  function goSec(d) {
    const s = secList();
    const i = Math.max(0, Math.min(s.length - 1, curSecIndex() + d));
    s[i].scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  function setPresent(on) {
    const i = curSecIndex();
    document.body.classList.toggle("present", on);
    $("#presentBtn").setAttribute("aria-pressed", String(on));
    document.body.classList.remove("view-open", "side-open");
    requestAnimationFrame(() => secList()[i].scrollIntoView({ behavior: "auto" }));
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  /* ---------- Лист решений ---------- */
  function initDecisions() {
    const dir = $(".dec-dir");
    dir.innerHTML = D.decisions.directions.map((d) =>
      '<button data-dir="' + d.id + '" aria-pressed="false"><span class="l">' + d.l + '</span><span class="t">' + d.t + "</span></button>").join("");
    dir.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dir]");
      if (!b) return;
      store.dec.direction = store.dec.direction === b.dataset.dir ? null : b.dataset.dir;
      save(); renderDec();
    });
    const note = $("#decDirNote");
    note.value = store.dec.directionNote || "";
    note.addEventListener("input", () => { store.dec.directionNote = note.value; save(); renderSummary(); });

    const list = $(".dec-list");
    let lastGroup = null;
    list.innerHTML = D.decisions.items.map((it) => {
      let head = "";
      if (it.group && it.group !== lastGroup) head = '<h4 class="dec-group">' + it.group + "</h4>";
      lastGroup = it.group || null;
      const opts = it.options || DEFAULT_OPTS;
      return head + '<div class="dec-row' + (it.options ? " opt" : "") + '" data-id="' + it.id + '"><div class="name">' + it.name + "<small>" + it.sub + "</small></div>" +
        '<div class="st" role="group" aria-label="Решение по ' + it.name + '">' +
        opts.map((o) => '<button data-v="' + o.v + '" aria-pressed="false">' + o.t + "</button>").join("") + "</div>" +
        '<textarea placeholder="Заметка" aria-label="Заметка: ' + it.name + '"></textarea></div>';
    }).join("");
    store.dec.items = store.dec.items || {};
    $$(".dec-row", list).forEach((row) => {
      const id = row.dataset.id;
      const ta = $("textarea", row);
      ta.value = (store.dec.items[id] && store.dec.items[id].note) || "";
      ta.addEventListener("input", () => { (store.dec.items[id] = store.dec.items[id] || {}).note = ta.value; save(); renderSummary(); });
      $(".st", row).addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        const it = (store.dec.items[id] = store.dec.items[id] || {});
        it.st = it.st === b.dataset.v ? null : b.dataset.v;
        save(); renderDec();
      });
    });
    $("#decCopy").onclick = () => copyText(summaryText());
    $("#decSave").onclick = () => {
      const blob = new Blob([summaryText()], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "Итоги обсуждения. Редизайн магазина.txt";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $("#decReset").onclick = () => {
      if (!confirm("Очистить все отметки и заметки в листе решений?")) return;
      store.dec = { items: {} }; save();
      $$(".dec-row textarea").forEach((t) => (t.value = ""));
      note.value = "";
      renderDec();
    };
    renderDec();
  }
  const ST = { ok: "Согласовано", talk: "Обсудить", no: "Не подходит" };
  const DEFAULT_OPTS = [{ v: "ok", t: "Согласовано" }, { v: "talk", t: "Обсудить" }, { v: "no", t: "Не подходит" }];
  function stLabel(it, v) {
    if (!v) return "без отметки";
    if (it.options) { const o = it.options.find((x) => x.v === v); return o ? "вариант " + o.t : v; }
    return ST[v] || v;
  }
  function renderDec() {
    $$(".dec-dir button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dir === store.dec.direction)));
    $$(".dec-row").forEach((row) => {
      const it = (store.dec.items || {})[row.dataset.id] || {};
      $$(".st button", row).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === it.st)));
    });
    renderSummary();
  }
  function renderSummary() {
    const items = store.dec.items || {};
    const c = { ok: 0, talk: 0, no: 0 };
    let marked = 0;
    D.decisions.items.forEach((it) => {
      const v = items[it.id];
      if (!v || !v.st) return;
      marked++;
      if (!it.options && c[v.st] !== undefined) c[v.st]++;
    });
    const total = D.decisions.items.length;
    $(".dec-summary").textContent = "Отмечено " + marked + " из " + total + ". Согласовано " + c.ok + ", обсудить " + c.talk + ", не подходит " + c.no + ".";
  }
  function summaryText() {
    const d = new Date();
    const date = d.toLocaleDateString("ru-RU");
    const dir = D.decisions.directions.find((x) => x.id === store.dec.direction);
    let s = "Редизайн магазина научных сувениров. Итоги обсуждения, " + date + "\n\n";
    s += "Направление оформления. " + (dir ? dir.l + ", " + dir.t : "не выбрано") + "\n";
    if (store.dec.directionNote) s += "Заметка. " + store.dec.directionNote.trim() + "\n";
    s += "\n";
    let lastGroup = null;
    D.decisions.items.forEach((it) => {
      const v = (store.dec.items || {})[it.id] || {};
      if (it.group && it.group !== lastGroup) s += "\n" + it.group + "\n";
      lastGroup = it.group || null;
      s += (it.group ? "  " : "") + it.name + ". " + stLabel(it, v.st) + "\n";
      if (v.note && v.note.trim()) s += (it.group ? "    " : "  ") + "Заметка. " + v.note.trim() + "\n";
    });
    s += "\nСтатус проекта. Концепция. Размеры, материалы и стоимость определяются на следующем этапе.\n";
    return s;
  }
  function copyText(t) {
    const done = () => toast("Итоги скопированы. Их можно вставить в письмо или протокол");
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done));
    } else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) {
    const ta = document.createElement("textarea");
    ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { toast("Не получилось скопировать. Нажмите «Скачать файл»"); }
    ta.remove();
  }

  /* ---------- Тост ---------- */
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 2800);
  }

  /* ---------- Печать ---------- */
  function initPrint() {
    const btn = $("#printBtn");
    const menu = $("#printMenu");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = btn.getBoundingClientRect();
      menu.style.top = Math.min(window.innerHeight - 120, r.bottom + 6) + "px";
      menu.style.left = Math.max(10, Math.min(window.innerWidth - 250, r.right - 240)) + "px";
      menu.classList.toggle("open");
    });
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-print]");
      if (!b) return;
      menu.classList.remove("open");
      document.body.classList.toggle("print-notes", b.dataset.print === "notes");
      // загрузить все изображения до печати
      $$("img[loading=lazy]").forEach((i) => (i.loading = "eager"));
      setTimeout(() => window.print(), 300);
    });
  }

  /* ---------- Панель управления ---------- */
  function initControls() {
    $("#cToggle").addEventListener("click", () => { state.comments = !state.comments; if (!state.comments) state.diffOnly = false; applyBodyFlags(); });
    $("#diffToggle").addEventListener("click", () => {
      state.diffOnly = !state.diffOnly;
      applyBodyFlags();
      if (state.diffOnly) toast("Показаны только отличия визуализаций от задания");
    });
    $("#diffOff").addEventListener("click", () => { state.diffOnly = false; applyBodyFlags(); });
    $$(".dd > .ctl").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); b.parentElement.classList.toggle("open"); }));
    $$(".dd-panel input").forEach((i) => i.addEventListener("change", () => {
      state.types[i.value] = i.checked;
      if (i.checked) state.comments = true;
      applyBodyFlags();
    }));
    $$("[data-g]").forEach((b) => b.addEventListener("click", () => setGlobal(b.dataset.g)));
    $("#presentBtn").addEventListener("click", () => setPresent(!document.body.classList.contains("present")));
    $("#pExit").addEventListener("click", () => setPresent(false));
    $("#pPrev").addEventListener("click", () => goSec(-1));
    $("#pNext").addEventListener("click", () => goSec(1));
    $("#pC").addEventListener("click", () => { state.comments = !state.comments; applyBodyFlags(); });
    $("#menuBtn").addEventListener("click", (e) => { e.stopPropagation(); document.body.classList.toggle("side-open"); document.body.classList.remove("view-open"); });
    $("#viewBtn").addEventListener("click", (e) => { e.stopPropagation(); document.body.classList.toggle("view-open"); document.body.classList.remove("side-open"); });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#side") && !e.target.closest("#menuBtn")) document.body.classList.remove("side-open");
      if (!e.target.closest(".controls") && !e.target.closest("#viewBtn") && !e.target.closest("#printMenu")) document.body.classList.remove("view-open");
    });
    $$("[data-jump]").forEach((b) => b.addEventListener("click", () => document.getElementById(b.dataset.jump).scrollIntoView()));

    document.addEventListener("keydown", (e) => {
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "input") { if (e.key === "Escape") e.target.blur(); return; }
      if (lb.classList.contains("open")) {
        if (e.key === "Escape") closeLb();
        if (e.key === "+" || e.key === "=") zoomBy(1.4);
        if (e.key === "-") zoomBy(1 / 1.4);
        return;
      }
      if (e.key === "Escape") {
        if (pop.classList.contains("open")) return closePop();
        if (document.body.classList.contains("present")) return setPresent(false);
        closeTip();
        document.body.classList.remove("side-open", "view-open");
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "c" || k === "с") { state.comments = !state.comments; if (!state.comments) state.diffOnly = false; applyBodyFlags(); toast(state.comments ? "Комментарии включены" : "Комментарии выключены"); }
      if (k === "d" || k === "в") { state.diffOnly = !state.diffOnly; applyBodyFlags(); }
      if (k === "p" || k === "з") setPresent(!document.body.classList.contains("present"));
      if (document.body.classList.contains("present")) {
        if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) { e.preventDefault(); goSec(1); }
        if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); goSec(-1); }
      }
    });
    window.addEventListener("resize", () => { closePop(); closeTip(); });
  }

  /* ---------- Запуск ---------- */
  initStatic();
  initZones();
  initMosaic();
  initBA();
  initNav();
  initGlossary();
  initDecisions();
  initPrint();
  initControls();
  applyBodyFlags();
  updateGlobalUi();
})();
