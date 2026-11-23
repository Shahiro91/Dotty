import { pool } from '../../database/pool.js'

export async function listCategories(businessId) {
  const { rows } = await pool.query(
    `SELECT categories.name, categories.fractional_parts AS "fractionalParts", COUNT(products.id)::int AS "productCount"
     FROM business_categories AS categories
     LEFT JOIN business_products AS products
       ON products.business_id = categories.business_id
       AND products.category = categories.name AND products.is_available = TRUE
     WHERE categories.business_id = $1
     GROUP BY categories.id
     ORDER BY categories.sort_order ASC NULLS LAST, categories.name`,
    [businessId],
  )
  return rows
}

export async function reorderCategories(businessId, names) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows } = await client.query(
      'SELECT name FROM business_categories WHERE business_id = $1 ORDER BY id FOR UPDATE',
      [businessId],
    )
    const existing = new Set(rows.map((row) => row.name))
    if (existing.size !== names.length || names.some((name) => !existing.has(name))) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return false
    }
    await client.query(
      `UPDATE business_categories AS categories SET sort_order = ordering.position::integer
       FROM unnest($2::text[]) WITH ORDINALITY AS ordering(name, position)
       WHERE categories.business_id = $1 AND categories.name = ordering.name`,
      [businessId, names],
    )
    await client.query('COMMIT')
    transactionStarted = false
    return true
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function insertCategory(businessId, name, fractionalParts) {
  const { rows } = await pool.query(
    'INSERT INTO business_categories (business_id, name, fractional_parts) VALUES ($1, $2, $3) RETURNING name, fractional_parts AS "fractionalParts"',
    [businessId, name, fractionalParts],
  )
  return rows[0]
}

export async function renameCategory(businessId, currentName, name, fractionalParts) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows } = await client.query(
      'SELECT id, fractional_parts AS "fractionalParts" FROM business_categories WHERE business_id = $1 AND name = $2 FOR UPDATE',
      [businessId, currentName],
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return null
    }
    await client.query('UPDATE business_categories SET name = $1, fractional_parts = COALESCE($2, fractional_parts) WHERE id = $3', [name, fractionalParts, rows[0].id])
    if (currentName !== name) {
      await client.query(
        'UPDATE business_products SET category = $1 WHERE business_id = $2 AND category = $3',
        [name, businessId, currentName],
      )
    }
    await client.query('COMMIT')
    transactionStarted = false
    return { name, fractionalParts: fractionalParts ?? rows[0].fractionalParts }
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export async function deleteCategory(businessId, name, fallbackCategory) {
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows: categories } = await client.query(
      'SELECT id FROM business_categories WHERE business_id = $1 AND name = $2 FOR UPDATE',
      [businessId, name],
    )
    if (!categories[0]) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return null
    }
    const { rowCount } = await client.query(
      'UPDATE business_products SET category = $1 WHERE business_id = $2 AND category = $3 AND is_available = TRUE',
      [fallbackCategory, businessId, name],
    )
    if (rowCount > 0) {
      await client.query(
        'INSERT INTO business_categories (business_id, name) VALUES ($1, $2) ON CONFLICT (business_id, name) DO NOTHING',
        [businessId, fallbackCategory],
      )
    }
    await client.query('DELETE FROM business_categories WHERE id = $1', [categories[0].id])
    await client.query('COMMIT')
    transactionStarted = false
    return rowCount
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
