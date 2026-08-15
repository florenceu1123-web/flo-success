import type { FigureVariant } from "@/types";
import { DiagramMissing, PlaceholderFigure } from "./_placeholder";
import { FigureHeader } from "./_placeholder";

type Sample = { t: number; v: number };

/**
 * shape — 신호 모양에 따라 sample 사이를 다르게 보간/생성:
 *  - "linear" (default): sample 사이 직선
 *  - "step" / "square":   zero-order hold (각 sample 값을 다음 sample 직전까지 유지) — 사각파/계단함수
 *  - "exponential_rise":  v(t) = v_next − (v_next−v_cur)·exp(−(t−t_cur)/τ)  — RC 충전 응답
 *  - "exponential_decay": v(t) = v_next + (v_cur−v_next)·exp(−(t−t_cur)/τ)  — RC 방전 응답
 *
 *  τ(시간상수) 없으면 sample 간격의 1/3로 자동 추정.
 */
type WaveformShape =
  | "linear"
  | "step"
  | "square"
  | "exponential_rise"
  | "exponential_decay";

type Signal = {
  name: string;
  samples: Sample[];
  shape?: WaveformShape;
  /** 시간상수 τ (exponential_* shape에서 사용) */
  tau?: number;
  /** true이면 lane(이름+0/1 축)은 그리되 신호 polyline은 생략 — 학생이 채울 빈칸 트랙 */
  blank?: boolean;
  /** blank=true에서 lane v 범위 명시 (samples 없이도 0/1 라벨 표시) */
  vRange?: { min: number; max: number };
};

type Marker = { t: number; label: string };

type WaveformDiagram = {
  signals: Signal[];
  unit?: { time?: string; value?: string };
  /** 시간축(또는 일반 x축) 기준점 — 세로 점선 + 라벨 (예: t₁, t₂, t₃, t₄, f_0). */
  markers?: Marker[];
  /** x축 표기 customize — 미지정 시 symbol="t", unit은 unit.time 사용. */
  xAxis?: { symbol?: string; unit?: string };
  /** y축에 수평 점선 + 라벨 (예: I_max). 가장 첫 lane 기준 v좌표로 위치. */
  yMarkers?: Array<{ v: number; label: string }>;
  /** 시간축 구간 표시 — 축 아래 span bar + 라벨(㉠·㉡·㉢). 미지정이면 그리지 않는다. */
  regions?: Array<{ from: number; to: number; label: string }>;
};

// 멀티 트랙(레인) 레이아웃 — 각 신호를 별도 lane으로 위·아래로 stack.
const PAD_L = 70;   // 좌측 신호명 라벨 영역
const PAD_R = 30;
const PAD_T = 24;
const PAD_B = 50;
const PLOT_W = 640;
const LANE_H = 50;        // 각 신호 lane 높이
const LANE_GAP = 14;      // lane 간 간격
const STROKE = "#111827"; // 모든 신호 동일 색 (검정 계열)

export function renderWaveform(figure: FigureVariant) {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;

  const d = figure.diagram as WaveformDiagram;
  // blank 신호는 samples 없이도 lane 유지. 그 외는 sample이 있어야 표시.
  const signals = Array.isArray(d?.signals)
    ? d.signals.filter((s) =>
        s?.blank ? true : Array.isArray(s?.samples) && s.samples.length > 0,
      )
    : [];
  if (signals.length === 0) return <PlaceholderFigure figure={figure} />;

  // 시간 축 범위 — 채워진(non-blank) 신호의 sample에서만 계산
  let tMin = Number.POSITIVE_INFINITY, tMax = Number.NEGATIVE_INFINITY;
  for (const sig of signals) {
    if (sig.blank) continue;
    for (const s of sig.samples) {
      if (typeof s?.t === "number" && Number.isFinite(s.t)) {
        if (s.t < tMin) tMin = s.t;
        if (s.t > tMax) tMax = s.t;
      }
    }
  }
  if (!Number.isFinite(tMin)) return <PlaceholderFigure figure={figure} />;
  if (tMax <= tMin) tMax = tMin + 1;

  const xSymbol = d.xAxis?.symbol ?? "t";
  const xUnit = d.xAxis?.unit ?? d.unit?.time ?? "";
  const tUnit = xUnit;
  const tRange = tMax - tMin;
  // ★ 연속 곡선 그래프(주파수응답 등)는 lane을 크게 (2026-07-27).
  //   디지털 타이밍용 LANE_H=50은 곡선 한 개짜리 그래프엔 너무 납작해 수치·라벨이 겹쳐 안 보였다
  //   (실측 신고: "그래프 수치가 잘 안보여"). 신호가 1개이고 디지털(step/square)·blank가 아니면
  //   높이를 3배 이상으로 키우고 가로도 넓힌다.
  const isCurveGraph =
    signals.length === 1 &&
    !signals[0]?.blank &&
    signals[0]?.shape !== "step" &&
    signals[0]?.shape !== "square";
  const laneH = isCurveGraph ? 190 : LANE_H;
  const plotW = isCurveGraph ? 760 : PLOT_W;

  const xOf = (t: number) => PAD_L + ((t - tMin) / tRange) * plotW;

  // 각 신호의 lane 영역 (lane top/bottom y) 결정. lane은 위에서부터 stack.
  const lanes = signals.map((sig, i) => {
    const top = PAD_T + i * (laneH + LANE_GAP);
    const bottom = top + laneH;
    // 신호의 v range — 디지털(0/1)이거나 정해진 범위. 자동 계산.
    let vMin = Number.POSITIVE_INFINITY, vMax = Number.NEGATIVE_INFINITY;
    if (sig.blank && sig.vRange) {
      vMin = sig.vRange.min;
      vMax = sig.vRange.max;
    } else {
      for (const s of sig.samples ?? []) {
        if (typeof s.v === "number" && Number.isFinite(s.v)) {
          if (s.v < vMin) vMin = s.v;
          if (s.v > vMax) vMax = s.v;
        }
      }
    }
    if (!Number.isFinite(vMin)) { vMin = 0; vMax = 1; }
    if (vMax - vMin < 1e-9) { vMax = vMin + 1; }
    // lane 안쪽 padding (위·아래 6px 여유) — 디지털 신호가 lane 천장에 닿지 않게
    const innerTop = top + 6;
    const innerBottom = bottom - 6;
    const yOf = (v: number) =>
      innerBottom - ((v - vMin) / (vMax - vMin)) * (innerBottom - innerTop);
    return { sig, top, bottom, innerTop, innerBottom, vMin, vMax, yOf };
  });

  const totalLanesH = signals.length * laneH + (signals.length - 1) * LANE_GAP;
  const plotTop = PAD_T;
  const plotBottom = plotTop + totalLanesH;
  const SVG_W = plotW + PAD_L + PAD_R;
  // 구간 표시(㉠·㉡·㉢)가 있으면 축 아래에 span bar 한 줄이 더 붙는다.
  const regionSpans = Array.isArray(d.regions) ? d.regions : [];
  // 마커 라벨이 축 아래 +30·+45에 놓이므로 구간 bar는 그보다 확실히 아래에 둔다(겹침 방지).
  const REGION_BAR_H = regionSpans.length ? 56 : 0;
  const SVG_H = plotBottom + PAD_B + REGION_BAR_H;

  // 시간축 grid (전체 lane 영역을 가로지르는 vertical lines)
  const tTicks = niceTicks(tMin, tMax, 6);
  const gridLines = tTicks
    .map((t) => `<line x1="${xOf(t)}" y1="${plotTop}" x2="${xOf(t)}" y2="${plotBottom}" stroke="#e5e7eb" stroke-width="1"/>`)
    .join("");

  // 각 lane의 baseline (0-level)과 박스 — lane 분리 시각화
  const laneFrames = lanes
    .map((L) => {
      const yZero = L.yOf(L.vMin); // lane 하단 (0)
      const yOne = L.yOf(L.vMax);  // lane 상단 (1 또는 max)
      return `<line x1="${PAD_L}" y1="${yZero}" x2="${PAD_L + plotW}" y2="${yZero}" stroke="#d1d5db" stroke-width="1"/>` +
        `<line x1="${PAD_L}" y1="${yOne}" x2="${PAD_L + plotW}" y2="${yOne}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="2 3"/>`;
    })
    .join("");

  // 좌측 신호명 라벨 + 눈금. vMin이 0이 아니면(예: bipolar AC) 실제 vMin 표기 + 0 라인 추가.
  const laneLabels = lanes
    .map((L) => {
      const labelY = (L.top + L.bottom) / 2 + 4;
      const yMinAbs = L.yOf(L.vMin);
      const yMaxAbs = L.yOf(L.vMax);
      let labels = `<text x="${PAD_L - 12}" y="${labelY}" text-anchor="end" font-size="13" font-weight="600" fill="#111827">${escapeSvg(L.sig.name)}</text>` +
        `<text x="${PAD_L - 4}" y="${yMinAbs + 4}" text-anchor="end" font-size="10" fill="#6b7280">${formatNumber(L.vMin)}</text>` +
        `<text x="${PAD_L - 4}" y="${yMaxAbs + 4}" text-anchor="end" font-size="10" fill="#6b7280">${formatNumber(L.vMax)}</text>`;
      // bipolar (vMin < 0 < vMax)면 v=0 라인 + "0" 라벨 추가
      if (L.vMin < 0 && L.vMax > 0) {
        const yZeroLevel = L.yOf(0);
        labels += `<line x1="${PAD_L}" y1="${yZeroLevel}" x2="${PAD_L + plotW}" y2="${yZeroLevel}" stroke="#9ca3af" stroke-width="0.8" stroke-dasharray="3 3"/>` +
          `<text x="${PAD_L - 4}" y="${yZeroLevel + 4}" text-anchor="end" font-size="10" fill="#6b7280">0</text>`;
      }
      return labels;
    })
    .join("");

  // x축 (가장 아래 lane 아래)
  const xAxis = `<line x1="${PAD_L}" y1="${plotBottom}" x2="${PAD_L + plotW}" y2="${plotBottom}" stroke="#374151" stroke-width="1.5"/>`;
  // 시간 마커 x 위치 계산 — tick label 충돌 회피용
  const markers = Array.isArray(d.markers) ? d.markers : [];
  const markerXs = markers.map((m) => xOf(m.t));
  // tick label은 marker 라벨과 가까우면 (40px 이내) 생략 — marker 라벨이 짧은 숫자보다 길어 시각 충돌.
  const TICK_MARKER_GAP_PX = 40;
  const tLabels = tTicks
    .filter((t) => {
      const tx = xOf(t);
      return markerXs.every((mx) => Math.abs(tx - mx) > TICK_MARKER_GAP_PX);
    })
    .map((t) => `<text x="${xOf(t)}" y="${plotBottom + 16}" text-anchor="middle" font-size="11" fill="#374151">${formatNumber(t)}</text>`)
    .join("");
  const xUnitLabel = `<text x="${PAD_L + plotW}" y="${plotBottom + 32}" text-anchor="end" font-size="12" fill="#1e3a8a">${escapeSvg(xSymbol)}${tUnit ? ` [${escapeSvg(tUnit)}]` : ""}</text>`;

  // 신호별 polyline — 자기 lane의 yOf 사용. 모두 같은 색.
  // blank=true 신호는 polyline 생략 (학생이 직접 채울 빈칸 트랙)
  const signalLines = lanes
    .map((L) => {
      if (L.sig.blank) return "";
      const points = buildSignalPoints(L.sig, xOf, L.yOf);
      return `<polyline points="${points}" fill="none" stroke="${STROKE}" stroke-width="1.8"/>`;
    })
    .join("");

  // 시간 마커 (t₁, t₂, ...) — 전체 lane 영역 가로지르는 점선 + 축 아래 라벨
  //   ★ 라벨이 가까우면 위·아래로 번갈아 배치해 겹침 방지 (실측: "f₀"와 "1000/(2π)"가 포개짐).
  const MARKER_LABEL_MIN_GAP = 56;
  let lastLabelX = Number.NEGATIVE_INFINITY;
  let labelRow = 0;
  const markerLines = markers
    .map((m) => {
      const mx = xOf(m.t);
      if (mx - lastLabelX < MARKER_LABEL_MIN_GAP) labelRow = (labelRow + 1) % 2;
      else labelRow = 0;
      lastLabelX = mx;
      const labelY = plotBottom + 30 + labelRow * 15;
      return `<line x1="${mx}" y1="${plotTop}" x2="${mx}" y2="${plotBottom}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3"/>` +
        `<text x="${mx}" y="${labelY}" text-anchor="middle" font-size="12" fill="#1e3a8a" font-weight="600">${escapeSvg(m.label)}</text>`;
    })
    .join("");

  // y마커 (I_max, V_th, ...) — 첫 lane의 yOf로 위치 결정, 가로 점선 + 좌측 라벨.
  // 곡선/연속 신호 그래프(주파수응답 등)에서 특정 v값 강조에 사용.
  const yMarkers = Array.isArray(d.yMarkers) ? d.yMarkers : [];
  const yMarkerLines = lanes.length > 0
    ? yMarkers
        .map((ym) => {
          const my = lanes[0].yOf(ym.v);
          // ★ lane 축 눈금(vMin·vMax 숫자)과 겹치면 라벨을 위로 살짝 올린다
          //   (실측: "I_max"와 "0.05"가 같은 높이에 포개져 둘 다 안 읽혔다).
          const collides =
            Math.abs(my - lanes[0].yOf(lanes[0].vMax)) < 12 ||
            Math.abs(my - lanes[0].yOf(lanes[0].vMin)) < 12;
          const labelY = collides ? my - 8 : my + 4;
          return `<line x1="${PAD_L}" y1="${my}" x2="${PAD_L + plotW}" y2="${my}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3"/>` +
            `<text x="${PAD_L - 4}" y="${labelY}" text-anchor="end" font-size="12" fill="#1e3a8a" font-weight="600">${escapeSvg(ym.label)}</text>`;
        })
        .join("")
    : "";

  // 구간 표시 — 경계 세로 점선 + 축 아래 span bar(양끝 눈금) + 가운데 라벨(㉠·㉡·㉢).
  //   원본 임용 문제의 (나) 하단 표기를 그대로 재현한다. regions 미지정이면 아무것도 그리지 않는다.
  const regionBarY = plotBottom + PAD_B - 6;
  const regionMarks = regionSpans
    .map((r) => {
      const x1 = xOf(r.from);
      const x2 = xOf(r.to);
      const cx = (x1 + x2) / 2;
      const tick = (x: number) =>
        `<line x1="${x}" y1="${regionBarY - 5}" x2="${x}" y2="${regionBarY + 5}" stroke="#1e3a8a" stroke-width="1.4"/>`;
      return (
        `<line x1="${x1}" y1="${plotTop}" x2="${x1}" y2="${plotBottom}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3"/>` +
        `<line x1="${x2}" y1="${plotTop}" x2="${x2}" y2="${plotBottom}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="3 3"/>` +
        `<line x1="${x1}" y1="${regionBarY}" x2="${x2}" y2="${regionBarY}" stroke="#1e3a8a" stroke-width="1.4"/>` +
        tick(x1) + tick(x2) +
        `<text x="${cx}" y="${regionBarY + 24}" text-anchor="middle" font-size="13" fill="#1e3a8a" font-weight="700">${escapeSvg(r.label)}</text>`
      );
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">
${gridLines}
${laneFrames}
${markerLines}
${yMarkerLines}
${laneLabels}
${signalLines}
${xAxis}
${tLabels}
${xUnitLabel}
${regionMarks}
</svg>`;

  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3 space-y-2">
      <FigureHeader figure={figure} />
      <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}

/**
 * shape에 따라 polyline points string 생성.
 *  - linear: sample 그대로 연결
 *  - step / square: zero-order hold (수평 후 수직)
 *  - exponential_rise / decay: 각 sample 구간에서 N개 중간점 생성해 곡선 polyline
 */
function buildSignalPoints(
  sig: Signal,
  xOf: (t: number) => number,
  yOf: (v: number) => number,
): string {
  const samples = (sig.samples ?? [])
    .filter((s) => typeof s?.t === "number" && typeof s?.v === "number")
    .slice()
    .sort((a, b) => a.t - b.t);
  if (samples.length === 0) return "";

  const shape = sig.shape ?? "linear";

  if (shape === "linear") {
    return samples.map((s) => `${xOf(s.t)},${yOf(s.v)}`).join(" ");
  }

  if (shape === "step" || shape === "square") {
    const pts: string[] = [];
    for (let i = 0; i < samples.length; i++) {
      const cur = samples[i];
      pts.push(`${xOf(cur.t)},${yOf(cur.v)}`);
      if (i + 1 < samples.length) {
        const next = samples[i + 1];
        // 다음 sample 직전까지 cur.v 유지: (next.t, cur.v) 점 추가 후 (next.t, next.v)는 다음 iter
        pts.push(`${xOf(next.t)},${yOf(cur.v)}`);
      }
    }
    return pts.join(" ");
  }

  if (shape === "exponential_rise" || shape === "exponential_decay") {
    const pts: string[] = [];
    const N = 16; // 구간당 중간점 수
    for (let i = 0; i < samples.length - 1; i++) {
      const cur = samples[i];
      const next = samples[i + 1];
      const span = next.t - cur.t;
      if (span <= 0) {
        pts.push(`${xOf(cur.t)},${yOf(cur.v)}`);
        continue;
      }
      const tau = sig.tau && sig.tau > 0 ? sig.tau : Math.max(span / 3, 1e-6);
      for (let k = 0; k < N; k++) {
        const t = cur.t + (span * k) / N;
        let v: number;
        if (shape === "exponential_rise") {
          // v(t) = v_next − (v_next − v_cur)·exp(−(t−t_cur)/τ)
          v = next.v - (next.v - cur.v) * Math.exp(-(t - cur.t) / tau);
        } else {
          // exponential_decay: v(t) = v_next + (v_cur − v_next)·exp(−(t−t_cur)/τ)
          v = next.v + (cur.v - next.v) * Math.exp(-(t - cur.t) / tau);
        }
        pts.push(`${xOf(t)},${yOf(v)}`);
      }
    }
    // 마지막 sample 추가
    const last = samples[samples.length - 1];
    pts.push(`${xOf(last.t)},${yOf(last.v)}`);
    return pts.join(" ");
  }

  // unknown shape — fallback to linear
  return samples.map((s) => `${xOf(s.t)},${yOf(s.v)}`).join(" ");
}

function niceTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  const range = max - min;
  const step = niceStep(range / count);
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step / 2; v += step) {
    // float 부동 보정
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

function niceStep(rawStep: number): number {
  if (rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const f = rawStep / Math.pow(10, exp);
  let nice: number;
  if (f < 1.5) nice = 1;
  else if (f < 3) nice = 2;
  else if (f < 7) nice = 5;
  else nice = 10;
  return nice * Math.pow(10, exp);
}

function formatNumber(v: number): string {
  if (Math.abs(v) < 1e-9) return "0";
  if (Math.abs(v) >= 1000 || Math.abs(v) < 0.01) return v.toExponential(1);
  return Number(v.toFixed(3)).toString();
}

function escapeSvg(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
