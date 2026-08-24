"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ShotItem, ShotPage } from "@/app/api/shots/route";

/**
 * 「랜덤문제 풀기」 패널 — **기출 스샷과 생성문제 보관함**에서 무작위로 출제한다.
 *
 *  · 출처: `기출 스샷`(바탕화면 아카이브) + `생성문제`(사진첩 보관함) — 칸으로 켜고 끈다
 *  · 범위: 연도 칩 + 트랙(전자/전기/교재) + 답안 유무
 *  · 진도: "풀었음" 기록은 localStorage에 남아 "안 푼 문제만" 출제가 가능
 *  · ★ 앱 연결: [이 문제로 유사문제 생성] 을 누르면 그 이미지를 그대로 업로드 흐름에 넘긴다.
 *
 *  단축키: A 답안 · S 풀었음
 *
 * ★ **문제 전환은 오직 명시적 조작으로만** 일어난다 (사용자 지정) —
 *   [다음 문제]·[이전 문제]·[랜덤 출제] 버튼 또는 아래 목록에서 직접 고르기.
 *   범위(연도·트랙·출처)를 바꾸거나 키를 눌러서 보고 있던 문제가 바뀌는 일은 없다.
 */

type Index = {
  groups: string[];
  items: ShotItem[];
  orphanAnswers: string[];
  counts?: { shot: number; note: number };
  warning?: string;
};

/** 되돌아갈 수 있는 최대 문항 수 — 넘으면 오래된 것부터 버린다. */
const HISTORY_MAX = 50;

const DONE_KEY = "flo-shots-done-v1";
const SEL_KEY = "flo-shots-sel-v1";
const SRC_KEY = "flo-shots-src-v1";

/** 출처 표시용 — 라벨은 서버가 준 `srcLabel`을 쓰고 여기서는 색만 정한다. */
const SRC_STYLE: Record<ShotItem["src"], string> = {
  shot: "bg-slate-100 text-slate-600",
  note: "bg-violet-100 text-violet-700",
};

/**
 * 문항 이미지 한 장. 사진첩 사진은 표시 회전각을 가질 수 있어 그대로 반영한다
 * (현재 보관함은 전부 0도라 사실상 무동작 — 나중에 돌려 저장한 사진을 위한 대비).
 */
function PageImage({ page, alt, zoom, onClick }: {
  page: ShotPage; alt: string; zoom?: boolean; onClick?: () => void;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={page.url}
      alt={alt}
      onClick={onClick}
      style={page.rotation ? { transform: `rotate(${page.rotation}deg)` } : undefined}
      className={`border border-slate-200 rounded-xl bg-white ${
        onClick ? (zoom ? "max-w-none cursor-zoom-out" : "w-full cursor-zoom-in") : "w-full"
      }`}
    />
  );
}

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
  // 출처 필터 — 기출 스샷 / 생성문제 보관함. 둘 다 기본 켜짐.
  const [src, setSrc] = useState<Record<ShotItem["src"], boolean>>({ shot: true, note: true });
  // 현재 문항의 최신값을 단축키·추첨 콜백에서 읽기 위한 ref (렌더 중 수정 금지 → effect로 동기화)
  const curRef = useRef<ShotItem | null>(null);
  useEffect(() => { curRef.current = cur; }, [cur]);
  /**
   * 지나온 문항 이력 — [이전 문제] 로 되돌아가기 위한 스택.
   * ★ 파일 키가 아니라 **문항 객체**를 담는다. 되돌아간 뒤 범위(연도·출처)를 바꿔서
   *   그 문항이 지금 범위 밖이 되더라도 이미 본 문제는 그대로 다시 볼 수 있어야 한다.
   */
  const [history, setHistory] = useState<ShotItem[]>([]);

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
        const savedSrc = localStorage.getItem(SRC_KEY);
        if (savedSrc) setSrc({ shot: true, note: true, ...(JSON.parse(savedSrc) as object) });
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, []);

  /** 선택 범위(연도·트랙·답안). ★ "안 푼 문제만"은 여기 넣지 않는다 — 목록에서 푼 문제가 사라진다. */
  const inScope = useMemo(() => {
    if (!idx) return [];
    return idx.items.filter((i) => {
      if (!src[i.src]) return false;
      if (!sel.has(i.group)) return false;
      if (i.track ? !trk[i.track] : !trk.기타) return false;
      if (onlyAns && !i.aPages.length) return false;
      return true;
    });
  }, [idx, sel, trk, onlyAns, src]);

  /** 지금 보고 있는 문항을 이력에 쌓고 다른 문항으로 넘어간다. */
  const goTo = useCallback((next: ShotItem) => {
    const prev = curRef.current;
    if (prev && prev.file !== next.file) {
      setHistory((h) => [...h, prev].slice(-HISTORY_MAX));
    }
    setCur(next);
    setShowAns(false);
    setZoom(false);
  }, []);

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
    goTo(pool[k]);
  }, [inScope, onlyNew, done, goTo]);

  /** 직전에 보던 문항으로 되돌아간다(이력 스택에서 하나 꺼낸다). */
  const goPrev = useCallback(() => {
    if (!history.length) return;
    setCur(history[history.length - 1]);
    setHistory((h) => h.slice(0, -1));
    setShowAns(false);
    setZoom(false);
  }, [history]);

  /**
   * 들어오자마자 풀 수 있게 **처음 한 번만** 뽑아 둔다.
   * ★ ref 가드가 없으면 범위를 좁혀 문항이 0개가 됐다가 다시 넓힐 때 이 effect가 또 돌아
   *   **보고 있던 문제가 저절로 바뀐다**(사용자 신고). 자동 추첨은 최초 1회로 못 박는다.
   */
  const didAutoDraw = useRef(false);
  useEffect(() => {
    if (didAutoDraw.current || !idx || !inScope.length) return;
    didAutoDraw.current = true;
    draw();
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
      // ★ 문제를 넘기는 단축키(Space·→)는 두지 않는다 — Space는 페이지 스크롤 키라
      //   읽는 도중에 눌렀다가 문제가 통째로 바뀌었다(사용자 신고). 전환은 버튼으로만.
      if (e.key === "a" || e.key === "A") setShowAns((v) => !v);
      if (e.key === "s" || e.key === "S") toggleDone();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
    // draw는 더 이상 단축키에서 쓰지 않는다 — 넣어 두면 범위가 바뀔 때마다 리스너를 다시 건다.
  }, [toggleDone]);

  const setSelAndSave = (next: Set<string>) => {
    setSel(next);
    localStorage.setItem(SEL_KEY, JSON.stringify([...next]));
  };

  /** 현재 문항의 **첫 쪽**을 base64로 받아 문제 생성 화면으로 넘긴다(출처 무관). */
  const sendToGenerator = async () => {
    if (!cur || !onSendToGenerator || !cur.qPages.length) return;
    setSending(true);
    try {
      const res = await fetch(cur.qPages[0].url);
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
        문항 아카이브를 불러오지 못했습니다: {error}
        <div className="mt-2 text-xs text-red-500">
          `SHOTS_DIR` 환경변수로 폴더 위치를 지정할 수 있습니다(기본: 바탕화면 <b>전공 스샷</b>).
        </div>
      </div>
    );
  }
  if (!idx) return <div className="py-20 text-center text-sm text-blue-400">기출 목록을 불러오는 중…</div>;

  const scopeDone = inScope.filter((i) => done.has(i.file)).length;
  const isYear = (g: string) => /^\d{4}$/.test(g);
  // 연도 칩의 개수는 **지금 켜 둔 출처 기준**으로 센다 — 생성문제를 끄면 숫자도 같이 줄어야 한다.
  const countOf = (g: string) => idx.items.filter((i) => i.group === g && src[i.src]).length;

  const setSrcAndSave = (next: Record<ShotItem["src"], boolean>) => {
    setSrc(next);
    localStorage.setItem(SRC_KEY, JSON.stringify(next));
  };

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
          <span className="w-px h-5 bg-slate-200" />
          {/* 출처 — 기출 스샷과 생성문제 보관함을 각각 켜고 끈다. */}
          {([["shot", "기출 스샷"], ["note", "생성문제"]] as const).map(([k, name]) => (
            <label key={k} className="flex items-center gap-1.5 text-sm text-slate-500">
              <input
                type="checkbox"
                checked={src[k]}
                onChange={(e) => setSrcAndSave({ ...src, [k]: e.target.checked })}
              />
              {name}
              {idx.counts && (
                <span className="text-[10px] text-slate-400">{k === "shot" ? idx.counts.shot : idx.counts.note}</span>
              )}
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
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold text-blue-700">{cur.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${SRC_STYLE[cur.src]}`}>
                  {cur.srcLabel}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {cur.group} · {cur.aPages.length ? `답안 있음${cur.aPages.length > 1 ? ` (${cur.aPages.length}쪽)` : ""}` : "답안 없음"}
                {cur.qPages.length > 1 && ` · 문제 ${cur.qPages.length}쪽`}
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
                disabled={!cur.aPages.length}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:border-blue-300 disabled:opacity-40"
              >
                {showAns ? "답안 숨기기" : "답안 보기"}
              </button>
              <button type="button" onClick={toggleDone}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:border-blue-300">
                {done.has(cur.file) ? "안 푼 걸로 ↺" : "풀었음 ✓"}
              </button>
              {/* 이전 문제 — 지나온 이력을 하나씩 되짚는다. 이력이 없으면 비활성. */}
              <button
                type="button"
                onClick={goPrev}
                disabled={!history.length}
                title={history.length ? `되돌아갈 문항 ${history.length}개` : "되돌아갈 문항이 없습니다"}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                ← 이전 문제
                {history.length > 0 && <span className="ml-1 text-[10px] text-slate-400">{history.length}</span>}
              </button>
              <button type="button" onClick={draw}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold">
                다음 문제 →
              </button>
            </div>
          </div>

          {/* 문제 — 생성문제는 한 문항이 여러 쪽인 경우가 있어 전부 이어 보여 준다. */}
          <div className="overflow-auto space-y-3">
            {cur.qPages.map((p, i) => (
              <PageImage
                key={p.url}
                page={p}
                alt={cur.qPages.length > 1 ? `${cur.label} (${i + 1}/${cur.qPages.length})` : cur.label}
                zoom={zoom}
                onClick={() => setZoom((z) => !z)}
              />
            ))}
          </div>

          {showAns && cur.aPages.length > 0 && (
            <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
              <div className="text-sm font-semibold text-emerald-600 mb-2">답안</div>
              <div className="overflow-auto space-y-3">
                {cur.aPages.map((p, i) => (
                  <PageImage
                    key={p.url}
                    page={p}
                    alt={cur.aPages.length > 1 ? `${cur.label} 답안 (${i + 1}/${cur.aPages.length})` : `${cur.label} 답안`}
                  />
                ))}
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
                    onClick={() => goTo(it)}
                    className={`px-2.5 py-1 rounded-lg border text-xs ${
                      done.has(it.file)
                        ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600"
                    }`}
                  >
                    {it.src === "note" && <span className="mr-1 text-violet-500">✎</span>}
                    {it.label}{it.aPages.length > 0 && <span className="ml-1 opacity-50">·답</span>}
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        문제는 <b>[다음 문제]</b>·<b>[이전 문제]</b>·<b>[랜덤 출제]</b> 버튼이나 아래 목록에서 고를 때만 바뀝니다
        (범위를 바꿔도 보고 있던 문제는 그대로입니다). 단축키 <b>A</b> 답안 · <b>S</b> 풀었음.
        이미지를 클릭하면 원본 크기로 확대됩니다.
        {idx.orphanAnswers.length > 0 && (
          <> <br />※ 문제 스샷이 없는 답안 {idx.orphanAnswers.length}개: {idx.orphanAnswers.join(", ")}</>
        )}
      </p>
    </div>
  );
}
