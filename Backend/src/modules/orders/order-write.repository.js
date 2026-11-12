export async function lockOrderCustomer(client, customerId) {
  const { rows } = await client.query('SELECT role FROM customers WHERE id = $1 FOR UPDATE', [customerId])
  return rows[0]
}

export async function lockDiscountReward(client, rewardId, businessId) {
  const { rows } = await client.query(
    `SELECT r.id, r.name, r.points_cost, r.discount_type, r.discount_value, r.discount_scope, r.product_id,
            c.name AS category_name
     FROM business_rewards r LEFT JOIN business_categories c ON c.id = r.discount_category_id
     WHERE r.id = $1 AND r.business_id = $2 AND r.reward_type = 'discount' AND r.is_available = TRUE FOR UPDATE OF r`,
    [rewardId, businessId],
  )
  return rows[0]
}

export async function lockProductReward(client, rewardId, businessId) {
  const { rows } = await client.query(
    `SELECT r.id, r.name, r.points_cost, p.id AS product_id, p.name AS product_name,
            p.category, p.image_data_url AS "imageDataUrl"
     FROM business_rewards r
     JOIN business_products p ON p.id = r.product_id AND p.business_id = r.business_id AND p.is_available = TRUE
     WHERE r.id = $1 AND r.business_id = $2 AND r.reward_type = 'product' AND r.is_available = TRUE
     FOR UPDATE OF r, p`,
    [rewardId, businessId],
  )
  return rows[0]
}

export async function insertFulfilledRedemption(client, businessId, customerId, reward) {
  const { rows } = await client.query(
    `INSERT INTO business_redemptions (business_id, customer_id, reward_id, points_spent, status)
     VALUES ($1, $2, $3, $4, 'fulfilled') RETURNING id`,
    [businessId, customerId, reward.id, reward.points_cost],
  )
  return rows[0].id
}

export async function findEligibleReferrer(client, referralCode, customerId) {
  const { rows } = await client.query(
    "SELECT id FROM customers WHERE referral_code = $1 AND role = 'customer' AND id <> $2",
    [referralCode, customerId],
  )
  return rows[0]
}

export async function hasPreviousOrder(client, customerId, businessId) {
  const { rowCount } = await client.query(
    "SELECT 1 FROM customer_orders WHERE customer_id = $1 AND business_id = $2 AND status <> 'cancelled' LIMIT 1",
    [customerId, businessId],
  )
  return Boolean(rowCount)
}

export async function insertOrder(client, order) {
  const { rows } = await client.query(
    `INSERT INTO customer_orders (
       customer_id, business_id, total, subtotal, discount_amount, discount_name,
       discount_points_spent, discount_redemption_id, product_reward_name,
       product_reward_points_spent, product_reward_redemption_id, points_awarded, items,
       delivery_address, payment_method, customer_notes, fulfillment_type,
       public_code, delivery_reference, cash_payment_amount, delivery_lat, delivery_lng,
       referrer_id, referral_points_awarded, customer_first_name, customer_last_name, delivery_floor, delivery_apartment
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
     RETURNING id, total, subtotal, discount_amount AS "discountAmount", points_awarded, items, created_at AS "createdAt"`,
    [order.customerId, order.businessId, order.total, order.subtotal, order.discountAmount, order.discountName,
      order.discountPointsSpent, order.discountRedemptionId, order.productRewardName, order.productRewardPointsSpent,
      order.productRewardRedemptionId, order.pointsAwarded, JSON.stringify(order.items), order.deliveryAddress, order.paymentMethod,
      order.customerNotes, order.fulfillmentType, order.publicCode, order.deliveryReference, order.cashPaymentAmount,
      order.deliveryLat, order.deliveryLng, order.referrerId, order.referralPointsAwarded, order.customerFirstName, order.customerLastName, order.deliveryFloor, order.deliveryApartment],
  )
  return rows[0]
}

export async function findOrderCustomer(client, customerId) {
  const { rows } = await client.query(
    'SELECT id, first_name, last_name, phone, role, business_name, business_id FROM customers WHERE id = $1',
    [customerId],
  )
  return rows[0]
}
