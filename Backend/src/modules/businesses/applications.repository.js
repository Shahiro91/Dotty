export async function customerExists(client, phone, email) {
  const { rows } = await client.query('SELECT id FROM customers WHERE phone = $1 OR lower(email) = $2', [phone, email])
  return Boolean(rows[0])
}

export async function applicationExists(client, phone, email) {
  const { rows } = await client.query(
    "SELECT id FROM local_applications WHERE (phone = $1 OR lower(email) = $2) AND status IN ('pending', 'contacted', 'approved') LIMIT 1",
    [phone, email],
  )
  return Boolean(rows[0])
}

export async function createApplicationCustomer(client, input, passwordHash) {
  const { rows } = await client.query(
    `INSERT INTO customers (first_name, last_name, phone, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, 'customer') RETURNING id`,
    [input.firstName, input.lastName, input.phone, input.email, passwordHash],
  )
  return rows[0]
}

export async function insertApplication(client, input) {
  const { rows } = await client.query(
    'INSERT INTO local_applications (first_name, last_name, phone, email, business_name, requested_plan) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, business_id, business_name, requested_plan',
    [input.firstName, input.lastName, input.phone, input.email, input.businessName, input.requestedPlan],
  )
  return rows[0]
}

export async function insertBusiness(client, application, slug, trialDays) {
  const { rows } = await client.query(
    `INSERT INTO businesses (name, slug, plan, subscription_due_at)
     VALUES ($1, $2, $3, NOW() + make_interval(days => $4)) RETURNING id`,
    [application.business_name, slug, application.requested_plan, trialDays],
  )
  return rows[0].id
}

export async function restartTrial(client, businessId, trialDays) {
  await client.query('UPDATE businesses SET subscription_due_at = NOW() + make_interval(days => $2) WHERE id = $1', [businessId, trialDays])
}

export async function associateOwner(client, application, businessId, customerId) {
  const { rows } = await client.query(
    `UPDATE customers SET role = 'local_owner', business_name = $1, business_id = $2
     WHERE id = $3 AND role = 'customer'
     RETURNING id, first_name, last_name, phone, role, business_name, business_id`,
    [application.business_name, businessId, customerId],
  )
  return rows[0]
}

export async function markApplicationClaimed(client, applicationId, businessId) {
  await client.query(
    `UPDATE local_applications SET status = 'approved', business_id = $1, claimed_at = NOW(),
     activation_code_hash = NULL, activation_expires_at = NULL WHERE id = $2`,
    [businessId, applicationId],
  )
}
