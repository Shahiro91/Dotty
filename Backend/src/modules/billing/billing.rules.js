export const PLAN_PRICES = { basic: 15000, vip: 25000 }
export const PLAN_LABELS = { basic: 'Básico', vip: 'VIP' }
export const BILLING_INITIAL_TRIAL_DAYS = 30
export const BILLING_GRACE_DAYS = 5
export const BILLING_PAY_WINDOW_DAYS = 10
const DAY_MS = 24 * 60 * 60 * 1000

export function describeBilling({ plan, subscriptionDueAt }, now = new Date(), graceDays = BILLING_GRACE_DAYS) {
  const dueAt = new Date(subscriptionDueAt)
  const graceEndsAt = new Date(dueAt.getTime() + graceDays * DAY_MS)
  const status = now <= dueAt ? 'active' : now <= graceEndsAt ? 'grace' : 'suspended'
  return {
    plan,
    planLabel: PLAN_LABELS[plan],
    price: PLAN_PRICES[plan],
    dueAt: dueAt.toISOString(),
    graceEndsAt: graceEndsAt.toISOString(),
    status,
    canPay: dueAt.getTime() - now.getTime() <= BILLING_PAY_WINDOW_DAYS * DAY_MS,
  }
}
