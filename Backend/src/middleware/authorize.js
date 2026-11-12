import { pool } from '../database/pool.js'
import { BILLING_GRACE_DAYS, describeBilling } from '../modules/billing/billing.rules.js'

export async function requireAdmin(req, res, next) {
  try {
    if (req.phoneOnly) return res.status(403).json({ error: 'Ingresá con tu contraseña para acceder a esta sección.' })
    const { rows } = await pool.query('SELECT role FROM customers WHERE id = $1', [req.customerId])
    if (rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: 'No tenés permiso para acceder a esta sección.' })
    }
    next()
  } catch (error) {
    next(error)
  }
}

const SUSPENDED_MESSAGE = 'Tu cuenta está suspendida por falta de pago. Regularizá tu suscripción para volver a usarla.'
function partnerGuard({ allowSuspended }) {
  return async function guard(req, res, next) {
    try {
      if (req.phoneOnly) return res.status(403).json({ error: 'Ingresá con tu contraseña para acceder al panel del local.' })
      const { rows } = await pool.query(
        `SELECT c.role, c.business_id, b.plan, b.subscription_due_at AS "subscriptionDueAt",
                EXISTS (SELECT 1 FROM subscription_payments sp WHERE sp.business_id = b.id) AS "hasPaidSubscription"
         FROM customers c LEFT JOIN businesses b ON b.id = c.business_id WHERE c.id = $1`,
        [req.customerId],
      )
      if (rows[0]?.role !== 'local_owner' || !rows[0].business_id) {
        return res.status(403).json({ error: 'Tu cuenta no tiene un local activo asociado.' })
      }
      req.businessId = rows[0].business_id
      if (!allowSuspended && describeBilling(rows[0], new Date(), rows[0].hasPaidSubscription ? BILLING_GRACE_DAYS : 0).status === 'suspended') {
        return res.status(403).json({ error: SUSPENDED_MESSAGE, code: 'subscription_suspended' })
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

export const requirePartner = partnerGuard({ allowSuspended: false })
export const requirePartnerBilling = partnerGuard({ allowSuspended: true })

export async function isBusinessSuspended(queryable, businessId) {
  const { rows } = await queryable.query(
    `SELECT plan, subscription_due_at AS "subscriptionDueAt",
            EXISTS (SELECT 1 FROM subscription_payments sp WHERE sp.business_id = businesses.id) AS "hasPaidSubscription"
     FROM businesses WHERE id = $1`,
    [businessId],
  )
  return rows[0] ? describeBilling(rows[0], new Date(), rows[0].hasPaidSubscription ? BILLING_GRACE_DAYS : 0).status === 'suspended' : false
}

export async function requireVip(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT plan FROM businesses WHERE id = $1', [req.businessId])
    if (rows[0]?.plan !== 'vip') {
      return res.status(403).json({ error: 'La importación de catálogo está disponible con el Plan VIP.' })
    }
    next()
  } catch (error) {
    next(error)
  }
}

export async function requireCustomer(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT role FROM customers WHERE id = $1', [req.customerId])
    if (rows[0]?.role !== 'customer') {
      return res.status(403).json({ error: 'Solo las cuentas de cliente pueden realizar pedidos.' })
    }
    next()
  } catch (error) {
    next(error)
  }
}
