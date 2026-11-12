import { pool } from '../../database/pool.js'

export async function fetchStatistics(businessId) {
  const timeZone = 'America/Argentina/Buenos_Aires'
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
      [businessId],
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
      [businessId],
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
      [businessId],
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
      [businessId],
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
      [businessId],
    ),
  ])
  return { summaryResult, dailyResult, monthlyResult, categoryResult, productResult }
}
