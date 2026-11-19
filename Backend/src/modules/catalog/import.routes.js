import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requirePartner, requireVip } from '../../middleware/authorize.js'
import { readCatalogImport } from './import.schema.js'
import { importCatalog } from './import.service.js'
import { notifyBusinessCustomers } from '../notifications/push.service.js'

const router = Router()
router.post('/import-catalog', authenticate, requirePartner, requireVip, async (req, res, next) => {
  const input = readCatalogImport(req.body || {})
  if (input.error) return res.status(400).json({ error: input.error })
  try {
    const result = await importCatalog(req.businessId, input)
    if (result.error) return res.status(400).json({ error: result.error })
    res.json(result.counts)
    if (result.hasNewRewards) {
      notifyBusinessCustomers(req.businessId, '¡Hay nuevos canjes disponibles!').catch((error) => console.error('Error al enviar notificaciones:', error.message))
    }
  } catch (error) {
    next(error)
  }
})

export { router as catalogImportRoutes }
