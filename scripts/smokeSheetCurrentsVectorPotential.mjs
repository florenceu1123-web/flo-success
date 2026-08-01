// 두 무한 면전류 사이의 자속밀도·자위·자속 (임용 10번) 레지스트리 항목 검증 (API 없음)
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSheetCurrentsVectorPotential.mjs
import {
  classifyElectromagnetics, detectSheetCurrentsVectorPotential,
  detectCurlLineIntegral, detectPointLineChargeForce,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const mk = (topic, interpretation, concepts = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: [],
});

console.log("\n[1] 라우팅 — 원본");
const REAL = mk(
  "두 무한 면전류에 의한 자속밀도와 자위",
  "자유공간상에서 두 개의 무한 면전류는 각각 밀도가 K₁=−20a_z[A/m], K₂=20a_z[A/m]이고 y=−3인 면과 y=3인 면에 있다. −3<y<3에서 벡터 자위가 A = mμ₀(y−1)a_z[Wb/m]일 때, 두 면전류 사이의 공간에서 스칼라 자위 V_m과 자속의 양 Φ[Wb]을 구한다. 자속밀도를 만족하는 m을 구하고 x=0인 면의 사각형을 통과하는 자속을 구한다.",
  ["면전류", "벡터 자위", "스칼라 자위", "자속밀도", "자속"],
);
ok("원본 → detect 발화", detectSheetCurrentsVectorPotential(REAL) === true);
ok("원본 → 점전하+선전하 항목 미발화", detectPointLineChargeForce(REAL) === false);

const WOBBLE = [
  ["'자위' 낱말이 흔들린 회차 (자속만)", mk(
    "무한 면전류와 자속",
    "두 개의 무한 면전류 K₁, K₂ 사이의 공간에서 자속밀도를 구하고 x=0 면의 사각형을 통과하는 자속을 구한다.",
    ["면전류", "자속밀도", "자속"],
  )],
  ["'스칼라 자위'만 언급", mk(
    "면전류 사이의 스칼라 자위",
    "두 무한 면전류 사이에서 스칼라 자위 V_m을 기준점을 이용해 구한다.",
    ["면전류", "스칼라 자위"],
  )],
];
for (const [name, a] of WOBBLE) ok(`${name} → detect 발화`, detectSheetCurrentsVectorPotential(a) === true);

console.log("\n[2] 형제 회귀");
const SIBLINGS = [
  ["면전류 + 선전류 합성 자계", mk(
    "면전류와 선전류의 합성 자계",
    "무한 면전류와 무한 선전류가 만드는 자계를 합성해 특정 점에서의 자계를 구한다.",
    ["면전류", "선전류", "합성 자계", "앙페르 법칙"],
  ), "sheet_line_superposition"],
  ["정사각형 폐경로 선적분 → ∇×H", mk(
    "자계 합성 및 경로 적분",
    "자유 공간에서 자계 H = 20x²a_z가 주어질 때 한 변이 1인 정사각형 경로를 따라 ∮H·dl을 구하고, 면적으로 나눈 값과 x₀=2에서의 ∇×H를 구한다.",
    ["경로 적분", "자계의 회전", "암페어 법칙의 미분형"],
  ), null],
  ["점전하 + 선전하 (전기)", mk(
    "점전하와 무한 선전하에 의한 전계",
    "점전하와 z축에 평행한 무한 선전하가 있을 때 원점에서의 합성 전계와 전하에 작용하는 힘을 구한다.",
    ["점전하", "선전하", "전계", "힘"],
  ), null],
];
for (const [name, a, want] of SIBLINGS) {
  ok(`${name} → 뺏기지 않음`, detectSheetCurrentsVectorPotential(a) === false);
  if (want) ok(`${name} → 원래 항목 유지`, classifyElectromagnetics(a) === want, String(classifyElectromagnetics(a)));
}
ok("∇×H 항목은 정상 발화", detectCurlLineIntegral(SIBLINGS[1][1]) === true);

console.log("\n[3] 물리 자체 검산 (양 모드 × 16 seed) — 본문 값에서 처음부터 재계산");
for (const mode of ["exam_similar", "exam_variant"]) {
  let bad = 0; const notes = [];
  for (let seed = 1; seed <= 16; seed++) {
    const inst = generateElectromagnetics({ entryId: "sheet_currents_vector_potential", mode, seed });
    const why = [];
    if (inst.entryId !== "sheet_currents_vector_potential") why.push(`entryId=${inst.entryId}`);

    // 본문에서 K(또는 Φ)·d·P·사각형 반폭을 뽑아 물리를 재계산한다.
    // ※ 사각형 표기는 유사=발문 / 변형=본문에 나온다 — 둘을 합쳐서 찾는다.
    const all = `${inst.content}\n${inst.question}`;
    const dM = inst.content.match(/y=-(\d+) \\\)인 면과 \\\( y=(\d+) \\\)인 면/);
    const pM = inst.content.match(/\\mathrm\{P\}\((\d+),\\,\s*(\d+),\\,\s*0\)/);
    const rectM = all.match(/y=\\pm(\d+)\\\), \\\(z=\\pm(\d+)/);
    if (!pM) why.push("기준점 P 파싱 실패");
    if (!rectM) why.push("사각형 파싱 실패");

    // 정답에서 K(=m)·V_m·Φ를 뽑는다
    const kM = inst.answer.match(/m = (\d+)/);
    const vmM = inst.answer.match(/V_m(?:\(0,0,0\))? = (\d+)\\,\[\\mathrm\{A\}\]/);
    const phiM = inst.answer.match(/\\Phi = (\d+)\\mu_0/) ?? inst.content.match(/\\Phi = (\d+)\\mu_0/);
    if (!kM) why.push("m 파싱 실패");
    if (!vmM) why.push("V_m 파싱 실패");
    if (!phiM) why.push("Φ 파싱 실패");

    if (pM && rectM && kM && vmM && phiM) {
      const xP = Number(pM[1]), yP = Number(pM[2]);
      const b = Number(rectM[1]), c = Number(rectM[2]);
      const K = Number(kM[1]);
      // V_m(원점) = K·x_P
      if (Number(vmM[1]) !== K * xP) why.push(`V_m ${vmM[1]} ≠ ${K * xP}`);
      // Φ = 4bc·K·μ₀
      if (Number(phiM[1]) !== 4 * b * c * K) why.push(`Φ ${phiM[1]} ≠ ${4 * b * c * K}`);
      // 기하 타당성: 기준점·사각형이 두 면 사이
      if (dM) {
        const d1 = Number(dM[1]), d2 = Number(dM[2]);
        if (d1 !== d2) why.push("두 면이 ±d 대칭 아님");
        if (Math.abs(yP) >= d1) why.push("기준점이 두 면 밖");
        if (b >= d1) why.push("사각형이 두 면 밖");
      }
      // B 표기 확인 (유사 모드)
      if (mode === "exam_similar" && !inst.answer.includes(`${K}\\mu_0\\mathbf{a}_x`)) why.push("B 표기");
      // 원본 튜플 재생성 금지
      if (K === 20 && xP === 2 && yP === 1 && b === 1 && c === 1 && dM && Number(dM[1]) === 3)
        why.push("원본 튜플 재생성");
    }

    const heads = (s) => s.split("\n").filter((l) => /^\[단계 \d\]/.test(l.trim())).length;
    if (heads(inst.question) !== 2) why.push("발문 2단계 아님");
    if (heads(inst.answer) !== 2) why.push("정답 2단계 아님");
    if (inst.diagram?.geometry !== "sheet_currents_planes") why.push("geometry");

    if (why.length) { bad++; notes.push(`seed${seed}: ${[...new Set(why)].join(", ")}`); }
  }
  ok(`${mode} — 16 seed 전부 검산 통과`, bad === 0, notes.slice(0, 3).join(" / "));
}

console.log("\n[4] 원본 값 재현 (손계산 대조)");
{
  const K = 20, xP = 2, b = 1, c = 1;
  ok("H = K a_x = 20 a_x (½K + ½K)", K / 2 + K / 2 === 20);
  ok("V_m(원점) = K·x_P = 40 [A]", K * xP === 40);
  ok("m = K = 20", K === 20);
  ok("Φ = 4bc·K·μ₀ = 80μ₀ [Wb]", 4 * b * c * K === 80);
}

console.log("\n[5] 그림 렌더러");
{
  const inst = generateElectromagnetics({ entryId: "sheet_currents_vector_potential", mode: "exam_similar", seed: 4 });
  const svg = renderEmFieldDiagram(inst.diagram);
  ok("SVG 생성", svg.includes("<svg"));
  ok("에러 <pre> 없음", !svg.includes("<pre"));
  for (const l of ["z", "y", "x", "O"]) ok(`축 라벨 "${l}" 포함`, svg.includes(l));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
