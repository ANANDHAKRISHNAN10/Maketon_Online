export type UserRole = "ADMIN" | "STAFF" | "GAMER";

export type BillingPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type SubscriptionStatus =
  | "DRAFT"
  | "QUOTATION"
  | "CONFIRMED"
  | "ACTIVE"
  | "PAUSED"
  | "CLOSED";

export type InvoiceStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export type PaymentMethod = "CREDIT_CARD" | "UPI" | "WALLET";

export type PaymentStatus = "SUCCESS" | "FAILED" | "CHARGEBACK";

export type DiscountType = "PERCENT" | "FIXED";

export type SecurityEventType =
  | "GEO_IP_JUMP"
  | "CARD_BOT_ATTACK"
  | "REVENUE_LEAKAGE";

export interface ChurnPredictionResult {
  userId: string;
  email: string;
  riskScore: number;
  riskLevel: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  breakdown: {
    failedPaymentsFactor: number; // 30%
    pauseFrequencyFactor: number; // 25%
    daysToExpiryFactor: number;   // 20%
    accountTenureFactor: number;  // 25%
  };
  metrics: {
    failedPaymentsCount: number;
    pauseCount: number;
    daysUntilExpiry: number;
    accountAgeDays: number;
  };
  recommendation: string;
}

export interface RevenueLeakageDetectionItem {
  id: string;
  type:
    | "ACTIVE_SUB_WITHOUT_INVOICE"
    | "DUPLICATE_INVOICES"
    | "EXPIRED_DISCOUNT_APPLIED"
    | "UNLINKED_SUCCESS_PAYMENT";
  description: string;
  impactAmount: number;
  entityId: string;
  entityName: string;
  detectedAt: string;
  suggestedAction: string;
}

export interface RevenueLeakageSummary {
  totalLeakageCount: number;
  totalImpactAmount: number;
  leakagesByType: {
    activeSubWithoutInvoice: { count: number; amount: number };
    duplicateInvoices: { count: number; amount: number };
    expiredDiscountApplied: { count: number; amount: number };
    unlinkedSuccessPayment: { count: number; amount: number };
  };
  items: RevenueLeakageDetectionItem[];
}
