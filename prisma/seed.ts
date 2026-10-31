import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting Brightloop Gaming database seed...");

  // Clean existing tables in proper order
  await prisma.securityLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.discount.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.user.deleteMany();

  console.log("🧹 Cleaned database tables.");

  // 1. Users
  const admin = await prisma.user.create({
    data: {
      email: "admin@brightloop.gg",
      passwordHash: "brightloop_admin_secure_hash",
      role: "ADMIN",
      lastLoginIp: "192.168.1.1",
      isFrozen: false,
    },
  });

  const staff = await prisma.user.create({
    data: {
      email: "staff@brightloop.gg",
      passwordHash: "brightloop_staff_secure_hash",
      role: "STAFF",
      lastLoginIp: "192.168.1.15",
      isFrozen: false,
    },
  });

  const gamer1 = await prisma.user.create({
    data: {
      email: "valkyrie_99@brightloop.gg",
      passwordHash: "valkyrie_hash_99",
      role: "GAMER",
      parentEmail: "sarah.parent@example.com",
      parentalPinHash: "1234",
      lastLoginIp: "24.105.100.12", // Los Angeles
      isFrozen: false,
      createdAt: new Date(Date.now() - 120 * 24 * 60 * 60 * 1000), // 120 days tenure
    },
  });

  const gamer2 = await prisma.user.create({
    data: {
      email: "ninja_kai@brightloop.gg",
      passwordHash: "ninja_hash_88",
      role: "GAMER",
      lastLoginIp: "73.189.44.20", // Seattle
      isFrozen: false,
      createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days tenure
    },
  });

  const gamer3 = await prisma.user.create({
    data: {
      email: "pixel_hunter@brightloop.gg",
      passwordHash: "pixel_hash_77",
      role: "GAMER",
      lastLoginIp: "68.192.11.5", // Chicago
      isFrozen: false,
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days tenure (short)
    },
  });

  const gamer4 = await prisma.user.create({
    data: {
      email: "shadow_mage@brightloop.gg",
      passwordHash: "shadow_hash_66",
      role: "GAMER",
      lastLoginIp: "81.2.69.142", // London
      isFrozen: false,
      createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    },
  });

  const gamer5 = await prisma.user.create({
    data: {
      email: "apex_legend@brightloop.gg",
      passwordHash: "apex_hash_55",
      role: "GAMER",
      lastLoginIp: "142.250.190.46", // New York
      isFrozen: false,
      createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    },
  });

  console.log("👤 Created 1 Admin, 1 Staff, 5 Gamers.");

  // 2. Plans
  const dailyGemPass = await prisma.plan.create({
    data: {
      name: "Daily Gem Pass",
      billingPeriod: "DAILY",
      price: 1.99,
      autoClose: false,
      allowPause: false,
      maxPauseDays: 0,
    },
  });

  const monthlyChampion = await prisma.plan.create({
    data: {
      name: "Monthly Champion Tier",
      billingPeriod: "MONTHLY",
      price: 19.99,
      autoClose: false,
      allowPause: true,
      maxPauseDays: 14,
    },
  });

  const annualLegend = await prisma.plan.create({
    data: {
      name: "Annual Legend Pass",
      billingPeriod: "YEARLY",
      price: 189.99,
      autoClose: false,
      allowPause: true,
      maxPauseDays: 30,
    },
  });

  console.log("📦 Created 3 Gaming Plans.");

  // 3. Products and Variants
  const battlepassProduct = await prisma.product.create({
    data: {
      name: "Brightloop Battlepass Season 5",
      description: "Unlock 100 tiers of legendary cyber skins, weapon wraps, and 1200 BrightCoins.",
      basePrice: 19.99,
      costPrice: 4.5,
      isActive: true,
      variants: {
        create: [
          { name: "Standard", priceAdjustment: 0.0 },
          { name: "Pro Gamer Edition", priceAdjustment: 10.0 },
          { name: "Odoo Pass", priceAdjustment: 15.0 },
        ],
      },
    },
  });

  await prisma.product.create({
    data: {
      name: "Apex Energy Crate",
      description: "Consumable boosters giving +50% XP for 7 days in ranked arena.",
      basePrice: 9.99,
      costPrice: 1.8,
      isActive: true,
      variants: {
        create: [
          { name: "Standard Pack", priceAdjustment: 0.0 },
          { name: "Mega Crate x3", priceAdjustment: 14.99 },
        ],
      },
    },
  });

  console.log("🎮 Created Products and Variants.");

  // 4. Discounts
  const launchDiscount = await prisma.discount.create({
    data: {
      code: "LAUNCH20",
      type: "PERCENT",
      value: 20,
      minQuantity: 1,
      maxUses: 500,
      usedCount: 42,
      startDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      isActive: true,
    },
  });

  const expiredDiscount = await prisma.discount.create({
    data: {
      code: "BETA50_EXPIRED",
      type: "PERCENT",
      value: 50,
      minQuantity: 1,
      maxUses: 100,
      usedCount: 100,
      startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Expired 5 days ago!
      isActive: false,
    },
  });

  // 5. Subscriptions and Invoices

  // Valkyrie 99: Healthy active Champion Tier
  const subValkyrie = await prisma.subscription.create({
    data: {
      userId: gamer1.id,
      planId: monthlyChampion.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    },
  });

  const invValkyrie = await prisma.invoice.create({
    data: {
      subscriptionId: subValkyrie.id,
      userId: gamer1.id,
      amountSubtotal: 19.99,
      taxAmount: 3.6, // 18% GST
      discountAmount: 0.0,
      totalAmount: 23.59,
      status: "PAID",
      dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.payment.create({
    data: {
      invoiceId: invValkyrie.id,
      amount: 23.59,
      method: "CREDIT_CARD",
      status: "SUCCESS",
    },
  });

  // Ninja Kai: Paused subscription
  const subNinja = await prisma.subscription.create({
    data: {
      userId: gamer2.id,
      planId: monthlyChampion.id,
      status: "PAUSED",
      currentPeriodStart: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      pauseStartDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      pauseResumeDate: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000), // 14 day pause
    },
  });

  await prisma.invoice.create({
    data: {
      subscriptionId: subNinja.id,
      userId: gamer2.id,
      amountSubtotal: 19.99,
      taxAmount: 3.6,
      discountAmount: 0.0,
      totalAmount: 23.59,
      status: "PAID",
      dueDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
    },
  });

  // Pixel Hunter: High Churn Risk (3 failed card attempts, sub expiring in 2 days)
  const subPixel = await prisma.subscription.create({
    data: {
      userId: gamer3.id,
      planId: monthlyChampion.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(Date.now() - 28 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // Only 2 days left!
    },
  });

  const invPixelOverdue = await prisma.invoice.create({
    data: {
      subscriptionId: subPixel.id,
      userId: gamer3.id,
      amountSubtotal: 19.99,
      taxAmount: 3.6,
      discountAmount: 0.0,
      totalAmount: 23.59,
      status: "OVERDUE",
      dueDate: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8 days overdue
    },
  });

  // 3 failed payment attempts for Pixel Hunter
  await prisma.payment.createMany({
    data: [
      {
        invoiceId: invPixelOverdue.id,
        amount: 23.59,
        method: "CREDIT_CARD",
        status: "FAILED",
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      },
      {
        invoiceId: invPixelOverdue.id,
        amount: 23.59,
        method: "CREDIT_CARD",
        status: "FAILED",
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      },
      {
        invoiceId: invPixelOverdue.id,
        amount: 23.59,
        method: "CREDIT_CARD",
        status: "FAILED",
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  // Shadow Mage: Legend Pass
  const subShadow = await prisma.subscription.create({
    data: {
      userId: gamer4.id,
      planId: annualLegend.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 335 * 24 * 60 * 60 * 1000),
    },
  });

  await prisma.invoice.create({
    data: {
      subscriptionId: subShadow.id,
      userId: gamer4.id,
      amountSubtotal: 189.99,
      taxAmount: 34.2,
      discountAmount: 37.99, // LAUNCH20 applied
      totalAmount: 186.2,
      status: "PAID",
      dueDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    },
  });

  // ==========================================
  // DELIBERATE REVENUE LEAKAGES (For Demo)
  // ==========================================
  // Leakage 1: Active Subscription for Apex Legend with NO open or paid invoice!
  const subApexLeaking = await prisma.subscription.create({
    data: {
      userId: gamer5.id,
      planId: monthlyChampion.id,
      status: "ACTIVE",
      currentPeriodStart: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("⚠️ Induced Revenue Leakage 1: Active subscription without invoice for apex_legend");

  // Leakage 2: Unlinked $49.99 SUCCESS payment with invoiceId: null
  await prisma.payment.create({
    data: {
      invoiceId: null,
      amount: 49.99,
      method: "CREDIT_CARD",
      status: "SUCCESS",
      createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("⚠️ Induced Revenue Leakage 2: Unlinked $49.99 success payment");

  // Leakage 3: Expired discount applied on a draft invoice
  await prisma.invoice.create({
    data: {
      subscriptionId: subShadow.id,
      userId: gamer4.id,
      amountSubtotal: 50.0,
      taxAmount: 9.0,
      discountAmount: 25.0, // 50% discount from expired code!
      totalAmount: 34.0,
      status: "DRAFT",
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    },
  });
  console.log("⚠️ Induced Revenue Leakage 3: Expired discount deducted on draft invoice");

  // ==========================================
  // SIMULATED SECURITY EVENTS (For Demo)
  // ==========================================
  // Security Event 1: Card Bot Attack
  await prisma.securityLog.create({
    data: {
      userId: null,
      ipAddress: "198.51.100.42",
      userAgent: "Python-urllib/3.10 card_tester_bot v1.2",
      eventType: "CARD_BOT_ATTACK",
      details: JSON.stringify({
        blocked: true,
        reason: "Card testing robot blocked after 3 failed payment authorizations within 4 seconds",
        targetCardBin: "411111",
        failedAttempts: 3,
        mitigationAction: "IP blacklisted for 15 minutes",
        timestamp: new Date().toISOString(),
      }),
      createdAt: new Date(Date.now() - 12 * 60 * 1000), // 12 mins ago
    },
  });

  // Security Event 2: Suspicious Geo-IP Jump across continents in 35 mins
  await prisma.securityLog.create({
    data: {
      userId: gamer4.id,
      ipAddress: "81.2.69.142",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0",
      eventType: "GEO_IP_JUMP",
      details: JSON.stringify({
        userEmail: gamer4.email,
        previousIp: "103.1.200.4",
        previousLocation: "Tokyo, Japan (JP)",
        previousTimestamp: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        currentIp: "81.2.69.142",
        currentLocation: "London, United Kingdom (GB)",
        currentTimestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        timeDeltaMinutes: 35,
        estimatedFlightHours: 12.5,
        impossibleTravel: true,
        riskLevel: "HIGH",
        recommendedAction: "Trigger 48h Trade Lock & Invalidate Sessions",
      }),
      createdAt: new Date(Date.now() - 5 * 60 * 1000), // 5 mins ago
    },
  });

  console.log("🛡️ Created Simulated Security Logs (Card Bot Attack + Geo-IP Jump).");
  console.log("✅ Database seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
