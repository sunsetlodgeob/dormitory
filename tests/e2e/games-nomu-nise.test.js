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
// decide(s) が 'a'（受ける）・'b'（断る）・null（なにもしない）を返す
async function playNise(page, push, decide, o) {
  o = o || {};
  let lastIdx = -1, lastAt = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < (o.maxMs || 90000)) {
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
  const def = await page.evaluate(() => { const d = OTK.get('nise'); return { time: d.time, howto: d.howto, goal: d.goal }; });
  check(def.time === null, '時間制限なし（1 人ずつの持ち時間だけ）');

  // 7 人のうち 1 人だけニセ一年。だれか・セリフ・顔は種ごとにかわる
  const runs = await page.evaluate(() => {
    const out = [];
    for (let sd = 1; sd <= 16; sd++) {
      OTK.debug.seed(sd);
      OTK.debug.start('nise', { quick: true });
      const g = OTK.debug.game;
      out.push({ people: g.people.map((p) => ({ fake: p.fake, deco: p.deco, talk: p.talk, offer: p.offer, text: p.text, label: p.label })), pools: g.pools });
    }
    return out;
  });
  check(runs.every((r) => r.people.length === 7 && r.people.filter((p) => p.fake).length === 1), '一年は 7 人、ニセ一年はいつも 1 人');
  check(new Set(runs.map((r) => r.people.findIndex((p) => p.fake))).size >= 4, 'ニセ一年が何番目かは、毎回ちがう');
  check(new Set(runs.map((r) => r.people.find((p) => p.fake).text)).size >= 8, 'ニセ一年のセリフも、毎回ちがう');
  check(runs.every((r) => !r.people[0].fake), '1 人目はいつも本物（くらべる手がかり）');
  const pools = runs[0].pools;
  const tellText = (p) => pools.FAKE_TALK.includes(p.talk) || pools.FAKE_OFFER.includes(p.offer);
  check(runs.every((r) => r.people.every((p) => (p.fake ? tellText(p) && ['beard', 'gray', 'wrinkle'].includes(p.deco) : !tellText(p) && ['beard', 'gray', 'wrinkle'].indexOf(p.deco) < 0))),
    'ぼろ（古いセリフ・ひげ／白髪／しわ）があるのはニセ一年だけ');
  check(runs.some((r) => r.people.some((p) => !p.fake && pools.HERRING.includes(p.talk))) && runs.some((r) => r.people.some((p) => !p.fake && p.deco)), '本物にも、ひっかけ（怪しく聞こえるセリフ・めがねなど）がいる');
  check(runs.every((r) => r.people.every((p) => /^一年[A-G]$/.test(p.label))), '名前は出さない（一年A〜G）');
  // セリフがウインドウ（3 行・1 行 14 文字）に入る
  const fit = await page.evaluate((pools) => {
    const bad = [];
    const lines = (t) => OTK.g.wrap(t, 232, 16).length;
    for (const t of pools.TALK.concat(pools.HERRING, pools.FAKE_TALK)) for (const f of pools.OFFER.concat(pools.FAKE_OFFER)) if (lines(t + '\n' + f) > 3) bad.push(t + ' / ' + f);
    for (const t of pools.ACCEPT.concat(pools.REFUSE, [pools.GEN_TIMEOUT, pools.FAKE_ACCEPT, pools.FAKE_TIMEOUT], pools.REVEAL)) if (lines(t) > 3) bad.push(t);
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
  const w = await playNise(page, push, smart);
  check(w.res === 'win' && w.hearts === 3 && w.reveal, 'ニセ一年だけ断るとクリア（' + (w.fakeAt + 1) + '人目がニセ一年）');
  check(w.friends === w.fakeAt, 'ほかの一年の申し出は受けた（友だち ' + w.friends + '人）');
  await finish(page, 'win', 'nise-win');

  // 負け①：ニセ一年の申し出を受ける
  await page.evaluate(() => { OTK.debug.seed(8); OTK.debug.start('nise', { quick: true }); });
  await waitScene(page, 'play');
  const a = await playNise(page, push, () => 'a');
  check(a.res === 'lose' && a.reveal && a.choice === 'accept', 'ニセ一年の申し出を受けると負け');
  await finish(page, 'lose', 'nise-lose-fake');

  // 負け②：本物を 3 人断る（ニセ一年が 4 人目より後にいる種で）
  const sd = await page.evaluate(() => {
    for (let n = 1; n < 300; n++) {
      OTK.debug.seed(n);
      OTK.debug.start('nise', { quick: true });
      if (OTK.debug.game.state.fakeAt >= 3) return n;
    }
    return null;
  });
  await waitScene(page, 'play');
  const r = await playNise(page, push, () => 'b');
  check(r.res === 'lose' && r.hearts === 0 && !r.reveal && r.idx === 2, '本物を 3 人断ると負け（種 ' + sd + '）');
  await finish(page, 'lose', 'nise-lose-alone');

  // 負け③：返事をしないと、受けたことになる（ニセ一年でつかまる）
  await page.evaluate(() => { OTK.debug.seed(8); OTK.debug.speed = 4; OTK.debug.start('nise', { quick: true }); });
  await waitScene(page, 'play');
  const t = await playNise(page, push, () => null);
  check(t.res === 'lose' && t.choice === 'timeout' && t.hearts === 3, '時間切れは「受ける」あつかい');
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
  check(w.res === 'win' && w.hearts === 3, '画面のボタンをタップしてクリアできる');
  await finish(page, 'win', 'nise-phone-win');
  // 画面下の A ボタンでも遊べる（全部受けると負け）
  await page.evaluate(() => { OTK.debug.seed(21); OTK.debug.start('nise', { quick: true }); });
  await waitScene(page, 'play');
  const a = await playNise(page, pusher(true), () => 'a');
  check(a.res === 'lose' && a.choice === 'accept', '画面下の A ボタンで受けられる（全部受けると負け）');
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
