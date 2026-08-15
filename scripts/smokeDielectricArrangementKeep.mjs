/**
 * 두 유전체 커패시터 — **유사·변형 모두 원본 배치 유지, 값만 변경** (사용자 지정 2026-08-02) 스모크.
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeDielectricArrangementKeep.mjs
 *
 * 이전 동작(변형이 직렬↔병렬 쌍대로 배치를 뒤집던 것)의 회귀를 막는다.
 */
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";
import { detectDielectricBoundary, detectDielectricArrangement } from "../lib/analysis/classifyElectromagnetics.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const gen = (mode, arrangement, seed) => generateElectromagnetics({
  seed, mode, entryId: "dielectric_two_region_cap", hints: { dielectricArrangement: arrangement },
});
const splitOf = (inst) => inst.diagram?.labels?.split;

console.log("\n[1] 원본이 병렬(나란히, 임용 11번) — 양모드 모두 병렬");
{
  let bad = 0;
  for (let i = 0; i < 12; i++) {
    for (const mode of ["exam_similar", "exam_variant"]) {
      const inst = gen(mode, "parallel", 100 + i * 17);
      if (splitOf(inst) !== "parallel") bad++;
      if (!/나란히/.test(inst.content)) bad++;
    }
  }
  ok("24개 모두 병렬 유지", bad === 0, `bad=${bad}`);
}

console.log("\n[2] 원본이 직렬(적층, 임용 10번) — 양모드 모두 직렬");
{
  let bad = 0;
  for (let i = 0; i < 12; i++) {
    for (const mode of ["exam_similar", "exam_variant"]) {
      const inst = gen(mode, "series", 200 + i * 23);
      if (splitOf(inst) !== "series") bad++;
    }
  }
  ok("24개 모두 직렬 유지", bad === 0, `bad=${bad}`);
}

console.log("\n[3] 값은 달라진다 — 유사/변형 수치 풀이 분리");
{
  const sig = (inst) => `${inst.diagram?.labels?.regionA}|${inst.diagram?.labels?.regionB}|${inst.diagram?.labels?.ratio}`;
  const sims = new Set(), vars = new Set();
  for (let i = 0; i < 16; i++) {
    sims.add(sig(gen("exam_similar", "parallel", 300 + i * 13)));
    vars.add(sig(gen("exam_variant", "parallel", 300 + i * 13)));
  }
  const overlap = [...sims].filter((s) => vars.has(s));
  ok("유사·변형 값 조합이 겹치지 않음", overlap.length === 0, overlap.slice(0, 2).join(" / "));
  ok("유사 쪽 값이 여러 가지", sims.size >= 3, `distinct=${sims.size}`);
  ok("변형 쪽 값이 여러 가지", vars.size >= 3, `distinct=${vars.size}`);
}

console.log("\n[4] 배치 힌트 없으면 병렬이 기본 (임용 11번 호환)");
{
  const inst = generateElectromagnetics({ seed: 7, mode: "exam_variant", entryId: "dielectric_two_region_cap" });
  ok("기본 배치 = 병렬", splitOf(inst) === "parallel", String(splitOf(inst)));
}

console.log("\n[5] 라우팅 — 커패시터 문맥은 경계 굴절 감지기에 뺏기지 않는다 (실측 신고)");
{
  // ★ 실측 Vision 요약 — relatedConcepts에 개념 태그 "정전 에너지"가 붙어 경계 굴절 감지기가 가로챘다.
  const real = {
    topic: "평행판 커패시터의 유전체",
    interpretation: "두 평행판 도체 사이에 서로 다른 유전체가 채워진 커패시터에서, 하부 도체에 +Q, 상부 도체에 -Q가 전하로 대전될 때 전계 E와 전위차 V_d, 정전용량 C_d를 구하는 문제이다. 유전체의 부피비에 따라 전계의 크기와 방향이 달라지며, 이를 통해 전위차와 정전용량을 계산한다.",
    relatedConcepts: ["평행판 커패시터", "정전용량", "전계", "전위차", "유전체", "표면전하밀도", "전기장", "정전 에너지"],
    fillInTheBlanks: [], componentInventory: [],
  };
  ok("경계 굴절 감지기 미발화(양보)", detectDielectricBoundary(real) === false);
  ok("배치 감지 = 병렬(나란히)", detectDielectricArrangement(real) !== "series", String(detectDielectricArrangement(real)));
  // 회귀 — 진짜 경계 굴절 원본(임용 20번)은 여전히 잡혀야 한다.
  const boundary = {
    topic: "유전체 경계면의 전계",
    interpretation: "z=0 경계면으로 나뉜 두 유전체에서 영역 1의 전계 E₁이 주어질 때 영역 2의 전계 E₂와 단위체적당 정전 에너지를 구한다. 경계면에서 접선 성분은 연속이고 법선 성분의 D가 연속이다.",
    relatedConcepts: ["경계 조건", "전계 굴절", "정전 에너지"],
    fillInTheBlanks: [], componentInventory: [],
  };
  ok("진짜 경계 굴절 원본은 그대로 감지", detectDielectricBoundary(boundary) === true);
}

console.log("\n[6] 전위 분포 하위구조(임용 24번)는 영향 없음");
{
  const inst = generateElectromagnetics({
    seed: 9, mode: "exam_variant", entryId: "dielectric_two_region_cap",
    hints: { dielectricStructure: "potential_distribution" },
  });
  ok("전위 분포 구조 유지", /전위/.test(inst.question), inst.question.slice(0, 40));
}

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
