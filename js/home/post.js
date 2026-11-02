/*
 * 夕照寮OB会 ― ホームの投稿フォーム
 * 事件・出来事／名簿の追加・訂正／部屋割り。書いたところだけを Apps Script（gas/Code.gs の doPost、type 'post'）に送る。
 * Apps Script が Gemini で整えて、そのまま年表・名簿・部屋割りのシートに入れる（データの形は docs/site/ARCH.md）。
 * 写真：えらんだ写真（ZIP の中のものも）を、文字の投稿のあとに 1 枚ずつ送る（type 'upload'。ログインなしなので、
 * idToken のかわりに確認の答え・わなの欄・投稿者を付ける）。送るしくみは js/site/uploader.js（写真館と同じ）。
 */
(function () {
  'use strict';
  const form = document.getElementById('post-form');
  if (!form) return;
  const $ = (id) => document.getElementById(id);
  const status = $('post-status');
  const btn = $('post-send');
  const files = $('post-files');
  const album = $('post-album');
  const OB = window.OB;
  const url = OB ? OB.safeUrl((window.OB_CONFIG || {}).GAS_URL) : '';
  const TIMEOUT = 90000; // AI が 3 回整えることもあるので、長めに待つ

  const val = (name) => String(form.elements[name].value || '').trim();
  const MSG = {
    quiz: '確認の答えがちがいます。「確認」の問いの答えを、もう一度入れてください。',
    empty: 'どこか 1 つは書くか、写真をえらんでください（事件の見出しか本文、名簿のお名前か訂正、部屋割り、写真）。',
    too_many: 'いま投稿がこみあっています。1 時間ほどしてから、もう一度送ってください。',
    not_configured: '投稿フォームは、いま準備中です。もうしばらくお待ちください。',
  };

  // 写真を送るところ（ZIP を開く道具などが読めていなければ、写真の欄は使わない）
  const up = OB && OB.uploader && OB.data && OB.zip ? OB.uploader.create({
    el: {
      box: $('post-photo'), files, picked: $('post-picked'), stop: $('post-stop'),
      prog: $('post-prog'), progText: $('post-prog-text'), progFill: $('post-prog-fill'), status: $('post-photo-status'),
      problems: $('post-problems'), problemList: $('post-problem-list'),
    },
    stops: { quiz: MSG.quiz }, // 確認の答えがちがう：1 枚目で止める
  }) : null;

  if (!url || !up) {
    if (!url) {
      $('post-off').hidden = false;
      btn.disabled = true;
    }
    files.disabled = true;
  }

  // 「確認」の問いは、シート「設定」の「合言葉の問い」から読む（読めなければ、ページに書いてある問いのまま）
  if (url && OB.data && OB.data.loadQuiz) {
    OB.data.loadQuiz().then((q) => { if (q && $('post-quiz-q')) $('post-quiz-q').textContent = q; });
  }

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

  // 文字の投稿。返事の error（うまくいったときは ''）を返す
  async function sendText(body) {
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
        return '';
      }
      const code = (d && d.error) || 'unknown';
      say(MSG[code] || 'うまく送れませんでした。少ししてから、もう一度送ってください。', 'error');
      if (code === 'quiz') form.elements.quiz.focus();
      return code;
    } catch (err) {
      say('返事が来ませんでした。届いていて、いま AI が整えているところかもしれません。数分たっても載っていなければ、もう一度送ってください（書いた内容は残っています）。', 'error');
      return 'network';
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  // 写真を 1 枚ずつ送る（進み具合・送れなかったものは、送るボタンの下に出る）
  async function sendPhotos(body) {
    const year = val('ph_year').slice(0, 30);
    const r = await up.run({
      send: (photo) => OB.data.uploadPhoto('', Object.assign(photo, { year, note: '', quiz: body.quiz, hp: body.hp, by: body.by })),
    });
    if (!r) return;
    if (r.halt === 'quiz') form.elements.quiz.focus();
    if (r.saved + r.dup > 0) album.hidden = false;
    if (r.done) form.elements.ph_year.value = '';
  }

  let busy = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!url || busy || (up && up.isBusy())) return;
    const body = {
      type: 'post',
      quiz: val('quiz'),
      hp: form.elements.hp.value,
      by: val('by'),
      event: { when: val('ev_when'), title: val('ev_title'), what: val('ev_what'), who: val('ev_who') },
      member: { name: val('mb_name'), entry: val('mb_entry'), grad: val('mb_grad'), fix: val('mb_fix') },
      rooms: { text: val('rm_text') },
    };
    const hasText = !!(body.event.title || body.event.what || body.member.name || body.member.fix || body.rooms.text);
    const hasPhotos = !!(up && up.count());
    if (!hasText && !hasPhotos) {
      say(MSG.empty, 'error');
      form.elements.ev_title.focus();
      return;
    }
    if (!body.quiz) {
      say('「確認」の欄に、問いの答えを入れてください。', 'error');
      form.elements.quiz.focus();
      return;
    }
    busy = true;
    btn.disabled = true;
    files.disabled = true;
    album.hidden = true;
    try {
      // 文字の投稿が先。確認の答えがちがうときは、写真も送らない（同じ答えで断られるので）
      const code = hasText ? await sendText(body) : '';
      if (!hasText) say('');
      if (hasPhotos && code !== 'quiz') await sendPhotos(body);
    } finally {
      busy = false;
      btn.disabled = !url;
      files.disabled = !url || !up;
    }
  });
})();
