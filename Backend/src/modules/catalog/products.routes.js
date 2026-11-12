import { Router } from 'express'
import { readProductInput } from './products.schema.js'
import { archiveProduct, categoryExists, createProduct, hasLinkedRewards, listProducts, setAvailability, updateProduct } from './products.repository.js'

export function productRoutes(authenticate, requirePartner) {
  const router = Router()
  router.get('/products', authenticate, requirePartner, async (req, res, next) => {
    try {
      res.json({ products: await listProducts(req.businessId) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/products', authenticate, requirePartner, async (req, res, next) => {
    const product = readProductInput(req.body)
    if (!product) return res.status(400).json({ error: 'Revisá nombre, categoría, precio, puntos e imagen del producto.' })
    try {
      if (!await categoryExists(req.businessId, product.category)) return res.status(400).json({ error: 'Elegí una categoría existente de tu local.' })
      res.status(201).json({ product: await createProduct(req.businessId, product) })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/products/:id', authenticate, requirePartner, async (req, res, next) => {
    const productId = Number(req.params.id)
    const input = readProductInput(req.body)
    if (!Number.isSafeInteger(productId) || productId < 1 || !input) {
      return res.status(400).json({ error: 'Revisá los datos del producto.' })
    }
    try {
      if (!await categoryExists(req.businessId, input.category)) return res.status(400).json({ error: 'Elegí una categoría existente de tu local.' })
      const product = await updateProduct(req.businessId, productId, input)
      if (!product) return res.status(404).json({ error: 'No se encontró ese producto en tu local.' })
      res.json({ product })
    } catch (error) {
      next(error)
    }
  })

  router.patch('/products/:id/availability', authenticate, requirePartner, async (req, res, next) => {
    const productId = Number(req.params.id)
    const isAvailable = req.body?.isAvailable
    if (!Number.isSafeInteger(productId) || productId < 1 || typeof isAvailable !== 'boolean') {
      return res.status(400).json({ error: 'Indicá si el producto está disponible.' })
    }
    try {
      const product = await setAvailability(req.businessId, productId, isAvailable)
      if (!product) return res.status(404).json({ error: 'No se encontró ese producto en tu local.' })
      res.json({ product })
    } catch (error) {
      next(error)
    }
  })

  router.delete('/products/:id', authenticate, requirePartner, async (req, res, next) => {
    try {
      if (await hasLinkedRewards(req.businessId, req.params.id)) return res.status(409).json({ error: 'Este producto está asociado a un canje. Cambiá o quitá ese canje antes de archivarlo.' })
      if (!await archiveProduct(req.businessId, req.params.id)) return res.status(404).json({ error: 'No se encontró ese producto en tu local.' })
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })
  return router
}
