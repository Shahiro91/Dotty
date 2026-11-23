import { Router } from 'express'
import { deleteCategory, insertCategory, listCategories, renameCategory, reorderCategories } from './categories.repository.js'
import { readCategoryOrder, readCreateCategory, readDeleteCategory, readUpdateCategory } from './categories.schema.js'

export function categoryRoutes(authenticate, requirePartner) {
  const router = Router()
  router.get('/categories', authenticate, requirePartner, async (req, res, next) => {
    try {
      res.json({ categories: await listCategories(req.businessId) })
    } catch (error) {
      next(error)
    }
  })

  router.post('/categories', authenticate, requirePartner, async (req, res, next) => {
    const input = readCreateCategory(req.body)
    if (!input) {
      return res.status(400).json({ error: 'Ingresá un nombre de categoría válido.' })
    }
    try {
      const category = await insertCategory(req.businessId, input.name, input.fractionalParts)
      res.status(201).json({ category: { ...category, productCount: 0 }, categories: await listCategories(req.businessId) })
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' })
      next(error)
    }
  })

  router.put('/categories/order', authenticate, requirePartner, async (req, res, next) => {
    const names = readCategoryOrder(req.body)
    if (!names) return res.status(400).json({ error: 'El orden de categorías no es válido.' })
    try {
      if (!await reorderCategories(req.businessId, names)) {
        return res.status(409).json({ error: 'Las categorías cambiaron. Actualizá la página y volvé a ordenarlas.' })
      }
      res.json({ categories: await listCategories(req.businessId) })
    } catch (error) { next(error) }
  })

  router.patch('/categories', authenticate, requirePartner, async (req, res, next) => {
    const input = readUpdateCategory(req.body)
    if (!input) {
      return res.status(400).json({ error: 'Ingresá un nombre de categoría válido.' })
    }
    const { currentName, name, fractionalParts } = input
    try {
      if (currentName === name && fractionalParts === null) return res.json({ category: { name }, categories: await listCategories(req.businessId) })
      const category = await renameCategory(req.businessId, currentName, name, fractionalParts)
      if (!category) return res.status(404).json({ error: 'No se encontró esa categoría.' })
      res.json({ category, categories: await listCategories(req.businessId) })
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' })
      next(error)
    }
  })

  router.delete('/categories', authenticate, requirePartner, async (req, res, next) => {
    const name = readDeleteCategory(req.body)
    if (!name) return res.status(400).json({ error: 'La categoría indicada no es válida.' })
    const fallbackCategory = name.toLocaleLowerCase('es') === 'general' ? 'Sin categoría' : 'General'
    try {
      const productsMoved = await deleteCategory(req.businessId, name, fallbackCategory)
      if (productsMoved === null) return res.status(404).json({ error: 'No se encontró esa categoría.' })
      res.json({ category: fallbackCategory, productsMoved, categories: await listCategories(req.businessId) })
    } catch (error) {
      next(error)
    }
  })
  return router
}
