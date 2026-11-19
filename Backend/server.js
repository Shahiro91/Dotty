import cors from 'cors'
import express from 'express'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './src/database/pool.js'
import { initializeDatabase } from './src/database/initialize.js'
import { port, publicOrigin } from './src/config/env.js'
import { customerRoutes } from './src/modules/customers/customers.routes.js'
import { analyticsRoutes } from './src/modules/analytics/analytics.routes.js'
import { categoryRoutes } from './src/modules/catalog/categories.routes.js'
import { productRoutes } from './src/modules/catalog/products.routes.js'
import { catalogImportRoutes } from './src/modules/catalog/import.routes.js'
import { addonRoutes } from './src/modules/catalog/addons.routes.js'
import { authenticate } from './src/middleware/authenticate.js'
import { requirePartner } from './src/middleware/authorize.js'
import { billingRoutes } from './src/modules/billing/billing.routes.js'
import { videoRoutes } from './src/modules/businesses/videos.routes.js'
import { rewardRoutes } from './src/modules/loyalty/rewards.routes.js'
import { publicRedemptionRoutes, redemptionRoutes } from './src/modules/loyalty/redemptions.routes.js'
import { partnerOrderRoutes } from './src/modules/orders/partner-orders.routes.js'
import { customerOrderRoutes } from './src/modules/orders/customer-orders.routes.js'
import { authRoutes } from './src/modules/auth/auth.routes.js'
import { applicationRoutes } from './src/modules/businesses/applications.routes.js'
import { storefrontRoutes } from './src/modules/businesses/storefront.routes.js'
import { partnerBusinessRoutes } from './src/modules/businesses/partner-business.routes.js'
import { adminRoutes } from './src/modules/admin/admin.routes.js'
import { adminSupportRoutes, partnerSupportRoutes } from './src/modules/support/support.routes.js'
import { pushRoutes } from './src/modules/notifications/push.routes.js'

const app = express()


// En Render, RENDER_EXTERNAL_URL es la URL pública del servicio (frontend y API comparten dominio).
app.use(cors({ origin: publicOrigin }))
app.use(express.json({ limit: '5mb' }))

app.get('/api/health', async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ status: 'ok' })
})

app.use('/api', videoRoutes)

app.use('/api/public', storefrontRoutes)

app.use('/api/public', publicRedemptionRoutes(authenticate))

app.use('/api/public', pushRoutes)

app.use('/api/auth', authRoutes)

app.use('/api', applicationRoutes)

app.use('/api/admin', adminRoutes)

app.use('/api/admin', adminSupportRoutes)

app.use('/api', partnerSupportRoutes)

app.use('/api', partnerBusinessRoutes)

app.use('/api', billingRoutes)

app.use('/api/partner', categoryRoutes(authenticate, requirePartner))

app.use('/api/partner', addonRoutes)

app.use('/api/partner', productRoutes(authenticate, requirePartner))

app.use('/api/partner', rewardRoutes(authenticate, requirePartner))

app.use('/api/partner', redemptionRoutes(authenticate, requirePartner))

app.use('/api/partner', customerRoutes(authenticate, requirePartner))

app.use('/api/partner', analyticsRoutes(authenticate, requirePartner))

app.use('/api/partner', catalogImportRoutes)

app.use('/api/partner', partnerOrderRoutes(authenticate, requirePartner))

app.use('/api/orders', customerOrderRoutes)

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

initializeDatabase()
  .then(() => app.listen(port, () => console.log(`Dotty API escuchando en puerto ${port}`)))
  .catch((error) => {
    console.error('No se pudo iniciar la API:', error.message)
    process.exitCode = 1
  })
