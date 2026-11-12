import 'dotenv/config'

if (!process.env.DATABASE_URL) throw new Error('Falta configurar DATABASE_URL en Backend/.env')
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET debe tener al menos 32 caracteres')
}

export const publicOrigin = process.env.FRONTEND_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:5173'
export const port = Number(process.env.PORT || 3000)
