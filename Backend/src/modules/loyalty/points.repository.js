import { pool } from '../../database/pool.js'

export async function lockPoints(client, customerId, businessId) {
  await client.query(
    'INSERT INTO customer_business_points (customer_id, business_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [customerId, businessId],
  )
  const { rows } = await client.query(
    'SELECT points FROM customer_business_points WHERE customer_id = $1 AND business_id = $2 FOR UPDATE',
    [customerId, businessId],
  )
  return rows[0].points
}

export async function adjustPoints(client, customerId, businessId, delta) {
  const { rows } = await client.query(
    `INSERT INTO customer_business_points (customer_id, business_id, points) VALUES ($1, $2, $3)
     ON CONFLICT (customer_id, business_id) DO UPDATE SET points = customer_business_points.points + EXCLUDED.points
     RETURNING points`,
    [customerId, businessId, delta],
  )
  return rows[0].points
}

export async function getBusinessPoints(customerId, businessSlug) {
  if (typeof businessSlug !== 'string' || !businessSlug) return 0
  const { rows } = await pool.query(
    `SELECT p.points FROM customer_business_points p JOIN businesses b ON b.id = p.business_id
     WHERE p.customer_id = $1 AND b.slug = $2`,
    [customerId, businessSlug],
  )
  return rows[0]?.points ?? 0
}

