import { classifyElectromagnetics } from "@/lib/analysis/classifyElectromagnetics";
import { generateElectromagnetics } from "@/lib/generation/topologies/electromagnetics";
import { renderEmFieldDiagram } from "@/lib/renderers/emFieldRenderer";
import type { AnalysisResult } from "@/types";

function mk(topic: string, interp: string, concepts: string[], topicKey: string): AnalysisResult {
  return { subject: "electromagnetics", subjectKey: "electromagnetics", topic, interpretation: interp, relatedConcepts: concepts, topicKey, fillInTheBlanks: [] } as unknown as AnalysisResult;
}

// ── 분류 회귀: 각 원본 유사 텍스트가 올바른 항목으로, 서로 가로채지 않아야. ──
const cases: Array<{ name: string; a: AnalysisResult; want: string }> = [
  {
    name: "전기력선 flux(임용11-A)",
    a: mk(
      "전계 속 평면을 통과하는 전기력선의 총수와 전위차",
      "전계 E=8(y−L)a_y + 4z a_z 가 주어지고, zx평면 면적 10 m² 평면 S와 세 점 P·Q·R 전위차 V_RP·V_QR·V_QP를 구한 뒤, 평면 S를 통과하는 전기력선의 총수가 24를 만족하는 L을 구한다.",
      ["전위차", "전기력선의 총수", "선적분"], "electrostatics",
    ),
    want: "field_potential_flux",
  },
  {
    name: "두 유전체 커패시터(임용11-B)",
    a: mk(
      "두 유전체가 채워진 평판 커패시터의 정전용량",
      "면적 A인 두 평판 도체 사이 간격 d에 서로 다른 유전체 2개(ⓐ ε_a, ⓑ ε_b)가 채워짐. 부피비 1:2. 표면전하밀도 비 ρ_a/ρ_b와 전계, 전위차 V_d, 정전용량 C_d를 구한다.",
      ["표면전하밀도", "정전용량", "유전율", "전위차"], "capacitance",
    ),
    want: "dielectric_two_region_cap",
  },
  {
    name: "단일 평행판(회귀 — 두유전체로 안 새야)",
    a: mk("평행판 커패시터의 정전용량", "극판 넓이와 간격, 비유전율이 주어진 평행판 커패시터의 정전용량 C=εA/d를 구한다.", ["정전용량", "유전율"], "capacitance"),
    want: "parallel_plate_cap",
  },
  {
    name: "전위함수→전하밀도(회귀)",
    a: mk("전위 함수로부터 체적 전하 밀도", "전위 V(x,y,z)=½x²yz 가 주어지고 점 P에서 체적 전하 밀도 ρ_v=−ε₀∇²V 를 구한다. 라플라시안.", ["체적 전하 밀도", "라플라시안"], "gauss_law"),
    want: "potential_to_charge_density",
  },
];

let ok = true;
for (const c of cases) {
  const got = classifyElectromagnetics(c.a);
  const pass = got === c.want;
  ok = ok && pass;
  console.log(`${pass ? "✓" : "❌"} ${c.name} → ${got}${pass ? "" : `  (want ${c.want})`}`);
}
if (!ok) { console.error("\n❌ 분류 회귀 실패"); process.exit(1); }

// ── 생성·렌더 (두 신규 항목) ──
for (const entryId of ["field_potential_flux", "dielectric_two_region_cap"]) {
  for (const mode of ["exam_similar", "exam_variant"] as const) {
    console.log(`\n===== ${entryId} / ${mode} =====`);
    for (let i = 0; i < 2; i++) {
      const inst = generateElectromagnetics({ seed: 200 + i * 11, mode, entryId });
      console.log(`[#${i}] A:`, inst.answer.replace(/\n/g, " | "));
      const svg = renderEmFieldDiagram(inst.diagram!);
      const bad = svg.includes("<pre>") || svg.includes("미지원") || svg.includes("비어있음");
      console.log("     SVG:", svg.length, bad ? "❌ BAD" : "✓", "geom:", inst.diagram!.geometry);
      if (bad) process.exit(1);
    }
  }
}
console.log("\n✅ 모든 스모크 통과");
