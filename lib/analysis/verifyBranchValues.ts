import { getOpenAI, VISION_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import type { ComponentInventoryItem } from "@/lib/analysis/extractComponentInventory";

const log = createLogger("lib/analysis/verifyBranchValues");

/**
 * 가지(branch) 중심 값 확인 — "이 두 노드 사이 소자에 인쇄된 값은?"을 묻는 확인 패스.
 *
 * ★ 왜 필요한가 (실측 근거):
 *   노드 중심 연결 추출(extractNodeConnectivity)로 **그래프는 원본과 정확히 일치**하게 됐지만,
 *   값이 엉뚱한 가지에 붙는 오류가 남았다(임용 6번: A–GND에 a[Ω], B–M에 2Ω — 실제로는 반대).
 *   전체 회로를 한 번에 읽는 대신 **위치를 특정해** 물으면("A와 GND 사이 저항의 값은?")
 *   질문이 국소적이라 훨씬 정확하다.
 *
 * 값을 덮어쓰기 전에 **소자 값 다중집합이 보존되는지** 확인한다 — 원래 없던 값이 생기거나
 * 있던 값이 사라지면 잘못 읽은 것이므로 통째로 버린다.
 */

export type BranchSpec = { componentId: string; type: string; nodes: [string, string] };
export type BranchValue = { componentId: string; value: string };

function buildPrompt(branches: BranchSpec[]): string {
  const lines = branches.map(
    (b) => `  - ${b.componentId} (${b.type}): 노드 ${b.nodes[0]} 와 ${b.nodes[1]} 사이`,
  );
  return `[회로 소자 값 확인 — 위치를 특정해 읽기]
첨부된 회로 이미지에서 ★아래 위치에 있는 소자에 인쇄된 값★을 하나씩 읽으세요.
연결(어느 노드 사이인지)은 이미 확정돼 있습니다. ★값만★ 확인하면 됩니다.

【확인할 위치】
${lines.join("\n")}

【절대 규칙】
1. 그림에 인쇄된 값을 ★그대로★ 옮기세요. 계산하거나 바꾸지 마세요.
2. 값이 문자 기호면 문자 그대로 (예: "a", "2a", "3a"). ★숫자로 바꾸지 마세요★.
   계수를 반드시 유지하세요 — 2a를 a로, a를 2a로 쓰면 안 됩니다.
3. 값이 숫자면 단위까지 (예: "2Ω", "10kΩ", "5V").
4. 종속 전원이면 제어식 그대로 (예: "2i_x", "3v_c").
5. ★위치를 혼동하지 마세요★ — 각 위치의 소자를 그림에서 정확히 찾아 그 옆·위에 적힌 값을
   읽으세요. 다른 소자의 값을 가져오면 안 됩니다.
6. 값을 못 찾겠으면 빈 문자열 ""을 쓰세요. 추측하지 마세요.

【출력 JSON】
{ "values": [ { "componentId": "R1", "value": "2Ω" }, { "componentId": "R2", "value": "a[Ω]" } ] }`;
}

/** 값 비교용 정규화 — 단위·공백·대괄호를 걷어낸 핵심만 남긴다. */
function normValue(v: unknown): string {
  return String(v ?? "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[$\\{}\s]/g, "")
    .replace(/(Ω|ohm|Ohm|V|A|W)$/i, "")
    .toLowerCase();
}

/**
 * 가지별 값을 다시 읽어 inventory 값을 보정한다.
 * 값 다중집합이 달라지면(없던 값이 생기거나 사라지면) 통째로 버리고 기존 값을 유지한다.
 */
export async function verifyBranchValues(args: {
  image: string;
  inventory: ComponentInventoryItem[];
  model?: string;
}): Promise<{ inventory: ComponentInventoryItem[]; changed: number; problem: string | null }> {
  const { image, inventory, model } = args;
  const branches: BranchSpec[] = inventory
    .filter((c) => (c.pins ?? []).length === 2)
    .map((c) => ({ componentId: c.id, type: c.type, nodes: [c.pins![0], c.pins![1]] as [string, string] }));
  if (branches.length < 2) return { inventory, changed: 0, problem: "가지 정보 부족" };

  const openai = getOpenAI();
  log.info("start", { branches: branches.length });
  let values: BranchValue[];
  try {
    const completion = await openai.chat.completions.create({
      model: model ?? VISION_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" } },
          { type: "text", text: buildPrompt(branches) },
        ],
      }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "BranchValues",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["values"],
            properties: {
              values: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["componentId", "value"],
                  properties: {
                    componentId: { type: "string" },
                    value: { type: "string", description: "인쇄된 값 그대로. 못 읽으면 빈 문자열." },
                  },
                },
              },
            },
          },
        },
      },
    });
    const raw = completion.choices[0]?.message?.content;
    if (!raw) return { inventory, changed: 0, problem: "응답 없음" };
    const parsed = JSON.parse(raw) as { values?: BranchValue[] };
    values = Array.isArray(parsed.values) ? parsed.values : [];
  } catch (e) {
    log.warn("실패 — 기존 값 유지", { error: String(e) });
    return { inventory, changed: 0, problem: "호출 실패" };
  }

  const byId = new Map(values.filter((v) => v?.componentId && v.value).map((v) => [v.componentId, v.value]));
  if (byId.size === 0) return { inventory, changed: 0, problem: "읽은 값 없음" };

  const candidate = inventory.map((c) => {
    const nv = byId.get(c.id);
    return nv ? { ...c, value: nv } : c;
  });

  // ★ 값 다중집합 보존 검사 — 확인 대상(가지) 소자에 한해 값 구성이 같아야 한다.
  //   자리만 바뀌는 것은 허용(그게 목적), 값이 새로 생기거나 사라지면 잘못 읽은 것.
  const ids = new Set(branches.map((b) => b.componentId));
  const bag = (list: ComponentInventoryItem[]) =>
    list.filter((c) => ids.has(c.id)).map((c) => normValue(c.value)).sort().join("|");
  const before = bag(inventory);
  const after = bag(candidate);
  if (before !== after) {
    log.warn("value_multiset_changed — 보정 취소", { before, after });
    return { inventory, changed: 0, problem: `값 구성이 달라짐(${before} → ${after})` };
  }

  let changed = 0;
  for (let i = 0; i < inventory.length; i++) {
    if (normValue(inventory[i].value) !== normValue(candidate[i].value)) changed += 1;
  }
  log.info("done", { changed });
  return { inventory: candidate, changed, problem: null };
}
