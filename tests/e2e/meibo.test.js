/*
 * 名簿（meibo/）の確認
 *   node tests/e2e/meibo.test.js
 * サンプルでの表示・名前でさがす・年度へとぶを、パソコンとスマホで通す（年度へとぶはキーボードの ↓ でも）。
 * 本番の形（GAS_URL あり）は、設定とスプレッドシートの返事をにせものに差しかえて確かめる。
 * 環境変数 MEIBO_SHOTS にフォルダを指定すると、途中の画面を保存する。
 */
const assert = require('assert');
const path = require('path');
const { withSite, realErrors } = require('./lib');

const PORT = Number(process.env.MEIBO_PORT || process.env.PORT) || 8804; // ARCH.md の割り当て（確認役が別のポートで動かすときは MEIBO_PORT）
const SHOTS = process.env.MEIBO_SHOTS || '';
const GAS = 'https://script.google.com/macros/s/TEST/exec';
const XSS = '<img src=x onerror="window.__xss=1">';

async function shot(page, name, full) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, 'meibo-' + name + '.png'), fullPage: !!full });
}

// 設定（js/site/config.js）とスプレッドシートの返事を差しかえてから開く
async function openPage(browser, base, rel, o = {}) {
  const ctx = await browser.newContext(o.phone
    ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
    : { viewport: { width: 1280, height: 800 } });
  if (o.config) {
    await ctx.route('**/js/site/config.js', (r) => r.fulfill({
      status: 200, contentType: 'application/javascript; charset=utf-8',
      body: 'window.OB_CONFIG = ' + JSON.stringify(Object.assign({
        GAS_URL: '', GOOGLE_CLIENT_ID: '', ALBUM_URL: '', CONTACT_EMAIL: '',
      }, o.config)) + ';',
    }));
  }
  if (o.gas) await ctx.route('https://script.google.com/**', o.gas);
  const page = await ctx.newPage();
  const errors = [];
  const dialogs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e));
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  await page.goto(base + rel);
  await page.waitForSelector('#mb-loading', { state: 'hidden', timeout: 5000 });
  return { page, ctx, errors, dialogs };
}

const visibleNames = (page) => page.$$eval('#mb-list .mb-person:not([hidden]) .mb-name', (els) => els.map((e) => e.textContent));
const visibleYears = (page) => page.$$eval('#mb-list .mb-year:not([hidden])', (els) => els.map((e) => e.id));
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function sampleChecks(page, tag) {
  const sample = await page.evaluate(() => window.OB.SAMPLE.members);
  const years = [...new Set(sample.map((m) => m.entryYear))].sort();

  // 表示：サンプルの注記、年度ごとのまとまり、人数
  assert.ok(await page.isVisible('#mb-sample'), tag + ': サンプルの注記が出ていない');
  assert.deepStrictEqual(await visibleYears(page), years.map((y) => 'y' + y), tag + ': 年度の並びがちがう');
  assert.strictEqual((await visibleNames(page)).length, sample.length, tag + ': 人数がちがう');
  assert.ok((await page.textContent('#mb-count')).includes('全 ' + sample.length + '人'), tag + ': 合計の人数が出ていない');
  const first = await page.textContent('#y' + years[0] + ' .mb-year-head');
  assert.ok(first.includes(years[0] + '年度入学') && first.includes('平成'), tag + ': 年度の見出しがおかしい: ' + first);
  assert.ok((await page.textContent('#y' + years[0] + ' .mb-year-count')).includes(sample.filter((m) => m.entryYear === years[0]).length + '人'));
  const grads = await page.$$eval('.mb-grad', (els) => els.length);
  assert.strictEqual(grads, sample.filter((m) => m.gradYear).length, tag + ': 卒業の年が出ていない');
  assert.ok(await page.isVisible('.mb-note'), tag + ': 名簿についての説明がない');
  assert.ok((await page.textContent('.mb-note')).includes('名簿に載せたくない方・まちがいを見つけた方は、OB会までご連絡ください'));
  assert.ok(!(await page.isVisible('#mb-contact')), tag + ': 連絡先が空なのに出ている');
  assert.strictEqual(await page.getAttribute('#mb-form-link', 'href'), '../#post', tag + ': 追加・訂正はトップページのフォームへ');
  assert.ok(await page.isVisible('footer.ob-footer'), tag + ': 注記（フッター）がない');
  assert.ok((await page.textContent('footer')).includes('フィクション'));
  assert.ok(await page.isVisible('a.ob-back[href="../"]'), tag + ': ホームへのリンクがない');
  // 読み上げでの名前に ✕ ボタンの文字がまざらない
  assert.strictEqual(await page.getByRole('searchbox', { name: '名前でさがす', exact: true }).count(), 1, tag + ': さがす欄の名前がおかしい');
  assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
  await shot(page, tag + '-top');

  // 名前でさがす（その場で絞りこむ）
  await page.fill('#mb-q', '二郎');
  let names = await visibleNames(page);
  const expect = sample.filter((m) => m.name.includes('二郎')).length;
  assert.strictEqual(names.length, expect, tag + ': 「二郎」でさがした数がちがう');
  assert.ok(names.every((n) => n.includes('二郎')));
  assert.ok((await page.textContent('#mb-count')).includes(expect + '人'), tag + ': 見つかった数が出ていない');
  // 年度へとぶ：見えている年度だけが選べる
  const opts = await page.$$eval('#mb-year option', (os) => os.map((o) => o.value).filter(Boolean));
  assert.deepStrictEqual(opts, await visibleYears(page), tag + ': 年度の選択肢が絞りこみと合っていない');
  await shot(page, tag + '-search');

  // 空白・全角のちがいを気にしない
  const one = sample[0].name;
  await page.fill('#mb-q', '　' + one.replace(' ', '') + ' ');
  names = await visibleNames(page);
  assert.ok(names.includes(one), tag + ': 空白ちがいで見つからない');

  // 見つからないとき → やめるボタンで元にもどる
  await page.fill('#mb-q', 'zzzz');
  assert.ok(await page.isVisible('#mb-empty'), tag + ': 見つからないときの表示がない');
  assert.strictEqual((await visibleNames(page)).length, 0);
  await page.click('#mb-empty-clear');
  assert.strictEqual(await page.inputValue('#mb-q'), '');
  assert.strictEqual((await visibleNames(page)).length, sample.length, tag + ': 元にもどらない');

  // ✕ ボタンで消せる
  await page.fill('#mb-q', '夕照');
  assert.ok(await page.isVisible('#mb-clear'));
  await page.click('#mb-clear');
  assert.strictEqual((await visibleNames(page)).length, sample.length);

  // 年度へとぶ
  const target = 'y' + years[4];
  await page.selectOption('#mb-year', target);
  await page.waitForTimeout(1200);
  const pos = await page.evaluate((id) => {
    const s = document.getElementById(id).getBoundingClientRect();
    const b = document.getElementById('mb-bar').getBoundingClientRect();
    return { top: s.top, barBottom: b.bottom, scrollY: window.scrollY };
  }, target);
  assert.ok(pos.scrollY > 100, tag + ': スクロールしていない');
  assert.ok(pos.top > pos.barBottom && pos.top < pos.barBottom + 90, tag + ': とび先が上の帯にかくれている/ずれている ' + JSON.stringify(pos));
  assert.strictEqual(await page.evaluate(() => location.hash), '#' + target);
  assert.strictEqual(await page.inputValue('#mb-year'), '', tag + ': 年度の選択がもどっていない');
  assert.ok(await page.isVisible('#mb-top'), tag + ': 上へボタンが出ていない');
  await shot(page, tag + '-jump');

  await page.click('#mb-top');
  await page.waitForTimeout(900);
  assert.ok(await page.evaluate(() => window.scrollY) < 10, tag + ': 上へもどらない');

  // 下のほうで名前を打ちこむと、結果が上の帯のすぐ下に来る（上にかくれない）
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  await page.fill('#mb-q', '三郎');
  const res = await page.evaluate(() => {
    const s = document.querySelector('#mb-list .mb-year:not([hidden]) .mb-year-head').getBoundingClientRect();
    return { head: s.top, barBottom: document.getElementById('mb-bar').getBoundingClientRect().bottom };
  });
  assert.ok(res.head >= res.barBottom && res.head < res.barBottom + 60, tag + ': 下で打ちこむと結果が見えない ' + JSON.stringify(res));
  await page.fill('#mb-q', '');
}

withSite(PORT, async ({ browser, base }) => {
  // ── 1. サンプル（パソコン・スマホ） ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    const { page, ctx, errors } = await openPage(browser, base, 'meibo/', { phone });
    await sampleChecks(page, tag);
    assert.deepStrictEqual(realErrors(errors), [], tag + ': エラーが出た');
    await ctx.close();
    console.log('ok: サンプル（' + tag + '）');
  }

  // ── 1b. 年度へとぶ：キーボードの ↓ で、次の年度へ順に進める ──
  {
    const { page, ctx, errors } = await openPage(browser, base, 'meibo/', {});
    await page.focus('#mb-year');
    const seen = [];
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      seen.push(await page.evaluate(() => location.hash));
    }
    assert.deepStrictEqual(seen, ['#y2000', '#y2001', '#y2002'], '↓ で順に進めない: ' + seen);
    await page.keyboard.press('Tab');
    assert.strictEqual(await page.inputValue('#mb-year'), '', 'フォーカスが外れても年度の選択がもどらない');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: 年度へとぶ（キーボード）');
  }

  // ── 2. #y2005 で開くと、その年度にとぶ ──
  {
    const { page, ctx, errors } = await openPage(browser, base, 'meibo/#y2005', {});
    await page.waitForTimeout(300);
    const top = await page.evaluate(() => document.getElementById('y2005').getBoundingClientRect().top);
    assert.ok(top > 0 && top < 300, '#y2005 で開いても、その年度が見えない: ' + top);
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: URL の #年度 でとぶ');
  }
  // こわれた # で開いても、ふつうに出る
  {
    const { page, ctx, errors } = await openPage(browser, base, 'meibo/#%E0%A4%A', {});
    assert.ok(!(await page.isVisible('#mb-error')), 'こわれた # で読み込み失敗になる');
    assert.ok((await visibleNames(page)).length > 0, 'こわれた # で名簿が出ない');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: こわれた # でも出る');
  }

  // ── 3. 本番の形：スプレッドシートの文字は、そのまま文字として出す ──
  for (const phone of [false, true]) {
    const tag = phone ? 'phone' : 'pc';
    let asked = '';
    const { page, ctx, errors, dialogs } = await openPage(browser, base, 'meibo/', {
      phone,
      config: { GAS_URL: GAS, CONTACT_EMAIL: 'ob@example.com' },
      gas: (r) => {
        asked = r.request().url();
        r.fulfill({
          status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({
            ok: true, updated: '2026-11-01T12:00:00+09:00',
            members: [
              { name: XSS, entryYear: 2003, gradYear: 2007 },
              { name: '寮生 <b>太字</b>', entryYear: '2003', gradYear: null },
              { name: '年度 不明', entryYear: null, gradYear: null },
              { name: 'カタカナ タロウ', entryYear: 1999, gradYear: 2003 },
              { name: '昔の 寮生', entryYear: null, gradYear: null, before: true },
              { name: '', entryYear: 2000 },
              null,
            ],
            rooms: [],
          }),
        });
      },
    });
    await page.waitForTimeout(300);
    assert.ok(asked.startsWith(GAS + '?type=public'), tag + ': 公開データを読みに行っていない: ' + asked);
    assert.ok(!(await page.isVisible('#mb-sample')), tag + ': 本番なのにサンプルの注記が出ている');
    assert.strictEqual(await page.$$eval('#mb-list img, #mb-list b', (els) => els.length), 0, tag + ': データの HTML が効いてしまった');
    const names = await visibleNames(page);
    assert.ok(names.includes(XSS), tag + ': HTML が文字として出ていない');
    assert.ok(names.includes('寮生 <b>太字</b>'));
    assert.strictEqual(names.length, 5, tag + ': 空の名前を飛ばしていない');
    assert.deepStrictEqual(await visibleYears(page), ['y-before', 'y1999', 'y2003', 'y-unknown'], tag + ': 年度の並び（「それ以前」は最初、不明は最後）がちがう');
    assert.ok((await page.textContent('#y-before .mb-year-head')).includes('それ以前'));
    assert.ok((await page.textContent('#mb-count')).includes('1999〜2003年度入学'), tag + ': 人数の行に「それ以前」が年度として入った');
    assert.ok((await page.textContent('#y-unknown .mb-year-head')).includes('入学年度不明'));
    assert.strictEqual(await page.$$eval('#y2003 .mb-grad', (els) => els.length), 1, tag + ': 卒業年度が無い人に出ている');
    assert.strictEqual(await page.textContent('#y2003 .mb-grad'), '2007年度卒', tag + ': 卒業年度の書き方がちがう');
    assert.strictEqual(await page.evaluate(() => window.__xss), undefined, tag + ': スクリプトが動いた');
    assert.deepStrictEqual(dialogs, []);
    // カタカナでもひらがなでもさがせる
    await page.fill('#mb-q', 'たろう');
    assert.deepStrictEqual(await visibleNames(page), ['カタカナ タロウ'], tag + ': ひらがなでカタカナが見つからない');
    await page.fill('#mb-q', '');
    // 連絡先・登録フォーム
    assert.ok(await page.isVisible('#mb-contact'));
    assert.ok((await page.getAttribute('#mb-mail', 'href')).startsWith('mailto:ob@example.com'));
    assert.strictEqual(await page.textContent('#mb-mail'), 'ob@example.com');
    assert.strictEqual(await page.getAttribute('#mb-form-link', 'href'), '../#post');
    assert.ok((await page.textContent('#mb-form-link')).includes('名簿の追加・訂正はこちら'));
    assert.ok((await page.textContent('#mb-updated')).includes('2026年11月1日'), tag + ': 更新日がちがう');
    assert.ok(await noOverflow(page), tag + ': 横にはみ出している');
    await shot(page, tag + '-live', true);
    assert.deepStrictEqual(realErrors(errors), [], tag + ': エラーが出た');
    await ctx.close();
    console.log('ok: 本番の形・HTML は文字のまま（' + tag + '）');
  }

  // ── 4. 設定のまちがい：javascript: の URL や、おかしなメールアドレスは出さない ──
  {
    const { page, ctx, errors } = await openPage(browser, base, 'meibo/', {
      config: { CONTACT_EMAIL: 'a"><img src=x>@x.jp' },
    });
    assert.ok(!(await page.isVisible('#mb-contact')), 'おかしなメールアドレスが出ている');
    assert.deepStrictEqual(realErrors(errors), []);
    await ctx.close();
    console.log('ok: 設定のまちがいを出さない');
  }

  // ── 5. 読み込みの失敗 → もう一度読み込む ──
  {
    let fail = true;
    const { page, ctx, errors } = await openPage(browser, base, 'meibo/', {
      config: { GAS_URL: GAS },
      gas: (r) => fail
        ? r.fulfill({ status: 500, body: 'error', headers: { 'Access-Control-Allow-Origin': '*' } })
        : r.fulfill({
          status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          // 更新日が UTC で来ても、日本の日付で出す（2026-10-31 20:00 UTC は 11月1日）
          body: JSON.stringify({ ok: true, updated: '2026-10-31T20:00:00Z', members: [{ name: '再読 一郎', entryYear: 2001, gradYear: null }], rooms: [] }),
        }),
    });
    assert.ok(await page.isVisible('#mb-error'), '失敗したときの表示がない');
    assert.strictEqual((await visibleNames(page)).length, 0);
    await shot(page, 'error');
    fail = false;
    await page.click('#mb-retry');
    await page.waitForSelector('#mb-list .mb-person', { timeout: 5000 });
    assert.ok(!(await page.isVisible('#mb-error')), '読み込めたのに失敗の表示が残っている');
    assert.deepStrictEqual(await visibleNames(page), ['再読 一郎'], 'もう一度読み込んでも出ない');
    assert.strictEqual(await page.textContent('#mb-updated'), '2026年11月1日 更新', 'UTC の更新日が日本の日付になっていない');
    // 500 の読み込み失敗は、ブラウザが console に出すので除く
    assert.deepStrictEqual(realErrors(errors).filter((e) => !/status of 500/.test(e)), []);
    await ctx.close();
    console.log('ok: 読み込みの失敗と、もう一度読み込む');
  }
}).then(() => {
  console.log('meibo: すべて ok');
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
