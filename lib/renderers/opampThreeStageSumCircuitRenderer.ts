import type { OpampThreeStageSumCircuitDiagram } from "@/types";

/**
 * 3-OPAMP 응용회로 (임용 2번 전자) 전용 fixed-slot 렌더러.
 *   U1 반전증폭(V1·Rin1·Rf1 → V_x) / U2 버퍼(V2 → V_buf) / U3 반전가산(Ra·Rb·R_f → V_o).
 */

const STROKE = "#111827";
const WIRE_W = 1.6;
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";
const W = 760, H = 450;

type D = OpampThreeStageSumCircuitDiagram;

export function renderOpampThreeStageSumCircuit(d: D): string {
  const w: string[] = [], s: string[] = [], t: string[] = [];

  // ── U1 반전증폭 (top-left) ──
  const u1 = { x: 235, cy: 110, ow: 70, oh: 72 };
  const u1neg = { x: u1.x, y: u1.cy - 18 }, u1pos = { x: u1.x, y: u1.cy + 18 }, u1out = { x: u1.x + u1.ow, y: u1.cy };
  s.push(opamp(u1.x, u1.cy, u1.ow, u1.oh, "neg-top"));
  // V1 입력 → Rin1 → (−)  (srcTerm 도선 끝 75에서 Rin1 시작 — 끊김 방지)
  srcTerm(s, t, 40, u1neg.y, d.v1Label);
  hRes(s, 75, 165, u1neg.y, d.rin1Label, t, "below");
  const n1 = { x: 200, y: u1neg.y };
  w.push(line(165, u1neg.y, u1neg.x, u1neg.y));
  s.push(dot(n1.x, n1.y));
  // Rf1 피드백 (out → 위로 → n1)
  w.push(line(u1out.x, u1out.y, u1out.x + 24, u1out.y));
  w.push(line(u1out.x + 24, u1out.y, u1out.x + 24, 52));
  hRes(s, n1.x, u1out.x + 24, 52, d.rf1Label, t, "above");
  w.push(line(n1.x, 52, n1.x, n1.y));
  // (+) → GND
  w.push(line(u1pos.x, u1pos.y, u1pos.x - 20, u1pos.y));
  s.push(gnd(u1pos.x - 20, u1pos.y + 4));
  // V_x 출력
  const vx = { x: u1out.x + 24, y: u1.cy };
  s.push(dot(vx.x, vx.y));
  t.push(text(vx.x + 6, vx.y + 18, d.vxLabel, { anchor: "start", size: 12, weight: 700, fill: RED }));

  // ── U2 버퍼 (bottom-left) ──
  const u2 = { x: 235, cy: 320, ow: 70, oh: 72 };
  const u2neg = { x: u2.x, y: u2.cy - 18 }, u2pos = { x: u2.x, y: u2.cy + 18 }, u2out = { x: u2.x + u2.ow, y: u2.cy };
  s.push(opamp(u2.x, u2.cy, u2.ow, u2.oh, "neg-top"));
  // V2 → (+)
  srcTerm(s, t, 40, u2pos.y, d.v2Label);
  w.push(line(75, u2pos.y, u2pos.x, u2pos.y));
  // 버퍼 피드백 (out → −)
  w.push(line(u2out.x, u2out.y, u2out.x + 24, u2out.y));
  w.push(line(u2out.x + 24, u2out.y, u2out.x + 24, u2.cy + 58));
  w.push(line(u2out.x + 24, u2.cy + 58, u2.x - 22, u2.cy + 58));
  w.push(line(u2.x - 22, u2.cy + 58, u2.x - 22, u2neg.y));
  w.push(line(u2.x - 22, u2neg.y, u2neg.x, u2neg.y));
  const vbuf = { x: u2out.x + 24, y: u2.cy };
  s.push(dot(vbuf.x, vbuf.y));

  // ── U3 (right) ── exam_similar=반전가산(−입력) / exam_variant=비반전가산(+입력, R_g·R_f→−)
  const u3 = { x: 560, cy: 215, ow: 80, oh: 96 };
  const nonInv = d.u3NonInverting === true;
  const u3out = { x: u3.x + u3.ow, y: u3.cy };
  const vo = { x: u3out.x + 30, y: u3.cy };

  if (nonInv) {
    // 비반전: 입력 → ★+(위)★, R_g(접지)·R_f(피드백) → −(아래).
    s.push(opamp(u3.x, u3.cy, u3.ow, u3.oh, true));  // 위=+·아래=−
    const plusPin = { x: u3.x, y: u3.cy - 22 }, minusPin = { x: u3.x, y: u3.cy + 22 };
    const PN = { x: 510, y: plusPin.y };  // + 마디
    // V_x → Ra → + 마디
    w.push(line(vx.x, vx.y, 400, vx.y), line(400, vx.y, 400, PN.y));
    hRes(s, 400, 475, PN.y, d.raLabel, t, "above");
    w.push(line(475, PN.y, PN.x, PN.y));
    // V_buf → Rb → + 마디 (아래에서 올라옴)
    w.push(line(vbuf.x, vbuf.y, 400, vbuf.y), line(400, vbuf.y, 400, 270));
    hRes(s, 400, 475, 270, d.rbLabel, t, "below");
    w.push(line(475, 270, PN.x, 270), line(PN.x, 270, PN.x, PN.y));
    s.push(dot(PN.x, PN.y), dot(PN.x, 270));
    w.push(line(PN.x, PN.y, plusPin.x, plusPin.y));  // + 마디 → + 핀
    // − 마디: − 핀 → 좌하 (540,290), 여기에 R_g(접지)·R_f(피드백)
    const MN = { x: 540, y: 290 };
    w.push(line(minusPin.x, minusPin.y, MN.x, minusPin.y), line(MN.x, minusPin.y, MN.x, MN.y));
    s.push(dot(MN.x, MN.y));
    // R_g: − 마디 → 아래 → GND
    vResD(s, t, MN.x, MN.y, MN.y + 64, d.rgLabel ?? "R_g[kΩ]");
    s.push(gnd(MN.x, MN.y + 64 + 4));
    // R_f: − 마디 → 우 → V_o 노드
    hRes(s, MN.x, vo.x, MN.y, d.rfLabel, t, "above");
    w.push(line(vo.x, MN.y, vo.x, u3out.y));
  } else {
    // 반전가산: 입력·R_f → −(위), +(아래)=GND.
    const u3neg = { x: u3.x, y: u3.cy - 22 }, u3pos = { x: u3.x, y: u3.cy + 22 };
    s.push(opamp(u3.x, u3.cy, u3.ow, u3.oh, false));
    const N = { x: 510, y: u3neg.y };
    w.push(line(vx.x, vx.y, 400, vx.y), line(400, vx.y, 400, u3neg.y));
    hRes(s, 400, 475, u3neg.y, d.raLabel, t, "above");
    w.push(line(475, u3neg.y, N.x, N.y));
    w.push(line(vbuf.x, vbuf.y, 400, vbuf.y), line(400, vbuf.y, 400, 270));
    hRes(s, 400, 475, 270, d.rbLabel, t, "below");
    w.push(line(475, 270, 510, 270), line(510, 270, 510, N.y));
    s.push(dot(N.x, N.y));
    w.push(line(N.x, N.y, u3neg.x, u3neg.y));
    w.push(line(u3out.x, u3out.y, u3out.x + 30, u3out.y), line(u3out.x + 30, u3out.y, u3out.x + 30, 135));
    hRes(s, N.x, u3out.x + 30, 135, d.rfLabel, t, "above");
    w.push(line(N.x, 135, N.x, N.y));
    w.push(line(u3pos.x, u3pos.y, u3pos.x - 20, u3pos.y));
    s.push(gnd(u3pos.x - 20, u3pos.y + 4));
  }
  // V_o
  w.push(line(u3out.x, u3out.y, vo.x, vo.y));
  s.push(dot(vo.x, vo.y));
  t.push(text(vo.x + 6, vo.y + 5, d.voLabel, { anchor: "start", size: 13, weight: 700, fill: ACCENT }));

  t.push(text(W / 2, H - 10, nonInv ? "U1 반전증폭→V_x · U2 버퍼 · U3 ★비반전★가산→V_o (R_f 도출)" : "U1 반전증폭→V_x · U2 버퍼 · U3 반전가산→V_o (R_f 도출)", { size: 10, fill: MUTED }));
  return svg(W, H, [...w, ...s, ...t]);
}

/** OPAMP 삼각형 (오른쪽 apex). invert=false: 위=−·아래=+ (기본). invert=true: 위=+·아래=− (극성 반전). */
function opamp(leftX: number, cy: number, ow: number, oh: number, invert: boolean | string = false): string {
  const top = cy - oh / 2, bot = cy + oh / 2, apex = leftX + ow;
  const inv = invert === true;
  const topSym = inv ? "+" : "−", botSym = inv ? "−" : "+";
  return (
    `<path d="M${leftX},${top} L${leftX},${bot} L${apex},${cy} Z" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<text x="${leftX + 10}" y="${cy - 18 + 4}" font-size="13" font-weight="700" fill="${STROKE}">${topSym}</text>` +
    `<text x="${leftX + 10}" y="${cy + 18 + 4}" font-size="13" font-weight="700" fill="${STROKE}">${botSym}</text>`
  );
}
/** 입력 단자 (작은 원 + 라벨). 단자에서 오른쪽으로 짧은 도선. */
function srcTerm(s: string[], t: string[], x: number, y: number, label: string): void {
  s.push(`<circle cx="${x}" cy="${y}" r="3.5" fill="white" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`);
  s.push(line(x, y, x + 35, y));
  t.push(text(x - 6, y + 4, label, { anchor: "end", size: 11, weight: 600 }));
}
/** 수평 저항 (x1→x2, y) + 라벨(above/below). 심볼 양옆에 실제 리드선으로 x1·x2까지 연결. */
function hRes(s: string[], x1: number, x2: number, y: number, label: string, t: string[], pos: "above" | "below"): void {
  const cx = (x1 + x2) / 2;
  const sh = Math.min((x2 - x1) / 2 - 4, 22);  // 심볼 반폭 (항상 리드가 남도록 −4)
  s.push(line(x1, y, cx - sh, y), symResistorH(cx, y, sh), line(cx + sh, y, x2, y));
  t.push(text(cx, pos === "above" ? y - 12 : y + 16, label, { size: 10, weight: 600 }));
}
/** 수직 저항 (x, y1↓y2) + 라벨(우측). */
function vResD(s: string[], t: string[], x: number, y1: number, y2: number, label: string): void {
  const cy = (y1 + y2) / 2, half = Math.min((y2 - y1) / 2 - 4, 20), a = 6, teeth = 6, step = (2 * half) / teeth;
  s.push(line(x, y1, x, cy - half), line(x, cy + half, x, y2));
  let p = `M${x},${cy - half}`;
  for (let i = 0; i < teeth; i++) p += ` L${x + (i % 2 === 0 ? -a : a)},${cy - half + step * (i + 0.5)}`;
  p += ` L${x},${cy + half}`;
  s.push(`<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`);
  t.push(text(x + 14, cy + 4, label, { size: 10, weight: 600, anchor: "start" }));
}
function symResistorH(cx: number, y: number, half: number): string {
  const a = 6, teeth = 6, step = (2 * half) / teeth;
  let p = `M${cx - half},${y}`;
  for (let i = 0; i < teeth; i++) p += ` L${cx - half + step * (i + 0.5)},${y + (i % 2 === 0 ? -a : a)}`;
  p += ` L${cx + half},${y}`;
  return `<path d="${p}" fill="none" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linejoin="round"/>`;
}
function gnd(cx: number, y: number): string {
  return `<line x1="${cx}" y1="${y - 4}" x2="${cx}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 10}" y1="${y}" x2="${cx + 10}" y2="${y}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 6}" y1="${y + 4}" x2="${cx + 6}" y2="${y + 4}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>` +
    `<line x1="${cx - 3}" y1="${y + 8}" x2="${cx + 3}" y2="${y + 8}" stroke="${STROKE}" stroke-width="${WIRE_W}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${WIRE_W}" stroke-linecap="round"/>`;
}
function dot(x: number, y: number): string {
  return `<circle cx="${x}" cy="${y}" r="3.2" fill="${STROKE}"/>`;
}
function text(x: number, y: number, str: string, o: { size?: number; weight?: number; anchor?: "start" | "middle" | "end"; fill?: string } = {}): string {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}" font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function svg(w2: number, h: number, body: string[]): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}" viewBox="0 0 ${w2} ${h}">\n${body.join("\n")}\n</svg>`;
}
