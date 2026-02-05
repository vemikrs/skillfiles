/**
 * E2E Test Suite Runner
 * Runs Smoke and Full tests
 */
import { runSmokeTests } from './smoke.test.js';
import { runFullTests } from './full.test.js';

export async function run(): Promise<void> {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║     Skillfiles E2E Test Suite         ║');
  console.log('╚══════════════════════════════════════╝\n');

  const smoke = await runSmokeTests();
  const full = await runFullTests();

  const totalPassed = smoke.passed + full.passed;
  const totalFailed = smoke.failed + full.failed;
  const allErrors = [...smoke.errors, ...full.errors];

  console.log('\n╔══════════════════════════════════════╗');
  console.log('║           TEST SUMMARY                ║');
  console.log('╚══════════════════════════════════════╝');
  console.log(`\n  Smoke Tests: ${smoke.passed} passed, ${smoke.failed} failed`);
  console.log(`  Full Tests:  ${full.passed} passed, ${full.failed} failed`);
  console.log(`  ────────────────────────────────────`);
  console.log(`  TOTAL:       ${totalPassed} passed, ${totalFailed} failed\n`);

  if (totalFailed > 0) {
    console.log('ERRORS:');
    allErrors.forEach(e => console.log(`  - ${e}`));
    throw new Error(`${totalFailed} tests failed`);
  }

  console.log('🎉 ALL TESTS PASSED!\n');
}
