/*
 * 夕照寮OB会 ― ホーム画面（タイトル → モード選択 → ゲームの一覧／コンテンツの地図）
 * 絵は 256×224 ドットの裏の画面に描き、拡大して表の画面に写す（にじまないように）。
 * 文字は拡大したあとの表の画面に、くっきり描く。
 * 操作：矢印・WASD、Z/Enter/Space が A（決定）、X/Esc が B（もどる）。スマホはタップと画面下のボタン。
 */
(function () {
  'use strict';
  const H = window.HOME;
  const A = H.art;
  const SW = A.SW, SH = A.SH, TS = A.TS;
  const FONT = '"DotGothic16", "IPAGothic", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", monospace';
  const BACK_KEY = 'ob-home-last'; // コンテンツから戻ったとき、元の場面から始めるためのメモ

  const $ = (id) => document.getElementById(id);
  const cvs = $('home-screen');
  const wrap = $('home-wrap');
  if (!cvs || !cvs.getContext) return;
  const ctx = cvs.getContext('2d');
  const buf = A.cv(SW, SH);
  const b = buf.getContext('2d');

  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  let still = !!(mq && mq.matches);
  if (mq && mq.addEventListener) mq.addEventListener('change', () => { still = mq.matches; });

  A.build();
  const titleFrames = [A.titleBG(0), A.titleBG(1)];
  const mapFrames = [0, 1, 2, 3].map((p) => A.mapImage(H.MAP, p));

  const ITEM_BY_KEY = {};
  H.ITEMS.forEach((it) => { ITEM_BY_KEY[it.key] = it; });
  const MW = H.MAP[0].length, MH = H.MAP.length;
  const itemAt = (x, y) => ITEM_BY_KEY[(H.MAP[y] || '')[x]] || null;
  const terrainAt = (x, y) => H.TERRAIN[(H.MAP[y] || '')[x]] || '草地';
  const GAME_LIST = H.GAMES.concat([{ id: 'back', name: 'もどる', back: true, desc: 'モードえらびに もどる' }]);

  // ── 状態 ──────────────────────────────────────
  const S = {
    scene: 'title', t: 0, st: 0,
    mode: 0, game: 0,
    cur: { x: H.MAP_START.x, y: H.MAP_START.y },
    curPx: { x: H.MAP_START.x * TS, y: H.MAP_START.y * TS },
    msg: null, wipe: null, leaving: false, pushed: 0, titleMusic: false, nudge: 0,
    train: { x: 0, on: false, wait: 4 },
    cars: [{ x: -20, on: false, wait: 2, dir: 1 }, { x: SW + 20, on: false, wait: 5, dir: -1 }],
  };

  // 前にコンテンツへ行ったときの場面から始める（同じタブの中だけ）
  try {
    const last = JSON.parse(sessionStorage.getItem(BACK_KEY) || 'null');
    sessionStorage.removeItem(BACK_KEY);
    if (last && (last.scene === 'map' || last.scene === 'games' || last.scene === 'mode')) {
      S.scene = last.scene;
      S.mode = last.mode === 1 ? 1 : 0;
      S.game = Math.max(0, Math.min(GAME_LIST.length - 1, last.game | 0));
      if (last.x >= 0 && last.x < MW && last.y >= 0 && last.y < MH) {
        S.cur = { x: last.x, y: last.y };
        S.curPx = { x: last.x * TS, y: last.y * TS };
      }
    }
  } catch (e) { /* 読めなければタイトルから */ }

  // ── 画面の大きさ ─────────────────────────────────
  let k = 2; // 1 ドットを表の画面の何ピクセルにするか
  function layout() {
    const dpr = window.devicePixelRatio || 1;
    const top = $('home-top');
    const pad = $('home-pad');
    const keys = $('home-keys');
    const padH = pad && pad.offsetParent ? pad.offsetHeight : 0;
    const keysH = keys && keys.offsetParent ? keys.offsetHeight : 0;
    // 横向きのスマホ（css/home.css でボタンが画面の左右に来るとき）は、下に何も置かない
    const side = !!pad && getComputedStyle(pad).display === 'contents';
    const reserve = (top ? top.offsetHeight : 0) + (side ? 12 : padH + keysH + 28);
    const availW = Math.max(160, wrap.clientWidth);
    const availH = Math.max(200, window.innerHeight - reserve);
    let kk = Math.min(availW / SW, availH / SH) * dpr;
    // ふつうの画面では整数倍。高精細の画面では、少しでも大きく
    if (kk >= 1 && (dpr < 1.5 || Math.floor(kk) / kk >= 0.9)) kk = Math.floor(kk);
    const W = Math.max(SW / 2, Math.round(SW * kk));
    const Hh = Math.round((W * SH) / SW);
    if (cvs.width !== W || cvs.height !== Hh) {
      cvs.width = W;
      cvs.height = Hh;
    }
    cvs.style.width = W / dpr + 'px';
    cvs.style.height = Hh / dpr + 'px';
    k = W / SW;
  }
  window.addEventListener('resize', layout);

  // ── 文字（表の画面にあとから描く） ─────────────────────────
  const texts = [];
  function T(str, x, y, size, color, o) {
    texts.push({ str, x, y, size, color: A.C[color] || color, o: o || {} });
  }
  function font(size) {
    return Math.max(8, Math.round(size * k)) + 'px ' + FONT;
  }
  function measure(str, size) {
    ctx.font = font(size);
    return ctx.measureText(str).width / k;
  }
  function flushTexts() {
    ctx.textBaseline = 'top';
    const d = Math.max(1, Math.round(k * 0.75));
    for (const t of texts) {
      ctx.font = font(t.size);
      ctx.textAlign = t.o.align || 'left';
      const X = Math.round(t.x * k), Y = Math.round(t.y * k);
      if (t.o.edge) {
        // ドット絵ふうの、角ばったふちどり
        ctx.fillStyle = A.C[t.o.edge] || t.o.edge;
        for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d], [-d, -d], [d, d], [-d, d], [d, -d], [d * 2, d * 2]]) ctx.fillText(t.str, X + dx, Y + dy);
      }
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, X, Y);
    }
    texts.length = 0;
  }

  // ── 画面の配置（描くのと、タップの当たり判定で共通） ─────────────
  const LAY = {
    mode: { win: [60, 50, 136, 98], item: (i) => [66, 62 + i * 26, 124, 24] },
    games: { win: [24, 56, 208, 100], item: (i) => [30, 68 + i * 26, 196, 24] },
    desc: [8, 168, 240, 46],
    head: [72, 14, 112, 26],
    msg: [16, 72, 224, 76],
  };
  function infoBox() {
    return S.cur.y >= 8 ? [4, 1, 248, 33] : [4, SH - 33, 248, 32];
  }
  function backChip() {
    const [x, y, w] = infoBox();
    return [x + w - 58, y + 5, 50, 13];
  }
  const inside = (p, r) => p.x >= r[0] && p.y >= r[1] && p.x < r[0] + r[2] && p.y < r[1] + r[3];

  // ── 場面の切りかえ ────────────────────────────────
  function musicFor(scene) {
    if (scene === 'title') return S.titleMusic ? 'march' : null;
    return scene === 'map' ? 'map' : 'march';
  }
  function setScene(scene) {
    S.scene = scene;
    S.st = 0;
    S.nudge = 0;
    if (scene === 'map') S.curPx = { x: S.cur.x * TS, y: S.cur.y * TS };
    if (scene === 'title') S.pushed = 0;
    H.audio.music(musicFor(scene));
    announce();
  }
  function go(scene) {
    if (still) { setScene(scene); return; }
    S.wipe = { t: 0, dur: 0.18, close: true, then: () => setScene(scene) };
  }
  function remember() {
    try {
      sessionStorage.setItem(BACK_KEY, JSON.stringify({ scene: S.scene, mode: S.mode, game: S.game, x: S.cur.x, y: S.cur.y }));
    } catch (e) { /* 保存できなくても続ける */ }
  }
  // サイトの中のページへ移る
  function leave(href) {
    S.leaving = true;
    H.audio.sfx('enter');
    remember();
    const goNow = () => { window.location.href = href; };
    if (still) setTimeout(goNow, 120);
    else S.wipe = { t: 0, dur: 0.28, close: true, then: goNow, hold: true };
  }
  function message(lines) {
    S.msg = { lines, t: 0 };
    announce(lines.join(' '));
  }
  function closeMsg() {
    S.msg = null;
    H.audio.sfx('back');
    announce();
  }

  // 画面読み上げ用：いま選んでいるもの
  const live = $('home-live');
  let lastSaid = '';
  function announce(text) {
    if (!live) return;
    let s = text;
    if (!s) {
      if (S.scene === 'title') s = 'タイトル画面。A ボタンかタップで はじめる';
      else if (S.scene === 'mode') s = 'モード：' + H.MODES[S.mode].name;
      else if (S.scene === 'games') s = 'ゲーム：' + GAME_LIST[S.game].name;
      else {
        const it = itemAt(S.cur.x, S.cur.y);
        s = it ? it.name + '。' + it.desc : terrainAt(S.cur.x, S.cur.y);
      }
    }
    if (s !== lastSaid) { live.textContent = s; lastSaid = s; }
  }

  // ── ボタンを押したとき ──────────────────────────────
  function pushStart() {
    if (S.pushed) return;
    S.pushed = 0.001;
    S.titleMusic = true;
    H.audio.sfx('start');
    H.audio.music('march', 0.75);
  }
  function activate(it) {
    if (!it) {
      H.audio.sfx('buzz');
      S.nudge = 0.6;
      return;
    }
    leave(it.href);
  }
  // 下の投稿フォームへ（ページの中なので、画面は切りかえない）
  function toPost() {
    const sec = document.getElementById('post');
    if (!sec) return;
    sec.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    const first = sec.querySelector('input, textarea');
    if (first) setTimeout(() => first.focus({ preventScroll: true }), still ? 0 : 400);
    if (history.replaceState) history.replaceState(null, '', '#post');
  }
  const SCENES = {
    title: {
      input(btn) { if (btn === 'a') pushStart(); },
    },
    mode: {
      input(btn) {
        const n = H.MODES.length;
        if (btn === 'up' || btn === 'down') {
          S.mode = (S.mode + (btn === 'up' ? n - 1 : 1)) % n;
          H.audio.sfx('move');
        } else if (btn === 'a') {
          const m = H.MODES[S.mode];
          H.audio.sfx('ok');
          if (m.id === 'post') toPost();
          else go(m.id === 'game' ? 'games' : 'map');
        } else if (btn === 'b') {
          H.audio.sfx('back');
          go('title');
        }
      },
    },
    games: {
      input(btn) {
        const n = GAME_LIST.length;
        if (btn === 'up') { S.game = (S.game + n - 1) % n; H.audio.sfx('move'); }
        else if (btn === 'down') { S.game = (S.game + 1) % n; H.audio.sfx('move'); }
        else if (btn === 'b') { H.audio.sfx('back'); go('mode'); }
        else if (btn === 'a') {
          const g = GAME_LIST[S.game];
          if (g.back) { H.audio.sfx('back'); go('mode'); }
          else if (g.soon) { H.audio.sfx('buzz'); message([g.name + 'は じゅんびちゅう。', 'できあがるまで もう少し待ってね。']); }
          else leave(g.href);
        }
      },
    },
    map: {
      input(btn) {
        const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[btn];
        if (d) {
          moveCursor(S.cur.x + d[0], S.cur.y + d[1]);
        } else if (btn === 'a') {
          activate(itemAt(S.cur.x, S.cur.y));
        } else if (btn === 'b') {
          H.audio.sfx('back');
          go('mode');
        }
      },
    },
  };
  function moveCursor(x, y, quiet) {
    x = Math.max(0, Math.min(MW - 1, x));
    y = Math.max(0, Math.min(MH - 1, y));
    if (x === S.cur.x && y === S.cur.y) return;
    S.cur = { x, y };
    S.nudge = 0;
    if (still) S.curPx = { x: x * TS, y: y * TS };
    if (!quiet) H.audio.sfx('move');
    announce();
  }
  function act(btn) {
    if (S.wipe || S.leaving) return;
    if (S.msg) {
      if ((btn === 'a' || btn === 'b') && S.msg.t > 0.15) closeMsg();
      return;
    }
    SCENES[S.scene].input(btn);
  }

  // ── タップ・クリック ───────────────────────────────
  function toScreen(e) {
    const r = cvs.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * SW, y: ((e.clientY - r.top) / r.height) * SH };
  }
  function tap(p) {
    if (S.wipe || S.leaving) return;
    if (S.msg) { act('a'); return; }
    if (S.scene === 'title') { act('a'); return; }
    if (S.scene === 'mode') {
      for (let i = 0; i < H.MODES.length; i++) {
        if (inside(p, LAY.mode.item(i))) { S.mode = i; act('a'); return; }
      }
      return;
    }
    if (S.scene === 'games') {
      for (let i = 0; i < GAME_LIST.length; i++) {
        if (inside(p, LAY.games.item(i))) { S.game = i; act('a'); return; }
      }
      return;
    }
    // 地図
    if (inside(p, backChip())) { act('b'); return; }
    if (inside(p, infoBox())) { act('a'); return; }
    const tx = Math.floor(p.x / TS), ty = Math.floor(p.y / TS);
    const same = tx === S.cur.x && ty === S.cur.y;
    const it = itemAt(tx, ty);
    // 同じ旗をもう一度タップしたら入る（寮はどのマスでも同じ）
    if (same || (it && it === itemAt(S.cur.x, S.cur.y) && it.key === 'D')) {
      if (it) act('a');
      return;
    }
    moveCursor(tx, ty);
  }
  function hover(p) {
    if (S.wipe || S.leaving || S.msg) return;
    if (S.scene === 'mode') {
      for (let i = 0; i < H.MODES.length; i++) {
        if (inside(p, LAY.mode.item(i)) && S.mode !== i) { S.mode = i; H.audio.sfx('move'); announce(); }
      }
    } else if (S.scene === 'games') {
      for (let i = 0; i < GAME_LIST.length; i++) {
        if (inside(p, LAY.games.item(i)) && S.game !== i) { S.game = i; H.audio.sfx('move'); announce(); }
      }
    } else if (S.scene === 'map') {
      if (inside(p, infoBox())) return;
      moveCursor(Math.floor(p.x / TS), Math.floor(p.y / TS));
    }
  }
  cvs.addEventListener('click', (e) => {
    H.audio.unlock();
    tap(toScreen(e));
  });
  cvs.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') hover(toScreen(e));
  });

  // ── キーボード ──────────────────────────────────
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
    z: 'a', Z: 'a', Enter: 'a', ' ': 'a', x: 'b', X: 'b', Escape: 'b', Backspace: 'b',
  };
  const DIRS = ['up', 'down', 'left', 'right'];
  const held = { list: [], t: 0, next: 0 };
  function pressDir(d, src) {
    held.list = held.list.filter((h) => h.src !== src);
    held.list.push({ d, src });
    held.t = 0;
    held.next = 0.26;
    act(d);
  }
  function releaseDir(src) {
    held.list = held.list.filter((h) => h.src !== src);
    held.t = 0;
    held.next = 0.26;
  }
  // 画面が半分以上見えているときだけ、キーを使う（下の一覧まで送ったら、矢印やスペースでページを動かせるように）
  function screenInView() {
    const r = cvs.getBoundingClientRect();
    return Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0) >= r.height / 2;
  }
  function ourKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !screenInView()) return false;
    const t = e.target;
    if (!t || t === document.body || t === document.documentElement || t === cvs) return true;
    return !!(t.closest && t.closest('#home-pad'));
  }
  window.addEventListener('keydown', (e) => {
    const btn = KEYS[e.key];
    if (!btn || !ourKey(e)) return;
    e.preventDefault();
    H.audio.unlock();
    if (e.repeat) return;
    if (DIRS.includes(btn)) pressDir(btn, 'key:' + e.code);
    else act(btn);
  });
  window.addEventListener('keyup', (e) => releaseDir('key:' + e.code));
  window.addEventListener('blur', () => { held.list = []; });

  // ── 画面の下のボタン（スマホ） ──────────────────────────
  const dpad = $('home-dpad');
  if (dpad) {
    const dirOf = (e) => {
      const r = dpad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
      if (Math.abs(dx) < r.width * 0.12 && Math.abs(dy) < r.height * 0.12) return null;
      return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    };
    const show = (d) => { dpad.dataset.dir = d || ''; };
    dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { dpad.setPointerCapture(e.pointerId); } catch (err) { /* なくても動く */ }
      const d = dirOf(e);
      show(d);
      if (d) pressDir(d, 'pad');
    });
    dpad.addEventListener('pointermove', (e) => {
      if (!dpad.dataset.dir && e.buttons === 0) return;
      const d = dirOf(e);
      const now = held.list.find((h) => h.src === 'pad');
      if (d && (!now || now.d !== d)) { show(d); pressDir(d, 'pad'); }
    });
    const up = () => { show(null); releaseDir('pad'); };
    dpad.addEventListener('pointerup', up);
    dpad.addEventListener('pointercancel', up);
    dpad.addEventListener('lostpointercapture', up);
  }
  for (const [id, btn] of [['home-btn-a', 'a'], ['home-btn-b', 'b']]) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      H.audio.unlock();
      act(btn);
    });
  }

  // ── 音のオン・オフ ────────────────────────────────
  const soundBtn = $('home-sound');
  function showSound() {
    if (!soundBtn) return;
    const on = H.audio.isOn();
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.textContent = on ? '♪ 音 ON' : '♪ 音 OFF';
  }
  if (soundBtn) {
    soundBtn.addEventListener('click', (e) => {
      H.audio.unlock();
      const on = !H.audio.isOn();
      if (on && S.scene === 'title') S.titleMusic = true;
      H.audio.setOn(on);
      H.audio.music(musicFor(S.scene));
      if (on) H.audio.sfx('ok');
      showSound();
      if (e.detail > 0) soundBtn.blur(); // マウスで押したあとも、矢印キーで動かせるように
    });
  }
  showSound();
  // 最初の操作で音を出せるようにする
  for (const ev of ['pointerup', 'touchend']) window.addEventListener(ev, () => H.audio.unlock(), { capture: true, passive: true });

  // ── うごき ───────────────────────────────────────
  function update(dt) {
    S.t += dt;
    S.st += dt;
    if (S.msg) S.msg.t += dt;
    if (S.nudge > 0) S.nudge = Math.max(0, S.nudge - dt);
    // 押しっぱなしの十字キー
    const h = held.list[held.list.length - 1];
    if (h) {
      held.t += dt;
      if (held.t >= held.next) { act(h.d); held.next += S.scene === 'map' ? 0.085 : 0.16; }
    }
    // 画面の切りかえ
    if (S.wipe) {
      S.wipe.t += dt;
      if (S.wipe.t >= S.wipe.dur) {
        if (S.wipe.close) {
          const then = S.wipe.then;
          // hold：閉じたまま止める（ページを移るとき）
          if (S.wipe.hold) { S.wipe.t = S.wipe.dur; if (!S.wipe.fired) { S.wipe.fired = true; then(); } }
          else { S.wipe = { t: 0, dur: S.wipe.dur, close: false }; then(); }
        } else S.wipe = null;
      }
    }
    // PUSH START のあと
    if (S.pushed) {
      S.pushed += dt;
      if (S.pushed > (still ? 0.25 : 0.7) && S.scene === 'title' && !S.wipe) { S.pushed = 0; go('mode'); }
    }
    // カーソルをすべらせる
    const tx = S.cur.x * TS, ty = S.cur.y * TS;
    const sp = 300 * dt;
    S.curPx.x += Math.max(-sp, Math.min(sp, tx - S.curPx.x));
    S.curPx.y += Math.max(-sp, Math.min(sp, ty - S.curPx.y));
    // 電車と車
    if (!still && S.scene !== 'title') {
      const tr = S.train;
      if (tr.on) { tr.x -= 46 * dt; if (tr.x < -140) { tr.on = false; tr.wait = 9 + Math.random() * 8; } }
      else if ((tr.wait -= dt) <= 0) { tr.on = true; tr.x = SW + 8; }
      for (const c of S.cars) {
        if (c.on) {
          c.x += c.dir * 40 * dt;
          if (c.x > SW + 20 || c.x < -20) { c.on = false; c.wait = 3 + Math.random() * 6; }
        } else if ((c.wait -= dt) <= 0) { c.on = true; c.x = c.dir > 0 ? -18 : SW + 2; }
      }
    }
  }

  // ── 描く ───────────────────────────────────────
  const blinkOn = (rate) => still || Math.floor(S.t * rate) % 2 === 0;

  function drawTitle() {
    b.drawImage(titleFrames[still ? 0 : Math.floor(S.t * 2.5) % 2], 0, 0);
    A.stars(b, S.t, still);
    const L1 = A.S.logo1, L2 = A.S.logo2;
    b.drawImage(L1, Math.round((SW - L1.width) / 2) + 1, 7);
    const l2x = Math.round((SW - L2.width) / 2);
    b.drawImage(L2, l2x, 79);
    // OB会 の両わきの線と星
    for (const side of [-1, 1]) {
      const x0 = side < 0 ? l2x - 38 : l2x + L2.width + 4;
      A.R(b, x0, 95, 34, 3, 'K');
      A.R(b, x0 + 1, 96, 32, 1, 'Y');
      const sx = side < 0 ? x0 - 6 : x0 + 39;
      A.R(b, sx - 1, 93, 3, 7, 'K');
      A.R(b, sx - 3, 95, 7, 3, 'K');
      A.R(b, sx, 94, 1, 5, 'Y');
      A.R(b, sx - 2, 96, 5, 1, 'Y');
    }
    // OB会 のすぐ下（寮の影絵の屋根に かからない高さ）
    T('横浜市立大学 男子寮　1970―2010', SW / 2, 113, 8, 'c', { align: 'center', edge: 'K' });
    // PUSH START（押したあとは速く点滅）
    const fast = S.pushed > 0;
    if (fast ? (still || Math.floor(S.t * 12) % 2 === 0) : blinkOn(1.6)) {
      T('PUSH START', SW / 2 + 6, 133, 11, 'W', { align: 'center', edge: 'K' });
    }
    drawTroops();
    T('※ 出てくる事件やゲームは、すべてフィクションです', SW / 2, 209, 7, 'w', { align: 'center' });
  }
  function drawTroops() {
    const beat = 60 / 132 / 2;
    const f = still ? 1 : Math.floor(S.t / beat) % 2;
    const gap = 22;
    const n = 7;
    const span = SW + n * gap + 20;
    const head = still ? Math.round((SW + (n - 1) * gap) / 2) : ((S.t * 20 + 200) % span) - 20;
    const cols = ['b', 'R', 'G', 'Y', 'u'];
    const y = 184;
    for (let i = 0; i < n; i++) {
      let x = Math.round(head - i * gap);
      if (!still && x < -24) x += span;
      if (x > SW + 4 || x < -20) continue;
      const bob = f === 0 ? -1 : 0;
      if (i === 0) b.drawImage(A.S.bearer[f], x, y - 4 + bob);
      else if (i === 1) b.drawImage(A.S.drummer[f], x, y + bob);
      else b.drawImage(A.S.troops[cols[(i - 2) % cols.length]][f], x, y + bob);
    }
  }

  function drawMapBase() {
    const ph = still ? 0 : Math.floor(S.t * 3) % 4;
    b.drawImage(mapFrames[ph], 0, 0);
    if (still) return;
    // 川のカモ
    for (let i = 0; i < 2; i++) {
      const x = Math.round(40 + i * 110 + Math.sin(S.t * 0.4 + i * 2) * 26);
      const y = 22 + i * 9 + (Math.floor(S.t * 2 + i) % 2);
      b.drawImage(A.S.duck, x, y);
    }
    // 車
    S.cars.forEach((c, i) => {
      if (!c.on) return;
      const y = i === 0 ? 147 : 165;
      if (c.dir > 0) b.drawImage(A.S.carR, Math.round(c.x), y);
      else {
        b.save();
        b.scale(-1, 1);
        b.drawImage(A.S.carB, -Math.round(c.x) - 16, y);
        b.restore();
      }
    });
    if (S.train.on) A.train(b, Math.round(S.train.x), 210, 3);
  }
  function header(text) {
    const [x, y, w, h] = LAY.head;
    A.win(b, x, y, w, h);
    T(text, x + w / 2, y + 7, 11, 'Y', { align: 'center' });
  }
  function descBox(lines) {
    const [x, y, w, h] = LAY.desc;
    A.win(b, x, y, w, h);
    lines.forEach((s, i) => T(s, x + 12, y + 10 + i * 14, 9, 'W'));
  }
  function drawMode() {
    drawMapBase();
    header('夕照寮OB会');
    const [x, y, w, h] = LAY.mode.win;
    A.win(b, x, y, w, h);
    H.MODES.forEach((m, i) => {
      const r = LAY.mode.item(i);
      if (i === S.mode && blinkOn(3)) A.arrow(b, r[0] + 8, r[1] + 8);
      T(m.name, r[0] + 22, r[1] + 5, 13, i === S.mode ? 'W' : 'w');
    });
    const m = H.MODES[S.mode];
    descBox([m.name, m.desc]);
  }
  function drawGames() {
    drawMapBase();
    header('ゲーム');
    const [x, y, w, h] = LAY.games.win;
    A.win(b, x, y, w, h);
    GAME_LIST.forEach((g, i) => {
      const r = LAY.games.item(i);
      if (i === S.game && blinkOn(3)) A.arrow(b, r[0] + 8, r[1] + 8);
      const col = g.soon ? 'g' : i === S.game ? 'W' : 'w';
      T(g.name, r[0] + 22, r[1] + 6, 11, g.soon && i === S.game ? 'w' : col);
      if (g.soon) {
        const tw = measure(g.name, 11);
        const bx = Math.round(r[0] + 22 + tw + 5);
        A.R(b, bx, r[1] + 6, 58, 13, 'Y');
        A.R(b, bx + 1, r[1] + 7, 56, 11, 'K');
        T('じゅんびちゅう', bx + 29, r[1] + 8, 7, 'Y', { align: 'center' });
      }
    });
    const g = GAME_LIST[S.game];
    descBox([g.name, g.desc]);
  }
  function drawMap() {
    drawMapBase();
    // カーソル
    const grow = still ? 0 : Math.floor(S.t * 3.2) % 2;
    A.mapCursor(b, Math.round(S.curPx.x), Math.round(S.curPx.y), grow);
    // 説明のウインドウ
    const [x, y, w, h] = infoBox();
    A.win(b, x, y, w, h);
    const it = itemAt(S.cur.x, S.cur.y);
    if (it) {
      T(it.name, x + 10, y + 5, 10, 'Y');
      const nw = measure(it.name, 10);
      if (blinkOn(1.6)) T('Ａ：みる', x + 16 + nw, y + 6, 8, 'S');
      T(it.desc, x + 10, y + 18, 8.5, 'W');
    } else {
      T(terrainAt(S.cur.x, S.cur.y), x + 10, y + 5, 10, 'W');
      T(H.TERRAIN_HINT, x + 10, y + 18, 8.5, S.nudge > 0 && Math.floor(S.nudge * 10) % 2 ? 'Y' : 'S');
    }
    // もどるボタン
    const [cx, cy, cw, ch] = backChip();
    A.R(b, cx, cy, cw, ch, 'W');
    A.R(b, cx + 1, cy + 1, cw - 2, ch - 2, 'B');
    T('Ｂ もどる', cx + cw / 2, cy + 2.5, 8, 'W', { align: 'center' });
  }
  function drawMsg() {
    const [x, y, w, h] = LAY.msg;
    A.win(b, x, y, w, h);
    S.msg.lines.forEach((s, i) => T(s, x + 14, y + 14 + i * 18, 10, 'W'));
    if (blinkOn(2.5)) A.downMark(b, x + w - 18, y + h - 14);
  }
  function drawWipe() {
    if (!S.wipe) return;
    let p = Math.min(1, S.wipe.t / S.wipe.dur);
    if (!S.wipe.close) p = 1 - p;
    // 上と下から閉じる、ブラインドのような切りかえ
    const rows = 8;
    const band = cvs.height / rows;
    ctx.fillStyle = '#000';
    for (let i = 0; i < rows; i++) ctx.fillRect(0, Math.floor(i * band), cvs.width, Math.ceil(band * p) + 1);
  }

  // 裏の画面の絵と、ためた文字を、表の画面に重ねる（ウインドウごとに重ねれば、下の文字を隠せる）
  function layer() {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, cvs.width, cvs.height);
    flushTexts();
    b.clearRect(0, 0, SW, SH);
  }
  function render() {
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    b.clearRect(0, 0, SW, SH);
    if (S.scene === 'title') drawTitle();
    else if (S.scene === 'mode') drawMode();
    else if (S.scene === 'games') drawGames();
    else drawMap();
    layer();
    if (S.msg) {
      drawMsg();
      layer();
    }
    drawWipe();
  }

  let lastT = 0;
  function frame(now) {
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
    lastT = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ほかのページから「戻る」で帰ってきたとき（ページがそのまま残っている場合）
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    S.wipe = null;
    S.leaving = false;
    held.list = [];
    try { sessionStorage.removeItem(BACK_KEY); } catch (err) { /* なにもしない */ }
    H.audio.resume();
  });
  window.addEventListener('pagehide', () => H.audio.pause());

  // テストや、ほかのスクリプトから様子を見るため（当たり判定の位置も）
  H.state = S;
  H.press = act;
  H.hit = { LAY, infoBox, backChip, GAME_LIST };

  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout).catch(() => {});
  setScene(S.scene);
  requestAnimationFrame(frame);
})();
