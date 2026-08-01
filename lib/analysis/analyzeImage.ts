import { getOpenAI, DEFAULT_MODEL, withRateLimitRetry } from "@/lib/openai";
import { createLogger } from "@/lib/logger";
import { SUBJECT_HINT } from "@/lib/prompts";
import { buildStructuralEnvelope } from "./buildStructuralEnvelope";
import {
  SUBJECT_LABEL,
  TOPICS_BY_SUBJECT,
  type AnalysisResult,
  type SubjectKey,
  type TopicKey,
  type TopologySignature,
} from "@/types";

const log = createLogger("lib/analysis/analyzeImage");

/**
 * Structured Outputs strict schema for ImageAnalysis.
 *  strict mode 제약: 모든 properties required + additionalProperties:false.
 *  optional은 ["type","null"] union으로.
 *  AnalysisResult의 일부 필드만 schema에 박음 (signals·figureRequirements·structureSignature·structuralEnvelope·subjectKey·family는 nullable).
 */
function buildAnalysisSchema(subject: SubjectKey): Record<string, unknown> {
  const topicEnum = TOPICS_BY_SUBJECT[subject] as readonly string[];
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "topic", "interpretation", "relatedConcepts", "fillInTheBlanks",
      "topicKey", "semantic", "topologySignature", "nodeAnnotations", "loadPlaceholders",
    ],
    properties: {
      topic: { type: "string", description: "문제의 주제 (한 줄, 25자 이내)" },
      interpretation: { type: "string", description: "문제 상황·구하는 미지수·해석 흐름의 한국어 해석 (3~5문장)" },
      relatedConcepts: { type: "array", items: { type: "string" }, description: "관련 핵심 개념·법칙·공식 5~8개" },
      fillInTheBlanks: {
        type: "array",
        description: "핵심 개념 빈칸 5개 ('____' 표기 + 정답).",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sentence", "answer"],
          properties: {
            sentence: { type: "string" },
            answer: { type: "string" },
          },
        },
      },
      topicKey: {
        anyOf: [{ type: "string", enum: [...topicEnum] }, { type: "null" }],
        description: `정확한 분류 안 되면 null. 가능 값: ${topicEnum.join(" | ")}`,
      },
      semantic: {
        type: "object",
        additionalProperties: false,
        required: ["hasStateTransition", "hasEquivalentTransformation", "hasWaveformEvolution", "requiresMultiFigure"],
        properties: {
          hasStateTransition: { type: "boolean" },
          hasEquivalentTransformation: { type: "boolean" },
          hasWaveformEvolution: { type: "boolean" },
          requiresMultiFigure: { type: "boolean" },
        },
      },
      // ★ 1주차 refactor (2026-05-31): family·role·branches·betweenNodes 모두 GPT schema에서 제거.
      //   GPT는 components 리스트(componentInventory)만 추출. topology 구조는 코드(Topology Recovery)가 derive.
      //   topologySignature는 subjectKey + features(boolean flags)만 유지 — features도 components로 derive 가능하지만
      //   downstream 코드 호환을 위해 보존 (2주차에 features도 코드 derive로 이전 예정).
      topologySignature: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["subjectKey", "features"],
            properties: {
              subjectKey: { type: "string", enum: ["digital_logic", "circuit_theory", "electronics"] },
              features: {
                type: "object",
                additionalProperties: false,
                required: ["hasSwitch", "hasDependentSource", "hasGround", "hasSupermesh", "hasMesh", "hasStateTransition", "meshCount"],
                properties: {
                  hasSwitch: { type: "boolean" },
                  hasDependentSource: { type: "boolean" },
                  hasGround: { type: "boolean" },
                  hasSupermesh: { type: "boolean" },
                  hasMesh: { type: "boolean" },
                  hasStateTransition: { type: "boolean" },
                  meshCount: { type: "number" },
                },
              },
            },
          },
          { type: "null" },
        ],
      },
      nodeAnnotations: {
        anyOf: [
          {
            type: "array",
            description:
              "단자 라벨(a/b/x/y 등). 발견되면 entry, 없으면 빈 배열. role은 가능하면 부여 " +
              "(source_plus | main_unknown | right_unknown | ground) — pattern detector가 이름 무관하게 매칭.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["node", "label", "style", "role"],
              properties: {
                node: { type: "string" },
                label: { type: "string" },
                style: { type: "string", enum: ["terminal_dot", "label_only"] },
                role: {
                  anyOf: [
                    { type: "string", enum: ["source_plus", "main_unknown", "right_unknown", "ground"] },
                    { type: "null" },
                  ],
                },
              },
            },
          },
          { type: "null" },
        ],
      },
      loadPlaceholders: {
        anyOf: [
          {
            type: "array",
            description: "부하 placeholder (R_L 점선 박스). 없으면 빈 배열.",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["betweenNodes", "label", "emphasize"],
              properties: {
                betweenNodes: { type: "array", items: { type: "string" } },
                label: { type: "string" },
                emphasize: { type: "boolean" },
              },
            },
          },
          { type: "null" },
        ],
      },
    },
  };
}

/**
 * 전자기학 전용 추출 규칙 — 회로가 아니라 장·공식 문제임을 분류기가 잡도록
 * topic·interpretation·relatedConcepts에 핵심 물리량·법칙을 보존하게 강제.
 */
const EM_EXTRACTION_RULES = `
【전자기학 추출 절대 규칙 (회로 아님)】
- 이 문제는 회로(netlist)가 아니라 ★전자기학 장·공식 문제★다. componentInventory·topologySignature는 비워도 된다(빈 배열/false). 억지로 R·C·L 소자를 만들지 마라.
- topic·interpretation·relatedConcepts에 ★어떤 물리 법칙·공식인지★ 반드시 보존하라. 분류 키워드 예:
  · 정전계: "점전하", "전기장/전계", "전위", "쿨롱 힘", E=kQ/r², V=kQ/r, F=kQ₁Q₂/r²
  · 가우스 법칙: "무한 선전하"(λ, E=λ/2πε₀r), "무한 대전 평면"(σ, E=σ/2ε₀)
  · ★무한 면전하 + 원형 링(루프) 선전하 합성 전계 → 비율 조건★: ★무한 면전하(ρ_s, z=z_s 평면)★와 ★원형 루프/원형 도선(반지름 R, z=0 평면, 원점 중심)에 분포한 선전하 λ★가 ★함께★ 주어지고, 축 위 점 P에서 면전하 전계 E_1과 링 선전하 전계 E_2의 ★크기 비 |E_1|:|E_2|=a:b★가 되도록 하는 λ와 합성 전계 E_P를 구하는 유형. → ★무한 "직선" 선전하 아님(원형 링임), 자기장/전류 원형 루프도 아님(전하·전계임)★. 반드시 보존: "무한 면전하"·"원형 루프(도선)에 선전하 λ"·"반지름"·"합성 전계"·"전계의 크기 비 a:b"·점 P·해석 절차 3단계([1]E_1·E_2 [2]비율로 λ [3]E_P). 링 축상 전계 E=λRz/(2ε₀(R²+z²)^{3/2}). ε₀ 그대로. topicKey=gauss_law. topic을 "무한 선전하"·"원형 전류 루프 자기장"으로 요약 금지.
  · ★무한 면전하 + 무한 선전하 합성 전계 → E=0 조건★: ★무한 면전하(ρ_s, z=0 평면)★와 ★무한 선전하(ρ_l, 어떤 선을 지나고 축과 나란)★가 ★함께★ 주어지고, 어떤 점 P에서 두 전계의 ★합성 전계 E_P=0★이 되는 선전하 밀도 ρ_l(또는 위치)을 구하고, 다른 점 Q에서의 합성 전계 E_Q를 구하는 유형. → ★단일 무한 선전하(E=λ/2πε₀r) 아님, 단일 면전하도 아님★(면전하+선전하 둘 다 존재 + 합성/중첩 + E=0 조건). 반드시 보존: "무한 면전하 ρ_s"·"무한 선전하 ρ_l"·"합성 전계"·"E_P=0"·점 P·Q 좌표·해석 절차 3단계([1]각 전계 E_1·E_2 [2]E_P=0으로 ρ_l [3]Q에서 E_Q). ε₀·π는 그대로 두는 기호식. topicKey=gauss_law. topic을 "무한 선전하 전기장"·"단일 면전하"로 요약 금지.
  · 정전용량: "평행판 커패시터"(C=εA/d), "동축 케이블/원통 커패시터"(C=2πεL/ln(b/a)), "구 커패시터/동심구"(C=4πε·ab/(b−a))·"고립 도체구"(C=4πε₀R), "정전 에너지 U=½CV²"
  · ★유전체 경계면 전계 굴절 + 정전 에너지★: 직각좌표계에서 ★두 유전율 영역이 경계면(예: z=0)으로 나뉘고★(z<0: ε_r1, z>0: ε_r2), 한 영역의 ★전계 벡터 E₁(=a·a_x+b·a_y+c·a_z)★이 주어져 ★다른 영역의 전계 E₂★와 ★단위체적당 정전 에너지 w[J/m³]★를 구하는 유형. 물리=경계조건(접선 성분 a_x·a_y 연속, 표면전하 ρ_s=0이면 법선 D_z 연속 → ε_r1E₁z=ε_r2E₂z). → ★자속·자계 "면벡터" 유형 아님(전계·유전체 문제), 평판/동축 커패시터도 아님★. 반드시 보존: "z<0·z>0 두 유전율 영역"·"비유전율 ε_r1·ε_r2"·"경계면"·"전계 E₁(성분 벡터)"·"E₂ 구함"·"단위체적당 정전 에너지 w"·"ρ_s=0"·단위벡터 a_x/a_y/a_z. topicKey=capacitance(또는 electrostatics). topic을 "자속 면벡터"·"평판 커패시터"·"단순 전기장"으로 요약 금지.
  · ★실린더형(동축) 커패시터 + 두 유전체 축방향 나란히(병렬)★: 내부 반지름 a·외부 반지름 b인 ★실린더형(원통·동축) 커패시터★에 ★두 개의 유전체 ε₁·ε₂가 축(길이) 방향으로 나란히★ 채워진 유형(ε₁이 길이 L₁, ε₂가 길이 L₂). 같은 두 도체(a·b)를 공유하므로 ★두 동축 커패시터의 병렬★ → C=2π(ε₁L₁+ε₂L₂)/ln(b/a). → ★단일 유전체 동축(C=2πεL/ln(b/a)) 아님, 평판형 두 유전체(면적 A·간격 d) 아님★(실린더형 + 유전체 2개 + 축방향 병렬이 핵심). 반드시 보존: "실린더형/원통형/동축 커패시터"·"두 개의 유전체 ε₁·ε₂"·"축방향으로 나란히"·L₁·L₂·a·b·"정전용량(합산)". topicKey=capacitance. topic을 "평판 커패시터"·"단일 동축 케이블"·"두 도체 사이 저항"으로 요약 금지.
  · ★두 유전체 평판 커패시터★: 면적 A·간격 d인 ★두 평판 도체★ 사이에 ★유전율이 서로 다른 유전체 2개(ⓐ ε_a·ⓑ ε_b)★가 채워지고(부피비/두께비 주어짐), [1]표면전하밀도 비 ρ_a/ρ_b·전계 E_z [2]전위차 V_d [3]정전용량 C_d 를 구하는 유형 → ★단일 유전체 C=εA/d 아님, 전기력선 유형도 아님★. 반드시 보존: "서로 다른 유전체 2개"·"두 평판 도체"·"표면전하밀도(의 비) ρ_a/ρ_b"·"정전용량 C_d"·부피비(또는 두께비)·ε_a·ε_b·+Q/−Q·해석 절차 3단계. topic을 "점전하"·"단일 평행판"으로 요약 금지.
    · ★★배치(직렬 적층 vs 병렬 나란히) 반드시 구분·보존★★ — 이 배치가 문제의 구조/원리를 결정하므로 흘리면 안 된다. 두 유형:
      ▸ ★직렬(적층)★: 유전체 2개가 두 극판 사이를 ★위아래로 쌓아(적층)★ 채움(예: 아래 유전체1·위 유전체2, 각 두께 d, 극판 간격 2d). 두 영역의 ★전계가 서로 다름 → E_1·E_2(|E_1|·|E_2|)를 각각 구함★. 비는 ★두께비★. → interpretation에 "적층/직렬/위아래로 쌓임"·"E_1·E_2 각각"·두께비를 명시.
      ▸ ★병렬(나란히)★: 유전체 2개가 극판 사이를 ★좌우로 나란히★ 채움. 두 영역 전계 같음(E_z 하나). 비는 ★부피비(면적비)★. → interpretation에 "나란히/병렬"·부피비를 명시.
      원본이 적층(위아래·2d·E_1/E_2 각각)이면 "나란히/병렬"로, 나란히면 "적층/직렬"로 뒤바꿔 요약하지 마라.
    · ★★전위 분포 하위구조(구하는 대상이 다름) 반드시 구분·보존★★ — 두 유전체 적층 커패시터라도 "전하·정전용량"이 아니라 ★각 유전체 영역의 전위 V(z)★를 구하는 유형이 있다(임용 24번형). 신호: 각 영역 전계가 ★비율로 주어짐★(예: E_1=E₀a_z, E_2=2E₀a_z, E₀는 상수) + ★경계면 전위가 주어짐★(예: z=0에서 0mV, z=3mm에서 100mV) + ★구하는 것이 각 영역의 전위 V(z)[mV]의 z 1차식★(E_z=−dV/dz 적분). → ★전하 ±Q·표면전하밀도·정전용량 C_d·두께 d 역산 구조 아님★. 반드시 보존: "적층 두 유전체"·"E_1=E₀a_z·E_2=k·E₀a_z(전계 비율)"·"경계 전위(z=0·z=상단)"·"각 유전체 영역의 전위 V(z)"·"전계의 적분/E_z=−dV/dz"·두께(mm). interpretation·relatedConcepts에 "전위 V(z)를 전계의 적분으로 구함"·"각 영역 전위"를 명시. topic을 "정전용량"·"전하량"·"두께 계산"으로 요약 금지.
  · ★동축 원통(도전율 σ 물질)의 두 도체 사이 저항★: 내부 도체(반경 a)·외부 도체(내경 b)·길이 L인 ★동축 원통★ 사이 공간에 ★도전율 σ인 (도전성) 물질★이 채워지고, 두 도체 사이의 ★저항 R★을 [1]전류밀도 J=I/(2πρL) [2]전계 E=J/σ·전압 V₁=∫E dρ [3]R=V₁/I 로 구하는 유형. → ★동축 케이블 "정전용량"(유전율 ε·C=2πεL/ln(b/a)) 아님★(유전체가 아니라 도전율 σ 물질, 정전용량이 아니라 저항). 반드시 보존: "도전율 σ"·"두 도체 사이의 저항 R"·"전류 밀도 J"·"전계 E"·a·b·L·원통 좌표계(ρ,φ,z)·해석 절차 3단계. topicKey=current_conduction. topic을 "동축 케이블 정전용량"·"유전율"로 요약 금지.
  · 정자계: "직선 도선 자기장"(B=μ₀I/2πr), "솔레노이드"(B=μ₀nI), "토로이드/환상 솔레노이드"(B=μ₀NI/2πr), "앙페르 법칙"
  · ★면전류 + 선전류 합성 자계 → h·k 도출★: ★무한 면전류★(예: K a_x [A/m]가 xy면과 평행한 무한 평면 z=z_s에 흐름)와 ★무한 선전류★(예: I a_x [A]가 (0,y_L,0)을 지나 x축과 나란한 무한 도선에 흐름)가 ★함께★ 주어지고, 점 P(p_x,p_y,h)에서 "면전류에 의한 자계 H₁"과 "선전류에 의한 자계 H₂"의 ★합성 자계 H₁+H₂ = k a_z [A/m]★가 되기 위한 미지 h·k(또는 선전류 세기 I·k)를 해석 절차에 따라 구하는 유형. → ★단순 직선 도선 자기장(B=μ₀I/2πr) 아님★(전류원 2개=면전류 시트 + 선전류, 합성·단위벡터 성분 소거가 핵심). 반드시 보존: "면전류"(K a_x, 무한 평면, z=z_s)·"선전류"(I a_x, (0,y_L,0), x축 나란)·"합성 자계 H₁+H₂ = k a_z"·점 P 좌표·미지 h(0<h<z_s)·단위 벡터 a_x/a_y/a_z·해석 절차 3단계([1]H₁ [2]H₂를 h 포함 식 [3]h·k). topicKey=magnetostatics. topic을 "직선 도선 자기장"·"선전하 전기장"으로 요약 금지.
  · ★두 원형 전류 루프의 축상 자계 합성 → 전류 I 도출★: ★원형 루프(원형 도선) 2개★(예: C₁·C₂)가 z축 위에 놓이고 각각 전류가 흐를 때(반시계/시계 방향), 어떤 점 P(대개 한 루프의 중심 = 다른 루프의 축 위)에서 "C₁에 의한 자계 H₁"과 "C₂에 의한 자계 H₂"의 ★합성 자계 H₃ = (값)a_z★가 되는 미지 전류 I를 해석 절차에 따라 구하는 유형. → ★면전류·선전류 유형 아님(무한 평면·무한 직선 도선 없음), 단순 직선 도선 자기장(B=μ₀I/2πr)도 아님★. 반드시 보존: "원형 루프/원형 도선"(2개)·각 반지름·전류 방향(반시계/시계)·"중심/축상"·"합성 자계 H₃"·미지 전류 I·해석 절차 3단계([1]H₁ [2]H₂ [3]합성=목표 되는 I). 원형 루프 자계 공식(중심 I/2R, 축상 I·R²/2(R²+z²)^{3/2}). topicKey=magnetostatics. topic을 "면전류·선전류"·"직선 도선 자기장"으로 요약 금지.
  · ★자속밀도 given → 면 벡터·자속·가우스 법칙(삼각기둥)★: ★자속 밀도 B★가 좌표 벡터식(예: B=3aₓ−7a_y−2a_z [Wb/m²])으로 ★주어지고★, 3D 도형(밑면 정사각형 oabc·삼각면·경사면 bced를 갖는 삼각기둥, 꼭짓점 o·a·b·c·d·e)의 각 면에 대해 [1]삼각면의 "면 벡터"와 그 면을 "통과하는 자속" [2]사각면의 자속 [3]"가우스 법칙"으로 경사면 bced의 자속을 구하는 유형. → ★자기장 세기 B=μ₀I/… 유형 아님, 무한 선전하(전기장)·점전하도 아님★(전기장이 아니라 자속밀도, 도선·전류 없음). 반드시 보존: 자속밀도 벡터식 원문(aₓ·a_y·a_z 성분), "면 벡터"·"자속"·"경사면"·"삼각면"·"사각면"·"가우스 법칙", 꼭짓점 좌표, 해석 절차 3단계. topicKey=magnetostatics. topic을 "직선 도선 자기장"·"선전하 전기장"으로 요약 금지.
  · ★정사각형 폐경로 선적분 → 면적 극한 → 자계의 회전 ∇×H★: 자유 공간에 ★자계 H가 좌표의 함수로 주어지고★(예: H=20x²a_z [A/m]), ★한 변의 길이가 ℓ인 정사각형 abcd★(중심 좌표 (x₀,0,0))에 대해 [1]정사각형 폐경로 a-b-c-d-a를 따라 ★∮H·dl [A]★ [2]그 값을 면적으로 나눈 ★∮H·dl/S [A/m²]★와 ★면의 방향 단위 벡터 a_n★ [3]특정 x₀에서 ★∇×H(회전, 암페어 법칙의 미분형) [A/m²]★를 구하는 유형. → ★단순 직선 도선 자기장(B=μ₀I/2πr) 아님★(도선·전류가 없고 자계 H가 좌표 함수로 직접 주어짐), ★면전류·선전류 합성 자계도 아니고 자속밀도 삼각기둥 면벡터·가우스 법칙(∮B·dS)도 아님★(면적분이 아니라 ★폐경로 선적분★, 구하는 것은 자속이 아니라 ★회전★). 반드시 보존: 자계식 원문(계수·지수·방향 단위벡터, 예 20x²a_z)·"정사각형 abcd"·"한 변의 길이 ℓ"·"중심 좌표 (x₀,0,0)"·"경로 a-b-c-d-a"·"∮H·dl"·"면적 S로 나눔"·"단위 벡터 a_n"·"∇×H"·x₀ 수치·해석 절차 3단계. topicKey=magnetostatics(★반드시 전자기학 — mixed_signal·회로로 요약 금지★). topic을 "직선 도선 자기장"·"자속·가우스 법칙"·"회로 해석"으로 요약 금지.
  · 인덕턴스: "자기/자체 인덕턴스"(솔레노이드 L=μ₀N²A/l), "자기 에너지 U=½LI²", "상호 인덕턴스"(두 코일 M=μ₀N₁N₂A/l, 상호유도 ε₂=M·dI₁/dt)
  · 전자기 유도: "운동 기전력"(ε=BLv, ★도체봉이 이동★), "패러데이 법칙", "유도 전류"
  · ★시변 자속 관통 고정 도체 루프 + 저항 → 쇄교 자속 Φ(t)·유도 전류 i(t)★: ★고정된 ㄷ자/사각형 완전 도체 루프★의 단자 a-b에 ★저항 R★이 연결되고, ★시간에 따라 변하는 자속밀도 B(t)(예: B=sin(t)a_x [Wb/m²])★가 루프를 수직으로 관통할 때, [1]회로에 쇄교하는 자속 Φ(t)=B(t)·A [2]패러데이 법칙 ε=−dΦ/dt로 유도 기전력 [3]저항 전류 i(t)=ε/R 를 순서대로 구하는 유형. → ★운동 도체봉(ε=BLv, 도체봉·레일이 이동) 아님★(루프·저항 모두 고정, B만 시간에 따라 변함 = 변압기 기전력. 문제에 "운동 기전력은 무시한다"가 명시됨). 반드시 보존: "쇄교 자속 Φ(t)"·"시변/시간에 따라 변하는 자속밀도 B"(sin(t) 등)·"완전 도체 루프(ㄷ자)"·"단자 a-b 저항 R"·"저항에 흐르는 전류 i(t)"·"운동 기전력 무시"·루프 한 변 길이·해석 절차 3단계([1]Φ(t) [2]ε=−dΦ/dt [3]i(t)). topicKey=em_induction. topic을 "운동 기전력 ε=BLv"·"도체봉"으로 요약 금지(★핵심: 저항이 존재하고 루프가 고정임★).
  · 자기력: "전류 도선의 힘"(F=BIL), "로렌츠 힘"
  · 전자기파: "전자기파", "맥스웰", "광속 c", "파장 λ=c/f", E=cB
  · ★전위 함수→체적 전하 밀도(벡터 미적분)★: 전위가 좌표 함수 V(x,y,z)=식(예: ½x²yz)로 주어지고 점 P에서 "체적 전하 밀도 ρ_v"를 구하는 유형 → ★단순 점전하(kQ/r²) 아님★. 반드시 보존: 전위 함수식 V(x,y,z) 원문, 점 P 좌표, "체적 전하 밀도"·"ρ_v", 해석 절차 3단계([1]V_P [2]E=−∇V·등전위면 수직 단위벡터 a_E [3]ρ_v=∇·D=−ε₀∇²V), "라플라시안/발산/기울기". topic을 "점전하 전기장"으로 요약 금지.
  · ★전계 given → 전위차 + 전기력선 총수 → 미지 L 도출★: ★전계(전기장) E★가 좌표·미지수 L의 함수(예: E=8(y−L)â_y + 4z â_z)로 ★주어지고★, 세 점 P·Q·R 사이 "전위차 V_RP·V_QR·V_QP"와 "평면 S를 통과하는 전기력선의 총수(= 값)"로 파라미터 L을 구하는 유형. → ★전위함수 V(x,y,z)→전하밀도 유형과 다름★(여기선 V가 아니라 E가 주어지고 체적 전하 밀도가 아니라 L을 구함), 단순 점전하도 아님. 반드시 보존: 전계식 E 원문(미지 L 포함), 세 점 좌표 P·Q·R, "전위차"·"V_QP", "평면 S"·면적, "전기력선의 총수 = 값", 단위 벡터 â_y/â_z, 해석 절차 3단계([1]V_RP·V_QR [2]V_QP [3]전기력선 총수로 L). topic을 "점전하"·"전위 함수로부터 전하밀도"로 요약 금지.
- 주어진 값(전하량 μC/nC, 거리 cm, 전류 A, 자속밀도 T, 면적 cm², 권선수 N 등)을 fillInTheBlanks·interpretation에 그대로 보존.
- semantic 4-flag은 모두 false (정적 장·공식, 상태천이·과도·등가변환·다중figure 아님).
`;

/**
 * C언어 전용 추출 규칙 — 회로가 아니라 코드 분석·출력 예측 문제임을 보존.
 * 지문 C 코드와 구하는 대상(출력·변수값)을 interpretation·relatedConcepts·fillInTheBlanks에 정확히 담게 강제.
 */
const C_LANGUAGE_EXTRACTION_RULES = `
【C언어 추출 절대 규칙 (회로 아님)】
- 이 문제는 회로(netlist)가 아니라 ★C 프로그래밍 코드 분석/출력 예측 문제★다. componentInventory·topologySignature는 비워라(빈 배열/false). 억지로 R·C·L 소자를 만들지 마라.
- ★지문의 C 코드 전체를 interpretation에 최대한 그대로 보존★하라 (변수 선언·반복문·포인터·함수 정의 포함). 코드가 곧 문제다.
- topic·relatedConcepts에 ★어떤 문법 개념★인지 반드시 보존: 포인터·배열·주소 연산, 제어문(for/while/if)·반복, 함수·재귀 호출·스택 프레임, 구조체·공용체·비트 연산(&|^~<<>>), 문자열·문자 배열, 연산자 우선순위·형변환·증감연산자.
- 구하는 대상(표준출력 결과 / 특정 변수의 최종 값 / 반환값)을 interpretation에 명시하라.
- semantic 4-flag은 모두 false (코드 분석 — 상태천이·과도·등가변환·다중figure 아님). topicKey는 c_output_prediction·c_pointer_array·c_control_flow·c_function_recursion·c_struct_bitwise·c_string 중 하나.
`;

/**
 * 통신 전용 추출 규칙 — 회로가 아니라 신호·변조·정보이론 문제임을 보존.
 */
const COMMUNICATIONS_EXTRACTION_RULES = `
【통신 추출 절대 규칙 (회로 아님)】
- 이 문제는 회로(netlist)가 아니라 ★통신 이론(신호·변조·정보이론) 문제★다. componentInventory·topologySignature는 비워라(빈 배열/false).
- topic·interpretation·relatedConcepts에 ★어떤 통신 개념·공식★인지 반드시 보존:
  · 아날로그 변조: AM(변조지수 m=Am/Ac)·FM(주파수편이 Δf·변조지수 β=Δf/fm)·PM, 대역폭(카슨 법칙 B=2(Δf+fm))
  · 디지털 변조: ASK·FSK·PSK·QAM, 심볼율·비트율·대역폭 효율
  · 표본화·양자화: 나이퀴스트 표본화율(fs≥2fmax)·PCM·양자화 잡음·비트수 n·SQNR
  · 정보이론: 엔트로피 H=−Σp·log₂p·정보량·채널용량 C=B·log₂(1+S/N)·부호화
  · 신호·스펙트럼: 푸리에 급수/변환·대역폭·전력/에너지 스펙트럼
  · 잡음·SNR: 열잡음·잡음지수·SNR(dB)·오류확률(BER)
- 주어진 수치(주파수 Hz·kHz, 진폭, 전력 W·dBm, SNR dB, 비트수, 확률 등)를 fillInTheBlanks·interpretation에 그대로 보존.
- 원본에 파형/스펙트럼/블록도 그림이 있으면 그 형태(시간영역 파형/주파수 스펙트럼/송수신 블록도)를 interpretation에 명시.
- semantic 4-flag은 모두 false (공식·계산 문제). topicKey는 comm_analog_modulation·comm_digital_modulation·comm_sampling_pcm·comm_information_theory·comm_signal_spectrum·comm_noise_snr 중 하나.
`;

/**
 * 교육학(교직) 전용 추출 규칙 — 회로가 아니라 교육 이론·논술형 문제임을 보존.
 */
const PEDAGOGY_EXTRACTION_RULES = `
【교육학(교직) 추출 절대 규칙 (회로 아님)】
- 이 문제는 회로(netlist)·수식 도식·코드가 아니라 ★교육학(교직) 이론·논술형 문제★다. componentInventory·topologySignature는 비워라(빈 배열/false). 억지로 R·C·L 소자나 그림을 만들지 마라.
- topic·interpretation·relatedConcepts에 ★어떤 교육학 영역·이론·학자★인지 반드시 보존:
  · 교육심리: 피아제·비고츠키(ZPD·비계설정)·브루너(발견학습)·에릭슨·콜버그(도덕성 발달)·동기이론(매슬로·데시-라이언 자기결정성·귀인)
  · 교육과정: 타일러 목표모형·브루너 나선형·백워드 설계(위긴스-맥타이)·잠재적/영 교육과정·교육과정 유형
  · 교육평가: 진단/형성/총괄평가·규준참조/준거참조·타당도·신뢰도·문항분석(난이도·변별도)
  · 교육방법·공학: ADDIE·가네 9사태·구성주의·협동학습·프로젝트/문제중심학습·에듀테크·블렌디드러닝
  · 교육행정: 과학적 관리·인간관계론·지도성(변혁적/서번트)·장학·의사결정·교육법규·정책
  · 교육사회학: 기능론·갈등론·재생산이론(부르디외 문화자본·번스타인)·신교육사회학
  · 교육철학·교육사: 항존주의·본질주의·진보주의·재건주의·실존주의·포스트모더니즘·동서양 교육사
  · 생활지도·상담: 정신분석·행동주의·인간중심(로저스)·인지행동·현실치료·상담기법
- 제시문(교육 현장 사례·대화·이론 서술)과 발문(설명하라·비교하라·적용하라·서술하라)을 interpretation에 그대로 보존.
- semantic 4-flag은 모두 false (개념·서술형 — 상태천이·과도·등가변환·다중figure 아님). topicKey는 ped_psychology·ped_curriculum·ped_evaluation·ped_method_tech·ped_administration·ped_sociology·ped_philosophy_history·ped_counseling 중 하나.
`;

function subjectExtractionRules(subject: SubjectKey): string {
  if (subject === "electromagnetics") return EM_EXTRACTION_RULES;
  if (subject === "c_language") return C_LANGUAGE_EXTRACTION_RULES;
  if (subject === "communications") return COMMUNICATIONS_EXTRACTION_RULES;
  if (subject === "pedagogy") return PEDAGOGY_EXTRACTION_RULES;
  return "";
}

/** 비회로 과목(전자기학·C언어·통신·교육학) 전용 슬림 프롬프트.
 *  회로 전용 섹션(topologySignature·figureRequirements·노드 annotation·archetype 추출 규칙 수십 개)을
 *  전부 생략 → ~25k → ~3k 토큰. OpenAI TPM(분당 토큰) 429 회피 + 속도·비용 대폭 절감.
 *  회로가 아니므로 그 규칙들은 애초에 무의미. 출력 구조는 structured-output 스키마가 강제한다. */
function buildSlimPrompt(subject: SubjectKey): string {
  const topicEnum = (TOPICS_BY_SUBJECT[subject] as readonly TopicKey[]).join(" | ");
  return `당신은 전자임용(중등 정보·전자) 출제·해설 전문가입니다.
첨부된 임용 기출 문제 이미지를 분석해 structured-output JSON 스키마에 맞춰 응답하세요.

[과목] ${SUBJECT_LABEL[subject]} (${subject})
[과목 힌트] ${SUBJECT_HINT[subject]}
[유효 TopicKey 목록] ${topicEnum}
${subjectExtractionRules(subject)}

【출력 지침】 — ★ 이 과목은 회로가 아니다 ★ → 회로 소자·토폴로지·노드·figure 배선은 추출하지 않는다.
- topic: 문제의 주제 (한 줄, 25자 이내).
- interpretation: 문제 상황·구하는 미지수·해석 흐름 (한국어 3~5문장). ★ 원본에 나온 수식·값·단계·기호를 빠짐없이 보존 (예: 전위차 V_BA·등전위·일 W, 좌표·단위벡터, 코드·신호 파라미터, 이론·학자).
- relatedConcepts: 관련 핵심 개념·법칙·공식 5~8개 (각각 짧은 명사구).
- fillInTheBlanks: 핵심 개념 문장 5개 (빈칸은 ____ 로 표기 + 정답).
- topicKey: 위 [유효 TopicKey 목록] 중 가장 적합한 하나.
- semantic: 회로가 아니므로 4개 flag 모두 false 가능 (hasStateTransition·hasEquivalentTransformation·hasWaveformEvolution·requiresMultiFigure).
- signals.inputs/outputs: 해당 없으면 빈 배열.
- topologySignature·figureRequirements·nodeAnnotations 등 회로 전용 필드는 비운다(스키마 필수면 최소 구조로).
JSON만 출력한다.`;
}

function buildPrompt(subject: SubjectKey): string {
  // ★ 비회로 과목은 슬림 프롬프트 (회로 전용 규칙 전부 생략 → 토큰 ~1/8).
  const NON_CIRCUIT = new Set(["electromagnetics", "c_language", "communications", "pedagogy"]);
  if (NON_CIRCUIT.has(subject)) return buildSlimPrompt(subject);

  const topicEnum = (TOPICS_BY_SUBJECT[subject] as readonly TopicKey[]).join(" | ");
  return `당신은 전자임용(중등 정보·전자) 출제·해설 전문가입니다.
첨부된 임용 기출 문제 이미지를 분석해 다음 JSON 스키마에 맞춰 응답하세요.

🚫 ★ 1주차 refactor 절대 규칙 (2026-05-31) ★ 🚫
다음 필드는 ★ schema에서 제거됨 ★ — 절대 결정하거나 추출하지 마라. 코드(Topology Recovery)가 자동 도출한다:
  - topologySignature.family       (rl_circuit / parallel_rlc / ac_analysis 등 분류 라벨)
  - topologySignature.branches     (branch 배열 자체)
  - branches[].role                (voltage_source_leg / load_leg 등 의미 라벨)
  - branches[].betweenNodes        (노드 매핑 ["n_a","GND"] 등)
GPT의 역할은 ★ 관측(observation) ★ 만:
  - components (componentInventory에 type·value)
  - signals·semantic·fillInTheBlanks·nodeAnnotations·topic·interpretation
  - topologySignature.features (boolean flags) — 가능하면 채움, 누락 OK
아래 prompt 안에 "branches·family·role·betweenNodes 예시"가 등장하더라도 ★ 모두 무시 ★ 하고 위 4 필드는 절대 출력하지 마라.

★ 다이아몬드(◇) 기호는 ★종속 전원★이다(원 ○ = 독립). 종속원이 보이면 features.hasDependentSource=true로
  하고 interpretation에 "종속 전원"과 제어식(예 2i_x)을 명시하라. 소자값이 문자(a·2a)면 수치로 바꾸지 마라.
  ※ 소자 추출(componentInventory) 자체는 별도 단계가 담당한다 — 여기서는 위 두 가지만 반영.

[과목] ${SUBJECT_LABEL[subject]} (${subject})
[과목 힌트] ${SUBJECT_HINT[subject]}
[유효 TopicKey 목록] ${topicEnum}
${subjectExtractionRules(subject)}

【출력 JSON 스키마】
{
  "topic": "문제의 주제 (한 줄, 25자 이내)",
  "interpretation": "문제 상황·구하는 미지수·해석 흐름의 한국어 해석 (3~5문장)",
  "relatedConcepts": ["관련 핵심 개념·법칙·공식 5~8개 (각각 짧은 명사구)"],
  "fillInTheBlanks": [
    { "sentence": "핵심 개념 문장 — 빈칸은 ____ 로 표기", "answer": "____에 들어갈 정확한 단어/공식" }
  ],
  "topicKey": "위 [유효 TopicKey 목록] 중 가장 적합한 하나",
  "semantic": {
    "hasStateTransition": boolean,           // FSM·플립플롭·카운터·순차논리·상태변화
    "hasEquivalentTransformation": boolean,  // 테브난·노턴·소스변환·등가회로
    "hasWaveformEvolution": boolean,         // RC/RL 과도응답·스위칭·타이밍·파형
    "requiresMultiFigure": boolean           // 회로도 외 추가 그림 필요 (kmap/waveform/state쌍 등)
  },
  "signals": {
    "inputs":  string[],
    "outputs": string[]
  },
  "figureRequirements": [
    {
      "role":         "kmap" | "truth_table" | "implementation_circuit" | "waveform" | "state_diagram" | "equivalent_circuit" | "main_circuit",
      "diagramType":  "kmap" | "truth_table" | "logic_network" | "waveform" | "analog_netlist" | "concept_diagram",
      "scope":        "per_output" | "combined" | "per_state" | "single",
      "targets":      string[]  // 옵셔널. per_output·combined일 때 적용 변수명 (없으면 signals.outputs)
      "states":       string[]  // 옵셔널. per_state일 때
      "required":     boolean
    }
  ],
  "topologySignature": {
    // ★ 회로 위상 시그니처 — circuit_theory/electronics에서 필수
    // branches는 직렬 chain 단위 (vertical leg 또는 top rail R 1개씩)
    "subjectKey": "digital_logic" | "circuit_theory" | "electronics",
    "family":      string,
    "features": {
      "hasSwitch":          boolean,
      "hasDependentSource": boolean,
      "hasGround":          boolean,
      "hasSupermesh":       boolean,
      "hasMesh":            boolean,
      "hasStateTransition": boolean,
      "meshCount":          number   // 원본 mesh 개수 (supermesh면 ≥2)
    },
    "branches": [
      // 각 branch.role enum:
      //   voltage_source_leg / current_source_leg / dependent_source_leg
      //   switching_leg / load_leg
      //   shared_supermesh_branch / mesh_only_branch
      //   top_rail_resistor / bottom_rail_wire
      //
      // 한 branch에 직렬로 여러 component가 있으면 components 배열에 모두 (예: SW+R+I 직렬 vertical leg)
      //
      // ★ betweenNodes: mesh ≥ 3 또는 평행 가지 있을 때 **반드시** 명시.
      //   - horizontal: ["좌측node", "우측node"]
      //   - vertical:   ["상단node", "GND"]
      //   - 같은 노드 쌍에 여러 branch면 자동으로 평행 가지 (mesh +1).
      //   - 미지정 시 branches 순서대로 자동 배치 (3-mesh 이하 단순 ladder에만 OK).
      { "role": "voltage_source_leg",   "components": [{ "type": "V", "value": "10V" }], "betweenNodes": ["n_left", "GND"] },
      { "role": "dependent_source_leg", "components": [{ "type": "VCVS", "value": "0.2V2" }], "betweenNodes": ["n_left", "GND"] },
      { "role": "switching_leg",        "components": [
        { "type": "SW" }, { "type": "R", "value": "10Ω" }, { "type": "I", "value": "1A" }
      ], "betweenNodes": ["n_mid", "GND"] },
      { "role": "top_rail_resistor",    "components": [{ "type": "R", "value": "10Ω" }], "betweenNodes": ["n_left", "n_mid"] },
      { "role": "top_rail_resistor",    "components": [{ "type": "R", "value": "10Ω" }], "betweenNodes": ["n_mid", "n_right"] },
      { "role": "mesh_only_branch",     "components": [{ "type": "I", "value": "0.5A" }], "betweenNodes": ["n_mid", "n_right"] }
      // ↑ 마지막 두 branch는 n_mid·n_right 사이에 평행 가지 → 한 mesh 추가
    ]
  },
  "structureSignature": {
    // universal — 모든 과목 공통
    "subjectKey": "digital_logic" | "circuit_theory" | "electronics",
    "family":      "kmap_sop" | "supermesh" | "bjt_amplifier" | ...,  // TopicKey와 동일
    "signals":     { "inputs": ["A","B","C"], "outputs": ["X","Y"] },
    "figureRequirements": [
      { "role": "kmap", "diagramType": "kmap", "scope": "per_output", "targets": ["X","Y"], "required": true },
      { "role": "implementation_circuit", "diagramType": "logic_network", "scope": "combined", "targets": ["X","Y"], "required": true },
      { "role": "main_circuit", "diagramType": "analog_netlist", "scope": "single", "required": true },
      { "role": "equivalent_circuit", "diagramType": "analog_mesh_network", "scope": "per_state", "states": ["switch_open","switch_closed"], "overlays": ["supermesh_boundary"], "required": false }
    ],
    "componentCounts":  { "R": 5, "V": 1, "I": 1, "VCVS": 1, "SW": 1 },   // analog일 때
    "gateCounts":       { "NOT": 3, "AND": 4, "OR": 2 },                  // digital일 때
    "requiredFeatures": {
      "hasSwitch":          boolean,   // 스위치 포함 (analog)
      "hasDependentSource": boolean,   // 종속전원 (analog)
      "hasSupermesh":       boolean,   // supermesh 해석 (analog)
      "hasMesh":            boolean,   // mesh 해석 (analog)
      "hasKmap":            boolean,   // 카르노맵 (digital)
      "hasWaveform":        boolean,   // 파형 (digital/analog)
      "hasBlankGate":       boolean,   // ⓐⓑ 빈칸 (digital)
      "hasStateTransition": boolean    // FSM·플립플롭 등 (digital/analog)
    },
    "topologyHints": {
      "meshCount":   number,  // analog mesh 개수
      "nodeCount":   number,
      "branchCount": number,
      "outputCount": number,
      "inputCount":  number
    },
    // legacy 유지 (호환성)
    "inputCount":              number,
    "outputCount":             number,
    "figureCount":             number,
    "totalComponentCount":     number,
    "totalGateCount":          number,
    "blankCount":              number
  }
}

【규칙】
- JSON 객체 하나만 출력. 코드펜스·설명 텍스트 금지.
- fillInTheBlanks는 정확히 5개.
- relatedConcepts는 5~8개.
- topicKey는 반드시 [유효 TopicKey 목록] 중 하나만. 그 외 값(예: SubjectKey 그대로, 자유 문자열) 금지.
- semantic의 4개 boolean은 이미지에서 판단된 사실 기반.
- ★ hasWaveformEvolution=true는 **시간영역 파형이 figure로 그려져 있거나 학생이 파형을 그리는 문제**에 한정.
  symbolic·해석적 문제(전달함수 H(s)·β(s) 도출, Barkhausen 발진 조건 1-Kβ(s)=0, 폐루프 극점, 주파수 응답 도출 등)는
  RC/LC가 있어도 hasWaveformEvolution=false. 학생이 도출하는 게 **수식·조건**이지 **파형 그림**이 아님.
  · 키워드 기준: "발진 조건", "Barkhausen", "β(s)", "전달함수", "특성방정식", "1-Kβ(s)=0",
    "오실레이터", "안정한 선형영역에서 동작" — 이 중 하나라도 보이면 hasWaveformEvolution=false.
  · 단, "v_o(t)를 그려라"·"파형을 도시하라"는 문구가 있으면 다시 true.
- ★ OPAMP 오실레이터 (예: Wien Bridge, phase-shift, Colpitts/Hartley 변형) 인식 시:
  topicKey는 "opamp", interpretation에 "오실레이터·발진 조건" 명시. semantic.requiresMultiFigure=true
  (회로도 + 블록도 두 figure). 음피드백 저항(R_3)은 V−↔V_out **직접 2-pin** 저항으로 명시
  (β(s) 망 안에 묻지 마라 — validator의 OPAMP feedback 검사가 단일 component만 인식).
- ★★ 비정현파 발진기(함수 발생기) 인식 — ★정현파 발진기(Wien/위상천이)와 반드시 구분★:
  두 OPAMP가 **비교기(슈미트 트리거) + 적분기**로 구성되고 피드백 루프로 발진하는 회로(한 OPAMP 출력이
  구형파(가), 다른 OPAMP가 적분기로 삼각파(나)를 냄). 특징: 한 OPAMP는 (−)접지 + 저항 분압 정귀환(비교기),
  다른 OPAMP는 **커패시터 피드백(적분기)**. → 이건 **비정현파(구형파·삼각파) 발진기**이지 정현파 발진기(Wien·위상천이)가
  ★아님★, 단순 반전증폭기 캐스케이드도 ★아님★(독립 입력전원 없음 — 발진기라 외부 입력 없이 자기발진).
  반드시 interpretation·relatedConcepts에 보존: "비정현파 발진기(함수 발생기)"·"비교기(슈미트 트리거)→구형파"·
  "적분기→삼각파"·"두 출력 (가)구형파·(나)삼각파"·"피드백 루프"·"발진 주파수". topic을 "단순 발진 회로"·"신호 증폭"·
  "정현파 발진기"·"반전증폭기"로 뭉뚱그리지 마라. 커패시터(적분기 피드백)를 누락하지 마라.
- signals.outputs는 문제에서 묻는 모든 출력 변수를 빠짐없이 포함 (multi-output이면 ["Y","Z"] 등 모두).
- signals.inputs도 문제에 등장하는 모든 입력 변수를 포함.
- 변수명은 원문 그대로 (예: V_o, Q_D, Z, A 등 대소문자·아래첨자 유지).
- 원본 회로에 ⓐ·ⓑ·㉠·㉡ 같은 빈칸 게이트가 있으면:
  · structureSignature.blankCount = distinct symbol 개수 (예: ⓐ, ⓑ → 2). 같은 symbol을 여러 게이트가 공유하면 하나로 카운트.
  · structureSignature.gateCounts에도 그 빈칸 게이트를 정답 type으로 포함해서 카운트.
  · interpretation에도 "(나) 회로에 ⓐ, ⓑ 두 자리에 들어갈 게이트를 묻는 형식" 명시.
- structureSignature는 반드시 정확히 카운트:
  · 디지털논리: gateCounts (NOT/AND/OR/NAND/NOR/XOR/XNOR 각 종류별 개수)와 totalGateCount, productTermGateCount(SOP의 AND term 수), outputCombinerGateCount(출력 결합 OR 수), sharedTermCount(출력간 공유 product term)
  · 회로이론·전자회로: componentCounts (R/V/I/L/C/SW 등 각 종류별 개수), totalComponentCount
  · 둘 다 inputCount/outputCount/figureCount 필수
  · 빈 게이트(ⓐ·ⓑ 같은 placeholder)도 카운트에 포함 (학생이 채울 자리도 게이트로)
- figureRequirements는 원본에 보이는 모든 figure를 반영:
  · 출력별 K-map(예: X용·Y용 따로) → role="kmap", diagramType="kmap", scope="per_output", targets=["X","Y"]
  · 멀티출력 통합 회로 → role="implementation_circuit", diagramType="logic_network", scope="combined", targets=signals.outputs
  · 스위치 t<0/t>0 등가회로 → role="equivalent_circuit", scope="per_state", states=["before","after"]
  · 단일 회로 → scope="single", required=true
- required=true가 디폴트. 누락 가능한 보조 figure만 false.
- 모든 한국어. 단, 공식·기호·키 값은 원문 그대로.
- 추측 금지. 이미지에 없는 정보는 만들지 않는다.

【annotation 추출 — circuit_theory/electronics 회로 한정】
원본 회로 이미지에 다음 요소가 있으면 JSON에 별도 필드로 반드시 추출 (interpretation에만 적지 마라 — 코드가 이걸 읽어 generator에 전달):

  "nodeAnnotations": [
    { "node": "<node_id>", "label": "a", "style": "terminal_dot" },
    { "node": "<node_id>", "label": "b", "style": "terminal_dot" }
  ],
  "loadPlaceholders": [
    { "betweenNodes": ["<node_a>", "<node_b>"], "label": "R_L", "emphasize": true }
  ]

- 단자 라벨 (a, b, x, y 등) — 회로 위에 ● 표시 + 알파벳으로 표시된 측정점/등가 단자. 발견되면 nodeAnnotations 배열에 entry 추가, style="terminal_dot".
- 부하 placeholder (R_L, Z_L 등) — 비어 있는 점선 박스나 "?" 자리. 발견되면 loadPlaceholders 배열에 entry 추가, emphasize=true. 두 단자 node id를 betweenNodes에 명시.
- ★ 노드 전압 라벨 (V_1, V_2, V_3, V_o, V_x 등) — 회로 다이어그램에 명시된 측정 노드 라벨. 발견되면 nodeAnnotations 배열에 entry 추가, label은 정확한 라벨 그대로 ("V_1" 또는 "V_3" 등), style="label_only". 학생이 풀어야 할 query의 핵심이므로 누락 금지.
  · 라벨 번호가 V_1, V_3 같이 띄엄띄엄이어도 모두 추출 (V_2 없는 게 정상일 수 있음).
  · 노드의 attach 정보는 topologySignature.branches와 정합: V_n은 보통 어떤 vertical leg 또는 horizontal 위치의 top node.
  · 가변 저항이 vertical로 매달려 있고 그 top node가 V_1이면, nodeAnnotations에 {node:"<해당 node id>", label:"V_1", style:"label_only"} 추가.
- 가변 저항 (variable R, R 조정 문제) — 점선 박스가 없어도 "R" 라벨만 있는 vertical R이 있고 문제 본문에 "R 조정"·"가변" 언급이 있으면, loadPlaceholders에 {betweenNodes:[<top>, <bot>], label:"R", emphasize:true} 추가.
- "단자 a-b를 개방"·"R_L에 최대 전력 전달"·"V_ab를 구하시오" 같은 문제 유형 — 단자/부하 추출이 핵심. interpretation에도 명시.
- 위 두 필드는 풀이의 정답 단자/부하 위치 결정에 핵심 — 빠뜨리지 마라.

【topologySignature 추출 가이드 — circuit_theory/electronics 회로 한정】
회로의 visual 구조를 다음 두 패턴 중 어느 쪽인지 먼저 판별하고 branches를 추출:

  (1) Ladder topology (단순 mesh 1개):
      top rail에 R 직렬, vertical leg 2개(좌·우)에서 V/I source가 ground로 떨어짐.
      branches = [voltage_source_leg, current_source_leg, top_rail_resistor × N]
      meshCount = 1, hasSupermesh = false

  (2) Supermesh / multi-leg topology (mesh ≥ 2):
      top rail R 위에 vertical leg가 2개 초과로 박혀있음.
      각 vertical leg는 단일 source뿐만 아니라 SW + R + I 같은 직렬 chain일 수도 있음 (이 chain이 한 통째로 한 leg).
      그런 leg가 SW + R + I 형태면 role = "switching_leg", components = [{type:SW},{type:R},{type:I}].
      두 mesh가 공유하는 vertical chain (SW+R+I)이 supermesh를 만듦.
      meshCount ≥ 2, hasSupermesh = true (점선 표시 등으로 명시되면)

★ 헷갈리기 쉬운 case ★
  - Vertical에 SW만 보고 "switching_leg" components=[SW] 라고 하면 안 됨. 그 SW와 ground 사이에 다른 component가 있는지 (R, I 등) 반드시 트레이스해서 직렬 chain 전체를 한 branch로 묶을 것.
  - ★ V_source가 vertical인지 horizontal인지 신중히 판별 (Thevenin/dc_resistive 문제에선 horizontal V가 흔함):
    · **horizontal V (top rail series)**: V 기호가 두 R 사이 또는 두 top node 사이의 **가로 wire** 안에 끼어 있고, +/- 마크가 좌우(left/right)에 표시. 예: ─[R]─⊕V─[R]─. 이 V는 role="mesh_only_branch"로 분류하고 components=[{type:"V", value:"7V"}].
    · **vertical V (leg)**: V 기호가 top node와 GND를 잇는 **세로 wire** 안에 있고, +/- 마크가 상하(top/bottom)에 표시. role="voltage_source_leg".
    · Thevenin 문제(테브난 등가회로)는 보통 top rail에 V가 하나 끼어 있고 + vertical legs로 V/I 추가가 일반적 패턴. "horizontal V는 드물다"고 가정하지 말 것.
    · 판별 핵심: V 원 모양(○+-)이 가로 wire(─○─)에 있는지, 세로 wire(│○│)에 있는지 회로 그림 wire 방향으로 확인.
  - dependent source(VCVS/VCCS 등)도 V/I와 같은 방식으로 leg/branch 분류.

【few-shot — supermesh 8번 패턴 예시】
원본이 다음과 같은 회로:
  top rail: ─10Ω─ V1node ─10Ω─ V2node ─10Ω─
  V1node에서 GND로: 10V (왼쪽), 0.2V2 dep (병렬, 오른쪽)
  V2node에서 GND로: SW + 10Ω + 1A (직렬 chain, supermesh의 공유 가지)

→ 올바른 topologySignature.branches:
  [
    { "role": "voltage_source_leg",   "components":[{"type":"V","value":"10V"}] },
    { "role": "dependent_source_leg", "components":[{"type":"VCVS","value":"0.2V2"}] },
    { "role": "switching_leg",        "components":[{"type":"SW"},{"type":"R","value":"10Ω"},{"type":"I","value":"1A"}] },
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"10Ω"}] },
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"10Ω"}] },
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"10Ω"}] }
  ]
  features: { hasSwitch:true, hasDependentSource:true, hasGround:true, hasSupermesh:true, hasMesh:true, meshCount:2 }

→ 잘못된 추출 (절대 금지):
  - SW를 별도 leg로 빼고 R,I를 다른 leg로: GPT가 직렬 chain을 끊는 건 흔한 실수. 한 vertical chain은 한 branch.
  - dep source를 top_rail_resistor로 분류: dep는 source류 → dependent_source_leg.
  - supermesh를 평탄화해서 ladder처럼 branches 6개로 만들고 hasSupermesh=false로 처리: topology_extracted 단계에서 mesh 수를 잘못 잡으면 이후 generation·validation 모두 망가짐.

【few-shot — 6번 horizontal V (Thevenin·max_power) 패턴 예시】
원본이 다음과 같은 회로 (임용 6번):
  top rail: ─3kΩ─ ●V1 ─⊕7V─ ●V2 ─3kΩ─ ●a (단자 a)
  V1node에서 GND로: 5V (좌측 vertical V), 2mA (vertical I)
  V2node에서 GND로: 2mA (vertical I), 6kΩ (vertical R)
  단자 a-b 사이: R_L (점선 박스 부하)
  → 7V는 top rail 위 두 R 사이에 horizontal 끼임! V1·V2 vertical과 다름.

→ 올바른 topologySignature.branches:
  [
    { "role": "voltage_source_leg",   "components":[{"type":"V","value":"5V"}] },     // 좌측 vertical 5V
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"3kΩ"}] },    // 첫째 top rail R
    { "role": "mesh_only_branch",     "components":[{"type":"V","value":"7V"}] },     // ★ horizontal 7V! mesh_only_branch
    { "role": "top_rail_resistor",    "components":[{"type":"R","value":"3kΩ"}] },    // 둘째 top rail R
    { "role": "current_source_leg",   "components":[{"type":"I","value":"2mA"}] },    // 첫째 vertical I
    { "role": "current_source_leg",   "components":[{"type":"I","value":"2mA"}] },    // 둘째 vertical I
    { "role": "load_leg",             "components":[{"type":"R","value":"6kΩ"}] }     // vertical 부하 R
  ]
  + nodeAnnotations: [{node:"<단자 a node>",label:"a",style:"terminal_dot"},{node:"GND",label:"b",style:"terminal_dot"}]
  + loadPlaceholders: [{betweenNodes:["<a>","GND"],label:"R_L",emphasize:true}]

→ 잘못된 추출 (절대 금지):
  - 7V를 voltage_source_leg(vertical V)로 분류: 두 R 사이 top rail에 끼인 V는 vertical이 아니다. mesh_only_branch가 올바름.
  - 6kΩ vertical R을 top_rail_resistor로: vertical leg면 load_leg.
  - 단자 a/b·R_L 누락: nodeAnnotations·loadPlaceholders 필드에 반드시 명시.

【★ AC 입력 회로 (sinusoidal source) — 절대 추출 규칙 (universal_ac_pwl 라우팅 핵심)】

회로 figure에 다음 시각 단서 중 ★ 하나라도 ★ 보이면 sinusoidal AC source가 회로에 있다:
  - source 심볼이 원(○) 내부에 sine wave(∿) 곡선이 그려져 있음 (DC 배터리 ─┤├─와 명확히 다름).
  - source 옆 라벨이 "v_i(t)" / "v_s(t)" / "v_in(t)" 형식 + sin/cos/ωt 식 표기.
  - "교류 전원" / "AC source" / "정현파" / "v_i(t) = V·sin(ωt)" 텍스트 라벨.
  - 회로에 다이오드 클램퍼·정류기·반파/전파 정류 패턴이 보이면 입력은 AC 가능성 높음.

이 경우 ★ 반드시 ★ 다음을 모두 만족:

(1) topic 또는 interpretation에 "교류" / "AC" / "정현파" 단어 ★ 명시 ★
    예: "다이오드 + 스위치 + 교류 입력 클램프 회로", "교류 v_i(t)에 대한 다이오드 클램퍼"
    ★ 절대 금지 ★: "스위칭 회로 분석", "다이오드 포함 회로", "다이오드 분석" 같이 AC 단어 누락한 일반 표현.

(2) relatedConcepts 배열에 ★ AC 관련 단어 최소 3개 ★ 포함:
    "교류 입력", "주기 T", "정현파", "sin(ωt)", "v_i(t)", "AC 클램프", "다이오드 클램퍼",
    "반파 정류", "전파 정류" 중에서 3개 이상.

(3) topologySignature.branches의 AC source leg는 components value를 ★ AC 형식 ★ 으로 표기:
      올바름 ✓: { "type":"V", "value":"v_i(t)=V_p·sin(ωt)" } 또는 { "type":"V", "value":"AC" }
      잘못   ✗: { "type":"V", "value":"15V" } (DC 수치만 적으면 AC source 식별 못함)
    한 회로에 DC V_CC와 AC v_i(t)가 ★ 둘 다 있을 수 있음 — 별도 branch 두 개로 추출.

★ 잘못된 추출 (절대 금지) ★:
  - AC source가 figure에 명백히 있는데 topic/interpretation에 "스위칭 회로 분석" 같은 일반 표현만 사용
  - 한 회로에 AC + DC가 둘 다 있는데 DC V_CC만 branches에 추출 (AC source 누락)
  - relatedConcepts에 "전압원, 다이오드, 저항" 같은 일반 단어만 적고 AC 관련 단어 0개

(이 케이스는 classifier가 universal_ac_pwl로 라우팅하여 두-phase PWL 시뮬레이션이 적용된다.
위 (1)·(2)·(3) 중 하나라도 누락하면 classifier가 switched_rc·switching_circuit 등 잘못된
path로 라우팅되어 universal_ac_pwl 파이프라인이 호출되지 못한다.)

【RLC 공진 + 대역폭 회로 추출 — 절대 규칙 (임용 11번류)】
- 직렬/병렬 RLC 공진 회로에서 <해석 절차>가 **대역폭(β, bandwidth)** · **품질계수(Q)** · **인덕턴스 L 도출** ·
  **마디 전압 V_ab** · **저항 변경 시 대역폭 비(β₁/β₂)** 등을 요구하면, 그 용어를 ★ interpretation과
  relatedConcepts에 그대로 보존 ★ 하라. 문제를 "공진 전압 계산" 정도로 ★ 요약·축약하지 마라 ★.
- ★ 절대 금지 ★: 원본이 "대역폭 β를 구하라"·"β₁/β₂를 구하라" 단계를 가졌는데 interpretation에서
  대역폭·β를 누락하고 "공진 주파수에서 전압을 구한다"로만 적는 것. (그러면 generic 공진문제로 오분류된다.)
- (1) interpretation에 ★ "대역폭" 과 "β" 를 명시 ★ + 각 단계의 요구량(L[mH], V_ab 페이저, β₁/β₂)을 문장으로 보존.
- (2) relatedConcepts에 ★ "대역폭", "β", "품질계수 Q", "공진주파수 ω₀", "직렬 RLC" 중 4개 이상 ★ 포함.
- (3) 공진주파수 ω₀와 주어진 C값·R값을 그대로 추출(L은 미지면 value="?" 또는 "L").
(이 케이스는 classifier가 rlc_resonance_bandwidth로 라우팅하여 결정론 3단계 풀이가 적용된다.
"대역폭"·"β" 키워드 누락 시 universal_ac로 떨어져 엉뚱한 generic 공진문제가 생성된다.)

【AC 휘트스톤 브리지 + 테브난 + 최대전력 추출 — 절대 규칙 (임용 7번류)】
- 교류원 + **다이아몬드/브리지 4-arm**(좌상·우상·좌하·우하에 −jX(C)·R·jX(L)·R) + 가운데 단자 **A·B**에 부하 R_L이
  가교된 회로에서, **단자 A·B를 개방해 V_A·V_B·테브난 등가(Z_TH)** 를 구하고 **최대 평균 전력 R_L**을 구하는 형식이면:
- ★ interpretation에 ★ "테브난", "최대 (평균) 전력", "단자 A", "단자 B"(또는 "V_A", "V_B") ★ 를 모두 명시 ★.
- componentInventory에 4개 arm 소자(−jX 커패시터·jX 인덕터·저항 2개)를 빠짐없이. (전류원 없음 — 단일 교류 전압원.)
- ★ 절대 금지 ★: 브리지를 일반 직렬/병렬로 요약하거나 테브난·단자 A·B를 누락하는 것.
(이 케이스는 classifier가 ac_bridge_max_power로 라우팅. 키워드 누락 시 universal_ac로 떨어져 브리지 구조가
일반 병렬회로로 변질되어 figure·답이 모두 틀린다.)

【JK 상태 여기표 + 조합논리 불함수(SOP→POS) — 절대 추출 규칙 (2025 전기 A-8, jk_excitation_sop_pos 라우팅)】
- (가) **상태 여기표**(현재 상태 Q_A Q_B | 입력 x | 플립플롭 입력 J_A K_A J_B K_B | 다음 상태)와
  (나) **플립플롭 2개 + 조합 논리 블록(㉲)** 회로가 함께 주어지고, ㉲의 불 함수를 구하는 형식이면:
- ★★ **플립플롭 종류는 표의 입력 열로 판별한다** — 열이 **J_A K_A J_B K_B**면 **J-K 플립플롭**이다.
  (실측: 이 원본을 3회 중 2회 "D 플립플롭"으로 오독했다. D-FF는 입력 열이 D_A·D_B 하나씩이고,
   애초에 **여기표가 필요 없다**(D = 다음 상태). 열 라벨을 보고 적어라.)
- ★ interpretation에 ★ "상태 여기표", "J-K 플립플롭", "조합 논리 회로 완성", "불 함수", "최소항의 합",
  "분배 법칙"·"합의 곱" ★ 을 최대한 보존. 무관(×) 항이 있으면 "무관 항"도 적어라.
- HIGH(1)에 연결된 J_B·K_B, 공통 CLK, 외부 입력 x를 누락하지 마라.
- ★ 절대 금지 ★: (1) D 플립플롭·2×1 MUX 구현 회로로 오요약(→ 전혀 다른 archetype으로 샌다 — 실측),
  (2) 상태도만 있는 자율 순환(D-FF 설계)으로 축약, (3) 카운터로 오요약.

【2전원 페이저 + 중첩 → 전원 크기 역산 — 절대 추출 규칙 (임용 5번 회로이론, ac_superposition_source_design 라우팅)】
- **교류 전압원(V_s∠0°) + 교류 전류원(I_s∠−90°)** 이 함께 있는 RLC 페이저 회로에서, **특정 소자 양단 페이저
  전압(예 V_c = −7−j[V])이 되도록 전원의 크기 V_s·I_s를 구하는** 역문제(〈해석 절차〉 3단계) 형식이면:
- ★ interpretation에 ★ "중첩의 원리", "전류원 개방", "전압원 단락", "커패시터 양단 전압 V_c", "전원의 크기" ★ 를
  **모두** 명시. 특히 ★ 절차(개방/단락)와 "중첩" ★ 을 빠뜨리지 마라 — 이 두 표현이 라우팅 키다.
- 목표 페이저 값(−7−j 등)과 각 소자 임피던스(1Ω·2Ω·2Ω·j11Ω·−j10Ω)를 그대로 추출. 전원은 크기가 미지이므로
  value="V_s∠0°V"·"I_s∠−90°A"처럼 **기호로** 두되 **누락하지 마라**.
- ★ 절대 금지 ★: (1) 절차·중첩 누락(→ universal_ac로 떨어져 발문이 "단계별로 회로를 분석하고 각 단계에서
  요구하는 결과를 도출하시오"라는 **빈 placeholder**가 된다 — 실측), (2) 테브난·최대전력·공진으로 오요약.

【DC 휘트스톤 브리지 평형 — 절대 추출 규칙 (임용 3번 회로이론, dc_wheatstone_balance 라우팅)】
- **직류 전압원(예 22[V]) + 순저항 4-arm 브리지(다이아몬드)** 로, 브리지 회로가 **평형**이 되기 위한
  **미지 저항 R_x**와 그때의 **출력 전압 V_o**(개방 단자)를 구하는 형식이면:
- ★ interpretation·topic에 ★ "휘트스톤 브리지", "평형"(또는 "평형 조건"), "R_x", "출력 전압 V_o" ★ 를 모두 명시.
  topicKey는 dc_resistive(회로이론) — 이 유형은 커패시터·인덕터·교류가 **전혀 없다**.
- componentInventory: 전압원 1개 + 저항 전부(전원 직렬 저항·4개 암·브리지 암·미지 암과 병렬인 보조 저항).
  미지 저항은 value="R_x"(또는 "?")로 두고 **누락하지 마라**.
- ★ 절대 금지 ★: (1) "평형"·"브리지" 누락(→ dc_nodal/topology_driven으로 떨어져 브리지 구조가 통째로
  사라진 임의 저항망이 생성된다 — 실측), (2) 교류·임피던스·리액턴스·테브난·최대전력으로 오요약
  (그러면 AC 브리지 archetype으로 샌다), (3) 출력 단자 V_o를 부하가 연결된 것으로 바꿔 적기(개방이다).
(이 케이스는 classifier가 dc_wheatstone_balance로 라우팅 → 전용 결정론 generator(평형 조건 R_x·분압 V_o)와
 브리지 전용 렌더러가 사용된다.)

【AC 역률보정 + 전력 — 절대 추출 규칙 (임용 9번 회로이론, ac_power_factor 라우팅)】
- 단일 교류 전압원(V_s∠0°) + **직렬 R₁ + 직렬 L(jX_L)** + **부하 Z = R₂ ∥ C(−jX_C)**(점선 박스) 형식.
  전원 측 역률이 1이 되는 X_C를 구하고, 평균 전력 P_avg·무효 전력 Q·피상 전력 P_s를 구하는 형식이면:
- ★ interpretation·relatedConcepts에 ★ "역률"(또는 "power factor"), "부하 임피던스 Z", "평균 전력", "무효 전력", "피상 전력", "X_C" ★ 를 명시. topicKey는 circuit_theory 계열.
- ★★ 토폴로지: ★C는 R₂와 ★병렬★(부하 Z=R₂∥C)★, R₁·L과 직렬 아님. R₁·L만 직렬, 그 뒤 부하 Z는 R₂∥C 병렬. (C를 직렬로 추출하면 단일 직렬 RLC로 변질됨 — 실측 오류.)
- componentInventory: V 1개·R 2개·L 1개·C 1개. 전류원 없음. 리액턴스 jX 표기.
- ★ 절대 금지 ★: (1) "역률" 누락, (2) C를 직렬로(부하 R∥C 병렬 구조 상실), (3) 전류원/스위치 날조.
(이 케이스가 classifier가 ac_power_factor로 라우팅 → 전용 결정론 generator+렌더러로 직렬 R+L + 부하 Z(R∥C) 회로 생성.
 "역률" 누락 시 dc_mesh/topology-driven으로 떨어져 단일 직렬 RLC로 변질된다.)

【어드미턴스 공진 — 절대 추출 규칙 (임용 7번 회로이론, ac_admittance_resonance 라우팅)】
- 단일 교류 전압원(예 10cos(ωt)[V]) → **병렬 블록[ C ∥ (R+L 직렬) ]**(점선 박스). 점선 블록의 **등가 어드미턴스 Y_eq=a+jb[Ʊ]**.
  [1] Y_eq=a+jb의 실수부 a·허수부 b를 ω식으로, [2] 공진 주파수 ω₀(b=0), [3] 전류 i(t)의 최댓값 I_M 을 구하는 형식이면:
- ★★ 가장 중요 (실측 오류 차단) ★★: ★ interpretation·relatedConcepts·topic 에 ★ "어드미턴스"(또는 "admittance", "Y_eq", "등가 어드미턴스"), "공진 주파수 ω₀", "전류 최댓값"(또는 "I_M") ★ 를 반드시 명시 ★. 특히 ★ "어드미턴스"/"Y_eq" ★ 를 빠뜨리지 마라 (classifier 라우팅 키 — 이 단어가 없으면 generic rlc_resonance/universal_ac로 떨어져 "필요한 C 구하기"로 변질된다).
- ★★ 토폴로지: ★C는 (R+L 직렬 가지)와 ★병렬★(점선 블록 = C ∥ (R직렬L))★. C·R·L을 하나의 직렬 RLC로 합치지 마라. 소자 라벨(F/H/Ω)을 서로 바꾸지 마라(실측: C를 "H"로 오기).
- componentInventory: V 1개·R 1개·L 1개·C 1개. 전류원 없음. topicKey는 circuit_theory(rlc_response).
- ★ 절대 금지 ★: (1) "어드미턴스"/"Y_eq" 누락, (2) C를 R+L과 직렬로(병렬 블록 구조 상실), (3) "필요한 커패시턴스 C 구하기"로 문제를 바꾸기(원본은 ω₀·I_M 도출), (4) 전류원/스위치 날조.
(이 케이스가 classifier가 ac_admittance_resonance로 라우팅 → 전용 결정론 generator+렌더러로 전압원→병렬[C∥(R+L)] 회로 생성.
 "어드미턴스"/"Y_eq" 누락 시 generic universal_ac/rlc_resonance로 떨어져 소자 라벨까지 깨진 회로 + 엉뚱한 "C 구하기" 문제로 변질된다.)

【종속전류원(2V_c) 2단 구동 페이저 회로 — 절대 추출 규칙 (임용 3번 회로이론, ac_vccs_phasor 라우팅)】
- 교류 전원(예 10∠45°V)이 인가된 RLC 회로를 **주파수 영역**(리액턴스 −j2·j2 표기)으로 그리고, **다이아몬드(◇) 기호의 종속전류원 2V_c**가 있으며,
  〈해석 절차〉가 [1] 페이저 전압 V_c → [2] V_c를 이용해 페이저 전류 I_R → [3] 시간 영역 i_R(t) 인 형식이면:
- ★★ 가장 중요 (실측 오류 차단) ★★: ★ 다이아몬드(◇) 기호는 ★종속전원★이다. 절대로 독립 전압원(type "V")으로 추출하지 마라 ★.
  componentInventory에서 **type을 "VCCS"**(전압제어 전류원)로, **value를 제어식 그대로**("2V_c" 등)로 적어라.
  (실측 오류: 다이아몬드 2V_c를 {type:"V", value:"2Vc"}로 추출 → "독립 전압원 2개 + C"로 세어져 **AC+DC 중첩 RC 문제로 변질**됐다.)
- ★ interpretation·relatedConcepts에 ★ "종속전류원"(또는 "전압제어 전류원"), "제어전압 V_c", "페이저", "정상상태 전류 i_R(t)" ★ 를 반드시 명시 ★.
- ★★ 토폴로지: 좌측망(교류 전압원 → 직렬 R₁ → 마디 A → 리액턴스 2개 병렬 → 접지)이 **제어전압 V_c**(마디 A 전압)를 만들고,
  **종속전류원 2V_c가 접지에서 우측 마디로 전류를 공급**해 우측망(R₂ ∥ 리액턴스)을 구동한다.
  ★ 좌측망과 우측망의 상단은 **이어지지 않는다** (접지만 공유) ★ — 하나의 마디로 합치지 마라.
- componentInventory: V 1개(교류, ∠ 표기)·R 2개·리액턴스 소자 3개(−j2 2개·j2 1개)·VCCS 1개. 직류 전압원 없음.
- ★ 절대 금지 ★: (1) 종속전류원을 독립 V/I 원으로 추출, (2) 직류 전원 날조("AC+DC 중첩"으로 변질), (3) 좌·우 망을 한 마디로 병합, (4) 스위치 날조.
(이 케이스가 classifier가 ac_vccs_phasor로 라우팅 → 전용 결정론 generator+렌더러로 종속전류원 2단 구동 회로 생성.)

【SPDT 스위치(단자 A↔B) + 2전원 RLC 과도응답 — 절대 추출 규칙 (임용 9번 회로이론, switched_rlc_5leg 라우팅)】
- t=0에서 **스위치가 단자 A에서 단자 B로 이동**하는 RLC 회로 + **직류 전압원(예 12V) + 직류 전류원(예 2A) 2전원** +
  여러 R + 인덕터 2개(예 2H·5/6H) + 커패시터(예 1/5F)로, t<0 정상상태 → t≥0 과도(v_C(t)·i_L) 2차 미분방정식을 푸는 형식이면:
- ★ interpretation·relatedConcepts에 ★ "스위치가 단자 A에서 단자 B로 이동", "커패시터 양단 전압 v_C", "2차 미분방정식", "직류 전압원·전류원(2전원)" ★ 를 모두 명시 ★.
  특히 ★ "단자 A에서 단자 B" ★ 와 ★ "커패시터"/"v_C" ★ 를 빠뜨리지 마라 (classifier 라우팅 키).
- componentInventory에 V(전압원)·I(전류원)·R 여러 개·L 2개·C 1개·SW를 ★빠짐없이★. ★ 커패시터(C)를 누락하지 마라 ★ (실측 누락 사례 — C=0이면 switched_rl로 오분류).
- ★ topicKey는 circuit_theory 계열(rlc_response/switching_circuit) — electronics/mixed_signal로 적지 마라. "2차 미분방정식"을 적분기/미분기(opamp)로 오인 금지.
- ★ 절대 금지 ★: (1) SPDT(단자 A↔B 선택) 스위치를 단순 SPST 수직 스위치로 요약, (2) 커패시터 누락, (3) "미분방정식"을 미분기 opamp로 오인.
(이 케이스는 classifier가 switched_rlc_5leg로 라우팅 → 전용 SPDT 렌더러(단자 A↔B + common→커패시터 leg). 키워드 누락 시
generic topology-driven으로 떨어져 스위치가 단순 수직 leg로 변질된다.)

【스위치 RL + 종속 전류원(k·iₙ, CCCS) 과도응답 — 절대 추출 규칙 (임용 2024 전기 B-5, switched_rl_dep_i 라우팅)】
- **직류 전압원(예 12V) + 종속 전류원(예 10iₙ) + RL**(인덕터 + 저항들) + **t=0에서 개방되는 스위치**로,
  t<0 직류 정상상태 → i_L(0⁻)·i_R(∞)·시정수 τ를 단계별로 구하는 형식이면:
- ★★ 가장 중요 (실측 오류 차단) ★★: ★ 종속 전류원을 ★종속★으로 추출하라 ★ — componentInventory에서 그 전류원의
  type을 ★CCCS★로, value를 ★"10iₙ"처럼 제어 전류(iₙ·i_a)에 비례하는 식★으로 적어라. ★ 절대 독립 전류원(I)·단순 숫자(1, 1.5A)로 적지 마라 ★
  (실측: Vision이 "10iₙ"을 I·숫자로 떨어뜨려 dep=0 → generic rl_step으로 변질됨). 제어 전류 iₙ(저항 통과 전류)을 별도 전류원으로 날조하지 마라.
- ★ interpretation·relatedConcepts에 ★ "종속 전류원", "k·iₙ"(또는 "10iₙ"), "스위치 개방(t=0)", "RL 과도응답", "인덕터 초기전류 i_L(0⁻)", "시정수 τ" ★ 를 모두 명시 ★.
  특히 ★ "종속 전류원" ★ 을 빠뜨리지 마라 (classifier 라우팅 키 — 이 단어가 없으면 단순 RL로 오분류된다).
- ★ topicKey는 circuit_theory 계열(switching_circuit/transient_rl). componentInventory에 V·CCCS·R(여러 개)·L·SW를 빠짐없이.
- ★ 절대 금지 ★: (1) 종속 전류원을 독립 전류원/숫자로 추출, (2) "종속" 키워드 누락, (3) 제어 전류 iₙ을 독립 전류원으로 날조.
(이 케이스는 classifier가 switched_rl_dep_i로 라우팅 → 전용 generator+렌더러. 키워드/CCCS 누락 시 generic rl_step으로 떨어져
종속 전류원·스위치를 잃고 단순 V-R-L 회로로 변질된다.)

【2전원 SPDT 스위치 RL 과도응답 (종속전원·커패시터 없음) — 절대 추출 규칙 (임용 3번 회로이론, switched_rl_source_switch 라우팅)】
- **2개의 독립 직류 전압원(예 4V·2V)** 이 **SPDT 스위치 S(단자 A↔B)** 로 선택되어 직렬 **R + L** 가지를 구동하고,
  t=0에 스위치가 단자 A→단자 B로 이동, t<0 정상상태 → i(t)(예 i(0.5s)·i(∞))를 구하는 형식이면 (종속전원·커패시터 없음):
- ★ interpretation·relatedConcepts에 ★ "스위치가 단자 A에서 단자 B로 이동", "RL 과도응답", "두 직류 전압원", "시정수 τ", "i(0⁻) 정상상태" ★ 를 모두 명시 ★.
  특히 ★ "단자 A"·"단자 B" ★ 와 ★ 전압원이 2개 ★ 임을 빠뜨리지 마라 (classifier 라우팅 키 — 누락 시 단일 전원 RL로 변질된다).
- ★ componentInventory에 ★ 전압원(V) 2개 ★ · R · L · SW 를 ★빠짐없이★ (한 전압원만 적으면 generic rl_step에서 단일 18V RL로 변질된 실측 사례).
- ★ topicKey는 circuit_theory 계열(switching_circuit/transient_rl). 커패시터(C)·종속전원이 없는 순수 RL임을 지켜라.
- ★ 절대 금지 ★: (1) SPDT(단자 A↔B 선택) 스위치를 단순 SPST로 요약, (2) 두 번째 전압원 누락, (3) 인덕터를 외부 placeholder로 추상화.
(이 케이스는 classifier가 switched_rl/rl_step → 전용 2전원 SPDT generator로 라우팅. 위 키워드·2전압원 누락 시 단일 전원 RL로 변질된다.)

【이상 인덕터/커패시터 v-i 적분 — 절대 추출 규칙 (임용 3번 회로이론, inductor_vi_integral 라우팅)】
- **저항이 없는(!) 이상 인덕터 하나(예 5H)** 에 **입력 전압 v(t)가 그림 (나)와 같이 파형(사다리꼴/삼각파)** 으로 주어지고,
  특정 구간(예 2≤t<3s)에서 **인덕터 전류 i(t) = (1/L)∫v dt** 를 구하는 형식이면 (또는 쌍대: 이상 커패시터 + 전류 파형 i(t) → v(t)=(1/C)∫i dt):
- ★★ 가장 중요 (실측 오류 차단) ★★: ★ 이 문제는 RL/RC **과도응답(스텝·지수)** 이 ★아니다★. **저항이 없다** — 절대 저항(R)을 componentInventory에 날조하지 마라.
  전원도 DC 스텝이 아니라 ★파형(사다리꼴 v(t))★ 이다. (실측: Vision이 이상 인덕터+전압파형을 "RL 회로 과도응답"으로 오독해 저항·지수응답으로 변질.)
- ★ interpretation·relatedConcepts에 ★ "이상 인덕터"(또는 "이상 커패시터"), "전압 파형 v(t)"(또는 "전류 파형 i(t)"), "적분", "i(t)=(1/L)∫v dt"(또는 "v(t)=(1/C)∫i dt"), "저항 없음", "구간별 전류(전압) 식" ★ 를 모두 명시 ★.
  특히 ★ "이상 인덕터/커패시터" ★ 와 ★ "적분" ★ 을 빠뜨리지 마라 (classifier 라우팅 키 — 없으면 RL/RC 과도로 오분류된다).
- ★ componentInventory에 ★ 인덕터(L) 1개 [또는 커패시터(C) 1개] + 전압원(V) [또는 전류원(I)] ★만★. ★ 저항(R)은 넣지 마라 ★.
- ★ topicKey는 circuit_theory 계열(transient_rl/transient_rc). semantic: hasWaveformEvolution=false(파형은 주어진 입력, 학생 도출 아님).
- ★ 절대 금지 ★: (1) 저항(R) 날조·추가, (2) DC 스텝·지수응답으로 요약, (3) "적분"·"이상 인덕터/커패시터" 키워드 누락, (4) "지수·시정수·충전·방전·과도" 같은 스텝응답 용어 사용.
(이 케이스는 classifier PRE-SUBJECT가 inductor_vi_integral로 라우팅 → 전용 적분 generator. 위 키워드 누락·저항 날조 시 generic rl_step으로 변질돼 RL 지수응답 문제로 바뀐다.)

【단일 AC원 L-C-R 사다리 + 테브난 + 복소 켤레 최대전력 — 절대 추출 규칙 (임용 7번 회로이론, ac_thevenin_ladder 라우팅)】
- 단일 교류 전압원(V_RMS) + **직렬 리액티브 — 마디 M — 션트 리액티브 — 직렬 R — 단자 a** 의 사다리꼴 RLC + 단자 a·b 부하 Z_L 형식.
  (원본: V_RMS 좌측 세로 → 상단 직렬 L(j2) → 마디 M → 마디에서 ↓ 션트 C(−j1) → 상단 계속 직렬 R(2) → 단자 a. b=하단 도선.)
  부하 Z_L에 최대 전력을 전달하는 ★복소 임피던스 Z_L = R_t + jX_L★(켤레 정합)과 최대 평균 전력 P_L(max)를 구하는 형식이면:
- ★ interpretation·relatedConcepts에 ★ "테브난 등가", "최대 (평균) 전력", "복소 임피던스 Z_L = R_t + jX_L" 또는 "켤레 복소수"(conjugate), "단자 a·b" ★ 를 모두 명시 ★.
  특히 ★ 부하가 ★ 복소 임피던스 Z_L = R_t + jX_L ★ (켤레 정합)임을 반드시 적어라 — 순저항 R_L과 혼동 금지. (이 "복소 켤레"가 classifier 판별 키다.)
- componentInventory: 직렬 리액티브 1 + 션트 리액티브 1 + 직렬 R 1 + 교류 전압원 1. 전류원 없음. 리액턴스는 jX/−jX 표기.
  (가운데 리액티브는 ★션트★ — 마디 M에서 하단으로 ↓ 내려가는 가지. 직렬로 추출하지 마라. ※ 생성은 결정론 generator라 회로는 고정 렌더되지만, 인벤토리·키워드가 맞아야 분류가 정확하다.)
- ★ 절대 금지 ★: (1) "복소/켤레" 빠뜨리고 순저항 R_L로 적기, (2) 단자 a·b 누락, (3) 두 전원이나 브리지로 오인.
(이 케이스가 classifier가 ac_thevenin_ladder로 라우팅 → 전용 결정론 generator+사다리 렌더러로 (가) 사다리 + (나) 테브난 등가
2-figure 생성. "켤레/복소 임피던스" 누락 시 generic universal_ac로 떨어져 사다리가 병렬 leg 회로로 변질된다. 브리지(4-arm·V_A·V_B)와 구분 — 이쪽은 사다리.)

【2개 전압원 병렬가지 → 테브난 등가 — 절대 추출 규칙 (임용 3번 회로이론, dc_thevenin_2src 라우팅)】
- 단자 a(상)–b(하) 사이에 **2개의 병렬 가지**, 각 가지 = 저항 + 직류 전압원 직렬(예 leg1: 2Ω+12V, leg2: 6Ω+6V).
  (가)를 (나)의 테브난 등가(R_T 직렬 V_T)로 변환해 **R_T·V_T를 구하는** 형식이면:
- ★★ 가장 중요 (실측 오류 차단) ★★: ★ 전압원을 ★2개★ 빠짐없이 추출하라 ★ — componentInventory에 V 2개·R 2개. (Vision이 1개만 추출하면 generic thevenin이 단일전원 분압으로 변질됨.)
- ★ interpretation·relatedConcepts에 ★ "2개의 전압원", "테브난 등가", "R_T", "V_T", "단자 a·b" ★ 명시. topicKey는 circuit_theory 계열.
- 인덕터·커패시터·전류원·종속전원 없음(순수 DC 저항망). 각 전압원의 극성(+ 단자 방향)을 표기.
- ★ 절대 금지 ★: (1) 전압원 1개만 추출, (2) 두 가지를 단일 루프로 요약, (3) 전류원/종속원 날조.
(이 케이스가 classifier가 dc_thevenin_2src로 라우팅 → 전용 결정론 generator(Millman)+렌더러로 (가) 2전압원 병렬 + (나) 테브난 등가
2-figure 생성. 전압원 1개로 추출되면 generic thevenin(단일전원 분압)으로 변질된다.)

【electronics OPAMP 회로 추출 — 절대 규칙】
- OPAMP component는 R/V/I와 동일하게 componentInventory에 모두 포함하고, topologySignature.branches에도 명시한다.
- OPAMP가 회로에 K개 있으면 inventory에 "OPAMP" K번, branches에도 K개 별도 entry.
- 단일 OPAMP / 2단 cascade / instrumentation amp / 차동입력 amp 등은 OPAMP 개수와 입력 연결로 식별 가능 → analyze가 정확히 카운트해야 generator가 올바른 archetype 선택.
- structureSignature.componentCounts.OPAMP에도 카운트 명시.
- interpretation 텍스트에 "OPAMP K단", "cascade", "두 단 OPAMP" 등 구조 묘사를 한 문장 포함시켜 키워드 기반 dispatch도 가능하게.
- ★ 2단 OPAMP에서 ★ 중간 마디 전압(V_P 등)이 주어지고 입력(V_i)·출력(V_o)을 구하라 ★ 는 형식이면
  interpretation에 ★ "V_P", "V_i", "V_o", "구하여"(또는 "구하시오") ★ 를 모두 명시하라.
  예: "1단 비반전·2단 반전 2단 OPAMP. V_P가 주어질 때 입력 전압 V_i와 출력 전압 V_o를 구하여 순서대로 쓰는 문제."
  ★ 절대 금지 ★: "전달함수를 구한다"·"V_o/V_i" (이건 다른 유형 — 이 문제는 V_P given·V_i·V_o 도출).
- ★ 3-OPAMP 응용회로 — 반전증폭(V_x)+버퍼+반전가산, ★출력 전압 목표가 되기 위한 저항 R_f를 구하는★ 형식 (임용 2번 전자):
  · 구조: 1단 반전 증폭(입력 V1·직렬 R·피드백 R, (+)접지 → 중간 출력 ★V_x★) + 2단 버퍼(다른 입력 V2 → (+), 단위이득)
    + 3단 반전 가산(V_x·V_buf가 각자 저항 통해 (−)에 합산, 피드백 ★R_f★, (+)접지 → V_o).
  · ★ interpretation에 ★ "V_x"(중간 출력 전압), "R_f"(또는 "저항 R_f"), "출력 전압 V_o가 ~가 되기 위한 저항을 구한다", "반전 증폭", "가산" ★ 를 명시하라.
    예: "연산 증폭기 응용 3단 회로. 전압 V_x를 구하고, 출력 전압 V_o가 목표값이 되기 위한 저항 R_f를 구하여 순서대로 쓰는 문제."
  · ★ 절대 금지 ★: (1) "전달함수"·"V_o/V_i"로 적기(cascade와 혼동), (2) "V_P given V_i·V_o"로 적기(2단과 혼동), (3) "저항 R_f를 구한다"를 빠뜨리기.
    (이 "출력 전압 목표 → 저항 R_f 설계 + 중간 출력 V_x"가 classifier가 opamp_three_stage_sum으로 라우팅하는 키다. 누락 시 cascade로 변질된다.)
- ★★ 단일 OPAMP ★유한 개방루프 이득 A(s)★ + ★블록도(나)★ 형식 (임용 11번) — 절대 추출 규칙 ★★:
  · 구조: V_in ─ R₁ ─ 반전 입력 단자(V⁻) ─ R₂(피드백) ─ V_out, V⁺=접지. OPAMP 개방루프 이득이 ★유한★
    이며 A(s)=A₀ω₀/(s+ω₀)(A₀=직류이득, ω₀=차단주파수)로 ★수식으로 주어진다★. (가) 회로 + (나) 블록도 2 figure.
    블록도(나): V_in→α→Σ(합산점)→A(s)→V_out, V_out→β→Σ 피드백. 해석 절차: [1] 중첩의 원리로 V⁻=α·V_in+β·V_out
    (α·β를 R₁·R₂로 표현), [2] A(s)로 A_s=α/(1+β·A(s)) 표현, [3] 수치 대입해 V⁻[mV] 도출.
  · ★ topic·interpretation·relatedConcepts에 ★ "개방 루프 이득", "A(s)", "블록도", "중첩의 원리", "α", "β",
    "반전 입력 단자"(또는 "V⁻") ★ 를 ★반드시 모두 명시★하라(Vision이 자주 흘리는 키워드 — 누락 시 단순 반전증폭기로 변질).
    예: "연산 증폭기의 유한 개방 루프 이득 A(s)=A₀ω₀/(s+ω₀)와 블록도를 이용해, 중첩의 원리로 반전 입력 단자 전압 V⁻을 α·β로 표현하고 수치를 구하는 문제."
  · ★ 절대 금지 ★: (1) "이상적 연산 증폭기"·"가상 단락(V⁺=V⁻)"으로 적기(유한 이득이라 V⁻≠0 — 가상접지 아님),
    (2) "반전 증폭기 출력 전압을 구한다"로 단순화(개방루프 이득·블록도·α/β 구조를 잃음),
    (3) "개방 루프 이득"·"블록도"·"중첩" 키워드를 빠뜨리기.
- ★★ OPAMP ★루프이득 L(s)=V_r/V_t★ + 특성방정식 좌반평면 ★안정도★ 형식 (임용 12번 전자회로) — 절대 추출 규칙 ★★:
  · 구조: (가) 원 회로 — 한쪽 입력 단자에 분압망(접지↔단자 R, 단자↔출력 R), 다른 쪽 입력 단자에 ★입력 V_s가 R_S를
    거쳐 인가★되고 그 단자↔출력에도 저항 R(귀환 경로). (나) ★입력 V_s를 제거하고 귀환 루프를 끊은 뒤 V_t를 인가해
    V_r을 얻는 회로★. 개방루프 전달특성은 ★A(s)=A₀ω₀/s★(A₀ω₀=이득·대역폭 곱).
    〈해석 절차〉: [1] V⁺·V⁻를 V_t로, [2] 루프이득 L(s)와 ★특성방정식 0=1−L(s)★의 근, [3] 근이 ★좌반평면★에
    있을 조건 → 저항 ★R_S와 R의 관계를 부등식★으로.
  · ★ topic·interpretation·relatedConcepts에 ★ "루프이득"(또는 "loop gain"·"V_r/V_t"), "귀환 루프를 끊고",
    "특성방정식", "좌반평면", "안정" ★ 를 ★반드시 명시★하라 — 형제 유형(임용 11번 블록도형·임용 6번 정귀환)이
    모두 "개방루프 이득"을 쓰므로, 이 키워드들이 없으면 통째로 그쪽으로 변질된다.
  · ★ 절대 금지 ★: (1) "발진기"·"발진 조건"·"Wien"·"Barkhausen"으로 적기(이건 발진이 아니라 **안정도 부등식**이다),
    (2) "블록도"·"A(s)=A₀ω₀/(s+ω₀)"로 적기(여기는 A(s)=A₀ω₀/s 적분형이다),
    (3) 그림 (나)를 빠뜨리고 단일 회로로 요약하기(루프 절단 구조가 문제의 핵심이다).
- ★★ 단일 OPAMP 유한 개방루프 이득 A₀ + ★출력단 직렬 오프셋 전압원 V_B★ 형식 (임용 9번 전자회로) — 절대 추출 규칙 ★★:
  · 구조: 접지 ─ R₁ ─ 반전 입력 단자(V⁻) ─ R₂(피드백) ─ 출력 노드, 입력 v_in(교류)은 ★비반전 입력 V⁺★에 인가.
    ★OPAMP 출력 단자(V_D)와 최종 출력 단자(V_out) 사이에 ★직류 전압원 V_B가 직렬로★ 놓여 V_out = V_D − V_B 이다.
    〈해석 절차〉: [1] β=R₁/(R₁+R₂), V_D=A₀(V_in−βV_out) [2] V_out=(A₀V_in−V_B)/(1+A₀β) [3] 수치 대입.
  · ★ componentInventory에 ★전압원을 2개(입력 v_in + 출력단 V_B)★ 모두 포함하라 — V_B를 빠뜨리면 형제 유형
    (임용 11번 블록도형)으로 변질된다.
  · ★ topic·interpretation·relatedConcepts에 ★ "개루프 이득 A₀", "되먹임", ★"출력단에 직렬로 연결된 전압원 V_B"★,
    "V_out = V_D − V_B" ★ 를 ★반드시 명시★하라.
  · ★ 절대 금지 ★: (1) "블록도"·"A(s)=A₀ω₀/(s+ω₀)"·"차단주파수 ω₀"로 적기(그건 임용 11번 다른 유형이다),
    (2) V_B를 무시하고 단순 비반전 증폭기로 요약하기, (3) "이상적 연산증폭기·가상단락"으로 적기(개루프 이득이 유한하다).
- ★★ 단일 OPAMP ★정귀환(positive feedback)★ + 유한 개방루프 이득 + ★SW step 입력★ 형식 (임용 6번) — 절대 추출 규칙 ★★:
  · 구조: 입력 V_in(=1V)이 ★스위치 SW(t=0 닫힘)★를 거쳐 반전입력 V⁻에 인가. V⁺ ─ R₁ ─ GND(V⁺ 분배 leg).
    ★V_out ─ R₂(또는 R_f) ─ V⁺★ (출력이 ★비반전입력 V⁺로 피드백 = 정귀환★, V⁻ 아님). 개방루프 이득 유한
    A(s)=A₀ω₀/(s+ω₀). 〈해석 절차〉: [1] V⁺=β·V_out, β=R₁/(R₁+R₂). [2] V_out/V⁻(s)=B·ω₀/(s+D·ω₀), B=−A₀·D=1−β·A₀.
    [3] SW 닫혀 V⁻(s)=1/s → V_out(s)=K·(1/s−1/(s+D·ω₀)), 상수 K=B/D 도출.
  · ★ topic·interpretation·relatedConcepts에 ★ "정귀환"(또는 "양의 피드백"/"positive feedback"), "개방 루프 이득",
    "A(s)", "비반전 입력 단자", "스위치"(SW t=0), "K" ★ 를 ★반드시 명시★하라(Vision이 자주 흘리는 키워드 — 누락 시 단순 반전증폭기로 변질).
    예: "정귀환(positive feedback)이 가해진 연산 증폭기 응용 회로. 유한 개방 루프 이득 A(s)와 스위치 step 입력으로 β·B·D를 구하고 출력식의 상수 K를 도출하는 문제."
  · ★ 절대 금지 ★: (1) "발진기"·"Barkhausen"·"Wien Bridge"로 적기(이건 step 응답 해석 문제 — 발진 조건 문제 아님),
    (2) "이상적 반전 증폭기"·"가산 증폭기"로 단순화(정귀환·A(s)·SW step·K 구조를 잃음),
    (3) "정귀환"·"양의 피드백"·"개방 루프 이득" 키워드를 빠뜨리기.
- ★★ OPAMP(오차증폭기) + 제너 + 트랜지스터 ★직렬형 정전압 안정화 회로★ (임용 30번) — 절대 추출 규칙 ★★:
  · 구조: 공급전압 V_DD ─ ★NPN 트랜지스터(직렬 패스: 컬렉터=V_DD, 이미터=출력 V_o)★. ★OPAMP(오차증폭기)★의
    비반전(+) 입력에 ★제너다이오드 기준전압 V_z★, 반전(−) 입력에 ★출력 V_o의 피드백 분압 탭★(R_a·R_b 분압).
    OPAMP 출력이 트랜지스터 베이스를 구동. 이상적 동작 시 가상단락 → V_o = V_z(1+R_a/R_b).
  · ★ componentInventory에 ★OPAMP를 반드시 포함★하라(라벨 없는 삼각형도 OPAMP). 제너(전압값 가진 다이오드)·트랜지스터도 각각 포함.
  · ★ topic·interpretation·relatedConcepts에 ★ "연산증폭기"(또는 "OPAMP"·"오차증폭기"), "제너"(기준전압),
    "트랜지스터"(직렬 패스), "정전압 안정화"(또는 "전압 레귤레이터"), "피드백 분압" ★ 를 ★반드시 모두 명시★하라.
    예: "제너다이오드 기준전압과 연산증폭기(오차증폭기), 직렬 패스 트랜지스터로 구성된 직렬형 정전압 안정화 회로. 피드백 분압으로 출력 V_o를 안정화하는 문제."
  · ★ 절대 금지 ★: (1) ★OPAMP를 빠뜨리기★(누락하면 OPAMP 없는 션트형 제너-BJT 레귤레이터로 변질된다 — OPAMP가 이 유형의 핵심 판별자),
    (2) "제너 항복 전압 V_z + V_BE로 출력 결정"으로 적기(그건 션트형 임용 8번 — 이건 OPAMP 피드백으로 V_o=V_z(1+R_a/R_b)),
    (3) "단순 반전/비반전 증폭기"로 단순화(제너 기준·트랜지스터 직렬 패스·피드백 분압 구조를 잃음).
- ★★ OPAMP + R + C ★1차 능동 저역통과 필터 — 대역폭/차단주파수★ 형식 (임용 31번) — 절대 추출 규칙 ★★:
  · 구조: 입력 v_i ─ 저항 R ─ 마디 P ─ OPAMP 입력, ★마디 P에 커패시터 C가 접지로★ 연결(입력단 RC 저역통과).
    OPAMP는 이상적 버퍼/증폭. ★대역폭 = 차단주파수 f_c = 1/(2πRC)★. 질문은 ★C(또는 R)를 바꿀 때 대역폭[Hz]의 변화★.
  · ★ componentInventory에 ★커패시터 C를 반드시 포함★하라(누락하면 단순 반전증폭기로 변질). 저항 R·OPAMP도 포함.
  · ★ topic·interpretation·relatedConcepts에 ★ "1차 저역통과 필터"(또는 "저역필터"·"저주파 통과"), "대역폭"(또는 "차단주파수"·"cutoff"),
    "커패시터 C", "f_c=1/(2πRC)"(또는 "1/(2πRC)") ★ 를 ★반드시 명시★하라. C가 몇 nF에서 몇 nF로 바뀌는지 값도 보존.
    예: "연산증폭기를 이용한 1차 저역통과 필터. 커패시터 C를 바꿀 때 대역폭(차단주파수 f_c=1/(2πRC))의 변화를 구하는 문제."
  · ★ 절대 금지 ★: (1) ★커패시터·필터·대역폭을 빠뜨리고★ "반전/비반전 증폭기 출력 전압"으로 적기(필터 성격을 완전히 잃는다),
    (2) "적분기"·"미분기"로 적기(그건 opamp_time_domain — 이건 저역통과 필터의 대역폭 분석),
    (3) "전달함수 V_o/V_i·이득"으로만 적기(대역폭·차단주파수·C 변화가 핵심).
- ★★ 아날로그 시스템 ★설계★ — 입력/출력 파형 + OPAMP 2개 + 저항 동일 (2-OPAMP 가산기) 형식 — 절대 추출 규칙 ★★:
  · 형식: 입력 v₁(삼각파 등)·v₂(구형파 등)와 ★출력 v₀ 파형이 그림으로 주어지고★, 조건 "연산 증폭기 2개만 사용·모든 저항값 동일·모든 소자 이상적"으로 ★회로를 설계★.
  · ★ topic·interpretation·relatedConcepts에 ★ "아날로그 시스템", "설계", "연산 증폭기 2개"(또는 "op-amp 2개"), "모든 저항값 동일"(또는 "저항이 모두 같"),
    "삼각파"·"구형파"(입력 파형), "v₁·v₂·v₀"(또는 "입력 파형·출력 파형") ★ 를 ★반드시 명시★하라. 파형 종류와 설계 조건을 보존.
  · ★ 절대 금지 ★: (1) "임의의 저항·전압값으로 출력을 계산"으로 적기(설계 문제이지 수치 계산 아님 — 저항은 모두 같고 값이 주어지지 않음),
    (2) 파형(삼각파·구형파·출력)을 빠뜨리기(파형이 v₀=f(v₁,v₂) 도출의 핵심),
    (3) "저역필터"·"적분기"·"전달함수"로 적기(이건 파형 기반 가산기 설계).

【few-shot — 2-OPAMP cascade 5번 패턴 예시】
원본이 다음과 같은 회로(임용 5번 (가)):
  V_2 ─R1(1kΩ)─ U1(+/-) ─ U1.out ─R(1kΩ)─ V_1 (와 R(1kΩ) 통해 GND)
  U1.out ─ U2(+/-) ─ V_o, feedback R_f(4kΩ)
  → OPAMP 2개 직렬 (U1 → U2), 입력 V_1·V_2, 출력 V_o.

→ 올바른 componentInventory:
  [{type:"OPAMP"},{type:"OPAMP"},{type:"R"},{type:"R"},{type:"R"},{type:"R"},{type:"R"},{type:"V"},{type:"V"}]

→ 올바른 structureSignature.componentCounts:
  { OPAMP: 2, R: 5, V: 2 }

→ interpretation 예: "OPAMP 두 단을 직렬 cascade한 회로로 두 입력 V_1·V_2로부터 V_o 출력 도출."

【★ digital_logic 동작 조건(말)→최소 SOP 간소화 — 절대 추출 규칙 (임용 25번, logic_condition_sop 라우팅 핵심)】
- 형식: ★그림 없이★ "동작 조건"만 말로 주고, 3변수(A,B,C) 조합논리 출력 F를 ★가장 간소화한 논리식(SOP)★으로 표현/선택.
  (예: "입력 A가 1이면 B,C에 무관하게 F=1; A가 0일 때 B와 C가 같으면 F=0, 다르면 F=1" → F=A+BC̄+B̄C.)
- ★ topic·interpretation·relatedConcepts에 ★ "조합논리회로", "동작 조건", "간소화"(또는 "가장 간단한 논리식"), "출력 F",
  그리고 조건 서술 키워드("무관하게"·"같으면"·"다르면"·"모두 1이면" 등) ★ 를 ★반드시 보존★하라. 동작 조건 문장을 그대로 요약에 담아라.
- ★ 절대 금지 ★: (1) ★"카르노맵(K-map)이 주어진다"·"진리표가 주어진다"·"회로도가 주어진다"로 적기★ (원본은 그림 없이 말 조건만 — 이 오요약이 combinational_gate로 변질시킴),
  (2) ★출력을 F, G 2개로★ 적기(원본은 단일 출력 F),
  (3) "구현 회로를 그리시오"·"게이트로 구현"으로 적기(원본은 논리식 간소화만, 회로 구현 아님),
  (4) 플립플롭·카운터·순차·MUX·파형으로 적기(순수 조합논리 간소화).
- componentInventory는 비워도 됨(소자 없음 — 말 조건). topicKey는 combinational_gate.

【★ digital_logic 다중-K-map / 다중-함수 추출 절대 규칙】

K-map 문제를 분석할 때 ★ K-map 개수와 차원을 정확히 카운트 ★:

(1) K-map 차원 = 변수 개수 결정
  - 2x2 → 2-변수 (A, B)
  - 2x4 → 3-변수 (A, B, C)
  - 4x4 → 4-변수 (A, B, C, D)
  - 4x8 → 5-변수 (A, B, C, D, E)

  ★ 4x4 K-map은 4-변수다 ★ — 3-변수로 줄여 보지 말 것.
  행 라벨이 AB(00,01,11,10) + 열 라벨이 CD(00,01,11,10)이면 4-변수.

(2) K-map 개수 = 함수 개수
  - 원본에 K-map이 4개 그려져 있으면 → 함수 4개 (f_1, f_2, f_3, f_4)
  - K-map이 2개면 → 함수 2개 (F, G 또는 X, Y)
  - 절대 임의로 줄이지 말 것 (4개 → 2개로 축소 금지).

(3) signals 추출
  - inputs: 모든 K-map에 공통으로 사용된 변수 (예: [A, B, C, D])
  - outputs: 함수 이름 = K-map title (예: [f_1, f_2, f_3, f_4] 또는 [Z] if 통합 출력)
  - 만약 통합 출력 Z가 OR/AND로 결합되면 outputs에는 Z만 두고 interpretation에 "f_1, f_2, ... → Z 결합" 명시.

(4) interpretation에 ★ 함수 이름과 minterm 표기 명시 ★
  - "f_1 = Σm(1,2,3,7,9)" 형식으로 각 함수 적기.
  - K-map 4개·변수 4개·결합 게이트 OR/AND를 명확히 설명.
  - "각 함수의 최소합" / "f_1, f_2, ..." / "Σm(...)" 표기 보존.

(5) ★ intermediateSignals 추출 — multi-stage gate network 보존 ★
  signals.intermediateSignals에 ★ 게이트 사이 wire 이름 명시 ★ 하라:
  - 회로에 명시된 중간 출력(X, Y 등)이 있으면 ["X","Y"] 등으로.
  - 원본의 multi-stage 구조 절대 평탄화하지 말 것 (예: f_1·f_2·f_3·f_4를
    하나의 OR로 직접 묶는 식으로 단순화 금지).
  - 회로가 (f_1 ∧ f_2) → X, (f_3 ∨ f_4) → Y, (X ⊕ Y) → Z 같이 stage가
    있으면 X, Y를 intermediateSignals에 넣고 outputs는 [Z].
  - 명시 라벨이 없어도 multi-stage 구조면 자동 라벨(X1, X2, ...) 부여.

  ★ 절대 금지 ★: f_1·f_2·f_3·f_4를 하나의 OR/AND 게이트에 직접 연결한
  단순 형태로 환원 (원본 회로의 multi-stage 구조 손실).

★ 잘못된 추출 (절대 금지) ★:
  - 4-변수 K-map(4x4)을 3-변수(2x4)로 잘못 읽기 — 행/열 라벨 무시
  - 4개 함수(f_1..f_4)를 2개 출력(F, G)으로 축소
  - Σm 표기를 임의로 제거
  - 4-변수 문제를 combinational_gate(3-var) 형식으로 단순화

(이 케이스는 분류기가 universal_digital path로 라우팅하여 multi-K-map +
결합 회로 layout이 자동 적용된다.)

【★ digital_logic 시퀀스 검출기 + D-FF + 상태도/표 빈칸 — 절대 추출 규칙 (sequence_detector 라우팅 핵심)】

★ 핵심 단서 (1) 또는 (6) 중 ★ 최소 하나 ★ + 보조 단서 1개 이상 보여야 sequence_detector 형식이다 (임용 8번 정보과):
  핵심 단서 (둘 중 하나 필수):
  (1) 블록도 figure: 입력 y(또는 X) → "시퀀스 검출기" / "검출기" 박스 → 출력 z(또는 Z)
  (6) 본문에 "y가 '110' (또는 '101' 등)의 순서로 입력될 때 z=1" 류 시퀀스 매칭 문구
  보조 단서:
  (2) 상태도 figure: 4개 상태 원(circle) 노드 + 전이 화살표 + 화살표 라벨 "input/output" (Mealy 형식)
  (3) 상태도/상태표 안에 학생 채울 빈칸 마커: ㉠, ㉡, ㉢, ㉣ (또는 ⓐ, ⓑ 등)
  (4) D 플립플롭(D-FF) 2개 (A, B 또는 Q_A, Q_B) — 2-bit 상태 인코딩
  (5) 상태표 figure: 현재상태(Q_A, Q_B) | 입력(y) | 다음상태(Q_A+, Q_B+) | 출력(z) 컬럼 +
      "x"(don't care) 행 일부 존재

【★ 플립플롭 종류는 상태표의 "입력" 열로 판별 — 절대 규칙 (D vs J-K 오독 방지) ★】
- 상태표(플립플롭 입력) 열이 ★ D_A, D_B ★ (또는 D₁, D₀) 이면 ★ D 플립플롭 ★ 이다.
- 열이 ★ J_A, K_A, J_B, K_B ★ 이면 J-K 플립플롭이다.
- ★ 절대 금지 ★: D_A·D_B 열인데 "J-K 플립플롭"이라고 적는 것 (실제 오독 사례 — D-FF 순차설계를
  JK FSM으로 오분류해 입력 X·출력 y를 날조함). 본문/표에 "D 플립플롭"·"D_A"·"D_B"가 보이면
  interpretation·topic에 ★ "D 플립플롭" ★ 으로 명시하고 J-K로 적지 마라.
- 입력 신호(X)·출력(y/z) 없이 상태도가 자율 순환(예: 00→01→10→11)이면 입력 없는 순차설계다 —
  입력 X·출력 y를 만들어내지 마라.

★ 다음 중 하나라도 보이면 sequence_detector가 ★ 절대 아니다 ★ (J-K 상태표 fsm 형식으로 분류):
  - 본문에 "J-K 플립플롭" (또는 JK 플립플롭) 명시 — 시퀀스 검출기는 D 플립플롭만 사용한다
  - 블록도(입력 → 검출기 박스 → 출력)가 없고, '110' 같은 quoted 검출 패턴 언급도 없음
  - 상태표의 차기 상태가 x=0·x=1 두 컬럼 그룹으로 나뉘고, 해석 절차가 J_A·J_B 논리식을 요구
  ⚠️ "상태도 + 상태표 + 빈칸 마커"만으로 시퀀스 검출기로 판단하지 마라 — 그 조합은
  J-K 플립플롭 상태표 문제(임용 9번 전자)에도 똑같이 나타난다 (실제 오분류 신고 사례).

이 경우 ★ 반드시 ★ 다음을 만족:

(A) topicKey = "sequence_detector" 명시 ★ 강제 ★
    ❌ "fsm" 또는 다른 topicKey 절대 금지 — sequence_detector는 디자인이 다른 별개 archetype.

(B) topic 또는 interpretation에 ★ "시퀀스 검출기" 또는 "sequence detector" 단어 명시 ★
    예: "시퀀스 검출기 + D-FF 상태도 빈칸 채우기", "'110' 검출 sequence detector + D-FF FSM"
    ★ 절대 금지 ★: "FSM 회로", "유한 상태 기계" 같은 일반 표현만 사용 (sequence detector 단어 누락).
    "시퀀스 점프기" 같은 typo도 절대 금지 — "검출기" 정확히.

(C) relatedConcepts 배열에 ★ 최소 4개 ★ 포함:
    "시퀀스 검출기", "D 플립플롭", "상태 전이도", "Mealy", "상태표", "don't care",
    "K-map 최소화", "SOP", "검출 패턴 (e.g. '110')" 중에서 4개 이상.

(D) interpretation에 ★ 검출 패턴 명시 ★
    원본의 "'110'" 등 quoted 비트열을 그대로 (single-quote 포함) interpretation에 박아라.
    예: "입력 y에 '110'이 순서대로 입력될 때 출력 z=1이 되는 시퀀스 검출기."

(E) ★ 빈칸 마커 ㉠㉡㉢㉣ 또는 ⓐⓑ 정확히 transcribe ★
    원본에 보이는 ㉠·㉡·㉢·㉣ Unicode 마커를 fillInTheBlanks의 sentence에 그대로 박아라.
    예: { "sentence": "(나) 상태도에서 ㉠, ㉡, ㉢, ㉣에 들어갈 값을 구하시오.", "answer": "..." }

(F) componentInventory에 D-FF 2개를 ★ 빠짐없이 ★ 추출
    type="DFF" 2개. 라벨이 A·B 또는 Q_A·Q_B면 id에 그대로.

(G) figureRequirements에 3개 figure 명시:
    [
      { "role": "main_circuit",          "diagramType": "concept_diagram", "scope": "single", "required": true },
      { "role": "state_diagram",         "diagramType": "concept_diagram", "scope": "single", "required": true },
      { "role": "truth_table",           "diagramType": "truth_table",     "scope": "single", "required": true }
    ]
    ⚠️ "implementation_circuit"·"logic_network"은 절대 추가하지 마라 — 원본에 회로 구현 figure 없음.

★ 잘못된 추출 (절대 금지) ★:
  - topicKey="fsm" 으로 잘못 지정 → 분류기가 일반 FSM(MUX 기반 구현 회로) path로 라우팅하여
    원본에 없는 D-FF+MUX 회로도가 추가 생성됨. 사용자 신뢰 깨짐.
  - 빈칸 마커 ㉠㉡㉢㉣를 누락 → 분류기가 sequence_detector 라우팅 조건 충족 못 함.
  - "시퀀스 검출기" 단어를 "FSM 회로" 같이 일반화 → 분류기 키워드 매치 실패.
  - figureRequirements에 "implementation_circuit" 추가 → 원본에 없는 회로도 figure 생성.

(이 케이스는 분류기가 sequence_detector path로 라우팅하여 (가) 블록도 + (나) 상태도(빈칸) +
(다) 상태표(빈칸, don't care)의 3 figure만 생성된다.)

【★ digital_logic 자율 상태도 → D 플립플롭 + 게이트 설계 — 절대 추출 규칙 (dff_state_design 라우팅 핵심, 임용 9번 정보과)】

다음 시각 단서 ★ 두 가지 이상 ★ 보이면 이 형식이다 (★ 위 sequence_detector·아래 J-K 상태도와 구분 ★):
  (1) (가) figure가 ★ 상태도 ★ — 원(circle) 노드 4개(00·01·10·11), 노드 사이 화살표.
      ★ 핵심: 화살표에 "입력/출력"(x/y) 라벨이 ★ 없다 ★ — 자율 순환(autonomous). 자기루프·합류 가능.
  (2) (나) figure가 ★ 상태표 ★ — 컬럼: [현재상태 Q_A·Q_B] | [다음상태 Q_A(t+1)·Q_B(t+1), 빈칸 ㉠~㉣] |
      [플립플롭 입력 ★ D_A·D_B ★] — 입력 열이 D_A·D_B(또는 D₁·D₀)면 D 플립플롭이다.
  (3) (다) figure가 ★ 구현 회로 ★ — D 플립플롭 2개 + 논리 게이트(빈칸 ★ ㉮·㉯ ★) + Q_A·Q_B 피드백 + 공통 CLK.
  (4) [설계 절차] 박스 + [단계 1] ㉠~㉣ 다음상태, [단계 2] D 입력, [단계 3] ㉮·㉯ 게이트.

★ 플립플롭 종류 판별 (절대 규칙): 상태표 입력 열이 ★ D_A·D_B ★ → ★ D 플립플롭 ★. J_A·K_A → J-K. T_A·T_B → T-FF.
  - 입력 열이 보이지 않아도, 화살표에 x/y 라벨 없는 자율 순환 + 게이트 ㉮·㉯ 설계면 ★ D 플립플롭 설계 ★ 로 간주.

이 경우 ★ 반드시 ★ 다음을 만족:

(A) topicKey = "fsm" ★ 절대 금지 ★ — fsm으로 적으면 분류기가 generic Mealy FSM(입력 X·출력 Z 날조)로
    라우팅해 원본에 없는 MUX/입출력 회로가 생성된다 (실측 오분류 사례). 순서논리 설계로 적어라.

(B) topic·interpretation에 ★ "D 플립플롭" + "상태도" + "게이트 설계"(또는 "순서논리회로 설계") 단어 명시 ★
    예: "D 플립플롭 2개로 자율 상태도를 구현하는 순서논리회로 설계 — 다음상태·D입력·게이트 도출"
    ★ 절대 금지 ★: "상태 전이도 분석"·"FSM 회로" 같이 'D 플립플롭'·'설계'·'게이트' 단어를 빠뜨리는 것.

(C) relatedConcepts 배열에 ★ 최소 4개 ★ 포함:
    "D 플립플롭", "상태도", "상태표", "게이트", "순서논리회로", "다음 상태", "K-map 최소화", "SOP" 중 4개 이상.

(D) ★ 입력 X·출력 Z/y를 만들어내지 마라 ★ — 자율 순환이므로 외부 입력·출력 신호가 없다.
    signals.inputs는 비우거나 현재상태(Q_A·Q_B)만. 화살표 라벨을 "x/y"로 날조 금지.

(E) ★ 빈칸 마커 ㉠㉡㉢㉣(다음상태)·㉮㉯(게이트) 정확히 transcribe ★ — fillInTheBlanks에 그대로 박아라.

★ 이 형식이 ★ 아닌 ★ 경우 (양보): 화살표에 x/y 라벨 있으면(Mealy) → fsm. "J-K 플립플롭" 명시 → J-K.
  "T 플립플롭"·외부입력 C → T-FF. SR 플립플롭 + MUX → SR-MUX 순차설계.

(이 케이스는 분류기가 dff_state_design path로 라우팅하여 (가) 상태도 + (나) 상태표(㉠~㉣ 빈칸) +
(다) D-FF 2개 + 게이트(㉮·㉯) 구현 회로의 3 figure가 결정론 생성된다.)

【★ digital_logic 진리표 → 간략화 회로 + ㉠ 빈칸 게이트 — 절대 추출 규칙 (kmap_sop truthTableBlank 라우팅 핵심, 임용 5번 정보과)】

다음 시각 단서 ★ 두 가지 이상 ★ 보이면 임용 5번 정보과 형식이다:
  (1) (가) figure가 ★ 진리표 ★ — 행 16개(4-변수, W X Y Z 입력) 또는 8개(3-변수) + 출력 컬럼 F
      ★ 입력 컬럼 라벨이 "W X Y Z" 또는 "A B C D" — K-map이 아니라 ★ truth table ★ ★
  (2) 진리표에 ★ don't care 행 ★ — 출력 컬럼에 "×" 또는 "x" 또는 "d" 표기 (일부 행)
  (3) (나) figure가 간략화된 ★ 조합논리회로 ★ — 인버터(NOT) 1~2개 + AND/OR 게이트 + ★ ㉠ 빈칸 게이트 ★
  (4) 회로 내부에 ★ 점선박스(dashed rectangle) ★ — 일부 게이트 영역 표시
  (5) [해석 절차] 박스 + [단계 1] K-map 도출, [단계 2] 최소 SOP + ㉠ 게이트, [단계 3] 점선 부분 게이트
  (6) 본문에 "표 (가)는 어떤 조합논리회로의 진리표이고, 그림 (나)는 …" 류 문구

이 경우 ★ 반드시 ★ 다음을 만족:

(A) topicKey = "kmap_sop" 명시 ★ 강제 ★
    ❌ "combinational_gate" 또는 "fsm" 절대 금지 — combinational_gate는 (가)=K-map 두 개 형식이라 다르다.

(B) topic 또는 interpretation에 ★ "진리표" 단어 명시 ★
    예: "(가) 진리표 + (나) 간략화된 조합논리회로에서 ㉠ 빈칸 게이트와 점선 부분 게이트 식별".
    ★ 절대 금지 ★: "카르노맵 구현"·"K-map 회로" 같은 표현만 사용 (진리표 단어 누락). 카르노맵은 풀이 산출물이지 (가) figure가 아니다.

(C) relatedConcepts 배열에 ★ 최소 4개 ★ 포함:
    "진리표", "don't care", "K-map 최소화", "최소 SOP", "조합논리회로", "빈칸 게이트", "점선 부분 게이트" 중 4개 이상.

(D) interpretation에 ★ ㉠ 마커 정확 transcribe ★ — 원본의 ㉠·㉡·㉢ Unicode 마커 그대로.

(E) signals에 ★ 단일 출력 ★ 명시:
    "signals": { "inputs": ["W","X","Y","Z"], "outputs": ["F"] }   // 변수명은 원본 그대로
    ★ 절대 금지 ★: outputs를 ["F","G"]·["X","Y"]로 늘리지 마라 — 원본은 단일 출력.

(F) fillInTheBlanks에 ㉠ 마커 sentence 포함:
    예: { "sentence": "그림 (나)에서 ㉠에 들어갈 1개의 논리게이트를 구하시오.", "answer": "..." }

(G) figureRequirements에 2개 figure 명시:
    [
      { "role": "truth_table",            "diagramType": "truth_table",  "scope": "single", "required": true },
      { "role": "implementation_circuit", "diagramType": "logic_network", "scope": "single", "required": true }
    ]
    ⚠️ K-map figure는 ★ (가)/(나)에 추가하지 마라 ★ — 풀이 [단계 1] 산출물.

★ 잘못된 추출 (절대 금지) ★:
  - topicKey="combinational_gate" 잘못 지정 → 분류기가 (가)=K-map 2개 path로 라우팅하여 원본에 없는 K-map figure가 (가)로 생성됨 (사용자가 실제 신고함).
  - outputs를 ["F","G"]로 multi-output 추출 → 원본은 단일 F. 변수도 W,X,Y,Z인데 A,B,C 3-변수로 축소 금지.
  - 진리표를 K-map으로 잘못 읽기 — (가)의 행이 16개 + 입력 4컬럼(W,X,Y,Z) + 출력 1컬럼(F)이면 ★ truth table ★.
  - 진리표 단어 누락 → 분류기가 진리표 분기 매치 실패하여 combinational_gate로 fallback.

(이 케이스는 분류기가 kmap_sop path with truthTableBlank=true 로 라우팅하여 (가) 진리표 + (나) ㉠ 빈칸 회로 2 figure만 생성된다.)

【★ digital_logic 다중 함수 Σm 정의 + 빈 K-map + 회로 입력 ㉠㉡㉢ 빈칸 — 절대 추출 규칙 (universal_digital sharedTermInputBlank 라우팅 핵심, 임용 7번 다중함수 공유항 형식)】

다음 시각 단서 ★ 두 가지 이상 ★ 보이면 다중 함수 공유항·입력결정 형식이다:
  (1) 식 (가)가 ★ 2~3개의 불 함수가 Σm 표기로 주어짐 ★ — 예: F(X,Y,Z) = Σm(2,4,5), G(X,Y,Z) = Σm(2,6,7)
      ★ K-map이 채워져 주어지는 게 아니라 함수가 "식"으로 주어진다 ★
  (2) (나) figure가 ★ 빈 K-map ★ — 셀이 채워져 있지 않은 카르노 도 템플릿 (학생이 채움)
  (3) (다) figure가 조합논리회로 — ★ 입력 라인에 ㉠·㉡·㉢ 빈칸 마커 ★ (게이트가 아니라 ★ 입력 ★이 빈칸)
      게이트(NOT·AND·OR)는 모두 그려져 있고, 어느 입력변수가 어느 라인인지가 미정
  (4) [해석 절차] 박스 + 3단계:
      [단계 1] 각 함수의 카르노 도 작성 → [단계 2] 중복되는 논리식 항 → [단계 3] ㉠㉡㉢에 들어갈 입력변수 결정

이 경우 ★ 반드시 ★ 다음을 만족:

(A) interpretation에 ★ 함수 정의식 원문 그대로 transcribe ★
    "F(X, Y, Z) = Σm(2, 4, 5)" 형식 — Σ·m·괄호·minterm 숫자 모두 보존. 의역 금지.

(B) interpretation 또는 fillInTheBlanks에 ★ 해석 절차 단계 원문 transcribe ★
    특히 "중복되는 논리식 항"과 "㉠, ㉡, ㉢에 들어갈 입력변수" 문구를 ★ 원문 그대로 ★.
    예: { "sentence": "[단계 3] (다)의 ㉠, ㉡, ㉢에 들어갈 입력변수를 순서대로 구한다.", "answer": "..." }

(C) 빈칸 마커는 원본 그대로 (㉠㉡㉢). ⓐⓑⓒ로 바꾸지 말 것.
    ★ 절대 금지 ★: "들어갈 게이트를 결정"으로 쓰기 — 이 형식은 ★ 입력변수 ★를 결정하는 문제다.

(D) signals에:
    "signals": { "inputs": ["X","Y","Z"], "outputs": ["F","G"] }   // 함수 시그니처의 변수·함수명 그대로

(E) figureRequirements에 2개 figure 명시:
    [
      { "role": "kmap",                   "diagramType": "kmap",          "scope": "single", "required": true },
      { "role": "implementation_circuit", "diagramType": "logic_network", "scope": "single", "required": true }
    ]

★ 잘못된 추출 (절대 금지) ★:
  - "㉠㉡㉢에 들어갈 게이트를 결정" — 게이트가 아니라 ★ 입력변수 ★. 회로의 게이트는 모두 그려져 있다.
  - 함수 정의 Σm 표기 누락/의역 → 분류기가 sharedTermInputBlank 라우팅 못 함.
  - 함수 2개를 4개로 늘리거나(f_1~f_4) 변수 3개를 4개로 늘리기(A,B,C,D).
  - "중복되는" 단어를 다른 말로 의역 — 원문 그대로 보존.
  - 이 형식을 "multi-stage 결합 → 최종 출력 Z 계산" 문제로 해석 — 방향이 반대다.

(이 케이스는 분류기가 universal_digital + sharedTermInputBlank param으로 라우팅하여
(나) 빈 K-map + (다) 입력 ㉠㉡㉢ 빈칸 회로가 원본의 "입력 결정" 방향 그대로 생성된다.)

【★ digital_logic T-FF 2개 + 상태표 빈칸 + K-map 도출 — 절대 추출 규칙 (tff_state_table_blank 라우팅 핵심, 임용 7번 정보과)】

다음 시각 단서 ★ 두 가지 이상 ★ 보이면 임용 7번 정보과 형식이다:
  (1) (가) figure가 ★ 순서논리회로 ★ — NOR/NAND 게이트(조합부) + ★ T-FF 2개 ★ (라벨 T_A·T_B 또는 A·B) + Q_A·Q_B 출력 + Q_A'/Q_B' 반전 feedback + 공통 clock
      ★ JK-FF·D-FF 아님 — 정확히 T-FF 2개 ★
  (2) 외부 입력 ★ 단일 신호 C ★ (X·Y 같은 다중 외부 입력 아님)
  (3) (나) figure가 ★ 상태표 ★ — 컬럼: [현재상태 Q_A(t)·Q_B(t)] [입력 C] [다음상태 Q_A(t+1)·Q_B(t+1)]
      ★ 8행 (Q_A·Q_B·C 3-비트 조합) ★
  (4) 상태표 일부 셀에 ★ 빈칸 마커 ㉠·㉡·㉢·㉣·㉤·㉥·㉦·㉧ ★ — 학생이 채울 자리
  (5) [해석 절차] 박스 + 3단계:
      [단계 1] (가) 회로의 T_A·T_B 입력식 도출
      [단계 2] (나)의 빈칸 ㉠~㉧ 채우기
      [단계 3] Q_A(t+1)·Q_B(t+1) K-map 작성 + 최소화된 불 함수

이 경우 ★ 반드시 ★ 다음을 만족:

(A) topicKey = "flipflop_counter" 또는 "fsm" — 정확한 enum 없으므로 둘 중 하나. 분류기는 시각 단서로 tff_state_table_blank로 재라우팅한다.
    ❌ "kmap_sop" 절대 금지 — (가)가 진리표가 아니다.

(B) topic 또는 interpretation에 ★ "T 플립플롭" + "상태표" 단어 명시 ★
    예: "T 플립플롭 A·B 2개 + 입력 C → 상태표 빈칸 + K-map 도출"
    ★ 절대 금지 ★: "순차논리회로 분석" 같은 일반 표현만 사용 (T 플립플롭·상태표 단어 누락).

(C) relatedConcepts 배열에 ★ 최소 4개 ★ 포함:
    "T 플립플롭", "순서논리회로", "상태표", "K-map 최소화", "최소화된 불 함수",
    "Q_A·Q_B 출력", "조합부 입력식" 중 4개 이상.

(D) interpretation에 ★ ㉠~㉧ 마커 정확 transcribe ★ — 원본 빈칸 갯수 보존.

(E) signals에:
    "signals": { "inputs": ["C", "CLK"], "outputs": ["Q_A", "Q_B"] }
    ★ 절대 금지 ★: outputs를 ["F"·"G"]로 추출하지 마라 — 상태 변수 Q_A·Q_B.

(F) componentInventory에 ★ T-FF 정확히 2개 ★:
    [{ "id": "TFF_A", "type": "TFF" }, { "id": "TFF_B", "type": "TFF" }]
    ❌ "DFF"·"JKFF" 절대 금지 — type="TFF".

(G) fillInTheBlanks에 ㉠~㉧ sentence 포함:
    예: { "sentence": "(나) 상태표의 ㉠~㉧에 들어갈 다음 상태 Q_A(t+1)·Q_B(t+1) 값을 구하시오.", "answer": "..." }

(H) figureRequirements에 2개 figure 명시:
    [
      { "role": "implementation_circuit", "diagramType": "logic_network", "scope": "single", "required": true },
      { "role": "truth_table",            "diagramType": "truth_table",   "scope": "single", "required": true }
    ]
    ⚠️ waveform·K-map figure는 (가)/(나)에 추가하지 마라 — K-map은 풀이 [단계 3] 산출물.

★ 잘못된 추출 (절대 금지) ★:
  - JK-FF 또는 D-FF로 잘못 추출 → T-FF 2개 정확히. 도장 모양(T 표기)을 확인.
  - 외부 입력을 X·Y 다중으로 추출 → 정확히 C 단일.
  - outputs를 ["F","G"] 같은 임의 라벨로 → Q_A·Q_B 상태 변수.
  - 빈칸 마커 ㉠~㉧을 누락 → 학생 채울 자리 없어짐.

【★ digital_logic J-K 플립플롭 상태도 + 상태표 빈칸 — 절대 추출 규칙 (fsm JK 상태표 모드 라우팅 핵심, 임용 9번 전자)】

다음 시각 단서 ★ 두 가지 이상 ★ 보이면 J-K 플립플롭 상태도 형식이다:
  (1) (가) figure가 ★ 상태도(state diagram) ★ — 원(동그라미) 노드 4개, 각 노드 안에 2비트 상태(00·01·11·10),
      노드 사이 화살표에 "x/y" 형식 전이 라벨 (Mealy)
  (2) 본문에 ★ "J-K 플립플롭" (또는 JK 플립플롭) ★ 명시 — 출력 A·B를 갖는 두 개의 J-K 플립플롭
  (3) (나) figure가 ★ 상태표 ★ — 컬럼: [현재 상태 A·B] [차기 상태 x=0·x=1] [출력 y]
      일부 행의 셀에 ★ 빈칸 마커 ㉠~㉥ ★
  (4) [해석 절차] 박스 + 3단계:
      [단계 1] 상태표 빈칸 ㉠~㉥ 채우기 → [단계 2] 출력 y의 논리식 → [단계 3] J_A·J_B의 최소화된 논리식

이 경우 ★ 반드시 ★ 다음을 만족:

(A) topicKey = "fsm" 명시 ★ 강제 ★
    ❌ "switching_circuit" ★ 절대 금지 ★ — 순서논리회로의 "상태 전이"는 회로이론의 "스위칭"이 아니다.
    ❌ "flipflop_counter"·"sequence_detector"도 금지 — 카운터/검출기가 아니라 일반 FSM 상태도 해석.

(B) topic 또는 interpretation에 ★ "J-K 플립플롭" + "상태도" + "상태표" 단어 명시 ★
    예: "J-K 플립플롭 2개(출력 A·B)로 구성된 순서논리회로의 상태도와 상태표 해석"
    ★ 절대 금지 ★: "스위칭 회로"·"상태 변화 회로" 같은 회로이론 표현 사용.

(C) relatedConcepts 배열에 ★ 최소 4개 ★ 포함:
    "J-K 플립플롭", "상태도", "상태표", "Mealy", "순서논리회로", "여기표(excitation table)",
    "K-map 최소화", "플립플롭 입력식" 중 4개 이상.

(D) interpretation 또는 fillInTheBlanks에 ★ 해석 절차 단계 원문 transcribe ★
    특히 "출력 y의 논리식"과 "입력 J_A와 입력 J_B의 최소화된 논리식" 문구 그대로.
    빈칸 마커 ㉠~㉥도 원문 그대로 (○1·○2 등으로 바꾸지 말 것).

(E) signals에:
    "signals": { "inputs": ["x", "CLK"], "outputs": ["A", "B", "y"] }   // 원본 라벨 그대로
    ★ 절대 금지 ★: 상태 변수를 Q1·Q0로 임의 개명.

(F) componentInventory에 ★ JK-FF 정확히 2개 ★:
    [{ "id": "JKFF_A", "type": "JKFF" }, { "id": "JKFF_B", "type": "JKFF" }]
    ❌ "DFF"·"TFF" 절대 금지 — type="JKFF". R·V·SW 같은 아날로그 소자 inventory 금지.

(G) figureRequirements에 2개 figure 명시:
    [
      { "role": "state_diagram", "diagramType": "concept_diagram", "scope": "single", "required": true },
      { "role": "truth_table",   "diagramType": "truth_table",     "scope": "single", "required": true }
    ]
    ⚠️ implementation_circuit(회로도)·waveform은 절대 추가하지 마라 — 원본에 회로도 figure 없음.

★ 잘못된 추출 (절대 금지) ★:
  - topicKey="switching_circuit" → 분류기가 회로이론 switched_dc로 오분류 → 디지털 dispatch 실패 →
    GPT 자유 생성으로 추락해 D 플립플롭·빈 상태도 문제가 생성됨 (사용자가 실제 신고함).
  - J-K 플립플롭을 D 플립플롭으로 바꾸기 → 원본의 학습 목표(JK 여기표 적용)가 소실됨.
  - 상태도를 "스위치 상태 변화"로 해석 → semantic.hasStateTransition은 디지털 순서논리의 상태 전이를 의미.
  - 빈칸 마커 ㉠~㉥ 누락 또는 ○1~○6으로 변형.

(이 케이스는 분류기가 fsm + ffTypes=["JK"]·hasStateTable=true params로 라우팅하여
(가) 상태도 + (나) 상태표(빈칸 ㉠~㉥)가 원본의 "빈칸 → y 논리식 → J_A·J_B 식" 방향 그대로 생성된다.)

(이 케이스는 분류기가 tff_state_table_blank path로 라우팅하여 (가) T-FF 2개 회로 + (나) 상태표(빈칸) 2 figure만 생성된다. K-map은 풀이 [단계 3] 산출물.)

【★ circuit_theory AC + 인덕터 임피던스 표기 — 절대 추출 규칙 (universal_ac 라우팅 핵심, 임용 8번 정보과 RL 응용회로)】

다음 시각 단서 ★ 두 가지 이상 ★ 보이면 임용 8번 RL 응용회로 형식이다:
  (1) AC 단일 전압원 V = u(t) = V_m cos(ωt) 또는 phasor (V∠0°V)
  (2) ★ 인덕터를 임피던스 표기 ★ — "j(2/3)Ω", "j2Ω", "j10Ω", "jXΩ" 등. 코일(나선) 심볼 + Ω 단위 라벨.
  (3) 저항 2개 이상 vertical leg (1Ω·2Ω 같은 정수)
  (4) 인덕터·R·R가 전원에 ★ 병렬 ★ 또는 인덕터 직렬 + R·R 병렬 토폴로지
  (5) [해석 절차] 박스 + 3단계: [단계 1] 전원 공급 평균전력, [단계 2] 인덕터 평균전력, [단계 3] 각 R 평균전력

이 경우 ★ 반드시 ★ 다음을 만족:

(A) topicKey = "rlc_response" 또는 "ac_analysis" — 가능한 topicKey 중 하나.

(B) componentInventory 추출 ★ 절대 규칙 ★:
    - "j숫자Ω" 또는 "j수식Ω" 표기는 ★ 인덕터 L (type="L") ★ — 절대 current source(I)로 추출하지 마라.
      예: "j(2/3)Ω" → { id:"L1", type:"L", value:"j(2/3)Ω" }
      예: "j2Ω" → { id:"L1", type:"L", value:"j2Ω" }
      예: "j10Ω" → { id:"L1", type:"L", value:"j10Ω" }
    - 코일/나선(spiral) 심볼이 있는 것은 ★ 무조건 L ★ — 그 옆 라벨이 임피던스(jXΩ)이든 인덕턴스(H)이든 상관없이.
    - "-j숫자Ω" 표기는 ★ 캐패시터 C (type="C") ★. current source 아님.
    - current source는 화살표가 있는 ⊕ 또는 (↑) 심볼만.

(C) topologySignature.branches 정확 추출 — V와 L의 토폴로지 관계를 ★ 시각 단서로 정확히 분리 ★ :
    - 원본 임용 8번은 ★ V·L이 직렬 ★ (V는 좌측 vertical, L은 상단 horizontal로 V 위에서 우측으로) +
      ★ R·R이 우측에서 V 음극으로 병렬 ★ — 즉 V·L과 R·R가 같은 노드 쌍에 있지 않다.
    - ★ 절대 금지 ★: V·L·R·R 모두 같은 두 노드 사이 4-leg parallel로 묘사. 그건 V와 L이 단락 병렬되어 회로가 깨짐.
    - ★ 정확한 betweenNodes ★ (3-노드 토폴로지: n_a = V 양극 = L 좌측, n_b = L 우측 = R 분기점, GND = V 음극 = R 하단):
      [
        { role: "voltage_source_leg", components:["V"],   betweenNodes:["n_a","GND"] },
        { role: "load_leg",           components:["L"],   betweenNodes:["n_a","n_b"]  },
        { role: "load_leg",           components:["R_1"], betweenNodes:["n_b","GND"] },
        { role: "load_leg",           components:["R_2"], betweenNodes:["n_b","GND"] }
      ]
    - 인덕터가 horizontal 상단이면 ★ 반드시 ★ n_a와 n_b 두 노드를 분리. V 양극은 n_a, R 두 개 위쪽은 n_b. n_a ≠ n_b.
    - 노드 식별 휴리스틱: 코일(나선) 심볼이 어떤 두 노드 사이에 있는지 시각 위치로 확인 (V 위쪽 노드와 R 위쪽 노드는 다르다 — L이 그 사이에 위치).

(D) topic 또는 interpretation에 "평균전력" + "교류" + "인덕터" 명시.

(E) signals에:
    "signals": { "inputs": ["V"], "outputs": ["P_avg", "P_L", "P_R1", "P_R2"] }
    또는 평균전력 변수 explicit.

★ 잘못된 추출 (절대 금지) ★:
  - "j2Ω" 라벨을 current source(I=j2A)로 잘못 추출 — j는 임피던스의 허수부 표기. type="L"이 맞다.
  - 인덕터를 음의 임피던스(-j) 캐패시터로 잘못 추출.
  - 회로 토폴로지를 V→L→R_1→R_2 직렬 1-mesh로 단순화. 원본은 병렬 토폴로지.

(이 케이스는 분류기가 universal_ac path with maxAvgPower query로 라우팅하여 phasor MNA로 평균전력 3개 도출.)

【★ circuit_theory 직류+교류 전압원 + 스위치 단자 + 정상상태 중첩 — 절대 추출 규칙 (universal_ac acDcSuperposition 라우팅 핵심, 임용 2022 B-6 RL 응용회로)】

다음 시각 단서 ★ 두 가지 이상 ★ 보이면 직류+교류 중첩 형식이다:
  (1) ★ 직류 전압원 ★ (+/− 표기, 예 "10V") 과 ★ 교류 전압원 ★ (∿ 심볼, 예 "10√2 sin4000t V") 둘 다 존재
  (2) 스위치 SW₁·SW₂ + 단자1·단자2·단자3·단자4 라벨 (각 전원을 연결/분리하는 단자 선택 스위치)
  (3) 본문/해석절차에 "정상 상태 응답(steady state response)" 명시
  (4) [해석 절차] 박스 + 단계: [단계 1] 직류만 연결 I_DC, [단계 2] 교류만 연결 i_ac(t), [단계 3] 둘 다 연결 (중첩)
  (5) 인덕터 2개 병렬 (예 1H ∥ 1/9H) 또는 단일 인덕터 + 저항들

이 경우 ★ 반드시 ★ 다음을 만족:

(A) topic·interpretation에 ★ "교류" 와 "정상 상태" 두 단어를 반드시 포함 ★ 하라.
    예: "직류·교류 전압원이 스위치로 연결된 RL 회로의 정상 상태 응답 중첩 해석"
    ❌ "스위치가 있는 RL 회로" 처럼 교류 언급을 빠뜨리는 것 절대 금지 — 분류기가 과도응답으로 오분류함.

(B) componentInventory 추출 ★ 절대 규칙 ★:
    - 직류 전압원: { "type":"V", "value":"10V" }
    - 교류 전압원: { "type":"V", "value":"10√2 sin4000t V" } — ★ sin 식 원문 그대로 ★ (환산·생략 금지)
    - 스위치: { "type":"SW" } 각각 별도 entry (SW₁, SW₂)
    - 인덕터: H 단위 원문 그대로 ("1H", "1/9H" — 분수 표기 보존)

(C) 이 형식은 ★ 과도응답(transient)이 아니다 ★ — 스위치는 전원 선택용(단자 연결)이다.
    semantic.hasWaveformEvolution = false, semantic.hasStateTransition = false 로 마킹하라.
    ❌ "스위치가 있으니 과도응답/스위칭 회로"로 해석하는 것 절대 금지.

(D) 해석 절차 박스의 [단계 1]·[단계 2]·[단계 3] 텍스트를 interpretation 또는 fillInTheBlanks에 transcribe하라
    (특히 "I_DC", "i_ac(t)", "정상 상태" 같은 기호·용어 원문 보존).

(이 케이스는 분류기가 universal_ac acDcSuperposition 모드로 라우팅하여 DC 패스 + AC 패스 + 중첩으로 해석.)

【★ circuit_theory Thevenin + Switched RC + 다단계 — 절대 추출 규칙 (thevenin_switched_rc 라우팅 핵심)】

다음 시각 단서 ★ 두 가지 이상 ★ 보이면 imyong 9 정보과 형식 (Thevenin + Switched RC)이다:
  (1) DC 전압원 (V_s = 10V 등, +/- 표기) + DC 전류원 (I_s = 4A 등, 화살표)
  (2) SW (SPDT, 단자1·단자2 라벨, t=0 표기)
  (3) 캐패시터 ≥ 1 (C_1, C_2 — F 단위, 보통 0.1·0.4 같은 분수)
  (4) ★ 점선박스 ★ — 회로의 일부분을 점선(dashed) 테두리로 묶음
  (5) (나) 두 번째 figure에 "V_Th" / "R_Th" 또는 "테브난 등가회로" 라벨
  (6) <해석 절차> 박스 + [단계 1]·[단계 2]·[단계 3] 형식

이 경우 ★ 반드시 ★ 다음을 만족:

(A) topic 또는 interpretation에 ★ "테브난 등가" 또는 "Thevenin equivalent" 단어 ★ 명시
    예: "RC 응용 회로 + 스위치 + 테브난 등가회로 다단계 풀이"
    ★ 절대 금지 ★: "AC 회로", "교류 다중 전원" 같은 잘못된 표현 (DC 회로다).
    ★ 절대 금지 ★: "공진", "페이저", "주파수응답" 같은 AC 키워드 (DC + RC step response).

(B) relatedConcepts에 다음 단어 ★ 4개 이상 ★:
    "테브난 등가", "정상상태", "RC 시정수", "RC 과도응답", "스위칭 회로", "캐패시터 충전",
    "직류 전원", "다단계 풀이" 중에서 4개 이상.

(C) interpretation에 ★ "점선박스" 또는 "점선 부분" 또는 "등가회로 대상" ★ 명시
    예: "그림 (나)는 (가)의 점선 부분을 테브난 등가회로로 나타낸 것이다."

(D) interpretation에 ★ "t<0 정상상태" 및 "t≥0 RC step" ★ 명시
    예: "t<0에서 스위치는 단자1에 연결되어 직류 정상상태. t=0에 단자2로 이동."

(E) componentInventory에 ★ DC 형식으로 ★ source value 표기:
    올바름 ✓: V (value="10V"), I (value="4A")
    잘못   ✗: V (value="10∠0°V"), I (value="4∠0°A") — phasor 표기 금지 (DC다)

(F) topicKey = "switching_circuit" 또는 누락. (sequence_detector·fsm 등 디지털 키 절대 금지.)

(G) figureRequirements:
    [
      { "role": "original_circuit",   "diagramType": "analog_netlist", "scope": "single", "required": true },
      { "role": "equivalent_circuit", "diagramType": "analog_netlist", "scope": "single", "required": true }
    ]

★ 잘못된 추출 (절대 금지) ★:
  - DC 전원을 AC phasor(25∠30°V 등)로 잘못 변환 → ac_superposition으로 오라우팅
  - "교류"·"페이저"·"공진" 키워드를 잘못 부여 → AC archetype 라우팅
  - 점선박스 부분만 분석하고 좌측 RC 부분 누락
  - 단자1/단자2 SW 구조를 단순 SW로 단순화

(이 케이스는 분류기가 thevenin_switched_rc path로 라우팅하여 (가) 원본 회로 + (나) Thevenin
등가 회로 2 figure가 생성되고, 3단계 풀이(v_o(0⁻) / V_Th·R_Th / v_o(t))가 자동 도출된다.)

【★ electronics 2-OPAMP cascade — 절대 추출 규칙 (opamp_cascade_voltage_divider 라우팅 핵심)】

다음 시각 단서 중 ★ 두 개 이상 ★ 보이면 임용 10번 형식 (2-OPAMP cascade)이다:
  (1) OPAMP 심볼(삼각형, U_1·U_2 라벨) 2개 이상 — 좌·우로 cascade 배치
  (2) 좌측 OPAMP 출력 → 우측 OPAMP V⁻ 입력으로 R 통해 cascade 연결
  (3) 각 OPAMP에 별도 feedback resistor (R_3, R_5 또는 유사)
  (4) 본문에 "각 단계별로", "단계 1·2·3", "V_s/V_o", "V_o/V_i", "전달함수" 키워드
  (5) "안정한 선형영역에서 동작, 입력 임피던스 무한대, 출력 임피던스 영(0)" 류 OPAMP 가정

이 경우 ★ 반드시 ★ 다음을 만족:

(A) componentInventory에 ★ OPAMP 2개 ★ 모두 추출 (id U_1, U_2 또는 OPAMP1, OPAMP2)
    원본 figure에 OPAMP 심볼이 2개 보이면 inventory에 OPAMP type 2 entries.
    ★ 절대 금지 ★: OPAMP 1개만 추출하거나, OPAMP 3개 잘못 추출.

(B) topic 또는 interpretation에 ★ "2-OPAMP cascade" 또는 "두 개의 연산증폭기" 또는
    "cascade" 또는 "캐스케이드" 또는 "다단 증폭기" 단어 ★ 명시 ★
    예: "2-OPAMP cascade 응용 회로", "두 단계 연산증폭기 cascade로 V_s/V_i 전달함수 도출"
    ★ 절대 금지 ★: "단일 연산증폭기 회로", "Wien Bridge", "발진기", "정귀환" 같은 단일 OPAMP 표현.

(C) topicKey = "opamp" (electronics subject 기준)

(D) relatedConcepts에 다음 단어 ★ 4개 이상 ★ 포함:
    "OPAMP", "연산증폭기", "cascade", "다단", "전달함수", "V_o/V_i", "V_s/V_o",
    "반전 증폭기", "이상 OPAMP", "virtual ground", "KCL" 중 4개 이상.

(E) figureRequirements: 단일 figure (main_circuit / analog_netlist).
    추가 figure (블록도, 등가회로 등) 불필요.

★ 잘못된 추출 (절대 금지) ★:
  - OPAMP 2개를 1개로 잘못 카운트 → opamp_cascade_voltage_divider rule 매치 실패 →
    Wien Bridge oscillator(단일 OPAMP) 또는 dc_dependent_source로 잘못 라우팅
  - subject를 circuit_theory로 추출 (전자회로 영역이어야)
  - cascade 키워드 누락 → classifier가 단일 opamp archetype으로 fallback
  - Wien Bridge / 정귀환 / 발진 같은 단일 OPAMP 표현으로 잘못 묘사

(이 케이스는 분류기가 opamp_cascade_voltage_divider path로 라우팅하여 2-OPAMP cascade
fixed-slot circuit + 3단계 풀이(V_s/V_o, V_o/V_i, V_s/V_i)가 자동 도출된다.)

【digital_logic MUX 등가구현 — 절대 추출 규칙】
원본 figure에 사다리꼴 box (좌측에 I_0·I_1·I_2·I_3, 하단에 S_0·S_1, 우측에 F) 또는 "MUX"/"멀티플렉서" 라벨이 있는 figure가 보이면, 이 문제는 MUX 등가구현 형식(임용 5번 형식)이다. 반드시:
- topic 또는 interpretation에 "MUX" 또는 "멀티플렉서"라는 정확한 단어를 포함시킬 것. (예: "조합논리회로를 4×1 MUX로 등가구현")
- relatedConcepts 배열에 다음 단어를 모두 명시: ["멀티플렉서", "MUX", "선택선", "S_0", "S_1", "I_0", "I_1", "POS", "SOP"] (최소 5개 이상)
- topicKey는 "combinational_gate" 사용 (별도 mux topicKey 없음)
- figureRequirements에는 (가) implementation_circuit + (나) MUX figure 두 개 모두 명시: {role:"main_circuit", diagramType:"logic_network", scope:"single", required:true}, {role:"implementation_circuit", diagramType:"mux_diagram", scope:"single", required:true}
- 학생 채울 빈칸이 MUX 입력에 표시(㉠, ㉡ 등)되어 있으면 fillInTheBlanks에 marker와 함께 명시.

→ 잘못된 추출 (절대 금지):
- MUX 모양(사다리꼴+I·S·F 핀)을 보고도 topic에 "조합논리회로 구현"이라고만 적고 "MUX" 단어 누락
- relatedConcepts에 "AND·OR·NOT" 같은 일반 단어만 적고 "멀티플렉서"·"선택선" 단어 누락
- (나) 두 번째 figure를 누락하고 단일 figure로 처리

【★ 절대 규칙: semantic node = role-based 식별】
topologySignature.branches의 모든 node id는 ★ semantic role을 가지는 노드 ★ 여야 한다.

semantic role (정확히 4가지):
  - ground:        GND 노드. 회로의 0V 기준.
  - source_plus:   V/I 소스의 비-GND 단자 (V의 +단자 / I의 입력측).
  - main_unknown:  주 측정 노드. 가변 R 또는 R_L(부하 placeholder)이 매달려 학생이 풀어야 할 핵심 노드.
  - right_unknown: 보조 측정 노드. 고정 R load가 매달리거나 또 다른 측정 라벨이 있는 노드.

★ 절대 만들지 말 것 ★:
  - 위 4 role 중 어느 것에도 해당하지 않는 노드 (junction/intermediate/anonymous)
  - 같은 두 role 노드 사이의 직렬 chain을 위한 중간 노드
  - 두 horizontal R이 연결되어 보여도 그 사이가 어떤 role도 아니면 별도 node 만들지 말 것
    → 같은 두 role 노드 사이 1개 R로 통합 (값이 다르면 직렬 합산 또는 평행 합산은 회로해석상 부적절,
       이 경우 분석이 모호한 거니 주의)

bend point·lane point·virtual point 같은 routing artifact는 ★ 분석 결과에 포함되지 않는다 ★.
시각적 분기점은 renderer가 layout 시 별도로 처리.

role 부여 방법 — 각 추출한 node에 대해 nodeAnnotations에 role 명시:
  [
    { node: "<id_a>", label: "<원본 라벨 또는 V_s>", style: "label_only", role: "source_plus" },
    { node: "<id_b>", label: "<원본 라벨>",          style: "label_only", role: "main_unknown" },
    { node: "<id_c>", label: "<원본 라벨>",          style: "label_only", role: "right_unknown" },
    { node: "GND",    label: "GND",                  style: "label_only", role: "ground" }
  ]

★★ source_plus role 무조건 부여 — 누락 절대 금지 ★★
원본 figure에서 V 소스의 +단자 노드에 라벨이 없어도 (대부분의 imyong DC 문제에서 그렇다)
nodeAnnotations에 ★ 반드시 ★ 한 entry 추가하라:
  { node: "<V·+ 단자 node id>", label: "V_s", style: "label_only", role: "source_plus" }

- node id는 voltage_source_leg의 betweenNodes[0]과 일치시킬 것.
- label은 원본에 표기가 없으면 "V_s" 또는 그냥 빈 문자열 가능 — role 부여가 핵심.
- 이 entry 누락 시 layout/repair 단계가 V 소스를 식별 못 해 figure가 망가짐.

표준 형식 — 2-node Nodal DC (가장 흔한 universal_dc 케이스):
  semantic node 정확히 4개 + role 모두 부여.
  branches:
    V (source):       source_plus ↔ ground
    R_VAR (가변):     main_unknown ↔ ground
    R (load):         right_unknown ↔ ground
    parallel(R + I):  main_unknown ↔ right_unknown
    R (top):          source_plus ↔ main_unknown (≥ 1개)

판별 기준: figure에서 명시 라벨(V_1·V_2·V_3·V_o·a·b 등)이 보이는 위치 + V 소스 +단자만 semantic.
horizontal R 두 개가 직렬로 보여도 그 사이가 어떤 role도 부여할 만한 회로상 특징이 없으면
같은 두 role 노드 사이 1개 R로 통합 추출.

【★ 절대 규칙: dangling node 금지 — node degree ≥ 2】
topologySignature.branches에서 ★ 모든 non-ground node id는 최소 2개의 branch에 등장해야 한다 ★.
한 component(branch)에만 등장하는 node는 floating pin이고, validator가 "netlist_dangling_node" /
"analog_circuit_open" rule로 reject한다. 회로 figure가 생성되지 않고 사용자에게 노출되지 않는다.

이 규칙은 위 "semantic role" 규칙의 따름정리:
  - 모든 node는 4 role 중 하나여야 한다 → role 있는 노드는 자연히 회로에 묶여 degree ≥ 2.
  - role도 없고 degree=1인 노드는 phantom — 추출 자체가 잘못.

★ 흔한 실수 케이스: 위아래로 쌓인(stacked) 두 R을 직렬 + 중간 junction으로 잘못 추출 ★

  원본 회로에서 같은 x 위치 범위에 두 R이 위아래로 나란히 그려져 있다면:
  → 이는 ★ 같은 두 노드 사이의 평행 가지(parallel branch) ★. 직렬 아님.
  → 시각: 양 끝이 같은 vertical wire에 연결되고 가운데에 R 두 개가 stack.

  잘못된 추출 ✗:
    branches = [
      { role:"top_rail_resistor", components:[{type:"R",value:"20Ω"}], betweenNodes:["A","n_mid"] },
      { role:"top_rail_resistor", components:[{type:"R",value:"20Ω"}], betweenNodes:["n_mid","B"] }
    ]
    → 두 R을 직렬로 보고 중간에 n_mid 만듦. n_mid는 어디에도 라벨 없는 phantom.

  올바른 추출 ✓:
    branches = [
      { role:"top_rail_resistor", components:[{type:"R",value:"20Ω"}], betweenNodes:["A","B"] },
      { role:"top_rail_resistor", components:[{type:"R",value:"20Ω"}], betweenNodes:["A","B"] }
    ]
    → 같은 betweenNodes로 두 entry. 자동으로 평행 가지(mesh +1)로 처리.

  판별: 두 R의 좌·우 끝점이 같은 vertical wire(또는 같은 node label)에 연결되어 있는가?
    YES → 평행 (같은 betweenNodes)
    NO  → 직렬 (다른 betweenNodes, 단 중간 노드는 명시 라벨이 있어야 함)

★ 흔한 실수 케이스: ㄱ-자(L-shape) R을 horizontal + vertical 두 branch로 이중 추출 ★

  원본 회로에서 가장 우측 측정 노드(role: right_unknown)에서 우측·아래로 ㄱ-자로 꺾여
  GND에 떨어지는 R이 종종 있다. 이 R은 ★ 물리적으로 1개 ★.

  잘못된 추출 ✗ (validator가 reject함):
    branches = [
      { role:"top_rail_resistor", components:[{type:"R",value:"10Ω"}], betweenNodes:["right_unknown 노드", "n_right"] },
      { role:"load_leg",          components:[{type:"R",value:"10Ω"}], betweenNodes:["right_unknown 노드", "GND"] }
    ]
    → 같은 ㄱ-자 R을 두 번 추출. n_right는 어디에도 다른 연결 없는 phantom.

  올바른 추출 ✓:
    branches = [
      { role:"load_leg", components:[{type:"R",value:"10Ω"}], betweenNodes:["right_unknown 노드", "GND"] }
    ]
    → ㄱ-자 R 하나만 load_leg로. n_right 같은 phantom 노드 생성 X.

  판별: 우측 끝 R 다음에 ★ 명시 단자 a/b ●표시나 V 라벨이 있는가? ★
    YES → 그 노드는 측정점 → nodeAnnotations에 role 부여 가능 → 정당.
    NO  → ㄱ-자로 GND에 닿는 단일 R → load_leg 하나로만 추출.

좌·우 모든 끝 column에 동일 적용. role 부여 불가능한 노드 = phantom = 만들지 말 것.

【circuit_theory Multi-step DC + 가변 R — 절대 추출 규칙】
회로에 (a) DC 전원(V·I)이 있고 (b) C/L이 없으며 (c) 다음 중 하나가 있으면 "Multi-step DC + 가변 R" 형식이다:
- 회로에 가변 R 표시(점선 박스 또는 "R"만 단독 라벨된 vertical R)
- 본문에 [단계 1]…[단계 2]…[단계 3] 같은 다단계 풀이 절차
- 본문에 "R을 조정하여 V_x = N V 되도록" 같은 inverse 패턴

이 케이스는 archetype-free path(universal_dc)로 처리되므로 추출 정확도가 핵심:

(1) topologySignature.branches 빠짐없이 추출
   - top_rail_resistor: 상단 가로 R 각각을 1 branch
   - voltage_source_leg: 수직 V 소스 leg
   - current_source_leg: 수직 I 소스 leg
   - load_leg: 수직 R leg (가변 R도 load_leg). 가변 R 식별 후 별도 loadPlaceholders entry 추가.
   - V·I·R 개수가 누락 없이 componentInventory에도 정확히 카운트.
(2) nodeAnnotations에 모든 V_n / V_x 라벨 추출
   - 회로의 각 측정 노드 label("V_1", "V_3" 등)을 정확히 (style="label_only").
   - 띄엄띄엄(V_1, V_3) 정상 — V_2 없어도 둘 다 추출.
(3) loadPlaceholders에 가변 R 추가
   - {betweenNodes:[top_node, GND], label:"R", emphasize:true}
(4) fillInTheBlanks에 [단계 N] 라벨된 step 5개 (각 단계 + 알려진 조건)
(5) interpretation에 "가변", "R 조정", "V_x = N V 되도록" 같은 키워드 명시.

【few-shot — 임용 10번 패턴 (2 전원: V_s + I_s, 5R + 가변 R, 3단계 query)】
원본 회로:
  top rail: 20Ω - V_1 - 20Ω - (중간) - 10Ω - V_3
  V_1에서 GND로: 가변 R (vertical, "R" 라벨)
  V_3에서 GND로: 10Ω (vertical)
  20V 수직 전압원이 top rail 좌측 끝
  0.5A 수평 전류원이 (중간)→V_3 방향으로 top rail에 끼어있음

→ 올바른 topologySignature.branches (role-based, ★ node id는 회로별로 달라도 됨, role이 본질 ★):
  node ids 예: n_a(source_plus), n_b(main_unknown), n_c(right_unknown), GND.
  [
    { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_a","n_b"] },
    { "role":"top_rail_resistor", "components":[{"type":"R","value":"10Ω"}], "betweenNodes":["n_b","n_c"] },
    { "role":"mesh_only_branch",  "components":[{"type":"I","value":"0.5A"}], "betweenNodes":["n_b","n_c"] },
    { "role":"voltage_source_leg","components":[{"type":"V","value":"20V"}], "betweenNodes":["n_a","GND"] },
    { "role":"load_leg",          "components":[{"type":"R","value":"R"}],   "betweenNodes":["n_b","GND"] },
    { "role":"load_leg",          "components":[{"type":"R","value":"10Ω"}], "betweenNodes":["n_c","GND"] }
  ]
  features: { hasGround:true, hasMesh:true, meshCount:3 }

→ 올바른 nodeAnnotations (★ role 부여 필수 ★):
  [
    { "node":"n_a", "label":"V_s",  "style":"label_only", "role":"source_plus" },
    { "node":"n_b", "label":"V_1",  "style":"label_only", "role":"main_unknown" },
    { "node":"n_c", "label":"V_3",  "style":"label_only", "role":"right_unknown" },
    { "node":"GND", "label":"GND",  "style":"label_only", "role":"ground" }
  ]
  - label은 원본 figure에 보이는 그대로 (V_1, V_3 등 sparse 명명 OK).
  - role은 회로 구조상의 역할(★ 라벨과 무관 ★).

→ 올바른 loadPlaceholders:
  [{ "betweenNodes":["n_b","GND"], "label":"R", "emphasize":true }]

→ interpretation 예: "20V 직류 전원과 0.5A 전류원, 5개 저항(가변 R 포함)이 있는 회로. [단계 1] R=10Ω일 때 V_1·V_3 도출. [단계 2] 소비 전력 P_total. [단계 3] V_3=3.8V 되도록 R 조정 → R 값과 V_1."

→ 잘못된 추출 (절대 금지):
- "R" 단독 라벨 vertical R을 일반 저항으로 처리 (loadPlaceholders 누락)
- V_1·V_3 라벨이 보이는데 nodeAnnotations에 등록 안 함
- "0.5A" 전류원을 vertical source_leg로 추출 (원본이 horizontal mesh_only_branch면)
- 다단계 step이 있는데 fillInTheBlanks에 [단계 N] 라벨 누락
- C/L 없는 순수 DC인데 topicKey를 transient_rc·rlc_response 같은 걸로 잘못 지정
- ★ V_3 우측 끝의 10Ω을 horizontal top_rail_resistor + 별도 vertical load_leg로 이중 추출:
  같은 컴포넌트(ㄱ-자로 꺾여 vertical로 GND에 떨어지는 R)를 한 번만 추출. n_right 같은
  단자 라벨이 명시된 게 아니면 phantom 노드 만들지 말 것. (dangling node 금지 규칙)

【topologySignature.branches.betweenNodes — 4-mesh 이상 회로 정확 재현용】
회로의 mesh 개수가 3개 이상이거나 평행 branch가 있으면 **반드시 betweenNodes 필드 명시**.
미지정 시 branches가 순차 ladder로 배치되어 mesh 개수가 줄어 원본과 다른 회로로 생성된다.

표기:
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_left","n_v1"] }
  { "role":"mesh_only_branch",  "components":[{"type":"I","value":"0.5A"}], "betweenNodes":["n_v1","n_v3"] }
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_v1","n_v3"] }  ← 위와 평행 branch!

node id 컨벤션: GPT가 의미 있게 부여 (예: "n_left", "n_v1", "n_v3" 또는 "n0", "n1", "n2"). 단 GND/ground/0은 모두 ground로 인식됨.

【few-shot — 4-mesh 회로 (임용 10번 형식)】
원본 회로:
  top rail: 20Ω - V_1 - 20Ω(평행 가지 1) || I=0.5A(평행 가지 2) - V_3 - 10Ω(top R)
  여기서 V_1과 V_3 사이에 두 평행 가지 (20Ω + I_s) 가 동시에 존재 → 4 mesh.
  vertical: V_s(20V)@n_left, R(가변)@V_1, 10Ω@V_3.

→ 올바른 topologySignature.branches:
[
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_left","n_v1"] },
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"20Ω"}], "betweenNodes":["n_v1","n_v3"] },
  { "role":"mesh_only_branch",  "components":[{"type":"I","value":"0.5A"}], "betweenNodes":["n_v1","n_v3"] },
  { "role":"top_rail_resistor", "components":[{"type":"R","value":"10Ω"}], "betweenNodes":["n_v3","n_right"] },
  { "role":"voltage_source_leg","components":[{"type":"V","value":"20V"}], "betweenNodes":["n_left","GND"] },
  { "role":"load_leg",          "components":[{"type":"R","value":"R"}],   "betweenNodes":["n_v1","GND"] },
  { "role":"load_leg",          "components":[{"type":"R","value":"10Ω"}], "betweenNodes":["n_v3","GND"] }
]
nodeAnnotations:
[
  { "node":"n_v1", "label":"V_1", "style":"label_only" },
  { "node":"n_v3", "label":"V_3", "style":"label_only" }
]
features: { hasGround:true, hasMesh:true, meshCount:4 }

→ 잘못된 추출 (절대 금지):
- betweenNodes 누락 → branches 순차 배치 → mesh 개수 부족 (3 mesh가 되어 원본과 다른 직사각형 회로 생성)
- meshCount 잘못 추출 (실제 4인데 2·3으로)
- 평행 가지가 있는데 한쪽만 추출 (예: 20Ω 평행을 일렬로 직렬 배치)
- node id를 GPT가 임의로 바꿔서 nodeAnnotations와 branches가 다른 이름 쓰는 경우 (반드시 동일 node id 사용)

【★ 원리·법칙 이름만 쓰는 개념 문항 (계산 없음) — 절대 추출 규칙】
다음 단서가 보이면 이 형식이다:
  (1) ㉠·㉡ 같은 기호로 원리·법칙을 **설명하는 문장이 나열**되어 있다.
  (2) 지시문이 "설명하는 원리 또는 법칙의 이름을 순서대로 쓰시오" 처럼 ★이름만★ 요구한다.
  (3) 문제 어디에도 "구하시오"·"계산하시오"로 요구하는 **수치가 없다**. 회로 그림이 곁들여 있어도
      그것은 법칙을 **예시로 보여주는 삽화**일 뿐, 풀어야 할 회로가 아니다.
★ 이때 반드시:
(A) interpretation에 "원리·법칙의 이름을 쓰는 개념 문항이며 수치 계산이 없다"를 명시하라.
(B) ★없는 계산을 지어내지 마라★ — "각 노드의 전압을 구한다", "15Ω 저항의 전력을 계산한다" 같은
    문장을 만들어내면 안 된다. 원본에 없는 요구다. (실측: 이 날조 때문에 개념 문항이 회로 계산
    파이프라인으로 라우팅돼 접지로만 이어진 기괴한 회로도가 생성됐다.)
(C) 삽화 회로의 소자를 componentInventory에 넣더라도, 그것이 문제의 풀이 대상인 것처럼 서술하지 마라.
(D) 설명된 법칙의 **이름을 모두** relatedConcepts에 넣어라(예: 키르히호프의 전압 법칙·중첩의 원리).
※ 단, 원리 명칭을 묻고 **동시에** 특정 저항의 전력·전류를 구하라는 문제(아래 A-3 류)는 계산 문제다 — 혼동 금지.

【★ DC 중첩의 원리 + 특정 저항 전력 + 원리 명칭 쓰기 — 절대 추출 규칙 (universal_dc 라우팅, 임용 전기 A-3 류)】
다음 시각·문맥 단서가 보이면 이 형식이다:
  (1) (가) 박스에 원리 설명("여러 개의 독립 전원이 있는 회로에서 특정 소자에서의 전압이나 전류는 각 독립 전원이 단독으로 존재할 때 구한 값의 합과 같다" = 중첩의 원리 정의)
  (2) "(가)의 원리에 해당하는 명칭을 쓰고" / "원리의 명칭을 쓰시오" 같은 ★명칭 쓰기 서술형 지시★
  (3) "특정 저항(예 12[Ω])에서 소모/소비되는 전력 P[W]를 구하라" — ★전체 전력이 아니라 한 저항의 소비전력★
  (4) 회로 (나)는 ★두 개 이상의 독립 전원(전압원 + 전류원 혼합이 전형)★ + 저항 다수의 DC 회로

★ 절대 보존 규칙 (누락 시 문제가 일반 메쉬해석·전류계산으로 변질됨 — 실측 오류):
(A) interpretation·relatedConcepts에 ★ "중첩의 원리"(또는 "중첩", "superposition"), "원리의 명칭을 쓰라", "특정 저항의 소비 전력 P" ★ 를 반드시 명시하라.
    예: "중첩의 원리를 설명한 (가)의 명칭을 쓰고, 두 독립 전원 회로 (나)의 12Ω 저항에서 소비되는 전력 P를 구하는 문제. 회로는 전류원과 전압원이 혼합된 DC 회로."
(B) ★★ 전류원(원 안에 화살표 심볼, 예 "7[A]")은 반드시 componentInventory·branches에 type "I" 로 추출하라 ★★.
    절대로 전압원(type "V")으로 오독·병합하지 마라. (실측 오류: 전류원 7A를 전압원으로 읽어 "전압원 2개"로 변질 → 중첩 문제가 단순 메쉬해석으로 변함.)
    전압원(원 안에 +/− 또는 원통 배터리, 예 "42[V]")은 type "V". 두 전원의 종류를 정확히 구분하라.
(C) 전력을 묻는 대상 저항의 값을 interpretation에 그대로 보존하라(예 "12Ω 저항의 소비 전력"). 그래야 생성기가 그 저항을 지목한다.
(D) topicKey는 circuit_theory 계열(nodal_analysis·mesh_analysis·dc_resistive 등). C/L 없는 순수 DC.
(E) ★ 개념형 소문항(명칭 쓰기)은 nodeAnnotations의 V_n 측정노드 질문으로 대체하지 마라 ★ — 원본이 노드전압을 안 물으면 억지 V_1·V_2 라벨을 fillInTheBlanks 단계로 만들지 마라. 원본이 묻는 건 "원리 명칭 + 특정 저항 전력" 딱 두 가지다.

★ 잘못된 추출 (절대 금지):
- 전류원(화살표)을 전압원으로 추출 → 전압원 2개로 변질 (중첩 구조·혼합전원 소실)
- "중첩의 원리"·"명칭 쓰기"를 흘려 일반 "R2를 통과하는 전류 I를 구하라" 문제로 변질
- 특정 저항 전력을 "전체 소비 전력(총합)"으로 잘못 요약
- 원리 명칭 소문항을 노드전압 질문으로 대체`;
}

function isValidAnalysis(x: unknown, subject: SubjectKey): x is AnalysisResult {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.topic !== "string" || typeof o.interpretation !== "string") return false;
  if (!Array.isArray(o.relatedConcepts) || !o.relatedConcepts.every((c) => typeof c === "string")) return false;
  if (!Array.isArray(o.fillInTheBlanks)) return false;
  if (!o.fillInTheBlanks.every(
    (b) => b && typeof b === "object" &&
      typeof (b as Record<string, unknown>).sentence === "string" &&
      typeof (b as Record<string, unknown>).answer === "string"
  )) return false;
  // optional topicKey: 있으면 subject의 토픽 목록 안에 있어야 함.
  // ★ invalid topicKey (cross-subject 등)는 reject 대신 silently clear — analyze 통과시켜
  //   classify가 키워드 기반 fallback으로 결정. 이 reject로 인해 generate가 GPT free path로
  //   빠져 사용자 "GPT 회로 생성 금지" contract를 우회하던 결함 해결.
  if (o.topicKey !== undefined) {
    if (typeof o.topicKey !== "string") {
      delete o.topicKey;
    } else {
      const allowed = TOPICS_BY_SUBJECT[subject] as readonly string[];
      if (!allowed.includes(o.topicKey)) {
        delete o.topicKey;
      }
    }
  }
  // optional semantic: 있으면 4-flag boolean 객체여야 함
  if (o.semantic !== undefined) {
    const s = o.semantic as Record<string, unknown>;
    const flags = ["hasStateTransition", "hasEquivalentTransformation", "hasWaveformEvolution", "requiresMultiFigure"];
    if (!s || typeof s !== "object") return false;
    if (!flags.every((k) => typeof s[k] === "boolean")) return false;
  }
  // optional signals: 있으면 inputs/outputs 모두 string[]
  if (o.signals !== undefined) {
    const s = o.signals as Record<string, unknown>;
    if (!s || typeof s !== "object") return false;
    if (!Array.isArray(s.inputs) || !s.inputs.every((x) => typeof x === "string")) return false;
    if (!Array.isArray(s.outputs) || !s.outputs.every((x) => typeof x === "string")) return false;
  }
  // optional structureSignature: 있으면 inputCount/outputCount/figureCount는 number
  if (o.structureSignature !== undefined) {
    const s = o.structureSignature as Record<string, unknown>;
    if (!s || typeof s !== "object") return false;
    if (typeof s.inputCount !== "number") return false;
    if (typeof s.outputCount !== "number") return false;
    if (typeof s.figureCount !== "number") return false;
    // 나머지는 옵셔널이므로 패스
  }
  // optional figureRequirements: 있으면 각 항목 shape 체크
  if (o.figureRequirements !== undefined) {
    if (!Array.isArray(o.figureRequirements)) return false;
    const validRoles = ["kmap","truth_table","implementation_circuit","waveform","state_diagram","equivalent_circuit","main_circuit"];
    const validTypes = ["kmap","truth_table","logic_network","waveform","analog_netlist","concept_diagram"];
    const validScopes = ["per_output","combined","per_state","single"];
    for (const r of o.figureRequirements) {
      if (!r || typeof r !== "object") return false;
      const rr = r as Record<string, unknown>;
      if (typeof rr.role !== "string" || !validRoles.includes(rr.role)) return false;
      if (typeof rr.diagramType !== "string" || !validTypes.includes(rr.diagramType)) return false;
      if (typeof rr.scope !== "string" || !validScopes.includes(rr.scope)) return false;
      if (typeof rr.required !== "boolean") return false;
    }
  }
  return true;
}

/**
 * 이미지 + 과목으로 임용 문제를 분석.
 * @throws AnalyzeError — 응답 파싱/스키마 실패 시
 */
export async function analyzeImage(args: {
  image: string;       // base64 (data: prefix 없음)
  subject: SubjectKey;
}): Promise<AnalysisResult> {
  const { image, subject } = args;
  const openai = getOpenAI();
  const prompt = buildPrompt(subject);

  // ★ 비회로 과목(전자기학·C언어·통신·교육학)은 출력이 짧다(회로 inventory·topology 없음) →
  //   max_tokens를 낮춰 OpenAI TPM(분당 토큰) 한도 초과(429)를 피한다. 회로 과목은 2200 유지.
  const CIRCUIT_SUBJECTS = new Set(["electronics", "circuit_theory", "digital_logic", "mixed_signal"]);
  const maxTokens = CIRCUIT_SUBJECTS.has(subject) ? 2200 : 1300;

  log.info("요청", { subject, imageBytes: image.length, maxTokens });

  // Phase 2: Structured Outputs (json_schema strict) — 핵심 필드 schema 강제.
  // GPT가 topologySignature.branches·nodeAnnotations·loadPlaceholders 같은
  // 중요 필드를 누락하던 문제 해결. strict mode 제약 때문에 nullable은 ["type","null"].
  const completion = await withRateLimitRetry(() => openai.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [{
      role: "user",
      content: [
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" } },
        { type: "text", text: prompt },
      ],
    }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ImageAnalysis",
        strict: true,
        schema: buildAnalysisSchema(subject),
      },
    },
    // 분석 단계 안정성 ↑ — 기본 1.0이면 같은 이미지에서 매번 다른 변수 갯수/출력 갯수가 나옴.
    // 임용 5번 같이 시각 단서가 미세한 형식이 매번 일관되게 추출되도록 낮춤.
    temperature: 0.2,
    max_tokens: maxTokens,
  }));

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new AnalyzeError("JSON 파싱 실패", { cause: e });
  }
  if (!isValidAnalysis(parsed, subject)) {
    log.error("스키마 불일치", { sample: JSON.stringify(parsed).slice(0, 300) });
    throw new AnalyzeError("스키마 불일치 (topicKey가 유효 목록을 벗어났을 수 있음)");
  }

  // 빈칸 5개 보정
  if (parsed.fillInTheBlanks.length !== 5) {
    log.warn("빈칸 개수 5 아님 — 트리밍/패딩", { got: parsed.fillInTheBlanks.length });
    parsed.fillInTheBlanks = parsed.fillInTheBlanks.slice(0, 5);
    while (parsed.fillInTheBlanks.length < 5) {
      parsed.fillInTheBlanks.push({ sentence: "(추가 빈칸 미생성)", answer: "" });
    }
  }

  // ★ topologySignature가 있으면 envelope를 server-side에서 derive
  if (parsed.topologySignature && isValidTopologySignature(parsed.topologySignature)) {
    parsed.structuralEnvelope = buildStructuralEnvelope(parsed.topologySignature);
    log.info("topology_extracted", {
      family: parsed.topologySignature.family,
      features: parsed.topologySignature.features,
      branches: parsed.topologySignature.branches.map((b) => ({
        role: b.role,
        components: b.components.map((c) => c.value !== undefined ? `${c.type}(${c.value})` : c.type),
      })),
    });
    log.info("envelope_derived", {
      branchCount: parsed.topologySignature.branches.length,
      meshCount: parsed.topologySignature.features.meshCount,
      requiredFeatures: parsed.structuralEnvelope.requiredFeatures,
      requiredBranchRoles: parsed.structuralEnvelope.requiredBranchRoles,
    });
  } else if (parsed.topologySignature) {
    log.warn("topologySignature 형태 불량 — envelope 생략");
    delete parsed.topologySignature;
  } else {
    log.warn("topologySignature 누락 — exam_similar 모드에서 topology 보존 불가");
  }

  // 디버그 — classifier 분기 미스 진단용. topic·topicKey·signals·빈칸 마커가 추출됐는지 한눈에.
  const hasBlankCircle = /[㉠-㉣]/.test(
    `${parsed.topic ?? ""} ${parsed.interpretation ?? ""} ${(parsed.relatedConcepts ?? []).join(" ")} ` +
    `${(parsed.fillInTheBlanks ?? []).map((b) => b.sentence ?? "").join(" ")}`
  );
  const hasTruthTableWord = /진리표|truth table|truth_table/i.test(
    `${parsed.topic ?? ""} ${parsed.interpretation ?? ""}`
  );
  log.info("완료", {
    topic: parsed.topic,
    topicKey: parsed.topicKey,
    concepts: parsed.relatedConcepts.length,
    inputs: parsed.signals?.inputs,
    outputs: parsed.signals?.outputs,
    hasTruthTableWord,
    hasBlankCircle,
    blankCount: parsed.fillInTheBlanks?.length ?? 0,
  });
  return parsed;
}

function isValidTopologySignature(x: unknown): x is TopologySignature {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.subjectKey !== "string" || typeof o.family !== "string") return false;
  if (!o.features || typeof o.features !== "object") return false;
  if (!Array.isArray(o.branches)) return false;
  for (const b of o.branches) {
    if (!b || typeof b !== "object") return false;
    const br = b as Record<string, unknown>;
    if (typeof br.role !== "string") return false;
    if (!Array.isArray(br.components)) return false;
    for (const c of br.components) {
      if (!c || typeof c !== "object") return false;
      if (typeof (c as Record<string, unknown>).type !== "string") return false;
    }
  }
  return true;
}

export class AnalyzeError extends Error {
  constructor(message: string, opts?: ErrorOptions) {
    super(message, opts);
    this.name = "AnalyzeError";
  }
}
