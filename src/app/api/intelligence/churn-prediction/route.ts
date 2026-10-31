import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const gamers = await prisma.user.findMany({
      where: { role: "GAMER" },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { createdAt: "desc" },
        },
        invoices: {
          include: { payments: true },
        },
      },
    });

    const now = Date.now();

    const predictions = gamers.map((gamer) => {
      // 1. Prior failed payments factor (30%)
      const allPayments = gamer.invoices.flatMap((inv) => inv.payments);
      const failedPaymentsCount = allPayments.filter(
        (p) => p.status === "FAILED" || p.status === "CHARGEBACK"
      ).length;

      let failedScore = 0;
      if (failedPaymentsCount >= 3) failedScore = 100;
      else if (failedPaymentsCount === 2) failedScore = 70;
      else if (failedPaymentsCount === 1) failedScore = 40;

      // 2. Pause frequency factor (25%)
      const activeOrRecentSub = gamer.subscriptions[0];
      const isPaused = activeOrRecentSub?.status === "PAUSED";
      const hasPauseHistory = Boolean(activeOrRecentSub?.pauseStartDate || isPaused);

      let pauseScore = 0;
      if (isPaused) pauseScore = 95;
      else if (hasPauseHistory) pauseScore = 55;

      // 3. Days to expiry factor (20%)
      let daysUntilExpiry = 30;
      let expiryScore = 15;
      if (activeOrRecentSub) {
        const diffMs = activeOrRecentSub.currentPeriodEnd.getTime() - now;
        daysUntilExpiry = Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));

        if (daysUntilExpiry <= 2) expiryScore = 100;
        else if (daysUntilExpiry <= 5) expiryScore = 75;
        else if (daysUntilExpiry <= 10) expiryScore = 50;
        else if (daysUntilExpiry <= 20) expiryScore = 25;
        else expiryScore = 10;
      }

      // 4. Account tenure factor (25%) - Newer accounts churn at much higher rates
      const accountAgeDays = Math.max(
        1,
        Math.round((now - gamer.createdAt.getTime()) / (1000 * 60 * 60 * 24))
      );

      let tenureScore = 10;
      if (accountAgeDays <= 20) tenureScore = 90;
      else if (accountAgeDays <= 60) tenureScore = 55;
      else if (accountAgeDays <= 120) tenureScore = 30;
      else tenureScore = 10;

      // Composite Weighted Risk Score (0-100)
      const rawScore =
        failedScore * 0.3 +
        pauseScore * 0.25 +
        expiryScore * 0.2 +
        tenureScore * 0.25;

      const riskScore = Math.min(100, Math.max(0, Math.round(rawScore)));

      let riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
      let recommendation = "Standard engagement cycle.";

      if (riskScore >= 70) {
        riskLevel = "CRITICAL";
        recommendation =
          "Send 15% VIP Retention Promo and trigger card update reminder.";
      } else if (riskScore >= 50) {
        riskLevel = "HIGH";
        recommendation = "Offer 7-day bonus booster or Battlepass XP multiplier.";
      } else if (riskScore >= 30) {
        riskLevel = "MEDIUM";
        recommendation = "Include in weekly gaming patch digest.";
      }

      return {
        userId: gamer.id,
        email: gamer.email,
        riskScore,
        riskLevel,
        currentPlan: activeOrRecentSub?.plan.name || "No Active Plan",
        status: activeOrRecentSub?.status || "INACTIVE",
        breakdown: {
          failedPaymentsFactor: Math.round(failedScore * 0.3),
          pauseFrequencyFactor: Math.round(pauseScore * 0.25),
          daysToExpiryFactor: Math.round(expiryScore * 0.2),
          accountTenureFactor: Math.round(tenureScore * 0.25),
        },
        metrics: {
          failedPaymentsCount,
          isPaused,
          daysUntilExpiry,
          accountAgeDays,
        },
        recommendation,
      };
    });

    // Sort by risk score descending
    predictions.sort((a, b) => b.riskScore - a.riskScore);

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      gamersScored: predictions.length,
      averageRiskScore: Math.round(
        predictions.reduce((acc, p) => acc + p.riskScore, 0) / (predictions.length || 1)
      ),
      highRiskCount: predictions.filter((p) => p.riskScore >= 50).length,
      predictions,
    });
  } catch (error: any) {
    console.error("Churn prediction error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to calculate churn predictions" },
      { status: 500 }
    );
  }
}
