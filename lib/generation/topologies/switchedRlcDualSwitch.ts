import type { SwitchedRlcDualSwitchCircuitDiagram, GenerationMode } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * SW1 닫힘 + SW2(접점 b→c) 2전압원 RLC → 초기조건 + 2차 미분방정식 + v_c(t) (2022 전기 B-5) — 전용 archetype.
 * GPT 없음(닫힌형 + 유리수 연산).
 *
 *  (가) 고정 토폴로지 (원본 그대로):
 *      V_s(좌, 세로) — 상단 SW₁(t=0 닫힘) — R₁ — L(전류 i₁) — 노드 a
 *      노드 a — C(세로, v_c) — 하단 rail
 *      노드 a — SW₂(t=0에 접점 b→c) — { 접점 b: V_b(세로), 접점 c: R₂(세로) } — 하단 rail
 *   t<0: SW₁ 열림 → **i₁(0₊)=0**, SW₂=b → 커패시터가 V_b에 직결 → **v_c(0₊)=V_b**.
 *
 * ★ 물리(닫힌형):
 *    KVL(t≥0): V_s = R₁i₁ + L·i₁' + v_c
 *    KCL(노드 a): i₁ = C·v_c' + v_c/R₂
 *    두 식을 결합 → **LC·v_c'' + (R₁C + L/R₂)·v_c' + (1 + R₁/R₂)·v_c = V_s**
 *      정규화: v_c'' + a₁v_c' + a₀v_c = V_s/(LC),  a₁ = R₁/L + 1/(R₂C),  a₀ = (1+R₁/R₂)/(LC)
 *    초기조건: v_c(0₊)=V_b,  **v_c'(0₊) = (i₁(0₊) − v_c(0₊)/R₂)/C = −V_b/(R₂C)**
 *    해(과제동, 서로 다른 실근 −p·−q): v_c(t) = v_∞ + A·e^(−pt) + B·e^(−qt),
 *      v_∞ = V_s·R₂/(R₁+R₂),  A+B = V_b − v_∞,  pA + qB = V_b/(R₂C)
 *    변형(구하는 양 교환) i₁(t) = C·v_c' + v_c/R₂
 *      = v_∞/R₂ + A(1/R₂ − pC)e^(−pt) + B(1/R₂ − qC)e^(−qt)
 *  원본 검산(V_s=1·R₁=4·L=1·C=½·R₂=2·V_b=2): v_c''+5v_c'+6v_c=2, (s+2)(s+3),
 *      **v_c(t) = 1/3 + 3e^(−2t) − (4/3)e^(−3t)**,  i₁(t) = 1/6 − (3/2)e^(−2t) + (4/3)e^(−3t).
 *      (원본의 라플라스 행렬식 [[s+4, 1],[−2, s+1]]·[I₁,V_c]ᵀ = [1/s, 2]ᵀ 로 푼 결과와 동일 — 손검산 완료.)
 *
 * ★ 왜 전용 archetype인가: 실측에서 이 원본이 `switched_rlc_step`(v1 3-leg: 전류원 + R_c+L 병렬가지)로 가서
 *   ★전류원이 없는 이 회로가 전류원 회로로 변질★되고 지수 계수도 지저분해졌다. 두 스위치(직렬 SW₁ + SPDT SW₂)와
 *   "커패시터가 V_b로 사전충전, t≥0에 R₂ 부하로 전환"이라는 구조는 기존 archetype 어느 것도 그리지 못한다.
 *
 * ★ 값은 예시 hardcode가 아니라 ★규칙 열거+필터★ — 특성근이 서로 다른 양의 정수, 계수는 분모 ≤ 6. 원본 튜플 제외.
 */

// ── 유리수 (정확 연산 — 1/3·−4/3 같은 답을 반올림 없이) ──
type Q = { n: number; d: number };
function gcd(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) { const t = a % b; a = b; b = t; } return a || 1; }
function q(n: number, d = 1): Q { const g = gcd(n, d) || 1; const s = d < 0 ? -1 : 1; return { n: (s * n) / g, d: (s * d) / g }; }
const qAdd = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
const qSub = (a: Q, b: Q): Q => q(a.n * b.d - b.n * a.d, a.d * b.d);
const qMul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
const qDiv = (a: Q, b: Q): Q => q(a.n * b.d, a.d * b.n);
const qNum = (a: Q): number => a.n / a.d;
/** 유리수 표기 — 정수면 그대로, 아니면 "n/d" (음수는 앞에 −). */
function qText(a: Q): string {
  if (a.d === 1) return String(a.n);
  return `${a.n < 0 ? "-" : ""}${Math.abs(a.n)}/${a.d}`;
}
/** 계수 표기 — 1이면 생략, −1이면 "−". (예: "3e^(−2t)", "e^(−3t)") */
function coefText(a: Q): string {
  if (a.d === 1 && a.n === 1) return "";
  if (a.d === 1 && a.n === -1) return "-";
  return qText(a);
}
/** 항 연결 — "+ 3e^(−2t)" / "− 4/3·e^(−3t)". */
function termText(a: Q, expo: number): string {
  const neg = qNum(a) < 0;
  const mag = neg ? q(-a.n, a.d) : a;
  const c = coefText(mag);
  const body = c === "" ? `e^(-${expo}t)` : `${c}·e^(-${expo}t)`;
  return `${neg ? " - " : " + "}${body}`;
}

export type SwitchedRlcDualSwitchGeneration = {
  values: {
    Vs: number; R1: number; L: number; Cn: number; Cd: number; R2: number; Vb: number;
    vsLabel: string; r1Label: string; lLabel: string; cLabel: string; r2Label: string; vbLabel: string;
  };
  answer: {
    i1_0: number;          // i₁(0₊) — 항상 0 (SW₁이 t<0에 열림)
    vc_0: number;          // v_c(0₊) = V_b
    dvc_0: string;         // v_c'(0₊)
    odeText: string;       // 정규화된 2차 미분방정식
    odeRawText: string;    // 정규화 전(소자값 그대로) 미분방정식
    roots: [number, number];
    vInf: string;          // v_c(∞)
    vcText: string;        // v_c(t)
    i1Text: string;        // i₁(t)
    i1Inf: string;         // i₁(∞)
  };
  circuitDiagram: SwitchedRlcDualSwitchCircuitDiagram;
};

/** family: 전원·소자값 (C = Cn/Cd [F]). */
type Family = { Vs: number; R1: number; L: number; Cn: number; Cd: number; R2: number; Vb: number };

// 원본 튜플 (참조·검증 전용, 생성 풀 제외): V_s=1 · R₁=4 · L=1 · C=1/2 · R₂=2 · V_b=2.
const ORIGINAL: Family = { Vs: 1, R1: 4, L: 1, Cn: 1, Cd: 2, R2: 2, Vb: 2 };

function solve(f: Family): SwitchedRlcDualSwitchGeneration {
  const { Vs, R1, L, Cn, Cd, R2, Vb } = f;
  const C = q(Cn, Cd);
  const invC = qDiv(q(1), C);

  // v'' + a₁v' + a₀v = V_s/(LC)
  const a1 = qAdd(q(R1, L), qDiv(invC, q(R2)));            // R₁/L + 1/(R₂C)
  const a0 = qDiv(qAdd(q(1), q(R1, R2)), qMul(q(L), C));   // (1+R₁/R₂)/(LC)
  const rhs = qDiv(q(Vs), qMul(q(L), C));                  // V_s/(LC)

  // 특성근 — s² + a₁s + a₀ = 0
  const A1 = qNum(a1), A0 = qNum(a0);
  const disc = A1 * A1 - 4 * A0;
  const sq = Math.sqrt(Math.max(disc, 0));
  const p = (A1 - sq) / 2, r = (A1 + sq) / 2;              // 근: −p, −r (p < r)

  const vInf = q(Vs * R2, R1 + R2);                        // v_c(∞)
  const S = qSub(q(Vb), vInf);                             // A + B
  const T = qMul(q(Vb), qDiv(invC, q(R2)));                // pA + qB = V_b/(R₂C)
  // A = (T − r·S)/(p − r), B = S − A
  const A = qDiv(qSub(T, qMul(q(r), S)), q(p - r));
  const B = qSub(S, A);

  const vcText = `v_c(t) = ${qText(vInf)}${termText(A, p)}${termText(B, r)} [V]  (t ≥ 0)`;
  const odeText = `v_c'' + ${qText(a1)}·v_c' + ${qText(a0)}·v_c = ${qText(rhs)}`;
  const odeRawText = `${qText(qMul(q(L), C))}·v_c'' + ${qText(qAdd(qMul(q(R1), C), q(L, R2)))}·v_c' + ${qText(qAdd(q(1), q(R1, R2)))}·v_c = ${Vs}`;
  const dvc0 = qMul(q(-Vb), qDiv(invC, q(R2)));            // −V_b/(R₂C)

  // 변형(구하는 양 교환) — i₁(t) = C·v_c' + v_c/R₂
  const iA = qMul(A, qSub(q(1, R2), qMul(q(p), C)));
  const iB = qMul(B, qSub(q(1, R2), qMul(q(r), C)));
  const iInf = q(Vs, R1 + R2);
  const i1Text = `i_1(t) = ${qText(iInf)}${termText(iA, p)}${termText(iB, r)} [A]  (t ≥ 0)`;

  const cLabel = C.d === 1 ? `${C.n}[F]` : `${C.n}/${C.d}[F]`;
  const circuitDiagram: SwitchedRlcDualSwitchCircuitDiagram = {
    vsLabel: `${Vs}[V]`, r1Label: `${R1}[Ω]`, lLabel: `${L}[H]`, cLabel,
    vbLabel: `${Vb}[V]`, r2Label: `${R2}[Ω]`,
    currentLabel: "i₁(t)", vcLabel: "v_c(t)",
  };

  return {
    values: {
      Vs, R1, L, Cn: C.n, Cd: C.d, R2, Vb,
      vsLabel: circuitDiagram.vsLabel, r1Label: circuitDiagram.r1Label, lLabel: circuitDiagram.lLabel,
      cLabel, r2Label: circuitDiagram.r2Label, vbLabel: circuitDiagram.vbLabel,
    },
    answer: {
      i1_0: 0, vc_0: Vb, dvc_0: `${qText(dvc0)} [V/s]`,
      odeText, odeRawText, roots: [p, r],
      vInf: qText(vInf), vcText, i1Text, i1Inf: qText(iInf),
    },
    circuitDiagram,
  };
}

/**
 * 규칙 열거 + 필터 (특정 예시 hardcode 금지).
 *  · 특성근이 **서로 다른 양의 정수**(과제동 — 원본과 같은 형태, 지저분한 무리수 배제)
 *  · v_c(∞)·A·B·i₁ 계수의 분모 ≤ 6 (원본의 1/3·3·−4/3 수준)
 *  · v_c(0₊)=V_b ≠ v_c(∞) (전이가 있어야 문제가 성립)
 *  · 원본 튜플 제외
 */
function buildSpace(): Family[] {
  const out: Family[] = [];
  const denomOk = (x: Q) => x.d <= 6;
  for (const L of [1, 2]) {
    for (const Cd of [2, 3, 4]) {
      for (const R1 of [1, 2, 3, 4, 5, 6, 8]) {
        for (const R2 of [1, 2, 3, 4]) {
          // 특성근 정수 판정은 값(Vs·Vb)과 무관 — 먼저 걸러 열거량을 줄인다.
          const C = q(1, Cd);
          const a1 = qAdd(q(R1, L), qDiv(qDiv(q(1), C), q(R2)));
          const a0 = qDiv(qAdd(q(1), q(R1, R2)), qMul(q(L), C));
          const A1 = qNum(a1), A0 = qNum(a0);
          const disc = A1 * A1 - 4 * A0;
          if (disc <= 1e-9) continue;                       // 서로 다른 실근(과제동)
          const sq = Math.sqrt(disc);
          const p = (A1 - sq) / 2, r = (A1 + sq) / 2;
          if (!Number.isInteger(Math.round(p * 1e6) / 1e6) || !Number.isInteger(Math.round(r * 1e6) / 1e6)) continue;
          if (Math.abs(p - Math.round(p)) > 1e-9 || Math.abs(r - Math.round(r)) > 1e-9) continue;
          if (p < 1 || r > 12) continue;
          for (const Vs of [1, 2, 3, 4, 6, 8]) {
            for (const Vb of [1, 2, 3, 4, 5, 6]) {
              const f: Family = { Vs, R1, L, Cn: 1, Cd, R2, Vb };
              const g = solve(f);
              const vInfQ = q(Vs * R2, R1 + R2);
              if (qNum(vInfQ) === Vb) continue;             // 전이 없음(이미 정상상태)
              if (!denomOk(vInfQ)) continue;
              // A·B·i₁ 계수 분모 검사 — 텍스트에서 역파싱하지 않고 다시 계산한다.
              const C2 = q(1, Cd), invC2 = qDiv(q(1), C2);
              const S = qSub(q(Vb), vInfQ);
              const T = qMul(q(Vb), qDiv(invC2, q(R2)));
              const A = qDiv(qSub(T, qMul(q(r), S)), q(p - r));
              const B = qSub(S, A);
              if (!denomOk(A) || !denomOk(B)) continue;
              if (A.n === 0 || B.n === 0) continue;         // 두 지수항이 모두 살아 있어야 한다
              const iA = qMul(A, qSub(q(1, R2), qMul(q(p), C2)));
              const iB = qMul(B, qSub(q(1, R2), qMul(q(r), C2)));
              if (!denomOk(iA) || !denomOk(iB) || !denomOk(q(Vs, R1 + R2))) continue;
              if (Math.abs(A.n) > 40 || Math.abs(B.n) > 40) continue;
              if (
                Vs === ORIGINAL.Vs && R1 === ORIGINAL.R1 && L === ORIGINAL.L &&
                Cd === ORIGINAL.Cd && R2 === ORIGINAL.R2 && Vb === ORIGINAL.Vb
              ) continue;                                    // 원본 튜플 제외
              void g;
              out.push(f);
            }
          }
        }
      }
    }
  }
  return out;
}
const SPACE = buildSpace();

/**
 * 유사·변형 모두 **같은 회로 구조**(원본 보존). 모드는 ★구하는 양★만 바꾼다:
 *   exam_similar = 커패시터 전압 v_c(t)  (원본)
 *   exam_variant = 인덕터 전류 i₁(t)     (같은 미분방정식에서 i₁ = C·v_c' + v_c/R₂)
 * 값 풀은 절반씩 나눠 두 모드가 서로 다른 수치를 쓰게 한다.
 */
export function generateSwitchedRlcDualSwitch(args: { seed?: number; mode: GenerationMode }): SwitchedRlcDualSwitchGeneration {
  const rand = makeRand(args.seed);
  for (let i = 0; i < 4; i++) rand(); // warm-up
  const half = Math.floor(SPACE.length / 2);
  const pool = SPACE.length < 8
    ? SPACE
    : args.mode === "exam_variant" ? SPACE.slice(half) : SPACE.slice(0, half);
  return solve(pick(pool.length ? pool : SPACE, rand));
}

/** 원본 검증용 (생성 풀 제외 튜플). */
export function __originalSwitchedRlcDualSwitchForVerify(): SwitchedRlcDualSwitchGeneration {
  return solve(ORIGINAL);
}
/** 스모크용 — 생성 풀 크기. */
export function __switchedRlcDualSwitchPoolSize(): number { return SPACE.length; }
