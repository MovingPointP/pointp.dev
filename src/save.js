// 保存: 世界全体を 1 倍で、方眼の背景ごと PNG にする（ポイントは含めない）。仕様は docs/spec.md の「描画の方針」
// - 線は 1 フレーム約 4ms までずつ、数フレームに分けて描く（点P を止めないように）
// - 終わったら保存用のキャンバスを手放し、Blob URL も少し遅らせて手放す
import { COLOR, GRID, MAJOR } from "./tokens.js";
import { addLineWithCopies } from "./world.js";

const BUDGET_MS = 4;

// 成功したら true（画像を作れなかったら false）
export async function savePNG(snapshot, side) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = side;
  const g = canvas.getContext("2d");
  if (!g) return false;
  try {
    g.fillStyle = COLOR.paper;
    g.fillRect(0, 0, side, side);
    g.fillStyle = g.createPattern(gridTile(), "repeat");
    g.fillRect(0, 0, side, side);
    await drawLines(g, snapshot, side);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName(new Date());
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

// 方眼の 1 区切り（太い線の間隔 120px 四方）
function gridTile() {
  const c = document.createElement("canvas");
  c.width = c.height = MAJOR;
  const g = c.getContext("2d");
  g.fillStyle = COLOR.gridMinor;
  for (let v = 0; v < MAJOR; v += GRID) { g.fillRect(v, 0, 1, MAJOR); g.fillRect(0, v, MAJOR, 1); }
  g.fillStyle = COLOR.gridMajor;
  g.fillRect(0, 0, 1, MAJOR); g.fillRect(0, 0, MAJOR, 1);
  return c;
}

async function drawLines(g, { points, flags, count, styleOf }, side) {
  g.lineCap = "round"; g.lineJoin = "round";
  let i = 1;
  while (i < count) {
    const until = performance.now() + BUDGET_MS;
    let style = null;
    g.beginPath();
    for (; i < count && performance.now() < until; i++) {
      if (flags[i] & 1) continue;
      const st = styleOf(i);
      if (st !== style) { g.stroke(); g.beginPath(); style = st; g.strokeStyle = st.color; g.lineWidth = st.width; }
      // 端の近くの太い線は、はみ出した分を反対側にも描く（画面と同じく、つながって見えるように）
      addLineWithCopies(g, points[i * 2 - 2], points[i * 2 - 1], points[i * 2], points[i * 2 + 1], st.width / 2, side);
    }
    g.stroke();
    if (i < count) await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

// 例: pointp-20261105-142530.png
function fileName(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `pointp-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.png`;
}
