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
};

type Marker = { t: number; label: string };

type WaveformDiagram = {
  signals: Signal[];
  unit?: { time?: string; value?: string };
  /** 시간축 기준점 — 세로 점선 + 라벨 (예: t₁, t₂, t₃, t₄). */
  markers?: Marker[];
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
  const signals = Array.isArray(d?.signals) ? d.signals.filter((s) => Array.isArray(s?.samples) && s.samples.length > 0) : [];
  if (signals.length === 0) return <PlaceholderFigure figure={figure} />;

  // 시간 축 범위 — 모든 신호 합산
  let tMin = Number.POSITIVE_INFINITY, tMax = Number.NEGATIVE_INFINITY;
  for (const sig of signals) {
    for (const s of sig.samples) {
      if (typeof s?.t === "number" && Number.isFinite(s.t)) {
        if (s.t < tMin) tMin = s.t;
        if (s.t > tMax) tMax = s.t;
      }
    }
  }
  if (!Number.isFinite(tMin)) return <PlaceholderFigure figure={figure} />;
  if (tMax <= tMin) tMax = tMin + 1;

  const tUnit = d.unit?.time ?? "";
  const tRange = tMax - tMin;
  const xOf = (t: number) => PAD_L + ((t - tMin) / tRange) * PLOT_W;

  // 각 신호의 lane 영역 (lane top/bottom y) 결정. lane은 위에서부터 stack.
  const lanes = signals.map((sig, i) => {
    const top = PAD_T + i * (LANE_H + LANE_GAP);
    const bottom = top + LANE_H;
    // 신호의 v range — 디지털(0/1)이거나 정해진 범위. 자동 계산.
    let vMin = Number.POSITIVE_INFINITY, vMax = Number.NEGATIVE_INFINITY;
    for (const s of sig.samples) {
      if (typeof s.v === "number" && Number.isFinite(s.v)) {
        if (s.v < vMin) vMin = s.v;
        if (s.v > vMax) vMax = s.v;
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

  const totalLanesH = signals.length * LANE_H + (signals.length - 1) * LANE_GAP;
  const plotTop = PAD_T;
  const plotBottom = plotTop + totalLanesH;
  const SVG_W = PLOT_W + PAD_L + PAD_R;
  const SVG_H = plotBottom + PAD_B;

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
      return `<line x1="${PAD_L}" y1="${yZero}" x2="${PAD_L + PLOT_W}" y2="${yZero}" stroke="#d1d5db" stroke-width="1"/>` +
        `<line x1="${PAD_L}" y1="${yOne}" x2="${PAD_L + PLOT_W}" y2="${yOne}" stroke="#f1f5f9" stroke-width="1" stroke-dasharray="2 3"/>`;
    })
    .join("");

  // 좌측 신호명 라벨 + 0/1 눈금
  const laneLabels = lanes
    .map((L) => {
      const labelY = (L.top + L.bottom) / 2 + 4;
      const yZero = L.yOf(L.vMin);
      const yOne = L.yOf(L.vMax);
      return `<text x="${PAD_L - 12}" y="${labelY}" text-anchor="end" font-size="13" font-weight="600" fill="#111827">${escapeSvg(L.sig.name)}</text>` +
        `<text x="${PAD_L - 4}" y="${yZero + 4}" text-anchor="end" font-size="10" fill="#6b7280">0</text>` +
        `<text x="${PAD_L - 4}" y="${yOne + 4}" text-anchor="end" font-size="10" fill="#6b7280">${formatNumber(L.vMax)}</text>`;
    })
    .join("");

  // x축 (가장 아래 lane 아래)
  const xAxis = `<line x1="${PAD_L}" y1="${plotBottom}" x2="${PAD_L + PLOT_W}" y2="${plotBottom}" stroke="#374151" stroke-width="1.5"/>`;
  const tLabels = tTicks
    .map((t) => `<text x="${xOf(t)}" y="${plotBottom + 16}" text-anchor="middle" font-size="11" fill="#374151">${formatNumber(t)}</text>`)
    .join("");
  const xUnitLabel = `<text x="${PAD_L + PLOT_W}" y="${plotBottom + 32}" text-anchor="end" font-size="12" fill="#1e3a8a">t${tUnit ? ` [${tUnit}]` : ""}</text>`;

  // 신호별 polyline — 자기 lane의 yOf 사용. 모두 같은 색.
  const signalLines = lanes
    .map((L) => {
      const points = buildSignalPoints(L.sig, xOf, L.yOf);
      return `<polyline points="${points}" fill="none" stroke="${STROKE}" stroke-width="1.8"/>`;
    })
    .join("");

  // 시간 마커 (t₁, t₂, ...) — 전체 lane 영역 가로지르는 점선 + 축 아래 라벨
  const markers = Array.isArray(d.markers) ? d.markers : [];
  const markerLines = markers
    .map((m) => {
      const mx = xOf(m.t);
      return `<line x1="${mx}" y1="${plotTop}" x2="${mx}" y2="${plotBottom}" stroke="#94a3b8" stroke-width="1" stroke-dasharray="4 3"/>` +
        `<text x="${mx}" y="${plotBottom + 30}" text-anchor="middle" font-size="11" fill="#1e3a8a" font-weight="600">${escapeSvg(m.label)}</text>`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">
${gridLines}
${laneFrames}
${markerLines}
${laneLabels}
${signalLines}
${xAxis}
${tLabels}
${xUnitLabel}
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
