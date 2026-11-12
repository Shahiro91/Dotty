import { pool } from '../../database/pool.js'
import { BILLING_GRACE_DAYS } from '../billing/billing.rules.js'

export async function listApplications(status) {
  const filterClause = status === 'requests'
    ? "WHERE la.status IN ('pending', 'contacted', 'rejected')"
    : 'WHERE ($1::text IS NULL OR la.status = $1)'
  const { rows } = await pool.query(
    `SELECT la.id, la.first_name AS "firstName", la.last_name AS "lastName", la.phone, la.email,
            business_name AS "businessName", requested_plan AS "requestedPlan",
            la.status, la.created_at AS "createdAt", la.business_id AS "businessId",
            (la.claimed_at IS NOT NULL) AS claimed,
            b.plan AS "businessPlan", b.subscription_due_at AS "subscriptionDueAt"
     FROM local_applications la
     LEFT JOIN businesses b ON b.id = la.business_id
     ${filterClause}
     ORDER BY la.created_at DESC LIMIT 200`,
    status === 'requests' ? [] : [status],
  )
  return rows
}

export async function changeSubscription(businessId, action) {
  const { rows } = await pool.query(
    action === 'extend'
      ? `UPDATE businesses SET subscription_due_at = GREATEST(subscription_due_at, NOW()) + INTERVAL '1 month'
         WHERE id = $1 RETURNING plan, subscription_due_at AS "subscriptionDueAt"`
      : `UPDATE businesses SET subscription_due_at = NOW() - make_interval(days => $2)
         WHERE id = $1 RETURNING plan, subscription_due_at AS "subscriptionDueAt"`,
    action === 'extend' ? [businessId] : [businessId, BILLING_GRACE_DAYS + 1],
  )
  return rows[0]
}

export async function lockBusiness(client, businessId) {
  const { rows } = await client.query('SELECT id FROM businesses WHERE id = $1 FOR UPDATE', [businessId])
  return rows[0]
}

export async function deleteBusinessData(client, businessId) {
  await client.query(
    `UPDATE customer_orders SET business_id = NULL, discount_redemption_id = NULL, product_reward_redemption_id = NULL
     WHERE business_id = $1 OR discount_redemption_id IN (SELECT id FROM business_redemptions WHERE business_id = $1)
        OR product_reward_redemption_id IN (SELECT id FROM business_redemptions WHERE business_id = $1)`,
    [businessId],
  )
  await client.query('DELETE FROM business_redemptions WHERE business_id = $1', [businessId])
  await client.query(
    `UPDATE customers SET role = 'customer', business_id = NULL, business_name = NULL
     WHERE business_id = $1 AND role = 'local_owner'`,
    [businessId],
  )
  await client.query('DELETE FROM local_applications WHERE business_id = $1', [businessId])
  await client.query('DELETE FROM businesses WHERE id = $1', [businessId])
}

export async function lockApplication(client, applicationId) {
  const { rows } = await client.query(
    'SELECT id, phone, business_name, requested_plan, business_id, status FROM local_applications WHERE id = $1 FOR UPDATE',
    [applicationId],
  )
  return rows[0]
}

export async function updateApplicationStatus(client, applicationId, status) {
  const { rows } = await client.query(
    `UPDATE local_applications SET status = $1 WHERE id = $2
     RETURNING id, first_name AS "firstName", last_name AS "lastName", phone, email,
               business_name AS "businessName", requested_plan AS "requestedPlan",
               business_id AS "businessId", status, created_at AS "createdAt"`,
    [status, applicationId],
  )
  return rows[0]
}
