import { Router } from 'express'
import { listRedemptions } from './redemptions.repository.js'
import { redeemReward, resolveRedemption } from './redemptions.service.js'

export function publicRedemptionRoutes(authenticate) {
  const router = Router()
  router.post('/businesses/:slug/redeem', authenticate, async (req, res, next) => {
    const rewardId = Number(req.body?.rewardId)
    if (!Number.isSafeInteger(rewardId) || rewardId < 1) {
      return res.status(400).json({ error: 'El canje seleccionado no es válido.' })
    }
    try {
      const result = await redeemReward(req.customerId, req.params.slug, rewardId)
      if (result.error === 'invalid_role') return res.status(403).json({ error: 'Solo las cuentas de cliente pueden canjear puntos.' })
      if (result.error === 'business_not_found') return res.status(404).json({ error: 'No encontramos ese local.' })
      if (result.error === 'business_suspended') return res.status(403).json({ error: 'Este local no está disponible por el momento.' })
      if (result.error === 'reward_not_found') return res.status(404).json({ error: 'Ese canje ya no está disponible.' })
      if (result.error === 'requires_order') return res.status(400).json({ error: 'Este canje debe agregarse al pedido antes de confirmarlo.' })
      if (result.error === 'insufficient_points') return res.status(400).json({ error: 'Todavía no tenés puntos suficientes para ese canje.' })
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })
  return router
}

export function redemptionRoutes(authenticate, requirePartner) {
  const router = Router()
  router.get('/redemptions', authenticate, requirePartner, async (req, res, next) => {
    try {
      res.json({ redemptions: await listRedemptions(req.businessId) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/redemptions/:id', authenticate, requirePartner, async (req, res, next) => {
    const redemptionId = Number(req.params.id)
    const nextStatus = req.body?.status
    if (!Number.isSafeInteger(redemptionId) || redemptionId < 1 || !['fulfilled', 'cancelled'].includes(nextStatus)) {
      return res.status(400).json({ error: 'El estado del canje no es válido.' })
    }
    try {
      const result = await resolveRedemption(req.businessId, redemptionId, nextStatus)
      if (result.error === 'not_found') return res.status(404).json({ error: 'No se encontró ese canje.' })
      if (result.error === 'already_resolved') return res.status(409).json({ error: 'Ese canje ya fue resuelto.' })
      res.json({ redemption: result.redemption })
    } catch (error) {
      next(error)
    }
  })
  return router
}
