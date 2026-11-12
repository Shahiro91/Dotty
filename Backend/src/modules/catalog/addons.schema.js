function readOption(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const groupName = typeof body?.groupName === 'string' ? body.groupName.trim() : ''
  const selectionMode = body?.selectionMode || 'multiple'
  const rawProductId = body?.productId
  const productId = rawProductId == null || rawProductId === '' ? null : Number(rawProductId)
  const requiredTwo = body?.requiredTwo === true
  const price = Number(body?.price ?? 0)
  if (!name || name.length > 80 || !groupName || groupName.length > 80
    || !['single', 'multiple'].includes(selectionMode)
    || (productId !== null && (!Number.isSafeInteger(productId) || productId < 1))
    || (requiredTwo && selectionMode !== 'multiple')
    || !Number.isSafeInteger(price) || price < 0 || price > 100_000_000) return null
  return { name, groupName, selectionMode, productId, requiredTwo, price }
}

export function readCreateAddon(body) {
  const categoryName = typeof body?.category === 'string' ? body.category.trim() : ''
  const option = readOption(body)
  if (!categoryName || categoryName.length > 60 || !option) return null
  return { categoryName, ...option }
}

export function readUpdateAddon(body, addonId) {
  if (!Number.isSafeInteger(addonId) || addonId < 1) return null
  return readOption(body)
}

export function readGroupKey(body, prefix = '') {
  const rawProductId = body?.[`${prefix}productId`]
  return {
    productId: rawProductId == null || rawProductId === '' ? null : Number(rawProductId),
    groupName: typeof body?.[`${prefix}groupName`] === 'string' ? body[`${prefix}groupName`].trim() : '',
  }
}
