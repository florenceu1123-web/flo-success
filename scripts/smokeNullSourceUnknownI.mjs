/**
 * 임용 3번(2전원 중첩 → V_L=0 되는 전류원 역산) — **영(0) 조건을 흘린 회차** 라우팅 스모크.
 *
 * 배경 (사용자 신고 2026-08-10, 서버 로그 실측):
 *   Vision이 `V_L = 0`을 한 글자도 쓰지 않고 "인덕터 양단의 전압 V_L이 **주어졌을 때**
 *   페이저 전류 I_S를 구한다"로만 요약해 `matchesNullSourceAsk`가 미발화 →
 *   **universal_ac**로 떨어져 generic `analog_netlist` 그림(내부 id `V_leg1_1` 노출 +
 *   학생이 구해야 할 I_s에 값 1.5A가 찍힘)이 나왔다. `generic_dispatch_warning`이 남았고
 *   validator는 totalIssues=0으로 통과했다 — generic 경로 실패의 전형.
 *
 * 그 회차에도 **인벤토리**에는 구조가 남아 있었다: 전압원 √2∠45°V(수치) + 전류원 Is[A](미지 기호).
 * ⇒ `matchesNullSourceUnknownSource`가 그 신호로 구제한다.
 *
 * 실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeNullSourceUnknownI.mjs
 */
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { detectAcSuperpositionNullSource } from "@/lib/pipeline/runAcSuperpositionNullSourcePipeline";

let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? "✓" : "✗ FAIL"} — ${label}${detail ? ` (${detail})` : ""}`);
  if (!ok) fail += 1;
};

const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic,
  interpretation,
  relatedConcepts: concepts,
  fillInTheBlanks: [],
  componentInventory: inventory,
  tags: [],
  learningObjective: {},
});
const inv = (...items) =>
  items.map((s, i) => {
    const idx = s.indexOf(":");
    return { id: `c${i}`, type: s.slice(0, idx), value: s.slice(idx + 1) };
  });

/** 신고 회차의 인벤토리 — 전압원은 수치, 전류원만 기호. */
const REPORTED_INV = inv(
  "V:√2∠45°V", "L:j2Ω", "C:-j1Ω", "R:1Ω", "R:1Ω", "C:-j1Ω", "I:Is[A]",
);

const routes = (a, subject = "circuit_theory") =>
  classifyCircuitType(a, subject).type === "ac_superposition_null_source" ||
  detectAcSuperpositionNullSource(a);

// ─── 1. 신고 회차 재현 (영 조건이 요약에서 사라진 실측 텍스트) ──────────
console.log("[1] 신고 회차 재현 — 영(0) 조건 없음");
const reported = mk(
  "RLC 회로의 페이저 해석",
  "이 문제는 주파수 영역에서 RLC 회로의 페이저 해석을 통해 페이저 전류 I_S를 구하는 문제입니다. " +
    "주어진 회로에서 페이저 전압원 V_S와 인덕터 양단의 전압 V_L이 주어졌을 때, 회로의 페이저 전류 I_S를 " +
    "해석 절차에 따라 단계적으로 구해야 합니다. 각 단계에서는 회로의 조건에 따라 전압과 전류를 계산하여 최종적으로 I_S를 구합니다.",
  ["페이저 해석", "복소수 전압", "복소수 전류", "인덕턴스"],
  REPORTED_INV,
);
check("실측 요약 → 전용 archetype", routes(reported));
check("과목을 잘못 골라도(전자회로) 잡힌다", routes(reported, "electronics"));

// 표현이 더 흔들린 회차 — "양단 전압"만 남고 인덕터라는 말도 없는 경우.
const terse = mk(
  "교류 회로의 페이저 해석",
  "주파수 영역 회로에서 소자 양단의 전압 조건을 이용하여 페이저 전류원 I_s를 구하는 문제입니다.",
  ["페이저"],
  REPORTED_INV,
);
check("더 짧은 요약도 잡힌다", routes(terse));

// ─── 2. 기존 경로 무회귀 (영 조건이 살아 있는 회차) ────────────────────
console.log("\n[2] 기존 경로 무회귀");
const withNull = mk(
  "RLC 회로의 페이저 해석",
  "주어진 전압원과 인덕터 양단의 전압이 0이 될 때의 전류를 구하는 과정입니다. 페이저 해석을 통해 " +
    "복소수 형태의 전압과 전류를 계산하며, 종속 전원이 포함되어 있어 이를 고려한 해석이 필요합니다.",
  ["페이저 해석", "복소수 전압", "종속 전원"],
  inv("V:√2∠45°", "R:1", "R:1", "L:j2", "C:-j1", "C:-j1", "I:i_s"),
);
check("영 조건이 있는 실측 회차는 그대로", routes(withNull));

// ─── 3. 형제 미탈취 ────────────────────────────────────────────────────
console.log("\n[3] 형제 archetype 양보");

// 임용 5번 — 전압원·전류원 **둘 다 미지**(크기를 구함). knownV=0이라 새 신호가 발화하면 안 된다.
const sourceDesign = mk(
  "RLC 회로의 페이저 해석",
  "교류 전원을 포함한 RLC 회로에서 커패시터 양단의 페이저 전압을 주어진 조건에 맞추기 위해 " +
    "전압원과 전류원의 크기를 구하는 문제입니다.",
  ["페이저", "커패시터 전압", "전원 크기"],
  inv("V:V_s∠0°V", "I:I_s∠-90°A", "R:1Ω", "R:2Ω", "R:2Ω", "L:j11Ω", "C:-j10Ω"),
);
check("임용 5번(두 전원 크기 역산) 안 뺏김", !routes(sourceDesign));

// 임용 10번 — 두 전원이 모두 수치. unknownI=0.
const twoBox = mk(
  "RLC 회로의 테브난 등가 해석",
  "두 개의 교류 전원이 포함된 RLC 회로에서 단자 a-b의 테브난 등가 임피던스와 단자 c-d의 테브난 등가 " +
    "전압을 구하고, 부하 저항 R_L에 최대 평균 전력을 전달하는 조건을 찾는 문제입니다.",
  ["테브난 등가 회로", "최대 전력 전달", "페이저 해석"],
  inv("V:1∠0°V", "R:100Ω", "C:-j100Ω", "L:j50Ω", "I:0.01∠0°A", "R:100Ω", "L:j100Ω", "C:-j50Ω"),
);
check("임용 10번(테브난 두 박스) 안 뺏김", !routes(twoBox));

// 종속 전류원(제어식)은 미지 전원이 아니다 — 형제 ac_vccs_phasor.
const vccs = mk(
  "종속 전류원을 포함한 페이저 회로 해석",
  "교류 전압원과 종속 전류원이 포함된 회로에서 커패시터 양단의 페이저 전압 V_c를 구하고, " +
    "이를 이용해 저항에 흐르는 페이저 전류 I_R를 구하는 문제입니다.",
  ["페이저", "종속 전원"],
  inv("V:10∠45°V", "R:1Ω", "R:2Ω", "C:-j2Ω", "C:-j2Ω", "L:j2Ω", "I:2Vc"),
);
check("종속 전류원 회로(ac_vccs_phasor) 안 뺏김", !routes(vccs));

// 평균전력·공진 등 낱말 양보가 새 경로로 우회되지 않는지.
const meshPower = mk(
  "교류 RLC 회로 해석",
  "두 개의 교류 전원을 포함한 RLC 회로에서 인덕터 양단의 전압과 페이저 전류를 구하고, " +
    "저항에서 소비되는 평균 전력을 계산하는 문제입니다.",
  ["페이저", "평균 전력"],
  inv("V:√8∠45°V", "R:1Ω", "R:1Ω", "C:-j1Ω", "C:-j2Ω", "L:j3Ω", "I:I_s"),
);
check("평균전력 유형은 양보가 여전히 우선", !routes(meshPower));

// 미지 전원이 아예 없는 일반 교류 회로(전부 수치) — 새 신호가 과잉 발화하면 안 된다.
const plainAc = mk(
  "교류 RLC 회로의 페이저 해석",
  "교류 전압원과 전류원이 포함된 회로에서 인덕터 양단의 전압을 구하고 각 소자의 전류를 구하는 문제입니다.",
  ["페이저"],
  inv("V:10∠0°V", "I:2∠0°A", "R:1Ω", "L:j2Ω", "C:-j1Ω"),
);
check("전원이 전부 수치면 발화하지 않음", !routes(plainAc));

console.log(fail === 0 ? "\n=== NULL-SOURCE UNKNOWN-I SMOKE PASS ===" : `\n=== ${fail} FAILURE(S) ===`);
process.exit(fail === 0 ? 0 : 1);
