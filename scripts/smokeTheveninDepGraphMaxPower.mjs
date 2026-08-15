/**
 * 임용 9번 회로이론 — 종속전원 + V-I 그래프 → 미지 R → I_SC → 최대전력 전용 archetype 스모크. API 없음.
 *
 * 실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeTheveninDepGraphMaxPower.mjs
 *
 * 검증 축:
 *  [1] 라우팅 — 실측 요약(그래프 낱말이 빠진 회차 포함) + 표현 변형
 *  [2] 형제 양보 — 교류 테브난·스위치 과도·OPAMP·브리지
 *  [3] 원본 물리 — 손검산과 일치 (R=1, V_TH=1, I_SC=3/8, R_TH=8/3, P=3/32)
 *  [4] 생성물 재검산 — **archetype 공식이 아니라 회로를 직접 푸는 독립 solver**로 교차검증
 *  [5] 값 품질 — 원본 튜플 미생성 · 유사/변형 풀 비중첩 · 소수 표기 0
 *  [6] 렌더 — 점선 박스·계기·다이아몬드·i_x·미지 R("R") 표기
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import {
  buildTdgSpace, generateTheveninDepGraph, qNum, qTex, solveTdg,
} from "@/lib/generation/topologies/theveninDepGraphMaxPower";
import { detectTheveninDepGraph, runTheveninDepGraphMaxPowerPipeline } from "@/lib/pipeline/runTheveninDepGraphMaxPowerPipeline";
import { renderTheveninDepGraphCircuit } from "@/lib/renderers/theveninDepGraphCircuitRenderer";

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`); }
};
const A = (o) => ({ topic: "", interpretation: "", relatedConcepts: [], componentInventory: [], ...o });
const SYM_INV = [
  { type: "V", value: "9V" }, { type: "R", value: "5Ω" }, { type: "CCVS", value: "2i_x" },
  { type: "R", value: "1Ω" }, { type: "R", value: "R" }, { type: "R", value: "2Ω" },
];

console.log("[1] 라우팅 — 실측 요약과 표현 변형");
const POSITIVE = [
  ["실측 요약(그래프 언급 있음)", A({
    topic: "테브난 등가 회로와 최대 전력 전달",
    interpretation: "주어진 회로에서 테브난 등가 회로를 구하고, 부하 저항 R_L에 최대 전력이 전달될 때의 조건을 분석하는 문제입니다. 그림 (가)의 회로를 테브난 등가 회로로 변환한 후, 그림 (나)의 그래프를 통해 부하 저항에 따른 전류와 전압을 분석합니다.",
    componentInventory: SYM_INV,
  })],
  ["★신고 회차 — 그래프·(나)·I_sc 낱말이 전부 없음", A({
    topic: "테브난 등가 회로",
    interpretation: "종속 전원이 포함된 회로의 테브난 등가 회로를 구하고 부하에 최대 전력이 전달되는 조건을 분석한다.",
    componentInventory: SYM_INV,
  })],
  ["단락 전류 표현", A({
    topic: "종속전원 회로 해석",
    interpretation: "제어 전류 i_x에 의한 종속 전압원이 있는 회로의 테브난 등가를 구하고 단락 전류 I_sc를 구한다.",
  })],
  ["영문 혼용", A({
    topic: "Thevenin equivalent with dependent source",
    interpretation: "Find the thevenin equivalent and the maximum power delivered to the load using the V-I graph.",
  })],
];
for (const [name, an] of POSITIVE) check(`감지 — ${name}`, detectTheveninDepGraph(an));
for (const subj of ["circuit_theory", "electronics", "mixed_signal"]) {
  const r = classifyCircuitType(POSITIVE[1][1], subj);
  check(`분류(${subj}) → thevenin_dep_graph_max_power`, r.type === "thevenin_dep_graph_max_power", r.type);
}

console.log("[2] 형제 양보");
const NEGATIVE = [
  ["교류 종속전원 테브난(임용 6번)", A({
    topic: "종속전원 페이저 회로의 테브난 등가",
    interpretation: "페이저 회로에서 종속 전압원을 포함한 테브난 등가 임피던스를 구하고 복소 켤레 정합으로 최대 전력을 구한다.",
  })],
  ["스위치 RL 과도 + 종속전원", A({
    topic: "스위치가 있는 RL 회로의 과도 응답",
    interpretation: "t = 0에 스위치가 닫힐 때 종속 전류원이 포함된 RL 회로의 시정수와 i_L(t)를 구한다.",
  })],
  ["OPAMP 테브난", A({
    topic: "연산 증폭기 응용 회로",
    interpretation: "연산 증폭기의 출력 저항을 테브난 등가로 보고 최대 전력 전달을 분석한다.",
  })],
  ["휘트스톤 브리지 평형", A({
    topic: "휘트스톤 브리지 회로 해석",
    interpretation: "브리지가 평형일 때 미지 저항 R를 구하고 출력 전압을 구한다.",
    componentInventory: [{ type: "R", value: "R" }],
  })],
  ["종속전원 없는 순수 테브난", A({
    topic: "테브난 등가 회로",
    interpretation: "저항망의 테브난 등가 저항과 전압을 구하고 최대 전력을 구한다.",
  })],
];
for (const [name, an] of NEGATIVE) check(`양보 — ${name}`, !detectTheveninDepGraph(an));

console.log("[3] 원본 물리 — 손검산과 일치");
{
  const o = solveTdg({ Vs: 9, Ra: 5, Rb: 1, Rc: 2, k: 2, R: 1 });
  check("V_TH = 1[V]", qTex(o.Vth) === "1", qTex(o.Vth));
  check("I_SC = 3/8[A]", qTex(o.Isc) === "3/8", qTex(o.Isc));
  check("R_TH = 8/3[Ω]", qTex(o.Rth) === "8/3", qTex(o.Rth));
  check("P_L(max) = 3/32[W]", qTex(o.Pmax) === "3/32", qTex(o.Pmax));
  check("R_TH = V_TH/I_SC 일관", Math.abs(qNum(o.Rth) - qNum(o.Vth) / qNum(o.Isc)) < 1e-12);
}

console.log("[4] 생성물 재검산 — 독립 solver로 교차검증");
/**
 * ★ archetype 공식을 쓰지 않는 독립 검증 — 회로 방정식을 **미지수 그대로 세워** 직접 푼다.
 *   개방: 단일 루프 전류 i,  V_s = (Ra + k + Rb + R)i,  V_oc = R·i
 *   단락: 미지수 (i1, ix, isc, v).  i1 = ix + isc,  v = R·ix,  v = Rc·isc,
 *         V_s = Ra·i1 + k·ix + Rb·i1 + v
 */
function independentSolve(t) {
  const { Vs, Ra, Rb, Rc, k, R } = t;
  const i = Vs / (Ra + k + Rb + R);
  const Voc = R * i;
  // 단락: v를 미지수로 두고 위 4식을 정리 → Vs = (Ra+Rb)(v/R + v/Rc) + k·v/R + v
  const coef = (Ra + Rb) * (1 / R + 1 / Rc) + k / R + 1;
  const v = Vs / coef;
  const isc = v / Rc;
  // 잔차 검증 — 실제로 KVL/KCL을 만족하는지
  const ix = v / R, i1 = ix + isc;
  const kvl = Vs - (Ra * i1 + k * ix + Rb * i1 + v);
  return { Voc, isc, Rth: Voc / isc, Pmax: (Voc * isc) / 4, kvl };
}
{
  let bad = 0, maxErr = 0, worst = "";
  const seen = { similar: new Set(), variant: new Set() };
  for (const mode of ["exam_similar", "exam_variant"]) {
    for (let s = 0; s < 24; s++) {
      const g = generateTheveninDepGraph({ seed: s * 37 + 5, mode });
      const t = { ...g.values, R: g.answer.R };
      const ind = independentSolve(t);
      const e = Math.max(
        Math.abs(ind.Voc - qNum(g.answer.Vth)),
        Math.abs(ind.isc - qNum(g.answer.Isc)),
        Math.abs(ind.Rth - qNum(g.answer.Rth)),
        Math.abs(ind.Pmax - qNum(g.answer.Pmax)),
        Math.abs(ind.kvl),
      );
      if (e > 1e-9) { bad++; if (e > maxErr) { maxErr = e; worst = JSON.stringify(t); } }
      seen[mode === "exam_similar" ? "similar" : "variant"].add(JSON.stringify(t));
    }
  }
  check("생성물 48개 전부 독립 solver와 일치 (KVL 잔차 포함)", bad === 0, `bad=${bad} maxErr=${maxErr} ${worst}`);
  const overlap = [...seen.similar].filter((x) => seen.variant.has(x));
  check("유사/변형 값 풀 비중첩", overlap.length === 0, `겹침 ${overlap.length}`);
}

console.log("[5] 값 품질");
{
  const sp = buildTdgSpace();
  check("값 공간 충분(≥ 200)", sp.length >= 200, String(sp.length));
  const hasOriginal = sp.some((t) => t.Vs === 9 && t.Ra === 5 && t.Rb === 1 && t.Rc === 2 && t.k === 2 && t.R === 1);
  check("원본 튜플은 생성 풀에서 제외", !hasOriginal);
  check("모든 조합의 V_TH가 정수", sp.every((t) => solveTdg(t).Vth.d === 1));
  check("모든 조합의 R_TH > 0", sp.every((t) => qNum(solveTdg(t).Rth) > 0));
}

console.log("[6] 발문·표기·figure");
{
  const probs = await runTheveninDepGraphMaxPowerPipeline({ analysis: null, mode: "exam_similar", count: 2 });
  const p = probs[0];
  check("문항 2개 생성", probs.length === 2);
  check("[단계] 마커 3종", ["[단계 1]", "[단계 2]", "[단계 3]"].every((k) => p.question.includes(k)));
  check("figure 2개 (회로 + 그래프)", p.figureVariants.length === 2, JSON.stringify(p.figureVariants.map((f) => f.diagramType)));
  check("(가) 전용 diagramType", p.figureVariants[0].diagramType === "thevenin_dep_graph_circuit");
  check("(나) V-I 그래프", p.figureVariants[1].diagramType === "vi_line_graph");
  check("(나) x절편은 기호 I_SC (답 미노출)", p.figureVariants[1].diagram.iInterceptLabel === "I_SC");
  const body = `${p.content} ${p.conditions.join(" ")} ${p.question} ${p.answer}`;
  check("발문·정답에 소수점 표기 없음", !/\d\.\d/.test(body), body.match(/\d\.\d\S*/g)?.join(",") ?? "");
  check("정답에 R·I_SC·P_L 모두 포함", /R = /.test(p.answer) && /I_SC/.test(p.answer) && /P_L/.test(p.answer));

  // ★ 정답에 적힌 **기호식에 R을 대입**하면 수치 답과 같아야 한다.
  //   실측: 변형의 I_SC 식을 손으로 잘못 적어 R=3에서 10/9(실제 5/6)가 나왔다 — E2E에서야 드러났다.
  const evalFormula = (expr, R) => {
    const js = expr.replace(/(\d)R/g, "$1*R").replace(/\bR\b/g, `(${R})`);
    return Function(`"use strict"; return (${js});`)();
  };
  for (const mode of ["exam_similar", "exam_variant"]) {
    const ps = await runTheveninDepGraphMaxPowerPipeline({ analysis: null, mode, count: 6 });
    let bad = 0, note = "";
    for (const pr of ps) {
      const l1 = pr.answer.split("\n")[0];
      const m = l1.match(/=\s*([^,\[]+?)\[[AV]\]/);
      const rm = l1.match(/R = ([\d.]+)\[Ω\]/);
      if (!m || !rm) { bad++; note = l1; continue; }
      let got;
      try { got = evalFormula(m[1].trim(), Number(rm[1])); }
      catch { bad++; note = `식 파싱 실패: ${l1}`; continue; }   // 암묵 곱셈 등 잘못 쓴 식도 여기서 잡힌다
      const want = mode === "exam_similar"
        ? Number(pr.answer.match(/V_TH = ([\d/]+)/)?.[1]?.split("/").reduce((x, y) => (y ? +x / +y : +x)) ?? NaN)
        : NaN;
      const target = mode === "exam_similar"
        ? Number(pr.conditions.find((c) => c.includes("V_RL 축 절편"))?.match(/([\d/]+)\[V\]/)?.[1]?.split("/").reduce((x, y) => (y ? +x / +y : +x)))
        : Number(pr.conditions.find((c) => c.includes("I_RL 축 절편"))?.match(/([\d/]+)\[A\]/)?.[1]?.split("/").reduce((x, y) => (y ? +x / +y : +x)));
      void want;
      if (!(Math.abs(got - target) < 1e-9)) { bad++; note = `${l1} → 식=${got} 그래프절편=${target}`; }
    }
    check(`[단계 1] 기호식에 R 대입 = 그래프 절편 (${mode}, 6개)`, bad === 0, note);
  }
  check("풀이가 전원 무효화 불가를 명시", /전원을 죽여|무효화/.test(p.solution) || /쓸 수 없다/.test(p.solution));

  const vprobs = await runTheveninDepGraphMaxPowerPipeline({ analysis: null, mode: "exam_variant", count: 1 });
  check("변형은 x절편이 수치 (구하는 양 교환)", vprobs[0].figureVariants[1].diagram.vInterceptLabel === "V_TH");
}

console.log("[7] 렌더 구조");
{
  const svg = renderTheveninDepGraphCircuit({
    Vs: 9, Ra: 5, k: 2, Rb: 1, Rc: 2,
    unknownLabel: "R", depLabel: "2i_x", currentLabel: "i_x", loadLabel: "R_L",
  });
  check("점선 박스 존재", /stroke-dasharray="6,4"/.test(svg));
  check("종속전원 다이아몬드(경로)", /M\d+,\d+ L\d+,\d+ L\d+,\d+ L\d+,\d+ Z/.test(svg));
  check("전류계 Ⓐ·전압계 Ⓥ", svg.includes(">A</text>") && svg.includes(">V</text>"));
  check("i_x 라벨", svg.includes("i_x"));
  check("미지 저항은 값 없이 'R'", svg.includes(">R</text>"));
  check("단자 a·b", svg.includes(">a</text>") && svg.includes(">b</text>"));

  // ★ (나) 그래프도 렌더까지 확인한다 — payload에 기호 라벨을 넣어도 렌더러가 무시하면
  //   x절편에 답(I_sc=8/11A)이 그대로 찍힌다(실측으로 잡힌 사고).
  const { renderViLineGraph } = await import("@/lib/renderers/viLineGraphRenderer");
  const gsvg = renderViLineGraph({ Vth: 4, Isc: 8 / 11, vInterceptLabel: "4", iInterceptLabel: "I_SC" });
  check("(나) x절편이 기호 I_SC로 렌더", gsvg.includes(">I_SC<"), "");
  check("(나) x절편에 수치가 노출되지 않음", !/I_sc=/.test(gsvg), gsvg.match(/I_sc=[^<]*/)?.[0] ?? "");
  const gsvg2 = renderViLineGraph({ Vth: 4, Isc: 8 / 11 });
  check("override 없으면 기존 표기 유지(무회귀)", /I_sc=/.test(gsvg2));
  const nums = [...svg.matchAll(/>(\d+)Ω</g)].map((m) => m[1]);
  check("미지 R에 값이 노출되지 않음", !nums.includes("1") || nums.filter((n) => n === "1").length === 1, nums.join(","));
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
