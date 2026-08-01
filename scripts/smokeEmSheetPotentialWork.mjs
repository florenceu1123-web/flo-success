import { classifyElectromagnetics } from "../lib/analysis/classifyElectromagnetics.ts";
const cases=[
  {n:"이 문제(D+전위차+등전위+일)", a:{topic:"무한 면전하",interpretation:"z=0 무한평면 면전하밀도 전속 밀도 D 점 B와 점 A의 전위차 V_BA 등전위가 되기 위한 z=n 점전하 이동시키는 데 필요한 일",relatedConcepts:[]}, exp:"sheet_charge_potential_work"},
  {n:"기본 면전하(E만)", a:{topic:"무한 대전 평면",interpretation:"무한히 넓은 평면 면전하밀도 σ 근처 전기장 E 가우스 법칙",relatedConcepts:[]}, exp:"charged_sheet_field"},
  {n:"전기력선 flux(entry17)", a:{topic:"전계 평면 전기력선",interpretation:"전계 E 주어짐 평면 S 통과하는 전기력선의 총수 전위차 V_QP 미지 L",relatedConcepts:[]}, exp:"field_potential_flux"},
];
let bad=0;
for(const c of cases){const r=classifyElectromagnetics(c.a);const ok=r===c.exp;if(!ok)bad++;console.log(`${ok?"PASS":"FAIL"} ${c.n}: ${r} (exp ${c.exp})`);}
process.exit(bad?1:0);
