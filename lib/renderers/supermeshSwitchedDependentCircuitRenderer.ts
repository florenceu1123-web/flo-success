import type { SupermeshSwitchedDependentCircuitDiagram } from "@/types";

/**
 * 스위치 2-state + 종속전류원 + supermesh (임용 8번 회로이론) 전용 fixed-slot 렌더러.
 *
 *  고정 토폴로지 (4 세로가지 + 상단 R 3개, mesh 3개):
 *    ①V_s ─R1─ ②[0.2·V₂ 종속전류원] ─R2─ ③[SW─R4─I_s 직렬] ─R3─ ④우외곽 도선, 모두 GND 복귀.
 *  swState=open → (가) SW 열림(arm 들림), closed → (나) SW 닫힘 + 초메쉬 a 점선.
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";
const PURPLE = "#7c3aed";

const W = 680, H = 420;
const TOP = 92, BOT = 340;
const VS_X = 72, DEP_X = 252, SW_X = 432, RT_X = 612;

type D = SupermeshSwitchedDependentCircuitDiagram;

export function renderSupermeshSwitchedDependentCircuit(d: D): string {
  const w: string[] = [];
  const s: string[] = [];
  const t: string[] = [];
  const closed = d.swState === "closed";

  // 하단 레일
  w.push(line(VS_X, BOT, RT_X, BOT));

  // ── 상단 레일: A=VS_X · V1=DEP_X · V2=SW_X · V3=RT_X (모두 y=TOP) ──
  // R1: A↔V1
  w.push(line(VS_X, TOP, VS_X + 18, TOP));
  hResistor(s, VS_X + 18, DEP_X - 18, TOP);
  w.push(line(DEP_X - 18, TOP, DEP_X, TOP));
  t.push(text((VS_X + DEP_X) / 2, TOP - 10, d.r1Label, { size: 11, weight: 600 }));
  // R2: V1↔V2
  w.push(line(DEP_X, TOP, DEP_X + 18, TOP));
  hResistor(s, DEP_X + 18, SW_X - 18, TOP);
  w.push(line(SW_X - 18, TOP, SW_X, TOP));
  t.push(text((DEP_X + SW_X) / 2, TOP - 10, d.r2Label, { size: 11, weight: 600 }));
  // R3: V2↔V3
  w.push(line(SW_X, TOP, SW_X + 18, TOP));
  hResistor(s, SW_X + 18, RT_X - 18, TOP);
  w.push(line(RT_X - 18, TOP, RT_X, TOP));
  t.push(text((SW_X + RT_X) / 2, TOP - 10, d.r3Label, { size: 11, weight: 600 }));

  // 노드 dot + 라벨 (V₁·V₂)
  s.push(dot(DEP_X, TOP)); t.push(text(DEP_X, TOP - 14, d.v1Label, { size: 12, weight: 700, fill: ACCENT }));
  s.push(dot(SW_X, TOP)); t.push(text(SW_X, TOP - 14, d.v2Label, { size: 12, weight: 700, fill: ACCENT }));

  // ── 가지 ①: V_s (A↔GND) ──
  dcSource(s, VS_X, TOP, BOT);
  t.push(text(VS_X - 26, (TOP + BOT) / 2 + 4, d.vsLabel, { anchor: "end", size: 12, weight: 700, fill: ACCENT }));

  // ── 가지 ②: 종속전류원 0.2·V₂ (V1↔GND, 다이아몬드 + 위 화살표) ──
  depCurrentSource(s, DEP_X, TOP, BOT);
  t.push(text(DEP_X + 24, (TOP + BOT) / 2 + 4, d.depLabel, { anchor: "start", size: 12, weight: 700, fill: PURPLE }));

  // ── 가지 ③: V2 ─ SW ─ R4 ─ I_s ─ GND (직렬) ──
  const swTop = TOP + 14, swBot = TOP + 52;
  const r4Top = TOP + 66, r4Bot = TOP + 126;
  const isTop = r4Bot + 14;
  w.push(line(SW_X, TOP, SW_X, swTop));
  switchSym(s, SW_X, swTop, swBot, closed);
  t.push(text(SW_X + 18, (swTop + swBot) / 2 + 4, "SW", { anchor: "start", size: 11, weight: 600 }));
  w.push(line(SW_X, swBot, SW_X, r4Top));
  vResistor(s, SW_X, r4Top, r4Bot);
  t.push(text(SW_X + 16, (r4Top + r4Bot) / 2 + 4, d.r4Label, { anchor: "start", size: 11, weight: 600 }));
  w.push(line(SW_X, r4Bot, SW_X, isTop));
  currentSource(s, SW_X, isTop, BOT);
  t.push(text(SW_X + 24, (isTop + BOT) / 2 + 4, d.isLabel, { anchor: "start", size: 12, weight: 700, fill: ACCENT }));

  // ── 가지 ④: 우외곽 도선 (V3↔GND) ──
  w.push(line(RT_X, TOP, RT_X, BOT));

  // ── 초메쉬 점선 a (나=closed) ──
  if (d.showSupermesh) {
    // ★ 초메쉬 a = **회로 전체를 감싸는 외곽 루프** (원본 확인, 2026-07-27).
    //   전류원 가지가 두 개다 — 종속전류원(0.2·V₂ 가지)과 독립 전류원(SW─R₄─I_s 가지).
    //   두 가지 모두 KVL을 쓸 수 없으므로 초메쉬는 **세 메쉬(I₁·I₂·I₃)를 전부 합친다**.
    //   따라서 점선은 두 전류원 가지를 **내부에 두고** 바깥 루프(V_s 가지·상단·우외곽·하단)를 따라 그린다.
    //   ※ 이전 구현은 오른쪽 두 메쉬만 감싸 종속전류원과 좌측 메쉬가 밖으로 빠져 있었다(실측 신고).
    const x1 = VS_X + 26, x2 = RT_X - 14;
    s.push(
      `<rect x="${x1}" y="${TOP + 16}" width="${x2 - x1}" height="${BOT - TOP - 34}" ` +
        `fill="none" stroke="${RED}" stroke-width="1.3" stroke-dasharray="6 4" rx="6"/>`,
    );
    t.push(text((VS_X + RT_X) / 2 + 56, BOT - 26, "a", { size: 13, weight: 700, fill: RED }));
  }

  // ground 심볼 (하단 레일 중앙)
  groundSym(s, (VS_X + RT_X) / 2, BOT);

  const cap = closed
    ? "(나) SW 닫힘 — 점선 a 초메쉬(supermesh)로 V₂·I₂ 도출"
    : "(가) SW 열림 — V₁·I₁ 도출";
  t.push(text(W / 2, H - 10, cap, { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

// ─── 심볼 ───────────────────────────────────────
function dcSource(out: string[], x: number, topY: number, botY: number): void {
  const cy = (topY + botY) / 2, r = 20;
  out.push(
    `<circle cx="${x}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<text x="${x}" y="${cy - 5}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">+</text>` +
      `<text x="${x}" y="${cy + 13}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">−</text>` +
      `<line x1="${x}" y1="${topY}" x2="${x}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x}" y1="${cy + r}" x2="${x}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`,
  );
}
function currentSource(out: string[], x: number, topY: number, botY: number): void {
  const cy = (topY + botY) / 2, r = 20;
  out.push(
    `<circle cx="${x}" cy="${cy}" r="${r}" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x}" y1="${cy + 11}" x2="${x}" y2="${cy - 11}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<path d="M${x - 4},${cy - 5} L${x},${cy - 12} L${x + 4},${cy - 5}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x}" y1="${topY}" x2="${x}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x}" y1="${cy + r}" x2="${x}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`,
  );
}
/** 종속전류원 — 다이아몬드 + 위 화살표(주입). */
function depCurrentSource(out: string[], x: number, topY: number, botY: number): void {
  const cy = (topY + botY) / 2, r = 22;
  out.push(
    `<path d="M${x},${cy - r} L${x + r},${cy} L${x},${cy + r} L${x - r},${cy} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x}" y1="${cy + 11}" x2="${x}" y2="${cy - 11}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<path d="M${x - 4},${cy - 5} L${x},${cy - 12} L${x + 4},${cy - 5}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x}" y1="${topY}" x2="${x}" y2="${cy - r}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x}" y1="${cy + r}" x2="${x}" y2="${botY}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`,
  );
}
/** 세로 스위치 — y1=상단 단자, y2=하단 hinge. closed=직선 연결, open=arm 들림. */
function switchSym(out: string[], x: number, y1: number, y2: number, closed: boolean): void {
  out.push(dot(x, y1));
  out.push(dot(x, y2));
  if (closed) {
    out.push(`<line x1="${x}" y1="${y2}" x2="${x}" y2="${y1}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  } else {
    // hinge(y2)에서 비스듬히 위로 — 상단 단자(y1)에 안 닿음
    out.push(`<line x1="${x}" y1="${y2}" x2="${x + 17}" y2="${y1 + 5}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  }
}
function vResistor(out: string[], x: number, y1: number, y2: number): void {
  const a = 7, teeth = 6, step = (y2 - y1) / teeth;
  let p = `M${x},${y1}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${y1 + step * (i + 0.5)}`;
  p += ` L${x},${y2}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
}
function hResistor(out: string[], x1: number, x2: number, y: number): void {
  const a = 7, teeth = 6, step = (x2 - x1) / teeth;
  let p = `M${x1},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${x1 + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${x2},${y}`;
  out.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
}
function groundSym(out: string[], x: number, y: number): void {
  out.push(
    `<line x1="${x}" y1="${y}" x2="${x}" y2="${y + 10}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x - 12}" y1="${y + 10}" x2="${x + 12}" y2="${y + 10}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x - 7}" y1="${y + 15}" x2="${x + 7}" y2="${y + 15}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
      `<line x1="${x - 3}" y1="${y + 20}" x2="${x + 3}" y2="${y + 20}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`,
  );
  out.push(`<text x="${x + 16}" y="${y + 20}" text-anchor="start" font-size="10" font-weight="700" fill="${RED}">GND</text>`);
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.2" fill="${STROKE}"/>`;
}
function text(
  x: number,
  y: number,
  str: string,
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
