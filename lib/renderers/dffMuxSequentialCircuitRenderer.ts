/**
 * D-FF/T-FF 2개 + 2×1 MUX 2개 자율 순차회로 (임용 8번 (나)) 전용 fixed-slot 렌더러.
 *  세로 2단 스택: [상단] MUX_A → FF_A(D_A/T_A) → Q_A / [하단] MUX_B → FF_B → Q_B.
 *  공통 선택선 S=selectVar(Q_A|Q_B) → 두 MUX. CLK 공통. Q_A·Q_B 우측 출력 + 좌측 피드백 트렁크.
 *  MUX 데이터입력 ㉠㉡(상)·㉢㉣(하)는 학생 도출(빈칸).
 */
import type { DffMuxSequentialCircuitDiagram } from "@/types";

const S = 'stroke="#111827" fill="none" stroke-width="1.6"';       // 선(path)용 — fill 없음
const SK = 'stroke="#111827" stroke-width="1.6"';                   // 채움 도형(polygon/rect)용 — fill은 개별 지정
const wire = (x1: number, y1: number, x2: number, y2: number) =>
  `<path d="M ${x1} ${y1} L ${x2} ${y2}" ${S}/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="3.2" fill="#111827"/>`;
const txt = (x: number, y: number, s: string, a = "start", c = "#1e3a8a", sz = 13) =>
  `<text x="${x}" y="${y}" font-size="${sz}" font-family="sans-serif" fill="${c}" text-anchor="${a}">${s}</text>`;

// 레이아웃 좌표
const MUX_L = 210, MUX_R = 270, TOP_CY = 120, BOT_CY = 300, MUX_HL = 30, MUX_HR = 18;
const FF_L = 360, FF_R = 430, FF_HALF = 40;
const Q_OUT_X = 560, SEL_TRUNK_X = 150, CLK_Y = 400, BOT_RAIL = 430;

/** 2×1 MUX 사다리꼴 — 좌면(I0 위·I1 아래), 우 tip(F), 하단 S. */
function mux(cy: number, i0: string, i1: string, label: string): string {
  const top = cy - MUX_HL, bot = cy + MUX_HL, rTop = cy - MUX_HR, rBot = cy + MUX_HR;
  let s = `<polygon points="${MUX_L},${top} ${MUX_R},${rTop} ${MUX_R},${rBot} ${MUX_L},${bot}" fill="white" ${SK}/>`;
  s += txt((MUX_L + MUX_R) / 2, top - 6, label, "middle", "#6b7280", 11);
  s += txt(MUX_L + 8, cy - 12, "I0", "start", "#374151", 10);
  s += txt(MUX_L + 8, cy + 16, "I1", "start", "#374151", 10);
  s += txt((MUX_L + MUX_R) / 2 + 4, cy + 4, "S", "start", "#374151", 10);
  // 데이터입력 라벨 (㉠㉡ 등)
  s += txt(MUX_L - 10, cy - 12 + 4, i0, "end", "#7c3aed", 13);
  s += txt(MUX_L - 10, cy + 16 + 4, i1, "end", "#7c3aed", 13);
  return s;
}
/** FF 박스 — 좌 입력핀(D/T), 우 Q, 하단 클록 ▷. */
function ff(cy: number, inLabel: string, qLabel: string): string {
  const top = cy - FF_HALF, bot = cy + FF_HALF;
  let s = `<rect x="${FF_L}" y="${top}" width="${FF_R - FF_L}" height="${bot - top}" fill="white" ${SK}/>`;
  s += txt(FF_L + 8, cy - FF_HALF + 22, inLabel, "start", "#111827", 13);
  s += txt(FF_R - 8, cy - FF_HALF + 22, "Q", "end", "#111827", 13);
  s += txt(FF_R - 8, cy + FF_HALF - 10, "Q'", "end", "#6b7280", 11);
  // 클록 ▷ (하단 좌측)
  s += `<path d="M ${FF_L} ${bot - 14} L ${FF_L + 10} ${bot - 9} L ${FF_L} ${bot - 4}" ${S}/>`;
  s += txt(FF_R + 8, cy - FF_HALF + 22, qLabel, "start", "#dc2626", 14);
  return s;
}

type D = DffMuxSequentialCircuitDiagram;

export function renderDffMuxSequentialCircuit(d: D): string {
  const ffIn = d.ffType === "T" ? "T" : "D";
  const mA = d.muxes[0], mB = d.muxes[1];
  let s = "";

  // ── 상단 단 (A) ──
  s += mux(TOP_CY, mA.i0, mA.i1, "2×1 MUX");
  s += ff(TOP_CY, `${ffIn}_A`, "Q_A");
  s += wire(MUX_R, TOP_CY, FF_L, TOP_CY);                 // MUX_A F → FF_A 입력
  s += txt((MUX_R + FF_L) / 2, TOP_CY - 6, "F", "middle", "#6b7280", 10);
  // ── 하단 단 (B) ──
  s += mux(BOT_CY, mB.i0, mB.i1, "2×1 MUX");
  s += ff(BOT_CY, `${ffIn}_B`, "Q_B");
  s += wire(MUX_R, BOT_CY, FF_L, BOT_CY);
  s += txt((MUX_R + FF_L) / 2, BOT_CY - 6, "F", "middle", "#6b7280", 10);

  // ── Q 출력 (우측) + 라벨 ──
  s += wire(FF_R, TOP_CY, Q_OUT_X, TOP_CY); s += dot(Q_OUT_X, TOP_CY);
  s += wire(FF_R, BOT_CY, Q_OUT_X, BOT_CY); s += dot(Q_OUT_X, BOT_CY);
  s += txt(Q_OUT_X + 8, TOP_CY + 4, "Q_A", "start", "#dc2626", 13);
  s += txt(Q_OUT_X + 8, BOT_CY + 4, "Q_B", "start", "#dc2626", 13);

  // ── 공통 선택선 S = selectVar : 해당 Q 출력에서 분기 → 우측 riser → 하단 레일 → 좌측 riser → 두 MUX S핀 ──
  //   (다른 Q 출력선·클록선과 겹치지 않도록 회로 바깥(우측 x=RISER_R / 하단 y=BOT_RAIL / 좌측 x=SEL_TRUNK_X)으로 우회)
  const selY = d.selectVar === "Q_A" ? TOP_CY : BOT_CY;
  const RISER_R = Q_OUT_X + 40;   // Q 출력 dot 오른쪽 (다른 Q선 통과 방지)
  const selMuxX = (MUX_L + MUX_R) / 2 + 6;
  const feedY = (cy: number) => cy + MUX_HL + 14; // 각 MUX 바로 아래 급전 y
  s += wire(Q_OUT_X, selY, RISER_R, selY);           // Q 출력 → 오른쪽 stub
  s += dot(Q_OUT_X, selY);
  s += wire(RISER_R, selY, RISER_R, BOT_RAIL);        // 우측 riser 하강
  s += wire(RISER_R, BOT_RAIL, SEL_TRUNK_X, BOT_RAIL); // 하단 레일
  s += wire(SEL_TRUNK_X, BOT_RAIL, SEL_TRUNK_X, feedY(TOP_CY)); // 좌측 riser 상승
  s += txt(SEL_TRUNK_X - 6, (TOP_CY + BOT_CY) / 2, `S=${d.selectVar}`, "end", "#7c3aed", 12);
  for (const cy of [TOP_CY, BOT_CY]) {
    s += dot(SEL_TRUNK_X, feedY(cy));
    s += wire(SEL_TRUNK_X, feedY(cy), selMuxX, feedY(cy));
    s += wire(selMuxX, feedY(cy), selMuxX, cy + MUX_HR); // MUX 하단 S핀으로
  }

  // ── CLK 공통 → 두 FF ▷ (하단 레일보다 위, 좌측 riser와는 교차만) ──
  const clkX = FF_L - 26;
  s += txt(28, CLK_Y + 4, "CLK", "start", "#111827", 13);
  s += dot(58, CLK_Y);
  s += wire(58, CLK_Y, clkX, CLK_Y); s += wire(clkX, CLK_Y, clkX, TOP_CY + FF_HALF - 9);
  for (const cy of [TOP_CY, BOT_CY]) {
    s += wire(clkX, cy + FF_HALF - 9, FF_L, cy + FF_HALF - 9);
    s += dot(clkX, cy + FF_HALF - 9);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 640 460">${s}</svg>`;
}
