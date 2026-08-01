/**
 * "왜 이 문제가 생성됐나?" — 마지막 생성의 결정 경로를 한 번에 출력.
 *
 * ★ 이 스크립트를 만든 이유: 원인 특정에 매번 여러 번의 왕복(로그 grep → 배지 질문 → 재현)이
 *   필요했다. 이제 생성 시 `routing_summary` 한 줄이 남고, 이 스크립트가 그것과 주변 신호
 *   (분석 topic·분류·재분류·보정·에러)를 모아 읽어준다.
 *
 * 사용:  node scripts/whyLastGeneration.mjs [개수]
 */
import { readFileSync } from "node:fs";

const LOG = ".next/dev/logs/next-development.log";
const N = Number(process.argv[2] ?? 1);

let raw;
try {
  raw = readFileSync(LOG, "utf8");
} catch {
  console.log(`로그 파일이 없습니다: ${LOG} (dev 서버를 한 번 실행해야 생깁니다)`);
  process.exit(0);
}

/** 로그 한 줄에서 이스케이프된 JSON payload를 최대한 복원. */
function unescape(s) {
  return s.replace(/\\+"/g, '"').replace(/\\+n/g, " ");
}
function pick(pattern, count = 1) {
  const re = new RegExp(pattern, "g");
  const hits = [...raw.matchAll(re)].map((m) => unescape(m[0]));
  return hits.slice(-count);
}

console.log("═".repeat(70));
console.log(" 마지막 생성의 결정 경로");
console.log("═".repeat(70));

const summaries = pick('routing_summary[^}]{0,400}}', N);
if (summaries.length === 0) {
  console.log("routing_summary가 없습니다 — 이 코드가 반영된 뒤 생성한 기록이 없습니다.");
} else {
  for (const s of summaries) {
    const fields = {};
    for (const m of s.matchAll(/"(\w+)":\s*"?([^",}]+)"?/g)) fields[m[1]] = m[2];
    console.log(`  과목            : ${fields.subject ?? "?"}`);
    console.log(`  캐시된 분류     : ${fields.cachedType ?? "?"}   ← 브라우저가 들고 있던 값`);
    console.log(`  재분류 결과     : ${fields.reclassified ?? "-"}`);
    console.log(`  적용된 보정     : ${fields.coercions ?? "-"}`);
    console.log(`  보정 건너뜀     : ${fields.coercionSkipped ?? "-"}   (전용 분류면 안전망 미개입)`);
    console.log(`  ★ 최종 유형     : ${fields.finalType ?? "?"}`);
    console.log(`  topicKey        : ${fields.topicKey ?? "?"}`);
    console.log(`  생성된 figure   : ${fields.figures ?? "-"}`);
    console.log(`  검증 이슈       : ${fields.totalIssues ?? "?"} (mode=${fields.mode ?? "?"})`);
  }
}

console.log("─".repeat(70));
const topic = pick('analyzeImage\\] \\\\*"완료[^,]{0,90}', 1);
if (topic.length) console.log(` 분석 topic     : ${topic[0].replace(/.*topic":?\s*"?/, "").slice(0, 70)}`);
const cls = pick('circuit_type_classified[^}]{0,90}}', 1);
if (cls.length) console.log(` 분석 시 분류   : ${cls[0].replace(/.*type":\s*"?/, "").slice(0, 60)}`);
const invFallback = pick('inventory_inferred_from_text[^}]{0,80}}', 1);
if (invFallback.length) console.log(` 인벤토리 합성 : ${invFallback[0].slice(0, 80)}  ← Vision 추출 실패를 텍스트로 보완`);

const errs = pick('ERROR\\][^}]{0,120}', 3);
if (errs.length) {
  console.log("─".repeat(70));
  console.log(" 최근 에러");
  for (const e of errs) console.log(`  · ${e.slice(0, 110)}`);
}

console.log("═".repeat(70));
console.log(" 해석 가이드");
console.log("  · 캐시된 분류 ≠ 최종 유형  → 브라우저의 오래된 분석이 재분류로 교정된 것(정상)");
console.log("  · 캐시된 분류 = 최종 유형이고 기대와 다름 → 분석 텍스트에 그 유형의 신호가 없음");
console.log("    → 이미지를 다시 업로드해 분석을 새로 돌릴 것");
console.log("  · 적용된 보정에 예상 밖 이름이 있으면 그 안전망이 가로챈 것");
console.log("  · 생성된 figure의 diagramType이 전용 렌더러 이름인지 확인 (analog_netlist면 generic 경로)");
