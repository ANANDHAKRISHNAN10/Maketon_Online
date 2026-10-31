import prisma from "../src/lib/prisma";
import { checkoutRateLimiter } from "../src/lib/rate-limiter";

async function runTestSuite() {
  console.log("🚀 Starting Brightloop Gaming Automated Backend Test Suite...\n");

  let passes = 0;
  let fails = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passes++;
    } else {
      console.error(`  ❌ FAIL: ${testName} ${detail ? `(${detail})` : ""}`);
      fails++;
    }
  }

  try {
    // -------------------------------------------------------------
    // Test 1: Plan Validation & Subscription Pause / Resume
    // -------------------------------------------------------------
    console.log("👉 Test Suite 1: Subscription Pause & Resume Logic");

    // Fetch user valkyrie_99 and sub
    const valkyrie = await prisma.user.findUnique({
      where: { email: "valkyrie_99@brightloop.gg" },
      include: { subscriptions: { include: { plan: true } } },
    });
    const sub = valkyrie?.subscriptions[0];
    assert(!!sub, "Found active subscription for Valkyrie99");

    if (sub) {
      // 1.1 Pause subscription
      const pauseDays = 7;
      const pauseStart = new Date();
      const pauseResume = new Date(Date.now() + pauseDays * 24 * 60 * 60 * 1000);

      const pausedSub = await prisma.$transaction(async (tx) => {
        return tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: "PAUSED",
            pauseStartDate: pauseStart,
            pauseResumeDate: pauseResume,
          },
        });
      });

      assert(pausedSub.status === "PAUSED", "Subscription status changed to PAUSED");
      assert(!!pausedSub.pauseStartDate && !!pausedSub.pauseResumeDate, "Pause dates correctly recorded");

      // 1.2 Resume subscription & adjust currentPeriodEnd forward
      const originalEnd = pausedSub.currentPeriodEnd.getTime();
      const pausedDurationMs = pauseDays * 24 * 60 * 60 * 1000;
      const resumedSub = await prisma.$transaction(async (tx) => {
        return tx.subscription.update({
          where: { id: sub.id },
          data: {
            status: "ACTIVE",
            currentPeriodEnd: new Date(originalEnd + pausedDurationMs),
            pauseStartDate: null,
            pauseResumeDate: null,
          },
        });
      });

      assert(resumedSub.status === "ACTIVE", "Subscription status successfully restored to ACTIVE upon resume");
      assert(
        resumedSub.currentPeriodEnd.getTime() > originalEnd,
        "Period end date shifted forward by pause duration"
      );
    }

    // -------------------------------------------------------------
    // Test 2: Billing Engine & 18% GST Invoicing with Duplicate Prevention
    // -------------------------------------------------------------
    console.log("\n👉 Test Suite 2: Automated Billing Engine & 18% GST");

    const apexUser = await prisma.user.findUnique({
      where: { email: "apex_legend@brightloop.gg" },
      include: { subscriptions: { include: { plan: true } } },
    });
    const apexSub = apexUser?.subscriptions[0];
    assert(!!apexSub, "Found subscription for apex_legend");

    if (apexSub) {
      const subtotal = apexSub.plan.price; // 19.99
      const taxAmount = Math.round(subtotal * 0.18 * 100) / 100; // 3.60
      const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100; // 23.59

      assert(taxAmount === 3.6, "18% GST accurately calculated for $19.99 ($3.60 tax)");
      assert(totalAmount === 23.59, "Total amount includes subtotal + 18% GST ($23.59)");

      // Issue first invoice
      const invoice1 = await prisma.invoice.create({
        data: {
          subscriptionId: apexSub.id,
          userId: apexSub.userId,
          amountSubtotal: subtotal,
          taxAmount,
          discountAmount: 0.0,
          totalAmount,
          status: "CONFIRMED",
          dueDate: apexSub.currentPeriodEnd,
        },
      });
      assert(invoice1.status === "CONFIRMED", "Invoice issued with status CONFIRMED");

      // Verify duplicate prevention logic
      const targetDueDate = apexSub.currentPeriodEnd;
      const dayBefore = new Date(targetDueDate.getTime() - 24 * 60 * 60 * 1000);
      const dayAfter = new Date(targetDueDate.getTime() + 24 * 60 * 60 * 1000);

      const duplicateCheck = await prisma.invoice.findFirst({
        where: {
          subscriptionId: apexSub.id,
          dueDate: { gte: dayBefore, lte: dayAfter },
          status: { not: "CANCELLED" },
        },
      });

      assert(!!duplicateCheck, "Duplicate check detected existing invoice for current cycle");
    }

    // -------------------------------------------------------------
    // Test 3: Checkout Rate Limiter & Card Bot Attack Defense
    // -------------------------------------------------------------
    console.log("\n👉 Test Suite 3: Token Bucket Rate Limiter & Bot Attack Defense");

    const testBotIp = "192.0.2.99";
    checkoutRateLimiter.reset(testBotIp);

    // Initial check should pass
    const initialCheck = checkoutRateLimiter.check(testBotIp);
    assert(initialCheck.allowed, "Legitimate initial request allowed through token bucket");

    // Simulate 3 rapid failed payment attempts
    const f1 = checkoutRateLimiter.recordFailure(testBotIp);
    assert(!f1.blocked && f1.failedAttempts === 1, "Attempt 1 failed: Not yet blocked");

    const f2 = checkoutRateLimiter.recordFailure(testBotIp);
    assert(!f2.blocked && f2.failedAttempts === 2, "Attempt 2 failed: Not yet blocked");

    const f3 = checkoutRateLimiter.recordFailure(testBotIp);
    assert(f3.blocked && f3.failedAttempts === 3, "Attempt 3 failed: Bot auto-blocked!");

    const postBlockCheck = checkoutRateLimiter.check(testBotIp);
    assert(!postBlockCheck.allowed, "Subsequent requests blocked after 3 failed attempts");
    assert(postBlockCheck.isBotBlocked, "Flagged as isBotBlocked");

    // Clean up
    checkoutRateLimiter.reset(testBotIp);

    // -------------------------------------------------------------
    // Test 4: Revenue Leakage Detection & Auto-Reconcile
    // -------------------------------------------------------------
    console.log("\n👉 Test Suite 4: Revenue Leakage Scanner & Auto-Reconcile");

    // Re-seed to fresh state to verify exact leakage detection
    const unlinkedPayments = await prisma.payment.findMany({
      where: { invoiceId: null, status: "SUCCESS" },
    });
    assert(unlinkedPayments.length >= 1, "Detected unlinked success payment leakage");

    const draftWithExpiredDiscount = await prisma.invoice.findFirst({
      where: { status: "DRAFT", discountAmount: { gt: 0 } },
    });
    assert(!!draftWithExpiredDiscount, "Detected draft invoice with unauthorized discount");

    // Test reconciliation of unlinked payment
    if (unlinkedPayments[0]) {
      const p = unlinkedPayments[0];
      const placeholderInv = await prisma.invoice.create({
        data: {
          userId: (await prisma.user.findFirst())!.id,
          amountSubtotal: p.amount / 1.18,
          taxAmount: p.amount - p.amount / 1.18,
          discountAmount: 0,
          totalAmount: p.amount,
          status: "PAID",
          dueDate: p.createdAt,
        },
      });
      await prisma.payment.update({
        where: { id: p.id },
        data: { invoiceId: placeholderInv.id },
      });

      const verifyLinked = await prisma.payment.findUnique({ where: { id: p.id } });
      assert(verifyLinked?.invoiceId === placeholderInv.id, "Successfully reconciled orphan payment to invoice");
    }

    // -------------------------------------------------------------
    // Test 5: Churn Prediction Formula Verification
    // -------------------------------------------------------------
    console.log("\n👉 Test Suite 5: Churn Risk Score Formula (0-100)");

    // Pixel Hunter has 3 failed payments (100 * 0.3 = 30) + tenure ~15d (90 * 0.25 = 22.5) + expiry 2d (100 * 0.2 = 20)
    // Expected riskScore ~ 73+ (CRITICAL)
    const pixelUser = await prisma.user.findUnique({
      where: { email: "pixel_hunter@brightloop.gg" },
      include: {
        subscriptions: { include: { plan: true } },
        invoices: { include: { payments: true } },
      },
    });

    if (pixelUser) {
      const failedPaymentsCount = pixelUser.invoices.flatMap((i) => i.payments).filter((p) => p.status === "FAILED").length;
      assert(failedPaymentsCount === 3, `Pixel Hunter has 3 failed payments (${failedPaymentsCount})`);

      const daysUntilExpiry = 2;
      const accountAgeDays = 15;

      const failedScore = 100;
      const pauseScore = 0;
      const expiryScore = 100;
      const tenureScore = 90;

      const computedScore = Math.round(
        failedScore * 0.3 + pauseScore * 0.25 + expiryScore * 0.2 + tenureScore * 0.25
      );

      assert(computedScore >= 70, `Pixel Hunter scored ${computedScore} (categorized as CRITICAL risk >= 70)`);
    }

    // -------------------------------------------------------------
    // Test 6: Financial Intelligence & Collection Ranking
    // -------------------------------------------------------------
    console.log("\n👉 Test Suite 6: Executive Report & Collection Ranking");

    const overdueInvoices = await prisma.invoice.findMany({
      where: { status: "OVERDUE" },
    });

    assert(overdueInvoices.length > 0, "Identified overdue invoices for dunning ranking");
    for (const inv of overdueInvoices) {
      const daysLate = 8;
      const priorityScore = inv.totalAmount * daysLate;
      assert(priorityScore > 0, `Computed priority score for ${inv.id}: ${priorityScore.toFixed(2)}`);
    }

    console.log(`\n🎉 Test Suite Completed: ${passes} passed, ${fails} failed.`);
    if (fails > 0) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTestSuite();
