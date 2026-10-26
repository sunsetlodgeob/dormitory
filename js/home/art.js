/*
 * 夕照寮OB会 ― ホームのドット絵
 * 画像ファイルは使わず、すべてコードで 1 ドットずつ描いている。
 * 色はファミコンに近い色だけを使う（雰囲気だけ似せた、オリジナルの絵）。
 * 画面は 256×224 ドット。ここでは絵だけを描き、文字は main.js が上から重ねる。
 */
(function () {
  'use strict';
  const H = (window.HOME = window.HOME || {});
  const TS = 16;
  const SW = 256, SH = 224;

  // ── 色（1 文字 = 1 色。スプライトの文字の絵で使う） ──────────────
  const C = {
    K: '#000000', W: '#fcfcfc', w: '#bcbcbc', g: '#7c7c7c',
    B: '#0000bc', b: '#0058f8', u: '#0078f8', s: '#3cbcfc', S: '#a4e4fc', i: '#6888fc',
    V: '#4428bc', v: '#940084', p: '#d800cc', P: '#f878f8', e: '#e40058',
    R: '#f83800', r: '#a81000', q: '#881400', O: '#e45c10', o: '#fca044',
    Y: '#f8b800', y: '#f8d878', c: '#fce0a8', k: '#f0d0b0', n: '#ac7c00', N: '#503000',
    G: '#00a800', d: '#005800', D: '#006800', l: '#58d854', L: '#b8f818', m: '#b8f8b8',
    t: '#008888', T: '#00e8d8',
  };

  // ── 小道具 ──────────────────────────────────────
  function cv(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function R(g, x, y, w, h, col) {
    if (w <= 0 || h <= 0) return;
    g.fillStyle = C[col] || col;
    g.fillRect(x, y, w, h);
  }
  // 文字の絵からキャンバスを作る。'.' は透明。swap で色の差しかえ（例：{ X: 'R' }）
  function spr(rows, swap) {
    const h = rows.length;
    const w = Math.max.apply(null, rows.map((r) => r.length));
    const c = cv(w, h);
    const g = c.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        let ch = row[x];
        if (swap && swap[ch]) ch = swap[ch];
        if (C[ch]) R(g, x, y, 1, 1, ch);
      }
    });
    return c;
  }
  // 場所ごとに決まった乱数（0〜1）。草のもようなどを毎回同じにする
  function hash(x, y) {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  // ── タイトルの文字（16×16 ドットの手描き） ─────────────────
  const GLYPH = {
    '夕': [
      '................', '......##........', '.....##.........', '.....##########.',
      '....##.......##.', '...##........##.', '..##.##.....##..', '.#....##...##...',
      '.......##.##....', '........###.....', '........##......', '.......##.......',
      '.....###........', '...###..........', '.##.............', '................',
    ],
    '照': [
      '................', '.####..########.', '.#..#.....#...#.', '.#..#....##...#.',
      '.#..#...##....#.', '.####..##...##..', '.#..#..########.', '.#..#..#......#.',
      '.#..#..#......#.', '.####..#......#.', '.......########.', '................',
      '.##..#....#...#.', '##....#....#...#', '#.....##....#..#', '................',
    ],
    '寮': [
      '.......##.......', '.##############.', '.#.....##.....#.', '.#.....##.....#.',
      '..############..', '..#...#..#...#..', '.#...#....#...#.', '....##.....##...',
      '.....######.....', '.....#....#.....', '.....######.....', '.....#....#.....',
      '.....######.....', '...#...##...#...', '..#....##....#..', '......###.......',
    ],
    'O': [
      '................', '....########....', '...##########...', '..###......###..',
      '..##........##..', '..##........##..', '..##........##..', '..##........##..',
      '..##........##..', '..##........##..', '..##........##..', '..###......###..',
      '...##########...', '....########....', '................', '................',
    ],
    'B': [
      '................', '..#########.....', '..##########....', '..##......###...',
      '..##.......##...', '..##......###...', '..##########....', '..###########...',
      '..##.......###..', '..##........##..', '..##........##..', '..##.......###..',
      '..###########...', '..##########....', '................', '................',
    ],
    '会': [
      '.......##.......', '......####......', '.....##..##.....', '....##....##....',
      '..###......###..', '###..######..###', '................', '.##############.',
      '......##........', '.....##.........', '....##...##.....', '...##.....##....',
      '..###########...', '............##..', '................', '................',
    ],
  };

  // 文字を大きくして、ふちどりと影をつける
  // fill: 上から下への色の帯 [[行, 色], ...]（行は拡大後の 0〜高さ）
  // o.depth：右下へずらす影の厚み、o.edge：ふちの色（上下左右 1 ドット）、o.side：影の色
  function bigText(str, scale, gap, fill, o) {
    const chars = str.split('');
    const cw = 16 * scale;
    const w0 = chars.length * cw + (chars.length - 1) * gap;
    const depth = o.depth || 0;
    const pad = o.edge ? 1 : 0;
    const W = w0 + depth + pad * 2, Hh = cw + depth + pad * 2;
    const mask = new Uint8Array(W * Hh); // 1: 文字、2: 影、3: ふち
    chars.forEach((ch, i) => {
      const rows = GLYPH[ch];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        if (rows[y][x] !== '#') continue;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          mask[(pad + y * scale + dy) * W + (pad + i * (cw + gap) + x * scale + dx)] = 1;
        }
      }
    });
    const body = mask.slice();
    for (let d = 1; d <= depth; d++) {
      for (let y = 0; y < Hh - d; y++) for (let x = 0; x < W - d; x++) {
        if (body[y * W + x] === 1 && !mask[(y + d) * W + x + d]) mask[(y + d) * W + x + d] = 2;
      }
    }
    if (o.edge) {
      const solid = mask.slice();
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
        if (solid[y * W + x]) continue;
        const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < Hh && solid[yy * W + xx];
        if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) mask[y * W + x] = 3;
      }
    }
    const c = cv(W, Hh);
    const g = c.getContext('2d');
    for (let y = 0; y < Hh; y++) {
      let col = fill[0][1];
      for (const [row, cc] of fill) if (y - pad >= row) col = cc;
      for (let x = 0; x < W; x++) {
        const m = mask[y * W + x];
        if (m === 1) R(g, x, y, 1, 1, col);
        else if (m === 2) R(g, x, y, 1, 1, o.side);
        else if (m === 3) R(g, x, y, 1, 1, o.edge);
      }
    }
    return c;
  }

  // ── 行進する寮生（16×16、横向き。X はシャツの色） ───────────────
  const TROOP = [
    [
      '................', '................', '......KKKKK.....', '.....KKKKKKK....',
      '...WWWWWWWWW....', '..WW.KKkkkKk....', '.....KKkkkkkk...', '......kkkkkk....',
      '.......XXXX.k...', '......XXXXXXk...', '.....kXXXXX.....', '.......XXXX.....',
      '.......BBBBBB...', '.......BB..BB...', '.......BB..KK...', '.......KK.......',
    ],
    [
      '................', '................', '......KKKKK.....', '.....KKKKKKK....',
      '...WWWWWWWWW....', '..WW.KKkkkKk....', '.....KKkkkkkk...', '......kkkkkk....',
      '.......XXXX.....', '......XXXXXX....', '......kXXXXk....', '.......XXXX.....',
      '.......BBBB.....', '.......BBBB.....', '.......B..B.....', '......KK..KK....',
    ],
  ];
  // 旗手（寮の旗。夕日のしるし）
  const BEARER = [
    [
      '.....RRRRRRRw...', '...RRRRRRRRRw...', '....RRRYYRRRw...', '...RRRYYYYRRw...',
      '.....RRRRRRRw...', '............w...', '......KKKKK.w...', '.....KKKKKKKw...',
      '...WWWWWWWWWw...', '..WW.KKkkkKkw...', '.....KKkkkkkw...', '......kkkkkkw...',
      '.......XXXXkk...', '......XXXXXXw...', '.....kXXXXX.w...', '.......XXXX.w...',
      '.......BBBBBB...', '.......BB..BB...', '.......BB..KK...', '.......KK.......',
    ],
    [
      '......RRRRRRw...', '....RRRRRRRRw...', '...RRRRYYRRRw...', '....RRYYYYRRw...',
      '......RRRRRRw...', '............w...', '......KKKKK.w...', '.....KKKKKKKw...',
      '...WWWWWWWWWw...', '..WW.KKkkkKkw...', '.....KKkkkkkw...', '......kkkkkkw...',
      '.......XXXXkk...', '......XXXXXXw...', '......kXXXXkw...', '.......XXXX.w...',
      '.......BBBB.....', '.......BBBB.....', '.......B..B.....', '......KK..KK....',
    ],
  ];
  // 太鼓をたたく寮生
  const DRUMMER = [
    [
      '................', '................', '......KKKKK.....', '.....KKKKKKK....',
      '...WWWWWWWWW....', '..WW.KKkkkKk....', '.....KKkkkkkk...', '......kkkkkk...w',
      '.......XXXX...w.', '......XXXXXXkw..', '......XXXwwwwww.', '......XXwRRRRRw.',
      '.......wwwwwwww.', '.......BBBBBB...', '.......BB..BB...', '.......KK..KK...',
    ],
    [
      '................', '................', '......KKKKK.....', '.....KKKKKKK....',
      '...WWWWWWWWW....', '..WW.KKkkkKk..w.', '.....KKkkkkkk.w.', '......kkkkkk..w.',
      '.......XXXX...k.', '......XXXXXX.k..', '......XXXwwwwww.', '......XXwRRRRRw.',
      '.......wwwwwwww.', '.......BBBB.....', '.......BBBB.....', '......KK..KK....',
    ],
  ];

  // ── 地図の小物 ───────────────────────────────────
  const TREE = [
    '................', '.....dddddd.....', '...ddGGGGGGdd...', '..dGGlLGGGGGGd..',
    '.dGGlLlGGGGGGGd.', '.dGlLGGGGGGGGGd.', 'dGGlGGGGGGGGGGdd', 'dGGGGGGGGGGGGGdd',
    'dGGGGGGGGGGGGddd', '.dGGGGGGGGGGddd.', '.ddGGGGGGGGddd..', '...dddddddddd...',
    '......NnNN......', '......NnNN......', '....ddNNNNdd....', '................',
  ];
  const HOUSE = [
    '................', '................', '....rrrrrrrr....', '...rXXXXXXXXr...',
    '..rXXXXXXXXXXr..', '.rXXXXXXXXXXXXr.', '.qqqqqqqqqqqqqq.', '..ccccccccccccg.',
    '..cSScccNNccSSg.', '..cbbcccNNccbbg.', '..cccccccNccccg.', '..gggggggggggggg',
    '................', '................', '................', '................',
  ];
  // 蔵（年表＝古い事件簿のしまい場所）
  const KURA = [
    '................', '................', '................', '................',
    '......KKKKK.....', '...KKKKKKKKKK...', '.KKgKKKKKKKKgKK.', 'KKKKKKKKKKKKKKKK',
    '.WWWWWWWWWWWWWw.', '.WWWWWKKKWWWWWw.', '.WWWWWKNKWWWWWw.', '.WWWWWKKKWWWWWw.',
    '.WWWWWWWWWWWWWw.', '.WWWWWWWWWWWWWw.', '.KWKWKWKWKWKWKw.', '.WKWKWKWKWKWKWw.',
    '.KWKWKWKWKWKWKw.', '.wwwwwwNNwwwwww.', '.gggggggggggggg.', '................',
  ];
  // 寮の門（寮さんぽ）
  const GATE = [
    '................', '................', '................', '.KK..........KK.',
    'KyyK........KyyK', 'KKKK........KKKK', 'wWWw........wWWw', 'wccw........wWWw',
    'wcNw........wWWw', 'wNcw........wWWw', 'wccw........wWWw', 'wWWw........wWWw',
    'wWWw........wWWw', 'wWWw........wWWw', 'gggg........gggg', '................',
  ];
  // コンビニ（駅前のかざり）
  const KONBINI = [
    '................', '................', '................', '................',
    '.wwwwwwwwwwwwww.', '.WWWWWWWWWWWWWw.', '.ooooooooooooow.', '.nnnnnnnnnnnnnw.',
    '.WSSSSSWSSSSSSw.', '.WSsSSSWSSsSSSw.', '.WSSSSSWSSSSSSw.', '.WSSsSSWSSSsSSw.',
    '.WSSSSSWSSSSSSw.', '.WgggggWggggggw.', '.gggggggggggggg.', '................',
  ];
  // 掲示板（名簿）
  const BOARD = [
    '................', '................', '................', '...rrrrrrrrr....',
    '..rrrrrrrrrrr...', '..NNNNNNNNNNN...', '..NWWWWNWWWWN...', '..NWggWNWggWN...',
    '..NWWWWNWggWN...', '..NWggWNWWWWN...', '..NWggWNWggWN...', '..NNNNNNNNNNN...',
    '....N.....N.....', '....N.....N.....', '...gNg...gNg....', '................',
  ];
  // 写真館
  const STUDIO = [
    '................', '................', '................', '...bbbbbbbbbb...',
    '..buuuuuuuuuub..', '.buuuuuuuuuuuub.', '.BBBBBBBBBBBBBB.', '.ccKKKKccccccc..',
    '.ccKwwKcSSSSSc..', '.ccKKKKcSSSSSc..', '.ccccccbSsSSSc..', '.cNNNccbbbbbbc..',
    '.cNyNcccccccccc.', '.cNNNcccccccccc.', '.gggggggggggggg.', '................',
  ];
  const CAR = [
    '................', '...XXXXXX.......', '..XSSXXSSX......', '.XXSSXXSSXXX....',
    'XXXXXXXXXXXXXx..', 'XXXXXXXXXXXXXx..', 'xKKxxxxxxxKKxx..', '.KgK.....KgK....',
  ];
  const DUCK = ['....GG.....', '...GGGK....', '..WGGGyy...', '.yyyyy.....'];
  // 小さい旗（コンテンツのしるし。夕日のもよう）
  const FLAG = [
    ['KK.......', 'wRRRRRRK.', 'wRRRRRRK.', 'wRRYYRRK.', 'wRYYYYRK.', 'wRRRRRRK.', 'wKKKKKK..', 'w........', 'w........', 'w........', 'g........'],
    ['KK.......', 'wRRRRRK..', 'wRRRRRRRK', 'wRRYYRRK.', 'wRYYYYRRK', 'wRRRRRRK.', 'wKKKKKK..', 'w........', 'w........', 'w........', 'g........'],
  ];

  const S = {}; // 作りおきのスプライト
  function build() {
    S.troops = {};
    for (const col of ['b', 'R', 'G', 'Y', 'u']) S.troops[col] = TROOP.map((f) => spr(f, { X: col }));
    S.bearer = BEARER.map((f) => spr(f, { X: 'O' }));
    S.drummer = DRUMMER.map((f) => spr(f, { X: 'G' }));
    S.tree = spr(TREE);
    S.houses = ['R', 'b', 'O'].map((col) => spr(HOUSE, { X: col }));
    S.kura = spr(KURA);
    S.gate = spr(GATE);
    S.board = spr(BOARD);
    S.studio = spr(STUDIO);
    S.carR = spr(CAR, { X: 'R', x: 'r' });
    S.carB = spr(CAR, { X: 'u', x: 'B' });
    S.duck = spr(DUCK);
    S.flag = FLAG.map((f) => spr(f));
    S.logo1 = bigText('夕照寮', 4, 4, [[0, 'W'], [16, 'c'], [32, 'y'], [48, 'Y']], { depth: 2, side: 'r', edge: 'K' });
    S.logo2 = bigText('OB会', 2, 3, [[0, 'W'], [16, 'S'], [24, 's']], { depth: 2, side: 'b', edge: 'K' });
    S.konbini = spr(KONBINI);
  }

  // ── ウインドウ（青い地に白い二重線） ──────────────────────
  function win(g, x, y, w, h) {
    // 外の黒いふち（角は丸める）
    R(g, x + 2, y, w - 4, h, 'K');
    R(g, x, y + 2, w, h - 4, 'K');
    R(g, x + 1, y + 1, w - 2, h - 2, 'K');
    // 白（外側の線・2 ドット）
    R(g, x + 3, y + 1, w - 6, h - 2, 'W');
    R(g, x + 1, y + 3, w - 2, h - 6, 'W');
    R(g, x + 2, y + 2, w - 4, h - 4, 'W');
    // 青のすきま
    R(g, x + 3, y + 3, w - 6, h - 6, 'B');
    // 白（内側の線・1 ドット）
    R(g, x + 4, y + 4, w - 8, h - 8, 'W');
    // 中の青
    R(g, x + 5, y + 5, w - 10, h - 10, 'B');
  }
  // ▶ のカーソル（4×7。右下に黒い影）
  function arrow(g, x, y) {
    for (const [d, col] of [[1, 'K'], [0, 'W']]) {
      for (let i = 0; i < 4; i++) R(g, x + i + d, y + i + d, 1, 7 - i * 2, col);
    }
  }
  // ▼（話の続き）
  function downMark(g, x, y) {
    R(g, x, y, 7, 1, 'W');
    R(g, x + 1, y + 1, 5, 1, 'W');
    R(g, x + 2, y + 2, 3, 1, 'W');
    R(g, x + 3, y + 3, 1, 1, 'W');
  }
  // 地図のカーソル（四すみのかぎ）。grow で 1 ドット外へ
  function mapCursor(g, x, y, grow) {
    const o = 2 + grow;
    const L = 6;
    const corners = [[x - o, y - o, 1, 1], [x + 15 + o, y - o, -1, 1], [x - o, y + 15 + o, 1, -1], [x + 15 + o, y + 15 + o, -1, -1]];
    for (const [cx, cy, sx, sy] of corners) {
      // 黒いふち
      for (let i = -1; i <= L; i++) {
        for (let t = -1; t <= 2; t++) {
          px(g, cx + i * sx, cy + t * sy, 'K');
          px(g, cx + t * sx, cy + i * sy, 'K');
        }
      }
    }
    for (const [cx, cy, sx, sy] of corners) {
      for (let i = 0; i < L; i++) {
        for (let t = 0; t <= 1; t++) {
          px(g, cx + i * sx, cy + t * sy, 'W');
          px(g, cx + t * sx, cy + i * sy, 'W');
        }
      }
    }
  }
  function px(g, x, y, col) {
    R(g, x, y, 1, 1, col);
  }

  // ── タイトル画面の背景（夕焼けの川と寮） ─────────────────────
  const HORIZON = 150;
  const SUN_X = 54;
  function titleBG(frame) {
    const c = cv(SW, SH);
    const g = c.getContext('2d');
    // 空の色の帯（下ほど明るい。境目は市松で混ぜる）
    const bands = [[0, 'K'], [34, 'V'], [100, 'v'], [116, 'e'], [127, 'R'], [135, 'O'], [141, 'o'], [146, 'y']];
    for (let y = 0; y < HORIZON; y++) {
      let i = 0;
      while (i + 1 < bands.length && y >= bands[i + 1][0]) i++;
      R(g, 0, y, SW, 1, bands[i][1]);
      const next = bands[i + 1];
      if (next && next[0] - y <= 3) {
        const d = next[0] - y; // 3, 2, 1
        for (let x = 0; x < SW; x++) {
          const on = d === 1 ? (x + y) % 2 === 0 : d === 2 ? (x % 4 === (y % 2) * 2) : (x % 8 === (y % 2) * 4);
          if (on) px(g, x, y, next[1]);
        }
      }
    }
    // 夕日（横じまの入った半円）
    const sx = SUN_X, sy = HORIZON, sr = 24;
    for (let y = sy - sr; y < sy; y++) {
      const dy = sy - y;
      const half = Math.floor(Math.sqrt(sr * sr - dy * dy));
      const rel = (y - (sy - sr)) / sr;
      // 下の方は、すきまを入れる
      if (rel > 0.5 && dy % 4 < Math.max(1, Math.round((rel - 0.5) * 6))) continue;
      R(g, sx - half, y, half * 2, 1, rel < 0.3 ? 'c' : rel < 0.6 ? 'y' : 'Y');
    }
    // 遠くの町なみ（影絵）
    let x = 0;
    let n = 0;
    while (x < SW) {
      const w = 8 + Math.floor(hash(n, 3) * 14);
      const h = 3 + Math.floor(hash(n, 7) * 8);
      R(g, x, HORIZON - h, w, h, 'v');
      if (hash(n, 11) > 0.45) px(g, x + 2 + Math.floor(hash(n, 13) * (w - 4)), HORIZON - h + 2, 'Y');
      x += w;
      n++;
    }
    R(g, 0, HORIZON - 2, SW, 2, 'v');
    // 寮（逆光の影絵。3 階建てで、窓に明かり）
    const bx = 170, bw = 80, by = HORIZON - 25;
    R(g, bx, by, bw, 25, 'K');
    // 屋上のさく
    R(g, bx, by - 4, bw, 1, 'K');
    for (let i = 0; i <= bw; i += 3) R(g, bx + i, by - 4, 1, 4, 'K');
    // 屋上の階段室と旗ざお
    R(g, bx + 30, by - 9, 12, 9, 'K');
    R(g, bx + 62, by - 15, 1, 15, 'K');
    R(g, bx + 63, by - 15, 7, 5, 'K');
    // 窓（3 階ぶん）
    for (let f = 0; f < 3; f++) {
      for (let i = 0; i < 12; i++) {
        const wx = bx + 3 + i * 6 + (i > 5 ? 2 : 0);
        const wy = by + 3 + f * 7;
        if (f === 2 && i >= 3 && i <= 4) continue;
        const lit = hash(i, f + 20) > 0.42;
        R(g, wx, wy, 3, 4, lit ? 'Y' : 'V');
        if (lit) R(g, wx, wy, 3, 1, 'y');
      }
    }
    // 玄関の明かり
    R(g, bx + 21, HORIZON - 7, 9, 7, 'y');
    R(g, bx + 25, HORIZON - 7, 1, 7, 'O');
    // 川（夕日が映る）
    R(g, 0, HORIZON, SW, 22, 'V');
    for (let y = HORIZON + 2; y < HORIZON + 22; y += 3) {
      const spread = 28 - (y - HORIZON);
      for (let k = 0; k < 6; k++) {
        const len = 3 + Math.floor(hash(k + frame * 7, y) * 8);
        const ox = Math.round(sx - spread + hash(k * 3 + frame, y * 5) * spread * 2 - len / 2);
        R(g, ox, y, len, 1, k % 3 === 0 ? 'y' : 'o');
      }
      for (let k = 0; k < 5; k++) {
        const ox = Math.floor(hash(k + frame * 13, y * 3) * SW);
        R(g, ox, y + 1, 3 + (k % 3), 1, 'v');
      }
    }
    // 寮の影が川に映る
    for (let y = HORIZON; y < HORIZON + 20; y += 2) R(g, bx + 2, y, bw - 4, 1, 'K');
    // 手前の土手と道
    R(g, 0, HORIZON + 22, SW, 6, 'd');
    for (let i = 0; i < SW; i += 3) px(g, i + (i % 2), HORIZON + 22, 'G');
    R(g, 0, HORIZON + 28, SW, 24, 'N');
    for (let i = 0; i < 70; i++) px(g, Math.floor(hash(i, 1) * SW), HORIZON + 30 + Math.floor(hash(i, 2) * 20), 'n');
    R(g, 0, HORIZON + 28, SW, 1, 'n');
    R(g, 0, HORIZON + 52, SW, SH - HORIZON - 52, 'K');
    return c;
  }
  // 星（上の暗いところ）
  const STARS = [];
  for (let i = 0; i < 26; i++) STARS.push([Math.floor(hash(i, 91) * SW), 2 + Math.floor(hash(i, 92) * 44), hash(i, 93)]);
  function stars(g, t, still) {
    for (const [x, y, ph] of STARS) {
      const on = still ? ph > 0.3 : Math.sin(t * 2.2 + ph * 20) > -0.3;
      if (!on) continue;
      px(g, x, y, y < 26 ? 'W' : 'S');
      if (ph > 0.8 && !still && Math.sin(t * 3 + ph * 9) > 0.6) {
        px(g, x - 1, y, 'w'); px(g, x + 1, y, 'w'); px(g, x, y - 1, 'w'); px(g, x, y + 1, 'w');
      }
    }
  }

  // ── 地図 ────────────────────────────────────────
  function tileAt(map, x, y) {
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return '';
    return map[y][x];
  }
  const ROADS = '#|';
  function isRoad(ch) {
    return ROADS.includes(ch);
  }
  function isWater(ch) {
    return ch === '~' || ch === '=';
  }

  function grass(g, x, y, tx, ty) {
    R(g, x, y, TS, TS, 'l');
    for (let i = 0; i < 3; i++) {
      const h = hash(tx * 7 + i, ty * 13 + i);
      const gx = x + 2 + Math.floor(h * 11);
      const gy = y + 2 + Math.floor(hash(tx + i * 5, ty + 3) * 11);
      px(g, gx, gy, 'G'); px(g, gx + 2, gy, 'G'); px(g, gx + 1, gy + 1, 'G');
    }
    if (hash(tx, ty) > 0.7) px(g, x + 3 + Math.floor(hash(ty, tx) * 9), y + 4 + Math.floor(hash(tx + 1, ty) * 8), 'L');
  }
  function water(g, x, y, tx, ty, map, phase) {
    R(g, x, y, TS, TS, 'u');
    // 波（phase で横にずらす）
    for (let i = 0; i < 3; i++) {
      const wy = y + 3 + i * 5;
      const off = Math.floor(hash(tx, ty * 3 + i) * 12);
      const wx = x + ((off + phase * 2 + i * 3) % 14);
      R(g, wx, wy, 3, 1, 'S');
      if (wx + 3 < x + TS) px(g, wx + 3, wy - 1, 'S');
    }
    // 護岸
    if (!isWater(tileAt(map, tx, ty - 1))) {
      R(g, x, y, TS, 2, 'w');
      R(g, x, y + 2, TS, 1, 'g');
      R(g, x, y + 3, TS, 1, 'b');
    }
    if (!isWater(tileAt(map, tx, ty + 1))) {
      R(g, x, y + TS - 3, TS, 1, 'b');
      R(g, x, y + TS - 2, TS, 1, 'W');
      R(g, x, y + TS - 1, TS, 1, 'w');
    }
  }
  function road(g, x, y, tx, ty, map, ch) {
    R(g, x, y, TS, TS, 'g');
    // アスファルトのつぶ
    for (let i = 0; i < 4; i++) px(g, x + Math.floor(hash(tx * 3 + i, ty) * 16), y + Math.floor(hash(tx, ty * 5 + i) * 16), 'w');
    const up = tileAt(map, tx, ty - 1), dn = tileAt(map, tx, ty + 1);
    const lf = tileAt(map, tx - 1, ty), rt = tileAt(map, tx + 1, ty);
    if (ch === '#') {
      if (!isRoad(up)) { R(g, x, y, TS, 2, 'w'); R(g, x, y + 2, TS, 1, 'W'); }
      if (!isRoad(dn)) { R(g, x, y + TS - 3, TS, 1, 'W'); R(g, x, y + TS - 2, TS, 2, 'w'); }
      // まんなかの線
      if (dn === '#') for (let i = 0; i < TS; i += 8) R(g, x + i + 1, y + TS - 1, 5, 1, 'W');
      if (up === '|') { R(g, x, y, 2, 3, 'w'); R(g, x + TS - 2, y, 2, 3, 'w'); R(g, x + 2, y, TS - 4, 3, 'g'); }
    } else {
      if (!isRoad(lf)) { R(g, x, y, 2, TS, 'w'); R(g, x + 2, y, 1, TS, 'W'); }
      if (!isRoad(rt)) { R(g, x + TS - 3, y, 1, TS, 'W'); R(g, x + TS - 2, y, 2, TS, 'w'); }
      R(g, x + 7, y + 2, 2, 6, 'W');
    }
  }
  function bridge(g, x, y) {
    R(g, x, y, TS, TS, 'g');
    R(g, x + 7, y + 4, 2, 6, 'W');
    // らんかん
    R(g, x, y, 3, TS, 'W');
    R(g, x + TS - 3, y, 3, TS, 'W');
    R(g, x + 2, y, 1, TS, 'w');
    R(g, x + TS - 3, y, 1, TS, 'w');
    for (let i = 0; i < TS; i += 4) { px(g, x, y + i, 'g'); px(g, x + TS - 1, y + i, 'g'); }
  }
  function paving(g, x, y, a, b) {
    R(g, x, y, TS, TS, a);
    for (let i = 0; i < TS; i += 4) {
      R(g, x, y + i, TS, 1, b);
      R(g, x + ((i / 4) % 2) * 4, y + i, 1, 4, b);
      R(g, x + ((i / 4) % 2) * 4 + 8, y + i, 1, 4, b);
    }
  }
  function platform(g, x, y) {
    R(g, x, y, TS, TS, 'w');
    R(g, x, y, TS, 1, 'W');
    for (let i = 0; i < TS; i += 2) px(g, x + i, y + 11, 'Y');
    R(g, x, y + 12, TS, 1, 'Y');
    R(g, x, y + 14, TS, 2, 'g');
  }
  function fence(g, x, y, tx, ty) {
    grass(g, x, y, tx, ty);
    R(g, x, y + 12, TS, 1, 'w');
    for (let i = 1; i < TS; i += 5) R(g, x + i, y + 10, 1, 5, 'g');
  }
  function rails(g, x, y) {
    R(g, x, y, TS, TS, 'g');
    for (let i = 0; i < 10; i++) px(g, x + (i * 7) % 16, y + 1 + (i * 5) % 14, 'w');
    for (let i = 1; i < TS; i += 4) R(g, x + i, y + 2, 2, 12, 'N');
    R(g, x, y + 4, TS, 1, 'W');
    R(g, x, y + 5, TS, 1, 'w');
    R(g, x, y + 10, TS, 1, 'W');
    R(g, x, y + 11, TS, 1, 'w');
  }
  // 寮（7×3 マス。屋上・3 階建て・玄関）
  function dorm(g, x0, y0, flagPhase) {
    const w = 7 * TS, h = 3 * TS;
    // 影
    R(g, x0 + 4, y0 + h, w, 3, 'G');
    R(g, x0 + w, y0 + 6, 3, h - 3, 'G');
    // 屋上
    R(g, x0, y0 + 2, w, 15, 'w');
    for (let i = 0; i < w; i += 12) R(g, x0 + i, y0 + 3, 1, 13, 'g');
    R(g, x0, y0 + 2, w, 1, 'W');
    // 屋上のさく
    R(g, x0 + 1, y0 + 4, w - 2, 1, 'g');
    for (let i = 1; i < w; i += 3) px(g, x0 + i, y0 + 3, 'g');
    // 階段室
    R(g, x0 + 30, y0 + 4, 14, 10, 'W');
    R(g, x0 + 30, y0 + 4, 14, 1, 'w');
    R(g, x0 + 30, y0 + 13, 14, 1, 'g');
    R(g, x0 + 35, y0 + 8, 4, 5, 'b');
    // 干してあるふとん
    R(g, x0 + 72, y0 + 4, 10, 6, 'R');
    R(g, x0 + 72, y0 + 4, 10, 1, 'o');
    R(g, x0 + 84, y0 + 4, 10, 6, 'b');
    R(g, x0 + 84, y0 + 4, 10, 1, 'S');
    // かべ
    R(g, x0, y0 + 17, w, h - 17, 'W');
    R(g, x0, y0 + 17, w, 1, 'g');
    R(g, x0 + w - 2, y0 + 18, 2, h - 18, 'w');
    // 窓（2・3 階）
    for (let f = 0; f < 2; f++) {
      const wy = y0 + 20 + f * 9;
      for (let i = 0; i < 13; i++) {
        const wx = x0 + 3 + i * 8 + (i >= 7 ? 1 : 0);
        R(g, wx, wy, 6, 6, 'g');
        R(g, wx + 1, wy + 1, 4, 4, 'S');
        R(g, wx + 1, wy + 3, 4, 2, 's');
        px(g, wx + 1, wy + 1, 'W');
      }
    }
    // 1 階（食堂の張り出した窓・玄関）
    const gy = y0 + 38;
    R(g, x0, gy - 1, w, 1, 'w');
    R(g, x0 + 2, gy, 26, 9, 'g');
    R(g, x0 + 3, gy + 1, 24, 7, 'y');
    for (let i = 0; i < 4; i++) R(g, x0 + 3 + i * 6, gy + 1, 1, 7, 'g');
    R(g, x0 + 1, gy + 8, 28, 2, 'w');
    for (let i = 0; i < 8; i++) {
      const wx = x0 + 52 + i * 7;
      if (wx + 5 > x0 + w - 3) break;
      R(g, wx, gy + 1, 5, 5, 'g');
      R(g, wx + 1, gy + 2, 3, 3, 'S');
    }
    // 玄関（ガラス戸とひさし）
    const ex = x0 + 2 * TS + 2;
    R(g, ex - 2, gy - 2, 16, 2, 'g');
    R(g, ex - 2, gy - 3, 16, 1, 'w');
    R(g, ex, gy, 12, 10, 'g');
    R(g, ex + 1, gy + 1, 10, 9, 'S');
    R(g, ex + 6, gy + 1, 1, 9, 'g');
    R(g, ex + 1, gy + 6, 10, 4, 's');
    // 寮の旗（屋上）
    const fx = x0 + 96, fy = y0 - 12;
    R(g, fx, fy, 1, 18, 'w');
    R(g, fx - 1, fy + 17, 3, 1, 'g');
    R(g, fx + 1, fy + 1, 11, 7, 'R');
    R(g, fx + 1, fy + 1, 11, 1, 'o');
    R(g, fx + 4, fy + 4, 5, 2, 'Y');
    R(g, fx + 5, fy + 3, 3, 1, 'Y');
    if (flagPhase) R(g, fx + 12, fy + 2, 1, 6, 'R');
    else R(g, fx + 9, fy + 7, 3, 1, 'r');
  }
  // 駅（4 マス）
  function station(g, x0, y0) {
    const w = 4 * TS;
    R(g, x0, y0, w, 5, 'g');
    R(g, x0, y0, w, 1, 'w');
    R(g, x0 + 1, y0 + 4, w - 2, 1, 'K');
    R(g, x0 + 2, y0 + 5, w - 4, 10, 'c');
    R(g, x0 + w - 3, y0 + 5, 1, 10, 'o');
    // 看板
    R(g, x0 + 20, y0 + 1, 24, 3, 'W');
    R(g, x0 + 21, y0 + 2, 22, 1, 'b');
    // 入口
    R(g, x0 + 22, y0 + 7, 20, 8, 'g');
    R(g, x0 + 23, y0 + 8, 18, 7, 'S');
    R(g, x0 + 32, y0 + 8, 1, 7, 'g');
    // 窓
    R(g, x0 + 5, y0 + 7, 12, 4, 'g');
    R(g, x0 + 6, y0 + 8, 10, 2, 'S');
    R(g, x0 + 47, y0 + 7, 12, 4, 'g');
    R(g, x0 + 48, y0 + 8, 10, 2, 'S');
    R(g, x0, y0 + 15, w, 1, 'g');
  }
  function flag(g, x, y, phase) {
    g.drawImage(S.flag[phase], x, y);
  }

  // 地図をまるごと描く（phase：波と旗の動き 0〜3）
  function mapImage(map, phase) {
    const c = cv(SW, SH);
    const g = c.getContext('2d');
    const fp = phase % 2;
    for (let ty = 0; ty < map.length; ty++) {
      for (let tx = 0; tx < map[ty].length; tx++) {
        const ch = map[ty][tx];
        const x = tx * TS, y = ty * TS;
        if (ch === '~') water(g, x, y, tx, ty, map, phase);
        else if (ch === '=') { water(g, x, y, tx, ty, map, phase); bridge(g, x, y); }
        else if (ch === '#' || ch === '|') road(g, x, y, tx, ty, map, ch);
        else if (ch === ':') { grass(g, x, y, tx, ty); paving(g, x, y, 'c', 'y'); R(g, x, y, 3, TS, 'l'); R(g, x + 13, y, 3, TS, 'l'); }
        else if (ch === ',' || ch === 'S') paving(g, x, y, 'w', 'W');
        else if (ch === '_') platform(g, x, y);
        else if (ch === 'f') fence(g, x, y, tx, ty);
        else if (ch === 'E') { grass(g, x, y, tx, ty); paving(g, x, y, 'c', 'y'); R(g, x, y, 3, TS, 'l'); R(g, x + 13, y, 3, TS, 'l'); }
        else if (ch === 'r') rails(g, x, y);
        else grass(g, x, y, tx, ty);
      }
    }
    // 横断歩道（寮の前の道の先）
    for (let ty = 0; ty < map.length; ty++) {
      for (let tx = 0; tx < map[ty].length; tx++) {
        if (map[ty][tx] === '#' && (tileAt(map, tx, ty - 1) === ':' || tileAt(map, tx, ty - 2) === ':')) {
          for (let i = 3; i < TS; i += 4) R(g, tx * TS + 2, ty * TS + i, 12, 2, 'W');
        }
      }
    }
    // 小物（上の行から順に重ねる）
    let dormDone = false, stationDone = false;
    for (let ty = 0; ty < map.length; ty++) {
      for (let tx = 0; tx < map[ty].length; tx++) {
        const ch = map[ty][tx];
        const x = tx * TS, y = ty * TS;
        if (ch === 'T') g.drawImage(S.tree, x, y);
        else if (ch === 'h') g.drawImage(S.houses[(tx + ty) % 3], x, y);
        else if (ch === 'K') { g.drawImage(S.kura, x, y - 4); flag(g, x + 11, y - 13, fp); }
        else if (ch === 'E') { g.drawImage(S.gate, x, y); flag(g, x + 14, y - 7, fp); }
        else if (ch === 'M') { g.drawImage(S.board, x, y); flag(g, x + 12, y - 8, fp); }
        else if (ch === 'P') { g.drawImage(S.studio, x, y); flag(g, x + 12, y - 8, fp); }
        else if (ch === 'c') g.drawImage(S.konbini, x, y);
        else if (ch === 'D' && !dormDone) { dorm(g, x, y, fp); dormDone = true; }
        else if (ch === 'S' && !stationDone) { station(g, x, y); stationDone = true; }
      }
    }
    return c;
  }

  // 電車（1 両 40×12）
  function train(g, x, y, cars) {
    for (let i = 0; i < cars; i++) {
      const cx = x + i * 42;
      R(g, cx, y, 40, 12, 'c');
      R(g, cx, y, 40, 1, 'W');
      R(g, cx, y + 7, 40, 2, 'b');
      for (let k = 0; k < 5; k++) R(g, cx + 3 + k * 7, y + 2, 5, 4, 'B');
      for (let k = 0; k < 5; k++) R(g, cx + 4 + k * 7, y + 2, 3, 1, 'S');
      R(g, cx, y + 11, 40, 1, 'g');
      if (i === 0) { R(g, cx, y + 2, 2, 8, 'b'); px(g, cx + 1, y + 9, 'Y'); }
      if (i < cars - 1) R(g, cx + 40, y + 3, 2, 6, 'g');
    }
  }

  H.art = {
    C, TS, SW, SH, R, cv, build, S,
    win, arrow, downMark, mapCursor, titleBG, stars, mapImage, train,
  };
})();
