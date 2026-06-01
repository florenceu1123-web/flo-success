import { getOpenAI, DEFAULT_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";

const log = createLogger("lib/analysis/extractComponentInventory");

const ALLOWED_TYPES = new Set([
  "R", "V", "I", "C", "L", "SW",
  "VCVS", "VCCS", "CCVS", "CCCS", "D",
  "OPAMP", "BJT", "MOSFET",   // 능동 소자 — 전자회로 archetype dispatch에 필요
]);

export type ComponentInventoryItem = {
  id: string;
  type: string;
  value?: string;
  /**
   * (2026-05-31) Connectivity Detection — 각 component의 양 끝 노드 라벨.
   * 2-pin component: [node_a, node_b] (배열 길이 2).
   * 3+ pin component (OPAMP·BJT·MOSFET): pin role별 매핑은 future. v1은 2-pin만.
   */
  pins?: string[];
};

function buildPrompt(): string {
  return `[회로 소자 inventory + connectivity 추출 — 단일 작업]
첨부된 회로 이미지에서 보이는 실제 전기 회로 소자만 빠짐없이 추출하세요.
각 component의 ★ 양 끝이 연결된 노드 ★ 도 함께 추출 (Connectivity Detection).
R_L, V_ab 같은 annotation(부하·측정 표시)도 절대 포함하지 마라.

【출력 JSON】
{
  "components": [
    { "id": "R1", "type": "R", "value": "10Ω", "pins": ["n_a", "GND"] },
    { "id": "V1", "type": "V", "value": "5V",  "pins": ["n_a", "GND"] },
    { "id": "C1", "type": "C", "value": "1μF", "pins": ["n_b", "GND"] },
    { "id": "L1", "type": "L", "value": "j2Ω", "pins": ["n_a", "n_b"] }
  ]
}

【허용 type enum】 R, V, I, C, L, SW, VCVS, VCCS, CCVS, CCCS, D, OPAMP, BJT, MOSFET

【★ pins (Connectivity) — 절대 규칙 (2026-05-31 신규)】
2-pin component (R·V·I·C·L·SW·D·dep source)는 ★ pins: [node_a, node_b] ★ 두 노드 필수.
노드 라벨은 회로의 ★ 동일 전위 wire 영역 ★ 마다 고유한 id로 부여:
  - GND는 항상 ★ "GND" ★ 라벨 (회로의 ground rail 영역)
  - V source 양극 단자 → "n_a" (또는 의미 있는 이름 "n_vplus" 등)
  - 같은 wire(끊김 없는 연결)에 닿는 모든 pin은 ★ 같은 node 라벨 ★
  - wire가 컴포넌트로 끊기면 ★ 다른 node 라벨 ★

예시 — V·L·R·R 4분기 RL 회로 (V 좌측 vertical, L 상단 horizontal, R 두 개 우측 vertical):
  V: pins=["n_a", "GND"]      (V+ = n_a, V- = GND)
  L: pins=["n_a", "n_b"]      (좌측 n_a, 우측 n_b)
  R: pins=["n_b", "GND"]      (위 n_b, 아래 GND)
  R: pins=["n_b", "GND"]      (위 n_b, 아래 GND, 평행 가지)

★ 절대 금지 ★:
  ❌ pins 누락 — schema 어김
  ❌ 모든 component pins 동일 ["top", "GND"] (V·L 단락 → 평균전력 0W 회로 깨짐)
  ❌ GND 자리에 wire 통과한 다른 노드 id (단락 발생)
  ❌ 같은 wire인데 다른 node 라벨 (wire 끊김으로 잘못 인식)

★ 3+ pin component (OPAMP·BJT·MOSFET) ★ — 일단 v1에선 pins 누락 OK (별도 작업).

【★ AC source value 표기 — 절대 규칙】
※ OPAMP(연산증폭기, U1·U2 등 삼각형 심볼)·BJT(npn/pnp 트랜지스터, Q1)·MOSFET(M1)도 반드시 추출. 회로에 N개 보이면 N개 항목으로.

【규칙】
- 그림에 명시된 소자만 카운트. 추측 금지.
- 같은 type이 여러 개면(V1, V2; I1, I2 등) 모두 별도 항목으로 포함. 합치지 마라.
- R_L (학생이 채우는 부하 placeholder)는 포함 금지. 점선 박스로 표시된 부하는 소자가 아님.
- V_ab / I_x 같은 측정 표시도 포함 금지.
- ⓐ/ⓑ 같은 빈칸 게이트도 디지털 회로 소자가 아님 — 회로이론 inventory에선 무시.
- id는 그림 라벨 그대로, 없으면 type+sequence (R1, R2…).
- value는 단위 포함 (3kΩ, 5V, 2mA 등). 없으면 생략.

【★ AC source value 표기 — 절대 규칙】
원(○) 내부에 sine wave(∿)가 있거나 "v_i(t)" / "v_s(t)" / "v_in(t)" 라벨에 sin/cos/ωt 식이 보이면
이 V source는 ★ AC source ★. value를 ★ AC 식별 가능한 형식 ★ 으로 적어라:
  올바름 ✓: { "type":"V", "value":"v_i(t)=V_p·sin(ωt)" }
  올바름 ✓: { "type":"V", "value":"AC sin(ωt)" }
  올바름 ✓: { "type":"V", "value":"-V_p·sin(ωt) V" }
  잘못   ✗: { "type":"V", "value":"15V" } (DC 수치만 — classifier가 AC source 식별 못함)
  잘못   ✗: { "type":"V", "value":"V_p" } (식 표기 누락)
한 회로에 DC V_CC와 AC v_i(t)가 둘 다 있으면 별도 entry 두 개로 추출.

【★ OPAMP 갯수 — 절대 규칙 (2026-05-31 보강)】
임용 문제 이미지는 ★ (가)·(나) 두 그림이 같은 회로의 변형 ★ 인 경우가 많다. 같은 OPAMP를
두 그림에 각각 그렸어도 ★ 한 개의 OPAMP만 추출 ★ 하라. (가)·(나) 그림이 사실상 동일 회로면
componentInventory에 OPAMP 1개만.

★ 절대 금지 ★:
  ❌ (가)·(나) 두 그림에서 OPAMP 하나씩 추출해 OPAMP 2개로 보고하기.
  ❌ 한 OPAMP의 + 단자와 − 단자를 별도 OPAMP로 추출하기.

★ OPAMP 2개로 추출하는 정당한 케이스 (둘 다 충족 필요) ★:
  ✅ 같은 그림(예: 가) 안에 분명히 ★ 두 개의 삼각형 ★ — 첫 OPAMP 출력이 둘째 OPAMP 입력으로 직렬 연결 (cascade)
  ✅ 두 OPAMP 라벨이 명시적으로 다름 (U1·U2, A_1·A_2 등)

다른 component(R·C·L 등)도 (가)·(나) 두 그림에 같은 소자가 중복 표시되면 ★ 1번만 ★ 추출.

【★ 인덕터(L) 인식 — 절대 규칙 (2026-05-31 보강)】
다음 시각·라벨 단서 중 ★ 하나라도 ★ 있으면 무조건 type="L":
  · 코일(나선·여러 호) 심볼 — ⌒⌒⌒ 또는 둥근 호 3~4개 연속 패턴
  · 라벨에 "L_N" (L_1·L_2 등) 또는 단독 "L"
  · 라벨이 ★ 임피던스 j 표기 ★ — "j숫자Ω", "j(분수)Ω", "jXΩ", "jωL" 등 (예: j2Ω, j(2/3)Ω, j10Ω)
  · 라벨이 ★ 인덕턴스 H 단위 ★ — "0.5H", "2mH", "L=10μH" 등
value는 원본 라벨 그대로 (j(2/3)Ω → "j(2/3)Ω", 2H → "2H").

★ 절대 금지 (자주 일어나는 오인) ★:
  ❌ "j2Ω" 표기를 current source(I)로 추출 — j는 임피던스의 허수부 표기.
  ❌ "j(2/3)Ω" 표기를 V·I로 잘못 잡기 — 코일 심볼이 함께 있으면 무조건 L.
  ❌ 코일 심볼 옆 임피던스 라벨을 "AC source"로 오인 — 코일 = L.

current source(I)는 ★ 다음 단서가 모두 있을 때만 ★:
  · 원 안에 위쪽 화살표(↑) 또는 ⊕ 심볼
  · 라벨이 A 단위 (3A, 0.5A 등) 또는 "I_s" 같은 전류 라벨
  · j_Ω 표기 ★ 없음 ★

확인 절차: 회로 한 component를 inventory에 넣기 전, 그 옆 심볼이 ★ 코일(나선) ★인지 ★ 원+화살표 ★ 인지 다시 본다. 코일이면 L, 원+화살표면 I.

- JSON 객체 하나만 출력. 코드펜스 금지.`;
}

type RawShape = { components?: unknown };

function normalize(raw: unknown): ComponentInventoryItem[] | null {
  if (!raw || typeof raw !== "object") return null;
  const comps = (raw as RawShape).components;
  if (!Array.isArray(comps)) return null;

  const out: ComponentInventoryItem[] = [];
  const seenIds = new Set<string>();
  // unsupported(D/BJT 일부 등) 또는 잘못된 항목은 entire 폐기가 아니라 그 항목만 skip해서
  // GPT가 한 두 항목을 잘못 추출해도 나머지는 보존. id 중복도 자동 rename으로 회피.
  for (const c of comps) {
    if (!c || typeof c !== "object") continue;
    const o = c as Record<string, unknown>;
    if (typeof o.type !== "string") continue;
    const t = o.type.toUpperCase();
    if (!ALLOWED_TYPES.has(t)) continue;
    // id가 비어있거나 중복이면 type + sequence로 auto-rename
    let id = typeof o.id === "string" && o.id ? o.id : `${t}${out.length + 1}`;
    if (seenIds.has(id)) {
      let suffix = 2;
      while (seenIds.has(`${id}_${suffix}`)) suffix++;
      id = `${id}_${suffix}`;
    }
    seenIds.add(id);
    const item: ComponentInventoryItem = { id, type: t };
    if (typeof o.value === "string" && o.value.length > 0) item.value = o.value;
    // Connectivity Detection — pins 배열 (2-pin: [node_a, node_b]).
    if (Array.isArray(o.pins)) {
      const pinStrs = o.pins.filter((p): p is string => typeof p === "string" && p.length > 0);
      if (pinStrs.length >= 2) item.pins = pinStrs;
    }
    out.push(item);
  }
  // 한 항목도 없으면 schema 진짜 실패
  return out.length > 0 ? out : null;
}

export async function extractComponentInventory(args: { image: string }): Promise<ComponentInventoryItem[]> {
  const { image } = args;
  const openai = getOpenAI();
  const prompt = buildPrompt();

  log.info("start");

  // OpenAI Structured Outputs (json_schema strict): 모든 항목에 type·id·value 강제,
  // type은 enum 강제 → GPT가 누락·잘못된 type 출력 못 함. nullable value는 ["string","null"].
  const completion = await openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" } },
        { type: "text", text: prompt },
      ],
    }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ComponentInventory",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["components"],
          properties: {
            components: {
              type: "array",
              description: "회로 이미지에서 보이는 모든 전기 회로 소자 (R_L 부하 placeholder 제외)",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["id", "type", "value", "pins"],
                properties: {
                  id: {
                    type: "string",
                    description: "그림 라벨 그대로 (예: R1·V2·I_s). 없으면 type+sequence (R1·R2…).",
                  },
                  type: {
                    type: "string",
                    enum: [
                      "R", "V", "I", "C", "L", "SW",
                      "VCVS", "VCCS", "CCVS", "CCCS", "D",
                      "OPAMP", "BJT", "MOSFET",
                    ],
                  },
                  value: {
                    type: ["string", "null"],
                    description: "단위 포함된 값 (예: 3kΩ·5V·2mA·22μF). 그림에 명시되지 않으면 null.",
                  },
                  pins: {
                    anyOf: [
                      { type: "null" },
                      {
                        type: "array",
                        items: { type: "string" },
                        description:
                          "(2026-05-31 신규 Connectivity Detection) 각 component 양 끝 노드 라벨 [node_a, node_b]. " +
                          "GND는 항상 \"GND\". 같은 wire에 닿는 모든 pin은 같은 node 라벨. " +
                          "2-pin component(R·V·I·C·L·SW·D·dep source)는 반드시 길이 2. " +
                          "3+ pin component(OPAMP·BJT·MOSFET)는 일단 null 허용 (v2 작업).",
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    max_tokens: 800,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch (e) { throw new InventoryExtractionError("inventory JSON 파싱 실패", { cause: e }); }
  const inv = normalize(parsed);
  if (!inv) {
    log.error("schema_fail", { sample: JSON.stringify(parsed).slice(0, 300) });
    throw new InventoryExtractionError("inventory 스키마 불일치");
  }
  log.info("done", {
    count: inv.length,
    types: inv.map((c) => c.type),
    items: inv.map((c) => ({ id: c.id, type: c.type, value: c.value, pins: c.pins })),
    pinsCoverage: `${inv.filter((c) => c.pins && c.pins.length >= 2).length}/${inv.length}`,
  });
  return inv;
}

export function tallyTypeCounts(inventory: ComponentInventoryItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of inventory) {
    const t = c.type.toUpperCase();
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

export class InventoryExtractionError extends Error {
  constructor(message: string, opts?: ErrorOptions) {
    super(message, opts);
    this.name = "InventoryExtractionError";
  }
}
