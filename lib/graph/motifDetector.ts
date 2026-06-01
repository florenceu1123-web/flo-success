/**
 * Motif Detector (2026-06-01, Framework refactor 3단계).
 *
 * Canonical Graph의 sub-pattern(motif)을 인식해 **tags 배열**을 생성한다.
 * tags는 generate/route.ts의 objective/tags 기반 dispatch 입력(archetype 폭증 방지).
 *
 * 설계 원칙:
 *  · GPT 해석 X — 순수 graph feature 매칭(결정론).
 *  · Canonical Graph는 2-pin component만 edge로 포함하므로, OPAMP/BJT/MOSFET(3+pin)은
 *    graph.skippedComponents의 type으로 존재만 파악한다.
 *  · motif → tags 매핑은 메모리 로드맵의 motif 목록을 따른다.
 *
 * 메모리 motif: rc_ladder · opamp_feedback_loop · wien_bridge_network ·
 *   parallel_rl_branches · voltage_divider · differential_pair (+ rlc_network)
 */

import type { CanonicalGraph, CanonicalEdge } from "@/lib/graph/canonical";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/graph/motifDetector");

export type Motif = {
  kind: string;
  /** 관련 node id (선택) */
  nodes?: string[];
  /** 관련 component id (선택) */
  componentIds?: string[];
};

export type MotifResult = {
  motifs: Motif[];
  /** dispatch용 tags (중복 제거). */
  tags: string[];
};

function isGnd(node: string): boolean {
  const n = node.toUpperCase();
  return n === "GND" || n === "GROUND" || n === "0";
}

/**
 * Canonical Graph + (graph에 없는) component type 힌트로 motif 인식 → tags 생성.
 *
 * @param graph        buildCanonicalGraph 결과
 * @param extraTypes   graph edge에 없는 component type (보통 skippedComponents에서 자동 수집되나,
 *                     호출자가 inventory 전체 type을 추가로 줄 수 있음). 대문자 무관.
 */
export function detectMotifs(graph: CanonicalGraph, extraTypes: string[] = []): MotifResult {
  const motifs: Motif[] = [];
  const tags = new Set<string>();

  // ── component type 집계 (edge + skipped + extra) ──
  const allTypes = [
    ...graph.edges.map((e) => e.componentType),
    ...graph.skippedComponents.map((s) => s.type),
    ...extraTypes,
  ].map((t) => t.toUpperCase());
  const count = (t: string) => allTypes.filter((x) => x === t).length;
  const nR = count("R");
  const nC = count("C");
  const nL = count("L");
  const nOpamp = count("OPAMP");
  const nBjt = count("BJT");
  const nMosfet = count("MOSFET");
  const nDiode = count("D");

  // ── 1. 평행 가지 (같은 node-pair에 두 개 이상 edge) ──
  const byPair = new Map<string, CanonicalEdge[]>();
  for (const e of graph.edges) {
    const key = `${e.from}|${e.to}`;
    const list = byPair.get(key) ?? [];
    list.push(e);
    byPair.set(key, list);
  }
  for (const [pair, es] of byPair) {
    if (es.length < 2) continue;
    const types = new Set(es.map((e) => e.componentType));
    const [a, b] = pair.split("|");
    if (types.has("R") && types.has("L")) {
      motifs.push({ kind: "parallel_rl_branches", nodes: [a, b], componentIds: es.map((e) => e.componentId) });
      tags.add("rl_network");
      tags.add("phasor");
    }
    if (types.has("R") && types.has("C")) {
      motifs.push({ kind: "parallel_rc_branches", nodes: [a, b], componentIds: es.map((e) => e.componentId) });
      tags.add("rc_network");
    }
  }

  // ── 2. 전압 분배기 (R-R 직렬: 비접지 degree-2 노드가 두 R edge를 잇는다) ──
  for (const node of graph.nodes) {
    if (isGnd(node)) continue;
    if ((graph.features.degree[node] ?? 0) !== 2) continue;
    const incident = graph.edges.filter((e) => e.from === node || e.to === node);
    if (incident.length === 2 && incident.every((e) => e.componentType === "R")) {
      motifs.push({ kind: "voltage_divider", nodes: [node], componentIds: incident.map((e) => e.componentId) });
      tags.add("voltage_divider");
    }
  }

  // ── 3. RC ladder (R-C 교대 chain ≥2 stage) ──
  //   간이 판정: R≥2 ∧ C≥2 ∧ 평행 RC 아닌 직렬 위주 → rc_ladder 후보.
  if (nR >= 2 && nC >= 2 && graph.features.cycleCount <= 2) {
    motifs.push({ kind: "rc_ladder" });
    tags.add("rc_network");
  }

  // ── 4. OPAMP feedback (OPAMP 존재 — 3-pin이라 edge엔 없고 skipped에 기록) ──
  if (nOpamp >= 1) {
    motifs.push({ kind: "opamp_feedback_loop" });
    tags.add("opamp");
    // Wien bridge: OPAMP + R≥2 + C≥2 → 발진기.
    if (nR >= 2 && nC >= 2) {
      motifs.push({ kind: "wien_bridge_network" });
      tags.add("wien_bridge");
      tags.add("rc_network");
      tags.add("oscillator");
      tags.add("transfer_function");
    }
  }

  // ── 5. 차동쌍 (BJT/MOSFET 2개 이상) ──
  if (nBjt >= 2 || nMosfet >= 2) {
    motifs.push({ kind: "differential_pair" });
    tags.add("differential_pair");
  }

  // ── 6. RLC (R·L·C 모두) ──
  if (nR >= 1 && nL >= 1 && nC >= 1) {
    motifs.push({ kind: "rlc_network" });
    tags.add("rlc");
  }

  // ── 7. 소자 존재 기반 보조 tags ──
  if (nL >= 1) tags.add("inductive");
  if (nC >= 1) tags.add("capacitive");
  if (nBjt >= 1) tags.add("bjt");
  if (nMosfet >= 1) tags.add("mosfet");
  if (nDiode >= 1) tags.add("diode");

  const result: MotifResult = { motifs, tags: [...tags] };
  log.info("motifs_detected", {
    motifs: motifs.map((m) => m.kind),
    tags: result.tags,
    counts: { nR, nC, nL, nOpamp, nBjt, nMosfet, nDiode },
  });
  return result;
}
