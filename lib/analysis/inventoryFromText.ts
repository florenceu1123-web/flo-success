/**
 * 분석 텍스트에서 component inventory를 추론 — Vision inventory 추출 실패(schema_fail) 대비.
 *
 * ★ 왜 필요한가 (실측 신고 2건):
 *   `extractComponentInventory`가 schema_fail로 **빈 배열**을 반환하면 componentInventory가 비고,
 *   classifyCircuitType의 **인벤토리 게이트 분기가 전부 미발화**한다. 그 결과
 *     · 임용 9번(RLC 주파수응답) → `unsupported` → 생성 실패
 *     · 임용 10번(NMOS 캐스코드 전류미러) → `dc_dependent_source` → 전혀 다른 문제
 *   분기마다 텍스트 fallback을 넣는 건 두더지잡기라, **한 곳에서 최소 인벤토리를 합성**해
 *   기존 게이트들이 그대로 동작하게 한다([[feedback_gpt_format_normalization]] 정신).
 *
 * ⚠️ 어디까지나 **비었을 때의 대체재**다. 정상 추출이 있으면 그것을 쓴다(정확도가 높다).
 */

export type InferredComponent = { id: string; type: string; value?: string };

type Rule = {
  type: string;
  /** 값이 붙는 소자면 값 캡처 정규식(global), 아니면 존재만 확인하는 정규식 */
  re: RegExp;
  /** 값 없는 소자(키워드 존재만으로 1개 추가) */
  keywordOnly?: boolean;
  /** 최대 추가 개수 */
  max?: number;
};

const RULES: Rule[] = [
  // 값이 있는 수동 소자 — 단위로 판별
  { type: "R", re: /(\d+(?:\.\d+)?)\s*(?:k|M)?\s*(?:Ω|ohm|옴)/gi, max: 8 },
  { type: "L", re: /(\d+(?:\.\d+)?)\s*(?:m|µ|u)?\s*H\b/g, max: 4 },
  { type: "C", re: /(\d+(?:\.\d+)?)\s*(?:µ|u|n|p|m)?\s*F\b/g, max: 4 },
  { type: "V", re: /(\d+(?:\.\d+)?)\s*V\b(?!\s*\/)/g, max: 4 },
  { type: "I", re: /(\d+(?:\.\d+)?)\s*(?:m|µ|u)?A\b/g, max: 4 },
  // 능동 소자·기타 — 키워드 존재로 판별
  { type: "MOSFET", re: /nmos|pmos|mosfet|모스펫|전계효과\s*트랜지스터/i, keywordOnly: true, max: 3 },
  { type: "BJT", re: /bjt|npn|pnp|바이폴라/i, keywordOnly: true, max: 2 },
  { type: "OPAMP", re: /연산\s*증폭기|op\s*-?\s*amp|opamp|비교기|comparator/i, keywordOnly: true, max: 2 },
  { type: "D", re: /다이오드|diode|제너/i, keywordOnly: true, max: 2 },
  { type: "SW", re: /스위치|switch|\bsw\b/i, keywordOnly: true, max: 1 },
];

/** 다중 소자 표기(M₁·M₂·M₃, Q1·Q2 …)에서 개수 추정 — 캐스코드/미러 판별에 필요. */
function multiDeviceCount(text: string, prefix: string): number {
  const re = new RegExp(`${prefix}\\s*[_]?\\s*([1-9]|₁|₂|₃|₄)`, "gi");
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) seen.add(m[1]);
  return seen.size;
}

/**
 * 텍스트에서 최소 inventory를 합성. 확실한 신호만 넣는다(과잉 추론 금지).
 */
export function inferInventoryFromText(text: string | null | undefined): InferredComponent[] {
  const t = String(text ?? "");
  if (!t.trim()) return [];
  const out: InferredComponent[] = [];
  const push = (type: string, value?: string) => {
    out.push({ id: `${type}${out.filter((c) => c.type === type).length + 1}`, type, value });
  };

  for (const rule of RULES) {
    const max = rule.max ?? 4;
    if (rule.keywordOnly) {
      if (rule.re.test(t)) {
        // MOSFET·BJT는 M₁·M₂·M₃ / Q1·Q2 표기로 개수 추정 (캐스코드·미러 분기가 개수를 본다)
        let n = 1;
        if (rule.type === "MOSFET") n = Math.max(1, Math.min(max, multiDeviceCount(t, "m")));
        if (rule.type === "BJT") n = Math.max(1, Math.min(max, multiDeviceCount(t, "q")));
        for (let i = 0; i < n; i++) push(rule.type);
      }
      continue;
    }
    const seen = new Set<string>();
    for (const m of t.matchAll(rule.re)) {
      const raw = m[0].replace(/\s+/g, "");
      if (seen.has(raw)) continue;
      seen.add(raw);
      if (seen.size > max) break;
      push(rule.type, raw);
    }
  }

  // ★ 값 없이 이름만 나오는 소자 보강 — "커패시터 C의 정전용량", "인덕터 L" 처럼
  //   학생이 구해야 하는 소자는 값이 없어 위 정규식에 안 걸린다. 이름만으로 1개 추가한다.
  //   (RLC 분기처럼 "R·L·C가 모두 있어야" 하는 게이트가 이것 때문에 깨졌다 — 실측.)
  const nameOnly: Array<{ type: string; re: RegExp }> = [
    { type: "R", re: /저항|resistor/i },
    { type: "L", re: /인덕터|코일|inductor/i },
    { type: "C", re: /커패시터|축전기|콘덴서|capacitor|정전용량|커패시턴스/i },
    { type: "V", re: /전압원|voltage source/i },
    { type: "I", re: /전류원|current source/i },
  ];
  for (const n of nameOnly) {
    if (!out.some((c) => c.type === n.type) && n.re.test(t)) push(n.type);
  }
  return out;
}
