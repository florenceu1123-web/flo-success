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

type WaveformDiagram = {
  signals: Signal[];
  unit?: { time?: string; value?: string };
};

const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c", "#0891b2"];
const PAD_L = 60;
const PAD_R = 30;
const PAD_T = 40;
const PAD_B = 50;
const PLOT_W = 620;
const PLOT_H = 280;
const SVG_W = PLOT_W + PAD_L + PAD_R;
const SVG_H = PLOT_H + PAD_T + PAD_B;

export function renderWaveform(figure: FigureVariant) {
  if (!figure.diagram) return <DiagramMissing figure={figure} />;

  const d = figure.diagram as WaveformDiagram;
  const signals = Array.isArray(d?.signals) ? d.signals.filter((s) => Array.isArray(s?.samples) && s.samples.length > 0) : [];
  if (signals.length === 0) return <PlaceholderFigure figure={figure} />;

  // 축 범위 계산
  let tMin = Number.POSITIVE_INFINITY, tMax = Number.NEGATIVE_INFINITY;
  let vMin = Number.POSITIVE_INFINITY, vMax = Number.NEGATIVE_INFINITY;
  for (const sig of signals) {
    for (const s of sig.samples) {
      if (typeof s?.t === "number" && Number.isFinite(s.t)) {
        if (s.t < tMin) tMin = s.t;
        if (s.t > tMax) tMax = s.t;
      }
      if (typeof s?.v === "number" && Number.isFinite(s.v)) {
        if (s.v < vMin) vMin = s.v;
        if (s.v > vMax) vMax = s.v;
      }
    }
  }
  if (!Number.isFinite(tMin) || !Number.isFinite(vMin)) return <PlaceholderFigure figure={figure} />;
  if (tMax <= tMin) tMax = tMin + 1;
  // y range padding
  const vSpan = Math.max(vMax - vMin, 0.1);
  const vLo = vMin - vSpan * 0.1;
  const vHi = vMax + vSpan * 0.1;

  const tUnit = d.unit?.time ?? "";
  const vUnit = d.unit?.value ?? "";

  const tRange = tMax - tMin;
  const vRange = vHi - vLo;
  const xOf = (t: number) => PAD_L + ((t - tMin) / tRange) * PLOT_W;
  const yOf = (v: number) => PAD_T + PLOT_H - ((v - vLo) / vRange) * PLOT_H;

  // grid + axes
  const tTicks = niceTicks(tMin, tMax, 5);
  const vTicks = niceTicks(vLo, vHi, 4);

  const gridLines = [
    ...tTicks.map((t) => `<line x1="${xOf(t)}" y1="${PAD_T}" x2="${xOf(t)}" y2="${PAD_T + PLOT_H}" stroke="#e5e7eb" stroke-width="1"/>`),
    ...vTicks.map((v) => `<line x1="${PAD_L}" y1="${yOf(v)}" x2="${PAD_L + PLOT_W}" y2="${yOf(v)}" stroke="#e5e7eb" stroke-width="1"/>`),
  ].join("");

  const xAxis = `<line x1="${PAD_L}" y1="${PAD_T + PLOT_H}" x2="${PAD_L + PLOT_W}" y2="${PAD_T + PLOT_H}" stroke="#374151" stroke-width="1.5"/>`;
  const yAxis = `<line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PAD_T + PLOT_H}" stroke="#374151" stroke-width="1.5"/>`;

  const tLabels = tTicks
    .map((t) => `<text x="${xOf(t)}" y="${PAD_T + PLOT_H + 16}" text-anchor="middle" font-size="11" fill="#374151">${formatNumber(t)}</text>`)
    .join("");
  const vLabels = vTicks
    .map((v) => `<text x="${PAD_L - 8}" y="${yOf(v) + 4}" text-anchor="end" font-size="11" fill="#374151">${formatNumber(v)}</text>`)
    .join("");

  // 축 라벨 (단위 표기)
  const xUnitLabel = `<text x="${PAD_L + PLOT_W}" y="${PAD_T + PLOT_H + 32}" text-anchor="end" font-size="12" fill="#1e3a8a">t${tUnit ? ` [${tUnit}]` : ""}</text>`;
  const yUnitLabel = `<text x="${PAD_L - 4}" y="${PAD_T - 12}" text-anchor="end" font-size="12" fill="#1e3a8a">v${vUnit ? ` [${vUnit}]` : ""}</text>`;

  // 신호별 polyline (shape에 따라 보간 다르게)
  const signalLines = signals
    .map((sig, i) => {
      const color = COLORS[i % COLORS.length];
      const points = buildSignalPoints(sig, xOf, yOf);
      return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>`;
    })
    .join("");

  // legend (오른쪽 상단)
  const legendItems = signals.map((sig, i) => {
    const color = COLORS[i % COLORS.length];
    const lx = PAD_L + PLOT_W - 110;
    const ly = PAD_T - 22 + i * 16;
    return `<g>
      <line x1="${lx}" y1="${ly}" x2="${lx + 18}" y2="${ly}" stroke="${color}" stroke-width="2.5"/>
      <text x="${lx + 24}" y="${ly + 4}" font-size="11" fill="#1e3a8a">${escapeSvg(sig.name)}</text>
    </g>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">
${gridLines}
${xAxis}${yAxis}
${tLabels}${vLabels}
${xUnitLabel}${yUnitLabel}
${signalLines}
${legendItems}
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
