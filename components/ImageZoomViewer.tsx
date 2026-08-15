"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ZOOM_MAX = 8;
const ZOOM_STEP = 1.25;

export type ImageRotation = 0 | 90 | 180 | 270;

type Props = {
  /** 이미지 주소 — data URL·API 경로 무엇이든 <img src>에 넣을 수 있으면 된다. */
  src: string;
  alt?: string;
  /** 헤더 제목 (예: 파일명) */
  title?: string;
  /** 헤더 보조 설명 */
  subtitle?: string;
  onClose: () => void;
};

/**
 * 어떤 이미지든 크게 볼 수 있는 공용 확대 뷰어 — 확대/축소 · 끌어서 이동 · 90° 회전.
 *
 * 특정 화면(원본 풀이·정답 등)에 종속된 정보를 갖지 않는다. 필요한 곳에서 src만 넘기면 된다.
 * 회전은 보기용 상태라 저장하지 않는다(원본 파일·서버 기록은 건드리지 않음).
 *
 * 키: ESC 닫기, +/− 확대·축소, 0 화면 맞춤, R 오른쪽 회전.
 */
export default function ImageZoomViewer({ src, alt, title, subtitle, onClose }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  /** 이미지 원본 픽셀 크기 — 화면 맞춤 배율을 정확히 계산하려면 필요하다. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  /** 화면 맞춤(=1) 기준 배율. 실제 표시 배율은 fitScale × zoom. */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<ImageRotation>(0);
  const panStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const isQuarterTurn = rotation === 90 || rotation === 270;

  // 다른 이미지로 바뀌면 크기를 새로 재고 보기 상태를 초기화한다.
  useEffect(() => {
    setNatural(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
    // 이미 캐시돼 즉시 완료된 이미지는 onLoad가 발생하지 않으므로 여기서 직접 읽는다.
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) {
      setNatural({ w: el.naturalWidth, h: el.naturalHeight });
    }
  }, [src]);

  // 회전하면 맞춤 배율이 달라지므로 확대·이동만 초기화한다(원본 크기는 그대로).
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [rotation]);

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

  /**
   * 배율 변경. ★ 현재 zoom을 인자로 계산해서 넘기면 빠르게 두 번 누를 때
   * 두 클릭이 **같은 값**을 보고 한 단계만 움직인다 — 반드시 함수형 갱신으로 이어 붙인다.
   */
  const zoomBy = useCallback((factor: number) => {
    setZoom((z) => {
      const next = Math.min(ZOOM_MAX, Math.max(1, z * factor));
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const applyZoom = useCallback((next: number) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(1, next));
    setZoom(clamped);
    if (clamped === 1) setPan({ x: 0, y: 0 });
  }, []);

  const rotate = useCallback((deltaDeg: 90 | 270) => {
    setRotation((r) => (((r + deltaDeg) % 360) as ImageRotation));
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
      if (e.key === "+" || e.key === "=") zoomBy(ZOOM_STEP);
      if (e.key === "-" || e.key === "_") zoomBy(1 / ZOOM_STEP);
      if (e.key === "0") applyZoom(1);
      if (e.key === "r" || e.key === "R") rotate(90);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, applyZoom, zoomBy, rotate]);

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
            <p className="text-sm font-semibold text-blue-900 truncate">{title ?? "확대 보기"}</p>
            {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
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
          <ToolButton label="왼쪽으로 90° 회전" onClick={() => rotate(270)}>
            ↺
          </ToolButton>
          <ToolButton label="오른쪽으로 90° 회전" onClick={() => rotate(90)}>
            ↻
          </ToolButton>
          <span className="text-xs text-slate-400 w-12">{rotation}°</span>

          <span className="w-px h-5 bg-slate-200 mx-1" />

          <ToolButton label="축소" onClick={() => zoomBy(1 / ZOOM_STEP)} disabled={zoom <= 1}>
            −
          </ToolButton>
          <span className="text-xs text-slate-500 tabular-nums w-14 text-center">
            {Math.round(scale * 100)}%
          </span>
          <ToolButton label="확대" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= ZOOM_MAX}>
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
            src={src}
            alt={alt ?? title ?? "확대 이미지"}
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
        </div>
      </div>
    </div>
  );
}

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
