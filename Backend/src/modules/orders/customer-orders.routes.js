import { Router } from 'express'
import { menuItems } from '../../../../FrontEnd/src/data/menu.js'
import { pool } from '../../database/pool.js'
import { authenticate } from '../../middleware/authenticate.js'
import { isBusinessSuspended, requireCustomer } from '../../middleware/authorize.js'
import { hasDoublePointsToday } from '../businesses/business.rules.js'
import { readOrderInput } from './order.schema.js'
import { buildOrderItems } from './order-items.service.js'
import { findOrderingBusiness, listOrderingProducts, listRequiredTwoGroups, listMandatoryGroups, listOrderingAddons } from './order-catalog.repository.js'
import { persistOrder } from './order-write.service.js'
import { findCustomerOrderStatus } from './customer-orders.repository.js'

const menuById = new Map(menuItems.map((item) => [item.id, item]))
const router = Router()
router.get('/:id/status', authenticate, requireCustomer, async (req, res, next) => {
  const orderId = Number(req.params.id)
  if (!Number.isSafeInteger(orderId) || orderId < 1) return res.status(400).json({ error: 'El pedido no es válido.' })
  try {
    const order = await findCustomerOrderStatus(req.customerId, orderId)
    if (!order) return res.status(404).json({ error: 'No encontramos ese pedido en tu cuenta.' })
    res.json(order)
  } catch (error) {
    next(error)
  }
})

router.post('/', authenticate, requireCustomer, async (req, res, next) => {
  const input = readOrderInput(req.body)
  if (input.error) return res.status(400).json({ error: input.error })
  const { requestedItems, discountRewardId, productRewardId, requestedAddonIds, businessSlug, referralCode,
    fulfillmentType, customerFirstName, customerLastName, deliveryAddress, paymentMethod, customerNotes,
    deliveryReference, deliveryFloor, deliveryApartment, cashPaymentAmount, deliveryLat, deliveryLng } = input
  let businessId = null
  let businessPlan = 'basic'
  let bonusPointsDays = []
  let referralEnabled = false
  let referralPoints = 0
  let productById = menuById
  const addonById = new Map()
  const requiredTwoGroupsByProduct = new Map()
  const mustChooseGroupsByScope = new Map()
  if (businessSlug) {
    try {
      const business = await findOrderingBusiness(businessSlug)
      if (!business) return res.status(404).json({ error: 'No encontramos ese local.' })
      if (await isBusinessSuspended(pool, business.id)) return res.status(403).json({ error: 'Este local no está disponible por el momento.' })
      if (fulfillmentType === 'delivery' && !business.deliveryEnabled) return res.status(400).json({ error: 'Este local no ofrece envios a domicilio.' })
      if (requestedAddonIds.length && !business.addonsEnabled) return res.status(400).json({ error: 'Este local no ofrece agregados.' })
      businessId = business.id
      businessPlan = business.plan
      bonusPointsDays = business.bonusPointsDays
      referralEnabled = business.referralEnabled
      referralPoints = business.referralPoints
      const products = await listOrderingProducts(businessId)
      productById = new Map(products.map((product) => [String(product.id), product]))
      const requiredGroups = await listRequiredTwoGroups(businessId, business.addonsEnabled)
      for (const group of requiredGroups) {
        const scopeKey = group.productId == null ? `category:${group.categoryId}` : `product:${group.productId}`
        requiredTwoGroupsByProduct.set(scopeKey, [...(requiredTwoGroupsByProduct.get(scopeKey) || []), group])
      }
      const mustChooseGroups = await listMandatoryGroups(businessId, business.addonsEnabled)
      for (const group of mustChooseGroups) {
        const scopeKey = group.productId == null ? `category:${group.categoryId}` : `product:${group.productId}`
        mustChooseGroupsByScope.set(scopeKey, [...(mustChooseGroupsByScope.get(scopeKey) || []), group])
      }
      if (requestedAddonIds.length) {
        const uniqueAddonIds = [...new Set(requestedAddonIds)]
        const addons = await listOrderingAddons(businessId, uniqueAddonIds)
        if (addons.length !== uniqueAddonIds.length) {
          return res.status(400).json({ error: 'Uno o más agregados ya no están disponibles.' })
        }
        for (const addon of addons) addonById.set(String(addon.id), addon)
      }
    } catch (error) {
      return next(error)
    }
  }
  if (requestedAddonIds.length && !businessId) {
    return res.status(400).json({ error: 'Los agregados solo están disponibles en productos de un local.' })
  }

  const itemResult = buildOrderItems({ requestedItems, productById, addonById, businessId, requiredTwoGroupsByProduct, mustChooseGroupsByScope })
  if (itemResult.error) return res.status(400).json({ error: itemResult.error })
  const { items } = itemResult

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const basePointsAwarded = businessId
    ? items.reduce((sum, item) => sum + item.pointsPerUnit * item.quantity, 0)
    : Math.floor(subtotal / 1000)
  const bonusApplied = hasDoublePointsToday(businessPlan, bonusPointsDays)
  const pointsAwarded = basePointsAwarded * (bonusApplied ? 2 : 1)
  try {
    const result = await persistOrder({ customerId: req.customerId, businessId, discountRewardId, productRewardId, subtotal, pointsAwarded, bonusApplied, items, deliveryAddress, paymentMethod, customerNotes, fulfillmentType, deliveryReference, deliveryFloor, deliveryApartment, cashPaymentAmount, deliveryLat, deliveryLng, customerFirstName, customerLastName, referralEnabled, referralPoints, referralCode })
    res.status(result.status).json(result.body)
  } catch (error) {
    next(error)
  }
})

export { router as customerOrderRoutes }
