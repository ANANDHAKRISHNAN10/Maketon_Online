import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const pauseDays = Number(body.pauseDays) || 14;

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

    if (subscription.status === "PAUSED") {
      return NextResponse.json(
        { success: false, error: "Subscription is already paused" },
        { status: 400 }
      );
    }

    if (subscription.status !== "ACTIVE") {
      return NextResponse.json(
        { success: false, error: `Cannot pause subscription with status '${subscription.status}'` },
        { status: 400 }
      );
    }

    if (!subscription.plan.allowPause) {
      return NextResponse.json(
        {
          success: false,
          error: `The plan '${subscription.plan.name}' does not allow pausing. Upgrade to Champion or Legend tier to enable pausing.`,
        },
        { status: 400 }
      );
    }

    if (pauseDays > subscription.plan.maxPauseDays) {
      return NextResponse.json(
        {
          success: false,
          error: `Requested pause duration (${pauseDays} days) exceeds the plan limit (${subscription.plan.maxPauseDays} days).`,
        },
        { status: 400 }
      );
    }

    const pauseStartDate = new Date();
    const pauseResumeDate = new Date(Date.now() + pauseDays * 24 * 60 * 60 * 1000);

    // Prisma Transaction: Atomically update subscription status and record pause window
    const updated = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.update({
        where: { id },
        data: {
          status: "PAUSED",
          pauseStartDate,
          pauseResumeDate,
        },
        include: {
          plan: true,
          user: true,
        },
      });

      // Recalculate projected period end after pause
      const projectedNewPeriodEnd = new Date(
        sub.currentPeriodEnd.getTime() + pauseDays * 24 * 60 * 60 * 1000
      );

      return {
        ...sub,
        projectedNewPeriodEnd,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Subscription paused successfully for ${pauseDays} days. Perks and billing are frozen until ${pauseResumeDate.toLocaleDateString()}.`,
      subscription: updated,
    });
  } catch (error: any) {
    console.error("Error pausing subscription:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to pause subscription" },
      { status: 500 }
    );
  }
}
