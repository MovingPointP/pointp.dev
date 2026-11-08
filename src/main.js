// pointp.dev のトップページ。仕様は docs/spec.md
import { Game } from "./game.js";

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.querySelector(".world");
const game = new Game({
  canvas,
  joystick: document.querySelector(".joystick"),
  minimap: document.querySelector(".minimap"),
  reduceMotion,
});

addEventListener("resize", () => game.resize());
// devicePixelRatio が変わったとき（ブラウザの拡大縮小、解像度の違うモニターへの移動）は描き直す
(function watchPixelRatio() {
  matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener("change", () => { game.resize(); watchPixelRatio(); }, { once: true });
})();
// キャンバスの中身が失われたら、区画とミニマップを座標データから作り直す
canvas.addEventListener("contextrestored", () => { game.tiles.clear(); game.minimap.redraw(); game.render(); });

// 確認用（自分の PC で開いたときだけ）: ?t=秒 で、その時刻まで一定の間隔で進めた場面を描いて止まる
const params = new URLSearchParams(location.search);
if (["localhost", "127.0.0.1"].includes(location.hostname) && params.has("t")) {
  game.resize();
  if (params.has("dir")) {
    const a = +params.get("dir") * Math.PI / 180;
    game.onPlay = () => { game.dir = [Math.cos(a), Math.sin(a)]; game.turned = true; };
  }
  for (let t = 0; t < +params.get("t"); t += 1 / 60) game.step(1 / 60);
  game.render();
} else {
  game.start();
}
