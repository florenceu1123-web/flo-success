import { readFileSync, writeFileSync } from "node:fs";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";
let html = `<html><head><meta charset="utf-8"><style>body{background:#fff;font-family:sans-serif;margin:0;padding:8px}h3{color:#1e3a8a;margin:6px}</style></head><body>`;
for (const m of ["exam_similar", "exam_variant"]) {
  const f = JSON.parse(readFileSync(`scripts/_curlfig_${m}.json`, "utf-8"));
  html += `<h3>${m}</h3>` + renderEmFieldDiagram(f.diagram);
}
html += `</body></html>`;
writeFileSync("scripts/_curl_render.html", html);
console.log("written");
