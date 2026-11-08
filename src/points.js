// ポイント（スタンプ）: 配置・当たり判定・効果・反応。仕様は docs/spec.md の「ポイント」
import { savePNG } from "./save.js";
import { STAMP_SIZE, drawWarning, makeStampSprites } from "./stamps.js";
import { INKS, LINE_WIDTHS, SPEED_STEPS } from "./tokens.js";
import { styleAt } from "./trail.js";
import { wrapDiff } from "./world.js";

const KINDS = [
  ...Object.keys(INKS).map((ink) => ({ kind: "color", ink })),
  ...["thicker", "thinner", "faster", "slower"].flatMap((kind) => [{ kind }, { kind }]),
  { kind: "clear" },
  { kind: "save" },
];
const MIN_DIST = 0.12; // ポイントどうし（世界の 1 辺に対する割合）
const SAME_KIND_DIST = 0.4; // 同じ種類どうし
const CLEAR_FROM_INTRO = 0.25; // 全消去は自己紹介から離す

// 反応の時間（秒）
const PRESS_DOWN = 0.09, PRESS_UP = 0.27; // スタンプが沈む
const SHAPE_IN = 0.08, SHAPE_OUT = 0.32; // 加速・減速で点P が伸び縮みする
const ERASE = 0.5; // 全消去で線が消える
const MANY = 30_000; // 点がこれより多いときは、点線をやめて古い区画の画像を薄くするだけにする
const ERASE_MARGIN = 256; // その画像に入れる、画面の外の幅（消えていく間にカメラが動く分）
const SHAKE = 0.4; // 保存できなかったとき、スタンプが横に揺れる

export class Points {
  constructor(game, flash) {
    this.game = game;
    game.points = this;
    this.flash = flash;
    this.list = [];
    this.saving = false;
    this.makeSprites();
    game.hooks.push((dt) => this.#update(dt));
    game.overlays = [(ctx, cam, l, t, r, b) => { this.#drawErasing(ctx, l, t, r, b); this.#drawStamps(ctx, cam, l, t, r, b); }];
    game.minimapPoints = () => this.list.map((p) => ({ x: p.x, y: p.y, warning: p.kind === "clear" }));
    game.pointShape = () => this.#pointShape();
  }

  // スタンプの画像は、devicePixelRatio が変わったとき・キャンバスの中身が失われたときに作り直す
  makeSprites() {
    this.spriteDpr = devicePixelRatio || 1;
    this.sprites = makeStampSprites(this.spriteDpr);
  }

  // 置く（開くたびにランダム）。条件を満たせないときは、離す距離を少しずつゆるめて必ず 15 個置く
  place() {
    if (this.list.length) return;
    const side = this.game.side, intro = this.game.intro.rect;
    const toIntro = (x, y) => Math.hypot(
      Math.max(0, Math.abs(wrapDiff(x, intro.cx, side)) - intro.width / 2),
      Math.max(0, Math.abs(wrapDiff(y, intro.cy, side)) - intro.height / 2),
    );
    for (let round = 0; round < 8; round++) {
      const loosen = Math.max(0, 1 - round * 0.15);
      const placed = [];
      for (const k of KINDS) {
        let found = null;
        for (let i = 0; i < 400 && !found; i++) {
          const x = Math.random() * side, y = Math.random() * side;
          if (toIntro(x, y) < STAMP_SIZE) continue;
          if (k.kind === "clear" && toIntro(x, y) < side * CLEAR_FROM_INTRO * loosen) continue;
          const tooClose = placed.some((p) => Math.hypot(wrapDiff(x, p.x, side), wrapDiff(y, p.y, side)) <
            side * (p.kind === k.kind && k.kind !== "color" ? SAME_KIND_DIST : MIN_DIST) * loosen);
          if (!tooClose) found = { ...k, x, y, rot: (Math.random() - 0.5) * 12 * Math.PI / 180, inside: false, pressAt: -1, shakeAt: -1 };
        }
        if (!found) break;
        placed.push(found);
      }
      if (placed.length === KINDS.length) { this.list = placed; return; }
    }
  }

  // ---- 毎フレーム ----
  #update() {
    const g = this.game;
    if (g.phase !== "zoom" && g.phase !== "free") return;
    const prev = g.prevP ?? g.p, side = g.side, r = STAMP_SIZE / 2;
    for (const pt of this.list) {
      // 前のフレームの位置から今の位置までの線分で判定する（間隔が長いフレームでも飛び越さないように）
      // 前の位置は「今の位置 − 動いた量」で求める（別々に端で折り返すと、反対側で線分が裏返る）
      const bx = wrapDiff(g.p[0], pt.x, side), by = wrapDiff(g.p[1], pt.y, side);
      const ax = bx - wrapDiff(g.p[0], prev[0], side), ay = by - wrapDiff(g.p[1], prev[1], side);
      const inside = Math.hypot(bx, by) <= r;
      // 触れている間に何度も効かないよう、一度離れるまでは反応しない
      if (!pt.inside && (inside || segmentDistance(ax, ay, bx, by) <= r)) this.#apply(pt);
      pt.inside = inside;
    }
  }

  #apply(pt) {
    const g = this.game;
    pt.pressAt = g.time;
    if (pt.kind === "color" && g.ink !== INKS[pt.ink]) { g.ink = INKS[pt.ink]; g.trail.setStyle(g.ink, g.lineWidth); }
    if (pt.kind === "thicker" && g.widthIndex < LINE_WIDTHS.length - 1) { g.widthIndex++; g.trail.setStyle(g.ink, g.lineWidth); }
    if (pt.kind === "thinner" && g.widthIndex > 0) { g.widthIndex--; g.trail.setStyle(g.ink, g.lineWidth); }
    if (pt.kind === "faster" && g.speedIndex < SPEED_STEPS.length - 1) { g.speedIndex++; this.shape = { type: "faster", at: g.time }; }
    if (pt.kind === "slower" && g.speedIndex > 0) { g.speedIndex--; this.shape = { type: "slower", at: g.time }; }
    if (pt.kind === "clear") this.#clear();
    if (pt.kind === "save") this.#save(pt);
  }

  // 全消去: 消した線は 0.5 秒だけ「消えていく線」として残す
  #clear() {
    const g = this.game, t = g.trail;
    // 写し取りの画像を作れなかったら（メモリ不足など）、点線の演出にする
    const image = t.count > MANY ? this.#captureTiles() : null;
    this.erasing = image ? { at: g.time, image } : { at: g.time, ...snapshot(t) };
    const minimapCopy = document.createElement("canvas");
    minimapCopy.width = g.minimap.base.width; minimapCopy.height = g.minimap.base.height;
    minimapCopy.getContext("2d").drawImage(g.minimap.base, 0, 0);
    this.erasing.minimap = minimapCopy;
    t.reset();
    t.start(g.p[0], g.p[1], g.ink, g.lineWidth);
    g.tiles.clear();
    g.minimap.redraw();
  }

  // 画面のまわりの線を、今の区画から 1 枚の画像に写す
  #captureTiles() {
    const g = this.game, cam = g.camera(), scale = Math.min(2, devicePixelRatio || 1) * cam.z;
    const w = innerWidth / cam.z + ERASE_MARGIN * 2, h = innerHeight / cam.z + ERASE_MARGIN * 2;
    const left = cam.x - w / 2, top = cam.y - h / 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(w * scale); canvas.height = Math.ceil(h * scale);
    const c = canvas.getContext("2d");
    if (!c) { canvas.width = canvas.height = 0; return null; }
    c.setTransform(scale, 0, 0, scale, -left * scale, -top * scale);
    g.tiles.draw(c, left, top, left + w, top + h, g.frame);
    return { canvas, cx: cam.x, cy: cam.y, w, h };
  }

  async #save(pt) {
    if (this.saving) return; // 保存している間は、もう一度通っても無視する
    this.saving = true;
    const ok = await savePNG(snapshot(this.game.trail), this.game.side);
    this.saving = false;
    // 紙が光るのは、画像を作れたときだけ。作れなかったら、スタンプが小さく横に揺れる
    if (ok) this.flash();
    else pt.shakeAt = this.game.time;
  }

  // ---- 描画 ----
  #drawStamps(ctx, cam, left, top, right, bottom) {
    const g = this.game, side = g.side, r = STAMP_SIZE / 2;
    for (const pt of this.list) {
      // 端をまたいだ写しのうち、カメラに近いものを描く
      const x = cam.x + wrapDiff(pt.x, cam.x, side), y = cam.y + wrapDiff(pt.y, cam.y, side);
      if (x < left - r * 2 || x > right + r * 2 || y < top - r * 2 || y > bottom + r * 2) continue;
      const press = this.#press(pt), shake = this.#shake(pt);
      if ((devicePixelRatio || 1) !== this.spriteDpr) this.makeSprites();
      const sprite = this.sprites[pt.kind === "color" ? `color:${pt.ink}` : pt.kind];
      ctx.save();
      ctx.translate(x + shake, y); ctx.rotate(pt.rot);
      if (!g.reduceMotion) ctx.scale(1 - 0.18 * press, 1 - 0.18 * press);
      ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
      // 押した瞬間は、縁を今のインクの色にする
      if (press > 0.05) {
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = g.ink; ctx.lineWidth = 1.5 + 1.5 * press; ctx.stroke();
      }
      ctx.restore();
      if (pt.kind === "clear") drawWarning(ctx, x + shake + r * 0.85, y - r * 0.9);
    }
  }

  // 消えていく線: 点線のすき間が広がって、かすれながら薄く細くなる
  #drawErasing(ctx, left, top, right, bottom) {
    const e = this.erasing, g = this.game;
    if (!e) return;
    const t = (g.time - e.at) / ERASE;
    if (t >= 1) {
      // 写した画像のメモリを返す
      for (const c of [e.image?.canvas, e.minimap]) if (c) c.width = c.height = 0;
      this.erasing = null;
      return;
    }
    const k = 1 - Math.pow(1 - t, 3);
    ctx.save();
    ctx.globalAlpha = 1 - k;
    if (e.image) this.#drawErasingImage(ctx, e.image, left, top, right, bottom);
    else this.#drawErasingLines(ctx, e, k, left, top, right, bottom);
    ctx.restore();
    // ミニマップも、古い線の画像を薄くしていく
    const m = g.minimap.bg;
    g.minimap.redraw();
    m.setTransform(1, 0, 0, 1, 0, 0);
    // 消している間にミニマップの大きさが変わっても合うように、今の大きさに合わせて貼る
    m.globalAlpha = 1 - k; m.drawImage(e.minimap, 0, 0, g.minimap.px, g.minimap.px); m.globalAlpha = 1;
  }

  #drawErasingImage(ctx, im, left, top, right, bottom) {
    const side = this.game.side, cx = (left + right) / 2, cy = (top + bottom) / 2;
    // 端をまたいでカメラが反対側へ移っても、同じ場所に貼る
    const x = cx + wrapDiff(im.cx, cx, side) - im.w / 2, y = cy + wrapDiff(im.cy, cy, side) - im.h / 2;
    ctx.drawImage(im.canvas, x, y, im.w, im.h);
  }

  #drawErasingLines(ctx, e, k, left, top, right, bottom) {
    const g = this.game;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const side = g.side, cx = (left + right) / 2, cy = (top + bottom) / 2;
    let style = null;
    for (let i = 1; i < e.count; i++) {
      if (e.flags[i] & 1) continue;
      const x0 = e.points[i * 2 - 2], y0 = e.points[i * 2 - 1], x1 = e.points[i * 2], y1 = e.points[i * 2 + 1];
      const sx = cx + wrapDiff(x0, cx, side) - x0, sy = cy + wrapDiff(y0, cy, side) - y0;
      if (Math.max(x0, x1) + sx < left - 24 || Math.min(x0, x1) + sx > right + 24 || Math.max(y0, y1) + sy < top - 24 || Math.min(y0, y1) + sy > bottom + 24) continue;
      const st = e.styleOf(i);
      if (st !== style) {
        style = st;
        ctx.strokeStyle = st.color; ctx.lineWidth = st.width * (1 - 0.4 * k);
        if (!g.reduceMotion) { ctx.setLineDash([Math.max(1, 26 * (1 - k)), 2 + 30 * k]); ctx.lineDashOffset = (i * 37) % 50; }
      }
      ctx.beginPath(); ctx.moveTo(x0 + sx, y0 + sy); ctx.lineTo(x1 + sx, y1 + sy); ctx.stroke();
    }
  }

  #press(pt) {
    const t = this.game.time - pt.pressAt;
    if (pt.pressAt < 0 || t > PRESS_DOWN + PRESS_UP) return 0;
    if (t < PRESS_DOWN) return 1 - Math.pow(1 - t / PRESS_DOWN, 2);
    return Math.pow(1 - (t - PRESS_DOWN) / PRESS_UP, 3);
  }

  #shake(pt) {
    const t = this.game.time - pt.shakeAt;
    if (pt.shakeAt < 0 || t > SHAKE) return 0;
    return Math.sin(t / SHAKE * Math.PI * 6) * 4 * (1 - t / SHAKE);
  }

  // 速さが変わった瞬間だけ、点P が進む向きに伸びる（加速）か、つぶれる（減速）
  #pointShape() {
    const s = this.shape, g = this.game;
    if (!s) return { along: 1, across: 1, haloInk: false };
    const t = g.time - s.at;
    if (t > SHAPE_IN + SHAPE_OUT) { this.shape = null; return { along: 1, across: 1, haloInk: false }; }
    const k = t < SHAPE_IN ? 1 - Math.pow(1 - t / SHAPE_IN, 3) : Math.pow(1 - (t - SHAPE_IN) / SHAPE_OUT, 3);
    // 動きを減らす設定では形を変えず、縁取りを一瞬インクの色にする
    if (g.reduceMotion) return { along: 1, across: 1, haloInk: k > 0.05 };
    const faster = s.type === "faster";
    return { along: 1 + (faster ? 0.7 : -0.4) * k, across: 1 + (faster ? -0.25 : 0.25) * k, haloInk: false };
  }
}

// 点（0, 0）から線分 a–b までの距離
function segmentDistance(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + dx * t, ay + dy * t);
}

// 今の線を写しておく（全消去の演出と保存のため）
function snapshot(t) {
  const runs = t.runs.slice();
  const styleOf = (i) => styleAt(runs, i);
  return { points: t.points.slice(0, t.count * 2), flags: t.flags.slice(0, t.count), count: t.count, styleOf };
}
