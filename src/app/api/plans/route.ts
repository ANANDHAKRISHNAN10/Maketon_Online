import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const plans = await prisma.plan.findMany({
      include: {
        subscriptions: {
          select: { id: true, status: true },
        },
      },
      orderBy: { price: "asc" },
    });

    const products = await prisma.product.findMany({
      include: {
        variants: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const discounts = await prisma.discount.findMany({
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      plans: plans.map((p) => ({
        ...p,
        activeSubscribers: p.subscriptions.filter((s) => s.status === "ACTIVE").length,
        totalSubscribers: p.subscriptions.length,
      })),
      products,
      discounts,
    });
  } catch (error: any) {
    console.error("Fetch plans error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch plans" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, billingPeriod, price, autoClose, allowPause, maxPauseDays } = body;

    if (!name || !billingPeriod || price === undefined) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (name, billingPeriod, price)" },
        { status: 400 }
      );
    }

    const plan = await prisma.plan.create({
      data: {
        name,
        billingPeriod,
        price: parseFloat(price),
        autoClose: Boolean(autoClose),
        allowPause: Boolean(allowPause),
        maxPauseDays: parseInt(maxPauseDays) || 14,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Plan '${plan.name}' created successfully.`,
      plan,
    });
  } catch (error: any) {
    console.error("Create plan error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create plan" },
      { status: 500 }
    );
  }
}
