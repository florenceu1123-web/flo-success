// 종속전원 값 정규화 — 첨자 없는 제어량("2i") 인식 + 독립원 오탐 방지
//   신고: 임용 7번(독립 25V + 종속 2i + 최대전력) 원본이 generic max_power_transfer로 가서
//   종속원이 독립 5A 전류원으로 변질됐다. 원인은 "2i"를 종속원으로 못 읽은 것.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeDependentSourceValue.mjs
import { isDependentSourceValue, isDependentComponent, isDependentCurrentSource } from "../lib/analysis/dependentSource.ts";

const CASES = [
  // 종속(제어식)
  { v: "2i", expect: true },
  { v: "2·i", expect: true },
  { v: "0.5i", expect: true },
  { v: "3v", expect: true },
  { v: "2Vc", expect: true },
  { v: "0.2V₃", expect: true },
  { v: "2i_x", expect: true },
  { v: "2V_c", expect: true },
  // 독립원 — 절대 종속으로 보면 안 됨
  { v: "25V", expect: false },
  { v: "10V", expect: false },
  { v: "5A", expect: false },
  { v: "4A", expect: false },
  { v: "10∠45°V", expect: false },
  { v: "1Ω", expect: false },
  { v: "2.5F", expect: false },
  { v: "3H", expect: false },
];

let pass = 0;
for (const c of CASES) {
  const got = isDependentSourceValue(c.v);
  const ok = got === c.expect;
  if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} "${c.v}" → 종속=${got} (기대=${c.expect})`);
}
// 컴포넌트 레벨
const comp = { type: "I", value: "2i" };
const okComp = isDependentComponent(comp) && isDependentCurrentSource(comp);
console.log(`${okComp ? "✓" : "✗"} {type:"I", value:"2i"} → 종속 전류원 인식=${okComp}`);
if (okComp) pass++;
const total = CASES.length + 1;
console.log(`${pass}/${total} ${pass === total ? "PASS" : "FAIL"}`);
process.exit(pass === total ? 0 : 1);
