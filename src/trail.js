// 線（一筆書きの軌跡）の座標データ。仕様は docs/spec.md の「描画の方針」
// - 点は Float32Array に [x, y] で並べる（1 点 8 バイト。配列の配列にしない）
// - 線分 i は点 i−1 から点 i まで。点 i に BREAK が付いていたら、線分 i は描かない（端をまたいだ切れ目）
// - 最後の点（頭）は、向きが変わるまで動かして伸ばす（直進の間は点が増えない）
// - 区画ごとに、その区画を通る線分の番号の範囲（目次）を持つ
// - 線分 committed より後ろは、まだ区画やミニマップに描いていない進行中の線。毎フレーム上に重ねて描き、ある程度たまったら 1 回だけ描き足す
//   （毎フレーム描き足すと、同じふちを何度も塗ってふちが濃くなり、作り直した絵と変わるため）

const BREAK = 1;
const MAX_POINTS = 2_000_000; // 上限（16MB）。超えたら古い線から消す
const MIN_STEP = 2; // 向きが変わっても、前の点から 2px 未満なら点を足さない
const COMMIT_POINTS = 32; // 進行中の線の点がこれだけたまったら描き足す

// 線分 i の見た目（runs のうち start ≤ i の最後のもの）
export function styleAt(runs, i) {
  let lo = 0, hi = runs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (runs[mid].start <= i) lo = mid; else hi = mid - 1;
  }
  return runs[lo];
}

export class Trail {
  constructor(side, tileSize) {
    this.side = side;
    this.tileSize = tileSize;
    this.tiles = Math.round(side / tileSize);
    this.listeners = new Set();
    this.reset();
  }

  reset() {
    this.capacity = 16384;
    this.points = new Float32Array(this.capacity * 2);
    this.flags = new Uint8Array(this.capacity);
    this.count = 0;
    this.runs = []; // [{ start, color, width }]。線分 i の見た目は start ≤ i の最後の run
    this.index = new Map(); // 区画のキー → [開始, 終了, 開始, 終了, …]（線分の番号の範囲）
    this.turnPending = false;
    this.committed = 1; // 描き足していない最初の線分
  }

  // 描き足す相手（区画・ミニマップ）を登録する。線分 from〜end−1 を渡す（切れ目は含まない）
  onCommit(fn) { this.listeners.add(fn); }

  get headX() { return this.points[(this.count - 1) * 2]; }
  get headY() { return this.points[(this.count - 1) * 2 + 1]; }

  // 線を始める（最初の点と見た目）
  start(x, y, color, width) {
    this.runs.push({ start: this.count, color, width });
    this.#push(x, y, BREAK);
    this.#push(x, y, 0); // 頭
  }

  // 点を足す（自己紹介を書くときなど、決まった折れ線をなぞるとき）
  add(x, y) {
    this.#push(x, y, 0);
    this.#indexSegment(this.count - 1);
    this.#commitIfMany();
  }

  // 頭を動かして伸ばす。turned は向きが変わったか
  extend(x, y, turned) {
    // 前の点から 2px 未満で曲がったら、2px 進んでから角を打つ（角を打たないと、作り直したときに長い線全体がずれる）
    this.turnPending ||= turned;
    if (this.turnPending && this.#distanceFromPrev() >= MIN_STEP) { this.#freeze(); this.turnPending = false; this.#commitIfMany(); }
    const i = this.count - 1;
    this.points[i * 2] = x;
    this.points[i * 2 + 1] = y;
    this.#indexSegment(i);
  }

  // 見た目を変える（色・太さのポイントを通ったとき）。今の頭で線を区切り、そこから新しい見た目にする
  setStyle(color, width) {
    this.#freeze();
    this.#commit(this.count - 1);
    this.runs.push({ start: this.count - 1, color, width });
  }

  // 端をまたいだ: 今の線を世界の外の点で閉じ（呼ぶ前に extend 済み）、反対側から新しい線を始める
  wrapTo(fromX, fromY, toX, toY) {
    this.#commit(this.count);
    this.#push(fromX, fromY, BREAK);
    this.#push(toX, toY, 0);
    this.committed = this.count - 1;
    this.#indexSegment(this.count - 1);
  }

  get headPrevX() { return this.points[(this.count - 2) * 2]; }
  get headPrevY() { return this.points[(this.count - 2) * 2 + 1]; }

  styleOf(i) { return styleAt(this.runs, i); }

  // 進行中の線の見た目
  get liveStyle() { return this.styleOf(this.committed); }

  // 進行中の線（線分 committed〜頭）を、ずらしてパスに足す
  traceLive(g, sx, sy) {
    const pts = this.points;
    g.moveTo(pts[this.committed * 2 - 2] + sx, pts[this.committed * 2 - 1] + sy);
    for (let i = this.committed; i < this.count; i++) g.lineTo(pts[i * 2] + sx, pts[i * 2 + 1] + sy);
  }

  isBreak(i) { return (this.flags[i] & BREAK) !== 0; }

  // 区画（tx, ty）を通る線分の番号の範囲
  rangesOf(tx, ty) { return this.index.get(tx * this.tiles + ty); }

  // 点が上限を超えたら、古い 4 分の 1 を消す。true を返したら区画を作り直す
  // 目次は線分ごとに作り直さず、番号の範囲をずらすだけにする（1 フレームで終わるように）
  compactIfNeeded() {
    if (this.count < MAX_POINTS) return false;
    const drop = this.count >> 2;
    this.points.copyWithin(0, drop * 2, this.count * 2);
    this.flags.copyWithin(0, drop, this.count);
    this.count -= drop;
    this.committed = Math.max(1, this.committed - drop);
    this.flags[0] |= BREAK;
    this.runs = this.runs.map((r) => ({ ...r, start: Math.max(0, r.start - drop) }))
      .filter((r, k, all) => k === all.length - 1 || all[k + 1].start > r.start);
    for (const [key, ranges] of this.index) {
      const kept = [];
      for (let r = 0; r < ranges.length; r += 2) {
        const end = ranges[r + 1] - drop;
        if (end >= 1) kept.push(Math.max(1, ranges[r] - drop), end);
      }
      if (kept.length) this.index.set(key, kept); else this.index.delete(key);
    }
    return true;
  }

  #push(x, y, flag) {
    if (this.count === this.capacity) this.#grow();
    this.points[this.count * 2] = x;
    this.points[this.count * 2 + 1] = y;
    this.flags[this.count] = flag;
    this.count++;
  }

  #grow() {
    this.capacity *= 2;
    const points = new Float32Array(this.capacity * 2);
    points.set(this.points);
    const flags = new Uint8Array(this.capacity);
    flags.set(this.flags);
    this.points = points;
    this.flags = flags;
  }

  // 頭をその場に残し、同じ位置に新しい頭を作る（ここで線が折れる）
  #freeze() {
    this.#push(this.headX, this.headY, 0);
  }

  #distanceFromPrev() {
    return Math.hypot(this.headX - this.headPrevX, this.headY - this.headPrevY);
  }

  // 頭の手前まで（動かなくなった線分）がたまったら描き足す
  #commitIfMany() {
    if (this.count - 1 - this.committed >= COMMIT_POINTS) this.#commit(this.count - 1);
  }

  #commit(end) {
    if (end <= this.committed) return;
    const from = this.committed;
    this.committed = end;
    for (const fn of this.listeners) fn(from, end);
  }

  // 線分 i が通る区画に、番号 i を記録する
  #indexSegment(i) {
    const style = this.styleOf(i);
    const pad = style.width / 2 + 1;
    const x0 = this.points[i * 2 - 2], y0 = this.points[i * 2 - 1];
    const x1 = this.points[i * 2], y1 = this.points[i * 2 + 1];
    const t = this.tileSize, n = this.tiles;
    const ax = Math.floor((Math.min(x0, x1) - pad) / t), bx = Math.floor((Math.max(x0, x1) + pad) / t);
    const ay = Math.floor((Math.min(y0, y1) - pad) / t), by = Math.floor((Math.max(y0, y1) + pad) / t);
    for (let tx = ax; tx <= bx; tx++) {
      for (let ty = ay; ty <= by; ty++) {
        const key = (((tx % n) + n) % n) * n + (((ty % n) + n) % n);
        let ranges = this.index.get(key);
        if (!ranges) { ranges = []; this.index.set(key, ranges); }
        const last = ranges.length - 1;
        if (last > 0 && ranges[last] >= i - 1) ranges[last] = Math.max(ranges[last], i);
        else ranges.push(i, i);
      }
    }
  }
}
