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
    door: '#86b8c0', doorDk: '#6a9aa4', doorFrame: '#4f6a74', plate: '#f4f1e8',
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
    conc: '#d6d2c6', concHi: '#e7e3d9', concSh: '#b4afa3', concDk: '#959083', concXd: '#77726a',
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
  const WALL = new Set('#wBAeMYQnH0'.split(''));
  const FLOOR = new Set('.,=_~;-%":<*`&'.split(''));
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
  // 居室の寄木：8x8 のブロックを縦横交互に
  function parquet(ctx, x, y, px, py) {
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        const bx = px + i * 8, by = py + j * 8;
        const vert = (x * 2 + i + y * 2 + j) & 1;
        R(ctx, bx, by, 8, 8, vert ? '#b47c46' : '#ac7541');
        for (let k = 1; k < 4; k++) {
          if (vert) R(ctx, bx + k * 2, by, 1, 8, '#a06b39');
          else R(ctx, bx, by + k * 2, 8, 1, '#a06b39');
        }
        R(ctx, bx, by, 8, 1, '#8e5f33');
        R(ctx, bx, by, 1, 8, '#8e5f33');
        if (rnd(x * 2 + i, y * 2 + j, 3) < 0.3) R(ctx, bx + 2, by + 3, 2, 1, '#c2895a');
      }
  }
  function drawFloor(ctx, ch, x, y, px, py) {
    switch (ch) {
      case '.': { // 廊下の青いリノリウム
        R(ctx, px, py, 16, 16, (x + y) & 1 ? '#5d7287' : '#586d82');
        R(ctx, px, py, 16, 1, '#50647a');
        if (rnd(x, y, 3) < 0.35) R(ctx, px + 2 + ((rnd(x, y, 4) * 10) | 0), py + 3 + ((rnd(x, y, 5) * 10) | 0), 3, 1, '#6b8197');
        if (rnd(x, y, 6) < 0.25) R(ctx, px + ((rnd(x, y, 7) * 15) | 0), py + ((rnd(x, y, 8) * 15) | 0), 1, 1, '#465a6e');
        break;
      }
      case ',': { // 居室の寄木（パーケット）
        parquet(ctx, x, y, px, py);
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
      case '_': { // 玄関のタイル
        R(ctx, px, py, 16, 16, '#d6cfbf');
        R(ctx, px, py, 16, 1, '#b8b0a0');
        R(ctx, px, py + 8, 16, 1, '#b8b0a0');
        R(ctx, px, py, 1, 16, '#b8b0a0');
        R(ctx, px + 8, py, 1, 16, '#b8b0a0');
        if (rnd(x, y, 3) < 0.3) R(ctx, px + 2 + ((rnd(x, y, 4) * 10) | 0), py + 2 + ((rnd(x, y, 5) * 10) | 0), 2, 1, '#c4bcab');
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
      case '-': { // 厨房・脱衣所などの床
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) R(ctx, px + i * 8, py + j * 8, 8, 8, (i + j) & 1 ? '#bdb9ae' : '#b3afa4');
        break;
      }
      case '<': { // 食堂のオレンジ色の床
        R(ctx, px, py, 16, 16, '#c8843f');
        for (let i = 0; i < 10; i++) R(ctx, px + ((rnd(x, y, i) * 16) | 0), py + ((rnd(x, y, i + 20) * 16) | 0), 1, 1, i & 1 ? '#b57434' : '#d6955a');
        if (x % 2 === 0) R(ctx, px, py, 1, 16, '#b97a3a');
        if (y % 2 === 0) R(ctx, px, py, 16, 1, '#b97a3a');
        break;
      }
      case '*': { // ジョイントマット
        for (let j = 0; j < 2; j++)
          for (let i = 0; i < 2; i++) {
            const dark = (x * 2 + i + y * 2 + j) & 1;
            R(ctx, px + i * 8, py + j * 8, 8, 8, dark ? '#2b2b30' : '#e7e3d8');
            R(ctx, px + i * 8 + 3, py + j * 8, 2, 1, dark ? '#e7e3d8' : '#2b2b30');
            R(ctx, px + i * 8, py + j * 8 + 3, 1, 2, dark ? '#e7e3d8' : '#2b2b30');
          }
        break;
      }
      case '`': { // はがれた床
        parquet(ctx, x, y, px, py);
        R(ctx, px + 3, py + 2, 9, 6, '#a29e95');
        R(ctx, px + 5, py + 8, 7, 5, '#a29e95');
        R(ctx, px + 4, py + 4, 2, 1, '#8c887f');
        R(ctx, px + 8, py + 10, 3, 1, '#8c887f');
        break;
      }
      case '&': { // 段ボールでふさいだ床
        parquet(ctx, x, y, px, py);
        R(ctx, px + 1, py + 2, 14, 11, '#c49a62');
        R(ctx, px + 1, py + 2, 14, 1, '#d6ae78');
        R(ctx, px + 1, py + 7, 14, 2, '#e0cfa2');
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
      case 'pave': { // コンクリート舗装（寮の前の駐車スペース）
        R(ctx, px, py, 16, 16, '#b3aea3');
        if (x % 2 === 0) R(ctx, px, py, 1, 16, '#a19c91');
        if (y % 2 === 0) R(ctx, px, py, 16, 1, '#a19c91');
        for (let i = 0; i < 6; i++) R(ctx, px + ((rnd(x, y, i) * 16) | 0), py + ((rnd(x, y, i + 9) * 16) | 0), 1, 1, i & 1 ? '#c2bdb2' : '#9d988d');
        if (rnd(x, y, 21) < 0.12) { R(ctx, px + 3, py + 6, 5, 1, '#958f84'); R(ctx, px + 8, py + 7, 4, 1, '#958f84'); }
        break;
      }
      case 'walk': { // 歩道のインターロッキング
        R(ctx, px, py, 16, 16, '#8e8b85');
        for (let r = 0; r < 4; r++) {
          const off = r & 1 ? 4 : 0;
          for (let i = -1; i < 3; i++) {
            const a = Math.max(0, off + i * 8), b = Math.min(16, off + i * 8 + 7);
            if (b > a) R(ctx, px + a, py + r * 4, b - a, 3, ((x * 2 + i + r) & 3) === 0 ? '#b2aea6' : '#a7a49c');
          }
        }
        break;
      }
      case 'water': { // 裏手の水辺
        R(ctx, px, py, 16, 16, y === 0 ? '#183241' : '#1d3a4a');
        for (let i = 0; i < 3; i++) R(ctx, px + ((rnd(x, y, i) * 12) | 0), py + 2 + i * 5, 4, 1, '#2c5366');
        break;
      }
      case 'seawall': { // 護岸
        R(ctx, px, py, 16, 16, '#8a8578');
        R(ctx, px, py, 16, 3, '#55524a');
        R(ctx, px, py + 3, 16, 1, '#a49f92');
        R(ctx, px, py + 8, 16, 1, '#5f5c55');
        if (x % 2 === 0) R(ctx, px + 2, py + 5, 1, 7, '#5f5c55');
        R(ctx, px, py + 14, 16, 2, '#77736a');
        break;
      }
      case 'zebra': { // 道路のゼブラ
        drawFloor(ctx, ';road', x, y, px, py);
        for (let j = 2; j < 14; j++)
          for (let k = 0; k < 16; k++) if ((px + k + j) % 12 < 3) R(ctx, px + k, py + j, 1, 1, '#e3dfd3');
        break;
      }
      default:
        R(ctx, px, py, 16, 16, P.woodA);
    }
  }
  const EXT_FLOOR = { '.': 'pave', ':': ':', '-': 'walk', ';': ';road', '^': '^', Z: 'zebra', '~': 'water', S: 'seawall', '"': '"' };

  // ── 壁 ────────────────────────────────────────
  function faceStyle(map, x, y) {
    const name = labelAt(map, x, y + 1) || (map.kind === 'in' ? '廊下' : '');
    if (name === '浴室') return 'bath';
    if (name === 'トイレ' || name.indexOf('洗面所') === 0 || name === '脱衣所') return 'tile';
    if (name === '厨房') return 'kitchen';
    if (name === '食堂') return 'yellow';
    if (name === '廊下' || name === '玄関' || name === '階段') return 'speckle';
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
    // 食堂は黄色い壁、廊下・玄関は粒の入った壁（写真 1025・0730 など）
    const base = st === 'yellow' ? '#e5cf88' : st === 'speckle' ? '#d6c8aa' : '#ebe5d6';
    R(ctx, px, py + 3, 16, 10, base);
    R(ctx, px, py + 3, 16, 1, mix(base, '#000000', 0.12));
    R(ctx, px, py + 4, 16, 2, mix(base, '#ffffff', 0.25));
    if (st === 'speckle') for (let i = 0; i < 12; i++) R(ctx, px + ((rnd(x, y, i) * 16) | 0), py + 5 + ((rnd(x, y, i + 30) * 8) | 0), 1, 1, i % 3 ? '#a8987a' : '#f3ead6');
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
    if (faceStyle(map, x, y) === 'yellow') { // 食堂の大きな窓：カーテンなし、細かい桟
      R(ctx, px + 8, py + 4, 1, 7, P.aluDk);
      return;
    }
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
    } else if (ch === 'H' || ch === '0') {
      R(ctx, px, py, 16, 16, P.concHi);
      R(ctx, px, py + 14, 16, 2, P.concSh);
      if ('H0'.includes(at(map, x - 1, y)) || 'H0'.includes(at(map, x + 1, y))) {
        R(ctx, px, py + 7, 16, 1, '#8a4b3a');
        if (x % 2 === 0) R(ctx, px + 7, py + 5, 2, 5, '#6e3a2c');
      } else {
        R(ctx, px + 7, py, 1, 16, '#8a4b3a');
        if (y % 2 === 0) R(ctx, px + 5, py + 7, 5, 2, '#6e3a2c');
      }
      if (ch === '0') futon(ctx, x, y, px, py + 3, 12);
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
        const room = labelAt(map, x, y + 1) || '';
        if (room === '食堂') { // 部屋割り表
          R(ctx, px + 2, py + 4, 12, 9, '#f4f1e8');
          for (let j = 0; j < 4; j++) R(ctx, px + 3, py + 5 + j * 2, 10, 1, '#c8c2b4');
          for (let i = 0; i < 3; i++) R(ctx, px + 5 + i * 3, py + 5, 1, 7, '#c8c2b4');
          break;
        }
        if (room === '管理人室') {
          R(ctx, px + 1, py + 4, 14, 9, '#7a5a3a');
          R(ctx, px + 2, py + 5, 12, 7, '#3f6a4a');
          R(ctx, px + 3, py + 6, 4, 4, '#cfe3f0');
          R(ctx, px + 8, py + 6, 4, 3, P.white);
          break;
        }
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
      case 'n': { // 管理人室の小窓とマイク
        R(ctx, px + 1, py + 4, 14, 7, P.aluDk);
        R(ctx, px + 2, py + 5, 12, 5, '#cfe3ea');
        R(ctx, px + 8, py + 5, 1, 5, P.aluDk);
        R(ctx, px, py + 11, 16, 2, P.woodLt);
        R(ctx, px + 4, py + 7, 3, 2, '#4a4a52');
        R(ctx, px + 5, py + 9, 1, 2, '#3a3a40');
        break;
      }
      case 'H':
      case '0': { // 屋上の手すり壁（北側は内側の面が見える）
        R(ctx, px, py, 16, 5, P.concHi);
        R(ctx, px, py + 2, 16, 1, '#8a4b3a');
        if (x % 2 === 0) R(ctx, px + 7, py, 2, 4, '#6e3a2c');
        R(ctx, px, py + 5, 16, 11, P.conc);
        R(ctx, px, py + 5, 16, 1, P.concSh);
        if (x % 4 === 0) R(ctx, px + 7, py + 13, 2, 3, P.concDk);
        if (ch === '0') futon(ctx, x, y, px, py + 1, 12);
        break;
      }
    }
    // 表札（ドアの左隣）
    if (ch === '#' && '+/'.includes(at(map, x + 1, y))) {
      const num = roomNumberFor(map, x + 1, y);
      if (num) {
        R(ctx, px + 1, py + 5, 15, 9, P.doorFrame);
        R(ctx, px + 2, py + 6, 13, 7, P.plate);
        drawDigits(ctx, num, px + 3, py + 7, P.ink);
      }
    }
  }

  // ── ドア・階段 ───────────────────────────────────
  const DOORISH = new Set(['+', '/', '$', 'N']);
  // 縦の壁（左右に部屋がある壁）についたドアか
  function doorVertical(map, x, y) {
    const up = at(map, x, y - 1), dn = at(map, x, y + 1);
    return (isWall(up) || DOORISH.has(up)) && (isWall(dn) || DOORISH.has(dn));
  }
  function drawDoor(ctx, map, x, y, px, py, ch, open) {
    if (ch === '/') open = true;
    const up = at(map, x, y - 1), dn = at(map, x, y + 1);
    if (doorVertical(map, x, y)) { // 縦の壁のドア（上から見る）
      drawFloor(ctx, baseFloor(map, x, y), x, y, px, py);
      const t = isWall(up) ? 2 : 0, b = isWall(dn) ? 2 : 0;
      if (t) R(ctx, px + 5, py, 6, 2, P.wallTop);
      if (b) R(ctx, px + 5, py + 14, 6, 2, P.wallTop);
      if (!open) {
        R(ctx, px + 6, py + t, 4, 16 - t - b, P.door);
        R(ctx, px + 6, py + t, 1, 16 - t - b, P.doorDk);
        if (ch === '$') R(ctx, px + 7, py + 7, 2, 2, '#3a3a40');
      }
      return;
    }
    R(ctx, px, py, 16, 3, P.wallTop);
    R(ctx, px, py + 2, 16, 1, P.wallTopHi);
    R(ctx, px + 1, py + 3, 14, 13, P.doorFrame);
    if (open) { // 開けっぱなし
      R(ctx, px + 2, py + 4, 12, 12, '#2a221e');
      R(ctx, px + 2, py + 4, 3, 12, P.door);
      R(ctx, px + 2, py + 4, 1, 12, P.doorDk);
      return;
    }
    R(ctx, px + 2, py + 4, 12, 12, P.door);
    R(ctx, px + 2, py + 4, 12, 1, mix(P.door, '#ffffff', 0.3));
    R(ctx, px + 4, py + 6, 8, 3, P.doorDk);
    R(ctx, px + 5, py + 7, 6, 1, P.door);
    R(ctx, px + 4, py + 11, 8, 3, P.doorDk);
    R(ctx, px + 5, py + 12, 6, 1, P.door);
    R(ctx, px + 11, py + 9, 2, 2, '#e1e5e7');
    if (ch === '$') R(ctx, px + 11, py + 11, 2, 1, '#3a3a40');
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
  function blanket(x, y, s) {
    return BLANKETS[(rnd((x / 5) | 0, (y / 8) | 0, (x % 5) + (s || 0) * 7) * BLANKETS.length) | 0];
  }
  // 屋上の手すりに干した布団
  function futon(ctx, x, y, px, py, h) {
    const c = ['#d9606a', '#5a86c8', '#e8b440', '#6aa060'][(rnd((x / 3) | 0, y, 21) * 4) | 0];
    const hh = h || 9;
    R(ctx, px, py, 16, hh, c);
    R(ctx, px, py, 16, 1, '#a8644e');
    R(ctx, px, py + 1, 16, 1, mix(c, '#ffffff', 0.35));
    R(ctx, px, py + hh - 1, 16, 1, mix(c, '#000000', 0.25));
    for (let i = 0; i < 4; i++) R(ctx, px + 1 + i * 4 + (y & 1) * 2, py + 3 + (i & 1) * 4, 2, 2, mix(c, '#ffffff', 0.55));
  }

  // 2 マス以上の家具は、全体の絵をそのマスで切り抜いて描く
  function clipTile(ctx, px, py, fn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, 16, 16);
    ctx.clip();
    fn();
    ctx.restore();
  }
  // 同じ文字が上下に続くとき、そのかたまりの何マス目か
  function stackPos(map, x, y, ch) {
    let top = y;
    while (at(map, x, top - 1) === ch) top--;
    let bot = y;
    while (at(map, x, bot + 1) === ch) bot++;
    return { top, n: bot - top + 1, i: y - top };
  }
  function runPos(map, x, y, ch) {
    let l = x;
    while (at(map, l - 1, y) === ch) l--;
    let r = x;
    while (at(map, r + 1, y) === ch) r++;
    return { left: l, n: r - l + 1, i: x - l };
  }

  // 2段ベッド：上の段を上から見て、手前の面に下の段とはしごが見える
  function bunkBed(ctx, map, x, y, px, py) {
    const s = stackPos(map, x, y, 'b');
    const bx = px, by = py - s.i * 16, H = s.n * 16;
    const north = y < map.h / 2; // 北の並びは窓が上＝枕が上
    const wallL = isWall(at(map, x - 1, s.top));
    const c1 = blanket(x, y, 0), c2 = blanket(x, y, 1);
    const front = H - 12; // 手前の面の上端
    clipTile(ctx, px, py, () => {
      R(ctx, bx + 1, by + H - 2, 15, 2, 'rgba(0,0,0,0.18)');
      // 上の段（天面）
      R(ctx, bx + 1, by, 14, front, P.woodDk);
      R(ctx, bx + 2, by + 1, 12, front - 2, P.sheet);
      const pillowY = north ? by + 2 : by + front - 7;
      R(ctx, bx + 3, pillowY, 10, 4, P.white);
      R(ctx, bx + 3, pillowY + 3, 10, 1, P.sheetSh);
      const b0 = north ? by + 8 : by + 1, b1 = north ? by + front - 1 : by + front - 9;
      R(ctx, bx + 2, b0, 12, b1 - b0, c1);
      R(ctx, bx + 2, north ? b0 : b1 - 1, 12, 1, mix(c1, '#ffffff', 0.35));
      R(ctx, bx + 4, b0 + 2, 1, Math.max(1, b1 - b0 - 5), mix(c1, '#ffffff', 0.15));
      // 柵（壁と反対側）
      const gx = wallL ? bx + 13 : bx + 2;
      R(ctx, gx, by + 1, 1, front - 8, P.woodLt);
      R(ctx, gx, by + 1, 1, 1, P.woodXd);
      R(ctx, gx, by + front - 8, 1, 1, P.woodXd);
      // 手前の面：柱、下の段のすき間、下の段の布団
      R(ctx, bx + 1, by + front, 14, 12, P.woodDk);
      R(ctx, bx + 1, by + front, 14, 2, P.wood);
      R(ctx, bx + 3, by + front + 2, 10, 7, '#2a221e');
      R(ctx, bx + 3, by + front + 6, 10, 3, c2);
      R(ctx, bx + 3, by + front + 6, 10, 1, mix(c2, '#ffffff', 0.3));
      // 2段目の裏のステッカー
      R(ctx, bx + 4, by + front + 2, 2, 1, '#f0d040');
      R(ctx, bx + 8, by + front + 2, 1, 1, '#e05a7a');
      R(ctx, bx + 10, by + front + 3, 2, 1, '#6ac0e0');
      R(ctx, bx + 1, by + front + 9, 14, 2, P.wood);
      R(ctx, bx + 1, by + H - 1, 14, 1, P.woodXd);
      // はしご（少しだけ斜め）
      const lx = wallL ? bx + 10 : bx + 2;
      const d = wallL ? 1 : -1;
      for (let j = 0; j < 14; j++) {
        const o = j > 9 ? d : 0;
        R(ctx, lx + o, by + front - 4 + j, 1, 1, P.woodLt);
        R(ctx, lx + 3 + o, by + front - 4 + j, 1, 1, P.woodLt);
      }
      for (let j = 0; j < 4; j++) R(ctx, lx + (j > 2 ? d : 0), by + front - 2 + j * 3, 4, 1, P.woodHi || P.woodLt);
    });
  }

  // 机（2 マスで 1 台）
  function desk(ctx, map, x, y, px, py) {
    const room = labelAt(map, x, y) || '';
    const r = runPos(map, x, y, 'd');
    const left = r.i === 0;
    if (room === '勉強部屋') { // 学校のような机
      R(ctx, px + (left ? 1 : 0), py + 3, left ? 15 : 15, 8, '#d9b98a');
      R(ctx, px + (left ? 1 : 0), py + 3, 15, 1, '#e8cfa6');
      R(ctx, px + (left ? 1 : 0), py + 11, 15, 2, '#9a9ea2');
      R(ctx, px + (left ? 2 : 13), py + 13, 1, 3, P.metalXd);
      if (rnd(x, y, 3) < 0.5) { R(ctx, px + 5, py + 5, 6, 4, P.white); R(ctx, px + 6, py + 6, 4, 1, '#9a9488'); }
      return;
    }
    const wallUp = isWall(at(map, x, y - 1));
    // 天板
    R(ctx, px + (left ? 1 : 0), py + 2, left ? 15 : 15, 10, P.woodLt);
    R(ctx, px + (left ? 1 : 0), py + 2, 15, 1, '#c18d55');
    R(ctx, px + (left ? 1 : 0), py + 12, 15, 3, P.wood);
    R(ctx, px + (left ? 1 : 0), py + 15, 15, 1, P.woodXd);
    if (left) { R(ctx, px + 1, py + 2, 1, 14, P.woodDk); R(ctx, px + 6, py + 13, 4, 1, P.woodXd); }
    else R(ctx, px + 14, py + 2, 1, 14, P.woodDk);
    if (wallUp) { // 窓ぎわの机：奥に棚
      R(ctx, px + (left ? 1 : 0), py, 15, 4, P.wood);
      for (let i = 0; i < 6; i++) R(ctx, px + 2 + i * 2, py + 1, 1, 2, ['#c94a3a', '#3f6aa8', '#e0c05a', '#5d8a4a', '#f3f0e6'][(rnd(x, y, i) * 5) | 0]);
    }
    const k = (rnd(x, y, 1) * 4) | 0;
    if (left) {
      if (k === 0) { R(ctx, px + 4, py + 6, 6, 5, P.white); R(ctx, px + 5, py + 7, 4, 1, '#9a9488'); R(ctx, px + 5, py + 9, 4, 1, '#9a9488'); }
      else if (k === 1) { R(ctx, px + 4, py + 5, 8, 6, '#3a3a40'); R(ctx, px + 5, py + 6, 6, 4, '#7fa9b8'); }
      else { const bc = ['#3f6aa8', '#d8603a', '#5d8a4a', '#c9a23a'][(rnd(x, y, 2) * 4) | 0]; R(ctx, px + 4, py + 6, 7, 2, bc); R(ctx, px + 4, py + 8, 7, 2, mix(bc, '#ffffff', 0.3)); }
    } else {
      R(ctx, px + 9, py + 5, 3, 2, '#e8e2c8');
      R(ctx, px + 10, py + 7, 1, 3, P.metalDk);
      R(ctx, px + 9, py + 10, 3, 1, P.metalXd);
      if (k === 2) { R(ctx, px + 3, py + 7, 3, 3, '#f3f0e6'); R(ctx, px + 4, py + 8, 1, 1, '#8a5a3a'); }
    }
  }

  // イス：机・テーブルのある側を向く
  function chair(ctx, map, x, y, px, py) {
    const room = labelAt(map, x, y) || '';
    const deskUp = 'dtj'.includes(at(map, x, y - 1));
    const col = room === '食堂' ? '#4a7ab8' : room === '勉強部屋' ? '#c9a46a' : '#3a3a42';
    const dk = mix(col, '#000000', 0.3), hi = mix(col, '#ffffff', 0.2);
    if (deskUp) { // 机が上：座面が上、背もたれが下
      R(ctx, px + 4, py + 1, 8, 6, col);
      R(ctx, px + 4, py + 1, 8, 1, hi);
      R(ctx, px + 4, py + 7, 8, 5, dk);
      R(ctx, px + 4, py + 7, 8, 1, col);
      R(ctx, px + 4, py + 12, 1, 3, P.metalXd);
      R(ctx, px + 11, py + 12, 1, 3, P.metalXd);
    } else { // 机が下（または無し）：背もたれが上
      R(ctx, px + 4, py + 2, 8, 4, dk);
      R(ctx, px + 4, py + 2, 8, 1, col);
      R(ctx, px + 4, py + 6, 8, 6, col);
      R(ctx, px + 4, py + 6, 8, 1, hi);
      R(ctx, px + 4, py + 12, 1, 3, P.metalXd);
      R(ctx, px + 11, py + 12, 1, 3, P.metalXd);
    }
  }

  // 本棚（中身はマンガ）
  function bookRows(ctx, x, y, bx, by, w, rows, pitch) {
    const cols = ['#c94a3a', '#3f6aa8', '#e0c05a', '#5d8a4a', '#f3f0e6', '#8a5aa0', '#e07a4a', '#2f2f36'];
    for (let s = 0; s < rows; s++) {
      let cx = bx, i = 0;
      while (cx < bx + w) {
        const bw = 1 + ((rnd(x, y * 7 + s, i) * 2) | 0);
        const bh = pitch - 2 + ((rnd(x, y * 7 + s, i + 30) * 2) | 0);
        R(ctx, cx, by + s * pitch + (pitch - bh), Math.min(bw, bx + w - cx), bh, cols[(rnd(x, y + s, i + 60) * cols.length) | 0]);
        cx += bw;
        i++;
      }
    }
  }

  function drawFurniture(ctx, map, x, y, px, py, ch) {
    const nb = (dx, dy) => at(map, x + dx, y + dy);
    const room = labelAt(map, x, y) || '';
    const roof = map.kind === 'roof';
    switch (ch) {
      case 'b': return bunkBed(ctx, map, x, y, px, py);
      case 'd': {
        if (room === '宿直室') { // 小さな机
          R(ctx, px + 1, py + 3, 14, 9, P.woodLt);
          R(ctx, px + 1, py + 3, 14, 1, '#c18d55');
          R(ctx, px + 1, py + 12, 14, 3, P.wood);
          R(ctx, px + 4, py + 5, 5, 5, P.white);
          break;
        }
        return desk(ctx, map, x, y, px, py);
      }
      case 'c': return chair(ctx, map, x, y, px, py);
      case 'K': {
        if (room === '食堂') { // 食器棚。上に優勝トロフィーが 3 つ
          const s = stackPos(map, x, y, 'K');
          clipTile(ctx, px, py, () => {
            const by = py - s.i * 16, H = s.n * 16;
            R(ctx, px + 1, by + 6, 14, H - 6, '#9aa3aa');
            R(ctx, px + 1, by + 6, 14, 2, '#c3cbd0');
            R(ctx, px + 2, by + 9, 12, 12, '#cfe0e6');
            R(ctx, px + 8, by + 9, 1, 12, '#9aa3aa');
            R(ctx, px + 2, by + 15, 12, 1, '#9aa3aa');
            for (let i = 0; i < 4; i++) R(ctx, px + 3 + i * 3, by + 12, 2, 3, i & 1 ? P.white : '#e8d8b0');
            R(ctx, px + 2, by + 22, 12, H - 24, '#868f96');
            R(ctx, px + 8, by + 22, 1, H - 24, '#6f777d');
            R(ctx, px + 6, by + 25, 1, 2, P.metalLt);
            R(ctx, px + 9, by + 25, 1, 2, P.metalLt);
            R(ctx, px + 1, by + H - 1, 14, 1, '#5f666b');
            // トロフィー
            for (let i = 0; i < 3; i++) {
              const tx = px + 2 + i * 4 + (i === 1 ? 1 : 0), ty = by + (i === 1 ? 0 : 1);
              R(ctx, tx, ty + 1, 4, 3, '#e8c040');
              R(ctx, tx, ty + 1, 4, 1, '#f8e08a');
              R(ctx, tx + 1, ty + 4, 2, 2, '#c89a2a');
              R(ctx, tx, ty + 6, 4, 1, '#7a5a3a');
            }
          });
          break;
        }
        // スチールのロッカー
        R(ctx, px + 2, py + 1, 12, 15, '#a9b1b6');
        R(ctx, px + 2, py + 1, 12, 2, '#cdd4d8');
        R(ctx, px + 8, py + 3, 1, 13, '#8a9297');
        R(ctx, px + 4, py + 5, 3, 1, '#7a8287');
        R(ctx, px + 10, py + 5, 3, 1, '#7a8287');
        R(ctx, px + 6, py + 9, 1, 2, P.metalXd);
        R(ctx, px + 10, py + 9, 1, 2, P.metalXd);
        R(ctx, px + 2, py + 15, 12, 1, '#6d7378');
        break;
      }
      case 'k': {
        if (room === '食堂') { // 机の上の水色の本棚。卒業生のマンガ
          const s = stackPos(map, x, y, 'k');
          R(ctx, px + 1, py, 15, 16, '#9ccbd6');
          R(ctx, px + 1, py, 1, 16, '#7fb0bd');
          if (s.i === 0) R(ctx, px + 1, py, 15, 2, '#bfe0e8');
          R(ctx, px + 3, py + (s.i === 0 ? 2 : 0), 12, s.i === 0 ? 14 : 16, '#5f8f9a');
          bookRows(ctx, x, y, px + 3, py + (s.i === 0 ? 3 : 1), 12, 3, 5);
          for (let j = 0; j < 3; j++) R(ctx, px + 3, py + (s.i === 0 ? 7 : 5) + j * 5, 12, 1, '#9ccbd6');
          if (s.i === s.n - 1) R(ctx, px + 1, py + 15, 15, 1, '#5f8f9a');
          break;
        }
        if (room === '厨房' || room === '物置') { // 金属の棚
          R(ctx, px + 1, py + 1, 14, 15, '#8a9297');
          R(ctx, px + 2, py + 2, 12, 13, '#5f666b');
          for (let j = 0; j < 3; j++) {
            R(ctx, px + 2, py + 6 + j * 4, 12, 1, P.metal);
            const c = room === '物置' ? '#c49a62' : ['#f3f0e6', '#d0d4d8', '#e8c070'][(rnd(x, y, j) * 3) | 0];
            R(ctx, px + 3 + ((rnd(x, y, j + 4) * 3) | 0), py + 3 + j * 4, 5, 3, c);
            if (rnd(x, y, j + 8) < 0.6) R(ctx, px + 9, py + 3 + j * 4, 4, 3, mix(c, '#000000', 0.15));
          }
          break;
        }
        if (room === '管理人室') { // ファイルの棚
          R(ctx, px + 1, py + 1, 14, 15, '#a9b1b6');
          R(ctx, px + 2, py + 2, 12, 13, '#7a8287');
          for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 5; i++) R(ctx, px + 3 + i * 2, py + 3 + j * 4, 2, 3, ['#3f6aa8', '#d8d4c8', '#5d8a4a'][(i + j) % 3]);
            R(ctx, px + 2, py + 6 + j * 4, 12, 1, '#a9b1b6');
          }
          break;
        }
        // ベッドのわきの本棚（マンガ）
        R(ctx, px + 1, py + 1, 14, 15, P.woodDk);
        R(ctx, px + 1, py + 1, 14, 2, P.wood);
        R(ctx, px + 2, py + 3, 12, 12, P.woodXd);
        bookRows(ctx, x, y, px + 2, py + 3, 12, 3, 4);
        for (let j = 0; j < 3; j++) R(ctx, px + 2, py + 6 + j * 4, 12, 1, P.woodDk);
        break;
      }
      case 't': {
        const L = nb(-1, 0) === 't', Rr = nb(1, 0) === 't', U = nb(0, -1) === 't', Dn = nb(0, 1) === 't';
        const steel = room === '厨房';
        const top = steel ? '#c9d0d4' : '#b8b4aa', edge = steel ? '#9aa3a9' : '#8f8b82', hi = steel ? '#e4e9eb' : '#d0ccc2';
        const x0 = L ? 0 : 1, x1 = Rr ? 16 : 15, y0 = U ? 0 : 2, y1 = Dn ? 16 : 12;
        R(ctx, px + x0, py + y0, x1 - x0, y1 - y0, top);
        if (!U) R(ctx, px + x0, py + y0, x1 - x0, 1, hi);
        if (!L) R(ctx, px + x0, py + y0, 1, y1 - y0, edge);
        if (!Rr) R(ctx, px + x1 - 1, py + y0, 1, y1 - y0, edge);
        if (!Dn) {
          R(ctx, px + x0, py + y1, x1 - x0, 2, edge);
          if (!L) R(ctx, px + x0 + 1, py + y1 + 2, 1, 2, P.metalXd);
          if (!Rr) R(ctx, px + x1 - 2, py + y1 + 2, 1, 2, P.metalXd);
        }
        const r0 = rnd(x, y, 5);
        if (steel) {
          if (r0 < 0.3) { R(ctx, px + 4, py + 4, 7, 5, '#e8e4dc'); R(ctx, px + 5, py + 5, 5, 3, '#d8d0c0'); }
        } else if (r0 < 0.25) { R(ctx, px + 6, py + 5, 2, 4, '#3a2a20'); R(ctx, px + 9, py + 5, 2, 4, '#a8402a'); }
        else if (r0 < 0.5) { R(ctx, px + 5, py + 5, 6, 4, P.white); R(ctx, px + 6, py + 6, 4, 2, '#e8c070'); }
        else if (r0 < 0.62) { R(ctx, px + 5, py + 4, 5, 6, '#f3f0e6'); R(ctx, px + 6, py + 5, 3, 1, '#9a9488'); }
        break;
      }
      case 'j': { // 正方形のテーブル（2x2）と麻雀牌
        const L = nb(-1, 0) === 'j', U = nb(0, -1) === 'j';
        const x0 = L ? 0 : 1, x1 = L ? 15 : 16, y0 = U ? 0 : 2, y1 = U ? 13 : 16;
        R(ctx, px + x0, py + y0, x1 - x0, y1 - y0, '#b8b4aa');
        R(ctx, px + x0 + (L ? 0 : 1), py + y0 + (U ? 0 : 1), x1 - x0 - 1, y1 - y0 - 1, P.felt);
        if (!U) R(ctx, px + x0, py + y0, x1 - x0, 1, '#d0ccc2');
        if (U) { R(ctx, px + x0, py + 13, x1 - x0, 2, '#8f8b82'); R(ctx, px + (L ? 13 : 1), py + 15, 1, 1, P.metalXd); }
        // 牌の列
        if (!U) R(ctx, px + (L ? 0 : 4), py + 4, 12, 2, P.ivory);
        else R(ctx, px + (L ? 0 : 4), py + 9, 12, 2, P.ivory);
        if (!L) R(ctx, px + 3, py + (U ? 0 : 6), 2, 10, P.ivory);
        else R(ctx, px + 11, py + (U ? 0 : 6), 2, 10, P.ivory);
        if (!L && !U) { R(ctx, px + 9, py + 10, 2, 3, P.ivory); R(ctx, px + 12, py + 11, 2, 2, '#d8433a'); }
        break;
      }
      case 'x': { // ボイラー（2x2）
        const L = nb(-1, 0) === 'x', U = nb(0, -1) === 'x';
        clipTile(ctx, px, py, () => {
          const bx = px - (L ? 16 : 0), by = py - (U ? 16 : 0);
          R(ctx, bx + 2, by + 4, 28, 26, '#8a8f86');
          R(ctx, bx + 2, by + 4, 28, 3, '#b0b5ac');
          R(ctx, bx + 4, by + 9, 24, 14, '#9da39a');
          R(ctx, bx + 6, by + 12, 6, 6, '#3a3a40');
          R(ctx, bx + 7, by + 13, 4, 4, '#e08a3a');
          R(ctx, bx + 18, by + 12, 6, 2, P.white);
          R(ctx, bx + 18, by + 15, 6, 1, '#6a6f66');
          R(ctx, bx + 24, by + 0, 3, 6, P.metalDk);
          R(ctx, bx + 2, by + 28, 28, 2, '#5f645b');
        });
        break;
      }
      case 'T': { // テレビ（食堂は台の下に電子レンジ）
        R(ctx, px + 1, py + 9, 14, 7, P.woodDk);
        R(ctx, px + 1, py + 9, 14, 1, P.wood);
        if (room === '食堂') {
          R(ctx, px + 3, py + 11, 10, 4, '#e9e5da');
          R(ctx, px + 4, py + 12, 6, 2, '#3a3a40');
          R(ctx, px + 11, py + 12, 1, 2, P.metalXd);
        }
        R(ctx, px + 2, py, 12, 10, P.tvBody);
        R(ctx, px + 2, py, 12, 1, '#6f6964');
        R(ctx, px + 3, py + 1, 8, 7, P.tvDk);
        R(ctx, px + 4, py + 2, 6, 5, P.screen);
        R(ctx, px + 12, py + 2, 1, 1, P.metal);
        R(ctx, px + 12, py + 4, 1, 1, P.metal);
        break;
      }
      case 'F': { // 冷蔵庫
        if (room === '厨房') { // 業務用（ステンレス）
          const s = stackPos(map, x, y, 'F');
          const r = runPos(map, x, y, 'F');
          if (s.n > 1) {
            clipTile(ctx, px, py, () => {
              const by = py - s.i * 16, H = s.n * 16;
              R(ctx, px + 1, by + 1, 14, H - 1, '#b9c0c4');
              R(ctx, px + 1, by + 1, 14, 2, '#dfe4e6');
              R(ctx, px + 1, by + H / 2, 14, 1, '#8f979c');
              R(ctx, px + 3, by + 6, 1, 6, P.metalXd);
              R(ctx, px + 3, by + H / 2 + 4, 1, 6, P.metalXd);
              R(ctx, px + 1, by + H - 1, 14, 1, '#6d7378');
            });
          } else {
            R(ctx, px + (r.i ? 0 : 1), py + 2, r.i ? 15 : 15, 14, '#b9c0c4');
            R(ctx, px + (r.i ? 0 : 1), py + 2, 15, 2, '#dfe4e6');
            R(ctx, px + (r.i ? 0 : 1), py + 9, 15, 1, '#8f979c');
            R(ctx, px + (r.i ? 12 : 3), py + 5, 1, 3, P.metalXd);
            R(ctx, px + (r.i ? 0 : 1), py + 15, 15, 1, '#6d7378');
          }
          break;
        }
        const big = room === '食堂';
        R(ctx, px + 2, py + (big ? 0 : 3), 12, big ? 16 : 13, P.white);
        R(ctx, px + 2, py + (big ? 0 : 3), 12, 1, P.metalLt);
        R(ctx, px + 2, py + (big ? 6 : 8), 12, 1, P.whiteSh);
        R(ctx, px + 13, py + (big ? 0 : 3), 1, big ? 16 : 13, P.whiteSh);
        R(ctx, px + 4, py + (big ? 2 : 5), 1, 2, P.metalDk);
        R(ctx, px + 4, py + (big ? 8 : 10), 1, 3, P.metalDk);
        R(ctx, px + 2, py + 15, 12, 1, P.metalXd);
        if (!big) { R(ctx, px + 8, py + 4, 3, 2, '#e05a4a'); R(ctx, px + 9, py + 10, 2, 2, '#f0d040'); }
        break;
      }
      case 'v': { // コカ・コーラの自販機
        R(ctx, px + 1, py, 14, 16, '#c8332e');
        R(ctx, px + 1, py, 14, 1, '#e05a4a');
        R(ctx, px + 2, py + 2, 12, 5, '#f3efe4');
        for (let i = 0; i < 6; i++) R(ctx, px + 3 + i * 2, py + 3, 1, 3, ['#c8332e', '#2f2f36', '#e0b030', '#4aa04a', '#c8332e', '#3a6ad8'][i]);
        R(ctx, px + 3, py + 8, 6, 1, P.white);
        R(ctx, px + 3, py + 9, 4, 1, P.white);
        R(ctx, px + 11, py + 8, 2, 3, '#3a302b');
        R(ctx, px + 3, py + 12, 10, 3, '#3a302b');
        R(ctx, px + 1, py + 15, 14, 1, '#7a1f1c');
        break;
      }
      case 'D': { // ダイドーの自販機（当たり付き）
        R(ctx, px + 1, py, 14, 16, '#e9edf0');
        R(ctx, px + 1, py, 14, 1, P.white);
        R(ctx, px + 1, py + 1, 14, 2, '#2f5fb0');
        R(ctx, px + 2, py + 4, 12, 4, '#cfe0e6');
        for (let i = 0; i < 6; i++) R(ctx, px + 3 + i * 2, py + 5, 1, 2, ['#8a5a3a', '#e0b030', '#4aa04a', '#d8603a', '#3a6ad8', '#8a5a3a'][i]);
        R(ctx, px + 3, py + 9, 6, 2, '#2a3a2a');
        R(ctx, px + 4, py + 9, 1, 2, '#7ae07a');
        R(ctx, px + 6, py + 9, 1, 2, '#7ae07a');
        R(ctx, px + 11, py + 9, 2, 3, '#5a5f66');
        R(ctx, px + 3, py + 12, 10, 3, '#3a3a40');
        R(ctx, px + 1, py + 15, 14, 1, '#8a9297');
        break;
      }
      case 'y': { // 食事を置いておくケース
        const s = stackPos(map, x, y, 'y');
        R(ctx, px + 1, py, 14, 16, '#9a9ea2');
        if (s.i === 0) R(ctx, px + 1, py, 14, 2, '#c3c7ca');
        R(ctx, px + 2, py + (s.i === 0 ? 2 : 0), 12, s.i === 0 ? 14 : 15, '#d8e6ea');
        for (let j = 0; j < 3; j++) {
          const yy = py + (s.i === 0 ? 3 : 1) + j * 5;
          R(ctx, px + 2, yy + 3, 12, 1, '#9a9ea2');
          if (rnd(x, y, j) < 0.7) { R(ctx, px + 3, yy + 1, 5, 2, '#e8b070'); R(ctx, px + 9, yy + 1, 3, 2, P.white); }
        }
        if (s.i === s.n - 1) R(ctx, px + 1, py + 15, 14, 1, '#6d7378');
        break;
      }
      case 'f': { // 炊飯器・電気ポット・味噌汁の保温機
        const s = stackPos(map, x, y, 'f');
        R(ctx, px + 1, py, 14, 16, '#b8b4aa');
        R(ctx, px + 1, py, 1, 16, '#8f8b82');
        if (s.i === 0) {
          R(ctx, px + 1, py, 14, 1, '#d0ccc2');
          R(ctx, px + 3, py + 2, 9, 7, P.white);
          R(ctx, px + 4, py + 1, 7, 2, '#e8e4dc');
          R(ctx, px + 5, py + 6, 3, 1, '#e05a4a');
          R(ctx, px + 4, py + 10, 5, 5, '#d8d4cc');
          R(ctx, px + 5, py + 9, 3, 1, '#5a5f66');
          R(ctx, px + 10, py + 11, 3, 3, '#3a6ad8');
        } else {
          R(ctx, px + 3, py + 2, 10, 9, '#c9d0d4');
          R(ctx, px + 3, py + 2, 10, 1, '#e4e9eb');
          R(ctx, px + 5, py + 4, 6, 2, '#8a5a3a');
          R(ctx, px + 4, py + 12, 8, 2, '#8f979c');
        }
        if (s.i === s.n - 1) R(ctx, px + 1, py + 15, 14, 1, '#6d7378');
        break;
      }
      case 'r': { // 電子レンジとトースター
        R(ctx, px + 1, py + 5, 14, 11, '#b8b4aa');
        R(ctx, px + 1, py + 15, 14, 1, '#6d7378');
        R(ctx, px + 2, py, 12, 7, '#e9e5da');
        R(ctx, px + 2, py, 12, 1, P.white);
        R(ctx, px + 3, py + 2, 7, 4, '#3a3a40');
        R(ctx, px + 11, py + 2, 2, 1, '#5a5f66');
        R(ctx, px + 4, py + 9, 7, 5, '#d0d4d8');
        R(ctx, px + 5, py + 9, 2, 1, '#3a3a40');
        R(ctx, px + 8, py + 9, 2, 1, '#3a3a40');
        break;
      }
      case 'J': { // 電話の机
        R(ctx, px + 1, py + 4, 14, 8, P.woodLt);
        R(ctx, px + 1, py + 4, 14, 1, '#c18d55');
        R(ctx, px + 1, py + 12, 14, 3, P.wood);
        R(ctx, px + 4, py + 5, 8, 5, '#e8e2d0');
        R(ctx, px + 4, py + 5, 8, 2, '#3a3a40');
        R(ctx, px + 5, py + 8, 6, 1, '#9a9488');
        R(ctx, px + 12, py + 6, 2, 3, P.white);
        break;
      }
      case 'R': { // 食事表（玄関の、食堂の入口わき）
        R(ctx, px + 1, py + 1, 11, 14, '#7a5a3a');
        R(ctx, px + 2, py + 2, 9, 12, P.white);
        for (let j = 0; j < 5; j++) R(ctx, px + 2, py + 4 + j * 2, 9, 1, '#b8c0c8');
        R(ctx, px + 4, py + 2, 1, 12, '#b8c0c8');
        for (let i = 0; i < 6; i++) if (rnd(x, y, i) < 0.6) R(ctx, px + 5 + i, py + 5 + ((rnd(x, y, i + 9) * 4) | 0) * 2, 1, 1, i & 1 ? '#d8433a' : '#3a5ab8');
        R(ctx, px + 1, py + 15, 11, 1, 'rgba(0,0,0,0.2)');
        break;
      }
      case 's': { // 流し
        if (room === '厨房') {
          const r = runPos(map, x, y, 's');
          R(ctx, px, py + 1, 16, 15, '#c9d0d4');
          R(ctx, px, py + 1, 16, 1, '#e4e9eb');
          R(ctx, px + (r.i ? 0 : 2), py + 4, r.i ? 14 : 14, 8, '#9aa3a9');
          R(ctx, px + (r.i ? 0 : 3), py + 5, 13, 6, '#b9c0c4');
          if (r.i === 0) R(ctx, px + 2, py + 1, 1, 15, '#9aa3a9');
          R(ctx, px + 8, py + 2, 2, 3, P.metalXd);
          R(ctx, px, py + 13, 16, 3, '#9aa3a9');
          break;
        }
        R(ctx, px + 1, py + 1, 14, 15, P.metal);
        R(ctx, px + 1, py + 1, 14, 1, P.metalLt);
        R(ctx, px + 3, py + 4, 10, 7, P.metalDk);
        R(ctx, px + 4, py + 5, 8, 5, '#b9c0c4');
        R(ctx, px + 7, py + 2, 2, 3, P.metalXd);
        R(ctx, px + 1, py + 13, 14, 3, P.metalDk);
        if (rnd(x, y, 2) < 0.5) R(ctx, px + 5, py + 6, 3, 2, P.white);
        break;
      }
      case 'o': { // コンロ
        if (room === '厨房') {
          const r = runPos(map, x, y, 'o');
          R(ctx, px, py + 1, 16, 15, '#8a9297');
          R(ctx, px, py + 1, 16, 1, '#b0b8bd');
          R(ctx, px + 3, py + 3, 10, 8, '#2f2f36');
          disc(ctx, px + 8, py + 7, 3, '#5a5f66');
          R(ctx, px + 7, py + 6, 3, 3, '#2f2f36');
          if (r.i === 1) { R(ctx, px + 3, py + 1, 10, 9, '#9aa3a9'); R(ctx, px + 4, py + 1, 8, 2, '#c9d0d4'); }
          R(ctx, px, py + 12, 16, 4, '#6d7378');
          R(ctx, px + 4, py + 13, 2, 2, P.ink);
          R(ctx, px + 10, py + 13, 2, 2, P.ink);
          break;
        }
        R(ctx, px + 1, py + 2, 14, 14, P.metal);
        R(ctx, px + 1, py + 2, 14, 1, P.metalLt);
        R(ctx, px + 2, py + 4, 5, 5, P.ink);
        R(ctx, px + 9, py + 4, 5, 5, P.ink);
        R(ctx, px + 3, py + 5, 3, 3, '#5a5450');
        R(ctx, px + 10, py + 5, 3, 3, '#5a5450');
        R(ctx, px + 9, py + 3, 5, 4, '#d0d4d8');
        R(ctx, px + 1, py + 11, 14, 5, P.metalDk);
        R(ctx, px + 4, py + 13, 2, 2, P.ink);
        R(ctx, px + 10, py + 13, 2, 2, P.ink);
        break;
      }
      case 'i': { // 掃除用の流し
        R(ctx, px + 2, py + 4, 12, 12, '#d8dcd6');
        R(ctx, px + 2, py + 4, 12, 1, P.white);
        R(ctx, px + 4, py + 6, 8, 6, '#a9b1ae');
        R(ctx, px + 7, py + 2, 2, 4, P.metalXd);
        R(ctx, px + 2, py + 14, 12, 2, '#a9b1ae');
        R(ctx, px + 12, py + 1, 2, 9, '#4a8ad0');
        break;
      }
      case 'L': {
        if (roof) { // 屋上の外灯
          R(ctx, px + 4, py + 13, 8, 3, 'rgba(0,0,0,0.18)');
          R(ctx, px + 7, py + 3, 2, 12, '#5a5f66');
          R(ctx, px + 5, py, 6, 4, '#3f444a');
          R(ctx, px + 6, py + 3, 4, 2, '#fff1c0');
          R(ctx, px + 6, py + 13, 4, 2, '#4a4f55');
          break;
        }
        if (room === '食堂') { // 小さな手洗い
          R(ctx, px + 3, py + 1, 10, 9, P.white);
          R(ctx, px + 4, py + 3, 8, 5, '#cfe0e6');
          R(ctx, px + 7, py + 1, 2, 3, P.metalDk);
          R(ctx, px + 3, py + 10, 10, 2, P.whiteSh);
          R(ctx, px + 7, py + 12, 2, 4, P.metalDk);
          break;
        }
        // 洗面台
        R(ctx, px + 1, py + 1, 14, 15, '#c8c2b0');
        R(ctx, px + 2, py + 2, 12, 8, P.white);
        R(ctx, px + 4, py + 4, 8, 5, '#cfe0e6');
        R(ctx, px + 7, py + 1, 2, 3, P.metalDk);
        R(ctx, px + 1, py + 11, 14, 5, '#b2ab98');
        for (let i = 0; i < 3; i++) R(ctx, px + 3 + i * 2, py + 12, 1, 3, ['#e0604a', '#4a8ad0', '#5aa05a', '#f0d040'][(rnd(x, y, i) * 4) | 0]);
        break;
      }
      case 'C': { // トイレの個室
        R(ctx, px, py, 16, 16, '#cbd3cf');
        R(ctx, px + 4, py + 2, 8, 6, P.white);
        R(ctx, px + 6, py + 3, 4, 4, '#dfe8ec');
        R(ctx, px + 2, py + 9, 12, 7, '#9ab8c6');
        R(ctx, px + 2, py + 9, 12, 1, '#7a98a6');
        R(ctx, px + 11, py + 12, 2, 1, (x + y) % 3 ? '#5aa05a' : '#d8433a');
        if (nb(-1, 0) !== 'C') R(ctx, px, py, 2, 16, '#a9b3ae');
        R(ctx, px + 14, py, 2, 16, '#a9b3ae');
        break;
      }
      case 'u': {
        R(ctx, px + 4, py, 8, 9, P.white);
        R(ctx, px + 5, py + 2, 6, 6, '#dfe8ec');
        R(ctx, px + 4, py + 9, 8, 1, P.whiteSh);
        R(ctx, px + 7, py, 2, 1, P.metalDk);
        R(ctx, px + 14, py, 1, 10, '#a9b3ae');
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
      case 'h': { // シャワー（壁についている向きで描く）
        const wallUp = isWall(nb(0, -1)), wallR = isWall(nb(1, 0));
        if (wallUp && !(wallR && !isWall(nb(-1, 0)) && nb(-1, 0) !== 'h')) {
          R(ctx, px + 6, py, 4, 3, P.metalDk);
          R(ctx, px + 7, py + 3, 2, 1, P.metalXd);
          R(ctx, px + 3, py + 9, 5, 4, '#e8c22a');
          R(ctx, px + 4, py + 10, 3, 2, '#f6d85a');
          R(ctx, px + 10, py + 9, 4, 4, '#e88aa0');
        } else {
          R(ctx, px + 13, py + 6, 3, 4, P.metalDk);
          R(ctx, px + 12, py + 7, 1, 2, P.metalXd);
          R(ctx, px + 5, py + 4, 5, 4, '#e8c22a');
          R(ctx, px + 6, py + 5, 3, 2, '#f6d85a');
          R(ctx, px + 5, py + 10, 4, 4, '#e88aa0');
        }
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
      case 'g': { // 下駄箱（クリーム色の小さな扉がずらり）
        const s = stackPos(map, x, y, 'g');
        R(ctx, px + 2, py, 14, 16, '#e3dcc4');
        R(ctx, px + 2, py, 1, 16, '#b8b098');
        if (s.i === 0) R(ctx, px + 2, py, 14, 2, '#f2ecd8');
        for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) {
          const ox = px + 4 + i * 6, oy = py + (s.i === 0 ? 3 : 1) + j * 5;
          R(ctx, ox, oy, 5, 4, '#d4ccb2');
          R(ctx, ox + 1, oy + 1, 2, 1, P.white);
          R(ctx, ox + 4, oy + 2, 1, 1, P.metalXd);
        }
        if (s.i === s.n - 1) R(ctx, px + 2, py + 15, 14, 1, '#9a9278');
        break;
      }
      case 'm': { // 郵便受け（木の棚の上に灰色の小箱）
        const s = stackPos(map, x, y, 'm');
        if (s.i === 0) {
          R(ctx, px + 2, py, 14, 16, '#8a9297');
          R(ctx, px + 2, py, 14, 2, '#b0b8bd');
          for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
            R(ctx, px + 3 + i * 4, py + 3 + j * 4, 3, 3, '#a9b1b6');
            R(ctx, px + 3 + i * 4, py + 4 + j * 4, 3, 1, '#5f666b');
          }
        } else {
          R(ctx, px + 2, py, 14, 16, P.wood);
          R(ctx, px + 2, py, 1, 16, P.woodDk);
          R(ctx, px + 8, py, 1, 16, P.woodDk);
          R(ctx, px + 6, py + 6, 1, 2, P.woodXd);
          R(ctx, px + 10, py + 6, 1, 2, P.woodXd);
          if (s.i === s.n - 1) R(ctx, px + 2, py + 15, 14, 1, P.woodXd);
        }
        break;
      }
      case 'S': { // 布団
        const L = nb(-1, 0) === 'S';
        R(ctx, px + (L ? 0 : 1), py + 1, 15, 14, P.sheet);
        R(ctx, px + (L ? 0 : 2), py + 2, 14, 12, '#d0883a');
        R(ctx, px + (L ? 0 : 2), py + 2, 14, 1, '#e0a05a');
        for (let i = 0; i < 4; i++) R(ctx, px + 2 + i * 4, py + 5 + (i & 1) * 4, 2, 2, '#b86e2a');
        if (!L) { R(ctx, px + 2, py + 3, 4, 10, P.white); R(ctx, px + 2, py + 12, 4, 1, P.sheetSh); }
        R(ctx, px + (L ? 0 : 1), py + 15, 15, 1, P.sheetSh);
        break;
      }
      case 'a': { // 黒い革のソファ
        const L = nb(-1, 0) === 'a', Rr = nb(1, 0) === 'a';
        const x0 = L ? 0 : 1, x1 = Rr ? 16 : 15;
        R(ctx, px + x0, py + 2, x1 - x0, 6, '#2b2b30');
        R(ctx, px + x0, py + 2, x1 - x0, 1, '#4a4a52');
        R(ctx, px + x0, py + 8, x1 - x0, 6, '#3a3a42');
        R(ctx, px + x0, py + 8, x1 - x0, 1, '#5a5a64');
        if (!L) R(ctx, px + 1, py + 4, 3, 11, '#2b2b30');
        if (!Rr) R(ctx, px + 12, py + 4, 3, 11, '#2b2b30');
        if (L) R(ctx, px, py + 9, 1, 4, '#26262b');
        R(ctx, px + x0, py + 14, x1 - x0, 1, '#1c1c20');
        R(ctx, px + (L ? 4 : 6), py + 4, 2, 1, '#6a6a74');
        break;
      }
      case 'q': { // 白い丸テーブルとランプ
        disc(ctx, px + 8, py + 9, 6, '#d9d4c6');
        disc(ctx, px + 8, py + 8, 6, P.white);
        R(ctx, px + 7, py + 13, 2, 3, '#b8b2a2');
        R(ctx, px + 7, py + 4, 2, 4, '#c9a46a');
        R(ctx, px + 5, py, 6, 4, '#f6e3a8');
        R(ctx, px + 5, py, 6, 1, '#fff4d0');
        break;
      }
      case 'W': {
        R(ctx, px + 3, py + 2, 10, 6, P.white);
        R(ctx, px + 3, py + 2, 10, 1, '#ffffff');
        R(ctx, px + 4, py + 8, 8, 4, '#e8e4d8');
        R(ctx, px + 4, py + 12, 1, 3, '#b8b2a2');
        R(ctx, px + 11, py + 12, 1, 3, '#b8b2a2');
        break;
      }
      case 'P': {
        if (roof) {
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
      case 'Z': { // 灯油のポリタンク・ドラム缶
        const k = rnd(x, y, 1);
        if (k < 0.35) {
          R(ctx, px + 3, py + 2, 10, 13, '#5f6a70');
          R(ctx, px + 3, py + 2, 10, 2, '#8a969c');
          R(ctx, px + 3, py + 7, 10, 1, '#4a545a');
          R(ctx, px + 3, py + 11, 10, 1, '#4a545a');
          R(ctx, px + 9, py + 2, 2, 1, '#3a3a40');
        } else {
          for (let i = 0; i < 2; i++) {
            const c = rnd(x, y, i + 3) < 0.6 ? '#c8332e' : '#2f5fb0';
            R(ctx, px + 1 + i * 7, py + 5, 6, 10, c);
            R(ctx, px + 1 + i * 7, py + 5, 6, 1, mix(c, '#ffffff', 0.3));
            R(ctx, px + 2 + i * 7, py + 3, 2, 2, c);
            R(ctx, px + 2 + i * 7, py + 2, 2, 1, '#f0d040');
            R(ctx, px + 1 + i * 7, py + 14, 6, 1, mix(c, '#000000', 0.3));
          }
        }
        break;
      }
      // 屋上
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
      case '^': { // バーベキューのコンロ
        R(ctx, px + 2, py + 13, 12, 3, 'rgba(0,0,0,0.18)');
        R(ctx, px + 3, py + 9, 1, 6, P.metalXd);
        R(ctx, px + 12, py + 9, 1, 6, P.metalXd);
        R(ctx, px + 1, py + 4, 14, 6, '#3a3a40');
        R(ctx, px + 1, py + 4, 14, 1, '#5a5f66');
        for (let i = 0; i < 6; i++) R(ctx, px + 2 + i * 2, py + 5, 1, 4, '#8a8f96');
        R(ctx, px + 3, py + 6, 3, 2, '#c8603a');
        R(ctx, px + 8, py + 5, 4, 2, '#e8a050');
        R(ctx, px + 9, py + 7, 3, 1, '#f0d040');
        break;
      }
    }
  }

  // 屋外の小物
  function drawExt(ctx, map, x, y, px, py, ch) {
    switch (ch) {
      case 'R': { // トタン屋根の小屋（上から見た屋根）
        const U = at(map, x, y - 1) === 'R', Dn = at(map, x, y + 1) === 'R';
        const L = at(map, x - 1, y) === 'R', Rr = at(map, x + 1, y) === 'R';
        R(ctx, px, py, 16, 16, '#c3c6c2');
        for (let i = 1; i < 16; i += 3) R(ctx, px + i, py, 1, 16, '#a6aaa6');
        if (rnd(x, y, 3) < 0.35) R(ctx, px + ((rnd(x, y, 4) * 12) | 0), py + ((rnd(x, y, 5) * 12) | 0), 3, 2, '#a8775a');
        if (!U) R(ctx, px, py, 16, 2, '#dadcd8');
        if (!Dn) { R(ctx, px, py + 11, 16, 5, '#5f625e'); R(ctx, px, py + 11, 16, 1, '#8f928e'); }
        if (!L) R(ctx, px, py, 1, 16, '#8f928e');
        if (!Rr) R(ctx, px + 15, py, 1, 16, '#7f827e');
        break;
      }
      case 'f': { // 歩道との境の金網フェンス
        R(ctx, px, py + 14, 16, 2, 'rgba(0,0,0,0.12)');
        for (let j = 0; j < 8; j++)
          for (let i = 0; i < 16; i += 4) R(ctx, px + i + (j & 1) * 2, py + 5 + j, 1, 1, 'rgba(70,78,84,0.75)');
        R(ctx, px, py + 4, 16, 1, '#5b6066');
        R(ctx, px, py + 13, 16, 1, '#5b6066');
        if (x % 2 === 0) R(ctx, px, py + 3, 2, 12, '#4b5056');
        break;
      }
      case '{': { // 玄関前の階段
        R(ctx, px, py, 16, 16, P.concHi);
        for (let j = 0; j < 3; j++) {
          R(ctx, px, py + 2 + j * 5, 16, 1, P.concSh);
          R(ctx, px, py + 3 + j * 5, 16, 1, P.conc);
        }
        break;
      }
      case '}': { // 玄関前の茶色い手すり（低いブロック塀の上）
        const L = at(map, x - 1, y) === '}', Rr = at(map, x + 1, y) === '}';
        R(ctx, px, py + 6, 16, 9, P.conc);
        R(ctx, px, py + 6, 16, 2, P.concHi);
        R(ctx, px, py + 14, 16, 2, 'rgba(0,0,0,0.15)');
        R(ctx, px, py + 1, 16, 2, '#8a4b3a');
        R(ctx, px, py + 1, 16, 1, '#a8644e');
        if (!L) R(ctx, px + 1, py + 1, 2, 6, '#6e3a2c');
        if (!Rr) R(ctx, px + 13, py + 1, 2, 6, '#6e3a2c');
        if (L && Rr) R(ctx, px + 7, py + 1, 2, 6, '#6e3a2c');
        break;
      }
      case 'o': {
        const fc = ['#c84a3a', '#3a6ab8', '#e0c040', '#5a8a4a', '#d8d4cc', '#2a2a2a'][(rnd(x, y, 3) * 6) | 0];
        R(ctx, px + 1, py + 13, 14, 2, 'rgba(0,0,0,0.18)');
        R(ctx, px + 1, py + 7, 6, 6, P.ink);
        R(ctx, px + 2, py + 8, 4, 4, '#b3aea3');
        R(ctx, px + 9, py + 7, 6, 6, P.ink);
        R(ctx, px + 10, py + 8, 4, 4, '#b3aea3');
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

  // 停まっている車（横向き 3x2 マス／後ろ向き 2x2 マス）
  function drawCarSide(ctx, px, py, body, wagon) {
    const dk = mix(body, '#000000', 0.35), hi = mix(body, '#ffffff', 0.22);
    R(ctx, px + 3, py + 27, 42, 4, 'rgba(0,0,0,0.22)');
    R(ctx, px + 2, py + 15, 44, 11, body);
    R(ctx, px + 2, py + 15, 44, 1, hi);
    R(ctx, px + 2, py + 24, 44, 2, dk);
    const c0 = px + (wagon ? 7 : 11), c1 = px + (wagon ? 44 : 37);
    R(ctx, c0, py + 5, c1 - c0, 10, body);
    R(ctx, c0 + 1, py + 4, c1 - c0 - 2, 2, hi);
    R(ctx, c0 + 2, py + 7, c1 - c0 - 4, 7, '#6f8498');
    R(ctx, c0 + 2, py + 7, c1 - c0 - 4, 2, '#e9ae80');
    const mid = Math.round((c0 + c1) / 2);
    R(ctx, mid, py + 7, 2, 7, body);
    if (wagon) R(ctx, c1 - 11, py + 7, 2, 7, body);
    R(ctx, mid, py + 15, 1, 9, dk);
    R(ctx, mid - 6, py + 18, 3, 1, hi);
    R(ctx, mid + 4, py + 18, 3, 1, hi);
    R(ctx, px + 2, py + 17, 2, 3, '#f3e9c0');
    R(ctx, px + 44, py + 17, 2, 3, '#d8433a');
    for (const wx of [px + 7, px + 32]) {
      R(ctx, wx, py + 22, 9, 8, '#1c1a1e');
      R(ctx, wx + 1, py + 21, 7, 1, '#1c1a1e');
      R(ctx, wx + 3, py + 24, 3, 3, '#8d9196');
    }
  }
  function drawCarRear(ctx, px, py, body, kei) {
    const dk = mix(body, '#000000', 0.3), hi = mix(body, '#ffffff', 0.3);
    R(ctx, px + 3, py + 28, 26, 4, 'rgba(0,0,0,0.22)');
    R(ctx, px + 7, py + 3, 18, 3, hi);
    R(ctx, px + 6, py + 5, 20, 2, body);
    R(ctx, px + 7, py + 7, 18, 8, '#6f8498');
    R(ctx, px + 7, py + 7, 18, 2, '#e9ae80');
    R(ctx, px + 4, py + 15, 24, 11, body);
    R(ctx, px + 4, py + 15, 24, 1, hi);
    R(ctx, px + 4, py + 24, 24, 2, dk);
    R(ctx, px + 5, py + 17, 4, 3, '#d8433a');
    R(ctx, px + 23, py + 17, 4, 3, '#d8433a');
    R(ctx, px + 12, py + 19, 8, 4, kei ? '#f0d040' : '#f3f0e6');
    R(ctx, px + 13, py + 21, 6, 1, kei ? P.ink : '#3f7a52');
    R(ctx, px + 5, py + 26, 5, 4, '#1c1a1e');
    R(ctx, px + 22, py + 26, 5, 4, '#1c1a1e');
  }

  // ── 屋外の背の高いもの（人物と前後関係を判定して描く） ──────────
  function drawTallExt(ctx, ch, x, y, px, py, t) {
    if (ch === '1') return drawCarSide(ctx, px, py, '#2a3550', false);
    if (ch === '2') return drawCarSide(ctx, px, py, '#25252b', true);
    if (ch === '3') return drawCarRear(ctx, px, py, '#c4352d', false);
    if (ch === '4') return drawCarRear(ctx, px, py, '#e6e3dc', true);
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
          const fl = EXT_FLOOR[ch];
          if (fl) {
            drawFloor(ctx, fl, x, y, px, py);
            if (ch === '~') anim.push({ ch, x, y });
            continue;
          }
          drawFloor(ctx, 'Tth'.includes(ch) ? '"' : 'pave', x, y, px, py);
          if ('TLGg'.includes(ch)) { tall.push({ ch, x, y, h: 1 }); continue; }
          if ('1234'.includes(ch)) {
            if (at(map, x - 1, y) !== ch && at(map, x, y - 1) !== ch) tall.push({ ch, x, y, h: 2 });
            continue;
          }
          if (ch === 'v') drawFurniture(ctx, map, x, y, px, py, ch);
          else if (ch !== 't') drawExt(ctx, map, x, y, px, py, ch);
          continue;
        }
        if (ch === ' ') continue; // 建物の外
        if (isWall(ch)) {
          const below = at(map, x, y + 1);
          if (isOpen(below) && !((ch === 'H' || ch === '0') && y > 0) && !(DOORISH.has(below) && doorVertical(map, x, y + 1))) wallFace(ctx, map, x, y, px, py, ch);
          else wallTop(ctx, map, x, y, px, py, ch);
          continue;
        }
        if (FLOOR.has(ch)) { drawFloor(ctx, ch, x, y, px, py); continue; }
        if (DOORISH.has(ch)) { drawDoor(ctx, map, x, y, px, py, ch, false); continue; }
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
    const n = cols[0].length; // 2・3階の幅（56 列）
    const extra = cols[2].length - n; // 1階だけ東に張り出した灯油庫
    const W = n * u, H = rh + fh * 3;
    const big = u >= 8;
    const lit = o.lit || 0;
    const t1 = Math.max(1, Math.round(u / 8));
    // 屋根
    R(ctx, ox, oy, W, rh, '#8d8e86');
    R(ctx, ox, oy, W, t1, P.concHi);
    R(ctx, ox, oy, t1, rh, P.concHi);
    R(ctx, ox + W - t1, oy, t1, rh, P.concSh);
    if (big) for (let i = 3; i < n; i += 3) R(ctx, ox + i * u, oy + 3, 1, rh - 8, '#7f8078');
    // 塔屋（階段室）：屋上マップの x25〜30
    const ph = Math.round(rh * 0.55);
    const hx = ox + u * 25, hw = u * 6;
    R(ctx, hx, oy + 1, hw, ph, FACADE.hi);
    R(ctx, hx, oy + 1 + ph, hw, rh - ph - Math.max(2, u / 4), FACADE.wall);
    if (big) {
      R(ctx, hx + u * 3, oy + 1 + ph + 2, u * 0.9, rh - ph - 7, P.door);
      R(ctx, hx, oy + 1 + ph, hw, 1, FACADE.sh);
    }
    // 高架水槽（塔屋の上）
    const tw = u * 3, th = Math.max(3, Math.round(rh * 0.42));
    const tx = hx + u * 1.5, ty = oy + 1 - Math.round(th * 0.6);
    R(ctx, tx, ty, tw, th, '#b9c5ca');
    R(ctx, tx, ty, tw, t1, '#d6e0e3');
    if (big) for (let i = 1; i < 3; i++) R(ctx, tx + i * u, ty + 3, 1, th - 4, '#9eacb2');
    // アンテナ
    if (big) {
      R(ctx, ox + u * 12.5, oy - 6, 1, rh * 0.6 + 6, P.metalXd);
      for (let i = 0; i < 3; i++) R(ctx, ox + u * 12, oy - 5 + i * 3, u, 1, P.metalXd);
    } else {
      R(ctx, ox + u * 12.5, oy - 4, 1, 5, P.ink);
      R(ctx, ox + u * 12, oy - 3, u, 1, P.ink);
    }
    // 手すり壁の正面と、その上の茶色い手すり
    const pr = Math.max(2, Math.round(u / 4));
    R(ctx, ox, oy + rh - pr, W, pr, FACADE.hi);
    if (big) {
      R(ctx, ox, oy + rh - pr - 7, W, 1, '#8a4b3a');
      R(ctx, ox, oy + rh - pr - 3, W, 1, '#8a4b3a');
      for (let i = 0; i < W; i += 8) R(ctx, ox + i, oy + rh - pr - 7, 1, 7, '#6e3a2c');
    }
    // 各階
    for (let f = 0; f < 3; f++) {
      const fy = oy + rh + f * fh;
      R(ctx, ox, fy, W, fh, FACADE.wall);
      // 床スラブの線
      const sl = Math.max(1, Math.round(fh / 12));
      R(ctx, ox, fy, W, sl, FACADE.hi);
      R(ctx, ox, fy + sl, W, 1, FACADE.sh);
      const row = cols[f];
      if (f === 2) drawFacadeTiles(ctx, ox, fy, row, u, fh, big);
      let x = 0;
      while (x < n) {
        const ch = row[x];
        if (ch !== 'w' && ch !== 'E') { x++; continue; }
        let x2 = x;
        while (x2 + 1 < n && row[x2 + 1] === ch) x2++;
        const wx = ox + x * u, ww = (x2 - x + 1) * u;
        if (ch === 'E') drawFacadeEntrance(ctx, wx, fy, ww, fh, u, big);
        else if (row[x - 1] === 'E' || row[x2 + 1] === 'E') drawFacadeSidelight(ctx, wx, fy, ww, fh, u, big);
        else if (f === 2 && x2 - x >= 4) drawFacadeBay(ctx, wx, fy, ww, fh, u, big, lit);
        else drawFacadeWindow(ctx, wx, fy, ww, fh, u, big, f, x, lit);
        x = x2 + 1;
      }
    }
    // 1階の東の平屋（灯油庫）
    if (extra > 0) {
      const ax = ox + W, aw = extra * u, ay = oy + rh + fh * 2;
      const ar = Math.max(2, Math.round(fh / 2));
      R(ctx, ax, ay - ar, aw, ar, '#8d8e86');
      R(ctx, ax, ay - ar, aw, t1, P.concHi);
      R(ctx, ax, ay, aw, fh, FACADE.wall);
      R(ctx, ax, ay, aw, Math.max(1, Math.round(fh / 12)), FACADE.hi);
      R(ctx, ax, ay - ar, t1, ar + fh, FACADE.sh);
      if (big) { // 鉄の扉
        R(ctx, ax + aw - u * 2, ay + Math.round(fh * 0.3), u, fh - Math.round(fh * 0.3), '#8a9297');
        R(ctx, ax + aw - u * 2 + 2, ay + Math.round(fh * 0.3) + 2, u - 4, 1, '#b0b8bd');
      }
    }
    const WA = W + Math.max(0, extra) * u;
    // 雨だれのしみ
    if (big) {
      ctx.fillStyle = 'rgba(70,60,52,0.08)';
      for (let i = 0; i < 40; i++) {
        const sx = ox + ((rnd(i, 3, 9) * W) | 0);
        const sy = oy + rh + ((rnd(i, 4, 9) * fh * 2.5) | 0);
        ctx.fillRect(sx, sy, 1 + ((rnd(i, 5, 9) * 2) | 0), 6 + ((rnd(i, 6, 9) * 18) | 0));
      }
    }
    // 雨どい
    for (const c of [5.5, 20.5, 35.5, 50.5]) {
      R(ctx, ox + c * u, oy + rh - pr, t1, fh * 3 + pr, P.concDk);
      if (big) R(ctx, ox + c * u + 1, oy + rh - pr, 1, fh * 3 + pr, '#a8a091');
    }
    // 基礎
    const bs = Math.max(1, Math.round(fh / 10));
    R(ctx, ox, oy + H - bs, WA, bs, P.concDk);
    // 夕日（西＝左）からの光
    const g = ctx.createLinearGradient(ox, 0, ox + WA, 0);
    g.addColorStop(0, 'rgba(255,170,90,0.20)');
    g.addColorStop(0.6, 'rgba(255,170,90,0.05)');
    g.addColorStop(1, 'rgba(60,40,90,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(ox, oy, W, H);
    if (extra > 0) ctx.fillRect(ox + W, oy + rh + fh * 2 - Math.max(2, Math.round(fh / 2)), WA - W, fh + Math.max(2, Math.round(fh / 2)));
    // 玄関の左の壁の看板（位置は仮）
    const ent = cols[2].indexOf('E');
    if (ent >= 0 && big) {
      const sign = signBitmap();
      const sw = 3 * u, sh = 18;
      const sx = Math.round(ox + (ent - 4) * u), sy = Math.round(oy + rh + fh * 2 + (fh - sh) / 2 + 1);
      R(ctx, sx, sy - 1, sw, sh + 2, '#4f3420');
      R(ctx, sx + 1, sy, sw - 2, sh, '#efe6cf');
      ctx.drawImage(sign, sx + Math.round((sw - sign.width) / 2), sy - 1);
    }
  }
  const FACADE = { wall: '#e6dfcc', hi: '#f0ebdd', sh: '#cbc2ab' };

  // 玄関まわりの壁のタイル（1階の x21〜29）
  function drawFacadeTiles(ctx, ox, fy, row, u, fh, big) {
    const ent = row.indexOf('E');
    if (ent < 0) return;
    const x0 = ox + (ent - 6) * u, x1 = ox + (ent + 3) * u;
    const top = fy + Math.round(fh * 0.16);
    R(ctx, x0, top, x1 - x0, fy + fh - top, '#b9a58a');
    if (!big) return;
    for (let y = top; y < fy + fh; y += 3)
      for (let x = x0 + ((y / 3) & 1); x < x1; x += 3) R(ctx, x, y, 2, 2, rnd(x, y, 5) < 0.3 ? '#a8937a' : rnd(x, y, 6) < 0.2 ? '#cbb89c' : '#bca98d');
    R(ctx, x0, top, x1 - x0, 1, '#8f7c63');
  }
  // 玄関の両わきのガラス
  function drawFacadeSidelight(ctx, x, y, w, fh, u, big) {
    const dt = y + Math.round(fh * 0.3);
    const dh = y + fh - dt;
    R(ctx, x, dt, w, dh, P.alu);
    for (let j = 0; j < dh - 2; j++) R(ctx, x + 1, dt + 1 + j, w - 2, 1, mix('#4a5868', '#7a8a9a', j / dh));
    if (big) {
      R(ctx, x + 3, dt + 3, 1, 4, '#9fb2c4');
      R(ctx, x + 1, dt + Math.round(dh * 0.55), w - 2, 1, P.alu);
    }
  }
  // 食堂の道路側：窓が少し張り出して、バルコニーのように見える
  function drawFacadeBay(ctx, x, y, w, fh, u, big, lit) {
    const bx = x - u, bw = w + u * 2;
    const top = y + Math.round(fh * 0.14);
    const sill = y + Math.round(fh * 0.62);
    // 張り出しの屋根（ひさし）と影
    R(ctx, bx - 1, top - Math.max(2, Math.round(fh / 10)), bw + 2, Math.max(2, Math.round(fh / 10)), FACADE.hi);
    R(ctx, bx - 1, top, bw + 2, 1, P.concDk);
    // 大きな窓
    R(ctx, x, top + 1, w, sill - top - 1, P.alu);
    const gh = sill - top - 3;
    for (let j = 0; j < gh; j++) R(ctx, x + 1, top + 2 + j, w - 2, 1, lit ? mix('#ffd68a', '#ffb860', j / gh) : mix(P.glassA, P.glassB, j / Math.max(1, gh - 1)));
    const panes = Math.max(2, Math.round(w / (u * 2)));
    for (let i = 1; i < panes; i++) R(ctx, Math.round(x + (w * i) / panes), top + 1, 1, sill - top - 1, P.aluDk);
    if (big) { R(ctx, x + 4, top + 3, 1, 1, P.glassHi); R(ctx, x + 3, top + 4, 1, 1, P.glassHi); }
    // バルコニーのような腰壁と手すり
    R(ctx, bx, sill, bw, y + fh - sill, FACADE.hi);
    R(ctx, bx, sill, bw, Math.max(1, Math.round(fh / 16)), '#8a4b3a');
    R(ctx, bx + bw - Math.max(1, Math.round(u / 4)), top, Math.max(1, Math.round(u / 4)), y + fh - top, FACADE.sh);
    R(ctx, bx, y + fh - Math.max(1, Math.round(fh / 10)), bw, Math.max(1, Math.round(fh / 10)), P.concDk);
    if (big) for (let i = bx + 4; i < bx + bw - 4; i += 6) R(ctx, i, sill + 3, 1, y + fh - sill - 6, FACADE.sh);
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
    const oh = Math.max(1, Math.round(u * 0.2));
    R(ctx, x - oh, dt - ch - 1, w + oh * 2, ch, P.concHi);
    R(ctx, x - oh, dt - 1, w + oh * 2, 1, P.concDk);
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
      R(ctx, x - Math.round(u * 0.4), dt + 2, 3, 3, '#fff1c0');
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
      } else if (a.ch === '~') {
        const k = Math.floor(t / 600 + a.x * 1.7 + a.y * 3) % 6;
        if (k < 2) R(ctx, px + 2 + ((a.x * 5) % 9), py + 4 + k * 6, 4, 1, '#3f6f84');
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
    const u = Math.max(2, Math.min(4, Math.floor((w - 16) / 61)));
    const fh = 5 + u * 2, rh = 3 + u;
    const bw = 61 * u;
    const bx = Math.round((w - bw) / 2), by = h - 12 - (rh + fh * 3);
    drawFacade(ctx, bx, by, { u, roofH: rh, floorH: fh, lit: 0.35 });
    // 前の駐車スペース・フェンス・歩道・道路（航空写真より）
    const gy = h - 12;
    R(ctx, 0, gy, w, 5, '#6d6268');
    R(ctx, 0, gy + 5, w, 1, '#3a3038');
    R(ctx, 0, gy + 6, w, 2, '#7d7275');
    R(ctx, 0, gy + 8, w, h - gy - 8, '#3b3440');
    for (let x = 3; x < w; x += 11) R(ctx, x, gy + 10, 5, 1, '#d8cfc0');
    R(ctx, bx + 27 * u, gy, 2 * u, 6, '#8d817b');
    const side = (x, col) => {
      R(ctx, x, gy - 3, 15, 4, col);
      R(ctx, x + 3, gy - 6, 9, 3, col);
      R(ctx, x + 4, gy - 5, 7, 2, '#e9ae80');
      R(ctx, x + 2, gy + 1, 3, 2, '#1c1a1e');
      R(ctx, x + 10, gy + 1, 3, 2, '#1c1a1e');
    };
    const rear = (x, col) => {
      R(ctx, x, gy - 5, 7, 6, col);
      R(ctx, x + 1, gy - 4, 5, 2, '#6f8498');
      R(ctx, x, gy - 2, 1, 1, '#d8433a');
      R(ctx, x + 6, gy - 2, 1, 1, '#d8433a');
    };
    side(bx + 36 * u, '#2a3550');
    side(bx + 43 * u, '#25252b');
    rear(bx + 51 * u, '#c4352d');
    rear(bx - 3 * u - 2, '#e6e3dc');
    // 西のはしの桜
    {
      const x = Math.round(bx - 22), yb = gy + 2, s2 = 1;
      R(ctx, x - 1, yb - 12, 3, 12, P.trunkDk);
      disc(ctx, x, yb - 19, 10, P.sakD);
      disc(ctx, x - 6, yb - 16, 5, P.sakD);
      disc(ctx, x + 6, yb - 16, 5, P.sakD);
      disc(ctx, x - 1, yb - 21, 8, P.sakB);
      disc(ctx, x - 3, yb - 24, 4, P.sakA);
      for (let i = 0; i < 7; i++) R(ctx, x - 8 + ((rnd(i, s2, 2) * 16) | 0), yb - 27 + ((rnd(i, s2, 3) * 14) | 0), 1, 1, P.sakC);
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
