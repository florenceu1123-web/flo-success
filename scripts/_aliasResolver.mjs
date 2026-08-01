// Node 로더 훅 — tsconfig의 "@/*" 경로 별칭을 프로젝트 루트로 해석한다.
//   lib/의 모듈을 dev 서버 없이 직접 임포트하는 스모크 스크립트용.
//   사용: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/<script>.mjs
import { pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

/** 확장자 없는 경로에 붙여볼 후보들 (TS 소스는 확장자 생략이 관례). */
const withExtensions = (p) => [p, `${p}.ts`, `${p}.tsx`, `${p}/index.ts`, `${p}/index.tsx`];

export async function resolve(specifier, context, nextResolve) {
  const hasExt = /\.[cm]?[jt]sx?$/.test(specifier);
  let candidates;
  if (specifier.startsWith("@/")) {
    // 별칭 → 프로젝트 루트 기준 절대 경로
    const base = resolvePath(ROOT, specifier.slice(2));
    candidates = (hasExt ? [base] : withExtensions(base)).map((p) => pathToFileURL(p).href);
  } else if (/^\.{1,2}\//.test(specifier) && !hasExt) {
    // 확장자 없는 상대 경로 (./_helpers 등)
    candidates = withExtensions(specifier);
  } else {
    return nextResolve(specifier, context);
  }
  let lastError;
  for (const cand of candidates) {
    try {
      return await nextResolve(cand, context);
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}
