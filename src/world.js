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
