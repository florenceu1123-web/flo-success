/**
 * 원통 도체의 내부 인덕턴스 (임용 10번 전자기학) 정적 스모크 — API 호출 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeCylinderInternalInductance.mjs
 *
 * 배경(2026-08-03 실측): 레지스트리에 이 유형이 없어 bare "인덕턴스" 낱말로
 * **솔레노이드 인덕턴스(L=μ₀N²A/l)** 문제가 생성됐다(사용자 신고).
 *
 * 물리(닫힌형, 수치적분 교차검증):
 *   H = I·a/(2πr²),  B = μ_r μ₀ I a/(2πr²),  λ = μ_r μ₀ I/(8π),  L = μ_r μ₀/(8π)
 *   → L은 **r·I에 무관**. μ₀=4π×10⁻⁷ 대입 시 λ=(μ_r·I/2)×10⁻⁷, L=(μ_r/2)×10⁻⁷.
 *   원본(μ_r=50, I=10): λ=2.5×10⁻⁵[Wb], L=2.5×10⁻⁶[H/m].
 */
import {
  detectCylinderInternalInductance,
  detectCylinderConductorField,
  detectCoaxLineMagneticField,
} from "@/lib/analysis/classifyElectromagnetics";
import { generateElectromagnetics } from "@/lib/generation/topologies/electromagnetics";
import { renderEmFieldDiagram } from "@/lib/renderers/emFieldRenderer";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`);
  }
}

const A = (topic, interpretation, relatedConcepts = []) => ({
  subject: "전자기학",
  topic,
  interpretation,
  relatedConcepts,
  topicKey: "magnetostatics",
  componentInventory: [],
});

// ── 1. 감지 ─────────────────────────────────────────────────────────────────
console.log("[1] detectCylinderInternalInductance — 표현 변형");

// 실측 analyze 요약 (2026-08-03) — 솔레노이드 인덕턴스로 새던 회차
const reported = A(
  "무한 원통 도체의 내부 인덕턴스 계산",
  "반지름이 r[m]이고 z축으로 무한히 긴 원통형 도체에 10[A]의 직류 전류가 균일하게 흐를 때, 도체 길이 1[m]당 도체 내부 인덕턴스 L[H/m]을 구하는 문제이다. 중심에서 a만큼 떨어진 점 P의 자계와 자속 밀도를 구하고, 도체 내부를 쇄교하는 자속수를 구한 뒤 내부 인덕턴스를 구한다. 표피 효과는 무시하며 비투자율은 50이다.",
  ["앙페르 법칙", "쇄교 자속", "내부 인덕턴스"],
);
check("실측 신고 회차를 잡는다", detectCylinderInternalInductance(reported) === true);

check(
  "'표피 효과'만 언급된 요약",
  detectCylinderInternalInductance(
    A("원통형 도체의 자기적 성질", "원통형 도체 내부의 자계와 자속을 구해 길이당 인덕턴스를 구한다. 표피 효과는 무시한다."),
  ) === true,
);
check(
  "'쇄교하는 자속수' 표현",
  detectCylinderInternalInductance(
    A("원통 도체 내부 자속", "원통형 도체 내부를 쇄교하는 자속수를 구하고 이를 이용해 길이 1m당 인덕턴스를 구한다."),
  ) === true,
);

// ── 2. 형제 양보 ────────────────────────────────────────────────────────────
console.log("\n[2] 형제 회귀 — 남의 유형을 뺏지 않는다");
check(
  "솔레노이드 인덕턴스는 양보",
  detectCylinderInternalInductance(
    A("솔레노이드의 자기 인덕턴스", "단면적 A, 길이 l인 솔레노이드에 도선이 N번 감겨 있을 때 자기 인덕턴스 L을 구한다."),
  ) === false,
);
check(
  "상호 인덕턴스는 양보",
  detectCylinderInternalInductance(
    A("두 코일의 상호 인덕턴스", "공통 철심에 감긴 1차·2차 코일의 상호 인덕턴스 M을 구한다."),
  ) === false,
);

const cylSigma = A(
  "원통 도체의 전위차와 외부 자계",
  "도전율 σ인 무한히 긴 직선 원통 도체의 두 단면 A·B 사이 전위차로부터 전계와 전류 밀도, 전체 전류를 구하고 도체 외부의 자계 H를 구한다.",
);
check("도전율·전위차 유형(형제)은 양보", detectCylinderInternalInductance(cylSigma) === false);
check("  ↳ 그 유형의 감지기는 정상 발화", detectCylinderConductorField(cylSigma) === true);

const coax = A(
  "동축선로의 영역별 자계",
  "무한히 긴 동축선로에서 내부 도체에 +a_z 방향, 외부 도체에 −a_z 방향으로 전류가 흐를 때 앙페르 법칙으로 세 영역의 자계를 구한다.",
);
check("동축선로는 양보", detectCylinderInternalInductance(coax) === false);
check("  ↳ 그 유형의 감지기는 정상 발화", detectCoaxLineMagneticField(coax) === true);

check(
  "정전계(전하) 문맥은 양보",
  detectCylinderInternalInductance(
    A("원통형 도체의 정전용량", "원통형 도체에 전하가 분포할 때 전계와 정전용량을 구한다."),
  ) === false,
);

// ── 3. 물리 재검산 ──────────────────────────────────────────────────────────
console.log("\n[3] 생성물 물리 재검산 (수치적분 교차검증 포함)");

/** λ 수치적분 — λ = ∫₀^r (a²/r²)·μI a/(2πr²) da (r 무관임을 함께 확인). */
function lambdaNumeric(mur, I, r) {
  const mu = mur * 4 * Math.PI * 1e-7;
  const N = 200000;
  let acc = 0;
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) * r) / N;
    const da = r / N;
    acc += ((a * a) / (r * r)) * ((mu * I * a) / (2 * Math.PI * r * r)) * da;
  }
  return acc;
}

let ok = 0;
let bad = 0;
const bodies = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 14; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: "cylinder_internal_inductance" });
    const body = `${inst.content}\n${inst.givens.join("\n")}\n${inst.answer}`;
    bodies.add(body);
    const mI = /(\d+)\\,\[\\mathrm\{A\}\]/.exec(body);
    const mMur = /\\mu_r = (\d+)/.exec(body);
    const mL = /L = (\d+)\\times 10\^\{-7\}/.exec(body);
    if (!mI || !mMur || !mL) {
      bad++;
      console.log(`    ✗ 파싱 실패 (${mode}/${seed})`);
      continue;
    }
    const I = Number(mI[1]), mur = Number(mMur[1]), lCoef = Number(mL[1]);
    // 닫힌형: L = μ_r/2 ×10⁻⁷
    const lClosed = mur / 2;
    // 수치적분: L = λ/I (r을 두 값으로 바꿔도 같아야 한다)
    const lNum1 = lambdaNumeric(mur, I, 0.02) / I;
    const lNum2 = lambdaNumeric(mur, I, 0.13) / I;
    const consistent =
      lCoef === lClosed &&
      Math.abs(lNum1 - lClosed * 1e-7) < 1e-12 &&
      Math.abs(lNum1 - lNum2) < 1e-15;
    if (consistent) ok++;
    else {
      bad++;
      console.log(`    ✗ 불일치 μ_r=${mur} I=${I} lCoef=${lCoef} closed=${lClosed} num=${(lNum1 * 1e7).toFixed(6)}`);
    }
  }
}
check(`생성물 28개 재검산 — 닫힌형·수치적분·r 무관 (${ok} ok / ${bad} bad)`, bad === 0);
check("유사·변형이 서로 다른 문제를 만든다", bodies.size > 1, `distinct=${bodies.size}`);

// 원본 값
const lamOrig = lambdaNumeric(50, 10, 0.03);
check(
  "원본(μ_r=50, I=10): λ=2.5×10⁻⁵[Wb], L=2.5×10⁻⁶[H/m]",
  Math.abs(lamOrig - 2.5e-5) < 1e-11 && Math.abs(lamOrig / 10 - 2.5e-6) < 1e-12,
  `λ=${lamOrig.toExponential(6)}`,
);

let originalEmitted = false;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 40; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: "cylinder_internal_inductance" });
    const b = `${inst.content}\n${inst.givens.join("\n")}\n${inst.answer}`;
    if (/\\mu_r = 50/.test(b) && /10\\,\[\\mathrm\{A\}\]/.test(b)) originalEmitted = true;
  }
}
check("원본 튜플(μ_r=50, I=10)은 생성되지 않는다", originalEmitted === false);

// ── 4. 발문·figure 구조 ─────────────────────────────────────────────────────
console.log("\n[4] 발문·figure 구조");
const sim = generateElectromagnetics({ seed: 5, mode: "exam_similar", entryId: "cylinder_internal_inductance" });
// ★ 총 개수가 아니라 **서로 다른** 마커로 센다 — [단계 3] 문장이 원본처럼
//   "[단계 2]에서 구한 결과를 이용하여"를 포함하므로 총 개수는 4가 정상이다.
check(
  "3단계 발문 (서로 다른 마커 3종)",
  new Set(sim.question.match(/\[단계 \d\]/g) ?? []).size === 3,
  JSON.stringify(sim.question.match(/\[단계 \d\]/g)),
);
check("[단계 3]이 [단계 2] 결과를 이어받는다 (원본 문구)", /단계 3.*단계 2.*에서 구한 결과/s.test(sim.question));
check("[단계 1] H와 B", /단계 1.*자계의 크기.*자속 밀도의 크기/s.test(sim.question));
check("[단계 2] 쇄교 자속수 λ", /단계 2.*쇄교하는 자속수/s.test(sim.question));
check("유사유형 [단계 3]은 내부 인덕턴스 L", /단계 3.*내부 인덕턴스/s.test(sim.question));
check("풀이에 '반지름과 무관' 교육 포인트", /반지름과?\s*무관|반지름 \\\( r \\\) 어느 쪽에도 의존하지 않는다|r \\\) 어느 쪽에도/.test(sim.steps.join("\n")));
const varn = generateElectromagnetics({ seed: 5, mode: "exam_variant", entryId: "cylinder_internal_inductance" });
check("변형유형 [단계 3]은 비투자율 μ_r 역산 (구하는 양 교환)", /단계 3.*비투자율/s.test(varn.question));

const svg = renderEmFieldDiagram(sim.diagram);
check("figure geometry = cylinder_internal_inductance", sim.diagram?.geometry === "cylinder_internal_inductance");
check("SVG 렌더 성공", svg.startsWith("<svg") && !svg.includes("미지원"));
check("좌표축 x·y·z 라벨", [">x<", ">y<", ">z<"].every((t) => svg.includes(t)));
check("중심 O와 점 P 표시", svg.includes(">O<") && svg.includes(">P<"));
// texToPlain이 `1\,[\mathrm{m}]` 를 "1 [m]"(공백 포함)으로 렌더한다.
check("1[m] 구간 표시", /1\s*\[m\]/.test(svg), JSON.stringify(svg.match(/>[^<]*\[m\][^<]*</g)));
check("LaTeX 원문이 새지 않음", !svg.includes("\\mathrm") && !svg.includes("\\times"));
// ★ 사용자 신고(2026-08-03 "그림이 조금 이상해") 회귀: 캔버스 이탈 + 라벨 겹침.
//   원인 = (1) y=330까지 그려 560×300 밖으로 나감(y축 라벨 잘림) (2) 원통 축이 z축과 어긋남
//   (3) 단면 라벨 P·a·O·r가 한 덩어리로 뭉침.
const coords = [
  ...[...svg.matchAll(/(?:cx|x1|x2|x)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 560, ax: "x" })),
  ...[...svg.matchAll(/(?:cy|y1|y2|y)="(-?[\d.]+)"/g)].map((m) => ({ v: +m[1], lim: 300, ax: "y" })),
];
const outside = coords.filter((c) => c.v < 0 || c.v > c.lim);
check(
  "캔버스(560×300) 이탈 0건",
  outside.length === 0,
  JSON.stringify(outside.slice(0, 5)),
);
const overlaps = findLabelOverlaps(svg);
check("라벨 겹침 0건 (P·a·O·r 분리)", overlaps.length === 0, JSON.stringify(overlaps));
check(
  "원통 축이 z축과 나란하다 (몸통 두 모선의 기울기가 같다)",
  (() => {
    const lines = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#1e3a8a" stroke-width="1.4"\/>/g)]
      .map((m) => (Number(m[4]) - Number(m[2])) / (Number(m[3]) - Number(m[1])));
    return lines.length >= 2 && Math.abs(lines[0] - lines[1]) < 1e-6;
  })(),
);

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exitCode = 1;
