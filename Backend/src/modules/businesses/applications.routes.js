import { Router } from 'express'
import { rateLimit } from '../../middleware/rate-limit.js'
import { createToken, normalizeEmail, normalizePhone, publicCustomer } from '../auth/auth.shared.js'
import { registerLocalApplication } from './applications.service.js'

const router = Router()
router.post('/local-applications', rateLimit('application', 10, 60 * 60_000), async (req, res, next) => {
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
  try {
    const result = await registerLocalApplication({ firstName, lastName, phone, email, password, businessName, requestedPlan })
    if (result.error === 'customer_exists') return res.status(409).json({ error: 'Ese celular o email ya tiene una cuenta. Usá otros datos o ingresá con tu cuenta de local existente.' })
    if (result.error === 'application_exists') return res.status(409).json({ error: 'Ese celular o email ya tiene una solicitud. Ingresá con las credenciales de esa cuenta.' })
    const user = publicCustomer(result.user)
    res.status(201).json({ applicationId: result.applicationId, status: 'approved', token: createToken(user), user })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese celular ya tiene una cuenta o una solicitud.' })
    next(error)
  }
})

export { router as applicationRoutes }
