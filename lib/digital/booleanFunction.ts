/**
 * Boolean 함수 표현 — minterm 집합 기반.
 *
 *  - vars: 변수 개수 (3 또는 4)
 *  - minterms: F=1인 인덱스 집합 (0..2^n-1)
 *  - dontCares: don't-care 항 (선택)
 *
 *  변수 이름은 관례적으로 A, B, C, D... (vars 만큼). 라벨링은 호출자가 결정.
 */

export type BooleanFunction = {
  vars: number;                  // 변수 개수
  varNames: string[];            // ["A", "B", "C"] 등
  minterms: number[];            // F=1인 인덱스
  dontCares: number[];           // don't-care (옵션)
};

/**
 * 진리표 row 단위 (입력 배열 + 출력).
 */
export type TruthRow = {
  inputs: number[];   // 길이 = vars (0 또는 1)
  output: 0 | 1 | "X";
};

/**
 * F의 모든 행 진리표 생성 (2^vars 행).
 */
export function truthTable(f: BooleanFunction): TruthRow[] {
  const rows: TruthRow[] = [];
  const N = 1 << f.vars;
  for (let i = 0; i < N; i++) {
    const inputs: number[] = [];
    for (let b = f.vars - 1; b >= 0; b--) inputs.push((i >> b) & 1);
    let output: 0 | 1 | "X" = 0;
    if (f.dontCares.includes(i)) output = "X";
    else if (f.minterms.includes(i)) output = 1;
    rows.push({ inputs, output });
  }
  return rows;
}

/**
 * F의 K-map 표현 — Gray code 정렬, rowVars/colVars 분할.
 *  3변수: rowVars=[A], colVars=[B,C], rows=2, cols=4
 *  4변수: rowVars=[A,B], colVars=[C,D], rows=4, cols=4
 */
export type KmapRepresentation = {
  rowVars: string[];
  colVars: string[];
  rowOrder: string[];   // Gray code (예: ["0", "1"] or ["00", "01", "11", "10"])
  colOrder: string[];
  cells: Array<Array<0 | 1 | "X">>;  // cells[row][col]
};

const GRAY_2 = ["00", "01", "11", "10"];

export function buildKmap(f: BooleanFunction): KmapRepresentation {
  if (f.vars === 3) {
    const rowVars = [f.varNames[0]];
    const colVars = [f.varNames[1], f.varNames[2]];
    const rowOrder = ["0", "1"];
    const colOrder = GRAY_2;
    const cells: Array<Array<0 | 1 | "X">> = [];
    for (let r = 0; r < 2; r++) {
      const row: Array<0 | 1 | "X"> = [];
      for (let c = 0; c < 4; c++) {
        const idx = (r << 2) | parseInt(colOrder[c], 2);
        if (f.dontCares.includes(idx)) row.push("X");
        else row.push(f.minterms.includes(idx) ? 1 : 0);
      }
      cells.push(row);
    }
    return { rowVars, colVars, rowOrder, colOrder, cells };
  }
  if (f.vars === 4) {
    const rowVars = [f.varNames[0], f.varNames[1]];
    const colVars = [f.varNames[2], f.varNames[3]];
    const rowOrder = GRAY_2;
    const colOrder = GRAY_2;
    const cells: Array<Array<0 | 1 | "X">> = [];
    for (let r = 0; r < 4; r++) {
      const row: Array<0 | 1 | "X"> = [];
      for (let c = 0; c < 4; c++) {
        const rowBits = parseInt(rowOrder[r], 2);
        const colBits = parseInt(colOrder[c], 2);
        const idx = (rowBits << 2) | colBits;
        if (f.dontCares.includes(idx)) row.push("X");
        else row.push(f.minterms.includes(idx) ? 1 : 0);
      }
      cells.push(row);
    }
    return { rowVars, colVars, rowOrder, colOrder, cells };
  }
  throw new Error(`unsupported vars=${f.vars} (3 or 4 only)`);
}

/**
 * 최소 SOP product term 표현.
 *   - vars: 각 변수가 어떻게 등장하는지 ("1"=literal 그대로, "0"=complement, "X"=무관)
 *   - 예: 3변수에서 "10X" → A·B' (C는 무관)
 */
export type SopTerm = {
  pattern: string;     // 길이=vars, 각 자리는 "0"/"1"/"X"
  covers: number[];    // 이 항이 cover하는 minterm 인덱스들
};

/**
 * SOP를 사람이 읽기 쉬운 텍스트로 변환.
 *  pattern "10X" + vars [A,B,C] → "AB'"
 *  모든 자리가 X면 "1" (tautology)
 *  pattern 빈 SOP면 "0"
 */
export function sopTermToString(term: SopTerm, varNames: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < term.pattern.length; i++) {
    const ch = term.pattern[i];
    if (ch === "X") continue;
    parts.push(ch === "1" ? varNames[i] : `${varNames[i]}'`);
  }
  if (parts.length === 0) return "1";
  return parts.join("");
}

export function sopToString(sop: SopTerm[], varNames: string[]): string {
  if (sop.length === 0) return "0";
  return sop.map((t) => sopTermToString(t, varNames)).join(" + ");
}

/**
 * POS term을 sum 형태로 변환.
 *  pattern "010" + [A,B,C] → "(A' + B + C')"
 *  모든 자리가 X면 "1" (해당 항 없음, 의미상)
 */
export function posTermToString(term: SopTerm, varNames: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < term.pattern.length; i++) {
    const ch = term.pattern[i];
    if (ch === "X") continue;
    parts.push(ch === "1" ? varNames[i] : `${varNames[i]}'`);
  }
  if (parts.length === 0) return "1";
  return `(${parts.join(" + ")})`;
}

export function posToString(pos: SopTerm[], varNames: string[]): string {
  if (pos.length === 0) return "1";
  return pos.map((t) => posTermToString(t, varNames)).join("·");
}
