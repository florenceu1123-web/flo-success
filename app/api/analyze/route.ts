import { NextRequest, NextResponse } from "next/server";
import { analyzeImage, AnalyzeError } from "@/lib/analysis/analyzeImage";
import { extractComponentInventory, type ComponentInventoryItem } from "@/lib/analysis/extractComponentInventory";
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { compactAnalysis } from "@/lib/analysis/compactAnalysis";
import { createLogger } from "@/lib/logger";
import { SUBJECT_KEYS, type AnalysisResult, type SubjectKey, type TopologySignature } from "@/types";

const log = createLogger("api/analyze");

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { image?: string; subject?: string };
    const { image, subject } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json({ error: "image(base64)가 필요합니다." }, { status: 400 });
    }
    if (!subject || !SUBJECT_KEYS.includes(subject as SubjectKey)) {
      return NextResponse.json({ error: `subject는 ${SUBJECT_KEYS.join("/")} 중 하나여야 합니다.` }, { status: 400 });
    }

    // analyzeImage(전체) + extractComponentInventory(독립 vision 호출) 병렬 수행.
    // inventory가 잡은 type별 개수가 floor로 generate에 강제됨 — analyze branches가 일부 component 놓쳐도 보강.
    const [analysis, inventory] = await Promise.all([
      analyzeImage({ image, subject: subject as SubjectKey }),
      extractComponentInventory({ image }).catch((e) => {
        log.warn("inventory_extraction_failed", { message: (e as Error).message });
        return [] as Awaited<ReturnType<typeof extractComponentInventory>>;
      }),
    ]);

    const compact = compactAnalysis(analysis);
    const withInventory = inventory.length > 0
      ? { ...compact, componentInventory: inventory }
      : compact;

    // ★ Reconciliation — inventory와 topologySignature.branches가 불일치하면 branches 보강.
    //   GPT가 한 branch에 multi-component 직렬로 압축하거나 horizontal V·multiple sources를
    //   누락하는 케이스. inventory는 component 수가 정확하지만 branches는 압축됨.
    const reconciled = reconcileBranches(withInventory, inventory);

    // ★ Structural signature 엄격 검증 — count mismatch는 분석 실패로 reject.
    //   reconciliation이 betweenNodes 없이 누락 component를 추가하므로 위치가 부정확해
    //   잘못된 회로가 생성될 위험. 명확한 에러로 사용자에게 알리고 재분석 유도.
    const verdict = verifyInventoryConsistency(reconciled, inventory);
    if (!verdict.ok) {
      log.warn("inventory_consistency_failed", verdict);
      return NextResponse.json(
        {
          error:
            `분석 결과의 component 카운트가 일치하지 않습니다 (component 일부 누락 가능). ` +
            `Inventory: ${JSON.stringify(verdict.inventory)} / Branches: ${JSON.stringify(verdict.branches)}. ` +
            `이미지를 다시 업로드해 재분석을 시도해 주세요.`,
          inventoryMismatch: verdict,
        },
        { status: 502 },
      );
    }

    // circuit_type 분류 — 추가 GPT 호출 없이 derive
    const circuitType = classifyCircuitType(reconciled, subject as SubjectKey);
    log.info("circuit_type_classified", { type: circuitType.type, confidence: circuitType.confidence });

    return NextResponse.json({ ...reconciled, circuitType });
  } catch (e) {
    if (e instanceof AnalyzeError) {
      log.error("AnalyzeError", { message: e.message });
      return NextResponse.json({ error: `분석 실패: ${e.message}` }, { status: 502 });
    }
    log.error("처리 중 오류", { error: (e as Error).message });
    return NextResponse.json({ error: "분석 중 오류가 발생했습니다." }, { status: 500 });
  }
}

/**
 * Reconciliation — inventory의 component 개수와 branches의 component 개수를 비교.
 *   inventory가 더 풍부하면 (예: V·V·R·R·R·I·I·R = 8 vs branches 5) GPT가 branches를
 *   압축한 것. 누락된 type별 component를 branches에 자동 추가하여 결정론 generator가
 *   원본 구조를 재구성할 수 있게 한다.
 *
 *   추가 규칙 (휴리스틱):
 *    - V (extra): mesh_only_branch (horizontal V, top rail에 끼임)
 *    - R (extra): top_rail_resistor
 *    - I (extra): load_leg (vertical, top↔GND)
 *    - C/L (extra): load_leg
 *    - VCVS/VCCS/CCVS/CCCS (extra): dependent_source_leg
 *    - SW (extra): switching_leg
 */
function reconcileBranches(
  analysis: AnalysisResult,
  inventory: ComponentInventoryItem[],
): AnalysisResult {
  if (!analysis.topologySignature || inventory.length === 0) return analysis;
  const branches = analysis.topologySignature.branches ?? [];

  // 1) inventory와 branches 각각의 component type 카운트
  const invCount = new Map<string, number>();
  for (const item of inventory) {
    const t = item.type.toUpperCase();
    invCount.set(t, (invCount.get(t) ?? 0) + 1);
  }
  const branchCount = new Map<string, number>();
  for (const b of branches) {
    for (const c of b.components ?? []) {
      const t = c.type.toUpperCase();
      branchCount.set(t, (branchCount.get(t) ?? 0) + 1);
    }
  }

  // 2) 누락 type 계산
  const missing: Array<{ type: string; count: number }> = [];
  for (const [type, n] of invCount) {
    const have = branchCount.get(type) ?? 0;
    if (n > have) missing.push({ type, count: n - have });
  }
  if (missing.length === 0) return analysis;

  log.warn("inventory_branches_mismatch", {
    inventory: Object.fromEntries(invCount),
    branches: Object.fromEntries(branchCount),
    missing,
  });

  // 3) 누락 component를 적절한 role의 branch로 추가
  const extraBranches: TopologySignature["branches"] = [];
  for (const { type, count } of missing) {
    const role = inferRoleForType(type);
    for (let i = 0; i < count; i++) {
      extraBranches.push({ role, components: [{ type }] });
    }
  }

  // mesh_only_branch는 top_rail_resistor 사이에 삽입 (horizontal V가 마지막 GND alias node에
  // 박히지 않도록). 나머지는 끝에 append.
  const meshOnlyExtras = extraBranches.filter((b) => b.role === "mesh_only_branch");
  const otherExtras = extraBranches.filter((b) => b.role !== "mesh_only_branch");
  const insertedBranches = [...branches];
  if (meshOnlyExtras.length > 0) {
    // 첫 top_rail_resistor 다음에 삽입 (두 R 사이)
    const firstTopRailIdx = insertedBranches.findIndex((b) => b.role === "top_rail_resistor");
    const insertAt = firstTopRailIdx >= 0 ? firstTopRailIdx + 1 : insertedBranches.length;
    insertedBranches.splice(insertAt, 0, ...meshOnlyExtras);
  }
  insertedBranches.push(...otherExtras);

  let mergedBranches = insertedBranches;
  // ★ switching chain merge — switching_leg가 SW만 있고 별도 R·I가 떠 있으면 합쳐
  //   원본 supermesh 8번 패턴(SW + R + I 직렬 chain)을 정확히 재현. GPT가 chain을
  //   분리 추출한 케이스 자동 보정.
  const hasSwitch = Boolean(analysis.topologySignature.features?.hasSwitch);
  if (hasSwitch) {
    const swBranchIdx = mergedBranches.findIndex(
      (b) => b.role === "switching_leg" &&
        b.components.length === 1 && b.components[0].type.toUpperCase() === "SW",
    );
    if (swBranchIdx >= 0) {
      // SW 외 떠 있는 R·I 후보를 같은 chain에 끼우기
      const swBranch = mergedBranches[swBranchIdx];
      const danglingR = mergedBranches.findIndex(
        (b, i) => i !== swBranchIdx && b.role === "load_leg" &&
          b.components.length === 1 && b.components[0].type.toUpperCase() === "R",
      );
      const danglingI = mergedBranches.findIndex(
        (b, i) => i !== swBranchIdx && b.role === "current_source_leg" &&
          b.components.length === 1 && b.components[0].type.toUpperCase() === "I",
      );
      if (danglingR >= 0 || danglingI >= 0) {
        const rComp = danglingR >= 0 ? mergedBranches[danglingR].components[0] : null;
        const iComp = danglingI >= 0 ? mergedBranches[danglingI].components[0] : null;
        const newComps = [
          ...swBranch.components,
          ...(rComp ? [rComp] : []),
          ...(iComp ? [iComp] : []),
        ];
        const removeIdx = [danglingR, danglingI].filter((i) => i >= 0).sort((a, b) => b - a);
        for (const i of removeIdx) mergedBranches.splice(i, 1);
        const newSwIdx = mergedBranches.findIndex((b) => b === swBranch);
        if (newSwIdx >= 0) {
          mergedBranches[newSwIdx] = { ...swBranch, components: newComps };
        }
        log.info("switching_chain_merged", {
          added: newComps.length - swBranch.components.length,
          finalChainLength: newComps.length,
        });
      }
    }
  }

  const newTopology: TopologySignature = {
    ...analysis.topologySignature,
    branches: mergedBranches,
  };
  log.info("branches_reconciled", {
    original: branches.length,
    added: extraBranches.length,
    final: newTopology.branches.length,
  });
  return { ...analysis, topologySignature: newTopology };
}

/**
 * Inventory ↔ branches 일치 검증. 핵심 component type(R, V, I)이 inventory에서
 * 더 많이 카운트됐는데 branches에 부족하면 fail. reconciliation 이후에도
 * mismatch가 남아 있으면 분석 자체가 component를 놓친 것으로 판단.
 */
function verifyInventoryConsistency(
  analysis: AnalysisResult,
  inventory: ComponentInventoryItem[],
): { ok: boolean; inventory: Record<string, number>; branches: Record<string, number>; missing: Record<string, number> } {
  const invCount: Record<string, number> = {};
  for (const item of inventory) {
    const t = item.type.toUpperCase();
    invCount[t] = (invCount[t] ?? 0) + 1;
  }
  const brCount: Record<string, number> = {};
  for (const b of analysis.topologySignature?.branches ?? []) {
    for (const c of b.components ?? []) {
      const t = c.type.toUpperCase();
      brCount[t] = (brCount[t] ?? 0) + 1;
    }
  }
  const missing: Record<string, number> = {};
  const checkTypes = ["R", "V", "I", "C", "L", "SW"];
  for (const t of checkTypes) {
    const inv = invCount[t] ?? 0;
    const br = brCount[t] ?? 0;
    if (inv > br) missing[t] = inv - br;
  }
  return {
    ok: Object.keys(missing).length === 0,
    inventory: invCount,
    branches: brCount,
    missing,
  };
}

function inferRoleForType(type: string): string {
  switch (type.toUpperCase()) {
    case "V":     return "mesh_only_branch";   // horizontal V (top rail) — GPT가 vertical leg는 명시 추출하는데 horizontal V만 빠뜨리는 경우
    case "I":     return "load_leg";
    case "R":     return "top_rail_resistor";
    case "C":
    case "L":     return "load_leg";
    case "SW":    return "switching_leg";
    case "VCVS":
    case "VCCS":
    case "CCVS":
    case "CCCS":  return "dependent_source_leg";
    case "OPAMP": return "opamp_block";
    default:      return "mesh_only_branch";
  }
}
