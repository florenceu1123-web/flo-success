/**
 * Universal AC query solver — complexMna wrapper.
 *
 *  지원 query:
 *    - phasorVoltage: 노드 V (Complex 또는 magnitude)
 *    - phasorCurrent: V 소스 전류
 *    - magnitude/phase: 노드 V의 |V|·∠
 *    - resonanceFreq: ω sweep으로 |I| max 또는 phase 0이 되는 ω_0 도출
 *    - maxAvgPower: R_L sweep으로 R_L에서 평균 전력이 최대가 되는 R_L과 P_max
 *    - inverseC: 공진 조건이 주어진 ω 되도록 C 도출
 *    - inverseR: 특정 노드 |V|·전력이 target이 되는 R 도출
 */

import { type Complex, magnitude, phase } from "./complex";
import { solveComplexMna, type ComplexSolverNetwork } from "./complexMna";

export type AcQuery =
  | { kind: "phasorVoltage"; node: string; label: string }
  | { kind: "magnitude"; node: string; label: string }
  | { kind: "phaseDeg"; node: string; label: string }
  | { kind: "phasorCurrent"; vsourceId: string; label: string }
  | {
      kind: "resonanceFreq";
      vsourceId: string;
      label: string;
      omegaRange?: [number, number];
    }
  | {
      kind: "maxAvgPower";
      resistorId: string;
      vsourceId: string;
      label: string;
      rRange?: [number, number];
    }
  | {
      kind: "inverseC";
      capacitorId: string;
      targetOmega: number;
      label: string;
      cRange?: [number, number];
    };

export type AcQueryResult = {
  query: AcQuery;
  value: number;
  unit: "V" | "A" | "W" | "Ω" | "F" | "rad/s" | "Hz" | "°";
  meta?: Record<string, unknown>;
};

export function solveAcQueries(net: ComplexSolverNetwork, queries: AcQuery[]): AcQueryResult[] {
  const baseSol = solveComplexMna(net);
  return queries.map((q) => evaluate(net, baseSol, q));
}

function evaluate(
  net: ComplexSolverNetwork,
  sol: { nodeVoltages: Record<string, Complex>; vsourceCurrents: Record<string, Complex> },
  q: AcQuery,
): AcQueryResult {
  switch (q.kind) {
    case "phasorVoltage": {
      const v = sol.nodeVoltages[q.node];
      if (!v) return { query: q, value: NaN, unit: "V" };
      return { query: q, value: round(magnitude(v), 4), unit: "V", meta: { phaseDeg: deg(phase(v)) } };
    }
    case "magnitude": {
      const v = sol.nodeVoltages[q.node];
      return { query: q, value: round(v ? magnitude(v) : NaN, 4), unit: "V" };
    }
    case "phaseDeg": {
      const v = sol.nodeVoltages[q.node];
      return { query: q, value: round(v ? deg(phase(v)) : NaN, 2), unit: "°" };
    }
    case "phasorCurrent": {
      const i = sol.vsourceCurrents[q.vsourceId];
      if (!i) return { query: q, value: NaN, unit: "A" };
      return { query: q, value: round(magnitude(i), 4), unit: "A", meta: { phaseDeg: deg(phase(i)) } };
    }
    case "resonanceFreq": {
      // Zero-crossing 기반 — Im(I_vs) = 0 되는 ω. (V가 실수면) phase(I)=0 ↔ Im=0.
      //
      //   1) 1차 log sweep (coarse, 200 samples [oMin..oMax]) — Im(I) sign change bracket 탐색.
      //   2) bracket 발견 → linear interpolation on log(ω).
      //   3) bracket 없으면 fallback: max |I|를 정확하게 잡기 위해 fine search.
      const [oMin, oMax] = q.omegaRange ?? [10, 1e6];
      const samples: Array<{ omega: number; imI: number; magI: number }> = [];
      const N1 = 200;
      for (let k = 0; k <= N1; k++) {
        const t = k / N1;
        const omega = oMin * Math.pow(oMax / oMin, t);
        try {
          const s = solveComplexMna({ ...net, omega });
          const i = s.vsourceCurrents[q.vsourceId];
          if (!i || !Number.isFinite(i.re) || !Number.isFinite(i.im)) continue;
          samples.push({ omega, imI: i.im, magI: magnitude(i) });
        } catch { /* singular — skip */ }
      }
      if (samples.length === 0) {
        return { query: q, value: NaN, unit: "rad/s", meta: { converged: false, reason: "no samples" } };
      }

      // 1차: Im(I) zero-crossing bracket
      let bracket: { lo: typeof samples[number]; hi: typeof samples[number] } | null = null;
      for (let i = 1; i < samples.length; i++) {
        const p0 = samples[i - 1].imI;
        const p1 = samples[i].imI;
        if (p0 * p1 <= 0 && Math.abs(p1 - p0) > 1e-15) {
          bracket = { lo: samples[i - 1], hi: samples[i] };
          break;
        }
      }

      if (bracket) {
        // 1차 linear interpolation on log(ω) → 거친 추정
        let { lo, hi } = bracket;
        // 2차 fine search — bracket 내부에서 bisection 반복 (Im(I) 부호 기준)
        for (let iter = 0; iter < 30; iter++) {
          const logMid = (Math.log(lo.omega) + Math.log(hi.omega)) / 2;
          const omegaMid = Math.exp(logMid);
          try {
            const s = solveComplexMna({ ...net, omega: omegaMid });
            const ii = s.vsourceCurrents[q.vsourceId];
            if (!ii) break;
            const imMid = ii.im;
            const mid = { omega: omegaMid, imI: imMid, magI: magnitude(ii) };
            // sign-based bisection
            if (lo.imI * imMid <= 0) hi = mid;
            else lo = mid;
            if (Math.abs(imMid) < 1e-9) break;
            if (Math.abs(Math.log(hi.omega) - Math.log(lo.omega)) < 1e-6) break;
          } catch { break; }
        }
        // 최종 linear interpolation
        const ratio = -lo.imI / (hi.imI - lo.imI);
        const omegaResonance = Math.exp(Math.log(lo.omega) + ratio * (Math.log(hi.omega) - Math.log(lo.omega)));
        try {
          const s = solveComplexMna({ ...net, omega: omegaResonance });
          const i = s.vsourceCurrents[q.vsourceId];
          const mg = i ? magnitude(i) : NaN;
          return {
            query: q,
            value: round(omegaResonance, 4),
            unit: "rad/s",
            meta: { converged: true, method: "zero-crossing+bisection", Imax: round(mg, 4) },
          };
        } catch { /* fall through */ }
        return {
          query: q,
          value: round(omegaResonance, 4),
          unit: "rad/s",
          meta: { converged: true, method: "zero-crossing+bisection" },
        };
      }

      // Fallback: max |I| with ternary fine search around best coarse sample
      let bestIdx = 0;
      for (let i = 1; i < samples.length; i++) {
        if (samples[i].magI > samples[bestIdx].magI) bestIdx = i;
      }
      const coarseLo = samples[Math.max(0, bestIdx - 1)].omega;
      const coarseHi = samples[Math.min(samples.length - 1, bestIdx + 1)].omega;
      // Ternary search
      let lo = coarseLo, hi = coarseHi;
      const f = (omega: number): number => {
        try {
          const s = solveComplexMna({ ...net, omega });
          const i = s.vsourceCurrents[q.vsourceId];
          return i ? magnitude(i) : 0;
        } catch { return 0; }
      };
      for (let iter = 0; iter < 30; iter++) {
        const m1 = lo + (hi - lo) / 3;
        const m2 = hi - (hi - lo) / 3;
        if (f(m1) < f(m2)) lo = m1;
        else hi = m2;
      }
      const finalOmega = (lo + hi) / 2;
      return {
        query: q,
        value: round(finalOmega, 4),
        unit: "rad/s",
        meta: { converged: false, method: "max-|I| ternary", Imax: round(f(finalOmega), 4) },
      };
    }
    case "maxAvgPower": {
      // R_L sweep → R_L에서 P_avg = |V_RL|²/(2·R_L) (peak phasor) 또는 |V_RL|²/R_L (rms) 최대
      const [rMin, rMax] = q.rRange ?? [0.1, 1000];
      let bestR = NaN;
      let bestP = -Infinity;
      const N = 300;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const R = rMin * Math.pow(rMax / rMin, t);
        const sub: ComplexSolverNetwork = {
          ...net,
          resistors: net.resistors.map((r) => (r.id === q.resistorId ? { ...r, R } : r)),
        };
        try {
          const s = solveComplexMna(sub);
          const targetR = sub.resistors.find((r) => r.id === q.resistorId);
          if (!targetR) continue;
          const va = s.nodeVoltages[targetR.a];
          const vb = s.nodeVoltages[targetR.b];
          const vDrop = { re: va.re - vb.re, im: va.im - vb.im };
          const mag2 = vDrop.re * vDrop.re + vDrop.im * vDrop.im;
          // peak phasor 가정 — P_avg = |V|²/(2R). rms phasor면 |V|²/R.
          const P = mag2 / (2 * R);
          if (P > bestP) {
            bestP = P;
            bestR = R;
          }
        } catch { /* singular */ }
      }
      return {
        query: q,
        value: round(bestR, 4),
        unit: "Ω",
        meta: { Pmax: round(bestP, 4) },
      };
    }
    case "inverseC": {
      // Im(I_vs) = 0 (공진 조건) 되는 C 도출.
      //   - phase는 ±180° wrap 문제 있어 Im(I)이 더 robust.
      //   - C log sweep → Im(I) bracket → log(C) linear interpolation.
      //   - bracket 없으면 |Im(I)| 최소 C로 fallback.
      const [cMin, cMax] = q.cRange ?? [1e-12, 1e-3];
      const N = 300;
      const samples: Array<{ C: number; imI: number; magI: number }> = [];
      const vsId = net.vsources[0]?.id;
      if (!vsId) return { query: q, value: NaN, unit: "F", meta: { reason: "no vsource" } };
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const C = cMin * Math.pow(cMax / cMin, t);
        const sub: ComplexSolverNetwork = {
          ...net,
          omega: q.targetOmega,
          capacitors: (net.capacitors ?? []).map((c) =>
            c.id === q.capacitorId ? { ...c, C } : c,
          ),
        };
        try {
          const s = solveComplexMna(sub);
          const i = s.vsourceCurrents[vsId];
          if (!i || !Number.isFinite(i.re) || !Number.isFinite(i.im)) continue;
          samples.push({ C, imI: i.im, magI: magnitude(i) });
        } catch { /* singular */ }
      }
      if (samples.length === 0) {
        return { query: q, value: NaN, unit: "F", meta: { converged: false, reason: "no samples" } };
      }
      // Im(I) zero-crossing bracket
      let bracket: { lo: typeof samples[number]; hi: typeof samples[number] } | null = null;
      for (let i = 1; i < samples.length; i++) {
        const p0 = samples[i - 1].imI;
        const p1 = samples[i].imI;
        if (p0 * p1 <= 0 && Math.abs(p1 - p0) > 1e-15) {
          bracket = { lo: samples[i - 1], hi: samples[i] };
          break;
        }
      }
      if (bracket) {
        // bisection refine
        let { lo, hi } = bracket;
        for (let iter = 0; iter < 30; iter++) {
          const logMid = (Math.log(lo.C) + Math.log(hi.C)) / 2;
          const Cmid = Math.exp(logMid);
          const sub: ComplexSolverNetwork = {
            ...net,
            omega: q.targetOmega,
            capacitors: (net.capacitors ?? []).map((c) =>
              c.id === q.capacitorId ? { ...c, C: Cmid } : c,
            ),
          };
          try {
            const s = solveComplexMna(sub);
            const ii = s.vsourceCurrents[vsId];
            if (!ii) break;
            const imMid = ii.im;
            const mid = { C: Cmid, imI: imMid, magI: magnitude(ii) };
            if (lo.imI * imMid <= 0) hi = mid;
            else lo = mid;
            if (Math.abs(imMid) < 1e-9) break;
            if (Math.abs(Math.log(hi.C) - Math.log(lo.C)) < 1e-6) break;
          } catch { break; }
        }
        const ratio = -lo.imI / (hi.imI - lo.imI);
        const C = Math.exp(Math.log(lo.C) + ratio * (Math.log(hi.C) - Math.log(lo.C)));
        return { query: q, value: round(C, 12), unit: "F", meta: { converged: true, method: "zero-crossing+bisection" } };
      }
      // fallback — 최소 |Im(I)|
      let best = samples[0];
      for (const s of samples) if (Math.abs(s.imI) < Math.abs(best.imI)) best = s;
      return {
        query: q,
        value: round(best.C, 12),
        unit: "F",
        meta: { converged: false, residualImI: best.imI },
      };
    }
  }
}

function deg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function round(x: number, digits: number): number {
  if (!Number.isFinite(x)) return x;
  const f = Math.pow(10, digits);
  return Math.round(x * f) / f;
}
