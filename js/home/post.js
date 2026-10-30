/*
 * 夕照寮OB会 ― ホームの投稿フォーム
 * 事件・出来事／名簿の追加・訂正／部屋割り。書いたところだけを Apps Script（gas/Code.gs の doPost、type 'post'）に送る。
 * Apps Script が Gemini で整えて、そのまま年表・名簿・部屋割りのシートに入れる（データの形は docs/site/ARCH.md）。
 */
(function () {
  'use strict';
  const form = document.getElementById('post-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const status = $('post-status');
  const btn = $('post-send');
  const url = window.OB ? OB.safeUrl((window.OB_CONFIG || {}).GAS_URL) : '';
  const TIMEOUT = 90000; // AI が 3 回整えることもあるので、長めに待つ

  if (!url) {
    $('post-off').hidden = false;
    btn.disabled = true;
  }

  const val = (name) => String(form.elements[name].value || '').trim();
  const MSG = {
    quiz: '確認の答えがちがいます。寮の名前を漢字で入れてください。',
    empty: 'どこか 1 つは書いてください（事件の見出しか本文、名簿のお名前か訂正、部屋割り）。',
    too_many: 'いま投稿がこみあっています。1 時間ほどしてから、もう一度送ってください。',
    not_configured: '投稿フォームは、いま準備中です。もうしばらくお待ちください。',
  };

  function say(text, kind, list) {
    status.className = 'home-post-status' + (kind ? ' is-' + kind : '');
    status.textContent = text;
    if (list && list.length) {
      const ul = document.createElement('ul');
      for (const line of list) {
        const li = document.createElement('li');
        li.textContent = String(line);
        ul.appendChild(li);
      }
      status.appendChild(ul);
    }
  }

  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!url || busy) return;
    const body = {
      type: 'post',
      quiz: val('quiz'),
      hp: form.elements.hp.value,
      by: val('by'),
      event: { when: val('ev_when'), title: val('ev_title'), what: val('ev_what'), who: val('ev_who') },
      member: { name: val('mb_name'), entry: val('mb_entry'), grad: val('mb_grad'), fix: val('mb_fix') },
      rooms: { text: val('rm_text') },
    };
    const has = body.event.title || body.event.what || body.member.name || body.member.fix || body.rooms.text;
    if (!has) {
      say(MSG.empty, 'error');
      form.elements.ev_title.focus();
      return;
    }
    if (!body.quiz) {
      say('確認の欄に、寮の名前を漢字で入れてください。', 'error');
      form.elements.quiz.focus();
      return;
    }
    busy = true;
    btn.disabled = true;
    say('送っています…（AI が形を整えるので、30 秒ほどかかることがあります）');
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT) : 0;
    try {
      const res = await fetch(url, {
        method: 'POST',
        redirect: 'follow',
        // text/plain にすると、ブラウザが前もって問い合わせ（プリフライト）をしないので、Apps Script でも受けられる
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        signal: ctl ? ctl.signal : undefined,
      });
      const d = await res.json();
      if (d && d.ok) {
        if (d.duplicate) say('同じ内容を、少し前に受けとっています（いま AI が整えているところかもしれません）。数分たっても載っていなければ、10分ほどしてから、もう一度送ってください。', 'done');
        else say('送りました。ありがとうございました！', 'done', d.results);
        // 次の投稿のために、中身だけ消す（投稿者と確認の答えは残す）
        for (const name of ['ev_when', 'ev_title', 'ev_what', 'ev_who', 'mb_name', 'mb_entry', 'mb_grad', 'mb_fix', 'rm_text']) form.elements[name].value = '';
      } else {
        const code = d && d.error;
        say(MSG[code] || 'うまく送れませんでした。少ししてから、もう一度送ってください。', 'error');
        if (code === 'quiz') form.elements.quiz.focus();
      }
    } catch (err) {
      say('返事が来ませんでした。届いていて、いま AI が整えているところかもしれません。数分たっても載っていなければ、もう一度送ってください（書いた内容は残っています）。', 'error');
    } finally {
      if (timer) clearTimeout(timer);
      busy = false;
      btn.disabled = !url;
    }
  });
})();
