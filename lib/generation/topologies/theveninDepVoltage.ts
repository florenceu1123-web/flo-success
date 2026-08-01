import type { CircuitComponent, CircuitNetlist, MeasurementMark } from "@/types";
import { makeRand, pick } from "./_helpers";

/**
 * 테브난 등가 + 종속 전압원(k·v_x, VCVS) + 시험전원(1A)법 (임용 2024 전기 6번 형식) archetype.
 *
 * ★ 규칙 기반 generator (특정 예시 hardcode 금지) — 토폴로지에 테브난·시험전원법 규칙을 적용해
 *   값을 enumerate 하고 깔끔한 해만 채택. 원본 튜플은 생성 풀에서 제외.
 *
 * 고정 토폴로지 (가) — 노드 TL·M·a·b(GND):
 *   Vs : TL ─ b                      (독립 전압원)
 *   R1 : TL ─ M                      (직렬)
 *   Rx : M ─ b                       (v_x = V(M) 측정 대상, 종속원 제어전압)
 *   k·v_x (VCVS) : M ─ a             (종속 전압원, V(a)=V(M)+k·v_x)
 *   R_L: a ─ b                       (부하, 테브난 시 제거)
 *
 * 해석 (시험전원법):
 *   [단계1] R_L·Vs 제거, 단자 a-b에 시험 전류원 1A → Vs 단락(TL=0). 1A가 VCVS 통과해 M으로.
 *     KCL at M: 1 = V(M)/R1 + V(M)/Rx → V(M)=R1∥Rx.  V(a)=V(M)(1+k).  R_TH = V(a)/1 = (R1∥Rx)(1+k).
 *   [단계2] V_TH = 개방전압 V(a) (a 개방 → VCVS 전류 0): i=Vs/(R1+Rx), V(M)=i·Rx, V_TH=V(M)(1+k)=Vs·Rx(1+k)/(R1+Rx).
 *   [단계3] I_L = V_TH/(R_TH+R_L),  V_L = I_L·R_L.
 */

export type TheveninDepVoltageGeneration = {
  gaNetlist: CircuitNetlist; // (가) 원본 (VCVS 포함)
  naNetlist: CircuitNetlist; // (나) 테브난 등가
  values: { Vs: number; R1: number; Rx: number; k: number; RL: number };
  solution: { rth: number; vth: number; iL: number; vL: number };
  variant?: boolean;
};

const ORIGINAL = { Vs: 50, R1: 5, Rx: 4, k: 4, RL: 3.2 };

const VS_CANDS = [10, 12, 20, 24, 30, 40, 48, 60];
const R_CANDS = [2, 3, 4, 5, 6, 8, 10];
const K_CANDS = [1, 2, 3, 4];
const RL_CANDS = [2, 3, 4, 5, 6, 8, 10];

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;
const isHalf = (x: number) => Math.abs(x * 2 - Math.round(x * 2)) < 1e-9; // 0.5 배수
const isInt = (x: number) => Number.isInteger(round(x));

type Params = { Vs: number; R1: number; Rx: number; k: number; RL: number };

/** 토폴로지에 시험전원법·테브난 규칙을 적용해 해를 계산한다 (범용). */
function solve(p: Params) {
  const par = (p.R1 * p.Rx) / (p.R1 + p.Rx); // R1∥Rx
  const rth = par * (1 + p.k);
  const vth = (p.Vs * p.Rx * (1 + p.k)) / (p.R1 + p.Rx);
  const iL = vth / (rth + p.RL);
  const vL = iL * p.RL;
  return { rth, vth, iL, vL };
}

const isOriginal = (p: Params) =>
  p.Vs === ORIGINAL.Vs && p.R1 === ORIGINAL.R1 && p.Rx === ORIGINAL.Rx && p.k === ORIGINAL.k && p.RL === ORIGINAL.RL;

/** 깔끔한 해(정수 R_TH·V_TH, 0.5배수 I_L·V_L)만 통과. */
function isClean(p: Params): boolean {
  const s = solve(p);
  if (!isInt(s.rth)) return false;
  if (!isInt(s.vth)) return false;
  if (!isHalf(s.iL) || s.iL <= 0) return false;
  if (!isHalf(s.vL)) return false;
  if (s.rth < 2 || s.rth > 60) return false;
  return true;
}

function buildPool(): Params[] {
  const out: Params[] = [];
  for (const Vs of VS_CANDS)
    for (const R1 of R_CANDS)
      for (const Rx of R_CANDS)
        for (const k of K_CANDS)
          for (const RL of RL_CANDS) {
            const p = { Vs, R1, Rx, k, RL };
            if (isOriginal(p)) continue;
            if (isClean(p)) out.push(p);
          }
  // 같은 (R_TH·V_TH·I_L) 답은 중복 제거
  const seen = new Set<string>();
  const uniq: Params[] = [];
  for (const p of out) {
    const s = solve(p);
    const key = `${round(s.rth)}|${round(s.vth)}|${round(s.iL)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  return uniq;
}

const POOL = buildPool();

function gaNetlist(p: Params): CircuitNetlist {
  const GND = "b";
  const components: CircuitComponent[] = [
    { id: "VsG", type: "V", value: `${p.Vs}V`, pins: [{ id: "p", node: "TL", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "R1G", type: "R", value: `${p.R1}Ω`, pins: [{ id: "p", node: "TL", side: "left" }, { id: "n", node: "M", side: "right" }] },
    { id: "RxG", type: "R", value: `${p.Rx}Ω`, pins: [{ id: "p", node: "M", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "VxG", type: "VCVS", value: `${p.k}v_x`, gain: `${p.k}v_x`, pins: [{ id: "p", node: "a", side: "right" }, { id: "n", node: "M", side: "left" }] },
    { id: "RLG", type: "R", value: `R_L=${p.RL}Ω`, pins: [{ id: "p", node: "a", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
  ];
  const measurementMarks: MeasurementMark[] = [
    { kind: "voltage", refs: ["M", "b"], label: "v_x" },
  ];
  return { components, ground: GND, nodeAnnotations: [], measurementMarks, positions: {} };
}

function naNetlist(p: Params, s: ReturnType<typeof solve>): CircuitNetlist {
  const GND = "b";
  const components: CircuitComponent[] = [
    { id: "VthN", type: "V", value: "V_TH", pins: [{ id: "p", node: "TLn", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
    { id: "RthN", type: "R", value: "R_TH", pins: [{ id: "p", node: "TLn", side: "left" }, { id: "n", node: "a", side: "right" }] },
    { id: "RLN", type: "R", value: `R_L=${p.RL}Ω`, pins: [{ id: "p", node: "a", side: "top" }, { id: "n", node: GND, side: "bottom" }] },
  ];
  void s;
  const measurementMarks: MeasurementMark[] = [
    { kind: "current", refs: ["RLN"], label: "I_L" },
    { kind: "voltage", refs: ["a", "b"], label: "V_L" },
  ];
  return { components, ground: GND, nodeAnnotations: [], measurementMarks, positions: {} };
}

export function generateTheveninDepVoltage(args: { seed?: number; variant?: boolean }): TheveninDepVoltageGeneration {
  const rand = makeRand(args.seed);
  const variant = args.variant === true;
  const half = Math.floor(POOL.length / 2);
  const slice = variant ? POOL.slice(half) : POOL.slice(0, half);
  const p = pick(slice.length > 0 ? slice : POOL, rand);
  const s = solve(p);

  return {
    gaNetlist: gaNetlist(p),
    naNetlist: naNetlist(p, s),
    values: { Vs: p.Vs, R1: p.R1, Rx: p.Rx, k: p.k, RL: p.RL },
    solution: { rth: round(s.rth), vth: round(s.vth), iL: round(s.iL), vL: round(s.vL) },
    variant,
  };
}

export type TheveninDepVoltageText = {
  content: string;
  conditions: string[];
  question: string;
  answer: string;
  solution: string;
};

export function writeTheveninDepVoltageText(args: { generation: TheveninDepVoltageGeneration }): TheveninDepVoltageText {
  const { values: v, solution: s } = args.generation;
  const par = round((v.R1 * v.Rx) / (v.R1 + v.Rx));

  const content =
    `그림 (가)는 독립 전압원(${v.Vs}V)과 종속 전압원(${v.k}v_x)이 포함된 회로이고, 그림 (나)는 그림 (가)의 점선 영역을 ` +
    `테브난 등가 회로로 변환한 회로이다. 부하 저항 R_L(=${v.RL}Ω)의 양단 전압 V_L[V]와 전류 I_L[A]를 ` +
    `제시된 <해석 절차>에 따라 단계별로 구하여 서술하시오.`;

  const conditions = [
    `종속 전압원은 저항 ${v.Rx}Ω 양단 전압 v_x에 대해 ${v.k}v_x [V]이다.`,
    `테브난 등가 저항 R_TH는 시험 전원(1A)법으로 구한다.`,
    `모든 소자는 이상적으로 동작한다.`,
  ];

  const question =
    `<해석 절차>\n` +
    `[단계 1] R_L과 독립 전압원을 제거한 후, 단자 a와 b 사이에 가상의 시험 전류원 1[A]를 인가하여 테브난 등가 저항 R_TH[Ω]을 구한다.\n` +
    `[단계 2] 테브난 등가 전압 V_TH[V]를 구한다.\n` +
    `[단계 3] [단계 1]과 [단계 2]의 결과를 이용하여, R_L의 전압 V_L[V]와 전류 I_L[A]를 구한다.`;

  const answer =
    `[단계 1] R_TH = ${s.rth} Ω / ` +
    `[단계 2] V_TH = ${s.vth} V / ` +
    `[단계 3] V_L = ${s.vL} V, I_L = ${s.iL} A`;

  const solution =
    `v_x = ${v.Rx}Ω 양단 전압 = V(M). 종속 전압원 ${v.k}v_x는 단자 a 쪽을 (+)로 V(a)=V(M)+${v.k}v_x.\n` +
    `[단계 1] R_L·독립전원 제거(Vs 단락 → TL=0), a-b에 1A 인가. 1A가 종속원 통해 마디 M으로:\n` +
    `  KCL at M: 1 = V(M)/${v.R1} + V(M)/${v.Rx} → V(M) = R1∥Rx = ${par}V.\n` +
    `  V(a) = V(M)(1+${v.k}) = ${par}·${1 + v.k} = ${s.rth}V → R_TH = V(a)/1A = ${s.rth}Ω.\n` +
    `[단계 2] a 개방(종속원 전류 0): i = Vs/(R1+Rx) = ${v.Vs}/${v.R1 + v.Rx} = ${round(v.Vs / (v.R1 + v.Rx))}A, V(M)=i·Rx=${round((v.Vs * v.Rx) / (v.R1 + v.Rx))}V.\n` +
    `  V_TH = V(M)(1+${v.k}) = ${s.vth}V.\n` +
    `[단계 3] 테브난 등가에 R_L 연결: I_L = V_TH/(R_TH+R_L) = ${s.vth}/(${s.rth}+${v.RL}) = ${s.iL}A.\n` +
    `  V_L = I_L·R_L = ${s.iL}·${v.RL} = ${s.vL}V.`;

  return { content, conditions, question, answer, solution };
}
