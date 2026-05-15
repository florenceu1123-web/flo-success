/** 회로이론(circuit_theory) 과목 프롬프트 조각. */
export const CIRCUIT_THEORY_HINT = "KVL/KCL, 노드/메시 해석, 테브난·노턴, RC/RL 과도응답, 페이저 해석에 초점.";

/** 회로이론 문제 생성 시 추가할 도메인 가이드. */
export const CIRCUIT_THEORY_GUIDE = `[회로이론 가이드]
- 회로 폐쇄성: 모든 회로는 전원(V/I source)이 포함된 폐회로로 구성한다.
  · 전원이 없는 회로는 생성 금지 (정상상태에서 전류·전압 0이라 문제 무의미).
  · floating component 금지 — 모든 component pin은 회로의 net 내부에 연결되어야 함.
  · 모든 source의 두 pin이 closed loop의 일부여야 함 (한쪽이 dangling이면 source가 정상 동작 안 함).
- 직류 저항 회로: KVL/KCL, 등가저항·중첩원리.
- 메시·노드 해석: supermesh/supernode 포함 가능.
- 과도응답: 시정수 τ, 초기조건, 강제·자연응답 분리.
- 등가회로(테브난·노턴): hasEquivalentTransformation=true이면 original_circuit + equivalent_circuit 반드시 출력.`;
