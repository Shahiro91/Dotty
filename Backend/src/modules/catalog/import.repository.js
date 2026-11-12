export async function listCategoryNames(client, businessId) {
  const { rows } = await client.query('SELECT name FROM business_categories WHERE business_id = $1', [businessId])
  return rows.map((row) => row.name)
}

export async function insertCategory(client, businessId, name) {
  const result = await client.query(
    'INSERT INTO business_categories (business_id, name) VALUES ($1, $2) ON CONFLICT (business_id, name) DO NOTHING',
    [businessId, name],
  )
  return result.rowCount
}

export async function findProduct(client, businessId, name, category) {
  const { rows } = await client.query(
    `SELECT id FROM business_products WHERE business_id = $1 AND lower(name) = lower($2)
     AND lower(category) = lower($3) ORDER BY is_available DESC, id LIMIT 1 FOR UPDATE`,
    [businessId, name, category],
  )
  return rows[0]
}

export async function saveProduct(client, businessId, product) {
  const existing = await findProduct(client, businessId, product.name, product.category)
  if (existing) {
    await client.query(
      `UPDATE business_products SET description = $1, price = $2, points_per_unit = $3,
       is_available = TRUE WHERE id = $4`,
      [product.description, product.price, product.pointsPerUnit, existing.id],
    )
    return false
  }
  await client.query(
    `INSERT INTO business_products (business_id, name, description, category, price, points_per_unit)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [businessId, product.name, product.description, product.category, product.price, product.pointsPerUnit],
  )
  return true
}

export async function findAvailableProduct(client, businessId, name, category) {
  const { rows } = await client.query(
    `SELECT id FROM business_products WHERE business_id = $1 AND is_available = TRUE
     AND lower(name) = lower($2) AND lower(category) = lower($3) ORDER BY id LIMIT 1 FOR UPDATE`,
    [businessId, name, category],
  )
  return rows[0]
}

export async function saveReward(client, businessId, reward, productId) {
  const { rows } = await client.query(
    'SELECT id FROM business_rewards WHERE business_id = $1 AND lower(name) = lower($2) ORDER BY is_available DESC, id LIMIT 1 FOR UPDATE',
    [businessId, reward.name],
  )
  if (rows[0]) {
    await client.query(
      `UPDATE business_rewards SET description = $1, points_cost = $2, reward_type = $3,
       product_id = $4, discount_type = $5, discount_value = $6, is_available = TRUE WHERE id = $7`,
      [reward.description, reward.pointsCost, reward.rewardType, productId, reward.discountType, reward.discountValue, rows[0].id],
    )
    return false
  }
  await client.query(
    `INSERT INTO business_rewards (business_id, name, description, reward_type, product_id, discount_type, discount_value, points_cost)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [businessId, reward.name, reward.description, reward.rewardType, productId, reward.discountType, reward.discountValue, reward.pointsCost],
  )
  return true
}
