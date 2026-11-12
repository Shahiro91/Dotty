import { pool } from '../../database/pool.js'

export async function listForBusiness(businessId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(NULLIF(o.customer_first_name, ''), c.first_name) AS "firstName",
            COALESCE(NULLIF(o.customer_last_name, ''), c.last_name) AS "lastName",
            c.phone, COALESCE(a.delivery_address, '') AS "deliveryAddress"
     FROM customers c JOIN LATERAL (
       SELECT customer_first_name, customer_last_name, delivery_address
       FROM customer_orders WHERE customer_id = c.id AND business_id = $1
       ORDER BY created_at, id LIMIT 1
     ) o ON TRUE
     LEFT JOIN LATERAL (
       SELECT delivery_address FROM customer_orders
       WHERE customer_id = c.id AND business_id = $1 AND delivery_address <> ''
       ORDER BY created_at, id LIMIT 1
     ) a ON TRUE
     WHERE c.role <> 'admin'
     ORDER BY "firstName", "lastName", c.phone LIMIT 1000`,
    [businessId],
  )
  return rows
}
