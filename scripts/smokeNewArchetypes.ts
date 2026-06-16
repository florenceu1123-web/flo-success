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

// ── 결과 ──────────────────────────────────────────────────────────
console.log(`\n=== 결과: ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
