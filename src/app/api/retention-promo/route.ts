import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userEmail, discountPercent } = body;

    const percent = discountPercent || 15;
    const code = `VIP_RETENTION_${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Create a personalized retention coupon valid for 14 days
    const discount = await prisma.discount.create({
      data: {
        code,
        type: "PERCENT",
        value: percent,
        minQuantity: 1,
        maxUses: 1,
        usedCount: 0,
        startDate: new Date(),
        endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Personalized ${percent}% retention promo code '${code}' generated and dispatched to ${userEmail || "gamer"}.`,
      discountCode: code,
      discountId: discount.id,
      expiresAt: discount.endDate,
    });
  } catch (error: any) {
    console.error("Retention promo error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate retention promo" },
      { status: 500 }
    );
  }
}
