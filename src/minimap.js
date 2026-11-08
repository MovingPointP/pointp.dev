// ミニマップ。世界全体を 1 枚だけ縮小して表示する。仕様は docs/spec.md の「ミニマップ」
// - 線の画像（base）と、点P・見えている範囲・ポイント（overlay）を、キャンバスを分けて重ねる
// - 線の画像には新しい分だけ描き足し、上の層だけを毎フレーム描き直す
import { COLOR, P_HALO } from "./tokens.js";

export class Minimap {
  constructor(root, trail) {
    this.root = root;
    this.trail = trail;
    this.side = trail.side;
    this.base = root.querySelector(".minimap-lines");
    this.overlay = root.querySelector(".minimap-overlay");
    this.bg = this.base.getContext("2d");
    this.og = this.overlay.getContext("2d");
    trail.onSegment((x0, y0, x1, y1, color, width) => this.#drawSegment(x0, y0, x1, y1, color, width));
  }

  // 表示サイズや解像度が変わったら、座標データから描き直す
  resize() {
    const dpr = devicePixelRatio || 1;
    const css = this.root.clientWidth;
    this.px = Math.max(1, Math.round(css * dpr));
    for (const c of [this.base, this.overlay]) c.width = c.height = this.px;
    this.k = this.px / this.side; // 世界の 1px → ミニマップの画素
    this.minWidth = dpr / this.k; // 線は最小 1px（CSS px）
    this.redraw();
  }

  redraw() {
    if (!this.px) return;
    const g = this.bg, t = this.trail, pts = t.points;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.px, this.px);
    g.setTransform(this.k, 0, 0, this.k, 0, 0);
    g.lineCap = "round"; g.lineJoin = "round";
    let style = null;
    g.beginPath();
    for (let i = 1; i < t.count; i++) {
      if (t.isBreak(i)) continue;
      const st = t.styleOf(i);
      if (st !== style) {
        g.stroke(); g.beginPath();
        style = st; g.strokeStyle = st.color; g.lineWidth = Math.max(this.minWidth, st.width);
      }
      g.moveTo(pts[i * 2 - 2], pts[i * 2 - 1]);
      g.lineTo(pts[i * 2], pts[i * 2 + 1]);
    }
    g.stroke();
  }

  // 上の層: 見えている範囲の枠と点P（ポイントは points に { x, y, warning } を渡す）
  drawOverlay(px, py, viewWidth, viewHeight, ink, points = []) {
    if (!this.px) return;
    const g = this.og, k = this.k, dpr = devicePixelRatio || 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.px, this.px);
    g.setTransform(k, 0, 0, k, 0, 0);
    for (const p of points) {
      g.beginPath(); g.arc(p.x, p.y, (p.warning ? 2.8 : 2.2) * dpr / k, 0, Math.PI * 2);
      g.fillStyle = p.warning ? COLOR.warning : COLOR.borderStrong; g.fill();
    }
    // 見えている範囲。端をまたぐと分かれるので、写しも描いて世界の外は切れるに任せる
    g.strokeStyle = COLOR.muted; g.lineWidth = dpr / k; g.setLineDash([2 * dpr / k, 2 * dpr / k]);
    const x0 = px - viewWidth / 2, y0 = py - viewHeight / 2;
    for (const ox of [-this.side, 0, this.side]) for (const oy of [-this.side, 0, this.side]) g.strokeRect(x0 + ox, y0 + oy, viewWidth, viewHeight);
    g.setLineDash([]);
    g.beginPath(); g.arc(px, py, 3.5 * dpr / k, 0, Math.PI * 2);
    g.fillStyle = ink; g.fill();
    g.strokeStyle = COLOR.paper; g.lineWidth = (P_HALO / 2) * dpr / k; g.stroke();
  }

  #drawSegment(x0, y0, x1, y1, color, width) {
    if (!this.px) return;
    const g = this.bg;
    g.setTransform(this.k, 0, 0, this.k, 0, 0);
    g.lineCap = "round"; g.strokeStyle = color; g.lineWidth = Math.max(this.minWidth, width);
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  }
}
