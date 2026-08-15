/**
 * 원점에서 꺾인 반무한 직선 도선 (임용 11번 전자기학) 정적 스모크 — API 호출 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeBentSemiInfiniteWires.mjs
 *
 * 배경(2026-08-03 실측): 이 원본이 `circular_loop_axis_field`(두 원형 루프 축상 자계)로 dispatch돼
 * 전혀 다른 문제가 생성됐다. Vision이 topic을 "두 원형 루프의 합성 자계"로 오요약한 회차라
 * 낱말 점수로는 형제를 못 이긴다 → 구조 감지기로 강제.
 *
 * 물리(닫힌형): P(a,b,0), c=√(a²+b²)
 *   H₁ = I(c+b)/(4πac)·a_z,  H₂ = I(c+a)/(4πbc)·a_z,  H₃ = I(a+b+c)/(4πab)·a_z
 *   원본(3,4,5): H₁=3I/20π, H₂=I/10π, H₃=I/4π → H₃=(1/π)a_z 이면 I=4[A]
 */
import {
  detectBentSemiInfiniteWires,
  detectTwoWiresFieldForce,
  detectCurlLineIntegral,
} from "@/lib/analysis/classifyElectromagnetics";
import { generateElectromagnetics } from "@/lib/generation/topologies/electromagnetics";
import { renderEmFieldDiagram } from "@/lib/renderers/emFieldRenderer";

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

// ── 1. 감지 — 표현이 흔들려도 잡히는가 ──────────────────────────────────────
console.log("[1] detectBentSemiInfiniteWires — 표현 변형");

// ★ 실측 오분류 회차: Vision이 "두 원형 루프의 합성 자계"로 오요약했다.
const reported = A(
  "두 원형 루프의 합성 자계",
  "3차원 직각 좌표계에서 크기가 I[A]인 선전류가 무한히 먼 곳에서 y축을 따라 원점 O까지 -a_y 방향으로 흐른 후, 다시 원점 O에서 x축을 따라 +a_x 방향으로 무한히 먼 곳으로 흐르고 있다. 점 P(3,4,0)에서 y축의 전류에 의한 자계 H_1과 x축의 전류에 의한 자계 H_2의 합성 자계 H_3 = (1/π)a_z가 되는 전류 I를 구한다.",
  ["비오사바르 법칙", "합성 자계"],
);
check("실측 오분류 회차(원형 루프로 오요약)를 잡는다", detectBentSemiInfiniteWires(reported) === true);

// ★★ 최악의 실측 회차: Vision이 "y축을 따라"·"무한히 먼 곳"을 통째로 흘리고 본문을
//    "두 원형 전류 루프"로 바꿔 썼다. 남은 구조 신호는 **축마다 전류가 있다**는 것뿐이다.
const degraded = A(
  "두 원형 루프의 합성 자계",
  "두 원형 전류 루프가 각각 전류를 흐르고, 특정 점에서 합성 자계가 주어진 값을 갖도록 하는 전류를 구하는 문제이다. 점 P(3,4,0)에서 y축의 전류에 의한 자계와 x축의 전류에 의한 자계를 각각 구한 후, 합성 자계가 주어진 조건을 만족하도록 전류 I를 계산한다.",
  ["원형 루프 자계", "축상 자계", "합성 자계", "자계의 크기", "전류 계산"],
);
check(
  "★ 최악 회차(구조 서술까지 원형 루프로 오요약)도 축-전류 신호로 잡는다",
  detectBentSemiInfiniteWires(degraded) === true,
);

check(
  "'반무한'이라는 낱말을 쓴 요약",
  detectBentSemiInfiniteWires(
    A(
      "반무한 직선 전류의 자계",
      "원점에서 꺾인 두 반무한 직선 도선에 흐르는 선전류에 의한 점 P에서의 합성 자계를 구하고, 그 값이 주어진 값이 되는 전류 I를 구한다. 전류는 y축을 따라 흘러 원점 O에서 x축 방향으로 바뀐다.",
    ),
  ) === true,
);

check(
  "'꺾인 도선' 표현",
  detectBentSemiInfiniteWires(
    A(
      "꺾인 도선의 자기장",
      "무한히 먼 곳에서 y축을 따라 원점까지 흐른 뒤 x축을 따라 무한히 먼 곳으로 나가는 전류가 만드는 자계 H_3를 구하고 되는 전류 I를 구한다.",
    ),
  ) === true,
);

// ── 2. 형제 양보 ────────────────────────────────────────────────────────────
console.log("\n[2] 형제 회귀 — 남의 유형을 뺏지 않는다");
const realLoops = A(
  "두 원형 전류 루프의 축상 자계 합성",
  "점 P(0,0,4)를 중심으로 반지름이 5m인 원형 루프 C_1에 반시계 방향으로 100A의 전류가 흐르고, 원점을 중심으로 반지름 3m인 원형 루프 C_2에 시계 방향으로 I가 흐른다. P에서 합성 자계가 1a_z가 되는 전류 I를 구한다.",
  ["원형 루프", "축상 자계"],
);
check("진짜 원형 루프 문제는 양보 (반지름 given)", detectBentSemiInfiniteWires(realLoops) === false);

const twoWires = A(
  "두 무한 직선 도선의 합성 자계와 힘",
  "x=0, y=1에 도선 A(+a_z, 2A), x=0, y=a에 도선 B(-a_z, 2A)가 있다. O와 P(0,2,0)에서 합성 자계의 크기 비가 3:5가 되는 a를 구하고 도선 B에 작용하는 단위 길이당 힘을 구한다.",
);
check("두 평행 무한 도선(힘) 유형은 양보", detectBentSemiInfiniteWires(twoWires) === false);
check("  ↳ 그 유형의 감지기는 정상 발화", detectTwoWiresFieldForce(twoWires) === true);

const curl = A(
  "자계의 회전",
  "자유 공간에 자계 H = 20x²a_z가 있다. 한 변이 1인 정사각형 폐경로 abcd를 따라 선적분한 뒤 면적 극한을 취해 ∇×H를 구한다.",
);
check("선적분→회전 유형은 양보", detectBentSemiInfiniteWires(curl) === false);
check("  ↳ 그 유형의 감지기는 정상 발화", detectCurlLineIntegral(curl) === true);

check(
  "정전계(전하) 문맥은 양보",
  detectBentSemiInfiniteWires(
    A("점전하와 선전하의 합성 전계", "y축을 따라 놓인 무한 선전하와 점전하에 의한 무한히 먼 곳에서의 합성 전계를 구한다."),
  ) === false,
);
check(
  "시변 자속(패러데이)은 양보",
  detectBentSemiInfiniteWires(
    A("시변 자속과 유도 전류", "y축을 따라 놓인 ㄷ자 도체에 시간에 따라 변하는 자속이 지나 유도 기전력과 유도 전류를 구한다."),
  ) === false,
);

// ── 3. 물리 — 생성물을 독립 재검산 ──────────────────────────────────────────
console.log("\n[3] 생성물 물리 재검산 (닫힌형 독립 계산)");

/** 반무한 직선 자계 닫힌형 — P(a,b,0), c=√(a²+b²). */
function closedForm(a, b) {
  const c = Math.hypot(a, b);
  return {
    c,
    H1: (c + b) / (4 * a * c), // ×I/π
    H2: (c + a) / (4 * b * c), // ×I/π
    H3: (a + b + c) / (4 * a * b), // ×I/π
  };
}

let physOk = 0;
let physBad = 0;
const seen = new Set();
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 14; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: "bent_semi_infinite_wires" });
    const body = `${inst.content}\n${inst.givens.join("\n")}\n${inst.answer}`;
    seen.add(body);
    // 본문에서 P(a,b,0)과 정답의 I·k를 뽑아 독립 검산
    const mp = /P\((\d+),\s*(\d+),\s*0\)/.exec(body);
    const mk = /\\dfrac\{(\d+)\}\{\\pi\}\\mathbf\{a\}_z/.exec(body);
    const mi = /I\s*=\s*(\d+)\\,\[\\mathrm\{A\}\]/.exec(body);
    if (!mp || !mk || !mi) {
      physBad++;
      console.log(`    ✗ 파싱 실패 (${mode}/${seed})`);
      continue;
    }
    const a = Number(mp[1]), b = Number(mp[2]), k = Number(mk[1]), I = Number(mi[1]);
    const cf = closedForm(a, b);
    // H₃ = I·(a+b+c)/(4πab) 가 정확히 k/π 인가
    const ok = Math.abs(I * cf.H3 - k) < 1e-9 && Number.isInteger(cf.c);
    if (ok) physOk++;
    else {
      physBad++;
      console.log(`    ✗ 불일치 a=${a} b=${b} k=${k} I=${I} → I·H3=${(I * cf.H3).toFixed(6)}`);
    }
  }
}
check(`생성물 28개 물리 재검산 (${physOk} ok / ${physBad} bad)`, physBad === 0);
check("유사·변형이 서로 다른 문제를 만든다", seen.size > 1, `distinct=${seen.size}`);

// 원본 값 검산
const orig = closedForm(3, 4);
check(
  "원본(3,4,5) 닫힌형: H₁=3/20·I/π, H₂=1/10·I/π, H₃=1/4·I/π → I=4",
  Math.abs(orig.H1 - 3 / 20) < 1e-12 &&
    Math.abs(orig.H2 - 1 / 10) < 1e-12 &&
    Math.abs(orig.H3 - 1 / 4) < 1e-12 &&
    Math.abs(1 / orig.H3 - 4) < 1e-12,
);

// 원본 튜플은 생성 풀에서 제외돼야 한다
let originalEmitted = false;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 40; seed++) {
    const inst = generateElectromagnetics({ seed, mode, entryId: "bent_semi_infinite_wires" });
    const body = `${inst.content}\n${inst.answer}`;
    if (/P\(3,\s*4,\s*0\)/.test(body) && /\\dfrac\{1\}\{\\pi\}\\mathbf\{a\}_z/.test(body)) originalEmitted = true;
  }
}
check("원본 튜플(3,4,k=1)은 생성되지 않는다", originalEmitted === false);

// ── 4. 발문·figure 구조 ─────────────────────────────────────────────────────
console.log("\n[4] 발문·figure 구조");
const sim = generateElectromagnetics({ seed: 3, mode: "exam_similar", entryId: "bent_semi_infinite_wires" });
check("3단계 발문", (sim.question.match(/\[단계 \d\]/g) ?? []).length === 3);
check("[단계 1]은 y축 전류의 H₁", /단계 1.*y.*축의 전류/s.test(sim.question));
check("[단계 2]는 x축 전류의 H₂", /단계 2.*x.*축의 전류/s.test(sim.question));
check("유사유형은 전류 I를 구한다", /전류 .*I.*를 풀이 과정과 함께 구한다/.test(sim.question));
const varn = generateElectromagnetics({ seed: 3, mode: "exam_variant", entryId: "bent_semi_infinite_wires" });
check("변형유형은 합성 자계 H₃를 구한다 (구하는 양 교환)", /합성 자계.*H.*_3.*를 풀이 과정과 함께 구한다/s.test(varn.question));
check("풀이에 반무한 직선 공식이 있다", /반무한 직선/.test(sim.steps.join("\n")));

const svg = renderEmFieldDiagram(sim.diagram);
check("figure geometry = bent_wire_axes", sim.diagram?.geometry === "bent_wire_axes");
check("SVG 렌더 성공", svg.startsWith("<svg") && !svg.includes("미지원"));
check("좌표축 x·y·z 라벨 존재", [">x<", ">y<", ">z<"].every((t) => svg.includes(t)));
check("원점 O 표시", svg.includes(">O<"));
check("측정점 P 라벨", /P\(\d+, ?\d+, ?0\)/.test(svg));
check("LaTeX 원문이 그대로 새지 않음", !svg.includes("\\mathrm") && !svg.includes("\\dfrac"));

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exitCode = 1;
