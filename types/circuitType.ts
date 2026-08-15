/**
 * CircuitType — netlist generator가 분기 키로 사용하는 회로 archetype.
 *
 * TopicKey(textbook 분류)와 다른 점:
 *  - TopicKey: 학습 단원 (mesh_analysis, nodal_analysis ...)
 *  - CircuitType: 코드 generator가 "이 회로를 어떻게 만들지" 결정하는 모델
 *
 * 예: TopicKey="dc_resistive" 이지만 본문에 "테브난 등가"가 나오면 CircuitType="thevenin".
 *     반대로 TopicKey="mesh_analysis"는 그 자체가 archetype.
 *
 * 현재는 회로이론 위주. electronics/digital_logic은 "unsupported"로 fallback.
 */
export type CircuitType =
  // ── 등가회로 ─────────────────────────────────
  | "thevenin"              // a-b 단자에서 본 Thevenin 등가 (V_th + R_th)
  | "norton"                // a-b 단자에서 본 Norton 등가 (I_n + R_n)
  | "max_power_transfer"    // 최대 전력 전달 (R_L 미정)
  // ── 직류 저항 회로 해석 ──────────────────────
  | "dc_mesh"               // 메시 해석 (1+ mesh, 종속 없음, 스위치 없음)
  | "dc_nodal"              // 노드 해석
  | "dc_supermesh"          // 슈퍼메시 (두 mesh 공유 source)
  | "dc_supernode"          // 슈퍼노드
  | "dc_dependent_source"   // 종속전원 포함 DC 회로
  | "ac_superposition"      // AC 다중 전원 (V_ac + I_ac) + R/L/C 임피던스 + 중첩의 원리 (임용 10번)
  | "ac_parallel_branches"  // AC + 다중 병렬 가지 (R∥L1∥I_S∥L2∥R∥C) — 임용 5번 형식. V_C → I_L2·I_S → I_R1 phasor 단계
  | "bjt_bias"              // DC 바이어스된 BJT 회로 (임용 7번) — V_BE=0.7V 가정, V_E·I_C·V_O 계산, 저항률 ρ
  | "mosfet_bias"           // NMOS DC bias 회로 (단순 단일단) — 포화 영역 I_D=K(V_GS-V_TH)², V_GS·I_D·V_D·V_DS 단계 도출
  | "ac_rl_average_power"   // AC 전원 + 직렬 jX_L + 병렬 R₁∥R₂ 평균전력 3단계 (임용 8번). 유사=인덕터·평균전력 / 변형=커패시터로 교체 + v(t) 도출
  | "opamp_rc_t_oscillator" // 반전 OPAMP + 전방/귀환 T형 RC망 → 전달특성 −1/(sRC)² + 출력↔입력 연결 사인파 발진기 f₀=1/(2πRC) (임용 9번 전자). I₁·I₂ → H(s) → 특성방정식 근
  | "jfet_voltage_bias"     // JFET 전압(분압) 바이어스 (임용 2번) — R₁/R₂ 분압 V_G + R_S로 I_D → R_D. ★제곱법칙 안 씀(V_GS given) — mosfet_bias와 모델이 다르다
  | "mosfet_cascode_mirror" // NMOS cascode current mirror (임용 10번 정확 재현) — M1 reference + M2 mirror + M3 cascode + R(학생 도출) + R_G 분압. 단계 1:V_GS1·R, 단계 2:V_D2, 단계 3:V_GS3·V_S3
  | "counter_dac_comparator" // 복합형: 2-bit JK 카운터 + R-2R DAC + OPAMP 비교기 (임용 8번)
  | "flash_adc_2bit"         // 복합형: 2비트 플래시 ADC (저항사다리+3비교기+인코더→Q1Q0, 임용 6번). 온도계코드 빈칸·Q최소화·논리회로
  | "zener_bjt_regulator"    // 제너+BJT 전압 레귤레이터 (임용 8번) — V_o=V_z+V_BE, I_1·I_z·R_4 도출. "포화영역" 키워드로 특성곡선 오분류 방지
  | "opamp_series_regulator" // OPAMP 직렬형 정전압 안정화 회로 (임용 30번) — 오차증폭기+제너 기준+피드백 분압. V_o=V_z(1+R_a/R_b). zener_bjt_regulator(션트·OPAMP없음)와 구분
  | "active_lowpass_filter"  // 1차 능동 저역통과 필터 대역폭 분석 (임용 31번) — v_i·R·C·OPAMP 버퍼. 대역폭 f_c=1/(2πRC). generic opamp(반전증폭기)와 구분
  | "logic_condition_sop"    // 동작 조건(말)→최소 SOP 간소화 (임용 25번) — 그림 없음·단일 출력 F·3변수. combinational_gate(K-map 주어짐+2출력+회로)와 구분
  | "periodic_signal_dc_rms" // 주기 신호 수식 → 직류값 V_dc·실효값 V_rms (임용 36번) — ★회로 없음·그림 없음★. generic 경로가 없는 회로를 지어내거나 개념 명칭형으로 새던 것을 흡수
  | "opamp_analog_summer"    // 아날로그 시스템 설계 — 2-OPAMP 가산기 (v₀=v₁+v₂). 입력 파형(삼각·구형)+op-amp 2개·R 동일로 회로 설계. generic opamp와 구분
  // ── 과도응답 ─────────────────────────────────
  | "rc_step"               // RC step input 응답
  | "rl_step"               // RL step input 응답
  | "rlc_step"              // RLC step input 응답 (under/over/critically damped) — 단순 V_step+R+L+C 직렬
  | "rlc_resonance"         // RLC 직렬/병렬 공진 + 주파수응답 (I[A] vs f[Hz] 곡선, f_0, Q, Imax) — 임용 9번 형식
  | "rlc_resonance_max_power" // RLC 공진 + Wheatstone 5저항 → r_S + R_L 최대전력. 단계: C·r_S·R_L+P_max — 임용 7번 형식
  | "switched_rlc_step"     // 스위치 t=0 SPDT 전환 (A↔B) + dual-source(V_s/I_s) + RLC core. 초기조건(v_C(0⁻)·i_L(0⁻)) → dv_C(0⁺)/dt → 2차 미방+v_C(t). 단순화 v1 (3-leg)
  | "switched_rlc_5leg"     // 임용 9번 정확 재현 — 6-leg (V_s | R | R+L_a | C∥R | L_b | I_s) + 2 top horizontal R + SPDT SW. v_C(0⁻)·i_L(0⁻) → dv_C(0⁺)/dt → 2차 미방+v_C(t)
  // ── 스위칭 ───────────────────────────────────
  | "switched_rc"           // SW가 t=0에 닫혀 RC 응답 시작
  | "switched_rl"           // SW가 t=0에 닫혀 RL 응답 시작
  | "switched_dc"           // SW open/closed 두 DC 정상상태 비교 (C/L 없음, 과도 없음)
  // ── 전자회로 ─────────────────────────────────
  | "opamp"                 // 이상 OPAMP DC 분석 (inverting/non_inverting/summing 등)
  | "opamp_time_domain"     // 시간영역 OPAMP (integrator / differentiator)
  | "bjt_small_signal"      // BJT CE 소신호 등가 (hybrid-π: r_π + VCCS)
  | "bjt_characteristic_curve" // BJT 출력특성곡선(I_C-V_CE) 영역(포화/활성/차단) 식별 + 스위칭 동작 ON/OFF (개념·도식 해석형)
  | "bjt_two_stage_switched"  // SW + 상보형 2단 BJT(NPN Q1→PNP Q2, Q2 base=Q1 이미터 노드) 바이어스 (임용 10번). V_BE=0.7·I_C=I_E·β로 V_E1·R5·R6·V_EC2 단계 도출
  | "opamp_two_input_diff_design"  // 2입력 2-OPAMP 캐스케이드(가, V_o=k(V₂−V₁)) + 차동증폭기(나) R 설계 (임용 5번). opamp_cascade(전달함수)와 구분
  | "dff_mux_sequential"       // D-FF(유사)/T-FF(변형) 2개 + 2×1 MUX 2개 자율 순환 순차회로 (임용 8번 정보과). ㉠~㉣ MUX 입력·D_A SOP·Q_A 주파수
  | "scr_turn_on"           // SCR(사이리스터) 턴온 회로 — 게이트 펄스로 턴온 후 래칭. 구간 ㉠·㉡ I_A 도출 (래칭이라 두 구간 동일)
  | "inductor_vi_integral"  // 이상 인덕터에 전압 파형 v(t) → i(t)=(1/L)∫v dt 적분. 구간별 전류 식 도출 (저항 없음)
  // ── 디지털논리 ───────────────────────────────
  | "kmap_sop"              // K-map → 최소 SOP → 구현 회로 (AND-OR)
  | "kmap_pos"              // K-map → 최소 POS → 구현 회로 (OR-AND, SOP dual)
  | "flipflop_counter"      // 2비트 D-FF 카운터 (상태 순서 → D 입력 K-map)
  | "jk_sync_counter"       // JK 플립플롭 3개 동기식 카운터 타이밍 분석 — (가)회로 given + (나)타이밍 도표 Q 도시 + 시점 상태값 (임용 6번류). up(유사)/down(변형)
  | "flipflop_mixed_app"    // T-FF + JK-FF 등 혼합 응용회로 — 상태표 + 파형도
  | "tff_state_table_blank" // T-FF 2개 (T_A·T_B) + 입력 C + 상태표 빈칸 ㉠~㉧ + K-map 도출 (임용 7번 정보과)
  | "tff3_autonomous_counter" // T-FF 3개 자율 카운터(외부 입력 없음) — (가)상태도 + (나)상태표 ㉠·㉡ + (다)회로 ㉢. T_B 최소 SOP → 2입력 NAND(변형 NOR) 2개 (임용 11번)
  | "ff_with_waveform"      // 단일 FF (D/T/JK) + 비동기 RESET + 조합부 + 파형도 (임용 8번 형식)
  | "combinational_gate"    // 3-입력 2-출력 조합 회로 (F, G 동시 설계)
  | "mux_implementation"    // (가) 조합논리회로 + (나) 4×1 MUX 등가구현 — POS→SOP→MUX 입력 결정 (임용 5번 형식)
  | "fsm"                   // Mealy 4-state FSM (상태 전이도 + 구현 회로)
  | "sr_ff_mux_sequential"  // SR-FF 2개 + 2×1 MUX 4개 상태순환 순차회로 설계 (임용 10번 정보과). 여기표→S/R SOP, 선택선 분해로 MUX 입력 도출
  | "sequence_detector"     // 시퀀스 검출기 + D-FF + 상태도/표 빈칸 (임용 8번 정보과)
  | "waveform_analysis"     // 디지털 입력 파형 → 출력 파형 분석
  | "thevenin_switched_rc"  // SW + RC + 점선박스(Thevenin 대상) 다단계 (임용 9번 정보과)
  | "opamp_cascade_voltage_divider"  // 2-OPAMP cascade + 5R + V_o/V_i 전달함수 (임용 10번)
  | "opamp_generic"          // 범용 OPAMP — GPT 구조추출 netlist + MNA (가산기+차동 R역산 등, 임용 8번)
  | "inductor_ramp_slope"       // i(t) 램프 파형 → 기울기로 L 도출 (임용 2번 회로이론)
  | "thevenin_dependent_generic"  // 회로이론 테브난+최대전력+종속전원 — GPT 구조추출 + V_oc/I_sc (임용 9번)
  | "sequential_dff_generic" // 디지털 순서논리 D-FF+클록+파형 상태분석 — GPT 구조추출 + 상태 시뮬 (임용 12번)
  | "async_preset_ripple_counter" // 비동기 SET/RESET D-FF 응용회로 — NOR(F) all-zero 검출로 I 패턴 비동기 적재 + 리플 T-FF 다운카운트 (출력 모두 0이면 재적재). ㉠ 적재값·㉡ 카운트 파형 도출
  | "maxwell_concept_fill_blank" // Maxwell 방정식 개념 빈칸 채우기 — ★그림 없음★ (임용 24번 전자기학)
  | "number_repr_fill_blank" // 컴퓨터 데이터 표현·산술 연산(보수·진수·오버플로) 빈칸 채우기 — ★그림 없음★ (임용 27번)
  | "jfet_depletion_fill_blank" // n채널 JFET 공핍층·핀치오프 개념 빈칸 채우기 (임용 28번)
  | "r2r_ladder_dac" // 4비트 R-2R 사다리형 D/A + OPAMP → 출력 전압 (임용 28번)
  | "ff_feedback_z_waveform" // 되먹임 + 2단 D/T 플립플롭 + 비동기 CLR → 출력 Z 파형 도시 (임용 26번)
  | "ff_reachable_states" // D+T 플립플롭 동기식 순서논리 → Q_A·Q_B 파형 도시 (임용 24번)
  | "bjt_early_effect_fill_blank" // npn BJT Early 효과(베이스폭 변조·r_o·Punch Through) 빈칸 채우기 + (가)단면도·(나)특성곡선 (임용 27번 전자회로)
  | "max_power_two_source_ratio" // 전원 크기만 다른 두 회로의 최대전력 부하 + η₁·η₂ 비 (임용 17번)
  | "jk_two_phase_clock" // JK₁ + 2상 클럭발생기 + EX-OR 2개 → Y₁·Y₂ 파형 도시 (임용 30번)
  | "rlc_antiresonance_ladder" // 병렬 LC 반공진 → 우측 개방 → 단일 직렬 RLC 정상상태 전류 (임용 16번)
  | "ac_dc_source_superposition_vc" // 교류 전압원 + 직류 전류원 RLC → 정상상태 v_C(t) 중첩 3단계 (임용 15번)
  | "two_source_rl_superposition" // 전압원 2개(계단 펄스+정현파) RL/RC — 테브난+중첩 5단계 (임용 4번)
  | "switched_rl_dual_short" // 전류원 RL — t=0에 스위치 2개가 각각 저항·인덕터를 **단락**시키는 과도응답 (임용 17번)
  | "dff_preset_clear_regions" // D-FF(D=Q̄ 토글) + 비동기 PR·CLR을 A·B NAND로 구동 — 구간 ㉠~㉢의 출력 Q 파형 도시 (임용 27번)
  | "rlc_resonance_bandwidth" // 직렬 RLC 공진 + 대역폭 (임용 11번) — ω₀·C 주어지고 L 도출·V_ab 페이저·대역폭 β=R/L·R변경 β₁/β₂
  | "opamp_two_stage" // 2단 OPAMP(1단 비반전 ×A1 → 2단 반전 ×−A2) — V_P 주어지고 V_i·V_o 도출 (임용 2번 형식)
  | "opamp_three_stage_sum" // 3-OPAMP: 반전증폭(V_x)+버퍼+반전가산 — V_x·R_f 도출 (임용 2번 전자)
  | "opamp_finite_gain_block" // 연산증폭기 유한 개방루프 이득 A(s)=A₀ω₀/(s+ω₀) + 블록도 (임용 11번) — 중첩 α·β·A_s·V⁻[mV] 도출
  | "opamp_finite_gain_offset" // 유한 개방루프 이득 OPAMP + 출력단 직렬 오프셋 전압원 V_B (임용 9번 전자회로) — β·V_D·V_out=(A₀V_in−V_B)/(1+A₀β)
  | "opamp_loop_gain_stability" // OPAMP 루프이득 L(s)=V_r/V_t + 특성방정식 0=1−L(s) 근의 좌반평면 조건 (임용 12번 전자회로) — R_S·R 부등식
  | "opamp_positive_feedback" // 정귀환(positive feedback) OPAMP + 유한 개방루프 이득 + SW step (임용 6번) — β·B·D·K(=B/D) 도출
  | "function_generator" // 비정현파 발진기(함수발생기): 슈미트 비교기(구형파) + 적분기(삼각파) 피드백 루프 (임용 29번) — 진폭·주파수 도출
  | "ac_bridge_max_power" // AC 휘트스톤 브리지 + 테브난 등가 + 최대평균전력 (임용 7번) — V_A·V_B·Z_TH·R_L 도출
  | "ac_thevenin_ladder" // 단일 AC원 L-C-R 사다리 + 테브난 등가 + 복소 켤레 최대전력 (임용 7번 회로이론) — Z_TH·V_TH·Z_L=R+jX·P_max
  | "ac_thevenin_dependent" // 독립 전류원 + ★종속전원★ 포함 페이저 회로 → 테브난 등가(단락전류법) + 복소 켤레 최대전력 (임용 6번 회로이론)
  | "ac_thevenin_design_ab" // 교류 테브난 등가 → 최대평균전력이 되도록 소자 값 a·b 설계 (임용 7번 회로이론)
  | "ac_delta_wye_bridge" // 교류 브리지 + ★Δ-Y(델타-와이) 변환★ → 단자 A-B 등가 임피던스 Z → 전류 크기 a (임용 2번 회로이론)
  | "dff_nand_mux_pair" // D-FF 2개 + 3-NAND 입력망(D=s+x·y) + 파형 → Q₁Q₀ 추적 + 점선부 최소 AND/OR (임용 12번 디지털)
  | "ac_two_source_mesh_power" // 2전원 RLC 메시 → 페이저 전류 I₁·I₂ + 평균 전력 (임용 5번 회로이론)
  | "ac_superposition_null_source" // 2전원(V+I) 페이저 RLC + 중첩 → V_L=0이 되는 전류원 I_s 역산 (임용 3번 회로이론)
  | "thevenin_dep_graph_max_power" // 종속전원 저항회로 + V-I 그래프 → 미지 R → I_SC → 최대전력 (임용 9번 회로이론)
  | "opamp_avg_superposition_r" // (+)단자 3입력 평균 + 2단 중첩 → 미지 저항 (임용 8번 전자회로)
  | "oscilloscope_phase_l" // ★오실로스코프 파형★ 판독 → V_m·f·위상차 α → 미지 인덕턴스 L 도출 (임용 11번 회로이론)
  | "zener_shunt_regulator" // 제너 n개 직렬 션트 정전압 → 부하 저항 최솟값·최댓값 (임용 2번 전자회로)
  | "switched_rlc_source_free" // t=0 스위치 개방 → 무전원 직렬 RLC 자연응답 (임용 5번 회로이론)
  | "switched_cap_short_rl" // t=0 스위치가 커패시터를 단락 → 1차 RL 계단응답 i_L(t) (임용 7번 회로이론)
  | "rlc_state_equation" // 직류 V·I원 RLC → 상태 방정식 행렬 A·B (임용 6번 회로이론)
  | "switched_rlc_dual_switch" // SW1 닫힘 + SW2(b→c) 2전압원 RLC → 초기조건 + v_c 2차 미분방정식 + v_c(t) (2022 전기 B-5)
  | "opamp_two_stage_rx" // 2단 OPAMP 응용회로 — 비반전측 분압 저항 R_X 설계 + 출력 V_o (임용 2번 전자회로)
  | "jk_mealy_state_design" // JK-FF 2개 Mealy 상태도 → 상태표 빈칸 → y·J/K 최소식 (임용 9번 디지털)
  | "bjt_thevenin_bias" // BJT 바이어스 + 베이스망 테브난 등가 → I_B·V_B → R_C (임용 10번 전자회로)
  | "bjt_switch_logic_gate" // BJT 이상적 스위치 → 진리표 + 동일 동작 논리게이트 (임용 2번)
  | "comparator_diode_or" // 비교기 2개 + 다이오드 결합(OR/AND) + 풀다운/풀업 → 구간별 V_out·다이오드 ON/OFF (임용 3번 전자회로)
  | "opamp_summer_tfeedback" // 반전 가산기(미지 R₁) + T형 궤환 반전증폭기 + 부하 전류 (임용 7번 전자회로)
  | "ac_thevenin_two_box" // 점선 박스 2개(전압원망 a-b + 전류원망 c-d) 직렬 → 테브난 합성 + 순저항 R_L 최대평균전력 (임용 10번 회로이론)
  | "diode_clamper" // 다이오드 클램퍼(직렬 C + 다이오드·바이어스 전지 + 부하 R) → 출력 파형 상·하한 a·b (임용 2번 전자회로)
  | "dc_two_source_ladder" // 전압원+전류원 DC 사다리 (상단 R 2개 + 중간 마디 아래 R + 병렬 뱅크) → I₁·I₂ (임용 3번 회로이론)
  | "tff_state_design_input" // 외부 입력 X를 갖는 2-bit 상태기계 → T 플립플롭 2개 + 게이트 설계 (임용 12번 디지털논리)
  | "dc_thevenin_2src" // 2전압원 병렬가지 → 테브난 등가 (임용 3번 회로이론) — R_T=R1∥R2·V_T=Millman
  | "demux_waveform" // 1→4 디멀티플렉서 + F₀~F₃ 출력 파형 도시 (임용 8번)
  | "number_representation" // n비트 2진수 음수 표현 방식 판별 + (변형) 보수 뺄셈 (임용 4번)
  | "mod_n_counter_reset" // T·D 혼합 동기식 mod-N 카운터 + 미사용 상태 + 리셋 게이트 (임용 9번)
  | "jk_excitation_sop_pos" // JK-FF 2개 상태 여기표 + 조합논리 J_A (최소 SOP → 분배법칙 → POS) (2025 전기 A-8)
  | "ac_superposition_source_design" // 2전원 페이저 RLC + 중첩 → 목표 V_c 되도록 전원 크기 V_s·I_s 역산 (임용 5번 회로이론)
  | "dc_wheatstone_balance" // DC 휘트스톤 브리지 평형 (임용 3번 회로이론) — 평형 조건 미지 저항 R_x + 개방 출력 전압 V_o. 변형=미지 암 위치 교환
  | "ac_power_factor" // AC 역률보정 + 전력 (임용 9번 회로이론) — 직렬 R+L + 부하 R∥C, 역률1 X_C·P_avg·Q·P_s
  | "ac_admittance_resonance" // 어드미턴스 공진 (임용 7번 회로이론) — 전압원→병렬[C∥(R+L)], Y_eq=a+jb·ω₀(b=0)·I_M. 변형=쌍대(전류원→직렬[L+(R∥C)], Z_eq·V_M)
  | "ac_vccs_phasor"          // 종속전류원(g·V_c) 2단 구동 페이저 회로 (임용 3번 회로이론) — 좌측망 V_c(분압) → 종속전류원 → 우측망 I_R(전류분배) → i_R(t). 변형=소자 종류 교환(C↔L)
  | "switched_rc_dc_transient" // t=0 스위치 개방 RC (임용 2번) — t<0 DC정상상태 v_c(0⁻) + t≥0 방전 v_o(t)
  | "dff_state_design" // D-FF 2개 상태도 순차회로 설계 (임용 9번 정보과) — 상태도→상태표 D입력→게이트 구현
  | "supermesh_switched_dependent" // 스위치 2-state + 종속전류원(0.2V) + supermesh DC (임용 8번 회로이론) — (가)SW개방 V₁·I₁ / (나)SW단락 supermesh V₂·I₂
  // ── Universal (rule-based) ───────────────────
  | "universal_dc"          // 임의 DC 회로(V/I/R) + 다단계 query 패턴 — archetype-free path
  | "universal_ac"          // 임의 AC 회로(R/L/C/V/I) + phasor/공진/최대전력 query — archetype-free
  | "universal_ac_pwl"      // 임의 AC + 다이오드(piecewise-linear) + 스위치(event) — 시간영역 sample (임용 6번 형식). Phase 2~ (현재는 분류만, 솔버 미구현)
  | "universal_digital"     // 임의 N-변수 M-함수 K-map + gate combination — digital_logic archetype-free
  // ── fallback ─────────────────────────────────
  | "unsupported";          // electronics / digital_logic / 분류 실패

/**
 * Generator가 사용할 회로 구성 파라미터.
 * 모든 필드 옵셔널 — circuit_type별로 의미 있는 필드만 채움.
 */
export type CircuitTypeParams = {
  // ── 소자 카운트 (Generator floor) ────────────
  resistorCount?: number;
  vSourceCount?: number;
  iSourceCount?: number;
  capacitorCount?: number;
  inductorCount?: number;
  switchCount?: number;
  dependentSourceCount?: number;
  // ── 토폴로지 ─────────────────────────────────
  meshCount?: number;
  nodeCount?: number;
  branchCount?: number;
  // ── 의미 ─────────────────────────────────────
  /** a-b 같은 외부 단자가 있는가 (Thevenin/Norton/max_power) */
  hasTerminalPort?: boolean;
  /** R_L 같은 학생-채움 부하 placeholder가 있는가 */
  hasLoadPlaceholder?: boolean;
  /** SW 상태 전후 두 그림이 필요한가 */
  hasStateTransition?: boolean;
  /** 종속전원 (VCVS/VCCS/CCVS/CCCS) 존재 */
  hasDependentSource?: boolean;
  /** waveform figure 동반 필요 */
  hasWaveform?: boolean;
  // ── 디지털 K-map / 조합회로 전용 ──────────────
  /** 다중 출력 K-map / 회로의 회로 내 학생-채움 빈칸 게이트 수 (예: ⓐ, ⓑ → 2) */
  kmapBlankCount?: number;
  // ── 플립플롭 응용회로 전용 ───────────────────
  /** 사용 FF 종류 (예: ["T","JK"]). flipflop_mixed_app / ff_with_waveform에서 의미. */
  ffTypes?: Array<"D" | "T" | "JK">;
  /** 상태표(현재상태→입력→다음상태) figure 필요 */
  hasStateTable?: boolean;
  /** 비동기 RESET 입력 존재 (ff_with_waveform 등) */
  hasAsyncReset?: boolean;
  // ── RLC 공진 (rlc_resonance) ─────────────────
  /** "series" | "parallel" — RLC 토폴로지. exam_similar는 원본 유지, exam_variant는 임의 선택. */
  rlcTopology?: "series" | "parallel";
  // ── BJT 다중 트랜지스터 (전류미러·차동증폭기 등) ──
  /** 전류미러/차동증폭기 등 multi-BJT 토폴로지 플래그. bjt_bias 파이프라인에서 분기. */
  multiBjtMirror?: boolean;
  /** 인벤토리에서 추출한 BJT(NPN/PNP/트랜지스터) 개수. */
  bjtCount?: number;
  // ── universal_ac_pwl (다이오드 + SW + AC) ────
  /** 다이오드 존재 — universal_ac_pwl path 트리거. */
  hasDiode?: boolean;
  /** 인벤토리에서 추출한 다이오드(D) 개수. */
  diodeCount?: number;
  /** SW 존재 (counts.SW + features.hasSwitch + 키워드 기반 inferred). */
  hasSwitch?: boolean;
  /** AC 전원 존재 (hasACInventory 또는 text 키워드 기반). */
  hasACSource?: boolean;
  // ── sequence_detector (시퀀스 검출기 + D-FF + 상태도) ──────
  /** 검출 시퀀스 패턴 — '110', '101', '011', '1010' 등. 미지정 시 generator가 변형. */
  sequencePattern?: string;
  // ── bjt_characteristic_curve device hint (임용 6번 등) ───────
  /**
   * 원본이 MOSFET 특성곡선이면 "mosfet" — generator가 BJT-only SIMILAR pool 대신
   * MOSFET variant pool에서 pick하도록 강제. 미지정 시 mode 기반 default.
   */
  device?: "bjt" | "mosfet";
  // ── kmap_sop truth-table-input variant (임용 5번 정보과) ──────
  /**
   * 임용 5번 형식 — (가) 진리표 + (나) 간략화된 회로(㉠ 빈칸).
   * true면 kmap_sop pipeline이:
   *   - figure 순서·라벨을 (가) truth_table → (나) implementation_circuit으로 정렬
   *   - 변수명을 W·X·Y·Z 로 강제 (4-변수)
   *   - don't care 행 일부 포함
   *   - 회로에 ㉠ 빈칸 게이트 마커 + 점선 그룹 표시
   *   - 풀이 단계: [단계 1] K-map 도출 → [단계 2] ㉠ 게이트 식별 → [단계 3] 점선 부분 게이트 식별
   */
  truthTableBlank?: boolean;
  // ── universal_digital 공유항·입력결정 variant (임용 7번 정보과 형식) ──────
  /**
   * 다중 출력 공유항(multi-output shared term) + 입력변수 빈칸 형식.
   * 원본이 "함수가 Σm으로 주어지고 + 빈 K-map + 회로 입력 ㉠㉡㉢ 빈칸" 형식이면 true.
   * true면 universal_digital pipeline이 출력 합성(정방향) 대신:
   *   - 공유 prime implicant를 갖는 M개 함수 minterm 셋 생성
   *   - figure: (나) 빈 K-map + (다) 공유항 회로 (입력 ㉠㉡㉢ 빈칸)
   *   - 풀이 방향: [단계 1] K-map 도출 → [단계 2] 중복(공유) 항 → [단계 3] 입력변수 결정
   */
  sharedTermInputBlank?: boolean;
  // ── waveform_analysis 타이밍→논리 도출 (임용 8번 형식) ──────
  /**
   * 타이밍 도표만 주어지고 학생이 회로를 도출하는 방향 (임용 5번의 역방향).
   * 원본이 "입력 A·B·C + 출력 F 타이밍 도표만 제시 → ① F의 카르노맵 작성 ② 최소화+논리회로 도시
   * ③ 2입력 NAND 게이트로 도시" 형식이면 true.
   * true면 waveform_analysis pipeline이:
   *   - given figure: 타이밍 도표(waveform) **하나만** (회로·kmap은 학생 도출물 → solutionFigures)
   *   - 풀이 방향: [단계1] 타이밍→카르노맵 [단계2] 최소화 F + 회로 도시 [단계3] NAND 변환
   */
  timingGivenDeriveCircuit?: boolean;
  // ── universal_ac DC+AC 중첩 모드 (임용 2022 B-6 형식) ──────
  /**
   * 직류 전원 + 교류 전원이 스위치(단자 선택)로 연결된 정상상태 중첩 문제.
   * true면 universal_ac pipeline이 phasor 단일 해석 대신:
   *   - DC 패스(교류 전원 제거, L=단락) → I_DC
   *   - AC 패스(직류 전원 제거, 페이저 해석) → i_ac(t) + 인덕터 전류 분배
   *   - 중첩: i(t) = I_DC + i_ac(t)
   *   - figure: 단일 회로 (DC·AC 전원 + SW + R + 병렬 L) — waveform·state pair 면제
   */
  acDcSuperposition?: boolean;
  /**
   * 2개의 교류 전원(전압원 + 전류원) + RLC + 부하 R_L 최대 평균 전력 (임용 10번 형식).
   * true면 universal_ac pipeline이 buildFromTopology 대신 고정 토폴로지 archetype generator
   * (generateAcTheveninMaxPower)를 사용 — generic topology 추출이 부하 단자 연결을 잃는 문제 회피.
   *   - [단계 1] Z_th  [단계 2] V_th(중첩)  [단계 3] R_L=|Z_th|, P_max
   */
  theveninMaxPower?: boolean;
  /**
   * AC+DC 중첩 RC 회로 (임용 12번 회로이론 형식) — 스위치 없는 고정 토폴로지.
   * 교류 전원 v(t)=A√2cos(ωt) + 직류 전원이 RC 회로에 포함, 중첩의 원리로 i_ab·I_DC·I_R4 도출.
   * true면 universal_ac pipeline이 generic buildFromTopology 대신 generateAcDcSuperpositionRc 사용
   * (generic 추출은 두 전원 병합·DC 소실). 기존 acDcSuperposition(스위치+RL)과 다른 구조.
   */
  acDcSuperpositionRc?: boolean;
};

/**
 * 분류 결과. confidence가 low면 fallback(unsupported) 또는 user 확인 권장.
 */
export type CircuitTypeClassification = {
  type: CircuitType;
  params: CircuitTypeParams;
  confidence: "high" | "medium" | "low";
  /** 분류 근거 한 줄 (로그·디버깅용) */
  reasoning: string;
};
