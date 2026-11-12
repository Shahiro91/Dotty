import { Router } from 'express'
import { authenticate } from '../../middleware/authenticate.js'
import { requirePartner } from '../../middleware/authorize.js'
import { listAddons } from './addons.repository.js'
import { readCreateAddon, readGroupKey, readUpdateAddon } from './addons.schema.js'
import { createAddon, editAddon, editAddonGroup, removeAddon, removeAddonGroup } from './addons.service.js'

const router = Router()
router.get('/category-addons', authenticate, requirePartner, async (req, res, next) => {
  try {
    res.json({ addons: await listAddons(req.businessId) })
  } catch (error) {
    next(error)
  }
})

router.post('/category-addons', authenticate, requirePartner, async (req, res, next) => {
  const input = readCreateAddon(req.body)
  if (!input) return res.status(400).json({ error: 'Revisá el nombre, categoría y precio del agregado.' })
  try {
    const result = await createAddon(req.businessId, input, req.body?.isRequired)
    if (result.error === 'category_not_found') return res.status(404).json({ error: 'No se encontró esa categoría.' })
    if (result.error === 'product_unavailable') return res.status(400).json({ error: 'Elegí un producto disponible de esta categoría.' })
    if (result.error === 'group_mismatch') return res.status(400).json({ error: 'Mantené la misma configuración en todas las opciones del grupo.' })
    res.status(201).json({ addon: result.addon })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe ese agregado en la categoría.' })
    next(error)
  }
})

router.patch('/category-addons/:id', authenticate, requirePartner, async (req, res, next) => {
  const addonId = Number(req.params.id)
  const input = readUpdateAddon(req.body, addonId)
  if (!input) return res.status(400).json({ error: 'Revisa el nombre, grupo, producto y precio de la opcion.' })
  try {
    const result = await editAddon(req.businessId, addonId, input)
    if (result.error === 'not_found') return res.status(404).json({ error: 'No encontramos esa opcion.' })
    if (result.error === 'required_two') return res.status(400).json({ error: 'Desactiva primero la regla de dos opciones antes de cambiar el producto o grupo.' })
    if (result.error === 'product') return res.status(400).json({ error: 'Elige un producto disponible de esta categoria.' })
    if (result.error === 'group_mismatch') return res.status(400).json({ error: 'Manten la misma configuracion en todas las opciones del grupo.' })
    res.json(result)
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe esa opcion en el grupo.' })
    next(error)
  }
})

router.patch('/category-addon-groups', authenticate, requirePartner, async (req, res, next) => {
  const categoryName = typeof req.body?.category === 'string' ? req.body.category.trim() : ''
  const current = readGroupKey(req.body)
  const next_ = readGroupKey(req.body, 'new')
  const selectionMode = req.body?.selectionMode
  const isRequired = req.body?.isRequired === true
  const clearRequiredTwo = req.body?.clearRequiredTwo === true
  if (!categoryName || !current.groupName || current.groupName.length > 80 || !next_.groupName || next_.groupName.length > 80
    || !['single', 'multiple'].includes(selectionMode)
    || [current.productId, next_.productId].some((id) => id !== null && (!Number.isSafeInteger(id) || id < 1))) {
    return res.status(400).json({ error: 'Revisá el nombre y la configuración del grupo.' })
  }
  try {
    const result = await editAddonGroup(req.businessId, categoryName, current, next_, selectionMode, isRequired, clearRequiredTwo)
    if (result.error === 'category_not_found') return res.status(404).json({ error: 'No se encontró esa categoría.' })
    if (result.error === 'group_not_found') return res.status(404).json({ error: 'No encontramos ese grupo.' })
    if (result.error === 'required_two') return res.status(400).json({ error: 'Quitá primero la regla anterior de "exactamente 2 opciones".' })
    if (result.error === 'group_exists') return res.status(409).json({ error: 'Ya existe un grupo con ese nombre.' })
    if (result.error === 'product') return res.status(400).json({ error: 'Elegí un producto disponible de esta categoría.' })
    res.json({ groupAddons: result.groupAddons })
  } catch (error) { next(error) }
})

router.delete('/category-addon-groups', authenticate, requirePartner, async (req, res, next) => {
  const categoryName = typeof req.body?.category === 'string' ? req.body.category.trim() : ''
  const key = readGroupKey(req.body)
  if (!categoryName || !key.groupName || (key.productId !== null && (!Number.isSafeInteger(key.productId) || key.productId < 1))) {
    return res.status(400).json({ error: 'Revisá el grupo que querés eliminar.' })
  }
  try {
    await removeAddonGroup(req.businessId, categoryName, key)
    res.sendStatus(204)
  } catch (error) { next(error) }
})

router.delete('/category-addons/:id', authenticate, requirePartner, async (req, res, next) => {
  try {
    const result = await removeAddon(req.businessId, req.params.id)
    if (result === 'not_found') return res.status(404).json({ error: 'No encontramos esa opcion.' })
    if (result === 'required_two') return res.status(409).json({ error: 'Desactiva la regla de dos opciones antes de quitar uno de los dos gustos.' })
    res.sendStatus(204)
  } catch (error) { next(error) }
})

export { router as addonRoutes }
