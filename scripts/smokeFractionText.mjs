// 답 텍스트의 소수 → 분수 표기 (사용자 요청) 단위 검증 — API 없음
//   실행: node --experimental-strip-types --import ./scripts/_aliasHook.mjs scripts/smokeFractionText.mjs
import { decimalToFraction, fractionizeText } from "../lib/format/fraction.ts";

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  if (got === want) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} — got "${got}" / want "${want}"`); }
};

console.log("\n[1] 숫자 단위 변환");
eq("6.75 → 27/4", fractionizeText("6.75"), "27/4");
eq("1.5 → 3/2", fractionizeText("1.5"), "3/2");
eq("0.25 → 1/4", fractionizeText("0.25"), "1/4");
eq("4.8 → 24/5", fractionizeText("4.8"), "24/5");
eq("-0.5 → -1/2", fractionizeText("-0.5"), "-1/2");
eq("정수 6 유지", fractionizeText("6"), "6");
// ★ 사용자 지침 "답이 지저분하면 그냥 분수로" — 반올림된 값도 원래 유리수로 되돌린다.
eq("26.675 → 1067/40 (정확)", fractionizeText("26.675"), "1067/40");
eq("9.767 → 293/30 (반올림 복원)", fractionizeText("9.767"), "293/30");
eq("0.534 → 8/15 (반올림 복원)", fractionizeText("0.534"), "8/15");
eq("0.32 → 8/25", fractionizeText("0.32"), "8/25");
eq("각도 158.199° 유지", fractionizeText("158.199°"), "158.199°");
eq("페이저 각도 보존", fractionizeText("2.5∠158.199° A"), "5/2∠158.199° A");
eq("버전 16.2.6 유지", fractionizeText("16.2.6"), "16.2.6");
eq("decimalToFraction 정수는 null", String(decimalToFraction(3)), "null");

console.log("\n[2] 실제 답 문장");
eq(
  "테브난 최대전력",
  fractionizeText("[단계 3] P_L(max) = |V_TH|² / (4·R_TH) = 9² / (4·3) = 6.75 W"),
  "[단계 3] P_L(max) = |V_TH|² / (4·R_TH) = 9² / (4·3) = 27/4 W",
);
eq(
  "테브난 등가 (R_T·V_T)",
  fractionizeText("[단계 1] R_T = R1∥R2 = 1.5 Ω,  V_T = 10.5 V"),
  "[단계 1] R_T = R1∥R2 = 3/2 Ω,  V_T = 21/2 V",
);
eq(
  "단위 붙은 값(0.5s)",
  fractionizeText("τ = 0.5 s, i(0⁻) = 2 A"),
  "τ = 1/2 s, i(0⁻) = 2 A",
);
eq(
  "LaTeX 안에서도 변환",
  fractionizeText("\\( P_{avg} = 0.75\\,\\mathrm{W} \\)"),
  "\\( P_{avg} = 3/4\\,\\mathrm{W} \\)",
);
// ★ 나눗셈 뒤 치환은 괄호 필수 — 안 그러면 식의 의미가 바뀐다(실측: exp(-t/0.48) → exp(-t/12/25)).
eq(
  "지수식 시정수",
  fractionizeText("v_o(t) = 6 + (-1)·exp(-t/0.48) [V]"),
  "v_o(t) = 6 + (-1)·exp(-t/(12/25)) [V]",
);
eq(
  "나눗셈 뒤 괄호",
  fractionizeText("i(t) = 1 + 14·exp(-t/0.25) [A]"),
  "i(t) = 1 + 14·exp(-t/(1/4)) [A]",
);
eq(
  // 정책(사용자 지침): 크기는 지저분하면 분수로, **각도는 그대로**.
  "페이저 — 크기는 분수·각도는 유지",
  fractionizeText("I_ab = 2.693∠158.199° A"),
  "I_ab = 35/13∠158.199° A",
);

// ★ 길이는 소수 유지 (2026-07-31, 동축선로 자계 원본의 반지름 차에서 실측):
//   "x = 0.03 [m]"이 "x = 3/100 [m]"이 되면 오히려 읽기 어렵다. 각도와 같은 성격의 단위 예외.
eq(
  "길이 [m] — 소수 유지",
  fractionizeText("\\( x = 0.03\\,[\\mathrm{m}] \\)"),
  "\\( x = 0.03\\,[\\mathrm{m}] \\)",
);
eq(
  "길이 [cm]·맨몸 [m] — 소수 유지",
  fractionizeText("r = 2.5 [cm], d = 0.75 [m]"),
  "r = 2.5 [cm], d = 0.75 [m]",
);
eq(
  // m으로 시작해도 길이가 아닌 단위(mH·mA)는 기존대로 분수 변환.
  "mH·mA는 길이가 아니므로 변환",
  fractionizeText("L = 0.75\\,[\\mathrm{mH}], I = 0.25\\,[\\mathrm{mA}]"),
  "L = 3/4\\,[\\mathrm{mH}], I = 1/4\\,[\\mathrm{mA}]",
);

console.log(`\n결과: ${pass} pass / ${fail} fail`);
process.exit(fail === 0 ? 0 : 1);
