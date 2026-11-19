import webPush from 'web-push'
import { ECDH } from 'node:crypto'
import { pool } from '../../database/pool.js'

const publicKey = process.env.VAPID_PUBLIC_KEY || ''
const privateKey = process.env.VAPID_PRIVATE_KEY || ''
const subject = process.env.VAPID_SUBJECT || ''
if ([publicKey, privateKey, subject].some(Boolean) && ![publicKey, privateKey, subject].every(Boolean)) {
  throw new Error('Configurá VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT para habilitar las notificaciones.')
}
if (publicKey) webPush.setVapidDetails(subject, publicKey, privateKey)

export const vapidPublicKey = publicKey

export function validSubscription(subscription) {
  if (!subscription || typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 2048) return false
  let url
  try { url = new URL(subscription.endpoint) } catch { return false }
  const host = url.hostname
  const allowedHost = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com'
    || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com')
  if (url.protocol !== 'https:' || !allowedHost || url.port || url.username || url.password) return false
  const { p256dh, auth } = subscription.keys || {}
  if (typeof p256dh !== 'string' || typeof auth !== 'string'
    || !/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(auth)) return false
  const publicBytes = Buffer.from(p256dh, 'base64url')
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || Buffer.from(auth, 'base64url').length !== 16
    || publicBytes.toString('base64url') !== p256dh || Buffer.from(auth, 'base64url').toString('base64url') !== auth) return false
  try { ECDH.convertKey(publicBytes, 'prime256v1'); return true } catch { return false }
}

export async function notifyBusinessCustomers(businessId, message) {
  if (!vapidPublicKey) return
  const { rows } = await pool.query(
    `SELECT s.endpoint, s.p256dh, s.auth, b.name, b.slug
     FROM push_subscriptions s JOIN businesses b ON b.id = s.business_id
     WHERE s.business_id = $1 AND EXISTS (
       SELECT 1 FROM customer_orders o WHERE o.business_id = s.business_id
         AND o.customer_id = s.customer_id AND o.status <> 'cancelled'
     )`,
    [businessId],
  )
  for (let i = 0; i < rows.length; i += 20) {
    await Promise.all(rows.slice(i, i + 20).map(async (row) => {
      try {
        await webPush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify({ title: row.name, body: message, url: `/local/${encodeURIComponent(row.slug)}` }),
          { TTL: 86400, timeout: 10000 },
        )
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND p256dh = $2 AND auth = $3', [row.endpoint, row.p256dh, row.auth])
        } else {
          console.error('No se pudo entregar una notificación push:', error.statusCode || error.code || 'error de conexión')
        }
      }
    }))
  }
}
