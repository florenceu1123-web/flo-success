/**
 * 제너 클리퍼 + 적분기(삼각파) — 임용 2번 전용 파이프라인.
 * 토폴로지를 코드가 알고 있어 Vision의 연결 인식·요약 흔들림에 의존하지 않는다.
 */
import { randomUUID } from "node:crypto";
import { createLogger } from "@/lib/logger";
import {
  pickZenerClipper, num, V_DIODE, type ZenerClipperInstance,
} from "@/lib/generation/topologies/zenerClipperIntegrator";
import type {
  AnalysisResult, CircuitNetlist, FigureVariant, GeneratedProblem, GenerationMode, TopicKey,
} from "@/types";

const log = createLogger("lib/pipeline/runZenerClipperIntegratorPipeline");

/**
 * 감지 — **inventory 구조 지문**을 축으로 한다.
 * 요약 문장은 회차마다 흔들리지만(실측) inventory 는 안정적으로 정확했다.
 *
 * 구조 지문: 제너 다이오드(또는 다이오드) 2개 + OPAMP 2개 + 커패시터 1개.
 * 문맥: 최대 변동값(peak-to-peak) 또는 제너/항복 + 적분/커패시터 피드백.
 */
export function detectZenerClipperIntegrator(analysis: AnalysisResult | null | undefined): boolean {
  const text = [analysis?.topic, analysis?.interpretation, ...(analysis?.relatedConcepts ?? [])]
    .filter(Boolean).join(" ");
  if (!text.trim()) return false;
  const inv = analysis?.componentInventory ?? [];

  const opamps = inv.filter((c) => c.type === "OPAMP").length;
  const diodes = inv.filter((c) => c.type === "D").length;
  const caps = inv.filter((c) => c.type === "C").length;
  // 구조: OPAMP 2단 + 다이오드(제너) 2개 + 적분 커패시터
  // ★ 제너 2개를 하나로 묶어 읽는 회차가 있어 다이오드는 1개 이상만 요구한다(실측 2/3 → 개선).
  const structure = opamps >= 2 && diodes >= 1 && caps >= 1;

  // ★ 텍스트 조건은 **보조**로만 쓴다. 실측에서 요약이 회차마다 크게 흔들렸다 —
  //   "적분기"·"peak-to-peak"를 요구하니 3/3 미발화, "제너"만 요구해도 1/3 만 발화했다
  //   (Vision 이 "발진 회로", "최대 전압"으로 요약하며 제너를 언급하지 않는 회차가 있다).
  //   **역직렬 제너 2개**는 이 유형 고유의 구조라 다이오드 2개면 텍스트 없이도 확정한다.
  //   (형제 구분: functionGenerator 는 다이오드가 없고, opamp_series_regulator 는 OPAMP 1개+BJT.)
  const zener = /제너|zener|항복/i.test(text);

  // inventory 가 비면(추출 실패) 텍스트만으로 판단한다 — 이때는 조건을 좁힌다.
  if (inv.length === 0) {
    const pp = /peak[-\s]?to[-\s]?peak|최대\s*변동|V_?PP|첨두/i.test(text);
    const integrator = /적분/.test(text);
    return zener && (pp || integrator) && /연산\s*증폭기|op[-\s]?amp/i.test(text);
  }
  if (opamps >= 2 && caps >= 1 && diodes >= 2) return true;   // 구조만으로 확정
  return structure && zener;                                   // 다이오드 1개면 텍스트 보조
}

/** (가) 2단 회로 netlist — 전용 렌더러가 고정 슬롯으로 그린다. */
function buildCircuitNetlist(inst: ZenerClipperInstance): CircuitNetlist {
  const { vz, rin, rint, cap } = inst.params;
  return {
    ground: "GND",
    components: [
      { id: "R_in", type: "R", value: `${num(rin)}[kΩ]`, pins: [{ id: "p", node: "VS" }, { id: "n", node: "N1" }] },
      { id: "D_Z1", type: "D", value: `V_Z1=${num(vz)}[V]`, pins: [{ id: "p", node: "N1" }, { id: "n", node: "MID" }] },
      { id: "D_Z2", type: "D", value: `V_Z2=${num(vz)}[V]`, pins: [{ id: "p", node: "MID" }, { id: "n", node: "V1" }] },
      { id: "U1", type: "OPAMP", value: "ideal", pins: [{ id: "vp", node: "GND" }, { id: "vn", node: "N1" }, { id: "vo", node: "V1" }] },
      { id: "R_int", type: "R", value: `${num(rint)}[kΩ]`, pins: [{ id: "p", node: "V1" }, { id: "n", node: "N2" }] },
      { id: "C_f", type: "C", value: `${num(cap)}[μF]`, pins: [{ id: "p", node: "N2" }, { id: "n", node: "VO" }] },
      { id: "U2", type: "OPAMP", value: "ideal", pins: [{ id: "vp", node: "GND" }, { id: "vn", node: "N2" }, { id: "vo", node: "VO" }] },
    ],
  } as unknown as CircuitNetlist;
}

/**
 * (나) 입력 파형 — WaveformDiagram.
 * ★ 필드명은 `signals`/`samples` 다. `tracks`/`points` 로 주면 렌더러가 빈 상자만 그리고
 *   validator 가 `figures/waveform_shape: signals 누락` 을 낸다(실측).
 */
function buildInputWaveform(inst: ZenerClipperInstance) {
  const { amp, period } = inst.params;
  const samples: Array<{ t: number; v: number }> = [];
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const t = (period * i) / N;
    samples.push({ t: Number(t.toFixed(3)), v: Number((amp * Math.sin((2 * Math.PI * t) / period)).toFixed(4)) });
  }
  return {
    signals: [{ name: "v_s(t)", samples, shape: "linear" as const }],
    unit: { time: "μs", value: "V" },
    xAxis: { symbol: "t", unit: "μs" },
    markers: [
      { t: period / 2, label: `${num(period / 2)}` },
      { t: period, label: `${num(period)}` },
    ],
  };
}

export async function runZenerClipperIntegratorPipeline(args: {
  mode: GenerationMode;
  count: number;
}): Promise<GeneratedProblem[]> {
  const { mode, count } = args;
  const out: GeneratedProblem[] = [];
  for (let i = 0; i < count; i++) {
    const inst = pickZenerClipper(mode, i);
    const { vz, rin, rint, cap, period, amp } = inst.params;
    const variant = mode === "exam_variant";
    const half = num(inst.halfUs);
    const voPeak = num(inst.voPeak);
    const vclip = num(inst.vClip);
    const rc = num(inst.rcUs);
    // 변형에서 물어볼 시각 — 반주기의 절반(램프 도중)
    const tQuery = inst.halfUs / 2;
    const voAtQuery = Number(((inst.vClip * tQuery) / inst.rcUs).toFixed(6));

    const figureVariants: FigureVariant[] = [
      {
        id: `fig_zci_${i + 1}_a`, label: "(가) 회로", role: "original_circuit",
        diagramType: "analog_netlist", diagram: buildCircuitNetlist(inst),
      } as FigureVariant,
      {
        id: `fig_zci_${i + 1}_b`, label: "(나) 입력 신호 v_s(t)", role: "input_waveform",
        diagramType: "waveform", diagram: buildInputWaveform(inst),
      } as FigureVariant,
    ];

    const conditions = [
      `제너다이오드의 순방향 전압 강하는 \\( ${num(V_DIODE)}\\,[\\mathrm{V}] \\)이고, \\( V_{Z1} \\)과 \\( V_{Z2} \\)는 역방향 항복 전압이다.`,
      `커패시터 전압의 초깃값은 0이고 연산 증폭기는 이상적으로 동작한다.`,
      `\\( v_s(t) \\)는 진폭 \\( ${num(amp)}\\,[\\mathrm{V}] \\), 주기 \\( ${num(period)}\\,[\\mu\\mathrm{s}] \\)인 정현파이다.`,
    ];

    const stepCommon =
      `[1단] 제너 2개가 역직렬로 귀환에 놓여, 한쪽은 항복(\\( ${num(vz)}\\,\\mathrm{V} \\))·다른 쪽은 순방향(\\( ${num(V_DIODE)}\\,\\mathrm{V} \\))이 되므로 ` +
      `\\( |v_1| = V_Z + V_D = ${vclip}\\,[\\mathrm{V}] \\). 반전 구성이므로 \\( v_1(t) \\)는 \\( v_s(t) \\)와 위상이 반대인 ` +
      `\\( \\pm ${vclip}\\,[\\mathrm{V}] \\) **구형파**이다.`;
    const stepRC =
      `[2단] 적분기의 시정수 \\( R\\,C = ${num(rint)}\\,\\mathrm{k\\Omega} \\times ${num(cap)}\\,\\mu\\mathrm{F} = ${rc}\\,[\\mu\\mathrm{s}] \\). ` +
      `\\( v_1 \\)이 반주기 동안 일정하므로 \\( v_o \\)는 기울기 \\( \\dfrac{v_{clip}}{RC} \\)인 **직선(램프)**으로 변한다.`;

    if (!variant) {
      // 유사(원본 구조): V_PP 와 반주기 시점의 v_o
      out.push({
        id: randomUUID(),
        content:
          `그림 (가)는 연산 증폭기를 이용한 응용 회로이고, 그림 (나)는 회로에 입력되는 신호 \\( v_s(t) \\)이다. ` +
          `\\( v_1(t) \\) 파형의 양의 최대 전압에서 음의 최대 전압까지의 최대 변동값(peak-to-peak value) \\( V_{PP}\\,[\\mathrm{V}] \\)와, ` +
          `\\( t = ${half}\\,[\\mu\\mathrm{s}] \\)일 때 \\( v_o(t)\\,[\\mathrm{V}] \\)의 값을 구하여 순서대로 쓰시오. ` +
          `(단, 제너다이오드의 순방향 전압 강하는 \\( ${num(V_DIODE)}\\,[\\mathrm{V}] \\)이고, \\( V_{Z1} \\)과 \\( V_{Z2} \\)는 역방향 항복 전압이며, ` +
          `커패시터 전압의 초깃값은 0이고 연산 증폭기는 이상적으로 동작한다.)`,
        conditions,
        question: [
          `[단계 1] \\( v_1(t) \\)의 파형과 최대 변동값 \\( V_{PP}\\,[\\mathrm{V}] \\)를 구하시오.`,
          `[단계 2] 적분기의 시정수를 구하고, \\( v_o(t) \\)의 파형을 설명하시오.`,
          `[단계 3] \\( t = ${half}\\,[\\mu\\mathrm{s}] \\)일 때 \\( v_o(t)\\,[\\mathrm{V}] \\)의 값을 구하시오.`,
        ].join("\n"),
        answer:
          // 단위에 대괄호를 붙여야 분수 변환 예외가 걸린다(안 붙이면 3.7 → 37/10 로 바뀐다).
          `\\( V_{PP} = ${num(2 * inst.vClip)}\\,[\\mathrm{V}] \\) (\\( v_1 \\)의 첨두값 \\( \\pm ${vclip}\\,[\\mathrm{V}] \\)), ` +
          `\\( v_o(${half}\\,\\mu\\mathrm{s}) = ${voPeak}\\,[\\mathrm{V}] \\)`,
        solution: [
          `${stepCommon} 따라서 \\( v_1 \\)의 최대 변동값은 \\( V_{PP} = 2 \\times ${vclip} = ${num(2 * inst.vClip)}\\,[\\mathrm{V}] \\).`,
          `${stepRC} 반주기 \\( ${half}\\,\\mu\\mathrm{s} \\) 동안의 변화량은 ` +
            `\\( \\Delta v_o = ${vclip} \\times \\dfrac{${half}}{${rc}} = ${voPeak}\\,[\\mathrm{V}] \\)이므로 \\( v_o \\)는 ` +
            `\\( 0 \\)과 \\( ${voPeak}\\,\\mathrm{V} \\) 사이를 오가는 **삼각파**가 된다.`,
          `[단계 3] \\( v_o(0) = 0 \\)에서 시작해 첫 반주기 동안 위 기울기로 상승하므로 ` +
            `\\( v_o(${half}\\,\\mu\\mathrm{s}) = ${voPeak}\\,[\\mathrm{V}] \\).`,
        ].join("\n"),
        topicKey: "opamp" as TopicKey,
        figureVariants,
      } satisfies GeneratedProblem);
      continue;
    }

    // 변형: 구하는 양 교환 — 삼각파(v_o)의 최대 변동값 + 램프 도중 시각의 값
    out.push({
      id: randomUUID(),
      content:
        `그림 (가)는 연산 증폭기를 이용한 응용 회로이고, 그림 (나)는 회로에 입력되는 신호 \\( v_s(t) \\)이다. ` +
        `출력 \\( v_o(t) \\) 파형의 최대 변동값(peak-to-peak value) \\( V_{PP}\\,[\\mathrm{V}] \\)와, ` +
        `\\( t = ${num(tQuery)}\\,[\\mu\\mathrm{s}] \\)일 때 \\( v_o(t)\\,[\\mathrm{V}] \\)의 값을 구하여 순서대로 쓰시오. ` +
        `(단, 제너다이오드의 순방향 전압 강하는 \\( ${num(V_DIODE)}\\,[\\mathrm{V}] \\)이고, \\( V_{Z1} \\)과 \\( V_{Z2} \\)는 역방향 항복 전압이며, ` +
        `커패시터 전압의 초깃값은 0이고 연산 증폭기는 이상적으로 동작한다.)`,
      conditions,
      question: [
        `[단계 1] \\( v_1(t) \\)의 크기 \\( |v_1|\\,[\\mathrm{V}] \\)를 구하시오.`,
        `[단계 2] 적분기의 시정수를 구하고, 출력 \\( v_o(t) \\) 파형의 최대 변동값 \\( V_{PP}\\,[\\mathrm{V}] \\)를 구하시오.`,
        `[단계 3] \\( t = ${num(tQuery)}\\,[\\mu\\mathrm{s}] \\)일 때 \\( v_o(t)\\,[\\mathrm{V}] \\)의 값을 구하시오.`,
      ].join("\n"),
      answer:
        `\\( |v_1| = ${vclip}\\,[\\mathrm{V}] \\), \\( V_{PP} = ${voPeak}\\,[\\mathrm{V}] \\), ` +
        `\\( v_o(${num(tQuery)}\\,\\mu\\mathrm{s}) = ${num(voAtQuery)}\\,[\\mathrm{V}] \\)`,
      solution: [
        stepCommon,
        `${stepRC} 반주기 \\( ${half}\\,\\mu\\mathrm{s} \\) 동안 \\( ${vclip} \\times \\dfrac{${half}}{${rc}} = ${voPeak}\\,[\\mathrm{V}] \\)만큼 변하고 ` +
          `다음 반주기에 같은 크기로 되돌아오므로, \\( v_o \\)는 \\( 0 \\)과 \\( ${voPeak}\\,\\mathrm{V} \\) 사이의 삼각파이고 ` +
          `\\( V_{PP} = ${voPeak}\\,[\\mathrm{V}] \\).`,
        `[단계 3] 첫 반주기 동안은 일정 기울기로 상승하므로 ` +
          `\\( v_o(${num(tQuery)}\\,\\mu\\mathrm{s}) = ${vclip} \\times \\dfrac{${num(tQuery)}}{${rc}} = ${num(voAtQuery)}\\,[\\mathrm{V}] \\).`,
      ].join("\n"),
      topicKey: "opamp" as TopicKey,
      figureVariants,
    } satisfies GeneratedProblem);
  }
  log.info("zener_clipper_integrator_generated", { mode, count: out.length });
  return out;
}
