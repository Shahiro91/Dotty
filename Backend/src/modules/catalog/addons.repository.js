import { pool } from '../../database/pool.js'

export async function listAddons(businessId) {
  const { rows } = await pool.query(
    `SELECT a.id, c.name AS category, a.name, a.price,
            a.group_name AS "groupName", a.selection_mode AS "selectionMode",
            a.product_id AS "productId", a.required_two AS "requiredTwo", a.is_required AS "isRequired", p.name AS "productName"
     FROM business_category_addons a JOIN business_categories c ON c.id = a.category_id
     LEFT JOIN business_products p ON p.id = a.product_id AND p.business_id = a.business_id
     WHERE a.business_id = $1 AND a.is_available = TRUE ORDER BY c.name, a.id`,
    [businessId],
  )
  return rows
}

export async function findCategory(businessId, name) {
  const { rows } = await pool.query('SELECT id FROM business_categories WHERE business_id = $1 AND name = $2', [businessId, name])
  return rows[0]
}

export async function isAvailableProduct(businessId, productId, categoryName) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM business_products WHERE id = $1 AND business_id = $2 AND category = $3 AND is_available = TRUE',
    [productId, businessId, categoryName],
  )
  return Boolean(rowCount)
}

export async function findAddonGroup(categoryId, groupName, productId) {
  const { rows } = await pool.query(
    'SELECT selection_mode, required_two, is_required FROM business_category_addons WHERE category_id = $1 AND product_id IS NOT DISTINCT FROM $3 AND lower(group_name) = lower($2) AND is_available = TRUE LIMIT 1',
    [categoryId, groupName, productId],
  )
  return rows[0]
}

export async function insertAddon(businessId, categoryId, input, isRequired) {
  const { rows } = await pool.query(
    `INSERT INTO business_category_addons (business_id, category_id, product_id, name, price, group_name, selection_mode, required_two, is_required)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, name, price, group_name AS "groupName", selection_mode AS "selectionMode", product_id AS "productId", required_two AS "requiredTwo", is_required AS "isRequired"`,
    [businessId, categoryId, input.productId, input.name, input.price, input.groupName, input.selectionMode, input.requiredTwo, isRequired],
  )
  return rows[0]
}

export async function findCurrentAddon(businessId, addonId) {
  const { rows } = await pool.query(
    `SELECT category_id AS "categoryId", product_id AS "productId", group_name AS "groupName",
            selection_mode AS "selectionMode", required_two AS "requiredTwo"
     FROM business_category_addons WHERE id = $1 AND business_id = $2 AND is_available = TRUE`,
    [addonId, businessId],
  )
  return rows[0]
}

export async function productInCategory(businessId, productId, categoryId) {
  const { rowCount } = await pool.query(
    `SELECT 1 FROM business_products p JOIN business_categories c ON c.business_id = p.business_id AND c.name = p.category
     WHERE p.id = $1 AND p.business_id = $2 AND c.id = $3 AND p.is_available = TRUE`,
    [productId, businessId, categoryId],
  )
  return Boolean(rowCount)
}

export async function hasConflictingGroup(categoryId, addonId, input, sameGroup) {
  const { rows } = await pool.query(
    `SELECT 1 FROM business_category_addons
     WHERE category_id = $1 AND product_id IS NOT DISTINCT FROM $2 AND lower(group_name) = lower($3)
       AND id <> $4 AND is_available = TRUE
       AND (selection_mode <> $5 OR (required_two <> $6 AND $7 = FALSE)) LIMIT 1`,
    [categoryId, input.productId, input.groupName, addonId, input.selectionMode, input.requiredTwo, sameGroup],
  )
  return Boolean(rows[0])
}

export async function updateAddon(businessId, addonId, input) {
  const { rows } = await pool.query(
    `UPDATE business_category_addons SET name = $1, price = $2, group_name = $3, selection_mode = $4,
       product_id = $5, required_two = $6
     WHERE id = $7 AND business_id = $8 AND is_available = TRUE
     RETURNING id, name, price, group_name AS "groupName", selection_mode AS "selectionMode",
               product_id AS "productId", required_two AS "requiredTwo", category_id`,
    [input.name, input.price, input.groupName, input.selectionMode, input.productId, input.requiredTwo, addonId, businessId],
  )
  return rows[0]
}

export async function setGroupRequiredTwo(businessId, categoryId, input) {
  await pool.query(
    `UPDATE business_category_addons SET required_two = $1
     WHERE business_id = $2 AND category_id = $3 AND product_id IS NOT DISTINCT FROM $4
       AND lower(group_name) = lower($5) AND is_available = TRUE`,
    [input.requiredTwo, businessId, categoryId, input.productId, input.groupName],
  )
}

export async function listGroup(queryable, businessId, categoryId, productId, groupName, ordered = false) {
  const { rows } = await queryable.query(
    `SELECT a.id, c.name AS category, a.name, a.price, a.group_name AS "groupName",
            a.selection_mode AS "selectionMode", a.product_id AS "productId",
            a.required_two AS "requiredTwo", a.is_required AS "isRequired", p.name AS "productName"
     FROM business_category_addons a JOIN business_categories c ON c.id = a.category_id
     LEFT JOIN business_products p ON p.id = a.product_id AND p.business_id = a.business_id
     WHERE a.business_id = $1 AND a.category_id = $2 AND a.product_id IS NOT DISTINCT FROM $3
       AND lower(a.group_name) = lower($4) AND a.is_available = TRUE${ordered ? ' ORDER BY a.id' : ''}`,
    [businessId, categoryId, productId, groupName],
  )
  return rows
}

export async function lockCategory(queryable, businessId, name) {
  const { rows } = await queryable.query('SELECT id FROM business_categories WHERE business_id = $1 AND name = $2', [businessId, name])
  return rows[0]
}

export async function lockGroup(client, businessId, categoryId, key) {
  const { rows } = await client.query(
    `SELECT required_two AS "requiredTwo" FROM business_category_addons
     WHERE business_id = $1 AND category_id = $2 AND product_id IS NOT DISTINCT FROM $3 AND lower(group_name) = lower($4) AND is_available = TRUE FOR UPDATE`,
    [businessId, categoryId, key.productId, key.groupName],
  )
  return rows
}

export async function groupExists(client, businessId, categoryId, key) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM business_category_addons
     WHERE business_id = $1 AND category_id = $2 AND product_id IS NOT DISTINCT FROM $3 AND lower(group_name) = lower($4) AND is_available = TRUE`,
    [businessId, categoryId, key.productId, key.groupName],
  )
  return Boolean(rowCount)
}

export async function availableProductInCategory(client, businessId, productId, categoryName) {
  const { rowCount } = await client.query('SELECT 1 FROM business_products WHERE id = $1 AND business_id = $2 AND category = $3 AND is_available = TRUE', [productId, businessId, categoryName])
  return Boolean(rowCount)
}

export async function updateGroup(client, businessId, categoryId, current, next, selectionMode, isRequired, clearRequiredTwo) {
  await client.query(
    `UPDATE business_category_addons SET group_name = $1, product_id = $2, selection_mode = $3, is_required = $4,
       required_two = required_two AND NOT $5
     WHERE business_id = $6 AND category_id = $7 AND product_id IS NOT DISTINCT FROM $8 AND lower(group_name) = lower($9) AND is_available = TRUE`,
    [next.groupName, next.productId, selectionMode, isRequired, clearRequiredTwo, businessId, categoryId, current.productId, current.groupName],
  )
}

export async function disableGroup(businessId, categoryName, key) {
  await pool.query(
    `UPDATE business_category_addons SET is_available = FALSE
     WHERE business_id = $1 AND category_id = (SELECT id FROM business_categories WHERE business_id = $1 AND name = $2)
       AND product_id IS NOT DISTINCT FROM $3 AND lower(group_name) = lower($4) AND is_available = TRUE`,
    [businessId, categoryName, key.productId, key.groupName],
  )
}

export async function findAddonForDeletion(businessId, addonId) {
  const { rows } = await pool.query(
    `SELECT category_id AS "categoryId", product_id AS "productId", group_name AS "groupName", required_two AS "requiredTwo"
     FROM business_category_addons WHERE id = $1 AND business_id = $2 AND is_available = TRUE`,
    [addonId, businessId],
  )
  return rows[0]
}

export async function countGroup(businessId, addon) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM business_category_addons
     WHERE business_id = $1 AND category_id = $2 AND product_id IS NOT DISTINCT FROM $3
       AND lower(group_name) = lower($4) AND is_available = TRUE`,
    [businessId, addon.categoryId, addon.productId, addon.groupName],
  )
  return rows[0].count
}

export async function disableAddon(businessId, addonId) {
  await pool.query('UPDATE business_category_addons SET is_available = FALSE WHERE id = $1 AND business_id = $2', [addonId, businessId])
}
