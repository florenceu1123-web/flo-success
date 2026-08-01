/**
 * 종속전원(controlled source) 값 정규화 — Vision 출력 형식 흔들림 흡수.
 *
 * Vision은 다이아몬드 종속전원을 자주 일반 V/I 타입으로 추출하고 제어식만 value에 남긴다
 * (실측: 다이아몬드 "2V_c" → {type:"V", value:"2Vc"}). 이러면 counts.dep=0·hasDependentSource=false가 되어
 * "독립 전압원 2개" 시그니처로 엉뚱한 archetype에 잡힌다(실측: ac_dc_superposition_rc 오분류).
 *
 * ★ 판별 규칙: 값이 **다른 전압·전류를 참조**(계수 × V_x / I_x)하면 종속전원이다.
 *   독립원("10V"·"5A"·"10∠45°V")은 계수 뒤에 식별자가 없다.
 *   type이 이미 VCVS/VCCS/CCVS/CCCS면 당연히 종속.
 */

const DEP_TYPES = new Set(["VCVS", "VCCS", "CCVS", "CCCS"]);

/** 계수 × (V|I) + 식별자 — "2Vc"·"2·V_c"·"0.2V₃"·"2i_x"·"3I_1". */
const DEP_REF_RE = /(?:^|[^a-z0-9])[-+]?\d*\.?\d+\s*[·*×]?\s*[vi]\s*(?:_\s*)?[a-z0-9₀-₉]/i;
/** 소수 계수 + V/I (첨자를 Vision이 흘린 경우) — "0.2V". 독립원은 "10V"처럼 정수 계수라 안 걸림. */
const DEP_FRAC_RE = /\d*\.\d+\s*[·*×]?\s*[vi]\b/i;
/**
 * 첨자 없는 제어량 — "2i"·"3v"·"0.5i" (실측: 임용 7번 종속전류원 라벨이 그냥 `2i`).
 * ★ 대소문자를 **구분**한다: 소문자 i·v는 전류·전압 **변수**, 대문자 V·A는 **단위**다.
 *   ("25V"·"5A" 같은 독립원이 종속원으로 오인되면 회로 전체가 무너진다.)
 * ★ 값 전체가 이 형태일 때만 인정 — 문자열 일부 우연 일치 방지.
 */
const DEP_BARE_VAR_RE = /^[-+]?\d*\.?\d+\s*[·*×]?\s*[iv]$/;

/** 값 문자열이 종속전원의 제어식인지 (예 "2V_c"·"0.2V₃"·"2i_x"). */
export function isDependentSourceValue(value: unknown): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  return DEP_REF_RE.test(v) || DEP_FRAC_RE.test(v) || DEP_BARE_VAR_RE.test(v);
}

/** 컴포넌트(inventory·branch)가 종속전원인지 — type 또는 value 기준. */
export function isDependentComponent(c: { type?: string | null; value?: string | null } | null | undefined): boolean {
  if (!c) return false;
  if (DEP_TYPES.has(String(c.type ?? "").toUpperCase())) return true;
  return isDependentSourceValue(c.value);
}

/** 종속전류원(VCCS)인지 — 전류원 다이아몬드(type I/VCCS/CCCS) + 제어식 value. */
export function isDependentCurrentSource(c: { type?: string | null; value?: string | null } | null | undefined): boolean {
  if (!c) return false;
  const t = String(c?.type ?? "").toUpperCase();
  if (t === "VCCS" || t === "CCCS") return true;
  return t === "I" && isDependentSourceValue(c?.value);
}
