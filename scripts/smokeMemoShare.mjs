/**
 * 오답 메모지 공유 스모크 — 문제 생성 화면과 랜덤문제 풀기가 **같은 메모지**를 쓰는가.
 *
 *   npm run start        # 또는 npm run dev
 *   node scripts/smokeMemoShare.mjs
 *
 * ★★ 이 스크립트는 **사용자 데이터를 절대 건드리지 않는다.**
 *   처음 만들 때 "메모 글이 비어 있으면 원래 없던 레코드"로 잘못 판정해 복구 단계에서
 *   실제 풀이 사진이 든 레코드를 지웠다(실측 사고). 판정은 **레코드 존재 여부**로 해야 한다.
 *   지금은 아예 쓰기를 하지 않고, 어느 기존 레코드와도 겹치지 않는 **가짜 키**로만 왕복한다.
 */

import { readFileSync } from "node:fs";

const B = process.env.BASE ?? "http://localhost:3000";
let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) { pass += 1; console.log("  OK   " + n); } else { fail += 1; console.log("  FAIL " + n + "  " + e); } };

/** 앱과 **동일한** 키 계산 (lib/imageKey.ts의 djb2). 알고리즘이 갈리면 메모가 안 보인다. */
const keyOf = (b64) => { let h = 5381; for (let i = 0; i < b64.length; i += 1) h = ((h << 5) + h + b64.charCodeAt(i)) | 0; return `img${(h >>> 0).toString(36)}`; };
const norm = (s) => (s.startsWith("data:") && s.indexOf(",") >= 0 ? s.slice(s.indexOf(",") + 1) : s);
const keyFromUrl = async (u) => keyOf(Buffer.from(await (await fetch(B + u)).arrayBuffer()).toString("base64"));

for (let i = 0; i < 90; i++) { try { const r = await fetch(B); if (r.status === 200) break; } catch {} await new Promise((r) => setTimeout(r, 2000)); }

const saved = JSON.parse(readFileSync("data/original-solutions.json", "utf-8"));
const savedCount = Object.keys(saved).length;
const idx = await (await fetch(`${B}/api/shots`)).json();
const shots = idx.items.filter((i) => i.src === "shot");

console.log(`\n저장된 메모 ${savedCount}건 · 랜덤문제 기출 ${shots.length}문항\n`);

console.log("[랜덤문제 문항이 기존 메모와 연결되는가]");
let linked = 0;
const samples = [];
for (const it of shots) {
  const k = await keyFromUrl(it.qPages[0].url);
  if (saved[k]) { linked += 1; if (samples.length < 3) samples.push(`${it.label} → ${k}`); }
}
ok(`기출 ${linked}문항에 기존 메모가 붙는다`, linked >= 150, `-> ${linked}`);
ok("저장된 메모가 하나도 빠짐없이 연결됨", linked === savedCount, `-> ${linked} vs ${savedCount}`);
samples.forEach((s) => console.log("       " + s));

console.log("\n[두 화면이 같은 키를 만드는가]");
const target = shots[0];
const bytes = Buffer.from(await (await fetch(B + target.qPages[0].url)).arrayBuffer());
const kRandom = keyOf(bytes.toString("base64"));                         // 랜덤문제: 이미지 URL에서
const kGenerate = keyOf(norm(`data:image/png;base64,${bytes.toString("base64")}`)); // 생성화면: data URL로 받아 정규화
ok(`같은 사진 → 같은 키 (${kRandom})`, kRandom === kGenerate, `-> ${kRandom} vs ${kGenerate}`);
ok("data URL 접두사가 키를 흔들지 않는다", keyOf(norm(`data:image/png;base64,AAA`)) === keyOf("AAA"));

console.log("\n[저장 → 다른 화면에서 읽기 (가짜 키로만, 사용자 데이터 무영향)]");
// 실제 이미지와 절대 충돌하지 않는 키를 쓴다.
const probe = `img__smoke_${Date.now().toString(36)}`;
ok("가짜 키가 기존 레코드와 겹치지 않는다", !saved[probe]);
const memo = "__스모크_공유검증";
const put = await fetch(`${B}/api/solutions`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ key: probe, imageData: "", imageName: "", memo, generated: [] }),
});
ok("메모 저장 200", put.ok, `-> ${put.status}`);
const read = await (await fetch(`${B}/api/solutions?key=${probe}`)).json();
ok("같은 키로 읽으면 그 메모가 나온다", read.solution?.memo === memo, `-> ${JSON.stringify(read).slice(0, 100)}`);

// 정리 — ★ 이 키는 스모크가 방금 **직접 만든 것**이므로 지워도 안전하다.
await fetch(`${B}/api/solutions?key=${probe}`, { method: "DELETE" });
ok("스모크 레코드 삭제됨", !(await (await fetch(`${B}/api/solutions?key=${probe}`)).json()).solution);

const after = Object.keys(JSON.parse(readFileSync("data/original-solutions.json", "utf-8"))).length;
ok(`사용자 메모 건수 보존 (${savedCount})`, after === savedCount, `-> ${after}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
