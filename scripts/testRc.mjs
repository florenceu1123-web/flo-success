// RC 솔버 sanity test.
// Closed-form: V_C(t) = V1·(1 - e^(-t/τ)), τ = R·C
//
//  Test 1: V1=10V, R=1kΩ, C=100μF → τ=100ms. V_C(τ) ≈ 10·(1-1/e) = 6.321V
//  Test 2: V1=24V, R=10kΩ, C=10μF → τ=100ms. V_C(2τ) ≈ 24·(1-e⁻²) = 20.751V
//  Test 3: V1=5V, R=2kΩ, C=50μF → τ=100ms. V_C(3τ) ≈ 5·(1-e⁻³) = 4.751V

function assertClose(actual, expected, label, tol = 1e-3) {
  if (Math.abs(actual - expected) < tol) {
    console.log(`  ✓ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})`);
  } else {
    console.log(`  ✗ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})  ← FAIL`);
    process.exitCode = 1;
  }
}

function rcVc(V_inf, V0, tau, t) {
  return V_inf + (V0 - V_inf) * Math.exp(-t / tau);
}

console.log("Test 1: V1=10, R=1k, C=100μ, t=τ");
{
  const V1 = 10, R = 1000, C = 100e-6;
  const tau = R * C;
  const Vc = rcVc(V1, 0, tau, tau);
  assertClose(Vc, V1 * (1 - 1/Math.E), "V_C(τ)");
}

console.log("Test 2: V1=24, R=10k, C=10μ, t=2τ");
{
  const V1 = 24, R = 10000, C = 10e-6;
  const tau = R * C;
  const Vc = rcVc(V1, 0, tau, 2 * tau);
  assertClose(Vc, V1 * (1 - Math.exp(-2)), "V_C(2τ)");
}

console.log("Test 3: V1=5, R=2k, C=50μ, t=3τ");
{
  const V1 = 5, R = 2000, C = 50e-6;
  const tau = R * C;
  const Vc = rcVc(V1, 0, tau, 3 * tau);
  assertClose(Vc, V1 * (1 - Math.exp(-3)), "V_C(3τ)");
}

if (process.exitCode === 1) console.log("\n❌ 실패");
else console.log("\n✅ 모두 통과");
