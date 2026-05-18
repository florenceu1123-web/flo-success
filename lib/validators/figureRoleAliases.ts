/**
 * figure role alias 그룹 — 같은 semantic을 가진 role 이름들의 동치 클래스.
 * validator의 dedup·alias 매칭에서 공통으로 사용.
 */
const ALIAS_GROUPS: string[][] = [
  ["main_circuit", "original_circuit"],
  ["state_before", "switch_open", "before_state"],
  ["state_after", "switch_closed", "after_state"],
  ["equivalent_circuit", "thevenin_equivalent", "norton_equivalent"],
  ["implementation_circuit", "logic_implementation"],
  ["waveform", "input_waveform", "output_waveform", "measurement_waveform"],
  ["truth_table", "state_table"],
];

/** role이 속한 alias 그룹 반환. 없으면 [role] 단일. */
export function getAliasGroup(role: string): string[] {
  for (const g of ALIAS_GROUPS) if (g.includes(role)) return g;
  return [role];
}

/** alias 그룹의 canonical key (정렬된 join) — dedup 비교용. */
export function aliasGroupKey(role: string): string {
  return [...getAliasGroup(role)].sort().join("|");
}

/** STATE figure 그룹에 속하는 role인지 (state_before/state_after 계열) */
export function isStateRole(role: string): boolean {
  return getAliasGroup("state_before").includes(role) || getAliasGroup("state_after").includes(role);
}

/** main_circuit 그룹에 속하는 role인지 */
export function isMainCircuitRole(role: string): boolean {
  return getAliasGroup("main_circuit").includes(role);
}
