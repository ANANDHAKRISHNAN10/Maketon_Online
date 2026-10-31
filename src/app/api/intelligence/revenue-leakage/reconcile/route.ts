import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const singleType = searchParams.get("type");
    const singleId = searchParams.get("id");

    const body = await request.json().catch(() => ({}));
    const targetType = singleType || body.type;
    const targetId = singleId || body.id;

    const reconciledItems: string[] = [];

    // Run reconciliation inside Prisma transaction
    await prisma.$transaction(async (tx) => {
      // 1. Reconcile Active Subs Without Invoice
      if (!targetType || targetType === "ACTIVE_SUB_WITHOUT_INVOICE") {
        const subsToFix = targetId
          ? await tx.subscription.findMany({
              where: { id: targetId, status: "ACTIVE" },
              include: { plan: true, user: true },
            })
          : await tx.subscription.findMany({
              where: {
                status: "ACTIVE",
                invoices: { none: {} },
              },
              include: { plan: true, user: true },
            });

        for (const sub of subsToFix) {
          const subtotal = sub.plan.price;
          const tax = Math.round(subtotal * 0.18 * 100) / 100;
          const total = Math.round((subtotal + tax) * 100) / 100;

          const inv = await tx.invoice.create({
            data: {
              subscriptionId: sub.id,
              userId: sub.userId,
              amountSubtotal: subtotal,
              taxAmount: tax,
              discountAmount: 0.0,
              totalAmount: total,
              status: "CONFIRMED",
              dueDate: new Date(sub.currentPeriodEnd),
            },
          });
          reconciledItems.push(
            `Generated confirmed invoice #${inv.id.slice(0, 8)} ($${total}) for ${sub.user.email}`
          );
        }
      }

      // 2. Reconcile Duplicate Invoices
      if (!targetType || targetType === "DUPLICATE_INVOICES") {
        if (targetId) {
          await tx.invoice.update({
            where: { id: targetId },
            data: { status: "CANCELLED" },
          });
          reconciledItems.push(`Cancelled duplicate invoice #${targetId.slice(0, 8)}`);
        } else {
          const invoices = await tx.invoice.findMany({
            where: {
              status: { in: ["CONFIRMED", "DRAFT"] },
              subscriptionId: { not: null },
            },
            orderBy: { createdAt: "asc" },
          });

          const seen = new Set<string>();
          for (const inv of invoices) {
            const key = `${inv.subscriptionId}_${inv.dueDate.getFullYear()}-${inv.dueDate.getMonth() + 1}`;
            if (seen.has(key)) {
              await tx.invoice.update({
                where: { id: inv.id },
                data: { status: "CANCELLED" },
              });
              reconciledItems.push(`Cancelled duplicate invoice #${inv.id.slice(0, 8)}`);
            } else {
              seen.add(key);
            }
          }
        }
      }

      // 3. Reconcile Expired Discounts on Draft Invoices
      if (!targetType || targetType === "EXPIRED_DISCOUNT_APPLIED") {
        const drafts = targetId
          ? await tx.invoice.findMany({ where: { id: targetId, status: "DRAFT" } })
          : await tx.invoice.findMany({ where: { status: "DRAFT", discountAmount: { gt: 0 } } });

        for (const draft of drafts) {
          const subtotal = draft.amountSubtotal;
          const tax = Math.round(subtotal * 0.18 * 100) / 100;
          const total = Math.round((subtotal + tax) * 100) / 100;

          await tx.invoice.update({
            where: { id: draft.id },
            data: {
              discountAmount: 0.0,
              taxAmount: tax,
              totalAmount: total,
            },
          });
          reconciledItems.push(
            `Revoked expired discount on draft invoice #${draft.id.slice(0, 8)}. New total: $${total}`
          );
        }
      }

      // 4. Reconcile Unlinked Success Payments
      if (!targetType || targetType === "UNLINKED_SUCCESS_PAYMENT") {
        const orphanPayments = targetId
          ? await tx.payment.findMany({ where: { id: targetId, invoiceId: null, status: "SUCCESS" } })
          : await tx.payment.findMany({ where: { invoiceId: null, status: "SUCCESS" } });

        // Find open or overdue invoices to attach to, or create paid credit record
        for (const payment of orphanPayments) {
          const unpaidInvoice = await tx.invoice.findFirst({
            where: { status: { in: ["CONFIRMED", "OVERDUE"] } },
            orderBy: { dueDate: "asc" },
          });

          if (unpaidInvoice) {
            await tx.payment.update({
              where: { id: payment.id },
              data: { invoiceId: unpaidInvoice.id },
            });
            await tx.invoice.update({
              where: { id: unpaidInvoice.id },
              data: { status: "PAID" },
            });
            reconciledItems.push(
              `Matched orphaned payment #${payment.id.slice(0, 8)} ($${payment.amount}) to invoice #${unpaidInvoice.id.slice(0, 8)} and marked PAID.`
            );
          } else {
            // Create a general ledger reconciled entry
            const reconciledInv = await tx.invoice.create({
              data: {
                userId: (await tx.user.findFirst())?.id || "unknown",
                amountSubtotal: Math.round((payment.amount / 1.18) * 100) / 100,
                taxAmount: Math.round((payment.amount - payment.amount / 1.18) * 100) / 100,
                discountAmount: 0,
                totalAmount: payment.amount,
                status: "PAID",
                dueDate: payment.createdAt,
              },
            });
            await tx.payment.update({
              where: { id: payment.id },
              data: { invoiceId: reconciledInv.id },
            });
            reconciledItems.push(
              `Linked orphan payment #${payment.id.slice(0, 8)} to generated receipt invoice #${reconciledInv.id.slice(0, 8)}`
            );
          }
        }
      }

      // Log to Security/Audit log
      await tx.securityLog.create({
        data: {
          ipAddress: "127.0.0.1",
          eventType: "REVENUE_LEAKAGE",
          userAgent: "Brightloop-AutoReconcile-Engine/1.0",
          details: JSON.stringify({
            action: "AUTO_RECONCILE_REVENUE_LEAKAGES",
            targetType: targetType || "ALL",
            targetId: targetId || "ALL",
            reconciledCount: reconciledItems.length,
            reconciledItems,
            timestamp: new Date().toISOString(),
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      message: `Reconciliation completed successfully. Resolved ${reconciledItems.length} leakage issue(s).`,
      reconciledCount: reconciledItems.length,
      details: reconciledItems,
    });
  } catch (error: any) {
    console.error("Reconciliation error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to reconcile revenue leakage" },
      { status: 500 }
    );
  }
}
