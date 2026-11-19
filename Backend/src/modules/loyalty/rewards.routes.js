import { Router } from 'express'
import { categoryExists, disableReward, insertReward, listRewards, productIsAvailable, updateReward } from './rewards.repository.js'
import { readRewardInput } from './rewards.schema.js'
import { notifyBusinessCustomers } from '../notifications/push.service.js'

async function validateRewardTarget(businessId, reward) {
  if (reward.rewardType === 'product' || reward.discountScope === 'product') {
    const available = reward.productId && await productIsAvailable(businessId, reward.productId)
    if (!available) return 'Elegí un producto disponible de tu local para este canje.'
  }
  if (reward.discountScope === 'category' && !await categoryExists(businessId, reward.discountCategory)) {
    return 'Elegí una categoría de tu local para este descuento.'
  }
  return null
}

export function rewardRoutes(authenticate, requirePartner) {
  const router = Router()
  router.get('/rewards', authenticate, requirePartner, async (req, res, next) => {
    try {
      res.json({ rewards: await listRewards(req.businessId) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/rewards', authenticate, requirePartner, async (req, res, next) => {
    const reward = readRewardInput(req.body)
    if (!reward) return res.status(400).json({ error: 'Revisá el nombre y costo en puntos de la recompensa.' })
    try {
      const targetError = await validateRewardTarget(req.businessId, reward)
      if (targetError) return res.status(400).json({ error: targetError })
      const created = await insertReward(req.businessId, reward)
      res.status(201).json({ reward: created })
      notifyBusinessCustomers(req.businessId, `Nuevo canje: ${created.name}`).catch((error) => console.error('Error al enviar notificaciones:', error.message))
    } catch (error) {
      next(error)
    }
  })

  router.patch('/rewards/:id', authenticate, requirePartner, async (req, res, next) => {
    const rewardId = Number(req.params.id)
    const reward = readRewardInput(req.body)
    if (!Number.isSafeInteger(rewardId) || rewardId < 1 || !reward) {
      return res.status(400).json({ error: 'Revisá los datos de la recompensa.' })
    }
    try {
      const targetError = await validateRewardTarget(req.businessId, reward)
      if (targetError) return res.status(400).json({ error: targetError })
      const updated = await updateReward(req.businessId, rewardId, reward)
      if (!updated) return res.status(404).json({ error: 'No se encontró esa recompensa.' })
      res.json({ reward: updated })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/rewards/:id', authenticate, requirePartner, async (req, res, next) => {
    try {
      if (!await disableReward(req.businessId, req.params.id)) return res.status(404).json({ error: 'No se encontró esa recompensa.' })
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  return router
}
