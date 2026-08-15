import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateComparatorDiodeOr, type IntervalState } from "@/lib/generation/topologies/comparatorDiodeOr";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runComparatorDiodeOrPipeline");

/**
 * 비교기 2개 + 다이오드 결합 → 구간별 V_out·다이오드 ON/OFF (임용 3번 전자회로) — 결정론 파이프라인. GPT 없음.
 *   유사 = 원본 구성(다이오드 OR + 풀다운, 창 밖 검출), 기준·포화 전압·구간 입력 변경
 *   변형 = 소자 배치 교환(다이오드 방향 반전 + 풀업 → 창 안 검출)
 */
export async function runComparatorDiodeOrPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateComparatorDiodeOr({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("comparator_diode_or_generated", {
      mode, config: v.config, vsat: v.vsat, vHigh: v.vHigh, vLow: v.vLow, vA: v.vA, vB: v.vB,
      voutA: a.voutA, diodesB: a.diodesB.join("/"),
    });

    const content =
      `그림 (가)는 연산 증폭기 응용 회로이다. 이 회로의 입력 전압 V_in[V]이 그림 (나)와 같이 인가될 때 ` +
      `구간 ㉠에서의 출력 전압 V_out[V]과 구간 ㉡에서의 다이오드 D_1, D_2의 상태(ON, OFF)를 각각 구하여 순서대로 쓰시오. ` +
      `(단, 모든 소자는 이상적으로 동작하며, 연산 증폭기의 최소 출력 전압은 −${v.vsat}[V], 최대 출력 전압은 ${v.vsat}[V]이다.)`;

    const conditions = [
      `연산 증폭기는 이상적이며 출력은 +${v.vsat}[V] 또는 −${v.vsat}[V]로 포화한다.`,
      `다이오드는 이상적이다 — 순방향이면 단락(전압 강하 0[V]), 역방향이면 개방으로 본다.`,
      v.config === "or_pulldown"
        ? `출력 마디 V_out과 접지 사이에 ${v.rPull}[kΩ] 저항이 연결되어 있다.`
        : `출력 마디 V_out과 +${v.vsat}[V] 전원 사이에 ${v.rPull}[kΩ] 저항이 연결되어 있다.`,
      `그림 (나)에서 입력 전압은 구간 ㉠에서 ${v.vA}[V], 구간 ㉡에서 ${v.vB}[V]이다.`,
    ];

    const question = [
      `[단계 1] 각 구간에서 두 비교기의 출력 전압이 +${v.vsat}[V]인지 −${v.vsat}[V]인지 판정한다.`,
      `[단계 2] 구간 ㉠에서의 출력 전압 V_out을 구한다.`,
      `[단계 3] 구간 ㉡에서 다이오드 D_1, D_2의 상태(ON, OFF)를 구한다.`,
    ].join("\n");

    const answer = [
      `구간 ㉠ : V_out = ${fmtV(a.voutA)}[V]`,
      `구간 ㉡ : D_1 = ${a.diodesB[0]}, D_2 = ${a.diodesB[1]}`,
    ].join("\n");

    const solution = [
      `[단계 1] ${a.compDesc.join(" ")}`,
      `  · 구간 ㉠ (V_in = ${v.vA}[V]) : ${outsLine(a.stateA, v.vsat)}`,
      `  · 구간 ㉡ (V_in = ${v.vB}[V]) : ${outsLine(a.stateB, v.vsat)}`,
      `[단계 2] ${a.nodeRule}`,
      `  구간 ㉠에서는 ${diodeClause(a.stateA)}되므로 V_out = ${fmtV(a.voutA)}[V]이다.`,
      `[단계 3] 구간 ㉡에서는 ${outsShort(a.stateB)}이므로 ${diodeClause(a.stateB)}된다.`,
      `  따라서 D_1 = ${a.diodesB[0]}, D_2 = ${a.diodesB[1]}이고, 이때 V_out = ${fmtV(a.stateB.vout)}[V]이다.`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_cmpdio_${i + 1}`,
        label: "(가) 연산 증폭기 응용 회로",
        role: "original_circuit",
        diagramType: "comparator_diode_or_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_cmpdio_wave_${i + 1}`,
        label: "(나) 입력 전압 V_in 파형",
        role: "waveform",
        diagramType: "waveform",
        diagram: gen.waveform,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

function fmtV(x: number): string {
  return x < 0 ? `−${Math.abs(x)}` : String(x);
}
/** 두 비교기 출력 + 그 근거를 한 줄로. */
function outsLine(s: IntervalState, vsat: number): string {
  return s.outs.map((o, k) => `비교기 ${k + 1} 출력 = ${fmtV(o)}[V]`).join(", ") +
    (s.outs.every((o) => o === -vsat) || s.outs.every((o) => o === vsat)
      ? " (두 출력이 같다)" : "");
}
function outsShort(s: IntervalState): string {
  return s.outs.map((o, k) => `비교기 ${k + 1} 출력이 ${fmtV(o)}[V]`).join("이고 ");
}
/**
 * 다이오드 상태 서술 — **어미 없이** 반환한다(호출부가 "되므로"·"된다"를 붙인다).
 * 조사 문제를 피하려고 "D_1만 …" 형태를 쓴다(이/가 구분이 필요 없다).
 */
function diodeClause(s: IntervalState): string {
  const on = s.diodes.map((d, k) => (d === "ON" ? `D_${k + 1}` : null)).filter(Boolean);
  if (on.length === 0) return "두 다이오드가 모두 역방향이 되어 차단(OFF)";
  if (on.length === s.diodes.length) return "두 다이오드가 모두 순방향으로 도통(ON)";
  return `${on.join("·")}만 순방향으로 도통(ON)하고 나머지는 역방향으로 차단(OFF)`;
}

/**
 * 비교기 + 다이오드 결합 회로 감지 — 분류·route 안전망.
 *
 * ★ 구조 시그니처(낱말이 아니라 구조로, CLAUDE.md 규칙 2):
 *     **연산 증폭기(비교기) 2개 + 다이오드 2개 + (출력 전압 또는 ON/OFF 상태) 요구**
 *   형제 어느 것도 이 조합을 갖지 않는다 — `diode_clamper`는 OPAMP가 없고,
 *   `flash_adc_2bit`는 저항 사다리·인코더·디지털 출력이 있으며,
 *   OPAMP 형제(가산기·필터·발진기·레귤레이터)는 다이오드가 없다.
 *
 * ★ 실측(2026-08-03): Vision 요약은 정확했는데 분류기가 **㉠㉡ 마커 + ON/OFF**만 보고
 *   `bjt_characteristic_curve`(BJT 출력특성곡선)로 가로챘다 → 그래서 이 감지기는 0-PRE에 둔다.
 */
export function detectComparatorDiodeOr(analysis?: AnalysisResult | null): boolean {
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
  const nOpamp = inv.filter((c) => ["OPAMP", "OP-AMP", "U"].includes(up(c.type))).length;
  const nDiode = inv.filter((c) => ["D", "DIODE"].includes(up(c.type))).length;

  const opampCtx = nOpamp >= 1 || /연산\s*증폭기|op-?amp|opamp|비교기|comparator/.test(text);
  // 다이오드는 인벤토리 2개 또는 본문의 D₁·D₂ 표기로 인정한다(Vision이 개수를 흘리는 회차 대비).
  const diodeCtx = nDiode >= 2 ||
    (/다이오드|diode/.test(text) && /d_?\s*1|d₁|d_?\s*2|d₂/.test(text)) ||
    (/다이오드/.test(text) && nDiode >= 1);
  if (!opampCtx || !diodeCtx) return false;

  // 요구 — 출력 전압 또는 다이오드 ON/OFF 상태.
  const ask =
    /on\s*[,/·]?\s*off|on\s*\/\s*off|도통|차단|상태\s*를?\s*(구|판정|쓰)/.test(text) ||
    /출력\s*전압/.test(text);
  if (!ask) return false;

  // 형제 양보 ─────────────────────────────────────────────────────────────
  // 클램퍼·리미터·정류기: 다이오드 파형 정형 유형(OPAMP 없이 C·전지와 함께 쓴다).
  if (/클램퍼|clamper|리미터|limiter|정류|rectif|배전압/.test(text)) return false;
  // 플래시 ADC: 저항 사다리 + 인코더 + 디지털 출력.
  if (/플래시|flash\s*adc|인코더|encoder|a\s*\/\s*d\s*변환|디지털\s*출력/.test(text)) return false;
  // 발진기·슈미트 트리거 발진(비정현파 발생기)은 function_generator 소관.
  if (/발진|oscillat|삼각파|구형파\s*발생/.test(text)) return false;
  // 제너·정전압 레귤레이터.
  if (/제너|zener|정전압|레귤레이터/.test(text)) return false;
  // 아날로그 증폭 설계(이득·바이어스)는 OPAMP 형제 소관.
  if (/이득|증폭도|바이어스|동작점|전달\s*함수/.test(text)) return false;
  return true;
}
