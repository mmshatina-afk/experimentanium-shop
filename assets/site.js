/* Экспериментаниум. Редизайн магазина. Логика страницы.
   Данные (варианты, комментарии, пункты листа решений, версия) лежат в window.DATA в index.html.
   Хранение только в этом браузере (localStorage). Сервер не нужен. */
(function () {
  "use strict";
  const D = window.DATA;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const IMG = "assets/img/";
  const KEY = "exp-shop-site-v2";
  const KEY_V1 = "exp-shop-site-v1";
  const TYPES = Object.keys(D.types);
  const ZONES = Object.keys(D.zones);
  const VARS = ["a", "b", "c"];
  const ST = { ok: "Подходит", q: "Есть вопрос", talk: "Нужно обсудить", no: "Не подходит" };
  const ZONE_ST = ["ok", "q", "talk"];
  const ALL_ST = ["ok", "q", "talk", "no"];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const vFull = (v) => "вариант " + D.variants[v].l + " · " + D.variants[v].short;
  const smooth = () => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

  /* ================= Хранилище ================= */
  let storageOk = true;
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { storageOk = false; return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { storageOk = false; return false; } }
  (function probe() { try { localStorage.setItem("__p", "1"); localStorage.removeItem("__p"); } catch (e) { storageOk = false; } })();

  function blank() {
    return { schema: 2, prefs: {}, meta: { who: "", date: "" }, dec: { direction: null, directionNote: "", items: {} }, viewed: {}, last: null };
  }
  function migrateV1(old) {
    const s = blank();
    if (!old || typeof old !== "object") return s;
    if (old.prefs) s.prefs.comments = old.prefs.comments !== false;
    const d = old.dec || {};
    s.dec.direction = d.direction || null;
    s.dec.directionNote = d.directionNote || "";
    const it = d.items || {};
    Object.keys(it).forEach((id) => {
      if (id === "wall-q-variant") return;
      const v = it[id] || {};
      s.dec.items[id] = { st: ALL_ST.includes(v.st) ? v.st : null, note: typeof v.note === "string" ? v.note : "" };
    });
    // бывший вопрос «Вариант оформления» настенных стеллажей становится выбором варианта зоны
    const wq = it["wall-q-variant"];
    if (wq) {
      const w = (s.dec.items.wall = s.dec.items.wall || { st: null, note: "" });
      if (VARS.includes(wq.st) && !w.pick) w.pick = wq.st;
      if (wq.note && wq.note.trim()) w.note = (w.note ? w.note + "\n" : "") + "Про вариант оформления: " + wq.note.trim();
    }
    s.migratedFrom = 1;
    return s;
  }
  function load() {
    const raw = lsGet(KEY);
    if (raw) { try { const s = JSON.parse(raw); if (s && s.schema === 2) return s; } catch (e) {} }
    const r1 = lsGet(KEY_V1);
    if (r1) { try { return migrateV1(JSON.parse(r1)); } catch (e) {} }
    return blank();
  }
  const store = load();
  store.prefs = store.prefs || {};
  store.meta = store.meta || { who: "", date: "" };
  store.dec = store.dec || { items: {} };
  store.dec.items = store.dec.items || {};
  store.viewed = store.viewed || {};
  let saveT = null, lastSaved = null;
  function save(now) {
    clearTimeout(saveT);
    const run = () => { saveT = null; if (lsSet(KEY, JSON.stringify(store))) lastSaved = new Date(); renderSaveLine(); };
    if (now) run(); else saveT = setTimeout(run, 250);
  }
  // мигрированные данные сразу пишем в новый ключ, старый ключ не трогаем
  if (store.migratedFrom) save(true);
  // не теряем последнюю правку, если вкладку закрыли сразу после неё
  window.addEventListener("pagehide", () => { if (saveT) save(true); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && saveT) save(true); });

  /* ================= Состояние просмотра ================= */
  const state = {
    mode: store.prefs.mode === "detail" ? "detail" : "quick",
    comments: store.prefs.comments !== false,
    allMarks: !!store.prefs.allMarks,
    types: Object.assign({ func: true, diff: true, q: true, tip: true }, store.prefs.types || {}),
    diffOnly: false,
    global: null,
    zone: {},
    view: {}
  };
  const avail = (id, v) => !!D.zones[id].variants[v];
  ZONES.forEach((id) => {
    const z = D.zones[id];
    state.zone[id] = avail(id, "a") ? "a" : VARS.find((v) => avail(id, v));
    if (z.views) state.view[id] = z.views[0].id;
  });

  /* ================= Флаги на body ================= */
  function applyFlags() {
    const b = document.body;
    b.classList.toggle("c-on", state.comments || state.diffOnly);
    b.classList.toggle("all-marks", state.allMarks || state.diffOnly);
    b.classList.toggle("diff-only", state.diffOnly);
    TYPES.forEach((t) => b.classList.toggle("t-" + t, !!state.types[t]));
    $("#cToggle").setAttribute("aria-checked", String(state.comments));
    $("#allToggle").setAttribute("aria-checked", String(state.allMarks));
    $("#diffToggle").setAttribute("aria-checked", String(state.diffOnly));
    $$("#notesDd input").forEach((i) => (i.checked = !!state.types[i.value]));
    $("#pAll").setAttribute("aria-pressed", String(state.allMarks));
    $("#pC").setAttribute("aria-pressed", String(state.comments));
    store.prefs.comments = state.comments;
    store.prefs.allMarks = state.allMarks;
    store.prefs.types = state.types;
    save();
    $$(".clist").forEach((l) => renderList(l));
    if (!state.comments && !state.diffOnly) closePop();
  }

  function setMode(m, fromUser) {
    state.mode = m;
    document.body.classList.toggle("mode-quick", m === "quick");
    document.body.classList.toggle("mode-detail", m === "detail");
    $$(".mode-seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    store.prefs.mode = m;
    save();
    $("#pmMode").textContent = m === "detail" ? "Сейчас открыт просмотр с пояснениями, он и пойдёт в печать." :
      "Сейчас открыт краткий просмотр. Чтобы напечатать все пояснения, переключитесь на «С пояснениями».";
    if (fromUser) toast(m === "detail" ? "Просмотр с пояснениями. Выбранные варианты и отметки на месте" : "Краткий просмотр. Подробности открываются кнопкой «Подробнее о зоне»");
  }

  /* ================= Изображение с метками ================= */
  const info = (f) => D.images[f] || { w: 4, h: 3, kind: "render", alt: "" };
  function keyIdx(list) {
    // ключевые метки: первая «как это работает» и первая «условно», иначе первая по списку
    const k = new Set();
    const f = list.findIndex((h) => h.t === "func"); if (f > -1) k.add(f);
    const d = list.findIndex((h) => h.t === "diff"); if (d > -1) k.add(d);
    if (!k.size && list.length) k.add(0);
    return k;
  }
  function fillMedia(el, file, opts) {
    opts = opts || {};
    el.innerHTML = "";
    el.className = "media";
    if (!file) {
      el.classList.add("missing");
      const r = opts.ratio || 4 / 3;
      el.style.setProperty("--r", r);
      el.style.aspectRatio = String(r);
      el.dataset.file = "";
      el.innerHTML = '<div class="missing-plate"><div class="big">Этот вариант пока не нарисован</div><p>' +
        esc(opts.missingText || "Подготовим иллюстрацию, если направление будет выбрано.") + "</p></div>";
      return;
    }
    const i = info(file);
    el.dataset.file = file;
    el.dataset.kind = i.kind;
    if (i.white) el.classList.add("white");
    el.style.setProperty("--r", i.w / i.h);
    el.style.aspectRatio = i.w + " / " + i.h;
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
      t.textContent = i.kind === "photo" ? "Фото сейчас" : "Иллюстрация концепции";
      el.appendChild(t);
    }
    const marks = document.createElement("div");
    marks.className = "marks";
    const list = D.hotspots[file] || [];
    const keys = keyIdx(list);
    list.forEach((h, n) => {
      const b = document.createElement("button");
      b.className = "hs " + h.t + (keys.has(n) ? " key" : " extra");
      b.style.left = h.x + "%";
      b.style.top = h.y + "%";
      b.textContent = n + 1;
      b.dataset.n = n;
      b.setAttribute("aria-label", "Комментарий " + (n + 1) + ". " + D.types[h.t].label + ". " + h.h);
      b.addEventListener("click", (e) => { e.stopPropagation(); openPop(b, file, n); });
      marks.appendChild(b);
    });
    el.appendChild(marks);
    if (!opts.noZoom) img.addEventListener("click", () => openLb(file));
  }
  function swapMedia(el, file, opts) {
    if (el.dataset.file === (file || "")) return;
    el.classList.add("fade");
    setTimeout(() => { fillMedia(el, file, opts); requestAnimationFrame(() => el.classList.remove("fade")); }, 150);
  }

  /* ---------- Список комментариев под картинкой ---------- */
  function makeListBlock(getFile) {
    const wrap = document.createElement("div");
    wrap.className = "cl-wrap";
    wrap.innerHTML = '<button class="cl-btn" aria-expanded="false"></button><div class="clist"></div>';
    const btn = $(".cl-btn", wrap);
    const list = $(".clist", wrap);
    list._getFile = getFile;
    btn.addEventListener("click", () => {
      const open = !list.classList.contains("open");
      list.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
      renderList(list);
    });
    list.addEventListener("click", (e) => {
      const it = e.target.closest("[data-n]");
      if (!it) return;
      const host = list.closest(".zv, figure");
      const mark = host && host.querySelector('.media .hs[data-n="' + it.dataset.n + '"]');
      if (mark) {
        $$(".hs.flash").forEach((m) => m.classList.remove("flash"));
        mark.classList.add("flash");
        setTimeout(() => mark.classList.remove("flash"), 1600);
      }
    });
    renderList(list);
    return wrap;
  }
  function renderList(list) {
    const file = list._getFile();
    const btn = list.parentElement.querySelector(".cl-btn");
    const all = (file && D.hotspots[file]) || [];
    btn.hidden = !all.length;
    const vis = all.map((h, n) => ({ h, n })).filter((o) => (state.diffOnly ? o.h.t === "diff" : state.types[o.h.t]));
    const hidden = all.length - vis.length;
    btn.textContent = (list.classList.contains("open") ? "Скрыть комментарии к этой картинке" : "Все комментарии к этой картинке") + " (" + all.length + ")";
    list.innerHTML = vis.map((o) =>
      '<div class="ci" data-n="' + o.n + '"><span class="num ' + o.h.t + '">' + (o.n + 1) + '</span><div><span class="ct">' + esc(D.types[o.h.t].label) +
      "</span><b>" + esc(o.h.h) + "</b><p>" + esc(o.h.p) + "</p></div></div>").join("") +
      (hidden ? '<p class="cl-hidden">Ещё ' + hidden + " скрыто фильтром. Его можно поменять в меню «Пояснения на картинках».</p>" : "");
  }

  /* ---------- Статичные картинки в тексте ---------- */
  function initStatic() {
    $$(".m[data-img]").forEach((ph) => {
      const file = ph.dataset.img;
      const fig = document.createElement("figure");
      fig.className = ph.className.replace(/\bm\b/, "fig").trim();
      const media = document.createElement("div");
      fillMedia(media, file);
      fig.appendChild(media);
      if (ph.dataset.cap) { const c = document.createElement("figcaption"); c.innerHTML = ph.dataset.cap; fig.appendChild(c); }
      if ((D.hotspots[file] || []).length) fig.appendChild(makeListBlock(() => file));
      ph.replaceWith(fig);
    });
  }

  /* ================= Зоны ================= */
  function zoneImg(id, v, view) {
    const z = D.zones[id];
    const vv = z.variants[v];
    if (!vv) return null;
    return z.views ? vv[view || state.view[id]] || null : vv.img;
  }
  function zoneRatio(id) {
    const i = info(zoneImg(id, VARS.find((v) => avail(id, v))));
    return i.w / i.h;
  }
  function varBtns(id, cls, showNa) {
    return VARS.map((v) => {
      const V = D.variants[v];
      const absent = !avail(id, v);
      return '<button class="vbtn' + (absent ? " absent" : "") + (cls ? " " + cls : "") + '" data-v="' + v + '" aria-pressed="false" title="' +
        esc(V.name + (absent ? ". Пока не нарисован" : "")) + '"><span class="l">' + V.l + '</span><span class="nm">' + V.short + "</span>" +
        (absent && showNa ? '<span class="na">не нарисован</span>' : "") + "</button>";
    }).join("");
  }

  function initZones() {
    $$("[data-zone]").forEach((host) => {
      const id = host.dataset.zone;
      const z = D.zones[id];
      host.classList.add("zv");
      host.innerHTML =
        '<div class="zv-bar"><div class="left" role="group" aria-label="Вариант для просмотра">' + varBtns(id) + "</div>" +
        (z.views ? '<div class="tabs" role="group" aria-label="Ракурс">' + z.views.map((w) => '<button data-view="' + w.id + '" aria-pressed="false">' + w.label + "</button>").join("") + "</div>" : "") +
        "</div>" +
        '<div class="zv-stage"><div class="media"></div></div>' +
        '<div class="zv-cap"></div>' +
        '<div class="zv-tools"><button class="tool" data-act="compare" aria-expanded="false">Сравнить рядом</button><button class="tool" data-act="link">Скопировать ссылку на этот вариант</button></div>';
      // сравнение рядом показываем на всю ширину раздела, сразу под основной картинкой
      const cmpEl = document.createElement("div");
      cmpEl.className = "cmp";
      cmpEl.hidden = true;
      cmpEl.dataset.cmp = id;
      const split = host.closest(".split");
      (split || host).after(cmpEl);
      host._cmp = cmpEl;
      fillMedia($(".zv-stage .media", host), zoneImg(id, state.zone[id]), { missingText: z.missingText, ratio: zoneRatio(id) });
      host.insertBefore(makeListBlock(() => zoneImg(id, state.zone[id])), $(".zv-tools", host));
      if (id === ZONES[0]) {
        const a = document.createElement("p");
        a.className = "aside sm";
        a.textContent = "Цифры на картинке можно нажимать. Здесь это приветствуется.";
        host.insertBefore(a, $(".zv-stage", host));
      }
      host.addEventListener("click", (e) => {
        const vb = e.target.closest(".zv-bar .vbtn");
        const tb = e.target.closest(".zv-bar [data-view]");
        const act = e.target.closest(".zv-tools [data-act]");
        if (vb) { state.zone[id] = vb.dataset.v; state.global = null; updateGlobalUi(); updateZone(id); }
        if (tb) { state.view[id] = tb.dataset.view; updateZone(id); }
        if (act && act.dataset.act === "compare") toggleCompare(id);
        if (act && act.dataset.act === "link") copyLink(id);
      });
      updateZone(id, true);
    });
  }

  function updateZone(id, first) {
    const host = $('[data-zone="' + id + '"]');
    if (!host) return;
    const z = D.zones[id];
    const v = state.zone[id];
    $$(".zv-bar .vbtn", host).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
    $$(".zv-bar [data-view]", host).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.view === state.view[id])));
    const file = zoneImg(id, v);
    const media = $(".zv-stage .media", host);
    const opts = { missingText: z.missingText, ratio: zoneRatio(id) };
    if (first) fillMedia(media, file, opts); else { closePop(); swapMedia(media, file, opts); }
    const vv = z.variants[v];
    let cap = '<span class="now">Сейчас смотрим ' + esc(vFull(v)) + ".</span> <span>" + esc(vv ? vv.cap || "" : "Иллюстрации пока нет.") + "</span>";
    const vn = z.viewNotes && z.views && z.viewNotes[state.view[id]];
    if (vn) cap += ' <span class="muted">' + esc(vn) + "</span>";
    $(".zv-cap", host).innerHTML = cap;
    const list = $(".clist", host);
    if (list) setTimeout(() => renderList(list), first ? 0 : 180);
    const cmp = host._cmp;
    if (cmp && !cmp.hidden) renderCompare(id);
    updateBA(); updateMosaic(); updateCompareHighlight(); renderFb(id);
  }

  /* ---------- Сравнить рядом ---------- */
  const cmpSel = {};
  function toggleCompare(id) {
    const host = $('[data-zone="' + id + '"]');
    const cmp = host._cmp;
    const btn = $('[data-act="compare"]', host);
    const open = cmp.hidden;
    cmp.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "Закрыть сравнение" : "Сравнить рядом";
    if (open) {
      const cur = state.zone[id];
      const other = VARS.find((v) => v !== cur && avail(id, v)) || VARS.find((v) => v !== cur);
      if (!cmpSel[id]) cmpSel[id] = [cur, other];
      renderCompare(id);
      cmp.scrollIntoView({ block: "nearest", behavior: smooth() });
    }
  }
  function renderCompare(id) {
    const host = $('[data-zone="' + id + '"]');
    const cmp = host._cmp;
    const z = D.zones[id];
    const sel = cmpSel[id];
    const view = z.views ? z.views.find((w) => w.id === state.view[id]) : null;
    cmp.innerHTML =
      '<div class="cmp-head"><b>' + esc(D.zones[id].short) + '. Два варианта рядом</b>' + (view ? '<span class="muted">Ракурс «' + esc(view.label) + "» для обоих.</span>" : "") +
      (z.viewNotes && view && z.viewNotes[view.id] ? '<span class="muted">' + esc(z.viewNotes[view.id]) + "</span>" : "") + "</div>" +
      '<div class="cmp-grid">' + [0, 1].map((side) =>
        '<div class="cmp-card" data-side="' + side + '"><div class="cmp-pick" role="group" aria-label="' + (side ? "Справа" : "Слева") + '">' + varBtns(id, "sm", true) +
        '</div><div class="cmp-media"></div><p class="cmp-cap"></p></div>').join("") + "</div>";
    [0, 1].forEach((side) => {
      const card = $('.cmp-card[data-side="' + side + '"]', cmp);
      const v = sel[side];
      $$(".vbtn", card).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === v)));
      const m = document.createElement("div");
      fillMedia(m, zoneImg(id, v), { missingText: z.missingText, ratio: zoneRatio(id) });
      $(".cmp-media", card).appendChild(m);
      const vv = z.variants[v];
      $(".cmp-cap", card).innerHTML = "<b>Вариант " + D.variants[v].l + " · " + D.variants[v].short + ".</b> " + esc(vv ? vv.cap : "Иллюстрации пока нет.");
      card.addEventListener("click", (e) => {
        const b = e.target.closest(".cmp-pick .vbtn");
        if (!b) return;
        sel[side] = b.dataset.v;
        renderCompare(id);
      });
    });
  }

  /* ---------- Весь магазин в одном варианте (только просмотр) ---------- */
  function setGlobal(v) {
    state.global = v;
    ZONES.forEach((id) => { state.zone[id] = v; updateZone(id); });
    updateGlobalUi();
    const miss = ZONES.filter((id) => !avail(id, v)).map((id) => D.zones[id].short);
    toast("Весь магазин в варианте " + D.variants[v].l + ". Посмотреть все варианты ещё не значит согласовать все варианты" + (miss.length ? ". Не нарисовано: " + miss.join(", ") : ""));
  }
  function updateGlobalUi() { $$("[data-g]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.g === state.global))); }
  function updateCompareHighlight() {
    const t = $("table.cmp");
    if (t) $$("[data-col]", t).forEach((c) => c.classList.toggle("on", !!state.global && c.dataset.col === state.global));
  }

  /* ---------- Мозаика на обложке ---------- */
  function initMosaic() {
    const m = $(".mosaic");
    m.innerHTML = D.mosaic.map((id) => '<button class="tile" data-go="' + id + '"><img alt=""><span class="cap">' + esc(D.zones[id].short) + "</span></button>").join("");
    m.addEventListener("click", (e) => { const t = e.target.closest(".tile"); if (t) goSection(D.zones[t.dataset.go].section); });
    updateMosaic();
  }
  function updateMosaic() {
    $$(".mosaic .tile").forEach((t) => {
      const id = t.dataset.go, z = D.zones[id], v = state.zone[id];
      const vv = z.variants[v];
      const file = vv ? (z.views ? vv[z.mosaicView || z.views[0].id] : vv.img) : null;
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
        '<div class="ba" style="aspect-ratio:' + cfg.ratio + ";max-width:" + (cfg.maxw || "none") + '">' +
        '<img class="before" alt="' + esc(cfg.beforeAlt) + '" src="' + IMG + cfg.before + '" loading="lazy">' +
        '<img class="after" alt="Иллюстрация концепции" loading="lazy">' +
        '<span class="lab l">Фото сейчас</span><span class="lab r">Иллюстрация</span><span class="handle"></span>' +
        '<input type="range" min="0" max="100" value="50" aria-label="Сдвиньте, чтобы сравнить фото и иллюстрацию"></div>' +
        '<div class="ba-print"><figure><img alt="" src="' + IMG + cfg.before + '"><figcaption>Фото сейчас</figcaption></figure>' +
        '<figure><img class="after-p" alt=""><figcaption>Иллюстрация концепции</figcaption></figure></div>' +
        '<p class="cap-line ba-note"></p>';
      const ba = $(".ba", host), r = $("input", host);
      const set = () => ba.style.setProperty("--p", r.value + "%");
      r.addEventListener("input", set); set();
    });
    updateBA();
  }
  function updateBA() {
    $$("[data-ba]").forEach((host) => {
      if (!$(".ba", host)) return;
      const cfg = D.ba[host.dataset.ba];
      const v = state.zone[cfg.zone];
      let file = zoneImg(cfg.zone, v, cfg.view);
      let lead = "Сравнение фотографии с иллюстрацией концепции, " + vFull(v) + ". ";
      if (!file) { lead = "Вариант " + D.variants[v].l + " для этой зоны пока не нарисован, справа вариант А. "; file = zoneImg(cfg.zone, "a", cfg.view); }
      const a = $(".after", host);
      if (a && !a.src.endsWith(file)) a.src = IMG + file;
      if (a) a.style.objectPosition = cfg.afterPos || "50% 50%";
      const b = $(".before", host); if (b) b.style.objectPosition = cfg.beforePos || "50% 50%";
      const ap = $(".after-p", host); if (ap) ap.src = IMG + file;
      $(".ba-note", host).textContent = lead + cfg.note;
    });
  }

  /* ================= Отметки: одна модель для зон и листа решений ================= */
  const item = (id) => (store.dec.items[id] = store.dec.items[id] || { st: null, note: "" });
  const peek = (id) => store.dec.items[id] || {};
  function hasMarks() {
    return !!(store.dec.direction || (store.dec.directionNote || "").trim() || (store.meta.who || "").trim() ||
      Object.values(store.dec.items).some((v) => v && (v.st || v.pick || (v.note || "").trim())));
  }
  function setPick(id, v) {
    const it = item(id);
    it.pick = it.pick === v ? null : v;
    save(); syncAll();
    if (it.pick) toast("Для обсуждения выбран " + vFull(it.pick) + ". Это отметка, а не согласование");
  }
  function bindPick(id, what) {
    const it = item(id);
    if (D.zones[id] && !it.pick) {
      it.pick = state.zone[id];
      toast(what + " относится к варианту " + D.variants[it.pick].l + ", который сейчас на экране");
    }
  }
  function setSt(id, st, fromZone) {
    const it = item(id);
    it.st = it.st === st ? null : st;
    if (it.st && fromZone) bindPick(id, "Отметка");
    save(); syncAll();
  }
  function setNote(id, val, fromZone) {
    const it = item(id);
    it.note = val;
    if (val.trim() && fromZone) bindPick(id, "Комментарий");
    save(); syncAll();
  }

  /* ---------- Блок под зоной ---------- */
  function initFb() {
    $$("section.zone-sec").forEach((sec) => {
      const id = sec.dataset.zoneSec;
      const fb = document.createElement("div");
      fb.className = "fb";
      fb.dataset.fb = id;
      fb.innerHTML =
        '<div class="fb-head"><h3>Как вам этот вариант?</h3><span class="fb-target"></span></div>' +
        '<div class="fb-row"><span class="fb-lbl">Вариант для обсуждения</span><div class="fb-pick" role="group" aria-label="Вариант для обсуждения">' + varBtns(id, "sm", true) + "</div></div>" +
        '<div class="fb-row"><span class="fb-lbl">Оценка</span><div class="st fb-st" role="group" aria-label="Оценка">' +
        ZONE_ST.map((s) => '<button data-v="' + s + '" aria-pressed="false">' + ST[s] + "</button>").join("") + "</div></div>" +
        '<p class="fb-no" hidden>В листе решений отмечено «Не подходит». Любая оценка здесь заменит эту отметку.</p>' +
        '<textarea class="fb-note" rows="2" placeholder="Что именно стоит учесть?" aria-label="Что именно стоит учесть: ' + esc(D.zones[id].short) + '"></textarea>' +
        '<p class="fb-warn" hidden></p>' +
        (id === ZONES[0] ? '<p class="aside sm">«Мне не нравится» принимается. «Мне не нравится, потому что…» помогает двигаться дальше.</p>' : "");
      const anchor = $(".ba-block", sec);
      if (anchor) sec.insertBefore(fb, anchor); else sec.appendChild(fb);
      fb.addEventListener("click", (e) => {
        const p = e.target.closest(".fb-pick .vbtn");
        const s = e.target.closest(".fb-st button");
        const sh = e.target.closest("[data-show]");
        if (p) setPick(id, p.dataset.v);
        if (s) setSt(id, s.dataset.v, true);
        if (sh) { state.zone[id] = sh.dataset.show; state.global = null; updateGlobalUi(); updateZone(id); }
      });
      $(".fb-note", fb).addEventListener("input", (e) => setNote(id, e.target.value, true));
      renderFb(id);
    });
  }
  function renderFb(id) {
    const fb = $('.fb[data-fb="' + id + '"]');
    if (!fb) return;
    const it = peek(id);
    const v = state.zone[id];
    const tg = $(".fb-target", fb);
    tg.textContent = it.pick ? "Для обсуждения выбран " + vFull(it.pick) : "Вариант для обсуждения пока не выбран";
    tg.classList.toggle("set", !!it.pick);
    $$(".fb-pick .vbtn", fb).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === it.pick)));
    $$(".fb-st button", fb).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === it.st)));
    $(".fb-no", fb).hidden = it.st !== "no";
    const ta = $(".fb-note", fb);
    if (document.activeElement !== ta) ta.value = it.note || "";
    const warn = $(".fb-warn", fb);
    if (it.pick && it.pick !== v && (it.st || (it.note || "").trim())) {
      warn.hidden = false;
      warn.innerHTML = "Отметка и комментарий относятся к варианту " + D.variants[it.pick].l + ", а на экране вариант " + D.variants[v].l +
        '. <button class="link-btn" data-show="' + it.pick + '">Показать вариант ' + D.variants[it.pick].l + "</button>";
    } else warn.hidden = true;
  }

  /* ---------- Лист решений ---------- */
  function initDecisions() {
    const dir = $(".dec-dir");
    dir.innerHTML = D.decisions.directions.map((d) =>
      '<button data-dir="' + d.id + '" aria-pressed="false"><span class="l">' + esc(d.l) + '</span><span class="t">' + esc(d.t) + "</span></button>").join("");
    dir.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dir]");
      if (!b) return;
      store.dec.direction = store.dec.direction === b.dataset.dir ? null : b.dataset.dir;
      save(); syncAll();
    });
    const dn = $("#decDirNote");
    dn.addEventListener("input", () => { store.dec.directionNote = dn.value; save(); renderSummary(); });
    const who = $("#decWho"), date = $("#decDate");
    who.addEventListener("input", () => { store.meta.who = who.value; save(); });
    date.addEventListener("input", () => { store.meta.date = date.value; save(); });

    const list = $(".dec-list");
    let lastGroup = null;
    list.innerHTML = D.decisions.items.map((it) => {
      let head = "";
      if (it.group && it.group !== lastGroup) head = '<h4 class="dec-group">' + esc(it.group) + "</h4>";
      lastGroup = it.group || null;
      return head + '<div class="dec-row' + (it.zone ? " zrow" : "") + '" data-id="' + it.id + '">' +
        '<div class="name">' + (it.zone ? '<a href="#' + it.id + '">' + esc(it.name) + "</a>" : esc(it.name)) + "<small>" + esc(it.sub) + "</small></div>" +
        '<div class="ctrls">' +
        (it.zone ? '<div class="dpick" role="group" aria-label="Вариант для обсуждения: ' + esc(it.name) + '"><span class="mini">Вариант</span>' + varBtns(it.id, "xs") + "</div>" : "") +
        '<div class="st" role="group" aria-label="Оценка: ' + esc(it.name) + '">' + ALL_ST.map((s) => '<button data-v="' + s + '" aria-pressed="false">' + ST[s] + "</button>").join("") + "</div></div>" +
        '<textarea rows="1" placeholder="' + (it.zone ? "Что именно стоит учесть?" : "Заметка") + '" aria-label="Заметка: ' + esc(it.name) + '"></textarea></div>';
    }).join("");
    $$(".dec-row", list).forEach((row) => {
      const id = row.dataset.id;
      row.addEventListener("click", (e) => {
        const p = e.target.closest(".dpick .vbtn");
        const s = e.target.closest(".st button");
        if (p) setPick(id, p.dataset.v);
        if (s) setSt(id, s.dataset.v, false);
      });
      $("textarea", row).addEventListener("input", (e) => setNote(id, e.target.value, false));
    });

    $("#decCopy").onclick = () => copyText(summaryText(), "Итоги скопированы. Пригодятся, когда прозвучит «а на чём мы остановились?»");
    $("#decSave").onclick = () => download("Итоги обсуждения. Редизайн магазина. Версия " + D.doc.version + ".txt", summaryText(), "text/plain;charset=utf-8");
    $("#decExport").onclick = exportJson;
    $("#decImport").onclick = () => $("#decFile").click();
    $("#decFile").addEventListener("change", onImportFile);
    let armed = null;
    $("#decReset").onclick = () => {
      const b = $("#decReset");
      if (!armed) { b.textContent = "Точно очистить? Нажмите ещё раз"; armed = setTimeout(() => { b.textContent = "Очистить"; armed = null; }, 4000); return; }
      clearTimeout(armed); armed = null; b.textContent = "Очистить";
      replaceData(blank());
      toast("Отметки очищены");
    };
    syncAll();
  }

  function syncAll() {
    ZONES.forEach(renderFb);
    $$(".dec-dir button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.dir === store.dec.direction)));
    const dn = $("#decDirNote"); if (document.activeElement !== dn) dn.value = store.dec.directionNote || "";
    const who = $("#decWho"); if (document.activeElement !== who) who.value = store.meta.who || "";
    const date = $("#decDate"); if (document.activeElement !== date) date.value = store.meta.date || "";
    $$(".dec-row").forEach((row) => {
      const it = peek(row.dataset.id);
      $$(".st button", row).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === it.st)));
      $$(".dpick .vbtn", row).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.v === it.pick)));
      const ta = $("textarea", row);
      if (document.activeElement !== ta) ta.value = it.note || "";
    });
    renderSummary();
  }

  function collect() {
    const res = { picks: [], ok: [], q: [], talk: [], no: [], none: [], unseen: [] };
    D.decisions.items.forEach((it) => {
      const v = peek(it.id);
      const row = { name: (it.group ? "Настенные стеллажи. " : "") + it.name, note: (v.note || "").trim(), pick: v.pick, zone: !!it.zone };
      if (it.zone && v.pick) res.picks.push(row);
      if (v.st && res[v.st]) res[v.st].push(row); else res.none.push(row);
      if (it.zone && !store.viewed[it.id]) res.unseen.push(row);
    });
    return res;
  }
  function renderSummary() {
    const el = $("#decSum");
    if (!el) return;
    const c = collect();
    const dir = D.decisions.directions.find((x) => x.id === store.dec.direction);
    const li = (r) => "<li>" + esc(r.name) + (r.pick ? ", вариант " + D.variants[r.pick].l : "") + (r.note ? '<span class="sn">' + esc(r.note) + "</span>" : "") + "</li>";
    const block = (title, arr, cls) => '<div class="sb ' + cls + '"><h4>' + title + " <span>" + arr.length + "</span></h4>" +
      (arr.length ? "<ul>" + arr.map(li).join("") + "</ul>" : '<p class="muted">Пока ничего</p>') + "</div>";
    el.innerHTML =
      '<div class="sum-head"><h3>Резюме перед отправкой</h3><p class="muted">Это предварительные отметки для обсуждения, а не согласование.</p></div>' +
      '<p class="aside sm">Если всё подходит, это тоже стоит отметить. Молчание пока не считаем согласованием.</p>' +
      '<div class="sum-grid">' +
      '<div class="sb picks"><h4>Выбранные варианты</h4><ul><li>Общее направление: ' + (dir ? esc(dir.l + ", " + dir.t) : "не выбрано") + "</li>" +
      c.picks.map((r) => "<li>" + esc(r.name) + ": " + esc(vFull(r.pick)) + "</li>").join("") + "</ul></div>" +
      block("Подходит", c.ok, "ok") + block("Есть вопрос", c.q, "q") + block("Нужно обсудить", c.talk, "talk") +
      (c.no.length ? block("Не подходит", c.no, "no") : "") +
      '<div class="sb none"><h4>Не отмечено <span>' + c.none.length + "</span></h4>" +
      (c.none.length ? "<p>" + c.none.map((r) => esc(r.name)).join(", ") + "</p>" : '<p class="muted">Всё отмечено</p>') +
      (c.unseen.length ? '<p class="unseen">Ещё не просмотрены на этом устройстве: ' + c.unseen.map((r) => esc(r.name)).join(", ") + "</p>" : "") +
      "</div>" +
      "</div>";
  }
  function summaryText() {
    const c = collect();
    const dir = D.decisions.directions.find((x) => x.id === store.dec.direction);
    const date = store.meta.date ? store.meta.date.split("-").reverse().join(".") : "не указана";
    const L = [];
    L.push("Редизайн магазина научных сувениров. Итоги обсуждения");
    L.push("Документ: версия " + D.doc.version + " от " + D.doc.date);
    L.push("Кто посмотрел: " + ((store.meta.who || "").trim() || "не указано"));
    L.push("Дата обсуждения: " + date);
    L.push("Это предварительные отметки по концепции, а не согласование рабочих чертежей.");
    L.push("");
    L.push("ВЫБРАННЫЕ ВАРИАНТЫ");
    L.push("Общее направление: " + (dir ? dir.l + ", " + dir.t : "не выбрано"));
    if ((store.dec.directionNote || "").trim()) L.push("  Заметка: " + store.dec.directionNote.trim());
    D.decisions.items.filter((i) => i.zone).forEach((it) => { const v = peek(it.id); L.push(it.name + ": " + (v.pick ? vFull(v.pick) : "вариант не выбран")); });
    const sect = (title, arr) => {
      L.push(""); L.push(title + " (" + arr.length + ")");
      if (!arr.length) L.push("нет");
      arr.forEach((r) => { L.push("- " + r.name + (r.pick ? ", вариант " + D.variants[r.pick].l : "")); if (r.note) L.push("  " + r.note.replace(/\n/g, "\n  ")); });
    };
    sect("ПОДХОДИТ", c.ok); sect("ЕСТЬ ВОПРОС", c.q); sect("НУЖНО ОБСУДИТЬ", c.talk);
    if (c.no.length) sect("НЕ ПОДХОДИТ", c.no);
    L.push(""); L.push("НЕ ОТМЕЧЕНО (" + c.none.length + ")");
    L.push(c.none.length ? c.none.map((r) => r.name).join(", ") : "нет");
    c.none.filter((r) => r.note).forEach((r) => L.push("- " + r.name + ", заметка: " + r.note.replace(/\n/g, " ")));
    if (c.unseen.length) { L.push(""); L.push("Не просмотрены на этом устройстве: " + c.unseen.map((r) => r.name).join(", ")); }
    L.push(""); L.push("Документ: " + location.origin + location.pathname);
    return L.join("\n");
  }

  /* ---------- Экспорт и импорт ---------- */
  function exportJson() {
    const payload = {
      app: "experimentanium-shop", kind: "decisions", schema: 2,
      docVersion: D.doc.version, exportedAt: new Date().toISOString(),
      data: { meta: store.meta, dec: store.dec, viewed: store.viewed }
    };
    const who = (store.meta.who || "").trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 40);
    download("Отметки. Редизайн магазина" + (who ? ". " + who : "") + ".json", JSON.stringify(payload, null, 2), "application/json");
  }
  function validImport(o) {
    if (!o || typeof o !== "object") return "Файл пустой или повреждён.";
    if (o.app !== "experimentanium-shop" || o.kind !== "decisions") return "Это не файл отметок этого документа. Нужен файл, сохранённый кнопкой «Сохранить файл отметок».";
    if (o.schema !== 2) return "Файл сохранён в неизвестном формате.";
    if (!o.data || !o.data.dec || !o.data.dec.items || typeof o.data.dec.items !== "object") return "В файле нет отметок.";
    return null;
  }
  function sanitize(o) {
    const s = blank();
    const d = o.data;
    const str = (x, n) => (typeof x === "string" ? x.slice(0, n || 5000) : "");
    s.meta.who = str(d.meta && d.meta.who, 120);
    s.meta.date = /^\d{4}-\d{2}-\d{2}$/.test((d.meta && d.meta.date) || "") ? d.meta.date : "";
    const dirs = D.decisions.directions.map((x) => x.id);
    s.dec.direction = dirs.includes(d.dec.direction) ? d.dec.direction : null;
    s.dec.directionNote = str(d.dec.directionNote);
    const ids = D.decisions.items.map((x) => x.id);
    Object.keys(d.dec.items).forEach((id) => {
      if (!ids.includes(id)) return;
      const v = d.dec.items[id] || {};
      s.dec.items[id] = { st: ALL_ST.includes(v.st) ? v.st : null, note: str(v.note) };
      if (D.zones[id] && VARS.includes(v.pick)) s.dec.items[id].pick = v.pick;
    });
    if (d.viewed && typeof d.viewed === "object") ZONES.forEach((zn) => { if (d.viewed[zn]) s.viewed[zn] = 1; });
    s.prefs = store.prefs;
    s.last = store.last;
    return s;
  }
  function onImportFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 2e6) return showImp('<p class="err">Файл слишком большой для файла отметок.</p>', true);
    const r = new FileReader();
    r.onload = () => {
      let o;
      try { o = JSON.parse(r.result); } catch (err) { return showImp('<p class="err">Не получилось прочитать файл. Нужен файл .json, сохранённый кнопкой «Сохранить файл отметок».</p>', true); }
      const bad = validImport(o);
      if (bad) return showImp('<p class="err">' + bad + "</p>", true);
      const next = sanitize(o);
      const n = Object.values(next.dec.items).filter((v) => v.st || v.pick || v.note).length;
      const from = (next.meta.who ? " от «" + esc(next.meta.who) + "»" : "") +
        (o.exportedAt && !isNaN(Date.parse(o.exportedAt)) ? ", сохранены " + new Date(o.exportedAt).toLocaleString("ru-RU") : "") +
        (o.docVersion && o.docVersion !== D.doc.version ? ". Файл от версии документа " + esc(o.docVersion) + ", сейчас " + D.doc.version : "");
      if (!hasMarks()) { replaceData(next); return showImp("<p>Загружено отметок: " + n + from + ".</p>", false); }
      showImp(
        "<p><b>Загрузка заменит текущие отметки на этом устройстве.</b> В файле отметок: " + n + from + ".</p>" +
        '<div class="imp-actions"><button class="btn ghost" data-imp="save">Сначала сохранить текущие</button><button class="btn" data-imp="go">Заменить</button><button class="btn link" data-imp="cancel">Отмена</button></div>',
        false, true);
      $("#impPanel").onclick = (ev) => {
        const b = ev.target.closest("[data-imp]");
        if (!b) return;
        if (b.dataset.imp === "save") { exportJson(); b.textContent = "Текущие сохранены в файл"; b.disabled = true; }
        if (b.dataset.imp === "go") { replaceData(next); showImp("<p>Отметки заменены. Загружено: " + n + ".</p>", false); }
        if (b.dataset.imp === "cancel") $("#impPanel").hidden = true;
      };
    };
    r.onerror = () => showImp('<p class="err">Не получилось открыть файл.</p>', true);
    r.readAsText(f);
  }
  function showImp(html, isErr, noClose) {
    const p = $("#impPanel");
    p.hidden = false;
    p.className = "imp-panel" + (isErr ? " is-err" : "");
    p.innerHTML = html + (noClose ? "" : '<button class="btn link" data-imp="cancel">Закрыть</button>');
    p.onclick = (ev) => { if (ev.target.closest('[data-imp="cancel"]')) p.hidden = true; };
    p.scrollIntoView({ block: "nearest", behavior: smooth() });
  }
  function replaceData(next) {
    store.meta = next.meta; store.dec = next.dec; store.viewed = next.viewed || {};
    save(true); syncAll();
  }
  function renderSaveLine() {
    const el = $("#saveLine");
    if (!el) return;
    if (!storageOk) {
      el.className = "save-line warn";
      el.textContent = "Браузер не даёт сохранять данные на этом устройстве. Отметки пропадут при закрытии страницы, поэтому скопируйте или скачайте итоги до этого.";
      return;
    }
    el.className = "save-line";
    el.textContent = "Сохранено на этом устройстве" + (lastSaved ? " в " + lastSaved.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "") +
      ". Чтобы передать коллегам, скопируйте или скачайте итоги.";
  }
  function download(name, text, type) {
    try {
      const blob = new Blob([text], { type });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      toast("Файл скачан: " + name);
    } catch (e) { toast("Не получилось скачать файл. Скопируйте итоги"); }
  }
  function copyText(t, okMsg) {
    const done = () => toast(okMsg);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done));
    else fallbackCopy(t, done);
  }
  function fallbackCopy(t, done) {
    const ta = document.createElement("textarea");
    ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) {}
    ta.remove();
    if (ok) done(); else toast("Не получилось скопировать. Нажмите «Скачать итоги»");
  }

  /* ================= Ссылка на вариант и продолжение ================= */
  function copyLink(id) {
    const z = D.zones[id];
    const h = "z-" + id + "-" + state.zone[id] + (z.views ? "-" + state.view[id] : "");
    copyText(location.origin + location.pathname + "#" + h, "Ссылка на " + vFull(state.zone[id]) + " скопирована. Заметки и имя в неё не попадают");
  }
  function parseHash() {
    let h = "";
    try { h = decodeURIComponent((location.hash || "").slice(1)); } catch (e) { return null; }
    const m = /^z-([a-z]+)-([abc])(?:-([a-z]+))?$/.exec(h);
    if (m && D.zones[m[1]]) return { zone: m[1], v: m[2], view: m[3] };
    if (h && document.getElementById(h)) return { section: h };
    return null;
  }
  function applyHash(first) {
    const p = parseHash();
    if (!p) return false;
    if (p.zone) {
      const z = D.zones[p.zone];
      state.zone[p.zone] = p.v;
      if (z.views && p.view && z.views.some((w) => w.id === p.view)) state.view[p.zone] = p.view;
      updateZone(p.zone);
      setTimeout(() => goSection(z.section, "instant"), first ? 80 : 0);
    }
    return true;
  }
  let lastT = 0;
  function rememberPlace(secId) {
    const now = Date.now();
    if (now - lastT < 800) return;
    lastT = now;
    store.last = { sec: secId, mode: state.mode, at: now };
    save();
  }
  function offerResume(L) {
    if (!L || !L.sec || L.sec === "cover" || !document.getElementById(L.sec)) return;
    const sec = document.getElementById(L.sec);
    const box = $("#resume");
    box.hidden = false;
    box.innerHTML = "<span>В прошлый раз вы остановились на разделе «" + esc(sec.dataset.nav || "") + "».</span>" +
      '<button class="btn" id="resGo">Продолжить</button><button class="btn link" id="resNo">Скрыть</button>';
    const hide = () => { box.hidden = true; window.removeEventListener("scroll", onSc); };
    const onSc = () => { if (window.scrollY > window.innerHeight * 0.9) hide(); };
    window.addEventListener("scroll", onSc, { passive: true });
    $("#resGo").onclick = () => { hide(); if (L.mode && L.mode !== state.mode) setMode(L.mode); goSection(L.sec); };
    $("#resNo").onclick = hide;
  }

  /* ================= Сворачивание в кратком просмотре ================= */
  function initFolding() {
    $$("section.detail-sec").forEach((sec) => {
      const head = $(".sec-head", sec);
      const body = document.createElement("div");
      body.className = "sec-body";
      while (head.nextSibling) body.appendChild(head.nextSibling);
      sec.appendChild(body);
      const b = document.createElement("button");
      b.className = "sec-open";
      b.setAttribute("aria-expanded", "false");
      b.textContent = "Показать раздел";
      head.after(b);
      b.addEventListener("click", () => {
        const open = !sec.classList.contains("open");
        sec.classList.toggle("open", open);
        b.setAttribute("aria-expanded", String(open));
        b.textContent = open ? "Свернуть раздел" : "Показать раздел";
      });
    });
    $$("section.zone-sec").forEach((sec) => {
      const zt = $(".zone-text", sec);
      if (zt) {
        const keep = $$(":scope > .note.diff", zt);
        const more = document.createElement("div");
        more.className = "more-in";
        Array.from(zt.children).forEach((c) => { if (!keep.includes(c)) more.appendChild(c); });
        zt.prepend(more);
      }
      const split = $(".split", sec);
      let n = split ? split.nextElementSibling : null;
      while (n) { const nx = n.nextElementSibling; if (!n.classList.contains("ba-block")) n.classList.add("more-out"); n = nx; }
      const b = document.createElement("button");
      b.className = "more-btn";
      b.setAttribute("aria-expanded", "false");
      b.textContent = "Подробнее о зоне";
      (zt || sec).prepend(b);
      b.addEventListener("click", () => {
        const open = !sec.classList.contains("open");
        sec.classList.toggle("open", open);
        b.setAttribute("aria-expanded", String(open));
        b.textContent = open ? "Свернуть подробности" : "Подробнее о зоне";
      });
    });
  }

  /* ================= Всплывающий комментарий ================= */
  const pop = $("#pop");
  let popCtx = null;
  function openPop(btn, file, n) {
    const host = btn.closest(".marks");
    const list = D.hotspots[file] || [];
    const visible = list.map((h, i) => i).filter((i) => host.children[i] && getComputedStyle(host.children[i]).display !== "none");
    if (!visible.length) return;
    if (!visible.includes(n)) n = visible[0];
    const h = list[n];
    $$(".hs.active").forEach((b) => b.classList.remove("active"));
    const target = host.children[n];
    target.classList.add("active");
    popCtx = { file, n, visible, host, anchor: target };
    pop.innerHTML =
      '<button class="x" aria-label="Закрыть">×</button>' +
      '<div class="type"><span class="num ' + h.t + '">' + (n + 1) + "</span>" + esc(D.types[h.t].label) + "</div>" +
      "<h4>" + esc(h.h) + "</h4><p>" + esc(h.p) + "</p>" +
      (visible.length > 1 ? '<div class="nav"><button data-d="-1" aria-label="Предыдущий комментарий">‹</button><span>' + (visible.indexOf(n) + 1) + " из " + visible.length +
        ' показанных</span><button data-d="1" aria-label="Следующий комментарий">›</button></div>' : "");
    pop.classList.add("open");
    placePop(target);
    $(".x", pop).focus({ preventScroll: true });
  }
  function placePop(anchor) {
    if (window.innerWidth <= 720) { pop.style.left = ""; pop.style.top = ""; return; }
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth, h = pop.offsetHeight, m = 12;
    let x = r.right + m, y = r.top - 10;
    if (x + w > innerWidth - m) x = r.left - w - m;
    if (x < m) { x = Math.max(m, Math.min(innerWidth - w - m, r.left + r.width / 2 - w / 2)); y = r.bottom + m; }
    if (y + h > innerHeight - m) y = Math.max(m, r.top - h - m);
    if (y < m) y = m;
    pop.style.left = x + "px";
    pop.style.top = y + "px";
  }
  function closePop() {
    const had = popCtx;
    pop.classList.remove("open");
    $$(".hs.active").forEach((b) => b.classList.remove("active"));
    if (had && had.anchor && pop.contains(document.activeElement) && document.contains(had.anchor)) had.anchor.focus({ preventScroll: true });
    popCtx = null;
  }
  pop.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.target.closest(".x")) return closePop();
    const d = e.target.closest("[data-d]");
    if (d && popCtx) {
      const i = popCtx.visible.indexOf(popCtx.n);
      const ni = popCtx.visible[(i + Number(d.dataset.d) + popCtx.visible.length) % popCtx.visible.length];
      openPop(popCtx.host.children[ni], popCtx.file, ni);
    }
  });
  window.addEventListener("scroll", () => {
    if (!popCtx || window.innerWidth <= 720) return;
    const r = popCtx.anchor.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || !r.width) closePop(); else placePop(popCtx.anchor);
  }, { passive: true });

  /* ================= Подсказки по терминам ================= */
  const tip = $("#tip");
  function initGlossary() {
    const keys = Object.keys(D.glossary).sort((a, b) => b.length - a.length);
    const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("(?<![\\p{L}\\p{N}-])(" + keys.map(rx).join("|") + ")(?![\\p{L}\\p{N}])", "u");
    $$("section.sec").forEach((sec) => {
      const used = new Set();
      const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p || p.closest("h1,h2,h3,button,.term,svg,script,textarea,.media,th,summary,a,label")) return NodeFilter.FILTER_REJECT;
          return re.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => {
        const m = node.nodeValue.match(re);
        if (!m) return;
        const key = keys.find((k) => k.toLowerCase() === m[1].toLowerCase()) || m[1];
        if (used.has(key.toLowerCase())) return;
        used.add(key.toLowerCase());
        const after = node.splitText(m.index);
        after.splitText(m[1].length);
        const span = document.createElement("span");
        span.className = "term"; span.tabIndex = 0; span.dataset.term = key; span.textContent = after.nodeValue;
        after.replaceWith(span);
      });
    });
    let hT;
    document.addEventListener("mouseover", (e) => { const t = e.target.closest(".term"); if (t) { clearTimeout(hT); showTip(t); } });
    document.addEventListener("mouseout", (e) => { if (e.target.closest(".term")) hT = setTimeout(closeTip, 250); });
    tip.addEventListener("mouseover", () => clearTimeout(hT));
    tip.addEventListener("mouseout", () => (hT = setTimeout(closeTip, 250)));
    document.addEventListener("click", (e) => { const t = e.target.closest(".term"); if (t) showTip(t); });
    document.addEventListener("focusin", (e) => { const t = e.target.closest && e.target.closest(".term"); if (t) showTip(t); });
  }
  function showTip(t) {
    $$(".term.open").forEach((x) => x.classList.remove("open"));
    t.classList.add("open");
    tip.innerHTML = "<b>" + esc(t.dataset.term) + "</b>" + esc(D.glossary[t.dataset.term]);
    tip.classList.add("open");
    const r = t.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    let y = r.bottom + 8;
    if (y + h > innerHeight - 10) y = r.top - h - 8;
    tip.style.left = Math.min(innerWidth - w - 12, Math.max(12, r.left)) + "px";
    tip.style.top = Math.max(10, y) + "px";
  }
  function closeTip() { tip.classList.remove("open"); $$(".term.open").forEach((x) => x.classList.remove("open")); }

  /* ================= Увеличение ================= */
  const lb = $("#lb"), lbStage = $(".lb-stage", lb), lbCanvas = $(".lb-canvas", lb);
  let zm = 1, tx = 0, ty = 0;
  function applyZ() {
    lbCanvas.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + zm + ")";
    lbCanvas.style.setProperty("--z", zm);
    $(".z", lb).textContent = Math.round(zm * 100) + "%";
  }
  function openLb(file) {
    closePop();
    lbCanvas.innerHTML = "";
    const m = document.createElement("div");
    fillMedia(m, file, { noZoom: true, noTag: true, eager: true });
    lbCanvas.appendChild(m);
    const i = info(file);
    $(".cap", lb).textContent = (i.kind === "photo" ? "Фото сейчас. " : "Иллюстрация концепции. ") + (i.alt || "");
    zm = 1; tx = 0; ty = 0; applyZ();
    lb.classList.add("open");
    document.body.style.overflow = "hidden";
    $("#lbClose").focus();
  }
  function closeLb() { lb.classList.remove("open"); document.body.style.overflow = ""; closePop(); }
  function zoomBy(f, cx, cy) {
    const r = lbStage.getBoundingClientRect();
    cx = cx == null ? r.width / 2 : cx - r.left;
    cy = cy == null ? r.height / 2 : cy - r.top;
    const nz = Math.min(5, Math.max(1, zm * f));
    const ox = cx - r.width / 2, oy = cy - r.height / 2;
    tx = ox - (ox - tx) * (nz / zm); ty = oy - (oy - ty) * (nz / zm); zm = nz;
    if (zm === 1) { tx = 0; ty = 0; }
    applyZ();
  }
  $("#lbIn").onclick = () => zoomBy(1.5);
  $("#lbOut").onclick = () => zoomBy(1 / 1.5);
  $("#lbReset").onclick = () => { zm = 1; tx = 0; ty = 0; applyZ(); };
  $("#lbClose").onclick = closeLb;
  lbStage.addEventListener("wheel", (e) => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY); }, { passive: false });
  lbStage.addEventListener("dblclick", (e) => { if (!e.target.closest(".hs")) zoomBy(zm > 1.2 ? 1 / zm : 2.2, e.clientX, e.clientY); });
  let drag = null, pinch = null;
  const pts = new Map();
  lbStage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".hs")) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const [a, b] = Array.from(pts.values()); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zm }; drag = null; }
    else drag = { x: e.clientX, y: e.clientY, tx, ty };
    lbStage.setPointerCapture(e.pointerId);
    lbStage.classList.add("drag");
  });
  lbStage.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) {
      const [a, b] = Array.from(pts.values());
      zoomBy(Math.min(5, Math.max(1, pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d)) / zm, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (drag && zm > 1) { tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; applyZ(); }
  });
  const endPtr = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) { lbStage.classList.remove("drag"); drag = null; } };
  lbStage.addEventListener("pointerup", endPtr);
  lbStage.addEventListener("pointercancel", endPtr);

  /* ================= Навигация, прогресс, просмотренные зоны ================= */
  function goSection(id, behavior) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: behavior || smooth() });
  }
  function initNav() {
    const ol = $("#side ol");
    const secs = $$("section.sec[data-nav]");
    ol.innerHTML = secs.map((s) => '<li class="' + (s.classList.contains("detail-sec") ? "nd" : s.classList.contains("zone-sec") ? "nz" : "") + '"><a href="#' + s.id + '">' + esc(s.dataset.nav) + "</a></li>").join("");
    const links = $$("#side a");
    const io = new IntersectionObserver((ents) => {
      ents.forEach((en) => {
        if (!en.isIntersecting) return;
        const id = en.target.id;
        links.forEach((a) => a.classList.toggle("cur", a.getAttribute("href") === "#" + id));
        const cnt = $("#presentBar .cnt"); if (cnt) cnt.textContent = secs.indexOf(en.target) + 1 + " / " + secs.length;
        if (en.target.classList.contains("zone-sec") && !store.viewed[id]) { store.viewed[id] = 1; save(); renderSummary(); }
        if (navReady) rememberPlace(id);
      });
    }, { rootMargin: "-35% 0px -60% 0px" });
    secs.forEach((s) => io.observe(s));
    ol.addEventListener("click", (e) => { if (e.target.closest("a")) document.body.classList.remove("side-open"); });
    const prog = $("#progress");
    const onScroll = () => { const h = document.documentElement.scrollHeight - innerHeight; prog.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + "%"; };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  let navReady = false;

  /* ================= Режим показа ================= */
  const secList = () => $$("section.sec[data-nav]");
  function curSecIndex() {
    const s = secList(), mid = innerHeight * 0.35;
    let idx = 0;
    s.forEach((x, i) => { if (x.getBoundingClientRect().top <= mid) idx = i; });
    return idx;
  }
  function goSec(d) { const s = secList(); s[Math.max(0, Math.min(s.length - 1, curSecIndex() + d))].scrollIntoView({ behavior: smooth() }); }
  function setPresent(on) {
    const i = curSecIndex();
    document.body.classList.toggle("present", on);
    $("#presentBtn").setAttribute("aria-pressed", String(on));
    document.body.classList.remove("view-open", "side-open");
    requestAnimationFrame(() => secList()[i].scrollIntoView({ behavior: "instant" }));
    if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  /* ================= Печать ================= */
  function initPrint() {
    const btn = $("#printBtn"), menu = $("#printMenu");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const r = btn.getBoundingClientRect();
      menu.style.top = Math.min(innerHeight - 220, r.bottom + 6) + "px";
      menu.style.left = Math.max(10, Math.min(innerWidth - 300, r.right - 290)) + "px";
      menu.classList.toggle("open");
    });
    menu.addEventListener("click", (e) => {
      const b = e.target.closest("[data-print]");
      if (!b) return;
      menu.classList.remove("open");
      document.body.classList.remove("view-open");
      document.body.classList.toggle("print-notes", b.dataset.print === "notes");
      $$("img[loading=lazy]").forEach((i) => (i.loading = "eager"));
      setTimeout(() => window.print(), 300);
    });
    // в подробном режиме в печать идут и свёрнутые блоки «Что мы сейчас обсуждаем», «Что обновилось», приложение
    let opened = [];
    window.addEventListener("beforeprint", () => {
      if (state.mode !== "detail") return;
      opened = $$("details.fold:not([open])");
      opened.forEach((d) => (d.open = true));
    });
    window.addEventListener("afterprint", () => { opened.forEach((d) => (d.open = false)); opened = []; });
  }

  /* ================= Тост ================= */
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 3400);
  }

  /* ================= Управление ================= */
  function initControls() {
    $("#cToggle").addEventListener("click", () => { state.comments = !state.comments; if (!state.comments) state.diffOnly = false; applyFlags(); });
    $("#allToggle").addEventListener("click", () => { state.allMarks = !state.allMarks; if (state.allMarks) state.comments = true; applyFlags(); });
    $("#diffToggle").addEventListener("click", () => { state.diffOnly = !state.diffOnly; applyFlags(); if (state.diffOnly) toast("Показано только то, что на иллюстрациях условно"); });
    $("#diffOff").addEventListener("click", () => { state.diffOnly = false; applyFlags(); });
    $$(".dd > .ctl").forEach((b) => b.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !b.parentElement.classList.contains("open");
      b.parentElement.classList.toggle("open", open);
      b.setAttribute("aria-expanded", String(open));
    }));
    $$("#notesDd input").forEach((i) => i.addEventListener("change", () => { state.types[i.value] = i.checked; if (i.checked) state.comments = true; applyFlags(); }));
    $$("[data-g]").forEach((b) => b.addEventListener("click", () => setGlobal(b.dataset.g)));
    $$(".mode-seg button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode, true)));
    $$("[data-start]").forEach((b) => b.addEventListener("click", () => {
      const m = b.dataset.start;
      setMode(m, false);
      if (m === "detail") { state.allMarks = true; state.comments = true; applyFlags(); goSection("now"); }
      else goSection("parts");
    }));
    $("#presentBtn").addEventListener("click", () => setPresent(!document.body.classList.contains("present")));
    $("#pExit").addEventListener("click", () => setPresent(false));
    $("#pPrev").addEventListener("click", () => goSec(-1));
    $("#pNext").addEventListener("click", () => goSec(1));
    $("#pC").addEventListener("click", () => { state.comments = !state.comments; applyFlags(); });
    $("#pAll").addEventListener("click", () => { state.allMarks = !state.allMarks; if (state.allMarks) state.comments = true; applyFlags(); });
    $("#menuBtn").addEventListener("click", (e) => { e.stopPropagation(); document.body.classList.toggle("side-open"); document.body.classList.remove("view-open"); });
    $("#viewBtn").addEventListener("click", (e) => { e.stopPropagation(); document.body.classList.toggle("view-open"); document.body.classList.remove("side-open"); });
    $$("[data-jump]").forEach((b) => b.addEventListener("click", () => goSection(b.dataset.jump)));
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#pop") && !e.target.closest(".hs")) closePop();
      if (!e.target.closest("#tip") && !e.target.closest(".term")) closeTip();
      if (!e.target.closest(".dd")) $$(".dd").forEach((d) => { d.classList.remove("open"); const c = $(".ctl", d); if (c) c.setAttribute("aria-expanded", "false"); });
      if (!e.target.closest("#printMenu") && !e.target.closest("#printBtn")) $("#printMenu").classList.remove("open");
      if (!e.target.closest("#side") && !e.target.closest("#menuBtn")) document.body.classList.remove("side-open");
      if (!e.target.closest(".controls") && !e.target.closest("#viewBtn") && !e.target.closest("#printMenu")) document.body.classList.remove("view-open");
    });
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
        $$(".dd").forEach((d) => d.classList.remove("open"));
        $("#printMenu").classList.remove("open");
        document.body.classList.remove("side-open", "view-open");
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "c" || k === "с") { state.comments = !state.comments; if (!state.comments) state.diffOnly = false; applyFlags(); toast(state.comments ? "Цифры на картинках включены" : "Цифры на картинках выключены"); }
      if (k === "d" || k === "в") { state.diffOnly = !state.diffOnly; applyFlags(); }
      if (k === "p" || k === "з") setPresent(!document.body.classList.contains("present"));
      if (document.body.classList.contains("present")) {
        if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) { e.preventDefault(); goSec(1); }
        if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); goSec(-1); }
      }
    });
    window.addEventListener("resize", () => { closePop(); closeTip(); });
    window.addEventListener("hashchange", () => applyHash(false));
  }

  function initToTop() {
    const b = $("#toTop");
    const y = () => window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const upd = () => { b.hidden = y() < Math.max(400, innerHeight * 0.7) || document.body.classList.contains("present"); };
    window.addEventListener("scroll", upd, { passive: true });
    document.addEventListener("scroll", upd, { passive: true, capture: true });
    window.addEventListener("resize", upd);
    window.addEventListener("pageshow", upd);
    b.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: smooth() });
      document.body.scrollTop = 0;
      $("#resume").hidden = true;
      setTimeout(() => { const h = $("#cover h1"); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); } }, 400);
    });
    upd();
  }
  function initDocInfo() {
    $("#docVer").textContent = "Версия " + D.doc.version + " от " + D.doc.date;
    $("#docLog").innerHTML = D.doc.log.map((e) => '<div class="log-e"><b>Версия ' + esc(e.v) + ", " + esc(e.d) + "</b><ul>" + e.items.map((i) => "<li>" + esc(i) + "</li>").join("") + "</ul></div>").join("");
  }

  /* ================= Запуск ================= */
  const prevPlace = store.last;
  setMode(state.mode, false);
  initFolding();
  initStatic();
  initZones();
  initFb();
  initMosaic();
  initBA();
  initDecisions();
  initNav();
  initGlossary();
  initPrint();
  initControls();
  initDocInfo();
  initToTop();
  applyFlags();
  updateGlobalUi();
  renderSaveLine();
  const linked = applyHash(true);
  if (!linked) offerResume(prevPlace);
  setTimeout(() => { navReady = true; }, 1500);
  if (!storageOk) toast("Сохранение в этом браузере недоступно. Скачайте итоги перед закрытием");
})();
