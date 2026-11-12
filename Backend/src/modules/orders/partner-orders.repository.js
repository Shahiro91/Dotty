import { pool } from '../../database/pool.js'

export async function listPartnerOrders(businessId) {
  const { rows } = await pool.query(
    `SELECT o.id, o.total, o.subtotal, o.discount_amount AS "discountAmount",
            o.discount_name AS "discountName", o.discount_points_spent AS "discountPointsSpent",
            o.product_reward_name AS "productRewardName",
            o.product_reward_points_spent AS "productRewardPointsSpent",
            o.delivery_address AS "deliveryAddress", o.fulfillment_type AS "fulfillmentType", o.payment_method AS "paymentMethod",
            o.customer_notes AS "customerNotes", o.public_code AS "publicCode",
            o.delivery_reference AS "deliveryReference", o.delivery_floor AS "deliveryFloor", o.delivery_apartment AS "deliveryApartment",
            o.cash_payment_amount AS "cashPaymentAmount",
            o.delivery_lat AS "deliveryLat", o.delivery_lng AS "deliveryLng",
            o.points_awarded AS "pointsAwarded", o.items, o.status,
            o.created_at AS "createdAt", COALESCE(NULLIF(o.customer_first_name, ''), c.first_name) AS "firstName",
            COALESCE(NULLIF(o.customer_last_name, ''), c.last_name) AS "lastName", c.phone
     FROM customer_orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.business_id = $1 ORDER BY o.created_at DESC LIMIT 500`,
    [businessId],
  )
  const { rows: shifts } = await pool.query('SELECT orders_shift_started_at AS "shiftStartedAt" FROM businesses WHERE id = $1', [businessId])
  return { orders: rows, shiftStartedAt: shifts[0]?.shiftStartedAt || null }
}

export async function startOrderShift(businessId) {
  const { rows } = await pool.query(
    'UPDATE businesses SET orders_shift_started_at = NOW() WHERE id = $1 RETURNING orders_shift_started_at AS "shiftStartedAt"',
    [businessId],
  )
  return rows[0].shiftStartedAt
}

export async function lockOrder(client, businessId, orderId) {
  const { rows } = await client.query(
    `SELECT customer_id, points_awarded, status, discount_points_spent, discount_redemption_id,
            product_reward_points_spent, product_reward_redemption_id, referrer_id, referral_points_awarded, referral_credited
     FROM customer_orders WHERE id = $1 AND business_id = $2 FOR UPDATE`,
    [orderId, businessId],
  )
  return rows[0]
}

export async function setReferralCredited(client, orderId, credited) {
  await client.query('UPDATE customer_orders SET referral_credited = $1 WHERE id = $2', [credited, orderId])
}

export async function cancelOrderRedemption(client, redemptionId) {
  await client.query(
    "UPDATE business_redemptions SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
    [redemptionId],
  )
}

export async function setOrderStatus(client, orderId, status) {
  await client.query('UPDATE customer_orders SET status = $1, status_changed_at = NOW() WHERE id = $2', [status, orderId])
}
