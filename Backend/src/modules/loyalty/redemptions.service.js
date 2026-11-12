import { pool } from '../../database/pool.js'
import { isBusinessSuspended } from '../../middleware/authorize.js'
import { isAvailableToday } from '../businesses/business.rules.js'
import { adjustPoints, lockPoints } from './points.repository.js'
import { findBusinessId, insertRedemption, lockAvailableReward, lockCustomerRole, lockRedemption, setRedemptionStatus } from './redemptions.repository.js'

export async function redeemReward(customerId, slug, rewardId) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    let error
    const role = await lockCustomerRole(client, customerId)
    if (role !== 'customer') error = 'invalid_role'
    const businessId = !error ? await findBusinessId(client, slug) : null
    if (!error && !businessId) error = 'business_not_found'
    if (!error && await isBusinessSuspended(client, businessId)) error = 'business_suspended'
    const currentPoints = !error ? await lockPoints(client, customerId, businessId) : 0
    const reward = !error ? await lockAvailableReward(client, businessId, rewardId) : null
    if (!error && !reward) error = 'reward_not_found'
    if (!error && (reward.reward_type === 'discount' || reward.product_id)) error = 'requires_order'
    if (!error && !isAvailableToday(reward.available_days)) error = 'unavailable_today'
    if (!error && currentPoints < reward.points_cost) error = 'insufficient_points'
    if (error) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return { error }
    }
    const points = await adjustPoints(client, customerId, businessId, -reward.points_cost)
    const redemption = await insertRedemption(client, businessId, customerId, reward)
    await client.query('COMMIT')
    transactionStarted = false
    return { redemption: { id: redemption.id, status: redemption.status, rewardName: reward.name }, points }
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function resolveRedemption(businessId, redemptionId, nextStatus) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const redemption = await lockRedemption(client, businessId, redemptionId)
    if (!redemption) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return { error: 'not_found' }
    }
    if (redemption.status !== 'requested') {
      await client.query('ROLLBACK')
      transactionStarted = false
      return { error: 'already_resolved' }
    }
    if (nextStatus === 'cancelled') {
      await adjustPoints(client, redemption.customer_id, businessId, redemption.points_spent)
    }
    const updated = await setRedemptionStatus(client, redemptionId, nextStatus)
    await client.query('COMMIT')
    transactionStarted = false
    return { redemption: updated }
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
