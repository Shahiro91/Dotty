export function eligibleAmount(scope, items, { productId, category }) {
  if (scope === 'total') return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  if (scope === 'category') {
    return items.filter((item) => item.category === category).reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  }
  return items.reduce((sum, item) => {
    if (item.partProducts?.length) {
      return sum + item.partProducts.filter((part) => String(part.id) === String(productId)).reduce((partSum, part) => partSum + part.price, 0) * item.quantity
    }
    return String(item.id) === String(productId) ? sum + item.unitPrice * item.quantity : sum
  }, 0)
}

export function calculateDiscount(reward, items) {
  const eligible = eligibleAmount(reward.discount_scope, items, { productId: reward.product_id, category: reward.category_name })
  const amount = reward.discount_type === 'percentage'
    ? Math.round(eligible * reward.discount_value / 100)
    : Math.min(eligible, reward.discount_value)
  return { eligible, amount }
}
