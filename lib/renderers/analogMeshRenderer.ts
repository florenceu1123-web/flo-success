import type { CircuitComponent, CircuitNetlist } from "@/types";
import { createLogger } from "@/lib/logger";
import {
  componentHalfWidth,
  renderComponentOnEdge,
  renderNetlistEdgeSVG,
} from "./netlistEdgeRenderer";

const diagLog = createLogger("lib/renderers/analogMeshRenderer");
import { hasOpAmp, renderOpAmpCircuit, validateOpAmpCircuit } from "./opampCircuitRenderer";
import { hasWienBridgeOscillator, renderWienBridgeOscillatorCircuit } from "./wienBridgeOscillatorCircuit";
import { hasBjt, renderBjtCircuit } from "./bjtCircuitRenderer";
import { hasDiodePwl, renderDiodePwlCircuit } from "./diodePwlCircuitRenderer";
import { hasMosfet, renderMosfetBiasCircuit } from "./mosfetBiasCircuitRenderer";
import { hasMosfetCascode, renderMosfetCascodeMirrorCircuit } from "./mosfetCascodeMirrorCircuitRenderer";
import { hasSwitchedRlcStep, renderSwitchedRlcStepCircuit } from "./switchedRlcStepCircuitRenderer";
import { hasSwitchedRlc5leg, renderSwitchedRlc5legCircuit } from "./switchedRlc5legCircuitRenderer";
import { hasAcParallelBranches, renderAcParallelBranchesCircuit } from "./acParallelBranchesCircuitRenderer";
import { detectCrossPattern, renderCrossLayout } from "./crossLayoutCircuitRenderer";
import { detectFourNodeImyong, renderFourNodeImyong } from "./fourNodeImyongRenderer";
import { detectTheveninDependent, renderTheveninDependentCircuit } from "./theveninDependentCircuitRenderer";
import { detectTheveninDepVoltage, renderTheveninDepVoltageCircuit } from "./theveninDepVoltageCircuitRenderer";
import { detectSupernodeDepMaxPower, renderSupernodeDepMaxPower } from "./supernodeDepMaxPowerRenderer";
import { detectAcSuperpositionCircuit, renderAcSuperpositionCircuit } from "./acSuperpositionCircuitRenderer";
import { detectNortonOriginal, renderNortonOriginal, detectNortonEquivalent, renderNortonEquivalent } from "./nortonParamInverseRenderer";
import { detectZenerClipperCircuit, renderZenerClipperCircuit } from "./zenerClipperIntegratorRenderer";
import { detectAcDcSuperposition, renderAcDcSuperpositionCircuit } from "./acDcSuperpositionCircuitRenderer";
import { detectAcDcSuperpositionDual, renderAcDcSuperpositionDualCircuit } from "./acDcSuperpositionDualCircuitRenderer";
import { detectAcTheveninMaxPower, renderAcTheveninMaxPowerCircuit } from "./acTheveninMaxPowerCircuitRenderer";
import { detectAcTheveninOriginal, renderAcTheveninOriginalCircuit } from "./acTheveninOriginalCircuitRenderer";
import { detectSwitchedRlDependent, renderSwitchedRlDependentCircuit } from "./switchedRlDependentCircuitRenderer";
import { detectSwitchedRlDepI, renderSwitchedRlDepICircuit } from "./switchedRlDepICircuitRenderer";
import { detectSourceTransformCircuit, renderSourceTransformCircuit } from "./sourceTransformRatioCircuitRenderer";
import { detectOpampDifferenceAmpCircuit, renderOpampDifferenceAmpCircuit } from "./opampDifferenceAmpCircuitRenderer";

// =====================================================================
// analog mesh renderer — 2-rail layout
//
// 알고리즘:
//  1. Ground node와 top node 분류 (GND_LABELS / netlist.ground / GND component)
//  2. Top node를 가로로 spread (TOP_Y row)
//  3. 각 component (2-pin)를 horizontal(top↔top) / vertical(top↔ground)으로 분기
//  4. 같은 top node에 vertical이 여러 개면 가로 offset으로 슬롯 할당 (parallel)
//  5. Top rail wire — 인접 top node 사이에 horizontal component가 없을 때만 채움
//  6. Bottom rail wire — vertical component들의 x 범위에 그어줌
//  7. T-junction 위치에 dot
//  8. Ground 심볼은 bottom rail 가운데에 1개
//
// Fallback:
//  - ground도 없고 top node도 없는 회로 (예: 단순 series-loop) → 기존 edge renderer
//  - 3-pin 이상 component (BJT/MOSFET/OPAMP)가 있으면 → 기존 edge renderer
// =====================================================================

type Point = { x: number; y: number };

const GROUND_LABELS = new Set([
  "GND",
  "gnd",
  "Gnd",
  "0",
  "ground",
  "Ground",
]);
const TOP_Y = 80;
const BOT_Y = 420;
const LEFT_X = 100;
const X_PITCH = 140;            // component(R 56·OPAMP 64) + label 양옆 여유. 정사각형 비율 위해 축소.
const VERTICAL_PARALLEL_GAP = 160;  // 같은 top node에 R/V 두 개 등 parallel일 때 명확 분리. (110→160, 2026-05-31)

type HPlace = {
  component: CircuitComponent;
  node1: string;
  node2: string;
};

type VPlace = {
  component: CircuitComponent;
  topNode: string;
  groundNode: string;
  xSlot: number; // 0 = top node와 같은 x, >0 = 가로 offset (parallel)
};

export function renderAnalogMeshSVG(netlist: CircuitNetlist): string {
  // 진단 — client에서도 보이도록 console.log 사용 (diagLog는 server-only).
  if (typeof console !== "undefined") {
    console.log("[analogMeshRenderer] render_enter", {
      componentCount: netlist.components.length,
      componentTypes: netlist.components.map((c) => c.type),
      componentIds: netlist.components.map((c) => c.id),
      componentPins: netlist.components.map((c) => ({
        id: c.id,
        type: c.type,
        pins: c.pins?.map((p) => p.node),
      })),
    });
  }
  // 0. 사전 검증
  const errors = validateBasic(netlist);
  if (errors.length > 0) {
    return `<pre>${escapeSvg(errors.join("\n"))}</pre>`;
  }

  // 0.01 전원변환 + 전압비 (임용 7번) — archetype 태그 기반 전용 fixed-slot 렌더러.
  //   generic mesh/cross가 3-top-node + 우측 병렬쌍(R_a∥R_x)을 겹쳐 그리는 문제 회피.
  if (detectSourceTransformCircuit(netlist)) {
    const svg = renderSourceTransformCircuit(netlist);
    if (svg) return svg;
  }
  // 0.02 OPAMP 차동증폭기 (임용 9번) — 노턴 입력 + V+ 분배 구조 전용 fixed-slot 렌더러.
  if (detectOpampDifferenceAmpCircuit(netlist)) {
    const svg = renderOpampDifferenceAmpCircuit(netlist);
    if (svg) return svg;
  }

  // 0.03 제너 클리퍼 + 적분기 (임용 2번) — 전용 fixed-slot.
  //   ★ 아래 0.05 OPAMP 분기보다 **앞**이어야 한다. 뒤에 두면 그 분기가 먼저 가져가
  //     회로를 직렬로 펴고 제너를 하나만 그린다(실측 사용자 화면).
  if (detectZenerClipperCircuit(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=zenerClipperIntegrator");
    return renderZenerClipperCircuit(netlist);
  }

  // 0.05 OPAMP가 포함된 회로 — archetype-aware dispatch.
  //   Wien Bridge처럼 generic 6-카테고리 모델이 못 다루는 archetype은 전용 renderer로.
  //   ❌ renderOpAmpCircuit 확장으로 해결 / ✅ archetype별 별도 renderer 추가.
  if (hasOpAmp(netlist)) {
    if (hasWienBridgeOscillator(netlist)) {
      return renderWienBridgeOscillatorCircuit(netlist);
    }
    // ★ OPAMP 결선 검증 실패 시 graceful fallback (crossLayout 선례와 동일 원칙):
    //   예전엔 raw <pre> 에러 텍스트를 회로 자리에 그대로 노출했다(실측 신고:
    //   "OPAMP1: OPAMP feedback branch 누락"). 사용자에게 에러 문자열을 보이는 대신
    //   generic netlist 렌더러로 넘긴다. 결함 자체는 validateFigures의 opamp_wiring_invalid가
    //   문제 단위 검증 실패로 보고하므로 조용히 묻히지 않는다.
    const opampErrors = validateOpAmpCircuit(netlist);
    if (opampErrors.length > 0) {
      if (typeof console !== "undefined") {
        console.warn("[analogMeshRenderer] opamp_validation_failed", opampErrors);
      }
      // fall through → 아래 generic 경로가 그린다.
    } else {
      const svg = renderOpAmpCircuit(netlist);
      if (svg) return svg;
      // null → multi-OPAMP, 아래 generic fallback으로
    }
  }
  // 0.053 AC parallel branches (임용 5번) — V_s+R_top+L_1+I_S(horizontal)+L_2+R+C 전용 layout.
  if (hasAcParallelBranches(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=acParallelBranches");
    const svg = renderAcParallelBranchesCircuit(netlist);
    if (svg) return svg;
  }
  // 0.054 Switched RLC 5-leg (임용 9번 정확) — switched_rlc_step v1보다 우선 매치.
  //   R_top_L, R_top_R, L_a, L_b, R_4 모두 존재하는 6-leg 구조.
  if (hasSwitchedRlc5leg(netlist)) {
    const svg = renderSwitchedRlc5legCircuit(netlist);
    if (svg) return svg;
  }
  // 0.055 Switched RLC step response v1 (3-leg 단순화) — SPDT SW + RLC + dual source 전용 renderer.
  if (hasSwitchedRlcStep(netlist)) {
    const svg = renderSwitchedRlcStepCircuit(netlist);
    if (svg) return svg;
  }
  // 0.057 다이오드 + SPDT SW + C 클램프/정류 (임용 6번 형식) — BJT보다 먼저 매치.
  //   universal_ac_pwl path의 시각화. signature: D≥2 + SW≥1 + C≥1.
  if (hasDiodePwl(netlist)) {
    const svg = renderDiodePwlCircuit(netlist);
    if (svg) return svg;
  }
  // 0.06 BJT가 포함된 회로 (DC bias 회로 — 임용 7번 형식)는 전용 renderer로.
  if (hasBjt(netlist)) {
    const svg = renderBjtCircuit(netlist);
    if (svg) return svg;
  }
  // 0.07a MOSFET이 2개 이상 — cascode current mirror (임용 10번 정확 재현) 전용 renderer.
  if (hasMosfetCascode(netlist)) {
    const svg = renderMosfetCascodeMirrorCircuit(netlist);
    if (svg) return svg;
  }
  // 0.07b MOSFET 1개 — 단순 NMOS DC bias 전용 renderer.
  if (hasMosfet(netlist)) {
    const svg = renderMosfetBiasCircuit(netlist);
    if (svg) return svg;
  }

  // 0.073 AC 중첩 (임용 10번) — V·I 전원 + 마디 a에서 점선 가지로 내려가는 R+C, 단자 a·b.
  {
    const acs = detectAcSuperpositionCircuit(netlist);
    if (acs) {
      if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=acSuperposition");
      return renderAcSuperpositionCircuit(netlist, acs);
    }
  }
  // 0.074 테브난+최대전력+종속전원 (임용 7·9번류) — 전용 fixed-slot.
  //   generic mesh는 이 회로를 세로 가지들로 펼쳐 원본 사다리 구조·단자 a·b를 잃는다(실측 신고).
  // 0.071 노튼 등가 + 파라미터 역산 (임용 5번) — (가)·(나) 전용 fixed-slot.
  if (detectNortonOriginal(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=nortonOriginal");
    return renderNortonOriginal(netlist);
  }
  if (detectNortonEquivalent(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=nortonEquivalent");
    return renderNortonEquivalent(netlist);
  }
  // 0.072 슈퍼노드 + 종속 전압원 + 파라미터 최대전력 (임용 6번) — 전용 fixed-slot.
  //   generic·theveninDepVoltage가 가져가면 슈퍼노드 배치와 I_x·V_B 표기를 잃는다.
  if (detectSupernodeDepMaxPower(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=supernodeDepMaxPower");
    return renderSupernodeDepMaxPower(netlist);
  }
  // 0.073 종속 **전압원**(k·v_x) + 테브난 (임용 6번) — 전용 fixed-slot이 (가)·(나)를 모두 그린다.
  //   ★ 이 검사가 없으면 아래 theveninDependent(종속 전류원용)나 generic mesh가 가져가
  //     종속 전압원을 **저항 기호로** 그린다(2026-07-29 사용자 화면 실측).
  if (detectTheveninDepVoltage(netlist)) {
    const svg = renderTheveninDepVoltageCircuit(netlist);
    if (svg) {
      if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=theveninDepVoltage");
      return svg;
    }
  }
  {
    const dep = detectTheveninDependent(netlist);
    if (dep) {
      if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=theveninDependent");
      return renderTheveninDependentCircuit(netlist, dep);
    }
  }
  // 0.075 4-노드 imyong 10번 형식 — V·+단자(VS_PLUS) ≠ V1 케이스. universal_dc 핵심 형식.
  //   사용자 명시 layout 제약:
  //     VS_PLUS 좌상, V1 중상, V2 우상, GND 중하; V 소스는 좌측 leg vertical, 직접 VS_PLUS-GND 세로 금지.
  //   cross-layout 의 V·+↔GND wire-only short 버그를 회피하는 dedicated 경로.
  {
    const detected = detectFourNodeImyong(netlist);
    if (detected) {
      if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=fourNodeImyong");
      return renderFourNodeImyong(netlist, detected);
    }
  }

  // 0.078 AC+DC 중첩 (임용 2022 B-6 류) — 좌측 leg에 전원·스위치 직렬 chain.
  //   crossLayout(grid 빌더)이 4-소자 직렬 leg를 표현 못 해 V·+↔GND wire-only short를
  //   내는 버그를 우회하는 dedicated 경로. fourNodeImyong과 동일한 패턴.
  if (detectAcDcSuperposition(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=acDcSuperposition");
    const svg = renderAcDcSuperpositionCircuit(netlist);
    if (svg) return svg;
  }

  // 0.0784 스위치 RL + 종속전원(2i_A) 과도응답 (임용 7번).
  if (detectSwitchedRlDependent(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=switchedRlDependent");
    const svg = renderSwitchedRlDependentCircuit(netlist);
    if (svg) return svg;
  }

  // 0.07845 스위치 RL + 종속 전류원(k·iₙ) 과도응답 (임용 2024 전기 B-5).
  if (detectSwitchedRlDepI(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=switchedRlDepI");
    const svg = renderSwitchedRlDepICircuit(netlist);
    if (svg) return svg;
  }

  // 0.0784 2전원 테브난 최대전력 — **원본 토폴로지**(유사유형): I ∥ [V+R_s] → jX_L·R_top → a, −jX_C ∥ R_L.
  //   ★ 아래 0.0785(두 전원망 병렬, 변형유형)와 소자 id가 달라 서로 가로채지 않는다.
  if (detectAcTheveninOriginal(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=acTheveninOriginal");
    const svg = renderAcTheveninOriginalCircuit(netlist);
    if (svg) return svg;
  }

  // 0.0785 2전원 테브난 최대전력 (임용 10번) — V원망 + I원망 + R_L 부하.
  if (detectAcTheveninMaxPower(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=acTheveninMaxPower");
    const svg = renderAcTheveninMaxPowerCircuit(netlist);
    if (svg) return svg;
  }

  // 0.079 AC+DC 중첩 쌍대(dual) 회로 (기출변형유형) — 전류원·병렬 R·직렬 C·v 측정.
  if (detectAcDcSuperpositionDual(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=acDcSuperpositionDual");
    const svg = renderAcDcSuperpositionDualCircuit(netlist);
    if (svg) return svg;
  }

  // 0.08 Cross pattern (외곽 perimeter + 내부 십자 cross) — 임용 10번 같은 4-mesh DC.
  //   trigger: 내부 노드 간 평행 가지 + inner top node에 vertical leg.
  if (detectCrossPattern(netlist)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=crossLayout");
    const svg = renderCrossLayout(netlist);
    if (svg) return svg;
    // crossLayout 검증 실패(wire-short 등) → positions-respecting edge 렌더러로 fallback.
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] crossLayout 실패 → renderNetlistEdgeSVG fallback");
    return renderNetlistEdgeSVG(netlist);
  }

  // 0.1 3-pin 이상이면 mesh layout 적용 불가 — fallback
  if (netlist.components.some((c) => (c.pins?.length ?? 0) > 2)) {
    if (typeof console !== "undefined") console.log("[analogMeshRenderer] dispatch=edge_fallback_3pin");
    return renderNetlistEdgeSVG(netlist);
  }

  // 1. Ground / top 분류
  const { topNodes: allTopNodes, groundIds } = classifyNodes(netlist);

  // 1.1 ground도 없고 top도 비어있으면 의미 없음 — fallback
  if (groundIds.size === 0 || allTopNodes.length === 0) {
    return renderNetlistEdgeSVG(netlist);
  }

  // 1.5 Fork 병렬 펜던트 레그 — hub에 매달린 다중 직렬 pendant 레그를 병렬 vertical chain으로.
  //   (fork leg가 저항 몸통을 가로질러 "저항 중앙에 노드"처럼 보이는 문제 해결. 조건 안 맞으면 no-op.)
  const {
    legsByRoot: parallelLegsByRoot,
    consumed: consumedIds,
    internalNodes: chainInternalNodes,
  } = extractParallelPendantLegs(netlist, groundIds);
  // 체인 내부 mid 노드는 top rail node가 아님 (root는 유지).
  const topNodes = allTopNodes.filter((n) => !chainInternalNodes.has(n));

  // 2. Top node 좌표
  const topPos = new Map<string, Point>();
  topNodes.forEach((n, i) => {
    topPos.set(n, { x: LEFT_X + i * X_PITCH, y: TOP_Y });
  });

  // 3. Component 분류 → horizontal / vertical / vertical-chain
  const horizontals: HPlace[] = [];
  const verticalsByTopNode = new Map<string, CircuitComponent[]>();
  // ★ legRoot 마킹된 multi-component vertical chain (SW+R+I 직렬 등)
  const verticalChainsByRoot = new Map<string, CircuitComponent[]>();

  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    if (!c.pins || c.pins.length < 2) continue;
    // fork 병렬 펜던트 레그로 흡수된 component는 별도 렌더 (5.5c).
    if (consumedIds.has(c.id)) continue;

    // legRoot 있으면 그 root top node 아래 vertical chain
    if (c.legRoot && topNodes.includes(c.legRoot)) {
      if (!verticalChainsByRoot.has(c.legRoot)) verticalChainsByRoot.set(c.legRoot, []);
      verticalChainsByRoot.get(c.legRoot)!.push(c);
      continue;
    }

    const [p1, p2] = c.pins;
    const p1G = groundIds.has(p1.node);
    const p2G = groundIds.has(p2.node);
    if (p1G && p2G) continue; // ground↔ground는 무시

    if (!p1G && !p2G) {
      horizontals.push({
        component: c,
        node1: p1.node,
        node2: p2.node,
      });
    } else {
      const topNode = p1G ? p2.node : p1.node;
      if (!verticalsByTopNode.has(topNode)) {
        verticalsByTopNode.set(topNode, []);
      }
      verticalsByTopNode.get(topNode)!.push(c);
    }
  }

  // 3.5 ★ Top node 경로 정렬 (2026-06-03) — horizontal 인접 그래프의 경로 순서로 재배치.
  //   기존 등장순 배치는 horizontal이 비인접 슬롯을 가로질러 다른 component와 겹치고
  //   (전압원·코일 위치 오류), 연결 안 된 인접 노드 사이에 false rail wire가 그려졌다.
  //   경로 정렬 후에는 모든 horizontal이 인접 슬롯을 잇고 false wire가 사라진다.
  //
  //   x 좌표는 누적 배치 — 한 노드에 병렬 leg가 여러 개면(xSlot 분리, C ∥ R_L 등)
  //   다음 노드가 그 slot 영역을 침범하지 않도록 간격을 추가한다 (component 겹침 방지).
  const orderedTopNodes = orderTopNodesByAdjacency(topNodes, horizontals);
  topPos.clear();
  let cumulativeX = LEFT_X;
  for (const n of orderedTopNodes) {
    topPos.set(n, { x: cumulativeX, y: TOP_Y });
    // 이 노드에 매달린 병렬 slot 수 = 단일 vertical + fork 병렬 pendant 레그. 다음 노드가 침범 못하도록 예약.
    const slotCount =
      (verticalsByTopNode.get(n)?.length ?? 0) + (parallelLegsByRoot.get(n)?.length ?? 0);
    const extraSlots = Math.max(0, slotCount - 1);
    cumulativeX += X_PITCH + extraSlots * VERTICAL_PARALLEL_GAP;
  }

  // 4.0 fork 병렬 pendant 레그의 x 좌표 (root x 오른쪽으로 vertical 다음 slot부터 spread).
  const parallelLegPlacements: { root: string; chain: CircuitComponent[]; x: number }[] = [];
  for (const [root, chains] of parallelLegsByRoot) {
    const base = verticalsByTopNode.get(root)?.length ?? 0;
    const tx = topPos.get(root)?.x ?? 0;
    chains.forEach((chain, j) => {
      parallelLegPlacements.push({ root, chain, x: tx + (base + j) * VERTICAL_PARALLEL_GAP });
    });
  }
  const parallelLegXs = parallelLegPlacements.map((p) => p.x);

  // 4. Vertical 슬롯 할당 (같은 top node에 여러 vertical이 있으면 spread)
  const verticals: VPlace[] = [];
  for (const [topNode, comps] of verticalsByTopNode) {
    comps.forEach((c, i) => {
      const groundPin = c.pins.find((p) => groundIds.has(p.node));
      if (!groundPin) return;
      verticals.push({
        component: c,
        topNode,
        groundNode: groundPin.node,
        xSlot: i,
      });
    });
  }

  // 진단 — parallel R 시각 분리 issue 추적용 (client console)
  if (typeof console !== "undefined") {
    console.log("[analogMeshRenderer] vertical_classify", {
      totalComponents: netlist.components.length,
      topNodes,
      groundIds: [...groundIds],
      horizontalCount: horizontals.length,
      verticalsByTopNode: Object.fromEntries(
        [...verticalsByTopNode].map(([k, v]) => [k, v.map((c) => c.id)])
      ),
      verticalsExpanded: verticals.map((v) => `${v.component.id}@${v.topNode}#${v.xSlot}`),
    });
  }

  const verticalX = (v: VPlace): number => {
    const tx = topPos.get(v.topNode)?.x ?? 0;
    return tx + v.xSlot * VERTICAL_PARALLEL_GAP;
  };

  // ======================
  // 5. Render
  // ======================
  const parts: string[] = [];

  // 5.1 Top rail wires (인접 top node 사이에 horizontal component가 없을 때만).
  //   ★ horizontal로 연결 안 된(별개 sub-circuit) 두 top node 사이엔 false wire 금지 → groupOf 가드.
  const railGroupOf = computeHorizontalGroups(orderedTopNodes, horizontals);
  parts.push(renderTopRailWires(orderedTopNodes, topPos, horizontals, railGroupOf));

  // 5.2 Top stubs — offset된 vertical (xSlot>0)에 대해 top rail에서 vertical x까지 가로 stub
  for (const v of verticals) {
    if (v.xSlot === 0) continue;
    const tx = topPos.get(v.topNode)?.x;
    if (tx === undefined) continue;
    const vx = verticalX(v);
    parts.push(
      `<path d="M ${tx} ${TOP_Y} L ${vx} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`,
    );
  }

  // 5.3 Bottom rail wire — vertical + vertical-chain 모든 x 포함
  //   (chainXs는 5.5b에서 계산되지만 bottom rail은 그 전에 그려야 하므로 미리 계산)
  const preChainXs: number[] = [];
  for (const [rootNode, comps] of verticalChainsByRoot) {
    void comps;
    const existingSlots = verticalsByTopNode.get(rootNode)?.length ?? 0;
    const tx = topPos.get(rootNode)?.x ?? 0;
    preChainXs.push(tx + existingSlots * VERTICAL_PARALLEL_GAP);
  }
  const allVerticalXs = [...verticals.map(verticalX), ...preChainXs, ...parallelLegXs];
  if (allVerticalXs.length >= 2) {
    const xMin = Math.min(...allVerticalXs);
    const xMax = Math.max(...allVerticalXs);
    if (xMax > xMin) {
      parts.push(
        `<path d="M ${xMin} ${BOT_Y} L ${xMax} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`,
      );
    }
  }

  // 5.4 Horizontal components — bbox 수집.
  //   같은 node pair에 여러 horizontal branch가 있으면 (parallel) y로 stacking해서 겹침 방지.
  const obstacles: Bbox[] = [];
  // Group by sorted node pair
  const horizGroups = new Map<string, HPlace[]>();
  for (const h of horizontals) {
    const key = [h.node1, h.node2].sort().join("|");
    if (!horizGroups.has(key)) horizGroups.set(key, []);
    horizGroups.get(key)!.push(h);
  }
  for (const [, hs] of horizGroups) {
    if (hs.length === 1) {
      // 단일 — 기존 방식 (TOP_Y level 그대로)
      const h = hs[0];
      const a = topPos.get(h.node1);
      const b = topPos.get(h.node2);
      if (!a || !b) continue;
      parts.push(renderHorizontalComponent(h.component, a, b));
      obstacles.push(bboxHorizontal(h.component, a, b));
    } else {
      // parallel — top rail 바로 아래에 짧게 stack. stub이 vertical leg component를
      //   가로지르지 않도록 짧게 유지 (offset 50 정도). 시각적으로 "위 series + 아래 parallel" 분리.
      const TIGHT_OFFSET = 50; // top rail 바로 아래 — component 영역 밖
      hs.forEach((h, i) => {
        const a = topPos.get(h.node1);
        const b = topPos.get(h.node2);
        if (!a || !b) return;
        if (i === 0) {
          parts.push(renderHorizontalComponent(h.component, a, b));
          obstacles.push(bboxHorizontal(h.component, a, b));
        } else {
          // 짧은 offset — 시각 분리는 유지하되 stub이 component 가로지르지 않음
          const offsetY = TOP_Y + TIGHT_OFFSET * i;
          const aOffset: Point = { x: a.x, y: offsetY };
          const bOffset: Point = { x: b.x, y: offsetY };
          parts.push(`<path d="M ${a.x} ${TOP_Y} L ${a.x} ${offsetY}" stroke="black" fill="none" stroke-width="2"/>`);
          parts.push(`<path d="M ${b.x} ${TOP_Y} L ${b.x} ${offsetY}" stroke="black" fill="none" stroke-width="2"/>`);
          parts.push(renderHorizontalComponent(h.component, aOffset, bOffset));
          obstacles.push({ ...bboxHorizontal(h.component, aOffset, bOffset), y: offsetY - 36 });
        }
      });
    }
  }

  // 5.5 Vertical components — bbox 수집
  for (const v of verticals) {
    const x = verticalX(v);
    parts.push(renderVerticalComponent(v.component, x));
    obstacles.push(bboxVertical(v.component, x));
  }

  // 5.5b Vertical chains (legRoot 마킹된 SW+R+I 직렬 등) — root top node 아래 stack
  const chainXs: number[] = [];
  // chain 내 component 사이의 mid 노드 좌표를 저장 — overlay layer가 단자 dot/라벨에 사용.
  const chainMidPositions = new Map<string, Point>();
  for (const [rootNode, comps] of verticalChainsByRoot) {
    // 같은 root에 단일 vertical도 있으면 그 옆 slot, 없으면 root x 그대로
    const existingSlots = verticalsByTopNode.get(rootNode)?.length ?? 0;
    const tx = topPos.get(rootNode)?.x ?? 0;
    const cx = tx + existingSlots * VERTICAL_PARALLEL_GAP;
    chainXs.push(cx);
    // offset된 경우 top rail에서 chain x까지 stub
    if (cx !== tx) {
      parts.push(`<path d="M ${tx} ${TOP_Y} L ${cx} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`);
    }
    parts.push(renderVerticalChain(comps, cx));
    for (const c of comps) obstacles.push(bboxVertical(c, cx));
    // chain 내 mid 노드 좌표 추출 — renderVerticalChain과 동일 공식으로.
    // comps[i]의 top pin과 comps[i-1]의 bottom pin이 같은 노드 (mid 노드).
    const span = BOT_Y - TOP_Y;
    const slotH = span / comps.length;
    let prevBotY = TOP_Y;
    comps.forEach((c, i) => {
      const cy = TOP_Y + slotH * (i + 0.5);
      const half = componentHalfWidth(c);
      const topPinY = cy - half;
      if (i > 0) {
        // 이전 component bottom과 이 component top 사이의 wire 가운데가 mid 노드 시각 위치
        const midY = (prevBotY + topPinY) / 2;
        const topPinNode = c.pins?.[0]?.node;
        if (topPinNode && topPinNode !== netlist.ground && topPinNode !== rootNode) {
          chainMidPositions.set(topPinNode, { x: cx, y: midY });
        }
      }
      prevBotY = cy + half;
    });
  }

  // 5.5c Fork 병렬 pendant 레그 — hub 아래 병렬 vertical chain으로 렌더 (root→GND 순서).
  for (const pl of parallelLegPlacements) {
    const tx = topPos.get(pl.root)?.x ?? 0;
    if (pl.x !== tx) {
      parts.push(`<path d="M ${tx} ${TOP_Y} L ${pl.x} ${TOP_Y}" stroke="black" fill="none" stroke-width="2"/>`);
    }
    parts.push(renderVerticalChain(pl.chain, pl.x));
    for (const c of pl.chain) obstacles.push(bboxVertical(c, pl.x));
  }
  // root(hub)에서 2개 이상 pendant 레그가 나가면 그 root는 fan-out junction → dot.
  for (const [root, chains] of parallelLegsByRoot) {
    if (chains.length < 2) continue;
    const pos = topPos.get(root);
    if (pos) parts.push(`<circle cx="${pos.x}" cy="${pos.y}" r="3.5" fill="black"/>`);
  }

  // 5.6 Junction dots
  parts.push(renderJunctionDots(netlist, topPos, verticals, verticalX, consumedIds));

  // 5.7 Ground symbol — bottom rail 가운데 (vertical + chain + 병렬 pendant 레그 모두 포함)
  const groundXs = [...verticals.map(verticalX), ...chainXs, ...parallelLegXs];
  if (groundXs.length > 0) {
    const cx = (Math.min(...groundXs) + Math.max(...groundXs)) / 2;
    parts.push(renderGroundSymbol(cx, BOT_Y));
  }

  // ============ overlay layer (terminal/measurement/placeholder) ============
  // 회로 edge가 아니라 별도 layer. obstacles bbox 기반 collision avoidance.
  parts.push(renderOverlayLayer(netlist, topPos, verticals, verticalX, obstacles, chainMidPositions));

  // 6. viewBox
  const allXs: number[] = [
    ...Array.from(topPos.values()).map((p) => p.x),
    ...verticals.map(verticalX),
    ...chainXs,
    ...parallelLegXs,
  ];
  const xMin = Math.min(...allXs) - 80;
  const xMax = Math.max(...allXs) + 80;
  // annotation이 있으면 위쪽 추가 여백
  const hasAnnotations = Boolean(
    (netlist.nodeAnnotations?.length ?? 0) +
    (netlist.loadPlaceholders?.length ?? 0) +
    (netlist.measurementMarks?.length ?? 0),
  );
  const yMin = (hasAnnotations ? ANNO_BAND_Y - 32 : TOP_Y - 50);
  const yMax = BOT_Y + 60;
  const w = Math.max(xMax - xMin, 320);
  const h = Math.max(yMax - yMin, 240);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="${xMin} ${yMin} ${w} ${h}">${parts.join("\n")}</svg>`;
}

// =====================================================================
// Helpers
// =====================================================================

function validateBasic(netlist: CircuitNetlist): string[] {
  const errors: string[] = [];
  if (!netlist?.components?.length) {
    errors.push("analog_netlist: components 없음");
    return errors;
  }
  for (const c of netlist.components) {
    if (!c.pins?.length) {
      errors.push(`${c.id}: pins 누락`);
      continue;
    }
    if (c.type !== "GND" && c.pins.length < 2) {
      errors.push(`${c.id}: 2단자 이상 소자인데 pins 부족`);
    }
    for (const p of c.pins) {
      if (!p.id) errors.push(`${c.id}: pin id 누락`);
      if (!p.node) errors.push(`${c.id}.${p.id ?? "?"}: node 누락`);
    }
  }
  return errors;
}

function classifyNodes(netlist: CircuitNetlist): {
  topNodes: string[];
  groundIds: Set<string>;
} {
  const groundIds = new Set<string>();
  if (netlist.ground) groundIds.add(netlist.ground);
  for (const c of netlist.components) {
    if (c.type === "GND") {
      for (const p of c.pins ?? []) groundIds.add(p.node);
    }
    for (const p of c.pins ?? []) {
      if (GROUND_LABELS.has(p.node)) groundIds.add(p.node);
    }
  }

  const seen = new Set<string>();
  const topNodes: string[] = [];
  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    // ★ legRoot 마킹 component(vertical chain의 일부)의 pin node는 top rail node가 아님.
    //   chain 내부 mid 노드가 topNodes에 등록되면 top rail wire가 그쪽으로 삐져나옴.
    //   root top node는 어차피 다른 horizontal component가 등록하므로 안전.
    if (c.legRoot) continue;
    for (const p of c.pins ?? []) {
      if (groundIds.has(p.node)) continue;
      if (!seen.has(p.node)) {
        seen.add(p.node);
        topNodes.push(p.node);
      }
    }
  }
  return { topNodes, groundIds };
}

/**
 * Fork 병렬 펜던트 레그 추출 (2026-07-23).
 *
 *  문제: hub 노드(H, 비접지 degree≥3)에 ★직렬 pendant 레그가 2개 이상★ 매달리면
 *  (예: H→R_top2→n3→R_leg2→GND, H→R_top3→n4→R_leg3→GND), mesh 분류기는 R_top2·R_top3를
 *  horizontal로, R_leg2·R_leg3를 vertical로 쪼개서 두 R_top이 같은 rail(TOP_Y)에서 겹쳐 그려지고
 *  한쪽 R_top이 다른 leg 노드를 가로질러 "저항 몸통 중앙으로 leg가 빠지는" 것처럼 보인다.
 *
 *  해결: 그런 pendant 직렬 레그(중간 노드가 전부 degree 2, 끝이 GND, component ≥2)를 hub 아래
 *  ★병렬 vertical chain★으로 렌더한다. 각 chain은 root→…→GND 순서.
 *
 *  ⚠️ 활성 조건이 좁다(hub degree≥3 + 다중-component pendant 레그 ≥2개). 일반 직렬 rail·단일 tap·
 *  R∥R(단일 component leg)은 건드리지 않으므로 기존 회로에 영향 없음.
 *
 * @returns legsByRoot(root→chain[](root→GND 순서)), consumed(체인에 흡수된 component id),
 *          internalNodes(체인 내부 mid 노드 — top rail node에서 제외).
 */
function extractParallelPendantLegs(
  netlist: CircuitNetlist,
  groundIds: Set<string>,
): {
  legsByRoot: Map<string, CircuitComponent[][]>;
  consumed: Set<string>;
  internalNodes: Set<string>;
} {
  const legsByRoot = new Map<string, CircuitComponent[][]>();
  const consumed = new Set<string>();
  const internalNodes = new Set<string>();

  const twoPin = netlist.components.filter(
    (c) => c.type !== "GND" && (c.pins?.length ?? 0) >= 2,
  );
  const inc = new Map<string, CircuitComponent[]>();
  for (const c of twoPin) {
    for (const p of c.pins) {
      if (!inc.has(p.node)) inc.set(p.node, []);
      inc.get(p.node)!.push(c);
    }
  }
  const deg = (n: string): number => inc.get(n)?.length ?? 0;
  const other = (c: CircuitComponent, n: string): string =>
    c.pins[0].node === n ? c.pins[1].node : c.pins[0].node;

  for (const H of inc.keys()) {
    if (groundIds.has(H) || deg(H) < 3) continue;

    const pendantChains: { chain: CircuitComponent[]; internal: string[] }[] = [];
    for (const e of inc.get(H)!) {
      if (consumed.has(e.id)) continue;
      const chain: CircuitComponent[] = [e];
      const internal: string[] = [];
      let viaComp = e;
      let cur = other(e, H);
      let ok = false;
      while (true) {
        if (groundIds.has(cur)) {
          ok = true;
          break;
        }
        // 중간 노드는 반드시 degree 2 (통과) — 아니면 또다른 hub/dangling이라 pendant 아님.
        if (deg(cur) !== 2) break;
        internal.push(cur);
        const nextComp = inc.get(cur)!.find((c) => c !== viaComp);
        if (!nextComp) break;
        chain.push(nextComp);
        viaComp = nextComp;
        cur = other(nextComp, cur);
        if (chain.length > 12) break; // safety
      }
      // ★ component ≥2 인 직렬 pendant만 대상 (단일 component leg는 기존 vertical 경로가 이미 처리).
      if (ok && chain.length >= 2) pendantChains.push({ chain, internal });
    }

    if (pendantChains.length >= 2) {
      legsByRoot.set(H, pendantChains.map((p) => p.chain));
      for (const p of pendantChains) {
        for (const c of p.chain) consumed.add(c.id);
        for (const n of p.internal) internalNodes.add(n);
      }
    }
  }

  return { legsByRoot, consumed, internalNodes };
}

/**
 * Top node를 horizontal component 인접 그래프의 경로(path) 순서로 정렬 (2026-06-03).
 *
 *  목적: horizontal로 연결된 노드들이 항상 ★ 인접 슬롯 ★ 에 오도록 — 그래야 horizontal
 *  component가 다른 component 위를 가로지르지 않고, 연결 안 된 노드 사이에 false rail
 *  wire가 그려지지 않는다. (예: V[n_top,n_mid]·L[n_top,n_right]가 등장순 배치되면 L이
 *  V를 덮으며 그려져 "V와 L이 직렬"인 잘못된 회로로 보임)
 *
 *  방법: degree-1 끝점부터 경로 walk. 분기(degree≥3)가 있으면 기존 순서 유지 (fallback).
 *  horizontal에 연결 안 된 고립 노드는 기존 순서대로 뒤에 붙임.
 *
 * @param topNodes    기존 등장순 top node 목록
 * @param horizontals 분류된 horizontal component 목록
 * @returns 경로 순서로 정렬된 top node 목록
 */
function orderTopNodesByAdjacency(topNodes: string[], horizontals: HPlace[]): string[] {
  if (topNodes.length <= 2 || horizontals.length === 0) return topNodes;

  // horizontal 인접 그래프
  const adj = new Map<string, Set<string>>();
  for (const n of topNodes) adj.set(n, new Set());
  for (const h of horizontals) {
    if (!adj.has(h.node1) || !adj.has(h.node2)) continue;
    adj.get(h.node1)!.add(h.node2);
    adj.get(h.node2)!.add(h.node1);
  }

  // 분기 노드(degree≥3)가 있으면 단일 경로 배치 불가 — 기존 순서 유지
  for (const n of topNodes) {
    if ((adj.get(n)?.size ?? 0) >= 3) return topNodes;
  }

  const visited = new Set<string>();
  const ordered: string[] = [];

  // 연결 성분별로 끝점(degree 1)부터 walk. 끝점 선택은 기존 순서 빠른 쪽 (결정론).
  for (const start of topNodes) {
    if (visited.has(start)) continue;
    if ((adj.get(start)?.size ?? 0) === 0) continue; // 고립 노드는 마지막에

    // 이 연결 성분 수집 (DFS)
    const componentNodes: string[] = [];
    const stack = [start];
    const seen = new Set<string>([start]);
    while (stack.length > 0) {
      const cur = stack.pop()!;
      componentNodes.push(cur);
      for (const next of adj.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    const endpoints = componentNodes
      .filter((n) => adj.get(n)!.size === 1)
      .sort((a, b) => topNodes.indexOf(a) - topNodes.indexOf(b));
    const walkStart = endpoints[0] ?? start; // 사이클이면 임의 시작 (한 바퀴 walk)

    let prev: string | undefined;
    let cur: string | undefined = walkStart;
    while (cur !== undefined && !visited.has(cur)) {
      visited.add(cur);
      ordered.push(cur);
      const next: string | undefined = [...(adj.get(cur) ?? [])]
        .find((n) => n !== prev && !visited.has(n));
      prev = cur;
      cur = next;
    }
  }

  // 고립 노드 (horizontal 연결 없음) — 기존 순서대로 뒤에
  for (const n of topNodes) {
    if (!visited.has(n)) ordered.push(n);
  }

  return ordered;
}

/**
 * top node를 horizontal 연결성 기준 connected component(group)로 분할.
 *  같은 group만 top rail wire로 이어야 별개 sub-circuit(공통 GND만 공유) 사이 false wire를 막는다.
 */
function computeHorizontalGroups(
  topNodes: string[],
  horizontals: HPlace[],
): Map<string, number> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  for (const n of topNodes) parent.set(n, n);
  for (const h of horizontals) {
    if (!parent.has(h.node1) || !parent.has(h.node2)) continue;
    parent.set(find(h.node1), find(h.node2));
  }
  const groupOf = new Map<string, number>();
  const rootId = new Map<string, number>();
  let next = 0;
  for (const n of topNodes) {
    const r = find(n);
    if (!rootId.has(r)) rootId.set(r, next++);
    groupOf.set(n, rootId.get(r)!);
  }
  return groupOf;
}

function renderTopRailWires(
  topNodes: string[],
  topPos: Map<string, Point>,
  horizontals: HPlace[],
  groupOf?: Map<string, number>,
): string {
  let svg = "";
  for (let i = 0; i < topNodes.length - 1; i++) {
    const n1 = topNodes[i];
    const n2 = topNodes[i + 1];
    // 별개 sub-circuit(다른 group)이면 rail wire로 잇지 않는다.
    if (groupOf && groupOf.get(n1) !== groupOf.get(n2)) continue;
    const directly = horizontals.some(
      (h) =>
        (h.node1 === n1 && h.node2 === n2) ||
        (h.node1 === n2 && h.node2 === n1),
    );
    if (directly) continue;
    const a = topPos.get(n1);
    const b = topPos.get(n2);
    if (!a || !b) continue;
    svg += `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  return svg;
}

function renderHorizontalComponent(
  c: CircuitComponent,
  a: Point,
  b: Point,
): string {
  // ★ 좌→우 정규화 (2026-06-03) — node1이 node2보다 오른쪽에 배치된 경우(경로 정렬 후 발생 가능)
  //   에도 양쪽 연결 wire가 그려지도록. 정규화 없이는 두 wire 조건이 모두 false가 되어
  //   component가 rail에서 끊긴 것처럼 보임 (전압원 wire 끊김 버그).
  const [left, right] = a.x <= b.x ? [a, b] : [b, a];
  const cx = (left.x + right.x) / 2;
  const cy = left.y;
  const half = componentHalfWidth(c);
  let svg = "";
  if (cx - half > left.x) {
    svg += `<path d="M ${left.x} ${left.y} L ${cx - half} ${cy}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  svg += renderComponentOnEdge(c, { x: cx, y: cy }, "horizontal");
  if (right.x > cx + half) {
    svg += `<path d="M ${cx + half} ${cy} L ${right.x} ${right.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  return svg;
}

function renderVerticalComponent(c: CircuitComponent, x: number): string {
  const cy = (TOP_Y + BOT_Y) / 2;
  const half = componentHalfWidth(c);
  let svg = "";
  svg += `<path d="M ${x} ${TOP_Y} L ${x} ${cy - half}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += renderComponentOnEdge(c, { x, y: cy }, "vertical");
  svg += `<path d="M ${x} ${cy + half} L ${x} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  return svg;
}

/**
 * Vertical chain — SW+R+I 직렬 등 multi-component leg를 root top node 아래
 * TOP_Y → comp1 → comp2 → ... → BOT_Y(GND)로 순서대로 stack.
 */
function renderVerticalChain(comps: CircuitComponent[], x: number): string {
  if (comps.length === 0) return "";
  const span = BOT_Y - TOP_Y;
  const slotH = span / comps.length;
  let svg = "";
  let prevY = TOP_Y;
  comps.forEach((c, i) => {
    const cy = TOP_Y + slotH * (i + 0.5);
    const half = componentHalfWidth(c);
    svg += `<path d="M ${x} ${prevY} L ${x} ${cy - half}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderComponentOnEdge(c, { x, y: cy }, "vertical");
    prevY = cy + half;
  });
  svg += `<path d="M ${x} ${prevY} L ${x} ${BOT_Y}" stroke="black" fill="none" stroke-width="2"/>`;
  return svg;
}

function renderJunctionDots(
  netlist: CircuitNetlist,
  topPos: Map<string, Point>,
  verticals: VPlace[],
  verticalX: (v: VPlace) => number,
  consumedIds?: Set<string>,
): string {
  let svg = "";

  // Top node dots: degree ≥ 3 (rail 두 방향 + leg)
  const degree = new Map<string, number>();
  for (const c of netlist.components) {
    if (c.type === "GND") continue;
    // fork 병렬 pendant 레그로 흡수된 component는 5.5c에서 fan-out dot을 직접 그림 → 중복 방지.
    if (consumedIds?.has(c.id)) continue;
    for (const p of c.pins ?? []) {
      if (topPos.has(p.node)) {
        degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
      }
    }
  }
  for (const [node, d] of degree) {
    if (d < 3) continue;
    const pos = topPos.get(node);
    if (pos) svg += `<circle cx="${pos.x}" cy="${pos.y}" r="3.5" fill="black"/>`;
  }

  // Bottom rail T-junction dots: vertical x가 min/max 사이에 있을 때
  if (verticals.length >= 3) {
    const xs = verticals.map(verticalX);
    const xMin = Math.min(...xs);
    const xMax = Math.max(...xs);
    for (const x of xs) {
      if (x > xMin && x < xMax) {
        svg += `<circle cx="${x}" cy="${BOT_Y}" r="3.5" fill="black"/>`;
      }
    }
  }

  // Top stub T-junction dots: offset vertical이 있는 top node는 leg + rail이 만나므로 dot 필요
  // (이미 degree≥3에 포함되지만, 같은 top node에 vertical 2개+horizontal 0개일 때는 degree=2라 누락)
  // 따라서 같은 top node에 vertical이 2개 이상이면 dot 추가
  const verticalCountByTop = new Map<string, number>();
  for (const v of verticals) {
    verticalCountByTop.set(
      v.topNode,
      (verticalCountByTop.get(v.topNode) ?? 0) + 1,
    );
  }
  for (const [node, count] of verticalCountByTop) {
    if (count >= 2 && (degree.get(node) ?? 0) < 3) {
      const pos = topPos.get(node);
      if (pos) svg += `<circle cx="${pos.x}" cy="${pos.y}" r="3.5" fill="black"/>`;
    }
  }

  return svg;
}

// =====================================================================
// Overlay layer — terminal/measurement/placeholder 라우팅
// 회로 edge가 아닌 별도 layer로 처리. obstacle bbox 기반 collision avoidance.
// =====================================================================

type Bbox = { x: number; y: number; w: number; h: number; type: string };

/** horizontal component bbox 추정 (component_half + label margin 포함). a·b 좌우 순서 무관. */
function bboxHorizontal(c: CircuitComponent, a: Point, b: Point): Bbox {
  const cx = (a.x + b.x) / 2;
  const cy = Math.min(a.y, b.y);
  const half = componentHalfWidth(c);
  return { x: cx - half - 4, y: cy - 36, w: 2 * half + 8, h: 72, type: c.type };
}

/** vertical component bbox 추정 */
function bboxVertical(c: CircuitComponent, x: number): Bbox {
  const cy = (TOP_Y + BOT_Y) / 2;
  const half = componentHalfWidth(c);
  return { x: x - 28, y: cy - half - 4, w: 56, h: 2 * half + 8, type: c.type };
}

/** point가 bbox 안에 있나 */
function pointInBbox(px: number, py: number, b: Bbox): boolean {
  return px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
}

/** 직선 segment가 bbox와 교차하나 (단순 sweep 검사) */
function segmentIntersectsBbox(x1: number, y1: number, x2: number, y2: number, b: Bbox): boolean {
  // 둘 중 하나가 안에 있으면 교차
  if (pointInBbox(x1, y1, b) || pointInBbox(x2, y2, b)) return true;
  // bbox 4 변과 교차 검사
  return (
    segIntersectsSeg(x1, y1, x2, y2, b.x, b.y, b.x + b.w, b.y) ||
    segIntersectsSeg(x1, y1, x2, y2, b.x + b.w, b.y, b.x + b.w, b.y + b.h) ||
    segIntersectsSeg(x1, y1, x2, y2, b.x + b.w, b.y + b.h, b.x, b.y + b.h) ||
    segIntersectsSeg(x1, y1, x2, y2, b.x, b.y + b.h, b.x, b.y)
  );
}

function segIntersectsSeg(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): boolean {
  const d1 = (bx2 - bx1) * (ay1 - by1) - (by2 - by1) * (ax1 - bx1);
  const d2 = (bx2 - bx1) * (ay2 - by1) - (by2 - by1) * (ax2 - bx1);
  const d3 = (ax2 - ax1) * (by1 - ay1) - (ay2 - ay1) * (bx1 - ax1);
  const d4 = (ax2 - ax1) * (by2 - ay1) - (ay2 - ay1) * (bx2 - ax1);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * 회로 edge 위 라벨 위치를 bbox 충돌 회피해 결정.
 * 후보 위치들 시도, 안 충돌하는 첫 좌표 반환.
 */
function findFreeLabelPos(baseX: number, baseY: number, obstacles: Bbox[]): Point {
  const candidates: Point[] = [
    { x: baseX, y: baseY },
    { x: baseX, y: baseY - 10 },
    { x: baseX, y: baseY - 20 },
    { x: baseX + 10, y: baseY },
    { x: baseX - 10, y: baseY },
  ];
  for (const c of candidates) {
    if (!obstacles.some((o) => pointInBbox(c.x, c.y, o))) return c;
  }
  return candidates[0];
}

const ANNO_BAND_Y = TOP_Y - 56;  // 회로 위쪽 overlay band

/**
 * Overlay layer entry — 모든 overlay item을 obstacle 회피하며 렌더.
 *  - terminals (a/b nodeAnnotations + dot)
 *  - load placeholders (R_L 박스, 점선 wire)
 *  - measurement marks (V_ab probe, +/- 표시)
 */
function renderOverlayLayer(
  netlist: CircuitNetlist,
  topPos: Map<string, Point>,
  verticals: VPlace[],
  verticalX: (v: VPlace) => number,
  obstacles: Bbox[],
  chainMidPositions?: Map<string, Point>,
): string {
  let svg = "";

  // 모든 알려진 node의 좌표 수집 (top + ground + chain mid)
  const nodePositions = new Map<string, Point>();
  for (const [n, p] of topPos) nodePositions.set(n, p);
  if (netlist.ground) {
    if (verticals.length > 0) {
      const xs = verticals.map(verticalX);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      nodePositions.set(netlist.ground, { x: cx, y: BOT_Y });
    }
  }
  // chain 내 mid 노드(예: R3+C1 직렬 사이의 단자 b)도 등록 — terminal_dot/라벨이 그려지도록.
  if (chainMidPositions) {
    for (const [n, p] of chainMidPositions) {
      if (!nodePositions.has(n)) nodePositions.set(n, p);
    }
  }

  // 단자 라벨 → node id 역매핑 (R_L betweenNodes fallback 용)
  // 예: nodeAnnotations에 "a"/"b" 라벨이 있으면 그 node id를 알아둠
  const labelToNode = new Map<string, string>();
  for (const ann of netlist.nodeAnnotations ?? []) {
    labelToNode.set(ann.label.trim().toLowerCase(), ann.node);
  }

  // ============ node annotations (단자 점 + 라벨) ============
  for (const ann of netlist.nodeAnnotations ?? []) {
    const pos = nodePositions.get(ann.node);
    if (!pos) continue;
    const isTop = Math.abs(pos.y - TOP_Y) < 1;
    if (ann.style === "terminal_dot") {
      svg += `<circle cx="${pos.x}" cy="${pos.y}" r="4.5" fill="#dc2626" stroke="black" stroke-width="1"/>`;
    }
    // 라벨: bbox 회피하여 위치 결정
    const baseY = isTop ? pos.y - 12 : pos.y + 26;
    const labelPos = findFreeLabelPos(pos.x + 9, baseY, obstacles);
    svg += `<text x="${labelPos.x}" y="${labelPos.y}" font-size="14" font-weight="700" fill="#dc2626">${escapeSvg(ann.label)}</text>`;
  }

  // ============ load placeholders ============
  // 회로 위쪽 ANNO_BAND_Y band에 박스. 점선 wire는 obstacle 회피.
  for (const ph of netlist.loadPlaceholders ?? []) {
    let [n1, n2] = ph.betweenNodes;
    let a = nodePositions.get(n1);
    let b = nodePositions.get(n2);
    if (!a || !b) {
      const fa = labelToNode.get("a");
      const fb = labelToNode.get("b");
      if (fa && fb) {
        n1 = fa; n2 = fb;
        a = nodePositions.get(n1);
        b = nodePositions.get(n2);
      }
    }
    if (!a || !b) continue;

    const boxCx = (a.x + b.x) / 2;
    const boxCy = ANNO_BAND_Y;
    const w = 60;
    const h = 28;
    svg += `<rect x="${boxCx - w / 2}" y="${boxCy - h / 2}" width="${w}" height="${h}" fill="white" stroke="#9333ea" stroke-width="2" stroke-dasharray="5,3"/>`;
    svg += `<text x="${boxCx}" y="${boxCy + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#9333ea">${escapeSvg(ph.label)}</text>`;
    // node → 박스 라우팅: 위로 곧장 가는 path (회로 영역 위 ANNO_BAND_Y로 빠지므로 obstacle과 안 충돌)
    svg += routeOverlayPath(a.x, a.y - 6, boxCx - w / 2, boxCy, obstacles, "#9333ea");
    svg += routeOverlayPath(b.x, b.y - 6, boxCx + w / 2, boxCy, obstacles, "#9333ea");
  }

  // ============ measurement marks (V_ab probe overlay) ============
  for (const m of netlist.measurementMarks ?? []) {
    if (m.kind === "voltage" && m.refs.length >= 2) {
      let [n1, n2] = m.refs;
      let a = nodePositions.get(n1);
      let b = nodePositions.get(n2);
      if (!a || !b) {
        const fa = labelToNode.get("a");
        const fb = labelToNode.get("b");
        if (fa && fb) {
          n1 = fa; n2 = fb;
          a = nodePositions.get(n1);
          b = nodePositions.get(n2);
        }
      }
      if (!a || !b) continue;

      // +/- 마크 — bbox 회피하여 위치 결정
      const plusPos = findFreeLabelPos(a.x - 14, a.y + 4, obstacles);
      const minusPos = findFreeLabelPos(b.x + 14, b.y + 4, obstacles);
      svg += `<text x="${plusPos.x}" y="${plusPos.y}" text-anchor="end" font-size="14" font-weight="700" fill="#0891b2">+</text>`;
      svg += `<text x="${minusPos.x}" y="${minusPos.y}" text-anchor="start" font-size="14" font-weight="700" fill="#0891b2">−</text>`;

      // V_ab 라벨 — 회로 외곽 band, load placeholder 위
      const hasLoad = (netlist.loadPlaceholders ?? []).length > 0;
      const labelY = hasLoad ? ANNO_BAND_Y - 22 : ANNO_BAND_Y;
      const labelCx = (a.x + b.x) / 2;
      svg += `<text x="${labelCx}" y="${labelY}" text-anchor="middle" font-size="13" font-weight="700" fill="#0891b2">${escapeSvg(m.label)}</text>`;
    }
    // current: refs[0] = component id. 해당 component의 두 pin node 중간점에
    // 작은 화살표 + 라벨(i 등)을 그려 종속전원의 제어 변수가 어느 component를 흐르는지 표시.
    if (m.kind === "current" && m.refs.length >= 1) {
      const compId = m.refs[0];
      const comp = (netlist.components ?? []).find((c) => c.id === compId);
      if (!comp || (comp.pins ?? []).length < 2) continue;
      const pa = nodePositions.get(comp.pins[0].node);
      const pb = nodePositions.get(comp.pins[1].node);
      if (!pa || !pb) continue;
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const isHorizontal = Math.abs(pa.x - pb.x) > Math.abs(pa.y - pb.y);
      const COLOR = "#dc2626";
      if (isHorizontal) {
        // horizontal component: 위쪽에 좌→우 화살표 + 라벨
        const arrowY = my - 16;
        svg += `<path d="M ${mx - 14} ${arrowY} L ${mx + 14} ${arrowY}" stroke="${COLOR}" stroke-width="1.5" fill="none"/>`;
        svg += `<path d="M ${mx + 14} ${arrowY} L ${mx + 9} ${arrowY - 4} M ${mx + 14} ${arrowY} L ${mx + 9} ${arrowY + 4}" stroke="${COLOR}" stroke-width="1.5" fill="none"/>`;
        svg += `<text x="${mx}" y="${arrowY - 6}" text-anchor="middle" font-size="13" font-weight="700" fill="${COLOR}">${escapeSvg(m.label)}</text>`;
      } else {
        // vertical component: 우측에 위→아래 화살표 + 라벨
        const arrowX = mx + 18;
        svg += `<path d="M ${arrowX} ${my - 14} L ${arrowX} ${my + 14}" stroke="${COLOR}" stroke-width="1.5" fill="none"/>`;
        svg += `<path d="M ${arrowX} ${my + 14} L ${arrowX - 4} ${my + 9} M ${arrowX} ${my + 14} L ${arrowX + 4} ${my + 9}" stroke="${COLOR}" stroke-width="1.5" fill="none"/>`;
        svg += `<text x="${arrowX + 6}" y="${my + 5}" font-size="13" font-weight="700" fill="${COLOR}">${escapeSvg(m.label)}</text>`;
      }
    }
  }

  return svg;
}

/**
 * Overlay 경로 라우팅 — start→end 점선 path를 obstacle 회피로 그림.
 *  Rule-2 (wireAvoidsComponentBody): 회로 본체 통과 없이 **최단거리** 우회.
 *
 *  candidate 후보:
 *   - L-자 (수직 후 수평)
 *   - ANNO_BAND_Y 우회 (위→옆→아래)
 *   - 좌측 외곽 우회 (회로 좌측 column으로 우회 후 위→옆→아래)
 *   - 우측 외곽 우회
 *  모든 segment가 obstacle 미통과 candidate들 중 segment 길이 합이 최소인 path 선택.
 *  통과 가능 후보가 없으면 ANNO_BAND_Y 우회를 fallback (시각 깨짐 허용).
 */
function routeOverlayPath(
  x1: number, y1: number, x2: number, y2: number,
  obstacles: Bbox[],
  color: string,
): string {
  const dashed = (path: string) =>
    `<path d="${path}" stroke="${color}" fill="none" stroke-width="1.2" stroke-dasharray="3,3"/>`;

  const segOk = (sx: number, sy: number, ex: number, ey: number) =>
    !obstacles.some((o) => segmentIntersectsBbox(sx, sy, ex, ey, o));

  // path = [[x,y], ...]. segment 길이 합 계산.
  const pathLen = (pts: Array<[number, number]>): number => {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      len += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
    }
    return len;
  };
  const toD = (pts: Array<[number, number]>): string =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");

  // path 별 obstacle intersect 카운트 — 길이 + 패널티 가중치로 평가.
  //   L-자가 항상 후보로 등록되도록 (obstacle 통과해도 push). 패널티 200·교차당.
  const candidates: { pts: Array<[number, number]>; cost: number }[] = [];
  const intersectCount = (pts: Array<[number, number]>): number => {
    let n = 0;
    for (let i = 1; i < pts.length; i++) {
      if (!segOk(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])) n += 1;
    }
    return n;
  };
  const addCandidate = (pts: Array<[number, number]>) => {
    const ic = intersectCount(pts);
    const cost = pathLen(pts) + ic * 200;
    candidates.push({ pts, cost });
  };

  const detourY = Math.min(ANNO_BAND_Y, y2);

  // L-자 (최단) — 항상 후보로. 패널티 < 큰 우회 길이면 채택됨.
  addCandidate([[x1, y1], [x1, y2], [x2, y2]]);
  addCandidate([[x1, y1], [x2, y1], [x2, y2]]);
  // ANNO_BAND_Y 직 우회 (백업)
  addCandidate([[x1, y1], [x1, detourY], [x2, detourY], [x2, y2]]);
  // 좌·우 외곽 우회 — obstacle bbox의 xMin/xMax + 24 column 사용
  const xs = obstacles.flatMap((o) => [o.x, o.x + o.w]);
  if (xs.length > 0) {
    const xLeftDetour = Math.min(...xs) - 24;
    const xRightDetour = Math.max(...xs) + 24;
    addCandidate([[x1, y1], [xLeftDetour, y1], [xLeftDetour, detourY], [x2, detourY], [x2, y2]]);
    addCandidate([[x1, y1], [xRightDetour, y1], [xRightDetour, detourY], [x2, detourY], [x2, y2]]);
  }

  // 최저 cost candidate 선택 — 길이 + intersect 패널티 합산
  candidates.sort((a, b) => a.cost - b.cost);
  return dashed(toD(candidates[0].pts));
}

function renderGroundSymbol(cx: number, cy: number): string {
  return `<g transform="translate(${cx},${cy})">
  <line x1="0" y1="0" x2="0" y2="10" stroke="black" stroke-width="2"/>
  <line x1="-10" y1="10" x2="10" y2="10" stroke="black" stroke-width="2.4"/>
  <line x1="-7" y1="14" x2="7" y2="14" stroke="black" stroke-width="2"/>
  <line x1="-3" y1="18" x2="3" y2="18" stroke="black" stroke-width="2"/>
</g>`;
}

function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
