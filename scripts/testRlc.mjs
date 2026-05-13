// RLC 솔버 sanity test — 3 cases.
// V = 10V, V_C(0)=0, I_L(0)=0 step input.
//
//  L = 10mH = 0.01H, C = 1μF = 1e-6 F → ω₀ = 1/√(LC) = 1/√(1e-8) = 10000 rad/s
//  R_crit = 2·L·ω₀ = 200Ω
//
//  Test 1 (under, ζ=0.5): R=100Ω → α = 100/(2·0.01) = 5000, ζ=0.5
//     ω_d = √(ω₀²−α²) = √(1e8 − 25e6) = √(7.5e7) ≈ 8660 rad/s
//     V_C(t→∞) = V = 10
//  Test 2 (critical, ζ=1): R=200 → α=10000=ω₀
//     V_C(t) = V·(1 − (1+αt)·e^(−αt))
//     V_C(1/α) = 10·(1 − 2/e) ≈ 10·0.2642 = 2.642
//  Test 3 (over, ζ=2): R=400 → α=20000, disc=√(α²−ω₀²)=√(4e8−1e8)=√3·1e4
//     s1 = −α+disc = −20000 + 17321 = −2679 (slow)
//     s2 = −α−disc = −37321 (fast)
//     V_C(∞) = 10

function assertClose(actual, expected, label, tol = 1e-3) {
  if (Math.abs(actual - expected) < tol) {
    console.log(`  ✓ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})`);
  } else {
    console.log(`  ✗ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})  ← FAIL`);
    process.exitCode = 1;
  }
}

// inline RLC solver
function rlcSolve(V, R, L, C) {
  const alpha = R / (2 * L);
  const omega0 = 1 / Math.sqrt(L * C);
  const zeta = alpha / omega0;
  let damping, Vc;
  if (Math.abs(zeta - 1) < 1e-3) {
    damping = "critical";
    Vc = (t) => V * (1 - (1 + alpha * t) * Math.exp(-alpha * t));
  } else if (zeta > 1) {
    damping = "over";
    const disc = Math.sqrt(alpha * alpha - omega0 * omega0);
    const s1 = -alpha + disc, s2 = -alpha - disc;
    Vc = (t) => V * (1 + (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s1 - s2));
  } else {
    damping = "under";
    const wd = Math.sqrt(omega0 * omega0 - alpha * alpha);
    Vc = (t) => V * (1 - Math.exp(-alpha * t) * (Math.cos(wd * t) + (alpha / wd) * Math.sin(wd * t)));
  }
  return { alpha, omega0, zeta, damping, Vc };
}

const V = 10, L = 0.01, C = 1e-6;

console.log("Test 1: R=100, ζ=0.5 (underdamped)");
{
  const s = rlcSolve(V, 100, L, C);
  assertClose(s.alpha, 5000, "α");
  assertClose(s.omega0, 10000, "ω₀");
  assertClose(s.zeta, 0.5, "ζ");
  if (s.damping !== "under") { console.log(`  ✗ damping should be under, got ${s.damping}`); process.exitCode = 1; }
  else console.log(`  ✓ damping = under`);
  // V_C(0) = 0, V_C(∞) = V
  assertClose(s.Vc(0), 0, "V_C(0)");
  assertClose(s.Vc(10), V, "V_C(∞) ≈ V");   // 10s = many τ, should converge
}

console.log("Test 2: R=200, ζ=1 (critically damped)");
{
  const s = rlcSolve(V, 200, L, C);
  assertClose(s.zeta, 1, "ζ", 1e-3);
  if (s.damping !== "critical") { console.log(`  ✗ damping should be critical, got ${s.damping}`); process.exitCode = 1; }
  else console.log(`  ✓ damping = critical`);
  // V_C(1/α) = V·(1 − 2/e)
  assertClose(s.Vc(1/s.alpha), V * (1 - 2/Math.E), "V_C(1/α) = V·(1−2/e)");
}

console.log("Test 3: R=400, ζ=2 (overdamped)");
{
  const s = rlcSolve(V, 400, L, C);
  assertClose(s.zeta, 2, "ζ");
  if (s.damping !== "over") { console.log(`  ✗ damping should be over, got ${s.damping}`); process.exitCode = 1; }
  else console.log(`  ✓ damping = over`);
  assertClose(s.Vc(0), 0, "V_C(0)");
  assertClose(s.Vc(10), V, "V_C(∞) ≈ V", 1e-2);
}

if (process.exitCode === 1) console.log("\n❌ 실패");
else console.log("\n✅ 모두 통과");
