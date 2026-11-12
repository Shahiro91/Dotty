import { Router } from 'express'
import { pool } from '../../database/pool.js'
import { listPartnerOrders, startOrderShift } from './partner-orders.repository.js'
import { updatePartnerOrderStatus } from './partner-orders.service.js'

export function partnerOrderRoutes(authenticate, requirePartner) {
  const router = Router()
  router.get('/orders', authenticate, requirePartner, async (req, res, next) => {
    try {
      res.json(await listPartnerOrders(req.businessId))
    } catch (error) {
      next(error)
    }
  })

  router.post('/orders/new-shift', authenticate, requirePartner, async (req, res, next) => {
    try {
      const { rows } = await pool.query("SELECT id FROM customer_orders WHERE business_id = $1 AND status = 'in_process'", [req.businessId])
      for (const { id } of rows) await updatePartnerOrderStatus(req.businessId, id, 'cancelled')
      res.json({ shiftStartedAt: await startOrderShift(req.businessId), cancelledOrderIds: rows.map(({ id }) => id) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/orders/:id', authenticate, requirePartner, async (req, res, next) => {
    const orderId = Number(req.params.id)
    const nextStatus = req.body?.status
    if (!Number.isSafeInteger(orderId) || orderId < 1 || !['confirmed', 'sent', 'cancelled'].includes(nextStatus)) {
      return res.status(400).json({ error: 'El estado del pedido no es válido.' })
    }
    try {
      const result = await updatePartnerOrderStatus(req.businessId, orderId, nextStatus)
      if (result === 'not_found') return res.status(404).json({ error: 'No se encontró el pedido en tu local.' })
      if (result === 'invalid_transition') return res.status(409).json({ error: 'Ese pedido ya tiene ese estado y no se puede modificar.' })
      res.json({ orderId, status: nextStatus })
    } catch (error) {
      next(error)
    }
  })
  return router
}
