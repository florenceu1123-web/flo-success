import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  dnmTextOf,
  generateDffNandMuxPair,
  litTex,
  matchesDffNandMuxSignature,
  netTex,
  yieldsDffNandMuxToSibling,
} from "@/lib/generation/topologies/dffNandMuxPair";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDffNandMuxPairPipeline");

/**
 * D 플립플롭 2개 + 3-NAND 입력망 + 입력 파형 → Q₁Q₀ 추적 + 점선부 최소화 (임용 12번 디지털)
 * — 결정론 파이프라인. GPT 없음.
 *
 *  [1] ㉠ 지점의 Q₁Q₀  [2] ㉡·㉢ 지점의 Q₁Q₀  [3] 점선부를 최소 AND/OR 회로로 도시
 */
export async function runDffNandMuxPairPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (idx, seed) => {
    const gen = generateDffNandMuxPair({ seed, mode });
    const v = gen.values, a = gen.answer;
    const target = v.dashedTarget === 0 ? "Q₀" : "Q₁";
    const dOut = v.dashedTarget === 0 ? "D₀" : "D₁";
    const dn = a.dashedNet;

    log.info("dff_nand_mux_pair_generated", {
      mode, net1: netTex(v.net1), net0: netTex(v.net0), dashed: target,
      points: a.atPoints.map((p) => `${p.sym}:${p.q1}${p.q0}`).join(" "),
    });

    const content = [
      `그림 (가)는 D 플립플롭을 이용한 회로를 나타낸 것이다.`,
      `입력 신호 A와 B가 그림 (나)와 같이 입력될 때, 제시된 <해석 절차>에 따라 각 단계별로`,
      `풀이과정과 함께 결과를 구하시오.`,
      `(단, 모든 소자는 이상적으로 동작하고, 두 D 플립플롭 출력 Q₁·Q₀의 초깃값은 모두 0이다.)`,
    ].join(" ");

    const conditions = [
      `두 D 플립플롭은 **공통 클럭**의 상승에지에 동기로 동작한다 (Q(t+1) = D(t)).`,
      `각 D 입력망은 NAND 3개로 구성된다: 위 NAND = (1, s), 아래 NAND = (x, y), 최종 NAND = (위, 아래).`,
      `  ⇒ NAND-NAND는 곱의 합이므로 **D = s + x·y** 이다.`,
      `D₁ = ${netTex(v.net1)}` + (v.dashedTarget === 1 ? "  ← (점선 부분, 학생이 도시)" : ""),
      `D₀ = ${netTex(v.net0)}` + (v.dashedTarget === 0 ? "  ← (점선 부분, 학생이 도시)" : ""),
      `Ā는 A의 보수(인버터 출력)이고, 1은 논릿값 High를 뜻한다.`,
    ];

    const question = [
      `[단계 1] 그림 (나)의 ㉠ 지점에서 그림 (가) 회로의 Q₁Q₀ 값을 구한다.`,
      `[단계 2] 그림 (나)의 ㉡과 ㉢ 지점에서 그림 (가) 회로의 Q₁Q₀ 값을 각각 구한다.`,
      `[단계 3] 그림 (가)의 점선 부분을 최소한의 AND 게이트와 OR 게이트를 이용한 논리 회로로 도시한다.`,
    ].join("\n");

    const p = a.atPoints;
    const answer = [
      `[단계 1] ${p[0].sym} : Q₁Q₀ = ${p[0].q1}${p[0].q0}`,
      `[단계 2] ${p[1].sym} : Q₁Q₀ = ${p[1].q1}${p[1].q0},  ${p[2].sym} : Q₁Q₀ = ${p[2].q1}${p[2].q0}`,
      `[단계 3] ${dOut} = ${netTex(dn)}  → AND 게이트 1개(${litTex(dn.x)}·${litTex(dn.y)})와 OR 게이트 1개로 구성`,
    ].join("\n");

    const traceLine = (t: number) =>
      `  t=${t}: A=${v.aSeq[t]}, B=${v.bSeq[t]} → Q₁Q₀ = ${a.q1Seq[t]}${a.q0Seq[t]}`;
    const solution = [
      `[단계 1] 두 플립플롭은 **공통 클럭에 동기**이므로, 매 상승에지에서 **직전 상태**의 Q로 D₁·D₀를`,
      `  동시에 계산한 뒤 함께 바뀐다(한쪽을 먼저 갱신해 다른 쪽에 쓰면 틀린다).`,
      `  · D₁ = ${netTex(v.net1)},  D₀ = ${netTex(v.net0)},  초기 Q₁Q₀ = 00`,
      ...v.aSeq.map((_, t) => traceLine(t)).slice(0, p[0].idx + 1),
      `  ∴ ${p[0].sym} 지점에서 **Q₁Q₀ = ${p[0].q1}${p[0].q0}**`,
      `[단계 2] 같은 방식으로 계속 추적한다.`,
      ...v.aSeq.map((_, t) => traceLine(t)).slice(p[0].idx + 1),
      `  ∴ ${p[1].sym}에서 **Q₁Q₀ = ${p[1].q1}${p[1].q0}**, ${p[2].sym}에서 **Q₁Q₀ = ${p[2].q1}${p[2].q0}**`,
      `[단계 3] 점선 부분은 NAND 3개로 ${dOut}를 만드는 망이다.`,
      `  위 NAND의 한 입력이 상수 1이므로 그 출력은 ${litTex(dn.s)}의 보수이고,`,
      `  아래 NAND의 출력은 (${litTex(dn.x)}·${litTex(dn.y)})의 보수이다.`,
      `  두 보수를 다시 NAND하면 **드모르간에 의해 곱의 합**이 된다:`,
      `  **${dOut} = ${netTex(dn)}**`,
      `  ⇒ 최소 회로는 **AND 게이트 1개**(${litTex(dn.x)}·${litTex(dn.y)})와 **OR 게이트 1개**(그 출력과 ${litTex(dn.s)})다.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_dnm_${idx + 1}`,
        label: "(가) D 플립플롭 회로 (점선 부분은 [단계 3]에서 도시)",
        role: "implementation_circuit",
        diagramType: "logic_network",
        diagram: gen.circuit as unknown as Record<string, unknown>,
      },
      {
        id: `fig_dnm_wave_${idx + 1}`,
        label: "(나) 입력 파형 (클럭·A·B) — Q₁·Q₀ 트랙은 [단계 1]·[단계 2]에서 학생이 도시",
        role: "input_waveform",
        diagramType: "waveform",
        diagram: gen.waveform as unknown as Record<string, unknown>,
      },
    ];
    const solutionFigures: FigureVariant[] = [
      {
        id: `fig_dnm_min_${idx + 1}`,
        label: `[단계 3] 정답 — 점선 부분의 최소 AND/OR 회로 (${dOut} = ${netTex(dn)})`,
        role: "solution_circuit",
        diagramType: "logic_network",
        diagram: gen.minimalNet as unknown as Record<string, unknown>,
      },
      {
        id: `fig_dnm_full_${idx + 1}`,
        label: "(가) 전체 회로 — 원본 NAND 구현 형태",
        role: "solution_circuit",
        diagramType: "logic_network",
        diagram: gen.circuitFilled as unknown as Record<string, unknown>,
      },
      {
        id: `fig_dnm_wave_sol_${idx + 1}`,
        label: "(나) 파형 — 정답 (Q₁·Q₀ 채워진 형태)",
        role: "solution_waveform",
        diagramType: "waveform",
        diagram: gen.waveformSolution as unknown as Record<string, unknown>,
      },
    ];

    return {
      id: randomUUID(),
      content, conditions, question, answer, solution,
      topicKey, figureVariants, solutionFigures,
    };
  });
}

/**
 * D-FF 2개 + NAND 입력망 + 점선부 AND/OR 도시 감지 — 분류·route 안전망.
 *
 * ★ 실측(2026-08-04, 사용자 신고): 전용 항목이 없어 **`sequential_dff_generic`**(GPT 구조추출 generic)
 *   으로 떨어져 원본과 **다른 회로 구조**가 나왔고, 점선 영역에 정답 게이트가 그대로 그려져
 *   **[단계 3] 답이 노출**됐다.
 *
 * 판별선 = **D 플립플롭** + (점선 부분을 AND/OR로 **도시** 요구 OR 지점별 Q₁Q₀ 요구).
 *   형제 양보: JK·T-FF, MUX 구현, 카운터/DAC, 상태도·여기표·카르노맵 설계, 시퀀스 검출기.
 */
export function detectDffNandMuxPair(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  if (!dnmTextOf(analysis).trim()) return false;
  const text = dnmTextOf(analysis);
  if (!matchesDffNandMuxSignature(text)) return false;
  if (yieldsDffNandMuxToSibling(text)) return false;
  return true;
}
