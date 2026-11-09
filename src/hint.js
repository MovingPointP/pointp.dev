// ジョイスティックの最初の手がかり。仕様は docs/spec.md の「最初の流れ（自己紹介）」
// - 現れ終わった直後に、ノブが点P の進む向きへ 14px 押し出されて戻るのを、1.1 秒で 2 回くり返す
//   その間は向きの目盛りを光らせる。今の向きと同じ方向なので、点P の進み方は変わらない
// - 8 秒たっても触らなければ、もう 1 回だけ
// - 一度でも触ったら、その場でやめ、次の訪問からも見せない（localStorage。使えなければ毎回見せる）
// - 動きを減らす設定では、ノブは動かさず目盛りだけを光らせる
import { ZOOM_SECONDS } from "./tokens.js";

const KEY = "pointp.joystick-touched";
const DURATION = 1.1, AGAIN_AFTER = 8, PUSH = 14;

const touchedBefore = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const remember = () => { try { localStorage.setItem(KEY, "1"); } catch { /* 使えない環境では覚えない */ } };

export class Hint {
  constructor(game) {
    this.game = game;
    this.next = null; // 次に見せる時刻（ゲームの中の時計）
    this.again = true;
    this.push = [0, 0];
    game.hooks.push(() => this.#update());
    const onPlay = game.onPlay, onTouch = game.onTouch;
    game.onPlay = () => {
      onPlay?.();
      if (!touchedBefore()) this.next = game.time + (game.phase === "zoom" ? ZOOM_SECONDS : 0.4);
    };
    game.onTouch = () => {
      onTouch?.();
      this.next = null;
      this.#stop();
      remember();
    };
  }

  #update() {
    const g = this.game;
    if (this.next === null || g.joystick.touching) return this.#stop();
    const t = (g.time - this.next) / DURATION;
    if (t < 0) return this.#stop();
    if (t >= 1) {
      this.#stop();
      if (this.again) { this.next = g.time + AGAIN_AFTER; this.again = false; } else this.next = null;
      return;
    }
    // 2 回押し出して戻る
    const k = Math.sin(Math.PI * ((t * 2) % 1));
    g.hintActive = true;
    this.push[0] = g.dir[0] * PUSH * k; this.push[1] = g.dir[1] * PUSH * k;
    g.knobOverride = g.reduceMotion ? null : this.push;
  }

  #stop() {
    this.game.hintActive = false;
    this.game.knobOverride = null;
  }
}
