// 世界の大きさと、端がつながっていることの計算
import { MAJOR, WORLD_MAX, WORLD_SCALE } from "./tokens.js";

// 世界は正方形。1 辺は開いた時点の画面の長い辺の 2.5 倍を、方眼の太い線の間隔の倍数に丸める（上限あり）
export function worldSide(width, height) {
  const side = Math.round(Math.max(width, height) * WORLD_SCALE / MAJOR) * MAJOR;
  return Math.max(MAJOR, Math.min(WORLD_MAX, side));
}

// 0〜side に収める
export const wrap = (v, side) => ((v % side) + side) % side;

// 端がつながっているときの a − b（−side/2〜side/2）
export function wrapDiff(a, b, side) {
  const d = wrap(a - b, side);
  return d > side / 2 ? d - side : d;
}

// 線分をパスに足す。太さの半分 pad を含めて世界の端からはみ出す分は、反対側にも足す
export function addLineWithCopies(g, x0, y0, x1, y1, pad, side) {
  const sx = Math.min(x0, x1) - pad < 0 ? side : Math.max(x0, x1) + pad > side ? -side : 0;
  const sy = Math.min(y0, y1) - pad < 0 ? side : Math.max(y0, y1) + pad > side ? -side : 0;
  g.moveTo(x0, y0); g.lineTo(x1, y1);
  if (sx) { g.moveTo(x0 + sx, y0); g.lineTo(x1 + sx, y1); }
  if (sy) { g.moveTo(x0, y0 + sy); g.lineTo(x1, y1 + sy); }
  if (sx && sy) { g.moveTo(x0 + sx, y0 + sy); g.lineTo(x1 + sx, y1 + sy); }
}
