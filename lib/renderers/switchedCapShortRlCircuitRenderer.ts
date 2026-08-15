/**
 * 스위치가 **커패시터를 단락**시키는 RLC 회로 (임용 7번 회로이론) 전용 fixed-slot 렌더러.
 *
 *  레이아웃 (원본 충실):
 *
 *                    ┌──── SW (t=0) ────┐
 *          ┌── R ────┴──────┤├──────────┴────┐
 *          │              (C, 스위치와 병렬)   │
 *        (V_s)                                L   ↓ i_L(t)
 *          │                                  │
 *          └──────────────────────────────────┘
 *                          ⏚ (접지 1개)
 *
 *  - 좌측 세로 = 직류 전압원(+ 위), 상단 rail = R → 마디 → C → 마디 → 우측 코너.
 *  - 스위치는 C 양 끝 마디를 잇는 **윗쪽 가지**(= C와 병렬). t<0 열림 상태로 그린다.
 *  - 우측 세로 = 인덕터, i_L(t) 화살표는 아래 방향(원본과 같은 기준).
 *  - ★ 접지는 **하단 rail에 하나만** 그린다 (회로이론 관례 — 같은 전위의 접지 기호를 여러 개 찍지 않는다).
 */

import type { CircuitComponent, SwitchedCapShortRlCircuitDiagram } from "@/types";
import { renderComponentOnEdge } from "./netlistEdgeRenderer";

export function renderSwitchedCapShortRlCircuit(d: SwitchedCapShortRlCircuitDiagram): string {
  // ── 좌표 ──
  const yTop = 150;        // 상단 rail
  const ySw = yTop - 68;   // 스위치 가지 (C 위쪽)
  const yBot = 400;        // 하단 rail
  const xLeft = 90;        // 전압원 leg
  const xR = 210;          // 상단 R 중심
  const xCa = 300;         // C 왼쪽 마디 (스위치 좌측 단자)
  const xC = 380;          // C 중심
  const xCb = 460;         // C 오른쪽 마디 (스위치 우측 단자)
  const xRight = 580;      // 인덕터 leg
  const HALF = 28;

  const svg: string[] = [];
  const wire = (x1: number, y1: number, x2: number, y2: number) =>
    `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
  const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.5" fill="black"/>`;
  const gnd = (x: number, y: number) => `<g transform="translate(${x},${y})">
    <line x1="0" y1="0" x2="0" y2="9" stroke="black" stroke-width="2"/>
    <line x1="-10" y1="9" x2="10" y2="9" stroke="black" stroke-width="2.4"/>
    <line x1="-6" y1="13" x2="6" y2="13" stroke="black" stroke-width="2"/>
    <line x1="-3" y1="17" x2="3" y2="17" stroke="black" stroke-width="2"/></g>`;

  /** 가로 소자: (xCenter, y) 중앙 배치 + 양쪽 짧은 도선. */
  const hcomp = (c: CircuitComponent, xCenter: number, xFrom: number, xTo: number, y: number) => {
    svg.push(`<rect x="${xCenter - HALF}" y="${y - HALF}" width="${HALF * 2}" height="${HALF * 2}" fill="white"/>`);
    svg.push(
      wire(xFrom, y, xCenter - HALF, y),
      wire(xCenter + HALF, y, xTo, y),
      renderComponentOnEdge(c, { x: xCenter, y }, "horizontal"),
    );
  };
  /** 세로 소자. */
  const vcomp = (c: CircuitComponent, x: number, yFrom: number, yTo: number) => {
    const cy = (yFrom + yTo) / 2;
    svg.push(`<rect x="${x - HALF}" y="${cy - HALF}" width="${HALF * 2}" height="${HALF * 2}" fill="white"/>`);
    svg.push(
      wire(x, yFrom, x, cy - HALF),
      wire(x, cy + HALF, x, yTo),
      renderComponentOnEdge(c, { x, y: cy }, "vertical"),
    );
  };

  const VS: CircuitComponent = { id: "V_s", type: "V", value: d.vLabel, pins: [] };
  const R1: CircuitComponent = { id: "R", type: "R", value: d.rLabel, pins: [] };
  const C1: CircuitComponent = { id: "C", type: "C", value: d.cLabel, pins: [] };
  const L1: CircuitComponent = { id: "L", type: "L", value: d.lLabel, pins: [] };

  // ── 좌측 전압원 leg (+ 위) ──
  vcomp(VS, xLeft, yTop, yBot);

  // ── 상단: R → 마디 a → C → 마디 b → 우측 코너 ──
  hcomp(R1, xR, xLeft, xCa, yTop);
  hcomp(C1, xC, xCa, xCb, yTop);
  svg.push(wire(xCb, yTop, xRight, yTop));
  svg.push(dot(xCa, yTop), dot(xCb, yTop));

  // ── 스위치 가지 (C와 병렬, t<0 열림) ──
  svg.push(wire(xCa, yTop, xCa, ySw), wire(xCb, yTop, xCb, ySw));
  drawOpenSwitch(svg, xCa, xCb, ySw);

  // ── 우측 인덕터 leg + i_L(t) 화살표(아래 방향) ──
  vcomp(L1, xRight, yTop, yBot);
  const arrowId = "capshort_arr";
  svg.push(
    `<defs><marker id="${arrowId}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 Z" fill="#1e3a8a"/></marker></defs>`,
  );
  const yArrTop = yTop + 34;
  svg.push(
    `<path d="M ${xRight - 46} ${yArrTop} L ${xRight - 46} ${yArrTop + 52}" stroke="#1e3a8a" fill="none" stroke-width="1.6" marker-end="url(#${arrowId})"/>`,
    `<text x="${xRight - 52}" y="${yArrTop + 26}" text-anchor="end" font-size="13" fill="#1e3a8a" font-weight="600">${d.currentLabel ?? "i_L(t)"}</text>`,
  );

  // ── 변형 모드: 인덕터 양단 전압 극성 표시 ──
  //   ★ 소자 값 라벨(renderComponentOnEdge가 소자 **오른쪽**에 그린다)과 겹치지 않도록
  //     한 칸 더 바깥 열에 둔다 — 처음엔 +46·+96에 뒀더니 값이 긴 회차("2.5[H]")에서 "L 6[H]"와 정확히 포개졌다(시각검증에서 발견).
  const xVolt = xRight + 132;
  if (d.voltageLabel) {
    const cyL = (yTop + yBot) / 2;
    svg.push(
      `<text x="${xVolt}" y="${cyL - 26}" text-anchor="middle" font-size="13" fill="#1e3a8a">+</text>`,
      `<text x="${xVolt}" y="${cyL + 40}" text-anchor="middle" font-size="13" fill="#1e3a8a">−</text>`,
      `<text x="${xVolt}" y="${cyL + 9}" text-anchor="middle" font-size="13" fill="#1e3a8a" font-weight="600">${d.voltageLabel}</text>`,
    );
  }

  // ── 하단 rail + **접지 1개** ──
  svg.push(wire(xLeft, yBot, xRight, yBot));
  svg.push(gnd((xLeft + xRight) / 2, yBot));

  const W = (d.voltageLabel ? xVolt + 60 : xRight + 130);
  const H = yBot + 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${svg.join("\n")}\n</svg>`;
}

/** t<0 열린 스위치 — 좌측 단자에서 비스듬히 들린 blade + "t=0" 라벨. */
function drawOpenSwitch(svg: string[], xa: number, xb: number, y: number) {
  const pad = 16;
  svg.push(
    `<circle cx="${xa + pad}" cy="${y}" r="3.2" fill="white" stroke="black" stroke-width="1.7"/>`,
    `<circle cx="${xb - pad}" cy="${y}" r="3.2" fill="white" stroke="black" stroke-width="1.7"/>`,
    wireSeg(xa, y, xa + pad, y),
    wireSeg(xb - pad, y, xb, y),
    // blade — 좌측 단자에서 위로 들려 열린 상태
    `<path d="M ${xa + pad} ${y} L ${xb - pad - 4} ${y - 22}" stroke="black" fill="none" stroke-width="2.2"/>`,
    `<text x="${(xa + xb) / 2}" y="${y - 30}" text-anchor="middle" font-size="12" fill="#1e3a8a" font-weight="600">t=0</text>`,
  );
}

function wireSeg(x1: number, y1: number, x2: number, y2: number): string {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" stroke="black" fill="none" stroke-width="2"/>`;
}
