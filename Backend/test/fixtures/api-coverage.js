import assert from 'node:assert/strict'

const endpointGroups = [
  ['/health', 'GET'],
  ['/auth/phone', 'POST'],
  ['/auth/register', 'POST'],
  ['/auth/login', 'POST'],
  ['/auth/me', 'GET'],
  ['/local-applications', 'POST'],
  ['/admin/local-applications', 'GET'],
  ['/admin/local-applications/:id', 'PATCH'],
  ['/admin/businesses/:id/subscription', 'POST'],
  ['/admin/businesses/:id', 'DELETE'],
  ['/public/businesses/:slug', 'GET'],
  ['/public/businesses/:slug/videos/:videoId', 'GET'],
  ['/public/businesses/:slug/redeem', 'POST'],
  ['/public/businesses/:slug/referral-code', 'GET'],
  ['/public/businesses/:slug/push/status', 'POST'],
  ['/public/businesses/:slug/push/subscribe', 'POST'],
  ['/public/businesses/:slug/push/unsubscribe', 'POST'],
  ['/partner/overview', 'GET'],
  ['/partner/bonus-days', 'PATCH'],
  ['/partner/referrals', 'PATCH'],
  ['/partner/business', 'PATCH'],
  ['/partner/business/options', 'PATCH'],
  ['/partner/business/videos', 'POST'],
  ['/partner/business/videos/:videoId', 'DELETE'],
  ['/partner/billing', 'GET'],
  ['/partner/billing/plan', 'PUT', 'DELETE'],
  ['/partner/billing/checkout', 'POST'],
  ['/partner/billing/confirm', 'POST'],
  ['/billing/webhook', 'POST'],
  ['/partner/categories', 'GET', 'POST', 'PATCH', 'DELETE'],
  ['/partner/categories/order', 'PUT'],
  ['/partner/products', 'GET', 'POST'],
  ['/partner/products/:id', 'PATCH', 'DELETE'],
  ['/partner/products/:id/availability', 'PATCH'],
  ['/partner/category-addons', 'GET', 'POST'],
  ['/partner/category-addons/:id', 'PATCH', 'DELETE'],
  ['/partner/category-addon-groups', 'PATCH', 'DELETE'],
  ['/partner/rewards', 'GET', 'POST'],
  ['/partner/rewards/:id', 'PATCH', 'DELETE'],
  ['/partner/redemptions', 'GET'],
  ['/partner/redemptions/:id', 'PATCH'],
  ['/partner/customers', 'GET'],
  ['/partner/stats', 'GET'],
  ['/partner/import-catalog', 'POST'],
  ['/partner/orders', 'GET'],
  ['/partner/orders/new-shift', 'POST'],
  ['/partner/orders/:id', 'PATCH'],
  ['/orders', 'POST'],
  ['/orders/:id/status', 'GET'],
]

export function assertApiCoverage(responses) {
  const missing = []
  for (const [path, ...methods] of endpointGroups) {
    const pattern = new RegExp(`^${path.replace(/:[^/]+/g, '[^/]+')}$`)
    for (const method of methods) {
      if (!responses.some((response) => response.method === method && pattern.test(response.path) && response.status >= 200 && response.status < 300)) {
        missing.push(`${method} ${path}`)
      }
    }
  }
  assert.deepEqual(missing, [], `Endpoints sin respuesta exitosa: ${missing.join(', ')}`)
}
