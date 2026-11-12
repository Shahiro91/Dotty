import { pool } from '../../database/pool.js'

const rewardColumns = `r.id, r.name, r.description, r.image_data_url AS "imageDataUrl",
            r.reward_type AS "rewardType", r.product_id AS "productId",
            r.discount_type AS "discountType", r.discount_value AS "discountValue",
            r.discount_scope AS "discountScope", dc.name AS "discountCategory",
            r.points_cost AS "pointsCost", r.is_available AS "isAvailable"`
const rewardJoins = 'FROM business_rewards r LEFT JOIN business_categories dc ON dc.id = r.discount_category_id'

export async function listRewards(businessId) {
  const { rows } = await pool.query(
    `SELECT ${rewardColumns} ${rewardJoins}
     WHERE r.business_id = $1 AND r.is_available = TRUE ORDER BY r.created_at DESC`,
    [businessId],
  )
  return rows
}

export async function productIsAvailable(businessId, productId) {
  const { rowCount } = await pool.query('SELECT 1 FROM business_products WHERE id = $1 AND business_id = $2 AND is_available = TRUE', [productId, businessId])
  return Boolean(rowCount)
}

export async function categoryExists(businessId, name) {
  const { rowCount } = await pool.query('SELECT 1 FROM business_categories WHERE business_id = $1 AND name = $2', [businessId, name])
  return Boolean(rowCount)
}

export async function insertReward(businessId, reward) {
  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO business_rewards (business_id, name, description, image_data_url, reward_type, product_id, discount_type, discount_value, points_cost, discount_scope, discount_category_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, (SELECT id FROM business_categories WHERE business_id = $1 AND name = $11))
       RETURNING *
     )
     SELECT ${rewardColumns} FROM inserted r LEFT JOIN business_categories dc ON dc.id = r.discount_category_id`,
    [businessId, reward.name, reward.description, reward.imageDataUrl, reward.rewardType, reward.productId, reward.discountType, reward.discountValue, reward.pointsCost, reward.discountScope, reward.discountCategory],
  )
  return rows[0]
}

export async function updateReward(businessId, rewardId, reward) {
  const { rows } = await pool.query(
    `WITH updated AS (
       UPDATE business_rewards SET name = $1, description = $2, image_data_url = $3,
         reward_type = $4, product_id = $5, discount_type = $6, discount_value = $7, points_cost = $8,
         discount_scope = $11, discount_category_id = (SELECT id FROM business_categories WHERE business_id = $10 AND name = $12)
       WHERE id = $9 AND business_id = $10
       RETURNING *
     )
     SELECT ${rewardColumns} FROM updated r LEFT JOIN business_categories dc ON dc.id = r.discount_category_id`,
    [reward.name, reward.description, reward.imageDataUrl, reward.rewardType, reward.productId, reward.discountType, reward.discountValue, reward.pointsCost, rewardId, businessId, reward.discountScope, reward.discountCategory],
  )
  return rows[0]
}

export async function disableReward(businessId, rewardId) {
  const { rowCount } = await pool.query(
    'UPDATE business_rewards SET is_available = FALSE WHERE id = $1 AND business_id = $2',
    [rewardId, businessId],
  )
  return rowCount
}
