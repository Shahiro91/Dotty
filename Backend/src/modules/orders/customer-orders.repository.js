import { pool } from '../../database/pool.js'

export async function findCustomerOrderStatus(customerId, orderId) {
  const { rows } = await pool.query(
    `SELECT id, status, status_changed_at AS "statusChangedAt"
     FROM customer_orders WHERE id = $1 AND customer_id = $2`,
    [orderId, customerId],
  )
  return rows[0]
}
