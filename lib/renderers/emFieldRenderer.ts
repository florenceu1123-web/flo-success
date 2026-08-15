import type { EmFieldDiagram, EmGeometryKind } from "@/lib/generation/topologies/electromagnetics";

/**
 * 전자기학 전용 도식 렌더러 — geometry별 고정 슬롯 SVG.
 *
 * 회로 netlist가 아니라 전자기학의 "장(field)·기하" 그림을 그린다:
 *   점전하 방사 전계 / 두 전하 쿨롱힘 / 선전하·평면 / 평행판 / 직선도선·솔레노이드 자기장 /
 *   운동 도체봉 / 자기장 속 도선 힘 / 전자기파.
 *
 * diagram.labels의 값은 LaTeX(\mu, \mathrm, 첨자 등)이므로 texToPlain으로 유니코드 변환해 표기.
 */

const STROKE = "#1e3a8a"; // blue-900
const ACCENT = "#dc2626"; // red-600 (양전하·힘)
const FIELD = "#2563eb"; // blue-600 (장 화살표)
const MUTED = "#64748b"; // slate-500

// ── LaTeX → 유니코드 (SVG text용) ─────────────────────────────────────
const SUP: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const SUB: Record<string, string> = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", r: "ᵣ" };

function toSup(s: string): string { return s.split("").map((c) => SUP[c] ?? c).join(""); }
function toSub(s: string): string { return s.split("").map((c) => SUB[c] ?? c).join(""); }

function texToPlain(s: string | undefined): string {
  if (!s) return "";
  let t = s;
  t = t.replace(/\\mathrm\{([^}]*)\}/g, "$1");
  t = t.replace(/\\mathbf\{([^}]*)\}/g, "$1"); // \mathbf{a} → a (벡터 볼드)
  t = t.replace(/\\pi/g, "π");
  // 분수: \tfrac{1}{2}·\dfrac·\frac → ½ 또는 (a/b). (SVG text는 KaTeX 분수 못 그림)
  t = t.replace(/\\[tdc]?frac\s*\{1\}\s*\{2\}/g, "½");
  t = t.replace(/\\[tdc]?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1/$2)");
  t = t.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√$1"); // \sqrt{2} → √2
  t = t.replace(/\\varepsilon_0/g, "ε₀").replace(/\\varepsilon_r/g, "εᵣ").replace(/\\varepsilon/g, "ε");
  t = t.replace(/\\mu/g, "μ");
  t = t.replace(/\\lambda/g, "λ").replace(/\\sigma/g, "σ").replace(/\\Omega/g, "Ω");
  // ★ \rho는 \rho_L(선전하밀도)·\rho_s(면전하밀도)로 자주 쓰인다 — 없으면 "rho_L"이 그대로 찍힌다.
  t = t.replace(/\\rho/g, "ρ").replace(/\\phi/g, "φ").replace(/\\theta/g, "θ").replace(/\\Rightarrow/g, "⇒");
  t = t.replace(/\\nabla/g, "∇").replace(/\\ell/g, "ℓ").replace(/\\oint/g, "∮").replace(/\\partial/g, "∂");
  t = t.replace(/\\times/g, "×").replace(/\\cdot/g, "·");
  t = t.replace(/\\,/g, " ");
  // 위첨자
  t = t.replace(/\^\{(-?\d+)\}/g, (_m, p: string) => toSup(p));
  t = t.replace(/\^(-?\d)/g, (_m, p: string) => toSup(p));
  // 아래첨자
  t = t.replace(/_\{([0-9r]+)\}/g, (_m, p: string) => toSub(p));
  t = t.replace(/_([0-9r])/g, (_m, p: string) => toSub(p));
  t = t.replace(/[{}]/g, "").replace(/\\/g, "");
  return t.trim();
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function label(x: number, y: number, text: string, opts: { anchor?: string; fill?: string; size?: number; weight?: number } = {}): string {
  const { anchor = "middle", fill = STROKE, size = 13, weight = 500 } = opts;
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(texToPlain(text))}</text>`;
}

const W = 560;
const H = 300;

function svgWrap(inner: string, title?: string): string {
  const t = title ? `<text x="${W / 2}" y="20" text-anchor="middle" font-size="14" font-weight="700" fill="${STROKE}">${esc(texToPlain(title))}</text>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, sans-serif">` +
    `<defs>` +
    `<marker id="emArrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${FIELD}"/></marker>` +
    `<marker id="emArrowR" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="${ACCENT}"/></marker>` +
    `<marker id="emArrowD" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${MUTED}"/></marker>` +
    `<marker id="emArrowA" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="${STROKE}"/></marker>` +
    `</defs>` + t + inner + `</svg>`;
}

function arrow(x1: number, y1: number, x2: number, y2: number, color = FIELD, marker = "emArrow", width = 1.8): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" marker-end="url(#${marker})"/>`;
}

// ── geometry별 렌더 ──────────────────────────────────────────────────

function renderPointCharge(d: EmFieldDiagram): string {
  const L = d.labels;
  const cx = 180, cy = 160, R = 13;
  let s = "";
  // 방사형 전계선 (8 방향)
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    const x1 = cx + Math.cos(a) * (R + 4), y1 = cy + Math.sin(a) * (R + 4);
    const x2 = cx + Math.cos(a) * (R + 52), y2 = cy + Math.sin(a) * (R + 52);
    s += arrow(x1, y1, x2, y2, FIELD);
  }
  // 전하
  s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${ACCENT}" stroke="${STROKE}" stroke-width="1.5"/>`;
  s += `<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" font-weight="700" fill="white">+</text>`;
  // 측정점 P
  const px = 430;
  s += `<line x1="${cx + R}" y1="${cy}" x2="${px - 8}" y2="${cy}" stroke="${MUTED}" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#emArrowD)"/>`;
  s += `<circle cx="${px}" cy="${cy}" r="4" fill="${STROKE}"/>`;
  s += label(px + 14, cy + 5, `${L.point ?? "P"}`, { fill: STROKE, weight: 700 });
  s += label((cx + px) / 2, cy - 10, L.distance, { fill: MUTED });
  s += label(cx, cy + R + 24, L.charge, { fill: ACCENT, weight: 600 });
  s += label(cx + 60, cy - 44, `${texToPlain(L.field ?? "E")}`, { fill: FIELD, weight: 700, size: 15 });
  return svgWrap(s, d.title);
}

function renderTwoCharges(d: EmFieldDiagram): string {
  const L = d.labels;
  const y = 160, x1 = 150, x2 = 410, R = 14;
  let s = "";
  s += `<line x1="${x1 + R}" y1="${y}" x2="${x2 - R}" y2="${y}" stroke="${MUTED}" stroke-width="1.4" stroke-dasharray="5 4"/>`;
  // 척력 화살표 (서로 반대로 밀어냄)
  s += arrow(x1 - 6, y, x1 - 54, y, ACCENT, "emArrowR");
  s += arrow(x2 + 6, y, x2 + 54, y, ACCENT, "emArrowR");
  for (const [x, lab, key] of [[x1, "+", "q1"], [x2, "+", "q2"]] as const) {
    s += `<circle cx="${x}" cy="${y}" r="${R}" fill="${ACCENT}" stroke="${STROKE}" stroke-width="1.5"/>`;
    s += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" font-weight="700" fill="white">${lab}</text>`;
    s += label(x, y + R + 22, L[key], { fill: ACCENT, weight: 600 });
  }
  s += label((x1 + x2) / 2, y - 14, L.distance, { fill: MUTED });
  s += label(x1 - 30, y - 14, texToPlain(L.force ?? "F"), { fill: ACCENT, weight: 700, size: 15 });
  s += label(x2 + 30, y - 14, texToPlain(L.force ?? "F"), { fill: ACCENT, weight: 700, size: 15 });
  return svgWrap(s, d.title);
}

function renderLineCharge(d: EmFieldDiagram): string {
  const L = d.labels;
  const lx = 170, top = 60, bot = 250, py = 160;
  let s = "";
  // 도선(선전하)
  s += `<line x1="${lx}" y1="${top}" x2="${lx}" y2="${bot}" stroke="${ACCENT}" stroke-width="3"/>`;
  for (let yy = top + 10; yy < bot; yy += 26) s += `<text x="${lx - 9}" y="${yy + 4}" text-anchor="middle" font-size="11" fill="${ACCENT}">+</text>`;
  // 방사 전계 (오른쪽으로 여러 높이)
  for (const yy of [100, 130, 160, 190, 220]) s += arrow(lx + 4, yy, lx + 70, yy, FIELD);
  // 측정점
  const px = 410;
  s += `<line x1="${lx}" y1="${py}" x2="${px - 8}" y2="${py}" stroke="${MUTED}" stroke-width="1.5" stroke-dasharray="5 4" marker-end="url(#emArrowD)"/>`;
  s += `<circle cx="${px}" cy="${py}" r="4" fill="${STROKE}"/>`;
  s += label(px + 14, py + 5, L.point ?? "P", { weight: 700 });
  s += label((lx + px) / 2, py - 10, L.distance, { fill: MUTED });
  s += label(lx, bot + 22, L.lambda, { fill: ACCENT, weight: 600 });
  s += label(lx + 52, 92, texToPlain(L.field ?? "E"), { fill: FIELD, weight: 700, size: 15 });
  return svgWrap(s, d.title);
}

function renderChargedSheet(d: EmFieldDiagram): string {
  const L = d.labels;
  const sx = 280, top = 70, bot = 250;
  let s = "";
  s += `<line x1="${sx}" y1="${top}" x2="${sx}" y2="${bot}" stroke="${ACCENT}" stroke-width="4"/>`;
  for (let yy = top + 12; yy < bot; yy += 24) s += `<text x="${sx}" y="${yy + 4}" text-anchor="middle" font-size="12" fill="${ACCENT}">+</text>`;
  // 양쪽 균일 전계
  for (const yy of [100, 140, 180, 220]) {
    s += arrow(sx + 6, yy, sx + 90, yy, FIELD);
    s += arrow(sx - 6, yy, sx - 90, yy, FIELD);
  }
  s += label(sx, bot + 24, L.sigma, { fill: ACCENT, weight: 600 });
  s += label(sx + 100, 96, texToPlain(L.field ?? "E"), { fill: FIELD, weight: 700, size: 15 });
  s += label(sx - 100, 96, texToPlain(L.field ?? "E"), { fill: FIELD, weight: 700, size: 15 });
  return svgWrap(s, d.title);
}

function renderParallelPlates(d: EmFieldDiagram): string {
  const L = d.labels;
  const left = 170, right = 390, top = 90, bot = 210;
  let s = "";
  // 극판
  s += `<line x1="${left}" y1="${top}" x2="${right}" y2="${top}" stroke="${ACCENT}" stroke-width="4"/>`;
  s += `<line x1="${left}" y1="${bot}" x2="${right}" y2="${bot}" stroke="${STROKE}" stroke-width="4"/>`;
  for (let xx = left + 20; xx < right; xx += 36) s += `<text x="${xx}" y="${top - 6}" text-anchor="middle" font-size="12" fill="${ACCENT}">+</text>`;
  for (let xx = left + 20; xx < right; xx += 36) s += `<text x="${xx}" y="${bot + 16}" text-anchor="middle" font-size="12" fill="${STROKE}">−</text>`;
  // 내부 전계선 (위→아래)
  for (let xx = left + 24; xx < right; xx += 40) s += arrow(xx, top + 6, xx, bot - 6, FIELD);
  // 간격 d 치수선
  s += `<line x1="${right + 24}" y1="${top}" x2="${right + 24}" y2="${bot}" stroke="${MUTED}" stroke-width="1.2" marker-start="url(#emArrowD)" marker-end="url(#emArrowD)"/>`;
  s += label(right + 30, (top + bot) / 2 + 4, L.gap, { anchor: "start", fill: MUTED });
  s += label((left + right) / 2, top - 26, L.area, { fill: STROKE });
  if (L.epsR) s += label((left + right) / 2, (top + bot) / 2 + 5, L.epsR, { fill: MUTED, weight: 600 });
  s += label(left - 16, (top + bot) / 2 + 5, texToPlain(L.cap ?? "C"), { anchor: "end", fill: FIELD, weight: 700, size: 15 });
  if (L.voltage) s += label((left + right) / 2, bot + 40, L.voltage, { fill: STROKE });
  return svgWrap(s, d.title);
}

function renderStraightWire(d: EmFieldDiagram): string {
  const L = d.labels;
  const wx = 200, top = 60, bot = 250;
  let s = "";
  // 도선 + 전류 화살표
  s += `<line x1="${wx}" y1="${top}" x2="${wx}" y2="${bot}" stroke="${STROKE}" stroke-width="3"/>`;
  s += arrow(wx, 150, wx, top + 10, ACCENT, "emArrowR", 3);
  s += label(wx - 12, top + 4, L.current, { anchor: "end", fill: ACCENT, weight: 600 });
  // 원형 자기장 (동심 타원) + 측정점
  const cy = 160;
  for (const rr of [40, 70, 100]) {
    s += `<ellipse cx="${wx}" cy="${cy}" rx="${rr}" ry="${rr * 0.34}" fill="none" stroke="${FIELD}" stroke-width="1.4"/>`;
  }
  // 측정점 P (오른쪽)
  const px = wx + 100;
  s += `<line x1="${wx}" y1="${cy}" x2="${px}" y2="${cy}" stroke="${MUTED}" stroke-width="1.3" stroke-dasharray="5 4"/>`;
  s += `<circle cx="${px}" cy="${cy}" r="4" fill="${STROKE}"/>`;
  s += label((wx + px) / 2, cy - 8, L.distance, { fill: MUTED });
  s += label(wx + 116, cy + 40, texToPlain(L.field ?? "B"), { fill: FIELD, weight: 700, size: 15, anchor: "start" });
  return svgWrap(s, d.title);
}

function renderSolenoid(d: EmFieldDiagram): string {
  const L = d.labels;
  const left = 130, right = 430, cy = 160, ry = 44;
  let s = "";
  // 코일 (여러 타원)
  const loops = 9;
  for (let k = 0; k < loops; k++) {
    const x = left + (k * (right - left)) / (loops - 1);
    s += `<ellipse cx="${x}" cy="${cy}" rx="11" ry="${ry}" fill="none" stroke="${STROKE}" stroke-width="1.8"/>`;
  }
  // 내부 자기장 (→)
  s += arrow(left + 16, cy, right - 16, cy, FIELD, "emArrow", 2.2);
  s += label((left + right) / 2, cy - 12, texToPlain(L.field ?? "B"), { fill: FIELD, weight: 700, size: 15 });
  // 전류 표시
  s += label(left - 8, cy - ry - 8, L.current, { anchor: "start", fill: ACCENT, weight: 600 });
  s += label((left + right) / 2, cy + ry + 30, `${texToPlain(L.turns)},  ${texToPlain(L.length)}`, { fill: STROKE });
  return svgWrap(s, d.title);
}

/** 자기장(지면 안쪽) 영역 — ⊗ 격자. */
function fieldIntoPage(x0: number, y0: number, x1: number, y1: number): string {
  let s = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>`;
  for (let yy = y0 + 18; yy < y1; yy += 30) {
    for (let xx = x0 + 18; xx < x1; xx += 34) {
      s += `<circle cx="${xx}" cy="${yy}" r="6" fill="none" stroke="${FIELD}" stroke-width="1"/>`;
      s += `<line x1="${xx - 4.2}" y1="${yy - 4.2}" x2="${xx + 4.2}" y2="${yy + 4.2}" stroke="${FIELD}" stroke-width="1"/>`;
      s += `<line x1="${xx + 4.2}" y1="${yy - 4.2}" x2="${xx - 4.2}" y2="${yy + 4.2}" stroke="${FIELD}" stroke-width="1"/>`;
    }
  }
  return s;
}

function renderMovingRod(d: EmFieldDiagram): string {
  const L = d.labels;
  const x0 = 120, x1 = 460, top = 90, bot = 220;
  let s = fieldIntoPage(x0, top, x1, bot);
  // 레일
  s += `<line x1="${x0}" y1="${top}" x2="${x1}" y2="${top}" stroke="${STROKE}" stroke-width="2.5"/>`;
  s += `<line x1="${x0}" y1="${bot}" x2="${x1}" y2="${bot}" stroke="${STROKE}" stroke-width="2.5"/>`;
  // 저항 (변형) 또는 좌측 연결
  if (L.resistor) {
    s += `<rect x="${x0 - 4}" y="${(top + bot) / 2 - 16}" width="20" height="32" fill="white" stroke="${STROKE}" stroke-width="1.6" transform="rotate(0)"/>`;
    s += `<line x1="${x0 + 6}" y1="${top}" x2="${x0 + 6}" y2="${(top + bot) / 2 - 16}" stroke="${STROKE}" stroke-width="2"/>`;
    s += `<line x1="${x0 + 6}" y1="${(top + bot) / 2 + 16}" x2="${x0 + 6}" y2="${bot}" stroke="${STROKE}" stroke-width="2"/>`;
    s += label(x0 - 12, (top + bot) / 2 + 4, L.resistor, { anchor: "end", fill: STROKE, weight: 600 });
  } else {
    s += `<line x1="${x0}" y1="${top}" x2="${x0}" y2="${bot}" stroke="${STROKE}" stroke-width="2.5"/>`;
  }
  // 도체봉
  const rodx = 320;
  s += `<line x1="${rodx}" y1="${top - 6}" x2="${rodx}" y2="${bot + 6}" stroke="${ACCENT}" stroke-width="3.5"/>`;
  // 속도 v (라벨은 화살표 위로 충분히 띄워 겹침 방지)
  s += arrow(rodx + 6, (top + bot) / 2, rodx + 72, (top + bot) / 2, ACCENT, "emArrowR", 2.4);
  s += label(rodx + 44, (top + bot) / 2 - 16, L.velocity, { fill: ACCENT, weight: 600, anchor: "start" });
  s += label(rodx + 10, top - 12, L.length, { anchor: "start", fill: STROKE });
  s += label(x1 - 6, top - 12, L.field, { anchor: "end", fill: FIELD, weight: 600 });
  if (L.emf) s += label(rodx, bot + 30, `ε`, { fill: ACCENT, weight: 700, size: 15 });
  return svgWrap(s, d.title);
}

// 지면 밖으로 나오는 자기장(⊙ 점) — B가 화면 쪽으로 향함(원본 임용 4번 표기).
function fieldOutOfPage(x0: number, y0: number, x1: number, y1: number): string {
  let s = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1"/>`;
  for (let yy = y0 + 22; yy < y1 - 6; yy += 32) {
    for (let xx = x0 + 24; xx < x1 - 6; xx += 38) {
      s += `<circle cx="${xx}" cy="${yy}" r="6" fill="none" stroke="${FIELD}" stroke-width="1"/>`;
      s += `<circle cx="${xx}" cy="${yy}" r="1.6" fill="${FIELD}"/>`;
    }
  }
  return s;
}

// 수직 저항 지그재그 (x 고정, y1→y2).
function zigzagV(x: number, y1: number, y2: number): string {
  const n = 6, dx = 7;
  const step = (y2 - y1) / n;
  let path = `M ${x} ${y1}`;
  for (let i = 1; i < n; i++) {
    const yy = y1 + step * i;
    const xx = x + (i % 2 === 0 ? -dx : dx);
    path += ` L ${xx} ${yy}`;
  }
  path += ` L ${x} ${y2}`;
  return `<path d="${path}" fill="none" stroke="${STROKE}" stroke-width="2"/>`;
}

// 시변 자속 관통 고정 ㄷ자 도체 루프 + 단자 a-b 저항 + 유도 전류 i(t).
function renderFluxLoopResistor(d: EmFieldDiagram): string {
  const L = d.labels;
  const x0 = 155, x1 = 415, top = 65, bot = 250;
  const midY = (top + bot) / 2;
  let s = fieldOutOfPage(x0, top, x1, bot);
  // 좌·상·하 도선 (완전 도체 ㄷ자)
  s += `<line x1="${x0}" y1="${top}" x2="${x0}" y2="${bot}" stroke="${STROKE}" stroke-width="2.5"/>`;
  s += `<line x1="${x0}" y1="${top}" x2="${x1}" y2="${top}" stroke="${STROKE}" stroke-width="2.5"/>`;
  s += `<line x1="${x0}" y1="${bot}" x2="${x1}" y2="${bot}" stroke="${STROKE}" stroke-width="2.5"/>`;
  // 우변: a(위) → 저항 → b(아래)
  s += `<line x1="${x1}" y1="${top}" x2="${x1}" y2="${midY - 28}" stroke="${STROKE}" stroke-width="2.5"/>`;
  s += `<line x1="${x1}" y1="${midY + 28}" x2="${x1}" y2="${bot}" stroke="${STROKE}" stroke-width="2.5"/>`;
  s += zigzagV(x1, midY - 28, midY + 28);
  s += label(x1 - 12, midY + 4, L.resistor ?? "R", { anchor: "end", fill: STROKE, weight: 600 });
  // 단자 a·b
  s += `<circle cx="${x1}" cy="${top}" r="3.2" fill="${STROKE}"/>`;
  s += `<circle cx="${x1}" cy="${bot}" r="3.2" fill="${STROKE}"/>`;
  s += label(x1 + 9, top - 5, "a", { anchor: "start", fill: STROKE, weight: 700 });
  s += label(x1 + 9, bot + 16, "b", { anchor: "start", fill: STROKE, weight: 700 });
  // 유도 전류 i(t) 화살표 (우변 바깥, 위→아래)
  s += arrow(x1 + 30, midY - 34, x1 + 30, midY + 34, ACCENT, "emArrowR", 2.2);
  s += label(x1 + 38, midY + 4, L.current ?? "i(t)", { anchor: "start", fill: ACCENT, weight: 600 });
  // 변 길이 라벨
  if (L.side) {
    s += label(x0 - 10, midY + 4, L.side, { anchor: "end", fill: MUTED });
    s += label((x0 + x1) / 2, bot + 18, L.side, { anchor: "middle", fill: MUTED });
  }
  // B 라벨 (상단-중앙 밴드, 점·저항 위로 흰 배경 — 저항 라벨 행과 분리해 겹침 방지)
  const bx = (x0 + x1) / 2, by = top + 30;
  s += `<rect x="${bx - 60}" y="${by - 14}" width="120" height="24" rx="3" fill="white" opacity="0.9"/>`;
  s += label(bx, by + 3, L.field ?? "B", { fill: FIELD, weight: 700 });
  return svgWrap(s, d.title);
}

function renderCurrentInField(d: EmFieldDiagram): string {
  const L = d.labels;
  const x0 = 120, x1 = 460, top = 80, bot = 230;
  let s = fieldIntoPage(x0, top, x1, bot);
  const wy = (top + bot) / 2;
  // 전류 도선 (수평)
  s += `<line x1="${x0 + 10}" y1="${wy}" x2="${x1 - 10}" y2="${wy}" stroke="${STROKE}" stroke-width="3"/>`;
  s += arrow((x0 + x1) / 2 - 30, wy, (x0 + x1) / 2 + 50, wy, ACCENT, "emArrowR", 2.4);
  s += label((x0 + x1) / 2 + 10, wy - 8, L.current, { fill: ACCENT, weight: 600 });
  // 힘 F (위로)
  s += arrow((x0 + x1) / 2, wy - 6, (x0 + x1) / 2, top - 4, "#16a34a", "emArrow", 2.4);
  s += `<text x="${(x0 + x1) / 2 + 12}" y="${top + 8}" font-size="15" font-weight="700" fill="#16a34a">${esc(texToPlain(L.force ?? "F"))}</text>`;
  s += label(x1 - 6, top - 10, L.field, { anchor: "end", fill: FIELD, weight: 600 });
  s += label(x1 - 6, bot + 18, L.length, { anchor: "end", fill: STROKE });
  return svgWrap(s, d.title);
}

function renderEmWave(d: EmFieldDiagram): string {
  const L = d.labels;
  const x0 = 90, x1 = 480, axisY = 170, amp = 56;
  let s = "";
  // 진행축
  s += arrow(x0 - 10, axisY, x1 + 20, axisY, MUTED, "emArrowD", 1.6);
  s += label(x1 + 16, axisY + 20, texToPlain(L.speed ?? "c"), { fill: MUTED, anchor: "start", weight: 600 });
  // E 사인 (세로 평면, 파랑)
  let eP = `M ${x0} ${axisY}`;
  let bP = `M ${x0} ${axisY}`;
  const span = x1 - x0;
  for (let i = 0; i <= 60; i++) {
    const x = x0 + (span * i) / 60;
    const ph = (2 * Math.PI * 2 * i) / 60;
    eP += ` L ${x.toFixed(1)} ${(axisY - Math.sin(ph) * amp).toFixed(1)}`;
    bP += ` L ${x.toFixed(1)} ${(axisY - Math.sin(ph) * amp * 0.42).toFixed(1)}`;
  }
  s += `<path d="${bP}" fill="none" stroke="${ACCENT}" stroke-width="1.6" opacity="0.85"/>`;
  s += `<path d="${eP}" fill="none" stroke="${FIELD}" stroke-width="2"/>`;
  s += label(x0 + 40, axisY - amp - 6, `${texToPlain(L.efield ?? "E")}`, { fill: FIELD, weight: 700, size: 15 });
  s += label(x0 + 95, axisY - amp * 0.42 - 4, `${texToPlain(L.bfield ?? "B")}`, { fill: ACCENT, weight: 700, size: 13 });
  // 주어진 값만 하단에 표기 (미지 기호 λ·B_0는 곡선 위 라벨로 이미 표시 — 중복/혼동 방지)
  const meta = [L.freq].filter(Boolean).map((x) => texToPlain(x)).join("   ");
  if (meta) s += label((x0 + x1) / 2, H - 24, meta, { fill: STROKE });
  return svgWrap(s, d.title);
}

function renderToroid(d: EmFieldDiagram): string {
  const L = d.labels;
  const cx = 250, cy = 158, Ro = 96, Ri = 52;
  const rm = (Ro + Ri) / 2;
  let s = "";
  // 토러스(도넛) — 두 동심원으로 환(annulus)
  s += `<circle cx="${cx}" cy="${cy}" r="${Ro}" fill="#eff6ff" stroke="${STROKE}" stroke-width="2"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${Ri}" fill="white" stroke="${STROKE}" stroke-width="2"/>`;
  // 권선 — annulus를 가로지르는 짧은 선 여러 개
  const turns = 18;
  for (let k = 0; k < turns; k++) {
    const a = (k / turns) * 2 * Math.PI;
    const x1 = cx + Math.cos(a) * (Ri - 7), y1 = cy + Math.sin(a) * (Ri - 7);
    const x2 = cx + Math.cos(a) * (Ro + 7), y2 = cy + Math.sin(a) * (Ro + 7);
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${MUTED}" stroke-width="1.1"/>`;
  }
  // 내부 자기장 B — 평균 반지름 점선원 + 상단 접선 화살표
  s += `<circle cx="${cx}" cy="${cy}" r="${rm}" fill="none" stroke="${FIELD}" stroke-width="1.6" stroke-dasharray="6 4"/>`;
  s += arrow(cx - 10, cy - rm, cx + 12, cy - rm, FIELD, "emArrow", 2);
  s += label(cx + 4, cy - rm - 8, texToPlain(L.field ?? "B"), { fill: FIELD, weight: 700, size: 15 });
  // 평균 반지름 r
  s += `<line x1="${cx}" y1="${cy}" x2="${cx + rm}" y2="${cy}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${MUTED}"/>`;
  s += label(cx + rm / 2, cy - 6, L.radius, { fill: MUTED, size: 12 });
  // N, I
  s += label(cx, cy + Ro + 30, `${texToPlain(L.turns)},   ${texToPlain(L.current)}`, { fill: STROKE });
  return svgWrap(s, d.title);
}

function renderCoax(d: EmFieldDiagram): string {
  const L = d.labels;
  const cx = 210, cy = 158, ra = 26, rb = 100;
  let s = "";
  // 유전체 영역 (a~b) — 채움
  s += `<circle cx="${cx}" cy="${cy}" r="${rb}" fill="#eff6ff" stroke="${STROKE}" stroke-width="2"/>`;
  // 외부 도체 (굵은 링)
  s += `<circle cx="${cx}" cy="${cy}" r="${rb}" fill="none" stroke="${STROKE}" stroke-width="4"/>`;
  // 내부 도체 (채워진 원)
  s += `<circle cx="${cx}" cy="${cy}" r="${ra}" fill="${MUTED}" stroke="${STROKE}" stroke-width="1.5"/>`;
  s += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" fill="white">도체</text>`;
  // 반지름 a (45° 위) · b (수평)
  const aa = -Math.PI / 4;
  s += `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(aa) * ra}" y2="${cy + Math.sin(aa) * ra}" stroke="${ACCENT}" stroke-width="1.5"/>`;
  s += label(cx + Math.cos(aa) * ra + 6, cy + Math.sin(aa) * ra - 2, L.inner, { fill: ACCENT, size: 12, anchor: "start" });
  s += `<line x1="${cx + ra}" y1="${cy}" x2="${cx + rb}" y2="${cy}" stroke="${ACCENT}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  s += label(cx + (ra + rb) / 2, cy + 16, L.outer, { fill: ACCENT, size: 12 });
  // εr (유전체) · C
  s += label(cx, cy - rb + 22, L.epsR, { fill: MUTED, weight: 600 });
  s += label(cx - rb - 6, cy + 4, texToPlain(L.cap ?? "C"), { fill: FIELD, weight: 700, size: 15, anchor: "end" });
  // 길이 L · (변형) 전압
  if (L.length) s += label(cx, cy + rb + 26, `${texToPlain(L.length)}   (케이블 길이)`, { fill: STROKE });
  if (L.voltage) s += label(cx + rb + 50, cy + 4, L.voltage, { fill: STROKE });
  return svgWrap(s, d.title);
}

function renderMutualCoils(d: EmFieldDiagram): string {
  const L = d.labels;
  const cy = 158, x0 = 120, x1 = 440, ry = 40;
  const mid = (x0 + x1) / 2;
  let s = "";
  // 공통 철심 (가로 바)
  s += `<line x1="${x0 - 34}" y1="${cy}" x2="${x1 + 34}" y2="${cy}" stroke="${MUTED}" stroke-width="7" opacity="0.45"/>`;
  // 코일 루프 그리기 헬퍼
  const drawCoil = (xa: number, xb: number, color: string): string => {
    let t = ""; const loops = 6;
    for (let k = 0; k < loops; k++) {
      const x = xa + (k * (xb - xa)) / (loops - 1);
      t += `<ellipse cx="${x}" cy="${cy}" rx="9" ry="${ry}" fill="none" stroke="${color}" stroke-width="1.8"/>`;
    }
    return t;
  };
  s += drawCoil(x0, mid - 28, STROKE); // 1차
  s += drawCoil(mid + 28, x1, ACCENT); // 2차
  // 권선수 라벨
  s += label((x0 + mid - 28) / 2, cy - ry - 12, L.n1, { fill: STROKE, weight: 600 });
  s += label((mid + 28 + x1) / 2, cy - ry - 12, L.n2, { fill: ACCENT, weight: 600 });
  // 1차 전류 I₁ (좌측 인입)
  s += arrow(x0 - 34, cy - ry - 16, x0 - 10, cy - ry - 16, STROKE, "emArrow", 1.6);
  s += label(x0 - 36, cy - ry - 22, texToPlain(L.primary ?? "I_1"), { fill: STROKE, anchor: "start", size: 12, weight: 600 });
  // 자속 Φ — 두 코일 사이 간격에 화살표
  s += arrow(mid - 24, cy, mid + 24, cy, FIELD, "emArrow", 2);
  s += label(mid, cy - 8, "Φ", { fill: FIELD, weight: 700, size: 14 });
  // 상호 인덕턴스 M
  s += label(mid, cy + ry + 26, texToPlain(L.coupling ?? "M"), { fill: FIELD, weight: 700, size: 16 });
  // ε₂ (변형 — 2차 유도 기전력)
  if (L.emf) s += label(x1 + 12, cy - ry - 12, texToPlain(L.emf), { fill: ACCENT, anchor: "start", weight: 600, size: 13 });
  // A, l
  s += label(mid, cy + ry + 46, `${texToPlain(L.area)},   ${texToPlain(L.length)}`, { fill: MUTED, size: 12 });
  return svgWrap(s, d.title);
}

function renderSphereCap(d: EmFieldDiagram): string {
  const L = d.labels;
  const cx = 240, cy = 160;
  let s = "";
  if (L.kind === "isolated") {
    // 고립 도체구 + 방사 전계
    const R = 78;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      s += arrow(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3), cx + Math.cos(a) * (R + 44), cy + Math.sin(a) * (R + 44), FIELD);
    }
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#e0e7ff" stroke="${STROKE}" stroke-width="2.5"/>`;
    s += `<ellipse cx="${cx}" cy="${cy}" rx="${R}" ry="${R * 0.32}" fill="none" stroke="${STROKE}" stroke-width="1" opacity="0.4"/>`;
    s += `<line x1="${cx}" y1="${cy}" x2="${cx + R}" y2="${cy}" stroke="${ACCENT}" stroke-width="1.5"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${ACCENT}"/>`;
    s += label(cx + R * 0.5, cy - 6, L.radius, { fill: ACCENT, size: 12 });
    s += label(cx - R - 10, cy + 4, texToPlain(L.cap ?? "C"), { fill: FIELD, weight: 700, size: 15, anchor: "end" });
    return svgWrap(s, d.title);
  }
  // 동심 구 커패시터 (단면 + 3D 힌트 타원)
  const rb = 98, ra = 36;
  s += `<circle cx="${cx}" cy="${cy}" r="${rb}" fill="#eff6ff" stroke="${STROKE}" stroke-width="2.5"/>`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${rb}" ry="${rb * 0.32}" fill="none" stroke="${STROKE}" stroke-width="1" opacity="0.35"/>`;
  s += `<circle cx="${cx}" cy="${cy}" r="${ra}" fill="${MUTED}" stroke="${STROKE}" stroke-width="1.5"/>`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${ra}" ry="${ra * 0.32}" fill="none" stroke="white" stroke-width="0.8" opacity="0.5"/>`;
  const aa = -Math.PI / 4;
  s += `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(aa) * ra}" y2="${cy + Math.sin(aa) * ra}" stroke="${ACCENT}" stroke-width="1.5"/>`;
  s += label(cx + Math.cos(aa) * ra + 6, cy + Math.sin(aa) * ra - 2, L.inner, { fill: ACCENT, size: 12, anchor: "start" });
  s += `<line x1="${cx + ra}" y1="${cy}" x2="${cx + rb}" y2="${cy}" stroke="${ACCENT}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  s += label(cx + (ra + rb) / 2, cy + 16, L.outer, { fill: ACCENT, size: 12 });
  if (L.epsR) s += label(cx, cy - rb + 22, L.epsR, { fill: MUTED, weight: 600 });
  s += label(cx - rb - 6, cy + 4, texToPlain(L.cap ?? "C"), { fill: FIELD, weight: 700, size: 15, anchor: "end" });
  return svgWrap(s, d.title);
}

function renderPotentialField(d: EmFieldDiagram): string {
  const L = d.labels;
  // 전위 함수 V·점 P + 해석 흐름 체인: V →(E=−∇V)→ E →(ρ=−ε₀∇²V)→ ρ_v
  let s = "";
  // 상단: 주어진 전위 함수 + 점 P
  s += `<rect x="40" y="48" width="480" height="46" rx="8" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1.5"/>`;
  s += label(280, 70, L.vExpr, { fill: STROKE, weight: 700, size: 15 });
  s += label(280, 88, `자유 공간 ε₀,  구하는 점  ${texToPlain(L.point ?? "P")}`, { fill: MUTED, size: 12 });
  // 체인 박스 3개
  const boxes: Array<{ x: number; t: string; sub: string; fill: string; stroke: string }> = [
    { x: 70, t: "V(x, y, z)", sub: "전위", fill: "#eef2ff", stroke: STROKE },
    { x: 250, t: "E", sub: "전계", fill: "#eff6ff", stroke: FIELD },
    { x: 430, t: "ρv", sub: "전하밀도", fill: "#fef2f2", stroke: ACCENT },
  ];
  const by = 150, bw = 110, bh = 56;
  for (const b of boxes) {
    s += `<rect x="${b.x - bw / 2}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="${b.fill}" stroke="${b.stroke}" stroke-width="1.8"/>`;
    s += label(b.x, by + 28, b.t, { fill: b.stroke, weight: 700, size: 17 });
    s += label(b.x, by + 46, b.sub, { fill: MUTED, size: 11 });
  }
  // 화살표 + 변환식
  s += arrow(boxes[0].x + bw / 2 + 2, by + bh / 2, boxes[1].x - bw / 2 - 2, by + bh / 2, FIELD, "emArrow", 2);
  s += label((boxes[0].x + boxes[1].x) / 2, by + bh / 2 - 15, texToPlain(L.efield ?? "E = -∇V"), { fill: FIELD, size: 11, weight: 600 });
  s += arrow(boxes[1].x + bw / 2 + 2, by + bh / 2, boxes[2].x - bw / 2 - 2, by + bh / 2, ACCENT, "emArrowR", 2);
  s += label((boxes[1].x + boxes[2].x) / 2, by + bh / 2 - 15, texToPlain(L.rho ?? "ρv = -ε₀∇²V"), { fill: ACCENT, size: 11, weight: 600 });
  // 하단: 단계 안내
  s += label(280, 252, "[1] V_P   →   [2] E = -∇V, 단위벡터 aE   →   [3] ρv = -ε₀∇²V", { fill: STROKE, size: 12 });
  return svgWrap(s, d.title);
}

function renderPlaneFlux(d: EmFieldDiagram): string {
  const L = d.labels;
  const Ox = 210, Oy = 214;
  const zTop = { x: 210, y: 64 };
  const yEnd = { x: 486, y: 214 };
  const xEnd = { x: 118, y: 280 };
  const perp = L.perpAxis || "y";
  let s = "";
  // 평면 S — x축 + (수직축이 y면 z축, z면 y축)으로 이루는 평행사변형(원점 통과).
  const xd = { dx: xEnd.x - Ox, dy: xEnd.y - Oy };
  const c2 = perp === "y"
    ? { dx: zTop.x - Ox, dy: zTop.y - Oy }
    : { dx: yEnd.x - Ox, dy: yEnd.y - Oy };
  const corners: Array<[number, number]> = [
    [Ox, Oy],
    [Ox + c2.dx, Oy + c2.dy],
    [Ox + c2.dx + xd.dx, Oy + c2.dy + xd.dy],
    [Ox + xd.dx, Oy + xd.dy],
  ];
  s += `<polygon points="${corners.map((c) => c.join(",")).join(" ")}" fill="#dbeafe" fill-opacity="0.55" stroke="${STROKE}" stroke-width="1.5"/>`;
  s += label((corners[1][0] + corners[2][0]) / 2 - 10, (corners[1][1] + corners[2][1]) / 2 + 4, "S", { fill: STROKE, weight: 700, size: 16 });
  // 좌표축 (z↑ · y→ · x↙)
  s += arrow(Ox, Oy, zTop.x, zTop.y - 4, MUTED, "emArrowD", 1.6);
  s += arrow(Ox, Oy, yEnd.x + 4, yEnd.y, MUTED, "emArrowD", 1.6);
  s += arrow(Ox, Oy, xEnd.x - 3, xEnd.y + 3, MUTED, "emArrowD", 1.6);
  s += label(zTop.x + 6, zTop.y - 6, "z[m]", { anchor: "start", fill: MUTED, size: 12 });
  s += label(yEnd.x + 8, yEnd.y + 5, "y[m]", { anchor: "start", fill: MUTED, size: 12 });
  s += label(xEnd.x - 4, xEnd.y + 15, "x[m]", { anchor: "end", fill: MUTED, size: 12 });
  s += label(Ox - 8, Oy + 15, "O", { anchor: "end", fill: MUTED, size: 12 });
  // 세 점 P·Q·R (고정 슬롯 — 좌표는 라벨로 표기)
  const pts: Array<[number, number, string]> = [
    [322, 162, L.pP || "P"],
    [386, 162, L.pR || "R"],
    [386, 104, L.pQ || "Q"],
  ];
  for (const [x, y, txt] of pts) {
    s += `<circle cx="${x}" cy="${y}" r="3.5" fill="${ACCENT}"/>`;
    s += label(x + 8, y - 5, txt, { anchor: "start", fill: STROKE, weight: 600, size: 12 });
  }
  // 전계 식(상단 중앙) + 하단 주석(면적·전기력선 총수·법선 방향)
  if (L.field) s += label(W / 2, 42, L.field, { fill: FIELD, weight: 700, size: 13 });
  const meta = [L.area, L.flux, L.normalDir ? `법선 ${texToPlain(L.normalDir)}` : ""]
    .filter(Boolean).map((x) => texToPlain(x)).join("     ");
  if (meta) s += label(W / 2, H - 10, meta, { fill: STROKE, size: 12 });
  return svgWrap(s, d.title);
}

function renderDielectricSlab(d: EmFieldDiagram): string {
  const L = d.labels;
  const series = L.split === "series";
  // 캐비닛 투영 직육면체: 앞면 사각형 + 깊이 offset.
  const fx = 150, fy = 128, fw = 250, fh = 116; // 앞면
  const ox = 56, oy = -34; // 깊이 방향 offset (뒤로·위로)
  const fL = fx, fR = fx + fw, fT = fy, fB = fy + fh;
  const P = (x: number, y: number) => `${x},${y}`;
  let s = "";
  // 바닥 도체(z=0, +Q) 면 — 앞아래+뒤아래
  s += `<polygon points="${P(fL, fB)} ${P(fR, fB)} ${P(fR + ox, fB + oy)} ${P(fL + ox, fB + oy)}" fill="#cbd5e1" stroke="${STROKE}" stroke-width="1.6"/>`;
  // 상단 도체(z=d, −Q) 면 — 앞위+뒤위
  s += `<polygon points="${P(fL, fT)} ${P(fR, fT)} ${P(fR + ox, fT + oy)} ${P(fL + ox, fT + oy)}" fill="#cbd5e1" stroke="${STROKE}" stroke-width="1.6"/>`;
  // 유전체 영역 분할 (병렬=세로, 직렬=가로)
  const aFill = "#dbeafe", bFill = "#fef9c3";
  if (!series) {
    const xa = fL + fw / 3; // 부피비 1:2 → ⓐ 왼쪽 1/3
    s += `<polygon points="${P(fL, fT)} ${P(xa, fT)} ${P(xa, fB)} ${P(fL, fB)}" fill="${aFill}" fill-opacity="0.7" stroke="${STROKE}" stroke-width="1"/>`;
    s += `<polygon points="${P(xa, fT)} ${P(fR, fT)} ${P(fR, fB)} ${P(xa, fB)}" fill="${bFill}" fill-opacity="0.7" stroke="${STROKE}" stroke-width="1"/>`;
    // 상단면 분할선
    s += `<line x1="${xa}" y1="${fT}" x2="${xa + ox}" y2="${fT + oy}" stroke="${STROKE}" stroke-width="1"/>`;
    s += label((fL + xa) / 2, (fT + fB) / 2 + 4, L.regionA || "ⓐ", { fill: STROKE, weight: 700, size: 13 });
    s += label((xa + fR) / 2, (fT + fB) / 2 + 4, L.regionB || "ⓑ", { fill: STROKE, weight: 700, size: 13 });
  } else {
    // 두께비 분할 — thickFracA(하부 유전체 두께 비율)가 있으면 비례, 없으면 1:2 가정(1/3).
    const fracRaw = Number(L.thickFracA);
    const fracA = Number.isFinite(fracRaw) && fracRaw > 0 && fracRaw < 1 ? fracRaw : 1 / 3;
    const za = fB - fh * fracA; // ⓐ(하부) 영역 상단 경계
    s += `<polygon points="${P(fL, za)} ${P(fR, za)} ${P(fR, fB)} ${P(fL, fB)}" fill="${aFill}" fill-opacity="0.7" stroke="${STROKE}" stroke-width="1"/>`;
    s += `<polygon points="${P(fL, fT)} ${P(fR, fT)} ${P(fR, za)} ${P(fL, za)}" fill="${bFill}" fill-opacity="0.7" stroke="${STROKE}" stroke-width="1"/>`;
    s += `<line x1="${fR}" y1="${za}" x2="${fR + ox}" y2="${za + oy}" stroke="${STROKE}" stroke-width="1"/>`;
    s += label((fL + fR) / 2, (za + fB) / 2 + 4, L.regionA || "ⓐ", { fill: STROKE, weight: 700, size: 13 });
    s += label((fL + fR) / 2, (fT + za) / 2 + 4, L.regionB || "ⓑ", { fill: STROKE, weight: 700, size: 13 });
  }
  // 우측 깊이 모서리
  s += `<line x1="${fR}" y1="${fT}" x2="${fR + ox}" y2="${fT + oy}" stroke="${STROKE}" stroke-width="1.2"/>`;
  s += `<line x1="${fR}" y1="${fB}" x2="${fR + ox}" y2="${fB + oy}" stroke="${STROKE}" stroke-width="1.2"/>`;
  s += `<line x1="${fR + ox}" y1="${fT + oy}" x2="${fR + ox}" y2="${fB + oy}" stroke="${STROKE}" stroke-width="1.2"/>`;
  // 도체·전하 라벨
  s += label(fR + ox + 10, fT + oy + 6, `${texToPlain(L.zTop || "z = d")}  (${texToPlain(L.qTop || "−Q")})`, { anchor: "start", fill: ACCENT, weight: 600, size: 12 });
  s += label(fR + ox + 10, fB + oy + 6, `${texToPlain(L.zBot || "z = 0")}  (${texToPlain(L.qBot || "+Q")})`, { anchor: "start", fill: STROKE, weight: 600, size: 12 });
  // 간격 d 치수 (좌측)
  s += `<line x1="${fL - 16}" y1="${fT}" x2="${fL - 16}" y2="${fB}" stroke="${MUTED}" stroke-width="1.2" marker-start="url(#emArrowD)" marker-end="url(#emArrowD)"/>`;
  s += label(fL - 22, (fT + fB) / 2 + 4, "d", { anchor: "end", fill: MUTED, weight: 600, size: 13 });
  // 좌표축 (x·y·z) — 원본 임용 형식: 원점 O = 박스 앞-아래-왼쪽 모서리(z=0 평면),
  //   z=위(적층/극판 간격 방향)·y=오른쪽·x=앞쪽(관측자 방향, 좌하). 박스 모서리 위로 연장해 표기.
  const oX = fL, oY = fB; // 원점 = 앞-아래-왼쪽 모서리 (z=0)
  s += arrow(oX, oY, oX, fT - 28, STROKE, "emArrowA", 1.7);        // z ↑ (박스 위로 연장)
  s += arrow(oX, oY, fR + 22, oY, STROKE, "emArrowA", 1.7);        // y → (박스 오른쪽으로 연장)
  s += arrow(oX, oY, oX - 40, oY + 26, STROKE, "emArrowA", 1.7);   // x ↙ (앞쪽, 관측자 방향)
  s += `<circle cx="${oX}" cy="${oY}" r="2.6" fill="${STROKE}"/>`;
  s += label(oX, fT - 34, "z", { fill: STROKE, weight: 700, size: 15 });
  s += label(fR + 28, oY + 5, "y", { anchor: "start", fill: STROKE, weight: 700, size: 15 });
  s += label(oX - 46, oY + 34, "x", { anchor: "end", fill: STROKE, weight: 700, size: 15 });
  s += label(oX - 9, oY + 13, "O", { anchor: "end", fill: STROKE, weight: 600, size: 12 });
  // 하단 주석 (면적·부피비)
  const meta = [L.area, L.ratio].filter(Boolean).map((x) => texToPlain(x)).join("      ");
  if (meta) s += label(W / 2, H - 12, meta, { fill: STROKE, size: 12 });
  return svgWrap(s, d.title);
}

function renderFluxPrism(d: EmFieldDiagram): string {
  const L = d.labels;
  // 3D → 2D 투영 (z↑ · y→ · x↙, 캐비닛 스타일).
  const O = { x: 156, y: 208 };
  const ax = { dx: -56, dy: 40 };  // a_x (좌하)
  const ay = { dx: 150, dy: 10 };  // a_y (우)
  const az = { dx: 0, dy: -122 };  // a_z (상)
  const P = (x: number, y: number, z: number): [number, number] => [
    O.x + x * ax.dx + y * ay.dx + z * az.dx,
    O.y + x * ax.dy + y * ay.dy + z * az.dy,
  ];
  const o = P(0, 0, 0), a = P(1, 0, 0), b = P(1, 1, 0), c = P(0, 1, 0), e = P(0, 0, 1), dd = P(1, 0, 1);
  const poly = (pts: Array<[number, number]>, fill: string, op = 0.55) =>
    `<polygon points="${pts.map((q) => q.join(",")).join(" ")}" fill="${fill}" fill-opacity="${op}" stroke="${STROKE}" stroke-width="1.5"/>`;
  const hi = L.hiFace || "oabc";
  let s = "";
  // 면 채우기 (뒤→앞). 경사면 bced = 노랑 강조, [2] 대상 사각면 = 파랑 강조.
  s += poly([o, a, dd, e], hi === "oade" ? "#bfdbfe" : "#eef2ff", hi === "oade" ? 0.75 : 0.5); // 앞면 oade
  s += poly([o, a, b, c], hi === "oabc" ? "#bfdbfe" : "#eef2ff", hi === "oabc" ? 0.75 : 0.5); // 밑면 oabc
  s += poly([b, c, e, dd], "#fef08a", 0.7); // 경사면 bced (강조)
  s += poly([o, c, e], "#e0e7ff", 0.5);     // 삼각면 oce
  s += poly([a, b, dd], "#e0e7ff", 0.5);    // 삼각면 abd
  // 모든 모서리 강조 (윤곽선)
  const edge = (u: [number, number], v: [number, number]) =>
    `<line x1="${u[0]}" y1="${u[1]}" x2="${v[0]}" y2="${v[1]}" stroke="${STROKE}" stroke-width="1.6"/>`;
  for (const [u, v] of [[o, a], [a, b], [b, c], [c, o], [o, e], [e, dd], [dd, a], [b, dd], [c, e]] as Array<[[number, number], [number, number]]>) s += edge(u, v);
  // 경사면 라벨
  const mid = (pts: Array<[number, number]>): [number, number] => [
    pts.reduce((t, q) => t + q[0], 0) / pts.length, pts.reduce((t, q) => t + q[1], 0) / pts.length];
  const mBced = mid([b, c, e, dd]);
  s += label(mBced[0], mBced[1], "bced", { fill: "#a16207", weight: 700, size: 12 });
  // 꼭짓점 + 좌표 라벨
  const verts: Array<[[number, number], string, string]> = [
    [o, "o(0,0,0)", "end"], [a, "a(1,0,0)", "end"], [b, "b(1,1,0)", "start"],
    [c, "c(0,1,0)", "start"], [e, "e(0,0,1)", "end"], [dd, "d(1,0,1)", "start"],
  ];
  for (const [pt, txt, anch] of verts) {
    s += `<circle cx="${pt[0]}" cy="${pt[1]}" r="3" fill="${STROKE}"/>`;
    const ox = anch === "end" ? -6 : 6;
    s += label(pt[0] + ox, pt[1] - 6, txt, { anchor: anch, fill: STROKE, weight: 600, size: 11 });
  }
  // 자속밀도 B — 우상단에서 도형 쪽으로 향하는 평행 화살표 3개(⇛) + 라벨
  for (let k = 0; k < 3; k++) {
    const y0 = 70 + k * 12;
    s += arrow(500, y0, 448, y0 + 26, FIELD, "emArrow", 2);
  }
  s += label(508, 66, "B", { anchor: "start", fill: FIELD, weight: 700, size: 16 });
  if (L.field) s += label(W / 2 + 20, H - 12, L.field, { fill: FIELD, weight: 700, size: 13 });
  return svgWrap(s, d.title);
}

function renderSheetLineSuperposition(d: EmFieldDiagram): string {
  const L = d.labels;
  // 3D 캐비닛 투영 (z↑ · y→ · x↙) — 원본 그림 배치 재현.
  const O = { x: 214, y: 214 };
  const per = {
    x: { dx: -13, dy: 10 }, // a_x (좌하)
    y: { dx: 26, dy: 2 },   // a_y (우)
    z: { dx: 0, dy: -20 },  // a_z (상)
  };
  const P3 = (x: number, y: number, z: number): [number, number] => [
    O.x + x * per.x.dx + y * per.y.dx + z * per.z.dx,
    O.y + x * per.x.dy + y * per.y.dy + z * per.z.dy,
  ];
  // 평면 z=z_s 위치: 라벨 "z = N" 에서 N 파싱(없으면 6).
  const zsMatch = /(-?\d+(?:\.\d+)?)/.exec(texToPlain(L.sheetZ ?? "6"));
  const zS = zsMatch ? Number(zsMatch[1]) : 6;
  // 선전류 통과점 y_L: "(0, N, 0)" 파싱(없으면 3).
  const ylMatch = /,\s*(-?\d+(?:\.\d+)?)\s*,/.exec(texToPlain(L.linePoint ?? "(0, 3, 0)"));
  const yL = ylMatch ? Number(ylMatch[1]) : 3;
  let s = "";

  // 면전류 평면 (z=z_s, xy와 평행) — x∈[-1,3], y∈[0,5] 평행사변형.
  const c1 = P3(-1, 0, zS), c2 = P3(3, 0, zS), c3 = P3(3, 5, zS), c4 = P3(-1, 5, zS);
  s += `<polygon points="${[c1, c2, c3, c4].map((p) => p.join(",")).join(" ")}" fill="#e2e8f0" fill-opacity="0.85" stroke="${STROKE}" stroke-width="1.4"/>`;
  // 면전류 방향 화살표(a_x = 좌하)를 평면 위 여러 곳에 짧게.
  for (const yy of [1, 2.2, 3.4, 4.6]) {
    const a = P3(1.4, yy, zS), b = P3(-0.4, yy, zS);
    s += arrow(a[0], a[1], b[0], b[1], MUTED, "emArrowD", 1.4);
  }
  s += label((c3[0] + c4[0]) / 2 + 24, (c3[1] + c4[1]) / 2 - 2, L.sheetZ ?? "z = 6", { anchor: "start", fill: STROKE, size: 12 });
  s += label((c1[0] + c2[0]) / 2 - 40, (c1[1] + c2[1]) / 2 + 4, L.sheet ?? "K a_x", { anchor: "end", fill: ACCENT, weight: 600, size: 12 });

  // 좌표축 (원점에서 z↑·y→·x↙).
  const zTip = P3(0, 0, zS + 0.6), yTip = P3(0, 5.4, 0), xTip = P3(3.4, 0, 0);
  s += arrow(O.x, O.y, zTip[0], zTip[1], MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, yTip[0], yTip[1], MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, xTip[0], xTip[1], MUTED, "emArrowD", 1.5);
  s += label(zTip[0] + 6, zTip[1], "z[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(yTip[0] + 8, yTip[1] + 4, "y[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(xTip[0] - 4, xTip[1] + 12, "x[m]", { anchor: "end", fill: MUTED, size: 11 });
  s += label(O.x - 8, O.y + 14, "O", { anchor: "end", fill: MUTED, size: 11 });

  // 무한 선전류 도선 (x축과 나란, (0,y_L,0) 통과) — x∈[-1.5, 3.2] 세그먼트 + a_x 화살표.
  const lA = P3(-1.5, yL, 0), lB = P3(3.2, yL, 0);
  s += `<line x1="${lA[0]}" y1="${lA[1]}" x2="${lB[0]}" y2="${lB[1]}" stroke="${STROKE}" stroke-width="2.6"/>`;
  const lMid = P3(2.4, yL, 0), lTip = P3(3.2, yL, 0);
  s += arrow(lMid[0], lMid[1], lTip[0], lTip[1], STROKE, "emArrow", 2.6);
  const lPt = P3(0, yL, 0);
  s += `<circle cx="${lPt[0]}" cy="${lPt[1]}" r="3" fill="${STROKE}"/>`;
  s += label(lPt[0] - 4, lPt[1] - 8, L.linePoint ?? "(0, 3, 0)", { anchor: "end", fill: MUTED, size: 11 });
  // 선전류 라벨은 도선 하단(화살촉 아래)에 배치 — 화살표·점 라벨과 겹치지 않도록.
  s += label(lB[0] - 8, lB[1] + 20, L.line ?? "I a_x", { anchor: "middle", fill: STROKE, weight: 600, size: 12 });

  // 측정점 P(p_x, p_y, h) — h는 미지라 대표 높이(zS*0.28)로 배치 + 점선 투영.
  const pxMatch = /P\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/.exec(texToPlain(L.pointP ?? "P(-3, 2, h)"));
  const pX = pxMatch ? Number(pxMatch[1]) : -3;
  const pY = pxMatch ? Number(pxMatch[2]) : 2;
  const hRep = Math.max(1, zS * 0.28);
  const pPt = P3(pX, pY, hRep);
  const pFoot = P3(pX, pY, 0);
  s += `<line x1="${pFoot[0]}" y1="${pFoot[1]}" x2="${pPt[0]}" y2="${pPt[1]}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="4 3"/>`;
  const pBaseY = P3(0, pY, 0);
  s += `<line x1="${pBaseY[0]}" y1="${pBaseY[1]}" x2="${pFoot[0]}" y2="${pFoot[1]}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="4 3"/>`;
  s += `<circle cx="${pPt[0]}" cy="${pPt[1]}" r="4" fill="${ACCENT}"/>`;
  s += label(pPt[0] + 8, pPt[1] - 4, L.pointP ?? "P", { anchor: "start", fill: STROKE, weight: 700, size: 12 });

  // 하단 목표식 주석.
  if (L.target) s += label(W / 2, H - 10, texToPlain(L.target), { fill: FIELD, weight: 700, size: 13 });
  return svgWrap(s, d.title);
}

function renderCircularLoopsAxis(d: EmFieldDiagram): string {
  const L = d.labels;
  const num = (s: string | undefined, def: number): number => {
    const m = /(-?\d+(?:\.\d+)?)/.exec(texToPlain(s ?? ""));
    return m ? Number(m[1]) : def;
  };
  const R1 = num(L.r1, 5), R2 = num(L.r2, 3);
  // pointP "P(0, 0, z_p)" 의 세 번째 수 = z_p (C₁ 높이).
  const zpM = /,\s*(-?\d+(?:\.\d+)?)\s*\)/.exec(texToPlain(L.pointP ?? "P(0, 0, 4)"));
  const zp = zpM ? Number(zpM[1]) : 4;
  const maxR = Math.max(R1, R2);
  const uh = Math.min(190 / (2 * maxR), 24);          // 가로 px/m
  const flat = 0.34;                                   // 원근 납작 비율
  const uv = Math.min(150 / (zp + maxR * flat + 1), 18); // 세로 px/m
  const cx = 270;
  const baseY = 240;                                   // C₂(z=0) 중심 y
  const c1y = baseY - zp * uv;                         // C₁(z=z_p) 중심 y

  const ellipse = (cyc: number, R: number, color: string) =>
    `<ellipse cx="${cx}" cy="${cyc}" rx="${R * uh}" ry="${R * uh * flat}" fill="none" stroke="${color}" stroke-width="2"/>`;

  let s = "";
  // z축 (점선) — C₂ 아래에서 C₁ 위까지.
  s += `<line x1="${cx}" y1="${baseY + maxR * uh * flat + 24}" x2="${cx}" y2="${c1y - R1 * uh * flat - 26}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="5 4"/>`;
  s += label(cx + 6, c1y - R1 * uh * flat - 28, "z", { anchor: "start", fill: MUTED, size: 12 });

  // C₂ (xy평면, z=0) — 시계 방향 I.
  s += ellipse(baseY, R2, STROKE);
  s += `<circle cx="${cx}" cy="${baseY}" r="3.5" fill="${MUTED}"/>`; // O
  s += label(cx - 10, baseY + 5, "O", { anchor: "end", fill: MUTED, size: 12 });
  s += label(cx - R2 * uh - 10, baseY + 4, L.loop2 ?? "C_2", { anchor: "end", fill: STROKE, weight: 700, size: 13 });
  s += label(cx + R2 * uh + 8, baseY + 4, `r = ${texToPlain(L.r2 ?? "")}`, { anchor: "start", fill: MUTED, size: 11 });
  // C₂ 전류 방향 화살표(오른쪽 끝, 시계 → 앞쪽으로).
  s += arrow(cx + R2 * uh, baseY - 2, cx + R2 * uh - 1, baseY + 8, ACCENT, "emArrowR", 2);
  s += label(cx, baseY + maxR * uh * flat + 20, `I(C_2) = ${texToPlain(L.i2 ?? "I")} (시계)`, { anchor: "middle", fill: ACCENT, size: 11 });

  // C₁ (z=z_p, xy평면과 나란) — 반시계 방향 I₁. 중심 = 측정점 P.
  s += ellipse(c1y, R1, STROKE);
  s += label(cx - R1 * uh - 10, c1y + 4, L.loop1 ?? "C_1", { anchor: "end", fill: STROKE, weight: 700, size: 13 });
  s += label(cx + R1 * uh + 8, c1y + 4, `r = ${texToPlain(L.r1 ?? "")}`, { anchor: "start", fill: MUTED, size: 11 });
  s += arrow(cx + R1 * uh, c1y + 2, cx + R1 * uh - 1, c1y - 8, FIELD, "emArrow", 2);
  s += label(cx, c1y - R1 * uh * flat - 10, `I(C_1) = ${texToPlain(L.i1 ?? "I")} (반시계)`, { anchor: "middle", fill: FIELD, size: 11 });
  // 측정점 P (C₁ 중심).
  s += `<circle cx="${cx}" cy="${c1y}" r="4" fill="${ACCENT}"/>`;
  s += label(cx + 10, c1y - 6, L.pointP ?? "P", { anchor: "start", fill: STROKE, weight: 700, size: 12 });

  // 하단 목표식.
  if (L.target) s += label(W / 2, H - 8, texToPlain(L.target), { fill: FIELD, weight: 700, size: 13 });
  return svgWrap(s, d.title);
}

function renderCoaxResistor(d: EmFieldDiagram): string {
  const L = d.labels;
  // ★ 원본(임용 12번)처럼 3D 동축 원통으로 렌더 — 외부 원통(도전물질) + 내부 도체 + 축·전류·L.
  const cx = 268, yTop = 78, yBot = 236;
  const rb = 92, ra = 19, flat = 0.26;
  const ryB = rb * flat, ryA = ra * flat;
  let s = "";
  // 외부 원통 몸체 (도전율 물질, 호박색 반투명): 옆면 + 바닥 앞 반원.
  s += `<path d="M ${cx - rb} ${yTop} L ${cx - rb} ${yBot} A ${rb} ${ryB} 0 0 0 ${cx + rb} ${yBot} L ${cx + rb} ${yTop} Z" fill="#fef3c7" fill-opacity="0.55" stroke="none"/>`;
  // 바닥 타원 (뒤=점선, 앞=실선).
  s += `<path d="M ${cx - rb} ${yBot} A ${rb} ${ryB} 0 0 1 ${cx + rb} ${yBot}" fill="none" stroke="${STROKE}" stroke-width="1.1" stroke-dasharray="4 3"/>`;
  s += `<path d="M ${cx - rb} ${yBot} A ${rb} ${ryB} 0 0 0 ${cx + rb} ${yBot}" fill="none" stroke="${STROKE}" stroke-width="1.6"/>`;
  // 옆면 세로선.
  s += `<line x1="${cx - rb}" y1="${yTop}" x2="${cx - rb}" y2="${yBot}" stroke="${STROKE}" stroke-width="1.6"/>`;
  s += `<line x1="${cx + rb}" y1="${yTop}" x2="${cx + rb}" y2="${yBot}" stroke="${STROKE}" stroke-width="1.6"/>`;
  // 윗면 타원 (외부 도체 링).
  s += `<ellipse cx="${cx}" cy="${yTop}" rx="${rb}" ry="${ryB}" fill="#fde68a" fill-opacity="0.5" stroke="${STROKE}" stroke-width="1.6"/>`;
  // 내부 도체 원통 (회색).
  s += `<path d="M ${cx - ra} ${yTop} L ${cx - ra} ${yBot} A ${ra} ${ryA} 0 0 0 ${cx + ra} ${yBot} L ${cx + ra} ${yTop} Z" fill="${MUTED}" fill-opacity="0.9" stroke="${STROKE}" stroke-width="1.1"/>`;
  s += `<ellipse cx="${cx}" cy="${yTop}" rx="${ra}" ry="${ryA}" fill="#94a3b8" stroke="${STROKE}" stroke-width="1.1"/>`;
  // 반경 방향 전류 화살표 (윗면 링에서 내부→외부, I).
  for (const ang of [Math.PI * 0.85, Math.PI * 0.15]) {
    const x1 = cx + Math.cos(ang) * ra, y1 = yTop + Math.sin(ang) * ryA;
    const x2 = cx + Math.cos(ang) * (rb - 4), y2 = yTop + Math.sin(ang) * ryB;
    s += arrow(x1, y1, x2, y2, FIELD, "emArrow", 1.4);
  }
  s += label(cx + rb - 24, yTop - 4, L.current ?? "I", { fill: FIELD, size: 11, anchor: "start", weight: 600 });
  // 내부 도체 위 전원 V₁.
  s += `<circle cx="${cx}" cy="${yTop - ryA - 10}" r="7" fill="white" stroke="${STROKE}" stroke-width="1.3"/>`;
  s += `<text x="${cx}" y="${yTop - ryA - 6}" text-anchor="middle" font-size="9" fill="${STROKE}">V₁</text>`;
  // σ (도전율) 라벨 상단.
  s += label(cx, yTop - ryB - 20, L.sigma ?? "\\sigma", { fill: STROKE, weight: 600 });
  // 길이 L 치수 (좌측 세로 양방향).
  s += `<line x1="${cx - rb - 20}" y1="${yTop}" x2="${cx - rb - 20}" y2="${yBot}" stroke="${MUTED}" stroke-width="1.2" marker-start="url(#emArrowD)" marker-end="url(#emArrowD)"/>`;
  s += label(cx - rb - 26, (yTop + yBot) / 2, texToPlain(L.length ?? "L").split(" ")[0] || "L", { anchor: "end", fill: MUTED, weight: 600 });
  // 반지름 a·b (바닥 앞면, 중심에서 방사 점선).
  s += `<line x1="${cx}" y1="${yBot}" x2="${cx + ra}" y2="${yBot}" stroke="${ACCENT}" stroke-width="1.3"/>`;
  s += label(cx + ra + 2, yBot - 6, L.inner ?? "a", { fill: ACCENT, size: 11, anchor: "start" });
  s += `<line x1="${cx + ra}" y1="${yBot + 8}" x2="${cx + rb}" y2="${yBot + 8}" stroke="${ACCENT}" stroke-width="1" stroke-dasharray="3 2"/>`;
  s += label(cx + (ra + rb) / 2, yBot + 22, L.outer ?? "b", { fill: ACCENT, size: 11 });
  // R (또는 P) 라벨.
  s += label(cx - rb - 44, (yTop + yBot) / 2 + 4, texToPlain(L.quantity ?? "R"), { fill: FIELD, weight: 700, size: 16, anchor: "end" });
  // 원통 좌표 축 (바닥 원점).
  const ox = cx - rb - 2, oy = yBot + 30;
  s += arrow(ox, oy, ox, oy - 26, MUTED, "emArrowD", 1.2);
  s += arrow(ox, oy, ox + 30, oy, MUTED, "emArrowD", 1.2);
  s += arrow(ox, oy, ox - 18, oy + 14, MUTED, "emArrowD", 1.2);
  s += label(ox + 2, oy - 28, "z", { anchor: "start", fill: MUTED, size: 10 });
  s += label(ox + 32, oy + 3, "y", { anchor: "start", fill: MUTED, size: 10 });
  s += label(ox - 20, oy + 20, "x", { anchor: "end", fill: MUTED, size: 10 });
  return svgWrap(s, d.title);
}

function renderCoaxTwoDielectric(d: EmFieldDiagram): string {
  const L = d.labels;
  // 수평 3D 원통형(동축) 커패시터 — 축방향으로 두 유전체(좌 ε₁ 길이 L₁, 우 ε₂ 길이 L₂).
  //   좌측 앞면에 내부 도체(a)·외부 도체(b) 동심원. 원본 임용 22번 배치 재현.
  const cy = 150, R = 60, rEll = 17;
  const xL = 158, xR = 452;
  const top = cy - R, bot = cy + R;
  const num = (v: string | undefined, def: number): number => {
    const m = /[\d.]+/.exec(texToPlain(v ?? ""));
    return m ? Number(m[0]) : def;
  };
  const l1 = num(L.len1, 1), l2 = num(L.len2, 1);
  const xS = xL + (xR - xL) * (l1 / (l1 + l2)); // 분할 위치 = L₁:L₂ 비례
  let s = "";
  // 두 섹션 몸체 (좌 ε₁ 파랑 / 우 ε₂ 노랑)
  s += `<rect x="${xL}" y="${top}" width="${xS - xL}" height="${2 * R}" fill="#dbeafe" fill-opacity="0.7" stroke="none"/>`;
  s += `<rect x="${xS}" y="${top}" width="${xR - xS}" height="${2 * R}" fill="#fef9c3" fill-opacity="0.7" stroke="none"/>`;
  // 우측 뒷면 링 (back rim)
  s += `<ellipse cx="${xR}" cy="${cy}" rx="${rEll}" ry="${R}" fill="#fef9c3" fill-opacity="0.5" stroke="${STROKE}" stroke-width="1.4"/>`;
  // 상·하 외곽선
  s += `<line x1="${xL}" y1="${top}" x2="${xR}" y2="${top}" stroke="${STROKE}" stroke-width="1.6"/>`;
  s += `<line x1="${xL}" y1="${bot}" x2="${xR}" y2="${bot}" stroke="${STROKE}" stroke-width="1.6"/>`;
  // 유전체 경계 타원 (ε₁|ε₂)
  s += `<ellipse cx="${xS}" cy="${cy}" rx="${rEll}" ry="${R}" fill="none" stroke="${STROKE}" stroke-width="1.3" stroke-dasharray="5 3"/>`;
  // 좌측 앞면: 외부 도체(b) 원 + 내부 도체(a) 동심
  s += `<ellipse cx="${xL}" cy="${cy}" rx="${rEll}" ry="${R}" fill="#eff6ff" fill-opacity="0.95" stroke="${STROKE}" stroke-width="1.6"/>`;
  const rEllA = rEll * 0.34, RA = R * 0.34;
  s += `<ellipse cx="${xL}" cy="${cy}" rx="${rEllA}" ry="${RA}" fill="${MUTED}" fill-opacity="0.9" stroke="${STROKE}" stroke-width="1.2"/>`;
  s += `<circle cx="${xL}" cy="${cy}" r="1.8" fill="${STROKE}"/>`;
  // a·b 반경 라벨 (좌면, 중심에서 위로)
  s += `<line x1="${xL}" y1="${cy}" x2="${xL}" y2="${cy - RA}" stroke="${ACCENT}" stroke-width="1.3"/>`;
  s += label(xL - 5, cy - RA / 2 + 3, L.inner ?? "a", { anchor: "end", fill: ACCENT, size: 12, weight: 600 });
  s += `<line x1="${xL}" y1="${cy + RA}" x2="${xL}" y2="${bot}" stroke="${ACCENT}" stroke-width="1.1" stroke-dasharray="3 2"/>`;
  s += label(xL - 5, cy + (RA + R) / 2 + 3, L.outer ?? "b", { anchor: "end", fill: ACCENT, size: 12, weight: 600 });
  // ε₁·ε₂ 라벨 (각 섹션 상단 중앙)
  s += label((xL + xS) / 2, cy - R * 0.42, L.eps1 ?? "\\varepsilon_1", { fill: STROKE, weight: 700, size: 15 });
  s += label((xS + xR) / 2, cy - R * 0.42, L.eps2 ?? "\\varepsilon_2", { fill: STROKE, weight: 700, size: 15 });
  // L₁·L₂ 치수 (하단 양방향 화살표)
  const dy = bot + 24;
  s += `<line x1="${xL}" y1="${dy}" x2="${xS}" y2="${dy}" stroke="${MUTED}" stroke-width="1.2" marker-start="url(#emArrowD)" marker-end="url(#emArrowD)"/>`;
  s += label((xL + xS) / 2, dy + 16, L.len1Label ?? "L_1", { fill: MUTED, weight: 600, size: 12 });
  s += `<line x1="${xS}" y1="${dy}" x2="${xR}" y2="${dy}" stroke="${MUTED}" stroke-width="1.2" marker-start="url(#emArrowD)" marker-end="url(#emArrowD)"/>`;
  s += label((xS + xR) / 2, dy + 16, L.len2Label ?? "L_2", { fill: MUTED, weight: 600, size: 12 });
  return svgWrap(s, d.title);
}

function renderSheetLineEfield(d: EmFieldDiagram): string {
  const L = d.labels;
  const O = { x: 206, y: 232 };
  const per = { x: { dx: -13, dy: 10 }, y: { dx: 26, dy: 2 }, z: { dx: 0, dy: -20 } };
  const P3 = (x: number, y: number, z: number): [number, number] => [
    O.x + x * per.x.dx + y * per.y.dx + z * per.z.dx,
    O.y + x * per.x.dy + y * per.y.dy + z * per.z.dy,
  ];
  const num3 = (s: string | undefined, def: number): number => {
    const m = /,\s*(-?\d+(?:\.\d+)?)\s*\)/.exec(texToPlain(s ?? ""));
    return m ? Number(m[1]) : def;
  };
  const zL = num3(L.lineZ ?? "(0, 0, 2)", 2);
  const zQ = num3(L.pointQ ?? "Q(0, 0, 3)", zL + 1);
  const zPm = /,\s*(-?\d+(?:\.\d+)?)\s*\)/.exec(texToPlain(L.pointP ?? ""));
  const zP = zPm ? Number(zPm[1]) : zL * 0.45; // 변형(위치 미지)이면 대표 높이
  const zTop = Math.max(zQ, zL) + 0.6;
  let s = "";

  // z=0 면전하 평면 (xy) — 평행사변형.
  const s1 = P3(-1, -1, 0), s2 = P3(3, -1, 0), s3 = P3(3, 4, 0), s4 = P3(-1, 4, 0);
  s += `<polygon points="${[s1, s2, s3, s4].map((p) => p.join(",")).join(" ")}" fill="#e2e8f0" fill-opacity="0.8" stroke="${STROKE}" stroke-width="1.4"/>`;
  s += label((s1[0] + s2[0]) / 2 - 8, (s1[1] + s2[1]) / 2 + 16, L.sheet ?? "\\rho_s", { anchor: "middle", fill: ACCENT, weight: 600, size: 12 });
  s += label((s2[0] + s3[0]) / 2 + 20, (s2[1] + s3[1]) / 2 + 4, "z = 0", { anchor: "start", fill: MUTED, size: 11 });

  // 좌표축.
  const zTip = P3(0, 0, zTop), yTip = P3(0, 4.4, 0), xTip = P3(3.4, 0, 0);
  s += arrow(O.x, O.y, zTip[0], zTip[1], MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, yTip[0], yTip[1], MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, xTip[0], xTip[1], MUTED, "emArrowD", 1.5);
  s += label(zTip[0] + 6, zTip[1], "z[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(yTip[0] + 8, yTip[1] + 4, "y[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(xTip[0] - 4, xTip[1] + 12, "x[m]", { anchor: "end", fill: MUTED, size: 11 });
  s += label(O.x - 9, O.y + 6, "O", { anchor: "end", fill: MUTED, size: 11 });

  // 무한 선전하 (y축과 나란, (0,0,z_L) 통과).
  const lA = P3(0, -1, zL), lB = P3(0, 4, zL);
  s += `<line x1="${lA[0]}" y1="${lA[1]}" x2="${lB[0]}" y2="${lB[1]}" stroke="${ACCENT}" stroke-width="2.6"/>`;
  const lPt = P3(0, 0, zL);
  s += `<circle cx="${lPt[0]}" cy="${lPt[1]}" r="3" fill="${ACCENT}"/>`;
  s += label(lA[0] - 6, lA[1] + 2, L.lineZ ?? "(0, 0, 2)", { anchor: "end", fill: MUTED, size: 11 });
  s += label(lB[0] + 6, lB[1] - 4, L.line ?? "\\rho_l", { anchor: "start", fill: ACCENT, weight: 600, size: 12 });

  // 점 P·Q (z축 위).
  const pPt = P3(0, 0, zP), qPt = P3(0, 0, zQ);
  s += `<circle cx="${qPt[0]}" cy="${qPt[1]}" r="4" fill="${FIELD}"/>`;
  s += label(qPt[0] - 8, qPt[1] - 4, L.pointQ ?? "Q", { anchor: "end", fill: STROKE, weight: 700, size: 12 });
  s += `<circle cx="${pPt[0]}" cy="${pPt[1]}" r="4" fill="${STROKE}"/>`;
  s += label(pPt[0] - 8, pPt[1] + 4, L.pointP ?? "P", { anchor: "end", fill: STROKE, weight: 700, size: 12 });

  if (L.target) s += label(W / 2, H - 8, texToPlain(L.target), { fill: FIELD, weight: 700, size: 13 });
  return svgWrap(s, d.title);
}

function renderSheetRingEfield(d: EmFieldDiagram): string {
  const L = d.labels;
  const O = { x: 206, y: 250 };
  const per = { x: { dx: -13, dy: 10 }, y: { dx: 26, dy: 2 }, z: { dx: 0, dy: -20 } };
  const P3 = (x: number, y: number, z: number): [number, number] => [
    O.x + x * per.x.dx + y * per.y.dx + z * per.z.dx,
    O.y + x * per.x.dy + y * per.y.dy + z * per.z.dy,
  ];
  const numOf = (s: string | undefined, def: number): number => {
    const m = /(-?\d+(?:\.\d+)?)/.exec(texToPlain(s ?? ""));
    return m ? Number(m[1]) : def;
  };
  const zsM = /(-?\d+(?:\.\d+)?)/.exec(texToPlain(L.sheetZ ?? "z = 3"));
  const zS = zsM ? Number(zsM[1]) : 3;
  const zP = numOf(L.pZnum, 1.4);
  const R = numOf(L.rNum, 1.4);
  let s = "";

  // 면전하 평면 (z=z_s, xy 평행) — 평행사변형.
  const c1 = P3(-1, -1.5, zS), c2 = P3(2.5, -1.5, zS), c3 = P3(2.5, 3, zS), c4 = P3(-1, 3, zS);
  s += `<polygon points="${[c1, c2, c3, c4].map((p) => p.join(",")).join(" ")}" fill="#e2e8f0" fill-opacity="0.8" stroke="${STROKE}" stroke-width="1.4"/>`;
  s += label((c3[0] + c4[0]) / 2 + 20, (c3[1] + c4[1]) / 2 - 2, L.sheetZ ?? "z = 3", { anchor: "start", fill: MUTED, size: 11 });
  s += label((c1[0] + c2[0]) / 2 - 6, (c1[1] + c2[1]) / 2 + 14, L.sheet ?? "\\rho_s", { anchor: "middle", fill: ACCENT, weight: 600, size: 12 });

  // 좌표축.
  const zTip = P3(0, 0, zS + 0.8), yTip = P3(0, 3.4, 0), xTip = P3(2.8, 0, 0);
  s += arrow(O.x, O.y, zTip[0], zTip[1], MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, yTip[0], yTip[1], MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, xTip[0], xTip[1], MUTED, "emArrowD", 1.5);
  s += label(zTip[0] + 6, zTip[1], "z[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(yTip[0] + 8, yTip[1] + 4, "y[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(xTip[0] - 4, xTip[1] + 12, "x[m]", { anchor: "end", fill: MUTED, size: 11 });
  s += label(O.x - 8, O.y + 6, "O", { anchor: "end", fill: MUTED, size: 11 });

  // 원형 링 선전하 (z=0 평면, 원점 중심, 반지름 R) — 타원 투영.
  const ringPts: string[] = [];
  const N = 40;
  for (let k = 0; k <= N; k++) {
    const th = (2 * Math.PI * k) / N;
    const p = P3(R * Math.cos(th), R * Math.sin(th), 0);
    ringPts.push(p.join(","));
  }
  s += `<polyline points="${ringPts.join(" ")}" fill="none" stroke="${ACCENT}" stroke-width="2.2"/>`;
  const rEdge = P3(R, 0, 0);
  s += label(rEdge[0] + 4, rEdge[1] + 14, L.ring ?? "\\lambda", { anchor: "start", fill: ACCENT, weight: 600, size: 12 });
  // 반지름 표시 (중심→링 가장자리).
  const rMid = P3(R * 0.55, R * 0.35, 0);
  s += `<line x1="${O.x}" y1="${O.y}" x2="${P3(R * 0.7, R * 0.7, 0)[0]}" y2="${P3(R * 0.7, R * 0.7, 0)[1]}" stroke="${ACCENT}" stroke-width="1" stroke-dasharray="3 2"/>`;
  s += label(rMid[0], rMid[1], texToPlain(L.ringR ?? "R"), { fill: ACCENT, size: 11 });

  // 점 P (z축 위 z_p).
  const pPt = P3(0, 0, zP);
  s += `<circle cx="${pPt[0]}" cy="${pPt[1]}" r="4" fill="${STROKE}"/>`;
  s += label(pPt[0] + 8, pPt[1] - 4, L.pointP ?? "P", { anchor: "start", fill: STROKE, weight: 700, size: 12 });

  if (L.target) s += label(W / 2, H - 8, texToPlain(L.target), { fill: FIELD, weight: 700, size: 13 });
  return svgWrap(s, d.title);
}

/**
 * 자계 H(x) 속의 정사각형 폐경로 (∮H·dl → 면적 극한 → ∇×H).
 *
 * 배치: x축 수평(좌 = x 증가) · z축 수직(상) · y축 우상 사선.
 * 정사각형 abcd는 xz 평면 위 축 정렬 사각형으로 그린다(중심 (x₀,0,0)).
 * 꼭짓점은 문제 본문 정의와 동일: a·b가 x가 큰 쪽(화면 왼쪽), c·d가 x가 작은 쪽.
 * H는 a_z 방향이고 크기가 x²에 비례하므로 x가 클수록(왼쪽) 화살표를 길게 그린다.
 */
function renderSquareLoopCurl(d: EmFieldDiagram): string {
  const L = d.labels;
  const O = { x: 356, y: 214 };
  const ux = -38; // a_x 1칸 (좌)
  const uz = -38; // a_z 1칸 (상)
  const uy = { dx: 26, dy: -14 }; // a_y 1칸 (우상)
  let s = "";

  // 자계 H = k x² a_z — x가 커질수록(왼쪽) 긴 상향 화살표. 정사각형 뒤에 먼저 그림.
  for (const xu of [0.6, 1.4, 2.2, 3.0, 3.8]) {
    const px = O.x + xu * ux;
    const len = Math.min(120, 16 + 9 * xu * xu); // ∝ x²
    s += arrow(px, O.y + 34, px, O.y + 34 - len, "#93c5fd", "emArrow", 1.6);
  }

  // 좌표축 (x 좌 · y 우상 · z 상).
  const xTip = { x: O.x + 4.5 * ux, y: O.y };
  const zTip = { x: O.x, y: O.y + 4.0 * uz };
  const yTip = { x: O.x + 2.6 * uy.dx, y: O.y + 2.6 * uy.dy };
  s += arrow(O.x, O.y, xTip.x, xTip.y, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, zTip.x, zTip.y, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, yTip.x, yTip.y, MUTED, "emArrowD", 1.5);
  s += label(xTip.x - 6, xTip.y + 5, "x[m]", { anchor: "end", fill: MUTED, size: 11 });
  s += label(zTip.x, zTip.y - 8, "z[m]", { anchor: "middle", fill: MUTED, size: 11 });
  s += label(yTip.x + 8, yTip.y - 2, "y[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(O.x + 10, O.y + 16, "O", { anchor: "start", fill: MUTED, size: 11 });

  // 정사각형 abcd — 중심 (x₀,0,0), 축 정렬. a·b = x 큰 쪽(왼쪽), c·d = x 작은 쪽(오른쪽).
  const C = { x: O.x + 2.4 * ux, y: O.y };
  const hw = 46, hh = 46;
  const A = { x: C.x - hw, y: C.y + hh }; // a(x₀+ℓ/2, 0, −ℓ/2)
  const B = { x: C.x - hw, y: C.y - hh }; // b(x₀+ℓ/2, 0, +ℓ/2)
  const Cc = { x: C.x + hw, y: C.y - hh }; // c(x₀−ℓ/2, 0, +ℓ/2)
  const D = { x: C.x + hw, y: C.y + hh }; // d(x₀−ℓ/2, 0, −ℓ/2)
  s += `<polygon points="${A.x},${A.y} ${B.x},${B.y} ${Cc.x},${Cc.y} ${D.x},${D.y}" fill="#fef9c3" fill-opacity="0.7" stroke="${STROKE}" stroke-width="2"/>`;
  // 경로 방향 화살표 (a→b→c→d→a) — 각 변 중앙에 짧게.
  s += arrow(A.x, A.y - hh * 0.25, A.x, B.y + hh * 0.25, ACCENT, "emArrowR", 1.8);
  s += arrow(B.x + hw * 0.25, B.y, Cc.x - hw * 0.25, Cc.y, ACCENT, "emArrowR", 1.8);
  s += arrow(Cc.x, Cc.y + hh * 0.25, D.x, D.y - hh * 0.25, ACCENT, "emArrowR", 1.8);
  s += arrow(D.x - hw * 0.25, D.y, A.x + hw * 0.25, A.y, ACCENT, "emArrowR", 1.8);
  // 꼭짓점 라벨.
  s += label(A.x - 4, A.y + 20, "a", { anchor: "middle", fill: STROKE, weight: 700 });
  s += label(B.x - 10, B.y - 6, "b", { anchor: "middle", fill: STROKE, weight: 700 });
  s += label(Cc.x + 10, Cc.y - 6, "c", { anchor: "middle", fill: STROKE, weight: 700 });
  s += label(D.x + 10, D.y + 14, "d", { anchor: "middle", fill: STROKE, weight: 700 });
  // 중심 + 좌표 라벨 (자계 화살표가 뒤로 지나므로 흰 배경판을 깔아 가독성 확보).
  s += `<circle cx="${C.x}" cy="${C.y}" r="3.2" fill="${ACCENT}"/>`;
  s += `<rect x="${C.x - 34}" y="${C.y + 7}" width="68" height="16" fill="#ffffff" fill-opacity="0.9"/>`;
  s += label(C.x, C.y + 19, L.center ?? "(x_0, 0, 0)", { anchor: "middle", fill: STROKE, size: 11 });
  // 한 변 길이 ℓ 표기 — 상단 변 위(하단 목표 주석과 겹치지 않도록).
  s += label((B.x + Cc.x) / 2, B.y - 13, L.side ?? "\\ell", { anchor: "middle", fill: MUTED, size: 12 });
  // 면 방향 단위 벡터 a_n = −a_y (y의 반대 = 좌하) — 사각형 밖까지 빼서 라벨 충돌 방지.
  const anTip = { x: C.x - 2.3 * uy.dx, y: C.y - 2.3 * uy.dy };
  s += arrow(C.x, C.y, anTip.x, anTip.y, "#047857", "emArrowD", 1.8);
  s += label(anTip.x - 6, anTip.y - 9, "a_n = −a_y", { anchor: "end", fill: "#047857", size: 11, weight: 600 });

  // 자계식 라벨(좌상) + 목표 주석(하단).
  s += label(24, 46, L.field ?? "H = 20x² a_z [A/m]", { anchor: "start", fill: FIELD, weight: 700, size: 13 });
  if (L.target) s += label(W / 2, H - 8, texToPlain(L.target), { fill: FIELD, weight: 700, size: 13 });
  return svgWrap(s, d.title);
}

/**
 * 직각 좌표계 위 두 점전하 + 측정점 P (임용 4번 전자기학).
 *  원본 배치: z축(위)·y축(오른쪽)·x축(좌하 사선). A는 y축 위, B는 z축 위, P(0,d,d)는 두 좌표의 교차점.
 *  P에서 A·B로 점선 보조선을 그어 두 거리가 수직임을 보인다.
 */
function renderTwoChargesAxes(d: EmFieldDiagram): string {
  // ★ 캔버스는 W=560·H=300 고정 — 좌표를 그 안에 맞춘다(밖으로 나가면 라벨·축이 잘린다, 실측).
  const L = d.labels;
  const O = { x: 210, y: 215 };          // 원점
  const A = { x: 340, y: 215 };          // y축 위 A(0,d,0)
  const B = { x: 210, y: 105 };          // z축 위 B(0,0,d)
  const P = { x: 340, y: 105 };          // P(0,d,d) — A의 위, B의 오른쪽
  let s = "";

  // 좌표축 (z 위 · y 오른쪽 · x 좌하 사선 = 관측자 방향) — 원본 그림과 동일 배치.
  s += arrow(O.x, O.y, O.x, 52, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, 470, O.y, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, 140, 268, MUTED, "emArrowD", 1.5);
  s += label(O.x + 8, 50, "z[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(474, O.y + 4, "y[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(136, 280, "x[m]", { anchor: "end", fill: MUTED, size: 11 });
  s += label(O.x - 10, O.y + 16, "O", { anchor: "end", fill: MUTED, size: 11 });

  // 보조 점선 — P에서 A(수직)·B(수평)로. 두 거리가 서로 수직임을 보인다.
  s += `<line x1="${P.x}" y1="${P.y}" x2="${A.x}" y2="${A.y}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  s += `<line x1="${P.x}" y1="${P.y}" x2="${B.x}" y2="${B.y}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="4 3"/>`;

  // 점전하 A (y축) · B (z축) · 측정점 P
  s += `<circle cx="${A.x}" cy="${A.y}" r="4.5" fill="${ACCENT}"/>`;
  s += label(A.x + 8, A.y + 20, L.pointA ?? "A", { anchor: "start", fill: STROKE, size: 12, weight: 600 });
  s += label(A.x + 8, A.y + 36, L.chargeA ?? "Q_A", { anchor: "start", fill: ACCENT, size: 11.5, weight: 600 });

  s += `<circle cx="${B.x}" cy="${B.y}" r="4.5" fill="${ACCENT}"/>`;
  s += label(B.x - 12, B.y + 4, L.pointB ?? "B", { anchor: "end", fill: STROKE, size: 12, weight: 600 });
  s += label(B.x - 12, B.y + 20, L.chargeB ?? "Q_B", { anchor: "end", fill: ACCENT, size: 11.5, weight: 600 });

  s += `<circle cx="${P.x}" cy="${P.y}" r="4.5" fill="${STROKE}"/>`;
  s += label(P.x + 10, P.y - 8, L.pointP ?? "P", { anchor: "start", fill: STROKE, size: 12.5, weight: 700 });

  s += label(W / 2, 292, "전계는 벡터 합(수직 성분) · 전위는 스칼라 합", { anchor: "middle", fill: MUTED, size: 10 });
  return svgWrap(s, d.title);
}

/**
 * 무한히 긴 직선 원통 도체 (임용 12번 전자기학) — z축 위 원통 + 단면 A(아래)·B(위) + L 치수 + ρ·φ 표기.
 *  ※ 캔버스 W=560·H=300 고정.
 */
function renderCylinderConductor(d: EmFieldDiagram): string {
  const L = d.labels;
  const cx = 250, top = 70, bot = 235, rx = 26, ry = 9;
  let s = "";

  // 원통 몸통 + 위·아래 단면(타원)
  s += `<rect x="${cx - rx}" y="${top}" width="${rx * 2}" height="${bot - top}" fill="#e2e8f0" fill-opacity="0.55" stroke="${STROKE}" stroke-width="1.4"/>`;
  s += `<ellipse cx="${cx}" cy="${top}" rx="${rx}" ry="${ry}" fill="#cbd5e1" stroke="${STROKE}" stroke-width="1.4"/>`;
  s += `<ellipse cx="${cx}" cy="${bot}" rx="${rx}" ry="${ry}" fill="#cbd5e1" stroke="${STROKE}" stroke-width="1.4"/>`;

  // z축 (무한 표시) · y축 · x축
  s += arrow(cx, bot, cx, 40, MUTED, "emArrowD", 1.5);
  s += label(cx + 8, 38, "z[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(cx - rx - 6, 58, "∞", { anchor: "end", fill: MUTED, size: 12 });
  s += label(cx - rx - 6, 266, "−∞", { anchor: "end", fill: MUTED, size: 12 });
  s += arrow(cx, bot, 460, bot, MUTED, "emArrowD", 1.4);
  s += label(464, bot + 4, "y[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += arrow(cx, bot, 150, 280, MUTED, "emArrowD", 1.4);
  s += label(146, 290, "x[m]", { anchor: "end", fill: MUTED, size: 11 });
  s += label(cx - rx - 6, bot + 14, "O", { anchor: "end", fill: MUTED, size: 10 });

  // 단면 라벨 A·B, 반경 r
  s += label(cx - rx - 10, top + 4, L.top ?? "B", { anchor: "end", fill: STROKE, size: 12.5, weight: 700 });
  s += label(cx - rx - 10, bot + 4, L.bottom ?? "A", { anchor: "end", fill: STROKE, size: 12.5, weight: 700 });
  // 반경 표시 — z축 라벨과 겹치지 않도록 원통 **오른쪽 바깥**에 둔다(실측: 상단에 두면 z[m]과 겹침).
  s += `<line x1="${cx}" y1="${top}" x2="${cx + rx}" y2="${top}" stroke="${ACCENT}" stroke-width="1.3"/>`;
  s += label(cx + rx + 6, top - 4, L.radius ?? "r", { anchor: "start", fill: ACCENT, size: 11 });

  // 길이 L 치수선 (오른쪽)
  const dx = cx + rx + 48;
  s += `<line x1="${dx}" y1="${top}" x2="${dx}" y2="${bot}" stroke="${MUTED}" stroke-width="1.2"/>`;
  s += `<line x1="${dx - 5}" y1="${top}" x2="${dx + 5}" y2="${top}" stroke="${MUTED}" stroke-width="1.2"/>`;
  s += `<line x1="${dx - 5}" y1="${bot}" x2="${dx + 5}" y2="${bot}" stroke="${MUTED}" stroke-width="1.2"/>`;
  s += label(dx + 8, (top + bot) / 2 + 4, L.length ?? "L", { anchor: "start", fill: STROKE, size: 12 });

  // 도전율·전위차 (왼쪽)
  s += label(cx - rx - 24, (top + bot) / 2 - 8, L.sigma ?? "\\sigma", { anchor: "end", fill: ACCENT, size: 11.5, weight: 600 });
  s += label(cx - rx - 24, (top + bot) / 2 + 10, L.vab ?? "V_{AB}", { anchor: "end", fill: STROKE, size: 11.5, weight: 600 });

  // ρ·φ 표기 (원통 좌표) — 유니코드로 직접(라벨 변환기가 \rho·\phi를 그대로 흘린다).
  s += label(cx + 96, bot + 20, "ρ", { anchor: "start", fill: MUTED, size: 13 });
  s += label(cx + 40, bot + 26, "φ", { anchor: "start", fill: MUTED, size: 13 });
  s += label(W / 2, 292, "외부 자계는 앙페르 법칙: |H| = I/(2πρ) (a_φ 방향)", { anchor: "middle", fill: MUTED, size: 10 });
  return svgWrap(s, d.title);
}

/**
 * 무한히 긴 동축선로 — 바깥 원통(외부 도체) 안에 가는 원통(내부 도체).
 * 내부 도체 전류는 +z(위), 외부 도체 전류는 −z(아래) 화살표로 방향을 구분해 그린다.
 */
function renderCoaxCurrent(d: EmFieldDiagram): string {
  const L = d.labels;
  const cx = 236, top = 72, bot = 232;
  const oRx = 54, oRy = 15;   // 외부 도체
  const iRx = 15, iRy = 5;    // 내부 도체
  let s = "";

  // 바깥 원통 몸통 + 아래 단면(먼저) → 위 단면은 내부 도체보다 나중에 그려 가리지 않게 한다.
  s += `<rect x="${cx - oRx}" y="${top}" width="${oRx * 2}" height="${bot - top}" fill="#e2e8f0" fill-opacity="0.35" stroke="${STROKE}" stroke-width="1.3"/>`;
  s += `<ellipse cx="${cx}" cy="${bot}" rx="${oRx}" ry="${oRy}" fill="#cbd5e1" fill-opacity="0.7" stroke="${STROKE}" stroke-width="1.3"/>`;

  // 안쪽 도체 몸통
  s += `<rect x="${cx - iRx}" y="${top}" width="${iRx * 2}" height="${bot - top}" fill="#94a3b8" fill-opacity="0.75" stroke="${STROKE}" stroke-width="1.2"/>`;
  s += `<ellipse cx="${cx}" cy="${bot}" rx="${iRx}" ry="${iRy}" fill="#94a3b8" stroke="${STROKE}" stroke-width="1.2"/>`;

  // 바깥 원통 위 단면(테두리만) + 안쪽 도체 위 단면
  s += `<ellipse cx="${cx}" cy="${top}" rx="${oRx}" ry="${oRy}" fill="#f1f5f9" fill-opacity="0.9" stroke="${STROKE}" stroke-width="1.3"/>`;
  s += `<ellipse cx="${cx}" cy="${top}" rx="${iRx}" ry="${iRy}" fill="${ACCENT}" fill-opacity="0.35" stroke="${STROKE}" stroke-width="1.2"/>`;

  // z축 (무한 표시)
  s += arrow(cx, bot + 34, cx, 38, MUTED, "emArrowD", 1.4);
  s += label(cx + 7, 36, "z", { anchor: "start", fill: MUTED, size: 11.5 });
  s += label(cx - oRx - 8, 52, "∞", { anchor: "end", fill: MUTED, size: 12 });
  s += label(cx - oRx - 8, 276, "−∞", { anchor: "end", fill: MUTED, size: 12 });

  // 전류 화살표 — 내부 도체는 위(+a_z), 외부 도체는 아래(−a_z)
  for (const dx of [-7, 7]) s += arrow(cx + dx, top + 46, cx + dx, top + 10, ACCENT, "emArrowA", 1.6);
  for (const dx of [-oRx + 9, oRx - 9]) s += arrow(cx + dx, top + 12, cx + dx, top + 52, STROKE, "emArrowD", 1.6);

  // 반지름 지시선 — a는 위 단면 안쪽, b는 위 단면 바깥(서로 겹치지 않게 높이를 벌린다)
  s += `<line x1="${cx}" y1="${top}" x2="${cx + iRx}" y2="${top}" stroke="${ACCENT}" stroke-width="1.3"/>`;
  s += label(cx + iRx + 4, top - 22, L.a ?? "a", { anchor: "start", fill: ACCENT, size: 11 });
  s += `<line x1="${cx + iRx}" y1="${top - 18}" x2="${cx + iRx}" y2="${top - 4}" stroke="${ACCENT}" stroke-width="0.9" stroke-dasharray="3 3"/>`;
  s += `<line x1="${cx}" y1="${top + oRy - 2}" x2="${cx + oRx}" y2="${top + oRy - 2}" stroke="${STROKE}" stroke-width="1.3"/>`;
  s += label(cx + oRx + 6, top + oRy + 2, L.b ?? "b", { anchor: "start", fill: STROKE, size: 11 });

  // 전류 라벨 (왼쪽 — 위: 내부 도체, 아래: 외부 도체)
  s += label(cx - oRx - 12, top + 40, L.iInner ?? "I", { anchor: "end", fill: ACCENT, size: 11.5, weight: 600 });
  s += label(cx - oRx - 12, top + 120, L.iOuter ?? "I", { anchor: "end", fill: STROKE, size: 11.5, weight: 600 });

  // 도체 이름 (오른쪽 지시선)
  s += `<line x1="${cx + iRx + 2}" y1="${top + 6}" x2="${cx + oRx + 30}" y2="${top + 60}" stroke="${MUTED}" stroke-width="0.9"/>`;
  s += label(cx + oRx + 34, top + 62, L.inner ?? "내부 도체", { anchor: "start", fill: MUTED, size: 10 });
  s += `<line x1="${cx + oRx - 4}" y1="${top + 96}" x2="${cx + oRx + 30}" y2="${top + 96}" stroke="${MUTED}" stroke-width="0.9"/>`;
  s += label(cx + oRx + 34, top + 99, L.outer ?? "외부 도체", { anchor: "start", fill: MUTED, size: 10 });

  // x·y축 + 원통 좌표 표기
  s += arrow(cx, bot, cx + 150, bot, MUTED, "emArrowD", 1.3);
  s += label(cx + 154, bot + 4, "y", { anchor: "start", fill: MUTED, size: 11 });
  s += arrow(cx, bot, cx - 96, bot + 40, MUTED, "emArrowD", 1.3);
  s += label(cx - 100, bot + 48, "x", { anchor: "end", fill: MUTED, size: 11 });
  s += label(cx + oRx + 16, bot + 20, "ρ", { anchor: "start", fill: MUTED, size: 12.5 });
  s += label(cx + 26, bot - 16, "φ", { anchor: "start", fill: MUTED, size: 12.5 });

  s += label(W / 2, 294, "앙페르 주회 법칙: H(2πρ) = I_enc  (ρ>b 에서는 I_enc = I − I = 0)", { anchor: "middle", fill: MUTED, size: 10 });
  return svgWrap(s, d.title);
}

/**
 * 점전하 + z축과 평행한 무한 선전하 (2023 전기 A-10) — 직각 좌표계 3D 도식.
 *  ★ 캔버스 W=560·H=300 고정 — 좌표를 그 안에 맞춘다(밖으로 나가면 축·라벨이 잘린다, 실측).
 *  ★ 고정 슬롯: 점전하 P는 좌상단, 선전하는 원점 오른쪽에 z축과 나란한 세로 직선.
 *    (실제 좌표는 회차마다 달라지지만 그림은 결정론 — 라벨만 payload에서 받는다.)
 */
/**
 * x축 위의 무한 선전하 + 점전하 P₁(0,d,h) + 측정점 P₂(0,0,h) — 직각 좌표계 3D 도식 (임용 9번).
 *  ★ 원본 배치: z 위 · y 오른쪽 · x 좌하 사선이고, **선전하는 x축과 겹쳐** 좌하–우상으로 무한히 뻗는다.
 *  ★ 캔버스 W=560·H=300 고정 — 좌표가 밖으로 나가면 라벨이 잘린다(형제 렌더러 실측).
 */
function renderPointLineNullAxes(d: EmFieldDiagram): string {
  const L = d.labels;
  const O = { x: 250, y: 215 };
  let s = "";

  // 좌표축
  s += arrow(O.x, O.y, O.x, 52, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, 500, O.y, MUTED, "emArrowD", 1.5);
  s += label(O.x + 8, 50, "z", { anchor: "start", fill: MUTED, size: 11 });
  s += label(504, O.y + 4, "y", { anchor: "start", fill: MUTED, size: 11 });
  // O 라벨은 선전하(=x축)가 원점을 지나므로 **왼쪽 위**에 둔다(선 위에 겹치지 않게).
  s += label(O.x - 12, O.y - 8, "O(0,0,0)", { anchor: "end", fill: STROKE, size: 11, weight: 700 });

  // ── 무한 선전하 = x축 (좌하 ↔ 우상 사선, 양끝 무한 표시) ──────────
  const x1 = 146, y1 = 268, x2 = 352, y2 = 138;   // x축 방향 사선
  s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ACCENT}" stroke-width="2.6"/>`;
  s += `<line x1="${x1}" y1="${y1}" x2="${x1 - 16}" y2="${y1 + 10}" stroke="${ACCENT}" stroke-width="1.4" stroke-dasharray="3 3"/>`;
  s += `<line x1="${x2}" y1="${y2}" x2="${x2 + 16}" y2="${y2 - 10}" stroke="${ACCENT}" stroke-width="1.4" stroke-dasharray="3 3"/>`;
  s += label(x1 - 22, y1 + 22, "x", { anchor: "end", fill: MUTED, size: 11 });
  // 선전하밀도 라벨 — 선 **위쪽**에 둬야 하단 캡션과 겹치지 않는다(규칙 #6).
  s += label(x1 + 26, y1 - 10, L.lineDensity ?? "\\rho_L", { anchor: "start", fill: ACCENT, size: 11.5, weight: 600 });

  // ── 측정점 P₂(0,0,h) — z축 위 ───────────────────────────────────
  const P2 = { x: O.x, y: 128 };
  s += `<circle cx="${P2.x}" cy="${P2.y}" r="4" fill="${STROKE}"/>`;
  s += label(P2.x - 10, P2.y - 8, L.pointQ ?? "\\mathrm{P}_2", { anchor: "end", fill: STROKE, size: 11.5, weight: 700 });
  // O → P₂ 거리 h (선전하까지의 수직거리)
  s += `<line x1="${O.x}" y1="${O.y}" x2="${P2.x}" y2="${P2.y}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  s += label(P2.x - 10, (O.y + P2.y) / 2 + 4, `${L.distB ?? "h"}`, { anchor: "end", fill: MUTED, size: 11 });

  // ── 점전하 P₁(0,d,h) — P₂에서 +y 방향 ────────────────────────────
  const P1 = { x: 418, y: P2.y };
  s += `<circle cx="${P1.x}" cy="${P1.y}" r="4.5" fill="${FIELD}"/>`;
  s += label(P1.x + 9, P1.y - 8, L.pointP ?? "\\mathrm{P}_1", { anchor: "start", fill: STROKE, size: 11.5, weight: 700 });
  s += label(P1.x + 9, P1.y + 12, L.charge ?? "Q_\\mathrm{A}", { anchor: "start", fill: FIELD, size: 11.5, weight: 600 });
  // P₂ ↔ P₁ 거리 d
  s += `<line x1="${P2.x}" y1="${P2.y}" x2="${P1.x}" y2="${P1.y}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  s += label((P1.x + P2.x) / 2, P2.y - 8, `${L.distA ?? "d"}`, { anchor: "middle", fill: MUTED, size: 11 });

  s += label(W / 2, 292, "P₂에서 선전하에 의한 E₁(+a_z)과 점전하에 의한 E₂(−a_y)", { anchor: "middle", fill: MUTED, size: 10 });
  return svgWrap(s, d.title);
}

function renderPointLineChargeAxes(d: EmFieldDiagram): string {
  const L = d.labels;
  const O = { x: 250, y: 205 };
  let s = "";

  // 좌표축 — z 위 · y 오른쪽 · x 좌하 사선 (원본 그림과 같은 배치)
  s += arrow(O.x, O.y, O.x, 48, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, 480, O.y, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, 150, 268, MUTED, "emArrowD", 1.5);
  s += label(O.x + 8, 46, "z[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(484, O.y + 4, "y[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(146, 280, "x[m]", { anchor: "end", fill: MUTED, size: 11 });
  s += label(O.x - 9, O.y + 16, "O", { anchor: "end", fill: STROKE, size: 12, weight: 700 });

  // ── 무한 선전하: z축과 평행한 세로 직선 (원점 오른쪽) ──────────────
  const lx = 352, lTop = 66, lBot = 250;
  s += `<line x1="${lx}" y1="${lTop}" x2="${lx}" y2="${lBot}" stroke="${ACCENT}" stroke-width="2.2"/>`;
  s += label(lx, lTop - 8, "∞", { anchor: "middle", fill: MUTED, size: 11 });
  s += label(lx, lBot + 14, "−∞", { anchor: "middle", fill: MUTED, size: 11 });
  // 선이 xy평면을 지나는 점
  s += `<circle cx="${lx}" cy="${O.y - 14}" r="3.5" fill="${ACCENT}"/>`;
  s += label(lx + 9, O.y - 18, L.linePoint ?? "(0, 0, 0)", { anchor: "start", fill: STROKE, size: 11 });
  s += label(lx + 9, O.y + 34, L.lineDensity ?? "\\rho_l", { anchor: "start", fill: ACCENT, size: 11.5, weight: 600 });
  // 원점 → 선까지의 수직 거리(점선) — ρ
  s += `<line x1="${O.x}" y1="${O.y}" x2="${lx}" y2="${O.y - 14}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="4 3"/>`;
  s += label((O.x + lx) / 2, O.y + 6, "ρ", { anchor: "middle", fill: MUTED, size: 11 });

  // ── 점전하 P (좌상단) ────────────────────────────────────────────
  const P = { x: 150, y: 118 };
  s += `<circle cx="${P.x}" cy="${P.y}" r="4.5" fill="${FIELD}"/>`;
  s += label(P.x - 8, P.y - 8, L.pointP ?? "P", { anchor: "end", fill: STROKE, size: 12, weight: 700 });
  s += label(P.x - 8, P.y + 10, L.charge ?? "Q", { anchor: "end", fill: FIELD, size: 11.5, weight: 600 });
  // P → O 방향(전계 E₁의 작용선) 점선
  s += `<line x1="${P.x}" y1="${P.y}" x2="${O.x}" y2="${O.y}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="4 3"/>`;

  // 원점에 놓인 전하
  s += `<circle cx="${O.x}" cy="${O.y}" r="4" fill="${STROKE}"/>`;
  s += label(O.x - 9, O.y + 34, L.target ?? "O", { anchor: "end", fill: STROKE, size: 11 });

  s += label(W / 2, 292, "원점 O에서 E₁(점전하) + E₂(무한 선전하) — 힘 F = q(E₁+E₂)", { anchor: "middle", fill: MUTED, size: 10 });
  return svgWrap(s, d.title);
}

/**
 * 두 무한 면전류(y=±d 평면) + 원점 + x=0 면의 사각형 (임용 10번) — 직각 좌표계 3D 도식.
 *  ★ 캔버스 W=560·H=300 고정. 좌: K₁(아래 방향 화살표) / 우: K₂(위 방향) / 가운데: 사각형.
 */
function renderSheetCurrentsPlanes(d: EmFieldDiagram): string {
  const L = d.labels;
  const O = { x: 280, y: 190 };
  let s = "";

  // 좌표축 — z 위 · y 오른쪽 · x 좌하 사선
  s += arrow(O.x, O.y, O.x, 44, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, 500, O.y, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, 190, 258, MUTED, "emArrowD", 1.5);
  s += label(O.x + 8, 42, "z", { anchor: "start", fill: MUTED, size: 11 });
  s += label(504, O.y + 4, "y", { anchor: "start", fill: MUTED, size: 11 });
  s += label(186, 270, "x", { anchor: "end", fill: MUTED, size: 11 });
  s += label(O.x - 9, O.y + 15, "O", { anchor: "end", fill: STROKE, size: 11.5, weight: 700 });

  // ── 두 면전류 평면 (평행사변형으로 원근 표현) ─────────────────────
  const plane = (cx: number, col: string) =>
    `<polygon points="${cx - 26},${O.y - 92} ${cx + 26},${O.y - 118} ${cx + 26},${O.y + 60} ${cx - 26},${O.y + 86}" ` +
    `fill="${col}" fill-opacity="0.10" stroke="${col}" stroke-width="1.4"/>`;
  const x1 = 130, x2 = 430;
  s += plane(x1, ACCENT) + plane(x2, ACCENT);

  // 면 위 전류 화살표 — K₁은 −a_z(아래), K₂는 +a_z(위)
  for (const dx of [-13, 0, 13]) {
    s += arrow(x1 + dx, O.y - 70, x1 + dx, O.y + 46, ACCENT, "emArrowD", 1.3);   // 아래 방향
    s += arrow(x2 + dx, O.y + 46, x2 + dx, O.y - 70, ACCENT, "emArrowD", 1.3);   // 위 방향
  }
  // ★ 면 라벨은 **위쪽**(K 라벨 아래)에 둔다 — 아래에 두면 하단 캡션과 겹친다(실측).
  s += label(x1, O.y - 118, L.k1 ?? "K_1", { anchor: "middle", fill: ACCENT, size: 10.5, weight: 600 });
  s += label(x2, O.y - 118, L.k2 ?? "K_2", { anchor: "middle", fill: ACCENT, size: 10.5, weight: 600 });
  s += label(x1, O.y - 99, L.plane1 ?? "y = -d", { anchor: "middle", fill: MUTED, size: 10 });
  s += label(x2, O.y - 99, L.plane2 ?? "y = d", { anchor: "middle", fill: MUTED, size: 10 });

  // ── x=0 면의 사각형 (원점 주위, 음영) ────────────────────────────
  const rw = 44, rh = 40;
  s += `<rect x="${O.x - rw / 2}" y="${O.y - rh / 2}" width="${rw}" height="${rh}" fill="${FIELD}" fill-opacity="0.16" stroke="${FIELD}" stroke-width="1.3"/>`;
  s += label(O.x, O.y + rh / 2 + 32, L.rect ?? "x=0 면의 사각형", { anchor: "middle", fill: FIELD, size: 10 });

  // 기준점 P
  s += `<circle cx="${O.x + 52}" cy="${O.y - 26}" r="3.5" fill="${STROKE}"/>`;
  s += label(O.x + 58, O.y - 30, L.refPoint ?? "P", { anchor: "start", fill: STROKE, size: 10.5, weight: 600 });

  s += label(W / 2, 292, "두 면 사이에서 두 면전류의 자계가 더해진다 (바깥에서는 상쇄)", { anchor: "middle", fill: MUTED, size: 10 });
  return svgWrap(s, d.title);
}

/**
 * z축과 나란한 무한 직선 도선 2개(전류 반대 방향) + 측정점 O·P — 직각 좌표계 도식 (임용 11번 형식).
 *  ★ 캔버스 W=560·H=300 고정. y축 위 세 위치(도선 A · 점 P · 도선 B)는 값이 아니라 **고정 슬롯**에
 *    배치한다(y_A<y_P<a는 생성기가 보장하므로 순서만 맞으면 된다).
 */
function renderTwoWiresAxes(d: EmFieldDiagram): string {
  const L = d.labels;
  const O = { x: 150, y: 208 };
  const xA = 250, xP = 320, xB = 430;   // 도선 A · 점 P · 도선 B 의 고정 슬롯
  const top = 66, bot = 256;            // 도선(수직선)의 위·아래 끝
  let s = "";

  // 좌표축 — z 위 · y 오른쪽 · x 좌하 사선 (원본 그림 배치)
  s += arrow(O.x, O.y, O.x, 46, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, 520, O.y, MUTED, "emArrowD", 1.5);
  s += arrow(O.x, O.y, 78, 272, MUTED, "emArrowD", 1.5);
  s += label(O.x + 8, 44, "z[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(524, O.y + 4, "y[m]", { anchor: "start", fill: MUTED, size: 11 });
  s += label(74, 284, "x[m]", { anchor: "end", fill: MUTED, size: 11 });
  s += label(O.x - 10, O.y + 16, "O", { anchor: "end", fill: STROKE, size: 12, weight: 700 });

  // ── 무한 도선 2개 (z축과 나란한 수직선, 위·아래로 무한) ───────────
  //  ★ 라벨 배치 주의(규칙 #6): 도선 이름을 아래(bot 근처)에 두면 하단 캡션과 겹친다 → **위쪽**에 둔다.
  //    y축 위치 라벨도 도선 수직선과 겹치지 않게 왼쪽으로 밀어 쓴다.
  const wire = (x: number, up: boolean, name: string, cur: string, pos: string) => {
    let w = `<line x1="${x}" y1="${top}" x2="${x}" y2="${bot}" stroke="${STROKE}" stroke-width="2.2"/>`;
    w += label(x, 42, name, { anchor: "middle", fill: STROKE, size: 11.5, weight: 700 });
    w += label(x, top - 4, "⋮", { anchor: "middle", fill: MUTED, size: 12 });
    w += label(x, bot + 16, "⋮", { anchor: "middle", fill: MUTED, size: 12 });
    // 전류 방향 화살표 — +a_z(위) 또는 −a_z(아래)
    w += up
      ? arrow(x + 12, O.y - 20, x + 12, top + 24, ACCENT, "emArrowR", 1.8)
      : arrow(x + 12, top + 24, x + 12, O.y - 20, ACCENT, "emArrowR", 1.8);
    w += label(x + 18, top + 52, cur, { anchor: "start", fill: ACCENT, size: 11.5, weight: 600 });
    // y축과 만나는 점 + 위치 라벨(수직선 왼쪽)
    w += `<circle cx="${x}" cy="${O.y}" r="3" fill="${STROKE}"/>`;
    w += label(x - 7, O.y + 17, pos, { anchor: "end", fill: MUTED, size: 11 });
    return w;
  };
  s += wire(xA, true, L.wireA ?? "도선 A", L.currentA ?? "I", L.posA ?? "1");
  s += wire(xB, false, L.wireB ?? "도선 B", L.currentB ?? "I", L.posB ?? "a");

  // ── 측정점 P (y축 위, 두 도선 사이) ───────────────────────────────
  s += `<circle cx="${xP}" cy="${O.y}" r="4" fill="${FIELD}"/>`;
  s += label(xP, O.y - 10, "P", { anchor: "middle", fill: FIELD, size: 12, weight: 700 });
  s += label(xP + 6, O.y + 17, L.pointP ?? "2", { anchor: "start", fill: MUTED, size: 11 });

  s += label(W / 2, 292, texToPlain(L.target ?? "O와 P에서의 합성 자계와 도선 B에 작용하는 단위 길이당 힘"),
    { anchor: "middle", fill: MUTED, size: 10 });
  return svgWrap(s, d.title);
}

const RENDERERS: Record<EmGeometryKind, (d: EmFieldDiagram) => string> = {
  two_wires_axes: renderTwoWiresAxes,
  sheet_currents_planes: renderSheetCurrentsPlanes,
  point_line_charge_axes: renderPointLineChargeAxes,
  point_line_null_axes: renderPointLineNullAxes,
  two_charges_axes: renderTwoChargesAxes,
  cylinder_conductor: renderCylinderConductor,
  coax_current: renderCoaxCurrent,
  point_charge: renderPointCharge,
  two_charges: renderTwoCharges,
  line_charge: renderLineCharge,
  charged_sheet: renderChargedSheet,
  parallel_plates: renderParallelPlates,
  straight_wire: renderStraightWire,
  solenoid: renderSolenoid,
  toroid: renderToroid,
  moving_rod: renderMovingRod,
  flux_loop_resistor: renderFluxLoopResistor,
  current_in_field: renderCurrentInField,
  em_wave: renderEmWave,
  potential_field: renderPotentialField,
  coax: renderCoax,
  sphere_cap: renderSphereCap,
  mutual_coils: renderMutualCoils,
  plane_flux: renderPlaneFlux,
  dielectric_slab: renderDielectricSlab,
  flux_prism: renderFluxPrism,
  sheet_line_superposition: renderSheetLineSuperposition,
  circular_loops_axis: renderCircularLoopsAxis,
  sheet_line_efield: renderSheetLineEfield,
  coax_resistor: renderCoaxResistor,
  coax_two_dielectric: renderCoaxTwoDielectric,
  sheet_ring_efield: renderSheetRingEfield,
  square_loop_curl: renderSquareLoopCurl,
  bent_wire_axes: renderBentWireAxes,
  cylinder_internal_inductance: renderCylinderInternalInductance,
  sheet_line_vector_axes: renderSheetLineVectorAxes,
};

/**
 * 원점에서 꺾인 반무한 직선 도선 — y축(−a_y로 유입) → O → x축(+a_x로 유출) + 측정점 P.
 *
 * 원본 배치 그대로: z 위 · y 오른쪽 · x 좌하 사선. 도선은 y축 양의 방향 먼 곳에서 O로 들어와
 * x축 사선 방향으로 빠져나간다(그림에서는 좌하로 뻗는 굵은 선). P는 xy평면 위의 점이라
 * 두 축 사이 영역에 찍고 점선 보조선으로 x·y 좌표를 표시한다.
 *
 * ★ 라벨 gotcha: 전류 라벨을 도선 위에 얹으면 축 라벨과 겹친다(규칙 #6) → 도선 바깥쪽으로 띄운다.
 */
function renderBentWireAxes(d: EmFieldDiagram): string {
  const L = d.labels;
  const O = { x: 236, y: 132 };
  const yEnd = { x: 470, y: O.y };   // +y 방향 도선 끝 (무한히 먼 곳)
  const xEnd = { x: 92, y: 264 };    // +x 방향 도선 끝 (좌하 사선)
  let s = "";

  // ── 좌표축 (원본 배치: z↑ · y→ · x↙) ─────────────────────────────
  s += arrow(O.x, O.y, O.x, 40, MUTED, "emArrowD", 1.4);
  s += arrow(O.x, O.y, 512, O.y, MUTED, "emArrowD", 1.4);
  s += arrow(O.x, O.y, 70, 286, MUTED, "emArrowD", 1.4);
  s += label(O.x + 8, 38, "z", { anchor: "start", fill: MUTED, size: 12 });
  s += label(516, O.y + 4, "y", { anchor: "start", fill: MUTED, size: 12 });
  s += label(66, 296, "x", { anchor: "end", fill: MUTED, size: 12 });
  s += label(O.x - 6, O.y - 8, "O", { anchor: "end", fill: STROKE, size: 12, weight: 700 });

  // ── 꺾인 도선 (굵게) — y축 구간 + x축 구간 ────────────────────────
  s += `<line x1="${O.x}" y1="${O.y}" x2="${yEnd.x}" y2="${yEnd.y}" stroke="${STROKE}" stroke-width="3.4"/>`;
  s += `<line x1="${O.x}" y1="${O.y}" x2="${xEnd.x}" y2="${xEnd.y}" stroke="${STROKE}" stroke-width="3.4"/>`;
  s += `<circle cx="${O.x}" cy="${O.y}" r="3.4" fill="${STROKE}"/>`;

  // 전류 방향 화살표 — y축은 먼 곳→O(−a_y), x축은 O→먼 곳(+a_x)
  const cur = texToPlain(L.current ?? "I[A]");
  s += arrow(yEnd.x - 24, O.y - 12, O.x + 40, O.y - 12, ACCENT, "emArrowR", 2);
  s += label((O.x + yEnd.x) / 2, O.y - 20, cur, { anchor: "middle", fill: ACCENT, size: 11.5, weight: 600 });
  s += arrow(O.x - 34, O.y + 22, xEnd.x + 34, xEnd.y - 12, ACCENT, "emArrowR", 2);
  s += label((O.x + xEnd.x) / 2 - 26, (O.y + xEnd.y) / 2 - 6, cur, { anchor: "end", fill: ACCENT, size: 11.5, weight: 600 });

  // ── 측정점 P (xy평면 위) + 좌표 보조선 ────────────────────────────
  const P = { x: 348, y: 226 };
  const footY = { x: 348, y: O.y };                     // y축 위의 수선의 발(같은 y좌표)
  const footX = { x: O.x - (P.y - O.y) * 0.62, y: P.y }; // x축 사선 위의 대응점
  s += `<line x1="${P.x}" y1="${P.y}" x2="${footY.x}" y2="${footY.y}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="4 3"/>`;
  s += `<line x1="${P.x}" y1="${P.y}" x2="${footX.x}" y2="${footX.y}" stroke="${MUTED}" stroke-width="1" stroke-dasharray="4 3"/>`;
  s += `<circle cx="${P.x}" cy="${P.y}" r="4" fill="${FIELD}"/>`;
  s += label(P.x + 8, P.y + 5, texToPlain(L.pointP ?? "P(3,4,0)"), { anchor: "start", fill: FIELD, size: 11.5, weight: 700 });

  s += label(W / 2, 296, texToPlain(L.target ?? ""), { anchor: "middle", fill: MUTED, size: 10 });
  return svgWrap(s, d.title);
}

/**
 * z축으로 무한히 긴 **수평** 원통 도체 + 내부 점 P(중심 O에서 a) + 길이 1[m] 구간.
 *
 * 원본 배치 그대로: x축 위 · z축 오른쪽 위 사선(원통 축) · y축 오른쪽 아래 사선.
 * 원통은 좌하 → 우상 사선으로 눕고, **좌측 단면(타원)** 에 O·P·a·r을 표기한다.
 *
 * ★ 라벨 gotcha: 반지름 r을 단면 안쪽에 두면 P·a 라벨과 겹친다 → 단면 왼쪽 아래 바깥에 둔다.
 */
function renderCylinderInternalInductance(d: EmFieldDiagram): string {
  const L = d.labels;
  let s = "";

  // ── 기준 벡터 — 원통 축은 **z축 그 자체**다(따로 기울이면 축과 어긋나 보인다) ──
  const O = { x: 152, y: 196 };                 // 원점 = 앞쪽 단면 중심
  const u = { x: 0.952, y: -0.306 };            // z축(원통 축) 단위 벡터
  const n = { x: -u.y, y: u.x };                // 축에 수직(단면 방향)
  const RAD = 40;                               // 단면 반지름(화면상 장축)
  const DEPTH = 14;                             // 원근에 의한 타원 단축
  const LEN = 248;                              // 그려지는 원통 길이
  const at = (t: number, k = 0) => ({ x: O.x + u.x * t + n.x * k, y: O.y + u.y * t + n.y * k });
  const far = at(LEN);
  const tilt = (Math.atan2(u.y, u.x) * 180) / Math.PI; // 타원 회전각(=축 기울기)
  const ell = (c: { x: number; y: number }, fill: string, op: number) =>
    `<ellipse cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" rx="${DEPTH}" ry="${RAD}" ` +
    `transform="rotate(${tilt.toFixed(2)} ${c.x.toFixed(1)} ${c.y.toFixed(1)})" ` +
    `fill="${fill}" fill-opacity="${op}" stroke="${STROKE}" stroke-width="1.4"/>`;

  // ── z축 — 원통 **바깥 구간만** 그린다(몸통을 관통해 그리면 지저분하다) ──────
  const back = at(-70);
  s += `<line x1="${back.x.toFixed(1)}" y1="${back.y.toFixed(1)}" x2="${O.x}" y2="${O.y}" stroke="${MUTED}" stroke-width="1.3" stroke-dasharray="6 4"/>`;
  s += label(back.x - 6, back.y + 12, "−∞", { anchor: "end", fill: MUTED, size: 11 });
  const zTip = at(LEN + 108);
  s += arrow(far.x, far.y, zTip.x, zTip.y, MUTED, "emArrowD", 1.4);
  s += label(zTip.x + 7, zTip.y + 4, "z", { anchor: "start", fill: MUTED, size: 12 });
  const infTip = at(LEN + 66, -14);
  s += label(infTip.x, infTip.y, "+∞", { anchor: "middle", fill: MUTED, size: 11 });

  // ── 원통 (뒤 단면 → 몸통 → 앞 단면 순서로 겹쳐 그린다) ───────────────────
  s += ell(far, "#f1f5f9", 0.7);
  const p1 = at(0, -RAD), p2 = at(LEN, -RAD), p3 = at(LEN, RAD), p4 = at(0, RAD);
  s += `<polygon points="${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)} ${p3.x.toFixed(1)},${p3.y.toFixed(1)} ${p4.x.toFixed(1)},${p4.y.toFixed(1)}" fill="#e2e8f0" fill-opacity="0.55" stroke="none"/>`;
  s += `<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${STROKE}" stroke-width="1.4"/>`;
  s += `<line x1="${p4.x.toFixed(1)}" y1="${p4.y.toFixed(1)}" x2="${p3.x.toFixed(1)}" y2="${p3.y.toFixed(1)}" stroke="${STROKE}" stroke-width="1.4"/>`;
  s += ell(O, "#cbd5e1", 0.9);

  // ── 전류 화살표 (축과 나란히, 몸통 안) ────────────────────────────────────
  const cA = at(64), cB = at(176);
  s += arrow(cA.x, cA.y, cB.x, cB.y, ACCENT, "emArrowR", 2.2);
  const cLab = at(120, 22);
  s += label(cLab.x, cLab.y + 4, texToPlain(L.current ?? "10[A]"), { anchor: "middle", fill: ACCENT, size: 11.5, weight: 600 });

  // ── 1[m] 치수선 — 원통 **위쪽 바깥**에 축과 나란히, 양 끝 눈금 ───────────
  const off = -(RAD + 22);
  const m1 = at(56, off), m2 = at(172, off);
  const tick = (p: { x: number; y: number }) =>
    `<line x1="${(p.x - n.x * 6).toFixed(1)}" y1="${(p.y - n.y * 6).toFixed(1)}" x2="${(p.x + n.x * 6).toFixed(1)}" y2="${(p.y + n.y * 6).toFixed(1)}" stroke="${MUTED}" stroke-width="1.2"/>`;
  s += `<line x1="${m1.x.toFixed(1)}" y1="${m1.y.toFixed(1)}" x2="${m2.x.toFixed(1)}" y2="${m2.y.toFixed(1)}" stroke="${MUTED}" stroke-width="1.1" stroke-dasharray="4 3"/>`;
  s += tick(m1) + tick(m2);
  const mLab = at(114, off - 12);
  s += label(mLab.x, mLab.y, texToPlain(L.length ?? "1[m]"), { anchor: "middle", fill: STROKE, size: 11.5 });

  // ── x축(위) · y축(앞쪽 아래) — 원점에서 뻗는다 ───────────────────────────
  s += arrow(O.x, O.y, O.x, 46, MUTED, "emArrowD", 1.4);
  s += label(O.x + 8, 46, "x", { anchor: "start", fill: MUTED, size: 12 });
  s += arrow(O.x, O.y, 286, 278, MUTED, "emArrowD", 1.4);
  s += label(292, 284, "y", { anchor: "start", fill: MUTED, size: 12 });

  // ── 중심 O · 내부 점 P · 거리 a · 반지름 r ───────────────────────────────
  //  ★ 라벨 배치(규칙 #6): 단면은 지름 80px 남짓인데 P·a·O·r 넷이 몰려 "P a[m]"처럼
  //    한 덩어리로 읽혔다(실측). 넷을 **서로 다른 방향**으로 흩는다 —
  //    P는 선 바깥 위쪽, a는 O–P 선에서 축(+u) 방향으로, O는 축 반대(−u) 아래, r는 단면 바깥 아래.
  //    O 라벨은 y축 선·타원 면과 겹치므로 **흰 테두리(paint-order)** 로 가독성을 확보한다.
  const halo = (x: number, y: number, text: string, opts: { anchor?: string; fill?: string; size?: number }) =>
    `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${opts.anchor ?? "middle"}" font-size="${opts.size ?? 12}" ` +
    `font-weight="700" fill="${opts.fill ?? STROKE}" stroke="#ffffff" stroke-width="3.2" paint-order="stroke" ` +
    `stroke-linejoin="round">${esc(texToPlain(text))}</text>`;

  const P = at(0, -26);
  s += `<line x1="${O.x}" y1="${O.y}" x2="${P.x.toFixed(1)}" y2="${P.y.toFixed(1)}" stroke="${ACCENT}" stroke-width="1.6"/>`;
  // a[m] — O–P 선 중점에서 축(+u) 쪽으로 밀어 P 라벨과 분리
  const aLab = at(20, -13);
  s += halo(aLab.x + 4, aLab.y + 4, L.pointP ?? "a[m]", { anchor: "start", fill: ACCENT, size: 11.5 });
  // P — 선 바깥(위·왼쪽)
  s += `<circle cx="${P.x.toFixed(1)}" cy="${P.y.toFixed(1)}" r="3.8" fill="${FIELD}"/>`;
  s += halo(P.x - 10, P.y - 4, "P", { anchor: "end", fill: FIELD, size: 12.5 });
  // O — 축 반대쪽(−u) 아래, 흰 테두리로 y축 선 위에서도 읽히게
  const oLab = at(-16, 16);
  s += `<circle cx="${O.x}" cy="${O.y}" r="3.4" fill="${STROKE}"/>`;
  s += halo(oLab.x - 2, oLab.y + 4, "O", { anchor: "end", fill: STROKE, size: 12.5 });
  // r[m] — 단면 **바깥** 아래(반지름 선 연장 방향)
  const rEnd = at(0, RAD);
  const rLab = at(0, RAD + 16);
  s += `<line x1="${O.x}" y1="${O.y}" x2="${rEnd.x.toFixed(1)}" y2="${rEnd.y.toFixed(1)}" stroke="${MUTED}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  s += halo(rLab.x + 6, rLab.y + 6, L.radius ?? "r[m]", { anchor: "start", fill: MUTED, size: 11.5 });

  return svgWrap(s, d.title);
}

/**
 * x=x_p 무한 면전하 평면 + (x=0, z=z_L) 무한 선전하(y축 나란) + **축 밖의** 점 P.
 *
 * 원본 배치: z 위 · y 오른쪽 · x 좌하 사선. 면전하 ㉠는 x=x_p 에서 **빗금 평행사변형**,
 * 선전하 ㉡는 z=z_L 높이에서 y축과 나란한 굵은 선, 점 P는 그 사이에 찍고 좌표를 라벨로 단다.
 *
 * ★ 라벨 gotcha: 평면 라벨을 평면 위쪽 안에 두면 선전하 선과 겹친다 → 평면 **바깥 위**로.
 */
function renderSheetLineVectorAxes(d: EmFieldDiagram): string {
  const L = d.labels;
  const O = { x: 268, y: 170 };
  const yLine = O.y - 54;              // 선전하 높이 (z = z_L)
  let s = "";

  // ── 좌표축 (z↑ · y→ · x↙) ───────────────────────────────────────
  s += arrow(O.x, O.y, O.x, 48, MUTED, "emArrowD", 1.4);
  s += label(O.x + 8, 46, "z", { anchor: "start", fill: MUTED, size: 12 });
  s += arrow(O.x, O.y, 500, O.y, MUTED, "emArrowD", 1.4);
  s += label(506, O.y + 4, "y", { anchor: "start", fill: MUTED, size: 12 });
  s += arrow(O.x, O.y, 108, 286, MUTED, "emArrowD", 1.4);
  s += label(104, 294, "x", { anchor: "end", fill: MUTED, size: 12 });
  s += label(O.x - 8, O.y - 8, "O", { anchor: "end", fill: STROKE, size: 12, weight: 700 });

  // ── ㉠ 무한 면전하 평면 (x = x_p, yz면과 나란) — 빗금 평행사변형 ──
  const sx = 128, sy = 264, wPl = 150, hPl = 76, skew = 20;
  const corners = [
    [sx, sy],
    [sx + wPl, sy],
    [sx + wPl - skew, sy - hPl],
    [sx - skew, sy - hPl],
  ];
  s += "<polygon points=\"" + corners.map((q) => q[0] + "," + q[1]).join(" ") +
    "\" fill=\"#cbd5e1\" fill-opacity=\"0.5\" stroke=\"" + STROKE + "\" stroke-width=\"1.3\"/>";
  for (let i = 1; i < 8; i++) {
    const x0 = sx + (wPl / 8) * i;
    s += "<line x1=\"" + x0 + "\" y1=\"" + sy + "\" x2=\"" + (x0 - skew) + "\" y2=\"" + (sy - hPl) +
      "\" stroke=\"" + MUTED + "\" stroke-width=\"0.7\"/>";
  }
  s += label(sx + wPl / 2 - skew / 2, sy - hPl / 2 + 5, texToPlain(L.sigma ?? "C_1"),
    { anchor: "middle", fill: STROKE, size: 13, weight: 700 });
  s += label(sx - skew - 4, sy - hPl - 8, texToPlain(L.sheet ?? "x = 4"),
    { anchor: "start", fill: STROKE, size: 11.5, weight: 600 });

  // ── ㉡ 무한 선전하 (z = z_L, y축과 나란) ──────────────────────────
  s += "<line x1=\"" + (O.x - 128) + "\" y1=\"" + yLine + "\" x2=\"474\" y2=\"" + yLine +
    "\" stroke=\"" + STROKE + "\" stroke-width=\"2.6\"/>";
  s += label(O.x - 134, yLine + 4, "⋯", { anchor: "end", fill: MUTED, size: 12 });
  s += label(480, yLine + 4, "⋯", { anchor: "start", fill: MUTED, size: 12 });
  s += label(O.x - 78, yLine - 9, texToPlain(L.lambda ?? "C_2"), { anchor: "middle", fill: STROKE, size: 13, weight: 700 });
  s += label(392, yLine - 9, texToPlain(L.line ?? "x = 0, z = 1"), { anchor: "middle", fill: STROKE, size: 11.5, weight: 600 });

  // ── 점 P (축 밖) + 선전하까지의 수직 보조선 ──────────────────────
  const P = { x: 352, y: 218 };
  s += "<line x1=\"" + P.x + "\" y1=\"" + P.y + "\" x2=\"" + P.x + "\" y2=\"" + yLine +
    "\" stroke=\"" + MUTED + "\" stroke-width=\"1\" stroke-dasharray=\"4 3\"/>";
  s += "<circle cx=\"" + P.x + "\" cy=\"" + P.y + "\" r=\"4\" fill=\"" + FIELD + "\"/>";
  s += label(P.x + 9, P.y + 5, texToPlain(L.pointP ?? "P(1, 2, -1)"), { anchor: "start", fill: FIELD, size: 11.5, weight: 700 });

  return svgWrap(s, d.title);
}

/** 메인 진입점 — diagram.geometry로 dispatch. */
export function renderEmFieldDiagram(diagram: EmFieldDiagram | undefined | null): string {
  if (!diagram || !diagram.geometry) return `<pre>em_field_diagram: geometry 비어있음</pre>`;
  const fn = RENDERERS[diagram.geometry];
  if (!fn) return `<pre>em_field_diagram: 미지원 geometry ${esc(String(diagram.geometry))}</pre>`;
  return fn(diagram);
}
