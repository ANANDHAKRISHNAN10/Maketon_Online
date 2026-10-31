import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const logs = await prisma.securityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: true,
      },
    });

    const parsedLogs = logs.map((log) => {
      let parsedDetails: any = {};
      try {
        parsedDetails = JSON.parse(log.details);
      } catch {
        parsedDetails = { raw: log.details };
      }

      return {
        id: log.id,
        userId: log.userId,
        userEmail: log.user?.email || parsedDetails.userEmail || "Anonymous Visitor",
        isUserFrozen: log.user?.isFrozen ?? false,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        eventType: log.eventType,
        createdAt: log.createdAt,
        details: parsedDetails,
      };
    });

    const geoIpJumps = parsedLogs.filter((l) => l.eventType === "GEO_IP_JUMP");
    const cardBotAttacks = parsedLogs.filter((l) => l.eventType === "CARD_BOT_ATTACK");
    const revenueLeakages = parsedLogs.filter((l) => l.eventType === "REVENUE_LEAKAGE");

    return NextResponse.json({
      success: true,
      totalEvents: parsedLogs.length,
      counts: {
        geoIpJumps: geoIpJumps.length,
        cardBotAttacks: cardBotAttacks.length,
        revenueLeakages: revenueLeakages.length,
      },
      geoIpJumps,
      cardBotAttacks,
      allLogs: parsedLogs,
    });
  } catch (error: any) {
    console.error("Fetch security logs error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch security logs" },
      { status: 500 }
    );
  }
}
