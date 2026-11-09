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
    this.maxScale = 2;
    this.setScale(devicePixelRatio || 1);
    // 新しい線は、持っている区画にだけ描き足す
    trail.onSegment((x0, y0, x1, y1, color, width) => this.#drawSegment(x0, y0, x1, y1, color, width));
  }

  // 解像度（devicePixelRatio、2 まで）。変わったら作り直す
  setScale(dpr) {
    this.dpr = dpr;
    const scale = Math.min(this.maxScale, dpr);
    if (scale === this.scale) return;
    this.scale = scale;
    this.px = Math.round(this.size * scale);
    this.k = this.px / this.size; // 世界の 1px → 区画の画素（画素数を整数に丸めた分も含む）
    // 使い回し用のキャンバスは古い解像度のままなので捨てる
    for (const tile of this.pool) tile.canvas.width = tile.canvas.height = 0;
    this.pool = [];
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
    const m = ctx.getTransform();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 区画はデバイス px で貼る
    const missing = [];
    for (let ix = ax; ix <= bx; ix++) {
      for (let iy = ay; iy <= by; iy++) {
        const tx = ((ix % n) + n) % n, ty = ((iy % n) + n) % n;
        if (!this.trail.rangesOf(tx, ty)) continue; // 線のない区画は描かない
        const tile = this.cache.get(tx * n + ty);
        if (tile) {
          tile.seen = frame;
          this.#blit(ctx, tile, ix, iy, m);
        } else {
          missing.push({ ix, iy, tx, ty, d: Math.hypot((ix + 0.5) * s - cx, (iy + 0.5) * s - cy) });
        }
      }
    }
    // 画面の中心に近い区画から、時間の許す限り作る。間に合わない区画は座標データから直接描く
    missing.sort((a, b) => a.d - b.d);
    const until = performance.now() + BUILD_BUDGET_MS;
    for (const t of missing) {
      // 画面の両端に同じ区画が映るときは、先に作った方を使う
      const tile = this.cache.get(t.tx * n + t.ty) || (performance.now() < until ? this.#build(t.tx, t.ty) : null);
      if (tile) {
        tile.seen = frame;
        this.#blit(ctx, tile, t.ix, t.iy, m);
      } else {
        ctx.save();
        ctx.setTransform(m);
        ctx.beginPath(); ctx.rect(t.ix * s, t.iy * s, s, s); ctx.clip();
        this.#render(ctx, t.tx, t.ty, (t.ix - t.tx) * s, (t.iy - t.ty) * s);
        ctx.restore();
      }
    }
    ctx.setTransform(m);
    this.#evict(frame, (bx - ax + 1) * (by - ay + 1));
  }

  // 貼る位置をデバイス px に丸める（端数の位置に貼ると、区画の継ぎ目に細い筋が出る）
  #blit(ctx, tile, ix, iy, m) {
    const s = this.size;
    const x0 = Math.round(m.a * ix * s + m.e), x1 = Math.round(m.a * (ix + 1) * s + m.e);
    const y0 = Math.round(m.d * iy * s + m.f), y1 = Math.round(m.d * (iy + 1) * s + m.f);
    ctx.drawImage(tile.canvas, x0, y0, x1 - x0, y1 - y0);
  }

  // 前もって作っておく（自己紹介を書いている間の空いた時間など）
  prepare(x, y, radius) {
    const s = this.size, n = this.n;
    for (let ix = Math.floor((x - radius) / s); ix <= Math.floor((x + radius) / s); ix++) {
      for (let iy = Math.floor((y - radius) / s); iy <= Math.floor((y + radius) / s); iy++) {
        const tx = ((ix % n) + n) % n, ty = ((iy % n) + n) % n;
        if (!this.trail.rangesOf(tx, ty) || this.cache.has(tx * n + ty)) continue;
        const tile = this.#build(tx, ty);
        if (tile) tile.seen = -1;
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
    // 作れなかったら（メモリ不足など）、古い区画を捨て、解像度を 1 倍に下げる。その区画は座標データから直接描く
    if (!tile) {
      this.maxScale = 1;
      this.clear();
      this.setScale(this.dpr);
      return null;
    }
    tile.g.setTransform(1, 0, 0, 1, 0, 0);
    tile.g.clearRect(0, 0, this.px, this.px);
    tile.g.setTransform(this.k, 0, 0, this.k, -tx * this.size * this.k, -ty * this.size * this.k);
    this.#render(tile.g, tx, ty, 0, 0);
    this.cache.set(tx * this.n + ty, tile);
    return tile;
  }

  #create() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = this.px;
    const g = canvas.getContext("2d");
    if (!g) { canvas.width = canvas.height = 0; return null; }
    return { canvas, g, seen: 0 };
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
    let style = null, open = false, lastI = -2, lastSx = 0, lastSy = 0;
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
        // 前の線分と写しが違うときは、つなげずに描き始める
        if (lastI !== i - 1 || sx !== lastSx || sy !== lastSy) g.moveTo(x0 + sx, y0 + sy);
        g.lineTo(x1 + sx, y1 + sy);
        lastI = i; lastSx = sx; lastSy = sy;
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
        g.setTransform(this.k, 0, 0, this.k, -ix * s * this.k, -iy * s * this.k);
        g.lineCap = "round"; g.strokeStyle = color; g.lineWidth = width;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
    }
  }
}
