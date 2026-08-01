/**
 * 신규 archetype 5종 결정론 smoke — generator → renderer SVG 산출 검증.
 *
 *  대상 (모두 GPT/dev 서버 불필요한 결정론 generator):
 *   [1] flashAdc2bit          — 2비트 플래시 ADC (저항사다리+3비교기+인코더, 임용 6번 mixed_signal)
 *   [2] srFfMuxSequential     — SR-FF 2개 + 2×1 MUX 4개 상태순환 (임용 10번 정보과 digital_logic)
 *   [3] zenerBjtRegulator     — 제너+BJT 션트 레귤레이터 (임용 8번 electronics)
 *   [4] acDcSuperpositionRc   — AC+DC 중첩 RC (스위치 없음, 임용 12번 circuit_theory) + dual(변형)
 *   [5] viTheveninMaxPower    — 2전압원+2전류원 테브난+최대전력 (임용 5번, max_power_transfer 분기)
 *
 *  각 case: 여러 seed로 generate → circuitDiagram 렌더 → SVG 비어있지 않음 +
 *           답/구조 불변식 sanity check.
 *
 *  실행: npx tsx scripts/smokeNewArchetypes.ts
 */
import { generateFlashAdc2bit } from "../lib/generation/topologies/flashAdc2bit";
import { renderFlashAdc2bitCircuit } from "../lib/renderers/flashAdc2bitCircuitRenderer";
import { generateSrFfMuxSequential } from "../lib/generation/topologies/srFfMuxSequential";
import { renderSrFfMuxSequentialCircuit } from "../lib/renderers/srFfMuxSequentialCircuitRenderer";
import { generateZenerBjtRegulator } from "../lib/generation/topologies/zenerBjtRegulator";
import { renderZenerBjtRegulatorCircuit } from "../lib/renderers/zenerBjtRegulatorCircuitRenderer";
import {
  generateAcDcSuperpositionRc,
  generateAcDcSuperpositionRcDual,
} from "../lib/generation/topologies/acDcSuperpositionRc";
import { renderAcDcSuperpositionRcCircuit } from "../lib/renderers/acDcSuperpositionRcCircuitRenderer";
import { renderAcDcSuperpositionRcDualCircuit } from "../lib/renderers/acDcSuperpositionRcDualCircuitRenderer";
import { generateViTheveninMaxPower } from "../lib/generation/topologies/viTheveninMaxPower";
import { renderViTheveninMaxPowerCircuit } from "../lib/renderers/viTheveninMaxPowerCircuitRenderer";
import { generateAsyncPresetCounter } from "../lib/generation/topologies/asyncPresetCounter";
import { renderAsyncPresetCounterCircuit } from "../lib/renderers/asyncPresetCounterCircuitRenderer";
import {
  generateRlcResonanceBandwidth,
  generateRlcResonanceBandwidthDual,
} from "../lib/generation/topologies/rlcResonanceBandwidth";
import { renderRlcResonanceBandwidthCircuit } from "../lib/renderers/rlcResonanceBandwidthCircuitRenderer";
import { renderRlcResonanceBandwidthDualCircuit } from "../lib/renderers/rlcResonanceBandwidthDualCircuitRenderer";
import { generateOpampTwoStage as generateOpampTwoStage2, __originalForVerify as __originalForVerify2 } from "../lib/generation/topologies/opampTwoStage";
import { renderOpampTwoStage as renderOpampTwoStage2 } from "../lib/renderers/opampTwoStageCircuitRenderer";
import { generateAcBridgeMaxPower as generateAcBridgeMaxPower2, __originalBridgeForVerify as __originalBridgeForVerify2 } from "../lib/generation/topologies/acBridgeMaxPower";
import { renderAcBridgeCircuit as renderAcBridgeCircuit2, renderAcBridgeThevenin as renderAcBridgeThevenin2 } from "../lib/renderers/acBridgeCircuitRenderer";
import { generateAcTheveninLadder, __originalLadderForVerify } from "../lib/generation/topologies/acTheveninLadder";
import { renderAcTheveninLadderCircuit, renderAcTheveninEquivCircuit } from "../lib/renderers/acTheveninLadderCircuitRenderer";
import { generateOpampThreeStageSum, __originalThreeStageSumForVerify } from "../lib/generation/topologies/opampThreeStageSum";
import { renderOpampThreeStageSumCircuit } from "../lib/renderers/opampThreeStageSumCircuitRenderer";
import { generateDcTheveninTwoSource, __originalDcTheveninForVerify } from "../lib/generation/topologies/dcTheveninTwoSource";
import { renderDcThevenin2srcCircuit, renderDcTheveninEquivCircuit } from "../lib/renderers/dcTheveninTwoSourceCircuitRenderer";
import { generateAcPowerFactor, __originalAcPowerFactorForVerify } from "../lib/generation/topologies/acPowerFactor";
import { renderAcPowerFactorCircuit } from "../lib/renderers/acPowerFactorCircuitRenderer";
import { generateSwitchedRcDcTransient as genSwRc, __originalRcForVerify as __origRc } from "../lib/generation/topologies/switchedRcDcTransient";
import { renderSwitchedRcDcCircuit as renderSwRc } from "../lib/renderers/switchedRcDcCircuitRenderer";
import { generateDffStateDesign } from "../lib/generation/topologies/dffStateDesign";
import { renderDffStateDesignCircuit } from "../lib/renderers/dffStateDesignCircuitRenderer";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) pass += 1;
  else fail += 1;
}

/** SVG 문자열이 렌더 가능한 형태인지 (비어있지 않은 <svg> 루트). */
function isValidSvg(svg: unknown): boolean {
  return typeof svg === "string" && svg.includes("<svg") && svg.includes("</svg>") && svg.length > 200;
}

const SEEDS = [0, 1, 2, 3, 4];

// ── [1] flashAdc2bit ──────────────────────────────────────────────
console.log("\n[1] flashAdc2bit (2비트 플래시 ADC)");
for (const seed of SEEDS) {
  const gen = generateFlashAdc2bit({ seed, mode: "exam_similar" });
  const svg = renderFlashAdc2bitCircuit(gen.circuitDiagram);
  check(`seed=${seed} SVG`, isValidSvg(svg), `${(svg as string).length}자`);
  check(
    `seed=${seed} 빈칸 4개(㉠~㉣)`,
    gen.blankAnswers.length === 4,
    gen.blankAnswers.map((b) => `${b.symbol}=${b.answer}`).join(" "),
  );
  check(`seed=${seed} Q1·Q0 식 존재`, !!gen.q1Expr && !!gen.q0Expr, `Q1=${gen.q1Expr}, Q0=${gen.q0Expr}`);
}

// ── [2] srFfMuxSequential ─────────────────────────────────────────
console.log("\n[2] srFfMuxSequential (SR-FF + 2×1 MUX 4개)");
for (const mode of ["exam_similar", "exam_variant"] as const) {
  for (const seed of [0, 1]) {
    const gen = generateSrFfMuxSequential({ seed, mode });
    const svg = renderSrFfMuxSequentialCircuit(gen.circuitDiagram);
    check(`${mode} seed=${seed} SVG`, isValidSvg(svg), `${(svg as string).length}자`);
    check(`${mode} seed=${seed} 빈칸 4개`, gen.blankAnswers.length === 4);
    // 핵심 설계 규칙: select=Q_A면 빈칸 FF=B (exam_similar), select=Q_B면 빈칸 FF=A (exam_variant)
    const consistent =
      (gen.selectVar === "Q_A" && gen.dataVar === "Q_B") ||
      (gen.selectVar === "Q_B" && gen.dataVar === "Q_A");
    check(`${mode} seed=${seed} 선택선↔데이터변수 직교`, consistent, `select=${gen.selectVar}, data=${gen.dataVar}`);
    check(`${mode} seed=${seed} cycle 4-state`, gen.cycleSeq.length === 4, gen.cycleSeq.join("→"));
  }
}

// ── [3] zenerBjtRegulator ─────────────────────────────────────────
console.log("\n[3] zenerBjtRegulator (제너+BJT 션트 레귤레이터)");
for (const seed of SEEDS) {
  const gen = generateZenerBjtRegulator({ seed });
  const svg = renderZenerBjtRegulatorCircuit(gen.circuitDiagram);
  const a = gen.answer;
  check(`seed=${seed} SVG`, isValidSvg(svg), `${(svg as string).length}자`);
  // V_o = V_z + V_BE
  check(`seed=${seed} V_o=V_z+V_BE`, Math.abs(a.Vo - (gen.values.Vz + gen.values.Vbe)) < 1e-6, `V_o=${a.Vo}`);
  // I_z = I_1 − I_L > 0 (제너 동작)
  check(`seed=${seed} I_z>0`, a.Iz > 0, `I_z=${a.IzmA}mA`);
  check(`seed=${seed} R_4>0`, a.R4 > 0, `R_4=${a.R4}Ω`);
}

// ── [4] acDcSuperpositionRc (유사 + 변형 dual) ────────────────────
console.log("\n[4] acDcSuperpositionRc (AC+DC 중첩 RC)");
for (const seed of SEEDS) {
  const gen = generateAcDcSuperpositionRc({ seed, mode: "exam_similar" });
  const svg = renderAcDcSuperpositionRcCircuit(gen.circuitDiagram);
  check(`유사 seed=${seed} SVG`, isValidSvg(svg), `${(svg as string).length}자`);
  // 교육 포인트: AC 단락이 점 a를 접지에 클램프 → I_R4(AC)=0
  check(`유사 seed=${seed} I_R4(AC)=0`, gen.derived.iR4AcMa === 0, `I_R4(AC)=${gen.derived.iR4AcMa}mA`);
}
for (const seed of SEEDS) {
  const gen = generateAcDcSuperpositionRcDual({ seed });
  const svg = renderAcDcSuperpositionRcDualCircuit(gen.circuitDiagram);
  check(`변형(dual) seed=${seed} SVG`, isValidSvg(svg), `${(svg as string).length}자`);
}

// ── [5] viTheveninMaxPower ────────────────────────────────────────
console.log("\n[5] viTheveninMaxPower (2전압원+2전류원 테브난+최대전력)");
for (const seed of SEEDS) {
  const gen = generateViTheveninMaxPower({ seed });
  const svg = renderViTheveninMaxPowerCircuit(gen.circuitDiagram);
  const a = gen.answer;
  check(`seed=${seed} SVG`, isValidSvg(svg), `${(svg as string).length}자`);
  // R_th = R1 + R2, 최대전력 전달 R_L = R_th
  check(`seed=${seed} R_L=R_th=R1+R2`, a.RL === a.Rth && a.Rth === gen.values.R1 + gen.values.R2, `R_th=${a.Rth}Ω`);
  // P_max = V_th²/(4·R_th). a.Pmax는 W 단위 round3이라 정밀도 손실 — 답 표기값 PmaxMw(mW)로 검증.
  const expectedMw = ((a.Vc * a.Vc) / (4 * a.Rth)) * 1000;
  check(`seed=${seed} P_max=V_th²/(4R_th)`, Math.abs(a.PmaxMw - expectedMw) < 1e-3, `P_max=${a.PmaxMw}mW (기대 ${expectedMw.toFixed(3)})`);
}

// ── [6] asyncPresetCounter ────────────────────────────────────────
console.log("\n[6] asyncPresetCounter (비동기 SET/RESET D-FF 자동재적재 리플 카운터)");
// 원본 검증: I=101 → ㉠=101, ㉡[0..3]=001,110,010,100 (변형 풀 첫 항이 101)
{
  let g101: ReturnType<typeof generateAsyncPresetCounter> | null = null;
  for (let s = 0; s < 50 && !g101; s++) {
    const g = generateAsyncPresetCounter({ seed: s, mode: "exam_variant" });
    if (g.iStr === "101") g101 = g;
  }
  check("원본 I=101 패턴 생성", !!g101);
  if (g101) {
    check("㉠ = 101", g101.initialStr === "101", `㉠=${g101.initialStr}`);
    const head = g101.sequenceStr.slice(0, 4).join(",");
    check("㉡[0..3] = 001,110,010,100", head === "001,110,010,100", `㉡=${head}`);
    check("000 자동 재적재(F) 발생", g101.hasReload);
  }
}
for (const mode of ["exam_similar", "exam_variant"] as const) {
  for (const seed of [0, 1, 2]) {
    const gen = generateAsyncPresetCounter({ seed, mode });
    const svg = renderAsyncPresetCounterCircuit(gen.circuitDiagram);
    check(`${mode} seed=${seed} 회로 SVG`, isValidSvg(svg), `${(svg as string).length}자`);
    // ㉠ = I (적재값)
    check(`${mode} seed=${seed} ㉠=I 적재`, gen.initialStr === gen.iStr, `㉠=${gen.initialStr}`);
    // ㉡ 시퀀스가 mod-N 다운카운트 (각 스텝 value-1, 0이면 재적재 N)
    let ok = true;
    let prev = gen.nValue;
    for (const st of gen.sequence) {
      const v = st.reduce((a, b, k) => a + (b ? 1 << k : 0), 0);
      const expected = prev === 1 ? gen.nValue : prev - 1;
      if (v !== expected) { ok = false; break; }
      prev = v;
    }
    check(`${mode} seed=${seed} ㉡ mod-${gen.nValue} 다운카운트`, ok, `I=${gen.iStr} ㉡=${gen.sequenceStr.join(",")}`);
    // (나) 파형 = 클럭 + Q 빈 트랙 + ㉠·㉡ 마커
    const wf = gen.waveformDiagram;
    check(`${mode} seed=${seed} 파형 ㉠·㉡ 마커`, (wf.markers ?? []).map((m) => m.label).join("") === "㉠㉡");
  }
}

// ── [7] rlcResonanceBandwidth ─────────────────────────────────────
console.log("\n[7] rlcResonanceBandwidth (직렬 RLC 공진 + 대역폭)");
{
  // 원본 문제 전체 튜플(ω₀=1e4·3.5∥1.5µF·R5·V10·R2 0.5)은 절대 emit 안 됨 (예시 생성 금지).
  //   (캡 분할 3.5/1.5만 다른 R·V·R2와 함께 나오는 것은 답이 다른 별개 문제 — 허용.)
  let origEmitted = false;
  for (let seed = 0; seed < 200; seed++) {
    const v = generateRlcResonanceBandwidth({ seed }).values;
    if (v.omega0 === 1e4 && v.C1_uF === 3.5 && v.C2_uF === 1.5 && v.R === 5 && v.Vpeak === 10 && v.R2 === 0.5) origEmitted = true;
  }
  check("원본 문제 전체 튜플 미생성", !origEmitted);
}
// 유사유형 = 직렬 RLC (공식 불변식: L=1/(ω₀²C_eq), β=R/L, V_ab=Vp/R·ω₀L∠−90, β₁/β₂=R/R₂)
for (const seed of [0, 1, 2]) {
  const g = generateRlcResonanceBandwidth({ seed });
  const v = g.values, a = g.answer;
  check(`유사 seed=${seed} 회로 SVG`, isValidSvg(renderRlcResonanceBandwidthCircuit(g.circuitDiagram)));
  const Ceq = v.Ceq_uF * 1e-6, L = a.L_mH * 1e-3;
  check(`유사 s${seed} L=1/(ω₀²C_eq)`, Math.abs(L - 1 / (v.omega0 ** 2 * Ceq)) < 1e-9, `L=${a.L_mH}mH`);
  check(`유사 s${seed} β₁=R/L`, Math.abs(a.beta1 - v.R / L) < 1, `β₁=${a.beta1}`);
  check(`유사 s${seed} V_ab=Vp/R·ω₀L∠−90`, Math.abs(a.VabMag - (v.Vpeak / v.R) * v.omega0 * L) < 0.01 && a.VabPhase === -90, `V_ab=${a.VabMag}∠${a.VabPhase}`);
  check(`유사 s${seed} β₁/β₂=R/R₂`, Math.abs(a.ratio - v.R / v.R2) < 1e-6, `비=${a.ratio}`);
}
// 변형유형 = 쌍대(병렬 RLC): C_d=1/(ω₀²L_d), β·β₁/β₂ 보존, I_ab=인덕터 가지전류
for (const seed of [0, 1, 2]) {
  const g = generateRlcResonanceBandwidthDual({ seed });
  const v = g.values, a = g.answer;
  check(`변형(dual) seed=${seed} 회로 SVG`, isValidSvg(renderRlcResonanceBandwidthDualCircuit(g.circuitDiagram)));
  const Ld = v.Ld_H, Cd = a.Cd_nF * 1e-9, Rd = v.Rd_kohm * 1e3;
  check(`변형 s${seed} C_d=1/(ω₀²L_d)`, Math.abs(Cd - 1 / (v.omega0 ** 2 * Ld)) < 1e-12, `C_d=${a.Cd_nF}nF`);
  check(`변형 s${seed} β₁=1/(R_d·C_d)`, Math.abs(a.beta1 - 1 / (Rd * Cd)) < 1, `β₁=${a.beta1}`);
  check(`변형 s${seed} β₁/β₂=R₂d/R_d`, Math.abs(a.ratio - v.R2d_kohm / v.Rd_kohm) < 1e-6, `비=${a.ratio}`);
  check(`변형 s${seed} I_ab 위상=−90`, a.IabPhase === -90, `I_ab=${a.Iab_mA}∠${a.IabPhase}`);
}

// ── [8] opampTwoStage (T자 피드백 2단 OPAMP) ──────────────────────
console.log("\n[8] opampTwoStage (1단 비반전 → 2단 T자 피드백 반전, V_P→V_i·V_o)");
{
  // 원본 재현 검증: Ra=Rb=1k·Rf2=7k·Rf3=10k → G2=−2.5, V_P=2 → V_i=1·V_o=−5
  const o = __originalForVerify2();
  check("원본 G₂=−2.5", Math.abs(o.values.G2 - -2.5) < 1e-6, `G2=${o.values.G2}`);
  check("원본 V_i=1·V_o=−5", o.answer.Vi === 1 && o.answer.Vo === -5, `Vi=${o.answer.Vi} Vo=${o.answer.Vo}`);
  // 원본 튜플은 생성 풀에서 제외
  let origEmit = false;
  for (const mode of ["exam_similar", "exam_variant"] as const)
    for (let s = 0; s < 50; s++) {
      const x = generateOpampTwoStage2({ seed: s, mode }).values;
      if (x.A1 === 2 && x.Ra_k === 1 && x.Rf2_k === 7 && x.Rf3_k === 10 && x.VP === 2) origEmit = true;
    }
  check("원본 튜플 미생성", !origEmit);
}
for (const mode of ["exam_similar", "exam_variant"] as const) {
  for (const seed of [0, 1, 2]) {
    const g = generateOpampTwoStage2({ seed, mode });
    const v = g.values, a = g.answer;
    check(`${mode} s${seed} 회로 SVG`, isValidSvg(renderOpampTwoStage2(g.circuitDiagram)));
    check(`${mode} s${seed} V_i=V_P/A₁ 정수`, Math.abs(a.Vi - v.VP / v.A1) < 1e-9 && Number.isInteger(a.Vi), `V_i=${a.Vi}`);
    check(`${mode} s${seed} V_o=G₂·V_P`, Math.abs(a.Vo - v.G2 * v.VP) < 1e-6, `V_o=${a.Vo}`);
    check(`${mode} s${seed} A₁=1+Rf1/Rg1`, Math.abs(v.A1 - (1 + v.Rf1_k / v.Rg1_k)) < 1e-9);
    // T자 이득 공식 일관성
    const g2 = -1 / (v.Ra_k * ((v.Rb_k / v.Rf2_k) * (1 / v.Ra_k + 1 / v.Rb_k + 1 / v.Rf3_k) + 1 / v.Rf3_k));
    check(`${mode} s${seed} G₂=T자공식`, Math.abs(v.G2 - g2) < 1e-3, `G2=${v.G2}`);
  }
}

// ── [9] acBridgeMaxPower (AC 휘트스톤 브리지 + 테브난 + 최대전력) ──
console.log("\n[9] acBridgeMaxPower (AC 브리지 + 테브난 + 최대평균전력)");
{
  const o = __originalBridgeForVerify2().answer;
  check("원본 V_A=8·V_B=2·V_TH=6·Z_TH=3−j4·R_L=5·P=2.25",
    o.VA === 8 && o.VB === 2 && o.VTH === 6 && o.Rpar === 3 && o.Xpar === 4 && o.absZth === 5 && o.RL === 5 && o.Pmax === 2.25,
    `V_A=${o.VA} V_B=${o.VB} V_TH=${o.VTH} Z=${o.Rpar}-j${o.Xpar} R_L=${o.RL} P=${o.Pmax}`);
  let origEmit = false;
  for (const mode of ["exam_similar", "exam_variant"] as const)
    for (let s = 0; s < 40; s++) {
      const v = generateAcBridgeMaxPower2({ seed: s, mode }).values;
      if (v.V === 4 && v.Xc1 === 2 && v.Xl === 4 && v.R2 === 6) origEmit = true;
    }
  check("원본 튜플 미생성", !origEmit);
}
for (const mode of ["exam_similar", "exam_variant"] as const) {
  for (const seed of [0, 1, 2]) {
    const g = generateAcBridgeMaxPower2({ seed, mode });
    const v = g.values, a = g.answer;
    check(`${mode} s${seed} 브리지 SVG`, isValidSvg(renderAcBridgeCircuit2(g.bridgeDiagram)));
    check(`${mode} s${seed} 테브난 SVG`, isValidSvg(renderAcBridgeThevenin2(g.theveninDiagram)));
    // 분압·병렬·최대전력 불변식
    check(`${mode} s${seed} V_A=V·Xl/(Xl−Xc1)`, Math.abs(a.VA - v.V * v.Xl / (v.Xl - v.Xc1)) < 1e-6);
    check(`${mode} s${seed} V_B=V·R4/(R2+R4)`, Math.abs(a.VB - v.V * v.R4 / (v.R2 + v.R4)) < 1e-6);
    check(`${mode} s${seed} |Z_TH| 정수·R_L=|Z_TH|`, Number.isInteger(a.absZth) && a.RL === a.absZth, `|Z|=${a.absZth}`);
  }
}

// ── [10] switchedRcDcTransient (t=0 스위치 개방 RC) ──────────────
console.log("\n[10] switchedRcDcTransient (t=0 스위치 개방 RC: v_c(0⁻) + v_o(t))");
{
  const o = __origRc().answer;
  check("원본(RC) v_c(0⁻)=6V·τ=5s", o.init0 === 6 && o.tau === 5, `init0=${o.init0} τ=${o.tau}`);
  let orig = false;
  for (let s = 0; s < 60; s++) {
    const v = genSwRc({ seed: s, mode: "exam_similar" }).values;
    if (v.Vs === 5 && v.Rs === 1 && v.Is === 4 && v.Rload === 2 && v.react === 2.5) orig = true;
  }
  check("원본 튜플 미생성", !orig);
}
// 유사 = RC (커패시터): v_c(0⁻)=(Vs/Rs+Is)/(1/Rs+1/Rl), τ=Rl·C
for (const s of [0, 1, 2]) {
  const g = genSwRc({ seed: s, mode: "exam_similar" });
  const v = g.values, a = g.answer;
  check(`유사(RC) s${s} 회로 SVG·kind`, isValidSvg(renderSwRc(g.circuitDiagram)) && g.kind === "RC");
  const vc = (v.Vs / v.Rs + v.Is) / (1 / v.Rs + 1 / v.Rload);
  check(`유사 s${s} v_c(0⁻) 공식·정수`, Math.abs(a.init0 - vc) < 1e-6 && Number.isInteger(a.init0), `vc0=${a.init0}`);
  check(`유사 s${s} τ=R·C·출력=v_o`, Math.abs(a.tau - v.Rload * v.react) < 1e-9 && a.outCoeff === a.init0 && a.outSym === "v_o(t)");
}
// 변형 = RL (코일): i_L(0⁻)=Vs/Rs+Is, τ=L/Rl, v_o계수=Rl·i_L(0⁻)
for (const s of [0, 1, 2]) {
  const g = genSwRc({ seed: s, mode: "exam_variant" });
  const v = g.values, a = g.answer;
  check(`변형(RL) s${s} 회로 SVG·kind=RL`, isValidSvg(renderSwRc(g.circuitDiagram)) && g.kind === "RL");
  check(`변형 s${s} 코일 라벨(H)`, /H$/.test(g.circuitDiagram.reactLabel) && g.circuitDiagram.reactMeasLabel === "i_L(t)");
  check(`변형 s${s} i_L(0⁻)=Vs/Rs+Is 정수`, Math.abs(a.init0 - (v.Vs / v.Rs + v.Is)) < 1e-6 && Number.isInteger(a.init0), `iL0=${a.init0}`);
  check(`변형 s${s} τ=L/R·출력 i_o(t)=i_L(0⁻)`, Math.abs(a.tau - v.react / v.Rload) < 1e-9 && a.outSym === "i_o(t)" && a.outCoeff === a.init0);
}

// ── [11] dffStateDesign (상태도 설계: ㉠~㉣ + 게이트 ㉮·㉯) ──
//   exam_similar = D-FF + D-FF,  exam_variant = D-FF + T-FF
console.log("\n[11] dffStateDesign (상태도→FF입력→게이트, similar=D·D / variant=D·T)");
for (const mode of ["exam_similar", "exam_variant"] as const) {
  for (const seed of [0, 1]) {
    const g = generateDffStateDesign({ seed, mode });
    const svg = renderDffStateDesignCircuit(g.circuitDiagram);
    check(`${mode} s${seed} 회로 SVG`, isValidSvg(svg), `${(svg as string).length}자`);
    // FF 종류: similar=D·D, variant=D·T
    const expectB = mode === "exam_variant" ? "T" : "D";
    check(`${mode} s${seed} FF 종류 D·${expectB}`, g.ffAType === "D" && g.ffBType === expectB, `${g.ffAType}-FF + ${g.ffBType}-FF`);
    // 자율 상태기계: 4상태 전부 전이 정의(자기루프·합류 허용 — 비-해밀턴 가능)
    check(`${mode} s${seed} 4-state 전이`, g.transitions.length === 4 && g.nextOf.length === 4 && g.nextOf.every((n) => n >= 0 && n <= 3), g.transitions.join(", "));
    // 다음상태 빈칸 ㉠~㉣ 4개
    check(`${mode} s${seed} 다음상태 ㉠~㉣ 4개`, g.nextAnswers.length === 4);
    // 표 일관성: FF_A(D)→입력=다음Q_A. FF_B(D)→입력=다음Q_B / FF_B(T)→입력=Q_B⊕다음Q_B(여기표)
    const tableOk = g.stateTable.rows.every((r) => {
      const o = (r.outputs ?? []).map(Number);
      const dA = o[0] === o[2];                                  // D_A = 다음 Q_A
      const qB = Number((r.inputs ?? [])[1]);                    // 현재 Q_B
      const ffB = g.ffBType === "T" ? ((qB ^ o[1]) === o[3]) : (o[1] === o[3]);
      return dA && ffB;
    });
    check(`${mode} s${seed} FF입력 표 일관성 (${g.inputBName})`, tableOk);
    // 게이트 ㉮·㉯ 도출 (단일 게이트로 떨어짐 — "복합" 아님)
    check(`${mode} s${seed} ㉮·㉯ 단일게이트`, g.dAGate !== "복합" && g.dBGate !== "복합", `㉮=${g.dAGate}, ㉯=${g.dBGate}`);
  }
}

// ── [12] acTheveninLadder (단일 AC원 사다리 + 테브난 + 복소 켤레 최대전력) ──
console.log("\n[12] acTheveninLadder (단일 AC원 L-C-R 사다리 + 테브난 + 복소 켤레 최대전력)");
{
  // 원본 검산: L j2 · C −j1 · R 2 · 4∠0° → Z_TH=2−j2, V_TH=4∠180°, Z_L=2+j2, P=2W
  const o = __originalLadderForVerify().answer;
  check(`원본 Z_TH=2−j2`, o.Zth.re === 2 && o.Zth.im === -2, o.ZthLabel);
  check(`원본 |V_TH|=4`, o.VthMag === 4, o.VthLabel);
  check(`원본 Z_L=2+j2 (켤레)`, o.ZL.re === 2 && o.ZL.im === 2, o.ZLLabel);
  check(`원본 P_max=2W`, o.Pmax === 2, o.PmaxLabel);

  for (const mode of ["exam_similar", "exam_variant"] as const) {
    for (const seed of [0, 1, 2]) {
      const g = generateAcTheveninLadder({ seed, mode });
      const a = g.answer;
      check(`${mode} s${seed} 사다리 SVG`, isValidSvg(renderAcTheveninLadderCircuit(g.ladderDiagram)));
      check(`${mode} s${seed} 등가 SVG`, isValidSvg(renderAcTheveninEquivCircuit(g.equivDiagram)));
      check(`${mode} s${seed} Z_L=Z_TH* (켤레)`, a.ZL.re === a.Zth.re && a.ZL.im === -a.Zth.im, `Z_TH=${a.ZthLabel}, Z_L=${a.ZLLabel}`);
      const pOk = Math.abs(a.Pmax - (a.VthMag * a.VthMag) / (4 * a.Rth)) < 1e-3;
      check(`${mode} s${seed} P=|V_TH|²/(4R_TH)`, a.Rth > 0 && a.Pmax > 0 && pOk, `P=${a.PmaxLabel}`);
      const isOriginal = a.Zth.re === 2 && a.Zth.im === -2 && a.VthMag === 4;
      check(`${mode} s${seed} 원본 튜플 제외`, !isOriginal, a.ZthLabel);
    }
  }
  const variant = generateAcTheveninLadder({ seed: 0, mode: "exam_variant" }).ladderDiagram;
  check(`변형 직렬 C·션트 L (소자 교환)`, variant.ser1Type === "C" && variant.shType === "L", `ser1=${variant.ser1Type}, sh=${variant.shType}`);
}

// ── [13] opampThreeStageSum (3-OPAMP 반전+버퍼+가산, V_x·R_f 도출) ──
console.log("\n[13] opampThreeStageSum (3-OPAMP 반전증폭 V_x + 버퍼 + 반전가산 R_f 도출)");
{
  // 원본 검산: V1=2·Rin1=4·Rf1=8·V2=1·Ra=2·Rb=1·Vo=12 → V_x=−4, R_f=12
  const o = __originalThreeStageSumForVerify().answer;
  check(`원본 V_x=−4`, o.Vx === -4, `V_x=${o.Vx}`);
  check(`원본 R_f=12`, o.Rf === 12, `R_f=${o.Rf}`);

  for (const mode of ["exam_similar", "exam_variant"] as const) {
    for (const seed of [0, 1, 2]) {
      const g = generateOpampThreeStageSum({ seed, mode });
      const v = g.values, a = g.answer;
      check(`${mode} s${seed} 회로 SVG`, isValidSvg(renderOpampThreeStageSumCircuit(g.circuitDiagram)));
      check(`${mode} s${seed} V_x 정수`, Number.isInteger(a.Vx) && a.Vx !== 0, `V_x=${a.Vx}`);
      check(`${mode} s${seed} R_f 양의 정수`, Number.isInteger(a.Rf) && a.Rf > 0, `R_f=${a.Rf}`);
      if (mode === "exam_variant") {
        // 변형 = U3 비반전 가산기. V_o=(1+R_f/R_g)·V_+, V_+ 정수
        check(`${mode} s${seed} U3 비반전`, g.circuitDiagram.u3NonInverting === true && a.nonInv === true);
        check(`${mode} s${seed} R_g 표기`, !!g.circuitDiagram.rgLabel && !!v.Rg);
        const voCheck = (1 + a.Rf / (v.Rg as number)) * (a.Vplus as number);
        check(`${mode} s${seed} V_o=(1+Rf/Rg)·V_+`, Math.abs(voCheck - v.Vo) < 1e-6, `V_o계산=${voCheck}, 목표=${v.Vo}, V_+=${a.Vplus}`);
      } else {
        // 유사 = U3 반전 가산기. V_o=−R_f·(V_x/Ra+V_buf/Rb)
        check(`${mode} s${seed} U3 반전(기본)`, !g.circuitDiagram.u3NonInverting && !a.nonInv);
        const voCheck = -a.Rf * (a.Vx / v.Ra + v.V2 / v.Rb);
        check(`${mode} s${seed} V_o=목표 일치`, Math.abs(voCheck - v.Vo) < 1e-6, `V_o계산=${voCheck}, 목표=${v.Vo}`);
        // 원본 튜플 제외 (유사만 — 변형은 비반전이라 별개)
        const isOrig = v.V1 === 2 && v.Rin1 === 4 && v.Rf1 === 8 && v.V2 === 1 && v.Ra === 2 && v.Rb === 1 && v.Vo === 12;
        check(`${mode} s${seed} 원본 튜플 제외`, !isOrig, `V_x=${a.Vx},R_f=${a.Rf}`);
      }
    }
  }
}

// ── [14] dcTheveninTwoSource (2전압원 병렬가지 → 테브난 등가) ──
console.log("\n[14] dcTheveninTwoSource (2전압원 병렬가지 → R_T·V_T, Millman)");
{
  // 원본 검산: 2Ω+12V(+위) ∥ 6Ω+6V(−위, 극성 반대) → R_T=1.5, V_T=7.5
  const o = __originalDcTheveninForVerify().answer;
  check(`원본 R_T=1.5`, o.Rt === 1.5, `R_T=${o.Rt}`);
  check(`원본 V_T=7.5 (극성 반대)`, o.Vt === 7.5, `V_T=${o.Vt}`);

  for (const mode of ["exam_similar", "exam_variant"] as const) {
    for (const seed of [0, 1, 2]) {
      const g = generateDcTheveninTwoSource({ seed, mode });
      const v = g.values, a = g.answer;
      // exam_similar = 극성 반대(원본 구조 보존), exam_variant = 같은 극성
      if (mode === "exam_similar") check(`${mode} s${seed} 극성 반대(원본 보존)`, v.s1 !== v.s2, `s1=${v.s1},s2=${v.s2}`);
      else check(`${mode} s${seed} 같은 극성(변형)`, v.s1 === v.s2, `s1=${v.s1},s2=${v.s2}`);
      check(`${mode} s${seed} (가) SVG`, isValidSvg(renderDcThevenin2srcCircuit(g.circuitDiagram)));
      check(`${mode} s${seed} (나) SVG`, isValidSvg(renderDcTheveninEquivCircuit(g.equivDiagram)));
      // R_T = R1∥R2 검산
      const rt = (v.R1 * v.R2) / (v.R1 + v.R2);
      check(`${mode} s${seed} R_T=R1∥R2`, Math.abs(a.Rt - rt) < 1e-6, `R_T=${a.Rt}`);
      // V_T = Millman 검산
      const vt = rt * (v.s1 * v.V1 / v.R1 + v.s2 * v.V2 / v.R2);
      check(`${mode} s${seed} V_T=Millman`, Math.abs(a.Vt - vt) < 1e-6, `V_T=${a.Vt}`);
      // 변형(전력): 부하 R_L=R_T·P_max=V_T²/(4R_T) + 완성 회로(부하 그려짐)
      if (mode === "exam_variant") {
        check(`${mode} s${seed} 부하 R_L=R_T`, a.Rl === a.Rt, `R_L=${a.Rl}`);
        const pmax = (a.Vt * a.Vt) / (4 * a.Rt);
        check(`${mode} s${seed} P_max=V_T²/(4R_T)`, a.Pmax !== undefined && Math.abs((a.Pmax as number) - pmax) < 1e-6, `P_max=${a.Pmax}`);
        check(`${mode} s${seed} (가)에 부하 R_L 표기`, g.circuitDiagram.loadLabel === "R_L" && renderDcThevenin2srcCircuit(g.circuitDiagram).includes("R_L"));
      } else {
        check(`${mode} s${seed} 부하 없음(개방)`, g.circuitDiagram.loadLabel === undefined && a.Pmax === undefined);
      }
      // 원본 튜플 제외
      const isOrig = v.V1 === 12 && v.R1 === 2 && v.V2 === 6 && v.R2 === 6 && v.s1 === 1 && v.s2 === 1;
      check(`${mode} s${seed} 원본 튜플 제외`, !isOrig, `R_T=${a.Rt},V_T=${a.Vt}`);
    }
  }
}

// ── [15] acPowerFactor (AC 역률보정 + 전력) ──
console.log("\n[15] acPowerFactor (AC 역률보정: X_C·P_avg·Q·P_s)");
{
  // 원본 검산: V_s=100·R₁=1·X_L=1(R₂=2) → X_C=2·Z_in=2·P_avg=5000·Q=0·P_s=5000
  const o = __originalAcPowerFactorForVerify().answer;
  check(`원본 X_C=2`, o.Xc === 2, `X_C=${o.Xc}`);
  check(`원본 Z_in=2(순저항)`, o.Zin === 2, `Z_in=${o.Zin}`);
  check(`원본 P_avg=5000`, o.Pavg === 5000, `P_avg=${o.Pavg}`);
  check(`원본 Q=0`, o.Q === 0);
  check(`원본 P_s=5000`, o.Ps === 5000, `P_s=${o.Ps}`);

  for (const mode of ["exam_similar", "exam_variant"] as const) {
    for (const seed of [0, 1, 2]) {
      const g = generateAcPowerFactor({ seed, mode });
      const v = g.values, a = g.answer;
      check(`${mode} s${seed} 회로 SVG`, isValidSvg(renderAcPowerFactorCircuit(g.circuitDiagram)));
      // X_C = R₂ = 2X_L (중근 조건), Z_in 순저항 = R₁+R₂/2
      check(`${mode} s${seed} X_C=R₂=2X_L`, a.Xc === v.R2 && v.R2 === 2 * v.XL, `X_C=${a.Xc}`);
      check(`${mode} s${seed} Z_in=R₁+R₂/2 순저항`, Math.abs(a.Zin - (v.R1 + v.R2 / 2)) < 1e-6, `Z_in=${a.Zin}`);
      // P_avg = V_s²/Z_in, Q=0, P_s=P_avg
      check(`${mode} s${seed} P_avg=V²/Z_in·Q=0·P_s=P_avg`, Math.abs(a.Pavg - (v.Vs * v.Vs) / a.Zin) < 1e-3 && a.Q === 0 && a.Ps === a.Pavg, `P=${a.Pavg}`);
      // 원본 튜플 제외
      check(`${mode} s${seed} 원본 튜플 제외`, !(v.Vs === 100 && v.R1 === 1 && v.XL === 1));
    }
  }
}

// ── 결과 ──────────────────────────────────────────────────────────
console.log(`\n=== 결과: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
