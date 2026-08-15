/**
 * smokeJkClockEdge — JK 동기식 카운터(임용 6번)의 **클럭 에지·입력 버블 회귀** 스모크.
 *
 * ★ 왜 필요한가 (사용자 신고 2026-08-05):
 *   ① "clk가 하강엣지로 작용하는데 문제는 상승엣지로 생성되었어"
 *      → 원본 (가)의 CP 입력에는 **버블**이 있다(하강 에지). 렌더러는 삼각형만 그렸고,
 *        (나) 타이밍 도표의 Q 전이도 **상승 에지**에 찍혀 있었다.
 *   ② "생성된 회로에는 Q0 f/f 입력에 not 게이트가 있어"
 *      → 반전 신호를 **Q̄ 출력에서 배선**하면서 목적지 J·K에 **반전 버블까지** 덧그려
 *        이중 반전(= 사실상 Q)이 됐다. 원본의 J·K 입력에는 버블이 없다.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeJkClockEdge.mjs
 */
import { generateJkStateMachine, generateJkStateMachineVariant, stateBits } from "../lib/generation/topologies/jkStateMachine.ts";
import { renderJkStateMachineCircuit } from "../lib/renderers/jkStateMachineCircuitRenderer.ts";
import { detectClockEdgeFromText, detectClockEdge } from "../lib/analysis/clockEdge.ts";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ok   ${m}`); };
const bad = (m) => { fail++; console.log(`  FAIL ${m}`); };

// ─────────────────────────────────────────────────────────────
console.log("=== 1. 클럭 에지 감지 (표현 변형 흡수) ===");
const FALLING_TEXTS = [
  "JK 플립플롭 동기식 카운터 분석. 클럭 펄스 CP의 하강 에지에서 상태가 변한다.",
  "세 플립플롭은 CP의 하강 엣지에서 트리거된다.",
  "negative-edge triggered JK flip-flops with common clock",
  "클럭 입력에 버블이 표시되어 있다.",
  "CP가 하강할 때 출력이 갱신된다.",
];
for (const t of FALLING_TEXTS) {
  detectClockEdgeFromText(t) === "falling" ? ok(`falling 감지: "${t.slice(0, 26)}…"`) : bad(`falling 미감지: "${t}"`);
}
const RISING_TEXTS = [
  "클럭의 상승 에지에서 동작하는 동기식 카운터",
  "positive edge triggered flip-flop",
];
for (const t of RISING_TEXTS) {
  detectClockEdgeFromText(t) === "rising" ? ok(`rising 감지: "${t.slice(0, 26)}…"`) : bad(`rising 미감지: "${t}"`);
}
const NEUTRAL_TEXTS = [
  "JK 플립플롭을 이용한 동기식 카운터 회로의 상태 전이를 분석한다.",
  "상승 에지와 하강 에지의 차이를 설명한다.", // 둘 다 → 판단 보류
];
for (const t of NEUTRAL_TEXTS) {
  detectClockEdgeFromText(t) === null ? ok(`판단 보류(null): "${t.slice(0, 26)}…"`) : bad(`보류돼야 하는데 판정함: "${t}"`);
}
detectClockEdge({ topic: "JK 카운터", interpretation: "CP의 하강 에지에서 트리거", relatedConcepts: [], fillInTheBlanks: [] }) === "falling"
  ? ok("AnalysisResult 형태에서도 감지")
  : bad("AnalysisResult 감지 실패");
detectClockEdge(null) === null ? ok("analysis 없으면 null") : bad("analysis 없을 때 null이 아님");

// ─────────────────────────────────────────────────────────────
console.log("\n=== 2. 타이밍 도표 — Q 전이가 지정 에지에 놓인다 ===");
// CP: t=2k 상승, t=2k+1 하강 (zero-order hold). 전이 시각 = 값이 바뀌는 샘플의 t.
const transitionTimes = (sig) => {
  const out = [];
  for (let i = 1; i < sig.samples.length; i++) {
    if (sig.samples[i].v !== sig.samples[i - 1].v) out.push(sig.samples[i].t);
  }
  return out;
};
for (const edge of ["falling", "rising"]) {
  const gen = generateJkStateMachine({ index: 0, clockEdge: edge });
  const qSigs = gen.waveformSolution.signals.filter((s) => s.name.startsWith("Q"));
  const allT = qSigs.flatMap(transitionTimes);
  const wantOdd = edge === "falling";
  allT.length > 0 && allT.every((t) => (t % 2 === 1) === wantOdd)
    ? ok(`${edge}: Q 전이 ${allT.length}개가 모두 ${wantOdd ? "하강(홀수 t)" : "상승(짝수 t)"} 에지`)
    : bad(`${edge}: 전이 시각이 어긋남 — ${JSON.stringify(allT)}`);
  // CP 자체는 두 모드에서 동일해야 한다.
  const cp = gen.waveformSolution.signals.find((s) => s.name === "CP");
  cp && cp.samples[0].v === 1 && cp.samples[1].t === 1 && cp.samples[1].v === 0
    ? ok(`${edge}: CP 파형 불변(t=0 상승·t=1 하강)`)
    : bad(`${edge}: CP 파형이 바뀌었다`);
}

console.log("\n=== 3. 샘플 시각 단조 증가 (waveform_time_not_monotonic 방지) ===");
{
  let mono = true;
  for (const edge of ["falling", "rising"]) {
    for (let i = 0; i < 6; i++) {
      for (const gen of [generateJkStateMachine({ index: i, clockEdge: edge }), generateJkStateMachineVariant({ index: i, clockEdge: edge })]) {
        for (const wf of [gen.waveformTemplate, gen.waveformSolution]) {
          for (const s of wf.signals) {
            for (let k = 1; k < s.samples.length; k++) if (s.samples[k].t <= s.samples[k - 1].t) mono = false;
          }
        }
      }
    }
  }
  mono ? ok("모든 모드·시드에서 t 단조 증가") : bad("같은 t가 중복된 샘플이 있다");
}

console.log("\n=== 4. 상태 순환은 에지와 무관 (회귀) ===");
{
  const f = generateJkStateMachine({ index: 0, clockEdge: "falling" });
  const r = generateJkStateMachine({ index: 0, clockEdge: "rising" });
  const cyc = (g) => g.cycle.map(stateBits).join("→");
  cyc(f) === cyc(r) && cyc(f) === "000→001→010→100→101→110"
    ? ok(`사이클 보존: ${cyc(f)}`)
    : bad(`사이클이 달라졌다: falling=${cyc(f)} rising=${cyc(r)}`);
  const nc = (g) => g.nonCyclic.map((n) => stateBits(n.state)).join(",");
  nc(f) === "011,111" && nc(r) === "011,111"
    ? ok(`비순환 상태 보존: ${nc(f)}`)
    : bad(`비순환 상태가 달라졌다: ${nc(f)} / ${nc(r)}`);
  // 마커 시점의 상태도 두 모드에서 같아야 한다(전이 위치만 다르고 순서는 같다).
  JSON.stringify(f.markerStates) === JSON.stringify(r.markerStates)
    ? ok("마커 상태값 동일")
    : bad("마커 상태값이 달라졌다");
}

console.log("\n=== 5. 렌더 — 클럭 버블 / J·K 입력 버블 ===");
{
  const c = generateJkStateMachine({ index: 0 }).config;
  const base = { j0: c.J0, k0: c.K0, j1: c.J1, k1: c.K1, j2: c.J2, k2: c.K2 };
  const CLK_PIN_Y = 190 - 88 / 2 + 88 - 14;      // 렌더러 상수와 동일 (clkPinY)
  const FF_X = [150, 430, 710];
  const circles = (svg) => [...svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([\d.]+)"/g)]
    .map((m) => ({ x: +m[1], y: +m[2], r: +m[3] }));

  const svgF = renderJkStateMachineCircuit({ ...base, clockEdge: "falling" });
  const svgR = renderJkStateMachineCircuit({ ...base, clockEdge: "rising" });
  const svgD = renderJkStateMachineCircuit({ ...base }); // 미지정 → 원본(falling)

  const clkBubbles = (svg) => circles(svg).filter((c2) => Math.abs(c2.y - CLK_PIN_Y) < 1 && FF_X.some((x) => Math.abs(c2.x - (x - 5)) < 1));
  clkBubbles(svgF).length === 3 ? ok("falling: FF 3개 클럭 입력에 버블 3개") : bad(`falling: 클럭 버블 ${clkBubbles(svgF).length}개 (3 기대)`);
  clkBubbles(svgR).length === 0 ? ok("rising: 클럭 버블 없음") : bad(`rising: 클럭 버블이 그려졌다 (${clkBubbles(svgR).length}개)`);
  clkBubbles(svgD).length === 3 ? ok("clockEdge 미지정 → 원본(하강) 기본값") : bad("미지정 기본값이 하강이 아니다");

  // J·K 입력 y좌표 (jY=CY-22, kY=CY+22) 근처의 버블은 이중 반전 버그.
  const jY = 190 - 22, kY = 190 + 22;
  const inputBubbles = (svg) => circles(svg).filter((c2) =>
    (Math.abs(c2.y - jY) < 1 || Math.abs(c2.y - kY) < 1) && FF_X.some((x) => Math.abs(c2.x - (x - 5)) < 1));
  inputBubbles(svgF).length === 0 ? ok("J·K 입력에 반전 버블 없음(이중 반전 제거)") : bad(`J·K 입력에 버블 ${inputBubbles(svgF).length}개 — 이중 반전`);

  // 반전 신호는 Q̄ 출력 핀(qbY)에서 출발해야 한다. TARGET의 J0=nQ1 → FF1의 Q̄(y=206)에서 시작하는 선 존재.
  const qbY = 190 + 16;
  const startsAtQbar = new RegExp(`<line x1="${FF_X[1] + 78}" y1="${qbY}"`).test(svgF);
  startsAtQbar ? ok("반전 신호(J₀=Q̄₁)가 FF₁의 Q̄ 출력에서 배선") : bad("반전 신호가 Q̄ 출력에서 나오지 않는다");

  // 변형(게이트 포함)에서도 클럭 버블이 유지되는지.
  const vgen = generateJkStateMachineVariant({ index: 0 });
  const vc = vgen.variantConfig;
  const svgV = renderJkStateMachineCircuit({
    j0: vc.J0, k0: vc.K0, j1: vc.J1, k1: vc.K1, j2: "", k2: "",
    gate: { op: vc.J2.op, a: "Q0", b: "Q1" }, clockEdge: "falling",
  });
  clkBubbles(svgV).length === 3 ? ok("변형(게이트 포함)에서도 클럭 버블 3개") : bad("변형에서 클럭 버블 누락");
  svgV.includes("<svg") && svgV.includes("JK-FF") ? ok("변형 렌더 정상") : bad("변형 렌더 깨짐");
}

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exit(1);
