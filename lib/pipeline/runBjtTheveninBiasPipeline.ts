import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateBjtTheveninBias } from "@/lib/generation/topologies/bjtTheveninBias";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runBjtTheveninBiasPipeline");

/**
 * BJT 직류 바이어스 + 베이스망 테브난 등가 (임용 10번 전자회로) — 결정론 파이프라인. GPT 없음.
 *   유사 = [3] V_CE 목표를 만족하는 R_C (원본) / 변형 = [3] R_C가 주어지고 V_CE (구하는 양 교환)
 */
export async function runBjtTheveninBiasPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateBjtTheveninBias({ seed, mode });
    const v = gen.values, a = gen.answer;
    const variant = mode === "exam_variant";
    log.info("bjt_thevenin_bias_generated", {
      mode, Vee: v.Vee, Re: v.Re, Rb: v.R1, V1: v.V1, V2: v.V2, Ib: a.IbUa, Rc: a.Rc, Vce: v.Vce,
    });

    const content =
      "그림 (가)는 쌍극성 접합 트랜지스터(BJT : Bipolar Junction Transistor) 증폭기의 직류 바이어스 응용 회로이다. " +
      "그림 (나)는 (가)와 동일한 동작을 하는 회로이고, (나)의 점선 부분은 (가)의 점선 부분을 테브난 등가 회로로 " +
      "변경한 것이다. 제시된 <해석 절차>에 따라 각 단계별로 풀이 과정과 함께 결과를 서술하시오. " +
      `(단, <해석 절차>에서 BJT는 활성 영역에서 동작하며, V_BE = ${v.Vbe}[V], 직류 전류이득 β_DC = ${v.beta}, ` +
      "β_DC + 1은 β_DC로 계산한다.)";

    const conditions = [
      `이미터측: 이미터 — ${v.Re * 1000}[Ω] — 전원 ${v.Vee}[V](위쪽이 −극) — 접지`,
      `베이스측 점선 부분: [${v.R1}[kΩ] + ${Math.abs(v.V1)}[V](위쪽이 ${v.V1 < 0 ? "−" : "+"}극)] 와 ` +
      `[${v.R2}[kΩ] + ${Math.abs(v.V2)}[V](위쪽이 ${v.V2 < 0 ? "−" : "+"}극)] 의 병렬`,
      `컬렉터측: 컬렉터 — (${v.Rp}[kΩ] ∥ ${variant ? `${a.Rc}[kΩ]` : "R_C"}) — 마디 M — ` +
      `(${v.Rm}[kΩ] ∥ 전류원 ${v.Is}[mA]) — 접지`,
    ];

    const question = [
      `[단계 1] (나)의 점선 부분의 테브난 등가 저항 R_T[kΩ]를 구한다. (단, V_T는 테브난 등가 전압이다.)`,
      `[단계 2] (나)의 베이스 전류 I_B[µA]와 전압 V_B[V]를 각각 구한다.`,
      variant
        ? `[단계 3] (나)의 R_C = ${a.Rc}[kΩ]일 때 V_CE[V]를 구한다.`
        : `[단계 3] (나)의 V_CE가 ${v.Vce}[V]가 되기 위한 저항 R_C[kΩ]를 구한다.`,
    ].join("\n");

    const answer = [
      `[단계 1] R_T = ${a.Rt} [kΩ]  (V_T = ${a.Vt} [V])`,
      `[단계 2] I_B = ${a.IbUa} [µA],  V_B = ${a.Vb} [V]`,
      variant ? `[단계 3] V_CE = ${a.Vce} [V]` : `[단계 3] R_C = ${a.Rc} [kΩ]`,
    ].join("\n");

    const solution = [
      `[단계 1] 점선 부분의 두 가지를 테브난 등가로 합친다. 전원을 죽이면 두 저항이 병렬이므로`,
      `  R_T = ${v.R1} ∥ ${v.R2} = ${a.Rt}[kΩ], 개방 전압은 밀만의 정리로`,
      `  V_T = (${v.V1}/${v.R1} + ${v.V2}/${v.R2}) × R_T = ${a.Vt}[V].`,
      `[단계 2] 베이스 루프에 KVL을 적용한다. 이미터 전압은 V_E = −${v.Vee} + I_E·${v.Re}이고,`,
      `  β_DC + 1을 β_DC로 계산하므로 I_E = I_C = ${v.beta}·I_B이다.`,
      `  V_T − I_B·R_T = V_BE + V_E  →  ${a.Vt} − I_B·${a.Rt} = ${v.Vbe} + (−${v.Vee} + ${v.beta}·I_B·${v.Re})`,
      `  I_B = (V_T + ${v.Vee} − ${v.Vbe})/(R_T + ${v.beta}×${v.Re}) = ${round3(a.Vt + v.Vee - v.Vbe)}/${round3(a.Rt + v.beta * v.Re)} = ${a.Ib}[mA] = ${a.IbUa}[µA].`,
      `  V_B = V_T − I_B·R_T = ${a.Vt} − ${a.Ib}×${a.Rt} = ${a.Vb}[V].`,
      `[단계 3] I_C = ${v.beta}·I_B = ${a.Ic}[mA], V_E = −${v.Vee} + I_C·${v.Re} = ${a.Ve}[V].`,
      `  마디 M에서 KCL: ${v.Is} = V_M/${v.Rm} + I_C  →  V_M = ${v.Rm}×(${v.Is} − ${a.Ic}) = ${a.Vm}[V].`,
      variant
        ? `  (${v.Rp} ∥ ${a.Rc}) = ${a.Rpar}[kΩ]이므로 V_C = V_M − I_C×${a.Rpar} = ${a.Vc}[V],` +
          `  V_CE = V_C − V_E = ${a.Vc} − (${a.Ve}) = ${a.Vce}[V].`
        : `  V_C = V_E + V_CE = ${a.Ve} + ${v.Vce} = ${a.Vc}[V]이므로 컬렉터측 병렬 저항은` +
          `  (${v.Rp} ∥ R_C) = (V_M − V_C)/I_C = (${a.Vm} − ${a.Vc})/${a.Ic} = ${a.Rpar}[kΩ].` +
          `  따라서 R_C = ${v.Rp}×${a.Rpar}/(${v.Rp} − ${a.Rpar}) = ${a.Rc}[kΩ].`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_btb_a_${i + 1}`,
        label: "(가) 직류 바이어스 응용 회로",
        role: "original_circuit",
        diagramType: "bjt_thevenin_bias_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_btb_b_${i + 1}`,
        label: "(나) 점선 부분을 테브난 등가로 변경한 회로",
        role: "equivalent_circuit",
        diagramType: "bjt_thevenin_bias_circuit",
        diagram: gen.equivDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * BJT 바이어스 + 베이스망 테브난 등가 감지 — 분류·route 안전망.
 *
 * ★ 실측: generic `bjt_bias`(임용 7번 — 저항률 ρ로 저항을 구하는 유형)가 잡아 전혀 다른 문제가 됐다.
 * ★ 판별선 = **테브난 등가 변환**(점선 부분 → R_T·V_T) + **BJT 바이어스**. 형제 bjt_bias에는
 *   테브난 등가 변환 단계가 없고, 형제 thevenin 계열에는 BJT가 없다.
 */
export function detectBjtTheveninBias(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase();
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const up = (x: unknown) => String(x ?? "").toUpperCase();
  const bjtCtx =
    /bjt|쌍극성|접합\s*트랜지스터|트랜지스터/.test(text) ||
    inv.some((c) => ["BJT", "Q", "NPN", "PNP"].includes(up(c.type)));
  if (!bjtCtx) return false;

  // 바이어스 문맥 (직류 해석).
  const biasCtx = /바이어스|bias|직류\s*해석|동작점|v_?be|베이스\s*전류|i_?b\b/.test(text);
  if (!biasCtx) return false;

  // ★ 이 유형 고유 — 테브난 등가 변환. 낱말이 흔들려도 잡히게 느슨히 본다.
  const theveninAsk = /테브난|thevenin|등가\s*회로로\s*변경|등가\s*저항\s*r_?t|r_?t\s*\[?k/.test(text);
  // ★ 구조 대안 — 점선 부분(두 전원 가지)을 등가로 바꾸는 서술.
  const dashedAsk = /점선\s*부분|점선\s*내부.*등가|두 전원.*등가/.test(text);
  // ★★ 구조 신호 — Vision이 "테브난"·"점선"을 흘려도 잡히게 한다(실측 2/2에서 둘 다 누락됐다).
  //   베이스망 전원 2개 + 이미터 음전원(V≥3) 또는 컬렉터망 **전류원**은 이 유형 고유다.
  const nType = (t: string) => inv.filter((c) => up(c.type) === t).length;
  const structAsk = nType("I") >= 1 || nType("V") >= 3;
  if (!theveninAsk && !dashedAsk && !structAsk) return false;

  // 형제 양보 — 스위칭/논리게이트(임용 2번)·제너 레귤레이터·특성곡선.
  if (/논리\s*게이트|논리게이트|진리표/.test(text)) return false;
  if (/제너|정전압|레귤레이터/.test(text)) return false;
  if (/특성\s*곡선|출력\s*특성/.test(text)) return false;
  if (/저항률|비저항|resistivity/.test(text)) return false;   // 임용 7번 bjt_bias 소관
  return true;
}
