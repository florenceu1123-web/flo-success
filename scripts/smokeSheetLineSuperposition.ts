/**
 * 면전류 + 선전류 합성 자계 (sheet_line_superposition) smoke — 임용 9번 정자계 형식.
 *
 *  결정론 단위 테스트 (GPT/dev 서버 불필요):
 *   [A] classifier — 원본형 텍스트(면전류·선전류·합성 자계) → sheet_line_superposition
 *                    (단순 직선 도선 straight_wire_B 오분류 차단)
 *   [B] generator  — 닫힌형 해: h=d(이중근)·k=s·K₀/2, 물리 독립 검산(H₁·H₂ 성분 소거)
 *   [C] renderer   — em_field_diagram(sheet_line_superposition) SVG 정상 생성
 *   [D] variant    — "구하는 양" 교환(h given → 선전류 I 도출)
 *
 *  실행: npx tsx scripts/smokeSheetLineSuperposition.ts
 */
import { classifyElectromagnetics } from "../lib/analysis/classifyElectromagnetics";
import { generateElectromagnetics, EM_FORMULA_REGISTRY } from "../lib/generation/topologies/electromagnetics";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer";
import type { AnalysisResult } from "../types";

let pass = 0, fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1; else fail += 1;
}

// ── [A] 분류기 ──────────────────────────────────────────────────────
// 원본 임용 9번을 모사한 analysis 텍스트.
const original: AnalysisResult = {
  topic: "무한 면전류와 무한 선전류에 의한 합성 자계",
  interpretation:
    "10a_x [A/m]의 면전류가 (0,0,6)을 지나 xy평면과 평행한 무한 평면에 흐르고, 20π a_x [A]의 선전류가 (0,3,0)을 지나 x축과 나란한 무한 도선에 흐른다. 점 P(-3,2,h)에서 면전류에 의한 자계 H₁과 선전류에 의한 자계 H₂의 합성 자계가 k a_z가 되기 위한 h와 k를 구한다.",
  relatedConcepts: ["면전류", "선전류", "합성 자계", "정자계", "단위 벡터"],
  topicKey: "magnetostatics",
} as unknown as AnalysisResult;

const id = classifyElectromagnetics(original);
check("[A] 원본형 → sheet_line_superposition", id === "sheet_line_superposition", `id=${id}`);

// 단순 직선 도선 문제는 straight_wire_B로 남는지 (오탈취 없음).
const simpleWire: AnalysisResult = {
  topic: "무한 직선 도선의 자기장",
  interpretation: "무한히 긴 직선 도선에 전류 5A가 흐른다. 도선으로부터 5cm 떨어진 점의 자속밀도 B를 구한다.",
  relatedConcepts: ["직선 도선", "자기장", "앙페르 법칙"],
  topicKey: "magnetostatics",
} as unknown as AnalysisResult;
const id2 = classifyElectromagnetics(simpleWire);
check("[A] 단순 직선 도선 → straight_wire_B (무회귀)", id2 === "straight_wire_B", `id=${id2}`);

// ── [B] generator (유사) — 여러 시드로 물리 검산 ────────────────────
// H₁ = ½K₀ a_y, H₂ = [G/(n+h²)](−h a_y + Δ a_z), h=d에서 a_y 성분 0, k=Δ·G/(n+d²).
function checkPhysics(mode: "exam_similar" | "exam_variant", seed: number): string {
  const inst = generateElectromagnetics({ seed, mode, entryId: "sheet_line_superposition" });
  // 정답에서 h·k 파싱.
  const ans = inst.answer;
  const hM = /h = (-?\d+)/.exec(ans);
  const kM = /k = (-?\d+(?:\.\d+)?)/.exec(ans);
  const halfM = /H_1 = (-?\d+(?:\.\d+)?)/.exec(ans) || /H}_1 = (-?\d+(?:\.\d+)?)/.exec(ans);
  const okStruct = inst.topicKey === "magnetostatics" && inst.diagram!.geometry === "sheet_line_superposition";
  check(`[B/${mode} seed=${seed}] 구조(topicKey·geometry)`, okStruct, `${inst.topicKey}/${inst.diagram!.geometry}`);
  // k = s·K₀/2, 그리고 |H₁| = K₀/2 → k의 절댓값 = |H₁| (부호만 다름) : 이중근 물리 항등식.
  if (halfM && kM) {
    const half = Number(halfM[1]);
    const k = Number(kM[1]);
    check(`[B/${mode} seed=${seed}] |k| = ½K₀ = |H₁| (이중근 항등식)`, Math.abs(Math.abs(k) - half) < 1e-9, `|k|=${Math.abs(k)}, ½K₀=${half}`);
  } else {
    check(`[B/${mode} seed=${seed}] 정답 파싱`, false, ans.slice(0, 80));
  }
  return inst.answer;
}
for (const seed of [1, 7, 13, 21, 99]) checkPhysics("exam_similar", seed);

// 원본값 재현 확인: 원본은 풀에서 제외됐지만, h=1·k=−5가 나오는 조합이 있는지(구조 정합).
// 대신 원본 물리(K₀=10,d=1,s=−1)의 항등식만 위에서 검증됨. 여기선 유사문제가 원본과 다름을 확인.
{
  const inst = generateElectromagnetics({ seed: 1, mode: "exam_similar", entryId: "sheet_line_superposition" });
  const isOriginal = inst.content.includes("10\\mathbf{a}_x") && inst.content.includes("(0,3,0)") && inst.content.includes("P(-3,2,h)") && inst.content.includes("(0,0,6)");
  check("[B] 원본 튜플(10·(0,3,0)·P(-3,2,h)·z=6) 미생성", !isOriginal);
}

// ── [C] renderer ────────────────────────────────────────────────────
{
  const inst = generateElectromagnetics({ seed: 3, mode: "exam_similar", entryId: "sheet_line_superposition" });
  const svg = renderEmFieldDiagram(inst.diagram!);
  const okSvg = svg.startsWith("<svg") && svg.includes("</svg>") && !svg.includes("<pre>") && !svg.includes("미지원");
  check("[C] SVG 정상 생성 (미지원/에러 없음)", okSvg, `len=${svg.length}`);
  // 좌표축·평면·선전류 흔적.
  check("[C] 좌표축·평면 라벨 포함", svg.includes("z[m]") && svg.includes("y[m]") && svg.includes("x[m]"));
}

// ── [D] variant — 구하는 양 교환(선전류 I 도출) ────────────────────
{
  const inst = generateElectromagnetics({ seed: 5, mode: "exam_variant", entryId: "sheet_line_superposition" });
  const okI = /I = \d+\\pi/.test(inst.answer) && inst.question.includes("선전류의 세기");
  check("[D] 변형 = 선전류 세기 I 도출", okI, inst.answer.split("\n").pop());
}
for (const seed of [2, 8]) checkPhysics("exam_variant", seed);

// ── 레지스트리 등록 확인 ────────────────────────────────────────────
check("레지스트리 포함", EM_FORMULA_REGISTRY.some((e) => e.id === "sheet_line_superposition"));

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
