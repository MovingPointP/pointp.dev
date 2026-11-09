// ポイントのスタンプの見た目。仕様は docs/spec.md の「ポイント」の「見た目」
// 11 種類を前もって小さな画像にしておき、毎フレームは回して貼るだけにする
import { COLOR, INKS } from "./tokens.js";

export const STAMP_SIZE = 56; // 直径
const ICON_SCALE = STAMP_SIZE / 40; // アイコンは 24px 四方の形を 1.4 倍にして描く

// アイコン: [パス, 線の太さ（0 なら塗る）]。中心が (0, 0)
const ICONS = {
  thicker: [["M-9.5 0h19", 4.5], ["M0 -4.5v-5.5M-3.2 -6.8L0 -10l3.2 3.2M0 4.5v5.5M-3.2 6.8L0 10l3.2 -3.2", 2]],
  thinner: [["M-9.5 0h19", 1.8], ["M0 -10.5v6M-3.2 -7.7L0 -4.5l3.2 -3.2M0 10.5v-6M-3.2 7.7L0 4.5l3.2 3.2", 2]],
  faster: [["M-8 5A9 9 0 0 1 0 -8.12", 1.5], ["M0 -8.12A9 9 0 0 1 8 5", 3.5], ["M0 4L5.5 -2.5", 2.2], ["M1.8 4a1.8 1.8 0 1 1 -3.6 0a1.8 1.8 0 1 1 3.6 0", 0]],
  slower: [["M-8 5A9 9 0 0 1 0 -8.12", 3.5], ["M0 -8.12A9 9 0 0 1 8 5", 1.5], ["M0 4L-5.5 -2.5", 2.2], ["M1.8 4a1.8 1.8 0 1 1 -3.6 0a1.8 1.8 0 1 1 3.6 0", 0]],
  clear: [["M-7 -5h14M-2 -5v-2h4v2M-5.5 -5l1 12h9l1 -12", 2], ["M-1.5 -1v5M1.5 -1v5", 1.5]],
  save: [["M0 -7v10M-4.5 -1.5L0 3l4.5 -4.5M-7 7h14", 2]],
};
const WARN = "M0 -8.5L8 5.5H-8z";
let warnPath = null;

// 種類ごとの画像（解像度は devicePixelRatio 2 まで）
export function makeStampSprites(dpr) {
  const scale = Math.min(2, dpr), pad = 4;
  const size = STAMP_SIZE + pad * 2, px = Math.ceil(size * scale);
  const sprites = {};
  const kinds = [...Object.keys(INKS).map((ink) => `color:${ink}`), ...Object.keys(ICONS)];
  for (const kind of kinds) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = px;
    const g = canvas.getContext("2d");
    g.setTransform(scale, 0, 0, scale, size / 2 * scale, size / 2 * scale);
    const r = STAMP_SIZE / 2;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = COLOR.paper; g.fill();
    g.strokeStyle = COLOR.muted; g.lineWidth = 1.5; g.stroke();
    g.beginPath(); g.arc(0, 0, r - 4 * ICON_SCALE, 0, Math.PI * 2);
    g.setLineDash([2, 2.5]); g.lineWidth = 0.75; g.stroke(); g.setLineDash([]);
    g.scale(ICON_SCALE, ICON_SCALE);
    if (kind.startsWith("color:")) {
      g.beginPath(); g.arc(0, 0, 6, 0, Math.PI * 2); g.fillStyle = INKS[kind.slice(6)]; g.fill();
    } else {
      g.lineCap = "round"; g.lineJoin = "round";
      for (const [d, w] of ICONS[kind]) {
        const path = new Path2D(d);
        if (w === 0) { g.fillStyle = COLOR.muted; g.fill(path); }
        else { g.strokeStyle = COLOR.muted; g.lineWidth = w; g.stroke(path); }
      }
    }
    sprites[kind] = { canvas, size };
  }
  return sprites;
}

// 全消去の注意マーク（スタンプの右上。スタンプと一緒には回さない）
export function drawWarning(g, x, y) {
  g.save();
  g.translate(x, y); g.scale(ICON_SCALE, ICON_SCALE);
  warnPath ??= new Path2D(WARN);
  const path = warnPath;
  g.fillStyle = COLOR.warning; g.fill(path);
  g.strokeStyle = COLOR.text; g.lineWidth = 1.25; g.lineJoin = "round"; g.stroke(path);
  g.beginPath(); g.moveTo(0, -3); g.lineTo(0, 0.5); g.lineWidth = 1.5; g.lineCap = "round"; g.stroke();
  g.beginPath(); g.arc(0, 3, 0.9, 0, Math.PI * 2); g.fillStyle = COLOR.text; g.fill();
  g.restore();
}
