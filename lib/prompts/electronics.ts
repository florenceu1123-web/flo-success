/** 전자회로(electronics) 과목 프롬프트 조각. */
export const ELECTRONICS_HINT = "BJT/MOSFET/OPAMP/다이오드 등 능동·수동 소자 회로 해석.";

/**
 * 전자회로 문제 생성 시 추가할 도메인 가이드.
 * 향후 lib/rules/electronics.ts와 함께 figure 요구사항 등을 안내.
 */
export const ELECTRONICS_GUIDE = `[전자회로 가이드]
- BJT는 NPN/PNP, 동작영역(active/saturation/cutoff) 명확히.
- MOSFET는 NMOS/PMOS, 영역(triode/saturation) 명확히.
- OPAMP는 이상적 가정(가상 단락·가상 개방) 사용 시 명시.`;
