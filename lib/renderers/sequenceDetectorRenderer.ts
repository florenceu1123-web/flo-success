/**
 * 시퀀스 검출기 (임용 8번 정보과 형식) — 3 figure renderer.
 *
 *   (가) Block diagram — y 입력 → "시퀀스 검출기" box → z 출력
 *   (나) State diagram — 4 상태 circle + 전이 화살표 + ㉠㉡㉢㉣ 빈칸
 *   (다) State table — 현재상태(Q_A Q_B) | 입력 y | 다음상태(Q_A+ Q_B+) | 출력 z, don't care 행 'x'
 *
 *  Phase 1 MVP — 자체 SVG. concept_diagram·truth_table renderer 미재사용 (구조가 다름).
 *  diagramType:
 *    sequence_block        — Block diagram
 *    sequence_state_diagram — State diagram with blanks
 *    sequence_state_table  — State table with blanks (don't care)
 */

import type { SequenceDetectorGeneration, StateCode, Transition, Bit } from "@/lib/generation/topologies/sequenceDetector";

// ─── (가) Block diagram ─────────────────────────────────────────────
export type SequenceBlockDiagram = {
  inputLabel: string;   // "y"
  outputLabel: string;  // "z"
  boxLabel: string;     // "시퀀스 검출기"
};

export function renderSequenceBlock(diagram: SequenceBlockDiagram): string {
  const W = 420, H = 140;
  const boxX = 130, boxY = 40, boxW = 160, boxH = 60;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<defs><marker id="seq_arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;
  // Input wire (y → box)
  svg += `<path d="M 20 ${boxY + boxH / 2} L ${boxX} ${boxY + boxH / 2}" stroke="black" stroke-width="2" marker-end="url(#seq_arrow)" fill="none"/>`;
  svg += `<text x="14" y="${boxY + boxH / 2 + 5}" text-anchor="end" font-size="16" font-weight="700" fill="#1e3a8a">${escapeSvg(diagram.inputLabel)}</text>`;
  // Box
  svg += `<rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" stroke="black" fill="white" stroke-width="2"/>`;
  svg += `<text x="${boxX + boxW / 2}" y="${boxY + boxH / 2 + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#1e3a8a">${escapeSvg(diagram.boxLabel)}</text>`;
  // Output wire (box → z)
  svg += `<path d="M ${boxX + boxW} ${boxY + boxH / 2} L ${W - 30} ${boxY + boxH / 2}" stroke="black" stroke-width="2" marker-end="url(#seq_arrow)" fill="none"/>`;
  svg += `<text x="${W - 18}" y="${boxY + boxH / 2 + 5}" text-anchor="start" font-size="16" font-weight="700" fill="#1e3a8a">${escapeSvg(diagram.outputLabel)}</text>`;
  svg += `</svg>`;
  return svg;
}

// ─── (나) State diagram with blanks ─────────────────────────────────
export type SequenceStateDiagram = {
  /** 4 상태 코드 + 사용 여부. */
  states: Array<{ code: StateCode; isUsed: boolean }>;
  transitions: Transition[];
  /** ㉠㉡㉢㉣ 빈칸 source state. 이 state의 두 전이만 라벨에 빈칸 표시. */
  blankSourceState: StateCode;
};

const STATE_POSITIONS: Record<StateCode, { x: number; y: number }> = {
  "00": { x: 130, y: 100 },
  "01": { x: 130, y: 280 },
  "10": { x: 380, y: 280 },
  "11": { x: 380, y: 100 },
};

const STATE_RADIUS = 36;

export function renderSequenceStateDiagram(diagram: SequenceStateDiagram): string {
  const W = 540, H = 400;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;
  svg += `<defs><marker id="seq_state_arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 Z" fill="black"/></marker></defs>`;

  // State circles
  for (const { code, isUsed } of diagram.states) {
    const { x, y } = STATE_POSITIONS[code];
    const stroke = isUsed ? "black" : "#9ca3af";
    const dash = isUsed ? "" : `stroke-dasharray="4 4"`;
    svg += `<circle cx="${x}" cy="${y}" r="${STATE_RADIUS}" stroke="${stroke}" fill="white" stroke-width="2" ${dash}/>`;
    svg += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="${isUsed ? "#1e3a8a" : "#9ca3af"}">${code}</text>`;
  }

  // Transitions
  //   blanks markers — Korean enclosed ㉠㉡㉢㉣ for 검출 state의 두 전이의 input/output (총 4 문자)
  const blankMarkers = ["㉠", "㉡", "㉢", "㉣"];
  let blankIdx = 0;
  const nonDontCare = diagram.transitions.filter((t) => !t.isDontCare);
  for (const t of nonDontCare) {
    let label: string;
    if (t.fromState === diagram.blankSourceState && t.input === 0) {
      // ㉠ = next state, ㉡ = output
      label = `${blankMarkers[0]}/${blankMarkers[1]}`;
    } else if (t.fromState === diagram.blankSourceState && t.input === 1) {
      label = `${blankMarkers[2]}/${blankMarkers[3]}`;
    } else {
      label = `${t.input}/${t.output}`;
    }
    blankIdx++;
    svg += renderTransitionArrow(t.fromState, t.toState, label);
  }

  svg += `</svg>`;
  return svg;
}

/** 두 state 사이 전이 화살표 (또는 self-loop) + label. */
function renderTransitionArrow(from: StateCode, to: StateCode, label: string): string {
  const p1 = STATE_POSITIONS[from];
  const p2 = STATE_POSITIONS[to];
  let svg = "";

  if (from === to) {
    // Self-loop — state 위에 반원
    const cx = p1.x;
    const cy = p1.y - STATE_RADIUS - 18;
    const r = 18;
    svg += `<path d="M ${cx - 8} ${cy + r} A ${r} ${r} 0 1 1 ${cx + 8} ${cy + r}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#seq_state_arrow)"/>`;
    svg += `<text x="${cx}" y="${cy - r + 2}" text-anchor="middle" font-size="12" fill="#dc2626" font-weight="700">${escapeSvg(label)}</text>`;
    return svg;
  }

  // 두 state 사이 화살표 — 약간 curved (양방향 화살표 겹침 회피)
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / dist;
  const uy = dy / dist;
  // 시작·끝 — state circle 가장자리에서 시작
  const startX = p1.x + ux * STATE_RADIUS;
  const startY = p1.y + uy * STATE_RADIUS;
  const endX = p2.x - ux * STATE_RADIUS;
  const endY = p2.y - uy * STATE_RADIUS;
  // perpendicular offset (양방향 화살표 분리용)
  //   from < to 알파벳 순이면 +offset, 아니면 -offset
  const offsetSign = from < to ? 1 : -1;
  const perpX = -uy * 22 * offsetSign;
  const perpY = ux * 22 * offsetSign;
  // Cubic Bezier control points
  const cp1x = startX + perpX;
  const cp1y = startY + perpY;
  const cp2x = endX + perpX;
  const cp2y = endY + perpY;
  svg += `<path d="M ${startX} ${startY} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${endX} ${endY}" stroke="black" fill="none" stroke-width="1.5" marker-end="url(#seq_state_arrow)"/>`;
  // label — midpoint + perp offset
  const midX = (startX + endX) / 2 + perpX * 0.9;
  const midY = (startY + endY) / 2 + perpY * 0.9;
  svg += `<text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="12" fill="#dc2626" font-weight="700">${escapeSvg(label)}</text>`;
  return svg;
}

// ─── (다) State table ───────────────────────────────────────────────
export type SequenceStateTable = {
  transitions: Transition[];
  /** 학생이 채울 셀 모두 빈칸 표시. don't care 행은 'x'로 표시. */
  hideAnswers: boolean;
};

export function renderSequenceStateTable(diagram: SequenceStateTable): string {
  const W = 540, H = 280;
  const colXs = [40, 100, 160, 240, 320, 400, 480];
  const rowH = 22;
  const headerY = 50;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`;

  // Header (2-level)
  // 1: 현재상태 | 입력 | 다음상태 | 출력
  // 2: Q_A | Q_B | y | Q_A(t+1) | Q_B(t+1) | z
  const headerTop = 18;
  svg += `<text x="${(colXs[0] + colXs[1]) / 2}" y="${headerTop}" text-anchor="middle" font-size="12" font-weight="700">현재상태</text>`;
  svg += `<text x="${colXs[2]}" y="${headerTop}" text-anchor="middle" font-size="12" font-weight="700">입력</text>`;
  svg += `<text x="${(colXs[3] + colXs[4]) / 2}" y="${headerTop}" text-anchor="middle" font-size="12" font-weight="700">다음상태</text>`;
  svg += `<text x="${colXs[5]}" y="${headerTop}" text-anchor="middle" font-size="12" font-weight="700">출력</text>`;
  svg += `<text x="${colXs[0]}" y="${headerY - 6}" text-anchor="middle" font-size="11">Q_A(t)</text>`;
  svg += `<text x="${colXs[1]}" y="${headerY - 6}" text-anchor="middle" font-size="11">Q_B(t)</text>`;
  svg += `<text x="${colXs[2]}" y="${headerY - 6}" text-anchor="middle" font-size="11">y</text>`;
  svg += `<text x="${colXs[3]}" y="${headerY - 6}" text-anchor="middle" font-size="11">Q_A(t+1)</text>`;
  svg += `<text x="${colXs[4]}" y="${headerY - 6}" text-anchor="middle" font-size="11">Q_B(t+1)</text>`;
  svg += `<text x="${colXs[5]}" y="${headerY - 6}" text-anchor="middle" font-size="11">z</text>`;

  // Table border + rows
  const tableTopY = headerY;
  const cellW = 60;
  // Vertical separators between column groups
  const vSeps = [(colXs[1] + colXs[2]) / 2, (colXs[2] + colXs[3]) / 2, (colXs[4] + colXs[5]) / 2];

  const rowsByState = ["00", "01", "10", "11"] as StateCode[];
  let y = tableTopY;
  // Top border
  svg += `<path d="M 12 ${y} L ${W - 12} ${y}" stroke="black" stroke-width="1"/>`;
  for (const stateCode of rowsByState) {
    const rowsForState = diagram.transitions.filter((t) => t.fromState === stateCode);
    // 현재상태 셀 — 2 row span (입력 0, 1)
    const stateCellMidY = y + rowH;
    svg += `<text x="${colXs[0]}" y="${stateCellMidY + 4}" text-anchor="middle" font-size="12">${stateCode[0]}</text>`;
    svg += `<text x="${colXs[1]}" y="${stateCellMidY + 4}" text-anchor="middle" font-size="12">${stateCode[1]}</text>`;
    for (const t of rowsForState) {
      const cellY = y + rowH * 0.7;
      svg += `<text x="${colXs[2]}" y="${cellY + 4}" text-anchor="middle" font-size="12">${t.input}</text>`;
      // Next state + output
      const showAns = !diagram.hideAnswers || t.isDontCare;
      const naCellNextA = t.isDontCare ? "x" : (showAns ? t.toState[0] : "");
      const naCellNextB = t.isDontCare ? "x" : (showAns ? t.toState[1] : "");
      const naCellOut = t.isDontCare ? "x" : (showAns ? String(t.output) : "");
      const color = t.isDontCare ? "#9ca3af" : "#1e3a8a";
      svg += `<text x="${colXs[3]}" y="${cellY + 4}" text-anchor="middle" font-size="12" fill="${color}">${naCellNextA}</text>`;
      svg += `<text x="${colXs[4]}" y="${cellY + 4}" text-anchor="middle" font-size="12" fill="${color}">${naCellNextB}</text>`;
      svg += `<text x="${colXs[5]}" y="${cellY + 4}" text-anchor="middle" font-size="12" fill="${color}">${naCellOut}</text>`;
      // Cell underline (for blank rows)
      if (!showAns && !t.isDontCare) {
        svg += `<path d="M ${colXs[3] - 18} ${cellY + 6} L ${colXs[3] + 18} ${cellY + 6}" stroke="#dc2626" stroke-width="1"/>`;
        svg += `<path d="M ${colXs[4] - 18} ${cellY + 6} L ${colXs[4] + 18} ${cellY + 6}" stroke="#dc2626" stroke-width="1"/>`;
        svg += `<path d="M ${colXs[5] - 18} ${cellY + 6} L ${colXs[5] + 18} ${cellY + 6}" stroke="#dc2626" stroke-width="1"/>`;
      }
      // Row separator (light)
      y += rowH;
      svg += `<path d="M 12 ${y} L ${W - 12} ${y}" stroke="#e5e7eb" stroke-width="0.7"/>`;
    }
    // Heavy separator between state groups
    svg += `<path d="M 12 ${y} L ${W - 12} ${y}" stroke="black" stroke-width="1"/>`;
  }

  // Column separators (full height)
  for (const sx of vSeps) {
    svg += `<path d="M ${sx} ${tableTopY} L ${sx} ${y}" stroke="black" stroke-width="1"/>`;
  }
  // Outer borders (left/right)
  svg += `<path d="M 12 ${tableTopY} L 12 ${y}" stroke="black" stroke-width="1"/>`;
  svg += `<path d="M ${W - 12} ${tableTopY} L ${W - 12} ${y}" stroke="black" stroke-width="1"/>`;

  svg += `</svg>`;
  return svg;
}

function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
