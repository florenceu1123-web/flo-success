/**
 * 종속전원 포함 저항회로 → **V-I 그래프로 미지 저항 R 도출** → I_SC → 최대 전달 전력
 * (임용 9번 회로이론 — `thevenin_dep_graph_max_power`) 전용 결정론 generator. GPT 없음.
 *
 * ── 원본 배선 (원본 이미지 6배 확대로 확정, [[feedback_verify_wiring_by_zoom]])
 *   점선 박스 안: `9V(+위) — 5Ω — ◇2i_x(+왼쪽) — 1Ω — 마디 M — 2Ω — 단자 a`
 *                 `마디 M — R(i_x ↓) — 하단 rail`,  하단 rail → 단자 b
 *   점선 박스 밖: `a — Ⓐ(I_RL) — R_L(V_RL, +위) — b`, R_L에 Ⓥ 병렬
 *   (나): V_RL–I_RL 직선. **y절편만 수치(1)로 주어지고 x절편은 `I_SC` 기호**로만 적혀 있다.
 *
 * ── 물리 (닫힌형, 유리수 정확 연산)
 *   S = R_a + k + R_b 라 두면
 *   · **개방**(a-b 개방): R_c에 전류가 흐르지 않으므로 i_x = V_s/(S+R)
 *     → **V_TH = R·V_s/(S+R)** — 이것이 그래프의 y절편이다. 역으로 **R = S·V₀/(V_s − V₀)**.
 *   · **단락**(a-b 단락): 마디 M의 전압을 v라 하면 i_x = v/R, R_c 전류 = v/R_c,
 *     KVL `V_s = (R_a+R_b)(v/R + v/R_c) + k·v/R + v` → v를 풀고 **I_SC = v/R_c**.
 *   · **R_TH = V_TH/I_SC**, **P_L(max) = V_TH·I_SC/4**.
 *   ★ 종속전원이 있어 **전원 무효화법을 쓸 수 없다** — 개방전압/단락전류법이 이 유형의 교육 포인트다.
 *   원본 검산(9,5,2,1,2): V₀=1 → **R = 1Ω**, v = 3/4 → **I_SC = 3/8 A**, R_TH = 8/3Ω,
 *   **P_L(max) = 3/32 W**.
 *
 * ── 값은 규칙 열거 + 필터 (특정 예시 hardcode 금지, CLAUDE.md 절대규칙 0)
 *   V_TH가 **정수**(그래프에서 읽을 수 있어야 한다) · R 양의 정수 · I_SC·P의 분모가 작을 것.
 *   **원본 튜플 제외**, 유사·변형 풀 분리.
 */

import { isDependentComponent } from "@/lib/analysis/dependentSource";

/** 유리수 — 반올림 없이 정확히 계산한다(0.289 같은 값이 전역 분수 변환기에 오복원되는 사고 방지). */
export type Q = { n: number; d: number };

function gcd(a: number, b: number): number { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; }
export function q(n: number, d = 1): Q {
  if (d === 0) throw new Error("q: 0으로 나눔");
  const s = d < 0 ? -1 : 1;
  const g = gcd(n, d);
  return { n: (s * n) / g, d: (s * d) / g };
}
export const qAdd = (a: Q, b: Q): Q => q(a.n * b.d + b.n * a.d, a.d * b.d);
export const qMul = (a: Q, b: Q): Q => q(a.n * b.n, a.d * b.d);
export const qDiv = (a: Q, b: Q): Q => q(a.n * b.d, a.d * b.n);
export const qNum = (a: Q): number => a.n / a.d;
/** 분수 표기 — 정수면 그대로, 아니면 `n/d`. (소수를 절대 쓰지 않는다 — 전역 변환기가 손대지 못하게.) */
export function qTex(a: Q): string { return a.d === 1 ? String(a.n) : `${a.n}/${a.d}`; }

export type TdgMode = "exam_similar" | "exam_variant";

/** 회로 payload — 전용 렌더러가 그대로 받는다. */
export type TheveninDepGraphCircuitDiagram = {
  Vs: number;            // 직류 전원 [V]
  Ra: number;            // 전원 다음 직렬 저항 [Ω]
  k: number;             // 종속 전압원 이득 (k·i_x)
  Rb: number;            // 종속원 다음 직렬 저항 [Ω]
  Rc: number;            // 마디 M → 단자 a 직렬 저항 [Ω]
  unknownLabel: string;  // "R" — 값은 표시하지 않는다(학생이 도출)
  depLabel: string;      // "2i_x"
  currentLabel: string;  // "i_x"
  loadLabel: string;     // "R_L"
};

export type TdgAnswer = { R: number; Vth: Q; Isc: Q; Rth: Q; Pmax: Q; vShort: Q };

export type TdgGenerated = {
  values: { Vs: number; Ra: number; Rb: number; Rc: number; k: number };
  /** 그래프에 **수치로** 주어지는 절편 — "voc"면 y절편(원본), "isc"면 x절편(변형). */
  graphGiven: "voc" | "isc";
  answer: TdgAnswer;
  circuit: TheveninDepGraphCircuitDiagram;
};

type Tuple = { Vs: number; Ra: number; Rb: number; Rc: number; k: number; R: number };

/** 원본 튜플 — 참조·검증 전용, 생성 풀에서 제외한다. */
const ORIGINAL: Tuple = { Vs: 9, Ra: 5, Rb: 1, Rc: 2, k: 2, R: 1 };
const sameTuple = (a: Tuple, b: Tuple) =>
  a.Vs === b.Vs && a.Ra === b.Ra && a.Rb === b.Rb && a.Rc === b.Rc && a.k === b.k && a.R === b.R;

/** 한 조합의 닫힌형 해. */
export function solveTdg(t: Tuple): TdgAnswer {
  const { Vs, Ra, Rb, Rc, k, R } = t;
  const S = Ra + k + Rb;
  const A = Ra + Rb;
  // 개방: V_TH = R·V_s/(S+R)
  const Vth = q(R * Vs, S + R);
  // 단락: V_s = v·[ (A+k)/R + A/R_c + 1 ]
  const denom = qAdd(qAdd(q(A + k, R), q(A, Rc)), q(1));
  const vShort = qDiv(q(Vs), denom);
  const Isc = qDiv(vShort, q(Rc));
  const Rth = qDiv(Vth, Isc);
  const Pmax = qDiv(qMul(Vth, Isc), q(4));
  return { R, Vth, Isc, Rth, Pmax, vShort };
}

const VS = [6, 8, 9, 10, 12, 15, 16, 18, 20, 24];
const RA = [1, 2, 3, 4, 5, 6, 8];
const RB = [1, 2, 3, 4];
const RC = [1, 2, 3, 4, 5, 6];
const KK = [1, 2, 3, 4];
const RR = [1, 2, 3, 4, 5, 6, 8];

/**
 * 값 공간 — 규칙으로 열거하고 **품질 필터**만 건다(예시 목록이 아니다).
 *  · V_TH 정수(그래프 y절편을 읽을 수 있어야 한다) · 1 ≤ V_TH < V_s
 *  · I_SC·P의 분모가 작아 답이 지저분하지 않을 것
 *  · R_TH > 0 (종속원 때문에 음의 등가저항이 나오는 조합 배제)
 */
export function buildTdgSpace(): Tuple[] {
  const out: Tuple[] = [];
  for (const Vs of VS) for (const Ra of RA) for (const Rb of RB) for (const Rc of RC) for (const k of KK) for (const R of RR) {
    const t = { Vs, Ra, Rb, Rc, k, R };
    if (sameTuple(t, ORIGINAL)) continue;                    // 원본은 생성하지 않는다
    const a = solveTdg(t);
    if (a.Vth.d !== 1) continue;                             // y절편은 정수
    if (a.Vth.n < 1 || a.Vth.n >= Vs) continue;
    if (qNum(a.Rth) <= 0) continue;
    if (a.Isc.d > 16 || a.Pmax.d > 64) continue;             // 답 표기가 지저분하지 않게
    if (Math.abs(a.Isc.n) > 40 || Math.abs(a.Pmax.n) > 60) continue;
    out.push(t);
  }
  return out;
}

let SPACE: Tuple[] | null = null;
const space = (): Tuple[] => (SPACE ??= buildTdgSpace());

/** 유사·변형이 서로 다른 값을 쓰도록 풀을 절반으로 가른다. */
function sliceFor(mode: TdgMode): Tuple[] {
  const all = space();
  const half = Math.floor(all.length / 2);
  return mode === "exam_similar" ? all.slice(0, half) : all.slice(half);
}

/**
 * 결정론 생성.
 *  · exam_similar = 원본 형식 — 그래프에 **y절편(V_TH) 수치**가 주어지고 R·I_SC·P를 구한다.
 *  · exam_variant = **구하는 양 교환** — 그래프에 **x절편(I_SC) 수치**가 주어지고 R·V_TH·P를 구한다.
 *    회로·절차(개방전압/단락전류법)는 완전히 같고 읽는 절편만 반대다.
 */
export function generateTheveninDepGraph(args: { seed?: number; mode: TdgMode; index?: number }): TdgGenerated {
  const pool = sliceFor(args.mode);
  if (pool.length === 0) throw new Error("thevenin_dep_graph: 값 공간이 비었다");
  const base = Math.abs(Math.floor(args.seed ?? 0)) + (args.index ?? 0);
  const t = pool[base % pool.length];
  const answer = solveTdg(t);
  return {
    values: { Vs: t.Vs, Ra: t.Ra, Rb: t.Rb, Rc: t.Rc, k: t.k },
    graphGiven: args.mode === "exam_similar" ? "voc" : "isc",
    answer,
    circuit: {
      Vs: t.Vs, Ra: t.Ra, k: t.k, Rb: t.Rb, Rc: t.Rc,
      unknownLabel: "R", depLabel: `${t.k}i_x`, currentLabel: "i_x", loadLabel: "R_L",
    },
  };
}

// ─────────────────────────── 분류·감지 공용 매처 ───────────────────────────
// ★ 분류기(classifyCircuitType)와 route 안전망(detect…)이 **같은 함수를 import** 한다.
//   정규식을 두 곳에 복제하면 한쪽만 고쳐져 조용히 드리프트한다(이 저장소에서 반복된 사고).

/**
 * 종속전원 + 테브난/등가 + V-I 그래프(또는 미지 R) 시그니처.
 *
 * ★ `hasDep`은 **인벤토리에서도** 받는다 — 실측 요약은 "테브난 등가 회로를 구하고 부하 저항 R_L에
 *   최대 전력이…"까지만 쓰고 **종속전원을 한 번도 언급하지 않았다**(다이아몬드는 인벤토리에만 CCVS로 남았다).
 *   텍스트 낱말만 요구하면 그 회차가 통째로 샌다(CLAUDE.md 규칙 2).
 */
export function matchesTdgSignature(
  text: string,
  hasSymbolicR: boolean,
  hasDepInv = false,
  independentISources = 0,
): boolean {
  // ★★ 텍스트의 "종속 전원"은 **환각일 수 있다** (사용자 확인 2026-08-04, 재현 1/4):
  //   임용 5번(2전압원 + 2전류원 테브난+최대전력) 원본에는 종속전원이 **없는데**, Vision이
  //   "종속 전원이 포함되어 있어 이를 고려한 해석이 필요합니다"라고 지어낸 회차가 있었다.
  //   그 회차엔 부하가 `R_L`(기호 저항)로 남아 그래프 신호까지 충족돼 이 archetype이 통째로 가져갔고,
  //   전혀 다른 문제(종속전원 + V-I 그래프)가 생성됐다.
  //   → **인벤토리가 텍스트를 반증하면 인벤토리를 믿는다**: 종속원이 하나도 없고 독립 전류원이 2개 이상이면
  //     이 유형이 아니다. 임용 9번 원본에는 독립 전류원이 없다(전압원 1 + 종속전원 1).
  //   ※ Vision이 다이아몬드를 I로 오타이핑해도 값이 `2i_x` 꼴이면 `isDependentComponent`가 잡아
  //     hasDepInv=true가 되므로 이 가드는 발화하지 않는다.
  if (!hasDepInv && independentISources >= 2) return false;
  const dep = hasDepInv || /종속\s*(전원|전압원|전류원)|dependent|제어\s*(전류|전압)|i_?x|\d\s*i_?x/i.test(text);
  if (!dep) return false;
  const thev = /테브난|thevenin|등가\s*회로|등가회로/i.test(text);
  // 그래프 신호 — 낱말이 흔들려도 **미지 저항이 기호로 남아 있으면** 이 형식이다(CLAUDE.md 1-4-5).
  const graph = /그래프|graph|직선|특성\s*곡선|v[\s-]?i\s*(곡선|graph|curve)|v_?rl|i_?rl|i_?sc|단락\s*전류|절편|\(\s*나\s*\)/i.test(text)
    || hasSymbolicR;
  return thev && graph;
}

/** 요구 신호 — 최대 전력 전달 또는 미지 저항·단락 전류 도출. */
export function matchesTdgAsk(text: string): boolean {
  return /최대\s*전력|최대\s*전달|maximum\s*power|단락\s*전류|i_?sc|저항\s*r\s*\[?\s*ω|저항\s*r\s*을|미지\s*저항/i.test(text);
}

/** 인벤토리에 종속전원이 있는가 — **값 기반 정규화**를 재사용한다(Vision이 type을 V로 뱉는 회차 대비). */
export function hasDependentInInventory(inventory: Array<{ type?: string; value?: string }> | undefined): boolean {
  return (inventory ?? []).some((c) => isDependentComponent(c));
}

/** 형제 archetype 양보 — 교류·페이저·스위치 과도·연산증폭기는 각자 전용 경로가 있다. */
export function yieldsTdgToSibling(text: string): boolean {
  if (/페이저|phasor|∠|교류|정현파|임피던스|리액턴스|공진|역률|어드미턴스/i.test(text)) return true;
  if (/스위치|switch|t\s*=\s*0|과도\s*응답|시정수|커패시터|인덕터|커패시턴스|인덕턴스/i.test(text)) return true;
  if (/연산\s*증폭기|op[\s-]?amp|플립플롭|논리\s*게이트|카르노/i.test(text)) return true;
  if (/브리지|휘트스톤|델타|와이|3상/i.test(text)) return true;
  return false;
}

/**
 * 인벤토리의 **독립 전류원** 개수 — 종속원으로 판정되는 항목은 제외한다.
 * 텍스트가 "종속 전원"을 지어낸 회차에서 형제(임용 5번 2전원 테브난)를 되돌려주는 구조 신호다.
 */
export function independentCurrentSourceCount(
  inventory: Array<{ type?: string; value?: string }> | undefined,
): number {
  return (inventory ?? []).filter(
    (c) => String(c?.type ?? "").toUpperCase() === "I" && !isDependentComponent(c),
  ).length;
}

/** 인벤토리에 **값이 기호인 저항**(미지 R)이 있는가 — 표현이 흔들려도 남는 구조 신호. */
export function hasSymbolicResistor(inventory: Array<{ type?: string; value?: string }> | undefined): boolean {
  return (inventory ?? []).some(
    (c) => String(c?.type ?? "").toUpperCase() === "R" && /^[A-Za-z](_[A-Za-z0-9]+)?$/.test(String(c?.value ?? "").trim()),
  );
}
