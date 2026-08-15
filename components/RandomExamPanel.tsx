"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShotItem } from "@/app/api/shots/route";

/**
 * 「랜덤문제 풀기」 패널 — 바탕화면 `전공 스샷` 아카이브에서 기출을 무작위로 출제한다.
 *
 *  · 범위: 연도 칩 + 트랙(전자/전기/교재) + 답안 유무
 *  · 진도: "풀었음" 기록은 localStorage에 남아 "안 푼 문제만" 출제가 가능
 *  · ★ 앱 연결: [이 문제로 유사문제 생성] 을 누르면 그 스샷을 그대로 업로드 흐름에 넘긴다.
 *
 *  단축키: Space/→ 다음 문제 · A 답안 · S 풀었음
 */

type Index = { groups: string[]; items: ShotItem[]; orphanAnswers: string[]; warning?: string };

const DONE_KEY = "flo-shots-done-v1";
const SEL_KEY = "flo-shots-sel-v1";
const imgUrl = (file: string, kind: "q" | "a" = "q") =>
  `/api/shots?d=${kind}&f=${encodeURIComponent(file)}`;

export default function RandomExamPanel({
  onSendToGenerator,
}: {
  /** 선택한 스샷을 문제 생성 화면으로 보낸다(base64, 파일명). */
  onSendToGenerator?: (base64: string, fileName: string) => void;
}) {
  const [idx, setIdx] = useState<Index | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cur, setCur] = useState<ShotItem | null>(null);
  const [showAns, setShowAns] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [sending, setSending] = useState(false);

  const [done, setDone] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [onlyNew, setOnlyNew] = useState(true);
  const [onlyAns, setOnlyAns] = useState(false);
  const [trk, setTrk] = useState({ 전자: true, 전기: true, 기타: true });
  // 현재 문항의 최신값을 단축키·추첨 콜백에서 읽기 위한 ref (렌더 중 수정 금지 → effect로 동기화)
  const curRef = useRef<ShotItem | null>(null);
  useEffect(() => { curRef.current = cur; }, [cur]);

  // ── 인덱스 로드 ──
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/shots");
        const data = (await res.json()) as Index & { error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setIdx(data);
        const savedSel = localStorage.getItem(SEL_KEY);
        setSel(new Set(savedSel ? (JSON.parse(savedSel) as string[]) : data.groups));
        setDone(new Set(JSON.parse(localStorage.getItem(DONE_KEY) ?? "[]") as string[]));
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  /** 선택 범위(연도·트랙·답안). ★ "안 푼 문제만"은 여기 넣지 않는다 — 목록에서 푼 문제가 사라진다. */
  const inScope = useMemo(() => {
    if (!idx) return [];
    return idx.items.filter((i) => {
      if (!sel.has(i.group)) return false;
      if (i.track ? !trk[i.track] : !trk.기타) return false;
      if (onlyAns && !i.ans) return false;
      return true;
    });
  }, [idx, sel, trk, onlyAns]);

  const draw = useCallback(() => {
    let pool = inScope;
    if (onlyNew) {
      const fresh = pool.filter((i) => !done.has(i.file));
      if (fresh.length) pool = fresh;
    }
    if (!pool.length) { setCur(null); return; }
    let k = Math.floor(Math.random() * pool.length);
    const prev = curRef.current;
    if (pool.length > 1 && prev && pool[k].file === prev.file) k = (k + 1) % pool.length; // 연속 방지
    setCur(pool[k]);
    setShowAns(false);
    setZoom(false);
  }, [inScope, onlyNew, done]);

  // 인덱스가 준비되면 한 문제 뽑아 둔다 — 들어오자마자 풀 수 있게.
  useEffect(() => {
    if (idx && !curRef.current && inScope.length) draw();
  }, [idx, inScope, draw]);

  const toggleDone = useCallback(() => {
    const c = curRef.current;
    if (!c) return;
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(c.file)) next.delete(c.file); else next.add(c.file);
      localStorage.setItem(DONE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  // ── 단축키 ──
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.code === "Space" || e.code === "ArrowRight") { e.preventDefault(); draw(); }
      if (e.key === "a" || e.key === "A") setShowAns((v) => !v);
      if (e.key === "s" || e.key === "S") toggleDone();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [draw, toggleDone]);

  const setSelAndSave = (next: Set<string>) => {
    setSel(next);
    localStorage.setItem(SEL_KEY, JSON.stringify([...next]));
  };

  /** 현재 스샷을 base64로 받아 문제 생성 화면으로 넘긴다. */
  const sendToGenerator = async () => {
    if (!cur || !onSendToGenerator) return;
    setSending(true);
    try {
      const res = await fetch(imgUrl(cur.file));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const base64 = await new Promise<string>((ok, no) => {
        const r = new FileReader();
        r.onload = () => ok(r.result as string);
        r.onerror = () => no(new Error("이미지를 읽지 못했습니다."));
        r.readAsDataURL(blob);
      });
      onSendToGenerator(base64, cur.label);
    } catch (e) {
      setError(`문제 생성 화면으로 보내지 못했습니다: ${(e as Error).message}`);
    } finally {
      setSending(false);
    }
  };

  if (error) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-sm text-red-700">
        스샷 아카이브를 불러오지 못했습니다: {error}
        <div className="mt-2 text-xs text-red-500">
          `SHOTS_DIR` 환경변수로 폴더 위치를 지정할 수 있습니다(기본: 바탕화면 <b>전공 스샷</b>).
        </div>
      </div>
    );
  }
  if (!idx) return <div className="py-20 text-center text-sm text-blue-400">기출 목록을 불러오는 중…</div>;

  const scopeDone = inScope.filter((i) => done.has(i.file)).length;
  const isYear = (g: string) => /^\d{4}$/.test(g);
  const countOf = (g: string) => idx.items.filter((i) => i.group === g).length;

  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-full text-xs border transition-colors ${
      on ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold" : "bg-white border-slate-200 text-slate-500 hover:border-blue-200"
    }`;

  return (
    <div className="space-y-5">
      {idx.warning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{idx.warning}</div>
      )}

      {/* ── 범위 ── */}
      <div className="rounded-2xl border border-blue-100 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={draw}
            className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm active:scale-[0.99]"
          >
            🎲 랜덤 출제
          </button>
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} /> 안 푼 문제만
          </label>
          <label className="flex items-center gap-1.5 text-sm text-slate-500">
            <input type="checkbox" checked={onlyAns} onChange={(e) => setOnlyAns(e.target.checked)} /> 답안 있는 것만
          </label>
          <span className="w-px h-5 bg-slate-200" />
          {(["전자", "전기", "기타"] as const).map((k) => (
            <label key={k} className="flex items-center gap-1.5 text-sm text-slate-500">
              <input type="checkbox" checked={trk[k]} onChange={(e) => setTrk({ ...trk, [k]: e.target.checked })} />
              {k === "기타" ? "교재·기타" : k}
            </label>
          ))}
          <span className="flex-1" />
          <button type="button" className={chip(false)}
            onClick={() => setSelAndSave(new Set(idx.groups.filter((g) => isYear(g) && Number(g) >= 2022)))}>
            최근(2022~)
          </button>
          <button type="button" className={chip(false)}
            onClick={() => setSelAndSave(new Set(idx.groups.filter(isYear)))}>기출 전체</button>
          <button type="button" className={chip(false)} onClick={() => setSelAndSave(new Set(idx.groups))}>전부</button>
        </div>

        <div className="flex flex-wrap gap-1.5 mt-3">
          {idx.groups.map((g) => (
            <button
              key={g}
              type="button"
              className={chip(sel.has(g))}
              onClick={() => {
                const next = new Set(sel);
                if (next.has(g)) next.delete(g); else next.add(g);
                setSelAndSave(next);
              }}
            >
              {g} <span className="opacity-60 text-[10px]">{countOf(g)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 문제 ── */}
      {cur ? (
        <div className="rounded-2xl border border-blue-100 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-xl font-extrabold text-blue-700">{cur.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">
                {cur.group} · {cur.ans ? "답안 있음" : "답안 없음"}
                {done.has(cur.file) && " · 이미 푼 문제"}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {onSendToGenerator && (
                <button
                  type="button"
                  onClick={sendToGenerator}
                  disabled={sending}
                  className="px-4 py-2 rounded-xl border border-blue-200 text-blue-700 text-sm font-semibold hover:bg-blue-50 disabled:opacity-50"
                >
                  {sending ? "보내는 중…" : "이 문제로 유사문제 생성 →"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowAns((v) => !v)}
                disabled={!cur.ans}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:border-blue-300 disabled:opacity-40"
              >
                {showAns ? "답안 숨기기" : "답안 보기"}
              </button>
              <button type="button" onClick={toggleDone}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:border-blue-300">
                {done.has(cur.file) ? "안 푼 걸로 ↺" : "풀었음 ✓"}
              </button>
              <button type="button" onClick={draw}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">
                다음 문제 →
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgUrl(cur.file)}
              alt={cur.label}
              onClick={() => setZoom((z) => !z)}
              className={`border border-slate-200 rounded-xl bg-white ${zoom ? "max-w-none cursor-zoom-out" : "w-full cursor-zoom-in"}`}
            />
          </div>

          {showAns && cur.ans && (
            <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
              <div className="text-sm font-semibold text-emerald-600 mb-2">답안</div>
              <div className="overflow-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgUrl(cur.ans, "a")} alt={`${cur.label} 답안`}
                  className="w-full border border-slate-200 rounded-xl bg-white" />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-blue-100 p-10 text-center text-sm text-slate-400">
          선택한 범위에 문항이 없습니다. 위에서 연도나 트랙을 다시 골라 주세요.
        </div>
      )}

      {/* ── 목록 ── */}
      <div className="rounded-2xl border border-blue-100 p-5">
        <div className="flex items-center gap-3 mb-2">
          <strong className="text-sm text-blue-900">연도별 목록</strong>
          <span className="text-xs text-slate-400">
            선택 범위 {scopeDone} / {inScope.length} 풀이 (전체 {done.size} / {idx.items.length})
          </span>
          <span className="flex-1" />
          <button
            type="button"
            className="text-xs text-slate-400 hover:text-red-500"
            onClick={() => {
              if (!confirm("푼 기록을 모두 지울까요?")) return;
              setDone(new Set());
              localStorage.setItem(DONE_KEY, "[]");
            }}
          >
            푼 기록 초기화
          </button>
        </div>
        {idx.groups.map((g) => {
          const its = inScope.filter((i) => i.group === g);
          if (!its.length) return null;
          const dn = its.filter((i) => done.has(i.file)).length;
          return (
            <details key={g} className="border-t border-slate-100">
              <summary className="cursor-pointer py-2.5 flex justify-between text-sm font-semibold text-slate-700">
                <span>{g}</span>
                <span className="font-normal text-xs text-slate-400">{dn} / {its.length}</span>
              </summary>
              <div className="flex flex-wrap gap-1.5 pb-3">
                {its.map((it) => (
                  <button
                    key={it.file}
                    type="button"
                    onClick={() => { setCur(it); setShowAns(false); setZoom(false); }}
                    className={`px-2.5 py-1 rounded-lg border text-xs ${
                      done.has(it.file)
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
                    }`}
                  >
                    {it.label}{it.ans && <span className="ml-1 opacity-50">·답</span>}
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        단축키 <b>Space</b>/<b>→</b> 다음 문제 · <b>A</b> 답안 · <b>S</b> 풀었음. 이미지를 클릭하면 원본 크기로 확대됩니다.
        {idx.orphanAnswers.length > 0 && (
          <> <br />※ 문제 스샷이 없는 답안 {idx.orphanAnswers.length}개: {idx.orphanAnswers.join(", ")}</>
        )}
      </p>
    </div>
  );
}
