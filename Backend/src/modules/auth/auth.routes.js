import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { authenticate } from '../../middleware/authenticate.js'
import { rateLimit } from '../../middleware/rate-limit.js'
import { getBusinessPoints } from '../loyalty/points.repository.js'
import { findByCredentials, findCustomer, findOrCreatePhoneCustomer, registerCustomer } from './auth.repository.js'
import { activatePartnerAccount } from './auth.service.js'
import { createToken, normalizeEmail, normalizePhone, publicCustomer } from './auth.shared.js'

const router = Router()

router.post('/phone', rateLimit('phone-login', 20, 15 * 60_000), async (req, res, next) => {
  const phone = normalizePhone(req.body?.phone)
  if (!/^\+?[0-9]{8,15}$/.test(phone)) {
    return res.status(400).json({ error: 'Ingresá un celular válido con código de país.' })
  }
  try {
    const customer = await findOrCreatePhoneCustomer(phone)
    if (!customer) return res.status(403).json({ error: 'Este número pertenece a una cuenta de local o administrador. Ingresá desde el panel del local.' })
    const user = publicCustomer(customer, await getBusinessPoints(customer.id, req.body?.businessSlug))
    res.json({ token: createToken(user, true), user })
  } catch (error) {
    next(error)
  }
})

router.post('/register', rateLimit('register', 10, 15 * 60_000), async (req, res, next) => {
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
    const customer = publicCustomer(await registerCustomer(firstName, lastName, phone, passwordHash))
    res.status(201).json({ token: createToken(customer), user: customer })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'Ese celular ya tiene una cuenta.' })
    next(error)
  }
})

router.post('/login', rateLimit('login', 20, 15 * 60_000), async (req, res, next) => {
  const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier : ''
  const email = normalizeEmail(req.body?.email || (identifier.includes('@') ? identifier : ''))
  const phone = normalizePhone(req.body?.phone || (!email ? identifier : ''))
  const password = req.body?.password
  try {
    let customer = await findByCredentials(email, phone)
    if (!customer || typeof customer.password_hash !== 'string' || typeof password !== 'string' || !(await bcrypt.compare(password, customer.password_hash))) {
      return res.status(401).json({ error: 'Email, celular o contraseña incorrectos.' })
    }
    if (req.body?.portal === 'partner' && customer.role === 'customer') {
      const result = await activatePartnerAccount(customer.id)
      if (result.error === 'no_application') return res.status(403).json({ error: 'Esta cuenta no tiene una solicitud de local disponible.' })
      if (result.error === 'invalid_role') return res.status(403).json({ error: 'Esta cuenta no puede acceder al panel del local.' })
      customer = result.customer
    } else if (req.body?.portal === 'partner' && !['local_owner', 'admin'].includes(customer.role)) {
      return res.status(403).json({ error: 'Este acceso es solo para cuentas de locales ya creados.' })
    }
    const safeCustomer = publicCustomer(customer, await getBusinessPoints(customer.id, req.body?.businessSlug))
    res.json({ token: createToken(safeCustomer), user: safeCustomer })
  } catch (error) {
    next(error)
  }
})

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const customer = await findCustomer(req.customerId)
    if (!customer) return res.status(401).json({ error: 'La cuenta ya no está disponible.' })
    if (req.phoneOnly && customer.role !== 'customer') return res.status(401).json({ error: 'Ingresá con tu contraseña para acceder a tu cuenta de local.' })
    res.json(publicCustomer(customer, await getBusinessPoints(req.customerId, req.query.businessSlug)))
  } catch (error) {
    next(error)
  }
})

export { router as authRoutes }
