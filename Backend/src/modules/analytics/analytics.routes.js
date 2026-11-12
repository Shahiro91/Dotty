import { Router } from 'express'
import { getStatistics } from './analytics.service.js'

export function analyticsRoutes(authenticate, requirePartner) {
  const router = Router()
  router.get('/stats', authenticate, requirePartner, async (req, res, next) => {
    try {
      res.json(await getStatistics(req.businessId))
    } catch (error) {
      next(error)
    }
  })
  return router
}
