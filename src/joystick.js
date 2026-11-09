// 分度器のジョイスティック。仕様は docs/spec.md の「操作」「想定外の状況への備え」
// - ノブは指に合わせて動き、目盛りに重ならないよう中心から 32px まで
// - 向きは指の位置の角度だけを使い、中心の近く（台の半径の 2 割）は遊び
// - 最初に触れた指だけを追う。取り消し・捕捉が外れた・ウィンドウを離れたときは、指を離したのと同じ扱い
// - 見た目（目盛りの色・ノブ）は、変わったときだけ書き換える
import { COLOR } from "./tokens.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const PLATE_RADIUS = 64; // 台の半径（viewBox の単位 = CSS px）
const KNOB_MAX = 32; // 目盛りの内端 54 − ノブの半径 22
const DEAD_ZONE = PLATE_RADIUS * 0.2;
const ACTIVE_RANGE = 10; // 向きの目盛りとして色を付ける範囲（±度）

export class Joystick {
  constructor(svg, onTurn) {
    this.svg = svg;
    this.onTurn = onTurn;
    this.knob = svg.querySelector(".knob");
    this.knobFill = svg.querySelector(".knob-fill");
    this.pointer = null;
    this.ticks = this.#buildTicks(svg.querySelector(".ticks"));
    this.state = { x: 0, y: 0, ink: null, active: null };
    this.#listen();
  }

  get touching() { return this.pointer !== null; }

  // ノブの位置（中心からの px）。指を離したあとに中心へ戻すのは呼ぶ側
  setKnob(x, y) {
    if (x === this.state.x && y === this.state.y) return;
    this.state.x = x; this.state.y = y;
    this.knob.setAttribute("transform", `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  }

  // 今のインクの色と、色を付ける向き（度。null なら付けない）
  setLook(ink, angle) {
    const active = angle === null ? null : Math.round(angle);
    if (ink === this.state.ink && active === this.state.active) return;
    this.state.ink = ink; this.state.active = active;
    this.knobFill.setAttribute("fill", ink);
    for (const t of this.ticks) {
      const on = active !== null && Math.abs(((t.angle - active + 540) % 360) - 180) <= ACTIVE_RANGE;
      t.el.setAttribute("stroke", on ? ink : COLOR.borderStrong);
      t.el.setAttribute("stroke-width", on ? "2.5" : "1");
    }
  }

  // 5° ごと。15° ごと・45° ごとは長く
  #buildTicks(group) {
    const ticks = [];
    for (let a = 0; a < 360; a += 5) {
      const r = a * Math.PI / 180, inner = a % 45 === 0 ? 54 : a % 15 === 0 ? 58 : 60.5;
      const el = document.createElementNS(SVG_NS, "path");
      el.setAttribute("d", `M${(100 + Math.cos(r) * inner).toFixed(2)} ${(100 + Math.sin(r) * inner).toFixed(2)}L${(100 + Math.cos(r) * PLATE_RADIUS).toFixed(2)} ${(100 + Math.sin(r) * PLATE_RADIUS).toFixed(2)}`);
      el.setAttribute("stroke", COLOR.borderStrong);
      group.appendChild(el);
      ticks.push({ angle: a, el });
    }
    return ticks;
  }

  #listen() {
    const svg = this.svg;
    svg.addEventListener("pointerdown", (e) => {
      if (this.pointer !== null || e.button !== 0) return; // 2 本目の指と、右ボタンなどは無視する
      this.pointer = e.pointerId;
      svg.setPointerCapture(e.pointerId);
      this.#move(e);
      this.onTurn(null, "down");
    });
    // 長押しでメニューを出さない（タッチの Windows などでは、押している間に出る）
    svg.addEventListener("contextmenu", (e) => e.preventDefault());
    svg.addEventListener("pointermove", (e) => { if (e.pointerId === this.pointer) this.#move(e); });
    const end = (e) => { if (e.pointerId === this.pointer) this.release(); };
    svg.addEventListener("pointerup", end);
    svg.addEventListener("pointercancel", end);
    svg.addEventListener("lostpointercapture", end);
    addEventListener("blur", () => this.release());
    document.addEventListener("visibilitychange", () => { if (document.hidden) this.release(); });
  }

  release() {
    if (this.pointer === null) return;
    try { this.svg.releasePointerCapture(this.pointer); } catch { /* すでに外れている */ }
    this.pointer = null;
    this.onTurn(null, "up");
  }

  #move(e) {
    const r = this.svg.getBoundingClientRect();
    // viewBox は 200 × 200、中心が 100, 100
    let dx = (e.clientX - (r.left + r.width / 2)) * 200 / r.width;
    let dy = (e.clientY - (r.top + r.height / 2)) * 200 / r.height;
    const len = Math.hypot(dx, dy);
    if (len > DEAD_ZONE) this.onTurn([dx / len, dy / len], "move");
    if (len > KNOB_MAX) { dx *= KNOB_MAX / len; dy *= KNOB_MAX / len; }
    this.setKnob(dx, dy);
  }
}
