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

# 🚨 절대 원칙 — LLM은 문제 구조 JSON만, layout은 archetype renderer (2026-05-25 도입)

## Circuit Generation Architecture Principle

LLM **must not** directly draw circuits.

LLM outputs **only semantic problem JSON**:
- problem type
- archetype
- nodes/roles
- component values
- required analysis steps

Layout/rendering is handled **only by deterministic archetype renderers**.

**Flow**:
```
Image/Prompt
  → Analysis JSON
  → Archetype Detection
  → Archetype JSON
  → Archetype Validator
  → Slot-based Renderer
  → SVG
```

**Do not** use free auto-routing for known exam archetypes.
If an archetype is detected, dispatch to its **fixed renderer before universal_dc**.

## ★ crossLayout 검증 실패 시 graceful fallback (2026-06-04)
`renderCrossLayout`는 buildCellGrid가 직렬 leg를 격자에 못 담아 생기는 **"V·+↔GND wire-only short"**
검증 실패 시 raw `<pre>` 에러를 사용자에게 보이지 않고 **null 반환** → `analogMeshRenderer`가
`renderNetlistEdgeSVG`(positions/BFS edge 렌더러)로 fallback. universal_ac/dc가 만든 임의 회로는
전용 렌더러로 일일이 못 막으므로(예: 임용 10번 2전원 최대전력) 이 fallback이 에러 노출 차단.
※ fallback figure는 깔끔하지 않을 수 있음 — 빈출 형식은 전용 fixed-slot 렌더러 추가가 정석.

## 작업 원칙 (Do / Don't)

- ❌ 자동 라우터 계속 수정
- ❌ 원칙 없이 코드 추가
- ✅ 먼저 아키텍처 원칙 고정
- ✅ archetype별 작업 단위로 (스키마 + detector + renderer + dispatch) 함께 commit

## 새 archetype 도입 시 표준 6 단계

1. **CLAUDE.md에 원칙 문서화** — 해당 archetype의 slot 스키마·layout·구조 JSON 명세
2. **`lib/analog/archetypeRegistry.ts`** — `AnalogArchetype` enum + 구조 JSON 타입 추가
3. **detector** — `lib/analysis/` 에 새 archetype 인식 logic (분석 결과에서 archetype 라벨 결정)
4. **fixed-slot renderer** — `lib/renderers/{archetype}Circuit.ts` 고정 좌표 SVG 생성
5. **dispatch wiring** — `app/api/generate/route.ts` 에서 archetype 매칭 시 universal path **앞에** 라우팅
6. **smoke test** — `/api/generate` HTTP 200 + 생성 SVG 시각 확인

---

## 한글 상세 설명 (위 원칙의 해설)

**LLM이 회로를 그리게 하지 말고**, LLM은 **"문제 구조 JSON"만 만들게 한다**.
그 다음 **문제 유형별 renderer가 고정된 슬롯에 소자를 배치**한다.

## 책임 분리

| 단계 | 담당 | 출력 |
|---|---|---|
| 1. semantic 추출 | LLM Vision | **문제 구조 JSON** — 소자 종류·값·문제 단계·정답 변수만. **위치·좌표·배치 정보 금지**. |
| 2. archetype 결정 | classifier (rule + LLM 보조) | archetype id (예: `IMYONG_10_DC_NODAL`, `WIEN_BRIDGE_OSCILLATOR`) |
| 3. layout 배치 | archetype-specific renderer | **고정 슬롯 좌표**에 소자 배치 → SVG |

## 왜 이렇게 하는가
- LLM은 회로 위치를 일관되게 못 그림 — phantom node, 좌표 부정확, dangling component 발생
- 같은 구조 문제 N번 생성해도 매번 다른 layout 나옴 → 시각적 불안정
- archetype별 고정 slot은 결정론적 — 같은 JSON → 같은 SVG 보장

## archetype renderer가 받는 "문제 구조 JSON" 예 — imyong 10 형식

```ts
type Imyong10DcStructure = {
  archetype: "IMYONG_10_DC_NODAL";
  values: {
    V_s: number;        // 좌측 V 소스 (예: 20)
    R_left_top: number; // V_s ↔ V_1 위쪽 R (예: 20)
    R_left_mid: number; // V_s ↔ V_1 아래쪽 R (예: 20)
    R_v1_v2: number;    // V_1 ↔ V_2 위쪽 R (예: 10)
    I_src: number;      // V_1 ↔ V_2 아래쪽 I (예: 0.5)
    R_right: number;    // V_2 ↔ GND R (예: 10)
    // R_var는 변수 (학생 도출 대상) → value 없음
  };
  query: {
    targetNode: "V_1" | "V_2" | "V_3";
    targetValue: number;  // 예: V_2 = 3.8V 조건
  };
};
```

## 고정 슬롯 스키마 (imyong 10 archetype)

| slot id | 위치 | 소자 |
|---|---|---|
| `slot_left_source` | 좌측 vertical leg (VS_PLUS↔GND) | V 소스 |
| `slot_left_top_R` | VS_PLUS↔V1 사이 위쪽 horizontal | R |
| `slot_left_mid_R` | VS_PLUS↔V1 사이 아래쪽 horizontal | R (parallel) |
| `slot_center_Rvar` | V1↔GND vertical | R (가변, "R"만 표시) |
| `slot_v1_v2_top_R` | V1↔V2 사이 위쪽 horizontal | R |
| `slot_v1_v2_mid_I` | V1↔V2 사이 아래쪽 horizontal | I 소스 |
| `slot_right_R` | V2↔GND vertical | R |

## 고정 layout (imyong 10 archetype)

```
VS_PLUS ┬─ R_left_top ─┬ V1 ┬─ R_v1_v2 ─┬ V2
        └─ R_left_mid ─┘    └─ I_src ───┘
                 │                    │
                R_var                R_right
                 │                    │
                GND ──────────────────┘
```

renderer는 이 JSON을 받아서 **항상 같은 좌표에 배치**한다. seed·perturbation은 *value*에만 적용,
*위치/연결성*은 결정론.

## 적용 범위

- **점진 전환** — 이미 archetype 있는 케이스부터 (Wien Bridge, opamp_positive_feedback 등) 이 원칙 적용
- **universal_dc 같은 free-form path**는 LLM 출력의 위치성을 그대로 쓰지만, archetype에 잡히면 고정 layout으로 우선 라우팅
- 새 archetype은 반드시 (1) 구조 JSON 스키마 + (2) 고정 slot renderer 둘 다 함께 작성

## 기존 원칙과의 관계
- [[feedback_universal_path]] (rule-based universal path 우선)은 archetype 폭증 방지가 목적.
  이 원칙은 archetype을 **추가할 때**의 작성 방식 — 둘은 모순 아님 (universal로 흡수 안 되는 fixed-template archetype에 한해 적용).
- [[feedback_fix_vs_rule]] (코드 fix 대신 prompt 규칙)과도 양립 — LLM이 구조 JSON 잘 만들도록 prompt 강화하면 됨.

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
- ★ **기출변형유형 = 쌍대(dual) 회로**: 직렬 RLC(전압원·전류측정)의 쌍대 = **병렬 GLC(전류원·전압측정)**. V↔I, R↔G(=1/R), L↔C, C↔L, 직렬↔병렬 (스케일 R₀=1kΩ). 공진주파수 f_0 동일. 원본 TRIPLES·V_PRESETS를 R₀ 매핑으로 재사용 → 깔끔한 거울값(I[mA]↔V[V], Ω↔kΩ, H↔µF). 학생 도출: 미지 **L**(원본 C의 쌍대)을 (f_x,V_x) −3dB점에서, 그 뒤 f_0·V_max=I_peak·R. 파일: `generateRlcResonanceDual`+`buildDualResonanceCurveSamples` (rlcResonance.ts), `runRlcResonancePipeline`에서 `mode==="exam_variant"`면 dual(결정론 텍스트, 병렬 netlist는 generic analogMeshRenderer로 렌더, (나)는 |V| vs f 곡선).

## 직렬 RLC 공진 + 대역폭 (임용 11번 — `rlc_resonance_bandwidth`) 전용 archetype
- 원본: 직렬 RLC. v(t)=Vp·cos(ω₀t), 공진주파수 ω₀·C값 주어짐. 토폴로지 `v(t)→R→마디 a→[C₁∥C₂]→마디 b→L→복귀` (C_eq=C₁+C₂).
- 위 `rlc_resonance`(임용 9번, f vs |I| 곡선에서 **C 도출**)와 **다름** — 이쪽은 **L 도출 + 대역폭 β** 중심. 3단계:
  - [단계1] 공진시 **L = 1/(ω₀²·C_eq)** + 페이저 **V_ab = I·(1/jω₀C_eq) = (Vp/R)·ω₀L ∠−90°** (공진시 Z=R → I=Vp/R∠0°).
  - [단계2] **대역폭 β₁ = R/L** [rad/s] (직렬 RLC).
  - [단계3] R→R₂ 시 β₂=R₂/L → **β₁/β₂ = R/R₂**.
- ★ generic `universal_ac` 쿼리추론은 "공진주파수·C 찾기"라는 엉뚱한 generic 문제를 만들어 **대역폭·L도출·V_ab 구조를 잃음** → 전용 결정론 archetype 필수.
- ★ **Vision 비결정성 대응 (핵심)**: Vision이 이 문제를 "공진 전압 계산"으로 요약하며 **대역폭/β 단계를 흘려** universal_ac로 오분류됨(실측 0/3). → `analyzeImage` 프롬프트에 "RLC 공진+대역폭 추출 절대규칙" 추가(대역폭·β·L·V_ab를 interpretation·relatedConcepts에 보존 강제). classifier는 **공진 + 대역폭/β** 키워드로 universal_ac **앞에** 매치. 보강 후 라우팅 0/3→5/5.
- ★ **원본 예시 미생성**: PARAM_SETS index 0 = 원본값(3.5µF∥1.5µF·5Ω·10V) — **생성 풀에서 제외**(참조·물리검증 전용). 유사·변형은 다른 사전검증 세트(L·V_ab·β 모두 깔끔)만 emit. [[feedback_generic_code]] 준수.
- ★ **기출변형유형(exam_variant) = 쌍대(dual) 병렬 RLC**: 임피던스 스케일 R₀=1kΩ로 직렬→병렬 변환. 전압원→전류원, 직렬R→병렬 R_d=R₀²/R, 직렬L→병렬 C_d=L/R₀², 직렬C→병렬 L_d=C·R₀², V_ab→I_ab=V_ab/R₀. **β·β₁/β₂ 보존**(직렬 β=R/L = 병렬 β=1/(R_dC_d)), 공진주파수 동일, V_ab[V]↔I_ab[mA] 거울. 학생은 C_d(직렬 L의 쌍대) 도출. 원본 검산: 직렬(R5·L2mH·C5µF) → 쌍대(R_d200kΩ·L_d5H·C_d2nF·I_ab=40∠−90mA·β₁=2500·비10). `generateRlcResonanceBandwidthDual`(R₀ 스케일), diagramType `rlc_resonance_bandwidth_dual_circuit`(전용 병렬 RLC 렌더러: 전류원∥R_d∥[L₁직렬L₂]∥C_d). pipeline에서 `mode==="exam_variant"`면 dual 경로.
- 파일: `lib/generation/topologies/rlcResonanceBandwidth.ts`(결정론 generator 직렬+쌍대, GPT 없음), `lib/pipeline/runRlcResonanceBandwidthPipeline.ts`(3단계 텍스트, 변형=dual), `lib/renderers/rlcResonanceBandwidthCircuitRenderer.ts`(직렬: R–[C₁∥C₂]–L 지그재그 R + 단자 a·b + AC원 + V_ab)·`rlcResonanceBandwidthDualCircuitRenderer.ts`(병렬 쌍대). circuitType `rlc_resonance_bandwidth`, diagramType `rlc_resonance_bandwidth_circuit`/`_dual_circuit`. types·validateProblem·route dispatch·semantic normalize(페이저 정상상태=파형/등가/multi 면제) 등록.

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

## AC+DC 중첩 정상상태 (예: 임용 2022 B-6 — 직류·교류 전원 + 스위치로 연결된 RL, i(t) 중첩)
- 직류 전압원 + 교류 전압원(`A√2 sin ωt`)이 **스위치(단자 선택)로 연결된 단일 루프** + 상단 R + 우측 병렬 리액티브 블록(L∥L 또는 C) + 하단 R.
- 해석: [단계 1] DC만(L 단락) → I_DC, [단계 2] AC만(페이저·전류 분배) → i_ac(t), [단계 3] 중첩 i(t)=I_DC+i_ac(t). 모두 정상상태 (과도응답 아님 → waveform·state transition figure 면제).
- 분류: `universal_ac` + `params.acDcSuperposition=true` (스위치는 전원 선택용 — 과도응답으로 오분류 금지). 생성·텍스트 모두 결정론 (`generateAcDcSuperposition` + `acDcSuperpositionTextWriter`, GPT 호출 없음).
- ★ **렌더링은 전용 fixed-slot renderer 필수**: `acDcSuperpositionCircuitRenderer.ts` (`detectAcDcSuperposition` → `renderAcDcSuperpositionCircuit`). `analogMeshRenderer`에서 `crossLayout` **앞에** 디스패치.
  - 이유: 좌측 leg에 전원·스위치 4개가 직렬로 쌓인 구조라 generic grid 빌더(`crossLayout`→`buildCellGrid`)가 한 column에 직렬 소자 4개를 표현 못 해 **"V·+단자↔GND wire-only short" 검증 실패**를 낸다. fourNodeImyong과 동일한 short 우회 패턴.
  - detector는 특정 id가 아니라 **구조 signature**(V 2개 + SW≥1이 GND 끝나는 단일 직렬 chain + 리액티브≥1)로 인식 → exam_variant의 전원 위치 교환도 자동 처리.
  - **레이아웃**: 직사각 단일 루프. 좌측 leg = 위 전원(vertical) + **SPDT 선택 스위치(점선 박스 + 단자N 라벨 + arm)** 스택 + 아래 전원, 전원과 스위치망 접점에 노드 dot. 단자 번호는 아래 스위치부터 1·2, 그 위 3·4. 상단 R / 우측 병렬 리액티브 / 하단 R로 루프 폐합.
  - **단자 배선 (사용자 확정, 임용 2022 B-6)**: 직렬 경로는 우측 단자(단자4·단자2)를 통해 두 전원 직렬 연결(단계3 config). 좌측 단자는 **최상단 스위치 단자(단자3) → 상단 노드(TL), 최하단 스위치 단자(단자1) → 하단 노드(GND)** 로 좌측 lane 라우팅. (단자3↔단자4·단자1↔단자2 선택으로 DC만/AC만/둘다 전환.)
- ★ **기출변형유형(exam_variant)은 쌍대(dual) 회로**: 원본(전압원·직렬 R·병렬 L·i 측정)의 정확한 dual = **전류원·병렬 R·직렬 C·v 측정** (V↔I, R↔G, L↔C, 직렬↔병렬, i↔v, KVL↔KCL).
  - 파일: `lib/generation/topologies/acDcSuperpositionDual.ts` (generator), `acDcSuperpositionDualTextWriter.ts` (텍스트), `lib/renderers/acDcSuperpositionDualCircuitRenderer.ts` (전용 렌더러, `detectAcDcSuperpositionDual` → `analogMeshRenderer`에서 crossLayout 앞 dispatch). 파이프라인 `runUniversalAcPipeline`에서 `mode==="exam_variant"`면 dual 경로.
  - 닫힌형 해: 조건 1/(ωC_eq)=R(45°). [단계1] C 개방 → V_DC=I_dc·R. [단계2] Y=(1+j)/R → v_ac=I_ac·R∠−45°, 전압분배 v_1ac/v_ac=C_eq/C_1(직렬 C). [단계3] 중첩 v(t)=V_DC+v_ac(t). 값은 원본 nice-number를 I↔V로 재사용(I[mA]·R[Ω]/1000=정수 V).
  - 레이아웃: 두 rail 사이 병렬 가지 [I_ac+SW₂]‖[I_dc+SW₁]‖[R]‖[C_1─N_MID─C_2 직렬]. SW는 활성 단자→rail, 개방 단자(단자3·단자1)는 stub. v(t)·v₁(t)는 우측 +/− 화살표.

## AC+DC 중첩 RC 회로, 스위치 없음 (임용 12번 회로이론 — `acDcSuperpositionRc`) 전용 archetype
- 원본: 교류 전원 v(t)=A√2·cos(ωt) + 직류 전원 V_dc가 포함된 **RC 회로**(스위치 없음)를 **중첩의 원리**로 해석. 단자 a·b, i_ab(a→b)·I_DC 측정.
- ★ 위 acDcSuperposition(스위치+RL 단일루프)과 **구조가 다름** — 흡수 불가. generic universal_ac 추출은 두 전원 병합·DC 소실 → 전용 고정 토폴로지 archetype.
- **고정 토폴로지** (사용자 원본 이미지 확정, 4 노드 a·b·c·g): `g─v(t)─C─a` / `a─[R₃∥R₄]─c` (★ **a–c 사이 R₃∥R₄ 병렬**) / `c─R₅─g` (우측 세로) / `a─20V─b─(도선)─g` (중앙, b 바닥 접지선 직결). i_ab=a→b, I_DC=b.
- **닫힌형 해** (Rp=R₃∥R₄): [DC] C 개방→직렬 루프 V_dc·Rp·R₅ → I_DC=V_dc/(Rp+R₅) (=i_ab(DC)), I_R₄(DC)=I_DC·R₃/(R₃+R₄). [AC] ★ **20V 단락이 점 a를 접지에 클램프**(이상 전압원=AC 단락) → R₃∥R₄ 양단 0 → **I_R₄(AC)=0** (교육 포인트). 모든 교류는 20V 가지로: i_ab(AC)=V_peak/|Z_C|=V_peak·ωC. [전체] R₄ 최대=I_R₄(DC)+0.
- ★ **생성기**: 사전검증 PARAM_SETS(첫 세트=원본값 10√2·20V·0.2µF·2k∥2k·1k). DC 정수 mA + i_ab(AC)=정수·√2 mA. (`generateAcDcSuperpositionRc`, GPT 없음.)
- ★ **기출변형유형 = 쌍대(dual) 회로** (`generateAcDcSuperpositionRcDual`, diagramType `ac_dc_superposition_rc_dual_circuit`): V↔I, R↔1/R, C↔L, 직렬↔병렬 (스케일 R₀=1kΩ). 전류원 i(t)∥L + 직류 전류원 + 직렬 R₃+R₄ + 병렬 R₅, **전압 측정**(v_ab·V_DC·V_R₄). 해석도 쌍대: [DC] L단락, [AC] 직류 전류원 개방→V_R₄(AC)=0. 답은 원본의 mA→V 거울. `runUniversalAcPipeline`에서 `mode==="exam_variant"`면 dual 경로.
- 분류: classifier 0-PRE-AC-DC-SUPER-RC (switch 분기보다 먼저) — I=0 + C>0 + AC신호(텍스트/inv) + **DC 전압원(hasDcVSource) + 스위치 없음** → `universal_ac` + `params.acDcSuperpositionRc`. ★ V≥2 의존 금지(Vision이 AC 소스 누락해 V=1인 경우 잦음 — DC는 inventory, AC는 텍스트로 교차 감지). route는 topologySignature 불필요 + isAcDcSuperposition 가드 포함(정상상태).
- 렌더러 `acDcSuperpositionRcCircuitRenderer.ts`(유사)·`acDcSuperpositionRcDualCircuitRenderer.ts`(변형), index.tsx + validateProblem `CIRCUIT_FIGURE_TYPES` 둘 다 등록. 저항·인덕터 지그재그/코일.

## 2전원 테브난 최대전력 (임용 10번 — AC 전압원 + 전류원 + RLC + R_L 최대평균전력)
- 전압원 V(∠0°) + 전류원 I(∠0°) + RLC + 부하 R_L. [단계1] Z_th(a-b), [단계2] V_th(중첩), [단계3] R_L=|Z_th|·P_max.
- ★ generic universal_ac 토폴로지 추출은 두 전원망의 **공통 부하 단자 연결을 잃어** figure·물리 모두 깨짐 → **고정 토폴로지 archetype** 필수.
- 파일: `lib/generation/topologies/acTheveninMaxPower.ts` (generator — **복소 MNA solver로 Z_th·V_th 계산**, ω=1·L=X·C=1/X 규약, PARAM_SETS는 정수 R_L 사전검증), `acTheveninMaxPowerTextWriter.ts`, `lib/renderers/acTheveninMaxPowerCircuitRenderer.ts` (전용 fixed-slot: 상단 V망 / 하단 I망 / 우측 R_L, 단자 a-b).
- classifier `classifyCircuitType` 0-PRE-AC-THEVENIN-MAXPOWER: V≥1 + I≥1 + 리액티브 + (테브난 OR 최대전력) → `universal_ac` + `params.theveninMaxPower`. pipeline `runUniversalAcPipeline`에서 분기, route는 topologySignature 불필요(결정론 generator).
- 토폴로지: V망 e—R_top—m—L_s—a, C_v: m↓GND / I망 I1↑p, R_i: p→a, C_i: p↓GND / 부하 R_L: a↓GND(b). 두 전원망 병렬@a-GND.

## 스위치 RL + 종속전원(2i_A) 과도응답 (임용 2022 B-7) — 전용 archetype
- 2 독립 직류전원(40V·12V) + 종속전압원 CCVS(2i_A) + SW(단자1/단자2, t=0) + RL. [단계1] 단자1 정상상태 → i_L·v_o, [단계2] t=0 단자1→단자2 → i_L(t)·v_o(t).
- ★ generic/topology-driven은 **종속전원(CCVS)을 떨어뜨려** 회로가 깨짐 → **고정 토폴로지 archetype 필수**.
- 파일: `lib/generation/topologies/switchedRlDependent.ts` (generator — CCVS 2i_A는 i_A가 4Ω 전류 → VCVS(gain=k/Ra)로 변환 가능하나 닫힌형 해 사용; 정상상태 KCL + 1차 RL 과도 τ=L/Ro), `switchedRlDependentTextWriter.ts`, `lib/renderers/switchedRlDependentCircuitRenderer.ts` (전용 렌더러: 40V·2Ω·SW / 12V / 4Ω(i_A) / 3H(i_L) / 6Ω(v_o) / 2i_A 다이아몬드).
- 라우팅: route.ts에서 `circuitType∈{switched_rl,rl_step}` + inventory에 종속원(CCVS/CCCS/VCVS/VCCS) → `runSwitchedRlDependentPipeline` (**topology_driven보다 우선**). hasWaveformEvolution·hasStateTransition=false 강제(v_o(t)는 학생 도출, waveform figure 면제). `analogMeshRenderer`에서 detect dispatch.
- 닫힌형 해 (값 R1=2,Ra=4,Ro=6,L=3,k=2 고정 + V1·V2 가변): 예 V1=60·V2=12 → i_L 3→1A, v_o 18→6V, τ=0.5s, i_L(t)=1+2e^(−2t).

## 2단 OPAMP — 비반전→반전, V_P 주어지고 V_i·V_o 도출 (임용 2번 — `opamp_two_stage`) 전용 archetype
- 원본: V_i → [1단 비반전 ×A₁] → V_P → [2단 반전 ×−A₂] → V_o. **V_P 값 주어질 때 V_i·V_o를 순서대로** 도출.
  - 1단: V_i→(+), Rg1→GND·Rf1 피드백 → V_P=(1+Rf1/Rg1)·V_i. [확정: V_i=V_P/A₁]
  - 2단: V_P→Rin2→(−), Rf2 피드백, (+)→GND → V_o=−(Rf2/Rin2)·V_P=−A₂·V_P.
- ★ generic opamp/opamp_generic·opamp_cascade_voltage_divider(전달함수 V_o/V_i)는 이 "V_P given·V_i·V_o 도출" 구조를 재현 못 함(다른 문제·garbage) → 전용 결정론 archetype.
- ★ **Vision 대응 2겹**: (1) extractComponentInventory에 "능동소자(삼각형 OPAMP) 추출 최우선 규칙"(라벨 없는 삼각형도 OPAMP, 연산증폭기 언급 시 개수만큼 필수) — OPAMP 추출 0/3→5/5. (2) analyzeImage에 "2단 OPAMP V_P·V_i·V_o 보존 규칙". classifier는 **opamp 맥락 + V_P(중간노드) given + V_i·V_o 도출(기호 또는 '입력 전압·출력 전압') + 전달함수 아님**으로 cascade/generic **앞에** 매치. 실이미지 라우팅 2/4→5/5.
- 값(이득 A₁∈{2,3}·A₂∈{2..5}·V_P)은 규칙 기반 구성(예시 목록 아님), V_i=V_P/A₁ 정수·V_o 정수 보장. 파일: `lib/generation/topologies/opampTwoStage.ts`·`runOpampTwoStagePipeline.ts`·`lib/renderers/opampTwoStageCircuitRenderer.ts`(비반전 U₁ + 반전 U₂ 전용 렌더러). circuitType `opamp_two_stage`, diagramType `opamp_two_stage_circuit`. ※ 원본의 2단 정확한 배선(1k·1k·10k·7k로 V_o=−5)은 이미지로 특정 불가 → 구조 동일·표준 반전 2단으로 재현(유사문제는 값이 달라야 정상).

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

## 제너다이오드 + BJT 전압 레귤레이터 (임용 8번 전자회로 — `zener_bjt_regulator`) 전용 archetype
- 원본: 제너다이오드 + 트랜지스터 응용회로(전압 안정화). V_z·V_BE·V_CE=0(포화) 주어지고 I_L 조건에서 V_o·I_1·I_z·R_4 단계 도출.
- ★ **오분류 차단**: "포화영역에서 동작" 표현이 `bjt_characteristic_curve`(출력특성곡선 영역식별) 분기를 잘못 트리거. 제너 + 회로해석 단계(V_o·전류·저항 "구한다")가 있으면 특성곡선이 아니라 **레귤레이터 해석** → classifier에서 특성곡선 분기 **앞에** 매치. 트리거: (제너 키워드 OR 제너 inventory: D+전압값) + (BJT 키워드 OR BJT inventory) + 회로해석 단계 신호.
- ★ generic bjt 경로는 회로 구조 잃고 특성곡선/특성식별 문제로 변질 → 전용 archetype 필수.
- **션트 레귤레이터 해석 (닫힌형, 3단계)**: V_o 노드에 제너+BJT 션트가 걸려 V_o 안정화.
  - [단계1] V_o = V_z + V_BE.
  - [단계2] I_1 = (V_in − V_o)/R_1, 출력노드 KCL I_1 = I_L + I_z → I_z = I_1 − I_L (제너·트랜지스터 션트전류).
  - [단계3] R_3∥R_4 = V_o/I_L → R_4 = (R_load·R_3)/(R_3 − R_load).
- 원본값(첫 PARAM_SET): 20V·V_z7.3·V_BE0.7·R_1=120·R_3=150·I_L=80mA → **V_o=8V·I_1=100mA·I_z=20mA·R_4=300Ω**. 사전검증 세트 모두 정수/깔끔 (Rload<R3, Iz>0).
- 파일: `lib/generation/topologies/zenerBjtRegulator.ts`(결정론 generator, GPT 없음), `lib/pipeline/runZenerBjtRegulatorPipeline.ts`(결정론 3단계 텍스트), `lib/renderers/zenerBjtRegulatorCircuitRenderer.ts`(전용 fixed-slot: 20V·R₁+I_1·제너(삼각형+Z바)·R₂(수직)·NPN BJT·R₃∥R₄(점선)·V_o 단자·I_L). circuitType `zener_bjt_regulator`, diagramType `zener_bjt_regulator_circuit`. index.tsx·validateProblem `CIRCUIT_FIGURE_TYPES`·route dispatch(특성곡선 앞)·semantic normalize(multi-figure off) 등록.
- ★ **토폴로지 주의**: 표준 제너-BJT 션트 레귤레이터 해석으로 구현 (V_o=V_z+V_BE). 원본 정확한 wire-routing은 사용자 확인 시 정정 가능.

## OPAMP positive feedback (정귀환) — 임용 6번 형식
- 회로: V_in(SW 통해) → V−, V+ → R_1 → GND, V_out → R_2 → V+ (★ V_out이 V+로 피드백, V−가 아님).
- A(s) = A_0·ω_0/(s+ω_0). 입력은 V−에 인가.
- **β = R_1/(R_1+R_2)** — V+ 전압 분배비. V+ = β·V_out.
- closed-loop transfer V_out/V−(s) = B·ω_0/(s + D·ω_0) 형태. B·D는 β·A_0로 표현.
- A_0 > 0, D < 0 (예: D = -A_0·β + 1 같은 음수)이면 우반평면 극점 → 시간영역에서 발산하는 응답.
- 단계별 풀이: (1) β=R_1/(R_1+R_2), (2) B·D를 β·A_0로 표현, (3) 라플라스 역변환으로 V_out(t) 도출 + K 상수.
- validator 인정 범위: V_out → V+ 피드백도 정상 OPAMP 회로 (V_out → V− 외에).
- 임용 6번은 SW가 t=0에 닫혀 V−(s) = 1/s 단위 step 입력으로 응답을 보는 형식.

# 🚨 디지털논리 LogicDAG 중간 signal 보존 — 절대 규칙

원본 회로의 **중간 출력**(X, Y 등 intermediate gate output)이 존재하면 반드시 LogicDAG의 intermediate gate node로 보존한다. flatten 금지.

## 위반 reject 규칙
1. **절대로 f_1·f_2·f_3·f_4 같은 함수 leaf를 하나의 OR/AND/XOR 게이트에 직접 연결하지 마라**. 원본이 (f_1·f_2)→X, (f_3·f_4)→Y, (X⊕Y)→Z 구조라면 X·Y를 intermediate gate node로 그대로 보존.
2. **원본에 중간 출력 X, Y가 있으면 반드시 intermediate gate node로 보존**한다. 라벨 텍스트로만 처리 금지.
3. **최종 출력 Z는 반드시 X, Y 같은 intermediate signal을 입력으로 받는다**. f_n을 직접 받지 않는다.
4. **logic_network는 반드시 LogicDAG JSON shape으로 출력**한다 (`lib/digital/logicDag.ts`의 `LogicDAG` 타입).

## 표준 LogicDAG 출력 예 (임용 8번 형식)
```ts
{
  outputId: "Z",
  nodes: [
    { id: "f1", kind: "function", label: "f_1" },
    { id: "f2", kind: "function", label: "f_2" },
    { id: "f3", kind: "function", label: "f_3" },
    { id: "f4", kind: "function", label: "f_4" },
    { id: "X",  kind: "gate", gate: "AND", inputs: ["f1","f2"], label: "X" },
    { id: "Y",  kind: "gate", gate: "OR",  inputs: ["f3","f4"], label: "Y" },
    { id: "Z",  kind: "gate", gate: "XOR", inputs: ["X","Y"],   label: "Z" }
  ]
}
```

## 위반 예 (전부 reject)
- nodes에 X·Y 없이 Z.inputs=["f1","f2","f3","f4"] 단일 게이트
- X·Y를 별도 LogicDAG node가 아니라 텍스트 라벨로만 처리
- outputId가 X 또는 Y (Z여야 함)

## 디지털 생성 파이프라인 — 고정 순서
```
generate → minterms 생성 → kmap 생성 → LogicDAG 생성 → validateLogicDag → renderLogicDagSvg
```
- 단계 간 출력은 다음 단계의 입력. 순서 임의 변경 금지.
- `validateLogicDag` 미통과 시 generate로 되돌아간다 (LogicDAG·kmap 부분 patch 금지, regenerate).
- 관련 파일: `lib/digital/logicDag.ts` (타입), `lib/digital/layoutLogicDag.ts` (좌표), `lib/digital/renderLogicDagSvg.ts` (SVG).

system prompt에도 동일 규칙 박힘: `lib/prompts/system.ts`의 `[LOGIC_DAG_INTERMEDIATE_CONTRACT]` + `[디지털 생성 파이프라인 — 고정 순서]` 섹션.

## waveform_analysis (임용 5번 — 조합회로 + 타이밍 도표 + 카르노맵) 절대 규칙
- ★ **디지털 파형 신호는 반드시 `shape: "step"`** (구형파). 미지정 시 renderer가 linear(경사형)로 그림 — 디지털 신호엔 틀림. (`lib/generation/topologies/waveformAnalysis.ts`)
- ★ **빈칸 ㉠은 출력 게이트(마지막)** (`blanks=[{symbol:"㉠", gateIds:[output 게이트], answer:종류}]`). 중간 게이트 아님(원본 구조).
- ★ **중간신호 Y blank 트랙** — 첫 AND 출력을 "Y"로 명명(`signalLabels`), 파형에 `{name:"Y", blank:true, vRange:{0,1}}` 트랙 추가. 학생이 단계1에서 Y 파형 도출. `ySequence`가 정답.
- minterm 4~6개, **SOP ≥ 3항 선호**(재시도) — 회로가 너무 단순(2항)하지 않게, ㉠이 여러 AND 결합.
- ★ **figure 3개 필수**: (가) logic_network, (나) waveform, **(다) kmap(빈칸, 학생이 채움)**. kmap 누락 시 `missing_figure_variant` 에러. `runWaveformAnalysisPipeline`이 `gen.kmapDiagram`(빈 셀 "") 추가. 정답은 `gen.kmapAnswer`.
- 문제 3단계(`waveformAnalysisTextWriter`): [1] Y 파형 그리기, [2] ㉠ 게이트 도출(F와 일치), [3] F 카르노맵·부울함수. figure(Y blank·㉠ blank·kmap blank)와 질문 일관성 필수.
- 렌더러: AND 게이트 입력핀 간격 — gate height `inputCount*40+28`, rowGap 175 (입력 wire 겹침 방지). 입력 stub는 핀별 stagger(`gateInputStub`), **각 입력핀에 신호 이름 라벨**(primary 변수·보수 또는 signalLabels) — 어느 node가 어느 입력인지 구분.

## SR 플립플롭 + 2×1 MUX 상태순환 순차회로 (임용 10번 정보과 — `sr_ff_mux_sequential`) 전용 archetype
- 원본: 입력 없는 **2-bit 순환 순서회로**(예: 11→00→10→01→11)를 **SR 플립플롭 2개 + 2×1 MUX 4개**로 설계. 각 FF 입력(S·R)을 MUX 1개가 구동.
- ★ generic `fsm`/`sequential_dff_generic` 경로는 SR-FF·MUX4 구조를 **D-FF+MUX2 Mealy FSM으로 변질**(SR→D, 입력 X·출력 Z 날조) → 전용 archetype 필수.
- ★ **핵심 설계 규칙 (모든 단일 4-cycle에서 성립 — 검증됨)**: 단일 4-cycle은 차기상태 비트 nA·nB 중 **정확히 하나만 두 비트(Q_A·Q_B) 모두에 의존**, 나머지는 단일 비트 의존.
  - "두 비트 의존" FF = **빈칸(㉠~㉣) FF**. 선택선 = 나머지 비트로 두면 MUX 데이터입력 I0·I1이 그 나머지 비트의 함수(Q_x / Q_x' / 0 / 1) → 학생 도출.
  - 단일 비트 의존 FF = **주어진 FF**. 그 비트를 선택선으로 두면 I0·I1이 상수(0/1).
  - 두 FF 공유 선택선 = "주어진 FF가 의존하는 비트". 교차 의존 cycle(공유 선택선 불가)은 본 archetype 대상 아님 → 풀에서 제외.
- 모드: `exam_similar`=cycle C·C'(select=Q_A, 빈칸 FF B, 원본 flavor) / `exam_variant`=cycle A·A'(select=Q_B, 빈칸 FF A, 거울). 각 2개 distinct (4-cycle 공간 한계).
- 풀이 2단계: [1] (나) 상태표 → 빈칸 FF의 S·R **SOP**(2변수 Q_A·Q_B, **무관항=1**). [2] 선택선으로 S·R 분해 → MUX 데이터입력(㉠~㉣).
- figure 3개: (가) `concept_diagram`(입력 없는 ring 상태도), (나) `truth_table`(현재상태·다음상태·SR입력 S_A R_A S_B R_B, ×=don't care), (다) `sr_ff_mux_sequential_circuit`(전용 fixed-slot 렌더러).
- 파일: `lib/generation/topologies/srFfMuxSequential.ts`(결정론 generator — 여기표·SOP·MUX분해 모두 cycle에서 도출, GPT 없음), `lib/pipeline/runSrFfMuxSequentialPipeline.ts`(결정론 텍스트), `lib/renderers/srFfMuxSequentialCircuitRenderer.ts`(전용 렌더러: MUX 사다리꼴×4 + SR-FF box×2 + 공통 선택선 + 클럭). classifier는 **디지털 분기 최상단**(SR/RS-FF + MUX + 순차문맥 + T-FF 아님) → `sequential_dff_generic`·`universal_digital`보다 먼저 매치.

## 비동기 SET/RESET D-FF 응용회로 — 자동재적재 리플 다운카운터 (`async_preset_ripple_counter`) 전용 archetype
- 원본(정보·전자 임용): **비동기 SET·RESET을 갖는 D-FF 3개** 응용회로. I₀I₁I₂(예: 101) 고정 입력, 초깃값 Q=000. [단계1] 구간 ㉠의 Q₀Q₁Q₂ 값, [단계2] 구간 ㉡의 출력 파형 도시.
- ★ **확정된 동작** (사용자 정답으로 검증):
  - 우측 게이트 **F = NOR(Q₀, Q₁, Q₂, CLK)** — Q·CLK가 **모두 0일 때만 1**.
  - 셀별 비동기: **Set_k = F·I_k, Reset_k = F·I_k′** (인버터 + AND 2개). F=1이면 I 패턴을 비동기 적재(I_k=1→Set, 0→Reset).
  - 평상시(F=0): **D_k = Q̄_k (T 동작)** + **리플 클럭**(CLK→FF0, Q₀→FF1.clk, Q₁→FF2.clk). Q₀는 CLK 상승마다, Q₁은 Q₀ 상승마다, Q₂는 Q₁ 상승마다 반전.
  - 출력이 **모두 0이 되면 F=1로 I 자동 재적재**(0 상태 건너뜀) — "출력 모두 0일 때 빼고 정상동작".
- ★ **수학적 정체**: I의 2진값(Q₀=LSB)을 N이라 하면 **mod-N 다운카운터**(N→N-1→…→1→재적재 N). 예) I=101=5 → ㉠=101 → ㉡=001,110,010,100(→재적재). [단계1] ㉠ = I 적재값. [단계2] ㉡ = 다운카운트 파형.
- ★ generic `sequential_dff_generic`(D-FF 다중비트+㉠㉡ 시그니처에 걸림)으로 흡수되면 **비동기 SET·RESET 망·NOR 자동재적재 구조를 잃어** 임의 D-FF 상태표로 변질 → 전용 archetype 필수.
- 모드: `exam_similar`=I∈{001,011,111}(value 4·6·7), clk 4. `exam_variant`=I∈{101,011,111}(value 5·6·7), clk=N+1로 **000→재적재(F)를 파형에 노출**(교육 포인트 강화).
- figure 2개: (가) `async_preset_counter_circuit`(전용 fixed-slot 렌더러 — 3 D-FF + 셀별 인버터+AND(Set=F·I·Reset=F·I′) + D=Q̄ 피드백 + 리플 클럭 체인 + 우측 NOR(F). F·I·Q는 net 라벨로 표기해 배선 단순화), (나) `waveform`(클럭 step + Q 빈 트랙(학생 도시) + ㉠·㉡ 마커).
- 파일: `lib/generation/topologies/asyncPresetCounter.ts`(결정론 generator — faithful edge-sim, GPT 없음), `lib/pipeline/runAsyncPresetCounterPipeline.ts`(결정론 2단계 텍스트), `lib/renderers/asyncPresetCounterCircuitRenderer.ts`. classifier는 **`sequential_dff_generic` 앞**에 매치 — 트리거: FF + **비동기 SET**(RESET만인 임용8 ff_with_waveform과 구분) + I 병렬입력(I₀I₁I₂)/구간(㉠㉡). semantic normalize: hasStateTransition=false(스위치 상태쌍 없음, F 자동재적재), 파형·multi-figure 유지.

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
