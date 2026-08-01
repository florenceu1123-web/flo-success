// JFET 전압(분압) 바이어스 (임용 2번) 전용 archetype 검증 (API 없음)
//
//   사용자 신고(2026-08-01): "유사문제를 생성하지 못해". 실측 화면 = **NMOS DC bias(포화영역)** —
//   소스 접지 + 제곱법칙 I_D=K(V_GS−V_TH)². 분압 저항 2개·소스 저항이 통째로 사라졌다.
//   JFET는 코드 어디에도 없던 미구현 유형이었다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeJfetVoltageBias.mjs
import { classifyCircuitType } from "../lib/analysis/classifyCircuitType.ts";
import { detectJfetVoltageBias } from "../lib/pipeline/runJfetVoltageBiasPipeline.ts";
import { generateJfetVoltageBias } from "../lib/generation/topologies/jfetVoltageBias.ts";
import { renderJfetBiasCircuit } from "../lib/renderers/jfetBiasCircuitRenderer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const inv = (...items) => items.map((s, i) => {
  const [type, value] = s.split(":");
  return { id: `c${i}`, type, ...(value ? { value } : {}) };
});
const mk = (topic, interpretation, concepts = [], inventory = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: inventory,
});

console.log("\n[1] 라우팅 — 원본(임용 2번)");
const REAL = mk(
  "JFET 전압 바이어스 회로",
  "JFET 전압 바이어스 회로에서 JFET의 드레인 전압 V_D = 13[V]이고 게이트-소스 전압 V_GS = −4[V]일 때, 게이트 전압 V_G[V]와 드레인 저항 R_D[Ω]를 구하는 문제이다. JFET는 이상적으로 동작하고 게이트 전류는 무시한다.",
  ["JFET", "전압 바이어스", "분압", "드레인 저항"],
  inv("V:+15V", "R:180kΩ", "R:120kΩ", "R:1kΩ", "JFET"),
);
for (const subject of ["electronics", "circuit_theory", "digital_logic"]) {
  const got = classifyCircuitType(REAL, subject).type;
  ok(`원본 → jfet_voltage_bias (subject=${subject})`, got === "jfet_voltage_bias", `got ${got}`);
}
ok("원본 → detect 발화", detectJfetVoltageBias(REAL) === true);

// 요약이 흔들려도 — 인벤토리에만 JFET가 남은 회차
ok("인벤토리에만 JFET", classifyCircuitType(mk(
  "전계효과 트랜지스터 바이어스 회로",
  "바이어스 회로에서 게이트 전압과 드레인 저항을 구한다.",
  ["바이어스"],
  inv("V:+15V", "R:180kΩ", "R:120kΩ", "R:1kΩ", "JFET"),
), "electronics").type === "jfet_voltage_bias");

console.log("\n[2] 형제 회귀 — MOSFET/BJT 유형을 뺏지 않는다");
const SIBLINGS = [
  ["NMOS DC 바이어스 (제곱법칙)", mk(
    "NMOS 트랜지스터 DC 바이어스",
    "포화 영역에서 동작하는 NMOS 회로에서 I_D = K(V_GS − V_TH)²를 이용하여 드레인 전류와 드레인 전압을 구한다.",
    ["NMOS", "포화 영역", "문턱 전압"],
    inv("V:15V", "R:1kΩ", "MOSFET"),
  )],
  ["BJT 바이어스", mk(
    "BJT 이미터 바이어스 회로",
    "베이스 분압 바이어스 BJT 회로에서 V_BE=0.7V를 이용하여 이미터 전류와 컬렉터 전압을 구한다.",
    ["BJT", "바이어스", "베이스 분압"],
    inv("V:12V", "R:47kΩ", "R:10kΩ", "R:1kΩ", "BJT"),
  )],
];
for (const [name, a] of SIBLINGS) {
  const got = classifyCircuitType(a, "electronics").type;
  ok(`${name} → 뺏기지 않음 (got ${got})`, got !== "jfet_voltage_bias");
  ok(`${name} → detect 미발화`, detectJfetVoltageBias(a) === false);
}

console.log("\n[3] 물리 자체 검산 (양 모드 × 20 seed) — 값을 처음부터 다시 계산");
for (const mode of ["exam_similar", "exam_variant"]) {
  let bad = 0; const notes = [];
  for (let seed = 1; seed <= 20; seed++) {
    const g = generateJfetVoltageBias({ seed, mode });
    const v = g.values, d = g.derived, why = [];

    // 물리 재계산 (독립)
    const vg = (v.vdd * v.r2k) / (v.r1k + v.r2k);
    const vs = vg - v.vgs;
    const id = vs / v.rsk;                 // mA
    const vd = v.vdd - id * v.rdk;
    const vds = vd - vs;
    if (Math.abs(vg - d.vg) > 1e-9) why.push(`V_G ${d.vg}≠${vg}`);
    if (Math.abs(vs - d.vs) > 1e-9) why.push(`V_S ${d.vs}≠${vs}`);
    if (Math.abs(id - d.idMa) > 1e-9) why.push(`I_D ${d.idMa}≠${id}`);
    if (Math.abs(vd - v.vd) > 1e-9) why.push(`V_D ${v.vd}≠${vd}`);
    if (Math.abs(vds - d.vds) > 1e-9) why.push(`V_DS ${d.vds}≠${vds}`);
    // R_D 역산이 실제로 성립하는가 (원본이 묻는 양)
    const rdBack = (v.vdd - v.vd) / d.idMa;
    if (Math.abs(rdBack - v.rdk) > 1e-9) why.push(`R_D 역산 ${rdBack}≠${v.rdk}`);

    // 물리적 타당성
    if (!Number.isInteger(vg)) why.push("V_G 정수 아님");
    if (v.vgs >= 0) why.push("V_GS가 음수 아님");
    if (vs <= 0 || vs >= v.vdd) why.push("V_S 범위");
    if (vd <= vs) why.push("V_DS ≤ 0 (JFET 동작 불가)");
    if (vds < Math.abs(v.vgs) + 1) why.push(`V_DS=${vds} 핀치오프 여유 부족`);
    if (id <= 0 || id > 20) why.push(`I_D=${id} 범위`);
    // 깔끔함
    if (Math.abs(id * 2 - Math.round(id * 2)) > 1e-9) why.push("I_D 지저분");
    if (!Number.isInteger(vd)) why.push(`V_D=${vd} 정수 아님`);
    if (v.vdd - vd < 1) why.push("R_D 양단 전압 < 1V");
    // 원본 튜플 재생성 금지
    if (v.vdd === 15 && v.r1k === 180 && v.r2k === 120 && v.vgs === -4 && v.rsk === 1 && Math.abs(v.rdk - 0.2) < 1e-9)
      why.push("원본 튜플 재생성");
    // 회로 payload — 유사는 R_D 미지(기호), 변형은 값이 주어진다
    const rdShown = g.circuitDiagram.rdLabel;
    if (mode === "exam_similar" && rdShown !== "R_D") why.push(`유사인데 R_D 값 노출: ${rdShown}`);
    if (mode === "exam_variant" && rdShown === "R_D") why.push("변형인데 R_D 미지");

    if (why.length) { bad++; notes.push(`seed${seed}: ${[...new Set(why)].join(", ")}`); }
  }
  ok(`${mode} — 20 seed 전부 검산 통과`, bad === 0, notes.slice(0, 3).join(" / "));
}

console.log("\n[4] 원본 값 재현 (손계산 대조)");
{
  const vdd = 15, r1 = 180, r2 = 120, vgs = -4, rs = 1, vd = 13;
  const vg = vdd * r2 / (r1 + r2);
  const vs = vg - vgs;
  const id = vs / rs;
  const rd = (vdd - vd) / id;
  ok("V_G = 6V", vg === 6, String(vg));
  ok("V_S = 10V", vs === 10, String(vs));
  ok("I_D = 10mA", id === 10, String(id));
  ok("R_D = 200Ω", Math.abs(rd * 1000 - 200) < 1e-9, String(rd * 1000));
}

console.log("\n[5] 전용 렌더러");
{
  const g = generateJfetVoltageBias({ seed: 3, mode: "exam_similar" });
  const svg = renderJfetBiasCircuit(g.circuitDiagram);
  ok("SVG 생성", svg.startsWith("<svg") && svg.endsWith("</svg>"));
  ok("에러 <pre> 없음", !svg.includes("<pre"));
  for (const l of ["G", "D", "S", "R_D"]) ok(`라벨 "${l}" 포함`, svg.includes(l));
  ok("LaTeX 잔재 없음(\\mathrm·\\,)", !svg.includes("\\mathrm") && !svg.includes("\\,"));
  ok("분압 저항 두 개 표기", svg.includes("180 kΩ") || svg.includes("kΩ"));
  ok("유사유형은 R_D를 미지로 표기", svg.includes("R_D"));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
