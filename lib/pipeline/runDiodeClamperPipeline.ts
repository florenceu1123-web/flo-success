import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateDiodeClamper } from "@/lib/generation/topologies/diodeClamper";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDiodeClamperPipeline");

/**
 * 다이오드 클램퍼 — 출력 파형의 상·하한 a·b (임용 2번 전자회로) — 결정론 파이프라인. GPT 없음.
 *   유사 = 상한 클램프(원본) / 변형 = 다이오드 방향 반전(하한 클램프).
 */
export async function runDiodeClamperPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDiodeClamper({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("diode_clamper_generated", {
      mode, vH: v.vH, vL: v.vL, vB: v.vB, dir: v.dir, C: v.cUf, R: v.rKohm, a: a.a, b: a.b,
    });

    const content = [
      "그림 (가)는 다이오드를 이용한 응용 회로이다. 그림 (나)는 (가)에서의 입력 전압 v_i[V]와 출력 전압 v_o[V]를 도시한 것이다.",
      "그림 (나)의 출력 전압 파형에서 a와 b의 값을 순서대로 쓰시오.",
      "(단, 커패시터의 초기 전압은 0[V]이고, 모든 소자는 이상적으로 동작한다.)",
    ].join(" ");

    const periodMs = 2 * v.halfMs;
    const freqHz = Math.round(1000 / periodMs);
    const conditions = [
      `입력 v_i는 진폭 ${v.vH}[V]의 정현파 v_i = ${v.vH}sin(2πft)[V] (주기 ${periodMs}[ms], f = ${freqHz}[Hz], 최댓값 ${v.vH}[V]·최솟값 ${v.vL}[V])`,
      `직렬 커패시터 ${v.cLabel}, 부하 저항 ${v.rLabel} (시정수 RC = ${a.tauMs}[ms] ≫ 주기 ${2 * v.halfMs}[ms])`,
      // ★ 바이어스는 **부호가 곧 답의 클램프 레벨**이라 극성을 명시한다("2[V]"만 쓰면 모호하다).
      `마디와 접지 사이에 다이오드(${v.dir === "down" ? "애노드" : "캐소드"}가 마디 쪽)와 바이어스 전지 ` +
      `${v.biasLabel}가 직렬로 연결 — 전지의 마디 쪽 단자가 ${v.vB < 0 ? "−극" : "+극"}이므로 기준 전압은 ${v.vB}[V]`,
      `출력 v_o는 저항 양단 전압(= 마디 전압)`,
    ];

    const question = [
      `[단계 1] 다이오드가 도통하는 구간에서 마디(출력) 전압이 어떤 값으로 고정되는지 구하고, 그때의 커패시터 전압 V_C[V]를 구한다.`,
      `[단계 2] 다이오드가 차단되는 구간에서 출력 전압을 구한다. (RC ≫ 주기이므로 V_C는 일정하다고 본다.)`,
      `[단계 3] 출력 파형의 상한 a[V]와 하한 b[V]를 순서대로 구한다.`,
    ].join("\n");

    const clampV = v.dir === "down" ? a.a : a.b;
    const otherV = v.dir === "down" ? a.b : a.a;
    const srcAtClamp = v.dir === "down" ? v.vH : v.vL;
    const srcAtOff = v.dir === "down" ? v.vL : v.vH;

    const answer = [
      `[단계 1] 다이오드 도통 시 v_o = ${clampV} [V],  V_C = ${a.vC} [V]`,
      `[단계 2] 다이오드 차단 구간의 반대쪽 첨두에서 v_o = ${otherV} [V]`,
      `[단계 3] a = ${a.a} [V],  b = ${a.b} [V]`,
    ].join("\n");

    const solution = [
      `[단계 1] 다이오드는 ${v.dir === "down" ? "마디 전압이 바이어스보다 높아지려 할 때" : "마디 전압이 바이어스보다 낮아지려 할 때"} 도통한다.`,
      `  이상 다이오드이므로 도통 중에는 마디 전압이 바이어스 값에 고정된다 → v_o = ${clampV} [V].`,
      `  도통은 입력이 ${v.dir === "down" ? "최댓값" : "최솟값"} ${srcAtClamp} [V]일 때 일어나므로 커패시터 전압은 V_C = ${srcAtClamp} − (${clampV}) = ${a.vC} [V] (좌측이 +).`,
      `[단계 2] RC = ${a.tauMs}[ms]로 주기 ${2 * v.halfMs}[ms]보다 훨씬 크므로 V_C는 한 주기 동안 거의 변하지 않는다.`,
      `  차단 구간에서는 v_o = v_i − V_C 이므로, 입력이 ${v.dir === "down" ? "최솟값" : "최댓값"} ${srcAtOff} [V]일 때 v_o = ${srcAtOff} − (${a.vC}) = ${otherV} [V].`,
      `[단계 3] 따라서 출력은 **입력 정현파가 위아래로 평행 이동한 파형**이고, 그 상·하한은`,
      `  a = ${a.a} [V], b = ${a.b} [V] 이다.`,
      `  (검산: a − b = ${a.a - a.b} = 2 × ${v.vH} — 정현파의 첨두치 간 진폭이 그대로 보존된다.)`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_clamp_${i + 1}`,
        label: "(가) 다이오드를 이용한 응용 회로",
        role: "original_circuit",
        diagramType: "diode_clamper_circuit",
        diagram: gen.circuitDiagram,
      },
      {
        id: `fig_clamp_wave_${i + 1}`,
        label: "(나) 입력 전압 v_i와 출력 전압 v_o의 파형",
        role: "waveform",
        diagramType: "diode_clamper_waveform",
        diagram: gen.waveformDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 다이오드 클램퍼 감지 — 분류·route 안전망.
 *
 * ★ 실측 신고: generic 경로가 **다이오드를 통째로 떨어뜨리고**(C·V·R만 남음) 파형도 무의미한
 *   단일 스텝으로 냈다. 클램퍼는 비선형(도통/차단 구간 전환)이라 MNA generic으로 재현 불가.
 *
 * 시그니처: 다이오드 + 커패시터 + (입력·출력 파형) + 클램프 성격
 *   · 정류기·리미터(클리퍼)·제너 레귤레이터는 양보.
 */
export function detectDiodeClamper(analysis?: AnalysisResult | null): boolean {
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
  const hasDiodeInv = inv.some((c) => up(c.type) === "D");
  const hasCapInv = inv.some((c) => up(c.type) === "C");
  const diode = hasDiodeInv || /다이오드|diode/.test(text);
  const cap = hasCapInv || /커패시터|콘덴서|capacitor|µf|μf|uf/.test(text);
  if (!diode || !cap) return false;

  // 능동소자·인덕터가 있으면 다른 유형.
  if (inv.some((c) => ["OPAMP", "BJT", "MOSFET", "L"].includes(up(c.type)))) return false;

  // ★ 강한 긍정 신호를 **양보 가드보다 먼저** 본다 (2026-08-02 실측):
  //   Vision이 relatedConcepts에 "정류 회로"를 곁들여 붙이는 바람에(같은 배열에 "전압 클램핑"이 있는데도)
  //   정류기 양보 가드가 발화해 이 원본이 generic으로 떨어졌다 → "생성 실패: 스키마 불일치".
  if (/클램퍼|clamper|클램핑|clamp|직류\s*복원|레벨\s*이동|전압\s*레벨\s*변환/.test(text)) return true;
  // ★ **출력 파형의 두 레벨(a·b 또는 ㉠·㉡)을 묻는다**는 요구 자체가 이 유형의 시그니처다.
  //   Vision은 같은 원본을 회차마다 "클램핑"·"클리핑"·"정류"로 다르게 부르지만(실측 3회차 모두 다름),
  //   "a와 b의 값을 구한다"는 요구는 세 회차 모두에 남아 있었다 → 낱말보다 요구를 믿는다.
  //   ※ 정류·평활 문제는 리플·직류 성분을 묻지, 파형의 두 레벨을 a·b로 묻지 않는다.
  const abAsk = /\ba\s*(와|과|,)\s*b\b|a와\s*b|㉠[\s\S]{0,20}㉡/.test(text);
  if (abAsk) return true;

  // 형제 양보 — 제너 레귤레이터·정류기·클리퍼가 **주제**일 때만(위 요구가 없을 때).
  const head = `${analysis.topic ?? ""} ${analysis.interpretation ?? ""}`.toLowerCase();
  if (/제너|zener|정전압|레귤레이터/.test(text)) return false;
  if (/정류|rectifier|리플|평활/.test(head)) return false;      // 개념 태그가 아니라 주제일 때만
  if (/클리퍼|clipper|리미터|limiter/.test(head)) return false;

  // 요구 — 입력·출력 파형 문맥 + "값을 구한다"류.
  //   ★ Vision이 "클램핑"을 안 쓰고 a·b도 "특정 시점의 전압 값"으로 뭉뚱그리는 회차가 있다(실측 2회차).
  //     이 조합(다이오드 + **직렬 커패시터** + 입출력 파형 + 능동소자 없음)은 임용 범위에서
  //     사실상 클램퍼뿐이다 — 클리퍼는 커패시터가 없고, 정류·평활은 주제에 그 낱말이 나온다(위에서 양보).
  const waveIo = /입력\s*전압.*출력\s*전압|파형/.test(text);
  const askVal =
    /\ba\b.*\bb\b|상한|하한|최댓값.*최솟값|레벨/.test(text) ||
    /값을?\s*(구|쓰|계산|읽)/.test(text) || /특정\s*시점/.test(text) || /파형을?\s*(구|분석|도시)/.test(text);
  return waveIo && askVal;
}
