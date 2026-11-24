import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireCustomer, requirePartner, requirePartnerBilling, requireVipPlus } from '../../middleware/authorize.js'
import { hasDoublePointsToday } from './business.rules.js'
import { getPlan, getReferralSetting, setBonusDays, setReferrals, updateBusiness, updateOption } from './partner-business.repository.js'
import { readBusinessInput, readBusinessOption } from './partner-business.schema.js'
import { createReferralCode, loadOverview } from './partner-business.service.js'
import { notifyBusinessCustomers, vapidPublicKey } from '../notifications/push.service.js'
import { isVipPlan } from '../billing/billing.rules.js'

const router = Router()
router.get('/partner/overview', authenticate, requirePartnerBilling, async (req, res, next) => {
  try {
    const overview = await loadOverview(req.businessId)
    if (!overview) return res.status(404).json({ error: 'No se encontró el local asociado.' })
    res.json(overview)
  } catch (error) { next(error) }
})

router.patch('/partner/bonus-days', authenticate, requirePartner, async (req, res, next) => {
  try {
    const business = await getPlan(req.businessId)
    if (!business) return res.status(404).json({ error: 'No se encontró el local asociado.' })
    if (!isVipPlan(business.plan)) return res.status(403).json({ error: 'La bonificación de puntos dobles es exclusiva de los planes VIP y VIP PLUS.' })
    const days = req.body?.days
    if (!Array.isArray(days) || days.length > 7
      || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
      || new Set(days).size !== days.length) {
      return res.status(400).json({ error: 'Elegí días válidos para la bonificación.' })
    }
    const { bonusPointsDays, changed } = await setBonusDays(req.businessId, days)
    res.json({ bonusPointsDays, bonusPointsActiveToday: hasDoublePointsToday('vip', bonusPointsDays) })
    if (changed) {
      const message = bonusPointsDays.length ? 'Cambió la promoción de puntos dobles. ¡Consultá los días disponibles!' : 'La promoción de puntos dobles ya no está disponible.'
      notifyBusinessCustomers(req.businessId, message).catch((error) => console.error('Error al enviar notificaciones:', error.message))
    }
  } catch (error) { next(error) }
})

router.post('/partner/notifications/custom', authenticate, requirePartner, requireVipPlus, async (req, res, next) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : ''
  if (!message || message.length > 200) {
    return res.status(400).json({ error: 'Escribí un mensaje de entre 1 y 200 caracteres.' })
  }
  if (!vapidPublicKey) return res.status(503).json({ error: 'Las notificaciones push todavía no están configuradas.' })
  try {
    const result = await notifyBusinessCustomers(req.businessId, message)
    if (result.eligible > 0 && result.sent === 0) {
      return res.status(502).json({ error: 'No pudimos entregar la notificación a los dispositivos elegibles. Probá de nuevo más tarde.' })
    }
    res.json(result)
  } catch (error) { next(error) }
})

router.patch('/partner/referrals', authenticate, requirePartner, async (req, res, next) => {
  const enabled = req.body?.enabled
  const points = Number(req.body?.points)
  if (typeof enabled !== 'boolean' || !Number.isInteger(points) || points < 0 || points > 100_000
    || (enabled && points < 1)) {
    return res.status(400).json({ error: 'Ingresá una cantidad de puntos válida (mayor a 0) para el programa de invitados.' })
  }
  try {
    res.json(await setReferrals(req.businessId, enabled, points))
  } catch (error) { next(error) }
})

router.get('/public/businesses/:slug/referral-code', authenticate, requireCustomer, async (req, res, next) => {
  try {
    const business = await getReferralSetting(req.params.slug)
    if (!business) return res.status(404).json({ error: 'No encontramos ese local.' })
    if (!business.referral_enabled) return res.json({ code: null })
    const code = await createReferralCode(req.customerId)
    if (code) return res.json({ code })
    res.status(500).json({ error: 'No pudimos generar tu código de invitación.' })
  } catch (error) { next(error) }
})

router.patch('/partner/business', authenticate, requirePartner, async (req, res, next) => {
  const input = readBusinessInput(req.body)
  if (!input) return res.status(400).json({ error: 'Revisá el perfil, el WhatsApp con código de país, el banner y las opciones visuales.' })
  try {
    const business = await updateBusiness(req.businessId, input)
    if (!business) return res.status(404).json({ error: 'No se encontró el local asociado.' })
    res.json({ business })
  } catch (error) { next(error) }
})

router.patch('/partner/business/options', authenticate, requirePartner, async (req, res, next) => {
  const input = readBusinessOption(req.body)
  if (!input) return res.status(400).json({ error: 'Elegí una opción válida para actualizar.' })
  try {
    const business = await updateOption(req.businessId, input.field, input.column, input.value)
    if (!business) return res.status(404).json({ error: 'No se encontró el local asociado.' })
    res.json({ business })
  } catch (error) { next(error) }
})

export { router as partnerBusinessRoutes }
