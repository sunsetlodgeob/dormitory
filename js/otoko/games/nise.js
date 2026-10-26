/*
 * 4月 新歓「ニセ一年を見抜け」
 *  一年が 7 人、1 人ずつ「お茶つぎますよ」などと声をかけてくる。1 人だけ、一年のふりをした 3年生（ニセ一年）。
 *  寮では毎年、3年生が 1 人、一年にまぎれこむ。先輩にお茶をつがせたら、たいへん。
 *  - A：受ける　B：断る（1 人 6 秒ほど。だまっていると、受けたことになる）
 *  - ニセ一年を断ればクリア。ニセ一年の申し出を受けるか、本物を 3 人断ると負け
 *  - ニセ一年のぼろ：セリフ（寮にくわしすぎる・「去年の新歓」・先輩や寮長になれなれしい・過去問を持っている）と、
 *    見た目（うっすら青ひげ・目の下のくま・寮のジャージをはおっている）。3年生なので、年は 2 つ上なだけ
 *  - 本物にも、ちょっと怪しく聞こえる人（二浪・兄が寮にいた・オープンキャンパスで見た など）や、めがね・ばんそうこうの人がいる
 *  だれがニセ一年か、セリフ、見た目のぼろは、毎回ランダム。
 */
(function () {
  'use strict';

  // ── セリフ ─────────────────────────────────────
  // 1 行は 14 文字まで（それより長いときは \n で切っておく）。世間話は 2 行まで、申し出は 1 行で、あわせて 3 行
  // 本物の一年の世間話
  const TALK = [
    '同じ一年っす。よろしくです！',
    '寮、思ったより広いっすね。',
    '履修登録、もう終わりました？',
    '連絡先、交換しましょうよ。',
    'サークル、どこ見に行きます？',
    '入学式のスーツ、\nきつかったっす。',
    'スマホの充電、\nあと3%っす…。',
    '地元から、きのう来ました。',
    '先輩たち、\nテンション高いっすね。',
    '寮の動画を見て、来ました！',
    '駅で、道にまよいました。',
    '自炊、がんばるつもりっす。',
  ];
  // 本物だけど、ちょっと怪しく聞こえる世間話（ひっかけ）
  const HERRING = [
    '二浪したんで、\nちょっと年上っす。',
    '兄がこの寮にいたんで、\n話は聞いてます。',
    '緊張して…いや、\n楽しいっす！',
    '老け顔って、よく言われます。',
    'オープンキャンパスで、\n寮も見学しました！',
    '先輩の名前、もう\n覚えちゃいました！',
  ];
  // ニセ一年（3年生）のぼろ（世間話）：寮にくわしすぎる・去年を知っている・先輩になれなれしい
  const FAKE_TALK = [
    '去年の新歓より、\n人が多いっすね。',
    'おれらの代のときは…\nいや、なんでもないっす。',
    '冷蔵庫のプリン、去年\n食われたんすよね…。',
    'よう、先輩A！…じゃなくて、\nおつかれさまです！',
    '寮長のやつ、今年は\nはりきってんな…あっ。',
    'このコール、1年のときから\n変わってないな…あっ。',
    '寮の歌なら、3番まで\n歌えますよ！',
    '食堂のおばちゃん、\n今年も元気そうっすね。',
  ];
  // 申し出
  const OFFER = [
    'お茶、おつぎしますよ。',
    '荷物、部屋まで運びますよ。',
    '席どうぞ。座ってください。',
    'おしぼり、どうぞ。',
    '唐揚げ、取り分けますね。',
    '上着、かけておきますね。',
    'ジュース、持ってきますよ。',
    'ゴミ、まとめておきますよ。',
    '紙皿、配っておきますね。',
  ];
  // ニセ一年のぼろ（一年なら持っていない・知らないはずのもの）
  const FAKE_OFFER = [
    'テストの過去問、あげますよ。',
    '楽勝の授業、教えますよ。',
    'ぼくの冷蔵庫の段、使います？',
    '先輩の部屋、案内しますよ。',
    '風呂のすく時間、教えますよ。',
  ];
  const ACCEPT = ['あざっす！\nまかせてください。', 'よかった！\nこれからよろしく！', 'はい、すぐやります！', 'うれしいっす！\n友だちっすね！'];
  const REFUSE = ['あ…そうっすか…。', 'す、すんません…。', 'じゃあ、また今度…。', 'しつれいしました…。'];
  const GEN_TIMEOUT = '…返事がないけど、\nやっておきますね！';
  // ニセ一年の申し出を受けると、3年生（先輩）をこき使ったことになる
  const FAKE_ACCEPT = 'ドッキリ大成功〜！\nじつは3年だ。\n先輩をこき使ったな？';
  const FAKE_TIMEOUT = 'だまってるなら、やるぞ。\n…じつは3年だ。\n先輩をこき使ったな？';
  const FAKE_NAME = '3年生（ニセ一年）'; // 正体がばれたあとの名札
  const REVEAL = ['…バレたか！\nじつは3年だ。\nやるな、一年！', 'ちっ、見抜かれたか。\n3年生の、毎年恒例さ。\nやるじゃないか！'];
  const LETTERS = 'ABCDEFG';

  // ── 顔に、ぼろ（青ひげ・くま・寮のジャージ）や、ひっかけ（めがね・ばんそうこう）を足す ──────────
  //  reveal：正体がばれたあと（寮のジャージを着た 3年生の姿。名札はなし）
  const JERSEY = '#283890', JERSEY_HI = '#3c50b8';
  const faces = new Map();
  function hex(d, i) {
    return d[i + 3] ? '#' + ((1 << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).slice(1) : null;
  }
  // 2 つの色をまぜる（t は b の割合）
  function mix(a, b, t) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((x >> s) & 255) * (1 - t) + ((y >> s) & 255) * t);
    return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
  }
  function face(api, v, mood, deco, reveal) {
    const base = api.portrait('ichinen', { variant: v, mood });
    if (!deco && !reveal) return base;
    const key = v + '|' + mood + '|' + deco + '|' + (reveal ? 1 : 0);
    let c = faces.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 32;
    const x = c.getContext('2d');
    x.drawImage(base, 0, 0);
    const img = x.getImageData(0, 0, 32, 32);
    const d = img.data;
    const at = (px, py) => hex(d, (py * 32 + px) * 4);
    const put = (px, py, col) => {
      const i = (py * 32 + px) * 4;
      const n = parseInt(col.slice(1), 16);
      d[i] = n >> 16;
      d[i + 1] = (n >> 8) & 255;
      d[i + 2] = n & 255;
      d[i + 3] = 255;
    };
    const skin = at(12, 19);
    const shirt = at(8, 29);
    const onSkin = (px, py, col) => { if (at(px, py) === skin) put(px, py, col); };
    if (deco === 'stubble') {
      // うっすら青ひげ（あごと口のまわり）。一年より 2 つ上
      const stubble = mix(skin, '#40507c', 0.3);
      for (let py = 20; py <= 23; py++) for (let px = 10; px <= 21; px++) if ((px + py) % 2 === 0) onSkin(px, py, stubble);
    } else if (deco === 'kuma') {
      // 目の下のくま（レポートで徹夜つづき）
      const k1 = mix(skin, '#6c5c9c', 0.45), k2 = mix(skin, '#6c5c9c', 0.25);
      for (let px = 10; px <= 13; px++) { onSkin(px, 17, k1); onSkin(px + 8, 17, k1); }
      for (let px = 11; px <= 12; px++) { onSkin(px, 18, k2); onSkin(px + 8, 18, k2); }
    } else if (deco === 'jersey' && !reveal) {
      // Tシャツの上に、寮のジャージ（先輩たちと同じ）をはおっている
      for (let py = 27; py <= 31; py++) for (let px = 4; px <= 27; px++) {
        if (at(px, py) !== shirt) continue;
        if (px <= 10 || px >= 21) put(px, py, px === 8 || px === 23 ? '#fcfcfc' : JERSEY);
      }
      for (let py = 27; py <= 31; py++) { put(10, py, JERSEY_HI); put(21, py, JERSEY_HI); }
    } else if (deco === 'glasses') {
      const gc = '#3c3c4c';
      for (let i = 0; i < 6; i++) { put(9 + i, 13, gc); put(17 + i, 13, gc); put(9 + i, 17, gc); put(17 + i, 17, gc); }
      for (let j = 14; j <= 16; j++) { put(9, j, gc); put(14, j, gc); put(17, j, gc); put(22, j, gc); }
      put(15, 14, gc);
      put(16, 14, gc);
    } else if (deco === 'bandage') {
      for (let px = 19; px <= 22; px++) { put(px, 18, '#f8e8c8'); put(px, 19, '#f8e8c8'); }
      put(19, 18, '#d8b890');
      put(22, 19, '#d8b890');
      put(20, 18, '#e8d0a8');
      put(21, 19, '#e8d0a8');
    }
    if (reveal) {
      // 正体：寮のジャージ（白い線 2 本）を着た 3年生
      for (let py = 27; py <= 31; py++) for (let px = 4; px <= 27; px++) {
        if (at(px, py) === shirt) put(px, py, px === 11 || px === 12 || px === 19 || px === 20 ? '#fcfcfc' : px === 15 || px === 16 ? JERSEY_HI : JERSEY);
      }
    }
    x.putImageData(img, 0, 0);
    faces.set(key, c);
    return c;
  }
  const TELLS = ['stubble', 'kuma', 'jersey']; // ニセ一年の見た目のぼろ
  const HERRING_LOOKS = ['glasses', 'bandage']; // 本物のひっかけ

  // ハートのドット（7×6）
  const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];

  OTK.register({
    id: 'nise',
    order: 2,
    month: 4,
    event: '新歓',
    title: 'ニセ一年を見抜け',
    goal: 'ニセ者を断れ！',
    howto: ['A：受ける　B：断る', 'ニセ一年（3年生）は1人', '本物を3人断ると負け'],
    note: '寮にくわしすぎるやつが、あやしい。\nだまっていると、受けたことになる。',
    time: null,
    timeout: 'lose',
    bgm: 'menu',
    create(api) {
      const P = api.P;
      const TIME = Math.min(8, 6.5 + 0.5 * (api.tries | 0)); // 1 人ごとの考える時間
      const BOX = { x: 74, y: 14, w: 108, h: 106 }; // 顔のわく
      const BTN_A = { x: 10, y: 195, w: 80, h: 22 };
      const BTN_B = { x: 166, y: 195, w: 80, h: 22 };

      // 7 人を用意する（1 人目は、いつも本物）
      const people = (() => {
        const fakeAt = api.irnd(1, 6);
        const vars = api.shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).slice(0, 7);
        const talks = api.shuffle(TALK);
        const herrings = api.shuffle(HERRING);
        const offers = api.shuffle(OFFER);
        const genuine = [];
        for (let i = 0; i < 7; i++) if (i !== fakeAt) genuine.push(i);
        const hTalk = api.shuffle(genuine).slice(0, api.irnd(1, 2)); // 怪しく聞こえる本物
        const hLook = api.shuffle(genuine).slice(0, api.irnd(1, 2)); // めがね・ばんそうこうの本物
        return vars.map((v, i) => {
          const p = { label: '一年' + LETTERS[i], v, fake: i === fakeAt, mood: api.pick(['normal', 'happy']), deco: null, talk: '', offer: '' };
          if (p.fake) {
            p.deco = api.pick(TELLS);
            if (api.chance(0.7)) {
              p.talk = api.pick(FAKE_TALK);
              p.offer = offers.pop();
            } else {
              p.talk = talks.pop();
              p.offer = api.pick(FAKE_OFFER);
            }
          } else {
            p.talk = hTalk.includes(i) ? herrings.pop() : talks.pop();
            p.offer = offers.pop();
            if (hLook.includes(i)) p.deco = api.pick(HERRING_LOOKS);
          }
          p.text = p.talk + '\n' + p.offer;
          return p;
        });
      })();

      const st = {
        t: 0,
        idx: 0,
        phase: 'in', // in（あらわれる）→ talk（話す・選ぶ）→ react（反応）→ out（さる）→ in …
        pT: 0,
        typed: 0,
        timeT: TIME,
        hearts: 3,
        heartT: 0, // ハートがわれた直後
        friends: 0,
        line: '',
        mood: 'normal',
        reveal: false,
        puffT: 0,
        choice: '',
        qShift: 0, // 列がつめる動き
      };
      const cur = () => people[st.idx]; // ニセ一年で、かならず終わる（7 人目より先には進まない）
      const inside = (tp, b) => tp.x >= b.x - 6 && tp.x < b.x + b.w + 6 && tp.y >= b.y - 8 && tp.y < b.y + b.h + 6;

      function decide(kind) {
        const p = cur();
        st.choice = kind;
        st.phase = 'react';
        st.pT = 0;
        st.typed = 0;
        const acc = kind !== 'refuse';
        if (p.fake) {
          st.reveal = true;
          st.puffT = 0.35;
          api.flash(P.white, 0.15);
          if (acc) {
            st.line = kind === 'timeout' ? FAKE_TIMEOUT : FAKE_ACCEPT;
            st.mood = 'happy';
            api.sfx('buzzer');
            api.lose(kind === 'timeout' ? 'だまっていたら、\n3年生の先輩を\nこき使ってしまった…' : 'ニセ一年は3年生！\n先輩をこき使って、\n寮じゅうの笑いもの。', { wait: 2.4 });
          } else {
            st.line = api.pick(REVEAL);
            st.mood = 'shock';
            api.sfx('fanfare');
            api.win('ニセ一年（3年生）を\n見抜いた！', { wait: 2.4 });
          }
        } else if (acc) {
          st.line = kind === 'timeout' ? GEN_TIMEOUT : api.pick(ACCEPT);
          st.mood = 'happy';
          st.friends++;
          api.sfx('ok');
        } else {
          st.line = api.pick(REFUSE);
          st.mood = 'sad';
          st.hearts--;
          st.heartT = 0.7;
          api.sfx('damage');
          api.shake(2, 0.2);
          if (st.hearts <= 0) api.lose('断りすぎて、\n友だちが\nできなかった…', { wait: 1.8 });
        }
      }

      // ── 描く ──────────────────────────────────────
      function drawRoom(g) {
        g.clear(P.night);
        // かべ・腰板・床
        g.R(0, 12, 256, 70, P.cream);
        for (let x = 6; x < 256; x += 24) g.R(x, 12, 1, 70, P.lyellow);
        g.R(0, 82, 256, 12, P.tan);
        g.R(0, 82, 256, 1, P.brown);
        g.R(0, 93, 256, 1, P.dbrown);
        g.R(0, 94, 256, 30, P.brown);
        for (let y = 99; y < 124; y += 6) g.R(0, y, 256, 1, P.dbrown);
        for (let y = 0; y < 5; y++) for (let x = (y * 37) % 48; x < 256; x += 48) g.R(x, 94 + y * 6, 1, 5, P.dbrown);
        // 窓（夜桜）
        g.R(188, 32, 60, 48, P.white);
        g.R(190, 34, 56, 44, P.night);
        g.R(217, 34, 2, 44, P.white);
        g.disc(236, 44, 4, P.lyellow);
        g.disc(238, 43, 3, P.night);
        g.line(190, 70, 206, 62, P.dbrown);
        g.line(206, 62, 214, 52, P.dbrown);
        g.line(206, 62, 226, 64, P.dbrown);
        [[200, 64], [205, 59], [212, 52], [215, 56], [222, 62], [227, 66], [196, 68]].forEach(([x, y], i) => {
          g.R(x - 1, y - 1, 3, 3, i % 2 ? P.lpink : P.pink);
          g.R(x, y, 1, 1, P.white);
        });
        // ひらひら散る花びら
        for (let i = 0; i < 4; i++) {
          const ph = (st.t * 0.25 + i * 0.27) % 1;
          const x = 194 + ((i * 13 + Math.floor(ph * 40) + Math.round(Math.sin(st.t * 2 + i) * 3)) % 50);
          const y = 36 + Math.floor(ph * 40);
          g.R(x, y, 2, 1, P.lpink);
        }
        // 輪かざり
        for (let x = 184; x < 256; x += 8) {
          const c = [P.rose, P.yellow, P.lgreen, P.sky][(x / 8) % 4];
          g.frame(x, 13 + ((x / 8) % 2), 7, 5, c);
        }
      }
      function drawHearts(g) {
        g.text('友だち', 8, 21, { size: 12, col: P.white, outline: P.ink });
        for (let h = 0; h < 3; h++) {
          const alive = h < st.hearts;
          const breaking = !alive && h === st.hearts && st.heartT > 0;
          const x0 = 8 + h * 17, y0 = 38;
          const col = alive ? P.red : breaking ? P.rose : P.dgray;
          const split = breaking ? Math.round((0.7 - st.heartT) * 6) : 0;
          HEART.forEach((row, y) => {
            for (let x = 0; x < 7; x++) {
              if (row[x] !== '1') continue;
              const dx = split ? (x < 3 ? -split : x > 3 ? split : 0) : 0;
              g.R(x0 + x * 2 + dx, y0 + y * 2, 2, 2, col);
            }
          });
          if (alive) g.R(x0 + 2, y0 + 2, 2, 2, P.lpink);
          else if (!breaking) { g.R(x0 + 6, y0 + 2, 2, 2, P.black); g.R(x0 + 4, y0 + 4, 2, 2, P.black); g.R(x0 + 6, y0 + 6, 2, 2, P.black); }
        }
      }
      function drawQueue(g) {
        const rest = people.length - st.idx - 1;
        g.text('あと ' + Math.max(0, rest) + '人', 218, 21, { size: 12, align: 'center', col: P.white, outline: P.ink });
        for (let j = rest - 1; j >= 0; j--) {
          const x = 187 + (j + st.qShift) * 10;
          const p = people[st.idx + 1 + j];
          g.shadow(x + 8, 117, 6);
          g.sprite(api.person('ichinen', { dir: 'left', variant: p.v }), x, 94);
        }
      }
      function drawHero(g) {
        const bob = st.phase === 'react' && st.mood === 'happy' && !st.reveal ? -Math.round(Math.abs(Math.sin(st.pT * 9)) * 3) : 0;
        g.shadow(38, 108, 11);
        g.sprite(api.person('otoko', { dir: 'right' }), 22, 60 + bob, { scale: 2 });
        if (st.phase === 'react' && st.pT < 1.2) {
          if (st.reveal) g.text('！', 54, 46, { col: P.yellow, outline: P.black });
          else if (st.mood === 'happy') g.text('♪', 54, 48 - Math.round(st.pT * 10), { col: P.rose, outline: P.white });
          else { g.R(52, 60, 2, 4, P.lsky); g.R(51, 62, 4, 2, P.lsky); }
        }
      }
      function drawFace(g) {
        const B = BOX;
        g.box(B.x, B.y, B.w, B.h, { fill: P.lsky });
        const ix = B.x + 4, iy = B.y + 4, iw = B.w - 8, ih = B.h - 8;
        g.R(ix, iy + ih - 22, iw, 22, P.sky);
        let k = 1;
        if (st.phase === 'in') k = Math.min(1, st.pT / 0.3);
        else if (st.phase === 'out') k = 1 - Math.min(1, st.pT / 0.3);
        if (k <= 0) return;
        const p = cur();
        const h = Math.max(1, Math.round(ih * k));
        g.ctx.save();
        g.ctx.beginPath();
        g.ctx.rect(ix, iy + Math.round((ih - h) / 2), iw, h);
        g.ctx.clip();
        const mood = st.phase === 'react' || st.phase === 'out' ? st.mood : p.mood;
        const typing = st.phase === 'talk' && st.typed < p.text.length;
        const bob = typing && Math.floor(st.t * 8) % 2 ? 1 : 0;
        const shown = st.reveal && st.puffT < 0.2; // 煙のあとは、寮のジャージを着た 3年生の姿
        const img = face(api, p.v, mood, p.deco, shown);
        g.sprite(img, B.x + 6, B.y + 5 + bob, { scale: 3 });
        if (!shown) {
          // 名札
          g.R(B.x + 6 + 57, B.y + 5 + bob + 84, 12, 8, P.white);
          g.R(B.x + 6 + 57, B.y + 5 + bob + 84, 12, 2, P.red);
          g.frame(B.x + 6 + 56, B.y + 5 + bob + 83, 14, 10, P.ink);
        }
        // 正体がばれた煙
        if (st.puffT > 0) {
          const r = 10 + (0.35 - st.puffT) * 90;
          [[0, 0], [-22, 10], [22, 8], [-12, -18], [14, -16]].forEach(([dx, dy], i) => g.disc(B.x + B.w / 2 + dx, B.y + B.h / 2 + dy, r * (i ? 0.6 : 1), i % 2 ? P.lgray : P.white));
        }
        g.ctx.restore();
      }
      function drawDialog(g) {
        const p = cur();
        g.box(4, 124, 248, 98);
        const name = st.reveal ? FAKE_NAME : p.label;
        const nw = g.measure(name, 12) + 14;
        g.box(12, 108, nw, 20, { fill: st.reveal ? P.dred : P.navy });
        g.text(name, 19, 111, { size: 12, col: P.lyellow });
        if (st.phase === 'in') return;
        const str = st.phase === 'talk' ? p.text : st.line;
        const lines = g.wrap(str, 232, 16).slice(0, 3); // 1 行 14 文字まで
        let left = Math.floor(st.typed);
        lines.forEach((l, i) => {
          const chars = [...l];
          const part = chars.slice(0, Math.max(0, left)).join('');
          left -= chars.length;
          if (part) g.text(part, 14, 134 + i * 20, { col: st.phase === 'talk' ? P.white : P.lyellow });
        });
        // 受ける・断る
        const btn = (b, key, label, chosen) => {
          const on = st.phase === 'talk' || chosen;
          g.box(b.x, b.y, b.w, b.h, { fill: chosen ? P.mblue : P.navy, border: on ? P.white : P.dgray });
          const w = g.measure(key, 16) + 4 + g.measure(label, 16);
          const x = b.x + Math.round((b.w - w) / 2);
          g.text(key, x, b.y + 3, { col: on ? P.yellow : P.dgray });
          g.text(label, x + g.measure(key, 16) + 4, b.y + 3, { col: on ? P.white : P.dgray });
        };
        if (st.phase === 'talk' || st.phase === 'react') {
          btn(BTN_A, 'A', '受ける', st.phase === 'react' && st.choice !== 'refuse');
          btn(BTN_B, 'B', '断る', st.phase === 'react' && st.choice === 'refuse');
          if (st.phase === 'talk') {
            const ratio = st.timeT / TIME;
            g.bar(98, 204, 60, 5, ratio, ratio > 0.5 ? P.lgreen : ratio > 0.25 ? P.yellow : P.red, P.xdgray);
          } else if (st.choice === 'timeout') g.text('時間切れ', 128, 200, { size: 12, align: 'center', col: P.lorange });
        }
      }

      return {
        people,
        pools: { TALK, HERRING, FAKE_TALK, OFFER, FAKE_OFFER, ACCEPT, REFUSE, GEN_TIMEOUT, FAKE_ACCEPT, FAKE_TIMEOUT, REVEAL, TELLS, HERRING_LOOKS },
        // テスト用：いまの様子
        get state() {
          return {
            phase: st.phase, idx: st.idx, hearts: st.hearts, friends: st.friends, reveal: st.reveal, choice: st.choice,
            fakeAt: people.findIndex((p) => p.fake), fake: cur().fake, timeLeft: st.timeT, line: st.line, name: st.reveal ? FAKE_NAME : cur().label,
          };
        },
        update(dt) {
          st.t += dt;
          st.pT += dt;
          st.puffT -= dt;
          st.heartT -= dt;
          st.qShift = api.approach(st.qShift, 0, dt * 4);
          // 文字を 1 文字ずつ出す
          const before = Math.floor(st.typed);
          if (st.phase === 'talk' || st.phase === 'react') st.typed += dt * (st.phase === 'talk' ? 30 : 40);
          if (st.phase === 'talk' && Math.floor(st.typed) !== before && before < cur().text.length && before % 3 === 0) api.sfx('text');
          if (api.ended) return;

          if (st.phase === 'in') {
            if (st.pT >= 0.3) {
              st.phase = 'talk';
              st.pT = 0;
              st.typed = 0;
              st.timeT = TIME;
              api.sfx('select');
            }
          } else if (st.phase === 'talk') {
            st.timeT -= dt;
            const tp = api.input.tap;
            if (st.pT > 0.2 && (api.input.pressed('a') || (tp && inside(tp, BTN_A)))) decide('accept');
            else if (st.pT > 0.2 && (api.input.pressed('b') || (tp && inside(tp, BTN_B)))) decide('refuse');
            else if (st.timeT <= 0) decide('timeout');
          } else if (st.phase === 'react') {
            if (st.pT >= 1.3) {
              st.phase = 'out';
              st.pT = 0;
            }
          } else if (st.phase === 'out') {
            if (st.pT >= 0.3) {
              st.idx++;
              st.phase = 'in';
              st.pT = 0;
              st.typed = 0;
              st.choice = '';
              st.qShift = 1;
            }
          }
        },
        draw(g) {
          drawRoom(g);
          drawHearts(g);
          drawQueue(g);
          drawHero(g);
          drawFace(g);
          drawDialog(g);
        },
      };
    },
  });
})();
