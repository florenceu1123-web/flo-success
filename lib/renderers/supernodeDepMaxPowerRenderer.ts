/**
 * 독립+종속 전원 슈퍼노드 파라미터 최대 전력 (임용 6번) 전용 fixed-slot 렌더러.
 *
 * 원본 배치 그대로:
 *        ┌────────── ◇ m·I_x ──────────┐        (상단: 종속 전압원)
 *        A ──R_1(a)── M ──R_2(a)── B            (중단: 두 저항)
 *   I_x ↓ R_x            V_s(a[V])      R_B     (하단: 세로 3가지)
 *       GND ─────────── GND ────────── GND
 *
 * ★ 범용 아날로그 렌더러는 종속 전압원을 저항 기호로 그려버린다(실측, theveninDepVoltage 선례).
 *   그래서 전용 렌더러가 필요하다.
 */
import type { CircuitComponent, CircuitNetlist } from "@/types";

const STROKE = "#111827";
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";
const W = 620;
const H = 340;

const val = (c: CircuitComponent | undefined, fb: string) =>
  c?.value === undefined || c?.value === null || c?.value === "" ? fb : String(c.value);

/** 이 netlist가 이 유형인지 — analogMeshRenderer dispatch용. */
export function detectSupernodeDepMaxPower(netlist: CircuitNetlist | undefined | null): boolean {
  const comps = netlist?.components ?? [];
  if (comps.length !== 6) return false;
  const ids = new Set(comps.map((c) => c.id));
  return ["R_x", "R_1", "R_2", "R_B", "V_s", "E_1"].every((id) => ids.has(id));
}

function txt(x: number, y: number, s: string, o: { anchor?: string; fill?: string; size?: number; weight?: number } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" fill="${o.fill ?? STROKE}" font-size="${o.size ?? 12}"${o.weight ? ` font-weight="${o.weight}"` : ""}>${s}</text>`;
}
function wire(x1: number, y1: number, x2: number, y2: number) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="1.6"/>`;
}
/** 가로 저항 (지그재그). */
function resH(cx: number, cy: number) {
  const w = 44, h = 8, x = cx - w / 2;
  let d = `M ${x} ${cy}`;
  for (let i = 0; i < 6; i++) d += ` L ${x + (w / 6) * (i + 0.5)} ${cy + (i % 2 === 0 ? -h : h)}`;
  d += ` L ${x + w} ${cy}`;
  return `<path d="${d}" fill="none" stroke="${STROKE}" stroke-width="1.6"/>`;
}
/** 세로 저항. */
function resV(cx: number, cy: number) {
  const hgt = 44, w = 8, y = cy - hgt / 2;
  let d = `M ${cx} ${y}`;
  for (let i = 0; i < 6; i++) d += ` L ${cx + (i % 2 === 0 ? -w : w)} ${y + (hgt / 6) * (i + 0.5)}`;
  d += ` L ${cx} ${y + hgt}`;
  return `<path d="${d}" fill="none" stroke="${STROKE}" stroke-width="1.6"/>`;
}
/** 접지 기호. */
function gnd(x: number, y: number) {
  return wire(x, y, x, y + 8) +
    `<line x1="${x - 13}" y1="${y + 8}" x2="${x + 13}" y2="${y + 8}" stroke="${STROKE}" stroke-width="1.8"/>` +
    `<line x1="${x - 8}" y1="${y + 13}" x2="${x + 8}" y2="${y + 13}" stroke="${STROKE}" stroke-width="1.6"/>` +
    `<line x1="${x - 3}" y1="${y + 18}" x2="${x + 3}" y2="${y + 18}" stroke="${STROKE}" stroke-width="1.6"/>`;
}

export function renderSupernodeDepMaxPower(netlist: CircuitNetlist): string {
  const c = (id: string) => (netlist.components ?? []).find((x) => x.id === id);
  const xA = 150, xM = 310, xB = 470;
  const yTop = 70, yMid = 150, yBot = 268;

  let s = "";

  // ── 상단: 종속 전압원(다이아몬드) A ↔ B ──
  s += wire(xA, yMid, xA, yTop) + wire(xB, yMid, xB, yTop);
  s += wire(xA, yTop, xM - 26, yTop) + wire(xM + 26, yTop, xB, yTop);
  s += `<path d="M ${xM} ${yTop - 20} L ${xM + 26} ${yTop} L ${xM} ${yTop + 20} L ${xM - 26} ${yTop} Z" fill="#fff" stroke="${STROKE}" stroke-width="1.6"/>`;
  s += txt(xM, yTop + 4, val(c("E_1"), "2I_x"), { fill: ACCENT, size: 12.5, weight: 700 });
  s += txt(xM - 34, yTop - 6, "+", { fill: MUTED, size: 12 });
  s += txt(xM + 34, yTop - 6, "−", { fill: MUTED, size: 12 });

  // ── 중단: A ─R_1─ M ─R_2─ B ──
  s += wire(xA, yMid, xB, yMid);
  s += `<rect x="${(xA + xM) / 2 - 24}" y="${yMid - 10}" width="48" height="20" fill="#fff" stroke="none"/>`;
  s += resH((xA + xM) / 2, yMid);
  s += txt((xA + xM) / 2, yMid - 16, val(c("R_1"), "a[Ω]"), { fill: ACCENT, size: 12 });
  s += `<rect x="${(xM + xB) / 2 - 24}" y="${yMid - 10}" width="48" height="20" fill="#fff" stroke="none"/>`;
  s += resH((xM + xB) / 2, yMid);
  s += txt((xM + xB) / 2, yMid - 16, val(c("R_2"), "a[Ω]"), { fill: ACCENT, size: 12 });

  // 노드 점·라벨
  for (const [x, label] of [[xA, "A"], [xB, "B"]] as Array<[number, string]>) {
    s += `<circle cx="${x}" cy="${yMid}" r="4" fill="${RED}"/>`;
  }
  s += `<circle cx="${xM}" cy="${yMid}" r="4" fill="${STROKE}"/>`;
  s += txt(xA - 16, yMid + 5, "A", { anchor: "end", fill: RED, size: 14, weight: 700 });
  s += txt(xB + 16, yMid + 5, "B", { anchor: "start", fill: RED, size: 14, weight: 700 });

  // ── 하단 세로 3가지 ──
  // A ─ R_x ─ GND  (I_x)
  s += wire(xA, yMid, xA, yBot);
  s += `<rect x="${xA - 10}" y="${(yMid + yBot) / 2 - 24}" width="20" height="48" fill="#fff" stroke="none"/>`;
  s += resV(xA, (yMid + yBot) / 2);
  s += txt(xA - 16, (yMid + yBot) / 2 + 4, val(c("R_x"), "2Ω"), { anchor: "end", size: 12 });
  // I_x 화살표
  s += `<line x1="${xA - 34}" y1="${yMid + 18}" x2="${xA - 34}" y2="${yMid + 52}" stroke="${ACCENT}" stroke-width="1.5" marker-end="url(#sndArrow)"/>`;
  s += txt(xA - 40, yMid + 34, "I_x", { anchor: "end", fill: ACCENT, size: 12, weight: 600 });
  s += gnd(xA, yBot);

  // M ─ V_s ─ GND
  s += wire(xM, yMid, xM, (yMid + yBot) / 2 - 18);
  s += `<circle cx="${xM}" cy="${(yMid + yBot) / 2}" r="18" fill="#fff" stroke="${STROKE}" stroke-width="1.6"/>`;
  s += txt(xM, (yMid + yBot) / 2 - 4, "+", { size: 12, fill: MUTED });
  s += txt(xM, (yMid + yBot) / 2 + 12, "−", { size: 12, fill: MUTED });
  s += txt(xM + 26, (yMid + yBot) / 2 + 4, val(c("V_s"), "a[V]"), { anchor: "start", fill: ACCENT, size: 12 });
  s += wire(xM, (yMid + yBot) / 2 + 18, xM, yBot);
  s += gnd(xM, yBot);

  // B ─ R_B ─ GND  (V_B)
  s += wire(xB, yMid, xB, yBot);
  s += `<rect x="${xB - 10}" y="${(yMid + yBot) / 2 - 24}" width="20" height="48" fill="#fff" stroke="none"/>`;
  s += resV(xB, (yMid + yBot) / 2);
  s += txt(xB + 16, (yMid + yBot) / 2 + 4, `R_B = ${val(c("R_B"), "2a[Ω]")}`, { anchor: "start", fill: RED, size: 12, weight: 600 });
  // V_B 표시 (+ / −)
  s += txt(xB - 18, (yMid + yBot) / 2 - 16, "+", { anchor: "end", fill: MUTED, size: 12 });
  s += txt(xB - 18, (yMid + yBot) / 2 + 4, "V_B", { anchor: "end", fill: RED, size: 12, weight: 600 });
  s += txt(xB - 18, (yMid + yBot) / 2 + 22, "−", { anchor: "end", fill: MUTED, size: 12 });
  s += gnd(xB, yBot);

  // 슈퍼노드 표시 (A·B를 감싸는 점선)
  s += `<path d="M ${xA - 30} ${yMid - 34} L ${xB + 30} ${yMid - 34} L ${xB + 30} ${yMid + 22} L ${xA - 30} ${yMid + 22} Z" fill="none" stroke="${MUTED}" stroke-width="1.1" stroke-dasharray="5 4"/>`;
  s += txt(xA - 34, yMid - 40, "super node (A, B)", { anchor: "start", fill: MUTED, size: 10.5 });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, sans-serif">` +
    `<defs><marker id="sndArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">` +
    `<path d="M0,0 L8,4 L0,8 z" fill="${ACCENT}"/></marker></defs>` +
    `<rect width="${W}" height="${H}" fill="#fff"/>${s}</svg>`;
}
