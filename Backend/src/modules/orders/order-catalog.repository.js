import { pool } from '../../database/pool.js'

export async function findOrderingBusiness(slug) {
  const { rows } = await pool.query(
    'SELECT id, plan, whatsapp, delivery_enabled AS "deliveryEnabled", addons_enabled AS "addonsEnabled", bonus_points_days AS "bonusPointsDays", referral_enabled AS "referralEnabled", referral_points AS "referralPoints" FROM businesses WHERE slug = $1',
    [slug],
  )
  return rows[0]
}

export async function listOrderingProducts(businessId) {
  const { rows } = await pool.query(
    `SELECT p.id, p.name, p.description, p.category, c.id AS "categoryId", c.fractional_parts AS "fractionalParts", p.price, p.points_per_unit AS "pointsPerUnit"
     FROM business_products p JOIN business_categories c ON c.business_id = p.business_id AND c.name = p.category
     WHERE p.business_id = $1 AND p.is_available = TRUE`,
    [businessId],
  )
  return rows
}

export async function listRequiredTwoGroups(businessId, addonsEnabled) {
  const { rows } = await pool.query(
    `SELECT category_id AS "categoryId", product_id AS "productId", lower(group_name) AS "groupName"
     FROM business_category_addons WHERE business_id = $1 AND $2 = TRUE AND is_available = TRUE AND required_two = TRUE
     GROUP BY category_id, product_id, lower(group_name)`,
    [businessId, addonsEnabled],
  )
  return rows
}

export async function listMandatoryGroups(businessId, addonsEnabled) {
  const { rows } = await pool.query(
    `SELECT category_id AS "categoryId", product_id AS "productId", lower(group_name) AS "groupName", MIN(group_name) AS "label"
     FROM business_category_addons WHERE business_id = $1 AND $2 = TRUE AND is_available = TRUE AND is_required = TRUE
     GROUP BY category_id, product_id, lower(group_name)`,
    [businessId, addonsEnabled],
  )
  return rows
}

export async function listOrderingAddons(businessId, addonIds) {
  const { rows } = await pool.query(
    `SELECT a.id, a.name, a.price, a.group_name AS "groupName",
            a.selection_mode AS "selectionMode", a.product_id AS "productId",
            a.required_two AS "requiredTwo", c.name AS category
     FROM business_category_addons a JOIN business_categories c ON c.id = a.category_id
     WHERE a.business_id = $1 AND a.is_available = TRUE AND a.id = ANY($2::bigint[])`,
    [businessId, addonIds],
  )
  return rows
}
