/**
 * 스위치 심볼 공용 모듈 — **동작 방향을 화살표로 표시**한다.
 *
 * ★★ 사용자 지정 규칙 (2026-08-12), 스위치를 그리는 **모든 회로에 범용 적용**:
 *   문제에서 스위치가 "열려 있다가 t=0에 **닫히는지**", "닫혀 있다가 t=0에 **열리는지**"에 따라
 *   그림이 달라져야 한다. 정지 그림만으로는 어느 쪽인지 알 수 없어 학생이 문항을 잘못 읽는다.
 *
 *   · action="closing" — **열린 arm**을 그리고, 접점 쪽으로 **닫히는 방향** 곡선 화살표.
 *     (t<0 개방 → t=0 닫힘. 임용 17번처럼 "개방 상태를 유지한 후 닫히는" 형식.)
 *   · action="opening" — **닫힌 arm**(두 단자를 잇는 직선)을 그리고, 접점에서 **떨어지는 방향** 화살표.
 *     (t<0 폐로 → t=0 열림. "닫혀 있다가 t=0에 개방되는" 형식.)
 *   · action 미지정 — 화살표 없이 열린 arm만(동작을 알 수 없을 때). 기존 그림과 동일.
 *
 *   ※ 단자 원(작은 흰 원)은 스위치 접점 표기이지 논리 반전 버블이 아니다 — 디지털 렌더러와
 *     같은 도면에 섞이지 않도록 아날로그 회로에서만 쓴다.
 */

export type SwitchAction = "closing" | "opening" | undefined;

const STROKE = "#111827";
const ARROW = "#1d4ed8";

type Opts = {
  stroke?: string;
  width?: number;
  /** 단자 원 반지름. */
  contactR?: number;
  /** 열린 arm이 접점에서 들리는 각도 느낌 — 세로 방향 변위(px). */
  lift?: number;
};

/**
 * 가로 스위치 — 좌우 단자, arm은 왼쪽 단자에 고정.
 * @param cx 중심 x, @param cy 단자 y, @param half 단자 간 반거리
 */
export function switchH(cx: number, cy: number, half: number, action: SwitchAction, o: Opts = {}): string {
  const stroke = o.stroke ?? STROKE;
  const w = o.width ?? 1.5;
  const r = o.contactR ?? 4;
  const lift = o.lift ?? 24;
  const xl = cx - half, xr = cx + half;

  const contacts =
    `<circle cx="${xl}" cy="${cy}" r="${r}" fill="white" stroke="${stroke}" stroke-width="${w}"/>` +
    `<circle cx="${xr}" cy="${cy}" r="${r}" fill="white" stroke="${stroke}" stroke-width="${w}"/>`;
  const leads =
    `<line x1="${xl - 10}" y1="${cy}" x2="${xl - r}" y2="${cy}" stroke="${stroke}" stroke-width="${w}"/>` +
    `<line x1="${xr + r}" y1="${cy}" x2="${xr + 10}" y2="${cy}" stroke="${stroke}" stroke-width="${w}"/>`;

  if (action === "opening") {
    // 닫힌 arm(직선) + 위로 열리는 화살표
    const arm = `<line x1="${xl + r}" y1="${cy}" x2="${xr - r}" y2="${cy}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
    // 닫힌 arm 위에서 위로 떨어지는 화살표
    //   ★ x를 오른쪽으로 밀어 스위치 이름 라벨(중앙 상단)과 겹치지 않게 한다.
    return contacts + leads + arm + actionArrow(cx + half * 0.8, cy - 5, cy - lift + 6, "opening");
  }
  // 기본: 열린 arm (좌측 단자에서 우상향)
  const arm = `<line x1="${xl + r}" y1="${cy - 1}" x2="${xr - r}" y2="${cy - lift}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
  if (action === "closing") {
    // arm이 접점으로 내려앉는 방향
    // arm 자유단(우측 접점 바로 위)에서 접점으로 내려앉는 화살표
    return contacts + leads + arm + actionArrow(xr - r, cy - lift + 2, cy - r - 4, "closing");
  }
  return contacts + leads + arm;
}

/**
 * 세로 스위치 — 상하 단자, arm은 위쪽 단자에 고정.
 * @param cx 단자 x, @param cy 중심 y, @param half 단자 간 반거리
 */
export function switchV(cx: number, cy: number, half: number, action: SwitchAction, o: Opts = {}): string {
  const stroke = o.stroke ?? STROKE;
  const w = o.width ?? 1.5;
  const r = o.contactR ?? 4;
  const lift = o.lift ?? 22;
  const yt = cy - half, yb = cy + half;

  const contacts =
    `<circle cx="${cx}" cy="${yt}" r="${r}" fill="white" stroke="${stroke}" stroke-width="${w}"/>` +
    `<circle cx="${cx}" cy="${yb}" r="${r}" fill="white" stroke="${stroke}" stroke-width="${w}"/>`;
  const leads =
    `<line x1="${cx}" y1="${yt - 10}" x2="${cx}" y2="${yt - r}" stroke="${stroke}" stroke-width="${w}"/>` +
    `<line x1="${cx}" y1="${yb + r}" x2="${cx}" y2="${yb + 10}" stroke="${stroke}" stroke-width="${w}"/>`;

  if (action === "opening") {
    const arm = `<line x1="${cx}" y1="${yt + r}" x2="${cx}" y2="${yb - r}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
    return contacts + leads + arm + actionArrow(cx + 17, cy + half * 0.45, cy - half * 0.65, "opening");
  }
  const arm = `<line x1="${cx + 1}" y1="${yt + r}" x2="${cx + lift}" y2="${yb - r}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
  if (action === "closing") {
    return contacts + leads + arm + actionArrow(cx + lift, cy - half * 0.1, cy + half - 3, "closing");
  }
  return contacts + leads + arm;
}

/**
 * 동작 방향 화살표 — ★ **닫힘은 아래(↓), 열림은 위(↑)** (사용자 지정 규칙 2026-08-12).
 *   가로·세로 스위치 모두 같은 규칙으로, 스위치 옆에 **곧은 세로 화살표**로 그린다.
 *   (처음엔 arm을 따라 도는 곡선 화살표였는데 "SW₁이 열리는 그림처럼 보인다"는 신고가 났다 —
 *    곡선은 방향이 한눈에 안 읽힌다.)
 */
function actionArrow(x: number, yTop: number, yBot: number, action: "closing" | "opening"): string {
  const s = 7;
  const down = action === "closing";
  const h = Math.max(24, yBot - yTop);
  const tipY = down ? yBot : yTop;
  const tailY = down ? yTop : yBot;
  // ★ 막대(shaft)는 **휘어진 곡선**, 화살촉은 **곧게 아래(닫힘)/위(열림)** 를 향한다.
  //   끝점 바로 앞 제어점을 촉과 같은 x에 두어 **수직으로 접근**하게 만든다(방향이 또렷해진다).
  // 교과서 표기 그대로 — **arm의 자유단에 붙은 짧은 직선 화살표**.
  //   닫힘이면 접점 쪽으로 ↓, 열림이면 접점에서 멀어지는 ↑.
  void h;
  const shaftEnd = down ? tipY - s * 1.3 : tipY + s * 1.3;
  const shaft = `<line x1="${x}" y1="${tailY}" x2="${x}" y2="${shaftEnd}" stroke="${ARROW}" stroke-width="2.2" stroke-linecap="round"/>`;
  const head = down
    ? `<polygon points="${x},${tipY} ${x - s * 0.72},${tipY - s * 1.3} ${x + s * 0.72},${tipY - s * 1.3}" fill="${ARROW}"/>`
    : `<polygon points="${x},${tipY} ${x - s * 0.72},${tipY + s * 1.3} ${x + s * 0.72},${tipY + s * 1.3}" fill="${ARROW}"/>`;
  return shaft + head;
}
