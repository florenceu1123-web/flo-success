// 점전하 + 무한 선전하 → 크기 비로 선전하 밀도 역산 + 힘 (2023 전기 A-10) 레지스트리 항목 검증 (API 없음)
//
//   사용자 신고(2026-08-01): "비슷해 보이는 문제가 생성되는데 전혀 다른 걸 요구한다".
//   실측 화면 = `sheet_line_efield_superposition`(무한 **면**전하 + 선전하, E=0 조건 → ρ_l).
//   원본은 **점전하** + 선전하 / **크기 비** 조건 / 마지막이 **힘 F**다.
//
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokePointLineChargeForce.mjs
import {
  classifyElectromagnetics, detectPointLineChargeForce, detectSheetLineEfieldSuperposition,
  detectTwoPointCharges, detectSheetRingEfield,
} from "../lib/analysis/classifyElectromagnetics.ts";
import { generateElectromagnetics } from "../lib/generation/topologies/electromagnetics.ts";
import { renderEmFieldDiagram } from "../lib/renderers/emFieldRenderer.ts";

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ""}`); }
};
const mk = (topic, interpretation, concepts = []) => ({
  topic, interpretation, relatedConcepts: concepts, fillInTheBlanks: [], componentInventory: [],
});

// ─────────────────────────────────────────────────────────────────────
console.log("\n[1] 라우팅 — 원본(2023 전기 A-10)");
const REAL = mk(
  "점전하와 무한 선전하에 의한 전계",
  "자유 공간에서 −3[nC]의 점전하가 점 P(2, −1, 2)에 있고, k[nC/m]의 균일한 선전하가 점 (−1, 1, 0)을 지나고 z축과 평행하게 놓여 있다. 점 P의 점전하에 의한 원점 O에서의 전계는 E₁이고 무한 선전하에 의한 원점 O에서의 전계는 E₂이다. 전계의 크기 비 |E₁|:|E₂| = 1:√2 가 되는 k 값과, 2[C]의 전하가 원점 O에 있을 때 합성 전계에 의해 전하에 작용하는 힘 F를 구한다.",
  ["점전하", "무한 선전하", "합성 전계", "전계의 크기 비", "전하에 작용하는 힘", "단위 벡터"],
);
ok("원본 요약 → detect 발화", detectPointLineChargeForce(REAL) === true);
ok("원본 요약 → 면전하+선전하 항목은 양보", detectSheetLineEfieldSuperposition(REAL) === false);
ok("원본 요약 → 두 점전하 항목은 미발화", detectTwoPointCharges(REAL) === false);

// Vision 요약이 흔들리는 회차들
const WOBBLE = [
  ["힘·비율 표현이 빠진 짧은 요약", mk(
    "점전하와 선전하의 합성 전계",
    "자유 공간에서 점전하와 z축에 평행한 무한 선전하가 있을 때 원점에서의 합성 전계를 구하는 문제이다.",
    ["점전하", "선전하", "전계"],
  )],
  ["'전기장'으로 표현한 회차", mk(
    "점전하·선전하에 의한 전기장",
    "점 P에 놓인 점전하와 무한히 긴 선전하에 의해 원점에 생기는 전기장의 크기 비로부터 선전하 밀도를 구하고, 원점의 전하에 작용하는 힘을 구한다.",
    ["점전하", "선전하", "전기장", "힘"],
  )],
];
for (const [name, a] of WOBBLE) {
  ok(`${name} → detect 발화`, detectPointLineChargeForce(a) === true);
  ok(`${name} → 면전하 항목 양보`, detectSheetLineEfieldSuperposition(a) === false);
}

console.log("\n[2] 형제 회귀 — 남의 유형을 뺏지 않는다");
const SIBLINGS = [
  ["면전하 + 선전하 합성 전계 (임용 11번)", mk(
    "무한 면전하와 무한 선전하의 합성 전계",
    "무한 면전하와 무한 선전하가 주어졌을 때 점 P에서 합성 전계가 0이 되는 선전하 밀도를 구하고, 점 Q에서의 합성 전계를 계산한다.",
    ["무한 면전하", "무한 선전하", "합성 전계", "가우스 법칙"],
  ), detectSheetLineEfieldSuperposition],
  ["두 점전하 합성 전계·전위 (임용 4번)", mk(
    "두 점전하의 전계와 전위",
    "자유 공간에서 Q_A의 점전하가 점 A(0,3,0)에 있고 Q_B의 점전하가 점 B(0,0,3)에 놓여 있을 때, 점 P(0,3,3)에서 두 점전하에 의한 전계의 크기와 전위를 구한다.",
    ["점전하", "전계", "전위", "중첩"],
  ), detectTwoPointCharges],
  ["면전하 + 원형 링 (sheet_ring)", mk(
    "무한 면전하와 원형 링 선전하의 축상 합성 전계",
    "무한 면전하와 반지름 a인 원형 링 선전하가 있을 때 축상에서 두 전계 크기의 비 조건으로 선전하 밀도 λ를 구한다.",
    ["면전하", "원형 링", "선전하", "합성 전계"],
  ), detectSheetRingEfield],
];
for (const [name, a, siblingDetect] of SIBLINGS) {
  ok(`${name} → 뺏기지 않음`, detectPointLineChargeForce(a) === false);
  ok(`${name} → 원래 항목은 정상 발화`, siblingDetect(a) === true);
}

// ─────────────────────────────────────────────────────────────────────
console.log("\n[3] 물리 자체 검산 (양 모드 × 14 seed) — 벡터를 독립 파싱해 재계산");

/** 답 문자열에서 \mathbf{a}_x 계수를 뽑아 [x,y,z] 벡터로. */
function parseVec(tex) {
  const v = [0, 0, 0];
  const re = /(?:^|[+\-])\s*(\d*)\\mathbf\{a\}_([xyz])/g;
  let m, any = false;
  // 부호를 정확히 잡기 위해 토큰 단위로 훑는다
  const tokens = tex.match(/[+-]?\s*\d*\\mathbf\{a\}_[xyz]/g) ?? [];
  for (const tok of tokens) {
    any = true;
    const neg = /^\s*-/.test(tok);
    const numMatch = tok.match(/(\d+)\\mathbf/);
    const mag = numMatch ? Number(numMatch[1]) : 1;
    const axis = tok.match(/_([xyz])/)[1];
    v[{ x: 0, y: 1, z: 2 }[axis]] = neg ? -mag : mag;
  }
  void re; void m;
  return any ? v : null;
}

const MODES = ["exam_similar", "exam_variant"];
for (const mode of MODES) {
  let bad = 0;
  const notes = [];
  for (let seed = 1; seed <= 14; seed++) {
    const inst = generateElectromagnetics({ entryId: "point_line_charge_force", mode, seed });
    const why = [];
    if (inst.entryId !== "point_line_charge_force") why.push(`entryId=${inst.entryId}`);

    // 본문에서 주어진 값들을 뽑아 물리를 **처음부터 다시** 계산한다.
    const posM = inst.content.match(/\\mathrm\{P\}\((-?\d+),\\,\s*(-?\d+),\\,\s*(-?\d+)\)/);
    const lineM = inst.content.match(/점 \\\( \((-?\d+),\\,\s*(-?\d+),\\,\s*0\) \\\)/);
    const qM = inst.content.match(/\\\( (\d+)\\,\[\\mathrm\{C\}\] \\\)/);
    if (!posM) why.push("P 좌표 파싱 실패");
    if (!lineM) why.push("선 통과점 파싱 실패");
    if (!qM) why.push("전하 q 파싱 실패");

    if (posM && lineM && qM) {
      const P = [Number(posM[1]), Number(posM[2]), Number(posM[3])];
      const Lp = [Number(lineM[1]), Number(lineM[2])];
      const q = Number(qM[1]);
      const d = Math.hypot(P[0], P[1], P[2]);
      if (Math.abs(d - 3) > 1e-9) why.push(`|OP|=${d} (3이어야 함)`);

      // 답에서 E₁·F 벡터를 파싱
      const lines = inst.answer.split("\n");
      const e1Line = lines.find((l) => l.includes("\\mathbf{E}_1 ="));
      const fLine = lines.find((l) => l.includes("\\mathbf{F} ="));
      const E1 = e1Line ? parseVec(e1Line.split("\\mathbf{E}_1 =")[1]) : null;
      const F = fLine ? parseVec(fLine.split("\\mathbf{F} =")[1]) : null;
      if (!E1) why.push("E₁ 파싱 실패");
      if (!F) why.push("F 파싱 실패");

      if (E1 && F) {
        // E₁ = c₁·(O−P) 이고 c₁ = 9Q/d³ — 방향이 (O−P)와 평행해야 한다.
        const c1x = P[0] !== 0 ? E1[0] / -P[0] : null;
        const c1y = P[1] !== 0 ? E1[1] / -P[1] : null;
        const c1z = P[2] !== 0 ? E1[2] / -P[2] : null;
        const c1s = [c1x, c1y, c1z].filter((x) => x !== null);
        if (new Set(c1s.map((x) => x.toFixed(6))).size !== 1) why.push("E₁이 (O−P)와 평행하지 않음");
        const c1 = c1s[0];
        if (!Number.isInteger(c1)) why.push(`c₁=${c1} 정수 아님`);

        // E₂ = F/q − E₁ 이어야 하고, 방향은 (−lx,−ly,0)와 평행 + z성분 0
        const E2 = [F[0] / q - E1[0], F[1] / q - E1[1], F[2] / q - E1[2]];
        if (Math.abs(E2[2]) > 1e-9) why.push(`E₂의 z성분=${E2[2]} (0이어야 함)`);
        const c2x = Lp[0] !== 0 ? E2[0] / -Lp[0] : null;
        const c2y = Lp[1] !== 0 ? E2[1] / -Lp[1] : null;
        const c2s = [c2x, c2y].filter((x) => x !== null);
        if (new Set(c2s.map((x) => x.toFixed(6))).size !== 1) why.push("E₂가 선까지의 수직벡터와 평행하지 않음");
        const c2 = c2s[0];
        if (!Number.isInteger(c2) || c2 <= 0) why.push(`c₂=${c2} (양의 정수여야 함: k>0)`);

        // 크기 비 조건 — 본문의 1:r 과 실제 |E₂|/|E₁| 이 일치하는가
        const absE1 = Math.hypot(...E1);
        const absE2 = Math.hypot(...E2);
        const rTexM = inst.content.match(/1\s*:\s*(\\sqrt\{2\}|\d+)/);
        if (!rTexM) why.push("비율 r 파싱 실패");
        else {
          const r = rTexM[1] === "\\sqrt{2}" ? Math.SQRT2 : Number(rTexM[1]);
          if (Math.abs(absE2 / absE1 - r) > 1e-9) why.push(`비율 불일치 ${(absE2 / absE1).toFixed(4)} ≠ ${r.toFixed(4)}`);
        }
        // |E₁| = 9|Q|/d² = 3|c₁| 인지 (d=3)
        if (Math.abs(absE1 - 3 * Math.abs(c1)) > 1e-9) why.push("|E₁| 불일치");
        // F = q(E₁+E₂) 재검산
        for (let i = 0; i < 3; i++) {
          if (Math.abs(F[i] - q * (E1[i] + E2[i])) > 1e-9) why.push(`F 성분 ${i} 불일치`);
        }
      }
    }

    // 구조 — 3단계 발문·정답, 그림
    // ※ 단계 본문이 "[단계 1]과 [단계 2]의 결과를 이용하여"처럼 앞 단계를 인용하므로,
    //   전체 매치 수가 아니라 **줄 시작**의 단계 표기를 센다.
    const stepHeads = (s) => s.split("\n").filter((l) => /^\[단계 \d\]/.test(l.trim())).length;
    if (stepHeads(inst.question) !== 3) why.push("발문 3단계 아님");
    if (stepHeads(inst.answer) !== 3) why.push("정답 3단계 아님");
    if (inst.steps.length !== 3) why.push("풀이 3단계 아님");
    if (inst.diagram?.geometry !== "point_line_charge_axes") why.push("geometry");
    // 원본 튜플이 그대로 나오면 안 된다
    if (/\\mathrm\{P\}\(2,\\, -1,\\, 2\)/.test(inst.content) && /-3\\,\[\\mathrm\{nC\}\]/.test(inst.content)
        && /\(-1,\\, 1,\\, 0\)/.test(inst.content)) why.push("원본 튜플 재생성");

    if (why.length) { bad++; notes.push(`seed${seed}: ${[...new Set(why)].join(", ")}`); }
  }
  ok(`${mode} — 14 seed 전부 검산 통과`, bad === 0, notes.slice(0, 3).join(" / "));
}

// ─────────────────────────────────────────────────────────────────────
console.log("\n[4] 원본 값 재현 검산 (손계산 대조)");
{
  // 원본: P(2,−1,2), Q=−3nC, 선 (−1,1,0)∥z, r=√2, q=2C
  //   E₁ = (2,−1,2), E₂ = (3,−3,0), k = 1/3 nC/m, F = (10,−8,4) N
  const c1 = -3 / 3;                       // = −1
  const E1 = [c1 * -2, c1 * 1, c1 * -2];   // (2, −1, 2)
  ok("원본 E₁ = 2a_x − a_y + 2a_z", E1.join(",") === "2,-1,2", E1.join(","));
  const absE1 = Math.hypot(...E1);
  ok("원본 |E₁| = 3", Math.abs(absE1 - 3) < 1e-12);
  const rho = Math.SQRT2;
  const k = (Math.SQRT2 * Math.abs(c1) * rho) / 6;    // r|c₁|ρ/6
  ok("원본 k = 1/3 [nC/m]", Math.abs(k - 1 / 3) < 1e-12, String(k));
  const c2 = 18 * k / (rho * rho);                    // = 3
  const E2 = [c2 * 1, c2 * -1, 0];
  ok("원본 E₂ = 3a_x − 3a_y", E2.join(",") === "3,-3,0", E2.join(","));
  ok("원본 |E₂| = √2·|E₁|", Math.abs(Math.hypot(...E2) - Math.SQRT2 * absE1) < 1e-12);
  const F = [2 * (E1[0] + E2[0]), 2 * (E1[1] + E2[1]), 2 * (E1[2] + E2[2])];
  ok("원본 F = 10a_x − 8a_y + 4a_z [N]", F.join(",") === "10,-8,4", F.join(","));
}

console.log("\n[5] 그림 렌더러");
{
  const inst = generateElectromagnetics({ entryId: "point_line_charge_force", mode: "exam_similar", seed: 5 });
  const svg = renderEmFieldDiagram(inst.diagram);
  ok("SVG 생성", svg.includes("<svg"));
  ok("에러 <pre> 없음", !svg.includes("<pre"));
  for (const l of ["z[m]", "y[m]", "x[m]", "O", "ρ"]) ok(`라벨 "${l}" 포함`, svg.includes(l));
}

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
