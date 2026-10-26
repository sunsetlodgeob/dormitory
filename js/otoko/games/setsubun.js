/*
 * 2月 節分「節分ピラミッド」 ― 夜の寮の玄関前で、人間ピラミッド（4・3・2・1 の 10 人）を作る
 *  夕照寮の伝統で、ピラミッドは全員全裸（「男魂」の札とモザイクで隠す）。雪の夜なので、みんなふるえて白い息を吐く。
 *  下のゲージでマーカーが左右に動く。ゾーンに入ったときに A をおすと、次の人が玄関から出てきて上に乗る。
 *  ずれると、その人は転がり落ちる（ぐらぐらが少し増えて、少し待たされる）。
 *  寮の窓や左のほうから、豆・みかん・雑誌・スリッパ・まくらが飛んでくる。当たると「ぐらぐら」がたまる。
 *  B をおしている間はふんばる（当たってもあまりゆれない。そのかわり、のせられない）。ぐらぐらが満タンでくずれる。
 *  ときどき警察が来る（サイレン・赤い光・「！」）。すぐ ↓ で寮の中へ逃げる。行ってしまえば、続きから再開。
 *  10 人のったらクリア。てっぺんは男魂くん。
 */
(function () {
  'use strict';

  // ── 場所（画面は 256×224。上の 12 ドットはエンジンの帯） ──────────────
  const GROUND = 194; // ピラミッドの下の段の手が着く高さ
  const PX = 12; // 下の段の左はし
  const SP = 36; // となりの人との間（2 倍の絵で）
  const ROW_H = 24; // 段の高さ
  const FW = 22, FH = 16; // 四つんばいの絵の大きさ（1 倍）。手が着くのは FH の高さ
  const KH = FH + 3; // 四つんばいの絵の canvas の高さ（首から下げた札が、手の間に下がるぶん）
  const BLD_X = 172; // 寮の建物の左はし
  const DOOR = { x: 196, y: 128, w: 40, h: 66 }; // 玄関
  const WAIT = { x: 200, y: GROUND - 48 }; // 次の人が玄関で待つ所（2 倍の絵の左上）
  const WINDOWS = [{ x: 176, y: 30 }, { x: 216, y: 30 }, { x: 176, y: 74 }, { x: 216, y: 74 }]; // 36×28
  const BAR = { x: 48, y: 207, w: 160, h: 8 }; // タイミングのゲージ
  const ROWS = [4, 3, 2, 1];
  const SLOTS = []; // 10 人の場所（2 倍の絵の左上）。下の段の左から
  ROWS.forEach((n, r) => {
    for (let i = 0; i < n; i++) SLOTS.push({ r, x: PX + (i + r / 2) * SP, y: GROUND - FH * 2 - r * ROW_H });
  });
  const NEED = SLOTS.length;
  // のる順の寮生（てっぺんは男魂くん）。名前は出さない。全員、全裸
  const CREW = [
    { kind: 'senpai', v: 0 }, { kind: 'senpai', v: 4 }, { kind: 'senpai', v: 2 }, { kind: 'senpai', v: 5 },
    { kind: 'douki', v: 1 }, { kind: 'senpai', v: 3 }, { kind: 'douki', v: 2 },
    { kind: 'ichinen', v: 0 }, { kind: 'ichinen', v: 3 },
    { kind: 'otoko', v: 0 },
  ];
  // 飛んでくる物（dmg：当たったときのぐらぐら）
  const ITEMS = {
    mame: { name: '豆', dmg: 5, sfx: 'step', word: 'ペチ' },
    mikan: { name: 'みかん', dmg: 16, sfx: 'splat', word: 'ボコッ' },
    slipper: { name: 'スリッパ', dmg: 17, sfx: 'punch', word: 'スパーン' },
    zasshi: { name: '雑誌', dmg: 23, sfx: 'hit', word: 'バサッ' },
    makura: { name: 'まくら', dmg: 19, sfx: 'punch', word: 'ボフッ' },
  };
  const ITEM_KINDS = ['mame', 'mame', 'mikan', 'mikan', 'slipper', 'zasshi', 'makura'];
  const SHOUTS = ['鬼はー外！', 'えいっ', 'くらえ！', '鬼はー外！'];

  // ── 四つんばいの人の絵（正面から。頭は人物の絵から借りる。全裸） ────────────
  //  正面からは、肩・背中・腕と、首から下げた「男魂」の札だけが見える（はっきりした裸は描かない）
  const kcache = new Map();
  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
    return '#' + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
  }
  function pixel(c, x, y) {
    const d = c.getContext('2d').getImageData(x, y, 1, 1).data;
    return '#' + ((1 << 24) | (d[0] << 16) | (d[1] << 8) | d[2]).toString(16).slice(1);
  }
  function kneeler(api, m) {
    const key = m.kind + '|' + m.v;
    if (kcache.has(key)) return kcache.get(key);
    const src = api.person(m.kind, { dir: 'down', variant: m.v, naked: true });
    const skin = pixel(src, 4, 8);
    const skS = shade(skin, -0.18), skH = shade(skin, 0.3);
    const c = OTK.makeCanvas(FW, KH);
    const x2 = c.getContext('2d');
    const p = (x, y, w, h, col) => { x2.fillStyle = col; x2.fillRect(x, y, w, h); };
    // 背中（上から少し見える）と、腕。服はない
    p(2, 2, 18, 4, skin);
    p(3, 2, 16, 1, skH);
    p(0, 4, 4, 10, skin);
    p(18, 4, 4, 10, skin);
    p(0, 5, 1, 9, skS); // 腕の外がわのかげ
    p(21, 5, 1, 9, skS);
    p(1, 4, 2, 1, skH); // 肩
    p(19, 4, 2, 1, skH);
    p(0, 14, 5, 2, skin); // 手
    p(17, 14, 5, 2, skin);
    p(1, 14, 1, 1, skS); p(3, 14, 1, 1, skS); p(18, 14, 1, 1, skS); p(20, 14, 1, 1, skS); // 指
    // 胸の下（かげ）
    p(4, 11, 14, 5, '#2a2030');
    // 頭
    x2.drawImage(src, 0, 0, 16, 11, 3, 3, 16, 11);
    // 首から下げた「男魂」の札（手の間に下がる）
    p(7, 13, 1, 1, '#7c5c3c');
    p(14, 13, 1, 1, '#7c5c3c');
    const R = OTK.P.red;
    p(7, 14, 8, 5, '#fcfcfc');
    p(7, 18, 8, 1, '#d8d0c0');
    p(8, 15, 2, 3, R); p(9, 16, 1, 1, '#fcfcfc'); // 男
    p(11, 15, 3, 1, R); p(12, 16, 1, 2, R); p(11, 17, 1, 1, R); p(13, 17, 1, 1, R); // 魂
    // 鬼のツノ（カチューシャ）
    p(5, 1, 2, 3, '#f8d878');
    p(5, 0, 1, 1, '#f8d878');
    p(15, 1, 2, 3, '#f8d878');
    p(16, 0, 1, 1, '#f8d878');
    // ふちどり
    const img = x2.getImageData(0, 0, c.width, c.height);
    const d = img.data, w = c.width, h = c.height;
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
    const pts = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) pts.push([x, y]);
    x2.fillStyle = '#141018';
    pts.forEach(([x, y]) => x2.fillRect(x, y, 1, 1));
    kcache.set(key, c);
    return c;
  }

  OTK.register({
    id: 'setsubun',
    order: 8,
    month: 2,
    event: '節分',
    title: '節分ピラミッド',
    goal: '全裸で\n組みあげろ！',
    howto: ['A：ゾーンで次の人をのせる', 'B：おしている間ふんばる', '警察が来たら↓で中へ！'],
    note: '',
    time: 50,
    timeout: 'lose',
    timeoutMsg: '時間切れ。\n全裸は寒すぎた。\nみんな部屋に帰った。',
    bgm: 'tense',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      const easy = api.tries >= 2; // 2 回しっぱいしたら、少しやさしく
      const ALARM = easy ? 1.6 : 1.2; // 警察が来てから、逃げるまでの時間
      const imgs = CREW.map((m) => kneeler(api, m));

      let built = 0; // のった人数
      let wob = 0; // ぐらぐら（0〜100）
      let bracing = false;
      let state = 'build'; // build・police・collapse・done
      let act = null; // のぼっている・転がっている人 { type: 'climb'|'tumble', t, i（何人目か）, lx（転がって落ちる所） }
      // タイミングのゲージ
      const mk = { pos: 0.1, dir: 1 };
      let zone = { c: 0.5, w: 0.22 };
      let hint = 0; // 「B をはなして」の表示
      // 警察
      const policeAt = { n: api.irnd(4, 7), t: 30 };
      let police = null; // { s: 'alarm'|'hide'|'patrol'|'back'|'caught', t, carX, copX, copDir }
      let policeDone = false;
      // 投げる人・飛んでいる物・落ちた物
      let throwT = 2.4;
      const throwers = []; // 予告中・投げたあとの人 { src: 'win'|'left', w（窓）, sy, t, fireAt, item, fired, shout, v, kind }
      const flying = []; // { kind, sx, sy, tx, ty, T, t, h, slot, spin }
      const falling = []; // 当たって落ちていく物
      const litter = []; // 地面に落ちた物
      const pops = []; // 「ボコッ」など
      let bodies = null; // くずれたときの人
      let endT = 0;
      let shakeX = 0; // 当たったときの横ゆれ
      const stats = { hits: 0, braced: 0, miss: 0, throws: 0 };

      function sweep() {
        // マーカーが片道にかかる秒数。上の段ほど速い
        return (easy ? 0.95 : 0.85) - built * 0.025;
      }
      function newZone() {
        const w = (easy ? 0.27 : 0.22) - built * 0.01;
        zone = { c: api.rnd(0.25 + w / 2, 0.75 - w / 2), w };
      }
      newZone();
      const inZone = () => Math.abs(mk.pos - zone.c) <= zone.w / 2;
      function slotPos(i) {
        // ゆれ（上の段ほど大きい）
        const s = SLOTS[i];
        const amp = (wob / 100) * (bracing ? 0.4 : 1) * (s.r + 1) * 1.6;
        const sway = Math.sin(api.time * (5 + wob * 0.06)) * amp + shakeX * (s.r + 1) * 0.5;
        return { x: Math.round(s.x + sway), y: s.y };
      }
      function pop(x, y, str, col) {
        pops.push({ x, y, str, col: col || P.yellow, t: 0 });
      }
      // 全裸の人の絵。横向きの歩き（frame 1）は、半そでの人の肩に服の色が 2×2 ドット残るので、肌の色でぬりなおす
      const bcache = new Map();
      function bare(m, dir, frame) {
        const img = api.person(m.kind, { dir, frame, variant: m.v, naked: true });
        if (!frame || (dir !== 'left' && dir !== 'right')) return img;
        const key = m.kind + '|' + m.v + '|' + dir;
        if (!bcache.has(key)) {
          const c = OTK.makeCanvas(img.width, img.height);
          const x2 = c.getContext('2d');
          x2.drawImage(img, 0, 0);
          x2.fillStyle = pixel(img, dir === 'left' ? 7 : 8, 11); // 肩の肌
          x2.fillRect(dir === 'left' ? 6 : 8, 12, 2, 2);
          bcache.set(key, c);
        }
        return bcache.get(key);
      }
      // 寒さの見た目（ふるえ・白い息・雪）は時間だけで決める（乱数を使わないので、遊び方は変わらない）
      function shiver(i) {
        // ときどき 1 人ずつ、ブルブルッとふるえる（ふんばっている間は、ふるえない）
        if (bracing) return 0;
        return (api.time * 0.45 + i * 0.318) % 1 < 0.16 ? (Math.floor(api.time * 24) % 2 ? 1 : -1) : 0;
      }

      // ── のせる ──
      function tryBuild() {
        if (bracing) { hint = 0.8; api.sfx('cancel'); return; }
        if (inZone()) {
          act = { type: 'climb', t: 0, i: built };
          api.sfx('jump');
        } else {
          act = { type: 'tumble', t: 0, i: built, lx: Math.min(140, SLOTS[built].x + 44) };
          wob = Math.min(100, wob + 10);
          stats.miss++;
          api.sfx('ng');
        }
      }
      const CLIMB = 0.42, TUMBLE = 0.95;
      function updateAct(dt) {
        if (!act) return;
        act.t += dt;
        if (act.type === 'climb' && act.t >= CLIMB) {
          built++;
          act = null;
          api.sfx('stamp');
          shakeX = 1.5;
          const sp = slotPos(built - 1);
          pop(sp.x + 22, sp.y - 6, built >= NEED ? 'てっぺん！' : 'ガシッ', P.white);
          if (built >= NEED) complete();
          else newZone();
        } else if (act.type === 'tumble') {
          if (act.t > 0.4 && !act.landed) {
            act.landed = true;
            api.sfx('damage');
            api.shake(2, 0.2);
            pop(act.lx + 24, GROUND - 44, 'ドテッ', P.lsky);
          }
          if (act.t >= TUMBLE) act = null;
        }
      }
      function complete() {
        state = 'done';
        endT = 0;
        api.sfx('fanfare');
        api.win('ピラミッド完成！\n…で、これ何の\n行事だっけ？', { wait: 1.8 });
        stopThrows();
      }
      function collapse() {
        state = 'collapse';
        endT = 0;
        act = null;
        stopThrows();
        api.sfx('buzzer');
        api.shake(4, 0.5);
        bodies = [];
        for (let i = 0; i < built; i++) {
          const sp = slotPos(i);
          bodies.push({ i, x: sp.x, y: sp.y, vx: api.rnd(-50, 50) + (SLOTS[i].x - 70) * 0.6, vy: api.rnd(-90, -30), a: 0, va: api.rnd(-6, 6), rest: false });
        }
        api.lose('ピラミッドがくずれた。\n全裸で、豆まみれ。', { wait: 1.6 });
      }

      // ── 投げる ──
      function scheduleThrow() {
        const win = api.chance(0.6);
        const kind = api.pick(ITEM_KINDS);
        const th = { src: win ? 'win' : 'left', w: api.irnd(0, WINDOWS.length - 1), sy: api.irnd(96, 160), t: 0, fireAt: win ? 0.5 : 0.55, item: kind, fired: false, shout: api.pick(SHOUTS), v: api.irnd(0, 7), kind: api.pick(['douki', 'senpai', 'ichinen']) };
        // 同じ窓に 2 人は出ない
        if (win && throwers.some((o) => o.src === 'win' && o.w === th.w)) th.w = (th.w + 1) % WINDOWS.length;
        throwers.push(th);
        stats.throws++;
        // だんだん、間がつまる
        const base = easy ? api.rnd(1.1, 1.8) : api.rnd(0.9, 1.5);
        throwT = base * (1 - built * 0.03);
      }
      function fire(th) {
        th.fired = true;
        api.sfx('throw');
        let sx, sy;
        if (th.src === 'win') {
          const wd = WINDOWS[th.w];
          sx = wd.x + 4;
          sy = wd.y + 10;
        } else {
          sx = -6;
          sy = th.sy;
        }
        const n = th.item === 'mame' ? 4 : 1;
        // ねらう人（のっている人のだれか。まだだれもいなければ、地面）
        const slot = built > 0 ? api.irnd(0, built - 1) : -1;
        for (let k = 0; k < n; k++) {
          const T = api.rnd(0.85, 1.1) + k * 0.06;
          let tx, ty;
          if (slot >= 0) {
            const s = SLOTS[slot];
            tx = s.x + 22 + api.rnd(-10, 10);
            ty = s.y + 10 + api.rnd(-6, 6);
          } else {
            tx = api.rnd(30, 150);
            ty = GROUND - 2;
          }
          flying.push({ kind: th.item, sx, sy, tx, ty, T, t: 0, h: th.src === 'win' ? api.rnd(10, 26) : api.rnd(26, 46), slot, spin: api.rnd(0, 6) });
        }
      }
      function impact(f) {
        const it = ITEMS[f.kind];
        const hitsPyramid = f.slot >= 0 && f.slot < built && state === 'build';
        if (hitsPyramid) {
          const k = (bracing ? 0.25 : 1) * (1 + built * 0.04);
          wob = Math.min(100, wob + it.dmg * k);
          if (bracing) {
            stats.braced++;
            if (f.kind !== 'mame' || api.chance(0.3)) pop(f.tx, f.ty - 8, 'ガシッ', P.white);
            api.sfx('step');
          } else {
            stats.hits++;
            shakeX = f.tx < 90 ? 2 : -2;
            if (f.kind !== 'mame' || api.chance(0.4)) pop(f.tx, f.ty - 8, it.word, P.yellow);
            api.sfx(it.sfx);
            if (f.kind !== 'mame') api.shake(2, 0.15);
          }
        }
        // 跳ね返って、地面に落ちる
        falling.push({ kind: f.kind, x: f.tx, y: f.ty, vx: api.rnd(-40, 40), vy: hitsPyramid ? -60 : 0, spin: f.spin, gy: api.rnd(GROUND - 2, GROUND + 2) });
      }

      // ── 警察 ──
      function startPolice() {
        police = { s: 'alarm', t: 0, carX: W + 4, copX: W, copDir: 'left', said: '' };
        policeDone = true;
        state = 'police';
        bracing = false;
        api.sfx('siren');
        api.bgm(null);
        stopThrows();
      }
      // 投げていた人は、あわてて引っこむ。飛んでいた物は、その場で落ちる
      function stopThrows() {
        throwers.length = 0;
        flying.forEach((f) => falling.push({ kind: f.kind, x: lerpX(f), y: lerpY(f), vx: 0, vy: 0, spin: f.spin, gy: api.rnd(GROUND - 2, GROUND + 2) }));
        flying.length = 0;
      }
      function updatePolice(dt) {
        const pc = police;
        pc.t += dt;
        if (pc.s === 'alarm') {
          pc.carX = api.approach(pc.carX, W - 70, dt * 60);
          const tap = api.input.tap;
          const tapDoor = tap && tap.x >= DOOR.x - 16 && tap.x <= DOOR.x + DOOR.w + 16 && tap.y >= DOOR.y - 16;
          if (api.input.pressed('down') || tapDoor) {
            pc.s = 'hide';
            pc.t = 0;
            api.sfx('jump');
          } else if (pc.t >= ALARM) {
            pc.s = 'caught';
            pc.t = 0;
            pc.copX = pc.carX + 20;
            api.sfx('buzzer');
            api.lose('警察につかまった。\n「とりあえず、\n服を着なさい」', { wait: 2.2 });
          }
        } else if (pc.s === 'hide') {
          pc.carX = api.approach(pc.carX, W - 70, dt * 60);
          if (pc.t >= 0.7) { pc.s = 'patrol'; pc.t = 0; pc.copX = pc.carX + 20; }
        } else if (pc.s === 'patrol') {
          // おまわりさんが歩いてきて、見回して、帰っていく
          const T1 = 1.0, T2 = 2.2, T3 = 3.0;
          if (pc.t < T1) { pc.copX -= 70 * dt; pc.copDir = 'left'; }
          else if (pc.t < T2) {
            const k = Math.floor((pc.t - T1) / 0.4) % 3;
            pc.copDir = ['left', 'down', 'right'][k];
            pc.said = pc.t < T1 + 0.8 ? '…？' : '気のせいか';
          } else if (pc.t < T3) { pc.copX += 90 * dt; pc.copDir = 'right'; pc.said = ''; }
          else {
            pc.s = 'back';
            pc.t = 0;
            api.sfx('ok');
          }
        } else if (pc.s === 'back') {
          pc.carX += 160 * dt; // 車が去っていく
          if (pc.t >= 0.8) {
            police = null;
            wob *= 0.5;
            newZone();
            api.bgm('tense');
            throwT = 1.2;
          }
        } else if (pc.s === 'caught') {
          pc.copX = api.approach(pc.copX, 150, 60 * dt);
          pc.copDir = 'left';
        }
      }
      const lerpX = (f) => api.lerp(f.sx, f.tx, Math.min(1, f.t / f.T));
      const lerpY = (f) => { const k = Math.min(1, f.t / f.T); return api.lerp(f.sy, f.ty, k) - f.h * 4 * k * (1 - k); };

      // ── 描く道具 ──
      // 吹き出し（白地に黒わく）。(x, y) はしっぽの先。o.side なら、しっぽは右に出る
      function bubble(g, x, y, str, o) {
        o = o || {};
        const size = 12;
        const lines = String(str).split('\n');
        const w = Math.max(...lines.map((l) => g.measure(l, size))) + 8, h = lines.length * 13 + 5;
        const bx = Math.round(o.side ? x - w - 2 : Math.max(2, Math.min(W - w - 2, x - w / 2)));
        const by = Math.round(Math.max(13, o.side ? y - h / 2 : y - h - 3));
        const fill = o.fill || P.white;
        g.R(bx + 1, by, w - 2, h, P.ink);
        g.R(bx, by + 1, w, h - 2, P.ink);
        g.R(bx + 1, by + 1, w - 2, h - 2, fill);
        if (o.side) {
          const ty = Math.round(Math.max(by + 4, Math.min(by + h - 5, y)));
          g.R(bx + w - 1, ty - 2, 1, 4, fill);
          g.R(bx + w - 1, ty - 2, 2, 1, P.ink);
          g.R(bx + w - 1, ty + 1, 2, 1, P.ink);
          g.R(bx + w, ty - 1, 1, 2, fill);
          g.R(bx + w + 1, ty - 1, 1, 2, P.ink);
        } else {
          const tx = Math.round(Math.max(bx + 4, Math.min(bx + w - 5, x)));
          g.R(tx - 2, by + h - 1, 4, 1, fill);
          g.R(tx - 2, by + h - 1, 1, 2, P.ink);
          g.R(tx + 1, by + h - 1, 1, 2, P.ink);
          g.R(tx - 1, by + h, 2, 1, fill);
          g.R(tx - 1, by + h + 1, 2, 1, P.ink);
        }
        lines.forEach((l, i) => g.text(l, bx + w / 2, by + 3 + i * 13, { size, col: o.col || P.ink, align: 'center' }));
      }
      // 白い息。t は 0〜1（その外は描かない）。口もと (x, y) から、dir の向きにのぼって消える
      function breath(g, x, y, t, dir) {
        if (!(t >= 0 && t < 1)) return;
        g.ctx.save();
        g.ctx.globalAlpha = 0.85 * (1 - t * t);
        g.disc(x + dir * t * 10, y - t * 12, 1.5 + t * 2.5, P.white);
        g.ctx.restore();
      }
      // ちらつく雪（寮の前の夜空と地面。人や飛んでくる物より奥）
      function drawSnow(g) {
        for (let i = 0; i < 22; i++) {
          const v = 7 + (i % 5) * 3;
          const y = 14 + ((i * 47 + api.time * v) % 184);
          const x = (((i * 89 + Math.sin(api.time * 0.9 + i) * 5 + api.time * 3) % W) + W) % W;
          g.R(x, y, 1, 1, i % 3 ? P.white : P.lsky);
        }
      }
      function drawItem(g, kind, x, y, spin) {
        x = Math.round(x);
        y = Math.round(y);
        const fl = Math.floor(spin) % 2;
        if (kind === 'mame') {
          g.R(x - 1, y - 1, 3, 2, P.cream);
          g.R(x - 1, y, 1, 1, P.tan);
        } else if (kind === 'mikan') {
          g.disc(x, y, 3, P.orange);
          g.R(x - 1, y - 2, 2, 1, P.lorange);
          g.R(x, y - 4, 2, 1, P.green);
        } else if (kind === 'slipper') {
          if (fl) { g.R(x - 5, y - 2, 10, 4, P.ink); g.R(x - 4, y - 1, 8, 2, P.mblue); g.R(x + 1, y - 1, 3, 2, P.sky); }
          else { g.R(x - 2, y - 5, 4, 10, P.ink); g.R(x - 1, y - 4, 2, 8, P.mblue); g.R(x - 1, y + 1, 2, 3, P.sky); }
        } else if (kind === 'zasshi') {
          if (fl) { g.R(x - 6, y - 4, 12, 9, P.ink); g.R(x - 5, y - 3, 10, 7, P.pink); g.R(x - 4, y - 2, 6, 1, P.white); g.R(x - 4, y, 4, 2, P.yellow); }
          else { g.R(x - 6, y - 2, 12, 4, P.ink); g.R(x - 5, y - 1, 10, 2, P.white); }
        } else if (kind === 'makura') {
          g.R(x - 6, y - 3, 12, 7, P.ink);
          g.R(x - 5, y - 2, 10, 5, P.white);
          g.R(x - 4, y - 2, 8, 1, P.lgray);
        }
      }
      function drawSky(g) {
        g.clear(P.night);
        for (let y = 12; y < 150; y += 4) if (y > 100) g.dither(0, y, BLD_X, 2, P.navy, (y / 4) & 1);
        g.R(0, 130, BLD_X, 20, P.navy);
        // 星
        for (let i = 0; i < 26; i++) {
          const x = (i * 73 + 11) % BLD_X, y = 16 + ((i * 37) % 90);
          const tw = (Math.floor(api.time * 2 + i) % 5) === 0;
          g.R(x, y, 1, 1, tw ? P.white : P.lsky);
        }
        // 月
        g.disc(32, 34, 10, P.lyellow);
        g.disc(36, 31, 9, P.night);
        // 遠くの家なみ
        [[0, 124, 30], [28, 116, 26], [56, 128, 34], [92, 120, 22], [118, 126, 30], [150, 118, 24]].forEach(([x, y, w], i) => {
          g.R(x, y, w, 150 - y, '#1c1838');
          if (i % 2) g.R(x + 6, y + 8, 4, 4, P.lyellow);
        });
        // 電柱
        g.R(160, 40, 3, 112, '#2c2848');
        g.R(152, 50, 19, 2, '#2c2848');
        g.line(0, 58, 152, 51, '#2c2848');
      }
      function drawGround(g) {
        g.R(0, 150, W, 50, P.xdgray);
        for (let i = 0; i < 40; i++) g.R((i * 53) % W, 152 + ((i * 29) % 44), 2, 1, P.dgray);
        // 玄関の明かりが落ちる所
        g.dither(150, 176, 106, 22, P.dgray, 0);
      }
      function drawDorm(g) {
        const x0 = BLD_X;
        g.R(x0, 22, W - x0, GROUND - 22, '#4c4870');
        g.R(x0, 22, W - x0, 3, P.dgray);
        g.R(x0, 20, W - x0, 2, P.gray);
        g.R(x0, 22, 2, GROUND - 22, '#3c3858');
        g.R(x0, 66, W - x0, 2, '#3c3858');
        g.R(x0, 110, W - x0, 2, '#3c3858');
        // 窓（投げる人がいる窓は、あいて明るい）
        WINDOWS.forEach((wd, i) => {
          const th = throwers.find((t) => t.src === 'win' && t.w === i);
          const lit = th || (i === 1 || i === 2) || state === 'done';
          g.R(wd.x - 1, wd.y - 1, 38, 30, P.gray);
          g.R(wd.x, wd.y, 36, 28, lit ? P.lorange : P.navy);
          if (lit) g.dither(wd.x, wd.y, 36, 28, P.lyellow, 0);
          if (th) drawThrower(g, th, wd);
          else if (state === 'done' && i % 2 === 0) {
            // できあがったら、窓から見物
            const img = api.person(i === 0 ? 'douki' : 'senpai', { dir: 'down', variant: i });
            g.ctx.drawImage(img, 0, 0, 16, 13, wd.x + 2, wd.y + 2, 32, 26);
          }
          g.R(wd.x + 17, wd.y, 2, 28, P.gray);
          g.R(wd.x - 2, wd.y + 28, 40, 2, P.lgray);
        });
        // 玄関
        const d = DOOR;
        g.R(d.x - 3, d.y - 3, d.w + 6, d.h + 3, P.gray);
        g.R(d.x, d.y, d.w, d.h, P.cream);
        g.dither(d.x, d.y, d.w, d.h, P.lorange, 1);
        g.R(d.x, d.y, d.w, 6, P.lorange);
        g.R(d.x + 4, d.y + 10, 10, 14, P.tan); // げた箱
        g.R(d.x + 4, d.y + 16, 10, 1, P.brown);
        g.R(d.x - 2, d.y + d.h - 2, d.w + 4, 4, P.lgray); // 段
        // 玄関の灯り
        g.R(d.x + d.w / 2 - 3, d.y - 10, 6, 5, P.lyellow);
        g.R(d.x + d.w / 2 - 4, d.y - 11, 8, 1, P.gray);
        // 表札「夕照寮」
        g.R(240, 131, 15, 44, P.dbrown);
        g.R(241, 132, 13, 42, P.cream);
        ['夕', '照', '寮'].forEach((ch, i) => g.text(ch, 248, 134 + i * 13, { size: 12, col: P.ink, align: 'center' }));
      }
      function drawThrower(g, th, wd) {
        const up = th.t < 0.12 ? th.t / 0.12 : th.fired && th.t > th.fireAt + 0.4 ? Math.max(0, 1 - (th.t - th.fireAt - 0.4) / 0.15) : 1;
        const img = api.person(th.kind, { dir: 'down', variant: th.v });
        const dy = Math.round((1 - up) * 22);
        g.ctx.save();
        g.ctx.beginPath();
        g.ctx.rect(wd.x, wd.y, 36, 28);
        g.ctx.clip();
        g.ctx.drawImage(img, 0, 0, 16, 13, wd.x + 2, wd.y + 2 + dy, 32, 26);
        // ふりかぶる手
        if (!th.fired) {
          g.R(wd.x + 2, wd.y + 2 + dy, 4, 6, P.skin);
          drawItem(g, th.item, wd.x + 4, wd.y + 2 + dy, 0);
        }
        g.ctx.restore();
      }
      function drawLeftWarn(g, th) {
        if (th.fired) return;
        const y = th.sy;
        if (g.blink(5)) {
          g.R(1, y - 9, 12, 16, P.ink);
          g.R(2, y - 8, 10, 14, P.yellow);
          g.R(6, y - 6, 2, 7, P.red);
          g.R(6, y + 2, 2, 2, P.red);
        }
        g.text(th.shout, 15, y - 7, { size: 12, col: P.white, outline: P.ink });
      }
      function drawPyramid(g) {
        for (let i = 0; i < built; i++) {
          const sp = slotPos(i);
          g.sprite(imgs[i], sp.x + shiver(i), sp.y, { scale: 2 });
          if (bracing && state === 'build' && Math.floor(api.time * 6 + i) % 3 === 0) {
            g.R(sp.x + 36, sp.y + 4, 2, 3, P.lsky); // 汗
          }
        }
        // 白い息（1 人ずつ、間をずらして）
        for (let i = 0; i < built; i++) {
          const sp = slotPos(i);
          const t = ((api.time + i * 0.71) % 2.3) / 0.9, dir = i % 2 ? 1 : -1;
          breath(g, sp.x + 21 + dir * 7 + shiver(i), sp.y + 25, t, dir);
        }
      }
      // のぼる・転がる・待っている人
      function drawCrew(g) {
        if (state === 'police' && police.s !== 'alarm' && police.s !== 'caught') return;
        if (act && act.type === 'climb') {
          const k = act.t / CLIMB;
          const s = SLOTS[act.i];
          const x = api.lerp(WAIT.x, s.x + 6, k), y = api.lerp(WAIT.y, s.y - 18, k) - Math.sin(k * Math.PI) * 30;
          if (k < 0.8) g.sprite(bare(CREW[act.i], 'left', Math.floor(act.t * 12) % 2), x, y, { scale: 2 });
          else g.sprite(imgs[act.i], s.x, s.y - (1 - k) * 30, { scale: 2 });
          return;
        }
        if (act && act.type === 'tumble') {
          const m = CREW[act.i];
          const img = bare(m, 'left', 0);
          const s = SLOTS[act.i];
          if (act.t < 0.4) {
            // とびついて、すべる
            const k = act.t / 0.4;
            const x = api.lerp(WAIT.x, s.x + 30, k), y = api.lerp(WAIT.y, s.y - 10, k) - Math.sin(k * Math.PI) * 26;
            g.sprite(img, x, y, { scale: 2 });
          } else {
            // ひっくり返って、ドテッ（下のゲージにかくれない高さに）
            const lx = act.lx;
            g.ctx.save();
            g.ctx.translate(lx + 24, GROUND - 22);
            g.ctx.rotate(-Math.PI / 2);
            g.ctx.drawImage(img, -24, -16, 32, 48);
            g.ctx.restore();
            if (g.blink(4)) g.text('★', lx + 6, GROUND - 46, { size: 12, col: P.yellow });
          }
          return;
        }
        if (built < NEED && state !== 'collapse') {
          // 玄関で待っている人（全裸で、ガタガタふるえている）
          const m = CREW[built];
          const bob = Math.floor(api.time * 2) % 2;
          const jit = state === 'done' ? 0 : Math.floor(api.time * 20) % 2;
          g.sprite(bare(m, 'left', 0), WAIT.x + jit, WAIT.y - bob, { scale: 2 });
          breath(g, WAIT.x + 3, WAIT.y + 19 - bob, ((api.time + 0.4) % 1.7) / 0.9, -1);
          if (state === 'build' && (api.time + 1.5) % 4.2 < 1.3) g.text('さむい…', WAIT.x + 16, WAIT.y - 15, { size: 12, col: P.lsky, outline: P.ink, align: 'center' });
        }
      }
      function drawPolice(g) {
        const pc = police;
        if (!pc) return;
        // 赤い光
        const on = Math.floor(api.time * 6) % 2 === 0;
        if (pc.s !== 'back') {
          g.ctx.save();
          g.ctx.globalAlpha = on ? 0.28 : 0.1;
          g.R(0, 12, W, 186, P.red);
          g.ctx.restore();
        }
        // パトカー
        const cx = Math.round(pc.carX);
        g.R(cx, 172, 84, 18, P.ink);
        g.R(cx + 1, 173, 82, 8, P.white);
        g.R(cx + 1, 181, 82, 9, '#202020');
        g.R(cx + 14, 160, 44, 13, P.ink);
        g.R(cx + 15, 161, 42, 12, P.white);
        g.R(cx + 18, 163, 16, 8, P.sky);
        g.R(cx + 37, 163, 17, 8, P.sky);
        g.R(cx + 30, 155, 12, 5, P.ink);
        g.R(cx + 31, 156, 10, 4, on ? P.red : P.dred);
        if (on) { g.R(cx + 24, 154, 6, 2, P.pink); g.R(cx + 42, 154, 6, 2, P.pink); }
        g.R(cx + 70, 176, 13, 3, P.lyellow); // ライト
        g.disc(cx + 16, 190, 6, P.ink);
        g.disc(cx + 16, 190, 3, P.gray);
        g.disc(cx + 64, 190, 6, P.ink);
        g.disc(cx + 64, 190, 3, P.gray);
        // おまわりさん
        if (pc.s === 'patrol' || pc.s === 'caught') {
          const fr = (pc.copDir === 'left' || pc.copDir === 'right') && (pc.s === 'caught' || pc.t < 1 || pc.t > 2.2) ? Math.floor(api.time * 6) % 2 : 0;
          g.sprite(api.person('police', { dir: pc.copDir, frame: fr }), pc.copX, GROUND - 48, { scale: 2 });
          if (pc.said) bubble(g, pc.copX + 16, GROUND - 50, pc.said);
          if (pc.s === 'caught' && pc.t > 0.6) bubble(g, pc.copX + 10, GROUND - 50, 'きみたち、\nなんで裸？', { col: P.navy });
        }
        // 逃げる人・もどる人
        if (pc.s === 'hide' || pc.s === 'back') {
          for (let i = 0; i < built; i++) {
            const s = SLOTS[i];
            let k = pc.s === 'hide' ? Math.min(1, pc.t / 0.6 - i * 0.03) : 1 - Math.min(1, pc.t / 0.7);
            k = Math.max(0, k);
            if (pc.s === 'back' && k < 0.05) {
              g.sprite(imgs[i], s.x, s.y, { scale: 2 });
              continue;
            }
            const x = api.lerp(s.x + 6, DOOR.x + 4, k), y = api.lerp(s.y - 16, GROUND - 48, Math.min(1, k * 1.6));
            g.sprite(bare(CREW[i], pc.s === 'hide' ? 'right' : 'left', Math.floor(api.time * 10 + i) % 2), x, y, { scale: 2, alpha: k > 0.92 ? 0.4 : 1 });
          }
          if (pc.s === 'back' && pc.t > 0.2) g.big('せーの！', 92, 70, { size: 16, col: P.white, align: 'center' });
        }
        if (pc.s === 'patrol' && pc.t > 0.3) {
          // 玄関から、のぞいている
          if (g.blink(1)) g.text('…', DOOR.x + 20, DOOR.y + 8, { size: 12, col: P.ink, align: 'center' });
        }
        // 「！」の合図
        if (pc.s === 'alarm') {
          const k = Math.min(1, pc.t / 0.1);
          const left = Math.max(0, ALARM - pc.t);
          g.R(46, 54, 164, 52, P.ink);
          g.R(47, 55, 162, 50, P.dred);
          g.R(49, 57, 158, 46, P.red);
          g.big('！', 72, 60 - (1 - k) * 8, { col: P.yellow, shade: P.orange, align: 'center' });
          g.text('警察だ！', 150, 60, { col: P.white, outline: P.ink, align: 'center' });
          g.text('↓で中へ！', 150, 80, { col: P.lyellow, outline: P.ink, align: 'center' });
          g.bar(56, 98, 144, 3, left / ALARM, P.yellow, P.dred);
        }
      }
      function drawUi(g) {
        // ぐらぐらゲージ（左上）
        g.R(0, 12, 150, 14, P.ink);
        g.text('ぐらぐら', 4, 13, { size: 12, col: wob > 70 && g.blink(4) ? P.red : P.white });
        const col = wob < 40 ? P.lgreen : wob < 70 ? P.yellow : P.red;
        g.bar(56, 17, 88, 5, wob / 100, col, P.xdgray);
        // のせた人数（右上：小さいピラミッド）
        g.R(W - 92, 12, 92, 14, P.ink);
        g.text('あと' + Math.max(0, NEED - built) + '人', W - 4, 13, { size: 12, col: P.white, align: 'right' });
        SLOTS.forEach((s, i) => {
          const x = W - 88 + (i - [0, 0, 0, 0, 4, 4, 4, 7, 7, 9][i]) * 6 + s.r * 3;
          const y = 22 - s.r * 3;
          g.R(x, y, 5, 2, i < built ? (i === NEED - 1 ? P.red : P.lyellow) : P.dgray);
        });
        // 下のタイミングゲージ
        g.R(0, 198, W, H - 198, P.ink);
        g.R(0, 198, W, 1, P.dgray);
        const b = BAR;
        const live = state === 'build' && !act && built < NEED;
        g.R(b.x - 1, b.y - 1, b.w + 2, b.h + 2, P.gray);
        g.R(b.x, b.y, b.w, b.h, P.xdgray);
        const zx = b.x + Math.round((zone.c - zone.w / 2) * b.w), zw = Math.round(zone.w * b.w);
        g.R(zx, b.y, zw, b.h, live && !bracing ? P.lgreen : P.dgreen);
        g.R(zx, b.y, zw, 1, P.lime);
        const mx = b.x + Math.round(mk.pos * b.w);
        const mcol = live && !bracing ? (inZone() ? P.yellow : P.white) : P.dgray;
        g.R(mx - 1, b.y - 3, 3, b.h + 6, P.ink);
        g.R(mx, b.y - 2, 1, b.h + 4, mcol);
        g.R(mx - 2, b.y - 5, 5, 2, mcol);
        g.R(mx - 1, b.y - 3, 3, 1, mcol);
        // A・B の表示
        g.disc(14, 211, 8, live && !bracing ? P.red : P.dred);
        g.text('A', 14, 205, { size: 12, col: P.white, align: 'center' });
        g.disc(W - 34, 211, 8, bracing ? P.yellow : P.dgray);
        g.text('B', W - 34, 205, { size: 12, col: bracing ? P.ink : P.white, align: 'center' });
        // ふんばっている間は、ゲージを暗くして「ぐっ」（マーカーは見えたままにする）
        if (bracing) g.text('ぐっ', W - 25, 205, { size: 12, col: P.yellow });
        if (hint > 0) g.text('Bをはなして！', b.x + b.w / 2, 202, { size: 12, col: P.yellow, outline: P.ink, align: 'center' });
      }

      return {
        get built() { return built; },
        get wob() { return wob; },
        get bracing() { return bracing; },
        get state() { return state; },
        get police() { return police ? police.s : null; },
        get stats() { return stats; },
        get marker() { return { pos: mk.pos, dir: mk.dir, zone: zone.c, w: zone.w, inZone: inZone() }; },
        // テスト用：いまの様子（ボットが見て動く）
        peek() {
          const incoming = flying.filter((f) => f.slot >= 0).map((f) => ({ eta: f.T - f.t }));
          throwers.forEach((th) => { if (!th.fired) incoming.push({ eta: th.fireAt - th.t + 0.85 }); });
          // マーカーがゾーンのまん中に来るまでの秒数
          let pos = mk.pos, dir = mk.dir, eta = null;
          const v = 1 / sweep();
          for (let s = 0; s < 240; s++) {
            if (Math.abs(pos - zone.c) < v / 120) { eta = s / 120; break; }
            pos += dir * v / 120;
            if (pos > 1) { pos = 2 - pos; dir = -1; }
            if (pos < 0) { pos = -pos; dir = 1; }
          }
          return { police: police ? police.s : null, incoming, busy: state !== 'build' || !!act || !!police, markerEta: eta, built, wob, bracing };
        },
        update(dt) {
          const inp = api.input;
          hint = Math.max(0, hint - dt);
          shakeX = api.approach(shakeX, 0, dt * 8);
          for (let i = pops.length - 1; i >= 0; i--) { pops[i].t += dt; if (pops[i].t > 0.7) pops.splice(i, 1); }
          // 落ちていく物
          for (let i = falling.length - 1; i >= 0; i--) {
            const f = falling[i];
            f.vy += 420 * dt;
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            f.spin += dt * 10;
            if (f.y >= f.gy) {
              falling.splice(i, 1);
              litter.push({ kind: f.kind, x: f.x, y: f.gy });
              if (litter.length > 40) litter.shift();
            }
          }
          if (state === 'collapse') {
            endT += dt;
            bodies.forEach((b) => {
              if (b.rest) return;
              b.vy += 500 * dt;
              b.x += b.vx * dt;
              b.y += b.vy * dt;
              b.a += b.va * dt;
              const k = (b.i % 3) * 3;
              if (b.y >= GROUND - 30 - k) {
                // 横か縦にたおれて止まる（下のゲージにかくれない高さに）
                b.a = Math.round(b.a / (Math.PI / 2)) * (Math.PI / 2);
                b.y = GROUND + 3 - FH - (Math.abs(Math.sin(b.a)) > 0.5 ? FW : FH) - k;
                b.rest = true;
                api.sfx('hit');
              }
            });
            return;
          }
          if (state === 'done') {
            endT += dt;
            return;
          }
          if (police) {
            updatePolice(dt);
            if (!police) state = 'build';
            return;
          }
          if (api.ended) return;
          // マーカー
          const v = 1 / sweep();
          mk.pos += mk.dir * v * dt;
          if (mk.pos > 1) { mk.pos = 2 - mk.pos; mk.dir = -1; }
          if (mk.pos < 0) { mk.pos = -mk.pos; mk.dir = 1; }
          // ふんばる
          const wasBracing = bracing;
          bracing = inp.held('b');
          if (bracing && !wasBracing) api.sfx('cursor');
          // ぐらぐら：ふんばると減る。高くなるほど、ふんばらないと増えていく
          if (bracing) wob = Math.max(0, wob - 14 * dt);
          else wob = Math.max(0, wob + (built * 0.5 - 2) * dt);
          // のせる
          updateAct(dt);
          if (state !== 'build') return;
          if (!act && (inp.pressed('a') || inp.tap)) tryBuild();
          // 投げる人
          throwT -= dt;
          if (throwT <= 0) scheduleThrow();
          for (let i = throwers.length - 1; i >= 0; i--) {
            const th = throwers[i];
            th.t += dt;
            if (!th.fired && th.t >= th.fireAt) fire(th);
            if (th.t > th.fireAt + 0.6) throwers.splice(i, 1);
          }
          for (let i = flying.length - 1; i >= 0; i--) {
            const f = flying[i];
            f.t += dt;
            f.spin += dt * 8;
            if (f.t >= f.T) {
              flying.splice(i, 1);
              impact(f);
            }
          }
          if (wob >= 100) { collapse(); return; }
          // 警察（人数が決まった数になったか、決まった時間になったら、1 回だけ）
          if (!policeDone && !act && (built >= policeAt.n || api.time >= policeAt.t)) {
            startPolice();
          }
        },
        draw(g) {
          drawSky(g);
          drawGround(g);
          drawDorm(g);
          drawSnow(g);
          litter.forEach((l) => drawItem(g, l.kind, l.x, l.y, 1));
          if (state === 'collapse') {
            bodies.forEach((b) => {
              g.ctx.save();
              g.ctx.translate(Math.round(b.x + FW), Math.round(b.y + FH));
              g.ctx.rotate(b.a);
              g.ctx.drawImage(imgs[b.i], -FW, -FH, FW * 2, KH * 2);
              g.ctx.restore();
            });
            if (endT > 0.3) g.big('ドシャーン', 92, 70, { size: 32, col: P.lsky, shade: P.mblue, rim: P.navy, align: 'center' });
          } else if (!(police && (police.s === 'hide' || police.s === 'patrol' || police.s === 'back'))) {
            drawPyramid(g);
          }
          drawCrew(g);
          // 投げる人の予告（左）と、飛んでいる物
          throwers.forEach((th) => {
            if (th.src === 'left') drawLeftWarn(g, th);
            else if (!th.fired && th.t > 0.1) bubble(g, BLD_X - 1, WINDOWS[th.w].y + 12, th.shout, { col: P.dred, side: true });
          });
          flying.forEach((f) => drawItem(g, f.kind, lerpX(f), lerpY(f), f.spin));
          falling.forEach((f) => drawItem(g, f.kind, f.x, f.y, f.spin));
          pops.forEach((p) => g.text(p.str, p.x, p.y - p.t * 16, { size: 12, col: p.col, outline: P.ink, align: 'center' }));
          if (state === 'build' && wob > 60 && built > 0 && g.blink(3)) g.text('ぐらぐら…', 92, SLOTS[Math.min(built, NEED) - 1].y - 16, { size: 12, col: P.red, outline: P.white, align: 'center' });
          if (state === 'done') {
            if (endT > 0.2) g.big('完成！', 92, 46, { col: P.yellow, shade: P.orange, align: 'center' });
            if (endT > 0.8) g.text('さ、さむい…', SLOTS[NEED - 1].x + 44, SLOTS[NEED - 1].y + 4, { size: 12, col: P.lsky, outline: P.ink });
            for (let i = 0; i < 24; i++) {
              const x = (i * 47 + endT * 30 * ((i % 3) - 1)) % W;
              const y = 40 + ((i * 31 + endT * 90) % 150);
              drawItem(g, 'mame', x, y, 0);
            }
          }
          drawPolice(g);
          drawUi(g);
        },
      };
    },
  });
})();
