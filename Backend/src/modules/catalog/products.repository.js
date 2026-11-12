import { pool } from '../../database/pool.js'

export async function listProducts(businessId) {
  const { rows } = await pool.query(
    `SELECT id, name, description, category, price,
            points_per_unit AS "pointsPerUnit", image_data_url AS "imageDataUrl",
            image_scale AS "imageScale",
            image_position_x AS "imagePositionX", image_position_y AS "imagePositionY",
            is_available AS "isAvailable"
     FROM business_products WHERE business_id = $1 ORDER BY created_at DESC`,
    [businessId],
  )
  return rows
}

export async function categoryExists(businessId, category) {
  const result = await pool.query(
    'SELECT 1 FROM business_categories WHERE business_id = $1 AND name = $2',
    [businessId, category],
  )
  return Boolean(result.rowCount)
}

export async function createProduct(businessId, product) {
  const { rows } = await pool.query(
    `INSERT INTO business_products (business_id, name, description, category, price, points_per_unit, image_data_url, image_scale, image_position_x, image_position_y)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING id, name, description, category, price, points_per_unit AS "pointsPerUnit",
           image_data_url AS "imageDataUrl", image_scale AS "imageScale",
           image_position_x AS "imagePositionX", image_position_y AS "imagePositionY",
           is_available AS "isAvailable"`,
    [businessId, product.name, product.description, product.category, product.price, product.pointsPerUnit, product.imageDataUrl, product.imageScale, product.imagePositionX, product.imagePositionY],
  )
  return rows[0]
}

export async function updateProduct(businessId, productId, product) {
  const { rows } = await pool.query(
    `UPDATE business_products SET name = $1, description = $2, category = $3,
       price = $4, points_per_unit = $5, image_data_url = $6, image_scale = $7,
       image_position_x = $8, image_position_y = $9
     WHERE id = $10 AND business_id = $11
     RETURNING id, name, description, category, price, points_per_unit AS "pointsPerUnit",
               image_data_url AS "imageDataUrl", image_scale AS "imageScale",
               image_position_x AS "imagePositionX", image_position_y AS "imagePositionY",
               is_available AS "isAvailable"`,
    [product.name, product.description, product.category, product.price, product.pointsPerUnit, product.imageDataUrl, product.imageScale, product.imagePositionX, product.imagePositionY, productId, businessId],
  )
  if (!rows[0]) return null
  const { rows: categoryRows } = await pool.query('SELECT id FROM business_categories WHERE business_id = $1 AND name = $2', [businessId, product.category])
  await pool.query('UPDATE business_category_addons SET category_id = $1 WHERE business_id = $2 AND product_id = $3', [categoryRows[0].id, businessId, productId])
  return rows[0]
}

export async function setAvailability(businessId, productId, isAvailable) {
  const { rows } = await pool.query(
    `UPDATE business_products SET is_available = $1 WHERE id = $2 AND business_id = $3
     RETURNING id, name, description, category, price, points_per_unit AS "pointsPerUnit",
               image_data_url AS "imageDataUrl", image_scale AS "imageScale",
               image_position_x AS "imagePositionX", image_position_y AS "imagePositionY",
               is_available AS "isAvailable"`,
    [isAvailable, productId, businessId],
  )
  return rows[0]
}

export async function hasLinkedRewards(businessId, productId) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM business_rewards WHERE product_id = $1 AND business_id = $2 AND is_available = TRUE LIMIT 1',
    [productId, businessId],
  )
  return Boolean(rowCount)
}

export async function archiveProduct(businessId, productId) {
  const { rowCount } = await pool.query(
    'UPDATE business_products SET is_available = FALSE WHERE id = $1 AND business_id = $2',
    [productId, businessId],
  )
  return rowCount
}
