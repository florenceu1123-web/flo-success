/**
 * ngspice batch 출력 파서.
 *
 *  ngspice -b 의 .print 결과는 stdout에 다음 형태로 나옴:
 *    Index    sweep        v(a)        v(top)        i(v1)
 *    0        0.000000e+00 4.800000e+00 1.200000e+01  -1.200000e-03
 *
 *  또는 .op만 있는 경우:
 *    Operating point information ...
 *    Node                                  Voltage
 *    -----------------------------------------------
 *    v(a)                                  4.8000e+00
 *    v(top)                                12.0000
 *
 *  파서는 두 포맷 모두 처리:
 *    - 표 형식 (.print)
 *    - "node value" 행 형식 (.op default)
 */

export type ParsedSpiceResult = {
  /** 노드 전압 (key는 lowercase, 예: "v(a)" → key "a") */
  nodeVoltages: Record<string, number>;
  /** V 소스 전류 (key는 lowercase, 예: "i(v1)" → key "V1") */
  vsourceCurrents: Record<string, number>;
};

/**
 * ngspice stdout에서 .op 또는 .print 결과 추출.
 */
export function parseNgspiceOutput(stdout: string): ParsedSpiceResult {
  const nodeVoltages: Record<string, number> = {};
  const vsourceCurrents: Record<string, number> = {};

  // 1) "v(name)  value" 행 형식 (operating point)
  const lineRe = /^\s*v\(([^)]+)\)\s+([-+]?[\d.]+(?:[eE][-+]?\d+)?)/gim;
  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(stdout)) !== null) {
    const node = m[1].trim();
    const value = parseFloat(m[2]);
    if (Number.isFinite(value) && node) nodeVoltages[node] = value;
  }

  const iLineRe = /^\s*i\(v([^)]+)\)\s+([-+]?[\d.]+(?:[eE][-+]?\d+)?)/gim;
  while ((m = iLineRe.exec(stdout)) !== null) {
    const id = m[1].trim();
    const value = parseFloat(m[2]);
    if (Number.isFinite(value) && id) vsourceCurrents[id] = value;
  }

  // 2) 표 형식 (.print dc) — header 라인 + data 라인
  //    예: "Index  sweep   v(a)   v(top)   i(v1)"
  //         "0     0.0     4.8e0  1.2e1    -1.2e-3"
  const lines = stdout.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    const header = lines[i];
    const data = lines[i + 1];
    if (!header || !data) continue;

    // header가 v(...) 또는 i(v...) 토큰 포함하는지 확인
    const tokens = header.trim().split(/\s+/);
    const hasMeasure = tokens.some((t) => /^[vi]\(/.test(t.toLowerCase()));
    if (!hasMeasure) continue;

    const dataTokens = data.trim().split(/\s+/);
    if (dataTokens.length !== tokens.length) continue;

    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k].toLowerCase();
      const val = parseFloat(dataTokens[k]);
      if (!Number.isFinite(val)) continue;
      const vm = /^v\(([^)]+)\)$/.exec(t);
      if (vm) {
        nodeVoltages[vm[1]] = val;
        continue;
      }
      const im = /^i\(v([^)]+)\)$/.exec(t);
      if (im) {
        vsourceCurrents[im[1]] = val;
      }
    }
  }

  return { nodeVoltages, vsourceCurrents };
}
