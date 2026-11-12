import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requireAdmin } from '../../middleware/authorize.js'
import { describeBilling } from '../billing/billing.rules.js'
import { changeSubscription } from './admin.repository.js'
import { changeApplicationStatus, deleteBusiness, getApplications } from './admin.service.js'

const router = Router()
router.get('/local-applications', authenticate, requireAdmin, async (req, res, next) => {
  const requestedStatus = req.query.status || 'pending'
  const status = requestedStatus === 'all' ? null : requestedStatus
  if (status && !['pending', 'contacted', 'approved', 'rejected', 'requests'].includes(status)) {
    return res.status(400).json({ error: 'El filtro de solicitudes no es válido.' })
  }
  try {
    res.json({ applications: await getApplications(status) })
  } catch (error) { next(error) }
})

router.post('/businesses/:id/subscription', authenticate, requireAdmin, async (req, res, next) => {
  const businessId = Number(req.params.id)
  const action = req.body?.action
  if (!Number.isSafeInteger(businessId) || !['extend', 'suspend'].includes(action)) {
    return res.status(400).json({ error: 'La acción no es válida.' })
  }
  try {
    const business = await changeSubscription(businessId, action)
    if (!business) return res.status(404).json({ error: 'No encontramos el local.' })
    res.json({ billing: describeBilling(business) })
  } catch (error) { next(error) }
})

router.delete('/businesses/:id', authenticate, requireAdmin, async (req, res, next) => {
  const businessId = Number(req.params.id)
  if (!Number.isSafeInteger(businessId) || businessId < 1) {
    return res.status(400).json({ error: 'El local no es válido.' })
  }
  try {
    if (!await deleteBusiness(businessId)) return res.status(404).json({ error: 'No encontramos el local.' })
    res.json({ deleted: true })
  } catch (error) { next(error) }
})

router.patch('/local-applications/:id', authenticate, requireAdmin, async (req, res, next) => {
  const applicationId = Number(req.params.id)
  const nextStatus = req.body?.status
  if (!Number.isSafeInteger(applicationId) || applicationId < 1 || !['contacted', 'approved', 'rejected'].includes(nextStatus)) {
    return res.status(400).json({ error: 'La acción solicitada no es válida.' })
  }
  try {
    const result = await changeApplicationStatus(applicationId, nextStatus)
    if (result.error === 'not_found') return res.status(404).json({ error: 'No se encontró esa solicitud.' })
    if (result.error === 'final') return res.status(409).json({ error: 'La solicitud ya tiene una decisión final.' })
    res.json({ application: result.application })
  } catch (error) { next(error) }
})

export { router as adminRoutes }
