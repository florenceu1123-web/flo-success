/**
 * 범용 OPAMP 회로 추출 — GPT가 업로드 분석을 받아 회로를 netlist 구조로 emit.
 *
 *  ★ 원칙 (CLAUDE.md): LLM은 구조 JSON만, 풀이·렌더는 결정론.
 *    - GPT: 업로드 회로의 토폴로지를 보존한 netlist(노드/OPAMP핀/R·V 엣지/값) emit.
 *           (exam_similar: 값만 변경 / exam_variant: 1~2 소자 변형)
 *    - 코드: netlistToSolverNetwork + solveMNA로 forward 풀이 → 모든 노드 전압 결정.
 *           "미지 저항 역산"형은 완성된 회로의 저항 하나를 unknown으로 지정하고
 *           그 출력전압을 학생에게 주는 방식으로 표현 (정답 R은 MNA로 검증된 실제 값).
 *
 *  하드코딩된 예시 archetype을 만들지 않는다 — 업로드한 구조를 그대로 재생성.
 */

import { getOpenAI, DEFAULT_MODEL, withRateLimitRetry } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { netlistToSolverNetwork } from "@/lib/solver/netlistToSolver";
import { solveMNA, type SolverResult } from "@/lib/solver/mna";
import { validateOpAmpCircuit } from "@/lib/renderers/opampCircuitRenderer";
import type {
  AnalysisResult, CircuitComponent, CircuitNetlist, CircuitComponentType,
  ComponentPin, GenerationMode, PinSide,
} from "@/types";

const log = createLogger("lib/generation/opampNetlist/extractOpampNetlist");

/** GPT가 emit하는 간소화 shape — 핀은 node id 배열만 (좌표·side는 코드가 채움). */
type RawComponent = {
  id: string;
  type: string;
  value?: string;
  /** OPAMP: [plusNode, minusNode, outNode]. 2-pin: [a, b] (V는 a=+). */
  pinNodes: string[];
};
type RawNetlist = {
  components: RawComponent[];
  ground: string;
  /** 학생이 값을 구할 미지 소자 (보통 저항). 없으면 출력전압을 구하는 문제. */
  unknownComponentId?: string;
  /** 문제에서 "주어지는" 출력 노드 (이 전압을 제시하고 미지 R을 역산). */
  outputNode?: string;
  /** 단자 라벨 (a/b 측정점). */
  terminals?: Array<{ node: string; label: string }>;
};

export type OpampNetlistExtraction = {
  /** 모든 값이 채워진 풀이용 netlist (MNA forward). */
  netlist: CircuitNetlist;
  /** MNA 해 — 모든 노드 전압. */
  mna: SolverResult;
  /** 미지 소자 id (있으면 역산형). */
  unknownId?: string;
  /** 미지 소자의 실제 값 (정답). */
  unknownValue?: number;
  /** 미지 소자 단위 ("kΩ" 등). */
  unknownUnit?: string;
  /** 출력 노드 + 그 전압. */
  outputNode?: string;
  outputVoltage?: number;
  warnings: string[];
};

const ALLOWED_TYPES = new Set<CircuitComponentType>(["R", "V", "I", "OPAMP", "VCVS", "VCCS", "WIRE"]);

const GND_SET = new Set(["GND", "gnd", "0", "ground", "Ground", "GROUND"]);

/**
 * MNA 특이행렬을 유발하는 구조 결함 노드 탐지 (GPT 재시도 피드백·진단용).
 *  규칙(이상 OPAMP DC):
 *   - non-ground 노드는 전압이 결정되려면: OPAMP 출력핀이거나, V원에 닿거나,
 *     저항/전류원이 ≥2개 닿아 경로를 이뤄야 한다.
 *   - OPAMP 입력핀(+/−)에만 닿고 R/V/I 경로가 없는 노드 = floating(고임피던스).
 *   - degree-1(저항 1개만) 노드 = dangling.
 */
function findStructuralDefects(netlist: CircuitNetlist): string[] {
  const ground = netlist.ground;
  const isGnd = (n: string) => n === ground || GND_SET.has(n);
  const opampOut = new Set<string>();
  const opampIn = new Set<string>();
  const rviDegree = new Map<string, number>();   // R/V/I/WIRE 닿는 수
  const allNodes = new Set<string>();

  for (const c of netlist.components) {
    if (c.type === "OPAMP") {
      const p = c.pins;
      if (p[0]) opampIn.add(p[0].node);
      if (p[1]) opampIn.add(p[1].node);
      if (p[2]) opampOut.add(p[2].node);
      for (const pin of p) if (pin.node) allNodes.add(pin.node);
    } else {
      for (const pin of c.pins) {
        if (!pin.node) continue;
        allNodes.add(pin.node);
        if (["R", "V", "I", "WIRE"].includes(c.type)) {
          rviDegree.set(pin.node, (rviDegree.get(pin.node) ?? 0) + 1);
        }
      }
    }
  }

  // 외부 단자(V_o=a 등)는 직렬 R 하나로만 연결돼도 정상(degree-1) — MNA가 결정.
  const terminals = new Set((netlist.nodeAnnotations ?? []).map((a) => a.node));
  const defects: string[] = [];
  for (const n of allNodes) {
    if (isGnd(n)) continue;
    if (opampOut.has(n)) continue;            // OPAMP 출력이 전압 고정
    if (terminals.has(n)) continue;           // 외부 단자는 degree-1 허용
    const deg = rviDegree.get(n) ?? 0;
    // 하드 결함은 floating OPAMP 입력핀(R/V/I 연결 0)만 — 가장 잦은 특이행렬 원인이고 명확한 피드백.
    //   그 외 degree-1 등은 MNA가 판정(직렬 R 통한 단자는 정상이므로 여기서 막지 않음 — 오탐 방지).
    if (deg === 0 && opampIn.has(n)) {
      defects.push(`노드 "${n}": OPAMP 입력핀이 floating (전원/저항 연결 필요 — 특히 차동단 +입력에 기준전원)`);
    }
  }
  return defects;
}

function defaultPins(type: string, nodes: string[], id: string): ComponentPin[] {
  // OPAMP: plus(left)/minus(left)/out(right). 2-pin: left/right.
  const sideFor = (i: number): PinSide => {
    if (type === "OPAMP") return i === 2 ? "right" : "left";
    return i === 0 ? "left" : "right";
  };
  return nodes.map((node, i) => ({ id: `${id}_p${i + 1}`, node, side: sideFor(i) }));
}

function adaptNetlist(raw: RawNetlist): CircuitNetlist {
  const components: CircuitComponent[] = [];
  for (const rc of raw.components) {
    const type = rc.type.toUpperCase() as CircuitComponentType;
    if (!ALLOWED_TYPES.has(type)) continue;
    const nodes = (rc.pinNodes ?? []).filter(Boolean);
    if (type === "OPAMP" ? nodes.length < 3 : nodes.length < 2) continue;
    components.push({
      id: rc.id,
      type,
      value: rc.value,
      pins: defaultPins(type, nodes, rc.id),
    });
  }
  return {
    components,
    ground: raw.ground,
    nodeAnnotations: (raw.terminals ?? []).map((t) => ({
      node: t.node, label: t.label, style: "terminal_dot" as const,
    })),
  };
}

const SYSTEM = `너는 전자 임용시험 OPAMP(연산증폭기) 회로를 구조화하는 엔진이다.
업로드된 원본 회로의 분석을 받아, 같은 토폴로지를 갖는 회로를 netlist JSON으로 출력한다.

[절대 규칙]
- 원본의 구조·원리를 보존한다. OPAMP 개수, 각 OPAMP의 입력/피드백/기준 연결 패턴,
  가산(여러 입력저항이 한 입력노드로)·차동·cascade 구조를 그대로 유지한다.
- ★ [소자 인벤토리]에 주어진 **모든 V 전원과 모든 R 저항을 빠짐없이** netlist에 넣는다.
  전원 개수·저항 개수를 줄이지 마라 (가장 흔한 실수: 가산 입력 전원들을 누락).
- 인벤토리 pins는 **참고용(노드 라벨이 noisy할 수 있음)**. 그대로 베끼지 말고, 깨끗한 토폴로지로
  재구성하되 **연결 관계만 보존**한다. 여러 입력저항이 한 노드로 모이면 그 노드 = OPAMP 반전입력
  (가산 junction), 각 입력저항의 반대쪽엔 전원. OPAMP마다 출력→반전입력 피드백 저항을 반드시 둔다.
- exam_similar: 토폴로지 동일, 저항·전원 값만 새로 (nice 정수 kΩ·V).
- exam_variant: 구조·원리 유지하되 소자 1~2개만 변형 가능.
- 모든 독립 전원은 반드시 명시적 V/I 컴포넌트 + 숫자값으로 넣는다 (라벨로만 두지 말 것).
- 모든 OPAMP는 닫힌 루프(출력→반전입력 피드백 저항)를 가져야 한다.
- 노드 이름은 자유(GND는 ground). OPAMP 핀 순서는 반드시 [비반전(+), 반전(−), 출력].

[★ floating 금지 — MNA 특이행렬 방지 (가장 흔한 실패)]
- ★★ 모든 OPAMP의 **비반전입력(+) 핀**은 절대 떠 있으면 안 된다 (가장 잦은 실패: "+ 핀이 OPAMP에만
  연결됨"). 각 + 입력은 반드시 셋 중 하나: (a) node="GND"(접지), (b) 기준 전압원 V가 직접 또는 저항을
  통해 연결, (c) 저항 분배망에 연결. **차동단(2단)의 + 입력에는 인벤토리의 기준 전압원(예 V4=3V)을
  반드시 연결**하라 — 빠뜨리면 + 핀이 floating돼 실패한다.
- 모든 non-ground 노드는 저항/전원이 최소 2개 닿거나, OPAMP 출력핀이거나, V원이 직접 물려 전압이 정해져야 한다.
- OPAMP 비반전입력을 접지할 거면 그 핀 node를 그냥 "GND"로 둔다 (떠 있는 새 노드 만들지 말 것).
- 한 OPAMP의 출력 노드는 반드시 그 OPAMP의 피드백 저항 + (다음 단 입력저항 또는 측정단자)에 연결한다.
- 입력 전원 노드(예 "A")는 [V원 한쪽] + [입력저항 한쪽] 두 개가 닿아야 한다 (전원만 달랑 두지 말 것).
- 인벤토리의 전원 개수만큼 V를 넣되, 각 V는 반드시 회로의 어딘가(입력저항 또는 OPAMP + 입력)에 연결한다.

[예시 — 2단 가산기+차동 (구조 참고; 값·노드명은 새로):]
  1단 반전가산기: Va(3V)·Vb(2V)·Vc(1V)가 각각 Ra·Rb·Rc(입력저항)로 노드 M1(U1 반전입력)에 모임,
    Rf1: M1↔O1(피드백), U1 비반전입력=GND, U1 출력=O1(=V_1).
  2단 차동: O1 → Rx(미지) → M2(U2 반전입력), Rf2: M2↔O2(피드백),
    V2(3V) → Rp → P2(U2 비반전입력), Rg: P2↔GND (분배), U2 출력=O2(=a, V_o).
    components 예: U1[P0... 실제론 GND, M1, O1], U2[P2, M2, O2], 각 R·V는 위 연결대로.

[미지수]
- 원본이 "특정 저항 R을 구하라"형이면 그 저항을 unknownComponentId로 지정하고,
  그 저항에도 반드시 실제 숫자값을 넣는다 (코드가 그 값으로 회로를 풀어 정답·제시 출력전압을 만든다).
  outputNode = 학생에게 주어지는 출력 전압의 노드.
- "출력 전압을 구하라"형이면 unknownComponentId 생략, outputNode만 지정.

[출력 JSON] (이 키만, 코드펜스 금지)
{
  "components": [
    {"id":"U1","type":"OPAMP","pinNodes":["P1","M1","O1"]},
    {"id":"R1","type":"R","value":"3kΩ","pinNodes":["A","M1"]},
    {"id":"Rf","type":"R","value":"2kΩ","pinNodes":["M1","O1"]},
    {"id":"Vs1","type":"V","value":"3V","pinNodes":["A","GND"]}
  ],
  "ground":"GND",
  "unknownComponentId":"R1",
  "outputNode":"O2",
  "terminals":[{"node":"O2","label":"a"}]
}`;

/** parseValue 없이 단순 숫자+단위 분리 (정답 표기용). */
function splitValue(v: string | number | undefined): { numeric: number | null; unit: string } {
  if (v === undefined) return { numeric: null, unit: "" };
  if (typeof v === "number") return { numeric: v, unit: "" };
  const m = v.match(/^(-?\d+(?:\.\d+)?)\s*([kKmMμunp]?(?:Ω|ohm|V|A|H|F)?)/);
  return m ? { numeric: parseFloat(m[1]), unit: m[2] ?? "" } : { numeric: null, unit: "" };
}

/**
 * GPT로 OPAMP netlist 추출 → 검증 → MNA 풀이. 실패 시 재시도(rejection).
 */
export async function extractOpampNetlist(args: {
  analysis?: AnalysisResult | null;
  mode: GenerationMode;
  seed?: number;
  maxAttempts?: number;
}): Promise<OpampNetlistExtraction> {
  const { analysis, mode } = args;
  const maxAttempts = args.maxAttempts ?? 7;
  const openai = getOpenAI();

  const inventory = analysis?.componentInventory ?? [];
  const invVCount = inventory.filter((c) => String(c.type).toUpperCase() === "V").length;
  const invRCount = inventory.filter((c) => String(c.type).toUpperCase() === "R").length;
  const inv = inventory
    .map((c) => `  - ${c.id} (${c.type})${c.value ? ` = ${c.value}` : ""}${c.pins ? ` pins=[${c.pins.join(", ")}]` : ""}`)
    .join("\n");
  const userPrompt = [
    `[모드] ${mode}`,
    `[원본 주제] ${analysis?.topic ?? ""}`,
    `[원본 해석] ${analysis?.interpretation ?? ""}`,
    `[원본 관련개념] ${(analysis?.relatedConcepts ?? []).join(", ")}`,
    `[원본 소자 인벤토리] (pins=노드 연결. 모든 V·R을 빠짐없이 포함하고, 같은 노드를 공유하는 저항들은 가산 입력)\n${inv || "  (없음)"}`,
    invVCount >= 2 ? `\n★ 반드시 독립 전원 ${invVCount}개를 모두 V 컴포넌트로 넣어라 (누락 금지).` : ``,
    ``,
    `위 원본 OPAMP 회로와 같은 토폴로지의 회로를 netlist JSON으로 출력하라.`,
  ].filter(Boolean).join("\n");

  const warnings: string[] = [];
  let lastErr = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let raw: RawNetlist | null = null;
    try {
      const completion = await withRateLimitRetry(() =>
        openai.chat.completions.create({
          model: DEFAULT_MODEL,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: attempt === 0 ? userPrompt : `${userPrompt}\n\n[재시도 ${attempt}] 직전 시도 실패 유형: ${lastErr}\n반드시 지켜라(노드 이름은 새로 지어도 됨):\n- 모든 노드는 최소 2개 소자에 연결 (dangling 금지). 특히 단 사이 결합저항 양끝·각 OPAMP 피드백저항 양끝이 실제 노드에 물려야 함.\n- 각 OPAMP는 [출력 노드]→[반전입력 노드] 피드백 저항 필수.\n- 모든 입력 전원 V 포함, 각 전원→입력저항→OPAMP 반전입력(가산노드).\n- 미지 저항에도 실제 kΩ 정수값.\n- 비반전입력 접지는 node="GND". 떠 있는 노드 만들지 마라.` },
          ],
          response_format: { type: "json_object" },
          max_tokens: 1800,
          temperature: attempt === 0 ? 0.4 : 0.7,
        }),
      );
      const text = completion.choices[0]?.message?.content ?? "";
      raw = JSON.parse(text) as RawNetlist;
    } catch (e) {
      lastErr = `JSON/응답 실패: ${String(e)}`;
      log.warn("extract_attempt_failed", { attempt, reason: lastErr });
      continue;
    }

    const netlist = adaptNetlist(raw);
    const opampCount = netlist.components.filter((c) => c.type === "OPAMP").length;
    if (opampCount === 0) { lastErr = "OPAMP 없음"; continue; }

    // ★ 인벤토리 보존 검증 — 전원·저항 개수가 원본보다 모자라면 구조 손실(가산 입력 누락 등) → 재시도.
    const netV = netlist.components.filter((c) => c.type === "V").length;
    const netR = netlist.components.filter((c) => c.type === "R").length;
    if (invVCount >= 2 && netV < invVCount) {
      lastErr = `전원 부족: 원본 인벤토리 ${invVCount}개인데 netlist에 ${netV}개만 — 모든 독립 전원(가산 입력 포함)을 빠짐없이 넣어라`;
      log.warn("extract_source_count_short", { attempt, invVCount, netV });
      continue;
    }
    if (invRCount >= 3 && netR < invRCount - 1) {
      lastErr = `저항 부족: 원본 ${invRCount}개인데 ${netR}개만 — 모든 저항을 넣어라(미지 R 포함)`;
      log.warn("extract_resistor_count_short", { attempt, invRCount, netR });
      continue;
    }

    const valErrors = validateOpAmpCircuit(netlist);
    if (valErrors.length > 0) { lastErr = `validate: ${valErrors.join("; ")}`; log.warn("extract_validate_failed", { attempt, valErrors }); continue; }

    const defects = findStructuralDefects(netlist);
    if (defects.length > 0) {
      lastErr = `구조 결함 — ${defects.join("; ")}`;
      log.warn("extract_structural_defect", { attempt, defects });
      continue;
    }

    let mna: SolverResult;
    let convWarnings: string[];
    try {
      const conv = netlistToSolverNetwork(netlist);
      convWarnings = conv.warnings;
      mna = solveMNA(conv.net);
    } catch (e) {
      lastErr = `MNA 실패: ${String(e)}`;
      log.warn("extract_mna_failed", { attempt, reason: lastErr });
      continue;
    }

    // 모든 노드 전압이 유한해야 함
    const allFinite = Object.values(mna.nodeVoltages).every((v) => Number.isFinite(v));
    if (!allFinite) { lastErr = "MNA 비유한 해"; continue; }

    // 미지 소자/출력 정리
    const unknownId = raw.unknownComponentId && netlist.components.some((c) => c.id === raw.unknownComponentId)
      ? raw.unknownComponentId : undefined;
    const unknownComp = unknownId ? netlist.components.find((c) => c.id === unknownId) : undefined;
    const { numeric: unknownValue, unit: unknownUnit } = splitValue(unknownComp?.value);
    // 미지 저항인데 숫자값이 없으면 MNA로 풀 수 없어 "출력 구하기"로 전락 → R 역산 유지 위해 재시도.
    if (unknownId && unknownValue === null && attempt < maxAttempts - 1) {
      lastErr = `미지 저항 ${unknownId}에 숫자값 없음 — 미지 R에도 실제 kΩ 정수값을 넣어라 (코드가 그 값으로 정답 R과 제시 출력전압을 만든다)`;
      log.warn("extract_unknown_no_value", { attempt, unknownId });
      continue;
    }
    const outputNode = raw.outputNode && mna.nodeVoltages[raw.outputNode] !== undefined
      ? raw.outputNode : undefined;
    const outputVoltage = outputNode ? round3(mna.nodeVoltages[outputNode]) : undefined;

    log.info("extract_ok", {
      attempt, opampCount, components: netlist.components.length,
      unknownId, unknownValue, outputNode, outputVoltage,
      convWarnings: convWarnings.length,
    });

    return {
      netlist, mna,
      unknownId, unknownValue: unknownValue ?? undefined, unknownUnit,
      outputNode, outputVoltage,
      warnings: [...warnings, ...convWarnings],
    };
  }

  throw new Error(`extractOpampNetlist: ${maxAttempts}회 시도 모두 실패 — ${lastErr}`);
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
