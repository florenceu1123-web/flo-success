/**
 * 제너 클리퍼 + 적분기 (임용 2번) 전용 fixed-slot 렌더러.
 *
 * 원본 배치 그대로:
 *          ┌── V_Z1 ▶|◀ V_Z2 ──┐          ┌───── C_f ─────┐
 *   v_s ─R_in─┬──────(−)\        │   ─R_int─┬──────(−)\      │
 *             └────────  U1 >─┬──┘          └────────  U2 >──┴─o v_o
 *                  GND─(+)/   │ v_1              GND─(+)/
 *
 * ★ 범용 아날로그 렌더러는 이 회로를 직렬 사슬로 펴서 **제너를 하나만** 그리고 귀환 경로를
 *   잃는다(실측 사용자 화면). 그래서 전용 렌더러가 필요하다.
 */
import type { CircuitComponent, CircuitNetlist } from "@/types";

const STROKE = "#111827";
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";
const W = 660;
const H = 300;

const val = (c: CircuitComponent | undefined, fb: string) =>
  c?.value === undefined || c?.value === null || c?.value === "" ? fb : String(c.value);

/** analogMeshRenderer dispatch 용 — 이 archetype 의 netlist 인지. */
export function detectZenerClipperCircuit(n: CircuitNetlist | undefined | null): boolean {
  const ids = new Set((n?.components ?? []).map((c) => c.id));
  return ["R_in", "D_Z1", "D_Z2", "U1", "R_int", "C_f", "U2"].every((id) => ids.has(id));
}

function txt(x: number, y: number, s: string, o: { anchor?: string; fill?: string; size?: number; weight?: number } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" fill="${o.fill ?? STROKE}" font-size="${o.size ?? 11.5}"${o.weight ? ` font-weight="${o.weight}"` : ""}>${s}</text>`;
}
const wire = (x1: number, y1: number, x2: number, y2: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="1.6"/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${STROKE}"/>`;

function resH(cx: number, cy: number) {
  const w = 38, h = 7, x = cx - w / 2;
  let d = `M ${x} ${cy}`;
  for (let i = 0; i < 6; i++) d += ` L ${x + (w / 6) * (i + 0.5)} ${cy + (i % 2 === 0 ? -h : h)}`;
  return `<path d="${d} L ${x + w} ${cy}" fill="none" stroke="${STROKE}" stroke-width="1.6"/>`;
}
/** 제너 다이오드 — 삼각형 + 꺾인 캐소드 바. dir=1 이면 오른쪽을 향한다. */
function zener(cx: number, cy: number, dir: 1 | -1) {
  const s = 9, b = dir * s;
  const bar = cx + b;
  return (
    `<path d="M ${cx - b} ${cy - s} L ${bar} ${cy} L ${cx - b} ${cy + s} Z" fill="#fff" stroke="${STROKE}" stroke-width="1.5"/>` +
    `<path d="M ${bar} ${cy - s} L ${bar} ${cy + s}" stroke="${STROKE}" stroke-width="1.7"/>` +
    // 제너 특유의 꺾인 끝
    `<path d="M ${bar} ${cy - s} L ${bar - dir * 5} ${cy - s - 4}" stroke="${STROKE}" stroke-width="1.5"/>` +
    `<path d="M ${bar} ${cy + s} L ${bar + dir * 5} ${cy + s + 4}" stroke="${STROKE}" stroke-width="1.5"/>`
  );
}
/** 커패시터 (가로). */
function capH(cx: number, cy: number) {
  return (
    `<line x1="${cx - 4}" y1="${cy - 11}" x2="${cx - 4}" y2="${cy + 11}" stroke="${STROKE}" stroke-width="1.8"/>` +
    `<line x1="${cx + 4}" y1="${cy - 11}" x2="${cx + 4}" y2="${cy + 11}" stroke="${STROKE}" stroke-width="1.8"/>`
  );
}
/** 연산 증폭기 삼각형 — 입력 (−)위 (+)아래, 출력 오른쪽. */
function opamp(x: number, yc: number, label: string) {
  const w = 46, h = 46;
  return (
    `<path d="M ${x} ${yc - h / 2} L ${x + w} ${yc} L ${x} ${yc + h / 2} Z" fill="#fff" stroke="${STROKE}" stroke-width="1.6"/>` +
    txt(x + 12, yc - 7, "−", { fill: STROKE, size: 16, weight: 700 }) +
    txt(x + 12, yc + 16, "+", { fill: STROKE, size: 14, weight: 700 }) +
    txt(x + w / 2, yc - h / 2 - 6, label, { fill: MUTED, size: 10.5 })
  );
}
/** 접지 기호. */
function gnd(x: number, y: number) {
  return wire(x, y, x, y + 7) +
    `<line x1="${x - 11}" y1="${y + 7}" x2="${x + 11}" y2="${y + 7}" stroke="${STROKE}" stroke-width="1.7"/>` +
    `<line x1="${x - 7}" y1="${y + 11}" x2="${x + 7}" y2="${y + 11}" stroke="${STROKE}" stroke-width="1.5"/>` +
    `<line x1="${x - 3}" y1="${y + 15}" x2="${x + 3}" y2="${y + 15}" stroke="${STROKE}" stroke-width="1.5"/>`;
}

export function renderZenerClipperCircuit(n: CircuitNetlist): string {
  const c = (id: string) => (n.components ?? []).find((x) => x.id === id);
  // 1단
  const xIn = 40, xR1 = 105, xN1 = 165, xU1 = 205, xV1 = 300;
  // 2단
  const xR2 = 360, xN2 = 425, xU2 = 465, xOut = 605;
  const yc = 165;          // 반전 입력 라인
  const yFb1 = 92;         // 1단 귀환(제너) 높이
  const yFb2 = 82;         // 2단 귀환(커패시터) 높이
  let s = "";

  // ── 1단: v_s ─R_in─ N1 ─(−)U1 → v_1 ──
  s += wire(xIn, yc, xR1 - 19, yc);
  s += resH(xR1, yc);
  s += txt(xR1, yc - 14, val(c("R_in"), "10[kΩ]"), { fill: ACCENT });
  s += wire(xR1 + 19, yc, xU1, yc);
  s += `<circle cx="${xIn}" cy="${yc}" r="4" fill="#fff" stroke="${STROKE}" stroke-width="1.5"/>`;
  s += txt(xIn - 8, yc + 4, "v_s(t)", { anchor: "end", fill: RED, size: 12, weight: 700 });
  s += opamp(xU1, yc, "U1");
  s += wire(xU1, yc + 16, xU1 - 22, yc + 16) + wire(xU1 - 22, yc + 16, xU1 - 22, yc + 36);
  s += gnd(xU1 - 22, yc + 36);
  s += wire(xU1 + 46, yc, xV1, yc);
  s += dot(xV1, yc);
  s += txt(xV1, yc + 20, "v_1(t)", { fill: RED, size: 12, weight: 700 });

  // 1단 귀환: N1 ─┬─ 제너 2개 역직렬 ─┬─ v_1
  s += wire(xN1, yc, xN1, yFb1) + wire(xV1, yc, xV1, yFb1);
  const zc = (xN1 + xV1) / 2;
  s += wire(xN1, yFb1, zc - 34, yFb1) + wire(zc + 34, yFb1, xV1, yFb1);
  s += zener(zc - 17, yFb1, 1);
  s += zener(zc + 17, yFb1, -1);
  s += wire(zc - 8, yFb1, zc + 8, yFb1);
  s += dot(xN1, yc);
  s += txt(zc, yFb1 - 20, `V_{Z1} = V_{Z2} = ${String(val(c("D_Z1"), "5[V]")).replace(/^V_Z1=/, "")}`,
    { fill: ACCENT, size: 11.5, weight: 600 });

  // ── 2단: v_1 ─R_int─ N2 ─(−)U2 → v_o (귀환 C_f) ──
  s += wire(xV1, yc, xR2 - 19, yc);
  s += resH(xR2, yc);
  s += txt(xR2, yc - 14, val(c("R_int"), "10[kΩ]"), { fill: ACCENT });
  s += wire(xR2 + 19, yc, xU2, yc);
  s += opamp(xU2, yc, "U2");
  s += wire(xU2, yc + 16, xU2 - 22, yc + 16) + wire(xU2 - 22, yc + 16, xU2 - 22, yc + 36);
  s += gnd(xU2 - 22, yc + 36);
  s += wire(xU2 + 46, yc, xOut, yc);
  s += `<circle cx="${xOut}" cy="${yc}" r="4" fill="#fff" stroke="${STROKE}" stroke-width="1.5"/>`;
  s += txt(xOut + 9, yc + 4, "v_o(t)", { anchor: "start", fill: RED, size: 12, weight: 700 });

  // 2단 귀환: N2 ─┬─ C_f ─┬─ v_o
  const xFbEnd = xOut - 40;
  s += wire(xN2, yc, xN2, yFb2) + wire(xFbEnd, yc, xFbEnd, yFb2);
  const cc = (xN2 + xFbEnd) / 2;
  s += wire(xN2, yFb2, cc - 4, yFb2) + wire(cc + 4, yFb2, xFbEnd, yFb2);
  s += capH(cc, yFb2);
  s += dot(xN2, yc) + dot(xFbEnd, yc);
  s += txt(cc, yFb2 - 18, val(c("C_f"), "0.01[μF]"), { fill: ACCENT, size: 11.5, weight: 600 });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, sans-serif">` +
    `<rect width="${W}" height="${H}" fill="#fff"/>${s}` +
    txt(W / 2, H - 10, "(가)", { size: 12.5, weight: 700 }) + `</svg>`;
}
