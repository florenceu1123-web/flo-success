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
};

function buildPrompt(): string {
  return `[회로 소자 inventory 추출 — 좁은 단일 작업]
첨부된 회로 이미지에서 보이는 실제 전기 회로 소자만 빠짐없이 추출하세요.
연결 정보는 추출하지 마라. R_L, V_ab 같은 annotation(부하·측정 표시)도 절대 포함하지 마라.

【출력 JSON】
{
  "components": [
    { "id": "R1", "type": "R", "value": "10Ω" },
    { "id": "V1", "type": "V", "value": "5V"  }
  ]
}

【허용 type enum】 R, V, I, C, L, SW, VCVS, VCCS, CCVS, CCCS, D, OPAMP, BJT, MOSFET
※ OPAMP(연산증폭기, U1·U2 등 삼각형 심볼)·BJT(npn/pnp 트랜지스터, Q1)·MOSFET(M1)도 반드시 추출. 회로에 N개 보이면 N개 항목으로.

【규칙】
- 그림에 명시된 소자만 카운트. 추측 금지.
- 같은 type이 여러 개면(V1, V2; I1, I2 등) 모두 별도 항목으로 포함. 합치지 마라.
- R_L (학생이 채우는 부하 placeholder)는 포함 금지. 점선 박스로 표시된 부하는 소자가 아님.
- V_ab / I_x 같은 측정 표시도 포함 금지.
- ⓐ/ⓑ 같은 빈칸 게이트도 디지털 회로 소자가 아님 — 회로이론 inventory에선 무시.
- id는 그림 라벨 그대로, 없으면 type+sequence (R1, R2…).
- value는 단위 포함 (3kΩ, 5V, 2mA 등). 없으면 생략.
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
                required: ["id", "type", "value"],
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
  log.info("done", { count: inv.length, types: inv.map((c) => c.type) });
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
