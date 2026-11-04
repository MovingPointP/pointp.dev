// 自己紹介「I'm pointp / Always moving」の一筆書きの SVG を作る
// Hershey フォント cursive の文字の形を使い、ペンを離す所（i の点・t の横棒・アポストロフィ・単語や行の間）を
// 曲線でつないで 1 本のパスにする。仕様は docs/spec.md の「最初の流れ（自己紹介）」
// 使い方: node tools/intro/build.mjs → tools/intro/intro.svg
import { readFileSync, writeFileSync } from "node:fs";

const { chars } = JSON.parse(readFileSync(new URL("./cursive.json", import.meta.url), "utf8"));

// [文字列, 行の書き始めの x]。2 行目は右へずらす
const lines = [["I'm pointp", 0], ["Always moving", 60]];
const LINE_HEIGHT = 40;
const SPACE = 10;
// フォントの文字幅（o）から送り幅への倍率。hersheytext の描画に合わせる
const ADVANCE = 1.68;

// ペンを離すごとに区切った折れ線の一覧にする
function strokes() {
  const list = [];
  let space = false;
  lines.forEach(([text, x0], row) => {
    let x = x0, newLine = row > 0;
    const y = row * LINE_HEIGHT;
    for (const ch of text) {
      if (ch === " ") { x += SPACE; space = true; continue; }
      const c = chars[ch];
      for (const part of c.d.split("M").filter(Boolean)) {
        const pts = part.replace("L", " ").trim().split(/\s+/).map((p) => p.split(",").map(Number)).map(([px, py]) => [px + x, py + y]);
        pts.wordStart = space;
        pts.newLine = newLine;
        space = newLine = false;
        list.push(pts);
      }
      x += Number(c.o) * ADVANCE;
    }
  });
  return list;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (a, b) => { const l = dist(a, b) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
const f = (n) => +n.toFixed(2);

// 折れ線をなめらかな曲線にする（Catmull-Rom → 3 次ベジェ）
function smooth(pts) {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

// 前の線の終わりと次の線の始めをつなぐ
function connector(prev, next) {
  const a = prev[prev.length - 1], b = next[0];
  const len = dist(a, b);
  if (len < 0.01) return "";
  const ta = unit(prev[prev.length - 2] || a, a), tb = unit(b, next[1] || b);
  // 行が変わるとき: 下へ向かって出て、次の文字の書き始めの向きに沿って入る
  if (next.newLine) return ` C${f(a[0])},${f(a[1] + 10)} ${f(b[0] - tb[0] * 14)},${f(b[1] - tb[1] * 14)} ${f(b[0])},${f(b[1])}`;
  // 単語の間: ベースラインの下へ少したわませる
  if (next.wordStart) {
    const base = Math.max(a[1], b[1]) + 5, w = Math.abs(b[0] - a[0]) * 0.35;
    return ` C${f(a[0] + w)},${f(base)} ${f(b[0] - w)},${f(base)} ${f(b[0])},${f(b[1])}`;
  }
  // それ以外: 線の向きに沿ってつなぐ
  const k = len * 0.4;
  return ` C${f(a[0] + ta[0] * k)},${f(a[1] + ta[1] * k)} ${f(b[0] - tb[0] * k)},${f(b[1] - tb[1] * k)} ${f(b[0])},${f(b[1])}`;
}

const list = strokes();
let d = `M${list[0][0][0]},${list[0][0][1]}` + smooth(list[0]);
for (let i = 1; i < list.length; i++) d += connector(list[i - 1], list[i]) + smooth(list[i]);

// 表示範囲は座標の最小・最大から決める（制御点も含むので少し広め）
const nums = [...d.matchAll(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g)].map((m) => [+m[1], +m[2]]);
const [x0, x1] = [Math.min(...nums.map((p) => p[0])) - 2, Math.max(...nums.map((p) => p[0])) + 2];
const [y0, y1] = [Math.min(...nums.map((p) => p[1])) - 2, Math.max(...nums.map((p) => p[1])) + 2];
writeFileSync(new URL("./intro.svg", import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(x1 - x0)} ${f(y1 - y0)}"><path d="${d}" fill="none" stroke="#1f2d5c" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`);
