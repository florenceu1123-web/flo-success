"use client";

import {
  GENERATION_MODE_LABEL,
  type GeneratedProblem,
  type GenerationMode,
} from "@/types";
import type { RuleSet } from "@/lib/rules";
import type { ValidationIssue, ValidationResult } from "@/lib/validators";
import { renderFigure } from "@/lib/renderers";
import { MathText } from "./MathText";

type ProblemValidation = {
  problemId: string;
  problem: ValidationResult;
  figures: ValidationResult;
};

type Props = {
  problems: GeneratedProblem[];
  mode: GenerationMode;
  ruleSet?: RuleSet | null;
  validations?: ProblemValidation[];
  summary?: { problems: number; totalIssues: number } | null;
};

/** 생성된 문제 목록 + 검증 결과·RuleSet 메타 표시. */
export default function GeneratedProblems({ problems, mode, ruleSet, validations, summary }: Props) {
  if (problems.length === 0) return null;

  const issueCount = summary?.totalIssues ?? 0;
  const allOk = issueCount === 0;

  return (
    <section className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-lg font-bold text-blue-900">생성된 문제</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
            {GENERATION_MODE_LABEL[mode]} · {problems.length}개
          </span>
          <ValidationBadge ok={allOk} count={issueCount} />
        </div>
      </header>

      {ruleSet && <RuleSetPanel ruleSet={ruleSet} />}

      <ol className="space-y-4">
        {problems.map((p, i) => {
          const v = validations?.find((x) => x.problemId === p.id);
          return <ProblemCard key={p.id ?? i} problem={p} index={i} validation={v} />;
        })}
      </ol>
    </section>
  );
}

function ValidationBadge({ ok, count }: { ok: boolean; count: number }) {
  if (ok) {
    return (
      <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
        검증 통과
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 inline-flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
      검증 이슈 {count}건
    </span>
  );
}

function RuleSetPanel({ ruleSet }: { ruleSet: RuleSet }) {
  const semanticFlags = Object.entries(ruleSet.semantic)
    .filter(([, v]) => v === true)
    .map(([k]) => k);
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-blue-700">
        <span><span className="text-blue-500 font-medium mr-1">subject:</span>{ruleSet.subject}</span>
        {ruleSet.topicKey && (
          <span><span className="text-blue-500 font-medium mr-1">topicKey:</span>{ruleSet.topicKey}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-blue-500 font-medium">required figures:</span>
        {ruleSet.requiredFigureRoles.length > 0 ? (
          ruleSet.requiredFigureRoles.map((r) => (
            <span key={r} className="px-1.5 py-0.5 rounded bg-white border border-blue-200 text-blue-700">{r}</span>
          ))
        ) : (
          <span className="text-blue-400">(none)</span>
        )}
      </div>
      {semanticFlags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-blue-500 font-medium">semantic:</span>
          {semanticFlags.map((f) => (
            <span key={f} className="px-1.5 py-0.5 rounded bg-white border border-blue-200 text-blue-700">{f}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function ProblemCard({
  problem,
  index,
  validation,
}: {
  problem: GeneratedProblem;
  index: number;
  validation?: ProblemValidation;
}) {
  const issues = [
    ...(validation?.problem.issues ?? []).map((x) => ({ scope: "problem" as const, ...x })),
    ...(validation?.figures.issues ?? []).map((x) => ({ scope: "figures" as const, ...x })),
  ];
  const ok = issues.length === 0;

  return (
    <li className="rounded-xl border border-slate-100 bg-blue-50/30 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-blue-600 font-semibold">문제 {index + 1}</span>
        {problem.topicKey && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-blue-200 text-blue-700">
            {problem.topicKey}
          </span>
        )}
        {validation && (ok ? <InlineOk /> : <InlineIssues count={issues.length} />)}
      </div>

      <p className="text-sm text-slate-800 whitespace-pre-line">
        <MathText>{problem.content}</MathText>
      </p>

      {problem.conditions.length > 0 && (
        <ul className="text-xs text-slate-600 space-y-0.5">
          {problem.conditions.map((c, ci) => (
            <li key={ci}>· <MathText>{c}</MathText></li>
          ))}
        </ul>
      )}

      <p className="text-sm font-medium text-blue-700 whitespace-pre-line">
        <MathText>{problem.question}</MathText>
      </p>

      {(problem.figureVariants?.length ?? 0) > 0 && (
        <div className="space-y-2 pt-1">
          {(problem.figureVariants ?? []).map((f) => (
            <div key={f.id}>{renderFigure(f)}</div>
          ))}
        </div>
      )}

      {issues.length > 0 && <IssueList issues={issues} />}

      <details className="text-xs text-slate-600">
        <summary className="cursor-pointer text-blue-500 hover:text-blue-700">정답·풀이 보기</summary>
        <div className="mt-2 space-y-2">
          <p><span className="font-semibold">정답:</span> <MathText>{problem.answer}</MathText></p>
          <p className="whitespace-pre-line">
            <span className="font-semibold">풀이:</span> <MathText>{problem.solution}</MathText>
          </p>
          {(problem.solutionFigures?.length ?? 0) > 0 && (
            <div className="space-y-2 pt-1">
              {(problem.solutionFigures ?? []).map((f) => (
                <div key={f.id}>{renderFigure(f)}</div>
              ))}
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

function InlineOk() {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
      ✓ 통과
    </span>
  );
}

function InlineIssues({ count }: { count: number }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
      ⚠️ {count}건
    </span>
  );
}

function IssueList({
  issues,
}: {
  issues: Array<ValidationIssue & { scope: "problem" | "figures" }>;
}) {
  return (
    <ul className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs space-y-1">
      {issues.map((x, i) => (
        <li key={i} className="text-amber-800">
          <span className="font-mono text-[10px] mr-1 px-1 py-0.5 bg-amber-100 rounded">
            {x.scope}/{x.rule}
          </span>
          {x.message}
        </li>
      ))}
    </ul>
  );
}
