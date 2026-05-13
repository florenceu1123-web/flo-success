import { spawn } from "node:child_process";
import { writeFile, unlink, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * ngspice batch 실행 wrapper.
 *
 *  사용법:
 *   1) deck 텍스트를 임시 파일로 작성
 *   2) `ngspice -b deck.cir` 실행 (-b: batch mode)
 *   3) stdout/stderr 캡처
 *   4) 임시 파일 정리
 *
 *  ngspice 미설치 시 NgspiceNotInstalledError 던짐 — 호출자가 graceful 처리.
 */

export class NgspiceNotInstalledError extends Error {
  constructor() {
    super("ngspice 미설치. https://ngspice.sourceforge.io/download.html 에서 설치하세요.");
    this.name = "NgspiceNotInstalledError";
  }
}

export type NgspiceResult = {
  /** stdout (정상 결과 포함) */
  stdout: string;
  /** stderr (경고·에러) */
  stderr: string;
  /** 종료 코드 */
  exitCode: number;
};

/**
 * ngspice 실행 가능 여부 체크 (PATH에서 찾기).
 */
export async function isNgspiceAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("ngspice", ["--version"], { stdio: ["ignore", "pipe", "pipe"] });
    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

/**
 * SPICE 데크 텍스트를 받아 ngspice 실행.
 *  @param deckText  SPICE 회로 텍스트
 *  @param timeoutMs 최대 실행 시간 (기본 5초)
 */
export async function runNgspice(deckText: string, timeoutMs = 5000): Promise<NgspiceResult> {
  const dir = await mkdtemp(join(tmpdir(), "flo-spice-"));
  const deckPath = join(dir, "deck.cir");
  await writeFile(deckPath, deckText, "utf8");

  return new Promise<NgspiceResult>((resolve, reject) => {
    const child = spawn("ngspice", ["-b", deckPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const t = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.stderr.on("data", (d) => { stderr += d.toString(); });
    child.on("error", (err) => {
      clearTimeout(t);
      void unlink(deckPath).catch(() => {});
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new NgspiceNotInstalledError());
      } else {
        reject(err);
      }
    });
    child.on("exit", (code) => {
      clearTimeout(t);
      void unlink(deckPath).catch(() => {});
      if (timedOut) {
        reject(new Error(`ngspice timed out after ${timeoutMs}ms`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}
