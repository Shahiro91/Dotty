import bcrypt from 'bcryptjs'
import cors from 'cors'
import 'dotenv/config'
import express from 'express'
import jwt from 'jsonwebtoken'
import pg from 'pg'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { menuItems } from '../FrontEnd/src/data/menu.js'

const publicCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generatePublicCode() {
  const group = () => Array.from({ length: 4 }, () => publicCodeAlphabet[randomInt(publicCodeAlphabet.length)]).join('')
  return `${group()}-${group()}-${group()}`
}

const { Pool } = pg
const app = express()
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
})
const menuById = new Map(menuItems.map((item) => [item.id, item]))
const administratorAccounts = [
  { phone: '1133113604', email: 'mariaquintana520@gmail.com', password: process.env.ADMIN_PASSWORD_2 },
]
const businessFontFamilies = new Set(['original', 'sans', 'serif', 'rounded', 'mono'])

if (!process.env.DATABASE_URL) throw new Error('Falta configurar DATABASE_URL en Backend/.env')
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres')
}

// En Render, RENDER_EXTERNAL_URL es la URL pública del servicio (frontend y API comparten dominio).
const publicOrigin = process.env.FRONTEND_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173'
app.use(cors({ origin: publicOrigin }))
app.use(express.json({ limit: '5mb' }))

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(120) NOT NULL UNIQUE,
      plan VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'vip')),
      description TEXT NOT NULL DEFAULT '',
      logo_data_url TEXT NOT NULL DEFAULT '',
      logo_scale REAL NOT NULL DEFAULT 1,
      banner_data_url TEXT NOT NULL DEFAULT '',
      primary_color VARCHAR(7) NOT NULL DEFAULT '#c95031',
      secondary_color VARCHAR(7) NOT NULL DEFAULT '#58705e',
      font_family VARCHAR(20) NOT NULL DEFAULT 'original',
      address VARCHAR(200) NOT NULL DEFAULT '',
      opening_hours VARCHAR(160) NOT NULL DEFAULT '',
      whatsapp VARCHAR(20) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS banner_data_url TEXT NOT NULL DEFAULT '';
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS logo_scale REAL NOT NULL DEFAULT 1;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS primary_color VARCHAR(7) NOT NULL DEFAULT '#c95031';
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS secondary_color VARCHAR(7) NOT NULL DEFAULT '#58705e';
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS font_family VARCHAR(20) NOT NULL DEFAULT 'original';
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS bonus_points_days SMALLINT[] NOT NULL DEFAULT '{}'::SMALLINT[];
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS referral_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS referral_points INTEGER NOT NULL DEFAULT 0 CHECK (referral_points >= 0);
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS delivery_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS addons_enabled BOOLEAN NOT NULL DEFAULT TRUE;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS orders_shift_started_at TIMESTAMPTZ;
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS subscription_due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month');
    CREATE TABLE IF NOT EXISTS subscription_payments (
      id BIGSERIAL PRIMARY KEY,
      business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      mp_payment_id VARCHAR(40) NOT NULL UNIQUE,
      plan VARCHAR(20) NOT NULL,
      amount NUMERIC(12, 2) NOT NULL,
      period_end TIMESTAMPTZ,
      paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customers (
      id BIGSERIAL PRIMARY KEY,
      first_name VARCHAR(60) NOT NULL DEFAULT '',
      last_name VARCHAR(60) NOT NULL DEFAULT '',
      phone VARCHAR(16) NOT NULL UNIQUE,
      email VARCHAR(254) UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'local_owner', 'admin')),
      business_name VARCHAR(100),
      business_id BIGINT REFERENCES businesses(id),
      points INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS first_name VARCHAR(60) NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_name VARCHAR(60) NOT NULL DEFAULT '';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(254);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'local_owner', 'admin'));
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_name VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_id BIGINT REFERENCES businesses(id);
    ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_points_check;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12);
    CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_idx ON customers (lower(email)) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS customers_referral_code_idx ON customers (referral_code) WHERE referral_code IS NOT NULL;
    CREATE TABLE IF NOT EXISTS business_products (
      id BIGSERIAL PRIMARY KEY,
      business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      category VARCHAR(60) NOT NULL DEFAULT 'General',
      price INTEGER NOT NULL CHECK (price > 0),
      points_per_unit INTEGER NOT NULL DEFAULT 0 CHECK (points_per_unit >= 0),
      image_data_url TEXT NOT NULL DEFAULT '',
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE business_products ADD COLUMN IF NOT EXISTS image_scale REAL NOT NULL DEFAULT 1;
    ALTER TABLE business_products ADD COLUMN IF NOT EXISTS image_position_x REAL NOT NULL DEFAULT 50;
    ALTER TABLE business_products ADD COLUMN IF NOT EXISTS image_position_y REAL NOT NULL DEFAULT 50;
    CREATE TABLE IF NOT EXISTS business_categories (
      id BIGSERIAL PRIMARY KEY,
      business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name VARCHAR(60) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, name)
    );
    CREATE TABLE IF NOT EXISTS business_category_addons (
      id BIGSERIAL PRIMARY KEY,
      business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      category_id BIGINT NOT NULL REFERENCES business_categories(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL,
      price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS business_category_addons_active_idx ON business_category_addons (business_id, category_id, is_available);
    CREATE UNIQUE INDEX IF NOT EXISTS business_category_addons_name_idx ON business_category_addons (category_id, lower(name));
    CREATE TABLE IF NOT EXISTS business_rewards (
      id BIGSERIAL PRIMARY KEY,
      business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      image_data_url TEXT NOT NULL DEFAULT '',
      reward_type VARCHAR(20) NOT NULL DEFAULT 'product' CHECK (reward_type IN ('product', 'discount')),
      product_id BIGINT REFERENCES business_products(id) ON DELETE SET NULL,
      discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percentage')),
      discount_value INTEGER NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
      points_cost INTEGER NOT NULL CHECK (points_cost > 0),
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE business_rewards ADD COLUMN IF NOT EXISTS image_data_url TEXT NOT NULL DEFAULT '';
    ALTER TABLE business_rewards ADD COLUMN IF NOT EXISTS reward_type VARCHAR(20) NOT NULL DEFAULT 'product';
    ALTER TABLE business_rewards ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES business_products(id) ON DELETE SET NULL;
    ALTER TABLE business_rewards ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed';
    ALTER TABLE business_rewards ADD COLUMN IF NOT EXISTS discount_value INTEGER NOT NULL DEFAULT 0;
    CREATE TABLE IF NOT EXISTS business_redemptions (
      id BIGSERIAL PRIMARY KEY,
      business_id BIGINT NOT NULL REFERENCES businesses(id),
      customer_id BIGINT NOT NULL REFERENCES customers(id),
      reward_id BIGINT NOT NULL REFERENCES business_rewards(id),
      points_spent INTEGER NOT NULL CHECK (points_spent > 0),
      status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'fulfilled', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS customer_orders (
      id BIGSERIAL PRIMARY KEY,
      customer_id BIGINT NOT NULL REFERENCES customers(id),
      business_id BIGINT REFERENCES businesses(id),
      total INTEGER NOT NULL CHECK (total > 0),
      subtotal INTEGER NOT NULL DEFAULT 0,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      discount_name VARCHAR(100) NOT NULL DEFAULT '',
      discount_points_spent INTEGER NOT NULL DEFAULT 0,
      discount_redemption_id BIGINT REFERENCES business_redemptions(id),
      product_reward_name VARCHAR(100) NOT NULL DEFAULT '',
      product_reward_points_spent INTEGER NOT NULL DEFAULT 0,
      product_reward_redemption_id BIGINT REFERENCES business_redemptions(id),
      points_awarded INTEGER NOT NULL CHECK (points_awarded >= 0),
      items JSONB NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'in_process' CHECK (status IN ('in_process', 'sent', 'cancelled')),
      status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS business_id BIGINT REFERENCES businesses(id);
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'in_process' CHECK (status IN ('in_process', 'sent', 'cancelled'));
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS subtotal INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS discount_amount INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS discount_name VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS discount_points_spent INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS discount_redemption_id BIGINT REFERENCES business_redemptions(id);
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS product_reward_name VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS product_reward_points_spent INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS product_reward_redemption_id BIGINT REFERENCES business_redemptions(id);
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_address VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS fulfillment_type VARCHAR(20) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS public_code VARCHAR(20);
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_reference VARCHAR(200) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS cash_payment_amount INTEGER;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_lat DOUBLE PRECISION;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_lng DOUBLE PRECISION;
    CREATE UNIQUE INDEX IF NOT EXISTS customer_orders_public_code_idx ON customer_orders (public_code) WHERE public_code IS NOT NULL;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS referrer_id BIGINT REFERENCES customers(id);
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS referral_points_awarded INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS referral_credited BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_notes VARCHAR(300) NOT NULL DEFAULT '';
    UPDATE customer_orders SET subtotal = total WHERE subtotal = 0 AND discount_amount = 0 AND total > 0;
    ALTER TABLE customer_orders DROP CONSTRAINT IF EXISTS customer_orders_total_check;
    ALTER TABLE customer_orders ADD CONSTRAINT customer_orders_total_check CHECK (total >= 0);
    CREATE INDEX IF NOT EXISTS customer_orders_business_status_idx ON customer_orders (business_id, status, created_at DESC);
    CREATE TABLE IF NOT EXISTS customer_business_points (
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      points INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (customer_id, business_id)
    );
    INSERT INTO customer_business_points (customer_id, business_id, points)
    SELECT customer_id, business_id, SUM(delta)::INTEGER FROM (
      SELECT customer_id, business_id,
             points_awarded - discount_points_spent - product_reward_points_spent AS delta
      FROM customer_orders WHERE business_id IS NOT NULL AND status <> 'cancelled'
      UNION ALL
      SELECT r.customer_id, r.business_id, -r.points_spent
      FROM business_redemptions r
      WHERE r.status <> 'cancelled' AND NOT EXISTS (
        SELECT 1 FROM customer_orders o
        WHERE o.discount_redemption_id = r.id OR o.product_reward_redemption_id = r.id
      )
    ) movements GROUP BY customer_id, business_id
    ON CONFLICT (customer_id, business_id) DO NOTHING;
    CREATE TABLE IF NOT EXISTS local_applications (
      id BIGSERIAL PRIMARY KEY,
      first_name VARCHAR(60) NOT NULL,
      last_name VARCHAR(60) NOT NULL,
      phone VARCHAR(16) NOT NULL,
      email VARCHAR(254),
      business_name VARCHAR(100) NOT NULL,
      requested_plan VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (requested_plan IN ('basic', 'vip')),
      business_id BIGINT REFERENCES businesses(id),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'approved', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE local_applications ADD COLUMN IF NOT EXISTS requested_plan VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (requested_plan IN ('basic', 'vip'));
    ALTER TABLE local_applications ADD COLUMN IF NOT EXISTS email VARCHAR(254);
    ALTER TABLE local_applications ADD COLUMN IF NOT EXISTS business_id BIGINT REFERENCES businesses(id);
    ALTER TABLE local_applications ADD COLUMN IF NOT EXISTS activation_code_hash VARCHAR(64);
    ALTER TABLE local_applications ADD COLUMN IF NOT EXISTS activation_expires_at TIMESTAMPTZ;
    ALTER TABLE local_applications ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
    CREATE UNIQUE INDEX IF NOT EXISTS local_applications_email_unique_idx ON local_applications (lower(email)) WHERE email IS NOT NULL AND status IN ('pending', 'contacted', 'approved');
    UPDATE local_applications la SET claimed_at = NOW()
     WHERE status = 'approved' AND claimed_at IS NULL
       AND EXISTS (SELECT 1 FROM customers c WHERE c.business_id = la.business_id AND c.role = 'local_owner');
  `)

  await pool.query(
    `INSERT INTO business_categories (business_id, name)
    SELECT DISTINCT business_id, category FROM business_products WHERE is_available = TRUE
     ON CONFLICT (business_id, name) DO NOTHING`,
  )

  const { rows: approvedApplications } = await pool.query(
    `SELECT id, phone, business_name, requested_plan
     FROM local_applications WHERE status = 'approved' AND business_id IS NULL`,
  )
  for (const application of approvedApplications) {
    const businessSlug = `${application.business_name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'local'}-${application.id}`.slice(0, 120)
    const { rows: businesses } = await pool.query(
      `INSERT INTO businesses (name, slug, plan, subscription_due_at) VALUES ($1, $2, $3, NOW())
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [application.business_name, businessSlug, application.requested_plan],
    )
    const businessId = businesses[0].id
    await pool.query('UPDATE local_applications SET business_id = $1 WHERE id = $2', [businessId, application.id])
  }

  for (const [index, administrator] of administratorAccounts.entries()) {
    if (!administrator.password) {
      console.warn(`ADMIN_PASSWORD_${index + 1} no está configurada; no se aprovisionó ese administrador.`)
      continue
    }
    if (administrator.password.length < 8 || administrator.password.length > 72) {
      throw new Error(`ADMIN_PASSWORD_${index + 1} debe tener entre 8 y 72 caracteres.`)
    }

    const passwordHash = await bcrypt.hash(administrator.password, 12)
    await pool.query(
      `INSERT INTO customers (first_name, last_name, phone, email, password_hash, role)
       VALUES ('Administrador', 'Dotty', $1, $2, $3, 'admin')
       ON CONFLICT (phone) DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = 'admin'`,
      [administrator.phone, administrator.email, passwordHash],
    )
  }
}

async function lockPoints(client, customerId, businessId) {
  await client.query(
    'INSERT INTO customer_business_points (customer_id, business_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [customerId, businessId],
  )
  const { rows } = await client.query(
    'SELECT points FROM customer_business_points WHERE customer_id = $1 AND business_id = $2 FOR UPDATE',
    [customerId, businessId],
  )
  return rows[0].points
}

async function adjustPoints(client, customerId, businessId, delta) {
  const { rows } = await client.query(
    `INSERT INTO customer_business_points (customer_id, business_id, points) VALUES ($1, $2, $3)
     ON CONFLICT (customer_id, business_id) DO UPDATE SET points = customer_business_points.points + EXCLUDED.points
     RETURNING points`,
    [customerId, businessId, delta],
  )
  return rows[0].points
}

async function getBusinessPoints(customerId, businessSlug) {
  if (typeof businessSlug !== 'string' || !businessSlug) return 0
  const { rows } = await pool.query(
    `SELECT p.points FROM customer_business_points p JOIN businesses b ON b.id = p.business_id
     WHERE p.customer_id = $1 AND b.slug = $2`,
    [customerId, businessSlug],
  )
  return rows[0]?.points ?? 0
}

function publicCustomer(customer, points = 0) {
  return {
    id: customer.id,
    firstName: customer.first_name || '',
    lastName: customer.last_name || '',
    role: customer.role || 'customer',
    businessName: customer.business_name || '',
    businessId: customer.business_id || null,
    phone: customer.phone,
    points,
  }
}

function createToken(customer) {
  return jwt.sign({ sub: String(customer.id) }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

function normalizePhone(value) {
  return typeof value === 'string' ? value.replace(/[\s()-]/g, '') : ''
}

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

const ACTIVATION_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateActivationCode() {
  const bytes = randomBytes(8)
  const chars = Array.from(bytes, (byte) => ACTIVATION_ALPHABET[byte % ACTIVATION_ALPHABET.length]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4)}`
}

function activationHash(code) {
  return createHash('sha256').update(String(code).toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex')
}

function activationExpiry() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
}

const rateBuckets = new Map()

function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const now = Date.now()
    const key = `${name}:${req.ip}`
    const bucket = rateBuckets.get(key)
    if (!bucket || bucket.resetAt < now) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }
    if (bucket.count >= max) {
      return res.status(429).json({ error: 'Demasiados intentos. Probá de nuevo en unos minutos.' })
    }
    bucket.count += 1
    next()
  }
}

setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateBuckets) if (bucket.resetAt < now) rateBuckets.delete(key)
}, 10 * 60_000).unref()

function getBuenosAiresWeekday() {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
  }).format(new Date())
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday]
}

function hasDoublePointsToday(plan, days) {
  return plan === 'vip' && days.includes(getBuenosAiresWeekday())
}

function authenticate(req, res, next) {
  const authorization = req.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  try {
    req.customerId = jwt.verify(token, process.env.JWT_SECRET).sub
    next()
  } catch {
    res.status(401).json({ error: 'Tu sesión venció. Ingresá nuevamente.' })
  }
}

async function requireAdmin(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT role FROM customers WHERE id = $1', [req.customerId])
    if (rows[0]?.role !== 'admin') {
      return res.status(403).json({ error: 'No tenés permiso para acceder a esta sección.' })
    }
    next()
  } catch (error) {
    next(error)
  }
}

const PLAN_PRICES = { basic: 15000, vip: 25000 }
const PLAN_LABELS = { basic: 'Básico', vip: 'VIP' }
const BILLING_INITIAL_TRIAL_DAYS = 7
const BILLING_GRACE_DAYS = 5
const BILLING_PAY_WINDOW_DAYS = 10
const DAY_MS = 24 * 60 * 60 * 1000
const SUSPENDED_MESSAGE = 'Tu cuenta está suspendida por falta de pago. Regularizá tu suscripción para volver a usarla.'
const MP_ENVIRONMENT = process.env.MP_ENVIRONMENT || 'sandbox'

function mercadoPagoConfigurationMessage() {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!['sandbox', 'production'].includes(MP_ENVIRONMENT)) {
    return 'MP_ENVIRONMENT debe ser sandbox o production.'
  }
  if (!accessToken) {
    return 'Los pagos online estarán disponibles próximamente.'
  }
  if (MP_ENVIRONMENT === 'sandbox' && !accessToken.startsWith('TEST-') && mercadoPagoAccountIsTest !== true) {
    return mercadoPagoAccountIsTest === null
      ? 'Verificando el Access Token de Mercado Pago, probá de nuevo en unos segundos.'
      : 'El backend está en modo sandbox y requiere credenciales de una cuenta de prueba de Mercado Pago.'
  }
  if (MP_ENVIRONMENT === 'production' && !accessToken.startsWith('APP_USR-')) {
    return 'El backend está en modo producción y requiere un Access Token de producción (APP_USR-...).'
  }
  return ''
}

// Las credenciales de prueba actuales también empiezan con APP_USR-, así que se confirma el tipo de cuenta con Mercado Pago.
let mercadoPagoAccountIsTest = null
if (MP_ENVIRONMENT === 'sandbox' && process.env.MP_ACCESS_TOKEN) {
  fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } })
    .then((response) => response.json())
    .then((account) => { mercadoPagoAccountIsTest = Array.isArray(account.tags) && account.tags.includes('test_user') })
    .catch(() => { mercadoPagoAccountIsTest = false })
}

function describeBilling({ plan, subscriptionDueAt }, now = new Date(), graceDays = BILLING_GRACE_DAYS) {
  const dueAt = new Date(subscriptionDueAt)
  const graceEndsAt = new Date(dueAt.getTime() + graceDays * DAY_MS)
  const status = now <= dueAt ? 'active' : now <= graceEndsAt ? 'grace' : 'suspended'
  return {
    plan,
    planLabel: PLAN_LABELS[plan],
    price: PLAN_PRICES[plan],
    dueAt: dueAt.toISOString(),
    graceEndsAt: graceEndsAt.toISOString(),
    status,
    canPay: dueAt.getTime() - now.getTime() <= BILLING_PAY_WINDOW_DAYS * DAY_MS,
  }
}

async function loadBilling(businessId) {
  const { rows } = await pool.query('SELECT plan, subscription_due_at AS "subscriptionDueAt" FROM businesses WHERE id = $1', [businessId])
  if (!rows[0]) return null
  const { rows: payments } = await pool.query(
    `SELECT id, plan, amount::float AS amount, period_end AS "periodEnd", paid_at AS "paidAt"
     FROM subscription_payments WHERE business_id = $1 ORDER BY paid_at DESC LIMIT 12`,
    [businessId],
  )
  const requiresInitialPayment = false
  const initialTrial = payments.length === 0
  const details = describeBilling(rows[0], new Date(), initialTrial ? 0 : BILLING_GRACE_DAYS)
  return {
    ...details,
    requiresInitialPayment,
    initialTrial,
    canPay: initialTrial || details.canPay,
    payments,
    paymentsConfigured: !mercadoPagoConfigurationMessage(),
    paymentConfigurationMessage: mercadoPagoConfigurationMessage(),
  }
}

async function mercadoPagoRequest(path, options = {}) {
  const configurationMessage = mercadoPagoConfigurationMessage()
  if (configurationMessage) {
    const error = new Error(configurationMessage)
    error.status = 503
    throw error
  }
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...options.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || 'Mercado Pago rechazó la solicitud.')
    error.status = response.status
    throw error
  }
  return data
}

// Se consulta el pago directamente a Mercado Pago: nunca se confía en lo que llega del cliente o del webhook.
async function applySubscriptionPayment(paymentId) {
  const payment = await mercadoPagoRequest(`/v1/payments/${encodeURIComponent(paymentId)}`)
  const match = /^sabor-vivo-business-(\d+)$/.exec(payment.external_reference || '')
  if (!match || payment.status !== 'approved') return { applied: false, status: payment.status }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT plan FROM businesses WHERE id = $1 FOR UPDATE', [match[1]])
    if (!rows[0] || Number(payment.transaction_amount) < PLAN_PRICES[rows[0].plan]) {
      await client.query('ROLLBACK')
      return { applied: false, status: 'invalid' }
    }
    const inserted = await client.query(
      `INSERT INTO subscription_payments (business_id, mp_payment_id, plan, amount)
       VALUES ($1, $2, $3, $4) ON CONFLICT (mp_payment_id) DO NOTHING RETURNING id`,
      [match[1], String(payment.id), rows[0].plan, payment.transaction_amount],
    )
    if (inserted.rowCount) {
      const { rows: updated } = await client.query(
        `UPDATE businesses
         SET subscription_due_at = (CASE WHEN subscription_due_at + make_interval(days => $2) < NOW() THEN NOW() ELSE subscription_due_at END) + INTERVAL '1 month'
         WHERE id = $1 RETURNING subscription_due_at`,
        [match[1], BILLING_GRACE_DAYS],
      )
      await client.query('UPDATE subscription_payments SET period_end = $1 WHERE id = $2', [updated[0].subscription_due_at, inserted.rows[0].id])
    }
    await client.query('COMMIT')
    return { applied: Boolean(inserted.rowCount), businessId: match[1] }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

function partnerGuard({ allowSuspended }) {
  return async function guard(req, res, next) {
    try {
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
      if (!allowSuspended && describeBilling(rows[0], new Date(), rows[0].hasPaidSubscription ? BILLING_GRACE_DAYS : 0).status === 'suspended') {
        return res.status(403).json({ error: SUSPENDED_MESSAGE, code: 'subscription_suspended' })
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}

const requirePartner = partnerGuard({ allowSuspended: false })
const requirePartnerBilling = partnerGuard({ allowSuspended: true })

async function isBusinessSuspended(queryable, businessId) {
  const { rows } = await queryable.query(
    `SELECT plan, subscription_due_at AS "subscriptionDueAt",
            EXISTS (SELECT 1 FROM subscription_payments sp WHERE sp.business_id = businesses.id) AS "hasPaidSubscription"
     FROM businesses WHERE id = $1`,
    [businessId],
  )
  return rows[0] ? describeBilling(rows[0], new Date(), rows[0].hasPaidSubscription ? BILLING_GRACE_DAYS : 0).status === 'suspended' : false
}

async function requireVip(req, res, next) {
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

async function requireCustomer(req, res, next) {
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

function isValidImageDataUrl(value) {
  return typeof value === 'string'
    && value.length <= 3_000_000
    && (value === '' || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(value))
}

function isValidHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
}

function readProductInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const category = typeof body?.category === 'string' ? body.category.trim() : ''
  const price = Number(body?.price)
  const pointsPerUnit = Number(body?.pointsPerUnit)
  const imageDataUrl = body?.imageDataUrl ?? ''
  const imageScale = Number(body?.imageScale ?? 1)
  const imagePositionX = Number(body?.imagePositionX ?? 50)
  const imagePositionY = Number(body?.imagePositionY ?? 50)
  if (!name || name.length > 100 || description.length > 500 || !category || category.length > 60
    || !Number.isSafeInteger(price) || price < 1 || price > 100_000_000
    || !Number.isSafeInteger(pointsPerUnit) || pointsPerUnit < 0 || pointsPerUnit > 1_000_000
    || !Number.isFinite(imageScale) || imageScale < 1 || imageScale > 3
    || !Number.isFinite(imagePositionX) || imagePositionX < 0 || imagePositionX > 100
    || !Number.isFinite(imagePositionY) || imagePositionY < 0 || imagePositionY > 100
    || !isValidImageDataUrl(imageDataUrl)) return null
  return { name, description, category, price, pointsPerUnit, imageDataUrl, imageScale, imagePositionX, imagePositionY }
}

function readRewardInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const imageDataUrl = body?.imageDataUrl ?? ''
  const rewardType = body?.rewardType ?? 'product'
  const productId = body?.productId == null || body.productId === '' ? null : Number(body.productId)
  const discountType = body?.discountType ?? 'fixed'
  const discountValue = Number(body?.discountValue ?? 0)
  const pointsCost = Number(body?.pointsCost)
  if (!name || name.length > 100 || description.length > 500
    || !Number.isSafeInteger(pointsCost) || pointsCost < 1 || pointsCost > 1_000_000
    || !isValidImageDataUrl(imageDataUrl)
    || !['product', 'discount'].includes(rewardType)
    || (productId !== null && (!Number.isSafeInteger(productId) || productId < 1))
    || (rewardType === 'discount' && productId !== null)
    || !['fixed', 'percentage'].includes(discountType)
    || !Number.isSafeInteger(discountValue) || discountValue < 0 || discountValue > 100_000_000
    || (rewardType === 'discount' && (discountValue < 1 || (discountType === 'percentage' && discountValue > 100)))) return null
  return { name, description, imageDataUrl, rewardType, productId, discountType, discountValue, pointsCost }
}

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ status: 'ok' })
})

app.get('/api/public/businesses/:slug', async (req, res, next) => {
  try {
    const { rows: businesses } = await pool.query(
            `SELECT id, name, slug, plan, description, logo_data_url AS "logoDataUrl",
              logo_scale AS "logoScale", font_family AS "fontFamily",
              bonus_points_days AS "bonusPointsDays",
              referral_enabled AS "referralEnabled", referral_points AS "referralPoints",
              delivery_enabled AS "deliveryEnabled", addons_enabled AS "addonsEnabled",
              banner_data_url AS "bannerDataUrl", primary_color AS "primaryColor",
              secondary_color AS "secondaryColor", address, opening_hours AS "openingHours", whatsapp,
              subscription_due_at AS "subscriptionDueAt"
       FROM businesses WHERE slug = $1`,
      [req.params.slug],
    )
    const business = businesses[0]
    if (!business) return res.status(404).json({ error: 'No encontramos ese local.' })
    if (describeBilling(business).status === 'suspended') {
      return res.status(403).json({ error: 'Este local no está disponible por el momento.', code: 'store_unavailable' })
    }
    delete business.subscriptionDueAt
    business.bonusPointsActiveToday = hasDoublePointsToday(business.plan, business.bonusPointsDays)
    const [products, rewards, addons, bestSellers] = await Promise.all([
      pool.query(
        `SELECT id, name, description, category, price,
          points_per_unit AS "pointsPerUnit", image_data_url AS "imageDataUrl",
                image_scale AS "imageScale", image_position_x AS "imagePositionX",
                image_position_y AS "imagePositionY"
         FROM business_products WHERE business_id = $1 AND is_available = TRUE ORDER BY category, name`,
        [business.id],
      ),
      pool.query(
        `SELECT r.id, r.name, r.description, r.image_data_url AS "imageDataUrl",
                r.reward_type AS "rewardType", r.product_id AS "productId",
                r.discount_type AS "discountType", r.discount_value AS "discountValue",
                r.points_cost AS "pointsCost", p.name AS "productName", p.category AS "productCategory", p.price AS "productPrice",
                p.image_data_url AS "productImageDataUrl"
         FROM business_rewards r LEFT JOIN business_products p ON p.id = r.product_id AND p.business_id = r.business_id AND p.is_available = TRUE
         WHERE r.business_id = $1 AND r.is_available = TRUE AND (r.product_id IS NULL OR p.id IS NOT NULL)
         ORDER BY r.points_cost`,
        [business.id],
      ),
      pool.query(
        `SELECT c.name AS category, a.id, a.name, a.price
         FROM business_category_addons a JOIN business_categories c ON c.id = a.category_id
         WHERE a.business_id = $1 AND a.is_available = TRUE ORDER BY c.name, a.name`,
        [business.id],
      ),
      pool.query(
        `SELECT bp.id
         FROM customer_orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) AS line(value)
         JOIN business_products bp ON bp.id = NULLIF(line.value->>'id', '')::bigint AND bp.business_id = o.business_id
         WHERE o.business_id = $1 AND o.status <> 'cancelled' AND bp.is_available = TRUE
           AND COALESCE(line.value->>'isReward', 'false') <> 'true'
         GROUP BY bp.id ORDER BY SUM((line.value->>'quantity')::int) DESC, bp.name LIMIT 6`,
        [business.id],
      ),
    ])
    res.json({ business, products: products.rows, rewards: rewards.rows, addons: addons.rows, bestSellerIds: bestSellers.rows.map((row) => row.id) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/public/businesses/:slug/redeem', authenticate, async (req, res, next) => {
  const rewardId = Number(req.body?.rewardId)
  if (!Number.isSafeInteger(rewardId) || rewardId < 1) {
    return res.status(400).json({ error: 'El canje seleccionado no es válido.' })
  }
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows: customers } = await client.query(
      'SELECT role FROM customers WHERE id = $1 FOR UPDATE',
      [req.customerId],
    )
    if (customers[0]?.role !== 'customer') {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(403).json({ error: 'Solo las cuentas de cliente pueden canjear puntos.' })
    }
    const { rows: businesses } = await client.query('SELECT id FROM businesses WHERE slug = $1', [req.params.slug])
    const businessId = businesses[0]?.id
    if (!businessId) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(404).json({ error: 'No encontramos ese local.' })
    }
    if (await isBusinessSuspended(client, businessId)) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(403).json({ error: 'Este local no está disponible por el momento.' })
    }
    const currentPoints = await lockPoints(client, req.customerId, businessId)
    const { rows: rewards } = await client.query(
      `SELECT id, name, points_cost, reward_type, product_id FROM business_rewards
       WHERE id = $1 AND business_id = $2 AND is_available = TRUE FOR UPDATE`,
      [rewardId, businessId],
    )
    const reward = rewards[0]
    if (!reward) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(404).json({ error: 'Ese canje ya no está disponible.' })
    }
    if (reward.reward_type === 'discount' || reward.product_id) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(400).json({ error: 'Este canje debe agregarse al pedido antes de confirmarlo.' })
    }
    if (currentPoints < reward.points_cost) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(400).json({ error: 'Todavía no tenés puntos suficientes para ese canje.' })
    }
    const remainingPoints = await adjustPoints(client, req.customerId, businessId, -reward.points_cost)
    const { rows: redemptions } = await client.query(
      `INSERT INTO business_redemptions (business_id, customer_id, reward_id, points_spent)
       VALUES ($1, $2, $3, $4) RETURNING id, status`,
      [businessId, req.customerId, reward.id, reward.points_cost],
    )
    await client.query('COMMIT')
    transactionStarted = false
    res.status(201).json({
      redemption: { id: redemptions[0].id, status: redemptions[0].status, rewardName: reward.name },
      points: remainingPoints,
    })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/auth/register', rateLimit('register', 10, 15 * 60_000), async (req, res, next) => {
  const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : ''
  const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : ''
  const phone = normalizePhone(req.body?.phone)
  const password = req.body?.password
  if (!firstName || firstName.length > 60 || !lastName || lastName.length > 60) {
    return res.status(400).json({ error: 'Ingresá tu nombre y apellido (máximo 60 caracteres cada uno).' })
  }
  if (!/^\+?[0-9]{8,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Ingresá un celular válido con código de país.' })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' })
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12)
    const { rows } = await pool.query(
      `INSERT INTO customers (first_name, last_name, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, 'customer')
       RETURNING id, first_name, last_name, phone, role, business_name, business_id`,
      [firstName, lastName, phone, passwordHash],
    )
    const customer = publicCustomer(rows[0])
    res.status(201).json({ token: createToken(customer), user: customer })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese celular ya tiene una cuenta.' })
    next(error)
  }
})

app.post('/api/local-applications', rateLimit('application', 10, 60 * 60_000), async (req, res, next) => {
  const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName.trim() : ''
  const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName.trim() : ''
  const phone = normalizePhone(req.body?.phone)
  const email = normalizeEmail(req.body?.email)
  const password = req.body?.password
  const businessName = typeof req.body?.businessName === 'string' ? req.body.businessName.trim() : ''
  const requestedPlan = req.body?.requestedPlan

  if (!firstName || firstName.length > 60 || !lastName || lastName.length > 60) {
    return res.status(400).json({ error: 'Ingresá tu nombre y apellido (máximo 60 caracteres cada uno).' })
  }
  if (!/^\+?[0-9]{8,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Ingresá un celular válido con código de país.' })
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Ingresá un email válido para usar como usuario del local.' })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' })
  }
  if (businessName.length < 2 || businessName.length > 100) {
    return res.status(400).json({ error: 'Ingresá el nombre del local (entre 2 y 100 caracteres).' })
  }
  if (!['basic', 'vip'].includes(requestedPlan)) {
    return res.status(400).json({ error: 'Elegí el plan Básico o VIP.' })
  }

  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows: existingCustomers } = await client.query(
      'SELECT id FROM customers WHERE phone = $1 OR lower(email) = $2',
      [phone, email],
    )
    if (existingCustomers[0]) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(409).json({ error: 'Ese celular o email ya tiene una cuenta. Ingresá con esa cuenta para solicitar el alta del local.' })
    }
    const { rows: existingApplications } = await client.query(
      "SELECT id, status FROM local_applications WHERE (phone = $1 OR lower(email) = $2) AND status IN ('pending', 'contacted', 'approved') ORDER BY created_at DESC LIMIT 1",
      [phone, email],
    )
    const passwordHash = await bcrypt.hash(password, 12)
    await client.query(
      `INSERT INTO customers (first_name, last_name, phone, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5, 'customer')`,
      [firstName, lastName, phone, email, passwordHash],
    )
    if (existingApplications[0]) {
      await client.query('UPDATE local_applications SET email = $1 WHERE id = $2 AND email IS NULL', [email, existingApplications[0].id])
      await client.query('COMMIT')
      transactionStarted = false
      return res.status(200).json({ applicationId: existingApplications[0].id, status: existingApplications[0].status })
    }
    const { rows } = await client.query(
      'INSERT INTO local_applications (first_name, last_name, phone, email, business_name, requested_plan) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, status',
      [firstName, lastName, phone, email, businessName, requestedPlan],
    )
    await client.query('COMMIT')
    transactionStarted = false
    res.status(201).json({ applicationId: rows[0].id, status: rows[0].status })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    if (error.code === '23505') return res.status(409).json({ error: 'Ese celular ya tiene una cuenta o una solicitud.' })
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/admin/local-applications', authenticate, requireAdmin, async (req, res, next) => {
  const requestedStatus = req.query.status || 'pending'
  const status = requestedStatus === 'all' ? null : requestedStatus
  if (status && !['pending', 'contacted', 'approved', 'rejected', 'requests'].includes(status)) {
    return res.status(400).json({ error: 'El filtro de solicitudes no es válido.' })
  }

  try {
    const filterClause = status === 'requests'
      ? "WHERE status IN ('pending', 'contacted', 'rejected')"
      : 'WHERE ($1::text IS NULL OR status = $1)'
    const { rows } = await pool.query(
      `SELECT la.id, la.first_name AS "firstName", la.last_name AS "lastName", la.phone, la.email,
              business_name AS "businessName", requested_plan AS "requestedPlan",
              la.status, la.created_at AS "createdAt", la.business_id AS "businessId",
              (la.claimed_at IS NOT NULL) AS claimed,
              b.plan AS "businessPlan", b.subscription_due_at AS "subscriptionDueAt"
       FROM local_applications la
       LEFT JOIN businesses b ON b.id = la.business_id
       ${filterClause.replace('status', 'la.status')}
       ORDER BY la.created_at DESC LIMIT 200`,
      status === 'requests' ? [] : [status],
    )
    res.json({
      applications: rows.map(({ businessPlan, subscriptionDueAt, ...application }) => ({
        ...application,
        billing: subscriptionDueAt ? describeBilling({ plan: businessPlan, subscriptionDueAt }) : null,
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/admin/businesses/:id/subscription', authenticate, requireAdmin, async (req, res, next) => {
  const businessId = Number(req.params.id)
  const action = req.body?.action
  if (!Number.isSafeInteger(businessId) || !['extend', 'suspend'].includes(action)) {
    return res.status(400).json({ error: 'La acción no es válida.' })
  }
  try {
    const { rows } = await pool.query(
      action === 'extend'
        ? `UPDATE businesses
           SET subscription_due_at = GREATEST(subscription_due_at, NOW()) + INTERVAL '1 month'
           WHERE id = $1 RETURNING plan, subscription_due_at AS "subscriptionDueAt"`
        : `UPDATE businesses
           SET subscription_due_at = NOW() - make_interval(days => $2)
           WHERE id = $1 RETURNING plan, subscription_due_at AS "subscriptionDueAt"`,
      action === 'extend' ? [businessId] : [businessId, BILLING_GRACE_DAYS + 1],
    )
    if (!rows[0]) return res.status(404).json({ error: 'No encontramos el local.' })
    res.json({ billing: describeBilling(rows[0]) })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/admin/businesses/:id', authenticate, requireAdmin, async (req, res, next) => {
  const businessId = Number(req.params.id)
  if (!Number.isSafeInteger(businessId) || businessId < 1) {
    return res.status(400).json({ error: 'El local no es válido.' })
  }
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows: businesses } = await client.query('SELECT id FROM businesses WHERE id = $1 FOR UPDATE', [businessId])
    if (!businesses[0]) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(404).json({ error: 'No encontramos el local.' })
    }
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
    await client.query('COMMIT')
    transactionStarted = false
    res.json({ deleted: true })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.patch('/api/admin/local-applications/:id', authenticate, requireAdmin, async (req, res, next) => {
  const applicationId = Number(req.params.id)
  const nextStatus = req.body?.status
  if (!Number.isSafeInteger(applicationId) || applicationId < 1 || !['contacted', 'approved', 'rejected'].includes(nextStatus)) {
    return res.status(400).json({ error: 'La acción solicitada no es válida.' })
  }

  const client = await pool.connect()
  let transactionStarted = false
  let activationCode = null
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows } = await client.query(
      'SELECT id, phone, business_name, requested_plan, business_id, status FROM local_applications WHERE id = $1 FOR UPDATE',
      [applicationId],
    )
    const application = rows[0]
    if (!application) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(404).json({ error: 'No se encontró esa solicitud.' })
    }
    if (['approved', 'rejected'].includes(application.status)) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(409).json({ error: 'La solicitud ya tiene una decisión final.' })
    }

    if (nextStatus === 'approved') {
      activationCode = generateActivationCode()
      let businessId = application.business_id
      if (!businessId) {
        const businessSlug = `${application.business_name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'local'}-${application.phone}`.slice(0, 120)
        const businessResult = await client.query(
          'INSERT INTO businesses (name, slug, plan, subscription_due_at) VALUES ($1, $2, $3, NOW()) RETURNING id',
          [application.business_name, businessSlug, application.requested_plan],
        )
        businessId = businessResult.rows[0].id
        await client.query('UPDATE local_applications SET business_id = $1 WHERE id = $2', [businessId, applicationId])
      }
      await client.query(
        'UPDATE local_applications SET activation_code_hash = $1, activation_expires_at = $2, claimed_at = NULL WHERE id = $3',
        [activationHash(activationCode), activationExpiry(), applicationId],
      )
    }
    const updated = await client.query(
      `UPDATE local_applications SET status = $1 WHERE id = $2
       RETURNING id, first_name AS "firstName", last_name AS "lastName", phone, email,
                 business_name AS "businessName", requested_plan AS "requestedPlan",
                 business_id AS "businessId", status, created_at AS "createdAt"`,
      [nextStatus, applicationId],
    )
    await client.query('COMMIT')
    transactionStarted = false
    res.json({ application: updated.rows[0], activationCode })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/admin/local-applications/:id/activation-code', authenticate, requireAdmin, async (req, res, next) => {
  const applicationId = Number(req.params.id)
  if (!Number.isSafeInteger(applicationId) || applicationId < 1) return res.status(400).json({ error: 'La solicitud no es válida.' })
  try {
    const code = generateActivationCode()
    const { rowCount } = await pool.query(
      `UPDATE local_applications SET activation_code_hash = $1, activation_expires_at = $2, claimed_at = NULL
       WHERE id = $3 AND status = 'approved' AND business_id IS NOT NULL`,
      [activationHash(code), activationExpiry(), applicationId],
    )
    if (!rowCount) return res.status(404).json({ error: 'No se encontró un local aprobado con ese número.' })
    res.json({ activationCode: code })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/claim-business', authenticate, rateLimit('claim', 8, 15 * 60_000), async (req, res, next) => {
  const code = typeof req.body?.code === 'string' ? req.body.code : ''
  if (!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(code.trim())) {
    return res.status(400).json({ error: 'El código no es válido.' })
  }
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows } = await client.query(
      `SELECT id, business_id, business_name FROM local_applications
       WHERE activation_code_hash = $1 AND activation_expires_at > NOW() AND status = 'approved'
       FOR UPDATE`,
      [activationHash(code)],
    )
    const application = rows[0]
    if (!application) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(400).json({ error: 'El código es incorrecto o venció. Pedí uno nuevo.' })
    }
    const { rows: customers } = await client.query(
      `UPDATE customers SET role = 'local_owner', business_name = $1, business_id = $2
       WHERE id = $3 AND role = 'customer'
       RETURNING id, first_name, last_name, phone, role, business_name, business_id`,
      [application.business_name, application.business_id, req.customerId],
    )
    if (!customers[0]) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(403).json({ error: 'Esta cuenta no puede reclamar un local.' })
    }
    await client.query(
      'UPDATE local_applications SET activation_code_hash = NULL, activation_expires_at = NULL, claimed_at = NOW() WHERE id = $1',
      [application.id],
    )
    await client.query('UPDATE businesses SET subscription_due_at = NOW() + make_interval(days => $2) WHERE id = $1', [application.business_id, BILLING_INITIAL_TRIAL_DAYS])
    await client.query('COMMIT')
    transactionStarted = false
    const user = publicCustomer(customers[0])
    res.json({ token: createToken(user), user })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/partner/overview', authenticate, requirePartnerBilling, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
            `SELECT id, name, slug, plan, description, logo_data_url AS "logoDataUrl",
              logo_scale AS "logoScale", font_family AS "fontFamily",
              bonus_points_days AS "bonusPointsDays",
              referral_enabled AS "referralEnabled", referral_points AS "referralPoints",
              delivery_enabled AS "deliveryEnabled", addons_enabled AS "addonsEnabled",
              banner_data_url AS "bannerDataUrl", primary_color AS "primaryColor",
              secondary_color AS "secondaryColor", address, opening_hours AS "openingHours", whatsapp,
              subscription_due_at AS "subscriptionDueAt"
       FROM businesses WHERE id = $1`,
      [req.businessId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'No se encontró el local asociado.' })
    const business = rows[0]
    const billing = await loadBilling(req.businessId)
    delete business.subscriptionDueAt
    business.bonusPointsActiveToday = hasDoublePointsToday(business.plan, business.bonusPointsDays)
    res.json({ business, billing })
  } catch (error) {
    next(error)
  }
})

app.get('/api/partner/billing', authenticate, requirePartnerBilling, async (req, res, next) => {
  try {
    res.json({ billing: await loadBilling(req.businessId) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/partner/billing/checkout', authenticate, requirePartnerBilling, async (req, res, next) => {
  try {
    const configurationMessage = mercadoPagoConfigurationMessage()
    if (configurationMessage) {
      return res.status(503).json({ error: configurationMessage })
    }
    const billing = await loadBilling(req.businessId)
    if (!billing.canPay) {
      return res.status(400).json({ error: `Vas a poder pagar desde ${BILLING_PAY_WINDOW_DAYS} días antes del vencimiento.` })
    }
    const origin = publicOrigin
    const webhookBase = process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL
    const returnUrl = `${origin}/?billing=return`
    const preference = await mercadoPagoRequest('/checkout/preferences', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ id: billing.plan, title: `Dotty - Plan ${billing.planLabel} (1 mes)`, quantity: 1, unit_price: billing.price, currency_id: 'ARS' }],
        external_reference: `sabor-vivo-business-${req.businessId}`,
        back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
        ...(origin.startsWith('https://') ? { auto_return: 'approved' } : {}),
        ...(webhookBase ? { notification_url: `${webhookBase}/api/billing/webhook` } : {}),
      }),
    })
    res.json({ url: preference.init_point })
  } catch (error) {
    if (error.status) return res.status(502).json({ error: `No pudimos iniciar el pago con Mercado Pago: ${error.message}` })
    next(error)
  }
})

app.post('/api/partner/billing/confirm', authenticate, requirePartnerBilling, async (req, res, next) => {
  const paymentId = String(req.body?.paymentId || '')
  if (!/^\d{1,20}$/.test(paymentId)) return res.status(400).json({ error: 'El pago no es válido.' })
  const configurationMessage = mercadoPagoConfigurationMessage()
  if (configurationMessage) return res.status(503).json({ error: configurationMessage })
  try {
    const result = await applySubscriptionPayment(paymentId)
    res.json({ applied: result.applied, paymentStatus: result.status || 'approved', billing: await loadBilling(req.businessId) })
  } catch (error) {
    if (error.status) return res.status(502).json({ error: `No pudimos verificar el pago: ${error.message}` })
    next(error)
  }
})

app.post('/api/billing/webhook', async (req, res) => {
  const type = req.body?.type || req.query.type || req.query.topic
  const paymentId = String(req.body?.data?.id || req.query['data.id'] || '')
  if (type !== 'payment' || !/^\d{1,20}$/.test(paymentId) || mercadoPagoConfigurationMessage()) return res.sendStatus(200)
  try {
    await applySubscriptionPayment(paymentId)
    res.sendStatus(200)
  } catch (error) {
    console.error('Error procesando el webhook de Mercado Pago:', error.message)
    res.sendStatus(500)
  }
})

app.patch('/api/partner/bonus-days', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rows: businesses } = await pool.query(
      'SELECT plan FROM businesses WHERE id = $1',
      [req.businessId],
    )
    if (!businesses[0]) return res.status(404).json({ error: 'No se encontró el local asociado.' })
    if (businesses[0].plan !== 'vip') {
      return res.status(403).json({ error: 'La bonificación de puntos dobles es exclusiva del Plan VIP.' })
    }

    const days = req.body?.days
    if (!Array.isArray(days) || days.length > 7
      || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
      || new Set(days).size !== days.length) {
      return res.status(400).json({ error: 'Elegí días válidos para la bonificación.' })
    }

    const { rows } = await pool.query(
      `UPDATE businesses SET bonus_points_days = $1 WHERE id = $2
       RETURNING bonus_points_days AS "bonusPointsDays"`,
      [days, req.businessId],
    )
    const bonusPointsDays = rows[0].bonusPointsDays
    res.json({
      bonusPointsDays,
      bonusPointsActiveToday: hasDoublePointsToday('vip', bonusPointsDays),
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/partner/referrals', authenticate, requirePartner, async (req, res, next) => {
  const enabled = req.body?.enabled
  const points = Number(req.body?.points)
  if (typeof enabled !== 'boolean' || !Number.isInteger(points) || points < 0 || points > 100_000
    || (enabled && points < 1)) {
    return res.status(400).json({ error: 'Ingresá una cantidad de puntos válida (mayor a 0) para el programa de invitados.' })
  }
  try {
    const { rows } = await pool.query(
      `UPDATE businesses SET referral_enabled = $1, referral_points = $2 WHERE id = $3
       RETURNING referral_enabled AS "referralEnabled", referral_points AS "referralPoints"`,
      [enabled, points, req.businessId],
    )
    res.json(rows[0])
  } catch (error) {
    next(error)
  }
})

app.get('/api/public/businesses/:slug/referral-code', authenticate, requireCustomer, async (req, res, next) => {
  try {
    const { rows: businesses } = await pool.query(
      'SELECT referral_enabled FROM businesses WHERE slug = $1',
      [req.params.slug],
    )
    if (!businesses[0]) return res.status(404).json({ error: 'No encontramos ese local.' })
    if (!businesses[0].referral_enabled) return res.json({ code: null })
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { rows } = await pool.query(
        `UPDATE customers SET referral_code = COALESCE(referral_code, $2) WHERE id = $1 RETURNING referral_code`,
        [req.customerId, randomBytes(5).toString('hex').toUpperCase()],
      ).catch((error) => (error.code === '23505' ? { rows: [] } : Promise.reject(error)))
      if (rows[0]) return res.json({ code: rows[0].referral_code })
    }
    res.status(500).json({ error: 'No pudimos generar tu código de invitación.' })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/partner/business', authenticate, requirePartner, async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const description = typeof req.body?.description === 'string' ? req.body.description.trim() : ''
  const address = typeof req.body?.address === 'string' ? req.body.address.trim() : ''
  const openingHours = typeof req.body?.openingHours === 'string' ? req.body.openingHours.trim() : ''
  const whatsapp = typeof req.body?.whatsapp === 'string' ? req.body.whatsapp.trim() : ''
  const logoDataUrl = req.body?.logoDataUrl ?? ''
  const logoScale = Number(req.body?.logoScale ?? 1)
  const bannerDataUrl = req.body?.bannerDataUrl ?? ''
  const primaryColor = req.body?.primaryColor
  const secondaryColor = req.body?.secondaryColor
  const fontFamily = req.body?.fontFamily
  const deliveryEnabled = req.body?.deliveryEnabled !== false
  const addonsEnabled = req.body?.addonsEnabled !== false
  if (!name || name.length > 100 || description.length > 1000 || address.length > 200
    || openingHours.length > 160 || whatsapp.length > 20 || !isValidImageDataUrl(logoDataUrl)
    || !isValidImageDataUrl(bannerDataUrl) || !bannerDataUrl
    || !isValidHexColor(primaryColor) || !isValidHexColor(secondaryColor)
    || !Number.isFinite(logoScale) || logoScale < 1 || logoScale > 3
    || !businessFontFamilies.has(fontFamily)) {
    return res.status(400).json({ error: 'Revisá el perfil, cargá un banner válido y verificá sus opciones visuales.' })
  }
  try {
    const { rows } = await pool.query(
      `UPDATE businesses SET name = $1, description = $2, address = $3,
         opening_hours = $4, whatsapp = $5, logo_data_url = $6,
         banner_data_url = $7, primary_color = $8, secondary_color = $9,
         logo_scale = $10, font_family = $11
         , delivery_enabled = $12, addons_enabled = $13
       WHERE id = $14
       RETURNING id, name, slug, plan, description, logo_data_url AS "logoDataUrl",
                 logo_scale AS "logoScale", font_family AS "fontFamily",
                 banner_data_url AS "bannerDataUrl", primary_color AS "primaryColor",
                 secondary_color AS "secondaryColor", address, opening_hours AS "openingHours", whatsapp,
                 delivery_enabled AS "deliveryEnabled", addons_enabled AS "addonsEnabled"`,
      [name, description, address, openingHours, whatsapp, logoDataUrl, bannerDataUrl, primaryColor, secondaryColor, logoScale, fontFamily, deliveryEnabled, addonsEnabled, req.businessId],
    )
    res.json({ business: rows[0] })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/partner/business/options', authenticate, requirePartner, async (req, res, next) => {
  const fields = { deliveryEnabled: 'delivery_enabled', addonsEnabled: 'addons_enabled' }
  const entries = Object.entries(fields).filter(([field]) => typeof req.body?.[field] === 'boolean')
  if (entries.length !== 1) return res.status(400).json({ error: 'Elegí una opción válida para actualizar.' })
  const [field, column] = entries[0]
  try {
    const { rows } = await pool.query(
      `UPDATE businesses SET ${column} = $1 WHERE id = $2 RETURNING ${column} AS "${field}"`,
      [req.body[field], req.businessId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'No se encontró el local asociado.' })
    res.json({ business: rows[0] })
  } catch (error) { next(error) }
})

app.get('/api/partner/categories', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT categories.name, COUNT(products.id)::int AS "productCount"
       FROM business_categories AS categories
       LEFT JOIN business_products AS products
         ON products.business_id = categories.business_id
         AND products.category = categories.name AND products.is_available = TRUE
       WHERE categories.business_id = $1
       GROUP BY categories.id
       ORDER BY categories.name`,
      [req.businessId],
    )
    res.json({ categories: rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/partner/categories', authenticate, requirePartner, async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name || name.length > 60) return res.status(400).json({ error: 'Ingresá un nombre de categoría válido.' })
  try {
    const { rows } = await pool.query(
      'INSERT INTO business_categories (business_id, name) VALUES ($1, $2) RETURNING name',
      [req.businessId, name],
    )
    res.status(201).json({ category: { ...rows[0], productCount: 0 } })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' })
    next(error)
  }
})

app.patch('/api/partner/categories', authenticate, requirePartner, async (req, res, next) => {
  const currentName = typeof req.body?.currentName === 'string' ? req.body.currentName.trim() : ''
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!currentName || currentName.length > 60 || !name || name.length > 60) {
    return res.status(400).json({ error: 'Ingresá un nombre de categoría válido.' })
  }
  if (currentName === name) return res.json({ category: { name } })

  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows } = await client.query(
      'SELECT id FROM business_categories WHERE business_id = $1 AND name = $2 FOR UPDATE',
      [req.businessId, currentName],
    )
    if (!rows[0]) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(404).json({ error: 'No se encontró esa categoría.' })
    }
    await client.query('UPDATE business_categories SET name = $1 WHERE id = $2', [name, rows[0].id])
    await client.query(
      'UPDATE business_products SET category = $1 WHERE business_id = $2 AND category = $3',
      [name, req.businessId, currentName],
    )
    await client.query('COMMIT')
    transactionStarted = false
    res.json({ category: { name } })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe una categoría con ese nombre.' })
    next(error)
  } finally {
    client.release()
  }
})

app.delete('/api/partner/categories', authenticate, requirePartner, async (req, res, next) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  if (!name || name.length > 60) return res.status(400).json({ error: 'La categoría indicada no es válida.' })
  const fallbackCategory = name.toLocaleLowerCase('es') === 'general' ? 'Sin categoría' : 'General'
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows: categories } = await client.query(
      'SELECT id FROM business_categories WHERE business_id = $1 AND name = $2 FOR UPDATE',
      [req.businessId, name],
    )
    if (!categories[0]) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(404).json({ error: 'No se encontró esa categoría.' })
    }
    const { rowCount } = await client.query(
      'UPDATE business_products SET category = $1 WHERE business_id = $2 AND category = $3 AND is_available = TRUE',
      [fallbackCategory, req.businessId, name],
    )
    if (rowCount > 0) {
      await client.query(
        'INSERT INTO business_categories (business_id, name) VALUES ($1, $2) ON CONFLICT (business_id, name) DO NOTHING',
        [req.businessId, fallbackCategory],
      )
    }
    await client.query('DELETE FROM business_categories WHERE id = $1', [categories[0].id])
    await client.query('COMMIT')
    transactionStarted = false
    res.json({ category: fallbackCategory, productsMoved: rowCount })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/partner/category-addons', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.id, c.name AS category, a.name, a.price
       FROM business_category_addons a JOIN business_categories c ON c.id = a.category_id
       WHERE a.business_id = $1 AND a.is_available = TRUE ORDER BY c.name, a.name`,
      [req.businessId],
    )
    res.json({ addons: rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/partner/category-addons', authenticate, requirePartner, async (req, res, next) => {
  const categoryName = typeof req.body?.category === 'string' ? req.body.category.trim() : ''
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const price = Number(req.body?.price)
  if (!categoryName || categoryName.length > 60 || !name || name.length > 80
    || !Number.isSafeInteger(price) || price < 0 || price > 100_000_000) {
    return res.status(400).json({ error: 'Revisá el nombre, categoría y precio del agregado.' })
  }
  try {
    const { rows: categories } = await pool.query(
      'SELECT id FROM business_categories WHERE business_id = $1 AND name = $2',
      [req.businessId, categoryName],
    )
    if (!categories[0]) return res.status(404).json({ error: 'No se encontró esa categoría.' })
    const { rows } = await pool.query(
      `INSERT INTO business_category_addons (business_id, category_id, name, price)
       VALUES ($1, $2, $3, $4) RETURNING id, name, price`,
      [req.businessId, categories[0].id, name, price],
    )
    res.status(201).json({ addon: { ...rows[0], category: categoryName } })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe ese agregado en la categoría.' })
    next(error)
  }
})

app.patch('/api/partner/category-addons/:id', authenticate, requirePartner, async (req, res, next) => {
  const addonId = Number(req.params.id)
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : ''
  const price = Number(req.body?.price)
  if (!Number.isSafeInteger(addonId) || addonId < 1 || !name || name.length > 80
    || !Number.isSafeInteger(price) || price < 0 || price > 100_000_000) {
    return res.status(400).json({ error: 'Revisá el nombre y precio del agregado.' })
  }
  try {
    const { rows } = await pool.query(
      `UPDATE business_category_addons SET name = $1, price = $2
       WHERE id = $3 AND business_id = $4 AND is_available = TRUE RETURNING id, name, price, category_id`,
      [name, price, addonId, req.businessId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'No se encontró ese agregado.' })
    const { rows: categories } = await pool.query('SELECT name FROM business_categories WHERE id = $1', [rows[0].category_id])
    res.json({ addon: { id: rows[0].id, name: rows[0].name, price: rows[0].price, category: categories[0]?.name || '' } })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ya existe ese agregado en la categoría.' })
    next(error)
  }
})

app.delete('/api/partner/category-addons/:id', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE business_category_addons SET is_available = FALSE WHERE id = $1 AND business_id = $2 AND is_available = TRUE',
      [req.params.id, req.businessId],
    )
    if (!rowCount) return res.status(404).json({ error: 'No se encontró ese agregado.' })
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/partner/products', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, category, price,
              points_per_unit AS "pointsPerUnit", image_data_url AS "imageDataUrl",
              image_scale AS "imageScale",
              image_position_x AS "imagePositionX", image_position_y AS "imagePositionY",
              is_available AS "isAvailable"
      FROM business_products WHERE business_id = $1 AND is_available = TRUE ORDER BY created_at DESC`,
      [req.businessId],
    )
    res.json({ products: rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/partner/products', authenticate, requirePartner, async (req, res, next) => {
  const product = readProductInput(req.body)
  if (!product) return res.status(400).json({ error: 'Revisá nombre, categoría, precio, puntos e imagen del producto.' })
  try {
    const category = await pool.query(
      'SELECT 1 FROM business_categories WHERE business_id = $1 AND name = $2',
      [req.businessId, product.category],
    )
    if (!category.rowCount) return res.status(400).json({ error: 'Elegí una categoría existente de tu local.' })
    const { rows } = await pool.query(
      `INSERT INTO business_products (business_id, name, description, category, price, points_per_unit, image_data_url, image_scale, image_position_x, image_position_y)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, name, description, category, price, points_per_unit AS "pointsPerUnit",
             image_data_url AS "imageDataUrl", image_scale AS "imageScale",
             image_position_x AS "imagePositionX", image_position_y AS "imagePositionY",
             is_available AS "isAvailable"`,
      [req.businessId, product.name, product.description, product.category, product.price, product.pointsPerUnit, product.imageDataUrl, product.imageScale, product.imagePositionX, product.imagePositionY],
    )
    res.status(201).json({ product: rows[0] })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/partner/products/:id', authenticate, requirePartner, async (req, res, next) => {
  const productId = Number(req.params.id)
  const product = readProductInput(req.body)
  if (!Number.isSafeInteger(productId) || productId < 1 || !product) {
    return res.status(400).json({ error: 'Revisá los datos del producto.' })
  }
  try {
    const category = await pool.query(
      'SELECT 1 FROM business_categories WHERE business_id = $1 AND name = $2',
      [req.businessId, product.category],
    )
    if (!category.rowCount) return res.status(400).json({ error: 'Elegí una categoría existente de tu local.' })
    const { rows } = await pool.query(
      `UPDATE business_products SET name = $1, description = $2, category = $3,
         price = $4, points_per_unit = $5, image_data_url = $6, image_scale = $7,
         image_position_x = $8, image_position_y = $9
       WHERE id = $10 AND business_id = $11
       RETURNING id, name, description, category, price, points_per_unit AS "pointsPerUnit",
                 image_data_url AS "imageDataUrl", image_scale AS "imageScale",
                 image_position_x AS "imagePositionX", image_position_y AS "imagePositionY",
                 is_available AS "isAvailable"`,
      [product.name, product.description, product.category, product.price, product.pointsPerUnit, product.imageDataUrl, product.imageScale, product.imagePositionX, product.imagePositionY, productId, req.businessId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'No se encontró ese producto en tu local.' })
    res.json({ product: rows[0] })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/partner/products/:id', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rowCount: linkedRewards } = await pool.query(
      'SELECT 1 FROM business_rewards WHERE product_id = $1 AND business_id = $2 AND is_available = TRUE LIMIT 1',
      [req.params.id, req.businessId],
    )
    if (linkedRewards) return res.status(409).json({ error: 'Este producto está asociado a un canje. Cambiá o quitá ese canje antes de archivarlo.' })
    const { rowCount } = await pool.query(
      'UPDATE business_products SET is_available = FALSE WHERE id = $1 AND business_id = $2',
      [req.params.id, req.businessId],
    )
    if (!rowCount) return res.status(404).json({ error: 'No se encontró ese producto en tu local.' })
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/partner/rewards', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
                  `SELECT id, name, description, image_data_url AS "imageDataUrl",
                    reward_type AS "rewardType", product_id AS "productId",
                    discount_type AS "discountType", discount_value AS "discountValue",
              points_cost AS "pointsCost", is_available AS "isAvailable"
      FROM business_rewards WHERE business_id = $1 AND is_available = TRUE ORDER BY created_at DESC`,
      [req.businessId],
    )
    res.json({ rewards: rows })
  } catch (error) {
    next(error)
  }
})

app.post('/api/partner/rewards', authenticate, requirePartner, async (req, res, next) => {
  const reward = readRewardInput(req.body)
  if (!reward) return res.status(400).json({ error: 'Revisá el nombre y costo en puntos de la recompensa.' })
  try {
    if (reward.rewardType === 'product') {
      const { rowCount } = await pool.query('SELECT 1 FROM business_products WHERE id = $1 AND business_id = $2 AND is_available = TRUE', [reward.productId, req.businessId])
      if (!reward.productId || !rowCount) return res.status(400).json({ error: 'Elegí un producto disponible de tu local para este canje.' })
    }
    const { rows } = await pool.query(
      `INSERT INTO business_rewards (business_id, name, description, image_data_url, reward_type, product_id, discount_type, discount_value, points_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, name, description, image_data_url AS "imageDataUrl",
                 reward_type AS "rewardType", product_id AS "productId", discount_type AS "discountType", discount_value AS "discountValue",
             points_cost AS "pointsCost", is_available AS "isAvailable"`,
      [req.businessId, reward.name, reward.description, reward.imageDataUrl, reward.rewardType, reward.productId, reward.discountType, reward.discountValue, reward.pointsCost],
    )
    res.status(201).json({ reward: rows[0] })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/partner/rewards/:id', authenticate, requirePartner, async (req, res, next) => {
  const rewardId = Number(req.params.id)
  const reward = readRewardInput(req.body)
  if (!Number.isSafeInteger(rewardId) || rewardId < 1 || !reward) {
    return res.status(400).json({ error: 'Revisá los datos de la recompensa.' })
  }
  try {
    if (reward.rewardType === 'product') {
      const { rowCount } = await pool.query('SELECT 1 FROM business_products WHERE id = $1 AND business_id = $2 AND is_available = TRUE', [reward.productId, req.businessId])
      if (!reward.productId || !rowCount) return res.status(400).json({ error: 'Elegí un producto disponible de tu local para este canje.' })
    }
    const { rows } = await pool.query(
      `UPDATE business_rewards SET name = $1, description = $2, image_data_url = $3,
         reward_type = $4, product_id = $5, discount_type = $6, discount_value = $7, points_cost = $8
       WHERE id = $9 AND business_id = $10
       RETURNING id, name, description, image_data_url AS "imageDataUrl",
                 reward_type AS "rewardType", product_id AS "productId", discount_type AS "discountType", discount_value AS "discountValue",
                 points_cost AS "pointsCost", is_available AS "isAvailable"`,
      [reward.name, reward.description, reward.imageDataUrl, reward.rewardType, reward.productId, reward.discountType, reward.discountValue, reward.pointsCost, rewardId, req.businessId],
    )
    if (!rows[0]) return res.status(404).json({ error: 'No se encontró esa recompensa.' })
    res.json({ reward: rows[0] })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/partner/rewards/:id', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rowCount } = await pool.query(
      'UPDATE business_rewards SET is_available = FALSE WHERE id = $1 AND business_id = $2',
      [req.params.id, req.businessId],
    )
    if (!rowCount) return res.status(404).json({ error: 'No se encontró esa recompensa.' })
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

app.get('/api/partner/redemptions', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.points_spent AS "pointsSpent", r.status,
              r.created_at AS "createdAt", c.first_name AS "firstName",
              c.last_name AS "lastName", c.phone, w.name AS "rewardName"
       FROM business_redemptions r
       JOIN customers c ON c.id = r.customer_id
       JOIN business_rewards w ON w.id = r.reward_id
       WHERE r.business_id = $1 ORDER BY r.created_at DESC LIMIT 300`,
      [req.businessId],
    )
    res.json({ redemptions: rows })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/partner/redemptions/:id', authenticate, requirePartner, async (req, res, next) => {
  const redemptionId = Number(req.params.id)
  const nextStatus = req.body?.status
  if (!Number.isSafeInteger(redemptionId) || redemptionId < 1 || !['fulfilled', 'cancelled'].includes(nextStatus)) {
    return res.status(400).json({ error: 'El estado del canje no es válido.' })
  }
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows } = await client.query(
      'SELECT customer_id, points_spent, status FROM business_redemptions WHERE id = $1 AND business_id = $2 FOR UPDATE',
      [redemptionId, req.businessId],
    )
    const redemption = rows[0]
    if (!redemption) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(404).json({ error: 'No se encontró ese canje.' })
    }
    if (redemption.status !== 'requested') {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(409).json({ error: 'Ese canje ya fue resuelto.' })
    }
    if (nextStatus === 'cancelled') {
      await adjustPoints(client, redemption.customer_id, req.businessId, redemption.points_spent)
    }
    const { rows: updated } = await client.query(
      `UPDATE business_redemptions SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, points_spent AS "pointsSpent", status`,
      [nextStatus, redemptionId],
    )
    await client.query('COMMIT')
    transactionStarted = false
    res.json({ redemption: updated[0] })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/partner/customers', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT c.first_name AS "firstName", c.last_name AS "lastName", c.phone
       FROM customer_orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.business_id = $1 ORDER BY c.first_name, c.last_name LIMIT 1000`,
      [req.businessId],
    )
    res.json({ customers: rows })
  } catch (error) {
    next(error)
  }
})

app.get('/api/partner/stats', authenticate, requirePartner, async (req, res, next) => {
  const timeZone = 'America/Argentina/Buenos_Aires'
  try {
    const [summaryResult, dailyResult, monthlyResult, categoryResult, productResult] = await Promise.all([
      pool.query(
        `WITH month_window AS (
           SELECT date_trunc('month', NOW() AT TIME ZONE '${timeZone}') AS starts_at
         ), month_orders AS (
           SELECT o.* FROM customer_orders o CROSS JOIN month_window w
           WHERE o.business_id = $1
             AND (o.created_at AT TIME ZONE '${timeZone}') >= w.starts_at
             AND (o.created_at AT TIME ZONE '${timeZone}') < w.starts_at + INTERVAL '1 month'
         )
         SELECT
           COUNT(*) FILTER (WHERE status <> 'cancelled')::int AS orders,
           COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'), 0)::numeric AS revenue,
           COALESCE(ROUND(AVG(total) FILTER (WHERE status <> 'cancelled')), 0)::numeric AS "averageOrder",
           COUNT(*) FILTER (WHERE status = 'cancelled')::int AS "cancelledOrders",
           COALESCE((
             SELECT SUM((line.value->>'quantity')::int)
             FROM month_orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) AS line(value)
             WHERE o.status <> 'cancelled'
           ), 0)::int AS "unitsSold"
         FROM month_orders`,
        [req.businessId],
      ),
      pool.query(
        `WITH local_today AS (
           SELECT (NOW() AT TIME ZONE '${timeZone}')::date AS day
         ), days AS (
           SELECT generate_series(day - 13, day, INTERVAL '1 day')::date AS day FROM local_today
         )
         SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
                COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'), 0)::numeric AS revenue,
                COUNT(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS orders
         FROM days
         LEFT JOIN customer_orders o ON o.business_id = $1
           AND (o.created_at AT TIME ZONE '${timeZone}')::date = days.day
         GROUP BY days.day ORDER BY days.day`,
        [req.businessId],
      ),
      pool.query(
        `WITH current_month AS (
           SELECT date_trunc('month', NOW() AT TIME ZONE '${timeZone}') AS month_start
         ), months AS (
           SELECT generate_series(month_start - INTERVAL '11 months', month_start, INTERVAL '1 month') AS month_start
           FROM current_month
         )
         SELECT to_char(months.month_start, 'YYYY-MM') AS month,
                COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'), 0)::numeric AS revenue,
                COUNT(o.id) FILTER (WHERE o.status <> 'cancelled')::int AS orders
         FROM months
         LEFT JOIN customer_orders o ON o.business_id = $1
           AND (o.created_at AT TIME ZONE '${timeZone}') >= months.month_start
           AND (o.created_at AT TIME ZONE '${timeZone}') < months.month_start + INTERVAL '1 month'
         GROUP BY months.month_start ORDER BY months.month_start`,
        [req.businessId],
      ),
      pool.query(
        `WITH month_window AS (
           SELECT date_trunc('month', NOW() AT TIME ZONE '${timeZone}') AS starts_at
         )
         SELECT COALESCE(NULLIF(line.value->>'category', ''), bp.category, 'Sin categoría') AS category,
                SUM((line.value->>'quantity')::int)::int AS units,
                COALESCE(SUM((line.value->>'quantity')::numeric * COALESCE(NULLIF(line.value->>'unitPrice', '')::numeric, bp.price, 0)), 0)::numeric AS revenue
         FROM customer_orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) AS line(value)
         CROSS JOIN month_window w
         LEFT JOIN business_products bp ON bp.id = NULLIF(line.value->>'id', '')::bigint AND bp.business_id = $1
         WHERE o.business_id = $1 AND o.status <> 'cancelled'
           AND (o.created_at AT TIME ZONE '${timeZone}') >= w.starts_at
           AND (o.created_at AT TIME ZONE '${timeZone}') < w.starts_at + INTERVAL '1 month'
         GROUP BY 1 ORDER BY units DESC, revenue DESC LIMIT 8`,
        [req.businessId],
      ),
      pool.query(
        `WITH month_window AS (
           SELECT date_trunc('month', NOW() AT TIME ZONE '${timeZone}') AS starts_at
         )
         SELECT line.value->>'name' AS name,
                COALESCE(NULLIF(line.value->>'category', ''), bp.category, 'Sin categoría') AS category,
                SUM((line.value->>'quantity')::int)::int AS units,
                COALESCE(SUM((line.value->>'quantity')::numeric * COALESCE(NULLIF(line.value->>'unitPrice', '')::numeric, bp.price, 0)), 0)::numeric AS revenue
         FROM customer_orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) AS line(value)
         CROSS JOIN month_window w
         LEFT JOIN business_products bp ON bp.id = NULLIF(line.value->>'id', '')::bigint AND bp.business_id = $1
         WHERE o.business_id = $1 AND o.status <> 'cancelled'
           AND (o.created_at AT TIME ZONE '${timeZone}') >= w.starts_at
           AND (o.created_at AT TIME ZONE '${timeZone}') < w.starts_at + INTERVAL '1 month'
         GROUP BY 1, 2 ORDER BY units DESC, revenue DESC LIMIT 8`,
        [req.businessId],
      ),
    ])

    const summary = summaryResult.rows[0]
    res.json({
      summary: {
        revenue: Number(summary.revenue),
        orders: summary.orders,
        averageOrder: Number(summary.averageOrder),
        cancelledOrders: summary.cancelledOrders,
        unitsSold: summary.unitsSold,
      },
      daily: dailyResult.rows.map((row) => ({ ...row, revenue: Number(row.revenue) })),
      monthly: monthlyResult.rows.map((row) => ({ ...row, revenue: Number(row.revenue) })),
      categories: categoryResult.rows.map((row) => ({ ...row, revenue: Number(row.revenue) })),
      products: productResult.rows.map((row) => ({ ...row, revenue: Number(row.revenue) })),
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/partner/import-catalog', authenticate, requirePartner, requireVip, async (req, res, next) => {
  const body = req.body || {}
  const categoryRows = Array.isArray(body.categories) ? body.categories : []
  const productRows = Array.isArray(body.products) ? body.products : []
  const rewardRows = Array.isArray(body.rewards) ? body.rewards : []
  if (categoryRows.length > 100 || productRows.length > 500 || rewardRows.length > 200
    || categoryRows.length + productRows.length + rewardRows.length === 0) {
    return res.status(400).json({ error: 'El archivo debe incluir hasta 100 categorías, 500 productos y 200 canjes.' })
  }

  const importedCategories = []
  const categoryKeys = new Set()
  for (const value of [...categoryRows, ...productRows.map((product) => product?.category)]) {
    if (typeof value !== 'string') return res.status(400).json({ error: 'Hay una categoría vacía o inválida en el archivo.' })
    const name = value.trim()
    if (!name || name.length > 60) return res.status(400).json({ error: 'Cada categoría debe tener entre 1 y 60 caracteres.' })
    const key = name.toLocaleLowerCase('es')
    if (!categoryKeys.has(key)) {
      categoryKeys.add(key)
      importedCategories.push(name)
    }
  }

  const products = productRows.map((row) => readProductInput({ ...row, imageDataUrl: '' }))
  if (products.some((product) => !product)) {
    return res.status(400).json({ error: 'Revisá los nombres, categorías, precios y puntos de los productos del archivo.' })
  }
  const rewards = rewardRows.map((row) => {
    const reward = readRewardInput(row)
    if (!reward) return null
    return {
      ...reward,
      productName: typeof row?.productName === 'string' ? row.productName.trim() : '',
      productCategory: typeof row?.productCategory === 'string' ? row.productCategory.trim() : '',
    }
  })
  if (rewards.some((reward) => !reward)) {
    return res.status(400).json({ error: 'Revisá los nombres, descripciones y puntos necesarios de los canjes.' })
  }

  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows: currentCategories } = await client.query(
      'SELECT name FROM business_categories WHERE business_id = $1',
      [req.businessId],
    )
    const availableCategories = new Set([...currentCategories.map((category) => category.name.toLocaleLowerCase('es')), ...categoryKeys])
    if (products.some((product) => !availableCategories.has(product.category.toLocaleLowerCase('es')))) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(400).json({ error: 'Cada producto debe pertenecer a una categoría existente o incluida en el archivo.' })
    }

    let categoriesCreated = 0
    let productsCreated = 0
    let productsUpdated = 0
    let rewardsCreated = 0
    let rewardsUpdated = 0
    for (const name of importedCategories) {
      const result = await client.query(
        'INSERT INTO business_categories (business_id, name) VALUES ($1, $2) ON CONFLICT (business_id, name) DO NOTHING',
        [req.businessId, name],
      )
      categoriesCreated += result.rowCount
    }

    for (const product of products) {
      const { rows } = await client.query(
        `SELECT id FROM business_products WHERE business_id = $1 AND lower(name) = lower($2)
         AND lower(category) = lower($3) ORDER BY is_available DESC, id LIMIT 1 FOR UPDATE`,
        [req.businessId, product.name, product.category],
      )
      if (rows[0]) {
        await client.query(
          `UPDATE business_products SET description = $1, price = $2, points_per_unit = $3,
             is_available = TRUE WHERE id = $4`,
          [product.description, product.price, product.pointsPerUnit, rows[0].id],
        )
        productsUpdated += 1
      } else {
        await client.query(
          `INSERT INTO business_products (business_id, name, description, category, price, points_per_unit)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.businessId, product.name, product.description, product.category, product.price, product.pointsPerUnit],
        )
        productsCreated += 1
      }
    }

    for (const reward of rewards) {
      let productId = reward.productId
      if (reward.rewardType === 'product') {
        const { rows: matchingProducts } = await client.query(
          `SELECT id FROM business_products WHERE business_id = $1 AND is_available = TRUE
           AND lower(name) = lower($2) AND lower(category) = lower($3) ORDER BY id LIMIT 1 FOR UPDATE`,
          [req.businessId, reward.productName, reward.productCategory],
        )
        if (!reward.productName || !reward.productCategory || !matchingProducts[0]) {
          await client.query('ROLLBACK')
          transactionStarted = false
          return res.status(400).json({ error: `El producto asociado al canje "${reward.name}" no existe en esa categoría.` })
        }
        productId = matchingProducts[0].id
      }
      const { rows } = await client.query(
        'SELECT id FROM business_rewards WHERE business_id = $1 AND lower(name) = lower($2) ORDER BY is_available DESC, id LIMIT 1 FOR UPDATE',
        [req.businessId, reward.name],
      )
      if (rows[0]) {
        await client.query(
          `UPDATE business_rewards SET description = $1, points_cost = $2, reward_type = $3,
             product_id = $4, discount_type = $5, discount_value = $6, is_available = TRUE WHERE id = $7`,
           [reward.description, reward.pointsCost, reward.rewardType, productId, reward.discountType, reward.discountValue, rows[0].id],
        )
        rewardsUpdated += 1
      } else {
        await client.query(
          `INSERT INTO business_rewards (business_id, name, description, reward_type, product_id, discount_type, discount_value, points_cost)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [req.businessId, reward.name, reward.description, reward.rewardType, productId, reward.discountType, reward.discountValue, reward.pointsCost],
        )
        rewardsCreated += 1
      }
    }

    await client.query('COMMIT')
    transactionStarted = false
    res.json({ categoriesCreated, productsCreated, productsUpdated, rewardsCreated, rewardsUpdated })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.get('/api/partner/orders', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
            `SELECT o.id, o.total, o.subtotal, o.discount_amount AS "discountAmount",
              o.discount_name AS "discountName", o.discount_points_spent AS "discountPointsSpent",
                    o.product_reward_name AS "productRewardName",
                    o.product_reward_points_spent AS "productRewardPointsSpent",
              o.delivery_address AS "deliveryAddress", o.fulfillment_type AS "fulfillmentType", o.payment_method AS "paymentMethod",
              o.customer_notes AS "customerNotes", o.public_code AS "publicCode",
              o.delivery_reference AS "deliveryReference", o.cash_payment_amount AS "cashPaymentAmount",
              o.delivery_lat AS "deliveryLat", o.delivery_lng AS "deliveryLng",
              o.points_awarded AS "pointsAwarded", o.items, o.status,
              o.created_at AS "createdAt", c.first_name AS "firstName",
              c.last_name AS "lastName", c.phone
       FROM customer_orders o JOIN customers c ON c.id = o.customer_id
       WHERE o.business_id = $1 ORDER BY o.created_at DESC LIMIT 500`,
      [req.businessId],
    )
    const { rows: shifts } = await pool.query('SELECT orders_shift_started_at AS "shiftStartedAt" FROM businesses WHERE id = $1', [req.businessId])
    res.json({ orders: rows, shiftStartedAt: shifts[0]?.shiftStartedAt || null })
  } catch (error) {
    next(error)
  }
})

app.post('/api/partner/orders/new-shift', authenticate, requirePartner, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'UPDATE businesses SET orders_shift_started_at = NOW() WHERE id = $1 RETURNING orders_shift_started_at AS "shiftStartedAt"',
      [req.businessId],
    )
    res.json({ shiftStartedAt: rows[0].shiftStartedAt })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/partner/orders/:id', authenticate, requirePartner, async (req, res, next) => {
  const orderId = Number(req.params.id)
  const nextStatus = req.body?.status
  if (!Number.isSafeInteger(orderId) || orderId < 1 || !['sent', 'cancelled'].includes(nextStatus)) {
    return res.status(400).json({ error: 'El estado del pedido no es válido.' })
  }
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows } = await client.query(
      `SELECT customer_id, points_awarded, status, discount_points_spent, discount_redemption_id
              , product_reward_points_spent, product_reward_redemption_id,               referrer_id, referral_points_awarded, referral_credited
       FROM customer_orders WHERE id = $1 AND business_id = $2 FOR UPDATE`,
      [orderId, req.businessId],
    )
    const order = rows[0]
    if (!order) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(404).json({ error: 'No se encontró el pedido en tu local.' })
    }
    if (order.status === 'cancelled' || (order.status === 'sent' && nextStatus === 'sent')) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(409).json({ error: 'Ese pedido ya tiene ese estado y no se puede modificar.' })
    }
    if (nextStatus === 'cancelled') {
      await adjustPoints(
        client, order.customer_id, req.businessId,
        -order.points_awarded + order.discount_points_spent + order.product_reward_points_spent,
      )
      if (order.referral_credited) {
        await adjustPoints(client, order.referrer_id, req.businessId, -order.referral_points_awarded)
        await client.query('UPDATE customer_orders SET referral_credited = FALSE WHERE id = $1', [orderId])
      }
      if (order.discount_redemption_id) {
        await client.query(
          "UPDATE business_redemptions SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
          [order.discount_redemption_id],
        )
      }
      if (order.product_reward_redemption_id) {
        await client.query(
          "UPDATE business_redemptions SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
          [order.product_reward_redemption_id],
        )
      }
    }
    if (nextStatus === 'sent' && order.referrer_id && order.referral_points_awarded > 0 && !order.referral_credited) {
      await adjustPoints(client, order.referrer_id, req.businessId, order.referral_points_awarded)
      await client.query('UPDATE customer_orders SET referral_credited = TRUE WHERE id = $1', [orderId])
    }
    await client.query(
      'UPDATE customer_orders SET status = $1, status_changed_at = NOW() WHERE id = $2',
      [nextStatus, orderId],
    )
    await client.query('COMMIT')
    transactionStarted = false
    res.json({ orderId, status: nextStatus })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

app.post('/api/auth/login', rateLimit('login', 20, 15 * 60_000), async (req, res, next) => {
  const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier : ''
  const email = normalizeEmail(req.body?.email || (identifier.includes('@') ? identifier : ''))
  const phone = normalizePhone(req.body?.phone || (!email ? identifier : ''))
  const password = req.body?.password
  try {
    const { rows } = await pool.query(
      `SELECT id, first_name, last_name, phone, email, password_hash, role, business_name, business_id
       FROM customers WHERE ($1 <> '' AND lower(email) = $1) OR ($2 <> '' AND phone = $2) LIMIT 1`,
      [email, phone],
    )
    let customer = rows[0]
    if (!customer || typeof password !== 'string' || !(await bcrypt.compare(password, customer.password_hash))) {
      return res.status(401).json({ error: 'Email, celular o contraseña incorrectos.' })
    }
    if (req.body?.portal === 'partner' && customer.role === 'customer') {
      const code = typeof req.body?.activationCode === 'string' ? req.body.activationCode.trim() : ''
      if (!/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(code)) {
        const { rows: approvedApplications } = await pool.query(
          `SELECT id FROM local_applications
           WHERE (($1 <> '' AND lower(email) = $1) OR ($1 = '' AND email IS NULL AND phone = $2))
             AND status = 'approved' AND claimed_at IS NULL
           LIMIT 1`,
          [email, phone],
        )
        if (approvedApplications[0]) {
          return res.status(403).json({
            error: 'Ingresá el código de activación que te enviamos para continuar.',
            code: 'activation_required',
          })
        }
        return res.status(403).json({ error: 'Este acceso es solo para cuentas de locales aprobadas.' })
      }
      const client = await pool.connect()
      let transactionStarted = false
      try {
        await client.query('BEGIN')
        transactionStarted = true
        const { rows: applications } = await client.query(
          `SELECT id, business_id, business_name FROM local_applications
           WHERE (($2 <> '' AND lower(email) = $2) OR ($2 = '' AND email IS NULL AND phone = $3))
             AND activation_code_hash = $1 AND activation_expires_at > NOW()
             AND status = 'approved' AND claimed_at IS NULL FOR UPDATE`,
          [activationHash(code), email, phone],
        )
        const application = applications[0]
        if (!application) {
          await client.query('ROLLBACK')
          transactionStarted = false
          return res.status(400).json({ error: 'El código es incorrecto o venció. Pedí uno nuevo al administrador.' })
        }
        const { rows: claimedCustomers } = await client.query(
          `UPDATE customers SET role = 'local_owner', business_name = $1, business_id = $2
           WHERE id = $3 AND role = 'customer'
           RETURNING id, first_name, last_name, phone, password_hash, role, business_name, business_id`,
          [application.business_name, application.business_id, customer.id],
        )
        if (!claimedCustomers[0]) {
          await client.query('ROLLBACK')
          transactionStarted = false
          return res.status(403).json({ error: 'Esta cuenta no puede activar un local.' })
        }
        customer = claimedCustomers[0]
        await client.query(
          'UPDATE local_applications SET activation_code_hash = NULL, activation_expires_at = NULL, claimed_at = NOW() WHERE id = $1',
          [application.id],
        )
        await client.query('UPDATE businesses SET subscription_due_at = NOW() + make_interval(days => $2) WHERE id = $1', [application.business_id, BILLING_INITIAL_TRIAL_DAYS])
        await client.query('COMMIT')
        transactionStarted = false
      } catch (error) {
        if (transactionStarted) await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    } else if (req.body?.portal === 'partner' && !['local_owner', 'admin'].includes(customer.role)) {
      return res.status(403).json({ error: 'Este acceso es solo para cuentas de locales ya creados.' })
    }
    const safeCustomer = publicCustomer(customer, await getBusinessPoints(customer.id, req.body?.businessSlug))
    res.json({ token: createToken(safeCustomer), user: safeCustomer })
  } catch (error) {
    next(error)
  }
})

app.get('/api/auth/me', authenticate, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, first_name, last_name, phone, role, business_name, business_id FROM customers WHERE id = $1',
      [req.customerId],
    )
    if (!rows[0]) return res.status(401).json({ error: 'La cuenta ya no está disponible.' })
    res.json(publicCustomer(rows[0], await getBusinessPoints(req.customerId, req.query.businessSlug)))
  } catch (error) {
    next(error)
  }
})

app.post('/api/orders', authenticate, requireCustomer, async (req, res, next) => {
  const requestedItems = req.body?.items
  const discountRewardId = req.body?.discountRewardId == null ? null : Number(req.body.discountRewardId)
  const productRewardId = req.body?.productRewardId == null ? null : Number(req.body.productRewardId)
  if (!Array.isArray(requestedItems) || requestedItems.length > 30
    || (requestedItems.length === 0 && productRewardId === null)) {
    return res.status(400).json({ error: 'El pedido no contiene productos válidos.' })
  }
  const requestedAddonIds = []
  for (const requestedItem of requestedItems) {
    const addonIds = requestedItem?.addonIds ?? []
    if (!Array.isArray(addonIds) || addonIds.length > 12
      || addonIds.some((id) => !Number.isSafeInteger(Number(id)) || Number(id) < 1)
      || new Set(addonIds.map(String)).size !== addonIds.length) {
      return res.status(400).json({ error: 'La selección de agregados no es válida.' })
    }
    requestedAddonIds.push(...addonIds.map(Number))
  }

  const businessSlug = typeof req.body?.businessSlug === 'string' ? req.body.businessSlug : ''
  const referralCode = typeof req.body?.referralCode === 'string' && /^[0-9A-Z]{10}$/i.test(req.body.referralCode.trim())
    ? req.body.referralCode.trim().toUpperCase()
    : ''
  if (discountRewardId !== null && (!Number.isSafeInteger(discountRewardId) || discountRewardId < 1)
    || productRewardId !== null && (!Number.isSafeInteger(productRewardId) || productRewardId < 1)
    || (discountRewardId !== null && productRewardId !== null)
    || ((discountRewardId !== null || productRewardId !== null) && !businessSlug)) {
    return res.status(400).json({ error: 'El canje seleccionado no es válido para este pedido.' })
  }
  if (discountRewardId !== null && requestedItems.length === 0) {
    return res.status(400).json({ error: 'Agregá productos a la compra para aplicar el descuento.' })
  }
  const fulfillmentType = typeof req.body?.fulfillmentType === 'string' ? req.body.fulfillmentType : ''
  const deliveryAddress = fulfillmentType === 'delivery' && typeof req.body?.deliveryAddress === 'string' ? req.body.deliveryAddress.trim() : ''
  const paymentMethod = typeof req.body?.paymentMethod === 'string' ? req.body.paymentMethod : ''
  const customerNotes = typeof req.body?.customerNotes === 'string' ? req.body.customerNotes.trim() : ''
  const deliveryReference = fulfillmentType === 'delivery' && typeof req.body?.deliveryReference === 'string' ? req.body.deliveryReference.trim() : ''
  const rawCashAmount = req.body?.cashPaymentAmount
  const cashPaymentAmount = paymentMethod === 'cash' && rawCashAmount != null && rawCashAmount !== '' ? Number(rawCashAmount) : null
  const lat = Number(req.body?.deliveryLat)
  const lng = Number(req.body?.deliveryLng)
  const hasCoordinates = fulfillmentType === 'delivery' && req.body?.deliveryLat != null && req.body?.deliveryLng != null
  if (businessSlug && (!['delivery', 'pickup'].includes(fulfillmentType)
    || (fulfillmentType === 'delivery' && (!deliveryAddress || deliveryAddress.length > 200))
    || deliveryReference.length > 200
    || (cashPaymentAmount !== null && (!Number.isSafeInteger(cashPaymentAmount) || cashPaymentAmount < 1 || cashPaymentAmount > 100_000_000))
    || (hasCoordinates && (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180))
    || !['mercado_pago', 'cash'].includes(paymentMethod) || customerNotes.length > 300)) {
    return res.status(400).json({ error: 'Elegí delivery o retiro, completá la dirección si corresponde y elegí un método de pago.' })
  }
  const deliveryLat = hasCoordinates ? lat : null
  const deliveryLng = hasCoordinates ? lng : null
  let businessId = null
  let businessPlan = 'basic'
  let bonusPointsDays = []
  let referralEnabled = false
  let referralPoints = 0
  let productById = menuById
  const addonById = new Map()
  if (businessSlug) {
    try {
      const { rows: businesses } = await pool.query(
        'SELECT id, plan, delivery_enabled AS "deliveryEnabled", addons_enabled AS "addonsEnabled", bonus_points_days AS "bonusPointsDays", referral_enabled AS "referralEnabled", referral_points AS "referralPoints" FROM businesses WHERE slug = $1',
        [businessSlug],
      )
      if (!businesses[0]) return res.status(404).json({ error: 'No encontramos ese local.' })
      if (await isBusinessSuspended(pool, businesses[0].id)) return res.status(403).json({ error: 'Este local no está disponible por el momento.' })
      if (fulfillmentType === 'delivery' && !businesses[0].deliveryEnabled) return res.status(400).json({ error: 'Este local no ofrece envios a domicilio.' })
      if (requestedAddonIds.length && !businesses[0].addonsEnabled) return res.status(400).json({ error: 'Este local no ofrece agregados.' })
      businessId = businesses[0].id
      businessPlan = businesses[0].plan
      bonusPointsDays = businesses[0].bonusPointsDays
      referralEnabled = businesses[0].referralEnabled
      referralPoints = businesses[0].referralPoints
      const { rows: products } = await pool.query(
        `SELECT id, name, description, category, price, points_per_unit AS "pointsPerUnit"
         FROM business_products WHERE business_id = $1 AND is_available = TRUE`,
        [businessId],
      )
      productById = new Map(products.map((product) => [String(product.id), product]))
      if (requestedAddonIds.length) {
        const uniqueAddonIds = [...new Set(requestedAddonIds)]
        const { rows: addons } = await pool.query(
          `SELECT a.id, a.name, a.price, c.name AS category
           FROM business_category_addons a JOIN business_categories c ON c.id = a.category_id
           WHERE a.business_id = $1 AND a.is_available = TRUE AND a.id = ANY($2::bigint[])`,
          [businessId, uniqueAddonIds],
        )
        if (addons.length !== uniqueAddonIds.length) {
          return res.status(400).json({ error: 'Uno o más agregados ya no están disponibles.' })
        }
        for (const addon of addons) addonById.set(String(addon.id), addon)
      }
    } catch (error) {
      return next(error)
    }
  }
  if (requestedAddonIds.length && !businessId) {
    return res.status(400).json({ error: 'Los agregados solo están disponibles en productos de un local.' })
  }

  const items = []
  for (const requestedItem of requestedItems) {
    const product = productById.get(businessId ? String(requestedItem?.id) : requestedItem?.id)
    const quantity = requestedItem?.quantity
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      return res.status(400).json({ error: 'Hay productos o cantidades inválidas en el pedido.' })
    }
    const selectedAddons = (requestedItem.addonIds || []).map((id) => addonById.get(String(id)))
    if (selectedAddons.some((addon) => !addon || addon.category !== product.category)) {
      return res.status(400).json({ error: 'Los agregados deben corresponder a la categoría del producto.' })
    }
    const addonTotal = selectedAddons.reduce((sum, addon) => sum + addon.price, 0)
    items.push({
      id: product.id,
      name: product.name,
      category: product.category,
      quantity,
      unitPrice: product.price + addonTotal,
      baseUnitPrice: product.price,
      addOns: selectedAddons.map(({ id, name, price }) => ({ id, name, price })),
      pointsPerUnit: product.pointsPerUnit || 0,
    })
  }

  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const basePointsAwarded = businessId
    ? items.reduce((sum, item) => sum + item.pointsPerUnit * item.quantity, 0)
    : Math.floor(subtotal / 1000)
  const bonusApplied = hasDoublePointsToday(businessPlan, bonusPointsDays)
  const pointsAwarded = basePointsAwarded * (bonusApplied ? 2 : 1)
  const client = await pool.connect()
  let transactionStarted = false
  try {
    await client.query('BEGIN')
    transactionStarted = true
    const { rows: customers } = await client.query(
      'SELECT role FROM customers WHERE id = $1 FOR UPDATE',
      [req.customerId],
    )
    if (customers[0]?.role !== 'customer') {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(403).json({ error: 'Solo las cuentas de cliente pueden realizar pedidos.' })
    }
    const currentPoints = businessId ? await lockPoints(client, req.customerId, businessId) : 0

    let discountAmount = 0
    let discountName = ''
    let discountPointsSpent = 0
    let discountRedemptionId = null
    let productRewardName = ''
    let productRewardPointsSpent = 0
    let productRewardRedemptionId = null
    let productRewardItem = null
    if (discountRewardId !== null) {
      const { rows: discountRewards } = await client.query(
        `SELECT id, name, points_cost, discount_type, discount_value FROM business_rewards
         WHERE id = $1 AND business_id = $2 AND reward_type = 'discount' AND is_available = TRUE FOR UPDATE`,
        [discountRewardId, businessId],
      )
      const discountReward = discountRewards[0]
      if (!discountReward) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return res.status(404).json({ error: 'Ese descuento ya no está disponible.' })
      }
      if (currentPoints < discountReward.points_cost) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return res.status(400).json({ error: 'Ya no tenés puntos suficientes para aplicar ese descuento.' })
      }
      discountAmount = discountReward.discount_type === 'percentage'
        ? Math.round(subtotal * discountReward.discount_value / 100)
        : Math.min(subtotal, discountReward.discount_value)
      discountName = discountReward.name
      discountPointsSpent = discountReward.points_cost
      const { rows: redemptions } = await client.query(
        `INSERT INTO business_redemptions (business_id, customer_id, reward_id, points_spent, status)
         VALUES ($1, $2, $3, $4, 'fulfilled') RETURNING id`,
        [businessId, req.customerId, discountReward.id, discountReward.points_cost],
      )
      discountRedemptionId = redemptions[0].id
    }

    if (productRewardId !== null) {
      const { rows: productRewards } = await client.query(
        `SELECT r.id, r.name, r.points_cost, p.id AS product_id, p.name AS product_name,
                p.category, p.image_data_url AS "imageDataUrl"
         FROM business_rewards r
         JOIN business_products p ON p.id = r.product_id AND p.business_id = r.business_id AND p.is_available = TRUE
         WHERE r.id = $1 AND r.business_id = $2 AND r.reward_type = 'product' AND r.is_available = TRUE
         FOR UPDATE OF r, p`,
        [productRewardId, businessId],
      )
      const productReward = productRewards[0]
      if (!productReward) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return res.status(404).json({ error: 'Ese producto de canje ya no está disponible.' })
      }
      if (currentPoints < productReward.points_cost) {
        await client.query('ROLLBACK')
        transactionStarted = false
        return res.status(400).json({ error: 'Ya no tenés puntos suficientes para ese producto.' })
      }
      const { rows: redemptions } = await client.query(
        `INSERT INTO business_redemptions (business_id, customer_id, reward_id, points_spent, status)
         VALUES ($1, $2, $3, $4, 'fulfilled') RETURNING id`,
        [businessId, req.customerId, productReward.id, productReward.points_cost],
      )
      productRewardName = productReward.name
      productRewardPointsSpent = productReward.points_cost
      productRewardRedemptionId = redemptions[0].id
      productRewardItem = {
        id: productReward.product_id,
        name: productReward.product_name,
        category: productReward.category,
        quantity: 1,
        unitPrice: 0,
        pointsPerUnit: 0,
        isReward: true,
        rewardName: productReward.name,
        pointsSpent: productReward.points_cost,
      }
    }

    const total = subtotal - discountAmount
    if (cashPaymentAmount !== null && cashPaymentAmount < total) {
      await client.query('ROLLBACK')
      transactionStarted = false
      return res.status(400).json({ error: 'El monto con el que pagás no puede ser menor al total del pedido.' })
    }
    if (productRewardItem) items.push(productRewardItem)
    const publicCode = generatePublicCode()
    let referrerId = null
    let referralPointsAwarded = 0
    if (businessId && referralEnabled && referralPoints > 0 && referralCode) {
      const { rows: referrers } = await client.query(
        "SELECT id FROM customers WHERE referral_code = $1 AND role = 'customer' AND id <> $2",
        [referralCode, req.customerId],
      )
      const { rowCount: previousOrders } = await client.query(
        "SELECT 1 FROM customer_orders WHERE customer_id = $1 AND business_id = $2 AND status <> 'cancelled' LIMIT 1",
        [req.customerId, businessId],
      )
      if (referrers[0] && !previousOrders) {
        referrerId = referrers[0].id
        referralPointsAwarded = referralPoints
      }
    }
    const orderResult = await client.query(
      `INSERT INTO customer_orders (
         customer_id, business_id, total, subtotal, discount_amount, discount_name,
         discount_points_spent, discount_redemption_id, product_reward_name,
         product_reward_points_spent, product_reward_redemption_id, points_awarded, items,
         delivery_address, payment_method, customer_notes, fulfillment_type,
         public_code, delivery_reference, cash_payment_amount, delivery_lat, delivery_lng,
         referrer_id, referral_points_awarded
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       RETURNING id, total, subtotal, discount_amount AS "discountAmount", points_awarded, items, created_at AS "createdAt"`,
      [req.customerId, businessId, total, subtotal, discountAmount, discountName, discountPointsSpent, discountRedemptionId, productRewardName, productRewardPointsSpent, productRewardRedemptionId, pointsAwarded, JSON.stringify(items), deliveryAddress, paymentMethod, customerNotes, fulfillmentType, publicCode, deliveryReference, cashPaymentAmount, deliveryLat, deliveryLng, referrerId, referralPointsAwarded],
    )
    const customerResult = await client.query(
      'SELECT id, first_name, last_name, phone, role, business_name, business_id FROM customers WHERE id = $1',
      [req.customerId],
    )
    const updatedPoints = businessId
      ? await adjustPoints(client, req.customerId, businessId, pointsAwarded - discountPointsSpent - productRewardPointsSpent)
      : 0
    await client.query('COMMIT')
    transactionStarted = false
    res.status(201).json({
      order: {
        id: orderResult.rows[0].id,
        createdAt: orderResult.rows[0].createdAt,
        deliveryAddress,
        deliveryReference,
        deliveryLat,
        deliveryLng,
        cashPaymentAmount,
        publicCode,
        fulfillmentType,
        paymentMethod,
        customerNotes,
        total: orderResult.rows[0].total,
        subtotal: orderResult.rows[0].subtotal,
        discountAmount: orderResult.rows[0].discountAmount,
        discountName,
        discountPointsSpent,
        productRewardName,
        productRewardPointsSpent,
        items: orderResult.rows[0].items,
        pointsEarned: orderResult.rows[0].points_awarded,
        bonusApplied,
      },
      user: publicCustomer(customerResult.rows[0], updatedPoints),
    })
  } catch (error) {
    if (transactionStarted) await client.query('ROLLBACK')
    next(error)
  } finally {
    client.release()
  }
})

const frontendDist = fileURLToPath(new URL('../FrontEnd/dist', import.meta.url))
if (existsSync(frontendDist)) {
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }))
  app.use(express.static(frontendDist))
  app.get('/{*splat}', (_req, res) => res.sendFile(join(frontendDist, 'index.html')))
}

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'Ocurrió un error en el servidor.' })
})

const port = Number(process.env.PORT || 3000)
initializeDatabase()
  .then(() => app.listen(port, () => console.log(`Dotty API escuchando en puerto ${port}`)))
  .catch((error) => {
    console.error('No se pudo iniciar la API:', error.message)
    process.exitCode = 1
  })
