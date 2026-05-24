import { spawn } from "node:child_process";
import { writeFile, readFile, unlink, mkdtemp } from "node:fs/promises";
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
 * Windows ngspice는 GUI 버전과 console 버전(ngspice_con.exe)이 별도 binary.
 *   GUI는 batch 모드에서도 fatal error 시 dialog 팝업 → 자동화 시 막힘.
 *   console 버전을 우선 사용하고 없으면 일반 ngspice fallback.
 */
const NGSPICE_BIN = process.platform === "win32" ? "ngspice_con" : "ngspice";

/**
 * ngspice 실행 가능 여부 체크 (PATH에서 찾기).
 *  Windows ngspice는 --version에 반응 안 함 → 빈 deck 한 줄을 batch로 던져 ENOENT만 본다.
 */
export async function isNgspiceAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    // 첫 줄이 .end만 있는 최소 deck. ngspice는 무시하고 exit하지만 ENOENT는 아님.
    const child = spawn(NGSPICE_BIN, ["-b"], { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", () => resolve(false));
    child.on("exit", () => resolve(true));
    child.stdin.write(".title probe\n.end\nquit\n");
    child.stdin.end();
  });
}

/**
 * SPICE 데크 텍스트를 받아 ngspice 실행.
 *  @param deckText  SPICE 회로 텍스트
 *  @param timeoutMs 최대 실행 시간 (기본 5초)
 *
 *  Windows ngspice는 batch mode(-b)에서 stdout으로 안 쓰고 -o 파일에만 출력 →
 *  `-o tempfile`로 logfile 강제 후 종료 시 읽어서 stdout 자리에 반환.
 */
export async function runNgspice(deckText: string, timeoutMs = 5000): Promise<NgspiceResult> {
  const dir = await mkdtemp(join(tmpdir(), "flo-spice-"));
  const deckPath = join(dir, "deck.cir");
  const logPath = join(dir, "deck.log");
  await writeFile(deckPath, deckText, "utf8");

  return new Promise<NgspiceResult>((resolve, reject) => {
    const child = spawn(NGSPICE_BIN, ["-b", "-o", logPath, deckPath], {
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
      void unlink(logPath).catch(() => {});
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new NgspiceNotInstalledError());
      } else {
        reject(err);
      }
    });
    child.on("exit", async (code) => {
      clearTimeout(t);
      if (timedOut) {
        void unlink(deckPath).catch(() => {});
        void unlink(logPath).catch(() => {});
        reject(new Error(`ngspice timed out after ${timeoutMs}ms`));
        return;
      }
      // Windows ngspice는 log file에 결과 기록. stdout이 비었으면 log 파일에서 읽어서 채움.
      if (!stdout.trim()) {
        try {
          stdout = await readFile(logPath, "utf8");
        } catch {
          // log 파일 없으면 stdout 그대로 (빈 문자열).
        }
      }
      void unlink(deckPath).catch(() => {});
      void unlink(logPath).catch(() => {});
      resolve({ stdout, stderr, exitCode: code ?? -1 });
    });
  });
}
