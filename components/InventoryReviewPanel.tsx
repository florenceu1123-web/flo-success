"use client";

import { useState } from "react";
import type { AnalysisResult, SubjectKey } from "@/types";

/** 검수·편집 게이트의 편집 가능한 소자 행. */
type Row = {
  id: string;
  type: string;
  value: string;
  pin1: string;
  pin2: string;
};

/** type 드롭다운 옵션 — extractComponentInventory의 ALLOWED_TYPES와 동일 목록. */
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "R", label: "저항 (R)" },
  { value: "V", label: "전압원 (V)" },
  { value: "I", label: "전류원 (I)" },
  { value: "C", label: "커패시터 (C)" },
  { value: "L", label: "인덕터 (L)" },
  { value: "SW", label: "스위치 (SW)" },
  { value: "D", label: "다이오드 (D)" },
  { value: "OPAMP", label: "OPAMP" },
  { value: "BJT", label: "BJT" },
  { value: "MOSFET", label: "MOSFET" },
  { value: "VCVS", label: "종속 전압원 (VCVS)" },
  { value: "VCCS", label: "종속 전류원 (VCCS)" },
  { value: "CCVS", label: "종속 전압원 (CCVS)" },
  { value: "CCCS", label: "종속 전류원 (CCCS)" },
];

type Props = {
  analysis: AnalysisResult | null;
  subject: SubjectKey | null;
  /** 생성 진행 중에는 편집·적용 비활성 */
  disabled: boolean;
  /** /api/recover-topology 응답(업데이트된 analysis)을 부모 state에 반영 */
  onApplied: (updated: AnalysisResult) => void;
};

function toRows(inventory: AnalysisResult["componentInventory"]): Row[] {
  return (inventory ?? []).map((c) => ({
    id: c.id,
    type: c.type.toUpperCase(),
    value: c.value ?? "",
    pin1: c.pins?.[0] ?? "",
    pin2: c.pins?.[1] ?? "",
  }));
}

function rowsToInventory(rows: Row[]): NonNullable<AnalysisResult["componentInventory"]> {
  return rows.map((r) => ({
    id: r.id.trim(),
    type: r.type,
    ...(r.value.trim() ? { value: r.value.trim() } : {}),
    ...(r.pin1.trim() && r.pin2.trim() ? { pins: [r.pin1.trim(), r.pin2.trim()] } : {}),
  }));
}

/**
 * 검수·편집 게이트 — Vision이 추출한 회로 소자(inventory)를 사용자가 확인·보정하는 패널.
 *
 * Vision은 type·구조는 잘 잡지만 값(크기·저항값)을 오독하거나 소자를 누락할 수 있다.
 * 사용자가 원본 그림과 대조해 보정 → "수정 적용"으로 topology·분류를 결정론 재계산 →
 * 이후 "문제 생성하기"는 보정된 analysis를 사용.
 */
export default function InventoryReviewPanel({ analysis, subject, disabled, onApplied }: Props) {
  const sourceInventory = analysis?.componentInventory;
  const [rows, setRows] = useState<Row[]>(() => toRows(sourceInventory));
  const [trackedSource, setTrackedSource] = useState(sourceInventory);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // 새 분석 결과가 오면(이미지 재업로드·재계산 반영) 편집 행을 그 inventory로 리셋.
  if (sourceInventory !== trackedSource) {
    setTrackedSource(sourceInventory);
    setRows(toRows(sourceInventory));
    setApplyError(null);
  }

  if (!analysis || !sourceInventory || sourceInventory.length === 0) return null;

  const validation = analysis.graphValidation;
  const recovery = analysis.topologyRecovery;
  const confidence = validation?.confidence;
  const hasIssues =
    (validation && (!validation.ok || validation.errors.length > 0)) ||
    (typeof confidence === "number" && confidence < 0.7);

  const dirty = JSON.stringify(rowsToInventory(rows)) !== JSON.stringify(
    rowsToInventory(toRows(sourceInventory)),
  );
  const allRowsValid = rows.length > 0 && rows.every((r) => r.id.trim() && r.type);

  const updateRow = (idx: number, patch: Partial<Row>) => {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeRow = (idx: number) => {
    setRows((rs) => rs.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    setRows((rs) => [
      ...rs,
      { id: `R${rs.length + 1}`, type: "R", value: "", pin1: "", pin2: "" },
    ]);
  };
  const resetRows = () => {
    setRows(toRows(sourceInventory));
    setApplyError(null);
  };

  const applyEdits = async () => {
    if (!subject) return;
    setIsApplying(true);
    setApplyError(null);
    try {
      const res = await fetch("/api/recover-topology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inventory: rowsToInventory(rows),
          analysis,
          subject,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      onApplied(data as AnalysisResult);
    } catch (e) {
      setApplyError((e as Error).message);
    } finally {
      setIsApplying(false);
    }
  };

  const accentBorder = hasIssues ? "border-amber-200" : "border-blue-100";
  const accentBg = hasIssues ? "bg-amber-50/60" : "bg-white";

  return (
    <section className={`rounded-2xl border ${accentBorder} ${accentBg} p-6 shadow-sm space-y-4`}>
      {/* 헤더 + 신뢰도 배지 */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
            회로 소자 검수·편집
            {typeof confidence === "number" && (
              <span
                className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${
                  hasIssues
                    ? "text-amber-700 bg-amber-100"
                    : "text-blue-600 bg-blue-50"
                }`}
              >
                그래프 신뢰도 {Math.round(confidence * 100)}%
              </span>
            )}
            {recovery && (
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                {recovery.strategy}
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Vision이 추출한 소자입니다. 원본 그림과 대조해 <b>값·종류·연결</b>을 보정한 뒤 적용하세요.
            보정된 소자로 회로 구조가 다시 계산됩니다.
          </p>
        </div>
      </header>

      {/* 검증 경고 */}
      {validation && (validation.errors.length > 0 || validation.warnings.length > 0) && (
        <ul className="text-[11px] space-y-0.5">
          {validation.errors.map((m, i) => (
            <li key={`e${i}`} className="text-red-600 flex gap-1">
              <span className="shrink-0">⛔</span>
              {m}
            </li>
          ))}
          {validation.warnings.map((m, i) => (
            <li key={`w${i}`} className="text-amber-600 flex gap-1">
              <span className="shrink-0">⚠</span>
              {m}
            </li>
          ))}
        </ul>
      )}

      {/* 소자 편집 표 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-slate-400 uppercase tracking-wide">
              <th className="text-left font-medium pb-2 pr-2">라벨</th>
              <th className="text-left font-medium pb-2 pr-2">종류</th>
              <th className="text-left font-medium pb-2 pr-2">값</th>
              <th className="text-left font-medium pb-2 pr-2" colSpan={2}>
                연결 노드 (양 끝)
              </th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="align-top">
            {rows.map((row, i) => (
              <tr key={i} className="border-t border-slate-100">
                <td className="py-1.5 pr-2">
                  <input
                    type="text"
                    value={row.id}
                    onChange={(e) => updateRow(i, { id: e.target.value })}
                    disabled={disabled || isApplying}
                    className="w-20 px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50"
                    placeholder="V1"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <select
                    value={row.type}
                    onChange={(e) => updateRow(i, { type: e.target.value })}
                    disabled={disabled || isApplying}
                    className="px-2 py-1.5 rounded-md border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50"
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                    {!TYPE_OPTIONS.some((o) => o.value === row.type) && (
                      <option value={row.type}>{row.type}</option>
                    )}
                  </select>
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="text"
                    value={row.value}
                    onChange={(e) => updateRow(i, { value: e.target.value })}
                    disabled={disabled || isApplying}
                    className="w-28 px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50"
                    placeholder="예: 9∠90°V, -j3Ω"
                  />
                </td>
                <td className="py-1.5 pr-1">
                  <input
                    type="text"
                    value={row.pin1}
                    onChange={(e) => updateRow(i, { pin1: e.target.value })}
                    disabled={disabled || isApplying}
                    className="w-16 px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50"
                    placeholder="n1"
                  />
                </td>
                <td className="py-1.5 pr-2">
                  <input
                    type="text"
                    value={row.pin2}
                    onChange={(e) => updateRow(i, { pin2: e.target.value })}
                    disabled={disabled || isApplying}
                    className="w-16 px-2 py-1.5 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:bg-slate-50"
                    placeholder="GND"
                  />
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={disabled || isApplying}
                    className="px-2 py-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 text-sm transition disabled:opacity-40"
                    aria-label={`${row.id} 삭제`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 행 추가 */}
      <button
        type="button"
        onClick={addRow}
        disabled={disabled || isApplying}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-40"
      >
        + 소자 추가
      </button>

      {applyError && (
        <p className="text-xs text-red-600">적용 실패: {applyError}</p>
      )}

      {/* 액션 */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={applyEdits}
          disabled={disabled || isApplying || !dirty || !allRowsValid || !subject}
          className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-semibold text-sm transition-all shadow-sm disabled:cursor-not-allowed disabled:shadow-none"
        >
          {isApplying ? "회로 구조 재계산 중..." : "수정 적용 (회로 구조 재계산)"}
        </button>
        <button
          type="button"
          onClick={resetRows}
          disabled={disabled || isApplying || !dirty}
          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-sm hover:bg-slate-50 transition disabled:opacity-40"
        >
          되돌리기
        </button>
      </div>
      {!dirty && (
        <p className="text-[11px] text-slate-400">
          수정 사항이 없으면 추출된 소자 그대로 문제가 생성됩니다.
        </p>
      )}
    </section>
  );
}
