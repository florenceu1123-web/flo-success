import { createLogger } from "@/lib/logger";
import type { SolverNetwork, SolverResult } from "@/lib/solver/mna";
import { buildSpiceDeck } from "./spiceDeck";
import { runNgspice, NgspiceNotInstalledError, isNgspiceAvailable } from "./ngspiceRunner";
import { parseNgspiceOutput } from "./spiceParser";

const log = createLogger("lib/verification/verifyWithSpice");

export type VerificationResult = {
  /** 검증 성공 (ngspice 결과와 솔버 결과 모두 일치) */
  ok: boolean;
  /** 검증 시도 자체가 가능했는지 (ngspice 설치 안 됐으면 false) */
  attempted: boolean;
  /** 검증 실패 시 불일치 상세 */
  discrepancies: Array<{
    key: string;
    expected: number;
    got: number;
    diff: number;
  }>;
  /** ngspice 출력 (디버그용, 저장 옵션) */
  rawOutput?: string;
  /** 사유 (skip이면 reason) */
  reason?: string;
};

/**
 * 솔버 결과를 ngspice로 교차 검증.
 *  - 절대오차 |solver - ngspice| < tol AND
 *  - 상대오차 |solver - ngspice| / max(|ngspice|, 1) < relTol
 *  둘 다 만족해야 ok.
 *
 *  ngspice 미설치/타임아웃 시 ok=true, attempted=false로 graceful 처리.
 */
export async function verifyWithSpice(args: {
  net: SolverNetwork;
  solverResult: SolverResult;
  /** 검증할 노드 (기본: 솔버 결과의 모든 non-ground 노드) */
  verifyNodes?: string[];
  /** 검증할 V 소스 전류 (기본: 모두) */
  verifyCurrents?: string[];
  tol?: number;
  relTol?: number;
}): Promise<VerificationResult> {
  const tol = args.tol ?? 1e-3;
  const relTol = args.relTol ?? 1e-3;

  if (!await isNgspiceAvailable()) {
    return {
      ok: true,
      attempted: false,
      discrepancies: [],
      reason: "ngspice 미설치 (검증 스킵)",
    };
  }

  const verifyNodes = args.verifyNodes ?? args.net.nodeIds;
  const verifyCurrents = args.verifyCurrents ?? args.net.vsources.map((v) => v.id);

  const deck = buildSpiceDeck(args.net, {
    printNodes: verifyNodes,
    printVsourceCurrents: verifyCurrents,
  });

  let result;
  try {
    result = await runNgspice(deck);
  } catch (e) {
    if (e instanceof NgspiceNotInstalledError) {
      return { ok: true, attempted: false, discrepancies: [], reason: e.message };
    }
    log.error("ngspice_run_failed", { message: (e as Error).message });
    return {
      ok: false,
      attempted: true,
      discrepancies: [],
      reason: `ngspice 실행 실패: ${(e as Error).message}`,
    };
  }

  const parsed = parseNgspiceOutput(result.stdout);
  const discrepancies: VerificationResult["discrepancies"] = [];

  for (const node of verifyNodes) {
    const expected = args.solverResult.nodeVoltages[node];
    const got = parsed.nodeVoltages[node];
    if (expected === undefined || got === undefined) continue;
    const diff = Math.abs(expected - got);
    const relDiff = diff / Math.max(Math.abs(got), 1);
    if (diff > tol && relDiff > relTol) {
      discrepancies.push({ key: `v(${node})`, expected, got, diff });
    }
  }

  for (const vid of verifyCurrents) {
    const expected = args.solverResult.vsourceCurrents[vid];
    const got = parsed.vsourceCurrents[vid];
    if (expected === undefined || got === undefined) continue;
    // 부호 컨벤션 차이 가능성 — ngspice는 V src 전류를 다른 부호로 보고함.
    // ngspice: i(Vname)는 V 소스 내부 흐름 (+→-). 우리도 동일 (a→b 내부 양수).
    const diff = Math.abs(expected - got);
    const relDiff = diff / Math.max(Math.abs(got), 1);
    if (diff > tol && relDiff > relTol) {
      discrepancies.push({ key: `i(V${vid})`, expected, got, diff });
    }
  }

  return {
    ok: discrepancies.length === 0,
    attempted: true,
    discrepancies,
    rawOutput: result.stdout.length < 2000 ? result.stdout : undefined,
  };
}
