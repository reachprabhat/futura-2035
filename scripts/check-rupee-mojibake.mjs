import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const bad = String.fromCodePoint(0x00e2, 0x201a, 0x00b9);
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".html", ".css", ".json", ".md", ".svg"]);
const matches = [];
async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (extensions.has(path.slice(path.lastIndexOf(".")))) {
      const content = await readFile(path, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => { if (line.includes(bad)) matches.push(`${path}:${index + 1}: ${line}`); });
    }
  }
}
await walk("src");
await walk("convex");
await walk("public");
for (const path of ["index.html"]) {
  const content = await readFile(path, "utf8");
  if (content.includes(bad)) matches.push(`${path}: contains garbled rupee text`);
}
console.log(matches.length ? matches.join("\n") : "0 matches");
