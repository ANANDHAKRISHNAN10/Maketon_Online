import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { userId, action, reason } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const freezeStatus = action !== "unlock";
    const durationHours = 48;
    const lockExpiresAt = new Date(Date.now() + durationHours * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { isFrozen: freezeStatus },
      });

      const log = await tx.securityLog.create({
        data: {
          userId: user.id,
          ipAddress: user.lastLoginIp || "127.0.0.1",
          eventType: "GEO_IP_JUMP",
          userAgent: "Brightloop-Admin-Security-Console",
          details: JSON.stringify({
            action: freezeStatus ? "TRIGGER_48H_TRADE_LOCK" : "REVOKE_TRADE_LOCK",
            lockedAt: new Date().toISOString(),
            lockExpiresAt: freezeStatus ? lockExpiresAt.toISOString() : null,
            reason: reason || "Cross-continent Geo-IP Jump detected in under 1 hour. Preventative protection.",
            adminInitiated: true,
            status: freezeStatus ? "ACCOUNT_FROZEN" : "ACCOUNT_ACTIVE",
          }),
        },
      });

      return { updatedUser, log };
    });

    return NextResponse.json({
      success: true,
      message: freezeStatus
        ? `48-Hour Trade Lock active for ${user.email}. Marketplace trades, transfers, and password changes locked until ${lockExpiresAt.toLocaleString()}.`
        : `Trade lock lifted. Account ${user.email} is now fully operational.`,
      user: {
        id: result.updatedUser.id,
        email: result.updatedUser.email,
        isFrozen: result.updatedUser.isFrozen,
      },
    });
  } catch (error: any) {
    console.error("Trade lock error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to toggle trade lock" },
      { status: 500 }
    );
  }
}
