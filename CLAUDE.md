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
