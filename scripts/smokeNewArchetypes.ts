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
import { generateSwitchedRcDcTransient as genSwRc, __originalRcForVerify as __origRc } from "../lib/generation/topologies/switchedRcDcTransient";
import { renderSwitchedRcDcCircuit as renderSwRc } from "../lib/renderers/switchedRcDcCircuitRenderer";

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
  check(`유사 s${s} τ=R·C·v_o계수=v_c(0⁻)`, Math.abs(a.tau - v.Rload * v.react) < 1e-9 && a.voCoeff === a.init0);
}
// 변형 = RL (코일): i_L(0⁻)=Vs/Rs+Is, τ=L/Rl, v_o계수=Rl·i_L(0⁻)
for (const s of [0, 1, 2]) {
  const g = genSwRc({ seed: s, mode: "exam_variant" });
  const v = g.values, a = g.answer;
  check(`변형(RL) s${s} 회로 SVG·kind=RL`, isValidSvg(renderSwRc(g.circuitDiagram)) && g.kind === "RL");
  check(`변형 s${s} 코일 라벨(H)`, /H$/.test(g.circuitDiagram.reactLabel) && g.circuitDiagram.reactMeasLabel === "i_L(t)");
  check(`변형 s${s} i_L(0⁻)=Vs/Rs+Is 정수`, Math.abs(a.init0 - (v.Vs / v.Rs + v.Is)) < 1e-6 && Number.isInteger(a.init0), `iL0=${a.init0}`);
  check(`변형 s${s} τ=L/R·v_o계수=R·i_L0`, Math.abs(a.tau - v.react / v.Rload) < 1e-9 && Math.abs(a.voCoeff - v.Rload * a.init0) < 1e-6);
}

// ── 결과 ──────────────────────────────────────────────────────────
console.log(`\n=== 결과: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
