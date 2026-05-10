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
  const topH = 36;

  const width = leftW + kmap.colOrder.length * cellW + 20;
  const height = topH + kmap.rows.length * cellH + 50;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<text x="${width / 2}" y="18" text-anchor="middle" font-size="14">${escapeSvg(kmap.title ?? "")}</text>`;
  svg += `<text x="${leftW / 2}" y="${topH - 10}" text-anchor="middle" font-size="12">${escapeSvg(kmap.rowVars.join(""))}\\${escapeSvg(kmap.colVars.join(""))}</text>`;

  kmap.colOrder.forEach((col, i) => {
    svg += `<text x="${leftW + i * cellW + cellW / 2}" y="${topH - 10}" text-anchor="middle" font-size="12">${escapeSvg(col)}</text>`;
  });

  kmap.rows.forEach((row, r) => {
    const y = topH + r * cellH;
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
