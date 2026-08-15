"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  NOTE_ALBUM_KEYS,
  NOTE_MAX_FILES_PER_UPLOAD,
  NOTE_SEARCH_MAX,
  NOTE_TITLE_MAX,
  isNoteExtraAlbumKey,
  noteAlbumLabel,
  notePhotoTitle,
  noteSearchTokens,
  type NoteAlbumKey,
  type NotePhoto,
  type NoteRotation,
  type NoteSearchHit,
} from "@/types/notes";

export type SubjectNotesProps = {
  /**
   * 고르기 모드 — 썸네일을 누르면 확대 보기 대신 `onSelectPhoto`가 불린다.
   * ★ 문제 생성 화면의 업로드 창이 **이 컴포넌트를 그대로 띄워** 사진을 고른다.
   *   사진첩 화면과 똑같이 보이게 하려고 고르기용 그리드를 따로 만들지 않았다.
   */
  pickMode?: boolean;
  /** 처음 열 앨범 (고르기 모드에서 전공스샷으로 바로 여는 용도). */
  initialAlbum?: NoteAlbumKey;
  /**
   * ★ 앨범 고정 — `initialAlbum` 하나만 쓰고 **다른 앨범으로 넘어가지 못하게** 한다.
   *   앨범 선택 줄을 감추고, 제목 검색도 그 앨범 안에서만 걸린다
   *   (문제 이미지 업로드 창은 전공스샷만 보여야 하므로).
   */
  lockAlbum?: boolean;
  /**
   * 사진을 골랐을 때. ★ **두 번째 인자 album을 반드시 쓸 것** — 제목 검색 결과는
   * 지금 열려 있는 앨범이 아닌 다른 앨범의 사진일 수 있다(이미지 조회 URL이 달라진다).
   */
  onSelectPhoto?: (photo: NotePhoto, album: NoteAlbumKey) => void;
};

/**
 * 화면에 늘어놓는 사진 한 장 — **어느 앨범 것인지 함께** 들고 다닌다.
 * 평소엔 지금 열린 앨범의 사진들이고, 제목 검색 중에는 여러 앨범의 결과가 섞인다.
 * 회전·설명·삭제가 전부 앨범 키를 필요로 하므로 목록을 이 모양으로 통일했다
 * (검색용 그리드를 따로 만들면 같은 기능을 두 벌 관리하게 된다).
 */
type NoteEntry = { album: NoteAlbumKey; photo: NotePhoto; position: number };

/**
 * 요점정리 사진첩 — 사진 여러 장 업로드 · 썸네일 그리드 · 확대 보기 · 설명 · 삭제.
 * 앨범은 과목 8종 + **전공스샷**(과목과 무관한 별도 앨범)으로, 저장·API는 모두 같은 경로를 쓴다.
 */
export default function SubjectNotes({
  pickMode = false,
  initialAlbum,
  lockAlbum = false,
  onSelectPhoto,
}: SubjectNotesProps = {}) {
  const [subject, setSubject] = useState<NoteAlbumKey>(initialAlbum ?? "electronics");
  const [notes, setNotes] = useState<NotePhoto[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // 업로드할 사진에 붙일 제목 — 휴대폰 사진(IMG_1234)은 파일명이 제목 구실을 못 한다.
  const [uploadTitle, setUploadTitle] = useState("");
  // 순서 변경 드래그 — dragIndex=집어든 사진, overIndex=놓을 자리.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // 제목 검색 — 입력값과 서버가 돌려준 결과(모든 앨범). hits=null이면 검색 중이 아님.
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<NoteSearchHit[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTruncated, setSearchTruncated] = useState(false);

  /** 검색어가 유효한가 (공백만 친 경우는 검색으로 치지 않는다). */
  const searchMode = noteSearchTokens(query).length > 0;

  const load = useCallback(async (subj: NoteAlbumKey) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?subject=${subj}`);
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      setNotes(data.notes ?? []);
      setCounts(data.counts ?? {});
    } catch (e) {
      setNotes([]);
      setError(`목록을 불러오지 못했습니다: ${(e as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(subject);
  }, [subject, load]);

  /**
   * 검색어 입력 — 지우거나 새로 치는 즉시 상태를 맞춘다.
   * ★ 결과 비우기·확대 보기 닫기를 **여기(이벤트)** 에서 한다. effect에서 하면 한 박자 늦게
   *   반영돼 잠깐 옛 결과가 보이고, 렌더도 한 번 더 돈다(react-hooks/set-state-in-effect).
   */
  const changeQuery = useCallback((next: string) => {
    const value = next.slice(0, NOTE_SEARCH_MAX);
    setQuery(value);
    setViewerIndex(null);
    const searching = noteSearchTokens(value).length > 0;
    setIsSearching(searching);
    if (!searching) {
      setHits(null);
      setSearchTruncated(false);
    }
  }, []);

  /**
   * 제목 검색 — 타이핑이 멎으면(250ms) **모든 앨범**을 서버에서 훑는다.
   * 앨범마다 조회하지 않는 이유는 `/api/notes`의 GET 주석 참고.
   * 이전 요청은 취소해 늦게 도착한 응답이 새 결과를 덮어쓰지 못하게 한다.
   */
  useEffect(() => {
    if (noteSearchTokens(query).length === 0) return;
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/notes?subject=${subject}&q=${encodeURIComponent(query)}`,
          { signal: ctl.signal },
        );
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setHits(data.hits ?? []);
        setSearchTruncated(Boolean(data.truncated));
        setCounts(data.counts ?? {});
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError(`검색 실패: ${(e as Error).message}`);
      } finally {
        // 취소된 요청이 뒤늦게 로딩 표시를 꺼서 새 검색이 멈춘 것처럼 보이지 않게.
        if (!ctl.signal.aborted) setIsSearching(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [query, subject]);

  /**
   * 화면에 그릴 목록 — 검색 중이면 여러 앨범의 결과, 아니면 지금 앨범의 사진들.
   * 아래 그리드·확대 보기·회전/삭제는 전부 이 목록 하나만 본다.
   */
  const entries: NoteEntry[] = useMemo(
    () => {
      if (!searchMode) return notes.map((photo, i) => ({ album: subject, photo, position: i }));
      const found = (hits ?? []).map((h) => ({ album: h.album, photo: h.photo, position: h.position }));
      // ★ 앨범 고정 모드에서는 다른 앨범 결과를 걸러낸다 — 검색은 모든 앨범을 훑기 때문에
      //   그대로 두면 "전공스샷만 보이게" 해 둔 창에 다른 앨범 사진이 섞여 나온다.
      return lockAlbum ? found.filter((e) => e.album === subject) : found;
    },
    [searchMode, hits, notes, subject, lockAlbum],
  );

  /** 검색 결과가 여러 앨범에 걸쳐 있으면 타일마다 앨범 이름을 붙여 준다. */
  const hitAlbumCount = useMemo(
    () => (searchMode ? new Set(entries.map((e) => e.album)).size : 0),
    [searchMode, entries],
  );

  /**
   * 실제로 열어 줄 확대 보기 위치 — 목록이 짧아졌으면(삭제·앨범 전환) 마지막 사진으로 당긴다.
   * 상태를 고쳐 쓰지 않고 **그릴 때 계산**한다 — 목록이 바뀔 때마다 effect로 맞추면
   * 한 프레임 동안 빈 자리를 가리킨다.
   */
  const openIndex =
    viewerIndex === null || entries.length === 0
      ? null
      : Math.min(viewerIndex, entries.length - 1);

  const upload = useCallback(
    async (files: File[]) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return;
      setIsUploading(true);
      setError(null);
      setNotice(null);
      try {
        const form = new FormData();
        form.append("subject", subject);
        if (uploadTitle.trim()) form.append("title", uploadTitle.trim());
        // 상한을 넘겨 보내면 서버가 통째로 거부하므로 앞에서 잘라 여러 번 나눠 올린다.
        for (const file of images.slice(0, NOTE_MAX_FILES_PER_UPLOAD)) form.append("files", file);
        const res = await fetch("/api/notes", { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setNotes(data.notes ?? []);
        setCounts((c) => ({ ...c, [subject]: (data.notes ?? []).length }));
        const rejected: string[] = data.rejected ?? [];
        const overflow = images.length - Math.min(images.length, NOTE_MAX_FILES_PER_UPLOAD);
        const parts = [`${data.added}장 추가됨`];
        if (rejected.length) parts.push(`제외 ${rejected.length}장 — ${rejected.join(" / ")}`);
        if (overflow > 0) parts.push(`${overflow}장은 한 번에 올릴 수 있는 장수를 넘어 제외`);
        setNotice(parts.join(" · "));
        setUploadTitle(""); // 다음 업로드에 이전 제목이 딸려가지 않게 비운다.
      } catch (e) {
        setError(`업로드 실패: ${(e as Error).message}`);
      } finally {
        setIsUploading(false);
      }
    },
    [subject, uploadTitle],
  );

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) void upload(files);
    // 같은 파일을 연속으로 다시 고를 수 있게 값 초기화.
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) void upload(files);
  };

  // 캡처한 화면을 Ctrl+V로 바로 붙여넣기 (요점정리는 캡처가 많다).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) void upload(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [upload]);

  /**
   * 사진 한 장의 메타를 화면 목록(지금 앨범 + 검색 결과) 양쪽에 반영한다.
   * 검색 결과에는 다른 앨범 사진이 섞여 있으므로 앨범 키까지 맞춰 봐야 한다.
   */
  const applyPhotoPatch = useCallback(
    (album: NoteAlbumKey, id: string, patch: Partial<NotePhoto>) => {
      if (album === subject) {
        setNotes((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      }
      setHits((list) =>
        list
          ? list.map((h) =>
              h.album === album && h.photo.id === id ? { ...h, photo: { ...h.photo, ...patch } } : h,
            )
          : list,
      );
    },
    [subject],
  );

  const removeNote = async (album: NoteAlbumKey, id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/notes?subject=${album}&id=${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      const next: NotePhoto[] = data.notes ?? [];
      if (album === subject) setNotes(next);
      setCounts((c) => ({ ...c, [album]: next.length }));
      // 검색 결과에서 지운 경우 — 다시 검색하지 않고 그 자리만 빼낸다.
      setHits((list) => (list ? list.filter((h) => !(h.album === album && h.photo.id === id)) : list));
    } catch (e) {
      setError(`삭제 실패: ${(e as Error).message}`);
    }
  };

  /**
   * 새 순서를 화면에 먼저 반영하고 서버에 저장 (낙관적 갱신).
   * 실패하면 서버가 준 최신 목록으로 되돌린다 — 409는 다른 곳에서 목록이 바뀐 경우다.
   */
  const applyOrder = async (next: NotePhoto[]) => {
    const prev = notes;
    setNotes(next);
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, order: next.map((p) => p.id) }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setNotes(data.notes ?? prev);
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setNotes(data.notes ?? next);
    } catch (e) {
      setError(`순서 변경 실패: ${(e as Error).message}`);
    }
  };

  /** from 위치의 사진을 빼서 to 위치에 끼워 넣는다 (자리 교환이 아니라 삽입). */
  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    if (from < 0 || to < 0 || from >= notes.length || to >= notes.length) return;
    const next = [...notes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void applyOrder(next);
  };

  /** 회전각 저장 — 화면에 먼저 반영하고 실패 시 되돌린다 (원본 파일은 건드리지 않음). */
  const rotatePhoto = async (album: NoteAlbumKey, id: string, rotation: NoteRotation) => {
    const before = entries.find((e) => e.album === album && e.photo.id === id)?.photo.rotation ?? 0;
    applyPhotoPatch(album, id, { rotation });
    setError(null);
    try {
      const res = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: album, id, rotation }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
    } catch (e) {
      applyPhotoPatch(album, id, { rotation: before });
      setError(`회전 저장 실패: ${(e as Error).message}`);
    }
  };

  const saveMemo = async (album: NoteAlbumKey, id: string, memo: string) => {
    try {
      const res = await fetch("/api/notes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: album, id, memo }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      applyPhotoPatch(album, id, { memo });
    } catch (e) {
      setError(`설명 저장 실패: ${(e as Error).message}`);
    }
  };

  const total = NOTE_ALBUM_KEYS.reduce((s, k) => s + (counts[k] ?? 0), 0);
  // 사진 제목(파일명) 표시 — 전공스샷 같은 별도 앨범은 파일명이 곧 내용이라 썸네일과 함께 보여준다.
  //   과목 요점정리는 IMG_1234 같은 이름이 대부분이라 그대로 두면 화면만 시끄러워진다.
  //   ★ 검색 중에는 과목 앨범이라도 제목을 보여준다 — 무엇이 걸렸는지 봐야 고를 수 있다.
  const showPhotoTitles = searchMode || isNoteExtraAlbumKey(subject);

  return (
    <div className="space-y-5">
      {/* 앨범 선택 — 과목 8종 + 전공스샷. */}
      <section className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm">
        {/*
          ★ 고정 모드에서는 **앨범 고르는 부분만** 감춘다.
            섹션을 통째로 감췄더니 그 안에 있던 **제목 검색칸까지 사라져** 창에서 검색을 할 수 없었다
            (사용자가 위쪽 "사진 제목"(업로드용) 칸에 연도를 치게 됨 — 실측 신고).
        */}
        <div className={lockAlbum ? "hidden" : "flex items-baseline justify-between mb-3"}>
          <h2 className="text-sm font-semibold text-blue-900">앨범</h2>
          <span className="text-xs text-slate-400">전체 {total}장</span>
        </div>
        {/* 앨범 11개(과목 8 + 별도 3) — 한 줄에 9개를 욱여넣으면 이름이 잘려 두 줄로 나눈다. */}
        <div className={lockAlbum ? "hidden" : "grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2"}>
          {NOTE_ALBUM_KEYS.map((key) => {
            const active = subject === key;
            const n = counts[key] ?? 0;
            return (
              <button
                key={key}
                type="button"
                // 앨범을 고르면 검색은 끝낸다 — 검색 결과는 앨범을 가로지르므로
                // 그대로 두면 "앨범을 눌렀는데 화면이 안 바뀐다"로 보인다.
                onClick={() => {
                  setSubject(key);
                  setQuery("");
                }}
                // 과목이 아닌 별도 앨범(전공스샷)은 호박색으로 구분한다 — 과목 버튼과 섞이지 않게
                // (교육학 버튼만 연두색으로 구분한 SubjectSelector와 같은 방식).
                className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
                  active
                    ? isNoteExtraAlbumKey(key)
                      ? "border-amber-500 bg-amber-50 text-amber-700"
                      : "border-blue-500 bg-blue-50 text-blue-700"
                    : isNoteExtraAlbumKey(key)
                    ? "border-amber-200 bg-amber-50/40 text-amber-700 hover:border-amber-400"
                    : "border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-600"
                }`}
              >
                <span className="block truncate">{noteAlbumLabel(key)}</span>
                <span
                  className={`block text-xs mt-0.5 ${
                    active ? (isNoteExtraAlbumKey(key) ? "text-amber-500" : "text-blue-500") : "text-slate-400"
                  }`}
                >
                  {n}장
                </span>
              </button>
            );
          })}
        </div>

        {/* 제목 검색 — 앨범을 옮겨 다니지 않아도 되도록 **모든 앨범**을 한 번에 훑는다. */}
        {/* 고정 모드에서는 위쪽 앨범 격자가 없으므로 구분선·여백을 빼야 빈 줄이 안 생긴다. */}
        <div className={lockAlbum ? "" : "mt-4 pt-4 border-t border-blue-50"}>
          <label htmlFor="note-search" className="block text-xs text-slate-500 mb-1">
            제목으로 찾기{" "}
            <span className="text-slate-400">
              {lockAlbum ? `(${noteAlbumLabel(subject)}에서 검색 · 예: 2026)` : "(모든 앨범에서 검색)"}
            </span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden>
              🔍
            </span>
            <input
              id="note-search"
              type="search"
              value={query}
              onChange={(e) => changeQuery(e.target.value)}
              placeholder="예: 테브난 · 2022 B-6 · 중첩"
              className="w-full pl-9 pr-20 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400"
            />
            {query && (
              <button
                type="button"
                onClick={() => changeQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs text-slate-500 hover:bg-slate-100"
              >
                지우기
              </button>
            )}
          </div>
          {searchMode && (
            <p className="mt-2 text-xs text-slate-500">
              {isSearching && hits === null
                ? "찾는 중..."
                : `“${query.trim()}” 검색 결과 ${entries.length}장${
                    hitAlbumCount > 1 ? ` · 앨범 ${hitAlbumCount}곳` : ""
                  }`}
              {searchTruncated && (
                <span className="text-amber-600"> · 결과가 많아 앞부분만 보여줍니다</span>
              )}
            </p>
          )}
        </div>
      </section>

      {/* 업로드 */}
      <section className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-blue-900 mb-3">
          {noteAlbumLabel(subject)}{isNoteExtraAlbumKey(subject) ? "" : " 요점정리"} 사진 올리기
        </h2>
        {/* 제목 — 휴대폰 사진은 파일명이 IMG_1234라 제목 구실을 못 한다. 비워두면 파일명이 제목이 된다.
            여러 장을 한 번에 올리면 서버가 "제목 (2)"처럼 번호를 붙인다. */}
        <div className="mb-3">
          <label htmlFor="note-title" className="block text-xs text-slate-500 mb-1">
            사진 제목 <span className="text-slate-400">(선택 · 비우면 파일명이 제목)</span>
          </label>
          <input
            id="note-title"
            type="text"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value.slice(0, NOTE_TITLE_MAX))}
            placeholder="예: 2022 전기 B-6 중첩의 원리"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-blue-400"
          />
        </div>
        <label
          htmlFor="notes-input"
          onDragOver={(e) => {
            // 순서 변경 중인 썸네일이 지나갈 때는 업로드 영역이 반응하지 않게 한다.
            if (dragIndex !== null) return;
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`block w-full cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
            dragOver ? "border-blue-500 bg-blue-100/60" : "border-blue-200 bg-blue-50/30 hover:border-blue-400 hover:bg-blue-50"
          }`}
        >
          <input
            id="notes-input"
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPick}
          />
          <div className="space-y-2 py-4">
            <svg className="mx-auto w-10 h-10 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18 9h.008v.008H18V9zm2.25 9a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18V6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v12z"
              />
            </svg>
            <p className="text-sm font-medium text-blue-700">
              {isUploading ? "올리는 중..." : "사진 여러 장을 클릭하거나 끌어놓으세요"}
            </p>
            <p className="text-xs text-slate-500">
              한 번에 최대 {NOTE_MAX_FILES_PER_UPLOAD}장 · PNG · JPG · WEBP · HEIC · Ctrl+V 붙여넣기도 됩니다
            </p>
          </div>
        </label>

        {error && (
          <p className="mt-3 text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">{error}</p>
        )}
        {notice && !error && (
          <p className="mt-3 text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">{notice}</p>
        )}
      </section>

      {/* 썸네일 그리드 */}
      <section className="bg-white rounded-2xl border border-blue-100 p-5 shadow-sm">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-blue-900">
            {searchMode ? `제목 검색 결과 · ${entries.length}장` : `${noteAlbumLabel(subject)} · ${notes.length}장`}
          </h2>
          {entries.length > 0 && (
            <span className="text-xs text-slate-400">
              {searchMode
                ? "누르면 크게 보기 · 순서 변경은 검색을 지운 뒤에"
                : "누르면 크게 보기 · 끌어서 순서 변경 (Ctrl+←/→ 도 가능)"}
            </span>
          )}
        </div>

        {(searchMode ? isSearching && hits === null : isLoading) ? (
          <p className="py-12 text-center text-sm text-slate-400">
            {searchMode ? "찾는 중..." : "불러오는 중..."}
          </p>
        ) : entries.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            {searchMode ? (
              <>제목에 “{query.trim()}”이(가) 들어간 사진이 없습니다. 다른 낱말로 찾아보세요.</>
            ) : (
              <>
                아직 올린 사진이 없습니다. 위에 사진을 올려 {noteAlbumLabel(subject)}
                {isNoteExtraAlbumKey(subject) ? " 사진을" : " 요점정리를"} 모아두세요.
              </>
            )}
          </p>
        ) : (
          <div
            /* 한 줄에 5개 정도 — 썸네일이 작아도 제목이 같이 보여 고르는 데 문제가 없다(사용자 요청). */
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
          >
            {entries.map((entry, i) => {
              const { photo, album } = entry;
              // 순서 변경은 **한 앨범 안에서만** 뜻이 있다 — 검색 결과는 여러 앨범이 섞여 있어 끈다.
              const canReorder = !searchMode;
              const isDragging = dragIndex === i;
              const isDropTarget = overIndex === i && dragIndex !== null && dragIndex !== i;
              // ★ 전공스샷처럼 파일명이 곧 내용인 앨범은 **제목을 타일 아래에** 함께 보여준다.
              //   (이미지 위에 겹치면 스샷의 글씨를 가린다 — 설명 memo 오버레이와 겹치기도 한다.)
              const tile = (
                <div
                  role="button"
                  tabIndex={0}
                  draggable={canReorder}
                  onClick={() => (pickMode && onSelectPhoto ? onSelectPhoto(photo, album) : setViewerIndex(i))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (pickMode && onSelectPhoto) onSelectPhoto(photo, album);
                      else setViewerIndex(i);
                    }
                    // 키보드로도 순서 변경 — Ctrl+←/→ 로 한 칸씩 이동.
                    if (canReorder && e.ctrlKey && e.key === "ArrowLeft") {
                      e.preventDefault();
                      moveTo(i, i - 1);
                    }
                    if (canReorder && e.ctrlKey && e.key === "ArrowRight") {
                      e.preventDefault();
                      moveTo(i, i + 1);
                    }
                  }}
                  onDragStart={(e) => {
                    if (!canReorder) return;
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = "move";
                    // Firefox는 데이터가 없으면 드래그를 시작하지 않는다.
                    e.dataTransfer.setData("text/plain", String(i));
                  }}
                  onDragOver={(e) => {
                    if (dragIndex === null) return; // 파일 드롭은 위쪽 업로드 영역이 처리.
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setOverIndex(i);
                  }}
                  onDrop={(e) => {
                    if (dragIndex === null) return;
                    e.preventDefault();
                    e.stopPropagation();
                    moveTo(dragIndex, i);
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className={`group relative aspect-square overflow-hidden rounded-xl border bg-slate-50 cursor-pointer transition-all ${
                    isDragging
                      ? "opacity-40 border-blue-300"
                      : isDropTarget
                        ? "border-blue-500 ring-2 ring-blue-400 scale-[1.02]"
                        : "border-blue-100 hover:border-blue-400"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/notes/image?subject=${album}&id=${photo.id}`}
                    alt={photo.memo || photo.fileName}
                    loading="lazy"
                    draggable={false} /* 이미지 자체가 끌리면 타일 드래그가 시작되지 않는다 */
                    /* 정사각 타일에 object-cover라 90·270도로 돌려도 빈 곳 없이 채워진다. */
                    style={{ transform: `rotate(${photo.rotation}deg)` }}
                    className="w-full h-full object-cover"
                  />
                  {/* 평소엔 앨범 안 번호, 검색 중에는 **어느 앨범의 몇 번째**인지 (찾은 사진의 위치를 알려준다). */}
                  <span className="absolute top-1.5 left-1.5 max-w-[85%] truncate px-1.5 py-0.5 rounded-md bg-black/55 text-white text-[11px] font-medium">
                    {searchMode ? `${noteAlbumLabel(album)} · ${entry.position + 1}` : i + 1}
                  </span>

                  {/* 한 칸씩 이동 — 드래그가 어려운 환경(터치·좁은 화면)용 */}
                  <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    {canReorder && i > 0 && (
                      <button
                        type="button"
                        aria-label="앞으로 이동"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTo(i, i - 1);
                        }}
                        className="w-6 h-6 rounded-md bg-white/90 border border-slate-200 text-slate-600 text-xs leading-none hover:bg-white"
                      >
                        ‹
                      </button>
                    )}
                    {canReorder && i < entries.length - 1 && (
                      <button
                        type="button"
                        aria-label="뒤로 이동"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveTo(i, i + 1);
                        }}
                        className="w-6 h-6 rounded-md bg-white/90 border border-slate-200 text-slate-600 text-xs leading-none hover:bg-white"
                      >
                        ›
                      </button>
                    )}
                  </div>

                  {photo.memo && (
                    <span className="absolute inset-x-0 bottom-0 px-2 py-1.5 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] text-left truncate">
                      {photo.memo}
                    </span>
                  )}
                </div>
              );
              if (!showPhotoTitles) return <div key={photo.id}>{tile}</div>;
              return (
                <figure key={photo.id} className="space-y-1.5">
                  {tile}
                  {/* 제목은 잘릴 수 있으므로 title 속성으로 전체 이름을 남긴다. */}
                  <figcaption
                    title={photo.fileName}
                    className="px-0.5 text-[11px] leading-tight text-slate-600 truncate"
                  >
                    {notePhotoTitle(photo)}
                  </figcaption>
                </figure>
              );
            })}
          </div>
        )}
      </section>

      {openIndex !== null && entries[openIndex] && (
        <PhotoViewer
          entries={entries}
          index={openIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
          onSaveMemo={saveMemo}
          onRotate={rotatePhoto}
          onDelete={removeNote}
        />
      )}
    </div>
  );
}

const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;

/** 뷰어 상단 도구 버튼 (회전·확대) — 정사각 아이콘 버튼. */
function ToolButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-600 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

/**
 * 확대 보기 — 회전(저장됨) · 확대/축소 · 끌어서 이동.
 * 키: ESC 닫기, ←/→ 사진 이동, +/− 확대·축소, 0 화면 맞춤, R 오른쪽 회전.
 *
 * ★ 사진마다 **앨범 키를 함께** 받는다 — 제목 검색 결과는 여러 앨범이 섞여 있어
 *   이미지 조회·회전·삭제 요청을 사진별 앨범으로 보내야 한다.
 */
function PhotoViewer({
  entries,
  index,
  onIndexChange,
  onClose,
  onSaveMemo,
  onRotate,
  onDelete,
}: {
  entries: NoteEntry[];
  index: number;
  onIndexChange: (i: number) => void;
  onClose: () => void;
  onSaveMemo: (album: NoteAlbumKey, id: string, memo: string) => Promise<void>;
  onRotate: (album: NoteAlbumKey, id: string, rotation: NoteRotation) => Promise<void>;
  onDelete: (album: NoteAlbumKey, id: string) => Promise<void>;
}) {
  const { photo, album } = entries[index];
  const [memoDraft, setMemoDraft] = useState(photo.memo);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  /** 이미지 원본 픽셀 크기 — 화면 맞춤 배율을 정확히 계산하려면 필요하다. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  /** 화면 맞춤(=1) 기준 배율. 실제 표시 배율은 fitScale × zoom. */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const rotation = photo.rotation;
  const isQuarterTurn = rotation === 90 || rotation === 270;

  // 사진이 바뀌면 편집 중이던 설명·삭제 확인 상태를 새 사진 기준으로 초기화.
  useEffect(() => {
    setMemoDraft(photo.memo);
    setConfirmDelete(false);
  }, [photo.id, photo.memo]);

  // 회전하면 맞춤 배율이 달라지므로 확대·이동만 초기화한다.
  // ★ natural(원본 픽셀 크기)은 회전해도 그대로다. 여기서 지우면 src가 안 바뀌어
  //   onLoad가 다시 뜨지 않아 크기를 영영 모르고, 이미지가 원본 크기로 튀어나온다.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [photo.id, rotation]);

  // 다른 사진으로 넘어갈 때만 원본 크기를 새로 잰다.
  useEffect(() => {
    setNatural(null);
    // 이미 캐시돼 즉시 완료된 이미지는 onLoad가 발생하지 않으므로 여기서 직접 읽는다.
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) {
      setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    }
  }, [photo.id]);

  // 창 크기가 바뀌면 맞춤 배율도 바뀐다 — 표시 영역 크기를 추적.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStage({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /**
   * 회전을 감안해 표시 영역에 꽉 차게 맞추는 배율.
   * 90·270도에서는 화면상 가로·세로가 뒤바뀌므로 원본 치수를 교환해 계산한다.
   * 작은 사진도 영역을 채우도록 확대를 허용한다 — 요점정리는 크게 보는 게 목적이다.
   */
  const fitScale = useMemo(() => {
    if (!natural || !stage.w || !stage.h) return 1;
    const w = isQuarterTurn ? natural.h : natural.w;
    const h = isQuarterTurn ? natural.w : natural.h;
    return Math.min(stage.w / w, stage.h / h);
  }, [natural, stage, isQuarterTurn]);

  const scale = fitScale * zoom;

  /** 확대된 이미지가 표시 영역을 벗어난 만큼만 이동을 허용 (화면 밖으로 날아가지 않게). */
  const clampPan = useCallback(
    (p: { x: number; y: number }) => {
      if (!natural) return { x: 0, y: 0 };
      const boxW = (isQuarterTurn ? natural.h : natural.w) * scale;
      const boxH = (isQuarterTurn ? natural.w : natural.h) * scale;
      const maxX = Math.max(0, (boxW - stage.w) / 2);
      const maxY = Math.max(0, (boxH - stage.h) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, p.x)),
        y: Math.min(maxY, Math.max(-maxY, p.y)),
      };
    },
    [natural, isQuarterTurn, scale, stage],
  );

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(1, next));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    setPan((p) => clampPan(p));
  }, [clampPan]);

  // 휠 확대 — React의 onWheel은 passive라 preventDefault가 안 되므로 직접 등록한다.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) => {
        const next = Math.min(ZOOM_MAX, Math.max(1, e.deltaY < 0 ? z * ZOOM_STEP : z / ZOOM_STEP));
        if (next === 1) setPan({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && index < entries.length - 1) onIndexChange(index + 1);
      if (e.key === "+" || e.key === "=") applyZoom(zoom * ZOOM_STEP);
      if (e.key === "-" || e.key === "_") applyZoom(zoom / ZOOM_STEP);
      if (e.key === "0") applyZoom(1);
      if (e.key === "r" || e.key === "R") {
        void onRotate(album, photo.id, (((rotation + 90) % 360) as NoteRotation));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, entries.length, onClose, onIndexChange, applyZoom, zoom, onRotate, album, photo.id, rotation]);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        /* ★ 확정 높이(h-[92vh])가 필요하다 — max-h만 주면 카드 높이가 내용에 따라 정해져
           아래 사진 영역의 flex-1이 나눠 받을 여백이 0이 되고, 사진이 담길 높이가 0으로 무너진다. */
        className="bg-white rounded-2xl overflow-hidden w-full max-w-[92vw] h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-900 truncate">{photo.fileName}</p>
            <p className="text-xs text-slate-400">
              {noteAlbumLabel(album)} · {index + 1} / {entries.length} · {(photo.bytes / 1024).toFixed(0)}KB
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 text-xl leading-none"
            aria-label="닫기"
          >
            ×
          </button>
        </div>

        {/* 회전 · 확대 도구 */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 bg-slate-50/60">
          <ToolButton
            label="왼쪽으로 90° 회전"
            onClick={() => void onRotate(album, photo.id, (((rotation + 270) % 360) as NoteRotation))}
          >
            ↺
          </ToolButton>
          <ToolButton
            label="오른쪽으로 90° 회전"
            onClick={() => void onRotate(album, photo.id, (((rotation + 90) % 360) as NoteRotation))}
          >
            ↻
          </ToolButton>
          <span className="text-xs text-slate-400 w-12">{rotation}°</span>

          <span className="w-px h-5 bg-slate-200 mx-1" />

          <ToolButton label="축소" onClick={() => applyZoom(zoom / ZOOM_STEP)} disabled={zoom <= 1}>
            −
          </ToolButton>
          <span className="text-xs text-slate-500 tabular-nums w-14 text-center">
            {Math.round(scale * 100)}%
          </span>
          <ToolButton label="확대" onClick={() => applyZoom(zoom * ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
            +
          </ToolButton>
          <button
            type="button"
            onClick={() => applyZoom(1)}
            disabled={zoom === 1}
            className="px-2.5 h-8 rounded-lg border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            화면 맞춤
          </button>
          <span className="hidden md:inline text-xs text-slate-400 ml-auto">
            휠 확대 · 끌어서 이동 · 더블클릭 확대 · R 회전
          </span>
        </div>

        <div
          ref={stageRef}
          /* 사진은 absolute라 이 영역엔 흐름상 내용이 없다 — 높이는 위 카드의 확정 높이에서
             flex-1로 받아 온다(h-* 를 같이 주면 flex-basis에 밀려 무시된다). */
          className={`relative flex-1 min-h-0 overflow-hidden bg-slate-50 ${
            zoom > 1 ? (isPanning ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
          }`}
          onDoubleClick={() => applyZoom(zoom > 1 ? 1 : 2)}
          onPointerDown={(e) => {
            if (zoom <= 1) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
            setIsPanning(true);
          }}
          onPointerMove={(e) => {
            const start = panStart.current;
            if (!start) return;
            setPan(
              clampPan({
                x: start.px + (e.clientX - start.mx),
                y: start.py + (e.clientY - start.my),
              }),
            );
          }}
          onPointerUp={() => {
            panStart.current = null;
            setIsPanning(false);
          }}
          onPointerCancel={() => {
            panStart.current = null;
            setIsPanning(false);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={`/api/notes/image?subject=${album}&id=${photo.id}`}
            alt={photo.memo || photo.fileName}
            draggable={false}
            onLoad={(e) =>
              setNatural({
                w: e.currentTarget.naturalWidth,
                h: e.currentTarget.naturalHeight,
              })
            }
            style={{
              // 원본 크기로 두고 transform 하나로 회전·배율·이동을 모두 처리한다
              // (적용 순서는 오른쪽부터 — 회전 → 확대 → 이동 → 가운데 정렬).
              width: natural ? `${natural.w}px` : undefined,
              height: natural ? `${natural.h}px` : undefined,
              transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isPanning ? "none" : "transform 120ms ease-out",
              // 크기를 재기 전에는 배율을 알 수 없어 원본 픽셀 크기로 잠깐 튀어 보인다 — 그때만 감춘다.
              visibility: natural ? "visible" : "hidden",
            }}
            className="absolute left-1/2 top-1/2 max-w-none select-none"
          />
          {!natural && (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              사진 여는 중...
            </p>
          )}
          {index > 0 && (
            <button
              type="button"
              onClick={() => onIndexChange(index - 1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 border border-slate-200 shadow-sm text-slate-600 hover:bg-white"
              aria-label="이전 사진"
            >
              ‹
            </button>
          )}
          {index < entries.length - 1 && (
            <button
              type="button"
              onClick={() => onIndexChange(index + 1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 border border-slate-200 shadow-sm text-slate-600 hover:bg-white"
              aria-label="다음 사진"
            >
              ›
            </button>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={memoDraft}
            onChange={(e) => setMemoDraft(e.target.value)}
            onBlur={() => memoDraft !== photo.memo && void onSaveMemo(album, photo.id, memoDraft)}
            placeholder="설명 (예: 테브난 등가 정리 요약)"
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:border-blue-400 focus:outline-none"
          />
          {confirmDelete ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void onDelete(album, photo.id)}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium"
              >
                정말 삭제
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50"
              >
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-2 rounded-lg border border-rose-200 text-rose-600 text-sm font-medium hover:bg-rose-50"
            >
              삭제
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
