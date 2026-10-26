/*
 * 男魂くんの1年 ― タイトル・1年の進行・練習モード・エンディング
 *  場面（scene）を順に切りかえていく。ミニゲームの中身は js/otoko/games/*.js
 *  進み具合は localStorage 'otk-save' に { step, clear, good, bad } で覚える
 *    step：1年のうち、次に遊ぶミニゲームの番号（0 から）
 *  1年の流れ：はじまりの寸劇 → カレンダー → 前ふりの寸劇 → 説明 → 3・2・1 → ミニゲーム → 結果 →（勝ったあとの寸劇）→ 次の月…
 *    寸劇（ミニゲームの間の短いお話）の台本は js/otoko/scenes.js、動かすしくみは js/otoko/story.js
 *  テスト用：game/?play=<id> でそのミニゲームだけ遊べる。?skit=<id> でその寸劇から、?noskit=1 で寸劇なし（くわしくは docs/site/ENGINE.md）
 */
(function () {
  'use strict';
  const OTK = window.OTK;
  const W = OTK.W, H = OTK.H, P = OTK.P, g = OTK.g, input = OTK.input, audio = OTK.audio;
  const R = g.R;
  const SAVE_KEY = 'otk-save';
  const params = new URLSearchParams(location.search);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── セーブ ──────────────────────────────────────
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && typeof s === 'object') return { step: Math.max(0, s.step | 0), clear: s.clear && typeof s.clear === 'object' ? s.clear : {}, good: s.good | 0, bad: s.bad | 0 };
    } catch (e) { /* こわれていたら最初から */ }
    return { step: 0, clear: {}, good: 0, bad: 0 };
  }
  let save = loadSave();
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* 保存できなくても遊べる */ }
  }
  const games = () => OTK.list();
  const total = () => games().length;
  const clearedCount = () => games().filter((d) => save.clear[d.id]).length;

  // ── 音のボタン ───────────────────────────────────
  const sndBtn = document.getElementById('otk-sound');
  function syncSound() {
    if (!sndBtn) return;
    sndBtn.textContent = audio.on ? '音 ON' : '音 OFF';
    sndBtn.setAttribute('aria-pressed', audio.on ? 'true' : 'false');
  }
  if (sndBtn) {
    sndBtn.addEventListener('click', (e) => {
      audio.unlock();
      audio.toggle();
      if (e.detail > 0) sndBtn.blur(); // マウスで押したあと、スペースキーがボタンに取られないように
    });
  }
  audio.onChange(syncSound);
  syncSound();

  // ── 場面の切りかえ（暗転つき） ───────────────────────────
  const D = { cur: null, next: null, fade: 0, dir: 0 };
  let curRun = null;
  function switchTo(s) {
    if (D.cur && D.cur.leave) D.cur.leave();
    D.cur = s;
    s.t = 0;
    input.flush();
    if (s.enter) s.enter();
  }
  function go(s, o) {
    if (!D.cur || (o && o.instant) || reduceMotion) {
      D.next = null;
      D.dir = 0;
      D.fade = 0;
      switchTo(s);
      return;
    }
    D.next = s;
    D.dir = 1;
  }
  const director = {
    update(dt) {
      if (D.dir === 1) {
        D.fade += dt / 0.2;
        if (D.fade >= 1) {
          D.fade = 1;
          D.dir = -1;
          switchTo(D.next);
          D.next = null;
        }
        return;
      }
      if (D.dir === -1) {
        D.fade -= dt / 0.2;
        if (D.fade <= 0) { D.fade = 0; D.dir = 0; }
      }
      if (D.cur) {
        D.cur.t += dt;
        D.cur.update(dt);
      }
    },
    draw() {
      if (D.cur) D.cur.draw();
      if (D.fade > 0) {
        // ファミコンらしく、3 段階で暗くする
        const lv = Math.ceil(D.fade * 3);
        g.ctx.save();
        g.ctx.globalAlpha = [0, 0.4, 0.75, 1][lv];
        R(0, 0, W, H, P.black);
        g.ctx.restore();
      }
    },
  };

  // ── 小物 ─────────────────────────────────────────
  function drawLogo(y) {
    const a = '男魂', b = 'くんの1年';
    const wa = g.measure(a, 32), wb = g.measure(b, 32);
    const x0 = Math.round(W / 2 - (wa + wb) / 2);
    g.big(a, x0, y, { col: P.red, shade: P.xdred });
    g.big(b, x0 + wa, y, { col: P.yellow, shade: P.brown });
  }
  // 男魂くんが歩くコマ（正面・後ろは 4 コマで、2 歩目は左右反転）
  function hero(x, y, dir, t, o) {
    o = o || {};
    const k = o.still ? 0 : Math.floor(t * (o.fps || 6)) % 4;
    const side = dir === 'left' || dir === 'right';
    const frame = k % 2;
    const flip = !side && k === 3;
    g.sprite(OTK.person(o.kind || 'otoko', { dir, frame, variant: o.variant, naked: o.naked }), x, y, { scale: o.scale || 1, flip });
  }
  // 文字送り
  function Typer(pages, cps) {
    return {
      pages, i: 0, n: 0, cps: cps || 26, lastSfx: 0,
      get text() { return this.pages[this.i] || ''; },
      get full() { return this.n >= [...this.text].length; },
      get last() { return this.i >= this.pages.length - 1; },
      update(dt) {
        if (this.full) return;
        this.n += dt * this.cps;
        if (Math.floor(this.n / 2) !== this.lastSfx) { this.lastSfx = Math.floor(this.n / 2); audio.sfx('text'); }
      },
      // A を押したとき：表示しきっていなければ全部出す。出しきっていれば次へ（最後なら true）
      advance() {
        if (!this.full) { this.n = 999; return false; }
        if (this.last) return true;
        this.i++;
        this.n = 0;
        return false;
      },
      draw(x, y, w, o) {
        o = o || {};
        const size = o.size || 16;
        const shown = [...this.text].slice(0, Math.floor(this.n)).join('');
        const all = g.wrap(this.text, w, size);
        // 全文で折り返し位置を決めてから、見えている分だけ出す（途中で行が変わらないように）
        let left = [...shown].filter((c) => c !== '\n').length;
        all.forEach((line, i) => {
          const chars = [...line];
          const part = chars.slice(0, Math.max(0, left)).join('');
          left -= chars.length;
          if (part) g.text(part, x, y + i * (size + 5), { size, col: o.col || P.white });
        });
        if (this.full && g.blink(2) && !o.noArrow) g.text('▼', x + w - 6, y + ((o.lines || 2) - 1) * (size + 5) + 4, { size: 12, col: P.white });
      },
    };
  }
  function tapIn(tp, x, y, w, h) {
    return tp && tp.x >= x && tp.x < x + w && tp.y >= y && tp.y < y + h;
  }

  // ── 背景 ────────────────────────────────────────
  function sky(bands, y0, bh) {
    bands.forEach((c, i) => R(0, y0 + i * bh, W, bh, c));
    for (let i = 1; i < bands.length; i++) {
      g.dither(0, y0 + i * bh - 2, W, 2, bands[i], 0);
      g.dither(0, y0 + i * bh, W, 1, bands[i - 1], 1);
    }
  }
  // 寮の建物（正面）。o: { wall, shade, win, lit, roof, door }
  function dorm(x, y, o) {
    const w = 200, fh = 17;
    // 塔屋と高架水槽
    R(x + 120, y - 16, 34, 20, o.roof);
    R(x + 124, y - 26, 26, 12, o.tank || o.roof);
    R(x + 124, y - 26, 26, 1, o.hi || o.wall);
    R(x + 70, y - 12, 1, 14, o.shade);
    R(x + 66, y - 10, 9, 1, o.shade);
    R(x + 67, y - 6, 7, 1, o.shade);
    R(x, y, w, 5, o.roof);
    R(x, y + 5, w, fh * 3, o.wall);
    R(x, y + 4, w, 1, o.hi || o.wall);
    for (let f = 0; f < 3; f++) {
      R(x, y + 5 + f * fh + fh - 2, w, 2, o.shade);
      for (let i = 0; i < 14; i++) {
        const wx = x + 5 + i * 14, wy = y + 5 + f * fh + 3;
        if (f === 2 && (i === 6 || i === 7)) continue;
        const lit = o.lit && (i * 7 + f * 11 + 3) % 5 < 2;
        R(wx, wy, 9, 10, lit ? o.lit : o.win);
        R(wx, wy + 5, 9, 1, o.shade);
        R(wx + 4, wy, 1, 10, o.shade);
      }
    }
    // 玄関
    R(x + 88, y + 5 + fh * 2 + 2, 24, fh - 2, o.door || o.shade);
    R(x + 86, y + 5 + fh * 2, 28, 2, o.roof);
    R(x + 99, y + 5 + fh * 2 + 3, 2, fh - 4, o.shade);
  }
  function stars(t, n, yMax) {
    for (let i = 0; i < n; i++) {
      const sx = (i * 73 + 11) % W, sy = (i * 37 + 5) % yMax;
      if ((Math.floor(t * 2 + i * 0.7) % 5) !== 0) R(sx, sy, 1, 1, i % 3 ? P.white : P.lyellow);
    }
  }
  // 夕焼けの寮（タイトル・メニュー）
  function drawSunset(t) {
    sky(['#0d0b26', '#1c1450', '#3c1c6c', '#6c2c7c', '#a83c6c', '#e45c4c', '#f88c3c', '#f8b850'], 0, 20);
    stars(t, 28, 50);
    // 夕日（横じまで切れている）
    const sx = 196, sy = 120;
    g.disc(sx, sy, 24, '#fce0a8');
    g.disc(sx, sy, 20, '#fcd078');
    for (let i = 0; i < 4; i++) R(sx - 26, sy + 6 + i * 5, 52, 1 + (i >> 1), ['#f88c3c', '#e45c4c', '#e45c4c', '#a83c6c'][i]);
    dorm(28, 104, { wall: '#3a2050', shade: '#24123a', roof: '#2a163e', win: '#1a0c2c', lit: '#f8d878', hi: '#5c3870', door: '#f8b850', tank: '#30184a' });
    // 地面と道
    R(0, 160, W, H - 160, '#1a1024');
    R(0, 160, W, 1, '#3c2448');
    g.dither(0, 161, W, 2, '#3c2448', 0);
    for (let i = 0; i < 9; i++) R(((i * 32 - Math.floor(t * 8)) % 288 + 288) % 288 - 16, 190, 14, 2, '#3c2448');
  }
  // 春の昼の寮（はじまりの話・よいエンディング）
  function drawSpring(t, o) {
    o = o || {};
    sky(['#3cbcfc', '#5cc8fc', '#80d4fc', '#a4e4fc'], 0, 34);
    // 雲
    for (let i = 0; i < 3; i++) {
      const cx = ((i * 97 + t * 6) % 300) - 30, cy = 20 + i * 14;
      g.oval(cx, cy, 16, 5, P.white);
      g.oval(cx + 10, cy - 3, 10, 5, P.white);
    }
    dorm(28, 72, { wall: '#e8dcc0', shade: '#b8a888', roof: '#a89c84', win: '#5c7c9c', lit: null, hi: '#fcf4dc', door: '#6c5c4c', tank: '#c8d0d4' });
    R(0, 128, W, H - 128, '#8c8c84');
    R(0, 128, W, 2, '#b8b8ac');
    R(0, 178, W, H - 178, '#6c6c64');
    for (let i = 0; i < 8; i++) R(i * 36 + 6, 200, 18, 2, '#e8e8e0');
    // 桜
    for (const [cx, cy] of [[14, 100], [242, 96]]) {
      R(cx - 2, cy + 6, 5, 26, '#6c4430');
      g.oval(cx, cy, 22, 14, '#f8b8d0');
      g.oval(cx - 8, cy - 6, 12, 8, '#fcd0e0');
      g.dither(cx - 18, cy + 2, 36, 6, '#e890b0', 0);
    }
    if (!o.noPetals) {
      for (let i = 0; i < 16; i++) {
        const px = ((i * 53 + t * 18 + Math.sin(t + i) * 10) % 270) - 6;
        const py = ((i * 41 + t * 22) % 210) + 6;
        R(px, py, 2, 1, '#fcd0e0');
      }
    }
  }
  // 雨の夕暮れ（わるいエンディング）
  function drawRain(t) {
    sky(['#1c1c2c', '#24243c', '#2c2c48', '#383854'], 0, 36);
    dorm(28, 80, { wall: '#3c3c50', shade: '#2c2c3c', roof: '#303044', win: '#202030', lit: '#8c7c48', hi: '#4c4c60', door: '#2c2c3c', tank: '#34344a' });
    R(0, 136, W, H - 136, '#24242c');
    R(0, 136, W, 1, '#4c4c5c');
    for (let i = 0; i < 6; i++) g.oval(30 + i * 40, 170 + (i % 2) * 14, 12, 2, '#3c3c50');
    g.ctx.save();
    g.ctx.globalAlpha = 0.7;
    for (let i = 0; i < 60; i++) {
      const rx = ((i * 47 + t * 40) % 280) - 12;
      const ry = ((i * 29 + t * 260) % 240) - 12;
      R(rx, ry, 1, 5, '#8c9cbc');
    }
    g.ctx.restore();
  }
  const SEASON = {
    4: ['#f8b8d0', '#fcd8e4'], 6: ['#5c7c9c', '#8ca8c0'], 7: ['#3cbcfc', '#a4e4fc'], 9: ['#f8a040', '#fcd090'],
    10: ['#a85c30', '#d8905c'], 11: ['#c87c3c', '#e8b070'], 2: ['#3c5c9c', '#a4c4e4'], 3: ['#f8c8d8', '#fce4ec'],
  };
  const FLAVOR = {
    nomu: '桜がさいている。新歓の季節だ。', nise: '新歓は、まだ終わらない。', gyudon: 'つゆ。金がない。', deisui: '夏。夜は長い。',
    conveni: 'まだ夏休み。暑い。', zombie: '秋。キノコの季節。', gakusai: '学祭の季節。', setsubun: 'さむい。豆がある。服はない。',
    kippu: '別れの季節。', unko: '追いコンの夜は、つづく。',
  };

  // ── タイトル ─────────────────────────────────────
  function Title() {
    return {
      name: 'title',
      enter() { audio.bgm('title'); },
      update() {
        if (input.ok()) {
          audio.unlock();
          audio.bgm('title');
          audio.sfx('ok');
          go(Menu());
        }
      },
      draw() {
        drawSunset(this.t);
        g.text('夕照寮 寮生ミニゲーム集', W / 2, 8, { align: 'center', col: P.lyellow, outline: P.night });
        drawLogo(30);
        if (save.good > 0) g.text('★ 1年を' + save.good + '回のりきった', W / 2, 74, { size: 12, align: 'center', col: P.yellow, outline: P.night });
        // 男魂くん（大きく）
        const bob = Math.floor(this.t * 2) % 2;
        hero(20, 140 - bob, 'down', this.t, { scale: 2, still: true });
        g.sprite(OTK.person('senpai', { dir: 'left', variant: 1 }), 214, 140);
        g.sprite(OTK.person('douki', { dir: 'left', variant: 2 }), 230, 142);
        if (g.blink(1.1)) g.text('PUSH START', W / 2, 176, { align: 'center', col: P.white, outline: P.black });
        g.text('※すべてフィクションです。', W / 2, 202, { align: 'center', col: P.gray });
      },
    };
  }

  // ── メニュー ─────────────────────────────────────
  function Menu(sel) {
    // step が total() と同じ ＝ 10 本目をクリアして、エンディングを見る前に閉じた。つづきからでエンディングへ
    const canCont = () => save.step > 0 && save.step <= total();
    const items = [
      { id: 'new', label: '1年をはじめる' },
      { id: 'cont', label: 'つづきから' },
      { id: 'prac', label: 'れんしゅう' },
      { id: 'yakyu', label: '男魂野球大会' },
      { id: 'home', label: 'ホームへもどる' },
    ];
    const enabled = (it) => it.id !== 'cont' || canCont();
    let cur = sel != null ? sel : canCont() ? 1 : 0;
    let popup = null; // { lines, confirm }
    const BX = 34, BY = 70, BW = 188, RH = 22;
    function choose(it) {
      if (!enabled(it)) { audio.sfx('ng'); return; }
      if (it.id === 'new') {
        if (canCont()) { popup = { lines: ['はじめからにする？', 'つづきの記録は消える。'], confirm: true }; audio.sfx('select'); return; }
        startStory();
      } else if (it.id === 'cont') {
        audio.sfx('ok');
        go(save.step >= total() ? withSkit('ending', GoodEnd) : Calendar(save.step));
      } else if (it.id === 'prac') {
        audio.sfx('ok');
        go(Practice());
      } else if (it.id === 'yakyu') {
        audio.sfx('ng');
        popup = { lines: ['男魂野球大会は', 'じゅんびちゅう。', 'もうしばらく待ってね。'] };
      } else if (it.id === 'home') {
        audio.sfx('ok');
        go({ name: 'leave', update() {}, draw() { R(0, 0, W, H, P.black); } });
        setTimeout(() => { location.href = '../'; }, 260);
      }
    }
    function startStory() {
      audio.sfx('ok');
      save.step = 0;
      writeSave();
      go(withSkit('opening', () => Calendar(0)));
    }
    return {
      name: 'menu',
      enter() { audio.bgm('title'); },
      update() {
        if (popup) {
          if (popup.confirm) {
            const ans = popupAnswer(popup, input.tap);
            if (input.pressed('a') || ans === 'yes') { popup = null; startStory(); }
            else if (input.back() || ans === 'no') { popup = null; audio.sfx('cancel'); }
          } else if (input.any()) { popup = null; audio.sfx('cancel'); }
          return;
        }
        if (input.repeat('down')) { cur = (cur + 1) % items.length; audio.sfx('cursor'); }
        if (input.repeat('up')) { cur = (cur + items.length - 1) % items.length; audio.sfx('cursor'); }
        const tp = input.tap;
        if (tp) {
          const i = Math.floor((tp.y - BY - 10) / RH);
          if (i >= 0 && i < items.length && tapIn(tp, BX, BY, BW, 10 + items.length * RH + 10)) { cur = i; choose(items[i]); }
          return;
        }
        if (input.pressed('a') || input.pressed('pause')) choose(items[cur]);
        else if (input.back()) { audio.sfx('cancel'); go(Title()); }
      },
      draw() {
        drawSunset(this.t);
        g.ctx.save();
        g.ctx.globalAlpha = 0.35;
        R(0, 0, W, H, P.black);
        g.ctx.restore();
        drawLogo(18);
        g.box(BX, BY, BW, items.length * RH + 20);
        items.forEach((it, i) => {
          const y = BY + 12 + i * RH;
          const on = enabled(it);
          g.text(it.label, BX + 28, y, { col: on ? P.white : P.dgray });
          if (it.id === 'cont' && canCont()) {
            const d = games()[save.step];
            g.text(d ? d.month + '月から' : 'エンド', BX + BW - 12, y + 3, { size: 12, align: 'right', col: P.lsky });
          }
          if (it.id === 'yakyu') g.text('準備中', BX + BW - 12, y + 3, { size: 12, align: 'right', col: P.dgray });
          if (it.id === 'prac') g.text('★' + clearedCount() + '/' + total(), BX + BW - 12, y + 3, { size: 12, align: 'right', col: P.yellow });
          if (i === cur) g.text('▶', BX + 10 + (g.blink(2) ? 0 : 2), y, { col: P.white });
        });
        g.text('A：決定　B：もどる', W / 2, 208, { size: 12, align: 'center', col: P.gray, outline: P.black });
        if (popup) drawPopup(popup);
      },
    };
  }
  function popupBox(pp) {
    const h = pp.lines.length * 20 + (pp.confirm ? 40 : 28);
    return { x: 24, y: Math.round(H / 2 - h / 2), w: W - 48, h };
  }
  function drawPopup(pp) {
    const b = popupBox(pp);
    g.box(b.x, b.y, b.w, b.h, { fill: P.navy });
    pp.lines.forEach((l, i) => g.text(l, W / 2, b.y + 12 + i * 20, { align: 'center' }));
    if (pp.confirm) {
      g.text('A：はい', W / 2 - 12, b.y + b.h - 24, { align: 'right', col: P.lyellow });
      g.text('B：いいえ', W / 2 + 12, b.y + b.h - 24, { col: P.lyellow });
    } else if (g.blink(2)) g.text('▼', W / 2, b.y + b.h - 16, { size: 12, align: 'center' });
  }
  // 確認のポップアップをタップしたとき：下の段の左が「はい」、右が「いいえ」。ウインドウの外は「いいえ」
  function popupAnswer(pp, tp) {
    if (!tp) return null;
    const b = popupBox(pp);
    if (!tapIn(tp, b.x, b.y, b.w, b.h)) return 'no';
    if (tp.y < b.y + b.h - 32) return null;
    return tp.x < W / 2 ? 'yes' : 'no';
  }

  // ── 練習モード（好きなミニゲームを 1 本ずつ） ──────────────────
  function Practice(selId) {
    const list = games();
    let cur = Math.max(0, list.findIndex((d) => d.id === selId));
    const Y0 = 34, RH = 16;
    function play(i) {
      audio.sfx('ok');
      go(Intro({ mode: 'practice', id: list[i].id, tries: 0 }));
    }
    return {
      name: 'practice',
      enter() { audio.bgm('menu'); },
      update() {
        if (input.repeat('down')) { cur = (cur + 1) % list.length; audio.sfx('cursor'); }
        if (input.repeat('up')) { cur = (cur + list.length - 1) % list.length; audio.sfx('cursor'); }
        const tp = input.tap;
        if (tp) {
          const i = Math.floor((tp.y - Y0 + 1) / RH);
          if (i >= 0 && i < list.length) { cur = i; play(i); }
          else if (tp.y >= 196) { audio.sfx('cancel'); go(Menu(2)); }
          return;
        }
        if (input.pressed('a') || input.pressed('pause')) play(cur);
        else if (input.back()) { audio.sfx('cancel'); go(Menu(2)); }
      },
      draw() {
        R(0, 0, W, H, P.night);
        g.box(2, 2, W - 4, H - 4);
        g.text('れんしゅう', 14, 13, { col: P.yellow });
        g.text('★ ' + clearedCount() + ' / ' + list.length, W - 14, 15, { size: 12, align: 'right', col: P.lyellow });
        R(10, 30, W - 20, 1, P.mblue);
        list.forEach((d, i) => {
          const y = Y0 + i * RH;
          if (i === cur) R(8, y - 1, W - 16, RH, P.mblue);
          const done = !!save.clear[d.id];
          g.text((d.month < 10 ? ' ' : '') + d.month + '月', 22, y, { col: i === cur ? P.white : P.lsky });
          const maxW = 160;
          const size = g.measure(d.title, 16) > maxW ? 12 : 16;
          g.text(d.title, 66, y + (size === 12 ? 2 : 0), { size, col: P.white });
          g.text(done ? '★' : '・', W - 22, y, { col: done ? P.yellow : P.dgray, align: 'center' });
          if (i === cur) g.text('▶', 10 + (g.blink(2) ? 0 : 1), y + 2, { size: 12 });
        });
        g.text('A：あそぶ　B：もどる', W / 2, 200, { size: 12, align: 'center', col: P.gray });
      },
    };
  }

  // ── 寸劇（ミニゲームの間の短いお話） ──────────────────────────
  // 台本は js/otoko/scenes.js（OTK.SKITS）、動かすのは js/otoko/story.js。名前は
  //   opening（はじまり）、ミニゲームの id（その前ふり）、<id>_win（勝ったあと）、ending（よいエンディングの前）
  // 1年をはじめたときだけ見せる（練習モード・?play= では出ない）。やりなおしのときは前ふりをとばす。
  let noSkits = params.get('noskit') === '1' || params.get('noscenes') === '1';
  function Skit(id, next) {
    let gone = false;
    const leave = () => { if (!gone) { gone = true; go(next()); } };
    let s;
    try {
      s = OTK.skit.create(id, { onEnd: leave });
    } catch (e) {
      console.error('寸劇「' + id + '」を作れません:', e);
      return next();
    }
    return {
      name: 'skit',
      skit: s,
      enter() { s.enter(); },
      // 寸劇でエラーが出ても、先へ進めるように
      update(dt) { try { s.update(dt); } catch (e) { console.error('寸劇「' + id + '」でエラー:', e); leave(); } },
      draw() { try { s.draw(); } catch (e) { if (!gone) { console.error('寸劇「' + id + '」の描画でエラー:', e); leave(); } } },
    };
  }
  // 寸劇があれば見せてから next() へ。なければ（または寸劇なしの設定なら）すぐ next()
  function withSkit(id, next) {
    return !noSkits && OTK.skit && OTK.skit.has(id) ? Skit(id, next) : next();
  }
  // 寸劇のあとに行く場面
  function skitNext(id) {
    if (id === 'opening') return () => Calendar(0);
    if (id === 'ending') return GoodEnd;
    const won = /_win$/.test(id);
    const gid = id.replace(/_win$/, '');
    const step = games().findIndex((d) => d.id === gid);
    if (step < 0) return () => Title();
    if (won) {
      if (step + 1 >= total()) return () => withSkit('ending', GoodEnd);
      // 前のミニゲームのすぐあとの話（chain：全裸で切符 → うんこ）は、カレンダーをはさまずに、そのまま次の前ふりへ
      const nx = games()[step + 1];
      if (nx.chain && !noSkits && OTK.skit && OTK.skit.has(nx.id)) return () => Skit(nx.id, skitNext(nx.id));
      return () => Calendar(step + 1);
    }
    return () => Intro({ mode: 'story', id: gid, step, tries: 0 });
  }

  // ── 月の表示（カレンダー） ────────────────────────────
  function Calendar(step, tries) {
    const list = games();
    const d = list[step];
    if (!d) return GoodEnd();
    return {
      name: 'calendar',
      enter() {
        audio.stop();
        audio.sfx('fanfare');
        save.step = step;
        writeSave();
      },
      update() {
        if (this.t > 2.6 || (this.t > 0.3 && input.any())) {
          // やりなおし（tries が 1 以上）のときは、前ふりの寸劇をとばして説明へ
          go(tries ? Intro({ mode: 'story', id: d.id, step, tries }) : withSkit(d.id, skitNext(d.id)));
        }
      },
      draw() {
        const t = this.t;
        const [c1, c2] = SEASON[d.month] || [P.navy, P.mblue];
        R(0, 0, W, H, c1);
        for (let y = 0; y < H; y += 16) g.dither(0, y, W, 8, c2, (y / 16) & 1);
        // めくりカレンダー
        const drop = reduceMotion ? 0 : Math.max(0, 1 - t / 0.3);
        const cy = 30 - Math.round(drop * drop * 120);
        R(70, cy + 4, 120, 120, 'rgba(0,0,0,0.35)');
        R(66, cy, 124, 120, P.black);
        R(67, cy + 1, 122, 118, P.white);
        R(67, cy + 1, 122, 22, P.red);
        R(108, cy - 4, 4, 8, P.dgray); R(144, cy - 4, 4, 8, P.dgray);
        g.text('20xx', 128, cy + 5, { align: 'center', col: P.white });
        const mStr = String(d.month);
        const mw = mStr.length * 4 * 7 - 7;
        g.num(mStr, 128 - 14, cy + 34, { scale: 7, align: 'center', col: d.month === 4 || d.month === 3 ? P.red : P.ink });
        g.text('月', 128 - 14 + Math.round(mw / 2) + 6, cy + 52, { col: P.ink });
        g.text(d.event ? d.event : '―', 128, cy + 90, { align: 'center', col: P.ink });
        // 番号
        g.text((step + 1) + ' / ' + list.length, W - 8, 4, { size: 12, align: 'right', col: P.white, outline: P.black });
        g.text(FLAVOR[d.id] || '', W / 2, 160, { align: 'center', col: P.white, outline: P.black });
        hero(Math.round(-16 + t * 70), 186, 'right', t, { fps: 8 });
      },
    };
  }

  // ── 説明 ─────────────────────────────────────────
  // 目的の一言を大きい文字（32）の行に分ける。1 行に入らなければ、区切りのよい所
  // （「！」「、」や空白のあと、ひらがなから漢字・カタカナに変わる所、「を」のあと）で 2 行にする。
  // goal に \n があれば、そこで分ける。うまく分けられなければ null
  function goalLines(goal, maxW) {
    const s = String(goal || '');
    const fits = (ls) => ls.every((l) => g.measure(l, 32) <= maxW);
    if (s.includes('\n')) {
      const ls = s.split('\n');
      return ls.length <= 2 && fits(ls) ? ls : null;
    }
    if (fits([s])) return [s];
    const ch = [...s];
    let best = null, bestScore = Infinity;
    for (let i = 1; i < ch.length; i++) {
      const a = ch[i - 1], b = ch[i];
      if (OTK.NO_HEAD.includes(b)) continue;
      const strong = /[\s、。！？!?…]/.test(a);
      const soft = /[ぁ-ん]/.test(a) && !/[ぁ-ん]/.test(b);
      if (!strong && !soft && a !== 'を') continue;
      const l1 = ch.slice(0, i).join('').trim(), l2 = ch.slice(i).join('').trim();
      if (!l1 || !l2 || !fits([l1, l2])) continue;
      // 左右の長さがそろうほどよい。記号のあとの切れ目は優先
      const score = Math.abs(g.measure(l1, 32) - g.measure(l2, 32)) - (strong ? 64 : 0);
      if (score < bestScore) { bestScore = score; best = [l1, l2]; }
    }
    return best;
  }
  function Intro(ctx) {
    const d = OTK.get(ctx.id);
    let warned = false; // 説明が入りきらないとき、作る人向けに 1 回だけ知らせる
    return {
      name: 'intro',
      enter() { if (ctx.mode === 'practice') audio.bgm('menu'); },
      update() {
        if (this.t < 0.25) return;
        if (input.pressed('a') || input.pressed('pause') || input.tap) { audio.sfx('ok'); go(Countdown(ctx)); }
        else if (input.back()) {
          audio.sfx('cancel');
          if (ctx.mode === 'practice') go(Practice(ctx.id));
          else if (ctx.mode === 'story') go(Menu());
        }
      },
      draw() {
        R(0, 0, W, H, P.night);
        for (let y = 0; y < H; y += 8) g.dither(0, y, W, 1, P.navy, (y / 8) & 1);
        g.box(6, 6, W - 12, H - 12);
        const head = d.month + '月' + (d.event ? ' ' + d.event : '');
        g.text(head, 18, 16, { size: 12, col: P.lyellow });
        g.text(ctx.mode === 'story' ? 'その' + (ctx.step + 1) : ctx.mode === 'practice' ? 'れんしゅう' : 'テスト', W - 18, 16, { size: 12, align: 'right', col: P.lsky });
        g.text(d.title, W / 2, 32, { align: 'center' });
        R(18, 52, W - 36, 1, P.mblue);
        // 下から：注記（小さい字）、その上に操作の説明。残りに目的を大きく
        const howtoAll = (d.howto || []).flatMap((h) => g.wrap(h, W - 40, 16));
        const noteAll = d.note ? g.wrap(d.note, W - 40, 12) : [];
        const howto = howtoAll.slice(0, 4);
        const note = noteAll.slice(0, 2);
        const noteY = 190 - note.length * 14;
        const gy = 58;
        let gs = 32, lines = goalLines(d.goal, W - 28);
        if (!lines || gy + lines.length * (gs + 2) + 12 + howto.length * 18 > noteY + 2) {
          gs = 16;
          lines = g.wrap(d.goal, W - 36, gs).slice(0, 2);
        }
        lines.forEach((l, i) => g.text(l, W / 2, gy + i * (gs + 2), { size: gs, align: 'center', col: P.yellow, outline: P.black }));
        let y = gy + lines.length * (gs + 2) + 4;
        const room = Math.max(1, Math.floor((noteY + 2 - (y + 8)) / 18)); // 説明が多すぎるときは入るぶんだけ
        // 区切りの線の右はしに、制限時間
        const tw = d.time ? g.text('制限時間 ' + d.time + '秒', W - 18, y - 6, { size: 12, align: 'right', col: P.lsky }) + 6 : 0;
        R(18, y, W - 36 - tw, 1, P.mblue);
        y += 8;
        howto.slice(0, room).forEach((l) => { g.text(l, 22, y); y += 18; });
        // フォントの読みこみ中は幅がちがうので、読みこみ終わってから調べる
        if (!warned && (!document.fonts || document.fonts.status === 'loaded') && (howtoAll.length > Math.min(4, room) || noteAll.length > 2)) {
          warned = true;
          console.warn('ミニゲーム「' + d.id + '」の説明が画面に入りきりません。howto は 3 行、note は 2 行までにしてください。');
        }
        note.forEach((l, i) => g.text(l, 22, noteY + i * 14, { size: 12, col: P.gray }));
        if (g.blink(1.5)) g.text('Aでスタート', W - 18, 196, { align: 'right', col: P.white });
        if (ctx.mode !== 'debug') g.text('B：もどる', 18, 199, { size: 12, col: P.gray });
      },
    };
  }

  // ── 3・2・1 ───────────────────────────────────────
  function newRun(ctx) {
    const run = OTK.makeRun(ctx.id, {
      practice: ctx.mode !== 'story',
      tries: ctx.tries || 0,
      onEnd: (res) => go(Result(ctx, run, res)),
    });
    curRun = run;
    return run;
  }
  function Countdown(ctx) {
    const run = newRun(ctx);
    let lastN = 0;
    return {
      name: 'countdown',
      ctx,
      run,
      enter() { audio.stop(); },
      update() {
        const n = Math.ceil(3 - this.t / 0.55);
        if (n !== lastN && n > 0) { lastN = n; audio.sfx('count'); }
        if (this.t >= 1.65) {
          audio.sfx('go');
          run.start();
          go(Play(ctx, run, { go: true }), { instant: true });
        }
      },
      draw() {
        run.draw(g);
        g.ctx.save();
        g.ctx.globalAlpha = 0.45;
        R(0, OTK.TOP, W, H - OTK.TOP, P.black);
        g.ctx.restore();
        const n = Math.max(1, Math.ceil(3 - this.t / 0.55));
        const k = (this.t % 0.55) / 0.55;
        const sc = k < 0.15 ? 9 : 8;
        g.num(String(n), W / 2 + 1, 84 - (sc - 8) * 2 + 2, { scale: sc, align: 'center', col: P.black });
        g.num(String(n), W / 2, 84 - (sc - 8) * 2, { scale: sc, align: 'center', col: P.white });
        g.wrap(String(run.def.goal || '').replace(/\n/g, ''), W - 16, 16).slice(0, 2).forEach((l, i) => {
          g.text(l, W / 2, 150 + i * 20, { align: 'center', col: P.yellow, outline: P.black });
        });
      },
    };
  }

  // ── 遊んでいるところ ────────────────────────────────
  function Play(ctx, run, o) {
    o = o || {};
    return {
      name: 'play',
      ctx,
      run,
      update(dt) {
        if (input.pressed('pause') && run.phase === 'play' && !run.result) {
          audio.sfx('pause');
          go(Pause(ctx, run), { instant: true });
          return;
        }
        run.update(dt);
      },
      draw() {
        run.draw(g);
        if (o.go && this.t < 0.6) {
          g.big('スタート！', W / 2, 92 - Math.round(this.t * 20), { align: 'center', col: P.white, shade: P.dgray });
        }
      },
    };
  }
  function Pause(ctx, run) {
    const items = ['つづける', 'やりなおす', 'やめる'];
    let cur = 0;
    const BX = 56, BY = 64, BW = 144, RH = 22;
    function choose(i) {
      if (i === 0) {
        audio.sfx('ok');
        if (run.def.bgm) audio.bgm(run.def.bgm);
        go(Play(ctx, run), { instant: true });
      } else if (i === 1) {
        audio.sfx('ok');
        go(Countdown(ctx));
      } else {
        audio.sfx('cancel');
        curRun = null;
        if (ctx.mode === 'practice') go(Practice(ctx.id));
        else if (ctx.mode === 'debug') go(Intro(ctx));
        else go(Menu());
      }
    }
    return {
      name: 'pause',
      run,
      enter() { audio.stop(); },
      update() {
        if (input.repeat('down')) { cur = (cur + 1) % items.length; audio.sfx('cursor'); }
        if (input.repeat('up')) { cur = (cur + items.length - 1) % items.length; audio.sfx('cursor'); }
        const tp = input.tap;
        if (tp) {
          const i = Math.floor((tp.y - BY - 34) / RH);
          if (i >= 0 && i < items.length && tapIn(tp, BX, BY, BW, 200)) choose(i);
          return;
        }
        if (input.pressed('a')) choose(cur);
        else if (input.pressed('pause') || input.back()) choose(0);
      },
      draw() {
        run.draw(g);
        g.ctx.save();
        g.ctx.globalAlpha = 0.6;
        R(0, 0, W, H, P.black);
        g.ctx.restore();
        g.box(BX, BY, BW, 34 + items.length * RH + 8);
        g.text('ポーズ', W / 2, BY + 12, { align: 'center', col: P.yellow });
        items.forEach((it, i) => {
          const y = BY + 36 + i * RH;
          g.text(it, BX + 34, y);
          if (i === cur) g.text('▶', BX + 14 + (g.blink(2) ? 0 : 2), y);
        });
      },
    };
  }
  // 画面を切りかえたら、遊んでいる途中なら止める
  OTK.onHidden = function () {
    if (D.cur && D.cur.name === 'play' && D.cur.run && D.cur.run.phase === 'play' && !D.cur.run.result) {
      const s = D.cur;
      go(Pause(s.ctx, s.run), { instant: true });
    }
  };

  // ── 結果 ─────────────────────────────────────────
  function Result(ctx, run, res) {
    const win = res.result === 'win';
    return {
      name: 'result',
      run,
      enter() {
        if (win) {
          save.clear[ctx.id] = 1;
          if (ctx.mode === 'story') save.step = ctx.step + 1;
          writeSave();
        }
      },
      update() {
        if (this.t < 0.4) return;
        if (input.pressed('a') || input.pressed('pause') || input.tap) {
          audio.sfx('ok');
          curRun = null;
          if (ctx.mode === 'story') {
            if (!win) go(BadEnd(ctx));
            else go(withSkit(ctx.id + '_win', skitNext(ctx.id + '_win')));
          } else {
            const next = Object.assign({}, ctx, { tries: (ctx.tries || 0) + (win ? 0 : 1) });
            if (ctx.mode === 'debug' && !(ctx.quick)) go(Intro(next));
            else go(Countdown(next));
          }
        } else if (input.back() && ctx.mode === 'practice') {
          audio.sfx('cancel');
          curRun = null;
          go(Practice(ctx.id));
        }
      },
      draw() {
        const t = this.t;
        run.draw(g, { hud: true });
        g.ctx.save();
        g.ctx.globalAlpha = 0.55;
        R(0, OTK.TOP, W, H - OTK.TOP, P.black);
        g.ctx.restore();
        const by = 26, bh = 180;
        g.box(16, by, W - 32, bh, { fill: win ? P.blue : P.navy });
        g.text(win ? 'クリア！' : 'しっぱい…', W / 2, by + 10, { size: 32, align: 'center', col: win ? P.yellow : P.lsky, outline: P.black });
        g.wrap(res.msg || '', W - 44, 16).slice(0, 3).forEach((l, i) => g.text(l, W / 2, by + 52 + i * 19, { align: 'center' }));
        // 男魂くんの反応
        const hy = by + 114;
        const naked = !!(OTK.get(ctx.id) || {}).naked; // 全裸のミニゲームは、結果の画面でも全裸
        if (win) {
          const j = Math.abs(Math.sin(t * 6)) * 6;
          hero(W / 2 - 8, hy - Math.round(j), 'down', t, { still: true, naked });
        } else {
          hero(W / 2 - 8, hy + 1, 'up', t, { still: true, naked });
        }
        let hint;
        if (ctx.mode === 'story') hint = 'Aでつぎへ';
        else if (ctx.mode === 'practice') hint = 'A：もういちど　B：やめる';
        else hint = 'A：もういちど';
        if (g.blink(1.5) || ctx.mode === 'practice') g.text(hint, W / 2, by + bh - 26, { size: 12, align: 'center', col: P.lyellow });
      },
    };
  }

  // ── わるいエンディング（途中退寮） ──────────────────────────
  function BadEnd(ctx) {
    const MSG = '中途半端に寮の影響を\n受けたので、友達もできず、\n留年が確定した。';
    const typer = Typer([MSG], 18);
    let stampT = -1;
    let cur = 0;
    const items = ['この月からやりなおす', 'タイトルへ'];
    const BY = 174, RH = 20;
    function pick() {
      audio.sfx('ok');
      if (cur === 0) go(Calendar(ctx.step, (ctx.tries || 0) + 1));
      else go(Title());
    }
    return {
      name: 'ending_bad',
      enter() {
        save.bad++;
        writeSave();
        audio.bgm('ending_bad');
      },
      update(dt) {
        const t = this.t;
        if (t > 1.6) typer.update(dt);
        if (typer.full && stampT < 0 && t > 2) { stampT = 0; audio.sfx('stamp'); }
        if (stampT >= 0) stampT += dt;
        const ready = stampT > 0.6;
        if (!ready) {
          if (input.pressed('a') || input.tap) {
            if (t < 1.6) this.t = 1.6;
            else typer.n = 999;
          }
          return;
        }
        if (input.repeat('down') || input.repeat('up')) { cur = 1 - cur; audio.sfx('cursor'); }
        const tp = input.tap;
        if (tp) {
          const i = Math.floor((tp.y - BY + 3) / RH);
          if (i === 0 || i === 1) { cur = i; pick(); }
          return;
        }
        if (input.pressed('a') || input.pressed('pause')) pick();
      },
      draw() {
        const t = this.t;
        drawRain(t);
        // とぼとぼ去っていく
        const x = Math.round(150 - t * 9);
        if (x > -20) {
          hero(x, 132, 'left', t, { fps: 3 });
          R(x + 9, 145, 7, 6, '#5c3c2c');
        }
        g.ctx.save();
        g.ctx.globalAlpha = Math.min(0.7, t * 0.6);
        R(0, 0, W, 72, P.black);
        g.ctx.restore();
        if (t > 0.5) g.text('途中退寮。', W / 2, 14, { size: 32, align: 'center', col: P.lsky, outline: P.black });
        if (t > 1.6) {
          g.ctx.save();
          g.ctx.globalAlpha = 0.85;
          R(0, 52, W, 68, P.black);
          g.ctx.restore();
          typer.draw(14, 58, W - 28, { noArrow: true });
        }
        if (stampT >= 0) drawHanko(200, 138, stampT);
        if (stampT > 0.6) {
          g.box(20, BY - 9, W - 40, 52, { fill: P.navy });
          items.forEach((it, i) => {
            g.text(it, 52, BY + i * RH, { col: P.white });
            if (i === cur) g.text('▶', 34 + (g.blink(2) ? 0 : 2), BY + i * RH, { col: P.white });
          });
        }
      },
    };
  }
  // 赤い「留年確定」のはんこ（押した瞬間は大きく、すぐに縮む）
  function drawHanko(cx, cy, t) {
    const k = Math.min(1, t / 0.12);
    const s = 1 + (1 - k) * 0.8;
    const ctx = g.ctx;
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.rotate(-0.12);
    ctx.scale(s, s);
    ctx.globalAlpha = 0.93;
    const w = 56, h = 54;
    R(-w / 2 + 2, -h / 2, w - 4, h, P.red);
    R(-w / 2, -h / 2 + 2, w, h - 4, P.red);
    R(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, P.white);
    R(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10, P.red);
    g.text('留年', 0, -h / 2 + 9, { align: 'center', col: P.white });
    g.text('確定', 0, -h / 2 + 28, { align: 'center', col: P.white });
    ctx.restore();
  }

  // ── よいエンディング ─────────────────────────────────
  const CREDITS = [
    ['男魂くんの1年', 'title'],
    [''],
    ['出演', 'head'],
    ['男魂くん'],
    ['先輩A　先輩B　先輩C'],
    ['同期B　一年C'],
    ['歴代の寮生のみなさん（全員）'],
    [''],
    ['友情出演', 'head'],
    ['牛丼屋の店員さん'],
    ['コンビニの店員さん'],
    ['駅員さん'],
    ['おまわりさん'],
    ['寮のおばちゃん'],
    [''],
    ['企画・制作', 'head'],
    ['夕照寮OB会 有志'],
    [''],
    [''],
    ['この物語は誇張であり、', 'small'],
    ['すべてフィクションです。', 'small'],
    ['実在の人物・団体・事件とは', 'small'],
    ['関係ありません。', 'small'],
    [''],
    ['お酒は二十歳になってから。', 'small'],
    ['服は着て外に出よう。', 'small'],
    [''],
    [''],
    ['めでたし めでたし', 'title'],
  ];
  function GoodEnd() {
    const typer = Typer(['寮になじんだ。', 'そして、留年が確定した。'], 16);
    let phase = 'talk'; // talk → stamp → credits → end
    let stampT = 0, rollY = 0;
    const crowd = [];
    for (let i = 0; i < 22; i++) {
      const kinds = ['senpai', 'douki', 'ichinen', 'senpai', 'douki', 'zombie', 'senpai', 'ichinen', 'obachan', 'douki'];
      crowd.push({ kind: kinds[i % kinds.length], v: i, x: 6 + (i % 11) * 22 + (i >= 11 ? 11 : 0), y: i >= 11 ? 132 : 112, ph: i * 0.37 });
    }
    return {
      name: 'ending_good',
      enter() {
        save.good++;
        save.step = 0;
        writeSave();
        audio.bgm('ending_good');
      },
      update(dt) {
        const t = this.t;
        if (phase === 'talk') {
          if (t > 1.2) typer.update(dt);
          if (input.pressed('a') || input.tap) {
            if (t < 1.2) this.t = 1.2;
            else if (typer.advance()) { phase = 'stamp'; stampT = 0; audio.sfx('stamp'); }
          }
        } else if (phase === 'stamp') {
          stampT += dt;
          if (stampT > 0.8 && (input.pressed('a') || input.tap || stampT > 4)) { phase = 'credits'; rollY = 0; audio.sfx('ok'); }
        } else if (phase === 'credits') {
          rollY += dt * (input.held('a') || input.pointer.down ? 60 : 16);
          const endY = CREDITS.length * 20 + H - 40;
          if (rollY >= endY) phase = 'end';
        } else if (phase === 'end') {
          if (input.pressed('a') || input.pressed('pause') || input.tap) { audio.sfx('ok'); go(Title()); }
        }
      },
      draw() {
        const t = this.t;
        if (phase === 'talk' || phase === 'stamp') {
          drawSpring(t, {});
          // 胴上げ
          const toss = Math.abs(Math.sin(t * 2.4));
          crowd.forEach((c) => {
            const j = Math.round(Math.abs(Math.sin(t * 4 + c.ph)) * 3);
            g.sprite(OTK.person(c.kind, { variant: c.v, dir: 'down', frame: j > 1 ? 1 : 0 }), c.x, c.y - j);
          });
          hero(W / 2 - 16, 70 - Math.round(toss * 34), 'down', t, { scale: 2, still: true });
          g.box(6, 160, W - 12, 58);
          typer.draw(18, 171, W - 36, { noArrow: phase === 'stamp' });
          if (phase === 'stamp') {
            drawHanko(196, 70, stampT);
            if (stampT > 0.8) g.text('めでたし めでたし', W / 2, 196, { align: 'center', col: P.yellow });
          }
          return;
        }
        // スタッフロール
        R(0, 0, W, H, P.night);
        stars(t, 40, H);
        const y0 = H - rollY;
        g.ctx.save();
        g.ctx.beginPath();
        g.ctx.rect(0, 18, W, 172); // 上は「早送り」の字、下は男魂くんが歩く所
        g.ctx.clip();
        CREDITS.forEach(([s, kind], i) => {
          const y = Math.round(y0 + i * 20);
          if (y < -20 || y > H) return;
          if (kind === 'title') g.text(s, W / 2, y, { align: 'center', col: P.yellow, outline: P.black });
          else if (kind === 'head') g.text(s, W / 2, y, { size: 12, align: 'center', col: P.lsky });
          else if (kind === 'small') g.text(s, W / 2, y + 2, { size: 12, align: 'center', col: P.gray });
          else g.text(s, W / 2, y, { align: 'center' });
        });
        g.ctx.restore();
        R(0, 192, W, 1, P.navy);
        hero(Math.round(((t * 20) % (W + 32)) - 16), 196, 'right', t, {});
        if (phase === 'end') {
          drawHanko(W / 2, 96, 1);
          if (g.blink(1.5)) g.text('Aでタイトルへ', W / 2, 150, { align: 'center' });
        } else g.text('A長押しで早送り', W - 6, 4, { size: 12, align: 'right', col: P.dgray });
      },
    };
  }

  // ── テスト用（docs/site/ENGINE.md） ────────────────────────
  function sceneByName(name) {
    switch (name) {
      case 'title': return Title();
      case 'menu': return Menu();
      case 'practice': return Practice();
      case 'story': return Skit('opening', () => Calendar(0)); // むかしの名前（はじまりの話）
      case 'ending_good': return GoodEnd();
      case 'ending_bad': return BadEnd({ mode: 'story', step: Math.max(0, Math.min(total() - 1, save.step)), id: (games()[save.step] || games()[0]).id });
      default: return null;
    }
  }
  OTK.debug = {
    get scene() { return D.cur ? D.cur.name : null; },
    get current() { return curRun ? curRun.id : null; },
    get run() { return curRun; },
    get game() { return curRun ? curRun.game : null; },
    get api() { return curRun ? curRun.api : null; },
    get save() { return JSON.parse(JSON.stringify(save)); },
    get speed() { return OTK.speed; },
    // 寸劇：いま見ている寸劇（{ id, step, steps, done, line, map }）、寸劇の名前の一覧、寸劇なしにする
    get skit() { return D.cur && D.cur.name === 'skit' && D.cur.skit ? D.cur.skit.info : null; },
    get skits() { return OTK.skit ? OTK.skit.ids() : []; },
    get noSkits() { return noSkits; },
    set noSkits(v) { noSkits = !!v; },
    // その寸劇から始める（終わったら、1年の流れのとおり次へ）
    playSkit(id) {
      if (!OTK.skit || !OTK.skit.has(id)) throw new Error('寸劇がありません: ' + id);
      go(Skit(id, skitNext(id)), { instant: true });
    },
    set speed(v) { OTK.speed = Math.max(0.1, Number(v) || 1); },
    // ミニゲームを 1 本はじめる。quick: true なら説明と 3・2・1 をとばす。tries: 2 などで、しっぱいしたあとのやさしい難しさを試せる
    start(id, o) {
      if (!OTK.get(id)) throw new Error('ミニゲームがありません: ' + id);
      const ctx = { mode: 'debug', id, tries: (o && o.tries) | 0, quick: !!(o && o.quick) };
      if (ctx.quick) startQuick(ctx);
      else go(Intro(ctx), { instant: true });
    },
    // 1年のとちゅう（step 番目のカレンダー）から始める
    story(step) { go(Calendar(Math.max(0, Math.min(total() - 1, step | 0))), { instant: true }); },
    // いま遊んでいるミニゲームを、勝ち・負けで終わらせる
    forceResult(result, msg) {
      const s = D.cur;
      if (!curRun) return false;
      if (s && s.name === 'countdown') {
        curRun.start();
        go(Play(s.ctx, curRun), { instant: true });
      }
      curRun.end(result === 'win' ? 'win' : 'lose', msg || (result === 'win' ? 'テストでクリア。' : 'テストでしっぱい。'), { wait: 0 });
      return true;
    },
    seed(n) { OTK.seed = n == null ? null : n | 0; },
    goto(name) { const s = sceneByName(name); if (s) go(s, { instant: true }); return !!s; },
    reset() { save = { step: 0, clear: {}, good: 0, bad: 0 }; writeSave(); },
  };
  function startQuick(ctx) {
    const run = newRun(ctx);
    run.start();
    go(Play(ctx, run), { instant: true });
  }

  // ── はじめる ──────────────────────────────────────
  // 「ホームへもどる」のあと、ブラウザの「戻る」でページがそのまま戻ってきたら、メニューを出しなおす
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && D.cur && D.cur.name === 'leave') go(Menu(4), { instant: true });
  });
  OTK.setScene(director);
  const playId = params.get('play');
  if (params.get('seed') != null && params.get('seed') !== '') OTK.seed = Number(params.get('seed')) | 0;
  const skitId = params.get('skit') || params.get('scene');
  if (playId && OTK.get(playId)) OTK.debug.start(playId, { quick: params.get('quick') === '1' });
  else if (skitId && OTK.skit && OTK.skit.has(skitId)) OTK.debug.playSkit(skitId);
  else {
    if (skitId) console.warn('?skit= の寸劇が見つかりません: ' + skitId);
    if (playId) console.warn('?play= のミニゲームが見つかりません: ' + playId);
    go(Title(), { instant: true });
  }
  OTK.startLoop();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => OTK.fit());
})();
