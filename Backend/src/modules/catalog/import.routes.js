import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requirePartner, requireVip } from '../../middleware/authorize.js'
import { readCatalogImport } from './import.schema.js'
import { importCatalog } from './import.service.js'

const router = Router()
router.post('/import-catalog', authenticate, requirePartner, requireVip, async (req, res, next) => {
  const input = readCatalogImport(req.body || {})
  if (input.error) return res.status(400).json({ error: input.error })
  try {
    const result = await importCatalog(req.businessId, input)
    if (result.error) return res.status(400).json({ error: result.error })
    res.json(result.counts)
  } catch (error) {
    next(error)
  }
})

export { router as catalogImportRoutes }
