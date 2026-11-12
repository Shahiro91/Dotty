import { describeBilling } from '../billing/billing.rules.js'
import { hasDoublePointsToday, isAvailableToday } from './business.rules.js'
import { findStorefront, loadStorefrontCatalog } from './storefront.repository.js'

export async function getStorefront(slug) {
  const business = await findStorefront(slug)
  if (!business) return { error: 'not_found' }
  if (describeBilling(business).status === 'suspended') return { error: 'suspended' }
  delete business.subscriptionDueAt
  business.bonusPointsActiveToday = hasDoublePointsToday(business.plan, business.bonusPointsDays)
  const catalog = await loadStorefrontCatalog(business.id)
  catalog.rewards = catalog.rewards.map((reward) => ({ ...reward, availableToday: isAvailableToday(reward.availableDays) }))
  return { business, ...catalog }
}
