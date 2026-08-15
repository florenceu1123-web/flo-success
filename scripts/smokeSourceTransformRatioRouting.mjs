/**
 * smokeSourceTransformRatioRouting — 전원변환 + 전압비(임용 7번) 라우팅 회귀 스모크.
 *
 * ★ 왜 필요한가 (사용자 신고 2026-08-05 "생성 실패: 문제 생성 중 오류가 발생했습니다"):
 *   Vision이 **비율 숫자(3:2:1)도 nodeAnnotations의 V_1·V_2·V_3도 둘 다 흘린** 회차에서
 *   `detectSourceTransformRatio`가 null을 냈고 → **universal_dc**로 떨어져 generic 경로가
 *   floating source 회로를 만들며 `figure 검증 실패`로 **500 에러**가 사용자 화면에 떴다.
 *   (로그: dispatch universal_dc_pipeline → figure_critical_validation_failed
 *    "V_leg1_1: pins n_top↔GND 사이 closed loop 없음 — floating source")
 *
 * 실행:
 *   node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSourceTransformRatioRouting.mjs
 */
import { detectSourceTransformRatio } from "../lib/pipeline/runSourceTransformRatioPipeline.ts";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`  ok   ${m}`); };
const bad = (m) => { fail++; console.log(`  FAIL ${m}`); };
const mk = (o) => ({
  topic: "", interpretation: "", relatedConcepts: [], fillInTheBlanks: [],
  nodeAnnotations: [], componentInventory: [], ...o,
});

// 임용 7번 원본의 인벤토리 (실측 3회 공통): 전류원 1 + 저항 3 + **값이 기호/빈 미지 저항**
const INV_ORIGINAL = [
  { type: "I", value: "10mA" }, { type: "R", value: "480Ω" },
  { type: "R", value: "320Ω" }, { type: "R", value: "200Ω" }, { type: "R", value: "R3" },
];

console.log("=== 1. 신고 회차 재현 (비율 숫자·V 라벨 둘 다 없음) ===");
{
  const got = detectSourceTransformRatio(mk({
    topic: "전원 변환 회로 해석",
    interpretation:
      "이 문제는 전류원이 포함된 저항회로를 전원 변환 회로로 변환하여 각 단계별로 전압과 전류를 구하는 문제입니다. " +
      "그림 (가)의 전류원을 전압원으로 변환하여 그림 (나)의 회로를 구성하고, 저항 R_3에 흐르는 전류 I_3를 구합니다.",
    relatedConcepts: ["전원 변환", "저항 회로", "옴의 법칙"],
    nodeAnnotations: [],           // ★ V_1·V_2·V_3 없음
    componentInventory: INV_ORIGINAL,
  }));
  got ? ok(`구조 신호로 구제됨 → ratio ${got.join(":")}`) : bad("여전히 null — universal_dc로 떨어져 500 에러가 난다");
}
{
  // 값이 빈 미지 저항으로 오는 회차도 있다(실측 `R=`).
  const got = detectSourceTransformRatio(mk({
    topic: "전원 변환 회로 해석",
    interpretation: "전류원을 전압원으로 전원 변환한 뒤 저항을 구한다.",
    componentInventory: [...INV_ORIGINAL.slice(0, 4), { type: "R", value: "" }],
  }));
  got ? ok(`값이 빈 미지 저항 회차도 구제 → ${got.join(":")}`) : bad("빈 값 미지 저항 회차 미구제");
}

console.log("\n=== 2. 기존 경로 무회귀 ===");
{
  const got = detectSourceTransformRatio(mk({
    topic: "전원 변환 회로 해석",
    interpretation: "저항 R_1, R_2, R_3에 걸리는 전압비는 V_1:V_2:V_3=3:2:1이다.",
    nodeAnnotations: [{ label: "V_1" }, { label: "V_2" }, { label: "V_3" }],
    componentInventory: INV_ORIGINAL,
  }));
  got && got.join(":") === "3:2:1" ? ok("비율 숫자가 있으면 그대로 추출 (3:2:1)") : bad(`비율 추출 실패: ${JSON.stringify(got)}`);
}
{
  const got = detectSourceTransformRatio(mk({
    topic: "전원 변환 회로 해석",
    interpretation: "전원 변환 후 각 저항의 전압을 구한다.",
    nodeAnnotations: [{ label: "V_1" }, { label: "V_2" }, { label: "V_3" }],
    componentInventory: [{ type: "I", value: "10mA" }, { type: "R", value: "480Ω" }],
  }));
  got ? ok("V 라벨 경로(weakRatio) 유지") : bad("weakRatio 경로가 깨졌다");
}

console.log("\n=== 3. 형제 미탈취 (양보 가드) ===");
const yields = [
  ["종속전원 포함(임용 8번류)", mk({
    topic: "종속전원과 스위치가 있는 회로",
    interpretation: "전원 변환을 이용해 해석한다. 전류원과 전압원이 있다.",
    componentInventory: [{ type: "VCCS", value: "0.2V_3" }, { type: "I", value: "1A" }, { type: "R", value: "R" }],
  })],
  ["스위치 포함", mk({
    topic: "전원 변환 회로",
    interpretation: "스위치를 닫았을 때 전류원을 전압원으로 변환한다.",
    componentInventory: [{ type: "SW" }, { type: "I", value: "1A" }, { type: "R", value: "R" }],
  })],
  ["가변저항(임용 10번)", mk({
    topic: "전원 변환 회로",
    interpretation: "가변 저항 R의 값을 조정하여 V_2가 목표값이 되도록 한다. 전류원과 전압원이 있다.",
    componentInventory: [{ type: "I", value: "0.5A" }, { type: "R", value: "R" }],
  })],
  ["전류원 없는 테브난 등가", mk({
    topic: "테브난 등가회로",
    interpretation: "등가 변환하여 단자 a-b에서 본 테브난 저항을 구한다. 부하 R_L에 최대 전력을 전달한다.",
    componentInventory: [{ type: "V", value: "12V" }, { type: "R", value: "2Ω" }, { type: "R", value: "R_L" }],
  })],
];
for (const [name, a] of yields) {
  const got = detectSourceTransformRatio(a);
  got ? bad(`${name} 을 탈취했다 → ${got.join(":")}`) : ok(`${name} 미탈취`);
}

console.log(`\n=== ${pass}/${pass + fail} pass ===`);
if (fail > 0) process.exit(1);
