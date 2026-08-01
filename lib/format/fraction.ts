/**
 * 소수 → 분수 표기 변환 (사용자 요청 2026-07-29: "답이 소수점으로 나오면 차라리 분수로").
 *
 * ★ 유형마다 고치면 반드시 빠지는 곳이 생기므로 **생성 결과 텍스트를 한 곳에서 후처리**한다
 *   (route에서 answer·solution에 적용). 생성기들은 지금처럼 숫자를 그대로 쓰면 된다.
 *
 * 규칙:
 *  · 정수는 그대로 둔다 (6 → 6).
 *  · 분모가 작은 **깔끔한 분수**만 변환한다 (기본 ≤ 20): 6.75 → 27/4, 1.5 → 3/2, 0.25 → 1/4.
 *  · 근삿값·측정값처럼 깔끔한 분수가 아니면 **그대로 둔다** (2.693, 158.199 → 변환 안 함).
 *    소수 자릿수가 많은 계산 결과를 133/49 같은 분수로 바꾸면 오히려 읽기 어렵다.
 *  · 버전·좌표·날짜처럼 점이 연속된 토큰(16.2.6)은 건드리지 않는다.
 */

/**
 * x를 기약분수로. 2단계로 찾는다 (사용자 지침 "답이 지저분하면 그냥 분수로 나타내도 돼"):
 *   · 1단계 — **정확히** 떨어지는 분수(분모 ≤ maxDen): 6.75 → 27/4, 26.675 → 1067/40.
 *   · 2단계 — 소수 3자리로 **반올림된 값**을 되살리는 근사 분수(분모 ≤ approxDen, 오차 ≤ 1.5e-3):
 *     9.767 → 293/30, 0.534 → 8/15. 솔버가 실수로 계산 후 반올림해 출력한 값을 원래 유리수로 되돌린다.
 *   둘 다 실패하면 null(소수 그대로).
 */
export function decimalToFraction(x: number, maxDen = 400, approxDen = 60): { num: number; den: number } | null {
  if (!Number.isFinite(x)) return null;
  if (Number.isInteger(x)) return null;              // 정수는 변환 대상 아님
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);

  const reduce = (n: number, d: number) => {
    const g = gcd(n, d);
    const rn = n / g, rd = d / g;
    return rd === 1 ? null : { num: sign * rn, den: rd };
  };

  // 1단계: 정확히 나누어떨어지는 분모 (작은 분모부터 → 가장 간단한 표기)
  for (let den = 2; den <= maxDen; den++) {
    const num = ax * den;
    if (Math.abs(num - Math.round(num)) < 1e-9) return reduce(Math.round(num), den);
  }
  // 2단계: 반올림 오차를 감안한 근사 (분모 작은 것 우선)
  for (let den = 2; den <= approxDen; den++) {
    const num = Math.round(ax * den);
    if (num === 0) continue;
    if (Math.abs(num / den - ax) <= 1.5e-3) return reduce(num, den);
  }
  return null;
}

/** "6.75" → "27/4" (변환 불가면 원래 문자열) */
export function fractionText(x: number, maxDen = 20): string {
  const f = decimalToFraction(x, maxDen);
  return f ? `${f.num}/${f.den}` : String(x);
}

/**
 * 텍스트 안의 소수를 분수로 치환. LaTeX 안(\dfrac 등)에서도 "27/4"는 그대로 읽히므로 동일 처리한다.
 *  · 앞뒤가 숫자·점이면 건너뛴다(16.2.6, 1.2.3 같은 토큰 보호).
 *  · 각도(158.199°)처럼 깔끔한 분수가 아닌 값은 규칙상 자동으로 남는다.
 *  · 길이(0.03 [m])는 소수 그대로 둔다 — 아래 LENGTH_UNIT_AFTER 참고.
 */
export function fractionizeText(text: string, maxDen = 400): string {
  if (!text) return text;
  // ★ 각도(158.199°)는 제외 — 페이저 위상은 소수 표기가 관례이고 분수로 바꾸면 오히려 읽기 어렵다.
  return text.replace(
    /(?<![\d.])(-?\d+\.\d+)(?![\d.])(\s*°)?/g,
    (m: string, num: string, deg: string | undefined, offset: number, whole: string) => {
      if (deg) return m;                                // 각도는 그대로
      // ★ 길이는 그대로 — "x = 0.03 [m]"이 "x = 3/100 [m]"이 되면 오히려 읽기 어렵다(실측:
      //   동축선로 자계 원본의 반지름 차). 각도와 같은 성격의 단위 예외이며 유형별 처리가 아니다.
      const after = whole.slice(offset + m.length);
      if (LENGTH_UNIT_AFTER.test(after)) return m;
      if (BRACKETED_UNIT_AFTER.test(after)) return m;
      const v = Number(num);
      // "2.000"·"5000.00"처럼 소수점 뒤가 0뿐이면 정수로 정리한다.
      if (Number.isInteger(v)) return `${v}`;
      const f = decimalToFraction(v, maxDen);
      if (!f) return m;
      // ★ 나눗셈 뒤에 오면 괄호로 감싼다 (2026-07-29 실측): "exp(-t/0.48)"이 그냥 치환되면
      //   "exp(-t/12/25)"가 되어 식의 의미가 바뀐다 → "exp(-t/(12/25))".
      const before = whole.slice(0, offset).trimEnd();
      const needsParen = before.endsWith("/") || before.endsWith("÷");
      return needsParen ? `(${f.num}/${f.den})` : `${f.num}/${f.den}`;
    },
  );
}

/**
 * 소수 바로 뒤에 오는 **길이 단위**(m·cm·mm·km) 패턴. `\,[\mathrm{m}]`·`[m]`·` m` 모두 잡는다.
 * 뒤에 다른 글자가 이어지면(mH·mA·m/s·m^2) 길이가 아니므로 매치하지 않는다.
 */
const LENGTH_UNIT_AFTER = /^\s*(?:\\,)?\s*\[?\s*(?:\\mathrm\{)?(?:mm|cm|km|m)(?![A-Za-z0-9])/;

/**
 * 소수 바로 뒤에 **대괄호로 묶인 단위**가 오는 경우 — 최종 답의 물리량이므로 소수를 유지한다.
 * `7.4\,[\mathrm{V}]` 가 `37/5\,[\mathrm{V}]` 로 바뀌면 오히려 읽기 어렵다(실측: 제너 클리퍼
 * 원본의 V_PP). 대괄호를 **필수**로 요구하므로 페이저 표기(`2.693∠158.199° A`)처럼 단위가
 * 그냥 붙는 경우는 기존대로 분수 변환된다.
 */
const BRACKETED_UNIT_AFTER = /^\s*(?:\\,)?\s*\[\s*(?:\\mathrm\{)?\s*(?:V|A|W|Ω|\\Omega|F|H|S|Hz)\s*\}?\s*\]/;

function gcd(a: number, b: number): number {
  let x = Math.abs(a), y = Math.abs(b);
  while (y) { const t = x % y; x = y; y = t; }
  return x || 1;
}
