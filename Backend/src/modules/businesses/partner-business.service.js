import { randomBytes } from 'node:crypto'
import { loadBilling } from '../billing/billing.service.js'
import { hasDoublePointsToday } from './business.rules.js'
import { assignReferralCode, getOverview, listVideos } from './partner-business.repository.js'

export async function loadOverview(businessId) {
  const business = await getOverview(businessId)
  if (!business) return null
  business.promoVideos = await listVideos(businessId)
  const billing = await loadBilling(businessId)
  delete business.subscriptionDueAt
  business.bonusPointsActiveToday = hasDoublePointsToday(business.plan, business.bonusPointsDays)
  return { business, billing }
}

export async function createReferralCode(customerId) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const code = await assignReferralCode(customerId, randomBytes(5).toString('hex').toUpperCase())
      if (code) return code
    } catch (error) {
      if (error.code !== '23505') throw error
    }
  }
  return null
}
