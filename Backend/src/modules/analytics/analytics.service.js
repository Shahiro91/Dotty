import { fetchStatistics } from './analytics.repository.js'

export async function getStatistics(businessId) {
  const { summaryResult, dailyResult, monthlyResult, categoryResult, productResult } = await fetchStatistics(businessId)
  const summary = summaryResult.rows[0]
  return {
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
  }
}
