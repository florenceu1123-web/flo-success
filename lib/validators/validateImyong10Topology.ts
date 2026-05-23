/**
 * Imyong 10번 형식 회로의 semantic 검증 — 사용자 정의 contract.
 *
 *  입력: 단순화된 netlist (CircuitNetlist를 정규화한 형태).
 *  반환: 위반 메시지 배열. 빈 배열이면 통과.
 *
 *  검사 항목:
 *   1) 전압원 +단자가 GND에 직접 연결되면 안 됨
 *   2) 전압원 −단자는 반드시 GND에 연결
 *   3) 가변저항(R_VAR)은 V1-GND 사이에 위치
 *   4) V1-V2 사이에 일반 R(저항)이 적어도 1개 존재 (current source만으론 부족)
 *
 *  파이프라인 위치: 노드 그래프 생성 → [여기] → 좌표 배치 → 그림 렌더링.
 */

export type Imyong10VComponent = { id: string; type: "V"; value?: string; p: string; n: string };
export type Imyong10TwoTerminal = { id: string; type: "R" | "R_VAR" | "I"; value?: string; a: string; b: string };
export type Imyong10Component = Imyong10VComponent | Imyong10TwoTerminal;

export type Imyong10Netlist = {
  components: Imyong10Component[];
};

export function validateImyong10Topology(c: Imyong10Netlist): string[] {
  const errors: string[] = [];

  const vsrc = c.components.find((x): x is Imyong10VComponent => x.type === "V");
  if (!vsrc) {
    errors.push("전압원(V) 컴포넌트 없음");
  } else {
    if (vsrc.p === "GND") {
      errors.push("전압원 +단자가 GND에 직접 연결됨");
    }
    if (vsrc.n !== "GND") {
      errors.push("전압원 -단자는 반드시 GND에 연결되어야 함");
    }
  }

  const rvar = c.components.find((x): x is Imyong10TwoTerminal => x.type === "R_VAR");
  if (!rvar) {
    errors.push("가변저항(R_VAR) 컴포넌트 없음");
  } else if (!(rvar.a === "V1" && rvar.b === "GND") && !(rvar.a === "GND" && rvar.b === "V1")) {
    errors.push("가변저항 R은 V1-GND 사이에 있어야 함");
  }

  const hasV1V2Resistor = c.components.some(
    (x): x is Imyong10TwoTerminal =>
      x.type === "R" &&
      "a" in x && "b" in x &&
      ((x.a === "V1" && x.b === "V2") || (x.a === "V2" && x.b === "V1")),
  );
  if (!hasV1V2Resistor) {
    errors.push("V1-V2 사이 저항이 없음");
  }

  return errors;
}
