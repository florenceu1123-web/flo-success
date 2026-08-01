import type { SubjectKey } from "@/types";
import { ELECTRONICS_HINT, ELECTRONICS_GUIDE } from "./electronics";
import { CIRCUIT_THEORY_HINT, CIRCUIT_THEORY_GUIDE } from "./circuitTheory";
import { DIGITAL_LOGIC_HINT, DIGITAL_LOGIC_GUIDE } from "./digital";

export { SYSTEM_PROMPT } from "./system";

const MIXED_SIGNAL_HINT = "전자회로(OPAMP·비교기·트랜지스터)와 디지털논리(FF·게이트·카운터)가 같은 회로에 공존하는 복합형. 임용 8번 (2-bit JK 카운터 + R-2R DAC + 비교기) 등.";
const MIXED_SIGNAL_GUIDE = MIXED_SIGNAL_HINT;

const ELECTROMAGNETICS_HINT = "전자기학 — 회로가 아니라 장(field)·공식 기반. 정전계(쿨롱·전계·전위), 가우스 법칙(선전하·면전하), 정전용량, 정자계(직선도선·솔레노이드 자기장·앙페르), 전자기 유도(패러데이·운동 기전력), 자기력(F=BIL), 전자기파(맥스웰). 회로도가 아니라 점전하·평행판·솔레노이드 같은 기하·장 도식.";
const ELECTROMAGNETICS_GUIDE = ELECTROMAGNETICS_HINT;

const C_LANGUAGE_HINT = "C언어 — 회로가 아니라 프로그래밍. 주어진 C 코드의 실행 결과·출력을 예측하는 유형이 핵심. 포인터·배열·주소, 제어문·반복문, 함수·재귀·스택, 구조체·비트연산, 문자열 처리. 지문은 컴파일 가능한 C 코드 스니펫.";
const C_LANGUAGE_GUIDE = "C언어 코드 분석·출력 예측 문제. 반드시 컴파일·실행 가능한 정확한 C 코드를 제시하고, 그 실행 결과(표준출력)나 특정 변수의 최종 값을 정확히 계산해 정답으로 낸다. 회로도·수식 도식 없음 — 지문 코드가 핵심. 원본과 같은 문법 개념(포인터/재귀/비트연산 등)을 유지하되 코드 내용·값을 변형.";

const COMMUNICATIONS_HINT = "통신 — 회로가 아니라 신호·시스템·정보이론. 아날로그 변조(AM·FM·PM), 디지털 변조(ASK·FSK·PSK·QAM), 표본화·양자화·PCM, 정보이론(엔트로피·채널용량), 신호·스펙트럼·대역폭, 잡음·SNR. 그림은 시간영역 파형·주파수 스펙트럼·송수신 블록도.";
const COMMUNICATIONS_GUIDE = "통신 이론 문제 (변조·표본화·정보이론·스펙트럼·잡음). 정의·공식(변조지수·나이퀴스트·엔트로피 H=−Σp·log₂p·채널용량 C=B·log₂(1+SNR) 등)을 적용해 정확한 수치 정답을 낸다. 필요 시 파형·스펙트럼·블록도 figure를 함께 제시. 원본과 같은 원리를 유지하되 파라미터·구하는 양을 변형.";

const PEDAGOGY_HINT = "교육학(교직) — 회로·수식·코드가 아니라 교육 이론·논술형. 교육심리(학습·발달·동기), 교육과정, 교육평가, 교육방법·공학, 교육행정, 교육사회학, 교육철학·교육사, 생활지도·상담. figure(그림) 없음 — 텍스트 개념·사례 분석·서술형 답안이 핵심.";
const PEDAGOGY_GUIDE = "교육학(교직) 이론·논술형 문제. 교육학 개념·이론(예: 브루너 발견학습, 비고츠키 ZPD, 타일러 목표모형, 블룸 분류학, 콜버그 도덕성 발달, 형성평가·타당도·신뢰도 등)을 정확히 적용해 개념 설명·사례 적용·비교·서술형 답안을 낸다. 회로도·수식 도식·코드 없음 — 텍스트가 핵심. 원본과 같은 이론·학습목표를 유지하되 사례·발문·구하는 관점을 변형.";

/** SubjectKey → 짧은 한 줄 hint (analyze 등에서 사용) */
export const SUBJECT_HINT: Record<SubjectKey, string> = {
  electronics: ELECTRONICS_HINT,
  circuit_theory: CIRCUIT_THEORY_HINT,
  digital_logic: DIGITAL_LOGIC_HINT,
  mixed_signal: MIXED_SIGNAL_HINT,
  electromagnetics: ELECTROMAGNETICS_HINT,
  c_language: C_LANGUAGE_HINT,
  communications: COMMUNICATIONS_HINT,
  pedagogy: PEDAGOGY_HINT,
};

/** SubjectKey → 생성용 도메인 가이드 (generate에서 사용) */
export const SUBJECT_GUIDE: Record<SubjectKey, string> = {
  electronics: ELECTRONICS_GUIDE,
  circuit_theory: CIRCUIT_THEORY_GUIDE,
  digital_logic: DIGITAL_LOGIC_GUIDE,
  mixed_signal: MIXED_SIGNAL_GUIDE,
  electromagnetics: ELECTROMAGNETICS_GUIDE,
  c_language: C_LANGUAGE_GUIDE,
  communications: COMMUNICATIONS_GUIDE,
  pedagogy: PEDAGOGY_GUIDE,
};
