import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
const R=(id)=>({id,type:"R"});
const a={topic:"쌍극성 접합 트랜지스터 회로 해석",interpretation:"스위치와 BJT 2개, 활성 영역, 베이스-이미터 전압으로 단계별 계산",relatedConcepts:["BJT"],fillInTheBlanks:[],
  componentInventory:[{id:"SW",type:"SW"},R("R1"),R("R2"),R("R3"),R("R4"),R("R5"),R("R6"),R("R7"),{id:"Q1",type:"BJT"},{id:"Q2",type:"BJT"}],signals:{inputs:[],outputs:[]}};
for(const subj of ["electronics","circuit_theory"]){const r=classifyCircuitType(a,subj);console.log(`${subj}: ${r.type} ${r.type==="bjt_two_stage_switched"?"✓":"✗"}`);}
// 회귀: 진짜 특성곡선(단일 BJT)은 유지
const cc={topic:"BJT 출력특성곡선",interpretation:"출력특성곡선 여러 개의 I_B, I_C-V_CE 포화 활성 차단 영역",relatedConcepts:[],fillInTheBlanks:[],componentInventory:[{id:"Q1",type:"BJT"}],signals:{inputs:[],outputs:[]}};
console.log("특성곡선 유지:",classifyCircuitType(cc,"electronics").type);
