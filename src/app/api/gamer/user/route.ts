import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const requestedEmail = searchParams.get("email");
    const requestedId = searchParams.get("id");

    const allGamers = await prisma.user.findMany({
      where: { role: "GAMER" },
      select: {
        id: true,
        email: true,
        role: true,
        isFrozen: true,
        parentEmail: true,
        parentalPinHash: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    let currentGamer = null;
    if (requestedEmail) {
      currentGamer = await prisma.user.findUnique({
        where: { email: requestedEmail },
        include: {
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: "desc" },
          },
          invoices: {
            include: { payments: true, subscription: { include: { plan: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    } else if (requestedId) {
      currentGamer = await prisma.user.findUnique({
        where: { id: requestedId },
        include: {
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: "desc" },
          },
          invoices: {
            include: { payments: true, subscription: { include: { plan: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    }

    // Default to the first gamer (e.g. valkyrie_99) if not specified or found
    if (!currentGamer && allGamers.length > 0) {
      currentGamer = await prisma.user.findUnique({
        where: { id: allGamers[0].id },
        include: {
          subscriptions: {
            include: { plan: true },
            orderBy: { createdAt: "desc" },
          },
          invoices: {
            include: { payments: true, subscription: { include: { plan: true } } },
            orderBy: { createdAt: "desc" },
          },
        },
      });
    }

    if (!currentGamer) {
      return NextResponse.json(
        { success: false, error: "No gamer accounts found in database" },
        { status: 404 }
      );
    }

    const activeSubscription = currentGamer.subscriptions[0] || null;

    // Calculate perks expiration countdown
    let msUntilExpiry = 0;
    if (activeSubscription) {
      msUntilExpiry = Math.max(0, activeSubscription.currentPeriodEnd.getTime() - Date.now());
    }

    return NextResponse.json({
      success: true,
      gamersList: allGamers.map((g) => ({
        id: g.id,
        email: g.email,
        isFrozen: g.isFrozen,
        hasParentalPin: Boolean(g.parentalPinHash),
      })),
      currentUser: {
        id: currentGamer.id,
        email: currentGamer.email,
        role: currentGamer.role,
        isFrozen: currentGamer.isFrozen,
        hasParentalPin: Boolean(currentGamer.parentalPinHash),
        parentEmail: currentGamer.parentEmail,
        createdAt: currentGamer.createdAt,
      },
      activeSubscription: activeSubscription
        ? {
            ...activeSubscription,
            msUntilExpiry,
            isPaused: activeSubscription.status === "PAUSED",
            perksStatus:
              currentGamer.isFrozen
                ? "FROZEN_SECURITY_LOCK"
                : activeSubscription.status === "PAUSED"
                ? "PAUSED_FROZEN"
                : activeSubscription.status === "ACTIVE"
                ? "UNLOCKED_ACTIVE"
                : "INACTIVE",
          }
        : null,
      allSubscriptions: currentGamer.subscriptions,
      invoices: currentGamer.invoices,
    });
  } catch (error: any) {
    console.error("Fetch gamer error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch gamer profile" },
      { status: 500 }
    );
  }
}
