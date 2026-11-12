import { isValidImageDataUrl } from '../../shared/image.js'

export function readRewardInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const imageDataUrl = body?.imageDataUrl ?? ''
  const rewardType = body?.rewardType ?? 'product'
  const productId = body?.productId == null || body.productId === '' ? null : Number(body.productId)
  const discountType = body?.discountType ?? 'fixed'
  const discountScope = rewardType === 'discount' ? (body?.discountScope ?? 'total') : 'total'
  const discountCategory = discountScope === 'category' && typeof body?.discountCategory === 'string' ? body.discountCategory.trim() : ''
  const discountValue = Number(body?.discountValue ?? 0)
  const availableDays = body?.availableDays == null ? null : body.availableDays
  const daysAreValid = availableDays === null || (Array.isArray(availableDays) && availableDays.length >= 1 && availableDays.length <= 7
    && availableDays.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) && new Set(availableDays).size === availableDays.length)
  const pointsCost = Number(body?.pointsCost)
  if (!name || name.length > 100 || description.length > 500 || !daysAreValid
    || !Number.isSafeInteger(pointsCost) || pointsCost < 1 || pointsCost > 1_000_000
    || !isValidImageDataUrl(imageDataUrl)
    || !['product', 'discount'].includes(rewardType)
    || !['total', 'product', 'category'].includes(discountScope)
    || (productId !== null && (!Number.isSafeInteger(productId) || productId < 1))
    || (rewardType === 'discount' && (discountScope === 'product') !== (productId !== null))
    || (discountScope === 'category' && !discountCategory)
    || !['fixed', 'percentage'].includes(discountType)
    || !Number.isSafeInteger(discountValue) || discountValue < 0 || discountValue > 100_000_000
    || (rewardType === 'discount' && (discountValue < 1 || (discountType === 'percentage' && discountValue > 100)))) return null
  return { name, description, imageDataUrl, rewardType, productId, discountType, discountScope, discountCategory, discountValue, pointsCost, availableDays: availableDays && [...availableDays].sort() }
}
