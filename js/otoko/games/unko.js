/*
 * 3月 追いコン「うんこをよけろ」 ― 寮までの最後のひと走り。先輩たちが投げてくるうんこを、よけきって寮へ飛びこめ
 *  「全裸で切符」のつづき。切符を買って、夜の川ぞいの道まで帰ってきた男魂くん（全裸のまま）を、
 *  待ちぶせしていた卒業する先輩たちが追いかけてくる。男魂くんは画面の上（寮のほう）へ走る（道は自動で流れる）。
 *  うしろ（画面の下）から、うんこが飛んでくる。落ちる所には地面に影が出て、落ちる直前ほど大きく濃くなる。十字キーで上下左右に動いてよける。
 *  当たったらしっぱい。30秒にげきると、寮の玄関が見えてきて、中へ飛びこんでクリア。
 *  時間がたつほど投げる数がふえ、ときどき速い「金のうんこ」が来る。
 *  スマホは十字キーのほか、画面をおさえた所へ走っていく。
 */
(function () {
  'use strict';

  // ── 道（画面は 256×224。上の 12 ドットはエンジンの帯） ─────────────────
  const SCROLL = 64; // 道が流れる速さ（ドット/秒）
  const SPEED = 94; // 男魂くんが動く速さ（ドット/秒）
  const AREA = { x0: 66, x1: 190, y0: 98, y1: 166 }; // 男魂くんの足もとが動ける範囲
  const PATH_L = 54, PATH_R = 202; // 道の左右のはし
  const RIVER = 34; // 川の右はし
  const SENPAI_Y = [208, 213, 206]; // 先輩たちの足もと
  const SENPAI_X = [86, 128, 170]; // 先輩たちのいつもの場所
  const HIT_X = 12, HIT_Y = 7; // 当たりの大きさ（足もとどうしのだ円）
  const WIND = 0.3; // うんこをふりかぶる時間
  const GOLD_WIND = 0.6, GOLD_FLY = 0.62; // 金のうんこ（ふりかぶりが長いぶん、飛ぶのが速い）
  const PILE_T = 0.9; // 落ちたうんこが消えるまで

  // うんこの絵（14×12）。k ふち、m 地、h つや、d かげ、w 白目、e 黒目
  const UNKO_ART = [
    '......kk......',
    '.....kmmk.....',
    '......khmk....',
    '....kkkmmmk...',
    '...kmhhmmmmk..',
    '...kmmmmmmdk..',
    '..kkkkkkkkkkk.',
    '.kmhhmmmmmmmdk',
    'kmhwemmmmwemdk',
    'kmmmmmmmmmmddk',
    '.kddddddddddk.',
    '..kkkkkkkkkk..',
  ];
  const UNKO_COL = { k: '#2c1400', m: '#8c4c14', h: '#c88c50', d: '#5c3008', w: '#fcfcfc', e: '#141018' };
  const GOLD_COL = { k: '#7c3c00', m: '#f8b800', h: '#fcf0a0', d: '#e45c10', w: '#fcfcfc', e: '#141018' };
  const arts = {};
  function art(gold) {
    const key = gold ? 'gold' : 'plain';
    if (arts[key]) return arts[key];
    const cols = gold ? GOLD_COL : UNKO_COL;
    const c = OTK.makeCanvas(UNKO_ART[0].length, UNKO_ART.length);
    const x2 = c.getContext('2d');
    UNKO_ART.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = cols[row[x]];
        if (!col) continue;
        x2.fillStyle = col;
        x2.fillRect(x, y, 1, 1);
      }
    });
    arts[key] = c;
    return c;
  }

  // 飾り（木・石・草）の場所を決める、毎回同じになる乱数
  function hash(k, s) {
    let h = (Math.imul(k | 0, 374761393) + Math.imul(s | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  OTK.register({
    id: 'unko',
    order: 10,
    month: 3,
    event: '追いコン',
    title: 'うんこをよけろ',
    goal: 'うんこを\nよけろ！',
    howto: ['十字キー：にげる', '影が出た所に落ちてくる', '30秒にげきれば寮に着く'],
    note: 'うんこは（たぶん）おもちゃです。',
    time: 30,
    timeout: 'win',
    timeoutMsg: '寮ににげきった！\n先輩方、ご卒業\nおめでとうございます！',
    bgm: 'tense',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      const easy = api.tries >= 2; // 2 回しっぱいしたら、影を長めに出して、投げる間をあける
      const T = () => api.time;
      const flyTime = (t) => api.lerp(1.2, 0.92, Math.min(1, t / 28)) + (easy ? 0.15 : 0);
      const gap = (t) => api.lerp(1.3, 0.68, Math.min(1, t / 26)) + (easy ? 0.18 : 0);

      const me = { x: 128, y: 140, vx: 0, vy: 0, run: 0, face: 'up', hit: false, hitT: 0, hitBy: null, safe: false };
      const senpais = SENPAI_X.map((x, i) => ({ x, y: SENPAI_Y[i], v: [0, 3, 5][i], run: i * 0.3, wind: 0, windDur: 0, gold: false, fall: 0 }));
      const volleys = []; // ふりかぶっている投げ（まだ手に持っている）
      const poops = []; // 飛んでいる・落ちたうんこ
      const fx = []; // 「ボトッ」などの文字
      const petals = []; // 舞う花びら
      let scroll = 0, speed = SCROLL;
      let nextT = 1.1;
      let thrown = 0, dodged = 0, goldN = 0;
      const golds = [api.rnd(9.2, 10.4), api.rnd(16.8, 18), api.rnd(23.4, 24.6)];
      let say = null; // 先輩の吹き出し { who, str, t }
      let gateY = null; // 寮の門の線（画面の y）。最後の 1.6 秒で見えてくる
      let inT = 0; // 玄関に入ってからの時間
      let greeted = false;
      const GATE_T = 28.4, GATE_Y = 92;
      // はじめに、先輩たちが下から飛び出してくる（待ちぶせ）
      const rise = (i) => (api.time < 0.7 ? Math.round(((0.7 - api.time) / 0.7) * (40 + i * 6)) : 0);

      function talk(who, str, sec) { say = { who, str, t: sec || 1.2 }; }
      function pop(str, x, y, col, sec, size) { fx.push({ str, x, y, col: col || P.white, t: 0, dur: sec || 0.7, size: size || 12 }); }
      const clampX = (x) => api.clamp(x, AREA.x0, AREA.x1);
      const clampY = (y) => api.clamp(y, AREA.y0, AREA.y1);
      const freeSenpais = () => senpais.map((s, i) => i).filter((i) => senpais[i].wind <= 0);

      // ── 投げる ──
      // kind：aim ねらう／lead 動く先をねらう／pair 2 つ／trio 3 つならび／rain ばらばら／gold 金のうんこ
      function startVolley(kind) {
        const free = freeSenpais();
        if (!free.length) return false;
        const want = kind === 'trio' || kind === 'rain' ? 3 : kind === 'pair' ? 2 : 1;
        // ねらう所に近い先輩から
        const who = free.sort((a, b) => Math.abs(senpais[a].x - me.x) - Math.abs(senpais[b].x - me.x)).slice(0, want);
        const gold = kind === 'gold';
        const wind = gold ? GOLD_WIND : WIND;
        who.forEach((i) => { senpais[i].wind = wind; senpais[i].windDur = wind; senpais[i].gold = gold; });
        volleys.push({ kind, who, t: 0, wind, fly: gold ? GOLD_FLY : flyTime(T()) });
        if (gold) {
          goldN++;
          api.sfx('power');
          talk(who[0], '金だ！', 1.0);
        } else if (api.chance(0.3)) {
          talk(who[0], api.pick(['まてー！', '受けとれ！', '卒業記念だ！', 'にげるな！', 'おみやげだ！']), 1.0);
        }
        return true;
      }
      // 手からはなす。ねらう所はこの時に決める
      function release(v) {
        const n = v.who.length;
        let targets;
        const jit = () => api.rnd(-6, 6);
        if (v.kind === 'lead') {
          targets = [[clampX(me.x + me.vx * v.fly * 0.55 + jit()), clampY(me.y + me.vy * v.fly * 0.55 + jit())]];
        } else if (v.kind === 'pair') {
          const side = me.x < 92 ? 1 : me.x > 164 ? -1 : api.chance(0.5) ? 1 : -1;
          targets = [[clampX(me.x + jit()), clampY(me.y + jit())], [clampX(me.x + side * api.rnd(30, 40)), clampY(me.y + api.rnd(-16, 16))]];
        } else if (v.kind === 'trio') {
          const cx = api.clamp(me.x, AREA.x0 + 36, AREA.x1 - 36), y = clampY(me.y + api.rnd(-6, 6));
          targets = [-36, 0, 36].map((d) => [cx + d, clampY(y + api.rnd(-5, 5))]);
        } else if (v.kind === 'rain') {
          targets = [[clampX(me.x + jit()), clampY(me.y + jit())]];
          for (let k = 1; k < n; k++) targets.push([api.rnd(AREA.x0, AREA.x1), api.rnd(AREA.y0, AREA.y1)]);
        } else {
          targets = [[clampX(me.x + jit() * 0.5), clampY(me.y + jit() * 0.5)]];
        }
        targets = targets.slice(0, n).sort((a, b) => a[0] - b[0]);
        const who = v.who.slice().sort((a, b) => senpais[a].x - senpais[b].x);
        targets.forEach(([tx, ty], k) => {
          const s = senpais[who[k % who.length]];
          s.wind = 0;
          poops.push({ sx: s.x + 8, sy: s.y, tx, ty, t: 0, dur: v.fly, gold: v.kind === 'gold', landed: false, pileT: 0, spin: api.rnd(0, 1) });
          thrown++;
        });
        api.sfx('throw');
      }
      function land(p) {
        p.landed = true;
        const dx = (me.x - p.tx) / HIT_X, dy = (me.y - p.ty) / HIT_Y;
        if (!api.ended && !me.hit && dx * dx + dy * dy < 1) {
          me.hit = true;
          me.hitT = 0;
          me.hitBy = { tx: p.tx, ty: p.ty, x: me.x, y: me.y, gold: p.gold };
          p.onHead = true;
          api.sfx('splat');
          api.shake(3, 0.35);
          api.flash(p.gold ? P.yellow : P.white, 0.15);
          pop('ベチャッ！', me.x, me.y - 50, p.gold ? P.yellow : P.lorange, 1.6, 16);
          talk(1, 'ギャハハ！', 1.8);
          api.lose(p.gold ? '金のうんこが命中！\nありがたいけど\nうれしくない…' : 'うんこが命中！\n追いコンの主役は\n男魂くんになった。', { wait: 1.4 });
          return;
        }
        if (api.ended) return; // 終わったあとに落ちたものは、音も文字も出さない（クリアの音にかぶるので）
        dodged++;
        api.sfx('hit');
        // 文字は、男魂くんやほかの文字に重ならないときだけ
        const far = api.dist(p.tx, p.ty, me.x, me.y) > 30 && !fx.some((e) => api.dist(e.x, e.y, p.tx, p.ty - 16) < 40);
        if (p.gold || far) pop(p.gold ? 'キラーン' : 'ボトッ', p.tx, p.ty - 16, p.gold ? P.yellow : P.cream, 0.5);
      }

      // ── 描く道具 ──
      function bubble(g, str, cx, by) {
        const w = g.measure(str, 12) + 8;
        const x = Math.round(api.clamp(cx - w / 2, 2, W - w - 2)), y = Math.round(by - 15);
        g.R(x - 1, y, w + 2, 14, P.black);
        g.R(x, y - 1, w, 16, P.black);
        g.R(x, y, w, 14, P.white);
        g.R(Math.round(cx) - 1, y + 14, 3, 2, P.white);
        g.R(Math.round(cx) - 2, y + 14, 1, 2, P.black);
        g.R(Math.round(cx) + 2, y + 14, 1, 2, P.black);
        g.R(Math.round(cx), y + 16, 1, 1, P.black);
        g.text(str, x + 4, y + 1, { size: 12, col: P.ink });
      }
      function star(g, x, y, col, big) {
        x = Math.round(x);
        y = Math.round(y);
        const r = big ? 3 : 2;
        g.R(x, y - r, 1, r * 2 + 1, col);
        g.R(x - r, y, r * 2 + 1, 1, col);
        g.R(x - 1, y - 1, 3, 3, col);
      }
      function tree(g, x, y, k) {
        // 桜（咲きはじめ）
        g.R(x - 2, y - 12, 4, 12, P.dbrown);
        g.R(x - 1, y - 12, 1, 12, P.brown);
        g.shadow(x, y, 9);
        g.disc(x, y - 22, 14, '#a85878'); // 夜桜
        g.disc(x - 6, y - 26, 8, '#d888a8');
        g.disc(x + 5, y - 18, 7, '#c87098');
        for (let i = 0; i < 9; i++) {
          const a = hash(k, i) * Math.PI * 2, r = 4 + hash(k, i + 20) * 9;
          g.R(x + Math.cos(a) * r, y - 22 + Math.sin(a) * r * 0.8, 1, 1, i % 3 ? '#f8d0e0' : P.white);
        }
      }
      function lamp(g, x, y) {
        // 街灯の光だまり（道の上）
        g.ctx.save();
        g.ctx.globalAlpha = 0.16;
        g.oval(x - 34, y + 4, 40, 16, P.lyellow);
        g.ctx.restore();
        g.shadow(x, y, 4);
        g.R(x - 1, y - 30, 3, 30, P.dgray);
        g.R(x, y - 30, 1, 30, P.gray);
        g.R(x - 4, y - 34, 9, 4, P.xdgray);
        g.R(x - 3, y - 31, 7, 2, P.lyellow);
      }
      function bench(g, x, y) {
        g.shadow(x + 9, y + 1, 10);
        g.R(x, y - 10, 18, 3, P.tan);
        g.R(x, y - 6, 18, 2, P.brown);
        g.R(x + 1, y - 4, 2, 4, P.xdgray);
        g.R(x + 15, y - 4, 2, 4, P.xdgray);
      }
      function drawDorm(g, gy) {
        // ゴールの夕照寮（gy：門の線）。玄関に明かり
        const top = 12, bot = gy - 14, L = RIVER + 10, R = W - 14;
        if (bot > top) {
          g.R(L, top, R - L, bot - top, P.ink);
          g.R(L + 2, top, R - L - 4, bot - top - 1, '#9c9ca4');
          for (let f = 0; f < 3; f++) {
            for (let i = 0; i < 8; i++) {
              const wx = L + 8 + i * 22, wy = bot - 26 - f * 20;
              if (wy < top - 10) continue;
              if (f === 0 && i >= 1 && i <= 4) continue; // 表札と玄関
              const lit = hash(i, f + 7) < 0.6;
              g.R(wx, wy, 14, 11, P.ink);
              g.R(wx + 1, wy + 1, 12, 9, lit ? '#f8d878' : '#1c2448');
            }
          }
          // 表札と玄関（明るい）
          g.R(56, bot - 30, 52, 20, P.ink);
          g.R(57, bot - 29, 50, 18, P.cream);
          g.text('夕照寮', 82, bot - 29, { align: 'center', col: P.ink });
          g.R(112, bot - 28, 32, 28, P.ink);
          g.R(114, bot - 26, 28, 26, '#f8e0a0');
          g.R(127, bot - 26, 2, 26, '#c8a060');
          g.R(108, bot - 31, 40, 3, '#5c5c68');
        }
        // 塀と門
        g.R(L, gy - 14, R - L, 14, '#5c5c64');
        g.R(L, gy - 14, 100 - L, 10, '#7c786c');
        g.R(156, gy - 14, R - 156, 10, '#7c786c');
        g.R(L, gy - 14, 100 - L, 2, '#a8a49c');
        g.R(156, gy - 14, R - 156, 2, '#a8a49c');
        g.R(92, gy - 24, 8, 22, P.lgray);
        g.R(156, gy - 24, 8, 22, P.lgray);
      }

      function drawGround(g) {
        const off = scroll;
        // 草（左右）。夜
        g.R(0, 12, W, H - 12, '#1c4c2c');
        // 草むら
        const S = 16;
        const base = Math.floor(off / S);
        for (let k = -1; k <= 14; k++) {
          const id = base - k;
          const y = k * S + (off % S) + 12;
          for (let i = 0; i < 3; i++) {
            const side = i < 1 ? [RIVER + 8, PATH_L - 4] : [PATH_R + 4, W - 4];
            const gx = side[0] + hash(id, i + 7) * (side[1] - side[0]);
            const gy = y + hash(id, i + 11) * S;
            g.R(gx, gy, 1, 2, '#2c6c3c');
            g.R(gx + 2, gy - 1, 1, 3, '#2c6c3c');
            if (hash(id, i + 31) < 0.15) g.R(gx + 1, gy - 2, 2, 2, i % 2 ? '#c8b860' : P.lgray); // 小さい花
          }
        }
        // 川
        g.R(0, 12, RIVER, H - 12, '#141c48');
        for (let k = -1; k <= 14; k++) {
          const id = base - k;
          const y = k * S + ((off * 1.25) % S) + 12;
          const rx = 3 + hash(id, 3) * (RIVER - 14);
          g.R(rx, y + hash(id, 4) * 10, 6 + hash(id, 5) * 5, 1, '#2c3c7c');
          if (hash(id, 6) < 0.5) g.R(rx + 9 - hash(id, 8) * 6, y + 6 + hash(id, 9) * 6, 3, 1, '#c8b860'); // 街灯がうつる
        }
        // 石の岸
        g.R(RIVER, 12, 6, H - 12, '#4c4c58');
        for (let k = -1; k <= 30; k++) {
          const y = k * 8 + (off % 8) + 12;
          g.R(RIVER, y, 6, 1, '#2c2c34');
          g.R(RIVER + ((k & 1) ? 3 : 1), y + 1, 1, 7, '#2c2c34');
          g.R(RIVER + 1, y + 2, 2, 1, '#6c6c78');
        }
        // 道
        g.R(PATH_L, 12, PATH_R - PATH_L, H - 12, '#a8946c');
        g.R(PATH_L, 12, 2, H - 12, '#7c6c4c');
        g.R(PATH_R - 2, 12, 2, H - 12, '#7c6c4c');
        for (let k = -1; k <= 14; k++) {
          const id = base - k;
          const y = k * S + (off % S) + 12;
          for (let i = 0; i < 4; i++) {
            const px = PATH_L + 6 + hash(id, i + 40) * (PATH_R - PATH_L - 12);
            const py = y + hash(id, i + 50) * S;
            g.R(px, py, 2, 1, '#8c7850');
            if (hash(id, i + 60) < 0.3) g.R(px + 1, py - 1, 1, 1, '#c8b48c');
          }
        }
        // 右がわの木と街灯・ベンチ（下へ流れる）
        const T2 = 64;
        const b2 = Math.floor(off / T2);
        for (let k = -1; k <= 5; k++) {
          const id = b2 - k;
          const y = k * T2 + (off % T2) + 40;
          const kind = ((id % 3) + 3) % 3;
          if (kind === 2) lamp(g, PATH_R + 10, y);
          else tree(g, PATH_R + 30 + (kind ? 6 : -2), y + 14, id);
          if (kind === 1 && hash(id, 2) < 0.6) bench(g, PATH_R + 6, y + 40);
        }
      }

      const sprOf = (kind, dir, run, v, naked) => {
        const f = Math.floor(run * 9) % 4;
        const side = dir === 'left' || dir === 'right';
        return { img: api.person(kind, { dir, frame: f % 2, variant: v, naked }), flip: !side && f >= 2 };
      };

      function drawMe(g) {
        if (me.hit) {
          // 頭にうんこ。星がまわる
          const x = me.hitBy.x, y = me.hitBy.y;
          const wob = me.hitT < 0.3 ? Math.round(Math.sin(me.hitT * 50) * 2) : 0;
          g.shadow(x, y, 7);
          g.sprite(api.person('otoko', { dir: 'down', naked: true }), x - 8 + wob, y - 24);
          g.sprite(art(me.hitBy.gold), x - 7 + wob, y - 33);
          for (let i = 0; i < 3; i++) {
            const a = api.time * 6 + (i * Math.PI * 2) / 3;
            star(g, x + Math.cos(a) * 13, y - 30 + Math.sin(a) * 5, i === 1 ? P.white : P.yellow, true);
          }
          return;
        }
        if (me.y < -30 || inT > 0.6) return;
        // 全裸（「全裸で切符」のつづき）。手には買ってきた切符
        const s = sprOf('otoko', me.face, me.run, 0, true);
        const bob = Math.floor(me.run * 9) % 2;
        g.shadow(me.x, me.y, 7);
        g.sprite(s.img, me.x - 8, me.y - 24 - bob, { flip: s.flip, alpha: 1 - inT / 0.6 });
        if (inT === 0) {
          const hx = me.face === 'left' ? me.x - 11 : me.x + 4;
          g.R(hx, me.y - 15 - bob, 7, 5, P.black);
          g.R(hx + 1, me.y - 14 - bob, 5, 3, '#f8e8c0');
        }
      }
      function drawSenpai(g, s, i) {
        const y = s.y + s.fall + rise(i);
        if (y - 24 > H) return;
        const sp = sprOf('senpai', 'up', s.run, s.v);
        g.shadow(s.x + 8, y, 7);
        g.sprite(sp.img, s.x, y - 24 - (Math.floor(s.run * 9 + i) % 2), { flip: sp.flip });
        if (s.wind > 0) {
          // ふりかぶって、うんこを頭の上に持つ
          const k = 1 - s.wind / Math.max(0.01, s.windDur);
          const up = Math.round(4 + k * 6);
          g.R(s.x + 3, y - 30 - up + 8, 2, up, P.skin);
          g.R(s.x + 11, y - 30 - up + 8, 2, up, P.skin);
          g.sprite(art(s.gold), s.x + 1, y - 34 - up, {});
          if (s.gold) {
            for (let n = 0; n < 4; n++) {
              const a = n * Math.PI / 2 + api.time * 8;
              star(g, s.x + 8 + Math.cos(a) * 12, y - 30 - up + Math.sin(a) * 8, n % 2 ? P.white : P.yellow);
            }
          }
        }
        // 息切れ（まん中の先輩の吹き出しに重ならないように、左右の先輩は外がわに出す）
        if (me.safe && s.fall > 4 && Math.floor(api.time * 2 + i * 0.7) % 2) g.text('ゼェ', s.x + 8 + (i - 1) * 8, y - 34, { size: 12, align: 'center', col: P.white, outline: P.black });
      }
      function drawPile(g, p) {
        // 落ちたうんこ：ぽよんとつぶれて、点滅して消える
        if (p.pileT > PILE_T - 0.35 && g.blink(10)) return;
        const sq = p.pileT < 0.12;
        const img = art(p.gold);
        g.shadow(p.tx, p.ty, 7);
        if (sq) g.ctx.drawImage(img, Math.round(p.tx - 9), Math.round(p.ty - 8), 18, 8);
        else g.sprite(img, p.tx - 7, p.ty - 11);
        if (p.pileT < 0.25) {
          const r = 6 + p.pileT * 40;
          g.R(p.tx - r, p.ty - 1, 2, 1, P.white);
          g.R(p.tx + r - 2, p.ty - 1, 2, 1, P.white);
          g.R(p.tx - r * 0.7, p.ty - 4, 1, 1, P.white);
          g.R(p.tx + r * 0.7, p.ty - 4, 1, 1, P.white);
        }
      }

      return {
        // テストで見るための中身
        me, senpais, poops, volleys,
        get thrown() { return thrown; },
        get dodged() { return dodged; },
        get goldN() { return goldN; },
        get scroll() { return scroll; },
        get gateY() { return gateY; }, // 寮の門の線（見えてくるまでは null）
        get inT() { return inT; }, // 玄関に入ってからの時間
        AREA, HIT_X, HIT_Y, SPEED,

        update(dt) {
          const t = T();
          const done = !!api.ended;
          // 道が流れる（当たったら止まる）
          speed = api.approach(speed, me.hit || (gateY != null && gateY >= GATE_Y) ? 0 : SCROLL, 160 * dt);
          scroll += speed * dt;
          // 男魂くん
          if (!done && !me.hit) {
            let { x: dx, y: dy } = api.input.dir();
            const pt = api.input.pointer;
            if (!dx && !dy && pt.down && pt.y > 12) {
              // 画面をおさえた所へ（指で男魂くんや影がかくれないように、指の少し上に来る）
              const ax = pt.x - me.x, ay = pt.y - 12 - me.y;
              if (Math.abs(ax) > 3) dx = Math.sign(ax);
              if (Math.abs(ay) > 3) dy = Math.sign(ay);
            }
            const n = dx && dy ? Math.SQRT1_2 : 1;
            me.vx = dx * SPEED * n;
            me.vy = dy * SPEED * n;
            me.x = clampX(me.x + me.vx * dt);
            me.y = clampY(me.y + me.vy * dt);
            me.face = dx < 0 ? 'left' : dx > 0 ? 'right' : 'up';
            me.run += dt * (dy > 0 ? 0.6 : dy < 0 ? 1.4 : 1);
          } else if (me.safe) {
            // にげきったら、寮の玄関へ走っていく（門のまん中まで寄ってから、中へ）
            me.vx = 0;
            const gy = gateY == null ? 0 : gateY;
            me.x = api.approach(me.x, 128, 70 * dt);
            me.y = api.approach(me.y, Math.abs(me.x - 128) > 24 ? gy + 6 : gy - 16, 80 * dt);
            me.face = 'up';
            me.run += dt * 1.4;
          } else {
            me.vx = me.vy = 0;
          }
          if (me.hit) me.hitT += dt;
          // 寮が見えてくる（門の線が画面の上から下りてきて、y 92 で止まる）
          if (gateY == null && t >= GATE_T && !me.hit) gateY = -12;
          if (gateY != null) gateY = Math.min(GATE_Y, gateY + speed * dt);
          if (me.safe && gateY != null && gateY >= GATE_Y && Math.abs(me.x - 128) < 1 && me.y <= gateY - 15) inT += dt;

          // 先輩たち：男魂くんの左右に合わせて少しずつ動く
          const shift = (me.x - 128) * 0.45;
          senpais.forEach((s, i) => {
            const want = api.clamp(SENPAI_X[i] + shift, PATH_L + 6, PATH_R - 22);
            if (!me.safe && !me.hit) s.x = api.approach(s.x, want, 42 * dt);
            if (me.safe) s.fall += dt * (26 + i * 6); // 息が切れて、おくれていく
            s.run += dt * (me.hit ? 0 : me.safe ? 0.5 : 1);
          });

          // 待ちぶせの先輩たち
          if (!greeted && t > 0.15) {
            greeted = true;
            talk(1, 'おかえり〜！', 1.2);
          }
          // 投げる予定
          if (!done && !me.hit) {
            if (golds.length && t >= golds[0]) {
              if (startVolley('gold')) { golds.shift(); nextT = Math.max(nextT, t + 1.0); }
            } else if (t >= nextT) {
              let kind = 'aim';
              if (t >= 22) kind = api.pick(['trio', 'rain', 'pair', 'lead', 'trio']);
              else if (t >= 14.5) kind = api.pick(['pair', 'trio', 'lead', 'rain', 'aim']);
              else if (t >= 6.5) kind = api.pick(['aim', 'pair', 'lead', 'aim']);
              if (easy && kind === 'trio') kind = 'pair';
              if (startVolley(kind)) nextT = t + gap(t) * (kind === 'trio' || kind === 'rain' ? 1.3 : 1);
            }
          }
          for (let i = volleys.length - 1; i >= 0; i--) {
            const v = volleys[i];
            v.t += dt;
            v.who.forEach((k) => { senpais[k].wind = Math.max(0.001, v.wind - v.t); });
            if (v.t >= v.wind) {
              volleys.splice(i, 1);
              if (!done && !me.hit) release(v);
              else v.who.forEach((k) => { senpais[k].wind = 0; });
            }
          }
          // うんこ
          for (let i = poops.length - 1; i >= 0; i--) {
            const p = poops[i];
            if (!p.landed) {
              p.t += dt;
              if (p.t >= p.dur) land(p);
            } else if (!p.onHead) {
              p.pileT += dt;
              p.ty += speed * dt; // 地面といっしょに流れる
              if (p.pileT > PILE_T) poops.splice(i, 1);
            }
          }
          // 文字・吹き出し・花びら
          for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > fx[i].dur) fx.splice(i, 1); }
          if (say) { say.t -= dt; if (say.t <= 0) say = null; }
          if (api.chance(dt * 3)) petals.push({ x: api.rnd(PATH_R - 20, W + 10), y: api.rnd(12, 120), vx: api.rnd(-22, -10), vy: api.rnd(14, 26), ph: api.rnd(0, 6) });
          for (let i = petals.length - 1; i >= 0; i--) {
            const q = petals[i];
            q.x += q.vx * dt;
            q.y += (q.vy + speed * 0.5) * dt;
            q.ph += dt * 5;
            if (q.y > H || q.x < PATH_L) petals.splice(i, 1);
          }
        },

        // 時間切れ ＝ にげきった
        timeup() {
          if (api.ended || me.hit) return;
          me.safe = true;
          talk(1, '弾切れだ…', 1.6);
          api.sfx('fanfare');
          api.win(api.def.timeoutMsg, { wait: 2.2 });
        },

        draw(g) {
          drawGround(g);
          // ゴールの寮
          if (gateY != null) drawDorm(g, gateY);

          // 地面の影（落ちる所）。落ちる直前ほど大きく濃い
          poops.forEach((p) => {
            if (p.landed) return;
            const k = Math.min(1, p.t / p.dur);
            const rx = 4 + 7 * k, ry = Math.max(2, rx * 0.5);
            g.ctx.save();
            g.ctx.globalAlpha = 0.3 + 0.4 * k;
            g.oval(p.tx, p.ty, rx, ry, p.gold ? P.dbrown : P.black);
            g.ctx.restore();
            if (k > 0.55 && g.blink(8)) {
              g.ctx.save();
              g.ctx.globalAlpha = 0.8;
              g.oval(p.tx, p.ty, 1, 1, p.gold ? P.yellow : P.dred);
              g.ctx.restore();
            }
            if (p.gold) {
              // 金のうんこの影はキラキラする
              for (let i = 0; i < 4; i++) {
                const a = i * Math.PI / 2 + api.time * 4;
                g.R(p.tx + Math.cos(a) * (rx + 3), p.ty + Math.sin(a) * (ry + 2), 1, 1, P.yellow);
              }
            }
          });

          // 人と、落ちたうんこを、足もとの順に描く
          const list = [];
          list.push({ y: me.y, f: () => drawMe(g) });
          senpais.forEach((s, i) => list.push({ y: s.y + s.fall, f: () => drawSenpai(g, s, i) }));
          poops.forEach((p) => { if (p.landed && !p.onHead) list.push({ y: p.ty, f: () => drawPile(g, p) }); });
          list.sort((a, b) => a.y - b.y).forEach((o) => o.f());

          // 影が人にかくれても分かるように、落ちる所のふちを上から点線で描く
          poops.forEach((p) => {
            if (p.landed) return;
            const k = Math.min(1, p.t / p.dur);
            const rx = 4 + 7 * k + 1, ry = Math.max(2, (4 + 7 * k) * 0.5) + 1;
            const col = p.gold ? P.yellow : k > 0.75 ? P.red : P.white;
            for (let i = 0; i < 16; i++) {
              if ((i + Math.floor(api.time * 12)) % 2) continue;
              const a = (i / 16) * Math.PI * 2;
              g.R(p.tx + Math.cos(a) * rx, p.ty + Math.sin(a) * ry, 1, 1, col);
            }
          });

          // 飛んでいるうんこ（山なり）
          poops.forEach((p) => {
            if (p.landed) return;
            const k = Math.min(1, p.t / p.dur);
            const d = api.dist(p.sx, p.sy, p.tx, p.ty);
            const peak = 34 + d * 0.35;
            const gx = api.lerp(p.sx, p.tx, k), gy = api.lerp(p.sy, p.ty, k);
            const h = 30 * (1 - k) + 4 * peak * k * (1 - k);
            const spin = Math.floor((p.t + p.spin) * 10) % 2 === 1;
            g.sprite(art(p.gold), gx - 7, gy - h - 11, { flip: spin });
            if (p.gold && g.blink(6)) star(g, gx + 8, gy - h - 12, P.white);
          });

          // 文字
          fx.forEach((e) => {
            const k = e.t / e.dur;
            g.text(e.str, e.x, e.y - k * 8, { size: e.size, align: 'center', col: e.col, outline: P.black });
          });
          // 吹き出し
          if (say) {
            const s = senpais[say.who];
            // うんこを頭の上に持っているときは、その上に出す。おくれて画面の外へ出ても、下のはしに残す
            bubble(g, say.str, s.x + 8, Math.min(H - 4, s.y + s.fall - (s.wind > 0 ? 50 : 26)));
          }
          // 花びら
          petals.forEach((q) => g.R(q.x + Math.sin(q.ph) * 2, q.y, 2, 1, Math.sin(q.ph) > 0 ? P.lpink : P.white));
          // 最初の 2 秒は、何をするか出す
          if (api.time < 2.2 && !api.ended) {
            g.text('影から にげろ！', W / 2, 44, { align: 'center', col: P.white, outline: P.black });
          }
        },
      };
    },
  });
})();
