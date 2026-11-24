import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { test } from 'node:test'
import bcrypt from 'bcryptjs'
import pg from 'pg'
import { businessSlug, slugMatchesBusinessName } from '../src/modules/businesses/business.rules.js'

test('store slugs normalize names and retain their unique suffix', () => {
  assert.equal(businessSlug('  Café & Pizzas  ', '-12'), 'cafe-pizzas-12')
  assert.equal(businessSlug('🍕', '-12'), 'local-12')
  assert.equal(businessSlug('a'.repeat(120), '-12'), `${'a'.repeat(117)}-12`)
})

test('store links match normalized names and existing numeric suffixes', () => {
  assert.equal(slugMatchesBusinessName('Café 10', 'cafe-10-25'), true)
  assert.equal(slugMatchesBusinessName('Café 10', 'cafe-10-25-2'), true)
  assert.equal(slugMatchesBusinessName('Café 10', 'cafe-10'), true)
  assert.equal(slugMatchesBusinessName('Café Nuevo', 'cafe-viejo-25'), false)
})

test('renaming a store changes its link without affecting other stores', { skip: !process.env.TEST_DATABASE_URL, timeout: 60000 }, async (t) => {
  const databaseUrl = process.env.TEST_DATABASE_URL
  const schema = `slug_test_${randomBytes(8).toString('hex')}`
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
  const socket = createServer()
  socket.listen(0, '127.0.0.1')
  await once(socket, 'listening')
  const port = socket.address().port
  await new Promise((resolve) => socket.close(resolve))
  server = spawn(process.execPath, ['server.js'], {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, DATABASE_URL: databaseUrl, PGOPTIONS: `-c search_path=${schema}`, PGSSL: 'false',
      JWT_SECRET: 'test-secret-with-at-least-32-characters', ADMIN_PASSWORD_1: 'admin-test-password', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  server.stdout.on('data', (data) => { output += data })
  server.stderr.on('data', (data) => { output += data })
  const base = `http://127.0.0.1:${port}/api`
  async function request(path, { token, body, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: response.status, data: await response.json() }
  }
  let ready = false
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(`Backend exited: ${output}`)
    try { await request('/health'); ready = true; break } catch { await new Promise((resolve) => setTimeout(resolve, 200)) }
  }
  assert.ok(ready, `Backend did not start: ${output}`)
  const { rows: [business] } = await db.query("INSERT INTO businesses (name, slug) VALUES ('Nombre anterior', 'enlace-anterior') RETURNING id")
  const { rows: [linkedApplication] } = await db.query(
    "INSERT INTO local_applications (first_name, last_name, phone, business_name, business_id, status) VALUES ('Test', 'Dueño', '1234567890', 'Nombre original', $1, 'approved') RETURNING id",
    [business.id],
  )
  const { rows: [pendingApplication] } = await db.query(
    "INSERT INTO local_applications (first_name, last_name, phone, business_name, status) VALUES ('Test', 'Pendiente', '2345678901', 'Local pendiente', 'pending') RETURNING id",
  )
  const hash = await bcrypt.hash('owner-password', 4)
  await db.query("INSERT INTO customers (phone, email, password_hash, role, business_id) VALUES ('1234567890', 'slug-owner@example.test', $1, 'local_owner', $2)", [hash, business.id])
  await db.query("INSERT INTO business_products (business_id, name, category, price) VALUES ($1, 'Pizza', 'Pizzas', 100)", [business.id])
  await db.query("INSERT INTO businesses (name, slug) VALUES ('Otro', $1)", [`cafe-nuevo-${business.id}`])
  const login = await request('/auth/login', { body: { identifier: 'slug-owner@example.test', password: 'owner-password', portal: 'partner' } })
  assert.equal(login.status, 200)
  const token = login.data.token
  const admin = await request('/auth/login', { body: { identifier: 'mariaquintana520@gmail.com', password: 'admin-test-password', portal: 'partner' } })
  assert.equal(admin.status, 200)
  const applications = async (status) => (await request(`/admin/local-applications?status=${status}`, { token: admin.data.token })).data.applications
  assert.equal((await applications('approved')).find((item) => item.id === linkedApplication.id).businessName, 'Nombre anterior')
  assert.equal((await applications('pending')).find((item) => item.id === pendingApplication.id).businessName, 'Local pendiente')
  const profile = { name: 'Nombre anterior', bannerDataUrl: 'data:image/png;base64,AA==', primaryColor: '#112233', secondaryColor: '#445566', fontFamily: 'sans' }
  const update = (body) => request('/partner/business', { method: 'PATCH', token, body })
  assert.equal((await update(profile)).data.business.slug, 'enlace-anterior')
  await db.query("UPDATE businesses SET slug = 'nombre-anterior-987' WHERE id = $1", [business.id])
  assert.equal((await request('/partner/overview', { token })).data.business.slug, 'nombre-anterior-987')
  await db.query("UPDATE businesses SET slug = 'enlace-anterior' WHERE id = $1", [business.id])
  await db.query("INSERT INTO businesses (name, slug) VALUES ('Otro enlace', $1)", [`nombre-anterior-${business.id}`])
  const overviews = await Promise.all([request('/partner/overview', { token }), request('/partner/overview', { token })])
  for (const overview of overviews) {
    assert.equal(overview.status, 200)
    assert.equal(overview.data.business.slug, `nombre-anterior-${business.id}-2`)
  }
  assert.equal(overviews.filter((overview) => overview.data.business.slugUpdated).length, 1)
  assert.equal((await request('/public/businesses/enlace-anterior')).status, 404)
  assert.equal((await request(`/public/businesses/${overviews[0].data.business.slug}`)).data.business.name, profile.name)
  assert.equal((await request('/partner/overview', { token })).data.business.slug, overviews[0].data.business.slug)
  assert.equal((await update(profile)).data.business.slug, overviews[0].data.business.slug)
  const renamed = await update({ ...profile, name: 'Café Nuevo' })
  assert.equal(renamed.status, 200)
  assert.equal((await applications('approved')).find((item) => item.id === linkedApplication.id).businessName, 'Café Nuevo')
  const { rows: [originalApplication] } = await db.query('SELECT business_name FROM local_applications WHERE id = $1', [linkedApplication.id])
  assert.equal(originalApplication.business_name, 'Nombre original')
  assert.equal(renamed.data.business.slug, `cafe-nuevo-${business.id}-2`)
  assert.equal((await request('/public/businesses/enlace-anterior')).status, 404)
  const storefront = await request(`/public/businesses/${renamed.data.business.slug}`)
  assert.equal(storefront.status, 200)
  assert.equal(storefront.data.business.name, 'Café Nuevo')
  assert.equal(storefront.data.products[0].name, 'Pizza')
  assert.equal((await request(`/public/businesses/cafe-nuevo-${business.id}`)).data.business.name, 'Otro')
  assert.equal((await update({ ...profile, name: 'Café Nuevo' })).data.business.slug, renamed.data.business.slug)
  assert.equal((await request('/partner/overview', { token })).data.business.slug, renamed.data.business.slug)
  await db.query("INSERT INTO customers (phone, password_hash) VALUES ('87654321', $1)", [hash])
  assert.equal((await update({ ...profile, name: 'Otro nombre', whatsapp: '87654321' })).status, 409)
  assert.equal((await request('/partner/overview', { token })).data.business.slug, renamed.data.business.slug)
})
