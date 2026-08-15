/**
 * 접지 글리프 **탐지** (테스트 전용) — 완성된 SVG에서 접지 기호를 기하 모양으로 찾는다.
 *
 * 글리프를 그리는 방식이 렌더러마다 다르다(`<g transform>` + 상대 좌표 / 절대 좌표 line 3줄 /
 * 세로 리드 포함 여부…). 문자열 패턴 대신 **모양**으로 찾으면 표현 방식과 무관하게 잡힌다:
 * 중심 x가 같고 아래로 갈수록 짧아지는 **가로선 3줄**(간격 3~6px, 폭 범위 고정).
 *
 * 쓰임: 회로이론 figure가 접지 기호를 **하나만** 그리는지 회귀 단언 (smokeSingleGroundSymbol).
 * ※ 전자회로(OPAMP·BJT) 렌더러는 다중 접지가 관례라 이 단언 대상이 아니다 — 사용자 지정(2026-08-10).
 */

/**
 * SVG에서 접지 글리프를 찾는다 — 중심 x가 같고 y가 커질수록 짧아지는 **가로선 3줄**.
 * `<g transform="translate(x,y)">`로 감싼 경우 오프셋을 더해 절대 좌표로 본다.
 */
function findGroundGlyphs(svg) {
  const lines = [];

  // 1) <g transform="translate(x,y)"> … </g> 안의 상대 좌표 가로선
  const groupRe = /<g transform="translate\(([-\d.]+),\s*([-\d.]+)\)"\s*>([\s\S]*?)<\/g>/g;
  const consumed = [];
  for (const g of svg.matchAll(groupRe)) {
    const ox = Number(g[1]), oy = Number(g[2]);
    const inner = g[3];
    const gStart = g.index ?? 0;
    let found = 0;
    for (const l of inner.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"/g)) {
      const x1 = Number(l[1]) + ox, y1 = Number(l[2]) + oy;
      const x2 = Number(l[3]) + ox, y2 = Number(l[4]) + oy;
      if (Math.abs(y1 - y2) > 0.5 || Math.abs(x2 - x1) < 1) continue;
      lines.push({ cx: (x1 + x2) / 2, y: y1, half: Math.abs(x2 - x1) / 2, start: gStart, end: gStart + g[0].length });
      found += 1;
    }
    if (found >= 3) consumed.push([gStart, gStart + g[0].length]);
  }

  // 2) 그룹 밖의 절대 좌표 가로선
  for (const l of svg.matchAll(/<line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"[^>]*\/>/g)) {
    const at = l.index ?? 0;
    if (consumed.some(([s, e]) => at >= s && at < e)) continue;
    const x1 = Number(l[1]), y1 = Number(l[2]), x2 = Number(l[3]), y2 = Number(l[4]);
    if (Math.abs(y1 - y2) > 0.5 || Math.abs(x2 - x1) < 1) continue;
    lines.push({ cx: (x1 + x2) / 2, y: y1, half: Math.abs(x2 - x1) / 2, start: at, end: at + l[0].length });
  }

  // 3) 중심 x가 같은 가로선끼리 묶어, 아래로 갈수록 짧아지는 3줄 연속을 찾는다.
  const byCx = new Map();
  for (const l of lines) {
    const key = Math.round(l.cx * 2) / 2;
    const arr = byCx.get(key) ?? [];
    arr.push(l);
    byCx.set(key, arr);
  }

  const glyphs = [];
  for (const arr of byCx.values()) {
    arr.sort((a, b) => a.y - b.y);
    for (let i = 0; i + 2 < arr.length; i += 1) {
      const [a, b, c] = [arr[i], arr[i + 1], arr[i + 2]];
      const d1 = b.y - a.y, d2 = c.y - b.y;
      const spacingOk = d1 >= 3 && d1 <= 6 && Math.abs(d1 - d2) <= 1.5;
      // ★ 폭 범위를 못박는다 — "아래로 갈수록 짧아지는 가로선 3줄"만으로는 파형 눈금·표 괘선 같은
      //   무관한 도형까지 잡아 **지워 버릴** 수 있다(삭제가 목적이라 과탐지는 치명적이다).
      const widthsOk =
        a.half >= 7 && a.half <= 14 &&
        b.half >= 4 && b.half <= 9 &&
        c.half >= 2 && c.half <= 5;
      const shrinking = a.half > b.half && b.half > c.half;
      // 실제 글리프는 세 줄을 **연속으로** 내보낸다 — 문서 순서가 떨어져 있으면 우연 일치다.
      //  ※ 같은 <g>에서 온 세 줄은 start/end가 그룹 전체로 같다 — 그때는 이미 한 덩어리다.
      const sameGroup = a.start === b.start && b.start === c.start;
      const adjacent = sameGroup || (Math.abs(b.start - a.end) < 200 && Math.abs(c.start - b.end) < 200);
      if (!spacingOk || !shrinking || !widthsOk || !adjacent) continue;
      glyphs.push({
        cx: a.cx,
        topY: a.y,
        bottomY: c.y,
        start: Math.min(a.start, b.start, c.start),
        end: Math.max(a.end, b.end, c.end),
      });
      i += 2;
    }
  }
  return glyphs;
}


/** 접지 글리프 개수. */
export function countGroundGlyphs(svg) {
  return findGroundGlyphs(svg).length;
}

/** 접지 글리프 좌표. */
export function groundGlyphPositions(svg) {
  return findGroundGlyphs(svg).map((g) => ({ cx: g.cx, y: g.topY }));
}
