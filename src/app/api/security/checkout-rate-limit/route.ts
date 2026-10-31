import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { checkoutRateLimiter } from "@/lib/rate-limiter";

export async function GET(request: NextRequest) {
  try {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || "Unknown Client";

    const status = checkoutRateLimiter.check(ip, userAgent);
    const blockedIps = checkoutRateLimiter.getAllBlocked();

    // Fetch recent card bot attacks from DB
    const recentDbAttacks = await prisma.securityLog.findMany({
      where: { eventType: "CARD_BOT_ATTACK" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return NextResponse.json({
      success: true,
      currentIp: ip,
      rateLimitStatus: status,
      activeBlockedIps: blockedIps,
      recentAttackLogs: recentDbAttacks.map((log) => ({
        id: log.id,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        createdAt: log.createdAt,
        details: (() => {
          try {
            return JSON.parse(log.details);
          } catch {
            return log.details;
          }
        })(),
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to query rate limiter status" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const clientIp =
      body.ip ||
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = request.headers.get("user-agent") || body.userAgent || "BrightloopCheckoutClient/1.0";
    const action = body.action || "attempt"; // "attempt" | "simulate_failure" | "simulate_success" | "reset"
    const userId = body.userId || null;

    if (action === "reset") {
      checkoutRateLimiter.reset(clientIp);
      return NextResponse.json({
        success: true,
        message: `Rate limiter and failure counters reset for IP: ${clientIp}`,
      });
    }

    if (action === "simulate_success") {
      checkoutRateLimiter.recordSuccess(clientIp);
      return NextResponse.json({
        success: true,
        message: `Payment success recorded for IP: ${clientIp}. Failure counter cleared.`,
      });
    }

    if (action === "simulate_failure") {
      const failureResult = checkoutRateLimiter.recordFailure(clientIp, userAgent);

      if (failureResult.blocked) {
        // Log to database SecurityLog inside transaction
        const securityLog = await prisma.securityLog.create({
          data: {
            userId: userId,
            ipAddress: clientIp,
            userAgent: userAgent,
            eventType: "CARD_BOT_ATTACK",
            details: JSON.stringify({
              blocked: true,
              consecutiveFailedAttempts: failureResult.failedAttempts,
              mitigation: "IP blacklisted for 15 minutes by Automated Token Bucket Rate Limiter",
              timestamp: new Date().toISOString(),
              targetCardBin: body.cardBin || "411111",
              botSignature: userAgent.includes("bot") || userAgent.includes("curl") || userAgent.includes("Python"),
            }),
          },
        });

        return NextResponse.json(
          {
            success: false,
            blocked: true,
            isBotBlocked: true,
            error: "CARD_BOT_ATTACK_DETECTED: Card testing bot activity identified. IP blocked after 3 failed attempts.",
            securityLogId: securityLog.id,
            failedAttempts: failureResult.failedAttempts,
            blockedUntil: failureResult.blockedUntil,
          },
          { status: 429 }
        );
      }

      return NextResponse.json({
        success: true,
        blocked: false,
        warning: `Card verification failed (${failureResult.failedAttempts}/3 attempts before IP block).`,
        failedAttempts: failureResult.failedAttempts,
      });
    }

    // Standard checkout rate limit check
    const checkResult = checkoutRateLimiter.check(clientIp, userAgent);

    if (!checkResult.allowed) {
      if (checkResult.isBotBlocked) {
        return NextResponse.json(
          {
            success: false,
            blocked: true,
            isBotBlocked: true,
            error: checkResult.reason,
            failedAttempts: checkResult.failedAttempts,
            blockedUntil: checkResult.blockedUntil,
          },
          { status: 429 }
        );
      } else {
        return NextResponse.json(
          {
            success: false,
            blocked: true,
            isBotBlocked: false,
            error: checkResult.reason,
            remainingTokens: 0,
          },
          { status: 429 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      allowed: true,
      clientIp,
      remainingTokens: checkResult.remainingTokens,
      failedAttempts: checkResult.failedAttempts,
      message: "Checkout request authorized within rate limits.",
    });
  } catch (error: any) {
    console.error("Rate limit checkout error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Checkout rate limiter processing error" },
      { status: 500 }
    );
  }
}
