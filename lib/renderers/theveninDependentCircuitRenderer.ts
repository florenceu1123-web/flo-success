/**
 * 테브난 + 최대전력 + 종속전원 (임용 7·9번류) 전용 fixed-slot 렌더러.
 *
 * ★ 왜 전용 렌더러인가 (실측 신고: "회로가 엉망이야"):
 *   generic mesh 렌더러는 이 회로를 "세로 가지 여러 개"로 펼쳐 그려서 원본의 사다리 구조가 사라지고,
 *   부하 R_L 점선 박스가 회로 위로 떠서 단자 a·b 위치가 불명확해진다.
 *   원본 배치는 고정적이다 → CLAUDE.md "빈출 형식은 전용 fixed-slot 렌더러가 정석".
 *
 * 고정 배치 (원본 임용 7번 그대로):
 *
 *   V(좌 세로) ─ R_s1(상단 가로, i_x 화살표) ─┬─ R_s2(상단 가로) ─ a ○
 *                                            │                        │
 *                                     shunt 가지들                    R_L (점선)
 *                                    (저항·종속전원)                   │
 *   └──────────────────── 하단 공통 도선(접지) ──────────────── b ○ ──┘
 *
 * 구조는 netlist에서 도출한다(값 하드코딩 없음):
 *   - 전압원: 한 핀이 접지인 V
 *   - 상단 rail: 접지에 닿지 않는 2-pin 소자들의 직렬 경로 (V+ 노드 → 단자 a)
 *   - shunt: 상단 노드 ↔ 접지 소자들 (저항·종속전원)
 *   - 부하: loadPlaceholders(a–b) — 점선 박스로 그린다.
 */

import type { CircuitComponent, CircuitNetlist } from "@/types";

const STROKE = "#111827";
const WIRE_W = 1.6;
const RED = "#dc2626";
const LOAD = "#9333ea";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground"]);
const DEP_TYPES = new Set(["CCVS", "CCCS", "VCVS", "VCCS"]);

type Detected = {
  vSource: CircuitComponent;
  vTopNode: string;
  railPath: { comp: CircuitComponent; from: string; to: string }[];
  shunts: { comp: CircuitComponent; node: string }[];
  terminalA: string;
  ground: string;
  loadLabel: string;
  currentMark?: { compId: string; label: string };
};

/** 이 렌더러가 그릴 수 있는 구조인지 — 종속전원 + 단자 a-b 부하 + 단일 전압원 사다리. */
export function detectTheveninDependent(netlist: CircuitNetlist): Detected | null {
  const comps = netlist.components ?? [];
  if (comps.length === 0) return null;
  const ground = netlist.ground ?? "GND";
  const isGnd = (n: string) => GROUND_LABELS.has(n) || n === ground;

  if (!comps.some((c) => DEP_TYPES.has(c.type))) return null;          // 종속전원 필수
  if (comps.some((c) => c.type === "L" || c.type === "C")) return null; // DC 저항망만
  if (comps.some((c) => (c.pins ?? []).length !== 2)) return null;

  const load = (netlist.loadPlaceholders ?? [])[0];
  if (!load) return null;
  const terminalA = load.betweenNodes?.[0];
  if (!terminalA) return null;

  const vSources = comps.filter((c) => c.type === "V");
  if (vSources.length !== 1) return null;
  const vSource = vSources[0];
  const vNodes = vSource.pins.map((p) => p.node);
  const vTopNode = vNodes.find((n) => !isGnd(n));
  if (!vTopNode || !vNodes.some(isGnd)) return null;   // 전압원은 좌측 세로 leg

  // 상단 rail: 접지에 닿지 않는 소자들로 vTopNode → terminalA 경로 탐색.
  const railCands = comps.filter(
    (c) => c.id !== vSource.id && !c.pins.some((p) => isGnd(p.node)),
  );
  const railPath: Detected["railPath"] = [];
  let cur = vTopNode;
  const used = new Set<string>();
  for (let guard = 0; guard < 12 && cur !== terminalA; guard++) {
    const next = railCands.find(
      (c) => !used.has(c.id) && c.pins.some((p) => p.node === cur),
    );
    if (!next) break;
    used.add(next.id);
    const to = next.pins.map((p) => p.node).find((n) => n !== cur) ?? cur;
    railPath.push({ comp: next, from: cur, to });
    cur = to;
  }
  if (cur !== terminalA) return null;   // 단자 a까지 직렬로 이어지지 않으면 이 배치가 아님

  // shunt: 상단 노드 ↔ 접지 (전압원 제외)
  const shunts = comps
    .filter((c) => c.id !== vSource.id && c.pins.some((p) => isGnd(p.node)) && c.pins.some((p) => !isGnd(p.node)))
    .map((c) => ({ comp: c, node: c.pins.map((p) => p.node).find((n) => !isGnd(n))! }));
  if (shunts.length === 0) return null;

  const mark = (netlist.measurementMarks ?? []).find((m) => m.kind === "current" && m.refs.length > 0);

  return {
    vSource, vTopNode, railPath, shunts, terminalA, ground,
    loadLabel: load.label ?? "R_L",
    currentMark: mark ? { compId: mark.refs[0], label: mark.label } : undefined,
  };
}

export function renderTheveninDependentCircuit(netlist: CircuitNetlist, d: Detected): string {
  const s: string[] = [];   // 배선·심볼
  const t: string[] = [];   // 라벨 (심볼 위에 그림)

  // ── 좌표 슬롯
  const X0 = 100;                       // 전압원 column
  const SEG = 150;                      // rail 구간 폭
  const TOP = 120;                      // 상단 rail y
  const BOT = 430;                      // 하단 rail y
  const railNodes: string[] = [d.vTopNode, ...d.railPath.map((r) => r.to)];
  const xOf = new Map<string, number>();
  railNodes.forEach((n, i) => xOf.set(n, X0 + SEG * (i + 1)));
  const xA = xOf.get(d.terminalA)!;
  const xLoad = xA + 110;               // 부하 R_L column (단자 a 우측)
  const W = xLoad + 90;
  const H = BOT + 70;

  // ── 하단 공통 도선 + 접지
  s.push(line(X0, BOT, xLoad, BOT));
  const xGnd = Math.round((X0 + xA) / 2);
  s.push(ground(xGnd, BOT));

  // ── 좌측 전압원 (수직) + 상단 첫 노드까지
  s.push(vSourceSym(X0, TOP, BOT, String(d.vSource.value ?? "")));
  t.push(text(X0 - 34, (TOP + BOT) / 2 + 4, String(d.vSource.value ?? ""), { size: 12, weight: 600, anchor: "end" }));
  t.push(text(X0 - 34, (TOP + BOT) / 2 - 12, d.vSource.id, { size: 12, weight: 700, anchor: "end", fill: "#1d4ed8" }));

  // ── 상단 rail (직렬 소자들)
  let prevX = X0;
  for (const seg of d.railPath) {
    const x2 = xOf.get(seg.to)!;
    // ★ 직렬 가지에도 종속전원이 온다 (임용 9번: 9V — 5Ω — ◇2i_x — 1Ω — …).
    //   shunt 쪽만 DEP_TYPES를 검사하고 여기선 전부 hRes로 그려, **종속전원이 저항 지그재그로**
    //   표시됐다(사용자 신고 2026-08-04). 다이아몬드는 이 유형의 핵심 기호라 저항으로 그리면
    //   문제가 통째로 달라 보인다.
    if (DEP_TYPES.has(seg.comp.type)) {
      s.push(hDepSourceSym(prevX, x2, TOP, seg.comp.type));
      t.push(text((prevX + x2) / 2, TOP + 44, String(seg.comp.value ?? ""), { size: 12, weight: 600 }));
    } else {
      hRes(s, t, prevX, x2, TOP, seg.comp.id, String(seg.comp.value ?? ""));
    }
    // 제어 전류 i_x 화살표 — 해당 소자 위에
    if (d.currentMark && d.currentMark.compId === seg.comp.id) {
      const cx = (prevX + x2) / 2;
      s.push(`<line x1="${cx - 20}" y1="${TOP - 26}" x2="${cx + 16}" y2="${TOP - 26}" stroke="${RED}" stroke-width="1.6"/>`);
      s.push(`<path d="M${cx + 16},${TOP - 26} L${cx + 9},${TOP - 30} L${cx + 9},${TOP - 22} Z" fill="${RED}"/>`);
      t.push(text(cx - 24, TOP - 22, d.currentMark.label, { size: 13, weight: 700, fill: RED, anchor: "end" }));
    }
    prevX = x2;
  }

  // ── shunt 가지 — 같은 노드에 여러 개면 좌우로 벌려 겹침 방지
  const byNode = new Map<string, typeof d.shunts>();
  for (const sh of d.shunts) {
    if (!byNode.has(sh.node)) byNode.set(sh.node, []);
    byNode.get(sh.node)!.push(sh);
  }
  for (const [node, list] of byNode) {
    const baseX = xOf.get(node);
    if (baseX === undefined) continue;
    const spread = 62;
    const startX = baseX - ((list.length - 1) * spread) / 2;
    list.forEach((sh, i) => {
      const x = Math.round(startX + spread * i);
      // 노드에서 가지까지 상단 연결
      if (x !== baseX) s.push(line(baseX, TOP, x, TOP));
      if (DEP_TYPES.has(sh.comp.type)) {
        s.push(depSourceSym(x, TOP, BOT, sh.comp.type));
        t.push(text(x + 32, (TOP + BOT) / 2 + 4, String(sh.comp.value ?? ""), { size: 12, weight: 600, anchor: "start" }));
      } else {
        vRes(s, t, x, TOP, BOT, sh.comp.id, String(sh.comp.value ?? ""));
      }
      // ★ 제어 전류 i_x가 세로 가지에 흐르는 경우 (원본 임용 9번이 그렇다: i_x는 미지 저항 R을 흐른다).
      //   직렬 가지에만 화살표를 그려 세로 가지일 때 통째로 빠져 있었다 — 그러면 학생이
      //   i_x가 어느 가지인지 알 수 없어 종속전원 값을 해석하지 못한다.
      if (d.currentMark && d.currentMark.compId === sh.comp.id) {
        const ay = (TOP + BOT) / 2, ax = x - 30;
        s.push(`<line x1="${ax}" y1="${ay - 20}" x2="${ax}" y2="${ay + 14}" stroke="${RED}" stroke-width="1.6"/>`);
        s.push(`<path d="M${ax},${ay + 14} L${ax - 4},${ay + 7} L${ax + 4},${ay + 7} Z" fill="${RED}"/>`);
        t.push(text(ax - 6, ay - 22, d.currentMark.label, { size: 13, weight: 700, fill: RED, anchor: "end" }));
      }
    });
    s.push(dot(baseX, TOP));
  }

  // ── 단자 a·b + 부하 R_L (점선 박스)
  s.push(line(xA, TOP, xLoad, TOP));
  s.push(terminalCircle(xLoad, TOP));
  s.push(terminalCircle(xLoad, BOT));
  t.push(text(xLoad + 16, TOP - 6, "a", { size: 14, weight: 700, fill: RED, anchor: "start" }));
  t.push(text(xLoad + 16, BOT + 14, "b", { size: 14, weight: 700, fill: RED, anchor: "start" }));
  // R_L 점선 세로 박스
  const cy = (TOP + BOT) / 2;
  const bw = 46, bh = 76;
  s.push(line(xLoad, TOP + 6, xLoad, cy - bh / 2));
  s.push(line(xLoad, cy + bh / 2, xLoad, BOT - 6));
  s.push(`<rect x="${xLoad - bw / 2}" y="${cy - bh / 2}" width="${bw}" height="${bh}" fill="white" stroke="${LOAD}" stroke-width="2" stroke-dasharray="5,3"/>`);
  t.push(text(xLoad, cy + 5, d.loadLabel, { size: 13, weight: 700, fill: LOAD }));

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

function vRes(s: string[], t: string[], x: number, y1: number, y2: number, id: string, label: string): void {
  const cy = (y1 + y2) / 2, half = 30, a = 7, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(x + a + 8, cy - 4, id, { size: 12, weight: 700, anchor: "start", fill: "#1d4ed8" }));
  t.push(text(x + a + 8, cy + 12, label, { size: 12, weight: 600, anchor: "start" }));
}

/** 직류 전압원 (원 + 극성). */
function vSourceSym(cx: number, topY: number, botY: number, _label: string): string {
  const cy = (topY + botY) / 2, r = 22;
  void _label;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="14" font-weight="700" fill="${RED}">+</text>` +
    `<text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="16" font-weight="700" fill="${RED}">−</text>`;
}

/** 종속전원 다이아몬드 — 전류원(화살표) / 전압원(+/−). */
function depSourceSym(cx: number, topY: number, botY: number, type: string): string {
  const cy = (topY + botY) / 2, r = 26;
  const dia = `<path d="M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const inner = type === "CCCS" || type === "VCCS"
    ? `<line x1="${cx}" y1="${cy + 13}" x2="${cx}" y2="${cy - 9}" stroke="${STROKE}" stroke-width="1.6"/>` +
      `<path d="M${cx - 5},${cy - 6} L${cx},${cy - 15} L${cx + 5},${cy - 6} Z" fill="${STROKE}"/>`
    : `<text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${RED}">+</text>` +
      `<text x="${cx}" y="${cy + 15}" text-anchor="middle" font-size="15" font-weight="700" fill="${RED}">−</text>`;
  return `${dia}${inner}` +
    `<line x1="${cx}" y1="${topY}" x2="${cx}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx}" y1="${cy + r}" x2="${cx}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

/**
 * 가로(직렬) 종속전원 — 다이아몬드. `depSourceSym`의 가로 버전.
 *  · 전압원(CCVS/VCVS): 좌 +, 우 − (전류가 좌→우로 흐르며 전압 강하)
 *  · 전류원(CCCS/VCCS): 안쪽에 오른쪽 화살표
 */
function hDepSourceSym(x1: number, x2: number, y: number, type: string): string {
  const cx = (x1 + x2) / 2, r = 26;
  const dia = `<path d="M${cx},${y - r} L${cx + r},${y} L${cx},${y + r} L${cx - r},${y} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
  const inner = type === "CCCS" || type === "VCCS"
    ? `<line x1="${cx - 13}" y1="${y}" x2="${cx + 9}" y2="${y}" stroke="${STROKE}" stroke-width="1.6"/>` +
      `<path d="M${cx + 6},${y - 5} L${cx + 15},${y} L${cx + 6},${y + 5} Z" fill="${STROKE}"/>`
    : `<text x="${cx - 11}" y="${y + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="${RED}">+</text>` +
      `<text x="${cx + 11}" y="${y + 5}" text-anchor="middle" font-size="15" font-weight="700" fill="${RED}">−</text>`;
  return `${dia}${inner}` +
    `<line x1="${x1}" y1="${y}" x2="${cx - r}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx + r}" y1="${y}" x2="${x2}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}

function terminalCircle(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="4.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
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
  return `<circle cx="${x}" cy="${y}" r="3.2" fill="${STROKE}"/>`;
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
