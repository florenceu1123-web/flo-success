import { promises as fs } from "node:fs";
import path from "node:path";
import { createLogger } from "@/lib/logger";

const log = createLogger("solutionStore");

/** 사용자가 문제별로 저장한 풀이·정답 사진 + 오답 메모 1건. */
export type SavedSolution = {
  /** 풀이·정답 사진 (data URL, 예: "data:image/png;base64,..."). 없으면 빈 문자열. */
  imageData: string;
  /** 업로드한 파일명 (표시용). */
  imageName: string;
  /** 실수·틀린 부분을 적는 오답 메모. */
  memo: string;
  /**
   * ★ 이 본문(원본 문제)으로 **생성했던 문제**들의 스샷 보관함.
   *   생성 결과를 캡처해 모아 두면 같은 본문을 다시 올렸을 때 그대로 다시 뜬다.
   *   기존 레코드에는 없는 필드라 optional — 읽을 때 항상 `?? []` 로 다룬다.
   */
  generated?: SavedGeneratedShot[];
  savedAt: number;
};

/** 보관함에 담긴 생성 문제 스샷 1장. */
export type SavedGeneratedShot = {
  /** 스샷 (data URL). */
  imageData: string;
  imageName: string;
  /** 구분용 메모(선택) — "유사 3번", "변형 — 테브난" 처럼. */
  label?: string;
  addedAt: number;
};

/** imageKey → SavedSolution 맵 (파일 1개에 통째로 보관). */
type SolutionMap = Record<string, SavedSolution>;

// 프로젝트 루트의 data/original-solutions.json 에 영구 저장.
const DATA_DIR = path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "original-solutions.json");

// 동시 쓰기로 인한 파일 손상 방지 — 프로세스 내 직렬화 큐.
let writeChain: Promise<unknown> = Promise.resolve();

/** 저장 파일 전체를 읽어 맵으로 반환 (없으면 빈 맵). */
async function readMap(): Promise<SolutionMap> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") return parsed as SolutionMap;
    return {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    log.warn("저장 파일 읽기 실패 — 빈 맵으로 처리", { error: String(e) });
    return {};
  }
}

/** 맵 전체를 파일에 원자적으로 기록 (tmp 파일 → rename). */
async function writeMap(map: SolutionMap): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(map, null, 2), "utf-8");
  await fs.rename(tmp, STORE_PATH);
}

/** 쓰기 작업을 직렬 큐에 태워 실행 (read-modify-write 원자성 보장). */
function enqueueWrite<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  // 체인이 reject로 끊기지 않게 swallow (결과는 next로 전달).
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

/** 특정 imageKey의 저장 풀이 조회 (없으면 null). */
export async function getSolution(key: string): Promise<SavedSolution | null> {
  const map = await readMap();
  return map[key] ?? null;
}

/** 특정 imageKey에 풀이 사진 + 오답 메모 저장 (덮어쓰기). 저장된 레코드를 반환. */
export async function putSolution(
  key: string,
  data: { imageData: string; imageName: string; memo: string; generated?: SavedGeneratedShot[] },
): Promise<SavedSolution> {
  return enqueueWrite(async () => {
    const map = await readMap();
    const record: SavedSolution = {
      imageData: data.imageData,
      imageName: data.imageName,
      memo: data.memo,
      // ★ generated를 안 보내면 **기존 보관함을 그대로 유지**한다(풀이만 저장할 때 사라지지 않게).
      generated: data.generated ?? map[key]?.generated ?? [],
      savedAt: Date.now(),
    };
    map[key] = record;
    await writeMap(map);
    log.info("풀이 사진·메모 저장", {
      key,
      imageName: data.imageName,
      bytes: data.imageData.length,
      memoLen: data.memo.length,
    });
    return record;
  });
}

/** 특정 imageKey의 저장 풀이 삭제. */
export async function deleteSolution(key: string): Promise<void> {
  return enqueueWrite(async () => {
    const map = await readMap();
    if (key in map) {
      delete map[key];
      await writeMap(map);
      log.info("풀이 삭제", { key });
    }
  });
}
