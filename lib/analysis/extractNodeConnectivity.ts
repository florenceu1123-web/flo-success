import { getOpenAI, VISION_MODEL } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import type { ComponentInventoryItem } from "@/lib/analysis/extractComponentInventory";

const log = createLogger("lib/analysis/extractNodeConnectivity");

/**
 * 노드 중심 연결 추출 — "각 **노드**에 어떤 소자가 붙어 있나"를 묻는 별도 Vision 패스.
 *
 * ★ 왜 별도 패스인가 (실측 근거):
 *   componentInventory는 소자 중심으로 "R1의 pins는?"을 묻는다. 이 방식은 소자 목록은 잘
 *   맞히지만(실측 3/3) **연결이 자주 무너진다** — 임용 6번에서 6개 소자가 전부 A—B 한 줄로
 *   직렬 연결된 회로가 나왔다. 회로도에서 소자의 "양 끝이 어디로 가는지"는 선을 끝까지
 *   따라가야 알 수 있어 어렵지만, **접점(노드)에 무엇이 모이는지**는 굵은 점·선 교차로
 *   시각적으로 뚜렷해 훨씬 안정적이다.
 *
 * 이 결과로 inventory의 pins를 덮어쓰지 않고 **교차 검증·보정**에 쓴다(mergeNodeConnectivity).
 */

export type NodeConnectivity = {
  /** 노드 이름 (접지는 반드시 "GND") */
  id: string;
  /** 이 노드에 단자가 닿는 소자 id 목록 */
  components: string[];
};

function buildPrompt(componentIds: string[]): string {
  return `[회로 노드 연결 추출 — 단일 작업]
첨부된 회로 이미지에서 ★노드(접점)★를 기준으로 연결을 추출하세요.

【노드란】
서로 도선으로만 이어진 지점은 ★전부 같은 노드★입니다. 굵은 점(●)이 찍힌 접점, 선이 만나는
교차점, 그리고 그 사이를 잇는 도선 전체가 하나의 노드입니다. 소자(저항·전원 등)를 건너가면
★다른 노드★입니다.

【해야 할 일】
회로의 노드를 모두 찾고, 각 노드에 ★단자가 닿는 소자 id★를 나열하세요.
이미 추출된 소자 목록: ${componentIds.join(", ")}
★ 이 id만 사용하세요. 새 id를 만들지 마세요.

【절대 규칙】
1. 접지(GND)는 노드 이름을 반드시 "GND"로 하세요. 접지 기호(⏚)에 닿는 모든 소자를 넣으세요.
2. 그림에 A·B·n1 같은 노드 라벨이 인쇄돼 있으면 ★그 이름을 그대로★ 쓰세요.
   라벨이 없는 노드는 n1·n2… 로 붙이세요.
3. ★ 2단자 소자는 정확히 2개 노드에 나타나야 합니다 ★ — 한 소자가 1개 노드에만 있거나
   3개 이상에 있으면 잘못 읽은 것입니다. 제출 전에 각 소자가 몇 번 나오는지 세어 보세요.
4. 도선으로만 이어진 지점을 ★서로 다른 노드로 쪼개지 마세요★. 반대로, 소자를 사이에 두고
   있는 지점을 ★한 노드로 합치지 마세요★.
5. 모든 소자가 어느 노드엔가 2번씩 나타나야 합니다. 빠뜨리지 마세요.

【출력 JSON】
{
  "nodes": [
    { "id": "A",   "components": ["R1", "R2", "E1"] },
    { "id": "GND", "components": ["R1", "V1", "R4"] }
  ]
}`;
}

/** 노드 중심으로 연결을 추출한다. 실패 시 null (호출자는 기존 pins를 그대로 쓴다). */
export async function extractNodeConnectivity(args: {
  image: string;
  componentIds: string[];
  model?: string;
}): Promise<NodeConnectivity[] | null> {
  const { image, componentIds, model } = args;
  if (componentIds.length === 0) return null;
  const openai = getOpenAI();
  log.info("start", { model: model ?? VISION_MODEL, components: componentIds.length });

  try {
    const completion = await openai.chat.completions.create({
      model: model ?? VISION_MODEL,
      messages: [{
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" } },
          { type: "text", text: buildPrompt(componentIds) },
        ],
      }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "NodeConnectivity",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["nodes"],
            properties: {
              nodes: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["id", "components"],
                  properties: {
                    id: { type: "string", description: '노드 이름. 접지는 반드시 "GND".' },
                    components: {
                      type: "array",
                      items: { type: "string" },
                      description: "이 노드에 단자가 닿는 소자 id 목록",
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { nodes?: unknown };
    if (!Array.isArray(parsed.nodes)) return null;

    const known = new Set(componentIds);
    const nodes: NodeConnectivity[] = [];
    for (const n of parsed.nodes as Array<{ id?: unknown; components?: unknown }>) {
      if (typeof n?.id !== "string" || !n.id) continue;
      const comps = Array.isArray(n.components)
        ? n.components.filter((c): c is string => typeof c === "string" && known.has(c))
        : [];
      if (comps.length > 0) nodes.push({ id: n.id, components: comps });
    }
    log.info("done", { nodes: nodes.length, ids: nodes.map((n) => n.id).join(",") });
    return nodes.length > 0 ? nodes : null;
  } catch (e) {
    log.warn("실패 — 기존 pins 유지", { error: String(e) });
    return null;
  }
}

export type MergeResult = {
  /** pins가 보정된 inventory */
  inventory: ComponentInventoryItem[];
  /** 노드 결과로 pins를 확정한 소자 수 */
  repaired: number;
  /** 검증 실패 사유 (있으면 노드 결과를 신뢰하지 않는다) */
  problem: string | null;
};

/**
 * 노드 중심 결과로 inventory의 pins를 보정한다.
 *
 * 2단자 소자는 정확히 2개 노드에 나타나야 한다 — 이 조건을 만족하는 소자만 pins를 확정하고,
 * 전체적으로 조건을 어기는 소자가 많으면(절반 초과) 노드 결과 자체를 신뢰하지 않는다.
 * ★ 잘못된 연결로 덮어쓰면 기존보다 더 나빠지므로, 애매하면 손대지 않는다.
 */
export function mergeNodeConnectivity(
  inventory: ComponentInventoryItem[],
  nodes: NodeConnectivity[] | null,
): MergeResult {
  if (!nodes || nodes.length === 0) {
    return { inventory, repaired: 0, problem: "노드 결과 없음" };
  }
  // 소자 id → 그 소자가 나타난 노드 목록
  const appearsIn = new Map<string, string[]>();
  for (const n of nodes) {
    for (const c of n.components) {
      const list = appearsIn.get(c) ?? [];
      // 같은 노드가 중복으로 들어오면 한 번만 센다.
      if (!list.includes(n.id)) list.push(n.id);
      appearsIn.set(c, list);
    }
  }

  const twoPin = inventory.filter((c) => !["OPAMP", "BJT", "MOSFET", "GND"].includes(c.type));
  const bad = twoPin.filter((c) => (appearsIn.get(c.id) ?? []).length !== 2);
  if (twoPin.length > 0 && bad.length * 2 > twoPin.length) {
    return {
      inventory,
      repaired: 0,
      problem: `2단자 소자 ${twoPin.length}개 중 ${bad.length}개가 정확히 2개 노드에 나타나지 않음`,
    };
  }

  let repaired = 0;
  const out = inventory.map((c) => {
    const at = appearsIn.get(c.id) ?? [];
    if (at.length !== 2) return c;
    const before = (c.pins ?? []).join("|");
    if (before === at.join("|")) return c; // 이미 같으면 보정 아님
    repaired += 1;
    return { ...c, pins: at };
  });

  return {
    inventory: out,
    repaired,
    problem: bad.length > 0 ? `${bad.length}개 소자는 노드 결과가 불완전해 기존 pins 유지` : null,
  };
}
