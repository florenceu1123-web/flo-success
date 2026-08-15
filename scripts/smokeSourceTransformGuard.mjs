// detectSourceTransformRatio 근거 강화 회귀 — 진짜 전원변환 원본은 계속 잡고, 일반 V·I DC는 양보
import { detectSourceTransformRatio } from "../lib/pipeline/runSourceTransformRatioPipeline.ts";
const ann = (...labels) => labels.map((l,i)=>({node:`n${i}`, label:l}));
const cases = [
  ["임용 7번 원본(전원변환 명시 + 전압비)", {topic:"전원변환과 전압비", interpretation:"그림 (가)의 전류원 부분을 전원변환하여 (나)로 바꾸고, 전압비 V_1:V_2:V_3 = 3:2:1을 이용해 R_3를 구한다.", relatedConcepts:["전원변환","전압비"], fillInTheBlanks:[], nodeAnnotations:ann("V_1","V_2","V_3")}, true],
  ["전원변환 명시 + 비율 숫자 누락(라벨만)", {topic:"전원변환 회로", interpretation:"전류원 부분을 전원 변환하여 등가 전압원으로 바꾼 뒤 각 저항의 전압을 구한다.", relatedConcepts:["전원변환"], fillInTheBlanks:[], nodeAnnotations:ann("V_1","V_2","V_3")}, true],
  ["★신고: 일반 V·I DC 전류 문제(전원변환·전압비 없음)", {topic:"저항 회로의 전류 계산", interpretation:"이 회로는 전압원과 전류원이 포함된 저항 회로로, 저항 4kΩ에 흐르는 전류 I1과 저항 3kΩ에 흐르는 전류 I2를 구하는 문제입니다.", relatedConcepts:["키르히호프의 전압 법칙","메시 해석"], fillInTheBlanks:[], nodeAnnotations:ann("V_1","V_2")}, false],
  ["일반 V·I DC + 전압비 명시 → 인정", {topic:"저항 회로", interpretation:"전압원과 전류원이 있는 회로에서 전압비 V_1:V_2:V_3 = 2:2:1을 만족하는 저항을 구한다.", relatedConcepts:[], fillInTheBlanks:[], nodeAnnotations:[]}, true],
];
let ok=0, ng=0;
for (const [name, a, want] of cases) {
  const got = detectSourceTransformRatio(a);
  const hit = (got !== null) === want;
  console.log(`${hit?"✅":"❌"} ${name} → ${got ? got.join(":") : "null"} (기대 ${want?"발화":"양보"})`);
  hit ? ok++ : ng++;
}
console.log(`\n${ok}/${ok+ng} 통과`);
process.exit(ng===0?0:1);
