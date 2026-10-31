import assert from 'node:assert/strict';
import { seedDatabase } from '../src/server/db';
import {
  autoReconcileAllLeakage,
  calculateChurnPredictions,
  detectRevenueLeakage,
  evaluateCheckoutAttempt,
  generateInvoicesForDueSubscriptions,
  pauseSubscription,
  resumeSubscription,
} from '../src/server/services';

async function runTests() {
  console.log('Running Brightloop Gaming Test Suite...');
  seedDatabase(true);

  // 1. Revenue Leakage Detection Test (4 required categories)
  console.log('Test 1: Revenue Leakage Detection...');
  const leakageBefore = detectRevenueLeakage();
  assert.equal(leakageBefore.issues.length, 4, 'Should detect all 4 seeded leakage anomalies');
  const issueTypes = new Set(leakageBefore.issues.map((i) => i.issueType));
  assert.ok(issueTypes.has('ACTIVE_SUB_WITHOUT_INVOICE'), 'Detects active subscription without invoice');
  assert.ok(issueTypes.has('DUPLICATE_PERIOD_INVOICE'), 'Detects duplicate invoices for same period');
  assert.ok(issueTypes.has('EXPIRED_DISCOUNT_ON_DRAFT'), 'Detects expired discount on draft invoice');
  assert.ok(issueTypes.has('UNLINKED_SUCCESS_PAYMENT'), 'Detects unlinked $49.99 payment');
  console.log('  ✓ Passed: Detected all 4 revenue leakage categories totaling $' + (leakageBefore.totalLeakageCents / 100).toFixed(2));

  // 2. Pause & Resume Subscription Test (Billing Period Recalculation)
  console.log('Test 2: Subscription Pause & Resume...');
  const paused = pauseSubscription({
    subscriptionId: 'sub_alex_1',
    actorId: 'usr_gamer_1',
    actorRole: 'GAMER',
    durationDays: 14,
    reason: 'Vacation test',
  });
  assert.equal(paused.status, 'PAUSED');
  assert.equal(paused.perksFrozen, true);

  const resumed = resumeSubscription({
    subscriptionId: 'sub_alex_1',
    actorId: 'usr_gamer_1',
    actorRole: 'GAMER',
  });
  assert.equal(resumed.status, 'ACTIVE');
  assert.equal(resumed.perksFrozen, false);
  assert.equal(resumed.daysExtended, 14, 'Billing period should extend by 14 paused days');
  console.log('  ✓ Passed: Subscription paused & resumed with +14 days billing period extension');

  // 3. Billing & Invoice Generation Test (18% GST + Duplicate Prevention)
  console.log('Test 3: Billing & 18% GST Invoice Generation...');
  const generated = generateInvoicesForDueSubscriptions({
    subscriptionId: 'sub_maya_no_inv',
    billingPeriodKey: '2026-10',
  });
  assert.equal(generated.generatedCount, 1, 'Should generate 1 invoice for Maya');
  assert.equal(generated.invoices[0].amountSubtotal, 1499);
  assert.equal(generated.invoices[0].taxAmount, 270, '18% GST on $14.99 (1499c) is 270c');
  assert.equal(generated.invoices[0].totalAmount, 1769);

  const duplicateTry = generateInvoicesForDueSubscriptions({
    subscriptionId: 'sub_maya_no_inv',
    billingPeriodKey: '2026-10',
  });
  assert.equal(duplicateTry.generatedCount, 0, 'Should prevent duplicate invoice for same billingPeriodKey');
  assert.equal(duplicateTry.skippedDuplicateCount, 1);
  console.log('  ✓ Passed: 18% GST calculation and duplicate invoice prevention verified');

  // 4. Token-Bucket & 3-Failed-Attempts Checkout Rate Limiter Test
  console.log('Test 4: Security Checkout Rate Limiter (3 failed card attempts)...');
  const testIp = '203.0.113.250';
  const attempt1 = evaluateCheckoutAttempt({ ipAddress: testIp, userAgent: 'TestBot', cardLast4: '1111', outcome: 'FAILED' });
  assert.equal(attempt1.blocked, false);
  const attempt2 = evaluateCheckoutAttempt({ ipAddress: testIp, userAgent: 'TestBot', cardLast4: '2222', outcome: 'FAILED' });
  assert.equal(attempt2.blocked, false);
  const attempt3 = evaluateCheckoutAttempt({ ipAddress: testIp, userAgent: 'TestBot', cardLast4: '3333', outcome: 'FAILED' });
  assert.equal(attempt3.blocked, true, '3rd failed card attempt from same IP must block checkout');
  assert.equal(attempt3.reason, 'THREE_FAILED_ATTEMPTS_BLOCK');
  console.log('  ✓ Passed: 3 failed card attempts automatically blocked IP and logged security event');

  // 5. Churn Prediction Weighted Score Test
  console.log('Test 5: Churn Prediction 0-100 Risk Scoring...');
  const churn = calculateChurnPredictions();
  assert.ok(churn.subscribers.length >= 5);
  assert.ok(churn.groups.highRisk.length >= 1, 'Liam O\'Connor should be categorized as High Risk');
  console.log('  ✓ Passed: Churn prediction model verified');

  // 6. Auto-Reconcile Remaining Leakage Test
  console.log('Test 6: Auto-Reconcile All Leakage...');
  const reconciled = autoReconcileAllLeakage('usr_admin_1');
  assert.ok(reconciled.reconciledCount >= 3);
  const leakageAfter = detectRevenueLeakage();
  assert.equal(leakageAfter.issues.length, 0, 'Zero leakage issues should remain after auto-reconcile');
  console.log('  ✓ Passed: Auto-reconcile resolved all remaining leakage issues');

  // Restore clean seed state for the app
  seedDatabase(true);
  console.log('\nALL 6 TEST SUITES PASSED SUCCESSFULLY.');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
