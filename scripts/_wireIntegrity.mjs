// 논리회로 SVG **배선 무결성** 검사 — 겹침·끊김을 프로그램으로 잡는다.
//
// ★ 왜 필요한가 (2026-08-13): logicNetworkRenderer의 라우팅을 고칠 때마다 다른 곳이 깨졌는데,
//   기존 스모크는 **배선 연결성을 전혀 검사하지 않아** 끊긴 선이 그대로 통과했다(사용자가 눈으로 발견).
//   라우터를 손대기 전에 이 검사부터 붙인다.
//
// 검사 항목
//   ① 끊김(floating) — 선분의 끝점이 다른 선분·소자 박스·접점(dot) 어디에도 닿지 않음
//   ② 겹침(overlap)  — 같은 높이(또는 같은 x)의 두 선분이 구간을 공유해 한 선처럼 보임
//   ③ 관통(through)  — 배선이 소자 박스 내부를 가로지름 (규칙 #1)

const TOL = 3;        // 좌표 일치 허용 오차
const OVERLAP_MIN = 8; // 이 길이 이상 겹치면 "겹침"으로 본다

/** SVG에서 선분·박스·접점을 뽑는다. */
export function parseSvgGeometry(svg) {
  const segs = [];
  for (const m of svg.matchAll(/<(?:path|line)[^>]*\sd="M ([\d.-]+) ([\d.-]+)((?: L [\d.-]+ [\d.-]+)+)"/g)) {
    let x = +m[1], y = +m[2];
    for (const p of m[3].matchAll(/L ([\d.-]+) ([\d.-]+)/g)) {
      const nx = +p[1], ny = +p[2];
      if (Math.abs(nx - x) > 0.5 || Math.abs(ny - y) > 0.5) segs.push({ x1: x, y1: y, x2: nx, y2: ny });
      x = nx; y = ny;
    }
  }
  for (const m of svg.matchAll(/<line x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)) {
    segs.push({ x1: +m[1], y1: +m[2], x2: +m[3], y2: +m[4] });
  }
  const boxes = [...svg.matchAll(/<rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.-]+)" height="([\d.-]+)"([^>]*)>/g)]
    .filter((m) => !/stroke-dasharray/.test(m[5]))   // 점선 영역 박스는 소자가 아니다
    .map((m) => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
  // ★ 반전 버블(NOT·NAND·NOR·XNOR)은 원으로 그려지고 배선은 **그 원의 바깥 접점**에서 시작한다.
  //   중심만 보면 stub 끝이 "끊김"으로 오탐된다 — 반지름까지 읽어 원주 위 점도 접속으로 인정한다.
  const dots = [...svg.matchAll(/<circle cx="([\d.-]+)" cy="([\d.-]+)" r="([\d.-]+)"/g)]
    .map((m) => ({ x: +m[1], y: +m[2], r: +m[3] }));
  // ★ 게이트 몸통(NOT 삼각형·AND/OR/XOR 곡선·MUX 사다리꼴)은 path로 그려진다.
  //   **배선은 fill="none", 게이트 몸통은 fill="white"** 이므로 그것으로 정확히 가른다.
  //   (예전엔 곡선(C/Q)이 있는 path만 잡아 NOT 삼각형을 놓쳤고, 그 핀 stub이 전부 "끊김"으로 오탐됐다.)
  for (const m of svg.matchAll(/<path d="([^"]+)"[^>]*fill="white"/g)) {
    const nums = [...m[1].matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((n) => [+n[1], +n[2]]);
    if (nums.length < 3) continue;
    const xs = nums.map((n) => n[0]), ys = nums.map((n) => n[1]);
    boxes.push({ x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }
  return { segs, boxes, dots };
}

const isH = (s) => Math.abs(s.y1 - s.y2) < 0.6;
const isV = (s) => Math.abs(s.x1 - s.x2) < 0.6;
const near = (a, b) => Math.abs(a - b) <= TOL;
const between = (v, a, b) => v >= Math.min(a, b) - TOL && v <= Math.max(a, b) + TOL;

/** 점이 선분 위(끝점 포함)에 있는가. */
function pointOnSeg(px, py, s) {
  if (isH(s)) return near(py, s.y1) && between(px, s.x1, s.x2);
  if (isV(s)) return near(px, s.x1) && between(py, s.y1, s.y2);
  return near(px, s.x1) && near(py, s.y1);
}

/** 점이 소자 박스 테두리에 닿는가 (핀 접속). */
function pointOnBox(px, py, b) {
  const inX = px >= b.x - TOL && px <= b.x + b.w + TOL;
  const inY = py >= b.y - TOL && py <= b.y + b.h + TOL;
  return inX && inY;   // 박스 내부·테두리면 접속으로 인정(핀은 테두리에 붙는다)
}

/** 두 선분이 같은 축에서 구간을 공유하는가. */
function overlapLen(a, b) {
  if (isH(a) && isH(b) && near(a.y1, b.y1)) {
    const lo = Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2));
    const hi = Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2));
    return hi - lo;
  }
  if (isV(a) && isV(b) && near(a.x1, b.x1)) {
    const lo = Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2));
    const hi = Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2));
    return hi - lo;
  }
  return -1;
}

/**
 * 배선 무결성 검사.
 * @returns { floating: [...], overlaps: [...], through: [...] }
 */
export function checkWireIntegrity(svg) {
  const { segs, boxes, dots } = parseSvgGeometry(svg);
  const floating = [];
  const overlaps = [];
  const through = [];

  segs.forEach((s, i) => {
    for (const [px, py] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      const touchesSeg = segs.some((o, j) => j !== i && pointOnSeg(px, py, o));
      const touchesBox = boxes.some((b) => pointOnBox(px, py, b));
      // 접점 dot(중심 일치) 또는 버블 원주 위(중심에서 반지름만큼 떨어진 점)면 접속으로 본다.
      const touchesDot = dots.some((d) => {
        const dist = Math.hypot(d.x - px, d.y - py);
        return dist <= TOL || Math.abs(dist - (d.r ?? 0)) <= TOL;
      });
      if (!touchesSeg && !touchesBox && !touchesDot) {
        floating.push({ x: px, y: py, seg: `(${s.x1},${s.y1})-(${s.x2},${s.y2})` });
      }
    }
  });

  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const len = overlapLen(segs[i], segs[j]);
      if (len >= OVERLAP_MIN) {
        overlaps.push({ len: Math.round(len), a: `(${segs[i].x1},${segs[i].y1})-(${segs[i].x2},${segs[i].y2})`, b: `(${segs[j].x1},${segs[j].y1})-(${segs[j].x2},${segs[j].y2})` });
      }
    }
  }

  // 관통 — 선분이 박스 내부를 **가로질러** 지나감(양쪽 끝이 박스 밖).
  for (const s of segs) {
    for (const b of boxes) {
      const pad = 3;
      if (isH(s) && s.y1 > b.y + pad && s.y1 < b.y + b.h - pad) {
        const lo = Math.min(s.x1, s.x2), hi = Math.max(s.x1, s.x2);
        if (lo < b.x - pad && hi > b.x + b.w + pad) through.push({ seg: `(${s.x1},${s.y1})-(${s.x2},${s.y2})`, box: `${b.x},${b.y}` });
      }
      if (isV(s) && s.x1 > b.x + pad && s.x1 < b.x + b.w - pad) {
        const lo = Math.min(s.y1, s.y2), hi = Math.max(s.y1, s.y2);
        if (lo < b.y - pad && hi > b.y + b.h + pad) through.push({ seg: `(${s.x1},${s.y1})-(${s.x2},${s.y2})`, box: `${b.x},${b.y}` });
      }
    }
  }

  return { floating, overlaps, through };
}
