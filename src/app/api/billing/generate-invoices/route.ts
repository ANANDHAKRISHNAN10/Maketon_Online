import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    // Look for active subscriptions whose current period ends within 3 days or already expired
    const renewalThreshold = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const eligibleSubscriptions = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        currentPeriodEnd: { lte: renewalThreshold },
      },
      include: {
        user: true,
        plan: true,
        invoices: {
          orderBy: { dueDate: "desc" },
          take: 1,
        },
      },
    });

    return NextResponse.json({
      success: true,
      count: eligibleSubscriptions.length,
      subscriptions: eligibleSubscriptions.map((s) => ({
        id: s.id,
        userEmail: s.user.email,
        planName: s.plan.name,
        price: s.plan.price,
        currentPeriodEnd: s.currentPeriodEnd,
        lastInvoiceDueDate: s.invoices[0]?.dueDate ?? null,
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to inspect renewal subscriptions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const discountCode = body.discountCode as string | undefined;
    const forceSubscriptionId = body.subscriptionId as string | undefined;

    const now = new Date();
    const renewalThreshold = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Active subscriptions due for renewal or specific subscription if requested
    const subscriptionsToInvoice = await prisma.subscription.findMany({
      where: {
        status: "ACTIVE",
        ...(forceSubscriptionId
          ? { id: forceSubscriptionId }
          : { currentPeriodEnd: { lte: renewalThreshold } }),
      },
      include: {
        plan: true,
        user: true,
        invoices: true,
      },
    });

    if (subscriptionsToInvoice.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No active subscriptions currently due for renewal invoicing.",
        invoicesGenerated: [],
      });
    }

    // Optional active discount lookup
    let activeDiscount = null;
    if (discountCode) {
      activeDiscount = await prisma.discount.findFirst({
        where: {
          code: discountCode,
          isActive: true,
          startDate: { lte: now },
          endDate: { gte: now },
          usedCount: { lt: prisma.discount.fields.maxUses },
        },
      });
    }

    const generatedInvoices = [];

    // Process each subscription inside an isolated transaction
    for (const sub of subscriptionsToInvoice) {
      const targetDueDate = new Date(sub.currentPeriodEnd);

      // DUPLICATE INVOICE PREVENTION:
      // Check if an invoice already exists for this subscription with a dueDate matching this period (within +/- 24 hours)
      const dayBefore = new Date(targetDueDate.getTime() - 24 * 60 * 60 * 1000);
      const dayAfter = new Date(targetDueDate.getTime() + 24 * 60 * 60 * 1000);

      const existingInvoice = await prisma.invoice.findFirst({
        where: {
          subscriptionId: sub.id,
          dueDate: {
            gte: dayBefore,
            lte: dayAfter,
          },
          status: { not: "CANCELLED" },
        },
      });

      if (existingInvoice) {
        console.log(
          `[Billing Engine] Skipped duplicate invoice for subscription ${sub.id}. Existing invoice: ${existingInvoice.id}`
        );
        continue;
      }

      // Calculations: Subtotal, Discount, 18% GST Tax, Total
      const subtotal = sub.plan.price;
      let discountAmount = 0.0;

      if (activeDiscount) {
        if (activeDiscount.type === "PERCENT") {
          discountAmount = (subtotal * activeDiscount.value) / 100;
        } else {
          discountAmount = Math.min(subtotal, activeDiscount.value);
        }
      }

      const taxableAmount = Math.max(0, subtotal - discountAmount);
      const taxRate = 0.18; // 18% GST
      const taxAmount = Math.round(taxableAmount * taxRate * 100) / 100;
      const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100;

      // Calculate next billing period interval
      let periodDeltaMs = 30 * 24 * 60 * 60 * 1000; // default 30 days
      if (sub.plan.billingPeriod === "DAILY") periodDeltaMs = 1 * 24 * 60 * 60 * 1000;
      if (sub.plan.billingPeriod === "WEEKLY") periodDeltaMs = 7 * 24 * 60 * 60 * 1000;
      if (sub.plan.billingPeriod === "YEARLY") periodDeltaMs = 365 * 24 * 60 * 60 * 1000;

      const nextPeriodStart = new Date(sub.currentPeriodEnd);
      const nextPeriodEnd = new Date(sub.currentPeriodEnd.getTime() + periodDeltaMs);

      // Execute invoice generation and subscription advance in atomic Prisma transaction
      const invoice = await prisma.$transaction(async (tx) => {
        const newInvoice = await tx.invoice.create({
          data: {
            subscriptionId: sub.id,
            userId: sub.userId,
            amountSubtotal: subtotal,
            discountAmount,
            taxAmount,
            totalAmount,
            status: "CONFIRMED",
            dueDate: targetDueDate,
          },
        });

        // Advance subscription period if the current period has expired
        if (sub.currentPeriodEnd <= now) {
          await tx.subscription.update({
            where: { id: sub.id },
            data: {
              currentPeriodStart: nextPeriodStart,
              currentPeriodEnd: nextPeriodEnd,
            },
          });
        }

        if (activeDiscount) {
          await tx.discount.update({
            where: { id: activeDiscount.id },
            data: { usedCount: { increment: 1 } },
          });
        }

        return newInvoice;
      });

      generatedInvoices.push({
        invoiceId: invoice.id,
        userEmail: sub.user.email,
        planName: sub.plan.name,
        amountSubtotal: invoice.amountSubtotal,
        discountAmount: invoice.discountAmount,
        taxAmount: invoice.taxAmount,
        totalAmount: invoice.totalAmount,
        status: invoice.status,
        dueDate: invoice.dueDate,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Billing cycle executed. Generated ${generatedInvoices.length} confirmed invoice(s) with 18% GST.`,
      invoicesGenerated: generatedInvoices,
    });
  } catch (error: any) {
    console.error("Billing invoice generation error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to generate billing invoices" },
      { status: 500 }
    );
  }
}
