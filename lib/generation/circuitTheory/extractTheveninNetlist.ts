/**
 * 회로이론 테브난+최대전력(+종속전원) generic 추출 — GPT가 업로드 회로를 netlist로.
 *
 *  ★ 원칙(opamp_generic과 동일): 예시 하드코딩 금지. 업로드 구조(독립원·종속원 2i_x·가변 R·단자 a-b)를
 *    GPT가 netlist로 추출 → netlistToSolver(CCVS 변환) + solveTheveninViaSc(종속원 보존) 결정론 풀이.
 *
 *  임용 9번 형식: V_th는 가변 R의 함수 → 그래프 (나)로 R 도출, 그 다음 I_sc, P_max.
 *    생성: 가변 R에 구체값을 넣어 V_th/R_th/I_sc/P_max를 결정론 계산. 그림엔 R을 "R"로 블랭크,
 *    (나) 그래프에 V_th·I_sc 제시 → 학생이 R·I_sc·P_max 역산.
 */

import { getOpenAI, DEFAULT_MODEL, withRateLimitRetry } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { netlistToSolverNetwork } from "@/lib/solver/netlistToSolver";
import { isDependentComponent, isDependentCurrentSource } from "@/lib/analysis/dependentSource";
import { solveTheveninViaSc } from "@/lib/solver/thevenin";
import type {
  AnalysisResult, CircuitComponent, CircuitNetlist, CircuitComponentType,
  ComponentPin, GenerationMode, PinSide,
} from "@/types";

const log = createLogger("lib/generation/circuitTheory/extractTheveninNetlist");

type RawComponent = {
  id: string;
  type: string;          // V/I/R/CCVS/CCCS/VCVS/VCCS/WIRE
  value?: string;        // "9V", "5Ω", "2i_x"(종속원 이득·제어)
  control?: string;      // 종속원: 제어 전류 i_x가 흐르는 저항 id (CCVS/CCCS) 또는 제어 노드
  pinNodes: string[];    // 2-pin: [a,b] (V는 a=+, CCVS는 a=+)
};
type RawNetlist = {
  components: RawComponent[];
  ground: string;
  terminalA: string;     // 부하 단자 a
  terminalB: string;     // 부하 단자 b (보통 GND)
  unknownComponentId?: string;  // 가변 R (학생이 그래프로 도출)
};

export type TheveninExtraction = {
  netlist: CircuitNetlist;       // 풀이용 (가변 R 구체값 포함)
  terminalA: string;
  terminalB: string;
  Vth: number;
  Rth: number;
  Isc: number;
  RLopt: number;                 // = Rth
  Pmax: number;                  // = Vth^2/(4 Rth)
  unknownId?: string;
  unknownValue?: number;
  unknownUnit?: string;
  hasDependent: boolean;
  warnings: string[];
};

const ALLOWED = new Set<CircuitComponentType>(["R", "V", "I", "CCVS", "CCCS", "VCVS", "VCCS", "WIRE"]);

function defaultPins(nodes: string[], id: string): ComponentPin[] {
  return nodes.map((node, i) => ({ id: `${id}_p${i + 1}`, node, side: (i === 0 ? "left" : "right") as PinSide }));
}

function adapt(raw: RawNetlist): CircuitNetlist {
  const components: CircuitComponent[] = [];
  for (const rc of raw.components) {
    const type = rc.type.toUpperCase() as CircuitComponentType;
    if (!ALLOWED.has(type)) continue;
    const nodes = (rc.pinNodes ?? []).filter(Boolean);
    if (nodes.length < 2) continue;
    components.push({ id: rc.id, type, value: rc.value, control: rc.control, pins: defaultPins(nodes, rc.id) });
  }
  // ★ 제어전류 i_x 표시 — 종속전원의 control(제어 저항)에 전류 화살표+라벨을 붙인다.
  //   실측 신고: "IX가 어디인지 표시가 안되어있어" — 값에는 "3i_x"가 있는데 그림엔 i_x가 어느
  //   가지를 흐르는지 표기가 없어 문제를 풀 수 없었다. 원본도 제어 가지에 i 화살표가 있다.
  //   (렌더러 analogMeshRenderer는 measurementMarks{kind:"current"}를 이미 지원한다.)
  const depComp = components.find((c) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(c.type));
  const controlId = depComp?.control;
  const measurementMarks =
    controlId && components.some((c) => c.id === controlId)
      ? [{ kind: "current" as const, refs: [controlId], label: controlVarLabel(depComp?.value) }]
      : undefined;

  return {
    components,
    ground: raw.ground,
    nodeAnnotations: [
      { node: raw.terminalA, label: "a", style: "label_only" as const },
      // 단자 b는 보통 접지 rail이지만 원본처럼 라벨을 표기한다(a-b 쌍이 보여야 문제가 성립).
      ...(raw.terminalB ? [{ node: raw.terminalB, label: "b", style: "label_only" as const }] : []),
    ],
    loadPlaceholders: [{ betweenNodes: [raw.terminalA, raw.terminalB], label: "R_L", emphasize: true }],
    ...(measurementMarks ? { measurementMarks } : {}),
  };
}

/**
 * 재시도 시 실패 원인별 구체적 처방.
 *   ★ 일반 문구만 주면 같은 실패를 반복한다(실측: "비정상 해(R_th≤0)"로 7회 소진 → 생성 실패).
 *   종속전원 회로는 **전류원 방향·제어저항 선택**에 따라 등가저항이 음수가 될 수 있어,
 *   그 경우 방향을 뒤집으라고 명시해야 빠져나온다.
 */
function retryRemedy(lastErr: string): string {
  const base = "반드시: 종속전원 포함(control=제어저항 id), 단자 a-b 지정, 모든 노드 ≥2 연결, 회로 폐합.";
  if (/비정상 해|R_th=/.test(lastErr)) {
    return [
      "★ 등가저항 R_th가 0 이하로 나왔다(최대전력 문제는 R_th>0이어야 한다). 다음 중 하나를 바꿔라:",
      "  - 종속 전류원의 **핀 순서를 반대로**(전류 주입 방향 반전)",
      "  - 이득 k를 더 작게(예 0.5·1·2 수준)",
      "  - control(제어저항)을 전원 직후 직렬 저항으로 지정",
      base,
    ].join("\n");
  }
  if (/singular|풀이 실패/.test(lastErr)) {
    return [
      "★ 회로가 풀리지 않았다(singular). 전류원을 직렬 경로에 두지 말고 마디↔GND 병렬 가지로 옮기고,",
      "  모든 마디가 최소 2개 소자에 연결되며 전원 → 부하 단자 a까지 경로가 이어지는지 확인하라.",
      base,
    ].join("\n");
  }
  return base;
}

/** 종속원 값("3i_x"·"2i")에서 제어 변수 이름만 뽑아 화살표 라벨로 — 실패 시 "i_x". */
function controlVarLabel(value: string | number | undefined): string {
  const v = String(value ?? "").trim();
  const m = v.match(/([a-zA-Z]+(?:_\{?[a-zA-Z0-9]+\}?)?)\s*$/);
  return m ? m[1] : "i_x";
}

function splitValue(v: string | number | undefined): { numeric: number | null; unit: string } {
  if (v === undefined) return { numeric: null, unit: "" };
  if (typeof v === "number") return { numeric: v, unit: "" };
  const m = v.match(/^(-?\d+(?:\.\d+)?)\s*([kKmMμunp]?(?:Ω|ohm|V|A)?)/);
  return m ? { numeric: parseFloat(m[1]), unit: m[2] ?? "" } : { numeric: null, unit: "" };
}

const SYSTEM = `너는 전자 임용시험 회로이론(테브난 등가 + 최대전력 전달) 회로를 구조화하는 엔진이다.
업로드된 원본 회로의 분석을 받아, 같은 토폴로지의 회로를 netlist JSON으로 출력한다.

[절대 규칙]
- 원본 구조·원리 보존. 독립 전원(V/I), 저항, 그리고 ★종속전원(예 "2i_x")이 있으면 반드시 포함한다.
- ★ 종속전원은 절대 빠뜨리지 마라. CCVS(전류제어 전압원 "k·i_x")는 type:"CCVS", value:"2i_x",
  그리고 control 에 **i_x 전류가 흐르는 저항의 id**를 넣는다 (예 control:"Rv").
- 부하 단자 a-b를 명시(terminalA/terminalB). 부하 저항 R_L은 컴포넌트로 넣지 마라(단자만; 코드가 placeholder 처리).
- 가변 저항(학생이 그래프로 도출하는 R, 보통 i_x가 흐르는 저항)은 unknownComponentId로 지정하되,
  **구체적 숫자값**(nice 정수 Ω)을 넣는다 (코드가 그 값으로 V_th/R_th/I_sc/P_max를 계산).
  ★ 단, 아래 [가변 R] 지시가 "없음"이면 unknownComponentId를 넣지 말고 모든 저항에 구체값만 넣어라.
- exam_similar: 토폴로지 동일, 값만 새로. 모든 노드는 ≥2 연결(부하 단자 a 제외), 회로 폐합.
- ground는 "GND". 직렬 경로는 노드를 공유해 연결.

[출력 JSON] (이 키만, 코드펜스 금지)
{
  "components": [
    {"id":"V1","type":"V","value":"9V","pinNodes":["n1","GND"]},
    {"id":"R1","type":"R","value":"5Ω","pinNodes":["n1","n2"]},
    {"id":"E1","type":"CCVS","value":"2i_x","control":"Rv","pinNodes":["n2","n3"]},
    {"id":"R2","type":"R","value":"1Ω","pinNodes":["n3","n4"]},
    {"id":"Rv","type":"R","value":"4Ω","pinNodes":["n4","GND"]},
    {"id":"R3","type":"R","value":"2Ω","pinNodes":["n4","a"]}
  ],
  "ground":"GND","terminalA":"a","terminalB":"GND","unknownComponentId":"Rv"
}`;

export async function extractTheveninNetlist(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  seed?: number;
  maxAttempts?: number;
  /** 원본이 (나) V-I 그래프로 가변 R을 읽는 형식인가 — false면 가변 R을 만들지 않는다. */
  wantUnknownR?: boolean;
}): Promise<TheveninExtraction> {
  const { analysis } = args;
  const maxAttempts = args.maxAttempts ?? 7;
  const openai = getOpenAI();
  const inv = (analysis?.componentInventory ?? [])
    .map((c) => `  - ${c.id} (${c.type})${c.value ? ` = ${c.value}` : ""}${c.pins ? ` pins=[${c.pins.join(", ")}]` : ""}`)
    .join("\n");
  // ★ 종속원 존재 판정은 inventory만 믿으면 안 된다 — Vision이 실행에 따라 종속원을 통째로
  //   흘리는 경우가 있고(실측 3회 중 1회), 그러면 강제가 풀려 종속원 없는 회로가 생성돼
  //   전용 렌더러도 양보하고 원본과 완전히 다른 문제가 된다. **분석 텍스트도 함께** 본다.
  //   (애초에 이 파이프라인은 "종속원 + 테브난" 분류로만 선택되므로 종속원이 있는 게 전제다.)
  const analysisText = [
    analysis?.topic ?? "",
    analysis?.interpretation ?? "",
    (analysis?.relatedConcepts ?? []).join(" "),
    (analysis?.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
  const textHasDep = /종속\s*(전원|전류원|전압원)|dependent|제어\s*(전류|전압)원|i_?x/i.test(analysisText);
  const invHasDep = textHasDep || (analysis?.componentInventory ?? []).some((c) =>
    /i_?x|i_?[abc]|종속|2i|dependent/i.test(`${c.value ?? ""} ${c.type ?? ""}`));

  // ★ 원본 구조 강제용 통계 — 저항 개수와 **종속원의 종류**(전류원 vs 전압원).
  //   실측 신고: 원본은 저항 3개 + 종속 **전류원**(다이아몬드 2i)인데 생성물은 저항 4개 +
  //   종속 **전압원**(CCVS +/−)이 되어 그림이 원본과 딴판이었다.
  const invList = analysis?.componentInventory ?? [];
  const invRCount = invList.filter((c) => (c.type ?? "").toUpperCase() === "R").length;
  const depComp = invList.find((c) => isDependentComponent(c));
  // 인벤토리에 없으면 텍스트로 종류 추정 — "종속 전류원"이면 전류원.
  const depIsCurrent = depComp
    ? isDependentCurrentSource(depComp)
    : /종속\s*전류원|제어\s*전류원|전류\s*제어\s*전류원|cccs|vccs/i.test(analysisText);
  // ★ 모드별 종속원 종류:
  //   exam_similar = 원본 그대로(원본이 종속 전류원이면 전류원).
  //   exam_variant = **소자 종류 교환**(전류원↔전압원) — 사용자 지정: "지금 문제는 변형유형으로".
  //   (변형유형 정책: 소자 종류 1~2개 변경 허용.)
  const wantDepCurrent = args.mode === "exam_variant" ? !depIsCurrent : depIsCurrent;
  // 인벤토리에 종속원이 없어도 텍스트로 확인되면(invHasDep) 종류를 강제한다.
  const depTypeDirective = (depComp || invHasDep)
    ? (wantDepCurrent
        ? `\n★ 종속전원은 **전류원**(다이아몬드에 화살표)으로 넣어라 → type:"CCCS", value:"k·i_x", control=제어저항 id. CCVS(전압원) 금지.
  ★★ 전류원은 반드시 **병렬 가지**(마디 ↔ GND)로 배치하라. 직렬 경로(예: 상단 rail 중간)에 넣으면
     회로가 성립하지 않아(singular) 풀리지 않는다. 원본도 종속 전류원이 마디에서 접지로 내려가는 shunt다.
  ★★ control(제어전류 i_x)은 **직렬 경로의 저항**(예: 전원 다음 상단 저항)을 가리켜라 — 종속 전류원 자신이
     흐르는 가지를 제어저항으로 쓰지 마라.`
        : `\n★ 종속전원은 **전압원**(다이아몬드에 +/−)으로 넣어라 → type:"CCVS", value:"k·i_x", control=제어저항 id. CCCS(전류원) 금지.`)
      + (args.mode === "exam_variant"
          ? `\n  (기출변형유형이므로 원본의 ${depIsCurrent ? "전류원" : "전압원"}을 ${wantDepCurrent ? "전류원" : "전압원"}으로 교환한다.)`
          : `\n  (기출유사유형이므로 원본의 종속원 종류를 그대로 유지한다.)`)
    : "";
  const userPrompt = [
    `[모드] ${args.mode}`,
    `[원본 주제] ${analysis?.topic ?? ""}`,
    `[원본 해석] ${analysis?.interpretation ?? ""}`,
    `[원본 소자 인벤토리] (pins=노드 연결. 모든 소자 포함, 종속전원 절대 누락 금지)\n${inv || "  (없음)"}`,
    invHasDep ? `\n★ 원본에 종속전원(i_x 제어)이 있다 — 반드시 포함하고 control에 제어 저항 id를 지정하라.` : ``,
    depTypeDirective,
    invRCount > 0
      ? `\n[저항 개수] 원본과 동일하게 **정확히 ${invRCount}개**. 임의로 늘리거나 줄이지 마라(부하 R_L은 컴포넌트 아님).`
      : ``,
    args.wantUnknownR === false
      ? `\n[가변 R] 없음 — 원본에 "그래프로 읽는 가변 저항"이 없다. 모든 저항에 구체적 숫자값을 넣고 unknownComponentId는 출력하지 마라.`
      : `\n[가변 R] 있음 — 학생이 (나) 그래프로 도출하는 저항 하나를 unknownComponentId로 지정하라.`,
    ``,
    `위 회로와 같은 토폴로지의 테브난+최대전력 회로를 netlist JSON으로 출력하라.`,
  ].filter(Boolean).join("\n");

  let lastErr = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let raw: RawNetlist | null = null;
    try {
      const completion = await withRateLimitRetry(() =>
        openai.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: attempt === 0 ? userPrompt : `${userPrompt}\n\n[재시도 ${attempt}] 직전 실패: ${lastErr}\n${retryRemedy(lastErr)}` },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1800,
          temperature: attempt === 0 ? 0.4 : 0.7,
        }),
      );
      raw = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as RawNetlist;
    } catch (e) { lastErr = `JSON 실패: ${String(e)}`; continue; }

    const netlist = adapt(raw);
    const terminalA = raw.terminalA, terminalB = raw.terminalB || raw.ground;
    if (!terminalA) { lastErr = "terminalA 누락"; continue; }
    const hasDependent = netlist.components.some((c) => ["CCVS", "CCCS", "VCVS", "VCCS"].includes(c.type));
    if (invHasDep && !hasDependent) { lastErr = "종속전원 누락 — 원본에 i_x 종속원이 있으니 종속전원을 포함하라"; log.warn("dep_missing", { attempt }); continue; }

    // ★ 구조 일치 검사 — 프롬프트만으로는 지켜지지 않아 실제로 어긋난 그림이 나갔다(실측 신고).
    //   (a) 종속원 종류(전류원↔전압원)와 (b) 저항 개수를 원본과 맞춘다.
    if (depComp || invHasDep) {
      const depKindOk = wantDepCurrent
        ? netlist.components.some((c) => c.type === "CCCS" || c.type === "VCCS")
        : netlist.components.some((c) => c.type === "CCVS" || c.type === "VCVS");
      if (!depKindOk) {
        lastErr = wantDepCurrent
          ? "종속원 종류 불일치 — 원본은 종속 전류원이다. type을 CCCS로 하라(CCVS 금지)."
          : "종속원 종류 불일치 — 원본은 종속 전압원이다. type을 CCVS로 하라(CCCS 금지).";
        log.warn("dep_kind_mismatch", { attempt, depIsCurrent });
        continue;
      }
    }
    const netRCount = netlist.components.filter((c) => c.type === "R").length;
    if (invRCount > 0 && netRCount !== invRCount) {
      lastErr = `저항 개수 불일치 — 원본 ${invRCount}개인데 ${netRCount}개 생성. 정확히 ${invRCount}개로 맞춰라.`;
      log.warn("resistor_count_mismatch", { attempt, invRCount, netRCount });
      continue;
    }

    let sol: { Vth: number; Rth: number; Isc: number };
    let convWarnings: string[];
    try {
      const conv = netlistToSolverNetwork(netlist);
      convWarnings = conv.warnings;
      sol = solveTheveninViaSc({ net: conv.net, terminalA, terminalB });
    } catch (e) { lastErr = `풀이 실패: ${String(e)}`; log.warn("solve_failed", { attempt, lastErr }); continue; }

    if (!Number.isFinite(sol.Vth) || !Number.isFinite(sol.Rth) || sol.Rth <= 0 || Math.abs(sol.Vth) < 1e-6) {
      lastErr = `비정상 해 (V_th=${sol.Vth}, R_th=${sol.Rth}) — 회로 연결·종속원 제어 확인`; log.warn("bad_solution", { attempt, ...sol }); continue;
    }

    // 그래프 없는 원본이면 GPT가 unknownComponentId를 넣어도 무시 — 가변 R이 없는 형식이다.
    const unknownId = args.wantUnknownR !== false
      && raw.unknownComponentId
      && netlist.components.some((c) => c.id === raw.unknownComponentId)
      ? raw.unknownComponentId : undefined;
    const unknownComp = unknownId ? netlist.components.find((c) => c.id === unknownId) : undefined;
    const { numeric: unknownValue, unit: unknownUnit } = splitValue(unknownComp?.value);

    const Rth = round3(sol.Rth), Vth = round3(sol.Vth), Isc = round3(sol.Isc);
    const Pmax = round3((Vth * Vth) / (4 * Rth));
    log.info("thevenin_extract_ok", { attempt, Vth, Rth, Isc, Pmax, unknownId, unknownValue, hasDependent });
    return {
      netlist, terminalA, terminalB,
      Vth, Rth, Isc, RLopt: Rth, Pmax,
      unknownId, unknownValue: unknownValue ?? undefined, unknownUnit,
      hasDependent, warnings: convWarnings,
    };
  }
  throw new Error(`extractTheveninNetlist: ${maxAttempts}회 실패 — ${lastErr}`);
}

function round3(x: number): number { return Math.round(x * 1000) / 1000; }
