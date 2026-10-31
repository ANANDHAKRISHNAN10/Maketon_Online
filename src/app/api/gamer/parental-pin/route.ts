import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, pin, enabled, parentEmail } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    if (enabled) {
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return NextResponse.json(
          { success: false, error: "Parental PIN must be exactly 4 numeric digits (0000-9999)." },
          { status: 400 }
        );
      }

      await prisma.user.update({
        where: { id: userId },
        data: {
          parentalPinHash: pin, // In production, bcrypt hash; here plain/hashed for zero-dependency demo
          parentEmail: parentEmail || user.parentEmail || "guardian@brightloop.gg",
        },
      });

      return NextResponse.json({
        success: true,
        message: "Parental Safety Gate ENABLED! 4-digit PIN will be required for subscription renewal and purchases.",
        hasPin: true,
      });
    } else {
      // Disabling PIN
      await prisma.user.update({
        where: { id: userId },
        data: {
          parentalPinHash: null,
        },
      });

      return NextResponse.json({
        success: true,
        message: "Parental Safety Gate DISABLED. Purchases will renew automatically without PIN prompt.",
        hasPin: false,
      });
    }
  } catch (error: any) {
    console.error("Parental pin error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update parental safety gate" },
      { status: 500 }
    );
  }
}
