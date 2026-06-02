import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_TYPES, type ComponentInventoryItem } from "@/lib/analysis/extractComponentInventory";
import { recoverTopologyV2 } from "@/lib/analysis/topologyRecovery";
import { deriveCircuitMeta } from "@/lib/analysis/deriveCircuitMeta";
import { createLogger } from "@/lib/logger";
import { SUBJECT_KEYS, type AnalysisResult, type SubjectKey, type TopologySignature } from "@/types";

const log = createLogger("api/recover-topology");

/**
 * 검수·편집 게이트 — 사용자가 편집한 component inventory로 topology·분류·검증을 재계산.
 *
 * GPT 호출 없음 (전부 결정론):
 *   편집된 inventory → recoverTopologyV2 (pins_graph_v3 → pattern → ladder)
 *                    → deriveCircuitMeta (circuitType·tags·canonical graph·validation)
 *                    → 업데이트된 analysis 반환
 *
 * UI 흐름: /api/analyze → InventoryReviewPanel에서 소자 편집 → 이 엔드포인트로 재계산
 *          → 반환된 analysis로 교체 → /api/generate
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      inventory?: unknown;
      analysis?: AnalysisResult | null;
      subject?: string;
    };
    const { inventory: rawInventory, analysis, subject } = body;

    if (!analysis || typeof analysis !== "object") {
      return NextResponse.json({ error: "analysis(기존 분석 결과)가 필요합니다." }, { status: 400 });
    }
    if (!subject || !SUBJECT_KEYS.includes(subject as SubjectKey)) {
      return NextResponse.json(
        { error: `subject는 ${SUBJECT_KEYS.join("/")} 중 하나여야 합니다.` },
        { status: 400 },
      );
    }
    const inventory = sanitizeInventory(rawInventory);
    if (inventory.length === 0) {
      return NextResponse.json(
        { error: "유효한 소자가 1개 이상 필요합니다. (type은 R/V/I/C/L/SW 등 허용 목록만)" },
        { status: 400 },
      );
    }

    log.info("recover_request", {
      count: inventory.length,
      types: inventory.map((c) => c.type),
      pinsCoverage: `${inventory.filter((c) => c.pins && c.pins.length >= 2).length}/${inventory.length}`,
    });

    // 1) 편집된 inventory로 topology 재복원 (pins_graph_v3 → pattern → ladder)
    const textHint = [
      analysis.topic ?? "",
      analysis.interpretation ?? "",
      (analysis.relatedConcepts ?? []).join(" "),
    ].join(" ");
    const recovered = recoverTopologyV2(inventory, textHint);

    // 2) topologySignature 갱신 — 기존 signature의 features·family는 유지, branches만 교체.
    //    기존 signature가 없으면 최소 stub 생성.
    const baseSignature: TopologySignature = analysis.topologySignature ?? {
      subjectKey: subject,
      family: "unknown",
      features: {
        hasSwitch: inventory.some((c) => c.type.toUpperCase() === "SW"),
        hasDependentSource: inventory.some((c) =>
          ["VCVS", "VCCS", "CCVS", "CCCS"].includes(c.type.toUpperCase())),
        hasGround: true,
        hasMesh: true,
        meshCount: 1,
      },
      branches: [],
    };

    const topologySignature: TopologySignature = {
      ...baseSignature,
      branches: recovered.branches,
    };

    log.info("topology_recovered", {
      version: recovered.strategy.includes("_v3") ? "v3" : recovered.strategy.includes("_v2") ? "v2" : "v1",
      strategy: recovered.strategy,
      confidence: recovered.confidence,
      branchCount: recovered.branches.length,
    });

    // 3) 결정론 메타 재계산 (circuitType·tags·canonical graph·validation)
    const updated: AnalysisResult = {
      ...analysis,
      componentInventory: inventory,
      topologySignature,
    };
    const meta = deriveCircuitMeta(updated, subject as SubjectKey);

    return NextResponse.json({
      ...updated,
      circuitType: meta.circuitType,
      learningObjective: meta.learningObjective,
      tags: meta.tags,
      motifs: meta.motifs,
      canonicalGraph: meta.canonicalGraph,
      graphValidation: meta.graphValidation,
      topologyRecovery: {
        strategy: recovered.strategy,
        confidence: recovered.confidence,
      },
    });
  } catch (e) {
    log.error("처리 중 오류", { error: (e as Error).message });
    return NextResponse.json({ error: "topology 재계산 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * 사용자 편집 inventory 정제 — 허용 type만, 빈 id 자동 부여, 중복 id rename, pins 정규화.
 *
 * @param raw 클라이언트가 보낸 inventory (신뢰 불가 입력)
 * @returns 정제된 ComponentInventoryItem 배열
 */
function sanitizeInventory(raw: unknown): ComponentInventoryItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ComponentInventoryItem[] = [];
  const seenIds = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.type !== "string") continue;
    const type = o.type.toUpperCase().trim();
    if (!ALLOWED_TYPES.has(type)) continue;

    let id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `${type}${out.length + 1}`;
    if (seenIds.has(id)) {
      let suffix = 2;
      while (seenIds.has(`${id}_${suffix}`)) suffix++;
      id = `${id}_${suffix}`;
    }
    seenIds.add(id);

    const entry: ComponentInventoryItem = { id, type };
    if (typeof o.value === "string" && o.value.trim()) entry.value = o.value.trim();
    if (Array.isArray(o.pins)) {
      const pins = o.pins
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
      if (pins.length >= 2) entry.pins = pins;
    }
    out.push(entry);
  }
  return out;
}
