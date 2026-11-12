import { Router } from 'express'
import { deleteCategory, insertCategory, listCategories, renameCategory } from './categories.repository.js'
import { readCreateCategory, readDeleteCategory, readUpdateCategory } from './categories.schema.js'

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
      res.status(201).json({ category: { ...category, productCount: 0 } })
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' })
      next(error)
    }
  })

  router.patch('/categories', authenticate, requirePartner, async (req, res, next) => {
    const input = readUpdateCategory(req.body)
    if (!input) {
      return res.status(400).json({ error: 'Ingresá un nombre de categoría válido.' })
    }
    const { currentName, name, fractionalParts } = input
    if (currentName === name && fractionalParts === null) return res.json({ category: { name } })
    try {
      const category = await renameCategory(req.businessId, currentName, name, fractionalParts)
      if (!category) return res.status(404).json({ error: 'No se encontró esa categoría.' })
      res.json({ category })
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
      res.json({ category: fallbackCategory, productsMoved })
    } catch (error) {
      next(error)
    }
  })
  return router
}
