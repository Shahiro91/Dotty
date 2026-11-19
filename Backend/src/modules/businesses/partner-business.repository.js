import { pool } from '../../database/pool.js'

export async function getOverview(businessId) {
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
    [businessId],
  )
  return rows[0]
}

export async function listVideos(businessId) {
  const { rows } = await pool.query('SELECT id, original_name AS name, size_bytes AS "sizeBytes" FROM business_videos WHERE business_id = $1 ORDER BY created_at, id', [businessId])
  return rows
}

export async function getPlan(businessId) {
  const { rows } = await pool.query('SELECT plan FROM businesses WHERE id = $1', [businessId])
  return rows[0]
}

export async function setBonusDays(businessId, days) {
  const { rows } = await pool.query(
    `WITH previous AS (SELECT bonus_points_days FROM businesses WHERE id = $2 FOR UPDATE)
     UPDATE businesses SET bonus_points_days = $1 FROM previous WHERE id = $2
     RETURNING businesses.bonus_points_days AS "bonusPointsDays",
       NOT (previous.bonus_points_days @> businesses.bonus_points_days AND previous.bonus_points_days <@ businesses.bonus_points_days) AS changed`,
    [days, businessId],
  )
  return rows[0]
}

export async function setReferrals(businessId, enabled, points) {
  const { rows } = await pool.query(
    `UPDATE businesses SET referral_enabled = $1, referral_points = $2 WHERE id = $3
     RETURNING referral_enabled AS "referralEnabled", referral_points AS "referralPoints"`,
    [enabled, points, businessId],
  )
  return rows[0]
}

export async function getReferralSetting(slug) {
  const { rows } = await pool.query('SELECT referral_enabled FROM businesses WHERE slug = $1', [slug])
  return rows[0]
}

export async function assignReferralCode(customerId, code) {
  const { rows } = await pool.query(
    'UPDATE customers SET referral_code = COALESCE(referral_code, $2) WHERE id = $1 RETURNING referral_code',
    [customerId, code],
  )
  return rows[0]?.referral_code
}

export async function updateBusiness(businessId, input) {
  const { name, description, address, openingHours, whatsapp, logoDataUrl, bannerDataUrl, primaryColor, secondaryColor, logoScale, fontFamily, deliveryEnabled, addonsEnabled } = input
  const phone = whatsapp.replace(/[\s()-]/g, '')
  if (/^\+?[0-9]{8,15}$/.test(phone)) {
    const taken = await pool.query(
      "SELECT 1 FROM customers WHERE phone = $1 AND NOT (business_id = $2 AND role = 'local_owner')",
      [phone, businessId],
    )
    if (taken.rows.length) {
      const error = new Error('Ese celular ya pertenece a otra cuenta.')
      error.status = 409
      throw error
    }
    await pool.query("UPDATE customers SET phone = $1 WHERE business_id = $2 AND role = 'local_owner'", [phone, businessId])
    await pool.query('UPDATE local_applications SET phone = $1 WHERE business_id = $2', [phone, businessId])
  }
  const { rows } = await pool.query(
    `UPDATE businesses SET name = $1, description = $2, address = $3,
       opening_hours = $4, whatsapp = $5, logo_data_url = $6,
       banner_data_url = $7, primary_color = $8, secondary_color = $9,
       logo_scale = $10, font_family = $11, delivery_enabled = $12, addons_enabled = $13
     WHERE id = $14
     RETURNING id, name, slug, plan, description, logo_data_url AS "logoDataUrl",
               logo_scale AS "logoScale", font_family AS "fontFamily",
               banner_data_url AS "bannerDataUrl", primary_color AS "primaryColor",
               secondary_color AS "secondaryColor", address, opening_hours AS "openingHours", whatsapp,
               delivery_enabled AS "deliveryEnabled", addons_enabled AS "addonsEnabled"`,
    [name, description, address, openingHours, whatsapp, logoDataUrl, bannerDataUrl, primaryColor, secondaryColor, logoScale, fontFamily, deliveryEnabled, addonsEnabled, businessId],
  )
  return rows[0]
}

export async function updateOption(businessId, field, column, value) {
  const { rows } = await pool.query(
    `UPDATE businesses SET ${column} = $1 WHERE id = $2 RETURNING ${column} AS "${field}"`,
    [value, businessId],
  )
  return rows[0]
}
