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
- **SubjectKey** (canonical, 영어): `electronics` / `circuit_theory` / `digital_logic` / `mixed_signal` / `electromagnetics` / `c_language` / `communications` / `pedagogy`
- **SubjectLabel** (UI 표시, 한국어): `전자회로` / `회로이론` / `디지털논리회로` / `복합형` / `전자기학` / `C언어` / `통신` / `교육학` (`SUBJECT_LABEL[key]`) — ★교육학 버튼은 UI에서 옅은 연두색(`lime`, `SubjectSelector.tsx`)
- **TopicKey = "family"** (validator의 "family mismatch"에서 family와 동의):
  - electronics: `opamp` · `bjt_bias` · `bjt_amplifier` · `mosfet_bias` · `mosfet_amplifier` · `diode` · `mixed_signal`
  - circuit_theory: `dc_resistive` · `mesh_analysis` · `nodal_analysis` · `transient_rc` · `transient_rl` · `rlc_response` · `supermesh` · `supernode` · `dependent_source` · `switching_circuit`
  - digital_logic: `kmap_sop` · `kmap_pos` · `combinational_gate` · `flipflop_counter` · `fsm` · `waveform_analysis`
  - **electromagnetics** (회로 아님 — 장·공식 기반): `electrostatics` · `gauss_law` · `capacitance` · `magnetostatics` · `em_induction` · `magnetic_force` · `em_wave`
  - **c_language** (회로 아님 — 코드 분석): `c_output_prediction` · `c_pointer_array` · `c_control_flow` · `c_function_recursion` · `c_struct_bitwise` · `c_string`
  - **communications** (회로 아님 — 신호·정보이론): `comm_analog_modulation` · `comm_digital_modulation` · `comm_sampling_pcm` · `comm_information_theory` · `comm_signal_spectrum` · `comm_noise_snr`
  - **pedagogy** (회로 아님 — 교육 이론·논술형, figure 없음): `ped_psychology` · `ped_curriculum` · `ped_evaluation` · `ped_method_tech` · `ped_administration` · `ped_sociology` · `ped_philosophy_history` · `ped_counseling`
- **C언어(c_language)·통신(communications)** — 전자기학에 이은 비-회로 도메인이지만, EM의 결정론 레지스트리와 달리 **GPT 기반 생성**(사용자 지정). 각각 전용 파이프라인(`runCLanguagePipeline`·`runCommunicationsPipeline`)이 원본 분석(주제·해석·개념)을 컨텍스트로 GPT에 count개 문제를 한 번에 요청(`_gptGen.ts`, response_format json_object)해 파싱. route에서 `subjectKey==="c_language"|"communications"`로 회로 dispatch 우회(EM 분기 옆). rules는 requiredFigureRoles=[]·semantic 전부 false(`lib/rules/cLanguage.ts`·`communications.ts`), roleTriggers·validator(isCircuitSubject 아님)는 EM과 동일하게 면제. figure: **C언어=`code_block`**(diagramType, `codeBlockRenderer.tsx` — monospace 코드 블록, React node 직접 반환) / **통신=`comm_diagram`**(`commDiagramRenderer.ts` — kind별 waveform(analytic sine 등 합성)·spectrum(stem)·block(송수신 블록도) SVG). analyzeImage에 `C_LANGUAGE_EXTRACTION_RULES`·`COMMUNICATIONS_EXTRACTION_RULES`(코드/신호 파라미터 보존) 주입. 새 유형은 프롬프트 보강으로 흡수(archetype/레지스트리 추가 불필요).
- **교육학(pedagogy)** — C언어·통신에 이은 비-회로 **GPT 기반 텍스트 도메인**(2026-07-05 추가, 사용자 지정). 교원임용 교직/교육학 논술·전공 문제(교육심리·교육과정·교육평가·교육방법공학·교육행정·교육사회학·교육철학교육사·생활지도상담). ★**figure(그림) 자체가 없음** — 회로·코드·파형·스펙트럼 어느 것도 안 씀, 순수 텍스트(content·question·answer·solution)만. 전용 파이프라인 `runPedagogyPipeline`(`_gptGen.ts`로 count개 한 번에 요청, `figureVariants:[]` 고정)이 원본 분석을 컨텍스트로 GPT 생성. route에서 `subjectKey==="pedagogy"`로 회로 dispatch 우회(통신 분기 옆). rules `lib/rules/pedagogy.ts`(requiredFigureRoles=[]·semantic 전부 false), **roleTriggers 면제 가드에 pedagogy 추가 필수**(안 하면 `main_circuit`이 required로 붙어 `missing_figure_variant` 오류 — EM·C언어·통신과 동일 처리). validator는 isCircuitSubject 아님(missing_topology 면제). analyzeImage에 `PEDAGOGY_EXTRACTION_RULES`(영역·이론·학자 보존, 억지 소자·그림 금지) 주입. UI: `SubjectSelector.tsx`에서 교육학 버튼만 옅은 연두색(`lime`). 새 세부영역은 프롬프트 보강으로 흡수(archetype/레지스트리 추가 불필요).
- **전자기학(electromagnetics)** — 회로(netlist·MNA)가 아닌 첫 도메인. 생성은 **공식 레지스트리**(`lib/generation/topologies/electromagnetics.ts`의 `EM_FORMULA_REGISTRY`) 기반 결정론(GPT 없음): 물리법칙 등록 + 파라미터 변형 + 정답 재계산. 그림은 **EM 전용 도식 렌더러**(`emFieldRenderer.ts`, diagramType `em_field_diagram`). route에서 `subjectKey==="electromagnetics"`로 회로 dispatch 체인 우회. validator는 비-회로 subject라 missing_topology 면제. exam_similar=수치변형 / exam_variant=구하는 양 변경(전계→전위·C→에너지 등). 새 EM 유형은 archetype 추가가 아니라 **레지스트리 항목 추가**([[feedback_universal_path]]).
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

# 🚨 반복 실패 방지 규칙 (2026-07-26 — 같은 실수가 6번 반복돼 명문화)

## 1. stale analysis — 개별 안전망 대신 **generate에서 재분류**
프론트(`app/page.tsx`)가 analyze 결과를 React state에 담아 "생성"마다 재사용한다. 그래서 **분류기를 고쳐도
이미 만들어진 circuitType이 그대로 넘어와** 전용 archetype이 있는데도 generic으로 샌다.
(실측: jk_sync_counter·active_lowpass_filter·switched_rc_dc·dff_state_design·ac_superposition·opamp_finite_gain_block)
- ✅ `app/api/generate/route.ts` 상단에서 **`classifyCircuitType`을 다시 돌려** 결과가 다르면 교체한다
  (`stale_circuit_type_reclassified` 로그). 분류기가 단일 진실 공급원, 캐시된 값은 낡은 사본일 뿐.
- 개별 `detectXxx` 안전망은 **과목 보정(subjectKey) 등 재분류가 못 하는 일**에만 남긴다.
- ❌ 새 archetype마다 안전망을 하나씩 늘리는 방식(6번 반복한 실수).

## 1-2. 안전망은 **generic일 때만** 개입 — 올바른 분류를 덮어쓰지 마라
route의 `detectXxx` 안전망은 "generic 경로로 떨어진 경우 구제"가 목적이다. 조건이 넓으면
분류기가 **이미 정확한 전용 archetype**을 골랐는데도 덮어쓴다(같은 날 2건 발생):
- `counter_dac_comparator`(임용 8번) → `jk_sync_counter` 안전망이 덮어씀 → DAC·비교기 소실
- `opamp_positive_feedback`(임용 6번) → `opamp_finite_gain_block` 안전망이 덮어씀
- ✅ `canCoerce` 가드: **현재 타입이 generic/미지정일 때만** 안전망 실행 (`GENERIC_CIRCUIT_TYPES`).
  건너뛰면 `coercion_skipped_specific_type` 로그가 남는다.
- ✅ 새 안전망을 만들 땐 **형제 archetype 양보 가드**를 함께 넣는다(예: JK 안전망은 DAC·비교기면 양보,
  finite_gain 안전망은 정귀환이면 양보).
- ❌ "내 유형 신호가 있으면 무조건 교정" — 형제 유형이 같은 소자·키워드를 공유한다.

## 1-3. inventory가 비면 **한 곳에서 합성** — 분기마다 fallback 금지
`extractComponentInventory`가 `schema_fail`로 빈 배열을 주면 `componentInventory`가 비고,
분류기의 **인벤토리 게이트 분기가 전부 미발화**한다(실측 2건: 임용 9번 RLC→`unsupported`,
임용 10번 NMOS 캐스코드→`dc_dependent_source`).
- ✅ `lib/analysis/inventoryFromText.ts`가 분석 텍스트에서 **최소 inventory를 합성**하고,
  `app/api/analyze/route.ts`가 inventory가 빌 때만 이를 사용(`inventory_inferred_from_text` 로그).
  값 있는 소자는 단위로(1kΩ·2H·10V·0.1mA), 값 없는 소자는 이름으로("커패시터 C" → C 1개),
  MOSFET/BJT 개수는 M₁·M₂·M₃ / Q1·Q2 표기로 추정한다.
- ❌ 분기마다 "인벤토리 비면 텍스트로" fallback을 덧붙이는 방식(두더지잡기).

## 1-4. 개념형(이름 쓰기) ↔ 계산형 판별선 = **수치 given 유무** (2026-07-27, 회귀 2회)
"설명을 읽고 원리·법칙의 이름을 쓰는" 개념 문항은 회로 dispatch를 통째로 우회해야 한다
(`runConceptNamingPipeline`, figure 없음). 그런데 판별을 잘못 걸어 **양방향으로 두 번** 사고가 났다:
- **방향 A(개념형을 계산으로)**: 문구("이름을 쓰시오"·㉠ 마커)에 조건을 걸었더니 Vision이 그 표현을
  안 쓴 실행에서 통째로 새어, 접지로만 이어진 회로 4개짜리 그림 + "V_1…V_13을 구하시오"가 생성됐다.
- **방향 B(계산형을 개념으로)**: 보완한다고 "법칙 이름 2개 이상이면 설명형" 규칙을 넣었더니
  **테브난 정리 + 최대 전력 전달**을 쓰는 계산 문제(임용 6번)가 개념형으로 가로채여
  "원리 이름 쓰기" 문항이 생성됐다(사용자 신고 2회).
- ✅ **판별선은 수치 given 유무**: 계산 문제는 5V·3kΩ 같은 수치가 반드시 있고, 개념 문항은 **하나도 없다**.
  개념 원본에 예시 회로 그림이 딸려 Vision이 소자 12개를 뽑아낸 실행에서도 **값은 전부 비어 있었다**(실측).
  → `hasQuantitativeGivens`(인벤토리 값 + 본문 단위수치)를 **모든 구조 신호보다 먼저** 배제 조건으로 둔다.
- ✅ **요구 판정은 topic·interpretation만** 본다. `relatedConcepts`·`fillInTheBlanks`는 Vision이 만든
  **빈칸 학습용 문장**이라 개념 문항에도 "전압 강하를 계산하는 데 쓰인다"가 섞인다(실측 1/5 실패 원인).
- ✅ **정의 관형절 ≠ 요구**: "…값의 합으로 전류를 **구하는 중첩의 원리**"는 법칙의 정의다.
  종결·명령형(`구하시오·계산한다·구하는 문제`)만 요구로 인정한다(`TASK_DEMAND_RE`).
- 검증: `scripts/smokeConceptNamingStructural.mjs` **18/18**(실측 Vision 요약 5종 + 계산형 회귀 6종:
  테브난+최대전력·중첩+전력·법칙2개+구하시오). E2E: 개념 원본 10/10, 테브난 원본 4/4.

## 1-4-2. 개념형 판별선(수치 given)은 **디지털 설계 문항에 통하지 않는다** (2026-07-29 실측)
사용자 신고("이게 원본인데 다른 문제가 생성돼"): JK-FF 2개 여기표 + 조합논리 J_A(SOP→분배법칙→POS)
원본이 `circuitType=unsupported`("원리·법칙의 명칭을 쓰는 개념형(수치 계산 없음)")로 분류돼
`universal_digital`로 코어션됐다. 원인 2가지가 겹침 — 본문의 **"분배 법칙"** 이라는 낱말과 **㉠~㉣ 마커**.
- ★ 판별선 "수치 given 유무"는 **아날로그 회로 기준**이다. 디지털 설계 문항(여기표·상태표·진리표·불 함수·
  카르노맵)은 0/1만 다뤄 **수치 given이 원래 없다** → 개념형 가드에 통째로 걸린다.
- ✅ `isPrincipleNamingAnalysis`에 **도출·설계 구조 신호 양보 가드**(`DESIGN_STRUCTURE_RE`: 여기표·상태표·
  진리표·불 함수·논리식·카르노맵·최소항/최대항·간략화·SOP/POS·플립플롭·순서/조합 논리)를 추가.
  진짜 명칭형("…의 이름을 쓰시오")은 앞의 `isPrincipleNamingText` 빠른 경로가 그대로 통과시킨다.
- 검증: `smokeConceptNamingStructural` **18/18** 유지 + 원본 재분류 `unsupported → fsm`(JK 상태표 모드)
  + E2E 양모드 issues=0.

## 1-4-3. 답의 소수는 **분수로 표기** — 생성 후 한 곳에서 (2026-07-29 사용자 요청)
"답이 소수점으로 나오면 차라리 분수로." 유형마다 포맷터를 넣으면 반드시 빠지는 곳이 생기므로
`lib/format/fraction.ts`의 `fractionizeText`를 **route의 검증 직전 한 곳**에서 `answer`·`solution`에만 적용한다.
- ✅ 2단계 변환 (사용자 추가 지침 "지저분하면 그냥 분수로 나타내도 돼"):
  ① **정확히** 떨어지는 분수(분모 ≤ 400): 6.75 → 27/4, 26.675 → 1067/40.
  ② 소수 3자리로 **반올림된 값 복원**(분모 ≤ 60, 오차 ≤ 1.5e-3): 9.767 → 293/30, 0.534 → 8/15.
- ✅ "2.000"·"5000.00"처럼 소수점 뒤가 0뿐이면 정수로 정리.
- ✅ **각도는 예외** — `158.199°`는 그대로(페이저 위상은 소수 표기가 관례).
- ✅ 본문·조건은 **건드리지 않는다** — 주어진 소자 값(0.7V·0.2µF)은 소수 표기가 관례다.
- 검증: `scripts/smokeFractionText.mjs` **16/16**.
- ★★ **생성기가 값을 반올림해서 넘기면 이 변환기가 틀린 분수를 "복원"한다** (2026-08-04 실측):
  `extractTheveninNetlist`가 `round3`로 P_max를 **0.289**로 만들어 넘겼더니 2단계(근사 복원)가
  **9/31**(≈0.29032)을 골랐다 — 실제 값은 **81/280**(≈0.28929)이고 오차 1.0e-3이 허용치 1.5e-3 안이라
  조용히 통과했다(정답이 틀린 채로 사용자 화면까지 갔다).
  ⇒ **생성기는 반올림하지 말고 정확한 실수를 그대로 둔다** — 그러면 1단계(정확, 분모 ≤ 400)가 맞게 찾는다.
  표시용으로 미리 분수를 확정할 땐 `decimalToFraction(x, 400, **0**)`처럼 **근사 단계를 끈다**
  (approxDen=0). 근사 복원은 "이미 반올림된 값"에만 의미가 있고, 정확한 값에 쓰면 값을 망친다.

## 1-4-5. **미지 소자를 기호로 들고 있는 유형**은 인벤토리 기호 값이 최후의 판별선 (2026-08-04 실측)
사용자 신고("원본과 많이 다르다 / 두 번째 그림인 그래프도 없다"): 임용 9번(종속전원 테브난 + V-I 그래프)에서
로그가 `withGraph:false, hasUnknownR:false` — **(나) 그래프가 통째로 빠지고, [단계 1]에서 학생이 구해야 할
미지 저항 R에 값(3Ω)이 그대로 노출**됐다. 그림만 봐도 답이 보이는 문항이 나간 것이다.
- 원인: `originalHasViGraph`가 **낱말**(그래프·(나)·I_sc·절편)에만 걸려 있었는데, Vision이 그 회차에
  하나도 쓰지 않았다. 같은 원본의 다른 회차 요약엔 "그래프"가 멀쩡히 있었다(비결정성).
- ✅ 구조 신호 추가: **인벤토리에 값이 기호인 저항**(`{type:"R", value:"R"}`)이 있으면 이 형식이다.
  그 저항값을 (나) 그래프의 절편으로 역산하는 것이 문항의 뼈대라, 표현이 어떻게 흔들려도 남는다.
  ※ 전원(V·I) 값은 제외한다 — 페이저 표기가 기호처럼 보인다.
- ★ 일반화: `ac_thevenin_design_ab`(a·b)와 **완전히 같은 교훈**이다 — 미지 소자를 기호로 들고 있는 유형은
  Vision이 요구 문장을 흘려도 **인벤토리의 기호 값**만은 남는다. 낱말 조건 옆에 항상 이 신호를 함께 둘 것.
- 검증: `scripts/smokeTheveninViGraphSignal.mjs` **10/10**(신고 회차 재현 4 + 낱말 경로 무회귀 2 + 음성 4) /
  `smokeOriginalRouting` 54/54 / **신고 회차 재현 E2E**: (나) 그래프 복귀 · R이 "R"로 표기 · i_x 화살표 표시 ·
  정답 손검산 일치(V_th=15/4·R_th=11/2·I_sc=15/22·P_max=225/352).

## 1-4-4. 개념형 가드는 **도출·설계 구조 신호에 양보**한다 (2026-07-29, 실측 2건)
"법칙/원리" 낱말 때문에 계산·설계 문항이 개념 명칭형(`unsupported` → 텍스트 경로)으로 잡혀
회로/EM 경로를 통째로 우회한 사고가 연속 2건 났다:
- **2025 전기 A-8**(JK 여기표+불함수): 본문의 "분배 **법칙**" + ㉠ 마커 → universal_digital로 변질.
  → `DESIGN_STRUCTURE_RE`(여기표·상태표·진리표·불함수·논리식·카르노맵·SOP/POS·플립플롭…) 양보.
- **임용 11번 EM**(면전하+선전하 합성 전계): "가우스 **법칙**"+"중첩의 **원리**" 두 개가 열거돼
  `countDistinctLaws ≥ 2` 규칙에 걸림 → **그림 없는 개념 문제**로 생성(EM 파이프라인 자체가 실행 안 됨).
  → `DERIVATION_STRUCTURE_RE`(면전하·선전하·전계·자속·유전율·기전력·페이저·임피던스…) 양보.
- ★ 일반화: **EM·물리 문항은 원래 법칙을 2개 이상 인용하고 given이 기호(ρ_s·ρ_l)** 라 "수치 given" 판별선에도
  안 걸린다. 개념 명칭형은 **명시 문구**(“…의 이름을 쓰시오”)로 잡고, 구조 신호가 보이면 양보하라.
- 검증: `scripts/smokeConceptGuardYield.mjs` **6/6** + 기존 `smokeConceptNamingStructural` **18/18**·
  `smokeConceptNaming` **8/8** 유지.

## 1-5-2. 실측 재발 (2026-07-29) — MUX 등가 구현이 `universal_digital`에 가로채임
사용자 신고("생성했던 문제인데 유사문제가 생성 안돼", 임용 5번 조합논리↔4×1 MUX). 전용 archetype
`mux_implementation`은 **이미 있었고 발문도 원본과 동일**(POS→SOP→㉠·㉡)인데, 분류에서
**넓은 `universal_digital` 분기(N변수/M함수)가 위에 있어** 가로챘다(로그: reclassified=universal_digital,
figures=truth_table,logic_network). ★ 1-5 규칙의 재발 사례 — 새 archetype을 넣을 때만이 아니라
**기존 archetype 위에 넓은 분기가 추가될 때도** 같은 사고가 난다.
- ✅ 조합논리+MUX 등가 시그니처를 **0-PRE(subject 무관) 최상단**으로 (순차·플립플롭이면 양보).
- ✅ 기존 MUX 분기에도 **순차 양보 가드** 추가 — MUX 낱말만으로 잡아 D-FF/SR-FF + MUX 순차 원본을
  조합 MUX 문제로 변질시키던 잠재 버그를 함께 수정. dff_mux 분기 키워드에 띄어쓰기 변형("순서 회로") 추가.
- ✅ `generateMuxImplementation`이 `mode`를 무시해 **유사와 변형이 완전히 같은 문제**였던 것도 수정
  (풀 오프셋으로 모드별 다른 불 함수).
- 검증: `scripts/smokeMuxImplRouting.mjs` **7/7**(실측 요약 3과목 + 표현 변형 + 형제 회귀 3종) +
  디지털 형제 스모크 무회귀(dffStateDesign 6/6·ffMixed 7/7·jkExcitation 28/28) + 원본 E2E 양모드 issues=0.

## 1-5. 전용 archetype 분기는 **넓은 조건 분기보다 위**에 둔다 (2026-07-27, 4연속 오탈취)
"T 플립플롭 + JK 플립플롭 응용회로"(임용 9번, FF 2개 + 상태표 ㉠~㉣ + 파형)의 전용 분기
(`flipflop_mixed_app`)가 digital 섹션 **한참 아래**에 있어, 위쪽의 넓은 조건 분기들이 차례로 가로챘다:
`ff_with_waveform`("FF+파형") → `jk_sync_counter`("JK만") → `sequential_dff_generic`("D-FF 다중비트")
→ `waveform_analysis`. 그 결과 **플립플롭이 1개인 회로**가 생성됐다(사용자 신고).
- ❌ 가로채는 분기마다 양보 가드를 하나씩 붙이는 방식 — 실제로 세 번 붙였는데 네 번째가 또 잡았다(두더지잡기).
- ✅ **전용 시그니처를 0-PRE(subject 무관)로 최상단에** 올린다: `T-FF & JK-FF 둘 다 언급 + MUX 아님`
  → flipflop_mixed_app. 두 종류 공존은 이 유형 고유라 단일 종류 형식(임용 8번 ff_with_waveform·
  JK 카운터·D-FF 설계)은 걸리지 않는다.
- 일반화: **넓은 조건(“FF+파형” 같은)을 가진 분기 위에 전용 archetype이 없으면 반드시 샌다.**
  새 전용 archetype을 붙일 땐 그 위에 자기보다 넓은 분기가 있는지 먼저 확인할 것.
- 검증: `scripts/smokeFfMixedRouting.mjs` **7/7**(신고 재현·표현 변형·임용8 회귀 + 전용 figure가
  T_A·J_B·K_B·Q_A·Q_B를 모두 그리는지 구조 단언). E2E: 원본 4/4 flipflop_mixed_app
  (figure 3종 ff_mixed_app_circuit·truth_table·waveform, 이슈 0).

## 1-6. figure role 요구는 **topicKey 단독으로 강제하지 않는다** (2026-07-29 실측 신고)
`missing_figure_variant: state_before / state_after` 2건이 사용자 화면에 떴다. 로그:
`route=ac_superposition_pipeline, topicKey=switching_circuit, totalIssues=2`.
원인 = `roleTriggers.isStateTransitionProblem`이 **`topicKey === "switching_circuit"` 하나만으로** 상태쌍을
무조건 요구한 것. 그런데 그 문제는 **스위치가 없는 페이저 정상상태**(단일 회로 figure)라 생성기가 상태쌍을
만들 수가 없다 — Vision의 topicKey 오판이 곧바로 검증 실패로 이어졌다.
- ✅ 수정: `topicKey === "switching_circuit"`이어도 **semantic이 명시적으로 `hasStateTransition === false`면
  요구하지 않는다.** 어떤 archetype이 상태쌍을 안 만드는지는 route의 semantic normalize가 이미 알고 있으므로
  (단일 진실 공급원) 그 판단을 role trigger가 존중한다. + `ac_superposition`·`ac_parallel_branches`의
  normalize에 `hasStateTransition:false` 추가(기존엔 waveform만 껐다).
- ❌ archetype마다 role 예외를 하나씩 넣는 방식(두더지잡기).
- 검증: `scripts/smokeStatePairTrigger.mjs` **5/5**(신고 재현 + 진짜 스위칭·semantic 미지정·본문 스위치 회귀).
- ★ 일반화: **Vision이 준 topicKey는 약한 신호다.** figure role처럼 "생성기가 만들 수 있는가"에 직결된 요구는
  구조 신호(semantic normalize·인벤토리)로 판단할 것.

## 1-7. ★★ 분류기·감지기를 건드리면 **통합 라우팅 회귀**를 반드시 돌린다 (2026-07-29 도입)
```
node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeOriginalRouting.mjs
```
- **왜**: 이번 주 신고의 대부분이 "전용 archetype은 있는데 **나중에 추가된 넓은 분기·generic 경로가
  가로챈**" 사고였다(JK 여기표·MUX·시퀀스 검출기·Wien·스위치 RC 테브난·시변 자속…). 개별 archetype
  스모크는 자기 유형만 보므로 **남의 유형 잠식은 조용히 통과**한다. 이 스모크는 실측 Vision 요약으로
  "원본 → 기대 archetype"을 한 번에 검사한다(현재 15종, 회로·디지털·전자·EM 혼합).
- **새 archetype/레지스트리 항목을 추가하면 여기에 원본 한 줄을 추가**한다(추가 안 하면 다음 사람이
  그 유형을 잠식해도 아무도 모른다).
- 스모크의 dispatch 모델은 **route의 실제 순서와 같아야** 한다 — 다르면 거짓 실패가 난다
  (예: `detectSwitchedRlDepI`는 circuitType과 무관하게 체인 앞에서 먼저 평가된다).
- 짝이 되는 런타임 신호: route가 generic 경로로 dispatch하면 `generic_dispatch_warning` 경고를 남긴다.
  신고가 들어오면 **로그에서 이 한 줄부터** 확인할 것(원인 후보가 즉시 나온다).

## 2. 분류 조건은 **리터럴 키워드가 아니라 구조·절차 시그니처**로
Vision은 같은 원본도 실행마다 다르게 요약한다. 단어 하나에 의존하면 그 실행에서 통째로 샌다.
- 실측: "중첩"을 안 쓰고 "전류원 개방·전압원 단락"으로만 서술 → `universal_ac`로 샘
- 실측: 종속원 값이 `2i_x`(첨자 O)만 인정 → `2i`(첨자 X)를 놓쳐 generic max_power로 샘
- 실측: `relatedConcepts`에 붙은 "Mealy 머신" 태그 하나로 자율 상태기계를 fsm에 넘김
- ✅ 절차·구조·인벤토리로 판정하고, 개념 태그는 **양보 근거로 쓰지 않는다**.

## 3. 검증은 **N회 반복 측정** — 1회 성공으로 "된다"고 말하지 않는다
Vision·GPT 비결정이라 표본 1개는 의미가 없다([[feedback_nondeterministic_repro]]).
- ✅ 최소 3회 돌려 **성공률로 보고**(예: "3/3", "2/3 — 1회는 종속원 누락")
- ❌ 1회 성공 후 "정상입니다" (실측: 그 직후 사용자 화면에선 실패)

## 4. 비용 — E2E 남발 금지
analyze+generate 1회에 Vision·GPT가 여러 번 호출된다. 반복 검증은 비싸다.
- ✅ 기본은 **API 없는 정적 테스트**(`node --experimental-strip-types --import ./scripts/_aliasHook.mjs`)로
  분류기·검증기·렌더러를 직접 호출해 확인
- ✅ E2E는 마지막에 1~3회만
- `scripts/_aliasHook.mjs`가 `@/` 별칭·확장자 생략을 해석해 준다.

## 5. 렌더러는 **표현 못 하는 회로를 가로채지 않는다**
전용 렌더러의 detect가 너무 넓으면 종속원·부하·단자를 못 그리면서 회로를 삼킨다(실측: `fourNodeImyong`).
- ✅ detect 단계에서 표현 불가 요소(종속전원·loadPlaceholders·measurementMarks 등)를 만나면 **null 반환**
- ✅ 검증 실패 시 raw `<pre>` 에러를 화면에 노출하지 말고 generic으로 fallback + validator가 보고

# 프로젝트 전반 절대 규칙
0. **구조·원리 유사성** — 생성하는 모든 문제는 원본의 구조와 원리를 반드시 유지한다. 같은 학습 목표를 시험. 모드는 변형 강도만 조절.
0. **규칙 기반 생성 (예시 기반 금지)** — 박혀 있는 "문제 예시"를 베끼지 말 것. 출제 규칙(KVL, 등가변환, 노드해석 등)을 원본에 적용해서 새로 만든다. 양식·포맷의 "적용 예시"는 참고 가능.
0. ★★ **객관식 원본 → 3단계 단계별 주관식** (사용자 지정 2026-08-12) — 아래 전용 섹션 참조.

# 🚨 절대 원칙 — 객관식 원본은 **3단계 단계별 주관식**으로 출제 (2026-08-12 사용자 지정)

원본이 보기 ①~⑤ 중 하나를 고르는 **객관식**이면, 생성물은 **예외 없이**
〈해석 절차〉 **[단계 1] → [단계 2] → [단계 3]** 의 단계별 주관식(서술형)으로 낸다.
구조·원리·학습 목표는 원본 그대로 유지하고(절대규칙 0) **형식만** 바꾼다 — 답 고르기 → 과정 서술.

## 표준 3단계 분해
```
[단계 1] 적용할 법칙·식을 기호로 세운다           (예: E = kQ/r², C = ε₀ε_rA/d, Z_TH = …)
[단계 2] 중간량을 구한다                          (단위 환산·중간 물리량·중간 결과)
[단계 3] [단계 1]의 식에 대입해 최종 값을 단위와 함께 구한다
```
원본이 이미 여러 값을 순서대로 묻는다면 **그 순서를 단계로 쪼갠다**(억지로 새 요구를 만들지 않는다).

## 구현 (계약을 한 곳에서 정의 — 유형마다 문구를 새로 쓰면 반드시 어긋난다)
- `lib/format/threeStep.ts` — `buildStepQuestion`/`buildStepAnswer`(조립), `isThreeStepText`/`countStepMarkers`(검사),
  `hasChoiceList`(생성물 **엄격** 판정), `looksLikeChoicePrompt`(원본 **민감** 판정), `MULTIPLE_CHOICE_TO_THREE_STEP_RULE`(GPT 프롬프트 문구).
- `lib/analysis/multipleChoice.ts` — `detectMultipleChoiceOriginal(analysis)`. 세 갈래 신호(원문자 마커 2개+·선택 요구 문구·형식 언급)
  중 하나만 맞아도 객관식으로 본다(Vision 요약이 흔들려도 잡히도록 — CLAUDE.md 규칙 2).
- **결정론 경로(EM 레지스트리 등)**: 생성기가 코드로 3단계를 보장한다. `threeStepBlock({ask,ans,sol}×3)` 헬퍼로 조립.
- **GPT 경로**(system prompt·c_language·communications·pedagogy): 프롬프트에 계약 주입.
- **검증기**(`validateProblem`): `multiple_choice_output`(생성물이 다시 객관식) ·
  `missing_three_step_question`(객관식 원본인데 발문이 3단계 아님)을 **보고**한다(차단 아님 — 조용한 실패 방지).

## ★ 판정 강도를 용도별로 다르게 둔다 (실측 오탐)
- **생성물 검사는 엄격하게**: "…변화로 **옳은 것을** 〈해석 절차〉에 따라 구하시오"는 **서술형**이다.
  낱말 "옳은 것"만으로 잡았더니 `active_lowpass_filter`가 위반으로 찍혔다 → 고르는 행위(고르시오·고른 것은·보기 중)
  또는 **물음표로 끝나는** 선택 발문, 또는 원문자 3개 이상만 위반으로 본다.
  (그 파이프라인의 남은 객관식 어투도 함께 서술형으로 고쳤다.)
- **원본 판정은 민감하게**: 놓치면 계약이 아예 발동하지 않으므로 낱말만으로도 인정한다.

## ★★ 후속 (2026-08-12, 같은 날 2차 신고) — **발문만 단일 물음**인 generic 경로
사용자 신고: *"해설은 단계별로 되어있는데, 문제는 단계별로 안되어 있어 / 근데 질문은 Vdc값과 Vrms값 두개만 물어봐"*
(주기 신호 v(t)=3sin²(…)의 직류값·실효값 문항, `circuitType=unsupported` → **generic GPT 경로**).
- **원인은 프롬프트 예시였다**: 각 generic 텍스트 라이터(`lib/generation/topologies/*TextWriter.ts`)의
  `[출력 JSON]` 예시가 `"question": "…를 구하시오 (한 문장)"`이라 **가까이 있는 예시가 SYSTEM_PROMPT의
  3단계 규칙을 이겼다**. 해설은 단계별로 쓰면서 발문만 한 줄인 문항이 그대로 나갔다.
- ✅ 조치 3겹:
  ① `STEP_QUESTION_RULE`(`lib/format/threeStep.ts`)을 **16개 라이터의 `[규칙]` 블록 첫 줄**에 주입 —
    예시 **뒤에** 오는 규칙이 예시를 덮어쓴다. "묻는 양이 1~2개여도 [단계 1]에 정의식 세우기를 넣어 3단계로".
  ② 검증기 `question_not_step_wise` — 정답·풀이가 [단계 N]인데 발문에 없으면 위반. **critical**로 올려
    GPT 경로가 재생성하게 한다(`_core`의 CRITICAL_RULES).
  ③ SYSTEM_PROMPT에 [발문↔정답 단계 일관성] 절 추가(본문 끝 문장과 발문 중복 금지 포함 — 실측 화면에 중복이 있었다).
- ❌ **역방향(발문 3단계 + 정답 한 줄)은 규칙으로 만들지 않는다**: `rlcStep`처럼 솔버가 정답을
  한 줄로 확정(`enforcedAnswer`)하는 경로가 많아 정상 동작이 위반으로 찍힌다(실측 smokeAll **29/40**으로 하락).
  프롬프트로만 권한다. ★ 교훈: **텍스트 규칙을 critical로 올릴 땐 그 텍스트를 GPT가 실제로 바꿀 수 있는지**
  먼저 확인할 것 — 코드가 확정하는 필드에 critical을 걸면 재시도만 3회 소모하고 그대로 실패한다.
- 검증: `smokeAll` **40/40**(주입 전 33·역방향 규칙 시절 29) · 재현 확인(rlc_step·thevenin 발문이 3단계로 전환).

## 주기 신호 → 직류값 V_dc·실효값 V_rms (임용 36번 회로이론 — `periodic_signal_dc_rms`) 전용 archetype

- 원본: `v(t) = 2cos²(1000πt + π/2) [V]`의 **V_dc와 V_rms를 고르는 객관식**(정답 ① V_dc=1, V_rms=√(3/2)).
  ★★ **회로도 그림도 없다** — 수식 한 줄이 전부다.
- ★ 물리(닫힌형, GPT 없음): cos²θ=(1+cos2θ)/2 → `v(t) = m + m·cos(2ωt+2φ)`, m=A/2.
  **V_dc = m**, `mean(v²) = m² + ½m² = (3/2)m²` → **V_rms = m√(3/2)**. 답은 **ω·φ에 무관**하다(원본이 φ=π/2를 준 이유).
- ★★ **generic 경로 두 개가 번갈아 가로챘다**(사용자 신고 2026-08-12):
  ① 인벤토리가 비니 `unsupported` → **개념 명칭형**이 가져가 *"㉠, ㉡에 해당하는 원리의 이름을 쓰시오"* 생성,
  ② 회로 경로로 가면 원본에 **없는 R₁·R₂·V₁ netlist**를 지어내 "직류값·실효값"만 겨우 남은 문항이 됐다.
  ⇒ 회로 솔버로 흡수 불가한 **수식 도메인**이라 전용 archetype이 정당하다([[feedback_universal_path]]의 예외,
  `logic_condition_sop`(그림 없는 디지털) 선례). 분류기 **0-PRE는 개념 명칭형 가드보다도 앞**,
  route dispatch도 **개념 명칭형 분기 앞**에 둔다.
- 모드: **exam_similar**=원본 형태(A·cos²/sin², 원본이 sin²이면 `trigFnFromAnalysis`로 표기 보존) /
  **exam_variant**=**두 가족을 번갈아** 낸다(사용자 지정 2026-08-12 "sin² 함수로도 만들어서 내줘"):
  · index 짝수 → **삼각함수 교환** `A·sin²(ωt+φ)`(원본이 sin²이면 cos²) — 항등식이
    `sin²θ=(1−cos2θ)/2`로 바뀌어 [단계 1]의 부호가 달라진다. 값 풀은 유사와 겹치지 않게 A∈{4,6,8,10}.
  · index 홀수 → 직류 오프셋 정현파 `B + A·cos(ωt+φ)` → V_dc=B, V_rms=√(B²+A²/2).
  ★ 가족 선택에 **seed를 섞지 마라**: `generateInParallel`이 `seed = base + i·7919`를 주는데 7919+1이 짝수라
    `(i+seed)` 패리티가 i에 무관해져 **한 배치가 통째로 한 가족**으로 나왔다(실측 count=3 → 3개 다 오프셋).
    가족은 **index만**으로 정한다.
- ★ 값은 규칙 열거+필터: 유사는 **A 짝수**(V_dc 정수), 변형은 **B²+A²/2가 정수**이고 근호가 깔끔한 것만.
  **원본 튜플(A=2, ω=1000π, φ=π/2) 제외**.
- ★ 표기 gotcha 2건(둘 다 실측): ① 위상 2배를 **약분**할 것(π/6 → `2π/6`으로 찍혔다),
  ② LaTeX 조각은 반드시 `\( \)` 안에 — 밖에 두니 `\,[\mathrm{V}]`가 화면에 원문으로 나왔다.
  √(3/2)는 소수로 쓰지 않는다(전역 분수 변환기가 뭉갠다 — 1-4-3).
- figure 없음: route에서 `requiredFigureRoles=[]`로 해제(개념 명칭형과 같은 처리). validator는 figs=0이면 missing_topology 미발화.
- 파일: `lib/generation/topologies/periodicSignalDcRms.ts`(생성기 + 공용 매처)·
  `lib/pipeline/runPeriodicSignalDcRmsPipeline.ts`(3단계 + `detectPeriodicSignalDcRms`).
  types·classifier(0-PRE)·route(figure 면제 + dispatch)·`smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 / `scripts/smokePeriodicSignalDcRms.mjs` **178/178**(라우팅 4종+3과목 + 형제 양보 6종 +
  **생성물 48개를 수치 적분으로 독립 재검산** + 원본 값 재현·원본 튜플 미생성 + 위상 약분·LaTeX 노출 0 +
  3단계·그림 없음) / `smokeOriginalRouting` **59/59** / `smokeConceptNamingStructural` 18/18 무회귀 /
  **원본 이미지 E2E 양모드 issues=0**(유사 V_dc=1·V_rms=√(3/2), 변형 V_dc=2·V_rms=2√3 — 수치적분 일치).

## 적용 결과 (2026-08-12)
- EM 레지스트리 **40항목 전부** 3단계로 통일 — 그 전에는 21항목이 단일 발문("…를 구하시오.")이었다.
  임용 전자기학 기출은 대부분 객관식이라 이 도메인에 몰려 있었다.
- 회로·디지털 전용 archetype은 이미 3단계였다(logic_condition_sop·active_lowpass_filter·function_generator·
  zener_bjt_regulator·opamp_series_regulator·bjt_characteristic_curve 등 확인).
- 검증: `scripts/smokeThreeStepMultipleChoice.mjs` **113/113**
  (EM 40항목×18조합=720건 3단계·보기 0 + 헬퍼 경계 + 감지기 양·음성 + 검증기 발화/미발화 + 임용 24번 물리 재검산) /
  `smokeOriginalRouting` 58/58 · EM 형제 스모크 전부 무회귀 · `smokeAll` 40/40 · tsc 0.
- ※ `smokeTwoPointCharges`의 "풀이 4단계 이상" 단언은 계약에 맞춰 **정확히 3단계**로 갱신했다.

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

## tff_dac_chain (임용 10번 — FF 체인 + R-2R DAC + OPAMP) — ★ **D 플립플롭 → T 플립플롭** (2026-08-04 사용자 지정)
- 원본: 입력 A가 **D 플립플롭 3개(D_0~D_2)** 를 거쳐 시프트되고, Q_0·Q_1·Q_2가 R-2R 저항망 + 연산증폭기로
  아날로그 V_o가 된다. 〈해석 절차〉 [1] ㉠ 구간의 Q_1 논릿값(시간순) [2] Q들에 의한 V_o 식 [3] ㉡ 지점의 V_o.
- ★★ **사용자 지정: 배선은 그대로 두고 소자만 T-FF로 교체해 출제한다** — `T_0 = A`, `T_b = Q_{b-1}`, 공통 클럭.
  · D-FF는 `Q ← 입력`이라 **한 클럭 지연**일 뿐이지만, T-FF는 **여기(excitation)** 라
    **Q_b(t+1) = Q_b(t) ⊕ T_b(t)** 로 학생이 매 클럭 토글을 추적해야 한다(교육 포인트가 깊어진다).
  · 원본 **인식**은 여전히 `D 플립플롭·시프트` 키워드로 한다(원본 이미지가 D-FF다). 생성물만 T-FF.
    형제 `tff_state_design_input`(임용 12번)과 같은 선례.
- ★ **동기 회로다 — 갱신에 반드시 직전 클럭의 Q를 쓴다**: `next[0]=q[0]^A; next[b]=q[b]^q[b-1]`.
  한 단씩 순차 대입하면(이미 갱신된 값을 다음 단에 쓰면) 리플 회로가 되어 답이 달라진다.
- ★ 구조 키를 `d_shift_register` → **`tff_dac_chain`** 으로 개명했다(내부 4곳). 이름이 동작과 어긋나면
  다음 사람이 시프트 동작으로 착각한다 — 이 저장소에서 반복된 사고.
- ★ **표기 gotcha**: 1 LSB = V_high/2^bits라 5/8·5/4 같은 분수가 되는데, 소수(1.25)로 적으면
  route의 전역 분수 변환기(1-4-3)가 **단위 없는 것만** 골라 바꿔 같은 문항에 `1.25`와 `5/4`가 뒤섞인다(실측).
  → `vStepTex`(기약분수 문자열)를 generation.values에 실어 **모든 표기를 분수로 통일**한다.
  (`8.75[V]`처럼 단위가 붙은 값은 변환기가 건드리지 않으므로 그대로 둔다.)
- 파일: `lib/generation/topologies/counterDacComparator.ts`(`generateShiftRegisterDac` — TFF 게이트 + 토글 시뮬)·
  `shiftRegisterDacTextWriter.ts`(T-FF 여기 서술 + ㉠ 구간 Q_1 열·㉡ 논릿값을 **정답 파형에서 직접 추출**)·
  `runCounterDacComparatorPipeline.ts`(figure 라벨). 렌더러는 **기존 것 재사용** — `logicNetworkRenderer`가
  `TFF`를 이미 지원해 T 핀으로 그린다.
- 검증: tsc 0 · eslint 0 / `scripts/smokeTffDacChain.mjs` **17/17**(게이트 구조 8 +
  **A 입력열로 T-FF 체인을 독립 시뮬레이션해 Q·V_o 재검산**(24시드×2모드) + ★D-FF 시프트와 다름★ 단언 +
  D-FF/시프트 표기 잔존 0 + 정답↔파형 일치(Q_1 열·㉡ 논릿값·V_o) + 소수 표기 0 + JK 형제 무영향) /
  `smokeOriginalRouting` 53/53 · `smokeTff3AutonomousCounter` 52/52 무회귀 /
  **원본 이미지 E2E issues=0**(Q_1 : 0→0→1→0→0→1→1, ㉡ Q=111 → V_o=8.75V — 손검산 일치) / Chrome 시각검증.

# 회로 유형별 생성 규칙 (Circuit-Type Rules)

## RL/RC 스위칭 과도응답 (예: 임용 2번 — V_s+SW+R+L 직렬, v_L(t) 측정)
- **L 또는 C는 회로 내부에 명시적으로 그려야 함**. 외부 placeholder 박스(R_L·L_? 같은)로 분리 금지.
- 모든 component(V_s·SW·R·L/C)는 같은 직렬 loop의 일부 — 한 component만 따로 빼지 마라.
- **단자 a·b**: 측정 대상(v_L, v_C) component의 양 끝 노드에 표기. a=위쪽(+), b=아래쪽(−/GND).
- **Figure 의무 셋**: (가) SW 열림 회로 또는 SW 동작 명시된 회로, (나) i(t) 또는 v(t) 파형 figure. hasWaveformEvolution=true면 waveform figure 누락 금지.
- 학생이 풀어야 할 것은 component "값"(L[H], v_L[V])이지 component의 "존재 여부"가 아니다. component 자체를 placeholder로 추상화하지 마라.

## 2전원 SPDT 스위치 RL 과도 (임용 3번 회로이론 — `switched_rl_source_switch`) — 기존 rl_step 솔버 재사용
- 원본: **2개 독립 직류 전압원(4V·2V)** 이 **SPDT 스위치 S(단자 A↔B, t=0에 A→B)** 로 선택되어 직렬 **R+L** 가지를 구동. t<0 정상상태 → i(0.5s)·i(∞) 도출. **종속전원·커패시터 없음**.
- ★ **새 top-level archetype이 아니라 기존 rl_step 경로 일반화** ([[feedback_universal_path]]): generic `runRlStepPipeline`→`generateRlStep`(`buildSimpleEnergizing`)은 **단일 전원·초기전류 0**만 만들어 스위치·2번째 전원을 잃고 **단일 18V RL로 변질**(실측). 1차 RL 과도에 "0이 아닌 초기전류 i(0⁻)=V_A/R"만 주면 전원 스위칭이 표현됨 — **기존 `solveRlTransient` 솔버 그대로 재사용**(t≥0 활성=V_B, initialIl=V_A/R). circuitType은 `switched_rl`/`rl_step` 유지(분류기 변경 없음).
- 닫힌형: i(0⁻)=V_A/R, i(∞)=V_B/R, τ=L/R[s], i(t)=i(∞)+[i(0⁻)−i(∞)]e^(−t/τ). 원본(4V·2V·2Ω·1H)→i(0⁻)=2·i(∞)=1·τ=0.5s·i(0.5)=1+e⁻¹≈1.37A. 값은 규칙 열거+필터(i 정수·τ 0.5배수·V≤30), **원본 튜플 제외**. similar=전류 감소(i0>iinf), variant=전류 증가(i0<iinf, 구조 동일).
- 라우팅: route.ts에서 `detectSwitchedRlDualSource(analysis)`(종속전원 없음 + L + (V 2개 OR SW OR "단자 A↔B" 텍스트))가 **switched_rl_dependent/dep_i 다음, topology_driven·generic rl_step 앞**에서 가로챔. semantic normalize: 단일 회로 figure(i(t)는 학생 도출) → 파형·상태·multi 면제.
- 파일: `lib/generation/topologies/switchedRlSourceSwitch.ts`(결정론 generator, 솔버 재사용)·`runSwitchedRlSourceSwitchPipeline.ts`(결정론 텍스트 + detector)·`lib/renderers/switchedRlSourceSwitchCircuitRenderer.ts`(전용 fixed-slot: V_A leg∥V_B leg → SPDT(단자A↔B) → 직렬 R+L, i(t)). diagramType `switched_rl_dual_src_circuit`. types·renderers/index·validateProblem `CIRCUIT_FIGURE_TYPES`·route dispatch+semantic·analyzeImage 추출규칙 등록.

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
- ★ **오분류 차단 (2026-06-26, 실측 로그)**: Vision 비결정성으로 generic topology-driven에 떨어져 **SPDT(단자 A↔B)가 단순 수직 SPST leg로 변질**된 사례. 두 원인+2겹 수정:
  - (1) **"미분방정식"→opamp_time_domain 오분류**: classifier electronics 분기의 `미분`/`적분` bare 키워드가 "[단계3] 2차 **미분방정식**"을 미분기 opamp로 오인. → bare 미분/적분 제거(소자명 적분기/미분기만) + `미분방정식`/`2차 미분` 가드.
  - (2) **C 누락·subject 오판**: Vision이 커패시터를 inventory에서 누락(C=0→switched_rl)하거나 subject를 electronics/mixed_signal로 오판. → ★subject 무관 0-PRE early 체크★ 추가: `단자 A↔B 스위치 텍스트 + L≥2 + R≥3 + V·I 2전원 + (C>0 OR 커패시터/v_C 텍스트)` → 최우선 switched_rlc_5leg. 늦은 체크도 `C>0 || capText`로 완화.
  - (3) `analyzeImage`에 전용 규칙: "단자 A→B 이동·커패시터 v_C·2차 미분방정식·2전원" 명시 + 커패시터 누락 금지 + circuit_theory topicKey(미분기 오인 금지).

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
- classifier: ★ universal_ac보다 먼저 매치 ★ (0-PRE-AC-PB: R + L≥2 + C + AC + 단자 a·b 없음). universal_ac가 먼저 잡으면 topology-driven generic으로 변질(L_leg2 노드 겹침)되므로 그 앞에 둠. 전용 generator + 전용 렌더러(`renderAcParallelBranchesCircuit`, analogMeshRenderer가 `hasAcParallelBranches`로 디스패치) 활용.
- semantic normalize: phasor 정상상태이므로 hasWaveformEvolution=false 강제 (waveform figure 면제).
- ★ **기출변형유형 = 코일↔커패시터 교환 (dual)**: V_s+R_top+I_s+(C₁∥C₂∥R∥L). |Z| 보존 매핑 C₁=1/(ω²L₁)·C₂=1/(ω²L₂)·L=1/(ω²C). 주어진 I_C1·I_L → V(N_R)=I_L·jωL, I_C2=V·jωC₂, KCL로 I_S·I_R1. `generateAcParallelBranchesDual`(결정론), netlist는 id 유지(L_1·L_2·C)하되 type만 C·C·L로 swap → 렌더러가 type 기반으로 코일/커패시터 분기 그림. pipeline에서 `mode==="exam_variant"`면 dual(결정론 텍스트, GPT textwriter 우회). 원본 dual 검산: V=20∠180°·I_R1=20√2∠−135°.

## 2전원 페이저 + 중첩 → **전원 크기 역산** (임용 5번 회로이론 — `ac_superposition_source_design`) 전용 archetype
- 원본: 교류 전압원 V_s∠0° + 전류원 I_s∠−90° + RLC 페이저 회로. 상단 R₁(전압원 쪽)·R₂(전류원 쪽), 가운데 가지 = R₃ + jX_L + (−jX_C) 직렬, **커패시터 양단 V_c = −7−j[V]가 되도록** 〈해석 절차〉 3단계로 **V_s·I_s 크기**를 구함.
- ★ 물리(닫힌형, GPT 없음): Z_mid = R₃+j(X_L−X_C). [1] 전류원 개방 → **V_c1 = k₁·V_s, k₁ = (−jX_C)/(R₁+Z_mid)** [2] 전압원 단락 → **V_c2 = k₂·I_s, k₂ = (−j)(−jX_C)·R₁/(R₁+Z_mid)** [3] 합 = 목표 → 실·허수부 연립. 원본 검산: k₁=−1−3j·k₂=−3+j → **V_s=1[V]·I_s=2[A]**. ★ R₂는 이상 전류원과 직렬이라 답에 무관(원본 그대로의 distractor).
- ★ **오분류(수정됨)**: 기존 `ac_superposition`(임용 10번)은 **정방향**(전류 I_b·전력 P)이라 이 역문제를 재현 못 함. Vision이 "중첩"·"전류원 개방/전압원 단락"을 요약에서 흘리면 `detectAcSuperposition`이 미발화 → **universal_ac**로 떨어져 발문이 **"단계별로 회로를 분석하고, 각 단계에서 요구하는 결과를 도출하시오"라는 빈 placeholder**가 되고 전원 값도 기호(V∠0°·I∠−90°)로 남았다(사용자 화면 실측, validator는 issues=0으로 통과 — **검증기가 못 잡는 유형의 실패**).
- ★ 분류 **0-PRE(subject 무관)**: `AC + 전압원 + 전류원 + 리액티브 + 목표 페이저 전압 given + 전원 "크기"를 구함`. 양보 가드: 스위치·과도, 테브난·최대전력·공진·역률·어드미턴스 → 형제 archetype. route 안전망 `detectAcSuperpositionSourceDesign` + subject 보정 + `shouldUseTopologyDriven` 우회.
- 모드: **exam_similar**=목표 전압이 커패시터 양단(원본) / **exam_variant**=목표 소자를 **인덕터(V_L)** 로 교환(구조·원리 동일).
- ★ 값은 규칙 열거+필터 — **k₁·k₂가 가우스 정수**가 되는 조합만(단계 1·2 식이 깔끔) + V_s·I_s 양의 정수 + 목표 페이저 정수. 원본 튜플 제외.
- 파일: `lib/generation/topologies/acSuperpositionSourceDesign.ts`·`runAcSuperpositionSourceDesignPipeline.ts`(+detect)·`lib/renderers/acSuperpositionSourceDesignCircuitRenderer.ts`(전용 fixed-slot: 상단 R₁·R₂ / 가운데 R₃·인덕터·커패시터 + 목표 전압 극성 / 좌 AC 전압원·우 AC 전류원). circuitType `ac_superposition_source_design`, diagramType `ac_superposition_source_design_circuit`. types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·route(안전망+subject보정+semantic+dispatch+topology우회)·analyzeImage 규칙 등록.
- 검증: tsc 신규 0 / `scripts/smokeAcSupSourceDesign.mjs` **28/28**(실측 Vision 요약 3과목 + 표현 변형 + 형제 회귀 3종(임용10 중첩·테브난·역률) + 원본 물리 + 생성물 20개 재검산 + 렌더) / 원본 이미지 **E2E 양모드 issues=0**(analyze 단계에서 이미 전용 유형으로 분류, 3단계 발문·정답 구체) / Edge 시각검증.
- ★ 교훈: **generic universal 경로는 실패해도 validator를 통과한다** — 발문이 "각 단계에서 요구하는 결과를 도출하시오" 같은 placeholder이고 소자 값이 기호로 남으면 그건 라우팅 실패 신호다. 로그의 `dispatch route`가 즉답을 준다.
- ※ smokeAll에는 넣지 않는다 — 그 하네스는 topic 문자열만 보내고 componentInventory를 못 실어, route 상단 재분류가 개념 명칭형(0-PRE)으로 보낸다(테스트 하네스 한계).

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
- **고정 토폴로지** (★ 2026-08-05 원본 이미지를 **확대해 재확정** — [[feedback_verify_wiring_by_zoom]]):
  `g─v(t)─C─a` / `a─[R₂∥R₃]─c`(상단 병렬쌍 2kΩ∥2kΩ) / `c─R₄─g`(우측 세로 1kΩ, **문항이 묻는 저항**) /
  `a─20V─**R₁(2kΩ)**─b─g`(중앙: 직류 전원 **아래 직렬 저항**). i_ac = C→a 유입 전류, I_DC = b 지점.
- ★★ **이전 기록·구현에는 R₁이 통째로 빠져 있었다** (사용자 신고 2026-08-05 "직류 전압원 아래 저항만 하나
  직렬로 추가하면 원본과 같을 것 같아"). R₁이 없으면 교류에서 이상 전압원이 **점 a를 접지에 그대로 클램프**해
  `I_R₄(AC)=0`이 되고 [단계 1]의 둘째 물음이 무의미해진다. 또 문항이 묻는 **R₄는 병렬쌍의 한쪽이 아니라
  우측 세로 저항**이다(원본 라벨). 두 오류가 함께 있어 생성물의 회로·정답이 모두 원본과 달랐다.
- **닫힌형 해** (Rp=R₂∥R₃, S=Rp+R₄, Z_R=R₁∥S):
  [DC] C 개방 → **단일 직렬 루프** V_dc·R₁·Rp·R₄ → **I_DC=V_dc/(R₁+Rp+R₄)**, R₄가 직렬이므로 **I_R₄(DC)=I_DC**.
  [AC] 20V 단락 → a에서 본 저항 Z_R → **i_ac=V_peak/√(X_C²+Z_R²)**, 전류분배 **I_R₄(AC)=i_ac·R₁/(R₁+S)**.
  [전체] R₄ 최대 = I_R₄(DC)+I_R₄(AC).
  원본 검산: R₁=2k·Rp=1k·R₄=1k·X_C=1k → **I_DC=5mA · i_ac=10mA · I_R₄(AC)=5mA · 전체 10mA**.
- ★ 값 설계 규칙: **R₁ = S(=Rp+R₄)** 이고 **X_C = Z_R = S/2** 로 두면 네 답이 전부 정수 mA로 떨어진다.
- ★ 표기 gotcha: 풀이에 V_peak를 십진수로 적으면 전역 분수 변환기(1-4-3)가 `8.485 → 1697/200`으로 뭉갠다(실측)
  → **`6√2` 형태로** 적는다. 렌더러의 i_ac 화살표도 원본처럼 **가로 방향**(C→a)이어야 한다(세로로 그리면 DC 가지 전류로 읽힌다).
- 검증: `scripts/smokeAcDcSuperpositionRcTopology.mjs` **12/12**(R₁ 존재·48개 독립 재검산·**I_R₄(AC)≠0**·
  값 0.5mA 배수·원본 값 재현·렌더 구조(저항 4개·R₁/R₂/R₃/R₄ 이름·옛 R₅ 제거)) / `smokeOriginalRouting` 56/56 /
  tsc 0 / **원본 이미지 E2E** issues 없음 + 헤드리스 Chrome 시각검증(원본 배치 재현).
- ⚠️ **미완**: 변형(쌍대 RL) 경로 `generateAcDcSuperpositionRcDual`·`acDcSuperpositionRcDualCircuitRenderer`는
  **아직 R₁ 이전 토폴로지의 쌍대**다(R₁의 쌍대인 병렬 저항이 빠져 있다). 유사 경로와 짝을 맞추려면 함께 고쳐야 한다.
- ★ **생성기**: 사전검증 PARAM_SETS(첫 세트=원본값 10√2·20V·0.2µF·2k∥2k·1k). DC 정수 mA + i_ab(AC)=정수·√2 mA. (`generateAcDcSuperpositionRc`, GPT 없음.)
- ★ **기출변형유형 = 쌍대(dual) 회로** (`generateAcDcSuperpositionRcDual`, diagramType `ac_dc_superposition_rc_dual_circuit`): V↔I, R↔1/R, C↔L, 직렬↔병렬 (스케일 R₀=1kΩ). 전류원 i(t)∥L + 직류 전류원 + 직렬 R₃+R₄ + 병렬 R₅, **전압 측정**(v_ab·V_DC·V_R₄). 해석도 쌍대: [DC] L단락, [AC] 직류 전류원 개방→V_R₄(AC)=0. 답은 원본의 mA→V 거울. `runUniversalAcPipeline`에서 `mode==="exam_variant"`면 dual 경로.
- 분류: classifier 0-PRE-AC-DC-SUPER-RC (switch 분기보다 먼저) — I=0 + C>0 + AC신호(텍스트/inv) + **DC 전압원(hasDcVSource) + 스위치 없음** → `universal_ac` + `params.acDcSuperpositionRc`. ★ V≥2 의존 금지(Vision이 AC 소스 누락해 V=1인 경우 잦음 — DC는 inventory, AC는 텍스트로 교차 감지). route는 topologySignature 불필요 + isAcDcSuperposition 가드 포함(정상상태).
- 렌더러 `acDcSuperpositionRcCircuitRenderer.ts`(유사)·`acDcSuperpositionRcDualCircuitRenderer.ts`(변형), index.tsx + validateProblem `CIRCUIT_FIGURE_TYPES` 둘 다 등록. 저항·인덕터 지그재그/코일.

## 점선 박스 2개(전압원망 a-b + 전류원망 c-d) 병렬 + R_L 최대평균전력 (임용 10번 회로이론 — `ac_thevenin_two_box`) 전용 archetype
- 원본: **점선 박스 2개**가 각각 두 단자를 내놓고(위=a·b, 아래=c·d), **a–c·b–d로 접속**되어 두 회로망이
  **병렬**로 순저항 부하 R_L을 구동. 〈해석 절차〉 [1] 단자 a-b에서 **전압원망**을 본 Z, [2] 단자 c-d에서
  **전류원망**을 본 V_th(페이저), [3] R_L과 P_max.
- 고정 토폴로지: 위 `V_s∠0° — R₁ — 마디 m — jX_L1 — a`, `m ↓ −jX_C1 ↓ 접지(b)` /
  아래 `I_s∠0° ↑ 마디 n`, `n ↓ (R₂ ∥ jX_L2) ↓ 접지(d)`, `n — −jX_C2 — c`.
- ★ 물리(닫힌형, GPT 없음): Z₁ = jX_L1 + (R₁∥−jX_C1), V₁ = V_s·(−jX_C1)/(R₁−jX_C1) /
  Z₂ = −jX_C2 + (R₂∥jX_L2), V₂ = I_s·(R₂∥jX_L2). 병렬이므로 **Z_th = Z₁∥Z₂**,
  **V_th = (V₁/Z₁ + V₂/Z₂)·Z_th**. R_L = |Z_th|, P_max = |V_th|²·R_L/((R_th+R_L)²+X_th²).
  원본 검산(1V·100·100·j50 / 0.01A·100·j100·−j50): Z₁=Z₂=50Ω, V₁=0.5−j0.5, V₂=0.5+j0.5
  → **Z_th=25Ω · V_th=0.5∠0°V · R_L=25Ω · P_max=2.5mW**.
- ★★ **결합 방식을 원본 이미지 확대로 확정했다** — 처음엔 단자 나열만 보고 **직렬(b–c 접속)**로 읽었으나,
  우측 배선을 6배 확대해 보니 **a에서 나온 도선이 R_L 위쪽과 c로, R_L 아래쪽이 b·d로** 간다(병렬).
  두 해석은 R_L이 100Ω↔25Ω로 갈린다(P_max는 우연히 둘 다 2.5mW라 답만 봐선 구별이 안 된다).
  ⇒ **결합 방식이 답을 가르는 회로는 텍스트 요약이 아니라 원본 픽셀을 확대해 확인할 것.**
- ★ 형제 `theveninMaxPower`(universal_ac params)는 **같은 임용 10번을 단자쌍 하나로 모델링**한 옛 archetype이다.
  실측에서 그 경로가 이 원본을 가로채 (a) 점선 박스·c-d 단자가 사라진 회로, (b) 풀이의
  **틀린 Z_th 계산**("(9+j12)∥(−j12)=16−j12")을 냈다 → 이 archetype으로 **흡수**한다(옛 파일은 보존).
- ★ **라우팅 2겹** (Vision이 단자 라벨을 흘리는 회차가 잦다 — 실측 2/2에서 a-b·c-d가 요약에서 사라졌다):
  (1) 분류기 0-PRE-AC-THEVENIN-TWO-BOX(V≥1+I≥1+리액티브+**a-b와 c-d 둘 다 언급**+테브난/최대전력) —
  기존 theveninMaxPower 블록 **앞**. (2) 라벨이 흘린 회차는 그 블록이 `universal_ac + params.theveninMaxPower`로
  잡으므로, route에서 **그 시그니처(같은 원본 전용)를 이 archetype으로 흡수**한다.
- 모드: **exam_similar**=[1] a-b의 Z · [2] c-d의 V_th(원본) / **exam_variant**=**구하는 대상 교환**
  ([1] c-d의 Z · [2] a-b의 V_th). 회로·절차는 동일, 값 풀은 절반씩 분할.
- ★ 값은 규칙 열거+필터: R=X_C(위)·R=X_L(아래)·직렬 리액턴스=R/2로 두면 각 박스 Z가 순저항 R/2가 되고,
  **I_s = V_s/R₁** 이면 V_th가 실수가 된다(원본 0.01=1/100 ✓). 필터: R_L 정수 · P_max 정수[mW]. 원본 튜플 제외(풀 21).
- ★ 표기 gotcha: 위상이 ±45°라 **|V|가 k√2(무리수)** 다. 소수로 두면 route의 전역 분수 변환기가
  **1.061 → 35/33** 으로 뭉갠다(실측) → `phText`가 k√2로 인수분해해 적는다(1√2는 √2로).
- 파일: `lib/generation/topologies/acTheveninTwoBox.ts`·`lib/pipeline/runAcTheveninTwoBoxPipeline.ts`(+`detectAcTheveninTwoBox`)·
  `lib/renderers/acTheveninTwoBoxCircuitRenderer.ts`(점선 박스 2개 + 단자 a·b·c·d + a–c/b–d 레인 분리 + R_L + 접지).
  circuitType `ac_thevenin_two_box`, diagramType `ac_thevenin_two_box_circuit`. types·circuitType·renderers/index·
  validateProblem·classifier(0-PRE)·route(semantic+dispatch+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 / `scripts/smokeAcTheveninTwoBox.mjs` **37/37**(실측 요약 3종 + 형제 양보 5종 + 분류기 2 +
  원본 물리 8 + 생성물 24개 독립 재검산 + 렌더 구조) / `smokeOriginalRouting` **38/38** /
  형제 무회귀(acTheveninDependent 24/24·acTheveninOriginal 24/24) / **원본 이미지 E2E 양모드 issues=0**
  (유사 Z=20·V_th=3√2∠45°·R_L=12·120mW, 변형 Z=50·V_th=2√2∠−45°·R_L=25·40mW — 모두 수기검산 일치) / 렌더 시각검증.

## 2전원 테브난 최대전력 (임용 10번 — AC 전압원 + 전류원 + RLC + R_L 최대평균전력)
- ※ **2026-08-02부터 이 시그니처는 위 `ac_thevenin_two_box`로 흡수된다** (같은 원본을 단자쌍 하나로
  모델링한 옛 archetype — 점선 박스·c-d 단자를 잃고 풀이의 Z_th도 틀렸다). 파일·렌더러는 보존만 한다.
- 전압원 V(∠0°) + 전류원 I(∠0°) + RLC + 부하 R_L. [단계1] Z_th(a-b), [단계2] V_th(중첩), [단계3] R_L=|Z_th|·P_max.
- ★ generic universal_ac 토폴로지 추출은 두 전원망의 **공통 부하 단자 연결을 잃어** figure·물리 모두 깨짐 → **고정 토폴로지 archetype** 필수.
- 파일: `lib/generation/topologies/acTheveninMaxPower.ts` (generator — **복소 MNA solver로 Z_th·V_th 계산**, ω=1·L=X·C=1/X 규약, PARAM_SETS는 정수 R_L 사전검증), `acTheveninMaxPowerTextWriter.ts`, `lib/renderers/acTheveninMaxPowerCircuitRenderer.ts` (전용 fixed-slot: 상단 V망 / 하단 I망 / 우측 R_L, 단자 a-b).
- classifier `classifyCircuitType` 0-PRE-AC-THEVENIN-MAXPOWER: V≥1 + I≥1 + 리액티브 + (테브난 OR 최대전력) → `universal_ac` + `params.theveninMaxPower`. pipeline `runUniversalAcPipeline`에서 분기, route는 topologySignature 불필요(결정론 generator).
- 토폴로지: V망 e—R_top—m—L_s—a, C_v: m↓GND / I망 I1↑p, R_i: p→a, C_i: p↓GND / 부하 R_L: a↓GND(b). 두 전원망 병렬@a-GND.

## 외부 입력 X를 갖는 2-bit 상태기계 → **T 플립플롭** 2개 + 게이트 설계 (임용 12번 디지털논리 — `tff_state_design_input`) 전용 archetype
- 원본: (가) 상태 변수 Q_A Q_B + **입력 X** 상태도 / (나) 상태표(현재상태·X·다음상태·FF 입력, ㉠ 빈칸) / (다) 카르노맵 2개 / (라) FF 2개 + 게이트 ㉡ 구현. 〈설계 절차〉 [1] ㉠ [2] 불함수(최소항의 합) [3] ㉡을 **2 AND + 1 OR**로 도시.
- ★ **사용자 지정(2026-08-02): 원본의 D 플립플롭 → T 플립플롭으로 출제**. D는 `D=다음상태`지만 **T는 여기표 `T = Q(t) ⊕ Q(t+1)`** 라 단계가 하나 더 깊다(교육 포인트).
- ★ 형제 `dff_state_design`(임용 9번)과의 판별선 = **외부 입력 X**. 저쪽은 입력 없는 **자율** 상태도(2변수 카르노맵), 이쪽은 **3변수(Q_A,Q_B,X)** 라 상태표 8행·카르노맵 4×2 → 재현 불가.
- ★ 값(상태기계)은 예시 hardcode가 아니라 **규칙 열거**: T_A·T_B를 3변수 함수 공간에서 열거하고 **최소 SOP 항 수·리터럴 수로 필터**(T_A는 정확히 2항×2리터럴 → [단계 3]의 "2 AND + 1 OR"가 항상 성립) 뒤 **next = Q ⊕ T** 로 상태도를 역산한다. 상수·정지 상태·X 무의존 기계는 배제(풀 3000).
- 파일: `lib/generation/topologies/tffStateDesignInput.ts`·`lib/pipeline/runTffStateDesignInputPipeline.ts`(3단계 + `detectTffStateDesignInput`). figure 5개는 **전부 기존 렌더러 재사용** — concept_diagram(상태도)·truth_table(상태표)·kmap×2·`dff_state_design_circuit`.
  ★ 형제 렌더러는 **가산적으로만 일반화**했다: `gateAInputs`/`gateBInputs`(원래 타입에 있었지만 미사용)를 실제로 쓰고 `externalInput?`(X 트렁크)를 추가 — 기본값이면 기존 D-FF 그림과 **완전히 동일**(스모크로 단언).
- ★★ **남은 한계(정직한 보고)**: 실측 E2E에서 **Vision이 "입력 X"를 요약에서 2회 연속 누락**해(inventory도 OPAMP만 뱉음) 자율 형제로 라우팅됐다. 분류기·감지기는 **X가 언급된 회차에서만** 잡는다(정적 스모크 3/3). 프롬프트 보강도 시도했으나 **회로 프롬프트가 이미 TPM 한도(30k/분)에 붙어 있어**(실측 `Requested 30013`) 4줄 추가만으로 429가 났다 → 같은 블록을 압축해 1줄로 흡수(1856→1000자). ★ 구조적 해결책은 **과목별 프롬프트 분리**(digital에 아날로그 archetype 규칙을 보내지 않기)이며 아직 미착수.
- ★ **렌더 gotcha 2건 (사용자 신고 2026-08-02)**:
  ① **(가) 상태도 라벨 겹침** — `conceptDiagramRenderer`는 양방향 쌍(a→b·b→a)을 **같은 직선의 같은 중점**에 라벨을 찍어 정확히 포개졌고, 원형 배치 **최상단 노드의 self-loop 라벨은 캔버스 위로 잘려** 안 보였다. 수정 = (a) 양방향은 2차 베지어로 **반대 방향으로 휘게**(부호는 id 사전순 — 결정론), (b) 라벨은 중점 주변 **후보 30곳**에서 노드·기존 라벨과 충돌하지 않는 자리를 고름, (c) **캔버스 경계 검사**(밖이면 후보 탈락, 전부 실패 시 clamp), (d) 원형 반지름 −18·중심 +12로 self-loop 여유 확보.
  ② **(라) 회로 배선이 삐져나감** — 입력 트렁크(세로선) 길이가 **2입력 시절 상수**로 박혀 있어 3입력에서 위아래로 튀어나오고 세 번째 탭에는 닿지 않았다. 수정 = 게이트 입력 탭 좌표를 모아 **트렁크 span을 역산**(`spanOf`), X 인입 stub도 **첫 X 탭 높이**로.
  ★ 회귀 방지: 스모크에 (가) **겹침·누락·캔버스 이탈 0**(20 케이스)과 (라) **떠 있는 배선 끝 0**(세로선 양 끝이 반드시 가로선 위, 12 케이스 + 형제 기본)을 단언. 형제 concept_diagram 사용처(자율 상태도·SR-MUX·블록도) 무회귀 확인.
- 검증: tsc 0 / `scripts/smokeTffStateDesignInput.mjs` **26/26**(라우팅 3종 + 형제 미탈취 4종(자율 D-FF·시퀀스검출기·JK 여기표·SR+MUX) + T 여기표·카르노맵·상태도 일관성 24개 재검산 + 렌더 7(T-FF 표기·X 트렁크·라벨 겹침 0·**형제 기본 렌더 무회귀**)) / `smokeOriginalRouting` **37/37** / 디지털 형제 스모크 무회귀(dffStateDesignRouting 6/6·Stale 3/3·jkExcitation 28/28·muxImpl 7/7·ffMixed 7/7).

## JK-FF 2개 **Mealy 상태도** → 상태표 빈칸 → 출력 y·J_A/J_B 최소식 (임용 9번 디지털 — `jk_mealy_state_design`) 전용 archetype
- 원본: (가) 출력 A·B를 갖는 JK-FF 2개로 구성된 순서논리회로의 **상태도**(간선 라벨 `x/y`, 원 안은 AB),
  (나) 그 **상태표**의 한 행이 ㉠~㉥ 빈칸. 〈해석 절차〉 [1] ㉠~㉥ [2] 출력 y의 논리식 [3] **J_A·J_B 최소식**.
- ★ 원본 상태기계: **x=0이면 00→11→10→01→00 4-사이클(y=0)**, **x=1이면 자기 루프**(상태 유지)이고
  그때 **y=1 ⇔ 상태 ∈ {00, 11}**(즉 A=B). 확대 확인 결과 자기 루프 라벨은 00·11이 `1/1`, 01·10이 `1/0`.
- ★ 물리(규칙 도출, GPT 없음): JK 여기표 Q→Q⁺가 0→0:(J,K)=(0,X) / 0→1:(1,X) / 1→0:(X,1) / 1→1:(X,0).
  즉 **J는 그 FF 출력이 0인 행에서만, K는 1인 행에서만** 정의되고 나머지는 **무관항**이다.
  그 무관항을 살려 3변수(A,B,x) 카르노맵으로 최소화한다.
  원본 검산: **㉠~㉥ = 0 1 1 0 0 0**, **y = A'B'x + ABx**(= x·(A⊕B)′), **J_A = B'x'**, **J_B = x'**.
  (무관항을 안 쓰면 J_B가 B'x'로 남아 최소가 아니다 — 이게 이 문제의 채점 포인트다.)
- ★ 형제와 다르다: `jk_excitation_sop_pos`(여기표만·상태도 없음·SOP→POS)·`dff_state_design`(D-FF 자율·입력 없음)·
  `tff_state_design_input`(T-FF)·`sequence_detector`·`jk_sync_counter`(3-FF+파형) 어느 것도 **상태도 + Mealy 출력 y**
  조합을 갖지 않는다 → 그게 판별선이다.
- ★ 분류 **0-PRE(subject 무관)**: `상태도/상태표 + J-K 입력 기호(J_A·K_A…) + Mealy 출력(출력 y·x/y)`.
  양보: T-FF·시퀀스 검출기·카운터/파형. 넓은 `fsm` 분기보다 **위**(1-5 규칙). route의 `DIGITAL_CIRCUIT_TYPES`에도 등록.
- 모드: **exam_similar**=[3] **J_A·J_B**(원본) / **exam_variant**=**구하는 양 교환**([3] **K_A·K_B**).
- ★ 값(상태기계)은 예시 하드코딩이 아니라 **규칙 열거**: x=0의 4-사이클 순열(6) × y=1 상태쌍(6) × 빈칸 행(4)을
  전수 열거하고 **J·K 네 식이 모두 2항 이하·리터럴 2개 이하**, J_A≠J_B, y가 상수 아님으로 필터(풀 143). 원본 튜플 제외.
- figure: (가) `concept_diagram`(상태도) + (나) `truth_table`(상태표, 빈칸 행은 ㉠~㉥).
  ★ **구현 회로 figure는 원본에 없다** — `lib/rules/digital.ts`에 전용 분기를 넣어 `implementation_circuit` 요구를
  면제해야 한다(안 하면 `missing_figure_variant`가 뜬다, 실측).
- ★ 렌더 gotcha: 상태도 노드를 **순환 순서로** 내보낼 것. 상태 인덱스 순서로 내보내면 간선이 원의 중앙을
  가로질러 라벨이 뭉친다 — 순환 순서면 모든 전이가 이웃 간 호가 되어 원본처럼 마름모로 깔끔하게 그려진다.
- 파일: `lib/generation/topologies/jkMealyStateDesign.ts`(무관항 포함 `minimizeSop` 재사용)·
  `lib/pipeline/runJkMealyStateDesignPipeline.ts`(+`detectJkMealyStateDesign`, `X'`→`X̄` 표기 변환).
  circuitType `jk_mealy_state_design`. 렌더러는 **기존 것 재사용**(concept_diagram·truth_table).
  types·classifier(0-PRE)·route(안전망+semantic+dispatch+DIGITAL 집합)·rules/digital·`smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 / `scripts/smokeJkMealyStateDesign.mjs` **23/23**(감지 3종 + 형제 양보 5종 + 분류기 2과목 +
  형제 감지기 회귀 2 + 원본 동작 7 + 생성물 24개 재검산(빈칸·y·J/K를 **진리표로 평가**해 검증)) /
  `smokeOriginalRouting` **43/43** / 디지털 형제 무회귀(jkExcitation 28/28·tffStateDesignInput 26/26·
  dffStateDesignRouting 6/6·ffMixed 7/7·muxImpl 7/7) / **원본 이미지 E2E 양모드 issues=0**(분류 reasoning까지 정확).

## BJT 직류 바이어스 + **베이스망 테브난 등가** → I_B·V_B → R_C (임용 10번 전자회로 — `bjt_thevenin_bias`) 전용 archetype
- 원본: (가) BJT 증폭기 직류 바이어스 회로, (나) **(가)의 점선 부분을 테브난 등가로 바꾼 회로**.
  〈해석 절차〉 [1] R_T[kΩ] (V_T는 테브난 등가 전압) [2] I_B[µA]·V_B[V] [3] V_CE = 3.8V가 되는 R_C[kΩ].
- ★ 고정 토폴로지(원본 확대 확인): 트랜지스터는 **NPN이고 베이스가 아래**(이미터 왼쪽 rail·컬렉터 오른쪽 rail).
  · 이미터측 `이미터 — R_E — (−)V_EE(+) — 접지` → **음전원 바이어스** V_E = −V_EE + I_E·R_E
  · 베이스측 점선망 `[R₁+V₁] ∥ [R₂+V₂]` (V₁ 음·V₂ 양) → (나)에서 R_T+V_T
  · 컬렉터측 `컬렉터 — (R_p ∥ R_C) — 마디 M — (R_M ∥ 전류원 I_S↑) — 접지`
- ★ 물리(닫힌형). **원본 단서 "β_DC + 1은 β_DC로 계산한다"** → I_E = I_C = β·I_B.
  [1] R_T = R₁∥R₂, V_T = (V₁/R₁ + V₂/R₂)·R_T
  [2] **I_B = (V_T + V_EE − V_BE)/(R_T + β·R_E)**, V_B = V_T − I_B·R_T
  [3] V_E = −V_EE + I_C·R_E, V_C = V_E + V_CE, 마디 M의 KCL **V_M = R_M(I_S − I_C)**,
      (R_p ∥ R_C) = (V_M − V_C)/I_C → **R_C = R_p·R_par/(R_p − R_par)**
  원본 검산: R_T=1kΩ·V_T=1V → **I_B = 8.3/83 = 100µA**, V_B=0.9V, V_E=0.2V, I_C=10mA,
  V_M=0.1(100−10)=9V, R_par=0.5kΩ → **R_C = 1kΩ**. (β+1을 β로 안 쓰면 99µA로 지저분해진다.)
- ★ **오분류(수정됨)**: generic `bjt_bias`(임용 7번 — **저항률 ρ로 저항 구하기**)가 잡아 전혀 다른 문제가
  생성됐다. 이 유형은 (가)→(나) 테브난 변환·음전원 이미터·전류원 컬렉터망이 핵심이라 재현 불가.
- ★★ **낱말이 아니라 구조로 잡아라** (실측 2/2): Vision이 **"테브난"·"점선"을 요약에서 통째로 누락**하고
  "저항 값을 구하는 문제"로만 서술했다. 그 회차에서 낱말 조건은 전부 미발화 →
  **구조 신호 추가**: 인벤토리에 **전류원(I≥1)** 또는 **전압원 3개 이상**(베이스망 2 + 이미터 음전원).
  형제 bjt_bias는 V_CC 하나뿐이고 전류원이 없다. 보강 후 라우팅 **3/3**.
- 모드: **exam_similar**=[3] V_CE 목표 → R_C(원본) / **exam_variant**=**구하는 양 교환**([3] R_C 주어짐 → V_CE).
- ★ 값은 규칙 열거+필터: V_T 0.5 배수 · **I_B 정수[µA]**(20~300) · V_B 0.1 배수 · I_C < I_S ·
  R_par < R_p · **R_C 0.5[kΩ] 배수(0.5~10)**. 원본 튜플 제외.
  ※ gotcha: `R_C ≥ 0.5` 하한이 없으면 R_C가 0.0003 같은 값이 통과해 표시 반올림으로 **"0kΩ"**가 된다(스모크가 잡음).
- 파일: `lib/generation/topologies/bjtTheveninBias.ts`·`lib/pipeline/runBjtTheveninBiasPipeline.ts`
  (+`detectBjtTheveninBias`)·`lib/renderers/bjtTheveninBiasCircuitRenderer.ts`(payload의 `variant`로 (가)/(나) 둘 다 렌더).
  circuitType `bjt_thevenin_bias`, diagramType `bjt_thevenin_bias_circuit`. types·circuitType·renderers/index·
  validateProblem·classifier(0-PRE)·route(안전망+semantic(등가·multi on)+dispatch+topology 우회)·
  `smokeOriginalRouting`(+1줄) 등록.
- ★ 렌더 gotcha: 접지 기호를 하단 rail 중앙에 두면 **점선 박스 위에 겹친다** → 박스 바깥(베이스망과 컬렉터망 사이)에 둘 것.
- 검증: tsc 0 / `scripts/smokeBjtTheveninBias.mjs` **37/37**(실측 요약 포함 감지 4종 + 형제 양보 5종 +
  분류기 3 + **원본 물리 8**(R_T·V_T·I_B·V_B·V_E·I_C·V_M·R_C 전부 직접 검산과 일치) + 생성물 24개 독립 재검산 +
  렌더 (가)/(나) 12) / `smokeOriginalRouting` **42/42** / **원본 이미지 E2E 라우팅 3/3**·양모드 issues=0.

## BJT 이상적 스위치 → 진리표 + **동일 동작 논리게이트** (임용 2번 — `bjt_switch_logic_gate`) 전용 archetype
- 원본: (가) BJT 응용 회로 — **+5V — PNP 이미터 / 컬렉터 → 출력 Y → R_C → 접지**, 베이스는 R_B를 거쳐 입력 X.
  (나) 진리표 `X=H → Y=㉠`, `X=L → Y=㉡`. 요구 = ㉠·㉡을 구하고 **동일 동작 논리게이트를 그리시오**.
- ★★ **화살표 방향이 답을 가른다** (원본 6배 확대로 확정, [[feedback_verify_wiring_by_zoom]]):
  화살표가 **베이스를 향하고** 그 리드가 +5V로 간다 → **PNP·이미터가 위**(하이사이드 스위치).
  · X=H → V_EB=0 → **차단** → Y=0V(**L**) · X=L → V_EB=V_CC → **도통(포화)** → Y≈V_CC(**H**)
  ⇒ **㉠=L, ㉡=H, 등가 게이트 = 인버터(NOT)**. NPN으로 잘못 읽으면 이미터 팔로워가 되어 **버퍼**라는
  정반대 답이 나온다 — 트랜지스터 기호는 반드시 확대해서 확인할 것.
- 구성(config)별 고정 토폴로지 — 논리는 **이상적 스위치 규칙으로 도출**한다(예시 하드코딩 아님):
  · `pnp_high_side`(원본) → **NOT** · `npn_low_side`(R_C 풀업 + 이미터 접지) → **NOT**
  · `npn_series2`(직렬 2개) → **NAND** · `npn_parallel2`(병렬 2개) → **NOR**
- 모드: **exam_similar**=원본 구성(PNP 하이사이드) 유지, **전원 전압·저항값만 변경**(원본 5V는 제외) /
  **exam_variant**=**소자·구성 교환**(NPN 로우사이드 / 직렬 2개 → NAND / 병렬 2개 → NOR).
- ★ **분류는 0-PRE(subject 무관) 최상단**: 회로는 아날로그(BJT)인데 요구는 디지털이라 Vision이 과목을
  electronics·digital_logic·mixed_signal 어디로도 잡는다. 처음엔 **PRE-SUBJECT OPAMP 구역 안**에 넣었더니
  digital_logic에서 **kmap_sop**, mixed_signal에서 **unsupported**로 샜다(스모크가 즉시 잡음) →
  진짜 subject 무관 구역으로 이동. 추가로 route의 `DIGITAL_CIRCUIT_TYPES`에 등록(디지털 과목 선택 시
  universal_digital로 덮이는 것 방지) + 복합형 선택 시 electronics 보정.
  시그니처: `BJT + (논리게이트 요구 OR 진리표+스위칭)`, 양보: 바이어스·동작점·소신호·특성곡선·제너/레귤레이터.
- figure: (가) `bjt_switch_logic_circuit`(전용 fixed-slot, 4개 구성 지원) + (나) `truth_table`(빈칸 ㉠㉡[㉢㉣]).
  **정답 게이트는 `solutionFigures`** 의 `logic_network`(NOT/NAND/NOR 1개)로만 — 본문에 두면 답이 노출된다.
- ★ 렌더 gotcha: 화살촉은 **이미터 리드에만** 그린다(PNP=베이스 방향, NPN=바깥 방향). 이걸 대충 그리면
  문제 자체가 틀린다.
- ★ 검증 gotcha: 풀이에 **전압 값(H=V_CC)** 을 안 적으면 `solution_inconsistent_with_answer`가 뜬다(실측) →
  단계별 상태 서술에 `Y = H(12[V])`처럼 수치를 함께 적는다.
- 파일: `lib/generation/topologies/bjtSwitchLogicGate.ts`·`lib/pipeline/runBjtSwitchLogicGatePipeline.ts`
  (+`detectBjtSwitchLogicGate`)·`lib/renderers/bjtSwitchLogicCircuitRenderer.ts`. circuitType `bjt_switch_logic_gate`,
  diagramType `bjt_switch_logic_circuit`. types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·
  route(안전망+semantic+dispatch+DIGITAL 집합+subject 보정+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 / `scripts/smokeBjtSwitchLogicGate.mjs` **36/36**(감지 3종 + 형제 양보 5종 + **3과목 분류 3** +
  원본 동작 5 + 생성물 24개 논리 재검산 + 렌더 4구성 16(라벨 겹침 0)) / `smokeOriginalRouting` **41/41** /
  **원본 이미지 E2E 양모드 issues=0**(유사 PNP 인버터 ㉠=L·㉡=H, 변형 NPN 로우사이드 — 수기검산 일치).

## 비교기 2개 + **다이오드 결합** + 풀다운 → 구간별 V_out·다이오드 ON/OFF (임용 3번 전자회로 — `comparator_diode_or`) 전용 archetype

- 원본: (가) 연산 증폭기 응용 회로 — **위 OPAMP는 (−)에 +5[V]·(+)에 V_in**, **아래 OPAMP는 (−)에 V_in·(+)에 +2[V]**.
  두 출력이 각각 **다이오드 D₁·D₂(애노드가 OPAMP 쪽)** 를 거쳐 공통 마디 V_out에 묶이고, 그 마디에 **10[kΩ] 풀다운**.
  (나) 입력 파형 — 구간 ㉠에서 6[V], 구간 ㉡에서 1[V]. **㉠의 V_out과 ㉡의 D₁·D₂ 상태**를 순서대로.
- ★★ **배선을 원본 5배 확대로 확정했다** ([[feedback_verify_wiring_by_zoom]]): V_in이 (+)에 물리는지 (−)에
  물리는지가 답을 가르고, 다이오드 화살표 방향도 마찬가지다. 잘못 읽으면 정반대 답이 나온다.
- ★ 물리(규칙, GPT 없음): 이상적 다이오드는 순방향 단락·역방향 개방이므로 **결선이 곧 최대/최소 선택**이다.
  · 애노드가 비교기 쪽 + 풀다운 → **V_out = max(o₁, o₂, 0)** ⇒ 창(window) **밖** 검출
  · o₁ = +V_sat ⟺ V_in > V_H, o₂ = +V_sat ⟺ V_in < V_L
  · 다이오드 k는 **o_k가 마디 전위를 결정할 때만** ON(그때만 저항으로 전류가 흐른다).
  원본 검산: ㉠(6V) → o=(+12,−12) → **V_out = 12[V]**, D₁ ON / ㉡(1V) → o=(−12,+12) → **D₁ = OFF, D₂ = ON**.
  ★ 교육 포인트는 **2 < V_in < 5에서 두 다이오드가 모두 OFF가 되어 풀다운이 V_out = 0을 확정**한다는 것이다.
- ★★ **오분류(수정됨)**: 실측 E2E에서 Vision 분석은 정확했는데(topic="연산 증폭기 응용 회로 분석",
  inventory=[OPAMP×2, D×2, R:10kΩ, V:+5V, V:+2V]) 분류기가 **㉠㉡ 마커 + ON/OFF**만 보고
  `bjt_characteristic_curve`(BJT 출력특성곡선)로 가로채 **BJT 포화/차단 영역 문제**를 생성했다.
  형제 어느 것도 재현 못 한다 — `diode_clamper`는 OPAMP가 없고, `flash_adc_2bit`는 저항 사다리·인코더가 있으며,
  OPAMP 형제(가산기·필터·발진기·레귤레이터)는 다이오드가 없다. ⇒ 전용 archetype + **0-PRE(과목 무관)**.
- ★ 판별선은 **구조**다(낱말이 아니라, CLAUDE.md 규칙 2): `연산증폭기(비교기) + 다이오드 2개 + (출력 전압 | ON/OFF 요구)`.
  양보 가드: 클램퍼·리미터·정류, 플래시 ADC·인코더, 발진기·삼각파, 제너·정전압, 이득·바이어스·전달함수.
- 모드: **exam_similar**=원본 구성(OR 결합 + 풀다운, 창 밖 검출) — 기준·포화 전압·구간 입력만 변경 /
  **exam_variant**=**소자 배치 교환**(다이오드 방향 반전 + **풀업**) → `V_out = min(o₁, o₂, V_CC)`, 창 **안** 검출.
- ★ 값은 규칙 열거+필터: V_L+2 ≤ V_H · 구간 입력이 기준 전압과 같은 **경계값 배제**(이상적 비교기에서 미정의) ·
  **두 구간의 다이오드 상태 패턴이 서로 달라야** 한다(같으면 물어볼 것이 없다). **원본 튜플 제외**.
- 파일: `lib/generation/topologies/comparatorDiodeOr.ts`·`lib/pipeline/runComparatorDiodeOrPipeline.ts`
  (+`detectComparatorDiodeOr`)·`lib/renderers/comparatorDiodeOrCircuitRenderer.ts`(전용 fixed-slot: 좌측 V_in 트렁크 →
  비교기 2개(핀 기호는 삼각형 안쪽) → 다이오드 → 공통 레일 + 풀다운/풀업). circuitType `comparator_diode_or`,
  diagramType `comparator_diode_or_circuit`. (나)는 **기존 waveform 렌더러 재사용**(㉠·㉡ 마커).
  types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·route(안전망+subject 보정+semantic+dispatch+
  topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- ★ 파형 gotcha: 구간 전환을 **같은 t에 두 샘플**로 찍으면 `waveform_time_not_monotonic`이 난다 →
  ε(0.02) 오프셋으로 near-vertical 처리(기존 archetype과 동일).
- 검증: tsc 0 · eslint 0 error / `scripts/smokeComparatorDiodeOr.mjs` **29/29**(실측 오분류 회차 재현 4종 +
  형제 양보 6종(클램퍼·플래시ADC·함수발생기·제너·가산기 이득·**BJT 특성곡선**) + 4과목 분류 + 원본 물리 7 +
  생성물 24개 독립 재검산 + 파형 단조성 + 렌더 라벨 겹침 0) / `smokeOriginalRouting` **51/51** /
  형제 무회귀(bjtSwitchLogicGate 36/36·bjtTheveninBias 37/37·opampSummerTFeedback 33/33·opampTwoStageRx 21/21·
  diodeClamper 24/24·zenerShuntRegulator 18/18) / **원본 이미지 E2E 라우팅 3/3** · 양모드 정답 수기검산 일치
  (유사 V_sat10·V_H6·V_L1 → ㉠ V_out=10·㉡ D₁=OFF·D₂=ON, 변형 풀업 → ㉠ V_out=−10·㉡ 둘 다 OFF) / Chrome 시각검증.

## 반전 가산기(미지 R₁) + **T형 궤환 반전증폭기** + 부하 전류 I_L (임용 7번 전자회로 — `opamp_summer_tfeedback`) 전용 archetype
- 원본(확대 확인): 1단 `V_a—R_a—마디 S`, `V_b—R₁—S`, `S—R_f—V₁`(궤환), (+)접지 → **반전 가산기**.
  2단 `V₁—R_in—마디 M(=(−))`, 궤환이 **T형**: `M—R_ta—T`, `T—R_tb—접지`, `T—R_tc—단자 a(V_o)`, (+)접지.
  단자 a에 부하 R_L(전류 I_L). 〈해석 절차〉 [1] V₁ = −4V가 되는 **R₁** [2] V_o의 **식과 값** [3] R_L=5kΩ일 때 **I_L**.
- ★ 물리(닫힌형, GPT 없음):
  [1] V₁ = −R_f(V_a/R_a + V_b/R₁) → **R₁ = V_b/(−V₁/R_f − V_a/R_a)**
  [2] T형 궤환의 **등가 궤환저항 = R_ta + R_tc + R_ta·R_tc/R_tb** → **V_o = −(그 값)/R_in · V₁**
      (유도: 가상접지라 I = V₁/R_in이 그대로 R_ta로 흘러 V_T = −I·R_ta, 마디 T의 KCL
       I = V_T/R_tb + (V_T−V_o)/R_tc 를 풀면 나온다. **T형은 큰 궤환저항을 작은 저항들로 구현**하는 회로.)
  [3] **I_L = V_o/R_L [mA]** (V[V] ÷ R[kΩ] = I[mA])
  원본 검산: R₁ = 2/(4/2−1/1) = **2[kΩ]**, 등가 궤환 = 2+4+4 = 10[kΩ] → V_o = −(10/4)(−4) = **10[V]**, **I_L = 2[mA]**.
- ★ **오분류(수정됨)**: 실측에서 generic `opamp_cascade_voltage_divider`가 잡아 **"전역 되먹임 전달함수
  V_o/V_i" 문제**로 통째 변질됐다(T형 궤환망·미지 R₁·부하 전류가 모두 소실, issues=0으로 조용히 통과).
  형제 어느 것도 재현 못 함 — `opamp_two_stage_rx`=비반전 분압 R_X, `opamp_three_stage_sum`=3단 R_f 가산,
  `opamp_two_stage`=V_P given. **부하 전류 I_L을 묻는 OPAMP 유형은 이것뿐**이다.
- ★ **분류 0-PRE(subject 무관)**: `OPAMP 맥락 + 부하 전류(텍스트 I_L·부하 전류 또는 인벤토리 R_L) +
  (OPAMP 2개 OR 중간 출력 V₁ OR 미지 저항) + 전달함수 아님` → opamp_summer_tfeedback. cascade·generic **앞**.
  양보: 발진기·필터(대역폭)·제너/정전압 레귤레이터·개방루프 이득/블록도.
- ★★ **중간 출력 V₁에 의존하지 마라** (실측 4회 측정): Vision이 **V_1을 한 번도 안 쓰고**
  "각 노드의 전압을 분석하고 부하에 흐르는 전류를 구한다"로만 요약한 회차가 2/4였다. 그 회차에서
  V₁을 필수로 걸었더니 형제 `opamp_three_stage_sum`이 가로챘다. → 2단 신호를 **OPAMP 개수·미지 저항**으로 확장.
  보강 후 분류 **4/4** 적중.
- 모드: **exam_similar**=[1] R₁ · [3] R_L 주어짐 → I_L(원본) / **exam_variant**=**구하는 양 교환**
  ([1] 1단 궤환저항 R_f · [3] 목표 I_L → R_L). 회로·절차 동일, 값 풀은 절반씩 분할.
- ★ 값은 규칙 열거+필터: R₁·R_f 0.5[kΩ] 배수, 등가 궤환저항 정수, 이득 1.5~8, **V_o 정수**(≤24),
  **I_L 0.5[mA] 배수**. 원본 튜플 제외.
- 파일: `lib/generation/topologies/opampSummerTFeedback.ts`·`lib/pipeline/runOpampSummerTFeedbackPipeline.ts`
  (+`detectOpampSummerTFeedback`)·`lib/renderers/opampSummerTFeedbackCircuitRenderer.ts`(1단 가산기 + 2단 T형 궤환 +
  단자 a·R_L·I_L 화살표). circuitType `opamp_summer_tfeedback`, diagramType `opamp_summer_tfeedback_circuit`.
  types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·route(안전망+semantic+dispatch+topology 우회)·
  `smokeOriginalRouting`(+1줄) 등록.
- ★ 렌더 gotcha: **R_tb(T→접지)의 접지 기호가 2단 출력 배선과 겹친다** — T 궤환 rail을 충분히 위로 올려야 한다(실측).
- 검증: tsc 0 / `scripts/smokeOpampSummerTFeedback.mjs` **33/33**(실측 요약 2회차 포함 감지 4종 + 형제 양보 5종 +
  분류기 3 + 원본 물리 5 + 생성물 24개 독립 재검산 + 렌더 12(라벨 겹침 0)) / `smokeOriginalRouting` **40/40** /
  OPAMP 형제 무회귀(twoStageRx 21/21·finiteGainOffset 28/28·loopGainStability 40/40) /
  **분류 재현 4/4** + **원본 이미지 E2E 양모드 issues=0**(유사 R₁=6kΩ·V_o=9V·I_L=9mA, 변형 R_f=2kΩ·V_o=20V·R_L=2kΩ — 수기검산 일치).

## 2단 OPAMP + 비반전측 분압 저항 R_X 설계 → V_o (임용 2번 전자회로 — `opamp_two_stage_rx`) 전용 archetype
- 원본: 1단 U₁ — `V₁(4V)—2k—(−)`, `2k 피드백(V_X→−)`, `V₂(6V)—4k—(+)`, `(+)—R_X—GND` → V_X. 2단 U₂ — `V_X—2k—(+)`, `(+)—2k—GND`, `GND—2k—(−)`, `4k 피드백(V_o→−)`, 부하 10k. **"V_X=2[V]가 되기 위한 R_X와 V_o"** → 손검산 **R_X=4kΩ·V_o=3V**.
- ★ **사용자 지정(2026-08-02): 1단 (+) 입력을 1개 → 3개로 확장**. 그래서 (+) 마디가 3입력 합성이 된다:
  **Σ(V_i−V₊)/R_i = V₊/R_X → V₊ = (ΣV_i/R_i)/(1/R_X + Σ1/R_i)**, 역으로 **R_X = 1/[(ΣV_i/R_i)/V₊ − Σ1/R_i]**.
  나머지 물리는 동일 — 1단 (−) KCL로 **V_X = V₊(1+R_b/R_a) − V₁·R_b/R_a**, 2단 **V_o = (1+R_g/R_f)·V_X·R_e/(R_d+R_e)**.
- ★ **오분류(수정됨) — 형제 2개가 연속으로 가로챔**(CLAUDE.md 1-5의 전형):
  (a) 분류가 generic `opamp` → route의 **`opamp_finite_gain_block` 안전망**이 코어션 → "블록도 + 개방루프 이득 A(s)" 문제로 변질.
  (b) 그걸 고치자 이번엔 **`opamp_three_stage_sum`**(designRf = "저항 구하기 + 출력전압 목표", 조건이 넓다)이 가로챔 → 3단 반전가산 문제로 변질.
  → **판별자는 미지 저항의 이름·위치**: 이쪽은 접지로 내려가는 **분압 저항 R_X(+단자측)**, 형제는 **R_f(피드백)**. 3단 원본엔 R_X가 없다.
  → 분류기 0-PRE를 **three_stage_sum 앞**으로, route 안전망을 **finite_gain_block 앞**으로 두고 그 형제에 `!detectOpampTwoStageRx` 양보 가드를 달았다.
- ★ **Vision이 inventory에 OPAMP를 하나도 안 넣는 회차가 있다**(실측: 저항 12개만, "연산 증폭기"도 단수) → "2단"을 낱말/개수로 요구하면 통째로 샌다. **구조 신호(미지 R_X + 중간 출력 V_X + 출력 V_o)** 로 대체하고, R_X는 **inventory 값("Rx[kΩ]")** 에서도 읽는다.
- 모드: **exam_similar**=V_X가 목표 → R_X·V_o / **exam_variant**=**V_o가 목표** → 2단을 거슬러 V_X·R_X(구하는 양 교환).
- ★ 값은 규칙 열거+필터: R_X 양의 정수(1~20kΩ)·V₊·V₊₂ 0.5배수·V_o 정수(≠V_X)·3입력 전압이 모두 같지 않음. 열거 상한 4000.
- 파일: `lib/generation/topologies/opampTwoStageRxDesign.ts`·`lib/pipeline/runOpampTwoStageRxPipeline.ts`(3단계 + `detectOpampTwoStageRx`)·`lib/renderers/opampTwoStageRxCircuitRenderer.ts`(U₁·U₂ 삼각형, **(+) 3입력 레인 3개 + 수직 트렁크**, R_X 점선 박스, R_L 부하). circuitType `opamp_two_stage_rx`, diagramType `opamp_two_stage_rx_circuit`. types·renderers/index·validateProblem·classifier(0-PRE, three_stage_sum 앞)·route(안전망 finite_gain_block 앞+dispatch+semantic+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- ★ **렌더 gotcha — 라벨 겹침**(사용자 신고 "수치들이 서로 너무 겹쳐서 못알아보겠어"): 3입력으로 늘리자 좌측이 빽빽해져 전원값·저항값 라벨이 서로 덮었다. 해결 = (1) 입력 4개(V₁ + (+)측 3개)를 **행(y)으로 완전히 분리**, (2) 각 전원의 **세로 다리를 서로 다른 x 열**에 두되 **위 행일수록 왼쪽**으로 — 그러면 아래 행의 가로선이 위 행 전원의 다리와 절대 만나지 않는다(교차 0), (3) 전원 원은 `dcSource(..., cyOpt)`로 **행 근처에 고정**(다리가 길어도 원이 중간으로 내려가지 않게).
  ★ 회귀 방지: `scripts/_labelOverlap.mjs`(SVG `<text>` bbox 충돌 검출, 극성 +/− 제외)를 스모크에 편입 — **16 케이스 겹침 0건**을 단언한다. 다른 렌더러에도 재사용 가능.
- 검증: tsc 0 / `scripts/smokeOpampTwoStageRx.mjs` **21/21**(실측 요약 3종(과목 오선택 포함) + 형제 회귀 4종(two_stage·저역필터·함수발생기·정전압) + 3입력 합성 공식 + 생성물 24개 독립 재검산((+)마디 KCL·(−)마디 KCL·2단 이득) + 렌더 구조 7) / `smokeOriginalRouting` **36/36** / **원본 이미지 E2E 라우팅 2/2**·양모드 issues=0(유사 R_X=4kΩ·V_o=5V 수기검산 일치).

## SW₁ 닫힘 + SW₂(접점 b→c) 2전압원 RLC → 초기조건 + 2차 미분방정식 + v_c(t) (2022 전기 B-5 — `switched_rlc_dual_switch`) 전용 archetype
- 원본: `V_s(1V) — SW₁(t=0 닫힘) — R₁(4Ω) — L(1H, i₁) — 노드 a`, `노드 a ∥ C(½F, v_c)`, `노드 a — SW₂(t=0에 b→c) — {b: V_b(2V), c: R₂(2Ω)}`. t<0: SW₁ 열림·SW₂=b.
- ★ **원본 발문은 라플라스 행렬식**([[s+4,1],[−2,s+1]]·[I₁,V_c]ᵀ=[1/s,2]ᵀ의 ㉠㉡ 계수)이지만, **사용자 지정(2026-08-02)으로 회로는 그대로 두고 발문만 "미분방정식" 형식**으로 낸다. 두 방식의 답이 같음을 손검산으로 확인: **v_c(t)=1/3+3e^(−2t)−(4/3)e^(−3t)**.
- ★ 물리(닫힌형, 유리수 정확 연산): KVL `V_s = R₁i₁ + L·i₁' + v_c` + KCL `i₁ = C·v_c' + v_c/R₂` 결합 →
  **LC·v_c'' + (R₁C + L/R₂)·v_c' + (1+R₁/R₂)·v_c = V_s**. 초기조건 **i₁(0₊)=0**(SW₁이 t<0에 열림)·**v_c(0₊)=V_b**(커패시터가 V_b에 직결)·**v_c'(0₊) = −V_b/(R₂C)**. 해 `v_∞ + Ae^(−pt) + Be^(−qt)`, v_∞ = V_s·R₂/(R₁+R₂). 변형은 `i₁ = C·v_c' + v_c/R₂`.
- ★ **오분류(수정됨)**: 실측 dispatch가 **`switched_rlc_step`(v1 3-leg)** — 그 archetype은 **전류원 + R_c+L 병렬가지** 구조라 전류원이 없는 이 회로가 **전류원 1A 회로로 변질**되고 지수 계수도 지저분해졌다(`exp(−7/13 t)` 등).
- ★ 형제와 구분 = **전류원 유무**: `switched_rlc_step`(V+I)·`switched_rlc_5leg`(V+I·L 2개·단자 A↔B)는 전원이 V·I 혼합. 이 유형은 **전압원 2개·전류원 0 + 스위치 2개**. classifier **0-PRE(subject 무관, 5leg 다음)** + route 안전망 `detectSwitchedRlcDualSwitch`(dispatch를 switched_rlc_step **앞**에).
- 모드: **exam_similar**=v_c(t) (원본) / **exam_variant**=**구하는 양 교환** i₁(t) — 회로·미분방정식 동일. 값 풀은 절반씩 분할.
- ★ 값은 규칙 열거+필터: 특성근이 **서로 다른 양의 정수**(과제동), v_∞·A·B·i₁ 계수의 **분모 ≤ 6**, v_c(0₊)≠v_c(∞). **원본 튜플 제외**(풀 130).
- 파일: `lib/generation/topologies/switchedRlcDualSwitch.ts`(유리수 Q 연산 — 1/3·−4/3을 반올림 없이)·`lib/pipeline/runSwitchedRlcDualSwitchPipeline.ts`(3단계 + `detectSwitchedRlcDualSwitch`)·`lib/renderers/switchedRlcDualSwitchCircuitRenderer.ts`(V_s—SW₁—R₁—L—a ∥ C, SW₂{b:V_b, c:R₂}). circuitType `switched_rlc_dual_switch`, diagramType `switched_rlc_dual_switch_circuit`. types·renderers/index·validateProblem·classifier(0-PRE)·route(dispatch를 step 앞+semantic 단일 figure+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- ※ analyzeImage 규칙은 **추가하지 않았다** — 분류기 0-PRE + 감지기만으로 실측 요약이 3/3 잡히고, 회로 프롬프트가 이미 TPM 한도(30k/분) 근처다([[ac_thevenin_dependent]] 사고 참고).
- 검증: tsc 0 / `scripts/smokeSwitchedRlcDualSwitch.mjs` **22/22**(실측 요약 + 표현 변형 2종 + 형제 미탈취 3종 + 원본 값 7(라플라스 결과와 일치) + 생성물 24개 독립 재검산(ODE 계수·초기조건·정상상태·i₁(0)=0) + 원본 튜플 미생성 + 렌더 구조 5) / `smokeOriginalRouting` **35/35** / 형제 스모크 무회귀(switchedRlc5leg·switchedRlcStep·switchedRlDualSourceGuard 5/5·acTheveninDependent 24/24) / **원본 이미지 E2E 라우팅 2/2**·양모드 issues=0(유사 6V·4Ω·1H·½F·2Ω·6V → v_c=2+6e^(−2t)−2e^(−3t) 수기검산 일치).

## 종속전원 포함 페이저 회로 → 테브난 등가(★단락전류법★) + 복소 켤레 최대전력 (임용 6번 회로이론 — `ac_thevenin_dependent`) 전용 archetype
- 원본: 독립 전류원 √2∠0°[A rms] ∥ 션트 j[Ω] — 상단 직렬 **종속 전압원 ½I₂** — 션트 −j½[Ω](전류 I₂↓) — 단자 A(상)·B(하), (나)는 테브난 등가 + 부하 **Z_L=R+jX**. [1] V_AB [2] **A–B 단락 전류 I_AB로 Z_AB** [3] 켤레 정합 R+jX·P_L(max). 답: **V_AB=1∠−45°V · Z_AB=½−j½ · Z_L=½+j½ · P_L=0.5W**.
- ★ 물리(닫힌형, GPT 없음): I₂=V₂/Z₂, V₁=V₂+k·I₂, 마디1 KCL(A 개방→상단 가지 전류=I₂) → **V_AB = I_s·Z₁Z₂/(Z₁+Z₂+k)**.
  A–B 단락 → V₂=0 → I₂=0 → 종속원=0 → V₁=0 → **I_AB = I_s (독립 전원값 그대로)** → **Z_AB = Z₁Z₂/(Z₁+Z₂+k)**. P=|V_AB|²/(4R_AB).
  ※ 종속전원이 있어 **전원 무효화법을 못 쓴다** — 단락전류법이 이 유형의 교육 포인트다.
- ★ 다이아몬드는 **종속 전압원**이다 (KCL로 확정): 상단 직렬 가지에 종속 **전류원**을 두면 A 개방 시 KCL이 ½I₂=I₂ → I₂=0이 되어 회로가 degenerate가 된다. 값이 깨끗하게 떨어지는 해석(V_AB=1∠−45°)도 CCVS 해석뿐.
- ★ **오분류(수정됨)**: 실측 dispatch가 **`switched_rl_dep_i_pipeline`**(직류 스위치 RL + 종속 전류원 과도) — "직류 16V + 5iₙ + t=0 스위치" 문제로 통째 변질(로그에 `generic_dispatch_warning`). 원인 = `detectSwitchedRlDepI`가 (a) **교류·페이저 문맥을 확인하지 않고** (b) bare **"개방"** 을 스위치 신호로 인정(테브난 설명 "전류원은 개방"에 흔히 나온다). → 그 감지기에 **양보 가드**(페이저/∠ 있으면 false, 테브난+최대전력이면 false) + "개방" 신호 제거.
- ★ 형제와 구분: `ac_thevenin_ladder`(종속원 없음·전원 무효화로 Z_TH)·`theveninMaxPower`(2독립전원·순저항 R_L)·`ac_bridge_max_power`(브리지·순저항)·`thevenin_dep_voltage`(**직류** 저항망·L/C 있으면 스스로 양보)·`ac_vccs_phasor`(테브난·최대전력 없는 순수 페이저). ★**종속전원 + 테브난 + 최대전력** 3박자★가 이 유형 고유 → classifier **0-PRE(subject 무관, ac_vccs_phasor 앞)** + route 안전망 `detectAcTheveninDependent`(dispatch 체인 최상단).
- 모드: **exam_similar**=원본 배치(션트1=L·션트2=C → Z_AB 용량성 R−jX) / **exam_variant**=**리액티브 소자 종류 교환**(션트1=C·션트2=L → Z_AB 유도성 R+jX, 부하는 용량성) — 구조·절차 동일, 답이 거울.
- ★ 값은 규칙 열거+필터: |Z_AB| 실·허부 크기가 같고(∠∓45°) 0.5 배수, |V_AB| 정수, P_max 0.5 배수, I_s=s√2(s=1~3). **원본 튜플 제외**(풀 유사 27·변형 28).
- 파일: `lib/generation/topologies/acTheveninDependent.ts`(결정론 복소 solve)·`lib/pipeline/runAcTheveninDependentPipeline.ts`(3단계 텍스트 + `detectAcTheveninDependent`)·`lib/renderers/acTheveninDependentCircuitRenderer.ts`((가) 전류원∥Z₁—다이아몬드—Z₂—단자 A·B + 점선 영역 / (나) V_AB·Z_AB + 부하 R+jX). circuitType `ac_thevenin_dependent`, diagramType `ac_thevenin_dep_circuit`/`_equiv_circuit`. types·renderers/index·validateProblem·classifier(0-PRE)·route(dispatch 최상단+semantic+topology 우회)·analyzeImage 규칙·`smokeOriginalRouting`(+1줄) 등록.
- ★ **analyzeImage 규칙은 짧게 쓸 것** — 처음 쓴 긴 블록(14줄)이 회로 프롬프트를 **OpenAI TPM 한도(30k/분) 위로** 밀어 analyze가 429로 전부 실패했다(실측 `Requested 30322`). 5줄로 압축해 해결. 새 규칙 추가 시 프롬프트 총량을 의식할 것.
- 검증: tsc 0 / `scripts/smokeAcTheveninDependent.mjs` **24/24**(실측 요약 + 표현 변형 3종 + 형제 회귀 4종(직류 스위치 RL·DC 종속 테브난·사다리·ac_vccs) + 원본 값 5 + 생성물 24개 독립 재검산 + 원본 튜플 미생성 + 렌더 구조 7) / `smokeOriginalRouting` **34/34** / 형제 스모크 무회귀(switchedRlDepI·theveninDepVoltage·theveninDependentForms 2/2·acTheveninOriginal 24/24·switchedRlDualSourceGuard 5/5) / **원본 이미지 E2E 라우팅 3/3**·양모드 issues=0(유사 V_AB=18∠−45°·Z_AB=3−j3·P=27W, 변형 V_AB=12∠45° 수기검산 일치).
- ※ 남은 취약점: analyze의 **inventory↔branches 일관성 검사**가 Vision이 다이아몬드를 I로 한 번 더 세면 502를 낸다(1/4 관측, 재업로드로 해결). 라우팅 문제는 아니다.

## 단일 AC원 L-C-R 사다리 + 테브난 + 복소 켤레 최대전력 (임용 7번 회로이론 — `ac_thevenin_ladder`) 전용 archetype
- 원본: 단일 V_RMS(∠0°) + 직렬 L(j2)—마디 M—션트 C(−j1)—직렬 R(2)—단자 a, b=하단. 부하 **복소 Z_L**. [1] Z_TH·V_TH, [2] **Z_L=Z_TH*(켤레)=R+jX**, [3] P_max=|V_TH|²/(4R_TH). (원본 답: Z_TH=2−j2·V_TH=4∠180°·Z_L=2+j2·P=2W, RMS.)
- ★ **universal_ac 흡수 시도 → 실패 → 전용 archetype으로 확정 (2026-06-24)**: [[feedback_universal_path]] 정신에 따라 먼저 universal_ac 흡수를 시도했으나, topology-driven `perturbTopology/buildFromTopology`가 사다리를 **"병렬 leg 회로"로 변질**(실측: L∥C 병렬·없던 R leg(20Ω) 추가·R 션트화 — Image #4). universal_ac는 **고정 토폴로지를 못 그린다**(형제 archetype 2전원·브리지가 전용인 이유와 동일) → 전용 결정론 archetype 확정.
- ★ **2전원 theveninMaxPower·ac_bridge(둘 다 순저항 R_L=|Z_th|)와 구분: ★복소 켤레 부하 Z_L=R+jX★ (conjugate match)** 가 결정적 판별자(=`looksLikeTheveninLadder`: 테브난+최대전력+켤레/복소임피던스). 단일 전원(I=0).
- ★ **classifier 오분류 차단 (가드 공유)**: 이 케이스는 "단자 a·b"·"z_th"로 `ac_bridge_max_power`(bridgeSig)에, V+C로 `acDcSuperpositionRc`에 잘못 걸릴 수 있음. `looksLikeTheveninLadder` 변수를 (1) ac_thevenin_ladder 블록의 트리거로, (2) bridge·acDcSuperpositionRc 블록의 `&& !looksLikeTheveninLadder` 양보 가드로 공유. 0-PRE-AC-THEVENIN-LADDER는 bridge 앞에 위치.
- ★ **값은 규칙 열거+필터(특정 예시 hardcode 금지)**: `buildSpace(mode)`가 Xa>Xb·R·Vs 열거 → Z_TH 실·허부 정수·|V_TH| 정수·P_max 0.25배수 필터 → SIMILAR_SPACE/VARIANT_SPACE. 원본 튜플 제외. `solve()`는 복소 연산으로 Z_TH·V_TH·Z_L·P 범용 도출.
- 모드: exam_similar=직렬 L+션트 C+직렬 R(Z_TH 용량성) / exam_variant=직렬 C+션트 L+직렬 R(소자 종류 교환, Z_TH 유도성).
- 파일: `lib/generation/topologies/acTheveninLadder.ts`(결정론 generator, GPT 없음)·`runAcTheveninLadderPipeline.ts`(3단계 텍스트, 2-figure)·`lib/renderers/acTheveninLadderCircuitRenderer.ts`((가) 사다리 + (나) 테브난 등가, fixed-slot). diagramType `ac_thevenin_ladder_circuit`/`ac_thevenin_equiv_circuit`. circuitType `ac_thevenin_ladder`. types·circuitType·renderers/index·validateProblem `CIRCUIT_FIGURE_TYPES`·route dispatch+semantic normalize(파형·상태 off·등가·multi on)·analyzeImage 추출규칙·smoke[12] 등록.

## DC 휘트스톤 브리지 평형 → R_x·출력 전압 V_o (임용 3번 회로이론 — `dc_wheatstone_balance`) 전용 archetype
- 원본: 독립 전압원(22V) + 직렬 4Ω → 상단 마디 T. 다이아몬드 4암 — 상단좌 4Ω / **상단우 R_x∥15Ω** / 하단좌 12Ω∥6Ω / 하단우 6Ω, 브리지 암 5Ω(L–R), 출력 V_o는 **개방 단자**(상단 레일 + / 우측 마디 −). 평형 조건의 **R_x**와 **V_o**를 순서대로.
- ★ 물리(닫힌형, GPT 없음): 평형이면 브리지 암 전류 0 → 두 분압기 독립. **R1/R3eq = R_tr/R_rb** → 미지 암 합성값 → **R_x = 1/(1/합성 − 1/R_p)**. R_par=(R1+R3eq)∥(R_tr+R_rb), **V_T = V_s·R_par/(R_s+R_par)**, **V_o = V_T·R_tr/(R_tr+R_rb)**. 원본 검산: R_TR=6 → **R_x=10Ω**, V_T=12V → **V_o=6V**.
- ★ **오분류(수정됨) — 서버 로그로 진단**: `.next/dev/logs/next-development.log`에 이 이미지 실행이 남아 있었다. Vision 분석은 정확(topic="휘트스톤 브리지 회로 해석"·topicKey=dc_resistive)했지만 **classify=dc_nodal(confidence low, "dc_resistive 단순회로 → dc_nodal fallback")** → route에서 **inventoryCount 8 ≥ 7** 게이트에 걸려 **topology_driven**으로 dispatch → 브리지 다이아몬드·미지 R_x·개방 V_o가 전부 사라진 임의 저항망이 **totalIssues=0으로 조용히** 생성됐다(에러 아님). 형제 `ac_bridge_max_power`는 교류(L·C)+테브난·최대전력 전용이라 순저항 DC 평형을 재현 못 함 → 전용 archetype.
- ★ **분류는 0-PRE(subject 무관) 최상단**: `브리지/휘트스톤 + 평형(또는 "전류가 흐르지 않는") + 순수 DC 저항망(C·L·SW·I·종속원 0)`. **넓은 분기(dc_resistive→dc_mesh/dc_nodal fallback) 위에 두지 않으면 반드시 샌다**(CLAUDE.md 1-5). 양보 가드: 리액티브·교류·테브난·최대전력이면 AC 브리지에 넘김. `shouldUseTopologyDriven`에 우회(`return false`) 추가 필수 — 안 하면 inventory 게이트가 다시 삼킨다.
- 모드: **exam_similar**=미지 저항이 상단 우측 암(원본 구조) / **exam_variant**=미지 암을 **하단 우측**으로 교환(구조·원리 동일, 평형식 방향만 바뀜).
- ★ 값은 규칙 열거+필터(R_x 정수 2~60·V_T 정수·V_o 정수·평형 합성값 0.5배수), **원본 튜플 제외**.
- 파일: `lib/generation/topologies/dcWheatstoneBalance.ts`·`runDcWheatstoneBalancePipeline.ts`(+`detectDcWheatstoneBalance` 안전망)·`lib/renderers/dcWheatstoneBalanceCircuitRenderer.ts`(전용 fixed-slot: 세로 전원+직렬 R_s / 다이아몬드 4암(대각 지그재그)+브리지 암 / 하단좌 병렬 세로 / 미지 암 병렬 R_p / 개방 V_o 단자). circuitType `dc_wheatstone_balance`, diagramType `dc_wheatstone_balance_circuit`. types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·route(안전망+subject보정+semantic+dispatch+topology우회)·analyzeImage 규칙·smokeAll[+1] 등록.
- ★ 렌더 gotcha: 하단 좌측 **대각 저항 라벨은 다이아몬드 안쪽(오른쪽)** 에 둔다 — 바깥에 두면 바로 옆 세로 병렬 저항 지그재그와 겹친다(규칙 #6). 병렬쌍은 큰 값을 세로·작은 값을 대각으로(원본 배치).
- 검증: tsc 신규 0 / `scripts/smokeDcWheatstoneBalance.mjs` **38/38**(실측 Vision 요약 4과목 라우팅 + 표현 변형 3종 + AC 브리지·일반 DC 회귀 + 원본 물리 + 생성물 24개 독립 재검산 + 렌더 구조) / `scripts/smokeWheatstoneStale.mjs` **4/4**(stale `dc_nodal` + branches 8 재현 → 전용 figure·issues 0) / smokeAll **39/39** / Edge 시각검증(원본 배치 재현·겹침 0).

## 전원변환(전류원→전압원) + 전압비 3:2:1 → 미지 R₃ (임용 7번 회로이론 — `source_transform_ratio`)

- 원본: (가) `전류원 10mA ∥ 480Ω → 320Ω → [200Ω ∥ R₃]`, (나) 그 점선부를 **전원변환**한 회로
  (`V_s + R₁(480Ω) → R₂(320Ω) → [200Ω∥R₃]`). 전압비 **V₁:V₂:V₃ = 3:2:1**.
  [1] V_s [2] R₃ [3] 전체 전류 I·R₃ 전류 I₃.
- 물리(닫힌형): V_s = I_src·R₁ = 4.8V. 비가 3:2:1이고 합이 V_s → V₁=2.4·V₂=1.6·V₃=0.8V.
  **I = V₁/R₁ = 5mA**, 병렬합성 = V₃/I = 160Ω → **200∥R₃ = 160 → R₃ = 800Ω**, **I₃ = V₃/R₃ = 1mA**.
- ★★ **생성 실패(500)로 사용자 화면에 에러가 떴다** (신고 2026-08-05 "생성 실패: 문제 생성 중 오류가 발생했습니다"):
  `detectSourceTransformRatio`가 null → **universal_dc**로 떨어졌고, generic 경로가 **floating source** 회로를
  만들어 `figure 검증 실패`로 500이 났다(로그: `dispatch universal_dc_pipeline` →
  `figure_critical_validation_failed: V_leg1_1 … closed loop 없음`).
  · 원인: 그 회차는 Vision이 **비율 숫자(3:2:1)도, nodeAnnotations의 V_1·V_2·V_3도 둘 다 흘렸다**
    (내가 캡처한 다른 3회차에는 둘 중 하나가 남아 있어 정상 라우팅됐다 — 전형적인 비결정 실패).
  · ✅ **최후의 구조 신호** 추가: 명시적 `전원 변환` 낱말 + **독립 전류원** + **값이 기호/빈 미지 저항**
    (`R=R3` 또는 `R=` — 실측 3/3 회차에 모두 존재). 이 셋은 표현이 흔들려도 남는다.
  · ※ `semantic.hasEquivalentTransformation`은 테브난 유형도 켜므로 **낱말 근거만** 쓴다(형제 미탈취).
- ★ 교훈: **generic 경로로 떨어지면 조용히 이상한 문제가 되는 정도가 아니라 500 에러로 끝나기도 한다.**
  신고가 "생성 실패"면 로그에서 `dispatch` 한 줄과 `figure_critical_validation_failed`를 먼저 볼 것.
- 검증: `scripts/smokeSourceTransformRatioRouting.mjs` **8/8**(신고 회차 재현 2 + 기존 경로 2 +
  형제 양보 4(종속전원·스위치·가변저항·테브난)) / `smokeOriginalRouting` 56/56 / tsc 0 /
  **원본 이미지 E2E 양모드 200**(유사 V_s=72/5V·R₃=600Ω·I=10mA·I₃=4mA — 자체 검산 일치).

## 2전압원 + 2전류원 → 개방전압·단락전류 → 테브난 등가 + 최대전력 (임용 5번 회로이론 — `max_power_transfer` / `viTheveninMaxPower`)

- 원본: `TL ─R₁(2kΩ)─ 마디 c ─R₂(3kΩ)─ 단자 a`, 좌측 `TL ─3V─ BL ─1V─ GND`(직렬 2전압원),
  마디 c에 **전류원 2개**(↑5mA · ↓3mA), 단자 a–b에 부하 R_L.
  [1] a–b **개방** 시 마디 c 전압 [2] a–b **단락** 시 a→b 전류 [3] 테브난 등가 + 최대전력 R_L·P_L.
- 물리(닫힌형, 단위를 V·mA·kΩ로 두면 `V = I·R`가 그대로 성립):
  · **V_c = (V₁+V₂) + (I_up − I_down)·R₁** (개방이라 R₂ 무전류 → V_a = V_c = V_th)
  · **R_th = R₁ + R₂** (이상 전원 무효화: V 단락·I 개방) · **I_sc = V_c/R_th** · **P_max = V_c²/(4R_th)**
  원본 검산: V_c=8V · R_th=5kΩ · I_sc=8/5mA · **P_L=16/5mW**.
- ★★ **두 결함이 있었다** (사용자 확인 2026-08-04, E2E 실측):
  ① `PARAM_SETS[0]`이 **원본 튜플인데 제외되지 않아** 원본이 그대로 생성됐다.
  ② 파이프라인이 이 분기에서 **`mode`를 넘기지 않아 유사와 변형이 완전히 동일**했다.
  → 값은 **규칙 열거 + 필터**로 바꾸고(V_c 정수 4~30 · R_th 3~10kΩ · I_sc·P_max 기약분모 ≤ 5 ·
  순 주입전류 ≥ 1mA), **원본 튜플 제외** + **원본과 도출량(V_c·R_th)이 같은 조합도 제외**
  (소자값만 달라도 답이 전부 같으면 사실상 원본이다 — 실측으로 잡혔다), 결정론 해시로 섞은 뒤
  **유사/변형 풀을 절반씩 분리**. 풀 8425(유사 4213·변형 4212).
- ★★ **형제 `thevenin_dep_graph_max_power`(임용 9번)가 간헐적으로 가로챘다** (재현 **1/4**):
  Vision이 이 원본 요약에 **없는 종속전원을 지어냈고**("종속 전원이 포함되어 있어 이를 고려한 해석이…"),
  마침 부하가 `R_L`(기호 저항)로 남아 그 archetype의 "그래프 신호(기호 미지 저항)"까지 충족돼 통째로 뺏겼다.
  → `matchesTdgSignature`에 **인벤토리 반증 가드**: 인벤토리에 종속원이 하나도 없고
  **독립 전류원이 2개 이상**이면 이 유형이 아니다(임용 9번 원본에는 독립 전류원이 없다).
  ※ Vision이 다이아몬드를 `I`로 오타이핑해도 값이 `2i_x` 꼴이면 `isDependentComponent`가 잡아 가드는 발화하지 않는다.
  ★ 교훈: **Vision 텍스트는 없는 소자를 지어내기도 한다** — 낱말이 인벤토리와 충돌하면 **인벤토리(구조)를 믿는다**.
- ※ universal_dc 흡수는 하지 않는다: 분류기에서 테브난·최대전력은 전용 archetype 유지로 배제돼 있고,
  universal path는 고정 토폴로지(직렬 2전압원·단자 a·b)를 못 그려 figure가 변질된다([[feedback_universal_path]]의 예외).
- 파일: `lib/generation/topologies/viTheveninMaxPower.ts`(`buildSpace` 규칙 열거 + MNA 검산)·
  `lib/pipeline/runMaxPowerTransferPipeline.ts`(mode 전달). figure `vi_thevenin_maxpower_circuit`.
- 검증: `scripts/smokeViTheveninMaxPower.mjs` **13/13**(값 공간·원본 미생성·**도출량 충돌 제외**·
  생성물 48개 닫힌형 재검산·모드 비중첩·원본 물리·**신고 회차 형제 미탈취 3종**) /
  `smokeOriginalRouting` 56/56 / 형제 무회귀(theveninDepGraph 45/45·theveninViGraphSignal 10/10·
  acTwoSourceMesh 37/37·acTheveninDependent 24/24) / tsc 0 / **원본 이미지 E2E 양모드**
  (유사 V_c=8V·R_th=3kΩ·P=16/3mW, 변형 V_c=8V·R_th=10kΩ·P=8/5mW — 손검산 일치, 원본과 서로 다름).

## 2전압원 병렬가지 → 테브난 등가 (임용 3번 회로이론 — `dc_thevenin_2src`) 전용 archetype
- 원본: 단자 a–b 사이 2 병렬 leg (leg1 2Ω+12V, leg2 6Ω+6V). (가)→(나) 테브난 등가 변환, **R_T·V_T 도출**. Millman: R_T=R1∥R2=1.5Ω, V_T=R_T·(V1/R1+V2/R2)=10.5V.
- ★ **generic `thevenin` 파이프라인이 `archetype="voltage_divider"`(단일 전원 분압) 하드코딩**(`runTheveninPipeline` line 75)이라 2번째 전압원을 잃고 단일 루프로 변질(실측 Image: V1만·R1·R2 단일 루프) → 전용 결정론 archetype. 또 원본은 (가)+(나) 2-figure인데 thevenin 파이프라인은 (가) 1개만 냄.
- ★ **classifier**: `isEquivalent` 블록 내에서 max_power/norton 다음, generic thevenin **앞**에 — `counts.V≥2 + I·C·L·종속원 0(순수 DC 저항망)` → dc_thevenin_2src. 단일전원 분압은 V=1이라 그대로 thevenin.
- ★ **극성 (사용자 확정)**: 원본은 **극성 반대**(12V +위·6V −위) → V_T=R_T·(12/2−6/6)=7.5V. **exam_similar = 극성 반대(원본 구조 보존)**, V_T 양수만. **exam_variant = 같은 극성(둘 다 +)**.
- ★ **exam_variant = 2전압원 + 부하 R_L 완성 회로 → 최대 전력 (사용자 지정 2026-06-26)**: 변형은 단자 a–b에 **부하 R_L 연결한 완성 회로**(`withLoad`)로, [1] R_T·V_T, [2] R_L=R_T(정합), [3] **P_max=V_T²/(4R_T)** 3단계. (가)·(나) figure 모두 a–b에 R_L 렌더(`loadLabel`). buildSpace가 P_max도 0.5배수로 필터.
- ★ **값은 규칙 열거+필터**: `buildSpace(mode)`가 R1≤R2·V1·V2·부호 열거 → R_T(=R1∥R2) 0.5배수·V_T 양수 0.5배수(≤30)·(변형)P_max 0.5배수 필터. 원본 튜플 제외. `solve(p, withLoad)`는 Millman + 최대전력 범용 도출.
- 파일: `lib/generation/topologies/dcTheveninTwoSource.ts`(결정론 generator, GPT 없음)·`runDcTheveninTwoSourcePipeline.ts`(2단계 텍스트, 2-figure)·`lib/renderers/dcTheveninTwoSourceCircuitRenderer.ts`((가) 2전압원 병렬 leg + 단자 a·b, (나) R_T 직렬 V_T, fixed-slot). diagramType `dc_thevenin_2src_circuit`/`dc_thevenin_equiv_circuit`. circuitType `dc_thevenin_2src`. types·circuitType·renderers/index·validateProblem·route dispatch+semantic(파형·상태 off·등가·multi on)·analyzeImage 추출규칙(전압원 2개 강제)·smoke[14] 등록.

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

## 비정현파 발진기(함수발생기) = 슈미트 비교기 + 적분기 (임용 29번 — `function_generator`) 전용 archetype
- 원본: 두 OPAMP로 구성된 **비정현파 발진기**. (가) 슈미트 트리거 비교기(구형파) + (나) 적분기(삼각파)가 피드백 루프로 발진. 구성: (가) OPAMP (−)접지·(+)= R₂(↔(가))·R₃(↔(나)) 분압 정귀환 → 구형파. R₁: (가)→(나) 적분기 (−). (나) OPAMP C 피드백·(+)접지 → 삼각파.
- ★ **오분류(수정됨)**: circuitType=opamp로 **generic opamp cascade에 라우팅 → 독립 전원 2개 반전증폭기 캐스케이드로 변질**(발진기 아님). Wien/위상천이(정현파 발진기)와도 종류 다름(이건 비정현파). 원본 〈보기〉 개념형이지만 **사용자 선택 = 수치 유도형**으로 재현.
- ★ **물리(닫힌형)**: (가) 구형파 진폭=±V_sat. (나) 삼각파 진폭 V_tri=(R₃/R₂)·V_sat [비교기 문턱 V+=0 → (나)=−(R₃/R₂)(가)]. **발진 주파수 f=R₂/(4·R₁·R₃·C)** [적분기 기울기 V_sat/(R₁C), 반주기에 2·V_tri 이동]. ※ 주파수만 바꾸는 저항=R₁(진폭 무관), (가) 진폭은 R 무관(=V_sat).
- ★ **3겹 라우팅 수정**: (1) **analyzeImage 규칙** — Vision이 "발진 회로·신호증폭"으로 뭉뚱그림 → "비정현파 발진기·비교기(슈미트)→구형파·적분기→삼각파·(가)(나)·피드백" 보존 강제(정현파 발진기·반전증폭기로 오요약 금지). (2) **classifyCircuitType** — opamp맥락+발진+(비정현파/구형파/삼각파 OR 비교기+적분기), **정현파(Wien/위상천이) 제외**. ★★ **버그: "비정현파"가 "정현파"를 부분포함** → 정현파 가드가 오탐 → `text.replace(/비정현파/g,"")` 후 검사. funcGenSig(비정현파·구형파·삼각파)는 단독 확정, 비교기+적분기만이면 !sinusoidal 요구. (3) **routePipeline** — "tags.opamp+oscillator→generic opamp" override가 function_generator까지 삼킴 → **function_generator 예외 추가**(전용 경로 유지).
- ★ **값은 규칙 열거+필터**: (R₁∈{10..100}k·R₂·R₃∈{10,20,40}k·C∈{0.01..0.1}µF·V_sat∈{10,12,15}) 열거 → R₃/R₂∈{0.5,1,2}·삼각파 정수/반정수·f 정수[Hz] 필터. exam_similar=수치변형 / exam_variant=R₂≠R₃족(삼각파≠구형파 진폭). 파일: `functionGenerator.ts`·`runFunctionGeneratorPipeline.ts`·`functionGeneratorCircuitRenderer.ts`(전용 fixed-slot: 비교기 U₁+적분기 U₂+R₂·R₃ 분압+C 피드백). circuitType `function_generator`, diagramType `function_generator_circuit`. types(circuitType.ts+index.ts payload)·renderers/index·validateProblem·route(dispatch+semantic+topology우회) 등록. 검증: tsc 0 new err·E2E(원본→function_generator·유사 ±10V/50Hz·변형 ±15V/삼각파±30V/250Hz 수기검산 일치·totalIssues 0·전용 figure)·Edge 시각검증(원본 토폴로지 재현)·회귀(Wien 정현파 무영향). ★ 교훈: "비정현파" substring 함정("정현파" 포함) + opamp override가 전용 archetype 삼킴 — 감지/분류/라우터 3겹 다 고쳐야 전용 경로 도달.

## 3-OPAMP 반전증폭(V_x) + 버퍼 + 반전가산(R_f 도출) (임용 2번 전자 — `opamp_three_stage_sum`) 전용 archetype
- 원본: 1단 반전증폭(V1 2V·Rin1 4k·Rf1 8k·(+)접지 → **V_x=−4V**) + 2단 버퍼(V2 1V→(+) → V_buf=1) + 3단 반전가산(V_x─2k·V_buf─1k가 (−)에 가산·R_f 피드백·(+)접지 → V_o). **V_x 구하고 V_o=12V 되는 R_f 도출**. 닫힌형: V_o=−R_f·(V_x/Ra+V_buf/Rb) → R_f=−V_o/(V_x/Ra+V_buf/Rb)=12kΩ.
- ★ generic `opamp_cascade_voltage_divider`(전달함수 V_o/V_i)·`opamp_two_stage`(V_P given)·`opamp_generic`(가산/차동 임의 R 역산)은 이 "V_x + R_f 설계" 구조를 잃음(실측: opamp_cascade로 변질) → 전용 결정론 archetype.
- ★ **classifier (Vision terse 대응)**: 실제 Vision은 "출력 전압을 얻기 위한 저항 값을 구하는"처럼 terse. → `designRf`(저항 (구하|조정|결정) + 출력전압 + 목표(되기/얻기 위한)) + opamp맥락 + 전달함수 아님 + **`!summingSig`(V≥3 차동가산 아님)** 으로 **`opamp_generic`·two_stage·cascade 앞**에 매치(opamp_generic은 V≥3 summingSig로 양보). analyzeImage에 "V_x·R_f·되기 위한 저항·반전증폭·가산 명시" 규칙.
- ★ **값은 규칙 열거+정수 필터**(예시 hardcode 금지): `buildSpace()`가 V1·Rin1·Rf1(gain1 정수)·V2·Ra·Rb·Vo 열거 → V_x 정수·R_f 양의정수[2..40]·term<0 필터. 원본 튜플 제외. 모드: similar/variant 풀 절반 분할.
- ★ **변형유형 U3 = 비반전 가산기 (사용자 지정 2026-06-26)**: exam_variant는 U3를 **비반전 가산기**로 바꿈(`circuitDiagram.u3NonInverting`+`rgLabel`). 입력(V_x·V_buf)이 **(+)단자**로, (−)단자에 **R_g(접지)·R_f(피드백)**. **V_+ = (V_x·Rb+V_buf·Ra)/(Ra+Rb), V_o = (1+R_f/R_g)·V_+ → R_f = R_g·(V_o/V_+ − 1)** (정답 공식·회로 모두 달라짐, 유사의 반전가산과 별개). generator `solveNonInv`+`buildSpaceNonInv`(V_+ 양정수·이득>1·R_f 양정수 필터), 렌더러 비반전 분기(입력→+위, R_g 수직 vResD→GND·R_f→V_o). ※ 중간 시도: 단순 +/− 기호 스왑(`u3InvertPolarity`)은 "같은 회로"라 폐기 → 기능 변화(비반전)로 확정.
- 파일: `lib/generation/topologies/opampThreeStageSum.ts`·`runOpampThreeStageSumPipeline.ts`(2단계 텍스트, 단일 figure)·`lib/renderers/opampThreeStageSumCircuitRenderer.ts`(U1 반전+U2 버퍼+U3 가산 fixed-slot, OPAMP 삼각형). circuitType `opamp_three_stage_sum`, diagramType `opamp_three_stage_sum_circuit`. types·validateProblem·renderers/index·route dispatch+semantic(파형·상태·등가·multi off)+topology-driven 우회·smoke[13] 등록.

## t=0 스위치 개방 RC — DC정상상태 v_c(0⁻) + 방전 v_o(t) (임용 2번 — `switched_rc_dc_transient`) 전용 archetype
- 원본: 좌측 [V_s(+R_s) ∥ I_s(전류원)] ─[SW t=0 개방]─ 우측 [C(v_c) ∥ R_load(v_o)]. t<0 DC정상상태 v_c(0⁻), t≥0 방전 v_o(t).
- ★ generic switched_rc는 "τ·V_C(t=…)" generic 문제(지저분한 수치)를 만들어 원본의 "v_c(0⁻) 정상상태 + v_o(t) 방전" 구조를 잃음 → 전용 결정론 archetype.
- 닫힌형: v_c(0⁻)=(V_s/R_s+I_s)/(1/R_s+1/R_load) (C 개방). t≥0 SW 개방 → 좌측 분리, C가 R_load로 방전: τ=R_load·C, v_o(t)=v_c(t)=v_c(0⁻)·e^(−t/τ). 원본(5V·1Ω·4A·2Ω·2.5F)→v_c(0⁻)=6V·τ=5s·v_o=6e^(−0.2t).
- 값은 규칙 기반(V_s·R_s·I_s·R_load·C 조합 → v_c(0⁻) 정수·τ 0.5배수 rejection), 원본 튜플 제외. classifier 0-pre-pre-rc2: SW + 순수RC(C≥1·L=0) + 전류원(I≥1) + DC + v_c(0⁻)/v_o(t)/정상상태 키워드 + 테브난·점선 아님 → thevenin_switched_rc·generic switched_rc 앞에 매치.
- 파일: `lib/generation/topologies/switchedRcDcTransient.ts`·`runSwitchedRcDcTransientPipeline.ts`(2단계)·`lib/renderers/switchedRcDcCircuitRenderer.ts`(V_s+R_s∥I_s ─SW─ C∥R_load 5가지). diagramType `switched_rc_dc_circuit`. semantic normalize(파형·상태·multi 면제, v_o(t)는 학생 도출).
- ★★ **후속 (2026-07-25) — route 재검출 안전망 `detectSwitchedRcDcTransient` 추가 (사용자 "이렇게 생성돼")**: 실측 신고 화면은 **generic `analog_netlist`**(C가 직렬로 그려지고 SW가 전류원 아래 붙음) + **v_c(0⁻) 소문항 소실**. 그런데 fresh 분석은 **3/3 switched_rc_dc_transient**(reasoning까지 정확)이고 그 analysis로 generate하면 전용 figure·2단계 발문이 정상 → 분류기가 아니라 **프론트(`app/page.tsx`)가 analysis를 React state에 캐시해 stale circuitType(transient_rc·switched_rc 등)을 generate로 보낸 것**이 원인(jk_sync_counter·active_lowpass_filter와 동일 패턴, 세 번째 재발).
  - 수정: `runSwitchedRcDcTransientPipeline.ts`에 `detectSwitchedRcDcTransient` export(시그니처 = **SW + 순수 RC(C 있고 L 없음) + 전류원 + DC(교류 아님) + v_c(0⁻)·v_o(t)·정상상태**, **테브난·점선이면 thevenin_switched_rc에 양보**) + `app/api/generate/route.ts`의 안전망 블록(opamp_analog_summer 앞)에서 circuitType 강제 보정.
  - 검증: 신규 `scripts/smokeSwitchedRcStale.mjs` **6/6** — stale 3종(transient_rc·switched_rc·topology_driven) 모두 전용 figure+2단계 발문 복구(issues=0) + 음성 3종(테브난 점선·스위치 RL·교류 RC) 미발화. fresh 분석 E2E 양모드 issues=0·tsc 신규 0.
  - ★ 교훈: 전용 archetype을 새로 붙일 때는 **classifier만으로 부족** — 프론트가 analysis를 캐시하는 구조라 generate 단계 재검출 안전망을 세트로 넣어야 한다.

## 스위치 2-state + 종속전류원 + supermesh (임용 8번 회로이론 — `supermesh_switched_dependent`) 전용 archetype
- 원본: 전원·저항·스위치 포함 회로를 〈해석 절차〉로 단계 풀이. **(가) SW 개방 → V₁·I₁**, **(나) SW 단락 → 점선 a 초메쉬(supermesh)로 V₂·I₂**. 종속전류원 0.2·V + 독립 전류원 1A 공존.
- ★ **generic universal_dc·topology_driven 둘 다 실패**:
  - `universal_dc`(자체 MNA)는 **SW를 못 푼다** — 열린 leg가 floating node가 되어 `singular matrix at row N`. classifier가 SW 무시하고 universal_dc로 분류 → 직행 → 에러.
  - `topology_driven`(Vision branches 그대로 추종)은 **Vision이 SW─R4─I_s 직렬 가지를 신뢰성 있게 못 읽음**: SW_top floating·1A를 우측으로 분리·mesh 4개 오생성 → figure dangling. Vision 입력이 틀려 generic으로 교정 불가.
  - → 사용자 정답으로 역검증한 **고정 토폴로지 + MNA solver** 전용 archetype 필수.
- **고정 토폴로지** (mesh 3개, 4 세로가지 + 상단 R 3개): `A(V_s+) ─R1─ V₁ ─R2─ V₂ ─R3─ (우외곽 도선) ─ GND`. V₁ 마디 아래 **종속전류원 0.2·V₂**(↑주입), V₂ 마디 아래 **[SW─R4─I_s] 직렬**(스위치 아래 전류원), 우외곽 도선.
- ★ **종속전류원 제어전압 = 가운데 노드 V₂**(단계2에서 구하는 전압). 원본 라벨은 0.2V₃지만 우상단은 R3 거쳐 접지(0V)라 0.2V₃=0이면 정답 안 나옴 → 제어노드는 V₂여야 사용자 정답 재현(solver 역검증 완료).
- 닫힌형(solver): (가) V₂=V_s/(3−gR), V₁=2V₂, I₁=(V_s−V₁)/R. (나) V₂=(V_s+2I_s·R)/(3−gR), V₁=2V₂−I_s·R, I₂=(V₁−V₂)/R, **supermesh 조건 I₃−I₂=I_s**. 원본(10V·10Ω×3·g0.2·1A)→(가)V₁=20·I₁=−1 / (나)V₁=50·V₂=30·I₁=−4·I₂=2·I₃=3.
- 값은 사전검증 PARAM_SETS(gR=2로 분모 1·정수 정답), **원본 튜플 제외**. classifier(route.ts `detectSupermeshSwitchedDependent`): inventory에 **SW + 종속전원(VCCS/CCCS) + 독립전류원(I) + 초메쉬 키워드** 동시 → universal_dc·topology_driven **앞에** 매치.
- ★ **초메쉬 점선 a의 범위 = 회로 전체 외곽 루프** (2026-07-27 원본 대조로 정정, 사용자 신고 "점선 범위가 잘못됐다"): 이 회로엔 전류원 가지가 **둘**이다 — 종속전류원(0.2·V₂ 가지)과 독립 전류원(SW─R₄─I_s 가지). 두 가지 모두 KVL을 쓸 수 없으므로 초메쉬는 **세 메쉬(I₁·I₂·I₃)를 전부 합친다**. 점선은 두 전류원 가지를 **내부에 두고** 바깥 루프(V_s 가지·상단 레일·우외곽·하단 레일)를 따라 그린다. ※ 이전 구현은 오른쪽 두 메쉬만 감싸 종속전류원·좌측 메쉬가 밖으로 빠져 있었다. 검증: `scripts/smokeSupermeshBoundary.mjs` 8/8(두 전류원 내부·V_s와 우외곽은 경계 밖·(가)엔 점선 없음).
- 파일: `lib/generation/topologies/supermeshSwitchedDependent.ts`(결정론 generator, MNA solver)·`runSupermeshSwitchedDependentPipeline.ts`(2단계 텍스트, figure 2개 state_before/after)·`lib/renderers/supermeshSwitchedDependentCircuitRenderer.ts`(전용 fixed-slot: 4가지+SW open/closed+초메쉬 점선). circuitType `supermesh_switched_dependent`, diagramType `supermesh_switched_dependent_circuit`. types·validateProblem `CIRCUIT_FIGURE_TYPES`·renderers/index.tsx·route dispatch 등록.
- ★ 부수 수정: `shouldUseTopologyDriven`이 `universal_dc`를 무조건 차단하던 것을, **SW나 (supermesh+종속)면 topology_driven 허용**으로 완화(universal_dc가 SW 못 푸는 모순 해소). `augmentTopologyFeatures`로 inventory(SW·종속)·텍스트(supermesh)에서 features 보강(Vision 불안정 대비). `detectSourceTransformRatio`에 배제 가드(종속전원·SW·supermesh면 양보).

## **(+)단자 3입력 평균** + 2단 중첩 → 미지 저항 (임용 8번 전자회로 — `opamp_avg_superposition_r`) 전용 archetype

- 원본(5배 확대로 확정): 1단 U₁ — ★**(+)단자에 입력이 3개**★(3V·2V·1V가 각각 3kΩ을 거쳐 **한 마디**로).
  그 마디에서 접지로 내려가는 저항은 **없다**. (−)는 `접지—2kΩ—(−)` + `2kΩ 궤환`.
  2단 U₂ — `V₁—R—(−)`, `3kΩ 궤환`, (+)에 V₂=3V. 출력 V_o = 1.5V일 때
  〈해석 절차〉 [1] V₁ [2] a점에서 **V₁에 의한 전압과 V₂에 의한 전압을 각각 R의 식으로** [3] R[kΩ].
- ★ 물리(이상 OPAMP, 닫힌형): (+) 마디로 전류가 흘러들지 않으므로 `Σ(V_i−V₊)/R_in = 0` →
  **V₊ = 세 입력의 산술 평균**(저항이 모두 같다). 1단은 **비반전 증폭기** → `V₁ = (1+R_f1/R_g)V₊`.
  2단은 중첩으로 나눈다 — `V_o(V₁) = −(R_f2/R)V₁`(반전), `V_o(V₂) = (1+R_f2/R)V₂`(비반전) →
  **V_o = V₂ + (R_f2/R)(V₂−V₁)**, 역으로 **R = R_f2(V₂−V₁)/(V_o−V₂)**.
  원본 검산: V₊=2 → **V₁=4V**, 성분 −6V·15/2V → V_o=3/2V → **R = 2[kΩ]**.
- ★★ **오분류(수정됨)**: 전용 항목이 없어 generic OPAMP 경로로 갔고 **(+)단자 3입력이 반전 가산기로
  뒤집힌** 회로가 생성됐다(사용자 신고: "원본은 +입력에 입력이 3개 달린 건데 이건 반전증폭기잖아").
- ★ **형제와의 판별선** — `opamp_two_stage_rx`(임용 2번)는 (+) 마디에 **접지로 내려가는 미지 R_X**가 있고
  그것을 구한다. 이 유형은 그 저항이 **없고**, 미지 저항은 **2단 경로**에 있다.
  `opamp_three_stage_sum`(3단·버퍼)·`opamp_summer_tfeedback`(T형 궤환·부하 전류)과도 다르다.
  분류기 0-PRE(과목 무관) + route 안전망이 **같은 매처를 import** 한다.
- 모드: **exam_similar**=원본(2단 **입력 직렬 저항 R**이 미지) /
  **exam_variant**=**구하는 양 교환**(R은 주어지고 2단 **궤환 저항 R_f**가 미지). 중첩 절차는 동일.
- ★ 값은 규칙 열거+필터: 세 입력이 서로 다르고 **합이 3의 배수**(평균 정수) · V₁ 정수 · V₁≠V₂ ·
  목표 V_o가 0.5 배수이고 0도 V₂도 아닐 것 · **중첩 두 성분의 부호가 반대**(반전/비반전 대비가 드러나야
  [단계 2]가 의미 있다). **원본 튜플 제외**, 유사/변형 풀 절반 분리.
  ★ 열거 순서대로 두면 앞쪽이 전부 같은 입력 집합이라 **결정론 해시로 재정렬**해 다양성을 확보한다.
- ★ 유리수 helper는 `lib/format/rational.ts`로 분리했다 — 생성기가 **반올림 없이** 계산하고 `qTex`로
  분수를 직접 써야 전역 분수 변환기의 오복원(1-4-3)이 원천 차단된다.
- 파일: `lib/generation/topologies/opampAvgSuperpositionR.ts`·`lib/pipeline/runOpampAvgSuperpositionPipeline.ts`
  (+`detectOpampAvgSuperposition`)·`lib/renderers/opampAvgSuperpositionCircuitRenderer.ts`
  (원본처럼 (+)측 입력 3개가 계단식으로 트렁크에 모이고, (−)는 접지-R_g + 상단 궤환 레인).
  circuitType `opamp_avg_superposition_r`, diagramType `opamp_avg_superposition_circuit`.
  types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·route(dispatch+semantic+topology 우회)·
  `smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 · eslint 0 / `scripts/smokeOpampAvgSuperposition.mjs` **37/37**
  (감지 3(OPAMP를 하나만 인식한 회차 포함) + 3과목 분류 + 형제 양보 5 + 원본 물리 6 +
  **생성물 48개를 노드 방정식에 대입해 KCL 잔차 0 확인** + 값 품질 4 + 발문·정답 8 + 렌더 6) /
  `smokeOriginalRouting` **56/56** / 형제 무회귀(opampTwoStageRx 21/21·opampSummerTFeedback 33/33) /
  **원본 이미지 E2E 양모드**: analyze가 곧바로 전용 유형으로 분류, (+)3입력 구조 보존, 손검산 일치.

## 종속전원 저항회로 + **V-I 그래프로 미지 R 도출** → I_SC → 최대 전달 전력 (임용 9번 회로이론 — `thevenin_dep_graph_max_power`) 전용 archetype

- 원본(6배 확대로 확정, [[feedback_verify_wiring_by_zoom]]): **점선 박스 안**
  `9V(+위) — 5Ω — ◇2i_x(+왼쪽) — 1Ω — 마디 M — 2Ω — 단자 a`, `마디 M — R(i_x ↓) — 하단 rail → 단자 b`.
  **점선 박스 밖**: `a — Ⓐ(I_RL) — R_L(V_RL, +위) — b`, R_L에 Ⓥ 병렬.
  (나)는 V_RL–I_RL 직선인데 **y절편만 수치(1)이고 x절편은 `I_SC` 기호**로만 적혀 있다.
  〈해석 절차〉 [1] V_TH를 R의 함수로 제시하고 (나)로 R을 구한다 [2] I_SC [3] P_L(max).
- ★ 물리(닫힌형, 유리수 정확 연산). S = R_a + k + R_b, A = R_a + R_b 라 두면
  · **개방**: R_c에 전류가 0이므로 `i_x = V_s/(S+R)` → **V_TH = R·V_s/(S+R)**, 역으로 **R = S·V₀/(V_s−V₀)**
  · **단락**: 마디 M 전압 v에 대해 `V_s = A(v/R + v/R_c) + k·v/R + v` → **I_SC = v/R_c**
    (R에 대해 정리하면 **I_SC = V_s·R/[(A+k)R_c + (A+R_c)R]**)
  · **R_TH = V_TH/I_SC**, **P_L(max) = V_TH·I_SC/4**
  ★ 종속전원이 있어 **전원 무효화법(전압원 단락)을 쓸 수 없다** — 개방전압/단락전류법이 교육 포인트다.
  원본 검산: **R = 1Ω · I_SC = 3/8A · R_TH = 8/3Ω · P_L = 3/32W**.
- ★★ **오분류(수정됨)**: 전용 항목이 없어 generic `thevenin_max_power_generic`(GPT 구조 추출)으로 갔고,
  사용자 화면에서 (a) **점선 박스·전류계·전압계·i_x 표기가 전부 소실**, (b) 회차에 따라 **(나) 그래프가
  통째로 누락**되면서 **미지 저항 R에 값이 노출**됐다(그림만 봐도 [단계 1]의 답이 보인다).
- ★★ **판별선은 낱말이 아니라 구조다** (실측 요약 2종을 그대로 스모크에 넣었다):
  · 실측 요약은 **종속전원을 한 번도 언급하지 않는다**(다이아몬드는 인벤토리에만 CCVS로 남는다)
    → `isDependentComponent`(값 기반 정규화)를 재사용해 **인벤토리에서** 종속원을 본다.
  · 다른 회차는 **"그래프"·"(나)"·"I_sc"를 하나도 쓰지 않는다** → 그때 남는 신호가
    **값이 기호인 저항**(`{type:"R", value:"R"}`)이다(1-4-5 규칙).
  분류기 0-PRE(과목 무관) + route 안전망이 **같은 매처를 import** 한다(복제 금지 — 드리프트).
- 모드: **exam_similar**=원본(그래프에 y절편 V_TH 수치 → R·I_SC·P) /
  **exam_variant**=**구하는 양 교환**(그래프에 x절편 I_SC 수치 → R·V_TH·P). 회로·절차는 동일.
- ★ 값은 규칙 열거+필터: **V_TH 정수**(그래프에서 읽을 수 있어야 한다) · R_TH > 0 ·
  I_SC·P 분모가 작을 것. **원본 튜플 제외**, 유사/변형 풀 절반 분리(풀 5724).
- ★ (나)는 **기존 `vi_line_graph` 렌더러를 재사용**하되 `vInterceptLabel`/`iInterceptLabel`을 추가해
  **학생이 구할 절편은 기호로만** 찍는다. ※ 두 라벨 중 **한쪽만 고치면 반대쪽에 답이 그대로 노출된다**
  (실측으로 잡혔다 — 스모크가 두 방향 모두 단언한다).
- ★★ **기호식도 검산 대상이다**: 변형의 `[단계 1]` I_SC 식을 손으로 잘못 적어 R 대입 시 10/9(실제 5/6)가
  나왔고 **E2E에서야 드러났다**. → 스모크가 **정답에 적힌 기호식에 R을 대입해 그래프 절편과 대조**한다.
- 파일: `lib/generation/topologies/theveninDepGraphMaxPower.ts`(유리수 Q 연산 + 공용 매처)·
  `lib/pipeline/runTheveninDepGraphMaxPowerPipeline.ts`(3단계 + `detectTheveninDepGraph`)·
  `lib/renderers/theveninDepGraphCircuitRenderer.ts`(점선 박스 + 다이아몬드 + Ⓐ/Ⓥ + i_x + 미지 "R").
  circuitType `thevenin_dep_graph_max_power`, diagramType `thevenin_dep_graph_circuit`.
  types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·route(dispatch+semantic+topology 우회)·
  `smokeOriginalRouting`(+1줄, **실측 요약 그대로**) 등록.
- ★ 부수 수정(형제 generic 경로) — 같은 신고에서 함께 잡힌 것:
  ① `theveninDependentCircuitRenderer`가 **직렬 가지의 종속전원을 저항 지그재그로** 그렸다
     (shunt 쪽만 `DEP_TYPES`를 검사했다) → 가로 다이아몬드 심볼 추가.
  ② 같은 렌더러가 **i_x 화살표를 직렬 가지에만** 그려, 제어 전류가 세로 가지일 때 통째로 빠졌다 → 추가.
  ③ `extractTheveninNetlist`의 `round3`가 전역 분수 변환기의 오복원을 유발했다(1-4-3 참고).
- 검증: tsc 0 · eslint 0 / `scripts/smokeTheveninDepGraphMaxPower.mjs` **45/45**
  (실측 요약 포함 감지 4 + 3과목 분류 + 형제 양보 5 + 원본 물리 5 + **생성물 48개를 독립 solver로 재검산
  (KVL 잔차 포함)** + 값 품질 4 + 발문·표기 + **기호식 대입 검산** + 렌더 구조 10) /
  `smokeOriginalRouting` **55/55** / 형제 무회귀(acTheveninDependent 24/24·acTheveninDesignAb 18/18·
  acTwoSourceMeshPower 37/37·theveninViGraphSignal 10/10) /
  **원본 이미지 E2E 양모드**: analyze가 곧바로 전용 유형으로 분류, figure 2종·손검산 일치
  (유사 V_TH=4·R=6·I_SC=8/11·P=8/11, 변형 I_SC=6/5·V_TH=9·R_TH=15/2·P=27/10) / 렌더 시각검증.

## **두 교류 전원** RLC 메시 → 페이저 전류 I₁·I₂ + 평균 전력 (임용 5번 회로이론 — `ac_two_source_mesh_power`) 전용 archetype

- 원본: 직사각 2-메시. 좌 세로 v₁(√8∠45°)·우 세로 v₂(2∠180°), 상단 좌 R₁(1Ω, I₁)·상단 우 C₂(−j2),
  가운데 R₂(1Ω), 하단 좌 C₁(−j1)·하단 우 L(j3). [1] I₁·I₂ [2] **R₂ 소비 평균전력** [3] v₁ 공급 평균전력.
- ★ 물리(닫힌형, 복소 2×2): 두 메시를 모두 시계로 잡으면 가운데 R₂에 **I₁ − I₂** 가 흐른다.
  `[Z₁ −R₂; −R₂ Z₂][I₁;I₂] = [V₁;V₂]`, **P_R2 = ½|I₁−I₂|²R₂**, **P_v1 = ½Re(V₁I₁*)**.
  원본 검산: **I₁ = I₂ = 2∠90°** → R₂ 전류 **0** → **P_R2 = 0[W]**, **P_v1 = 2[W]**
  (R₁ 소비 2W와 전력수지 일치, v₂는 0W 공급).
- ★★ **극성은 "값이 깨끗한 쪽"으로 확정했다**: 그림의 AC 전원 기호엔 +/− 표기가 없어 극성이 모호한데,
  두 전원을 **같은 방향(+ 위)** 으로 두면 I₁=I₂=2∠90°·P_R2=0·P_v1=2W로 전부 정수/45° 배수가 되고,
  반대로 두면 I₂ = 6/√5∠−26.57° 같은 값이 나온다. ⇒ **I₁=I₂ → R₂ 전력 0** 이 이 문제의 교육 포인트다.
- ★★ **오분류(수정됨)**: 전용 항목이 없어 형제 **`ac_rl_average_power`(임용 8번, 단일 전원)** 가 가로챘고
  생성물의 **정답이 빈 문자열**, 풀이는 *"모든 branch 전류가 0A"* 라는 엉터리였다(**issues=0으로 통과**).
  ⇒ 판별선 = **교류 전원 2개** + 평균전력 + 페이저 전류/메시 요구. **그 블록 바로 앞**에 0-PRE로 둔다.
  양보: 중첩의 원리·테브난/최대전력·공진·역률·전원 크기 역산·종속전원·스위치 과도·오실로스코프.
- ★★ **값은 역설계로 열거한다**: 전원을 먼저 고르면 전류가 지저분해진다 → **깨끗한 전류 I₁·I₂를 먼저 고르고
  전원을 역산**한 뒤, 전원이 **가우스 정수 + 깨끗한 극형식**(√8∠45°·2∠180° 같은 45° 배수)인 조합만 채택한다.
  그러면 전류·전력이 자동으로 깔끔하다. 필터: P_R2·P_v1이 0.5 배수, P_v1 > 0, **원본 튜플 제외**.
  ★ P_R2가 **0인 경우와 아닌 경우를 모두** 낸다 — 항상 0이면 [단계 2]의 답이 노출된다.
- 모드: **exam_similar**=원본 배치 / **exam_variant**=**리액티브 소자 종류 교환**(상단우·하단좌 L, 하단우 C).
- 파일: `lib/generation/topologies/acTwoSourceMeshPower.ts`(결정론 generator + 공용 매처)·
  `lib/pipeline/runAcTwoSourceMeshPowerPipeline.ts`(3단계 + `detectAcTwoSourceMeshPower`)·
  `lib/renderers/acTwoSourceMeshCircuitRenderer.ts`(직사각 2-메시 fixed-slot: 좌·우 AC 전원(+ 위) +
  상단 2소자(I₁·I₂ 화살표) + 가운데 세로 R₂ + 하단 2소자). circuitType `ac_two_source_mesh_power`,
  diagramType `ac_two_source_mesh_circuit`. types·circuitType·renderers/index·validateProblem·
  classifier(0-PRE, `ac_rl_average_power` **앞**)·route(dispatch 체인 최상단+semantic+topology 우회)·
  `smokeOriginalRouting`(+1줄) 등록.
- ★ 표기 gotcha: 음수는 **유니코드 마이너스(−)** 로 통일(`numFmt`) — ASCII 하이픈이 섞이면 같은 문항에
  `−j2`와 `-2`가 공존한다(실측). 전력·전류는 정수/0.5 배수라 전역 분수 변환기가 개입하지 않는다.
- 검증: tsc 0 · 신규 파일 eslint 0 / `scripts/smokeAcTwoSourceMeshPower.mjs` **36/36**(감지 3 + 형제 양보 6 +
  4과목 분류 + 형제 회귀 + 원본 물리 10 + 생성물 48개 재검산(**연립식 잔차 0 + 전력수지 독립 검증**) +
  값 품질·원본 튜플 미생성·풀 비중첩 + 렌더 겹침 0 + 발문·표기) / `smokeOriginalRouting` **54/54** /
  형제 무회귀(oscPhaseL 40/40·acDeltaWye 47/47·acSupSourceDesign 28/28·acTheveninDependent 24/24) /
  **원본 이미지 E2E issues=0**(R₁2·R₂1·C₂−j2·C₁−j2·L j2, V₁=10·V₂=2∠180° → I₁=√8∠45°·I₂=2∠90°·
  P_R2=2W·P_v1=10W — 손검산·전력수지 일치).

## **오실로스코프 파형 판독** → V_m·f·위상차 α → 미지 인덕턴스 L (임용 11번 회로이론 — `oscilloscope_phase_l`) 전용 archetype

- 원본: (가) **오실로스코프 화면**(㉠=Ch1의 v_s, ㉡=Ch2의 v_L, Ch1 2.00 V/div·Ch2 1.00 V/div·500µs/div) +
  (나) 회로 `v_s(t) ─ 2000π/√3[Ω] ─ 마디 A`, 마디 A에 **미지 L**(v_L 측정),
  `마디 A ─ 1H ─ 마디 B ─ 1H ─ 접지` 가지가 병렬. 〈해석 절차〉 [1] V_m·f [2] α와 v_L(t) [3] L.
- ★★ **원본 값은 화면을 8배 확대해 격자로 확정했다** ([[feedback_verify_wiring_by_zoom]]):
  10 div × 8 div 격자. 실선의 영교차가 x=205→720→1240px → **주기 6 div = 3000µs → f = 1000/3[Hz]**,
  진폭 4 div × 2.00 V/div → **V_m = 8[V]**. 점쇄선은 **1 div 앞서고** 진폭 4 div × 1.00 V/div → 4[V].
  ⇒ **α = (1/6)×360° = 60°**. (골·마루로 눈대중하면 0.4~0.7 div로 흔들린다 — **영교차**로 재라.)
- ★ 물리(닫힌형): v_L/v_s = Z/(R+Z), Z = jX → **∠ = 90° − arctan(X/R) = α** 이고
  **|v_L|/|v_s| = cos α**(두 채널 진폭이 이 관계를 만족 — 자체 검산).
  X = R/tanα, L_eq = X/ω, **L = L_eq·S/(S − L_eq)** (S = 직렬 가지 합).
  원본 검산: X = R/√3 = 2000π/3 = ω → L_eq = 1H → **L = 1·2/(2−1) = 2[H]**.
- ★★ **α = 60°는 설계상 강제된다**: 학생이 격자에서 읽으려면 (1) α=(α div/T div)×360°가 눈금으로 떨어지고
  (2) **cos α = 두 채널 진폭비**도 눈금으로 떨어져야 한다. 45°(cos=√2/2)·30°(√3/2)는 (2)가 깨진다.
  **60°(cos=1/2)** 만 둘 다 만족하며 그때 T=6 div·α=1 div로 원본 화면이 그대로 나온다.
  ⇒ α는 고정하고 **V_m·f·R·소자값**을 변형한다(값 공간은 그것만으로 충분하다).
- ★★ **오분류(수정됨)**: 전용 항목이 없어 **`universal_ac`** 로 떨어졌고 생성물의 정답이 **"(query 없음)"**,
  풀이는 *"AC 정상상태 phasor 해석 — 입력 ω = 10000 rad/s"* placeholder, figure는 generic `analog_netlist`
  (**오실로스코프 화면 자체가 소실**)였다. **validator는 issues=0으로 통과** — generic 경로 실패의 전형.
  ⇒ 판별선 = **화면 판독 신호**(V/div·µs/div·Ch1/Ch2) + 위상차/파형, **0-PRE(과목 무관)**.
- ★★ **bare "과도응답"을 양보 근거로 쓰지 마라 (실측)**: Vision이 이 **정상상태** 원본을
  *"RL 회로의 **과도응답** 분석"* 으로 요약한 회차가 있다(3/3 관측). 그 낱말에 양보를 걸었더니 원본이 통째로
  빠져나갔다(스모크가 즉시 잡음). → 양보는 **구조 신호**(스위치·t=0·시정수·계단 입력)로만 건다.
- 모드: **exam_similar**=원본(인덕터 3개, v_L이 **60° 앞섬**, L 도출) /
  **exam_variant**=**소자 종류 교환**(커패시터 3개, v_C가 **60° 뒤짐**, C 도출).
  구조·절차·진폭비(cos60°=1/2)는 동일하고 위상 부호만 거울. 직렬 가지 합성만 L=합 / C=곱÷합으로 바뀐다.
- ★ 값은 규칙 열거 + 필터: R = **Mπ/√3**(M = 10⁶·L_eq/s) 형태가 되도록 s·L_eq를 고르고,
  화면 진폭 div·V/div·미지값·직렬합성이 **전부 정수**가 되게 필터. **원본 튜플 제외**, 유사·변형 값 비중첩.
- ★★ **표기 gotcha 3건(모두 실측)** — 전역 분수 변환기(1-4-3)가 소수를 제각각 바꾼다:
  ① `0.50 V/div` → **`1/2 V/div`** → **V/div 후보를 정수 {1,2,5}로 제한**(원본도 1.00·2.00이다).
  ② 리액턴스를 소수로 적으면 `1047.198[Ω]` → **기호로 적는다**(`X = R/√3 = Mπ/3`).
  ③ 진폭비를 `0.5`로 적으면 변환기가 손댄다 → **기약분수 `1/2`** 로 적는다.
  스모크가 발문·조건·정답·풀이에 **소수점이 하나도 없음**을 단언한다.
- 파일: `lib/generation/topologies/oscilloscopePhaseL.ts`(결정론 generator + 공용 매처)·
  `lib/pipeline/runOscilloscopePhaseLPipeline.ts`(3단계 텍스트 + `detectOscilloscopePhaseL`)·
  `lib/renderers/oscilloscopePhaseCircuitRenderer.ts`((가) **스코프 화면 렌더러 신설** — 10×8 격자·중앙축 눈금·
  실선/점쇄선 2채널·α 화살표·Ch1/Ch2/µs-div 표기 / (나) 회로). circuitType `oscilloscope_phase_l`,
  diagramType `oscilloscope_screen`·`oscilloscope_phase_circuit`.
  types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·route(dispatch **체인 최상단**+semantic+
  topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- ★ semantic gotcha: 파형은 **주어지는 자료**(학생이 그리는 게 아니다) → `hasWaveformEvolution`을 켜지 마라
  (켜면 IO-waveform split 요구가 붙는다 — `opamp_analog_summer` 선례). `requiresMultiFigure`만 켠다.
- ★ 렌더 gotcha: ㉠·㉡ 지시선 끝은 **파형 함수를 실제로 평가해** 찍는다. 상수 비율로 찍었더니 빈 공간이나
  남의 파형을 가리켰다(시각검증에서 발견).
- 검증: tsc 0 · 신규 파일 eslint 0 / `scripts/smokeOscilloscopePhaseL.mjs` **40/40**(실측 오요약 회차 포함 감지 4종 +
  형제 양보 5종 + 4과목 분류 + 원본 물리 11(**복소 임피던스 독립 재검산** 포함) + 생성물 48개 재검산 +
  값 품질·원본 튜플 미생성·풀 비중첩 + 렌더 겹침 0 + 발문·소수 0) / `smokeOriginalRouting` **53/53** /
  형제 무회귀(acDeltaWye 47/47·acTheveninDependent 24/24·acSupSourceDesign 28/28·rlcStateEquation 19/19·
  switchedRlcSourceFree 19/19·acTheveninDesignAb 18/18) / **원본 이미지 E2E 양모드 issues=0**
  (유사 50µs/div·R=20000π/√3 → V_m=4V·f=10000/3Hz·L=2H / 변형 C=3µF — 모두 수기·복소 검산 일치) /
  헤드리스 Chrome 시각검증(원본 화면 배치 재현).

## 교류 브리지 + **Δ-Y(델타-와이) 변환** → 등가 임피던스 Z_AB → 전류 크기 a (임용 2번 회로이론 — `ac_delta_wye_bridge`) 전용 archetype

- 원본: 단자 A(상)·B(하) 사이 **5-arm 브리지(다이아몬드)** — 좌상 j2·우상 2·**가운데 가교 −j2**·좌하 j2·우하 2.
  (나)는 **상단 델타(A, 좌마디, 우마디)를 Y로 변환**한 등가 회로(좌하·우하 arm은 그대로 남는다).
  요구 = 단자 A-B의 **등가 임피던스 Z**와, V=20∠0° 인가 시 **I=a∠−45°** 의 **a**.
- ★ 물리(닫힌형, GPT 없음): Δ→Y는 `각 Y 팔 = (그 마디의 두 Δ 변의 곱)/(Δ 세 변의 합)`.
  · 상단 Δ 세 변의 합 = j2 + 2 − j2 = **2 (실수)** — 리액턴스가 상쇄되는 것이 이 회로의 핵심이다.
  · Z_A = j2, Z_1 = 2, Z_2 = −j2 → 두 가지 = **(2+j2)** 와 **(2−j2)** = **켤레쌍** → 병렬 = **2(순저항)**
  · **Z_AB = j2 + 2 = 2+j2 = 2√2∠45°** → **a = 20/(2√2) = 5√2 ≈ 7.07**
- ★★ **값 규칙 (예시 hardcode 금지)**: 상단 델타 3소자를 같은 크기 X로(jX·X·−jX), 하단 2 arm을 같은 크기 t로
  (jt·t) 두면 **항상** Z_A=jX·Z_1=X·Z_2=−jX 이고 두 가지가 켤레쌍이 되어
  **Z_AB = ((X+t)/2)(1+j) = k√2∠45°** 로 **위상이 정확히 45°** 다 → 원본의 `I = a∠−45°` 형식이 그대로 유지된다.
  a = |V|/(k√2) = **m√2** (m = V/(2k)). 필터: **X·t 정수 + X+t 짝수**(k 정수) + m 정수 2~12. **원본 튜플(2,2,20) 제외**,
  유사·변형 풀 절반 분할. ※ 이 규칙은 **Δ-Y를 전혀 쓰지 않는 노드해석**으로 220/220 교차검증했다(스모크).
- 모드: **exam_similar**=원본 배치(좌상 L·가교 C·좌하 L → 유도성, I=a∠−45°) /
  **exam_variant**=**소자 종류 교환**(좌상 C·가교 L·좌하 C → 용량성, I=a∠+45°). 구조·Δ-Y 절차는 동일, 답이 켤레 거울.
- ★★ **오분류(수정됨)**: 전용 항목이 없어 **`ac_parallel_branches`(임용 5번)** 가 가로챘다(서버 로그 실측:
  `reclassified=ac_parallel_branches`, `figures=analog_netlist`) — 그 형제의 조건이 "L≥2 + C + R + 단자 a·b 없음"으로
  넓어 이 브리지가 그대로 걸린다. 생성물은 **전류원·가지 전류 페이저 문제**로 통째 변질됐고
  **validator는 issues=0으로 통과**했다(검증기가 못 잡는 유형의 실패). ⇒ 판별선 = **Δ-Y 변환**(형제가 쓰지 않는 고유 절차),
  **0-PRE(과목 무관)** 로 `ac_parallel_branches`·`universal_ac` **앞**에 둔다. 양보: 최대(평균)전력·3상 결선·종속전원.
- ★★ **낱말에 걸지 마라 (실측 E2E)**: 처음엔 `등가\s*임피던스`를 요구했더니, Vision이 같은 원본을
  *"**특정** 임피던스를 구하고"* 로 요약한 회차에서 통째로 미발화해 다시 형제에게 뺏겼다.
  → `임피던스|impedance|등가 회로` 수준으로 넓혔다(CLAUDE.md 규칙 2). Δ-Y 시그니처가 이미 강한 판별자다.
- ★ **분류기·감지기는 매처를 공유한다**: `matchesDeltaWyeSignature`/`matchesDeltaWyeAsk`/`yieldsDeltaWyeToSibling`을
  `lib/generation/topologies/acDeltaWyeBridge.ts`에 두고 **classifyCircuitType과 detect가 함께 import**한다.
  (두 곳에 정규식을 복제하면 한쪽만 고쳐져 조용히 드리프트한다 — 이 프로젝트에서 반복된 사고.)
- ★★ **표기 gotcha 2건 (둘 다 실측)**:
  ① 답이 무리수(k√2)라 **소수 근삿값을 적으면 route의 전역 분수 변환기**(1-4-3)가 `4.243 → 140/33`으로 뭉갠다
     → **근호 형태로만** 적는다(`≈` 금지).
  ② k가 **반정수**면 변환기가 `Z = 5/2 + j2.5`·`|Z|² = 5/2² + 5/2²`처럼 소수/분수를 뒤섞고 `5/2√2`가 모호해진다
     → **값 규칙 단계에서 X·t를 정수 + X+t 짝수로 강제**해 문항 전체에서 소수를 없앤다(포맷터로 때우지 말 것).
  스모크가 발문·조건·정답·풀이에 **소수점이 하나도 없음**을 단언한다.
- 파일: `lib/generation/topologies/acDeltaWyeBridge.ts`(결정론 generator + 공용 매처)·
  `lib/pipeline/runAcDeltaWyeBridgePipeline.ts`(3단계 텍스트 + `detectAcDeltaWyeBridge`)·
  `lib/renderers/acDeltaWyeBridgeCircuitRenderer.ts`((가) 다이아몬드 5-arm + 점선 박스 + 전원·I 화살표 /
  (나) Y 세 팔은 **빈 박스**(학생이 [단계 1]에서 도출) + 하단 2 arm은 원본 그대로).
  circuitType `ac_delta_wye_bridge`, diagramType `ac_delta_wye_bridge_circuit`/`ac_delta_wye_equiv_circuit`.
  types(DiagramType+payload)·circuitType·renderers/index·validateProblem `CIRCUIT_FIGURE_TYPES`·classifier(0-PRE)·
  route(dispatch **체인 최상단**+semantic(등가·multi on)+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- ★ 렌더 gotcha: 전원 극성은 **위가 +** 다(전류 I가 단자 A로 유입) — 처음에 뒤집혀 있었다(시각검증에서 발견).
  대각 arm 라벨은 다이아몬드 **바깥쪽 법선**으로 밀어 가교 소자 라벨과 겹치지 않게 한다(규칙 #6).
- 검증: tsc 0 / `scripts/smokeAcDeltaWyeBridge.mjs` **47/47**(실측 오분류 회차 3종(‘특정 임피던스’ 회차 포함) +
  표기 변형 3 + 형제 양보 6 + 4과목 분류 + 원본 물리 10(**노드해석 독립 재검산 포함**) +
  생성물 48개 재검산(Δ-Y 결과 = 노드해석) + 원본 튜플 미생성 + 유사/변형 풀 비중첩 + 발문·표기(소수 0) + 렌더 겹침 0) /
  `smokeOriginalRouting` **52/52** / 형제 무회귀(acTheveninDesignAb 18/18·acTheveninTwoBox 37/37·
  acTheveninDependent 24/24·acSupSourceDesign 28/28·rlcStateEquation 19/19·reactiveNormalization 29/29) /
  **원본 이미지 E2E 양모드 issues=0**(유사 3문항 모두 수기·노드해석 검산 일치) / 헤드리스 Chrome 시각검증.

## AC 휘트스톤 브리지 + 테브난 + 최대평균전력 (임용 7번 — `ac_bridge_max_power`) 전용 archetype
- 원본: 교류원 V(∠0°) + 다이아몬드 4-arm 브리지(좌상 −jXc1·우상 R2·좌하 jXl·우하 R4) + 단자 A·B에 부하 R_L. 단자 개방 시 V_A·V_B·테브난(Z_TH) 구하고 순저항 최대평균전력 R_L 도출.
- ★ generic universal_ac는 브리지(다이아몬드+A·B 가교) 구조를 잃고 임의 병렬회로로 변질 → figure·답 모두 깨짐 → 전용 결정론 archetype.
- 닫힌형: V_A=V·Xl/(Xl−Xc1)(좌 리액티브 분압), V_B=V·R4/(R2+R4)(우 저항 분압), V_TH=V_A−V_B. Z_TH=(Z1∥Z3)+(Z2∥Z4)=Rpar−jXpar (Xpar=Xc1·Xl/(Xl−Xc1)). R_L=|Z_TH|, P_max=|V_TH|²·R_L/((Rpar+R_L)²+Xpar²). 원본(V=4·−j2·6·j4·6)→V_A=8·V_B=2·V_TH=6·Z_TH=3−j4·R_L=5·P=2.25.
- 값은 규칙 기반(Pythagorean (Rpar,Xpar)로 |Z_TH| 정수, V는 V_A·V_B·V_TH 정수 되게), 원본 튜플 제외. classifier 0-PRE-AC-BRIDGE-MAXPOWER: I=0+V≥1+L>0+C>0+테브난+최대전력+(단자A·B/V_A·V_B/브리지) → universal_ac 앞 매치. 2전원 theveninMaxPower와 I=0로 구분. analyzeImage에 브리지 추출 규칙(테브난·최대전력·단자A·B 보존).
- 파일: `lib/generation/topologies/acBridgeMaxPower.ts`·`runAcBridgeMaxPowerPipeline.ts`(3단계)·`lib/renderers/acBridgeCircuitRenderer.ts`((가) 다이아몬드 4-arm 대각소자 회전배치 + 중앙 R_L, (나) 전원단락 브리지=Z_TH + 중앙 R_L). diagramType `ac_bridge_circuit`/`ac_bridge_thevenin_circuit`. semantic normalize(등가·multi 유지, 파형·상태 면제).

## OPAMP 유한 개방루프 이득 + 블록도 (임용 11번 — `opamp_finite_gain_block`) 전용 archetype
- 원본: 단일 OPAMP, 개방루프 이득이 ★유한★(A(s)=A₀ω₀/(s+ω₀)). (가) 회로: V_in ─ R₁ ─ 반전입력 V⁻ ─ R₂(피드백) ─ V_out, V⁺=GND. (나) 블록도: V_in→α→Σ→A(s)→V_out, V_out→β→Σ 피드백(diagramType=`block_diagram`, A(s)는 삼각형·α·β는 사각형).
- ★ **오분류 차단 (근본 원인)**: 〈해석 절차〉의 "반전 입력 단자의 전압"이 `detectOpampArchetype`의 `score.inverting`을 띄워 **단순 이상적 반전증폭기(INVERTING_AMP)로 변질**(실측: O1=−9.9V garbage). 유한이득 A(s)·블록도(나)·중첩 α·β·V⁻ 구조를 전부 잃음 → 전용 결정론 archetype 필수.
- **닫힌형 해 (3단계, GPT 없음)**: [1] 중첩 — α=R₂/(R₁+R₂), β=R₁/(R₁+R₂). [2] V_out=−A(s)·V⁻(V⁺=0) 대입 → V⁻(1+β·A(s))=α·V_in → **A_s=α/(1+β·A(s))**. [3] DC(s→0, A=A₀): **V⁻=α·V_in/(1+β·A₀)** [mV, 소수 첫째 자리 반올림]. 원본(1k·99k·10⁵·0.1V)→α=0.99·β=0.01·**V⁻≈0.1mV**. ★ 유한이득이라 V⁻은 0(가상접지)이 아닌 작은 유한값 — 학습 포인트.
- ★ **Vision 비결정성 대응 (핵심)**: 분류는 `text`(topic·interpretation·relatedConcepts·fillInTheBlanks) 키워드 의존 → Vision이 "개방 루프 이득/블록도/중첩"을 흘리면 generic opamp로 추락(실측 1회 발생). → `analyzeImage`에 전용 추출 규칙 추가(개방 루프 이득·A(s)·블록도·중첩의 원리·α·β·반전입력 V⁻을 topic/interpretation에 보존 강제 + "이상적 OPAMP·가상단락" 오기 금지). 보강 후 분류 6/6 안정.
- classifier: electronics opamp 분기에서 **generic opamp·integrator·cascade 앞**에 매치 — `opampCtx + finiteGainKw(개방루프이득·A(s)·A₀·ω₀·차단주파수·직류이득) + (blockDiagramKw OR 중첩 α·β)`. 값은 규칙 열거(R쌍·A₀·V_in)+표시가능 V⁻ 필터, 원본 튜플 제외. exam_variant는 다른 값 슬라이스(고정 토폴로지라 소자종류 변경 없음).
- 파일: `lib/generation/topologies/opampFiniteGainBlock.ts`(결정론 generator)·`runOpampFiniteGainBlockPipeline.ts`(3단계 텍스트 + (나) 고정 블록도)·`lib/renderers/opampFiniteGainCircuitRenderer.ts`((가) 전용 fixed-slot, (나)는 기존 `blockDiagramRenderer` 재사용). circuitType `opamp_finite_gain_block`, diagramType `opamp_finite_gain_circuit`. types·circuitType·renderers/index·validateProblem `CIRCUIT_FIGURE_TYPES`·route dispatch(opamp 앞)+semantic normalize(파형·상태·등가 off, multi on)+topology-driven 우회·smokeOpampFiniteGainE2E 등록.

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
- ★★ **제너 심볼 방향이 뒤집혀 있었다** (사용자 신고 2026-08-04 "제너 다이오드 방향이 반대 아니야?"):
  원본을 6배 확대해 확인한 결과 **캐소드 바가 위 · 삼각형 꼭짓점이 위**(A 노드에서 아래로 항복 전류)인데,
  렌더러는 꼭짓점을 `cy + h`(아래)에 찍고 bar를 삼각형 **밑변 쪽**에 붙여 그렸다 — 주석은 "cathode 위"라고
  적혀 있었는데 좌표가 반대였다(주석과 코드가 어긋난 채 통과).
  · **다이오드 심볼 규칙: bar(캐소드)는 삼각형의 꼭짓점 쪽에 붙는다.** 밑변 쪽에 붙이면 방향이 뒤집힌 그림이다.
  · 같은 오류를 `opampSeriesRegulatorCircuitRenderer.ts`가 **복사해 갖고 있었다**(두 곳 동시 수정).
    `zenerShuntRegulatorCircuitRenderer.ts`의 `zenerV`는 처음부터 올바르다(꼭짓점 위) — 그쪽이 기준 구현.
  · 검증: `scripts/smokeZenerSymbolOrientation.mjs` **4/4** — 세 렌더러의 SVG를 파싱해
    (a) 꼭짓점 y < 밑변 y (b) 캐소드 bar가 **꼭짓점 y**에 위치를 단언하고,
    **뒤집힌 기하를 넣어 검사기가 실제로 잡는지 자체 검증**까지 포함한다(검사기가 무력한 채 초록이 되는 것 방지).
    + `smokeZenerShuntRegulator` 18/18 무회귀 · tsc 0 · 헤드리스 Chrome 시각검증(원본과 동일 방향).
  · ★ 교훈: **심볼 방향은 주석을 믿지 말고 좌표로 확인**할 것. 그리고 심볼 헬퍼는 렌더러마다 복사되므로
    한 곳에서 틀리면 형제 렌더러도 같이 틀려 있다 — 고칠 때 `grep`으로 전부 확인한다.

## OPAMP(오차증폭기) 직렬형 정전압 안정화 회로 (임용 30번 전자회로 — `opamp_series_regulator`) 전용 archetype
- 원본: 제너 기준전압 V_z + **연산증폭기(오차증폭기)** + **직렬 패스 NPN 트랜지스터**(C=V_DD·E=V_o, 이미터 팔로) + 피드백 분압(R_a·R_b). OPAMP (+)=V_z, (−)=분압 탭 M, 출력→베이스(R_s bias). 부하 R_L.
- ★ **위 zener_bjt_regulator(임용 8번, OPAMP 없는 션트형)와 토폴로지·물리가 완전히 다름 — OPAMP가 discriminator**. 원본이 OPAMP 있는데도 (제너+BJT+해석단계)만으로 zener_bjt_regulator로 오라우팅되던 것 수정("이게 원본인데 이렇게 나와" 신고). 션트형 archetype으로는 절대 재현 불가 → CLAUDE.md "회로 figure 본질적으로 다른 케이스" 예외로 전용 archetype 신설.
- **물리(이상 OPAMP 가상단락, 닫힌형 3단계, GPT 없음)**: V_−=V_+=V_z, V_−=V_o·R_b/(R_a+R_b) → **V_o = V_z(1 + R_a/R_b)**.
  - [단계1] V_o = V_z(1+R_a/R_b).  [단계2] I_f = V_z/R_b(=V_o/(R_a+R_b)), I_L = V_o/R_L.  [단계3] I_E = I_L + I_f.
- 모드: **exam_similar**=V_o·전류 도출(원본 구조) / **exam_variant**=역문제(목표 V_o 주고 피드백 저항 R_a 설계, 렌더러가 R_a를 점선 미지 박스로 표시). "구하는 양" 교환.
- ★ **값은 규칙 열거+필터**(예시 hardcode 금지): (V_z·R_b·k=R_a/R_b·V_DD·R_L) 열거 → V_o 정수(4..24)·V_DD 여유≥3·I_f 0.05배수·I_L 0.5배수 필터. 원본 튜플(V_z10·R_a=R_b20k·V_o20·V_DD30) 제외.
- ★ **분류(PRE-SUBJECT, subject 무관)**: `OPAMP 맥락 + 제너 + 트랜지스터 + 정전압 안정화` → opamp_series_regulator. opamp cascade/generic·two_stage(순수 증폭)보다, zener_bjt_regulator(전자 subject 내)보다 먼저 매치. route에서 subject를 electronics로 보정(오선택 대비). analyzeImage에 "OPAMP+제너+트랜지스터 직렬 정전압" 추출 규칙(★OPAMP 누락 금지=핵심 판별자, 션트형·V_z+V_BE로 오요약 금지).
- 파일: `lib/generation/topologies/opampSeriesRegulator.ts`·`runOpampSeriesRegulatorPipeline.ts`·`lib/renderers/opampSeriesRegulatorCircuitRenderer.ts`(전용 fixed-slot). circuitType `opamp_series_regulator`, diagramType `opamp_series_regulator_circuit`. types·circuitType·renderers/index·validateProblem·route(dispatch+subject보정+semantic normalize: 파형·상태·등가·multi off)·analyzeImage 규칙·smokeAll[+1]·smokeOpampSeriesRegulator 등록.
- ★ **렌더러 배치 = 원본(임용 30번) 그대로** (사용자 반복 피드백으로 정정):
  - **트랜지스터는 수평 직렬 패스**(`npnH` — 수직 npn을 90° CCW 회전): collector(좌)=V_DD·emitter(우)=V_o·base(하단)←OPAMP 출력. V_DD와 V_o 사이 상단 수평선에 놓임. (사용자 "BJT의 컬렉터와 에미터가 수평이 되게 본문처럼".)
  - **R_s(1k)는 제너 위 = 제너 바이어스 저항**: `V_DD ─ R_s ─ V_+ 노드 ─ 제너 ─ GND`. V_+ → OPAMP(+). ★ R_s는 트랜지스터 베이스 풀업이 아님(OPAMP 출력이 베이스를 직접 구동). R_s는 제너 바이어스만 담당 → 정답(V_o·I_f·I_L·I_E) 불변. (사용자 "R_s가 제너다이오드 위에 와야해".)
  - OPAMP 중앙(+=V_+·−=M), 출력이 위로 베이스 구동. 피드백 분압 R_a/R_b **우측 세로 스택**(V_o→GND), 중점 M→OPAMP(−). 부하 R_L 출력단, V_o 우상단 단자.
  - ★ 끊김/정돈 수정(사용자 "회로가 좀 끊겨있어"): 제너 cathode/anode 리드 연속(anode 단선 해소), 피드백 배선을 OPAMP 하단 아래로 우회(본체 관통 방지), `resistorV`(중앙 밴드≤84px+리드)로 긴 R_L도 균일 톱니, Q/I_E 라벨 분리.
  - ★ 교훈: 사용자가 "본문(원본)처럼"이라고 하면 **원본 이미지의 소자 방향·위치를 그대로** — 특히 직렬 패스 트랜지스터는 **수평**(C-E 수평축), R_s는 **제너 바이어스**(제너 직상단)임을 원본에서 읽을 것.
- 검증: tsc 0 new err(theveninDep 8 baseline만)·Vision 분류 원본 이미지 4/4 재현(opamp_series_regulator)·E2E 양모드 totalIssues=0 수기검산 일치(V_o=V_z(1+R_a/R_b), R_a=R_b(V_o/V_z−1))·Edge 시각검증(원본 토폴로지 재현: 오차증폭기+제너 기준+직렬 패스+피드백 분압, 겹침 없음)·smokeAll 32/32 무회귀.
- ★ 교훈: **OPAMP 유무가 두 레귤레이터 유형의 핵심 판별자** — (제너+BJT)만으로 분류하면 OPAMP 있는 직렬형이 OPAMP 없는 션트형으로 샌다. analyzeImage에 "OPAMP 누락 금지" 명시 + PRE-SUBJECT 분류로 흡수.
- ★★ **원본은 동작 판정형 객관식이다 — 수치 유도형으로 재현하면 학습목표가 사라진다** (2026-08-14 정정.
  위 줄에 "개념형이어도 수치 유도형으로 재현"이라 적었던 것이 이 유형에서는 틀렸다):
  원본 〈보기〉 ㄱ~ㅂ은 (1) 정전압 상태의 **트랜지스터 상태**(ㄱ ON/ㄴ OFF) (2) **출력전압**(ㄷ 10V/ㄹ 20V)
  (3) **부하 변동 시 보정 방향**(ㅁ ON/ㅂ OFF)을 묻는다. **정답 = ⑤ ㄴ·ㄹ·ㅂ**(사용자 답지 확인).
  · ㄹ: 귀환이 **분압 중점**에서 온다(원본 6배 확대로 확정) → V_o = V_z(1+R_a/R_b) = 20V.
  · ㄴ: **출력 단자가 개방(무부하)** 이다. 직렬 패스 소자는 부하가 요구하는 만큼만 흘리므로 공급할
    부하 전류가 없어 **차단(OFF)**. ★ R_a·R_b를 부하로 세면 "ON"으로 오판한다 — 그건 부하가 아니라
    출력을 되먹임하는 분압망이다(내가 처음 ②로 잘못 답한 원인).
  · ㅂ: V_o↑ → V_−↑ → 오차증폭기 출력↓ → 베이스↓ → 도통 감소(차단 방향) → V_o 복귀(부귀환).
  ⇒ 기존 수치형 3단계(I_f·I_L·I_E)로 내면 (1)·(3)이 통째로 사라진다(절대규칙 0) →
  **같은 archetype 안에 `isRegulatorOperationForm` 분기 추가**(유형 목록이 아니라 **형식 신호**로 판정:
  동작·상태 어휘 O + 수치 요구 X). 발문 = [1] V_o [2] 트랜지스터 상태 판정+근거 [3] 보정 방향 서술.
  변형은 [3]을 **"낮아지려 할 때"** 로 교환(구조·원리 동일, 방향만 거울).
- ★ 렌더러에 **`noLoad`** 를 가산적으로 추가(미지정이면 기존과 동일 — 형제 수치형 무회귀):
  R_L·I_L·dot을 생략하고 **하단 접지 레일을 분압기까지만** 그린다(부하 자리까지 뻗으면 끝이 떠 있는 배선이
  된다 — 시각검증에서 발견). ★ figure에 부하가 그려져 있으면 [단계 2]의 "차단"이 성립하지 않으므로
  **발문과 그림은 반드시 함께** 가야 한다.
- ★ 표기 gotcha: 값 공간의 **소수 제너전압(2.5V)** 때문에 조건에는 `V_z=2.5V`, 정답·풀이에는 전역 분수
  변환기(1-4-3)가 바꾼 `5/2`가 찍혀 한 문항 안에서 표기가 갈렸다(실측). **조건은 변환기를 거치지 않는다**는
  것이 핵심 — 포맷터로 때우지 말고 **값 공간에서 소수를 제거**했다(`V_Z_SET = [2,3,4,5]`).
- ★ 검증: `scripts/smokeOpampRegulatorForms.mjs` **435/435**(형식 감지 양·음성 5 + 두 형식 × 두 모드 × 6문항의
  3단계 계약 · 객관식 잔존 0 · **조건에 소수 0** · noLoad 설정 · 보정 방향 모드별 반대 · 동작형 분수 변환기 불변 ·
  무부하인데 R_L 언급 0 + **조건에서 V_z·R_a·R_b를 되읽어 V_o 재검산**) / `smokeOriginalRouting` 70/70 ·
  `smokeThreeStepMultipleChoice` 118/118 · `smokeActiveLowpassNotation` 338/338 무회귀 / tsc 0 /
  생성 API 양모드 issues=0 / 헤드리스 Chrome 시각검증(무부하 배치가 원본과 일치).
  ⚠️ 기존 `scripts/smokeOpampSeriesRegulator.mjs`는 옛 세션 image-cache를 읽는 E2E라 실행이 ENOENT로 죽는다
  (`smokeActiveLowpassFilter`와 같은 상태). 회귀 방어는 위 정적 스모크가 맡는다.

## 1차 능동 저역통과 필터 — 대역폭 분석 (임용 31번 전자회로 — `active_lowpass_filter`) 전용 archetype
- 원본: `v_i ─ R ─ 마디 P ─ OPAMP(+), P ─ C ─ GND` (입력단 RC 저역통과) + OPAMP 비반전 버퍼(R_f 피드백). **대역폭 = 차단주파수 f_c = 1/(2πRC)**. 질문: C(또는 R)를 바꿀 때 대역폭[Hz] 변화. 원본(R=50k·C 8n→16n·π=3.14) → f_c 398→199 → **약 200 감소(정답 ①)**.
- ★ **오분류(수정됨)**: 전용 archetype 없어 generic opamp 경로로 감 → **커패시터·필터·대역폭을 전부 잃고 단순 반전증폭기(Vs·R·R_f)로 변질**. C·필터 성격 소실 → 전용 archetype 필수.
- ★ **물리(닫힌형, GPT 없음)**: 1차 저역통과 대역폭 = f_c = 1/(2πRC). OPAMP 이득은 대역폭 불변(버퍼). [1]공식 [2]변경 전/후 f_c [3]Δf=f후−f전 → 약 N Hz 증가/감소. π=3.14.
- 모드: **exam_similar**=C 변경(원본, C 증가→대역폭 감소) / **exam_variant**=R 변경(C 고정, R 감소→대역폭 증가). 같은 원리, 바뀌는 소자만 다름.
- ★ **값은 규칙 열거+필터**: (R·C 조합, C2=2·C1 또는 R2=R1/2) → f_c 합리적 범위(90~2200Hz) 필터, **원본 튜플(50k·8n·16n) 제외**. "약" 답은 50 단위 반올림.
- ★ **분류(PRE-SUBJECT)**: `OPAMP 맥락 + C + (저역필터/대역폭/차단주파수/1차 필터)` → active_lowpass_filter. ★ **적분기/미분기(opamp_time_domain) 제외 가드**(둘 다 C 쓰지만 필터≠적분기). generic opamp 앞 매치. route subject→electronics 보정. analyzeImage에 "커패시터·필터·대역폭 보존, 반전증폭기·적분기로 오요약 금지" 규칙.
- 파일: `lib/generation/topologies/activeLowpassFilter.ts`·`runActiveLowpassFilterPipeline.ts`·`lib/renderers/activeLowpassFilterCircuitRenderer.ts`(전용 fixed-slot: v_i·R 수평·C 접지·OPAMP(−위·+아래)·R_f 피드백·v_o, 원본 배치). circuitType `active_lowpass_filter`, diagramType `active_lowpass_filter_circuit`. types·circuitType·renderers/index·validateProblem·classifier(PRE-SUBJECT)·route(dispatch+subject보정+semantic)·analyzeImage·smokeAll[+1]·smokeActiveLowpassFilter 등록.
- 검증: tsc 0 new err·**Vision 분류 원본 이미지 라우팅 성공**·E2E 양모드 totalIssues=0 수기검산 일치(f_c=1/(2πRC))·Edge 시각검증(원본 토폴로지: RC 저역통과+OPAMP 버퍼+R_f 피드백)·smokeAll 33/33 무회귀.
- ★ 교훈: OPAMP+C 회로에서 **필터/대역폭 키워드가 discriminator** — 없으면 generic opamp가 C를 흘려 반전증폭기로 변질. analyzeImage "커패시터·대역폭 보존" + PRE-SUBJECT 분류(적분기 제외 가드)로 흡수.
- ★★ **표기 gotcha — 전역 분수 변환기가 답을 뭉갰다** (2026-08-14 실측): 발문·풀이는 이미 3단계 서술형이었는데
  정답의 `≈ 398.1 Hz`가 **3981/10**, `796.2 Hz`가 **3981/5**, 풀이의 `π=3.14 대입`이 **π=157/50**으로 바뀌었다.
  변환기(1-4-3)는 **대괄호 단위가 바로 뒤에 붙은 소수만** 보호하므로 `[Hz]` 없이 쓴 주파수와 맨 `3.14`가 걸린다.
  ⇒ ① 주파수는 `hz()` 헬퍼로 항상 `398.1[Hz]` 형태 ② 풀이의 π는 **기호로**("π는 조건대로 계산" — 3.14 지시는
  본문·조건에만, 그쪽은 변환기가 안 건드린다) ③ 소자 값은 `25×10³`·`5×10⁻⁹` 지수 표기 ④ 음수는 유니코드 마이너스.
  Wien bridge design에서 겪은 것과 **같은 함정**이다.
- ★ 검증: `scripts/smokeActiveLowpassNotation.mjs` **338/338**(생성물 16개를 `fractionizeText`에 통과시켜
  **한 글자도 안 바뀜**을 단언 + "숫자 Hz"·3.14 노출·ASCII 하이픈 0 + 3단계 계약 + **조건에서 R·C를 되읽어
  f_c 독립 재검산**·증감 방향 + figure). `smokeThreeStepMultipleChoice` 118/118 · `smokeFractionText` 24/24 ·
  `smokeOriginalRouting` 70/70 무회귀.
  ⚠️ 기존 `scripts/smokeActiveLowpassFilter.mjs`는 **옛 세션의 image-cache 파일을 읽는 E2E**라 그 캐시가 지워지면
  실행 자체가 ENOENT로 죽는다(현재 상태). 회귀 방어는 위의 정적 스모크가 맡는다.
- ★★ **route 재검출 안전망 (stale analysis 방어, 사용자 "아직도 이렇게 나와")**: 분류(analyze) 5/5 정상인데 브라우저는 여전히 반전증폭기 → 원인은 **프론트(`app/page.tsx`)가 업로드 시 analysis를 React state에 저장하고 "생성" 때마다 재사용** → 수정 이전 분석(circuitType=generic opamp)이 state에 남아 generate로 전달(generate는 body의 circuitType 신뢰). → `detectActiveLowpassFilter(analysis)`(pipeline export, 분류기 동일 시그니처)를 route 상단(jk_sync_counter 안전망 옆)에서 실행 → stale이라도 텍스트가 "OPAMP+C+저역필터/대역폭"이면 `analysis.circuitType.type=active_lowpass_filter`+subject=electronics 강제. **opamp_series_regulator도 동일 안전망 추가**(임용 30번 같은 위험). 검증: stale(opamp_generic) analysis→generate가 active_lowpass_filter_circuit로 보정(figure·물리 정확). ★ 교훈: **프론트가 analysis를 state 캐시하면 분류기 수정만으로 부족** — generate 단계 재검출 안전망 필수(jk_sync_counter 선례). 사용자는 재업로드로도 해결되지만 안전망이 근본 방어.

## OPAMP 루프이득 L(s)=V_r/V_t + 특성방정식 좌반평면 안정도 (임용 12번 전자회로 — `opamp_loop_gain_stability`) 전용 archetype
- 원본: (가) 연산증폭기 응용 회로 — 반전 단자 쪽 분압(접지↔V⁻ R, V⁻↔출력 R), 비반전 단자 쪽에 **V_s가 R_S를 거쳐 인가**되고
  V⁺↔출력에도 R(정귀환 경로). (나) **V_s를 제거하고 귀환 루프를 끊은 뒤 V_t를 인가해 V_r을 얻는 회로**.
  개방루프 전달특성 **A(s) = A₀ω₀/s** (A₀ω₀ = 이득·대역폭 곱).
  〈해석 절차〉 [1] V⁺·V⁻를 V_t로 [2] L(s)와 특성방정식 **0 = 1 − L(s)**의 근 [3] 근이 **좌반평면**일 조건 → R_S·R 부등식.
- ★ 물리(닫힌형, GPT 없음): V⁻ = R_a/(R_a+R_f)·V_t, V⁺ = R_S/(R_S+R_p)·V_t →
  **L(s) = (A₀ω₀/s)·k**, k = R_S/(R_S+R_p) − R_a/(R_a+R_f) → **s = A₀ω₀·k** (실수 단일근).
  A₀ω₀>0이므로 좌반평면 ⇔ k<0 ⇔ **R_S < (R_a/R_f)·R_p**. 원본(R_a=R_f=R_p=R) → **R_S < R**.
- ★ 형제 archetype 어느 것도 재현 불가 — `opamp_finite_gain_block`(임용 11번)은 블록도+A(s)=A₀ω₀/(s+ω₀)로 V⁻[mV],
  `opamp_positive_feedback`(임용 6번)은 SW step 응답 상수 K, `opamp_finite_gain_offset`(임용 9번)은 출력 오프셋 V_B,
  Wien(발진기)은 **등식**(발진 조건)이지 안정도 **부등식**이 아니다. → 전용 archetype 신설.
- ★★ **substring 함정 (실측)**: **"개루프 이득"·"개방 루프 이득" ⊃ "루프 이득"**. 형제 유형이 전부 개루프 이득을
  언급하므로 `루프\s*이득`을 그대로 쓰면 (a) 이 분기가 형제를 통째로 삼키고 (b) 형제의 양보 가드가 자기 자신을
  양보시킨다(스모크 2건 실패로 즉시 노출됨). ⇒ **"비정현파 ⊃ 정현파" 선례와 동일하게 형제 어구를 먼저 지우고 검사**:
  `text.replace(/개방\s*루프\s*이득|개루프\s*이득|open[\s-]?loop\s*gain|폐루프/g," ")`. 분류기·감지기·형제 양보 가드 **3곳 모두**.
- ★ **분류 0-PRE(subject 무관)**: `연산증폭기 + 루프이득(고유 신호) + (특성방정식|좌반평면|안정)` → opamp_loop_gain_stability.
  **발진기(Wien·위상천이·Barkhausen)면 양보**. electronics opamp 섹션·형제 0-PRE보다 **위**(1-5 규칙).
- 모드: **exam_similar**=원본 배치(전원+R_S가 비반전 단자 → R_S < ratio·R) /
  **exam_variant**=전원+R_S 가지를 **반전 단자 쪽으로 교환** → **부등호 방향이 반대**(R_S > ratio·R). 같은 절차·다른 답.
- ★ 값은 전부 **기호**다(원본에 수치가 없다). 다양성은 저항 배수 (a,f,p)로: R_a=aR·R_f=fR·R_p=pR, 조건 `R_S < (a·p/f)R`.
  필터: a+f≤6, 비 (a·p/f)가 0.5배수이고 0.5~4. **원본과 도출량이 같은 조합(a=f ∧ p=1 → R_S<R) 제외**.
- 파일: `lib/generation/topologies/opampLoopGainStability.ts`·`lib/pipeline/runOpampLoopGainStabilityPipeline.ts`(+detect)·
  `lib/renderers/opampLoopGainStabilityCircuitRenderer.ts`(payload의 `variant`로 (가)/(나) 둘 다 렌더).
  circuitType `opamp_loop_gain_stability`, diagramType `opamp_loop_gain_circuit`(figure 2개, role original_circuit + equivalent_circuit).
  types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·route(안전망+subject 보정 2곳+semantic+dispatch+topology 우회)·
  analyzeImage 규칙·`smokeOriginalRouting`(+1줄) 등록.
- ★ 렌더 gotcha: **변형에서 기하까지 뒤집지 마라**. 분압망을 아래·전원 가지를 위로 옮기면 전원 수직 레인이 분압 배선을
  가로질러 **가짜 접점**처럼 보인다(시각검증에서 발견). 기하는 고정(분압=위 핀·전원=아래 핀)하고 **극성 기호(+/−)만 교환**한다.
- 검증: tsc 0 / `scripts/smokeOpampLoopGainStability.mjs` **40/40**(라우팅 4종 + 형제 회귀 4종(Wien·임용11·임용6·임용9) +
  substring 함정 회귀 6 + 원본 물리 7(경계 k=0·양측 부호) + 생성물 24개 재검산 + 렌더 구조) /
  `smokeOriginalRouting` **23/23** / **원본 이미지 E2E 양모드 issues=0**(유사 R_S<4R·변형 R_S>3R 수기검산 일치) / Edge 시각검증 /
  형제 스모크 무회귀(conceptNaming 18/18·muxImpl 7/7·dffStateDesign 6/6·ffMixed 7/7·jkExcitation 28/28·coercionGuard 5/5 등).

## OPAMP 유한 개방루프 이득 + 출력단 오프셋 전압원 V_B (임용 9번 전자회로 — `opamp_finite_gain_offset`) 전용 archetype
- 원본: 단일 OPAMP, 개루프 이득이 ★유한★(A₀). 되먹임 분압 `접지 ─ R₁ ─ V⁻ ─ R₂ ─ 출력 노드`, 입력 v_in(교류)은 **V⁺**에 인가.
  ★ OPAMP 출력 단자 V_D와 최종 출력 단자 V_out 사이에 **직류 전압원 V_B가 직렬로** 놓여 **V_out = V_D − V_B**.
  〈해석 절차〉 [1] β=R₁/(R₁+R₂)·V_D=A₀(V_in−βV_out) [2] **V_out=(A₀V_in−V_B)/(1+A₀β)** [3] 수치 대입.
  원본(A₀=100·R₁=99k·R₂=1k·V_B=1V·v_in=10sin2000πt) → β=0.99·1+A₀β=100·이득 1·오프셋 0.01 → **V_out=10sin(2000πt)−0.01 [V]**.
- ★ **오분류(수정됨) — 형제 `opamp_finite_gain_block`(임용 11번)이 가로챔**: 서버 로그 실측
  `reclassified=opamp_finite_gain_block → dispatch=opamp_finite_gain_block_pipeline, totalIssues=0`(조용히 변질).
  두 유형 모두 "개방루프 이득 A₀"를 쓰지만 그쪽은 **블록도 + A(s)=A₀ω₀/(s+ω₀)** 로 V⁻[mV]를 구한다.
  **판별자 = 출력단 직렬 전압원 V_B**(V_out=V_D−V_B) — 이건 형제 archetype으로 재현 불가.
- ★ **분류 0-PRE(subject 무관)**: `연산증폭기 + 유한 개방루프 이득(A₀) + (V_B 텍스트 OR 인벤토리 구조)` →
  opamp_finite_gain_offset. **블록도·A(s)·ω₀·차단주파수·주파수응답이면 형제에 양보**. electronics opamp 섹션보다 위(1-5 규칙).
  ★ **인벤토리 구조 신호**: Vision이 V_B를 말로 안 쓰는 실행 대비 — `OPAMP≥1 + V≥2 + R≥2 + C·L 없음`.
  형제(임용 11번)는 전원이 V_in **하나뿐**이라 V≥2가 이 유형 고유다(실측 inventory: R2·OPAMP1·V2).
- 모드: exam_similar / exam_variant는 값 풀 절반 분할(고정 토폴로지라 소자 종류 변경 없음).
- ★ 값은 규칙 열거+필터: `1+A₀β` 정수 · 이득 `A₀/(1+A₀β)` 정수(1~20) · 오프셋 `V_B/(1+A₀β)`가 소수 2자리로 딱 떨어짐.
  **원본 튜플(100·99k·1k·1V·10V·1kHz) 제외**.
- 파일: `lib/generation/topologies/opampFiniteGainOffset.ts`(결정론 generator, GPT 없음)·
  `lib/pipeline/runOpampFiniteGainOffsetPipeline.ts`(3단계 텍스트 + `detectOpampFiniteGainOffset` 안전망)·
  `lib/renderers/opampFiniteGainOffsetCircuitRenderer.ts`(전용 fixed-slot: 접지–R₁–V⁻ / 상단 R₂ 되먹임 / OPAMP 삼각형(A₀) /
  v_in 교류원→V⁺ / V_D–**직렬 배터리 V_B**–V_out 단자). circuitType `opamp_finite_gain_offset`,
  diagramType `opamp_finite_gain_offset_circuit`. types·circuitType·renderers/index·validateProblem `CIRCUIT_FIGURE_TYPES`·
  classifier(0-PRE)·route(안전망+subject 보정 2곳+semantic normalize+dispatch+topology 우회)·analyzeImage 규칙·
  `scripts/smokeOriginalRouting.mjs`(+3줄) 등록.
- ★ 렌더 gotcha: (1) 라벨은 반드시 `tex()`를 거칠 것 — 안 하면 `V_B = 5\,[\mathrm{V}]`가 그대로 찍힌다(시각검증에서 발견).
  (2) 배터리 기호의 **긴 판/짧은 판 길이 차를 크게** — 비슷하면 커패시터로 오독된다.
- 검증: tsc 신규 0 / `scripts/smokeOpampFiniteGainOffset.mjs` **28/28**(라우팅 6종(실측 요약·영문·V_B 미언급·과목 오선택
  + 형제 회귀 2종) + 안전망 4 + 원본 물리 4 + 생성물 24개 독립 재검산 + 렌더 구조) /
  `smokeOriginalRouting` **22/22**(신규 3줄 포함) / **원본 이미지 E2E 양모드 issues=0**(analyze가 이미 전용 유형으로 분류,
  3단계 발문·정답 관계식 정확) / Edge 시각검증.

## OPAMP positive feedback (정귀환) — 임용 6번 형식
- 회로: V_in(SW 통해) → V−, V+ → R_1 → GND, V_out → R_2 → V+ (★ V_out이 V+로 피드백, V−가 아님).
- A(s) = A_0·ω_0/(s+ω_0). 입력은 V−에 인가.
- **β = R_1/(R_1+R_2)** — V+ 전압 분배비. V+ = β·V_out.
- closed-loop transfer V_out/V−(s) = B·ω_0/(s + D·ω_0) 형태. B·D는 β·A_0로 표현.
- A_0 > 0, D < 0 (예: D = -A_0·β + 1 같은 음수)이면 우반평면 극점 → 시간영역에서 발산하는 응답.
- 단계별 풀이: (1) β=R_1/(R_1+R_2), (2) B·D를 β·A_0로 표현, (3) 라플라스 역변환으로 V_out(t) 도출 + K 상수.
- validator 인정 범위: V_out → V+ 피드백도 정상 OPAMP 회로 (V_out → V− 외에).
- 임용 6번은 SW가 t=0에 닫혀 V−(s) = 1/s 단위 step 입력으로 응답을 보는 형식.

## Maxwell 방정식 **개념 빈칸 채우기** (임용 24번 — `maxwell_concept_fill_blank`) — ★그림 없음★

- 원본: 〈보기〉 ㄱ~ㄹ의 참·거짓을 가려 고르는 객관식. 지식점은
  ㄱ **변위전류밀도의 정체**(체적전하 이동은 전도전류밀도 J다 — 원본의 **거짓** 항목)
  ㄴ ∇×H = J + ∂D/∂t에서 변위전류항을 넣은 **이유**(전류 연속방정식과의 정합)
  ㄷ 패러데이 — **자속밀도가 시불변이어도 면적**이 변하면 기전력 발생
  ㄹ Maxwell 방정식의 해 → 도체 내 **표피 깊이(skin depth)**
- ★ 사용자 지정: **빈칸 채우기**로 출제(임용 27번과 같은 처리). 〈보기〉 구조를 유지하되 핵심 용어·수식을
  ㉠~㉤로 비운다. 원본은 **틀린 서술**을 읽혀야 하지만 빈칸형에서는 **모든 문장이 참**이 되고
  학생이 정확한 용어·수식을 직접 써야 한다(개념 확인이 더 정밀해진다).
- ★ 값은 **사실 표 + 그룹 조합**으로 규칙 열거한다(예시 하드코딩 아님). Maxwell 4방정식 + 보조 개념
  (변위전류·연속방정식·표피깊이·δ = √(2/(ωμσ)))을 표에 담고, 지식 축이 겹치지 않도록 그룹에서 하나씩 뽑는다.
  정답은 표에서 그대로 나오므로 결정론이다. **원본 4지식점이 표에 모두 들어 있음을 스모크가 단언**한다.
- ★★ **dispatch 위치가 핵심**: 이 유형은 그림도 수치 given도 없어
  ① `isConceptNamingAnalysis`(개념 명칭형)와 ② `subjectKey === "electromagnetics"` **둘 다**
  회로 dispatch 체인을 통째로 우회하는 분기다. 그래서 **그 둘보다 앞**에 두어야 도달한다
  (`periodic_signal_dc_rms`와 같은 이유 — 뒤에 두면 실행조차 안 된다).
  분류기 0-PRE도 개념 명칭형 가드보다 앞에 둔다(CLAUDE.md 1-4-2).
- ★ 판별선: **Maxwell + 개념 서술**(변위전류·연속방정식·표피깊이·미분형·회전/발산).
  EM **계산** 유형(레지스트리)은 수치를 주고 "구하시오"라고 하므로 그 어투·단위 표기가 보이면 양보한다.
- 파일: `lib/generation/topologies/maxwellConceptFillBlank.ts`(사실 표 + 조합)·
  `lib/pipeline/runMaxwellConceptFillBlankPipeline.ts`(+`detectMaxwellConceptFillBlank`). **렌더러 없음**.
  circuitType `maxwell_concept_fill_blank`. types/circuitType·classifier(0-PRE)·route(안전망+semantic 전부 false+
  **개념 명칭형·EM 분기 앞 dispatch**)·`smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 · eslint 0 / `scripts/smokeMaxwellConceptFillBlank.mjs` **39/39**(라우팅 2종×2과목 +
  형제 양보 3종(EM 계산 2·회로) + **원본 4지식점 표 존재** + 사실 표 무결성 + 생성물 24개
  (사실 중복 0·빈칸↔정답 대응·**정답이 문항에 노출되지 않음**) + 빈칸 5개·그림 0·객관식 아님) /
  `smokeOriginalRouting` **68/68** / **생성 API E2E** 유사·변형·stale `unsupported`(개념형) 모두 issues=0 · figure 0.

## 컴퓨터 데이터 표현·산술 연산 **빈칸 채우기** (임용 27번 — `number_repr_fill_blank`) — ★그림 없음★

- 원본: 〈보기〉 ㄱ~ㅁ 다섯 항목의 참·거짓을 가려 고르는 **객관식**. 지식점은
  ① 2진 → 16진 변환 ② 1의 보수 ↔ 2의 보수 표현 ③ 1의 보수 덧셈의 **순환 자리올림** ④ n비트 2의 보수 범위
  ⑤ 8비트 2의 보수 덧셈과 **오버플로 판정**.
  (원본 ㄱ의 2진수는 F94₁₆에 대응하는 **111110010100₂** 로 읽었다 — 확대해도 마지막 자리가 흐리다.)
- ★ **사용자 지정 (2026-08-12)**: **빈칸 채우기**로 출제하되 **"유형은 비슷하게"** — 〈보기〉 5항목 구조를
  그대로 두고 값만 **㉠~㉤ 빈칸**으로 비운다. 원본 ㄷ·ㅁ은 서술이 모호해 참·거짓 논쟁 여지가 있는데,
  **결정론적으로 계산되는 값**을 묻는 형태로 바뀌면서 정답이 명확해진다(부수 효과).
- ★★ **3단계 계약을 형식으로 완화**: 절대원칙(객관식 → 3단계)의 취지는 "보기 고르기 → 학생이 직접 산출"이다.
  **㉠~㉪ 빈칸 3개 이상 + '빈칸/채우/들어갈/알맞은'** 이면 그 취지를 만족하므로
  `missing_three_step_question`을 내지 않는다(`validateProblem`). **유형별 예외 목록이 아니라 형식 판정**이라
  다른 빈칸형 유형에도 그대로 적용된다.
- ★ 모든 빈칸은 코드로 계산한다(GPT 없음): 진수 변환·1의 보수·2의 보수 해석·범위·8비트 덧셈과 오버플로.
  오버플로는 **같은 부호끼리 더했는데 결과 부호가 달라지는 경우**로 판정하고, 조건문에 그 정의를 명시한다.
- 모드: **exam_similar**=값 → 표현(2진→16진, −a의 1의 보수) / **exam_variant**=**방향 교환**(16진→2진,
  비트열을 1의 보수·2의 보수로 **읽어** 십진수를 답).
- ★★ **표기 gotcha 2건(둘 다 실측)**: ① 문장은 "n비트"인데 답이 `−2^15`처럼 구체 지수라 **모순**이었다 →
  비트 수를 문장에도 구체값으로 쓴다. ② `-40`(ASCII)과 `−4`(유니코드)가 한 문항에 공존했다 →
  `neg()`로 **유니코드 마이너스 통일**(스모크가 ASCII 하이픈 0건을 단언).
- ★ 판별선: bare **"진수"·"수 표현"은 너무 넓다** — 형제 `number_representation`(임용 4번, n비트 수 표현
  **고리 그림**)을 통째로 뺏었다(통합 라우팅이 잡음). 고유 작업인 **16진 변환 또는 오버플로**로 좁혔다.
  회로 낱말(플립플롭·게이트·저항·카운터…)이 보이면 양보한다.
- 파일: `lib/generation/topologies/numberReprFillBlank.ts`·`lib/pipeline/runNumberReprFillBlankPipeline.ts`
  (+`detectNumberReprFillBlank`). **렌더러 없음** — `figureVariants: []`(logic_condition_sop 선례).
  circuitType `number_repr_fill_blank`. types/circuitType·classifier(0-PRE)·rules/digital(figure-less 분기)·
  route(안전망+과목 보정+DIGITAL 집합+semantic 전부 false+dispatch)·`smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 · eslint 0 / `scripts/smokeNumberReprFillBlank.mjs` **36/36**(라우팅 2종×2과목 + 형제 양보 3종 +
  **원본 값 6항목 재현**(F94·1101·−3·11101000·−24·오버플로 없음) + 생성물 48개 독립 계산 재검산 +
  ASCII 하이픈 0 + "n비트" 모순 0 + 빈칸 5개·그림 0·객관식 아님 + 배치 내 문항 상이) /
  `smokeOriginalRouting` **67/67** / **생성 API E2E** 유사·변형·stale 모두 issues=0 · figure 0개.

## npn BJT **Early 효과** 개념 **빈칸 채우기** (임용 27번 전자회로 — `bjt_early_effect_fill_blank`) 전용 archetype

- 원본: (가) BJT 세로 단면도(Collector/Base/Emitter + CBJ·EBJ 공핍층 + 유효 베이스폭 \(W_B^{eff}\)) +
  (나) 출력특성곡선(활성영역 직선을 왼쪽으로 연장 → \(-V_A\), 기울기의 역수 \(r_o = 1/(dI_C/dV_{CE})\)).
  〈보기〉 ㄱ~ㅁ의 참·거짓을 가려 고르는 **객관식**(정답 ② ㄱ·ㄴ·ㅁ).
  ㄱ \(V_A\)=Early 전압(참) · ㄴ \(V_{CE}\)↑ → \(W_B^{eff}\)↓(참) · **ㄷ \(r_o\)→∞일 때 Early 효과(거짓 — 그때는 안 나타난다)** ·
  **ㄹ \(W_B^{eff}=W_B\)일 때 Punch Through(거짓 — \(W_B^{eff}\to 0\)일 때다)** · ㅁ \(V_{CE}\)↑ → 소수캐리어 농도 기울기↑(참).
- ★ **사용자 지정 (2026-08-13)**: **빈칸 채우기**로 출제(임용 24·27번과 같은 처리). 〈보기〉 5항목 구조를 그대로 두고
  핵심 용어·수식을 ㉠~㉤로 비운다. 원본의 거짓 항목(ㄷ·ㄹ)은 **올바른 서술로 고쳐** 표에 담았다 —
  빈칸형에서는 모든 문장이 참이 되고 학생이 정확한 용어를 직접 써야 한다.
  ★ **그림 (가)·(나)는 유지**(사용자 지정) — 형제 빈칸형 둘(그림 없음)과 다른 점이다.
- ★ 값은 규칙 열거: 지식 축 5개(Early 전압 / 공핍층·유효 베이스폭 / 소수캐리어 / 동적출력저항 / Punch Through)를
  그룹으로 두고 각 그룹에서 하나씩 뽑는다(원본 5항목 축 보존). 풀 72(유사 36·변형 36, 비중첩).
- ★★ **정답 노출을 두 방향에서 막는다** — 이 유형의 최대 위험이다:
  (1) **문항 안에서**: 어떤 보기 문장도 다른 보기의 정답 문자열을 담지 않게 표를 짰다.
      초판은 "베이스"·"증가"가 정답이었는데 다른 문장에 널려 있어(유효 **베이스**폭·\(V_{CE}\)가 **증가**하면)
      사실상 답이 노출됐다(**스모크가 잡음**) → "역방향 바이어스"·"가팔라진다"로 교체.
  (2) **그림에서**: (나)의 `r_o = 1/(dI_C/dV_CE)` 주석은 그대로 두면 정답이 그림에 찍힌다 →
      그 항목이 뽑힌 문항은 생성기가 **`r_o = ( ㉣ )`** 로 바꿔 보낸다(`figureMask`).
      CLAUDE.md `thevenin_dep_graph_max_power`에서 학생이 구할 절편을 기호로만 찍은 것과 같은 처리.
  (3) **발문·조건에 "Early"를 쓰지 않는다** — 그 말 자체가 ㉠의 정답인 문항이 있다(원본 발문은 쓴다).
- ★★ **dispatch는 개념 명칭형보다 앞** (실측 실패): 이 원본은 수치 given이 하나도 없어
  `isConceptNamingAnalysis`가 그대로 물어갔다 — 처음엔 회로 dispatch 체인 안에 두었더니
  **"㉠, ㉡에 해당하는 용어를 순서대로 쓰시오"가 그림 없이** 생성됐다(E2E 4/4 실패).
  개념 명칭형은 회로 체인 전체를 우회하므로 뒤에 두면 도달조차 못 한다
  (`maxwell_concept_fill_blank`·`periodic_signal_dc_rms`와 같은 이유).
- ★ 판별선 = **BJT 문맥 + Early 고유 낱말**(베이스폭 변조·유효 베이스폭·Punch Through) + 개념 신호(\(r_o\)·공핍층·소수캐리어).
  양보: 바이어스·동작점·소신호·테브난·제너/레귤레이터·논리게이트·"구하시오"(계산형).
  형제 `bjt_characteristic_curve`(영역 이름 식별)는 이 고유 낱말을 쓰지 않는다 — route 안전망의 coercible에
  그 형제와 `bjt_bias`·`bjt_small_signal`을 넣었다(GENERIC이 아니라 canCoerce만으론 건너뛴다).
  ★ **`early`는 단어 경계로 검사**한다 — 안 그러면 "n**early**"·"cl**early**"에 걸린다(비정현파⊃정현파와 같은 함정).
- 모드: 유사·변형은 값 풀을 절반씩 나눠 서로 다른 빈칸 조합을 낸다(형제 빈칸형과 같은 방식).
- 파일: `lib/generation/topologies/bjtEarlyEffectFillBlank.ts`(사실 표 + 조합 + 공용 매처)·
  `lib/pipeline/runBjtEarlyEffectFillBlankPipeline.ts`(+`detectBjtEarlyEffectFillBlank`)·
  `lib/renderers/bjtEarlyEffectRenderer.ts`(두 그림). circuitType `bjt_early_effect_fill_blank`,
  diagramType `bjt_early_structure`·`bjt_early_curve`. types(DiagramType+payload)·renderers/index·
  validateProblem(**hasConceptOnly**에 추가 — 둘 다 netlist가 아니다)·classifier(0-PRE)·
  route(안전망+과목 보정(electronics)+semantic(multi만 on)+**개념 명칭형 앞 dispatch**+topology 우회)·
  `smokeOriginalRouting`(+1줄) 등록. 시각검증 스크립트 `scripts/_bjtEarlyFigShot.mjs`.
- ★ 렌더 gotcha: (가)의 **`W_B` 치수 라벨이 V_CE 전원 원 위에 얹혔다**(시각검증에서 발견).
  텍스트끼리가 아니라 **텍스트↔심볼** 충돌이라 `_labelOverlap.mjs`가 못 잡는 자리다 — 캔버스 폭과
  치수선 x를 벌려 해결. 라벨 겹침 검사기만 믿지 말고 **반드시 눈으로 볼 것**.
- 검증: tsc 0 · eslint 0 / `scripts/smokeBjtEarlyEffectFillBlank.mjs` **122/122**
  (라우팅 4종×3과목 + 형제 양보 7종 + **substring 함정 2종** + 값 공간·원본 5축 보존 +
  **생성물 48개의 정답 노출 0 · 그림 마스킹 일치** + 발문 5빈칸·Early 미노출·객관식 아님 + 렌더 라벨 겹침 0) /
  `smokeOriginalRouting` **69/69** / 형제 무회귀(bjtCharacteristicCurve·bjtTheveninBias 37/37·
  bjtSwitchLogicGate 36/36·zenerShuntRegulator 18/18·numberRepr 36/36·maxwell 39/39·smokeAll 40/40) /
  **생성 API E2E 4경로**(유사·변형·stale `bjt_characteristic_curve`·과목 오선택) 모두 **HTTP 200 · totalIssues=0** ·
  figure 2종 정상 / 헤드리스 Chrome 시각검증.
- ※ 기존 실패로 남겨 둔 것: `scripts/smokeBjtBiasRouting.mjs`의 A·B 2건(`bjt_two_stage_switched`가
  `bjt_bias`를 가져감)은 이 작업과 무관하다(이 유형의 매처는 그 4케이스에 모두 false).

## n채널 JFET **공핍층·핀치오프** 개념 **빈칸 채우기** (임용 28번 전자회로 — `jfet_depletion_fill_blank`) 전용 archetype

- 원본: (가)~(라) 네 그림이 ( V_{GS}=0 )인 n채널 JFET에서 ( V_{DS} ) = 1·3·5·10[V]일 때의 공핍층을 보여 준다.
  조건은 선형동작구간 0~2[V]·핀치오프 전압 5[V]. 〈보기〉 ㄱ~ㄹ의 참·거짓을 가려 고르는 **객관식** → **정답 ① (ㄱ, ㄴ)**.
  ㄱ (가)는 선형구간이라 채널 저항이 일정(참) · ㄴ 게이트-드레인 역바이어스로 채널이 드레인 쪽으로 좁아진다(참)
  **ㄷ 거짓** — ( V_{DS,pinch} = V_{GS} + V_P )이므로 ( V_{GS}<0 )이면 **낮아진다**
  **ㄹ 거짓** — (라)는 포화 영역이라 ( I_D )가 **거의 일정**하다.
- ★ **사용자 지정 (2026-08-14)**: **빈칸 채우기**로 출제(임용 24·27번과 같은 처리). 〈보기〉 5항목 구조를 유지하고
  핵심 용어·값·식을 ㉠~㉤로 비운다. 원본의 거짓 항목(ㄷ·ㄹ)은 **올바른 서술로 고쳐** 표에 담았다 —
  빈칸형에서는 모든 문장이 참이어야 학생이 정확한 개념을 써 넣을 수 있다. **그림 (가)~(라)는 유지**한다.
- ★ 값은 규칙 열거: 지식 축 5개(선형(옴) 영역 / 채널 테이퍼링 / 핀치오프 조건 / 포화 영역 / 소자 구조)를
  그룹으로 두고 각 그룹에서 하나씩 뽑는다(원본 ㄱ~ㄹ 축 보존 + 핀치오프 식). ( V_P )·선형구간 상한·
  네 패널의 ( V_{DS} )·예시 ( V_{GS} )를 열거하고 **네 패널이 선형·테이퍼·핀치오프·포화를 하나씩**
  대표하도록 필터한다. 유사/변형 값 풀은 절반씩 분리.
- ★★ **정답 노출을 두 방향에서 막는다**:
  (1) 초판은 ㉠의 정답이 **"선형(옴)"** 이었는데 **조건문의 "선형동작구간"이 그대로 답을 알려 줬다**(스모크가 잡음).
      원본이 그 구간을 조건으로 주므로 낱말을 지울 수 없다 → 같은 지식(옴 영역의 성질)을 노출 없이 묻도록
      **전류-전압 관계("거의 ( )한다" → 비례)** 로 바꿨다.
  (2) 스모크가 **모든 정답 핵심어가 본문·조건 어디에도 없음**을 48개 생성물에 대해 단언한다.
- ★★ **배치 안 문항이 전부 같은 조합으로 나왔다**(실측): `generateInParallel`이 주는 seed 증분 7919 +
  index·211 = **8130**이 작은 그룹 길이의 배수라 `(base) % group.length`가 배치 내내 고정됐다.
  ⇒ **사실 회전은 index만** 쓴다(값은 seed 기반이라 수치는 문항마다 다르다). 변형은 회전을 한 칸 밀어
  유사와 다른 빈칸 조합을 낸다. `periodic_signal_dc_rms`의 "가족 선택에 seed를 섞지 마라"와 같은 함정.
- ★★ **dispatch·분류 모두 개념 명칭형보다 앞**: 수치 given이 하나도 없어 `isConceptNamingAnalysis`가
  그대로 물어간다(`bjt_early_effect_fill_blank`에서 실측된 실패와 같은 이유). 개념 명칭형은 회로 dispatch
  체인 전체를 우회하므로 뒤에 두면 도달조차 못 한다.
- ★ 판별선 = **JFET 문맥 + 공핍층·핀치오프 개념 신호**(채널 테이퍼링·선형/포화 영역·( V_P )).
  형제 `jfet_bias`(분압 바이어스 → ( V_{GS} )·( I_D ) 계산)는 **수치 given**이 있어 매처가 양보한다.
- ★★ **검증기의 수치 요구는 빈칸형에 오탐이다**: `validateAnswerSolution`의 `answer_no_digit`·
  `solution_no_digit`·`answer_too_abstract`가 용어형 정답에 발화했다(solutionWarnings). 유형 목록으로
  예외를 두면 새 빈칸형마다 빠지므로 **형식으로 판정**한다 — 정답에 ㉠~㉪ 마커가 3개 이상이면 빈칸 응답표로
  보고 수치 요구를 면제(`number_repr_fill_blank`의 3단계 계약 판정과 같은 방식). 수치형은 그대로 경고한다.
- ★★ **렌더 gotcha 3건(전부 헤드리스 Chrome 시각검증에서 발견)**:
  ① 공핍층 두께를 소스↔드레인 **선형 보간**으로 그렸더니 포화(( V_{DS} > V_P ))에서 맞닿는 구간이 자라지 않아
     **(다)와 (라)가 똑같이** 그려졌다 → 위치 t의 역바이어스 ( V_{DS}t - V_{GS} )로 **위치마다** 계산한다
     (그러면 ( t_p = (V_P + V_{GS})/V_{DS} )부터 맞닿아 포화가 깊을수록 핀치 구간이 소스 쪽으로 자란다).
  ② "핀치오프" 라벨을 원 옆에 붙이면 ( t_p )가 ( V_{DS} )에 따라 오르내려 어떤 패널에서는 **게이트 사각형** 위에,
     어떤 패널에서는 **V_DS 전원 기호** 위에 얹힌다 → **패널 우상단 고정 위치 + 점선 지시선**으로 바꿨다.
  ③ 행 라벨 "(가)"와 다음 행 D 단자가 붙어 `PANEL_H`를 250 → 272로, 전원 열 간격 확보를 위해 `PANEL_W`를 210 → 240으로.
- 파일: `lib/generation/topologies/jfetDepletionFillBlank.ts`(사실 표 + 조합 + 공용 매처)·
  `lib/pipeline/runJfetDepletionFillBlankPipeline.ts`(+`detectJfetDepletionFillBlank`)·
  `lib/renderers/jfetDepletionPanelsRenderer.ts`(4패널 도식). circuitType `jfet_depletion_fill_blank`,
  diagramType `jfet_depletion_panels`. types(DiagramType+payload)·circuitType·renderers/index·
  validateProblem(**hasConceptOnly**에 추가 — netlist가 아니다)·classifier(0-PRE)·
  route(안전망+과목 보정(electronics)+semantic(단일 figure)+**개념 명칭형 앞 dispatch**)·
  `smokeOriginalRouting`(+1줄) 등록. 시각검증 스크립트 `scripts/_jfetShot.mjs`.
- 검증: tsc 0 / `scripts/smokeJfetDepletionFillBlank.mjs` **453/453**(감지 3 + 3과목 분류 + 형제 양보 5 +
  값 공간·유사/변형 비중첩 + **생성물 48개의 정답 노출 0**(본문·조건 양쪽) + 축별 1개 규칙 + 값 무결성 +
  유사↔변형 빈칸 조합 상이 + 발문·figure·배치 내 상이 + 렌더 구조(핀치오프 표시 개수 = ( V_{DS} ge V_P ) 패널 수)) /
  `smokeOriginalRouting` **70/70** / 형제 무회귀(bjtEarly 122/122·maxwell 39/39·numberRepr 36/36·
  threeStep 118/118·wireIntegrity 4/4·cSwitchFallThrough 549/549·wienBridgeDesign 397/397) /
  **생성 API E2E 4경로**(유사·변형·stale `jfet_bias`·과목 오선택) 모두 **HTTP 200 · totalIssues=0 ·
  solutionWarnings=0** · figure `jfet_depletion_panels` / 헤드리스 Chrome 시각검증.

## 전원 크기만 다른 **두 회로**의 최대전력 부하 + 비 η₁·η₂ (임용 17번 — `max_power_two_source_ratio`) 전용 archetype

- 원본(확대 확정): `v(t) ─ C(직렬) ─ 마디 A ─ [R_p ∥ L_p] ─ 마디 B ─ 부하(점선 박스: R+L 직렬) ─ 하단 rail`.
  (가)·(나)는 **회로망이 완전히 같고 전원 진폭만 다르다**(24 V vs 48 V).
- ★ 물리(닫힌형, GPT 없음): 부하를 떼면 전류가 0이라 직렬 소자에 강하가 없다 → **V_th = 전원 전압 그대로**.
  Z_th = −jX_C + (R_p ∥ jX_p). 최대전력은 **켤레 정합** Z_L = Z_th\* → R = Re(Z_th), X = |Im(Z_th)|.
  정합되면 허수부가 상쇄되어 |I| = |V|/(2R) → **P_max = |V|²/(8R)**.
  원본 검산: −j8 + (6∥j6) = −j8 + (3+j3) = **3 − j5** → R = 3Ω · **L = 5mH**,
  P₁ = 24²/24 = 24 W, P₂ = 48²/24 = 96 W → **η₁ = 4, η₂ = 2** (원본 보기 ③). ✓
- ★★ **채점 포인트는 두 비가 다른 이유**다: Z_th는 전원을 단락하고 본 값이라 **부하 값이 전원 크기와 무관**
  ⇒ R₁=R₂, L₁=L₂ → **η₂ = 1+1 = 2**. 반면 **P_max ∝ |V|²** ⇒ 전원을 k배 하면 **η₁ = k²**.
- ★ 판별선 = **두 회로 비교**. 형제 최대전력 유형(`max_power_transfer`·`ac_thevenin_ladder`·
  `ac_bridge_max_power`·`ac_thevenin_two_box`)은 전부 **단일 회로**다. 매처는
  `최대전력 + (가)·(나)/P_max1·P_max2/η 표기 + 부하 설계` 셋이 모일 때만 발화하고,
  테브난 등가 변환·단자 a·브리지·Δ-Y·스위치·중첩이면 양보한다.
  안전망 coercible에 위 단일 회로 형제 3종을 넣었다(GENERIC이 아니라 캐시되면 건너뛴다).
- ★ 값은 규칙 열거+필터: **X_p = R_p** 로 두면 병렬 합성이 (R_p/2)(1±j)로 딱 떨어진다(원본 6∥j6 = 3+j3).
  R 정수 · X 0.5배수 · 소자 mH·µF 정수 · P 0.5배수 · **원본 튜플 제외**.
- 모드: **exam_similar**=직렬 C + 병렬 R∥L → 부하 **R+L**(인덕턴스를 구함) /
  **exam_variant**=**소자 종류 교환**(직렬 L + 병렬 R∥C) → Z_th가 유도성이라 부하가 **R+C**(정전용량을 구함).
  η₁ = k², η₂ = 2는 구조가 같으므로 그대로.
- 파일: `lib/generation/topologies/maxPowerTwoSourceRatio.ts`·`lib/pipeline/runMaxPowerTwoSourceRatioPipeline.ts`
  (+`detectMaxPowerTwoSourceRatio`)·`lib/renderers/maxPowerTwoSourceCircuitRenderer.ts`(dual 플래그로 (가)/(나)·유사/변형 공용).
  circuitType `max_power_two_source_ratio`, diagramType `max_power_two_source_circuit`.
  types·circuitType·renderers/index·validateProblem·classifier(0-PRE)·route(안전망+semantic+dispatch+topology 우회)·
  `smokeOriginalRouting`(+1줄) 등록.
- ★ 렌더 gotcha: `P_max` 라벨이 부하 점선 박스 **오른쪽 바깥**에 붙으므로 캔버스를 넉넉히 잡아야 한다
  (700이면 "P_ma"로 잘렸다 — 시각검증에서 발견).
- 검증: tsc 0 · eslint 0 / `scripts/smokeMaxPowerTwoSourceRatio.mjs` **48/48**(라우팅 2종×2과목 + 형제 양보 4종 +
  원본 물리 7 + **생성물 40개를 복소수 직접 연산으로 재검산**(Z_th·켤레정합 후 순저항·P·η₁·소자값↔리액턴스) +
  원본 튜플 미생성 + 발문·정답·렌더 겹침 0) / `smokeOriginalRouting` **66/66** /
  **생성 API E2E** 유사·변형·stale `max_power_transfer` 모두 issues=0 / 헤드리스 Chrome 시각검증.

## JK + **2상 클럭발생기** + 출력 게이트 2개 → Y 파형 도시 (임용 30번 — `jk_two_phase_clock`) 전용 archetype

- 원본(확대 확정 — [[feedback_verify_wiring_by_zoom]]): JK₁은 J₁·K₁ 외부 입력 + CLK 핀에 **버블(하강 에지)**.
  점선 박스 = **2상 클럭발생기** — JK₂의 **J₂ = K₂ = High**(토글 전용), JK₂의 CLK 핀은 **버블 없음 →
  Q₁의 상승 에지**마다 토글(2분주). 출력 게이트 2개: 위 (Q₁, Q₂) → **Y₁**, 아래 (Q₁, Q̄₂) → **Y₂**.
  원본은 AND라 두 출력이 겹치지 않는 2상 클럭이 된다.
- ★ **사용자 지정 변경 (2026-08-12)**:
  ① AND 2개 → **EX-OR 2개** ⇒ **Y₁ = Q₁ ⊕ Q₂**, **Y₂ = Q₁ ⊕ Q̄₂ = Y₁′** — 두 출력이 **서로 보수**가 되는 것이
     EX-OR 버전의 성질이고 그대로 채점 포인트가 된다(원본 AND의 "비중첩"과 대비해 풀이에 명시).
  ② 객관식 → **출력 파형을 직접 도시**하는 서술형. (나)의 Y₁·Y₂는 **빈 트랙**, 정답 파형은 `solutionFigures`.
  ③ **문항마다 J₁·K₁이 달라야 한다** → 비트열 자체를 값 공간에 넣고 `index`로 서로 다른 항목을 고른다
     (한 배치 5문항이 모두 다름을 스모크가 단언).
- ★ 값은 규칙 열거+필터: J₁·K₁을 **2펄스 단위 4구간**으로 열거(파형이 읽히게) 후
  · 입력이 최소 1회 변할 것 · Q₁·Q₂·Y₁이 상수가 아닐 것 · 네 동작(유지·세트·리셋·토글) 중 **3종 이상**
  · ★ **Q₁·Q₂·Y₁의 전이가 각각 2회 이상**(파형을 그리는 문항인데 `Y₁ = 00000001`처럼 전이가 한 번뿐이면
    그릴 것이 없다 — 시각검증에서 발견). **원본 J₁·K₁ 튜플 제외**.
- ★ 시간축: 펄스 i = [2i, 2i+2), **CLK 상승 = 2i · 하강 = 2i+1**. J₁·K₁은 **펄스 경계(2i)** 에서만 바뀌어
  FF가 동작하는 하강 에지와 겹치지 않는다. Q₂는 Q₁ 상승 **직후(ε=0.08)** 에 바꿔 캐스케이드를 파형에서 구분한다
  (같은 t에 두 샘플을 찍으면 `waveform_time_not_monotonic`).
- 모드: **exam_similar**=EX-OR / **exam_variant**=**EX-NOR**(소자 종류 교환, 답은 보수). 값 풀도 분리.
- 파일: `lib/generation/topologies/jkTwoPhaseClockXor.ts`(시뮬+파형+공용 매처)·
  `lib/pipeline/runJkTwoPhaseClockPipeline.ts`(3단계 + `detectJkTwoPhaseClock`)·
  `lib/renderers/jkTwoPhaseClockCircuitRenderer.ts`(JK₁ + 점선 박스 + High + EX-OR/EX-NOR, Q₁이 위·아래 레인으로 분기).
  circuitType `jk_two_phase_clock`, diagramType `jk_two_phase_clock_circuit`.
  types·circuitType·renderers/index·validateProblem·rules/digital·classifier(0-PRE)·
  route(안전망+과목 보정+DIGITAL 집합+semantic+dispatch)·`smokeOriginalRouting`(+1줄) 등록.
- ★ 분류: **"2상 클럭발생기"** 는 형제 어느 유형도 쓰지 않는 고유 낱말이라 그 자체로 확정.
  낱말을 흘린 회차는 (JK + FF 2개 + 게이트 2개 + 출력 Y 파형) 구조로 잡는다.
  양보: 카운터·상태도·여기표·MUX·DAC·비동기 PR/CLR.
  ★ 안전망 coercible에 `jk_sync_counter`·`ff_with_waveform`을 넣었다 — 둘 다 GENERIC이 아니라
  캐시된 분석이 그 값이면 안전망이 통째로 건너뛴다(임용 27·15번에서 반복된 구멍).
- 검증: tsc 0 · eslint 0 / `scripts/smokeJkTwoPhaseClock.mjs` **54/54**(라우팅 2종×3과목 + 형제 양보 5종 +
  **생성물 48개를 독립 시뮬레이터로 재검산** + Y₂=Y₁′ + 파형 t 단조 + 한 배치 5문항 J₁·K₁ 전부 다름 +
  발문·정답·빈 트랙·정답 파형 분리 + 렌더 구조·XNOR 버블·겹침 0) / `smokeOriginalRouting` **65/65** /
  디지털 형제 무회귀(jkMealy 23/23·jkExcitation 28/28·ffMixed 7/7·dffPresetClear 96/96·asyncPreset 10/10·
  jkClockEdge 26/26) / **생성 API E2E**: 유사 3문항 issues=0(J₁·K₁·Y₁ 모두 다름), 변형·stale `jk_sync_counter`·
  과목 오선택 모두 전용 유형으로 복구 / 헤드리스 Chrome 시각검증.

## D-FF + 비동기 **PR·CLR** + A·B 조합논리 → 구간 ㉠~㉢ 출력 Q 파형 (임용 27번 — `dff_preset_clear_regions`) 전용 archetype

- 원본: (가) D 플립플롭 하나 — **D ← Q̄ 되먹임**(토글), **PR(위)·CLR(아래) 비동기 입력에 버블**(active-low),
  이들을 **A·B와 그 보수를 받는 NAND 4개 + 인버터 2개**(2-to-4 디코더 형태)가 구동. (나) CLK·A·B 파형이
  구간 ㉠·㉡·㉢으로 나뉘어 주어지고 **구간별 출력 Q**를 묻는다(원본은 보기 ①~⑤ 객관식).
- ★ 물리(규칙, GPT 없음): PR̄ = (곱항)′ · CLR̄ = (곱항)′ → 그 곱항이 1인 (A,B)에서만 비동기 입력이 활성.
  · 활성이면 클럭과 무관하게 Q가 **구간 내내 고정**(세트/리셋) · 둘 다 비활성이면 D=Q̄라 **클럭마다 토글**.
  원본 결선은 **A가 인에이블**: CLR̄=(Ā·B̄)′ → ㉠(0,0) 리셋 / PR̄=(Ā·B)′ → ㉡(0,1) 세트 / A=1 → ㉢ 토글.
- ★★ **오분류(수정됨)**: 전용 항목이 없어 3과목 모두 `unsupported`(→ digital이면 `universal_digital`)로 떨어졌고,
  프론트 캐시가 남은 회차에는 형제 **`ff_with_waveform`(임용 8번)** 이 가져가 **입력 A·B·C 3개 + 비동기 RESET만
  있는 다른 회로**가 생성됐다(사용자 신고 2026-08-12, 로그의 `coercionSkipped: yes(specific)`).
  · 판별선 = **비동기 입력이 PR·CLR 둘 다** / **외부 입력이 A·B 2개**(형제는 3개) / **구간별 출력 Q 요구**.
  · ★ 셋을 모두 요구했더니 Vision이 구간 마커를 흘린 회차에서 통째로 미발화했다 →
    **3개 중 2개 이상**이면 발화(하나만으로는 형제를 뺏는다 — 2/3이 균형점).
  · ★★ **substring 함정**: bare `셋`은 **"리셋"에 걸린다** — RESET만 있는 형제를 "PR도 있다"로 오판한다.
    반드시 `프리셋`처럼 앞말을 붙일 것("비정현파 ⊃ 정현파"·"개루프 이득 ⊃ 루프 이득"과 같은 유형).
  · stale 대비: 안전망의 coercible 집합에 **`ff_with_waveform`을 예외로 추가**했다(GENERIC이 아니라 원래는 건너뛴다).
- 모드: **exam_similar**=원본 결선 유지, **A·B 구간 값만 변경**(사용자 지정) /
  **exam_variant**=★**PR·CLR을 구동하는 곱항 쌍 자체를 값 공간에 넣어** 매번 달라지게 한다(사용자 지정) —
  곱항이 바뀌면 **(가) 회로의 인버터 배치가 자동으로 달라진다**. 원본 결선은 변형 풀에서 제외.
- ★ 값은 규칙 열거+필터: 구간 3개의 (A,B) 순서열을 전수 열거 → 이웃 구간 다름 · **첫 구간은 세트/리셋**
  (Q 초깃값에 답이 의존하지 않게 — 원본 ㉠도 리셋) · **세 구간이 리셋·세트·토글을 모두 포함**(학습목표 보존)
  · 토글 구간은 3펄스 이상 · 총 10펄스 이하. **원본 튜플 제외**.
- ★★ **시간축 설계로 경합을 원천 차단**: 펄스 i는 [2i, 2i+2)이고 **에지는 반정수**(2i+0.5 / 2i+1.5),
  **구간 경계는 짝수 정수**. 경계와 에지가 같은 시각이면 "그 에지가 어느 구간인가"라는 경합이 생겨
  학생이 풀 수 없는 문항이 된다(스모크가 단언).
- ★ **발문은 3단계 서술형**(절대원칙 — 객관식 원본): [1] PR̄·CLR̄ 논리식과 구간별 논릿값 [2] 구간별 동작 판정
  [3] **Q 파형 도시**. (나)의 Q는 **빈 트랙**, 정답 파형은 `solutionFigures`.
- ★ **파형 렌더러에 `regions` 가산 추가**: 축 아래 span bar + ㉠·㉡·㉢ 라벨(원본 (나) 하단 표기).
  미지정이면 기존 그림과 완전히 동일 — 형제 무영향.
- ★★ **렌더 gotcha 4건(전부 시각검증에서 발견)**:
  ① 박스 안 PR/CLR 라벨을 가운데로 몰면 D·CLK 핀에 붙은 것처럼 읽힌다 → **각자 핀 옆**에.
  ② 교차 도선에 **반원 hop을 그리지 마라** — 이 그림에서 속 빈 원은 이미 "논리 반전"이라 버블로 읽힌다.
    접속은 전부 채워진 dot이므로 **표시 없는 교차**가 비접속으로 명확하다(규칙 #4).
    ※ 되먹임과 PR 구동선의 교차 1회는 **위상적으로 불가피**하고 원본 그림도 그렇다.
  ③ 두 입력이 모두 반전이면 인버터 2개가 붙어 겹친다 → **slot별로 x를 벌린다**.
  ④ 여분 게이트 출력을 길게 빼면 **Q 외부 단자와 같은 높이**에 놓여 헷갈린다 → 게이트 옆 짧은 stub.
- ★★ **범용 규칙 (사용자 지정 2026-08-12) — 게이트 입력 옆 신호 부호(A / A′)를 표시하지 않는다.**
  반전 여부는 **인버터 심볼과 배선**이 이미 말해 준다. `logicNetworkRenderer`에도 적용(디지털 전반).
  예외는 **빈칸 게이트뿐** — 학생이 채워야 할 게이트는 어느 신호가 어느 입력인지 보여야 문제가 성립한다
  (2026-08-04 신고로 추가된 흰 배경 칩은 유지).
- 파일: `lib/generation/topologies/dffPresetClearRegions.ts`(생성기 + 공용 매처)·
  `lib/pipeline/runDffPresetClearRegionsPipeline.ts`(3단계 + `detectDffPresetClearRegions`)·
  `lib/renderers/dffPresetClearCircuitRenderer.ts`(전용 fixed-slot). circuitType `dff_preset_clear_regions`,
  diagramType `dff_preset_clear_circuit`. types·circuitType·renderers/index·validateProblem·rules/digital·
  classifier(**0-PRE, 개념 명칭형 가드보다 앞** — 수치 given이 없어 그대로 걸린다)·
  route(안전망+과목 보정+semantic+dispatch+DIGITAL 집합+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 · eslint 0(신규) / `scripts/smokeDffPresetClearRegions.mjs` **96/96**(실측 요약 4종×3과목 라우팅 +
  형제 양보 7종 + 원본 결선 동작 + **생성물 48개를 독립 시뮬레이터로 Q 파형 재검산** + 파형 단조성 +
  **구간 경계≠클럭 에지** + 원본 튜플 미생성 + NAND 4개·인버터 수·입력 부호 미표기 + 3단계·보기 없음) /
  `smokeOriginalRouting` **60/60** / 디지털 형제 무회귀(ffMixed 7/7·asyncPreset 10/10·dffStateDesign 6/6·
  jkExcitation 28/28·jkClockEdge 26/26·muxImpl 7/7·tffDacChain 17/17·tff3 52/52·conceptNaming 18/18) /
  `smokeAll` 40/40 / **생성 API E2E** — stale `ff_with_waveform`·`unsupported`·과목 오선택 모두 전용 유형으로 복구,
  issues=0 / 헤드리스 Chrome 시각검증.
- ⚠️ **미확인**: 원본 (가)의 **NAND 4개 내부 결선**은 이미지 해상도로 확정하지 못했다. 부품 수(NAND 4 + 인버터 2)와
  동작(㉠ 리셋·㉡ 세트·㉢ 토글, (나) 파형에서 역산)은 원본과 일치시켰고, PR·CLR에 쓰이지 않는 두 줄은
  **열린 단자**로 그린다. 실제 원본이 다른 결선이면 `DECODE_SIMILAR` 한 줄만 고치면 된다.

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

## 아날로그 시스템 설계 — 2-OPAMP 가산기 (임용 전자 — `opamp_analog_summer`) 전용 archetype
- 원본: 입력 v₁(삼각파)·v₂(구형파)와 출력 v₀ 파형이 주어지고, 조건 "①(다)블록도대로 입출력 ②연산증폭기 2개만 ③모든 저항값 동일 ④이상적 소자"로 **회로 설계**. ★사용자 확정: **v₀ = v₁ + v₂**★.
- ★ **오분류(수정됨)**: 전용 archetype 없어 generic opamp로 감 → 파형·설계 성격 잃고 임의 수치 netlist(O2=24.5V 등)로 변질(issues=2).
- ★ **동작 역산(핵심)**: "저항 모두 동일" → 단 이득 크기 1뿐(2배는 R_f=2R 필요). 출력 범위 −5~+5V인 단위 조합은 **v₀=v₁+v₂**뿐(v₁−v₂=0~10·v₂−v₁=−10~0 배제). 회로: **반전 가산기 U₁(v_m=−(v₁+v₂)) → 반전 단위증폭 U₂(v₀=−v_m=v₁+v₂)**, 모든 R 동일·op-amp 2개 — 4조건 정확히 만족.
- ★ **결정론 생성**(GPT 없음): 파형 3개(v₁ linear 삼각/톱니, v₂ step 구형, v₀=v₁+v₂ linear) `WaveformDiagram`. ★점프는 t·t+ε(ε=half·0.015) 두 샘플로 near-vertical(waveform_time_not_monotonic 회피 — 같은 t 중복 금지). v₂ 세그먼트값 −V/0, v₀는 좌·우 극한 합.
- 모드: similar=v₁ 삼각파+v₂ 구형파(원본) / variant=v₁ 톱니파+v₂ 구형파(다른 입력 파형, 같은 설계). 값 V·T·R은 규칙 열거.
- ★ **figure**: 본문 = (다)블록도(`concept_diagram`, role **main_circuit** — v₁·v₂→시스템→v₀ 노드+화살표, x/y 좌표 지정) + (라)파형(`waveform`, role waveform). ★정답 회로는 **solutionFigures**(`opamp_summer_circuit` 전용 fixed-slot 렌더러). ★ **electronics는 항상 original_circuit(=main_circuit alias) 요구** → 블록도가 충족. **route semantic hasWaveformEvolution=FALSE** 강제(파형은 given·학생도출 아님 → IO-waveform split·waveform 필수화 방지, 파형은 추가 figure로 허용). concept_diagram·waveform 둘 다 concept-only라 missing_topology 미발화.
- 파일: `opampAnalogSummer.ts`·`runOpampAnalogSummerPipeline.ts`(+`detectOpampAnalogSummer` 안전망)·`opampSummerCircuitRenderer.ts`(전용). circuitType `opamp_analog_summer`, diagramType `opamp_summer_circuit`. types·renderers/index·validateProblem·classifier(PRE-SUBJECT opamp)·route(dispatch+안전망+subject보정+semantic)·analyzeImage·smokeAll[+1]·smokeOpampAnalogSummer.
- 검증: tsc 0 new err·Vision 원본 라우팅 성공·E2E 양모드 issues=0 (v₀=v₁+v₂·회로 U₁→U₂)·Edge 시각검증(블록도·2-op-amp 가산기 회로 정확)·smokeAll 35/35. ★ 교훈: 파형 기반 **설계** 문제는 "저항 동일+op-amp 개수" 제약으로 동작을 역산(단위 이득만) → v₀=v₁+v₂ 확정. 정답 회로는 solutionFigure, 본문엔 블록도(main_circuit 충족)+파형. 파형 점프는 ε-오프셋으로.
- ★★ **후속 수정 (사용자 "비슷한 문제가 안생성돼" — 복합형/디지털 과목 선택 시 오라우팅)**: 아날로그 시스템 이미지를 **mixed_signal/digital_logic 과목으로 분석**하면(사용자가 과목 잘못 선택) Vision은 "아날로그 시스템 설계·삼각파·구형파·연산증폭기·저항 동일"로 정확히 서술하지만 PRE-SUBJECT opamp 검출이 **subject 게이트(≠digital·≠mixed)로 막혀** 디지털 waveform_analysis·mixed_circuit로 샜다. 3겹 수정:
  - (1) **classifier 최상단 0-PRE (subject 완전 무관)**: `삼각/구형/톱니 파형 + 연산증폭기/아날로그 + 설계(저항 동일·op-amp 2개) − (저역/대역폭/적분기/발진 가드)` → opamp_analog_summer. 모든 subject보다 먼저. `detectOpampAnalogSummer`(안전망)도 동일 완화 시그니처.
  - (2) ★ **route coercion 순서 버그**: `DIGITAL_CIRCUIT_TYPES`(digital_logic→universal_digital)·`MIXED_SIGNAL_CIRCUIT_TYPES`(mixed→counter_dac) coercion이 electronics subject 보정보다 **먼저** 실행돼 opamp_analog_summer를 삼켰다. 또 **ruleSet은 원래 subject로 계산**돼 subject_mismatch·kmap 요구 오류. → **electronics 전용 archetype(opamp_analog_summer·series_regulator·active_lowpass_filter)의 subjectKey=electronics 보정을 ★ruleSet·semantic 계산 전(안전망 직후)·digital/mixed coercion 앞★에 무조건** 배치. (fresh analyze는 이미 목표 circuitType이라 안전망 미발화 → 무조건 보정 필요.)
  - (3) **v₂ 위상 교정**: 원본은 상승 반주기 0V·하강 반주기 −5V인데 생성기가 반대였음 → `v2Seg`를 `j짝수→0·홀수→−V`로. v₀ 0→5→(−5) 원본 일치.
  - 검증: electronics·digital_logic·mixed_signal **3과목 모두** issues=0·opamp_summer 라우팅·smokeAll 35/35. ★ 교훈: subject 무관이어야 하는 유형은 **classifier 최상단 0-PRE + route subject 보정을 ruleSet·모든 coercion 앞에**. 과목 게이트 안에 두면 오선택 시 샌다.

## 동작 조건(말) → 최소 SOP 간소화 (임용 25번 디지털 — `logic_condition_sop`) 전용 archetype (그림 없음)
- 원본: ★그림 없이★ "동작 조건"만 말로 주고 3변수(A,B,C) 조합논리 출력 F를 ★가장 간소화한 논리식(SOP)★으로 표현/선택(보기 ①~⑤). 예: A=1→F=1(B,C 무관); A=0일 때 B≠C면 1·같으면 0 → **F = A + BC̄ + B̄C**(정답 ③).
- ★ **오분류(수정됨)**: 전용 archetype 없어 `combinational_gate`로 감 → **K-map 주어짐 + 2출력 F,G + 구현회로**라는 완전히 다른 유형으로 변질. 원본은 그림 없음·단일 출력·논리식 간소화만 → 전용 archetype.
- ★ **figure-less 디지털**(EM/pedagogy는 비회로 subject라 자동 면제되지만, 이건 digital_logic subject): `resolveDigitalRules`에 **명시적 분기**(requiredFigureRoles=[], topicKey=combinational_gate의 kmap/구현회로 요구 우회) + route semantic normalize(전부 false) + `figureVariants:[]`. validator는 `figs.length===0`이면 missing_topology 미발화·requiredFigureRoles=[]이면 missing_figure 없음·본문에 "그림" 미참조(referencesFigure는 "다음 그림"처럼 붙어야 발화). 진리표는 **solutionFigures**(풀이 영역).
- ★ **결정론 생성**(GPT 없음): 지배 변수 X + 나머지 두 변수 관계 R(and/or/xor/xnor/nand/nor/단일). similar=1-지배(X=1→F=1, X=0→R)→F=X+R / variant=0-지배(X=0→F=0, X=1→R)→F=X·R. minterm 계산→`minimizeSop`(Q-M)→`sopToString`→overbar(X'→X̅). 규칙 열거+필터(SOP 2~4항), 원본(A지배·xor) 제외.
- 풀이 3단계: [1]조건→진리표(Σm), [2]카르노맵 간소화, [3]최소 SOP. 파일: `logicConditionSop.ts`·`runLogicConditionSopPipeline.ts`(+`detectLogicConditionSop` 안전망). **렌더러 없음**(truth_table 재사용).
- ★ **분류(디지털 분기 최상단)**: `조합논리 + 간소화/논리식 + 동작조건(무관하게·같으면·다르면·조건 만족) + FF/순차/MUX/파형/다중출력 아님` → logic_condition_sop. combinational_gate 앞. route 안전망(stale combinational_gate 보정) + DIGITAL_CIRCUIT_TYPES/DIGITAL_ONLY_TYPES 등록. analyzeImage에 "동작 조건·간소화·단일 F 보존, K-map/진리표/회로 주어짐·2출력·구현회로로 오요약 금지".
- 검증: tsc 0 new err·Vision 원본 이미지 logic_condition_sop 라우팅 성공·E2E 양모드 totalIssues=0 논리 검산 일치(유사 F=A+B̅C̅·변형 F=A̅C+B̅C)·figure-less·stale 안전망 보정·smokeAll 34/34. ★ 교훈: **말 조건→간소화 유형은 "그림 없음"이 핵심** — combinational_gate(그림 주어짐)와 구분. digital_logic figure-less는 rules 명시 분기+semantic false+빈 figureVariants로 validator 통과.

## JK-FF 2개 상태 여기표 + 조합논리 불함수 (최소 SOP → 분배법칙 → POS) (2025 전기 A-8 — `jk_excitation_sop_pos`) 전용 archetype
- 원본: (가) **상태 여기표**(현재상태 Q_A Q_B | 입력 x | FF 입력 J_A K_A J_B K_B | 다음상태, 빈칸 ㉠~㉣) + (나) **JK-FF 2개 + 조합 논리 블록 ㉲**(FF_B는 J_B=K_B=HIGH, 공통 CLK). 〈설계 절차〉 [1] ㉠㉡(J_A K_A)·㉢㉣(다음 상태) [2] ㉲의 J_A를 **간략화된 최소항의 합** [3] **분배 법칙 → 합의 곱**.
- ★ **오분류(수정됨)**: 실측 화면은 **D 플립플롭 + 2×1 MUX 구현 회로**(dff_mux_sequential)였다. 형제 어느 것도 이 형식을 재현 못 함 — `fsm`(JK 상태표)은 상태도+출력 y, `dff_state_design`은 상태도→D입력→게이트, `jk_sync_counter`는 카운터.
- ★★ **Vision이 FF 종류를 D로 오독한다** (실측 3회 중 2회 "D 플립플롭"). 그래서 분류 조건에 "JK" 문자열을 필수로 걸면 대부분 샌다 → **"상태 여기(표)"를 주 판별자**로 삼는다. **D-FF는 D=다음 상태라 여기표가 애초에 필요 없다** — 여기 신호는 JK/T 계열 고유 절차다. D/T 명시는 **여기 신호가 없을 때만** 양보 근거로 쓴다. analyzeImage에 "FF 종류는 표의 입력 열(J_A K_A…)로 판별" 규칙 추가.
- ★ 물리: J_A는 Q_A=0인 4행에서만, K_A는 Q_A=1인 4행에서만 값이 정해지고 나머지는 **무관(×)** — 즉 둘 다 실질 (Q_B,x) 2변수 함수다. 그래서 2항 최소 SOP는 **XOR/XNOR 형태뿐**(수학적 한계). 다양성은 반대편 열·빈칸 조합으로 확보한다.
- 모드: **exam_similar**=J_A를 구함(원본) / **exam_variant**=**K_A**를 구함(구하는 양 교환, 구조·절차 동일).
- 파일: `lib/generation/topologies/jkExcitationSopPos.ts`(결정론, `minimizeSop`/`minimizePos` 재사용)·`runJkExcitationSopPosPipeline.ts`(+detect)·`lib/renderers/jkExcitationCircuitRenderer.ts`(전용 fixed-slot: ㉲ 점선 블록 + JK-FF 2개 + HIGH + CLK 버스 + Q 되먹임 레인, **직교 라우팅**). circuitType `jk_excitation_sop_pos`, diagramType `jk_excitation_circuit`. types·renderers/index·validateProblem·rules/digital(truth_table+implementation_circuit)·classifier(0-PRE)·route(안전망+dispatch+semantic+DIGITAL 집합 2곳)·analyzeImage·smokeAll[+1] 등록.
- 검증: tsc 신규 0 / `scripts/smokeJkExcitationSopPos.mjs` **28/28**(실측 Vision 요약 3과목 + 표현 변형 + 형제 회귀 3종 + 여기표·빈칸·SOP≡POS 재검산 20개 + 렌더) / **실측 3회 요약(‘D 플립플롭’ 오독 포함) 3/3 라우팅** / 형제 스모크 무회귀(dffStateDesignRouting 6/6·ffMixedRouting 7/7) / 원본 E2E 양모드 issues=0 / smokeAll **40/40** / Edge 시각검증.
- ★ 렌더 gotcha: 블록→FF 입력(J_A·K_A)은 **직교 라우팅**(대각선은 CLK 스텁·되먹임과 교차), CLK 스텁은 FF 박스 바로 옆에서만 올리고, 되먹임은 Q_A·Q_B의 **하단 레인 y와 좌측 레인 x를 분리**한다(규칙 #3).

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

## D 플립플롭 2개 상태도 순서회로 설계 (임용 9번 정보과 — `dff_state_design`) 전용 archetype
- 원본: 입력 없는 **2-bit 자율 상태도**(가, ★실제 원본 = 00→01·01→10·**10→10(자기루프)**·11→01 — 해밀턴 순환 아님) → **상태표**(나, 현재상태 Q_A·Q_B | 다음상태 ㉠~㉣ | D입력 D_A·D_B) → **D 플립플롭 2개 + 논리 게이트(㉮·㉯) 구현**(다). D-FF는 D=다음상태(여기표 불필요) → D_A·D_B를 Q_A·Q_B의 함수로 최소화 → 게이트. 실제 원본 답: D_A=XOR·D_B=XNOR.
- ★ 위 `sr_ff_mux_sequential`(SR-FF+MUX4)과 **다름** — 이쪽은 **D-FF+게이트**. generic `fsm`(Mealy 입력 X·출력 Z 날조)·`sequential_dff_generic`(입력파형)은 이 "상태도→D입력→게이트" 형식을 잃음 → 전용 archetype 필수.
- ★ **Vision 대응**: Vision이 D-FF를 J-K로 오독하면 `fsm`(JK 상태표)으로 빠짐 → `analyzeImage`에 "플립플롭 종류는 상태표 입력 열로 판별(D_A/D_B→D, J/K→J-K), 자율 순환이면 입력 X·출력 y 날조 금지" 규칙. classifier는 **D 플립플롭 + 상태도/상태표 + 게이트 구현 + 자율 순환(Mealy 입출력·MUX 없음)** 으로 `universal_digital`보다 먼저 매치, **J-K면 양보**(`hasJkFfLocal` 가드 → fsm/sequential_dff_generic).
- ★ **오분류 차단 2겹 (2026-06-24, 실측 로그 기반)**: Vision이 topic을 "상태 전이도와 상태표 분석"처럼 요약하며 **"D 플립플롭" 단어를 빠뜨리면** classifier tier-1(`hasDFfLocal`)이 미스 → generic `fsm`(Mealy 입력X·출력Z)으로 빠져 엉뚱한 문제 생성("생성 안됨"). → (1) **classifier 안전망**: "D 플립플롭" 키워드 없어도 *자율(`!hasMealyIo`) 상태도/상태표 + 플립플롭/게이트 설계 문맥*이면 dff_state_design로 라우팅(J-K·T-FF·SR+MUX·비동기리플카운터는 각자 가드로 양보). (2) **analyzeImage 전용 규칙 블록** 추가(자율 상태도→D-FF+게이트 설계): topicKey=fsm 금지, topic/interpretation에 "D 플립플롭"+"상태도"+"게이트 설계" 강제, 입력X·출력Z 날조 금지, ㉠~㉣·㉮㉯ 마커 보존. ※ Vision은 FF 박스를 R/BJT/SW로 오독하지만 이 archetype은 결정론 generator라 inventory 무관 — **텍스트 분류만 견고하면 됨**.
- 풀이 3단계(결정론): [1] 상태도→상태표 다음상태 ㉠~㉣, [2] D 입력(D=다음상태), [3] D_A·D_B를 (Q_A,Q_B) 2변수 카르노맵으로 최소화 → 게이트 ㉮(D_A)·㉯(D_B) 종류.
- ★ **일반화(2026-06-24)**: 기존 CYCLE_POOL(해밀턴 4-cycle=업/다운 카운터 전용)은 원본처럼 **자기루프·합류가 있는 비-해밀턴 자율 상태기계를 표현조차 못 해** "처음 나온 유형 생성 불가"였음. → CYCLE_POOL 폐기, **게이트 쌍 전수 열거**로 전환. 통찰: D-FF는 D=다음상태이므로 "next-state의 두 비트(D_A·D_B)가 각각 (Q_A,Q_B)의 단일 게이트로 떨어지는" 모든 함수가 유효 문제 = 2입력 게이트 6종(AND/OR/NAND/NOR/XOR/XNOR)의 쌍. `nextOf[s]=(gateA.spec[s]<<1)|gateB.spec[s]`로 자기루프·합류·순환 자연 포함. 상태도는 4노드 전부+각 노드 1엣지(`conceptDiagramRenderer`가 자기루프 `renderSelfLoop`로 처리).
- 모드 — ★ **변형은 플립플롭 종류를 바꾼다 (사용자 지정 2026-06-24)**:
  - `exam_similar` = **D-FF + D-FF**. a=D_A·b=D_B(서로 다른 두 게이트, 원본 XOR≠XNOR처럼). **원본(XOR,XNOR)은 생성 풀 제외**(참조 전용) → 29종.
  - `exam_variant` = **D-FF(FF_A) + T-FF(FF_B)**. a=D_A·b=**T_B**(여기). 전 조합 36종. FF 종류가 원본(D·D)과 달라 원본 충돌 없음.
  - T-FF 핵심: ㉯를 **T_B 게이트로 직접 파라미터화**(=clean 단일게이트), `nextB = Q_B ⊕ T_B`로 역산 → T-FF 여기표 단계(`T_B = Q_B(t) ⊕ Q_B(t+1)`)가 자연 발생. (나) 상태표 입력열은 D-FF면 `D_B`, T-FF면 `T_B`. 회로 (다)는 FF_B를 `T-FF`+`T` 핀으로 렌더(`circuitDiagram.ffBType`).
  - count개 distinct는 `generate({seed,mode,index:i})`의 `(offset+index)%pool.length`로 보장. generator는 GPT 없는 결정론(`solve(gateA,gateB,ffBType)`). 타입 `DffStateDesignCircuitDiagram`에 `ffAType·ffBType·ffAInputName·ffBInputName` 추가.
- figure 3개: (가) `concept_diagram`(입력 없는 ring 상태도), (나) `truth_table`(현재상태·다음상태(㉠~㉣)·D입력, outputLabels=[Q_A(t+1),Q_B(t+1),D_A,D_B]), (다) `dff_state_design_circuit`(전용 fixed-slot: D-FF 2개 + 게이트 ㉮·㉯(빈칸 점선박스) → D 핀, Q_A·Q_B 피드백 트렁크, 공통 CLK).
- 파일: `lib/generation/topologies/dffStateDesign.ts`(결정론 generator — nextOf·D입력·SOP·게이트 모두 cycle에서 도출, `minimizeSop` 사용, GPT 없음), `lib/pipeline/runDffStateDesignPipeline.ts`(결정론 3단계 텍스트), `lib/renderers/dffStateDesignCircuitRenderer.ts`. circuitType `dff_state_design`, diagramType `dff_state_design_circuit`. types·validateProblem `CIRCUIT_FIGURE_TYPES`·route dispatch(fsm 앞)·DIGITAL_CIRCUIT_TYPES·semantic normalize(상태천이·파형 off, multi 유지)·smokeNewArchetypes[11]·smokeAll 등록.
- ★★ **회귀 수정 (2026-07-25) — bare "mealy" 양보 가드가 원본을 generic fsm에 넘기던 버그 (사용자 "다른 문제가 생성돼, 이전엔 됐었다")**: 실측 **3/3 `fsm`(sequence_detector)** 로 오분류돼 ★있지도 않은 입력 X★가 있는 Mealy 문제로 변질. 원인 = Vision이 `relatedConcepts`에 **"Mealy 머신"을 개념 태그로** 붙였고, 분류기의 Mealy 양보 가드가 `matchesKeyword(text, [..., "mealy", "moore"])`로 **단어 언급만 보고** 주 분기·안전망 둘 다 포기한 것(이 원본은 자율 순환이라 외부 입력 X가 없다). ※ 사용자 "이전엔 됐었다"는 **실제로 맞았다** — 추측 말고 재현부터 할 것([[feedback_nondeterministic_repro]]).
  - 수정 ①(분류기): 양보 근거를 **실제 외부 입출력**(`입력 x`·`출력 z`·`출력 y`·`외부 입력`)으로 좁히고 bare `mealy`/`moore`는 제외. 진짜 Mealy 문제는 입력 X·출력 Z를 명시하므로 계속 fsm으로 간다.
  - 수정 ②(route 안전망): `detectDffStateDesign` export + generate에서 stale circuitType(fsm·sequential_dff_generic·universal_digital) 교정. **dff_mux_sequential 보정 뒤**에 배치해 MUX 유형을 뺏지 않고, JK·T-FF·SR·MUX·외부 I/O는 양보.
  - 검증: 신규 `scripts/smokeDffStateDesignRouting.mjs` **6/6**(신고 재현 + Mealy 태그 없는 요약 + 'D 플립플롭' 누락 안전망 + 회귀 3종: 진짜 Mealy FSM→fsm·JK·SR+MUX) / `scripts/smokeDffStateDesignStale.mjs` **3/3**(stale 3종 → 전용 figure 3개·입력 X 없음·issues=0) / 원본 이미지 E2E **3/3** `dff_state_design`(전용 figure·3단계 발문) / tsc 신규 0.
  - ★ 교훈: **개념 태그(relatedConcepts)는 문제의 구조적 사실이 아니다** — Vision이 붙인 "Mealy 머신" 같은 태그로 양보를 결정하면 자율 순환 유형을 통째로 잃는다. 양보 가드는 **구조적 근거(실제 입출력 존재)** 로만 걸 것.

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
- ★★ **아래첨자 표기 때문에 간헐적으로 ff_with_waveform에 뺏겼다** (2026-08-04 사용자 신고 "유사문제가 생성이 안돼"):
  같은 원본이 회차에 따라 `async_preset_ripple_counter`(재현 5/5)와 **`ff_with_waveform`**(로그 실측 1회,
  topic="비동기식 D 플립플롭 회로"·topicKey=switching_circuit)로 갈렸고, 실패 회차는 FF 1개짜리 다른 문제가
  **totalIssues=0으로 조용히** 생성됐다.
  · 원인: Vision이 신호를 `I_0, I_1, I_2`(ASCII)로도 **`I₀, I₁, I₂`(유니코드 아래첨자 + 쉼표)** 로도 쓰는데,
    조건이 `/i_?0\b/`(ASCII)와 `/i₀\s*i₁\s*i₂/`(공백만 허용)뿐이라 **쉼표 나열 회차에서 구조 신호가 통째로 미발화**.
    거기에 "SET" 낱말까지 빠지면 넓은 분기(ff_with_waveform)가 가져갔다. ff_with_waveform의 **양보 가드도
    같은 이유로 미발화**(`Q₀, Q₁, Q₂`를 다중 Q로 못 읽음)라 두 겹이 동시에 뚫렸다.
  · ✅ 수정: `normalizeSubscriptDigits`(₀~₉ → ASCII, `inferDcQueries.ts`와 같은 규약)로 **정규화 층에서 흡수**
    ([[feedback_gpt_format_normalization]] — 조건·프롬프트를 늘리지 말 것). async 블록의 I·Q 검출과
    ff_with_waveform의 `multiQOutputs` 양보 가드 **양쪽 모두** 정규화 텍스트로 검사.
  · ✅ 최후의 구조 신호 추가: **비동기 + 3비트 Q(Q₀·Q₁·Q₂)** → 이 archetype. 형제는 단일 Q(임용8)·2비트
    Q₁Q₀(임용12)라 셋 다 언급되는 형식은 이것뿐이다(I 입력도 SET도 흘린 회차의 마지막 방어선).
  · 검증: `scripts/smokeAsyncPresetRouting.mjs` **10/10**(신고 회차 재현 3종(아래첨자+쉼표·가운뎃점·Q만) +
    기존 정상 회차 2 + 형제 미탈취 5(임용8 단일 Q·D-FF 2비트·JK 카운터·T+JK 혼합·mod-N)) /
    `smokeOriginalRouting` **56/56** / 디지털 형제 무회귀(ffMixed 7/7·jkExcitation 28/28·dffStateDesign 6/6·
    muxImpl 7/7·tffDacChain 17/17) / tsc 0 / **원본 이미지 E2E 양모드 issues=0**.

## 2전원 페이저 + 중첩 → **V_L = 0이 되는 전류원 역산** (임용 3번 회로이론 — `ac_superposition_null_source`) 전용 archetype

- 원본: 직사각 2-메시. 좌 세로 = **전압원 V_s(√2∠45°, + 위)**, 우 세로 = **전류원 I_s(↑)**,
  상단 1Ω·1Ω, 가운데 **j2Ω(양단이 V_L, + 위)**, 하단 −j1Ω·−j1Ω.
  〈해석 절차〉 [1] I_s **개방** 시 V_L1 [2] V_s **단락** 시 V_L2 [3] 중첩 + **V_L = 0** → I_s.
- ★ 물리(닫힌형): **V_L1 = V_s·Z_m/(Z_a+Z_m+Z_c)**, **Z_p = Z_m ∥ (Z_a+Z_c)**, **V_L2 = I_s·Z_p**,
  **I_s = −V_L1/Z_p**. 원본 검산: V_L1 = j2 = 2∠90° · Z_p = 2Ω(순저항) · **I_s = −j = 1∠−90°[A]**.
- ★★ **우측 상·하단 소자(Z_b·Z_d)는 답에 전혀 관여하지 않는다** — 이상 전류원과 직렬이라 전류가 이미
  정해져 있다. 원본이 그대로 갖고 있는 **distractor**이고 이 유형의 교육 포인트다
  (형제 `ac_superposition_source_design`의 R₂와 같은 역할).
- ★★ **오분류(수정됨)**: 전용 항목이 없어 **generic `universal_ac`** 로 떨어져 정답이 **"(query 없음)"**,
  풀이는 *"AC 정상상태 phasor 해석 — 입력 ω = 10000 rad/s"* placeholder, figure는 generic `analog_netlist`였다
  (사용자 신고 2026-08-05). 로그에 `generic_dispatch_warning`이 남았고 **validator는 issues=0으로 통과** —
  generic 경로 실패의 전형(`oscilloscope_phase_l`·`ac_superposition_source_design`과 같은 실패 모드).
- ★★ **판별선은 "영(0) 조건"이다**: 형제 `ac_superposition_source_design`은 **0이 아닌 목표 페이저**(−7−j)를 주고
  **두 전원의 크기**를 구한다. 이쪽은 목표가 **0**이고 미지가 **전류원 하나**다.
  ★ 실측 회차는 **"중첩"·"전류원"을 한 번도 쓰지 않았고** 있지도 않은 **"종속 전원"을 지어냈다**(인벤토리 dep=0).
  → 요구 매처는 넓게(`전류/전압/전원 … 구하`), 판별력은 **영 조건**에 싣는다. 전원 개수는 인벤토리
  구조 신호(V≥1 ∧ I≥1 ∧ 리액티브≥1)로도 인정한다([[feedback_gpt_format_normalization]]).
- ★★ **그 "영(0) 조건"마저 흘린 회차가 나왔다** (사용자 신고 2026-08-10, 재현 2/2):
  요약이 *"인덕터 양단의 전압 V_L이 **주어졌을 때** 페이저 전류 I_S를 구한다"* 로만 서술해 `0`이 한 글자도
  없었다 → `matchesNullSourceAsk` 미발화 → **universal_ac**로 떨어져 generic `analog_netlist`가 나왔다
  (내부 id `V_leg1_1`·`C_leg3_1` 노출 + **학생이 구해야 할 I_s에 값 1.5A가 찍힘**, totalIssues=0으로 조용히 통과).
  · ✅ **최후의 판별선은 인벤토리의 미지 전원 기호**(CLAUDE.md 1-4-5와 같은 교훈):
    그 회차에도 전압원은 `√2∠45°V`(**수치**), 전류원은 `Is[A]`(**미지 기호**)로 남아 있었다.
    `matchesNullSourceUnknownSource`(unknownI≥1 ∧ knownV≥1 ∧ 리액티브≥1 + 양단 전압 언급 + 전류를 구함)를
    **ask의 대안 경로**로 두고 분류기·감지기가 공유한다.
  · ★ **크기와 각도를 구분해서 볼 것** — `V_s∠0°V`는 각도에 숫자가 있어도 **크기는 미지**다.
    ∠ 앞의 크기만 보므로 형제 `ac_superposition_source_design`(V·I **둘 다** 미지 → knownV=0)은 안 걸리고,
    두 전원이 모두 수치인 `ac_thevenin_two_box`(unknownI=0)·종속전류원(`2V_c`는 제어식이라 미지 전원 아님)도 안 걸린다.
  · 검증: `scripts/smokeNullSourceUnknownI.mjs` **9/9**(신고 회차 재현 3 + 기존 경로 무회귀 + 형제 양보 5) /
    `smokeAcSuperpositionNullSource` 32/32 · `smokeOriginalRouting` **57/57** · tsc 0 /
    신고 회차 analysis로 **E2E 양모드 issues=0**(figure가 전용 `ac_two_source_mesh_circuit`으로 복귀,
    **stale `universal_ac` analysis로도 구제**됨).
- 모드: **exam_similar**=원본(가운데 인덕터, V_L=0) / **exam_variant**=**리액티브 소자 종류 교환**
  (가운데 커패시터·하단 인덕터, V_C=0) — 구조·중첩 절차 동일.
- ★ 값은 규칙 열거 + 필터: **V_L1·Z_p·I_s가 모두 정수 격자** + I_s 위상 45° 배수. **원본 튜플 제외**,
  유사/변형 풀 분리(각 1000여 개).
- ★★ **표기 gotcha 3건(모두 E2E에서 발견)**:
  ① `magTex`가 |z|²를 **반올림**해 |I_s| = 1.5를 **`√2`(=1.414)** 로 찍었다 — 값 공간을 **정수 격자**로 조이고
     magTex에도 방어(비정수면 √n 표기 금지)를 넣었다. **크기 오표기는 정답이 틀린 것과 같다.**
  ② 각도의 ASCII 하이픈(`∠-90°`) → `numFmt`로 **유니코드 마이너스** 통일, `−180°`는 관례대로 **180°**.
  ③ `elemTex`를 " + "로 이으면 `+ −j2Ω` → `zSumTex`가 부호를 흡수해 `2Ω + j4Ω − j2Ω`로 적는다.
  스모크가 **극형식 크기 = 실제 |z|** 를 96건 대조하고 ASCII 하이픈 0건을 단언한다.
- ★ 렌더러는 **형제(임용 5번) `acTwoSourceMeshCircuitRenderer`를 가산적으로 일반화**해 재사용한다
  (`rightSource:"current"` · `midMeasureLabel` · `showMeshArrows:false` · `caption`). 미지정이면 형제 그림은
  **완전히 동일**하고 스모크가 그걸 단언한다. + 좌측 전원 라벨이 길면 캔버스 밖으로 잘려 **전원 위**로 옮긴다(실측).
- 파일: `lib/generation/topologies/acSuperpositionNullSource.ts`(결정론 generator + 공용 매처)·
  `lib/pipeline/runAcSuperpositionNullSourcePipeline.ts`(3단계 + `detectAcSuperpositionNullSource`)·
  `acTwoSourceMeshCircuitRenderer.ts`(확장). circuitType `ac_superposition_null_source`,
  diagramType는 **기존 `ac_two_source_mesh_circuit` 재사용**. types·circuitType·classifier(0-PRE, 두 형제 **앞**)·
  route(dispatch+semantic+topology 우회)·`smokeOriginalRouting`(+1줄, **실측 요약 그대로**) 등록.
- 검증: tsc 0 / `scripts/smokeAcSuperpositionNullSource.mjs` **32/32**(실측 회차 포함 감지 4 + 형제 양보 7 +
  3과목 분류 + 원본 물리 4 + **생성물 48개를 독립 메시 해석으로 재검산(V_L=0)** + 값 품질·원본 미생성 +
  극형식 크기 96건 대조 + 합 표기 + 렌더 6(형제 무회귀 포함)) / `smokeOriginalRouting` **57/57** /
  AC 형제 무회귀(twoSourceMesh 37/37·supSourceDesign 28/28·theveninDependent 24/24·twoBox 37/37·
  deltaWye 47/47·oscPhaseL 40/40) / **생성 API E2E 양모드**(stale `universal_ac` analysis로도 안전망이 보정) /
  헤드리스 Chrome 시각검증(원본 배치 재현).

## JK 3개 동기식 카운터 (임용 6번 디지털 — `jk_sync_counter`) — **클럭 에지·반전 신호 배선** (2026-08-05 신고 2건)

- 원본: JK-FF 3개(Q₂Q₁Q₀) 공통 CP. **CP 입력에 버블이 붙은 하강 에지** 트리거이고,
  J₀는 **FF₁의 Q̄ 출력에서 오는 배선**(J·K 입력에는 버블이 없다). (나) 타이밍 도표의 Q 전이도 하강 에지에 놓인다.
- ★★ **신고 ① "clk가 하강엣지로 작용하는데 문제는 상승엣지로 생성되었어"**: 렌더러의 `clkTri`가 삼각형만
  그려 버블이 없었고, `bitSamples`가 Q 값을 `[2k, 2k+1]` 구간에 찍어 **전이가 상승 에지(짝수 t)** 에 놓였다.
  · 클럭 에지는 **원본의 구조적 속성**이다 → `JkStateMachineCircuitDiagram.clockEdge`로 데이터에 싣고
    렌더러(버블)·타이밍(전이 시각)·발문/풀이 문구가 **한 값을 함께 따른다**.
  · shape="step"은 zero-order hold라 **값이 바뀌는 샘플 시각 = 전이 에지**다.
    falling이면 `t=0`에 초기값을 찍고 `t=2k−1`에 seq[k]를 찍는다(= 펄스 k의 하강 에지에서 전이).
    같은 t에 샘플 2개를 찍으면 `waveform_time_not_monotonic`이 나므로 시각은 항상 증가시킨다.
- ★★ **신고 ② "생성된 회로에는 Q0 f/f 입력에 not 게이트가 있어"**: 반전 신호(Q̄ᵢ)를 **Q̄ 출력 핀에서
  배선**하면서 목적지 J·K에 **반전 버블까지** 덧그려 **이중 반전(= 사실상 Q)** 이 됐다.
  FF가 Q̄ 핀을 내놓는 회로에서 반전은 **배선으로 표현**한다 — 버블을 겹쳐 그리지 마라.
- ★ 에지 판정은 **공용 감지기** `lib/analysis/clockEdge.ts`(`detectClockEdge`)로 한다 — 하강/상승·엣지 표기 변형·
  영문(negative/positive edge)·"클럭 입력의 버블" 묘사를 흡수하고, **근거가 없거나 양쪽이 다 나오면 `null`**.
  파이프라인은 `?? "falling"`로 **원본을 보존**한다(절대규칙 0). 특정 문제에 하드코딩하지 않으므로
  다른 FF archetype도 같은 함수를 쓸 수 있다. ※ Vision 요약에 에지가 없는 회차가 흔하다 — 기본값이 곧 답이다.
- 파일: `lib/analysis/clockEdge.ts`(신설)·`jkStateMachine.ts`(`ClockEdge`·`bitSamples(falling)`·seq를 nClk+1로)·
  `jkStateMachineCircuitRenderer.ts`(클럭 버블 + 입력 버블 제거)·`runJkSyncCounterPipeline.ts`(감지·배선·문구)·
  `types/index.ts`(payload `clockEdge`).
- 검증: tsc 0 / `scripts/smokeJkClockEdge.mjs` **26/26**(감지 11(하강 5·상승 2·보류 2·형태 2) +
  전이 에지 패리티 양모드 + CP 파형 불변 + **t 단조 증가**(2모드×6시드×2파형) + 사이클·비순환·마커 **무회귀** +
  렌더 7(클럭 버블 3개/0개·미지정 기본값·J·K 버블 0·Q̄ 출력에서 배선·변형 게이트)) /
  `smokeOriginalRouting` 56/56 · 디지털 형제 무회귀(asyncPreset 10/10·jkExcitation 28/28·ffMixed 7/7) /
  **생성 API E2E 6회**(에지 미언급·하강·상승 × 양모드) **issues=0** — 미언급·하강은 falling·전이 홀수 t,
  상승은 rising·전이 짝수 t / 헤드리스 Chrome 시각검증(`scripts/_jkEdgeFigShot.mjs`).

## 교류 테브난 → **소자 값 a·b 설계** + 최대 평균전력 (임용 7번 회로이론 — `ac_thevenin_design_ab`) 전용 archetype

- 원본: `V=8∠90° ─ [2Ω + (−j3Ω) 직렬 션트] ─ 상단 a[Ω] ─ jb[Ω] ─ 마디 A`, `마디 A ─ (−jb[Ω]) ─ GND(=B)`,
  단자 A–B에 **고정 부하 Z_L = 2 + j2**. 최대 평균전력이 되는 **a, b**와 **P_L**을 구한다.
- ★ 물리(닫힌형, 복소 연산 교차검증):
  · 좌측 션트(2 − j3)는 **이상 전압원과 병렬**이라 A–B에서 본 회로에 무영향 — **원본의 distractor**.
  · 직렬 (a+jb)와 션트 (−jb)의 합이 **a로 약분**되는 것이 이 회로의 핵심:
    **Z_TH = (a+jb)∥(−jb) = b²/a − jb**, **V_TH = V·(−jb)/a** (|V_TH| = |V|·b/a)
  · 정합 조건 Z_L = Z_TH* → **b = X_L**, **a = X_L²/R_L**
  · **P_max = |V_TH|²/(4R_TH) = |V|²/(4a)** — b가 완전히 약분된다.
  원본: **a=2, b=2**, Z_TH=2−j2, V_TH=8∠0°, **P_max = 8[W]**.
- ★ 형제와 방향이 반대: `ac_thevenin_ladder`·`ac_bridge_max_power`·`ac_thevenin_two_box`는 모두
  **부하**를 구한다. 이 유형만 **회로의 소자 값을 역산**한다 — 그게 판별선이다.
- ★★ **오분류 2건(수정됨)**:
  ① 분류에서 `ac_bridge_max_power`(브리지 4-arm + 순저항 R_L)가 가져갔다(사용자 신고). 넓은
     `universal_ac`(AC+L/C+최대전력)도 같은 이유로 삼킨다 → **pre-subject 0-PRE**로 올렸다.
  ② 고친 뒤 **변형 모드만** `ac_thevenin_dependent`(종속전원 테브난)로 샜다 — 그 감지기가
     "테브난+최대전력+리액티브"만 보고 dispatch **체인 최상단**에 있었기 때문. → 이 유형 dispatch를
     **그보다 앞**에 두었다(중복으로 남긴 뒤쪽 블록은 tsc가 unreachable로 잡아 주므로 제거).
- ★★ **Vision이 a·b를 요약에서 통째로 흘린다**(실측): "테브난 등가와 최대 전력"까지만 쓰고 미지 소자를
  언급하지 않은 회차가 있었다. 그때 남는 유일한 신호는 **인벤토리의 기호 소자 값**(`a[Ω]`·`jb[Ω]`·`-jb[Ω]`)이다.
  → 분류기·감지기 모두 **텍스트 OR 인벤토리 기호 값(2개 이상)** 으로 판정한다.
  ⇒ 일반화: **미지 소자를 기호로 들고 있는 유형은 인벤토리 값이 최후의 판별선**이다.
- ★ 값은 규칙 열거: a·b 정수, `R_L = b²/a` 0.5 배수, `P = |V|²/(4a)` 0.5 배수, `|V_TH| = |V|b/a` 0.5 배수.
  **원본 튜플 제외**, 유사·변형 풀 분리. exam_similar=Z_L given → a·b(원본) /
  exam_variant=**구하는 양 교환**(a·b given → Z_L·P_max).
- 파일: `lib/generation/topologies/acTheveninDesignAb.ts`·`lib/pipeline/runAcTheveninDesignAbPipeline.ts`
  (+`detectAcTheveninDesignAb`)·`lib/renderers/acTheveninDesignAbCircuitRenderer.ts`(전용 fixed-slot:
  교류원 + distractor 션트(R+(−jX)) + 상단 a·jb + 마디 A의 −jb + 점선 박스 Z_L(R 직렬 jX) + 단자 A·B).
  circuitType `ac_thevenin_design_ab`, diagramType `ac_thevenin_design_ab_circuit`.
  types(payload)·renderers/index·validateProblem·classifier(**pre-subject 0-PRE**)·
  route(**dispatch 최상단**+semantic+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 · eslint 0 / `scripts/smokeAcTheveninDesignAb.mjs` **18/18**(실측 오분류 회차 +
  **a·b를 흘린 최악 회차(인벤토리 기호 값으로 구제)** + 형제 양보 4종(브리지·two_box·종속전원·사다리) +
  생성물 28개 재검산(복소 연산으로 Z_TH·V_TH·켤레정합·P_max) + 원본 값 + 원본 튜플 미생성 + 렌더 6) /
  `smokeOriginalRouting` **50/50** / 형제 무회귀(acTheveninDependent 24/24·acTheveninTwoBox 37/37·
  zenerShunt 18/18) / **원본 이미지 E2E 양모드 정상**(유사 V=16∠−90°·Z_L=8+j4 → a=2·b=4·P=32W,
  변형 a=8·b=2 → Z_TH=1/2−j2·Z_L=1/2+j2·P=8W — 둘 다 복소 연산 교차검증 일치).

## 무한 면전하 + 무한 **직선** 선전하 → **합성 전계 벡터**로 C₁·C₂ 역산 (임용 12번 전자기학 — `sheet_line_efield_vector`) EM 레지스트리 항목

- 원본: ㉠ **x=4[m] 평면**(yz면과 나란)에 면전하밀도 C₁[nC/m²], ㉡ **(x=0, z=1)의 무한선**(y축과 나란)에
  선전하밀도 C₂[nC/m]. **축 밖의 점 P(1,2,−1)** 에서 합성 전계 **E = −162π a_x − 36π a_z**가 되는
  **C₁·C₂를 각각** 구한다. ε₀=(1/36π)×10⁻⁹, π는 그대로.
- ★ 물리(닫힌형): ε₀ 대입 시 `1/(2ε₀) = 18π×10⁹`, `1/(2πε₀) = 18×10⁹` 이므로 [nC] 단위에서
  · **E₁ = 18π·C₁**, 방향은 평면에서 멀어지는 쪽(P가 −x쪽 → **−a_x**)
  · 선→P 수직벡터 (d_x, 0, d_z), ρ²=d_x²+d_z² → **E₂ = (18C₂/ρ²)(d_x a_x + d_z a_z)**
  · ★ **a_z 성분은 선전하만** 기여 → 거기서 C₂를 먼저 얻고, a_x 성분에서 C₁을 얻는다(원본 절차 그대로).
  원본 검산: ρ²=5 → E_z = −36C₂/5 = −36π → **C₂ = 5π**, E_x = −18πC₁+18π = −162π → **C₁ = 10**.
- ★ 형제와 다르다: `sheet_line_efield_superposition`은 **z=0 평면·축 위 점·E=0 조건**으로 미지수 **하나**,
  `sheet_ring_efield_ratio`는 **원형 링**+크기 비. 이쪽은 **평면이 x에 수직 + 점이 축 밖**이라 선전하 전계가
  **x·z 두 성분**을 갖고, 주어진 **벡터 두 성분에서 미지수 두 개**를 푼다.
- ★★ **오분류(수정됨) — Vision이 원본을 통째로 지어냈다**: 실측 dispatch가 `sheet_ring_efield_ratio`.
  더 심각한 건 요약 자체가 *"원형 루프에 분포한 선전하… 두 전계의 **크기 비**가 주어진다"* 로,
  **원본에 없는 조건을 만들어 냈다**는 점이다(원본은 합성 전계 벡터가 주어짐). 원인 추정 =
  analyzeImage의 기존 `sheet_ring`(면전하+원형 링+비율) 규칙이 **few-shot 템플릿처럼 작용**해
  겉모습이 비슷한 원본을 그 틀에 맞춰 다시 쓴 것. ⇒ 2겹 대응:
  (1) 구조 감지기 `detectSheetLineEfieldVector`(**두 밀도를 동시에 구함** + 합성 전계; 반지름 given이면 양보)를
      EM 강제 체인 최상단(0-0-B)에, (2) **analyzeImage에 이 유형 전용 추출 규칙**을 추가해
      "원형 루프·크기 비로 요약 금지"를 명시. 보강 후 topic이 "무한 면전하와 **직선** 선전하의 합성 전계"로 교정됐다.
  ★ 교훈: **추출 규칙은 Vision의 인식을 바꾼다** — 비슷한 형제 규칙만 있으면 그쪽으로 끌려간다.
  감지기만 고치면 요약 자체가 오염된 회차는 못 살린다.
- ★ 값은 규칙 열거: **C₂ = m·π** 로 두면 E₂도 π의 배수가 되어 두 성분이 모두 깔끔하다.
  `q = 18m/ρ²`가 정수인 (d_x, d_z, m)만 채택, E_x<0·크기 제한. **원본 튜플 제외**.
  exam_similar=E 주어짐 → C₁·C₂(원본) / exam_variant=**구하는 양 교환**(C₁·C₂ 주어짐 → E).
- 파일: `electromagnetics.ts`(`sheetLineEfieldVector` + `SHEET_LINE_VEC_SPACE`)·
  `emFieldRenderer.ts`(`renderSheetLineVectorAxes`, geometry `sheet_line_vector_axes` — z↑·y→·x↙ 축 +
  빗금 평행사변형 평면(㉠) + y축과 나란한 굵은 선(㉡) + 축 밖의 점 P와 수직 보조선).
  classifyElectromagnetics(감지기)·runElectromagneticsPipeline(체인 0-0-B)·analyzeImage 규칙·
  `smokeOriginalRouting`(+1줄, 실측 오요약 그대로) 등록.
- ★ 스모크 gotcha: `texToPlain`이 `C_1` → **`C₁`(아래첨자)** 로 바꿔 렌더한다 — 원문 형태로 단언하면 거짓 실패.
- 검증: tsc 0 / `scripts/smokeSheetLineEfieldVector.mjs` **21/21**(실측 오요약 회차 재현 + 형제 양보 3종
  (진짜 원형 링·E=0 조건·자계) + 생성물 28개 재검산(E₁+E₂ = 주어진 E) + 원본 값 + 원본 튜플 미생성 +
  발문·렌더) / `smokeOriginalRouting` **49/49** / EM 형제 무회귀(sheetRing 10/10·sheetLine 8/8·
  twoPointCharges 13/13·pointLineNull 25/25·bentWire 27/27·cylinderInductance 30/30·curl 34/34·flux 10/10) /
  **원본 이미지 E2E 정상**(평면 x=5·선 z=2·P(1,2,3) → C₁=20·C₂=2π, E=−342π a_x+18π a_z — 독립 검산 일치).

## 제너 n개 **직렬** 션트 정전압 → 부하 저항 **최솟값·최댓값** (임용 2번 전자회로 — `zener_shunt_regulator`) 전용 archetype

- 원본: `V_i(40V) ─ a[kΩ] ─ 마디 P`, 마디 P에 **제너 2개 직렬**(각 V_Z=5V, I_ZM=8mA) ∥ **R_L**(V_RL 측정).
  정전압이 유지되도록 R_L을 변화시킬 때 **R_Lmin=1kΩ이 되는 a**를 구하고, 그 a로 **R_Lmax**를 구한다.
- ★ 물리(닫힌형): 정전압 **V_L = n·V_Z**, 직렬 저항 전류 **I_S = (V_i − V_L)/a [mA]**(V[V]·a[kΩ] → mA),
  KCL `I_S = I_Z + I_L`, `I_L = V_L/R_L`.
  · **R_L 최소 ⟺ I_L 최대 ⟺ I_Z = 0**(이상적 제너의 하한) → **a = (V_i − V_L)·R_Lmin/V_L**
  · **R_L 최대 ⟺ I_L 최소 ⟺ I_Z = I_ZM** → **R_Lmax = V_L/(I_S − I_ZM)**
  원본: V_L=10V → I_S=10mA → **a = 3[kΩ]**, I_Lmin=2mA → **R_Lmax = 5[kΩ]**
  (두 극단에서 0 ≤ I_Z ≤ I_ZM 성립을 검산으로 확인.)
- ★★ **오분류(수정됨) — 정답까지 틀렸다**: 전용 항목이 없어 `dc_mesh`(electronics fallback)로 dispatch돼
  **원본을 거의 그대로 베낀 문항**이 나왔고 정답은 **a=5(실제 3)**, 풀이는 "임피던스를 최소화해야 하므로"
  같은 알맹이 없는 문장이었다(사용자 신고). ⇒ 전용 항목이 없으면 generic 경로가 **베끼면서 틀린다**.
- ★★ **0-PRE는 반드시 "진짜 subject 무관 구역"에** — 처음엔 `decideType` 안(다른 0-PRE 블록들 옆)에 넣었는데
  **electronics 분기는 함수 중간(≈1806행)에서 早期 return**하므로 electronics 과목에서는 도달조차 못 했다
  (스모크가 즉시 잡음). `classifyCircuitType` 상단의 pre-subject 구역(BJT 스위치·OPAMP 레귤레이터 옆)으로 이동.
  ⇒ **"0-PRE"라는 이름이 붙어 있다고 다 subject 무관인 게 아니다** — 함수 위치를 확인할 것.
- ★ 형제와 구분: `zener_bjt_regulator`(제너+**BJT** 션트)·`opamp_series_regulator`(OPAMP 오차증폭기+직렬 패스).
  판별선 = **능동소자 없음 + 부하 저항의 최솟값/최댓값(범위)를 묻는다**. BJT·OPAMP 낱말이 있으면 양보.
- ★ 값은 규칙 열거: (n, V_Z, V_i, R_Lmin, I_ZM) 열거 후 **a 0.5 배수(0.5~20kΩ)** · **R_Lmax 0.5 배수(≤60kΩ)** ·
  `I_S > I_ZM` · `R_Lmax > 1.5·R_Lmin`(범위가 시시하지 않게) 필터. **원본 튜플 제외**, 유사·변형 풀 분리.
  exam_similar=R_Lmin given → a·R_Lmax(원본) / exam_variant=**구하는 양 교환**(a given → R_Lmin·R_Lmax 범위).
- 파일: `lib/generation/topologies/zenerShuntRegulator.ts`·`lib/pipeline/runZenerShuntRegulatorPipeline.ts`
  (+`detectZenerShuntRegulator`)·`lib/renderers/zenerShuntRegulatorCircuitRenderer.ts`(전용 fixed-slot:
  V_i 세로 → a 상단 → 마디 P ∥ 제너 n개 세로 직렬(캐소드 위) ∥ R_L(V_RL +/−), 접지).
  circuitType `zener_shunt_regulator`, diagramType `zener_shunt_regulator_circuit`.
  types(payload)·renderers/index·validateProblem·classifier(**pre-subject 0-PRE**)·
  route(dispatch+semantic+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- 검증: tsc 0 / `scripts/smokeZenerShuntRegulator.mjs` **18/18**(실측 오분류 회차를 **electronics·circuit_theory
  두 과목**에서 재현 + 형제 양보 3(BJT·OPAMP·범위 미요구) + 생성물 28개 재검산(a·R_Lmax·**두 극단의 I_Z**) +
  원본 값 + 원본 튜플 미생성 + 유사/변형 풀 비중첩 + 렌더 7) / `smokeOriginalRouting` **48/48** /
  **원본 이미지 E2E 양모드 정상**(유사 24V·제너2개 6V·8mA → V_RL=12V·a=1kΩ·R_Lmax=3kΩ,
  변형 45V·제너3개 3V·4mA·a=8kΩ → V_RL=9V·I_S=4.5mA·R_Lmin=2kΩ·R_Lmax=18kΩ — 둘 다 수기검산 일치) /
  Edge 시각검증(원본 배치 재현·겹침 0).

## t=0 스위치 **개방** → 무전원 직렬 RLC 자연응답 (임용 5번 회로이론 — `switched_rlc_source_free`) 전용 archetype

- 원본: `25V ─ 10Ω ─ SW(t=0 개방) ─ 마디 N`, `마디 N ─ 40Ω ─ GND`,
  `마디 N ─ 60Ω ─ C(2×10⁻³F, v(t) + 위) ─ L(5H, i(t) ↓) ─ GND` (우측 leg는 **C·L 직렬**).
  [1] v(0⁻)·i(0⁻) [2] i(t) 2차 미분방정식 [3] i(t).
- ★★ **결합을 원본 확대로 확정했다** ([[feedback_verify_wiring_by_zoom]]): 우측 leg의 C와 L이
  **직렬**임을, 그리고 **i(t) 화살표가 아래 방향**임을 5배 확대로 확인했다. 병렬로 읽으면 답이 완전히 달라진다.
- ★ 물리(닫힌형, RK4 9자리 교차검증):
  · t<0 (SW 닫힘·직류 정상상태): C 개방 → 우측 leg 전류 0 → **i(0)=0**. 60Ω·L 강하도 0이므로
    **v(0) = V_s·R_p/(R_s+R_p)** = 25·40/50 = **20V**.
  · t≥0 (SW 개방): 전원 가지가 분리되고 **R_p+R_3+C+L 직렬 무전원 RLC** 만 남는다(R=100Ω).
    `i'' + (R/L)i' + (1/LC)i = 0`, `i(0)=0`, `i'(0) = −v(0)/L = −4`.
  · **α = R/2L = 10 = ω₀ = 1/√(LC)** → **임계제동**(중근) → **i(t) = −4t·e^(−10t) [A]**,
    **v(t) = 20(1+10t)e^(−10t) [V]**.
  · ★ i가 **음수**인 것은 커패시터 방전 전류가 그림의 기준 방향(↓)과 반대이기 때문 — 정상이다.
- ★ **오분류(수정됨)**: 실측 dispatch가 `switched_rlc_step`(v1: SPDT + **전류원** + R_c+L 병렬가지)이라
  **원본에 없는 전류원 1A와 SPDT(A→B) 스위치**가 있는 회로로 변질됐다(사용자 신고).
  판별선 = **전류원 0 + 전압원 1개 + 스위치가 "열린다"**. 전류원이 있으면 형제(step·5leg)가 맞고,
  전압원 2개면 `switched_rlc_dual_switch`가 맞다. classifier **0-PRE** + route 안전망 2겹.
- ★ 값은 규칙 열거 — **임계제동 조건 R²C = 4L** 을 만족하도록 (R_p, R_3, α)에서 `L=R/2α, C=2/(αR)`를
  역산한다. 필터: L이 0.5 배수(1~20H) · **커패시턴스 가수 두 자리 이하** · v₀ 정수 · i'(0) 0.5 배수.
  **원본 튜플 제외**. exam_similar=i(t)(원본) / exam_variant=**구하는 양 교환**(v(t)).
- ★ 표기 gotcha: `capLabel`이 가수 세 자리를 허용해 **`125×10⁻⁵[F]`** 가 문항에 그대로 나갔다(실측).
  두 자리를 넘으면 **값 풀에서 제외**한다(라벨만 고치면 다른 지저분한 값이 또 샌다).
- 파일: `lib/generation/topologies/switchedRlcSourceFree.ts`·`lib/pipeline/runSwitchedRlcSourceFreePipeline.ts`
  (+`detectSwitchedRlcSourceFree`)·`lib/renderers/switchedRlcSourceFreeCircuitRenderer.ts`.
  circuitType `switched_rlc_source_free`, diagramType `switched_rlc_source_free_circuit`.
  types(payload)·renderers/index·validateProblem·classifier(0-PRE, **rlc_state_equation 앞**)·
  route(dispatch+semantic+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- ★ 삽질 기록: 패치 스크립트의 중복 삽입 가드를 `slice(0,50)`으로 걸었더니 **형제 0-PRE 블록의 머리말과
  50자가 같아** 삽입이 조용히 건너뛰어졌다(스모크가 즉시 잡음). 가드는 **고유 토큰**으로 걸 것.
- 검증: tsc 0 · eslint 0 / `scripts/smokeSwitchedRlcSourceFree.mjs` **19/19**(실측 오분류 회차 재현 +
  표현 변형 + 형제 양보 4(전류원·전압원2개·스위치 닫힘·교류) + 생성물 24개 재검산(**임계제동·닫힌형·RK4**) +
  커패시턴스 표기 + 원본 값 + 원본 튜플 미생성 + 렌더 6) / `smokeOriginalRouting` **47/47** /
  형제 무회귀(switchedRlcDualSwitch 22/22·rlcStateEquation 19/19·switchedRlcStep·switchedRcStale 6/6) /
  **원본 이미지 E2E 양모드 정상**(유사 30V·20/20/20Ω·5×10⁻³F·2H → v(0)=15V·i(t)=−7.5t·e^(−10t),
  변형 v(0)=48V·v(t)=48(1+5t)e^(−5t) — 둘 다 RK4 교차검증 일치) / Edge 시각검증.
  ※ 정답의 `−7.5`가 화면에 `−15/2`로 보이는 건 route의 전역 분수 변환기(1-4-3 규칙) 때문 — 의도된 동작.

## t=0 스위치가 **커패시터를 단락** → 1차 RL 계단응답 (임용 7번 회로이론 — `switched_cap_short_rl`) 전용 archetype

- 원본: `12V ─ 4Ω ─ [C(1F) ∥ SW] ─ L(2H) ─ 복귀` 단일 직렬 루프. **스위치가 커패시터와 병렬**이라
  t=0에 닫히면 C를 단락시킨다. [1] i_L(0⁻)·i_L(0⁺) [2] KVL로 미분방정식 유도·해 [3] 완전응답 i_L(t).
- ★ 물리(닫힌형): t<0에는 **C가 직류를 차단**해 루프 전류가 0 → **i_L(0⁻)=0**, 강하가 없어 **v_C(0⁻)=V_s**.
  t≥0에는 C가 단락돼 **V_s = R·i_L + L·di_L/dt** 의 **1차** 회로만 남는다(RLC인데 2차가 아니다).
  → I_∞=V_s/R, τ=L/R, **i_L(t)=I_∞(1−e^(−t/τ))**, v_L(t)=V_s·e^(−t/τ).
  원본 검산: **i_L(t)=3(1−e^(−2t))[A]**.
  ★ **커패시턴스는 답에 관여하지 않는다** — t<0 차단 역할만 하고 t≥0에는 단락된다(원본의 distractor).
- ★★ **오분류(수정됨)** — 사용자 신고 2026-08-10, analyze→generate E2E 실측:
  전용 항목이 없어 **`switched_rlc_step`(v1: SPDT + 전류원)** 이 가로챘고, 원본에 **없는 전류원 2A와
  SPDT 스위치**가 들어간 회로가 생성됐다(묻는 양도 i_L(t) → **v_C(t)**). Vision 요약·인벤토리는
  정확했다(V:12V·R:4Ω·C:1F·L:2H) — **받아 줄 항목이 없던 것**이 원인이다.
  ⇒ 분류가 정확한데 엉뚱한 문제가 나오면 감지기보다 **항목 부재**를 먼저 의심할 것
  (`cylinder_internal_inductance`와 같은 교훈).
- ★★ **형제 `switched_rlc_source_free`(임용 5번)와 소자 구성이 완전히 같다**(V=1·I=0·C≥1·L≥1·SW).
  **가르는 신호는 스위치가 닫히느냐 열리느냐 하나뿐**이다. 그래서 어미를 넓게 잡아야 한다 —
  처음에 `닫히|닫은|닫힌`만 봤다가 실측 요약의 **"닫힐 때"** 를 통째로 놓쳤다(스모크가 즉시 잡음).
  ★ 반대로 **개방은 스위치와 결합된 것만** 인정한다 — "t<0에서 커패시터는 **개방**"처럼 소자 상태를
  말하는 서술에 걸리면 이 유형이 형제로 잘못 양보한다.
- 모드: **exam_similar**=i_L(t)(원본) / **exam_variant**=**구하는 양 교환**(인덕터 양단 전압 v_L(t)).
  회로·미분방정식은 동일하다.
- ★ 값은 규칙 열거+필터: **I_∞=V_s/R 과 1/τ=R/L 이 모두 정수**인 조합만 — 그래야 답이 `3(1−e^(−2t))`처럼
  떨어지고 전역 분수 변환기(1-4-3)가 손댈 소수가 애초에 생기지 않는다.
  **원본 튜플은 물론 도출량(I_∞·1/τ)이 원본과 같은 조합도 제외**한다.
- 파일: `lib/generation/topologies/switchedCapShortRl.ts`(generator + 공용 매처)·
  `lib/pipeline/runSwitchedCapShortRlPipeline.ts`(+`detectSwitchedCapShortRl`)·
  `lib/renderers/switchedCapShortRlCircuitRenderer.ts`(전압원 leg / 상단 R·C / **C 위쪽에 병렬 스위치** /
  우측 L + i_L 화살표 / 접지 1개). circuitType `switched_cap_short_rl`,
  diagramType `switched_cap_short_rl_circuit`. types·circuitType·renderers/index·validateProblem·
  classifier(0-PRE)·route(dispatch를 **switched_rlc_step 앞**+semantic+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- ★ 렌더 gotcha: 변형의 `v_L(t)` 표기를 인덕터 옆에 두면 **소자 값 라벨과 겹친다**("2.5[H]"처럼 값이 길 때).
  한 칸 더 바깥 열(+132)로 밀고 `_labelOverlap.mjs`로 16 케이스 겹침 0을 단언한다.
- 검증: tsc 0 / `scripts/smokeSwitchedCapShortRl.mjs` **25/25**(실측 요약 포함 라우팅 4 + 형제 양보 6 +
  원본 물리 6 + 생성물 48개 독립 재검산 + 값 품질 + 렌더 7(접지 1개·라벨 겹침 0)) /
  `smokeOriginalRouting` **58/58** / 형제 무회귀(switchedRlcSourceFree 19/19·switchedRlcDualSwitch 22/22·
  rlcStateEquation 19/19) / **원본 이미지 E2E 양모드 issues=0**(analyze가 곧바로 전용 유형으로 분류,
  유사 30V·6Ω → i_L(t)=5(1−e^(−3t)), 변형 v_L(t)=10e^(−2t) — 손검산 일치) / 헤드리스 Chrome 시각검증.

## ★★ 스위치 표기 범용 규칙 — **동작 방향 화살표 + 동작 시각** (2026-08-12 사용자 지정)

스위치를 그리는 **모든 회로**에 적용한다. 공용 모듈 `lib/renderers/_switchSymbol.ts`(`switchH`·`switchV`).

- **닫힘(closing)** = 열린 arm + **arm 자유단에서 접점으로 내려가는 짧은 직선 화살표(↓)**
- **열림(opening)** = 닫힌 arm(직선) + **접점에서 멀어지는 ↑**
- `action` 미지정이면 화살표 없이 열린 arm만 — 기존 그림과 동일(형제 무영향).
- **동작 시각(t=0 등) 라벨을 항상 함께** 표기한다.
- ★ 삽질 기록: 처음엔 arm을 따라 도는 **곡선 화살표**로 그렸는데 "SW₁이 열리는 그림처럼 보인다"는
  신고가 났다 — 곡선은 방향이 한눈에 안 읽힌다. 교과서 표기대로 **짧은 직선**으로 확정.
- ⚠️ 아직 공용 모듈로 **이관되지 않은** 렌더러: `switchedRlcSourceFree`·`switchedCapShortRl`·
  `switchedRlcDualSwitch`·`supermeshSwitchedDependent`·`inductorRamp`·`bjtTwoStageSwitched`·
  `switchedRcDc`·`switchedRlSourceSwitch`·`acDcSuperposition(+Dual)`. 각자 로컬 스위치 심볼을 갖고 있다.

## 전류원 RL + 스위치 2개가 t=0에 **소자를 단락** (임용 17번 — `switched_rl_dual_short`) 전용 archetype

- 원본(확대 확정 — [[feedback_verify_wiring_by_zoom]]): 하단 접지 rail 위에
  `I_s(↑) → 마디 A`, `R_a: A↓접지`, `A ─ [SW₁ ∥ R_b] ─ B`, `B ─ [SW₂ ∥ L₁] ─ C`, `R_c: C↓접지`, `L₂: B↓접지(i(t))`.
  ★ **SW₁은 가로 저항과 병렬, SW₂는 인덕터와 병렬** — 닫히면 각각 그 소자를 **단락**시킨다.
- ★ 닫힌형(GPT 없음): [t<0] 인덕터 단락 → V_B=0 → L₁·R_c 가지 전류 0 → **i(0⁻) = I_s·R_a/(R_a+R_b)**.
  [t>0] 두 소자가 단락돼 세 마디가 하나 → **R_eq = R_a∥R_c**, **τ = L₂/R_eq**, **i(∞) = I_s**.
  원본(2A·4·4·4·1H·2H) → i(0⁻)=1 · R_eq=2 · τ=1 → **i(t) = 2 − e^(−t)** (보기 ③).
- ★★ **L₁은 답에 관여하지 않는다** — t<0엔 전류 0, t>0엔 SW₂에 단락. 원본의 distractor이자 채점 포인트
  (보기 ②가 L₁·R_c를 끼워 넣은 함정). 풀이에 이 점을 명시한다.
- ★ 오분류: generic **`switched_rl`(medium)** — 그 경로는 단일 전압원 직렬 RL만 만들어 전류원·스위치 2개·
  병렬 구조를 잃는다. 형제도 재현 불가(2전압원 SPDT·종속전원·RLC). → 0-PRE + route 안전망.
  구조 시그니처: **전류원≥1 + 인덕터≥2 + 스위치≥2 + C=0 + 종속원=0**, 또는 텍스트(스위치 2개·닫힘·인덕터 전류).
  커패시터·종속전원·교류·SPDT 낱말이면 양보.
- 모드: **exam_similar**=i(t) / **exam_variant**=**구하는 양 교환**(인덕터 양단 전압 v(t)). 값 풀은 절반씩 분리.
- ★ 값은 규칙 열거+필터: i(0⁻)·R_eq·τ·v_L(0⁺)이 모두 0.5 배수, τ∈[0.25,4], i(0⁻)≠i(∞), L₁≠L₂. **원본 튜플 제외**.
- 파일: `lib/generation/topologies/switchedRlDualShort.ts`·`lib/pipeline/runSwitchedRlDualShortPipeline.ts`
  (+`detectSwitchedRlDualShort`)·`lib/renderers/switchedRlDualShortCircuitRenderer.ts`(공용 스위치 심볼 사용).
  circuitType `switched_rl_dual_short`, diagramType `switched_rl_dual_short_circuit`.
- 검증: tsc 0 · eslint 0 / `scripts/smokeSwitchedRlDualShort.mjs` **62/62**(라우팅 3종×3과목 + 형제 양보 6종 +
  원본 물리 + **생성물 48개를 RK4 수치적분으로 재검산** + v_L(0⁺) 미분 확인 + 원본 튜플 미생성 +
  3단계·보기 없음 + 렌더 구조) / `smokeOriginalRouting` **61/61** / 형제 무회귀(switchedRlcSourceFree 19/19·
  switchedRlcDualSwitch 22/22·rlcStateEquation 19/19·switchedCapShortRl·switchedRcStale 6/6·viThevenin 13/13) /
  `smokeAll` 40/40 / 헤드리스 Chrome 시각검증.

## ★ 접지 기호는 **하나만** (2026-08-10 사용자 지정, 회로이론)

- generic netlist 렌더러는 GND에 붙은 **핀마다 접지 기호를 따로** 찍었다("분산 GND" — 단일 위치까지 긴
  wire를 끄는 것을 피하려던 설계). 그런데 접지는 **같은 전위의 한 노드**라 기호가 여러 개면 서로 다른
  접지처럼 읽힌다.
- ✅ `renderDistributedGroundSymbols`가 각 GND 핀을 짧은 세로 도선으로 **공통 rail**에 모으고
  기호는 rail 중앙에 **하나만** 그린다(접속점엔 junction dot — 규칙 #4). 긴 wire를 끌지 않으므로
  원래 피하려던 문제도 생기지 않는다. 핀이 하나뿐이면 rail 없이 그 자리에 기호 하나 — **기존 그림과 동일**.
  캔버스 높이도 rail 여유(`GROUND_RAIL_EXTENT`)만큼 늘려 잘리지 않게 한다.
- ✅ 전용 렌더러 중 한 그림에 접지를 둘 그리던 `acTheveninTwoBoxCircuitRenderer`도 하나로 —
  단자 b와 d는 **우측에서 이어진 같은 노드**다.
- ※ **전자회로(OPAMP·BJT) 렌더러는 그대로 둔다** (사용자 재확인 2026-08-10). 그쪽은 접지가 회로 곳곳에
  흩어져 있어(입력단·되먹임·부하) 한 rail로 묶으면 **세로 도선이 소자와 OPAMP 본체를 관통**한다
  (규칙 #1 위반 — 병합 전/후를 헤드리스 Chrome으로 나란히 렌더해 확인했다). 다중 접지 기호는 전자회로 관례다.
- 검증: `scripts/smokeSingleGroundSymbol.mjs` **6/6**(핀 3개→기호 1개·캔버스 안·핀 1개 무회귀·GND 없음) /
  `smokeAcTheveninTwoBox` 37/37 · `smokeOriginalRouting` 58/58 무회귀.

## 직류 V원·I원 RLC → **상태 방정식 행렬 A·B** (임용 6번 회로이론 — `rlc_state_equation`) 전용 archetype

- 원본: `V₁ ─ R₁(1Ω) ─ L(1/5H, 전류 i) ─ 마디 A`, 마디 A에 `C(1/2F, 전압 v) ∥ R₂(2Ω) ∥ I₁(↑ 유입)`.
  상태벡터 x=[i, v]ᵀ·입력 u=[V₁, I₁]ᵀ로 `[di/dt, dv/dt]ᵀ = A·x + B·u` 의 **A·B**를 3단계로 구한다.
- ★ 물리(닫힌형): · KVL `V₁ = R₁i + L·di/dt + v` → **di/dt = (−R₁i − v + V₁)/L**
  · KCL(마디 A) `i + I₁ = C·dv/dt + v/R₂` → **dv/dt = (i − v/R₂ + I₁)/C**
  ⇒ **A = [[−R₁/L, −1/L], [1/C, −1/(R₂C)]]**, **B = [[1/L, 0], [0, 1/C]]**.
  원본 → **A=[[−5,−5],[2,−1]], B=[[5,0],[0,2]]** (RK4로 원회로 직접 적분과 9자리까지 일치 확인).
- ★★ **오분류(수정됨)**: 실측 dispatch가 `ac_superposition`이라 **교류 중첩** 문제가 생성됐다(사용자 신고).
  Vision 요약(topic="RLC 회로의 상태 방정식")도 topicKey(rlc_response)도 인벤토리도 **전부 정확했는데**,
  분류기가 **V=1·I=1·L=1·C=1이라는 구성만 보고** AC 중첩으로 넘겼다 — **요구(무엇을 구하는가)를 안 봤다**.
  ⇒ 교훈: 소자 구성이 같아도 **요구가 다르면 다른 유형**이다. "상태 방정식"은 다른 어떤 유형도 쓰지 않는
  고유 요구이므로 0-PRE로 `ac_superposition` **앞**에 둔다(페이저·테브난·공진·스위치 과도면 형제에 양보).
- ★ 값은 규칙 열거: **L=1/k, C=1/m** 로 두면 A·B 성분이 전부 정수. 추가로 `m/R₂`가 정수여야 A₂₂도 정수.
  **원본 튜플(1, 1/5, 1/2, 2) 제외**, 유사·변형은 풀을 절반씩 나눠 값이 겹치지 않는다.
  exam_similar=소자 값 → A·B(원본) / exam_variant=**구하는 양 교환**(A·B 주어짐 → **소자 값 역산**;
  B₁₁=1/L, B₂₂=1/C로 L·C를 먼저 잡고 A₁₁·A₂₂로 R₁·R₂를 푸는 자연스러운 역문제).
- 파일: `lib/generation/topologies/rlcStateEquation.ts`·`lib/pipeline/runRlcStateEquationPipeline.ts`
  (+`detectRlcStateEquation`)·`lib/renderers/rlcStateEquationCircuitRenderer.ts`(전용 fixed-slot:
  V₁ 세로 → R₁ → L(i 화살표) → 마디 A ∥ C(+v−) ∥ R₂ ∥ I₁(↑)). circuitType `rlc_state_equation`,
  diagramType `rlc_state_equation_circuit`. types(payload)·renderers/index·validateProblem·
  classifier(0-PRE)·route(dispatch+semantic+topology 우회)·`smokeOriginalRouting`(+1줄) 등록.
- ★ 렌더 gotcha: 커패시터 **극판 반폭이 16**이라 값 라벨을 +14에 두면 앞글자가 가려진다 → **+22**부터.
- 검증: tsc 0 / `scripts/smokeRlcStateEquation.mjs` **19/19**(실측 오분류 회차 재현 + 표현 변형 3 +
  형제 양보 4(교류 중첩·스위치 과도·테브난·상태방정식 미언급) + 생성물 24개 재검산(**닫힌형·RK4 수치적분·
  성분 정수성**) + 원본 값 + 원본 튜플 미생성 + 유사/변형 풀 비중첩 + 렌더 6) / `smokeOriginalRouting` **46/46** /
  형제 무회귀(switchedRlcDualSwitch 22/22·acTheveninDependent 24/24·acTheveninTwoBox 37/37·
  acSupSourceDesign 28/28·dcWheatstone 38/38) / **원본 이미지 E2E 양모드 정상**
  (유사 R₁=1·L=1/3·C=1/8·R₂=4 → A=[[−3,−3],[8,−2]]·B=[[3,0],[0,8]] RK4 교차검증 일치,
  변형 A·B → R₁=4·L=1/6·C=1/4·R₂=1) / Edge 시각검증(원본 배치 재현·겹침 0).

## 무한히 긴 **원통 도체의 내부 인덕턴스** (임용 10번 전자기학 — `cylinder_internal_inductance`) EM 레지스트리 항목

- 원본: 반지름 r[m]·z축으로 무한히 긴 원통형 도체에 직류 10[A]가 **균일하게** 흐른다(표피 효과 무시, μ_r=50).
  [1] 중심 O에서 a(0<a<r) 떨어진 점 P의 |H|·|B| [2] 길이 1m당 도체 **내부**를 쇄교하는 자속수 λ
  [3] 길이 1m당 **내부 인덕턴스 L**. 계산식의 π는 그대로 둔다.
- ★ 물리(닫힌형, 수치적분 교차검증): 균일 전류밀도 → 쇄교 전류 = I·a²/r² →
  **H = I·a/(2πr²)**, **B = μ_rμ₀Ia/(2πr²)**. 내부 자속은 **쇄교 비율 a²/r²** 를 곱해 적분:
  **λ = ∫₀^r (a²/r²)·B·1·da = μ_rμ₀I/(8π)** → **L = λ/I = μ_rμ₀/(8π)**.
  ★★ **L은 r·I 어느 쪽에도 의존하지 않는다**(r⁴이 약분된다) — 이게 이 문제의 채점 포인트다.
  μ₀=4π×10⁻⁷ 대입 시 **λ=(μ_r·I/2)×10⁻⁷**, **L=(μ_r/2)×10⁻⁷**. 원본(50,10): λ=2.5×10⁻⁵[Wb], **L=2.5×10⁻⁶[H/m]**.
- ★ **오분류(수정됨)**: 레지스트리에 이 유형이 **아예 없어서** bare "인덕턴스" 낱말로
  **솔레노이드 인덕턴스(L=μ₀N²A/l)** 문제가 생성됐다(사용자 신고). Vision 요약은 정확했다
  (topic="무한 원통 도체의 내부 인덕턴스 계산") — **받아 줄 항목이 없던 것**이 원인이다.
  ⇒ 분류가 정확한데 엉뚱한 문제가 나오면 **감지기가 아니라 레지스트리 부재**를 먼저 의심할 것.
- ★ 형제와 구분: `cylinder_conductor_current_field`는 **도전율 σ·전위차 → 외부 자계**,
  `coax_line_magnetic_field`는 **동축 두 도체**, 솔레노이드/상호 인덕턴스는 권선 코일. 감지기가 모두 양보한다.
  판별선 = **원통 도체 문맥 + (내부 인덕턴스 | 쇄교 자속 | 표피 효과 | 도체 내부 자계)**.
- ★ 값은 규칙 열거: μ_r μ₀/(8π)=(μ_r/2)×10⁻⁷ 이므로 **μ_r 짝수**·(μ_r·I) 짝수면 계수가 전부 정수.
  **원본 튜플(μ_r=50, I=10) 제외**. exam_similar=L 도출(원본) /
  exam_variant=**구하는 양 교환**(목표 L 주어짐 → **비투자율 μ_r 역산**, L이 r·I 무관이라 곧바로 풀린다).
- 파일: `electromagnetics.ts`(`cylinderInternalInductance` + `CYL_INDUCT_SPACE`)·
  `emFieldRenderer.ts`(`renderCylinderInternalInductance`, geometry `cylinder_internal_inductance` —
  원본처럼 **수평(좌하→우상) 원통** + 좌측 단면에 O·P·a·r + 1[m] 치수 + 전류 화살표 + x↑·z↗·y↘ 축).
  classifyElectromagnetics(`detectCylinderInternalInductance`)·runElectromagneticsPipeline 강제 체인 **최상단(0-0)**·
  `smokeOriginalRouting`(+1줄) 등록.
- ★ 스모크 gotcha: `[단계 3]` 문장이 원본처럼 "**[단계 2]에서 구한 결과를** 이용하여"를 포함하므로
  `[단계 N]` 마커 **총 개수는 4**다 — 단언은 **서로 다른 마커 3종**으로 셀 것. 또 `texToPlain`은
  `1\,[\mathrm{m}]`를 **"1 [m]"(공백 포함)** 으로 렌더한다.
- 검증: tsc 0 / `scripts/smokeCylinderInternalInductance.mjs` **27/27**(감지 3 + 형제 양보 7(솔레노이드·상호·
  도전율·동축·정전계) + 생성물 28개 재검산(닫힌형·수치적분·**r 무관**) + 원본 값 + 원본 튜플 미생성 +
  발문·렌더 구조) / `smokeOriginalRouting` **45/45** / EM 형제 무회귀(bentWire 27/27·twoWires 22/22·
  curl 34/34·sheetRing 10/10·fluxLoop 10/10·twoPointCharges 13/13·sheetLine 8/8·pointLineNull 25/25) /
  **원본 이미지 E2E 양모드 정상**(유사 μ_r=60·I=5 → λ=150×10⁻⁷·L=30×10⁻⁷, 변형 L=8×10⁻⁷ → μ_r=16 —
  둘 다 수치적분 교차검증 일치).

## 원점에서 꺾인 **반무한 직선 도선** 합성 자계 → 전류 I (임용 11번 전자기학 — `bent_semi_infinite_wires`) EM 레지스트리 항목

- 원본: 선전류 I가 **무한히 먼 곳 → y축(−a_y) → 원점 O → x축(+a_x) → 무한히 먼 곳**으로 흐르는 하나의 꺾인 도선.
  점 P(3,4,0)에서 [1] H₁ [2] H₂ [3] 합성 **H₃ = (1/π)a_z** 가 되는 **전류 I**.
- ★ 물리(닫힌형, 수치적분으로 교차검증): 반무한 직선의 자계 `|H| = I/(4πρ)·(1 + ℓ/√(ρ²+ℓ²))`.
  P(a,b,0), c=√(a²+b²) 에 대해 · **H₁ = I(c+b)/(4πac)·a_z** · **H₂ = I(c+a)/(4πbc)·a_z**
  · 두 기여가 **모두 +a_z**라 합이 깔끔하게 정리된다 → **H₃ = I(a+b+c)/(4πab)·a_z**,
  목표 (k/π)a_z 이면 **I = 4k·ab/(a+b+c)**. 원본(3,4,5·k=1): H₁=3I/20π · H₂=I/10π · **I = 4[A]**.
- ★ 값은 규칙 열거 — **피타고라스 삼조**(c 정수)로 두면 계수와 I가 모두 유리수/정수로 떨어진다.
  (a,b) 순서를 바꾸면 H₁·H₂ 배분이 달라져 다른 문제가 된다. **원본 튜플(3,4,k=1) 제외**.
  exam_similar=목표 H₃ → I 도출(원본) / exam_variant=**구하는 양 교환**(I given → H₃ 도출).
- ★★ **오분류(수정됨) — Vision이 본문을 "두 원형 루프"로 바꿔 썼다**: 실측 dispatch가
  `circular_loop_axis_field`(두 원형 전류 루프 축상 자계)라 전혀 다른 문제가 생성됐다(사용자 신고).
  더 나쁜 것은 **회차마다 요약이 무너지는 정도가 다르다**는 점이다 —
  · 1차: topic만 "두 원형 루프의 합성 자계", 본문 구조는 살아 있음("y축을 따라"·"무한히 먼 곳")
  · 2차: **구조 서술까지** "두 원형 전류 루프가 각각 전류를 흐르고"로 바뀜 → 낱말 조건이 전부 미발화
  ⇒ 감지기를 **3단 구조 신호**로 짰다. 가장 강한 것은 **서로 다른 두 좌표축이 각각 전류를 갖는다**
  (`"y축의 전류에 의한 자계"` + `"x축의 전류에 의한 자계"`) — 원형 루프 문제는 전류를 축이 아니라
  루프(C₁·C₂)에 붙이므로 이 표현이 나올 수 없다. 2차 회차에서도 이 문구만은 남았다.
  · 보조: `축을 따라` + `무한히 먼 곳|반무한|원점 O|꺾`
  · **원형 루프 양보 가드(반지름)는 축-전류 신호가 있으면 적용하지 않는다** — 그러면 오요약 회차를 또 놓친다.
- 파일: `electromagnetics.ts`(`bentSemiInfiniteWires` + `BENT_WIRE_SPACE`, 분수는 공용 `fracTex` 재사용)·
  `emFieldRenderer.ts`(`renderBentWireAxes`, geometry `bent_wire_axes` — z↑·y→·x↙ 축 + 꺾인 굵은 도선 +
  구간별 전류 화살표 + 점 P와 점선 보조선). classifyElectromagnetics(`detectBentSemiInfiniteWires`)·
  runElectromagneticsPipeline **강제 체인 최상단(0-1)**·analyzeImage 규칙(짧게 1항목)·
  `smokeOriginalRouting`(+1줄, 실측 오요약 요약문 그대로) 등록.
- 검증: tsc 0 / `scripts/smokeBentSemiInfiniteWires.mjs` **27/27**(감지 4종(최악 회차 포함) + 형제 양보 6 +
  생성물 28개 독립 재검산 + 원본 값 + 원본 튜플 미생성 + 발문·렌더 구조) / `smokeOriginalRouting` **44/44** /
  EM 형제 무회귀(twoWires 22/22·curl 34/34·sheetRing 10/10·fluxLoop 10/10·twoPointCharges 13/13·
  sheetLine 8/8·pointLineNull 25/25) / **원본 이미지 E2E 양모드 정상**(유사 P(4,3,0)·I=12, 변형 P(5,12,0)·I=32→H₃=4/π —
  둘 다 수치적분 교차검증 일치).

## ★ 리액티브 소자도 **값 기준 정규화** — 타입 문자를 믿지 마라 (2026-08-03 실측 오분류)

사용자 신고: 임용 6번(종속전원 테브난 + 최대전력) 원본이 `ac_superposition`으로 분류돼 generic
`analog_netlist` figure가 나왔다. 서버 로그의 인벤토리는 `{R:3, I:1, dep:1, L:0, C:0}` —
**Vision이 `j[Ω]`·`−j½[Ω]`를 저항(R)으로 추출**해 0-PRE의 "리액티브" 조건이 통째로 미발화했다.
(재현률: 3회 중 1회 실패.)

- ✅ `lib/analysis/reactiveValue.ts` — **값이 순허수면 리액티브**로 본다. 부호가 곧 종류다
  (`+j`→L, `−j`→C). `effectiveComponentType`이 타입 문자를 교정하고, `bumpCount`·
  `aggregateComponentCounts`(inventory·branch 맵 **둘 다**)·`detectAcTheveninDependent`가 이를 쓴다.
- ✅ **적용 범위는 수동 소자(R·L·C·Z)뿐** — 전원(V·I) 값에는 `1+j2 V` 같은 직교 페이저가 올 수 있어
  전원까지 교정하면 독립원을 소자로 오인한다. 또 순허수(`-j1/2`)만 인정하고 혼합(`2+j3`)은 건드리지 않는다.
- ★ 이건 `lib/analysis/dependentSource.ts`(다이아몬드 종속전원을 값으로 판별)와 **같은 패턴**이다.
  Vision 출력 형식이 흔들리면 **분류 로직·프롬프트를 고치기 전에 정규화 층에서 흡수**할 것
  ([[feedback_gpt_format_normalization]]). 한쪽 맵만 정규화하면 같은 소자가 R과 L로 따로 세어진다.
- 검증: `scripts/smokeReactiveNormalization.mjs` **29/29**(값 판정 16 + 타입 교정 7 +
  실측 오분류 회차 재현 3 + 순저항 형제 회귀 2) / `smokeOriginalRouting` **43/43** /
  형제 무회귀(acTheveninDependent 24/24·acTheveninTwoBox 37/37·acSupSourceDesign 28/28·
  dcWheatstone 38/38·switchedRlcDualSwitch 22/22) / tsc 0 · eslint 0 /
  **원본 이미지 E2E 라우팅 4/4** `ac_thevenin_dependent`(리액티브를 R로 읽은 회차 포함).

## C언어 지문 — 분량 하한 + **실행 검증**(2026-08-03 사용자 신고 "너무 짧고 쉬워")

원본 기출(함수 1개 + 단일 for, 실질 17줄)을 그대로 흉내 내 **10줄짜리 생성물**이 나왔다. 임용 실전 난이도로
확장하면서 생긴 부작용까지 함께 처리한 3층 구조 — 모두 `lib/pipeline/runCLanguagePipeline.ts`.

1. **난이도·분량 규칙(프롬프트)** — 실질 24줄(`MIN_CODE_LINES`) 이상(권장 30~55), main 외 함수 2개 이상·호출 깊이 2단계,
   문법 요소 3종 이상, 단일 패스 금지, 출력 2줄 이상, **소문항 2개 이상**, content↔question 중복 금지.
   ★ 난이도는 **제어 흐름**으로 올리고 **산술 크기로 올리지 않는다**(|값| ≤ 200, 한 수식에 곱셈 1개) —
   큰 수는 변별력을 못 올리고 오답만 만든다. 재귀는 **호출될 수 있는 모든 인자**에 대해 종료해야 한다.
2. **분량 게이트(결정론)** — `countEffectiveCodeLines`(주석·빈 줄 제외)로 하한 미달이면 **1회만** 재요청하고
   문항별로 **더 긴 쪽 채택**(재요청이 나빠도 퇴보 없음). 실측: 1차 생성이 16~23줄로 자주 미달 →
   재요청 후 25~34줄. 프롬프트만으로는 부족하다는 증거.
3. ★★ **실행 검증(핵심)** — 코드가 길어지자 **생성 모델의 손 추적이 자주 틀렸다**(실측: 44를 5로, 102를 50으로,
   50을 28로 — 심지어 solution에 "문제상의 착오"라고 써 놓고 제출). 이 환경엔 **C 컴파일러가 없으므로**
   지문 코드를 **JavaScript로 번역시켜 `node:vm`에서 실제로 실행**해 표준출력을 얻는다(번역은 추적보다
   훨씬 쉬운 작업이고, 실행은 결정론이라 산술 오류가 원천 소멸).
   - 소문항 [1]은 출력에 안 나오는 중간값을 묻는 경우가 많다 → 번역 시 **`probe(값)`** 를 소문항 순서대로
     남기게 하고, `findProbeMismatch`가 **정답의 해당 소문항 칸**에서만 값을 찾는다
     (정답 전체에서 찾으면 [1]이 틀려도 그 값이 [2] 출력줄에 있어 통과한다 — 실측).
   - 불일치·자기모순(`hasSelfContradiction`)이면 **복구 호출**로 answer·solution만 다시 쓴다.
   - **무한 재귀·무한 루프·폭주 출력**(`NON_TERMINATING`)은 번역 버그가 아니라 **지문 코드의 결함**이다.
     정답이 존재하지 않으므로 손 추적으로 메우지 말고 **문항을 폐기**하고 1회 보충 생성한다
     (실측: `n -= 2`인데 `n == 0`에서만 멈추는 재귀가 홀수 인자로 무한 재귀 → fallback이 답을 지어냈다).
   - vm은 **호스트 객체를 하나도 주입하지 않는다** — `out`·`probe`·버퍼까지 vm 안에서 정의하고 결과만 읽는다
     (호스트 함수를 넘기면 `fn.constructor.constructor`로 realm 탈출 여지). 식별자 블랙리스트는 쓰지 마라 —
     C에 흔한 `process`라는 함수명이 오탐으로 걸린다(실측).
   - ★ 복구 호출에 **생성용 system 프롬프트를 재사용하지 마라** — 그 안의 `{"problems":[...]}` 스키마를 따라
     답이 배열로 감싸여 오고 평평한 객체를 기대하는 호출부가 조용히 null을 냈다(실측). 필드가 문자열이 아닌
     회차도 있어 `asText`로 강제 변환한다.
4. **figure caption 중복** — `codeCaption`을 figure label과 `diagram.caption` **둘 다**에 넣어 화면에
   "[프로그램]"이 두 번 찍혔다 → label에만 둔다.
5. ★★ **개념 범위 규칙 — 원본에 없는 문법을 끌어오지 않는다** (사용자 신고 2026-08-05
   "생성된 문제가 재귀함수에 관한거야. 본문과 관련된 내용만 문제에 내줬으면 좋겠어"):
   원본(임용 4번)은 `포인터로 배열 합계 + sizeof + 정수 나눗셈`인데 생성물이 **재귀 함수** 문제였다.
   · 원인은 **프롬프트 자신**이었다 — 위 1~3의 난이도 규칙이 "그중 하나는 다른 함수를 호출하거나 **재귀**여야",
     문법 요소 목록에 **재귀**, 그리고 변형 모드 예시에 "**반복↔재귀**"까지 적혀 있었다. 모델은 "깊게"를
     요구받으면 가장 쉬운 방법으로 재귀를 집어넣는다. (절대규칙 0 위반 — 같은 학습목표를 시험하지 못한다.)
   · ✅ **규칙 우선 해결**([[feedback_fix_vs_rule]]): 원본 분석 텍스트에서 `detectConcepts`로 개념을
     결정론 추출해 **허용 목록**을 만들고, 프롬프트에 `[개념 범위 규칙 — 위반 시 폐기]`로 주입한다
     (원본에 재귀가 없으면 "재귀 함수 금지" 명시). 난이도 규칙 2·3과 변형 모드 예시에서 재귀 유도 문구 제거.
   · ✅ **결정론 게이트**(프롬프트만으론 부족 — 분량 게이트와 같은 교훈): `detectSelfRecursion`이
     **낱말이 아니라 호출 구조**(함수 정의 본문에서 자기 이름 호출)로 판정하고, 걸리면 **1회 재요청** 후
     문항별로 **재귀 없는 쪽 채택**(퇴보 방지). 둘 다 재귀면 경고만 남긴다(여기서 폐기하면 "생성 실패"가 뜬다).
   · ※ 한계: **간접 재귀(a→b→a)** 는 이 검출기가 못 잡는다 — 프롬프트 규칙이 1차 방어다(스모크에 명시).
   · 검증: `scripts/smokeCLanguageConceptScope.mjs` **8/8**(원본 개념 추출 · 재귀 검출 · **프로토타입 선언
     오탐 없음** · 다른 함수 호출을 재귀로 오탐하지 않음 · 분량 계수 무회귀 · 재귀 원본은 허용) /
     `smokeCLanguageLength` 42/42 무회귀 / tsc 0 / **원본 이미지 E2E 양모드**: 유사·변형 모두 재귀 없이
     포인터·배열·sizeof·정수 나눗셈 범위 유지(유사 15·11, 변형 48·12 — 직접 실행 검산 일치).
- 검증: `node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeCLanguageLength.mjs`
  **42/42**(계수·신고 재현·정규화·자기모순·probe 칸 대조·asText·결함 판정) / tsc 0 · eslint 0 /
  **E2E 8문항을 직접 재실행해 대조 — 8/8 일치**(그중 6문항은 생성 단계에선 오답이었고 실행 검증이 교정).

6. ★★ **원본의 제어 흐름(switch fall-through)을 보존한다** (사용자 신고 2026-08-13, 임용 33번):
   원본은 `case 2`에 **break가 없어 `default`로 이어지는** 프로그램이고(정답 ④ 9, 9) 그 fall-through가 채점
   포인트인데, 생성물이 **모든 case에 break를 넣어** 학습목표가 통째로 사라졌다(절대규칙 0 위반).
   - ★★ **실행 검증은 이 실패를 못 잡는다** — `verifyAndRepairOutputs`가 보는 것은 *"정답이 그 코드의 실행
     결과와 맞는가"*이지 *"그 코드가 원본 구조를 지켰는가"*가 아니다. break를 다 넣은 코드도 자체로는
     일관되므로 `totalIssues=0`으로 **조용히 통과**했다(로그에 mismatch·discard가 하나도 없었다).
     이 저장소가 반복해 겪은 "generic 경로는 실패해도 validator를 통과한다"와 같은 패턴이다.
   - **진짜 원인은 [난이도·분량 규칙]이었다**: "최소 24줄(권장 30~55)·사용자 정의 함수 2개 이상·호출 깊이
     2단계·단일 패스 금지"가 원본(`main` 하나, ~20줄)을 통째로 재작성하게 만들고, 그 과정에서 모델이
     `switch`를 **관용적으로**(모든 case에 break) 쓴다. 재현: 컨텍스트에 "break가 없어 default로 이어져"를
     **명시했는데도 2회 중 1회 소실**.
   - ✅ 3겹 조치: ① `analyzeImage`의 C 규칙에 **"break가 어느 라벨에 있고 어느 라벨에 없는지 글자 그대로
     보존"** 추가(관용적 뭉뚱그림 금지) ② 프롬프트 `[제어 흐름 보존 규칙]`을 **[난이도·분량 규칙]보다 뒤에**
     주입(앞에 두면 재작성에 묻힌다 — `STEP_QUESTION_RULE`과 같은 교훈) ③ **결정론 게이트**
     `enforceFallThrough`(1회 재요청 + 구조를 지킨 쪽 채택, 재귀·분량 게이트와 같은 형태).
   - ★ 판정은 낱말이 아니라 **구조**다: `hasSwitchFallThrough`가 주석·문자열을 지우고(`stripCNoise`)
     중괄호 깊이로 **최상위 `case`/`default` 라벨**을 갈라, 라벨 사이 구간에 `break|return|continue|goto|exit`가
     하나도 없고 내용이 비어 있지 않으면 fall-through로 본다. `case 1: case 2:`(빈 연속 라벨=묶음 표기)와
     마지막 라벨은 제외. **보수적으로 판정** — 중첩 반복문 안의 break도 종료로 세므로 놓칠지언정 오탐하지 않는다.
   - `detectFallThroughIntent`는 **구조 우선**(컨텍스트에 원본 코드가 보존돼 있으면 직접 파싱) + 낱말 보조.
     ※ 낱말 정규식은 **조사(가·이·을·를)** 까지 받아야 한다 — "break**를** 생략했기"를 놓쳐 스모크가 잡았다.
   - ★★★ **"존재"만 보는 게이트는 부족하다** (같은 날 2차 신고 — "핵심 2가지를 담고 있지 않은데?"):
     1차 수정이 fall-through **존재**만 검사하자, 형식만 갖춘 **장식**이 그대로 통과했다(실측 생성물):
     · `default: printf("Default operation.\n"); break;` — 흘러가지만 **상태를 안 바꿔** 답이 그대로다.
     · `int score[10] = {3,5,7,2};` 로 부분 초기화해 놓고 **`getSum(score, 4)`** — 초기화 개수를 크기로 넘겨
       **0 구간을 아예 지나가지 않는다**. 원본은 `for(i=3;i<10;i++)`로 0을 반드시 더해서 답이 9가 된다.
     · 게다가 `// No break, fall through` 주석이 코드에 박혀 **답을 알려 줬다**(원본엔 없다).
     ⇒ 원본의 핵심은 **두 가지**이고 **둘 다 정답에 실제로 관여**해야 한다:
       **(1) fall-through** + **(2) 배열 부분 초기화(뒤쪽 0)**.
   - ✅ 게이트를 "관여"까지 보도록 강화했다(`enforceFallThrough`가 결함 목록을 만든다):
     · `fallThroughIsConsequential` — 흘러 들어간 **다음 라벨이 상태를 바꾸는가**(printf만이면 불합격).
     · `findPartialArrays` + `zeroTailIsDecorative` — `T a[N]={v1..vk}` (k<N)가 있는가, 그리고
       **초기화 개수 k가 그 배열의 순회 상한·크기 인자로 쓰이지 않았는가**(쓰였으면 0 구간 미사용 = 불합격).
     · `stripGiveawayComments` — 흐름을 설명하는 주석은 **재요청 없이 제거**(실행에 영향 없음).
     · 재요청 후에는 **결함 수가 더 적은 쪽**을 문항별로 채택(퇴보 방지).
   - 검증: `scripts/smokeCLanguageFallThrough.mjs` **33/33**(원본 감지 + 신고 형태 미감지 + 경계 7종
     (빈 연속 라벨·마지막 라벨·return/goto·중첩 루프 break·문자열/주석 속 break) + 의도 감지 6종 +
     **★2차 신고 생성물을 그대로 넣어 두 검사 모두 불합격 확인** + 원본은 두 검사 모두 합격 + 형제 무회귀) /
     `smokeCLanguageLength` 42/42 · `smokeCLanguageConceptScope` 8/8 무회귀 / tsc 0 · eslint 0 /
     **생성 API 재현**: fall-through 보존 4/4(수정 전 1/2) → **두 핵심 모두 관여 4/4**(1차 수정 후 0/4).
   - ⚠️ 남은 한계: `zeroTailIsDecorative`는 **정적 근사**다(함수 인자로 크기가 전달되면 추적 못 하는 경로가
     있다) — "초기화 개수를 상한으로 쓴 흔적"이라는 안티패턴으로 잡는다. 다른 제어 흐름 특징
     (`static` 상태 유지 등)은 여전히 개념 규칙이 일부만 담당한다.
   - ★★ 일반화 교훈: **구조 게이트는 "있는가"가 아니라 "정답을 가르는가"를 물어야 한다.**
     존재만 확인하면 모델이 형식을 흉내 내 통과시킨다 — 이 저장소의 "장식용 통과"는 이번이 처음이 아니다.
   - ★★★ **그리고 그것으로도 부족했다 (3차 신고: "스위치 문이 없어. 그냥 배열문제로 생성돼")**:
     게이트 전체가 `detectFallThroughIntent(ctx)`에 걸려 있었는데, **실제 Vision 요약이 약하면 false**가 되어
     프롬프트 규칙도 게이트도 **통째로 꺼졌다**. 실측 회차의 요약은 `topic="C언어 switch문 실행 결과"` 한 줄이
     전부였다(내 재현 테스트는 내가 직접 fall-through 문장을 써 넣어서 켜졌던 것 — **테스트가 실제 입력보다
     친절하면 게이트가 켜진 채로만 검증된다**). 게다가 `CONCEPT_RULES`의 `branch`가 `if|else|switch`를 모두
     매치해 **`if`만 써도 "분기 개념 유지"로 통과** — switch를 요구하는 규칙 자체가 없었다.
     · 부분 조치: `REQUIRED_CONSTRUCTS`(switch·구조체·static·비트연산) — 원본이 쓰는 **핵심 구조를 요구**한다
       (기존 개념 규칙은 "없는 것 금지" 한 방향뿐이었다). `detectRequiredConstructs`/`missingConstructs`.
     · **근본 조치는 전용 archetype**(아래) — 사용자 지정: "생성해내기 힘들면 archetype을 만들어".

## Wien bridge 발진회로 **수치 설계형** (임용 30번 — `wien_bridge_design`) ★결정론 archetype★

- 원본: 비반전 OPAMP + 정귀환 RC망(직렬 R·C ‖ 병렬 R·C, 둘 다 **50kΩ·16nF**), 음귀환 `R_1`(V⁻→접지)·`R_2`(V⁻→V_o).
  "발진기가 **안정적이고 지속적으로** 동작하기 위한 R₁, R₂와 공진주파수 f₀" 객관식(π=3.14).
  **정답 ② R₁=10kΩ · R₂=22kΩ · f₀≈200Hz**.
- ★ 물리(닫힌형): R·C가 같으면 공진에서 **β = 1/3** → 바크하우젠 **A_v = 1 + R₂/R₁ ≥ 3**, 즉 **R₂ ≥ 2R₁**.
  ★★ "**지속**"이 채점 포인트다 — 정확히 3이면 임계라 소자 오차로 사그라든다. 그래서 원본이 **R₂/R₁ = 2.2**
  (22/10)를 답으로 둔다. **f₀ = 1/(2πRC)**; 원본 RC = 800µs → f₀ = 199.04 ≈ 200Hz.
- ★ 형제 `WIEN_BRIDGE_OSCILLATOR`(`lib/generation/analog/wienBridgeOscillator.ts`)는 **기호형**이다 —
  수치 없이 `K=1+R₃/R₁` → `β(s)` 표준형 → **비 R₃/R₁=2**를 구한다. 이 원본은 **수치 설계**(R₁·R₂의 값과 f₀[Hz])라
  묻는 것이 다르다. 판별선 = **수치·단위(kΩ·nF)·"적절한 값" 요구**. 양보: 전달특성·블록도·위상천이·함수발생기·루프이득.
- ★★ **회로 figure는 공유한다** — 기존 파일에서 `buildWienBridgeNetlist`를 **export로 뽑아** 두 경로가 함께 쓴다
  (복제하면 한쪽만 고쳐져 드리프트한다). 음귀환 저항 라벨만 `feedbackLabel`로 바꾼다(원본 30번은 `R_2`, 기호형은 `R_3`).
- ★ 값은 규칙 열거 + 필터: R·C는 **정수만**(곱이 그대로 RC[µs]) · f₀가 깔끔한 값에 **오차 1.5% 이내** ·
  (R₁,R₂)는 **비 2.1~2.4의 E-계열 쌍**(이득이 3보다 약간 큼). **원본 튜플 제외**, 유사/변형 풀 절반 분리.
- 발문은 **〈해석 절차〉 3단계 서술형**(객관식 원본 → 3단계): [1] β와 A_v 조건 [2] R₂ 결정 + **그 이유**
  (3보다 약간 커야 지속) [3] f₀ 계산.
- ★★★ **표기 gotcha — 전역 분수 변환기(1-4-3)가 답을 뭉갠다**(실측 3건):
  `f_0 ≈ 796.2` → **3981/5**, `A_v = 3.2` → **16/5**, `π = 3.14` → **157/50**.
  변환기 동작을 직접 조사한 결과 **평문 `[Hz]`가 바로 붙은 숫자만 보호**된다 —
  `[\mathrm{Hz}]`·`[배]`·`[V/V]`는 **보호되지 않는다**. ⇒ 세 가지로 막았다:
  ① 주파수는 **LaTeX 밖에서** `995.2[Hz]`로 쓴다 ② 무차원 이득은 **소수를 아예 쓰지 않고**
  `A_v = 1 + 55/25 = 16/5` 처럼 **분수식**으로 남긴다 ③ 풀이에서 **π는 기호로** 두고
  "π=3.14로 계산"이라는 지시는 **조건·발문에만** 넣는다(그쪽은 변환기가 건드리지 않는다).
  ★ 회귀 방지: 스모크가 `fractionizeText(answer) === answer`와 **단위 없는 소수 0개**를 단언한다.
- 파일: `lib/generation/topologies/wienBridgeDesign.ts`(생성기 + 공용 매처)·
  `lib/pipeline/runWienBridgeDesignPipeline.ts`(3단계 + `detectWienBridgeDesign`). 렌더러 없음(`analog_netlist` 재사용).
  route는 **analog archetype dispatch 앞**에 둔다(뒤에 두면 기호형이 가져간다).
- 검증: tsc 0 · eslint 0(신규) / `scripts/smokeWienBridgeDesign.mjs` **397/397**
  (**원본 물리 재현**(f₀=199.04→200Hz·보기 ①④가 A_v<3로 발진 못 함) + 라우팅 3종 + 형제 양보 6종 +
  값 공간·원본 튜플 미생성 + **생성물 48개 독립 재검산**(f₀·이득·R₂≥2R₁·반올림 오차) +
  **Wien 망 검증기(`validateWienNetwork`) 통과** + 3단계·보기 없음 + **분수 변환기 불변** +
  **형제 기호형 5회 무회귀**(R_3 라벨 유지)) / `smokeOriginalRouting` 69/69 · `smokeAll` 40/40 /
  **생성 API E2E 양모드 issues=0**.
  ※ `smokeAll`이 한 번 39/40로 나왔으나 재실행에서 40/40 — GPT 비결정이지 이 변경과 무관하다.

## switch **fall-through + 배열 부분 초기화** 출력 예측 (임용 33번 — `c_switch_fall_through`) ★결정론 archetype★

- 원본: `int score[10] = {1,2,3,4,5}; op=2;` / `case 1`(break) · **`case 2`(break 없음)** · `default`(break),
  각 라벨은 서로 다른 시작 인덱스로 배열을 끝까지 더해 출력. 보기 ①~⑤ 객관식, **정답 ④ (9, 9)**.
  채점 포인트는 정확히 두 가지 — **(1) fall-through** **(2) 뒤쪽 5개가 0**(둘이 겹쳐 두 출력이 같아진다).
- ★★ **C 도메인 최초의 결정론 archetype**이다. GPT 경로(`runCLanguagePipeline`)가 이 원본의 핵심을
  **네 가지 방식으로 반복해서 잃었고**(모든 case에 break / 출력만 하는 라벨로 흘러가는 장식 /
  초기화 개수를 크기로 넘겨 0 구간 미순회 / **switch 자체가 없는 배열 문제**), 프롬프트·게이트를 두 번
  보강해도 안정화되지 않았다. 근본 원인은 [난이도·분량 규칙](24줄 이상·함수 2개 이상·호출 깊이 2단계)이
  **원본(main 하나, ~20줄)을 통째로 재작성하게 만드는 것**이라 프롬프트로는 이길 수 없었다.
  ⇒ [[feedback_universal_path]]의 예외("generic 경로로 흡수 불가")로 전용 archetype이 정당하다.
- ★ 값은 규칙 열거 + 필터: 배열 크기 N∈{8,10} · 초기화 개수 k∈{4,5} · 등차 초기값(base·step) ·
  두 시작 인덱스. 필터 — **case 2는 초기화 구간과 0 구간에 걸친다**(a2 < k, 0을 실제로 더한다) ·
  default 구간은 **원소 2개 이상**(한 번만 도는 반복문 배제) · 출력 상한. 풀 유사 1632·변형 1672.
  ★ **원본 배열값(`{1,2,3,4,5}`)은 통째로 제외** — 시작 인덱스만 달라도 첫 출력이 9로 같아 베낀 문항이 된다
  (실측으로 잡았다, `viTheveninMaxPower`의 "도출량 충돌 제외"와 같은 처리).
- 모드: **exam_similar**=default가 **0 구간에서 시작** → 두 출력이 같다(원본의 성질) /
  **exam_variant**=default가 **초기화 구간까지 거슬러** → 두 출력이 달라진다(누적이 유지됨이 더 드러난다).
- 발문은 **〈해석 절차〉 3단계 서술형**(객관식 원본 → 3단계, 절대원칙):
  [1] 배열 전 원소 + 진입 레이블 [2] 첫 출력 [3] break 유무 근거 + 둘째 출력. figure는 `code_block` 하나.
- 라우팅: `matchesCSwitchFallThrough` = `switch + (C 문맥|배열) + 출력 예측`, 양보 = 포인터·재귀·구조체·
  비트연산·문자열·동적할당(그쪽은 generic GPT 경로). route에서 **`subjectKey === "c_language"` 분기보다 앞**에
  dispatch한다(뒤에 두면 generic이 먼저 가져간다). ★ 낱말을 넓게 잡았다 — 실측 요약이 topic 한 줄뿐이었다.
- 파일: `lib/generation/topologies/cSwitchFallThrough.ts`(생성기 + 공용 매처)·
  `lib/pipeline/runCSwitchFallThroughPipeline.ts`(3단계 텍스트 + `detectCSwitchFallThrough`). 렌더러 없음(`code_block` 재사용).
- 검증: tsc 0 · eslint 0 / `scripts/smokeCSwitchFallThrough.mjs` **549/549**
  (라우팅 4종 + 형제 양보 6종 + 값 공간·원본 튜플 미생성 + **원본 값 재현(9,9)** +
  **생성물 48개를 지문 코드에서 되파싱해 독립 시뮬레이션으로 재검산** + 두 핵심 구조 보장
  (`hasSwitchFallThrough`·`fallThroughIsConsequential`·`findPartialArrays`·`zeroTailIsDecorative`로 교차 확인) +
  모드별 성질(유사=두 출력 같음·변형=다름) + 3단계·보기 없음·노출 주석 0) /
  `smokeCLanguageFallThrough` 33/33 · `smokeCLanguageLength` 42/42 · `smokeCLanguageConceptScope` 8/8 ·
  `smokeOriginalRouting` 69/69 무회귀 / **생성 API E2E**: **약한 Vision 요약**(topic 한 줄, fall-through 미언급)
  으로도 양모드 dispatch·issues=0.
- ★ 교훈: **테스트 입력이 실제 입력보다 친절하면 게이트는 켜진 채로만 검증된다.** 이번 3차 신고의 원인이
  정확히 그것이었다 — 재현 스크립트에 내가 fall-through 문장을 써 넣어 게이트가 항상 켜져 있었다.

# Important Notes
1. **AI 모델**: OpenAI GPT-4o (`lib/openai.ts` 싱글톤, `DEFAULT_MODEL`)
2. **디자인**: 흰 배경 + 파란 글씨(indigo/blue 계열), 모던·미니멀
3. **분석 출력**: 주제별 해석 + 관련 개념 분석
4. **생성 UI**: "문제 생성하기" 버튼 + 개수 선택 (1·3·5)
5. **두 모드** (canonical = `exam_similar` / `exam_variant`)
6. **8 과목**: `electronics` / `circuit_theory` / `digital_logic` / `mixed_signal` / `electromagnetics`(전자기학, 회로 아님) / `c_language`(C언어, 회로 아님·GPT 코드분석) / `communications`(통신, 회로 아님·GPT 신호/정보이론) / `pedagogy`(교육학, 회로 아님·GPT 교육이론 논술·figure 없음)
7. **빈칸 학습**: 핵심 내용 빈칸 5개

## Mode 정책 표
| 모드 | preserveTopology | allowComponentChange | allowValueChange |
|---|---|---|---|
| `exam_similar` (기출유사유형) | true | false | true |
| `exam_variant` (기출변형유형) | true | true (1~2개) | true |

## AC 역률보정 + 전력 (임용 9번 회로이론 — `ac_power_factor`) 전용 archetype
- 원본: V_s(100∠0° RMS) + 직렬 R₁(1Ω) + 직렬 L(j1Ω) + 부하 Z=R₂(2Ω)∥C(−jX_C). [1] 역률 1 되는 X_C, [2] P_avg·Q, [3] P_s. 답: X_C=2·Z_in=2(순저항)·P_avg=5000W·Q=0·P_s=5000VA.
- ★ generic topology-driven은 직렬 R+L + 부하 R∥C(병렬) 구조를 잃고 단일 직렬 RLC로 변질(실측 Image: R·L·C 직렬·R 직렬, C가 R2와 병렬 아님). dc_mesh(low)로 오분류 → 전용 결정론 archetype.
- ★ **classifier (subject 무관 0-PRE)**: "역률"(power factor)은 매우 독특한 키워드 → `역률 + AC 리액티브(L|C) + V≥1 + I=0` → ac_power_factor. Vision이 subject를 mixed_signal/dc_mesh로 오판해도 최우선. route에서 `circuitType==="ac_power_factor"`면 `subjectKey="circuit_theory"`로 보정(mixed_signal coercion·dispatch 정상화).
- ★ **중근 조건으로 깔끔**: R₂=2X_L이면 Im(Z_in)=0의 중근 X_C=R₂. Z_load=R₂/2−jR₂/2, Z_in=R₁+R₂/2(순저항). P_avg=V_s²/Z_in. 역률1이라 Q=0·P_s=P_avg. 값은 규칙 열거(Vs·R1·XL, R2=2XL)+P_avg 정수 필터, 원본 제외.
- 파일: `lib/generation/topologies/acPowerFactor.ts`(결정론, GPT 없음)·`runAcPowerFactorPipeline.ts`(3단계)·`lib/renderers/acPowerFactorCircuitRenderer.ts`(V_s + 직렬 R+L + 부하 Z=R∥C 점선박스, fixed-slot). diagramType `ac_power_factor_circuit`. circuitType `ac_power_factor`. types·circuitType·renderers/index·validateProblem·route(dispatch+subject보정+semantic+topology우회)·analyzeImage 규칙·smoke[15] 등록.

## 종속전류원(2V_c) 2단 구동 페이저 회로 (임용 3번 회로이론 — `ac_vccs_phasor`) 전용 archetype
- 원본: 교류 전원(10∠45°V, 코사인 기준 최댓값·위상, ω=100) + **다이아몬드 종속전류원 2V_c**. 〈해석 절차〉 [1] 페이저 전압 V_c → [2] V_c로 페이저 전류 I_R → [3] 시간영역 i_R(t).
- **토폴로지 (사용자 확정)**: 좌·우 두 망이 **접지만 공유**하고 상단은 이어지지 않는다 — 종속전류원이 2단을 구동하는 캐스케이드.
  - 좌측망: `V_s ─ R₁(1Ω) ─ 마디 A ─ [−j2 ∥ −j2] ─ GND` → 제어전압 **V_c = 마디 A 전압**.
  - 우측망: **종속전류원 2V_c**(GND→마디 B) ─ 마디 B ─ `[R₂(2Ω) ∥ j2Ω]` ─ GND → **I_R = R₂ 전류**.
- 닫힌형(범용 복소 솔버, GPT 없음): Z_sh=두 shunt 병렬 → **V_c = V_s·Z_sh/(R₁+Z_sh)** (분압) → **I_R = g·V_c·Z_ld/(R₂+Z_ld)** (전류분배) → **i_R(t)=|I_R|cos(ωt+∠I_R)**. 원본 → V_c=5√2∠0°·I_R=10∠45°·i_R(t)=10cos(100t+45°).
- ★★ **근본 원인 = Vision이 다이아몬드를 독립 전압원으로 읽음** (실측: `{type:"V", value:"2Vc"}`) → `hasDependentSource=false`·"독립 V 2개 + C"로 세어져 **`ac_dc_superposition_rc`(AC+DC 중첩 RC)로 오분류** → 전혀 다른 문제 생성. 2겹 수정:
  - (1) ★ **값 기반 종속전원 정규화** (`lib/analysis/dependentSource.ts`, 공용): **값이 다른 전압·전류를 참조하면(계수×V_x / I_x: "2Vc"·"0.2V₃"·"2i_x") 종속전원**. `bumpCount`가 V/I 대신 **dep로 카운트**하고 `hasDcVSource`에서도 제외 → Vision이 type을 틀려도 전 분류기가 일관되게 본다. ([[feedback_gpt_format_normalization]] — 프롬프트·로직 fix보다 **정규화 우선**.)
  - (2) `analyzeImage`에 전용 추출 규칙(다이아몬드=VCCS·제어식 value 보존·좌우 망 병합 금지·직류 전원 날조 금지).
- classifier **0-PRE (subject 무관)**: `종속전원 + AC 페이저 + 리액티브 + 전압원 + 스위치 없음` → ac_vccs_phasor. ★ 양보 가드: 테브난·등가·최대전력·공진·역률·어드미턴스·대역폭 키워드가 있으면 각자 전용 archetype에 양보.
- 모드: **exam_similar**=원본 구조(shunt=C 2개·부하=L) / **exam_variant**=**소자 종류 교환**(shunt=L 2개·부하=C, 구조·원리 동일).
- ★ **값은 규칙 열거 + 필터**(∠V_c·∠I_R이 15° 배수 + 크기가 정수/k√2/반정수), **원본 튜플 제외**. 필터가 자연스럽게 R₁=X_sh/2·R₂=X_ld 족을 뽑아 답이 항상 깔끔.
- 파일: `lib/generation/topologies/acVccsPhasor.ts`(결정론 복소 솔버)·`runAcVccsPhasorPipeline.ts`(3단계 텍스트)·`lib/renderers/acVccsPhasorCircuitRenderer.ts`(전용 fixed-slot: AC원+R₁박스+shunt 2개+V_c 극성 / 다이아몬드 종속전류원+R₂(I_R↓)+부하 리액턴스 / 공통 접지). diagramType `ac_vccs_phasor_circuit`. types·circuitType·renderers/index·validateProblem·route(dispatch+subject보정+semantic+topology우회)·smokeAcVccsPhasor 등록.
- ★ 렌더 gotcha: 종속전류원 라벨을 다이아몬드 **좌측에 두면 V_c 표기와, 우측에 두면 I_R 화살표와 겹친다** → **다이아몬드 위**에 배치.

## 어드미턴스 공진 (임용 7번 회로이론 — `ac_admittance_resonance`) 전용 archetype
- 원본: 교류 전압원(10cos(ωt)) → **병렬 블록[ C(0.05F) ∥ (R(1Ω)+L(0.1H) 직렬) ]**. 점선 블록 등가 **어드미턴스 Y_eq=a+jb[Ʊ]**. [1] a·b를 ω식으로, [2] 공진 ω₀(b=0), [3] 전류 i(t) 최댓값 I_M. 답: a=R/(R²+(ωL)²)·b=ωC−ωL/(R²+(ωL)²)·ω₀=√((L−R²C)/(L²C))=10·I_M=V_peak·a(ω₀)=10·0.5=5A.
- ★ generic universal_ac/rlc_resonance는 "source→병렬[C∥(R+L)]" 고정 토폴로지·Y_eq=a+jb 쿼리를 표현 못 해 소자 라벨까지 깨지고(C를 "H"로) "필요한 C 구하기"로 변질(실측) → 전용 결정론 archetype. (형제 ac_thevenin_ladder·ac_bridge·ac_power_factor와 동일 사유 — [[feedback_universal_path]]의 "회로 figure 본질적으로 다른 케이스" 예외.)
- ★ **classifier (subject 무관 0-PRE)**: "어드미턴스/admittance/Y_eq"는 매우 독특한 키워드 → `어드미턴스|Y_eq + AC RLC(L>0·C>0) + V≥1 + I=0` → ac_admittance_resonance (ac_power_factor 0-PRE 바로 다음). route에서 subject보정·topology우회. rlc_resonance(임용9 f-|I|곡선·C도출)와 "어드미턴스" 키워드로 구분.
- ★ **기출변형유형 = 쌍대(dual) 회로**: 교류 전류원 → **직렬 블록[ L + (R∥C) ]**, 등가 **임피던스 Z_eq=a+jb[Ω]**, 공진 ω₀(b=0), 전압 v(t) 최댓값 V_M. (V↔I·Y↔Z·∥↔직렬·L↔C.) a=R/(1+(ωRC)²)·b=ωL−ωR²C/(1+(ωRC)²)·ω₀=√((R²C−L)/(L·R²C²))·a(ω₀)=L/(RC)·V_M=I_peak·a(ω₀). R₀=1 스케일이면 원본 I_M=5A↔쌍대 V_M=5V 거울, ω₀ 동일.
- ★ **값은 규칙 열거+필터**: (R·L·C·src) 열거 → ω₀ 정수(perfect-square)·최댓값 0.5배수·≤50 필터. 원본 튜플·원본-쌍대 튜플 제외. similar=병렬 어드미턴스 풀, variant=직렬 임피던스(쌍대) 풀.
- 파일: `lib/generation/topologies/acAdmittanceResonance.ts`(결정론 닫힌형, GPT 없음)·`runAcAdmittanceResonancePipeline.ts`(3단계, 유사·쌍대 분기)·`lib/renderers/acAdmittanceResonanceCircuitRenderer.ts`(유사: 전압원→병렬[C∥(R+L)] / 쌍대: 전류원→직렬[L+(R∥C)], 둘 다 점선블록+fixed-slot). diagramType `ac_admittance_resonance_circuit`/`_dual_circuit`. circuitType `ac_admittance_resonance`. types·circuitType·renderers/index·validateProblem·route(dispatch+subject보정+semantic+topology우회)·classifier 0-PRE·analyzeImage 규칙 등록.

## 두 유전체 평판 커패시터 — 배치(직렬 적층 / 병렬 나란히)는 mode와 직교 (`dielectric_two_region_cap`)
- 임용 10번(직렬 적층: 유전체가 위아래로 쌓임, E_1·E_2 각각, 두께비, 극판간격 2d) vs 임용 11번(병렬 나란히: 좌우, E 하나, 부피비). **같은 공식 레지스트리 항목**이 둘 다 처리.
- ★ **버그(수정됨)**: build가 배치를 mode로 하드코딩(유사=병렬·변형=직렬)해서, 원본이 직렬(10번)이어도 유사유형이 병렬로 나옴 → **절대규칙 0(exam_similar=topology 보존) 위반**. 배치는 mode가 아니라 **원본의 구조적 속성**이다.
- ★ **수정**: `detectDielectricArrangement(analysis)`(classifyElectromagnetics.ts)가 텍스트에서 series(적층·위아래·직렬·두께비·E_1&E_2)/parallel(나란히·병렬·부피비) 감지 → `EmBuildHints.dielectricArrangement`로 전달. 감지 실패 시 기본 병렬(임용 11번 호환).
- ★★ **배치는 유사·변형 모두 원본 유지, 값만 변경** (사용자 지정 2026-08-02): 이전에는 변형이 직렬↔병렬
  **쌍대로 배치를 뒤집어**, 원본이 병렬(나란히)인데 변형에서 적층 문제가 나왔다. 이제 `useSeries`는
  mode와 무관하게 `originalArrangement === "series"`이고, 대신 **값 풀을 절반씩 분리**(`sliceFor`)해
  유사와 변형이 서로 다른 수치를 쓴다(DIEL_SPACE·DIEL_SERIES_SPACE 모두).
  회귀 방지: `scripts/smokeDielectricArrangementKeep.mjs` **10/10**(병렬·직렬 각 24개 배치 유지 +
  유사/변형 값 겹침 0 + 기본값 병렬 + 전위분포 하위구조 무영향 + 아래 라우팅 2종).
- ★★ **경계 굴절 감지기가 이 유형을 가로채던 버그** (실측 2026-08-02): Vision이 `relatedConcepts`에
  개념 태그 **"정전 에너지"** 를 붙이자 `detectDielectricBoundary`의 boundarySignal이 발화해 강제 체인
  1번에서 통째로 가져갔고, 커패시터 문제 대신 **"경계면 전계 굴절 + 에너지 밀도"** 문제가 생성됐다.
  → 그 감지기에 **평판 커패시터 문맥 양보 가드**(정전용량·커패시터·극판·평판 도체·부피비) 추가.
  경계 굴절 유형은 정전용량·전위차 V_d를 묻지 않으므로 안전한 판별선이다.
  ★ 교훈은 CLAUDE.md의 "Mealy 머신 태그" 사례와 같다 — **개념 태그는 구조적 사실이 아니다**.
  보강 후 원본 이미지 유사 모드 라우팅 **3/3**.
- analyzeImage EM 규칙에 "적층(직렬) vs 나란히(병렬) 구분·보존"(위아래·2d·E_1/E_2 각각 ↔ 나란히·부피비) 강제 — Vision이 배치를 뒤바꿔 요약 금지. 렌더러(emFieldRenderer `renderDielectricSlab`)는 series/parallel 둘 다 그림(split 라벨).
- ★ **단계 구조도 배치별로 원본과 일치** (그림 아님·발문 구조): 두 원본의 해석 절차가 다르므로 배치별로 다른 단계 구조 재현.
  - **직렬(적층)=임용 10번 구조**: ★수치·d 역산★. 각 유전체 두께 d(동일, 총 2d)·전하 ±Q[nC]·면적 S=s·π·ε₀=1/(36π)×10⁻⁹ given. [1] \|E₁\|,\|E₂\| **각각(수치)** [2] V=(\|E₁\|+\|E₂\|)d **관계식** [3] 정전용량=C_t[nF] 되는 **두께 d 구하기(역문제)**. |E_k|=36Q/(s·ε_rk). `DIEL_SERIES_SPACE`(규칙 열거+정수/0.5배수 필터, 원본 18π·6nC·500nF 제외).
  - **병렬(나란히)=임용 11번 구조**: 기호식(Q·A·d). [1] ρ_a/ρ_b·E_z [2] V_d [3] C_d. (기존 `DIEL_SPACE` 유지.)
  - ⚠️ 초기 버그: 직렬 분기가 병렬의 기호식 미러(E_a/E_b 비·V_d·C_d)라 임용 10번의 "수치·d 역산" 단계 구조와 불일치 → 임용 10번 전용 수치 구조로 재작성.
- ★ **세 번째 하위구조 = 전위 분포 (임용 24번, 2026-07-15 추가)**: 같은 직렬 적층이지만 **구하는 대상이 다름** — 전하·정전용량이 아니라 **각 유전체 영역의 전위 V(z)를 z의 1차식으로 도출**. 신호: 각 영역 전계가 **비율로 주어짐**(E₁=E₀a_z·E₂=k·E₀a_z, E₀ 상수) + **경계 전위 주어짐**(z=0·z=상단, mV) + **두께 다름**(1mm·2mm). 닫힌형: E_z=−dV/dz → V₁(z)=vBot+a·z, V₂(z)=k·a·z+(vBot+a·d₁(1−k)), a=(vTop−vBot)/(d₁+k·d₂). 원본(1mm·2mm·k2·0→100mV)→**V=20z(0<z<1)·40z−20(1<z<3), 정답 ①**.
  - **감지**: `detectDielectricPotentialMode(analysis)` — 유전체 문맥 + "전위" + ("적분"|"V(z)"|"영역의 전위"|"전위 분포") + 전하·정전용량 아님. → `EmBuildHints.dielectricStructure="potential_distribution"`. build 최상단 분기(배치 로직보다 우선), 유사·변형 모두 V(z) 도출.
  - **모드**: exam_similar=두 경계전위 given→V(z) / exam_variant=구하는 양 교환(전계 E₀ given→V(z)+상단 도체판 전위). `DIEL_POTENTIAL_SPACE`(규칙 열거+정수계수/깔끔 경계전위 필터, 원본 튜플 제외).
  - ★ **감지 안전망 (핵심)**: classifyElectromagnetics가 "전위·전계" 많이 언급된 이 텍스트를 가끔 **potential_to_charge_density(전위함수 V(x,y,z)→ρ_v)로 오분류**(키워드 "전위·전계" 매칭 수) → 실측 4회 중 1회 오분류. → 파이프라인에서 **dielectricStructure 감지 시 entryId를 "dielectric_two_region_cap"로 강제**(classify 노이즈 무력화, "유전체" 문맥 요구로 potential_to_charge 오탈취 방지). 보강 후 4/4 안정.
  - **렌더러**: `renderDielectricSlab` series 분할을 `thickFracA`(하부 두께 비율)로 **비례 분할**(기존 1/3 고정 → 두께비 다른 변형도 정확, 원본 1:2는 무변경). analyzeImage에 전위 분포 하위구조 추출 규칙(전하·정전용량·d역산으로 오요약 금지).
  - ★ **좌표축 추가 (2026-07-15, 사용자 요청)**: `renderDielectricSlab`에 **x·y·z 좌표축** 표기(원본 임용 형식). 원점 O=박스 앞-아래-왼쪽 모서리(z=0 평면), z=위(적층/극판 간격 방향)·y=오른쪽·x=앞쪽(관측자, 좌하). 박스 모서리 위로 연장, `emArrowA`(STROKE) 마커 신설. 모든 dielectric_slab 모드(전위분포·전하·부피비) 공통 적용.

## 유전체 경계면 전계 굴절 + 정전 에너지 밀도 (임용 20번 전자기학 — `dielectric_boundary_field`) EM 레지스트리 항목 (그림 없음)
- 원본: z=0 경계(법선 a_z)로 나뉜 두 유전체(z<0: ε_r1=3·z>0: ε_r2=2, ρ_s=0). E₁=3a_x+2a_y−2a_z(z<0) 주어질 때 E₂(z>0)와 단위체적당 정전 에너지 w를 구함. **경계조건**: 접선(a_x·a_y) 연속 → E₂x=3·E₂y=2, 법선 D 연속(ρ_s=0) → ε_r1E₁z=ε_r2E₂z → E₂z=(3/2)(−2)=−3. **E₂=3a_x+2a_y−3a_z**, w=½ε_r2ε₀|E₂|²=½·2·22·ε₀=**22ε₀ → 정답 ④**.
- ★ **오분류(수정됨)**: 레지스트리에 경계조건 규칙이 없어 벡터·전계 표기로 **자속 면벡터(flux_prism)·평판 두 유전체(dielectric_slab)로 오분류**("면벡터 문제가 나온다" 신고). 기존 규칙은 물리(경계조건)가 달라 재현 불가 → 규칙 항목 추가 필요.
- ★ **수정 = EM 레지스트리 규칙 항목 추가**([[feedback_universal_path]] EM 적용 = 예시가 아닌 **규칙(공식) 추가**, 값은 규칙 열거·정답 재계산). ★ **그림 없음**: 원본이 순수 수식(그림 없음) → `EmInstance.diagram` optional화 + 파이프라인이 diagram 없으면 `figureVariants:[]`. 새 렌더러/geometry 불필요.
- ★ **값은 규칙 열거+필터**: (ε_r1·ε_r2∈{2..6} 서로 다름·성분 a_x·a_y∈{1..4}·a_z 성분 ∈±{1..4}) 열거 → E₂z=(ε_r1/ε_r2)E₁z 정수 + 에너지 계수 ½ε_r|E|² 정수 필터, 원본 튜플 제외. 계수 ±1은 벡터 표기서 생략(`eVecLatex`). exam_similar=E₁ given→E₂·w(영역2) / exam_variant=구하는 양 교환(E₂ given→E₁·w(영역1)).
- ★ **감지 안전망**: `detectDielectricBoundary`(두 유전율 영역(z<0·z>0/경계면/비유전율+영역) + 경계 시그니처(경계면·접선·법선·E₁&E₂·전계+정전에너지) + **자속·면벡터 제외**) → 파이프라인에서 **entryId를 dielectric_boundary_field로 강제**(자속 면벡터·평판 오분류 차단). analyzeImage에 경계조건 추출 규칙(자속 면벡터·평판으로 오요약 금지).
- 파일: `electromagnetics.ts`(dielectricBoundaryField 항목+DIEL_BND_SPACE+eVecLatex, diagram optional)·`runElectromagneticsPipeline.ts`(diagram 없으면 figure 생략)·classifyElectromagnetics(detectDielectricBoundary)·analyzeImage 규칙. 검증: tsc 0 new err·E2E(원본 analyze→경계조건·유사 E₂·w·변형 E₁·w 수기검산 일치·양모드 totalIssues 0·figure 0)·회귀(자속 flux_prism·전기력선 plane_flux·점전하 point_charge 무영향). ★ 교훈: 경계조건은 기존 어느 규칙과도 다른 물리 → 규칙 항목 추가가 정답(기존 규칙 재사용 불가). 그림 없는 순수 수식 유형은 diagram 생략으로 figure-less 지원.

## 두 유전체 실린더형(동축) 커패시터 — 축방향 나란히(병렬) (임용 22번 전자기학 — `coax_two_dielectric_axial`) EM 레지스트리 항목
- 원본: 내부 반지름 a·외부 반지름 b인 실린더형(동축) 커패시터에 **두 유전체 ε₁·ε₂가 축방향으로 나란히** 채워짐(ε₁이 길이 L₁, ε₂가 길이 L₂). 같은 두 도체(a·b) 공유 → **두 동축 커패시터의 병렬**: C=2π(ε_r1·L₁+ε_r2·L₂)ε₀/ln(b/a). 원본(1.5ε₀·2ε₀·L₁2·L₂1)→**C=10πε₀/ln(b/a), 정답 ②**.
- ★ **오분류(수정됨)**: 레지스트리에 실린더 두 유전체 항목이 없어 "두 유전체" 키워드로 **평판형 `dielectric_two_region_cap`으로 오분류**(실린더→평판 변질). 또는 단일 `coax_capacitance`로 샐 수 있음.
- ★ **수정 = EM 레지스트리 항목 추가**([[feedback_universal_path]]). geometry `coax_two_dielectric` + 전용 렌더러 `renderCoaxTwoDielectric`(수평 3D 원통, 축방향 두 섹션 ε₁ 파랑·ε₂ 노랑, L₁:L₂ 비례 분할, 좌면 a·b 동심원, L₁·L₂ 치수). a·b는 기호 유지(답=Nπε₀/ln(b/a)).
- ★ **감지 안전망**: `detectCoaxTwoDielectric`(실린더/원통/동축 + 두 유전체(두 개의 유전체·ε₁&ε₂·정전용량 합산·각 구간·나란히) + 커패시터 문맥) → 파이프라인에서 **entryId를 coax_two_dielectric_axial로 강제**(classify 노이즈 무력화, 단일 동축·평판 두 유전체와 구분). analyzeImage에 실린더 두 유전체 축방향 추출 규칙.
- ★ **값은 규칙 열거+필터**: (ε_r1·ε_r2∈{1.5,2,2.5,3,4} 서로 다름·L∈{1,2,3}) 열거 → N=2(ε_r1L₁+ε_r2L₂) 정수[4..40] 필터, 원본 튜플 제외. exam_similar=전체 정전용량 C(병렬) / exam_variant=구하는 양 교환(전체를 균일 유전체로 채웠을 때 같은 C 주는 **등가 비유전율 ε_r,eq=(ε_r1L₁+ε_r2L₂)/(L₁+L₂)**, 같은 그림).
- 파일: `electromagnetics.ts`(coaxTwoDielectricAxial 항목+COAX_DIEL_SPACE+fracOrNum)·`emFieldRenderer.ts`(renderCoaxTwoDielectric+geometry). classifyElectromagnetics(detectCoaxTwoDielectric)·runElectromagneticsPipeline(감지+entryId강제)·analyzeImage 규칙. 검증: tsc 0 new err·E2E(원본 analyze→coax_two_dielectric·유사 C=Nπε₀/ln(b/a)·변형 ε_r,eq 분수·양모드 totalIssues 0)·회귀(단일 동축 coax·평판 두 유전체 dielectric_slab 무영향)·Edge 시각검증(원본 배치 재현). ★ 교훈: 같은 "두 유전체"라도 **형상(평판 vs 실린더)·배치(축방향 병렬)가 다르면 별도 레지스트리 항목**. 감지 안전망으로 classify 오분류 차단.

## 두 원형 전류 루프 축상 자계 합성 → 전류 I 도출 (임용 9번 전자기학 — `circular_loop_axis_field`) EM 레지스트리 항목
- 원본: 원통 좌표계, C₁(중심 P(0,0,z_p)·반지름 R₁·반시계 I₁) + C₂(중심 O·반지름 R₂·시계 I, xy평면). 점 P(=C₁ 중심, C₂ 축상)에서 [1]H₁ [2]H₂ [3]합성 H₃=H_t·a_z 되는 **전류 I 도출**. 원본(R₁5·I₁100·z_p4·R₂3·H_t1)→H₁=10·H₂=−(9/250)I·**I=250A**.
- ★ **오분류(수정됨)**: 레지스트리에 원형 루프 항목이 없어 "합성 자계" 키워드로 `sheet_line_superposition`(면전류+선전류)에 오분류 → 전혀 다른 문제 생성. 물리·기하가 완전히 다름(원형 루프 축상 자계 vs 무한 면/선전류).
- ★ **수정 = EM 레지스트리 항목 추가**([[feedback_universal_path]]: 새 EM 유형은 archetype 아닌 레지스트리 항목). 원형 루프 자계 공식: 중심 |H|=I/(2R), 축상(거리 z) |H|=I·R²/(2(R²+z²)^{3/2}). C₁(반시계)=+a_z, C₂(시계)=−a_z → H₃=I₁/(2R₁)−I·R₂²/(2·hyp³)=H_t.
- ★ **값은 규칙 열거+필터**: 피타고라스 (R₂,z_p,hyp) 삼각형으로 hyp 정수(축상 항 깔끔) + H₁·I 정수 필터, 원본 튜플 제외(205개 풀). exam_similar=C₂ 전류 I 도출 / exam_variant=C₁ 전류 I₁ 도출("구하는 양" 교환).
- ★ classifier: strongKeywords "원형 루프/원형 도선/원형 코일/원형 전류/루프 c_1·c_2"(면전류·선전류 없음 → sheet_line과 구분). analyzeImage에 "두 원형 루프 축상 자계 합성" 추출 규칙(면전류·선전류·직선도선으로 오요약 금지).
- 파일: `electromagnetics.ts`(`circularLoopAxisField` 항목 + `LOOP_AXIS_SPACE`)·`emFieldRenderer.ts`(`renderCircularLoopsAxis`: z축 위 두 타원 루프 + 전류방향·P·목표식). geometry `circular_loops_axis`. EM_FORMULA_REGISTRY 등록.

## 직각 좌표계 위 두 점전하 → 합성 전계 크기 |E| + 전위 V_P (임용 4번 전자기학 — `two_point_charges_field_potential`) EM 레지스트리 항목
- 원본: 자유 공간, Q_A가 y축 위 A(0,d,0)·Q_B가 z축 위 B(0,0,d), 측정점 P(0,d,d). |E|와 V_P를 순서대로.
- ★ 물리: **A→P=(0,0,d)·B→P=(0,d,0)** 이라 두 전계가 **서로 수직** → |E|=√(E_A²+E_B²)(피타고라스), 전위는 스칼라 합 V_P=k(Q_A+Q_B)/d. 원본(d=3·8nC·6nC) → E_A=8·E_B=6 → **|E|=10 V/m·V_P=42 V**.
- ★ **오분류(수정됨)**: 기존 항목으로 재현 불가 — `point_charge_field`는 **단일** 점전하, `coulomb_force`는 두 전하 **사이의 힘 F**. 실측 로그에서 이 원본이 `point_charge_field`로 dispatch돼 단일 전하 문제가 나왔다.
- ★ 값은 규칙 열거+필터: E_A·E_B·|E|가 **모두 정수인 피타고라스 조합**(6-8-10·8-15-17·9-12-15 등) + V_P 정수. 원본 튜플 제외. 모드: similar=|E|·V_P / variant=**구하는 양 교환**(|E| given → Q_B 역산 + V_P).
- ★ **키워드 잠식 금지**: bare "점전하"(→ point_charge_field)·"두 점전하"(→ coulomb_force)는 keywords/strong 어디에도 두지 않는다 — 실측에서 이 항목이 쿨롱 힘 문제를 뺏었다. strong은 "두 점전하에 의한 전계/전위" 같은 **조합**만. 대신 구조 감지기 `detectTwoPointCharges`(점전하 + 두 전하 표기 + 전계/전위, 힘·면전하·선전하·자계면 양보)를 강제 체인 8번째에 둔다.
- 파일: `electromagnetics.ts`(entry + `TWO_CHARGE_SPACE` + geometry `two_charges_axes`)·`emFieldRenderer.ts`(`renderTwoChargesAxes` — z↑·y→·x↙ 좌표축 + A(y축)·B(z축)·P + 점선 보조선). ★ 캔버스는 **W=560·H=300 고정** — 좌표가 밖으로 나가면 라벨·축이 잘린다(실측).
- 검증: `scripts/smokeTwoPointCharges.mjs` **13/13**(표현 변형 3종 + 형제 회귀 3종(단일 점전하·쿨롱 힘·면선전하) + 생성물 16개 |E|·V_P 재검산 + figure/발문 구조) / EM 스모크 무회귀(sheetLine 8/8·sheetRing 10/10·curl 34/34·flux 10/10) / 원본 E2E 양모드 issues=0 / smokeAll 40/40 / Edge 시각검증.

## 두 무한 직선 도선(전류 반대) 합성 자계 → 위치 a 도출 → 단위 길이당 힘 (임용 11번 전자기학 — `two_wires_field_force`) EM 레지스트리 항목
- 원본: x=0·y=1에 도선 A(+a_z, 2A), x=0·y=a에 도선 B(−a_z, 2A). [1] O(0,0,0)·P(0,2,0)의 합성 자계를 **a가 포함된 식**으로 [2] |H_O|:|H_P|=3:5 되는 a (단, a>2) [3] **B에 작용하는 단위 길이당 힘**. 답: **a=5, F=μ₀/(2π)a_y(척력)**.
- ★ 물리(닫힌형, GPT 없음): z축과 나란한 도선(y=y₀, +I a_z)은 y축 위 점에서 **H(y) = −I/(2π(y−y₀))a_x** (−a_z면 부호 반전). 따라서
  H_O=(I/2π)(1/y_A−1/a)a_x, H_P=−(I/2π)(1/(y_P−y_A)+1/(a−y_P))a_x. ★ **비를 잡으면 (a−y_A)가 항상 약분**되어
  |H_O|:|H_P| = (y_P−y_A)(a−y_P) : y_A·a → **a = n·g·y_P/(n·g − m·y_A)** (g=y_P−y_A). 힘은 반대 방향이라 **척력** F=μ₀I_AI_B/(2π(a−y_A))·(+a_y).
- ★ **오분류(수정됨)**: 실측 dispatch가 **`straight_wire_B`(단일 도선 B=μ₀I/2πr)** — 도선 1개짜리 단순 계산 문제로 변질됐고 **validator는 issues=0으로 통과**했다. 형제 어느 것도 재현 불가(`force_on_wire`=F=BIL, `sheet_line_superposition`=면전류+선전류, `circular_loop_axis_field`=원형 루프).
- ★ **분류**: strong 키워드는 **"단위 길이당 힘"·"두 무한 도선"** 만 — bare "자계"·"합성 자계"는 형제(면전류+선전류·원형 루프)를 점수로 잠식하므로 금지. 라우팅 보증은 구조 감지기 `detectTwoWiresFieldForce`(**도선이 2개** + 자계 + (단위 길이당 힘|합성 자계|크기 비), 면전류·선전류·원형·동축·솔레노이드·전하·자속/회전·시변 유도는 양보)가 맡고 파이프라인 강제 체인 **맨 앞**에 둔다.
- 모드: **exam_similar**=두 전류 크기 같음, **a가 미지**(원본 구조) / **exam_variant**=**구하는 양 교환** — a는 주어지고 **도선 B의 전류 세기 I가 미지**.
- ★ 값은 규칙 열거+필터: a 정수(y_P<a≤24)·힘 계수 μ₀/π 분모≤4·(변형)비 m:n ≤12 정수비·I 정수. **원본 조합 (y_A,y_P,m,n)=(1,2,3,5) 통째로 제외**(전류만 바꾸면 a=5가 그대로 나와 "값만 바꾼 복사"가 된다).
- 파일: `electromagnetics.ts`(`twoWiresFieldForce` + `TWO_WIRE_SPACE`·`TWO_WIRE_VARIANT_SPACE` + `redFrac`/`mu0OverPiTex`)·`emFieldRenderer.ts`(`renderTwoWiresAxes` — z↑·y→·x↙ 좌표축 + 무한 도선 2개(⋮) + 전류 화살표(↑/↓) + O·P). geometry `two_wires_axes`, topicKey=magnetostatics. classifyElectromagnetics(감지기)·runElectromagneticsPipeline(체인 0-2)·analyzeImage 규칙·`smokeOriginalRouting`(+1줄) 등록.
- ★ 렌더 gotcha: 도선 이름 라벨을 **아래**에 두면 하단 캡션과 겹친다 → 위쪽(y=42). y축 위치 라벨도 수직선과 겹치지 않게 좌측 정렬.
- 검증: tsc 0 / `scripts/smokeTwoWiresFieldForce.mjs` **22/22**(실측 요약 + 표현 변형 4종 + 형제 회귀 7종 + 생성물 24개 독립 재검산 + 원본 값(a=5·F=μ₀/2π) + 원본 조합 미생성 + 렌더 구조) / `smokeOriginalRouting` **33/33** / EM 형제 스모크 무회귀(sheetLine 8/8·sheetRing 10/10·curl 34/34·fluxLoop 10/10·twoPointCharges 13/13·dielectric 4/4) / **원본 이미지 E2E 라우팅 3/3**·양모드 issues=0(유사 a=9·F=4μ₀/3π, 변형 I=3·F=3μ₀/4π 수기검산 일치).

## 점전하 + x축 무한 선전하 → 전계 크기가 같아지는 Q_A → 전계가 0이 되는 위치 k (임용 9번 전자기학 — `point_line_null_field`) EM 레지스트리 항목
- 원본: 자유 공간 직각 좌표계. 점전하 Q_A가 **P₁(0,3,2)**, **x축**에 선전하 ρ_L=4[µC/m]. 〈해석 절차〉
  [1] **P₂(0,0,2)**에서 선전하에 의한 E₁과 점전하에 의한 E₂, [2] **|E₁|=|E₂|가 되는 Q_A**,
  [3] 그 Q_A를 갖는 A가 **(0,0,k)로 이동**했을 때 **|E₁+E₃|=0이 되는 k**.
- ★ 물리(닫힌형, GPT 없음) — 일반화: 점전하 P₁(0,d,h), 측정점 P₂(0,0,h).
  · |E₁| = ρ_L/(2πε₀h) = 18ρ_L/h [kV/m] (+a_z) · |E₂| = Q_A/(4πε₀d²) (−a_y)
  · [2] **Q_A = 2ρ_L d²/h [µC]** · [3] (k−h)² = d² 이고 **k > h**여야 상쇄되므로 **k = h + d**
    (k < h면 E₃도 +a_z라 상쇄 불가 — 해가 하나뿐인 이유이자 채점 포인트).
  원본 검산: |E₁|=36 kV/m, **Q_A = 36 µC**, **k = 5**.
- ★ 형제 `point_line_charge_force`(2023 전기 A-10)와 다르다 — 저쪽은 선전하가 **z축 평행**, 미지가
  **선전하밀도**, 3단계가 **힘 F**다. 그리고 그 감지기는 **"점전하+선전하+전계"면 무조건 true**를 내므로
  강제 체인에서 반드시 **그보다 앞(6.45)**에 두고 그쪽에 양보 가드를 달아야 한다(안 하면 통째로 삼킨다).
- ★★ **감지는 낱말이 아니라 구조로** (실측 2026-08-02): 첫 E2E에서 Vision이 "크기가 같다"도 "0이 되는"도
  쓰지 않고 *"전기장을 이용해 전하량 Q_A를 구한다 / 전하가 (0,0,k)로 이동할 때"* 로만 요약해(선 방향도
  z축으로 오독) 감지기가 미발화 → 형제가 가져가 **크기 비·힘 문제**가 생성됐다. ⇒ 요구 신호를 4개로 확장:
  `크기 일치` OR `전계 0/상쇄` OR **`미지가 전하량`** OR **`(0,0,k)로 이동 + k를 구함`**. "크기 비"는 양보(형제 고유).
- 모드: **exam_similar**=ρ_L 주어짐 → Q_A 도출(원본) / **exam_variant**=**구하는 양 교환**(Q_A 주어짐 → ρ_L 도출). 3단계는 동일.
- ★ 값은 규칙 열거+필터: |E₁|=18ρ_L/h와 Q_A=2ρ_L d²/h가 **모두 정수**, 범위 제한, d≠h. **원본 튜플(4,3,2) 제외**.
- 파일: `electromagnetics.ts`(`pointLineNullField` + `PT_LINE_NULL_SPACE` + `__ptLineNullSpace`)·
  `emFieldRenderer.ts`(`renderPointLineNullAxes`, geometry `point_line_null_axes` — z↑·y→·x↙ 축, **선전하가 x축과 겹쳐**
  좌하–우상으로 무한히 뻗고 P₂는 z축 위·P₁은 +y로 d만큼). classifyElectromagnetics(`detectPointLineNullField`
  + 형제 양보 가드)·runElectromagneticsPipeline(체인 6.45)·`smokeOriginalRouting`(+1줄) 등록.
- ★ 렌더 gotcha: `texToPlain`에 **`\rho`가 없어 "rho_L"이 그대로 찍혔다** → ρ·φ·θ·⇒ 추가. 또 x축 라벨을
  캔버스(H=300) 밖에 두면 잘리고, 선전하 라벨을 선 아래 두면 하단 캡션과 겹친다(규칙 #6).
- 검증: tsc 0 / `scripts/smokePointLineNullField.mjs` **25/25**(실측 요약 포함 감지 4종 + 형제 양보 5종 +
  형제 감지기 회귀 4 + 원본 물리 5 + 생성물 24개 독립 재검산 + 렌더) / `smokeOriginalRouting` **39/39** /
  EM 형제 무회귀(sheetLine 8/8·sheetRing 10/10·curl 34/34·fluxLoop 10/10·twoPointCharges 13/13·twoWires 22/22·dielectric 4/4) /
  **원본 이미지 E2E 양모드 issues=0**(유사 ρ_L=9·d=4·h=1 → Q_A=288µC·k=5, 변형 Q_A=200µC·d=5·h=1 → ρ_L=4µC/m·k=6 — 수기검산 일치).

## 무한 면전하 + 무한 선전하 합성 전계 → E=0 조건 ρ_l 도출 (임용 11번 전자기학 — `sheet_line_efield_superposition`) EM 레지스트리 항목
- 원본: 면전하 ρ_s(z=0 평면) + 선전하 ρ_l(선 (0,0,z_L)·y축 나란). 점 P(선 아래)에서 [1]E_1P·E_2P [2]합성 E_P=0 되는 **ρ_l 도출** [3]점 Q(선 위)에서 합성 E_Q. 원본(ρ_s4·z_L2·P(0,0,1)·Q(0,0,3))→E_1P=2/ε₀·**ρ_l=4π**·E_Q=4/ε₀. 답은 ε₀·π 그대로(기호식).
- ★ **오분류(수정됨)**: 레지스트리에 면전하+선전하 합성 항목이 없어 단일 "무한 선전하"(`line_charge_field`, E=λ/2πε₀r)로 오분류 → 면전하·중첩·E=0 조건 전부 소실.
- ★ **수정 = EM 레지스트리 항목 추가**([[feedback_universal_path]]). 물리: 면전하 E=ρ_s/(2ε₀), 선전하 E=ρ_l/(2πε₀·d). P는 선 아래(−a_z)·Q는 선 위(+a_z). E_P=0 → ρ_l=π·ρ_s·d_P. E_Q=ρ_s/(2ε₀)(1+d_P/d_Q)a_z. 값 규칙 열거(ρ_s 짝수·좌표 소정수·E_Q계수 0.5배수) + 원본 제외(53개 풀). exam_similar=ρ_l 도출 / exam_variant=E=0 위치 z_P 도출("구하는 양" 교환).
- ★ **classifier 핵심 (회귀 실측 기반)**: strongKeywords는 ★"합성 전계"뿐★. "면전하"/"선전하" bare는 strong 금지 — 각각 단일 charged_sheet·line_charge를 오탈취함(자계 sheet_line_superposition은 "면전류"가 고유해 가능하지만 "면전하"는 charged_sheet와 겹침). "합성 전계"는 단일 면전하/선전하엔 없고 중첩 유형에만 나타남. analyzeImage에 "면전하+선전하 합성·E_P=0" 추출 규칙(단일 선전하로 오요약 금지).
- 파일: `electromagnetics.ts`(`sheetLineEfieldSuperposition` + `SHEET_LINE_E_SPACE`)·`emFieldRenderer.ts`(`renderSheetLineEfield`: z=0 면전하 평면 + y축 나란 선전하 + z축 위 P·Q). geometry `sheet_line_efield`. topicKey=gauss_law. EM_FORMULA_REGISTRY 등록.

## 동축 원통(도전율 σ) 두 도체 사이 저항 R (임용 12번 전자기학 — `coax_resistance`) EM 레지스트리 항목
- 원본: 두 완전 도체 사이에 도전율 σ 물질이 채워진 동축 원통(내부반경 a·외부내경 b·길이 L). 두 도체 사이 **저항 R**. [1]전류밀도 J=I/(2πρL)a_ρ(ρ 식) [2]전계 E=J/σ·전압 V₁=∫E dρ [3]R=V₁/I. 원본(a0.1·b0.5·L1·σ10⁻²·I2π)→J=1/ρ·E=100/ρ·V₁=100ln5·**R=50ln5/π Ω**. π·ln(b/a)는 기호로 둠.
- ★ **오분류(수정됨)**: 레지스트리에 동축 저항 항목이 없어 "동축 케이블 정전용량"(`coax_capacitance`, C=2πεL/ln(b/a))으로 오분류 → 유전율·정전용량으로 변질(도전율·저항이어야 함).
- ★ **수정 = EM 레지스트리 항목 추가**([[feedback_universal_path]]). R=ln(b/a)/(2πσL). 값 규칙 열거(b/a=정수비 → ln 기호·계수 정수·σ=10⁻ⁿ) + 원본 제외(208개 풀). exam_similar=저항 R / exam_variant=소비전력 P=V₁·I("구하는 양" 교환).
- ★ **새 topicKey `current_conduction` 추가**(types/index.ts ElectromagneticsTopic·TOPICS_BY_SUBJECT·TOPIC_LABEL "정상 전류·저항 (도전율)" + electromagnetics.ts EmTopic). 기존 7개 EM 토픽 중 정상전류/저항에 맞는 게 없어 신설 — capacitance 태그 오표시 방지.
- ★ classifier: strongKeywords "도전율/전도율/두 도체 사이의 저항/누설 저항/동축 원통"(유전율·정전용량 없음 → coax_capacitance와 구분). analyzeImage에 "동축 도전율 저항" 추출 규칙(정전용량·유전율로 오요약 금지).
- 파일: `electromagnetics.ts`(`coaxialResistance` + `COAX_RES_SPACE`)·`emFieldRenderer.ts`(`renderCoaxResistor`: ★원본처럼 3D 동축 원통★ — 외부 원통(도전물질 호박색)+내부 도체 원통+윗면 링+반경 전류 화살표+V₁+σ·R·L·a·b+원통 좌표축. ※최초 2D 단면으로 그렸다가 "그림이 원본과 다르다" 피드백으로 3D 원통 재작성). geometry `coax_resistor`. EM_FORMULA_REGISTRY 등록.

## EM 분류기 자기일관성 — 라운드트립 테스트 + dielectric_slab 일반키워드 오탈취 수정
- ★ **검증 방법**: 23개 EM 레지스트리 항목 각각을 (1)자기 시그니처로 생성→geometry_A (2)★생성된 실제 본문을 재분석 입력★→geometry_B. A·B 모두 자기 항목이어야 통과. 원본 텍스트가 다른 항목에 뺏기면 오라우팅 버그. (스크립트: fetch 기반, 셸 인라인 curl은 한글 이스케이프 깨져 신뢰 불가 — 파일 payload나 fetch 사용.)
- ★ **발견·수정된 버그**: `dielectric_two_region_cap`(두 유전체)의 일반 keywords에 "평행판·커패시터·축전기·유전율·정전용량·전기용량"이 있어, 단일 평행판(`parallel_plate_cap`, strong 없음)의 본문을 키워드 수로 오탈취(단일 평행판 문제가 두 유전체 문제로 생성). → 두 유전체 고유 신호는 strongKeywords가 담당하므로 일반 keywords를 두 유전체 고유어("평판 도체·표면전하밀도·전위차")만 남기고 축소. 결과 23/23 통과.
- ★ **교훈(일반화)**: 넓은 상위 유형(A의 특수형 B)을 추가할 때, B의 일반 keywords가 A와 겹치면 strong 없이도 키워드 수로 A를 뺏는다. B는 고유 신호를 strongKeywords에만 두고 일반 keywords는 최소화. ([[feedback_generic_code]] 정신 — 겹치는 일반어로 상위 유형 잠식 금지.)

## 정사각형 폐경로 선적분 → 면적 극한 → 자계의 회전 ∇×H (임용 11번 전자기학 — `curl_from_line_integral`) EM 레지스트리 항목
- 원본: 자유 공간에 자계 **H = 20x²a_z [A/m]**. 한 변 **ℓ=1**인 정사각형 abcd(중심 (x₀,0,0))에 대해 [1] 폐경로 a-b-c-d-a를 따라 **∮H·dl [A]** [2] **∮H·dl/S [A/m²]**와 면의 방향 단위 벡터 **a_n** [3] **x₀=2일 때 ∇×H [A/m²]**. = 암페어 법칙의 미분형(회전의 정의).
- ★ **오분류(수정됨)**: 레지스트리에 이 유형이 없어 "자계" 일반어로 **`straight_wire_B`(단순 직선 도선 B=μ₀I/2πr)로 dispatch** — 도선·전류가 없는데 전혀 다른 문제가 생성됐다(서버 로그 실측: `runElectromagneticsPipeline dispatch {"entryId":"straight_wire_B"}`, totalIssues=0이라 에러 없이 조용히 변질). Vision이 topicKey를 **mixed_signal**로 뱉어 EM 경로조차 못 타는 경우도 실측됨.
- ★ **물리(닫힌형, GPT 없음)**: H = k x² a_z → **∇×H = −2k x a_y**. 경로 a(x₀+ℓ/2,0,−ℓ/2)→b(x₀+ℓ/2,0,ℓ/2)→c(x₀−ℓ/2,0,ℓ/2)→d(x₀−ℓ/2,0,−ℓ/2)→a 에서 z방향 두 변만 기여 → **∮H·dl = kℓ[(x₀+ℓ/2)²−(x₀−ℓ/2)²] = 2kℓ²x₀ [A]**. S=ℓ² → **∮H·dl/S = 2k x₀**. 오른손 법칙(a_x→a_z) → **a_n = a_x×a_z = −a_y**. 따라서 (∮H·dl/S)a_n = −2k x₀ a_y = ∇×H|_{x₀} — 단계 2·3이 정확히 일치한다.
  - ★ **지수는 2로 고정**: 2차식이라 유한 정사각형의 평균이 중심값과 정확히 같다(3차 이상이면 어긋나 [2]≠[3]이 되어 교육적으로 깨짐).
- ★ **꼭짓점 좌표를 본문에 명시**해 순회 방향(→ a_n 부호)을 확정한다. 원본 그림의 corner 라벨 방향은 재현 대상이 아님(원본 튜플은 어차피 생성 풀에서 제외).
- ★ **값은 규칙 열거+필터**: (k∈{10..100}, ℓ∈{1,2}, x₀∈{1..5}) 열거 → ∮≤2000·|∇×H|≤800 필터, **원본 튜플(20,1,2) 제외**. exam_similar=x₀ 주어짐→∇×H 도출 / exam_variant=**구하는 양 교환**(목표 ∇×H → x₀ 역산).
- ★ **분류 2겹**: (1) strongKeywords "정사각형 경로·폐경로·경로 적분·선적분·회전·curl·∇×"(bare "자계·자기장"은 strong 금지 — 모든 정자계 문제가 언급해 오탈취). (2) 감지 안전망 `detectCurlLineIntegral`(자계 문맥 + 선적분 + 회전/면적 극한, 전하·전위차·유전체면 양보) → 파이프라인에서 entryId 강제. analyzeImage에 전용 추출 규칙(자계식·정사각형·∮H·dl·a_n·∇×H 보존, **topicKey=magnetostatics 강제**, 직선 도선·자속 가우스·회로로 오요약 금지).
- 파일: `electromagnetics.ts`(`curlFromLineIntegral` + `CURL_LOOP_SPACE`)·`emFieldRenderer.ts`(`renderSquareLoopCurl`: x축 수평(좌)·z축 수직·y축 우상 사선, xz 평면 정사각형 abcd + 경로 방향 화살표 + 중심 (x₀,0,0) + a_n 화살표 + x²에 비례해 길어지는 H 화살표). geometry `square_loop_curl`, topicKey=magnetostatics.
- 검증: tsc 신규 0(theveninDep 8 baseline만)·라우팅 10/10(**서버 로그의 실제 Vision 요약 3종** + 약신호 2종 + 회귀 5종: 직선도선·삼각기둥·면전류선전류·원형루프·전계 선적분)·물리 24/24 수기검산(∮=2kℓ²x₀·∮/S=2kx₀·a_n=−a_y·∇×H=−2kx₀a_y, 원본 튜플 미생성)·E2E 양모드 issues=0·Edge 시각검증·**smokeAll 38/38**.
- ★ 교훈: EM에서 "자계가 좌표 함수로 주어짐 + 폐경로 선적분"은 **도선·전류 기반 정자계 항목과 물리가 완전히 다르다** — 겹치는 일반어("자계")로는 straight_wire_B가 가져가므로 **선적분·회전 시그니처를 strong으로** 두고 감지 안전망을 함께 건다. 텍스트만으로 라우팅되는 EM 특성상 Vision 요약이 흔들려도(회전 단어 누락·topicKey 오판) 잡히도록 2겹으로 방어.

## ★ 회귀 사례 (2026-07-28) — 나중에 추가한 항목의 strong 키워드가 **기존 항목**을 잠식 (`flux_loop_induced_current`)
- 사용자 신고: "이 문제 생성했었는데 다시 하니까 안돼"(ㄷ자 완전 도체 + B=sin(t)a_x + 100Ω → Φ(t)·i(t)). **이번엔 회귀가 맞았다** — `flux_loop_induced_current` 항목은 원본 그대로 이미 구현돼 있었다.
- ★ 진단(서버 로그): `runElectromagneticsPipeline dispatch {"entryId":"curl_from_line_integral"}` — 2026-07-23에 추가한 정자계 ∇×H 항목이 가져갔다. 감지기(`detectCurlLineIntegral`)는 false였고, **분류 점수**에서 진 것: curl 항목 strongKeywords의 **bare "폐경로"·"선적분"·"회전"** 이 Vision의 패러데이 서술("폐회로를 따라 선적분", "∇×E=−∂B/∂t의 회전")과 그대로 겹쳤다. 정적 재현 2/4 케이스.
- ★ 수정 3겹: (1) curl strongKeywords를 **고유 조합만**으로 축소(정사각형 경로·경로 적분·∇×·curl·암페어 법칙의 미분형), keywords에서 "자계"·"면적" 제거. (2) `detectCurlLineIntegral` 최상단에 **양보 가드** — 시변 유도 문맥이면 false. (3) 신규 `detectFluxLoopInducedCurrent`(구조 시그니처 = 유도 문맥 + 시간 변화 + 저항/루프, 운동 기전력 주체면 moving_rod에 양보)를 파이프라인 강제 체인 **curl보다 먼저**.
- 검증: `scripts/smokeFluxLoopRouting.mjs` **10/10**(실측 analyze + 신고 재현 표현 5종 + 형제 회귀 4종) / smokeCurlLineIntegral **34/34** / smokeSheetRingRouting 10/10 / smokeDielectricDetectors 4/4 / tsc 신규 0 / E2E 양모드 issues=0(Φ=8sin2t·i=−0.32cos2t / P_avg).
- ★★ **교훈(일반화)**: 새 EM 항목의 strong 키워드는 **기존 항목이 쓰는 서술어와 겹치는지 먼저 확인**할 것. "폐경로·선적분·회전"은 정자계 고유어가 아니라 **패러데이 유도도 쓰는 일반어**였다. 겹치면 (a) strong을 고유 조합으로 좁히고 (b) 구조 감지기로 라우팅을 보증하고 (c) 형제 항목의 감지기를 강제 체인 앞에 둔다. 기존 항목의 회귀 스모크가 없으면 이런 잠식은 조용히 통과한다.

## 무한 면전하 + 원형 링 선전하 축상 합성 전계 → 비율로 λ 도출 (임용 12번 전자기학 — `sheet_ring_efield_ratio`) EM 레지스트리 항목
- 원본: 면전하 ρ_s(z=z_s 평면) + ★원형 링(반지름 R, z=0 평면, 원점 중심)★에 선전하 λ. 점 P(0,0,z_p) 축상에서 [1]E_1·E_2 [2]|E_1|:|E_2|=a:b 되는 **λ 도출** [3]합성 E_P. 원본(z_s3·ρ_s2·R=√2·P(0,0,√2)·2:3)→E_1=1/ε₀·E_2=λ/(8ε₀)·**λ=12**·E_P=1/(2ε₀)a_z. ε₀ 그대로.
- ★ **오분류(수정됨)**: `sheet_line_efield`(무한 **직선** 선전하·E=0 조건)로 오분류 → 원형 링이 직선으로, 비율 조건이 E=0으로 변질. 물리 다름(링 축상 전계 E=λRz/(2ε₀(R²+z²)^{3/2})).
- ★ **수정 = EM 레지스트리 항목 추가**. R²·z²·(R²+z²)가 완전제곱인 (R,z)만 써서 E_2=λ/(m ε₀) 깔끔(원본 R=z=√2 → m=8). λ=(b/a)(ρ_s/2)m, E_P=(ρ_s/2)(b−a)/a·(1/ε₀). 값 규칙 열거(√2·√5 링족·ρ_s 짝수·비율) + 원본 제외(78개 풀). similar=비율→λ / variant=λ→비율·E_P.
- ★ **classifier 3형제 판별 (핵심)**: "원형 루프"는 자기 루프(`circular_loops_axis`)와, "합성 전계"는 직선 선전하(`sheet_line_efield`)와 겹침. → strongKeywords에 ★"원형 루프"+"합성 전계" 둘 다★ 둬서 이 케이스만 둘의 합(+20)으로 이김. 자기 루프 원본은 "합성 전계"(전계) 없음(전류·자계)이라 안 샘, 직선 원본은 "원형" 없어 안 샘. 라운드트립 24/24 + 3형제 실본문 판별 검증 완료.
- 파일: `electromagnetics.ts`(`sheetRingEfieldRatio` + `SHEET_RING_SPACE`/`SHEET_RING_FAMILIES`)·`emFieldRenderer.ts`(`renderSheetRingEfield`: 면전하 평면 + z=0 원형 링(선전하) + 축상 P). geometry `sheet_ring_efield`, topicKey gauss_law. ※ texToPlain에 `\sqrt{x}`→"√x" 추가.
- ★★ **후속 (2026-07-29) — 형제 `sheet_line_efield_superposition`에 감지 안전망 추가**: 사용자 신고("완전 다른 문제야") 실측 dispatch `entryId=potential_to_charge_density`(전위 함수 V(x,y,z)→ρ_v). 이 항목의 strong 키워드가 **"합성 전계" 하나뿐**이라 Vision이 "전위·전계"를 많이 쓰는 실행에서 점수로 밀린다(메모리 기록 "4중 1 오분류"의 재발). → `detectSheetLineEfieldSuperposition`(구조 = **면전하 + 선전하 + 전계**, 원형/링·자계·유전체면 양보)를 강제 체인 **7번째**(sheet_ring 다음)에 추가. 또 이 항목의 일반 keywords에서 bare "면전하"·"선전하"를 제거(단일 선전하 원본을 점수로 뺏던 잠재 버그도 함께 수정). 검증: 신규 `scripts/smokeSheetLineRouting.mjs` **8/8**(표현 변형 4종 + 형제 회귀 4종: 전위함수·원형 링·면전류/선전류·단일 선전하) + 기존 EM 스모크 무회귀(sheetRing 10/10·curl 34/34·flux 10/10·dielectric 4/4) + 원본 **E2E 2회 × 양모드 4/4** issues=0.

- ★★ **후속 (2026-07-25) — 감지 안전망 `detectSheetRingEfield` 추가 (사용자 "다른 유형의 문제가 생성된다")**: strongKeywords 2개(`원형 루프`·`합성 전계`) **둘 다** 있어야 이기는 구조라, Vision이 둘 다 흘리면(예: "고리"로 표현 + "합성" 생략) 남은 일반어(`면전하`·`무한 평면`·`가우스`)만으로 **`charged_sheet_field`(단일 대전 평면, 실제 사용자 화면)** 또는 **`sheet_line_efield_superposition`(직선 선전하, 재현 실측)** 이 가져갔다. `analyzeImage.ts:154`에 이미 상세 보존 규칙이 있었지만 Vision이 지키지 않음 → **프롬프트 층으로는 부족, 감지 안전망 필요**(형제 EM 항목들과 동일 패턴).
  - 구조 시그니처(표현 무관): **면전하 + 선전하 + 원형(링·고리·루프·반지름) + 전계 문맥**. 단일 대전 평면엔 선전하가 없고, 직선 선전하 유형엔 원형이 없어 셋 동시 충족은 이 유형 고유. **자계·전류·면전류·선전류 문맥이면 양보**(자기 원형 루프 `circular_loop_axis_field` 보호).
  - 배선: `classifyElectromagnetics.ts`(`detectSheetRingEfield` export) + `runElectromagneticsPipeline.ts` 강제 체인 **5번째**(curl 다음). 검증: 신규 `scripts/smokeSheetRingRouting.mjs` **10/10**(표현 변형 5종 + 신고 재현 2종 + 형제 회귀 3종: 단일 대전 평면·직선 선전하·자기 원형 루프)·`smokeDielectricDetectors` 4/4·원본 이미지 E2E 6조합(유사/변형 × 1·3·5) issues=0·tsc 신규 0.
  - 부수: `scripts/_aliasHook.mjs`+`_aliasResolver.mjs` 신설 — `@/` 별칭·확장자 생략 임포트를 해석해 **dev 서버 없이 `lib/` 모듈을 직접 임포트하는 스모크**가 가능(`node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/<script>.mjs`). Vision 호출 없이 라우팅만 결정론적으로 검증할 때 사용.
  - ★ 교훈: strong 키워드 **2개 동시 요구**는 하나만 흘려도 무너진다 — Vision 요약이 흔들리는 EM에선 **구조 시그니처 기반 감지 안전망**을 함께 걸어야 한다.

## 전자기학 figure role 트리거 면제 — missing_figure_variant(waveform) 오류 수정
- ★ **버그(수정됨)**: 전자기학 문제(예: `moving_rod_emf` 전자기 유도)에서 `missing_figure_variant: waveform` 오류. 원인: `resolveRules`가 EM base(requiredFigureRoles=[])를 만든 뒤 **`resolveRequiredFigureRoles`(roleTriggers)가 semantic 트리거로 "waveform"을 추가**. analyze가 "전자기 유도"를 `hasWaveformEvolution=true`로 판정 → EM인데 waveform figure가 required로 붙음. (roleTriggers는 main_circuit만 EM 예외였고 waveform/state/equivalent 블록엔 예외 없었음.)
- ★ **수정**: `resolveRequiredFigureRoles` 최상단에 `if (subjectKey==="electromagnetics") return []` 가드. EM은 회로가 아니라 장 도식(em_field_diagram=concept_diagram role)만 쓰므로 회로 figure role(main_circuit·state·equivalent·waveform) 어느 것도 요구 안 함. ※digital_logic은 waveform_analysis에서 waveform 실제 필요 → 제외 안 함(EM만).
- 검증: hasWaveformEvolution=true·requiresMultiFigure=true가 새어도 EM 전 유형 issues=0·requiredFigureRoles=[]. 파일 `lib/rules/roleTriggers.ts`.
