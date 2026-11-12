import { isValidImageDataUrl } from '../../shared/image.js'

const businessFontFamilies = new Set(['original', 'sans', 'serif', 'rounded', 'mono'])
const isValidHexColor = (value) => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)

export function readBusinessInput(body) {
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  const address = typeof body?.address === 'string' ? body.address.trim() : ''
  const openingHours = typeof body?.openingHours === 'string' ? body.openingHours.trim() : ''
  const whatsapp = typeof body?.whatsapp === 'string' ? body.whatsapp.trim() : ''
  const logoDataUrl = body?.logoDataUrl ?? ''
  const logoScale = Number(body?.logoScale ?? 1)
  const bannerDataUrl = body?.bannerDataUrl ?? ''
  const primaryColor = body?.primaryColor
  const secondaryColor = body?.secondaryColor
  const fontFamily = body?.fontFamily
  const deliveryEnabled = body?.deliveryEnabled !== false
  const addonsEnabled = body?.addonsEnabled !== false
  if (!name || name.length > 100 || description.length > 1000 || address.length > 200
    || openingHours.length > 1000 || whatsapp.length > 20 || !isValidImageDataUrl(logoDataUrl)
    || !isValidImageDataUrl(bannerDataUrl) || !bannerDataUrl
    || !isValidHexColor(primaryColor) || !isValidHexColor(secondaryColor)
    || !Number.isFinite(logoScale) || logoScale < 1 || logoScale > 3
    || !businessFontFamilies.has(fontFamily)) return null
  return { name, description, address, openingHours, whatsapp, logoDataUrl, logoScale, bannerDataUrl, primaryColor, secondaryColor, fontFamily, deliveryEnabled, addonsEnabled }
}

export function readBusinessOption(body) {
  const fields = { deliveryEnabled: 'delivery_enabled', addonsEnabled: 'addons_enabled' }
  const entries = Object.entries(fields).filter(([field]) => typeof body?.[field] === 'boolean')
  if (entries.length !== 1) return null
  const [field, column] = entries[0]
  return { field, column, value: body[field] }
}
