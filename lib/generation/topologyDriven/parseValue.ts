/**
 * TopologySignature.branches[].components[].value 의 string/number 표기를 파싱.
 *
 *  지원 표기 예:
 *   - "10V"       → { numeric: 10, suffix: "V" }
 *   - "10Ω"·"10Ohm" → { numeric: 10, suffix: "Ω" }
 *   - "1A"        → { numeric: 1, suffix: "A" }
 *   - "0.2V2"·"0.2V_2"·"0.2 v_2" → { numeric: 0.2, controlRef: "V2" } (종속전원 gain·control)
 *   - 숫자 단독 (number 타입)  → { numeric: 그대로 }
 *
 *  control ref는 보통 V1·V2 등 노드 라벨. analyze에서 vertical leg의 top node 라벨과 매칭됨.
 */
export type ParsedValue = {
  numeric: number;
  suffix?: string;
  controlRef?: string;
};

export function parseValue(raw: string | number | undefined): ParsedValue | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return { numeric: raw };

  const s = raw.trim();
  if (!s) return null;

  // 1) gain · control variable (종속전원): "0.2V2", "0.2V_2", "2I_x" 등
  // 형식: <coefficient><space?><V|I><digit|alpha>(subscript or numeric)
  const depMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*([VI])\s*_?\s*([0-9A-Za-z]+)$/);
  if (depMatch) {
    return {
      numeric: parseFloat(depMatch[1]),
      controlRef: `${depMatch[2]}${depMatch[3]}`,
    };
  }

  // 2) numeric + unit suffix: "10V", "10Ω", "10Ohm", "1A", "10kΩ", "100mH", "0.1μF", "10nF"
  //    scientific notation도 지원: "1.5e-7F"
  const numRe = "(-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)";
  const unitMatch = s.match(new RegExp(`^${numRe}\\s*([kKmMμunp]?)\\s*(Ω|ohm|Ohm|V|v|A|a|H|h|F|f)$`));
  if (unitMatch) {
    const base = parseFloat(unitMatch[1]);
    const scale = scaleOfPrefix(unitMatch[2]);
    const suffix = normalizeUnit(unitMatch[3]);
    return { numeric: base * scale, suffix };
  }

  // 3) numeric 단독 ("10", "0.5", "1.5e-7")
  const numMatch = s.match(new RegExp(`^${numRe}$`));
  if (numMatch) return { numeric: parseFloat(s) };

  return null;
}

function scaleOfPrefix(p: string): number {
  switch (p) {
    case "k": case "K": return 1e3;
    case "M": return 1e6;
    case "m": return 1e-3;
    case "μ": case "u": return 1e-6;
    case "n": return 1e-9;
    case "p": return 1e-12;
    default: return 1;
  }
}

function normalizeUnit(u: string): string {
  const lower = u.toLowerCase();
  if (lower === "ohm" || u === "Ω") return "Ω";
  if (lower === "v") return "V";
  if (lower === "a") return "A";
  if (lower === "h") return "H";
  if (lower === "f") return "F";
  return u;
}
