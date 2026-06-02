/**
 * 자동 보정 smoke test (2026-06-03) — 본문 전원 식 교차 검증 + 2회 추출 선택.
 *
 * 배경: Vision 추출이 stochastic — 임용 11번에서 V 값을 18로(전류원 값 복사), I 값을
 *  "I=15cos(...)"(환각)로 추출하거나 R을 통째로 누락하는 일이 실행마다 발생.
 *  본문에 인쇄된 "v(t)=9cos(ωt+90°)와 i(t)=18cos(ωt+90°)"가 그림 라벨보다 정확하므로
 *  이를 최종 기준으로 V/I 값·종류를 결정론 교정한다.
 *
 * 검증 (전부 GPT 호출 없는 결정론 단위 테스트):
 *  [1] parseSourceExpression — cos/sin/음수 진폭/위상 파싱
 *  [2] applySourceExpressions 케이스 A — 종류별 개수 일치 → 값 교정
 *  [3] applySourceExpressions 케이스 B — V↔I 오인 → 진폭 매칭 종류 재배정
 *  [4] pickBetterInventory — 소자 수 많은 쪽 채택
 *
 * 실행: npx tsx scripts/smokeSourceTextCorrection.mjs
 */
import {
  parseSourceExpression,
  applySourceExpressions,
  pickBetterInventory,
} from "../lib/analysis/extractComponentInventory.ts";

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail !== undefined ? ` (${detail})` : ""}`);
  if (!ok) failures += 1;
}

// ─── [1] parseSourceExpression ───────────────────────────────────────────────
console.log("[1] parseSourceExpression — 시간영역 식 → 페이저");
const p1 = parseSourceExpression("v(t)=9cos(ωt+90°)");
check('v(t)=9cos(ωt+90°) → V 9∠90°V', p1?.kind === "V" && p1?.phasorValue === "9∠90°V", p1?.phasorValue);
const p2 = parseSourceExpression("i(t)=18cos(ωt+90°)");
check('i(t)=18cos(ωt+90°) → I 18∠90°A', p2?.kind === "I" && p2?.phasorValue === "18∠90°A", p2?.phasorValue);
const p3 = parseSourceExpression("v(t)=10sin(ωt)");
check('v(t)=10sin(ωt) → V 10∠-90°V (sin은 cos 기준 -90°)', p3?.phasorValue === "10∠-90°V", p3?.phasorValue);
const p4 = parseSourceExpression("v_s(t) = 20 cos(wt - 45)");
check('v_s(t)=20cos(wt-45) → V 20∠-45°V (공백·w 표기·아래첨자)', p4?.phasorValue === "20∠-45°V", p4?.phasorValue);
const p5 = parseSourceExpression("i(t)=-5cos(ωt)");
check('i(t)=-5cos(ωt) → I 5∠180°A (음수 진폭 → +180°)', p5?.phasorValue === "5∠180°A", p5?.phasorValue);
const p6 = parseSourceExpression("아무 의미 없는 텍스트");
check("비전원 텍스트 → null", p6 === null);

// ─── [2] 케이스 A — 종류별 개수 일치 → 값 교정 ──────────────────────────────
console.log("\n[2] applySourceExpressions 케이스 A — 값 교정");
// 임용 11번 실제 오추출 (2026-06-03 17:24 로그): V 값 18(오류), I 값 환각
const wrongValues = [
  { id: "V1", type: "V", value: "18∠90°V", pins: ["a", "GND"] },     // 18 → 9이어야 함
  { id: "I1", type: "I", value: "I=15cos(ωt+90°)", pins: ["n1", "GND"] }, // 15는 환각 → 18
  { id: "L1", type: "L", value: "j3Ω", pins: ["n2", "n3"] },
  { id: "C1", type: "C", value: "-j3Ω", pins: ["n3", "n4"] },
];
const expressions = ["v(t)=9cos(ωt+90°)", "i(t)=18cos(ωt+90°)"];
const correctedA = applySourceExpressions(wrongValues, expressions);
const vA = correctedA.find((c) => c.id === "V1");
const iA = correctedA.find((c) => c.id === "I1");
check("V1 값: 18∠90°V → 9∠90°V", vA?.value === "9∠90°V", vA?.value);
check("I1 값: 환각 → 18∠90°A", iA?.value === "18∠90°A", iA?.value);
check("L·C는 그대로", correctedA.find((c) => c.id === "L1")?.value === "j3Ω" && correctedA.find((c) => c.id === "C1")?.value === "-j3Ω");
check("pins 보존", JSON.stringify(vA?.pins) === JSON.stringify(["a", "GND"]));

// ─── [3] 케이스 B — V↔I 오인 → 진폭 매칭 재배정 ─────────────────────────────
console.log("\n[3] applySourceExpressions 케이스 B — V↔I 오인 교정");
// 2026-06-02 회귀 케이스: 전류원이 V로 오인돼 V 2개·I 0개로 추출됨
const typeConfused = [
  { id: "V1", type: "V", value: "18∠90°V", pins: ["n1", "GND"] },  // 실제로는 전류원 (진폭 18 매칭)
  { id: "V2", type: "V", value: "9∠90°V", pins: ["n2", "GND"] },   // 진짜 전압원
  { id: "L1", type: "L", value: "j3Ω", pins: ["n1", "n2"] },
];
const correctedB = applySourceExpressions(typeConfused, expressions);
const b1 = correctedB.find((c) => c.id === "V1");
const b2 = correctedB.find((c) => c.id === "V2");
check("V1(18): V → I로 재배정 (진폭 18이 i식과 매칭)", b1?.type === "I" && b1?.value === "18∠90°A", `${b1?.type}=${b1?.value}`);
check("V2(9): V 유지 + 값 9∠90°V", b2?.type === "V" && b2?.value === "9∠90°V", `${b2?.type}=${b2?.value}`);
check("전원 종류 분포: V 1개 + I 1개", correctedB.filter((c) => c.type === "V").length === 1 && correctedB.filter((c) => c.type === "I").length === 1);

// ─── [4] pickBetterInventory ─────────────────────────────────────────────────
console.log("\n[4] pickBetterInventory — 더 완전한 추출 선택");
const run1 = [  // 4개 (R 누락 — 이번 사용자 테스트 케이스)
  { id: "V1", type: "V", value: "9∠90°V", pins: ["a", "GND"] },
  { id: "I1", type: "I", value: "18∠90°A", pins: ["n1", "GND"] },
  { id: "L1", type: "L", value: "j3Ω", pins: ["n2", "n3"] },
  { id: "C1", type: "C", value: "-j3Ω", pins: ["n3", "n4"] },
];
const run2 = [  // 6개 (어제 성공 케이스)
  ...run1,
  { id: "R1", type: "R", value: "2Ω", pins: ["n3", "n5"] },
  { id: "R2", type: "R", value: "0.25Ω", pins: ["n5", "GND"] },
];
const picked = pickBetterInventory(run1, run2);
check("6개 추출 쪽 채택", picked.length === 6, `${picked.length}개`);
const pickedReverse = pickBetterInventory(run2, run1);
check("순서 무관 — 여전히 6개 쪽", pickedReverse.length === 6, `${pickedReverse.length}개`);
const pickedWithEmpty = pickBetterInventory([], run1);
check("빈 추출 vs 4개 → 4개 쪽", pickedWithEmpty.length === 4, `${pickedWithEmpty.length}개`);

// ─── 결과 ─────────────────────────────────────────────────────────────────────
if (failures > 0) {
  console.log(`\n=== ${failures}개 검증 실패 ===`);
  process.exitCode = 1;
} else {
  console.log("\n=== PASS ===");
}
