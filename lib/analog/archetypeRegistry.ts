// src/lib/analog/archetypeRegistry.ts
//
// Analog/DC circuit archetype registry.
// 새 archetype 추가 시 표준 6단계 (CLAUDE.md "Circuit Generation Architecture Principle"):
//   1) CLAUDE.md 원칙 문서화 → 2) 여기 enum + structure 타입 추가 →
//   3) detector → 4) fixed-slot renderer → 5) dispatch → 6) smoke test.

export type AnalogArchetype =
  // OPAMP family
  | "VOLTAGE_FOLLOWER"
  | "NONINVERTING_AMP"
  | "INVERTING_AMP"
  | "WIEN_BRIDGE_OSCILLATOR"
  | "RC_PHASE_SHIFT_OSCILLATOR"
  | "ACTIVE_FILTER"
  // Circuit theory (DC mesh + nodal)
  | "IMYONG_10_DC_NODAL";

// ── Structure JSON types ────────────────────────────────────────────
// LLM은 layout/positions를 출력하지 않는다.
// renderer가 archetype별 고정 slot에 배치한다.

/**
 * 임용 10번 형식 — 2-source DC nodal 회로.
 *
 *   layout (deterministic):
 *     VS_PLUS ┬─ R_left_top ─┬ V1 ┬─ R_v1_v2 ─┬ V2
 *             └─ R_left_mid ─┘    └─ I_src ───┘
 *                      │                    │
 *                     R_var                R_right
 *                      │                    │
 *                     GND ──────────────────┘
 *
 *   slots (lib/renderers/imyong10DcNodalCircuit.ts):
 *     slot_left_source · slot_left_top_R · slot_left_mid_R
 *     slot_center_Rvar · slot_v1_v2_top_R · slot_v1_v2_mid_I · slot_right_R
 */
export type Imyong10DcNodalStructure = {
  archetype: "IMYONG_10_DC_NODAL";
  values: {
    /** 좌측 V 소스 (V) — VS_PLUS ↔ GND vertical leg */
    V_s: number;
    /** VS_PLUS ↔ V1 위쪽 horizontal R (Ω) */
    R_left_top: number;
    /** VS_PLUS ↔ V1 아래쪽 horizontal R (Ω) — left_top과 parallel */
    R_left_mid: number;
    /** V1 ↔ V2 위쪽 horizontal R (Ω) */
    R_v1_v2: number;
    /** V1 ↔ V2 아래쪽 horizontal I 소스 (A) */
    I_src: number;
    /** V2 ↔ GND vertical R (Ω) */
    R_right: number;
    // R_var (V1 ↔ GND vertical, 가변)는 학생 도출 대상 → value 없음.
    //   renderer가 "R" 변수 라벨로만 표기.
  };
  query: {
    /** 학생이 구해야 하는 node voltage */
    targetNode: "V_1" | "V_2";
    /** 목표 voltage 값 (V) — 예: V_2 = 3.8V */
    targetValue: number;
  };
};

/** 전체 archetype별 structure union — generator/renderer dispatch에 사용. */
export type ArchetypeStructure =
  | Imyong10DcNodalStructure;
// 향후 다른 archetype 구조 추가 시 union 확장.
