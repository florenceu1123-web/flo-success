/**
 * 문제 조건의 자연상수 e 수치 제시 제거 스모크 — API 없음.
 *
 * 실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeStripEulerGiven.mjs
 *
 * ★ 사용자 지정(2026-08-04, 전 과목): "모든 문제에 e의 값을 넣는 것을 빼줘 —
 *   답에 있는 건 상관없고 **문제 조건으로 주어지는 것만**."
 */
import { stripEulerGiven, stripEulerGivenList } from "@/lib/format/stripEulerGiven";

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra === undefined ? "" : ` — ${extra}`}`); }
};
const noEulerValue = (s) => !/2\.7\d|[=≈]\s*0?\.\d+/.test(s) || !/\be\b/i.test(s);

console.log("[1] 조건에서 e 수치 제거");
const CASES = [
  ["(단, e = 2.718로 계산한다.)", ""],
  ["(단, 모든 소자는 이상적이고, e = 2.718이다.)", "이상적"],
  ["e의 값은 2.718로 한다.", ""],
  ["e ≈ 2.72", ""],
  ["e^{-1} = 0.368로 계산한다.", ""],
  ["e^(-2) ≈ 0.135", ""],
  ["자연 상수 e는 2.718로 가정한다.", ""],
];
for (const [input, mustKeep] of CASES) {
  const out = stripEulerGiven(input);
  const ok = noEulerValue(out) && (mustKeep === "" || out.includes(mustKeep));
  check(`제거 — "${input}"`, ok, `→ "${out}"`);
}

console.log("[2] 건드리면 안 되는 것 (답·풀이 표현·다른 수치)");
const KEEP = [
  "i(t) = 1 + 2e^(−2t)[A]",
  "v_C(t) = 20(1 − e^(−t/τ))[V]",
  "τ = 0.5s, R = 2Ω, L = 1H",
  "논릿값 1은 5[V], 논릿값 0은 0[V]이다.",
  "커패시터의 초깃값은 0으로 가정한다.",
  "V_TH = 2.718V",            // e의 수치 제시가 아니라 그냥 전압값
];
for (const s of KEEP) {
  const out = stripEulerGiven(s);
  check(`보존 — "${s}"`, out === s, `→ "${out}"`);
}

console.log("[3] 조건 배열 — 빈 항목 제거");
{
  const list = ["모든 소자는 이상적이다.", "(단, e = 2.718로 계산한다.)", "R = 2Ω"];
  const out = stripEulerGivenList(list);
  check("e 조건 항목이 통째로 사라짐", out.length === 2 && out[0].includes("이상적") && out[1] === "R = 2Ω",
    JSON.stringify(out));
  check("undefined 안전", stripEulerGivenList(undefined) === undefined);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass}/${pass + fail} 통과`);
process.exit(fail === 0 ? 0 : 1);
