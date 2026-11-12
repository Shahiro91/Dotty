import { Router } from 'express'
import { listForBusiness } from './customers.repository.js'

export function customerRoutes(authenticate, requirePartner) {
  const router = Router()
  router.get('/customers', authenticate, requirePartner, async (req, res, next) => {
    try {
      res.json({ customers: await listForBusiness(req.businessId) })
    } catch (error) {
      next(error)
    }
  })
  return router
}
