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
- ★ 교훈: **OPAMP 유무가 두 레귤레이터 유형의 핵심 판별자** — (제너+BJT)만으로 분류하면 OPAMP 있는 직렬형이 OPAMP 없는 션트형으로 샌다. analyzeImage에 "OPAMP 누락 금지" 명시 + PRE-SUBJECT 분류로 흡수. 원본이 개념형(보기)이어도 수치 유도형으로 재현(function_generator 선례).

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
- ★ **수정**: `detectDielectricArrangement(analysis)`(classifyElectromagnetics.ts)가 텍스트에서 series(적층·위아래·직렬·두께비·E_1&E_2)/parallel(나란히·병렬·부피비) 감지 → `EmBuildHints.dielectricArrangement`로 전달. build는 **유사=원본 배치 유지, 변형=반대 배치(직렬↔병렬 dual)**. 감지 실패 시 기본 병렬(임용 11번 호환).
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
