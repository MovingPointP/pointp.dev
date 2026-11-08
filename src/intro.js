// 自己紹介の曲線を、点P が書くための折れ線にする
import { INTRO, X_HEIGHT } from "./intro-data.js";
import { INTRO_MAX, INTRO_X_HEIGHT } from "./tokens.js";

const STEPS = 12; // 曲線 1 本を何本の線分に分けるか（405 本 × 12 で約 5,000 点。1ms 未満で終わる）

// 世界の中心に置いた折れ線を返す。points は [x0, y0, x1, y1, …]、lengths は先頭からの長さの累計
export function buildIntro(side) {
  const local = flatten();
  const bbox = bounds(local);
  // 大きさは字の大きさで決める（小文字の高さを線の太さの約 3.5 倍）。横幅は世界の 1 辺の 60% まで
  const scale = Math.min(INTRO_X_HEIGHT / X_HEIGHT, side * INTRO_MAX / bbox.width);
  const ox = side / 2 - (bbox.x + bbox.width / 2) * scale;
  const oy = side / 2 - (bbox.y + bbox.height / 2) * scale;
  const count = local.length / 2;
  const points = new Float32Array(local.length);
  const lengths = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    points[i * 2] = ox + local[i * 2] * scale;
    points[i * 2 + 1] = oy + local[i * 2 + 1] * scale;
    if (i > 0) lengths[i] = lengths[i - 1] + Math.hypot(points[i * 2] - points[i * 2 - 2], points[i * 2 + 1] - points[i * 2 - 1]);
  }
  return {
    points,
    lengths,
    count,
    total: lengths[count - 1],
    rect: { cx: side / 2, cy: side / 2, width: bbox.width * scale, height: bbox.height * scale },
  };
}

// 3 次ベジェ曲線を線分に分ける
function flatten() {
  const out = [INTRO[0], INTRO[1]];
  for (let i = 2; i + 5 < INTRO.length; i += 6) {
    const x0 = out[out.length - 2], y0 = out[out.length - 1];
    const [x1, y1, x2, y2, x3, y3] = INTRO.slice(i, i + 6);
    for (let s = 1; s <= STEPS; s++) {
      const t = s / STEPS, u = 1 - t;
      out.push(
        u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      );
    }
  }
  return out;
}

function bounds(pts) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
    minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
