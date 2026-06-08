/**
 * 테브난 V-I 직선 그래프 전용 렌더러 (임용 9번 (나) 그래프).
 *   V_RL = V_th − R_th·I_RL : (0, V_th) → (I_sc, 0) 직선.
 *   세로로 길고 가로로 좁은 plot → 기울기가 가파르게 보이고 절편이 명확.
 */

export type ViLineGraphDiagram = {
  Vth: number;            // y 절편 (V)
  Isc: number;            // x 절편 (A)
  vUnit?: string;         // 기본 "V"
  iUnit?: string;         // 기본 "A"
  vSymbol?: string;       // 기본 "V_RL"
  iSymbol?: string;       // 기본 "I_RL"
};

const KOREAN_FONT = `'Noto Sans CJK KR','Malgun Gothic',sans-serif`;

export function renderViLineGraph(d: ViLineGraphDiagram): string {
  const vUnit = d.vUnit ?? "V";
  const iUnit = d.iUnit ?? "A";
  const vSym = d.vSymbol ?? "V_RL";
  const iSym = d.iSymbol ?? "I_RL";

  // ★ 세로 길고 가로 좁게 — plotH > plotW 라 직선이 가파르게.
  const PAD_L = 64, PAD_R = 76, PAD_T = 34, PAD_B = 50;
  const PLOT_W = 200;   // x축 (좁게)
  const PLOT_H = 300;   // y축 (길게)
  const W = PAD_L + PLOT_W + PAD_R;
  const H = PAD_T + PLOT_H + PAD_B;

  const x0 = PAD_L, yBottom = PAD_T + PLOT_H, yTop = PAD_T;
  const xRight = PAD_L + PLOT_W;
  // 좌표: I=0 → x0, I=Isc → xRight ; V=0 → yBottom, V=Vth → yTop
  const fmt = (x: number) => (Number.isInteger(x) ? String(x) : String(Math.round(x * 1000) / 1000));

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${KOREAN_FONT}">`;

  // 옅은 그리드 (5등분)
  for (let k = 1; k <= 4; k++) {
    const gx = x0 + (PLOT_W * k) / 5;
    const gy = yBottom - (PLOT_H * k) / 5;
    svg += `<line x1="${gx}" y1="${yTop}" x2="${gx}" y2="${yBottom}" stroke="#eef2f7" stroke-width="1"/>`;
    svg += `<line x1="${x0}" y1="${gy}" x2="${xRight}" y2="${gy}" stroke="#eef2f7" stroke-width="1"/>`;
  }

  // 축
  svg += `<line x1="${x0}" y1="${yTop}" x2="${x0}" y2="${yBottom}" stroke="#374151" stroke-width="1.6"/>`;       // y축
  svg += `<line x1="${x0}" y1="${yBottom}" x2="${xRight}" y2="${yBottom}" stroke="#374151" stroke-width="1.6"/>`; // x축
  // 화살촉
  svg += `<path d="M ${x0} ${yTop} l -4 8 l 8 0 z" fill="#374151"/>`;
  svg += `<path d="M ${xRight} ${yBottom} l -8 -4 l 0 8 z" fill="#374151"/>`;

  // V_th 절편 점선 + 틱 + 라벨 (y축 왼쪽)
  svg += `<line x1="${x0}" y1="${yTop}" x2="${xRight}" y2="${yTop}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 3"/>`;
  svg += `<line x1="${x0 - 4}" y1="${yTop}" x2="${x0 + 4}" y2="${yTop}" stroke="#374151" stroke-width="1.6"/>`;
  svg += `<text x="${x0 - 10}" y="${yTop + 4}" text-anchor="end" font-size="12" font-weight="700" fill="#dc2626">V_th=${fmt(d.Vth)}${vUnit}</text>`;

  // I_sc 절편 점선 + 틱 + 라벨 (x축 아래)
  svg += `<line x1="${xRight}" y1="${yBottom}" x2="${xRight}" y2="${yTop}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="4 3"/>`;
  svg += `<line x1="${xRight}" y1="${yBottom - 4}" x2="${xRight}" y2="${yBottom + 4}" stroke="#374151" stroke-width="1.6"/>`;
  svg += `<text x="${xRight}" y="${yBottom + 18}" text-anchor="middle" font-size="12" font-weight="700" fill="#dc2626">I_sc=${fmt(d.Isc)}${iUnit}</text>`;

  // 원점 0
  svg += `<text x="${x0 - 8}" y="${yBottom + 4}" text-anchor="end" font-size="11" fill="#6b7280">0</text>`;

  // 테브난 직선 (0,V_th) → (I_sc,0)
  svg += `<line x1="${x0}" y1="${yTop}" x2="${xRight}" y2="${yBottom}" stroke="#111827" stroke-width="2.4"/>`;

  // 축 제목 (겹침 회피: y제목은 y축 위, x제목은 x축 아래 우측 더 아래로)
  svg += `<text x="${x0 - 6}" y="${yTop - 14}" text-anchor="middle" font-size="12" fill="#1e3a8a" font-weight="600">${vSym}[${vUnit}]</text>`;
  svg += `<text x="${xRight + 8}" y="${yBottom + 4}" text-anchor="start" font-size="12" fill="#1e3a8a" font-weight="600">${iSym}[${iUnit}]</text>`;

  svg += `</svg>`;
  return svg;
}
