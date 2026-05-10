"use client";

import { InlineMath } from "react-katex";
import "katex/dist/katex.min.css";

type Part =
  | { type: "text"; text: string }
  | { type: "inline"; text: string }
  | { type: "block"; text: string };

/**
 * GPT가 출력한 텍스트에서 LaTeX inline (\\( ... \\)) / block (\\[ ... \\]) 마커를 분리해서
 * KaTeX로 렌더한다. 일반 텍스트는 그대로.
 *
 * 예: "주기는 \\( T = 4 \\)ms이고 ..." → "주기는 [T=4 KaTeX] ms이고 ..."
 */
export function MathText({
  children,
  className,
}: {
  children: string | undefined | null;
  className?: string;
}) {
  if (!children) return null;
  const parts = splitMath(children);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.type === "inline" || p.type === "block") {
          // block math도 InlineMath로 렌더 (BlockMath는 <div>를 만들어 <p> 안에 못 들어감)
          // KaTeX displaystyle 옵션으로 block처럼 크게 표시
          return (
            <InlineMath
              key={i}
              math={p.type === "block" ? `\\displaystyle ${p.text}` : p.text}
            />
          );
        }
        // 일반 텍스트 — \n 보존을 위해 white-space pre-line 처리는 부모에서
        return <span key={i}>{p.text}</span>;
      })}
    </span>
  );
}

function splitMath(s: string): Part[] {
  const parts: Part[] = [];
  // \( ... \) 또는 \[ ... \] (non-greedy)
  const re = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m.index > lastIdx) {
      parts.push({ type: "text", text: s.slice(lastIdx, m.index) });
    }
    if (m[1] !== undefined) {
      parts.push({ type: "inline", text: m[1].trim() });
    } else if (m[2] !== undefined) {
      parts.push({ type: "block", text: m[2].trim() });
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < s.length) {
    parts.push({ type: "text", text: s.slice(lastIdx) });
  }
  return parts;
}
