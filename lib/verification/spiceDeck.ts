import type { SolverNetwork } from "@/lib/solver/mna";

/**
 * SolverNetwork → SPICE netlist 텍스트 변환 (ngspice batch 호환).
 *
 *  SPICE 규약:
 *   - ground 노드는 "0" (ngspice 표준)
 *   - 컴포넌트 prefix: R/V/I/C/L (독립), E (VCVS), G (VCCS), F (CCCS), H (CCVS), X (subckt OPAMP)
 *   - VCCS/VCVS는 control 노드 쌍을 함수 인자로 받음
 *   - OPAMP는 .subckt OPAMP_IDEAL 정의 사용 (gain 1e6)
 *   - .op 으로 DC operating point 풀고 .print 로 결과 출력
 *
 *  현재 지원:
 *   - R, 독립 V, 독립 I, VCCS, VCVS, ideal OPAMP
 *   - C/L은 .op 에서 DC steady state (open/short)로 처리되므로 transient는 미지원
 */

const GROUND_SPICE_NODE = "0";

function spiceNode(node: string, groundId: string): string {
  return node === groundId ? GROUND_SPICE_NODE : node.replace(/[^a-zA-Z0-9_]/g, "_");
}

export type SpiceDeckOptions = {
  /** 데크 제목 (주석 첫 줄) */
  title?: string;
  /** 출력할 노드 voltage 라벨 — 예: ["a", "top"] */
  printNodes?: string[];
  /** 출력할 V 소스 전류 — 예: ["V1"] */
  printVsourceCurrents?: string[];
};

/**
 * Solver 네트워크와 출력 요구사항을 받아 SPICE 데크 생성.
 */
export function buildSpiceDeck(net: SolverNetwork, opts: SpiceDeckOptions = {}): string {
  const { groundId } = net;
  const lines: string[] = [];

  lines.push(`* ${opts.title ?? "flo-success generated deck"}`);
  lines.push("");

  // 저항
  for (const r of net.resistors) {
    lines.push(
      `R${r.id} ${spiceNode(r.a, groundId)} ${spiceNode(r.b, groundId)} ${formatValue(r.R)}`,
    );
  }

  // 독립 V 소스
  for (const v of net.vsources) {
    lines.push(
      `V${v.id} ${spiceNode(v.a, groundId)} ${spiceNode(v.b, groundId)} DC ${formatValue(v.V)}`,
    );
  }

  // 독립 I 소스 — ngspice 약속: I src1 src2 value → 전류는 src1 → src2 방향 (외부에서 보면 src2에서 흘러나옴).
  // 우리 convention: a에서 외부로 흘러나옴 (a=source, b=sink). ngspice: 첫 인자에서 둘째 인자로 흐름.
  //  ngspice 표준: I 컴포넌트는 첫 단자 → 둘째 단자 방향으로 전류가 외부에서 흐름.
  //  즉, ngspice I "I1 nA nB val" 는 nA에서 nB로 (외부) val A.
  //  우리 convention {a, b}: a에서 외부로 흘러나옴 → ngspice 형식으로 b nA, a nB (방향 뒤집기)
  //  실용적: ngspice는 "I name nodeA nodeB value" — 전류가 nodeA에서 nodeB로 외부 흐름.
  //  우리 a (source: 흘러나옴), b (sink: 흘러들어옴) → ngspice nodeA=b, nodeB=a (외부 b→a)? 헷갈림.
  //  사실 우리 정의는 textbook: a→b 내부 흐름 (외부 b→a). textbook = 화살표 a→b inside source.
  //  ngspice "I1 nA nB val": 전류 nA→nB 외부 (= nB→nA 내부). textbook 화살표 nB→nA 내부.
  //  ∴ 우리 {a, b} (내부 a→b) → ngspice "I1 b a val".
  for (const i of net.isources) {
    lines.push(
      `I${i.id} ${spiceNode(i.b, groundId)} ${spiceNode(i.a, groundId)} DC ${formatValue(i.I)}`,
    );
  }

  // VCCS — G_name nout+ nout- ncontrol+ ncontrol- transconductance
  // 출력: nout+ → nout- 방향으로 g·(V(nc+) - V(nc-)) 흐름 (외부 흐름).
  // 우리 convention: 출력 단자 a→b 내부 (외부 b→a).
  for (const dep of net.vccs ?? []) {
    lines.push(
      `G${dep.id} ${spiceNode(dep.b, groundId)} ${spiceNode(dep.a, groundId)} ` +
      `${spiceNode(dep.vca, groundId)} ${spiceNode(dep.vcb, groundId)} ${formatValue(dep.g)}`,
    );
  }

  // VCVS — E_name nout+ nout- ncontrol+ ncontrol- gain
  // V(nout+) - V(nout-) = gain · (V(nc+) - V(nc-))
  // 우리: V(a) - V(b) = k·(V(vca) - V(vcb)) → ngspice 그대로
  for (const dep of net.vcvs ?? []) {
    lines.push(
      `E${dep.id} ${spiceNode(dep.a, groundId)} ${spiceNode(dep.b, groundId)} ` +
      `${spiceNode(dep.vca, groundId)} ${spiceNode(dep.vcb, groundId)} ${formatValue(dep.k)}`,
    );
  }

  // OPAMP — ideal subcircuit 사용
  if ((net.opamps ?? []).length > 0) {
    lines.push("");
    lines.push("* Ideal opamp subcircuit (open-loop gain 1e6)");
    lines.push(".subckt OPAMP_IDEAL pos neg out");
    lines.push("E1 out 0 pos neg 1e6");
    lines.push(".ends");
    lines.push("");
    for (const op of net.opamps!) {
      lines.push(
        `X${op.id} ${spiceNode(op.vp, groundId)} ${spiceNode(op.vn, groundId)} ` +
        `${spiceNode(op.vo, groundId)} OPAMP_IDEAL`,
      );
    }
  }

  // Analysis: .op
  lines.push("");
  lines.push(".op");

  // Print: 노드 voltage + V 소스 전류
  const printItems: string[] = [];
  for (const node of opts.printNodes ?? []) {
    printItems.push(`v(${spiceNode(node, groundId)})`);
  }
  for (const vid of opts.printVsourceCurrents ?? []) {
    printItems.push(`i(V${vid})`);
  }
  if (printItems.length > 0) {
    lines.push(`.print dc ${printItems.join(" ")}`);
  }
  lines.push(".end");

  return lines.join("\n");
}

/**
 * 숫자를 SPICE 호환 형식으로 포맷.
 *  - 큰 값은 k/M, 작은 값은 m/u/n/p 단위 사용 가능하나, 기본 e-표기법 사용 (모호성 회피).
 */
function formatValue(x: number): string {
  if (x === 0) return "0";
  if (!Number.isFinite(x)) throw new Error(`SPICE value invalid: ${x}`);
  // 정수면 그대로
  if (Number.isInteger(x) && Math.abs(x) < 1e9) return String(x);
  // 그 외 e-표기
  return x.toExponential(6);
}
