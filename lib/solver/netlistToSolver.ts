/**
 * 범용 CircuitNetlist → SolverNetwork 변환기.
 *
 *  목적: GPT가 emit(또는 빌더가 생성)한 구조 netlist를 MNA 솔버 입력으로 변환.
 *  지금까지 각 opamp.ts 빌더가 netlist 옆에 solverNet을 **수동**으로 만들었는데,
 *  업로드 회로를 그대로 푸는 범용 경로에는 단일 변환기가 필요하다 (linchpin).
 *
 *  매핑:
 *    R    → resistors[{a,b,R}]                 (value: "10kΩ" → 10000Ω)
 *    V    → vsources[{a=+pin, b=−pin, V}]      (value: "3V" → 3)
 *    I    → isources[{a,b,I}]
 *    OPAMP→ opamps[{vp=pins[0], vn=pins[1], vo=pins[2]}]
 *    VCVS → vcvs[{a,b,vca,vcb,k}]              (gain·control)
 *    VCCS → vccs[{a,b,vca,vcb,g}]
 *    WIRE / closed SW → 양 끝 노드 등전위 병합 (union-find)
 *    GND / open SW    → 제외
 *
 *  ground: netlist.ground 우선, 없으면 GND 라벨 노드 자동 탐지.
 *
 *  ※ DC 선형(R/V/I/OPAMP/VCVS/VCCS)만. C/L은 DC 정상상태에서 각각 개방/단락으로 별도 전처리 필요
 *    (이 변환기는 무시) — OPAMP DC 분석엔 충분.
 */

import type { CircuitNetlist, CircuitComponent } from "@/types";
import type { SolverNetwork } from "./mna";
import { parseValue } from "@/lib/generation/topologyDriven/parseValue";

const GROUND_LABELS = new Set(["GND", "gnd", "Gnd", "0", "ground", "Ground", "GROUND"]);

export type NetlistToSolverResult = {
  net: SolverNetwork;
  /** 변환 중 건너뛴/경고 항목 (디버깅용) */
  warnings: string[];
};

/** 등전위 병합용 union-find. */
class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // path compression
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const nxt = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = nxt;
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

function numericOf(c: CircuitComponent): number | null {
  const p = parseValue(c.value);
  return p && Number.isFinite(p.numeric) ? p.numeric : null;
}

function isClosedSwitch(c: CircuitComponent): boolean {
  return c.type === "SW" && c.state === "closed";
}

/**
 * CircuitNetlist를 MNA SolverNetwork로 변환.
 *  @throws ground 노드를 찾을 수 없을 때.
 */
export function netlistToSolverNetwork(netlist: CircuitNetlist): NetlistToSolverResult {
  const warnings: string[] = [];
  const components = netlist.components ?? [];

  // ── 1. 등전위 병합 (WIRE, 닫힌 SW) ──
  const uf = new UnionFind();
  const allNodes = new Set<string>();
  for (const c of components) {
    for (const pin of c.pins ?? []) if (pin.node) allNodes.add(pin.node);
  }
  for (const c of components) {
    if (c.type === "WIRE" || isClosedSwitch(c)) {
      const ns = (c.pins ?? []).map((p) => p.node).filter(Boolean);
      for (let i = 1; i < ns.length; i++) uf.union(ns[0], ns[i]);
    }
  }
  const rep = (n: string) => uf.find(n);

  // ── 2. ground 결정 ──
  let groundRaw = netlist.ground && allNodes.has(netlist.ground) ? netlist.ground : undefined;
  if (!groundRaw) {
    for (const n of allNodes) {
      if (GROUND_LABELS.has(n)) { groundRaw = n; break; }
    }
  }
  if (!groundRaw) {
    throw new Error("netlistToSolverNetwork: ground 노드를 찾을 수 없음 (netlist.ground 또는 GND 라벨 필요)");
  }
  const groundId = rep(groundRaw);

  // ── 3. non-ground 노드 목록 ──
  const nodeSet = new Set<string>();
  for (const n of allNodes) {
    const r = rep(n);
    if (r !== groundId) nodeSet.add(r);
  }
  const nodeIds = [...nodeSet];

  // ── 4. 컴포넌트 매핑 ──
  const net: SolverNetwork = {
    nodeIds, groundId,
    resistors: [], vsources: [], isources: [], vccs: [], vcvs: [], opamps: [],
  };

  /** 종속전원 control 노드 해석: control 문자열 또는 value의 controlRef를 노드 rep으로. */
  const resolveControl = (c: CircuitComponent): { vca: string; vcb: string } | null => {
    const parsed = parseValue(c.value);
    const ref = c.control ?? parsed?.controlRef;
    if (!ref) return null;
    // ref가 노드 이름이면 그 노드↔GND 제어로 해석 (단일 노드 전압 제어).
    if (allNodes.has(ref)) return { vca: rep(ref), vcb: groundId };
    return null;
  };

  /**
   * 전류제어 종속전원(CCVS/CCCS)의 제어 저항 해석.
   *  제어 전류 i_x = 어떤 저항 R_ctrl을 흐르는 전류 = (V(p0) − V(p1)) / R_ctrl.
   *  따라서 CCVS(k·i_x) = VCVS(gain = k/R_ctrl, control = R_ctrl 두 노드).
   *  c.control(= 제어 저항 id) 우선, 없으면 value의 controlRef로 저항 id 매칭.
   */
  const resolveControlResistor = (c: CircuitComponent): { vca: string; vcb: string; rVal: number } | null => {
    const ref = c.control ?? parseValue(c.value)?.controlRef;
    if (!ref) return null;
    const refLc = String(ref).toLowerCase();
    const rctrl = components.find((x) =>
      x.type === "R" && (x.id === ref || x.id.toLowerCase() === refLc),
    );
    if (!rctrl || (rctrl.pins?.length ?? 0) < 2) return null;
    const rVal = numericOf(rctrl);
    if (rVal === null || rVal <= 0) return null;
    return { vca: rep(rctrl.pins[0].node), vcb: rep(rctrl.pins[1].node), rVal };
  };

  for (const c of components) {
    const pins = c.pins ?? [];
    switch (c.type) {
      case "R": {
        if (pins.length < 2) { warnings.push(`${c.id}: R 핀 부족`); break; }
        const R = numericOf(c);
        if (R === null || R <= 0) { warnings.push(`${c.id}: R 값 파싱 실패(${String(c.value)})`); break; }
        const a = rep(pins[0].node), b = rep(pins[1].node);
        if (a === b) { warnings.push(`${c.id}: R 양 끝 등전위 — 단락 처리(무시)`); break; }
        net.resistors.push({ id: c.id, a, b, R });
        break;
      }
      case "V": {
        if (pins.length < 2) { warnings.push(`${c.id}: V 핀 부족`); break; }
        const V = numericOf(c);
        if (V === null) { warnings.push(`${c.id}: V 값 파싱 실패(${String(c.value)})`); break; }
        net.vsources.push({ id: c.id, a: rep(pins[0].node), b: rep(pins[1].node), V });
        break;
      }
      case "I": {
        if (pins.length < 2) { warnings.push(`${c.id}: I 핀 부족`); break; }
        const I = numericOf(c);
        if (I === null) { warnings.push(`${c.id}: I 값 파싱 실패(${String(c.value)})`); break; }
        net.isources!.push({ id: c.id, a: rep(pins[0].node), b: rep(pins[1].node), I });
        break;
      }
      case "OPAMP": {
        if (pins.length < 3) { warnings.push(`${c.id}: OPAMP 3핀 미만`); break; }
        net.opamps!.push({ id: c.id, vp: rep(pins[0].node), vn: rep(pins[1].node), vo: rep(pins[2].node) });
        break;
      }
      case "VCVS": case "VCCS": {
        if (pins.length < 2) { warnings.push(`${c.id}: ${c.type} 핀 부족`); break; }
        const gain = numericOf({ ...c, value: c.gain ?? c.value });
        const ctrl = resolveControl(c);
        if (gain === null || !ctrl) { warnings.push(`${c.id}: ${c.type} gain·control 해석 실패`); break; }
        const a = rep(pins[0].node), b = rep(pins[1].node);
        if (c.type === "VCVS") net.vcvs!.push({ id: c.id, a, b, vca: ctrl.vca, vcb: ctrl.vcb, k: gain });
        else net.vccs!.push({ id: c.id, a, b, vca: ctrl.vca, vcb: ctrl.vcb, g: gain });
        break;
      }
      case "CCVS": case "CCCS": {
        if (pins.length < 2) { warnings.push(`${c.id}: ${c.type} 핀 부족`); break; }
        // 이득 k — "2i_x"·"2ix"·"-3 i_x" 등에서 선행 숫자만 추출 (parseValue는 소문자 i 못 읽음).
        const kMatch = String(c.gain ?? c.value ?? "").match(/^\s*(-?\d+(?:\.\d+)?)/);
        const k = kMatch ? parseFloat(kMatch[1]) : null;
        const ctrl = resolveControlResistor(c);
        if (k === null || !ctrl) { warnings.push(`${c.id}: ${c.type} 제어전류(i_x) 저항 해석 실패 — control에 제어 저항 id 필요(현재 control=${String(c.control)})`); break; }
        const a = rep(pins[0].node), b = rep(pins[1].node);
        // i_x = (V(vca)−V(vcb))/R_ctrl → k·i_x = (k/R_ctrl)·(V(vca)−V(vcb))
        const eqGain = k / ctrl.rVal;
        if (c.type === "CCVS") net.vcvs!.push({ id: c.id, a, b, vca: ctrl.vca, vcb: ctrl.vcb, k: eqGain });
        else net.vccs!.push({ id: c.id, a, b, vca: ctrl.vca, vcb: ctrl.vcb, g: eqGain });
        warnings.push(`${c.id}: ${c.type}(${k}·i_x) → 제어저항(${ctrl.rVal}Ω) 통해 VCVS/VCCS(gain=${eqGain}) 변환`);
        break;
      }
      case "WIRE": case "GND": break;        // 병합 처리됨
      case "SW": break;                       // closed=병합, open=개방(무시)
      case "C": case "L": case "D": case "BJT": case "MOSFET":
        warnings.push(`${c.id}: ${c.type} 미지원(DC 선형 변환기) — 무시`);
        break;
    }
  }

  // ── 5. 외부 입력 단자 라벨 → 전압원 보강 ──
  //   OPAMP 회로도는 입력 전원을 V 컴포넌트 대신 단자 라벨("V_1 = 3V")로 표기하는 idiom이 흔하다
  //   (buildSumming, GPT/Vision 추출 등). 그런 노드는 그 전압의 독립 전압원(node↔GND)으로 해석.
  //   보수적: label_only 주석 RHS가 명확히 전압(suffix "V")이고, 이미 전원이 닿지 않은 노드만.
  const sourcedNodes = new Set<string>();
  for (const v of net.vsources) { sourcedNodes.add(v.a); sourcedNodes.add(v.b); }
  for (const i of net.isources!) { sourcedNodes.add(i.a); sourcedNodes.add(i.b); }
  for (const ann of netlist.nodeAnnotations ?? []) {
    if (!ann.node || !allNodes.has(ann.node)) continue;
    const r = rep(ann.node);
    if (r === groundId || sourcedNodes.has(r)) continue;
    const rhs = ann.label.includes("=") ? ann.label.slice(ann.label.indexOf("=") + 1) : ann.label;
    const pv = parseValue(rhs.trim());
    if (pv && pv.suffix === "V" && Number.isFinite(pv.numeric)) {
      net.vsources.push({ id: `Vann_${ann.node}`, a: r, b: groundId, V: pv.numeric });
      sourcedNodes.add(r);
      warnings.push(`${ann.node}: 단자 라벨 "${ann.label.trim()}" → 전압원 ${pv.numeric}V 보강`);
    }
  }

  return { net, warnings };
}
