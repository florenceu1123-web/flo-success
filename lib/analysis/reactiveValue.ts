/**
 * 리액티브 소자(L·C) 값 정규화 — Vision 출력 형식 흔들림 흡수.
 *
 * Vision은 임피던스로 표기된 리액티브 소자를 자주 **저항(R)으로 추출**한다
 * (실측 2026-08-03, 임용 6번: `j[Ω]`·`−j½[Ω]`가 `{type:"R"}`로 나와 counts가 `{R:3, L:0, C:0}` →
 * "종속전원 + 리액티브" 0-PRE 조건이 미발화 → `ac_superposition`으로 오분류, generic figure 생성).
 *
 * ★ 판별 규칙: 값이 **순허수**(`j`, `j15Ω`, `−j1/2[Ω]`)면 리액티브다. 부호가 곧 종류다 —
 *   `+j` = 유도성(L), `−j` = 용량성(C). Vision이 붙인 타입 문자는 신뢰하지 않는다.
 *
 * ★ 적용 범위는 **수동 소자(R·L·C)** 로 한정한다. 전원(V·I)의 값에는 `1+j2 V` 같은 직교 페이저가
 *   올 수 있어, 전원까지 건드리면 독립원을 리액티브 소자로 오인한다.
 *
 * [[feedback_gpt_format_normalization]] — 프롬프트·분류 로직을 고치기 전에 **정규화로 흡수**한다.
 * 같은 패턴의 선례: `lib/analysis/dependentSource.ts` (다이아몬드 종속전원을 값으로 판별).
 */

/** 정규화 대상 수동 소자 타입 (전원은 제외 — 직교 페이저 오인 방지). */
const PASSIVE_TYPES = new Set(["R", "L", "C", "Z"]);

/**
 * 순허수 임피던스 표기 — 선택적 부호 + `j` + 선택적 크기(정수·소수·분수).
 * 예: `j` · `j15` · `-j1/2` · `+j0.5`. 크기가 없으면 계수 1(원본의 `j[Ω]`).
 */
const PURE_IMAGINARY_RE = /^([+-]?)j(?:\d+(?:\.\d+)?(?:\/\d+)?)?$/i;

/**
 * 값 문자열에서 리액티브 종류를 판정.
 *
 * @returns "L"(유도성 +j) · "C"(용량성 −j) · null(리액티브 표기가 아님)
 */
export function reactiveKindFromValue(value: unknown): "L" | "C" | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw
    .replace(/[[\]()\s]/g, "")
    .replace(/[Ωω]|ohm|옴/gi, "")
    .replace(/[−–—]/g, "-"); // 유니코드 마이너스 → ASCII
  const m = PURE_IMAGINARY_RE.exec(normalized);
  if (!m) return null;
  return m[1] === "-" ? "C" : "L";
}

/**
 * 소자의 **실질 타입**을 돌려준다 — 수동 소자의 값이 순허수면 L·C로 교정.
 *
 * Vision이 `j[Ω]`를 R로, 혹은 L↔C를 뒤바꿔 뱉은 회차를 모두 흡수한다.
 *
 * @returns 대문자 타입 문자열 (교정 대상이 아니면 원래 타입 그대로)
 */
export function effectiveComponentType(
  c: { type?: string | null; value?: unknown } | null | undefined,
): string {
  const t = String(c?.type ?? "").toUpperCase();
  if (!PASSIVE_TYPES.has(t)) return t;
  return reactiveKindFromValue(c?.value) ?? t;
}

/** 인벤토리·branch 컴포넌트 목록에 리액티브 소자(L 또는 C)가 있는지 — 값 기준 교정 포함. */
export function hasReactiveComponent(
  items: ReadonlyArray<{ type?: string | null; value?: unknown }> | null | undefined,
): boolean {
  return (items ?? []).some((c) => {
    const t = effectiveComponentType(c);
    return t === "L" || t === "C";
  });
}
