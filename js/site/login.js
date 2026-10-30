/*
 * 夕照寮OB会サイト ― Google でログインした寮生だけに見せるページの入り口（年表・D-1選手権）
 *
 *   const gate = OB.loginGate({
 *     what: '年表',                       // 文の中で使う名前（「年表の準備がまだ…」）
 *     el: { demo, setup, login, gbtn, status, reload, loading, board, user, userText, logout,
 *           req, reqEmail, reqStatus },        // req…：見る権限の申請の欄（なくてもよい。あれば not_member のときに出す）
 *     load: (cred) => OB.data.loadTimeline(cred), // cred が '' のときはデモ（サンプル）
 *     show: (data, email) => { ... },     // 中身を描く（board などの出し入れは、ここでする）
 *     clear: () => { ... },               // ログアウトのとき、中身を消す
 *   });
 *   gate.start();
 *
 *  - GAS_URL が空 → デモ（el.demo を出し、サンプルで show）
 *  - GAS_URL はあるが GOOGLE_CLIENT_ID が空 → 準備中（el.setup）
 *  - どちらもある → Google のログイン（el.login）。ID トークンで load して、通れば show
 *  - ID トークンは、読み込みと申請に使うだけで保存しない（メモリだけ）
 *  - 見る権限がない（not_member）とき、el.req があれば申請の欄を出す（OB.data.requestAccess）。幹事が承認すると見られる
 * 見た目は css/login.css（ob-gate・ob-status など）。
 */
(function () {
  'use strict';
  const OB = (window.OB = window.OB || {});
  const GSI_SRC = 'https://accounts.google.com/gsi/client';

  // ID トークンの中のメールアドレス（表示に使うだけ。確かめるのは Apps Script 側）
  function emailOf(jwt) {
    try {
      let p = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      p += '='.repeat((4 - (p.length % 4)) % 4);
      const bin = atob(p);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const o = JSON.parse(new TextDecoder().decode(bytes));
      return typeof o.email === 'string' ? o.email.slice(0, 200) : '';
    } catch (e) {
      return '';
    }
  }

  OB.loginGate = function (o) {
    const cfg = window.OB_CONFIG || {};
    const el = o.el;
    const what = o.what || 'このページ';
    const MSG = {
      not_member: 'このアカウントには見る権限がありません。幹事に連絡して、見る権限をもらってください。',
      invalid_token: 'ログインを確かめられませんでした（時間がたって切れたのかもしれません）。もう一度ログインしてください。',
      not_configured: what + 'の準備がまだ終わっていません（Apps Script の設定がまだです）。しばらくしてから、もう一度ためしてください。',
      network: '通信に失敗しました。電波のよい所で、もう一度ログインしてください。',
      gsi: 'Google のログインを読み込めませんでした。電波のよい所で、ページを読み込みなおしてください。',
      other: 'うまく読み込めませんでした。時間をおいて、もう一度ためしてください。',
    };
    if (el.req) MSG.not_member = 'このアカウントには、まだ見る権限がありません。下の欄から申請できます。幹事が承認すると見られるようになります。';
    let gsiReady = false;
    let tries = 0; // ログインの回数（古い返事を捨てるため）
    let pending = null; // 申請に使う ID トークン（not_member だったログイン。メモリだけ）

    // ── 知らせ（1 行目が本文、2 行目からは小さく） ──
    function setStatus(text, kind) {
      el.status.hidden = !text;
      el.status.className = 'ob-status' + (kind ? ' is-' + kind : '');
      el.status.textContent = '';
      if (!text) return;
      String(text).split('\n').forEach((line, i) => {
        const p = document.createElement('p');
        p.textContent = line;
        if (i) p.className = 'ob-status-sub';
        el.status.appendChild(p);
      });
    }

    function showBoard(data, email) {
      hideRequest();
      o.show(data, email);
      el.board.hidden = false;
      el.login.hidden = true;
      el.loading.hidden = true;
      el.user.hidden = !OB.data.isLive();
      el.userText.textContent = email ? 'ログイン中：' + email : 'ログイン中';
    }

    function showLogin() {
      el.login.hidden = false;
      renderButton();
    }

    // ── Google のログイン（gsi/client） ──
    function loadGsi() {
      if (window.google && google.accounts && google.accounts.id) { initGsi(); return; }
      const s = document.createElement('script');
      s.src = GSI_SRC;
      s.async = true;
      s.onload = initGsi;
      s.onerror = gsiFailed;
      document.head.appendChild(s);
      setTimeout(() => { if (!gsiReady && !el.login.hidden) gsiFailed(); }, 15000);
    }
    function gsiFailed() {
      if (gsiReady) return;
      setStatus(MSG.gsi, 'error');
      el.gbtn.hidden = true;
      el.reload.hidden = false;
    }
    function initGsi() {
      if (gsiReady) return;
      try {
        google.accounts.id.initialize({
          client_id: cfg.GOOGLE_CLIENT_ID,
          callback: onCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
          ux_mode: 'popup',
          itp_support: true,
        });
        gsiReady = true;
        el.gbtn.hidden = false;
        el.reload.hidden = true;
        if (el.status.classList.contains('is-error') && el.status.textContent === MSG.gsi) setStatus('');
        renderButton();
      } catch (e) {
        gsiFailed();
      }
    }
    let btnW = 0; // いま出しているログインボタンの幅
    const wantBtnW = () => Math.max(200, Math.min(300, (el.gbtn.clientWidth || 280)));
    function renderButton() {
      if (!gsiReady) return;
      el.gbtn.innerHTML = '';
      const w = (btnW = wantBtnW());
      try {
        google.accounts.id.renderButton(el.gbtn, {
          type: 'standard', theme: 'filled_blue', size: 'large', text: 'signin_with',
          shape: 'rectangular', logo_alignment: 'left', locale: 'ja', width: w,
        });
      } catch (e) {
        setStatus(MSG.gsi, 'error');
        el.reload.hidden = false;
      }
    }

    // Google から ID トークン（credential）を受け取ったとき
    async function onCredential(resp) {
      const cred = resp && resp.credential;
      if (!cred) { setStatus(MSG.invalid_token, 'error'); return; }
      const email = emailOf(cred);
      const my = ++tries;
      setStatus('見る権限を確かめています…', 'busy');
      try {
        const d = await o.load(cred);
        if (my !== tries) return;
        setStatus('');
        showBoard(d, email);
        // 読み上げソフトでも、中身に切りかわったことが分かるように
        el.board.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
      } catch (e) {
        if (my !== tries) return;
        const code = (e && e.code) || 'network';
        let text = MSG[code] || MSG.other;
        if (code === 'not_member') {
          if (email) text += '\nためしたアカウント：' + email;
          text += '\n別のアカウントでログインしなおすこともできます。';
        }
        if (code === 'not_member' || code === 'invalid_token') disableAuto();
        setStatus(text, 'error');
        renderButton();
        if (code === 'not_member') showRequest(cred, email);
        else hideRequest();
      }
    }

    // ── 見る権限の申請 ──
    const REQ_MSG = {
      invalid_token: 'ログインが切れました。もう一度ログインしてから、申請してください。',
      bad_request: 'お名前を入れてください。',
      too_many: 'いま申請がこみあっています。1 時間ほどしてから、もう一度送ってください。',
      not_configured: '申請の準備がまだ終わっていません。しばらくしてから、もう一度ためしてください。',
      network: '通信に失敗しました。電波のよい所で、もう一度送ってください。',
      other: 'うまく送れませんでした。時間をおいて、もう一度送ってください。',
    };
    function reqSay(text, kind) {
      el.reqStatus.className = 'ob-req-status' + (kind ? ' is-' + kind : '');
      el.reqStatus.textContent = text || '';
    }
    function showRequest(cred, email) {
      if (!el.req) return;
      pending = cred;
      el.req.hidden = false;
      el.req.classList.remove('is-sent');
      if (el.reqEmail) el.reqEmail.textContent = email || '（いまログインしたアカウント）';
      reqSay('');
    }
    function hideRequest() {
      pending = null;
      if (el.req) el.req.hidden = true;
    }
    let sending = false;
    if (el.req) {
      el.req.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (sending || !pending) return;
        const f = el.req.elements;
        const info = { name: String(f.name.value || '').trim(), entry: String(f.entry.value || '').trim(), note: String(f.note.value || '').trim() };
        if (!info.name) { reqSay(REQ_MSG.bad_request, 'error'); f.name.focus(); return; }
        sending = true;
        const btn = el.req.querySelector('button[type=submit]');
        if (btn) btn.disabled = true;
        reqSay('送っています…', 'busy');
        const cred = pending;
        try {
          const d = await OB.data.requestAccess(cred, info);
          if (d.already) {
            // もう見られる（承認ずみ）：そのまま開く
            reqSay('');
            setStatus('見る権限があります。開いています…', 'busy');
            const data = await o.load(cred);
            setStatus('');
            showBoard(data, emailOf(cred));
            return;
          }
          el.req.classList.add('is-sent');
          reqSay(d.again
            ? '前にも申請を受けつけています（お名前などは新しくしました）。幹事が承認すると、このページでログインすれば見られます。'
            : '申請を受けつけました。幹事が承認すると、このページでログインすれば見られるようになります。', 'done');
        } catch (err) {
          const code = (err && err.code) || 'network';
          reqSay(REQ_MSG[code] || REQ_MSG.other, 'error');
          if (code === 'invalid_token') { hideRequest(); renderButton(); }
        } finally {
          sending = false;
          if (btn) btn.disabled = false;
        }
      });
    }

    function disableAuto() {
      try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) { /* なにもしない */ }
    }

    function logout() {
      tries++;
      hideRequest();
      disableAuto();
      o.clear();
      el.board.hidden = true;
      showLogin();
      setStatus('ログアウトしました。', 'ok');
      window.scrollTo({ top: 0 });
    }

    // ── はじめ ──
    async function startDemo() {
      el.demo.hidden = false;
      el.loading.hidden = false;
      try {
        const d = await o.load('');
        showBoard(d, '');
      } finally {
        el.loading.hidden = true;
      }
    }

    function start() {
      if (!OB.data.isLive()) { startDemo(); return; }
      if (!String(cfg.GOOGLE_CLIENT_ID || '').trim()) { el.setup.hidden = false; return; }
      el.login.hidden = false;
      loadGsi();
    }

    el.logout.addEventListener('click', logout);
    el.reload.addEventListener('click', () => location.reload());
    // スマホを横にしたときなど、ログインボタンの入る幅が変わったら描きなおす
    let resizeT = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(() => {
        if (gsiReady && !el.login.hidden && !el.gbtn.hidden && wantBtnW() !== btnW) renderButton();
      }, 250);
    });

    return { start, logout, setStatus, MSG };
  };
  OB.loginGate.emailOf = emailOf;
})();
