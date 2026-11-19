import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createECDH, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { test } from 'node:test'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import webPush from 'web-push'

test('push subscriptions and publication stay scoped to eligible customers and locals', { skip: !process.env.TEST_DATABASE_URL, timeout: 30000 }, async (t) => {
  const schema = `push_test_${randomBytes(8).toString('hex')}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  await admin.query(`CREATE SCHEMA "${schema}"`)
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  let server
  t.after(async () => {
    if (server && server.exitCode === null) {
      server.kill()
      await once(server, 'exit')
    }
    await db.end()
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.end()
  })

  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  const secret = 'test-secret-with-at-least-32-characters'
  const vapid = webPush.generateVAPIDKeys()
  server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, PGOPTIONS: `-c search_path=${schema}`,
      PGSSL: 'false', JWT_SECRET: secret, ADMIN_PASSWORD_1: 'admin-test-password', PORT: String(port),
      VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: 'mailto:test@example.test',
      NODE_OPTIONS: `--import ${new URL('./fixtures/push-mock.js', import.meta.url).href}`,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  let output = ''
  server.stdout.on('data', (data) => { output += data })
  server.stderr.on('data', (data) => { output += data })
  const notifications = []
  server.on('message', (message) => notifications.push(message))
  const base = `http://127.0.0.1:${port}/api`
  async function request(path, token, body, method = 'POST') {
    const response = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return { status: response.status, data: await response.json() }
  }
  let ready = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Backend exited: ${output}`)
    try { await fetch(`${base}/health`); ready = true; break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) }
  }
  assert.ok(ready, output)
  const { rows: [business] } = await db.query("INSERT INTO businesses (name, slug, plan) VALUES ('Local', 'local-test', 'vip') RETURNING id")
  await db.query("INSERT INTO businesses (name, slug) VALUES ('Otro', 'otro-test')")
  const { rows: [customer] } = await db.query("INSERT INTO customers (phone, role) VALUES ('11112222', 'customer') RETURNING id")
  const { rows: [owner] } = await db.query("INSERT INTO customers (phone, role, business_id) VALUES ('33334444', 'local_owner', $1) RETURNING id", [business.id])
  const token = jwt.sign({ sub: String(customer.id), phoneOnly: true }, secret)
  const partnerToken = jwt.sign({ sub: String(owner.id) }, secret)
  const key = createECDH('prime256v1')
  key.generateKeys()
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  }
  const path = '/public/businesses/local-test/push'
  assert.equal((await request(`${path}/subscribe`, token, { subscription })).status, 403)
  const { rows: [order] } = await db.query(
    "INSERT INTO customer_orders (customer_id, business_id, total, points_awarded, items) VALUES ($1, $2, 1, 0, '[]') RETURNING id",
    [customer.id, business.id],
  )
  assert.equal((await request(`${path}/subscribe`, token, { subscription })).status, 200)
  assert.equal((await request('/public/businesses/otro-test/push/subscribe', token, { subscription })).status, 403)
  assert.equal((await request(`${path}/status`, token, { endpoint: subscription.endpoint })).data.subscribed, true)
  const waitForCount = async (count) => {
    for (let attempt = 0; attempt < 100 && notifications.length < count; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(notifications.length, count)
  }
  const reward = { name: 'Descuento', rewardType: 'discount', discountType: 'fixed', discountValue: 1, pointsCost: 1 }
  assert.equal((await request('/partner/rewards', partnerToken, reward)).status, 201)
  await waitForCount(1)
  assert.deepEqual(notifications[0], { endpoint: subscription.endpoint, payload: { title: 'Local', body: 'Nuevo canje: Descuento', url: '/local/local-test' } })
  assert.equal((await request('/partner/bonus-days', partnerToken, { days: [1, 2] }, 'PATCH')).status, 200)
  await waitForCount(2)
  assert.equal((await request('/partner/bonus-days', partnerToken, { days: [2, 1] }, 'PATCH')).status, 200)
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(notifications.length, 2)
  const importedReward = { ...reward, name: 'Importado' }
  assert.equal((await request('/partner/import-catalog', partnerToken, { rewards: [importedReward] })).status, 200)
  await waitForCount(3)
  assert.equal((await request('/partner/import-catalog', partnerToken, { rewards: [importedReward] })).status, 200)
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(notifications.length, 3)
  const { rows: [imported] } = await db.query("SELECT id FROM business_rewards WHERE business_id = $1 AND name = 'Importado'", [business.id])
  await db.query('UPDATE business_rewards SET is_available = FALSE WHERE id = $1', [imported.id])
  assert.equal((await request('/partner/import-catalog', partnerToken, { rewards: [importedReward] })).status, 200)
  await waitForCount(4)
  await db.query("UPDATE customer_orders SET status = 'cancelled' WHERE id = $1", [order.id])
  assert.equal((await request('/partner/rewards', partnerToken, { ...reward, name: 'Otro canje' })).status, 201)
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(notifications.length, 4)
  assert.equal((await request(`${path}/unsubscribe`, token, { endpoint: subscription.endpoint })).status, 200)
  assert.equal((await request(`${path}/status`, token, { endpoint: subscription.endpoint })).data.subscribed, false)
})
