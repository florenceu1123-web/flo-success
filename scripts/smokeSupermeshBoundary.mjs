// 초메쉬 점선 a의 범위 검증 (API 호출 없음)
//   ★ 원본(임용 8번 (나)): 전류원 가지가 둘(종속 0.2V₂ · 독립 1A)이라 초메쉬는 세 메쉬를 모두 합친다.
//     → 점선은 두 전류원 가지를 **내부**에 두고 바깥 루프를 따라 그린다.
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeSupermeshBoundary.mjs
import { renderSupermeshSwitchedDependentCircuit } from "../lib/renderers/supermeshSwitchedDependentCircuitRenderer.ts";

const mk = (swState) => ({
  swState, vsLabel: "10V", r1Label: "10Ω", r2Label: "10Ω", r3Label: "10Ω", r4Label: "10Ω",
  depLabel: "0.2V₂", isLabel: "1A", v1Label: "V₁", v2Label: "V₂", showSupermesh: swState === "closed",
});
const VS_X = 72, DEP_X = 252, SW_X = 432, RT_X = 612; // 렌더러와 동일한 고정 슬롯 x좌표

const closed = renderSupermeshSwitchedDependentCircuit(mk("closed"));
const open = renderSupermeshSwitchedDependentCircuit(mk("open"));
const m = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"[^>]*dasharray/.exec(closed);
const box = m ? { x1: +m[1], y1: +m[2], x2: +m[1] + +m[3], y2: +m[2] + +m[4] } : null;

const cases = [
  ["(나)에 점선 존재", Boolean(box), true],
  ["(가)에는 점선 없음", /dasharray/.test(open) === false, true],
  ["종속전류원(0.2V₂) 가지가 점선 내부", Boolean(box && box.x1 < DEP_X && DEP_X < box.x2), true],
  ["독립 전류원(1A)·SW 가지가 점선 내부", Boolean(box && box.x1 < SW_X && SW_X < box.x2), true],
  ["전압원 V_s 가지는 점선 경계 밖(왼쪽)", Boolean(box && VS_X < box.x1), true],
  ["우외곽 도선은 점선 경계 밖(오른쪽)", Boolean(box && RT_X > box.x2), true],
  ["점선이 상단 저항 아래(회로 내부)에서 시작", Boolean(box && box.y1 > 92), true],
  ["점선 라벨 a 표기", /fill="#[a-fA-F0-9]{6}">a<\/text>|>a<\/text>/.test(closed), true],
];
let pass = 0;
for (const [name, got, want] of cases) {
  const ok = got === want; if (ok) pass++;
  console.log(`${ok ? "✓" : "✗"} ${name}`);
}
if (box) console.log(`점선 범위: x=${box.x1}..${box.x2}, y=${box.y1}..${box.y2}`);
console.log(`${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
process.exit(pass === cases.length ? 0 : 1);
