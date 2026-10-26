/*
 * 男魂くんの1年 ― エンジン（画面・入力・描画・ミニゲームの実行）
 *  - 画面は 256×224 ドット。端末の画素の整数倍に拡大して、ドットをくっきり見せる
 *  - 入力は十字キーと A・B（キーボード、画面下のボタン、画面のタップ）
 *  - ミニゲームは OTK.register() で登録し、OTK.makeRun() で 1 回ぶん遊ぶ
 * ミニゲームを作る人向けの説明は docs/site/ENGINE.md
 */
(function () {
  'use strict';
  const OTK = (window.OTK = window.OTK || {});
  const W = 256, H = 224, TOP = 12, STEP = 1 / 60;
  OTK.W = W;
  OTK.H = H;
  OTK.TOP = TOP;
  OTK.STEP = STEP;
  OTK.time = 0; // 起動してからの秒数（点滅などに使う）
  OTK.speed = 1; // テスト用の早送り（OTK.debug.speed）

  // ── 色（ファミコン風） ────────────────────────────
  const P = (OTK.P = Object.freeze({
    black: '#000000', ink: '#141018', white: '#fcfcfc', lgray: '#d8d8d8', gray: '#bcbcbc', dgray: '#7c7c7c', xdgray: '#3c3c3c',
    red: '#f83800', dred: '#a81000', xdred: '#580c00', rose: '#e40058', pink: '#f878f8', lpink: '#f8b8f8',
    orange: '#e45c10', lorange: '#fca044', yellow: '#f8b800', lyellow: '#f8d878', cream: '#fce0a8',
    brown: '#ac7c00', dbrown: '#503000', tan: '#c88c50',
    green: '#00a800', dgreen: '#005800', lgreen: '#58d854', lime: '#b8f818',
    blue: '#0000bc', mblue: '#0058f8', sky: '#3cbcfc', lsky: '#a4e4fc', navy: '#16124a', night: '#0d0b26',
    cyan: '#00e8d8', teal: '#008888', purple: '#6844fc', violet: '#940084', lviolet: '#d8b8f8',
    skin: '#f8c098', skinS: '#d08858',
  }));

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  OTK.makeCanvas = makeCanvas;

  // ── 乱数（種を決めると毎回同じになる） ──────────────────
  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRandom(seed) {
    const r = mulberry32(seed >>> 0);
    const rnd = (a, b) => (b == null ? (a == null ? r() : r() * a) : a + r() * (b - a));
    const irnd = (a, b) => (b == null ? Math.floor(r() * (a + 1)) : a + Math.floor(r() * (b - a + 1)));
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const chance = (p) => r() < p;
    const shuffle = (arr) => {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    };
    return { rnd, irnd, pick, chance, shuffle, raw: r };
  }
  OTK.makeRandom = makeRandom;
  OTK.seed = null; // 数字を入れると、次に始めるミニゲームの乱数が固定される

  // ── 画面と拡大 ──────────────────────────────────
  const cv = document.getElementById('otk-canvas');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const stage = document.getElementById('otk-screen');
  OTK.canvas = cv;

  function visible(el) {
    return !!(el && el.offsetParent !== null && getComputedStyle(el).display !== 'none');
  }
  function fit() {
    if (!stage) return;
    const dpr = window.devicePixelRatio || 1;
    const vh = window.innerHeight;
    const head = document.querySelector('.otk-top');
    const dpad = document.getElementById('otk-dpad');
    const hint = document.getElementById('otk-keys');
    const side = window.matchMedia('(orientation: landscape) and (max-height: 540px)').matches;
    let reserved = (head ? head.offsetHeight : 0) + 14;
    if (visible(dpad) && !side) reserved += dpad.offsetHeight + 18;
    if (visible(hint)) reserved += hint.offsetHeight + 6;
    const availW = Math.max(160, stage.clientWidth);
    const availH = Math.max(150, vh - reserved);
    let s = Math.min(availW / W, availH / H);
    // 端末の画素で整数倍にできるなら、そうする（ドットの太さがそろう）
    const k = Math.floor(s * dpr);
    if (k >= 1 && k / dpr >= s * 0.8) s = k / dpr;
    cv.style.width = W * s + 'px';
    cv.style.height = H * s + 'px';
    OTK.scale = s;
  }
  OTK.fit = fit;
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 120));
  if (window.ResizeObserver && stage) new ResizeObserver(fit).observe(stage);

  // ── 入力 ──────────────────────────────────────
  // キーの名前：up down left right a b pause（pause はミニゲームには渡さない）
  // 画面には「Aでスタート」などと出るので、A・B のキーもそのまま A・B ボタンにする
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    KeyZ: 'a', KeyA: 'a', Space: 'a', Enter: 'a', NumpadEnter: 'a',
    KeyX: 'b', KeyB: 'b', ShiftLeft: 'b', ShiftRight: 'b', Backspace: 'b',
    Escape: 'pause', KeyP: 'pause',
  };
  const KEYS = ['up', 'down', 'left', 'right', 'a', 'b', 'pause'];
  const src = { key: new Set(), pad: new Set(), btn: new Set() };
  const pend = { pressed: new Set(), released: new Set(), tap: null };
  const cur = { pressed: new Set(), released: new Set(), tap: null };
  const holdT = {};
  const pointer = { x: 0, y: 0, down: false };

  function rawHeld(k) {
    return src.key.has(k) || src.pad.has(k) || src.btn.has(k);
  }
  function setSrc(set, k, on) {
    const before = rawHeld(k);
    if (on) set.add(k);
    else set.delete(k);
    const after = rawHeld(k);
    if (!before && after) pend.pressed.add(k);
    if (before && !after) pend.released.add(k);
  }
  function releaseAll() {
    for (const set of [src.key, src.pad, src.btn]) for (const k of [...set]) setSrc(set, k, false);
    pointer.down = false;
  }

  const input = (OTK.input = {
    held: (k) => rawHeld(k),
    pressed: (k) => cur.pressed.has(k),
    released: (k) => cur.released.has(k),
    // 押しっぱなしで、少し待ってからくりかえす（メニューのカーソル用）
    repeat: (k) => cur.pressed.has(k) || (rawHeld(k) && holdT[k] > 0.36 && Math.floor((holdT[k] - 0.36) / 0.11) !== Math.floor((holdT[k] - 0.36 - STEP) / 0.11)),
    get tap() {
      return cur.tap;
    },
    pointer,
    dir: () => ({ x: (rawHeld('right') ? 1 : 0) - (rawHeld('left') ? 1 : 0), y: (rawHeld('down') ? 1 : 0) - (rawHeld('up') ? 1 : 0) }),
    // 決定（A・START・画面タップ）
    ok: () => cur.pressed.has('a') || cur.pressed.has('pause') || !!cur.tap,
    back: () => cur.pressed.has('b'),
    any: () => cur.pressed.has('a') || cur.pressed.has('b') || cur.pressed.has('pause') || !!cur.tap,
    releaseAll,
    // 1 コマぶんの押した・離したを、まとめて捨てる（場面を切りかえたとき）
    flush() {
      cur.pressed.clear();
      cur.released.clear();
      cur.tap = null;
      pend.pressed.clear();
      pend.released.clear();
      pend.tap = null;
    },
  });
  function beginStep() {
    cur.pressed = new Set(pend.pressed);
    cur.released = new Set(pend.released);
    cur.tap = pend.tap;
    pend.pressed.clear();
    pend.released.clear();
    pend.tap = null;
    for (const k of KEYS) holdT[k] = rawHeld(k) ? (holdT[k] || 0) + STEP : 0;
  }
  function endStep() {
    cur.pressed.clear();
    cur.released.clear();
    cur.tap = null;
  }

  // 最初の操作で音を出せるようにする
  function gesture() {
    if (OTK.audio && OTK.audio.unlock) OTK.audio.unlock();
  }
  function isFormTarget(e) {
    const t = e.target;
    return t && t.closest && t.closest('input, textarea, select, button, a, [contenteditable="true"]');
  }
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = KEYMAP[e.code];
    if (!k) {
      if (e.code === 'KeyM' && !e.repeat && OTK.audio) OTK.audio.toggle();
      return;
    }
    // フォーカスがボタンやリンクにあるときの Enter・スペースは、そちらに任せる
    if ((e.code === 'Enter' || e.code === 'Space') && isFormTarget(e)) return;
    e.preventDefault();
    gesture();
    if (!e.repeat) setSrc(src.key, k, true);
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) setSrc(src.key, k, false);
  });
  // iPhone などは touchend・click でないと音を出せないことがある
  window.addEventListener('touchend', gesture, { passive: true });
  window.addEventListener('click', gesture);
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
    if (OTK.onHidden && document.hidden) OTK.onHidden();
  });

  // 画面のタップ・クリック → ゲームの座標
  function toGame(e) {
    const r = cv.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(W - 1, Math.floor(((e.clientX - r.left) * W) / r.width))),
      y: Math.max(0, Math.min(H - 1, Math.floor(((e.clientY - r.top) * H) / r.height))),
    };
  }
  cv.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    gesture();
    const p = toGame(e);
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.down = true;
    pend.tap = p;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* なくてもよい */ }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = toGame(e);
    pointer.x = p.x;
    pointer.y = p.y;
  });
  const up = () => { pointer.down = false; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());

  // 画面下のボタン（十字キーは、指をすべらせても方向が変わる）
  function markTouch(e) {
    if (e.pointerType === 'touch' && !document.body.classList.contains('otk-touch')) {
      document.body.classList.add('otk-touch');
      fit();
    }
  }
  window.addEventListener('pointerdown', markTouch, { passive: true });
  const dpad = document.getElementById('otk-dpad');
  if (dpad) {
    let pid = null;
    const setDirs = (dirs) => {
      for (const d of ['up', 'down', 'left', 'right']) setSrc(src.pad, d, dirs.includes(d));
      dpad.dataset.dir = dirs.join(' ');
    };
    const fromPoint = (e) => {
      const r = dpad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.hypot(dx, dy) < r.width * 0.12) return [];
      const a = Math.atan2(dy, dx); // 右が 0、下が +
      const sector = Math.round(a / (Math.PI / 4)); // -4..4
      const MAP = { 0: ['right'], 1: ['right', 'down'], 2: ['down'], 3: ['left', 'down'], 4: ['left'], '-4': ['left'], '-3': ['left', 'up'], '-2': ['up'], '-1': ['right', 'up'] };
      return MAP[sector] || [];
    };
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      gesture();
      pid = e.pointerId;
      try { dpad.setPointerCapture(pid); } catch (err) { /* なくてもよい */ }
      setDirs(fromPoint(e));
    });
    dpad.addEventListener('pointermove', (e) => {
      if (e.pointerId === pid) setDirs(fromPoint(e));
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      setDirs([]);
    };
    dpad.addEventListener('pointerup', end);
    dpad.addEventListener('pointercancel', end);
    dpad.addEventListener('lostpointercapture', end);
    dpad.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  document.querySelectorAll('[data-otk-key]').forEach((btn) => {
    const k = btn.dataset.otkKey;
    let pid = null;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      gesture();
      pid = e.pointerId;
      try { btn.setPointerCapture(pid); } catch (err) { /* なくてもよい */ }
      btn.classList.add('is-down');
      setSrc(src.btn, k, true);
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null;
      btn.classList.remove('is-down');
      setSrc(src.btn, k, false);
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    btn.addEventListener('lostpointercapture', end);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ── 描画 ──────────────────────────────────────
  const FONT = '"DotGothic16", "IPAGothic", "Osaka-Mono", "MS Gothic", monospace';
  const fontOf = (size) => size + 'px ' + FONT;
  const R = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };

  // 文字は、にじみ（アンチエイリアス）を切り捨てて、ドットにしてからしまっておく
  const scratch = makeCanvas(8, 8).getContext('2d', { willReadFrequently: true });
  const masks = new Map();
  const tints = new Map();
  const asked = new Set();
  if (document.fonts) {
    // フォントが届いたら、作っておいた文字を作りなおす
    document.fonts.addEventListener('loadingdone', () => {
      masks.clear();
      tints.clear();
    });
  }
  // 文字が Google Fonts のどの分割ファイルにあるかは文字しだいなので、文字列ごとに読みこみを頼む
  function askFont(str) {
    if (!document.fonts || !document.fonts.load) return;
    if (asked.has(str)) return;
    asked.add(str);
    try {
      if (!document.fonts.check(fontOf(16), str)) document.fonts.load(fontOf(16), str).catch(() => {});
    } catch (e) { /* 古いブラウザ */ }
  }
  function measureRaw(str, size) {
    scratch.font = fontOf(size);
    return Math.ceil(scratch.measureText(str).width);
  }
  function mask(str, size) {
    const key = size + '|' + str;
    let m = masks.get(key);
    if (m) return m;
    askFont(str);
    const w = Math.max(1, measureRaw(str, size));
    const h = Math.ceil(size * 1.3);
    const c = makeCanvas(w + 2, h + 2);
    const cc = c.getContext('2d', { willReadFrequently: true });
    cc.font = fontOf(size);
    cc.textBaseline = 'top';
    cc.fillStyle = '#fff';
    cc.fillText(str, 1, 1);
    const img = cc.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const on = d[i + 3] > 110;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = on ? 255 : 0;
    }
    cc.putImageData(img, 0, 0);
    m = { cv: c, w, h };
    if (masks.size > 900) masks.delete(masks.keys().next().value);
    masks.set(key, m);
    return m;
  }
  function tint(str, size, col) {
    const key = size + '|' + col + '|' + str;
    let t = tints.get(key);
    if (t) return t;
    const m = mask(str, size);
    const c = makeCanvas(m.cv.width, m.cv.height);
    const cc = c.getContext('2d');
    cc.drawImage(m.cv, 0, 0);
    cc.globalCompositeOperation = 'source-in';
    cc.fillStyle = col;
    cc.fillRect(0, 0, c.width, c.height);
    t = { cv: c, w: m.w, h: m.h };
    if (tints.size > 1500) tints.delete(tints.keys().next().value);
    tints.set(key, t);
    return t;
  }
  const OUT8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  function text(str, x, y, o) {
    o = o || {};
    str = String(str);
    const size = o.size || 16;
    if (str.indexOf('\n') >= 0) {
      const lh = o.lh || size + 4;
      let wmax = 0;
      str.split('\n').forEach((line, i) => { wmax = Math.max(wmax, text(line, x, y + i * lh, Object.assign({}, o, { lh: null }))); });
      return wmax;
    }
    if (!str) return 0;
    const col = o.col || P.white;
    const t = tint(str, size, col);
    let dx = Math.round(x) - 1;
    const dy = Math.round(y) - 1;
    if (o.align === 'center') dx -= Math.round(t.w / 2);
    else if (o.align === 'right') dx -= t.w;
    if (o.outline) {
      const oc = tint(str, size, o.outline === true ? P.black : o.outline).cv;
      for (const [ox, oy] of OUT8) ctx.drawImage(oc, dx + ox, dy + oy);
    }
    if (o.shadow) ctx.drawImage(tint(str, size, o.shadow === true ? P.black : o.shadow).cv, dx + 1, dy + 1);
    ctx.drawImage(t.cv, dx, dy);
    return t.w;
  }
  const measure = (str, size) => measureRaw(String(str), size || 16); // 幅だけなら、ドットにしなくてよい
  // 太いふちどりの大きい文字（タイトルや「クリア！」に）。o: { size, col, rim, edge, shade, align }
  function big(str, x, y, o) {
    o = o || {};
    const size = o.size || 32;
    const edge = o.edge || P.black;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && (dx || dy)) text(str, x + dx, y + dy + 1, { size, col: edge, align: o.align });
    text(str, x, y + 2, { size, col: o.shade || P.xdgray, align: o.align, outline: o.rim || P.white });
    return text(str, x, y, { size, col: o.col || P.white, align: o.align, outline: o.rim || P.white });
  }

  // 折り返し。行頭に来てはいけない文字（、。」など）は、前の文字といっしょに次の行へ送る（追い出し）。
  // 行末に来てはいけない文字（「（など）も次の行へ。どの行も maxW をこえない（1 文字しかない行はのぞく）
  const NO_HEAD = '、。，．・：；？！!?ー～」』）)】…ぁぃぅぇぉっゃゅょァィゥェォッャュョ';
  const NO_TAIL = '「『（(【';
  OTK.NO_HEAD = NO_HEAD;
  function wrap(str, maxW, size) {
    size = size || 16;
    const out = [];
    String(str).split('\n').forEach((para) => {
      let line = [];
      for (const ch of para) {
        if (!line.length || measureRaw(line.join('') + ch, size) <= maxW) {
          line.push(ch);
          continue;
        }
        if (ch === ' ' || ch === '　') {
          out.push(line.join(''));
          line = [];
          continue;
        }
        let carry = [ch];
        while (line.length > 1 && (NO_HEAD.includes(carry[0]) || NO_TAIL.includes(line[line.length - 1]))) carry.unshift(line.pop());
        if (NO_HEAD.includes(carry[0])) {
          line.push(...carry); // 送れる文字がない（とても短い行）ときだけ、はみ出してよい
          continue;
        }
        out.push(line.join(''));
        line = carry;
      }
      out.push(line.join(''));
    });
    return out;
  }

  // 小さい数字（3×5 ドット）。時間や点数に
  const DIG = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    ':': '000010000010000', '.': '000000000000010', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100',
    x: '000101010101000', '%': '101001010100101', ' ': '000000000000000',
  };
  function numDraw(str, x, y, col, s) {
    let cx = x;
    for (const ch of str) {
      const bits = DIG[ch] || DIG[' '];
      for (let i = 0; i < 15; i++) if (bits[i] === '1') R(cx + (i % 3) * s, y + Math.floor(i / 3) * s, s, s, col);
      cx += 4 * s;
    }
  }
  function num(n, x, y, o) {
    o = o || {};
    const str = String(n);
    const s = o.scale || 1;
    const w = str.length * 4 * s - s;
    let dx = Math.round(x);
    if (o.align === 'center') dx -= Math.round(w / 2);
    else if (o.align === 'right') dx -= w;
    if (o.shadow) numDraw(str, dx + s, Math.round(y) + s, o.shadow === true ? P.black : o.shadow, s);
    numDraw(str, dx, Math.round(y), o.col || P.white, s);
    return w;
  }

  // ファミコン風のウインドウ（青い地に白い二重線）
  function box(x, y, w, h, o) {
    o = o || {};
    x = Math.round(x);
    y = Math.round(y);
    w = Math.round(w);
    h = Math.round(h);
    const fill = o.fill || P.blue, bd = o.border || P.white, edge = o.edge || P.black;
    R(x + 1, y, w - 2, h, edge);
    R(x, y + 1, w, h - 2, edge);
    R(x + 2, y + 1, w - 4, h - 2, bd);
    R(x + 1, y + 2, w - 2, h - 4, bd);
    R(x + 2, y + 2, w - 4, h - 4, fill);
    R(x + 3, y + 3, w - 6, h - 6, bd);
    R(x + 4, y + 4, w - 8, h - 8, fill);
  }

  function sprite(img, x, y, o) {
    if (!img) return;
    o = o || {};
    const s = o.scale || 1;
    const w = img.width * s, h = img.height * s;
    x = Math.round(x);
    y = Math.round(y);
    const a = o.alpha != null ? o.alpha : 1;
    if (o.flip || o.flipY || a !== 1) {
      ctx.save();
      ctx.globalAlpha *= a;
      ctx.translate(x + (o.flip ? w : 0), y + (o.flipY ? h : 0));
      ctx.scale(o.flip ? -1 : 1, o.flipY ? -1 : 1);
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    } else ctx.drawImage(img, x, y, w, h);
  }

  function disc(cx, cy, r, col) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    r = Math.max(0, Math.round(r));
    for (let dy = -r; dy <= r; dy++) {
      const w = Math.floor(Math.sqrt(r * r - dy * dy) + 0.5);
      R(cx - w, cy + dy, w * 2 + 1, 1, col);
    }
  }
  function oval(cx, cy, rx, ry, col) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    rx = Math.max(1, Math.round(rx));
    ry = Math.max(1, Math.round(ry));
    for (let dy = -ry; dy <= ry; dy++) {
      const w = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)) + 0.5);
      R(cx - w, cy + dy, w * 2 + 1, 1, col);
    }
  }
  function ring(cx, cy, r, col) {
    cx = Math.round(cx);
    cy = Math.round(cy);
    r = Math.round(r);
    let x = r, y = 0, err = 1 - r;
    while (x >= y) {
      for (const [a, b] of [[x, y], [y, x], [-y, x], [-x, y], [-x, -y], [-y, -x], [y, -x], [x, -y]]) R(cx + a, cy + b, 1, 1, col);
      y++;
      if (err < 0) err += 2 * y + 1;
      else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  }
  function line(x0, y0, x1, y1, col) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    ctx.fillStyle = col;
    for (let n = 0; n < 2000; n++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function frame(x, y, w, h, col) {
    R(x, y, w, 1, col);
    R(x, y + h - 1, w, 1, col);
    R(x, y, 1, h, col);
    R(x + w - 1, y, 1, h, col);
  }
  // 市松もよう（半透明のかわり。ファミコンらしく見える）
  function dither(x, y, w, h, col, phase) {
    x = Math.round(x);
    y = Math.round(y);
    ctx.fillStyle = col;
    for (let j = 0; j < h; j++) for (let i = (j + (phase || 0)) & 1; i < w; i += 2) ctx.fillRect(x + i, y + j, 1, 1);
  }
  function shadow(cx, cy, rx) {
    ctx.save();
    ctx.globalAlpha *= 0.35;
    oval(cx, cy, rx || 6, Math.max(1, Math.round((rx || 6) / 3)), P.black);
    ctx.restore();
  }
  // 横長のゲージ（ratio は 0〜1）
  function bar(x, y, w, h, ratio, col, bg) {
    R(x - 1, y - 1, w + 2, h + 2, P.black);
    R(x, y, w, h, bg || P.xdgray);
    R(x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), h, col || P.lgreen);
  }
  // 下のほうに出すセリフのウインドウ
  function say(str, o) {
    o = o || {};
    const size = o.size || 16;
    const lh = size + 4;
    const lines = wrap(str, W - 32, size).slice(0, o.maxLines || 3);
    const h = o.h || lines.length * lh + 18;
    const y = o.y != null ? o.y : H - h - 6;
    box(6, y, W - 12, h);
    if (o.name) {
      const nw = measure(o.name, 12) + 14;
      box(12, y - 16, nw, 20, { fill: o.nameFill || P.navy });
      text(o.name, 19, y - 13, { size: 12, col: P.lyellow });
    }
    lines.forEach((l, i) => text(l, 16, y + 10 + i * lh, { size, col: o.col || P.white }));
  }
  const blink = (hz) => Math.floor(OTK.time * (hz || 2) * 2) % 2 === 0;

  const g = (OTK.g = {
    ctx, P, W, H, TOP, R,
    clear: (col) => R(0, 0, W, H, col || P.black),
    text, big, measure, wrap, num, box, sprite, disc, oval, ring, line, frame, dither, shadow, bar, say, blink,
  });

  // ── ミニゲームの登録 ───────────────────────────────
  const games = {};
  OTK.register = function (def) {
    if (!def || !def.id || typeof def.create !== 'function') {
      console.error('OTK.register: id と create(api) が必要です', def);
      return;
    }
    games[def.id] = Object.assign({ order: 99, month: 4, event: '', title: def.id, goal: '', howto: [], note: '', time: null, timeout: 'lose', bgm: 'play' }, def);
  };
  OTK.get = (id) => games[id] || null;
  OTK.list = () => Object.values(games).sort((a, b) => a.order - b.order);

  // ── ミニゲームを 1 回ぶん動かす ─────────────────────────
  // opts: { practice, tries, onEnd({result, msg}) }
  OTK.makeRun = function (id, opts) {
    opts = opts || {};
    const def = games[id];
    if (!def) throw new Error('ミニゲームがありません: ' + id);
    const seed = OTK.seed != null ? OTK.seed : Math.floor(Math.random() * 1e9);
    const rand = makeRandom(seed);
    const run = {
      id, def, seed, t: 0, phase: 'ready', result: null, msg: '', wait: 0, endT: 0,
      timers: [], shakeT: 0, shakeP: 0, flashT: 0, flashD: 0, flashCol: P.white, lastTick: null, errored: false,
    };
    const live = () => run.phase === 'play' && !run.result;
    const api = {
      W, H, TOP, P, def,
      practice: !!opts.practice,
      tries: opts.tries | 0,
      input: {
        held: (k) => live() && input.held(k),
        pressed: (k) => live() && input.pressed(k),
        released: (k) => live() && input.released(k),
        repeat: (k) => live() && input.repeat(k),
        get tap() { return live() ? input.tap : null; },
        // 終わったあと・はじまる前は、おしていないことにする（ほかの入力と同じ）
        get pointer() { return live() ? input.pointer : { x: input.pointer.x, y: input.pointer.y, down: false }; },
        dir: () => (live() ? input.dir() : { x: 0, y: 0 }),
        any: () => live() && (input.pressed('a') || input.pressed('b') || !!input.tap),
      },
      get time() { return run.t; },
      get remaining() { return def.time ? Math.max(0, def.time - run.t) : null; },
      get ended() { return run.result; },
      win: (msg, o) => end('win', msg, o),
      lose: (msg, o) => end('lose', msg, o),
      sfx: (name) => OTK.audio && OTK.audio.sfx(name),
      bgm: (name) => OTK.audio && (name ? OTK.audio.bgm(name) : OTK.audio.stop()),
      rnd: rand.rnd, irnd: rand.irnd, pick: rand.pick, chance: rand.chance, shuffle: rand.shuffle, random: rand.raw,
      person: (kind, o) => OTK.person(kind, o),
      portrait: (kind, o) => OTK.portrait(kind, o),
      after(sec, fn) { run.timers.push({ t: run.t + sec, fn }); },
      shake(power, sec) { run.shakeP = power != null ? power : 3; run.shakeT = sec != null ? sec : 0.3; },
      flash(col, sec) { run.flashCol = col || P.white; run.flashD = run.flashT = sec != null ? sec : 0.12; },
      // 当たり判定：{x, y, w, h} どうしが重なっているか
      hit: (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h,
      dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
      lerp: (a, b, t) => a + (b - a) * t,
      approach: (v, target, step) => (v < target ? Math.min(target, v + step) : Math.max(target, v - step)),
    };
    function end(result, msg, o) {
      if (run.result || run.phase === 'done') return;
      run.result = result === 'win' ? 'win' : 'lose';
      run.msg = msg || (run.result === 'win' ? 'やった！' : 'ざんねん…');
      run.wait = o && o.wait != null ? o.wait : 0.5;
      if (OTK.audio) OTK.audio.stop();
    }
    function fail(where, e) {
      console.error('ミニゲーム「' + id + '」の ' + where + ' でエラー:', e);
      run.errored = true;
      // 遊んでいる人が先へ進めなくならないように、おまけでクリアにする
      end('win', 'エラーが出たので、おまけでクリア。', { wait: 0.2 });
    }
    run.api = api;
    run.end = end;
    try {
      run.game = def.create(api) || {};
    } catch (e) {
      run.game = {};
      fail('create', e);
    }

    run.start = function () {
      if (run.phase !== 'ready') return;
      run.phase = 'play';
      if (OTK.audio && def.bgm && !run.result) OTK.audio.bgm(def.bgm);
    };
    run.update = function (dt) {
      if (run.phase === 'ready' || run.phase === 'done') return;
      run.t += dt;
      if (run.shakeT > 0) run.shakeT -= dt;
      if (run.flashT > 0) run.flashT -= dt;
      if (run.timers.length) {
        const due = run.timers.filter((tm) => tm.t <= run.t);
        run.timers = run.timers.filter((tm) => tm.t > run.t);
        due.forEach((tm) => { try { tm.fn(); } catch (e) { fail('after', e); } });
      }
      if (run.game.update) {
        try { run.game.update(dt); } catch (e) { if (!run.errored) fail('update', e); }
      }
      // 時間切れ
      if (!run.result && def.time) {
        const left = def.time - run.t;
        const sec = Math.ceil(left);
        if (left > 0 && sec <= 3 && sec !== run.lastTick) {
          run.lastTick = sec;
          api.sfx('tick');
        }
        if (left <= 0) {
          if (run.game.timeup) {
            try { run.game.timeup(); } catch (e) { fail('timeup', e); }
          }
          if (!run.result) {
            if (def.timeout === 'win') end('win', def.timeoutMsg || '時間まで、たえきった！');
            else end('lose', def.timeoutMsg || '時間切れ…');
          }
        }
      }
      if (run.result) {
        if (run.phase === 'play') {
          run.wait -= dt;
          if (run.wait <= 0) {
            run.phase = 'stamp';
            run.endT = 0;
            if (OTK.audio) OTK.audio.bgm(run.result === 'win' ? 'win' : 'lose');
          }
        } else if (run.phase === 'stamp') {
          run.endT += dt;
          if (run.endT >= 1.6) {
            run.phase = 'done';
            if (opts.onEnd) opts.onEnd({ result: run.result, msg: run.msg });
          }
        }
      }
    };
    run.draw = function (gg, o) {
      o = o || {};
      ctx.save();
      if (run.shakeT > 0 && run.phase !== 'ready') {
        const p = run.shakeP;
        ctx.translate(Math.round((Math.random() * 2 - 1) * p), Math.round((Math.random() * 2 - 1) * p));
      }
      if (run.game.draw) {
        try { run.game.draw(gg); } catch (e) {
          if (!run.errored) fail('draw', e);
          R(0, 0, W, H, P.dred);
          text('描画でエラーが出ました', W / 2, H / 2 - 8, { align: 'center' });
        }
      }
      ctx.restore();
      if (run.flashT > 0) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, run.flashT / Math.max(0.01, run.flashD));
        R(0, 0, W, H, run.flashCol);
        ctx.restore();
      }
      if (o.hud !== false) run.drawHud();
      if (run.phase === 'stamp' || run.phase === 'done') run.drawStamp();
    };
    run.drawHud = function () {
      R(0, 0, W, TOP, P.black);
      R(0, TOP - 1, W, 1, P.xdgray);
      const label = def.month + '月 ' + def.title;
      text(label, 3, 0, { size: 12, col: api.practice ? P.lsky : P.lyellow });
      if (def.time) {
        const left = def.time - run.t;
        const ratio = Math.max(0, left / def.time);
        const bw = 62, bx = W - bw - 4;
        const col = ratio > 0.5 ? P.lgreen : ratio > 0.25 ? P.yellow : P.red;
        const show = ratio > 0.25 || run.result || blink(4);
        bar(bx, 4, bw, 4, ratio, show ? col : P.white);
        text(String(Math.max(0, Math.ceil(left))), bx - 5, 0, { size: 12, align: 'right', col: ratio > 0.25 ? P.white : P.red });
      }
    };
    run.drawStamp = function () {
      const t = Math.min(run.endT, 1.6);
      const win = run.result === 'win';
      ctx.save();
      ctx.globalAlpha = Math.min(0.55, t * 2);
      R(0, TOP, W, H - TOP, win ? P.navy : P.black);
      ctx.restore();
      // 帯
      const bh = Math.round(Math.min(1, t / 0.18) * 48);
      if (bh > 0) {
        R(0, 112 - bh / 2, W, bh, win ? P.blue : P.xdgray);
        R(0, 112 - bh / 2 + 2, W, 1, win ? P.yellow : P.gray);
        R(0, 112 + bh / 2 - 3, W, 1, win ? P.yellow : P.gray);
      }
      // 上から落ちてきて、ぽよんと止まる
      const k = Math.min(1, t / 0.32);
      const bounce = k < 1 ? -70 * (1 - k) * (1 - k) : Math.round(Math.sin(Math.min(1, (t - 0.32) / 0.25) * Math.PI) * -6);
      const y = 92 + bounce;
      if (win) big('クリア！', W / 2, y, { col: P.yellow, shade: P.orange, align: 'center' });
      else big('しっぱい…', W / 2, y, { col: P.lsky, shade: P.mblue, rim: P.navy, align: 'center' });
      if (win) {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + t * 2;
          const r = 40 + t * 70;
          const sx = W / 2 + Math.cos(a) * r * 1.4, sy = y + 16 + Math.sin(a) * r * 0.6;
          if (t > 0.3) R(sx, sy, 2, 2, i % 2 ? P.white : P.lyellow);
        }
      }
    };
    return run;
  };

  // ── 場面と、毎コマの処理 ──────────────────────────────
  let scene = null;
  OTK.setScene = function (s) {
    if (scene && scene.leave) scene.leave();
    scene = s;
    input.flush();
    if (s && s.enter) s.enter();
  };

  let acc = 0, last = 0, warned = false;
  function frameLoop(ts) {
    requestAnimationFrame(frameLoop);
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : STEP;
    last = ts;
    acc += dt * Math.max(0.1, OTK.speed || 1);
    let n = 0;
    const maxN = Math.ceil(6 * Math.max(1, OTK.speed || 1));
    while (acc >= STEP && n < maxN) {
      acc -= STEP;
      n++;
      beginStep();
      OTK.time += STEP;
      try {
        if (scene && scene.update) scene.update(STEP);
      } catch (e) {
        if (!warned) { warned = true; console.error(e); }
      }
      endStep();
    }
    if (n >= maxN) acc = 0;
    try {
      ctx.save();
      if (scene && scene.draw) scene.draw(g);
      ctx.restore();
    } catch (e) {
      if (!warned) { warned = true; console.error(e); }
    }
  }
  OTK.startLoop = function () {
    fit();
    requestAnimationFrame(frameLoop);
  };
})();
