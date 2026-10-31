import crypto from 'crypto';
import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db, hashPassword, hashPin, seedDatabase } from './src/server/db';
import {
  autoReconcileAllLeakage,
  buildExecutiveReportMarkdown,
  calculateChurnPredictions,
  CheckoutRateLimitSchema,
  detectRevenueLeakage,
  DiscountInputSchema,
  evaluateCheckoutAttempt,
  fixSingleLeakageIssue,
  generateInvoicesForDueSubscriptions,
  GenerateInvoicesSchema,
  LoginSchema,
  ParentalSettingsSchema,
  pauseSubscription,
  PauseSubscriptionSchema,
  PlanInputSchema,
  ProductInputSchema,
  RegisterSchema,
  resumeSubscription,
  SubscribePlanSchema,
} from './src/server/services';

// Initialize and seed SQLite database on server start
seedDatabase(false);

const app = express();
app.use(express.json());

// Session store in memory backed by signed tokens
interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF' | 'GAMER';
}

const sessions = new Map<string, SessionUser>();

function createSessionToken(user: SessionUser): string {
  const token = `bl_sess_${crypto.randomBytes(24).toString('hex')}`;
  sessions.set(token, user);
  return token;
}

function getAuthUser(req: Request): SessionUser | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (sessions.has(token)) {
      return sessions.get(token)!;
    }
    // Support deterministic demo switcher header for seamless testing across roles if token was from previous reload
    if (token.startsWith('demo_user_')) {
      const userId = token.replace('demo_user_', '');
      const row = db.prepare('SELECT id, name, email, role FROM User WHERE id = ?').get(userId) as SessionUser | undefined;
      if (row) return row;
    }
  }
  return null;
}

function requireAuth(roles?: Array<'ADMIN' | 'STAFF' | 'GAMER'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }
    if (roles && !roles.includes(user.role)) {
      return res.status(403).json({
        error: `Forbidden: Requires ${roles.join(' or ')} role (current role: ${user.role}).`,
      });
    }
    (req as any).user = user;
    next();
  };
}

// --- PUBLIC CATALOG & STATS ENDPOINTS ---

app.get('/api/public/catalog', (_req, res) => {
  const plans = db.prepare('SELECT * FROM Plan ORDER BY price ASC').all().map((p: any) => ({
    ...p,
    perks: JSON.parse(p.perksJson || '[]'),
    isRecommended: Boolean(p.isRecommended),
    autoClose: Boolean(p.autoClose),
    allowPause: Boolean(p.allowPause),
  }));

  const products = db.prepare('SELECT * FROM Product WHERE isActive = 1 ORDER BY createdAt DESC').all().map((prod: any) => {
    const variants = db.prepare('SELECT * FROM ProductVariant WHERE productId = ?').all(prod.id);
    return {
      ...prod,
      isActive: Boolean(prod.isActive),
      variants,
    };
  });

  const discounts = db.prepare('SELECT code, description, type, value, endDate, isActive FROM Discount WHERE isActive = 1').all();

  res.json({
    plans,
    products,
    discounts,
    stats: {
      gamesIncluded: '180+',
      activeGamers: '48,500+',
      platformUptime: '99.98%',
      supportResponse: '< 3 mins (24/7)',
    },
  });
});

// --- AUTHENTICATION ENDPOINTS ---

app.get('/api/auth/demo-accounts', (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.isFrozen, u.parentalGateOn,
           p.name as planName, s.status as subStatus
    FROM User u
    LEFT JOIN Subscription s ON s.userId = u.id
    LEFT JOIN Plan p ON p.id = s.planId
    ORDER BY CASE u.role WHEN 'ADMIN' THEN 1 WHEN 'STAFF' THEN 2 ELSE 3 END, u.name ASC
  `).all();
  res.json({ accounts: users });
});

app.post('/api/auth/register', (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { name, email, password, parentEmail, parentalPin } = parsed.data;
  const existing = db.prepare('SELECT id FROM User WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const userId = `usr_${crypto.randomBytes(5).toString('hex')}`;
  const nowIso = new Date().toISOString();
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '198.51.100.50';

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO User (id, name, email, passwordHash, role, parentEmail, parentalPinHash, parentalGateOn, lastLoginIp, lastLoginCountry, lastLoginAt, isFrozen, tradeLockUntil, createdAt)
      VALUES (?, ?, ?, ?, 'GAMER', ?, ?, ?, ?, 'US', ?, 0, NULL, ?)
    `).run(
      userId,
      name,
      email.toLowerCase(),
      hashPassword(password),
      parentEmail || null,
      parentalPin ? hashPin(parentalPin) : null,
      parentalPin ? 1 : 0,
      clientIp,
      nowIso,
      nowIso
    );

    // Provision a default Monthly Champion Tier subscription + initial invoice
    const subId = `sub_${crypto.randomBytes(5).toString('hex')}`;
    const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
    db.prepare(`
      INSERT INTO Subscription (id, userId, planId, status, currentPeriodStart, currentPeriodEnd, perksFrozen, createdAt)
      VALUES (?, ?, 'plan_monthly_champion', 'ACTIVE', ?, ?, 0, ?)
    `).run(subId, userId, nowIso, periodEnd, nowIso);

    const invId = `inv_${crypto.randomBytes(5).toString('hex')}`;
    const invNum = `BL-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    db.prepare(`
      INSERT INTO Invoice (id, invoiceNumber, subscriptionId, userId, billingPeriodKey, amountSubtotal, taxAmount, discountAmount, totalAmount, status, dueDate, createdAt)
      VALUES (?, ?, ?, ?, '2026-10', 1499, 270, 0, 1769, 'PAID', ?, ?)
    `).run(invId, invNum, subId, userId, nowIso, nowIso);

    db.prepare(`
      INSERT INTO Payment (id, invoiceId, userId, amount, method, status, referenceCode, ipAddress, createdAt)
      VALUES (?, ?, ?, 1769, 'CREDIT_CARD', 'SUCCESS', ?, ?, ?)
    `).run(`pay_${crypto.randomBytes(4).toString('hex')}`, invId, userId, `TXN-${Math.floor(100000 + Math.random() * 899999)}`, clientIp, nowIso);
  });

  tx();

  const sessionUser: SessionUser = { id: userId, name, email: email.toLowerCase(), role: 'GAMER' };
  const token = createSessionToken(sessionUser);
  res.status(201).json({ token, user: sessionUser });
});

app.post('/api/auth/login', (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Valid email and password are required.' });
  }

  const { email, password, simulatedCountry } = parsed.data;
  const user = db.prepare('SELECT * FROM User WHERE email = ?').get(email.toLowerCase()) as any;
  if (!user || user.passwordHash !== hashPassword(password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const now = new Date();
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '203.0.113.10';
  const loginCountry = simulatedCountry || user.lastLoginCountry || 'US';

  // Geo-IP Jump Detection: Login from different country within 1 hour
  let geoJumpDetected = false;
  if (user.lastLoginCountry && user.lastLoginCountry !== loginCountry && user.lastLoginAt) {
    const minutesSinceLast = (now.getTime() - new Date(user.lastLoginAt).getTime()) / 60000;
    if (minutesSinceLast <= 60) {
      geoJumpDetected = true;
      const lockUntil = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
      db.prepare('UPDATE User SET isFrozen = 1, tradeLockUntil = ? WHERE id = ?').run(lockUntil, user.id);

      db.prepare(`
        INSERT INTO SecurityLog (id, userId, ipAddress, userAgent, eventType, severity, details, resolved, createdAt)
        VALUES (?, ?, ?, ?, 'GEO_IP_JUMP', 'HIGH', ?, 0, ?)
      `).run(
        `sec_geo_${crypto.randomBytes(4).toString('hex')}`,
        user.id,
        clientIp,
        req.headers['user-agent'] || 'Browser',
        JSON.stringify({
          previousCountry: user.lastLoginCountry,
          newCountry: loginCountry,
          elapsedMinutes: Math.max(1, Math.round(minutesSinceLast)),
          actionTaken: '48_HOUR_TRADE_LOCK_APPLIED',
          accountEmail: user.email,
          description: `Geo-IP jump detected (${user.lastLoginCountry} -> ${loginCountry} within ${Math.max(1, Math.round(minutesSinceLast))}m). 48-hour trade lock activated.`,
        }),
        now.toISOString()
      );
    }
  }

  db.prepare('UPDATE User SET lastLoginIp = ?, lastLoginCountry = ?, lastLoginAt = ? WHERE id = ?').run(
    clientIp,
    loginCountry,
    now.toISOString(),
    user.id
  );

  db.prepare(`
    INSERT INTO LoginActivity (id, userId, ipAddress, country, userAgent, flaggedJump, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `log_${crypto.randomBytes(4).toString('hex')}`,
    user.id,
    clientIp,
    loginCountry,
    req.headers['user-agent'] || 'Browser',
    geoJumpDetected ? 1 : 0,
    now.toISOString()
  );

  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };
  const token = createSessionToken(sessionUser);

  res.json({
    token,
    user: sessionUser,
    geoJumpDetected,
  });
});

app.post('/api/auth/quick-switch', (req, res) => {
  const { userId } = req.body;
  const user = db.prepare('SELECT id, name, email, role FROM User WHERE id = ?').get(userId) as SessionUser | undefined;
  if (!user) {
    return res.status(404).json({ error: 'Account not found.' });
  }
  const token = createSessionToken(user);
  res.json({ token, user });
});

app.get('/api/auth/me', requireAuth(), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const user = db.prepare(`
    SELECT id, name, email, role, parentEmail, parentalGateOn, lastLoginIp, lastLoginCountry, lastLoginAt, isFrozen, tradeLockUntil, createdAt
    FROM User WHERE id = ?
  `).get(sessionUser.id) as any;

  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  res.json({
    user: {
      ...user,
      parentalGateOn: Boolean(user.parentalGateOn),
      isFrozen: Boolean(user.isFrozen),
    },
  });
});

// --- GAMER SELF-SERVICE PORTAL ENDPOINTS (/gamer) ---

app.get('/api/gamer/dashboard', requireAuth(['GAMER', 'ADMIN', 'STAFF']), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  // Allow Admin/Staff to inspect a specific gamer if userId query param is passed, but GAMER can ONLY ever access their own!
  const targetUserId =
    sessionUser.role === 'GAMER'
      ? sessionUser.id
      : (req.query.userId as string) || 'usr_gamer_1';

  const user = db.prepare(`
    SELECT id, name, email, role, parentEmail, parentalGateOn, lastLoginIp, lastLoginCountry, lastLoginAt, isFrozen, tradeLockUntil, createdAt
    FROM User WHERE id = ?
  `).get(targetUserId) as any;

  if (!user) {
    return res.status(404).json({ error: 'Gamer profile not found.' });
  }

  const subscription = db.prepare(`
    SELECT s.*, p.name as planName, p.tagline as planTagline, p.billingPeriod, p.price as planPrice,
           p.perksJson, p.allowPause, p.maxPauseDays, p.autoClose
    FROM Subscription s
    JOIN Plan p ON p.id = s.planId
    WHERE s.userId = ?
    ORDER BY s.createdAt DESC LIMIT 1
  `).get(targetUserId) as any;

  const invoices = db.prepare(`
    SELECT * FROM Invoice WHERE userId = ? ORDER BY createdAt DESC
  `).all(targetUserId);

  const payments = db.prepare(`
    SELECT p.*, i.invoiceNumber
    FROM Payment p
    LEFT JOIN Invoice i ON i.id = p.invoiceId
    WHERE p.userId = ?
    ORDER BY p.createdAt DESC
  `).all(targetUserId);

  const pauseHistory = subscription
    ? db.prepare('SELECT * FROM PauseHistory WHERE subscriptionId = ? ORDER BY createdAt DESC').all(subscription.id)
    : [];

  const allPlans = db.prepare('SELECT * FROM Plan ORDER BY price ASC').all().map((p: any) => ({
    ...p,
    perks: JSON.parse(p.perksJson || '[]'),
    isRecommended: Boolean(p.isRecommended),
    allowPause: Boolean(p.allowPause),
  }));

  res.json({
    profile: {
      ...user,
      parentalGateOn: Boolean(user.parentalGateOn),
      isFrozen: Boolean(user.isFrozen),
    },
    subscription: subscription
      ? {
          ...subscription,
          perks: JSON.parse(subscription.perksJson || '[]'),
          perksFrozen: Boolean(subscription.perksFrozen),
          allowPause: Boolean(subscription.allowPause),
          autoClose: Boolean(subscription.autoClose),
        }
      : null,
    invoices,
    payments,
    pauseHistory,
    availablePlans: allPlans,
  });
});

// Subscribe / Upgrade / Renew with Parental Safety Gate PIN check
app.post('/api/gamer/subscribe', requireAuth(['GAMER', 'ADMIN', 'STAFF']), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const parsed = SubscribePlanSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { planId, discountCode, paymentMethod, parentalPin } = parsed.data;
  const user = db.prepare('SELECT * FROM User WHERE id = ?').get(sessionUser.id) as any;
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  if (user.isFrozen) {
    return res.status(403).json({
      error: `Account Trade Lock Active until ${new Date(user.tradeLockUntil).toLocaleString()} due to suspicious Geo-IP login activity.`,
    });
  }

  // Enforce Parental Safety Gate 4-digit PIN if enabled
  if (user.parentalGateOn) {
    if (!parentalPin) {
      return res.status(403).json({
        error: 'PARENTAL_PIN_REQUIRED',
        message: 'Parental Safety Gate is active. Please enter the 4-digit Parental PIN to authorize plan renewal or upgrade.',
      });
    }
    if (user.parentalPinHash !== hashPin(parentalPin)) {
      return res.status(403).json({
        error: 'INVALID_PARENTAL_PIN',
        message: 'Incorrect 4-digit Parental PIN. Renewal or upgrade blocked by Parental Safety Gate.',
      });
    }
  }

  const plan = db.prepare('SELECT * FROM Plan WHERE id = ?').get(planId) as any;
  if (!plan) {
    return res.status(404).json({ error: 'Selected plan not found.' });
  }

  const now = new Date();
  const periodDays =
    plan.billingPeriod === 'DAILY'
      ? 1
      : plan.billingPeriod === 'WEEKLY'
      ? 7
      : plan.billingPeriod === 'YEARLY'
      ? 365
      : plan.billingPeriod === 'QUARTERLY'
      ? 90
      : 30;
  const periodEnd = new Date(now.getTime() + periodDays * 86400000).toISOString();

  const tx = db.transaction(() => {
    let discountAmount = 0;
    let appliedCode: string | null = null;

    if (discountCode) {
      const d = db.prepare('SELECT * FROM Discount WHERE code = ?').get(discountCode.toUpperCase()) as any;
      if (!d || !d.isActive || new Date(d.endDate) < now || d.usedCount >= d.maxUses) {
        throw new Error(`Discount code "${discountCode}" is invalid, expired, or exhausted.`);
      }
      discountAmount =
        d.type === 'PERCENT'
          ? Math.round((plan.price * d.value) / 100)
          : Math.min(plan.price, d.value);
      appliedCode = d.code;
      db.prepare('UPDATE Discount SET usedCount = usedCount + 1 WHERE id = ?').run(d.id);
    }

    const existingSub = db.prepare('SELECT * FROM Subscription WHERE userId = ? ORDER BY createdAt DESC LIMIT 1').get(user.id) as any;
    let subId = existingSub?.id;

    if (existingSub) {
      db.prepare(`
        UPDATE Subscription
        SET planId = ?, status = 'ACTIVE', currentPeriodStart = ?, currentPeriodEnd = ?,
            pauseStartDate = NULL, pauseResumeDate = NULL, pausedDaysPlanned = NULL, perksFrozen = 0
        WHERE id = ?
      `).run(plan.id, now.toISOString(), periodEnd, existingSub.id);
    } else {
      subId = `sub_${crypto.randomBytes(5).toString('hex')}`;
      db.prepare(`
        INSERT INTO Subscription (id, userId, planId, status, currentPeriodStart, currentPeriodEnd, perksFrozen, createdAt)
        VALUES (?, ?, ?, 'ACTIVE', ?, ?, 0, ?)
      `).run(subId, user.id, plan.id, now.toISOString(), periodEnd, now.toISOString());
    }

    const taxable = Math.max(0, plan.price - discountAmount);
    const taxAmount = Math.round(taxable * 0.18);
    const totalAmount = taxable + taxAmount;

    const invId = `inv_${crypto.randomBytes(5).toString('hex')}`;
    const invNum = `BL-${now.getUTCFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${plan.id}`;

    db.prepare(`
      INSERT INTO Invoice (id, invoiceNumber, subscriptionId, userId, billingPeriodKey, amountSubtotal, taxAmount, discountAmount, discountCode, totalAmount, status, dueDate, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?)
    `).run(
      invId,
      invNum,
      subId,
      user.id,
      periodKey,
      plan.price,
      taxAmount,
      discountAmount,
      appliedCode,
      totalAmount,
      now.toISOString(),
      now.toISOString()
    );

    const payId = `pay_${crypto.randomBytes(5).toString('hex')}`;
    db.prepare(`
      INSERT INTO Payment (id, invoiceId, userId, amount, method, status, referenceCode, ipAddress, createdAt)
      VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)
    `).run(
      payId,
      invId,
      user.id,
      totalAmount,
      paymentMethod,
      `TXN-${Math.floor(100000 + Math.random() * 899999)}`,
      user.lastLoginIp || '203.0.113.45',
      now.toISOString()
    );

    return { subId, invoiceNumber: invNum, totalAmount, nextBillingDate: periodEnd };
  });

  try {
    const result = tx();
    res.json({
      message: `Successfully activated ${plan.name}!`,
      ...result,
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Cancel Subscription
app.post('/api/subscriptions/:id/cancel', requireAuth(), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const sub = db.prepare('SELECT * FROM Subscription WHERE id = ?').get(req.params.id) as any;
  if (!sub) {
    return res.status(404).json({ error: 'Subscription not found.' });
  }
  if (sessionUser.role === 'GAMER' && sub.userId !== sessionUser.id) {
    return res.status(403).json({ error: 'Forbidden: You do not own this subscription.' });
  }

  db.prepare(`
    UPDATE Subscription SET status = 'CLOSED', perksFrozen = 1 WHERE id = ?
  `).run(sub.id);

  res.json({ message: 'Subscription has been closed.', status: 'CLOSED' });
});

// Update Parental Safety Gate settings
app.post('/api/gamer/parental-settings', requireAuth(), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const parsed = ParentalSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  const { parentEmail, parentalPin, parentalGateOn } = parsed.data;
  db.prepare(`
    UPDATE User
    SET parentEmail = ?, parentalPinHash = ?, parentalGateOn = ?
    WHERE id = ?
  `).run(parentEmail || null, hashPin(parentalPin), parentalGateOn ? 1 : 0, sessionUser.id);

  res.json({
    message: `Parental Safety Gate ${parentalGateOn ? 'enabled' : 'updated'} with 4-digit PIN protection.`,
    parentalGateOn,
    parentEmail: parentEmail || null,
  });
});

// Update Gamer Profile
app.put('/api/gamer/profile', requireAuth(), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const { name, parentEmail } = req.body;
  if (!name || String(name).trim().length < 2) {
    return res.status(400).json({ error: 'Display name must be at least 2 characters.' });
  }
  db.prepare('UPDATE User SET name = ?, parentEmail = ? WHERE id = ?').run(
    String(name).trim(),
    parentEmail || null,
    sessionUser.id
  );
  res.json({ message: 'Profile updated successfully.' });
});

// Pay an Overdue or Confirmed Invoice
app.post('/api/gamer/invoices/:id/pay', requireAuth(), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const { parentalPin, method = 'CREDIT_CARD' } = req.body;

  const inv = db.prepare('SELECT * FROM Invoice WHERE id = ?').get(req.params.id) as any;
  if (!inv) {
    return res.status(404).json({ error: 'Invoice not found.' });
  }
  if (sessionUser.role === 'GAMER' && inv.userId !== sessionUser.id) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const user = db.prepare('SELECT * FROM User WHERE id = ?').get(inv.userId) as any;
  if (user?.parentalGateOn && sessionUser.role === 'GAMER') {
    if (!parentalPin || user.parentalPinHash !== hashPin(String(parentalPin))) {
      return res.status(403).json({
        error: 'PARENTAL_PIN_REQUIRED',
        message: 'Valid 4-digit Parental PIN is required to authorize renewal payment.',
      });
    }
  }

  const nowIso = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE Invoice SET status = 'PAID' WHERE id = ?`).run(inv.id);
    db.prepare(`
      INSERT INTO Payment (id, invoiceId, userId, amount, method, status, referenceCode, ipAddress, createdAt)
      VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?, ?, ?)
    `).run(
      `pay_${crypto.randomBytes(5).toString('hex')}`,
      inv.id,
      inv.userId,
      inv.totalAmount,
      method,
      `TXN-${Math.floor(100000 + Math.random() * 899999)}`,
      user?.lastLoginIp || '203.0.113.45',
      nowIso
    );
  });

  tx();
  res.json({ message: `Invoice ${inv.invoiceNumber} paid successfully.` });
});

// --- REQUIRED BILLING APIs (SECTION 8) ---

app.post('/api/subscriptions/:id/pause', requireAuth(), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const parsed = PauseSubscriptionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Pause duration must be 7, 14, or 30 days.' });
  }

  try {
    const result = pauseSubscription({
      subscriptionId: req.params.id,
      actorId: sessionUser.id,
      actorRole: sessionUser.role,
      durationDays: parsed.data.durationDays,
      reason: parsed.data.reason,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/subscriptions/:id/resume', requireAuth(), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  try {
    const result = resumeSubscription({
      subscriptionId: req.params.id,
      actorId: sessionUser.id,
      actorRole: sessionUser.role,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/billing/generate-invoices', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const parsed = GenerateInvoicesSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  try {
    const result = generateInvoicesForDueSubscriptions({
      ...parsed.data,
      actorId: sessionUser.id,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// --- ADMIN CONTROL CENTER APIs (SECTION 7) ---

app.get('/api/admin/overview', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const activeSubs = db.prepare(`
    SELECT s.*, p.price, p.billingPeriod, p.name as planName, u.name as userName, u.email as userEmail
    FROM Subscription s
    JOIN Plan p ON p.id = s.planId
    JOIN User u ON u.id = s.userId
    WHERE s.status = 'ACTIVE'
  `).all() as any[];

  const mrrCents = activeSubs.reduce((sum, s) => {
    if (s.billingPeriod === 'DAILY') return sum + s.price * 30;
    if (s.billingPeriod === 'WEEKLY') return sum + s.price * 4;
    if (s.billingPeriod === 'QUARTERLY') return sum + Math.round(s.price / 3);
    if (s.billingPeriod === 'YEARLY') return sum + Math.round(s.price / 12);
    return sum + s.price;
  }, 0);

  const allSubsCount = (db.prepare('SELECT COUNT(*) as cnt FROM Subscription').get() as any).cnt;
  const closedSubsCount = (db.prepare("SELECT COUNT(*) as cnt FROM Subscription WHERE status = 'CLOSED'").get() as any).cnt;
  const pausedSubsCount = (db.prepare("SELECT COUNT(*) as cnt FROM Subscription WHERE status = 'PAUSED'").get() as any).cnt;

  const pendingInvoices = db.prepare(`
    SELECT COALESCE(SUM(totalAmount), 0) as total, COUNT(*) as count
    FROM Invoice WHERE status IN ('DRAFT', 'CONFIRMED', 'OVERDUE')
  `).get() as { total: number; count: number };

  const leakage = detectRevenueLeakage();
  const churn = calculateChurnPredictions();

  const highRiskRevenueCents = churn.groups.highRisk.reduce((sum, s) => sum + s.planPriceCents, 0);
  const revenueAtRiskCents = leakage.totalLeakageCents + highRiskRevenueCents;

  // Monthly growth chart data
  const growthChart = [
    { month: 'May', mrr: 94.5, activeSubscribers: 3, churnRate: 4.8 },
    { month: 'Jun', mrr: 112.0, activeSubscribers: 4, churnRate: 4.2 },
    { month: 'Jul', mrr: 128.4, activeSubscribers: 4, churnRate: 3.9 },
    { month: 'Aug', mrr: 141.9, activeSubscribers: 5, churnRate: 3.5 },
    { month: 'Sep', mrr: 154.9, activeSubscribers: 5, churnRate: 3.1 },
    { month: 'Oct', mrr: Number((mrrCents / 100).toFixed(2)), activeSubscribers: activeSubs.length, churnRate: Number(((closedSubsCount / Math.max(1, allSubsCount)) * 100 + 2.4).toFixed(1)) },
  ];

  const plans = db.prepare('SELECT * FROM Plan ORDER BY price ASC').all().map((p: any) => ({
    ...p,
    perks: JSON.parse(p.perksJson || '[]'),
    isRecommended: Boolean(p.isRecommended),
    autoClose: Boolean(p.autoClose),
    allowPause: Boolean(p.allowPause),
  }));

  const products = db.prepare('SELECT * FROM Product ORDER BY createdAt DESC').all().map((prod: any) => ({
    ...prod,
    isActive: Boolean(prod.isActive),
    variants: db.prepare('SELECT * FROM ProductVariant WHERE productId = ?').all(prod.id),
  }));

  const discounts = db.prepare('SELECT * FROM Discount ORDER BY createdAt DESC').all().map((d: any) => ({
    ...d,
    isActive: Boolean(d.isActive),
  }));

  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.parentEmail, u.parentalGateOn, u.lastLoginIp, u.lastLoginCountry, u.isFrozen, u.tradeLockUntil, u.createdAt,
           s.id as subscriptionId, s.status as subscriptionStatus, s.currentPeriodEnd, s.perksFrozen,
           p.name as planName, p.price as planPrice
    FROM User u
    LEFT JOIN Subscription s ON s.userId = u.id
    LEFT JOIN Plan p ON p.id = s.planId
    ORDER BY u.createdAt DESC
  `).all().map((u: any) => ({
    ...u,
    parentalGateOn: Boolean(u.parentalGateOn),
    isFrozen: Boolean(u.isFrozen),
    perksFrozen: Boolean(u.perksFrozen),
  }));

  const invoices = db.prepare(`
    SELECT i.*, u.name as customerName, u.email as customerEmail, p.name as planName
    FROM Invoice i JOIN User u ON u.id = i.userId
    LEFT JOIN Subscription s ON s.id = i.subscriptionId
    LEFT JOIN Plan p ON p.id = s.planId
    ORDER BY i.createdAt DESC LIMIT 100
  `).all();
  const payments = db.prepare(`
    SELECT p.*, u.name as customerName, u.email as customerEmail, i.invoiceNumber
    FROM Payment p JOIN User u ON u.id = p.userId
    LEFT JOIN Invoice i ON i.id = p.invoiceId
    ORDER BY p.createdAt DESC LIMIT 100
  `).all();

  res.json({
    kpis: {
      mrrCents,
      activeSubscriptions: activeSubs.length,
      pausedSubscriptions: pausedSubsCount,
      churnRatePercent: Number(((closedSubsCount / Math.max(1, allSubsCount)) * 100 + 2.4).toFixed(1)),
      pendingPaymentsCents: pendingInvoices.total,
      pendingInvoicesCount: pendingInvoices.count,
      revenueAtRiskCents,
      leakageCents: leakage.totalLeakageCents,
    },
    growthChart,
    plans,
    products,
    discounts,
    users,
    invoices,
    payments,
  });
});

// Plan CRUD
app.post('/api/admin/plans', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const parsed = PlanInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  const id = `plan_${crypto.randomBytes(4).toString('hex')}`;
  try {
    db.prepare(`
      INSERT INTO Plan (id, name, tagline, billingPeriod, price, costPrice, perksJson, badge, isRecommended, autoClose, allowPause, maxPauseDays, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      d.name,
      d.tagline,
      d.billingPeriod,
      d.price,
      d.costPrice,
      JSON.stringify(d.perks),
      d.badge || null,
      d.isRecommended ? 1 : 0,
      d.autoClose ? 1 : 0,
      d.allowPause ? 1 : 0,
      d.maxPauseDays,
      new Date().toISOString()
    );
    res.status(201).json({ id, message: 'Plan created.' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/admin/plans/:id', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const parsed = PlanInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  db.prepare(`
    UPDATE Plan
    SET name = ?, tagline = ?, billingPeriod = ?, price = ?, costPrice = ?, perksJson = ?,
        badge = ?, isRecommended = ?, autoClose = ?, allowPause = ?, maxPauseDays = ?
    WHERE id = ?
  `).run(
    d.name,
    d.tagline,
    d.billingPeriod,
    d.price,
    d.costPrice,
    JSON.stringify(d.perks),
    d.badge || null,
    d.isRecommended ? 1 : 0,
    d.autoClose ? 1 : 0,
    d.allowPause ? 1 : 0,
    d.maxPauseDays,
    req.params.id
  );
  res.json({ message: 'Plan updated.' });
});

app.delete('/api/admin/plans/:id', requireAuth(['ADMIN']), (req, res) => {
  const inUse = db.prepare('SELECT COUNT(*) as cnt FROM Subscription WHERE planId = ?').get(req.params.id) as { cnt: number };
  if (inUse.cnt > 0) {
    return res.status(400).json({ error: `Cannot delete plan with ${inUse.cnt} linked subscriptions.` });
  }
  db.prepare('DELETE FROM Plan WHERE id = ?').run(req.params.id);
  res.json({ message: 'Plan deleted.' });
});

// Product & Variant CRUD
app.post('/api/admin/products', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const parsed = ProductInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  const prodId = `prod_${crypto.randomBytes(4).toString('hex')}`;

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO Product (id, name, description, category, basePrice, costPrice, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(prodId, d.name, d.description, d.category, d.basePrice, d.costPrice, d.isActive ? 1 : 0, new Date().toISOString());

    if (d.variants && d.variants.length > 0) {
      const insertVar = db.prepare('INSERT INTO ProductVariant (id, productId, name, priceAdjustment) VALUES (?, ?, ?, ?)');
      for (const v of d.variants) {
        insertVar.run(`var_${crypto.randomBytes(4).toString('hex')}`, prodId, v.name, v.priceAdjustment);
      }
    }
  });

  tx();
  res.status(201).json({ id: prodId, message: 'Product and variants created.' });
});

app.put('/api/admin/products/:id', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const parsed = ProductInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE Product SET name = ?, description = ?, category = ?, basePrice = ?, costPrice = ?, isActive = ?
      WHERE id = ?
    `).run(d.name, d.description, d.category, d.basePrice, d.costPrice, d.isActive ? 1 : 0, req.params.id);

    if (d.variants) {
      db.prepare('DELETE FROM ProductVariant WHERE productId = ?').run(req.params.id);
      const insertVar = db.prepare('INSERT INTO ProductVariant (id, productId, name, priceAdjustment) VALUES (?, ?, ?, ?)');
      for (const v of d.variants) {
        insertVar.run(`var_${crypto.randomBytes(4).toString('hex')}`, req.params.id, v.name, v.priceAdjustment);
      }
    }
  });

  tx();
  res.json({ message: 'Product updated.' });
});

app.delete('/api/admin/products/:id', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  db.prepare('DELETE FROM Product WHERE id = ?').run(req.params.id);
  res.json({ message: 'Product deleted.' });
});

// Discount CRUD
app.post('/api/admin/discounts', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const parsed = DiscountInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }
  const d = parsed.data;
  const id = `disc_${crypto.randomBytes(4).toString('hex')}`;
  try {
    db.prepare(`
      INSERT INTO Discount (id, code, description, type, value, minQuantity, maxUses, usedCount, startDate, endDate, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
    `).run(
      id,
      d.code,
      d.description,
      d.type,
      d.value,
      d.minQuantity,
      d.maxUses,
      d.startDate,
      d.endDate,
      d.isActive ? 1 : 0,
      new Date().toISOString()
    );
    res.status(201).json({ id, message: `Discount ${d.code} created.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/discounts/:id', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  db.prepare('DELETE FROM Discount WHERE id = ?').run(req.params.id);
  res.json({ message: 'Discount deleted.' });
});

// --- REVENUE INTELLIGENCE & CHURN APIs (SECTIONS 9, 10, 12) ---

app.get('/api/intelligence/revenue-leakage', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const report = detectRevenueLeakage();
  res.json(report);
});

app.post('/api/intelligence/fix-leakage', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const { issueId } = req.body;
  if (!issueId) {
    return res.status(400).json({ error: 'issueId is required.' });
  }
  try {
    const result = fixSingleLeakageIssue(String(issueId), sessionUser.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/intelligence/auto-reconcile', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  try {
    const result = autoReconcileAllLeakage(sessionUser.id);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/intelligence/churn-prediction', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const predictions = calculateChurnPredictions();
  res.json(predictions);
});

app.post('/api/intelligence/apply-retention', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const { subscriptionId } = req.body;
  if (!subscriptionId) {
    return res.status(400).json({ error: 'subscriptionId is required.' });
  }

  const sub = db.prepare('SELECT * FROM Subscription WHERE id = ?').get(subscriptionId) as any;
  if (!sub) {
    return res.status(404).json({ error: 'Subscription not found.' });
  }

  db.prepare(`UPDATE Subscription SET retentionPromoCode = 'RETENTION15' WHERE id = ?`).run(subscriptionId);
  db.prepare(`
    INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt)
    VALUES (?, ?, 'APPLY_RETENTION_PROMO', 'Subscription', ?, ?, ?)
  `).run(
    `aud_${crypto.randomBytes(4).toString('hex')}`,
    sessionUser.id,
    subscriptionId,
    JSON.stringify({ promoCode: 'RETENTION15', discountPercent: 15 }),
    new Date().toISOString()
  );

  res.json({
    message: '15% Retention Promotion (RETENTION15) applied to subscriber next renewal cycle.',
    subscriptionId,
    promoCode: 'RETENTION15',
  });
});

app.get('/api/intelligence/executive-report', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const report = buildExecutiveReportMarkdown();
  res.json(report);
});

// --- SECURITY CENTER APIs (SECTION 11) ---

app.post('/api/security/checkout-rate-limit', (req, res) => {
  const sessionUser = getAuthUser(req);
  const parsed = CheckoutRateLimitSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0].message });
  }

  // Derive IP from server socket/proxy headers; allow admin security simulator to test specific bot IPs when explicitly authenticated as ADMIN/STAFF
  const serverDerivedIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '198.51.100.200';
  const effectiveIp =
    sessionUser && (sessionUser.role === 'ADMIN' || sessionUser.role === 'STAFF') && parsed.data.simulatedIp
      ? parsed.data.simulatedIp
      : serverDerivedIp;

  const evaluation = evaluateCheckoutAttempt({
    ipAddress: effectiveIp,
    userAgent: req.headers['user-agent'] || 'CheckoutClient/1.0',
    userId: sessionUser?.id || null,
    cardLast4: parsed.data.cardLast4,
    outcome: parsed.data.simulateOutcome,
  });

  res.status(evaluation.blocked ? 429 : 200).json({
    ipAddress: effectiveIp,
    ...evaluation,
  });
});

app.get('/api/security/dashboard', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const logs = db.prepare(`
    SELECT s.*, u.name as userName, u.email as userEmail
    FROM SecurityLog s
    LEFT JOIN User u ON u.id = s.userId
    ORDER BY s.createdAt DESC
  `).all().map((l: any) => ({
    ...l,
    resolved: Boolean(l.resolved),
    detailsParsed: JSON.parse(l.details || '{}'),
  }));

  const blocklist = db.prepare('SELECT * FROM IpBlocklist ORDER BY updatedAt DESC').all();
  const frozenUsers = db.prepare(`
    SELECT id, name, email, lastLoginIp, lastLoginCountry, isFrozen, tradeLockUntil
    FROM User WHERE isFrozen = 1
  `).all();

  const loginActivities = db.prepare(`
    SELECT l.*, u.name as userName, u.email as userEmail
    FROM LoginActivity l
    JOIN User u ON u.id = l.userId
    ORDER BY l.createdAt DESC LIMIT 25
  `).all();

  res.json({
    logs,
    blocklist,
    frozenUsers,
    loginActivities,
  });
});

app.post('/api/security/simulate-geo-jump', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const { userId = 'usr_gamer_1', fromCountry = 'US', toCountry = 'DE' } = req.body || {};
  const user = db.prepare('SELECT * FROM User WHERE id = ?').get(userId) as any;
  if (!user) {
    return res.status(404).json({ error: 'Target user not found.' });
  }

  const now = new Date();
  const lockUntil = new Date(now.getTime() + 48 * 3600 * 1000).toISOString();
  const jumpIp = '91.198.174.192';

  db.prepare(`
    UPDATE User
    SET isFrozen = 1, tradeLockUntil = ?, lastLoginCountry = ?, lastLoginIp = ?, lastLoginAt = ?
    WHERE id = ?
  `).run(lockUntil, toCountry, jumpIp, now.toISOString(), user.id);

  const secId = `sec_geo_${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(`
    INSERT INTO SecurityLog (id, userId, ipAddress, userAgent, eventType, severity, details, resolved, createdAt)
    VALUES (?, ?, ?, 'BrightloopSecurityProbe/2.0', 'GEO_IP_JUMP', 'HIGH', ?, 0, ?)
  `).run(
    secId,
    user.id,
    jumpIp,
    JSON.stringify({
      previousCountry: fromCountry,
      newCountry: toCountry,
      elapsedMinutes: 14,
      actionTaken: '48_HOUR_TRADE_LOCK_APPLIED',
      accountEmail: user.email,
      description: `Impossible travel velocity: Login from ${toCountry} 14 minutes after ${fromCountry} session. 48-hour trade lock enforced.`,
    }),
    now.toISOString()
  );

  res.json({
    message: `Geo-IP jump (${fromCountry} → ${toCountry} in 14m) logged. 48-hour trade lock placed on ${user.email}.`,
    tradeLockUntil: lockUntil,
  });
});

app.post('/api/security/unlock-account', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const { userId } = req.body;
  db.prepare('UPDATE User SET isFrozen = 0, tradeLockUntil = NULL WHERE id = ?').run(userId);
  db.prepare(`UPDATE SecurityLog SET resolved = 1 WHERE userId = ? AND eventType = 'GEO_IP_JUMP'`).run(userId);
  res.json({ message: '48-hour trade lock lifted and security alert marked resolved.' });
});

app.post('/api/security/unblock-ip', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const { ipAddress } = req.body;
  db.prepare('DELETE FROM IpBlocklist WHERE ipAddress = ?').run(ipAddress);
  db.prepare(`UPDATE SecurityLog SET resolved = 1 WHERE ipAddress = ?`).run(ipAddress);
  res.json({ message: `IP ${ipAddress} removed from blocklist.` });
});

// Reset demo database seed to initial state (helpful for re-testing leakage reconciliation)
app.post('/api/admin/reset-seed', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  seedDatabase(true);
  res.json({ message: 'Database reset to initial demonstrable seed state.' });
});

// --- VITE MIDDLEWARE & STATIC SERVING ---

async function startServer() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Brightloop Gaming full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
