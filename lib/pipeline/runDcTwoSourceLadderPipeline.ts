import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { generateDcTwoSourceLadder } from "@/lib/generation/topologies/dcTwoSourceLadder";
import { generateInParallel } from "./_common";
import {
  type AnalysisResult,
  type FigureVariant,
  type GeneratedProblem,
  type GenerationMode,
  type TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runDcTwoSourceLadderPipeline");

/**
 * 전압원 + 전류원 DC 사다리 → 두 저항의 전류 (임용 3번 회로이론) — 결정론 파이프라인. GPT 없음.
 *   유사: R_a의 I₁ · R_e의 I₂ (원본)  /  변형: R_c의 I₁ · R_d의 I₂ (구하는 대상 교환)
 */
export async function runDcTwoSourceLadderPipeline(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  count: number;
  topicKey?: TopicKey;
}): Promise<GeneratedProblem[]> {
  const { mode, count, topicKey } = args;
  const variant = mode === "exam_variant";

  return generateInParallel(count, async (i, seed) => {
    const gen = generateDcTwoSourceLadder({ seed, mode });
    const v = gen.values, a = gen.answer;
    log.info("dc_two_source_ladder_generated", {
      mode, Vs: v.Vs, Ra: v.Ra, Rb: v.Rb, Is: v.Is, Rc: v.Rc, Rd: v.Rd, Re: v.Re,
      Vm: a.Vm, I1: a.i1Value, I2: a.i2Value,
    });

    const r1Label = variant ? v.rcLabel : v.raLabel;
    const r2Label = variant ? v.rdLabel : v.reLabel;
    const content =
      `그림은 전압원과 전류원이 포함된 저항 회로이다. ` +
      `저항 ${r1Label}에 흐르는 전류 I₁[mA]와 저항 ${r2Label}에 흐르는 전류 I₂[mA]를 구하여 순서대로 쓰시오. ` +
      `(단, 모든 소자는 이상적으로 동작한다.)`;

    const conditions = [
      `좌측: 전압원 ${v.vsLabel} (위쪽이 +), 상단 도선으로 저항 ${v.raLabel} — 마디 M — 저항 ${v.rbLabel} — 우측 전류원 ${v.isLabel}(위 방향)`,
      `마디 M에서 아래로 저항 ${v.rcLabel} — 마디 N`,
      `마디 N에서 아래로 저항 ${v.rdLabel}과 ${v.reLabel}이 병렬로 접지에 연결`,
      variant
        ? `I₁은 ${v.rcLabel}에 흐르는 전류(아래 방향), I₂는 ${v.rdLabel}에 흐르는 전류(아래 방향)`
        : `I₁은 ${v.raLabel}에 흐르는 전류(오른쪽 방향), I₂는 ${v.reLabel}에 흐르는 전류(아래 방향)`,
    ];

    const question = [
      `[단계 1] 마디 N 아래의 병렬 저항 합성값 R_p[kΩ]와, 마디 M에서 본 아래쪽 저항 (R_c + R_p)[kΩ]를 구한다.`,
      `[단계 2] 마디 M에서 키르히호프의 전류 법칙(KCL)을 적용하여 마디 전압 V_M[V]를 구한다. (전류원과 직렬인 ${v.rbLabel}에는 전류원의 전류가 그대로 흐른다.)`,
      `[단계 3] [단계 2]의 결과로 전류 I₁[mA]와 I₂[mA]를 순서대로 구한다.`,
    ].join("\n");

    const fmt = (x: number) => (Number.isInteger(x) ? String(x) : String(Number(x.toFixed(3))));
    const answer = [
      `[단계 1] R_p = ${fmt(a.Rp)} kΩ,  R_c + R_p = ${fmt(v.Rc + a.Rp)} kΩ`,
      `[단계 2] V_M = ${fmt(a.Vm)} V  (마디 N 전압 V_N = ${fmt(a.Vn)} V)`,
      `[단계 3] I₁ = ${fmt(a.i1Value)} mA,  I₂ = ${fmt(a.i2Value)} mA`,
    ].join("\n");

    const solution = [
      `[단계 1] 병렬 합성 R_p = (${v.Rd}×${v.Re})/(${v.Rd}+${v.Re}) = ${fmt(a.Rp)} kΩ.`,
      `  마디 M에서 접지로 내려가는 경로는 ${v.rcLabel}과 R_p의 직렬이므로 R_c + R_p = ${fmt(v.Rc + a.Rp)} kΩ.`,
      `[단계 2] 우측 전류원은 이상 전원이므로 ${v.rbLabel}에는 ${v.isLabel}가 그대로 흘러 마디 M으로 들어온다.`,
      `  마디 M의 KCL: (${v.Vs} − V_M)/${v.Ra} + ${v.Is} = V_M/${fmt(v.Rc + a.Rp)}`,
      `  → V_M = (${v.Vs}/${v.Ra} + ${v.Is}) / (1/${v.Ra} + 1/${fmt(v.Rc + a.Rp)}) = ${fmt(a.Vm)} V.`,
      `  마디 N: 전압 분배로 V_N = V_M · R_p/(R_c+R_p) = ${fmt(a.Vm)} × ${fmt(a.Rp)}/${fmt(v.Rc + a.Rp)} = ${fmt(a.Vn)} V.`,
      variant
        ? `[단계 3] I₁ = V_M/(R_c+R_p) = ${fmt(a.Vm)}/${fmt(v.Rc + a.Rp)} = ${fmt(a.Irc)} mA (아래 방향).`
        : `[단계 3] I₁ = (${v.Vs} − ${fmt(a.Vm)})/${v.Ra} = ${fmt(a.I1)} mA` +
          (a.I1 < 0 ? ` — 음수이므로 화살표와 **반대 방향**으로 흐른다.` : `.`),
      variant
        ? `  I₂ = V_N/${v.Rd} = ${fmt(a.Vn)}/${v.Rd} = ${fmt(a.Ird)} mA.`
        : `  I₂ = V_N/${v.Re} = ${fmt(a.Vn)}/${v.Re} = ${fmt(a.I2)} mA.`,
      `  (검산: 마디 N에서 ${v.rdLabel}·${v.reLabel} 전류의 합 ${fmt(a.Ird)} + ${fmt(a.I2)} = ${fmt(a.Irc)} mA = R_c 전류.)`,
    ].join("\n");

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_dctsl_${i + 1}`,
        label: "전압원·전류원이 포함된 저항 회로",
        role: "original_circuit",
        diagramType: "dc_two_source_ladder_circuit",
        diagram: gen.circuitDiagram,
      },
    ];

    return { id: randomUUID(), content, conditions, question, answer, solution, topicKey, figureVariants };
  });
}

/**
 * 전압원+전류원 DC 사다리 감지 — 분류·route 안전망.
 *
 * ★ 시그니처: 순수 DC 저항회로(L·C·SW·종속원 없음) + **전압원 1개 + 전류원 1개** + R 4개 이상
 *   + "저항 …에 흐르는 전류"를 **2개** 묻는다.
 *   · universal_dc로도 회로 자체는 재현되지만 generic 렌더러가 사다리를 접어 그려 원본과 딴판이 된다
 *     (사용자 신고 2회) → 그림을 위해 전용 archetype으로 받는다.
 *   · 가변저항·목표전압(imyong_10)·전원변환/전압비(source_transform)·테브난·중첩 명시는 양보.
 */
export function detectDcTwoSourceLadder(analysis?: AnalysisResult | null): boolean {
  if (!analysis) return false;
  const text = [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ").toLowerCase().replace(/[₀-₉]/g, (ch) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(ch)));
  if (!text.trim()) return false;

  const inv = analysis.componentInventory ?? [];
  const up = (x: unknown) => String(x ?? "").toUpperCase();
  const n = (t: string) => inv.filter((c) => up(c.type) === t).length;
  if (inv.some((c) => ["L", "C", "SW", "CCVS", "CCCS", "VCVS", "VCCS", "OPAMP"].includes(up(c.type)))) return false;
  if (n("V") !== 1 || n("I") !== 1 || n("R") < 4) return false;

  // 형제 양보 — 각자 전용 경로가 있다.
  if (/가변\s*저항|가변저항|조정|목표\s*전압/.test(text)) return false;              // imyong_10
  if (/전원\s*변환|소스\s*변환|전압\s*비|등가\s*변환/.test(text)) return false;        // source_transform_ratio
  if (/테브난|thevenin|노턴|norton|최대\s*전력|중첩|초\s*메쉬|supermesh/.test(text)) return false;
  if (/스위치|과도|시정수|교류|페이저/.test(text)) return false;

  // 요구 — "저항 …에 흐르는 전류"를 2개 묻는다.
  const currentAsks = [...text.matchAll(/(?:흐르는|통과하는)\s*전류/g)].length;
  const twoLabels = /i\s*_?\s*1/.test(text) && /i\s*_?\s*2/.test(text);
  return currentAsks >= 1 && (twoLabels || currentAsks >= 2);
}
