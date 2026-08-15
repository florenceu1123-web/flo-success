/**
 * smokeViTheveninMaxPower — 2전압원 + 2전류원 테브난 등가 + 최대전력 (임용 5번) 값·모드 스모크.
 *
 * ★ 왜 필요한가 (사용자 확인 2026-08-04):
 *   E2E에서 (a) **원본 값(3V·1V·5mA·3mA·2k·3k)이 그대로 생성**되고 (b) **유사와 변형이 완전히 동일**했다.
 *   원인은 PARAM_SETS 첫 항목이 원본인데 제외되지 않았고, 파이프라인이 `mode`를 넘기지 않은 것.
 *   → 값은 규칙 열거+필터로 생성하고 원본 튜플을 제외하며, 모드별로 겹치지 않는 풀을 쓴다.
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeViTheveninMaxPower.mjs
 */
import { generateViTheveninMaxPower, __viThevSpace } from "../lib/generation/topologies/viTheveninMaxPower.ts";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ok   ${m}`); };
const bad = (m) => { fail++; console.log(`  FAIL ${m}`); };
const key = (v) => `${v.V1}|${v.V2}|${v.Iup}|${v.Idown}|${v.R1}|${v.R2}`;

const { ALL_SETS, SIMILAR_SETS, VARIANT_SETS, ORIGINAL } = __viThevSpace;

console.log("=== 1. 값 공간 ===");
ALL_SETS.length >= 40 ? ok(`풀 크기 ${ALL_SETS.length}`) : bad(`풀이 너무 작다 (${ALL_SETS.length})`);
const setKey = (s) => `${s.V1}|${s.V2}|${s.Iup_mA}|${s.Idown_mA}|${s.R1_k}|${s.R2_k}`;
ALL_SETS.some((s) => setKey(s) === setKey(ORIGINAL))
  ? bad("원본 튜플이 값 공간에 남아 있다")
  : ok("원본 튜플이 값 공간에서 제외됨");
const simKeys = new Set(SIMILAR_SETS.map(setKey));
VARIANT_SETS.some((s) => simKeys.has(setKey(s)))
  ? bad("유사/변형 풀이 겹친다")
  : ok(`유사(${SIMILAR_SETS.length})·변형(${VARIANT_SETS.length}) 풀 비중첩`);

console.log("\n=== 2. 생성물 독립 재검산 (닫힌형 물리) ===");
// 독립 검산: V_c = (V1+V2) + (Iup−Idown)·R1 [V, mA·kΩ], R_th = R1+R2,
//            I_sc = V_c/R_th [mA], P_max = V_c²/(4·R_th) [mW]
let physFail = 0, originalHits = 0;
const seenByMode = { exam_similar: new Set(), exam_variant: new Set() };
for (const mode of ["exam_similar", "exam_variant"]) {
  for (let seed = 1; seed <= 24; seed++) {
    const g = generateViTheveninMaxPower({ seed, mode });
    const v = g.values;
    seenByMode[mode].add(key(v));
    if (key(v) === `${ORIGINAL.V1}|${ORIGINAL.V2}|${ORIGINAL.Iup_mA}|${ORIGINAL.Idown_mA}|${ORIGINAL.R1_k * 1000}|${ORIGINAL.R2_k * 1000}`) originalHits++;
    const R1k = v.R1 / 1000, R2k = v.R2 / 1000;
    const Vc = v.V1 + v.V2 + (v.Iup - v.Idown) * R1k;
    const Rthk = R1k + R2k;
    const Isc = Vc / Rthk;
    const Pmax = (Vc * Vc) / (4 * Rthk);
    const near = (a, b) => Math.abs(a - b) < 1e-6;
    if (!near(g.answer.Vc, Vc) || !near(g.answer.Rth / 1000, Rthk) ||
        !near(g.answer.IabMa, Math.round(Isc * 1000) / 1000) || !near(g.answer.PmaxMw, Math.round(Pmax * 1000) / 1000)) {
      physFail++;
      if (physFail <= 3) console.log(`       ${mode} seed=${seed} 불일치: got Vc=${g.answer.Vc}/I=${g.answer.IabMa}/P=${g.answer.PmaxMw}` +
        ` vs 재검산 Vc=${Vc}/I=${Isc}/P=${Pmax}`);
    }
  }
}
physFail === 0 ? ok("생성물 48개 전부 닫힌형 재검산 일치 (V_c·R_th·I_sc·P_max)") : bad(`재검산 불일치 ${physFail}건`);
originalHits === 0 ? ok("원본 값이 한 번도 생성되지 않음") : bad(`원본 값이 ${originalHits}회 생성됨`);

// ★ 소자값이 달라도 **도출량(V_c·R_th)이 원본과 같으면** 사실상 원본과 같은 문항이다(실측: 유사 모드가
//   V_c=8·R_th=5kΩ·P=16/5mW를 냈다) → 값 공간에서 아예 제외돼야 한다.
{
  const sameAnswer = ALL_SETS.filter((s) => {
    const Vc = s.V1 + s.V2 + (s.Iup_mA - s.Idown_mA) * s.R1_k;
    return Vc === 8 && s.R1_k + s.R2_k === 5;
  });
  sameAnswer.length === 0
    ? ok("원본과 도출량(V_c=8·R_th=5kΩ)이 같은 조합도 제외됨")
    : bad(`원본과 답이 같은 조합이 ${sameAnswer.length}개 남아 있다`);
}

console.log("\n=== 3. 모드 분리 ===");
const inter = [...seenByMode.exam_similar].filter((k) => seenByMode.exam_variant.has(k));
inter.length === 0
  ? ok(`유사(${seenByMode.exam_similar.size}종)·변형(${seenByMode.exam_variant.size}종) 값 겹침 0`)
  : bad(`유사·변형이 같은 값을 생성 (${inter.length}종 겹침) — 두 모드가 같은 문제가 된다`);
seenByMode.exam_similar.size >= 3 ? ok("유사 모드가 여러 값을 낸다") : bad("유사 모드 값 다양성 부족");
seenByMode.exam_variant.size >= 3 ? ok("변형 모드가 여러 값을 낸다") : bad("변형 모드 값 다양성 부족");

console.log("\n=== 4. 원본 물리 (참조 튜플 검산) ===");
{
  const s = ORIGINAL;
  const Vc = s.V1 + s.V2 + (s.Iup_mA - s.Idown_mA) * s.R1_k;
  const Rth = s.R1_k + s.R2_k;
  const Isc = Vc / Rth, P = (Vc * Vc) / (4 * Rth);
  (Vc === 8 && Rth === 5 && Math.abs(Isc - 1.6) < 1e-9 && Math.abs(P - 3.2) < 1e-9)
    ? ok("원본: V_c=8V · R_th=5kΩ · I_sc=1.6mA · P_L=3.2mW")
    : bad(`원본 검산 불일치: Vc=${Vc} Rth=${Rth} Isc=${Isc} P=${P}`);
}

console.log("\n=== 5. 형제 미탈취 — 임용 9번(종속전원 V-I 그래프)이 이 원본을 뺏지 않는다 ===");
{
  const { classifyCircuitType } = await import("../lib/analysis/classifyCircuitType.ts");
  const mk = (o) => ({ topic: "", interpretation: "", relatedConcepts: [], fillInTheBlanks: [],
    signals: { inputs: [], outputs: [] }, componentInventory: [], ...o });

  // ★ 실측 실패 회차(재현 1/4) — Vision이 **없는 종속전원을 지어냈다**.
  const reported = mk({
    topic: "테브난 등가 회로 해석",
    topicKey: "dependent_source",
    interpretation:
      "주어진 회로에서 단자 a와 b 사이를 개방했을 때의 전압을 구하고, 단락했을 때의 전류를 구한 후, " +
      "테브난 등가 회로를 이용해 부하 저항 R_L에 최대 전력을 전달하는 조건을 찾는 문제입니다. " +
      "종속 전원이 포함되어 있어 이를 고려한 해석이 필요합니다.",
    relatedConcepts: ["테브난 등가 회로", "최대 전력 전달", "종속 전원", "단락 전류", "개방 전압"],
    componentInventory: [
      { type: "V", value: "3V" }, { type: "V", value: "1V" }, { type: "R", value: "2kΩ" },
      { type: "I", value: "3mA" }, { type: "I", value: "5mA" }, { type: "R", value: "3kΩ" },
      { type: "R", value: "R_L" },
    ],
  });
  const got = classifyCircuitType(reported, "circuit_theory").type;
  got === "max_power_transfer"
    ? ok(`신고 회차(종속전원 환각 + 기호 R_L) → ${got}`)
    : bad(`신고 회차가 여전히 ${got} 로 샌다`);

  // 회귀: 진짜 임용 9번(종속전원 CCVS + 미지 R, 독립 전류원 없음)은 그대로 잡혀야 한다.
  const real9 = mk({
    topic: "종속 전원을 포함한 회로의 테브난 등가와 최대 전력",
    interpretation:
      "점선 부분을 테브난 등가회로로 바꾸고, 그림 (나)의 V_RL–I_RL 직선을 이용하여 미지 저항 R을 구한 뒤 " +
      "단락 전류 I_SC와 최대 전력을 구한다.",
    relatedConcepts: ["테브난 등가", "종속 전원", "최대 전력 전달"],
    componentInventory: [
      { type: "V", value: "9V" }, { type: "R", value: "5Ω" }, { type: "CCVS", value: "2i_x" },
      { type: "R", value: "1Ω" }, { type: "R", value: "2Ω" }, { type: "R", value: "R" },
    ],
  });
  const got9 = classifyCircuitType(real9, "circuit_theory").type;
  got9 === "thevenin_dep_graph_max_power"
    ? ok(`임용 9번 원본은 그대로 → ${got9}`)
    : bad(`임용 9번 원본이 ${got9} 로 깨졌다`);

  // 회귀: 다이아몬드를 Vision이 I로 오타이핑해도 값이 2i_x면 종속으로 인식돼 임용 9번 유지.
  const mistyped9 = mk({
    ...real9,
    componentInventory: [
      { type: "V", value: "9V" }, { type: "R", value: "5Ω" }, { type: "I", value: "2i_x" },
      { type: "I", value: "2i_x" }, { type: "R", value: "2Ω" }, { type: "R", value: "R" },
    ],
  });
  const gotM = classifyCircuitType(mistyped9, "circuit_theory").type;
  gotM === "thevenin_dep_graph_max_power"
    ? ok(`다이아몬드를 I로 오타이핑해도 유지 → ${gotM}`)
    : bad(`오타이핑 회차가 ${gotM} 로 깨졌다`);
}

console.log(`\n=== ${pass}/${pass + fail} pass ===`);
if (fail > 0) process.exit(1);
