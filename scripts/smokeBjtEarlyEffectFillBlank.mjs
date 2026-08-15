// 임용 27번 전자회로 — npn BJT Early 효과 개념 빈칸 채우기 (bjt_early_effect_fill_blank)
//   (가) 단면도 + (나) 특성곡선 2-figure. 원본 객관식(정답 ② ㄱ·ㄴ·ㅁ)을 빈칸형으로 바꾼 유형.
//
// ★ 이 유형의 최대 위험은 **문항이 스스로 답을 알려주는 것**이다 — 두 방향 모두 단언한다.
//   (1) 보기 문장·발문·조건에 다른 빈칸의 정답 문자열이 섞이지 않을 것
//   (2) (나) 그림의 r_o 주석이 그 문항의 정답이면 빈칸 기호로 바뀌어 있을 것
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import {
  __spaces, generateBjtEarlyEffectFillBlank, matchesBjtEarlyEffectFillBlank, RO_FORMULA_NOTE,
} from "../lib/generation/topologies/bjtEarlyEffectFillBlank.ts";
import {
  detectBjtEarlyEffectFillBlank, runBjtEarlyEffectFillBlankPipeline,
} from "../lib/pipeline/runBjtEarlyEffectFillBlankPipeline.ts";
import { renderBjtEarlyStructureSVG, renderBjtEarlyCurveSVG } from "../lib/renderers/bjtEarlyEffectRenderer.ts";
import { findLabelOverlaps } from "./_labelOverlap.mjs";

let pass = 0, fail = 0;
const ok = (n, c, e = "") => { if (c) pass++; else { fail++; console.log(`  ✗ ${n}${e ? ` — ${e}` : ""}`); } };
const mk = (t, i, c = [], inv = []) => ({ topic: t, interpretation: i, relatedConcepts: c, fillInTheBlanks: [], componentInventory: inv, tags: [], learningObjective: {} });
const inv = (...xs) => xs.map((s, i) => { const [type, value] = s.split(":"); return { id: `c${i}`, type, ...(value ? { value } : {}) }; });

console.log("\n[1] 라우팅 — 원본 요약이 흔들려도 잡힌다");
const POS = [
  ["실측형 요약(전문)", mk(
    "npn BJT 공통 이미터 접속의 Early 효과",
    "그림 (가)는 npn 쌍극성 접합 트랜지스터의 공통 이미터 접속에서 CBJ 공핍층이 넓어져 유효 베이스폭이 줄어드는 것을, (나)는 활성영역 특성곡선을 왼쪽으로 연장한 −V_A와 동적출력저항 r_o를 나타낸다. Punch Through와 베이스 내 소수캐리어 농도 기울기에 대한 설명으로 옳은 것을 고르는 문제이다.",
    ["Early 효과", "베이스폭 변조"], inv("BJT"))],
  ["Early를 흘리고 베이스폭 변조만", mk(
    "BJT 활성영역의 베이스폭 변조",
    "공통 이미터 접속 트랜지스터에서 V_CE가 커질 때 공핍층이 베이스로 확장되어 유효 베이스폭이 줄고 소수캐리어 농도 기울기가 변한다.",
    [], inv("BJT"))],
  ["Punch Through 중심 요약", mk(
    "쌍극성 접합 트랜지스터의 Punch Through",
    "npn 트랜지스터에서 공핍층이 베이스를 가로질러 맞닿는 현상과 동적출력저항 r_o의 관계를 설명한다.",
    [], inv("BJT"))],
  ["영문 요약", mk(
    "Early effect in npn BJT",
    "The common-emitter output characteristics show a finite slope; the base-width modulation reduces the effective base width W_B as V_CE increases.",
    [], inv("BJT"))],
];
for (const [n, a] of POS) {
  ok(`감지: ${n}`, matchesBjtEarlyEffectFillBlank(a) === true);
  ok(`안전망: ${n}`, detectBjtEarlyEffectFillBlank(a) === true);
  // ★ 과목 무관 0-PRE — Vision이 과목을 어디로 잡아도 같은 유형이어야 한다.
  for (const s of ["electronics", "circuit_theory", "mixed_signal"]) {
    ok(`분류 ${s}: ${n}`, classifyCircuitType({ ...a, subjectKey: s }, s)?.type === "bjt_early_effect_fill_blank");
  }
}

console.log("\n[2] 형제 양보 — BJT 계산·설계 유형을 뺏지 않는다");
const NEG = [
  ["bjt_characteristic_curve (영역 식별)", mk("BJT 출력특성곡선의 동작 영역",
    "그림의 특성곡선에서 ㉠과 ㉡이 가리키는 동작 영역의 이름을 쓰고 스위치 상태를 설명한다.", [], inv("BJT"))],
  ["bjt_bias (바이어스 계산)", mk("BJT 직류 바이어스",
    "V_BE=0.7V로 두고 베이스 분압 저항과 이미터 저항으로 동작점 I_C와 V_CE를 구하시오.", [], inv("BJT", "R:10k"))],
  ["bjt_thevenin_bias", mk("BJT 베이스망 테브난 등가",
    "점선 부분을 테브난 등가로 바꾸어 R_T와 V_T를 구하고 I_B를 계산한다.", [], inv("BJT", "R:1k"))],
  ["zener_bjt_regulator", mk("제너 다이오드 + BJT 정전압 회로",
    "제너 전압과 V_BE로 출력 전압을 구하고 부하 전류를 계산하시오.", [], inv("BJT", "D:5V"))],
  ["bjt_switch_logic_gate", mk("BJT 스위치와 논리게이트",
    "입력이 H일 때와 L일 때의 출력을 진리표로 나타내고 동일 동작 논리게이트를 그리시오.", [], inv("BJT"))],
  ["소신호 등가 (증폭기)", mk("BJT 소신호 증폭기",
    "hybrid-π 소신호 등가회로에서 전압 이득을 구하시오.", [], inv("BJT"))],
  ["MOSFET 핀치오프", mk("MOSFET 출력특성곡선",
    "포화 시작점 궤적의 관계식을 세우고 채널 상태를 설명한다.", [], inv("MOSFET"))],
];
for (const [n, a] of NEG) {
  ok(`양보: ${n}`, matchesBjtEarlyEffectFillBlank(a) === false);
  ok(`안전망 미발화: ${n}`, detectBjtEarlyEffectFillBlank(a) === false);
}

console.log("\n[3] substring 함정 — 'early'가 영문 낱말에 걸리지 않는다");
// CLAUDE.md의 "비정현파 ⊃ 정현파"·"개루프 이득 ⊃ 루프 이득"과 같은 함정.
const TRAP = [
  ["nearly", mk("BJT amplifier", "The collector current is nearly constant across the operating range.", [], inv("BJT"))],
  ["clearly", mk("BJT circuit", "The waveform clearly shows the saturation region of the transistor.", [], inv("BJT"))],
];
for (const [n, a] of TRAP) ok(`오탐 없음: ${n}`, matchesBjtEarlyEffectFillBlank(a) === false);

console.log("\n[4] 값 공간");
const { SPACE, SIMILAR_SPACE, VARIANT_SPACE, GROUPED_FACTS } = __spaces;
ok("그룹 5개 = 원본 보기 ㄱ~ㅁ 5항목", GROUPED_FACTS.length === 5);
ok("전 조합 = 그룹 크기의 곱", SPACE.length === GROUPED_FACTS.reduce((p, g) => p * g.length, 1));
ok("유사·변형 풀 비중첩", (() => {
  const key = (v) => v.picks.join(",");
  const s = new Set(SIMILAR_SPACE.map(key));
  return VARIANT_SPACE.every((v) => !s.has(key(v)));
})());
ok("풀이 충분히 크다(≥ 12)", SPACE.length >= 12, `${SPACE.length}`);
// ★ 원본의 5개 지식 축이 표에 모두 들어 있는지 — 구조·원리 유지(절대규칙 0)
const allText = GROUPED_FACTS.flat().map((f) => `${f.sentence} ${f.answer} ${f.why}`).join(" ");
for (const [n, re] of [
  ["Early 전압", /Early/], ["유효 베이스폭", /유효 베이스폭|W_B\^\{?eff/],
  ["소수캐리어 기울기", /소수캐리어/], ["동적출력저항", /r_o/], ["Punch Through", /Punch Through/],
]) ok(`원본 지식 축 존재: ${n}`, re.test(allText));

console.log("\n[5] 생성물 — 빈칸·정답 구조");
const MARKS = ["㉠", "㉡", "㉢", "㉣", "㉤"];
const gens = [];
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let s = 0; s < 12; s++) {
    for (let i = 0; i < 2; i++) gens.push(generateBjtEarlyEffectFillBlank({ seed: s * 7919, index: i, mode }));
  }
}
ok(`생성물 ${gens.length}개`, gens.length === 48);
let structOk = 0, exposeBad = [], maskBad = 0;
for (const g of gens) {
  if (g.items.length === 5 && g.answers.length === 5 &&
      g.answers.every((a, k) => a.mark === MARKS[k]) &&
      g.items.every((it, k) => it.includes(`( ${MARKS[k]} )`))) structOk++;

  // ★★ 정답 노출 검사 — 어떤 보기 문장도 **다른** 빈칸의 정답을 담으면 안 된다.
  const body = g.items.join("\n");
  for (const a of g.answers) {
    // 정답의 핵심 토큰(괄호 앞부분)만 본다 — "Early(얼리)" → "Early"
    const core = a.value.replace(/\\\(|\\\)/g, "").split("(")[0].trim();
    // "0"·"∞"·"1/" 같은 짧은 조각은 노출 신호가 되지 못한다(수식 답의 앞머리) — 제외.
    if (core.length < 3) continue;
    const own = g.items[MARKS.indexOf(a.mark)];
    const others = body.replace(own, "");
    if (others.includes(core)) exposeBad.push(`${a.mark}:${core}`);
  }
  // ★ r_o 공식이 정답이면 그림 주석이 빈칸 기호로 바뀌어야 한다.
  const roIsAnswer = g.answers.some((a) => a.value.includes("dI_C/dV_{CE}"));
  if (roIsAnswer && g.roNote === RO_FORMULA_NOTE) maskBad++;
  if (!roIsAnswer && g.roNote !== RO_FORMULA_NOTE) maskBad++;
}
ok("보기 5항목 + ㉠~㉤ 대응", structOk === gens.length, `${structOk}/${gens.length}`);
ok("정답이 다른 보기 문장에 노출되지 않음", exposeBad.length === 0, exposeBad.slice(0, 4).join(" / "));
ok("(나) r_o 주석 마스킹 정확", maskBad === 0, `어긋남 ${maskBad}건`);

console.log("\n[6] 파이프라인 산출물");
const probs = [
  ...(await runBjtEarlyEffectFillBlankPipeline({ analysis: null, mode: "exam_similar", count: 3 })),
  ...(await runBjtEarlyEffectFillBlankPipeline({ analysis: null, mode: "exam_variant", count: 3 })),
];
ok("6문항 생성", probs.length === 6);
for (const p of probs) {
  const all = `${p.content}\n${(p.conditions ?? []).join("\n")}\n${p.question}`;
  ok("발문에 빈칸 기호 5개(3단계 계약의 빈칸형 충족)", new Set(p.question.match(/[㉠-㉪]/g) ?? []).size === 5);
  ok("발문에 '들어갈/알맞은' 문구", /빈칸|채우|들어갈|알맞은/.test(p.question));
  // ★★ 발문·조건에 "Early"가 없어야 한다 — 그 말 자체가 ㉠의 정답인 문항이 있다.
  ok("발문·조건에 Early 미노출", !/Early|얼리/i.test(all));
  ok("객관식 보기 없음", !/①|②|③|④|⑤/.test(all));
  ok("정답 5줄", (p.answer.match(/[㉠-㉤]\s*:/g) ?? []).length === 5);
  ok("figure 2개", (p.figureVariants ?? []).length === 2);
  ok("figure 종류", (p.figureVariants ?? []).map((f) => f.diagramType).join(",") === "bjt_early_structure,bjt_early_curve");
  // 그림이 정답을 노출하지 않는가 (r_o 주석)
  const curve = (p.figureVariants ?? [])[1];
  const roAnswerHere = /dI_C\/dV_\{CE\}/.test(p.answer);
  ok("그림 r_o 주석이 정답을 노출하지 않음", !(roAnswerHere && curve.diagram.roNote === RO_FORMULA_NOTE));
}
// 한 배치 안에서 문항이 서로 달라야 한다
ok("유사 3문항이 서로 다름", new Set(probs.slice(0, 3).map((p) => p.answer)).size === 3);
ok("변형 3문항이 서로 다름", new Set(probs.slice(3).map((p) => p.answer)).size === 3);

console.log("\n[7] 렌더");
const sSvg = renderBjtEarlyStructureSVG({ caption: "(가)" });
ok("(가) SVG", sSvg.startsWith("<svg") && sSvg.includes("</svg>"));
for (const t of ["Collector 영역", "Base 영역", "Emitter 영역", "CBJ 공핍층", "EBJ 공핍층", "W_B^eff", "W_B"]) {
  ok(`(가) 라벨: ${t}`, sSvg.includes(t));
}
ok("(가) 접지 기호 1개", (sSvg.match(/M0,0 L10,5 L0,10/g) ?? []).length >= 1);
ok("(가) 라벨 겹침 0", findLabelOverlaps(sSvg).length === 0, JSON.stringify(findLabelOverlaps(sSvg).slice(0, 3)));

const cSvg = renderBjtEarlyCurveSVG({ roNote: RO_FORMULA_NOTE, caption: "(나)" });
ok("(나) SVG", cSvg.startsWith("<svg") && cSvg.includes("</svg>"));
for (const t of ["−V_A", "포화영역", "활성영역", "V_CE", "I_C", "ΔI_C", "ΔV_CE"]) {
  ok(`(나) 라벨: ${t}`, cSvg.includes(t));
}
ok("(나) 외삽 점선 존재", /stroke-dasharray="7 5"/.test(cSvg));
ok("(나) r_o 주석 표시", cSvg.includes(RO_FORMULA_NOTE));
const cMasked = renderBjtEarlyCurveSVG({ roNote: "r_o = ( ㉣ )" });
ok("(나) 마스킹되면 공식 미표시", !cMasked.includes("dI_C/dV_CE") && cMasked.includes("r_o = ( ㉣ )"));
ok("(나) 라벨 겹침 0", findLabelOverlaps(cSvg).length === 0, JSON.stringify(findLabelOverlaps(cSvg).slice(0, 3)));

console.log(`\n=== BJT EARLY EFFECT FILL-BLANK: ${pass} pass / ${fail} fail ===`);
process.exit(fail === 0 ? 0 : 1);
