import jwt from 'jsonwebtoken'

export function publicCustomer(customer, points = 0) {
  return {
    id: customer.id,
    firstName: customer.first_name || '',
    lastName: customer.last_name || '',
    role: customer.role || 'customer',
    businessName: customer.business_name || '',
    businessId: customer.business_id || null,
    phone: customer.phone,
    points,
  }
}

export function createToken(customer, phoneOnly = false) {
  return jwt.sign({ sub: String(customer.id), ...(phoneOnly ? { phoneOnly: true } : {}) }, process.env.JWT_SECRET, { expiresIn: '7d' })
}

export function normalizePhone(value) {
  return typeof value === 'string' ? value.replace(/[\s()-]/g, '') : ''
}

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}
