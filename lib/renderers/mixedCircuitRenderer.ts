import type { LogicGate, LogicGateType, MixedCircuitDiagram } from "@/types";

/**
 * 복합형(mixed_circuit) renderer — ★ 데이터 기반 ★.
 *
 *   diagram.logic(플립플롭 체인) + diagram.analog(R-2R DAC + OPAMP) + bridgeNodes를 실제로 읽어
 *   N-bit·FF종류(D/JK/T)·시프트레지스터/카운터를 모두 반영해 그린다. (이전 하드코딩 JK 2-bit 폐기)
 *
 *   레이아웃:
 *     하단: FF 박스 좌→우 직렬 (입력 A 또는 V_CC → 각 FF). 클럭 rail이 모든 FF ▷에 연결.
 *     각 FF의 Q 출력 → 위로 가중 저항(R-2R) → 공통 합산 노드 → OPAMP(+) → V_o.
 *     OPAMP(−)는 피드백(전압 폴로워) 또는 V_REF(비교기) — analog netlist에 Vref 있으면 비교기.
 */

const FF_TYPES = new Set<LogicGateType>(["DFF", "JKFF", "TFF"]);

export function renderMixedCircuitSVG(diagram: MixedCircuitDiagram): string {
  const gates = diagram.logic?.gates ?? [];
  const ffGates = gates.filter((g) => FF_TYPES.has(g.type));
  const n = Math.max(1, ffGates.length);

  // ── 레이아웃 상수 (N에 따라 폭 확장) ──
  const FF_W = 104, FF_H = 120, FF_GAP = 190;
  const FF_START_X = 150;
  const FF_ROW_Y = 430;
  const DAC_RAIL_Y = 150;       // 합산(가중) rail
  const Q_NODE_Y = FF_ROW_Y - 40;
  const ffX = (i: number) => FF_START_X + i * FF_GAP;
  const lastFfRight = ffX(n - 1) + FF_W;
  const SUM_X = lastFfRight + 120;     // 합산 노드 x
  const OPAMP_X = SUM_X + 70;
  const OPAMP_Y_TOP = DAC_RAIL_Y - 50, OPAMP_Y_BOT = DAC_RAIL_Y + 50;
  const VO_X = OPAMP_X + 200;
  const W = Math.max(1000, VO_X + 80);
  const H = 700;
  const CLK_RAIL_Y = FF_ROW_Y + FF_H + 70;
  const CLK_X = 60;

  // analog: Q 라벨 → 가중 저항값
  const rValueFor = (qLabel: string): string => {
    const node = diagram.bridgeNodes?.[qLabel];
    const r = diagram.analog?.components?.find(
      (c) => c.type === "R" && (c.pins ?? []).some((p) => p.node === node),
    );
    return (r?.value as string) ?? "R";
  };
  // 비교기 여부 — analog netlist에 V_REF 노드/주석 있으면 비교기, 없으면 전압 폴로워(아날로그 DAC).
  const hasVref = (diagram.analog?.nodeAnnotations ?? []).some((a) =>
    /V_?REF/i.test(String(a.label ?? "")),
  );

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // Q 출력 x좌표 (= DAC 입력 컬럼)
  const qxOf = (i: number) => ffX(i) + FF_W + FF_STUB;
  // R-2R 사다리 여부 — analog netlist에 직렬 R(R_ser*) 있으면 사다리, 없으면 binary-weighted.
  const isLadder = (diagram.analog?.components ?? []).some((c) => /^R_ser/.test(c.id));
  const serVal = (diagram.analog?.components ?? []).find((c) => /^R_ser/.test(c.id))?.value as string | undefined;
  const termVal = (diagram.analog?.components ?? []).find((c) => /^R_term/.test(c.id))?.value as string | undefined;

  // ── 각 FF 그리기 + Q 라벨 (DAC 저항은 아래 별도 섹션) ──
  ffGates.forEach((g, i) => {
    const x = ffX(i);
    const qLabel = g.output;
    // FF 박스
    svg += ffBox(x, FF_ROW_Y, FF_W, FF_H, g.id, g.type);

    // 입력 wire: inputs[0] (D/T) 또는 J·K (JK)
    const leftPinY = FF_ROW_Y + 30;
    const srcLabel = g.inputs?.[0] ?? "";
    if (i === 0) {
      // 첫 FF 입력 = 외부 (A 또는 V_CC)
      svg += dot(x - 60, leftPinY);
      svg += label(x - 66, leftPinY + 4, srcLabel || "A", "end", "#000", 12);
      svg += wire(x - 60, leftPinY, x - FF_STUB, leftPinY);
    } else {
      // 직렬: 이전 FF의 Q → 현재 입력
      const prevQx = ffX(i - 1) + FF_W + FF_STUB;
      svg += wire(prevQx, FF_ROW_Y + 30, x - FF_STUB, leftPinY);
    }
    // JK면 K핀도 입력 연결 (D=Q_prev 같은 단순 시프트가 아닌 카운터)
    if (g.type === "JKFF") {
      const kPinY = FF_ROW_Y + FF_H - 30;
      const ksrc = g.inputs?.[1] ?? srcLabel;
      if (i === 0) {
        svg += wire(x - 60, leftPinY, x - 60, kPinY);
        svg += wire(x - 60, kPinY, x - FF_STUB, kPinY);
      } else {
        const prevQx = ffX(i - 1) + FF_W + FF_STUB;
        svg += wire(prevQx + 30, FF_ROW_Y + 30, prevQx + 30, kPinY);
        svg += wire(prevQx + 30, kPinY, x - FF_STUB, kPinY);
      }
      void ksrc;
    }

    // Q 출력 라벨
    const qx = x + FF_W + FF_STUB;
    svg += dot(qx, FF_ROW_Y + 30);
    svg += label(qx + 6, FF_ROW_Y + 22, qLabel, "start", "#1e3a8a", 11);
  });

  // ── DAC ──────────────────────────────────────────────────
  const rMidY = (DAC_RAIL_Y + Q_NODE_Y) / 2;
  // 각 비트: Q → 2R 다리(수직) → ladder 노드(rail).
  ffGates.forEach((g, i) => {
    const qx = qxOf(i);
    svg += wire(qx, FF_ROW_Y + 30, qx, Q_NODE_Y);
    svg += rZigzagV(qx, rMidY);
    svg += wire(qx, Q_NODE_Y, qx, rMidY - 28);
    svg += wire(qx, rMidY + 28, qx, DAC_RAIL_Y);
    svg += label(qx + 14, rMidY + 4, rValueFor(g.output), "start", "#374151", 11);
    svg += dot(qx, DAC_RAIL_Y);
  });

  if (isLadder) {
    // R-2R 사다리: ladder 노드 사이 직렬 R + 좌측 끝 2R 종단(→GND) + 출력(MSB쪽) → opamp.
    for (let b = 0; b < n - 1; b++) {
      const xa = qxOf(b), xb = qxOf(b + 1);
      const cx = (xa + xb) / 2;
      svg += rZigzagH(cx, DAC_RAIL_Y);
      svg += wire(xa, DAC_RAIL_Y, cx - 28, DAC_RAIL_Y);
      svg += wire(cx + 28, DAC_RAIL_Y, xb, DAC_RAIL_Y);
      svg += label(cx, DAC_RAIL_Y - 12, serVal ?? "R", "middle", "#374151", 11);
    }
    // 좌측 끝 2R 종단 → GND (lad_0 = LSB = 좌측 첫 컬럼의 왼쪽)
    const x0 = qxOf(0);
    const termX = x0 - 90;
    svg += wire(x0, DAC_RAIL_Y, termX, DAC_RAIL_Y);
    const tMidY = (DAC_RAIL_Y + (DAC_RAIL_Y + 130)) / 2;
    svg += rZigzagV(termX, tMidY);
    svg += wire(termX, DAC_RAIL_Y, termX, tMidY - 28);
    svg += wire(termX, tMidY + 28, termX, DAC_RAIL_Y + 130);
    svg += label(termX - 14, tMidY + 4, termVal ?? "2R", "end", "#374151", 11);
    svg += groundSymbol(termX, DAC_RAIL_Y + 130);
    // 출력(MSB, 우측 끝) → opamp +
    const xLast = qxOf(n - 1);
    svg += wire(xLast, DAC_RAIL_Y, OPAMP_X, OPAMP_Y_BOT - 25);
    svg += label(SUM_X - 4, DAC_RAIL_Y - 10, "V+", "end", "#1e3a8a", 11);
  } else {
    // binary-weighted: 모든 다리가 공통 합산 rail에서 만나 opamp +로 (JK 카운터 경로).
    svg += wire(qxOf(0), DAC_RAIL_Y, SUM_X, DAC_RAIL_Y);
    svg += dot(SUM_X, DAC_RAIL_Y);
    svg += wire(SUM_X, DAC_RAIL_Y, OPAMP_X, OPAMP_Y_BOT - 25);
    svg += label(SUM_X - 4, DAC_RAIL_Y - 10, "V+", "end", "#1e3a8a", 11);
  }

  // ── OPAMP ──
  svg += opampTriangle(OPAMP_X, OPAMP_Y_TOP, OPAMP_Y_BOT);
  svg += label(OPAMP_X + 10, OPAMP_Y_TOP + 28, "−", "start", "#000", 16);
  svg += label(OPAMP_X + 10, OPAMP_Y_BOT - 22, "+", "start", "#000", 16);
  svg += label(OPAMP_X + 50, OPAMP_Y_TOP - 6, "U1", "middle", "#1e3a8a", 11);
  const opampOutX = OPAMP_X + 100;
  const opampOutY = (OPAMP_Y_TOP + OPAMP_Y_BOT) / 2;
  svg += wire(opampOutX, opampOutY, VO_X, opampOutY);
  svg += `<circle cx="${VO_X}" cy="${opampOutY}" r="4" fill="#dc2626" stroke="black" stroke-width="1"/>`;
  svg += label(VO_X + 12, opampOutY + 4, "V_o", "start", "#dc2626", 14);

  if (hasVref) {
    // 비교기 모드 — V_CC·2kΩ·V_REF·3kΩ·GND 분압 → OPAMP −
    const divY = OPAMP_Y_TOP - 40;
    const vccX = OPAMP_X + 40, jX = OPAMP_X - 60, gndX = OPAMP_X - 160;
    svg += dot(vccX, divY - 24);
    svg += label(vccX + 6, divY - 24, "V_CC", "start", "#000", 12);
    svg += wire(vccX, divY - 24, vccX, divY);
    svg += rZigzagH((vccX + jX) / 2, divY);
    svg += wire(vccX, divY, (vccX + jX) / 2 + 28, divY);
    svg += wire((vccX + jX) / 2 - 28, divY, jX, divY);
    svg += label((vccX + jX) / 2, divY - 12, "2kΩ", "middle", "#374151", 11);
    svg += dot(jX, divY);
    svg += label(jX, divY - 12, "V_REF", "middle", "#1e3a8a", 11);
    svg += rZigzagH((jX + gndX) / 2, divY);
    svg += wire(jX, divY, (jX + gndX) / 2 + 28, divY);
    svg += wire((jX + gndX) / 2 - 28, divY, gndX, divY);
    svg += label((jX + gndX) / 2, divY - 12, "3kΩ", "middle", "#374151", 11);
    svg += wire(gndX, divY, gndX, divY + 16);
    svg += groundSymbol(gndX, divY + 16);
    // V_REF junction → OPAMP −
    svg += wire(jX, divY, jX, OPAMP_Y_TOP + 25);
    svg += wire(jX, OPAMP_Y_TOP + 25, OPAMP_X, OPAMP_Y_TOP + 25);
  } else {
    // 전압 폴로워 (아날로그 DAC 버퍼) — V_o → OPAMP − 피드백
    svg += wire(opampOutX, opampOutY, opampOutX, OPAMP_Y_TOP - 20);
    svg += wire(opampOutX, OPAMP_Y_TOP - 20, OPAMP_X - 30, OPAMP_Y_TOP - 20);
    svg += wire(OPAMP_X - 30, OPAMP_Y_TOP - 20, OPAMP_X - 30, OPAMP_Y_TOP + 25);
    svg += wire(OPAMP_X - 30, OPAMP_Y_TOP + 25, OPAMP_X, OPAMP_Y_TOP + 25);
    svg += dot(opampOutX, opampOutY);
  }

  // ── 클럭 rail → 모든 FF ▷ ──
  svg += dot(CLK_X, CLK_RAIL_Y);
  svg += label(CLK_X - 8, CLK_RAIL_Y + 4, "클럭", "end", "#000", 12);
  const ffClkY = FF_ROW_Y + FF_H - 6;
  const lastClkStubX = ffX(n - 1) - FF_STUB;
  svg += wire(CLK_X, CLK_RAIL_Y, lastClkStubX, CLK_RAIL_Y);
  ffGates.forEach((_, i) => {
    const cx = ffX(i) - FF_STUB;
    svg += wire(cx, CLK_RAIL_Y, cx, ffClkY);
    svg += dot(cx, CLK_RAIL_Y);
  });

  svg += `</svg>`;
  return svg;
}

// ─── helper drawing primitives ─────────────────────────────
const FF_STUB = 18;

function ffBox(x: number, y: number, w: number, h: number, name: string, type: LogicGateType): string {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="white" stroke="black" stroke-width="2"/>`;
  const jPinY = y + 30;
  const kPinY = y + h - 30;
  const qPinY = y + 30;
  // 입력 핀 라벨 — DFF: "D", TFF: "T", JKFF: "J"/"K"
  if (type === "JKFF") {
    s += label(x + 14, y + 34, "J", "start", "#000", 13);
    s += label(x + 14, y + h - 22, "K", "start", "#000", 13);
    s += `<path d="M ${x - FF_STUB} ${kPinY} L ${x} ${kPinY}" stroke="black" fill="none" stroke-width="2"/>`;
  } else {
    s += label(x + 14, y + 34, type === "TFF" ? "T" : "D", "start", "#000", 13);
  }
  s += label(x + w - 8, y + 34, "Q", "end", "#000", 13);
  // J/D/T 핀 외부 stub
  s += `<path d="M ${x - FF_STUB} ${jPinY} L ${x} ${jPinY}" stroke="black" fill="none" stroke-width="2"/>`;
  // Q 핀 외부 stub
  s += `<path d="M ${x + w} ${qPinY} L ${x + w + FF_STUB} ${qPinY}" stroke="black" fill="none" stroke-width="2"/>`;
  // CLK indicator ▷ + 외부 stub
  const clkY = y + h - 6;
  s += `<path d="M ${x} ${clkY - 4} L ${x + 7} ${clkY} L ${x} ${clkY + 4} Z" fill="none" stroke="black" stroke-width="1.3"/>`;
  s += `<path d="M ${x - FF_STUB} ${clkY} L ${x} ${clkY}" stroke="black" fill="none" stroke-width="2"/>`;
  s += label(x + w / 2, y - 6, name, "middle", "#1e3a8a", 11);
  return s;
}

function wire(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3" fill="black"/>`;
}
function label(x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "start", fill = "#000", size = 13): string {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="600" fill="${fill}">${escapeSvg(text)}</text>`;
}
function rZigzagH(cx: number, cy: number): string {
  const path: string[] = [`M ${cx - 28} ${cy}`];
  for (let i = 0; i < 4; i++) {
    const px = cx - 28 + (56 * (i + 0.5)) / 4;
    const py = cy + (i % 2 === 0 ? -8 : 8);
    path.push(`L ${px} ${py}`);
  }
  path.push(`L ${cx + 28} ${cy}`);
  return `<path d="${path.join(" ")}" stroke="black" fill="none" stroke-width="2"/>`;
}
function rZigzagV(cx: number, cy: number): string {
  const path: string[] = [`M ${cx} ${cy - 28}`];
  for (let i = 0; i < 4; i++) {
    const py = cy - 28 + (56 * (i + 0.5)) / 4;
    const px = cx + (i % 2 === 0 ? -10 : 10);
    path.push(`L ${px} ${py}`);
  }
  path.push(`L ${cx} ${cy + 28}`);
  return `<path d="${path.join(" ")}" stroke="black" fill="none" stroke-width="2"/>`;
}
function opampTriangle(x: number, yTop: number, yBot: number): string {
  const tipX = x + 100;
  const tipY = (yTop + yBot) / 2;
  return `<path d="M ${x} ${yTop} L ${tipX} ${tipY} L ${x} ${yBot} Z" fill="white" stroke="black" stroke-width="2"/>`;
}
function groundSymbol(cx: number, cy: number): string {
  return (
    `<path d="M ${cx - 10} ${cy} L ${cx + 10} ${cy}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 7} ${cy + 4} L ${cx + 7} ${cy + 4}" stroke="black" stroke-width="2"/>` +
    `<path d="M ${cx - 4} ${cy + 8} L ${cx + 4} ${cy + 8}" stroke="black" stroke-width="2"/>`
  );
}
function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// (LogicGate 타입 참조 보장)
export type _MixedGate = LogicGate;
