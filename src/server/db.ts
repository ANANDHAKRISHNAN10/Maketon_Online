import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'brightloop.db');
export const db = new Database(dbPath);

// Enable WAL mode and foreign keys for transactional integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string, salt = 'brightloop_salt_2026'): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(`pin_${pin}_brightloop`).digest('hex');
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'GAMER',
      parentEmail TEXT,
      parentalPinHash TEXT,
      parentalGateOn INTEGER NOT NULL DEFAULT 0,
      lastLoginIp TEXT,
      lastLoginCountry TEXT,
      lastLoginAt TEXT,
      isFrozen INTEGER NOT NULL DEFAULT 0,
      tradeLockUntil TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Product (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Game Pass Add-on',
      basePrice INTEGER NOT NULL,
      costPrice INTEGER NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ProductVariant (
      id TEXT PRIMARY KEY,
      productId TEXT NOT NULL,
      name TEXT NOT NULL,
      priceAdjustment INTEGER NOT NULL,
      FOREIGN KEY (productId) REFERENCES Product(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Plan (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      tagline TEXT NOT NULL,
      billingPeriod TEXT NOT NULL,
      price INTEGER NOT NULL,
      costPrice INTEGER NOT NULL DEFAULT 0,
      perksJson TEXT NOT NULL,
      badge TEXT,
      isRecommended INTEGER NOT NULL DEFAULT 0,
      autoClose INTEGER NOT NULL DEFAULT 0,
      allowPause INTEGER NOT NULL DEFAULT 1,
      maxPauseDays INTEGER NOT NULL DEFAULT 30,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Subscription (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      planId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      currentPeriodStart TEXT NOT NULL,
      currentPeriodEnd TEXT NOT NULL,
      pauseStartDate TEXT,
      pauseResumeDate TEXT,
      pausedDaysPlanned INTEGER,
      perksFrozen INTEGER NOT NULL DEFAULT 0,
      retentionPromoCode TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE,
      FOREIGN KEY (planId) REFERENCES Plan(id)
    );

    CREATE TABLE IF NOT EXISTS Invoice (
      id TEXT PRIMARY KEY,
      invoiceNumber TEXT NOT NULL UNIQUE,
      subscriptionId TEXT NOT NULL,
      userId TEXT NOT NULL,
      billingPeriodKey TEXT NOT NULL,
      amountSubtotal INTEGER NOT NULL,
      taxAmount INTEGER NOT NULL,
      discountAmount INTEGER NOT NULL DEFAULT 0,
      discountCode TEXT,
      totalAmount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      dueDate TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (subscriptionId) REFERENCES Subscription(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Payment (
      id TEXT PRIMARY KEY,
      invoiceId TEXT,
      userId TEXT NOT NULL,
      amount INTEGER NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL,
      referenceCode TEXT NOT NULL,
      ipAddress TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (invoiceId) REFERENCES Invoice(id) ON DELETE SET NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Discount (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      type TEXT NOT NULL,
      value INTEGER NOT NULL,
      minQuantity INTEGER NOT NULL DEFAULT 1,
      maxUses INTEGER NOT NULL DEFAULT 100,
      usedCount INTEGER NOT NULL DEFAULT 0,
      minPurchaseCents INTEGER NOT NULL DEFAULT 0,
      productIdsJson TEXT NOT NULL DEFAULT '[]',
      planIdsJson TEXT NOT NULL DEFAULT '[]',
      customerEligibility TEXT NOT NULL DEFAULT 'ALL',
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      isActive INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS SecurityLog (
      id TEXT PRIMARY KEY,
      userId TEXT,
      ipAddress TEXT NOT NULL,
      userAgent TEXT NOT NULL,
      eventType TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'HIGH',
      details TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS PauseHistory (
      id TEXT PRIMARY KEY,
      subscriptionId TEXT NOT NULL,
      pauseStart TEXT NOT NULL,
      plannedResume TEXT NOT NULL,
      actualResume TEXT,
      daysPaused INTEGER NOT NULL,
      reason TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (subscriptionId) REFERENCES Subscription(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS LoginActivity (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      ipAddress TEXT NOT NULL,
      country TEXT NOT NULL,
      userAgent TEXT NOT NULL,
      flaggedJump INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS AuditLog (
      id TEXT PRIMARY KEY,
      actorId TEXT,
      action TEXT NOT NULL,
      entityType TEXT NOT NULL,
      entityId TEXT NOT NULL,
      metadata TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (actorId) REFERENCES User(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS CustomerDispute (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'NORMAL',
      status TEXT NOT NULL DEFAULT 'OPEN',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      resolvedAt TEXT,
      FOREIGN KEY (customerId) REFERENCES User(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS IpBlocklist (
      ipAddress TEXT PRIMARY KEY,
      failedAttempts INTEGER NOT NULL DEFAULT 0,
      blockedUntil TEXT,
      reason TEXT,
      updatedAt TEXT NOT NULL
    );
  `);

  const discountColumns = new Set((db.prepare('PRAGMA table_info(Discount)').all() as Array<{ name: string }>).map(column => column.name));
  if (!discountColumns.has('minPurchaseCents')) db.exec('ALTER TABLE Discount ADD COLUMN minPurchaseCents INTEGER NOT NULL DEFAULT 0');
  if (!discountColumns.has('productIdsJson')) db.exec("ALTER TABLE Discount ADD COLUMN productIdsJson TEXT NOT NULL DEFAULT '[]'");
  if (!discountColumns.has('planIdsJson')) db.exec("ALTER TABLE Discount ADD COLUMN planIdsJson TEXT NOT NULL DEFAULT '[]'");
  if (!discountColumns.has('customerEligibility')) db.exec("ALTER TABLE Discount ADD COLUMN customerEligibility TEXT NOT NULL DEFAULT 'ALL'");
}

export function seedDatabase(forceReset = false) {
  initDatabase();

  if (forceReset) {
    db.exec(`
      DELETE FROM CustomerDispute;
      DELETE FROM AuditLog;
      DELETE FROM LoginActivity;
      DELETE FROM PauseHistory;
      DELETE FROM SecurityLog;
      DELETE FROM Payment;
      DELETE FROM Invoice;
      DELETE FROM Subscription;
      DELETE FROM Discount;
      DELETE FROM ProductVariant;
      DELETE FROM Product;
      DELETE FROM Plan;
      DELETE FROM User;
      DELETE FROM IpBlocklist;
    `);
  }

  const existingUsers = db.prepare('SELECT COUNT(*) as count FROM User').get() as { count: number };
  db.prepare(`
    INSERT OR IGNORE INTO Plan (id, name, tagline, billingPeriod, price, costPrice, perksJson, badge, isRecommended, autoClose, allowPause, maxPauseDays, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'plan_quarterly_pro', 'Quarterly Pro Pass', 'Three months of Pro gaming, rewards, and flexible play in one simple plan.',
    'QUARTERLY', 3999, 1180,
    JSON.stringify(['Access to 180+ Brightloop games', '3,600 monthly gems across the quarter', 'Pause membership for up to 30 days', '15% member discount on add-ons']),
    'Save 35%', 0, 0, 1, 30, new Date('2026-10-31T08:00:00.000Z').toISOString()
  );
  if (existingUsers.count > 0 && !forceReset) {
    return;
  }

  const now = new Date('2026-10-31T08:00:00.000Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();
  const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();

  const seedTx = db.transaction(() => {
    // 1. Users: 1 Admin, 1 Staff, 5 Gamers
    const insertUser = db.prepare(`
      INSERT INTO User (id, name, email, passwordHash, role, parentEmail, parentalPinHash, parentalGateOn, lastLoginIp, lastLoginCountry, lastLoginAt, isFrozen, tradeLockUntil, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      'usr_admin_1',
      'Elena Vance (Admin)',
      'admin@brightloop.gg',
      hashPassword('BrightloopAdmin!2026'),
      'ADMIN',
      null,
      null,
      0,
      '198.51.100.10',
      'US',
      daysAgo(0.1),
      0,
      null,
      daysAgo(360)
    );

    insertUser.run(
      'usr_staff_1',
      'Marcus Chen (Operations)',
      'staff@brightloop.gg',
      hashPassword('BrightloopStaff!2026'),
      'STAFF',
      null,
      null,
      0,
      '198.51.100.22',
      'US',
      daysAgo(0.3),
      0,
      null,
      daysAgo(280)
    );

    // Gamer 1: Alex Rivera (Primary demo gamer with Parental PIN 4210, Monthly Champion Tier)
    insertUser.run(
      'usr_gamer_1',
      'Alex Rivera',
      'alex@gamer.gg',
      hashPassword('GamerPass!123'),
      'GAMER',
      'parent.rivera@family.org',
      hashPin('4210'),
      1,
      '203.0.113.45',
      'US',
      daysAgo(0.05),
      0,
      null,
      daysAgo(195)
    );

    // Gamer 2: Maya Lin (Active subscription WITHOUT an invoice -> Revenue Leakage #1)
    insertUser.run(
      'usr_gamer_2',
      'Maya Lin',
      'maya@gamer.gg',
      hashPassword('GamerPass!123'),
      'GAMER',
      'lin.guardian@family.org',
      hashPin('1234'),
      1,
      '203.0.113.88',
      'CA',
      daysAgo(1),
      0,
      null,
      daysAgo(85)
    );

    // Gamer 3: Liam O'Connor (Has duplicate invoices & high churn risk: failed payments + pauses + expiring soon)
    insertUser.run(
      'usr_gamer_3',
      "Liam O'Connor",
      'liam@gamer.gg',
      hashPassword('GamerPass!123'),
      'GAMER',
      null,
      hashPin('9900'),
      0,
      '192.0.2.114',
      'IE',
      daysAgo(2),
      0,
      null,
      daysAgo(25)
    );

    // Gamer 4: Sofia Rossi (Has a successful unlinked payment of $49.99 -> Revenue Leakage #4, plus expired discount on draft invoice -> Leakage #3)
    insertUser.run(
      'usr_gamer_4',
      'Sofia Rossi',
      'sofia@gamer.gg',
      hashPassword('GamerPass!123'),
      'GAMER',
      null,
      null,
      0,
      '198.51.100.77',
      'IT',
      daysAgo(3),
      0,
      null,
      daysAgo(140)
    );

    // Gamer 5: Noah Takahashi (Flagged for Geo-IP Jump US -> JP within 25 mins -> 48h trade lock active)
    insertUser.run(
      'usr_gamer_5',
      'Noah Takahashi',
      'noah@gamer.gg',
      hashPassword('GamerPass!123'),
      'GAMER',
      'takahashi.parent@home.jp',
      hashPin('7788'),
      1,
      '133.242.0.91',
      'JP',
      daysAgo(0.2),
      1,
      daysFromNow(1.8),
      daysAgo(45)
    );

    // 2. Three Gaming Plans
    const insertPlan = db.prepare(`
      INSERT INTO Plan (id, name, tagline, billingPeriod, price, costPrice, perksJson, badge, isRecommended, autoClose, allowPause, maxPauseDays, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertPlan.run(
      'plan_daily_gem',
      'Daily Gem Pass',
      'Instant 24-hour tournament access and daily loot drops for weekend warriors.',
      'DAILY',
      299, // $2.99
      85,  // $0.85 cost
      JSON.stringify([
        '150 Brightloop Gems credited daily',
        'Full access to 45+ Indie & Arcade titles',
        'Standard matchmaking queue priority',
        'Instant activation, auto-closes after 24h'
      ]),
      '24-Hour Sprint',
      0,
      1, // autoClose = true
      0, // allowPause = false for daily pass
      0,
      daysAgo(365)
    );

    insertPlan.run(
      'plan_monthly_champion',
      'Monthly Champion Tier',
      'Complete Battlepass progression, cloud saves, and 180+ flagship studio titles.',
      'MONTHLY',
      1499, // $14.99
      420,  // $4.20 cost
      JSON.stringify([
        'Unlimited access to 180+ Brightloop library games',
        'Season 8 Champion Battlepass + 1,200 monthly Gems',
        'Flexible self-service pause up to 30 days',
        'Co-op squad servers & zero-latency cloud saves',
        '15% member discount on DLC & expansion packs'
      ]),
      'Most Popular · Save 28%',
      1, // Recommended
      0,
      1, // allowPause = true
      30,
      daysAgo(365)
    );

    insertPlan.run(
      'plan_annual_legend',
      'Annual Legend Pass',
      'All-access Founders vault, exclusive mythic cosmetics, and maximum annual savings.',
      'YEARLY',
      11999, // $119.99
      2900,  // $29.00 cost
      JSON.stringify([
        'All 180+ games + Day-One flagship studio releases',
        'All 4 Seasonal Battlepasses + 18,000 bonus Gems/yr',
        'Pause membership up to 60 days per billing year',
        'Exclusive Founders Mythic Controller Skin & Emblem',
        'Dedicated VIP account protection & family sharing (up to 4)'
      ]),
      'Best Value · 4 Months Free',
      0,
      0,
      1,
      60,
      daysAgo(365)
    );

    // 3. Products & Variants
    const insertProduct = db.prepare(`
      INSERT INTO Product (id, name, description, category, basePrice, costPrice, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertVariant = db.prepare(`
      INSERT INTO ProductVariant (id, productId, name, priceAdjustment)
      VALUES (?, ?, ?, ?)
    `);

    insertProduct.run(
      'prod_solar_odyssey',
      'Solar Odyssey: Skyward Expansion',
      'Explore sunlit floating archipelagos, unlock the Sunforge Glider, and conquer 12 co-op sky temples.',
      'Expansion Pack',
      2499,
      650,
      1,
      daysAgo(120)
    );
    insertVariant.run('var_solar_std', 'prod_solar_odyssey', 'Standard Edition', 0);
    insertVariant.run('var_solar_deluxe', 'prod_solar_odyssey', 'Collector Skyfarer Bundle (+2,000 Gems)', 1000);

    insertProduct.run(
      'prod_circuit_drift',
      'Circuit Drift: Canyon Legends Pass',
      'High-octane desert canyon rally tracks with 8 custom-tuned golden hour coupe liveries.',
      'Season Pass',
      1999,
      500,
      1,
      daysAgo(90)
    );
    insertVariant.run('var_circuit_base', 'prod_circuit_drift', 'Track Pass Only', 0);
    insertVariant.run('var_circuit_pro', 'prod_circuit_drift', 'Pro Garage Edition (+All 8 Cars Unlocked)', 800);

    insertProduct.run(
      'prod_aether_tactics',
      'Aether Tactics: Crystal Sovereign',
      'Isometric tactical board expansion featuring 40 ranked diorama arenas and sovereign guardian classes.',
      'Tactical DLC',
      1599,
      380,
      1,
      daysAgo(60)
    );
    insertVariant.run('var_aether_std', 'prod_aether_tactics', 'Sovereign Deck', 0);
    insertVariant.run('var_aether_foil', 'prod_aether_tactics', 'Holographic Board & Foil Units', 600);

    insertProduct.run(
      'prod_gem_vault',
      'Brightloop 5,000 Gem Vault',
      'Instant in-game currency pack redeemable across all Brightloop Battlepass tiers and cosmetics.',
      'Virtual Currency',
      3999,
      900,
      1,
      daysAgo(200)
    );
    insertVariant.run('var_gem_5k', 'prod_gem_vault', '5,000 Gems', 0);
    insertVariant.run('var_gem_12k', 'prod_gem_vault', '12,000 Gems (+2,000 Bonus)', 4000);

    // 4. Discounts
    const insertDiscount = db.prepare(`
      INSERT INTO Discount (id, code, description, type, value, minQuantity, maxUses, usedCount, startDate, endDate, isActive, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertDiscount.run(
      'disc_welcome20',
      'BRIGHT20',
      '20% off first subscription billing cycle for new Champions',
      'PERCENT',
      20,
      1,
      500,
      142,
      daysAgo(90),
      daysFromNow(90),
      1,
      daysAgo(90)
    );

    insertDiscount.run(
      'disc_retention15',
      'RETENTION15',
      '15% loyalty retention promotion for at-risk gamers',
      'PERCENT',
      15,
      1,
      250,
      18,
      daysAgo(60),
      daysFromNow(180),
      1,
      daysAgo(60)
    );

    // Expired discount (used on a draft invoice to demonstrate Revenue Leakage #3)
    insertDiscount.run(
      'disc_summer_expired',
      'SUMMERFLASH50',
      'Expired 50% summer flash discount still attached to draft renewals',
      'PERCENT',
      50,
      1,
      100,
      100,
      daysAgo(150),
      daysAgo(45), // Expired 45 days ago!
      0,
      daysAgo(150)
    );

    insertDiscount.run(
      'disc_squad5',
      'SQUAD500',
      '$5.00 fixed squad rebate on Annual Legend Pass',
      'FIXED',
      500,
      1,
      150,
      34,
      daysAgo(30),
      daysFromNow(120),
      1,
      daysAgo(30)
    );

    // 5. Subscriptions
    const insertSub = db.prepare(`
      INSERT INTO Subscription (id, userId, planId, status, currentPeriodStart, currentPeriodEnd, pauseStartDate, pauseResumeDate, pausedDaysPlanned, perksFrozen, retentionPromoCode, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Sub 1: Alex Rivera - Active Monthly Champion Tier
    insertSub.run(
      'sub_alex_1',
      'usr_gamer_1',
      'plan_monthly_champion',
      'ACTIVE',
      daysAgo(12),
      daysFromNow(18),
      null,
      null,
      null,
      0,
      null,
      daysAgo(195)
    );

    // Sub 2: Maya Lin - Active Monthly Champion Tier WITHOUT ANY INVOICE (Leakage #1!)
    insertSub.run(
      'sub_maya_no_inv',
      'usr_gamer_2',
      'plan_monthly_champion',
      'ACTIVE',
      daysAgo(5),
      daysFromNow(25),
      null,
      null,
      null,
      0,
      null,
      daysAgo(85)
    );

    // Sub 3: Liam O'Connor - Active Monthly Champion Tier, expiring in 3 days, high churn risk, has duplicate invoices (Leakage #2!)
    insertSub.run(
      'sub_liam_risk',
      'usr_gamer_3',
      'plan_monthly_champion',
      'ACTIVE',
      daysAgo(27),
      daysFromNow(3),
      null,
      null,
      null,
      0,
      null,
      daysAgo(25)
    );

    // Sub 4: Sofia Rossi - Active Annual Legend Pass
    insertSub.run(
      'sub_sofia_annual',
      'usr_gamer_4',
      'plan_annual_legend',
      'ACTIVE',
      daysAgo(20),
      daysFromNow(345),
      null,
      null,
      null,
      0,
      null,
      daysAgo(140)
    );

    // Sub 5: Noah Takahashi - Active Monthly Champion Tier
    insertSub.run(
      'sub_noah_monthly',
      'usr_gamer_5',
      'plan_monthly_champion',
      'ACTIVE',
      daysAgo(16),
      daysFromNow(14),
      null,
      null,
      null,
      0,
      null,
      daysAgo(45)
    );

    // 6. Pause History (for churn prediction pause frequency scoring)
    const insertPause = db.prepare(`
      INSERT INTO PauseHistory (id, subscriptionId, pauseStart, plannedResume, actualResume, daysPaused, reason, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertPause.run('ph_liam_1', 'sub_liam_risk', daysAgo(24), daysAgo(17), daysAgo(17), 7, 'Exam week break', daysAgo(24));
    insertPause.run('ph_liam_2', 'sub_liam_risk', daysAgo(15), daysAgo(8), daysAgo(8), 7, 'Traveling away from PC', daysAgo(15));
    insertPause.run('ph_noah_1', 'sub_noah_monthly', daysAgo(35), daysAgo(21), daysAgo(21), 14, 'Holiday trip', daysAgo(35));

    // 7. Invoices
    const insertInvoice = db.prepare(`
      INSERT INTO Invoice (id, invoiceNumber, subscriptionId, userId, billingPeriodKey, amountSubtotal, taxAmount, discountAmount, discountCode, totalAmount, status, dueDate, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Alex Rivera paid invoices
    insertInvoice.run(
      'inv_alex_oct',
      'BL-2026-1001',
      'sub_alex_1',
      'usr_gamer_1',
      '2026-10',
      1499,
      270, // 18% GST
      0,
      null,
      1769,
      'PAID',
      daysAgo(10),
      daysAgo(12)
    );
    insertInvoice.run(
      'inv_alex_sep',
      'BL-2026-0914',
      'sub_alex_1',
      'usr_gamer_1',
      '2026-09',
      1499,
      270,
      0,
      null,
      1769,
      'PAID',
      daysAgo(40),
      daysAgo(42)
    );

    // Liam O'Connor DUPLICATE INVOICES for period 2026-10 (Leakage #2!) + Overdue
    insertInvoice.run(
      'inv_liam_oct_1',
      'BL-2026-1008',
      'sub_liam_risk',
      'usr_gamer_3',
      '2026-10',
      1499,
      270,
      0,
      null,
      1769,
      'OVERDUE',
      daysAgo(19),
      daysAgo(27)
    );
    insertInvoice.run(
      'inv_liam_oct_2_dup',
      'BL-2026-1009',
      'sub_liam_risk',
      'usr_gamer_3',
      '2026-10', // Same subscriptionId + billingPeriodKey!
      1499,
      270,
      0,
      null,
      1769,
      'CONFIRMED',
      daysAgo(19),
      daysAgo(27)
    );

    // Sofia Rossi Paid Annual Invoice + Draft Add-on Invoice with EXPIRED discount SUMMERFLASH50 (Leakage #3!)
    insertInvoice.run(
      'inv_sofia_annual_paid',
      'BL-2026-1012',
      'sub_sofia_annual',
      'usr_gamer_4',
      '2026-10',
      11999,
      2160,
      0,
      null,
      14159,
      'PAID',
      daysAgo(18),
      daysAgo(20)
    );
    insertInvoice.run(
      'inv_sofia_draft_expired_disc',
      'BL-2026-1044',
      'sub_sofia_annual',
      'usr_gamer_4',
      '2026-11-RENEW',
      11999,
      1080, // Tax calculated on discounted amount
      6000, // $60.00 improper expired discount!
      'SUMMERFLASH50',
      7079,
      'DRAFT',
      daysFromNow(10),
      daysAgo(2)
    );

    // Noah Takahashi Overdue invoice (for executive report collection priority ranking)
    insertInvoice.run(
      'inv_noah_oct_overdue',
      'BL-2026-1021',
      'sub_noah_monthly',
      'usr_gamer_5',
      '2026-10',
      1499,
      270,
      0,
      null,
      1769,
      'OVERDUE',
      daysAgo(14),
      daysAgo(16)
    );

    // 8. Payments (including 1 successful unlinked payment of $49.99 = 4999 cents -> Leakage #4!)
    const insertPayment = db.prepare(`
      INSERT INTO Payment (id, invoiceId, userId, amount, method, status, referenceCode, ipAddress, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertPayment.run('pay_alex_1', 'inv_alex_oct', 'usr_gamer_1', 1769, 'CREDIT_CARD', 'SUCCESS', 'TXN-984120A', '203.0.113.45', daysAgo(12));
    insertPayment.run('pay_alex_2', 'inv_alex_sep', 'usr_gamer_1', 1769, 'CREDIT_CARD', 'SUCCESS', 'TXN-882104B', '203.0.113.45', daysAgo(42));
    insertPayment.run('pay_sofia_1', 'inv_sofia_annual_paid', 'usr_gamer_4', 14159, 'WALLET', 'SUCCESS', 'TXN-774910W', '198.51.100.77', daysAgo(20));

    // Unlinked payment of $49.99 (4999 cents) - Required by spec!
    insertPayment.run(
      'pay_unlinked_4999',
      null, // Unlinked to any invoice!
      'usr_gamer_4',
      4999, // $49.99
      'CREDIT_CARD',
      'SUCCESS',
      'TXN-UNLINKED-4999',
      '198.51.100.77',
      daysAgo(4)
    );

    // Failed payments for Liam O'Connor & Noah Takahashi (factors into Churn Prediction 30% weight)
    insertPayment.run('pay_liam_fail_1', 'inv_liam_oct_1', 'usr_gamer_3', 1769, 'CREDIT_CARD', 'FAILED', 'TXN-FAIL-301', '192.0.2.114', daysAgo(18));
    insertPayment.run('pay_liam_fail_2', 'inv_liam_oct_1', 'usr_gamer_3', 1769, 'CREDIT_CARD', 'FAILED', 'TXN-FAIL-302', '192.0.2.114', daysAgo(11));
    insertPayment.run('pay_noah_fail_1', 'inv_noah_oct_overdue', 'usr_gamer_5', 1769, 'UPI', 'FAILED', 'TXN-FAIL-509', '133.242.0.91', daysAgo(9));

    // 9. Security Events: 1 Card-testing bot attack & 1 Suspicious Geo-IP Jump
    const insertSecurityLog = db.prepare(`
      INSERT INTO SecurityLog (id, userId, ipAddress, userAgent, eventType, severity, details, resolved, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertSecurityLog.run(
      'sec_card_bot_1',
      null,
      '185.220.101.44',
      'Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/128.0.0.0',
      'CARD_BOT_ATTACK',
      'CRITICAL',
      JSON.stringify({
        failedAttempts: 6,
        windowSeconds: 45,
        blockedStatus: 'IP_BLOCKED_24H',
        cardsTested: ['4111-XXXX-8821', '4111-XXXX-9014', '5500-XXXX-1102'],
        policyTriggered: '3_FAILED_CARD_ATTEMPTS_SAME_IP',
        description: 'Automated credential stuffing & BIN card-testing velocity spike blocked at checkout.'
      }),
      0,
      daysAgo(0.4)
    );

    insertSecurityLog.run(
      'sec_geo_jump_1',
      'usr_gamer_5',
      '133.242.0.91',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'GEO_IP_JUMP',
      'HIGH',
      JSON.stringify({
        previousCountry: 'US (Seattle, 198.51.100.41)',
        newCountry: 'JP (Tokyo, 133.242.0.91)',
        elapsedMinutes: 22,
        actionTaken: '48_HOUR_TRADE_LOCK_APPLIED',
        accountEmail: 'noah@gamer.gg',
        description: 'Impossible travel velocity detected: Login from Japan 22 minutes after US session.'
      }),
      0,
      daysAgo(0.2)
    );

    // Blocklist entry for the bot IP
    db.prepare(`
      INSERT INTO IpBlocklist (ipAddress, failedAttempts, blockedUntil, reason, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      '185.220.101.44',
      6,
      daysFromNow(1),
      'Blocked after 3+ consecutive failed card verification attempts from same IP',
      daysAgo(0.4)
    );
  });

  seedTx();
}
