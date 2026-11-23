import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createECDH, randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { test } from 'node:test'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import webPush from 'web-push'
import { assertApiCoverage } from './fixtures/api-coverage.js'

const databaseUrl = process.env.TEST_DATABASE_URL

test('phone login, orders and partner access', { skip: !databaseUrl, timeout: 60000 }, async (t) => {
  const schema = `phone_test_${randomBytes(8).toString('hex')}`
  const pool = new pg.Pool({ connectionString: databaseUrl })
  let server
  let db
  await pool.query(`CREATE SCHEMA "${schema}"`)
  t.after(async () => {
    if (server && server.exitCode === null) {
      server.kill()
      await once(server, 'exit')
    }
    if (db) await db.end()
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`)
    await pool.end()
  })
  db = new pg.Pool({ connectionString: databaseUrl, options: `-c search_path=${schema}` })
  await db.query(`CREATE TABLE customers (
    id BIGSERIAL PRIMARY KEY, phone VARCHAR(16) UNIQUE,
    password_hash TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  const legacyHash = await bcrypt.hash('old-password', 4)
  await db.query("INSERT INTO customers (phone, password_hash) VALUES ('22223333', $1)", [legacyHash])

  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))

  const jwtSecret = 'test-secret-with-at-least-32-characters'
  const vapid = webPush.generateVAPIDKeys()
  server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      PGOPTIONS: `-c search_path=${schema}`,
      PGSSL: 'false',
      JWT_SECRET: jwtSecret,
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'mailto:test@example.test',
      ADMIN_PASSWORD_1: 'admin-test-password',
      MP_ACCESS_TOKEN: 'TEST-local-only',
      MP_ENVIRONMENT: 'sandbox',
      NODE_OPTIONS: `--import ${new URL('./fixtures/mercadopago-mock.js', import.meta.url).href}`,
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (data) => { output += data })
  server.stderr.on('data', (data) => { output += data })
  const base = `http://127.0.0.1:${port}/api`
  const responses = []
  async function trackedFetch(url, options = {}) {
    const response = await fetch(url, options)
    const pathname = new URL(url).pathname
    if (pathname.startsWith('/api/')) {
      responses.push({ method: options.method || 'GET', path: pathname.slice(4), status: response.status })
    }
    return response
  }
  async function request(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
    const response = await trackedFetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = response.status === 204 ? null
      : response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text()
    return { status: response.status, data }
  }
  let ready = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Backend exited: ${output}`)
    try {
      await request('/auth/me')
      ready = true
      break
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
  }
  assert.ok(ready, `Backend did not start: ${output}`)
  const health = await request('/health')
  assert.equal(health.status, 200)
  assert.deepEqual(health.data, { status: 'ok' })
  const { rows: [business] } = await db.query("INSERT INTO businesses (name, slug) VALUES ('Test', 'test') RETURNING id")
  await db.query("INSERT INTO business_categories (business_id, name) VALUES ($1, 'Pizzas')", [business.id])
  const { rows: [product] } = await db.query("INSERT INTO business_products (business_id, name, category, price, points_per_unit) VALUES ($1, 'Pizza', 'Pizzas', 1000, 5) RETURNING id", [business.id])
  const hash = await bcrypt.hash('owner-password', 4)
  await db.query("INSERT INTO customers (phone, email, password_hash, role, business_id) VALUES ('1234567890', 'owner@example.test', $1, 'local_owner', $2)", [hash, business.id])
  const owner = await request('/auth/login', { body: { identifier: 'owner@example.test', password: 'owner-password', portal: 'partner' } })
  assert.equal(owner.status, 200)
  const storefront = await request('/public/businesses/test')
  assert.equal(storefront.status, 200)
  assert.equal(storefront.data.business.slug, 'test')
  assert.equal('subscriptionDueAt' in storefront.data.business, false)
  assert.equal(storefront.data.products[0].name, 'Pizza')
  for (const field of ['rewards', 'addons', 'categories', 'promoVideos', 'bestSellerIds']) assert.ok(Array.isArray(storefront.data[field]))
  assert.equal((await request('/public/businesses/nonexistent')).status, 404)
  assert.equal((await request('/api-not-found')).status, 404)
  assert.equal((await request('/partner/categories')).status, 401)
  const categories = await request('/partner/categories', { token: owner.data.token })
  assert.equal(categories.status, 200)
  assert.deepEqual(categories.data.categories, [{ name: 'Pizzas', fractionalParts: 0, productCount: 1 }])
  const category = await request('/partner/categories', { token: owner.data.token, body: { name: 'Pastas', fractionalParts: 2 } })
  assert.equal(category.status, 201)
  assert.deepEqual(category.data.category, { name: 'Pastas', fractionalParts: 2, productCount: 0 })
  assert.deepEqual(category.data.categories.map((item) => item.name), ['Pastas', 'Pizzas'])
  const { rows: [otherBusiness] } = await db.query("INSERT INTO businesses (name, slug) VALUES ('Otro', 'otro-orden') RETURNING id")
  await db.query("INSERT INTO business_categories (business_id, name) VALUES ($1, 'Pastas'), ($1, 'Pizzas')", [otherBusiness.id])
  const orderRequest = (names) => request('/partner/categories/order', { method: 'PUT', token: owner.data.token, body: { categories: names } })
  assert.equal((await request('/partner/categories/order', { method: 'PUT', body: { categories: ['Pizzas', 'Pastas'] } })).status, 401)
  assert.equal((await orderRequest(['Pizzas', 'Pizzas'])).status, 400)
  assert.equal((await orderRequest(['Pizzas'])).status, 409)
  const reordered = await orderRequest(['Pizzas', 'Pastas'])
  assert.equal(reordered.status, 200)
  assert.deepEqual(reordered.data.categories.map((item) => item.name), ['Pizzas', 'Pastas'])
  assert.deepEqual((await request('/partner/categories', { token: owner.data.token })).data.categories.map((item) => item.name), ['Pizzas', 'Pastas'])
  assert.deepEqual((await request('/public/businesses/test')).data.categories.map((item) => item.name), ['Pizzas', 'Pastas'])
  const otherOrder = await db.query('SELECT name, sort_order FROM business_categories WHERE business_id = $1 ORDER BY name', [otherBusiness.id])
  assert.deepEqual(otherOrder.rows, [{ name: 'Pastas', sort_order: null }, { name: 'Pizzas', sort_order: null }])
  await db.query('DELETE FROM businesses WHERE id = $1', [otherBusiness.id])
  const addedAfterOrder = await request('/partner/categories', { token: owner.data.token, body: { name: 'Antojos' } })
  assert.deepEqual(addedAfterOrder.data.categories.map((item) => item.name), ['Pizzas', 'Pastas', 'Antojos'])
  assert.equal((await orderRequest(['Pizzas', 'Pastas'])).status, 409)
  await request('/partner/categories', { method: 'DELETE', token: owner.data.token, body: { name: 'Antojos' } })
  assert.equal((await request('/partner/categories', { token: owner.data.token, body: { name: 'Pastas' } })).status, 409)
  assert.equal((await request('/partner/categories', { token: owner.data.token, body: { name: 'Inválido', fractionalParts: 1 } })).status, 400)
  const renamed = await request('/partner/categories', { method: 'PATCH', token: owner.data.token, body: { currentName: 'Pastas', name: 'Fideos', fractionalParts: 0 } })
  assert.deepEqual(renamed.data.category, { name: 'Fideos', fractionalParts: 0 })
  assert.deepEqual(renamed.data.categories.map((item) => item.name), ['Pizzas', 'Fideos'])
  const removed = await request('/partner/categories', { method: 'DELETE', token: owner.data.token, body: { name: 'Fideos' } })
  assert.deepEqual(removed.data, { category: 'General', productsMoved: 0, categories: [{ name: 'Pizzas', fractionalParts: 0, productCount: 1 }] })
  assert.equal((await request('/partner/categories', { method: 'DELETE', token: owner.data.token, body: { name: 'Fideos' } })).status, 404)
  await request('/partner/categories', { token: owner.data.token, body: { name: 'Bebidas' } })
  await db.query("INSERT INTO business_products (business_id, name, category, price) VALUES ($1, 'Agua', 'Bebidas', 100)", [business.id])
  const withProducts = await request('/partner/categories', { method: 'PATCH', token: owner.data.token, body: { currentName: 'Bebidas', name: 'Refrescos' } })
  assert.equal(withProducts.status, 200)
  const moved = await request('/partner/categories', { method: 'DELETE', token: owner.data.token, body: { name: 'Refrescos' } })
  assert.deepEqual(moved.data, { category: 'General', productsMoved: 1, categories: [{ name: 'Pizzas', fractionalParts: 0, productCount: 1 }, { name: 'General', fractionalParts: 0, productCount: 1 }] })
  const { rows: [movedProduct] } = await db.query("SELECT category FROM business_products WHERE business_id = $1 AND name = 'Agua'", [business.id])
  assert.equal(movedProduct.category, 'General')
  const productBody = { name: 'Fugazzeta', category: 'Pizzas', price: 2400, pointsPerUnit: 3 }
  assert.equal((await request('/partner/products', { token: owner.data.token, body: { ...productBody, category: 'Inexistente' } })).status, 400)
  const addedProduct = await request('/partner/products', { token: owner.data.token, body: productBody })
  assert.equal(addedProduct.status, 201)
  assert.equal(addedProduct.data.product.name, 'Fugazzeta')
  assert.equal(addedProduct.data.product.pointsPerUnit, 3)
  const productId = addedProduct.data.product.id
  const updatedProduct = await request(`/partner/products/${productId}`, { method: 'PATCH', token: owner.data.token, body: { ...productBody, price: 2500 } })
  assert.equal(updatedProduct.status, 200)
  assert.equal(updatedProduct.data.product.price, 2500)
  const availability = await request(`/partner/products/${productId}/availability`, { method: 'PATCH', token: owner.data.token, body: { isAvailable: false } })
  assert.equal(availability.data.product.isAvailable, false)
  assert.equal((await request(`/partner/products/${productId}`, { method: 'DELETE', token: owner.data.token })).status, 204)
  const addonInput = { category: 'Pizzas', name: 'Queso extra', groupName: 'Extras', selectionMode: 'multiple', price: 250 }
  const addon = await request('/partner/category-addons', { token: owner.data.token, body: addonInput })
  assert.equal(addon.status, 201)
  assert.equal(addon.data.addon.price, 250)
  assert.equal((await request('/partner/category-addons', { token: owner.data.token, body: { ...addonInput, selectionMode: 'single', name: 'Otro' } })).status, 400)
  assert.equal((await request('/partner/category-addons', { token: owner.data.token })).data.addons.length, 1)
  const updatedAddon = await request(`/partner/category-addons/${addon.data.addon.id}`, { method: 'PATCH', token: owner.data.token, body: { ...addonInput, price: 250 } })
  assert.equal(updatedAddon.status, 200)
  assert.equal(updatedAddon.data.addon.price, 250)
  const tempAddon = await request('/partner/category-addons', { token: owner.data.token, body: { ...addonInput, name: 'Temporal', groupName: 'Temporal' } })
  assert.equal(tempAddon.status, 201)
  const movedGroup = await request('/partner/category-addon-groups', { method: 'PATCH', token: owner.data.token, body: { category: 'Pizzas', groupName: 'Temporal', newgroupName: 'Renombrado', selectionMode: 'multiple', isRequired: true } })
  assert.equal(movedGroup.status, 200)
  assert.equal(movedGroup.data.groupAddons[0].isRequired, true)
  assert.equal((await request('/partner/category-addon-groups', { method: 'DELETE', token: owner.data.token, body: { category: 'Pizzas', groupName: 'Renombrado' } })).status, 204)
  assert.equal((await request(`/partner/category-addons/${tempAddon.data.addon.id}`, { method: 'DELETE', token: owner.data.token })).status, 404)
  const flavorInput = { ...addonInput, groupName: 'Sabores', requiredTwo: true, name: 'Sabor uno' }
  const flavorOne = await request('/partner/category-addons', { token: owner.data.token, body: flavorInput })
  const flavorTwo = await request('/partner/category-addons', { token: owner.data.token, body: { ...flavorInput, name: 'Sabor dos' } })
  assert.equal(flavorOne.status, 201)
  assert.equal(flavorTwo.status, 201)
  assert.equal((await request(`/partner/category-addons/${flavorOne.data.addon.id}`, { method: 'DELETE', token: owner.data.token })).status, 409)
  assert.equal((await request('/partner/category-addon-groups', { method: 'PATCH', token: owner.data.token, body: { category: 'Pizzas', groupName: 'Sabores', newgroupName: 'Otros sabores', selectionMode: 'multiple' } })).status, 400)
  assert.equal((await request('/partner/category-addon-groups', { method: 'PATCH', token: owner.data.token, body: { category: 'Pizzas', groupName: 'Sabores', newgroupName: 'Sabores', selectionMode: 'multiple', clearRequiredTwo: true } })).status, 200)
  assert.equal((await request('/partner/category-addon-groups', { method: 'DELETE', token: owner.data.token, body: { category: 'Pizzas', groupName: 'Sabores' } })).status, 204)
  assert.equal((await request('/partner/import-catalog', { token: owner.data.token, body: { categories: ['Pastas'] } })).status, 403)
  const discount = await request('/partner/rewards', { token: owner.data.token, body: { name: 'Descuento', rewardType: 'discount', discountType: 'fixed', discountValue: 200, pointsCost: 3 } })
  assert.equal(discount.status, 201)
  assert.equal((await request('/partner/rewards', { token: owner.data.token })).data.rewards.length, 1)
  assert.equal((await request('/partner/rewards', { token: owner.data.token, body: { name: 'Inválido', rewardType: 'discount', discountType: 'percentage', discountValue: 101, pointsCost: 3 } })).status, 400)
  const productRewardInput = { name: 'Pizza gratis', productId: product.id, pointsCost: 5 }
  assert.equal((await request('/partner/rewards', { token: owner.data.token, body: { ...productRewardInput, productId: 999999 } })).status, 400)
  const productReward = await request('/partner/rewards', { token: owner.data.token, body: productRewardInput })
  assert.equal(productReward.status, 201)
  const changedReward = await request(`/partner/rewards/${productReward.data.reward.id}`, { method: 'PATCH', token: owner.data.token, body: { ...productRewardInput, pointsCost: 6 } })
  assert.equal(changedReward.status, 200)
  assert.equal(changedReward.data.reward.pointsCost, 6)
  assert.equal((await request('/partner/rewards/999999', { method: 'PATCH', token: owner.data.token, body: productRewardInput })).status, 404)
  assert.equal((await request(`/partner/rewards/${productReward.data.reward.id}`, { method: 'DELETE', token: owner.data.token })).status, 204)
  assert.equal((await request('/auth/phone', { body: { phone: '1234567890' } })).status, 403)
  assert.equal((await request('/auth/phone', { body: { phone: 'abc' } })).status, 400)
  const registered = await request('/auth/register', { body: { firstName: 'Test', lastName: 'Registro', phone: '99990000', password: 'valid-password' } })
  assert.equal(registered.status, 201)
  assert.equal((await request('/auth/register', { body: { firstName: 'Test', lastName: 'Registro', phone: '99990000', password: 'valid-password' } })).status, 409)
  assert.equal((await request('/auth/login', { body: { phone: '99990000', password: 'valid-password' } })).status, 200)
  assert.equal((await request('/auth/me', { token: registered.data.token })).data.phone, '99990000')
  const { rows: [legacy] } = await db.query("SELECT id FROM customers WHERE phone = '22223333'")
  await db.query('INSERT INTO customer_business_points (customer_id, business_id, points) VALUES ($1, $2, 42)', [legacy.id, business.id])
  const legacyLogin = await request('/auth/phone', { body: { phone: '22223333', businessSlug: 'test' } })
  assert.equal(legacyLogin.data.user.points, 42)
  assert.equal(legacyLogin.data.user.id, legacy.id)
  const { rows: [legacyAfter] } = await db.query('SELECT password_hash FROM customers WHERE id = $1', [legacy.id])
  assert.equal(legacyAfter.password_hash, legacyHash)

  const login = await request('/auth/phone', { body: { phone: ' 1111-2222 ', businessSlug: 'test' } })
  assert.equal(login.status, 200)
  assert.equal(login.data.user.phone, '11112222')
  assert.equal(login.data.user.points, 0)
  const token = login.data.token
  const pushKey = createECDH('prime256v1')
  pushKey.generateKeys()
  const pushSubscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/integration-test',
    keys: { p256dh: pushKey.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
  }
  const pushPath = '/public/businesses/test/push'
  assert.equal((await request(`${pushPath}/status`, { token, body: {} })).data.eligible, false)
  assert.equal((await request(`${pushPath}/subscribe`, { token, body: { subscription: pushSubscription } })).status, 403)
  const { rows: [customer] } = await db.query("SELECT password_hash, first_name, last_name FROM customers WHERE phone = '11112222'")
  assert.deepEqual(customer, { password_hash: null, first_name: '', last_name: '' })
  assert.equal((await request('/auth/claim-business', { token, body: { code: 'ABCD-EFGH' } })).status, 404)
  assert.equal((await request('/auth/login', { body: { phone: '11112222', password: 'anything' } })).status, 401)

  const legacyOrder = await request('/orders', { token, body: { items: [{ id: 'milanesa-napolitana', quantity: 1 }] } })
  assert.equal(legacyOrder.status, 201)
  assert.equal(legacyOrder.data.order.total, 9800)
  assert.equal(legacyOrder.data.order.pointsEarned, 9)

  const orderBody = {
    businessSlug: 'test', items: [{ id: product.id, quantity: 1 }],
    customerFirstName: 'Ana', customerLastName: 'Perez',
    fulfillmentType: 'delivery', deliveryAddress: 'Calle 123', paymentMethod: 'cash',
  }
  assert.equal((await request('/orders', { token, body: { ...orderBody, customerFirstName: '' } })).status, 400)
  const order = await request('/orders', { token, body: orderBody })
  assert.equal(order.status, 201)
  assert.equal((await request(`${pushPath}/subscribe`, { token, body: { subscription: { ...pushSubscription, endpoint: 'https://example.test/push' } } })).status, 400)
  assert.equal((await request(`${pushPath}/subscribe`, { token, body: { subscription: pushSubscription } })).status, 200)
  assert.equal((await request(`${pushPath}/status`, { token, body: { endpoint: pushSubscription.endpoint } })).data.subscribed, true)
  assert.equal((await request(`${pushPath}/status`, { token: legacyLogin.data.token, body: { endpoint: pushSubscription.endpoint } })).data.subscribed, false)
  assert.equal((await request(`${pushPath}/unsubscribe`, { token, body: { endpoint: pushSubscription.endpoint } })).status, 200)
  assert.equal((await request(`${pushPath}/status`, { token, body: { endpoint: pushSubscription.endpoint } })).data.subscribed, false)
  assert.equal(order.data.user.points, 5)
  assert.equal(order.data.order.customerFirstName, 'Ana')
  assert.equal((await request(`/orders/${order.data.order.id}/status`, { token })).data.status, 'in_process')
  assert.equal((await request('/orders/invalid/status', { token })).status, 400)
  assert.equal((await request(`/orders/${order.data.order.id}/status`, { token: legacyLogin.data.token })).status, 404)
  assert.equal((await request(`/orders/${order.data.order.id}/status`)).status, 401)
  const second = await request('/orders', { token, body: { ...orderBody, customerFirstName: 'Otra', deliveryAddress: 'Otra calle' } })
  assert.equal(second.status, 201)
  const relogin = await request('/auth/phone', { body: { phone: '11112222', businessSlug: 'test' } })
  assert.equal(relogin.data.user.points, 10)
  const customers = await request('/partner/customers', { token: owner.data.token })
  assert.equal(customers.status, 200)
  assert.deepEqual(customers.data.customers, [{ firstName: 'Ana', lastName: 'Perez', phone: '11112222', deliveryAddress: 'Calle 123' }])
  const orders = await request('/partner/orders', { token: owner.data.token })
  assert.equal(orders.data.orders[0].firstName, 'Otra')
  assert.equal(orders.data.orders[1].firstName, 'Ana')
  const statistics = await request('/partner/stats', { token: owner.data.token })
  assert.equal(statistics.status, 200)
  assert.deepEqual(statistics.data.summary, { revenue: 2000, orders: 2, averageOrder: 1000, cancelledOrders: 0, unitsSold: 2 })
  assert.equal(statistics.data.daily.length, 14)
  assert.equal(statistics.data.monthly.length, 12)
  assert.equal(statistics.data.categories[0].category, 'Pizzas')
  assert.equal(statistics.data.products[0].name, 'Pizza')
  assert.equal((await request('/partner/orders')).status, 401)
  assert.equal((await request('/partner/orders/invalid', { method: 'PATCH', token: owner.data.token, body: { status: 'confirmed' } })).status, 400)
  assert.equal((await request(`/partner/orders/${second.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'sent' } })).status, 409)
  assert.equal((await request(`/partner/orders/${second.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'confirmed' } })).status, 200)
  assert.equal((await request(`/partner/orders/${second.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'confirmed' } })).status, 409)
  assert.equal((await request(`/partner/orders/${second.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'sent' } })).status, 200)
  assert.equal((await request(`/partner/orders/${second.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'confirmed' } })).status, 409)
  const shift = await request('/partner/orders/new-shift', { token: owner.data.token, body: {} })
  assert.equal(shift.status, 200)
  assert.ok(shift.data.shiftStartedAt)
  assert.equal((await request('/partner/orders', { token: owner.data.token })).data.shiftStartedAt, shift.data.shiftStartedAt)
  const cancellations = await Promise.all(Array.from({ length: 2 }, () => request(`/partner/orders/${order.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'cancelled' } })))
  assert.deepEqual(cancellations.map((result) => result.status).sort(), [200, 409])
  assert.equal((await request(`/partner/orders/${order.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'cancelled' } })).status, 409)
  const afterCancellation = await request('/auth/phone', { body: { phone: '11112222', businessSlug: 'test' } })
  assert.equal(afterCancellation.data.user.points, 5)
  const discountedOrder = await request('/orders', { token, body: { ...orderBody, items: [{ id: product.id, quantity: 1, addonIds: [addon.data.addon.id] }], discountRewardId: discount.data.reward.id } })
  assert.equal(discountedOrder.status, 201)
  assert.equal(discountedOrder.data.order.subtotal, 1250)
  assert.equal(discountedOrder.data.order.total, 1050)
  assert.equal(discountedOrder.data.user.points, 7)
  assert.equal((await request(`/partner/orders/${discountedOrder.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'cancelled' } })).status, 200)
  const { rows: [cancelledDiscount] } = await db.query(
    'SELECT r.status FROM customer_orders o JOIN business_redemptions r ON r.id = o.discount_redemption_id WHERE o.id = $1',
    [discountedOrder.data.order.id],
  )
  assert.equal(cancelledDiscount.status, 'cancelled')
  assert.equal((await request('/auth/phone', { body: { phone: '11112222', businessSlug: 'test' } })).data.user.points, 5)
  const redeemableProduct = await request('/partner/rewards', { token: owner.data.token, body: { name: 'Pizza canje', productId: product.id, pointsCost: 3 } })
  assert.equal(redeemableProduct.status, 201)
  assert.equal((await request('/orders', { token, body: { ...orderBody, productRewardId: redeemableProduct.data.reward.id, cashPaymentAmount: 1 } })).status, 400)
  const { rows: [rolledBackReward] } = await db.query('SELECT COUNT(*)::int AS count FROM business_redemptions WHERE reward_id = $1', [redeemableProduct.data.reward.id])
  assert.equal(rolledBackReward.count, 0)
  const productRewardOrder = await request('/orders', { token, body: { ...orderBody, productRewardId: redeemableProduct.data.reward.id } })
  assert.equal(productRewardOrder.status, 201)
  assert.equal(productRewardOrder.data.user.points, 7)
  assert.ok(productRewardOrder.data.order.items.some((item) => item.isReward && item.pointsSpent === 3))
  assert.equal((await request(`/partner/orders/${productRewardOrder.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'cancelled' } })).status, 200)
  const { rows: [cancelledProductReward] } = await db.query(
    'SELECT r.status FROM customer_orders o JOIN business_redemptions r ON r.id = o.product_reward_redemption_id WHERE o.id = $1',
    [productRewardOrder.data.order.id],
  )
  assert.equal(cancelledProductReward.status, 'cancelled')
  assert.equal((await request('/auth/phone', { body: { phone: '11112222', businessSlug: 'test' } })).data.user.points, 5)
  const referredOrder = await request('/orders', { token, body: orderBody })
  assert.equal(referredOrder.status, 201)
  await db.query('UPDATE customer_orders SET referrer_id = $1, referral_points_awarded = 4 WHERE id = $2', [legacy.id, referredOrder.data.order.id])
  assert.equal((await request(`/partner/orders/${referredOrder.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'confirmed' } })).status, 200)
  assert.equal((await request(`/partner/orders/${referredOrder.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'sent' } })).status, 200)
  assert.equal((await request('/auth/phone', { body: { phone: '22223333', businessSlug: 'test' } })).data.user.points, 46)
  assert.equal((await request(`/partner/orders/${referredOrder.data.order.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'cancelled' } })).status, 200)
  assert.equal((await request('/auth/phone', { body: { phone: '22223333', businessSlug: 'test' } })).data.user.points, 42)
  assert.equal((await request('/auth/phone', { body: { phone: '11112222', businessSlug: 'test' } })).data.user.points, 5)
  const { rows: [legacyReward] } = await db.query("INSERT INTO business_rewards (business_id, name, points_cost) VALUES ($1, 'Canje anterior', 3) RETURNING id", [business.id])
  const simultaneousRedemptions = await Promise.all(Array.from({ length: 2 }, () => request('/public/businesses/test/redeem', { token, body: { rewardId: legacyReward.id } })))
  assert.deepEqual(simultaneousRedemptions.map((result) => result.status).sort(), [201, 400])
  const redemption = simultaneousRedemptions.find((result) => result.status === 201)
  assert.equal(redemption.data.points, 2)
  const redemptions = await request('/partner/redemptions', { token: owner.data.token })
  assert.equal(redemptions.status, 200)
  assert.ok(redemptions.data.redemptions.some((item) => item.id === redemption.data.redemption.id && item.status === 'requested'))
  assert.equal((await request('/partner/redemptions/invalid', { method: 'PATCH', token: owner.data.token, body: { status: 'fulfilled' } })).status, 400)
  assert.equal((await request('/partner/redemptions/999999', { method: 'PATCH', token: owner.data.token, body: { status: 'fulfilled' } })).status, 404)
  assert.equal((await request('/public/businesses/test/redeem', { token, body: { rewardId: legacyReward.id } })).status, 400)
  const cancelRedemption = await request(`/partner/redemptions/${redemption.data.redemption.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'cancelled' } })
  assert.equal(cancelRedemption.status, 200)
  assert.equal((await request(`/partner/redemptions/${redemption.data.redemption.id}`, { method: 'PATCH', token: owner.data.token, body: { status: 'cancelled' } })).status, 409)
  assert.equal((await request('/auth/phone', { body: { phone: '11112222', businessSlug: 'test' } })).data.user.points, 5)
  assert.equal((await request(`/partner/category-addons/${addon.data.addon.id}`, { method: 'DELETE', token: owner.data.token })).status, 204)
  assert.equal((await request(`/partner/rewards/${discount.data.reward.id}`, { method: 'DELETE', token: owner.data.token })).status, 204)

  const billingBefore = await request('/partner/billing', { token: owner.data.token })
  assert.equal(billingBefore.data.billing.plan, 'basic')
  assert.equal((await request('/partner/billing/plan', { method: 'PUT', token: owner.data.token, body: { plan: 'invalid' } })).status, 400)
  const vipPlan = await request('/partner/billing/plan', { method: 'PUT', token: owner.data.token, body: { plan: 'vip' } })
  assert.equal(vipPlan.status, 200)
  assert.equal(vipPlan.data.billing.plan, 'vip')
  const basicPlan = await request('/partner/billing/plan', { method: 'PUT', token: owner.data.token, body: { plan: 'basic' } })
  assert.equal(basicPlan.data.billing.plan, 'basic')
  assert.equal((await request('/partner/billing/plan', { method: 'DELETE', token: owner.data.token })).status, 200)
  assert.equal((await request('/partner/billing/checkout', { token: owner.data.token, body: {} })).data.url, 'https://sandbox.example.test/checkout')
  assert.equal((await request('/partner/billing/confirm', { token: owner.data.token, body: { paymentId: 'bad' } })).status, 400)
  assert.equal((await request('/partner/billing/confirm', { token: owner.data.token, body: { paymentId: '102' } })).data.paymentStatus, 'pending')
  assert.equal((await request('/partner/billing/confirm', { token: owner.data.token, body: { paymentId: '104' } })).data.paymentStatus, 'rejected')
  assert.equal((await request('/partner/billing/confirm', { token: owner.data.token, body: { paymentId: '105' } })).data.applied, false)
  assert.equal((await request('/partner/billing/confirm', { token: owner.data.token, body: { paymentId: '103' } })).data.applied, false)
  assert.equal((await request('/partner/billing/confirm', { token: owner.data.token, body: { paymentId: '999' } })).status, 502)
  const paid = await request('/partner/billing/confirm', { token: owner.data.token, body: { paymentId: '101' } })
  assert.equal(paid.data.applied, true)
  assert.equal(paid.data.billing.payments.length, 1)
  const repeated = await request('/partner/billing/confirm', { token: owner.data.token, body: { paymentId: '101' } })
  assert.equal(repeated.data.applied, false)
  assert.equal(repeated.data.billing.dueAt, paid.data.billing.dueAt)
  assert.equal((await request('/billing/webhook', { body: { type: 'payment', data: { id: '101' } } })).status, 200)
  assert.equal((await request('/partner/billing', { token: owner.data.token })).data.billing.payments.length, 1)

  await db.query("UPDATE customers SET role = 'local_owner', business_id = $1 WHERE phone = '11112222'", [business.id])
  assert.equal((await request('/partner/customers', { token })).status, 403)
  assert.equal((await request('/auth/me', { token })).status, 401)
  assert.equal((await request('/admin/local-applications', { token })).status, 403)

  const application = {
    firstName: 'Maria', lastName: 'Lopez', phone: '44445555', email: 'maria@example.test',
    password: 'valid-password', businessName: 'Pizza Nueva', requestedPlan: 'vip',
  }
  const signup = await request('/local-applications', { body: application })
  assert.equal(signup.status, 201)
  assert.equal(signup.data.user.role, 'local_owner')
  assert.equal((await request('/partner/overview', { token: signup.data.token })).status, 200)
  assert.equal((await request('/partner/bonus-days', { method: 'PATCH', token: owner.data.token, body: { days: [] } })).status, 403)
  assert.equal((await request('/partner/bonus-days', { method: 'PATCH', token: signup.data.token, body: { days: [1, 1] } })).status, 400)
  assert.deepEqual((await request('/partner/bonus-days', { method: 'PATCH', token: signup.data.token, body: { days: [] } })).data.bonusPointsDays, [])
  assert.equal((await request('/partner/business/options', { method: 'PATCH', token: signup.data.token, body: { deliveryEnabled: false, addonsEnabled: false } })).status, 400)
  assert.deepEqual((await request('/partner/business/options', { method: 'PATCH', token: signup.data.token, body: { deliveryEnabled: false } })).data.business, { deliveryEnabled: false })
  assert.deepEqual((await request('/partner/business/options', { method: 'PATCH', token: signup.data.token, body: { deliveryEnabled: true } })).data.business, { deliveryEnabled: true })
  assert.equal((await request('/partner/business', { method: 'PATCH', token: signup.data.token, body: {} })).status, 400)
  const profile = await request('/partner/business', { method: 'PATCH', token: signup.data.token, body: {
    name: 'Pizza Nueva', bannerDataUrl: 'data:image/png;base64,AA==',
    primaryColor: '#112233', secondaryColor: '#445566', fontFamily: 'sans',
  } })
  assert.equal(profile.status, 200)
  assert.equal(profile.data.business.primaryColor, '#112233')
  assert.equal((await request('/partner/referrals', { method: 'PATCH', token: signup.data.token, body: { enabled: true, points: 0 } })).status, 400)
  assert.deepEqual((await request('/partner/referrals', { method: 'PATCH', token: signup.data.token, body: { enabled: true, points: 7 } })).data, { referralEnabled: true, referralPoints: 7 })
  const billing = await request('/partner/billing', { token: signup.data.token })
  assert.equal(billing.status, 200)
  assert.equal((await request(`/partner/products/${product.id}`, { method: 'PATCH', token: signup.data.token, body: { name: 'Ajena', category: 'Pizzas', price: 500, pointsPerUnit: 0 } })).status, 400)
  assert.equal((await request('/partner/rewards', { token: signup.data.token, body: productRewardInput })).status, 400)
  assert.equal((await request(`/partner/orders/${second.data.order.id}`, { method: 'PATCH', token: signup.data.token, body: { status: 'cancelled' } })).status, 404)
  assert.equal((await request(`/partner/rewards/${discount.data.reward.id}`, { method: 'PATCH', token: signup.data.token, body: { name: 'Ajena', rewardType: 'discount', discountValue: 100, pointsCost: 1 } })).status, 404)
  assert.equal((await request(`/partner/rewards/${discount.data.reward.id}`, { method: 'DELETE', token: signup.data.token })).status, 404)
  const importedData = { categories: ['Pastas'], products: [{ name: 'Ravioles', category: 'Pastas', price: 1200, pointsPerUnit: 2 }], rewards: [] }
  const imported = await request('/partner/import-catalog', { token: signup.data.token, body: importedData })
  assert.deepEqual(imported.data, { categoriesCreated: 1, productsCreated: 1, productsUpdated: 0, rewardsCreated: 0, rewardsUpdated: 0 })
  const importedAgain = await request('/partner/import-catalog', { token: signup.data.token, body: importedData })
  assert.deepEqual(importedAgain.data, { categoriesCreated: 0, productsCreated: 0, productsUpdated: 1, rewardsCreated: 0, rewardsUpdated: 0 })
  const importedReward = { rewards: [{ name: 'Ravioles gratis', rewardType: 'product', pointsCost: 10, productName: 'Ravioles', productCategory: 'Pastas' }] }
  assert.deepEqual((await request('/partner/import-catalog', { token: signup.data.token, body: importedReward })).data, { categoriesCreated: 0, productsCreated: 0, productsUpdated: 0, rewardsCreated: 1, rewardsUpdated: 0 })
  assert.deepEqual((await request('/partner/import-catalog', { token: signup.data.token, body: importedReward })).data, { categoriesCreated: 0, productsCreated: 0, productsUpdated: 0, rewardsCreated: 0, rewardsUpdated: 1 })
  const invalidImport = await request('/partner/import-catalog', { token: signup.data.token, body: {
    categories: ['Temporal'], products: [{ name: 'Temporal', category: 'Temporal', price: 1500, pointsPerUnit: 1 }],
    rewards: [{ name: 'Faltante', rewardType: 'product', pointsCost: 10, productName: 'No existe', productCategory: 'Temporal' }],
  } })
  assert.equal(invalidImport.status, 400)
  const { rows: [rollback] } = await db.query("SELECT COUNT(*)::int AS count FROM business_categories WHERE business_id = $1 AND name = 'Temporal'", [signup.data.user.businessId])
  assert.equal(rollback.count, 0)
  const uploaded = await trackedFetch(`${base}/partner/business/videos`, {
    method: 'POST', headers: { Authorization: `Bearer ${signup.data.token}`, 'Content-Type': 'video/mp4', 'x-file-name': 'test.mp4' },
    body: Buffer.from('0123456789'),
  })
  assert.equal(uploaded.status, 201)
  const uploadedVideo = await uploaded.json()
  const { rows: [created] } = await db.query(
    `SELECT la.status, la.claimed_at, b.plan, b.slug, b.subscription_due_at,
            EXTRACT(EPOCH FROM (b.subscription_due_at - b.created_at)) AS trial_seconds
     FROM local_applications la JOIN businesses b ON b.id = la.business_id WHERE la.id = $1`,
    [signup.data.applicationId],
  )
  assert.equal(created.status, 'approved')
  assert.ok(created.claimed_at)
  assert.equal(created.plan, 'vip')
  const referralCode = await request(`/public/businesses/${created.slug}/referral-code`, { token: legacyLogin.data.token })
  assert.equal(referralCode.status, 200)
  assert.match(referralCode.data.code, /^[0-9A-F]{10}$/)
  assert.equal((await request(`/public/businesses/${created.slug}/referral-code`, { token: legacyLogin.data.token })).data.code, referralCode.data.code)
  assert.ok(Number(created.trial_seconds) >= 30 * 86400 - 2 && Number(created.trial_seconds) <= 30 * 86400 + 2)
  assert.equal((await request(`/public/businesses/${created.slug}`)).status, 200)
  const videoUrl = `${base}/public/businesses/${created.slug}/videos/${uploadedVideo.video.id}`
  const fullVideo = await trackedFetch(videoUrl)
  assert.equal(fullVideo.status, 200)
  assert.equal(fullVideo.headers.get('content-type'), 'video/mp4')
  assert.equal(fullVideo.headers.get('accept-ranges'), 'bytes')
  assert.equal(await fullVideo.text(), '0123456789')
  const partialVideo = await trackedFetch(`${base}/public/businesses/${created.slug}/videos/${uploadedVideo.video.id}`, { headers: { Range: 'bytes=2-5' } })
  assert.equal(partialVideo.status, 206)
  assert.equal(partialVideo.headers.get('content-range'), 'bytes 2-5/10')
  assert.equal(await partialVideo.text(), '2345')
  const suffixVideo = await trackedFetch(videoUrl, { headers: { Range: 'bytes=-3' } })
  assert.equal(suffixVideo.headers.get('content-range'), 'bytes 7-9/10')
  assert.equal(await suffixVideo.text(), '789')
  for (const range of ['bytes=10-', 'bytes=4-2', 'bytes=1-2,4-5']) {
    const invalidRange = await trackedFetch(videoUrl, { headers: { Range: range } })
    assert.equal(invalidRange.status, 416)
    assert.equal(invalidRange.headers.get('content-range'), 'bytes */10')
  }
  assert.equal((await trackedFetch(`${base}/public/businesses/test/videos/${uploadedVideo.video.id}`)).status, 404)
  assert.equal((await trackedFetch(`${base}/public/businesses/${created.slug}/videos/invalid`)).status, 404)
  assert.equal((await request('/partner/business/videos', { method: 'POST', token: signup.data.token, body: {} })).status, 400)
  assert.equal((await request('/partner/business/videos/invalid', { method: 'DELETE', token: signup.data.token })).status, 400)
  assert.equal((await request(`/partner/business/videos/${uploadedVideo.video.id}`, { method: 'DELETE' })).status, 401)
  assert.equal((await request(`/partner/business/videos/${uploadedVideo.video.id}`, { method: 'DELETE', token: owner.data.token })).status, 404)
  const simultaneousUploads = await Promise.all(Array.from({ length: 5 }, () => trackedFetch(`${base}/partner/business/videos`, {
    method: 'POST', headers: { Authorization: `Bearer ${signup.data.token}`, 'Content-Type': 'video/mp4' },
    body: Buffer.from('video'),
  })))
  assert.deepEqual(simultaneousUploads.map((response) => response.status).sort(), [201, 201, 201, 201, 400])
  const { rows: [videoCount] } = await db.query('SELECT COUNT(*)::int AS count FROM business_videos WHERE business_id = $1', [signup.data.user.businessId])
  assert.equal(videoCount.count, 5)
  assert.equal((await request(`/partner/business/videos/${uploadedVideo.video.id}`, { method: 'DELETE', token: signup.data.token })).status, 204)
  assert.equal((await trackedFetch(`${base}/public/businesses/${created.slug}/videos/${uploadedVideo.video.id}`)).status, 404)
  assert.equal((await request('/auth/login', { body: { identifier: application.email, password: application.password, portal: 'partner' } })).status, 200)
  const { rows: [afterLogin] } = await db.query('SELECT subscription_due_at FROM businesses WHERE id = $1', [signup.data.user.businessId])
  assert.equal(afterLogin.subscription_due_at.getTime(), created.subscription_due_at.getTime())
  const admin = await request('/auth/login', { body: { identifier: 'mariaquintana520@gmail.com', password: 'admin-test-password', portal: 'partner' } })
  assert.equal(admin.status, 200)
  assert.equal(admin.data.user.phone, null)
  const { rows: [adminAccount] } = await db.query("SELECT phone FROM customers WHERE lower(email) = 'mariaquintana520@gmail.com'")
  assert.equal(adminAccount.phone, null)
  assert.equal((await request('/admin/local-applications?status=invalid', { token: admin.data.token })).status, 400)
  const approvedApplications = await request('/admin/local-applications?status=approved', { token: admin.data.token })
  const approvedBusiness = approvedApplications.data.applications.find((item) => item.businessId === signup.data.user.businessId)
  assert.equal(approvedBusiness.currentPlan, 'vip')
  assert.equal((await request('/partner/billing/plan', { method: 'PUT', token: signup.data.token, body: { plan: 'basic' } })).status, 200)
  const updatedApplications = await request('/admin/local-applications?status=approved', { token: admin.data.token })
  const updatedBusiness = updatedApplications.data.applications.find((item) => item.businessId === signup.data.user.businessId)
  assert.equal(updatedBusiness.requestedPlan, 'vip')
  assert.equal(updatedBusiness.currentPlan, 'basic')
  assert.ok((await request('/admin/local-applications?status=all', { token: admin.data.token })).data.applications.some((item) => item.id === signup.data.applicationId))
  const { rows: [pendingApplication] } = await db.query("INSERT INTO local_applications (first_name, last_name, phone, email, business_name, status) VALUES ('Test', 'Admin', '88889999', 'admin-case@example.test', 'Pendiente', 'pending') RETURNING id")
  assert.equal((await request(`/admin/local-applications/${pendingApplication.id}`, { method: 'PATCH', token: admin.data.token, body: { status: 'contacted' } })).status, 200)
  assert.equal((await request(`/admin/local-applications/${pendingApplication.id}`, { method: 'PATCH', token: admin.data.token, body: { status: 'rejected' } })).status, 200)
  assert.equal((await request(`/admin/local-applications/${pendingApplication.id}`, { method: 'PATCH', token: admin.data.token, body: { status: 'approved' } })).status, 409)
  const { rows: [deleteBusiness] } = await db.query("INSERT INTO businesses (name, slug) VALUES ('Eliminar', 'eliminar') RETURNING id")
  assert.equal((await request(`/admin/businesses/${deleteBusiness.id}`, { method: 'DELETE', token: signup.data.token })).status, 403)
  assert.equal((await request(`/admin/businesses/${deleteBusiness.id}`, { method: 'DELETE', token: admin.data.token })).status, 200)
  assert.equal((await request(`/admin/businesses/${deleteBusiness.id}`, { method: 'DELETE', token: admin.data.token })).status, 404)
  assert.equal((await request(`/admin/businesses/${signup.data.user.businessId}/subscription`, { token: signup.data.token, body: { action: 'suspend' } })).status, 403)
  const suspension = await request(`/admin/businesses/${signup.data.user.businessId}/subscription`, { token: admin.data.token, body: { action: 'suspend' } })
  assert.equal(suspension.data.billing.status, 'suspended')
  assert.equal((await request('/partner/products', { token: signup.data.token })).status, 403)
  assert.equal((await request('/partner/billing', { token: signup.data.token })).status, 200)
  assert.equal((await request(`/public/businesses/${created.slug}`)).status, 403)
  assert.equal((await request(`/admin/businesses/${signup.data.user.businessId}/subscription`, { token: admin.data.token, body: { action: 'extend' } })).status, 200)
  assert.equal((await request('/partner/products', { token: signup.data.token })).status, 200)
  assert.equal((await request('/local-applications', { body: application })).status, 409)
  assert.equal((await request('/auth/login', { body: { identifier: application.email, password: 'wrong-password', portal: 'partner' } })).status, 401)

  const oldHash = await bcrypt.hash('legacy-password', 4)
  await db.query("INSERT INTO customers (phone, email, password_hash) VALUES ('55556666', 'legacy@example.test', $1)", [oldHash])
  await db.query("INSERT INTO local_applications (first_name, last_name, phone, email, business_name, requested_plan) VALUES ('Old', 'Owner', '55556666', 'legacy@example.test', 'Local anterior', 'basic')")
  const oldBody = { identifier: 'legacy@example.test', password: 'legacy-password', portal: 'partner' }
  const legacyAttempts = await Promise.all([request('/auth/login', { body: oldBody }), request('/auth/login', { body: oldBody })])
  assert.deepEqual(legacyAttempts.map((attempt) => attempt.status), [200, 200])
  assert.equal(legacyAttempts[0].data.user.businessId, legacyAttempts[1].data.user.businessId)
  const { rows: [oldApplication] } = await db.query("SELECT status, claimed_at, business_id FROM local_applications WHERE phone = '55556666'")
  assert.equal(oldApplication.status, 'approved')
  assert.ok(oldApplication.claimed_at)
  assert.equal(oldApplication.business_id, legacyAttempts[0].data.user.businessId)

  const { rows: [oldBusiness] } = await db.query("INSERT INTO businesses (name, slug, subscription_due_at) VALUES ('Aprobado', 'aprobado', NOW() - INTERVAL '1 year') RETURNING id")
  await db.query("INSERT INTO customers (phone, email, password_hash) VALUES ('77778888', 'approved@example.test', $1)", [oldHash])
  await db.query("INSERT INTO local_applications (first_name, last_name, phone, email, business_name, status, business_id) VALUES ('Old', 'Owner', '77778888', 'approved@example.test', 'Aprobado', 'approved', $1)", [oldBusiness.id])
  const approvedLogin = await request('/auth/login', { body: { identifier: 'approved@example.test', password: 'legacy-password', portal: 'partner' } })
  assert.equal(approvedLogin.status, 200)
  assert.equal(approvedLogin.data.user.businessId, oldBusiness.id)
  const { rows: [oldTrial] } = await db.query('SELECT EXTRACT(EPOCH FROM (subscription_due_at - NOW())) AS remaining FROM businesses WHERE id = $1', [oldBusiness.id])
  assert.ok(Number(oldTrial.remaining) > 30 * 86400 - 10)

  await db.query("INSERT INTO customers (phone, email, password_hash) VALUES ('66667777', 'rejected@example.test', $1)", [oldHash])
  await db.query("INSERT INTO local_applications (first_name, last_name, phone, email, business_name, status) VALUES ('No', 'Owner', '66667777', 'rejected@example.test', 'Rechazado', 'rejected')")
  assert.equal((await request('/auth/login', { body: { identifier: 'rejected@example.test', password: 'legacy-password', portal: 'partner' } })).status, 403)
  assertApiCoverage(responses)
})
