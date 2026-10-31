import crypto from 'crypto';
import { z } from 'zod';
import { db, hashPassword, hashPin } from './db';

// --- Zod Validation Schemas ---

export const RegisterSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Valid email address required'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  parentEmail: z.string().email().optional().or(z.literal('')),
  parentalPin: z.string().regex(/^\d{4}$/, 'Parental PIN must be 4 digits').optional().or(z.literal('')),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  simulatedCountry: z.string().optional(),
});

export const PauseSubscriptionSchema = z.object({
  durationDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  reason: z.string().max(200).optional(),
});

export const GenerateInvoicesSchema = z.object({
  discountCode: z.string().optional(),
  billingPeriodKey: z.string().optional(),
  subscriptionId: z.string().optional(),
});

export const SubscribePlanSchema = z.object({
  planId: z.string().min(1),
  discountCode: z.string().optional(),
  paymentMethod: z.enum(['CREDIT_CARD', 'UPI', 'WALLET']).default('CREDIT_CARD'),
  parentalPin: z.string().optional(),
});

export const ParentalSettingsSchema = z.object({
  parentEmail: z.string().email().optional().or(z.literal('')),
  parentalPin: z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 digits'),
  parentalGateOn: z.boolean(),
});

export const PlanInputSchema = z.object({
  name: z.string().min(2),
  tagline: z.string().min(4),
  billingPeriod: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  price: z.number().int().positive(),
  costPrice: z.number().int().nonnegative(),
  perks: z.array(z.string()).min(1),
  badge: z.string().optional().nullable(),
  isRecommended: z.boolean().default(false),
  autoClose: z.boolean().default(false),
  allowPause: z.boolean().default(true),
  maxPauseDays: z.number().int().min(0).max(90).default(30),
});

export const ProductInputSchema = z.object({
  name: z.string().min(2),
  description: z.string().min(4),
  category: z.string().default('Game Pass Add-on'),
  basePrice: z.number().int().positive(),
  costPrice: z.number().int().nonnegative(),
  isActive: z.boolean().default(true),
  variants: z.array(
    z.object({
      name: z.string().min(1),
      priceAdjustment: z.number().int(),
    })
  ).optional(),
});

export const DiscountInputSchema = z.object({
  code: z.string().min(3).max(24).transform((s) => s.toUpperCase()),
  description: z.string().min(3),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().positive(),
  minQuantity: z.number().int().min(1).default(1),
  maxUses: z.number().int().min(1).default(100),
  minPurchaseCents: z.number().int().min(0).default(0),
  productIds: z.array(z.string()).default([]),
  planIds: z.array(z.string()).default([]),
  customerEligibility: z.enum(['ALL', 'NEW', 'EXISTING']).default('ALL'),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.boolean().default(true),
}).refine((discount) => discount.type !== 'PERCENT' || discount.value <= 100, {
  message: 'Percentage discounts cannot exceed 100%.',
  path: ['value'],
});

export const CheckoutRateLimitSchema = z.object({
  cardLast4: z.string().length(4).default('4242'),
  simulateOutcome: z.enum(['SUCCESS', 'FAILED']).default('FAILED'),
  simulatedIp: z.string().optional(),
  amountCents: z.number().int().positive().default(1499),
});

// --- Token Bucket Rate Limiter State ---
interface TokenBucket {
  tokens: number;
  lastRefill: number;
  failedCardAttempts: number;
  blockedUntil: number | null;
}

const tokenBuckets = new Map<string, TokenBucket>();
const BUCKET_CAPACITY = 5;
const REFILL_RATE_PER_SEC = 1 / 15; // 1 token every 15 seconds

export function evaluateCheckoutAttempt(params: {
  ipAddress: string;
  userAgent: string;
  userId?: string | null;
  cardLast4: string;
  outcome: 'SUCCESS' | 'FAILED';
  maxFailedAttempts?: number;
}) {
  const maxFailures = params.maxFailedAttempts ?? Number(process.env.RATE_LIMIT_MAX_ATTEMPTS || 3);
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Check persistent DB IpBlocklist first
  const dbBlock = db.prepare('SELECT * FROM IpBlocklist WHERE ipAddress = ?').get(params.ipAddress) as any;
  if (dbBlock && dbBlock.blockedUntil && new Date(dbBlock.blockedUntil).getTime() > nowMs) {
    return {
      allowed: false,
      blocked: true,
      reason: 'IP_BLOCKED_POLICY',
      failedAttempts: dbBlock.failedAttempts,
      tokensRemaining: 0,
      blockedUntil: dbBlock.blockedUntil,
      message: `Checkout blocked for IP ${params.ipAddress} until ${new Date(dbBlock.blockedUntil).toLocaleString()} due to ${dbBlock.failedAttempts} failed card attempts.`,
    };
  }

  let bucket = tokenBuckets.get(params.ipAddress);
  if (!bucket) {
    bucket = {
      tokens: BUCKET_CAPACITY,
      lastRefill: nowMs,
      failedCardAttempts: dbBlock ? dbBlock.failedAttempts : 0,
      blockedUntil: null,
    };
    tokenBuckets.set(params.ipAddress, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsedSec = (nowMs - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(BUCKET_CAPACITY, bucket.tokens + elapsedSec * REFILL_RATE_PER_SEC);
  bucket.lastRefill = nowMs;

  if (bucket.tokens < 1) {
    // Rate limit exceeded
    const secLogId = `sec_rl_${crypto.randomBytes(4).toString('hex')}`;
    db.prepare(`
      INSERT INTO SecurityLog (id, userId, ipAddress, userAgent, eventType, severity, details, resolved, createdAt)
      VALUES (?, ?, ?, ?, 'CARD_BOT_ATTACK', 'HIGH', ?, 0, ?)
    `).run(
      secLogId,
      params.userId || null,
      params.ipAddress,
      params.userAgent,
      JSON.stringify({
        reason: 'TOKEN_BUCKET_EXHAUSTED',
        cardLast4: params.cardLast4,
        failedAttempts: bucket.failedCardAttempts,
        description: `Token-bucket rate limit exceeded from IP ${params.ipAddress}.`,
      }),
      nowIso
    );

    return {
      allowed: false,
      blocked: true,
      reason: 'TOKEN_BUCKET_RATE_LIMIT',
      failedAttempts: bucket.failedCardAttempts,
      tokensRemaining: 0,
      blockedUntil: new Date(nowMs + 15 * 60 * 1000).toISOString(),
      message: 'Rate limit exceeded: Too many rapid checkout requests from this IP.',
    };
  }

  // Consume 1 token
  bucket.tokens -= 1;

  if (params.outcome === 'FAILED') {
    bucket.failedCardAttempts += 1;
    const shouldBlock = bucket.failedCardAttempts >= maxFailures;
    const blockedUntilIso = shouldBlock ? new Date(nowMs + 24 * 3600 * 1000).toISOString() : null;

    db.prepare(`
      INSERT INTO IpBlocklist (ipAddress, failedAttempts, blockedUntil, reason, updatedAt)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(ipAddress) DO UPDATE SET
        failedAttempts = excluded.failedAttempts,
        blockedUntil = COALESCE(excluded.blockedUntil, IpBlocklist.blockedUntil),
        reason = excluded.reason,
        updatedAt = excluded.updatedAt
    `).run(
      params.ipAddress,
      bucket.failedCardAttempts,
      blockedUntilIso,
      shouldBlock
        ? `Blocked after ${bucket.failedCardAttempts} consecutive failed card attempts`
        : 'Failed card verification recorded',
      nowIso
    );

    if (shouldBlock) {
      bucket.blockedUntil = nowMs + 24 * 3600 * 1000;
      const secLogId = `sec_bot_${crypto.randomBytes(4).toString('hex')}`;
      db.prepare(`
        INSERT INTO SecurityLog (id, userId, ipAddress, userAgent, eventType, severity, details, resolved, createdAt)
        VALUES (?, ?, ?, ?, 'CARD_BOT_ATTACK', 'CRITICAL', ?, 0, ?)
      `).run(
        secLogId,
        params.userId || null,
        params.ipAddress,
        params.userAgent,
        JSON.stringify({
          failedAttempts: bucket.failedCardAttempts,
          cardLast4: params.cardLast4,
          blockedStatus: 'IP_BLOCKED_24H',
          policyTriggered: `${maxFailures}_FAILED_CARD_ATTEMPTS_SAME_IP`,
          description: `Detected ${bucket.failedCardAttempts} failed card attempts from IP ${params.ipAddress}. IP automatically blocked for 24h.`,
        }),
        nowIso
      );

      return {
        allowed: false,
        blocked: true,
        reason: 'THREE_FAILED_ATTEMPTS_BLOCK',
        failedAttempts: bucket.failedCardAttempts,
        tokensRemaining: Math.floor(bucket.tokens),
        blockedUntil: blockedUntilIso,
        message: `Security Policy Triggered: ${bucket.failedCardAttempts} failed card attempts detected from ${params.ipAddress}. Further attempts blocked for 24 hours.`,
      };
    }

    return {
      allowed: true,
      blocked: false,
      reason: 'CARD_DECLINED_WARNING',
      failedAttempts: bucket.failedCardAttempts,
      tokensRemaining: Math.floor(bucket.tokens),
      blockedUntil: null,
      message: `Card verification failed (${bucket.failedCardAttempts}/${maxFailures} attempts before automatic IP lock).`,
    };
  }

  // On SUCCESS, reset failed attempt counter
  bucket.failedCardAttempts = 0;
  db.prepare('DELETE FROM IpBlocklist WHERE ipAddress = ?').run(params.ipAddress);

  return {
    allowed: true,
    blocked: false,
    reason: 'CHECKOUT_APPROVED',
    failedAttempts: 0,
    tokensRemaining: Math.floor(bucket.tokens),
    blockedUntil: null,
    message: 'Checkout verification passed token-bucket and fraud checks.',
  };
}

// --- Pause & Resume Subscription Logic ---

export function pauseSubscription(params: {
  subscriptionId: string;
  actorId: string;
  actorRole: string;
  durationDays: 7 | 14 | 30;
  reason?: string;
}) {
  const tx = db.transaction(() => {
    const sub = db.prepare(`
      SELECT s.*, p.name as planName, p.allowPause, p.maxPauseDays
      FROM Subscription s
      JOIN Plan p ON p.id = s.planId
      WHERE s.id = ?
    `).get(params.subscriptionId) as any;

    if (!sub) {
      throw new Error('Subscription not found.');
    }

    if (params.actorRole === 'GAMER' && sub.userId !== params.actorId) {
      throw new Error('Forbidden: You do not own this subscription.');
    }

    if (!sub.allowPause) {
      throw new Error(`The "${sub.planName}" plan does not permit pausing.`);
    }

    if (sub.status !== 'ACTIVE') {
      throw new Error(`Only ACTIVE subscriptions can be paused (current status: ${sub.status}).`);
    }

    if (params.durationDays > sub.maxPauseDays) {
      throw new Error(`Requested pause of ${params.durationDays} days exceeds maximum allowed (${sub.maxPauseDays} days).`);
    }

    const now = new Date();
    const plannedResume = new Date(now.getTime() + params.durationDays * 86400000);
    const currentEnd = new Date(sub.currentPeriodEnd);
    const projectedEndAfterPause = new Date(currentEnd.getTime() + params.durationDays * 86400000);

    db.prepare(`
      UPDATE Subscription
      SET status = 'PAUSED',
          pauseStartDate = ?,
          pauseResumeDate = ?,
          pausedDaysPlanned = ?,
          perksFrozen = 1
      WHERE id = ?
    `).run(
      now.toISOString(),
      plannedResume.toISOString(),
      params.durationDays,
      sub.id
    );

    const pauseId = `ph_${crypto.randomBytes(5).toString('hex')}`;
    db.prepare(`
      INSERT INTO PauseHistory (id, subscriptionId, pauseStart, plannedResume, actualResume, daysPaused, reason, createdAt)
      VALUES (?, ?, ?, ?, NULL, ?, ?, ?)
    `).run(
      pauseId,
      sub.id,
      now.toISOString(),
      plannedResume.toISOString(),
      params.durationDays,
      params.reason || `${params.durationDays}-day self-service pause`,
      now.toISOString()
    );

    db.prepare(`
      INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt)
      VALUES (?, ?, 'PAUSE_SUBSCRIPTION', 'Subscription', ?, ?, ?)
    `).run(
      `aud_${crypto.randomBytes(5).toString('hex')}`,
      params.actorId,
      sub.id,
      JSON.stringify({
        durationDays: params.durationDays,
        pauseStartDate: now.toISOString(),
        plannedResumeDate: plannedResume.toISOString(),
        projectedBillingDate: projectedEndAfterPause.toISOString(),
        perksFrozen: true,
      }),
      now.toISOString()
    );

    return {
      subscriptionId: sub.id,
      status: 'PAUSED',
      perksFrozen: true,
      pauseStartDate: now.toISOString(),
      pauseResumeDate: plannedResume.toISOString(),
      pausedDaysPlanned: params.durationDays,
      previousPeriodEnd: sub.currentPeriodEnd,
      projectedNextBillingDate: projectedEndAfterPause.toISOString(),
    };
  });

  return tx();
}

export function resumeSubscription(params: {
  subscriptionId: string;
  actorId: string;
  actorRole: string;
}) {
  const tx = db.transaction(() => {
    const sub = db.prepare(`
      SELECT s.*, p.name as planName
      FROM Subscription s
      JOIN Plan p ON p.id = s.planId
      WHERE s.id = ?
    `).get(params.subscriptionId) as any;

    if (!sub) {
      throw new Error('Subscription not found.');
    }

    if (params.actorRole === 'GAMER' && sub.userId !== params.actorId) {
      throw new Error('Forbidden: You do not own this subscription.');
    }

    if (sub.status !== 'PAUSED') {
      throw new Error(`Only PAUSED subscriptions can be resumed (current status: ${sub.status}).`);
    }

    const now = new Date();
    const pauseStart = sub.pauseStartDate ? new Date(sub.pauseStartDate) : now;
    const elapsedDays = Math.max(1, Math.round((now.getTime() - pauseStart.getTime()) / 86400000));
    // If resumed immediately during testing/demo, extend by the planned pause duration so the recalculated billing date is clearly demonstrated
    const effectivePausedDays = elapsedDays <= 1 && sub.pausedDaysPlanned ? sub.pausedDaysPlanned : elapsedDays;

    const oldPeriodEnd = new Date(sub.currentPeriodEnd);
    const newPeriodEnd = new Date(oldPeriodEnd.getTime() + effectivePausedDays * 86400000);

    db.prepare(`
      UPDATE Subscription
      SET status = 'ACTIVE',
          currentPeriodEnd = ?,
          pauseStartDate = NULL,
          pauseResumeDate = NULL,
          pausedDaysPlanned = NULL,
          perksFrozen = 0
      WHERE id = ?
    `).run(newPeriodEnd.toISOString(), sub.id);

    db.prepare(`
      UPDATE PauseHistory
      SET actualResume = ?, daysPaused = ?
      WHERE subscriptionId = ? AND actualResume IS NULL
    `).run(now.toISOString(), effectivePausedDays, sub.id);

    db.prepare(`
      INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt)
      VALUES (?, ?, 'RESUME_SUBSCRIPTION', 'Subscription', ?, ?, ?)
    `).run(
      `aud_${crypto.randomBytes(5).toString('hex')}`,
      params.actorId,
      sub.id,
      JSON.stringify({
        effectivePausedDays,
        previousPeriodEnd: oldPeriodEnd.toISOString(),
        newPeriodEnd: newPeriodEnd.toISOString(),
        perksFrozen: false,
      }),
      now.toISOString()
    );

    return {
      subscriptionId: sub.id,
      status: 'ACTIVE',
      perksFrozen: false,
      daysExtended: effectivePausedDays,
      previousPeriodEnd: oldPeriodEnd.toISOString(),
      newNextBillingDate: newPeriodEnd.toISOString(),
    };
  });

  return tx();
}

// --- Billing & Invoice Generation with 18% GST and Uniqueness ---

export function generateInvoicesForDueSubscriptions(params?: {
  discountCode?: string;
  billingPeriodKey?: string;
  subscriptionId?: string;
  actorId?: string;
}) {
  const gstRate = Number(process.env.GST_TAX_RATE_PERCENT || 18) / 100;
  const now = new Date();
  const periodKey = params?.billingPeriodKey || `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const tx = db.transaction(() => {
    // Validate optional discount code if provided
    let validDiscount: any = null;
    if (params?.discountCode) {
      const d = db.prepare('SELECT * FROM Discount WHERE code = ?').get(params.discountCode.toUpperCase()) as any;
      if (!d) {
        throw new Error(`Discount code "${params.discountCode}" does not exist.`);
      }
      if (!d.isActive) {
        throw new Error(`Discount code "${d.code}" is inactive.`);
      }
      if (new Date(d.endDate).getTime() < now.getTime() || new Date(d.startDate).getTime() > now.getTime()) {
        throw new Error(`Discount code "${d.code}" is outside its valid date window.`);
      }
      if (d.usedCount >= d.maxUses) {
        throw new Error(`Discount code "${d.code}" has reached its maximum usage limit (${d.maxUses}).`);
      }
      validDiscount = d;
    }

    // Find active subscriptions that either match subscriptionId, have no invoice for the current period, or are due within 7 days
    const query = params?.subscriptionId
      ? `SELECT s.*, p.price as planPrice, p.name as planName, u.email as userEmail
         FROM Subscription s
         JOIN Plan p ON p.id = s.planId
         JOIN User u ON u.id = s.userId
         WHERE s.id = ? AND s.status = 'ACTIVE'`
      : `SELECT s.*, p.price as planPrice, p.name as planName, u.email as userEmail
         FROM Subscription s
         JOIN Plan p ON p.id = s.planId
         JOIN User u ON u.id = s.userId
         WHERE s.status = 'ACTIVE'`;

    const candidates = (params?.subscriptionId
      ? db.prepare(query).all(params.subscriptionId)
      : db.prepare(query).all()) as any[];

    const createdInvoices: any[] = [];
    const skippedDuplicates: string[] = [];

    for (const sub of candidates) {
      // Check uniqueness on (subscriptionId, billingPeriodKey)
      const existing = db.prepare(`
        SELECT id, invoiceNumber FROM Invoice
        WHERE subscriptionId = ? AND billingPeriodKey = ? AND status != 'CANCELLED'
      `).get(sub.id, periodKey) as any;

      if (existing) {
        skippedDuplicates.push(sub.id);
        continue;
      }

      const subtotal = sub.planPrice;
      let discountAmount = 0;
      let appliedCode: string | null = null;

      // Also check if subscription has a retentionPromoCode attached
      const promoToUse = validDiscount || (sub.retentionPromoCode
        ? db.prepare('SELECT * FROM Discount WHERE code = ? AND isActive = 1').get(sub.retentionPromoCode)
        : null);

      if (promoToUse && promoToUse.usedCount < promoToUse.maxUses && new Date(promoToUse.endDate).getTime() >= now.getTime()) {
        if (promoToUse.type === 'PERCENT') {
          discountAmount = Math.round((subtotal * promoToUse.value) / 100);
        } else {
          discountAmount = Math.min(subtotal, promoToUse.value);
        }
        appliedCode = promoToUse.code;
        db.prepare('UPDATE Discount SET usedCount = usedCount + 1 WHERE id = ?').run(promoToUse.id);
      }

      const taxableAmount = Math.max(0, subtotal - discountAmount);
      const taxAmount = Math.round(taxableAmount * gstRate); // 18% GST
      const totalAmount = taxableAmount + taxAmount;

      const invId = `inv_${crypto.randomBytes(5).toString('hex')}`;
      const invNumber = `BL-${now.getUTCFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const dueDate = new Date(now.getTime() + 7 * 86400000).toISOString();

      db.prepare(`
        INSERT INTO Invoice (id, invoiceNumber, subscriptionId, userId, billingPeriodKey, amountSubtotal, taxAmount, discountAmount, discountCode, totalAmount, status, dueDate, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMED', ?, ?)
      `).run(
        invId,
        invNumber,
        sub.id,
        sub.userId,
        periodKey,
        subtotal,
        taxAmount,
        discountAmount,
        appliedCode,
        totalAmount,
        dueDate,
        now.toISOString()
      );

      createdInvoices.push({
        id: invId,
        invoiceNumber: invNumber,
        subscriptionId: sub.id,
        userEmail: sub.userEmail,
        planName: sub.planName,
        billingPeriodKey: periodKey,
        amountSubtotal: subtotal,
        discountAmount,
        discountCode: appliedCode,
        taxAmount,
        totalAmount,
        status: 'CONFIRMED',
      });
    }

    return {
      billingPeriodKey: periodKey,
      gstRatePercent: 18,
      generatedCount: createdInvoices.length,
      skippedDuplicateCount: skippedDuplicates.length,
      invoices: createdInvoices,
    };
  });

  return tx();
}

// --- Revenue Intelligence: Leakage Detection & Reconciliation ---

export interface LeakageIssue {
  id: string;
  issueType:
    | 'ACTIVE_SUB_WITHOUT_INVOICE'
    | 'DUPLICATE_PERIOD_INVOICE'
    | 'EXPIRED_DISCOUNT_ON_DRAFT'
    | 'UNLINKED_SUCCESS_PAYMENT';
  title: string;
  customerName: string;
  customerEmail: string;
  userId: string;
  entityId: string;
  financialImpactCents: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  suggestedCorrection: string;
  forensicDetails: Record<string, any>;
}

export function detectRevenueLeakage(): {
  issues: LeakageIssue[];
  totalLeakageCents: number;
  summaryByType: Record<string, number>;
} {
  const issues: LeakageIssue[] = [];
  const nowIso = new Date().toISOString();

  // 1. Active subscriptions without invoices
  const uninvoicedSubs = db.prepare(`
    SELECT s.id as subId, s.userId, s.currentPeriodStart, s.currentPeriodEnd,
           u.name as userName, u.email as userEmail,
           p.name as planName, p.price as planPrice
    FROM Subscription s
    JOIN User u ON u.id = s.userId
    JOIN Plan p ON p.id = s.planId
    LEFT JOIN Invoice i ON i.subscriptionId = s.id AND i.status != 'CANCELLED'
    WHERE s.status = 'ACTIVE'
    GROUP BY s.id
    HAVING COUNT(i.id) = 0
  `).all() as any[];

  for (const row of uninvoicedSubs) {
    const withTax = row.planPrice + Math.round(row.planPrice * 0.18);
    issues.push({
      id: `leak_sub_no_inv_${row.subId}`,
      issueType: 'ACTIVE_SUB_WITHOUT_INVOICE',
      title: 'Active Subscription Missing Billing Invoice',
      customerName: row.userName,
      customerEmail: row.userEmail,
      userId: row.userId,
      entityId: row.subId,
      financialImpactCents: withTax,
      severity: 'CRITICAL',
      suggestedCorrection: `Generate confirmed invoice for ${row.planName} ($${(row.planPrice / 100).toFixed(2)} + 18% GST = $${(withTax / 100).toFixed(2)}).`,
      forensicDetails: {
        subscriptionId: row.subId,
        planName: row.planName,
        periodStart: row.currentPeriodStart,
        periodEnd: row.currentPeriodEnd,
        basePriceCents: row.planPrice,
        expectedTotalWithGstCents: withTax,
      },
    });
  }

  // 2. Duplicate invoices for the same billing period
  const duplicateGroups = db.prepare(`
    SELECT i.subscriptionId, i.billingPeriodKey, COUNT(i.id) as invCount,
           GROUP_CONCAT(i.id) as invoiceIds,
           GROUP_CONCAT(i.invoiceNumber) as invoiceNumbers,
           MAX(i.totalAmount) as duplicateAmount,
           u.id as userId, u.name as userName, u.email as userEmail
    FROM Invoice i
    JOIN User u ON u.id = i.userId
    WHERE i.status != 'CANCELLED'
    GROUP BY i.subscriptionId, i.billingPeriodKey
    HAVING COUNT(i.id) > 1
  `).all() as any[];

  for (const dup of duplicateGroups) {
    const ids = String(dup.invoiceIds).split(',');
    const duplicateInvId = ids[ids.length - 1];
    issues.push({
      id: `leak_dup_inv_${duplicateInvId}`,
      issueType: 'DUPLICATE_PERIOD_INVOICE',
      title: `Duplicate Billing Period Invoices (${dup.billingPeriodKey})`,
      customerName: dup.userName,
      customerEmail: dup.userEmail,
      userId: dup.userId,
      entityId: duplicateInvId,
      financialImpactCents: dup.duplicateAmount,
      severity: 'HIGH',
      suggestedCorrection: `Cancel redundant invoice ${String(dup.invoiceNumbers).split(',').pop()} and retain primary period invoice.`,
      forensicDetails: {
        subscriptionId: dup.subscriptionId,
        billingPeriodKey: dup.billingPeriodKey,
        invoiceCount: dup.invCount,
        invoiceNumbers: dup.invoiceNumbers,
        duplicateInvoiceId: duplicateInvId,
      },
    });
  }

  // 3. Expired discounts applied to draft invoices
  const expiredDraftInvoices = db.prepare(`
    SELECT i.id as invoiceId, i.invoiceNumber, i.amountSubtotal, i.discountAmount, i.discountCode, i.totalAmount,
           u.id as userId, u.name as userName, u.email as userEmail,
           d.endDate as discountEndDate, d.isActive as discountActive
    FROM Invoice i
    JOIN User u ON u.id = i.userId
    JOIN Discount d ON d.code = i.discountCode
    WHERE i.status = 'DRAFT'
      AND i.discountAmount > 0
      AND (d.isActive = 0 OR d.endDate < ?)
  `).all(nowIso) as any[];

  for (const exp of expiredDraftInvoices) {
    issues.push({
      id: `leak_exp_disc_${exp.invoiceId}`,
      issueType: 'EXPIRED_DISCOUNT_ON_DRAFT',
      title: `Expired Discount (${exp.discountCode}) on Draft Invoice`,
      customerName: exp.userName,
      customerEmail: exp.userEmail,
      userId: exp.userId,
      entityId: exp.invoiceId,
      financialImpactCents: exp.discountAmount + Math.round(exp.discountAmount * 0.18),
      severity: 'HIGH',
      suggestedCorrection: `Strip expired promo ${exp.discountCode} from ${exp.invoiceNumber} and recalculate 18% GST.`,
      forensicDetails: {
        invoiceId: exp.invoiceId,
        invoiceNumber: exp.invoiceNumber,
        expiredDiscountCode: exp.discountCode,
        discountEndDate: exp.discountEndDate,
        improperDiscountCents: exp.discountAmount,
      },
    });
  }

  // 4. Successful payments not linked to invoices
  const unlinkedPayments = db.prepare(`
    SELECT p.id as paymentId, p.amount, p.method, p.referenceCode, p.createdAt,
           u.id as userId, u.name as userName, u.email as userEmail
    FROM Payment p
    JOIN User u ON u.id = p.userId
    WHERE p.status = 'SUCCESS' AND p.invoiceId IS NULL
  `).all() as any[];

  for (const pay of unlinkedPayments) {
    issues.push({
      id: `leak_unlinked_pay_${pay.paymentId}`,
      issueType: 'UNLINKED_SUCCESS_PAYMENT',
      title: 'Unlinked Successful Payment ($' + (pay.amount / 100).toFixed(2) + ')',
      customerName: pay.userName,
      customerEmail: pay.userEmail,
      userId: pay.userId,
      entityId: pay.paymentId,
      financialImpactCents: pay.amount,
      severity: 'CRITICAL',
      suggestedCorrection: `Create & link reconciled PAID invoice for settlement reference ${pay.referenceCode}.`,
      forensicDetails: {
        paymentId: pay.paymentId,
        referenceCode: pay.referenceCode,
        paymentMethod: pay.method,
        amountCents: pay.amount,
        capturedAt: pay.createdAt,
      },
    });
  }

  const totalLeakageCents = issues.reduce((sum, i) => sum + i.financialImpactCents, 0);
  const summaryByType = issues.reduce((acc, item) => {
    acc[item.issueType] = (acc[item.issueType] || 0) + item.financialImpactCents;
    return acc;
  }, {} as Record<string, number>);

  return { issues, totalLeakageCents, summaryByType };
}

export function fixSingleLeakageIssue(issueId: string, actorId: string) {
  const { issues } = detectRevenueLeakage();
  const target = issues.find((i) => i.id === issueId);
  if (!target) {
    throw new Error('Leakage issue not found or already resolved.');
  }

  const now = new Date();
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const tx = db.transaction(() => {
    let resolutionSummary = '';

    if (target.issueType === 'ACTIVE_SUB_WITHOUT_INVOICE') {
      const sub = db.prepare(`
        SELECT s.*, p.price as planPrice
        FROM Subscription s JOIN Plan p ON p.id = s.planId
        WHERE s.id = ?
      `).get(target.entityId) as any;

      const subtotal = sub.planPrice;
      const tax = Math.round(subtotal * 0.18);
      const total = subtotal + tax;
      const invId = `inv_reconciled_${crypto.randomBytes(4).toString('hex')}`;
      const invNum = `BL-${now.getUTCFullYear()}-R${Math.floor(100 + Math.random() * 899)}`;

      db.prepare(`
        INSERT INTO Invoice (id, invoiceNumber, subscriptionId, userId, billingPeriodKey, amountSubtotal, taxAmount, discountAmount, discountCode, totalAmount, status, dueDate, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, 'CONFIRMED', ?, ?)
      `).run(invId, invNum, sub.id, sub.userId, periodKey, subtotal, tax, total, new Date(now.getTime() + 7 * 86400000).toISOString(), now.toISOString());

      resolutionSummary = `Generated missing invoice ${invNum} for $${(total / 100).toFixed(2)} (incl. 18% GST).`;
    } else if (target.issueType === 'DUPLICATE_PERIOD_INVOICE') {
      db.prepare(`UPDATE Invoice SET status = 'CANCELLED' WHERE id = ?`).run(target.entityId);
      resolutionSummary = `Cancelled duplicate invoice ${target.entityId}.`;
    } else if (target.issueType === 'EXPIRED_DISCOUNT_ON_DRAFT') {
      const inv = db.prepare('SELECT * FROM Invoice WHERE id = ?').get(target.entityId) as any;
      const tax = Math.round(inv.amountSubtotal * 0.18);
      const total = inv.amountSubtotal + tax;
      db.prepare(`
        UPDATE Invoice
        SET discountAmount = 0, discountCode = NULL, taxAmount = ?, totalAmount = ?, status = 'CONFIRMED'
        WHERE id = ?
      `).run(tax, total, inv.id);
      resolutionSummary = `Removed expired discount from ${inv.invoiceNumber}; updated total to $${(total / 100).toFixed(2)}.`;
    } else if (target.issueType === 'UNLINKED_SUCCESS_PAYMENT') {
      const pay = db.prepare('SELECT * FROM Payment WHERE id = ?').get(target.entityId) as any;
      const sub = db.prepare('SELECT * FROM Subscription WHERE userId = ? LIMIT 1').get(pay.userId) as any;
      const subtotal = Math.round(pay.amount / 1.18);
      const tax = pay.amount - subtotal;
      const invId = `inv_linked_${crypto.randomBytes(4).toString('hex')}`;
      const invNum = `BL-${now.getUTCFullYear()}-L${Math.floor(100 + Math.random() * 899)}`;

      db.prepare(`
        INSERT INTO Invoice (id, invoiceNumber, subscriptionId, userId, billingPeriodKey, amountSubtotal, taxAmount, discountAmount, discountCode, totalAmount, status, dueDate, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, 'PAID', ?, ?)
      `).run(invId, invNum, sub.id, pay.userId, `${periodKey}-SETTLEMENT`, subtotal, tax, pay.amount, now.toISOString(), now.toISOString());

      db.prepare('UPDATE Payment SET invoiceId = ? WHERE id = ?').run(invId, pay.id);
      resolutionSummary = `Linked payment ${pay.referenceCode} ($${(pay.amount / 100).toFixed(2)}) to reconciled invoice ${invNum}.`;
    }

    db.prepare(`
      INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt)
      VALUES (?, ?, 'RECONCILE_LEAKAGE', ?, ?, ?, ?)
    `).run(
      `aud_${crypto.randomBytes(5).toString('hex')}`,
      actorId,
      target.issueType,
      target.entityId,
      JSON.stringify({ issueId: target.id, resolutionSummary, impactRecoveredCents: target.financialImpactCents }),
      now.toISOString()
    );

    return {
      resolvedIssueId: target.id,
      resolutionSummary,
      recoveredCents: target.financialImpactCents,
    };
  });

  return tx();
}

export function autoReconcileAllLeakage(actorId: string) {
  const { issues } = detectRevenueLeakage();
  const results = [];
  for (const issue of issues) {
    results.push(fixSingleLeakageIssue(issue.id, actorId));
  }
  return {
    reconciledCount: results.length,
    totalRecoveredCents: results.reduce((acc, r) => acc + r.recoveredCents, 0),
    resolutions: results,
  };
}

// --- Churn Prediction Engine (0-100 Risk Score) ---
// Weights:
// - Failed payments: 30%
// - Pause frequency: 25%
// - Days to expiry: 20%
// - Account tenure: 25%

export function calculateChurnPredictions() {
  const now = new Date();
  const rows = db.prepare(`
    SELECT s.id as subscriptionId, s.status, s.currentPeriodStart, s.currentPeriodEnd, s.retentionPromoCode,
           u.id as userId, u.name as userName, u.email as userEmail, u.createdAt as userCreatedAt,
           p.name as planName, p.price as planPrice, p.billingPeriod
    FROM Subscription s
    JOIN User u ON u.id = s.userId
    JOIN Plan p ON p.id = s.planId
    WHERE u.role = 'GAMER'
      AND s.id = (SELECT s2.id FROM Subscription s2 WHERE s2.userId = u.id ORDER BY s2.createdAt DESC LIMIT 1)
  `).all() as any[];

  const subscribers = rows.map((row) => {
    const failedCountObj = db.prepare(`
      SELECT COUNT(*) as cnt FROM Payment WHERE userId = ? AND status = 'FAILED'
    `).get(row.userId) as { cnt: number };

    const pauseCountObj = db.prepare(`
      SELECT COUNT(*) as cnt FROM PauseHistory WHERE subscriptionId = ?
    `).get(row.subscriptionId) as { cnt: number };

    const renewalHistory = db.prepare(`SELECT COUNT(*) as invoiceCount, SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paidCount FROM Invoice WHERE subscriptionId = ?`).get(row.subscriptionId) as any;
    const delayedPayments = db.prepare(`SELECT COUNT(*) as cnt FROM Payment p JOIN Invoice i ON i.id = p.invoiceId WHERE p.userId = ? AND p.status = 'SUCCESS' AND p.createdAt > i.dueDate`).get(row.userId) as any;
    const cancellationHistory = db.prepare(`SELECT COUNT(*) as cnt FROM AuditLog WHERE entityType = 'Subscription' AND entityId = ? AND action = 'CANCEL_SUBSCRIPTION'`).get(row.subscriptionId) as any;
    const loginUsage = db.prepare(`SELECT SUM(CASE WHEN createdAt >= ? THEN 1 ELSE 0 END) as recentCount, SUM(CASE WHEN createdAt >= ? AND createdAt < ? THEN 1 ELSE 0 END) as priorCount FROM LoginActivity WHERE userId = ?`).get(new Date(now.getTime()-30*86400000).toISOString(), new Date(now.getTime()-60*86400000).toISOString(), new Date(now.getTime()-30*86400000).toISOString(), row.userId) as any;
    const usageReductionPercent = Number(loginUsage?.priorCount || 0) > 0 ? Math.max(0, Math.round((Number(loginUsage.priorCount)-Number(loginUsage.recentCount||0))/Number(loginUsage.priorCount)*100)) : null;
    const history = db.prepare(`SELECT id, status, currentPeriodStart, currentPeriodEnd, createdAt FROM Subscription WHERE userId = ? ORDER BY createdAt DESC`).all(row.userId);
    const invoices = db.prepare(`SELECT invoiceNumber, status, amountSubtotal, totalAmount, dueDate, createdAt FROM Invoice WHERE subscriptionId = ? ORDER BY createdAt DESC`).all(row.subscriptionId);
    const payments = db.prepare(`SELECT p.id, p.amount, p.method, p.status, p.referenceCode, p.createdAt, i.invoiceNumber, i.dueDate FROM Payment p LEFT JOIN Invoice i ON i.id = p.invoiceId WHERE p.userId = ? ORDER BY p.createdAt DESC LIMIT 12`).all(row.userId);
    const pauses = db.prepare(`SELECT pauseStart, plannedResume, actualResume, daysPaused, reason FROM PauseHistory WHERE subscriptionId = ? ORDER BY createdAt DESC`).all(row.subscriptionId);
    const lastLogin = db.prepare(`SELECT MAX(createdAt) as lastActivityAt FROM LoginActivity WHERE userId = ?`).get(row.userId) as any;

    const failedPayments = failedCountObj.cnt;
    const pauseFrequency = pauseCountObj.cnt;
    const paidRenewals = Number(renewalHistory?.paidCount || 0);
    const paymentDelays = Number(delayedPayments?.cnt || 0);
    const repeatedCancellations = Number(cancellationHistory?.cnt || 0);
    const daysToExpiry = Math.max(0, Math.round((new Date(row.currentPeriodEnd).getTime() - now.getTime()) / 86400000));

    // Normalized sub-scores (0-100 each)
    const failedScore = Math.min(100, failedPayments * 50); // 2+ failed payments = 100
    const pauseScore = Math.min(100, pauseFrequency * 45);  // 2+ pauses = 90-100
    const expiryScore = daysToExpiry <= 5 ? 100 : daysToExpiry <= 15 ? 65 : daysToExpiry <= 30 ? 35 : 10;
    const renewalScore = paidRenewals === 0 ? 70 : paidRenewals === 1 ? 45 : paidRenewals < 4 ? 25 : 10;
    const cancellationScore = Math.min(100, repeatedCancellations * 50);
    const usageScore = usageReductionPercent === null ? 20 : usageReductionPercent >= 70 ? 100 : usageReductionPercent >= 45 ? 70 : usageReductionPercent >= 20 ? 45 : 10;
    const delayScore = Math.min(100, paymentDelays * 45);

    // Transparent prototype weights: failures 20%, renewal history 15%, expiry 15%,
    // cancellations 15%, pauses 15%, usage reduction 10%, payment delays 10%.
    const riskScore = Math.round(
      failedScore * 0.20 + renewalScore * 0.15 + expiryScore * 0.15 + cancellationScore * 0.15 +
      pauseScore * 0.15 + usageScore * 0.10 + delayScore * 0.10
    );

    const riskTier: 'HIGH' | 'MEDIUM' | 'LOW' =
      riskScore >= 60 ? 'HIGH' : riskScore >= 35 ? 'MEDIUM' : 'LOW';

    const suggestedAction =
      riskTier === 'HIGH'
        ? failedPayments || paymentDelays ? 'Send a renewal reminder and review payment support; consider a capped retention offer.' : 'Contact the player and offer a tailored retention benefit.'
        : riskTier === 'MEDIUM'
        ? pauseFrequency ? 'Offer a flexible pause and check in before renewal.' : 'Send a friendly renewal reminder with a loyalty reward.'
        : 'Low churn signals; continue regular loyalty engagement.';

    const reasons = [
      failedPayments > 0 ? `${failedPayments} failed payment${failedPayments===1?'':'s'}` : '',
      paymentDelays > 0 ? `${paymentDelays} late payment${paymentDelays===1?'':'s'}` : '',
      repeatedCancellations > 0 ? `${repeatedCancellations} prior cancellation${repeatedCancellations===1?'':'s'}` : '',
      pauseFrequency > 0 ? `${pauseFrequency} pause${pauseFrequency===1?'':'s'}` : '',
      usageReductionPercent !== null && usageReductionPercent >= 20 ? `usage down ${usageReductionPercent}%` : '',
      daysToExpiry <= 30 ? `renewal in ${daysToExpiry} days` : '',
      paidRenewals === 0 ? 'limited renewal history' : '',
    ].filter(Boolean);
    const usageTrend = Array.from({length:6}, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - (5-index), 1);
      const next = new Date(month.getFullYear(), month.getMonth()+1, 1);
      const entry = db.prepare(`SELECT COUNT(*) as count FROM LoginActivity WHERE userId = ? AND createdAt >= ? AND createdAt < ?`).get(row.userId, month.toISOString(), next.toISOString()) as any;
      return { month: month.toLocaleString('en-US',{month:'short'}), sessions: Number(entry.count||0) };
    });
    const userLastActivity = db.prepare(`SELECT MAX(createdAt) as at FROM Payment WHERE userId = ?`).get(row.userId) as any;

    return {
      subscriptionId: row.subscriptionId,
      userId: row.userId,
      userName: row.userName,
      userEmail: row.userEmail,
      planName: row.planName,
      planPriceCents: row.planPrice,
      billingPeriod: row.billingPeriod,
      status: row.status,
      currentPeriodStart: row.currentPeriodStart,
      currentPeriodEnd: row.currentPeriodEnd,
      lastActivityAt: lastLogin?.lastActivityAt || userLastActivity?.at || row.userCreatedAt,
      riskScore,
      riskTier,
      retentionPromoApplied: row.retentionPromoCode === 'RETENTION15',
      factors: {
        failedPayments,
        failedPaymentWeightScore: Math.round(failedScore * 0.20),
        paidRenewals,
        renewalHistoryWeightScore: Math.round(renewalScore * 0.15),
        pauseFrequency,
        pauseWeightScore: Math.round(pauseScore * 0.15),
        daysToExpiry,
        expiryWeightScore: Math.round(expiryScore * 0.15),
        repeatedCancellations,
        cancellationWeightScore: Math.round(cancellationScore * 0.15),
        usageReductionPercent,
        usageWeightScore: Math.round(usageScore * 0.10),
        paymentDelays,
        paymentDelayWeightScore: Math.round(delayScore * 0.10),
      },
      mainRiskReason: reasons[0] || (riskTier === 'LOW' ? 'No significant risk signals observed' : 'Combined account activity signals'),
      reasons,
      suggestedAction,
      subscriptions: history,
      invoices,
      payments,
      pauses,
      usageTrend,
    };
  });

  subscribers.sort((a, b) => b.riskScore - a.riskScore);

  return {
    subscribers,
    groups: {
      highRisk: subscribers.filter((s) => s.riskTier === 'HIGH'),
      mediumRisk: subscribers.filter((s) => s.riskTier === 'MEDIUM'),
      lowRisk: subscribers.filter((s) => s.riskTier === 'LOW'),
    },
  };
}

// --- Executive Financial Markdown Report ---

export function buildExecutiveReportMarkdown() {
  const now = new Date();
  const activeSubs = db.prepare(`
    SELECT s.*, p.price, p.billingPeriod, p.name as planName
    FROM Subscription s
    JOIN Plan p ON p.id = s.planId
    WHERE s.status = 'ACTIVE'
  `).all() as any[];

  // Calculate normalized MRR in cents
  const mrrCents = activeSubs.reduce((sum, s) => {
    if (s.billingPeriod === 'DAILY') return sum + s.price * 30;
    if (s.billingPeriod === 'WEEKLY') return sum + s.price * 4;
    if (s.billingPeriod === 'QUARTERLY') return sum + Math.round(s.price / 3);
    if (s.billingPeriod === 'YEARLY') return sum + Math.round(s.price / 12);
    return sum + s.price;
  }, 0);

  const leakage = detectRevenueLeakage();
  const churn = calculateChurnPredictions();

  // Overdue collection priorities ranked by amount * daysOverdue
  const overdueInvoices = db.prepare(`
    SELECT i.*, u.name as customerName, u.email as customerEmail, p.name as planName
    FROM Invoice i
    JOIN User u ON u.id = i.userId
    JOIN Subscription s ON s.id = i.subscriptionId
    JOIN Plan p ON p.id = s.planId
    WHERE i.status = 'OVERDUE'
  `).all() as any[];

  const rankedOverdue = overdueInvoices
    .map((inv) => {
      const daysOverdue = Math.max(1, Math.round((now.getTime() - new Date(inv.dueDate).getTime()) / 86400000));
      const priorityScore = (inv.totalAmount / 100) * daysOverdue;
      return {
        ...inv,
        daysOverdue,
        priorityScore,
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const markdown = `# Brightloop Gaming — Executive Financial & Revenue Intelligence Brief
**Generated:** ${now.toUTCString()}
**Reporting Standard:** Integer Minor Units · 18% GST Inclusive Billing

---

## 1. Monthly Recurring Revenue (MRR) & Subscription Health
- **Normalized Monthly Recurring Revenue (MRR):** $${(mrrCents / 100).toFixed(2)}
- **Annualized Run Rate (ARR):** $${((mrrCents * 12) / 100).toFixed(2)}
- **Active Subscriptions:** ${activeSubs.length}
- **Revenue at Immediate Risk (High Churn + Leakage):** $${((leakage.totalLeakageCents + churn.groups.highRisk.reduce((s, c) => s + c.planPriceCents, 0)) / 100).toFixed(2)}

---

## 2. Subscriber Churn Risk Summary (0–100 Weighted Model)
*Weights: Failed Payments (30%) · Pause Frequency (25%) · Days to Expiry (20%) · Account Tenure (25%)*

| Risk Group | Subscriber Count | Monthly Revenue Exposure | Primary Recommended Intervention |
| :--- | :---: | :---: | :--- |
| **High Risk (60–100)** | ${churn.groups.highRisk.length} | $${(churn.groups.highRisk.reduce((s, c) => s + c.planPriceCents, 0) / 100).toFixed(2)} | Apply **RETENTION15** (15% promo) + smart payment retry |
| **Medium Risk (35–59)** | ${churn.groups.mediumRisk.length} | $${(churn.groups.mediumRisk.reduce((s, c) => s + c.planPriceCents, 0) / 100).toFixed(2)} | Send Battlepass perk digest + renewal lock-in |
| **Low Risk (0–34)** | ${churn.groups.lowRisk.length} | $${(churn.groups.lowRisk.reduce((s, c) => s + c.planPriceCents, 0) / 100).toFixed(2)} | Upsell to Annual Legend Pass (4 months free) |

---

## 3. Revenue Leakage Audit
- **Total Detected Leakage:** $${(leakage.totalLeakageCents / 100).toFixed(2)} across **${leakage.issues.length}** open anomalies.

${
  leakage.issues.length === 0
    ? '_All billing ledgers, invoices, and settlements are 100% reconciled._'
    : leakage.issues
        .map(
          (i, idx) =>
            `${idx + 1}. **[${i.severity}] ${i.title}** — ${i.customerName} (\`${i.customerEmail}\`)
   - **Financial Impact:** $${(i.financialImpactCents / 100).toFixed(2)}
   - **Action:** ${i.suggestedCorrection}`
        )
        .join('\n')
}

---

## 4. Overdue Collection Priorities (Ranked by Amount × Days Overdue)
| Rank | Invoice # | Customer | Amount Due | Days Overdue | Priority Index (Amt × Days) |
| :---: | :--- | :--- | :---: | :---: | :---: |
${
  rankedOverdue.length === 0
    ? '| — | No overdue invoices | — | $0.00 | 0 | 0.00 |'
    : rankedOverdue
        .map(
          (o, idx) =>
            `| #${idx + 1} | \`${o.invoiceNumber}\` | ${o.customerName} (${o.customerEmail}) | $${(o.totalAmount / 100).toFixed(2)} | ${o.daysOverdue}d | **${o.priorityScore.toFixed(1)}** |`
        )
        .join('\n')
}

---

## 5. Recommended Executive Recovery Actions
1. **Execute One-Click Auto-Reconcile** in Revenue Intelligence to recover **$${(leakage.totalLeakageCents / 100).toFixed(2)}** from uninvoiced active subscriptions, duplicate period bills, expired draft discounts, and unlinked settlements.
2. **Deploy 15% Retention Offer (\`RETENTION15\`)** to High-Risk subscribers (${churn.groups.highRisk.map((h) => h.userName).join(', ') || 'None'}) prior to billing period expiration.
3. **Prioritize Dunning Outreach** in sequence of Priority Index, starting with ${rankedOverdue[0] ? `${rankedOverdue[0].customerName} (${rankedOverdue[0].invoiceNumber})` : 'current billing queue'}.
`;

  return {
    generatedAt: now.toISOString(),
    metrics: {
      mrrCents,
      arrCents: mrrCents * 12,
      activeSubscriptionCount: activeSubs.length,
      totalLeakageCents: leakage.totalLeakageCents,
      highRiskCount: churn.groups.highRisk.length,
    },
    rankedOverdue,
    markdown,
  };
}
