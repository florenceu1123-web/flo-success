/**
 * 노튼 등가 + 파라미터 역산 (임용 5번) 전용 파이프라인.
 * 토폴로지를 코드가 알고 있어 Vision의 연결 인식·요약 흔들림에 의존하지 않는다.
 */
import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import { pickNorton, num, coefA, type NortonInstance } from "@/lib/generation/topologies/nortonParamInverse";
import type {
  AnalysisResult, CircuitNetlist, FigureVariant, GeneratedProblem, GenerationMode, TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runNortonParamInversePipeline");

/**
 * 감지 — **본문 서술** 기준.
 * 시그니처: 노튼(또는 테브난) 등가 + 기호 파라미터 a + 목표 전류/전압 조건.
 *
 * ★ Vision이 이 원본을 "종속 전원 포함"으로 잘못 요약하는 일이 잦다(실측) — 실제로는
 *   독립 전원만 있다. 그래서 종속원 여부는 **판별 조건에 넣지 않는다**.
 */
export function detectNortonParamInverse(analysis: AnalysisResult | null | undefined): boolean {
  const text = [analysis?.topic, analysis?.interpretation, ...(analysis?.relatedConcepts ?? [])]
    .filter(Boolean).join(" ");
  if (!text.trim()) return false;
  // ★ 판별의 축은 **inventory**다 — Vision 요약 문장은 회차마다 크게 흔들리지만(실측: 3회 중
  //   1회만 "노튼"이 남고, 없는 "종속 전원"을 지어내기도 한다) inventory는 안정적으로 정확했다.
  const inv = analysis?.componentInventory ?? [];
  const isSymA = (v: unknown) => /^[+-]?\d*\.?\d*\s*a(\s*\[|\s*Ω|\s*ohm|$)/i.test(String(v ?? "").trim());
  const symbolicRs = inv.filter((c) => c.type === "R" && isSymA(c.value)).length;
  const hasV = inv.some((c) => c.type === "V");
  const hasI = inv.some((c) => c.type === "I");
  const numericRs = inv.filter((c) => c.type === "R" && !isSymA(c.value)).length;
  // 이 원본의 구조 지문: 기호 저항 2개 이상(a·a·2a) + 독립 전압원 + 독립 전류원.
  const structure = symbolicRs >= 2 && hasV && hasI && numericRs >= 1;

  // 문맥 — 등가 변환/부하 중 하나만 남아도 인정한다(요약이 흔들리므로 느슨하게).
  const context =
    /노튼|norton|테브난|thevenin/i.test(text) ||
    /등가\s*회로|등가\s*변환/.test(text) ||
    (/부하/.test(text) && /전류/.test(text));
  // 파라미터를 구하라는 요구
  const asksParam =
    /(^|[^A-Za-z])a\s*(값|를|의)/.test(text) || /되도록\s*하는/.test(text) ||
    /변수\s*a|파라미터/.test(text) || /만족/.test(text);

  // inventory가 없으면(추출 실패) 본문 표기로 대신 판단한다.
  if (inv.length === 0) {
    return /노튼|norton/i.test(text) && /\d*\s*a\s*\[\s*(Ω|ohm)\s*\]/i.test(text) && asksParam;
  }
  return structure && context && asksParam;
}

/** (가) 원본 회로 netlist — 전용 렌더러가 고정 슬롯으로 그린다. */
function buildOriginalNetlist(inst: NortonInstance): CircuitNetlist {
  const { vs, is, rp } = inst.params;
  return {
    ground: "GND",
    components: [
      { id: "V_s", type: "V", value: `${num(vs)}[V]`, pins: [{ node: "P" }, { node: "R" }] },
      { id: "R_p", type: "R", value: `${num(rp)}[Ω]`, pins: [{ node: "P" }, { node: "R" }] },
      { id: "I_s", type: "I", value: `${num(is)}[A]`, pins: [{ node: "P" }, { node: "Q" }] },
      { id: "R_top", type: "R", value: "a[Ω]", pins: [{ node: "P" }, { node: "Q" }] },
      { id: "R_bot", type: "R", value: "a[Ω]", pins: [{ node: "R" }, { node: "S" }] },
      { id: "R_mid", type: "R", value: "2a[Ω]", pins: [{ node: "Q" }, { node: "S" }] },
    ],
  } as unknown as CircuitNetlist;
}

/** (나) 노튼 등가 회로 netlist. */
function buildNortonNetlist(inst: NortonInstance): CircuitNetlist {
  return {
    ground: "GND",
    components: [
      { id: "I_N", type: "I", value: "I_N", pins: [{ node: "B" }, { node: "A" }] },
      { id: "R_N", type: "R", value: "R_N", pins: [{ node: "A" }, { node: "B" }] },
      { id: "R_L", type: "R", value: `${num(inst.params.rl)}[Ω]`, pins: [{ node: "A" }, { node: "B" }] },
    ],
  } as unknown as CircuitNetlist;
}

export async function runNortonParamInversePipeline(args: {
  mode: GenerationMode;
  count: number;
}): Promise<GeneratedProblem[]> {
  const { mode, count } = args;
  const out: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    const inst = pickNorton(mode, i);
    const { vs, is, rp, rl, target } = inst.params;
    const a = num(inst.aStar);
    const variant = mode === "exam_variant";

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_nti_${i + 1}_a`, label: "(가) 주어진 회로", role: "original_circuit",
        diagramType: "analog_netlist", diagram: buildOriginalNetlist(inst),
      } as FigureVariant,
      {
        id: `fig_nti_${i + 1}_b`, label: "(나) 노튼 등가 회로", role: "equivalent_circuit",
        diagramType: "analog_netlist", diagram: buildNortonNetlist(inst),
      } as FigureVariant,
    ];

    const iN1 = num(vs / (2 * inst.aStar));
    const iN2 = num(is / 2);
    const conditions = [
      `\\( \\mathrm{A} \\)·\\( \\mathrm{B} \\) 단자에 부하 저항 \\( R_L \\)을 연결하며, 모든 소자는 이상적이고 \\( a > 0 \\)이다.`,
      `그림 (가)의 점선 영역을 노튼 등가 회로로 변환한 것이 그림 (나)이다.`,
    ];

    if (!variant) {
      // 유사(원본 구조): I_N1·I_N2 → R_N → 목표 전류가 되는 a
      out.push({
        id: randomUUID(),
        content:
          `그림 (가)는 전압원과 전류원이 포함된 회로이고, 그림 (나)는 (가)의 점선으로 표시된 영역을 ` +
          `노튼 등가 회로로 변환하고 A와 B 단자에 부하 저항 \\( R_L \\)을 연결한 회로이다. ` +
          `\\( R_L \\)에 흐르는 전류 \\( I_L = ${num(target)}\\,[\\mathrm{A}] \\)이 되도록 하는 \\( a \\)값을 ` +
          `제시된 〈해석 절차〉에 따라 구하여 순서대로 서술하시오.`,
        conditions,
        question: [
          `[단계 1] 그림 (가)에서 전류원을 개방하고 A와 B 단자를 단락한 후 A와 B 사이에 흐르는 전류 \\( I_{N1}\\,[\\mathrm{A}] \\)을 구하고, ` +
            `전압원을 단락하고 A와 B 단자를 단락한 후 A와 B 사이에 흐르는 전류 \\( I_{N2}\\,[\\mathrm{A}] \\)를 구하시오.`,
          `[단계 2] 노튼 등가 저항 \\( R_N\\,[\\Omega] \\)을 구하시오.`,
          `[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여, 그림 (나)의 부하 저항 \\( R_L = ${num(rl)}\\,[\\Omega] \\)일 때, ` +
            `\\( R_L \\)에 흐르는 전류가 \\( I_L = ${num(target)}\\,[\\mathrm{A}] \\)이 되도록 하는 \\( a \\)값을 구하시오.`,
        ].join("\n"),
        answer:
          `\\( I_{N1} = \\dfrac{${num(vs)}}{2a} = \\dfrac{${num(vs / 2)}}{a}\\,[\\mathrm{A}] \\), ` +
          `\\( I_{N2} = ${iN2}\\,[\\mathrm{A}] \\), \\( R_N = a\\,[\\Omega] \\), \\( a = ${a}\\,[\\Omega] \\)`,
        solution: [
          `[단계 1] 전류원을 개방하면 \\( \\mathrm{P} \\to a \\to \\mathrm{A} \\)(단락)\\( \\to a \\to \\mathrm{R} \\) 경로만 남아 저항이 \\( 2a \\)이므로 ` +
            `\\( I_{N1} = \\dfrac{${num(vs)}}{2a}\\,[\\mathrm{A}] \\). ` +
            `전압원을 단락하면 위·아래 \\( a \\)가 대칭이 되어 전류원 \\( ${num(is)}\\,[\\mathrm{A}] \\)이 반씩 나뉘므로 ` +
            `\\( I_{N2} = \\dfrac{${num(is)}}{2} = ${iN2}\\,[\\mathrm{A}] \\). ` +
            `따라서 \\( I_N = I_{N1} + I_{N2} = \\dfrac{${num(vs)} + ${num(is)}a}{2a}\\,[\\mathrm{A}] \\). ` +
            `(\\( ${num(rp)}\\,[\\Omega] \\)은 이상 전압원과 병렬이라 외부 회로에 영향을 주지 않는다.)`,
          `[단계 2] 두 전원을 모두 죽이면(전압원 단락·전류원 개방) A–B에서 본 저항은 ` +
            `\\( (a + a) \\parallel 2a = \\dfrac{2a \\times 2a}{2a + 2a} = a \\)이므로 \\( R_N = a\\,[\\Omega] \\).`,
          `[단계 3] 전류 분배: \\( I_L = I_N \\dfrac{R_N}{R_N + R_L} = \\dfrac{${num(vs)} + ${num(is)}a}{2a}\\cdot\\dfrac{a}{a + ${num(rl)}} ` +
            `= \\dfrac{${num(vs)} + ${num(is)}a}{2(a + ${num(rl)})} \\). ` +
            `이것이 \\( ${num(target)} \\)이 되려면 \\( ${num(vs)} + ${num(is)}a = ${num(2 * target)}(a + ${num(rl)}) \\) ` +
            `\\( \\Rightarrow a = \\dfrac{${num(2 * target * rl)} - ${num(vs)}}{${num(is)} - ${num(2 * target)}} = ${a}\\,[\\Omega] \\).`,
        ].join("\n"),
        topicKey: "thevenin" as TopicKey,
        figureVariants,
      } satisfies GeneratedProblem);
      continue;
    }

    // 변형: 구하는 양 교환 — a가 주어지고 목표 전류가 되도록 하는 부하 저항 R_L 역산
    const rlAns = (vs + is * inst.aStar) / (2 * target) - inst.aStar;
    out.push({
      id: randomUUID(),
      content:
        `그림 (가)는 전압원과 전류원이 포함된 회로이고, 그림 (나)는 (가)의 점선으로 표시된 영역을 ` +
        `노튼 등가 회로로 변환하고 A와 B 단자에 부하 저항 \\( R_L \\)을 연결한 회로이다. ` +
        `\\( a = ${a}\\,[\\Omega] \\)일 때, \\( R_L \\)에 흐르는 전류가 \\( I_L = ${num(target)}\\,[\\mathrm{A}] \\)이 되도록 하는 ` +
        `부하 저항 \\( R_L\\,[\\Omega] \\)을 제시된 〈해석 절차〉에 따라 구하여 순서대로 서술하시오.`,
      conditions: [
        ...conditions,
        `\\( a = ${a}\\,[\\Omega] \\)이다.`,
      ],
      question: [
        `[단계 1] 그림 (가)에서 전류원을 개방하고 A와 B 단자를 단락했을 때의 전류 \\( I_{N1}\\,[\\mathrm{A}] \\)과, ` +
          `전압원을 단락하고 A와 B 단자를 단락했을 때의 전류 \\( I_{N2}\\,[\\mathrm{A}] \\)를 구하고, 노튼 전류 \\( I_N\\,[\\mathrm{A}] \\)을 구하시오.`,
        `[단계 2] 노튼 등가 저항 \\( R_N\\,[\\Omega] \\)을 구하시오.`,
        `[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여, \\( R_L \\)에 흐르는 전류가 \\( I_L = ${num(target)}\\,[\\mathrm{A}] \\)이 되도록 하는 ` +
          `부하 저항 \\( R_L\\,[\\Omega] \\)을 구하시오.`,
      ].join("\n"),
      answer:
        `\\( I_{N1} = ${iN1}\\,[\\mathrm{A}] \\), \\( I_{N2} = ${iN2}\\,[\\mathrm{A}] \\), ` +
        `\\( I_N = ${num(inst.iN)}\\,[\\mathrm{A}] \\), \\( R_N = ${a}\\,[\\Omega] \\), \\( R_L = ${num(rlAns)}\\,[\\Omega] \\)`,
      solution: [
        `[단계 1] 전류원 개방 시 저항이 \\( 2a = ${num(2 * inst.aStar)}\\,[\\Omega] \\)이므로 ` +
          `\\( I_{N1} = \\dfrac{${num(vs)}}{${num(2 * inst.aStar)}} = ${iN1}\\,[\\mathrm{A}] \\). ` +
          `전압원 단락 시 위·아래 \\( a \\)가 대칭이므로 \\( I_{N2} = \\dfrac{${num(is)}}{2} = ${iN2}\\,[\\mathrm{A}] \\). ` +
          `따라서 \\( I_N = ${iN1} + ${iN2} = ${num(inst.iN)}\\,[\\mathrm{A}] \\).`,
        `[단계 2] \\( R_N = (a + a) \\parallel 2a = a = ${a}\\,[\\Omega] \\).`,
        `[단계 3] \\( I_L = I_N\\dfrac{R_N}{R_N + R_L} = ${num(target)} \\)에서 ` +
          `\\( R_L = R_N\\left(\\dfrac{I_N}{I_L} - 1\\right) = ${a}\\left(\\dfrac{${num(inst.iN)}}{${num(target)}} - 1\\right) = ${num(rlAns)}\\,[\\Omega] \\).`,
      ].join("\n"),
      topicKey: "thevenin" as TopicKey,
      figureVariants,
    } satisfies GeneratedProblem);
  }
  log.info("norton_param_inverse_generated", { mode, count: out.length });
  return out;
}
