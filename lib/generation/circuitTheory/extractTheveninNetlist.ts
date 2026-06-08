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
  return {
    components,
    ground: raw.ground,
    nodeAnnotations: [
      { node: raw.terminalA, label: "a", style: "label_only" as const },
      ...(raw.terminalB && raw.terminalB !== raw.ground ? [{ node: raw.terminalB, label: "b", style: "label_only" as const }] : []),
    ],
    loadPlaceholders: [{ betweenNodes: [raw.terminalA, raw.terminalB], label: "R_L", emphasize: true }],
  };
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
}): Promise<TheveninExtraction> {
  const { analysis } = args;
  const maxAttempts = args.maxAttempts ?? 7;
  const openai = getOpenAI();
  const inv = (analysis?.componentInventory ?? [])
    .map((c) => `  - ${c.id} (${c.type})${c.value ? ` = ${c.value}` : ""}${c.pins ? ` pins=[${c.pins.join(", ")}]` : ""}`)
    .join("\n");
  const invHasDep = (analysis?.componentInventory ?? []).some((c) =>
    /i_?x|i_?[abc]|종속|2i|dependent/i.test(`${c.value ?? ""} ${c.type ?? ""}`));
  const userPrompt = [
    `[모드] ${args.mode}`,
    `[원본 주제] ${analysis?.topic ?? ""}`,
    `[원본 해석] ${analysis?.interpretation ?? ""}`,
    `[원본 소자 인벤토리] (pins=노드 연결. 모든 소자 포함, 종속전원 절대 누락 금지)\n${inv || "  (없음)"}`,
    invHasDep ? `\n★ 원본에 종속전원(i_x 제어)이 있다 — 반드시 CCVS로 포함하고 control에 제어 저항 id를 지정하라.` : ``,
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
            { role: "user", content: attempt === 0 ? userPrompt : `${userPrompt}\n\n[재시도 ${attempt}] 직전 실패: ${lastErr}\n반드시: 종속전원 CCVS 포함(control=제어저항 id), 단자 a-b 지정, 가변 R에 숫자값, 모든 노드 ≥2 연결, 회로 폐합.` },
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
    if (invHasDep && !hasDependent) { lastErr = "종속전원 누락 — 원본에 i_x 종속원이 있으니 CCVS 포함하라"; log.warn("dep_missing", { attempt }); continue; }

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

    const unknownId = raw.unknownComponentId && netlist.components.some((c) => c.id === raw.unknownComponentId)
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
