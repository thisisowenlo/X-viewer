import * as esbuild from "esbuild";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";

const META_URL =
  process.env.META_URL ?? "https://your-host.example/api/x-graphql-meta.json";

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
bundled = bundled.replaceAll("__META_URL__", META_URL);

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

console.log(`META_URL: ${META_URL}`);
console.log(`Bookmarklet: ${bookmarklet.length} bytes`);
