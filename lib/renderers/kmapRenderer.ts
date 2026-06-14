import type { KmapDiagram } from "@/types";

export function validateKmap(kmap: KmapDiagram) {
  const errors: string[] = [];
  const expectedRows = 2 ** kmap.rowVars.length;
  const expectedCols = 2 ** kmap.colVars.length;
  const expectedCells = 2 ** kmap.variables.length;

  if (kmap.rows.length !== expectedRows) {
    errors.push(`K-map row 수 오류: ${kmap.rows.length} != ${expectedRows}`);
  }
  for (const row of kmap.rows) {
    if (row.values.length !== expectedCols) {
      errors.push(`K-map col 수 오류: ${row.values.length} != ${expectedCols}`);
    }
  }
  const actualCells = kmap.rows.reduce((s, r) => s + r.values.length, 0);
  if (actualCells !== expectedCells) {
    errors.push(`K-map cell 수 오류: ${actualCells} != ${expectedCells}`);
  }
  return { ok: errors.length === 0, errors };
}

export function renderKmapSVG(kmap: KmapDiagram): string {
  const validation = validateKmap(kmap);
  if (!validation.ok) {
    return `<pre>${escapeSvg(validation.errors.join("\n"))}</pre>`;
  }

  const cellW = 54;
  const cellH = 36;
  const leftW = 56;
  const topH = 30; // 열 헤더(콜 라벨·AB\CD) 밴드 높이
  const titleH = 26; // 제목 밴드 — 헤더와 분리해 겹침 방지

  const width = leftW + kmap.colOrder.length * cellW + 20;
  const height = titleH + topH + kmap.rows.length * cellH + 20;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  // 제목은 grid 좌측(leftW) 위에 좌측 정렬 — 가로 중앙에 두면 열 헤더("01" 등) 바로 위로 와 겹친다.
  svg += `<text x="4" y="17" text-anchor="start" font-size="14" font-weight="bold">${escapeSvg(kmap.title ?? "")}</text>`;
  // 헤더 밴드는 제목 밴드 아래에서 시작
  const headerY = titleH + topH - 10;
  svg += `<text x="${leftW / 2}" y="${headerY}" text-anchor="middle" font-size="12">${escapeSvg(kmap.rowVars.join(""))}\\${escapeSvg(kmap.colVars.join(""))}</text>`;

  kmap.colOrder.forEach((col, i) => {
    svg += `<text x="${leftW + i * cellW + cellW / 2}" y="${headerY}" text-anchor="middle" font-size="12">${escapeSvg(col)}</text>`;
  });

  kmap.rows.forEach((row, r) => {
    const y = titleH + topH + r * cellH;
    svg += `<text x="${leftW / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" font-size="12">${escapeSvg(row.label)}</text>`;
    row.values.forEach((v, c) => {
      const x = leftW + c * cellW;
      svg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="white" stroke="black" stroke-width="1"/>`;
      svg += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 5}" text-anchor="middle" font-size="14">${v}</text>`;
    });
  });

  svg += `</svg>`;
  return svg;
}

function escapeSvg(v: unknown): string {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
