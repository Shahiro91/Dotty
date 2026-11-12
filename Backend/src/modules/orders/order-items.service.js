export function buildOrderItems({ requestedItems, productById, addonById, businessId, requiredTwoGroupsByProduct, mustChooseGroupsByScope }) {
  const items = []
  for (const requestedItem of requestedItems) {
    const product = productById.get(businessId ? String(requestedItem?.id) : requestedItem?.id)
    const quantity = requestedItem?.quantity
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return { error: 'Hay productos o cantidades inválidas en el pedido.' }
    }
    const partProductIds = requestedItem.partProductIds
    let partProducts = []
    if (Number(product.fractionalParts || 0) > 0) {
      if (!Array.isArray(partProductIds) || partProductIds.length !== Number(product.fractionalParts)) {
        return { error: `Elegí exactamente ${product.fractionalParts} partes para armar este producto.` }
      }
      partProducts = partProductIds.map((id) => productById.get(String(id)))
      if (partProducts.some((part) => !part || String(part.categoryId) !== String(product.categoryId))
        || String(partProducts[0]?.id) !== String(product.id)) {
        return { error: 'Las partes deben ser productos disponibles de la misma categoría.' }
      }
    } else if (partProductIds != null) {
      return { error: 'Esta categoría vende productos por separado.' }
    }
    const selectedAddons = (requestedItem.addonIds || []).map((id) => addonById.get(String(id)))
    if (selectedAddons.some((addon) => !addon || addon.category !== product.category
      || (addon.productId !== null && String(addon.productId) !== String(product.id)))) {
      return { error: 'Los agregados deben corresponder a la categoría del producto.' }
    }
    const selectedSingleGroups = new Set()
    for (const addon of selectedAddons) {
      if (addon.selectionMode !== 'single') continue
      const groupKey = `${addon.productId ?? 'category'}:${addon.groupName.toLocaleLowerCase('es')}`
      if (selectedSingleGroups.has(groupKey)) return { error: 'ElegÃ­ una sola opciÃ³n por grupo.' }
      selectedSingleGroups.add(groupKey)
    }
    const requiredGroups = businessId && Number(product.fractionalParts || 0) === 0
      ? [...(requiredTwoGroupsByProduct.get(`category:${product.categoryId}`) || []), ...(requiredTwoGroupsByProduct.get(`product:${product.id}`) || [])]
      : []
    for (const group of requiredGroups) {
      const selectedCount = selectedAddons.filter((addon) => addon.requiredTwo === true
        && (group.productId == null ? addon.productId == null : String(addon.productId) === String(group.productId))
        && addon.groupName.toLocaleLowerCase('es') === group.groupName).length
      if (selectedCount !== 2) return { error: 'Elegí exactamente dos opciones para este producto.' }
    }
    const mustChooseGroups = businessId
      ? [...(mustChooseGroupsByScope.get(`category:${product.categoryId}`) || []), ...(Number(product.fractionalParts || 0) === 0 ? mustChooseGroupsByScope.get(`product:${product.id}`) || [] : [])]
      : []
    for (const group of mustChooseGroups) {
      const chosen = selectedAddons.some((addon) => addon.groupName.toLocaleLowerCase('es') === group.groupName
        && (group.productId == null ? addon.productId == null : String(addon.productId) === String(group.productId)))
      if (!chosen) return { error: `Elegí una opción en "${group.label}" para ${product.name}.` }
    }
    const addonTotal = selectedAddons.reduce((sum, addon) => sum + addon.price, 0)
    const partsPrice = partProducts.length ? partProducts.reduce((sum, part) => sum + part.price, 0) : product.price
    const partsPoints = partProducts.length ? partProducts.reduce((sum, part) => sum + (part.pointsPerUnit || 0), 0) : (product.pointsPerUnit || 0)
    items.push({
      id: product.id,
      name: partProducts.length ? `${product.category}: ${partProducts.map((part) => part.name).join(' + ')}` : product.name,
      category: product.category,
      quantity,
      unitPrice: partsPrice + addonTotal,
      baseUnitPrice: partsPrice,
      ...(partProducts.length ? { partProducts: partProducts.map(({ id, name, price }) => ({ id, name, price })) } : {}),
      addOns: selectedAddons.map(({ id, name, price, groupName, productId }) => ({ id, name, price, groupName, productId })),
      pointsPerUnit: partsPoints,
    })
  }

  return { items }
}
