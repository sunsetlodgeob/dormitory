/*
 * 4月 新歓「ニセ一年を見抜け」
 *  新歓コンパの 2 日目。一年が 1 人ずつ、「連絡先、交換しない？」などと声をかけてくる。
 *  寮では毎年、3年生が 1 人、一年のふりをして一年にまぎれこむ（先輩はみんな知っているドッキリ。一年は知らない）。
 *  そのニセ一年は、ネタばらしでいちばん効くように、わざと一年にこき使われようとして、何度も寄ってくる。
 *  - A：受ける　B：断る（1 人 6.5 秒ほど。だまっていると、受けたことになる）
 *  - 8 回のうち 3 回がニセ一年（同じ人が、何度も来る）。本物は受けて、ニセ一年は断る
 *  - 本物を 3 人断ると、友だちができずに負け
 *  - 8 回が終わるとネタばらし「実は、一年じゃありませんでした！ 3年です！」。
 *    一度もニセ一年を使わなければクリア。一度でも使っていたら、3年生をパシリにしていたので負け
 *  - ぼろ：セリフ（去年を知っている・寮にくわしすぎる・寮長になれなれしい・入学式やオリエンにうとい）と、
 *    うしろの先輩たちのようす（ニセ一年が来ると、笑いをこらえる・目をそらす・スマホでとる）。
 *    どの回も、どちらか 1 つは必ずある
 *  - 本物にも、ちょっと怪しく聞こえる人（二浪・兄が寮にいた・「タメ口でいいよ」）や、お茶をついでくれる人がいる
 *  だれがニセ一年か、何番目に来るか、セリフ、先輩のようすは、毎回ランダム。
 */
(function () {
  'use strict';

  // ── セリフ ─────────────────────────────────────
  // 1 行は 14 文字まで（それより長いときは \n で切っておく）。世間話は 2 行まで、申し出は 1 行で、あわせて 3 行
  // 本物の一年の世間話
  const TALK = [
    'きのうのコンパ、\nやばかったな！',
    '入学式、あしただな。\nスーツ、きつい…。',
    '学部のオリエン、\nあさって9時だって。',
    '履修登録、もう決めた？',
    'サークル、どこ見に行く？',
    '地元、どこ？\nおれは北海道！',
    'スマホの充電、\nあと3%…。',
    '先輩たち、テンション\n高すぎじゃない？',
    '駅から寮まで、\nまよっちゃってさ。',
  ];
  // 本物だけど、ちょっと怪しく聞こえる世間話（ひっかけ）
  const HERRING = [
    '二浪したから、\nちょっと年上なんだ。',
    '兄貴が、この寮に\nいたんだよね。',
    'オープンキャンパスで、\n寮も見に来たんだ。',
    '老け顔って、\nよく言われる…。',
    'タメ口でいいよ。\n同期なんだし！',
  ];
  // 本物の申し出・お願い（受けると友だちになれる）
  const OFFER = [
    '連絡先、交換しない？',
    '入学式、いっしょに行こう！',
    'からあげ、半分こしよう！',
    '写真、いっしょにとろうよ。',
    '充電器、ちょっと貸して！',
    '学食、今度いっしょに行こう。',
    'お茶、ついでにつごうか？',
    'ポテチ、食べる？',
    'サークル、いっしょに見よう。',
  ];
  // ニセ一年（3年生）のぼろ：去年を知っている・寮にくわしすぎる・寮長になれなれしい・一年なら知っていることにうとい
  const FAKE_TALK = [
    '去年の新歓より…あ、\nいや、なんでもない！',
    '風呂は、10時すぎが\nすいてるよ。',
    '305号室？ あそこ、\n冬さむいんだよなあ。',
    'オリエン？ あれ、\n出なくても平気だって。',
    '入学式のスーツ？\n…あ、おれも着る着る！',
    '寮長のやつ…じゃなくて、\n寮長さん、こわいよね〜。',
    'このコール、なつかしい…\nいや、はじめて聞いた！',
    '2階の自販機、10円\n安いの知ってた？',
  ];
  // ニセ一年の、ぼろのない世間話（このときは、うしろの先輩が必ず反応する）
  const FAKE_PLAIN = [
    'タメ口でいこうぜ、\nタメ口！',
    'きのうのコンパ、\nたのしかったね〜。',
    'おれたち、もう\n友だちだよな！',
  ];
  // ニセ一年の申し出：わざと一年にこき使われようとする
  const FAKE_OFFER = [
    'なんか買ってくるよ！',
    '荷物、部屋まで持つよ！',
    '肩、もんであげようか？',
    'おしぼり、とってくるよ！',
    'なんでも言って！パシるから！',
    'タメ口で、こき使ってよ！',
    '飲みもの、つぎたすよ！',
  ];
  const ACCEPT = ['やった！\nよろしくな！', 'サンキュー！\n友だちだな！', 'じゃ、あとでな！', 'おう、決まり！'];
  const REFUSE = ['あ…そっか…。', 'ご、ごめん…。', 'じゃあ、また今度…。'];
  const GEN_TIMEOUT = '…返事ないけど、\nいいってことだよな！';
  // ニセ一年を使ったとき（まだ、だれも気づかない。うしろの先輩は笑いをこらえている）
  const FAKE_ACCEPT = ['よろこんで〜！', 'まかせて！\nすぐ行ってくる！', 'おっけー！\nなんでも言ってね！'];
  const FAKE_TIMEOUT = 'じゃ、適当に\nやっとくね〜！';
  // ニセ一年を断ったとき
  const FAKE_REFUSE = ['えー、遠慮すんなって〜。', 'そっか…\nまた言ってよ！', 'ふーん…\nなかなかやるじゃん。'];
  // ネタばらし
  const REVEAL = ['実は、一年じゃ\nありませんでした！', '3年です！'];
  const WIN_LINE = '…きみには、\n使われなかったなあ。';
  const LOSE_LINE = 'こき使ってくれて、\nありがとな、一年。';
  const NAME = '一年';
  const FAKE_NAME = '3年生'; // ネタばらしのあとの名札
  const N = 8; // 声をかけてくる回数
  const REACTS = ['smirk', 'away', 'film']; // ニセ一年が来たときの、うしろの先輩のようす

  // ── 顔に、めがね・ばんそうこう（見分けやすく）や、正体（寮のジャージ）を足す ──────────
  const JERSEY = '#283890', JERSEY_HI = '#3c50b8';
  const faces = new Map();
  function hex(d, i) {
    return d[i + 3] ? '#' + ((1 << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).slice(1) : null;
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
    const shirt = at(8, 29);
    if (deco === 'glasses') {
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
  const LOOKS = ['glasses', 'bandage']; // 本物の何人かは、めがね・ばんそうこう（見分けやすく）

  // ハートのドット（7×6）
  const HEART = ['0110110', '1111111', '1111111', '0111110', '0011100', '0001000'];

  OTK.register({
    id: 'nise',
    order: 2,
    month: 4,
    event: '新歓',
    title: 'ニセ一年を見抜け',
    goal: 'ニセ一年を使うな！',
    howto: ['A：受ける　B：断る', 'ニセ一年（3年生）は断れ', '本物を3人断ると負け'],
    note: 'セリフと、うしろの先輩に注意。\nだまっていると、受けたことになる。',
    time: null,
    timeout: 'lose',
    bgm: 'menu',
    create(api) {
      const P = api.P;
      const TIME = Math.min(8, 6.5 + 0.5 * (api.tries | 0)); // 1 人ごとの考える時間
      const BOX = { x: 74, y: 14, w: 108, h: 106 }; // 顔のわく
      const BTN_A = { x: 10, y: 195, w: 80, h: 22 };
      const BTN_B = { x: 166, y: 195, w: 80, h: 22 };
      // うしろの先輩（窓の前にすわっている。先輩A・先輩B と同じ色）
      const SEN = [{ x: 196, v: 1, dir: 'right' }, { x: 226, v: 4, dir: 'left' }];

      // ── 8 回ぶんを用意する ───────────────────────────
      // 人：本物 5 人 ＋ ニセ一年 1 人（index 5）。ニセ一年は 2 回目以降に、となりあわずに 3 回来る
      const turns = (() => {
        // 顔は毎回ランダム（寸劇の一年D と同じ顔 v3 は使わない。だれがニセ一年か、寸劇からはわからないように）
        const vars = api.shuffle([0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]).slice(0, 6);
        const looks = api.shuffle([0, 1, 2, 3, 4]).slice(0, api.irnd(1, 2));
        const people = vars.map((v, i) => ({ v, fake: i === 5, deco: looks.includes(i) ? api.pick(LOOKS) : null }));
        let slots;
        for (let k = 0; k < 200; k++) {
          slots = api.shuffle([1, 2, 3, 4, 5, 6, 7]).slice(0, 3).sort((a, b) => a - b);
          if (slots[1] - slots[0] > 1 && slots[2] - slots[1] > 1) break;
        }
        const talks = api.shuffle(TALK);
        const herrings = api.shuffle(HERRING);
        const offers = api.shuffle(OFFER);
        const hTalk = api.shuffle([0, 1, 2, 3, 4]).slice(0, api.irnd(1, 2)); // 怪しく聞こえる本物
        const fTalk = api.shuffle(FAKE_TALK);
        const fPlain = api.shuffle(FAKE_PLAIN);
        const fOffer = api.shuffle(FAKE_OFFER);
        const out = [];
        let real = 0;
        for (let i = 0; i < N; i++) {
          if (slots.includes(i)) {
            const p = people[5];
            const plain = api.chance(0.3);
            // ぼろのない世間話のときは、先輩が必ず反応する。2 回しっぱいしたあとは、いつも反応する
            const react = plain || api.tries >= 2 || api.chance(0.65) ? api.pick(REACTS) : null;
            const talk = plain ? fPlain.pop() : fTalk.pop();
            const offer = fOffer.pop();
            out.push({ who: 5, v: p.v, deco: p.deco, fake: true, talk, offer, text: talk + '\n' + offer, react, sen: api.irnd(0, 1), mood: 'happy' });
          } else {
            const k = real++;
            const p = people[k];
            const talk = hTalk.includes(k) ? herrings.pop() : talks.pop();
            const offer = offers.pop();
            out.push({ who: k, v: p.v, deco: p.deco, fake: false, talk, offer, text: talk + '\n' + offer, react: null, sen: 0, mood: api.pick(['normal', 'happy']) });
          }
        }
        return out;
      })();
      const fakeTurn = turns.find((t) => t.fake);

      const st = {
        t: 0,
        idx: 0,
        phase: 'in', // in（あらわれる）→ talk（話す・選ぶ）→ react（反応）→ out（さる）→ in … → reveal（ネタばらし）
        pT: 0,
        typed: 0,
        timeT: TIME,
        hearts: 3,
        heartT: 0, // ハートがわれた直後
        friends: 0,
        used: 0, // ニセ一年を使った回数
        refusedFake: 0,
        line: '',
        mood: 'normal',
        choice: '',
        qShift: 0, // 列がつめる動き
        rStep: 0, // ネタばらしの段
        reveal: false, // 正体がわかった（ジャージ姿）
        puffT: 0,
        pale: false, // ガーン
      };
      const cur = () => (st.phase === 'reveal' ? fakeTurn : turns[st.idx]);
      const inside = (tp, b) => tp.x >= b.x - 6 && tp.x < b.x + b.w + 6 && tp.y >= b.y - 8 && tp.y < b.y + b.h + 6;

      function decide(kind) {
        const p = cur();
        st.choice = kind;
        st.phase = 'react';
        st.pT = 0;
        st.typed = 0;
        const acc = kind !== 'refuse';
        if (p.fake) {
          if (acc) {
            // 使ってしまった。まだ、だれも何も言わない（うしろの先輩は、笑いをこらえる）
            st.used++;
            st.line = kind === 'timeout' ? FAKE_TIMEOUT : FAKE_ACCEPT[(st.used - 1) % FAKE_ACCEPT.length];
            st.mood = 'happy';
            api.sfx('ok');
          } else {
            st.line = FAKE_REFUSE[Math.min(st.refusedFake, FAKE_REFUSE.length - 1)];
            st.refusedFake++;
            st.mood = st.refusedFake >= 3 ? 'normal' : 'sad';
            api.sfx('cancel');
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
      // ネタばらしの段：0「実は…」→ 1（煙）「3年です！」→ 2 結果のひとこと
      function revealStep(n) {
        st.rStep = n;
        st.pT = 0;
        st.typed = 0;
        if (n === 0) {
          st.line = REVEAL[0];
          st.mood = 'happy';
          api.sfx('select');
        } else if (n === 1) {
          st.line = REVEAL[1];
          st.reveal = true;
          st.puffT = 0.35;
          st.mood = 'happy';
          api.flash(P.white, 0.15);
          api.sfx('poof');
        } else {
          if (st.used) {
            st.line = LOSE_LINE;
            st.mood = 'happy';
            st.pale = true;
            st.hearts = 0;
            st.heartT = 0.7;
            api.shake(4, 0.5);
            api.flash(P.red, 0.2);
            api.sfx('damage');
            api.lose('3年生の先輩を、\nパシリにしていた…', { wait: 2.2 });
          } else {
            st.line = WIN_LINE;
            st.mood = 'sad';
            api.sfx('fanfare');
            api.win('ニセ一年を、一度も\n使わなかった！', { wait: 2.2 });
          }
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
      // 小さい吹き出し（文字）。cx は真ん中、by は下はし
      function bubble(g, cx, by, str) {
        const w = g.measure(str, 12) + 6, h = 14;
        const x = Math.round(cx - w / 2), y = by - h;
        g.R(x + 1, y, w - 2, h, P.ink);
        g.R(x, y + 1, w, h - 2, P.ink);
        g.R(x + 1, y + 1, w - 2, h - 2, P.white);
        g.R(Math.round(cx) - 1, by - 1, 3, 2, P.ink);
        g.R(Math.round(cx), by - 1, 1, 1, P.white);
        g.text(str, x + 3, y + 1, { size: 12, col: P.ink });
      }
      // うしろの先輩 2 人（ちゃぶ台をはさんで、すわっている）。ニセ一年が来ると、ようすがおかしい
      function seniorMode(i) {
        const p = cur();
        if (st.phase === 'reveal') return 'cheer';
        if (p && p.fake && st.phase === 'react' && st.choice !== 'refuse') return 'laugh';
        if (p && p.fake && p.react && p.sen === i && (st.phase === 'talk' || (st.phase === 'in' && st.pT > 0.15))) return p.react;
        return 'chat';
      }
      function drawSeniors(g) {
        // ちゃぶ台と湯のみ
        g.R(207, 76, 24, 3, P.ink);
        g.R(208, 76, 22, 2, '#8c5c34');
        g.R(210, 79, 2, 3, P.ink);
        g.R(226, 79, 2, 3, P.ink);
        g.R(213, 73, 3, 3, P.white);
        g.R(222, 73, 3, 3, P.lgreen);
        SEN.forEach((s, i) => {
          const mode = seniorMode(i);
          let dir = s.dir, dx = 0, dy = 0, text = null, phone = false;
          // 吹き出しは、となりの先輩とかさならないように、1 人ぶんだけ
          if (mode === 'smirk') { dir = 'down'; dx = Math.floor(st.t * 16) % 2; text = 'ぷっ'; }
          else if (mode === 'away') { dir = 'up'; text = '…'; }
          else if (mode === 'film') { dir = 'down'; phone = true; text = 'じー'; }
          else if (mode === 'laugh') { dir = 'down'; dx = Math.floor(st.t * 16) % 2; text = i ? null : 'くくっ'; }
          else if (mode === 'cheer') { dir = 'down'; dy = -Math.round(Math.abs(Math.sin(st.t * 8 + i)) * 3); if (st.rStep >= 1) text = i ? '♪' : 'わはは'; }
          else if (Math.floor(st.t / 2.6 + i * 0.5) % 3 === 0 && (st.t + i) % 2.6 < 0.9) text = '♪';
          const img = api.person('senpai', { dir, variant: s.v });
          const x = s.x + dx, y = 58 + dy;
          g.ctx.drawImage(img, 0, 0, 16, 18, x, y, 16, 18); // 腰から下は、ちゃぶ台のかげ
          if (phone) { // 顔の前にスマホをかまえて、とっている（赤い点が点滅）
            g.R(x + 4, y + 4, 9, 12, P.ink);
            g.R(x + 5, y + 5, 7, 10, '#5c5c6c');
            g.R(x + 6, y + 6, 2, 2, P.lsky);
            if (g.blink(2)) g.R(x + 9, y + 6, 2, 2, P.red);
          }
          if (text) bubble(g, x + 8, y - 1, text);
        });
      }
      function drawHearts(g) {
        g.text('友だち', 8, 21, { size: 12, col: P.white, outline: P.ink });
        for (let h = 0; h < 3; h++) {
          const alive = h < st.hearts;
          const breaking = !alive && st.heartT > 0 && (h === st.hearts || st.pale);
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
        if (st.phase === 'reveal') return;
        const rest = N - st.idx - 1;
        g.text('あと ' + Math.max(0, rest) + '人', 218, 21, { size: 12, align: 'center', col: P.white, outline: P.ink });
        for (let j = Math.min(rest, 6) - 1; j >= 0; j--) {
          const x = 187 + (j + st.qShift) * 10;
          const p = turns[st.idx + 1 + j];
          g.shadow(x + 8, 117, 6);
          g.sprite(api.person('ichinen', { dir: 'left', variant: p.v }), x, 94);
        }
      }
      function drawHero(g) {
        const happy = st.phase === 'react' && st.mood === 'happy';
        const bob = happy ? -Math.round(Math.abs(Math.sin(st.pT * 9)) * 3) : 0;
        g.shadow(38, 108, 11);
        g.sprite(api.person('otoko', { dir: 'right' }), 22, 60 + bob, { scale: 2 });
        if (st.pale) { // ガーン（顔が青ざめる）
          for (let i = 0; i < 5; i++) g.R(29 + i * 4, 62, 1, 12 + (i % 2) * 4, P.mblue);
          g.text('！！', 54, 44, { col: P.yellow, outline: P.black });
        } else if (st.phase === 'reveal' && st.rStep >= 1) {
          if (!st.used) g.text('！', 54, 46, { col: P.yellow, outline: P.black });
        } else if (st.phase === 'react' && st.pT < 1.2) {
          if (st.mood === 'happy') g.text('♪', 54, 48 - Math.round(st.pT * 10), { col: P.rose, outline: P.white });
          else { g.R(52, 60, 2, 4, P.lsky); g.R(51, 62, 4, 2, P.lsky); }
        }
      }
      function drawFace(g) {
        const B = BOX;
        g.box(B.x, B.y, B.w, B.h, { fill: P.lsky });
        const ix = B.x + 4, iy = B.y + 4, iw = B.w - 8, ih = B.h - 8;
        g.R(ix, iy + ih - 22, iw, 22, P.sky);
        let k = 1;
        if (st.phase === 'in' || (st.phase === 'reveal' && st.rStep === 0)) k = Math.min(1, st.pT / 0.3);
        else if (st.phase === 'out') k = 1 - Math.min(1, st.pT / 0.3);
        if (k <= 0) return;
        const p = cur();
        const h = Math.max(1, Math.round(ih * k));
        g.ctx.save();
        g.ctx.beginPath();
        g.ctx.rect(ix, iy + Math.round((ih - h) / 2), iw, h);
        g.ctx.clip();
        const mood = st.phase === 'react' || st.phase === 'out' || st.phase === 'reveal' ? st.mood : p.mood;
        const typing = (st.phase === 'talk' && st.typed < p.text.length) || (st.phase === 'reveal' && st.typed < st.line.length);
        const bob = typing && Math.floor(st.t * 8) % 2 ? 1 : 0;
        const shown = st.reveal && st.puffT < 0.2; // 煙のあとは、寮のジャージを着た 3年生の姿
        g.sprite(face(api, p.v, mood, p.deco, shown), B.x + 6, B.y + 5 + bob, { scale: 3 });
        if (!shown) {
          // 名札
          g.R(B.x + 6 + 57, B.y + 5 + bob + 84, 12, 8, P.white);
          g.R(B.x + 6 + 57, B.y + 5 + bob + 84, 12, 2, P.red);
          g.frame(B.x + 6 + 56, B.y + 5 + bob + 83, 14, 10, P.ink);
        }
        if (st.puffT > 0) {
          const r = 10 + (0.35 - st.puffT) * 90;
          [[0, 0], [-22, 10], [22, 8], [-12, -18], [14, -16]].forEach(([dx, dy], i) => g.disc(B.x + B.w / 2 + dx, B.y + B.h / 2 + dy, r * (i ? 0.6 : 1), i % 2 ? P.lgray : P.white));
        }
        g.ctx.restore();
      }
      function drawDialog(g) {
        const p = cur();
        g.box(4, 124, 248, 98);
        const name = st.reveal && st.puffT < 0.2 ? FAKE_NAME : NAME;
        const nw = g.measure(name, 12) + 14;
        g.box(12, 108, nw, 20, { fill: name === FAKE_NAME ? P.dred : P.navy });
        g.text(name, 19, 111, { size: 12, col: P.lyellow });
        if (st.phase === 'in' || (st.phase === 'reveal' && st.rStep === 0 && st.pT < 0.3)) return;
        const str = st.phase === 'talk' ? p.text : st.line;
        const lines = g.wrap(str, 232, 16).slice(0, 3); // 1 行 14 文字まで
        let left = Math.floor(st.typed);
        lines.forEach((l, i) => {
          const chars = [...l];
          const part = chars.slice(0, Math.max(0, left)).join('');
          left -= chars.length;
          if (part) g.text(part, 14, 134 + i * 20, { col: st.phase === 'talk' ? P.white : P.lyellow });
        });
        if (st.phase === 'reveal') return;
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
        turns,
        pools: { TALK, HERRING, OFFER, FAKE_TALK, FAKE_PLAIN, FAKE_OFFER, ACCEPT, REFUSE, GEN_TIMEOUT, FAKE_ACCEPT, FAKE_TIMEOUT, FAKE_REFUSE, REVEAL, WIN_LINE, LOSE_LINE, REACTS },
        // テスト用：いまの様子
        get state() {
          const p = cur();
          return {
            phase: st.phase, idx: st.idx, hearts: st.hearts, friends: st.friends, used: st.used, refusedFake: st.refusedFake,
            reveal: st.reveal, rStep: st.rStep, choice: st.choice, fake: !!(p && p.fake), react: p ? p.react : null,
            seniors: [seniorMode(0), seniorMode(1)], timeLeft: st.timeT, line: st.line, name: st.reveal && st.puffT < 0.2 ? FAKE_NAME : NAME,
            fakeTurns: turns.map((t, i) => (t.fake ? i : -1)).filter((i) => i >= 0),
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
          if (st.phase === 'talk' || st.phase === 'react' || (st.phase === 'reveal' && (st.rStep > 0 || st.pT >= 0.3))) st.typed += dt * (st.phase === 'talk' ? 30 : 34);
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
              st.pT = 0;
              st.typed = 0;
              st.choice = '';
              if (st.idx + 1 >= N) {
                st.phase = 'reveal';
                revealStep(0);
              } else {
                st.idx++;
                st.phase = 'in';
                st.qShift = 1;
              }
            }
          } else if (st.phase === 'reveal') {
            if (st.rStep === 0 && st.pT >= 2.0) revealStep(1);
            else if (st.rStep === 1 && st.pT >= 1.1) revealStep(2);
          }
        },
        draw(g) {
          drawRoom(g);
          drawSeniors(g);
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
