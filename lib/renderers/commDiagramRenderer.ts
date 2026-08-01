import type { CommDiagram } from "@/types";

/**
 * 통신 전용 도식 렌더러 — kind별 dispatch.
 *  - waveform: 시간영역 파형 (analytic sine/square/... 합성 또는 samples)
 *  - spectrum: 주파수영역 스펙트럼 (stem/impulse plot)
 *  - block:    좌→우 송수신 시스템 블록도 (변조기·채널·복조기 등)
 *
 * 반환은 SVG 문자열 (renderers/index.tsx의 wrapSvg가 dangerouslySetInnerHTML로 노출).
 */
export function renderCommDiagram(d: CommDiagram): string {
  if (!d || typeof d !== "object" || !("kind" in d)) return emptySvg("잘못된 통신 도식");
  switch (d.kind) {
    case "waveform": return renderWaveform(d);
    case "spectrum": return renderSpectrum(d);
    case "block": return renderBlock(d);
    default: return emptySvg("지원하지 않는 kind");
  }
}

const STROKE = "#111827";
const AXIS = "#374151";
const GRID = "#e5e7eb";
const ACCENT = "#1e3a8a";

function esc(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function emptySvg(msg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="60" viewBox="0 0 400 60"><text x="12" y="34" font-size="13" fill="#b45309">${esc(msg)}</text></svg>`;
}

// ─── waveform ────────────────────────────────────────────────────────
function renderWaveform(d: Extract<CommDiagram, { kind: "waveform" }>): string {
  const signals = Array.isArray(d.signals) ? d.signals.filter((s) => s && s.form) : [];
  if (signals.length === 0) return emptySvg("파형 신호 없음");

  const PAD_L = 64, PAD_R = 24, PAD_T = 20, PAD_B = 40;
  const PLOT_W = 600, LANE_H = 70, LANE_GAP = 16;
  const timeSpan = typeof d.timeSpan === "number" && d.timeSpan > 0 ? d.timeSpan : 1;
  const N = 240; // 합성 샘플 수

  const lanes = signals.map((sig) => {
    const pts = synthSamples(sig, timeSpan, N);
    let vMin = Infinity, vMax = -Infinity;
    for (const p of pts) { if (p.v < vMin) vMin = p.v; if (p.v > vMax) vMax = p.v; }
    if (!Number.isFinite(vMin)) { vMin = -1; vMax = 1; }
    if (vMax - vMin < 1e-9) { vMin -= 1; vMax += 1; }
    return { sig, pts, vMin, vMax };
  });

  const totalH = lanes.length * LANE_H + (lanes.length - 1) * LANE_GAP;
  const SVG_W = PLOT_W + PAD_L + PAD_R;
  const SVG_H = PAD_T + totalH + PAD_B;
  const xUnit = d.xLabel ?? "t";

  const xOf = (t: number) => PAD_L + (t / timeSpan) * PLOT_W;

  let body = "";
  lanes.forEach((L, i) => {
    const top = PAD_T + i * (LANE_H + LANE_GAP);
    const bottom = top + LANE_H;
    const innerTop = top + 8, innerBottom = bottom - 8;
    const yOf = (v: number) => innerBottom - ((v - L.vMin) / (L.vMax - L.vMin)) * (innerBottom - innerTop);
    const yZero = L.vMin < 0 && L.vMax > 0 ? yOf(0) : bottom;
    // baseline
    body += `<line x1="${PAD_L}" y1="${yZero}" x2="${PAD_L + PLOT_W}" y2="${yZero}" stroke="${GRID}" stroke-width="1"/>`;
    // signal name
    body += `<text x="${PAD_L - 10}" y="${(top + bottom) / 2 + 4}" text-anchor="end" font-size="12" font-weight="600" fill="${STROKE}">${esc(L.sig.name || "")}</text>`;
    // polyline
    const poly = L.pts.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(" ");
    body += `<polyline points="${poly}" fill="none" stroke="${STROKE}" stroke-width="1.8"/>`;
  });

  // x축
  const axisY = PAD_T + totalH;
  body += `<line x1="${PAD_L}" y1="${axisY}" x2="${PAD_L + PLOT_W}" y2="${axisY}" stroke="${AXIS}" stroke-width="1.4"/>`;
  body += `<text x="${PAD_L + PLOT_W}" y="${axisY + 26}" text-anchor="end" font-size="12" fill="${ACCENT}">${esc(xUnit)}</text>`;
  const cap = d.caption ? `<text x="${PAD_L}" y="14" font-size="12" fill="#64748b">${esc(d.caption)}</text>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">${cap}${body}</svg>`;
}

/** analytic form 또는 samples를 t=0..timeSpan 위 N개 점으로 합성. */
function synthSamples(
  sig: Extract<CommDiagram, { kind: "waveform" }>["signals"][number],
  timeSpan: number,
  N: number,
): Array<{ t: number; v: number }> {
  const amp = typeof sig.amplitude === "number" ? sig.amplitude : 1;
  const freq = typeof sig.freq === "number" && sig.freq > 0 ? sig.freq : 1; // 사이클 수
  const phase = typeof sig.phase === "number" ? sig.phase : 0;
  const off = typeof sig.offset === "number" ? sig.offset : 0;

  if (sig.form === "samples") {
    const s = Array.isArray(sig.samples) ? sig.samples.filter((p) => typeof p?.t === "number" && typeof p?.v === "number") : [];
    return s.length > 0 ? s.slice().sort((a, b) => a.t - b.t) : [{ t: 0, v: 0 }, { t: timeSpan, v: 0 }];
  }

  const out: Array<{ t: number; v: number }> = [];
  const w = (2 * Math.PI * freq) / timeSpan; // timeSpan 안에 freq 사이클
  for (let k = 0; k <= N; k++) {
    const t = (timeSpan * k) / N;
    const ph = w * t + phase;
    let v: number;
    switch (sig.form) {
      case "sine": v = Math.sin(ph); break;
      case "cosine": v = Math.cos(ph); break;
      case "square": v = Math.sin(ph) >= 0 ? 1 : -1; break;
      case "triangle": v = (2 / Math.PI) * Math.asin(Math.sin(ph)); break;
      case "pulse": v = (ph % (2 * Math.PI)) < Math.PI ? 1 : 0; break;
      default: v = Math.sin(ph);
    }
    out.push({ t, v: amp * v + off });
  }
  return out;
}

// ─── spectrum (stem plot) ────────────────────────────────────────────
function renderSpectrum(d: Extract<CommDiagram, { kind: "spectrum" }>): string {
  const lines = Array.isArray(d.lines) ? d.lines.filter((l) => typeof l?.freq === "number" && typeof l?.amplitude === "number") : [];
  if (lines.length === 0) return emptySvg("스펙트럼 성분 없음");

  const PAD_L = 56, PAD_R = 28, PAD_T = 24, PAD_B = 46;
  const PLOT_W = 600, PLOT_H = 220;
  const SVG_W = PLOT_W + PAD_L + PAD_R;
  const SVG_H = PLOT_H + PAD_T + PAD_B;

  const fMin = Math.min(0, ...lines.map((l) => l.freq));
  const fMax = Math.max(...lines.map((l) => l.freq), fMin + 1);
  const aMax = Math.max(...lines.map((l) => Math.abs(l.amplitude)), 1);
  const fRange = fMax - fMin || 1;

  const xOf = (f: number) => PAD_L + ((f - fMin) / fRange) * PLOT_W;
  const yOf = (a: number) => PAD_T + PLOT_H - (Math.abs(a) / aMax) * PLOT_H;
  const baseY = PAD_T + PLOT_H;

  let body = "";
  // axes
  body += `<line x1="${PAD_L}" y1="${baseY}" x2="${PAD_L + PLOT_W}" y2="${baseY}" stroke="${AXIS}" stroke-width="1.4"/>`;
  body += `<line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${baseY}" stroke="${AXIS}" stroke-width="1.4"/>`;
  // stems
  for (const l of lines) {
    const x = xOf(l.freq), y = yOf(l.amplitude);
    body += `<line x1="${x.toFixed(1)}" y1="${baseY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${STROKE}" stroke-width="2"/>`;
    body += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${ACCENT}"/>`;
    // freq label under axis
    body += `<text x="${x.toFixed(1)}" y="${baseY + 16}" text-anchor="middle" font-size="10" fill="${AXIS}">${esc(formatNum(l.freq))}</text>`;
    // amplitude/label above dot
    const lab = l.label ? esc(l.label) : formatNum(l.amplitude);
    body += `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" font-size="10" fill="${ACCENT}" font-weight="600">${lab}</text>`;
  }
  const xUnit = d.xLabel ?? "f [Hz]";
  const yUnit = d.yLabel ?? "amplitude";
  body += `<text x="${PAD_L + PLOT_W}" y="${baseY + 34}" text-anchor="end" font-size="12" fill="${ACCENT}">${esc(xUnit)}</text>`;
  body += `<text x="${PAD_L - 4}" y="${PAD_T - 8}" text-anchor="start" font-size="11" fill="${ACCENT}">${esc(yUnit)}</text>`;
  const cap = d.caption ? `<text x="${PAD_L}" y="14" font-size="12" fill="#64748b">${esc(d.caption)}</text>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">${cap}${body}</svg>`;
}

// ─── block diagram (left→right) ──────────────────────────────────────
function renderBlock(d: Extract<CommDiagram, { kind: "block" }>): string {
  const blocks = Array.isArray(d.blocks) ? d.blocks.filter((b) => b && b.id) : [];
  if (blocks.length === 0) return emptySvg("블록 없음");
  const edges = Array.isArray(d.edges) ? d.edges : [];

  const BW = 120, BH = 56, GAP = 56, PAD = 28, ARROW = GAP;
  const SVG_W = PAD * 2 + blocks.length * BW + (blocks.length - 1) * ARROW;
  const SVG_H = 130;
  const cy = 64;

  const xOf = (i: number) => PAD + i * (BW + ARROW);
  const idx: Record<string, number> = {};
  blocks.forEach((b, i) => { idx[b.id] = i; });

  let body = "";
  // arrows first (behind boxes)
  for (const e of edges) {
    const fi = idx[e.from], ti = idx[e.to];
    if (fi === undefined || ti === undefined) continue;
    if (ti === fi + 1) {
      const x1 = xOf(fi) + BW, x2 = xOf(ti);
      body += `<line x1="${x1}" y1="${cy}" x2="${x2 - 8}" y2="${cy}" stroke="${AXIS}" stroke-width="1.6"/>`;
      body += `<path d="M ${x2 - 8} ${cy - 5} L ${x2} ${cy} L ${x2 - 8} ${cy + 5} Z" fill="${AXIS}"/>`;
      if (e.label) body += `<text x="${(x1 + x2) / 2}" y="${cy - 8}" text-anchor="middle" font-size="10" fill="${ACCENT}">${esc(e.label)}</text>`;
    }
  }
  // default chain arrows if no edges given
  if (edges.length === 0) {
    for (let i = 0; i < blocks.length - 1; i++) {
      const x1 = xOf(i) + BW, x2 = xOf(i + 1);
      body += `<line x1="${x1}" y1="${cy}" x2="${x2 - 8}" y2="${cy}" stroke="${AXIS}" stroke-width="1.6"/>`;
      body += `<path d="M ${x2 - 8} ${cy - 5} L ${x2} ${cy} L ${x2 - 8} ${cy + 5} Z" fill="${AXIS}"/>`;
    }
  }
  // boxes
  blocks.forEach((b, i) => {
    const x = xOf(i), y = cy - BH / 2;
    body += `<rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="6" fill="#f8fafc" stroke="${ACCENT}" stroke-width="1.4"/>`;
    body += wrapLabel(b.label || b.id, x + BW / 2, cy);
  });
  const cap = d.caption ? `<text x="${PAD}" y="16" font-size="12" fill="#64748b">${esc(d.caption)}</text>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}">${cap}${body}</svg>`;
}

/** 블록 라벨을 최대 2줄로 감싼다 (긴 한글 라벨 대비). */
function wrapLabel(label: string, cx: number, cy: number): string {
  const words = String(label).split(/\s+/);
  if (words.length <= 1 || label.length <= 8) {
    return `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="${STROKE}">${esc(label)}</text>`;
  }
  const mid = Math.ceil(words.length / 2);
  const l1 = words.slice(0, mid).join(" ");
  const l2 = words.slice(mid).join(" ");
  return `<text x="${cx}" y="${cy - 3}" text-anchor="middle" font-size="12" font-weight="600" fill="${STROKE}">${esc(l1)}</text>` +
    `<text x="${cx}" y="${cy + 13}" text-anchor="middle" font-size="12" font-weight="600" fill="${STROKE}">${esc(l2)}</text>`;
}

function formatNum(v: number): string {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0)) return v.toExponential(1);
  return Number(v.toFixed(3)).toString();
}
