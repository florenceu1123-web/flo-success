/**
 * 문제 이미지의 **안정 키** — 오답 메모지(풀이·정답 사진 + 메모)를 붙여 두는 단위.
 *
 * ★ 왜 파일명이 아니라 **내용 해시**인가 —
 *   같은 기출이 (1) 바탕화면 `전공 스샷` 폴더 (2) 사진첩 `전공스샷` 앨범 (3) 사용자가
 *   직접 고른 파일, 세 경로로 들어온다. 경로·파일명은 제각각이지만 **바이트가 같으면
 *   같은 문제**다. 내용 해시로 잡으면 어느 화면에서 열든 같은 메모지가 뜬다.
 *   (실측: 저장된 메모 160건이 전부 바탕화면 스샷 264장 중 160장과 일치했다.)
 *
 * ★ 알고리즘을 바꾸지 말 것 — djb2. 이미 저장된 기록의 키가 이 함수로 계산돼 있어서
 *   바꾸는 순간 사용자가 적어 둔 메모가 전부 "없는 문제"가 된다.
 */

/**
 * data URL이면 base64 본문만 떼어 낸다.
 *
 * ⚠️ 경로마다 넘겨주는 모양이 달랐다(실측 버그) — ImageUploader는 `iVBORw0...`(순수 base64),
 *   랜덤문제 패널은 `data:image/png;base64,iVBORw0...`(data URL 전체). 같은 사진인데
 *   키가 갈려 메모가 공유되지 않았다. **키를 만들기 전에 반드시 이 함수를 통과시킨다.**
 */
export function normalizeImageBase64(value: string | null | undefined): string {
  const s = String(value ?? "");
  if (!s) return "";
  const comma = s.indexOf(",");
  return s.startsWith("data:") && comma >= 0 ? s.slice(comma + 1) : s;
}

/**
 * base64(또는 data URL) → `img<base36>` 형태의 안정 키. 빈 입력이면 null.
 * djb2 해시 — 원래 app/page.tsx 안에 있던 계산을 그대로 옮긴 것이라 기존 키와 호환된다.
 */
export function imageKeyOf(value: string | null | undefined): string | null {
  const base64 = normalizeImageBase64(value);
  if (!base64) return null;
  let h = 5381;
  for (let i = 0; i < base64.length; i += 1) h = ((h << 5) + h + base64.charCodeAt(i)) | 0;
  return `img${(h >>> 0).toString(36)}`;
}

/**
 * 이미지 URL을 받아 그 내용으로 키를 만든다 (랜덤문제 풀기처럼 화면에 URL만 있는 경우).
 * 브라우저가 이미 그 이미지를 그렸다면 대개 캐시에서 바로 나온다.
 */
export async function imageKeyFromUrl(url: string, signal?: AbortSignal): Promise<string | null> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const dataUrl = await new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(new Error("이미지를 읽지 못했습니다."));
    r.readAsDataURL(blob);
  });
  return imageKeyOf(dataUrl);
}
