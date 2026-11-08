// アイコンと OGP 画像を作る。仕様は docs/spec.md の「言語と検索・SNS」
// Chrome のヘッドレスで HTML を描いて PNG にし、src/public/ へ書き出す（Node の標準機能だけ）
// 使い方: node tools/assets/build.mjs（Chrome の場所は環境変数 CHROME で変えられる）
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const chrome = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const publicDir = new URL("../../src/public/", import.meta.url);
const work = mkdtempSync(join(tmpdir(), "pointp-assets-"));

const PAPER = "#fdfdfc", INK = "#1f2d5c", MINOR = "#d1f0fa", MAJOR = "#a9daed";

// アイコンの図柄: 紙の色に Black の点P と斜体の「P」。favicon.svg はそのまま配る
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="12" fill="${PAPER}"/>
<path d="M0 16H64M0 32H64M0 48H64M16 0V64M32 0V64M48 0V64" stroke="${MINOR}" stroke-width="1"/>
<circle cx="24" cy="40" r="13" fill="${PAPER}"/>
<circle cx="24" cy="40" r="10" fill="${INK}"/>
<text x="36" y="30" font-family="Georgia, serif" font-style="italic" font-weight="600" font-size="24" fill="${INK}" stroke="${PAPER}" stroke-width="4" paint-order="stroke" stroke-linejoin="round">P</text>
</svg>
`;
writeFileSync(new URL("favicon.svg", publicDir), icon);

// OGP 画像: 方眼の紙に自己紹介の字（noscript 用の SVG）。作り直したら OGP_NAME の版を上げる（SNS 側が古い画像を長く覚えているため）
const OGP_NAME = "ogp-v1.png";
const intro = readFileSync(new URL("intro.svg", publicDir), "utf8");
const ogp = `<!doctype html><html><head><style>
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
body { display: grid; place-items: center; background-color: ${PAPER};
  background-image: linear-gradient(${MAJOR} 1px, transparent 1px), linear-gradient(90deg, ${MAJOR} 1px, transparent 1px),
    linear-gradient(${MINOR} 1px, transparent 1px), linear-gradient(90deg, ${MINOR} 1px, transparent 1px);
  background-size: 120px 120px, 120px 120px, 24px 24px, 24px 24px; }
svg { width: 960px; height: auto; }
</style></head><body>${intro}</body></html>`;

// HTML を描いて PNG にする
function render(html, width, height, out) {
  const page = join(work, "page.html");
  writeFileSync(page, html);
  execFileSync(chrome, [
    "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1", `--window-size=${width},${height}`,
    `--user-data-dir=${join(work, "profile")}`, `--screenshot=${fileURLToPath(out)}`, pathToFileURL(page).href,
  ], { stdio: "ignore" });
}

const iconPage = (size) => `<!doctype html><html><head><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}svg{display:block;width:${size}px;height:${size}px}</style></head><body>${icon}</body></html>`;
render(iconPage(180), 180, 180, new URL("apple-touch-icon.png", publicDir));
const png32 = pathToFileURL(join(work, "favicon-32.png"));
render(iconPage(32), 32, 32, png32);
render(ogp, 1200, 630, new URL(OGP_NAME, publicDir));

// favicon.ico: 32px の PNG をそのまま 1 枚入れた ICO（ICO は中身に PNG を入れられる）
const png = readFileSync(png32);
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); // 予約・種類（アイコン）・枚数
header.writeUInt8(32, 6); header.writeUInt8(32, 7); header.writeUInt8(0, 8); header.writeUInt8(0, 9); // 幅・高さ・色数・予約
header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); // 面の数・1 画素のビット数
header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18); // 大きさ・位置
writeFileSync(new URL("favicon.ico", publicDir), Buffer.concat([header, png]));

rmSync(work, { recursive: true, force: true });
console.log(`favicon.svg, favicon.ico, apple-touch-icon.png, ${OGP_NAME}`);
