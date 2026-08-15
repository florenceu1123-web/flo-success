/**
 * T 플립플롭 체인 + R-2R DAC + OPAMP (임용 10번 형식) 정적 스모크 — API 없음.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeTffDacChain.mjs
 *
 * ★ 사용자 지정(2026-08-04): 원본의 **D 플립플롭 → T 플립플롭**으로 출제한다.
 *   배선은 원본과 동일(T_0 = A, T_b = Q_{b-1}, 공통 클럭)하고 소자만 T-FF.
 *   D는 `Q ← 입력`(한 클럭 지연)이지만 **T는 여기 관계 Q(t+1) = Q(t) ⊕ T**.
 *
 * ★ 재검산은 생성기를 쓰지 않고 **A 입력열로 T-FF 체인을 직접 시뮬레이션**해 대조한다.
 */
import { generateShiftRegisterDac } from "@/lib/generation/topologies/counterDacComparator";
import { writeShiftRegisterDacText } from "@/lib/generation/topologies/shiftRegisterDacTextWriter";

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`); }
}
/** 정답 파형에서 신호 시퀀스 추출 (꼬리 샘플 제외). */
const seqOf = (gen, name) => {
  const s = (gen.waveformSolution.signals ?? []).find((x) => x.name === name);
  const pts = (s?.samples ?? []).slice();
  return pts.slice(0, Math.max(0, pts.length - 1)).map((p) => Number(p.v));
};
/** ★ 독립 시뮬레이션 — T-FF 체인(동기). */
function simulateTffChain(aSeq, bits) {
  let q = Array(bits).fill(0);
  const out = Array.from({ length: bits }, () => []);
  for (const A of aSeq) {
    const next = Array(bits).fill(0);
    next[0] = q[0] ^ A;
    for (let b = 1; b < bits; b++) next[b] = q[b] ^ q[b - 1];   // 직전 클럭 값 사용
    q = next;
    for (let b = 0; b < bits; b++) out[b].push(q[b]);
  }
  return out;
}

// ── 1. 논리 구조 (게이트가 T-FF인가) ─────────────────────────────────────────
console.log("[1] 논리 구조 — T 플립플롭 체인");
{
  const g = generateShiftRegisterDac({ bits: 3, seed: 11, mode: "exam_similar" });
  const gates = g.mixedCircuit.logic.gates;
  check("FF 3개", gates.length === 3, String(gates.length));
  check("모든 FF가 TFF", gates.every((x) => x.type === "TFF"), gates.map((x) => x.type).join(","));
  check("DFF 없음", !gates.some((x) => x.type === "DFF"));
  check("T_0 입력 = A", gates[0].inputs[0] === "A", gates[0].inputs[0]);
  check("T_b 입력 = Q_{b-1}", gates[1].inputs[0] === "Q_0" && gates[2].inputs[0] === "Q_1");
  check("공통 클럭", gates.every((x) => x.clockSignal === "CLK"));
  check("출력 Q_0·Q_1·Q_2", gates.map((x) => x.output).join(",") === "Q_0,Q_1,Q_2");
  check("structure = tff_dac_chain", g.values.structure === "tff_dac_chain", g.values.structure);
}

// ── 2. 동작 재검산 (독립 시뮬레이션) ─────────────────────────────────────────
console.log("[2] 토글 동작 독립 재검산 (24 시드 × 2 모드)");
{
  let badSim = 0, badVo = 0, degenerate = 0, sameAsShift = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 24; s++) {
      const g = generateShiftRegisterDac({ bits: 3, seed: s * 613, mode });
      const bits = g.values.bits;
      const aSeq = seqOf(g, "A");
      const want = simulateTffChain(aSeq, bits);
      for (let b = 0; b < bits; b++) {
        if (seqOf(g, `Q_${b}`).join("") !== want[b].join("")) badSim++;
      }
      // V_o = Σ 2^b·Q_b × vStep
      const voSeq = seqOf(g, "V_o");
      const vStep = g.values.vStep;
      for (let t = 0; t < voSeq.length; t++) {
        let w = 0;
        for (let b = 0; b < bits; b++) w += want[b][t] * (1 << b);
        if (Math.abs(voSeq[t] - w * vStep) > 1e-9) badVo++;
      }
      // 퇴화 방지 — Q가 전부 상수면 문제가 무의미
      if (want.every((q) => q.every((x) => x === q[0]))) degenerate++;
      // ★ D-FF 시프트(Q_b = A(t−b))와 **다른** 동작이어야 한다 (변경이 실제로 반영됐는지)
      const shift = Array.from({ length: bits }, (_, b) =>
        aSeq.map((_, t) => (t - b >= 0 ? aSeq[t - b] : 0)));
      if (shift.every((q, b) => q.join("") === want[b].join(""))) sameAsShift++;
    }
  }
  check("Q 시퀀스 = 독립 T-FF 시뮬레이션", badSim === 0, `불일치 ${badSim}`);
  check("V_o = DAC 가중합", badVo === 0, `불일치 ${badVo}`);
  check("퇴화(상수 Q) 없음", degenerate === 0, `${degenerate}건`);
  check("★ D-FF 시프트 동작과 다름", sameAsShift === 0, `${sameAsShift}건이 시프트와 동일`);
}

// ── 3. 발문·정답 텍스트 ─────────────────────────────────────────────────────
console.log("[3] 발문·정답 — T 플립플롭 표기와 정답 일치");
{
  let badWord = 0, badAns = 0, badStep = 0;
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 1; s <= 8; s++) {
      const g = generateShiftRegisterDac({ bits: 3, seed: s * 977, mode });
      const t = writeShiftRegisterDacText({ generation: g, mode });
      const all = `${t.content}\n${t.conditions.join("\n")}\n${t.question}\n${t.answer}\n${t.solution}`;
      // D 플립플롭·시프트 표기가 남아 있으면 안 된다
      if (/D\s*플립플롭|시프트\s*레지스터|시프트레지스터|D_0/.test(all)) badWord++;
      if (!/T\s*플립플롭/.test(t.content) || !/Q_b\(t\+1\)\s*=\s*Q_b\(t\)\s*⊕/.test(t.conditions.join(" "))) badWord++;
      for (const m of ["[단계 1]", "[단계 2]", "[단계 3]"]) {
        if (!t.question.includes(m) || !t.answer.includes(m) || !t.solution.includes(m)) badStep++;
      }
      // ★ 1 LSB(vStep)는 분수 표기로 통일 — 소수가 남으면 전역 분수 변환기가 "1.25"와 "5/4"를 뒤섞는다.
      const stepDec = String(g.values.vStep);
      if (stepDec.includes(".") && all.includes(stepDec)) badWord++;
      // [단계 1] 정답의 Q_1 열이 정답 파형과 일치하는가
      const mk = (g.waveformSolution.markers ?? []).find((m) => m.label === "㉡");
      const markerIdx = Math.max(0, Math.round(Number(mk.t) - 0.5));
      const spanEnd = Math.max(1, markerIdx);
      const q1 = seqOf(g, "Q_1").slice(0, spanEnd).join(" → ");
      if (!t.answer.includes(`Q_1 : ${q1}`)) badAns++;
      // [단계 3] 정답의 V_o가 마커 지점 값과 일치하는가
      const vo = seqOf(g, "V_o")[markerIdx];
      if (!t.answer.includes(`V_o = ${g.answer.Vplus_at_marker}[V]`) ||
          Math.abs(vo - g.answer.Vplus_at_marker) > 1e-9) badAns++;
      // ㉡ 지점 Q 논릿값이 정답에 명시되는가 (원본 [단계 3] 요구)
      for (let b = 0; b < g.values.bits; b++) {
        if (!t.answer.includes(`Q_${b}=${seqOf(g, `Q_${b}`)[markerIdx]}`)) badAns++;
      }
    }
  }
  check("D-FF/시프트 표기 잔존 0 · T-FF 표기 존재", badWord === 0, `위반 ${badWord}`);
  check("[단계 1~3] 구조", badStep === 0, `위반 ${badStep}`);
  check("정답이 파형과 일치 (Q_1 열·㉡ 논릿값·V_o)", badAns === 0, `위반 ${badAns}`);
}

// ── 4. 형제 회귀 — JK 카운터(임용 8번) 경로는 그대로 ────────────────────────
console.log("[4] 형제 회귀 — JK 카운터 경로 무영향");
{
  const { generateCounterDacComparator } = await import("@/lib/generation/topologies/counterDacComparator");
  const g = generateCounterDacComparator({ seed: 5, mode: "exam_similar" });
  const types = g.mixedCircuit.logic.gates.map((x) => x.type);
  // JK 경로는 JKFF + (Q̄ 생성용) NOT 게이트로 구성된다 — TFF가 섞이지 않았는지만 본다.
  check("JK 경로는 JKFF 유지 · TFF 미混入", types.includes("JKFF") && !types.includes("TFF"), types.join(","));
  check("JK 경로 structure ≠ tff_dac_chain", g.values.structure !== "tff_dac_chain", g.values.structure);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
