import type { CircuitComponent, CircuitNetlist } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";
import { CONNECTION_LAYOUT_RULES } from "@/lib/generation/branchTemplate";

// =====================================================================
// OPAMP 전용 renderer — single·multi(cascade) 모두 지원.
//
//  공통 규칙 (모든 OPAMP에 적용):
//   1. OPAMP는 plus/minus/out 3-pin 핵심 구조로만 처리, 일반 analog branch와 분리.
//   2. node는 OPAMP body가 아니라 pin anchor에 연결.
//   3. anchor swap — V−(minus) 위쪽, V+(plus) 아래쪽:
//        plus  (520, 270 + k·X_GAP)
//        minus (520, 220 + k·X_GAP)
//        out   (660, 245)
//      (k = OPAMP index, X_GAP은 column shift)
//   4. feedback_inv (vo↔vn): OPAMP body 위로 우회.
//   5. feedback_noninv (vo↔vp): OPAMP body 아래로 우회.
//   6. ref_noninv (vp↔GND), ref_inv (vn↔GND): 좌측 detour vertical → GND symbol.
//   7. input_noninv (vp↔ext), input_inv (vn↔ext): 좌측 horizontal (ext.y와 opPin.y 다를 시
//      orthogonal로 vertical→horizontal 조합).
//   8. source_leg (V/I source one-pin-GND): 외부 source column vertical.
//
//  cascade (multi OPAMP):
//   - 각 OPAMP는 cy=245로 같은 level에 두고 column만 shift.
//   - OPAMP_k의 vo가 OPAMP_(k+1)의 vp/vn에 연결되는 component (coupling)는 자동으로 input_*
//     branch로 분류 (externalNodeId가 이전 OPAMP의 vo node).
// =====================================================================

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

type Anchor = { x: number; y: number };

type OpAmpAnchors = {
  plus: Anchor;
  minus: Anchor;
  out: Anchor;
  bodyLeft: number;
  bodyRight: number;
  bodyTop: number;
  bodyBot: number;
  cx: number;
  cy: number;
};

type BranchKind =
  | "feedback_inv"
  | "feedback_noninv"
  | "input_noninv"
  | "input_inv"
  | "ref_noninv"
  | "ref_inv"
  | "source_leg"
  | "external";

type ClassifiedBranch = {
  kind: BranchKind;
  component: CircuitComponent;
  /** OPAMP-attached branch만 valid; source_leg/external은 -1 */
  opampIndex: number;
  externalNodeId?: string;
};

type PinRole = "plus" | "minus" | "out";
type PinInfo = { opIdx: number; role: PinRole };

export function hasOpAmp(netlist: CircuitNetlist): boolean {
  return (netlist.components ?? []).some((c) => c.type === "OPAMP");
}

export function validateOpAmpCircuit(netlist: CircuitNetlist): string[] {
  const errors: string[] = [];
  const opamps = (netlist.components ?? []).filter((c) => c.type === "OPAMP");
  for (const op of opamps) {
    const pins = op.pins ?? [];
    if (!pins[0]?.node) errors.push(`${op.id}: + input pin 누락`);
    if (!pins[1]?.node) errors.push(`${op.id}: − input pin 누락`);
    if (!pins[2]?.node) errors.push(`${op.id}: output pin 누락`);
    if (pins.length < 3) continue;
    const vpNode = pins[0].node;
    const vnNode = pins[1].node;
    const voNode = pins[2].node;
    // 규칙 #8: V_o가 외부 단자(label_only annotation)이고 다른 R/C와 closed loop를 안 만들면
    //   open-loop 비교기로 인정 → feedback branch 검사 면제.
    const isExternalTerminal = (netlist.nodeAnnotations ?? []).some(
      (a) => a.node === voNode && a.style === "label_only",
    );
    const voConsumers = (netlist.components ?? []).filter((c) => {
      if (c.id === op.id) return false;
      return (c.pins ?? []).some((p) => p.node === voNode);
    });
    const isComparator = isExternalTerminal && voConsumers.length === 0;
    if (isComparator) continue; // open-loop 비교기: feedback 검사 면제
    // closed-loop 증폭기: feedback 의무 (V_out → V− 또는 V+ 2-pin component)
    const hasFeedback = (netlist.components ?? []).some((c) => {
      if (c.id === op.id) return false;
      if (!c.pins || c.pins.length !== 2) return false;
      const [a, b] = [c.pins[0].node, c.pins[1].node];
      const toVn = (a === voNode && b === vnNode) || (a === vnNode && b === voNode);
      const toVp = (a === voNode && b === vpNode) || (a === vpNode && b === voNode);
      return toVn || toVp;
    });
    if (!hasFeedback) {
      errors.push(`${op.id}: OPAMP feedback branch 누락 (output → − or + input)`);
    }
  }
  return errors;
}

// =====================================================================
// 모든 layout spacing은 CONNECTION_LAYOUT_RULES.laneOffsetMinPx(=LANE)의 배수로 derive.
//   Rule-3 (lane separation) 위배 없이 자동 정합.
//
//  LANE = 16. R width=56(±28), V/I circle r=22. 라벨 ±11.
//   - STACK_GAP_R = LANE*5 = 80 : multi-input R 간 최소 간격 (R 한 개 width 56 + 라벨 여유 24).
//   - DETOUR_GAP  = LANE*3 = 48 : ref/feedback 다중 detour 간 간격.
//   - LANE_DETOUR_Y = LANE*2 = 32 : 우측 wire body 회피 lane (R body 높이 ±10 + 여유).
//   - COLUMN_SHIFT = LANE*38 = 608 : multi-OPAMP column shift (OPAMP body + 좌·우 wire + source col).
//   - SOURCE_OFFSET_X = LANE*28 = 448 : OPAMP 좌측 source column까지 거리.
//   - SOURCE_X_GAP = LANE*4.5 ≈ 72 : 같은 level multi-source column 간격.
//   - REF_FIRST_OFFSET = LANE*2.5 = 40 : 첫 ref branch가 pin에서 좌측으로 우회하는 거리.
//   - FB_LAT_OFFSET = LANE*5 = 80 : feedback 우측 우회 base offset (out.x → detour x).
//   - FB_VERT_OFFSET = LANE*3 - 3 = 45 : feedback detour의 vertical 거리 (bodyTop-45 / bodyBot+45).
//   - LABEL_OFFSET = LANE = 16 : 노드 라벨 ext 좌측 거리.
// =====================================================================
const LANE = CONNECTION_LAYOUT_RULES.laneOffsetMinPx;
const JUNCTION_DEGREE = CONNECTION_LAYOUT_RULES.junctionDotOnDegreeAtLeast;
const STACK_GAP_R = LANE * 5;
const DETOUR_GAP = LANE * 3;
const LANE_DETOUR_Y = LANE * 2;
const COLUMN_SHIFT = LANE * 38;
const SOURCE_OFFSET_X = LANE * 28;
const SOURCE_X_GAP = Math.round(LANE * 4.5);
const REF_FIRST_OFFSET = Math.round(LANE * 2.5);
const FB_LAT_OFFSET = LANE * 5;
const FB_VERT_OFFSET = LANE * 3 - 3;
const LABEL_OFFSET = LANE;

function makeAnchor(idx: number): OpAmpAnchors {
  const dx = idx * COLUMN_SHIFT;
  return {
    plus:  { x: 520 + dx, y: 270 },  // V+ 아래
    minus: { x: 520 + dx, y: 220 },  // V− 위
    out:   { x: 660 + dx, y: 245 },
    bodyLeft: 550 + dx,
    bodyRight: 630 + dx,
    bodyTop: 205,
    bodyBot: 285,
    cx: 590 + dx,
    cy: 245,
  };
}

// =====================================================================
// Main entry
// =====================================================================
export function renderOpAmpCircuit(netlist: CircuitNetlist): string | null {
  const opamps = (netlist.components ?? []).filter((c) => c.type === "OPAMP");
  if (opamps.length === 0) return null;
  for (const op of opamps) {
    if (!op.pins || op.pins.length < 3) return null;
  }

  const groundId = netlist.ground;
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === groundId;

  // 1. OPAMP별 anchor + pin role map
  const anchors: OpAmpAnchors[] = opamps.map((_, i) => makeAnchor(i));
  const pinInfo = new Map<string, PinInfo>();
  const pinAnchor = new Map<string, Anchor>();
  opamps.forEach((op, k) => {
    const pins = op.pins!;
    pinInfo.set(pins[0].node, { opIdx: k, role: "plus" });
    pinInfo.set(pins[1].node, { opIdx: k, role: "minus" });
    pinInfo.set(pins[2].node, { opIdx: k, role: "out" });
    pinAnchor.set(pins[0].node, anchors[k].plus);
    pinAnchor.set(pins[1].node, anchors[k].minus);
    pinAnchor.set(pins[2].node, anchors[k].out);
  });

  // 2. Classify branches
  const branches: ClassifiedBranch[] = [];
  for (const c of netlist.components ?? []) {
    if (c.type === "OPAMP") continue;
    if (!c.pins || c.pins.length !== 2) continue;
    const [p1, p2] = c.pins;
    const a = p1.node, b = p2.node;
    const aPin = pinInfo.get(a);
    const bPin = pinInfo.get(b);
    const aIsGnd = isGnd(a);
    const bIsGnd = isGnd(b);

    // 같은 OPAMP 안의 두 pin: feedback
    if (aPin && bPin && aPin.opIdx === bPin.opIdx) {
      const idx = aPin.opIdx;
      const roles = new Set([aPin.role, bPin.role]);
      if (roles.has("out") && roles.has("minus")) {
        branches.push({ kind: "feedback_inv", component: c, opampIndex: idx });
        continue;
      }
      if (roles.has("out") && roles.has("plus")) {
        branches.push({ kind: "feedback_noninv", component: c, opampIndex: idx });
        continue;
      }
    }
    // ref: vp/vn ↔ GND
    if (aPin && bIsGnd && (aPin.role === "plus" || aPin.role === "minus")) {
      branches.push({
        kind: aPin.role === "plus" ? "ref_noninv" : "ref_inv",
        component: c, opampIndex: aPin.opIdx,
      });
      continue;
    }
    if (bPin && aIsGnd && (bPin.role === "plus" || bPin.role === "minus")) {
      branches.push({
        kind: bPin.role === "plus" ? "ref_noninv" : "ref_inv",
        component: c, opampIndex: bPin.opIdx,
      });
      continue;
    }
    // input: vp/vn ↔ ext (ext may be another OPAMP's vo for coupling)
    if (aPin && (aPin.role === "plus" || aPin.role === "minus") && !bIsGnd) {
      branches.push({
        kind: aPin.role === "plus" ? "input_noninv" : "input_inv",
        component: c, opampIndex: aPin.opIdx, externalNodeId: b,
      });
      continue;
    }
    if (bPin && (bPin.role === "plus" || bPin.role === "minus") && !aIsGnd) {
      branches.push({
        kind: bPin.role === "plus" ? "input_noninv" : "input_inv",
        component: c, opampIndex: bPin.opIdx, externalNodeId: a,
      });
      continue;
    }
    // source_leg: V/I source w/ one-pin-GND
    if ((c.type === "V" || c.type === "I") && (aIsGnd || bIsGnd)) {
      branches.push({ kind: "source_leg", component: c, opampIndex: -1 });
      continue;
    }
    branches.push({ kind: "external", component: c, opampIndex: -1 });
  }

  // 3. 외부 ext node 위치 (OPAMP pin 아닌 노드)
  const nodePos = new Map<string, Anchor>();
  for (const [node, anc] of pinAnchor) nodePos.set(node, anc);

  type ExtItem = { node: string; opIdx: number; level: "plus" | "minus" };
  const extItems: ExtItem[] = [];
  for (const b of branches) {
    if (!b.externalNodeId) continue;
    if (nodePos.has(b.externalNodeId)) continue;
    if (b.kind === "input_noninv") {
      extItems.push({ node: b.externalNodeId, opIdx: b.opampIndex, level: "plus" });
    } else if (b.kind === "input_inv") {
      extItems.push({ node: b.externalNodeId, opIdx: b.opampIndex, level: "minus" });
    }
  }
  // 같은 ext가 여러 번 등장하면 dedupe (첫 등장만 유지)
  const seenExts = new Set<string>();
  // 각 OPAMP 좌측 column에 분산 배치 — 같은 level 다중 ext는 좌측으로 추가 분산
  const noninvCounts = new Map<number, number>();
  const invCounts = new Map<number, number>();
  for (const item of extItems) {
    if (seenExts.has(item.node)) continue;
    seenExts.add(item.node);
    const opAnc = anchors[item.opIdx];
    if (!opAnc) continue;
    if (item.level === "plus") {
      const i = noninvCounts.get(item.opIdx) ?? 0;
      nodePos.set(item.node, { x: opAnc.plus.x - SOURCE_OFFSET_X - i * SOURCE_X_GAP, y: opAnc.plus.y });
      noninvCounts.set(item.opIdx, i + 1);
    } else {
      const i = invCounts.get(item.opIdx) ?? 0;
      // input_inv의 source column은 input_noninv와 다른 base offset (LANE*12.5 ≈ 200)으로 분리.
      const invBase = SOURCE_OFFSET_X - LANE * 12.5;
      nodePos.set(item.node, { x: opAnc.minus.x - invBase - i * SOURCE_X_GAP, y: opAnc.minus.y });
      invCounts.set(item.opIdx, i + 1);
    }
  }

  // 4. SVG 빌드
  let svg = "";
  const localGndPoints: { x: number; y: number; up?: boolean }[] = [];
  const HALF_R = 28;

  // 4-1. OPAMP body symbols
  opamps.forEach((op, k) => {
    svg += renderOpampSymbol(anchors[k], op.id);
  });

  // 4-2. 마지막 OPAMP의 출력 wire → V_o terminal
  const lastIdx = opamps.length - 1;
  const lastAnc = anchors[lastIdx];
  const lastVoNode = opamps[lastIdx].pins![2].node;
  const V_O_X = lastAnc.out.x + 140;
  svg += `<path d="M ${lastAnc.out.x} ${lastAnc.out.y} L ${V_O_X} ${lastAnc.out.y}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${V_O_X}" cy="${lastAnc.out.y}" r="3.5" fill="black"/>`;
  const voLabel = findNodeLabel(netlist, lastVoNode) ?? "V_o";
  svg += `<text x="${V_O_X + 10}" y="${lastAnc.out.y + 4}" text-anchor="start" font-size="12" fill="#1e3a8a" font-weight="600">${escapeSvg(voLabel)}</text>`;

  // 4-3. Source legs — V/I source vertical at ext column
  for (const b of branches) {
    if (b.kind !== "source_leg") continue;
    const c = b.component;
    if (!c.pins || c.pins.length !== 2) continue;
    const extNode = isGnd(c.pins[0].node) ? c.pins[1].node : c.pins[0].node;
    const ext = nodePos.get(extNode);
    if (!ext) continue;
    const cx = ext.x;
    const topY = ext.y;
    const symY = topY + 70;
    const gndY = topY + 130;
    svg += `<path d="M ${cx} ${topY} L ${cx} ${symY - 22}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderComponentOnEdge(c, { x: cx, y: symY }, "vertical");
    svg += `<path d="M ${cx} ${symY + 22} L ${cx} ${gndY}" stroke="black" fill="none" stroke-width="2"/>`;
    localGndPoints.push({ x: cx, y: gndY, up: false });
  }

  // 4-4. Input branches — ext → input pin (horizontal at opPin.y; ext.y 다르면 vertical+horizontal orthogonal)
  //   같은 OPAMP의 같은 level(plus/minus)에 다중 input이면 R 위치를 stack offset으로 분리.
  const inputInvCounts = new Map<number, number>();
  const inputNoninvCounts = new Map<number, number>();
  for (const b of branches) {
    if (b.kind !== "input_noninv" && b.kind !== "input_inv") continue;
    if (!b.externalNodeId) continue;
    const ext = nodePos.get(b.externalNodeId);
    if (!ext) continue;
    const opAnc = anchors[b.opampIndex];
    if (!opAnc) continue;
    const isNoninv = b.kind === "input_noninv";
    const opPin = isNoninv ? opAnc.plus : opAnc.minus;
    const counts = isNoninv ? inputNoninvCounts : inputInvCounts;
    const i = counts.get(b.opampIndex) ?? 0;
    counts.set(b.opampIndex, i + 1);
    // midX = base midpoint - stack offset, ext.x+R 안 침범하게 clamp (Rule-3 lane separation)
    let midX = (ext.x + opPin.x) / 2 - i * STACK_GAP_R;
    const lo = Math.min(ext.x, opPin.x) + HALF_R + LANE;
    const hi = Math.max(ext.x, opPin.x) - HALF_R - LANE;
    if (lo <= hi) midX = Math.max(lo, Math.min(hi, midX));
    // 좌측 wire: ext.y와 opPin.y 다르면 vertical → horizontal
    if (Math.abs(ext.y - opPin.y) > 1) {
      svg += `<path d="M ${ext.x} ${ext.y} L ${ext.x} ${opPin.y}" stroke="black" fill="none" stroke-width="2"/>`;
    }
    svg += `<path d="M ${ext.x} ${opPin.y} L ${midX - HALF_R} ${opPin.y}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderComponentOnEdge(b.component, { x: midX, y: opPin.y }, "horizontal");
    // 우측 wire — Rule-2 (wireAvoidsComponentBody): i>0이면 다른 R body 회피용 lane offset.
    if (i === 0 || !CONNECTION_LAYOUT_RULES.wireAvoidsComponentBody) {
      svg += `<path d="M ${midX + HALF_R} ${opPin.y} L ${opPin.x} ${opPin.y}" stroke="black" fill="none" stroke-width="2"/>`;
    } else {
      // inv level(V−위쪽 anchor): 위 lane 우회 / noninv level(V+아래쪽): 아래 lane 우회
      const laneY = isNoninv
        ? opPin.y + LANE_DETOUR_Y + (i - 1) * LANE
        : opPin.y - LANE_DETOUR_Y - (i - 1) * LANE;
      const exitX = midX + HALF_R + Math.round(LANE / 2);
      const entryX = opPin.x - Math.round(LANE * 0.75);
      svg += `<path d="M ${midX + HALF_R} ${opPin.y} L ${exitX} ${opPin.y} L ${exitX} ${laneY} L ${entryX} ${laneY} L ${entryX} ${opPin.y} L ${opPin.x} ${opPin.y}" stroke="black" fill="none" stroke-width="2"/>`;
    }
  }

  // 4-5. Reference branches — vp/vn → GND, 좌측 detour vertical
  const refCountByOp = new Map<number, { plus: number; minus: number }>();
  for (const b of branches) {
    if (b.kind !== "ref_noninv" && b.kind !== "ref_inv") continue;
    const opAnc = anchors[b.opampIndex];
    if (!opAnc) continue;
    const counter = refCountByOp.get(b.opampIndex) ?? { plus: 0, minus: 0 };
    refCountByOp.set(b.opampIndex, counter);
    const isNoninv = b.kind === "ref_noninv";
    const pin = isNoninv ? opAnc.plus : opAnc.minus;
    const i = isNoninv ? counter.plus++ : counter.minus++;
    // 규칙 #7 (node 사용 최소화): 같은 OPAMP의 feedback_noninv가 V+ junction을 공유하면
    //   R_1 column을 feedback wire의 좌측 stub column(pin.x - 88)과 일치시켜 chain 연결.
    //   그러면 V+ junction 1곳(R_2 좌측 stub 끝 = R_1 top)에서 모든 component가 만남.
    const hasFbNoninvSameOp = isNoninv && branches.some(
      (br) => br.kind === "feedback_noninv" && br.opampIndex === b.opampIndex,
    );
    const detourX = hasFbNoninvSameOp
      ? pin.x - (REF_FIRST_OFFSET + DETOUR_GAP) - i * DETOUR_GAP // feedback stub과 같은 column (pin.x-88)
      : pin.x - REF_FIRST_OFFSET - i * DETOUR_GAP;
    // ground rail
    const botY = 440;
    // hasFbNoninvSameOp이면 R_1 top을 feedback wire 끝(335)에 직접 잇고, R_1 component은 그 아래에.
    //   topY = feedback detourY (335), R_1 cy = (335 + 440)/2 ≈ 387.
    //   그 외에는 V+ pin → R_1 → GND chain의 가운데 (botY-30).
    const topY = hasFbNoninvSameOp ? 335 : pin.y;
    const symY = hasFbNoninvSameOp ? (topY + botY) / 2 : botY - 30;
    svg += `<path d="M ${pin.x} ${pin.y} L ${detourX} ${pin.y} L ${detourX} ${symY - HALF_R}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += renderComponentOnEdge(b.component, { x: detourX, y: symY }, "vertical");
    svg += `<path d="M ${detourX} ${symY + HALF_R} L ${detourX} ${botY}" stroke="black" fill="none" stroke-width="2"/>`;
    localGndPoints.push({ x: detourX, y: botY, up: false });
  }

  // 4-5.b OPAMP vp/vn pin이 GND에 직접 연결된 경우 (component 없는 short) — stub + ground symbol
  //   branchTemplate가 OPAMP pins에 role "non_inverting"/"inverting"을 설정하므로 그것으로 식별.
  for (let opIdx = 0; opIdx < opamps.length; opIdx++) {
    const op = opamps[opIdx];
    const anc = anchors[opIdx];
    if (!anc) continue;
    const vpPin = op.pins?.find((p) => p.role === "non_inverting");
    const vnPin = op.pins?.find((p) => p.role === "inverting");
    if (vpPin && isGnd(vpPin.node)) {
      const pinX = anc.plus.x;
      const pinY = anc.plus.y;
      const stubY = pinY + 40;
      svg += `<path d="M ${pinX} ${pinY} L ${pinX} ${stubY}" stroke="black" fill="none" stroke-width="2"/>`;
      localGndPoints.push({ x: pinX, y: stubY, up: false });
    }
    if (vnPin && isGnd(vnPin.node)) {
      const pinX = anc.minus.x;
      const pinY = anc.minus.y;
      const stubY = pinY - 40;
      svg += `<path d="M ${pinX} ${pinY} L ${pinX} ${stubY}" stroke="black" fill="none" stroke-width="2"/>`;
      localGndPoints.push({ x: pinX, y: stubY, up: true });
    }
  }

  // 4-6. Feedback branches
  //   feedback_inv (vo→V−): OPAMP body 위로 우회 (bodyTop - 45)
  //   feedback_noninv (vo→V+): OPAMP body 아래로 우회 (bodyBot + 45)
  const fbCountByOp = new Map<number, { inv: number; noninv: number }>();
  for (const b of branches) {
    if (b.kind !== "feedback_inv" && b.kind !== "feedback_noninv") continue;
    const opAnc = anchors[b.opampIndex];
    if (!opAnc) continue;
    const counter = fbCountByOp.get(b.opampIndex) ?? { inv: 0, noninv: 0 };
    fbCountByOp.set(b.opampIndex, counter);
    const FB_STACK_V = LANE + 9; // 다중 feedback 간 vertical 간격 (25 → LANE 기반)
    const FB_STACK_H = LANE * 3 + 2; // 다중 feedback 간 horizontal 간격 (50 → LANE 기반)
    const FB_LEFT_OFFSET = REF_FIRST_OFFSET; // pin → 우회 시작 x offset (40 통일)
    const FB_LEFT_STACK = LANE + 4; // 다중 feedback 좌측 stack (20 → LANE 기반)
    if (b.kind === "feedback_inv") {
      const i = counter.inv++;
      const detourY = opAnc.bodyTop - FB_VERT_OFFSET - i * FB_STACK_V;
      const xRight = opAnc.out.x + FB_LAT_OFFSET + i * FB_STACK_H;
      const xLeft = opAnc.minus.x - (FB_LEFT_OFFSET + i * FB_LEFT_STACK);
      const rcx = (xRight + xLeft) / 2;
      svg += `<path d="M ${opAnc.out.x} ${opAnc.out.y} L ${xRight} ${opAnc.out.y} L ${xRight} ${detourY} L ${rcx + HALF_R} ${detourY}" stroke="black" fill="none" stroke-width="2"/>`;
      svg += renderComponentOnEdge(b.component, { x: rcx, y: detourY }, "horizontal");
      svg += `<path d="M ${rcx - HALF_R} ${detourY} L ${xLeft} ${detourY} L ${xLeft} ${opAnc.minus.y} L ${opAnc.minus.x} ${opAnc.minus.y}" stroke="black" fill="none" stroke-width="2"/>`;
    } else {
      const i = counter.noninv++;
      // ref_noninv R 컴포넌트가 V+ leg에 있으면 layout 두 차원으로 분리:
      //   (1) detourY: R_1 component 위쪽(OPAMP body 직후)에 R_2 horizontal wire 배치
      //   (2) xLeft: R_1 column보다 더 좌측으로 — R_2 vertical stub이 R_1 component box를 통과 안 함
      //   node 연결 규칙: wire가 component box를 가로지르지 않음.
      const hasRefNoninv = branches.some((br) => br.kind === "ref_noninv" && br.opampIndex === b.opampIndex);
      // 규칙 #6: feedback_noninv R component이 OPAMP body 내부 침범 금지 (현재 bodyBot=285).
      //   R component height ±28, detourY≥335이면 R top≥307 — body bottom 22px 아래로 분리.
      //   동시에 ref_noninv R_1 top(=382, cy=410)과도 분리 (R_2 bottom=363 vs R_1 top=382 = 19px gap).
      const detourY = hasRefNoninv
        ? opAnc.bodyBot + 50 + i * FB_STACK_V
        : opAnc.bodyBot + FB_VERT_OFFSET + i * FB_STACK_V;
      const xRight = opAnc.out.x + FB_LAT_OFFSET + i * FB_STACK_H;
      // hasRefNoninv면 R_1 column(pin.x - 40) 더 좌측으로 (pin.x - 88) — R_1 box(x≈pin.x-40) 회피
      const xLeftBaseOffset = hasRefNoninv ? FB_LEFT_OFFSET + DETOUR_GAP : FB_LEFT_OFFSET;
      const xLeft = opAnc.plus.x - (xLeftBaseOffset + i * FB_LEFT_STACK);
      const rcx = (xRight + xLeft) / 2;
      svg += `<path d="M ${opAnc.out.x} ${opAnc.out.y} L ${xRight} ${opAnc.out.y} L ${xRight} ${detourY} L ${rcx + HALF_R} ${detourY}" stroke="black" fill="none" stroke-width="2"/>`;
      svg += renderComponentOnEdge(b.component, { x: rcx, y: detourY }, "horizontal");
      svg += `<path d="M ${rcx - HALF_R} ${detourY} L ${xLeft} ${detourY} L ${xLeft} ${opAnc.plus.y} L ${opAnc.plus.x} ${opAnc.plus.y}" stroke="black" fill="none" stroke-width="2"/>`;
    }
  }

  // 4-7. Distributed GND symbols
  for (const gp of localGndPoints) {
    svg += renderGroundSymbol(gp.x, gp.y, gp.up ?? false);
  }

  // 4-8. Junction dots — degree ≥ 3 노드
  const degree = new Map<string, number>();
  for (const c of netlist.components ?? []) {
    for (const p of c.pins ?? []) {
      degree.set(p.node, (degree.get(p.node) ?? 0) + 1);
    }
  }
  for (const [node, d] of degree) {
    if (d < JUNCTION_DEGREE) continue;
    if (isGnd(node)) continue;
    const pos = nodePos.get(node);
    if (pos) svg += `<circle cx="${pos.x}" cy="${pos.y}" r="3.5" fill="black"/>`;
  }

  // 4-9. Node labels
  for (const ann of netlist.nodeAnnotations ?? []) {
    const pos = nodePos.get(ann.node);
    if (!pos) continue;
    if (ann.node === lastVoNode) continue; // V_o terminal에서 이미 표시
    svg += `<text x="${pos.x - LABEL_OFFSET}" y="${pos.y + 4}" text-anchor="end" font-size="12" fill="#1e3a8a" font-weight="600">${escapeSvg(ann.label)}</text>`;
  }

  // 5. Bounding box
  const allXs: number[] = [];
  const allYs: number[] = [];
  for (const p of nodePos.values()) { allXs.push(p.x); allYs.push(p.y); }
  for (const gp of localGndPoints) { allXs.push(gp.x); allYs.push(gp.y); }
  for (const a of anchors) {
    allXs.push(a.bodyLeft, a.bodyRight);
    allYs.push(a.bodyTop, a.bodyBot);
  }
  allXs.push(V_O_X);
  allYs.push(420);
  const minX = Math.min(...allXs) - 60;
  const maxX = Math.max(...allXs) + 80;
  const minY = Math.min(...allYs) - 60;
  const maxY = Math.max(...allYs) + 30;
  const w = Math.max(maxX - minX, 320);
  const h = Math.max(maxY - minY, 220);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="${minX} ${minY} ${w} ${h}">${svg}</svg>`;
}

// =====================================================================
// OPAMP body symbol — anchor 기준
// =====================================================================
function renderOpampSymbol(op: OpAmpAnchors, id: string): string {
  const path = `M ${op.bodyLeft} ${op.bodyTop} L ${op.bodyLeft} ${op.bodyBot} L ${op.bodyRight} ${op.cy} Z`;
  return (
    `<path d="M ${op.plus.x} ${op.plus.y} L ${op.bodyLeft} ${op.plus.y}" stroke="black" fill="none" stroke-width="2"/>` +
    `<path d="M ${op.minus.x} ${op.minus.y} L ${op.bodyLeft} ${op.minus.y}" stroke="black" fill="none" stroke-width="2"/>` +
    `<path d="M ${op.bodyRight} ${op.cy} L ${op.out.x} ${op.out.y}" stroke="black" fill="none" stroke-width="2"/>` +
    `<path d="${path}" stroke="black" fill="white" stroke-width="2"/>` +
    `<text x="${op.bodyLeft + 10}" y="${op.plus.y + 5}" text-anchor="start" font-size="14">+</text>` +
    `<text x="${op.bodyLeft + 10}" y="${op.minus.y + 5}" text-anchor="start" font-size="14">−</text>` +
    `<text x="${(op.bodyLeft + op.bodyRight) / 2}" y="${op.bodyTop - 6}" text-anchor="middle" font-size="11" fill="#1e3a8a" font-weight="600">${escapeSvg(id)}</text>`
  );
}

function renderGroundSymbol(x: number, y: number, up: boolean): string {
  const f = up ? -1 : 1;
  return (
    `<g transform="translate(${x},${y})">` +
    `<line x1="0" y1="0" x2="0" y2="${10 * f}" stroke="black" stroke-width="2"/>` +
    `<line x1="-10" y1="${10 * f}" x2="10" y2="${10 * f}" stroke="black" stroke-width="2.4"/>` +
    `<line x1="-7" y1="${14 * f}" x2="7" y2="${14 * f}" stroke="black" stroke-width="2"/>` +
    `<line x1="-3" y1="${18 * f}" x2="3" y2="${18 * f}" stroke="black" stroke-width="2"/>` +
    `</g>`
  );
}

function findNodeLabel(netlist: CircuitNetlist, node: string): string | undefined {
  return (netlist.nodeAnnotations ?? []).find((a) => a.node === node)?.label;
}

function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
