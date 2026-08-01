import type { CharacteristicCurveDiagram } from "@/types";

/**
 * BJT/MOSFET 출력특성곡선 SVG renderer.
 *
 * 입력: CharacteristicCurveDiagram — device("bjt"|"mosfet"), curves[i] = {label, plateau, knee?},
 *      regions[i] = {marker, region("saturation"|"active"|"cutoff"|"triode")}.
 *
 * 좌표계:
 *   - x축: 0 → xMax (V_CE 또는 V_DS). 우측 끝에 breakdown 표시(가파른 상승) 옵션은 추후.
 *   - y축: 0 → yMax (I_C 또는 I_D). plateau는 0~1 정규화 값으로 yMax 대비.
 *   - 각 곡선: (0,0) → knee 부근에서 가파른 상승 → plateau 부근에서 평탄.
 *     Smooth approximation: I(V) = plateau · tanh(V / knee).
 *
 * 영역 음영:
 *   - "saturation"(BJT) / "triode"(MOSFET): V < knee (가파른 ohmic 영역, 좌측 좁은 띠)
 *   - "active"(BJT) / "saturation"(MOSFET): V ≥ knee (평탄 영역, 우측 넓은 영역)
 *   - "cutoff": 최저 곡선(I_B=0 또는 V_GS<V_TH) 아래쪽 (x축 위 좁은 띠)
 *
 * marker 라벨: 영역 음영 중앙에 동심원 안에 ㉠/㉡ 표기.
 */
const PAD_L = 60;
// ★ 곡선 라벨은 우측 끝 바깥에 찍힌다 — "V_GS = +8 [V]" 같은 수치 라벨이 잘리지 않도록 넉넉히.
//   (예전 30px에서는 "V_GS ="까지만 보였다, 시각검증에서 발견.)
const PAD_R = 118;
const PAD_T = 24;
const PAD_B = 50;
const PLOT_W = 520;
const PLOT_H = 320;
const SVG_W = PLOT_W + PAD_L + PAD_R;
const SVG_H = PLOT_H + PAD_T + PAD_B;

const X_MAX = 1.0; // 정규화 좌표 — 곡선 plateau·knee 모두 0~1 비율
const Y_MAX = 1.05; // 살짝 여유 (가장 위 곡선이 천장에 닿지 않도록)

const CURVE_STROKE = "#111827";
const AXIS_STROKE = "#374151";
const SATURATION_FILL = "#fde68a"; // 좌측 띠 음영 (포화/triode) — 황색 계열
const CUTOFF_FILL = "#bfdbfe"; // 아래쪽 띠 음영 (차단) — 청색 계열
const ACTIVE_FILL = "#d1fae5"; // 평탄 영역 음영 (활성/MOSFET saturation) — 연녹색 (선택 영역만 표시)
const REGION_LABEL_BG = "#ffffff";
const LOCUS_STROKE = "#1e3a8a"; // 포화 시작점(핀치오프) 궤적 — 점선

export function renderCharacteristicCurveSVG(d: CharacteristicCurveDiagram): string {
  const device = d.device;
  const xLabel = d.xLabel ?? (device === "bjt" ? "V_CE" : "V_DS");
  const yLabel = d.yLabel ?? (device === "bjt" ? "I_C" : "I_D");

  const curves = Array.isArray(d.curves) ? d.curves : [];
  if (curves.length === 0) return emptySvg("곡선 없음");

  const regions = Array.isArray(d.regions) ? d.regions : [];

  // ── 좌표 변환 ─────────────────────────────────
  const xOf = (x: number) => PAD_L + (x / X_MAX) * PLOT_W;
  const yOf = (y: number) => PAD_T + PLOT_H - (y / Y_MAX) * PLOT_H;

  // 곡선 — tanh 기반 부드러운 ohmic→plateau 전환
  const curvePaths = curves
    .map((c) => {
      const plateau = clamp(c.plateau, 0, 1);
      const knee = clamp(c.knee ?? 0.1, 0.02, 0.5);
      const pts: string[] = [];
      const N = 80;
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * X_MAX;
        const y = plateau * Math.tanh(x / knee);
        pts.push(`${xOf(x).toFixed(2)},${yOf(y).toFixed(2)}`);
      }
      return `<polyline points="${pts.join(" ")}" fill="none" stroke="${CURVE_STROKE}" stroke-width="1.8"/>`;
    })
    .join("");

  // 곡선 라벨 — 우측 끝(plateau)에 표기
  const curveLabels = curves
    .map((c) => {
      const plateau = clamp(c.plateau, 0, 1);
      const lx = xOf(X_MAX) + 4;
      // ★ plateau=0(차단 trace)은 x축 위에 겹친다 — 축 라벨과 부딪히지 않게 축 **위쪽**에 찍는다.
      const ly = plateau <= 0.001 ? yOf(0) - 7 : yOf(plateau) + 4;
      return `<text x="${lx}" y="${ly}" font-size="11" fill="${CURVE_STROKE}" font-style="italic">${escapeSvg(c.label)}</text>`;
    })
    .join("");

  // ── 영역 음영 ─────────────────────────────────
  // 최고 plateau (saturation/active 영역 음영의 위 경계로 사용)
  const maxPlateau = curves.reduce((m, c) => Math.max(m, clamp(c.plateau, 0, 1)), 0);
  const minPlateau = curves.reduce((m, c) => Math.min(m, clamp(c.plateau, 0, 1)), 1);
  // representative knee — 곡선들 평균 knee 부근에 saturation/triode 띠 경계
  const repKnee = curves.reduce((s, c) => s + clamp(c.knee ?? 0.1, 0.02, 0.5), 0) / curves.length;

  const regionShapes: string[] = [];
  const regionLabels: string[] = [];

  for (const r of regions) {
    const shaded = regionShape(r.region, device, repKnee, maxPlateau, minPlateau, xOf, yOf);
    if (shaded) {
      regionShapes.push(
        `<polygon points="${shaded.points}" fill="${shaded.fill}" fill-opacity="0.55" stroke="none"/>`,
      );
      regionLabels.push(markerLabel(r.marker, shaded.labelX, shaded.labelY));
    }
  }

  // ── ★ 포화 시작점(핀치오프) 궤적 — 각 곡선의 knee 지점을 잇는 점선 ──────────
  //   임용 6번(해석 절차형)의 정의적 요소: V_DS = V_GS − V_T 경계선.
  const locusParts: string[] = [];
  const locus = d.pinchOffLocus;
  if (locus) {
    // 각 곡선에서 "plateau의 95%에 도달하는 x" = 포화 시작점.
    const pts = curves
      .map((c) => {
        const plateau = clamp(c.plateau, 0, 1);
        if (plateau <= 0) return null;
        const knee = clamp(c.knee ?? 0.1, 0.02, 0.5);
        // plateau·tanh(x/knee) = 0.95·plateau → x = knee·atanh(0.95)
        const x = Math.min(knee * Math.atanh(0.95), X_MAX);
        return { x, y: plateau * 0.95 };
      })
      .filter((p): p is { x: number; y: number } => p !== null)
      .sort((a, b) => a.y - b.y);   // 아래(작은 plateau) → 위
    if (pts.length >= 2) {
      const poly = [{ x: 0, y: 0 }, ...pts]
        .map((p) => `${xOf(p.x).toFixed(2)},${yOf(p.y).toFixed(2)}`)
        .join(" ");
      locusParts.push(
        `<polyline points="${poly}" fill="none" stroke="${LOCUS_STROKE}" stroke-width="1.6" stroke-dasharray="6 4"/>`,
      );
      if (locus.note) {
        const top = pts[pts.length - 1];
        locusParts.push(
          `<text x="${(xOf(top.x) + 10).toFixed(1)}" y="${(yOf(top.y) - 10).toFixed(1)}" font-size="11.5" font-weight="600" fill="${LOCUS_STROKE}">${escapeSvg(locus.note)}</text>`,
        );
      }
      if (locus.marker) {
        // 궤적 위 단일 marker — 아래에서 위로 t 비율 지점 (기본 위쪽)
        const t = clamp(locus.markerAt ?? 0.82, 0, 1);
        const fi = t * (pts.length - 1);
        const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, pts.length - 1), fr = fi - i0;
        const mx = pts[i0].x + (pts[i1].x - pts[i0].x) * fr;
        const my = pts[i0].y + (pts[i1].y - pts[i0].y) * fr;
        // 궤적 왼쪽 **위**로 충분히 띄우고 지시선 연결 — 궤적 top 부근은 최상단 곡선이
        // 이미 plateau라 그 위가 비어 있다. 덜 띄우면 곡선과 겹친다(시각검증).
        const cx = xOf(mx) - 30, cy = Math.max(yOf(my) - 44, PAD_T + 6);
        locusParts.push(
          `<line x1="${(cx + 11).toFixed(1)}" y1="${(cy + 9).toFixed(1)}" x2="${xOf(mx).toFixed(1)}" y2="${yOf(my).toFixed(1)}" stroke="${LOCUS_STROKE}" stroke-width="1.1"/>`,
        );
        regionLabels.push(markerLabel(locus.marker, cx, cy));
      }
    }
  }

  // ── 축 ────────────────────────────────────────
  const axes =
    `<line x1="${PAD_L}" y1="${yOf(0)}" x2="${xOf(X_MAX) + 18}" y2="${yOf(0)}" stroke="${AXIS_STROKE}" stroke-width="1.5" marker-end="url(#cc-arrow)"/>` +
    `<line x1="${PAD_L}" y1="${yOf(0)}" x2="${PAD_L}" y2="${PAD_T - 8}" stroke="${AXIS_STROKE}" stroke-width="1.5" marker-end="url(#cc-arrow)"/>` +
    `<text x="${xOf(X_MAX) + 22}" y="${yOf(0) + 5}" font-size="13" font-weight="600" fill="${AXIS_STROKE}">${escapeSvg(xLabel)}</text>` +
    `<text x="${PAD_L - 8}" y="${PAD_T - 12}" text-anchor="end" font-size="13" font-weight="600" fill="${AXIS_STROKE}">${escapeSvg(yLabel)}</text>` +
    `<text x="${PAD_L - 6}" y="${yOf(0) + 14}" text-anchor="end" font-size="11" fill="${AXIS_STROKE}">0</text>`;

  // 화살표 marker (축 끝)
  const defs =
    `<defs>` +
    `<marker id="cc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">` +
    `<path d="M0,0 L10,5 L0,10 z" fill="${AXIS_STROKE}"/>` +
    `</marker>` +
    `</defs>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">
${defs}
${regionShapes.join("\n")}
${curvePaths}
${curveLabels}
${axes}
${locusParts.join("\n")}
${regionLabels.join("\n")}
</svg>`;
}

type Shaded = {
  points: string;
  fill: string;
  labelX: number;
  labelY: number;
};

function regionShape(
  region: "saturation" | "active" | "cutoff" | "triode",
  device: "bjt" | "mosfet",
  repKnee: number,
  maxPlateau: number,
  minPlateau: number,
  xOf: (x: number) => number,
  yOf: (y: number) => number,
): Shaded | null {
  // ★★ device별 의미가 정반대다 (실측 버그):
  //   BJT  — saturation = **좌측 ohmic 띠**, active = 우측 평탄 영역
  //   MOSFET — triode(선형) = **좌측 ohmic 띠**, saturation = **우측 평탄 영역**
  //   예전엔 saturation|triode를 device 무관하게 좌측 띠로 그려서, MOSFET 짝
  //   {triode, saturation}이 **완전히 같은 사각형 2개**로 겹쳐 그려졌다
  //   → ㉡이 ㉠ 위에 덧칠돼 ㉠이 사라지는 사용자 신고로 드러남.
  const onLeftBand = device === "mosfet" ? region === "triode" : region === "saturation";
  const onPlateau = device === "mosfet" ? region === "saturation" : region === "active";
  if (onLeftBand) {
    // 좌측 ohmic 띠 — x ∈ [0, repKnee], y ∈ [0, maxPlateau·1.05]
    const x0 = 0;
    const x1 = repKnee;
    const yTop = Math.min(maxPlateau * 1.05, Y_MAX);
    const yBot = 0;
    return {
      points:
        `${xOf(x0)},${yOf(yBot)} ${xOf(x1)},${yOf(yBot)} ${xOf(x1)},${yOf(yTop)} ${xOf(x0)},${yOf(yTop)}`,
      fill: SATURATION_FILL,
      labelX: xOf((x0 + x1) / 2) - 6,
      labelY: yOf(yTop) - 12,
    };
  }
  if (region === "cutoff") {
    // 차단 — I_B=0 곡선 아래쪽 좁은 띠 (x ∈ [repKnee, X_MAX], y ∈ [0, minPlateau·0.5])
    const x0 = repKnee;
    const x1 = X_MAX;
    const yBot = 0;
    const yTop = Math.max(minPlateau * 0.5, 0.05);
    return {
      points:
        `${xOf(x0)},${yOf(yBot)} ${xOf(x1)},${yOf(yBot)} ${xOf(x1)},${yOf(yTop)} ${xOf(x0)},${yOf(yTop)}`,
      fill: CUTOFF_FILL,
      labelX: xOf((x0 + x1) / 2),
      labelY: yOf(yTop) + 22,
    };
  }
  if (onPlateau) {
    // 활성(BJT)/포화(MOSFET) — plateau 영역 (x ∈ [repKnee, X_MAX], y ∈ [minPlateau, maxPlateau])
    const x0 = repKnee;
    const x1 = X_MAX;
    const yBot = Math.max(minPlateau * 0.5, 0.05);
    const yTop = Math.min(maxPlateau * 1.05, Y_MAX);
    return {
      points:
        `${xOf(x0)},${yOf(yBot)} ${xOf(x1)},${yOf(yBot)} ${xOf(x1)},${yOf(yTop)} ${xOf(x0)},${yOf(yTop)}`,
      fill: ACTIVE_FILL,
      labelX: xOf((x0 + x1) / 2),
      labelY: yOf((yBot + yTop) / 2),
    };
  }
  return null;
}

function markerLabel(marker: string, x: number, y: number): string {
  // 흰 배경 원 + 한국어 marker (㉠/㉡/㉢)
  return (
    `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="${REGION_LABEL_BG}" stroke="#1e3a8a" stroke-width="1.2"/>` +
    `<text x="${x.toFixed(1)}" y="${(y + 5).toFixed(1)}" text-anchor="middle" font-size="14" font-weight="700" fill="#1e3a8a">${escapeSvg(marker)}</text>`
  );
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function escapeSvg(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function emptySvg(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_W} 64"><text x="${SVG_W / 2}" y="38" text-anchor="middle" font-size="13" fill="#92400e">${escapeSvg(msg)}</text></svg>`;
}
