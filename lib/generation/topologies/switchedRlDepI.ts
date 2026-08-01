import type { CircuitComponent, CircuitNetlist, MeasurementMark } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 스위치 RL + 종속 전류원(k·iₙ, CCCS) 과도응답 — 임용 2024 전기 B-5 형식 archetype.
 *
 * ★ 규칙 기반 generator (특정 예시 hardcode 금지) — 토폴로지에 KCL/KVL·RL 1차 과도 규칙을
 *   적용해 값을 enumerate 하고, 깔끔한 정수해만 채택한다. 원본 튜플은 생성 풀에서 제외.
 *
 * 고정 토폴로지 (노드 A=상단 rail, B=중간 마디, GND):
 *   Vs : A ─ GND                         (직류 전압원, V(A)=Vs)
 *   SW + R1 : A ─ GND (좌측)             (스위치 t=0 개방, iₙ = Vs/R1, R1 통과)
 *   k·iₙ(CCCS) : A ─ B 가지 (B→A 방향)   (종속 전류원, iₙ에 비례)
 *   L  : A ─ B                           (인덕터, i_L ↓ = A→B)
 *   R_R: B ─ GND                         (i_R ↓, 측정 대상)
 *
 * 해석 (V(A)=Vs 고정; 정상상태에서 L 단락 → V(B)=V(A)):
 *   iₙ = Vs/R1,  종속전류 = k·iₙ = k·Vs/R1 (B→A).
 *   [단계1] t=0⁻ 정상상태(SW 닫힘): KCL at B → i_L(0⁻) = i_R + k·iₙ = Vs(1/R_R + k/R1).
 *   [단계2] t=∞ (SW 개방 → iₙ=0 → 종속원=0): i_R(∞) = Vs/R_R  (= i_L(∞)).
 *   [단계3] t>0: τ = L/R_R,  i_R(t) = i_L(t) = Vs/R_R + (Vs·k/R1)·e^(−t/τ).
 */

export type SwitchedRlDepIGeneration = {
  netlist: CircuitNetlist;
  values: { Vs: number; R1: number; Rr: number; k: number; L: number };
  solution: {
    iN: number; // iₙ = Vs/R1
    iL0: number; // [1] i_L(0⁻)
    iRinf: number; // [2] i_R(∞)
    tau: number; // [3] τ = L/R_R
    coef: number; // 과도항 계수 = Vs·k/R1
    invTau: number; // 1/τ
    iRExpr: string; // i_R(t)
  };
  variant?: boolean;
};

/** 원본 튜플 (참조·물리검증 전용 — 생성 풀에서 제외). */
const ORIGINAL = { Vs: 12, R1: 20, Rr: 4, k: 10, L: 5 };

const VS_CANDS = [10, 12, 16, 18, 20, 24];
const R1_CANDS = [10, 12, 16, 20, 24];
const RR_CANDS = [2, 4, 5, 6, 8];
const K_CANDS = [2, 4, 5, 6, 8, 10];
const L_CANDS = [2, 4, 5, 6, 8, 10];

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const coefStr = (m: number) => (Math.abs(m) === 1 ? "" : `${round(Math.abs(m))}`);
const isNice = (x: number) => Math.abs(x - Math.round(x * 1000) / 1000) < 1e-9;

type Params = { Vs: number; R1: number; Rr: number; k: number; L: number };

/** 토폴로지에 규칙을 적용해 해를 계산한다 (범용 — 특정 값 가정 없음). */
function solve(p: Params) {
  const iN = p.Vs / p.R1;
  const iRinf = p.Vs / p.Rr;
  const coef = (p.Vs * p.k) / p.R1; // = Vs·k/R1
  const iL0 = iRinf + coef; // Vs(1/Rr + k/R1)
  const tau = p.L / p.Rr;
  const invTau = 1 / tau;
  return { iN, iRinf, coef, iL0, tau, invTau };
}

/** 깔끔한 해(정수 답·정수 1/τ)만 통과시키는 필터. */
function isClean(p: Params): boolean {
  const s = solve(p);
  if (!Number.isInteger(s.iRinf)) return false; // i_R(∞) 정수
  if (!Number.isInteger(s.coef)) return false; // 과도 계수 정수
  if (s.coef === 0) return false; // 종속원 효과가 0이면 무의미
  if (!isNice(round(s.tau)) || !Number.isInteger(s.invTau)) return false; // 1/τ 정수 → e^(−n t)
  if (s.invTau < 1 || s.invTau > 5) return false; // 지나치게 빠른/느린 응답 배제
  return true;
}

/** 같은 원본 튜플인지. */
const isOriginal = (p: Params) =>
  p.Vs === ORIGINAL.Vs && p.R1 === ORIGINAL.R1 && p.Rr === ORIGINAL.Rr && p.k === ORIGINAL.k && p.L === ORIGINAL.L;

/** 규칙 기반 후보 풀 (원본 제외). 결정론적으로 정렬. */
function buildPool(): Params[] {
  const out: Params[] = [];
  for (const Vs of VS_CANDS)
    for (const R1 of R1_CANDS)
      for (const Rr of RR_CANDS)
        for (const k of K_CANDS)
          for (const L of L_CANDS) {
            const p = { Vs, R1, Rr, k, L };
            if (isOriginal(p)) continue;
            if (isClean(p)) out.push(p);
          }
  // 중복 답(같은 i_R∞·계수·τ) 제거로 다양성 확보
  const seen = new Set<string>();
  const uniq: Params[] = [];
  for (const p of out) {
    const s = solve(p);
    const key = `${s.iRinf}|${s.coef}|${s.invTau}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  return uniq;
}

const POOL = buildPool();

export function generateSwitchedRlDepI(args: { seed?: number; variant?: boolean }): SwitchedRlDepIGeneration {
  const rand = makeRand(args.seed);
  const variant = args.variant === true;
  // 유사·변형이 서로 다른 값을 쓰도록 풀을 반으로 나눠 사용.
  const half = Math.floor(POOL.length / 2);
  const slice = variant ? POOL.slice(half) : POOL.slice(0, half);
  const p = pick(slice.length > 0 ? slice : POOL, rand);
  const s = solve(p);

  const iL0 = round(s.iL0);
  const iRinf = round(s.iRinf);
  const tau = round(s.tau);
  const coef = round(s.coef);
  const invTau = round(s.invTau);
  const iRExpr = `${iRinf} + ${coefStr(coef)}e^(−${invTau}t) [A]`;

  // ── netlist (전용 렌더러용 — 고유 id로 detect) ──
  const GND = "GND";
  const components: CircuitComponent[] = [
    { id: "Vs", type: "V", value: `${p.Vs}V`, pins: [{ id: "p", node: "A", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "SWn", type: "SW", state: "closed", value: "t=0", pins: [{ id: "p", node: "A", side: "top" }, { id: "n", node: "nSW", side: "bottom" }] },
    { id: "R1", type: "R", value: `${p.R1}Ω`, pins: [{ id: "p", node: "nSW", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "CCCSn", type: "CCCS", value: `${p.k}iₙ`, gain: `${p.k}iₙ`, pins: [{ id: "p", node: "B", side: "bottom" }, { id: "n", node: "A", side: "top" }] },
    { id: "Ln", type: "L", value: `${p.L}H`, pins: [{ id: "p", node: "A", side: "top" }, { id: "n", node: "B", side: "bottom" }] },
    { id: "Rr", type: "R", value: `${p.Rr}Ω`, pins: [{ id: "p", node: "B", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
  ];
  const measurementMarks: MeasurementMark[] = [
    { kind: "current", refs: ["R1"], label: "iₙ" },
    { kind: "current", refs: ["Ln"], label: "i_L(t)" },
    { kind: "current", refs: ["Rr"], label: "i_R(t)" },
  ];

  return {
    netlist: { components, ground: GND, nodeAnnotations: [], measurementMarks, positions: {} },
    values: { Vs: p.Vs, R1: p.R1, Rr: p.Rr, k: p.k, L: p.L },
    solution: { iN: round(s.iN), iL0, iRinf, tau, coef, invTau, iRExpr },
    variant,
  };
}

/** 결정론 텍스트(문항·해석절차·정답·풀이) 라이터. */
export type SwitchedRlDepIText = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export function writeSwitchedRlDepIText(args: { generation: SwitchedRlDepIGeneration }): SwitchedRlDepIText {
  const { values: v, solution: s } = args.generation;

  const content =
    `다음 그림은 직류 전압원(${v.Vs}V)과 종속 전류원(${v.k}iₙ)을 포함하는 RL 회로이다. ` +
    `t=0에서 스위치가 개방될 때, 저항 ${v.Rr}[Ω]에 흐르는 전류 i_R(t)[A]를 제시된 <해석 절차>에 따라 ` +
    `단계별로 구하여 서술하시오. (단, t<0일 때 회로는 직류 정상 상태로 가정한다.)`;

  const conditions = [
    `종속 전류원은 저항 ${v.R1}Ω에 흐르는 전류 iₙ에 대해 ${v.k}iₙ [A]이다.`,
    `인덕터 초기 전류는 t=0⁻의 정상상태 값으로 한다 (i_L 연속).`,
    `모든 소자는 이상적으로 동작한다.`,
  ];

  const question =
    `<해석 절차>\n` +
    `[단계 1] t=0⁻일 때, 인덕터에 흐르는 전류 i_L(t)의 초깃값 i_L(0⁻)[A]를 구한다.\n` +
    `[단계 2] t=∞일 때, 저항 ${v.Rr}[Ω]에 흐르는 전류 i_R(∞)[A]를 구한다.\n` +
    `[단계 3] t>0일 때, 저항 ${v.Rr}[Ω]에 흐르는 전류 i_R(t)[A]와 시정수 τ[s]를 구한다.`;

  const answer =
    `[단계 1] i_L(0⁻) = ${s.iL0} A / ` +
    `[단계 2] i_R(∞) = ${s.iRinf} A / ` +
    `[단계 3] i_R(t) = ${s.iRExpr}, τ = ${s.tau} s`;

  const solution =
    `V(A)=Vs=${v.Vs}V (전압원이 상단 마디 A를 고정). iₙ = Vs/R1 = ${v.Vs}/${v.R1} = ${s.iN} A, 종속전류 ${v.k}iₙ = ${round(v.k * s.iN)} A.\n` +
    `[단계 1] t<0 정상상태: 인덕터 단락 → V(B)=V(A)=${v.Vs}V. 마디 B의 KCL:\n` +
    `  i_L = i_R + ${v.k}iₙ = Vs/R_R + Vs·${v.k}/R1 = ${v.Vs}/${v.Rr} + ${s.coef} = ${s.iL0} A. → i_L(0⁻)=${s.iL0}A.\n` +
    `[단계 2] t=0 스위치 개방 → iₙ=0 → 종속 전류원=0. t=∞ 정상상태(인덕터 단락):\n` +
    `  i_R(∞) = Vs/R_R = ${v.Vs}/${v.Rr} = ${s.iRinf} A (= i_L(∞)).\n` +
    `[단계 3] t>0: 인덕터가 보는 등가저항 R_th = R_R = ${v.Rr}Ω (전압원 단락 → A=GND, B에서 R_R만 보임).\n` +
    `  τ = L/R_R = ${v.L}/${v.Rr} = ${s.tau} s.  i_L(0⁺)=i_L(0⁻)=${s.iL0}A, i_L(∞)=${s.iRinf}A 이므로\n` +
    `  i_R(t) = i_L(t) = ${s.iRinf} + (${s.iL0}−${s.iRinf})e^(−t/τ) = ${s.iRExpr}.`;

  return { content, conditions, question, answer, solution };
}
