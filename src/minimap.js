// ミニマップ。世界全体を 1 枚だけ縮小して表示する。仕様は docs/spec.md の「ミニマップ」
// - 線の画像（base）と、点P・見えている範囲・ポイント（overlay）を、キャンバスを分けて重ねる
// - 線の画像には新しい分だけ描き足し、上の層だけを毎フレーム描き直す
import { COLOR, P_HALO } from "./tokens.js";
import { addLineWithCopies } from "./world.js";

const REDRAW_BUDGET_MS = 4;
const REDRAW_CHUNK = 20_000; // 時間を確かめる間隔（線分の数）
const MANY = 100_000; // 点がこれより多いときは、数フレームに分けて描き直す

export class Minimap {
  constructor(root, trail) {
    this.root = root;
    this.trail = trail;
    this.side = trail.side;
    this.base = root.querySelector(".minimap-lines");
    this.overlay = root.querySelector(".minimap-overlay");
    this.bg = this.base.getContext("2d");
    this.og = this.overlay.getContext("2d");
    trail.onCommit((from, end) => {
      if (!this.px) return;
      this.bg.setTransform(this.k, 0, 0, this.k, 0, 0);
      this.bg.lineCap = "round"; this.bg.lineJoin = "round";
      this.#drawRange(this.bg, from, end);
    });
  }

  // 表示サイズや解像度が変わったら、座標データから描き直す
  resize() {
    const dpr = devicePixelRatio || 1;
    const px = Math.max(1, Math.round(this.root.clientWidth * dpr));
    if (px === this.px && dpr === this.dpr) return; // 大きさが同じなら描き直さない（アドレスバーの出入りなど）
    this.px = px;
    this.dpr = dpr;
    for (const c of [this.base, this.overlay]) c.width = c.height = this.px;
    this.k = this.px / this.side; // 世界の 1px → ミニマップの画素
    this.minWidth = dpr / this.k; // 線は最小 1px（CSS px）
    this.refresh();
  }

  // 座標データから描き直す（点が多いときは止まらないよう、数フレームに分ける）
  refresh() {
    if (this.trail.count > MANY) this.redrawGradually(); else this.redraw();
  }

  redraw() {
    if (!this.px) return;
    this.#dropPending();
    this.#begin(this.bg);
    this.#drawRange(this.bg, 1, this.trail.committed);
  }

  // 点が多いとき用: 裏のキャンバスに数フレームかけて描き、描き終えたら差し替える（その間は今の画像のまま）
  redrawGradually() {
    if (!this.px) return;
    this.#dropPending();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = this.px;
    const g = canvas.getContext("2d");
    if (!g) { canvas.width = canvas.height = 0; return this.redraw(); }
    this.#begin(g);
    this.pending = { canvas, g, next: 1 };
  }

  // 毎フレーム呼ぶ。1 フレームに描くのは約 4ms まで
  continueRedraw() {
    const p = this.pending;
    if (!p) return;
    const until = performance.now() + REDRAW_BUDGET_MS;
    while (p.next < this.trail.committed && performance.now() < until) {
      const end = Math.min(this.trail.committed, p.next + REDRAW_CHUNK);
      this.#drawRange(p.g, p.next, end);
      p.next = end;
    }
    if (p.next < this.trail.committed) return;
    this.bg.setTransform(1, 0, 0, 1, 0, 0);
    this.bg.clearRect(0, 0, this.px, this.px);
    this.bg.drawImage(p.canvas, 0, 0);
    this.#dropPending();
  }

  #dropPending() {
    if (this.pending) this.pending.canvas.width = this.pending.canvas.height = 0;
    this.pending = null;
  }

  #begin(g) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.px, this.px);
    g.setTransform(this.k, 0, 0, this.k, 0, 0);
    g.lineCap = "round"; g.lineJoin = "round";
  }

  // 線分 from〜end−1 を描く
  #drawRange(g, from, end) {
    const t = this.trail, pts = t.points;
    let style = null;
    g.beginPath();
    for (let i = from; i < end; i++) {
      if (t.isBreak(i)) continue;
      const st = t.styleOf(i);
      if (st !== style) {
        g.stroke(); g.beginPath();
        style = st; g.strokeStyle = st.color; g.lineWidth = Math.max(this.minWidth, st.width);
      }
      addLineWithCopies(g, pts[i * 2 - 2], pts[i * 2 - 1], pts[i * 2], pts[i * 2 + 1], g.lineWidth / 2, this.side);
    }
    g.stroke();
  }

  // 上の層: 見えている範囲の枠と点P（ポイントは points に { x, y, warning } を渡す）
  drawOverlay(px, py, viewWidth, viewHeight, ink, points) {
    if (!this.px) return;
    const g = this.og, k = this.k, dpr = devicePixelRatio || 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.px, this.px);
    g.setTransform(k, 0, 0, k, 0, 0);
    this.#drawLive(g);
    for (const p of points) {
      g.beginPath(); g.arc(p.x, p.y, (p.warning ? 2.8 : 2.2) * dpr / k, 0, Math.PI * 2);
      g.fillStyle = p.warning ? COLOR.warning : COLOR.borderStrong; g.fill();
    }
    // 見えている範囲。端をまたぐと分かれるので、写しも描いて世界の外は切れるに任せる
    g.strokeStyle = COLOR.muted; g.lineWidth = dpr / k; g.setLineDash([2 * dpr / k, 2 * dpr / k]);
    const x0 = px - viewWidth / 2, y0 = py - viewHeight / 2;
    for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) g.strokeRect(x0 + ox * this.side, y0 + oy * this.side, viewWidth, viewHeight);
    g.setLineDash([]);
    g.beginPath(); g.arc(px, py, 3.5 * dpr / k, 0, Math.PI * 2);
    g.fillStyle = ink; g.fill();
    g.strokeStyle = COLOR.paper; g.lineWidth = (P_HALO / 2) * dpr / k; g.stroke();
  }

  // 進行中の線（まだ線の画像に描いていない分）
  #drawLive(g) {
    const t = this.trail, pts = t.points, st = t.liveStyle;
    g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = st.color; g.lineWidth = Math.max(this.minWidth, st.width);
    g.beginPath();
    for (let i = t.committed; i < t.count; i++) {
      addLineWithCopies(g, pts[i * 2 - 2], pts[i * 2 - 1], pts[i * 2], pts[i * 2 + 1], g.lineWidth / 2, this.side);
    }
    g.stroke();
  }
}
