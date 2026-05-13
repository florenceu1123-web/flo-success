// RL 솔버 sanity test.
// Closed-form: I_L(t) = (V/R)·(1 - e^(-t/τ)), τ = L/R

function assertClose(actual, expected, label, tol = 1e-3) {
  if (Math.abs(actual - expected) < tol) {
    console.log(`  ✓ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})`);
  } else {
    console.log(`  ✗ ${label}: ${actual.toFixed(4)} (expected ${expected.toFixed(4)})  ← FAIL`);
    process.exitCode = 1;
  }
}

function rlIl(I_inf, I0, tau, t) {
  return I_inf + (I0 - I_inf) * Math.exp(-t / tau);
}

console.log("Test 1: V=12V, R=4Ω, L=100mH, t=τ");
{
  const V = 12, R = 4, L = 100e-3;
  const tau = L / R;            // 25ms
  const I_inf = V / R;          // 3A
  const Il = rlIl(I_inf, 0, tau, tau);
  assertClose(tau, 0.025, "τ");
  assertClose(I_inf, 3, "I_∞");
  assertClose(Il, 3 * (1 - 1/Math.E), "I_L(τ)");
}

console.log("Test 2: V=24V, R=8Ω, L=200mH, t=2τ");
{
  const V = 24, R = 8, L = 200e-3;
  const tau = L / R;
  const I_inf = V / R;
  const Il = rlIl(I_inf, 0, tau, 2 * tau);
  assertClose(I_inf, 3, "I_∞ = 24/8 = 3");
  assertClose(Il, 3 * (1 - Math.exp(-2)), "I_L(2τ)");
}

console.log("Test 3: V=10V, R=5Ω, L=50mH, t=3τ");
{
  const V = 10, R = 5, L = 50e-3;
  const tau = L / R;
  const I_inf = V / R;
  const Il = rlIl(I_inf, 0, tau, 3 * tau);
  assertClose(Il, 2 * (1 - Math.exp(-3)), "I_L(3τ)");
}

if (process.exitCode === 1) console.log("\n❌ 실패");
else console.log("\n✅ 모두 통과");
