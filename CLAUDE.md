@AGENTS.md

# Project: flo-success

## Overview
전자 임용 기출 문제를 사진으로 업로드하면 AI가 해석하여 **기출유사유형**과 **기출변형유형** 문제를 자동 생성하는 웹앱.

## Tech Stack
- Language: TypeScript 5
- Framework: Next.js 16.2.6 (App Router, Turbopack) + React 19.2.4
- Styling: Tailwind CSS v4 (`@tailwindcss/postcss`)
- AI: OpenAI GPT-4o (Vision + 텍스트 생성)
- Database: 미정 (현재 단계 불필요)

## Project Structure
```
flo-success/
├── app/
│   ├── api/{analyze,generate}/route.ts   # API 라우트 (얇게, 실제 로직은 lib/)
│   ├── page.tsx · layout.tsx · globals.css
├── components/                            # UI 컴포넌트
├── lib/                                   # 도메인 로직 (전체 파이프라인)
├── types/                                 # 공유 타입
└── public/
```

## Code Style Rules
- [ ] 커밋 메시지는 한글로 작성
- [ ] 모든 함수에 JSDoc 주석 추가
- [ ] `console.log` 대신 `lib/logger.ts` 사용
- [ ] 테스트 코드 필수 작성

## Commands
- `npm run dev` — 개발 서버 (포트 충돌 시 자동 다음 포트)
- `npm run build` / `npm run lint` / `npm run test` (러너 도입 후)

---

# Architecture

## 1. Subjects · Topics · Modes
- **SubjectKey** (canonical, 영어): `electronics` / `circuit_theory` / `digital_logic`
- **SubjectLabel** (UI 표시, 한국어): `전자회로` / `회로이론` / `디지털논리회로` (`SUBJECT_LABEL[key]`)
- **TopicKey = "family"** (validator의 "family mismatch"에서 family와 동의):
  - electronics: `opamp` · `bjt_bias` · `bjt_amplifier` · `mosfet_bias` · `mosfet_amplifier` · `diode` · `mixed_signal`
  - circuit_theory: `dc_resistive` · `mesh_analysis` · `nodal_analysis` · `transient_rc` · `transient_rl` · `rlc_response` · `supermesh` · `supernode` · `dependent_source` · `switching_circuit`
  - digital_logic: `kmap_sop` · `kmap_pos` · `combinational_gate` · `flipflop_counter` · `fsm` · `waveform_analysis`
- **GenerationMode** (canonical):
  - `exam_similar` (기출유사유형) — 회로·문항 모두 동일, 소자 수치만 변경
  - `exam_variant` (기출변형유형) — 구조·원리 동일, 수치 + 소자 종류 1~2개 변형 가능
  - ⚠️ flo 프로젝트의 `new_problem`/`exam_mutation`과 다름. GPT system prompt도 flo-success 명칭으로 통일.

## 2. SemanticStructure (핵심 코어)
4개 boolean 플래그로 문제 의미 구조를 분류. SubjectKey·TopicKey와 직교(orthogonal):
- `hasStateTransition` — FSM·플립플롭·카운터·순차논리
- `hasEquivalentTransformation` — 테브난·노턴·소스변환
- `hasWaveformEvolution` — RC/RL 과도응답·스위칭·타이밍
- `requiresMultiFigure` — 회로도 외 추가 그림 필요 (true면 단일 figure 금지)

## 3. Pipeline (8 stage)
```
IMAGE
  ↓ Vision Analysis        (lib/analysis/analyzeImage.ts)
  ↓ CompactAnalysis        (lib/analysis/compactAnalysis.ts)  — semantic·topology 압축
  ↓ RuleSet Resolution     (lib/rules/{subject}.ts)            — 과목별 출제 규칙 결정
  ↓ GenerationMode Resolution (lib/generation/resolvePolicy.ts) — mode → policy 객체
  ↓ Generator              (lib/generation/{subject}/ or lib/mutation/{subject}/)
  ↓ Validator              (lib/validators/validateProblem.ts + validateFigures.ts)
  ↓ Renderer               (lib/renderers/{subject}/ — netlist → SVG)
```

`lib/prompts/{system,digital,electronics,circuitTheory}.ts`는 위 단계가 GPT 호출 시 사용.

## 4. lib/ Layout
```
lib/
  analysis/{analyzeImage.ts, compactAnalysis.ts}
  rules/{digital.ts, electronics.ts, circuitTheory.ts}
  generation/
    resolvePolicy.ts
    digital/  electronics/  circuitTheory/      # exam_variant 흐름
  mutation/
    digital/  electronics/  circuitTheory/      # exam_similar 흐름
  validators/{validateProblem.ts, validateFigures.ts}
  renderers/
    digital/  electronics/  circuitTheory/      # netlist → SVG
  prompts/{system.ts, digital.ts, electronics.ts, circuitTheory.ts}
  logger.ts · openai.ts
```

## 5. Figure Variant Expansion
SemanticStructure 플래그가 figure 셋을 결정:
- 상태 변화 문제 (`hasStateTransition` + switch) → `state_before` (t<0), `state_after` (t>0)
- 등가회로 문제 (`hasEquivalentTransformation`) → `original_circuit`, `equivalent_circuit`
- 디지털 (`digital_logic`) → `kmap`, `implementation_circuit`, `waveform`

## 6. Figure 출력 포맷 — 통합 FigureVariant + diagramType 기반 dispatch
- GPT는 절대 SVG/circuitikz 직접 출력 금지 — **JSON diagram만**.
- 모든 figure는 단일 shape 사용:
  ```ts
  type FigureVariant = {
    id: string;
    label: string;
    role: string;            // 의미 역할 (original_circuit, state_before, ...)
    diagramType:             // 시각 표현 — registry dispatch 키
      | "netlist" | "schematic" | "waveform"
      | "kmap" | "truth_table" | "concept_diagram";
    diagram: unknown;        // diagramType별 권장 shape (types/index.ts 참고)
  };
  ```
- 회로 figure 예 (diagramType=netlist):
  ```json
  {
    "id": "fig1",
    "label": "원본 회로",
    "role": "original_circuit",
    "diagramType": "netlist",
    "diagram": {
      "nodes": ["V1", "R1", "R2", "GND"],
      "components": [
        { "id": "V1", "type": "VS", "value": "10V" },
        { "id": "R1", "type": "R",  "value": "4Ω"  },
        { "id": "R2", "type": "R",  "value": "6Ω"  }
      ],
      "edges": [
        { "from": "V1+",  "to": "R1.a" },
        { "from": "R1.b", "to": "R2.a" },
        { "from": "R2.b", "to": "GND"  }
      ]
    }
  }
  ```

## 7. Renderer Registry (lib/renderers)
**type 기반 dispatch** (subject 폴더 사용 안 함):
```ts
const FIGURE_RENDERERS: Record<DiagramType, FigureRenderer> = {
  netlist:         renderNetlistCircuit,
  schematic:       renderSchematicCircuit,
  waveform:        renderWaveform,
  kmap:            renderKmap,
  truth_table:     renderTruthTable,
  concept_diagram: renderConceptDiagram,
};

function renderFigure(fig: FigureVariant): ReactNode {
  const renderer = FIGURE_RENDERERS[fig.diagramType];
  if (!renderer) return <pre>unsupported figure: {fig.diagramType}</pre>;
  return renderer(fig);
}
```
- 각 renderer는 `(figure) => ReactNode` (React node 반환)
- 1차는 모두 placeholder SVG. 향후 type별 실구현으로 교체.

## 8. Validator (lib/validators/validateProblem.ts)
다음 8개 규칙 검사 (실패 = 재생성 트리거):
1. subject mismatch (생성 결과의 subject ≠ 요청 subject)
2. **family mismatch** (생성 결과의 TopicKey ≠ 원본 TopicKey)
3. `figureVariants` 누락 (`requiresMultiFigure=true`인데 figure 셋 미충족)
4. topology 없음 (회로 문제인데 netlist/schematic 부재)
5. switch 문제인데 SW component 없음 (state_before/after figure 기준)
6. waveform 문제인데 waveform figure 없음
7. kmap 문제인데 implementation_circuit 없음
8. **figure 참조 vs 부재** — 본문/조건/질문에 "아래 그림"·"그림과 같이" 등 표현이 있는데 `figureVariants`가 비어있거나 렌더 가능한 diagramType이 없으면 실패

## 9. GPT System Prompt (요지)
```
너는 전자 분야 임용시험 문제 생성 엔진이다.
회로를 복사하지 말고 family와 semantic structure를 유지하라.

exam_variant: 같은 family·semantic 유지, topology 변경 가능
exam_similar: topology 유지, 값만 변경

반드시 figureVariants 기반으로 출력한다.
requiresMultiFigure=true이면 절대 단일 회로만 생성하지 마라.
JSON만 출력한다.
```

---

# 프로젝트 전반 절대 규칙
0. **구조·원리 유사성** — 생성하는 모든 문제는 원본의 구조와 원리를 반드시 유지한다. 같은 학습 목표를 시험. 모드는 변형 강도만 조절.
0. **규칙 기반 생성 (예시 기반 금지)** — 박혀 있는 "문제 예시"를 베끼지 말 것. 출제 규칙(KVL, 등가변환, 노드해석 등)을 원본에 적용해서 새로 만든다. 양식·포맷의 "적용 예시"는 참고 가능.

# Layout 절대 규칙 (모든 회로 공통, node 연결 규칙)

generator와 renderer는 다음 규칙을 모든 회로 figure에 무조건 준수한다.

## 규칙 #1 — wire와 소자 비겹침
- wire는 다른 component의 box 영역을 가로지를 수 없다.
- wire 라우팅 시 모든 component bbox를 obstacle로 인식하고 회피.

## 규칙 #2 — 소자 간 비겹침
- 두 component box는 서로 겹칠 수 없다.
- 같은 노드에 연결되는 두 component는 충분한 거리를 두고 배치 (positions hint 또는 layout 알고리즘으로 분리).

## 규칙 #3 — xlane·ylane 간격 분리
- 인접 wire의 vertical column(xlane) 또는 horizontal row(ylane)는 최소 간격(LANE step) 이상 분리.
- 같은 lane에 두 wire가 겹쳐 그려지면 식별 불가 → 별도 lane으로 stagger.

## 규칙 #4 — 같은 신호 분기 dot
- 한 신호(node)에 여러 component가 연결되면 source 분기점에 dot 표시.
- degree ≥ 3 노드는 명시적 junction dot.

## 규칙 #5 — 외부 단자/ground는 degree 면제
- label_only annotation 노드(외부 입력/출력 단자)와 ground 노드는 degree ≥ 2 검사 면제.
- 외부에서 들어오는 신호는 dangling이 아님.

## 규칙 #6 — 라벨 간 최소 간격
- component 라벨(R_1, R_2, V_s, 1kΩ 등)은 다른 component·OPAMP pin 표시(+/−)·node label과 최소 `LABEL_MIN_GAP`(~14px) 이상 떨어진다.
- OPAMP body의 핀 표시("+", "−", "Q", "D" 등)는 box 안쪽(body interior)에 표기. body 가장자리에 두지 마라 — 인접 wire/component 라벨과 시각적 합쳐짐("+R_2" 같은 잘못된 결합).
- component 라벨은 항상 그 component box의 한쪽 side(위·아래·좌·우)에만 표기, 다른 component box 영역으로 침범 금지.
- renderer는 라벨을 그리기 전 누적된 obstacle bbox(component box + 이전 라벨)와 충돌 검사해서 충돌 시 작은 offset(±16px)으로 자동 회피.

## 규칙 #7 — node 사용 최소화
- 회로 생성 시 동일한 전기적 node에 3개 이상의 component가 만나면, 그 node를 **wire의 분기점**이 아니라 **chain의 한 끝점**으로 배치한다.
- 같은 node를 공유하는 component들은 가능한 한 직렬 chain으로 연결해서 별도 wire 분기·stub 수를 최소화.
- 적용 예 (positive_feedback): OPAMP V+ pin · R_1(V+→GND) · R_2(V_out→V+)가 같은 V+ 노드 → R_2 좌측 끝과 R_1 top이 같은 column에서 chain 연결, V+ pin에서 그 chain의 junction으로 한 wire만 인입.
- 결과: junction dot 1곳, wire 분기 1회, 시각적 정렬 명확. 분기 wire가 component box를 통과할 위험도 자동 감소.

## 규칙 #8 — OPAMP open-loop 비교기 케이스 인정
- OPAMP는 두 가지 동작 모드를 갖는다:
  1. **closed-loop 증폭기** (반전·비반전·가산·차동·정귀환): output → input(V− 또는 V+) feedback resistor 필수.
  2. **open-loop 비교기** (comparator): feedback resistor 없음. V+·V−에 입력 신호, V_o는 V_CC 또는 GND 디지털 출력.
- validator는 OPAMP를 분류해서:
  - V_o가 외부 단자(label_only annotation)에 직접 연결되고 다른 R/C와 closed loop를 안 형성하면 → 비교기로 인정 → feedback branch 검사 면제.
  - 그 외에는 closed-loop으로 가정 → feedback resistor 필수.

## 규칙 #9 — RuleSet subject 일관성
- `resolveRules(subject, ...)`는 항상 `ruleSet.subject = subject`를 보존한다.
- 다른 subject base 규칙을 차용하더라도(예: mixed_signal이 electronics base 사용) subject 라벨은 원본 subject 유지.
- validator의 subject_mismatch 검사는 `ruleSet.subject === expected.subject`만 확인하므로 base 차용은 그 검사를 통과한다.

## 규칙 #11 — FF levelize는 FF끼리 의존성으로 column 분리
- `logicNetworkRenderer`의 `levelizeLogicGates`는 FF(flip-flop)를 단순히 마지막 column에 모두 stack하지 않고, **FF의 입력 의존성**을 따라 column 분리한다.
- 한 FF의 `inputs` 또는 `clockSignal`이 다른 FF의 `output`에 의존하면 의존되는 FF가 먼저 column에 배치 → 직렬 chain layout.
- 자기 자신의 output에 의존(feedback)하는 FF는 cycle-breaker로 인정 (ffWithWaveform의 Q_n → D 패턴 유지).
- 적용 예 (counter_dac_comparator): JK_B.inputs=[Q_A, Q_A]이고 Q_A=JK_A.output → JK_B는 JK_A 다음 column에. 결과: JK_A → JK_B 수평 직렬.
- 일반화: 모든 multi-FF 회로(카운터·shift register·FSM 등)에 자동 적용 — 직렬 의존이면 직렬 layout, 병렬 독립이면 stack.

## 규칙 #10 — 복합형은 단일 mixed_circuit figure
- mixed_signal subject의 회로(예: 임용 8번 2-bit 카운터 + DAC + 비교기)는 logic part(JK-FF·게이트)와 analog part(R·OPAMP)를 **하나의 mixed_circuit figure로 통합** 표기한다.
- 두 part를 별도 figure로 분리하지 마라 — 원본 임용 문제는 단일 회로도.
- `MixedCircuitDiagram = { logic: LogicNetworkDiagram, analog: CircuitNetlist, bridgeNodes: Record<logicSignal, analogNode> }`.
- `mixedCircuitRenderer`가 좌측(logic) + 우측(analog) + bridge wire를 단일 SVG로 통합 렌더.
- bridge wire는 logic의 output(예: Q_A·Q_B)이 analog의 외부 입력 핀(R_QA·R_QB의 좌측)으로 들어가는 라벨된 connection.

# 복합형 (mixed_signal) — 전자회로 + 디지털논리회로 혼합

복합형 subject는 단일 분야로 분류 어려운 하이브리드 회로를 모음:
- 전자회로 소자(OPAMP·비교기·트랜지스터)와 디지털 논리(FF·게이트·카운터)가 한 회로에 공존
- 시간영역 파형과 디지털 출력을 함께 분석
- TopicKey: `counter_dac_comparator`, `adc_sample_hold`, `logic_opamp_hybrid`

## counter_dac_comparator (임용 8번 — 2-bit 동기식 카운터 + R-2R DAC + 비교기)
- JK 플립플롭 2개(Q_A, Q_B)로 2-bit 카운터 (동기식, J=K=1, Q_A·Q_B 출력)
- R-2R 저항망으로 디지털→아날로그 변환 (Q_A·Q_B → V_DAC)
- OPAMP 비교기 (V_DAC vs V_REF) → V_o 출력 (V_CC or GND 디지털 출력)
- (가) figure: logic + analog 통합 회로도 (JK-FF·DAC 저항망·비교기·클럭·V_CC)
- (나) figure: 파형 — 클럭, Q_A_bar, Q_B_bar, V_o
- 학생 단계:
  1. (가)의 Q_A_bar·Q_B_bar 파형 도시
  2. (나)의 특정 시점 t에서 비교기 입력 단자 중앙(+) 전압
  3. (가)의 V_o 출력 파형 도시

# 회로 유형별 생성 규칙 (Circuit-Type Rules)

## RL/RC 스위칭 과도응답 (예: 임용 2번 — V_s+SW+R+L 직렬, v_L(t) 측정)
- **L 또는 C는 회로 내부에 명시적으로 그려야 함**. 외부 placeholder 박스(R_L·L_? 같은)로 분리 금지.
- 모든 component(V_s·SW·R·L/C)는 같은 직렬 loop의 일부 — 한 component만 따로 빼지 마라.
- **단자 a·b**: 측정 대상(v_L, v_C) component의 양 끝 노드에 표기. a=위쪽(+), b=아래쪽(−/GND).
- **Figure 의무 셋**: (가) SW 열림 회로 또는 SW 동작 명시된 회로, (나) i(t) 또는 v(t) 파형 figure. hasWaveformEvolution=true면 waveform figure 누락 금지.
- 학생이 풀어야 할 것은 component "값"(L[H], v_L[V])이지 component의 "존재 여부"가 아니다. component 자체를 placeholder로 추상화하지 마라.

## AC 다중 전원 + 중첩의 원리 (예: 임용 10번 — AC V_s + AC I_s + R/L/C, phasor)
- 입력 전원 표기는 phasor 형식(`20∠-90°V`, `4∠0°A`) 또는 시간영역(`v_s(t)=20cos(ωt-90°)`) 둘 다 가능.
- 리액티브 소자는 임피던스 표기(`j15Ω`, `-j5Ω`)로 표시.
- 단자 a·b는 수직 평행 정렬 (Thevenin 단자 같이 같은 vertical line).

## OPAMP finite open-loop gain + 블록도 (예: 임용 11번)
- (가) 회로: V_in 외부 핀(전압원 박스 없이) + R_1(입력) + A(s) OPAMP + R_2(피드백). V+=GND, V_out 단자.
- (나) 블록도(signal flow graph): V_in→α→Σ→A(s)→V_out, V_out→β→Σ 피드백. diagramType="block_diagram".
- A(s) 블록은 **삼각형(OPAMP 심볼)** 으로, α·β는 사각형(gain block).
- OPAMP V+ pin이 GND에 연결되면 V+ stub 끝에 ground symbol 자동 표시.

## BJT DC bias 회로 — 임용 7번 형식 (small signal 분리)
- **bjt_bias ≠ bjt_small_signal**: DC bias 회로는 R + V_CC + BJT(V_BE=0.7V 가정) DC 분석. hybrid-π 등가(r_π + VCCS)는 별개 archetype.
- 회로: V_CC(예 10V) + R_A(베이스 위 분압, 외부 placeholder 가능) + R_B(베이스 아래 분압) + R_C(컬렉터 저항) + R_E(이미터 저항) + BJT.
- 가정: V_BE = 0.7V, I_E ≈ I_C, 베이스단 부하 효과 무시.
- 학생이 풀 것: (1) R_A 알 때 V_E → R_B 도출, (2) 저항률 ρ + 단면적 A + 길이 ℓ로 R_A' = ρℓ/A 계산, (3) R_A 교체 후 I_C·V_O 도출.
- 단자/측정: V_E, V_BE, V_O, I_C, I_E 마크.
- placeholder: R_A를 점선 박스로 그릴 수 있음 (학생이 단계 2에서 도출하는 변수).

## OPAMP positive feedback (정귀환) — 임용 6번 형식
- 회로: V_in(SW 통해) → V−, V+ → R_1 → GND, V_out → R_2 → V+ (★ V_out이 V+로 피드백, V−가 아님).
- A(s) = A_0·ω_0/(s+ω_0). 입력은 V−에 인가.
- **β = R_1/(R_1+R_2)** — V+ 전압 분배비. V+ = β·V_out.
- closed-loop transfer V_out/V−(s) = B·ω_0/(s + D·ω_0) 형태. B·D는 β·A_0로 표현.
- A_0 > 0, D < 0 (예: D = -A_0·β + 1 같은 음수)이면 우반평면 극점 → 시간영역에서 발산하는 응답.
- 단계별 풀이: (1) β=R_1/(R_1+R_2), (2) B·D를 β·A_0로 표현, (3) 라플라스 역변환으로 V_out(t) 도출 + K 상수.
- validator 인정 범위: V_out → V+ 피드백도 정상 OPAMP 회로 (V_out → V− 외에).
- 임용 6번은 SW가 t=0에 닫혀 V−(s) = 1/s 단위 step 입력으로 응답을 보는 형식.

# Important Notes
1. **AI 모델**: OpenAI GPT-4o (`lib/openai.ts` 싱글톤, `DEFAULT_MODEL`)
2. **디자인**: 흰 배경 + 파란 글씨(indigo/blue 계열), 모던·미니멀
3. **분석 출력**: 주제별 해석 + 관련 개념 분석
4. **생성 UI**: "문제 생성하기" 버튼 + 개수 선택 (1·3·5)
5. **두 모드** (canonical = `exam_similar` / `exam_variant`)
6. **3 과목**: `electronics` / `circuit_theory` / `digital_logic`
7. **빈칸 학습**: 핵심 내용 빈칸 5개

## Mode 정책 표
| 모드 | preserveTopology | allowComponentChange | allowValueChange |
|---|---|---|---|
| `exam_similar` (기출유사유형) | true | false | true |
| `exam_variant` (기출변형유형) | true | true (1~2개) | true |
