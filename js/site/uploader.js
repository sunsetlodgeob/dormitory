/*
 * 夕照寮OB会サイト ― 写真を送る道具（OB.uploader）
 * 写真館（js/shashin.js。ログインあり）と、トップページの投稿フォーム（js/home/post.js。ログインなし）で使う。約束は docs/site/ARCH.md。
 * 先に js/site/zip.js（OB.zip）を読みこんでおくこと。見た目は css/uploader.css（ob-up-*）。
 *
 *   const up = OB.uploader.create({
 *     el: { box, files, picked, go, stop, prog, progText, progFill, status, problems, problemList },
 *     stops: { quiz: '…' },               // この error が来たら止めて、この文を出す（too_many・not_configured はもとからある）
 *     fatal: ['invalid_token'],           // この error が来たら、文を出さずにすぐ止める（ページのほうで始末する）
 *   });
 *   const r = await up.run({ send: (photo) => OB.data.uploadPhoto(token, Object.assign(photo, { year, note })), after: async (r) => {} });
 *
 *  - el.box：ファイルをドラッグして入れる所（is-drag・is-busy を付ける）。el.go はなくてもよい（送っている間、押せなくする）
 *  - photo は { name, mime, data（base64） }。send は OB.data.uploadPhoto のように、失敗したら code 付きの Error を投げる
 *  - run の返事：{ total, saved, dup, fail, halt, fatal, stopped, done }。done は「全部送れた」（えらんだものは空にする）。
 *    halt は止めたわけ（stops の名前か 'network'）、fatal は fatal の Error。とちゅうで reset されたときと、何もえらんでいないときは null
 *  - after は、送り終わってから「送る」をまた押せるようになる前に呼ぶ（写真館の一覧の読みなおし）
 *  - 写真（ZIP の中のものも）を 1 枚ずつ送る。同時に送るのは 2 枚まで、えらんだ順に。
 *    ファイルは送る直前に 1 枚ずつ読む（ZIP 全体や、全部の写真を一度にメモリに入れない）。
 *  - 送れたもの（同じ写真がもうあったものも）は覚えておき、同じえらび方でもう一度送ると、とばす（やめた・休みの続き）。メモリだけ
 */
(function () {
  'use strict';
  const OB = (window.OB = window.OB || {});

  const SEND_MAX = 20 * 1024 * 1024; // 1 枚 20MB まで
  const SEND_FLIGHT = 2;
  const SHOW_PROBLEMS = 100;         // 問題の一覧は、100 件まで出す
  const PHOTO_MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif' };
  const OTHER_IMAGE = /^(bmp|tiff?|svg|avif|jxl|ico|dng|raw|cr2|cr3|nef|arw|orf|rw2|psd)$/;
  const VIDEO = /^(mp4|mov|m4v|avi|wmv|mts|m2ts|3gp|mkv|webm|mpe?g)$/;
  const SEND_MSG = {
    too_big: '大きすぎるので、送りませんでした（1 枚 20MB まで）',
    not_photo: '写真ではないので、送りませんでした',
    video: '動画は送れません（写真だけ）',
    other_image: 'この形の写真は送れません（送れるのは jpg・png・gif・webp・heic）',
    no_photo: 'ZIP の中に、送れる写真がありませんでした',
    zip_not: 'ZIP を開けませんでした（こわれているかもしれません）',
    zip64: 'この ZIP は大きすぎて開けません。いくつかに分けて作りなおすか、写真をそのままえらんでください',
    zip_encrypted: 'パスワード付きの ZIP は開けません。パスワードなしで作りなおしてください',
    zip_broken: 'ZIP の中のこのファイルを読めませんでした（こわれているかもしれません）',
    zip_method: 'この ZIP の入れ方には対応していません。写真をそのままえらんでください',
    zip_browser: 'このブラウザでは ZIP を開けません。新しいブラウザで開くか、写真をそのままえらんでください',
    read: 'ファイルを読めませんでした',
    too_large: '大きすぎるので、受けとってもらえませんでした',
    bad_type: '写真として受けとってもらえませんでした',
    bad_request: 'うまく送れませんでした',
    network: '通信に失敗したので、送れませんでした',
    other: 'うまく送れませんでした',
  };
  const STOP_MSG = {
    too_many: 'たくさん送られたので、少し休んでいます。1 時間ほどしてから、残りを送ってください。',
    not_configured: '写真を受けとる準備が、まだ終わっていません。しばらくしてから、もう一度ためしてください。',
  };
  const NET_STOP = '通信に何度も失敗したので、止めました。電波のよい所で、もう一度「送る」を押してください（送れたものは、とばします）。';

  const extOf = (name) => { const m = /\.([^./]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
  const baseName = (name) => String(name || '').split('/').pop().slice(-200);
  const isZipFile = (f) => extOf(f.name) === 'zip' || /^application\/(x-)?zip(-compressed)?$/.test(f.type || '');
  const fileKey = (f) => [f.name, f.size, f.lastModified].join('|');
  // 名前（と、あれば種類）から、送れる写真か。{ mime } か { why }
  function photoKind(name, type) {
    const ext = extOf(name);
    if (PHOTO_MIME[ext]) return { mime: PHOTO_MIME[ext] };
    const t = String(type || '').toLowerCase();
    for (const k in PHOTO_MIME) if (PHOTO_MIME[k] === t) return { mime: t };
    if (OTHER_IMAGE.test(ext) || /^image\//.test(t)) return { why: 'other_image' };
    if (VIDEO.test(ext) || /^video\//.test(t)) return { why: 'video' };
    return { why: 'not_photo' };
  }
  // バイト列を base64 に（大きい写真でも、少しずつ。3 の倍数で区切ると、つなげても正しい）
  function toBase64(bytes) {
    const STEP = 3 * 0x4000;
    const parts = [];
    for (let i = 0; i < bytes.length; i += STEP) {
      const sub = bytes.subarray(i, i + STEP);
      let bin = '';
      for (let j = 0; j < sub.length; j += 0x1000) bin += String.fromCharCode.apply(null, sub.subarray(j, j + 0x1000));
      parts.push(btoa(bin));
    }
    return parts.join('');
  }

  function create(opts) {
    const el = opts.el;
    const stops = Object.assign({}, STOP_MSG, opts.stops || {});
    const fatal = opts.fatal || [];
    const up = { files: [], sent: new Set(), busy: false, stop: false, problems: 0, gen: 0 };

    function say(text, kind) {
      el.status.classList.remove('is-error', 'is-done', 'is-busy');
      if (kind) el.status.classList.add('is-' + kind);
      el.status.textContent = text || '';
    }
    function clearProblems() {
      up.problems = 0;
      el.problemList.textContent = '';
      el.problems.hidden = true;
    }
    function problem(label, why) {
      up.problems++;
      el.problems.hidden = false;
      const list = el.problemList;
      if (up.problems <= SHOW_PROBLEMS) {
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.textContent = label;
        li.appendChild(b);
        li.appendChild(document.createTextNode('：' + (SEND_MSG[why] || SEND_MSG.other)));
        list.appendChild(li);
        return;
      }
      let more = list.querySelector('.ob-up-more');
      if (!more) {
        more = document.createElement('li');
        more.className = 'ob-up-more';
        list.appendChild(more);
      }
      more.textContent = 'ほかに ' + (up.problems - SHOW_PROBLEMS) + ' 件';
    }
    function showPicked() {
      const fs = up.files;
      if (!fs.length) { el.picked.textContent = 'まだ何もえらんでいません。'; return; }
      const zips = fs.filter(isZipFile).length;
      const first = fs[0].name;
      el.picked.textContent = 'えらんだもの：' + (fs.length === 1 ? first : first + ' ほか ' + (fs.length - 1) + ' 個') +
        (zips ? '（ZIP ' + zips + ' 個）' : '');
    }
    function pick(list) {
      if (up.busy) return;
      up.files = Array.from(list || []).filter((f) => f && typeof f.slice === 'function');
      up.sent.clear();
      showPicked();
      say('');
    }
    function setBusy(on) {
      up.busy = on;
      if (el.go) el.go.disabled = on;
      el.files.disabled = on;
      el.stop.hidden = !on;
      el.stop.disabled = false;
      el.box.classList.toggle('is-busy', on);
      if (on) el.stop.textContent = 'やめる';
    }
    function progress(c) {
      const done = c.saved + c.dup;
      let t = done + ' / ' + c.total + ' 枚 送りました';
      if (c.dup) t += '（同じ写真がもうあったので とばした：' + c.dup + ' 枚）';
      if (c.fail) t += '　送れなかった：' + c.fail + ' 枚';
      el.prog.hidden = false;
      el.progText.textContent = t;
      const pct = c.total ? Math.round(((done + c.fail) / c.total) * 100) : 100;
      el.progFill.style.width = pct + '%';
    }

    // えらんだファイルから、送るものの一覧を作る（ZIP は目次だけ読む）
    async function collect(files) {
      const items = [];
      for (const f of files) {
        if (isZipFile(f)) {
          let list;
          try {
            list = await OB.zip.entries(f);
          } catch (e) {
            problem(f.name, (e && e.code) || 'zip_not');
            continue;
          }
          let n = 0;
          for (const en of list) {
            const label = f.name + ' の中の ' + en.name;
            const k = photoKind(en.name, '');
            if (!k.mime) { problem(label, k.why); continue; }
            n++;
            if (en.size > SEND_MAX) { problem(label, 'too_big'); continue; }
            items.push({ key: fileKey(f) + '|' + en.name, label, name: baseName(en.name), mime: k.mime, size: en.size, read: en.read });
          }
          if (!n) problem(f.name, 'no_photo');
          continue;
        }
        const k = photoKind(f.name, f.type);
        if (!k.mime) { problem(f.name, k.why); continue; }
        if (f.size > SEND_MAX) { problem(f.name, 'too_big'); continue; }
        items.push({
          key: fileKey(f), label: f.name, name: baseName(f.name) || 'photo', mime: k.mime, size: f.size,
          read: () => f.arrayBuffer().then((b) => new Uint8Array(b)),
        });
      }
      return items;
    }

    async function run(o) {
      if (up.busy) return null;
      if (!up.files.length) { say('写真か ZIP をえらんでください。', 'error'); el.files.focus(); return null; }
      const g = up.gen;
      const send = o.send;
      setBusy(true);
      clearProblems();
      el.prog.hidden = true;
      say('ファイルを調べています…', 'busy');
      const c = { total: 0, saved: 0, dup: 0, fail: 0, halt: '', fatal: null, stopped: false, done: false };
      let netFails = 0;
      try {
        const items = await collect(up.files);
        if (g !== up.gen) return null;
        const todo = items.filter((it) => !up.sent.has(it.key));
        c.total = todo.length;
        if (!todo.length) {
          say(items.length ? 'えらんだ写真は、もう送ってあります。' : '送れる写真がありませんでした。', 'error');
          return c;
        }
        progress(c);
        say('送っています…' + (todo.length < items.length ? '（前に送れたものは、とばします）' : ''), 'busy');
        let next = 0;
        const worker = async () => {
          while (!up.stop && !c.halt && g === up.gen && next < todo.length) {
            const it = todo[next++];
            let res;
            try {
              const bytes = await it.read();
              if (g !== up.gen) return;
              if (bytes.length > SEND_MAX) throw Object.assign(new Error('大きい'), { code: 'too_big' });
              res = await send({ name: it.name, mime: it.mime, data: toBase64(bytes) });
            } catch (e) {
              if (g !== up.gen) return;
              const code = (e && e.code) || 'read';
              if (fatal.indexOf(code) >= 0) { c.halt = code; c.fatal = e; return; }
              if (code !== 'network' && stops[code]) { c.halt = code; return; }
              if (code === 'network' && ++netFails >= 3) c.halt = 'network';
              c.fail++;
              problem(it.label, code);
              progress(c);
              continue;
            }
            if (g !== up.gen) return;
            netFails = 0;
            up.sent.add(it.key);
            if (res && res.duplicate) c.dup++;
            else c.saved++;
            progress(c);
          }
        };
        const workers = [];
        for (let i = 0; i < SEND_FLIGHT; i++) workers.push(worker());
        await Promise.all(workers);
        if (g !== up.gen) return null;
        if (c.fatal) return c; // ページのほうで始末する（文は出さない）
        const all = c.saved + c.dup + c.fail === c.total;
        if (c.halt) say(c.halt === 'network' ? NET_STOP : stops[c.halt], 'error');
        else if (up.stop && !all) {
          c.stopped = true;
          say('やめました。もう一度「送る」を押すと、残りを送ります（送れたものは、とばします）。', 'error');
        } else {
          say(c.fail ? '送り終わりました。送れなかったものは、下の一覧を見てください。' : '送り終わりました。ありがとうございます！', c.fail ? 'error' : 'done');
          if (!c.fail) {
            // 全部送れた：えらんだものを空にする（もう一度押して、また送らないように）
            c.done = true;
            up.files = [];
            up.sent.clear();
            el.files.value = '';
            showPicked();
          }
        }
        if (o.after) await o.after(c);
        return g === up.gen ? c : null;
      } catch (e) {
        if (g !== up.gen) return null;
        say(SEND_MSG.other + '。時間をおいて、もう一度ためしてください。', 'error');
        c.halt = 'error';
        return c;
      } finally {
        if (g === up.gen) { up.stop = false; setBusy(false); }
      }
    }

    // 送るのをやめて、えらんだもの・進み具合・一覧を消す（とちゅうの run は、null を返して終わる）
    function reset() {
      up.gen++;
      up.files = [];
      up.sent.clear();
      up.stop = false;
      setBusy(false);
      el.files.value = '';
      showPicked();
      say('');
      clearProblems();
      el.prog.hidden = true;
      el.progFill.style.width = '0%';
      el.box.classList.remove('is-drag');
    }

    el.files.addEventListener('change', () => pick(el.files.files));
    el.stop.addEventListener('click', () => {
      if (!up.busy) return;
      up.stop = true;
      el.stop.disabled = true;
      el.stop.textContent = '止めています…';
      say('いま送っている分が終わったら、止めます…', 'busy');
    });
    // パソコン：ファイルをドラッグして入れる
    let dragDepth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0;
    el.box.addEventListener('dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      if (!up.busy && !el.files.disabled) el.box.classList.add('is-drag');
    });
    el.box.addEventListener('dragover', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = up.busy || el.files.disabled ? 'none' : 'copy';
    });
    el.box.addEventListener('dragleave', () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) el.box.classList.remove('is-drag');
    });
    el.box.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth = 0;
      el.box.classList.remove('is-drag');
      if (up.busy || el.files.disabled) return;
      pick(e.dataTransfer.files);
      el.files.value = ''; // 入れたものは up.files にある（input のほうは空にしておく）
    });
    showPicked();

    return {
      run, reset, pick, say,
      count: () => up.files.length,
      isBusy: () => up.busy,
    };
  }

  OB.uploader = { create, toBase64, photoKind, MAX: SEND_MAX };
})();
