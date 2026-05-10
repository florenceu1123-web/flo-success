"use client";

import { useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import SubjectSelector from "@/components/SubjectSelector";
import GenerationModeSelector from "@/components/GenerationModeSelector";
import ProblemCountSelector from "@/components/ProblemCountSelector";
import AnalysisPanel from "@/components/AnalysisPanel";
import GeneratedProblems from "@/components/GeneratedProblems";
import type {
  SubjectKey,
  GenerationMode,
  AnalysisResult,
  GeneratedProblem,
} from "@/types";
import type { RuleSet } from "@/lib/rules";
import type { ValidationResult } from "@/lib/validators";

type ProblemValidation = {
  problemId: string;
  problem: ValidationResult;
  figures: ValidationResult;
};

type GenerateResponse = {
  problems: GeneratedProblem[];
  mode: GenerationMode;
  ruleSet: RuleSet;
  validations: ProblemValidation[];
  summary: { problems: number; totalIssues: number };
};

export default function Home() {
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [subject, setSubject] = useState<SubjectKey | null>(null);
  const [mode, setMode] = useState<GenerationMode>("exam_similar");
  const [count, setCount] = useState<number>(3);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [problems, setProblems] = useState<GeneratedProblem[]>([]);
  const [ruleSet, setRuleSet] = useState<RuleSet | null>(null);
  const [validations, setValidations] = useState<ProblemValidation[]>([]);
  const [summary, setSummary] = useState<GenerateResponse["summary"] | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const runAnalyze = async (image: string, subj: SubjectKey) => {
    setIsAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, subject: subj }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setAnalysis(data as AnalysisResult);
    } catch (e) {
      setAnalysis(null);
      alert(`분석 실패: ${(e as Error).message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleUpload = async (base64: string, name: string) => {
    setUploadedImage(base64);
    setFileName(name);
    setAnalysis(null);
    resetGenerationState();
    if (subject) await runAnalyze(base64, subject);
  };

  const handleSubjectChange = async (s: SubjectKey) => {
    setSubject(s);
    setAnalysis(null);
    resetGenerationState();
    if (uploadedImage) await runAnalyze(uploadedImage, s);
  };

  const resetGenerationState = () => {
    setProblems([]);
    setRuleSet(null);
    setValidations([]);
    setSummary(null);
  };

  const handleGenerate = async () => {
    if (!uploadedImage || !subject) return;
    setIsGenerating(true);
    resetGenerationState();
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: uploadedImage,
          subject,
          mode,
          count,
          analysis,
        }),
      });
      const data = (await res.json()) as Partial<GenerateResponse> & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setProblems(data.problems ?? []);
      setRuleSet(data.ruleSet ?? null);
      setValidations(data.validations ?? []);
      setSummary(data.summary ?? null);
    } catch (e) {
      alert(`생성 실패: ${(e as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const canGenerate = !!uploadedImage && !!subject && !isAnalyzing && !isGenerating;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-blue-100 bg-white/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-blue-900 leading-none">flo-success</h1>
              <p className="text-xs text-blue-400 mt-0.5">전자임용 유사·변형 문제 생성기</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
            OpenAI GPT
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-8">
          <div className="space-y-5">
            <Card>
              <SectionTitle num={1} title="문제 이미지 업로드" />
              <ImageUploader uploadedImage={uploadedImage} fileName={fileName} onUpload={handleUpload} />
            </Card>

            <Card>
              <SectionTitle num={2} title="과목 선택" />
              <SubjectSelector selected={subject} onChange={handleSubjectChange} />
            </Card>

            <Card>
              <SectionTitle num={3} title="생성 모드" />
              <GenerationModeSelector selected={mode} onChange={setMode} />
            </Card>

            <Card>
              <SectionTitle num={4} title="개수 · 생성" />
              <div className="space-y-3">
                <ProblemCountSelector value={count} onChange={setCount} />
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-semibold text-sm transition-all shadow-sm hover:shadow-md active:scale-[0.99] disabled:cursor-not-allowed disabled:shadow-none"
                >
                  {isGenerating ? "문제 생성 중..." : `문제 생성하기 (${count}개)`}
                </button>
              </div>
            </Card>
          </div>

          <div className="space-y-5">
            <AnalysisPanel analysis={analysis} isLoading={isAnalyzing} />
            <GeneratedProblems
              problems={problems}
              mode={mode}
              ruleSet={ruleSet}
              validations={validations}
              summary={summary}
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm">
      {children}
    </section>
  );
}

function SectionTitle({ num, title }: { num: number; title: string }) {
  return (
    <h2 className="text-sm font-semibold text-blue-900 mb-3 flex items-center gap-2">
      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
        {num}
      </span>
      {title}
    </h2>
  );
}
