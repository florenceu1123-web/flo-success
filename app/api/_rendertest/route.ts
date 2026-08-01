// 임시 렌더 검증 라우트 — netlist JSON → analogMeshRenderer SVG 문자열. 검증 후 삭제.
import { NextRequest, NextResponse } from "next/server";
import { renderAnalogMeshSVG } from "@/lib/renderers/analogMeshRenderer";
import type { CircuitNetlist } from "@/types";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { diagram?: CircuitNetlist };
  const svg = renderAnalogMeshSVG((body.diagram ?? {}) as CircuitNetlist);
  return new NextResponse(svg, { headers: { "content-type": "image/svg+xml" } });
}
