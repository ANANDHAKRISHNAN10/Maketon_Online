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
    if (user) {
      const nowIso = new Date().toISOString();
      const failures = (db.prepare("SELECT COUNT(*) as count FROM SecurityLog WHERE userId = ? AND eventType = 'LOGIN_FAILED' AND createdAt >= ?").get(user.id, new Date(Date.now() - 15 * 60 * 1000).toISOString()) as any).count + 1;
      const severity = failures >= 5 ? 'HIGH' : failures >= 3 ? 'MEDIUM' : 'LOW';
      db.prepare(`INSERT INTO SecurityLog (id, userId, ipAddress, userAgent, eventType, severity, details, resolved, createdAt) VALUES (?, ?, ?, ?, 'LOGIN_FAILED', ?, ?, 0, ?)`)
        .run(`sec_login_${crypto.randomBytes(4).toString('hex')}`, user.id, (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown', req.headers['user-agent'] || 'Browser', severity, JSON.stringify({ failedAttempts: failures, windowMinutes: 15, description: `${failures} unsuccessful sign-in attempts were recorded for this account in 15 minutes.` }), nowIso);
    }
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const now = new Date();
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '203.0.113.10';
  const loginCountry = simulatedCountry || user.lastLoginCountry || 'US';
  const currentAgent = req.headers['user-agent'] || 'Browser';
  const previousLogin = db.prepare('SELECT userAgent FROM LoginActivity WHERE userId = ? ORDER BY createdAt DESC LIMIT 1').get(user.id) as any;
  const newDevice = Boolean(previousLogin && previousLogin.userAgent !== currentAgent);

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

  if (newDevice) {
    db.prepare(`INSERT INTO SecurityLog (id, userId, ipAddress, userAgent, eventType, severity, details, resolved, createdAt) VALUES (?, ?, ?, ?, 'NEW_DEVICE_LOGIN', 'MEDIUM', ?, 0, ?)`)
      .run(`sec_device_${crypto.randomBytes(4).toString('hex')}`, user.id, clientIp, currentAgent, JSON.stringify({ country: loginCountry, description: 'A successful sign-in used a browser or device signature not seen on the previous recorded sign-in.' }), now.toISOString());
  }

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
    SELECT i.*, p.name as planName
    FROM Invoice i
    LEFT JOIN Subscription s ON s.id = i.subscriptionId
    LEFT JOIN Plan p ON p.id = s.planId
    WHERE i.userId = ? ORDER BY i.createdAt DESC
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
    const existingSub = db.prepare('SELECT * FROM Subscription WHERE userId = ? ORDER BY createdAt DESC LIMIT 1').get(user.id) as any;

    if (discountCode) {
      const d = db.prepare('SELECT * FROM Discount WHERE code = ?').get(discountCode.toUpperCase()) as any;
      if (!d || !d.isActive || new Date(d.endDate) < now || new Date(d.startDate) > now || d.usedCount >= d.maxUses) {
        throw new Error(`Discount code "${discountCode}" is invalid, expired, or exhausted.`);
      }
      const applicablePlans = JSON.parse(d.planIdsJson || '[]') as string[];
      if (applicablePlans.length && !applicablePlans.includes(plan.id)) throw new Error('This discount is not valid for the selected plan.');
      if (plan.price < Number(d.minPurchaseCents || 0)) throw new Error('The selected plan does not meet this discount’s minimum purchase amount.');
      if (d.customerEligibility === 'NEW' && existingSub) throw new Error('This discount is available to new customers only.');
      if (d.customerEligibility === 'EXISTING' && !existingSub) throw new Error('This discount is available to existing customers only.');
      if (d.minQuantity > 1) throw new Error('This discount requires a multi item purchase and cannot be used on a single plan checkout.');
      discountAmount =
        d.type === 'PERCENT'
          ? Math.round((plan.price * d.value) / 100)
          : Math.min(plan.price, d.value);
      appliedCode = d.code;
      db.prepare('UPDATE Discount SET usedCount = usedCount + 1 WHERE id = ?').run(d.id);
    }

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

  if (sub.status !== 'CLOSED') {
    db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'CANCEL_SUBSCRIPTION', 'Subscription', ?, ?, ?)`)
      .run(`aud_${crypto.randomBytes(4).toString('hex')}`, sessionUser.id, sub.id, JSON.stringify({ previousStatus: sub.status }), new Date().toISOString());
  }

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
  const previous = db.prepare('SELECT parentEmail FROM User WHERE id = ?').get(sessionUser.id) as any;
  db.prepare(`
    UPDATE User
    SET parentEmail = ?, parentalPinHash = ?, parentalGateOn = ?
    WHERE id = ?
  `).run(parentEmail || null, hashPin(parentalPin), parentalGateOn ? 1 : 0, sessionUser.id);
  if ((previous?.parentEmail || null) !== (parentEmail || null)) {
    db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'ACCOUNT_OWNERSHIP_CHANGE', 'Customer', ?, ?, ?)`)
      .run(`aud_${crypto.randomBytes(4).toString('hex')}`, sessionUser.id, sessionUser.id, JSON.stringify({ relationshipContactChanged: true, source: 'PARENTAL_SETTINGS' }), new Date().toISOString());
  }

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
  const previous = db.prepare('SELECT name, parentEmail FROM User WHERE id = ?').get(sessionUser.id) as any;
  db.prepare('UPDATE User SET name = ?, parentEmail = ? WHERE id = ?').run(
    String(name).trim(),
    parentEmail || null,
    sessionUser.id
  );
  if ((previous?.parentEmail || null) !== (parentEmail || null) || previous?.name !== String(name).trim()) {
    db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'ACCOUNT_OWNERSHIP_CHANGE', 'Customer', ?, ?, ?)`)
      .run(`aud_${crypto.randomBytes(4).toString('hex')}`, sessionUser.id, sessionUser.id, JSON.stringify({ displayNameChanged: previous?.name !== String(name).trim(), relationshipContactChanged: (previous?.parentEmail || null) !== (parentEmail || null), source: 'PROFILE' }), new Date().toISOString());
  }
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
      db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'PARENTAL_AUTH_REQUEST', 'Customer', ?, ?, ?)`)
        .run(`aud_${crypto.randomBytes(4).toString('hex')}`, sessionUser.id, user.id, JSON.stringify({ status: parentalPin ? 'DENIED' : 'REQUESTED', invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amountCents: inv.totalAmount }), new Date().toISOString());
      return res.status(403).json({
        error: 'PARENTAL_PIN_REQUIRED',
        message: 'Valid 4-digit Parental PIN is required to authorize renewal payment.',
      });
    }
    db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'PARENTAL_AUTH_REQUEST', 'Customer', ?, ?, ?)`)
      .run(`aud_${crypto.randomBytes(4).toString('hex')}`, sessionUser.id, user.id, JSON.stringify({ status: 'AUTHORIZED', invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, amountCents: inv.totalAmount }), new Date().toISOString());
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
    productIds: JSON.parse(d.productIdsJson || '[]'),
    planIds: JSON.parse(d.planIdsJson || '[]'),
  }));

  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.parentEmail, u.parentalGateOn, u.lastLoginIp, u.lastLoginCountry, u.isFrozen, u.tradeLockUntil, u.createdAt,
           s.id as subscriptionId, s.status as subscriptionStatus, s.currentPeriodEnd, s.createdAt as subscriptionCreatedAt, s.perksFrozen,
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

// --- ADMIN SUBSCRIPTION MANAGEMENT ---
app.get('/api/admin/subscriptions', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const subscriptions = db.prepare(`
    SELECT s.*, u.name as customerName, u.email as customerEmail, u.role as customerRole,
           u.parentEmail, u.parentalGateOn, p.name as planName, p.billingPeriod,
           p.price as planPrice, p.allowPause, p.maxPauseDays
    FROM Subscription s
    JOIN User u ON u.id = s.userId
    JOIN Plan p ON p.id = s.planId
    ORDER BY s.createdAt DESC
  `).all().map((subscription: any) => ({
    ...subscription,
    allowPause: Boolean(subscription.allowPause),
    parentalGateOn: Boolean(subscription.parentalGateOn),
    invoices: db.prepare('SELECT * FROM Invoice WHERE subscriptionId = ? ORDER BY createdAt DESC').all(subscription.id),
    payments: db.prepare(`
      SELECT p.*, i.invoiceNumber FROM Payment p
      LEFT JOIN Invoice i ON i.id = p.invoiceId
      WHERE p.userId = ? ORDER BY p.createdAt DESC
    `).all(subscription.userId),
    pauseHistory: db.prepare('SELECT * FROM PauseHistory WHERE subscriptionId = ? ORDER BY createdAt DESC').all(subscription.id),
    activityLogs: db.prepare(`SELECT * FROM AuditLog WHERE entityType = 'Subscription' AND entityId = ? ORDER BY createdAt DESC`).all(subscription.id),
  }));
  const plans = db.prepare('SELECT id, name, billingPeriod, price, allowPause FROM Plan ORDER BY price ASC').all();
  res.json({ subscriptions, plans });
});

app.put('/api/admin/subscriptions/:id', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const { planId, currentPeriodStart, currentPeriodEnd } = req.body || {};
  const subscription = db.prepare('SELECT * FROM Subscription WHERE id = ?').get(req.params.id) as any;
  if (!subscription) return res.status(404).json({ error: 'Subscription not found.' });
  if (planId && !db.prepare('SELECT id FROM Plan WHERE id = ?').get(planId)) {
    return res.status(400).json({ error: 'Select a valid subscription plan.' });
  }
  const start = currentPeriodStart || subscription.currentPeriodStart;
  const end = currentPeriodEnd || subscription.currentPeriodEnd;
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || new Date(end) <= new Date(start)) {
    return res.status(400).json({ error: 'Expiry date must be after the start date.' });
  }
  db.prepare(`UPDATE Subscription SET planId = ?, currentPeriodStart = ?, currentPeriodEnd = ? WHERE id = ?`)
    .run(planId || subscription.planId, new Date(start).toISOString(), new Date(end).toISOString(), subscription.id);
  const actor = (req as any).user as SessionUser;
  db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'EDIT_SUBSCRIPTION', 'Subscription', ?, ?, ?)`)
    .run(`aud_${crypto.randomBytes(5).toString('hex')}`, actor.id, subscription.id, JSON.stringify({ planId: planId || subscription.planId, currentPeriodStart: start, currentPeriodEnd: end }), new Date().toISOString());
  res.json({ message: 'Subscription updated.', subscriptionId: subscription.id });
});

app.post('/api/admin/subscriptions/:id/renew', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const sub = db.prepare(`SELECT s.*, p.name as planName, p.billingPeriod, p.price, u.email as customerEmail
    FROM Subscription s JOIN Plan p ON p.id = s.planId JOIN User u ON u.id = s.userId WHERE s.id = ?`).get(req.params.id) as any;
  if (!sub) return res.status(404).json({ error: 'Subscription not found.' });
  const now = new Date();
  const days = sub.billingPeriod === 'DAILY' ? 1 : sub.billingPeriod === 'WEEKLY' ? 7 : sub.billingPeriod === 'QUARTERLY' ? 90 : sub.billingPeriod === 'YEARLY' ? 365 : 30;
  const periodEnd = new Date(now.getTime() + days * 86400000);
  const subtotal = sub.price;
  const tax = Math.round(subtotal * Number(process.env.GST_TAX_RATE_PERCENT || 18) / 100);
  const invoiceId = `inv_${crypto.randomBytes(5).toString('hex')}`;
  const invoiceNumber = `BL-${now.getUTCFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,'0')}-renew-${crypto.randomBytes(2).toString('hex')}`;
  const actor = (req as any).user as SessionUser;
  const tx = db.transaction(() => {
    db.prepare(`UPDATE Subscription SET status = 'ACTIVE', currentPeriodStart = ?, currentPeriodEnd = ?, perksFrozen = 0,
      pauseStartDate = NULL, pauseResumeDate = NULL, pausedDaysPlanned = NULL WHERE id = ?`)
      .run(now.toISOString(), periodEnd.toISOString(), sub.id);
    db.prepare(`INSERT INTO Invoice (id, invoiceNumber, subscriptionId, userId, billingPeriodKey, amountSubtotal, taxAmount, discountAmount, totalAmount, status, dueDate, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'CONFIRMED', ?, ?)`)
      .run(invoiceId, invoiceNumber, sub.id, sub.userId, periodKey, subtotal, tax, subtotal + tax, new Date(now.getTime()+7*86400000).toISOString(), now.toISOString());
    db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'ADMIN_RENEW_SUBSCRIPTION', 'Subscription', ?, ?, ?)`)
      .run(`aud_${crypto.randomBytes(5).toString('hex')}`, actor.id, sub.id, JSON.stringify({ invoiceNumber, currentPeriodEnd: periodEnd.toISOString() }), now.toISOString());
  });
  tx();
  res.json({ message: 'Subscription renewed and invoice created.', invoiceNumber, currentPeriodEnd: periodEnd.toISOString() });
});

app.post('/api/admin/invoices/:id/approve', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const invoice = db.prepare('SELECT * FROM Invoice WHERE id = ?').get(req.params.id) as any;
  if (!invoice) return res.status(404).json({ error: 'Invoice or quotation not found.' });
  if (invoice.status !== 'DRAFT') return res.status(400).json({ error: 'Only draft quotations can be approved.' });
  db.prepare(`UPDATE Invoice SET status = 'CONFIRMED' WHERE id = ?`).run(invoice.id);
  const actor = (req as any).user as SessionUser;
  db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'APPROVE_QUOTATION', 'Invoice', ?, ?, ?)`)
    .run(`aud_${crypto.randomBytes(5).toString('hex')}`, actor.id, invoice.id, JSON.stringify({ invoiceNumber: invoice.invoiceNumber }), new Date().toISOString());
  res.json({ message: 'Quotation approved.', invoiceId: invoice.id });
});

// --- CUSTOMER MANAGEMENT ---
app.get('/api/admin/customers', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const userRows = db.prepare(`SELECT id, name, email, role, isFrozen, parentalGateOn, createdAt, lastLoginAt
    FROM User WHERE role = 'GAMER' ORDER BY createdAt DESC`).all() as any[];
  const churnScores = new Map(calculateChurnPredictions().subscribers.map((item: any) => [item.userId, item.riskScore]));
  const customers = userRows.map((user: any) => {
    const subscriptions = db.prepare(`SELECT s.*, p.name as planName, p.billingPeriod, p.price as planPrice
      FROM Subscription s JOIN Plan p ON p.id = s.planId WHERE s.userId = ? ORDER BY s.createdAt DESC`).all(user.id) as any[];
    const invoices = db.prepare(`SELECT i.*, p.name as planName FROM Invoice i
      LEFT JOIN Subscription s ON s.id = i.subscriptionId LEFT JOIN Plan p ON p.id = s.planId
      WHERE i.userId = ? ORDER BY i.createdAt DESC`).all(user.id) as any[];
    const payments = db.prepare(`SELECT p.*, i.invoiceNumber FROM Payment p
      LEFT JOIN Invoice i ON i.id = p.invoiceId WHERE p.userId = ? ORDER BY p.createdAt DESC`).all(user.id) as any[];
    const disputes = db.prepare('SELECT * FROM CustomerDispute WHERE customerId = ? ORDER BY createdAt DESC').all(user.id);
    const loginActivity = db.prepare(`SELECT id, country, flaggedJump, createdAt FROM LoginActivity WHERE userId = ? ORDER BY createdAt DESC LIMIT 20`).all(user.id) as any[];
    const securityActivity = db.prepare(`SELECT id, eventType, severity, resolved, createdAt FROM SecurityLog WHERE userId = ? ORDER BY createdAt DESC LIMIT 20`).all(user.id) as any[];
    const subscriptionIds = subscriptions.map((s: any) => s.id);
    const adminActivity = subscriptionIds.flatMap((id: string) => db.prepare(`SELECT id, action, metadata, createdAt FROM AuditLog WHERE entityId = ? ORDER BY createdAt DESC LIMIT 20`).all(id) as any[]);
    const activeSubscriptions = subscriptions.filter((s: any) => s.status === 'ACTIVE').length;
    const totalSpendCents = payments.filter((p: any) => ['SUCCESS', 'SUCCEEDED'].includes(String(p.status).toUpperCase())).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
    const latestPayment = payments[0];
    const hasOverdue = invoices.some((i: any) => i.status === 'OVERDUE');
    const hasOutstanding = invoices.some((i: any) => ['CONFIRMED', 'DRAFT'].includes(i.status));
    const paymentStatus = hasOverdue ? 'OVERDUE' : latestPayment?.status === 'FAILED' ? 'FAILED' : hasOutstanding ? 'PENDING' : payments.length ? 'PAID' : 'NO PAYMENTS';
    const activityDates = [user.lastLoginAt, ...subscriptions.map((s: any) => s.createdAt), ...invoices.map((i: any) => i.createdAt), ...payments.map((p: any) => p.createdAt), ...loginActivity.map((a: any) => a.createdAt), ...securityActivity.map((a: any) => a.createdAt)].filter(Boolean).sort().reverse();
    const activity = [...loginActivity.map((a: any) => ({ ...a, kind: 'Sign in', detail: `Sign in from ${a.country}${a.flaggedJump ? ' · unusual location' : ''}` })), ...securityActivity.map((a: any) => ({ ...a, kind: 'Security', detail: `${a.eventType.replace(/_/g, ' ')} · ${a.severity}` })), ...adminActivity.map((a: any) => ({ ...a, kind: 'Subscription', detail: a.action.replace(/_/g, ' '), metadata: a.metadata }))].sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
    return { ...user, isFrozen: Boolean(user.isFrozen), parentalGateOn: Boolean(user.parentalGateOn), activeSubscriptions, totalSubscriptions: subscriptions.length, totalSpendCents, paymentStatus, customerStatus: user.isFrozen ? 'RESTRICTED' : activeSubscriptions ? 'ACTIVE' : 'INACTIVE', lastActivityAt: activityDates[0] || user.createdAt, riskScore: churnScores.get(user.id) ?? 0, rewardPoints: 1240, subscriptions, invoices, payments, disputes, activity };
  });
  res.json({ customers });
});

app.post('/api/admin/customers/:id/disputes', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const customer = db.prepare(`SELECT id FROM User WHERE id = ? AND role = 'GAMER'`).get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });
  const subject = String(req.body?.subject || '').trim();
  const description = String(req.body?.description || '').trim();
  const priority = ['LOW', 'NORMAL', 'HIGH'].includes(String(req.body?.priority).toUpperCase()) ? String(req.body.priority).toUpperCase() : 'NORMAL';
  if (subject.length < 3 || description.length < 8) return res.status(400).json({ error: 'Add a short subject and at least 8 characters of detail.' });
  const id = `dis_${crypto.randomBytes(5).toString('hex')}`;
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO CustomerDispute (id, customerId, subject, description, priority, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 'OPEN', ?, ?)`).run(id, req.params.id, subject, description, priority, now, now);
  const actor = (req as any).user as SessionUser;
  db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt)
    VALUES (?, ?, 'CREATE_CUSTOMER_DISPUTE', 'Customer', ?, ?, ?)`).run(`aud_${crypto.randomBytes(5).toString('hex')}`, actor.id, req.params.id, JSON.stringify({ disputeId: id, subject, priority }), now);
  res.status(201).json({ message: 'Customer dispute recorded.', disputeId: id });
});

app.put('/api/admin/disputes/:id', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const status = String(req.body?.status || '').toUpperCase();
  if (!['OPEN', 'IN_REVIEW', 'RESOLVED'].includes(status)) return res.status(400).json({ error: 'Choose Open, In review, or Resolved.' });
  const dispute = db.prepare('SELECT * FROM CustomerDispute WHERE id = ?').get(req.params.id) as any;
  if (!dispute) return res.status(404).json({ error: 'Dispute not found.' });
  const now = new Date().toISOString();
  db.prepare('UPDATE CustomerDispute SET status = ?, updatedAt = ?, resolvedAt = ? WHERE id = ?').run(status, now, status === 'RESOLVED' ? now : null, dispute.id);
  const actor = (req as any).user as SessionUser;
  db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt)
    VALUES (?, ?, 'UPDATE_CUSTOMER_DISPUTE', 'Customer', ?, ?, ?)`).run(`aud_${crypto.randomBytes(5).toString('hex')}`, actor.id, dispute.customerId, JSON.stringify({ disputeId: dispute.id, status }), now);
  res.json({ message: 'Dispute status updated.', status });
});

// --- ADMIN BILLING & PAYMENT MANAGEMENT ---
app.get('/api/admin/billing', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const invoices = db.prepare(`SELECT i.*, u.name as customerName, u.email as customerEmail,
    s.planId, p.name as planName, p.billingPeriod
    FROM Invoice i JOIN User u ON u.id = i.userId
    LEFT JOIN Subscription s ON s.id = i.subscriptionId LEFT JOIN Plan p ON p.id = s.planId
    ORDER BY i.createdAt DESC`).all().map((invoice: any) => ({
      ...invoice,
      lastSentAt: (db.prepare(`SELECT createdAt FROM AuditLog WHERE entityType = 'Invoice' AND entityId = ? AND action = 'SEND_INVOICE' ORDER BY createdAt DESC LIMIT 1`).get(invoice.id) as any)?.createdAt || null,
    }));
  const payments = db.prepare(`SELECT p.*, u.name as customerName, u.email as customerEmail, i.invoiceNumber
    FROM Payment p JOIN User u ON u.id = p.userId LEFT JOIN Invoice i ON i.id = p.invoiceId
    ORDER BY p.createdAt DESC`).all();
  const subscriptions = db.prepare(`SELECT s.*, u.name as customerName, u.email as customerEmail,
    p.name as planName, p.billingPeriod, p.price as planPrice
    FROM Subscription s JOIN User u ON u.id = s.userId JOIN Plan p ON p.id = s.planId
    WHERE s.status = 'ACTIVE' ORDER BY s.currentPeriodEnd ASC`).all();
  res.json({ invoices, payments, subscriptions });
});

app.post('/api/admin/invoices/:id/send', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const invoice = db.prepare(`SELECT i.*, u.email as customerEmail FROM Invoice i JOIN User u ON u.id = i.userId WHERE i.id = ?`).get(req.params.id) as any;
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  const actor = (req as any).user as SessionUser;const now = new Date().toISOString();
  db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'SEND_INVOICE', 'Invoice', ?, ?, ?)`)
    .run(`aud_${crypto.randomBytes(5).toString('hex')}`, actor.id, invoice.id, JSON.stringify({ recipient: invoice.customerEmail, delivery: 'DEMO_DELIVERY_LOGGED' }), now);
  res.json({ message: `Invoice delivery recorded for ${invoice.customerEmail}.`, recipient: invoice.customerEmail, sentAt: now, deliveryMode: 'DEMO' });
});

app.post('/api/admin/payments/:id/refund', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const payment = db.prepare('SELECT * FROM Payment WHERE id = ?').get(req.params.id) as any;
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });
  if (payment.status !== 'SUCCESS') return res.status(400).json({ error: 'Only successful payments can be refunded.' });
  const amount = req.body?.amountCents === undefined ? payment.amount : Number(req.body.amountCents);
  if (!Number.isInteger(amount) || amount <= 0) return res.status(400).json({ error: 'Enter a valid refund amount.' });
  const prior = db.prepare(`SELECT COALESCE(SUM(ABS(amount)), 0) as refunded FROM Payment WHERE referenceCode LIKE ? AND status = 'REFUNDED'`).get(`RF-${payment.referenceCode}-%`) as any;
  if (amount + Number(prior.refunded) > payment.amount) return res.status(400).json({ error: 'Refund amount exceeds the remaining captured payment.' });
  const now = new Date().toISOString();const refundId = `pay_${crypto.randomBytes(5).toString('hex')}`;
  const referenceCode = `RF-${payment.referenceCode}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  db.prepare(`INSERT INTO Payment (id, invoiceId, userId, amount, method, status, referenceCode, ipAddress, createdAt)
    VALUES (?, ?, ?, ?, 'REFUND', 'REFUNDED', ?, ?, ?)`)
    .run(refundId, payment.invoiceId, payment.userId, -amount, referenceCode, payment.ipAddress, now);
  const actor = (req as any).user as SessionUser;
  db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'RECORD_REFUND', 'Payment', ?, ?, ?)`)
    .run(`aud_${crypto.randomBytes(5).toString('hex')}`, actor.id, payment.id, JSON.stringify({ refundId, referenceCode, amountCents: amount }), now);
  res.status(201).json({ message: 'Refund recorded.', refundId, referenceCode, amountCents: amount });
});

app.post('/api/admin/payments/:id/link', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const payment = db.prepare('SELECT * FROM Payment WHERE id = ?').get(req.params.id) as any;
  const invoice = db.prepare('SELECT * FROM Invoice WHERE id = ?').get(String(req.body?.invoiceId || '')) as any;
  if (!payment) return res.status(404).json({ error: 'Payment not found.' });
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  if (payment.userId !== invoice.userId) return res.status(400).json({ error: 'Payment and invoice must belong to the same customer.' });
  db.prepare('UPDATE Payment SET invoiceId = ? WHERE id = ?').run(invoice.id, payment.id);
  const actor = (req as any).user as SessionUser;
  db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, 'LINK_PAYMENT_TO_INVOICE', 'Payment', ?, ?, ?)`)
    .run(`aud_${crypto.randomBytes(5).toString('hex')}`, actor.id, payment.id, JSON.stringify({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber }), new Date().toISOString());
  res.json({ message: 'Payment linked to invoice.', invoiceNumber: invoice.invoiceNumber });
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
      INSERT INTO Discount (id, code, description, type, value, minQuantity, maxUses, usedCount, minPurchaseCents, productIdsJson, planIdsJson, customerEligibility, startDate, endDate, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      d.code,
      d.description,
      d.type,
      d.value,
      d.minQuantity,
      d.maxUses,
      d.minPurchaseCents,
      JSON.stringify(d.productIds),
      JSON.stringify(d.planIds),
      d.customerEligibility,
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

app.put('/api/admin/discounts/:id', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const existing = db.prepare('SELECT id FROM Discount WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Discount not found.' });
  const isActive = Boolean(req.body?.isActive);
  db.prepare('UPDATE Discount SET isActive = ? WHERE id = ?').run(isActive ? 1 : 0, req.params.id);
  res.json({ message: `Discount ${isActive ? 'activated' : 'paused'}.` });
});

// --- REVENUE INTELLIGENCE & CHURN APIs (SECTIONS 9, 10, 12) ---

app.get('/api/intelligence/revenue-leakage', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const report = detectRevenueLeakage();
  const workflows = db.prepare(`SELECT * FROM AuditLog WHERE (entityType = 'LeakageIssue' OR action = 'RECONCILE_LEAKAGE') ORDER BY createdAt DESC`).all() as any[];
  const latest = new Map<string, any>();
  workflows.forEach((row) => {
    const meta = JSON.parse(row.metadata || '{}');
    const issueId = meta.issueId || row.entityId;
    if (issueId && !latest.has(issueId)) latest.set(issueId, { ...row, details: meta });
  });
  const resolvedActions = workflows.filter(row => ['RECONCILE_LEAKAGE','RESOLVE_LEAKAGE_ISSUE'].includes(row.action));
  const resolved = new Map<string, any>();
  resolvedActions.forEach((row) => {
    const meta = JSON.parse(row.metadata || '{}'); const issueId = meta.issueId || row.entityId;
    if (!issueId || resolved.has(issueId)) return;
    const snapshot = meta.issueSnapshot || {};
    resolved.set(issueId, { ...snapshot, id: issueId, issueType: snapshot.issueType || row.entityType, title: snapshot.title || meta.resolutionSummary || 'Revenue finding resolved', customerName: snapshot.customerName || 'Customer record', customerEmail: snapshot.customerEmail || '', userId: snapshot.userId || '', entityId: snapshot.entityId || row.entityId, financialImpactCents: Number(snapshot.financialImpactCents ?? meta.impactRecoveredCents ?? 0), severity: snapshot.severity || 'MEDIUM', suggestedCorrection: snapshot.suggestedCorrection || 'Review reconciliation history.', forensicDetails: snapshot.forensicDetails || {}, status: 'RESOLVED', detectedAt: snapshot.detectedAt || row.createdAt, resolvedAt: row.createdAt, resolutionSummary: meta.resolutionSummary || 'Marked resolved by staff.' });
  });
  const issues = report.issues.filter(issue => !resolved.has(issue.id)).map(issue => {
    const workflow = latest.get(issue.id);
    return { ...issue, status: workflow?.action === 'ASSIGN_LEAKAGE_ISSUE' ? 'ASSIGNED' : 'PENDING', assignedTo: workflow?.details?.assigneeName || '', assignedToId: workflow?.details?.assigneeId || '' };
  });
  const resolvedIssues = [...resolved.values()];
  const uniqueImpact = new Map<string, number>();
  issues.forEach(issue => uniqueImpact.set(issue.impactKey || issue.id, Math.max(uniqueImpact.get(issue.impactKey || issue.id) || 0, issue.financialImpactCents)));
  const currentLeakageCents = [...uniqueImpact.values()].reduce((sum, value) => sum + value, 0);
  const staff = db.prepare(`SELECT id, name, email, role FROM User WHERE role IN ('ADMIN','STAFF') ORDER BY role, name`).all();
  res.json({ ...report, issues, totalLeakageCents: currentLeakageCents, potentiallyRecoverableCents: currentLeakageCents, resolvedIssues, totalDetectedIssues: issues.length + resolvedIssues.length, resolvedCount: resolvedIssues.length, pendingCount: issues.filter(issue => issue.status === 'PENDING').length, assignedCount: issues.filter(issue => issue.status === 'ASSIGNED').length, staff });
});

app.post('/api/intelligence/leakage-action', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const { issueId, action, assigneeId } = req.body || {};
  const issue = detectRevenueLeakage().issues.find(item => item.id === String(issueId || ''));
  if (!issue) return res.status(404).json({ error: 'Finding not found or already resolved.' });
  if (!['RESOLVE','ASSIGN'].includes(String(action))) return res.status(400).json({ error: 'Choose resolve or assign.' });
  let metadata: any = { issueId: issue.id, issueSnapshot: issue };
  if (action === 'ASSIGN') {
    const assignee = db.prepare(`SELECT id, name, role FROM User WHERE id = ? AND role IN ('ADMIN','STAFF')`).get(String(assigneeId || '')) as any;
    if (!assignee) return res.status(400).json({ error: 'Select an admin or staff member.' });
    metadata = { ...metadata, assigneeId: assignee.id, assigneeName: assignee.name };
  }
  const actionName = action === 'RESOLVE' ? 'RESOLVE_LEAKAGE_ISSUE' : 'ASSIGN_LEAKAGE_ISSUE';
  db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, ?, 'LeakageIssue', ?, ?, ?)`)
    .run(`aud_${crypto.randomBytes(5).toString('hex')}`, sessionUser.id, actionName, issue.id, JSON.stringify(metadata), new Date().toISOString());
  res.json({ message: action === 'RESOLVE' ? 'Finding marked resolved.' : 'Finding assigned to staff.', issueId: issue.id });
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
  res.json({ ...predictions, predictionMode: 'RULE_BASED_SIMULATED', modelConnected: false, generatedAt: new Date().toISOString(), weights: { failedPayments: 20, renewalHistory: 15, expiry: 15, repeatedCancellations: 15, pauseFrequency: 15, usageReduction: 10, paymentDelays: 10 } });
});

app.get('/api/intelligence/revenue-forecast', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const months = Array.from({ length: 12 }, (_, index) => new Date(start.getFullYear(), start.getMonth() + index, 1));
  const keyOf = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
  const historyMap = new Map(months.map(month => [keyOf(month), 0]));
  const historicalPayments = db.prepare(`SELECT amount, status, createdAt FROM Payment WHERE status IN ('SUCCESS','REFUNDED') AND createdAt >= ? ORDER BY createdAt`).all(start.toISOString()) as any[];
  historicalPayments.forEach(payment => { const key = keyOf(new Date(payment.createdAt)); if (historyMap.has(key)) historyMap.set(key, (historyMap.get(key)||0) + Number(payment.amount||0)); });
  const historicalRevenue = months.map(month => ({ month: month.toLocaleString('en-US',{month:'short',year:'2-digit'}), monthKey: keyOf(month), actualCents: historyMap.get(keyOf(month))||0 }));
  const active = db.prepare(`SELECT s.id as subscriptionId, s.userId, s.planId, s.currentPeriodEnd, s.retentionPromoCode, p.name as planName, p.price, p.billingPeriod FROM Subscription s JOIN Plan p ON p.id = s.planId WHERE s.status = 'ACTIVE'`).all() as any[];
  const churn = calculateChurnPredictions().subscribers;
  const riskBySub = new Map(churn.map((record:any) => [record.subscriptionId, record.riskScore]));
  const mrrOf = (price:number, period:string) => period==='DAILY'?price*30:period==='WEEKLY'?price*4:period==='QUARTERLY'?Math.round(price/3):period==='YEARLY'?Math.round(price/12):price;
  const currentMrrCents = active.reduce((sum, sub) => sum + mrrOf(sub.price,sub.billingPeriod),0);
  const payments12m = db.prepare(`SELECT status FROM Payment WHERE createdAt >= ? AND status IN ('SUCCESS','FAILED')`).all(start.toISOString()) as any[];
  const successCount = payments12m.filter(p=>p.status==='SUCCESS').length;
  const failedCount = payments12m.filter(p=>p.status==='FAILED').length;
  const paymentSuccessRate = successCount+failedCount ? successCount/(successCount+failedCount) : 0.95;
  const retentionDiscount = db.prepare(`SELECT value,type FROM Discount WHERE code = 'RETENTION15' AND isActive = 1`).get() as any;
  const events:any[]=[];
  const horizonEnd = new Date(now.getFullYear()+1,now.getMonth()+1,1);
  const taxRate = Number(process.env.GST_TAX_RATE_PERCENT || 18);
  const intervalDays:Record<string,number>={DAILY:1,WEEKLY:7,MONTHLY:30,QUARTERLY:90,YEARLY:365};
  for (const sub of active) {
    let due = new Date(sub.currentPeriodEnd);
    if (!Number.isFinite(due.getTime())) continue;
    const step = (intervalDays[sub.billingPeriod]||30)*86400000;
    let skipped=0;
    while(due<now && skipped<48){due=new Date(due.getTime()+step);skipped++;}
    const discount = sub.retentionPromoCode==='RETENTION15' && retentionDiscount ? (retentionDiscount.type==='PERCENT'?Math.round(sub.price*Number(retentionDiscount.value)/100):Math.min(sub.price,Number(retentionDiscount.value))) : 0;
    const subtotal = Math.max(0,sub.price-discount); const invoiceValue=subtotal+Math.round(subtotal*taxRate/100);
    let cycle=0;
    while(due<horizonEnd && cycle<14){
      if(due>=now){events.push({subscriptionId:sub.subscriptionId,userId:sub.userId,planName:sub.planName,billingPeriod:sub.billingPeriod,dueAt:due.toISOString(),monthKey:keyOf(due),amountCents:invoiceValue,discountCents:discount,riskScore:Number(riskBySub.get(sub.subscriptionId)||35)});}
      due=new Date(due.getTime()+step);cycle++;
    }
  }
  const renewalValue30dCents=events.filter(event=>new Date(event.dueAt).getTime()<=now.getTime()+30*86400000).reduce((sum,event)=>sum+event.amountCents,0);
  const cancelHistory = db.prepare(`SELECT createdAt, COUNT(*) as count FROM AuditLog WHERE action = 'CANCEL_SUBSCRIPTION' AND createdAt >= ? GROUP BY substr(createdAt,1,7)`).all(start.toISOString()) as any[];
  const cancelMap=new Map(cancelHistory.map(row=>[String(row.createdAt).slice(0,7),Number(row.count)]));
  const cancellationHistory=historicalRevenue.map(month=>({month:month.month,monthKey:month.monthKey,cancellations:cancelMap.get(month.monthKey)||0}));
  const last3=historicalRevenue.slice(-3).reduce((sum,row)=>sum+row.actualCents,0)/3;
  const prior3=historicalRevenue.slice(-6,-3).reduce((sum,row)=>sum+row.actualCents,0)/3;
  const historicalTrend=prior3>0?Math.max(-0.08,Math.min(0.08,(last3-prior3)/prior3*0.25)):0;
  const discountUsage=db.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(discountAmount),0) as amount FROM Invoice WHERE createdAt >= ? AND discountAmount > 0`).get(start.toISOString()) as any;
  const upcomingRenewals=events.sort((a,b)=>a.dueAt.localeCompare(b.dueAt)).slice(0,40);
  res.json({ currentMrrCents, annualRecurringRevenueCents:currentMrrCents*12, activeSubscriptionCount:active.length,
    historicalRevenue, renewalEvents:events, upcomingRenewals, renewalValue30dCents, cancellationHistory,
    paymentSuccessRate, paymentSuccessCount:successCount, paymentFailureCount:failedCount,
    historicalTrend, retentionDiscountUsage:{count:Number(discountUsage.count),amountCents:Number(discountUsage.amount)},
    predictedLostRevenueCents:events.filter(event=>event.monthKey===keyOf(new Date(now.getFullYear(),now.getMonth()+1,1))).reduce((sum,event)=>sum+Math.round(event.amountCents*event.riskScore/100),0),
    generatedAt:now.toISOString(), modelConnected:false, predictionMode:'RULE_BASED_SIMULATED', taxRatePercent:taxRate });
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

app.post('/api/intelligence/retention-action', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const { subscriptionId, action, points = 500 } = req.body || {};
  const allowed = ['REMINDER', 'LOYALTY_POINTS', 'PAUSE_SUGGESTION', 'CONTACT'];
  if (!subscriptionId || !allowed.includes(String(action))) return res.status(400).json({ error: 'Choose a valid customer retention action.' });
  const subscription = db.prepare(`SELECT s.id, s.userId, u.name, u.email FROM Subscription s JOIN User u ON u.id = s.userId WHERE s.id = ?`).get(subscriptionId) as any;
  if (!subscription) return res.status(404).json({ error: 'Subscription not found.' });
  const safePoints = Math.max(100, Math.min(5000, Math.round(Number(points) || 500)));
  const descriptions: Record<string,string> = { REMINDER: 'Renewal reminder queued in the demo workflow.', LOYALTY_POINTS: `${safePoints} loyalty points offer recorded for review.`, PAUSE_SUGGESTION: 'Flexible pause suggestion recorded for the next customer conversation.', CONTACT: 'Customer contact follow-up recorded for the retention team.' };
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, ?, 'Subscription', ?, ?, ?)`)
    .run(`aud_${crypto.randomBytes(4).toString('hex')}`, sessionUser.id, `RETENTION_${action}`, subscriptionId, JSON.stringify({ customerId: subscription.userId, customerEmail: subscription.email, points: action === 'LOYALTY_POINTS' ? safePoints : undefined, mode: 'DEMO_ACTION_LOGGED' }), now);
  res.json({ message: descriptions[action], customerName: subscription.name, action, demoAction: true });
});

app.get('/api/intelligence/executive-report', requireAuth(['ADMIN', 'STAFF']), (_req, res) => {
  const report = buildExecutiveReportMarkdown();
  res.json(report);
});

function businessReportData(startValue?: string, endValue?: string) {
  const now = new Date();
  const end = endValue && Number.isFinite(Date.parse(endValue)) ? new Date(`${endValue.slice(0,10)}T23:59:59.999Z`) : now;
  const start = startValue && Number.isFinite(Date.parse(startValue)) ? new Date(`${startValue.slice(0,10)}T00:00:00.000Z`) : new Date(end.getTime()-29*86400000);
  const span = Math.max(1, end.getTime()-start.getTime()+1);
  const previousStart = new Date(start.getTime()-span);
  const revenueFor = (from:Date,to:Date) => Number((db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM Payment WHERE status IN ('SUCCESS','REFUNDED') AND createdAt >= ? AND createdAt <= ?`).get(from.toISOString(),to.toISOString()) as any).total||0);
  const actualRevenueCents = revenueFor(start,end); const previousRevenueCents = revenueFor(previousStart,new Date(start.getTime()-1));
  const deltaCents = actualRevenueCents-previousRevenueCents; const deltaPercent = previousRevenueCents ? deltaCents/Math.abs(previousRevenueCents)*100 : null;
  const activeSubscriptions = db.prepare(`SELECT s.id,s.userId,s.currentPeriodEnd,p.name as planName,p.price,p.billingPeriod,u.name as customerName,u.email as customerEmail FROM Subscription s JOIN Plan p ON p.id=s.planId JOIN User u ON u.id=s.userId WHERE s.status='ACTIVE'`).all() as any[];
  const mrrCents = activeSubscriptions.reduce((sum,sub)=>sum+(sub.billingPeriod==='DAILY'?sub.price*30:sub.billingPeriod==='WEEKLY'?sub.price*4:sub.billingPeriod==='QUARTERLY'?Math.round(sub.price/3):sub.billingPeriod==='YEARLY'?Math.round(sub.price/12):sub.price),0);
  const upcoming = activeSubscriptions.filter(sub=>new Date(sub.currentPeriodEnd)>=now&&new Date(sub.currentPeriodEnd)<=new Date(now.getTime()+30*86400000)).map(sub=>({...sub,renewalValueCents:sub.price+Math.round(sub.price*Number(process.env.GST_TAX_RATE_PERCENT||18)/100)}));
  const unpaidInvoices = db.prepare(`SELECT i.*,u.name as customerName,u.email as customerEmail,p.name as planName FROM Invoice i JOIN User u ON u.id=i.userId LEFT JOIN Subscription s ON s.id=i.subscriptionId LEFT JOIN Plan p ON p.id=s.planId WHERE i.status IN ('CONFIRMED','OVERDUE') ORDER BY i.dueDate ASC`).all() as any[];
  const overdueInvoices = unpaidInvoices.filter(inv=>new Date(inv.dueDate)<now);
  const followups = db.prepare(`SELECT entityId,metadata,createdAt FROM AuditLog WHERE action='COLLECTION_FOLLOW_UP' AND entityType='Invoice' ORDER BY createdAt DESC`).all() as any[];
  const followupsByInvoice = new Map<string,any[]>();
  for (const item of followups) { const list=followupsByInvoice.get(item.entityId)||[];list.push({...item,details:JSON.parse(item.metadata||'{}')});followupsByInvoice.set(item.entityId,list); }
  const delayCounts = db.prepare(`SELECT p.userId,COUNT(*) as count FROM Payment p LEFT JOIN Invoice i ON i.id=p.invoiceId WHERE p.status='FAILED' OR (p.status='SUCCESS' AND i.dueDate IS NOT NULL AND p.createdAt>i.dueDate) GROUP BY p.userId`).all() as any[];
  const failedByUser=new Map(delayCounts.map(row=>[row.userId,Number(row.count)]));
  const grouped = new Map<string,any>();
  for(const invoice of overdueInvoices){const row=grouped.get(invoice.userId)||{userId:invoice.userId,customerName:invoice.customerName,customerEmail:invoice.customerEmail,outstandingCents:0,daysOverdue:0,invoiceCount:0,invoices:[],payments:[],previousFollowUps:0,followUpHistory:[]};const daysOverdue=Math.max(1,Math.floor((now.getTime()-new Date(invoice.dueDate).getTime())/86400000));const invoiceFollowups=followupsByInvoice.get(invoice.id)||[];row.outstandingCents+=invoice.totalAmount;row.daysOverdue=Math.max(row.daysOverdue,daysOverdue);row.invoiceCount++;row.invoices.push({id:invoice.id,invoiceNumber:invoice.invoiceNumber,totalAmount:invoice.totalAmount,dueDate:invoice.dueDate,status:invoice.status,subscriptionId:invoice.subscriptionId,planName:invoice.planName});row.previousFollowUps+=invoiceFollowups.length;row.followUpHistory.push(...invoiceFollowups.map((f:any)=>({invoiceNumber:invoice.invoiceNumber,createdAt:f.createdAt,scheduledAt:f.details.scheduledAt||null,notes:f.details.notes||''})));grouped.set(invoice.userId,row);}
  const collectionPriorities=[...grouped.values()].map(row=>{row.payments=db.prepare(`SELECT p.id,p.amount,p.status,p.method,p.referenceCode,p.createdAt,i.invoiceNumber FROM Payment p LEFT JOIN Invoice i ON i.id=p.invoiceId WHERE p.userId=? ORDER BY p.createdAt DESC LIMIT 20`).all(row.userId);const delays=failedByUser.get(row.userId)||0;row.repeatedPaymentDelays=delays;row.priorityScore=row.outstandingCents*Math.max(1,row.daysOverdue)*(1+Math.min(delays,5)*.15)+row.previousFollowUps*100;row.priority=row.priorityScore>=1000000?'CRITICAL':row.priorityScore>=200000?'HIGH':'NORMAL';row.recommendedAction=delays?'Contact customer and review repeated failed or late payment history.':row.daysOverdue>=14?'Escalate collection and confirm invoice receipt.':'Send a friendly payment reminder.';return row;}).sort((a,b)=>b.priorityScore-a.priorityScore);
  const churn=calculateChurnPredictions();
  const leakage=detectRevenueLeakage();
  const periodInvoices=db.prepare(`SELECT COUNT(*) as count,COALESCE(SUM(discountAmount),0) as discountCents,COALESCE(SUM(CASE WHEN status='PAID' THEN totalAmount ELSE 0 END),0) as discountedRevenueCents FROM Invoice WHERE createdAt>=? AND createdAt<=? AND discountAmount>0`).get(start.toISOString(),end.toISOString()) as any;
  const overdueCents=overdueInvoices.reduce((sum,inv)=>sum+inv.totalAmount,0);const outstandingCents=unpaidInvoices.reduce((sum,inv)=>sum+inv.totalAmount,0);const failedPayments=db.prepare(`SELECT COUNT(*) as count,COALESCE(SUM(amount),0) as amount FROM Payment WHERE status='FAILED' AND createdAt>=? AND createdAt<=?`).get(start.toISOString(),end.toISOString()) as any;
  const sections=[
    {key:'revenue',title:'Revenue analysis',valueCents:actualRevenueCents,detail:`Net successful payment records, including recorded refunds, from ${start.toLocaleDateString()} to ${end.toLocaleDateString()}.`,available:true},
    {key:'comparison',title:'Month-on-month comparison',valueCents:deltaCents,detail:deltaPercent===null?'Previous comparable period has no recorded payment baseline.':`${deltaPercent>=0?'+':''}${deltaPercent.toFixed(1)}% compared with the preceding ${Math.round(span/86400000)}-day period.`,available:previousRevenueCents!==0},
    {key:'subscriptions',title:'Active subscription analysis',value:activeSubscriptions.length,valueCents:mrrCents,detail:`${activeSubscriptions.length} active subscriptions · current MRR ${mrrCents} cents.`,available:true},
    {key:'renewals',title:'Upcoming renewal analysis',value:upcoming.length,valueCents:upcoming.reduce((sum,sub)=>sum+sub.renewalValueCents,0),detail:`${upcoming.length} current subscriptions renew within 30 days.`,available:true},
    {key:'overdue',title:'Overdue invoice analysis',value:overdueInvoices.length,valueCents:overdueCents,detail:`${overdueInvoices.length} invoices past due; based on stored due dates.`,available:true},
    {key:'outstanding',title:'Outstanding payment analysis',value:unpaidInvoices.length,valueCents:outstandingCents,detail:`Unpaid confirmed and overdue invoices; draft quotes excluded.`,available:true},
    {key:'churn',title:'Customer churn analysis',value:churn.groups.highRisk.length,valueCents:churn.groups.highRisk.reduce((sum,sub)=>sum+sub.planPriceCents,0),detail:`${churn.groups.highRisk.length} high-risk customers from rule-based simulated churn scores.`,available:true},
    {key:'leakage',title:'Revenue leakage analysis',value:leakage.issues.length,valueCents:leakage.totalLeakageCents,detail:`${leakage.issues.length} open findings; underlying records deduplicated in leakage total.`,available:true},
    {key:'discounts',title:'Discount performance',value:Number(periodInvoices.count),valueCents:Number(periodInvoices.discountedRevenueCents),secondaryCents:Number(periodInvoices.discountCents),detail:`${periodInvoices.count} discounted invoices · recorded savings ${Number(periodInvoices.discountCents)} cents.`,available:true},
    {key:'risks',title:'Financial risks',value:null,valueCents:null,detail:`Overdue balance ${overdueCents} cents; leakage exposure ${leakage.totalLeakageCents} cents; ${failedPayments.count} failed payment attempts. These categories can overlap, so no combined loss total is calculated.`,available:true},
  ];
  return {generatedAt:now.toISOString(),range:{start:start.toISOString(),end:end.toISOString(),previousStart:previousStart.toISOString(),previousEnd:new Date(start.getTime()-1).toISOString()},revenue:{actualRevenueCents,previousRevenueCents,deltaCents,deltaPercent,mrrCents,arrCents:mrrCents*12},sections,activeSubscriptions,upcomingRenewals:upcoming,overdueInvoices,outstandingCents,overdueCents,collectionPriorities,churn:{high:churn.groups.highRisk.length,medium:churn.groups.mediumRisk.length,low:churn.groups.lowRisk.length,highRiskCustomers:churn.groups.highRisk.map((s:any)=>({userId:s.userId,userName:s.userName,riskScore:s.riskScore,riskTier:s.riskTier,planName:s.planName}))},leakage:{count:leakage.issues.length,totalCents:leakage.totalLeakageCents,issues:leakage.issues},discountPerformance:{invoiceCount:Number(periodInvoices.count),discountCents:Number(periodInvoices.discountCents),discountedRevenueCents:Number(periodInvoices.discountedRevenueCents)},failedPaymentCount:Number(failedPayments.count),failedPaymentAmountCents:Number(failedPayments.amount),availability:{historicalRevenue:'Payment records are available from the application database.',usage:'Product usage analytics are not recorded; no usage-based financial conclusions are included.',discountAttribution:'Revenue is shown for paid invoices containing a discount; incremental lift versus no discount is unavailable.'}};
}

app.get('/api/intelligence/business-report', requireAuth(['ADMIN','STAFF']), (req,res)=>{
  res.json(businessReportData(String(req.query.start||''),String(req.query.end||'')));
});

app.post('/api/intelligence/business-report/query', requireAuth(['ADMIN','STAFF']), (req,res)=>{
  const query=String(req.body?.question||'').trim();if(!query)return res.status(400).json({error:'Enter a question about your business records.'});
  const normalized=query.toLowerCase();const questionStart=/this month/.test(normalized)?new Date().toISOString().slice(0,8)+'01':String(req.body?.start||'');const questionEnd=/this month/.test(normalized)?new Date().toISOString().slice(0,10):String(req.body?.end||'');const report=businessReportData(questionStart,questionEnd);
  let result:any={title:'Information unavailable',summary:'I could not map this question to the financial, subscription, payment, churn, or leakage records currently available.',metrics:[],records:[],availabilityNote:'No unsupported figures were inferred.'};
  if(/revenue|generated|income|sales/.test(normalized)) result={title:'Recorded revenue',summary:`Recorded net payment revenue for the selected period is ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(report.revenue.actualRevenueCents/100)}. This includes successful payment records and refunds; forecasts are excluded.`,metrics:[{label:'Actual net revenue',amountCents:report.revenue.actualRevenueCents},{label:'Previous comparable period',amountCents:report.revenue.previousRevenueCents}],records:[],availabilityNote:'Values come from Payment records in the selected date range.'};
  if(/overdue|late payment|collection/.test(normalized)) result={title:'Overdue customers',summary:`${report.collectionPriorities.length} customers have overdue invoices totaling ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(report.overdueCents/100)}.`,metrics:[{label:'Overdue balance',amountCents:report.overdueCents},{label:'Customers',count:report.collectionPriorities.length}],records:report.collectionPriorities.slice(0,20).map(row=>({customer:row.customerName,email:row.customerEmail,amountCents:row.outstandingCents,daysOverdue:row.daysOverdue,priority:row.priority,followUps:row.previousFollowUps})),availabilityNote:'Days overdue use invoice due dates and the current date.'};
  if(/expir|renew/.test(normalized)) result={title:'Upcoming subscriptions',summary:`${report.upcomingRenewals.length} active subscriptions renew within 30 days, with scheduled invoice value of ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(report.upcomingRenewals.reduce((sum:number,row:any)=>sum+row.renewalValueCents,0)/100)}.`,metrics:[{label:'Renewing subscriptions',count:report.upcomingRenewals.length},{label:'Scheduled value',amountCents:report.upcomingRenewals.reduce((sum:number,row:any)=>sum+row.renewalValueCents,0)}],records:report.upcomingRenewals.map((row:any)=>({customer:row.customerName,plan:row.planName,renewalDate:row.currentPeriodEnd,amountCents:row.renewalValueCents})),availabilityNote:'Renewals use current active subscription period-end dates and plan prices.'};
  if(/cancel|churn|likely to leave/.test(normalized)) result={title:'Customers at risk of cancellation',summary:`${report.churn.high} customers are in the high-risk group and ${report.churn.medium} are in the medium-risk group. These are simulated rule-based scores, not measured cancellation outcomes.`,metrics:[{label:'High risk',count:report.churn.high},{label:'Medium risk',count:report.churn.medium}],records:report.churn.highRiskCustomers,availabilityNote:'Risk uses available payments, pauses, expiry, and account activity. No trained churn model is connected.'};
  if(/los|leak/.test(normalized)) result={title:'Revenue leakage findings',summary:`The leakage detector currently reports ${report.leakage.count} open findings with deduplicated exposure of ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(report.leakage.totalCents/100)}.`,metrics:[{label:'Open findings',count:report.leakage.count},{label:'Deduplicated exposure',amountCents:report.leakage.totalCents}],records:report.leakage.issues.map((issue:any)=>({issue:issue.title,customer:issue.customerName,amountCents:issue.financialImpactCents,severity:issue.severity})),availabilityNote:'Product quantity and add-on line-item checks are unavailable because those records are not stored.'};
  if(/why.*(decreas|down)|decreas|declin/.test(normalized)) result={title:'Revenue change analysis',summary:report.revenue.previousRevenueCents===0?'A previous comparable payment period has no recorded revenue baseline, so a decrease cannot be established.':`Net recorded revenue changed by ${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(report.revenue.deltaCents/100)} (${report.revenue.deltaPercent?.toFixed(1)}%) versus the previous comparable period.`,metrics:[{label:'Selected period',amountCents:report.revenue.actualRevenueCents},{label:'Previous period',amountCents:report.revenue.previousRevenueCents},{label:'Change',amountCents:report.revenue.deltaCents}],records:[],availabilityNote:'Available data explains the change at payment and invoice level, but does not attribute it to product usage or external causes.'};
  res.json({question:query,...result,generatedAt:new Date().toISOString()});
});

app.post('/api/intelligence/collection-follow-up', requireAuth(['ADMIN','STAFF']), (req,res)=>{
  const actor=(req as any).user as SessionUser;const invoiceId=String(req.body?.invoiceId||'');const invoice=db.prepare(`SELECT id,userId,invoiceNumber,status,totalAmount,dueDate FROM Invoice WHERE id=?`).get(invoiceId) as any;
  if(!invoice)return res.status(404).json({error:'Invoice not found.'});if(!['CONFIRMED','OVERDUE'].includes(invoice.status))return res.status(400).json({error:'Only outstanding invoices can have a collection follow-up.'});
  const notes=String(req.body?.notes||'').trim().slice(0,500);const scheduledAt=req.body?.scheduledAt?new Date(req.body.scheduledAt):null;if(scheduledAt&&!Number.isFinite(scheduledAt.getTime()))return res.status(400).json({error:'Choose a valid follow-up date.'});
  const now=new Date().toISOString();db.prepare(`INSERT INTO AuditLog (id,actorId,action,entityType,entityId,metadata,createdAt) VALUES (?,?,'COLLECTION_FOLLOW_UP','Invoice',?,?,?)`).run(`aud_${crypto.randomBytes(5).toString('hex')}`,actor.id,invoice.id,JSON.stringify({userId:invoice.userId,invoiceNumber:invoice.invoiceNumber,notes,scheduledAt:scheduledAt?.toISOString()||null}),now);
  res.json({message:scheduledAt?'Follow-up scheduled.':'Follow-up recorded.',createdAt:now});
});

app.post('/api/intelligence/collection-recovered', requireAuth(['ADMIN','STAFF']), (req,res)=>{
  const actor=(req as any).user as SessionUser;const invoiceId=String(req.body?.invoiceId||'');const reference=String(req.body?.referenceCode||'').trim().slice(0,80);
  const tx=db.transaction(()=>{const invoice=db.prepare(`SELECT * FROM Invoice WHERE id=?`).get(invoiceId) as any;if(!invoice)throw new Error('Invoice not found.');if(!['CONFIRMED','OVERDUE'].includes(invoice.status))throw new Error('Invoice is not outstanding or has already been recovered.');const duplicate=db.prepare(`SELECT id FROM Payment WHERE invoiceId=? AND status='SUCCESS'`).get(invoiceId);if(duplicate)throw new Error('A successful payment is already linked to this invoice.');const now=new Date().toISOString();const paymentId=`pay_${crypto.randomBytes(5).toString('hex')}`;db.prepare(`INSERT INTO Payment (id,invoiceId,userId,amount,method,status,referenceCode,ipAddress,createdAt) VALUES (?,?,?,?,?,'SUCCESS',?,?,?)`).run(paymentId,invoice.id,invoice.userId,invoice.totalAmount,String(req.body?.method||'MANUAL'),reference||`MANUAL-${invoice.invoiceNumber}`,null,now);db.prepare(`UPDATE Invoice SET status='PAID' WHERE id=?`).run(invoice.id);db.prepare(`INSERT INTO AuditLog (id,actorId,action,entityType,entityId,metadata,createdAt) VALUES (?,?,'COLLECTION_PAYMENT_RECOVERED','Invoice',?,?,?)`).run(`aud_${crypto.randomBytes(5).toString('hex')}`,actor.id,invoice.id,JSON.stringify({paymentId,amountCents:invoice.totalAmount,method:String(req.body?.method||'MANUAL')}),now);return {paymentId,invoiceNumber:invoice.invoiceNumber,amountCents:invoice.totalAmount};});
  try{res.status(201).json({message:'Recovered payment recorded and invoice marked paid.',...tx()});}catch(err:any){res.status(400).json({error:err.message});}
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
  const workflow = db.prepare("SELECT entityId, action FROM AuditLog WHERE entityType = 'SecurityLog' ORDER BY createdAt DESC").all() as any[];
  const workflowById = new Map<string, string>();
  workflow.forEach((entry) => { if (!workflowById.has(entry.entityId)) workflowById.set(entry.entityId, entry.action); });
  const logs = db.prepare(`
    SELECT s.*, u.name as userName, u.email as userEmail
    FROM SecurityLog s
    LEFT JOIN User u ON u.id = s.userId
    ORDER BY s.createdAt DESC
  `).all().map((l: any) => ({
    ...l,
    resolved: Boolean(l.resolved),
    workflowStatus: l.resolved ? 'RESOLVED' : workflowById.get(l.id) === 'SECURITY_ESCALATE' ? 'ESCALATED' : workflowById.get(l.id) === 'SECURITY_REVIEW' ? 'REVIEWED' : 'OPEN',
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

  const payments = db.prepare(`SELECT p.id, p.userId, p.invoiceId, p.amount, p.status, p.ipAddress, p.createdAt, u.name as userName, u.email as userEmail, i.invoiceNumber FROM Payment p LEFT JOIN User u ON u.id = p.userId LEFT JOIN Invoice i ON i.id = p.invoiceId ORDER BY p.createdAt DESC`).all();
  const disputes = db.prepare(`SELECT d.*, u.name as customerName, u.email as customerEmail FROM CustomerDispute d JOIN User u ON u.id = d.customerId ORDER BY d.createdAt DESC`).all();
  const protectedCustomers = db.prepare('SELECT id, name, email, parentEmail, parentalGateOn FROM User WHERE parentalGateOn = 1').all().map((u: any) => ({ ...u, parentalGateOn: Boolean(u.parentalGateOn) }));
  const protectedSubscriptions = db.prepare(`SELECT s.id, s.userId, s.status, s.currentPeriodEnd, p.name as planName, p.billingPeriod, p.price, u.name as customerName FROM Subscription s JOIN User u ON u.id = s.userId JOIN Plan p ON p.id = s.planId WHERE u.parentalGateOn = 1 ORDER BY s.currentPeriodEnd ASC`).all();
  const ownershipChanges = db.prepare(`SELECT a.id, a.entityId as userId, a.metadata, a.createdAt, u.name as customerName, u.email as customerEmail FROM AuditLog a LEFT JOIN User u ON u.id = a.entityId WHERE a.entityType = 'Customer' AND a.action = 'ACCOUNT_OWNERSHIP_CHANGE' ORDER BY a.createdAt DESC LIMIT 25`).all().map((a: any) => ({ ...a, details: JSON.parse(a.metadata || '{}') }));
  const parentalAuthorizationRequests = db.prepare(`SELECT a.id, a.entityId as userId, a.metadata, a.createdAt, u.name as customerName FROM AuditLog a LEFT JOIN User u ON u.id = a.entityId WHERE a.action = 'PARENTAL_AUTH_REQUEST' ORDER BY a.createdAt DESC LIMIT 25`).all().map((a: any) => ({ ...a, details: JSON.parse(a.metadata || '{}') }));

  res.json({
    logs,
    blocklist,
    frozenUsers,
    loginActivities,
    payments,
    disputes,
    protectedCustomers,
    protectedSubscriptions,
    ownershipChanges,
    parentalAuthorizationRequests,
  });
});

app.post('/api/security/logs/:id/action', requireAuth(['ADMIN', 'STAFF']), (req, res) => {
  const sessionUser = (req as any).user as SessionUser;
  const log = db.prepare('SELECT id FROM SecurityLog WHERE id = ?').get(req.params.id);
  if (!log) return res.status(404).json({ error: 'Security alert not found.' });
  const action = String(req.body?.action || '');
  if (!['REVIEW', 'ESCALATE', 'RESOLVE'].includes(action)) return res.status(400).json({ error: 'Choose review, escalate, or resolve.' });
  if (action === 'RESOLVE') db.prepare('UPDATE SecurityLog SET resolved = 1 WHERE id = ?').run(req.params.id);
  db.prepare('INSERT INTO AuditLog (id, actorId, action, entityType, entityId, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)').run(`audit_${crypto.randomBytes(5).toString('hex')}`, sessionUser.id, `SECURITY_${action}`, 'SecurityLog', req.params.id, JSON.stringify({ action }), new Date().toISOString());
  res.json({ message: action === 'REVIEW' ? 'Alert marked as reviewed.' : action === 'ESCALATE' ? 'Alert escalated for priority review.' : 'Alert resolved.' });
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
