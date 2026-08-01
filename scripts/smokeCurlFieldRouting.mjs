// 자계 벡터장 → ∇×H=J·∇·J·∇·H=0 (임용 2025 B-11) 라우팅·물리 검증 (API 호출 없음)
//   ★ 형제 항목 curl_from_line_integral(∮H·dl 폐경로 선적분)과 서로 뺏지 않아야 한다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeCurlFieldRouting.mjs
import { classifyElectromagnetics } from "../lib/analysis/classifyElectromagnetics.ts";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";

const newType = {
  topic: "자계의 회전과 전류 밀도",
  interpretation: "자유 공간의 자계 H가 주어질 때 ∇×H = J로 전류 밀도를 구하고, J의 발산과 원점에서의 크기로 상수 n을 구한 뒤, 모든 좌표에서 ∇·H = 0이 되는 m을 구한다.",
  relatedConcepts: ["전류 밀도", "발산", "회전", "자계"],
  fillInTheBlanks: [],
};
const lineIntegral = {
  topic: "정사각형 폐경로 선적분과 자계의 회전",
  interpretation: "자계 H = 20x²a_z 속의 한 변 ℓ인 정사각형 폐경로를 따라 ∮H·dl을 구하고, 면적으로 나눈 값과 면의 단위 벡터 a_n을 구한 뒤 ∇×H를 구한다.",
  relatedConcepts: ["선적분", "폐경로", "정사각형", "회전"],
  fillInTheBlanks: [],
};

let pass = 0;
const t1 = classifyElectromagnetics(newType);
const t2 = classifyElectromagnetics(lineIntegral);
const c1 = t1 === "curl_field_current_density";
const c2 = t2 === "curl_from_line_integral";
if (c1) pass++; if (c2) pass++;
console.log(`${c1 ? "✓" : "✗"} 신규(벡터장 직접 미분) → ${t1}`);
console.log(`${c2 ? "✓" : "✗"} [회귀] 폐경로 선적분 → ${t2}`);

// 물리 검산 — 유사/변형 각각
for (const mode of ["exam_similar", "exam_variant"]) {
  const inst = generateElectromagnetics({ seed: 3, mode, entryId: "curl_field_current_density" });
  const a = inst.answer;
  // 문자열 포함 검사 — LaTeX 백슬래시가 많아 정규식보다 안전하다.
  const ok =
    a.includes("cdot") && a.includes("{J}=0") &&   // ∇·J = 0
    a.includes("m=0") &&                            // 단계 3
    a.includes("{a}_x") &&                          // J의 a_x 성분
    !/n[0-9]/.test(a);                              // 계수 순서 버그(n2e^{2x}) 재발 방지
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${mode} 정답: ${a.replace(/\n/g, " / ").slice(0, 120)}`);
}
console.log(`${pass}/4 ${pass === 4 ? "PASS" : "FAIL"}`);
process.exit(pass === 4 ? 0 : 1);
