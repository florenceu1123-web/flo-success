import type { LogicBlank, LogicGate, LogicGateType, LogicNetworkDiagram } from "@/types";

type Point = { x: number; y: number };

type GateNode = {
  id: string;
  type: LogicGateType;
  gate: LogicGate;
  x: number;
  y: number;
  width: number;
  height: number;
};

// =====================================================================
// Flip-flop (DFF/TFF) — state register. Q 출력은 클럭 직전 latch된 값으로
// 회로 동작 시작 시점에 "이미 produced"된 신호로 취급한다. 그렇지 않으면
// FSM 피드백 루프(NOT/AND gate가 Q를 consume → 그 결과가 DFF input → DFF가 Q produce)에서
// validator/levelize가 cycle로 오인.
// =====================================================================
const FLIPFLOP_TYPES = new Set<LogicGateType>(["DFF", "TFF", "JKFF"]);

function isFlipFlop(type: LogicGateType): boolean {
  return FLIPFLOP_TYPES.has(type);
}

function collectFlipFlopOutputs(diagram: LogicNetworkDiagram): string[] {
  return diagram.gates.filter((g) => isFlipFlop(g.type)).map((g) => g.output);
}

// =====================================================================
// Validation — analog_netlist의 dangling 검사 미적용. 신호 그래프 검증만.
// =====================================================================
export function validateLogicNetwork(diagram: LogicNetworkDiagram) {
  const errors: string[] = [];
  const produced = new Set<string>([...diagram.inputs, ...collectFlipFlopOutputs(diagram)]);

  diagram.gates.forEach((gate, gi) => {
    const gateLabel = gate.id ?? `gate#${gi}`;
    if (!gate.id) errors.push(`gate#${gi} (type=${gate.type ?? "?"}): id 필드 누락 — { id:"G1", type:"AND", inputs:[...], output:"..." } 형식 필수`);
    if (!gate.inputs?.length) errors.push(`${gateLabel}: 입력 없음`);
    // 플립플롭의 input source 검증은 두 번째 패스에서 수행 (조합부 출력이 모두 모인 뒤).
    if (!isFlipFlop(gate.type)) {
      for (const input of gate.inputs ?? []) {
        if (!produced.has(input)) {
          const looksLikeComplement = /^(?:¬|~|\\?!?\W?)?(\w+)['′̄]$|^(?:\w+)_n$/.test(input);
          const hint = looksLikeComplement
            ? ` (보수 신호로 보임 — 명시적 NOT 게이트 필요: { type:"NOT", inputs:["${input.replace(/['′̄]/g, "")}"], output:"${input}" })`
            : "";
          errors.push(`${gateLabel}: ${input} 신호의 source 없음${hint}`);
        }
      }
    }
    if (!gate.output) errors.push(`${gateLabel}: output 없음`);
    if (gate.output) produced.add(gate.output);
  });

  // 두 번째 패스 — 플립플롭 input(D/T/J/K)이 조합부 어디서든 produced 되었는지 일괄 확인.
  for (const g of diagram.gates) {
    if (!isFlipFlop(g.type)) continue;
    for (const input of g.inputs ?? []) {
      if (!produced.has(input)) {
        errors.push(`${g.id} (${g.type}): ${input} 신호의 source 없음 — 플립플롭 입력은 조합부 출력에서 와야 함`);
      }
    }
    // clockSignal — 내부 신호를 ▷ 핀에 연결하는 경우. 이 신호도 어디선가 produced 돼야 함.
    if (g.clockSignal && !produced.has(g.clockSignal)) {
      errors.push(`${g.id} (${g.type}): clockSignal "${g.clockSignal}" source 없음 — 게이트 출력 또는 외부 입력이어야 함`);
    }
  }
  for (const out of diagram.outputs) {
    if (!produced.has(out)) errors.push(`출력 ${out}의 source 없음`);
  }
  // unused gate output: 어떤 gate의 output이 다른 gate의 input에도, diagram.outputs에도, FF clockSignal에도
  // 없고 signalLabels에도 등재되지 않으면 dangling.
  const consumed = new Set<string>(diagram.outputs);
  for (const g of diagram.gates) {
    for (const inp of g.inputs ?? []) consumed.add(inp);
    if (g.clockSignal) consumed.add(g.clockSignal);
  }
  for (const sig of Object.keys(diagram.signalLabels ?? {})) consumed.add(sig);
  for (const g of diagram.gates) {
    if (g.output && !consumed.has(g.output)) {
      errors.push(
        `${g.id} (${g.type}): output 신호 "${g.output}"이 orphan. 두 가지 중 하나로 수정: ` +
        `(1) 이 gate의 output을 다른 gate(예: AND term)의 inputs에 추가하거나 ` +
        `(2) K-map 셀값을 조정해서 minimization 결과가 ${g.type}(${(g.inputs ?? []).join(",")})를 product term으로 사용하도록 만들 것.`,
      );
    }
  }
  // blank coverage
  const cov = validateBlankCoverage(diagram);
  errors.push(...cov.errors);
  return { ok: errors.length === 0, errors };
}

// =====================================================================
// Entry
// =====================================================================
export function renderLogicNetworkSVG(diagram: LogicNetworkDiagram): string {
  const validation = validateLogicNetwork(diagram);
  if (!validation.ok) {
    return `<pre>${escapeSvg(validation.errors.join("\n"))}</pre>`;
  }

  const levels = levelizeLogicGates(diagram);
  const nodes = layoutLogicGates(levels);
  const signalPos = new Map<string, Point>();

  // 피드백 신호 식별 — FF의 Q 출력이면서 다른 게이트의 입력으로도 쓰이는 신호.
  // 예: FSM에서 G_dff_Q1.output=Q1이 NOT/AND gate 입력이기도 함.
  // 시각화를 위해 좌측 input column에 라벨을 두고 DFF→좌측 라벨 사이를 명시적 wire로 연결한다.
  const ffNodeByOutput = new Map<string, GateNode>();
  for (const n of nodes) if (isFlipFlop(n.gate.type)) ffNodeByOutput.set(n.gate.output, n);
  const consumedByNonFF = new Set<string>();
  for (const g of diagram.gates) {
    if (isFlipFlop(g.type)) continue;
    for (const inp of g.inputs ?? []) consumedByNonFF.add(inp);
  }
  const feedbackSignals: string[] = [];
  for (const [out] of ffNodeByOutput) {
    if (consumedByNonFF.has(out)) feedbackSignals.push(out);
  }

  // 좌측 column: external inputs. CLK는 input column이 아닌 회로 하단 CLK bus 위치를 source로 사용
  // (CLK signal이 게이트 input과 FF clock pin 둘 다로 갈 때 라벨 중복 방지).
  // CLK 위치는 maxY 계산 후 별도 설정.
  // ★ 각 input별 source.x를 stagger — 입력 fanout wire의 vertical segment가 다른 input의 dot을
  //   가로질러 "입력끼리 연결된 듯" 보이는 현상 방지. dot/label은 x=60 고정, source point는 stub end.
  const INPUT_STUB_STEP = 18;
  diagram.inputs.forEach((input, i) => {
    if (input === "CLK") return; // 아래에서 CLK bus 위치로 별도 설정
    signalPos.set(input, { x: 60 + i * INPUT_STUB_STEP, y: 90 + i * 90 });
  });

  // 모든 gate 출력 위치 — FF 포함 (피드백은 DFF.Q 자체가 source)
  for (const node of nodes) {
    signalPos.set(node.gate.output, getGateOutputPoint(node));
  }

  // viewBox 자동 산정 — 모든 노드·신호·output terminal 포함
  // 피드백 신호별 소비자 핀 위치 수집 (자기 자신 외 비-FF 게이트 입력)
  const fbConsumers = new Map<string, Point[]>();
  for (const node of nodes) {
    if (isFlipFlop(node.gate.type)) continue;
    node.gate.inputs.forEach((sig, idx) => {
      if (!ffNodeByOutput.has(sig)) return;
      if (!consumedByNonFF.has(sig)) return;
      const p = getGateInputPoint(node, idx, node.gate.inputs.length);
      const list = fbConsumers.get(sig) ?? [];
      list.push(p);
      fbConsumers.set(sig, list);
    });
  }

  // 피드백 신호당 별도 trunk x — 두 신호가 같은 column에 겹치지 않도록.
  const FB_BUS_X_BASE = 24;
  const FB_BUS_X_STAGGER = 14;
  const FB_TOP_BASE_Y = 14;
  const FB_TOP_STAGGER = 16;
  const fbBusX = new Map<string, number>();
  const fbTopY = new Map<string, number>();
  feedbackSignals.forEach((sig, i) => {
    fbBusX.set(sig, FB_BUS_X_BASE + i * FB_BUS_X_STAGGER);
    fbTopY.set(sig, FB_TOP_BASE_Y + i * FB_TOP_STAGGER);
  });

  const inputYs = diagram.inputs
    .map((input, i) => (input === "CLK" ? null : 90 + i * 90))
    .filter((y): y is number => y !== null);
  const fbConsumerYs = [...fbConsumers.values()].flatMap((pts) => pts.map((p) => p.y));
  const outTerminalY = computeOutputTerminalYs(diagram.outputs, signalPos);
  const terminalRightX = (sig: string): number => (signalPos.get(sig)?.x ?? 0) + 80 + 60;
  const terminalRightY = (sig: string): number => outTerminalY.get(sig) ?? signalPos.get(sig)?.y ?? 0;
  const allXs = [
    ...nodes.map((n) => n.x + n.width + PIN_STUB + 12),
    ...diagram.outputs.map(terminalRightX),
  ];
  const allYs = [
    ...inputYs,
    ...fbConsumerYs,
    ...nodes.map((n) => n.y + n.height),
    ...diagram.outputs.map(terminalRightY),
  ];
  // 외부 output 라벨 위치 = (maxOutputSrcX + 60) + 12 + 텍스트 폭 약 30 = +102 여유
  const maxOutSrcX = Math.max(0, ...diagram.outputs.map((o) => signalPos.get(o)?.x ?? 0));
  const labelRightX = maxOutSrcX + 60 + 12 + 40; // endX + 12 + 텍스트 폭 여유 40
  const maxX = Math.max(900, ...allXs, labelRightX) + 20;
  // CLK bus는 회로 하단 — maxY를 30 추가 확보
  const maxY = Math.max(220, ...allYs) + 80;

  // CLK signal은 CLK bus 위치 (회로 하단)를 source로 사용 — 별도 input column 라벨 생략.
  if (diagram.inputs.includes("CLK")) {
    signalPos.set("CLK", { x: 60, y: maxY - 30 });
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${maxX}" height="${maxY}" viewBox="0 0 ${maxX} ${maxY}">`;

  // 게이트 bbox 목록 — wire와 게이트는 겹치지 않게(디지털 논리회로 node 규칙).
  // 모든 wire routing(feedback + 일반)이 이 obstacles 사용.
  //   · FF (DFF/TFF/JKFF): T·CLK 핀 stub이 좌측에 길게 뻗기 때문에 padding ↑로 wire 우회 거리 확보.
  //     padding 안 늘리면 multi-FF + feedback wire 환경에서 wire가 FF body 내부 y로 떨어지는 케이스 발생.
  const FF_OBSTACLE_PAD = 32;
  const obstacles: GateBox[] = nodes.map((n) => {
    const bubble = ["NOT", "NAND", "NOR", "XNOR"].includes(n.type) ? 10 : 0;
    const ffPad = isFlipFlop(n.type) ? FF_OBSTACLE_PAD : 0;
    return {
      x: n.x - ffPad,
      right: n.x + n.width + bubble + ffPad,
      top: n.y - ffPad,
      bottom: n.y + n.height + ffPad,
    };
  });

  // lane manager — node 연결 규칙 #3 "xlane·ylane 간격 분리".
  // feedback wire, 일반 wire, fanout trunk 모두 이 manager 공유로 충돌 회피.
  const yLanes = createYLaneManager();
  const xLanes = createXLaneManager();

  for (const input of diagram.inputs) {
    if (input === "CLK") continue; // CLK는 CLK bus가 라벨/source 역할
    const p = signalPos.get(input)!;
    svg += `<text x="30" y="${p.y + 5}" font-size="14">${escapeSvg(input)}</text>`;
    svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="black"/>`;
  }

  // 피드백 wire (Q_A, Q_B 등): FF Q 출력 → 각 소비자로 V-H-V 라우팅 (디지털 node 규칙 #1: 최단거리).
  //  · 게이트 박스 obstacle 회피 (규칙 #1: wire와 게이트 겹치지 않음)
  //  · ylane manager로 다른 wire와 horizontal channel 겹침 회피 (규칙 #3)
  //  · 같은 신호의 여러 소비자는 source에서 각자 wire, source에 분기점 dot (규칙 #4)
  // 피드백 wire는 회로 상단 전용 채널로 "위로 올려" 우회(over-the-top) + 수직 채널 distinct 분리.
  //  FF/게이트 body 비통과(규칙 #1) + riser·하강선이 신호마다 다른 x로 분리(규칙 #3 — xlane 간격).
  const fbRoutes = feedbackSignals
    .map((sig) => {
      const ff = ffNodeByOutput.get(sig);
      const consumers = fbConsumers.get(sig) ?? [];
      if (!ff || consumers.length === 0) return null;
      return { src: getGateOutputPoint(ff), consumers, topY: fbTopY.get(sig) ?? FB_TOP_BASE_Y };
    })
    .filter((r): r is { src: Point; consumers: Point[]; topY: number } => r !== null);
  svg += renderFeedbackWires(fbRoutes);

  const feedbackSet = new Set(feedbackSignals);
  const routes = buildSignalRoutes(diagram, nodes, signalPos, feedbackSet, true);

  // CLK 핀 라우팅 — 두 경로:
  //  (1) 외부 CLK bus: clockSignal 미지정 FF + CLK input을 받는 비-FF 게이트 → 회로 하단 CLK bus
  //  (2) 내부 clockSignal: FF.clockSignal이 지정된 경우, 그 신호 source에서 ▷ 핀으로 별도 wire
  //     (예: 임용 8번 — 게이트 출력 X가 D-FF CLK로 입력)
  const allFfNodes = nodes.filter((n) => isFlipFlop(n.gate.type));
  const extClkFFs = allFfNodes.filter((n) => !n.gate.clockSignal);
  const intClkFFs = allFfNodes.filter((n) => !!n.gate.clockSignal);
  // CLK input을 받는 비-FF 게이트의 input pin 위치 수집
  const clkGateConsumers: Point[] = [];
  for (const node of nodes) {
    if (isFlipFlop(node.gate.type)) continue;
    node.gate.inputs.forEach((sig, idx) => {
      if (sig === "CLK") {
        clkGateConsumers.push(getGateInputPoint(node, idx, node.gate.inputs.length));
      }
    });
  }
  // (1) 외부 CLK bus — extClkFFs 또는 clkGateConsumers가 있을 때만
  if (extClkFFs.length > 0 || clkGateConsumers.length > 0) {
    const clkBusY = maxY - 30;
    const clkStartX = 60;
    // CLK bus 우측 끝 — 가장 우측 FF의 CLK 핀 stub 끝(▷에서 좌측으로 stub 길이만큼)까지만.
    //   이전엔 box.x + 20 (box 안쪽까지)로 잡혀 CLK bus가 stub 합류 지점 넘어 box 옆까지 그어져 거슬렸음.
    const ffClkStubEnds = extClkFFs.map((n) =>
      n.x - getFfPinStub("clk", Math.max(1, n.gate.inputs?.length ?? 0))
    );
    const ffEndX = ffClkStubEnds.length > 0 ? Math.max(...ffClkStubEnds) : clkStartX;
    const consumerEndX = clkGateConsumers.length > 0 ? Math.max(...clkGateConsumers.map((p) => p.x)) : clkStartX;
    const clkEndX = Math.max(ffEndX, consumerEndX);
    svg += `<text x="30" y="${clkBusY + 5}" font-size="14">CLK</text>`;
    svg += `<circle cx="${clkStartX}" cy="${clkBusY}" r="3" fill="black"/>`;
    svg += `<path d="M ${clkStartX} ${clkBusY} L ${clkEndX} ${clkBusY}" stroke="black" fill="none" stroke-width="2"/>`;
    // FF clock pin stub (외부 CLK 사용 FF만) — ▷ 외부 stub end에서 진입.
    //  같은 컬럼의 FF는 clkPinX가 동일 → riser를 FF마다 그리면 같은 x에 중복(겹침).
    //  clkPinX별로 묶어 가장 위 핀까지 단일 수직선 하나만 그린다(중간 핀은 그 선이 관통하며 연결).
    const clkRiserTop = new Map<number, number>(); // clkPinX → 가장 위(min) clkPinY
    for (const ff of extClkFFs) {
      const clkPinX = ff.x - getFfPinStub("clk", ff.gate.inputs?.length ?? 0);
      const clkPinY = ff.y + ff.height - 6;
      clkRiserTop.set(clkPinX, Math.min(clkRiserTop.get(clkPinX) ?? Infinity, clkPinY));
    }
    for (const [clkPinX, topPinY] of clkRiserTop) {
      svg += `<path d="M ${clkPinX} ${clkBusY} L ${clkPinX} ${topPinY}" stroke="black" fill="none" stroke-width="2"/>`;
      svg += `<circle cx="${clkPinX}" cy="${clkBusY}" r="3" fill="black"/>`;
    }
    // CLK input을 받는 비-FF 게이트 stub
    for (const c of clkGateConsumers) {
      svg += `<path d="M ${c.x} ${clkBusY} L ${c.x} ${c.y}" stroke="black" fill="none" stroke-width="2"/>`;
      svg += `<circle cx="${c.x}" cy="${clkBusY}" r="3" fill="black"/>`;
    }
  }
  // (2) 내부 clockSignal — 각 FF별 명시적 V-H-V 라우팅 (FF 박스 아래 채널 우회).
  //  ▷ 핀에는 외부 stub이 있으므로 그 stub end (ff.x - PIN_STUB)에 wire 연결.
  //  여러 FF가 같은 채널을 쓸 수 있으므로 ffIdx별로 stagger.
  intClkFFs.forEach((ff, ffIdx) => {
    const clkSig = ff.gate.clockSignal!;
    const src = signalPos.get(clkSig);
    if (!src) return;
    const ffInputCount = ff.gate.inputs?.length ?? 0;
    const pinX = ff.x - getFfPinStub("clk", ffInputCount); // ▷ 핀 외부 stub end (입력보다 더 길게 분리)
    const pinY = ff.y + ff.height - 6;
    // FF 박스 아래 채널 (다른 wire와 안 겹치도록 yLane 할당)
    const naturalChannelY = ff.y + ff.height + 16 + ffIdx * 8;
    const channelY = yLanes ? yLanes.assign(naturalChannelY) : naturalChannelY;
    // source 분기점 dot (signal이 ▷ 핀과 다른 곳 둘 다로 가는 경우 분기점 표시)
    svg += `<circle cx="${src.x}" cy="${src.y}" r="3" fill="black"/>`;
    svg += `<path d="M ${src.x} ${src.y} L ${src.x} ${channelY} L ${pinX} ${channelY} L ${pinX} ${pinY}" stroke="black" fill="none" stroke-width="2"/>`;
    // (▷ 핀 stub end 옆 라벨은 renderFlipFlopPinLabels에서 표기 — 여기서는 채널 라벨 생략)
  });
  // obstacles + lanes는 위에서 이미 정의됨 (feedback wire에도 동일 사용)
  svg += routeLogicWires(routes, obstacles, yLanes, xLanes);

  // 사용되는 신호 set: 다른 gate의 inputs 또는 diagram.outputs
  const usedSignals = new Set<string>();
  for (const g of diagram.gates) {
    for (const inp of g.inputs ?? []) usedSignals.add(inp);
  }
  for (const o of diagram.outputs) usedSignals.add(o);

  // blank lookup — gate.id → 전체-치환 / pinIndex별 핀 빈칸
  const blankIdx = buildBlankMap(diagram.blanks ?? []);
  for (const node of nodes) {
    svg += renderGateNode(node, blankIdx);
    svg += renderGatePins(node, usedSignals, diagram.signalLabels);
    // MUX의 경우 핀 옆 신호 라벨(또는 ㄱ/ㄴ/ㄷ/ㄹ 빈칸 박스)을 추가로 그린다.
    // 단, gate 전체가 whole-blank로 치환된 경우는 핀 라벨 생략.
    if (isMux(node.type) && !blankIdx.whole.has(node.gate.id)) {
      svg += renderMuxPinLabels(node, blankIdx.pinBlanks.get(node.gate.id));
    }
    // FF의 D/R/CLK stub end 옆에 입력 신호명 hint — 학생이 핀별 입력 신호를 분간 가능.
    if (isFlipFlop(node.gate.type) && !blankIdx.whole.has(node.gate.id)) {
      svg += renderFlipFlopPinLabels(node);
    }
  }

  // 점선 박스 영역 (임용 5번 [단계 3]) — 지정 게이트 묶음을 dashed rect로 감싸고 라벨.
  //   게이트는 그대로 보이며, 학생은 점선 영역의 게이트 종류를 도출(식별)한다.
  for (const region of diagram.dashedRegions ?? []) {
    const rnodes = nodes.filter((n) => region.gateIds.includes(n.gate.id));
    if (rnodes.length === 0) continue;
    const pad = 16;
    const x1 = Math.min(...rnodes.map((n) => n.x)) - pad;
    const y1 = Math.min(...rnodes.map((n) => n.y)) - pad;
    const x2 = Math.max(...rnodes.map((n) => n.x + n.width)) + pad;
    const y2 = Math.max(...rnodes.map((n) => n.y + n.height)) + pad;
    svg += `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="#9333ea" stroke-width="1.8" stroke-dasharray="6,4" rx="8"/>`;
    if (region.label) {
      svg += `<text x="${x1 + 6}" y="${y1 - 5}" font-size="14" font-weight="700" fill="#9333ea">${escapeSvg(region.label)}</text>`;
    }
  }

  // 외부 출력 라벨 — buildSignalRoutes의 outputEndX·종단 y와 동일 위치 (라벨/wire 정확히 닿음).
  //   같은 행 다중 출력은 computeOutputTerminalYs로 세로 분리(라우팅과 동일 좌표).
  const labelEndX = Math.max(0, ...diagram.outputs.map((o) => signalPos.get(o)?.x ?? 0)) + 60;
  const labelTermY = computeOutputTerminalYs(diagram.outputs, signalPos);
  for (const output of diagram.outputs) {
    const p = signalPos.get(output);
    if (!p) continue;
    svg += `<text x="${labelEndX + 12}" y="${(labelTermY.get(output) ?? p.y) + 5}" font-size="14">${escapeSvg(output)}</text>`;
  }

  // signalLabels — 중간 wire의 식별용 라벨 (외부 단자 X, 게이트 위쪽에 작은 텍스트).
  //   { "X": "X", "Y": "Y" }처럼 signalName → 표시 라벨 매핑. 게이트 위 (gate.y - 6)에 표기.
  const nodeByOutput = new Map<string, GateNode>();
  for (const n of nodes) nodeByOutput.set(n.gate.output, n);
  for (const [sig, label] of Object.entries(diagram.signalLabels ?? {})) {
    const node = nodeByOutput.get(sig);
    if (!node) continue;
    svg += `<text x="${node.x + node.width / 2}" y="${node.y - 6}" text-anchor="middle" font-size="13" fill="#1e40af" font-weight="700">${escapeSvg(label)}</text>`;
  }

  svg += `</svg>`;
  return svg;
}

// =====================================================================
// Levelize / Layout
// =====================================================================
function levelizeLogicGates(diagram: LogicNetworkDiagram): LogicGate[][] {
  // ★ FF별 staged 배치 — [FF_k의 D 게이트들] → FF_k → [FF_{k+1}의 D 게이트들] → FF_{k+1} ...
  //   (예: D0 게이트들이 D1(FF1) 뒤·D0(FF0) 앞 column에 오도록). 공유 게이트는 먼저 나온 FF에 배치.
  //   조합전용 회로는 기존처럼 의존성 levelize.
  const ffGates = diagram.gates.filter((g) => isFlipFlop(g.type));
  const combGates = diagram.gates.filter((g) => !isFlipFlop(g.type));
  const ffOutputs = new Set(ffGates.map((g) => g.output));
  const gateByOutput = new Map<string, LogicGate>(combGates.map((g) => [g.output, g]));
  // FF Q 출력은 초기 produced (규칙 #11 cycle-breaker).
  const produced = new Set<string>([...diagram.inputs, ...ffOutputs]);
  const placed = new Set<string>();
  const levels: LogicGate[][] = [];

  /** target 신호들이 (전이적으로) 의존하는 아직 안 놓인 조합게이트를 dependency-levelize해 columns 추가. */
  const placeGatesFor = (targets: string[]) => {
    const need = new Set<string>();
    const stack = [...targets];
    while (stack.length) {
      const s = stack.pop()!;
      const g = gateByOutput.get(s);
      if (!g || placed.has(g.id) || need.has(g.id)) continue;
      need.add(g.id);
      for (const inp of g.inputs) stack.push(inp);
    }
    const rem = combGates.filter((g) => need.has(g.id) && !placed.has(g.id));
    let guard = 0;
    while (rem.length && guard++ < 300) {
      const level: LogicGate[] = [];
      for (let i = rem.length - 1; i >= 0; i--) {
        const g = rem[i];
        if (g.inputs.every((x) => produced.has(x))) {
          level.push(g); produced.add(g.output); placed.add(g.id); rem.splice(i, 1);
        }
      }
      if (!level.length) break;
      levels.push(level.reverse());
    }
  };

  // FF 순서 — 다른 FF.output에 의존하는 FF는 나중 (간단 위상정렬; 병렬이면 diagram 순서).
  const ffOrder: LogicGate[] = [];
  const ffRem = [...ffGates];
  const ffDone = new Set<string>();
  let g2 = 0;
  while (ffRem.length && g2++ < 100) {
    const idx = ffRem.findIndex((ff) => {
      const deps = [...ff.inputs, ...(ff.clockSignal ? [ff.clockSignal] : [])];
      return !deps.some((d) => d !== ff.output && ffOutputs.has(d) && !ffDone.has(d));
    });
    if (idx < 0) { ffOrder.push(...ffRem); ffRem.length = 0; break; }
    const [ff] = ffRem.splice(idx, 1);
    ffOrder.push(ff); ffDone.add(ff.output);
  }

  // staged: 각 FF의 D 게이트 → 그 FF (개별 column → 수평 배열)
  for (const ff of ffOrder) {
    placeGatesFor([...ff.inputs, ...(ff.clockSignal ? [ff.clockSignal] : [])]);
    levels.push([ff]);
    produced.add(ff.output);
  }
  // 외부 output으로 가는 조합게이트 + 남은 게이트 (조합전용 회로 포함) 마무리.
  placeGatesFor(diagram.outputs ?? []);
  const leftover = combGates.filter((g) => !placed.has(g.id));
  if (leftover.length) {
    placeGatesFor(leftover.map((g) => g.output));
    // 그래도 남으면(cycle/누락) 드롭하지 말고 한 level에.
    const stillLeft = combGates.filter((g) => !placed.has(g.id));
    if (stillLeft.length) levels.push(stillLeft);
  }
  return levels.filter((l) => l.length);
}

function layoutLogicGates(levels: LogicGate[][]): GateNode[] {
  const nodes: GateNode[] = [];
  const baseX = 180;
  const levelGap = 138;
  const rowGap = 144;   // 게이트 크기 축소에 맞춰 행 간격도 비례 축소 (겹침 방지 유지)

  levels.forEach((level, li) => {
    level.forEach((gate, ri) => {
      let width = 44;   // 게이트 박스 추가 축소 (사용자 요청). wire 간격(per-input 32)은 유지.
      let height: number;
      if (isMux(gate.type)) {
        width = 56;
        height = 64;
      } else if (isFlipFlop(gate.type)) {
        width = 50;
        height = 58;
      } else {
        const inputCount = Math.max(1, gate.inputs.length);
        // ★ per-input 32 = 입력 wire 간격 그대로 유지. base/min만 줄여 박스 축소.
        height = Math.max(44, inputCount * 32 + 14);
      }
      nodes.push({
        id: gate.id,
        type: gate.type,
        gate,
        x: baseX + li * levelGap,
        y: 90 + ri * rowGap,
        width,
        height,
      });
    });
  });
  return nodes;
}

// =====================================================================
// Pin coords — 게이트 body 외부에 stub 길이만큼 떨어진 endpoint 반환
// =====================================================================
const PIN_STUB = 12;

/**
 * FF 핀별 stub 길이 — 모든 FF(DFF/TFF/JKFF/추후 SRFF 등)에 범용 적용.
 * 입력 핀들과 CLK 핀이 같은 vertical x에 정렬되지 않도록 핀별로 길이 분리.
 *  · 입력 idx N (D/T/J/K/R 등) : PIN_STUB + N · FF_STUB_STEP
 *  · CLK (▷)                   : PIN_STUB + (inputCount + 1) · FF_STUB_STEP  (가장 긴 stub)
 * 학생이 wire가 어느 핀으로 들어가는지 분간 가능. (#3 규칙: xlane 분리)
 *
 * 예) D-FF + R (2-input): D=12, R=26, CLK=54
 *     JK-FF (2-input)   : J=12, K=26, CLK=54
 *     D-FF (1-input)    : D=12, CLK=40
 *     SRFF (2-input)    : S=12, R=26, CLK=54
 */
const FF_STUB_STEP = 20;
function getFfPinStub(role: number | "clk", inputCount: number): number {
  if (role === "clk") return PIN_STUB + (inputCount + 1) * FF_STUB_STEP;
  return PIN_STUB + role * FF_STUB_STEP;
}

/**
 * 2×1 MUX 핀 매핑 (inputs = [I0, I1, S]):
 *  - I0 (idx=0): 좌측 상단
 *  - I1 (idx=1): 좌측 하단
 *  - S  (idx=2): 하단 중앙 (select)
 */
function isMux(type: string): boolean {
  return type === "MUX";
}

function getGateInputPoint(node: GateNode, idx: number, count: number): Point {
  if (isMux(node.type)) {
    if (idx === 2) {
      // S — 하단 중앙
      return { x: node.x + node.width / 2, y: node.y + node.height + PIN_STUB };
    }
    // I0, I1 — 좌측 (상/하)
    const gap = node.height / 3;
    return { x: node.x - PIN_STUB, y: node.y + gap * (idx + 1) };
  }
  // FF는 핀별로 다른 stub 길이로 분리 (xlane 분리, #3 규칙)
  if (isFlipFlop(node.type)) {
    const stub = getFfPinStub(idx, count);
    const gap = node.height / (count + 1);
    return { x: node.x - stub, y: node.y + gap * (idx + 1) };
  }
  const gap = node.height / (count + 1);
  return { x: node.x - gateInputStub(idx, count), y: node.y + gap * (idx + 1) };
}

/** 일반 게이트 입력 stub — 핀별로 길이를 stagger해 입력 wire의 vertical jog가 서로 다른 x에
 *  오게 한다 (입력 wire가 겹쳐 어느 게 어느 입력인지 모호한 문제 방지). */
function gateInputStub(idx: number, count: number): number {
  // 가운데에서 멀수록 길게 — 바깥 입력 wire가 안쪽 핀 stub을 가로지르지 않게.
  return PIN_STUB + Math.abs(idx - (count - 1) / 2) * 18;
}

function getGateOutputPoint(node: GateNode): Point {
  const bubble = ["NOT", "NAND", "NOR", "XNOR"].includes(node.type);
  const bodyRight = node.x + node.width + (bubble ? 10 : 0);
  return { x: bodyRight + PIN_STUB, y: node.y + node.height / 2 };
}

/** 게이트 body와 pin endpoint 사이의 stub 라인 + endpoint dot.
 *  output 신호가 어디에도 사용되지 않으면(usedSignals에 없으면) output 핀 stub은 그리지 않음 → dangling 방지.
 *  MUX의 경우 좌측 두 핀(I0, I1) + 하단 한 핀(S)으로 분리 처리.
 */
function renderGatePins(node: GateNode, usedSignals?: Set<string>, signalLabels?: Record<string, string>): string {
  const inputCount = Math.max(1, node.gate.inputs?.length ?? 0);
  let svg = "";

  if (isMux(node.type)) {
    // I0, I1 — 좌측 stub
    const gap = node.height / 3;
    for (let i = 0; i < 2; i++) {
      const py = node.y + gap * (i + 1);
      const startX = node.x - PIN_STUB;
      svg += `<path d="M ${startX} ${py} L ${node.x} ${py}" stroke="black" fill="none" stroke-width="2"/>`;
      svg += `<circle cx="${startX}" cy="${py}" r="2" fill="black"/>`;
    }
    // S — 하단 stub (있을 때만)
    if (inputCount >= 3) {
      const sx = node.x + node.width / 2;
      const sy = node.y + node.height;
      const sEnd = sy + PIN_STUB;
      svg += `<path d="M ${sx} ${sy} L ${sx} ${sEnd}" stroke="black" fill="none" stroke-width="2"/>`;
      svg += `<circle cx="${sx}" cy="${sEnd}" r="2" fill="black"/>`;
    }
  } else if (isFlipFlop(node.type)) {
    // FF는 입력 핀별 stub 길이 다르게 (idx별 분리) — xlane 분리
    const gap = node.height / (inputCount + 1);
    for (let i = 0; i < inputCount; i++) {
      const py = node.y + gap * (i + 1);
      const stub = getFfPinStub(i, inputCount);
      const startX = node.x - stub;
      svg += `<path d="M ${startX} ${py} L ${node.x} ${py}" stroke="black" fill="none" stroke-width="2"/>`;
      svg += `<circle cx="${startX}" cy="${py}" r="2" fill="black"/>`;
    }
  } else {
    const gap = node.height / (inputCount + 1);
    const inputs = node.gate.inputs ?? [];
    for (let i = 0; i < inputCount; i++) {
      const py = node.y + gap * (i + 1);
      const startX = node.x - gateInputStub(i, inputCount);
      svg += `<path d="M ${startX} ${py} L ${node.x} ${py}" stroke="black" fill="none" stroke-width="2"/>`;
      svg += `<circle cx="${startX}" cy="${py}" r="2" fill="black"/>`;
      // 입력 신호 이름 라벨 — 2입력 이상 게이트. signalLabels(예 Y) 우선, 없으면 기본 변수(A/B/C·보수)만.
      //   내부 게이트 출력(and1 등, 라벨 없음)은 생략해 clutter 방지.
      if (inputCount >= 2 && inputs[i]) {
        const sig = inputs[i];
        const labeled = signalLabels?.[sig];
        const isPrimary = /^[A-Za-z](_n)?$/.test(sig);
        const text = labeled ?? (isPrimary ? formatSignalLabel(sig) : "");
        if (text) {
          svg += `<text x="${startX + 4}" y="${py - 4}" font-size="10" fill="#1e3a8a">${escapeSvg(text)}</text>`;
        }
      }
    }
  }

  // 출력 핀 (오른쪽) — 사용되는 신호일 때만
  const used = !usedSignals || usedSignals.has(node.gate.output);
  if (used) {
    const bubble = ["NOT", "NAND", "NOR", "XNOR"].includes(node.type);
    const bodyRight = node.x + node.width + (bubble ? 10 : 0);
    const oy = node.y + node.height / 2;
    const pinEnd = bodyRight + PIN_STUB;
    svg += `<path d="M ${bodyRight} ${oy} L ${pinEnd} ${oy}" stroke="black" fill="none" stroke-width="2"/>`;
    svg += `<circle cx="${pinEnd}" cy="${oy}" r="2" fill="black"/>`;
  }

  return svg;
}

// =====================================================================
// Wires + Fanout routing
// =====================================================================
type SignalRoute = {
  signal: string;
  source: Point;
  destinations: Point[];
};

/** wire 라우팅 시 회피해야 할 게이트 bbox */
type GateBox = { x: number; right: number; top: number; bottom: number };

/**
 * 어떤 x값이 obstacle 안에 들어가면 가장 가까운 외부 channel로 snap.
 * 우선순위: 왼쪽 가장자리(목표 가까움) → 오른쪽 가장자리.
 */
function findFreeX(targetX: number, obstacles: GateBox[], padding = 6): number {
  let result = targetX;
  for (let iter = 0; iter < 4; iter++) {
    let changed = false;
    for (const o of obstacles) {
      if (result >= o.x - padding && result <= o.right + padding) {
        const leftAlt = o.x - padding;
        const rightAlt = o.right + padding;
        result = Math.abs(leftAlt - targetX) <= Math.abs(rightAlt - targetX) ? leftAlt : rightAlt;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

/**
 * 어떤 y값이 xRange와 겹치는 obstacle의 y-range 안에 들어가면 row gap으로 snap.
 * xRange와 겹치지 않는 obstacle은 무시.
 */
function findFreeY(targetY: number, obstacles: GateBox[], xRange: [number, number], padding = 6): number {
  let result = targetY;
  for (let iter = 0; iter < 6; iter++) {
    let changed = false;
    for (const o of obstacles) {
      // x range가 겹치지 않으면 무시
      if (o.right < xRange[0] - padding || o.x > xRange[1] + padding) continue;
      if (result >= o.top - padding && result <= o.bottom + padding) {
        const topAlt = o.top - padding;
        const botAlt = o.bottom + padding;
        result = Math.abs(topAlt - targetY) <= Math.abs(botAlt - targetY) ? topAlt : botAlt;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

/** segment(a→b)가 어떤 obstacle을 가로지르는지. xRange/yRange 둘 다 겹쳐야 가로지름. */
function horizontalCrossesAny(y: number, x1: number, x2: number, obstacles: GateBox[], padding = 4): boolean {
  const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
  return obstacles.some((o) =>
    o.right >= lo - padding && o.x <= hi + padding &&
    y >= o.top - padding && y <= o.bottom + padding,
  );
}

/**
 * 외부 output 단자의 y 좌표 — 여러 출력이 같은 행(source y 근접)에 놓이면 라벨·배선이 우측
 * 한 점에 겹친다(예: JK 동기식 카운터의 Q2·Q1·Q0가 같은 행 FF들). source y 기준 정렬 후
 * MIN_GAP 미만으로 붙은 출력만 아래로 밀어 분리한다. 충분히 떨어진 출력은 source y 그대로
 * (단일/분리 출력 archetype 무영향). 라벨·배선·viewBox 세 곳이 이 함수를 공유해 일치시킨다.
 */
function computeOutputTerminalYs(
  outputs: string[],
  signalPos: Map<string, Point>,
): Map<string, number> {
  const MIN_GAP = 28;
  const entries = outputs
    .map((o) => ({ o, y: signalPos.get(o)?.y }))
    .filter((e): e is { o: string; y: number } => typeof e.y === "number")
    .sort((a, b) => a.y - b.y);
  const result = new Map<string, number>();
  let prevY = -Infinity;
  for (const e of entries) {
    const y = e.y - prevY < MIN_GAP ? prevY + MIN_GAP : e.y;
    result.set(e.o, y);
    prevY = y;
  }
  return result;
}

/** diagram + nodes + signalPos → SignalRoute[]. gate inputs와 외부 output 모두 destination에 포함. */
function buildSignalRoutes(
  diagram: LogicNetworkDiagram,
  nodes: GateNode[],
  signalPos: Map<string, Point>,
  feedbackSignals: Set<string> = new Set(),
  skipFeedbackConsumers = false,
): SignalRoute[] {
  const sigToDsts = new Map<string, Point[]>();
  for (const node of nodes) {
    node.gate.inputs.forEach((sig, idx) => {
      // CLK는 CLK bus가 직접 처리 — 일반 라우팅 제외 (두 wire 중복 방지)
      if (sig === "CLK") return;
      // 피드백 신호 소비자는 별도 manual 라우팅 — 일반 라우팅에서 제외
      if (skipFeedbackConsumers && feedbackSignals.has(sig) && !isFlipFlop(node.gate.type)) return;
      const dst = getGateInputPoint(node, idx, node.gate.inputs.length);
      const list = sigToDsts.get(sig) ?? [];
      list.push(dst);
      sigToDsts.set(sig, list);
    });
  }
  // 외부 output destination — 가장 우측 output source x + 60에 통일 (라벨끼리 align, 회로와 너무 멀지 않게).
  const maxOutputSrcX = Math.max(0, ...diagram.outputs.map((o) => signalPos.get(o)?.x ?? 0));
  const outputEndX = maxOutputSrcX + 60;
  const outTermY = computeOutputTerminalYs(diagram.outputs, signalPos);
  for (const out of diagram.outputs) {
    const src = signalPos.get(out);
    if (!src) continue;
    const list = sigToDsts.get(out) ?? [];
    list.push({ x: outputEndX, y: outTermY.get(out) ?? src.y });
    sigToDsts.set(out, list);
  }
  const routes: SignalRoute[] = [];
  for (const [sig, dsts] of sigToDsts) {
    const source = signalPos.get(sig);
    if (!source) continue;
    routes.push({ signal: sig, source, destinations: dsts });
  }
  return routes;
}

const TRUNK_STAGGER = 32; // 같은 source.x 그룹 내에서 trunk 간 lane 간격 (시각적 분리)
const Y_LANE_STEP = 36;   // ylane(수평 wire 채널) 최소 간격 — wire-wire 시각적 분리

/**
 * Wire lane manager — node 연결 규칙 #3 "xlane·ylane 간격 분리".
 *  각 wire의 채널 좌표(horizontal=y, vertical=x)를 unique하게 할당.
 *  natural 좌표 주변에서 이미 사용 중이면 step 단위 alternate shift로 회피.
 *  yLane: horizontal channel y (Y_LANE_STEP=36 간격)
 *  xLane: fanout trunk x / vertical channel x (TRUNK_STAGGER=32 간격)
 */
function createLaneManager(step: number) {
  const used: number[] = [];
  return {
    assign(natural: number): number {
      for (let i = 0; i <= 40; i++) {
        const sign = i % 2 === 0 ? 1 : -1;
        const offset = Math.ceil(i / 2) * step * sign;
        const v = natural + offset;
        if (!used.some((u) => Math.abs(u - v) < step)) {
          used.push(v);
          return v;
        }
      }
      used.push(natural);
      return natural;
    },
  };
}
function createYLaneManager() { return createLaneManager(Y_LANE_STEP); }
function createXLaneManager() { return createLaneManager(TRUNK_STAGGER); }
type LaneManager = ReturnType<typeof createLaneManager>;
type YLaneManager = LaneManager;
type XLaneManager = LaneManager;

/** 신호당 destination 1개 → orthogonal direct, 2개 이상 → trunk + branch + dot */
function routeLogicWires(
  routes: SignalRoute[],
  obstacles: GateBox[] = [],
  lanes?: YLaneManager,
  xLanes?: XLaneManager,
): string {
  // 모든 라우트(fanout + single)에 source.x 그룹 인덱스 stagger 부여 — vertical/horizontal 채널 충돌 방지
  const xGroupOrder = new Map<number, number[]>();
  routes.forEach((r, i) => {
    const x = Math.round(r.source.x);
    if (!xGroupOrder.has(x)) xGroupOrder.set(x, []);
    xGroupOrder.get(x)!.push(i);
  });
  const staggerByRouteIdx = new Map<number, number>();
  for (const [, idxs] of xGroupOrder) {
    idxs.forEach((rIdx, i) => staggerByRouteIdx.set(rIdx, i * TRUNK_STAGGER));
  }

  // 동일 source point(정확한 좌표)에서 두 개 이상 route가 시작하면 source 분기 dot 표시.
  //  · single-dest wire라도 같은 source에서 다른 wire가 시작하면 visually 분기점 표시 필요.
  const sourcePointFreq = new Map<string, number>();
  for (const r of routes) {
    const key = `${Math.round(r.source.x)},${Math.round(r.source.y)}`;
    sourcePointFreq.set(key, (sourcePointFreq.get(key) ?? 0) + 1);
  }

  let svg = "";
  const dottedSources = new Set<string>();
  routes.forEach((route, i) => {
    if (route.destinations.length === 0) return;
    const stagger = staggerByRouteIdx.get(i) ?? 0;
    if (route.destinations.length === 1) {
      svg += orthogonalWire(route.source, route.destinations[0], obstacles, stagger, lanes, xLanes);
    } else {
      svg += renderFanoutRoute(route, obstacles, stagger, xLanes);
    }
    // 분기점 dot
    const srcKey = `${Math.round(route.source.x)},${Math.round(route.source.y)}`;
    if ((sourcePointFreq.get(srcKey) ?? 0) > 1 && !dottedSources.has(srcKey)) {
      svg += `<circle cx="${route.source.x}" cy="${route.source.y}" r="3.5" fill="black"/>`;
      dottedSources.add(srcKey);
    }
  });
  return svg;
}

function renderFanoutRoute(
  route: SignalRoute,
  obstacles: GateBox[] = [],
  stagger = 0,
  xLanes?: XLaneManager,
): string {
  const { source, destinations } = route;
  const minTargetX = Math.min(...destinations.map((d) => d.x));
  // trunkX — source 우측 + stagger 기반, 단 destination 직전까지 capped (wire가 destination을 지나가지 않도록).
  // xLane manager로 wire-wire trunk 충돌 방지 (#3 규칙).
  const naturalTrunkX = Math.min(source.x + 40 + stagger, minTargetX - 16);
  let trunkX = xLanes ? xLanes.assign(naturalTrunkX) : naturalTrunkX;
  trunkX = findFreeX(trunkX, obstacles);
  const yMin = Math.min(source.y, ...destinations.map((d) => d.y));
  const yMax = Math.max(source.y, ...destinations.map((d) => d.y));

  let svg = "";
  // source → trunk 입구 (이 horizontal도 게이트 회피)
  if (!horizontalCrossesAny(source.y, source.x, trunkX, obstacles)) {
    svg += line(source, { x: trunkX, y: source.y });
  } else {
    const detourY = findFreeY(source.y, obstacles, [source.x, trunkX]);
    svg += `<path d="M ${source.x} ${source.y} L ${source.x} ${detourY} L ${trunkX} ${detourY} L ${trunkX} ${source.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  // 수직 trunk
  svg += line({ x: trunkX, y: yMin }, { x: trunkX, y: yMax });

  // source-side T-junction dot — source.y가 trunk 내부에 있으면 분기점
  const eps = 0.5;
  if (source.y > yMin + eps && source.y < yMax - eps) {
    svg += dot({ x: trunkX, y: source.y });
  }

  // 각 destination으로 분기 + junction dot
  for (const dst of destinations) {
    if (!horizontalCrossesAny(dst.y, trunkX, dst.x, obstacles)) {
      svg += line({ x: trunkX, y: dst.y }, dst);
    } else {
      const detourY = findFreeY(dst.y, obstacles, [trunkX, dst.x]);
      svg += `<path d="M ${trunkX} ${dst.y} L ${trunkX} ${detourY} L ${dst.x} ${detourY} L ${dst.x} ${dst.y}" stroke="black" fill="none" stroke-width="2"/>`;
    }
    if (dst.y > yMin + eps && dst.y < yMax - eps) {
      svg += dot({ x: trunkX, y: dst.y });
    }
  }
  return svg;
}

const FB_RISER_STEP = 16;   // FF 출력 riser 간 수직 채널 간격 (우측으로 stagger)
const FB_DESCENT_STEP = 16; // 소비자 하강 수직 채널 간격 (핀 좌측으로 stagger)

/**
 * 피드백 신호 라우팅 — 상단 전용 채널 우회(over-the-top) + 수직 채널 distinct 분리.
 *
 *  · FF Q 출력 → 우측으로 살짝 비킨 riser(신호마다 다른 x) → 상단 trunk(topY) → 소비자 위에서 하강 → 핀.
 *  · 상단 trunk(topY≈14~)는 모든 게이트(y≥90)보다 위 → 어떤 body도 비통과(규칙 #1).
 *  · riser는 FF 우측에 신호별 distinct x, 하강선은 핀 좌측에 distinct x(전 신호 통합 stagger) →
 *    두 수직선이 같은 x에 겹치지 않음(규칙 #3 — xlane 간격).
 *  · 하강 채널은 소비자 y 오름차순(위쪽 핀이 핀에 더 가까운 채널)으로 배정 → 아래 소비자의 수평
 *    진입선이 위쪽 수직선을 관통하지 않는다.
 */
function renderFeedbackWires(routes: { src: Point; consumers: Point[]; topY: number }[]): string {
  let svg = "";
  // 하강(descent) 채널을 각 소비자 핀 "바로 좌측"(국소)에 둔다.
  //   ★ 이전엔 전역 minPinX 기준으로 모든 하강선을 한 곳(최좌측 게이트 D_1 입력부)에 몰아
  //     수직선이 겹치고, 우측 소비자로의 수평 진입선이 회로를 길게 가로질렀다.
  //   국소 하강 → 신호별 하강선이 자기 소비자 근처로 분산, 수평 진입선도 짧아진다.
  //   같은 핀 근처(8px 버킷)로 모이는 소비자들만 작은 stagger로 분리(규칙 #3).
  const all = routes.flatMap((r, ri) => r.consumers.map((c) => ({ c, ri })));
  if (all.length === 0) return svg;
  all.sort((a, b) => a.c.x - b.c.x || a.c.y - b.c.y);
  const bucketCount = new Map<number, number>();
  const descentX = new Map<string, number>();
  for (const { c, ri } of all) {
    const bucket = Math.round(c.x / 8);
    const k = bucketCount.get(bucket) ?? 0;
    bucketCount.set(bucket, k + 1);
    descentX.set(`${ri}:${c.x}:${c.y}`, c.x - PIN_STUB - 6 - k * FB_DESCENT_STEP);
  }

  routes.forEach(({ src, consumers, topY }, ri) => {
    // riser — FF 출력 우측 채널(신호별 distinct), 짧은 수평 jog 후 상단으로.
    const riserX = src.x + 10 + ri * FB_RISER_STEP;
    svg += `<circle cx="${src.x}" cy="${src.y}" r="3.5" fill="black"/>`;
    svg += line(src, { x: riserX, y: src.y });
    svg += line({ x: riserX, y: src.y }, { x: riserX, y: topY });
    const dxs = consumers.map((c) => descentX.get(`${ri}:${c.x}:${c.y}`)!);
    const minX = Math.min(riserX, ...dxs);
    const maxX = Math.max(riserX, ...dxs);
    svg += line({ x: minX, y: topY }, { x: maxX, y: topY }); // 상단 trunk
    consumers.forEach((c) => {
      const dx = descentX.get(`${ri}:${c.x}:${c.y}`)!;
      svg += line({ x: dx, y: topY }, { x: dx, y: c.y }); // 하강
      svg += line({ x: dx, y: c.y }, c);                  // 핀으로 수평 진입
      svg += dot({ x: dx, y: topY });
    });
    if (riserX > minX + 0.5 && riserX < maxX - 0.5) svg += dot({ x: riserX, y: topY });
  });
  return svg;
}

function orthogonalWire(
  a: Point,
  b: Point,
  obstacles: GateBox[] = [],
  stagger = 0,
  lanes?: YLaneManager,
  _xLanes?: XLaneManager,
): string {
  // 같은 y → 직선이지만 다른 wire와 같은 lane이면 살짝 shift (lane manager로 분산).
  if (Math.abs(a.y - b.y) < 1) {
    const yChan = lanes ? lanes.assign(a.y) : a.y;
    if (Math.abs(yChan - a.y) < 1) {
      // lane이 그대로 → 직선 사용. 단 obstacle 가로지르면 Z-detour.
      if (!horizontalCrossesAny(a.y, a.x, b.x, obstacles)) return line(a, b);
      const naturalDetour = a.y + (stagger > 0 ? stagger : 30);
      let detourY = findFreeY(naturalDetour, obstacles, [Math.min(a.x, b.x), Math.max(a.x, b.x)]);
      if (lanes) detourY = lanes.assign(detourY);
      if (Math.abs(detourY - a.y) > 80) return line(a, b);
      return `<path d="M ${a.x} ${a.y} L ${a.x} ${detourY} L ${b.x} ${detourY} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
    }
    // lane이 shift됨 → V-H-V로 우회 (양 끝 stub 짧게)
    return `<path d="M ${a.x} ${a.y} L ${a.x} ${yChan} L ${b.x} ${yChan} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }
  // 같은 x → 직선
  if (Math.abs(a.x - b.x) < 1) return line(a, b);

  // 단일 L-bend 우선 (H 먼저, V 뒤) — 최단거리·최소 굴절. obstacle 가로지르지 않을 때만.
  //   wire 신호 흐름이 좌→우(a.x < b.x)인 경우 H 먼저가 자연스럽다.
  const xRange: [number, number] = [Math.min(a.x, b.x), Math.max(a.x, b.x)];
  if (!horizontalCrossesAny(a.y, a.x, b.x, obstacles)) {
    return `<path d="M ${a.x} ${a.y} L ${b.x} ${a.y} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
  }

  // H 라인이 막히면 V-H-V로 우회: midY를 row gap으로 snap, stagger로 horizontal channel 분산, lane으로 wire-wire 겹침 회피
  const naturalMidY = (a.y + b.y) / 2 + stagger;
  let midY = findFreeY(naturalMidY, obstacles, xRange);
  if (lanes) midY = lanes.assign(midY);
  return `<path d="M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
}

function line(a: Point, b: Point): string {
  return `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke="black" fill="none" stroke-width="2"/>`;
}

function dot(p: Point): string {
  return `<circle cx="${p.x}" cy="${p.y}" r="4" fill="black"/>`;
}

// =====================================================================
// Blank handling — 두 종류:
//  · gate 전체 치환 (pinIndex 미정의) → 박스 + symbol (기존)
//  · 입력 핀별 치환 (pinIndex 정의)   → 해당 핀 라벨을 symbol로 표시 (MUX의 ㄱ/ㄴ/ㄷ/ㄹ)
// =====================================================================
type BlankIndex = {
  /** gateId → 전체-치환 blank (pinIndex 미정의 한 개만) */
  whole: Map<string, LogicBlank>;
  /** gateId → pinIndex별 blank */
  pinBlanks: Map<string, Map<number, LogicBlank>>;
};

function buildBlankMap(blanks: LogicBlank[] = []): BlankIndex {
  const whole = new Map<string, LogicBlank>();
  const pinBlanks = new Map<string, Map<number, LogicBlank>>();
  for (const blank of blanks) {
    for (const gateId of blank.gateIds) {
      if (blank.pinIndex == null) {
        whole.set(gateId, blank);
      } else {
        const inner = pinBlanks.get(gateId) ?? new Map<number, LogicBlank>();
        inner.set(blank.pinIndex, blank);
        pinBlanks.set(gateId, inner);
      }
    }
  }
  return { whole, pinBlanks };
}

function renderGateNode(node: GateNode, blankIdx: BlankIndex): string {
  const whole = blankIdx.whole.get(node.gate.id);
  if (whole) return renderBlankGate(node, whole.symbol);
  return renderGateSymbol(node);
}

function renderBlankGate(node: GateNode, symbol: string): string {
  const { x, y, width, height } = node;
  return (
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="white" stroke="black" stroke-width="2"/>` +
    `<text x="${x + width / 2}" y="${y + height / 2 + 5}" text-anchor="middle" font-size="22">${escapeSvg(symbol)}</text>`
  );
}

/**
 * MUX의 입력 핀 옆에 신호 라벨(또는 빈칸 박스) 표시.
 *  - I0 (idx=0): 좌측 상단
 *  - I1 (idx=1): 좌측 하단
 *  - S  (idx=2): 하단 중앙
 *  pinBlanks[i]가 있으면 신호명 대신 ㄱ/ㄴ/ㄷ/ㄹ 박스를 그린다.
 */
function renderMuxPinLabels(node: GateNode, pinBlanks?: Map<number, LogicBlank>): string {
  const { x, y, width, height } = node;
  const gap = height / 3;
  const inputs = node.gate.inputs ?? [];
  let svg = "";

  // I0, I1 — 좌측 핀. 빈칸이면 wire endpoint dot에 인접한 박스 (박스 right edge = stub end x).
  //         빈칸이 아니면 신호명을 stub end의 좀 더 왼쪽에 텍스트로.
  for (let i = 0; i < Math.min(2, inputs.length); i++) {
    const py = y + gap * (i + 1);
    const stubEndX = x - PIN_STUB; // wire endpoint x
    const blank = pinBlanks?.get(i);
    if (blank) {
      const bw = 20, bh = 20;
      const bx = stubEndX - bw;     // right edge = stubEndX → wire가 박스로 직접 들어감
      const by = py - bh / 2;
      svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="white" stroke="black" stroke-width="1.5"/>`;
      svg += `<text x="${bx + bw / 2}" y="${by + bh / 2 + 5}" text-anchor="middle" font-size="14" font-weight="600">${escapeSvg(blank.symbol)}</text>`;
    } else {
      const labelSig = formatSignalLabel(inputs[i]);
      svg += `<text x="${stubEndX - 4}" y="${py + 4}" text-anchor="end" font-size="11" fill="#374151">${escapeSvg(labelSig)}</text>`;
    }
  }
  // S — 하단 핀. 빈칸이면 박스 (top edge = stub end y), 아니면 신호명 텍스트.
  if (inputs.length >= 3) {
    const sx = x + width / 2;
    const stubEndY = y + height + PIN_STUB;
    const blank = pinBlanks?.get(2);
    if (blank) {
      const bw = 20, bh = 20;
      const bx = sx - bw / 2;
      const by = stubEndY;          // top edge = stub end → wire가 위에서 들어감
      svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="white" stroke="black" stroke-width="1.5"/>`;
      svg += `<text x="${bx + bw / 2}" y="${by + bh / 2 + 5}" text-anchor="middle" font-size="14" font-weight="600">${escapeSvg(blank.symbol)}</text>`;
    } else {
      const labelSig = formatSignalLabel(inputs[2]);
      svg += `<text x="${sx}" y="${stubEndY + 14}" text-anchor="middle" font-size="11" fill="#374151">${escapeSvg(labelSig)}</text>`;
    }
  }

  // 박스 내부 핀 라벨: I0(좌상), I1(좌하), S(하단 중앙 안쪽), F(우)
  svg += `<text x="${x + 6}" y="${y + gap + 4}" font-size="10" fill="#6b7280">I0</text>`;
  svg += `<text x="${x + 6}" y="${y + 2 * gap + 4}" font-size="10" fill="#6b7280">I1</text>`;
  if (inputs.length >= 3) {
    svg += `<text x="${x + width / 2}" y="${y + height - 4}" text-anchor="middle" font-size="10" fill="#6b7280">S</text>`;
  }
  svg += `<text x="${x + width - 8}" y="${y + height / 2 + 4}" text-anchor="end" font-size="10" fill="#6b7280">F</text>`;
  return svg;
}

function formatSignalLabel(sig: string): string {
  if (sig.endsWith("_n")) return `${sig.slice(0, -2)}'`;
  return sig;
}

/**
 * FF의 D/T/J/K, R(reset), CLK(▷) 외부 stub end 옆에 입력 신호명 hint를 표시.
 * 학생이 어느 wire가 어느 핀으로 들어가는지 분간 가능.
 *  · D/T/J/K, R 핀: inputs 배열 순서대로 (D-FF + reset이면 [D, R])
 *  · CLK 핀: clockSignal 지정 시
 */
function renderFlipFlopPinLabels(node: GateNode): string {
  const { x, y, height: h } = node;
  const inputs = node.gate.inputs ?? [];
  const inputCount = Math.max(1, inputs.length);
  let svg = "";

  // 일반 입력 핀 stub end 옆 — 핀별 stub 길이 다름 (모든 FF에 적용)
  const gap = h / (inputCount + 1);
  for (let i = 0; i < inputCount; i++) {
    const py = y + gap * (i + 1);
    const sig = inputs[i];
    const stubEndX = x - getFfPinStub(i, inputCount);
    svg += `<text x="${stubEndX - 4}" y="${py - 3}" text-anchor="end" font-size="10" fill="#1e40af" font-weight="600">${escapeSvg(formatSignalLabel(sig))}</text>`;
  }
  // CLK 핀 (▷ stub end) 옆 — 가장 긴 stub 끝
  if (node.gate.clockSignal) {
    const clkY = y + h - 6;
    const clkStubEndX = x - getFfPinStub("clk", inputCount);
    svg += `<text x="${clkStubEndX - 4}" y="${clkY + 4}" text-anchor="end" font-size="10" fill="#1e40af" font-weight="600">${escapeSvg(formatSignalLabel(node.gate.clockSignal))}</text>`;
  }
  return svg;
}

/** logic_network 검증: blank.gateIds가 실제 gate 배열 안에 있는지. */
export function validateBlankCoverage(diagram: LogicNetworkDiagram): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const gateIds = new Set(diagram.gates.map((g) => g.id));
  for (const blank of diagram.blanks ?? []) {
    for (const gateId of blank.gateIds) {
      if (!gateIds.has(gateId)) {
        errors.push(`blank target gate missing: ${gateId}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

// =====================================================================
// Gate symbols
// =====================================================================
function renderGateSymbol(node: GateNode): string {
  switch (node.type) {
    case "AND":  return renderAndGate(node);
    case "NAND": return renderAndGate(node, true);
    case "OR":   return renderOrGate(node);
    case "NOR":  return renderOrGate(node, true);
    case "XOR":  return renderOrGate(node, false, true);
    case "XNOR": return renderOrGate(node, true, true);
    case "NOT":  return renderNotGate(node);
    case "DFF":  return renderFlipFlop(node, "D");
    case "TFF":  return renderFlipFlop(node, "T");
    case "JKFF": return renderFlipFlop(node, "JK");
    case "MUX":  return renderMuxGate(node);
  }
}

/**
 * 2×1 MUX 박스 — 사다리꼴(좌측 키 큰 형태) + 상단 외부 "2×1 MUX" 라벨.
 *  좌측에 I0(상)/I1(하) 핀, 하단 중앙 S(select), 우측 중앙 F(출력).
 *  핀 옆 신호 라벨/빈칸은 renderMuxPinLabels가 별도 렌더.
 */
function renderMuxGate(node: GateNode): string {
  const { x, y, width: w, height: h } = node;
  const inset = 8; // 우측 inset (사다리꼴 effect)
  let svg = "";
  // 사다리꼴 — 좌측 vertical, 우측은 위·아래에서 inset
  svg += `<path d="M ${x} ${y} L ${x + w} ${y + inset} L ${x + w} ${y + h - inset} L ${x} ${y + h} Z" fill="white" stroke="black" stroke-width="2"/>`;
  // 외부 상단 라벨
  svg += `<text x="${x + w / 2}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#666">2×1 MUX</text>`;
  return svg;
}

/**
 * 플립플롭 심볼 — 사각형 박스 + pin 라벨 + clock 삼각형.
 *  kind="D"/"T": 1-input (좌측 중앙에 D 또는 T 라벨)
 *  kind="JK": 2-input (좌측 상단 J, 하단 K)
 *  공통: 우측 중앙 Q, 좌측 하단 ▷ clock indicator, 상단 외부 타입 표기.
 */
function renderFlipFlop(node: GateNode, kind: "D" | "T" | "JK"): string {
  const { x, y, width: w, height: h } = node;
  const inputCount = node.gate.inputs?.length ?? 1;
  let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="black" stroke-width="2"/>`;

  if (kind === "JK") {
    const gap = h / 3;
    svg += `<text x="${x + 8}" y="${y + gap + 4}" font-size="12">J</text>`;
    svg += `<text x="${x + 8}" y="${y + 2 * gap + 4}" font-size="12">K</text>`;
  } else if ((kind === "D" || kind === "T") && inputCount === 2) {
    // D-FF/T-FF에 비동기 RESET (또는 추가 input) 포함 — 좌측에 두 pin 라벨
    const gap = h / 3;
    svg += `<text x="${x + 8}" y="${y + gap + 4}" font-size="12">${kind}</text>`;
    svg += `<text x="${x + 8}" y="${y + 2 * gap + 4}" font-size="11" fill="#666">R</text>`;
  } else {
    svg += `<text x="${x + 8}" y="${y + h / 2 + 4}" font-size="12">${kind}</text>`;
  }

  svg += `<text x="${x + w - 14}" y="${y + h / 2 + 4}" font-size="12">Q</text>`;
  const typeLabel = kind === "JK" ? "JK-FF" : `${kind}-FF`;
  svg += `<text x="${x + w / 2}" y="${y - 4}" text-anchor="middle" font-size="11" fill="#666">${typeLabel}</text>`;

  // CLK indicator (▷) — 박스 좌하단 코너 안쪽으로 배치. T/J 입력 pin과 충분히 분리.
  const clkY = y + h - 6;
  svg += `<path d="M ${x} ${clkY - 4} L ${x + 7} ${clkY} L ${x} ${clkY + 4} Z" fill="none" stroke="black" stroke-width="1.3"/>`;
  // ▷ 핀 외부 stub — 입력보다 더 긴 stub으로 xlane 분리 (#3 규칙). 모든 FF에 일관 적용.
  const clkStub = getFfPinStub("clk", inputCount);
  svg += `<path d="M ${x - clkStub} ${clkY} L ${x} ${clkY}" stroke="black" fill="none" stroke-width="2"/>`;
  svg += `<circle cx="${x - clkStub}" cy="${clkY}" r="2" fill="black"/>`;
  return svg;
}

function renderAndGate(node: GateNode, bubble = false): string {
  const { x, y, width: w, height: h } = node;
  const r = 5;
  return `<path d="M ${x} ${y} L ${x + w / 2} ${y} Q ${x + w} ${y} ${x + w} ${y + h / 2} Q ${x + w} ${y + h} ${x + w / 2} ${y + h} L ${x} ${y + h} Z" fill="white" stroke="black" stroke-width="2"/>` +
    (bubble ? `<circle cx="${x + w + r}" cy="${y + h / 2}" r="${r}" fill="white" stroke="black" stroke-width="2"/>` : "");
}

function renderOrGate(node: GateNode, bubble = false, xor = false): string {
  const { x, y, width: w, height: h } = node;
  const r = 5;
  // OR shape — 좌상/좌하에서 control point를 위/아래로 보내 곡선이 즉시 휘도록.
  // 좌측 edge는 (x,y)·(x,y+h)에서 시작하므로 pin stub과 정렬 OK.
  // top curve: (x,y) → 위쪽 control (x+0.45w, y-h*0.08) → 우중심 (x+w, y+h/2)
  // bottom curve: 위로 대칭
  // back cusp: (x,y+h) → 안쪽 (x+w*0.22, y+h/2) → (x,y)
  const orPath = `M ${x} ${y} Q ${x + w * 0.45} ${y - h * 0.08} ${x + w} ${y + h / 2} Q ${x + w * 0.45} ${y + h * 1.08} ${x} ${y + h} Q ${x + w * 0.22} ${y + h / 2} ${x} ${y} Z`;
  return (
    (xor ? `<path d="M ${x - 6} ${y} Q ${x + w * 0.18} ${y + h / 2} ${x - 6} ${y + h}" fill="none" stroke="black" stroke-width="2"/>` : "") +
    `<path d="${orPath}" fill="white" stroke="black" stroke-width="2"/>` +
    (bubble ? `<circle cx="${x + w + r}" cy="${y + h / 2}" r="${r}" fill="white" stroke="black" stroke-width="2"/>` : "")
  );
}

function renderNotGate(node: GateNode): string {
  const { x, y, width: w, height: h } = node;
  const r = 5;
  // triangle apex가 gate width 우측 경계(x+w)까지 확장 → bubble은 외부(NAND와 동일 스타일)
  // bubble 중심 (x+w+r), 우측 끝 (x+w+10) — getGateOutputPoint의 bubble offset(+10)과 정확히 일치
  return `<path d="M ${x} ${y} L ${x} ${y + h} L ${x + w} ${y + h / 2} Z" fill="white" stroke="black" stroke-width="2"/>` +
    `<circle cx="${x + w + r}" cy="${y + h / 2}" r="${r}" fill="white" stroke="black" stroke-width="2"/>`;
}

// =====================================================================
function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
