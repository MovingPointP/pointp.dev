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

// 線分（太さの半分 pad を含む）が世界の端からはみ出す分を、反対側に描くためのずらし量を順に渡す（0, 0 を含む）
export function forEachCopy(x0, y0, x1, y1, pad, side, fn) {
  const sx = Math.min(x0, x1) - pad < 0 ? side : Math.max(x0, x1) + pad > side ? -side : 0;
  const sy = Math.min(y0, y1) - pad < 0 ? side : Math.max(y0, y1) + pad > side ? -side : 0;
  fn(0, 0);
  if (sx) fn(sx, 0);
  if (sy) fn(0, sy);
  if (sx && sy) fn(sx, sy);
}
