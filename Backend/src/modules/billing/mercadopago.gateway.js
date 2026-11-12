import '../../config/env.js'

const MP_ENVIRONMENT = process.env.MP_ENVIRONMENT || 'sandbox'

export function mercadoPagoConfigurationMessage() {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!['sandbox', 'production'].includes(MP_ENVIRONMENT)) {
    return 'MP_ENVIRONMENT debe ser sandbox o production.'
  }
  if (!accessToken) {
    return 'Los pagos online estarán disponibles próximamente.'
  }
  if (MP_ENVIRONMENT === 'sandbox' && !accessToken.startsWith('TEST-') && mercadoPagoAccountIsTest !== true) {
    return mercadoPagoAccountIsTest === null
      ? 'Verificando el Access Token de Mercado Pago, probá de nuevo en unos segundos.'
      : 'El backend está en modo sandbox y requiere credenciales de una cuenta de prueba de Mercado Pago.'
  }
  if (MP_ENVIRONMENT === 'production' && !accessToken.startsWith('APP_USR-')) {
    return 'El backend está en modo producción y requiere un Access Token de producción (APP_USR-...).'
  }
  return ''
}

// Las credenciales de prueba actuales también empiezan con APP_USR-, así que se confirma el tipo de cuenta con Mercado Pago.
let mercadoPagoAccountIsTest = null
if (MP_ENVIRONMENT === 'sandbox' && process.env.MP_ACCESS_TOKEN) {
  fetch('https://api.mercadopago.com/users/me', { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } })
    .then((response) => response.json())
    .then((account) => { mercadoPagoAccountIsTest = Array.isArray(account.tags) && account.tags.includes('test_user') })
    .catch(() => { mercadoPagoAccountIsTest = false })
}

export async function mercadoPagoRequest(path, options = {}) {
  const configurationMessage = mercadoPagoConfigurationMessage()
  if (configurationMessage) {
    const error = new Error(configurationMessage)
    error.status = 503
    throw error
  }
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json', ...options.headers },
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.message || 'Mercado Pago rechazó la solicitud.')
    error.status = response.status
    throw error
  }
  return data
}

