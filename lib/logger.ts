/**
 * 경량 logger — 환경별로 콘솔 동작을 통일·태깅한다.
 * CLAUDE.md 규칙: console.log 대신 본 모듈 사용.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const ENV_LEVEL = (process.env.LOG_LEVEL as Level | undefined) ?? "info";
const MIN = LEVEL_ORDER[ENV_LEVEL] ?? LEVEL_ORDER.info;

function emit(level: Level, scope: string, args: unknown[]): void {
  if (LEVEL_ORDER[level] < MIN) return;
  const ts = new Date().toISOString().slice(11, 23);
  const tag = `[${ts}] [${level.toUpperCase()}] [${scope}]`;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  // 진단을 위해 object args를 stringify (Next.js dev 로그가 객체를 안 직렬화하는 케이스 대응).
  const formatted = args.map((a) => (a && typeof a === "object" ? JSON.stringify(a) : a));
  fn(tag, ...formatted);
}

/**
 * scope를 묶어 사용하는 logger 인스턴스 생성.
 * @example const log = createLogger("api/analyze");
 */
export function createLogger(scope: string) {
  return {
    debug: (...a: unknown[]) => emit("debug", scope, a),
    info: (...a: unknown[]) => emit("info", scope, a),
    warn: (...a: unknown[]) => emit("warn", scope, a),
    error: (...a: unknown[]) => emit("error", scope, a),
  };
}
