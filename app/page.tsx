"use client";

import { useMemo, useState } from "react";
import ImageUploader from "@/components/ImageUploader";
import SubjectSelector from "@/components/SubjectSelector";
import GenerationModeSelector from "@/components/GenerationModeSelector";
import ProblemCountSelector from "@/components/ProblemCountSelector";
import AnalysisPanel from "@/components/AnalysisPanel";
import GeneratedProblems from "@/components/GeneratedProblems";
import SubjectNotes from "@/components/SubjectNotes";
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

/** 상단 탭 — 문제 생성(기존 파이프라인) / 요점정리(과목별 사진첩). */
type View = "generate" | "notes";

type GenerateResponse = {
  problems: GeneratedProblem[];
  mode: GenerationMode;
  ruleSet: RuleSet;
  validations: ProblemValidation[];
  summary: { problems: number; totalIssues: number };
};

export default function Home() {
  const [view, setView] = useState<View>("generate");
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
  // 오류는 alert() 대신 화면 안에 표시한다 — alert은 줄바꿈이 죽고 화면이 멈춘다.
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      setErrorMsg(`분석 실패: ${(e as Error).message}`);
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
    setErrorMsg(null); // 새로 시도할 때 이전 오류는 지운다
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
      setErrorMsg(`생성 실패: ${(e as Error).message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const canGenerate = !!uploadedImage && !!subject && !isAnalyzing && !isGenerating;

  // 업로드 이미지 기반 안정 키 — 사용자가 직접 입력한 풀이·정답을 localStorage에 저장/복원할 때 사용.
  const imageKey = useMemo(() => {
    if (!uploadedImage) return null;
    let h = 5381;
    for (let i = 0; i < uploadedImage.length; i++) h = ((h << 5) + h + uploadedImage.charCodeAt(i)) | 0;
    return `img${(h >>> 0).toString(36)}`;
  }, [uploadedImage]);

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
          <div className="flex items-center gap-3">
            <nav className="flex items-center gap-1 bg-blue-50/70 p-1 rounded-xl border border-blue-100">
              <TabButton active={view === "generate"} onClick={() => setView("generate")}>
                문제 생성
              </TabButton>
              <TabButton active={view === "notes"} onClick={() => setView("notes")}>
                요점정리
              </TabButton>
            </nav>
            <div className="hidden sm:flex items-center gap-2 text-xs text-blue-500 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
              OpenAI GPT
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {view === "notes" ? (
          <SubjectNotes />
        ) : (
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
            {errorMsg && (
              <section className="bg-rose-50 border border-rose-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  {/* whitespace-pre-line — 서버가 보내는 여러 줄 안내를 줄바꿈 그대로 보여준다. */}
                  <p className="text-sm text-rose-800 whitespace-pre-line leading-relaxed">{errorMsg}</p>
                  <button
                    type="button"
                    onClick={() => setErrorMsg(null)}
                    className="shrink-0 w-7 h-7 rounded-lg text-rose-400 hover:bg-rose-100 hover:text-rose-600 text-lg leading-none"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>
              </section>
            )}
            <AnalysisPanel analysis={analysis} isLoading={isAnalyzing} imageKey={imageKey} />
            <GeneratedProblems
              problems={problems}
              mode={mode}
              ruleSet={ruleSet}
              validations={validations}
              summary={summary}
            />
          </div>
        </div>
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
        active ? "bg-white text-blue-700 shadow-sm" : "text-blue-400 hover:text-blue-600"
      }`}
    >
      {children}
    </button>
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
