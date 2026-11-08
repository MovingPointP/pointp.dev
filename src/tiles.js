// 本画面の線を、区画ごとの画像として持つ。仕様は docs/spec.md の「描画の方針」
// - 区画の大きさは、世界の 1 辺をちょうど割り切る 256px 前後
// - 画像の解像度は devicePixelRatio 2 まで
// - 画面に映る区画だけを持ち、新しい線は持っている区画に描き足す
// - まだできていない区画は、座標データから直接描く（1 フレームに作るのは約 4ms まで）

const TARGET = 256;
const BUILD_BUDGET_MS = 4;

export const tileSizeFor = (side) => side / Math.ceil(side / TARGET);

export class Tiles {
  constructor(trail) {
    this.trail = trail;
    this.side = trail.side;
    this.size = trail.tileSize;
    this.n = trail.tiles;
    this.cache = new Map(); // キー → { canvas, g, seen }
    this.pool = [];
    this.setScale(devicePixelRatio || 1);
    // 新しい線は、持っている区画にだけ描き足す
    trail.onSegment((x0, y0, x1, y1, color, width) => this.#drawSegment(x0, y0, x1, y1, color, width));
  }

  // 解像度（devicePixelRatio、2 まで）。変わったら作り直す
  setScale(dpr) {
    const scale = Math.min(2, dpr);
    if (scale === this.scale) return;
    this.scale = scale;
    this.px = Math.round(this.size * scale);
    this.clear();
  }

  clear() {
    for (const tile of this.cache.values()) this.#release(tile);
    this.cache.clear();
  }

  // 画面に映る区画を描く。left・top などは世界の座標（端をまたぐので 0〜side の外にもなる）
  draw(ctx, left, top, right, bottom, frame) {
    const s = this.size, n = this.n;
    const ax = Math.floor(left / s), bx = Math.floor(right / s);
    const ay = Math.floor(top / s), by = Math.floor(bottom / s);
    const cx = (left + right) / 2, cy = (top + bottom) / 2;
    const missing = [];
    for (let ix = ax; ix <= bx; ix++) {
      for (let iy = ay; iy <= by; iy++) {
        const tx = ((ix % n) + n) % n, ty = ((iy % n) + n) % n;
        if (!this.trail.rangesOf(tx, ty)) continue; // 線のない区画は描かない
        const tile = this.cache.get(tx * n + ty);
        if (tile) {
          tile.seen = frame;
          ctx.drawImage(tile.canvas, ix * s, iy * s, s, s);
        } else {
          missing.push({ ix, iy, tx, ty, d: Math.hypot((ix + 0.5) * s - cx, (iy + 0.5) * s - cy) });
        }
      }
    }
    // 画面の中心に近い区画から、時間の許す限り作る。間に合わない区画は座標データから直接描く
    missing.sort((a, b) => a.d - b.d);
    const until = performance.now() + BUILD_BUDGET_MS;
    for (const m of missing) {
      if (performance.now() < until) {
        const tile = this.#build(m.tx, m.ty);
        tile.seen = frame;
        ctx.drawImage(tile.canvas, m.ix * s, m.iy * s, s, s);
      } else {
        ctx.save();
        ctx.beginPath(); ctx.rect(m.ix * s, m.iy * s, s, s); ctx.clip();
        this.#render(ctx, m.tx, m.ty, (m.ix - m.tx) * s, (m.iy - m.ty) * s);
        ctx.restore();
      }
    }
    this.#evict(frame, (bx - ax + 1) * (by - ay + 1));
  }

  // 前もって作っておく（自己紹介を書いている間の空いた時間など）
  prepare(x, y, radius) {
    const s = this.size, n = this.n;
    for (let ix = Math.floor((x - radius) / s); ix <= Math.floor((x + radius) / s); ix++) {
      for (let iy = Math.floor((y - radius) / s); iy <= Math.floor((y + radius) / s); iy++) {
        const tx = ((ix % n) + n) % n, ty = ((iy % n) + n) % n;
        if (this.trail.rangesOf(tx, ty) && !this.cache.has(tx * n + ty)) this.#build(tx, ty).seen = -1;
      }
    }
  }

  // 保持する上限は「画面に映る枚数 × 1.5」。超えたら最後に映ったのが古い順に捨てる
  #evict(frame, visible) {
    const limit = Math.ceil(visible * 1.5) + 4;
    if (this.cache.size <= limit) return;
    const old = [...this.cache.entries()].filter(([, t]) => t.seen < frame).sort((a, b) => a[1].seen - b[1].seen);
    for (const [key, tile] of old.slice(0, this.cache.size - limit)) {
      this.cache.delete(key);
      this.#release(tile);
    }
  }

  #build(tx, ty) {
    const tile = this.pool.pop() || this.#create();
    tile.g.setTransform(1, 0, 0, 1, 0, 0);
    tile.g.clearRect(0, 0, this.px, this.px);
    tile.g.setTransform(this.scale, 0, 0, this.scale, -tx * this.size * this.scale, -ty * this.size * this.scale);
    this.#render(tile.g, tx, ty, 0, 0);
    this.cache.set(tx * this.n + ty, tile);
    return tile;
  }

  #create() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = this.px;
    return { canvas, g: canvas.getContext("2d"), seen: 0 };
  }

  // 捨てた区画は使い回す。あふれた分は大きさを 0 にしてメモリを返す（iOS Safari はなかなか返さないため）
  #release(tile) {
    if (this.pool.length < 8 && tile.canvas.width === this.px) this.pool.push(tile);
    else tile.canvas.width = tile.canvas.height = 0;
  }

  // 区画（tx, ty）を通る線分を描く。ox・oy は描く位置のずれ（端をまたいだ写しに描くとき）
  #render(g, tx, ty, ox, oy) {
    const ranges = this.trail.rangesOf(tx, ty);
    if (!ranges) return;
    const pts = this.trail.points, side = this.side;
    const cx = (tx + 0.5) * this.size, cy = (ty + 0.5) * this.size;
    g.lineCap = "round"; g.lineJoin = "round";
    let style = null, open = false, lastI = -2;
    const flush = () => { if (open) { g.stroke(); open = false; } };
    for (let r = 0; r < ranges.length; r += 2) {
      for (let i = ranges[r]; i <= ranges[r + 1]; i++) {
        if (this.trail.isBreak(i)) { flush(); lastI = -2; continue; }
        const st = this.trail.styleOf(i);
        if (st !== style) { flush(); style = st; g.strokeStyle = st.color; g.lineWidth = st.width; lastI = -2; }
        const x0 = pts[i * 2 - 2], y0 = pts[i * 2 - 1], x1 = pts[i * 2], y1 = pts[i * 2 + 1];
        // 線分を区画の近くの写しへずらす（端をまたいでいる線分のため）
        const sx = Math.round((cx - (x0 + x1) / 2) / side) * side + ox;
        const sy = Math.round((cy - (y0 + y1) / 2) / side) * side + oy;
        if (!open) { g.beginPath(); open = true; }
        if (lastI !== i - 1) g.moveTo(x0 + sx, y0 + sy);
        g.lineTo(x1 + sx, y1 + sy);
        lastI = i;
      }
      flush(); lastI = -2;
    }
  }

  // 新しい線分を、持っている区画のうち重なるものに描き足す
  #drawSegment(x0, y0, x1, y1, color, width) {
    const s = this.size, n = this.n, pad = width / 2 + 1;
    for (let ix = Math.floor((Math.min(x0, x1) - pad) / s); ix <= Math.floor((Math.max(x0, x1) + pad) / s); ix++) {
      for (let iy = Math.floor((Math.min(y0, y1) - pad) / s); iy <= Math.floor((Math.max(y0, y1) + pad) / s); iy++) {
        const tx = ((ix % n) + n) % n, ty = ((iy % n) + n) % n;
        const tile = this.cache.get(tx * n + ty);
        if (!tile) continue;
        const g = tile.g;
        // 区画の座標系（tx, ty）に合わせて、線分を写しの位置からずらす
        g.setTransform(this.scale, 0, 0, this.scale, -ix * s * this.scale, -iy * s * this.scale);
        g.lineCap = "round"; g.strokeStyle = color; g.lineWidth = width;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
    }
  }
}
