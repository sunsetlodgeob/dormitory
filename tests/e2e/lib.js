/*
 * ブラウザでの確認用の小物（Playwright）
 *   const { withSite } = require('./lib');
 *   withSite(8801, async ({ open }) => { const { page, errors } = await open('game/'); ... });
 * ポートは docs/site/ARCH.md の割り当てを使う（同時に動かしてもぶつからないように）。
 */
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..', '..');
const EMPTY_CONFIG = "window.OB_CONFIG = { GAS_URL: '', GOOGLE_CLIENT_ID: '', ALBUM_URL: '', CONTACT_EMAIL: '' };";

function waitPort(port, ms = 8000) {
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    (function tryOnce() {
      const s = net.connect(port, '127.0.0.1', () => { s.end(); resolve(); });
      s.on('error', () => {
        if (Date.now() - t0 > ms) reject(new Error('server did not start on ' + port));
        else setTimeout(tryOnce, 100);
      });
    })();
  });
}

async function withSite(port, fn, opts = {}) {
  const srv = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  let browser;
  try {
    await waitPort(port);
    browser = await pw.chromium.launch();
    // js/site/config.js には本番の URL が入っているが、確認はデモ表示（設定が空）を前提にする。
    // どの画面（context）でも、まず空の設定を返す。確認の中で ctx.route した設定のほうが先に使われる
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
      const ctx = await newContext(...args);
      await ctx.route('**/js/site/config.js', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: EMPTY_CONFIG }));
      return ctx;
    };
    const base = 'http://127.0.0.1:' + port + '/';
    // phone: true でスマホの大きさ・タッチあり
    const open = async (rel, o = {}) => {
      const phone = o.phone != null ? o.phone : opts.phone;
      const ctx = await browser.newContext(phone
        ? { viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
        : { viewport: { width: 1280, height: 800 } });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + e));
      await page.goto(base + rel);
      await page.waitForTimeout(o.wait != null ? o.wait : 600);
      return { page, errors, ctx };
    };
    return await fn({ browser, base, open });
  } finally {
    if (browser) await browser.close();
    srv.kill();
  }
}

// 外部（Google Fonts など）に出られない環境でもエラーにしないための絞り込み
function realErrors(errors) {
  return errors.filter((e) => !/fonts\.googleapis|fonts\.gstatic|accounts\.google\.com|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|net::ERR/.test(e));
}

module.exports = { withSite, realErrors, ROOT };
