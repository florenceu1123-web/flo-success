/**
 * 테브난 최대전력 generic — (나) V-I 그래프 형식 감지 스모크. API 없음.
 *
 * 실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeTheveninViGraphSignal.mjs
 *
 * ★ 신고 재현(2026-08-04): 사용자 실행 로그가 `withGraph:false, hasUnknownR:false` 였다.
 *   그래서 (나) 그래프가 통째로 빠지고, [단계 1]에서 학생이 구해야 할 **미지 저항 R에 값이 노출**됐다.
 *   원인 = Vision이 그 회차에 "그래프"도 "(나)"도 쓰지 않아 낱말 조건이 전부 미발화한 것.
 *   ⇒ 인벤토리의 **값이 기호인 저항**(value "R")을 구조 신호로 추가했다(CLAUDE.md 규칙 2).
 */
import { originalHasViGraph } from "@/lib/pipeline/runTheveninMaxPowerGenericPipeline";

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`); }
};
const A = (o) => ({ topic: "", interpretation: "", relatedConcepts: [], componentInventory: [], ...o });
const symR = [
  { type: "V", value: "9V" }, { type: "R", value: "5Ω" }, { type: "CCVS", value: "2i_x" },
  { type: "R", value: "1Ω" }, { type: "R", value: "R" }, { type: "R", value: "2Ω" },
];
const numOnly = symR.map((c) => (c.value === "R" ? { type: "R", value: "3Ω" } : c));

console.log("[1] 신고 회차 — 낱말이 전부 빠져도 기호 저항으로 잡는다");
check("그래프·(나)·I_sc 없음 + 기호 R 있음", originalHasViGraph(A({
  topic: "테브난 등가 회로와 최대 전력 전달",
  interpretation: "주어진 회로에서 테브난 등가 회로를 구하고 부하에 최대 전력이 전달되는 조건을 분석한다.",
  componentInventory: symR,
})));
check("기호 R만 있고 본문이 비어도 잡는다", originalHasViGraph(A({ componentInventory: symR })));
check("소문자 기호(r)도 인정", originalHasViGraph(A({
  componentInventory: [{ type: "R", value: "r" }],
})));
check("첨자 기호(R_x)도 인정", originalHasViGraph(A({
  componentInventory: [{ type: "R", value: "R_x" }],
})));

console.log("[2] 기존 낱말 경로 무회귀");
check("‘그래프’ 언급", originalHasViGraph(A({ interpretation: "그림 (나)의 그래프로 R을 구한다." })));
check("(나) + 단락 전류", originalHasViGraph(A({
  interpretation: "그림 (나)에서 I_sc를 읽어 단락 전류를 구한다.",
})));

console.log("[3] 음성 — 그래프 없는 원본은 여전히 false");
check("수치 저항뿐 + 그래프 언급 없음", !originalHasViGraph(A({
  topic: "테브난 등가 회로",
  interpretation: "종속 전원이 포함된 회로의 테브난 등가를 구한다.",
  componentInventory: numOnly,
})));
check("인벤토리 없음 + 낱말 없음", !originalHasViGraph(A({ interpretation: "테브난 등가를 구한다." })));
check("전원 값이 기호여도 저항이 아니면 무시", !originalHasViGraph(A({
  componentInventory: [{ type: "V", value: "V" }, { type: "R", value: "4Ω" }],
})));
check("여러 글자 값(Ω 단위)은 기호로 오인하지 않음", !originalHasViGraph(A({
  componentInventory: [{ type: "R", value: "12Ω" }],
})));

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
