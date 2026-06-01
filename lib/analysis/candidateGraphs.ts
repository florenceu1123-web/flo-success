import type { ComponentInventoryItem } from "@/lib/analysis/extractComponentInventory";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/analysis/candidateGraphs");

/**
 * Topology Recovery v3 — Candidate Graphs + Scoring.
 *
 * v2 pattern dictionary는 V·L·R·R 같은 단순 RLC만 다뤘음. v3은 OPAMP·다단계 RC 발진기 등
 * 복잡 회로도 enumerate해서 점수 산정으로 최적 후보 선택.
 *
 * 흐름:
 *   1. components(inventory) + textHint 받음
 *   2. 알려진 회로 archetype 후보 셋 enumerate (Wien Bridge·Imyong9 OPAMP 발진기 등)
 *   3. 각 후보의 시그니처(R·C·OPAMP 갯수) + textHint 키워드 매치 점수 산정
 *   4. 최고 점수 후보 selector
 *
 * v3는 archetype-aware Topology Recovery — universal path가 OPAMP 회로처럼
 * 복잡한 형식 흡수 못 하는 케이스의 fallback. archetype 폭증과 universal path 한계 사이
 * 절충 layer.
 */

export type CandidateArchetype =
  | "WIEN_BRIDGE_OSCILLATOR"
  | "IMYONG9_OPAMP_OSCILLATOR"
  | "UNKNOWN";

/**
 * 3-dimension scoring (2026-05-31 사용자 박음):
 *   score = componentScore + topologyScore + semanticScore
 *
 * - componentScore — inventory(R·C·OPAMP 등 type별 갯수) 시그니처 매치 점수
 * - topologyScore  — graph features (node count·degree·cycle 등) 매치 점수. v3 starter는 0 (topology recovery 단계 전이라).
 * - semanticScore  — textHint(키워드) 매치 점수
 */
export type CandidateScore = {
  archetype: CandidateArchetype;
  componentScore: number;
  topologyScore: number;
  semanticScore: number;
  score: number;
  reasons: string[];
};

/**
 * components·textHint로 OPAMP 회로 후보들 enumerate + 3-dim 점수 산정.
 * 최고 점수 archetype 반환 (score < 3 이면 UNKNOWN).
 */
export function selectOpampCandidate(
  inventory: ComponentInventoryItem[],
  textHint: string,
): CandidateScore {
  const text = textHint.toLowerCase();
  const count = (t: string) =>
    inventory.filter((c) => c.type.toUpperCase() === t).length;
  const nR = count("R");
  const nC = count("C");
  const nOpamp = count("OPAMP");

  if (nOpamp === 0) {
    return {
      archetype: "UNKNOWN",
      componentScore: 0, topologyScore: 0, semanticScore: 0, score: 0,
      reasons: ["OPAMP not in inventory"],
    };
  }

  const scores: CandidateScore[] = [];

  // ── Wien Bridge: R=4·C=2·OPAMP=1 + "wien"·"bridge"·"발진"·"oscillat" ──
  {
    const reasons: string[] = [];
    let componentS = 0, topologyS = 0, semanticS = 0;
    if (nR >= 4 && nC === 2 && nOpamp === 1) { componentS += 4; reasons.push("component:R≥4·C=2·OPAMP=1"); }
    if (/wien/i.test(text)) { semanticS += 3; reasons.push("semantic:wien"); }
    if (/bridge|브리지/i.test(text)) { semanticS += 2; reasons.push("semantic:bridge"); }
    if (/발진|oscillat/i.test(text)) { semanticS += 2; reasons.push("semantic:발진"); }
    scores.push({
      archetype: "WIEN_BRIDGE_OSCILLATOR",
      componentScore: componentS, topologyScore: topologyS, semanticScore: semanticS,
      score: componentS + topologyS + semanticS,
      reasons,
    });
  }

  // ── 임용 9번 OPAMP 발진기 ──
  //   원본: V_in + R·R 직렬 입력 + 2C(GND) + OPAMP + C·C·½R 피드백 + V_out 단자
  //   시그니처: R=2~3·C≥3·OPAMP=1 (느슨), 또는 R=3·C=4 (정확)
  //   textHint: "사인파 발진"·"전달특성"·"V_out·V_in"·"특성방정식·근·주파수"
  {
    const reasons: string[] = [];
    let componentS = 0, topologyS = 0, semanticS = 0;
    if (nOpamp === 1 && nR >= 2 && nC >= 3) { componentS += 3; reasons.push(`component:OPAMP=1·R≥2·C≥3 (R=${nR},C=${nC})`); }
    if (nR === 3 && nC === 4) { componentS += 2; reasons.push("component:R=3·C=4 정확"); }
    if (/사인파\s*발진|sine\s*wave\s*oscillat/i.test(text)) { semanticS += 3; reasons.push("semantic:사인파 발진기"); }
    if (/전달특성|전달함수|v_out.*v_in|v_out\(s\).*v_in\(s\)/i.test(text)) { semanticS += 2; reasons.push("semantic:전달함수"); }
    if (/특성방정식.*근|특성방정식의?\s*근/i.test(text)) { semanticS += 2; reasons.push("semantic:특성방정식의 근"); }
    if (/i_?1.*i_?2|i_?1\(s\)|i_?2\(s\)/i.test(text)) { semanticS += 1; reasons.push("semantic:I_1·I_2"); }
    scores.push({
      archetype: "IMYONG9_OPAMP_OSCILLATOR",
      componentScore: componentS, topologyScore: topologyS, semanticScore: semanticS,
      score: componentS + topologyS + semanticS,
      reasons,
    });
  }

  // 점수 정렬 후 최고 선택. 3점 미만이면 UNKNOWN.
  scores.sort((a, b) => b.score - a.score);
  const winner = scores[0];
  log.info("candidate_scoring", {
    inventory: { R: nR, C: nC, OPAMP: nOpamp },
    allScores: scores.map((s) => `${s.archetype}=${s.score}(c${s.componentScore}+t${s.topologyScore}+s${s.semanticScore})`),
    winner: winner.archetype,
    winnerScore: winner.score,
    breakdown: `c${winner.componentScore}+t${winner.topologyScore}+s${winner.semanticScore}`,
    reasons: winner.reasons,
  });
  if (winner.score < 3) {
    return {
      archetype: "UNKNOWN",
      componentScore: 0, topologyScore: 0, semanticScore: 0, score: winner.score,
      reasons: ["below threshold (3)"],
    };
  }
  return winner;
}
