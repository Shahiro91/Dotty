import { pool } from '../../database/pool.js'
import { adjustPoints } from '../loyalty/points.repository.js'
import { cancelOrderRedemption, lockOrder, setOrderStatus, setReferralCredited } from './partner-orders.repository.js'

export async function updatePartnerOrderStatus(businessId, orderId, nextStatus) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const order = await lockOrder(client, businessId, orderId)
    if (!order) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return 'not_found'
    }
    const invalidTransition = order.status === 'cancelled'
      || order.status === nextStatus
      || (nextStatus === 'confirmed' && order.status !== 'in_process')
      || (nextStatus === 'sent' && order.status !== 'confirmed')
    if (invalidTransition) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return 'invalid_transition'
    }
    if (nextStatus === 'cancelled') {
      await adjustPoints(
        client, order.customer_id, businessId,
        -order.points_awarded + order.discount_points_spent + order.product_reward_points_spent,
      )
      if (order.referral_credited) {
        await adjustPoints(client, order.referrer_id, businessId, -order.referral_points_awarded)
        await setReferralCredited(client, orderId, false)
      }
      if (order.discount_redemption_id) await cancelOrderRedemption(client, order.discount_redemption_id)
      if (order.product_reward_redemption_id) await cancelOrderRedemption(client, order.product_reward_redemption_id)
    }
    if (nextStatus === 'sent' && order.referrer_id && order.referral_points_awarded > 0 && !order.referral_credited) {
      await adjustPoints(client, order.referrer_id, businessId, order.referral_points_awarded)
      await setReferralCredited(client, orderId, true)
    }
    await setOrderStatus(client, orderId, nextStatus)
    await client.query('COMMIT')
    transactionStarted = false
    return 'updated'
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
