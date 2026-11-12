import { Router } from 'express'
import { getStorefront } from './storefront.service.js'

const router = Router()
router.get('/businesses/:slug', async (req, res, next) => {
  try {
    const result = await getStorefront(req.params.slug)
    if (result.error === 'not_found') return res.status(404).json({ error: 'No encontramos ese local.' })
    if (result.error === 'suspended') return res.status(403).json({ error: 'Este local no está disponible por el momento.', code: 'store_unavailable' })
    res.json(result)
  } catch (error) {
    next(error)
  }
})

export { router as storefrontRoutes }
