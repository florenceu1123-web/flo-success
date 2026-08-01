/**
 * AC 다중 전원 + 중첩의 원리 (임용 10번 회로이론) 전용 fixed-slot 렌더러.
 *
 * ★ 왜 전용인가 (실측 신고): generic mesh는 이 회로를 세로 가지들로 펼쳐 그려서
 *   원본의 사다리 구조가 사라지고, 무엇보다 **단자 b가 사라진다**(b가 도선으로 접지에
 *   병합되며 좌표를 잃음). 문제는 "마디 a에서 b로 흐르는 전류"를 묻기 때문에 a·b가
 *   그림에 명확히 보이지 않으면 문제가 성립하지 않는다.
 *
 * 고정 배치 (원본 그대로):
 *
 *      L(코일)      R          a        R
 *   ┌───∿∿∿───┬───▭▭▭───┬───●───▭▭▭───┐
 *   │                          ┆(점선 박스)  │
 *  V_s(원,+/−)                 R           I_s(원,↑)
 *   │                          C           │
 *   │                          ●b          │
 *   └──────────────── 하단 공통 도선 ────────┘
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";

const STROKE = "#111827";
const WIRE_W = 1.6;
const RED = "#dc2626";
const DASH = "#9333ea";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);

type Detected = {
  vSrc: CircuitComponent;
  iSrc: CircuitComponent;
  leftRail: CircuitComponent[];    // V_s 상단 → 마디 a
  rightRail: CircuitComponent[];   // 마디 a → I_s 상단
  branch: CircuitComponent[];      // 마디 a → (점선) → 단자 b
  terminalA: string;
  terminalB: string;
  ground: string;
};

/** 구조 감지 — V·I 전원 각각 세로 leg + 마디 a에서 접지로 내려가는 직렬 가지. */
export function detectAcSuperpositionCircuit(netlist: CircuitNetlist): Detected | null {
  const comps = netlist.components ?? [];
  const ground = netlist.ground ?? "GND";
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === ground;
  const nodesOf = (c: CircuitComponent) => (c.pins ?? []).map((p) => p.node);

  const vList = comps.filter((c) => c.type === "V" && nodesOf(c).some(isGnd));
  const iList = comps.filter((c) => c.type === "I" && nodesOf(c).some(isGnd));
  if (vList.length !== 1 || iList.length !== 1) return null;
  const vSrc = vList[0], iSrc = iList[0];
  const vTop = nodesOf(vSrc).find((n) => !isGnd(n));
  const iTop = nodesOf(iSrc).find((n) => !isGnd(n));
  if (!vTop || !iTop) return null;

  const terminalA = (netlist.nodeAnnotations ?? []).find((a) => a.label === "a")?.node;
  if (!terminalA) return null;

  // 상단 rail — 접지에 닿지 않는 2-pin 소자 체인.
  const railPool = comps.filter(
    (c) => c.id !== vSrc.id && c.id !== iSrc.id && (c.pins ?? []).length === 2 && !nodesOf(c).some(isGnd),
  );
  const used = new Set<string>();
  const walk = (from: string, to: string): CircuitComponent[] | null => {
    const path: CircuitComponent[] = [];
    let cur = from;
    for (let guard = 0; guard < 10 && cur !== to; guard++) {
      const next = railPool.find((c) => !used.has(c.id) && nodesOf(c).includes(cur));
      if (!next) return null;
      used.add(next.id);
      path.push(next);
      cur = nodesOf(next).find((n) => n !== cur) ?? cur;
    }
    return cur === to ? path : null;
  };
  const leftRail = walk(vTop, terminalA);
  if (!leftRail) return null;
  const rightRail = walk(terminalA, iTop);
  if (!rightRail) return null;

  // 중간 가지 — 마디 a에서 접지(또는 단자 b)까지 내려가는 직렬 체인.
  const branchPool = comps.filter(
    (c) => !used.has(c.id) && c.id !== vSrc.id && c.id !== iSrc.id && (c.pins ?? []).length === 2,
  );
  const branch: CircuitComponent[] = [];
  let cur = terminalA;
  let terminalB = "";
  for (let guard = 0; guard < 8; guard++) {
    const next = branchPool.find((c) => !branch.includes(c) && nodesOf(c).includes(cur));
    if (!next) break;
    const to = nodesOf(next).find((n) => n !== cur) ?? cur;
    if (next.type === "WIRE") { terminalB = terminalB || cur; cur = to; continue; }
    branch.push(next);
    cur = to;
    if (isGnd(cur)) { terminalB = terminalB || cur; break; }
  }
  if (branch.length === 0) return null;
  if (!terminalB) terminalB = cur;

  return { vSrc, iSrc, leftRail, rightRail, branch, terminalA, terminalB, ground };
}

export function renderAcSuperpositionCircuit(netlist: CircuitNetlist, d: Detected): string {
  const s: string[] = [];
  const t: string[] = [];

  const SEG = 150;
  const XV = 100;
  const TOP = 120;
  const BOT = 430;
  const xLeftEnd = XV + SEG * d.leftRail.length;      // = 마디 a
  const xA = xLeftEnd;
  const xI = xA + SEG * d.rightRail.length;
  const W = xI + 120;
  const H = BOT + 80;

  // 하단 공통 도선 + 접지
  s.push(line(XV, BOT, xI, BOT));
  s.push(ground(Math.round((XV + xA) / 2), BOT));

  // 좌측 AC 전압원
  s.push(acSource(XV, TOP, BOT, "V"));
  t.push(text(XV - 30, (TOP + BOT) / 2 - 10, d.vSrc.id, { size: 12, weight: 700, anchor: "end", fill: "#1d4ed8" }));
  t.push(text(XV - 30, (TOP + BOT) / 2 + 8, String(d.vSrc.value ?? ""), { size: 12, weight: 600, anchor: "end" }));

  // 우측 AC 전류원
  s.push(acSource(xI, TOP, BOT, "I"));
  t.push(text(xI + 30, (TOP + BOT) / 2 - 10, d.iSrc.id, { size: 12, weight: 700, anchor: "start", fill: "#1d4ed8" }));
  t.push(text(xI + 30, (TOP + BOT) / 2 + 8, String(d.iSrc.value ?? ""), { size: 12, weight: 600, anchor: "start" }));

  // 상단 rail — 좌(V_s→a) / 우(a→I_s)
  let x = XV;
  for (const c of [...d.leftRail, ...d.rightRail]) {
    const x2 = x + SEG;
    if (c.type === "L") hCoil(s, t, x, x2, TOP, c.id, String(c.value ?? ""));
    else if (c.type === "C") hCap(s, t, x, x2, TOP, c.id, String(c.value ?? ""));
    else hRes(s, t, x, x2, TOP, c.id, String(c.value ?? ""));
    x = x2;
  }

  // 마디 a — 단자 점 + 라벨
  s.push(dot(xA, TOP));
  t.push(text(xA + 12, TOP - 12, "a", { size: 15, weight: 700, fill: RED, anchor: "start" }));

  // 중간 가지 (점선 박스 안) — a → … → b
  const n = d.branch.length;
  const boxTop = TOP + 26;
  const boxBot = BOT - 40;
  const slot = (boxBot - boxTop) / n;
  let y = boxTop;
  for (const c of d.branch) {
    const y2 = y + slot;
    if (c.type === "C") vCap(s, t, xA, y, y2, c.id, String(c.value ?? ""));
    else if (c.type === "L") vCoil(s, t, xA, y, y2, c.id, String(c.value ?? ""));
    else vRes(s, t, xA, y, y2, c.id, String(c.value ?? ""));
    y = y2;
  }
  s.push(line(xA, TOP, xA, boxTop));
  s.push(line(xA, boxBot, xA, BOT));
  // 점선 박스 — "점선 내부에 전달되는 전력"을 묻는 원본 표기
  s.push(
    `<rect x="${xA - 46}" y="${boxTop - 14}" width="92" height="${boxBot - boxTop + 28}" fill="none" ` +
    `stroke="${DASH}" stroke-width="1.6" stroke-dasharray="6,4"/>`,
  );

  // 단자 b — 가지 끝(하단 도선 바로 위)
  s.push(dot(xA, BOT));
  t.push(text(xA + 12, BOT + 20, "b", { size: 15, weight: 700, fill: RED, anchor: "start" }));

  void netlist;
  return svg(W, H, [...s, ...t]);
}

// ─────────────────────────── 심볼 helpers ───────────────────────────

function hRes(s: string[], t: string[], x1: number, x2: number, y: number, id: string, label: string): void {
  const cx = (x1 + x2) / 2, half = 26, a = 7, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x1, y, cx - half, y), line(cx + half, y, x2, y));
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(cx, y - a - 8, id, { size: 12, weight: 700, fill: "#1d4ed8" }));
  t.push(text(cx, y + a + 18, label, { size: 12, weight: 600 }));
}

function hCoil(s: string[], t: string[], x1: number, x2: number, y: number, id: string, label: string): void {
  const cx = (x1 + x2) / 2, sh = 26, n = 4, r = sh / n;
  s.push(line(x1, y, cx - sh, y), line(cx + sh, y, x2, y));
  let p = `M${cx - sh},${y}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 1 ${cx - sh + r * (2 * i + 2)},${y}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(cx, y - r - 14, id, { size: 12, weight: 700, fill: "#1d4ed8" }));
  t.push(text(cx, y + 22, label, { size: 12, weight: 600 }));
}

function hCap(s: string[], t: string[], x1: number, x2: number, y: number, id: string, label: string): void {
  const cx = (x1 + x2) / 2, g = 5, ph = 14;
  s.push(line(x1, y, cx - g, y), line(cx + g, y, x2, y));
  s.push(`<line x1="${cx - g}" y1="${y - ph}" x2="${cx - g}" y2="${y + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`);
  s.push(`<line x1="${cx + g}" y1="${y - ph}" x2="${cx + g}" y2="${y + ph}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`);
  t.push(text(cx, y - ph - 8, id, { size: 12, weight: 700, fill: "#1d4ed8" }));
  t.push(text(cx, y + ph + 16, label, { size: 12, weight: 600 }));
}

function vRes(s: string[], t: string[], x: number, y1: number, y2: number, id: string, label: string): void {
  const cy = (y1 + y2) / 2, half = Math.min(28, (y2 - y1) / 2 - 6), a = 7, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(x + a + 10, cy - 2, id, { size: 12, weight: 700, anchor: "start", fill: "#1d4ed8" }));
  t.push(text(x + a + 10, cy + 14, label, { size: 12, weight: 600, anchor: "start" }));
}

function vCap(s: string[], t: string[], x: number, y1: number, y2: number, id: string, label: string): void {
  const cy = (y1 + y2) / 2, g = 5, pw = 15;
  s.push(line(x, y1, x, cy - g), line(x, cy + g, x, y2));
  s.push(`<line x1="${x - pw}" y1="${cy - g}" x2="${x + pw}" y2="${cy - g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`);
  s.push(`<line x1="${x - pw}" y1="${cy + g}" x2="${x + pw}" y2="${cy + g}" stroke="${STROKE}" stroke-width="${WIRE_W + 0.4}"/>`);
  t.push(text(x + pw + 8, cy - 2, id, { size: 12, weight: 700, anchor: "start", fill: "#1d4ed8" }));
  t.push(text(x + pw + 8, cy + 14, label, { size: 12, weight: 600, anchor: "start" }));
}

function vCoil(s: string[], t: string[], x: number, y1: number, y2: number, id: string, label: string): void {
  const cy = (y1 + y2) / 2, sh = Math.min(24, (y2 - y1) / 2 - 6), n = 4, r = sh / n;
  s.push(line(x, y1, x, cy - sh), line(x, cy + sh, x, y2));
  let p = `M${x},${cy - sh}`;
  for (let i = 0; i < n; i++) p += ` A${r},${r} 0 0 0 ${x},${cy - sh + r * (2 * i + 2)}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  t.push(text(x + r + 12, cy - 2, id, { size: 12, weight: 700, anchor: "start", fill: "#1d4ed8" }));
  t.push(text(x + r + 12, cy + 14, label, { size: 12, weight: 600, anchor: "start" }));
}

/** AC 전원 (원 + 사인파). kind="V"면 +/−, "I"면 위 방향 화살표. */
function acSource(cx: number, topY: number, botY: number, kind: "V" | "I"): string {
  const cy = (topY + botY) / 2, r = 24;
  const body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const inner = kind === "V"
    ? `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${RED}">+</text>` +
      `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="15" font-weight="700" fill="${RED}">−</text>`
    : `<line x1="${cx}" y1="${cy + 13}" x2="${cx}" y2="${cy - 10}" stroke="${STROKE}" stroke-width="1.6"/>` +
      `<path d="M${cx - 5},${cy - 6} L${cx},${cy - 15} L${cx + 5},${cy - 6} Z" fill="${STROKE}"/>`;
  return body + inner +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function ground(x: number, y: number): string {
  return `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 12}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 13}" y1="${y + 12}" x2="${x + 13}" y2="${y + 12}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 8}" y1="${y + 17}" x2="${x + 8}" y2="${y + 17}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${x - 3}" y1="${y + 22}" x2="${x + 3}" y2="${y + 22}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}

function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4.5" fill="${RED}" stroke="${STROKE}" stroke-width="1"/>`;
}

function text(
  x: number, y: number, str: string,
  o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {},
): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}

function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function svg(w: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}">\n${body.join("\n")}\n</svg>`;
}
