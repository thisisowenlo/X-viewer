import * as esbuild from "esbuild";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const meta = JSON.parse(await readFile("src/meta.json", "utf8"));
const metaLiteral = JSON.stringify(meta);

async function bundle(entryPoint, { needsMeta = true } = {}) {
  const result = await esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    minify: true,
    format: "iife",
    target: ["es2020"],
    write: false,
    legalComments: "none",
    charset: "utf8",
    define: {
      META_INJECTED: metaLiteral,
    },
  });
  let out = result.outputFiles[0].text.trim();
  if (out.endsWith(";")) out = out.slice(0, -1);
  if (needsMeta && !out.includes(meta.queryId)) {
    console.error(`FATAL: queryId not found in ${entryPoint} bundle`);
    process.exit(1);
  }
  return out;
}

const bookmarkletBundle = await bundle("src/bookmarklet.js");
const bookmarklet = "javascript:" + encodeURIComponent(bookmarkletBundle);

// Shortcut path is DOM-scrape — doesn't touch the GraphQL API at all, so it
// doesn't need META baked in.
const shortcutBundle = await bundle("src/shortcut.js", { needsMeta: false });

const html = (await readFile("src/index.template.html", "utf8"))
  .replaceAll("%BOOKMARKLET%", bookmarklet)
  .replaceAll("%SHORTCUT_JS%", escapeForHtml(shortcutBundle))
  .replaceAll("%WORKER_JS%", escapeForHtml(await readFile("worker/index.js", "utf8")));

await mkdir("public", { recursive: true });
await writeFile("public/index.html", html);
await writeFile("public/bookmarklet.txt", bookmarklet + "\n");
await writeFile("public/shortcut.js", shortcutBundle + "\n");

const buildInfo = {
  queryId: meta.queryId,
  builtAt: new Date().toISOString(),
  bookmarkletBytes: bookmarklet.length,
  shortcutBytes: shortcutBundle.length,
  commit: process.env.GITHUB_SHA ?? null,
  ref: process.env.GITHUB_REF ?? null,
};
await writeFile("public/build-info.json", JSON.stringify(buildInfo, null, 2));

console.log(`queryId: ${meta.queryId}`);
console.log(`Bookmarklet: ${bookmarklet.length} bytes`);
console.log(`Shortcut JS: ${shortcutBundle.length} bytes`);

function escapeForHtml(s) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
