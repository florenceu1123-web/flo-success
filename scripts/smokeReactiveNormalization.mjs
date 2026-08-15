/**
 * 리액티브 값 정규화 정적 스모크 (API 호출 없음).
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeReactiveNormalization.mjs
 *
 * 배경(2026-08-03 실측): Vision이 임용 6번의 `j[Ω]`·`−j½[Ω]`를 **저항(R)** 으로 추출해
 * counts가 {R:3, L:0, C:0}이 되자 "종속전원 + 리액티브" 0-PRE가 미발화 → `ac_superposition`으로
 * 오분류되고 generic figure가 생성됐다. 값 기준 정규화로 타입 문자를 신뢰하지 않도록 고쳤다.
 */
import {
  effectiveComponentType,
  hasReactiveComponent,
  reactiveKindFromValue,
} from "@/lib/analysis/reactiveValue";
import { classifyCircuitType } from "@/lib/analysis/classifyCircuitType";
import { detectAcTheveninDependent } from "@/lib/pipeline/runAcTheveninDependentPipeline";

let pass = 0;
let fail = 0;
function check(name, cond, extra) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`);
  }
}

// ── 1. 값 → 리액티브 종류 ───────────────────────────────────────────────────
console.log("[1] reactiveKindFromValue");
check("계수 없는 j (원본 표기 `j[Ω]`) → L", reactiveKindFromValue("j[Ω]") === "L");
check("`jΩ` → L", reactiveKindFromValue("jΩ") === "L");
check("`j15Ω` → L", reactiveKindFromValue("j15Ω") === "L");
check("`j2` → L", reactiveKindFromValue("j2") === "L");
check("분수 `-j1/2Ω` → C", reactiveKindFromValue("-j1/2Ω") === "C");
check("유니코드 마이너스 `−j1/2 [Ω]` → C", reactiveKindFromValue("−j1/2 [Ω]") === "C");
check("소수 `-j0.5Ω` → C", reactiveKindFromValue("-j0.5Ω") === "C");
check("명시 플러스 `+j5Ω` → L", reactiveKindFromValue("+j5Ω") === "L");

console.log("\n  — 오탐 방지 (리액티브가 아닌 값)");
check("순저항 `8/5Ω` → null", reactiveKindFromValue("8/5Ω") === null);
check("순저항 `2Ω` → null", reactiveKindFromValue("2Ω") === null);
check("전류 페이저 `√2∠0°A` → null", reactiveKindFromValue("√2∠0°A") === null);
check("전압 페이저 `20∠-90°V` → null", reactiveKindFromValue("20∠-90°V") === null);
check("종속원 제어식 `1/2 I_c` → null", reactiveKindFromValue("1/2 I_c") === null);
check("직교 페이저 `1+j2 V`는 순허수가 아니므로 null", reactiveKindFromValue("1+j2 V") === null);
check("인덕턴스 `2H` → null (임피던스 표기가 아님)", reactiveKindFromValue("2H") === null);
check("빈 값 → null", reactiveKindFromValue("") === null && reactiveKindFromValue(null) === null);

// ── 2. 소자 타입 교정 ───────────────────────────────────────────────────────
console.log("\n[2] effectiveComponentType");
check("R + `j[Ω]` → L (신고 재현)", effectiveComponentType({ type: "R", value: "j[Ω]" }) === "L");
check("R + `-j1/2Ω` → C (신고 재현)", effectiveComponentType({ type: "R", value: "-j1/2Ω" }) === "C");
check("R + 순저항 값 → R 유지", effectiveComponentType({ type: "R", value: "8/5Ω" }) === "R");
check("L↔C 뒤바뀐 것도 교정", effectiveComponentType({ type: "C", value: "j2Ω" }) === "L");
check(
  "★ 전원은 건드리지 않는다 (직교 페이저 오인 방지)",
  effectiveComponentType({ type: "V", value: "j2" }) === "V" &&
    effectiveComponentType({ type: "I", value: "-j1/2" }) === "I",
);
check("종속전원 타입도 그대로", effectiveComponentType({ type: "CCCS", value: "1/2 I_c" }) === "CCCS");
check(
  "hasReactiveComponent — R로 잘못 잡힌 인벤토리에서도 true",
  hasReactiveComponent([
    { type: "I", value: "√2∠0°A" },
    { type: "R", value: "8/5Ω" },
    { type: "R", value: "j[Ω]" },
    { type: "R", value: "-j1/2Ω" },
  ]) === true,
);
check(
  "hasReactiveComponent — 순저항망은 false",
  hasReactiveComponent([
    { type: "V", value: "10V" },
    { type: "R", value: "2Ω" },
    { type: "R", value: "4Ω" },
  ]) === false,
);

// ── 3. 신고 회차 재현 — 분류가 전용 archetype으로 가는가 ────────────────────
console.log("\n[3] 실측 오분류 회차 재현 (임용 6번)");
// 2026-08-03 17:23 서버 로그의 실제 인벤토리: 리액티브가 전부 R로 추출됐다.
const reportedAnalysis = {
  subject: "회로이론",
  topic: "테브난 등가 회로와 최대 전력",
  interpretation:
    "이 문제는 테브난 등가 회로를 이용하여 단자 A-B 사이의 등가 전압과 저항을 구하고, 이를 통해 부하에 최대 평균 전력을 전달하는 조건을 찾는 문제입니다. 주어진 회로에서 테브난 등가를 구한 후, 부하가 최대 전력을 받을 수 있도록 조정합니다. 모든 소자는 이상적으로 동작하며, 종속 전원이 포함되어 있습니다.",
  relatedConcepts: ["테브난 등가", "최대 전력 전달", "종속 전원", "페이저"],
  componentInventory: [
    { id: "I_s", type: "I", value: "√2∠0°A" },
    { id: "R1", type: "R", value: "8/5Ω" },
    { id: "CCCS1", type: "CCCS", value: "1/2 I_c" },
    { id: "R2", type: "R", value: "-j1/2Ω" },
    { id: "R3", type: "R", value: "j[Ω]" },
  ],
};
const cls = classifyCircuitType(reportedAnalysis);
check(
  `신고 회차가 전용 archetype으로 분류된다 (실측: ${cls.type})`,
  cls.type === "ac_thevenin_dependent",
  `reasoning=${cls.reasoning}`,
);
check("route 안전망도 발화", detectAcTheveninDependent(reportedAnalysis) === true);

// 리액티브를 제대로 읽은 회차는 원래 잘 됐다 — 무회귀 확인
const goodAnalysis = {
  ...reportedAnalysis,
  componentInventory: [
    { id: "I_s", type: "I", value: "√2∠0°A" },
    { id: "R1", type: "R", value: "8/5Ω" },
    { id: "CCCS1", type: "CCCS", value: "1/2 I_c" },
    { id: "C1", type: "C", value: "-j1/2Ω" },
    { id: "L1", type: "L", value: "j1Ω" },
  ],
};
check(
  "정상 회차 무회귀",
  classifyCircuitType(goodAnalysis).type === "ac_thevenin_dependent",
  classifyCircuitType(goodAnalysis).type,
);

// ── 4. 형제 유형 잠식 방지 ──────────────────────────────────────────────────
console.log("\n[4] 형제 회귀 — 순저항 DC 회로가 리액티브로 오염되지 않는다");
const dcAnalysis = {
  subject: "회로이론",
  topic: "휘트스톤 브리지 평형",
  interpretation:
    "브리지가 평형일 때 전류가 흐르지 않는 조건을 이용해 미지 저항 R_x를 구하고 출력 전압 V_o를 구한다.",
  relatedConcepts: ["휘트스톤 브리지", "평형 조건", "분압"],
  componentInventory: [
    { id: "V1", type: "V", value: "22V" },
    { id: "R1", type: "R", value: "4Ω" },
    { id: "R2", type: "R", value: "12Ω" },
    { id: "R3", type: "R", value: "6Ω" },
    { id: "R4", type: "R", value: "5Ω" },
  ],
};
const dcCls = classifyCircuitType(dcAnalysis);
check(
  `순저항 브리지는 그대로 (실측: ${dcCls.type})`,
  dcCls.type === "dc_wheatstone_balance",
  dcCls.reasoning,
);
check("순저항 브리지에서 테브난 종속 안전망 미발화", detectAcTheveninDependent(dcAnalysis) === false);

console.log(`\n결과: ${pass}/${pass + fail} 통과`);
if (fail > 0) process.exitCode = 1;
