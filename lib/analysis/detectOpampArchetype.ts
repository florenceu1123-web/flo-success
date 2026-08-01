// src/lib/analysis/detectOpampArchetype.ts
//
// OPAMP 회로의 archetype을 구조·키워드 점수로 판정.
// 키워드 감지 ❌ / 구조 기반 archetype scoring ✅ (β(s)·Barkhausen 텍스트 없이도 잡아야 함).
//
// 정책: archetype 불확실(uncertain) — 어떤 archetype도 충분히 점수 못 받음 → null 반환.
//        호출부에서 throw 처리 (free OPAMP generation 금지).

import type { AnalogArchetype } from "@/lib/analog/archetypeRegistry";
import { selectOpampCandidate } from "@/lib/analysis/candidateGraphs";

/**
 * 분석 결과를 받아 OPAMP archetype 판정. 결정 임계 미달 시 null.
 *
 *   scoring rule:
 *     wien:
 *       RC 회로망(+2) · 피드백(+2) · 발진(+3) · 루프(+2) · 조건/특성방정식(+1) · β/Barkhausen(+3)
 *       총합 ≥ 4 → WIEN_BRIDGE_OSCILLATOR (β/Barkhausen 키워드 없어도 구조만으로 매칭 가능)
 *     inverting:    "반전"·"inverting" (+3)
 *     nonInverting: "비반전"·"non-inverting" (+3)
 *     follower:     "팔로워"·"voltage follower"·"buffer" (+3)
 *
 *   wien score가 4 미만이면 top score archetype을 선택하되 ≥3 미달이면 null (uncertain).
 *
 *   ★ scoring 대상은 analysis 전체 JSON + 외부 텍스트(문제 본문·해석 절차) 모두 포함.
 *     interpretation 단일 필드만 보면 GPT가 단어를 다르게 적었을 때 놓침.
 */
export function detectOpampArchetype(
  analysis: unknown,
  extraText: readonly string[] = [],
): AnalogArchetype | null {
  // 전체 JSON + 외부 텍스트 합쳐서 한 덩어리로 lowercase 검색.
  const jsonText = JSON.stringify(analysis ?? {});
  const text = [jsonText, ...extraText].join(" ").toLowerCase();

  // ★ 차동/차이 증폭기(차동모드·공통모드 이득) — 반전/비반전/Wien 같은 고정 archetype이 아니다.
  //   키워드 scoring이 "되먹임/반전 입력"을 wien·inverting으로 오매치하므로, 차동 신호가 있으면
  //   null 반환 → 호출부가 generic MNA 경로(opamp_generic)로 보낸다 (규칙 기반 풀이).
  if (/차동|차이\s*증폭|differential|공통\s*모드|common[\s-]*mode/.test(text)) {
    return null;
  }

  // ★ Wien Bridge inventory 시그니처 검사 — R=4·C=2·OPAMP=1 (정확한 Wien Bridge layout)
  //   임용 9번(R=2·C=2·OPAMP=1 같은 변형 발진기)이 Wien Bridge로 잘못 잡히는 케이스 방지.
  const inv = (analysis as { componentInventory?: Array<{ type?: string }> })?.componentInventory ?? [];
  const countType = (t: string) => inv.filter((c) => (c.type ?? "").toUpperCase() === t).length;
  const nR = countType("R");
  const nC = countType("C");
  const nOpamp = countType("OPAMP");
  // ★ 텍스트 시그니처가 명확한 Wien(발진기 + RC 회로망 + β(s)/1−Kβ/특성방정식/Barkhausen)이면
  //   인벤토리 요구를 완화한다 (2026-07-29 실측 신고). 원본이 **Z₁·Z₂ 임피던스 블록**으로 그려지면
  //   Vision이 커패시터를 하나도 못 뽑고 "R 5개 + OPAMP"만 준다 → C=2 요구에 막혀
  //   `opamp_generic (archetype 불확실 fallback)`으로 추락했다(로그 실측).
  const strongWienText =
    (text.includes("발진") || text.includes("oscillat")) &&
    (text.includes("rc") || text.includes("회로망")) &&
    (text.includes("β") || text.includes("beta") || text.includes("barkhausen") ||
     text.includes("1-kβ") || text.includes("1−kβ") || text.includes("특성방정식") || text.includes("특성 방정식"));
  // 정확한 Wien Bridge 형식(R≥4·C=2·OPAMP=1) 또는 위 강한 텍스트 시그니처 + OPAMP 존재.
  const isWienBridgeInventorySig =
    (nR >= 4 && nC === 2 && nOpamp === 1) || (strongWienText && nOpamp >= 1 && nR >= 2);

  const score = {
    wien: 0,
    inverting: 0,
    nonInverting: 0,
    follower: 0,
  };

  // Wien Bridge 구조 시그니처
  if (text.includes("rc") || text.includes("rc 회로망")) score.wien += 2;
  if (text.includes("feedback") || text.includes("피드백") || text.includes("되먹임")) score.wien += 2;
  if (text.includes("발진") || text.includes("oscillat")) score.wien += 3;
  if (text.includes("루프") || text.includes("loop")) score.wien += 2;
  if (text.includes("조건") || text.includes("특성방정식")) score.wien += 1;
  if (text.includes("β") || text.includes("beta") || text.includes("barkhausen")) score.wien += 3;

  // 단순 OPAMP archetype 키워드
  if (text.includes("반전") || text.includes("inverting")) score.inverting += 3;
  if (text.includes("비반전") || text.includes("non-inverting")) score.nonInverting += 3;
  if (text.includes("팔로워") || text.includes("voltage follower") || text.includes("buffer")) {
    score.follower += 3;
  }

  // ★ v3 Candidate Graphs (2026-05-31) — 더 정교한 점수 매기기로 Wien Bridge 잘못 매치 방지.
  //   IMYONG9 같이 다른 OPAMP 발진기가 textHint와 inventory로 우선 매치되면 Wien Bridge 차단.
  // selectOpampCandidate는 id를 사용하지 않으니 누락 시 자동 채움.
  const invForV3 = inv.map((c, i) => {
    const raw = c as { id?: string; type?: string; value?: string | number };
    const out: { id: string; type: string; value?: string } = {
      id: raw.id ?? `comp_${i}`,
      type: raw.type ?? "UNKNOWN",
    };
    if (typeof raw.value === "string") out.value = raw.value;
    else if (typeof raw.value === "number") out.value = String(raw.value);
    return out;
  });
  const v3 = selectOpampCandidate(invForV3, text);
  if (v3.archetype === "IMYONG9_OPAMP_OSCILLATOR") {
    // 새 archetype 빌더 미구현 — 잘못된 Wien Bridge layout 만드는 대신 null 반환.
    //   호출자는 ARCHETYPE_DETECTION_FAILED throw → 사용자에게 명확한 메시지.
    return null;
  }
  // ★ 텍스트 시그니처가 결정적이면 v3 점수 문턱을 우회한다 (2026-07-29) — Z 블록으로 그려진 원본은
  //   인벤토리에 C가 없어 candidateGraphs 점수가 2점(문턱 6)에 그친다. "발진 + RC 회로망 + β(s)/
  //   1−Kβ/특성방정식"은 다른 OPAMP archetype(반전·비반전·차동·적분기)에는 없는 조합이다.
  //   ※ 차동증폭기 오매치(과거 사고)는 위의 차동 가드에서 이미 걸러진다.
  //   (IMYONG9 후보는 위에서 이미 return null 처리됨 — 여기 도달하지 않는다.)
  if (strongWienText && nOpamp >= 1) {
    return "WIEN_BRIDGE_OSCILLATOR";
  }
  if (v3.archetype === "WIEN_BRIDGE_OSCILLATOR" && v3.score >= 6 && isWienBridgeInventorySig) {
    return "WIEN_BRIDGE_OSCILLATOR";
  }
  // ★ legacy wien matching 비활성화 (2026-05-31) — v3 candidateGraphs가 명확히 매치하지 않으면
  //   다른 OPAMP 발진기일 가능성이 더 높음. 잘못된 Wien Bridge 만드는 대신 null 반환해 throw 유도.

  const entries = Object.entries(score).sort((a, b) => b[1] - a[1]) as Array<[keyof typeof score, number]>;
  const [topKey, topScore] = entries[0];
  if (topScore < 3) return null; // archetype uncertain

  // ★ 발진기(Wien)는 구조적으로 RC(C 2개)가 필수 — 캡 없는 회로를 키워드("되먹임/루프")만으로
  //   Wien으로 매치하던 버그 차단. C<2면 발진기 아님 → null(→ generic OPAMP 경로).
  if (topKey === "wien" && nC < 2) return null;

  return KEY_TO_ARCHETYPE[topKey];
}

const KEY_TO_ARCHETYPE: Record<"wien" | "inverting" | "nonInverting" | "follower", AnalogArchetype> = {
  wien: "WIEN_BRIDGE_OSCILLATOR",
  inverting: "INVERTING_AMP",
  nonInverting: "NONINVERTING_AMP",
  follower: "VOLTAGE_FOLLOWER",
};
