// src/ をビルドして html/ へ書き出す（仕様は docs/spec.md の「ビルドと依存関係」）
// - JS と CSS は esbuild でまとめ、ファイル名に中身のハッシュを入れる（1 年キャッシュするため）
// - HTML の中のファイル名は、このスクリプトで書き換える
// - src/public/ のファイルは、そのまま html/ へ写す
// 使い方: node scripts/build.mjs（ビルド） / node scripts/build.mjs --serve（開発用。自分の PC の中だけで配信）
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = new URL("../", import.meta.url);
const src = new URL("src/", root);
const out = new URL("html/", root);
const serve = process.argv.includes("--serve");

const options = {
  entryPoints: [fileURLToPath(new URL("main.js", src)), fileURLToPath(new URL("style.css", src))],
  outdir: fileURLToPath(out),
  bundle: true,
  minify: !serve,
  sourcemap: serve,
  format: "esm",
  // 対応する環境の下限（spec.md の「対応する環境」）
  target: ["chrome111", "edge111", "firefox113", "safari15.4"],
  entryNames: "[name].[hash]",
  assetNames: "assets/[name].[hash]",
  loader: { ".woff2": "file" },
  metafile: true,
  logLevel: "info",
  plugins: [{
    name: "html",
    setup(build) {
      build.onEnd(async (result) => {
        if (result.errors.length) return;
        await writeHtml(result.metafile);
      });
    },
  }],
};

// 書き出したファイルの名前（ハッシュ付き）を、HTML の中の main.js・style.css と置き換える
async function writeHtml(metafile) {
  const names = {};
  for (const [file, info] of Object.entries(metafile.outputs)) {
    if (!info.entryPoint) continue;
    const name = info.entryPoint.split("/").pop();
    names[name] = file.split("/").pop();
  }
  let html = await readFile(new URL("index.html", src), "utf8");
  for (const [name, hashed] of Object.entries(names)) {
    if (!html.includes(`"${name}"`)) throw new Error(`index.html に "${name}" がない`);
    html = html.replaceAll(`"${name}"`, `"${hashed}"`);
  }
  await writeFile(new URL("index.html", out), html);
}

// 前回のハッシュ付きのファイルが残らないように、html/ を空にしてから書き出す
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
// .gitkeep などドットで始まるファイルは写さない（Nginx でも 404 にする）
await cp(new URL("public/", src), out, { recursive: true, filter: (from) => !basename(from).startsWith(".") });

if (serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  // ネットワークへ公開しないよう、自分の PC の中（127.0.0.1）だけで待ち受ける
  const { port } = await ctx.serve({ host: "127.0.0.1", port: 8000, servedir: fileURLToPath(out) });
  console.log(`http://127.0.0.1:${port}/`);
} else {
  await esbuild.build(options);
}
