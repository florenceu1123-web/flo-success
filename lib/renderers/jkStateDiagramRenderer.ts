import type { JkStateDiagram } from "@/types";

/**
 * JK 카운터 상태도 전용 렌더러 — 사이클 링 배치.
 *  사이클 상태는 원(링) 위에 순서대로 배치 → 인접 상태끼리만 화살표(교차 없음).
 *  비순환(전이) 상태는 링 바깥에, 자신이 흘러 들어가는 사이클 상태 쪽에 놓고 점선 원 + 화살표로 진입 표시.
 */

const STROKE = "#111827";
const ACCENT = "#1d4ed8";
const NC = "#dc2626";      // 비순환 강조색
const MUTED = "#6b7280";

const W = 560, H = 510;
const CX = 280, CY = 240;
const R = 115;             // 사이클 링 반지름
const R_OUT = 195;         // 비순환 상태 반지름 (링 바깥, 상하 노드가 캔버스 안에 들어오도록)
const NODE_R = 26;

type D = JkStateDiagram;

export function renderJkStateDiagram(d: D): string {
  const parts: string[] = [];
  const N = d.cycle.length;
  // 사이클 노드 각도 — 12시에서 시계방향.
  const ang = (i: number) => (-90 + (360 / N) * i) * (Math.PI / 180);
  const cyclePos = d.cycle.map((_, i) => ({ x: CX + R * Math.cos(ang(i)), y: CY + R * Math.sin(ang(i)) }));
  const idxOf = (label: string) => d.cycle.indexOf(label);

  // ── 사이클 화살표 (i → i+1) : 인접 노드 간 직선 (교차 없음) ──
  for (let i = 0; i < N; i++) {
    const a = cyclePos[i], b = cyclePos[(i + 1) % N];
    parts.push(arrow(a, b, { color: STROKE }));
  }

  // ── 비순환 상태 : 링 바깥, 진입 대상 각도에 배치 (같은 대상이면 오프셋) ──
  const perTarget = new Map<number, number>();
  for (const nc of d.nonCyclic) {
    const tIdx = idxOf(nc.next);
    if (tIdx < 0) continue;
    const seen = perTarget.get(tIdx) ?? 0;
    perTarget.set(tIdx, seen + 1);
    // 대상 각도 기준으로 약간 벌려 배치
    const offset = (seen === 0 ? 0 : seen % 2 === 1 ? -1 : 1) * 22 * (Math.PI / 180);
    const a = ang(tIdx) + offset;
    const pos = { x: CX + R_OUT * Math.cos(a), y: CY + R_OUT * Math.sin(a) };
    parts.push(arrow(pos, cyclePos[tIdx], { color: NC, dashed: true }));
    parts.push(node(pos.x, pos.y, nc.state, { dashed: true, color: NC }));
  }

  // ── 사이클 노드 (비순환 위에 그려 겹침 방지) ──
  cyclePos.forEach((p, i) => parts.push(node(p.x, p.y, d.cycle[i], { color: ACCENT })));

  // 범례
  parts.push(text(16, H - 16, "● 사이클(순환) 상태", { size: 11, anchor: "start", fill: ACCENT }));
  parts.push(text(16, H - 2, "◌ 순환하지 않는 상태 (점선) — 사이클로 진입만 함", { size: 11, anchor: "start", fill: NC }));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">\n${parts.join("\n")}\n</svg>`;
}

/** 상태 노드(원 + 라벨). */
function node(x: number, y: number, label: string, o: { dashed?: boolean; color?: string }): string {
  const col = o.color ?? STROKE;
  const dash = o.dashed ? ` stroke-dasharray="5 3"` : "";
  return `<circle cx="${x}" cy="${y}" r="${NODE_R}" fill="white" stroke="${col}" stroke-width="1.8"${dash}/>` +
    `<text x="${x}" y="${y + 4}" text-anchor="middle" font-size="13" font-weight="700" fill="${col}">${esc(label)}</text>`;
}

/** a→b 화살표 (양쪽 노드 반지름만큼 트림 + 화살촉). */
function arrow(a: { x: number; y: number }, b: { x: number; y: number }, o: { color?: string; dashed?: boolean }): string {
  const col = o.color ?? STROKE;
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L, uy = dy / L;
  const x1 = a.x + ux * NODE_R, y1 = a.y + uy * NODE_R;
  const x2 = b.x - ux * NODE_R, y2 = b.y - uy * NODE_R;
  const dash = o.dashed ? ` stroke-dasharray="5 3"` : "";
  // 화살촉
  const hL = 9, hW = 5;
  const hx = x2 - ux * hL, hy = y2 - uy * hL;
  const px = -uy, py = ux;
  const head = `<polygon points="${x2},${y2} ${hx + px * hW},${hy + py * hW} ${hx - px * hW},${hy - py * hW}" fill="${col}"/>`;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.6"${dash}/>` + head;
}

function text(x: number, y: number, str: string, o: { size?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
