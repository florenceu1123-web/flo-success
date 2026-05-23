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

# 🚨 절대 원칙 — Rule-Based Universal Path 우선 (2026-05-23 도입)

**새 임용 형식이 들어와도 archetype 추가 금지.** 규칙 기반 universal path로 흡수한다.

## 우선순위 (높음 → 낮음)

1. **`universal_dc`** — circuit_theory + DC-only (V/I/R, no L/C) + multi-step query.
   - 트리거: 가변 R OR `[단계 N]` 패턴 OR V_n 노드 라벨 2+ OR (V·I 혼합 + R≥3)
   - 처리 path: `runUniversalDcPipeline` (rejection sampling + R sweep)
   - 흡수 가능한 archetype: `dc_mesh`, `dc_nodal`, `dc_supermesh`, `dc_supernode`, `dc_dependent_source`, `max_power_transfer`, `switched_dc`
   - **classic 강한 키워드**(테브난·등가회로·최대전력)는 기존 archetype 유지 (호환성)

2. **`universal_ac`** — circuit_theory + L OR C 존재 + AC 키워드 (공진·페이저·최대전력)
   - 트리거: L/C 존재 + (공진·페이저·최대전력·교류·주파수응답)
   - 처리 path: `runUniversalAcPipeline` (complex MNA + zero-crossing bisection)
   - 흡수 가능한 archetype: `rlc_resonance`, `ac_superposition`, `ac_parallel_branches`, `rlc_resonance_max_power`
   - **classic 강한 키워드**(`스위치+t=0`·`중첩의 원리`)는 기존 archetype 유지

3. **기존 archetype** — 위 두 universal에서 안 잡힌 경우만 fallback. **새 archetype 추가 금지**.

## 새 임용 문제 들어왔을 때 의사결정

```
새 형식 입력
   ↓
universal_dc·universal_ac 트리거에 잡히는가?
   YES → 잘 작동하면 그대로 사용. 안 되면 classifier 키워드/시그니처 보강.
   NO  → analyzeImage 프롬프트 보강해서 universal 트리거에 잡히도록 유도.
         (archetype 추가하지 않는다.)
```

**예외**: 회로 figure 모양이 본질적으로 다른 케이스(예: BJT 특성곡선 그래프 figure 자체가 회로가 아닌 경우)만 전용 archetype 정당화.

## 기존 archetype deprecation 로드맵

- **Phase A (현재)** — universal path 우선, 기존 archetype 호환 유지.
- **Phase B** — `dc_mesh`·`dc_supermesh`·`max_power_transfer` 등 universal_dc로 redirect 시도, 출력 품질 검증 후 점진 dispatch 제거.
- **Phase C** — `rlc_resonance` 등 universal_ac로 redirect, 검증 후 dispatch 제거.
- **Phase D** — archetype 코드 파일 제거 (테스트·문서만 유지).

## Universal path 핵심 컴포넌트

- `lib/solver/mna.ts` — DC 선형 회로 MNA (R/V/I/VCCS/VCVS/OPAMP)
- `lib/solver/complexMna.ts` — AC phasor MNA (R/L/C/V/I/VCCS/VCVS, ε 정규화)
- `lib/solver/universalDc.ts` — query (V·I·P·inverseR)
- `lib/solver/universalAc.ts` — query (phasor·resonance·maxPower·inverseC)
- `lib/solver/parsePhasor.ts` — polar/cartesian phasor 입력 ("5∠30°V")
- `lib/generation/topologyDriven/perturbTopology.ts` — mode별 값 perturbation
- `lib/generation/topologyDriven/inferDcQueries.ts` / `inferAcQueries.ts` — query 구조 추출
- `lib/pipeline/runUniversalDcPipeline.ts` / `runUniversalAcPipeline.ts` — pipeline
- `lib/solver/validateDcResult.ts` / `validateAcResult.ts` — rejection sampling 평가

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

# 🚨 회로 생성기 Core Rule (모든 회로 공통, 위반 시 reject)

**모든 소자는 반드시 branch(edge)에 존재한다.**
**소자는 node에 attach되지 않는다.**
**wire continuity ≠ node equivalence.**

- Branch = 두 node 사이의 element. shape: `{ from: NodeId, to: NodeId, element: "wire"|"R"|"V"|"I"|"C"|"L"|... }`
- Node = 단순 접속점 (junction/terminal/ground/label). component 정보 보유 금지.
- 회로 = planar circuit graph (nodes, branches, faces). face = planar embedding의 내부 mesh.
- 소자가 있는 선분 = branch (element !== "wire"). 소자 없는 선분 = wire branch.
- **wire로 이어져 있어도 두 끝점은 별개 node**. 같은 전위(electrical equivalence)와 그래프 동일 노드(planar identity)는 다른 개념. layout/face 계산은 planar identity로, KCL/KVL 풀이는 electrical equivalence로 — 두 perspective를 혼동하지 말 것.
- 모든 ground 노드(kind="ground")도 각각 distinct node. 화면의 ground symbol 한 개는 시각적 표기일 뿐 노드 병합 아님.

**핵심 모델**
- branch endpoint → node candidate
- component insertion → node split (component를 wire에 삽입하면 wire가 좌·우로 갈라지고 양쪽에 새 node가 생성됨)
- junction → explicit node (도선 3개+ 만나는 곳은 반드시 명시 node)
- **component placement = node segmentation** — component 배치는 wire를 끊고 node를 새로 만드는 행위.

```ts
function splitNodeAtComponent(wire: Wire, component: Component) {
  const leftNode = createNode();
  const rightNode = createNode();
  return { from: leftNode, to: rightNode };
}
```

**8단계 파이프라인** (Image → ... → SVG):
1. **skeleton 추출** — 외곽/도선 축 식별 (netlist의 column/row 결정).
2. **branch 분리** — skeleton을 junction 사이 branch 단위로 분리.
3. **component edge 생성** — 각 component를 element branch로.
4. **node segmentation** — component 양쪽 endpoint를 distinct node로 명시.
5. **planar face 계산** — cell 격자에서 face 도출 (`buildCellGrid` + `cellGridToCircuitGraph`).
6. **topology validation** — `validateCircuitGraph` (branch from≠to, mesh face ≥1, boundary≥3).
7. **geometry routing** — node 좌표 부여 (row/col → x/y).
8. **rendering** — 검증 통과한 graph만 SVG.

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

## RLC 공진 / 주파수응답 (예: 임용 9번 — 단일 AC V_s + R+L+C, f vs |I| 곡선)
- 단일 AC 전압원(또는 전류원) + R+L+C가 모두 있고, **여러 주파수에 대한 i(t) 진폭 곡선**이 (나)로 주어지는 형식. ac_superposition과 명확히 구분.
- (가) figure: 직렬 (V_s → R → L → C → GND) 또는 V_s가 R∥L∥C에 인가된 병렬. **C는 회로도에 "C"로만 표기 (수치 미표기)** — 학생이 단계 1에서 도출.
- (나) figure: WaveformDiagram을 frequency-domain으로 재활용 — `xAxis={ symbol:"f", unit:"Hz" }`, signals 1개(linear, Lorentzian).
  - markers: 두 점 — `f_0`(라벨만, 수치 없음 — 학생 도출) + `f_x = ω_x/(2π)` (정수 표기, 주어진 측정 주파수).
  - yMarkers: 두 점 — `I_max`(라벨만, 수치 없음 — 학생 도출) + `I_x`(수치 표기, 주어진 측정 진폭).
- ★ **핵심 출제 패턴**: 그래프에 주어지는 점은 **비공진 주파수 f_x에서의 진폭 I_x**. Imax·f_0는 그래프에 위치만 표시되고 수치는 학생이 도출. f_x=f_0로 하면 학생이 도출할 게 없어진다.
- 학생 단계:
  1. (f_x, I_x) 점에서 |Z(jω_x)| = V_peak/I_x → 풀이로 **C 정전용량**과 **i(t)** 도출. 표준 풀이: |Z|² = R² + (ω_xL − 1/(ω_xC))² → ω_xL − 1/(ω_xC) = ±R. "C는 X[μF]보다 크다" 단서로 두 case 중 하나 선택.
  2. 도출된 C로 공진 조건 X_L=X_C → **f_0 = 1/(2π√(LC))** 와 **I_max = V_peak/R** 도출.
- 값 선택 전략: (ω_x, L, R) 사전 페어 — ω_x·L > R 강제 (inductive case, C가 큰 쪽). V_rms·R 페어로 I_x = V_rms/R(peak)이 nice 소수. C·ω_0·Imax 자동 도출. **−3dB point** 권장: |Z(jω_x)| = R√2 → I_x = Imax/√2.
- classifier 우선순위: **ac_superposition보다 먼저 매치**. 트리거: (R>0 ∧ L>0 ∧ C>0) ∧ (V≤1 ∧ I=0) ∧ 공진/주파수응답 키워드 ∧ "중첩" 키워드 없음.

## Switched RLC 5-leg (임용 9번 원본 정확 재현)
- 6 vertical legs + 2 top horizontal R + SPDT SW:
  - Leg1 V_s (vertical), Leg2 R_2v (vertical), Leg3 R_3+L_a 직렬 (vertical), Leg4 C∥R_4 (vertical), Leg5 L_b (vertical), Leg6 I_s (vertical)
  - Top horizontal: R_top_L (Leg1↔Leg2 top), R_top_R (Leg5↔Leg6 top)
  - SW SPDT: common=Leg4 top, throw_a=Leg3 top(=A 단자), throw_b=Leg5 top(=B 단자)
- 학생 단계:
  1. **t<0 SW=A DC SS** — C 개방, L_a·L_b 단락. 좌측 활성(V_s+R_top_L+R_2v∥R_3∥R_4 등가) → v_C(0⁻). 우측 분리(I_s+R_top_R+L_b, L_b short) → i_L(0⁻)=I_s.
  2. **t≥0 SW=B 직후** — 좌측 분리. KCL at leg4 top: I_s = i_C + v_C/R_4 + i_L → dv_C(0⁺)/dt = (I_s − v_C(0⁻)/R_4 − i_L(0⁻))/C.
  3. **2차 미방** — d²v_C/dt² + (1/(R_4·C))·dv_C/dt + (1/(L_b·C))·v_C = 0. 강제 v(∞)=0 (L_b short → top_Y=GND). 초기조건으로 일반해.
- 값 페어 사전 정의 + 모든 검증 통과. 원본 임용 9번: V_s=12, R_top_L=2, R_2v=R_3=4, L_a=2, C=1/5, R_4=1, L_b=5/6, R_top_R=1, I_s=2 → v_C(0⁻)=3, i_L(0⁻)=2, dv_C/dt=−15, **v_C(t)=−6e⁻²ᵗ+9e⁻³ᵗ** (over-damped).
- classifier: RLC + SW + dual-source + (R≥4 + L≥2) → 5leg, 아니면 v1 (3leg) 또는 다른.
- renderer: `switchedRlc5legCircuitRenderer.ts` 전용. 6-leg 표준 layout + SW + mirror style label.

## Switched RLC step response v1 (예: 임용 9번 switched 단순화 — SPDT SW + dual-source + RLC, 3-leg)
- SW(SPDT) + V_s + I_s + R+L+C 모두 존재. t<0 SS → t≥0 transient.
- 회로 (v1 단순화): 좌측 V_s+R_a → A 단자, 우측 I_s+R_b → B 단자, SW(t=0 A→B) 가운데 단자 → 가운데 노드. 가운데 노드 ━ C (v_C) || (R_c+L) (i_L).
- 학생 단계 표준:
  1. **t<0 DC SS** — C 개방·L 단락 가정. v_C(0⁻), i_L(0⁻) 도출.
  2. **t≥0 KCL** — 가운데 노드 KCL식, v_C·i_L 연속 적용해 dv_C(0⁺)/dt 도출.
  3. **2차 미방 + v_C(t)** — KVL·KCL 결합으로 v_C 단일변수 2차 미방 도출. 특성방정식 → ζ·ω_0 → under/critical/over 분기. 강제응답 + 초기조건으로 일반해 결정.
- 값 선택: (V_s, R_a, R_c, L, C, R_b, I_s) 페어 사전 정의 + 미방 계수·해 자동 도출. 모든 페어 sanity check 통과.
- waveform figure: v_C(t) 시간응답 곡선 (WaveformDiagram, xAxis t/sec, yMarker로 v_C(0⁻)·v_C(∞) 표시, marker t=0 라벨 "SW: A→B").
- classifier 우선순위: **rlc_resonance·ac_superposition·rlc_step보다 먼저 매치**. 트리거: SW + R+L+C + (V·I 둘 다 OR 초기조건/미분방정식 키워드).
- **v1 한계**: 단순화된 3-leg 회로. 원본 임용 9번의 5-leg(2개 R_top + 4Ω+2H 인덕터+1Ω+2A+1Ω+5/6H) 정확 재현은 v2 (별도 archetype `switched_rlc_5leg`)로 분리 예정.

## AC 다중 가지 phasor (임용 5번 형식, ac_parallel_branches)
- V_s + R_top + (L_1 ∥ I_S ∥ L_2 ∥ R ∥ C) — N_L과 N_R 두 노드, I_S가 N_L→N_R 전류원.
- 주어진 페이저: I_L1, I_C (rms magnitude + 각도). 학생 도출: V_C, I_L2, I_S, I_R1.
- 학생 단계:
  1. **V_C** — V_C = I_C·Z_C, Z_C = 1/(jωC) = -j/(ωC)
  2. **I_L2 + I_S** — I_L2 = V_C/(jωL_2), I_R = V_C/R, KCL at N_R: I_S = I_L2 + I_R + I_C
  3. **I_R1** — KCL at N_L: I_R1 = I_L1 + I_S, 시간영역 i_R1(t) = |I_R1|·√2·cos(ωt+∠I_R1)
- 값 페어 사전 정의 + 복소수 계산 자동 derive. 원본 임용 5번: ω=10, R_top=20, L1=1, L2=0.1, R=1, C=0.1, I_L1=20∠-90°, I_C=20∠90° → V_C=20∠0°, I_L2=20∠-90°, I_R=20∠0°, I_S=20∠0°, **I_R1=20√2∠-45°** (즉 i_R1(t)=40cos(10t-45°)).
- classifier: ac_superposition보다 우선. 트리거: AC + V·I + R + L≥2 + C + (단자 a·b 없음) + 가지전류 키워드.
- semantic normalize: phasor 정상상태이므로 hasWaveformEvolution=false 강제 (waveform figure 면제).

## AC 다중 전원 + 중첩의 원리 (예: 임용 10번 — AC V_s + AC I_s + R/L/C, phasor)
- 입력 전원 표기는 phasor 형식(`20∠-90°V`, `4∠0°A`) 또는 시간영역(`v_s(t)=20cos(ωt-90°)`) 둘 다 가능.
- 리액티브 소자는 임피던스 표기(`j15Ω`, `-j5Ω`)로 표시.
- 단자 a·b는 수직 평행 정렬 (Thevenin 단자 같이 같은 vertical line).

## OPAMP finite open-loop gain + 블록도 (예: 임용 11번)
- (가) 회로: V_in 외부 핀(전압원 박스 없이) + R_1(입력) + A(s) OPAMP + R_2(피드백). V+=GND, V_out 단자.
- (나) 블록도(signal flow graph): V_in→α→Σ→A(s)→V_out, V_out→β→Σ 피드백. diagramType="block_diagram".
- A(s) 블록은 **삼각형(OPAMP 심볼)** 으로, α·β는 사각형(gain block).
- OPAMP V+ pin이 GND에 연결되면 V+ stub 끝에 ground symbol 자동 표시.

## NMOS cascode current mirror — 임용 10번 정확 재현 (3-leg, M1·M2·M3)
- 3-leg layout. 모든 NMOS 동일 특성 (V_TH, K, 포화 가정, 채널 길이 변조 무시).
- 좌측 leg (reference): V_DD ━ R(학생 도출, 점선 박스) ━ M1.D=M1.G (diode-connected) ━ M1.S=GND. M1에 정의된 전류 I_ref.
- 가운데 leg (M3 게이트 분압): V_DD ━ R_G1 ━ V_G3 ━ R_G2 ━ GND. V_G3 = V_DD·R_G2/(R_G1+R_G2).
- 우측 leg (cascode 출력): V_DD ━ R_top ━ V_D3 ━ M3.D, M3.S=V_D2 ━ M2.D, M2.S=GND. **M2.G ←━ M1.G (mirror wire, 보라 dashed)**. M3.G = V_G3.
- 학생 단계:
  1. **M1의 V_GS1 + R 도출** — diode-connected이라 포화 → I_ref = K(V_GS1−V_TH)² → V_GS1 = V_TH + √(I_ref/K). KVL로 R = (V_DD−V_GS1)/I_ref.
  2. **M2의 V_D2 도출** — M2 mirror로 I_M2 = I_ref → V_GS2 = V_GS1. M3 cascode로 I_M3 = I_ref → V_GS3 = V_GS1. V_S3 = V_G3 − V_GS3 = V_D2.
  3. **M3의 V_GS3 + V_S3 도출** — 동일 풀이 (단계 2와 같은 V_GS3=V_GS1, V_S3 = V_G3 − V_GS3).
- 값 선택: (V_DD, I_ref, V_TH, K, R_G1, R_G2, R_top) 페어 사전 정의 + 자동 포화 검증 (V_DS2 ≥ V_OV, V_DS3 ≥ V_OV).
- classifier 우선순위: electronics + (MOSFET 인벤토리 ≥2 OR (≥1 + cascode/mirror/M1·M2·M3 키워드)). 단일 mosfet_bias보다 먼저 매치.
- renderer: `mosfetCascodeMirrorCircuitRenderer.ts` 전용. 3-leg 표준 배치 + mirror wire dashed 강조.

## NMOS DC bias (포화 영역) — 단순화 단일단 (확장된 cascode는 mosfet_cascode_mirror 별도)
- 단일 NMOS common-source 회로. V_DD + R_D + M1(NMOS, R_S=0 단순) + V_G 외부 단자 직접 인가.
- 포화 영역 가정 (채널 길이 변조 무시): **I_D = K·(V_GS − V_TH)² [A]**.
- 회로도: V_DD(좌측 vertical) ━ R_D ━ M1(D=V_D, G=V_G, S=GND). V_G는 외부 단자 dot + "V_G = X V" 라벨.
- 학생 단계 표준:
  1. **V_GS, I_D 도출** — R_S=0이므로 V_GS = V_G. I_D = K·(V_GS − V_TH)².
  2. **V_D 도출** — KVL: V_D = V_DD − I_D·R_D.
  3. **V_DS 도출 + 포화 검증** — V_DS = V_D (R_S=0). 검산: V_DS ≥ V_GS − V_TH = V_OV.
- 값 선택: (V_DD, V_G, V_TH, K, R_D) 페어 사전 정의 + 자동 포화 검증 — `PAIRS` filter로 V_DS ≥ V_OV 만족하는 것만 통과. K는 μA/V² 단위 정수 (1000=1mA/V², 500=0.5mA/V²) → I_D[mA] = K[mA/V²]·V_OV²이 정수.
- classifier 우선순위: electronics + (family=mosfet_bias/mosfet_amplifier OR MOSFET inventory OR MOSFET 키워드). bjt_small_signal·opamp 분기보다 위. → mosfet_bias dispatch.
- renderer: `mosfetBiasCircuitRenderer.ts` 전용. NMOS 표준 심볼 (channel bar + gate plate gap + source 화살표). BJT renderer와 동일한 layout 컨벤션 (수직 column, top/bottom rail).
- **확장 예정**: multi-MOSFET cascode (M1·M2·M3 + R_G 분압 + R_S + 전류원)는 별도 archetype `mosfet_cascode` 또는 `mosfet_current_mirror`로 분리 예정. 임용 10번 원형 회로는 이쪽으로 정확히 재현.

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
