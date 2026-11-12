export function readOrderInput(body) {
  const requestedItems = body?.items
  const discountRewardId = body?.discountRewardId == null ? null : Number(body.discountRewardId)
  const productRewardId = body?.productRewardId == null ? null : Number(body.productRewardId)
  if (!Array.isArray(requestedItems) || requestedItems.length > 30
    || (requestedItems.length === 0 && productRewardId === null)) {
    return { error: 'El pedido no contiene productos válidos.' }
  }
  const requestedAddonIds = []
  for (const requestedItem of requestedItems) {
    const addonIds = requestedItem?.addonIds ?? []
    if (!Array.isArray(addonIds) || addonIds.length > 12
      || addonIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1)
      || new Set(addonIds.map(String)).size !== addonIds.length
      || (requestedItem?.partProductIds != null && (!Array.isArray(requestedItem.partProductIds)
        || requestedItem.partProductIds.length < 2 || requestedItem.partProductIds.length > 12
        || requestedItem.partProductIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1)))) {
      return { error: 'La selección de agregados no es válida.' }
    }
    requestedAddonIds.push(...addonIds.map(Number))
  }
  const businessSlug = typeof body?.businessSlug === 'string' ? body.businessSlug : ''
  const referralCode = typeof body?.referralCode === 'string' && /^[0-9A-Z]{10}$/i.test(body.referralCode.trim())
    ? body.referralCode.trim().toUpperCase()
    : ''
  if (discountRewardId !== null && (!Number.isSafeInteger(discountRewardId) || discountRewardId < 1)
    || productRewardId !== null && (!Number.isSafeInteger(productRewardId) || productRewardId < 1)
    || (discountRewardId !== null && productRewardId !== null)
    || ((discountRewardId !== null || productRewardId !== null) && !businessSlug)) {
    return { error: 'El canje seleccionado no es válido para este pedido.' }
  }
  if (discountRewardId !== null && requestedItems.length === 0) {
    return { error: 'Agregá productos a la compra para aplicar el descuento.' }
  }
  const fulfillmentType = typeof body?.fulfillmentType === 'string' ? body.fulfillmentType : ''
  const customerFirstName = typeof body?.customerFirstName === 'string' ? body.customerFirstName.trim() : ''
  const customerLastName = typeof body?.customerLastName === 'string' ? body.customerLastName.trim() : ''
  const deliveryAddress = fulfillmentType === 'delivery' && typeof body?.deliveryAddress === 'string' ? body.deliveryAddress.trim() : ''
  const paymentMethod = typeof body?.paymentMethod === 'string' ? body.paymentMethod : ''
  const customerNotes = typeof body?.customerNotes === 'string' ? body.customerNotes.trim() : ''
  const deliveryReference = fulfillmentType === 'delivery' && typeof body?.deliveryReference === 'string' ? body.deliveryReference.trim() : ''
  const deliveryFloor = fulfillmentType === 'delivery' && typeof body?.deliveryFloor === 'string' ? body.deliveryFloor.trim() : ''
  const deliveryApartment = fulfillmentType === 'delivery' && typeof body?.deliveryApartment === 'string' ? body.deliveryApartment.trim() : ''
  const rawCashAmount = body?.cashPaymentAmount
  const cashPaymentAmount = paymentMethod === 'cash' && rawCashAmount != null && rawCashAmount !== '' ? Number(rawCashAmount) : null
  const lat = Number(body?.deliveryLat)
  const lng = Number(body?.deliveryLng)
  const hasCoordinates = fulfillmentType === 'delivery' && body?.deliveryLat != null && body?.deliveryLng != null
  if (businessSlug && (!customerFirstName || customerFirstName.length > 60 || customerLastName.length > 60
    || !['delivery', 'pickup'].includes(fulfillmentType)
    || (fulfillmentType === 'delivery' && (!deliveryAddress || deliveryAddress.length > 200))
    || deliveryReference.length > 200 || deliveryFloor.length > 20 || deliveryApartment.length > 20
    || (cashPaymentAmount !== null && (!Number.isSafeInteger(cashPaymentAmount) || cashPaymentAmount < 1 || cashPaymentAmount > 100_000_000))
    || (hasCoordinates && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180))
    || !['mercado_pago', 'cash'].includes(paymentMethod) || customerNotes.length > 300)) {
    return { error: 'Completá tu nombre, elegí delivery o retiro, la dirección si corresponde y un método de pago.' }
  }
  return {
    requestedItems, discountRewardId, productRewardId, requestedAddonIds, businessSlug, referralCode,
    fulfillmentType, customerFirstName, customerLastName, deliveryAddress, paymentMethod, customerNotes,
    deliveryReference, deliveryFloor, deliveryApartment, cashPaymentAmount, deliveryLat: hasCoordinates ? lat : null, deliveryLng: hasCoordinates ? lng : null,
  }
}
