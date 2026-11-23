import bcrypt from 'bcryptjs'
import { pool } from './pool.js'

const administratorAccounts = [
  { email: 'mariaquintana520@gmail.com', password: process.env.ADMIN_PASSWORD_1 },
]
export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS businesses (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(120) NOT NULL UNIQUE,
      plan VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (plan IN ('basic', 'vip', 'vip_plus')),
      description TEXT NOT NULL DEFAULT '',
      logo_data_url TEXT NOT NULL DEFAULT '',
      logo_scale REAL NOT NULL DEFAULT 1,
      banner_data_url TEXT NOT NULL DEFAULT '',
      primary_color VARCHAR(7) NOT NULL DEFAULT '#c95031',
      secondary_color VARCHAR(7) NOT NULL DEFAULT '#58705e',
      font_family VARCHAR(20) NOT NULL DEFAULT 'original',
      address VARCHAR(200) NOT NULL DEFAULT '',
      opening_hours TEXT NOT NULL DEFAULT '',
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
    ALTER TABLE businesses ADD COLUMN IF NOT EXISTS pending_plan VARCHAR(20) CHECK (pending_plan IN ('basic', 'vip', 'vip_plus'));
    ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_plan_check;
    ALTER TABLE businesses ADD CONSTRAINT businesses_plan_check CHECK (plan IN ('basic', 'vip', 'vip_plus'));
    ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_pending_plan_check;
    ALTER TABLE businesses ADD CONSTRAINT businesses_pending_plan_check CHECK (pending_plan IN ('basic', 'vip', 'vip_plus'));
    UPDATE businesses SET plan = pending_plan, pending_plan = NULL WHERE pending_plan IS NOT NULL;
    ALTER TABLE businesses ALTER COLUMN opening_hours TYPE TEXT;
    CREATE TABLE IF NOT EXISTS business_videos (
      id BIGSERIAL PRIMARY KEY,
      business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      original_name VARCHAR(200) NOT NULL,
      mime_type VARCHAR(40) NOT NULL,
      size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
      video_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
      phone VARCHAR(16) UNIQUE,
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
    ALTER TABLE customers ALTER COLUMN phone DROP NOT NULL;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS email VARCHAR(254);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'local_owner', 'admin'));
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_name VARCHAR(100);
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_id BIGINT REFERENCES businesses(id);
    ALTER TABLE customers ALTER COLUMN password_hash DROP NOT NULL;
    ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_points_check;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_code VARCHAR(12);
    CREATE UNIQUE INDEX IF NOT EXISTS customers_email_unique_idx ON customers (lower(email)) WHERE email IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS customers_referral_code_idx ON customers (referral_code) WHERE referral_code IS NOT NULL;
    UPDATE customers SET phone = NULL WHERE role = 'admin';
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
      fractional_parts SMALLINT NOT NULL DEFAULT 0 CHECK (fractional_parts = 0 OR fractional_parts BETWEEN 2 AND 12),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (business_id, name)
    );
    ALTER TABLE business_categories ADD COLUMN IF NOT EXISTS fractional_parts SMALLINT NOT NULL DEFAULT 0;
    ALTER TABLE business_categories ADD COLUMN IF NOT EXISTS sort_order INTEGER;
    CREATE TABLE IF NOT EXISTS business_category_addons (
      id BIGSERIAL PRIMARY KEY,
      business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      category_id BIGINT NOT NULL REFERENCES business_categories(id) ON DELETE CASCADE,
      product_id BIGINT REFERENCES business_products(id) ON DELETE CASCADE,
      name VARCHAR(80) NOT NULL,
      price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
      group_name VARCHAR(80) NOT NULL DEFAULT 'Opciones adicionales',
      selection_mode VARCHAR(12) NOT NULL DEFAULT 'multiple',
      required_two BOOLEAN NOT NULL DEFAULT FALSE,
      is_available BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE business_category_addons ADD COLUMN IF NOT EXISTS group_name VARCHAR(80) NOT NULL DEFAULT 'Opciones adicionales';
    ALTER TABLE business_category_addons ADD COLUMN IF NOT EXISTS selection_mode VARCHAR(12) NOT NULL DEFAULT 'multiple';
    ALTER TABLE business_category_addons ADD COLUMN IF NOT EXISTS product_id BIGINT REFERENCES business_products(id) ON DELETE CASCADE;
    ALTER TABLE business_category_addons ADD COLUMN IF NOT EXISTS required_two BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE business_category_addons ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT FALSE;
    CREATE INDEX IF NOT EXISTS business_category_addons_active_idx ON business_category_addons (business_id, category_id, is_available);
    DROP INDEX IF EXISTS business_category_addons_name_idx;
    DROP INDEX IF EXISTS business_category_addons_group_name_idx;
    CREATE UNIQUE INDEX IF NOT EXISTS business_category_addons_product_group_idx ON business_category_addons (category_id, COALESCE(product_id, 0), lower(group_name), lower(name));
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
    ALTER TABLE business_rewards ADD COLUMN IF NOT EXISTS discount_scope VARCHAR(10) NOT NULL DEFAULT 'total' CHECK (discount_scope IN ('total', 'product', 'category'));
    ALTER TABLE business_rewards ADD COLUMN IF NOT EXISTS discount_category_id BIGINT REFERENCES business_categories(id) ON DELETE SET NULL;
    ALTER TABLE business_rewards ADD COLUMN IF NOT EXISTS available_days SMALLINT[];
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
      status VARCHAR(20) NOT NULL DEFAULT 'in_process' CHECK (status IN ('in_process', 'confirmed', 'sent', 'cancelled')),
      status_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS business_id BIGINT REFERENCES businesses(id);
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'in_process' CHECK (status IN ('in_process', 'sent', 'cancelled'));
    ALTER TABLE customer_orders DROP CONSTRAINT IF EXISTS customer_orders_status_check;
    ALTER TABLE customer_orders ADD CONSTRAINT customer_orders_status_check CHECK (status IN ('in_process', 'confirmed', 'sent', 'cancelled'));
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
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_floor VARCHAR(20) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_apartment VARCHAR(20) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS cash_payment_amount INTEGER;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_lat DOUBLE PRECISION;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS delivery_lng DOUBLE PRECISION;
    CREATE UNIQUE INDEX IF NOT EXISTS customer_orders_public_code_idx ON customer_orders (public_code) WHERE public_code IS NOT NULL;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS referrer_id BIGINT REFERENCES customers(id);
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS referral_points_awarded INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS referral_credited BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_notes VARCHAR(300) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_first_name VARCHAR(60) NOT NULL DEFAULT '';
    ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_last_name VARCHAR(60) NOT NULL DEFAULT '';
    UPDATE customer_orders SET subtotal = total WHERE subtotal = 0 AND discount_amount = 0 AND total > 0;
    ALTER TABLE customer_orders DROP CONSTRAINT IF EXISTS customer_orders_total_check;
    ALTER TABLE customer_orders ADD CONSTRAINT customer_orders_total_check CHECK (total >= 0);
    CREATE INDEX IF NOT EXISTS customer_orders_business_status_idx ON customer_orders (business_id, status, created_at DESC);
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT NOT NULL,
      business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (endpoint, business_id)
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_business_idx ON push_subscriptions (business_id);
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
      requested_plan VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (requested_plan IN ('basic', 'vip', 'vip_plus')),
      business_id BIGINT REFERENCES businesses(id),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'approved', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS support_messages (
      id BIGSERIAL PRIMARY KEY,
      business_id BIGINT REFERENCES businesses(id) ON DELETE SET NULL,
      business_name VARCHAR(100) NOT NULL,
      sender_name VARCHAR(120) NOT NULL DEFAULT '',
      sender_contact VARCHAR(254) NOT NULL DEFAULT '',
      kind VARCHAR(20) NOT NULL CHECK (kind IN ('question', 'suggestion', 'contact')),
      message VARCHAR(2000) NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE local_applications ADD COLUMN IF NOT EXISTS requested_plan VARCHAR(20) NOT NULL DEFAULT 'basic' CHECK (requested_plan IN ('basic', 'vip', 'vip_plus'));
    ALTER TABLE local_applications DROP CONSTRAINT IF EXISTS local_applications_requested_plan_check;
    ALTER TABLE local_applications ADD CONSTRAINT local_applications_requested_plan_check CHECK (requested_plan IN ('basic', 'vip', 'vip_plus'));
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
       VALUES ('Administrador', 'Dotty', NULL, $1, $2, 'admin')
       ON CONFLICT (lower(email)) WHERE email IS NOT NULL DO UPDATE SET
         first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name,
         phone = NULL,
         password_hash = EXCLUDED.password_hash,
         role = 'admin'`,
      [administrator.email, passwordHash],
    )
  }
}
