import { Router } from 'express'
import { pool } from '../../database/pool.js'
import { authenticate } from '../../middleware/authenticate.js'
import { requireCustomer } from '../../middleware/authorize.js'
import { rateLimit } from '../../middleware/rate-limit.js'
import { validSubscription, vapidPublicKey } from './push.service.js'

const router = Router()
const guard = [authenticate, requireCustomer, rateLimit('push', 60, 15 * 60_000)]

router.post('/businesses/:slug/push/status', ...guard, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.id,
        EXISTS (SELECT 1 FROM customer_orders o WHERE o.business_id = b.id AND o.customer_id = $2 AND o.status <> 'cancelled') AS eligible,
        EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.business_id = b.id AND s.customer_id = $2 AND s.endpoint = $3) AS subscribed
       FROM businesses b WHERE b.slug = $1`,
      [req.params.slug, req.customerId, typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''],
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontramos ese local.' })
    res.json({ enabled: Boolean(vapidPublicKey), publicKey: vapidPublicKey, eligible: rows[0].eligible, subscribed: rows[0].subscribed })
  } catch (error) { next(error) }
})

router.post('/businesses/:slug/push/subscribe', ...guard, async (req, res, next) => {
  if (!vapidPublicKey) return res.status(503).json({ error: 'Las notificaciones no están configuradas.' })
  const subscription = req.body?.subscription
  if (!validSubscription(subscription)) return res.status(400).json({ error: 'La suscripción de notificaciones no es válida.' })
  const client = await pool.connect().catch(next)
  if (!client) return
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [subscription.endpoint])
    const { rows } = await client.query(
      `SELECT b.id FROM businesses b WHERE b.slug = $1 AND EXISTS (
        SELECT 1 FROM customer_orders o WHERE o.business_id = b.id AND o.customer_id = $2 AND o.status <> 'cancelled'
      )`, [req.params.slug, req.customerId],
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      return res.status(403).json({ error: 'Necesitás tener un pedido en este local para recibir sus novedades.' })
    }
    await client.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND customer_id <> $2', [subscription.endpoint, req.customerId])
    await client.query(
      `INSERT INTO push_subscriptions (endpoint, business_id, customer_id, p256dh, auth)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (endpoint, business_id) DO UPDATE SET customer_id = EXCLUDED.customer_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [subscription.endpoint, rows[0].id, req.customerId, subscription.keys.p256dh, subscription.keys.auth],
    )
    await client.query('COMMIT')
    res.json({ subscribed: true })
  } catch (error) {
    await client.query('ROLLBACK')
    next(error)
  } finally { client.release() }
})

router.post('/businesses/:slug/push/unsubscribe', ...guard, async (req, res, next) => {
  const endpoint = req.body?.endpoint
  if (typeof endpoint !== 'string' || !endpoint || endpoint.length > 2048) return res.status(400).json({ error: 'La suscripción de notificaciones no es válida.' })
  try {
    await pool.query(
      `DELETE FROM push_subscriptions s USING businesses b
       WHERE s.business_id = b.id AND b.slug = $1 AND s.customer_id = $2 AND s.endpoint = $3`,
      [req.params.slug, req.customerId, endpoint],
    )
    res.json({ subscribed: false })
  } catch (error) { next(error) }
})

export { router as pushRoutes }
