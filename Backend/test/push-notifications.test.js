import assert from 'node:assert/strict'
import { createECDH, randomBytes } from 'node:crypto'
import { test } from 'node:test'
import webPush from 'web-push'

process.env.DATABASE_URL = 'postgresql://localhost/push_test'
process.env.JWT_SECRET = 'test-secret-with-at-least-32-characters'
const vapid = webPush.generateVAPIDKeys()
process.env.VAPID_PUBLIC_KEY = vapid.publicKey
process.env.VAPID_PRIVATE_KEY = vapid.privateKey
process.env.VAPID_SUBJECT = 'mailto:test@example.test'
const { validSubscription, notifyBusinessCustomers } = await import('../src/modules/notifications/push.service.js')
const { pool } = await import('../src/database/pool.js')

function subscription(endpoint = 'https://fcm.googleapis.com/fcm/send/test') {
  const key = createECDH('prime256v1')
  key.generateKeys()
  return { endpoint, keys: { p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } }
}

test('push subscriptions require trusted HTTPS endpoints and valid encryption keys', () => {
  const valid = subscription()
  assert.equal(validSubscription(valid), true)
  assert.equal(validSubscription({ ...valid, endpoint: 'https://fcm.googleapis.com.attacker.test/send' }), false)
  assert.equal(validSubscription({ ...valid, endpoint: 'http://fcm.googleapis.com/send' }), false)
  assert.equal(validSubscription({ ...valid, endpoint: 'https://fcm.googleapis.com:444/send' }), false)
  assert.equal(validSubscription({ ...valid, keys: { ...valid.keys, auth: 'invalid' } }), false)
  assert.equal(validSubscription({ ...valid, keys: { ...valid.keys, p256dh: Buffer.alloc(65, 4).toString('base64url') } }), false)
  assert.equal(validSubscription(subscription('https://web.push.apple.com/test')), true)
})

test('delivery sends the store link and removes expired subscriptions', async () => {
  const first = subscription()
  const expired = subscription('https://updates.push.services.mozilla.com/wpush/test')
  const queries = []
  const sent = []
  const originalQuery = pool.query
  const originalSend = webPush.sendNotification
  pool.query = async (sql, params) => {
    queries.push({ sql, params })
    if (sql.startsWith('SELECT')) return { rows: [first, expired].map(({ endpoint, keys }) => ({ endpoint, ...keys, name: 'Local', slug: 'local-prueba' })) }
    return { rows: [] }
  }
  webPush.sendNotification = async (recipient, payload, options) => {
    sent.push({ recipient, payload: JSON.parse(payload), options })
    if (recipient.endpoint === expired.endpoint) throw Object.assign(new Error('expired'), { statusCode: 410 })
  }
  try {
    const result = await notifyBusinessCustomers(42, 'Nuevo canje')
    assert.deepEqual(result, { eligible: 2, sent: 1, failed: 1 })
    assert.equal(sent.length, 2)
    assert.deepEqual(sent[0].payload, { title: 'Local', body: 'Nuevo canje', url: '/local/local-prueba' })
    assert.equal(sent[0].options.TTL, 86400)
    assert.deepEqual(queries[0].params, [42])
    assert.match(queries[0].sql, /o\.status <> 'cancelled'/)
    assert.deepEqual(queries[1].params, [expired.endpoint, expired.keys.p256dh, expired.keys.auth])
  } finally {
    pool.query = originalQuery
    webPush.sendNotification = originalSend
  }
})
