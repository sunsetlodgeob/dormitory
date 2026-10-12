/*
 * 夕照寮 ― ドット絵の描画
 * 画像ファイルは使わず、すべてコードで 1 ドットずつ描いています。
 */
(function () {
  'use strict';
  const D = (window.DORM = window.DORM || {});
  const TS = 16;
  D.TS = TS;

  // ── パレット ────────────────────────────────────
  const P = {
    ink: '#2a2026',
    wallTop: '#3d332e', wallTopHi: '#5f5148', wallTopDot: '#352c28',
    plaster: '#e4d6b8', plasterHi: '#ede2c9', plasterSh: '#cdbd9c', base: '#7a5a3c', baseHi: '#94704c',
    tileWall: '#d9e4e8', tileWallLn: '#b7c9d0', tileWhite: '#e3e3dc', tileWhiteLn: '#c6c7be',
    ptA: '#bcb7a0', ptB: '#b1ac95', ptLn: '#a6a18a',
    woodA: '#c89d65', woodB: '#ba8f59', woodSeam: '#94693e', woodHi: '#d8b07a',
    tatA: '#c6c27e', tatB: '#b6b26d', heri: '#3f5b3d',
    doma: '#a19b90', domaA: '#8b857a', domaB: '#bab4a8',
    bathA: '#e1ecf0', bathLn: '#b9cfd8',
    washA: '#dcdfda', washLn: '#bcc1bb',
    kitA: '#dacaa6', kitB: '#cfbd96',
    roofA: '#8f9087', roofB: '#86877e', roofSeam: '#76776e', roofHi: '#a3a49a',
    wood: '#8e5c2e', woodLt: '#ad7a45', woodDk: '#6a4322', woodXd: '#4f311a',
    metal: '#c5cacd', metalLt: '#e1e5e7', metalDk: '#979ea3', metalXd: '#6d7378',
    white: '#f3f0e6', whiteSh: '#d9d4c6',
    sheet: '#f1eee4', sheetSh: '#d6d1c2',
    alu: '#cfd5d9', aluDk: '#9aa3a9',
    glassA: '#f2b07e', glassB: '#f9d9a6', glassHi: '#fff1d6', glassNight: '#7f8fb5',
    door: '#a26f40', doorDk: '#7d5330', doorFrame: '#5c3c22', plate: '#f4f1e8',
    felt: '#3f7a52', feltDk: '#2f6040', ivory: '#efe8d2',
    futonA: '#c9483c', futonB: '#e07a4a', mikan: '#f39a2a',
    tvBody: '#5b5550', tvDk: '#3b3633', screen: '#7fa9b8',
    water: '#5ba6c9', waterHi: '#8fd0ea', waterDk: '#3f87ab',
    pink: '#f08aa8', pinkDk: '#c9607e',
    noren: '#2f4a7a', norenDk: '#233a62',
    grassA: '#6e9b47', grassB: '#5f8b3d', grassC: '#80ad55', grassD: '#4f7a34',
    path: '#cdbd98', pathLn: '#ad9d78', pathHi: '#dccda9',
    asphalt: '#56565e', asphaltDot: '#62626b', asphaltDk: '#4a4a52', line: '#e9e5da',
    leafA: '#3f6b3a', leafB: '#52864a', leafC: '#2e5130', leafHi: '#6a9c58',
    sakA: '#f7ccd8', sakB: '#eaa2b8', sakC: '#fde8ef', sakD: '#d98aa3',
    trunk: '#5b3b2a', trunkDk: '#3f281d',
    conc: '#c9c2b4', concHi: '#dbd5c9', concSh: '#aaa294', concDk: '#8c8578', concXd: '#6f685d',
    hedgeA: '#4f7f3f', hedgeB: '#416d34', hedgeHi: '#6a9a52',
  };
  D.PAL = P;

  // ── 小道具 ──────────────────────────────────────
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function R(ctx, x, y, w, h, col) {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  }
  // 決まった座標から決まった乱数（0〜1）
  function rnd(x, y, s) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function disc(ctx, cx, cy, r, col) {
    for (let dy = -r; dy <= r; dy++) {
      const hw = Math.floor(Math.sqrt((r + 0.5) * (r + 0.5) - dy * dy));
      R(ctx, cx - hw, cy + dy, hw * 2 + 1, 1, col);
    }
  }
  D.art = { canvas, R, rnd, mix, disc };

  // ── マップ参照 ──────────────────────────────────
  const WALL = new Set('#wBAeMYQnH'.split(''));
  const FLOOR = new Set('.,=_~;-%":^'.split(''));
  function at(map, x, y) {
    if (y < 0 || y >= map.h || x < 0 || x >= map.w) return ' ';
    return map.rows[y][x];
  }
  function isWall(ch) {
    return WALL.has(ch);
  }
  function isOpen(ch) {
    return ch !== ' ' && ch !== '@' && !WALL.has(ch);
  }
  function baseFloor(map, x, y) {
    const order = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [dx, dy] of order) {
      const c = at(map, x + dx, y + dy);
      if (FLOOR.has(c)) return c;
    }
    return map.kind === 'ext' ? '"' : map.kind === 'roof' ? '%' : ',';
  }
  function labelAt(map, x, y) {
    for (const l of map.labels) if (x >= l.x && x < l.x + l.w && y >= l.y && y < l.y + l.h) return l.name;
    return null;
  }
  D.mapUtil = { at, isWall, isOpen, labelAt };

  // ── 床 ────────────────────────────────────────
  function drawFloor(ctx, ch, x, y, px, py) {
    switch (ch) {
      case '.': { // Pタイルの廊下
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) R(ctx, px + i * 8, py + j * 8, 8, 8, (x * 2 + i + y * 2 + j) & 1 ? P.ptA : P.ptB);
        R(ctx, px, py, 16, 1, P.ptLn);
        R(ctx, px, py, 1, 16, P.ptLn);
        if (rnd(x, y, 3) < 0.25) R(ctx, px + 3 + ((rnd(x, y, 4) * 9) | 0), py + 4 + ((rnd(x, y, 5) * 8) | 0), 2, 1, P.ptLn);
        break;
      }
      case ',': { // フローリング
        R(ctx, px, py, 16, 16, P.woodA);
        for (let r = 0; r < 4; r++) {
          const yy = py + r * 4;
          if ((r + x) & 1) R(ctx, px, yy, 16, 3, P.woodB);
          R(ctx, px, yy + 3, 16, 1, P.woodSeam);
          const sx = (rnd(x, y * 4 + r, 1) * 14) | 0;
          R(ctx, px + sx, yy, 1, 3, P.woodSeam);
          R(ctx, px + ((sx + 6) % 14), yy + 1, 3, 1, P.woodHi);
        }
        break;
      }
      case '=': { // 畳（半畳を市松に）
        const v = (x + y) & 1;
        R(ctx, px, py, 16, 16, P.tatA);
        if (v) for (let i = 1; i < 16; i += 2) R(ctx, px + i, py, 1, 16, P.tatB);
        else for (let i = 1; i < 16; i += 2) R(ctx, px, py + i, 16, 1, P.tatB);
        if (v) R(ctx, px, py, 1, 16, P.heri);
        else R(ctx, px, py, 16, 1, P.heri);
        break;
      }
      case '_': { // 土間（人研ぎ風）
        R(ctx, px, py, 16, 16, P.doma);
        for (let i = 0; i < 14; i++) {
          const rx = (rnd(x, y, i) * 16) | 0, ry = (rnd(x, y, i + 40) * 16) | 0;
          R(ctx, px + rx, py + ry, 1, 1, i & 1 ? P.domaA : P.domaB);
        }
        break;
      }
      case '~': { // 浴室タイル
        R(ctx, px, py, 16, 16, P.bathA);
        for (let i = 0; i < 16; i += 4) {
          R(ctx, px + i, py, 1, 16, P.bathLn);
          R(ctx, px, py + i, 16, 1, P.bathLn);
        }
        break;
      }
      case ';': { // 洗面・トイレのタイル
        R(ctx, px, py, 16, 16, P.washA);
        R(ctx, px + 8, py, 1, 16, P.washLn);
        R(ctx, px, py + 8, 16, 1, P.washLn);
        R(ctx, px, py, 1, 16, P.washLn);
        R(ctx, px, py, 16, 1, P.washLn);
        break;
      }
      case '-': { // 食堂・台所の床
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) R(ctx, px + i * 8, py + j * 8, 8, 8, (i + j) & 1 ? P.kitA : P.kitB);
        break;
      }
      case '%': { // 屋上の防水シート
        R(ctx, px, py, 16, 16, P.roofA);
        if (x % 3 === 0) R(ctx, px, py, 1, 16, P.roofSeam);
        if (y % 4 === 0) R(ctx, px, py, 16, 1, P.roofB);
        for (let i = 0; i < 4; i++) R(ctx, px + ((rnd(x, y, i) * 16) | 0), py + ((rnd(x, y, i + 9) * 16) | 0), 1, 1, i & 1 ? P.roofHi : P.roofB);
        break;
      }
      case '"': { // 芝生
        R(ctx, px, py, 16, 16, P.grassA);
        for (let i = 0; i < 7; i++) {
          const rx = (rnd(x, y, i) * 15) | 0, ry = (rnd(x, y, i + 20) * 14) | 0;
          const c = i % 3 === 0 ? P.grassC : i % 3 === 1 ? P.grassB : P.grassD;
          R(ctx, px + rx, py + ry, 1, 2, c);
          R(ctx, px + rx + 1, py + ry + 1, 1, 1, c);
        }
        break;
      }
      case ':': { // 敷石の通路
        R(ctx, px, py, 16, 16, P.path);
        for (let r = 0; r < 4; r++) {
          R(ctx, px, py + r * 4 + 3, 16, 1, P.pathLn);
          const off = r & 1 ? 4 : 0;
          R(ctx, px + off, py + r * 4, 1, 3, P.pathLn);
          R(ctx, px + off + 8, py + r * 4, 1, 3, P.pathLn);
          R(ctx, px + off + 1, py + r * 4, 3, 1, P.pathHi);
        }
        break;
      }
      case ';road':
      case '^': {
        R(ctx, px, py, 16, 16, P.asphalt);
        for (let i = 0; i < 6; i++) R(ctx, px + ((rnd(x, y, i) * 16) | 0), py + ((rnd(x, y, i + 7) * 16) | 0), 1, 1, i & 1 ? P.asphaltDot : P.asphaltDk);
        if (ch === '^' && x % 3 !== 2) R(ctx, px, py + 7, 16, 2, P.line);
        break;
      }
      default:
        R(ctx, px, py, 16, 16, P.woodA);
    }
  }

  // ── 壁 ────────────────────────────────────────
  function faceStyle(map, x, y) {
    const name = labelAt(map, x, y + 1) || '';
    if (name === '浴室') return 'bath';
    if (name === 'トイレ' || name.indexOf('洗面所') === 0 || name === '脱衣所') return 'tile';
    if (name === '厨房' || name === '補食室') return 'kitchen';
    return 'plain';
  }
  function wallFaceBase(ctx, map, x, y, px, py) {
    const st = faceStyle(map, x, y);
    R(ctx, px, py, 16, 3, P.wallTop);
    R(ctx, px, py + 2, 16, 1, P.wallTopHi);
    if (st === 'bath') {
      R(ctx, px, py + 3, 16, 13, P.tileWall);
      for (let i = 0; i < 16; i += 4) R(ctx, px + i, py + 3, 1, 13, P.tileWallLn);
      for (let j = 6; j < 16; j += 4) R(ctx, px, py + j, 16, 1, P.tileWallLn);
      return st;
    }
    R(ctx, px, py + 3, 16, 10, P.plaster);
    R(ctx, px, py + 3, 16, 1, P.plasterSh);
    R(ctx, px, py + 4, 16, 2, P.plasterHi);
    if (st === 'tile' || st === 'kitchen') {
      R(ctx, px, py + 9, 16, 7, st === 'tile' ? P.tileWhite : P.tileWall);
      for (let i = 0; i < 16; i += 4) R(ctx, px + i, py + 9, 1, 7, st === 'tile' ? P.tileWhiteLn : P.tileWallLn);
      R(ctx, px, py + 12, 16, 1, st === 'tile' ? P.tileWhiteLn : P.tileWallLn);
      R(ctx, px, py + 9, 16, 1, P.plasterSh);
    } else {
      R(ctx, px, py + 13, 16, 3, P.base);
      R(ctx, px, py + 13, 16, 1, P.baseHi);
    }
    return st;
  }

  const CURTAINS = ['#6d8fb8', '#c98a5a', '#8fae6a', '#b86a7a', '#d9c06a', '#7c6aa8', '#5f9e98'];
  function windowFace(ctx, map, x, y, px, py) {
    wallFaceBase(ctx, map, x, y, px, py);
    const lw = at(map, x - 1, y) === 'w', rw = at(map, x + 1, y) === 'w';
    const x0 = lw ? 0 : 2, x1 = rw ? 16 : 14;
    R(ctx, px + x0, py + 3, x1 - x0, 9, P.alu);
    for (let j = 0; j < 7; j++) R(ctx, px + x0 + 1, py + 4 + j, x1 - x0 - 2 + (rw ? 1 : 0) + (lw ? 1 : 0), 1, mix(P.glassA, P.glassB, j / 6));
    if (lw) R(ctx, px, py + 4, 1, 7, P.aluDk);
    // ガラスの映り込み
    R(ctx, px + x0 + 3, py + 5, 1, 1, P.glassHi);
    R(ctx, px + x0 + 2, py + 6, 1, 1, P.glassHi);
    R(ctx, px + x0 + 4, py + 4, 1, 1, P.glassHi);
    R(ctx, px + x0, py + 12, x1 - x0, 1, P.aluDk);
    const cc = CURTAINS[(rnd((x / 5) | 0, y, 7) * CURTAINS.length) | 0];
    if (!lw) {
      R(ctx, px + 2, py + 4, 3, 7, cc);
      R(ctx, px + 3, py + 4, 1, 7, mix(cc, '#000000', 0.18));
    }
    if (!rw) {
      R(ctx, px + 11, py + 4, 3, 7, cc);
      R(ctx, px + 12, py + 4, 1, 7, mix(cc, '#000000', 0.18));
    }
  }

  function wallTop(ctx, map, x, y, px, py, ch) {
    R(ctx, px, py, 16, 16, P.wallTop);
    if (rnd(x, y, 2) < 0.5) R(ctx, px + ((rnd(x, y, 3) * 14) | 0), py + ((rnd(x, y, 4) * 14) | 0), 2, 1, P.wallTopDot);
    if (isOpen(at(map, x - 1, y))) R(ctx, px, py, 1, 16, P.wallTopHi);
    if (isOpen(at(map, x + 1, y))) R(ctx, px + 15, py, 1, 16, P.wallTopHi);
    if (isOpen(at(map, x, y - 1))) R(ctx, px, py, 16, 1, P.wallTopHi);
    if (ch === 'w') {
      const horiz = isWall(at(map, x - 1, y)) || isWall(at(map, x + 1, y)) || at(map, x - 1, y) === 'E' || at(map, x + 1, y) === 'E';
      if (horiz) {
        R(ctx, px, py + 5, 16, 6, P.alu);
        R(ctx, px, py + 6, 16, 4, P.glassB);
        R(ctx, px, py + 7, 16, 1, P.glassHi);
        if (at(map, x - 1, y) !== 'w') R(ctx, px, py + 5, 1, 6, P.aluDk);
        if (at(map, x + 1, y) !== 'w') R(ctx, px + 15, py + 5, 1, 6, P.aluDk);
      } else {
        R(ctx, px + 5, py, 6, 16, P.alu);
        R(ctx, px + 6, py, 4, 16, P.glassB);
        R(ctx, px + 7, py, 1, 16, P.glassHi);
        if (at(map, x, y - 1) !== 'w') R(ctx, px + 5, py, 6, 1, P.aluDk);
        if (at(map, x, y + 1) !== 'w') R(ctx, px + 5, py + 15, 6, 1, P.aluDk);
      }
    } else if (ch === 'n') {
      // 受付・配膳カウンター（上から見た天板）
      R(ctx, px + 1, py, 14, 16, P.woodLt);
      R(ctx, px + 1, py, 1, 16, P.woodDk);
      R(ctx, px + 14, py, 1, 16, P.woodDk);
      R(ctx, px + 4, py + 3, 8, 1, P.woodHi || P.woodA);
    } else if (ch === 'H') {
      R(ctx, px, py, 16, 16, P.concHi);
      R(ctx, px, py + 14, 16, 2, P.concSh);
      R(ctx, px + ((rnd(x, y, 1) * 12) | 0), py + 6, 3, 1, P.conc);
    }
  }

  // 3x5 ドットの数字（部屋番号の表札用）
  const DIGITS = [
    '111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001',
    '111100111001111', '111100111101111', '111001001001001', '111101111101111', '111101111001111',
  ];
  function drawDigits(ctx, str, px, py, col) {
    for (let k = 0; k < str.length; k++) {
      const g = DIGITS[+str[k]];
      if (!g) continue;
      for (let i = 0; i < 15; i++) if (g[i] === '1') R(ctx, px + k * 4 + (i % 3), py + ((i / 3) | 0), 1, 1, col);
    }
  }

  function roomNumberFor(map, x, y) {
    for (const yy of [y - 1, y + 1]) {
      const n = labelAt(map, x, yy);
      if (n && /^(\d+)号室$/.test(n)) return n.replace('号室', '');
    }
    return null;
  }

  function wallFace(ctx, map, x, y, px, py, ch) {
    if (ch === 'w') return windowFace(ctx, map, x, y, px, py);
    wallFaceBase(ctx, map, x, y, px, py);
    switch (ch) {
      case 'B': { // 掲示板
        const l = at(map, x - 1, y) === 'B', r = at(map, x + 1, y) === 'B';
        const x0 = l ? 0 : 1, x1 = r ? 16 : 15;
        R(ctx, px + x0, py + 4, x1 - x0, 9, P.woodDk);
        R(ctx, px + x0 + (l ? 0 : 1), py + 5, x1 - x0 - (l ? 0 : 1) - (r ? 0 : 1), 7, '#bf9156');
        const papers = ['#f4f1e8', '#f6e7a1', '#cfe3f0', '#f4d0d6', '#f4f1e8'];
        for (let i = 0; i < 3; i++) {
          const pw = 3 + ((rnd(x, y, i) * 3) | 0), ph = 3 + ((rnd(x, y, i + 5) * 2) | 0);
          const ox = 2 + i * 4 + ((rnd(x, y, i + 9) * 2) | 0), oy = 6 + ((rnd(x, y, i + 3) * 2) | 0);
          R(ctx, px + ox, py + oy, pw, ph, papers[(rnd(x, y, i + 11) * papers.length) | 0]);
          R(ctx, px + ox + 1, py + oy, 1, 1, '#d8433a');
          R(ctx, px + ox, py + oy + 2, pw - 1, 1, '#9a9488');
        }
        break;
      }
      case 'A': { // ポスター
        const pc = ['#3f6aa8', '#d8603a', '#5d8a4a', '#7a4aa0', '#c9a23a'][(rnd(x, y, 1) * 5) | 0];
        R(ctx, px + 4, py + 4, 8, 9, P.white);
        R(ctx, px + 5, py + 5, 6, 5, pc);
        R(ctx, px + 6, py + 6, 2, 2, P.white);
        R(ctx, px + 5, py + 11, 6, 1, '#6a645a');
        break;
      }
      case 'e': { // 消火器
        R(ctx, px + 5, py + 4, 6, 3, '#d8433a');
        R(ctx, px + 6, py + 8, 4, 7, '#d8433a');
        R(ctx, px + 7, py + 8, 1, 7, '#ee7a68');
        R(ctx, px + 6, py + 7, 4, 1, '#3a302b');
        R(ctx, px + 10, py + 9, 1, 4, '#3a302b');
        R(ctx, px + 6, py + 4, 4, 1, P.white);
        break;
      }
      case 'M': { // 鏡
        R(ctx, px + 2, py + 4, 12, 7, P.metalDk);
        R(ctx, px + 3, py + 5, 10, 5, '#b9d2dc');
        R(ctx, px + 4, py + 5, 1, 4, '#e4f2f6');
        R(ctx, px + 5, py + 5, 1, 2, '#e4f2f6');
        break;
      }
      case 'Y': { // キーボックス
        R(ctx, px + 2, py + 4, 12, 9, P.woodDk);
        R(ctx, px + 3, py + 5, 10, 7, P.woodLt);
        for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) {
          R(ctx, px + 4 + i * 2 + (i > 1 ? 1 : 0), py + 6 + j * 3, 1, 2, '#e3c25a');
        }
        break;
      }
      case 'Q': { // 時計
        R(ctx, px + 5, py + 4, 6, 6, P.ink);
        R(ctx, px + 6, py + 5, 4, 4, P.white);
        R(ctx, px + 7, py + 5, 1, 2, P.ink);
        R(ctx, px + 8, py + 7, 1, 1, '#d8433a');
        break;
      }
      case 'n': {
        R(ctx, px + 1, py + 4, 14, 7, P.aluDk);
        R(ctx, px + 2, py + 5, 12, 5, '#cfe3ea');
        R(ctx, px + 8, py + 5, 1, 5, P.aluDk);
        R(ctx, px, py + 11, 16, 2, P.woodLt);
        break;
      }
      case 'H': { // 屋上の手すり壁（北側は内側の面が見える）
        R(ctx, px, py, 16, 5, P.concHi);
        R(ctx, px, py + 5, 16, 11, P.conc);
        R(ctx, px, py + 5, 16, 1, P.concSh);
        if (x % 4 === 0) R(ctx, px + 7, py + 13, 2, 3, P.concDk);
        break;
      }
    }
    // 表札（ドアの左隣）
    if (ch === '#' && at(map, x + 1, y) === '+') {
      const num = roomNumberFor(map, x + 1, y);
      if (num) {
        R(ctx, px + 1, py + 5, 15, 9, P.doorFrame);
        R(ctx, px + 2, py + 6, 13, 7, P.plate);
        drawDigits(ctx, num, px + 3, py + 7, P.ink);
      }
    }
  }

  // ── ドア・階段 ───────────────────────────────────
  function drawDoor(ctx, map, x, y, px, py, ch, open) {
    const vertical = isWall(at(map, x, y - 1)) && isWall(at(map, x, y + 1));
    if (vertical) {
      drawFloor(ctx, baseFloor(map, x, y), x, y, px, py);
      R(ctx, px, py, 16, 2, P.doorFrame);
      R(ctx, px, py + 14, 16, 2, P.doorFrame);
      if (!open) R(ctx, px + 1, py + 2, 2, 12, P.door);
      return;
    }
    R(ctx, px, py, 16, 3, P.wallTop);
    R(ctx, px, py + 2, 16, 1, P.wallTopHi);
    R(ctx, px + 1, py + 3, 14, 13, P.doorFrame);
    if (ch === 'N') {
      R(ctx, px + 2, py + 4, 12, 12, '#2a221e');
      if (!open) {
        R(ctx, px + 2, py + 4, 12, 8, P.noren);
        R(ctx, px + 4, py + 4, 1, 8, P.norenDk);
        R(ctx, px + 2, py + 4, 12, 1, P.norenDk);
        // 「ゆ」
        const yu = ['010000', '111110', '101001', '101001', '011110', '001000', '010000'];
        yu.forEach((row, j) => { for (let i = 0; i < 6; i++) if (row[i] === '1') R(ctx, px + 5 + i, py + 4 + j, 1, 1, P.white); });
      }
      return;
    }
    if (open) {
      R(ctx, px + 2, py + 4, 12, 12, '#2a221e');
      R(ctx, px + 2, py + 4, 2, 12, P.doorDk);
      return;
    }
    R(ctx, px + 2, py + 4, 12, 12, P.door);
    R(ctx, px + 3, py + 5, 10, 4, P.doorDk);
    R(ctx, px + 4, py + 6, 8, 2, P.door);
    R(ctx, px + 3, py + 11, 10, 4, P.doorDk);
    R(ctx, px + 4, py + 12, 8, 2, P.door);
    R(ctx, px + 11, py + 9, 2, 2, '#e3c25a');
  }

  function drawExitDoor(ctx, map, x, y, px, py) {
    drawFloor(ctx, '_', x, y, px, py);
    R(ctx, px, py + 9, 16, 7, P.alu);
    R(ctx, px, py + 10, 16, 5, P.glassB);
    R(ctx, px, py + 11, 16, 1, P.glassHi);
    if (at(map, x - 1, y) !== 'E') R(ctx, px, py + 9, 2, 7, P.aluDk);
    if (at(map, x + 1, y) !== 'E') R(ctx, px + 14, py + 9, 2, 7, P.aluDk);
    if (at(map, x - 1, y) === 'E' && at(map, x + 1, y) === 'E') R(ctx, px + 7, py + 9, 2, 7, P.aluDk);
    R(ctx, px + 1, py + 2, 14, 6, '#8a5a3a');
    R(ctx, px + 1, py + 2, 14, 1, '#a8744e');
  }

  function drawStairs(ctx, map, x, y, px, py, ch) {
    let top = y;
    while (at(map, x, top - 1) === ch) top--;
    let bot = y;
    while (at(map, x, bot + 1) === ch) bot++;
    const n = (bot - top + 1) * 4;
    for (let s = 0; s < 4; s++) {
      const idx = (y - top) * 4 + s;
      const col = mix('#5a4a40', '#d9cdb6', ch === 'U' ? 1 - idx / (n + 2) : 0.15 + idx / (n + 2));
      R(ctx, px, py + s * 4, 16, 4, col);
      R(ctx, px, py + s * 4, 16, 1, mix(col, '#ffffff', 0.25));
      R(ctx, px, py + s * 4 + 3, 16, 1, mix(col, '#000000', 0.2));
    }
    const L = at(map, x - 1, y), Rr = at(map, x + 1, y);
    if (isWall(L)) R(ctx, px, py, 2, 16, P.metalDk);
    if (isWall(Rr)) R(ctx, px + 14, py, 2, 16, P.metalDk);
    if ((L === 'U' || L === 'V') && L !== ch) {
      R(ctx, px, py, 2, 16, P.wallTop);
      R(ctx, px + 2, py, 1, 16, P.metal);
    }
    if ((Rr === 'U' || Rr === 'V') && Rr !== ch) {
      R(ctx, px + 14, py, 2, 16, P.wallTop);
      R(ctx, px + 13, py, 1, 16, P.metal);
    }
  }

  // ── 家具 ───────────────────────────────────────
  const BLANKETS = ['#4f6fa8', '#b8503f', '#5f8a4a', '#d0883a', '#7a5a9a', '#3f8a8a', '#a84a6a'];
  function blanket(x, y) {
    return BLANKETS[(rnd((x / 5) | 0, (y / 8) | 0, x % 5) * BLANKETS.length) | 0];
  }

  function drawFurniture(ctx, map, x, y, px, py, ch) {
    const nb = (dx, dy) => at(map, x + dx, y + dy);
    switch (ch) {
      case 'b': {
        const up = nb(0, -1) === 'b';
        const col = blanket(x, y);
        if (!up) {
          R(ctx, px + 1, py + 1, 14, 15, P.woodDk);
          R(ctx, px + 1, py + 1, 14, 2, P.woodXd);
          R(ctx, px + 2, py + 3, 12, 13, P.sheet);
          R(ctx, px + 3, py + 4, 10, 5, P.white);
          R(ctx, px + 3, py + 8, 10, 1, P.sheetSh);
          R(ctx, px + 2, py + 11, 12, 5, col);
          R(ctx, px + 2, py + 11, 12, 1, P.sheet);
        } else {
          R(ctx, px + 1, py, 14, 14, P.woodDk);
          R(ctx, px + 2, py, 12, 12, col);
          R(ctx, px + 2, py + 11, 12, 1, mix(col, '#000000', 0.25));
          R(ctx, px + 4, py + 3, 1, 6, mix(col, '#ffffff', 0.15));
          R(ctx, px + 1, py + 12, 14, 3, P.wood);
          R(ctx, px + 1, py + 15, 14, 1, P.woodXd);
        }
        break;
      }
      case 'd': {
        R(ctx, px + 1, py + 2, 14, 10, P.woodLt);
        R(ctx, px + 1, py + 2, 14, 1, P.woodHi || '#c18d55');
        R(ctx, px + 1, py + 12, 14, 3, P.wood);
        R(ctx, px + 6, py + 13, 4, 1, P.woodXd);
        R(ctx, px + 1, py + 15, 14, 1, P.woodXd);
        const k = (rnd(x, y, 1) * 3) | 0;
        const bc = ['#3f6aa8', '#d8603a', '#5d8a4a', '#c9a23a'][(rnd(x, y, 2) * 4) | 0];
        if (k === 0) { R(ctx, px + 3, py + 4, 5, 6, P.white); R(ctx, px + 4, py + 5, 3, 1, '#9a9488'); R(ctx, px + 4, py + 7, 3, 1, '#9a9488'); }
        else { R(ctx, px + 3, py + 5, 6, 2, bc); R(ctx, px + 3, py + 7, 6, 2, mix(bc, '#ffffff', 0.3)); }
        R(ctx, px + 11, py + 3, 3, 2, '#e8e2c8');
        R(ctx, px + 12, py + 5, 1, 4, P.metalDk);
        R(ctx, px + 11, py + 9, 3, 1, P.metalXd);
        break;
      }
      case 'c': {
        const deskAbove = 'dt'.includes(nb(0, -1));
        if (labelAt(map, x, y) === '食堂') {
          R(ctx, px + 4, py + 5, 8, 7, P.woodLt);
          R(ctx, px + 4, py + 5, 8, 1, '#c99460');
          R(ctx, px + 4, deskAbove ? py + 11 : py + 3, 8, 2, P.wood);
          R(ctx, px + 4, py + 12, 1, 2, P.woodDk);
          R(ctx, px + 11, py + 12, 1, 2, P.woodDk);
          break;
        }
        R(ctx, px + 4, py + 5, 8, 7, '#4a5a6a');
        R(ctx, px + 5, py + 6, 6, 5, '#5c6e80');
        if (deskAbove) R(ctx, px + 4, py + 11, 8, 3, '#3a4654');
        else R(ctx, px + 4, py + 3, 8, 3, '#3a4654');
        R(ctx, px + 7, py + 12, 2, 2, P.metalXd);
        break;
      }
      case 'K': {
        const l = nb(-1, 0) === 'K', r = nb(1, 0) === 'K';
        const x0 = l ? 0 : 1, x1 = r ? 16 : 15;
        R(ctx, px + x0, py + 1, x1 - x0, 3, '#bfa27a');
        R(ctx, px + x0, py + 4, x1 - x0, 12, '#d6bd92');
        R(ctx, px + x0, py + 4, x1 - x0, 1, '#a88a62');
        if (!l) R(ctx, px + x0, py + 1, 1, 15, '#a88a62');
        if (!r) R(ctx, px + x1 - 1, py + 1, 1, 15, '#a88a62');
        R(ctx, px + 8, py + 5, 1, 11, '#a88a62');
        R(ctx, px + 6, py + 9, 1, 2, P.metalXd);
        R(ctx, px + 10, py + 9, 1, 2, P.metalXd);
        break;
      }
      case 'k': {
        R(ctx, px + 1, py + 1, 14, 15, P.woodDk);
        R(ctx, px + 2, py + 2, 12, 13, P.woodXd);
        for (let s = 0; s < 3; s++) {
          let bx = px + 2;
          let i = 0;
          while (bx < px + 14) {
            const w = 1 + ((rnd(x, y * 7 + s, i) * 2) | 0);
            const h = 3 + ((rnd(x, y * 7 + s, i + 30) * 2) | 0);
            const cols = ['#c94a3a', '#3f6aa8', '#e0c05a', '#5d8a4a', '#f3f0e6', '#8a5aa0', '#e07a4a'];
            R(ctx, bx, py + 2 + s * 4 + (4 - h), Math.min(w, px + 14 - bx), h, cols[(rnd(x, y + s, i + 60) * cols.length) | 0]);
            bx += w;
            i++;
          }
          R(ctx, px + 2, py + 6 + s * 4 - 1, 12, 1, P.woodDk);
        }
        break;
      }
      case 't': {
        const L = nb(-1, 0) === 't', Rr = nb(1, 0) === 't', U = nb(0, -1) === 't', Dn = nb(0, 1) === 't';
        const x0 = L ? 0 : 1, x1 = Rr ? 16 : 15, y0 = U ? 0 : 2, y1 = Dn ? 16 : 12;
        R(ctx, px + x0, py + y0, x1 - x0, y1 - y0, P.woodLt);
        if (!U) R(ctx, px + x0, py + y0, x1 - x0, 1, '#c99460');
        if (!L) R(ctx, px + x0, py + y0, 1, y1 - y0, P.wood);
        if (!Rr) R(ctx, px + x1 - 1, py + y0, 1, y1 - y0, P.wood);
        if (!Dn) {
          R(ctx, px + x0, py + y1, x1 - x0, 2, P.wood);
          R(ctx, px + x0, py + y1 + 2, x1 - x0, 1, P.woodXd);
        }
        const r0 = rnd(x, y, 5);
        if (r0 < 0.3) { R(ctx, px + 6, py + 5, 2, 4, '#3a2a20'); R(ctx, px + 9, py + 5, 2, 4, '#a8402a'); }
        else if (r0 < 0.55) { R(ctx, px + 5, py + 5, 6, 4, P.white); R(ctx, px + 6, py + 6, 4, 2, '#e8c070'); }
        break;
      }
      case 'j': {
        R(ctx, px + 1, py + 1, 14, 14, P.woodDk);
        R(ctx, px + 2, py + 2, 12, 12, P.felt);
        R(ctx, px + 3, py + 3, 10, 1, P.ivory);
        R(ctx, px + 3, py + 12, 10, 1, P.ivory);
        R(ctx, px + 3, py + 4, 1, 8, P.ivory);
        R(ctx, px + 12, py + 4, 1, 8, P.ivory);
        R(ctx, px + 6, py + 6, 1, 1, P.ivory); R(ctx, px + 8, py + 7, 1, 1, P.ivory);
        R(ctx, px + 7, py + 9, 1, 1, P.ivory); R(ctx, px + 9, py + 6, 1, 1, P.ivory);
        R(ctx, px + 1, py + 15, 14, 1, P.woodXd);
        break;
      }
      case 'x': {
        const L = nb(-1, 0) === 'x', Rr = nb(1, 0) === 'x';
        const x0 = L ? 0 : 1, x1 = Rr ? 16 : 15;
        R(ctx, px + x0, py + 1, x1 - x0, 14, P.futonA);
        for (let i = x0; i < x1; i += 3) R(ctx, px + i, py + 2 + (i % 2) * 6, 1, 1, P.futonB);
        R(ctx, px + x0, py + 14, x1 - x0, 2, '#9a3a30');
        R(ctx, px + (L ? 0 : 3), py + 3, (x1 - x0) - (L ? 0 : 2) - (Rr ? 0 : 2), 8, P.woodLt);
        R(ctx, px + (L ? 0 : 3), py + 10, (x1 - x0) - (L ? 0 : 2) - (Rr ? 0 : 2), 1, P.wood);
        if (L && Rr) {
          R(ctx, px + 6, py + 5, 3, 3, P.mikan);
          R(ctx, px + 9, py + 6, 3, 3, P.mikan);
          R(ctx, px + 7, py + 5, 1, 1, '#ffd08a');
          R(ctx, px + 7, py + 4, 1, 1, '#4a7a3a');
        }
        break;
      }
      case 'T': {
        R(ctx, px + 1, py + 11, 14, 5, P.woodDk);
        R(ctx, px + 1, py + 11, 14, 1, P.wood);
        R(ctx, px + 2, py + 2, 12, 10, P.tvBody);
        R(ctx, px + 2, py + 2, 12, 1, '#6f6964');
        R(ctx, px + 3, py + 3, 8, 7, P.tvDk);
        R(ctx, px + 4, py + 4, 6, 5, P.screen);
        R(ctx, px + 12, py + 4, 1, 1, P.metal);
        R(ctx, px + 12, py + 6, 1, 1, P.metal);
        R(ctx, px + 12, py + 8, 1, 2, P.metalXd);
        break;
      }
      case 'F': {
        R(ctx, px + 2, py + 1, 12, 15, P.white);
        R(ctx, px + 2, py + 1, 12, 1, P.metalLt);
        R(ctx, px + 2, py + 6, 12, 1, P.whiteSh);
        R(ctx, px + 13, py + 1, 1, 15, P.whiteSh);
        R(ctx, px + 4, py + 3, 1, 2, P.metalDk);
        R(ctx, px + 4, py + 8, 1, 4, P.metalDk);
        R(ctx, px + 2, py + 15, 12, 1, P.metalXd);
        break;
      }
      case 's': {
        R(ctx, px, py + 1, 16, 15, P.metal);
        R(ctx, px, py + 1, 16, 1, P.metalLt);
        R(ctx, px + 3, py + 4, 10, 7, P.metalDk);
        R(ctx, px + 4, py + 5, 8, 5, '#b9c0c4');
        R(ctx, px + 7, py + 2, 2, 3, P.metalXd);
        R(ctx, px, py + 13, 16, 3, P.metalDk);
        R(ctx, px + 5, py + 6, 3, 2, P.white);
        break;
      }
      case 'o': {
        R(ctx, px, py + 1, 16, 15, P.metal);
        R(ctx, px, py + 1, 16, 1, P.metalLt);
        R(ctx, px + 2, py + 3, 5, 5, P.ink);
        R(ctx, px + 9, py + 3, 5, 5, P.ink);
        R(ctx, px + 3, py + 4, 3, 3, '#5a5450');
        R(ctx, px + 10, py + 4, 3, 3, '#5a5450');
        R(ctx, px + 9, py + 2, 5, 5, '#d0d4d8');
        R(ctx, px + 10, py + 3, 3, 3, '#e8ecee');
        R(ctx, px + 13, py + 3, 2, 1, P.metalXd);
        R(ctx, px, py + 10, 16, 6, P.metalDk);
        R(ctx, px + 3, py + 12, 2, 2, P.ink);
        R(ctx, px + 11, py + 12, 2, 2, P.ink);
        break;
      }
      case 'L': {
        R(ctx, px + 1, py + 1, 14, 15, '#c8c2b0');
        R(ctx, px + 2, py + 2, 12, 8, P.white);
        R(ctx, px + 4, py + 4, 8, 5, '#cfe0e6');
        R(ctx, px + 7, py + 1, 2, 3, P.metalDk);
        R(ctx, px + 1, py + 11, 14, 5, '#b2ab98');
        R(ctx, px + 12, py + 11, 2, 3, ['#e0604a', '#4a8ad0', '#5aa05a'][(rnd(x, y, 1) * 3) | 0]);
        break;
      }
      case 'W': {
        R(ctx, px + 1, py + 1, 14, 15, P.white);
        R(ctx, px + 1, py + 1, 14, 2, '#9ec0d8');
        R(ctx, px + 2, py + 4, 7, 7, P.whiteSh);
        R(ctx, px + 3, py + 5, 5, 5, '#c9d6dc');
        R(ctx, px + 10, py + 4, 4, 5, P.whiteSh);
        R(ctx, px + 1, py + 13, 14, 3, P.whiteSh);
        R(ctx, px + 3, py + 1, 1, 1, P.ink);
        R(ctx, px + 6, py + 1, 1, 1, P.ink);
        break;
      }
      case 'C': {
        const l = nb(-1, 0) === 'C', r = nb(1, 0) === 'C';
        R(ctx, px, py, 16, 16, '#cbd3cf');
        R(ctx, px + 4, py + 2, 8, 6, P.white);
        R(ctx, px + 6, py + 3, 4, 4, '#dfe8ec');
        R(ctx, px + 2, py + 9, 12, 7, '#9ab8c6');
        R(ctx, px + 2, py + 9, 12, 1, '#7a98a6');
        R(ctx, px + 11, py + 12, 2, 1, (x + y) % 3 ? '#5aa05a' : '#d8433a');
        if (!l) R(ctx, px, py, 2, 16, '#a9b3ae');
        R(ctx, px + 14, py, 2, 16, '#a9b3ae');
        if (r) R(ctx, px + 15, py, 1, 16, '#8f9a95');
        break;
      }
      case 'u': {
        R(ctx, px + 4, py, 8, 9, P.white);
        R(ctx, px + 5, py + 2, 6, 6, '#dfe8ec');
        R(ctx, px + 4, py + 9, 8, 1, P.whiteSh);
        R(ctx, px + 7, py, 2, 1, P.metalDk);
        break;
      }
      case 'O': {
        const L = 'O' === nb(-1, 0), Rr = 'O' === nb(1, 0), U = 'O' === nb(0, -1), Dn = 'O' === nb(0, 1);
        R(ctx, px, py, 16, 16, P.water);
        for (let i = 0; i < 3; i++) R(ctx, px + ((rnd(x, y, i) * 12) | 0), py + 2 + i * 5, 4, 1, P.waterHi);
        if (!L) R(ctx, px, py, 3, 16, '#cfe0e6');
        if (!Rr) R(ctx, px + 13, py, 3, 16, '#cfe0e6');
        if (!U) R(ctx, px, py, 16, 3, '#e4eef2');
        if (!Dn) R(ctx, px, py + 13, 16, 3, '#b6cbd3');
        break;
      }
      case 'h': {
        R(ctx, px + 6, py, 4, 3, P.metalDk);
        R(ctx, px + 7, py + 3, 2, 1, P.metalXd);
        R(ctx, px + 3, py + 8, 6, 5, '#e8c22a');
        R(ctx, px + 4, py + 9, 4, 3, '#f6d85a');
        R(ctx, px + 10, py + 9, 4, 4, '#e88aa0');
        R(ctx, px + 10, py + 13, 4, 1, '#c96a80');
        break;
      }
      case 'l': {
        R(ctx, px + 1, py + 1, 14, 15, P.woodDk);
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          R(ctx, px + 2 + i * 7, py + 2 + j * 7, 5, 5, '#d0a868');
          R(ctx, px + 2 + i * 7, py + 2 + j * 7, 5, 1, '#e0bd80');
          R(ctx, px + 3 + i * 7, py + 4 + j * 7, 3, 1, '#a8824a');
        }
        break;
      }
      case 'g': {
        const L = nb(-1, 0) === 'g', Rr = nb(1, 0) === 'g', U = nb(0, -1) === 'g', Dn = nb(0, 1) === 'g';
        R(ctx, px, py, 16, 16, '#8f6a42');
        if (!U) R(ctx, px, py, 16, 2, '#b08654');
        for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
          const ox = px + 1 + i * 8 - (L ? 1 : 0) + (i ? 0 : 0), oy = py + (U ? 1 : 3) + j * 7;
          R(ctx, ox, oy, 6, 5, '#a87c4c');
          R(ctx, ox + 1, oy + 1, 3, 1, P.plate);
          R(ctx, ox + 4, oy + 3, 1, 1, P.metalXd);
        }
        if (!L) R(ctx, px, py, 1, 16, '#6a4c2c');
        if (!Rr) R(ctx, px + 15, py, 1, 16, '#6a4c2c');
        if (!Dn) R(ctx, px, py + 15, 16, 1, '#5a3f24');
        break;
      }
      case 'm': {
        R(ctx, px + 1, py + 1, 14, 14, P.metalDk);
        for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
          R(ctx, px + 2 + i * 4, py + 2 + j * 4, 3, 3, P.metal);
          R(ctx, px + 2 + i * 4, py + 3 + j * 4, 3, 1, P.metalXd);
        }
        R(ctx, px + 6, py + 6, 3, 1, P.white);
        R(ctx, px + 1, py + 15, 14, 1, P.metalXd);
        break;
      }
      case 'p': {
        R(ctx, px + 2, py + 6, 12, 9, P.woodLt);
        R(ctx, px + 2, py + 14, 12, 2, P.wood);
        R(ctx, px + 4, py + 4, 8, 7, P.pink);
        R(ctx, px + 4, py + 4, 8, 1, '#f8b0c4');
        R(ctx, px + 4, py + 3, 8, 2, P.pinkDk);
        R(ctx, px + 6, py + 7, 4, 3, '#f8d0dc');
        R(ctx, px + 7, py + 8, 2, 1, P.pinkDk);
        break;
      }
      case 'v': {
        R(ctx, px + 1, py - 6, 14, 22, '#c8332e');
        R(ctx, px + 1, py - 6, 14, 2, '#e05a4a');
        R(ctx, px + 2, py - 3, 12, 8, '#f3efe4');
        for (let i = 0; i < 5; i++) {
          R(ctx, px + 3 + i * 2, py - 2, 1, 3, ['#3a6ad8', '#e0b030', '#4aa04a', '#d8603a', '#8a5a3a'][i]);
          R(ctx, px + 3 + i * 2, py + 2, 1, 2, ['#e0b030', '#3a6ad8', '#d8603a', '#4aa04a', '#3a6ad8'][i]);
        }
        R(ctx, px + 3, py + 7, 6, 3, P.ink);
        R(ctx, px + 11, py + 7, 2, 4, '#3a302b');
        R(ctx, px + 3, py + 12, 10, 3, '#3a302b');
        R(ctx, px + 1, py + 15, 14, 1, '#7a1f1c');
        break;
      }
      case 'P': {
        if (map.kind === 'roof') {
          R(ctx, px + 1, py + 7, 14, 8, '#9a6a44');
          R(ctx, px + 1, py + 7, 14, 1, '#b8845a');
          for (let i = 0; i < 3; i++) {
            R(ctx, px + 2 + i * 5, py + 2, 3, 6, P.leafB);
            R(ctx, px + 3 + i * 5, py + 1, 1, 2, P.leafHi);
            R(ctx, px + 2 + i * 5 + (i & 1), py + 4, 2, 2, '#d8433a');
          }
          break;
        }
        R(ctx, px + 5, py + 10, 6, 6, '#b5653a');
        R(ctx, px + 5, py + 10, 6, 1, '#d08050');
        R(ctx, px + 3, py + 3, 4, 7, P.leafB);
        R(ctx, px + 9, py + 2, 4, 8, P.leafA);
        R(ctx, px + 6, py + 1, 4, 9, P.leafHi);
        R(ctx, px + 7, py + 4, 2, 6, P.leafC);
        break;
      }
      case 'G': {
        R(ctx, px + 7, py + 1, 2, 8, '#4a3020');
        R(ctx, px + 6, py, 4, 2, '#3a2418');
        R(ctx, px + 4, py + 8, 8, 7, '#c08040');
        R(ctx, px + 5, py + 7, 6, 2, '#c08040');
        R(ctx, px + 6, py + 10, 4, 3, '#3a2418');
        R(ctx, px + 4, py + 14, 8, 1, '#8a5428');
        break;
      }
      case 'X': {
        R(ctx, px + 1, py + 5, 14, 11, '#c49a62');
        R(ctx, px + 1, py + 5, 14, 2, '#d6ae78');
        R(ctx, px + 7, py + 5, 2, 11, '#e0cfa2');
        R(ctx, px + 3, py + 1, 9, 5, '#b88c56');
        R(ctx, px + 3, py + 1, 9, 1, '#d0a670');
        R(ctx, px + 7, py + 1, 2, 5, '#e0cfa2');
        R(ctx, px + 2, py + 10, 3, 2, '#d8433a');
        break;
      }
      case 'z': {
        for (let i = 0; i < 2; i++) {
          const ox = px + 2 + i * 6;
          for (let j = 0; j < 4; j++) R(ctx, ox, py + 12 - j * 2 - i, 6, 2, ['#e04a3a', '#3a6ad8', '#f0d040', '#f3f0e6', '#5aa05a'][(rnd(x, y, i * 5 + j) * 5) | 0]);
        }
        break;
      }
      // 屋上
      case 'Z': {
        const L = nb(-1, 0) === 'Z', Rr = nb(1, 0) === 'Z', U = nb(0, -1) === 'Z', Dn = nb(0, 1) === 'Z';
        R(ctx, px, py, 16, 16, '#b7c3c8');
        for (let i = 0; i < 16; i += 5) R(ctx, px + i, py, 1, 16, '#9eacb2');
        R(ctx, px, py + 8, 16, 1, '#9eacb2');
        if (!U) R(ctx, px, py, 16, 2, '#d3dde1');
        if (!Dn) { R(ctx, px, py + 11, 16, 5, '#5f6a70'); R(ctx, px + 2, py + 11, 2, 5, '#3e464b'); R(ctx, px + 12, py + 11, 2, 5, '#3e464b'); }
        if (!L) R(ctx, px, py, 1, 16, '#7f8d93');
        if (!Rr) R(ctx, px + 15, py, 1, 16, '#7f8d93');
        break;
      }
      case '|': {
        const L = nb(-1, 0) === '|', Rr = nb(1, 0) === '|';
        R(ctx, px, py + 3, 16, 1, P.metalDk);
        if (!L) R(ctx, px + 1, py + 1, 2, 14, P.metalXd);
        if (!Rr) R(ctx, px + 13, py + 1, 2, 14, P.metalXd);
        if (L && Rr || (L !== Rr && x % 2)) {
          const cols = ['#f3f0e6', '#6a9ad8', '#e0604a', '#f0d040', '#8ac08a', '#2f3f5a', '#e8a0b8'];
          const c = cols[(rnd(x * 7 + 3, y, 11) * cols.length) | 0];
          if (x % 2) { R(ctx, px + 3, py + 4, 10, 4, c); R(ctx, px + 5, py + 8, 6, 5, c); }
          else R(ctx, px + 4, py + 4, 8, 9, c);
          R(ctx, px + 4, py + 4, 8, 1, mix(c, '#000000', 0.15));
        }
        break;
      }
      case 'I': {
        R(ctx, px + 7, py + 2, 2, 13, P.metalXd);
        R(ctx, px + 5, py + 14, 6, 2, P.metalDk);
        for (let i = 0; i < 4; i++) R(ctx, px + 2, py + 3 + i * 3, 12, 1, P.metalDk);
        break;
      }
      case '!': {
        R(ctx, px, py + 5, 16, 7, '#a07a4a');
        for (let i = 0; i < 3; i++) R(ctx, px, py + 6 + i * 2, 16, 1, '#7a5a34');
        R(ctx, px + 2, py + 12, 2, 3, P.metalXd);
        R(ctx, px + 12, py + 12, 2, 3, P.metalXd);
        break;
      }
    }
  }

  // 屋外の小物
  function drawExt(ctx, map, x, y, px, py, ch) {
    switch (ch) {
      case 'o': {
        const fc = ['#c84a3a', '#3a6ab8', '#e0c040', '#5a8a4a', '#d8d4cc', '#2a2a2a'][(rnd(x, y, 3) * 6) | 0];
        R(ctx, px + 1, py + 13, 14, 2, 'rgba(0,0,0,0.18)');
        R(ctx, px + 1, py + 7, 6, 6, P.ink);
        R(ctx, px + 2, py + 8, 4, 4, P.grassB);
        R(ctx, px + 9, py + 7, 6, 6, P.ink);
        R(ctx, px + 10, py + 8, 4, 4, P.grassB);
        R(ctx, px + 4, py + 9, 8, 1, fc);
        R(ctx, px + 7, py + 5, 1, 5, fc);
        R(ctx, px + 5, py + 4, 4, 1, P.ink);
        R(ctx, px + 11, py + 4, 1, 6, fc);
        R(ctx, px + 10, py + 3, 3, 1, P.ink);
        R(ctx, px + 2, py + 6, 3, 2, '#9a9aa2');
        break;
      }
      case '*': {
        R(ctx, px, py + 8, 16, 8, '#6a4a32');
        R(ctx, px, py + 8, 16, 1, '#8a6a4a');
        for (let i = 0; i < 4; i++) {
          const fx = px + 1 + i * 4;
          R(ctx, fx + 1, py + 6, 1, 6, P.leafB);
          R(ctx, fx, py + 9, 1, 2, P.leafA);
          const fl = ['#e0403a', '#f0c030', '#f08ab0', '#f3f0e6'][(rnd(x, y, i) * 4) | 0];
          R(ctx, fx, py + 3, 3, 3, fl);
          R(ctx, fx + 1, py + 2, 1, 1, fl);
        }
        break;
      }
      case 'r': {
        R(ctx, px + 1, py + 3, 14, 12, '#3f7a52');
        for (let i = 2; i < 15; i += 2) R(ctx, px + i, py + 3, 1, 12, '#2f6040');
        for (let j = 5; j < 15; j += 3) R(ctx, px + 1, py + j, 14, 1, '#2f6040');
        R(ctx, px + 1, py + 2, 14, 2, '#5a9a6a');
        R(ctx, px + 4, py + 9, 4, 4, '#f3f0e6');
        break;
      }
      case 'h': {
        R(ctx, px, py + 2, 16, 14, P.hedgeA);
        R(ctx, px, py + 2, 16, 5, P.hedgeHi);
        for (let i = 0; i < 6; i++) R(ctx, px + ((rnd(x, y, i) * 15) | 0), py + 4 + ((rnd(x, y, i + 9) * 10) | 0), 2, 1, i & 1 ? P.hedgeB : P.leafHi);
        R(ctx, px, py + 14, 16, 2, P.hedgeB);
        break;
      }
      case 't': {
        R(ctx, px - 2, py - 2, 20, 18, P.leafC);
        R(ctx, px, py - 3, 16, 16, P.leafA);
        R(ctx, px + 2, py - 2, 10, 8, P.leafB);
        R(ctx, px + 4, py - 1, 4, 3, P.leafHi);
        for (let i = 0; i < 4; i++) R(ctx, px + ((rnd(x, y, i) * 14) | 0), py + ((rnd(x, y, i + 5) * 12) | 0), 2, 1, P.leafC);
        break;
      }
    }
  }

  // ── 屋外の背の高いもの（人物と前後関係を判定して描く） ──────────
  function drawTallExt(ctx, ch, x, y, px, py, t) {
    if (ch === 'T') { // 桜
      R(ctx, px - 5, py + 13, 26, 3, 'rgba(70,40,60,0.18)');
      R(ctx, px + 6, py - 2, 4, 17, P.trunk);
      R(ctx, px + 6, py - 2, 1, 17, P.trunkDk);
      R(ctx, px + 3, py - 4, 3, 2, P.trunk);
      R(ctx, px + 10, py - 5, 3, 2, P.trunk);
      const cx = px + 8, cy = py - 12;
      disc(ctx, cx, cy + 1, 13, P.sakD);
      disc(ctx, cx - 8, cy + 3, 7, P.sakD);
      disc(ctx, cx + 9, cy + 3, 7, P.sakD);
      disc(ctx, cx - 1, cy - 1, 11, P.sakB);
      disc(ctx, cx - 7, cy + 1, 6, P.sakB);
      disc(ctx, cx + 7, cy + 1, 6, P.sakB);
      disc(ctx, cx - 3, cy - 4, 7, P.sakA);
      disc(ctx, cx + 5, cy - 2, 4, P.sakA);
      disc(ctx, cx - 5, cy - 6, 3, P.sakC);
      for (let i = 0; i < 14; i++) {
        const a = rnd(x, y, i) * Math.PI * 2, d = rnd(x, y, i + 30) * 11;
        R(ctx, Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d), 2, 1, i % 3 ? P.sakD : P.sakC);
      }
      return;
    }
    if (ch === 'L') { // 街灯
      R(ctx, px + 7, py - 18, 2, 33, '#5a5f66');
      R(ctx, px + 8, py - 18, 1, 33, '#7a8088');
      R(ctx, px + 4, py - 21, 8, 4, '#3f444a');
      R(ctx, px + 5, py - 17, 6, 2, '#fff1c0');
      R(ctx, px + 5, py + 13, 6, 3, '#4a4f55');
      return;
    }
    if (ch === 'G' || ch === 'g') { // 門柱
      R(ctx, px + 1, py - 10, 14, 26, P.concSh);
      R(ctx, px + 1, py - 10, 14, 3, P.concHi);
      R(ctx, px + 2, py - 7, 12, 22, P.conc);
      R(ctx, px + 1, py + 14, 14, 2, P.concDk);
      if (ch === 'G') {
        R(ctx, px + 4, py - 5, 8, 17, '#7a5230');
        R(ctx, px + 5, py - 4, 6, 15, '#efe6cf');
        for (let k = 0; k < 3; k++) {
          R(ctx, px + 6, py - 3 + k * 5, 4, 1, P.ink);
          R(ctx, px + 7, py - 2 + k * 5, 2, 2, P.ink);
          R(ctx, px + 6, py - 1 + k * 5 + (k === 2 ? 1 : 0), 1, 1, P.ink);
        }
      }
      return;
    }
    void t;
  }

  // ── マップの静的な背景を作る ─────────────────────────
  function renderMap(map) {
    const cv = canvas(map.w * TS, map.h * TS);
    const ctx = cv.getContext('2d');
    const tall = [];
    const anim = [];
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const ch = map.rows[y][x];
        const px = x * TS, py = y * TS;
        if (map.kind === 'ext') {
          if (ch === '@' || ch === 'E') continue;
          if (ch === ';' || ch === '^') { drawFloor(ctx, ch === ';' ? ';road' : '^', x, y, px, py); continue; }
          if (FLOOR.has(ch)) { drawFloor(ctx, ch, x, y, px, py); continue; }
          drawFloor(ctx, ch === 't' || ch === 'h' ? '"' : baseFloor(map, x, y), x, y, px, py);
          if ('TLGg'.includes(ch)) { tall.push({ ch, x, y }); continue; }
          if (ch === 'v') drawFurniture(ctx, map, x, y, px, py, ch);
          else if (ch !== 't') drawExt(ctx, map, x, y, px, py, ch);
          continue;
        }
        if (isWall(ch)) {
          if (isOpen(at(map, x, y + 1)) && !(ch === 'H' && y > 0)) wallFace(ctx, map, x, y, px, py, ch);
          else wallTop(ctx, map, x, y, px, py, ch);
          continue;
        }
        if (FLOOR.has(ch)) { drawFloor(ctx, ch, x, y, px, py); continue; }
        if (ch === '+' || ch === 'N') { drawDoor(ctx, map, x, y, px, py, ch, false); continue; }
        if (ch === 'E') { drawExitDoor(ctx, map, x, y, px, py); continue; }
        if (ch === 'U' || ch === 'V') { drawStairs(ctx, map, x, y, px, py, ch); continue; }
        drawFloor(ctx, baseFloor(map, x, y), x, y, px, py);
        drawFurniture(ctx, map, x, y, px, py, ch);
        if (ch === 'T' || ch === 'O') anim.push({ ch, x, y });
      }
    }
    if (map.kind === 'ext') {
      // 木は上の段から順に重ねる（奥の木が手前に来ないように）
      for (let y = 0; y < map.h; y++)
        for (let x = 0; x < map.w; x++)
          if (map.rows[y][x] === 't') drawExt(ctx, map, x, y, x * TS, y * TS, 't');
      const b = map.building;
      drawFacade(ctx, b.x * TS, b.y * TS, {
        u: TS, roofH: b.roof * TS, floorH: (b.h - b.roof) * TS / 3, map: true,
      });
      // 建物の影
      ctx.fillStyle = 'rgba(40,30,50,0.16)';
      ctx.fillRect(b.x * TS, (b.y + b.h) * TS, b.w * TS, 4);
    }
    map.bg = cv;
    map.tall = tall;
    map.anim = anim;
    return cv;
  }

  // ── 寮の外観（正面） ───────────────────────────────
  // 窓の位置は各階の屋内マップ（南側の壁＝最下段）から拾う
  function facadeColumns() {
    const W = D.WORLD.maps;
    return [W['3F'], W['2F'], W['1F']].map((m) => m.rows[m.rows.length - 1]);
  }
  let signCache = null;
  function signBitmap() {
    if (signCache && signCache.ready === D.fontReady) return signCache.cv;
    const cv = textBitmap('夕照寮', 16, P.ink);
    signCache = { cv, ready: D.fontReady };
    return cv;
  }
  function textBitmap(text, size, col) {
    const w = size * text.length + 4, h = size + 4;
    const src = canvas(w, h);
    const sctx = src.getContext('2d');
    sctx.font = size + 'px "DotGothic16", "IPAGothic", monospace';
    sctx.textBaseline = 'top';
    sctx.fillStyle = '#000';
    sctx.fillText(text, 2, 2);
    const img = sctx.getImageData(0, 0, w, h);
    const out = canvas(w, h);
    const octx = out.getContext('2d');
    octx.fillStyle = col;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (img.data[(y * w + x) * 4 + 3] > 110) octx.fillRect(x, y, 1, 1);
    return out;
  }
  D.art.textBitmap = textBitmap;

  function drawFacade(ctx, ox, oy, o) {
    const u = o.u, rh = o.roofH, fh = o.floorH;
    const cols = facadeColumns();
    const n = cols[0].length;
    const W = n * u, H = rh + fh * 3;
    const big = u >= 8;
    const lit = o.lit || 0;
    // 屋根
    R(ctx, ox, oy, W, rh, '#8d8e86');
    R(ctx, ox, oy, W, Math.max(1, u / 8), P.concHi);
    R(ctx, ox, oy, Math.max(1, u / 8), rh, P.concHi);
    R(ctx, ox + W - Math.max(1, u / 8), oy, Math.max(1, u / 8), rh, P.concSh);
    if (big) for (let i = 3; i < n; i += 3) R(ctx, ox + i * u, oy + 3, 1, rh - 8, '#7f8078');
    // 塔屋（階段室）
    const ph = Math.round(rh * 0.55);
    R(ctx, ox + u * 0.5, oy + 1, u * 5, ph, P.concHi);
    R(ctx, ox + u * 0.5, oy + 1 + ph, u * 5, rh - ph - Math.max(2, u / 4), P.conc);
    if (big) {
      R(ctx, ox + u * 2.4, oy + 1 + ph + 2, u * 0.9, rh - ph - 7, '#7a8088');
      R(ctx, ox + u * 0.5, oy + 1 + ph, u * 5, 1, P.concSh);
    }
    // 高架水槽
    const tx = ox + u * 32, tw = u * 3;
    R(ctx, tx, oy + Math.round(rh * 0.08), tw, Math.round(rh * 0.45), '#b9c5ca');
    R(ctx, tx, oy + Math.round(rh * 0.08), tw, Math.max(1, u / 8), '#d6e0e3');
    if (big) {
      for (let i = 1; i < 3; i++) R(ctx, tx + i * u, oy + 4, 1, Math.round(rh * 0.45) - 4, '#9eacb2');
      R(ctx, tx + 2, oy + Math.round(rh * 0.53), 2, Math.round(rh * 0.3), '#4e575c');
      R(ctx, tx + tw - 4, oy + Math.round(rh * 0.53), 2, Math.round(rh * 0.3), '#4e575c');
    }
    // アンテナ
    if (big) {
      R(ctx, ox + u * 12.5, oy - 6, 1, rh * 0.6 + 6, P.metalXd);
      for (let i = 0; i < 3; i++) R(ctx, ox + u * 12, oy - 5 + i * 3, u, 1, P.metalXd);
    } else {
      R(ctx, ox + u * 12.5, oy - 4, 1, 5, P.ink);
      R(ctx, ox + u * 12, oy - 3, u, 1, P.ink);
    }
    // 手すり壁の正面
    const pr = Math.max(2, Math.round(u / 4));
    R(ctx, ox, oy + rh - pr, W, pr, P.concHi);
    // 各階
    for (let f = 0; f < 3; f++) {
      const fy = oy + rh + f * fh;
      R(ctx, ox, fy, W, fh, P.conc);
      // 床スラブの線
      const sl = Math.max(1, Math.round(fh / 12));
      R(ctx, ox, fy, W, sl, P.concHi);
      R(ctx, ox, fy + sl, W, 1, P.concSh);
      const row = cols[f];
      let x = 0;
      while (x < n) {
        const ch = row[x];
        if (ch !== 'w' && ch !== 'E') { x++; continue; }
        let x2 = x;
        while (x2 + 1 < n && row[x2 + 1] === ch) x2++;
        if (ch === 'w') drawFacadeWindow(ctx, ox + x * u, fy, (x2 - x + 1) * u, fh, u, big, f, x, lit);
        else drawFacadeEntrance(ctx, ox + x * u, fy, (x2 - x + 1) * u, fh, u, big);
        x = x2 + 1;
      }
    }
    // 雨だれのしみ
    if (big) {
      ctx.fillStyle = 'rgba(70,60,52,0.10)';
      for (let i = 0; i < 40; i++) {
        const sx = ox + ((rnd(i, 3, 9) * W) | 0);
        const sy = oy + rh + ((rnd(i, 4, 9) * fh * 2.5) | 0);
        ctx.fillRect(sx, sy, 1 + ((rnd(i, 5, 9) * 2) | 0), 6 + ((rnd(i, 6, 9) * 18) | 0));
      }
    }
    // 雨どい
    for (const c of [5.5, 20.5, 35.5]) {
      R(ctx, ox + c * u, oy + rh - pr, Math.max(1, u / 8), fh * 3 + pr, P.concDk);
      if (big) R(ctx, ox + c * u + 1, oy + rh - pr, 1, fh * 3 + pr, '#9a9388');
    }
    // 基礎
    const bs = Math.max(1, Math.round(fh / 10));
    R(ctx, ox, oy + H - bs, W, bs, P.concDk);
    // 夕日（西＝左）からの光
    const g = ctx.createLinearGradient(ox, 0, ox + W, 0);
    g.addColorStop(0, 'rgba(255,170,90,0.20)');
    g.addColorStop(0.6, 'rgba(255,170,90,0.05)');
    g.addColorStop(1, 'rgba(60,40,90,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, W, H);
    // 入口の看板（外光の上に描く）
    const ent = cols[2].indexOf('E');
    if (ent >= 0 && big) {
      const sign = signBitmap();
      const sw = 50, sh = 20;
      const sx = Math.round(ox + ent * u + (3 * u - sw) / 2), sy = Math.round(oy + rh + fh * 2 - sh - 3);
      R(ctx, sx - 1, sy - 1, sw + 2, sh + 2, '#4f3420');
      R(ctx, sx, sy, sw, sh, '#efe6cf');
      ctx.drawImage(sign, sx + Math.round((sw - sign.width) / 2), sy);
    }
  }

  function drawFacadeWindow(ctx, x, y, w, fh, u, big, floor, col, lit) {
    const top = y + Math.round(fh * 0.24), h = Math.round(fh * 0.5);
    const ins = big ? 2 : 0;
    // 霧除け（小さなひさし）
    R(ctx, x + ins - 1, top - Math.max(1, Math.round(fh / 16)) - 1, w - ins * 2 + 2, Math.max(1, Math.round(fh / 16)), P.concHi);
    R(ctx, x + ins - 1, top - 1, w - ins * 2 + 2, 1, P.concSh);
    R(ctx, x + ins, top, w - ins * 2, h, P.alu);
    const gx = x + ins + 1, gy = top + 1, gw = w - ins * 2 - 2, gh = h - 2;
    const on = lit > 0 && rnd(col, floor, 77) < lit;
    for (let j = 0; j < gh; j++) R(ctx, gx, gy + j, gw, 1, on ? mix('#ffd68a', '#ffb860', j / gh) : mix(P.glassA, P.glassB, j / Math.max(1, gh - 1)));
    if (big) {
      // カーテン
      const cc = CURTAINS[(rnd(col, floor, 7) * CURTAINS.length) | 0];
      const k = rnd(col, floor, 8);
      if (k < 0.5) { R(ctx, gx, gy, 3, gh, cc); R(ctx, gx + gw - 3, gy, 3, gh, cc); }
      else if (k < 0.8) R(ctx, gx, gy, Math.round(gw * 0.55), gh, cc);
      // 映り込み
      R(ctx, gx + 3, gy + 1, 1, 1, P.glassHi);
      R(ctx, gx + 2, gy + 2, 1, 1, P.glassHi);
      R(ctx, gx + Math.round(gw / 2), gy, 1, gh, P.aluDk);
      // 窓台
      R(ctx, x + ins - 1, top + h, w - ins * 2 + 2, 2, P.concHi);
      R(ctx, x + ins - 1, top + h + 2, w - ins * 2 + 2, 1, P.concSh);
      // ふとん干し（上の階のいくつか）
      if (floor < 2 && rnd(col, floor, 5) < 0.18) {
        const fc = ['#e8e4d8', '#e6a3a3', '#a3c0e6', '#e6d3a3'][(rnd(col, floor, 6) * 4) | 0];
        R(ctx, x + ins + 2, top + h - 2, w - ins * 2 - 4, 9, fc);
        R(ctx, x + ins + 2, top + h - 2, w - ins * 2 - 4, 1, '#ffffff');
        R(ctx, x + ins + 2, top + h + 6, w - ins * 2 - 4, 1, mix(fc, '#000000', 0.2));
      }
    } else if (w >= 6) {
      R(ctx, gx + Math.floor(gw / 2), gy, 1, gh, P.aluDk);
    }
  }

  function drawFacadeEntrance(ctx, x, y, w, fh, u, big) {
    const dt = y + Math.round(fh * 0.3);
    const dh = y + fh - dt;
    // ひさし
    const ch = Math.max(2, Math.round(fh / 9));
    R(ctx, x - u * 0.5, dt - ch - 1, w + u, ch, P.concHi);
    R(ctx, x - u * 0.5, dt - 1, w + u, 1, P.concDk);
    // 玄関ドア
    R(ctx, x, dt, w, dh, P.alu);
    const panes = big ? 4 : 2;
    const pw = (w - 2) / panes;
    for (let i = 0; i < panes; i++) {
      const px = Math.round(x + 1 + i * pw);
      for (let j = 0; j < dh - 2; j++) R(ctx, px + 1, dt + 1 + j, Math.round(pw) - 2, 1, mix('#3f4a5a', '#6a7a8a', j / dh));
      if (big) {
        R(ctx, px + 2, dt + 3, 1, 4, '#9fb2c4');
        R(ctx, px + Math.round(pw) - 3, dt + Math.round(dh / 2), 1, 3, P.metalLt);
      }
    }
    if (big) {
      // 中の明かり
      R(ctx, x + 4, dt + dh - 6, w - 8, 3, 'rgba(255,214,140,0.35)');
      // 玄関灯
      R(ctx, x - u * 0.3, dt + 2, 3, 3, '#fff1c0');
      R(ctx, x + w + u * 0.3 - 3, dt + 2, 3, 3, '#fff1c0');
      // ステップ
      R(ctx, x - 2, y + fh - 2, w + 4, 2, P.concHi);
    }
  }
  D.art.drawFacade = drawFacade;

  // ── キャラクター ─────────────────────────────────
  const TPL = {
    down: [
      '................',
      '................',
      '.....HHHHHH.....',
      '....HHHHHHHH....',
      '...HHHHHHHHHH...',
      '...HHHHHHHHHH...',
      '...HHHHHHHHHH...',
      '...HHSSSSSSHH...',
      '...HSSSSSSSSH...',
      '...SSESSSSESS...',
      '...SSESSSSESS...',
      '....SSSSSSSS....',
      '.....sSSSSs.....',
      '....TTTTTTTT....',
      '...tTTTTTTTTt...',
      '...StTTTTTTtS...',
      '....TTTTTTTT....',
      '....PPPPPPPP....',
      '....PPP..PPP....',
      '....FFF..FFF....',
    ],
    up: [
      '................',
      '................',
      '.....HHHHHH.....',
      '....HHHHHHHH....',
      '...HHHHHHHHHH...',
      '...HHHHHHHHHH...',
      '...HHHHHHHHHH...',
      '...HHHHHHHHHH...',
      '...HHHHHHHHHH...',
      '...SHHHHHHHHS...',
      '...SHHHHHHHHS...',
      '....HHHHHHHH....',
      '.....sSSSSs.....',
      '....TTTTTTTT....',
      '...tTTTTTTTTt...',
      '...StTTTTTTtS...',
      '....TTTTTTTT....',
      '....PPPPPPPP....',
      '....PPP..PPP....',
      '....FFF..FFF....',
    ],
    left: [
      '................',
      '................',
      '.....HHHHHH.....',
      '....HHHHHHHH....',
      '...HHHHHHHHHH...',
      '...HHHHHHHHHH...',
      '...HHHHHHHHHH...',
      '...HSSSSHHHHH...',
      '...SSSSSSHHHH...',
      '..SSESSSSsHHH...',
      '..SSESSSSSHHH...',
      '...SSSSSSSHH....',
      '.....sSSSs......',
      '.....TTTTTT.....',
      '....TTTTTTTT....',
      '....TTTtTTTT....',
      '.....TTSTTT.....',
      '.....PPPPPP.....',
      '.....PP.PPP.....',
      '....FFF.FFF.....',
    ],
  };
  const LEGS = {
    down: {
      s: ['....PPPPPPPP....', '....PPP..PPP....', '....FFF..FFF....'],
      a: ['....PPPPPPPP....', '....PPP..FFF....', '....FFF.........'],
      b: ['....PPPPPPPP....', '....FFF..PPP....', '.........FFF....'],
    },
    left: {
      s: ['.....PPPPPP.....', '.....PP.PPP.....', '....FFF.FFF.....'],
      a: ['.....PPPPPP.....', '....PP...PP.....', '...FFF...FFF....'],
      b: ['.....PPPPPP.....', '......PPPP......', '.....FFFFF......'],
    },
  };
  LEGS.up = LEGS.down;

  const LOOKS = {
    player: { hair: '#2b2220', top: '#e8743a', pants: '#2f3f5a', shoes: '#f3f0e6', style: 'short' },
    kanri: { hair: '#9a9894', top: '#6f7d5c', pants: '#4a4a52', style: 'bald', glasses: true, skin: '#e8b890' },
    obachan: { hair: '#5a4030', top: '#e9e2d4', pants: '#5a5a6a', style: 'auntie', apron: '#e08aa0', scarf: true },
    ryocho: { hair: '#241c18', top: '#2f4f8a', pants: '#2f3f6a', style: 'short', jersey: true },
    tv: { hair: '#3a2a20', top: '#c84a3a', pants: '#3f5f8a', style: 'spiky' },
    kotatsu: { hair: '#241c18', top: '#2b3f6a', pants: '#4a3a2a', style: 'messy', hanten: true },
    bath: { hair: '#241c18', top: '#f2c9a0', pants: '#f2c9a0', style: 'short', towel: true },
    guitar: { hair: '#5a3a22', top: '#e9e4d6', pants: '#3f5f8a', style: 'long' },
    mj1: { hair: '#241c18', top: '#4a8a5a', pants: '#3a3a3a', style: 'spiky' },
    mj2: { hair: '#6a4a2a', top: '#d0a040', pants: '#3f5f8a', style: 'short', glasses: true },
    mj3: { hair: '#241c18', top: '#7a5aa0', pants: '#2f3f5a', style: 'buzz' },
    study: { hair: '#241c18', top: '#8aa86a', pants: '#5a5040', style: 'short', glasses: true },
    call: { hair: '#a8743a', top: '#f2c84a', pants: '#2a2a2a', style: 'spiky', band: '#d8433a' },
    roommate: { hair: '#2b2220', top: '#4a8a7a', pants: '#3f5f8a', style: 'buzz' },
    yashoku: { hair: '#3a2a20', top: '#9a5a7a', pants: '#3a3a3a', style: 'messy' },
    nap: { hair: '#241c18', top: '#5a7aa8', pants: '#3a3a3a', style: 'short' },
    bike: { hair: '#241c18', top: '#d8d0c0', pants: '#3f5f8a', style: 'cap', cap: '#2a6a4a' },
  };
  D.LOOKS = LOOKS;

  function grid(rows) {
    return rows.map((r) => r.split(''));
  }
  function applyStyle(g, dir, L) {
    const set = (x, y, c) => { if (y >= 0 && y < g.length && x >= 0 && x < 16) g[y][x] = c; };
    const rowFill = (y, x0, x1, c) => { for (let x = x0; x <= x1; x++) set(x, y, c); };
    const st = L.style;
    if (st === 'buzz') {
      if (dir === 'down') { rowFill(7, 3, 12, 'S'); set(3, 7, 's'); set(12, 7, 's'); rowFill(8, 3, 12, 'S'); }
      if (dir === 'up') { rowFill(9, 4, 11, 'H'); rowFill(11, 4, 11, 'S'); }
      if (dir === 'left') { set(3, 7, 'S'); set(9, 8, 'S'); }
      for (let y = 2; y <= 6; y++) for (let x = 0; x < 16; x++) if (g[y][x] === 'H' && (x + y) % 2 === 0) g[y][x] = 'h';
    }
    if (st === 'long') {
      if (dir === 'down') { for (let y = 9; y <= 11; y++) { set(3, y, 'H'); set(12, y, 'H'); } set(4, 12, 'H'); set(11, 12, 'H'); set(3, 12, 'H'); set(12, 12, 'H'); }
      if (dir === 'up') { for (let y = 9; y <= 12; y++) rowFill(y, 3, 12, 'H'); }
      if (dir === 'left') { for (let y = 9; y <= 12; y++) rowFill(y, 9, 12, 'H'); }
    }
    if (st === 'spiky') {
      if (dir === 'left') { set(5, 1, 'H'); set(8, 1, 'H'); set(11, 1, 'H'); set(12, 2, 'H'); set(13, 3, 'H'); }
      else { set(4, 1, 'H'); set(7, 1, 'H'); set(8, 0, 'H'); set(11, 1, 'H'); set(2, 4, 'H'); set(13, 4, 'H'); }
    }
    if (st === 'messy') {
      set(6, 1, 'H'); set(9, 1, 'H'); set(10, 1, 'H'); set(13, 5, 'H');
      if (dir !== 'left') set(2, 6, 'H');
    }
    if (st === 'bald') {
      for (let y = 2; y <= 4; y++) for (let x = 0; x < 16; x++) if (g[y][x] === 'H') g[y][x] = 'S';
      set(6, 2, 'W'); set(7, 2, 'W');
      if (dir === 'down') { rowFill(5, 4, 11, 'S'); rowFill(6, 5, 10, 'S'); }
      if (dir === 'up') { rowFill(5, 5, 10, 'S'); }
      if (dir === 'left') { rowFill(5, 3, 8, 'S'); rowFill(6, 3, 7, 'S'); }
    }
    if (st === 'auntie') {
      if (dir !== 'left') { rowFill(3, 3, 12, 'H'); for (let y = 4; y <= 9; y++) { set(2, y, 'H'); set(13, y, 'H'); } }
      else { for (let y = 4; y <= 10; y++) set(13, y, 'H'); }
    }
    if (st === 'cap') {
      for (let y = 2; y <= 5; y++) for (let x = 0; x < 16; x++) if (g[y][x] === 'H') g[y][x] = 'C';
      if (dir === 'down') rowFill(6, 3, 12, 'C');
      if (dir === 'left') { rowFill(6, 1, 7, 'C'); set(2, 5, 'C'); }
      if (dir === 'up') rowFill(6, 3, 12, 'C');
    }
    if (L.scarf) {
      for (let y = 1; y <= 4; y++) for (let x = 0; x < 16; x++) if (g[y][x] === 'H') g[y][x] = 'W';
      rowFill(1, 5, 10, 'W');
      if (dir === 'up') { set(7, 6, 'W'); set(8, 6, 'W'); set(7, 7, 'W'); }
    }
    if (L.towel) {
      rowFill(1, 5, 10, 'W'); rowFill(2, 4, 11, 'W'); set(4, 3, 'W'); set(11, 3, 'W');
    }
    if (L.band) {
      for (let x = 0; x < 16; x++) if (g[5][x] === 'H' || g[5][x] === 'h') g[5][x] = 'R';
      if (dir === 'up') { set(7, 6, 'R'); set(8, 6, 'R'); set(8, 7, 'R'); }
      if (dir === 'left') { set(12, 6, 'R'); set(13, 6, 'R'); }
    }
    if (L.glasses) {
      if (dir === 'down') { set(4, 9, 'G'); set(6, 9, 'G'); set(9, 9, 'G'); set(11, 9, 'G'); rowFill(8, 4, 6, 'G'); rowFill(8, 9, 11, 'G'); set(7, 8, 'G'); set(8, 8, 'G'); }
      if (dir === 'left') { rowFill(8, 2, 6, 'G'); set(3, 9, 'G'); set(5, 9, 'G'); }
    }
    if (L.jersey) {
      if (dir === 'left') { set(7, 14, 'W'); set(7, 15, 'W'); for (let y = 17; y <= 18; y++) set(8, y, 'W'); }
      else { set(3, 14, 'W'); set(12, 14, 'W'); set(4, 15, 'W'); set(11, 15, 'W'); set(4, 17, 'W'); set(11, 17, 'W'); }
      if (dir === 'down') { set(7, 13, 'W'); set(8, 13, 'W'); set(7, 14, 'W'); }
    }
    if (L.hanten) {
      for (let y = 13; y <= 16; y++) for (let x = 0; x < 16; x++) if (g[y][x] === 'T' && (x + y) % 3 === 0) g[y][x] = 't';
      if (dir === 'down') { set(6, 13, 'K'); set(9, 13, 'K'); set(7, 14, 'K'); set(8, 15, 'K'); }
    }
    if (L.apron) {
      if (dir === 'down') { for (let y = 14; y <= 17; y++) rowFill(y, 5, 10, 'A'); set(6, 13, 'A'); set(9, 13, 'A'); }
      if (dir === 'left') { for (let y = 14; y <= 17; y++) rowFill(y, 5, 6, 'A'); }
      if (dir === 'up') { set(7, 15, 'A'); set(8, 15, 'A'); set(6, 15, 'A'); set(9, 15, 'A'); }
    }
  }

  function colorMap(L) {
    const skin = L.skin || '#f2c9a0';
    return {
      H: L.hair, h: mix(L.hair, '#ffffff', 0.2), S: skin, s: mix(skin, '#9a5a3a', 0.25), E: P.ink,
      T: L.top, t: mix(L.top, '#000000', 0.22), P: L.pants, F: L.shoes || '#4a3a30', W: '#f6f3ea',
      G: '#3a3440', R: L.band || '#d8433a', C: L.cap || '#3a6a4a', A: L.apron || '#e0a0b0', K: '#1f1a1c',
    };
  }

  function buildSprite(g, cmap, flip) {
    const W = 16, H = g.length + 2;
    const cv = canvas(W, H);
    const ctx = cv.getContext('2d');
    const filled = (x, y) => y >= 0 && y < g.length && x >= 0 && x < W && g[y][x] !== '.';
    for (let y = -1; y <= g.length; y++)
      for (let x = 0; x < W; x++) {
        const sx = flip ? W - 1 - x : x;
        if (filled(x, y)) R(ctx, sx, y + 1, 1, 1, cmap[g[y][x]] || '#ff00ff');
        else if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) R(ctx, sx, y + 1, 1, 1, P.ink);
      }
    return cv;
  }

  const spriteCache = {};
  // dir: down/up/left/right, frame: s/a/b
  function sprite(lookId, dir, frame, pose) {
    const key = lookId + ':' + dir + ':' + frame + ':' + (pose || '');
    if (spriteCache[key]) return spriteCache[key];
    const L = LOOKS[lookId];
    const base = dir === 'right' ? 'left' : dir;
    const g = grid(TPL[base]);
    const legs = LEGS[base][frame] || LEGS[base].s;
    for (let i = 0; i < 3; i++) g[17 + i] = legs[i].split('');
    if (base === 'left' && frame !== 's') {
      // 腕のふり
      g[15][7] = 'T';
      g[16][7] = 'T';
      if (frame === 'a') { g[15][5] = 't'; g[16][5] = 'S'; }
      else { g[15][9] = 't'; g[16][9] = 'S'; }
    }
    applyStyle(g, base, L);
    if (pose === 'sleep') {
      g[9][5] = 'S'; g[9][10] = 'S';
    }
    if (pose === 'doze' && base === 'down') { g[9][5] = 'S'; g[9][10] = 'S'; }
    const cv = buildSprite(g, colorMap(L), dir === 'right');
    spriteCache[key] = cv;
    return cv;
  }

  // ネコ（茶トラ）
  const CAT = {
    s: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '..O.O...........',
      '..OOO...........',
      '.OEOEO........O.',
      '.ONOOO.......O..',
      '..OOO........O..',
      '..OOOOOOOOOOOO..',
      '..OoOOoOOoOOO...',
      '..WOOOOOOOOOO...',
      '..WOO.....OO....',
      '..W.O.....O.O...',
      '................',
      '................',
      '................',
      '................',
    ],
    a: [
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '..O.O...........',
      '..OOO...........',
      '.OEOEO.......O..',
      '.ONOOO.......O..',
      '..OOO.......O...',
      '..OOOOOOOOOOOO..',
      '..OoOOoOOoOOO...',
      '..WOOOOOOOOOO...',
      '..WO.O...O.O....',
      '..W...O.O...O...',
      '................',
      '................',
      '................',
      '................',
    ],
  };
  function catSprite(dir, frame) {
    const key = 'cat:' + dir + ':' + frame;
    if (spriteCache[key]) return spriteCache[key];
    const g = grid(CAT[frame === 'a' || frame === 'b' ? 'a' : 's']);
    const cmap = { O: '#e39a4a', o: '#b8692a', W: '#f6f0e4', E: P.ink, N: '#e08a8a' };
    const cv = buildSprite(g, cmap, dir === 'right');
    spriteCache[key] = cv;
    return cv;
  }
  D.art.sprite = sprite;
  D.art.catSprite = catSprite;

  // ── 動くもの（毎フレーム） ─────────────────────────
  function drawAnim(ctx, map, ox, oy, t) {
    for (const a of map.anim) {
      const px = a.x * TS - ox, py = a.y * TS - oy;
      if (a.ch === 'T') {
        const k = Math.floor(t / 500 + a.x) % 3;
        const c = ['#7fa9b8', '#9fc0a0', '#b8a0c8'][k];
        R(ctx, px + 4, py + 4, 6, 5, c);
        R(ctx, px + 4, py + 4 + (Math.floor(t / 90) % 5), 6, 1, 'rgba(255,255,255,0.35)');
      } else if (a.ch === 'O') {
        const k = Math.floor(t / 400 + a.x * 3 + a.y) % 4;
        R(ctx, px + 3 + k * 2, py + 5 + (k % 2) * 4, 3, 1, P.waterHi);
        if (k === 0) R(ctx, px + 6, py + 2, 1, 2, 'rgba(255,255,255,0.6)');
      }
    }
  }
  D.art.drawAnim = drawAnim;
  D.art.drawTallExt = drawTallExt;
  D.art.drawDoor = drawDoor;
  D.renderMap = renderMap;

  // ── タイトルとエンディングの絵 ─────────────────────────
  const SKY = ['#2b1d4e', '#45285f', '#6b3166', '#9a3d68', '#c9536a', '#e57656', '#f39a52', '#f8bf68', '#fbdc8a'];
  function drawSky(ctx, w, h, horizon) {
    const n = SKY.length;
    for (let y = 0; y < horizon; y++) {
      const tt = (y / horizon) * (n - 1);
      const i = Math.floor(tt), f = tt - i;
      for (let x = 0; x < w; x += 1) {
        // 2x2 のディザで帯の境目をなじませる
        const dither = ((x + y) & 1) ? 0.25 : 0.75;
        const c = f > dither && i + 1 < n ? SKY[i + 1] : SKY[i];
        ctx.fillStyle = c;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  const skyCache = {};
  function skyImage(w, h, horizon) {
    const k = w + 'x' + h + 'x' + horizon;
    if (skyCache[k]) return skyCache[k];
    const cv = canvas(w, h);
    drawSky(cv.getContext('2d'), w, h, horizon);
    skyCache[k] = cv;
    return cv;
  }
  function drawSun(ctx, cx, cy, r, horizon) {
    for (let y = -r; y <= r; y++) {
      const yy = cy + y;
      if (yy >= horizon) continue;
      const hw = Math.floor(Math.sqrt(r * r - y * y));
      // 下のほうに横じま
      if (y > r * 0.25 && (y % 4 === 0 || (y > r * 0.6 && y % 3 === 0))) continue;
      R(ctx, cx - hw, yy, hw * 2 + 1, 1, y < -r * 0.3 ? '#fff4c8' : '#ffe39a');
    }
  }
  function drawClouds(ctx, w, t, seed) {
    for (let i = 0; i < 5; i++) {
      const cw = 24 + ((rnd(i, seed, 1) * 40) | 0);
      const cy = 14 + ((rnd(i, seed, 2) * 50) | 0);
      const cx = Math.round(((rnd(i, seed, 3) * (w + cw) + t * (0.004 + i * 0.001)) % (w + cw)) - cw);
      R(ctx, cx, cy, cw, 2, '#f4a07a');
      R(ctx, cx + 4, cy - 1, cw - 10, 1, '#f8c49a');
      R(ctx, cx + 2, cy + 2, cw - 4, 1, '#b85a7a');
    }
  }
  function drawHills(ctx, w, base, col, amp, seed) {
    for (let x = 0; x < w; x++) {
      const hgt = Math.round(amp * (0.55 + 0.45 * Math.sin(x / 23 + seed) * Math.cos(x / 41 + seed * 2)) + rnd(x >> 2, seed, 4) * 2);
      R(ctx, x, base - hgt, 1, hgt + 1, col);
    }
  }
  function drawCity(ctx, w, base, seed, lightT) {
    let x = 0, i = 0;
    while (x < w) {
      const bw = 5 + ((rnd(i, seed, 1) * 10) | 0);
      const bh = 3 + ((rnd(i, seed, 2) * 9) | 0);
      R(ctx, x, base - bh, bw, bh, '#3a2348');
      for (let yy = base - bh + 2; yy < base - 1; yy += 3)
        for (let xx = x + 1; xx < x + bw - 1; xx += 2)
          if (rnd(xx, yy, seed) < 0.2 * lightT) R(ctx, xx, yy, 1, 1, '#ffd27a');
      x += bw + 1 + ((rnd(i, seed, 3) * 6) | 0);
      i++;
    }
  }
  function drawCrows(ctx, w, t) {
    for (let i = 0; i < 3; i++) {
      const x = Math.round(((t * 0.012 + i * 70) % (w + 40)) - 20);
      const y = Math.round(28 + i * 9 + Math.sin(t / 400 + i) * 3);
      const up = Math.floor(t / 180 + i) % 2;
      R(ctx, x, y, 1, 1, P.ink);
      R(ctx, x - 1, y - up, 1, 1, P.ink);
      R(ctx, x - 2, y - 1 + up, 1, 1, P.ink);
      R(ctx, x + 1, y - up, 1, 1, P.ink);
      R(ctx, x + 2, y - 1 + up, 1, 1, P.ink);
    }
  }

  function drawTitle(ctx, w, h, t) {
    const horizon = h - 34;
    ctx.drawImage(skyImage(w, h, horizon), 0, 0);
    drawSun(ctx, Math.round(w * 0.2), horizon - 10, 15, horizon);
    drawClouds(ctx, w, t, 1);
    drawHills(ctx, w, horizon, '#5a2f5e', 12, 1.3);
    drawHills(ctx, w, horizon + 4, '#40244c', 8, 2.1);
    R(ctx, 0, horizon + 4, w, h, '#2f1d38');
    // 寮
    const u = w >= 200 ? 4 : 3;
    const fh = 13, rh = 7;
    const bw = 42 * u;
    const bx = Math.round((w - bw) / 2), by = h - 12 - (rh + fh * 3);
    drawFacade(ctx, bx, by, { u, roofH: rh, floorH: fh, lit: 0.35 });
    // 前庭と桜
    R(ctx, 0, h - 12, w, 12, '#2f3f2a');
    R(ctx, 0, h - 12, w, 1, '#4f6a3a');
    R(ctx, bx + 9 * u - 2, h - 12, 3 * u + 4, 12, '#a8936e');
    for (const [cx, s] of [[bx - 10, 1], [bx + bw + 8, 2], [bx + bw * 0.62, 3]]) {
      const x = Math.round(cx), yb = h - 10;
      R(ctx, x - 1, yb - 12, 3, 12, P.trunkDk);
      disc(ctx, x, yb - 19, 10, P.sakD);
      disc(ctx, x - 6, yb - 16, 5, P.sakD);
      disc(ctx, x + 6, yb - 16, 5, P.sakD);
      disc(ctx, x - 1, yb - 21, 8, P.sakB);
      disc(ctx, x - 3, yb - 24, 4, P.sakA);
      for (let i = 0; i < 7; i++) R(ctx, x - 8 + ((rnd(i, s, 2) * 16) | 0), yb - 27 + ((rnd(i, s, 3) * 14) | 0), 1, 1, P.sakC);
    }
    // 電柱と電線
    const pole = w - 18;
    R(ctx, pole, 18, 3, h - 18, '#2b2026');
    R(ctx, pole - 6, 24, 15, 2, '#2b2026');
    for (const yy of [25, 30]) {
      for (let x = 0; x < pole; x++) {
        const sag = Math.round(10 * Math.sin((x / pole) * Math.PI));
        R(ctx, x, yy + sag, 1, 1, '#2b2026');
      }
    }
    drawCrows(ctx, w, t);
  }

  function drawEnding(ctx, w, h, t, chars) {
    const horizon = Math.round(h * 0.52);
    ctx.drawImage(skyImage(w, h, horizon), 0, 0);
    const sunY = horizon - 4 + Math.min(10, t / 1200);
    drawSun(ctx, Math.round(w * 0.5), Math.round(sunY), 18, horizon);
    drawClouds(ctx, w, t, 2);
    drawHills(ctx, w, horizon + 3, '#5a2f5e', 7, 0.4);
    R(ctx, 0, horizon + 3, w, h, '#3a2348');
    drawCity(ctx, w, horizon + 12, 3, Math.min(1, t / 6000));
    R(ctx, 0, horizon + 12, w, h, '#2a1a33');
    drawCrows(ctx, w, t + 2000);
    const py = Math.round(h * 0.66);
    // 3 人の後ろ姿（手すり壁の手前に立つ）
    const cx = Math.round(w / 2);
    chars.forEach((id, i) => {
      ctx.drawImage(sprite(id, 'up', 's'), cx - 28 + i * 18, py - 17);
    });
    // 屋上の手すり壁
    R(ctx, 0, py, w, h - py, '#4a3a4e');
    R(ctx, 0, py, w, 3, '#9a706a');
    R(ctx, 0, py + 3, w, 1, '#33243a');
    // 高架水槽のシルエット
    R(ctx, w - 40, py - 24, 28, 18, '#3a2a40');
    R(ctx, w - 40, py - 24, 28, 2, '#5a3a50');
    R(ctx, w - 38, py - 6, 2, 6, '#3a2a40');
    R(ctx, w - 16, py - 6, 2, 6, '#3a2a40');
  }
  D.art.drawTitle = drawTitle;
  D.art.drawEnding = drawEnding;
})();
