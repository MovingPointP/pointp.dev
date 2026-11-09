// 遊びの本体: 時計・ループ・カメラ・描画。仕様は docs/spec.md
import { buildIntro } from "./intro.js";
import { Joystick } from "./joystick.js";
import { Minimap } from "./minimap.js";
import { Tiles, tileSizeFor } from "./tiles.js";
import {
  COLOR, GRID, INKS, INTRO_SECONDS, LINE_WIDTHS, LOOP_SECONDS, MAJOR, P_HALO, PLAYABLE_MIN, SLOW_SECONDS,
  SPEED_STEPS, START_SPEED_INDEX, START_WIDTH_INDEX, ZOOM_SECONDS, pointDiameter,
} from "./tokens.js";
import { Trail } from "./trail.js";
import { worldSide, wrap, wrapDiff } from "./world.js";

const MAX_DT = 0.1; // 1 フレームで進める時間の上限（秒）
const KNOB_RETURN = 0.05; // 指を離したノブが中心へ戻る速さ（時定数、秒）
const FONT = '"pointp P", Georgia, serif'; // 読み込めないときは Georgia

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Game {
  constructor({ canvas, joystick, minimap, reduceMotion }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.reduceMotion = reduceMotion;
    this.side = worldSide(innerWidth, innerHeight);
    // とても小さい画面では、自己紹介だけを見せる
    this.playable = Math.min(innerWidth, innerHeight) >= PLAYABLE_MIN;

    this.trail = new Trail(this.side, tileSizeFor(this.side));
    this.tiles = new Tiles(this.trail);
    this.minimap = new Minimap(minimap, this.trail);
    this.joystick = new Joystick(joystick, (dir, phase) => this.#onStick(dir, phase));

    this.intro = buildIntro(this.side);
    this.baseSpeed = this.side / LOOP_SECONDS;
    this.time = 0; // ゲームの中の時計（秒）
    this.frame = 0;
    this.ink = INKS.Black;
    this.widthIndex = START_WIDTH_INDEX;
    this.speedIndex = START_SPEED_INDEX;
    this.dir = [1, 0];
    this.turned = false;
    this.knob = [0, 0];
    this.points = null; // ポイント（スタンプ）。points.js が入れる
    this.hooks = []; // 毎フレーム呼ぶ追加の処理（ポイントなど）

    // 自己紹介を書き始める
    const ip = this.intro.points;
    this.p = [ip[0], ip[1]];
    this.trail.start(ip[0], ip[1], this.ink, LINE_WIDTHS[this.widthIndex]);
    this.written = 0; // 書いた点の番号
    this.phase = "intro";
    this.introSpeed = this.intro.total / INTRO_SECONDS;
  }

  get lineWidth() { return LINE_WIDTHS[this.widthIndex]; }
  get targetSpeed() { return this.baseSpeed * SPEED_STEPS[this.speedIndex]; }

  // ---- ループ ----
  start() {
    this.resize();
    this.last = null;
    const tick = (now) => {
      this.raf = requestAnimationFrame(tick);
      // 書き始めの瞬間に目印を打つ（Canvas は LCP の対象にならないので、これで書き始めまでの時間を測る）
      if (this.frame === 0) performance.mark("intro-start");
      if (this.last === null) this.last = now;
      const dt = Math.min(MAX_DT, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.render();
    };
    this.raf = requestAnimationFrame(tick);
    // タブが裏にある間は止め、戻ったら前回の時刻を今にそろえる
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = null; }
      else if (this.raf === null) { this.last = null; this.raf = requestAnimationFrame(tick); }
    });
  }

  step(dt) {
    this.time += dt;
    this.frame++;
    // 動きを減らす設定では、最初の 1 歩で書き終える（main.js が onPlay を入れ終わってから）
    if (this.phase === "intro") { if (this.reduceMotion) this.#finishIntro(true); else this.#writeIntro(); }
    else if (this.phase !== "rest") this.#move(dt);
    for (const hook of this.hooks) hook(dt);
    // ノブは指を離すと中心へ戻る（時間で計算する）。手がかりを見せている間は、その位置にする
    if (this.joystick.touching) {
      this.knob[0] = this.joystick.state.x; this.knob[1] = this.joystick.state.y; // 離したとき、ここから戻す
    } else {
      if (this.knobOverride) {
        this.knob[0] = this.knobOverride[0]; this.knob[1] = this.knobOverride[1];
      } else {
        const k = Math.exp(-dt / KNOB_RETURN);
        this.knob[0] *= k; this.knob[1] *= k;
        if (Math.hypot(this.knob[0], this.knob[1]) < 0.05) this.knob[0] = this.knob[1] = 0;
      }
      this.joystick.setKnob(this.knob[0], this.knob[1]);
    }
    if (this.trail.compactIfNeeded()) { this.tiles.clear(); this.minimap.redrawGradually(); }
    this.minimap.continueRedraw();
  }

  // 自己紹介: 書いた長さ = 速さ × 時間
  #writeIntro() {
    const it = this.intro, length = this.introSpeed * this.time;
    while (this.written < it.count - 1 && it.lengths[this.written + 1] <= length) {
      this.written++;
      this.trail.add(it.points[this.written * 2], it.points[this.written * 2 + 1]);
    }
    this.p = [this.trail.headX, this.trail.headY];
    this.#updateDirFromIntro();
    if (this.written >= it.count - 1) this.#finishIntro(false);
  }

  #updateDirFromIntro() {
    const it = this.intro, i = this.written, j = Math.max(0, i - 8);
    const dx = it.points[i * 2] - it.points[j * 2], dy = it.points[i * 2 + 1] - it.points[j * 2 + 1];
    const len = Math.hypot(dx, dy);
    if (len > 0) this.dir = [dx / len, dy / len];
  }

  // 書き終わった（skip: 動きを減らす設定などで、書く途中を見せないとき）
  #finishIntro(skip) {
    const it = this.intro;
    for (let i = this.written + 1; i < it.count; i++) this.trail.add(it.points[i * 2], it.points[i * 2 + 1]);
    this.written = it.count - 1;
    this.p = [this.trail.headX, this.trail.headY];
    this.#updateDirFromIntro();
    this.trail.extend(this.p[0], this.p[1], true); // 下線の向きに進む頭を作る
    this.phaseStart = this.time;
    if (!this.playable) { this.phase = "rest"; return; }
    this.phase = skip ? "free" : "zoom";
    // カメラが寄り終わったときに使う区画を、寄っている間の空いた時間に作っておく
    if (!skip) (window.requestIdleCallback ?? setTimeout)(() => {
      const z = this.#baseZoom();
      this.tiles.prepare(this.p[0], this.p[1], Math.hypot(innerWidth, innerHeight) / 2 / z + this.tiles.size);
    });
    this.speed = skip ? this.targetSpeed : this.introSpeed;
    document.body.classList.add("playing");
    this.onPlay?.();
  }

  #move(dt) {
    const elapsed = this.time - this.phaseStart;
    if (this.phase === "zoom") {
      // 自己紹介の速さからデフォルトの速さへ、はじめに大きく落とす
      this.speed = this.introSpeed + (this.targetSpeed - this.introSpeed) * easeOut(Math.min(1, elapsed / SLOW_SECONDS));
      if (elapsed >= Math.max(ZOOM_SECONDS, SLOW_SECONDS)) this.phase = "free";
    } else {
      this.speed = this.targetSpeed;
    }
    const side = this.side;
    const prev = this.p;
    const nx = prev[0] + this.dir[0] * this.speed * dt, ny = prev[1] + this.dir[1] * this.speed * dt;
    this.trail.extend(nx, ny, this.turned);
    this.turned = false;
    const wx = wrap(nx, side), wy = wrap(ny, side);
    // 端をまたいだ: 反対側から、今の位置の写しで線を続ける
    if (wx !== nx || wy !== ny) this.trail.wrapTo(prev[0] + (wx - nx), prev[1] + (wy - ny), wx, wy);
    this.prevP = prev;
    this.p = [wx, wy];
  }

  #onStick(dir, phase) {
    if (dir) { this.dir = dir; this.turned = true; }
    if (phase === "down") this.onTouch?.();
  }

  // ---- 大きさ ----
  resize() {
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.round(innerWidth * dpr);
    this.canvas.height = Math.round(innerHeight * dpr);
    this.tiles.setScale(dpr);
    this.minimap.resize();
    this.render(); // 大きさを変えると中身が消えるので、すぐ描き直す
  }

  // ---- カメラ ----
  // 画面が世界より大きいときは拡大して、同じ線が 2 つ映らないようにする
  #baseZoom() { return Math.max(1, innerWidth / this.side, innerHeight / this.side); }

  camera() {
    const w = innerWidth, h = innerHeight, r = this.intro.rect, base = this.#baseZoom();
    const fit = Math.min(base, w * 0.85 / r.width, h * 0.7 / r.height);
    if (this.phase === "intro" || this.phase === "rest") return { x: r.cx, y: r.cy, z: fit, k: 0 };
    const k = this.phase === "zoom" ? easeInOut(Math.min(1, (this.time - this.phaseStart) / ZOOM_SECONDS)) : 1;
    // 寄る途中で点P が端をまたいでも飛ばないよう、自己紹介の近くの写しを使う
    const px = r.cx + wrapDiff(this.p[0], r.cx, this.side), py = r.cy + wrapDiff(this.p[1], r.cy, this.side);
    return { x: r.cx + (px - r.cx) * k, y: r.cy + (py - r.cy) * k, z: fit + (base - fit) * k, k };
  }

  // ---- 描画 ----
  render() {
    const ctx = this.ctx, dpr = devicePixelRatio || 1, w = innerWidth, h = innerHeight;
    const cam = this.camera();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = COLOR.paper;
    ctx.fillRect(0, 0, w, h);
    // 寄り終わったら、カメラの位置をデバイス px に丸める（方眼のちらつきを防ぐ）
    const free = this.phase === "free";
    const ex = dpr * (w / 2 - cam.x * cam.z), ey = dpr * (h / 2 - cam.y * cam.z);
    ctx.setTransform(dpr * cam.z, 0, 0, dpr * cam.z, free ? Math.round(ex) : ex, free ? Math.round(ey) : ey);
    const left = cam.x - w / 2 / cam.z, right = cam.x + w / 2 / cam.z;
    const top = cam.y - h / 2 / cam.z, bottom = cam.y + h / 2 / cam.z;
    this.#drawGrid(left, top, right, bottom, cam.z);
    // 自己紹介を書いている間とカメラが寄る間は、区画を使わず座標データから直接描く
    if (this.phase === "free") this.tiles.draw(ctx, left, top, right, bottom, this.frame);
    else this.#drawTrailDirect();
    for (const draw of this.overlays ?? []) draw(ctx, cam, left, top, right, bottom);
    this.#drawPoint(cam);
    if (this.phase !== "intro") {
      this.minimap.drawOverlay(this.p[0], this.p[1], w / cam.z, h / cam.z, this.ink, this.minimapPoints?.() ?? []);
      this.joystick.setLook(this.ink, this.joystick.touching || this.hintActive ? Math.atan2(this.dir[1], this.dir[0]) * 180 / Math.PI : null);
    }
  }

  #drawGrid(left, top, right, bottom, z) {
    const ctx = this.ctx;
    const lines = (step, color, width) => {
      ctx.beginPath();
      for (let x = Math.floor(left / step) * step; x <= right; x += step) { ctx.moveTo(x, top); ctx.lineTo(x, bottom); }
      for (let y = Math.floor(top / step) * step; y <= bottom; y += step) { ctx.moveTo(left, y); ctx.lineTo(right, y); }
      ctx.strokeStyle = color; ctx.lineWidth = width / z; ctx.stroke();
    };
    lines(GRID, COLOR.gridMinor, 1);
    lines(MAJOR, COLOR.gridMajor, 1);
    lines(this.side, COLOR.worldEdge, 2);
  }

  #drawTrailDirect() {
    const ctx = this.ctx, t = this.trail, pts = t.points;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    let style = null;
    ctx.beginPath();
    for (let i = 1; i < t.count; i++) {
      if (t.isBreak(i)) { ctx.moveTo(pts[i * 2], pts[i * 2 + 1]); continue; }
      const st = t.styleOf(i);
      if (st !== style) {
        ctx.stroke(); ctx.beginPath();
        style = st; ctx.strokeStyle = st.color; ctx.lineWidth = st.width;
        ctx.moveTo(pts[i * 2 - 2], pts[i * 2 - 1]);
      }
      ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
    }
    ctx.stroke();
  }

  // 点P と「P」の文字は、カメラの倍率によらず画面上で同じ大きさ
  #drawPoint(cam) {
    const ctx = this.ctx, dpr = devicePixelRatio || 1, w = innerWidth, h = innerHeight;
    const px = cam.x + wrapDiff(this.p[0], cam.x, this.side), py = cam.y + wrapDiff(this.p[1], cam.y, this.side);
    const sx = w / 2 + (px - cam.x) * cam.z, sy = h / 2 + (py - cam.y) * cam.z;
    const r = pointDiameter(this.lineWidth) / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const shape = this.pointShape?.() ?? { along: 1, across: 1, haloInk: false };
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(Math.atan2(this.dir[1], this.dir[0])); ctx.scale(shape.along, shape.across);
    ctx.beginPath(); ctx.arc(0, 0, r + P_HALO, 0, Math.PI * 2);
    ctx.fillStyle = shape.haloInk ? this.ink : COLOR.paper; ctx.fill();
    if (shape.haloInk) { ctx.beginPath(); ctx.arc(0, 0, r + 1, 0, Math.PI * 2); ctx.fillStyle = COLOR.paper; ctx.fill(); }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = this.ink; ctx.fill();
    ctx.restore();
    // 「P」の文字: 自己紹介を書いている間は出さず、ジョイスティックと同じ 1 秒で出す
    const alpha = this.phase === "intro" || this.phase === "rest" ? 0 : cam.k;
    if (alpha <= 0) return;
    const size = Math.min(28, Math.max(20, Math.min(w, h) * 0.036));
    ctx.globalAlpha = alpha;
    ctx.font = `italic 600 ${size}px ${FONT}`;
    ctx.lineJoin = "round"; ctx.strokeStyle = COLOR.paper; ctx.lineWidth = P_HALO * 2;
    ctx.strokeText("P", sx + r + 3, sy - r - 3);
    ctx.fillStyle = this.ink; ctx.fillText("P", sx + r + 3, sy - r - 3);
    ctx.globalAlpha = 1;
  }
}
