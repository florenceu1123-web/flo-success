/**
 * id prefix와 type 일치성을 엄격히 검사 (critical).
 * SPICE 컨벤션: id의 첫 글자가 component 종류를 나타냄.
 *  - R… → R
 *  - V… → V | VCVS | VCCS
 *  - I… → I | CCCS | CCVS
 *  - L/C/D/SW… 등 동일 prefix
 *  - E… → VCVS, F… → CCCS, G… → VCCS, H… → CCVS (SPICE dep source 컨벤션)
 *  - Q… → BJT, M… → MOSFET, U… → OPAMP
 */
export function validateIdTypeConsistencyStrict(
  components: Array<{ id?: string; type?: string }>,
): string[] {
  const errors: string[] = [];

  for (const c of components) {
    const id = (c.id ?? "").trim();
    const type = (c.type ?? "").toUpperCase();
    if (!id || !type) continue;

    if (/^R/i.test(id) && type !== "R") {
      errors.push(`${id}: id는 R인데 type은 ${type}`);
      continue;
    }
    if (/^V/i.test(id) && !["V", "VCVS", "VCCS"].includes(type)) {
      errors.push(`${id}: id는 V인데 type은 ${type} (V/VCVS/VCCS여야 함)`);
      continue;
    }
    if (/^I/i.test(id) && !["I", "CCCS", "CCVS"].includes(type)) {
      errors.push(`${id}: id는 I인데 type은 ${type} (I/CCCS/CCVS여야 함)`);
      continue;
    }
    if (/^SW/i.test(id) && type !== "SW") {
      errors.push(`${id}: id는 SW인데 type은 ${type}`);
      continue;
    }
    if (/^L/i.test(id) && type !== "L") {
      errors.push(`${id}: id는 L인데 type은 ${type}`);
      continue;
    }
    if (/^C/i.test(id) && type !== "C") {
      errors.push(`${id}: id는 C인데 type은 ${type}`);
      continue;
    }
    if (/^D/i.test(id) && type !== "D") {
      errors.push(`${id}: id는 D인데 type은 ${type}`);
      continue;
    }
    if (/^E/i.test(id) && type !== "VCVS") {
      errors.push(`${id}: id가 E이면 type=VCVS (got ${type})`);
      continue;
    }
    if (/^F/i.test(id) && type !== "CCCS") {
      errors.push(`${id}: id가 F이면 type=CCCS (got ${type})`);
      continue;
    }
    if (/^G/i.test(id) && type !== "VCCS") {
      errors.push(`${id}: id가 G이면 type=VCCS (got ${type})`);
      continue;
    }
    if (/^H/i.test(id) && type !== "CCVS") {
      errors.push(`${id}: id가 H이면 type=CCVS (got ${type})`);
      continue;
    }
    if (/^Q/i.test(id) && !["BJT", "NPN", "PNP"].includes(type)) {
      errors.push(`${id}: id가 Q이면 BJT/NPN/PNP (got ${type})`);
      continue;
    }
    if (/^M/i.test(id) && !["MOSFET", "NMOS", "PMOS"].includes(type)) {
      errors.push(`${id}: id가 M이면 MOSFET/NMOS/PMOS (got ${type})`);
      continue;
    }
    if (/^U/i.test(id) && type !== "OPAMP") {
      errors.push(`${id}: id가 U이면 OPAMP (got ${type})`);
      continue;
    }
  }

  return errors;
}
