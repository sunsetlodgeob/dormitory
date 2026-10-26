/*
 * ゲーム「男魂くんの1年」の確認（エンジン・タイトル・1年の流れ・練習・エンディング）
 *   node tests/e2e/game.test.js
 *   SHOTS_DIR=/tmp/shots node tests/e2e/game.test.js   … スクリーンショットも撮る（リポジトリの外に）
 * ミニゲームの中身には頼らない（勝ち負けは OTK.debug.forceResult で決める）。
 * 寸劇（ミニゲームの間のお話）は、はじまりの寸劇が出ることだけ見て、あとは OTK.debug.noSkits でとばす
 * （寸劇そのものの確認は tests/e2e/story.test.js）。
 */
const fs = require('fs');
const path = require('path');
const { withSite, realErrors, ROOT } = require('./lib');

const PORT = Number(process.env.PORT) || 8801; // ARCH.md の割り当て（確認役は PORT=8821 などで動かす）
const SHOTS = process.env.SHOTS_DIR || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

function check(cond, msg) {
  if (!cond) throw new Error('NG: ' + msg);
  console.log('  ok  ' + msg);
}
const scene = (page) => page.evaluate(() => (window.OTK && OTK.debug ? OTK.debug.scene : null));
async function waitScene(page, name, timeout = 10000) {
  await page.waitForFunction((n) => window.OTK && OTK.debug && OTK.debug.scene === n, name, { timeout, polling: 50 });
}
// 場面が変わるまでキーを押す（場面の切りかえ直後は入力を受けつけないことがあるため）
async function pressUntil(page, key, target, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if ((await scene(page)) === target) return;
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }
  throw new Error('場面「' + target + '」になりませんでした（いま：' + (await scene(page)) + '）');
}
async function tapUntil(page, selector, target, tries = 60) {
  for (let i = 0; i < tries; i++) {
    if ((await scene(page)) === target) return;
    await page.locator(selector).tap();
    await page.waitForTimeout(140);
  }
  throw new Error('場面「' + target + '」になりませんでした（いま：' + (await scene(page)) + '）');
}
async function shot(page, name) {
  if (SHOTS) await page.locator('#otk-canvas').screenshot({ path: path.join(SHOTS, name + '.png') });
}
// 画面が真っ黒・一色だけになっていないか
async function canvasColors(page) {
  return page.evaluate(() => {
    const c = document.getElementById('otk-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return seen.size;
  });
}

async function desktop(open) {
  console.log('パソコン');
  const { page, errors } = await open('game/', { wait: 300 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitScene(page, 'title');
  check((await page.title()).includes('男魂くんの1年'), 'ページの題名');
  const foot = await page.locator('footer').innerText();
  check(foot.includes('フィクション'), 'フッターに注記がある');
  check((await page.locator('a.ob-back').getAttribute('href')) === '../', 'ホームへのリンク');
  const fit = await page.evaluate(() => ({ s: OTK.scale, dpr: devicePixelRatio, w: document.getElementById('otk-canvas').getBoundingClientRect().width }));
  check(Math.abs(fit.s * fit.dpr - Math.round(fit.s * fit.dpr)) < 1e-6 && fit.w >= 512, '画面は整数倍で拡大（' + fit.w + 'px）');
  check(!(await page.locator('#otk-dpad').isVisible()), 'パソコンでは画面のボタンを隠す');
  check(await page.locator('#otk-keys').isVisible(), 'キーの説明が出ている');
  check((await canvasColors(page)) > 10, 'タイトルが描かれている');
  const games = await page.evaluate(() => OTK.list().map((d) => ({ id: d.id, order: d.order, month: d.month })));
  check(games.length === 10, 'ミニゲームが 10 本登録されている');
  check(games.map((d) => d.id).join(',') === 'nomu,nise,gyudon,deisui,conveni,zombie,gakusai,setsubun,kippu,unko', '順番が ARCH.md のとおり');
  check(games.map((d) => d.month).join(',') === '4,4,6,7,9,10,11,2,3,3', '月が ARCH.md のとおり');
  await shot(page, 'd-title');

  // 音（最初の操作のあと）
  await page.keyboard.press('Enter');
  await waitScene(page, 'menu');
  const audioOk = await page.evaluate(() => {
    const a = OTK.audio;
    a.SFX_NAMES.forEach((n) => a.sfx(n));
    a.BGM_NAMES.forEach((n) => a.bgm(n));
    a.bgm('title');
    return a.ready;
  });
  check(audioOk, '音を鳴らせる（効果音・BGM を全部鳴らしてもエラーなし）');
  const soundBefore = await page.evaluate(() => OTK.audio.on);
  await page.locator('#otk-sound').click();
  check((await page.evaluate(() => OTK.audio.on)) === !soundBefore && (await page.evaluate(() => localStorage.getItem('otk-sound'))) === (soundBefore ? 'off' : 'on'), '音のオン・オフが localStorage に残る');
  await page.locator('#otk-sound').click();
  await shot(page, 'd-menu');

  // 男魂野球大会は準備中
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowDown'); await page.waitForTimeout(60); }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  await shot(page, 'd-yakyu');
  check((await scene(page)) === 'menu', '野球大会は「準備中」の表示だけ');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowUp'); await page.waitForTimeout(60); }

  // 1年をはじめる → はじまりの寸劇（START でとばす）→ 10 本（ここからは寸劇なし）
  await page.evaluate(() => { OTK.debug.speed = 4; });
  await page.keyboard.press('Enter');
  await waitScene(page, 'skit');
  check((await page.evaluate(() => OTK.debug.skit.id)) === 'opening', '「1年をはじめる」で、はじまりの寸劇');
  await page.waitForTimeout(500);
  await shot(page, 'd-story');
  await page.evaluate(() => { OTK.debug.noSkits = true; });
  await page.keyboard.press('Escape');
  await waitScene(page, 'calendar');
  await page.waitForTimeout(150);
  await shot(page, 'd-calendar');
  for (let i = 0; i < games.length; i++) {
    await waitScene(page, 'intro');
    if (i === 0) await shot(page, 'd-intro');
    await pressUntil(page, 'Enter', 'countdown');
    await waitScene(page, 'play');
    check((await page.evaluate(() => OTK.debug.current)) === games[i].id, (i + 1) + '本目は ' + games[i].id);
    if (i === 0) {
      await shot(page, 'd-play');
      await page.keyboard.press('Escape');
      await waitScene(page, 'pause');
      await shot(page, 'd-pause');
      await page.keyboard.press('Escape');
      await waitScene(page, 'play');
    }
    await page.evaluate(() => OTK.debug.forceResult('win'));
    if (i === 0) {
      await page.waitForFunction(() => OTK.debug.run && OTK.debug.run.phase === 'stamp');
      await page.waitForTimeout(120);
      await shot(page, 'd-stamp');
    }
    await waitScene(page, 'result');
    if (i === 0) { await page.waitForTimeout(200); await shot(page, 'd-result'); }
    check((await page.evaluate(() => OTK.debug.save.step)) === i + 1, '進み具合を保存（step=' + (i + 1) + '）');
    await pressUntil(page, 'Enter', i + 1 < games.length ? 'calendar' : 'ending_good');
  }
  // よいエンディング
  await page.waitForTimeout(800);
  await pressUntil(page, 'Enter', 'ending_good', 2);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await shot(page, 'd-good');
  const sv = await page.evaluate(() => OTK.debug.save);
  check(sv.good === 1 && sv.step === 0, 'よいエンディングを記録（good=1、step は 0 に戻る）');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  await shot(page, 'd-credits');
  await page.evaluate(() => { OTK.debug.speed = 10; });
  await page.keyboard.down('z');
  await page.waitForTimeout(3500);
  await page.keyboard.up('z');
  await pressUntil(page, 'Enter', 'title', 80);
  check(true, 'スタッフロールのあとタイトルへ');
  await page.evaluate(() => { OTK.debug.speed = 4; });

  // わるいエンディング → この月からやりなおす
  await page.evaluate(() => OTK.debug.story(4));
  await waitScene(page, 'intro');
  await pressUntil(page, 'Enter', 'countdown');
  await waitScene(page, 'play');
  await page.evaluate(() => OTK.debug.forceResult('lose', 'テストでしっぱい。'));
  await waitScene(page, 'result');
  await page.waitForTimeout(200);
  await shot(page, 'd-result-lose');
  await pressUntil(page, 'Enter', 'ending_bad');
  await page.waitForTimeout(2600);
  await shot(page, 'd-bad');
  check((await page.evaluate(() => OTK.debug.save.bad)) === 1, 'わるいエンディングを記録');
  await pressUntil(page, 'Enter', 'calendar', 40);
  check((await page.evaluate(() => OTK.debug.save.step)) === 4, '「この月からやりなおす」で同じ月から');
  await waitScene(page, 'intro');
  await pressUntil(page, 'Enter', 'countdown');
  await waitScene(page, 'play');
  check((await page.evaluate(() => [OTK.debug.current, OTK.debug.api.tries])).join() === games[4].id + ',1', 'やりなおしの回数が api.tries に入る');
  // ポーズからやめる → メニュー → つづきから
  await page.keyboard.press('Escape');
  await waitScene(page, 'pause');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(80);
  await page.keyboard.press('Enter');
  await waitScene(page, 'menu');
  await page.waitForTimeout(250);
  await shot(page, 'd-menu-cont');
  await pressUntil(page, 'Enter', 'calendar');
  check(true, 'つづきから（9月）');

  // 練習モード
  await page.evaluate(() => OTK.debug.goto('menu'));
  await waitScene(page, 'menu');
  await page.waitForTimeout(150);
  await page.keyboard.press('ArrowDown'); // つづきから → れんしゅう
  await pressUntil(page, 'Enter', 'practice');
  await page.waitForTimeout(200);
  await shot(page, 'd-practice');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  await pressUntil(page, 'Enter', 'intro');
  await pressUntil(page, 'Enter', 'countdown');
  await waitScene(page, 'play');
  check((await page.evaluate(() => OTK.debug.current)) === games[1].id, '練習モードで 2 本目を選べる');
  await page.evaluate(() => OTK.debug.forceResult('win'));
  await waitScene(page, 'result');
  await pressUntil(page, 'x', 'practice');
  check(true, '練習の結果から B で一覧へ');

  // それぞれのミニゲームを少し動かす（中身には頼らない）
  for (const d of games) {
    await page.evaluate((id) => OTK.debug.start(id, { quick: true }), d.id);
    await waitScene(page, 'play');
    for (const k of ['ArrowLeft', 'ArrowRight', 'z', 'ArrowUp', 'x', 'ArrowDown', 'z']) {
      await page.keyboard.press(k);
      await page.waitForTimeout(40);
    }
    await page.locator('#otk-canvas').click({ position: { x: 300, y: 300 } });
    await page.waitForTimeout(200);
    check((await canvasColors(page)) > 3, d.id + ' が描かれている');
    await page.evaluate(() => OTK.debug.forceResult('lose'));
    await waitScene(page, 'result');
  }

  // docs/site/ENGINE.md の例がそのまま動くこと
  const md = fs.readFileSync(path.join(ROOT, 'docs/site/ENGINE.md'), 'utf8');
  const ex = /```js\n([\s\S]*?OTK\.register[\s\S]*?)```/.exec(md);
  check(!!ex, 'ENGINE.md に例がある');
  await page.evaluate((code) => { (0, eval)(code.replace("id: 'gyudon'", "id: 'engine_example'")); }, ex[1]);
  await page.evaluate(() => OTK.debug.start('engine_example', { quick: true }));
  await waitScene(page, 'play');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(2500);
  await page.keyboard.up('ArrowRight');
  await shot(page, 'd-example');
  await page.evaluate(() => OTK.debug.forceResult('win'));
  await waitScene(page, 'result');
  check(true, 'ENGINE.md の例が動く');

  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));
}

async function debugUrl(open) {
  console.log('テスト用の URL');
  const { page, errors } = await open('game/?play=nomu&seed=7', { wait: 300 });
  await waitScene(page, 'intro');
  check((await page.evaluate(() => OTK.seed)) === 7, '?seed= で乱数を固定');
  await pressUntil(page, 'Enter', 'countdown');
  await waitScene(page, 'play');
  check((await page.evaluate(() => OTK.debug.current)) === 'nomu', '?play=nomu で nomu が始まる');
  await page.evaluate(() => OTK.debug.forceResult('lose'));
  await waitScene(page, 'result');
  await pressUntil(page, 'Enter', 'intro');
  check(true, '結果のあと A でもう一度');
  const q = await open('game/?play=kippu&quick=1', { wait: 300 });
  await waitScene(q.page, 'play');
  check((await q.page.evaluate(() => OTK.debug.current)) === 'kippu', '?quick=1 で説明をとばす');
  await q.page.evaluate(() => OTK.debug.forceResult('win'));
  await waitScene(q.page, 'result');
  await pressUntil(q.page, 'Enter', 'play');
  check(true, 'quick のときは A ですぐもう一度');
  const errs = realErrors(errors.concat(q.errors));
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));
}

async function phone(open) {
  console.log('スマホ（縦）');
  const { page, errors } = await open('game/', { phone: true, wait: 300 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitScene(page, 'title');
  const box = await page.locator('#otk-canvas').boundingBox();
  const vw = await page.evaluate(() => innerWidth);
  check(box.width <= vw && box.width >= 300, '画面が横幅におさまる（' + box.width + 'px / ' + vw + 'px）');
  check(await page.locator('#otk-dpad').isVisible() && await page.locator('[data-otk-key="a"]').isVisible(), '十字キーと A・B が出ている');
  const padBox = await page.locator('[data-otk-key="a"]').boundingBox();
  check(padBox.width >= 56, 'A ボタンが指で押せる大きさ（' + padBox.width + 'px）');
  check(!(await page.locator('#otk-keys').isVisible()), 'キーの説明は隠す');
  const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check(noScroll, '横にはみ出さない');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'p-page.png'), fullPage: true });
  await page.evaluate(() => { OTK.debug.speed = 3; });
  await tapUntil(page, '[data-otk-key="pause"]', 'menu');
  check(true, 'START でメニューへ');
  await tapUntil(page, '[data-otk-key="a"]', 'skit');
  // 画面のタップで、はじまりの寸劇を最後まで進める
  for (let i = 0; i < 150 && (await scene(page)) === 'skit'; i++) {
    await page.locator('#otk-canvas').tap({ position: { x: 150, y: 150 } });
    await page.waitForTimeout(120);
  }
  await waitScene(page, 'calendar');
  check(true, '画面のタップで寸劇を進められる');
  // 次の前ふりの寸劇は、START ボタンでとばす
  await waitScene(page, 'skit');
  await page.locator('[data-otk-key="pause"]').tap();
  await waitScene(page, 'intro');
  check(true, 'START ボタンで寸劇をとばす');
  await tapUntil(page, '[data-otk-key="a"]', 'countdown');
  await waitScene(page, 'play');
  // 十字キー（指をのせて離す）
  const dp = await page.locator('#otk-dpad').boundingBox();
  await page.touchscreen.tap(dp.x + dp.width * 0.85, dp.y + dp.height / 2);
  await page.locator('[data-otk-key="b"]').tap();
  await page.locator('[data-otk-key="a"]').tap();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'p-play.png') });
  await page.locator('[data-otk-key="pause"]').tap();
  await waitScene(page, 'pause');
  await tapUntil(page, '[data-otk-key="pause"]', 'play');
  check(true, 'START でポーズと再開');
  await page.evaluate(() => OTK.debug.forceResult('win'));
  await waitScene(page, 'result');
  await page.waitForTimeout(150);
  for (let i = 0; i < 30 && (await scene(page)) === 'result'; i++) {
    await page.locator('#otk-canvas').tap({ position: { x: 100, y: 100 } });
    await page.waitForTimeout(140);
  }
  await waitScene(page, 'calendar');
  check(true, '結果から画面タップで次の月へ');
  await shot(page, 'p-calendar');
  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));

  console.log('スマホ（横）');
  const land = await open('game/', { phone: true, wait: 300 });
  await land.page.setViewportSize({ width: 844, height: 390 });
  await land.page.waitForTimeout(400);
  const lb = await land.page.locator('#otk-canvas').boundingBox();
  const dpl = await land.page.locator('#otk-dpad').boundingBox();
  check(lb.y + lb.height <= 390 && dpl.x + dpl.width <= lb.x, '横持ちでは画面が高さにおさまり、十字キーは左（' + Math.round(lb.width) + '×' + Math.round(lb.height) + '）');
  if (SHOTS) await land.page.screenshot({ path: path.join(SHOTS, 'p-landscape.png') });
  const errs2 = realErrors(land.errors);
  check(errs2.length === 0, 'エラーなし');

  console.log('小さいスマホ（360px）');
  const small = await open('game/', { phone: true, wait: 300 });
  await small.page.setViewportSize({ width: 360, height: 640 });
  await small.page.waitForTimeout(400);
  const sb = await small.page.locator('#otk-canvas').boundingBox();
  const sa = await small.page.locator('[data-otk-key="a"]').boundingBox();
  const sd = await small.page.locator('#otk-dpad').boundingBox();
  const sNoScroll = await small.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check(sb.width <= 360 && sNoScroll && sa.y + sa.height <= 640 && sd.y + sd.height <= 640, '幅 360px でも画面とボタンがおさまり、横にはみ出さない');
  check(realErrors(small.errors).length === 0, 'エラーなし');
}

// ウインドウ（白い二重線）の線が、文字で欠けていないか（文字がはみ出すと線が消える）
async function brokenBorder(page, b) {
  return page.evaluate((b) => {
    const c = document.getElementById('otk-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const white = (x, y) => { const i = (y * c.width + x) * 4; return d[i] === 0xfc && d[i + 1] === 0xfc && d[i + 2] === 0xfc; };
    const bad = [];
    for (let y = b.y + 4; y < b.y + b.h - 4; y++) for (const x of [b.x + 1, b.x + 3, b.x + b.w - 2, b.x + b.w - 4]) if (!white(x, y)) bad.push(x + ',' + y);
    for (let x = b.x + 4; x < b.x + b.w - 4; x++) for (const y of [b.y + 1, b.y + 3, b.y + b.h - 2, b.y + b.h - 4]) if (!white(x, y)) bad.push(x + ',' + y);
    return bad.slice(0, 3);
  }, b);
}
// 画面の座標（256×224）でクリックする
async function clickGame(page, gx, gy) {
  const box = await page.locator('#otk-canvas').boundingBox();
  await page.locator('#otk-canvas').click({ position: { x: (gx + 0.5) * (box.width / 256), y: (gy + 0.5) * (box.height / 224) } });
}

// 文字がウインドウからはみ出さないこと、確認の出し方、キー、エラーのとき、など
async function details(open, base) {
  console.log('文字のおさまり・細かい動き');
  const { page, errors } = await open('game/', { wait: 300 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitScene(page, 'title');

  // 折り返し：幅をこえず、行頭に「、」「。」などが来ない
  const wrapBad = await page.evaluate(() => {
    const samples = ['寮には、歴代の寮生が全員いる。学年も名前も、よくわからない。', '新入生の男魂くんは、大学の男子寮「夕照寮」に入寮した。', 'みつからなかった。同期Bは終点まで行ったらしい。', 'ごちそうさまでした（払ってない）。店員さん、ごめんなさい……。'];
    const bad = [];
    for (const s of samples) for (const w of [96, 150, 212, 228]) for (const size of [12, 16]) {
      OTK.g.wrap(s, w, size).forEach((l, i) => {
        if (OTK.g.measure(l, size) > w) bad.push(w + '/' + size + ' 幅こえ：' + l);
        if (i > 0 && OTK.NO_HEAD.includes([...l][0])) bad.push(w + '/' + size + ' 行頭：' + l);
      });
    }
    return bad;
  });
  check(wrapBad.length === 0, '折り返しは幅をこえず、行頭禁則を守る' + (wrapBad.length ? '：' + wrapBad.slice(0, 3).join(' ／ ') : ''));

  // キーボードの A キーは A ボタン（画面の「Aでスタート」のとおり）
  await page.keyboard.press('a');
  await waitScene(page, 'menu');
  check(true, 'A キーで決定できる');

  // 説明の画面：目的・操作・注記が長くても、ウインドウの線が欠けない
  await page.evaluate(() => {
    const base = { order: 90, month: 6, event: '', time: 30, timeout: 'lose', create() { return { update() {}, draw(g) { g.clear(OTK.P.dbrown); } }; } };
    OTK.register(Object.assign({}, base, { id: 'long_goal', title: '長い目的', goal: '電車のどこかに同期Bがいる！', howto: ['←→：歩く', 'A：しゃがむ', 'B：あやまる'] }));
    OTK.register(Object.assign({}, base, { id: 'long_all', title: 'ぜんぶ長い', goal: 'とにかく長い目的の文章で、どこで切れるかを確かめる', howto: ['←→↑↓：うごく。これも長めの説明で、折り返しを確かめる', 'A：なにかする', 'B：べつのこと'], note: 'お酒は二十歳になってから。一気飲みはやめましょう。' }));
  });
  const ids = (await page.evaluate(() => OTK.list().map((d) => d.id)));
  for (const id of ids) {
    await page.evaluate((i) => OTK.debug.start(i), id);
    await waitScene(page, 'intro');
    await page.waitForTimeout(80);
    const bad = await brokenBorder(page, { x: 6, y: 6, w: 244, h: 212 });
    check(bad.length === 0, '説明の画面の文字がはみ出さない（' + id + '）' + (bad.length ? bad.join(' ') : ''));
  }
  await page.evaluate(() => OTK.debug.start('long_goal', { quick: true }));
  await waitScene(page, 'play');
  await page.evaluate(() => OTK.debug.forceResult('lose', 'みつからなかった。同期Bは終点まで行ったらしい。追いコンは、まだ終わらない。'));
  await waitScene(page, 'result');
  await page.waitForTimeout(350); // 暗転が明けるまで
  const rb = await brokenBorder(page, { x: 16, y: 26, w: 224, h: 180 });
  check(rb.length === 0, '結果の画面の文字がはみ出さない' + (rb.length ? rb.join(' ') : ''));

  // はじまりの話（むかしの名前の goto('story')）は、はじまりの寸劇になる。セリフの確認は tests/e2e/story.test.js
  await page.evaluate(() => { OTK.debug.goto('story'); });
  await waitScene(page, 'skit');
  check((await page.evaluate(() => OTK.debug.skit.id)) === 'opening', 'OTK.debug.goto(\'story\') で、はじまりの寸劇');
  await page.keyboard.press('Escape');
  await waitScene(page, 'calendar');

  // わるいエンディングの選択肢がウインドウにおさまる
  await page.evaluate(() => { OTK.debug.speed = 4; OTK.debug.goto('ending_bad'); });
  await page.waitForFunction(() => OTK.debug.scene === 'ending_bad');
  await page.waitForTimeout(2600);
  const bb = await brokenBorder(page, { x: 20, y: 165, w: 216, h: 52 });
  check(bb.length === 0, 'わるいエンディングの選択肢がおさまる' + (bb.length ? bb.join(' ') : ''));
  await page.evaluate(() => { OTK.debug.speed = 1; });

  // 「はじめから」の確認：ウインドウの外をタップしたら、やめる（記録は消えない）。「はい」をタップしたら始まる
  await page.evaluate(() => localStorage.setItem('otk-save', JSON.stringify({ step: 3, clear: {}, good: 0, bad: 0 })));
  await page.reload();
  await waitScene(page, 'title');
  await pressUntil(page, 'Enter', 'menu');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(80);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await clickGame(page, 128, 20);
  await page.waitForTimeout(200);
  check((await scene(page)) === 'menu' && (await page.evaluate(() => OTK.debug.save.step)) === 3, '確認の外をタップすると、やめる（記録は残る）');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await clickGame(page, 90, 134); // 「A：はい」
  await waitScene(page, 'skit');
  check((await page.evaluate(() => OTK.debug.save.step)) === 0, '確認の「はい」をタップすると、はじめから');

  // 10 本目をクリアして、エンディングを見る前に閉じたとき：つづきからでエンディングへ
  await page.evaluate(() => localStorage.setItem('otk-save', JSON.stringify({ step: 10, clear: {}, good: 0, bad: 0 })));
  await page.reload();
  await waitScene(page, 'title');
  await pressUntil(page, 'Enter', 'menu');
  await page.waitForTimeout(300);
  await shot(page, 'd-menu-cont-ending');
  await pressUntil(page, 'Enter', 'skit', 3); // カーソルは、はじめから「つづきから」にある。屋上の寸劇から
  await page.keyboard.press('Escape');
  await waitScene(page, 'ending_good');
  const sv10 = await page.evaluate(() => OTK.debug.save);
  check(sv10.good === 1 && sv10.step === 0, '10 本目のあとに閉じても、つづきからでよいエンディングを見られる');

  // 「ホームへもどる」のあと、ブラウザの「戻る」でページが戻ってきたら、メニューに戻る
  await page.evaluate(() => OTK.debug.goto('menu'));
  await waitScene(page, 'menu');
  await page.route(base, (r) => r.fulfill({ status: 204 })); // 移動させずに、その場にとどめる
  await page.waitForTimeout(250);
  await page.keyboard.press('ArrowUp'); // 「1年をはじめる」から上で、いちばん下の「ホームへもどる」
  await page.waitForTimeout(60);
  await page.keyboard.press('Enter');
  await waitScene(page, 'leave');
  await page.waitForTimeout(500);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await waitScene(page, 'menu');
  check(true, '「戻る」で戻ってきたとき、真っ暗のままにならない');

  // OTK.debug.start の tries（しっぱいしたあとの易しさを試す）と、終わったあとの pointer
  await page.evaluate(() => OTK.debug.start('nomu', { quick: true, tries: 2 }));
  await waitScene(page, 'play');
  check((await page.evaluate(() => OTK.debug.api.tries)) === 2, 'OTK.debug.start(id, { tries: 2 }) で api.tries が 2');
  const cvb = await page.locator('#otk-canvas').boundingBox();
  await page.mouse.move(cvb.x + cvb.width / 2, cvb.y + cvb.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(100);
  const downPlaying = await page.evaluate(() => OTK.debug.api.input.pointer.down);
  await page.evaluate(() => OTK.debug.forceResult('win'));
  const downAfter = await page.evaluate(() => OTK.debug.api.input.pointer.down);
  await page.mouse.up();
  check(downPlaying === true && downAfter === false, '画面をおしたまま終わると、api.input.pointer.down は false になる');

  // BGM の各パートの長さがそろっている（ずれると、くりかえすたびに音がずれる）
  const mml = await page.evaluate(() => Object.entries(OTK.audio._songs).filter(([, d]) => {
    const lens = ['p1', 'p2', 'tri', 'dr'].filter((k) => d[k]).map((k) => OTK.audio._parse(d[k], k === 'dr').len);
    return lens.some((l) => Math.abs(l - lens[0]) > 1e-9);
  }).map(([n]) => n));
  check(mml.length === 0, 'BGM のパートの長さがそろっている' + (mml.length ? '：' + mml.join(',') : ''));

  const errs = realErrors(errors);
  check(errs.length === 0, 'エラーなし' + (errs.length ? '：\n' + errs.join('\n') : ''));

  // draw でエラーが出たミニゲームは「おまけでクリア」になって先へ進む
  const br = await open('game/', { wait: 300 });
  await br.page.evaluate(() => {
    OTK.register({ id: 'broken_draw', title: 'こわれた絵', goal: 'テスト', howto: [], time: 10, create() { return { update() {}, draw() { throw new Error('わざと'); } }; } });
    OTK.debug.start('broken_draw', { quick: true });
  });
  await waitScene(br.page, 'result');
  check((await br.page.evaluate(() => OTK.debug.run.result)) === 'win', 'draw のエラーは、おまけでクリア');
  const brErrs = realErrors(br.errors);
  check(brErrs.length > 0 && brErrs.every((e) => e.includes('broken_draw')), 'エラーはコンソールに出る（ほかのエラーはない）');
}

withSite(PORT, async ({ open, base }) => {
  await desktop(open);
  await debugUrl(open);
  await phone(open);
  await details(open, base);
  console.log('ぜんぶ ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
