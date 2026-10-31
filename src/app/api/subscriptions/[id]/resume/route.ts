import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const subscription = await prisma.subscription.findUnique({
      where: { id },
      include: { plan: true, user: true },
    });

    if (!subscription) {
      return NextResponse.json(
        { success: false, error: "Subscription not found" },
        { status: 404 }
      );
    }

    if (subscription.status !== "PAUSED") {
      return NextResponse.json(
        { success: false, error: `Subscription is not paused (current status: ${subscription.status})` },
        { status: 400 }
      );
    }

    const now = new Date();
    const pauseStart = subscription.pauseStartDate || now;
    const pausedDurationMs = Math.max(0, now.getTime() - pauseStart.getTime());

    // Prisma Transaction: Atomically resume and adjust currentPeriodEnd forward
    const updated = await prisma.$transaction(async (tx) => {
      // Calculate new end date by adding the paused duration
      const adjustedPeriodEnd = new Date(
        subscription.currentPeriodEnd.getTime() + pausedDurationMs
      );

      const sub = await tx.subscription.update({
        where: { id },
        data: {
          status: "ACTIVE",
          currentPeriodEnd: adjustedPeriodEnd,
          pauseStartDate: null,
          pauseResumeDate: null,
        },
        include: {
          plan: true,
          user: true,
        },
      });

      return sub;
    });

    return NextResponse.json({
      success: true,
      message: `Subscription resumed! Expiry date extended by ${Math.ceil(pausedDurationMs / (1000 * 60 * 60 * 24))} day(s) to ${updated.currentPeriodEnd.toLocaleDateString()}.`,
      subscription: updated,
    });
  } catch (error: any) {
    console.error("Error resuming subscription:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to resume subscription" },
      { status: 500 }
    );
  }
}
