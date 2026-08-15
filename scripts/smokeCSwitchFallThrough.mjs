// 임용 33번 — switch fall-through + 배열 부분 초기화 (c_switch_fall_through) ★결정론 archetype★
//
// ★ 재검산은 생성기의 out1/out2를 다시 쓰지 않는다 — **지문 C 코드를 파싱해 독립 시뮬레이션**한 뒤
//   생성기가 말한 값과 대조한다(손추적 금지: [[feedback_llm_traced_answers]]).
import {
  __spaces, generateCSwitchFallThrough, matchesCSwitchFallThrough,
} from "../lib/generation/topologies/cSwitchFallThrough.ts";
import {
  detectCSwitchFallThrough, runCSwitchFallThroughPipeline,
} from "../lib/pipeline/runCSwitchFallThroughPipeline.ts";
import {
  hasSwitchFallThrough, fallThroughIsConsequential, findPartialArrays, zeroTailIsDecorative,
} from "../lib/pipeline/runCLanguagePipeline.ts";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: [], tags: [], learningObjective: {} });

console.log("\n[1] 라우팅 — Vision 요약이 약해도 잡힌다");
const POS = [
  ["실측 회차(topic 한 줄)", mk("C언어 switch문 실행 결과", "프로그램의 실행 결과로 옳은 것을 고르는 문제이다.", [])],
  ["산문 요약(코드 없음)", mk("C언어 switch문 실행 결과",
    "배열 score를 선언하고 op 값에 따라 switch문에서 부분 합을 계산해 출력하는 프로그램의 실행 결과를 묻는다.", ["switch문", "배열"])],
  ["fall-through 명시 회차", mk("C언어 프로그램 실행 결과",
    "score[10] 배열을 부분 초기화하고 case 2에서 break가 없어 default로 이어져 두 번 출력한다. switch문 분석.", ["배열"])],
  ["영문 요약", mk("C program output", "The switch statement sums part of the array and printf outputs the result.", [])],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesCSwitchFallThrough(a) === true);
  ok(`안전망: ${n}`, detectCSwitchFallThrough(a) === true);
}

console.log("\n[2] 형제 양보 — C의 다른 문법 축은 generic 경로에 넘긴다");
const NEG = [
  ["포인터·배열 합계", mk("C언어 포인터", "포인터로 배열의 합계를 구하고 sizeof로 크기를 계산하는 프로그램의 출력을 묻는다.")],
  ["재귀 함수", mk("C언어 재귀", "재귀 함수의 호출 순서를 따라 반환값을 구한다. switch문도 일부 쓰인다.")],
  ["구조체", mk("C언어 구조체", "구조체 배열을 순회하며 switch로 분기해 출력한다.")],
  ["비트 연산", mk("C언어 비트 연산", "시프트와 XOR로 값을 바꾼 뒤 switch로 분기해 출력한다.")],
  ["switch 없음", mk("C언어 반복문", "이중 for문으로 배열을 순회해 합을 출력하는 프로그램의 실행 결과를 묻는다.")],
  ["회로 문제", mk("RLC 회로 해석", "스위치를 닫았을 때 전류를 구한다.")],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesCSwitchFallThrough(a) === false);
  ok(`안전망 미발화: ${n}`, detectCSwitchFallThrough(a) === false);
}

console.log("\n[3] 값 공간");
const { SIMILAR_SPACE, VARIANT_SPACE, ORIGINAL, elementsOf, sumFrom } = __spaces;
ok("유사 풀이 충분", SIMILAR_SPACE.length >= 30, `${SIMILAR_SPACE.length}`);
ok("변형 풀이 충분", VARIANT_SPACE.length >= 30, `${VARIANT_SPACE.length}`);
ok("★ 원본 튜플 미생성", [...SIMILAR_SPACE, ...VARIANT_SPACE].every(
  (v) => !(v.size === ORIGINAL.size && v.init.join() === ORIGINAL.init.join()
           && v.startCase2 === ORIGINAL.startCase2 && v.startDefault === ORIGINAL.startDefault)));
ok("유사: default는 0 구간에서 시작(두 출력이 같다)",
  SIMILAR_SPACE.every((v) => v.startDefault >= v.init.length));
ok("변형: default가 초기화 구간까지 거슬러 간다",
  VARIANT_SPACE.every((v) => v.startDefault < v.init.length));
ok("★ case 2는 항상 초기화 구간과 0 구간에 걸친다(0을 실제로 더한다)",
  [...SIMILAR_SPACE, ...VARIANT_SPACE].every((v) => v.startCase2 < v.init.length && v.size > v.init.length));

console.log("\n[4] 원본 재현 — 생성기 로직이 원본 값을 그대로 재현하는가");
{
  const el = elementsOf({ size: 10, init: [1, 2, 3, 4, 5] });
  ok("원본 배열 = 1,2,3,4,5,0,0,0,0,0", el.join() === "1,2,3,4,5,0,0,0,0,0");
  const o1 = sumFrom(el, 3);              // case 2: i=3..9
  const o2 = o1 + sumFrom(el, 5);         // default: i=5..9
  ok("원본 첫 출력 9", o1 === 9, `${o1}`);
  ok("원본 둘째 출력 9 (보기 ④)", o2 === 9, `${o2}`);
}

console.log("\n[5] 생성물 — 지문 코드를 독립 파싱·시뮬레이션해 정답 재검산");
/** 지문 C 코드에서 구조를 되읽어 직접 실행한다 (생성기 값을 쓰지 않는다). */
function simulateFromCode(code) {
  const decl = code.match(/int\s+(\w+)\s*\[\s*(\d+)\s*\]\s*=\s*\{([^}]*)\}/);
  const op = Number((code.match(/op\s*=\s*(\d+)/) ?? [])[1]);
  if (!decl || !Number.isFinite(op)) return null;
  const size = Number(decl[2]);
  const init = decl[3].split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  const arr = Array(size).fill(0);
  init.forEach((v, i) => { arr[i] = v; });
  // 라벨별 for 시작 인덱스를 순서대로 뽑는다.
  const labels = [...code.matchAll(/(case\s+(\d+)\s*:|default\s*:)([\s\S]*?)(?=case\s+\d+\s*:|default\s*:|\n\s*\}\s*\n\s*return)/g)]
    .map((m) => ({
      kind: m[1].startsWith("default") ? "default" : `case${m[2]}`,
      start: Number((m[3].match(/for\(i=(\d+);/) ?? [])[1]),
      hasBreak: /\bbreak\s*;/.test(m[3]),
    }));
  const entry = labels.findIndex((l) => l.kind === `case${op}`);
  if (entry < 0) return null;
  let sum = 0; const outs = [];
  for (let k = entry; k < labels.length; k++) {
    for (let i = labels[k].start; i < size; i++) sum += arr[i];
    outs.push(sum);
    if (labels[k].hasBreak) break;
  }
  return { arr, outs, labels };
}

let checked = 0;
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let s = 0; s < 12; s++) {
    for (let i = 0; i < 2; i++) {
      const g = generateCSwitchFallThrough({ seed: s * 7919, index: i, mode });
      const sim = simulateFromCode(g.code);
      checked++;
      ok(`재검산 파싱 (${mode}/${s}/${i})`, sim !== null);
      if (!sim) continue;
      ok(`배열 일치 (${mode}/${s}/${i})`, sim.arr.join() === g.elements.join(), `${sim.arr} vs ${g.elements}`);
      ok(`출력 2줄 (${mode}/${s}/${i})`, sim.outs.length === 2, JSON.stringify(sim.outs));
      ok(`출력 일치 (${mode}/${s}/${i})`, sim.outs[0] === g.out1 && sim.outs[1] === g.out2,
        `sim=${sim.outs} gen=${g.out1},${g.out2}`);
      // ★ 두 핵심이 구조적으로 보장되는가
      ok(`fall-through 존재 (${mode}/${s}/${i})`, hasSwitchFallThrough(g.code) === true);
      ok(`fall-through 결과 관여 (${mode}/${s}/${i})`, fallThroughIsConsequential(g.code) === true);
      const arrs = findPartialArrays(g.code);
      ok(`부분 초기화 존재 (${mode}/${s}/${i})`, arrs.length === 1);
      ok(`0 구간 실제 사용 (${mode}/${s}/${i})`, arrs.length === 1 && zeroTailIsDecorative(g.code, arrs[0]) === false);
      ok(`흐름 노출 주석 없음 (${mode}/${s}/${i})`, !/fall\s*through|no\s*break|break가?\s*없/i.test(g.code));
      // 모드별 성질
      if (mode === "exam_similar") ok(`유사: 두 출력이 같다 (${s}/${i})`, g.out1 === g.out2, `${g.out1},${g.out2}`);
      else ok(`변형: 두 출력이 다르다 (${s}/${i})`, g.out1 !== g.out2, `${g.out1},${g.out2}`);
    }
  }
}
ok(`생성물 ${checked}개 검사`, checked === 48);

console.log("\n[6] 파이프라인 산출물 — 3단계 서술형");
const probs = [
  ...(await runCSwitchFallThroughPipeline({ analysis: null, mode: "exam_similar", count: 3 })),
  ...(await runCSwitchFallThroughPipeline({ analysis: null, mode: "exam_variant", count: 3 })),
];
ok("6문항 생성", probs.length === 6);
for (const p of probs) {
  ok("발문 3단계", new Set(p.question.match(/\[단계 [123]\]/g) ?? []).size === 3);
  ok("객관식 보기 없음", !/①|②|③|④|⑤/.test(`${p.content}\n${p.question}`));
  ok("figure = code_block 1개",
    (p.figureVariants ?? []).length === 1 && p.figureVariants[0].diagramType === "code_block");
  ok("정답에 두 출력값", (p.answer.match(/출력값은?\s*-?\d+/g) ?? []).length >= 2);
  ok("풀이에 fall-through 설명", /break가 없으므로|fall-through/.test(p.solution));
  ok("풀이에 0 채움 설명", /0으로 채워진다|은 0/.test(p.solution));
}
ok("유사 3문항이 서로 다름", new Set(probs.slice(0, 3).map((p) => p.answer)).size === 3);
ok("변형 3문항이 서로 다름", new Set(probs.slice(3).map((p) => p.answer)).size === 3);

console.log(`\n=== C SWITCH FALL-THROUGH ARCHETYPE: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
