interface Bucket {
  tokens: number;
  lastRefill: number;
  failedAttempts: number;
  blockedUntil: number | null;
  userAgent?: string;
  logs: Array<{ timestamp: number; reason: string }>;
}

class TokenBucketRateLimiter {
  private capacity: number;
  private refillRatePerSecond: number;
  private maxFailedAttempts: number;
  private blockDurationMs: number;
  private buckets: Map<string, Bucket>;

  constructor(
    capacity = 10,
    refillRatePerSecond = 2,
    maxFailedAttempts = 3,
    blockDurationMs = 15 * 60 * 1000 // 15 mins block
  ) {
    this.capacity = capacity;
    this.refillRatePerSecond = refillRatePerSecond;
    this.maxFailedAttempts = maxFailedAttempts;
    this.blockDurationMs = blockDurationMs;
    this.buckets = new Map();
  }

  private getBucket(ip: string): Bucket {
    let bucket = this.buckets.get(ip);
    if (!bucket) {
      bucket = {
        tokens: this.capacity,
        lastRefill: Date.now(),
        failedAttempts: 0,
        blockedUntil: null,
        logs: [],
      };
      this.buckets.set(ip, bucket);
    }
    return bucket;
  }

  private refill(bucket: Bucket): void {
    const now = Date.now();
    const elapsedSeconds = (now - bucket.lastRefill) / 1000;
    if (elapsedSeconds > 0) {
      bucket.tokens = Math.min(
        this.capacity,
        bucket.tokens + elapsedSeconds * this.refillRatePerSecond
      );
      bucket.lastRefill = now;
    }
  }

  public check(ip: string, userAgent?: string): {
    allowed: boolean;
    reason?: string;
    isBotBlocked: boolean;
    remainingTokens: number;
    failedAttempts: number;
    blockedUntil: number | null;
  } {
    const bucket = this.getBucket(ip);
    if (userAgent) bucket.userAgent = userAgent;
    const now = Date.now();

    // Check if hard-blocked due to 3+ failed card attempts (bot mitigation)
    if (bucket.blockedUntil && bucket.blockedUntil > now) {
      const remainingSeconds = Math.ceil((bucket.blockedUntil - now) / 1000);
      return {
        allowed: false,
        reason: `Card testing bot defense triggered: IP blocked for ${remainingSeconds}s after ${bucket.failedAttempts} consecutive failed attempts.`,
        isBotBlocked: true,
        remainingTokens: 0,
        failedAttempts: bucket.failedAttempts,
        blockedUntil: bucket.blockedUntil,
      };
    } else if (bucket.blockedUntil && bucket.blockedUntil <= now) {
      // Unblock after timeout expires
      bucket.blockedUntil = null;
      bucket.failedAttempts = 0;
    }

    this.refill(bucket);

    if (bucket.tokens < 1) {
      return {
        allowed: false,
        reason: "Rate limit exceeded (token bucket exhausted). Please slow down.",
        isBotBlocked: false,
        remainingTokens: 0,
        failedAttempts: bucket.failedAttempts,
        blockedUntil: null,
      };
    }

    // Deduct one token for the request
    bucket.tokens -= 1;

    return {
      allowed: true,
      isBotBlocked: false,
      remainingTokens: Math.floor(bucket.tokens),
      failedAttempts: bucket.failedAttempts,
      blockedUntil: null,
    };
  }

  public recordFailure(ip: string, userAgent?: string): {
    blocked: boolean;
    failedAttempts: number;
    blockedUntil: number | null;
  } {
    const bucket = this.getBucket(ip);
    if (userAgent) bucket.userAgent = userAgent;
    bucket.failedAttempts += 1;
    bucket.logs.push({
      timestamp: Date.now(),
      reason: "Card payment verification failed",
    });

    if (bucket.failedAttempts >= this.maxFailedAttempts) {
      bucket.blockedUntil = Date.now() + this.blockDurationMs;
      return {
        blocked: true,
        failedAttempts: bucket.failedAttempts,
        blockedUntil: bucket.blockedUntil,
      };
    }

    return {
      blocked: false,
      failedAttempts: bucket.failedAttempts,
      blockedUntil: null,
    };
  }

  public recordSuccess(ip: string): void {
    const bucket = this.getBucket(ip);
    bucket.failedAttempts = 0;
    bucket.blockedUntil = null;
  }

  public reset(ip: string): void {
    this.buckets.delete(ip);
  }

  public getAllBlocked(): Array<{
    ip: string;
    failedAttempts: number;
    blockedUntil: number;
    userAgent?: string;
  }> {
    const now = Date.now();
    const result = [];
    for (const [ip, bucket] of this.buckets.entries()) {
      if (bucket.blockedUntil && bucket.blockedUntil > now) {
        result.push({
          ip,
          failedAttempts: bucket.failedAttempts,
          blockedUntil: bucket.blockedUntil,
          userAgent: bucket.userAgent,
        });
      }
    }
    return result;
  }
}

// Global singleton to persist across Next.js dev server reloads
const globalForLimiter = globalThis as unknown as {
  checkoutLimiter: TokenBucketRateLimiter | undefined;
};

export const checkoutRateLimiter =
  globalForLimiter.checkoutLimiter ?? new TokenBucketRateLimiter(10, 2, 3, 15 * 60 * 1000);

if (process.env.NODE_ENV !== "production") {
  globalForLimiter.checkoutLimiter = checkoutRateLimiter;
}
