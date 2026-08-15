import type { JfetDepletionPanelsDiagram } from "@/types";

/**
 * 임용 28번 — **n채널 JFET의 V_DS별 공핍층 변화** 4패널 도식 전용 렌더러.
 *
 * 원본 배치: (가)~(라) 네 개의 세로 단면. 각 패널마다
 *   위 D(드레인, I_D 화살표) · 아래 S(소스) · 왼쪽 G(게이트, p⁺) · 오른쪽 V_DS 전원
 *   채널 양옆의 p⁺ 게이트에서 자란 **공핍층**이 드레인 쪽으로 갈수록 두꺼워진다(쐐기 모양).
 *
 * ★ 공핍층 두께는 V_DS/V_P 비율로 그린다 — 핀치오프(V_DS = V_P)에서 드레인 쪽이 맞닿고,
 *   그 이후(포화)에는 맞닿은 구간이 아래로 길어진다. 개념도이므로 정확한 물리 곡선은 아니다.
 */

const STROKE = "#111827";
const MUTED = "#6b7280";
const FONT = `'Noto Sans CJK KR','Malgun Gothic',sans-serif`;
const GATE_FILL = "#4b5563";     // p⁺ 게이트
const CH_FILL = "#e5e7eb";       // n 채널
const DEP_FILL = "#f9fafb";      // 공핍층

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function text(x: number, y: number, s: string, o: { size?: number; weight?: number; fill?: string; anchor?: string } = {}) {
  return `<text x="${x}" y="${y}" text-anchor="${o.anchor ?? "middle"}" font-size="${o.size ?? 11}"` +
    ` font-weight="${o.weight ?? 400}" fill="${o.fill ?? STROKE}" font-family="${FONT}">${esc(s)}</text>`;
}
function line(x1: number, y1: number, x2: number, y2: number, w = 1.5) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${w}" stroke-linecap="round"/>`;
}

const PANEL_W = 240, PANEL_H = 272;   // 행 라벨 "(가)"와 다음 행 D 단자가 붙지 않도록 여유
const COLS = 2;

/** 한 패널 — 좌상단 (ox, oy) 기준. */
function panel(ox: number, oy: number, label: string, vds: number, vp: number, vgs: number): string {
  const chX = ox + 78, chW = 44;          // 채널 가로 범위
  const chTop = oy + 40, chBot = oy + 190;
  const chH = chBot - chTop;
  let svg = "";

  // 채널(n)
  svg += `<rect x="${chX}" y="${chTop}" width="${chW}" height="${chH}" fill="${CH_FILL}" stroke="${STROKE}" stroke-width="1.4"/>`;

  // ── 공핍층 — 드레인(위)으로 갈수록 두꺼워지는 쐐기 ──
  //   위쪽 역바이어스 = V_DS − V_GS, 아래쪽 = −V_GS. 두께 ∝ √(역바이어스)로 두면 모양이 자연스럽다.
  //   ★ 두께는 **위치마다** 계산한다 — 소스↔드레인을 선형 보간하면 포화(V_DS > V_P)에서
  //     맞닿는 구간이 자라지 않아 (다)와 (라)가 똑같이 그려진다(시각검증에서 발견).
  //     위치 t의 역바이어스는 V(t) − V_GS = V_DS·t − V_GS 이므로 t_p = (V_P + V_GS)/V_DS 부터 맞닿는다.
  const half = chW / 2;
  const wOf = (rev: number) => Math.min(half, half * Math.sqrt(Math.max(0, rev) / Math.max(0.001, vp)));
  const N = 40;
  const ptsL: string[] = [], ptsR: string[] = [];
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;                                  // 0 = 소스(아래), 1 = 드레인(위)
    const y = chBot - t * chH;
    const w = wOf(vds * t - vgs);
    ptsL.push(`${(chX + w).toFixed(1)},${y.toFixed(1)}`);
    ptsR.push(`${(chX + chW - w).toFixed(1)},${y.toFixed(1)}`);
  }
  svg += `<polygon points="${chX},${chBot} ${ptsL.join(" ")} ${chX},${chTop}" fill="${DEP_FILL}" stroke="${MUTED}" stroke-width="1"/>`;
  svg += `<polygon points="${chX + chW},${chBot} ${ptsR.join(" ")} ${chX + chW},${chTop}" fill="${DEP_FILL}" stroke="${MUTED}" stroke-width="1"/>`;

  // p⁺ 게이트 (양옆)
  const gW = 13;
  for (const gx of [chX - gW, chX + chW]) {
    svg += `<rect x="${gx}" y="${chTop + 34}" width="${gW}" height="${chH - 68}" fill="${GATE_FILL}" stroke="${STROKE}" stroke-width="1.2"/>`;
  }
  svg += text(chX - gW + 6.5, chTop + 34 + (chH - 68) / 2 + 4, "p", { size: 10, fill: "#ffffff", weight: 700 });
  svg += text(chX + chW / 2, chTop + 22, "n", { size: 11, weight: 600 });

  // 핀치오프 표시 — 채널이 처음 맞닿는 지점(t_p)에 점선 원을 둔다.
  //   포화가 깊어질수록 t_p가 소스 쪽으로 내려가므로 원도 함께 내려가 (다)↔(라)가 구분된다.
  if (vds - vgs >= vp - 1e-9) {
    const tp = Math.min(1, (vp + vgs) / Math.max(0.001, vds));
    const yp = chBot - tp * chH;
    svg += `<circle cx="${chX + chW / 2}" cy="${yp.toFixed(1)}" r="13" fill="none" stroke="${STROKE}" stroke-width="1.3" stroke-dasharray="3 3"/>`;
    //   ★ 라벨은 **패널 우상단 고정 위치**에 두고 점선 지시선으로 원을 가리킨다.
    //     원 옆에 붙이면 t_p가 V_DS에 따라 오르내리므로 어떤 패널에서는 게이트 사각형이나
    //     V_DS 전원 기호 위에 글자가 얹힌다(시각검증에서 두 번 발견). 고정 위치면 그 충돌이 없다.
    const lx = chX + chW + gW + 6, ly = oy + 34;
    svg += `<path d="M ${(chX + chW / 2 + 13).toFixed(1)} ${yp.toFixed(1)} L ${lx - 6} ${yp.toFixed(1)} L ${lx - 6} ${ly - 4}" ` +
      `fill="none" stroke="${MUTED}" stroke-width="0.9" stroke-dasharray="2 2"/>`;
    svg += text(lx, ly, "핀치오프", { size: 9.5, anchor: "start", fill: MUTED });
  }

  // D / S 단자 + I_D 화살표
  svg += line(chX + chW / 2, chTop, chX + chW / 2, oy + 16);
  svg += text(chX + chW / 2, oy + 10, "D", { size: 11, weight: 700 });
  svg += line(chX + chW / 2, chBot, chX + chW / 2, oy + 216);
  svg += text(chX + chW / 2, oy + 230, "S", { size: 11, weight: 700 });
  svg += line(ox + 52, oy + 30, ox + 52, oy + 62);
  svg += `<path d="M ${ox + 52} ${oy + 26} l -3.5 7 l 7 0 z" fill="${STROKE}"/>`;
  svg += text(ox + 44, oy + 50, "I_D", { size: 10, anchor: "end", weight: 600 });

  // G 단자 + V_GS
  svg += line(chX - gW, chTop + 34 + (chH - 68) / 2, ox + 26, chTop + 34 + (chH - 68) / 2);
  svg += text(ox + 22, chTop + 34 + (chH - 68) / 2 + 4, "G", { size: 11, weight: 700, anchor: "end" });
  svg += text(ox + 30, chBot - 6, `V_GS=${vgs}`, { size: 10, weight: 600, anchor: "start", fill: MUTED });

  // V_DS 전원 (우측)
  const sx = chX + chW + 62;   // 전원 열 — 핀치오프 라벨과 간격 확보
  svg += line(chX + chW / 2, oy + 16, sx, oy + 16);
  svg += line(sx, oy + 16, sx, chTop + 60);
  svg += text(sx + 6, chTop + 56, "+", { size: 11, anchor: "start" });
  svg += line(sx - 11, chTop + 66, sx + 11, chTop + 66, 2);
  svg += line(sx - 6, chTop + 74, sx + 6, chTop + 74, 1.4);
  svg += text(sx + 6, chTop + 86, "−", { size: 11, anchor: "start" });
  svg += line(sx, chTop + 74, sx, oy + 216);
  svg += line(sx, oy + 216, chX + chW / 2, oy + 216);
  svg += text(sx + 16, chTop + 68, `V_DS=${vds}V`, { size: 10.5, weight: 700, anchor: "start" });

  svg += text(ox + PANEL_W / 2, oy + PANEL_H - 4, label, { size: 12, weight: 700 });
  return svg;
}

export function renderJfetDepletionPanels(d: JfetDepletionPanelsDiagram): string {
  const labels = ["(가)", "(나)", "(다)", "(라)"];
  const rows = Math.ceil(d.vdsList.length / COLS);
  const W = PANEL_W * COLS + 40, H = PANEL_H * rows + 24;
  let svg = "";
  d.vdsList.forEach((vds, i) => {
    const ox = 20 + (i % COLS) * PANEL_W;
    const oy = 12 + Math.floor(i / COLS) * PANEL_H;
    svg += panel(ox, oy, labels[i] ?? `(${i + 1})`, vds, d.pinchOff, d.vgs ?? 0);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}">
${svg}
</svg>`;
}
