import jwt from 'jsonwebtoken'

export function authenticate(req, res, next) {
  const authorization = req.get('authorization') || ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    req.customerId = payload.sub
    req.phoneOnly = payload.phoneOnly === true
    next()
  } catch {
    res.status(401).json({ error: 'Tu sesión venció. Ingresá nuevamente.' })
  }
}
