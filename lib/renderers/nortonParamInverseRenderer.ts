/**
 * 노튼 등가 + 파라미터 역산 (임용 5번) 전용 fixed-slot 렌더러 — (가)·(나) 두 그림.
 *
 * (가) 원본 배치 그대로:
 *            ┌──── (→)I_s ────┐
 *      ┌─────P──── a[Ω] ──────Q───o A
 *   V_s│    R_p           R_mid(2a)
 *      └─────R──── a[Ω] ──────S───o B
 *   · V_s 와 R_p 는 P–R 사이(좌측, 서로 병렬) · I_s 는 상단에서 a[Ω]과 병렬
 *
 * (나) 노튼 등가: I_N(↑) ∥ R_N ∥ R_L, 단자 A(위)·B(아래)
 */
import type { CircuitComponent, CircuitNetlist } from "@/types";

const STROKE = "#111827";
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

const val = (c: CircuitComponent | undefined, fb: string) =>
  c?.value === undefined || c?.value === null || c?.value === "" ? fb : String(c.value);

export function detectNortonOriginal(n: CircuitNetlist | undefined | null): boolean {
  const ids = new Set((n?.components ?? []).map((c) => c.id));
  return ["V_s", "R_p", "I_s", "R_top", "R_bot", "R_mid"].every((id) => ids.has(id));
}
export function detectNortonEquivalent(n: CircuitNetlist | undefined | null): boolean {
  const ids = new Set((n?.components ?? []).map((c) => c.id));
  return ids.size === 3 && ["I_N", "R_N", "R_L"].every((id) => ids.has(id));
}

function txt(x: number, y: number, s: string, o: { anchor?: string; fill?: string; size?: number; weight?: number } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" fill="${o.fill ?? STROKE}" font-size="${o.size ?? 12}"${o.weight ? ` font-weight="${o.weight}"` : ""}>${s}</text>`;
}
const wire = (x1: number, y1: number, x2: number, y2: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="1.6"/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${STROKE}"/>`;
const term = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="4" fill="#fff" stroke="${STROKE}" stroke-width="1.6"/>`;

function resH(cx: number, cy: number) {
  const w = 40, h = 7, x = cx - w / 2;
  let d = `M ${x} ${cy}`;
  for (let i = 0; i < 6; i++) d += ` L ${x + (w / 6) * (i + 0.5)} ${cy + (i % 2 === 0 ? -h : h)}`;
  return `<path d="${d} L ${x + w} ${cy}" fill="none" stroke="${STROKE}" stroke-width="1.6"/>`;
}
function resV(cx: number, cy: number) {
  const hh = 40, w = 7, y = cy - hh / 2;
  let d = `M ${cx} ${y}`;
  for (let i = 0; i < 6; i++) d += ` L ${cx + (i % 2 === 0 ? -w : w)} ${y + (hh / 6) * (i + 0.5)}`;
  return `<path d="${d} L ${cx} ${y + hh}" fill="none" stroke="${STROKE}" stroke-width="1.6"/>`;
}
/** 전원 원 — kind "V"는 +/−, "I"는 화살표. */
function src(cx: number, cy: number, kind: "V" | "I", dir: "up" | "right" = "up") {
  let s = `<circle cx="${cx}" cy="${cy}" r="16" fill="#fff" stroke="${STROKE}" stroke-width="1.6"/>`;
  if (kind === "V") {
    s += txt(cx, cy - 3, "+", { size: 12, fill: MUTED });
    s += txt(cx, cy + 12, "−", { size: 12, fill: MUTED });
  } else if (dir === "right") {
    s += `<line x1="${cx - 9}" y1="${cy}" x2="${cx + 7}" y2="${cy}" stroke="${STROKE}" stroke-width="1.5" marker-end="url(#nptArrow)"/>`;
  } else {
    s += `<line x1="${cx}" y1="${cy + 9}" x2="${cx}" y2="${cy - 7}" stroke="${STROKE}" stroke-width="1.5" marker-end="url(#nptArrow)"/>`;
  }
  return s;
}
const defs =
  `<defs><marker id="nptArrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">` +
  `<path d="M0,0 L8,4 L0,8 z" fill="${STROKE}"/></marker></defs>`;
const svg = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w} ${h}" font-family="ui-sans-serif, system-ui, sans-serif">` +
  `${defs}<rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;

/** (가) 원본 회로. */
export function renderNortonOriginal(n: CircuitNetlist): string {
  const c = (id: string) => (n.components ?? []).find((x) => x.id === id);
  const W = 600, H = 290;
  const xV = 120, xP = 205, xQ = 400, xT = 520;
  const yIs = 62, y1 = 118, y2 = 212;
  let s = "";

  // 좌측: V_s (세로) + 상·하 레일
  s += wire(xV, y1, xP, y1) + wire(xV, y2, xP, y2);
  s += wire(xV, y1, xV, y1 + 31) + wire(xV, y2, xV, y2 - 31);
  s += src(xV, (y1 + y2) / 2, "V");
  s += txt(xV - 24, (y1 + y2) / 2 + 4, val(c("V_s"), "4[V]"), { anchor: "end", fill: ACCENT, size: 12, weight: 600 });

  // R_p (세로, V_s 와 병렬)
  s += wire(xP, y1, xP, y2);
  s += `<rect x="${xP - 9}" y="${(y1 + y2) / 2 - 22}" width="18" height="44" fill="#fff" stroke="none"/>`;
  s += resV(xP, (y1 + y2) / 2);
  s += txt(xP + 12, (y1 + y2) / 2 + 4, val(c("R_p"), "2[Ω]"), { anchor: "start", size: 12 });

  // 상단 행: P ─ a[Ω] ─ Q,  그 위에 I_s (병렬)
  s += wire(xP, y1, xQ, y1);
  s += `<rect x="${(xP + xQ) / 2 - 22}" y="${y1 - 9}" width="44" height="18" fill="#fff" stroke="none"/>`;
  s += resH((xP + xQ) / 2, y1);
  s += txt((xP + xQ) / 2, y1 - 14, val(c("R_top"), "a[Ω]"), { fill: ACCENT, size: 12 });
  s += wire(xP, y1, xP, yIs) + wire(xQ, y1, xQ, yIs);
  s += wire(xP, yIs, (xP + xQ) / 2 - 16, yIs) + wire((xP + xQ) / 2 + 16, yIs, xQ, yIs);
  s += src((xP + xQ) / 2, yIs, "I", "right");
  s += txt((xP + xQ) / 2, yIs - 24, val(c("I_s"), "4[A]"), { fill: ACCENT, size: 12, weight: 600 });

  // 하단 행: R ─ a[Ω] ─ S
  s += wire(xP, y2, xQ, y2);
  s += `<rect x="${(xP + xQ) / 2 - 22}" y="${y2 - 9}" width="44" height="18" fill="#fff" stroke="none"/>`;
  s += resH((xP + xQ) / 2, y2);
  s += txt((xP + xQ) / 2, y2 + 20, val(c("R_bot"), "a[Ω]"), { fill: ACCENT, size: 12 });

  // R_mid (2a) — Q ─ S
  s += wire(xQ, y1, xQ, y2);
  s += `<rect x="${xQ - 9}" y="${(y1 + y2) / 2 - 22}" width="18" height="44" fill="#fff" stroke="none"/>`;
  s += resV(xQ, (y1 + y2) / 2);
  s += txt(xQ + 12, (y1 + y2) / 2 + 4, val(c("R_mid"), "2a[Ω]"), { anchor: "start", fill: ACCENT, size: 12 });

  s += dot(xP, y1) + dot(xP, y2) + dot(xQ, y1) + dot(xQ, y2);

  // 단자 A·B
  s += wire(xQ, y1, xT, y1) + wire(xQ, y2, xT, y2);
  s += term(xT, y1) + term(xT, y2);
  s += txt(xT + 12, y1 + 4, "A", { anchor: "start", fill: RED, size: 13, weight: 700 });
  s += txt(xT + 12, y2 + 4, "B", { anchor: "start", fill: RED, size: 13, weight: 700 });

  // 점선 영역 (노튼 등가로 변환할 부분)
  s += `<rect x="${xV - 46}" y="${yIs - 42}" width="${xQ + 40 - (xV - 46)}" height="${y2 + 34 - (yIs - 42)}" fill="none" stroke="${MUTED}" stroke-width="1.1" stroke-dasharray="5 4"/>`;
  s += txt(W / 2, H - 8, "(가)", { size: 12.5, weight: 700 });
  return svg(W, H, s);
}

/** (나) 노튼 등가 회로. */
export function renderNortonEquivalent(n: CircuitNetlist): string {
  const c = (id: string) => (n.components ?? []).find((x) => x.id === id);
  const W = 420, H = 235;
  const xI = 105, xR = 200, xL = 300;
  const y1 = 55, y2 = 175;
  let s = "";

  s += wire(xI, y1, xL, y1) + wire(xI, y2, xL, y2);
  // I_N
  s += wire(xI, y1, xI, (y1 + y2) / 2 - 16) + wire(xI, (y1 + y2) / 2 + 16, xI, y2);
  s += src(xI, (y1 + y2) / 2, "I", "up");
  s += txt(xI - 24, (y1 + y2) / 2 + 4, val(c("I_N"), "I_N"), { anchor: "end", fill: ACCENT, size: 12.5, weight: 700 });
  // R_N
  s += wire(xR, y1, xR, y2);
  s += `<rect x="${xR - 9}" y="${(y1 + y2) / 2 - 22}" width="18" height="44" fill="#fff" stroke="none"/>`;
  s += resV(xR, (y1 + y2) / 2);
  s += txt(xR + 12, (y1 + y2) / 2 + 4, val(c("R_N"), "R_N"), { anchor: "start", size: 12.5, weight: 700 });
  // R_L (+ I_L 화살표)
  s += wire(xL, y1, xL, y2);
  s += `<rect x="${xL - 9}" y="${(y1 + y2) / 2 - 22}" width="18" height="44" fill="#fff" stroke="none"/>`;
  s += resV(xL, (y1 + y2) / 2);
  s += txt(xL + 12, (y1 + y2) / 2 + 4, `R_L = ${val(c("R_L"), "4[Ω]")}`, { anchor: "start", fill: RED, size: 12, weight: 600 });
  s += `<line x1="${xL - 30}" y1="${y1 + 22}" x2="${xL - 30}" y2="${y1 + 52}" stroke="${ACCENT}" stroke-width="1.5" marker-end="url(#nptArrow)"/>`;
  s += txt(xL - 36, y1 + 40, "I_L", { anchor: "end", fill: ACCENT, size: 12, weight: 600 });

  s += dot(xR, y1) + dot(xR, y2);
  // 단자 A·B
  s += term(xL, y1) + term(xL, y2);
  s += txt(xL + 4, y1 - 12, "A", { fill: RED, size: 13, weight: 700 });
  s += txt(xL + 4, y2 + 20, "B", { fill: RED, size: 13, weight: 700 });
  s += txt(W / 2, H - 8, "(나)", { size: 12.5, weight: 700 });
  return svg(W, H, s);
}
