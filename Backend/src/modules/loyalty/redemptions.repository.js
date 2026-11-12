import { pool } from '../../database/pool.js'

export async function listRedemptions(businessId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.points_spent AS "pointsSpent", r.status,
            r.created_at AS "createdAt", c.first_name AS "firstName",
            c.last_name AS "lastName", c.phone, w.name AS "rewardName"
     FROM business_redemptions r
     JOIN customers c ON c.id = r.customer_id
     JOIN business_rewards w ON w.id = r.reward_id
     WHERE r.business_id = $1 ORDER BY r.created_at DESC LIMIT 300`,
    [businessId],
  )
  return rows
}

export async function lockRedemption(client, businessId, redemptionId) {
  const { rows } = await client.query(
    'SELECT customer_id, points_spent, status FROM business_redemptions WHERE id = $1 AND business_id = $2 FOR UPDATE',
    [redemptionId, businessId],
  )
  return rows[0]
}

export async function setRedemptionStatus(client, redemptionId, status) {
  const { rows } = await client.query(
    `UPDATE business_redemptions SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, points_spent AS "pointsSpent", status`,
    [status, redemptionId],
  )
  return rows[0]
}

export async function lockCustomerRole(client, customerId) {
  const { rows } = await client.query('SELECT role FROM customers WHERE id = $1 FOR UPDATE', [customerId])
  return rows[0]?.role
}

export async function findBusinessId(client, slug) {
  const { rows } = await client.query('SELECT id FROM businesses WHERE slug = $1', [slug])
  return rows[0]?.id
}

export async function lockAvailableReward(client, businessId, rewardId) {
  const { rows } = await client.query(
    `SELECT id, name, points_cost, reward_type, product_id, available_days FROM business_rewards
     WHERE id = $1 AND business_id = $2 AND is_available = TRUE FOR UPDATE`,
    [rewardId, businessId],
  )
  return rows[0]
}

export async function insertRedemption(client, businessId, customerId, reward) {
  const { rows } = await client.query(
    `INSERT INTO business_redemptions (business_id, customer_id, reward_id, points_spent)
     VALUES ($1, $2, $3, $4) RETURNING id, status`,
    [businessId, customerId, reward.id, reward.points_cost],
  )
  return rows[0]
}
