/**
 * 점전하 + x축 무한 선전하 → 크기 일치 전하량 Q_A → 전계 상쇄 위치 k (임용 9번 전자기학) 정적 스모크.
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokePointLineNullField.mjs
 *
 * 라우팅(감지기·형제 양보) + 물리 독립 재검산 + 원본 값 + figure 구조.
 */
import {
  detectPointLineNullField, detectPointLineChargeForce,
  detectSheetLineEfieldSuperposition, detectTwoPointCharges, classifyElectromagnetics,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { generateElectromagnetics, __ptLineNullSpace } from "../lib/generation/topologies/electromagnetics.ts";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const A = (o) => ({ topic: "", interpretation: "", relatedConcepts: [], fillInTheBlanks: [], componentInventory: [], ...o });

console.log("\n[1] 감지 — 실측 원본 표현 + 변형");
const positives = [
  ["원본 발문 그대로", A({
    topic: "점전하와 무한 선전하에 의한 전계",
    interpretation: "자유 공간의 직각 좌표계에서 점 P₁(0,3,2)에 있는 점전하 A와 x축의 무한 선전하(ρ_L = 4µC/m)에 의해 점 P₂(0,0,2)에 생기는 전계를 구하고, 두 전계의 크기가 같아지는 전하량 Q_A를 구한 뒤, 점전하가 (0,0,k)로 이동했을 때 전계의 합이 0이 되는 k를 구한다.",
    relatedConcepts: ["점전하", "무한 선전하", "전계", "중첩"],
  })],
  ["표현 변형(상쇄)", A({
    topic: "전계 해석",
    interpretation: "x축에 놓인 무한 선전하와 점전하에 의한 전계를 각각 구하고, 두 전계의 크기가 같도록 하는 전하량을 구한다. 이어 점전하를 z축 위로 옮겨 두 전계가 서로 상쇄되는 위치를 구한다.",
  })],
  // ★ 실측 analyze 요약 (2026-08-02) — Vision이 "크기가 같다"도 "0이 되는"도 쓰지 않고
  //   "전하량 Q_A를 구한다"·"(0,0,k)로 이동"으로만 서술했다(선 방향도 z축으로 오독).
  //   낱말이 아니라 **구조**(미지=전하량, 3단계=이동 위치 k)로 잡혀야 한다.
  ["실측 요약 (요구 낱말 전부 누락)", A({
    topic: "무한 선전하와 점전하 전계",
    interpretation: "무한 선전하 밀도 ρ_l=4μC/m인 선이 z축을 따라 놓여 있고, 점 P(0,0,2)와 점 A(0,3,2)에서의 전기장을 구하는 문제이다. [단계 1] 점 P에서 무한 선전하와 점전하에 의한 전기장을 구하고, [단계 2] 점 P에서의 전기장을 이용해 전하량 Q_A를 구한다. [단계 3] 전하 Q_A가 점 A에서 점 (0,0,k)로 이동할 때 점 P에서의 전기장을 구한다.",
    relatedConcepts: ["무한 선전하", "전기장 계산", "쿨롱의 법칙", "전하량 계산"],
  })],
  ["기호 표기", A({
    topic: "자유 공간의 전계",
    interpretation: "선전하밀도 ρ_L인 무한 선전하와 점전하에 의한 전계 E₁, E₂를 구한 뒤 |E₁| = |E₂|가 되는 전하량을 구하고, |E₁+E₃|의 크기가 0이 되는 위치를 구한다.",
  })],
];
for (const [n, a] of positives) ok(`감지 ${n}`, detectPointLineNullField(a) === true);

console.log("\n[2] 형제 미탈취 (양보)");
const negatives = [
  ["점전하+선전하 크기 비 → 힘 (2023 전기 A-10)", A({
    topic: "점전하와 무한 선전하의 합성 전계와 힘",
    interpretation: "점전하와 무한 선전하에 의한 원점에서의 전계의 크기 비가 주어질 때 선전하밀도 k를 구하고, 원점의 전하에 작용하는 힘 F를 구한다.",
  })],
  ["면전하+선전하 (임용 11번)", A({
    topic: "면전하와 선전하의 합성 전계",
    interpretation: "무한 면전하와 무한 선전하에 의한 합성 전계가 0이 되는 선전하밀도를 구한다.",
  })],
  ["두 점전하 (임용 4번)", A({
    topic: "두 점전하에 의한 전계와 전위",
    interpretation: "y축과 z축 위의 두 점전하에 의한 점 P에서의 합성 전계의 크기와 전위를 구한다.",
  })],
  ["자계 문맥 (두 도선)", A({
    topic: "두 무한 도선의 합성 자계",
    interpretation: "두 무한 직선 도선에 의한 합성 자계가 0이 되는 위치와 단위 길이당 힘을 구한다.",
  })],
  ["원형 링 선전하", A({
    topic: "면전하와 원형 링 선전하",
    interpretation: "무한 면전하와 원형 링 선전하에 의한 축상 합성 전계의 크기가 같아지는 λ를 구한다.",
  })],
];
for (const [n, a] of negatives) ok(`양보 ${n}`, detectPointLineNullField(a) === false);

console.log("\n[3] 형제 감지기 회귀 (내 유형을 뺏기지도, 뺏지도 않는다)");
{
  const mine = positives[0][1];
  ok("point_line_charge_force가 내 원본에 양보", detectPointLineChargeForce(mine) === false);
  ok("sheet_line_efield가 내 원본에 미발화", detectSheetLineEfieldSuperposition(mine) === false);
  ok("two_point_charges가 내 원본에 미발화", detectTwoPointCharges(mine) === false);
  const sib = negatives[0][1];
  ok("크기 비·힘 원본은 여전히 point_line_charge_force", detectPointLineChargeForce(sib) === true);
}

console.log("\n[4] 원본 물리 (ρ_L=4µC/m, d=3, h=2 → Q_A=36µC, k=5)");
{
  // 값 공간에서 원본 튜플이 제외됐는지 + 공식 자체 검산
  const space = __ptLineNullSpace();
  ok("원본 튜플 미생성", !space.some((s) => s.rhoL === 4 && s.d === 3 && s.h === 2));
  const qA = (2 * 4 * 9) / 2, e1 = (18 * 4) / 2, k = 2 + 3;
  ok("Q_A = 2ρ_L d²/h = 36 µC", qA === 36);
  ok("|E₁| = 18ρ_L/h = 36 kV/m", e1 === 36);
  ok("k = h + d = 5 m", k === 5);
  // 상쇄식 역검산: 9e9·Q_A/(k−h)² = 18e9·ρ_L/h
  const lhs = 9e9 * qA * 1e-6 / (k - 2) ** 2, rhs = 18e9 * 4e-6 / 2;
  ok("상쇄식 좌우 일치", Math.abs(lhs - rhs) < 1e-6, `${lhs} vs ${rhs}`);
}

console.log("\n[5] 생성물 독립 재검산 (24개)");
{
  let bad = 0, origHit = 0;
  const seen = new Set();
  for (let i = 0; i < 24; i++) {
    const mode = i % 2 ? "exam_variant" : "exam_similar";
    const inst = generateElectromagnetics({ seed: 900 + i * 31, mode, entryId: "point_line_null_field" });
    if (inst.entryId !== "point_line_null_field") { bad++; continue; }
    // 발문에서 수치를 되읽어 물리를 독립 재계산
    // ★ LaTeX 정규식 대신 **diagram 라벨 + 답의 단계별 첫 정수**로 읽는다(표기 변화에 덜 취약).
    const lab = inst.diagram?.labels ?? {};
    const firstInt = (s) => { const m = /(\d+)/.exec(String(s ?? "")); return m ? Number(m[1]) : NaN; };
    // ★ 태그("[단계 2]")의 숫자를 값으로 읽지 않도록 태그를 잘라낸다.
    const lineOf = (tag) => (inst.answer.split("\n").find((l) => l.startsWith(tag)) ?? "").slice(tag.length);
    const d = Number(lab.distA), h = Number(lab.distB);
    const k = firstInt(lineOf("[단계 3]"));
    const step2 = lineOf("[단계 2]");
    if (!Number.isFinite(d) || !Number.isFinite(h)) { bad++; continue; }
    if (k !== h + d) { bad++; continue; }
    if (mode === "exam_similar") {
      // 유사: ρ_L이 라벨에, Q_A가 답에 — Q_A = 2ρ_L d²/h
      const rhoL = firstInt(lab.lineDensity), qA = firstInt(step2);
      if (qA !== (2 * rhoL * d * d) / h) bad++;
      if (rhoL === 4 && d === 3 && h === 2) origHit++;
      seen.add(`s:${rhoL}-${d}-${h}`);
    } else {
      // 변형: Q_A가 라벨에, ρ_L이 답에 — ρ_L = Q_A·h/(2d²)
      const qA = firstInt(lab.charge), rhoL = firstInt(step2);
      if (rhoL !== (qA * h) / (2 * d * d)) bad++;
      if (rhoL === 4 && d === 3 && h === 2) origHit++;
      seen.add(`v:${rhoL}-${d}-${h}`);
    }
    // 3단계 발문·figure 구조
    if (!/단계 3/.test(inst.question) || !/0\\?\)?이\s*되는/.test(inst.question)) bad++;
    if (!inst.diagram || inst.diagram.geometry !== "point_line_null_axes") bad++;
  }
  ok("24개 모두 Q_A·ρ_L·k 관계식 재검산 일치", bad === 0, `bad=${bad}`);
  ok("원본 튜플 미생성(생성물)", origHit === 0);
  ok("서로 다른 문제가 생성됨", seen.size >= 6, `distinct=${seen.size}`);
}

console.log("\n[6] figure 렌더");
{
  const inst = generateElectromagnetics({ seed: 5, mode: "exam_similar", entryId: "point_line_null_field" });
  const svg = renderEmFieldDiagram(inst.diagram);
  ok("SVG 생성", typeof svg === "string" && svg.startsWith("<svg") && svg.includes("</svg>"));
  ok("P₁·P₂ 라벨", /P/.test(svg));
  ok("선전하 라벨(ρ_L)", svg.includes("ρ") || svg.includes("rho"), "");
  const nums = [...svg.matchAll(/<(?:line|circle)[^>]*?(?:x1|cx)="([\d.]+)"[^>]*?(?:y1|cy)="([\d.]+)"/g)];
  ok("좌표가 캔버스(560×300) 안", nums.every((m) => +m[1] >= 0 && +m[1] <= 560 && +m[2] >= 0 && +m[2] <= 300));
}

console.log(`\n결과: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
