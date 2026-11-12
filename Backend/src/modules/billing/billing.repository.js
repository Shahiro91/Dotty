import { pool } from '../../database/pool.js'
import { BILLING_GRACE_DAYS, PLAN_PRICES } from './billing.rules.js'

export async function getBillingData(businessId) {
  const { rows } = await pool.query('SELECT plan, pending_plan AS "pendingPlan", subscription_due_at AS "subscriptionDueAt" FROM businesses WHERE id = $1', [businessId])
  if (!rows[0]) return null
  const { rows: payments } = await pool.query(
    `SELECT id, plan, amount::float AS amount, period_end AS "periodEnd", paid_at AS "paidAt"
     FROM subscription_payments WHERE business_id = $1 ORDER BY paid_at DESC LIMIT 12`,
    [businessId],
  )
  return { business: rows[0], payments }
}

export async function updatePlan(businessId, plan) {
  const { rows } = await pool.query(
    `UPDATE businesses SET plan = $2, pending_plan = NULL
     WHERE id = $1 RETURNING plan, pending_plan AS "pendingPlan", subscription_due_at AS "subscriptionDueAt"`,
    [businessId, plan],
  )
  return rows[0]
}

export async function clearPendingPlan(businessId) {
  await pool.query('UPDATE businesses SET pending_plan = NULL WHERE id = $1', [businessId])
}

export async function recordPayment(businessId, payment) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT plan FROM businesses WHERE id = $1 FOR UPDATE', [businessId])
    const chargedPlan = rows[0]?.plan
    if (!rows[0] || Number(payment.transaction_amount) < PLAN_PRICES[chargedPlan]) {
      await client.query('ROLLBACK')
      return { applied: false, status: 'invalid' }
    }
    const inserted = await client.query(
      `INSERT INTO subscription_payments (business_id, mp_payment_id, plan, amount)
       VALUES ($1, $2, $3, $4) ON CONFLICT (mp_payment_id) DO NOTHING RETURNING id`,
      [businessId, String(payment.id), chargedPlan, payment.transaction_amount],
    )
    if (inserted.rowCount) {
      const { rows: updated } = await client.query(
        `UPDATE businesses
         SET pending_plan = NULL,
             subscription_due_at = (CASE WHEN subscription_due_at + make_interval(days => $2) < NOW() THEN NOW() ELSE subscription_due_at END) + INTERVAL '1 month'
         WHERE id = $1 RETURNING subscription_due_at`,
        [businessId, BILLING_GRACE_DAYS],
      )
      await client.query('UPDATE subscription_payments SET period_end = $1 WHERE id = $2', [updated[0].subscription_due_at, inserted.rows[0].id])
    }
    await client.query('COMMIT')
    return { applied: Boolean(inserted.rowCount), businessId }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
