// 두 점전하(직각 좌표) → 합성 전계 크기 + 전위 (임용 4번 전자기학) — 라우팅·물리 정적 검증 (API 없음)
//
//   사용자 신고: "이 문제의 유사문제를 다시 생성하려는데 안돼".
//   실측 로그: dispatch entryId=**point_charge_field**(단일 점전하) → 전혀 다른 문제.
//   기존 항목 중 이 형식이 없었다(coulomb_force는 두 전하 사이의 **힘**) → 레지스트리 항목 신설.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeTwoPointCharges.mjs
import {
  classifyElectromagnetics, detectTwoPointCharges, detectSheetLineEfieldSuperposition,
  detectSheetRingEfield, detectCurlLineIntegral, detectFluxLoopInducedCurrent,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";

const dispatch = (a) =>
  detectFluxLoopInducedCurrent(a) ? "flux_loop_induced_current"
  : detectCurlLineIntegral(a) ? "curl_from_line_integral"
  : detectSheetRingEfield(a) ? "sheet_ring_efield_ratio"
  : detectSheetLineEfieldSuperposition(a) ? "sheet_line_efield_superposition"
  : detectTwoPointCharges(a) ? "two_point_charges_field_potential"
  : classifyElectromagnetics(a);

const mk = (topic, interpretation, concepts = []) => ({ topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [] });
let pass = 0, fail = 0;
const expect = (name, a, want) => {
  const got = dispatch(a);
  if (got === want) { pass++; console.log(`  ✅ ${name} → ${got}`); }
  else { fail++; console.log(`  ❌ ${name} → ${got} (기대: ${want})`); }
};
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};

const T = "two_point_charges_field_potential";
console.log("\n[1] 이 원본 — 표현이 흔들려도 전용 항목으로");
expect("실측 Vision 요약", mk(
  "두 점전하의 전계와 전위",
  "자유 공간에서 Q_A = 8 nC의 점전하가 점 A(0,3,0)에 있고 Q_B = 6 nC의 점전하가 점 B(0,0,3)에 놓여 있을 때, 점 P(0,3,3)에서 두 점전하에 의한 전계의 크기와 전위를 구하는 문제이다.",
  ["점전하", "전계", "전위", "중첩", "쿨롱 법칙"],
), T);
expect("'두 개의 점전하'로 서술", mk(
  "점전하에 의한 전계",
  "자유 공간에 놓인 두 개의 점전하가 만드는 전계의 크기와 전위를 특정 점에서 구한다.",
  ["점전하", "전계", "전위"],
), T);
expect("Q_1·Q_2 표기", mk(
  "좌표계 위 점전하",
  "점전하 Q_1과 Q_2가 각각 y축과 z축 위에 있을 때 점 P에서의 합성 전계와 전위를 구한다.",
  ["점전하", "합성 전계", "전위"],
), T);

console.log("\n[2] 형제 회귀 — 다른 정전계 항목은 뺏기지 않는다");
expect("단일 점전하 (경쟁 항목)", mk(
  "점전하가 만드는 전기장",
  "진공 중에 놓인 점전하로부터 거리 r만큼 떨어진 점에서의 전기장의 세기를 구하는 문제이다.",
  ["점전하", "쿨롱 법칙", "전기장"],
), "point_charge_field");
expect("두 전하 사이의 힘 (coulomb_force)", mk(
  "두 점전하 사이의 정전기력",
  "진공 중에서 두 점전하가 일정한 거리만큼 떨어져 있을 때 두 전하 사이에 작용하는 정전기력의 크기 F를 구한다.",
  ["쿨롱 힘", "정전기력", "점전하"],
), "coulomb_force");
expect("면전하+선전하 합성 (형제)", mk(
  "무한 면전하와 선전하의 합성 전계",
  "무한 면전하와 무한 선전하가 만드는 합성 전계가 0이 되는 선전하 밀도를 구한다.",
  ["면전하", "선전하", "합성 전계"],
), "sheet_line_efield_superposition");

console.log("\n[3] 물리 검산 — 생성물의 |E|·V_P를 독립 재계산");
const K = 9e9;
let bad = 0, seen = new Set(), origLeak = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 8; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: T });
    const plain = `${inst.content} ${inst.answer}`;
    // 본문에서 Q_A·좌표·정답을 파싱해 재검산
    const qa = Number(/Q_A\s*=\s*(\d+)/.exec(plain)?.[1]);
    const d = Number(/A\(0,\s*(\d+)\s*,\s*0\)/.exec(plain)?.[1]);
    const eMag = Number(/\|\\mathbf\{E\}\|\s*=\s*(\d+)/.exec(plain)?.[1]);
    const vP = Number(/V_P\s*=\s*(\d+)/.exec(plain)?.[1]);
    const qb = Number(/Q_B\s*=\s*(\d+)/.exec(plain)?.[1]);
    const eA = (K * qa * 1e-9) / (d * d), eB = (K * qb * 1e-9) / (d * d);
    const eCalc = Math.hypot(eA, eB), vCalc = (K * (qa + qb) * 1e-9) / d;
    const okRow =
      Number.isFinite(qa) && Number.isFinite(qb) && Number.isFinite(d) &&
      Math.abs(eCalc - eMag) < 1e-6 && Math.abs(vCalc - vP) < 1e-6 &&
      Number.isInteger(eMag) && Number.isInteger(vP);
    if (!okRow) { bad++; console.log(`     ✗ ${mode} seed=${seed}`, { qa, qb, d, eMag, vP, eCalc, vCalc }); }
    if (d === 3 && qa === 8 && qb === 6) origLeak++;
    seen.add(`${d}|${qa}|${qb}`);
  }
}
ok("16개 생성물 |E|·V_P 재검산 일치 (모두 정수)", bad === 0, `${bad}건`);
ok("원본 튜플(3m·8nC·6nC) 미생성", origLeak === 0);
ok("값 다양성 5종 이상", seen.size >= 5, `${seen.size}종`);

console.log("\n[4] figure·발문 구조");
{
  const s = generateElectromagnetics({ seed: 2, mode: "exam_similar", entryId: T });
  const v = generateElectromagnetics({ seed: 2, mode: "exam_variant", entryId: T });
  ok("유사: 도식 geometry=two_charges_axes", s.diagram?.geometry === "two_charges_axes");
  ok("유사: 발문이 |E|와 V_P", /전계의 크기/.test(s.question) && /전위/.test(s.question));
  ok("변형: 구하는 양 교환(Q_B 역산)", /Q_B/.test(v.question) && /전위/.test(v.question));
  // ★ 2026-08-12 계약 변경: 객관식 원본은 **정확히 3단계** 단계별 주관식으로 낸다.
  //   (이전엔 풀이 4단계 이상을 요구했으나, 기하 서술을 [단계 1]에 흡수해 3단계로 통일했다.)
  ok("풀이가 정확히 3단계", (s.steps?.length ?? 0) === 3);
  ok("[단계 1]에 기하(변위 벡터·수직) 서술 보존", /수직/.test(s.steps[0]) && /AP/.test(s.steps[0]));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
