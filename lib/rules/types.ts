import type { FigureRole, SemanticStructure, SubjectKey, TopicKey } from "@/types";

/**
 * RuleSet — 한 문제 생성 요청에 대한 출제 규칙 셋.
 * Pipeline 3단계(RuleSet Resolution) 산출물로 generator/validator에 전달된다.
 */
export type RuleSet = {
  subject: SubjectKey;
  topicKey?: TopicKey;
  semantic: SemanticStructure;
  /** 반드시 포함되어야 하는 figure roles (validator 규칙 3·6·7과 연동) */
  requiredFigureRoles: FigureRole[];
  /** 추가 도메인별 제약 (향후 확장) */
  extras?: Record<string, unknown>;
};
