/*
 * 男魂くんの1年 ― 人物のドット絵（16×24 ドット）
 *   OTK.person(kind, { dir, frame, naked, variant }) → canvas（同じ指定なら同じ canvas を返す）
 *   OTK.portrait(kind, { variant, mood }) → 32×32 の顔（会話の場面用）
 * 男魂くんだけ専用の見た目。ほかは共通の絵を色ちがいで使う（あとで描き分けてよい）。
 * 学祭のホストクラブ用に、ホスト（host）と、ホストのかっこうの男魂くん（otokoHost）もいる。
 * 全裸（naked: true）は「男魂」の札とモザイクで隠す。はっきりした裸は描かない。
 */
(function () {
  'use strict';
  const OTK = (window.OTK = window.OTK || {});
  const P = OTK.P;
  const SW = 16, SH = 24;
  const LINE = '#141018';
  const EYE = '#141018';
  const MOUTH = '#a83020';

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  // 色を明るく（amt > 0）・暗く（amt < 0）
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
    const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  const at = (arr, v, mul, off) => arr[(((v * (mul || 1) + (off || 0)) % arr.length) + arr.length) % arr.length];

  // ── 種類ごとの見た目 ───────────────────────────────
  const HAIR = { black: '#241c1c', brown: '#5c3418', tea: '#9c5c28', blond: '#e8c040', gray: '#a8a8a8', purple: '#7c5ca8', red: '#a03020' };
  const SKINS = [P.skin, '#f0b48c', '#dca070'];
  const KINDS = {
    // 男魂くん：白い T シャツに赤い「男」、赤いはちまき
    otoko: () => ({ skin: P.skin, hair: HAIR.black, hs: 'spiky', hat: 'band', hatCol: P.red, top: 'tee', topCol: P.white, mark: 'otoko', legCol: '#2838a0', shoeCol: P.red, brows: true }),
    // 先輩：ジャージにサンダル。サングラスやひげの人も
    senpai: (v) => {
      const jc = at(['#00804c', '#8c1c3c', '#283890', '#6c2c9c', '#303030', '#b85c00'], v);
      return {
        skin: at(SKINS, v, 2), hair: at([HAIR.black, HAIR.brown, HAIR.blond, HAIR.tea, HAIR.black], v, 3),
        hs: at(['short', 'spiky', 'buzz', 'mullet', 'short'], v, 1, 1), top: 'jersey', topCol: jc, legCol: jc, stripe: P.white, shoeCol: '#7c7c7c',
        sunglasses: v % 4 === 1, beard: v % 3 === 2, brows: true,
      };
    },
    // 同期：パーカーや T シャツにジーンズ
    douki: (v) => ({
      skin: at(SKINS, v, 1), hair: at([HAIR.black, HAIR.brown, HAIR.black, HAIR.tea], v, 3),
      hs: at(['short', 'mash', 'spiky', 'short'], v, 1), top: v % 2 ? 'hoodie' : 'tee', topCol: at(['#f87818', '#3cbcfc', '#58b858', '#9c9c9c', '#f8d030', '#d04848'], v, 5),
      legCol: at(['#3050a0', '#a08860', '#3c3c4c'], v, 1), shoeCol: at([P.white, '#5c3418', '#202020'], v, 2), glasses: v % 5 === 3,
    }),
    // 一年：あかるい T シャツに名札
    ichinen: (v) => ({
      skin: at(SKINS, v, 1), hair: at([HAIR.black, HAIR.black, HAIR.brown], v, 1), hs: at(['short', 'mash', 'buzz'], v, 2),
      top: 'tee', topCol: at(['#f8f088', '#88d8f8', '#f8b8c8', '#b8f0a0', '#f8c070'], v, 3), mark: 'tag',
      legCol: at(['#3050a0', '#b09870', '#283048'], v, 1), shoeCol: at([P.white, '#d8d8d8'], v),
    }),
    // 女子学生
    joshi: (v) => ({
      skin: at(SKINS, v, 1), hair: at([HAIR.black, HAIR.brown, HAIR.tea, HAIR.black], v, 3), hs: at(['long', 'bob', 'pony'], v, 1),
      top: 'blouse', topCol: at(['#f8a8c8', '#fcfcfc', '#c8b8f8', '#f8e090', '#90d0f8'], v, 2), legs: 'skirt',
      legCol: at(['#283070', '#c03838', '#d8c8a0', '#383838'], v, 3), shoeCol: at(['#7c3c1c', '#202020'], v), blush: true, lashes: true,
    }),
    // おばちゃん（三角巾とエプロン）
    obachan: (v) => ({
      skin: SKINS[0], hair: at([HAIR.gray, HAIR.purple, '#5c3c2c'], v), hs: 'perm', hat: v % 2 ? null : 'kerchief', hatCol: P.white,
      top: 'apron', topCol: at(['#d06070', '#6080c0', '#e0a040'], v, 2), apronCol: at([P.white, '#f8c8d8', '#fce0a8'], v), legCol: '#4c3c5c', shoeCol: '#e0e0e0', blush: true,
    }),
    // おまわりさん
    police: () => ({ skin: P.skin, hair: HAIR.black, hs: 'short', hat: 'police', hatCol: '#1c2c6c', top: 'uniform', topCol: '#78a8e0', badge: P.yellow, legCol: '#1c2c6c', shoeCol: '#141018', brows: true }),
    // 店員（0：牛丼屋、1：コンビニ、2：そのほか）
    tenin: (v) => {
      const c = at(['#e45c10', '#2c7cd8', '#30a050'], v);
      return { skin: at(SKINS, v, 1), hair: at([HAIR.black, HAIR.brown], v), hs: 'short', hat: 'cap', hatCol: c, top: 'apron', topCol: c, apronCol: at(['#3c2c1c', '#fcfcfc', '#fcfcfc'], v), legCol: '#2c2c3c', shoeCol: '#141018' };
    },
    // 駅員
    ekiin: () => ({ skin: P.skin, hair: HAIR.black, hs: 'short', hat: 'station', hatCol: '#202c50', top: 'uniform', topCol: '#202c50', badge: P.yellow, legCol: '#202c50', shoeCol: '#141018', gloves: P.white }),
    // ゾンビ（寮生のなれの果て）
    zombie: (v) => ({
      skin: at(['#88c070', '#98b878', '#78b090'], v), hair: at([HAIR.black, HAIR.brown, '#3c4c3c'], v, 2), hs: at(['spiky', 'short', 'mash'], v),
      top: 'rag', topCol: at(['#7c7c7c', '#8c6c4c', '#5c6c8c', '#6c8c5c'], v, 3), legCol: at(['#4c4c5c', '#5c4c3c'], v), shoeCol: '#3c3c3c', zombie: true,
    }),
    // 管理人さん（はげ頭にめがね、オリーブ色のカーディガン、つっかけ）。寮さんぽの管理人さんと同じ色
    kanri: () => ({ skin: SKINS[1], hair: HAIR.gray, hs: 'bald', top: 'long', topCol: '#6f7d5c', legCol: '#4a4a52', shoeCol: '#7c5c3c', glasses: true, brows: true }),
    // 寮長（紺のジャージに、赤い「寮長」の腕章）
    ryocho: () => ({ skin: SKINS[1], hair: HAIR.black, hs: 'spiky', top: 'jersey', topCol: '#2f4f8a', legCol: '#2f4f8a', stripe: P.white, shoeCol: '#7c7c7c', brows: true, armband: P.red }),
    // ホスト（学祭の寮のホストクラブ。お酒は出さない）：黒・紺・白・えんじのスーツに、えりを開けた色シャツ。盛った髪
    host: (v) => {
      const [suit, shirt] = at([['#202028', '#f8a8c8'], ['#28306c', '#fcfcfc'], ['#ececf4', '#30304c'], ['#6c1c3c', '#fcfcfc'], ['#3c2c5c', '#c8b8f8']], v);
      return {
        skin: at(SKINS, v, 1), hair: at([HAIR.blond, HAIR.tea, HAIR.brown, HAIR.black, '#c8c8d8'], v, 2), hs: 'host',
        top: 'host', topCol: suit, shirt, legCol: suit, shoeCol: v % 2 ? '#ececf4' : '#141018', brows: true, chain: v % 3 === 0,
      };
    },
    // 男魂くん（学祭のホストのかっこう）：赤いはちまきのまま、黒いスーツ。前を開けて、中は「男」の T シャツ
    otokoHost: () => ({ skin: P.skin, hair: HAIR.black, hs: 'spiky', hat: 'band', hatCol: P.red, top: 'host', topCol: '#202028', shirt: P.white, open: true, mark: 'otoko', legCol: '#202028', shoeCol: '#141018', brows: true }),
    // 通りすがりの人（会社員・おじいさん・学生など）
    kyaku: (v) => {
      const t = v % 4;
      if (t === 0) return { skin: at(SKINS, v, 1), hair: HAIR.black, hs: 'short', top: 'suit', topCol: at(['#4c4c5c', '#283048', '#5c4430'], v), tie: at([P.red, '#2850c0', '#30a050'], v, 2), legCol: at(['#4c4c5c', '#283048', '#5c4430'], v), shoeCol: '#141018' };
      if (t === 1) return { skin: SKINS[1], hair: HAIR.gray, hs: 'bald', top: 'long', topCol: at(['#a89870', '#788c6c', '#8c7c9c'], v), legCol: '#5c5048', shoeCol: '#3c3028', glasses: true };
      if (t === 2) return { skin: at(SKINS, v, 2), hair: at([HAIR.brown, HAIR.black], v), hs: 'long', top: 'long', topCol: at(['#e0d0b0', '#c05070', '#5080a0'], v), legs: 'skirt', legCol: at(['#3c3c4c', '#806040'], v), shoeCol: '#202020', blush: true, lashes: true };
      return { skin: at(SKINS, v, 1), hair: at([HAIR.black, HAIR.tea], v), hs: at(['mash', 'short'], v), top: 'hoodie', topCol: at(['#606878', '#c8c8c8', '#3c6c4c'], v), legCol: '#3050a0', shoeCol: P.white };
    },
  };
  // 呼び名のゆれを受けつける
  const ALIAS = { player: 'otoko', hero: 'otoko', obasan: 'obachan', keisatsu: 'police', clerk: 'tenin', staff: 'ekiin', guest: 'kyaku', girl: 'joshi' };

  function lookOf(kind, variant) {
    const k = KINDS[kind] ? kind : KINDS[ALIAS[kind]] ? ALIAS[kind] : 'kyaku';
    const L = Object.assign({ legs: 'pants', hat: null, mark: null }, KINDS[k](variant | 0));
    L.kind = k;
    L.skinS = shade(L.skin, -0.18);
    L.hairHi = shade(L.hair, 0.28);
    return L;
  }

  // ── 描く道具 ────────────────────────────────────
  function painter(c) {
    const x2 = c.getContext('2d');
    const p = (x, y, w, h, col) => {
      if (!col) return;
      x2.fillStyle = col;
      x2.fillRect(x, y, w, h);
    };
    const clear = (x, y, w, h) => x2.clearRect(x, y, w, h);
    return { x2, p, clear };
  }
  // まわりを 1 ドットの線でふちどる
  function outline(c) {
    const x2 = c.getContext('2d');
    const w = c.width, h = c.height;
    const img = x2.getImageData(0, 0, w, h);
    const d = img.data;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    const pts = [];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) pts.push([x, y]);
    x2.fillStyle = LINE;
    pts.forEach(([x, y]) => x2.fillRect(x, y, 1, 1));
  }

  // ── 髪 ─────────────────────────────────────────
  function hairFront(p, L) {
    const c = L.hair, s = L.hs;
    if (s === 'host') {
      // ホストの盛り髪：上にボリューム、前髪を横に流して、右のサイドは長め
      p(5, 0, 6, 1, c);
      p(4, 1, 9, 1, c);
      p(3, 2, 11, 3, c);
      p(3, 5, 6, 1, c);
      p(3, 6, 2, 1, c);
      p(3, 7, 1, 1, c);
      p(12, 5, 2, 1, c);
      p(12, 6, 2, 3, c);
      p(6, 1, 3, 1, L.hairHi); p(10, 2, 2, 1, L.hairHi); p(4, 3, 1, 2, L.hairHi); p(6, 5, 2, 1, L.hairHi);
      return;
    }
    if (s === 'bald') {
      p(3, 5, 1, 3, c);
      p(12, 5, 1, 3, c);
      return;
    }
    if (s === 'perm') {
      p(4, 0, 2, 1, c); p(7, 0, 2, 1, c); p(10, 0, 2, 1, c);
      p(3, 1, 10, 1, c);
      p(2, 2, 12, 3, c);
      p(2, 5, 2, 4, c);
      p(12, 5, 2, 4, c);
      p(4, 5, 2, 1, c);
      p(10, 5, 2, 1, c);
      p(5, 2, 1, 1, L.hairHi); p(9, 1, 1, 1, L.hairHi); p(12, 3, 1, 1, L.hairHi);
      return;
    }
    p(5, 1, 6, 1, c);
    p(4, 2, 8, 1, c);
    p(3, 3, 10, 2, c);
    if (s === 'spiky') {
      p(4, 0, 1, 1, c); p(7, 0, 1, 1, c); p(10, 0, 1, 1, c);
      p(4, 1, 8, 1, c);
      p(3, 5, 1, 2, c); p(12, 5, 1, 2, c);
      p(4, 5, 1, 1, c); p(7, 5, 1, 1, c); p(11, 5, 1, 1, c);
    } else if (s === 'buzz') {
      // 坊主：短い毛を少し明るく
      p(5, 1, 6, 1, L.hairHi);
      p(3, 5, 1, 1, c); p(12, 5, 1, 1, c);
    } else if (s === 'mash') {
      p(3, 5, 10, 1, c);
      p(3, 6, 1, 2, c); p(12, 6, 1, 2, c);
    } else {
      p(3, 5, 2, 1, c); p(11, 5, 2, 1, c);
      p(3, 6, 1, 1, c); p(12, 6, 1, 1, c);
      if (s === 'long') { p(2, 4, 1, 9, c); p(13, 4, 1, 9, c); p(3, 7, 1, 5, c); p(12, 7, 1, 5, c); }
      if (s === 'bob') { p(2, 4, 1, 6, c); p(13, 4, 1, 6, c); p(3, 7, 1, 3, c); p(12, 7, 1, 3, c); }
      if (s === 'pony') { p(13, 2, 1, 3, c); }
    }
    if (s !== 'buzz') { p(5, 2, 2, 1, L.hairHi); }
  }
  function hairBack(p, L) {
    const c = L.hair, s = L.hs;
    if (s === 'host') {
      p(5, 0, 6, 1, c);
      p(4, 1, 9, 1, c);
      p(3, 2, 11, 7, c);
      p(4, 9, 9, 1, c);
      p(5, 10, 6, 1, c);
      p(6, 1, 3, 1, L.hairHi); p(10, 3, 2, 1, L.hairHi); p(5, 6, 1, 2, L.hairHi);
      return;
    }
    if (s === 'bald') {
      p(3, 5, 10, 3, c);
      return;
    }
    if (s === 'perm') {
      p(4, 0, 2, 1, c); p(7, 0, 2, 1, c); p(10, 0, 2, 1, c);
      p(3, 1, 10, 1, c);
      p(2, 2, 12, 8, c);
      p(4, 3, 1, 1, L.hairHi); p(9, 5, 1, 1, L.hairHi); p(6, 7, 1, 1, L.hairHi);
      return;
    }
    p(5, 1, 6, 1, c);
    p(4, 2, 8, 1, c);
    p(3, 3, 10, 6, c);
    p(4, 9, 8, 1, c);
    if (s === 'spiky') { p(4, 0, 1, 1, c); p(7, 0, 1, 1, c); p(10, 0, 1, 1, c); p(4, 1, 8, 1, c); p(2, 5, 1, 1, c); p(13, 5, 1, 1, c); }
    if (s === 'buzz') p(3, 3, 10, 6, L.hairHi === c ? c : shade(c, 0.12));
    if (s === 'long') { p(2, 4, 12, 9, c); p(3, 13, 10, 1, c); }
    if (s === 'bob') p(2, 4, 12, 6, c);
    if (s === 'pony') { p(7, 9, 2, 6, c); p(6, 9, 4, 1, shade(c, 0.3)); }
    if (s === 'mullet') p(4, 9, 8, 3, c);
    if (s !== 'buzz') p(5, 2, 2, 1, L.hairHi);
  }
  function hairSide(p, L) {
    // 左向き。後ろ（右）に髪が多い
    const c = L.hair, s = L.hs;
    if (s === 'host') {
      p(5, 0, 7, 1, c);
      p(4, 1, 9, 1, c);
      p(3, 2, 11, 3, c);
      p(2, 5, 4, 1, c); // 前に流した前髪
      p(7, 5, 7, 1, c);
      p(9, 6, 5, 3, c);
      p(10, 9, 3, 1, c);
      p(6, 1, 3, 1, L.hairHi); p(4, 3, 2, 1, L.hairHi); p(11, 4, 2, 1, L.hairHi);
      return;
    }
    if (s === 'bald') {
      p(8, 5, 4, 3, c);
      return;
    }
    if (s === 'perm') {
      p(4, 0, 2, 1, c); p(8, 0, 3, 1, c);
      p(3, 1, 10, 1, c);
      p(2, 2, 12, 3, c);
      p(7, 5, 7, 4, c);
      p(5, 2, 1, 1, L.hairHi); p(10, 3, 1, 1, L.hairHi);
      return;
    }
    p(5, 1, 6, 1, c);
    p(4, 2, 8, 1, c);
    p(3, 3, 10, 2, c);
    p(7, 5, 6, 1, c);
    p(9, 6, 4, 2, c);
    p(10, 8, 3, 1, c);
    if (s === 'spiky') { p(5, 0, 1, 1, c); p(8, 0, 1, 1, c); p(11, 0, 1, 1, c); p(4, 1, 8, 1, c); p(3, 5, 1, 1, c); p(13, 3, 1, 2, c); }
    if (s === 'mash') { p(3, 5, 4, 1, c); }
    if (s === 'buzz') { p(5, 1, 6, 1, L.hairHi); p(10, 8, 3, 1, L.skin); }
    if (s === 'long') { p(9, 6, 5, 7, c); p(10, 13, 3, 1, c); }
    if (s === 'bob') { p(9, 6, 5, 4, c); }
    if (s === 'pony') { p(13, 4, 1, 1, c); p(13, 5, 2, 5, c); }
    if (s === 'mullet') p(10, 8, 3, 4, c);
    if (s !== 'buzz') p(6, 2, 2, 1, L.hairHi);
  }

  // ── 帽子・はちまき ──────────────────────────────
  function hatFront(p, L) {
    const c = L.hatCol;
    if (L.hat === 'band') {
      p(3, 4, 10, 1, c);
      p(13, 3, 1, 1, c); p(14, 2, 1, 1, c); p(13, 5, 1, 1, c); p(14, 6, 1, 1, c);
    } else if (L.hat === 'cap') {
      p(5, 1, 6, 1, c); p(4, 2, 8, 1, c); p(3, 3, 10, 2, c);
      p(3, 5, 10, 1, shade(c, -0.35));
      p(7, 2, 2, 1, P.white);
    } else if (L.hat === 'police' || L.hat === 'station') {
      p(3, 0, 10, 1, c); p(2, 1, 12, 3, c);
      p(3, 4, 10, 1, L.hat === 'police' ? '#141018' : P.yellow);
      p(3, 5, 10, 1, '#141018');
      p(7, 1, 2, 2, P.yellow);
    } else if (L.hat === 'kerchief') {
      p(4, 1, 8, 1, c); p(3, 2, 10, 2, c);
      p(3, 4, 1, 1, c); p(12, 4, 1, 1, c);
    }
  }
  function hatBack(p, L) {
    const c = L.hatCol;
    if (L.hat === 'band') {
      p(3, 4, 10, 1, c);
      p(7, 4, 2, 1, shade(c, -0.3));
      p(6, 5, 1, 3, c); p(9, 5, 1, 2, c);
    } else if (L.hat === 'cap') {
      p(5, 1, 6, 1, c); p(4, 2, 8, 1, c); p(3, 3, 10, 2, c);
      p(6, 5, 4, 1, shade(c, -0.35));
    } else if (L.hat === 'police' || L.hat === 'station') {
      p(3, 0, 10, 1, c); p(2, 1, 12, 3, c);
      p(3, 4, 10, 1, L.hat === 'police' ? '#141018' : P.yellow);
    } else if (L.hat === 'kerchief') {
      p(4, 1, 8, 1, c); p(3, 2, 10, 2, c); p(7, 4, 2, 2, c);
    }
  }
  function hatSide(p, L) {
    const c = L.hatCol;
    if (L.hat === 'band') {
      p(3, 4, 10, 1, c);
      p(13, 4, 1, 1, c); p(14, 5, 1, 2, c); p(13, 6, 1, 1, c);
    } else if (L.hat === 'cap') {
      p(5, 1, 6, 1, c); p(4, 2, 8, 1, c); p(3, 3, 10, 2, c);
      p(1, 5, 5, 1, shade(c, -0.35));
    } else if (L.hat === 'police' || L.hat === 'station') {
      p(4, 0, 9, 1, c); p(3, 1, 11, 3, c);
      p(3, 4, 10, 1, L.hat === 'police' ? '#141018' : P.yellow);
      p(1, 5, 5, 1, '#141018');
      p(4, 1, 1, 2, P.yellow);
    } else if (L.hat === 'kerchief') {
      p(4, 1, 8, 1, c); p(3, 2, 10, 2, c); p(12, 4, 2, 2, c);
    }
  }

  // ── 顔 ─────────────────────────────────────────
  function faceFront(p, L) {
    const sk = L.skin;
    p(5, 5, 6, 1, sk);
    p(4, 6, 8, 1, sk);
    p(3, 7, 10, 2, sk);
    p(4, 9, 8, 1, sk);
    p(5, 10, 6, 1, sk);
    p(3, 7, 1, 2, L.skinS);
    p(12, 7, 1, 2, L.skinS);
    const eye = L.zombie ? P.red : EYE;
    if (L.sunglasses) {
      p(4, 6, 8, 2, '#141018');
      p(5, 6, 1, 1, '#5c6c8c'); p(9, 6, 1, 1, '#5c6c8c');
    } else {
      p(6, 6, 1, 2, eye);
      p(9, 6, 1, 2, eye);
      if (L.lashes) { p(5, 6, 1, 1, EYE); p(10, 6, 1, 1, EYE); }
      if (L.glasses) { p(5, 6, 3, 1, '#5c5c6c'); p(8, 6, 3, 1, '#5c5c6c'); p(5, 7, 1, 1, '#5c5c6c'); p(10, 7, 1, 1, '#5c5c6c'); }
    }
    if (L.brows) { p(5, 5, 2, 1, L.hair); p(9, 5, 2, 1, L.hair); }
    if (L.blush) { p(5, 8, 1, 1, '#f08888'); p(10, 8, 1, 1, '#f08888'); }
    if (L.beard) { p(5, 9, 6, 1, shade(sk, -0.35)); p(6, 10, 4, 1, shade(sk, -0.35)); }
    if (L.zombie) { p(7, 9, 2, 1, '#401010'); p(6, 8, 1, 1, shade(sk, -0.3)); }
    else p(7, 9, 2, 1, MOUTH);
  }
  function faceSide(p, L) {
    const sk = L.skin;
    p(3, 5, 4, 1, sk);
    p(3, 6, 6, 1, sk);
    p(3, 7, 7, 1, sk);
    p(2, 7, 1, 1, sk); // 鼻
    p(3, 8, 7, 1, sk);
    p(4, 9, 6, 1, sk);
    p(5, 10, 4, 1, sk);
    p(8, 6, 1, 2, L.skinS); // 耳
    if (L.sunglasses) p(3, 6, 3, 1, '#141018');
    else {
      p(4, 6, 1, 2, L.zombie ? P.red : EYE);
      if (L.glasses) p(3, 6, 3, 1, '#5c5c6c');
    }
    if (L.brows) p(4, 5, 2, 1, L.hair);
    if (L.blush) p(5, 8, 1, 1, '#f08888');
    if (L.beard) p(4, 9, 4, 1, shade(sk, -0.35));
    p(3, 9, 1, 1, L.zombie ? '#401010' : MOUTH);
  }

  // 「男」のマーク（胸）と、全裸のときの札
  function otokoMark(p, x, y, col) {
    p(x, y, 5, 1, col); p(x, y + 1, 1, 1, col); p(x + 2, y + 1, 1, 1, col); p(x + 4, y + 1, 1, 1, col); p(x, y + 2, 5, 1, col);
    p(x + 1, y + 3, 4, 1, col); p(x + 4, y + 4, 1, 1, col); p(x + 1, y + 4, 1, 1, col); p(x, y + 5, 1, 1, col); p(x + 3, y + 5, 2, 1, col);
  }
  function placard(p, x, y) {
    // 首から下げた「男魂」の札
    p(x, y, 8, 5, '#fcfcfc');
    p(x, y + 4, 8, 1, '#d8d0c0');
    p(x + 1, y + 1, 2, 3, P.red); p(x + 2, y + 2, 1, 1, '#fcfcfc');
    p(x + 4, y + 1, 3, 1, P.red); p(x + 5, y + 2, 1, 2, P.red); p(x + 4, y + 3, 1, 1, P.red); p(x + 6, y + 3, 1, 1, P.red);
  }
  function mosaic(p, x, y, w, h, L) {
    const cols = [L.skin, L.skinS, shade(L.skin, 0.25), '#e89880'];
    for (let j = 0; j < h; j += 2) for (let i = 0; i < w; i += 2) p(x + i, y + j, Math.min(2, w - i), Math.min(2, h - j), cols[(i / 2 + j / 2 * 3) % cols.length]);
  }

  // ── 体（正面・後ろ） ──────────────────────────────
  function bodyFrontBack(p, L, fr, naked, back) {
    const sk = L.skin;
    const top = naked ? sk : L.topCol;
    const arm = naked ? sk : (L.top === 'tee' || L.top === 'blouse' || L.top === 'rag') ? null : L.topCol;
    const leg = naked ? sk : L.legCol;
    const hand = L.gloves && !naked ? L.gloves : sk;
    const step = fr === 1;
    // 肩と胴
    p(3, 11, 10, 1, top);
    p(4, 12, 8, 6, top);
    // 腕
    const zArms = L.zombie && !back;
    if (zArms) {
      p(1, 11, 3, 2, arm || L.topCol);
      p(12, 11, 3, 2, arm || L.topCol);
      p(0, 10, 2, 2, sk);
      p(14, 10, 2, 2, sk);
    } else {
      const lh = step ? 16 : 17, rh = 17;
      p(2, 12, 2, lh - 12, arm || sk);
      p(12, 12, 2, rh - 12, arm || sk);
      if (!arm && !naked) { p(2, 12, 2, 2, L.topCol); p(12, 12, 2, 2, L.topCol); }
      p(2, lh, 2, 1, hand);
      p(12, rh, 2, 1, hand);
    }
    // 腰と脚
    if (L.legs === 'skirt' && !naked) {
      p(4, 17, 8, 1, L.legCol);
      p(3, 18, 10, 2, L.legCol);
      p(4, 20, 3, step ? 1 : 2, sk);
      p(9, 20, 3, 2, sk);
    } else {
      p(4, 18, 8, 1, leg);
      p(4, 19, 3, step ? 2 : 3, leg);
      p(9, 19, 3, 3, leg);
      if (L.stripe && !naked) { p(4, 19, 1, step ? 2 : 3, L.stripe); p(11, 19, 1, 3, L.stripe); }
    }
    // 靴（裸足のときは肌）
    const shoe = naked ? sk : L.shoeCol;
    p(3, step ? 21 : 22, 4, 1, shoe);
    p(9, 22, 4, 1, shoe);
    if (naked) {
      if (back) mosaic(p, 4, 17, 8, 3, L);
      else {
        // 札のひも
        p(5, 11, 1, 1, '#7c5c3c'); p(10, 11, 1, 1, '#7c5c3c');
        p(5, 12, 1, 3, '#7c5c3c'); p(10, 12, 1, 3, '#7c5c3c');
        placard(p, 4, 15);
      }
      return;
    }
    // 服の細かいところ
    const t = L.top;
    if (t === 'tee' && !back) p(7, 11, 2, 1, sk);
    if (t === 'jersey') {
      p(2, 12, 1, 5, L.stripe); p(13, 12, 1, 5, L.stripe);
      if (!back) { p(6, 11, 4, 1, L.stripe); p(7, 12, 1, 6, shade(L.topCol, 0.35)); }
      else p(4, 11, 8, 1, shade(L.topCol, -0.2));
    }
    if (t === 'hoodie') {
      if (back) p(5, 11, 6, 3, shade(L.topCol, -0.2));
      else { p(4, 11, 8, 1, shade(L.topCol, -0.2)); p(6, 12, 1, 2, P.white); p(9, 12, 1, 2, P.white); p(5, 15, 6, 2, shade(L.topCol, -0.15)); }
    }
    if (t === 'host') {
      const lap = shade(L.topCol, L.topCol === '#ececf4' ? -0.25 : 0.25);
      if (back) p(7, 15, 2, 3, shade(L.topCol, -0.15)); // 背中の切れこみ
      else if (L.open) {
        // 前を開けたジャケット（中の T シャツが見える）
        p(5, 11, 6, 7, L.shirt);
        p(4, 12, 1, 5, lap); p(11, 12, 1, 5, lap);
      } else {
        // えりを開けたシャツ（ネクタイなし）と、ジャケットのえり
        p(6, 11, 4, 1, L.shirt);
        p(7, 11, 2, 1, sk);
        p(6, 12, 4, 2, L.shirt);
        p(7, 12, 2, 1, sk);
        p(7, 14, 2, 2, L.shirt);
        p(5, 12, 1, 2, lap); p(10, 12, 1, 2, lap); p(6, 14, 1, 2, lap); p(9, 14, 1, 2, lap);
        p(7, 16, 1, 1, lap);
        if (L.chain) p(7, 12, 2, 1, '#f8d030');
      }
    }
    if (t === 'suit' && !back) {
      p(6, 11, 4, 1, P.white); p(6, 12, 1, 2, P.white); p(9, 12, 1, 2, P.white);
      p(7, 12, 2, 4, L.tie || P.red);
    }
    if (t === 'uniform') {
      p(4, 17, 8, 1, '#141018');
      if (!back) { p(9, 13, 1, 1, L.badge || P.yellow); p(7, 17, 2, 1, P.yellow); p(7, 11, 2, 1, P.lsky); }
    }
    if (t === 'blouse' && !back) { p(5, 11, 6, 1, P.white); p(7, 12, 2, 1, P.red); }
    if (t === 'apron') {
      const ac = L.apronCol;
      if (back) { p(7, 12, 2, 1, ac); p(6, 15, 4, 1, ac); }
      else { p(5, 11, 1, 2, ac); p(10, 11, 1, 2, ac); p(5, 13, 6, 7, ac); p(5, 15, 6, 1, shade(ac, -0.15)); }
    }
    if (t === 'rag') {
      p(5, 14, 1, 1, sk); p(10, 13, 1, 2, sk);
      p(6, 17, 1, 1, sk); p(9, 16, 2, 1, shade(L.topCol, -0.3));
    }
    if (L.mark === 'otoko' && !back) otokoMark(p, 5, 12, P.red);
    if (L.mark === 'tag' && !back) { p(9, 13, 3, 2, P.white); p(9, 13, 3, 1, P.red); }
    if (L.armband) p(back ? 12 : 2, 13, 2, 2, L.armband);
  }

  // ── 体（横向き：左向きで描いて、右向きは反転） ─────────────────
  function bodySide(p, L, fr, naked) {
    const sk = L.skin;
    const top = naked ? sk : L.topCol;
    const sleeveShort = L.top === 'tee' || L.top === 'blouse' || L.top === 'rag';
    const leg = naked ? sk : L.legCol;
    const shoe = naked ? sk : L.shoeCol;
    const hand = L.gloves && !naked ? L.gloves : sk;
    const step = fr === 1;
    p(5, 11, 6, 7, top);
    // 脚
    if (L.legs === 'skirt' && !naked) {
      p(4, 17, 8, 3, L.legCol);
      if (step) { p(4, 20, 2, 2, sk); p(9, 20, 2, 2, sk); p(2, 22, 4, 1, shoe); p(9, 22, 3, 1, shoe); }
      else { p(6, 20, 3, 2, sk); p(4, 22, 5, 1, shoe); }
    } else if (step) {
      p(5, 18, 6, 1, leg);
      p(4, 19, 3, 1, leg); p(3, 20, 3, 1, leg); p(3, 21, 3, 1, leg);
      p(9, 19, 3, 1, leg); p(10, 20, 3, 1, leg); p(10, 21, 3, 1, leg);
      p(1, 22, 5, 1, shoe); p(10, 22, 4, 1, shoe);
    } else {
      p(5, 18, 6, 1, leg);
      p(6, 19, 4, 3, leg);
      p(4, 22, 6, 1, shoe);
    }
    // 腕
    if (L.zombie) {
      p(2, 13, 6, 2, sleeveShort ? sk : top);
      p(3, 13, 3, 2, L.topCol);
      p(0, 13, 2, 2, sk);
    } else if (step) {
      p(6, 12, 2, 2, sleeveShort && !naked ? L.topCol : top);
      p(5, 14, 2, 2, sleeveShort ? sk : top);
      p(4, 16, 2, 1, hand);
    } else {
      p(7, 12, 2, 2, naked ? sk : L.topCol);
      p(7, 14, 2, 2, sleeveShort || naked ? sk : top);
      p(7, 16, 2, 1, hand);
    }
    if (naked) {
      p(3, 15, 2, 5, '#fcfcfc');
      p(3, 16, 1, 1, P.red); p(3, 18, 1, 1, P.red);
      p(5, 11, 1, 4, '#7c5c3c');
      mosaic(p, 10, 17, 2, 2, L);
      return;
    }
    if (L.top === 'jersey') { p(9, 11, 1, 7, L.stripe); p(10, 19, 1, 3, L.stripe); }
    if (L.top === 'apron') { p(4, 13, 2, 7, L.apronCol); p(10, 12, 1, 1, L.apronCol); }
    if (L.top === 'uniform') p(5, 17, 6, 1, '#141018');
    if (L.top === 'suit') { p(4, 11, 2, 2, P.white); p(4, 12, 1, 3, L.tie || P.red); }
    if (L.top === 'host') {
      p(5, 11, 1, L.open ? 6 : 3, L.shirt);
      if (!L.open) p(5, 11, 1, 1, sk);
      p(6, 12, 1, 4, shade(L.topCol, L.topCol === '#ececf4' ? -0.25 : 0.25));
    }
    if (L.mark === 'otoko') { p(5, 12, 1, 3, P.red); }
    if (L.mark === 'tag') p(5, 13, 1, 2, P.white);
    if (L.armband) p(7, 13, 2, 2, L.armband);
  }

  function drawPerson(L, dir, fr, naked) {
    const c = mk(SW, SH);
    const { p } = painter(c);
    if (dir === 'up') {
      bodyFrontBack(p, L, fr, naked, true);
      p(6, 10, 4, 1, L.skin);
      p(3, 7, 1, 2, L.skin); p(12, 7, 1, 2, L.skin);
      hairBack(p, L);
      if (L.hat) hatBack(p, L);
    } else if (dir === 'left' || dir === 'right') {
      // 後ろの髪 → 顔 → 体の順
      bodySide(p, L, fr, naked);
      faceSide(p, L);
      hairSide(p, L);
      if (L.hat) hatSide(p, L);
    } else {
      // 長い髪は肩の後ろに流れる
      bodyFrontBack(p, L, fr, naked, false);
      faceFront(p, L);
      hairFront(p, L);
      if (L.hat) hatFront(p, L);
    }
    outline(c);
    if (dir === 'right') {
      const f = mk(SW, SH);
      const fx = f.getContext('2d');
      fx.translate(SW, 0);
      fx.scale(-1, 1);
      fx.drawImage(c, 0, 0);
      return f;
    }
    return c;
  }

  const cache = new Map();
  OTK.person = function (kind, o) {
    o = o || {};
    const dir = ['up', 'down', 'left', 'right'].includes(o.dir) ? o.dir : 'down';
    const fr = o.frame ? 1 : 0;
    const v = o.variant | 0;
    const key = kind + '|' + dir + '|' + fr + '|' + (o.naked ? 1 : 0) + '|' + v;
    let c = cache.get(key);
    if (!c) {
      c = drawPerson(lookOf(kind, v), dir, fr, !!o.naked);
      cache.set(key, c);
    }
    return c;
  };
  OTK.person.W = SW;
  OTK.person.H = SH;
  OTK.person.KINDS = Object.keys(KINDS);

  // ── 顔（32×32）：会話の場面用 ───────────────────────────
  // mood: 'normal' | 'happy' | 'sad' | 'angry' | 'shock'
  function drawPortrait(L, mood) {
    const c = mk(32, 32);
    const { p } = painter(c);
    const sk = L.skin, hc = L.hair;
    // 肩
    p(4, 27, 24, 5, L.kind === 'otoko' ? P.white : L.topCol || '#7c7c7c');
    if (L.top === 'suit') { p(13, 27, 6, 5, P.white); p(15, 28, 2, 4, L.tie || P.red); }
    if (L.top === 'host') {
      const lap = shade(L.topCol, L.topCol === '#ececf4' ? -0.25 : 0.25);
      if (L.open) { p(11, 27, 10, 5, L.shirt); p(10, 27, 1, 5, lap); p(21, 27, 1, 5, lap); }
      else {
        p(12, 27, 8, 2, L.shirt); p(13, 29, 6, 2, L.shirt); p(14, 31, 4, 1, L.shirt);
        p(14, 27, 4, 2, L.skinS);
        p(11, 27, 1, 3, lap); p(20, 27, 1, 3, lap); p(12, 29, 1, 3, lap); p(19, 29, 1, 3, lap);
        if (L.chain) p(14, 29, 4, 1, '#f8d030');
      }
    }
    if (L.top === 'jersey') { p(11, 27, 2, 5, L.stripe); p(19, 27, 2, 5, L.stripe); }
    if (L.top === 'apron') { p(10, 28, 12, 4, L.apronCol); }
    if (L.mark === 'otoko') { p(14, 28, 5, 1, P.red); p(14, 29, 1, 1, P.red); p(16, 29, 1, 1, P.red); p(18, 29, 1, 1, P.red); p(14, 30, 5, 1, P.red); p(15, 31, 3, 1, P.red); }
    // 首と顔
    p(13, 24, 6, 4, L.skinS);
    p(9, 9, 14, 2, sk);
    p(8, 11, 16, 9, sk);
    p(9, 20, 14, 2, sk);
    p(10, 22, 12, 1, sk);
    p(12, 23, 8, 1, sk);
    p(6, 14, 2, 4, sk); p(24, 14, 2, 4, sk); // 耳
    p(7, 15, 1, 2, L.skinS); p(24, 15, 1, 2, L.skinS);
    // 髪
    const s = L.hs;
    if (s === 'bald') { p(7, 12, 2, 4, hc); p(23, 12, 2, 4, hc); p(12, 6, 4, 1, shade(sk, 0.3)); p(9, 6, 14, 3, sk); p(8, 9, 1, 2, sk); }
    else if (s === 'perm') {
      for (let i = 0; i < 6; i++) p(5 + i * 4, 3 + (i % 2), 4, 4, hc);
      p(5, 5, 22, 6, hc); p(4, 8, 4, 10, hc); p(24, 8, 4, 10, hc);
    } else {
      p(10, 3, 12, 2, hc); p(8, 5, 16, 3, hc); p(7, 8, 18, 3, hc);
      p(7, 11, 2, 4, hc); p(23, 11, 2, 4, hc);
      if (s === 'spiky') { p(9, 1, 2, 3, hc); p(14, 0, 3, 3, hc); p(20, 1, 2, 3, hc); p(6, 6, 2, 3, hc); p(24, 6, 2, 3, hc); p(10, 11, 3, 1, hc); p(18, 11, 2, 1, hc); }
      if (s === 'mash') p(8, 11, 16, 2, hc);
      if (s === 'buzz') { p(10, 3, 12, 8, shade(hc, 0.15)); p(8, 6, 16, 5, shade(hc, 0.15)); p(7, 11, 2, 4, sk); p(23, 11, 2, 4, sk); }
      if (s === 'long') { p(5, 9, 4, 18, hc); p(23, 9, 4, 18, hc); }
      if (s === 'bob') { p(5, 9, 4, 13, hc); p(23, 9, 4, 13, hc); }
      if (s === 'pony') { p(25, 6, 4, 10, hc); }
      if (s === 'mullet') { p(22, 14, 4, 10, hc); }
      if (s === 'host') {
        // 盛り髪：上にボリューム、前髪を横に流し、右のサイドは長め
        p(11, 1, 10, 1, hc); p(9, 2, 14, 1, hc); p(6, 5, 20, 3, hc);
        p(9, 11, 9, 1, hc); p(9, 12, 5, 1, hc);
        p(23, 11, 3, 9, hc); p(24, 20, 2, 2, hc);
        p(13, 1, 4, 1, L.hairHi); p(19, 3, 3, 1, L.hairHi); p(8, 7, 2, 2, L.hairHi); p(11, 11, 4, 1, L.hairHi);
      }
      if (s !== 'buzz') { p(11, 4, 4, 1, L.hairHi); p(9, 6, 3, 1, L.hairHi); }
    }
    // 帽子
    const hc2 = L.hatCol;
    if (L.hat === 'band') {
      p(7, 9, 18, 3, hc2);
      p(14, 9, 4, 3, P.white);
      p(15, 10, 2, 1, P.red);
      p(25, 7, 2, 2, hc2); p(27, 5, 2, 2, hc2); p(25, 11, 2, 2, hc2); p(27, 13, 2, 2, hc2);
    } else if (L.hat === 'cap') {
      p(8, 2, 16, 8, hc2); p(6, 10, 20, 2, shade(hc2, -0.35)); p(14, 4, 4, 3, P.white);
    } else if (L.hat === 'police' || L.hat === 'station') {
      p(5, 1, 22, 7, hc2); p(7, 8, 18, 2, L.hat === 'police' ? '#141018' : P.yellow); p(7, 10, 18, 2, '#141018'); p(14, 2, 4, 4, P.yellow);
    } else if (L.hat === 'kerchief') {
      p(7, 3, 18, 6, hc2);
    }
    // 目・まゆ・口
    const eye = L.zombie ? P.red : EYE;
    if (L.sunglasses && mood !== 'shock') {
      p(9, 14, 6, 3, '#141018'); p(17, 14, 6, 3, '#141018'); p(15, 14, 2, 1, '#141018');
      p(10, 14, 2, 1, '#5c6c8c'); p(18, 14, 2, 1, '#5c6c8c');
    } else if (mood === 'happy') {
      p(10, 15, 1, 1, eye); p(11, 14, 2, 1, eye); p(13, 15, 1, 1, eye);
      p(18, 15, 1, 1, eye); p(19, 14, 2, 1, eye); p(21, 15, 1, 1, eye);
    } else if (mood === 'shock') {
      p(10, 13, 4, 4, P.white); p(18, 13, 4, 4, P.white); p(11, 14, 2, 2, eye); p(19, 14, 2, 2, eye);
    } else {
      p(11, 14, 2, 3, eye); p(19, 14, 2, 3, eye);
      p(11, 14, 1, 1, P.white); p(19, 14, 1, 1, P.white);
      if (L.lashes) { p(10, 13, 4, 1, EYE); p(18, 13, 4, 1, EYE); }
    }
    if (L.glasses) { p(9, 13, 6, 1, '#5c5c6c'); p(17, 13, 6, 1, '#5c5c6c'); p(9, 17, 6, 1, '#5c5c6c'); p(17, 17, 6, 1, '#5c5c6c'); p(15, 14, 2, 1, '#5c5c6c'); }
    const bc = L.brows ? hc : shade(hc, 0.2);
    if (mood === 'angry') { p(10, 11, 2, 1, bc); p(12, 12, 2, 1, bc); p(20, 11, 2, 1, bc); p(18, 12, 2, 1, bc); }
    else if (mood === 'sad') { p(12, 11, 2, 1, bc); p(10, 12, 2, 1, bc); p(18, 11, 2, 1, bc); p(20, 12, 2, 1, bc); }
    else if (L.brows) { p(10, 12, 4, 1, bc); p(18, 12, 4, 1, bc); }
    p(15, 17, 2, 2, L.skinS); // 鼻
    if (L.blush) { p(9, 18, 3, 1, '#f08888'); p(20, 18, 3, 1, '#f08888'); }
    if (L.beard) { p(10, 20, 12, 3, shade(sk, -0.3)); }
    if (mood === 'happy') { p(13, 20, 6, 2, MOUTH); p(14, 20, 4, 1, P.white); p(14, 22, 4, 1, MOUTH); }
    else if (mood === 'sad') { p(14, 21, 4, 1, MOUTH); p(13, 22, 1, 1, MOUTH); p(18, 22, 1, 1, MOUTH); }
    else if (mood === 'angry') { p(13, 21, 6, 1, MOUTH); p(13, 20, 1, 1, MOUTH); p(18, 20, 1, 1, MOUTH); }
    else if (mood === 'shock' || L.zombie) { p(14, 20, 4, 3, '#401010'); }
    else p(14, 21, 4, 1, MOUTH);
    outline(c);
    return c;
  }
  const pcache = new Map();
  OTK.portrait = function (kind, o) {
    o = o || {};
    const v = o.variant | 0;
    const mood = o.mood || 'normal';
    const key = kind + '|' + v + '|' + mood;
    let c = pcache.get(key);
    if (!c) {
      c = drawPortrait(lookOf(kind, v), mood);
      pcache.set(key, c);
    }
    return c;
  };
})();
