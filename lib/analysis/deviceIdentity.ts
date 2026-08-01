/**
 * "소자 종류 식별(개념형)" 판정 — 설명을 읽고 소자의 명칭·종류를 쓰는 유형.
 *
 * ★ 이 유형은 **회로 해석 문제가 아니다**. 그런데 electronics subject라는 이유로
 *   회로 figure(analog_netlist)를 요구·생성하다가 다음 증상이 연쇄로 터졌다(실측 신고):
 *     - 다이오드 하나에 인덕터가 직렬로 붙은 무의미한 폐루프 회로가 그려짐
 *     - `analog_circuit_open: 회로에 전원(V/I source)이 없음` 검증 실패
 *   → 소자 기호·구조를 묻는 개념형은 회로 figure role을 요구하지 않고, 생성기도
 *     figure 없이 텍스트로만 출제하게 한다.
 *
 * 판정은 생성(_core)·규칙(roleTriggers)·라우트가 공유한다.
 */
export function isDeviceIdentityText(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = String(text);
  const deviceCtx = /다이오드|트랜지스터|반도체\s*소자|소자의\s*(종류|명칭|기호|구조)|정류기|사이리스터|센서/.test(t);
  const asksTerm = /(명칭|이름|용어|종류)[^.]{0,20}(쓰|서술|답|고르|무엇)/.test(t);
  // 회로 해석(수치 도출) 문맥이면 개념형이 아니다 — 소자가 등장하는 일반 회로 문제와 구분.
  const circuitAnalysis =
    /(전류|전압|전력|이득|주파수|시정수|바이어스)[^.]{0,12}(구하|계산|도출)|\[단계\s*\d/.test(t);
  return deviceCtx && asksTerm && !circuitAnalysis;
}

/**
 * "원리·법칙의 이름을 쓰는 개념형" 판정 (임용 2번 회로이론류).
 *
 * ★ 원본: "다음은 선형 회로 해석에 필요한 원리 또는 법칙을 설명한 것이다. ㉠, ㉡에서 설명하는
 *   원리 또는 법칙의 이름을 순서대로 쓰시오." — ㉠=키르히호프 전압법칙, ㉡=중첩의 원리.
 *   **수치 계산이 전혀 없다**. 그런데 "중첩"·"전원" 같은 낱말 때문에 AC 중첩 회로 archetype으로
 *   가서 전혀 다른 계산 문제가 생성됐다(실측 신고).
 *
 * ★ 판별의 핵심은 **수치 도출 요구가 없다**는 것 — 명칭 쓰기 + 계산 없음.
 *   (중첩의 원리를 쓰고 **전력도 계산**하는 임용 A-3류는 계산이 있으므로 여기 해당하지 않는다.)
 */
export function isPrincipleNamingText(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = String(text);
  const principleCtx = /원리|법칙|정리/.test(t);
  const asksName =
    /(이름|명칭)[^.]{0,20}(쓰|서술|답)/.test(t) ||
    /(원리|법칙|정리)[^.]{0,15}(이름|명칭)/.test(t);
  // ★ Vision 요약이 "이름을 쓰라"를 흘리는 실행이 잦다(실측: topic이 "회로 해석의 기본 원리"뿐).
  //   원본은 ㉠·㉡ 같은 마커로 설명을 나열하고 그 명칭을 묻는 구조이므로,
  //   **마커 나열 + 원리/법칙 문맥 + 계산 없음**도 같은 유형으로 인정한다.
  const hasMarkers = /[㉠-㉻①-⑮]/.test(t);
  // 수치 계산 요구가 있으면 개념형이 아니다(계산형에 양보).
  const numericTask =
    /(전류|전압|전력|저항|정전용량|인덕턴스|주파수|이득|시정수)[^.]{0,12}(구하|계산|도출)/.test(t) ||
    /\[단계\s*\d/.test(t) ||
    /\d+\s*(Ω|V|A|W|F|H|Hz)/.test(t);
  return principleCtx && (asksName || hasMarkers) && !numericTask;
}

/**
 * "현상·용어의 명칭을 쓰는 개념형" 판정 (임용 3번 전자회로류 — pn 접합 바이어스).
 *
 * ★ 실측 신고(2026-07-30): "㉠, ㉡에 해당하는 **용어**를 순서대로 쓰시오"(전위 장벽·제너 항복)가
 *   기존 두 판정기에 안 걸렸다 — `isPrincipleNamingText`는 **원리/법칙**만, `isDeviceIdentityText`는
 *   **소자 종류**만 본다. 그래서 회로 경로로 가 `dc_mesh`(범용 DC 회로)가 됐다
 *   (generic_dispatch_warning 로그로 즉시 확인).
 *
 * 시그니처(도메인 무관): **용어/명칭을 쓰라는 요구** + (마커 ㉠㉡ 또는 괄호 빈칸) + **수치 계산 없음**.
 */
export function isTermNamingText(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = String(text);
  // "용어를 쓰시오"·"명칭을 순서대로 쓰시오"·"무엇이라 하는가" 류
  const asksTerm =
    /(용어|명칭|이름)[^.]{0,25}(쓰|서술|답|고르)/.test(t) ||
    /(이라|라)\s*(한다|부른다|하는가)/.test(t) ||
    /무엇이라\s*(하|부르)/.test(t);
  if (!asksTerm) return false;
  // ㉠·㉡ 같은 마커나 괄호 빈칸이 함께 있어야 "용어 채우기" 형식이다.
  const hasBlank = /[㉠-㉻①-⑮]/.test(t) || /\(\s*\)|괄호\s*안/.test(t);
  // 수치 계산 요구가 있으면 계산 문제 — 개념형이 아니다.
  const numericTask =
    /(전류|전압|전력|저항|정전용량|인덕턴스|주파수|이득|시정수|임피던스)[^.]{0,12}(구하|계산|도출)/.test(t) ||
    /\[단계\s*\d/.test(t) ||
    /\d+\s*(Ω|V|A|W|F|H|Hz|kΩ|mA|μF)/.test(t);
  return hasBlank && !numericTask;
}

/** 개념 명칭형 통합 판정 — 소자 종류 식별 + 원리·법칙 명칭 + **현상·용어 명칭**. 모두 회로 figure 불필요. */
export function isConceptNamingText(text: string | null | undefined): boolean {
  return isDeviceIdentityText(text) || isPrincipleNamingText(text) || isTermNamingText(text);
}

/** 원리·법칙의 고유명 — "설명을 읽고 이름을 답하는" 유형에 열거되는 이름들. */
const LAW_NAME_PATTERNS: RegExp[] = [
  /키르히호프의?\s*전압|kvl/i,
  /키르히호프의?\s*전류|kcl/i,
  /중첩의?\s*원리|중첩\s*정리|superposition/i,
  /테브[낭난]|thevenin/i,
  /노턴|norton/i,
  /옴의?\s*법칙|ohm's/i,
  /밀만|밀먼|millman/i,
  /전압\s*분배|분압/,
  /전류\s*분배|분류의?\s*법칙/,
  /최대\s*전력\s*전달/,
  /패러데이|렌츠|암페어|가우스/,
];

/**
 * "수치를 구하라"는 **요구**를 나타내는 표현 — 법칙의 정의를 서술하는 관형절과 구분한다.
 *   요구: "전력을 구하시오", "전류를 계산한다", "전압을 구하는 문제"
 *   정의(요구 아님): "각 전원이 단독으로 존재할 때의 값의 합으로 전류를 구하는 중첩의 원리"
 */
const TASK_DEMAND_RE =
  /(전류|전압|전력|저항|정전용량|인덕턴스|주파수|이득|시정수)[^.]{0,20}(구하시오|구하라|구해야|구한다|구하는\s*(문제|것)|계산하시오|계산하라|계산해야|계산한다|계산하는\s*(문제|것)|도출하시오|도출하라|도출한다|도출하는\s*(문제|것))/;

/** 본문에 등장하는 **서로 다른** 법칙·원리 이름의 개수. */
function countDistinctLaws(text: string): number {
  return LAW_NAME_PATTERNS.filter((re) => re.test(text)).length;
}

/**
 * 분석 객체에 **수치 given이 하나라도 있는가** — 계산 문제와 개념 문제를 가르는 구조 신호.
 *
 * ★ 계산 문제는 반드시 수치가 주어진다(소자값이든 본문 단위수치든). 반대로 "설명을 읽고
 *   원리의 이름을 쓰는" 개념 문항에는 수치가 단 하나도 없다. 이 불변식은 Vision이 요약을
 *   어떻게 바꿔 쓰든 유지되므로, 문구 키워드보다 훨씬 안정적이다.
 */
function hasQuantitativeGivens(
  analysis: { componentInventory?: Array<{ value?: string | null } | null> } | null | undefined,
  text: string,
): boolean {
  for (const c of analysis?.componentInventory ?? []) {
    if (c?.value && /\d/.test(String(c.value))) return true;
  }
  return /\d+(\.\d+)?\s*(k|M|m|µ|u|n|p)?\s*(Ω|ohm|V|A|W|F|H|Hz|s|초)\b/i.test(text);
}

/**
 * 원리·법칙 명칭형 판정 — **구조 신호 기반**(analysis 전체를 본다).
 *
 * ★ 왜 텍스트 판정만으로 부족한가(실측): 같은 원본을 올려도 Vision 요약이 실행마다 달라
 *   "이름을 쓰시오"도, ㉠·㉡ 마커도 남지 않는 실행이 있다(실측 요약: topic="회로 해석 원리 설명",
 *   interpretation="…KVL과 KCL을 설명하고 전압·전류를 분석하는 방법을 묻고 있습니다").
 *   문구에 조건을 걸면 그 실행에서 통째로 새어 회로 archetype(dc_nodal)으로 간다.
 *   → CLAUDE.md 규칙 2("리터럴 키워드가 아니라 구조 시그니처") 적용.
 *
 * 구조 시그니처: **원리/법칙 문맥 + 수치 given 전무 + 수치 도출 요구 없음 + 법칙 이름 열거(또는 마커)**.
 *   회로 계산 문제는 소자값이나 본문 수치를 반드시 동반하므로 이 조합에 걸리지 않는다.
 */
/**
 * 도출·설계형 구조 신호 — 이런 구조가 있으면 "원리의 이름을 쓰는" 개념 문항이 아니다.
 * (디지털 설계·논리식 도출은 수치 given이 없는 게 정상이라 수치 판별선이 통하지 않는다.)
 */
const DESIGN_STRUCTURE_RE =
  /여기표|상태\s*표|상태\s*전이표|상태\s*천이표|진리표|불\s*함수|부울\s*함수|논리식|카르노|k-?map|최소항|최대항|간략화|간소화|\bsop\b|\bpos\b|플립플롭|flip[\s-]?flop|j-?k\s*플립|순서\s*논리|순차\s*논리|조합\s*논리|상태\s*여기/i;

/**
 * 물리량 도출형 구조 신호 — 전자기학·교류 해석처럼 **장·페이저 물리량을 계산**하는 문항.
 *
 * ★ 실측 신고(2026-07-29): 무한 면전하 + 선전하 합성 전계(임용 11번)가 개념 명칭형으로 잡혀
 *   그림 없는 텍스트 문제로 생성됐다. 원인은 "가우스 **법칙**"·"중첩의 **원리**" 두 개가 열거된 것
 *   (법칙 이름 2개 = 나열·설명형이라는 규칙). ★ EM 문항은 원래 법칙을 2개 이상 인용하고,
 *   given이 ρ_s·ρ_l 같은 **기호**라 "수치 given" 판별선에도 걸리지 않는다.
 *   → 물리량을 구하는 구조가 보이면 개념 명칭형에서 제외한다.
 *   ※ "…법칙의 이름을 쓰시오" 같은 진짜 명칭형은 앞의 isPrincipleNamingText가 그대로 통과시킨다.
 */
const DERIVATION_STRUCTURE_RE =
  /면전하|선전하|점전하|전하\s*밀도|전속|자속|자계|자기장|전계|전기장|유전율|투자율|정전\s*용량|커패시턴스|인덕턴스|기전력|자유\s*공간|합성\s*전계|전위\s*분포|페이저|임피던스|어드미턴스|리액턴스|역률|공진\s*주파수|중첩의\s*원리로\s*(구|계산)/;

export function isPrincipleNamingAnalysis(
  analysis:
    | (Parameters<typeof deviceIdentityTextOf>[0] & {
        componentInventory?: Array<{ value?: string | null } | null>;
      })
    | null
    | undefined,
): boolean {
  const text = deviceIdentityTextOf(analysis);
  // ★ "무엇을 요구하는 문제인가"는 **topic·interpretation에만** 있다.
  //   relatedConcepts·fillInTheBlanks는 Vision이 만든 **빈칸 학습용 보조 문장**이라
  //   개념 문항인데도 "키르히호프 법칙은 전압 강하를 계산하는 데 쓰인다" 같은 문장이 섞인다.
  //   이걸 문제의 요구로 읽어서 계산 문제로 오판했다(실측: 이 한 줄 때문에 3회 중 1회가 샜다).
  const taskText = `${analysis?.topic ?? ""} ${analysis?.interpretation ?? ""}`;
  if (isPrincipleNamingText(taskText)) return true; // 문구가 살아 있는 실행은 기존 판정으로 즉시 통과
  // ★ 현상·용어 명칭형("㉠·㉡에 해당하는 용어를 쓰시오")도 같은 개념 경로 (2026-07-30 실측 신고).
  if (isTermNamingText(taskText)) return true;
  // ★★ 도출·설계형 구조 신호면 개념 명칭형이 아니다 (2026-07-29 실측 신고).
  //   판별선 "수치 given 유무"는 **아날로그 회로 기준**이다. 디지털 설계 문항(여기표·상태표·진리표·
  //   불 함수·카르노맵)은 0/1만 다루므로 수치 given이 **원래 없고**, 그래서 이 가드에 통째로 걸렸다.
  //   실측: JK-FF 여기표 + J_A 불함수(SOP→POS) 원본이 "분배 **법칙**" 언급 + ㉠~㉣ 마커 때문에
  //   개념형으로 잡혀 circuitType=unsupported → universal_digital로 새고 전혀 다른 문제가 생성됐다.
  //   ※ "…의 이름을 쓰시오" 같은 진짜 명칭형은 위의 isPrincipleNamingText가 이미 통과시킨다.
  if (DESIGN_STRUCTURE_RE.test(text)) return false;
  if (DERIVATION_STRUCTURE_RE.test(text)) return false;
  // ★★ 반도체·소자 **물리 현상 설명형** (2026-07-30 실측 신고: pn 접합 바이어스 ㉠·㉡ 용어 쓰기).
  //   Vision은 이런 원본에서 **요구 문구("용어를 쓰시오")를 요약에서 흘리고** 현상 서술만 남긴다
  //   (실측: topic "pn 접합의 바이어스 효과" + 전위 장벽 설명, 마커·"용어" 흔적 없음).
  //   → 구조로 판정한다: 반도체 물리 문맥 + **수치 given 0** + 도출 요구 없음 = 용어를 묻는 개념 문항.
  //   (계산형 다이오드/BJT 문제는 0.7V·kΩ 같은 수치가 반드시 있어 여기 걸리지 않는다.)
  const semiconductorConcept =
    /pn\s*접합|p-n\s*접합|공핍층|전위\s*장벽|에너지\s*장벽|에너지\s*대역|전도대역|가전자대역|터널링|항복\s*현상|캐리어|정공|확산\s*전류|드리프트|도핑/.test(text);
  if (semiconductorConcept && !TASK_DEMAND_RE.test(taskText) && !hasQuantitativeGivens(analysis, taskText)) {
    return true;
  }
  if (!/원리|법칙|정리/.test(text)) return false;
  // ① 수치 도출을 **요구**하면 계산 문제다(중첩의 원리를 쓰고 전력도 구하는 A-3류).
  //   ★ 단, "…의 합으로 전체 전압이나 전류를 **구하는 중첩의 원리입니다**"처럼 법칙의 **정의**를
  //     서술하는 관형절은 요구가 아니다(실측: 이 정의문 때문에 개념 문항이 계산으로 오판됐다).
  //     → 종결·명령형("구하시오·계산한다·구하는 문제")만 요구로 인정한다.
  if (TASK_DEMAND_RE.test(taskText) || /\[단계\s*\d/.test(taskText)) return false;
  // ② ★★ 수치 given이 하나라도 있으면 계산 문제다 — **모든 구조 신호보다 먼저** 배제한다.
  //   실측 회귀(사용자 신고): "테브난 등가 저항·최대 전력" 문제가 **법칙 이름 2개**(테브난 정리 +
  //   최대 전력 전달)로 잡혀 개념형으로 가로채였다. 계산 문제도 법칙 이름을 여럿 언급한다.
  //   반면 개념 문항(설명→이름)은 5V·3kΩ 같은 **수치가 단 하나도 없다** — 이게 진짜 판별선이다.
  //   (실측 확인: 개념 원본은 예시 그림에서 소자 12개가 잡혀도 값은 전부 비어 있었다.)
  if (hasQuantitativeGivens(analysis, taskText)) return false;
  // ③ 서로 다른 법칙 '이름'이 2개 이상 열거된다 = 법칙을 **적용**하는 게 아니라 **나열·설명**하는 문항.
  if (countDistinctLaws(text) >= 2) return true;
  if (/[㉠-㉻①-⑮]/.test(text)) return true;
  // ★ 마지막 구조 신호: 소자가 사실상 없다. 회로 계산 문제는 소자가 최소 3개는 잡히는데
  //   (실측 요약 "선형 회로 해석에 필요한 원리 또는 법칙을 설명한 것이다"처럼) 개념 문항은
  //   인벤토리가 비거나 합성된 1개뿐이다. 여기까지 왔다는 건 수치도 도출 요구도 없다는 뜻이라,
  //   회로 archetype에 넘겨봤자 소자를 지어내 기괴한 회로가 나온다(실측 신고).
  return (analysis?.componentInventory ?? []).filter(Boolean).length <= 1;
}

/** 개념 명칭형 통합 판정(analysis 기반) — 텍스트 판정 + 구조 신호. */
export function isConceptNamingAnalysis(
  analysis: Parameters<typeof isPrincipleNamingAnalysis>[0],
): boolean {
  return isDeviceIdentityText(deviceIdentityTextOf(analysis)) || isPrincipleNamingAnalysis(analysis);
}

/** analysis 객체에서 판정용 텍스트를 조립. */
export function deviceIdentityTextOf(analysis: {
  topic?: string;
  interpretation?: string;
  relatedConcepts?: string[];
  fillInTheBlanks?: Array<{ sentence?: string; answer?: string } | null>;
} | null | undefined): string {
  if (!analysis) return "";
  return [
    analysis.topic ?? "",
    analysis.interpretation ?? "",
    (analysis.relatedConcepts ?? []).join(" "),
    (analysis.fillInTheBlanks ?? []).map((b) => `${b?.sentence ?? ""} ${b?.answer ?? ""}`).join(" "),
  ].join(" ");
}
