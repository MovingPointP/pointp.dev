// pointp.dev のトップページ。仕様は docs/spec.md
import { Game } from "./game.js";
import { Hint } from "./hint.js";
import { Points } from "./points.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.querySelector(".world");
const game = new Game({
  canvas,
  joystick: document.querySelector(".joystick"),
  minimap: document.querySelector(".minimap"),
  reduceMotion,
});

// 保存できたとき、紙がシャッターのように一瞬白く光る（すぐ明るくなり、ゆっくり戻る）
const flashLayer = document.querySelector(".flash");
const flash = () => flashLayer.animate(
  [{ opacity: 0 }, { opacity: reduceMotion ? 0.45 : 0.85, offset: 0.12 }, { opacity: 0 }],
  { duration: reduceMotion ? 300 : 450, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
);

// ポイントは、自己紹介を書いている間の空いた時間に置く（遊べる大きさの画面だけ）
const setUpPlay = () => {
  const points = new Points(game, flash);
  (window.requestIdleCallback ?? setTimeout)(() => points.place());
  game.onPlay = () => points.place();
  new Hint(game);
};
// 小さく開いた画面は、遊べる大きさになったときに用意する
if (game.playable) setUpPlay(); else game.onPlayable = setUpPlay;

addEventListener("resize", () => game.resize());
// キャンバスの中身が失われたら、区画・ミニマップ・スタンプの画像を作り直す
// 裏から戻ったときは、知らせなしに消えていることがあるので、同じように作り直す
const rebuild = () => { game.tiles.clear(); game.minimap.refresh(); game.points?.makeSprites(); game.render(); };
canvas.addEventListener("contextrestored", rebuild);
document.addEventListener("visibilitychange", () => { if (!document.hidden) rebuild(); });

// 確認用（自分の PC で開いたときだけ）
// ?t=秒: その時刻まで一定の間隔で進めた場面を描いて止まる。?dir=角度: 書き終わったあとの向き
// ?demo=種類: 書き終わったとき、その種類のポイントを点P の少し先に置く（反応を確かめる）
const params = new URLSearchParams(location.search);
if (["localhost", "127.0.0.1"].includes(location.hostname) && params.has("t")) {
  game.resize();
  const onPlay = game.onPlay;
  game.onPlay = () => {
    onPlay?.();
    if (params.has("dir")) {
      const a = +params.get("dir") * Math.PI / 180;
      game.dir = [Math.cos(a), Math.sin(a)]; game.turned = true;
    }
    const demo = params.get("demo"), pt = game.points.list?.find((p) => p.kind === demo || p.ink === demo);
    if (pt) { pt.x = game.p[0] + game.dir[0] * 160; pt.y = game.p[1] + game.dir[1] * 160; }
  };
  for (let t = 0; t < +params.get("t"); t += 1 / 60) game.step(1 / 60);
  game.render();
} else {
  game.start();
  // 「P」の文字の書体は、最初のフレームのあとに読み込む（書き終わるまで 5 秒あるので間に合う。読み込めなければ Georgia）
  requestAnimationFrame(() => document.fonts.load('italic 600 20px "pointp P"', "P").catch(() => {}));
}
