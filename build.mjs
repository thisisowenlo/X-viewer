import * as esbuild from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";

// Treat empty string as missing too (?? only catches null/undefined).
const META_URL =
  process.env.META_URL ||
  "https://your-host.example/api/x-graphql-meta.json";

const result = await esbuild.build({
  entryPoints: ["src/bookmarklet.js"],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020"],
  write: false,
  legalComments: "none",
  charset: "utf8",
});

let bundled = result.outputFiles[0].text.trim();
if (bundled.endsWith(";")) bundled = bundled.slice(0, -1);
const beforeCount = (bundled.match(/__META_URL__/g) || []).length;
bundled = bundled.replaceAll("__META_URL__", META_URL);
const afterCount = (bundled.match(/__META_URL__/g) || []).length;
if (beforeCount === 0 || afterCount > 0) {
  console.error(
    `FATAL: __META_URL__ substitution failed (before=${beforeCount}, after=${afterCount})`,
  );
  process.exit(1);
}

const bookmarklet = "javascript:" + encodeURIComponent(bundled);

const html = (await readFile("src/index.template.html", "utf8")).replaceAll(
  "%BOOKMARKLET%",
  bookmarklet,
);

await mkdir("public/api", { recursive: true });
await writeFile("public/index.html", html);
await writeFile("public/bookmarklet.txt", bookmarklet + "\n");
await copyFile("src/meta.json", "public/api/x-graphql-meta.json");
await writeFile(
  "public/_headers",
  "/api/x-graphql-meta.json\n  Access-Control-Allow-Origin: *\n  Cache-Control: max-age=300\n",
);

const buildInfo = {
  metaUrl: META_URL,
  builtAt: new Date().toISOString(),
  bookmarkletBytes: bookmarklet.length,
  commit: process.env.GITHUB_SHA ?? null,
  ref: process.env.GITHUB_REF ?? null,
};
await writeFile("public/build-info.json", JSON.stringify(buildInfo, null, 2));

console.log(`META_URL: ${META_URL}`);
console.log(`Bookmarklet: ${bookmarklet.length} bytes`);
console.log(`Substituted ${beforeCount} placeholder(s)`);
