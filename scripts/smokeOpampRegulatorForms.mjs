/**
 * 임용 30번 OPAMP 직렬형 정전압 안정화 회로 — **문항 형식 분기** 정적 스모크.
 *
 * 원본은 〈보기〉 ㄱ~ㅂ에서 (1) 정전압 상태의 트랜지스터 상태 (2) 출력전압 (3) 부하 변동 시 보정 방향을
 * 고르는 **동작 판정형 객관식**이다(정답 ⑤ ㄴ·ㄹ·ㅂ). 기존 수치형 3단계(I_f·I_L·I_E)로 내면 (1)·(3)의
 * 학습목표가 사라지므로(절대규칙 0), 같은 회로·같은 물리로 **형식만** 바꾼 동작 판정형 3단계를 추가했다.
 *
 * ★ 표기 계약: 조건(conditions)은 route의 전역 분수 변환기(1-4-3)를 거치지 않고 정답·풀이만 거친다.
 *   따라서 **조건에 소수가 있으면 한 문항 안에서 표기가 갈린다**(실측: 조건 "V_z=2.5V" ↔ 풀이 "5/2").
 *   → 값 공간에서 소수를 없앴고, 여기서 조건에 소수가 없음을 단언한다.
 *   정답·풀이 안에서만 일어나는 변환(I_f=0.2 → 1/5)은 양쪽이 함께 바뀌므로 정상이다.
 */
import { runOpampSeriesRegulatorPipeline, isRegulatorOperationForm } from "../lib/pipeline/runOpampSeriesRegulatorPipeline.ts";
import { fractionizeText } from "../lib/format/fraction.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass += 1; } else { fail += 1; console.log("  ✗", m); } };

// ── 1. 형식 감지 ────────────────────────────────────────────
const opForms = [
  { topic: "정전압 안정화 회로의 동작", interpretation: "정전압 안정화 상태에서 트랜지스터가 ON인지 OFF인지, 부하 변동으로 출력전압이 높아지면 어떻게 안정화되는지 고르는 문제", relatedConcepts: ["제너다이오드"] },
  { topic: "제너다이오드 정전압 회로", interpretation: "회로 동작에 관한 설명으로 옳은 것을 보기에서 고른다. 트랜지스터의 도통·차단과 출력전압을 판단한다.", relatedConcepts: [] },
];
const numForms = [
  { topic: "정전압 안정화 회로", interpretation: "부하 전류와 이미터 전류를 구하시오.", relatedConcepts: ["제너"] },
  { topic: "직렬형 레귤레이터 설계", interpretation: "출력전압이 20V가 되도록 피드백 저항 값을 구하시오.", relatedConcepts: [] },
];
opForms.forEach((a, i) => ok(isRegulatorOperationForm(a), `동작형#${i} 감지 실패`));
numForms.forEach((a, i) => ok(!isRegulatorOperationForm(a), `수치형#${i}을 동작형으로 오탐`));
ok(!isRegulatorOperationForm(null), "null 입력에 발화");

// ── 2. 생성물 검증 ──────────────────────────────────────────
for (const mode of ["exam_similar", "exam_variant"]) {
  for (const [tag, analysis] of [["op", opForms[0]], ["num", numForms[0]]]) {
    const ps = await runOpampSeriesRegulatorPipeline({ analysis, mode, count: 6 });
    ok(ps.length === 6, `${tag}/${mode} 생성 개수 ${ps.length}`);

    for (const [i, p] of ps.entries()) {
      const t = `${tag}/${mode}#${i}`;
      const cond = (p.conditions ?? []).join(" ");

      // 3단계 계약 (객관식 원본 → 단계별 주관식)
      for (const k of [1, 2, 3]) {
        ok(p.question.includes(`[단계 ${k}]`), `${t} 발문 [단계 ${k}] 누락`);
        ok(p.answer.includes(`[단계 ${k}]`), `${t} 정답 [단계 ${k}] 누락`);
        ok(p.solution.includes(`[단계 ${k}]`), `${t} 풀이 [단계 ${k}] 누락`);
      }
      ok(!/고르시오|고른 것은|보기 중|①|②/.test(`${p.content}\n${p.question}`), `${t} 객관식 잔존`);

      // ★ 조건에는 소수가 없어야 한다(정답·풀이만 분수 변환을 거치므로 표기가 갈린다)
      ok(!/\d+\.\d/.test(cond), `${t} 조건에 소수 표기: ${cond}`);

      // figure — 동작형은 무부하, 수치형은 기존대로 부하 있음
      const d = p.figureVariants[0].diagram;
      ok(p.figureVariants[0].diagramType === "opamp_series_regulator_circuit", `${t} diagramType 불일치`);
      ok(tag === "op" ? d.noLoad === true : !d.noLoad, `${t} noLoad 설정 오류`);

      if (tag === "op") {
        // 원본 학습목표 3가지가 모두 살아 있는가
        ok(/V_o/.test(p.answer), `${t} [단계 1] 출력전압 없음`);
        ok(/차단\(OFF\)/.test(p.answer), `${t} [단계 2] 동작 판정 없음`);
        ok(/부귀환|되먹임|귀환/.test(p.solution), `${t} [단계 3] 귀환 설명 없음`);
        // 보정 방향이 모드별로 반대인가
        ok(mode === "exam_variant"
          ? /낮아지려/.test(p.question) && /도통\s*늘어나/.test(p.answer)
          : /높아지려/.test(p.question) && /줄어들어/.test(p.answer), `${t} 보정 방향 오류`);
        // 동작형은 수치가 정수뿐이라 분수 변환기가 손댈 것이 없어야 한다
        ok(fractionizeText(p.answer) === p.answer, `${t} answer가 분수 변환기에 뭉개짐`);
        ok(fractionizeText(p.solution) === p.solution, `${t} solution이 분수 변환기에 뭉개짐`);
        // 무부하이므로 부하 관련 서술이 남으면 안 된다
        ok(!/R_L/.test(`${p.content}\n${cond}\n${p.question}`), `${t} 무부하인데 R_L 언급`);
      } else {
        // 수치형(형제 경로) 무회귀 — 부하 전류 단계가 그대로 있는가
        ok(/I_f|I_L|I_E|R_a/.test(p.answer), `${t} 수치형 정답 항목 누락`);
      }

      // 물리 재검산 — 조건의 V_z·R_a·R_b로 V_o를 독립 계산
      const vz = Number(/V_z=(\d+)V/.exec(cond)?.[1]);
      const ra = Number(/R_a=(\d+)kΩ/.exec(cond)?.[1]);
      const rb = Number(/R_b=(\d+)kΩ/.exec(cond)?.[1]);
      if (Number.isFinite(vz) && Number.isFinite(ra) && Number.isFinite(rb)) {
        const vo = vz * (ra + rb) / rb;
        ok(new RegExp(`${vo}\\s*\\[?V`).test(p.answer), `${t} V_o 재검산 불일치 (기대 ${vo})`);
      }
    }
  }
}

console.log(`\n=== OPAMP SERIES REGULATOR FORMS: ${pass} pass / ${fail} fail ===`);
if (fail > 0) process.exit(1);
