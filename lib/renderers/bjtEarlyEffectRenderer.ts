import type { BjtEarlyCurveDiagram, BjtEarlyStructureDiagram } from "@/types";

/**
 * 임용 27번 Early 효과 — (가) BJT 단면도 · (나) 출력특성곡선 전용 렌더러.
 *
 * (가) npn CE 접속의 세로 단면. 위에서부터
 *      `Collector 영역 / CBJ 공핍층 / Base 영역 / EBJ 공핍층 / Emitter 영역`.
 *      중성 베이스 구간에 유효 베이스폭 \( W_B^{eff} \) 양방향 화살표, 그 바깥에 원래 폭 \( W_B \).
 *      좌측 V_BE, 우측 V_CE, 위쪽 I_C.
 *
 * (나) \( I_C \)–\( V_{CE} \) 특성곡선. 활성영역의 **기울기가 0이 아닌 것**이 이 그림의 요점이라
 *      직선을 왼쪽으로 연장해 \( V_{CE} \)축과 만나는 \( -V_A \)를 점선으로 보인다.
 *
 * ★★ `roNote`는 생성기가 정한다 — `r_o = 1/(dI_C/dV_CE)`가 그 문항의 **정답**이면
 *    생성기가 빈칸 기호(`r_o = ( ㉣ )`)를 넣어 보낸다. 그림이 답을 알려주지 않게 하는 장치다
 *    (CLAUDE.md `thevenin_dep_graph_max_power`에서 학생이 구할 절편을 기호로만 찍은 것과 같은 처리).
 */

const STROKE = "#111827";
const AXIS = "#374151";
const MUTED = "#6b7280";
const DASH = "#1e3a8a";
const FONT = `'Noto Sans CJK KR','Malgun Gothic',sans-serif`;

const COLLECTOR_FILL = "#dbeafe";
const BASE_FILL = "#fef3c7";
const EMITTER_FILL = "#dcfce7";

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(
  x: number,
  y: number,
  s: string,
  o: { size?: number; weight?: number; fill?: string; anchor?: string; italic?: boolean } = {},
): string {
  return (
    `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 12}"` +
    ` font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}" font-family="${FONT}"` +
    `${o.italic ? ` font-style="italic"` : ""}>${esc(s)}</text>`
  );
}
function line(x1: number, y1: number, x2: number, y2: number, o: { w?: number; stroke?: string; dash?: string } = {}): string {
  return (
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.stroke ?? STROKE}"` +
    ` stroke-width="${o.w ?? 1.6}" stroke-linecap="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ""}/>`
  );
}
function dot(x: number, y: number, r = 3.4, fill = STROKE): string {
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
}

// ══════════════════════════════════════════════════════════════
// (가) BJT 단면도
// ══════════════════════════════════════════════════════════════

// ★ 폭 여유는 우측 라벨 열이 정한다 — W_B^eff / W_B 두 치수선 + V_CE 전원이 차례로 놓인다.
//   좁게 잡았더니 "W_B" 글자가 V_CE 전원 원 위에 얹혔다(시각검증에서 발견 — 텍스트끼리가 아니라
//   텍스트↔심볼 충돌이라 라벨 겹침 검사기가 못 잡는 자리다).
const S_W = 730, S_H = 460;
/** 단면 박스 가로 범위 */
const BX_L = 210, BX_R = 400;
/** 세로 구간 경계 — Collector / CBJ / Base / EBJ / Emitter */
const Y_C_TOP = 92, Y_C_BOT = 176;
const Y_CBJ_BOT = 208;
const Y_B_BOT = 246;
const Y_EBJ_BOT = 278;
const Y_E_BOT = 366;

export function renderBjtEarlyStructureSVG(d: BjtEarlyStructureDiagram): string {
  const effLabel = d.effWidthLabel ?? "W_B^eff";
  const nominalLabel = d.nominalWidthLabel ?? "W_B";
  const cx = (BX_L + BX_R) / 2;

  const defs =
    `<defs>` +
    `<pattern id="be-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="8" height="8" fill="#f3f4f6"/>` +
    `<line x1="0" y1="0" x2="0" y2="8" stroke="${MUTED}" stroke-width="1.6"/>` +
    `</pattern>` +
    `<marker id="be-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${STROKE}"/>` +
    `</marker>` +
    `<marker id="be-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${DASH}"/>` +
    `</marker>` +
    `</defs>`;

  // ── 영역 박스 ────────────────────────────────
  const band = (yTop: number, yBot: number, fill: string) =>
    `<rect x="${BX_L}" y="${yTop}" width="${BX_R - BX_L}" height="${yBot - yTop}" fill="${fill}" stroke="${STROKE}" stroke-width="1.5"/>`;

  const bands =
    band(Y_C_TOP, Y_C_BOT, COLLECTOR_FILL) +
    band(Y_C_BOT, Y_CBJ_BOT, "url(#be-hatch)") +
    band(Y_CBJ_BOT, Y_B_BOT, BASE_FILL) +
    band(Y_B_BOT, Y_EBJ_BOT, "url(#be-hatch)") +
    band(Y_EBJ_BOT, Y_E_BOT, EMITTER_FILL);

  const bandLabels =
    text(cx, (Y_C_TOP + Y_C_BOT) / 2 + 5, "Collector 영역", { size: 13, weight: 600 }) +
    text(cx, (Y_CBJ_BOT + Y_B_BOT) / 2 + 5, "Base 영역", { size: 13, weight: 600 }) +
    text(cx, (Y_EBJ_BOT + Y_E_BOT) / 2 + 5, "Emitter 영역", { size: 13, weight: 600 });

  // 공핍층 라벨 — 박스 왼쪽 바깥에 지시선과 함께 (규칙 #6: 라벨 간 최소 간격)
  const cbjY = (Y_C_BOT + Y_CBJ_BOT) / 2;
  const ebjY = (Y_B_BOT + Y_EBJ_BOT) / 2;
  const depletionLabels =
    line(BX_L - 54, cbjY, BX_L - 4, cbjY, { w: 1.1, stroke: MUTED }) +
    text(BX_L - 58, cbjY + 4, "CBJ 공핍층", { size: 11.5, fill: MUTED, anchor: "end" }) +
    line(BX_L - 54, ebjY, BX_L - 4, ebjY, { w: 1.1, stroke: MUTED }) +
    text(BX_L - 58, ebjY + 4, "EBJ 공핍층", { size: 11.5, fill: MUTED, anchor: "end" });

  // ── 유효 베이스폭 W_B^eff — 중성 베이스 구간 양방향 화살표 ──
  const xEff = BX_R + 30;
  const effArrow =
    line(xEff, Y_CBJ_BOT, xEff, Y_B_BOT, { w: 1.8, stroke: DASH }) +
    `<line x1="${xEff}" y1="${Y_CBJ_BOT}" x2="${xEff}" y2="${Y_CBJ_BOT - 0.1}" stroke="${DASH}" stroke-width="1.8" marker-end="url(#be-arrow2)"/>` +
    `<line x1="${xEff}" y1="${Y_B_BOT}" x2="${xEff}" y2="${Y_B_BOT + 0.1}" stroke="${DASH}" stroke-width="1.8" marker-end="url(#be-arrow2)"/>` +
    line(BX_R, Y_CBJ_BOT, xEff + 8, Y_CBJ_BOT, { w: 0.9, stroke: MUTED, dash: "3 3" }) +
    line(BX_R, Y_B_BOT, xEff + 8, Y_B_BOT, { w: 0.9, stroke: MUTED, dash: "3 3" }) +
    text(xEff + 14, (Y_CBJ_BOT + Y_B_BOT) / 2 + 4, effLabel, { size: 13, weight: 700, fill: DASH, anchor: "start" });

  // 원래(변조 전) 베이스폭 W_B — 공핍층을 포함한 바깥 구간
  const xNom = BX_R + 122;
  const nomArrow =
    line(xNom, Y_C_BOT, xNom, Y_EBJ_BOT, { w: 1.4, stroke: MUTED }) +
    `<line x1="${xNom}" y1="${Y_C_BOT}" x2="${xNom}" y2="${Y_C_BOT - 0.1}" stroke="${MUTED}" stroke-width="1.4" marker-end="url(#be-arrow)"/>` +
    `<line x1="${xNom}" y1="${Y_EBJ_BOT}" x2="${xNom}" y2="${Y_EBJ_BOT + 0.1}" stroke="${MUTED}" stroke-width="1.4" marker-end="url(#be-arrow)"/>` +
    text(xNom + 12, (Y_C_BOT + Y_EBJ_BOT) / 2 + 4, nominalLabel, { size: 12.5, weight: 600, fill: MUTED, anchor: "start" });

  // ── 단자·전원 ────────────────────────────────
  // I_C — 컬렉터 위로
  const icLead =
    line(cx, Y_C_TOP, cx, 52, { w: 1.6 }) +
    `<line x1="${cx}" y1="70" x2="${cx}" y2="46" stroke="${STROKE}" stroke-width="1.8" marker-end="url(#be-arrow)"/>` +
    text(cx + 16, 62, "I_C", { size: 13, weight: 700, anchor: "start", italic: true });

  // V_CE — 우상단에서 하단 rail로. W_B 치수선·라벨보다 충분히 오른쪽.
  const X_VCE = 640;
  const Y_RAIL = 412;
  const vce =
    line(cx, 52, X_VCE, 52, { w: 1.6 }) +
    line(X_VCE, 52, X_VCE, 176, { w: 1.6 }) +
    srcCircle(X_VCE, 202, "V_CE") +
    line(X_VCE, 228, X_VCE, Y_RAIL, { w: 1.6 }) +
    line(X_VCE, Y_RAIL, cx, Y_RAIL, { w: 1.6 });

  // V_BE — 좌측에서 베이스로
  const X_VBE = 96;
  const baseY = (Y_CBJ_BOT + Y_B_BOT) / 2;
  const vbe =
    line(BX_L, baseY, X_VBE, baseY, { w: 1.6 }) +
    dot(BX_L, baseY) +
    srcCircle(X_VBE, baseY + 62, "V_BE", true) +
    line(X_VBE, baseY, X_VBE, baseY + 36, { w: 1.6 }) +
    line(X_VBE, baseY + 88, X_VBE, Y_RAIL, { w: 1.6 }) +
    line(X_VBE, Y_RAIL, cx, Y_RAIL, { w: 1.6 });

  // 이미터 → 하단 rail (접지 1개)
  const emitter =
    line(cx, Y_E_BOT, cx, Y_RAIL, { w: 1.6 }) +
    dot(cx, Y_RAIL) +
    groundSymbol(cx, Y_RAIL);

  const caption = d.caption ? text(S_W / 2, S_H - 8, d.caption, { size: 12, fill: MUTED }) : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${S_H}" viewBox="0 0 ${S_W} ${S_H}">
${defs}
${bands}
${bandLabels}
${depletionLabels}
${effArrow}
${nomArrow}
${icLead}
${vce}
${vbe}
${emitter}
${caption}
</svg>`;
}

/** 직류 전원 기호 — 원 + 극성. `vertical`이면 세로 배치. */
function srcCircle(x: number, y: number, label: string, vertical = false): string {
  const r = 20;
  const body =
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#ffffff" stroke="${STROKE}" stroke-width="1.6"/>` +
    text(x, y - 5, "+", { size: 13, weight: 700 }) +
    text(x, y + 13, "−", { size: 13, weight: 700 });
  const lbl = vertical
    ? text(x - r - 8, y + 4, label, { size: 12.5, weight: 600, anchor: "end" })
    : text(x + r + 8, y + 4, label, { size: 12.5, weight: 600, anchor: "start" });
  return body + lbl;
}

/** 접지 기호 — 하단 rail에 하나만 (CLAUDE.md 2026-08-10 규칙). */
function groundSymbol(x: number, y: number): string {
  return (
    line(x, y, x, y + 14, { w: 1.6 }) +
    line(x - 16, y + 14, x + 16, y + 14, { w: 1.8 }) +
    line(x - 10, y + 20, x + 10, y + 20, { w: 1.6 }) +
    line(x - 4, y + 26, x + 4, y + 26, { w: 1.4 })
  );
}

// ══════════════════════════════════════════════════════════════
// (나) 출력특성곡선 — Early 전압 외삽
// ══════════════════════════════════════════════════════════════

const C_PAD_L = 96, C_PAD_R = 96, C_PAD_T = 34, C_PAD_B = 62;
const C_PLOT_W = 470, C_PLOT_H = 290;
const C_W = C_PLOT_W + C_PAD_L + C_PAD_R;
const C_H = C_PLOT_H + C_PAD_T + C_PAD_B;

/** x 정규화 도메인 — 음수쪽에 −V_A 절편이 들어간다. */
const VA_N = 0.30;          // −V_A 위치 (정규화)
const X_MIN = -(VA_N + 0.09);
const X_MAX = 1.0;
const Y_MAX = 1.06;
const KNEE = 0.13;          // 포화 ↔ 활성 경계
const I0 = 0.186;           // V_CE = 0 에서의 외삽 전류

/** 활성영역 직선 — \( I = I_0 (1 + V/V_A) \). \( V=-V_A \)에서 0이 되어 절편이 생긴다. */
const activeLine = (v: number) => I0 * (1 + v / VA_N);

export function renderBjtEarlyCurveSVG(d: BjtEarlyCurveDiagram): string {
  const xOf = (x: number) => C_PAD_L + ((x - X_MIN) / (X_MAX - X_MIN)) * C_PLOT_W;
  const yOf = (y: number) => C_PAD_T + C_PLOT_H - (y / Y_MAX) * C_PLOT_H;

  const x0 = xOf(0);           // 원점 (V_CE = 0)
  const y0 = yOf(0);
  const iKnee = activeLine(KNEE);

  const defs =
    `<defs>` +
    `<marker id="bec-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${AXIS}"/>` +
    `</marker>` +
    `<marker id="bec-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${STROKE}"/>` +
    `</marker>` +
    `</defs>`;

  // ── 곡선 ─────────────────────────────────────
  // 포화영역: 0 → knee 를 가파르게(tanh), 활성영역: 기울기가 살아 있는 직선.
  const pts: string[] = [];
  const N = 60;
  for (let i = 0; i <= N; i += 1) {
    const v = (i / N) * KNEE;
    const y = iKnee * Math.tanh(v / (KNEE * 0.40));
    pts.push(`${xOf(v).toFixed(2)},${yOf(y).toFixed(2)}`);
  }
  for (let i = 1; i <= N; i += 1) {
    const v = KNEE + (i / N) * (X_MAX - KNEE);
    pts.push(`${xOf(v).toFixed(2)},${yOf(activeLine(v)).toFixed(2)}`);
  }
  const curve = `<polyline points="${pts.join(" ")}" fill="none" stroke="${STROKE}" stroke-width="2"/>`;

  // ★ 왼쪽 연장 점선 — (−V_A, 0) 에서 활성영역 직선으로. 이 그림의 요점이다.
  const extrap =
    `<line x1="${xOf(-VA_N).toFixed(2)}" y1="${y0.toFixed(2)}" x2="${xOf(KNEE).toFixed(2)}" y2="${yOf(iKnee).toFixed(2)}"` +
    ` stroke="${DASH}" stroke-width="1.7" stroke-dasharray="7 5"/>`;

  // −V_A 절편 표시
  const intercept =
    dot(xOf(-VA_N), y0, 3.6, DASH) +
    text(xOf(-VA_N), y0 + 22, d.interceptLabel ?? "−V_A", { size: 13, weight: 700, fill: DASH });

  // ── 포화/활성 영역 구분 ────────────────────────
  const kneeX = xOf(KNEE);
  const regionDivider = line(kneeX, yOf(0), kneeX, C_PAD_T + 6, { w: 1.2, stroke: MUTED, dash: "5 4" });
  // ★ 영역 라벨은 곡선 **위쪽 빈 공간**에 둔다 — 곡선은 좌측이 낮아 이 띠가 비어 있다.
  //   예전에는 y를 더 내렸다가 아래의 ΔV_CE·r_o 주석과 부딪혔다(스모크의 라벨 겹침 검사가 잡음).
  const regionLabels =
    text((x0 + kneeX) / 2 - 4, C_PAD_T + 30, d.saturationLabel ?? "포화영역", { size: 11.5, weight: 600, fill: MUTED }) +
    text(kneeX + 60, C_PAD_T + 30, d.activeLabel ?? "활성영역", { size: 12.5, weight: 600, fill: MUTED });
  // 포화영역 라벨은 좁은 띠라 지시선을 붙인다(규칙 #6).
  // 지시선은 점선으로 — 실선이면 세로축과 혼동된다(시각검증).
  const satLeader = line((x0 + kneeX) / 2 - 4, C_PAD_T + 36, (x0 + kneeX) / 2, yOf(iKnee * 0.72), { w: 1, stroke: MUTED, dash: "3 3" });

  // ── Δ 삼각형 (기울기) ──────────────────────────
  const vA = 0.56, vB = 0.82;
  const yA = activeLine(vA), yB = activeLine(vB);
  const deltaMarks =
    line(xOf(vA), yOf(yA), xOf(vB), yOf(yA), { w: 1.2, stroke: MUTED, dash: "4 3" }) +
    line(xOf(vB), yOf(yA), xOf(vB), yOf(yB), { w: 1.2, stroke: MUTED, dash: "4 3" }) +
    text(xOf(vB) + 10, (yOf(yA) + yOf(yB)) / 2 + 4, "ΔI_C", { size: 11.5, weight: 600, fill: MUTED, anchor: "start" }) +
    text((xOf(vA) + xOf(vB)) / 2, yOf(yA) + 17, "ΔV_CE", { size: 11.5, weight: 600, fill: MUTED });

  // ── r_o 주석 (★ 정답이면 생성기가 빈칸 기호를 넣어 보낸다) ──
  // ★ 곡선 위쪽 빈 띠(영역 라벨 아래·Δ 삼각형 위)에 두고 곡선까지 지시선을 내린다.
  const roY = C_PAD_T + 74;
  const roNote = d.roNote
    ? text(xOf(0.44), roY, d.roNote, { size: 12.5, weight: 600, fill: DASH, anchor: "start" }) +
      line(xOf(0.44) - 6, roY - 4, xOf(0.40), yOf(activeLine(0.40)) - 6, { w: 1, stroke: DASH })
    : "";

  // 곡선 라벨 (V_BE) — 우측 끝
  const curveLabel = text(xOf(X_MAX) + 8, yOf(activeLine(X_MAX)) + 4, d.curveLabel ?? "V_BE", {
    size: 12.5, weight: 600, anchor: "start", italic: true,
  });

  // ── 축 ──────────────────────────────────────
  const axes =
    `<line x1="${xOf(X_MIN)}" y1="${y0}" x2="${xOf(X_MAX) + 22}" y2="${y0}" stroke="${AXIS}" stroke-width="1.5" marker-end="url(#bec-arrow)"/>` +
    `<line x1="${x0}" y1="${y0 + 10}" x2="${x0}" y2="${C_PAD_T - 10}" stroke="${AXIS}" stroke-width="1.5" marker-end="url(#bec-arrow)"/>` +
    text(xOf(X_MAX) + 30, y0 + 5, d.xLabel ?? "V_CE", { size: 13, weight: 700, fill: AXIS, anchor: "start" }) +
    text(x0 - 10, C_PAD_T - 14, d.yLabel ?? "I_C", { size: 13, weight: 700, fill: AXIS, anchor: "end" }) +
    text(x0 - 8, y0 + 16, "0", { size: 11, fill: AXIS, anchor: "end" });

  const caption = d.caption ? text(C_W / 2, C_H - 10, d.caption, { size: 12, fill: MUTED }) : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${C_H}" viewBox="0 0 ${C_W} ${C_H}">
${defs}
${regionDivider}
${extrap}
${curve}
${intercept}
${regionLabels}
${satLeader}
${deltaMarks}
${roNote}
${curveLabel}
${axes}
${caption}
</svg>`;
}
