import { getBillingData, recordPayment } from './billing.repository.js'
import { BILLING_GRACE_DAYS, PLAN_LABELS, PLAN_PRICES, describeBilling } from './billing.rules.js'
import { mercadoPagoConfigurationMessage, mercadoPagoRequest } from './mercadopago.gateway.js'

export async function loadBilling(businessId) {
  const data = await getBillingData(businessId)
  if (!data) return null
  const { business, payments } = data
  const requiresInitialPayment = false
  const initialTrial = payments.length === 0
  const details = describeBilling(business, new Date(), initialTrial ? 0 : BILLING_GRACE_DAYS)
  return {
    ...details,
    pendingPlan: business.pendingPlan,
    pendingPlanLabel: business.pendingPlan ? PLAN_LABELS[business.pendingPlan] : null,
    pendingPlanPrice: business.pendingPlan ? PLAN_PRICES[business.pendingPlan] : null,
    availablePlans: Object.entries(PLAN_PRICES).map(([id, price]) => ({ id, label: PLAN_LABELS[id], price })),
    requiresInitialPayment,
    initialTrial,
    canPay: initialTrial || details.canPay,
    payments,
    paymentsConfigured: !mercadoPagoConfigurationMessage(),
    paymentConfigurationMessage: mercadoPagoConfigurationMessage(),
  }
}

export async function applySubscriptionPayment(paymentId) {
  const payment = await mercadoPagoRequest(`/v1/payments/${encodeURIComponent(paymentId)}`)
  const match = /^sabor-vivo-business-(\d+)$/.exec(payment.external_reference || '')
  if (!match || payment.status !== 'approved') return { applied: false, status: payment.status }
  return recordPayment(match[1], payment)
}
