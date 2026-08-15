// analog_netlist 레이아웃 회귀 — "사다리 회로가 원본과 전혀 다르게 그려진다" 신고 (2026-08-02)
//
//   증상: 임용 3번류(24V — 4kΩ — 마디 — 1kΩ — 12mA / 마디 아래 2kΩ → 6kΩ∥3kΩ)를 생성하면
//         **연결 관계는 원본과 동일한데** 그림이 평평한 병렬 뱅크로 보였다.
//   원인 2가지:
//     (1) BFS root가 **접지**라 접지에 붙은 마디(전원 leg·전류원 leg·부하 leg)가 전부 같은 열에 몰림
//     (2) 병렬 뱅크 마디가 상단 레일에 남아 사다리의 "아래로 매달림"이 사라짐
//   수정: (1) 전원(+) 마디에서 **비접지 간선만** 따라 BFS → 좌→우 레일,
//         (2) 비접지 이웃 1개 + 접지 소자 ≥2인 마디는 부모 아래로 (dropHangingNodes).
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeNetlistLadderLayout.mjs
import { __nodePositionsForAudit, renderNetlistEdgeSVG } from "../lib/renderers/netlistEdgeRenderer.ts";

const R = (id, a, b, v) => ({ id, type: "R", value: v, pins: [{ id: "p1", node: a, side: "top" }, { id: "p2", node: b, side: "bottom" }] });
const S = (id, type, a, b, v) => ({ id, type, value: v, pins: [{ id: "p1", node: a, side: "top" }, { id: "p2", node: b, side: "bottom" }] });

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${extra}`); }
};

console.log("\n[1] 임용 3번류 사다리 — 원본과 같은 형태로 배치되는가");
{
  // 원본 구조: V(n1-GND) — R(n1-n2) — R(n2-n3) — I(n3-GND),  R(n2-n4),  R(n4-GND)∥R(n4-GND)
  const net = {
    ground: "GND",
    components: [
      R("R1", "n1", "n2", "4000Ω"), R("R2", "n2", "n3", "1000Ω"), R("R3", "n2", "n4", "2000Ω"),
      S("V1", "V", "n1", "GND", "24V"), S("I1", "I", "n3", "GND", "0.012A"),
      R("R4", "n4", "GND", "6000Ω"), R("R5", "n4", "GND", "3000Ω"),
    ],
  };
  const p = __nodePositionsForAudit(net);
  ok("전원 마디 n1이 가장 왼쪽", p.n1.x < p.n2.x && p.n1.x < p.n3.x, JSON.stringify(p));
  ok("레일 순서 n1 → n2 → n3 (좌→우)", p.n1.x < p.n2.x && p.n2.x < p.n3.x, JSON.stringify(p));
  ok("레일 마디는 같은 높이", p.n1.y === p.n2.y && p.n2.y === p.n3.y, JSON.stringify(p));
  ok("★ 병렬 뱅크 마디 n4는 n2 **아래**에 매달림", p.n4.x === p.n2.x && p.n4.y > p.n2.y, JSON.stringify(p));
  ok("접지는 맨 아래", p.GND.y > Math.max(p.n1.y, p.n4.y), JSON.stringify(p));
  const svg = renderNetlistEdgeSVG(net);
  ok("SVG 렌더 성공", svg.startsWith("<svg") && !svg.includes("<pre>"));
  ok("표시 이름이 내부 id가 아님 (R₁·V₁·I₁)", svg.includes("R₁") && svg.includes("V₁") && !svg.includes("R_leg"));
  ok("값 표기 kΩ·mA", svg.includes("4kΩ") && svg.includes("12mA"));
}

console.log("\n[2] 회귀 — 단순 직렬 회로는 여전히 좌→우 한 줄");
{
  const net = {
    ground: "GND",
    components: [
      S("V1", "V", "a", "GND", "10V"), R("R1", "a", "b", "100Ω"), R("R2", "b", "GND", "200Ω"),
    ],
  };
  const p = __nodePositionsForAudit(net);
  ok("a → b 좌→우", p.a.x < p.b.x, JSON.stringify(p));
  ok("b는 매달리지 않음 (접지 소자 1개뿐)", p.b.y === p.a.y, JSON.stringify(p));
}

console.log("\n[3] 회귀 — 전원이 없는 netlist도 렌더된다 (root fallback)");
{
  const net = { ground: "GND", components: [R("R1", "x", "y", "10Ω"), R("R2", "y", "GND", "20Ω")] };
  const svg = renderNetlistEdgeSVG(net);
  ok("SVG 렌더 성공", svg.startsWith("<svg") && !svg.includes("<pre>"));
}

console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail === 0 ? 0 : 1);
