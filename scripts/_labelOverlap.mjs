// SVG <text> 라벨 bbox 충돌 검사 — 렌더러 라벨 겹침 회귀용 (규칙 #6)
export function findLabelOverlaps(svg, { pad = 1 } = {}) {
  const els = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" text-anchor="(\w+)" font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)]
    .map((m) => {
      const x = Number(m[1]), y = Number(m[2]), anchor = m[3], size = Number(m[4]), str = m[5];
      // 한글/기호는 폭이 크다 — 보수적으로 문자당 0.62em, 한글은 1.0em
      const wUnit = [...str].reduce((s, ch) => s + (/[가-힣]/.test(ch) ? 1.0 : 0.62), 0);
      const wpx = wUnit * size;
      const x0 = anchor === "end" ? x - wpx : anchor === "middle" ? x - wpx / 2 : x;
      return { str, x0: x0 - pad, x1: x0 + wpx + pad, y0: y - size * 0.8 - pad, y1: y + size * 0.25 + pad };
    })
    // 극성 기호(+/−)는 소자 기호 안에 의도적으로 붙여 그리므로 제외
    .filter((e) => e.str.trim().length > 0 && !/^[+\-−±]$/.test(e.str.trim()));
  const hits = [];
  for (let i = 0; i < els.length; i++)
    for (let j = i + 1; j < els.length; j++) {
      const a = els[i], b = els[j];
      if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) hits.push([a.str, b.str]);
    }
  return hits;
}
