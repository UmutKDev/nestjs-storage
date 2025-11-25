enum BillingCycle {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
  ONETIME = 'ONETIME',
  TRIAL = 'TRIAL',
}

enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  TRIALING = 'TRIALING',
}

export { BillingCycle, SubscriptionStatus };
