/*
 * 3月 追いコン「うしろに注意」 ― 【仮】のミニゲーム
 * 本番の中身：後ろから投げられるうんこをよける。
 * これは仮のゲーム（時間内に A を 10 回おすとクリア）。担当の人が、このファイルをまるごと書きかえる。
 * id・order・month・event は docs/site/ARCH.md の表のとおりにしておくこと。書き方は docs/site/ENGINE.md。
 */
(function () {
  'use strict';
  OTK.register({
    id: 'unko',
    order: 9,
    month: 3,
    event: '追いコン',
    title: 'うしろに注意',
    goal: 'うんこをよけろ！',
    howto: ['（仮）Aを10回おすとクリア'],
    note: '',
    time: 10,
    timeout: 'lose',
    create(api) {
      const P = api.P;
      const NEED = 10;
      let count = 0;
      let pop = 0; // 押した直後の弾み
      return {
        update(dt) {
          pop = Math.max(0, pop - dt);
          if (api.input.pressed('a') || api.input.tap) {
            count++;
            pop = 0.12;
            api.sfx('select');
            if (count >= NEED) api.win('仮のゲームをクリア。');
          }
        },
        draw(g) {
          g.clear(P.dbrown);
          g.R(0, 150, api.W, api.H - 150, P.xdgray);
          g.text('（仮のゲーム）', api.W / 2, 28, { align: 'center', col: P.gray, size: 12 });
          g.text('うんこをよけろ！', api.W / 2, 46, { align: 'center', col: P.lyellow });
          g.sprite(api.person('senpai', { variant: 5 }), 150, 102, { scale: 2 });
          g.sprite(api.person('otoko', { dir: 'right', frame: pop > 0 ? 1 : 0 }), 74, 102 - (pop > 0 ? 4 : 0), { scale: 2 });
          g.text(count + ' / ' + NEED, api.W / 2, 172, { align: 'center', size: 16 });
          if (g.blink(2)) g.text('Aをおせ！', api.W / 2, 196, { align: 'center', col: P.white });
        },
      };
    },
  });
})();
