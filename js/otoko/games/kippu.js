/*
 * 3月 追いコン「全裸で切符」 ― 見られずに駅で切符を買って、寮の近くまでもどってこい（1年でいちばんの見せ場）
 *  夜の町を、横に長い地図で歩く。行き：寮の玄関前 → 川ぞいの道 → 住宅街 → 商店街 → 駅前（券売機）。
 *  切符を買うと「帰り」になり、人の動きが変わる。帰り：駅前 → 商店街 → 住宅街 → 川ぞいの道の、寮の手前まで来ればクリア。
 *  （寮までの最後のひと走りは、次のミニゲーム「うんこをよけろ」。ここで寮に入ってしまうと、話がつながらない）
 *  画面は、いまいる場所（エリア）の中を横にスクロールする。人はエリアの外を見ない。
 *  人が見ている所は光のくさび（視線）で見え、建物・塀・植え込み・車などのうしろで止まる。
 *  光の中にいると少しの間（0.35秒）「？」が出て、そのあと見つかる。ぶつかっても見つかる。
 *  見つかると ♥ が 1 つへり、最後のチェックポイント（エリアの入り口のかくれ場所）からやりなおし。♥ がなくなるとしっぱい。時間制限はない。
 *  しっぱいして、もう一度遊ぶとき（api.tries > 0）は、前回たどりついたチェックポイントから始める。
 *  人の種類：通行人、ジョギングの人、ベンチのカップル（♥ が出ている間は 2 人の世界）、自転車（来る前にベルが鳴る）、
 *    犬（近づくとほえて、家の人が窓から見る。寝ている間はそっと通れる）、酔っぱらい（ふらふら歩く）、コンビニの店員、
 *    おまわりさん（視線が長い）、駅員さん、カメラを持ってひそむ先輩（出てくる前にレンズが光る）、電車から降りてくる人たち。
 *  段ボール箱（商店街）：A でかぶる・ぬぐ。かぶって止まっていれば見つからない。動くとあやしまれる（見つかるまでが長くなる）。
 *  券売機の前で A を長おし（1.6秒）すると切符が買える。
 *  男魂くんは全裸（「男魂」の札とモザイクつき）。
 *  人の動きは時間だけで決まる（犬にほえられたときの家の人だけは別）。visibleAt で、少し先の時刻に見られるかを調べられる（テスト用）。
 *  テスト用：warp(i) で i 番目のチェックポイントへ飛ぶ。
 *  スマホは十字キーと A ボタンのほか、画面をおさえた所へ歩いていく（券売機をおさえ続けても買える。箱は男魂くんをタップ）。
 */
(function () {
  'use strict';

  const SPEED = 58; // 歩く速さ（ドット/秒）
  const GRACE = 0.35; // 光の中にこれだけいると見つかる（秒）。その間は「？」
  const BUY_TIME = 1.6; // 切符を買うのにかかる時間
  const BUMP = 11; // これより近づくと、ぶつかって見つかる
  const LIVES = 3;
  const BOX_SPEED = 0.55; // 箱をかぶって歩く速さ（ふつうの何倍か）
  const BOX_RATE = 0.3; // 箱をかぶって動いているとき、「？」が進む速さ（ふつうの何倍か）
  const TOPY = 24; // 地図の上のはし（その上は ♥ などの帯）
  const RIGHT = 0, DOWN = Math.PI / 2, LEFT = Math.PI, UP = -Math.PI / 2;
  const DR = Math.PI / 4, DL = Math.PI * 0.75, UR = -Math.PI / 4, UL = -Math.PI * 0.75;

  // ── 地図 ────────────────────────────────────────────
  // エリアごとに、地面の上の四角 [種類, x, y, w, h, { … }]（x はエリアの左はしから）。人は通れない。
  // 視線は、SEE_THRU の種類（低い物・水・ガラス）だけ通りぬける。3/4 の見下ろしなので、高さのある物は足もと（四角）より上にのびて描く
  // go・back：その向きで入ってきたときのチェックポイント（かくれ場所）
  const AREAS = [
    {
      id: 'ryo', name: '寮の玄関前', w: 256,
      solids: [
        ['dorm', 0, 24, 176, 62],
        ['wall', 0, 124, 58, 8], ['wall', 98, 124, 84, 8], ['wall', 176, 86, 6, 38],
        ['house', 182, 24, 74, 54, { v: 0 }],
        ['car', 196, 90, 40, 22, { v: 0 }],
        ['vend', 238, 114, 14, 10, { v: 1 }],
        ['gomi', 102, 133, 14, 9],
        ['pole', 140, 193, 6, 5],
        ['hedgeRow', 0, 200, 256, 24],
      ],
      lights: [[78, 96, 24], [150, 150, 30], [230, 146, 26]],
      go: [78, 104],
    },
    {
      id: 'kawa', name: '川ぞいの道', w: 320,
      solids: [
        ['backs', 0, 24, 320, 44],
        ['tree', 28, 92, 8, 6], ['tree', 96, 90, 8, 6], ['tree', 226, 92, 8, 6], ['tree', 300, 90, 8, 6],
        ['bush', 48, 80, 30, 18],
        ['shed', 138, 48, 48, 60],
        ['bush', 138, 108, 48, 10],
        ['bush', 248, 72, 40, 40],
        ['lamp', 74, 101, 4, 4], ['lamp', 206, 101, 4, 4],
        ['bench', 112, 166, 28, 6], ['bench', 262, 166, 28, 6],
        ['tree', 68, 176, 8, 6], ['tree', 196, 176, 8, 6],
        ['rail', 0, 184, 320, 4],
        ['river', 0, 188, 320, 36],
      ],
      lights: [[76, 116, 30], [208, 116, 30]],
      go: [12, 82], back: [312, 82],
    },
    {
      id: 'jutaku', name: '住宅街', w: 320,
      solids: [
        ['house', 0, 24, 92, 56, { v: 1 }],
        ['dogHouse', 124, 24, 94, 44],
        ['house', 250, 24, 70, 56, { v: 2 }],
        ['wall', 124, 68, 4, 28], ['wall', 214, 68, 4, 28],
        ['fence', 128, 92, 86, 4],
        ['barrier', 262, 84, 40, 14],
        ['wallB', 0, 162, 66, 62], ['wallB', 100, 162, 120, 62], ['wallB', 256, 162, 64, 62],
        ['wall', 66, 206, 34, 18], ['wall', 220, 206, 36, 18],
        ['car', 70, 134, 44, 16, { v: 1 }],
        ['pole', 56, 152, 6, 5], ['pole', 236, 94, 6, 5],
      ],
      lights: [[60, 132, 30], [238, 118, 30]],
      go: [10, 86], back: [312, 88],
    },
    {
      id: 'shoten', name: '商店街', w: 384,
      solids: [
        ['shop', 0, 24, 58, 50, { v: 0, label: 'やおや' }],
        ['izakaya', 58, 24, 72, 50],
        ['shop', 130, 24, 50, 50, { v: 1, label: 'くすり' }],
        ['conveni', 180, 24, 96, 46],
        ['cwall', 180, 24, 3, 46], ['cwall', 273, 24, 3, 46],
        ['shop', 276, 24, 54, 50, { v: 2, label: '本' }],
        ['shop', 330, 24, 54, 50, { v: 3, label: 'とこや' }],
        ['planter', 20, 76, 30, 10],
        ['sign', 100, 76, 12, 6],
        ['vend', 162, 74, 14, 10, { v: 0 }],
        ['bins', 282, 70, 20, 10],
        ['vend', 340, 74, 14, 10, { v: 1 }],
        ['planter', 46, 126, 36, 10], ['planter', 136, 126, 36, 10], ['planter', 226, 126, 36, 10], ['planter', 316, 126, 36, 10],
        ['pole', 186, 184, 6, 5],
        ['boxes', 132, 178, 24, 16],
        ['bikes', 252, 178, 54, 14],
        ['bench', 330, 178, 28, 6],
        ['backs2', 0, 196, 384, 28],
      ],
      lights: [[94, 84, 26], [228, 84, 52], [40, 160, 30], [300, 160, 30]],
      go: [10, 92], back: [372, 94],
      box: [110, 188],
    },
    {
      id: 'eki', name: '駅前', w: 256,
      solids: [
        ['station', 0, 24, 24, 38], ['locker', 24, 24, 26, 22], ['station', 50, 24, 206, 38, { main: true }],
        ['pillar', 66, 58, 8, 12],
        ['kenbaiki', 80, 58, 40, 10],
        ['pillar', 128, 58, 8, 12],
        ['kaisatsu', 160, 58, 64, 10],
        ['booth', 224, 52, 32, 18],
        ['shelter', 20, 116, 44, 6],
        ['bench', 24, 124, 36, 5],
        ['planter', 96, 124, 50, 12],
        ['clock', 176, 112, 6, 6],
        ['koban', 196, 146, 56, 36],
        ['planter', 20, 176, 56, 12],
        ['taxi', 104, 192, 46, 22],
      ],
      lights: [[100, 82, 40], [190, 80, 40], [120, 160, 40]],
      go: [10, 78],
    },
  ];
  let acc = 0;
  AREAS.forEach((a, i) => { a.i = i; a.x = acc; acc += a.w; });
  const WORLD_W = acc;
  const SEE_THRU = new Set(['rail', 'river', 'fence', 'conveni', 'bikes', 'bench', 'kaisatsu']);
  const SOLIDS = [];
  AREAS.forEach((a) => {
    a.solids.forEach(([kind, x, y, w, h, o]) => SOLIDS.push(Object.assign({ kind, x: a.x + x, y, w, h, area: a.i, see: SEE_THRU.has(kind) }, o || {})));
  });
  const BLOCK = AREAS.map((a) => SOLIDS.filter((s) => s.area === a.i && !s.see)); // 視線をさえぎる物（エリアごと）

  // チェックポイント（順番どおり）。0〜4 が行き、5 は切符を買ったあと（駅のコインロッカーのかげ）、6〜8 が帰り
  const CPS = [];
  AREAS.forEach((a) => CPS.push({ area: a.i, x: a.x + a.go[0], y: a.go[1], ticket: false }));
  CPS.push({ area: 4, x: AREAS[4].x + 37, y: 54, ticket: true });
  for (let i = 3; i >= 1; i--) CPS.push({ area: i, x: AREAS[i].x + AREAS[i].back[0], y: AREAS[i].back[1], ticket: true });
  const CP_BUY = 5;
  // 帰りのゴール（川ぞいの道の左はし。この先は寮まで一本道）
  const GOAL = { x: AREAS[1].x, y: 68, w: 18, h: 116 };
  // 券売機の前（ここで A 長おし）と、券売機そのもの（スマホで指でおさえる所）
  const BUY = { x: AREAS[4].x + 80, y: 68, w: 40, h: 12 };
  const KENBAIKI = { x: AREAS[4].x + 80, y: 40, w: 40, h: 28 };
  const DOG = { area: 2, x: AREAS[2].x + 170, y: 82, rAwake: 44, rSleep: 13 };

  const areaAt = (x) => {
    for (let i = AREAS.length - 1; i >= 0; i--) if (x >= AREAS[i].x) return i;
    return 0;
  };
  // 角度の差（-π〜π）
  const angDiff = (a, b) => {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

  // 光線が最初に物にぶつかるまでのきょり（なければ max）
  function rayLen(area, ox, oy, dx, dy, max) {
    let best = max;
    for (const b of BLOCK[area]) {
      let t0 = 0, t1 = best;
      if (Math.abs(dx) < 1e-9) {
        if (ox < b.x || ox > b.x + b.w) continue;
      } else {
        let p = (b.x - ox) / dx, q = (b.x + b.w - ox) / dx;
        if (p > q) [p, q] = [q, p];
        t0 = Math.max(t0, p);
        t1 = Math.min(t1, q);
        if (t0 > t1) continue;
      }
      if (Math.abs(dy) < 1e-9) {
        if (oy < b.y || oy > b.y + b.h) continue;
      } else {
        let p = (b.y - oy) / dy, q = (b.y + b.h - oy) / dy;
        if (p > q) [p, q] = [q, p];
        t0 = Math.max(t0, p);
        t1 = Math.min(t1, q);
        if (t0 > t1) continue;
      }
      if (t0 < best) best = t0;
    }
    return best;
  }
  // 男魂くんの足もと（10×5）がどこかにぶつかるか
  function blocked(x, y) {
    if (x < 4 || x > WORLD_W - 4 || y < TOPY + 6 || y > 221) return true;
    for (const b of SOLIDS) if (x + 5 > b.x && x - 5 < b.x + b.w && y + 2 > b.y && y - 3 < b.y + b.h) return true;
    return false;
  }
  // 進みたい向きがふさがれていても、横に 5 ドット以内ずらせば通れるなら、そちらへ少しずれる
  function slide(x, y, to, axis, step) {
    for (let k = 1; k <= 5; k++) {
      for (const s of [1, -1]) {
        const ok = axis === 'x' ? !blocked(x + s * k, to) && !blocked(x + s * Math.min(k, step), y) : !blocked(to, y + s * k) && !blocked(x, y + s * Math.min(k, step));
        if (ok) return (axis === 'x' ? x : y) + s * Math.min(k, step);
      }
    }
    return axis === 'x' ? x : y;
  }
  // 人の通り道が物にぶつからないか（酔っぱらいの行き先を決めるとき）
  function clearPath(x0, y0, x1, y1) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      for (const b of SOLIDS) if (x + 8 > b.x && x - 8 < b.x + b.w && y + 4 > b.y && y - 6 < b.y + b.h) return false;
    }
    return true;
  }

  // ── 人 ────────────────────────────────────────────
  // 動きの予定（steps）。x は、その人のエリアの左はしから。
  //  { to: [x, y], speed }   そこまで歩く
  //  { look: 向き, dur, len, heart }   その向きを見る（len で視線の長さを変える。heart：カップルの 2 人の世界）
  //  { hide: 秒 }  いない（見ない・描かない）　{ rustle: 秒 }  いないが、出てくる前のしるし（レンズが光る）
  //  { sleep: 秒 }  いるが寝ている（見ない）　{ warp: [x, y], face }  その場所へ移る（いない間に）
  // leg：'go' 行きだけ／'back' 帰りだけ／'both'。once：切符を買ったときに 1 回だけ動く（電車の客）
  const WHO = {
    walker: { shout: 'えっ！？', caught: '通りがかりの人に\n見られた。\n「…見なかったことに」' },
    jogger: { shout: 'うわっ！', caught: 'ジョギングの人に\n見られた。\nペースが乱れたらしい。' },
    couple: { shout: 'え…', caught: 'カップルに見られた。\n2人の思い出に\nなってしまった。' },
    bike: { shout: 'ひえっ！', caught: '自転車のライトに\n照らされた。\nまぶしい夜だった。' },
    oldman: { shout: 'ほほう', caught: 'おじいさんに\n見られた。\n「わしも昔は…」' },
    resident: { shout: 'だれ！？', caught: '近所の人に\n見られた。\n犬は悪くない。' },
    drunk: { shout: 'おっ！？', caught: '酔っぱらいに\n見られた。\n「にいちゃん、寒くないか」' },
    clerk: { shout: 'いらっしゃ…', caught: 'コンビニの店員に\n見られた。\n「…いらっしゃいませ」' },
    police: { shout: 'こら！', caught: 'おまわりさんに\n見つかった。\n切符より先に、調書。' },
    ekiin: { shout: 'お客さま！？', caught: '駅員さんに\n見つかった。\n「お客さま、服は？」' },
    senpai: { shout: 'パシャ！', caught: '先輩に写真を\nとられた。\n追いコンのスライド行き。' },
    passenger: { shout: 'えぇ！？', caught: '電車の客に\n見られた。\n終電の思い出になった。' },
  };

  // 人の一覧を作る（酔っぱらいやカップルの動きは、遊ぶたびに乱数で変わる）
  function makeNpcs(api) {
    const rnd = api.rnd;
    const list = [];
    const add = (o) => { list.push(Object.assign({ v: 0, leg: 'both', len: 70, half: 0.45, bump: BUMP }, o)); };

    // ── 寮の玄関前（行き）：会社帰りの人が、寮の前の道を行ったり来たり ──
    add({
      who: 'walker', kind: 'kyaku', v: 0, area: 0, leg: 'go', len: 72, x: 24, y: 162,
      steps: [{ to: [232, 162], speed: 32 }, { look: DOWN, dur: 0.8 }, { look: LEFT, dur: 0.5 }, { to: [24, 162], speed: 32 }, { look: UP, dur: 0.8 }, { look: RIGHT, dur: 0.5 }],
    });

    // ── 川ぞいの道 ──
    // 行き：ジョギングの人と、ベンチのカップル
    add({
      who: 'jogger', kind: 'kyaku', v: 3, area: 1, leg: 'go', len: 74, half: 0.48, x: 46, y: 140, jog: true,
      steps: [{ to: [296, 140], speed: 64 }, { look: LEFT, dur: 1.4 }, { to: [46, 140], speed: 64 }, { look: RIGHT, dur: 1.4 }],
    });
    {
      // 2 人の世界（♥・視線は短い）と、まわりを見る（視線が長い）をくりかえす
      const L = [], R = [];
      for (let k = 0; k < 8; k++) {
        const love = rnd(3.2, 5.6), look = rnd(1.4, 2.0);
        L.push({ look: RIGHT, dur: love, len: 18, heart: true }, { look: UL, dur: look });
        R.push({ look: LEFT, dur: love, len: 18, heart: true }, { look: UR, dur: look });
      }
      add({ who: 'couple', kind: 'joshi', v: 0, area: 1, leg: 'go', len: 72, half: 0.5, x: 119, y: 171, sit: true, bump: 9, group: 'bench', steps: L });
      add({ who: 'couple', kind: 'douki', v: 3, area: 1, leg: 'go', len: 72, half: 0.5, x: 133, y: 171, sit: true, bump: 9, group: 'bench', steps: R });
    }
    // 帰り：カップルが散歩していて、先輩が 2 人、カメラを持ってひそんでいる
    [[144, 'joshi', 1], [156, 'douki', 2]].forEach(([y, kind, v]) => {
      add({
        who: 'couple', kind, v, area: 1, leg: 'back', len: 64, half: 0.5, x: 300, y, group: 'walk',
        steps: [{ to: [214, y], speed: 20 }, { look: UP, dur: 2.0 }, { to: [104, y], speed: 20 }, { look: UP, dur: 1.6 }, { to: [44, y], speed: 20 }, { look: RIGHT, dur: 1.0 }, { to: [300, y], speed: 24 }, { look: LEFT, dur: 1.0 }],
      });
    });
    add(lurker(rnd, { v: 1, area: 1, at: [130, 124], look: DR, len: 66 }));
    add(lurker(rnd, { v: 4, area: 1, at: [244, 118], look: RIGHT, len: 66 }));

    // ── 住宅街 ──
    // 自転車：車道を右へ、少しして左へ。来る前にベルが鳴る
    const bikeSteps = (wait, sp) => [
      { warp: [-26, 112], face: RIGHT }, { hide: wait[0] }, { to: [346, 112], speed: sp, noTurn: true },
      { warp: [346, 126], face: LEFT }, { hide: wait[1] }, { to: [-26, 126], speed: sp, noTurn: true },
    ];
    add({ who: 'bike', kind: 'douki', v: 0, area: 2, leg: 'go', len: 92, half: 0.26, bump: 13, x: -26, y: 112, bike: true, steps: bikeSteps([4.2, 4.8], 118) });
    add({ who: 'bike', kind: 'kyaku', v: 4, area: 2, leg: 'back', len: 92, half: 0.26, bump: 13, x: -26, y: 112, bike: true, paper: true, steps: bikeSteps([2.6, 3.0], 128) });
    add({
      who: 'oldman', kind: 'kyaku', v: 1, area: 2, leg: 'go', len: 60, x: 20, y: 156,
      steps: [{ to: [300, 156], speed: 18 }, { look: UP, dur: 1.4 }, { look: LEFT, dur: 0.5 }, { to: [20, 156], speed: 18 }, { look: UP, dur: 1.4 }, { look: RIGHT, dur: 0.5 }],
    });
    // 犬にほえられると、家の人が窓から見る（alert）
    add({ who: 'resident', kind: 'kyaku', v: 2, area: 2, alert: true, len: 96, half: 0.62, x: 170, y: 62, steps: [{ look: DOWN, dur: 1 }] });
    add(lurker(rnd, { v: 0, area: 2, at: [226, 98], look: LEFT, len: 70 }));

    // ── 商店街 ──
    // 行き：酔っぱらいがふらふら。コンビニの店員は、ときどき外を見る
    add({ who: 'drunk', kind: 'kyaku', v: 4, area: 3, leg: 'go', len: 58, half: 0.5, x: 200, y: 140, sway: 0.35, drunk: true, steps: drunkSteps(rnd, 3, [200, 112], [{ x0: 40, x1: 344, y0: 98, y1: 116 }, { x0: 40, x1: 344, y0: 146, y1: 168 }], 16) });
    add({
      who: 'clerk', kind: 'tenin', v: 1, area: 3, leg: 'go', len: 86, half: 0.5, x: 226, y: 60, inside: true,
      steps: [{ look: LEFT, dur: 3.0, len: 40 }, { look: DOWN, dur: 2.2 }, { look: RIGHT, dur: 2.4, len: 40 }, { look: DOWN, dur: 1.8 }],
    });
    // 帰り：おまわりさんが見回り、酔っぱらいはベンチで寝ている。店員はゴミを出しに来る
    add({
      who: 'police', kind: 'police', area: 3, leg: 'back', len: 96, half: 0.42, x: 100, y: 106,
      steps: [
        { to: [290, 106], speed: 30 }, { look: DOWN, dur: 0.8 }, { to: [290, 156], speed: 30 }, { look: LEFT, dur: 0.6 },
        { to: [100, 156], speed: 30 }, { look: UP, dur: 0.8 }, { to: [100, 106], speed: 30 }, { look: RIGHT, dur: 0.6 },
      ],
    });
    add({
      who: 'drunk', kind: 'kyaku', v: 4, area: 3, leg: 'back', len: 52, half: 0.5, x: 344, y: 183, sit: true, drunk: true,
      steps: [{ sleep: 5.0 }, { look: LEFT, dur: 1.4, snap: true }, { look: DL, dur: 1.0 }, { sleep: 6.0 }, { look: UP, dur: 1.2, snap: true }],
    });
    add({
      who: 'clerk', kind: 'tenin', v: 1, area: 3, leg: 'back', len: 64, half: 0.5, x: 226, y: 76,
      steps: [{ hide: 5.0 }, { to: [226, 84], speed: 26 }, { to: [292, 88], speed: 26 }, { look: UP, dur: 1.4 }, { to: [226, 84], speed: 26 }, { to: [226, 76], speed: 26 }],
    });
    add(lurker(rnd, { v: 3, area: 3, at: [184, 94], look: DL, len: 66 }));

    // ── 駅前 ──
    add({
      who: 'ekiin', kind: 'ekiin', area: 4, len: 76, half: 0.5, x: 148, y: 80,
      steps: [{ look: LEFT, dur: 2.2 }, { look: DOWN, dur: 2.6 }, { look: DR, dur: 1.4 }, { look: DOWN, dur: 1.8 }],
    });
    add({
      who: 'police', kind: 'police', area: 4, len: 92, half: 0.42, x: 190, y: 168,
      steps: [{ look: LEFT, dur: 2.2 }, { look: UL, dur: 1.8 }, { look: LEFT, dur: 1.2 }, { look: DL, dur: 1.6 }],
    });
    // 電車の客（切符を買ったあとに、改札から出てくる）
    const PAX = [
      [[190, 64], [190, 92], [-24, 92]],
      [[196, 64], [196, 100], [84, 100], [84, 160], [-24, 160]],
      [[184, 64], [184, 96], [160, 104], [160, 186], [160, 240]],
      [[196, 64], [196, 90], [120, 106], [-24, 106]],
      [[190, 64], [190, 92], [280, 96]],
      [[184, 64], [184, 96], [90, 112], [90, 240]],
    ];
    PAX.forEach((pts, k) => {
      add({
        who: 'passenger', kind: 'kyaku', v: [0, 2, 3, 5, 6, 1][k], area: 4, leg: 'back', once: true, delay: 2.4 + k * 0.85, len: 56, half: 0.5,
        x: pts[0][0], y: pts[0][1], steps: pts.slice(1).map((p) => ({ to: p, speed: 34 })),
      });
    });
    return list;
  }
  // カメラを持ってひそむ先輩：かくれている → レンズが光る → 顔を出して見る → かくれる
  function lurker(rnd, o) {
    const steps = [{ warp: o.at, face: o.look }];
    for (let k = 0; k < 6; k++) steps.push({ hide: rnd(3.0, 5.0) }, { rustle: 0.7 }, { look: o.look, dur: rnd(1.5, 2.1), snap: true });
    return { who: 'senpai', kind: 'senpai', v: o.v, area: o.area, leg: 'back', len: o.len, half: 0.5, x: o.at[0], y: o.at[1], camera: true, steps };
  }
  // 酔っぱらいの行き先（物にぶつからない所を、乱数で n か所）
  function drunkSteps(rnd, area, start, zones, n) {
    const ax = AREAS[area].x;
    const steps = [];
    let x = start[0], y = start[1];
    for (let k = 0; k < n; k++) {
      let tx = x, ty = y;
      const zone = zones[k % zones.length]; // 上と下を、かわりばんこに
      for (let tries = 0; tries < 80; tries++) {
        const cx = rnd(zone.x0, zone.x1), cy = rnd(zone.y0, zone.y1);
        if (Math.hypot(cx - x, cy - y) < 36) continue;
        if (!clearPath(ax + x, y, ax + cx, cy)) continue;
        if (k === n - 1 && !clearPath(ax + cx, cy, ax + start[0], start[1])) continue;
        tx = cx;
        ty = cy;
        break;
      }
      steps.push({ to: [tx, ty], speed: rnd(15, 23) });
      if (rnd() < 0.75) steps.push({ look: rnd(-Math.PI, Math.PI), dur: rnd(0.6, 1.6) });
      x = tx;
      y = ty;
    }
    steps.push({ to: start, speed: 19 });
    return steps;
  }

  // 動きの予定を、時刻 → 位置と向き にする
  function compile(n) {
    const ax = AREAS[n.area].x;
    const segs = [];
    let x = ax + n.x, y = n.y;
    const first = n.steps.find((s) => s.look != null || s.to || s.face != null);
    let a = first ? (first.face != null ? first.face : first.look != null ? first.look : Math.atan2(first.to[1] - y, ax + first.to[0] - x)) : 0;
    let t = 0;
    const push = (dur, o) => {
      segs.push(Object.assign({ t0: t, dur, x0: x, y0: y, x1: x, y1: y, a0: a, a1: a }, o));
      t += dur;
    };
    const turn = (to) => {
      const d = angDiff(to, a);
      if (Math.abs(d) > 0.01) {
        push(0.22, { a1: a + d });
        a = to;
      }
    };
    n.steps.forEach((s) => {
      if (s.to) {
        const tx = ax + s.to[0], ty = s.to[1];
        const d = Math.hypot(tx - x, ty - y);
        if (d < 0.01) return;
        const na = Math.atan2(ty - y, tx - x);
        if (!s.noTurn) turn(na);
        a = na;
        const dur = d / s.speed;
        segs.push({ t0: t, dur, x0: x, y0: y, x1: tx, y1: ty, a0: na, a1: na, walk: true, len: s.len });
        t += dur;
        x = tx;
        y = ty;
      } else if (s.warp) {
        x = ax + s.warp[0];
        y = s.warp[1];
        if (s.face != null) a = s.face;
      } else if (s.hide != null) {
        push(s.hide, { hide: true });
      } else if (s.rustle != null) {
        push(s.rustle, { hide: true, rustle: true });
      } else if (s.sleep != null) {
        push(s.sleep, { sleep: true });
      } else if (s.look != null) {
        if (s.snap) a = s.look;
        else turn(s.look);
        push(s.dur, { a0: s.look, a1: s.look, len: s.len, heart: s.heart });
      }
    });
    // くりかえす人は、最後に最初の向きにもどる
    if (!n.once && segs.length && !segs[0].hide && !n.steps.some((s) => s.warp)) turn(segs[0].a0);
    segs.forEach((s, i) => { s.i = i; });
    return { segs, total: t };
  }
  function poseAt(plan, time, loop) {
    const { segs, total } = plan;
    const tt = loop ? ((time % total) + total) % total : time;
    let s = segs[segs.length - 1];
    for (const sg of segs) if (tt < sg.t0 + sg.dur) { s = sg; break; }
    const k = s.dur > 0 ? Math.min(1, Math.max(0, (tt - s.t0) / s.dur)) : 1;
    return {
      x: s.x0 + (s.x1 - s.x0) * k, y: s.y0 + (s.y1 - s.y0) * k, a: s.a0 + (s.a1 - s.a0) * k,
      walk: !!s.walk, hide: !!s.hide, rustle: !!s.rustle, sleep: !!s.sleep, len: s.len, heart: !!s.heart,
      seg: s, left: s.t0 + s.dur - tt,
    };
  }

  // ── 絵の部品 ─────────────────────────────────────────
  // 市松もようの塗り（光のくさび用）
  const pats = {};
  function pattern(ctx, col) {
    if (pats[col]) return pats[col];
    const c = OTK.makeCanvas(2, 2);
    const x2 = c.getContext('2d');
    x2.fillStyle = col;
    x2.fillRect(0, 0, 1, 1);
    x2.fillRect(1, 1, 1, 1);
    pats[col] = ctx.createPattern(c, 'repeat');
    return pats[col];
  }
  // 文字の地図から小さい絵を作る（. は透明）
  const arts = {};
  function art(key, rows, cols) {
    if (arts[key]) return arts[key];
    const c = OTK.makeCanvas(rows[0].length, rows.length);
    const x2 = c.getContext('2d');
    rows.forEach((row, y) => {
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
  // 犬（柴犬。右向き）
  const DOG_COL = { k: '#2c1808', m: '#d08838', w: '#f8e8d0', e: '#141018', n: '#141018', r: '#e04858' };
  const DOG_STAND = [
    '..........kk..',
    '.k.......kmmk.',
    'kmk.....kmmmmk',
    'kmmkkkkkkmmemn',
    '.kmmmmmmmmwwwk',
    '.kmmmmmmmmwwk.',
    '.kwwwwwwmmkk..',
    '..kmk..kmk....',
    '..kmk..kmk....',
    '..kk...kk.....',
  ];
  const DOG_BARK = [
    '..........kk..',
    '.k.......kmmk.',
    'kmk.....kmmmmk',
    'kmmkkkkkkmmemn',
    '.kmmmmmmmmwwwk',
    '.kmmmmmmmmwkrk',
    '.kwwwwwwmmkwwk',
    '..kmk..kmk.kk.',
    '..kmk..kmk....',
    '..kk...kk.....',
  ];
  const DOG_SLEEP = [
    '..............',
    '..............',
    '..............',
    '..........kk..',
    '.k.......kmmk.',
    'kmkkkkkkkmmmmk',
    'kmmmmmmmmmkkmn',
    '.kmmmmmmmwwwwk',
    '.kwwwwwwwwkkk.',
    '..kkkkkkkk....',
  ];
  // 段ボール箱（18×14）
  const BOX_ART = [
    '..kkkkkkkkkkkkkk..',
    '.kttttttwwttttttk.',
    'kttttttwwwwttttttk',
    'kddddddddddddddddk',
    'kmmmmmmmmmmmmmmmdk',
    'kmmmmmmmmmmmmmmmdk',
    'kmmmmmkkkkkmmmmmdk',
    'kmmmmmmmmmmmmmmmdk',
    'kmmmmmmmmmmmmmmmdk',
    'kmmmmmmmmmmmmmmmdk',
    'kmmmmmmmmmmmmmmmdk',
    'kmmmmmmmmmmmmmmmdk',
    'kddddddddddddddddk',
    '.kkkkkkkkkkkkkkkk.',
  ];
  const BOX_COL = { k: '#3c2410', t: '#d8b070', w: '#e8dcb0', d: '#8c6430', m: '#c08c4c' };
  const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
  // しっぱいしたときにたどりついたチェックポイント（もう一度遊ぶときは、そこから）
  const memo = { cp: 0 };

  OTK.register({
    id: 'kippu',
    order: 9,
    month: 3,
    event: '追いコン',
    title: '全裸で切符',
    goal: '見られずに\n切符を買え！',
    howto: ['十字キー：歩く　A：箱・買う', '光（視線）に入るな。かげで待て', '駅で切符を買い、寮の近くまで'],
    note: 'よい子はまねしないでください。\n見つかっても ♥ があるうちは、やりなおせる。',
    time: null,
    timeout: 'lose',
    bgm: 'tense',
    create(api) {
      const P = api.P, W = api.W, H = api.H;
      const easy = api.tries >= 2; // 2 回しっぱいしたら、♥ を 1 つふやし、視線を少し短く・見つかるまでを少し長く
      const lenMul = easy ? 0.9 : 1;
      const grace = easy ? GRACE + 0.15 : GRACE;
      const maxLives = LIVES + (easy ? 1 : 0);

      const NPCS = makeNpcs(api);
      const groupOff = {};
      NPCS.forEach((n) => {
        n.plan = compile(n);
        n.off = n.once || n.alert ? 0 : api.rnd(0, n.plan.total); // 動きの始まりを、遊ぶたびに少しずらす
        if (n.group) n.off = groupOff[n.group] != null ? groupOff[n.group] : (groupOff[n.group] = n.off); // 2 人組はそろえる
        n.t0 = null; // once：動き始める時刻
        n.a0 = -1; n.a1 = -1; // alert：家の人が窓から見ている時刻
      });
      const resident = NPCS.find((n) => n.alert);
      const boxes = [{ area: 3, hx: AREAS[3].x + AREAS[3].box[0], hy: AREAS[3].box[1] }];
      boxes.forEach((b) => { b.x = b.hx; b.y = b.hy; });

      const me = { x: CPS[0].x, y: CPS[0].y, face: 'down', walk: 0, moving: false, ticket: false, buy: 0, buying: false, box: null };
      let lives = maxLives;
      let cp = 0; // いまのチェックポイント
      let npcT = 0; // 人の動きの時計（見つかっている間は止まる）
      let seenT = 0, watcher = -1; // seenT：光の中にいる時間（「？」）、watcher：見ている人
      let caught = null; // { i, t, x, y }
      let fade = null; // { t, dir } 暗転してチェックポイントへもどる
      let won = false, winT = 0;
      let camX = 0;
      let say = null; // 吹き出し { x, y, str, t, col }
      let banner = null; // エリアの名前 { str, sub, t }
      let hint = null; // 画面の下の小さい説明 { str, t }
      let trainT = -1; // 電車が着いた時刻
      let tickT = 0;
      let lastArea = -1;
      const entered = { go: new Set(), back: new Set() };
      const dog = { barkT: -99, nextOk: 0, tail: 0 };
      const fx = [];
      const stats = { caught: 0, cps: [0], boxUsed: 0, barks: 0 };
      const touch = { box: false };

      // しっぱいのあとのもう一度は、前回のチェックポイントから
      const resume = api.tries > 0 && memo.cp > 0 ? memo.cp : 0;

      const activeLeg = (n) => n.leg === 'both' || (n.leg === 'back') === me.ticket;
      // i 番目の人の、時刻 t の姿（いないときは null）
      function poseOf(i, t) {
        const n = NPCS[i];
        if (!activeLeg(n)) return null;
        if (n.alert) {
          if (t < n.a0 || t >= n.a1) return null;
          return { x: AREAS[n.area].x + n.x, y: n.y, a: DOWN, walk: false, hide: false };
        }
        let ps;
        if (n.once) {
          if (n.t0 == null || t < n.t0 || t >= n.t0 + n.plan.total) return null;
          ps = poseAt(n.plan, t - n.t0, false);
        } else ps = poseAt(n.plan, t + n.off, true);
        if (n.sway && !ps.hide && !ps.sleep) ps.a += Math.sin((t + n.off) * 2.3) * n.sway;
        return ps;
      }
      // その人から (x, y) が見えるか（0：見えない、1：見える、2：ぶつかった）
      function sees(n, ps, x, y) {
        if (!ps || ps.hide) return 0;
        const dx = x - ps.x, dy = y - ps.y;
        const d = Math.hypot(dx, dy);
        if (d < n.bump) return 2;
        if (ps.sleep) return 0;
        const ar = AREAS[n.area];
        if (x < ar.x || x > ar.x + ar.w) return 0;
        if (d > (ps.len || n.len) * lenMul) return 0;
        if (Math.abs(angDiff(Math.atan2(dy, dx), ps.a)) > n.half) return 0;
        return rayLen(n.area, ps.x, ps.y, dx / d, dy / d, d) >= d - 0.5 ? 1 : 0;
      }
      // テスト用：今から ahead 秒後に (x, y) にいたら、だれかに見えるか（見えなければ -1）
      function visibleAt(x, y, ahead) {
        const tt = npcT + (ahead || 0);
        const ar = areaAt(x);
        for (let i = 0; i < NPCS.length; i++) {
          if (NPCS[i].area !== ar) continue;
          if (sees(NPCS[i], poseOf(i, tt), x, y)) return i;
        }
        return -1;
      }
      const dogAwake = (t) => {
        const [aw, sl] = me.ticket ? [9, 3] : [6, 5];
        return ((t + 2) % (aw + sl)) < aw;
      };
      // テスト用：今から ahead 秒後に (x, y) にいたら、犬がほえるか
      function wouldBark(x, y, ahead) {
        const t = npcT + (ahead || 0);
        if (areaAt(x) !== DOG.area || t < dog.nextOk) return false;
        return api.dist(x, y, DOG.x, DOG.y) < (dogAwake(t) ? DOG.rAwake : DOG.rSleep);
      }

      function talk(x, y, str, sec, col) { say = { x, y, str, t: sec || 1.4, col: col || P.ink }; }
      function pop(str, x, y, col, sec) { fx.push({ str, x, y, col: col || P.white, t: 0, dur: sec || 0.9 }); }
      function showHint(str, sec) { hint = { str, t: sec || 2.5 }; }

      // チェックポイントへ（はじめ・見つかったあと・テストの warp）
      function placeAt(i) {
        const c = CPS[i];
        cp = i;
        me.x = c.x;
        me.y = c.y;
        me.ticket = c.ticket;
        me.buy = 0;
        me.buying = false;
        me.box = null;
        me.face = c.ticket ? 'left' : 'right';
        boxes.forEach((b) => { b.x = b.hx; b.y = b.hy; });
        seenT = 0;
        watcher = -1;
        caught = null;
        camX = camTarget();
        lastArea = c.area;
      }
      function startTrain() {
        trainT = npcT + 2.0;
        NPCS.forEach((n) => { if (n.once) n.t0 = npcT + n.delay; });
      }
      function warp(i) {
        i = api.clamp(i | 0, 0, CPS.length - 1);
        placeAt(i);
        if (CPS[i].ticket && trainT < 0) {
          if (i === CP_BUY) startTrain();
          else { trainT = -999; NPCS.forEach((n) => { if (n.once) n.t0 = -999; }); }
        }
        for (let k = 0; k <= i; k++) if (!stats.cps.includes(k)) stats.cps.push(k);
        banner = { str: AREAS[CPS[i].area].name, sub: me.ticket ? '帰り' : '行き', t: 0 };
        (me.ticket ? entered.back : entered.go).add(CPS[i].area);
        fade = null;
      }

      function catchBy(i, ps) {
        const n = NPCS[i];
        const w = WHO[n.who];
        caught = { i, t: 0, x: ps.x, y: ps.y };
        lives--;
        stats.caught++;
        stats.last = { who: n.who, i, x: Math.round(me.x), y: Math.round(me.y), t: +npcT.toFixed(2) };
        me.buying = false;
        api.sfx(n.who === 'police' ? 'siren' : 'surprise');
        api.shake(2, 0.3);
        api.flash(P.white, n.who === 'senpai' ? 0.3 : 0.12);
        talk(ps.x, ps.y - 26, w.shout, 2, P.red);
        if (lives <= 0) {
          memo.cp = cp;
          api.lose(w.caught, { wait: 1.6 });
        }
      }

      function camTarget() {
        const a = AREAS[areaAt(me.x)];
        return api.clamp(me.x - W / 2, a.x, a.x + a.w - W);
      }

      // ── 描く道具 ──
      function bubble(g, str, cx, by, col) {
        const w = g.measure(str, 12) + 8;
        const x = Math.round(api.clamp(cx - w / 2, camX + 2, camX + W - w - 2)), y = Math.round(api.clamp(by - 15, TOPY + 2, H - 20));
        g.R(x - 1, y, w + 2, 14, P.black);
        g.R(x, y - 1, w, 16, P.black);
        g.R(x, y, w, 14, P.white);
        const tx = Math.round(api.clamp(cx, x + 3, x + w - 4));
        g.R(tx - 1, y + 14, 3, 2, P.white);
        g.R(tx - 2, y + 14, 1, 2, P.black);
        g.R(tx + 2, y + 14, 1, 2, P.black);
        g.R(tx, y + 16, 1, 1, P.black);
        g.text(str, x + 4, y + 1, { size: 12, col: col || P.ink });
      }
      function arrow(g, x, y, col, dir) {
        // はねる ▼（dir が 'left' なら ◀）
        const b = Math.round(Math.abs(Math.sin(api.time * 5)) * 4);
        if (dir === 'left') {
          x -= b;
          for (let i = 0; i < 5; i++) {
            g.R(x + i, y - i - 1, 1, i * 2 + 3, P.black);
            g.R(x + i + 1, y - i, 1, i * 2 + 1, col);
          }
          return;
        }
        y -= b;
        g.R(x - 5, y - 1, 11, 1, P.black);
        for (let i = 0; i < 5; i++) {
          g.R(x - 4 + i, y + i, 9 - i * 2, 1, col);
          g.R(x - 5 + i, y + i, 1, 1, P.black);
          g.R(x + 5 - i, y + i, 1, 1, P.black);
        }
        g.R(x, y + 5, 1, 1, P.black);
      }
      function ticketIcon(g, x, y, on) {
        g.R(x - 1, y - 1, 16, 10, on ? P.black : P.dgray);
        g.R(x, y, 14, 8, on ? '#f8e8c0' : P.xdgray);
        if (!on) return;
        g.R(x + 1, y + 1, 12, 1, P.mblue);
        g.R(x + 2, y + 3, 6, 1, P.dgray);
        g.R(x + 2, y + 5, 8, 1, P.dgray);
        g.R(x + 11, y + 3, 2, 3, P.red);
      }
      function heart(g, x, y, col) {
        HEART.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') g.R(x + i, y + j, 1, 1, col); });
      }
      function glow(g, x, y, r, col, a) {
        g.ctx.save();
        g.ctx.globalAlpha = a || 0.12;
        g.oval(x, y, r, r * 0.42, col || P.lyellow);
        g.ctx.restore();
      }
      function star(g, x, y, col) {
        g.R(x, y - 2, 1, 5, col);
        g.R(x - 2, y, 5, 1, col);
      }

      // ── 地面 ──
      function tiles(g, x, y, w, h, base, line, sx, sy) {
        g.R(x, y, w, h, base);
        for (let j = y + sy; j < y + h; j += sy) g.R(x, j, w, 1, line);
        for (let i = x + sx; i < x + w; i += sx) g.R(i, y, 1, h, line);
      }
      function asphalt(g, x, y, w, h) {
        g.R(x, y, w, h, '#2c2c34');
        for (let i = 0; i < w * h / 180; i++) {
          const px = x + ((i * 37) % w), py = y + ((i * 53 + (i >> 3) * 7) % h);
          g.R(px, py, 1, 1, '#38383f');
        }
      }
      function drawGround(g, a) {
        const x0 = a.x;
        switch (a.id) {
          case 'ryo':
            tiles(g, x0, TOPY, 182, 108, '#55555d', '#4c4c54', 16, 16); // 寮の前のコンクリート
            asphalt(g, x0 + 182, TOPY, 74, 108); // となりの駐車場
            for (let i = 0; i < 3; i++) g.R(x0 + 190 + i * 22, 84, 1, 40, '#8c8c94');
            asphalt(g, x0, 132, a.w, 68); // 寮の前の道
            g.R(x0, 135, a.w, 1, '#6c6c74');
            g.R(x0, 196, a.w, 1, '#6c6c74');
            g.R(x0 + 60, 132, 36, 3, '#44444c'); // 門の前の段
            g.disc(x0 + 210, 176, 5, '#3c3c44'); // マンホール
            g.ring(x0 + 210, 176, 5, '#24242c');
            break;
          case 'kawa':
            g.R(x0, TOPY, a.w, 78, '#183c24'); // 土手の草
            for (let i = 0; i < 70; i++) {
              const gx = x0 + ((i * 41) % a.w), gy = 70 + ((i * 29) % 30);
              g.R(gx, gy, 1, 2, '#2c5c34');
              g.R(gx + 2, gy - 1, 1, 3, '#2c5c34');
            }
            g.R(x0, 102, a.w, 82, '#5c5444'); // 川ぞいの道（じゃり）
            for (let i = 0; i < 120; i++) g.R(x0 + ((i * 37) % a.w), 104 + ((i * 23) % 78), 2, 1, i % 3 ? '#6c6450' : '#4c4638');
            g.R(x0, 102, a.w, 1, '#3c3830');
            g.R(x0, 188, a.w, 36, '#141c48'); // 川
            for (let i = 0; i < 24; i++) {
              const rx = x0 + ((i * 53 + Math.floor(api.time * 6) * (i % 2 ? 1 : -1)) % a.w + a.w) % a.w, ry = 192 + ((i * 17) % 28);
              g.R(rx, ry, 6 + (i % 4), 1, i % 3 ? '#2c3c7c' : '#5c6cac');
            }
            // 街灯が川にうつる
            [76, 208].forEach((lx) => { for (let j = 0; j < 4; j++) g.R(x0 + lx - 2 + ((j * 3) % 5), 194 + j * 7, 5, 1, '#c8b860'); });
            break;
          case 'jutaku':
            tiles(g, x0, 80, a.w, 20, '#55555d', '#4c4c54', 10, 10); // 上の歩道
            asphalt(g, x0, 100, a.w, 50); // 車道
            for (let x = x0 + 4; x < x0 + a.w; x += 22) g.R(x, 126, 12, 2, '#a8a8a0');
            g.R(x0, 101, a.w, 1, '#6c6c74');
            g.R(x0, 149, a.w, 1, '#6c6c74');
            tiles(g, x0, 150, a.w, 12, '#55555d', '#4c4c54', 10, 12); // 下の歩道
            g.R(x0 + 66, 162, 34, 44, '#34343c'); // 路地
            g.R(x0 + 220, 162, 36, 44, '#34343c');
            g.R(x0 + 92, TOPY, 32, 56, '#34343c');
            g.R(x0 + 218, TOPY, 32, 56, '#34343c');
            g.R(x0 + 128, 68, 86, 24, '#4c5c3c'); // 犬のいる庭
            g.R(x0 + 92, 80, 36, 1, '#4c4c54');
            break;
          case 'shoten':
            // 商店街のタイル（2 色の市松）
            g.R(x0, 74, a.w, 122, '#5c5048');
            for (let y = 74; y < 196; y += 12) for (let x = x0 + (((y - 74) / 12) % 2) * 12; x < x0 + a.w; x += 24) g.R(x, y, 12, 12, '#665a50');
            g.R(x0, 74, a.w, 2, '#3c342c');
            g.R(x0, TOPY, a.w, 50, '#2c2428');
            break;
          case 'eki':
            g.R(x0, 62, a.w, 162, '#4c4c5c');
            for (let y = 62; y < 224; y += 16) for (let x = x0 + ((((y - 62) / 16) % 2) * 16); x < x0 + a.w; x += 32) g.R(x, y, 16, 16, '#545466');
            g.R(x0, 84, a.w, 3, '#a89838'); // 点字ブロック
            g.R(x0 + 188, 68, 3, 18, '#a89838');
            g.R(x0, TOPY, a.w, 40, '#2c2c3c');
            break;
          default:
            g.R(x0, TOPY, a.w, H - TOPY, P.dgray);
        }
        a.lights.forEach(([lx, ly, r]) => glow(g, x0 + lx, ly, r, P.lyellow, 0.1));
      }

      // ── 物 ──
      function drawSolid(g, b) {
        const x = b.x, y = b.y, w = b.w, h = b.h;
        switch (b.kind) {
          case 'dorm': {
            // 夕照寮：屋上、3 階ぶんの窓、玄関
            g.R(x, TOPY, w, 4, '#5c5c68');
            g.R(x, TOPY + 4, w, h - 4, '#9c9ca4');
            g.R(x, TOPY + 4, w, 1, '#c8c8cc');
            for (let f = 0; f < 3; f++) {
              for (let i = 0; i < 8; i++) {
                const wx = x + 6 + i * 21, wy = TOPY + 8 + f * 17;
                if (f === 2 && (i === 3 || i === 4)) continue;
                const lit = (i * 7 + f * 3) % 5 < 3;
                g.R(wx, wy, 14, 11, P.ink);
                g.R(wx + 1, wy + 1, 12, 9, lit ? '#f8d878' : '#1c2448');
                g.R(wx + 7, wy + 1, 1, 9, lit ? '#c8a050' : '#283058');
              }
            }
            // 窓から見送る先輩たち（見ているだけ）
            [[6 + 1 * 21, 8 + 17], [6 + 5 * 21, 8 + 17], [6 + 2 * 21, 8]].forEach(([wx, wy], k) => {
              const hx = x + wx + 4, hy = TOPY + wy + 3;
              g.R(hx, hy, 6, 6, P.skin);
              g.R(hx, hy, 6, 2, '#241c1c');
              g.R(hx + 1, hy + 3, 1, 1, P.ink);
              g.R(hx + 4, hy + 3, 1, 1, P.ink);
              if (Math.floor(api.time * 3 + k) % 2) g.R(hx + 7, hy - 2, 2, 4, P.skin); // 手をふる
            });
            // 玄関
            g.R(x + 64, y + h - 20, 30, 20, P.ink);
            g.R(x + 66, y + h - 18, 26, 18, '#f8e0a0');
            g.R(x + 78, y + h - 18, 2, 18, '#c8a060');
            g.R(x + 60, y + h - 23, 38, 3, '#5c5c68');
            // 表札
            g.R(x + 100, y + h - 19, 42, 15, P.ink);
            g.R(x + 101, y + h - 18, 40, 13, P.cream);
            g.text('夕照寮', x + 121, y + h - 19, { size: 12, align: 'center', col: P.ink });
            break;
          }
          case 'house':
          case 'dogHouse': {
            const v = b.v | 0;
            const roof = b.kind === 'dogHouse' ? '#3c4c6c' : ['#5c2c2c', '#2c4c4c', '#4c3c5c'][v % 3];
            const wall = b.kind === 'dogHouse' ? '#c8c0a8' : ['#c8b898', '#b8b8b0', '#d8c8a8'][v % 3];
            const fh = Math.min(30, h - 10); // 正面の壁の高さ
            g.R(x, TOPY, w, y + h - fh - TOPY, roof);
            for (let j = TOPY + 2; j < y + h - fh; j += 4) g.R(x, j, w, 1, '#00000033');
            g.R(x, y + h - fh - 2, w, 2, P.ink);
            g.R(x, y + h - fh, w, fh, wall);
            g.R(x, y + h - fh, w, 1, P.white);
            if (b.kind === 'dogHouse') {
              // 窓（犬がほえると、明かりがついて家の人が見る）
              const lit = npcT >= dog.barkT && npcT < resident.a1 + 0.3;
              const wx = DOG.x - 9, wy = y + h - fh + 4;
              g.R(wx - 1, wy - 1, 20, 14, P.ink);
              g.R(wx, wy, 18, 12, lit ? '#f8d878' : '#1c2448');
              if (lit && npcT >= resident.a0 && npcT < resident.a1) {
                g.R(wx + 6, wy + 3, 6, 6, P.skin);
                g.R(wx + 6, wy + 2, 6, 2, '#5c3418');
                g.R(wx + 7, wy + 5, 1, 1, P.ink);
                g.R(wx + 10, wy + 5, 1, 1, P.ink);
                g.R(wx + 4, wy + 9, 10, 3, '#5080a0');
              }
              g.R(wx + 8, wy, 1, 12, P.ink);
              g.R(x + 8, y + h - 22, 12, 22, '#7c5c3c'); // 玄関
              g.R(x + 60, y + h - 20, 18, 16, '#3c3428'); // 犬小屋
              g.R(x + 58, y + h - 24, 22, 4, '#8c3c2c');
            } else {
              g.R(x + 8, y + h - fh + 6, 14, 10, (x + v) % 3 ? '#f8d878' : '#1c2448');
              g.R(x + 15, y + h - fh + 6, 1, 10, P.ink);
              g.R(x + w - 22, y + h - 22, 12, 22, '#7c5c3c');
            }
            break;
          }
          case 'wall':
          case 'wallB': {
            // ブロック塀（wallB は奥に家の屋根）
            const top = b.kind === 'wallB' ? y : y - 8;
            if (b.kind === 'wallB') {
              g.R(x, y + 10, w, h - 10, '#3c3440');
              for (let j = y + 14; j < y + h; j += 5) g.R(x, j, w, 1, '#2c2430');
            }
            g.R(x, top, w, (b.kind === 'wallB' ? 12 : h + 8), '#7c786c');
            g.R(x, top, w, 2, '#a8a49c');
            for (let j = top + 4; j < top + (b.kind === 'wallB' ? 12 : h + 8); j += 4) {
              g.R(x, j, w, 1, '#6c6858');
              for (let i = x + ((j >> 2) % 2) * 4; i < x + w; i += 8) g.R(i, j - 3, 1, 3, '#6c6858');
            }
            break;
          }
          case 'car': {
            const col = ['#a83030', '#3c6c9c'][b.v | 0];
            g.shadow(x + w / 2, y + h, w / 2 + 2);
            g.R(x + 1, y - 6, w - 2, h + 6, P.ink);
            g.R(x, y - 5, w, h + 4, P.ink);
            g.R(x + 1, y - 5, w - 2, h + 3, col);
            g.R(x + 8, y - 3, w - 18, h - 1, '#1c2c48'); // 窓
            g.R(x + 12, y - 1, w - 26, h - 5, col); // 屋根
            g.R(x + 1, y + h - 4, 4, 3, P.lyellow);
            g.R(x + w - 5, y + h - 4, 4, 3, P.red);
            break;
          }
          case 'vend': {
            const top = y - 18;
            g.R(x, top, w, h + 18, P.black);
            g.R(x + 1, top + 1, w - 2, h + 16, b.v ? P.mblue : P.red);
            g.R(x + 2, top + 3, w - 4, 10, P.lsky);
            for (let i = 0; i < 3; i++) g.R(x + 3 + i * 3, top + 5, 2, 5, [P.yellow, P.white, P.lgreen][i]);
            g.R(x + 2, top + 15, w - 4, 1, P.white);
            g.R(x + 3, y + h - 6, w - 6, 3, P.black);
            glow(g, x + w / 2, y + h + 2, 14, P.lsky, 0.12);
            break;
          }
          case 'gomi': {
            g.R(x, y - 10, w, h + 10, P.black);
            g.R(x + 1, y - 9, w - 2, 5, '#3c8c7c');
            g.R(x + 1, y - 9, w - 2, 1, '#6cbcac');
            g.R(x + 1, y - 4, w - 2, h + 3, '#2c6c60');
            for (let i = x + 3; i < x + w - 2; i += 3) g.R(i, y - 3, 1, h + 1, '#1c4c44');
            break;
          }
          case 'pole': {
            g.shadow(x + 3, y + 4, 5);
            g.R(x + 1, y - 40, 5, 45, '#8c8478');
            g.R(x + 1, y - 40, 1, 45, '#bcb4a0');
            g.R(x - 5, y - 36, 17, 2, '#5c5448');
            g.R(x + 4, y - 20, 6, 9, P.white);
            g.R(x + 5, y - 19, 4, 1, P.dgray);
            g.R(x + 5, y - 16, 4, 1, P.dgray);
            break;
          }
          case 'hedgeRow':
          case 'bush':
          case 'planter': {
            const top = y - 8;
            g.R(x, top, w, h + 8, '#0c3818');
            const dark = b.kind === 'hedgeRow';
            g.R(x + 1, top + 1, w - 2, h + 2, dark ? '#14501c' : '#187c2c');
            for (let i = 0; i < w - 3; i += 4) for (let j = 0; j < h; j += 4) g.R(x + 2 + i + ((j / 4) & 1) * 2, top + 2 + j, 2, 2, dark ? '#206828' : '#38a840');
            if (b.kind === 'planter') {
              g.R(x + 1, y + h - 5, w - 2, 4, '#8c8478');
              g.R(x + 1, y + h - 5, w - 2, 1, '#bcb4a0');
            } else g.R(x + 1, y + h - 3, w - 2, 2, '#0c3818');
            break;
          }
          case 'backs': {
            // 川ぞいの家の裏（板塀と屋根）
            g.R(x, TOPY, w, h - 14, '#2c2830');
            for (let i = 0; i < w; i += 40) {
              g.R(x + i + 2, TOPY, 34, h - 18, ['#4c3c3c', '#3c444c', '#4c443c'][(i / 40) % 3]);
              for (let j = TOPY + 2; j < y + h - 18; j += 4) g.R(x + i + 2, j, 34, 1, '#00000040');
              if ((i / 40) % 2) { g.R(x + i + 12, y + h - 30, 10, 8, '#f8d878'); g.R(x + i + 17, y + h - 30, 1, 8, P.ink); }
            }
            g.R(x, y + h - 14, w, 14, '#6c4c2c');
            for (let i = x; i < x + w; i += 5) g.R(i, y + h - 14, 1, 14, '#4c3420');
            g.R(x, y + h - 14, w, 1, '#8c6c4c');
            break;
          }
          case 'tree': {
            // 桜（夜桜）。木のうしろにいる男魂くんが見えるように、近いときはうすく描く
            const cx = x + 4, cy = y - 22;
            g.R(x + 1, y - 12, 6, h + 12, '#3c2418');
            g.R(x + 2, y - 12, 1, h + 12, '#5c3c28');
            const near = Math.abs(me.x - cx) < 18 && me.y < y + 6 && me.y > y - 34;
            g.ctx.save();
            if (near) g.ctx.globalAlpha = 0.45;
            g.disc(cx, cy, 15, '#a85878');
            g.disc(cx - 5, cy - 4, 9, '#d888a8');
            g.disc(cx + 5, cy + 3, 8, '#c87098');
            for (let i = 0; i < 10; i++) g.R(cx - 11 + ((i * 7) % 22), cy - 9 + ((i * 11) % 18), 1, 1, i % 3 ? '#f8d0e0' : P.white);
            g.ctx.restore();
            break;
          }
          case 'shed': {
            // 公衆トイレ
            g.R(x - 2, TOPY + 24, w + 4, 6, '#4c4c58');
            g.R(x, TOPY + 30, w, y + h - TOPY - 30, '#8c9c8c');
            g.R(x, TOPY + 30, w, 1, '#b8c8b8');
            g.R(x + 6, y + h - 20, 12, 20, '#2c3c4c');
            g.R(x + 28, y + h - 20, 12, 20, '#4c2c2c');
            g.R(x + 9, y + h - 28, 6, 6, P.mblue);
            g.R(x + 31, y + h - 28, 6, 6, P.red);
            glow(g, x + w / 2, y + h + 2, 18, P.white, 0.1);
            break;
          }
          case 'lamp': {
            g.R(x + 1, y - 34, 3, 38, '#5c5c68');
            g.R(x + 2, y - 34, 1, 38, '#8c8c98');
            g.R(x - 3, y - 38, 11, 4, '#3c3c48');
            g.R(x - 2, y - 35, 9, 2, P.lyellow);
            break;
          }
          case 'bench': {
            g.R(x, y - 5, w, 3, '#8c5c34');
            g.R(x, y - 2, w, 2, '#5c3c20');
            g.R(x + 2, y, 2, h - 1, P.xdgray);
            g.R(x + w - 4, y, 2, h - 1, P.xdgray);
            break;
          }
          case 'rail': {
            g.R(x, y - 6, w, 2, '#8c8c98');
            for (let i = x + 2; i < x + w; i += 12) g.R(i, y - 6, 2, h + 6, '#6c6c78');
            g.R(x, y + h - 1, w, 1, '#3c3c48');
            break;
          }
          case 'river':
            break; // 水は地面で描く
          case 'barrier': {
            // 工事中の柵（黄色と黒のしま）
            g.R(x, y - 12, w, 4, P.ink);
            for (let i = 0; i < w; i += 6) g.R(x + i, y - 11, 3, 2, P.yellow);
            g.R(x + 2, y - 8, 2, h + 8, P.dgray);
            g.R(x + w - 4, y - 8, 2, h + 8, P.dgray);
            g.R(x, y + h - 6, w, 4, P.ink);
            for (let i = 0; i < w; i += 6) g.R(x + i + 1, y + h - 5, 3, 2, P.yellow);
            g.R(x + w / 2 - 8, y - 6, 16, 9, P.white);
            g.text('工事', x + w / 2, y - 8, { size: 12, align: 'center', col: P.red });
            g.R(x - 1, y - 16, 4, 4, g.blink(1.5) ? P.red : P.dred);
            break;
          }
          case 'fence': {
            g.R(x, y - 10, w, 2, '#9c9c9c');
            for (let i = x; i < x + w; i += 4) g.R(i, y - 10, 1, h + 10, '#7c7c7c');
            g.R(x, y + h - 2, w, 2, '#5c5c5c');
            break;
          }
          case 'shop': {
            const v = b.v | 0;
            g.R(x, TOPY, w, y + h - TOPY - 26, ['#4c3c34', '#3c4048', '#443c48', '#3c4840'][v % 4]);
            g.R(x + 2, y + h - 34, w - 4, 10, ['#e8e0c8', '#c8e0f0', '#f0e0c0', '#e0f0e0'][v % 4]);
            g.text(b.label || '', x + w / 2, y + h - 35, { size: 12, align: 'center', col: P.ink });
            g.R(x, y + h - 24, w, 24, '#8c8c8c'); // シャッター
            for (let j = y + h - 23; j < y + h; j += 2) g.R(x, j, w, 1, '#747474');
            g.R(x, y + h - 24, w, 1, '#b8b8b8');
            break;
          }
          case 'izakaya': {
            g.R(x, TOPY, w, y + h - TOPY - 26, '#3c2c24');
            g.R(x, y + h - 26, w, 26, '#6c4c34');
            g.R(x + 14, y + h - 24, w - 28, 24, '#f8c880');
            for (let i = 0; i < 4; i++) g.R(x + 16 + i * 11, y + h - 24, 9, 10, '#2c2c5c'); // のれん
            g.text('酒', x + w / 2, y + h - 40, { size: 12, align: 'center', col: P.white });
            [[x + 6, y + h - 22], [x + w - 12, y + h - 22]].forEach(([lx, ly]) => {
              // 赤ちょうちん
              g.R(lx, ly, 7, 9, P.ink);
              g.R(lx + 1, ly + 1, 5, 7, P.red);
              g.R(lx + 2, ly + 2, 1, 5, '#f87858');
              g.R(lx + 3, ly - 2, 1, 2, P.ink);
            });
            break;
          }
          case 'conveni': {
            // 明るい店の中（店員も中に描く）と、ガラス
            g.R(x, TOPY, w, 16, P.white);
            g.R(x, TOPY + 13, w, 1, P.mblue);
            g.R(x, TOPY + 15, w, 1, P.lgreen);
            g.text('コンビニ', x + w / 2, TOPY + 1, { size: 12, align: 'center', col: P.mblue });
            g.R(x, TOPY + 16, w, h - 16, '#e8f0f0');
            for (let i = 0; i < 3; i++) {
              const sx = x + 8 + i * 30;
              g.R(sx, TOPY + 18, 22, 6, '#a8c8d8');
              for (let q = 0; q < 5; q++) g.R(sx + 1 + q * 4, TOPY + 19, 3, 3, [P.red, P.yellow, P.lgreen, P.orange, P.white][(i + q) % 5]);
            }
            g.R(x + 10, TOPY + 32, 30, 6, '#8c8c98'); // レジ
            NPCS.forEach((n, i) => {
              if (!n.inside || !activeLeg(n)) return;
              const ps = poseOf(i, npcT);
              if (ps && !ps.hide) drawNpc(g, n, ps, i);
            });
            g.ctx.save();
            g.ctx.globalAlpha = 0.28;
            g.R(x, TOPY + 16, w, h - 16, P.lsky);
            g.ctx.restore();
            g.R(x, y + h - 2, w, 2, '#8c9ca8');
            g.R(x + 34, y + h - 20, 28, 20, '#c8e8f0'); // 自動ドア
            g.R(x + 47, y + h - 20, 2, 20, '#8c9ca8');
            g.R(x, TOPY + 16, 3, h - 16, '#8c9ca8');
            g.R(x + w - 3, TOPY + 16, 3, h - 16, '#8c9ca8');
            break;
          }
          case 'cwall':
            break;
          case 'bins': {
            for (let i = 0; i < 2; i++) {
              g.R(x + i * 10, y - 8, 9, h + 8, P.ink);
              g.R(x + i * 10 + 1, y - 7, 7, h + 6, i ? '#3c6c9c' : '#3c8c4c');
              g.R(x + i * 10 + 1, y - 7, 7, 2, i ? '#6c9ccc' : '#6cbc7c');
            }
            break;
          }
          case 'sign': {
            // 立て看板（A 型）
            g.R(x, y - 16, w, 18, P.ink);
            g.R(x + 1, y - 15, w - 2, 15, P.cream);
            g.R(x + 2, y - 13, w - 4, 1, P.red);
            g.R(x + 2, y - 10, w - 4, 1, P.dgray);
            g.R(x + 2, y - 7, w - 6, 1, P.dgray);
            break;
          }
          case 'boxes': {
            // 段ボールの山（資源ごみ）
            g.sprite(art('box', BOX_ART, BOX_COL), x - 2, y - 2);
            g.sprite(art('box', BOX_ART, BOX_COL), x + 8, y + 2);
            g.sprite(art('box', BOX_ART, BOX_COL), x + 3, y - 12);
            break;
          }
          case 'bikes': {
            for (let i = 0; i < w - 6; i += 9) {
              g.ring(x + i + 5, y + 6, 4, P.gray);
              g.R(x + i + 4, y - 4, 2, 10, ['#c83838', '#3878c8', '#d8d8d8', '#38a858'][(i / 9) % 4]);
              g.R(x + i + 2, y - 5, 6, 1, P.lgray);
            }
            break;
          }
          case 'backs2': {
            g.R(x, y, w, h, '#2c2428');
            g.R(x, y, w, 2, '#4c4448');
            for (let i = x + 20; i < x + w; i += 64) { g.R(i, y + 6, 14, 10, '#5c5c64'); g.R(i + 2, y + 8, 10, 6, '#3c3c44'); }
            break;
          }
          case 'station':
          case 'locker': {
            if (b.kind === 'locker') {
              // コインロッカーのある、くぼみ
              g.R(x, TOPY, w, h, '#5c5c6c');
              for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { g.R(x + 1 + i * 8, TOPY + 2 + j * 6, 7, 5, '#a8b0c0'); g.R(x + 6 + i * 8, TOPY + 4 + j * 6, 1, 1, P.ink); }
              g.R(x, y + h, w, 16, '#3c3c48'); // くぼみの床
              break;
            }
            g.R(x, TOPY, w, h, '#c8c0a8');
            g.R(x, TOPY, w, 3, '#5c5c6c');
            g.R(x, y + h - 2, w, 2, '#8c8470');
            if (b.main) {
              // 駅の看板（券売機の上に「きっぷ」、改札の上に「駅」）と、改札の奥の明かり
              const ax = AREAS[4].x;
              g.R(ax + 80, TOPY + 4, 40, 13, P.navy);
              g.text('きっぷ', ax + 100, TOPY + 4, { size: 12, align: 'center', col: P.white });
              g.R(ax + 174, TOPY + 3, 36, 15, P.ink);
              g.R(ax + 175, TOPY + 4, 34, 13, P.white);
              g.text('駅', ax + 192, TOPY + 4, { size: 12, align: 'center', col: P.navy });
              g.R(ax + 160, TOPY + 22, 64, 14, '#f8e8b0');
              g.R(ax + 160, TOPY + 22, 64, 2, '#c8b880');
              g.R(ax + 228, TOPY + 6, 24, 12, '#f8d878');
            }
            break;
          }
          case 'pillar': {
            g.R(x, y - 30, w, h + 30, '#8c8478');
            g.R(x, y - 30, 2, h + 30, '#bcb4a0');
            g.R(x + w - 1, y - 30, 1, h + 30, '#5c5448');
            break;
          }
          case 'kenbaiki': {
            for (let i = 0; i < 2; i++) {
              const kx = x + i * 20 + 2;
              g.R(kx, y - 10, 17, h + 10, '#1c3c8c');
              g.R(kx + 1, y - 9, 15, 1, '#3c5cac');
              g.R(kx + 2, y - 7, 13, 7, P.lsky);
              g.R(kx + 3, y - 6, 5, 1, P.white);
              g.R(kx + 3, y + 2, 4, 2, P.yellow);
              g.R(kx + 10, y + 2, 4, 1, P.black);
              g.R(kx, y + h - 1, 17, 1, '#0c1c4c');
            }
            break;
          }
          case 'kaisatsu': {
            const busy = trainT >= 0 && npcT >= trainT && npcT < trainT + 8;
            for (let gx = x + 2; gx < x + w; gx += 14) {
              g.R(gx, y - 6, 5, h + 6, P.lgray);
              g.R(gx, y - 6, 5, 2, busy && g.blink(4) ? P.lgreen : P.mblue);
            }
            break;
          }
          case 'booth': {
            g.R(x, y - 6, w, h + 6, '#8c8478');
            g.R(x + 3, y - 2, w - 6, 10, '#f8e8b0');
            g.R(x, y - 6, w, 2, '#bcb4a0');
            break;
          }
          case 'shelter': {
            g.R(x - 2, y - 26, w + 4, 4, '#5c6c7c');
            g.R(x, y - 22, w, h + 22, '#a8c0d0');
            g.R(x + 2, y - 20, w - 4, 12, '#3c5c7c');
            g.text('バス', x + w / 2, y - 21, { size: 12, align: 'center', col: P.white });
            break;
          }
          case 'clock': {
            g.R(x + 2, y - 30, 3, 34, '#5c5c68');
            g.disc(x + 3, y - 34, 6, P.ink);
            g.disc(x + 3, y - 34, 5, P.white);
            g.R(x + 3, y - 38, 1, 4, P.ink);
            g.R(x + 3, y - 34, 3, 1, P.ink);
            break;
          }
          case 'koban': {
            g.R(x - 2, y - 20, w + 4, 6, '#3c3c48');
            g.R(x, y - 14, w, h + 14, '#c8c0b0');
            g.R(x, y - 14, w, 1, P.white);
            g.R(x + 4, y - 10, 30, 13, P.ink);
            g.R(x + 5, y - 9, 28, 11, P.white);
            g.text('交番', x + 19, y - 10, { size: 12, align: 'center', col: P.ink });
            g.R(x + w - 12, y - 26, 6, 6, P.ink);
            g.R(x + w - 11, y - 25, 4, 4, g.blink(1) ? P.red : P.dred); // 赤いランプ
            g.R(x + 6, y + h - 18, 20, 18, '#f8e8b0');
            g.R(x + 36, y + 8, 14, 10, '#f8e8b0');
            break;
          }
          case 'taxi': {
            g.shadow(x + w / 2, y + h, w / 2 + 2);
            g.R(x, y - 5, w, h + 4, P.ink);
            g.R(x + 1, y - 4, w - 2, h + 2, '#f8c838');
            g.R(x + 8, y - 2, w - 18, h - 2, '#1c2c48');
            g.R(x + 12, y, w - 26, h - 6, '#f8c838');
            g.R(x + w / 2 - 7, y + 2, 14, 6, P.ink);
            g.R(x + w / 2 - 6, y + 3, 12, 4, P.white);
            g.R(x + w / 2 - 4, y + 4, 8, 2, P.red);
            g.R(x + 1, y + h - 4, 4, 3, P.lyellow);
            g.R(x + w - 5, y + h - 4, 4, 3, P.lyellow);
            break;
          }
          default:
            g.R(x, y, w, h, P.dgray);
        }
      }

      // 光のくさび（視線）。物にさえぎられた所で止まり、エリアの外へは出ない
      function drawCone(g, n, ps, hot) {
        const len = (ps.len || n.len) * lenMul;
        const ar = AREAS[n.area];
        const pts = [];
        const N = 24;
        for (let i = 0; i <= N; i++) {
          const a = ps.a - n.half + (2 * n.half * i) / N;
          const dx = Math.cos(a), dy = Math.sin(a);
          const l = rayLen(n.area, ps.x, ps.y, dx, dy, len);
          pts.push([ps.x + dx * l, ps.y + dy * l]);
        }
        const ctx = g.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.rect(ar.x, TOPY, ar.w, H - TOPY);
        ctx.clip();
        ctx.beginPath();
        ctx.moveTo(ps.x, ps.y);
        pts.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.closePath();
        const head = n.bike; // 自転車はライトの光
        ctx.globalAlpha = hot ? 0.8 : 0.6;
        ctx.fillStyle = pattern(ctx, hot ? '#f87858' : head ? '#fcfcfc' : '#f8f0b8');
        ctx.fill();
        ctx.globalAlpha = hot ? 0.32 : 0.22;
        ctx.fillStyle = hot ? '#f83800' : head ? '#fcf0c0' : '#f8d878';
        ctx.fill();
        ctx.globalAlpha = hot ? 0.9 : 0.5;
        ctx.strokeStyle = hot ? '#f83800' : '#f8d878';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      const sprOf = (kind, dir, walk, v, naked, fps) => {
        const f = Math.floor(walk * (fps || 8)) % 4;
        const side = dir === 'left' || dir === 'right';
        return { img: api.person(kind, { dir, frame: f % 2, variant: v, naked }), flip: !side && f >= 2 };
      };
      const dirOf = (a) => {
        const d = angDiff(a, 0);
        if (Math.abs(d) <= Math.PI / 4) return 'right';
        if (Math.abs(d) >= (Math.PI * 3) / 4) return 'left';
        return d > 0 ? 'down' : 'up';
      };

      function drawBike(g, x, y, f) {
        // 横向きの自転車（f：1 なら右向き）
        [-8, 8].forEach((dx) => { g.ring(x + dx, y - 5, 5, P.ink); g.ring(x + dx, y - 5, 4, P.gray); });
        g.line(x - 8, y - 5, x, y - 5, P.lgray);
        g.line(x - 2 * f, y - 5, x - 4 * f, y - 12, P.lgray);
        g.line(x - 4 * f, y - 12, x + 5 * f, y - 12, P.lgray);
        g.line(x + 5 * f, y - 12, x + 8 * f, y - 5, P.lgray);
        g.R(x + 7 * f - (f < 0 ? 3 : 0), y - 15, 4, 2, P.dgray);
        g.R(x + 10 * f - (f < 0 ? 3 : 0), y - 11, 3, 3, P.lyellow); // ライト
      }

      function drawNpc(g, n, ps, i) {
        let a = ps.a;
        const isCaught = caught && caught.i === i;
        if (isCaught) a = Math.atan2(me.y - ps.y, me.x - ps.x);
        const dir = dirOf(a);
        const x = Math.round(ps.x), y = Math.round(ps.y);
        if (n.bike) {
          const f = dir === 'left' ? -1 : 1;
          g.shadow(x, y, 12);
          drawBike(g, x, y, f);
          const s = api.person(n.kind, { dir: f > 0 ? 'right' : 'left', frame: Math.floor(npcT * 6) % 2, variant: n.v });
          g.sprite(s, x - 8 - 2 * f, y - 30);
          if (n.paper) { g.R(x + 6 * f - 3, y - 18, 7, 5, P.lgray); g.R(x + 6 * f - 2, y - 17, 5, 1, P.dgray); }
          return;
        }
        if (n.sit) {
          const img = api.person(n.kind, { dir: ps.sleep ? 'down' : dir, frame: 0, variant: n.v });
          g.ctx.drawImage(img, 0, 0, 16, 18, x - 8, y - 18, 16, 18);
          if (n.drunk) drunkMark(g, x - 8, y - 23, dir);
          if (ps.sleep) g.text('zzz', x + 6, y - 30 - (Math.floor(api.time * 2) % 2) * 2, { size: 12, col: P.lsky, outline: P.black });
          if (ps.heart && !isCaught) {
            const hy = y - 30 - Math.round(Math.abs(Math.sin(api.time * 3)) * 3);
            if (n.kind === 'joshi') heart(g, x + 4, hy, P.pink);
          }
          return;
        }
        const s = sprOf(n.kind, dir, ps.walk ? npcT + i * 0.3 : 0, n.v, false, n.jog ? 12 : 8);
        const sway = n.drunk ? Math.round(Math.sin(npcT * 2.3 + i) * 1.5) : 0;
        g.shadow(x, y, 6);
        g.sprite(s.img, x - 8 + sway, y - 23, { flip: s.flip });
        if (n.drunk) drunkMark(g, x - 8 + sway, y - 23, dir);
        if (n.camera) {
          // カメラ
          const cx = dir === 'left' ? x - 9 : dir === 'right' ? x + 4 : x - 3;
          g.R(cx, y - 13, 6, 4, P.ink);
          g.R(cx + (dir === 'left' ? 0 : 3), y - 12, 2, 2, P.lsky);
        }
      }
      // 酔っぱらい：頭にネクタイ、赤い顔
      function drunkMark(g, x, y, dir) {
        g.R(x + 3, y + 3, 10, 2, P.red);
        if (dir !== 'up') { g.R(x + 4, y + 9, 2, 1, '#f87878'); g.R(x + 10, y + 9, 2, 1, '#f87878'); }
        g.R(x + (dir === 'left' ? 12 : 1), y + 4, 3, 5, P.red);
      }
      function drawDog(g) {
        const awake = dogAwake(npcT);
        const barking = npcT - dog.barkT < 2.2;
        const x = DOG.x - 7, y = DOG.y - 10;
        g.shadow(DOG.x, DOG.y, 7);
        if (barking) {
          const hop = Math.floor(npcT * 8) % 2;
          g.sprite(art('dogB', DOG_BARK, DOG_COL), x, y - hop * 2, { flip: me.x < DOG.x });
          if (Math.floor(npcT * 4) % 2) g.text('ワン！', DOG.x, DOG.y - 26, { size: 12, align: 'center', col: P.white, outline: P.black });
        } else if (awake) {
          g.sprite(art('dogS', DOG_STAND, DOG_COL), x, y, { flip: me.x < DOG.x });
          if (Math.floor(npcT * 6) % 2) g.R(x + (me.x < DOG.x ? 13 : 0), y + 1, 1, 2, '#d08838'); // しっぽ
        } else {
          g.sprite(art('dogZ', DOG_SLEEP, DOG_COL), x, y);
          g.text('zz', DOG.x + 6, DOG.y - 20 - (Math.floor(api.time * 2) % 2) * 2, { size: 12, col: P.lsky, outline: P.black });
        }
        // 近づくと、ほえる所の輪が見える
        const d = api.dist(me.x, me.y, DOG.x, DOG.y);
        const r = awake ? DOG.rAwake : DOG.rSleep;
        if (d < r + 34 && !barking) {
          g.ctx.save();
          g.ctx.globalAlpha = 0.7;
          const col = awake ? P.orange : P.gray;
          for (let k = 0; k < 28; k++) {
            if ((k + Math.floor(api.time * 6)) % 2) continue;
            const an = (k / 28) * Math.PI * 2;
            g.R(DOG.x + Math.cos(an) * r, DOG.y + Math.sin(an) * r * 0.75, 2, 1, col);
          }
          g.ctx.restore();
        }
      }
      function drawBox(g, b) {
        if (b === me.box) return;
        g.shadow(b.x, b.y, 9);
        g.sprite(art('box', BOX_ART, BOX_COL), b.x - 9, b.y - 13);
      }
      function drawMe(g) {
        const x = Math.round(me.x), y = Math.round(me.y);
        const shake = caught && !caught.done ? Math.round(Math.sin(api.time * 40)) : 0;
        if (me.box) {
          // 段ボールをかぶっている（歩くと足が出る）
          g.shadow(x, y, 9);
          if (me.moving) {
            const f = Math.floor(me.walk * 8) % 2;
            g.R(x - 5, y - 2 + f, 3, 3 - f, P.skin);
            g.R(x + 2, y - 1 - f, 3, 2 + f, P.skin);
          }
          g.sprite(art('box', BOX_ART, BOX_COL), x - 9 + shake, y - 15 - (me.moving ? Math.floor(me.walk * 8) % 2 : 0));
          return;
        }
        const s = sprOf('otoko', me.face, me.moving ? me.walk : 0, 0, true);
        g.shadow(x, y, 6);
        g.sprite(s.img, x - 8 + shake, y - 23, { flip: s.flip });
        if (seenT > 0 && !caught && g.blink(6)) {
          g.R(x + 6, y - 26, 2, 3, P.lsky);
          g.R(x + 7, y - 27, 1, 1, P.lsky);
        }
        if (me.ticket) {
          const hx = me.face === 'left' ? x - 9 : x + 5;
          g.R(hx, y - 14, 6, 4, P.black);
          g.R(hx + 1, y - 13, 4, 2, '#f8e8c0');
        }
      }

      function drawHud(g) {
        g.R(0, 12, W, 12, P.black);
        g.R(0, 23, W, 1, P.xdgray);
        for (let i = 0; i < maxLives; i++) heart(g, 3 + i * 9, 15, i < lives ? (i === lives - 1 && caught && g.blink(6) ? P.white : P.red) : P.xdgray);
        // 道のり（寮 ── 駅）
        const bx0 = 50, bx1 = 182;
        const px = (wx) => bx0 + ((bx1 - bx0) * wx) / WORLD_W;
        g.R(bx0, 17, bx1 - bx0, 2, P.dgray);
        AREAS.forEach((a) => { if (a.i) g.R(px(a.x), 16, 1, 4, P.gray); });
        // 寮（左はし）と駅（右はし）
        g.R(bx0 - 9, 15, 7, 6, P.lgray); g.R(bx0 - 10, 14, 9, 2, P.red); g.R(bx0 - 7, 18, 2, 3, P.ink);
        g.R(bx1 + 3, 14, 8, 7, P.white); g.R(bx1 + 4, 15, 6, 2, P.navy);
        if (me.ticket) {
          // ゴールの旗
          const gx = px(GOAL.x + GOAL.w);
          g.R(gx, 13, 1, 8, P.white);
          g.R(gx + 1, 13, 4, 3, g.blink(2) ? P.yellow : P.orange);
        }
        const mx = Math.round(px(me.x));
        g.R(mx - 1, 15, 3, 5, P.black);
        g.R(mx, 16, 1, 3, P.lime);
        g.text(me.ticket ? '帰り' : '行き', 222, 11, { size: 12, align: 'right', col: me.ticket ? P.lyellow : P.lsky });
        ticketIcon(g, 232, 14, me.ticket);
      }

      // ── 1 コマぶんの動き ──
      function updateMove(dt) {
        let { x: dx, y: dy } = api.input.dir();
        const pt = api.input.pointer;
        const wpx = pt.x + camX, wpy = pt.y;
        const inBuy = inRect(me.x, me.y, BUY);
        const touchBuy = pt.down && inBuy && inRect(wpx, wpy, { x: KENBAIKI.x - 4, y: KENBAIKI.y, w: KENBAIKI.w + 8, h: KENBAIKI.h + 6 });
        const pressBuy = (api.input.held('a') || touchBuy) && inBuy && !me.ticket;
        // 箱：A（B）で、かぶる・ぬぐ。スマホは男魂くんをタップ
        const tap = api.input.tap;
        const tapMe = tap && Math.abs(tap.x + camX - me.x) < 12 && tap.y > me.y - 28 && tap.y < me.y + 6;
        if (tapMe) touch.box = true;
        if (!pt.down) touch.box = false;
        const near = boxes.find((b) => b !== me.box && api.dist(b.x, b.y, me.x, me.y) < 14);
        if ((api.input.pressed('a') || api.input.pressed('b') || tapMe) && !inBuy && (me.box || near)) {
          if (me.box) {
            me.box.x = me.x;
            me.box.y = me.y;
            me.box = null;
            api.sfx('cancel');
          } else {
            me.box = near;
            stats.boxUsed++;
            api.sfx('poof');
            pop('ガサッ', me.x, me.y - 30, P.cream, 0.8);
          }
        }
        if (!dx && !dy && pt.down && pt.y > TOPY && !pressBuy && !touch.box) {
          // 画面をおさえた所へ（指で男魂くんがかくれないように、指の少し上に来る）
          const ax = wpx - me.x, ay = wpy - 12 - me.y;
          if (Math.abs(ax) > 2) dx = Math.sign(ax);
          if (Math.abs(ay) > 2) dy = Math.sign(ay);
        }
        me.buying = pressBuy && !dx && !dy;
        if (me.buying) {
          if (me.buy === 0) api.sfx('coin');
          me.buy += dt;
          me.face = 'up';
          tickT -= dt;
          if (tickT <= 0) { tickT = 0.25; api.sfx('tick'); }
          if (me.buy >= BUY_TIME) {
            me.ticket = true;
            me.buying = false;
            cp = CP_BUY;
            stats.cps.push(CP_BUY);
            api.sfx('ok');
            pop('切符ゲット！', me.x, me.y - 34, P.yellow, 1.6);
            talk(me.x, me.y - 30, 'よし！ あとは帰るだけ…', 2.2);
            banner = { str: '帰り道', sub: '寮の近くまで もどれ', t: 0 };
            entered.back.add(4);
            startTrain();
          }
        } else if (!inBuy) me.buy = 0;
        me.moving = false;
        if (!me.buying && (dx || dy)) {
          const nn = dx && dy ? Math.SQRT1_2 : 1;
          const step = SPEED * (me.box ? BOX_SPEED : 1) * nn * dt;
          const nx = me.x + dx * step, ny = me.y + dy * step;
          if (me.box && areaAt(nx) !== areaAt(me.x)) {
            // 箱は、そのエリアに置いていく
            me.box.x = me.x - Math.sign(dx) * 4;
            me.box.y = me.y;
            me.box = null;
            showHint('箱は ここに置いていこう', 2);
          }
          if (!blocked(nx, me.y)) me.x = nx;
          else if (!dy) me.y = slide(me.x, me.y, nx, 'y', step); // 角に少しかかっただけなら、すべって回りこむ
          if (!blocked(me.x, ny)) me.y = ny;
          else if (!dx) me.x = slide(me.x, me.y, ny, 'x', step);
          me.face = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
          me.walk += dt;
          me.moving = true;
          if (Math.floor(me.walk * 4) !== Math.floor((me.walk - dt) * 4)) api.sfx('step');
        }
        if (me.box) {
          me.box.x = me.x;
          me.box.y = me.y;
        }
      }
      function updateArea() {
        const ai = areaAt(me.x);
        if (ai === lastArea) return;
        lastArea = ai;
        const set = me.ticket ? entered.back : entered.go;
        if (!set.has(ai)) {
          set.add(ai);
          banner = { str: AREAS[ai].name, sub: me.ticket ? '帰り' : '', t: 0 };
        }
        // チェックポイント（先へ進んだときだけ）
        const want = me.ticket ? CPS.findIndex((c, k) => k > CP_BUY && c.area === ai) : ai;
        if (want > cp) {
          cp = want;
          if (!stats.cps.includes(cp)) stats.cps.push(cp);
          api.sfx('coin');
          pop('チェックポイント', me.x, me.y - 34, P.lgreen, 1.2);
        }
      }
      function updateDog() {
        if (areaAt(me.x) !== DOG.area) return;
        const d = api.dist(me.x, me.y, DOG.x, DOG.y);
        const r = dogAwake(npcT) ? DOG.rAwake : DOG.rSleep;
        if (d < r && npcT >= dog.nextOk) {
          dog.barkT = npcT;
          dog.nextOk = npcT + 5.5;
          resident.a0 = npcT + 0.6; // 明かりがついてから、窓から見る
          resident.a1 = npcT + 3.8;
          stats.barks++;
          api.sfx('hit');
          api.after(0.25, () => api.sfx('hit'));
          showHint('犬がほえた！ 窓から見られる！', 2.2);
        }
      }
      function updateSeen(dt) {
        let hit = -1, bump = false, hitPose = null;
        for (let i = 0; i < NPCS.length; i++) {
          if (NPCS[i].area !== areaAt(me.x)) continue;
          const ps = poseOf(i, npcT);
          const s = sees(NPCS[i], ps, me.x, me.y);
          if (s === 2) { hit = i; bump = true; hitPose = ps; break; }
          if (s === 1 && hit < 0) { hit = i; hitPose = ps; }
        }
        if (hit >= 0 && me.box && !bump && !me.moving) hit = -1; // 箱をかぶって止まっていれば、ただの箱
        if (hit >= 0) {
          if (seenT === 0) api.sfx('hatena');
          seenT += dt * (me.box && !bump ? BOX_RATE : 1);
          watcher = hit;
          if (bump || seenT >= grace) catchBy(hit, hitPose);
        } else {
          seenT = Math.max(0, seenT - dt * 1.5);
          if (seenT === 0) watcher = -1;
        }
      }

      // はじめの場所
      if (resume) {
        warp(resume);
        banner = { str: '前回のつづきから', sub: AREAS[CPS[resume].area].name, t: 0 };
      } else {
        placeAt(0);
        entered.go.add(0);
      }

      return {
        // テストで見るための中身
        me, NPCS, SOLIDS, AREAS, CPS, GOAL, BUY, DOG, SPEED, BOX_SPEED, WORLD_W, visibleAt, wouldBark, blocked, areaAt, warp, poseOf, stats, boxes,
        get lives() { return lives; },
        get maxLives() { return maxLives; },
        get cp() { return cp; },
        get npcT() { return npcT; },
        get seenT() { return seenT; },
        get grace() { return grace; },
        get caught() { return caught; },
        get busy() { return !!(caught || fade); }, // 見つかって、チェックポイントへもどっているところ
        get camX() { return camX; },
        get area() { return areaAt(me.x); },
        get trainT() { return trainT; },
        get dogAwake() { return dogAwake(npcT); },
        get resident() { return { a0: resident.a0, a1: resident.a1 }; },
        get resumed() { return resume; },
        get won() { return won; },

        update(dt) {
          for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > fx[i].dur) fx.splice(i, 1); }
          if (say) { say.t -= dt; if (say.t <= 0) say = null; }
          if (banner) { banner.t += dt; if (banner.t > 2.4) banner = null; }
          if (hint) { hint.t -= dt; if (hint.t <= 0) hint = null; }
          camX = api.approach(camX, camTarget(), Math.max(2, Math.abs(camTarget() - camX) * 10 * dt));
          if (api.time < 0.05 && !resume && !say) talk(AREAS[0].x + 42, TOPY + 30, '切符、たのんだぞ！', 2.4);
          if (api.time > 2.6 && api.time < 2.7 && !resume && areaAt(me.x) === 0) talk(AREAS[0].x + 42, TOPY + 30, '光に入るなよ。かげで待て！', 2.6);

          if (won) {
            winT += dt;
            me.face = winT < 0.8 ? 'left' : 'down';
            return;
          }
          if (fade) {
            fade.t += dt;
            if (fade.dir === 'out' && fade.t >= 0.3) {
              placeAt(cp);
              fade = { dir: 'in', t: 0 };
              showHint('チェックポイントから。のこり ♥' + lives, 2.4);
            } else if (fade.dir === 'in' && fade.t >= 0.3) fade = null;
            return;
          }
          if (caught) {
            caught.t += dt;
            if (lives > 0 && caught.t >= 1.3 && !fade) fade = { dir: 'out', t: 0 };
            return;
          }
          if (api.ended) return;
          npcT += dt;
          updateMove(dt);
          updateArea();
          updateDog();
          updateSeen(dt);
          if (caught) return;
          if (trainT >= 0 && npcT >= trainT && npcT - dt < trainT) {
            api.sfx('alarm');
            if (areaAt(me.x) === 4) showHint('電車が着いた！ 人が出てくる！', 2.6);
          }
          // 切符を持って、寮の手前まで
          if (me.ticket && inRect(me.x, me.y, GOAL)) {
            won = true;
            memo.cp = 0;
            api.sfx('fanfare');
            talk(me.x, me.y - 30, 'ふう…寮はもうすぐだ', 2.4);
            api.win('切符ゲット！\nあとは寮に\n帰るだけ…', { wait: 2.0 });
          }
        },

        draw(g) {
          g.clear(P.night);
          const ctx = g.ctx;
          ctx.save();
          ctx.translate(-Math.round(camX), 0);
          const vis = (x0, x1) => x1 > camX - 8 && x0 < camX + W + 8;
          AREAS.forEach((a) => { if (vis(a.x, a.x + a.w)) drawGround(g, a); });
          const ps = NPCS.map((n, i) => (vis(AREAS[n.area].x, AREAS[n.area].x + AREAS[n.area].w) ? poseOf(i, npcT) : null));
          // 視線
          NPCS.forEach((n, i) => {
            const p = ps[i];
            if (!p || p.hide || p.sleep) return;
            drawCone(g, n, p, (caught && caught.i === i) || (seenT > 0 && watcher === i));
          });
          // 目じるし（券売機の前・ゴール）
          if (!me.ticket) {
            ctx.save();
            ctx.globalAlpha = 0.35 + 0.2 * Math.sin(api.time * 6);
            g.frame(BUY.x, BUY.y, BUY.w, BUY.h, P.lsky);
            ctx.restore();
          } else if (vis(GOAL.x, GOAL.x + 40)) {
            ctx.save();
            ctx.globalAlpha = 0.25 + 0.15 * Math.sin(api.time * 6);
            g.R(GOAL.x, GOAL.y, GOAL.w, GOAL.h, P.yellow);
            ctx.restore();
          }

          // 物と人を、足もとの順に描く
          const list = [];
          SOLIDS.forEach((b) => { if (vis(b.x, b.x + b.w)) list.push({ y: b.y + b.h, f: () => drawSolid(g, b) }); });
          NPCS.forEach((n, i) => {
            const p = ps[i];
            if (!p || p.hide || n.inside || n.alert) return;
            const ar = AREAS[n.area];
            list.push({
              y: p.y + (n.sit ? 1 : 0),
              f: () => {
                ctx.save();
                ctx.beginPath();
                ctx.rect(ar.x, 0, ar.w, H);
                ctx.clip();
                drawNpc(g, n, p, i);
                ctx.restore();
              },
            });
          });
          if (vis(DOG.x - 10, DOG.x + 10)) list.push({ y: DOG.y, f: () => drawDog(g) });
          boxes.forEach((b) => { if (vis(b.x - 10, b.x + 10)) list.push({ y: b.y - 0.5, f: () => drawBox(g, b) }); });
          list.push({ y: me.y + 0.5, f: () => drawMe(g) });
          list.sort((a, b) => a.y - b.y).forEach((o) => o.f());

          // 先輩のレンズが光る（出てくる前のしるし）・自転車のベル
          NPCS.forEach((n, i) => {
            const p = ps[i];
            if (!p) return;
            if (p.rustle && g.blink(5)) {
              star(g, Math.round(p.x), Math.round(p.y) - 14, P.white);
              g.text('キラッ', p.x, p.y - 32, { size: 12, align: 'center', col: P.lyellow, outline: P.black });
            }
            if (n.bike && p.hide && p.left < 1.3) {
              const nx = p.seg.i + 1 < n.plan.segs.length ? n.plan.segs[p.seg.i + 1] : n.plan.segs[0];
              const ar = AREAS[n.area];
              const ex = api.clamp(nx.x0, Math.max(camX, ar.x) + 22, Math.min(camX + W, ar.x + ar.w) - 22);
              if (g.blink(4)) g.text('チリンチリン', ex, nx.y0 - 30, { size: 12, align: 'center', col: P.lyellow, outline: P.black });
              arrow(g, ex + (nx.x0 < ex ? -14 : 14), nx.y0 - 8, P.lyellow, nx.x0 < ex ? 'left' : 'right');
              if (!n.rang || n.rang !== p.seg) { n.rang = p.seg; if (areaAt(me.x) === n.area) api.sfx('ring'); }
            }
          });

          // 目的地の矢印
          if (!api.ended && !caught) {
            if (!me.ticket && areaAt(me.x) === 4) arrow(g, BUY.x + BUY.w / 2, 30, P.yellow);
            if (me.ticket && areaAt(me.x) === 1) arrow(g, GOAL.x + 6, 142, P.yellow, 'left');
          }
          // 買っているところ
          if (me.buying || (me.buy > 0 && !me.ticket && inRect(me.x, me.y, BUY))) {
            g.bar(me.x - 12, me.y - 34, 24, 3, me.buy / BUY_TIME, P.lyellow, P.xdgray);
            if (me.buying && g.blink(3)) g.text('ピッ', me.x + 14, me.y - 40, { size: 12, col: P.white, outline: P.black });
          } else if (!me.ticket && inRect(me.x, me.y, BUY) && !caught) {
            g.text('A長おしで買う', me.x, me.y - 44, { size: 12, align: 'center', col: P.white, outline: P.black });
          }
          // 箱の説明
          const near = boxes.find((b) => b !== me.box && api.dist(b.x, b.y, me.x, me.y) < 14);
          if ((near || me.box) && !caught && !api.ended) {
            g.text(me.box ? (me.moving ? '' : 'A：箱をぬぐ') : 'A：箱をかぶる', me.x, me.y - 36, { size: 12, align: 'center', col: P.white, outline: P.black });
          }
          // 文字・吹き出し
          fx.forEach((e) => g.text(e.str, e.x, e.y - (e.t / e.dur) * 8, { size: 12, align: 'center', col: e.col, outline: P.black }));
          if (say) bubble(g, say.str, say.x, say.y, say.col);
          // 見られかけ・見つかった
          if (seenT > 0 && !caught && watcher >= 0 && ps[watcher]) {
            const w = ps[watcher];
            g.text(me.box ? '…箱？' : '？', w.x, w.y - 42, { col: P.yellow, outline: P.black, align: 'center' });
          }
          if (caught && g.blink(4) && ps[caught.i]) {
            const w = ps[caught.i];
            g.text('！', w.x + 11, w.y - 30, { col: P.red, outline: P.white, align: 'center' });
          }
          ctx.restore();

          // エリアの名前・説明（画面に固定）
          if (banner) {
            const k = Math.min(1, banner.t / 0.25, (2.4 - banner.t) / 0.3);
            ctx.save();
            ctx.globalAlpha = Math.max(0, k);
            const bw = Math.max(g.measure(banner.str, 16), g.measure(banner.sub || '', 12)) + 24;
            g.R(W / 2 - bw / 2, 30, bw, banner.sub ? 36 : 22, '#000000b0');
            g.text(banner.str, W / 2, 33, { align: 'center', col: P.white });
            if (banner.sub) g.text(banner.sub, W / 2, 51, { size: 12, align: 'center', col: P.lyellow });
            ctx.restore();
          }
          if (hint) {
            const tw = g.measure(hint.str, 12) + 12;
            g.R(W / 2 - tw / 2, H - 20, tw, 16, '#000000c0');
            g.text(hint.str, W / 2, H - 19, { size: 12, align: 'center', col: P.lyellow });
          }
          if (caught && lives > 0 && caught.t > 0.3) {
            g.big('見つかった！', W / 2, 92, { align: 'center', col: P.white, shade: P.red });
          }
          drawHud(g);
          if (fade) {
            ctx.save();
            ctx.globalAlpha = fade.dir === 'out' ? Math.min(1, fade.t / 0.3) : Math.max(0, 1 - fade.t / 0.3);
            g.R(0, 12, W, H - 12, P.black);
            ctx.restore();
          }
        },
      };
    },
  });
})();
