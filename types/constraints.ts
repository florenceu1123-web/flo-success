import type {
  AnalysisResult,
  GeneratedProblem,
  GenerationMode,
  GenerationPolicy,
  SemanticStructure,
  SubjectKey,
  TopicKey,
} from "./index";

export type ConstraintKind =
  | "structural"
  | "inventory"
  | "naming"
  | "figure"
  | "semantic"
  | "value";

export type ConstraintSeverity = "error" | "warning";

export type ConstraintViolation = {
  constraintId: string;
  kind: ConstraintKind;
  severity: ConstraintSeverity;
  message: string;
  repairHint?: string;
  problemIndex?: number;
};

export type ConstraintContext = {
  subjectKey: SubjectKey;
  topicKey?: TopicKey;
  mode: GenerationMode;
  policy: GenerationPolicy;
  analysis?: AnalysisResult | null;
  semantic: SemanticStructure;
};

export type Constraint = {
  id: string;
  kind: ConstraintKind;
  severity: ConstraintSeverity;
  description: string;
  repairHint?: string;
  check: (problem: GeneratedProblem, ctx: ConstraintContext) => ConstraintViolation[];
};

export type ConstraintSet = {
  ctx: ConstraintContext;
  constraints: Constraint[];
};
