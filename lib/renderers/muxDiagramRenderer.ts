import type { MuxDiagram } from "@/types";

/**
 * 4×1 MUX SVG renderer — 표준 사다리꼴 심볼.
 *
 *  레이아웃:
 *    좌측 4개 데이터 입력 (I_0~I_3) — 수평 stub + 라벨, blank 입력은 ㉠/㉡ marker.
 *    우측 출력 F — 수평 stub.
 *    하단 2개 선택선 (S_1, S_0) — 수직 stub + 라벨, 그 아래 선택선 신호(A·B).
 *    상단 캡션 "4×1 MUX".
 *
 *  심볼 사다리꼴: 좌측 변 위에서 아래로 1.0배, 우측 변 0.55배 (위·아래 각각 0.225배 안쪽으로 들여쓰기).
 */

const STUB_LEN = 32;
const PAD = 24;
const BODY_W = 96;
const BODY_H = 200;
const SLANT = 22; // 우측 변이 안쪽으로 들어간 양 (위·아래 각)
const SVG_W = STUB_LEN + PAD + 60 + BODY_W + STUB_LEN + PAD + 60;
const SVG_H = PAD + BODY_H + STUB_LEN + 36;

const STROKE = "#111827";
const FILL = "#ffffff";
const LABEL_FONT = "13px sans-serif";

export function renderMuxDiagramSVG(d: MuxDiagram): string {
  const caption = d.caption ?? "4×1 MUX";
  const outLabel = d.outputLabel ?? "F";
  const inputs = Array.isArray(d.inputs) ? d.inputs.slice().sort((a, b) => a.slot - b.slot) : [];
  if (inputs.length !== 4) return emptySvg(`MUX inputs ≠ 4 (got ${inputs.length})`);

  const bodyLeft = STUB_LEN + PAD + 60;
  const bodyRight = bodyLeft + BODY_W;
  const bodyTop = PAD;
  const bodyBottom = bodyTop + BODY_H;

  // 사다리꼴 — 우측 변이 위·아래로 SLANT만큼 들어감
  const trapezoid =
    `<polygon points="${bodyLeft},${bodyTop} ${bodyRight},${bodyTop + SLANT} ${bodyRight},${bodyBottom - SLANT} ${bodyLeft},${bodyBottom}" ` +
    `fill="${FILL}" stroke="${STROKE}" stroke-width="1.6"/>`;

  // 캡션 — 사다리꼴 중앙 위쪽
  const captionText =
    `<text x="${(bodyLeft + bodyRight) / 2}" y="${bodyTop + BODY_H / 2 - 4}" text-anchor="middle" font-size="14" font-weight="700" fill="${STROKE}">${escapeSvg(caption.split(" ")[0])}</text>` +
    `<text x="${(bodyLeft + bodyRight) / 2}" y="${bodyTop + BODY_H / 2 + 14}" text-anchor="middle" font-size="12" fill="${STROKE}">${escapeSvg(caption.split(" ").slice(1).join(" "))}</text>`;

  // 좌측 4개 입력 핀 — 균등 분할
  const pinY: number[] = [];
  for (let i = 0; i < 4; i++) {
    pinY.push(bodyTop + (BODY_H / 5) * (i + 1));
  }

  let inputStubs = "";
  let inputLabels = "";
  let blankMarkers = "";

  inputs.forEach((inp, i) => {
    const y = pinY[i];
    // wire stub (좌측 외부 ← body 좌측)
    inputStubs += `<line x1="${bodyLeft - STUB_LEN}" y1="${y}" x2="${bodyLeft}" y2="${y}" stroke="${STROKE}" stroke-width="1.4"/>`;
    // 핀 라벨 (사다리꼴 내부 좌측)
    inputLabels += `<text x="${bodyLeft + 8}" y="${y + 4}" text-anchor="start" font-size="12" font-weight="600" fill="${STROKE}">${escapeSvg(inp.pinLabel)}</text>`;

    if (inp.blank && inp.blankMarker) {
      // blank marker — 외부 stub 좌측 끝에 ㉠/㉡ 원형 marker
      const mx = bodyLeft - STUB_LEN - 10;
      blankMarkers +=
        `<circle cx="${mx}" cy="${y}" r="13" fill="#ffffff" stroke="#1e3a8a" stroke-width="1.2"/>` +
        `<text x="${mx}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="700" fill="#1e3a8a">${escapeSvg(inp.blankMarker)}</text>`;
    } else {
      // 값 라벨 (외부 stub 좌측 끝)
      const lx = bodyLeft - STUB_LEN - 6;
      inputLabels += `<text x="${lx}" y="${y + 4}" text-anchor="end" font-size="13" font-weight="600" fill="${STROKE}">${escapeSvg(inp.value)}</text>`;
    }
  });

  // 우측 출력 — body 우측 중앙 (slant 고려)
  const outY = (bodyTop + bodyBottom) / 2;
  const outStub =
    `<line x1="${bodyRight}" y1="${outY}" x2="${bodyRight + STUB_LEN}" y2="${outY}" stroke="${STROKE}" stroke-width="1.4"/>` +
    `<text x="${bodyRight + STUB_LEN + 6}" y="${outY + 4}" text-anchor="start" font-size="14" font-weight="700" fill="${STROKE}">${escapeSvg(outLabel)}</text>`;

  // 하단 2개 선택선 — body 하단 (slant 보정)
  // body 하단 변: from (bodyLeft, bodyBottom) to (bodyRight, bodyBottom - SLANT). 우하단 꺾인 부분.
  // 선택선 핀은 body 하단의 두 위치(좌·우 1/3, 2/3)에 배치.
  const selX_high = bodyLeft + BODY_W * 0.33;
  const selX_low = bodyLeft + BODY_W * 0.66;
  // body 하단 변의 y는 x에 따라 다름 (slant). 좌측은 bodyBottom, 우측은 bodyBottom-SLANT.
  const slantY = (x: number) => {
    const t = (x - bodyLeft) / BODY_W;
    return bodyBottom - t * SLANT;
  };
  const selY_high = slantY(selX_high);
  const selY_low = slantY(selX_low);
  const selStubBottom = bodyBottom + STUB_LEN;

  const selectors =
    `<line x1="${selX_high}" y1="${selY_high}" x2="${selX_high}" y2="${selStubBottom}" stroke="${STROKE}" stroke-width="1.4"/>` +
    `<line x1="${selX_low}" y1="${selY_low}" x2="${selX_low}" y2="${selStubBottom}" stroke="${STROKE}" stroke-width="1.4"/>` +
    // 핀 라벨 (내부)
    `<text x="${selX_high}" y="${selY_high - 6}" text-anchor="middle" font-size="12" font-weight="600" fill="${STROKE}">${escapeSvg(d.selectors.high.pinLabel)}</text>` +
    `<text x="${selX_low}" y="${selY_low - 6}" text-anchor="middle" font-size="12" font-weight="600" fill="${STROKE}">${escapeSvg(d.selectors.low.pinLabel)}</text>` +
    // 신호 라벨 (외부 stub 아래)
    `<text x="${selX_high}" y="${selStubBottom + 16}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">${escapeSvg(d.selectors.high.signal)}</text>` +
    `<text x="${selX_low}" y="${selStubBottom + 16}" text-anchor="middle" font-size="13" font-weight="700" fill="${STROKE}">${escapeSvg(d.selectors.low.signal)}</text>`;

  const svgW = SVG_W;
  const svgH = SVG_H;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="font-family: ui-sans-serif, system-ui;">
${trapezoid}
${inputStubs}
${blankMarkers}
${inputLabels}
${outStub}
${selectors}
${captionText}
</svg>`;
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
