import type { NumberRingDiagram } from "@/types";

/**
 * n비트 수 표현 **원형(고리) 다이어그램** (임용 4번 형식) — 원본 배치 그대로.
 *   0000을 12시에 두고 코드값 순서대로 시계 방향 배치.
 *   바깥쪽 = 2진 코드, 안쪽 = 10진수 값(음수 포함).
 */

const STROKE = "#111827";
const ACCENT = "#1d4ed8";
const RED = "#dc2626";
const MUTED = "#6b7280";

export function renderNumberRing(d: NumberRingDiagram): string {
  const entries = d.entries ?? [];
  const n = entries.length;
  if (n === 0) return `<pre>number_ring: entries 비어있음</pre>`;

  const W = 380, H = 360;
  const cx = W / 2, cy = H / 2 + 6;
  const r = 106;              // 고리 반지름
  const rTick = 10;           // 눈금 길이
  const rCode = r + 30;       // 2진 코드 라벨 반경
  const rVal = r - 26;        // 10진수 라벨 반경
  const s: string[] = [], t: string[] = [];

  s.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${STROKE}" stroke-width="1.5"/>`);

  entries.forEach((e, i) => {
    // 0000이 12시(−90°), 코드 증가 방향은 시계 방향
    const ang = (-90 + (360 / n) * i) * (Math.PI / 180);
    const ux = Math.cos(ang), uy = Math.sin(ang);
    // 눈금
    s.push(
      `<line x1="${(cx + ux * (r - rTick / 2)).toFixed(1)}" y1="${(cy + uy * (r - rTick / 2)).toFixed(1)}" ` +
      `x2="${(cx + ux * (r + rTick / 2)).toFixed(1)}" y2="${(cy + uy * (r + rTick / 2)).toFixed(1)}" ` +
      `stroke="${STROKE}" stroke-width="1.2"/>`,
    );
    // 2진 코드 (바깥)
    t.push(label(cx + ux * rCode, cy + uy * rCode, e.code, 10.5, STROKE));
    // 10진수 (안쪽) — 음수는 붉게
    const v = e.value;
    const vText = Object.is(v, -0) ? "−0" : v < 0 ? `−${Math.abs(v)}` : `${v}`;
    t.push(label(cx + ux * rVal, cy + uy * rVal, vText, 11, v < 0 || Object.is(v, -0) ? RED : ACCENT, 600));
  });

  t.push(label(cx, H - 8, `${d.bits ?? Math.log2(n)}비트 수 표현 (바깥=2진 코드, 안=10진수)`, 10, MUTED));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, sans-serif">\n${[...s, ...t].join("\n")}\n</svg>`;
}

function label(x: number, y: number, str: string, size: number, fill: string, weight = 400): string {
  return `<text x="${x.toFixed(1)}" y="${(y + size / 3).toFixed(1)}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${fill}">${esc(str)}</text>`;
}
function esc(str: string): string {
  return String(str ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
