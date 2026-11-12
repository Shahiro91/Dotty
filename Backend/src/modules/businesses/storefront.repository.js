import { pool } from '../../database/pool.js'

export async function findStorefront(slug) {
  const { rows } = await pool.query(
    `SELECT id, name, slug, plan, description, logo_data_url AS "logoDataUrl",
            logo_scale AS "logoScale", font_family AS "fontFamily",
            bonus_points_days AS "bonusPointsDays",
            referral_enabled AS "referralEnabled", referral_points AS "referralPoints",
            delivery_enabled AS "deliveryEnabled", addons_enabled AS "addonsEnabled",
            banner_data_url AS "bannerDataUrl", primary_color AS "primaryColor",
            secondary_color AS "secondaryColor", address, opening_hours AS "openingHours", whatsapp,
            subscription_due_at AS "subscriptionDueAt"
     FROM businesses WHERE slug = $1`,
    [slug],
  )
  return rows[0]
}

export async function loadStorefrontCatalog(businessId) {
  const [products, rewards, addons, bestSellers, promoVideos, categories] = await Promise.all([
    pool.query(
      `SELECT id, name, description, category, price,
              points_per_unit AS "pointsPerUnit", image_data_url AS "imageDataUrl",
              image_scale AS "imageScale", image_position_x AS "imagePositionX",
              image_position_y AS "imagePositionY"
       FROM business_products WHERE business_id = $1 AND is_available = TRUE ORDER BY category, name`,
      [businessId],
    ),
    pool.query(
      `SELECT r.id, r.name, r.description, r.image_data_url AS "imageDataUrl",
              r.reward_type AS "rewardType", r.product_id AS "productId",
              r.discount_type AS "discountType", r.discount_value AS "discountValue",
              r.discount_scope AS "discountScope", dc.name AS "discountCategory",
              r.points_cost AS "pointsCost", p.name AS "productName", p.category AS "productCategory", p.price AS "productPrice",
              p.image_data_url AS "productImageDataUrl"
       FROM business_rewards r LEFT JOIN business_products p ON p.id = r.product_id AND p.business_id = r.business_id AND p.is_available = TRUE
       LEFT JOIN business_categories dc ON dc.id = r.discount_category_id
       WHERE r.business_id = $1 AND r.is_available = TRUE AND (r.product_id IS NULL OR p.id IS NOT NULL)
         AND (r.reward_type <> 'discount' OR r.discount_scope <> 'category' OR dc.id IS NOT NULL)
       ORDER BY r.points_cost`,
      [businessId],
    ),
    pool.query(
      `SELECT c.name AS category, a.id, a.name, a.price, a.group_name AS "groupName",
              a.selection_mode AS "selectionMode", a.product_id AS "productId", a.required_two AS "requiredTwo", a.is_required AS "isRequired"
       FROM business_category_addons a JOIN business_categories c ON c.id = a.category_id
       WHERE a.business_id = $1 AND a.is_available = TRUE ORDER BY c.name, a.name`,
      [businessId],
    ),
    pool.query(
      `SELECT bp.id
       FROM customer_orders o CROSS JOIN LATERAL jsonb_array_elements(o.items) AS line(value)
       JOIN business_products bp ON bp.id = NULLIF(line.value->>'id', '')::bigint AND bp.business_id = o.business_id
       WHERE o.business_id = $1 AND o.status <> 'cancelled' AND bp.is_available = TRUE
         AND COALESCE(line.value->>'isReward', 'false') <> 'true'
       GROUP BY bp.id ORDER BY SUM((line.value->>'quantity')::int) DESC, bp.name LIMIT 6`,
      [businessId],
    ),
    pool.query('SELECT id, original_name AS name, size_bytes AS "sizeBytes" FROM business_videos WHERE business_id = $1 ORDER BY created_at, id', [businessId]),
    pool.query('SELECT name, fractional_parts AS "fractionalParts" FROM business_categories WHERE business_id = $1 ORDER BY name', [businessId]),
  ])
  return { products: products.rows, rewards: rewards.rows, addons: addons.rows, categories: categories.rows, promoVideos: promoVideos.rows, bestSellerIds: bestSellers.rows.map((row) => row.id) }
}
