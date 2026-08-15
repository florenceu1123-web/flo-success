// 다이오드 클램퍼 → 출력 파형 상·하한 a·b (임용 2번 전자회로) — API 없음
//   실측 신고: generic 경로가 **다이오드를 통째로 떨어뜨리고**(C·V·R만) 파형도 단일 스텝으로 냈다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeDiodeClamper.mjs
import { detectDiodeClamper } from "../lib/pipeline/runDiodeClamperPipeline.ts";
import { generateDiodeClamper, __originalDiodeClamperForVerify, __diodeClamperPoolSizes } from "../lib/generation/topologies/diodeClamper.ts";
import { renderDiodeClamperCircuit, renderDiodeClamperWaveform } from "../lib/renderers/diodeClamperCircuitRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";
const inv = (...s) => s.map((x,i)=>{const [type,value]=x.split("="); return {id:`c${i}`,type,...(value?{value}:{})};});
const mk = (topic, interpretation, concepts=[], inventory=[]) => ({topic,interpretation,relatedConcepts:concepts,fillInTheBlanks:[],componentInventory:inventory});
let pass=0, fail=0;
const ok=(n,c,e="")=>{if(c){pass++;console.log(`  ✅ ${n}`);}else{fail++;console.log(`  ❌ ${n} ${e}`);}};
const expect=(n,a,w)=>ok(`${n} → ${detectDiodeClamper(a)?"발화":"양보"}`, detectDiodeClamper(a)===w);
const INV = inv("C=1µF","D","V=5V","R=100kΩ");

console.log("\n[1] 이 원본 — 감지");
expect("실측형 요약", mk("다이오드 응용 회로","다이오드를 이용한 응용 회로에서 입력 전압 v_i와 출력 전압 v_o의 파형이 주어질 때 출력 파형의 a와 b의 값을 구한다.",["다이오드","커패시터","파형"],INV), true);
expect("★실측 3회차: '정류·평활' 서술 + 'a와 b의 값'", mk("다이오드 응용 회로 분석","이 회로는 다이오드를 이용한 정류 회로로, 커패시터는 전압을 평활화하는 역할을 하며 저항은 부하로 작용합니다. 주어진 입력 전압에 따라 출력 전압의 파형을 분석하여 a와 b의 값을 구하는 것이 목표입니다.",["다이오드 정류","평활 회로","전압 파형 분석"],INV), true);
expect("★실측 2회차: '전압 클리핑' 태그 + '특정 시점의 값'", mk("다이오드 응용 회로 분석","이 문제는 다이오드를 이용한 응용 회로에서 입력 전압이 주어졌을 때 출력 전압의 파형을 분석하는 문제입니다. 주어진 파형에서 특정 시점의 전압 값을 구하는 것이 목표입니다.",["다이오드 특성","RC 회로","정류 회로","전압 클리핑"],INV), true);
expect("'클램퍼' 명시", mk("클램퍼 회로","커패시터와 다이오드로 구성된 클램퍼 회로의 출력 파형을 구한다.",["클램퍼"],INV), true);

console.log("\n[2] 형제 양보");
expect("제너 정전압", mk("제너 레귤레이터","제너 다이오드와 커패시터를 포함한 정전압 회로에서 출력 전압을 구한다.",["제너"],INV), false);
expect("정류 회로", mk("반파 정류","다이오드와 커패시터로 구성된 정류 회로의 리플 전압을 구한다.",["정류","평활"],INV), false);
expect("커패시터 없음", mk("다이오드 클리퍼","다이오드로 파형을 자르는 회로",["다이오드"], inv("D","V=5V","R=1kΩ")), false);

console.log("\n[3] 물리 — 원본 값 재현 + 생성물 재검산");
{
  const o = __originalDiodeClamperForVerify().answer;
  ok("원본 a = −5V", o.a === -5, `→ ${o.a}`);
  ok("원본 b = −20V", o.b === -20, `→ ${o.b}`);
  ok("원본 V_C = 15V", o.vC === 15, `→ ${o.vC}`);
  ok("원본 RC = 100ms ≫ 2ms", o.tauMs === 100);
  const p = __diodeClamperPoolSizes();
  ok(`생성 풀 (상한 ${p.down} · 하한 ${p.up})`, p.down >= 30 && p.up >= 30);
}
for (const mode of ["exam_similar","exam_variant"]) {
  let bad=0, checked=0;
  for (let seed=1; seed<=12; seed++) {
    const g = generateDiodeClamper({seed, mode});
    const v=g.values, a=g.answer;
    // 독립 재검산: 진폭 보존 + 클램프 레벨 = 바이어스
    if (a.a - a.b !== v.vH - v.vL) { bad++; console.log(`    ❌ ${mode}#${seed} 진폭 불일치`); continue; }
    const clamp = mode === "exam_variant" ? a.b : a.a;
    if (clamp !== v.vB) { bad++; console.log(`    ❌ ${mode}#${seed} 클램프 레벨 ${clamp} ≠ ${v.vB}`); continue; }
    if (a.vC !== v.vH - a.a) { bad++; console.log(`    ❌ ${mode}#${seed} V_C`); continue; }
    if (a.tauMs < 20 * 2 * v.halfMs) { bad++; console.log(`    ❌ ${mode}#${seed} RC 부족`); continue; }
    if (v.dir !== (mode === "exam_variant" ? "up" : "down")) { bad++; console.log(`    ❌ ${mode}#${seed} 다이오드 방향`); continue; }
    checked++;
  }
  ok(`${mode} 12개 재검산 (통과 ${checked})`, bad===0 && checked===12);
}
{
  let leaked=0;
  for (let seed=1; seed<=40; seed++) { const v=generateDiodeClamper({seed,mode:"exam_similar"}).values;
    if (v.vH===10&&v.vL===-5&&v.vB===-5&&v.cUf===1&&v.rKohm===100&&v.halfMs===1) leaked++; }
  ok("원본 튜플 미생성", leaked===0, `→ ${leaked}건`);
}

console.log("\n[4] 렌더 — (가) 다이오드·커패시터·전지·R / (나) 2단 파형");
{
  const g = generateDiodeClamper({seed:3, mode:"exam_similar"});
  const c = renderDiodeClamperCircuit(g.circuitDiagram);
  const wv = renderDiodeClamperWaveform(g.waveformDiagram);
  ok("(가) SVG 생성", c.startsWith("<svg") && !c.includes("<pre>"));
  ok("★ 다이오드 삼각형 존재", (c.match(/<path d="M[^"]*Z"/g)??[]).length >= 1);
  ok("(가) 소자 값 3종", c.includes(g.circuitDiagram.cLabel) && c.includes(g.circuitDiagram.rLabel) && c.includes(g.circuitDiagram.biasLabel));
  ok("(가) v_i·v_o 단자", c.includes("v_i") && c.includes("v_o"));
  ok("(나) SVG 생성", wv.startsWith("<svg") && !wv.includes("<pre>"));
  ok("(나) 입력 수치 + 출력 a·b 라벨", wv.includes(String(g.values.vH)) && wv.includes(">a<") && wv.includes(">b<"));
  ok("(나) 파형 polyline 2개", (wv.match(/<polyline/g)??[]).length === 2);
  const ptsCount = (wv.match(/points="([^"]*)"/g)??[]).map(p=>p.split(' ').length);
  ok("(나) 정현파(구형파 아님 — 샘플 다수)", ptsCount.every(n=>n>20), JSON.stringify(ptsCount));
  let ov = 0;
  for (const m of ["exam_similar","exam_variant"]) for (let sd=1; sd<=10; sd++) {
    const gg = generateDiodeClamper({seed:sd, mode:m});
    if (findLabelOverlaps(renderDiodeClamperCircuit(gg.circuitDiagram)).length) ov++;
    if (findLabelOverlaps(renderDiodeClamperWaveform(gg.waveformDiagram)).length) ov++;
  }
  ok("라벨 겹침 0 (20 케이스)", ov === 0, `→ 건`);
}
console.log(`\n=== ${pass}/${pass+fail} 통과 ===`);
process.exit(fail===0?0:1);
