/*
 * 男魂くんの1年 ― 寸劇（ミニゲームの間の短いお話）を動かすしくみ
 *  台本は js/otoko/scenes.js（OTK.SKITS）。命令の書き方は、そちらの先頭に書いてある。
 *  背景は寮さんぽの地図（js/world.js の DORM.WORLD.maps）を、js/art.js の DORM.renderMap で描いたもの。
 *  1 マス = 16 ドット。画面（256×224）には 16×14 マスが入る。
 *  人物は OTK.person（16×24）。足もとが、そのマスの下はしに来るように置く。
 *
 *  OTK.skit.create(id, { onEnd }) … main.js の場面（name: 'skit'）を作る。終わるか START でとばすと onEnd()
 *  操作はいらない。セリフは読める時間がたつと進む。A（タップ）で今のセリフを早く進める。
 *  A を押しっぱなしにすると早送り。START でまるごととばす。
 */
(function () {
  'use strict';
  const OTK = window.OTK;
  const W = OTK.W, H = OTK.H, P = OTK.P, g = OTK.g, input = OTK.input, audio = OTK.audio;
  const R = g.R;
  const TS = 16;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // ── 寮の地図（寮さんぽと同じもの） ─────────────────────────
  function DORM() { return window.DORM && window.DORM.WORLD ? window.DORM : null; }
  // 寸劇だけで使う地図（js/otoko/scenes.js の OTK.SKIT_MAPS。川ぞいの道など）。寮さんぽの地図には足さない
  const skitMaps = {};
  function mapOf(id) {
    const D = DORM();
    let m = D && D.WORLD.maps[id];
    if (!m && D && OTK.SKIT_MAPS && OTK.SKIT_MAPS[id]) {
      m = skitMaps[id] || (skitMaps[id] = Object.assign({ labels: [], links: {} }, OTK.SKIT_MAPS[id]));
      // 外の地図の絵（DORM.renderMap）は寮の建物も描くので、寮の出てこない地図では、建物を画面の外に置いておく
      if (m.kind === 'ext' && !m.building) m.building = { x: 0, y: -60, w: 56, h: 9, roof: 3 };
    }
    if (!m) return null;
    if (!m.id) { m.id = id; m.h = m.rows.length; m.w = m.rows[0].length; } // js/game.js と同じ下ごしらえ
    if (!m.bg) D.renderMap(m);
    return m;
  }
  const tileAt = (m, x, y) => (m && y >= 0 && y < m.h && x >= 0 && x < m.w ? m.rows[y][x] : ' ');
  // 画面の下にキーボードの説明が出ているか（css/otoko.css と同じ条件。出ていなければ START ボタンがある）
  const coarse = window.matchMedia ? window.matchMedia('(hover: none), (pointer: coarse)') : null;
  const keysShown = () => !document.body.classList.contains('otk-touch') && !(coarse && coarse.matches);
  // 地図の絵は、はじめて使うときに作ると、暗転の最初の 1 コマが重くなる。手があいたときに 1 枚ずつ先に作っておく
  //  （寸劇だけの地図は、scenes.js を読んだあとに、最後にまとめて）
  (function prerender(list, extra) {
    if (!DORM()) return;
    if (!list.length) {
      if (extra) return;
      extra = true;
      list = Object.keys(OTK.SKIT_MAPS || {});
      if (!list.length) return;
    }
    const later = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 4000 }) : (f) => setTimeout(f, 600);
    later(() => { try { mapOf(list[0]); } catch (e) { /* 寸劇のときに作りなおす */ } prerender(list.slice(1), extra); });
  })(['EXT', '1F', '2F', '3F', 'RF'], false);
  // 玄関の看板「夕照寮」はフォントで描くので、フォントが届いたら外の絵を作りなおす（js/game.js と同じ）
  if (DORM() && document.fonts && document.fonts.load) {
    document.fonts.load('16px "DotGothic16"', '夕照寮').then(() => {
      const D = DORM();
      D.fontReady = true;
      const ext = D.WORLD.maps.EXT;
      if (ext && ext.bg) D.renderMap(ext);
    }).catch(() => {});
  }
  // 外の地図の、建物の窓ガラスの四角（夜に明かりをつける）。js/art.js の drawFacade と同じ割り付け
  function facadeWindows(m) {
    if (m._otkWin) return m._otkWin;
    const D = DORM();
    const b = m.building;
    const out = [];
    if (b && D) {
      const rows = ['3F', '2F', '1F'].map((k) => { const r = D.WORLD.maps[k].rows; return r[r.length - 1]; });
      const ox = b.x * TS, oy = b.y * TS, rh = b.roof * TS, fh = ((b.h - b.roof) * TS) / 3;
      rows.forEach((row, f) => {
        const fy = oy + rh + f * fh;
        const n = rows[0].length;
        let x = 0;
        while (x < n) {
          if (row[x] !== 'w') { x++; continue; }
          let x2 = x;
          while (x2 + 1 < n && row[x2 + 1] === 'w') x2++;
          const wx = ox + x * TS, ww = (x2 - x + 1) * TS;
          const side = row[x - 1] === 'E' || row[x2 + 1] === 'E';
          if (!side) {
            if (f === 2 && x2 - x >= 4) {
              const top = fy + Math.round(fh * 0.14), sill = fy + Math.round(fh * 0.62);
              out.push({ x: wx + 1, y: top + 2, w: ww - 2, h: sill - top - 3, k: x });
            } else {
              const top = fy + Math.round(fh * 0.24);
              out.push({ x: wx + 3, y: top + 1, w: ww - 6, h: Math.round(fh * 0.5) - 2, k: x * 3 + f });
            }
          }
          x = x2 + 1;
        }
      });
    }
    m._otkWin = out;
    return out;
  }

  // ── 小さい絵（吹き出しの記号） ──────────────────────────────
  const ICON = {
    '!': ['##', '##', '##', '##', '..', '##'],
    '?': ['.###.', '##.##', '...##', '..##.', '.....', '..##.'],
    '♪': ['...##', '...#.#', '...#..', '.###..', '####..', '.##...'],
    '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'],
    '…': ['.....', '.....', '.....', '.....', '#.#.#'],
    '!?': ['##.###.', '####.##', '##...##', '##..##.', '.......', '##..##.'],
    '!!': ['##.##', '##.##', '##.##', '##.##', '.....', '##.##'],
  };
  const ICON_COL = { '!': P.red, '?': P.mblue, '♪': P.ink, '♥': P.rose, '…': P.ink, '!?': P.red, '!!': P.red };
  // 色つきの絵の吹き出し（うんこは、ミニゲーム「うんこをよけろ」と同じ絵）
  const ICON_ART = {
    うんこ: {
      rows: ['......kk......', '.....kmmk.....', '......khmk....', '....kkkmmmk...', '...kmhhmmmmk..', '...kmmmmmmdk..',
        '..kkkkkkkkkkk.', '.kmhhmmmmmmmdk', 'kmhwemmmmwemdk', 'kmmmmmmmmmmddk', '.kddddddddddk.', '..kkkkkkkkkk..'],
      pal: { k: '#2c1400', m: '#8c4c14', h: '#c88c50', d: '#5c3008', w: '#fcfcfc', e: '#141018' },
    },
  };
  function bitmap(rows, x, y, col) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] === '#') R(x + i, y + j, 1, 1, col); });
  }
  function artmap(art, x, y) {
    art.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (art.pal[r[i]]) R(x + i, y + j, 1, 1, art.pal[r[i]]); });
  }
  // 白い吹き出し（下に小さいしっぽ）。cx は真ん中、by は下はし
  function bubble(cx, by, w, h) {
    const x = Math.round(cx - w / 2), y = Math.round(by - h);
    R(x + 1, y, w - 2, h, P.ink);
    R(x, y + 1, w, h - 2, P.ink);
    R(x + 1, y + 1, w - 2, h - 2, P.white);
    R(Math.round(cx) - 1, by - 1, 3, 3, P.ink);
    R(Math.round(cx), by - 1, 1, 2, P.white);
    return { x, y };
  }
  function drawEmote(e, cx, top, t) {
    const icon = e.icon;
    if (icon === '汗') { // 汗のしずく（頭の横をつたう）
      const y = top + 3 + Math.min(4, Math.floor(t * 6));
      const x = cx + 6;
      R(x + 1, y, 1, 1, P.ink); R(x, y + 1, 3, 1, P.ink);
      R(x - 1, y + 2, 1, 3, P.ink); R(x + 3, y + 2, 1, 3, P.ink); R(x, y + 5, 3, 1, P.ink);
      R(x + 1, y + 1, 1, 1, P.lsky); R(x, y + 2, 3, 3, P.sky); R(x, y + 2, 1, 1, P.white);
      return;
    }
    if (icon === '怒') { // 怒りマーク（ぴくぴく動く）
      const k = Math.floor(t * 6) % 2;
      const x = cx + 4 - k, y = top - 1 - k;
      bitmap(['.#.#.', '##.##', '.....', '##.##', '.#.#.'], x, y, P.red);
      return;
    }
    if (icon === 'zzz') {
      const k = (t * 0.8) % 1;
      for (let i = 0; i < 2; i++) {
        const y = Math.round(top - 2 - i * 5 - k * 5), x = cx + 5 + i * 4;
        bitmap(['####', '..#.', '.#..', '####'], x + 1, y + 1, P.ink);
        bitmap(['####', '..#.', '.#..', '####'], x, y, P.white);
      }
      return;
    }
    const pop = Math.min(1, t / 0.12);
    const by = top - 2 + Math.round((1 - pop) * 3);
    if (ICON[icon]) {
      const bm = ICON[icon];
      const iw = Math.max(...bm.map((r) => r.length));
      const b = bubble(cx, by, iw + 6, bm.length + 6);
      bitmap(bm, b.x + 3, b.y + 3, ICON_COL[icon] || P.ink);
      return;
    }
    if (ICON_ART[icon]) {
      const art = ICON_ART[icon];
      const b = bubble(cx, by, art.rows[0].length + 6, art.rows.length + 6);
      artmap(art, b.x + 3, b.y + 3);
      return;
    }
    // ことばの吹き出し（「プルルル」など）
    const tw = g.measure(icon, 12);
    const b = bubble(cx, by, tw + 8, 16);
    g.text(icon, b.x + 4, b.y + 1, { size: 12, col: P.ink });
  }

  // ── 持ち物・置き物の絵 ─────────────────────────────────
  // 持ち物は、人物の絵の左上 (x, y) と向きから、手の位置に描く
  function drawItem(kind, x, y, dir, t) {
    const hx = dir === 'right' ? x + 9 : dir === 'left' ? x + 1 : dir === 'up' ? x - 2 : x + 12;
    const hy = y + 14;
    if (kind === 'bag') { // 旅行かばん
      R(hx - 1, hy - 1, 8, 8, P.ink);
      R(hx, hy, 6, 6, '#8c5c34');
      R(hx, hy + 2, 6, 1, '#6c4424');
      R(hx + 2, hy - 2, 2, 2, P.ink);
      R(hx, hy, 6, 1, '#ac7c4c');
    } else if (kind === 'kinoko') { // あやしいキノコ（赤に白い水玉）
      const kx = hx - 1, ky = hy - 6;
      R(kx + 2, ky + 4, 3, 4, P.ink); R(kx + 3, ky + 4, 1, 4, P.cream);
      R(kx, ky, 7, 5, P.ink); R(kx + 1, ky - 1, 5, 1, P.ink);
      R(kx + 1, ky, 5, 4, P.red); R(kx + 2, ky + 1, 1, 1, P.white); R(kx + 4, ky + 2, 1, 1, P.white);
      R(kx + 5, ky + 1, 1, 1, P.lime);
    } else if (kind === 'unko') { // うんこ（おもちゃ）
      const ux = hx - 2, uy = hy - 5;
      R(ux + 3, uy, 2, 1, P.ink); R(ux + 2, uy + 1, 4, 1, P.ink); R(ux + 1, uy + 2, 6, 1, P.ink); R(ux, uy + 3, 8, 3, P.ink);
      R(ux + 3, uy + 1, 2, 1, '#8c5c2c'); R(ux + 2, uy + 2, 4, 1, '#8c5c2c'); R(ux + 1, uy + 3, 6, 2, '#8c5c2c');
      R(ux + 2, uy + 3, 1, 1, '#c88c50'); R(ux + 1, uy + 5, 6, 1, '#6c4424');
    } else if (kind === 'masu') { // 豆の入った枡
      R(hx - 1, hy - 1, 8, 6, P.ink); R(hx, hy, 6, 4, P.tan); R(hx + 1, hy, 4, 1, P.cream); R(hx + 2, hy, 1, 1, P.brown);
    } else if (kind === 'denwa') { // 受話器
      R(hx - 1, hy - 4, 3, 7, P.ink); R(hx, hy - 3, 1, 5, P.lgray);
    } else if (kind === 'kami') { // くじの紙
      R(hx - 1, hy - 6, 7, 7, P.ink); R(hx, hy - 5, 5, 5, P.white); R(hx + 1, hy - 4, 3, 1, P.red); R(hx + 1, hy - 2, 3, 1, P.red);
    } else if (kind === 'kippu') { // 切符（クリーム色に、黒い線）
      R(hx - 1, hy - 5, 9, 6, P.ink); R(hx, hy - 4, 7, 4, '#f8ecc0'); R(hx, hy - 2, 7, 1, '#5c4c3c'); R(hx + 1, hy - 4, 2, 1, P.red);
    } else if (kind === 'houki') { // ほうき（はいている。穂先が左右にゆれる）
      const back = dir === 'left' ? 1 : -1; // 柄の上は体のうしろ、穂先は前の足もと
      const tx = dir === 'left' ? x + 11 : x + 4, ty = y + 9;
      const bx = (dir === 'left' ? x - 2 : x + 17) + Math.round(Math.sin(t * 6) * 2), by = y + 22;
      for (let i = 0; i <= 12; i++) R(Math.round(tx + ((bx - tx) * i) / 12), Math.round(ty + ((by - 3 - ty) * i) / 12), 1, 1, '#8c5c2c');
      R(bx - 4, by - 3, 8, 4, P.ink); R(bx - 3, by - 3, 6, 3, '#d8b860'); R(bx - 3, by - 3, 6, 1, '#a07830');
      if (Math.floor(t * 3) % 2) R(bx + back * 5, by - 1, 1, 1, '#c8c0a8'); // ほこり
    }
  }
  // 置き物（足もとのマスに置く）。x, y はマスの左上の画面座標
  function drawProp(pr, px, py, t) {
    const k = pr.kind;
    if (k === 'nabe') { // カセットコンロに土鍋
      R(px + 1, py + 10, 14, 6, P.ink); R(px + 2, py + 11, 12, 4, P.lgray); R(px + 3, py + 12, 3, 2, P.dgray);
      R(px + 1, py + 3, 14, 8, P.ink); R(px + 2, py + 4, 12, 6, '#5c3c2c'); R(px + 2, py + 4, 12, 2, '#8c6c4c');
      R(px + 3, py + 5, 4, 1, pr.weird ? '#b05cc8' : P.lorange); R(px + 8, py + 5, 3, 1, pr.weird ? P.lime : P.lgreen); R(px + 11, py + 5, 2, 1, P.white);
      for (let i = 0; i < 3; i++) { // ゆげ
        const ph = (t * 0.9 + i * 0.33) % 1;
        const sx = px + 4 + i * 4 + Math.round(Math.sin(t * 3 + i) * 1.5), sy = py + 2 - Math.round(ph * 12);
        if (ph < 0.85) R(sx, sy, 2, 2, pr.weird ? '#d8b8f8' : '#fcfcfc');
      }
    } else if (k === 'kuji') { // くじの箱
      R(px + 1, py + 2, 14, 13, P.ink); R(px + 2, py + 3, 12, 11, P.white); R(px + 2, py + 3, 12, 2, P.lgray);
      R(px + 5, py + 3, 6, 2, P.ink);
      R(px + 3, py + 7, 10, 5, P.red);
      bitmap(['.###.', '##.##', '...##', '..##.', '.....', '..##.'], px + 6, py + 6, P.white);
    } else if (k === 'nobori') { // のぼり（学祭のホストクラブ「夕照」：黒地に金のふち、ピンクと金の字）
      const gold = '#e0b840';
      R(px + 3, py - 22, 2, 38, P.ink); R(px + 3, py - 22, 1, 38, P.lgray);
      R(px + 5, py - 20, 10, 30, P.ink); R(px + 6, py - 19, 8, 28, '#1c1824');
      R(px + 6, py - 19, 8, 1, gold); R(px + 6, py + 8, 8, 1, gold); R(px + 6, py - 19, 1, 28, gold); R(px + 13, py - 19, 1, 28, gold);
      for (let i = 0; i < 4; i++) { R(px + 8, py - 15 + i * 6, 4, 4, i % 2 ? gold : '#f878b8'); R(px + 9, py - 14 + i * 6, 2, 2, '#1c1824'); }
    } else if (k === 'kanban') { // 立て看板（黒地に金のふち。pr.text をピンク、pr.sub を金で）
      const w = 40, h = 30, x0 = px + 8 - w / 2, y0 = py - 22;
      R(x0 + 5, y0 + h, 2, 10, P.ink); R(x0 + w - 7, y0 + h, 2, 10, P.ink);
      R(x0, y0, w, h, P.ink); R(x0 + 1, y0 + 1, w - 2, h - 2, '#e0b840'); R(x0 + 2, y0 + 2, w - 4, h - 4, '#1c1824');
      if (pr.text) g.text(pr.text, px + 8, y0 + 3, { size: 12, align: 'center', col: (Math.floor(t * 2) % 4) ? '#f878b8' : '#fcc8e4' });
      if (pr.sub) g.text(pr.sub, px + 8, y0 + 15, { size: 12, align: 'center', col: '#f8d878' });
    } else if (k === 'teppan') { // 鉄板
      R(px - 8, py + 6, 32, 10, P.ink); R(px - 7, py + 7, 30, 8, P.dgray); R(px - 7, py + 7, 30, 2, P.gray);
      R(px - 4, py + 9, 6, 2, P.lorange); R(px + 4, py + 9, 7, 2, P.tan); R(px + 13, py + 9, 6, 2, P.lorange); R(px + 6, py + 11, 3, 1, P.lgreen);
    } else if (k === 'saifu') { // 財布（忘れ物）
      R(px + 3, py + 8, 10, 7, P.ink); R(px + 4, py + 9, 8, 5, '#8c5c34'); R(px + 4, py + 9, 8, 1, '#ac7c4c');
      R(px + 4, py + 11, 8, 1, '#6c4424'); R(px + 9, py + 11, 2, 2, P.yellow);
    } else if (k === 'phone') { // 黒電話（鳴ると、ゆれる）
      const j = pr.ring && Math.floor(t * 20) % 2 ? 1 : 0;
      R(px + 3 + j, py + 7, 10, 7, P.ink); R(px + 4 + j, py + 8, 8, 5, '#2c2c34');
      R(px + 2 + j, py + 5, 12, 3, P.ink); R(px + 3 + j, py + 6, 10, 1, '#3c3c48');
      R(px + 6 + j, py + 9, 4, 3, P.lgray);
    }
  }

  // ── 天気・明かり ──────────────────────────────────
  function rainOver(t) {
    g.ctx.save();
    g.ctx.globalAlpha = 0.6;
    for (let i = 0; i < 70; i++) {
      const rx = ((i * 47 + t * 50) % 290) - 16, ry = ((i * 29 + t * 300) % 250) - 16;
      R(rx, ry, 1, 6, '#9cacc8');
    }
    g.ctx.restore();
  }
  function particles(kind, t) {
    if (kind === 'rain') return rainOver(t);
    const n = kind === 'snow' ? 40 : 18;
    for (let i = 0; i < n; i++) {
      const sp = kind === 'snow' ? 16 + (i % 5) * 3 : kind === 'leaves' ? 20 : 22;
      const px = ((i * 53 + t * (kind === 'snow' ? 6 : 16) + Math.sin(t * 1.3 + i) * 10) % 280) - 12;
      const py = ((i * 41 + t * sp) % 240) - 8;
      if (kind === 'petals') R(px, py, 2, 1, i % 3 ? '#fcd0e0' : '#f8a8c0');
      else if (kind === 'snow') R(px, py, i % 4 ? 1 : 2, i % 4 ? 1 : 2, P.white);
      else if (kind === 'leaves') { R(px, py, 3, 2, ['#e46c20', '#c84c1c', '#f8b830'][i % 3]); R(px + 1, py + 2, 1, 1, '#8c4c1c'); }
    }
  }
  // 夕焼けの空（屋上の地図の上、地図の外に見える部分）
  function sunsetSky(h, t) {
    const cols = ['#2b1d4e', '#45285f', '#6b3166', '#9a3d68', '#c9536a', '#e57656', '#f39a52', '#f8bf68'];
    const bh = Math.max(1, Math.ceil(h / cols.length));
    cols.forEach((c, i) => R(0, i * bh, W, bh, c));
    const sx = 52, sy = h - 7;
    g.disc(sx, sy, 15, '#fce0a8');
    g.disc(sx, sy, 12, '#fcd078');
    for (let i = 0; i < 3; i++) R(sx - 16, sy - 2 + i * 4, 32, 1, cols[5 + Math.min(2, i)]);
    // 遠くの山と町
    for (let x = 0; x < W; x += 4) {
      const hh = 6 + Math.round(Math.abs(Math.sin(x * 0.045)) * 8 + Math.sin(x * 0.13) * 2);
      R(x, h - hh, 4, hh, '#5c2c58');
    }
    for (let x = 0; x < W; x += 6) {
      const hh = 3 + ((x * 7) % 11);
      R(x, h - hh, 5, hh, '#3c1c44');
      if ((x * 13) % 5 === 0) R(x + 2, h - hh + 2, 1, 1, '#f8d878');
    }
    // カラス
    for (let i = 0; i < 3; i++) {
      const cx = ((t * 14 + i * 60) % (W + 40)) - 20, cy = 14 + i * 7 + Math.round(Math.sin(t * 2 + i) * 2);
      const wing = Math.floor(t * 4 + i) % 2;
      R(cx, cy, 3, 1, P.ink); R(cx - 2, cy - wing, 2, 1, P.ink); R(cx + 3, cy - wing, 2, 1, P.ink);
    }
  }
  function nightSky(h, t) {
    R(0, 0, W, h, '#0d0b26');
    for (let i = 0; i < 24; i++) {
      const sx = (i * 73 + 11) % W, sy = (i * 37 + 5) % Math.max(1, h);
      if ((Math.floor(t * 2 + i * 0.7) % 5) !== 0) R(sx, sy, 1, 1, i % 3 ? P.white : P.lyellow);
    }
  }

  // ── 台本の読みこみ ─────────────────────────────────
  function castOf(def) {
    const base = Object.assign({}, OTK.SKIT_CAST || {}, def.cast || {});
    const out = {};
    for (const [id, c] of Object.entries(base)) {
      if (typeof c === 'string') {
        const [kind, v] = c.split(':');
        out[id] = { kind, v: v ? Number(v) : 0, name: id };
      } else out[id] = Object.assign({ v: 0, name: id }, c);
    }
    return out;
  }
  const isText = (s) => typeof s === 'string';
  const arr = (v) => (Array.isArray(v) && !(v.length === 2 && typeof v[0] === 'number') ? v : [v]);

  // ── 寸劇を 1 本動かす ──────────────────────────────
  function create(id, o) {
    o = o || {};
    const def = (OTK.SKITS || {})[id];
    if (!def) throw new Error('寸劇がありません: ' + id);
    const cast = castOf(def);
    const st = {
      id, i: 0, t: 0, done: false, ended: false,
      map: null, cam: { x: 0, y: 0 }, light: def.light || 'day', weather: def.weather || null,
      win: def.win || 'bottom', actors: {}, props: {}, say: null, card: null,
      fade: 1, fadeTo: 0, fadeSpeed: 1 / 0.3, quake: 0, quakeP: 0, puffs: [], cur: null, bg: [],
    };
    function setMap(mid, cx, cy) {
      st.map = mapOf(mid);
      if (!st.map) console.warn('寸劇「' + id + '」: 地図がありません: ' + mid);
      if (cx != null) { st.cam.x = cx; st.cam.y = cy || 0; }
    }
    setMap(def.map || '1F', (def.cam || [0, 0])[0], (def.cam || [0, 0])[1]);
    if (reduceMotion) st.fade = 0;

    function actor(who) {
      const a = st.actors[who];
      if (!a) console.warn('寸劇「' + id + '」: まだ置いていない人です: ' + who);
      return a;
    }
    function place(who, x, y, dir, opt) {
      const c = cast[who] || { kind: 'douki', v: 0, name: who };
      const a = Object.assign(st.actors[who] || {}, {
        id: who, kind: c.kind, v: c.v, name: c.name, x, y, dir: dir || 'down', hidden: false,
        path: null, dist: 0, hopT: 0, hopN: 0, bowT: 0, shakeT: 0, emote: null, talk: false,
        naked: !!c.naked, item: c.item || null, pose: null, stubble: !!c.stubble, hen: !!c.hen,
      }, opt || {});
      st.actors[who] = a;
      return a;
    }
    // 歩く道：点を順に。1 区間ごとに、横 → 縦（yfirst なら縦 → 横）にまっすぐ
    function route(a, pts, opt) {
      const path = [];
      let cx = a.x, cy = a.y;
      for (const [tx, ty] of pts) {
        if (opt.yfirst) { if (ty !== cy) path.push([cx, ty]); if (tx !== cx) path.push([tx, ty]); }
        else { if (tx !== cx) path.push([tx, cy]); if (ty !== cy) path.push([tx, ty]); }
        cx = tx; cy = ty;
      }
      a.path = path.length ? path : null;
      a.speed = (opt.speed || (opt.run ? 6 : 3.5));
      a.endFace = opt.face || null;
    }
    function updateActor(a, dt) {
      if (a.path) {
        let left = a.speed * dt;
        while (left > 0 && a.path) {
          const [tx, ty] = a.path[0];
          const dx = tx - a.x, dy = ty - a.y;
          const d = Math.abs(dx) + Math.abs(dy);
          if (d > 0) a.dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          if (d <= left) {
            a.x = tx; a.y = ty; left -= d; a.dist += d * TS;
            a.path.shift();
            if (!a.path.length) { a.path = null; if (a.endFace) a.dir = a.endFace; }
          } else {
            a.x += (dx / d) * left; a.y += (dy / d) * left; a.dist += left * TS; left = 0;
          }
        }
        if (a.id === '男魂くん' && Math.floor(a.dist / 16) !== a.stepN) { a.stepN = Math.floor(a.dist / 16); audio.sfx('step'); }
      }
      if (a.hopT > 0) a.hopT = Math.max(0, a.hopT - dt);
      if (a.bowT > 0) a.bowT = Math.max(0, a.bowT - dt);
      if (a.shakeT > 0) a.shakeT = Math.max(0, a.shakeT - dt);
      if (a.emote) { a.emote.t += dt; if (a.emote.t > a.emote.dur) a.emote = null; }
    }

    // 命令。戻り値が関数なら、それが true を返すまで次へ進まない
    const CMD = {
      map(mid, cx, cy, opt) {
        setMap(mid, cx, cy);
        st.actors = {};
        st.props = {};
        // 前の場所で、まだ終わっていない「+」の命令（ゆっくり歩く人など）は、ここで打ち切る。
        // 消えた人は動かないので、待っていると寸劇が終わらない（セリフをタップでとばしたときなど）
        st.bg = [];
        if (opt) {
          if ('light' in opt) st.light = opt.light;
          if ('weather' in opt) st.weather = opt.weather;
        }
      },
      cam(x, y, sec) {
        const from = { x: st.cam.x, y: st.cam.y };
        const dur = reduceMotion ? 0 : sec != null ? sec : 1;
        let t = 0;
        if (dur <= 0) { st.cam.x = x; st.cam.y = y; return null; }
        return (dt) => {
          t = Math.min(dur, t + dt);
          const k = t / dur, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          st.cam.x = from.x + (x - from.x) * e;
          st.cam.y = from.y + (y - from.y) * e;
          return t >= dur;
        };
      },
      put(who, x, y, dir, opt) { place(who, x, y, dir, opt); },
      hide(who) { arr(who).forEach((w) => { const a = st.actors[w]; if (a) a.hidden = true; }); },
      walk(who, x, y, opt) {
        let pts, op;
        if (Array.isArray(x)) { pts = x; op = y || {}; } else { pts = [[x, y]]; op = opt || {}; }
        const a = actor(who);
        if (!a) return null;
        route(a, pts, op);
        return () => !a.path || st.actors[who] !== a;
      },
      face(who, dir) { arr(who).forEach((w) => { const a = actor(w); if (a) a.dir = dir; }); },
      hop(who, n) {
        const list = arr(who).map(actor).filter(Boolean);
        list.forEach((a) => { a.hopN = n || 2; a.hopT = (n || 2) * 0.22; });
        audio.sfx('jump');
        return () => list.every((a) => a.hopT <= 0);
      },
      bow(who) {
        const list = arr(who).map(actor).filter(Boolean);
        list.forEach((a) => { a.bowT = 0.7; });
        return () => list.every((a) => a.bowT <= 0);
      },
      shake(who, sec) {
        const list = arr(who).map(actor).filter(Boolean);
        list.forEach((a) => { a.shakeT = sec || 0.6; });
        return () => list.every((a) => a.shakeT <= 0);
      },
      emote(who, icon, sec) {
        const dur = sec || 1.4;
        if (Array.isArray(who) && typeof who[0] === 'number') {
          const key = '@' + who.join(',');
          st.props[key] = { kind: 'emote', x: who[0], y: who[1], emote: { icon, t: 0, dur } };
        } else arr(who).forEach((w) => { const a = actor(w); if (a) a.emote = { icon, t: 0, dur }; });
        if (icon === '!' || icon === '!!' || icon === '!?') audio.sfx('surprise');
        else if (icon === '?') audio.sfx('hatena');
        let t = 0;
        return (dt) => (t += dt) >= Math.min(dur, 0.7);
      },
      say(who, text) {
        const c = st.actors[who] || cast[who];
        const name = who == null || who === '' ? '' : c ? c.name : String(who);
        const s = st.say = { who, name, text: String(text), n: 0, full: false, hold: 0, lastSfx: -1 };
        s.len = [...s.text.replace(/\n/g, '')].length;
        s.wait = Math.min(4.5, 1.0 + s.len * 0.08); // 読める時間（文字が出きってから）
        return () => s.next;
      },
      wait(sec) {
        if (isText(sec)) { const a = st.actors[sec]; return () => !a || !a.path; }
        let t = 0;
        return (dt) => (t += dt) >= sec;
      },
      sfx(name) { audio.sfx(name); },
      bgm(name) { if (name) audio.bgm(name); else audio.stop(); },
      fade(dir, sec) {
        st.fadeTo = dir === 'out' ? 1 : 0;
        st.fadeSpeed = 1 / Math.max(0.05, sec || 0.35);
        if (reduceMotion) st.fade = st.fadeTo;
        return () => st.fade === st.fadeTo;
      },
      quake(power, sec) { if (!reduceMotion) { st.quakeP = power || 3; st.quake = sec || 0.3; } },
      light(name) { st.light = name; },
      weather(name) { st.weather = name || null; },
      win(pos) { st.win = pos === 'top' ? 'top' : 'bottom'; },
      set(who, props, fx) {
        arr(who).forEach((w) => {
          const a = actor(w);
          if (!a) return;
          Object.assign(a, props);
          if (fx === 'poof') puff(a.x, a.y);
        });
        if (fx === 'poof') {
          audio.sfx('poof');
          let t = 0;
          return (dt) => (t += dt) >= 0.45;
        }
        return null;
      },
      prop(name, kind, x, y, opt) {
        if (!kind) { delete st.props[name]; return; }
        st.props[name] = Object.assign({ kind, x, y }, opt || {});
      },
      card(text, sec) {
        const c = st.card = { text: String(text), t: 0, dur: sec || 2.6 };
        audio.sfx('stamp');
        return () => c.next;
      },
    };
    function puff(x, y) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        st.puffs.push({ x: x * TS + 8, y: y * TS + 4, vx: Math.cos(a) * 26, vy: Math.sin(a) * 16 - 6, t: 0 });
      }
    }

    const CLEARS = new Set(['say', 'card', 'map', 'fade', 'walk', 'win']); // 読み終わったウインドウを片づける命令
    function startStep(step) {
      let name = step[0];
      let bg = false;
      if (name[0] === '+') { bg = true; name = name.slice(1); }
      if (st.say && st.say.stale && CLEARS.has(name)) st.say = null;
      const fn = CMD[name];
      if (!fn) { console.warn('寸劇「' + id + '」: 知らない命令です: ' + name); return null; }
      let task = null;
      try { task = fn.apply(null, step.slice(1)); } catch (e) { console.error('寸劇「' + id + '」の ' + (st.i + 1) + ' 番目（' + name + '）でエラー:', e); }
      if (!task) return null;
      if (bg) { st.bg.push(task); return null; }
      return task;
    }
    function finish() {
      if (st.ended) return;
      st.ended = true;
      if (o.onEnd) o.onEnd();
    }

    const scene = {
      name: 'skit',
      skitId: id,
      st,
      enter() {
        if (def.bgm !== undefined) { if (def.bgm) audio.bgm(def.bgm); else audio.stop(); }
      },
      update(dt0) {
        if (st.ended) return;
        // START で、まるごととばす
        if (input.pressed('pause')) { audio.sfx('ok'); st.done = true; finish(); return; }
        const tap = input.pressed('a') || !!input.tap;
        const ff = input.held('a') || input.pointer.down; // おしっぱなしで早送り
        let dt = dt0 * (ff && !tap ? 3 : 1);
        st.t += dt;
        // 暗転
        if (st.fade !== st.fadeTo) {
          st.fade = st.fadeTo > st.fade ? Math.min(st.fadeTo, st.fade + dt * st.fadeSpeed) : Math.max(st.fadeTo, st.fade - dt * st.fadeSpeed);
        }
        if (st.quake > 0) st.quake -= dt;
        for (const a of Object.values(st.actors)) updateActor(a, dt);
        for (const [k, p] of Object.entries(st.props)) if (p.emote && (p.emote.t += dt) > p.emote.dur) delete st.props[k];
        st.puffs = st.puffs.filter((p) => (p.t += dt) < 0.5);
        st.puffs.forEach((p) => { p.x += p.vx * dt; p.y += p.vy * dt; });
        st.bg = st.bg.filter((task) => !task(dt));
        // セリフ
        const s = st.say;
        if (s && !s.next) {
          if (!s.full) {
            s.n += dt * 26;
            if (Math.floor(s.n / 2) !== s.lastSfx) { s.lastSfx = Math.floor(s.n / 2); audio.sfx('text'); }
            if (s.n >= s.len) { s.n = s.len; s.full = true; }
            if (tap) { s.n = s.len; s.full = true; }
          } else {
            s.hold += dt;
            if (tap || s.hold >= s.wait) s.next = true;
          }
        }
        const c = st.card;
        if (c && !c.next) {
          c.t += dt;
          if ((tap && c.t > 0.3) || c.t >= c.dur) c.next = true;
        }
        // 台本を進める（すぐ終わる命令は、同じコマでまとめて）
        for (let guard = 0; guard < 50 && !st.done; guard++) {
          if (st.cur) {
            if (!st.cur(dt)) break;
            st.cur = null;
            // 読み終わったセリフのウインドウは、次のセリフ・紙・場所がわり・暗転・歩きだすまで残す（▼なし）。
            // おじぎや「！」の間にウインドウが消えたり出たりして、ちらつかないように
            if (st.say && st.say.next) st.say.stale = true;
            if (st.card && st.card.next) st.card = null;
            st.i++;
            continue;
          }
          if (st.i >= def.steps.length) { st.done = true; break; }
          const task = startStep(def.steps[st.i]);
          if (task) { st.cur = task; dt = 0; } else st.i++;
        }
        if (st.done && !st.bg.length) {
          st.endT = (st.endT || 0) + dt0;
          if (st.endT > 0.15) finish();
        }
      },
      draw() {
        const t = st.t;
        const m = st.map;
        const ctx = g.ctx;
        ctx.save();
        if (st.quake > 0) ctx.translate(Math.round((Math.random() * 2 - 1) * st.quakeP), Math.round((Math.random() * 2 - 1) * st.quakeP));
        const ox = Math.round(st.cam.x * TS), oy = Math.round(st.cam.y * TS);
        R(-4, -4, W + 8, H + 8, m && m.kind === 'ext' ? '#2f3f2a' : '#17111c');
        if (oy < 0) { // 地図の上に空が見える（屋上など）
          if (st.light === 'night') nightSky(-oy, t);
          else sunsetSky(-oy, t);
        }
        if (m && m.bg) {
          ctx.drawImage(m.bg, -ox, -oy);
          if (m.anim && window.DORM) window.DORM.art.drawAnim(ctx, m, ox, oy, t * 1000);
          drawLight(m, ox, oy, 'under');
          // 人が立っているドアは開ける
          for (const a of Object.values(st.actors)) {
            if (a.hidden) continue;
            for (const [tx, ty] of [[Math.round(a.x), Math.round(a.y)], [Math.floor(a.x), Math.floor(a.y)], [Math.ceil(a.x), Math.ceil(a.y)]]) {
              const ch = tileAt(m, tx, ty);
              if (ch === '+' || ch === 'N') window.DORM.art.drawDoor(ctx, m, tx, ty, tx * TS - ox, ty * TS - oy, ch, true);
            }
          }
        }
        // 奥から順に（足もとの y で）
        const list = [];
        for (const a of Object.values(st.actors)) if (!a.hidden) list.push({ y: a.y * TS + 15.5, f: () => drawActor(a, ox, oy, t) });
        for (const p of Object.values(st.props)) if (p.kind !== 'emote') list.push({ y: p.y * TS + 14, f: () => drawProp(p, Math.round(p.x * TS - ox), Math.round(p.y * TS - oy), t) });
        if (m && m.tall) for (const tl of m.tall) {
          const sx = tl.x * TS - ox, sy = tl.y * TS - oy;
          if (sx < -56 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
          list.push({ y: (tl.y + (tl.h || 1) - 1) * TS + 15, f: () => window.DORM.art.drawTallExt(ctx, tl.ch, tl.x, tl.y, sx, sy, t) });
        }
        list.sort((a, b) => a.y - b.y);
        list.forEach((it) => it.f());
        // 吹き出しは、いちばん上に
        for (const a of Object.values(st.actors)) {
          if (a.hidden || !a.emote) continue;
          const p = spritePos(a, ox, oy);
          drawEmote(a.emote, p.x + 8, p.y + (a.pose === 'sit' ? 5 : 0) - (a.hen ? 7 : 0), a.emote.t);
        }
        for (const p of Object.values(st.props)) if (p.emote) drawEmote(p.emote, Math.round(p.x * TS - ox) + 8, Math.round(p.y * TS - oy) + 2, p.emote.t);
        // いま話している人の頭の上に、小さい ▼
        const sp = st.say && !st.say.stale && st.actors[st.say.who];
        if (sp && !sp.hidden && !sp.emote && st.actors && Object.keys(st.actors).length > 1) {
          const p = spritePos(sp, ox, oy);
          const mx = p.x + 8, my = p.y + (sp.pose === 'sit' ? 1 : -5) - (sp.hen ? 7 : 0) + (g.blink(2) ? 0 : 1);
          R(mx - 3, my - 1, 7, 1, P.ink); R(mx - 3, my, 7, 1, P.white); R(mx - 2, my + 1, 5, 1, P.white); R(mx - 1, my + 2, 3, 1, P.white); R(mx, my + 3, 1, 1, P.white);
          R(mx - 4, my, 1, 1, P.ink); R(mx + 4, my, 1, 1, P.ink); R(mx - 3, my + 1, 1, 1, P.ink); R(mx + 3, my + 1, 1, 1, P.ink);
          R(mx - 2, my + 2, 1, 1, P.ink); R(mx + 2, my + 2, 1, 1, P.ink); R(mx - 1, my + 3, 1, 1, P.ink); R(mx + 1, my + 3, 1, 1, P.ink); R(mx, my + 4, 1, 1, P.ink);
        }
        st.puffs.forEach((p) => {
          const r = 3 + Math.round(p.t * 10);
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - p.t * 2);
          g.disc(p.x - ox, p.y - oy, r, P.white);
          ctx.restore();
        });
        if (m) drawLight(m, ox, oy, 'over');
        if (st.weather && !(st.weather === 'rain' && m && m.kind === 'in')) particles(st.weather, t);
        ctx.restore();
        // 暗転（ファミコンらしく 3 段階）
        if (st.fade > 0) {
          ctx.save();
          ctx.globalAlpha = [0, 0.4, 0.75, 1][Math.ceil(st.fade * 3)];
          R(0, 0, W, H, P.black);
          ctx.restore();
        }
        if (st.card) drawCard(st.card);
        if (st.say) drawSay(st.say);
        // とばし方（ウインドウと反対のはしに。ボタンが出ていなければ、キーボードの Esc）
        const hy = st.win === 'top' ? H - 13 : 2;
        g.text((keysShown() ? 'Esc' : 'START') + '：とばす', W - 4, hy, { size: 12, align: 'right', col: P.lgray, outline: P.black });
      },
      get info() {
        return {
          id, step: st.i, steps: def.steps.length, done: st.done, line: st.say && !st.say.stale ? st.say.text : null, map: st.map ? st.map.id : null,
          cam: { x: st.cam.x, y: st.cam.y }, t: st.t, full: !!(st.say && st.say.full), box: st.say ? st.box || null : null,
          actors: Object.values(st.actors).map((a) => ({ id: a.id, x: a.x, y: a.y, dir: a.dir, hidden: a.hidden, walking: !!a.path })),
        };
      },
    };

    function spritePos(a, ox, oy) {
      let x = Math.round(a.x * TS - ox), y = Math.round(a.y * TS - oy) - 8;
      if (a.hopT > 0) {
        const per = 0.22, k = (a.hopT % per) / per;
        y -= Math.round(Math.sin(k * Math.PI) * 5);
      }
      if (a.shakeT > 0) x += Math.floor(st.t * 30) % 2 ? 1 : -1;
      return { x, y };
    }
    function drawActor(a, ox, oy, t) {
      const p = spritePos(a, ox, oy);
      const side = a.dir === 'left' || a.dir === 'right';
      const k = a.path ? Math.floor(a.dist / 6) % 4 : 0;
      const frame = k % 2;
      const flip = !side && k === 3;
      const talking = st.say && st.say.who === a.id && !st.say.full && Math.floor(t * 8) % 2;
      const img = OTK.person(a.kind, { dir: a.dir, frame, variant: a.v, naked: a.naked });
      const ctx = g.ctx;
      if (a.pose === 'lie') { // 寝ころぶ（頭が左）
        g.shadow(p.x + 20, p.y + 21, 12);
        ctx.save();
        ctx.translate(p.x + 20, p.y + 12);
        ctx.rotate(-Math.PI / 2);
        ctx.drawImage(OTK.person(a.kind, { dir: 'down', variant: a.v, naked: a.naked }), -8, -12);
        ctx.restore();
        return;
      }
      if (a.pose === 'sit') { // すわる（腰から下は机や床にかくれる）
        ctx.drawImage(img, 0, 0, 16, 18, p.x, p.y + 5 - (talking ? 1 : 0), 16, 18);
        if (a.item) drawItem(a.item, p.x, p.y + 4, a.dir, t);
        return;
      }
      g.shadow(p.x + 8, Math.round(a.y * TS - oy) + 15, 6);
      const dy = talking ? -1 : 0;
      if (a.bowT > 0) { // おじぎ：頭を下げる
        const k2 = Math.sin(Math.min(1, (0.7 - a.bowT) / 0.7) * Math.PI);
        const d = Math.round(k2 * 4);
        ctx.drawImage(img, 0, 12, 16, 12, p.x, p.y + 12, 16, 12);
        ctx.drawImage(img, 0, 0, 16, 12, p.x, p.y + d, 16, 12);
      } else if (flip) g.sprite(img, p.x, p.y + dy, { flip: true });
      else g.sprite(img, p.x, p.y + dy);
      if (a.stubble) { // うっすら青ひげ（あごのまわり）。横向きは口の下とほおに
        const s1 = '#7c8ca8', s2 = '#8c9cb8', y9 = p.y + 9 + dy;
        if (a.dir === 'down') { R(p.x + 6, y9, 1, 1, s1); R(p.x + 9, y9, 1, 1, s1); R(p.x + 6, y9 + 1, 4, 1, s2); }
        else if (a.dir === 'left') { R(p.x + 4, y9, 4, 1, s2); R(p.x + 4, y9 - 1, 1, 1, s1); R(p.x + 6, y9 - 1, 1, 1, s1); }
        else if (a.dir === 'right') { R(p.x + 8, y9, 4, 1, s2); R(p.x + 11, y9 - 1, 1, 1, s1); R(p.x + 9, y9 - 1, 1, 1, s1); }
      }
      if (a.hen) hen(p.x + 3, p.y - 6 + dy); // とりのおばちゃんの目じるし（ミニゲーム「女子100人勧誘」と同じ）
      if (a.item) drawItem(a.item, p.x, p.y + dy, a.dir, t);
    }
    // 頭の上のニワトリ（js/otoko/games/gakusai.js と同じ絵）
    function hen(x, y) {
      R(x + 1, y + 2, 6, 4, P.white); R(x, y + 3, 1, 2, P.white); R(x + 5, y, 3, 3, P.white);
      R(x + 6, y - 1, 2, 1, P.red); R(x + 8, y + 1, 2, 1, P.yellow); R(x + 6, y + 1, 1, 1, P.ink);
      R(x + 7, y + 3, 1, 1, P.red); R(x + 2, y + 3, 3, 1, P.lgray); R(x + 3, y + 6, 1, 1, P.yellow); R(x + 5, y + 6, 1, 1, P.yellow);
    }
    // 明かり。'under' は地図の上（人の下）、'over' は全体
    function drawLight(m, ox, oy, layer) {
      const L = st.light;
      const ctx = g.ctx;
      if (L === 'night') {
        if (layer === 'under') {
          if (m.kind === 'ext') {
            ctx.save();
            ctx.globalAlpha = 0.62;
            R(0, -oy, W, m.h * TS, '#080a2c');
            ctx.restore();
            // 窓の明かり（半分くらい）
            facadeWindows(m).forEach((w, i) => {
              if (((w.k * 7 + 3) % 10) < 5) return;
              const x = w.x - ox, y = w.y - oy;
              if (x > W || x + w.w < 0) return;
              for (let j = 0; j < w.h; j++) R(x, y + j, w.w, 1, j < w.h / 2 ? '#ffd68a' : '#ffb860');
              R(x + Math.round(w.w / 2), y, 1, w.h, '#c88c48');
              void i;
            });
            // 街灯
            for (const tl of m.tall || []) {
              if (tl.ch !== 'L') continue;
              const lx = tl.x * TS - ox + 8, ly = tl.y * TS - oy + 14;
              ctx.save();
              ctx.globalAlpha = 0.22;
              g.oval(lx, ly, 22, 7, '#fff1c0');
              ctx.restore();
            }
          } else {
            // 屋内：窓の外は夜
            for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
              if (m.rows[y][x] !== 'w' || !window.DORM.mapUtil.isOpen(tileAt(m, x, y + 1))) continue;
              const px = x * TS - ox, py = y * TS - oy;
              if (px < -16 || px > W || py < -16 || py > H) continue;
              R(px + 1, py + 4, 14, 7, '#1c2048');
              if ((x * 5 + y) % 3 === 0) R(px + 4 + (x % 3) * 3, py + 5, 1, 1, P.lyellow);
            }
          }
        } else {
          ctx.save();
          ctx.globalAlpha = m.kind === 'in' ? 0.34 : 0.18;
          R(0, 0, W, H, '#10104a');
          ctx.restore();
        }
        return;
      }
      if (L === 'rain' && layer === 'under' && m.kind === 'in') {
        for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
          if (m.rows[y][x] !== 'w' || !window.DORM.mapUtil.isOpen(tileAt(m, x, y + 1))) continue;
          const px = x * TS - ox, py = y * TS - oy;
          if (px < -16 || px > W || py < -16 || py > H) continue;
          R(px + 1, py + 4, 14, 7, '#6c7c94');
          for (let i = 0; i < 3; i++) R(px + 2 + ((i * 5 + x * 3) % 12), py + 4 + Math.floor((st.t * 14 + i * 3 + x) % 6), 1, 2, '#c8d4e4');
        }
      }
      if (layer !== 'over') return;
      if (L === 'sunset') {
        ctx.save();
        ctx.globalAlpha = 0.16;
        R(0, 0, W, H, '#ff8048');
        ctx.restore();
      } else if (L === 'rain') {
        ctx.save();
        ctx.globalAlpha = 0.14;
        R(0, 0, W, H, '#283c64');
        ctx.restore();
      } else if (L === 'autumn') {
        ctx.save();
        ctx.globalAlpha = 0.1;
        R(0, 0, W, H, '#f89838');
        ctx.restore();
      }
    }
    function drawSay(s) {
      const lines = g.wrap(s.text, W - 28, 16); // 1 行に全角 14 文字まで
      if (lines.length > 3 && !s.warned) { s.warned = true; console.warn('寸劇「' + id + '」のセリフが 3 行をこえています: ' + s.text); }
      const shownN = Math.floor(s.n);
      const h = Math.max(2, Math.min(3, lines.length)) * 20 + 18;
      const y = st.win === 'top' ? 22 : H - h - 6;
      st.box = { x: 6, y, w: W - 12, h, lines: lines.length };
      g.box(6, y, W - 12, h, { fill: s.name ? P.blue : P.navy });
      if (s.name) {
        const nw = g.measure(s.name, 12) + 14;
        g.box(12, y - 16, nw, 20, { fill: P.navy });
        g.text(s.name, 19, y - 13, { size: 12, col: P.lyellow });
      }
      // 1 行まるごとの文字の絵を使い、出ている所まで切りぬいて見せる（1 文字ごとに文字の絵を作らない）
      let left = shownN;
      lines.slice(0, 3).forEach((l, i) => {
        const chars = [...l];
        const n = Math.max(0, Math.min(chars.length, left));
        left -= chars.length;
        if (!n) return;
        const ty = y + 10 + i * 20;
        const part = n < chars.length;
        if (part) {
          g.ctx.save();
          g.ctx.beginPath();
          g.ctx.rect(13, ty - 2, g.measure(chars.slice(0, n).join(''), 16) + 1, 22);
          g.ctx.clip();
        }
        g.text(l, 14, ty, { col: P.white });
        if (part) g.ctx.restore();
      });
      if (s.full && !s.stale && g.blink(2)) g.text('▼', W - 20, y + h - 17, { size: 12 });
    }
    function drawCard(c) {
      const k = Math.min(1, c.t / 0.18);
      const s = 0.4 + 0.6 * k;
      const ls = c.text.split('\n');
      const w = Math.min(W - 16, Math.max(168, ...ls.map((l) => g.measure(l, 32) + 28))), h = 92;
      const ctx = g.ctx;
      ctx.save();
      ctx.translate(W / 2, 92);
      ctx.rotate(-0.04);
      ctx.scale(s, s);
      R(-w / 2 + 4, -h / 2 + 4, w, h, 'rgba(0,0,0,0.4)');
      R(-w / 2, -h / 2, w, h, P.ink);
      R(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, '#fcf8ec');
      R(-w / 2 + 6, -h / 2 + 6, w - 12, 1, '#e0d8c0');
      ls.forEach((l, i) => g.text(l, 0, -ls.length * 17 + 4 + i * 34, { size: 32, align: 'center', col: P.red }));
      ctx.restore();
    }
    return scene;
  }

  OTK.skit = {
    create,
    has: (id) => !!(OTK.SKITS && OTK.SKITS[id]),
    ids: () => Object.keys(OTK.SKITS || {}),
    // 地図（寮さんぽの地図と、寸劇だけの地図）。テスト用
    map: mapOf,
    maps: () => (DORM() ? Object.keys(DORM().WORLD.maps) : []).concat(Object.keys(OTK.SKIT_MAPS || {})),
  };
})();
