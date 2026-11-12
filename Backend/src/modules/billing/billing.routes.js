import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requirePartnerBilling } from '../../middleware/authorize.js'
import { publicOrigin } from '../../config/env.js'
import { PLAN_PRICES, BILLING_PAY_WINDOW_DAYS } from './billing.rules.js'
import { loadBilling, applySubscriptionPayment } from './billing.service.js'
import { updatePlan, clearPendingPlan } from './billing.repository.js'
import { mercadoPagoConfigurationMessage, mercadoPagoRequest } from './mercadopago.gateway.js'

const router = Router()

router.get('/partner/billing', authenticate, requirePartnerBilling, async (req, res, next) => {
  try {
    res.json({ billing: await loadBilling(req.businessId) })
  } catch (error) {
    next(error)
  }
})

router.put('/partner/billing/plan', authenticate, requirePartnerBilling, async (req, res, next) => {
  const plan = req.body?.plan
  if (!Object.hasOwn(PLAN_PRICES, plan)) return res.status(400).json({ error: 'El plan elegido no es válido.' })
  try {
    const updated = await updatePlan(req.businessId, plan)
    if (!updated) return res.status(404).json({ error: 'No encontramos el local.' })
    res.json({ billing: await loadBilling(req.businessId) })
  } catch (error) { next(error) }
})

router.delete('/partner/billing/plan', authenticate, requirePartnerBilling, async (req, res, next) => {
  try {
    await clearPendingPlan(req.businessId)
    res.json({ billing: await loadBilling(req.businessId) })
  } catch (error) { next(error) }
})

router.post('/partner/billing/checkout', authenticate, requirePartnerBilling, async (req, res, next) => {
  try {
    const configurationMessage = mercadoPagoConfigurationMessage()
    if (configurationMessage) {
      return res.status(503).json({ error: configurationMessage })
    }
    const billing = await loadBilling(req.businessId)
    if (!billing.canPay) {
      return res.status(400).json({ error: `Vas a poder pagar desde ${BILLING_PAY_WINDOW_DAYS} días antes del vencimiento.` })
    }
    const origin = publicOrigin
    const webhookBase = process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL
    const returnUrl = `${origin}/?billing=return`
    const preference = await mercadoPagoRequest('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: billing.plan, title: `Dotty - Plan ${billing.planLabel} (1 mes)`, quantity: 1, unit_price: billing.price, currency_id: 'ARS' }],
        external_reference: `sabor-vivo-business-${req.businessId}`,
        back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
        ...(origin.startsWith('https://') ? { auto_return: 'approved' } : {}),
        ...(webhookBase ? { notification_url: `${webhookBase}/api/billing/webhook` } : {}),
      }),
    })
    res.json({ url: preference.init_point })
  } catch (error) {
    if (error.status) return res.status(502).json({ error: `No pudimos iniciar el pago con Mercado Pago: ${error.message}` })
    next(error)
  }
})

router.post('/partner/billing/confirm', authenticate, requirePartnerBilling, async (req, res, next) => {
  const paymentId = String(req.body?.paymentId || '')
  if (!/^\d{1,20}$/.test(paymentId)) return res.status(400).json({ error: 'El pago no es válido.' })
  const configurationMessage = mercadoPagoConfigurationMessage()
  if (configurationMessage) return res.status(503).json({ error: configurationMessage })
  try {
    const result = await applySubscriptionPayment(paymentId)
    res.json({ applied: result.applied, paymentStatus: result.status || 'approved', billing: await loadBilling(req.businessId) })
  } catch (error) {
    if (error.status) return res.status(502).json({ error: `No pudimos verificar el pago: ${error.message}` })
    next(error)
  }
})

router.post('/billing/webhook', async (req, res) => {
  const type = req.body?.type || req.query.type || req.query.topic
  const paymentId = String(req.body?.data?.id || req.query['data.id'] || '')
  if (type !== 'payment' || !/^\d{1,20}$/.test(paymentId) || mercadoPagoConfigurationMessage()) return res.sendStatus(200)
  try {
    await applySubscriptionPayment(paymentId)
    res.sendStatus(200)
  } catch (error) {
    console.error('Error procesando el webhook de Mercado Pago:', error.message)
    res.sendStatus(500)
  }
})


export { router as billingRoutes }
