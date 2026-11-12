import { pool } from '../../database/pool.js'

export async function findOrCreatePhoneCustomer(phone) {
  const { rows } = await pool.query(
    `INSERT INTO customers (phone, password_hash, role) VALUES ($1, NULL, 'customer')
     ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
     WHERE customers.role = 'customer'
     RETURNING id, first_name, last_name, phone, role, business_name, business_id`,
    [phone],
  )
  return rows[0]
}

export async function registerCustomer(firstName, lastName, phone, passwordHash) {
  const { rows } = await pool.query(
    `INSERT INTO customers (first_name, last_name, phone, password_hash, role)
     VALUES ($1, $2, $3, $4, 'customer')
     RETURNING id, first_name, last_name, phone, role, business_name, business_id`,
    [firstName, lastName, phone, passwordHash],
  )
  return rows[0]
}

export async function findByCredentials(email, phone) {
  const { rows } = await pool.query(
    `SELECT id, first_name, last_name, phone, email, password_hash, role, business_name, business_id
     FROM customers WHERE ($1 <> '' AND lower(email) = $1) OR ($2 <> '' AND phone = $2) LIMIT 1`,
    [email, phone],
  )
  return rows[0]
}

export async function findCustomer(id) {
  const { rows } = await pool.query(
    'SELECT id, first_name, last_name, phone, role, business_name, business_id FROM customers WHERE id = $1',
    [id],
  )
  return rows[0]
}

export async function lockCustomer(client, id) {
  const { rows } = await client.query(
    'SELECT id, first_name, last_name, phone, email, role, business_name, business_id FROM customers WHERE id = $1 FOR UPDATE',
    [id],
  )
  return rows[0]
}

export async function lockAvailableApplication(client, customer) {
  const { rows } = await client.query(
    `SELECT id, business_id, business_name, requested_plan FROM local_applications
     WHERE phone = $1 AND (email IS NULL OR lower(email) = lower($2))
       AND status IN ('pending', 'contacted', 'approved') AND claimed_at IS NULL
     ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
    [customer.phone, customer.email],
  )
  return rows[0]
}
