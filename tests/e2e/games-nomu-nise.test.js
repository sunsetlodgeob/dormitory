/*
 * ミニゲーム「飲むか吐くか」（nomu）と「ニセ一年を見抜け」（nise）の確認
 *   node tests/e2e/games-nomu-nise.test.js
 *   SHOTS_DIR=/tmp/shots node tests/e2e/games-nomu-nise.test.js   … スクリーンショットも撮る（リポジトリの外に）
 * キー操作（スマホは画面のボタンとタップ）だけで、勝ち・負けの両方にたどりつけることを確かめる。
 * 中の様子は、ゲームが返すオブジェクトの state（OTK.debug.game.state）で見る。
 */
const fs = require('fs');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.PORT) || 8811; // ARCH.md の割り当て（ミニゲームは 8811〜8815）
const SHOTS = process.env.SHOTS_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function check(cond, msg) {
  if (!cond) throw new Error('NG: ' + msg);
  console.log('  ok  ' + msg);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function shot(page, name) {
  if (SHOTS) await page.locator('#otk-canvas').screenshot({ path: path.join(SHOTS, name + '.png') });
}
async function waitScene(page, name, timeout = 10000) {
  await page.waitForFunction((n) => window.OTK && OTK.debug && OTK.debug.scene === n, name, { timeout, polling: 50 });
}
// いまのミニゲームの様子と、結果（まだなら null）
function look(page) {
  return page.evaluate(() => {
    const r = OTK.debug.run, g = OTK.debug.game;
    return r && g && g.state ? Object.assign({ res: r.result, msg: r.msg, id: r.id }, g.state) : null;
  });
}
// A・B を押す。スマホは画面の下のボタンをタップ
function pusher(phone) {
  return async (page, k) => {
    if (phone) await page.locator('[data-otk-key="' + k + '"]').tap();
    else await page.keyboard.press(k === 'a' ? 'z' : 'x');
  };
}
// 結果が出て、エンジンの結果画面になるまで待つ
async function finish(page, want, name) {
  await page.waitForFunction(() => OTK.debug.run && OTK.debug.run.result, null, { timeout: 15000, polling: 50 });
  const s = await look(page);
  check(s.res === want, name + '：' + (want === 'win' ? 'クリア' : 'しっぱい') + 'になる（' + s.res + '「' + String(s.msg).replace(/\n/g, '') + '」）');
  await page.waitForTimeout(300);
  await shot(page, name + '-end');
  await waitScene(page, 'result', 15000);
  await shot(page, name + '-result');
  return s;
}

// ── 飲むか吐くか ───────────────────────────────────
// 上手な人：自分の番で飲み、限界になったらすぐ吐く。puke: false なら吐かない（いつかダウンする）
async function playNomu(page, push, o) {
  o = o || {};
  const puke = o.puke !== false;
  const t0 = Date.now();
  while (Date.now() - t0 < (o.maxMs || 60000)) {
    const s = await look(page);
    if (s && s.res) return s;
    if (s) {
      if (puke && s.red && !s.vomiting) await push(page, 'b');
      else if (s.mine && (!s.red || !puke)) await push(page, 'a');
    }
    await sleep(15);
  }
  throw new Error('nomu が時間内に終わらない');
}

async function nomuDesktop(open) {
  console.log('飲むか吐くか（パソコン）');
  const { page, errors } = await open('game/?play=nomu&seed=3', { wait: 400 });
  await waitScene(page, 'intro');
  const def = await page.evaluate(() => { const d = OTK.get('nomu'); return { title: d.title, note: d.note, time: d.time, timeout: d.timeout, howto: d.howto }; });
  check(/二十歳/.test(def.note) && /一気飲みは絶対にやめましょう/.test(def.note), '説明に「お酒は二十歳になってから。一気飲みは絶対にやめましょう。」');
  check(def.time === 30 && def.timeout === 'win', '30 秒たえればクリア');
  await page.waitForTimeout(300);
  await shot(page, 'nomu-intro');
  await page.keyboard.press('Enter');
  await waitScene(page, 'play');
  await page.waitForTimeout(300);
  await shot(page, 'nomu-start');

  // 勝ち：自分の番で飲み、限界で吐く
  await page.evaluate(() => { OTK.debug.speed = 2; });
  const push = pusher(false);
  const w = await playNomu(page, push);
  check(w.res === 'win' && w.mistakes === 0, 'キーで上手に遊ぶとクリア（' + w.cups + '杯・吐いた ' + w.vomits + '回・ミス ' + w.mistakes + '）');
  check(w.cups >= 3 && w.vomits >= 1, '何回か飲んで、限界で吐く場面がある');
  await finish(page, 'win', 'nomu-win');

  // 負け①：まちがい 3 回（限界でないのに B、番を見のがす、番でないのに A）
  await page.evaluate(() => { OTK.debug.seed(5); OTK.debug.start('nomu', { quick: true }); });
  await page.waitForFunction(() => OTK.debug.scene === 'play' && OTK.debug.game.state && OTK.debug.game.state.phase === 'call', null, { timeout: 8000 });
  await page.keyboard.press('x');
  await page.waitForTimeout(200);
  let s = await look(page);
  check(s.mistakes === 1, '限界でないのに B（吐く）はミス');
  await shot(page, 'nomu-miss');
  await page.waitForFunction(() => OTK.debug.game.state.mine, null, { timeout: 20000, polling: 20 });
  await page.waitForFunction(() => !OTK.debug.game.state.mine, null, { timeout: 5000, polling: 20 });
  s = await look(page);
  check(s.mistakes === 2, '自分の番を見のがすとミス');
  // コールが回りはじめたところ（まだ止まらない）で A
  await page.waitForFunction(() => { const g = OTK.debug.game; return g.state.phase === 'call' && g.st.steps - g.st.step >= 2; }, null, { timeout: 5000, polling: 20 });
  await page.keyboard.press('z');
  const m = await finish(page, 'lose', 'nomu-lose-miss');
  check(m.mistakes === 3, '自分の番でないのに A（飲む）もミス。3 回で負け');

  // 負け②：吐かずに飲みつづけると、限界でダウン
  await page.evaluate(() => { OTK.debug.seed(3); OTK.debug.speed = 2; OTK.debug.start('nomu', { quick: true }); });
  await waitScene(page, 'play');
  const d = await playNomu(page, push, { puke: false });
  check(d.res === 'lose' && d.down, '限界のまま飲むとダウン（' + d.cups + '杯め）');
  await finish(page, 'lose', 'nomu-lose-down');

  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));
}

async function nomuPhone(open) {
  console.log('飲むか吐くか（スマホ・画面のボタン）');
  const { page, errors } = await open('game/?play=nomu&quick=1&seed=11', { phone: true, wait: 400 });
  await waitScene(page, 'play');
  const box = await page.locator('#otk-canvas').boundingBox();
  const vw = await page.evaluate(() => innerWidth);
  check(box.width <= vw && box.width >= 300, '画面が横幅におさまる（' + Math.round(box.width) + 'px）');
  const w = await playNomu(page, pusher(true));
  check(w.res === 'win' && w.mistakes === 0, 'A・B ボタンのタップでクリアできる（' + w.cups + '杯・吐いた ' + w.vomits + '回）');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'nomu-phone.png') });
  await finish(page, 'win', 'nomu-phone-win');
  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));
}

// ── ニセ一年を見抜け ─────────────────────────────────
// 新歓 2 日目。一年が 8 回、声をかけてくる。そのうち 3 回は、同じニセ一年（一年のふりをした 3年生。毎年恒例のドッキリ）。
// 8 回のあとにネタばらし。一度もニセ一年を使わなければクリア。
// decide(s) が 'a'（受ける）・'b'（断る）・null（なにもしない）を返す
async function playNise(page, push, decide, o) {
  o = o || {};
  let lastIdx = -1, lastAt = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < (o.maxMs || 120000)) {
    const s = await look(page);
    if (s && s.res) return s;
    if (s && s.phase === 'talk' && (s.idx !== lastIdx || Date.now() - lastAt > 800)) {
      if (s.idx !== lastIdx) await sleep(o.think || 350); // 出てすぐは受けつけない
      lastIdx = s.idx;
      lastAt = Date.now();
      const k = decide(s);
      if (k) await push(page, k);
    }
    await sleep(30);
  }
  throw new Error('nise が時間内に終わらない');
}
const smart = (s) => (s.fake ? 'b' : 'a'); // ニセ一年だけ断る

async function niseDesktop(open) {
  console.log('ニセ一年を見抜け（パソコン）');
  const { page, errors } = await open('game/?play=nise&seed=5', { wait: 400 });
  await waitScene(page, 'intro');
  await page.waitForTimeout(300);
  await shot(page, 'nise-intro');
  const def = await page.evaluate(() => { const d = OTK.get('nise'); return { time: d.time, howto: d.howto, goal: d.goal, note: d.note }; });
  check(def.time === null, '時間制限なし（1 人ずつの持ち時間だけ）');
  check(def.howto.some((l) => /ニセ一年/.test(l)) && !/3年|OB/.test(def.howto.join('') + def.goal + def.note), '説明では、ニセ一年が 3年生だとは言わない（ネタばらしまでのお楽しみ。OB でもない）');

  // 8 回のうち 3 回が、同じニセ一年。何番目か・セリフ・先輩のようすは種ごとにかわる
  const runs = await page.evaluate(() => {
    const out = [];
    for (let sd = 1; sd <= 16; sd++) {
      OTK.debug.seed(sd);
      OTK.debug.start('nise', { quick: true });
      const g = OTK.debug.game;
      out.push({ turns: g.turns.map((t) => ({ fake: t.fake, who: t.who, v: t.v, talk: t.talk, offer: t.offer, text: t.text, react: t.react })), pools: g.pools });
    }
    return out;
  });
  const fakes = (r) => r.turns.map((t, i) => (t.fake ? i : -1)).filter((i) => i >= 0);
  check(runs.every((r) => r.turns.length === 8 && fakes(r).length === 3), '一年が 8 回声をかけてくる。そのうち 3 回がニセ一年');
  check(runs.every((r) => new Set(r.turns.filter((t) => t.fake).map((t) => t.v)).size === 1), 'ニセ一年は、3 回とも同じ人（何度もパシリを買って出る）');
  check(runs.every((r) => { const re = r.turns.filter((t) => !t.fake); return new Set(re.map((t) => t.who)).size === 5 && !re.some((t) => t.v === r.turns.find((x) => x.fake).v); }), '本物の一年は 5 人（ニセ一年とは別の顔）');
  check(runs.every((r) => !r.turns[0].fake && fakes(r).every((i, k, a) => !k || i - a[k - 1] > 1)), '1 回目はいつも本物。ニセ一年は続けては来ない');
  check(runs.every((r) => r.turns.every((t) => (t.fake ? t.v === 3 : t.v !== 3))), 'ニセ一年は寸劇の一年D と同じ顔（ichinen の 3。ネタばらしの 3年生とつながる）。本物はほかの顔');
  check(new Set(runs.map((r) => fakes(r).join())).size >= 5, 'ニセ一年が何番目に来るかは、毎回ちがう');
  check(new Set(runs.map((r) => r.turns.find((t) => t.fake).text)).size >= 8, 'ニセ一年のセリフも、毎回ちがう');
  const pools = runs[0].pools;
  const tellTalk = (t) => pools.FAKE_TALK.includes(t.talk);
  check(runs.every((r) => r.turns.every((t) => (t.fake ? (tellTalk(t) || pools.REACTS.includes(t.react)) && pools.FAKE_OFFER.includes(t.offer) : !tellTalk(t) && !t.react && !pools.FAKE_OFFER.includes(t.offer)))),
    'ニセ一年が来るたび、ぼろ（くわしすぎるセリフか、うしろの先輩のようす）が必ず 1 つはある。本物にはない');
  check(new Set([].concat(...runs.map((r) => r.turns.map((t) => t.react).filter(Boolean)))).size === 3, '先輩のようすは 3 とおり（笑いをこらえる・目をそらす・スマホでとる）');
  check(pools.FAKE_TALK.some((t) => /去年/.test(t)) && pools.FAKE_TALK.some((t) => /寮長/.test(t)) && pools.FAKE_TALK.some((t) => /オリエン|入学式/.test(t)) && pools.FAKE_TALK.some((t) => /号室|ダイドー|冷蔵庫/.test(t)),
    '3年生のぼろ：去年を知っている・寮長になれなれしい・入学式やオリエンにうとい・寮にくわしすぎる');
  check(pools.FAKE_OFFER.some((t) => /パシ/.test(t)) && pools.FAKE_OFFER.some((t) => /買って/.test(t)) && pools.FAKE_PLAIN.some((t) => /タメ口/.test(t)), 'ニセ一年は、自分からパシリを買って出る（「タメ口でいこうぜ」）');
  check(runs.some((r) => r.turns.some((t) => !t.fake && pools.HERRING.includes(t.talk))) && pools.HERRING.some((t) => /覚えた/.test(t)) && !pools.HERRING.concat(pools.TALK).some((t) => /タメ口/.test(t)) && pools.OFFER.some((t) => /つごうか/.test(t)), '本物にも、ひっかけ（二浪・先輩をもう覚えた・お茶をつぐ など）がいる。「タメ口」はニセ一年だけ');
  const allText = Object.keys(pools).filter((k) => k !== 'REACTS').map((k) => [].concat(pools[k]).join('\n')).join('\n');
  check(!/OB|ナウい|昭和|テレカ|ポケベル|昔話|タダ酒/.test(allText), 'OB のぼろ（古いことば・昔の物・タダ酒）は出ない');
  check(/一年じゃ/.test(pools.REVEAL[0]) && /3年です/.test(pools.REVEAL[1]) && /使われなかった/.test(pools.WIN_LINE), 'ネタばらし「実は、一年じゃありませんでした！ 3年です！」');
  // セリフがウインドウ（3 行・1 行 14 文字）に入る
  const fit = await page.evaluate((pools) => {
    const bad = [];
    const lines = (t) => OTK.g.wrap(t, 232, 16).length;
    for (const t of pools.TALK.concat(pools.HERRING)) for (const f of pools.OFFER) if (lines(t + '\n' + f) > 3) bad.push(t + ' / ' + f);
    for (const t of pools.FAKE_TALK.concat(pools.FAKE_PLAIN)) for (const f of pools.FAKE_OFFER) if (lines(t + '\n' + f) > 3) bad.push(t + ' / ' + f);
    for (const t of pools.ACCEPT.concat(pools.REFUSE, pools.FAKE_ACCEPT, pools.FAKE_REFUSE, pools.REVEAL, [pools.GEN_TIMEOUT, pools.FAKE_TIMEOUT, pools.WIN_LINE, pools.LOSE_LINE])) if (lines(t) > 3) bad.push(t);
    return bad;
  }, pools);
  check(fit.length === 0, 'セリフがウインドウに入る' + (fit.length ? '：' + fit.join('、') : ''));

  const push = pusher(false);
  // 勝ち：ニセ一年だけ断る
  await page.evaluate(() => { OTK.debug.seed(5); OTK.debug.speed = 2; OTK.debug.start('nise', { quick: true }); });
  await waitScene(page, 'play');
  await page.waitForFunction(() => OTK.debug.game.state.phase === 'talk' && OTK.debug.game.state.idx === 0, null, { timeout: 5000 });
  await page.waitForTimeout(700);
  await shot(page, 'nise-talk');
  const s0 = await look(page);
  check(s0.name === '一年' && s0.seniors.join() === 'chat,chat', '名札は「一年」だけ（名前は出さない）。本物のときは、先輩はふつうに話している');
  // ニセ一年の番で、先輩のようすが変わる
  const seenReact = [], queues = [];
  const w = await playNise(page, push, (s) => {
    if (s.fake && s.react) seenReact.push(s.seniors.includes(s.react));
    queues.push(s);
    return smart(s);
  });
  check(seenReact.length > 0 && seenReact.every(Boolean), 'ニセ一年の番では、うしろの先輩のようすが変わる');
  check(queues.length >= 7 && queues.every((s) => new Set(s.queue).size === s.queue.length && !s.queue.includes(s.who)), '列には、同じ人は 1 回だけ（話している人は、列にいない）');
  check(w.res === 'win' && w.used === 0 && w.refusedFake === 3 && w.hearts === 3 && w.friends === 5, 'ニセ一年だけ断ると、本物 5 人と友だちになって…');
  check(w.reveal && w.phase === 'reveal' && w.name === '3年生' && /使われなかった/.test(w.line), '…最後にネタばらし。「…きみには、使われなかったなあ」でクリア');
  check(/ニセ一年/.test(w.msg), 'クリアのひとこと（' + String(w.msg).replace(/\n/g, '') + '）');
  await page.waitForTimeout(500);
  await shot(page, 'nise-reveal');
  await finish(page, 'win', 'nise-win');

  // 負け①：だれの申し出も受ける（ニセ一年を 3 回パシリにした）。負けがわかるのは、最後のネタばらし
  await page.evaluate(() => { OTK.debug.seed(8); OTK.debug.speed = 3; OTK.debug.start('nise', { quick: true }); });
  await waitScene(page, 'play');
  let sawUsed = false;
  const a = await playNise(page, push, (s) => { if (s.used > 0 && !s.reveal) sawUsed = true; return 'a'; });
  check(sawUsed, 'ニセ一年を使っても、その場ではだれも何も言わない（ドッキリ）');
  check(a.res === 'lose' && a.used === 3 && a.reveal && a.phase === 'reveal' && a.hearts === 0, 'ネタばらしで、3年生をパシリにしていたとわかって負け（大ダメージ）');
  check(/3年生/.test(a.msg) && /ありがと/.test(a.line), '「こき使ってくれて、ありがとな、一年。」（' + String(a.msg).replace(/\n/g, '') + '）');
  await finish(page, 'lose', 'nise-lose-fake');

  // 負け②：ニセ一年を 1 回だけ使っても負け
  await page.evaluate(() => { OTK.debug.seed(5); OTK.debug.speed = 3; OTK.debug.start('nise', { quick: true }); });
  await waitScene(page, 'play');
  let first = true;
  const o1 = await playNise(page, push, (s) => { if (s.fake && first) { first = false; return 'a'; } return smart(s); });
  check(o1.res === 'lose' && o1.used === 1 && o1.reveal, '一度でもニセ一年を使ったら負け');
  await finish(page, 'lose', 'nise-lose-once');

  // 負け③：本物を 3 人断る（その場で負け。ネタばらしはない）
  await page.evaluate(() => { OTK.debug.seed(3); OTK.debug.speed = 2; OTK.debug.start('nise', { quick: true }); });
  await waitScene(page, 'play');
  const third = await page.evaluate(() => OTK.debug.game.turns.map((t, i) => (t.fake ? -1 : i)).filter((i) => i >= 0)[2]);
  const r = await playNise(page, push, () => 'b');
  check(r.res === 'lose' && r.hearts === 0 && !r.reveal && r.idx === third, '本物を 3 人断ると、その場で負け（' + (third + 1) + '人目）');
  check(/友だち/.test(r.msg), '「断りすぎて、友だちができなかった」');
  await finish(page, 'lose', 'nise-lose-alone');

  // 負け④：返事をしないと、受けたことになる（ニセ一年も使ってしまう）
  await page.evaluate(() => { OTK.debug.seed(8); OTK.debug.speed = 4; OTK.debug.start('nise', { quick: true }); });
  await waitScene(page, 'play');
  const t = await playNise(page, push, () => null);
  check(t.res === 'lose' && t.used === 3 && t.friends === 5 && t.hearts === 0, '時間切れは「受ける」あつかい');
  await finish(page, 'lose', 'nise-lose-timeout');

  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));
}

async function nisePhone(open) {
  console.log('ニセ一年を見抜け（スマホ・画面のタップ）');
  const { page, errors } = await open('game/?play=nise&quick=1&seed=21', { phone: true, wait: 400 });
  await waitScene(page, 'play');
  // 音のボタンで、オン・オフが切りかわる
  const snd = () => page.evaluate(() => document.getElementById('otk-sound').getAttribute('aria-pressed'));
  const s0 = await snd();
  await page.locator('#otk-sound').tap();
  const s1 = await snd();
  await page.locator('#otk-sound').tap();
  check(s0 === 'true' && s1 === 'false' && (await snd()) === 'true', '音のボタンで、オン・オフが切りかわる');
  await page.evaluate(() => { OTK.debug.speed = 2; });
  // 画面の「A 受ける」「B 断る」をタップ
  const tapBtn = async (pg, k) => {
    const b = await pg.locator('#otk-canvas').boundingBox();
    const gx = k === 'a' ? 50 : 206, gy = 206;
    await pg.touchscreen.tap(b.x + (gx * b.width) / 256, b.y + (gy * b.height) / 224);
  };
  await page.waitForFunction(() => OTK.debug.game.state.phase === 'talk', null, { timeout: 5000 });
  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'nise-phone.png') });
  const w = await playNise(page, tapBtn, smart);
  check(w.res === 'win' && w.hearts === 3 && w.used === 0, '画面のボタンをタップしてクリアできる');
  await finish(page, 'win', 'nise-phone-win');
  // 画面下の A ボタンでも遊べる（全部受けると負け）
  await page.evaluate(() => { OTK.debug.seed(21); OTK.debug.speed = 3; OTK.debug.start('nise', { quick: true }); });
  await waitScene(page, 'play');
  const a = await playNise(page, pusher(true), () => 'a');
  check(a.res === 'lose' && a.used === 3, '画面下の A ボタンで受けられる（全部受けると負け）');
  await finish(page, 'lose', 'nise-phone-lose');
  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));
}

// 小さいスマホ（幅 360px）で、どちらも画面におさまり、エラーが出ない
async function small(browser, base) {
  console.log('小さいスマホ（360px）');
  for (const id of ['nomu', 'nise']) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e));
    await page.goto(base + 'game/?play=' + id + '&seed=2');
    await waitScene(page, 'intro');
    await page.locator('[data-otk-key="a"]').tap();
    await waitScene(page, 'play');
    await page.waitForTimeout(2500);
    const box = await page.locator('#otk-canvas').boundingBox();
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    check(box.width <= 360 && noScroll, id + '：画面が 360px におさまる（' + Math.round(box.width) + 'px）');
    const foot = await page.evaluate(() => { const f = document.querySelector('[data-ob-footer]'); return f ? f.textContent : ''; });
    check(/フィクション/.test(foot), id + '：ページの下に「フィクションです」の注記');
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, id + '-360.png') });
    const errs = realErrors(errors);
    check(errs.length === 0, id + '：エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));
    await ctx.close();
  }
}

withSite(PORT, async ({ open, browser, base }) => {
  await nomuDesktop(open);
  await nomuPhone(open);
  await niseDesktop(open);
  await nisePhone(open);
  await small(browser, base);
  console.log('すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
