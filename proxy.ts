import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 접근 게이트 (HTTP Basic 인증)
 *
 * ★ 왜 필요한가 — 이 앱을 터널(Cloudflare)로 휴대폰에 열어 주면 **그 URL을 아는 누구나**
 *   들어올 수 있다. 이 앱은 (1) 사진첩의 사진 1,000여 장을 지울 수 있고
 *   (2) 문제 생성이 OpenAI 크레딧을 쓴다. 둘 다 되돌리기 어렵거나 돈이 나가므로
 *   외부에 노출할 때는 반드시 잠가 둔다.
 *
 * ★ 켜고 끄는 방법 — `.env.local`(git 미추적)에 `APP_PASSWORD`를 넣으면 켜지고,
 *   비워 두면 통째로 통과한다. 즉 **로컬 개발은 지금까지와 똑같고**, 터널을 열 때만 잠긴다.
 *     APP_PASSWORD=...   (필수)
 *     APP_USER=flo       (선택, 기본 flo)
 *
 * ★ Basic 인증을 고른 이유 — 로그인 화면·세션·쿠키 코드가 전혀 없어도 브라우저가
 *   기본 로그인 창을 띄우고 자격증명을 기억한다. 그리고 **페이지·API·이미지까지
 *   전부** 한 번에 막힌다(사진 URL만 알면 새는 일이 없다).
 *
 * ⚠️ Basic 인증은 평문 전송이라 **HTTPS 위에서만** 의미가 있다.
 *   Cloudflare 터널은 https를 주므로 안전하지만, 평문 http로 노출하지 말 것.
 */

const USER = process.env.APP_USER ?? "flo";
const PASSWORD = process.env.APP_PASSWORD ?? "";

/** 길이를 흘리지 않는 문자열 비교 (타이밍 공격 방지). */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf-8");
  const bb = Buffer.from(b, "utf-8");
  // timingSafeEqual은 길이가 다르면 던지므로, 길이 비교를 먼저 하되
  // 같은 길이일 때만 상수시간 비교로 넘긴다.
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const DENY = () =>
  new NextResponse("인증이 필요합니다.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="flo-success", charset="UTF-8"',
      "Cache-Control": "no-store",
    },
  });

export function proxy(req: NextRequest) {
  if (!PASSWORD) return NextResponse.next(); // 비밀번호 미설정 = 게이트 꺼짐(로컬 개발)

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return DENY();

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf-8");
  } catch {
    return DENY();
  }

  // 비밀번호에 ':'가 들어갈 수 있으므로 **첫 번째** 콜론에서만 자른다.
  const sep = decoded.indexOf(":");
  if (sep < 0) return DENY();
  const user = decoded.slice(0, sep);
  const pass = decoded.slice(sep + 1);

  // 두 비교를 모두 실행한다(단락 평가로 어느 쪽이 틀렸는지 흘리지 않게).
  const okUser = safeEqual(user, USER);
  const okPass = safeEqual(pass, PASSWORD);
  return okUser && okPass ? NextResponse.next() : DENY();
}

export const config = {
  /**
   * ★ 정적 파일까지 **전부** 막는다 — 사진은 `/api/notes/image`로 나가고
   *   기출 스샷은 `/api/shots`로 나가므로, 페이지만 막으면 URL을 아는 사람에게 그대로 샌다.
   *   Basic 인증은 한 번 통과하면 브라우저가 같은 오리진의 모든 요청에 자격증명을 붙이므로
   *   전부 막아도 사용에는 지장이 없다.
   */
  matcher: "/:path*",
};
